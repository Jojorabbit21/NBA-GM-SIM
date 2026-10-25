/**
 * index.ts — Bun WebSocket 서버 엔트리.
 *
 * HTTP 라우트:
 *   GET  /          → 헬스체크
 *   POST /start-draft  → 어드민이 드래프트 수동 시작
 *   POST /refresh-draft-pool → 어드민이 대기 중 드래프트 룸의 풀/선수 데이터 최신화
 *   POST /run-lottery  → 어드민이 로터리 추첨 실행 (직후 방 준비까지 이어서 처리)
 *   GET  /ws        → WebSocket 업그레이드 (드래프트 방 입장)
 *
 * WS 흐름:
 *   open  → 대기 (미인증)
 *   auth  → JWT 검증 + room 로드 + snapshot 전송
 *   submitPick / admin / ping 처리
 */
import type { ServerWebSocket } from 'bun';
import { verifyToken, isGlobalAdmin } from './auth';
import { RoomManager } from './RoomManager';
import { startScheduler } from './scheduler';
import { handleStartDraft, handleRunLottery, handleRefreshDraftPool } from './startDraft';
import { simWorkerPool } from './workers/simWorkerPool';
import { forceInitSchedule } from './finalize';
import { supabase } from './supabaseAdmin';
import { decode, encode } from './protocol';
import type { WsData } from './DraftRoom';
import { buildWindowedViewSince, buildLiveSummary, type GamePbpSource } from './liveGameView';
import { getRoomReplayMs } from './replayConfig';
import { verifyTokenCached, canReadRoomCached, createSharedLoader, LIVE_QUERY_TIMEOUT_MS } from './liveCache';
import { preloadGameConfig } from './shared/services/admin/gameConfigService';

const PORT = parseInt(Bun.env.PORT ?? '3001', 10);

// 전역 어드민 판별 — profiles.is_admin 단일 출처(isGlobalAdmin(), migrations/
// dynamic_global_admin_refactor.sql). 리그별 admin_user_id(leagues.admin_user_id)와는
// 별개로, /admin/users* 는 전역 어드민만 호출할 수 있어야 한다(전체 유저를 다루는
// 기능이라 특정 리그 소유권 체크로는 대체 불가).

// ── WebSocket 핸들러 ──────────────────────────────────────────────────────────

const wsHandlers = {
    async open(ws: ServerWebSocket<WsData>): Promise<void> {
        // 인증 전: userId/roomId 없는 상태
        (ws.data as any) = { userId: '', roomId: '' };
        console.log('[ws] client connected (unauthenticated)');
    },

    async message(ws: ServerWebSocket<WsData>, raw: string | Buffer): Promise<void> {
        try {
            await handleMessage(ws, raw);
        } catch (err) {
            // 방 1개의 처리 중 예외가 프로세스 전체를 죽여서는 안 된다 — 다른 모든 방의
            // 연결까지 같이 끊기고 서버가 재부팅되는 사고가 실제로 있었다(2026-07-24,
            // 준비되지 않은 draft_config로 scheduleNext()가 크래시한 사례).
            console.error('[ws] message handler error:', err);
            try {
                ws.send(encode({ type: 'error', code: 'internal', message: 'internal error' }));
            } catch { /* 소켓이 이미 닫혔으면 무시 */ }
        }
    },

    close(ws: ServerWebSocket<WsData>): void {
        const { userId, roomId } = ws.data ?? {};
        if (roomId) {
            const room = RoomManager.get(roomId);
            room?.removeSocket(ws);
        }
        console.log(`[ws] disconnected uid=${userId ?? '?'} room=${roomId ?? '?'}`);
    },
};

async function handleMessage(ws: ServerWebSocket<WsData>, raw: string | Buffer): Promise<void> {
        const msg = decode(raw);
        if (!msg) {
            ws.send(encode({ type: 'error', code: 'internal', message: 'invalid json' }));
            return;
        }

        // ── Ping ────────────────────────────────────────────────────────────
        if (msg.type === 'ping') {
            ws.send(encode({ type: 'pong' }));
            return;
        }

        // ── Auth ─────────────────────────────────────────────────────────────
        if (msg.type === 'auth') {
            const userId = await verifyToken(msg.token);
            if (!userId) {
                ws.send(encode({ type: 'error', code: 'unauthorized' }));
                ws.close(1008, 'unauthorized');
                return;
            }

            // 방 로드
            const room = await RoomManager.getOrLoad(msg.roomId);
            if (!room) {
                ws.send(encode({ type: 'error', code: 'internal', message: 'room not found' }));
                ws.close(1011, 'room not found');
                return;
            }

            // WsData 설정
            ws.data = { userId, roomId: msg.roomId };
            room.addSocket(ws);

            // 재접속 시 자동 트리거(타임아웃/미입장)로 들어간 오토픽만 자동 해제
            // (본인/어드민이 명시적으로 켠 경우는 유지 — DraftRoom.revertAutoPickOnReconnect 참조)
            await room.revertAutoPickOnReconnect(userId);

            // active 상태인데 타이머가 없으면 재시작 (서버 재시작/race 복구)
            if (room.getCursor().status === 'active' && !room.hasTimer) {
                room.scheduleNext();
                console.log(`[ws] timer re-scheduled for room ${msg.roomId}`);
            }

            // 초기 스냅샷 전송 + [2026-10-23] 본인 드래프트 큐(스냅샷은 소켓 공용이라 유저별 데이터는 따로)
            ws.send(encode(room.buildSnapshot()));
            ws.send(encode({ type: 'queue', playerIds: room.getQueue(userId) }));
            console.log(`[ws] authenticated uid=${userId} room=${msg.roomId}`);
            return;
        }

        // ── 이하 인증 필수 ──────────────────────────────────────────────────
        if (!ws.data?.userId) {
            ws.send(encode({ type: 'error', code: 'unauthorized' }));
            return;
        }

        const room = RoomManager.get(ws.data.roomId);
        if (!room) {
            ws.send(encode({ type: 'error', code: 'internal', message: 'room not in memory' }));
            return;
        }

        // ── submitPick ──────────────────────────────────────────────────────
        if (msg.type === 'submitPick') {
            await room.handleSubmitPick(ws.data.userId, msg.playerId, ws);
            return;
        }

        // ── toggleAutoPick (본인 팀만, 어드민 권한 불필요) ────────────────────
        if (msg.type === 'toggleAutoPick') {
            const ok = await room.setAutoPick(ws.data.userId, msg.enabled);
            if (!ok) {
                ws.send(encode({ type: 'error', code: 'internal', message: 'not a draft participant' }));
            }
            return;
        }

        // ── setQueue (본인 큐 전체 교체, 어드민 권한 불필요) [2026-10-23] ──────
        if (msg.type === 'setQueue') {
            const result = await room.setQueue(ws.data.userId, msg.playerIds);
            if (result !== 'ok') {
                ws.send(encode({ type: 'error', code: 'queue_save_failed', message: result === 'not_participant' ? 'not a draft participant' : 'db write failed' }));
            }
            return;
        }

        // ── admin ────────────────────────────────────────────────────────────
        if (msg.type === 'admin') {
            const isAdmin = await room.isAdmin(ws.data.userId);
            if (!isAdmin) {
                ws.send(encode({ type: 'error', code: 'not_admin' }));
                return;
            }
            await room.handleAdmin(msg.action, msg.params, ws);
            return;
        }

        ws.send(encode({ type: 'error', code: 'internal', message: 'unknown message type' }));
}

// ── HTTP 라우터 ───────────────────────────────────────────────────────────────

const server = Bun.serve<WsData>({
    port: PORT,

    fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket 업그레이드
        if (url.pathname === '/ws') {
            const upgraded = server.upgrade(req, { data: { userId: '', roomId: '' } });
            if (upgraded) return;
            return new Response('WebSocket upgrade required', { status: 426 });
        }

        // 헬스체크
        if (url.pathname === '/' && req.method === 'GET') {
            return new Response(
                JSON.stringify({ ok: true, rooms: RoomManager.size(), ts: new Date().toISOString() }),
                { headers: { 'Content-Type': 'application/json' } }
            );
        }

        // 드래프트 시작 (어드민 JWT 필수)
        if (url.pathname === '/start-draft' && req.method === 'POST') {
            return handleStartDraft(req);
        }

        // 드래프트 로터리 추첨 (어드민 JWT 필수) — 추첨 직후 방 준비까지 이어서 처리
        if (url.pathname === '/run-lottery' && req.method === 'POST') {
            return handleRunLottery(req);
        }

        // 드래프트 룸 풀/선수 데이터 최신화 (어드민 JWT 필수, 시작 전 waiting 상태에서만)
        if (url.pathname === '/refresh-draft-pool' && req.method === 'POST') {
            return handleRefreshDraftPool(req);
        }

        // 경기 수동 시뮬 오버라이드 (어드민용, admin-sim-override EF 대체)
        if (url.pathname === '/sim-override' && req.method === 'POST') {
            return handleSimOverride(req);
        }

        // 브라켓/스케줄 강제 초기화 (schedule null 복구용)
        if (url.pathname === '/finalize-room' && req.method === 'POST') {
            return handleFinalizeRoom(req);
        }

        // 시간 배속 설정 변경 (어드민용)
        if (url.pathname === '/sim-speed' && req.method === 'PATCH') {
            return handleSimSpeed(req);
        }

        // 경기 상세 PBP — live 구간이면 서버가 elapsed까지만 잘라서 반환 (스포일러 방지)
        if (url.pathname === '/live-game' && req.method === 'GET') {
            return safeLive(() => handleLiveGame(req, url));
        }

        // 방 전체의 "지금 진행 중"인 경기 요약 (일정 리스트 라이브 스코어용)
        if (url.pathname === '/live-games' && req.method === 'GET') {
            return safeLive(() => handleLiveGames(req, url));
        }

        // 어드민 사용자 관리 — 전체 유저 목록/수정/삭제 (고정 어드민 계정 전용)
        if (url.pathname === '/admin/users' && req.method === 'GET') {
            return handleAdminListUsers(req);
        }
        if (url.pathname === '/admin/users/update' && req.method === 'POST') {
            return handleAdminUpdateUser(req);
        }
        if (url.pathname === '/admin/users/delete' && req.method === 'POST') {
            return handleAdminDeleteUser(req);
        }

        // 어드민 사용자 관리 — 멀티플레이 전적(league_user_history/tournament_team_records) 조회/수정/삭제/초기화
        if (url.pathname === '/admin/users/history' && req.method === 'GET') {
            return handleAdminGetUserHistory(req, url);
        }
        if (url.pathname === '/admin/users/history/update' && req.method === 'POST') {
            return handleAdminUpdateUserHistory(req);
        }
        if (url.pathname === '/admin/users/history/delete' && req.method === 'POST') {
            return handleAdminDeleteUserHistory(req);
        }
        if (url.pathname === '/admin/users/history/reset' && req.method === 'POST') {
            return handleAdminResetUserHistory(req);
        }

        // CORS preflight
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin':  '*',
                    'Access-Control-Allow-Headers': 'authorization, content-type',
                    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
                },
            });
        }

        return new Response('Not Found', { status: 404 });
    },

    websocket: wsHandlers,
});

// ── 경기 수동 오버라이드 ──────────────────────────────────────────────────────

async function handleSimOverride(req: Request): Promise<Response> {
    const cors = {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
    };
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json', ...cors },
        });

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const userId = token ? await verifyToken(token) : null;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    let body: { roomId?: string; gameId?: string };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'invalid json' }, 400);
    }

    const { roomId, gameId } = body;
    if (!roomId || !gameId) return json({ error: 'roomId and gameId required' }, 400);

    // 어드민 검증 (admin-sim-override EF에 있던 체크를 이식)
    const { data: room } = await supabase.from('rooms').select('league_id').eq('id', roomId).single();
    if (!room) return json({ error: 'Room not found' }, 404);
    const { data: league } = await supabase.from('leagues').select('admin_user_id').eq('id', room.league_id).single();
    if (!league) return json({ error: 'League not found' }, 404);
    if (league.admin_user_id !== userId && !(await isGlobalAdmin(userId))) return json({ error: 'Forbidden' }, 403);

    // 관리자 수동 시뮬 오버라이드는 항상 "지금 바로 시작"으로 처리 (원래 예정 시각 무시)
    const result = await simWorkerPool.runSimulationInWorker(roomId, gameId, true);
    return json(result, result.ok ? 200 : 500);
}

/** [2026-10-19] 리그 관리 권한 — service_role 키, 해당 리그의 admin_user_id, 전역 어드민만 true.
 *  /finalize-room·/sim-speed 는 예전에 "유효한 로그인 토큰이면 누구나" 통과해서 아무 유저가 남의 리그를 조작할 수 있었다. */
async function canManageLeague(userId: string, target: { roomId?: string; leagueId?: string }): Promise<boolean> {
    if (userId === 'service_role') return true;
    let leagueId = target.leagueId;
    if (!leagueId && target.roomId) {
        const { data: room } = await supabase.from('rooms').select('league_id').eq('id', target.roomId).maybeSingle();
        leagueId = room?.league_id;
    }
    if (leagueId) {
        const { data: league } = await supabase.from('leagues').select('admin_user_id').eq('id', leagueId).maybeSingle();
        if (league?.admin_user_id === userId) return true;
    }
    return await isGlobalAdmin(userId);
}

// ── 브라켓/스케줄 강제 초기화 ────────────────────────────────────────────────

async function handleFinalizeRoom(req: Request): Promise<Response> {
    const cors = {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
    };
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json', ...cors },
        });

    // service_role 키 또는 일반 JWT 모두 허용
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const serviceKey = Bun.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const isServiceRole = serviceKey && token === serviceKey;
    const userId = isServiceRole ? 'service_role' : (token ? await verifyToken(token) : null);
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    let body: { roomId?: string };
    try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

    const { roomId } = body;
    if (!roomId) return json({ error: 'roomId required' }, 400);

    if (!(await canManageLeague(userId, { roomId }))) return json({ error: 'Forbidden' }, 403);

    const result = await forceInitSchedule(roomId);
    return json(result, result.ok ? 200 : 500);
}

// ── 시간 배속 설정 변경 ───────────────────────────────────────────────────────

async function handleSimSpeed(req: Request): Promise<Response> {
    const cors = {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
    };
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json', ...cors },
        });

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const serviceKey = Bun.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const isServiceRole = serviceKey && token === serviceKey;
    const userId = isServiceRole ? 'service_role' : (token ? await verifyToken(token) : null);
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    let body: { leagueId?: string; gamesPerDay?: number };
    try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

    const { leagueId, gamesPerDay } = body;
    if (!leagueId || typeof gamesPerDay !== 'number' || gamesPerDay <= 0) {
        return json({ error: 'leagueId and gamesPerDay (> 0) required' }, 400);
    }

    if (!(await canManageLeague(userId, { leagueId }))) return json({ error: 'Forbidden' }, 403);

    const { error } = await supabase
        .from('leagues')
        .update({ games_per_real_day: gamesPerDay })
        .eq('id', leagueId);

    if (error) return json({ error: error.message }, 500);

    console.log(`[sim-speed] league=${leagueId} gamesPerDay=${gamesPerDay}`);
    return json({ ok: true, leagueId, gamesPerDay });
}

// ── 경기 상세 라이브뷰 ───────────────────────────────────────────────────────

// 같은 방/경기를 보는 접속자들의 폴링을 한 번의 조회로 합치는 공유 로더(liveCache.ts). 값은 [키, TTL, 장애 시 낡은 값 허용 시간].
const loadLiveGameRows = createSharedLoader<any[]>(3_000, 60_000);
const loadLiveGameRow  = createSharedLoader<any | null>(2_000, 60_000);

/** [2026-10-20] 읽기 전용 라이브 엔드포인트의 예기치 않은 실패(DB 지연/중단 등)를 CORS 헤더가 붙은 503 JSON으로 돌려준다.
 *  전엔 핸들러가 throw하거나 10초(Bun idleTimeout)를 넘기면 연결이 끊겨 Fly 프록시 502 → 브라우저엔 CORS 에러로 보였다. */
async function safeLive(run: () => Promise<Response>): Promise<Response> {
    try {
        return await run();
    } catch (err) {
        console.warn('[live] request failed:', (err as Error)?.message ?? err);
        return new Response(JSON.stringify({ error: 'temporarily unavailable' }), {
            status: 503,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin':  '*',
                'Access-Control-Allow-Headers': 'authorization, content-type',
                'Retry-After': '5',
            },
        });
    }
}

/** DB 오류는 false로 삼키지 않고 throw — 지연 중인 DB 때문에 정상 유저가 403을 받지 않게 한다(safeLive가 503으로 변환). */
async function verifyRoomMember(userId: string, roomId: string): Promise<boolean> {
    const { count, error } = await supabase
        .from('room_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .abortSignal(AbortSignal.timeout(LIVE_QUERY_TIMEOUT_MS));
    if (error) throw new Error(`room_members: ${error.message}`);
    return (count ?? 0) > 0;
}

/** [2026-10-19] 경기 상세/라이브 목록 읽기 권한 — 방 멤버 또는 관전 허용 리그(leagues.spectate_enabled && 진행/종료).
 *  DB의 spectatable_room_ids()와 같은 기준(클라 utils/spectatorAccess.ts의 SPECTATABLE_STATUSES와도 동일, Docker가
 *  server/src만 복사해 import 불가라 인라인). 읽기 전용 엔드포인트에서만 사용할 것. */
async function verifyRoomReadAccess(userId: string, roomId: string): Promise<boolean> {
    if (await verifyRoomMember(userId, roomId)) return true;
    const { data, error } = await supabase
        .from('rooms')
        .select('leagues!inner(spectate_enabled,status)')
        .eq('id', roomId)
        .abortSignal(AbortSignal.timeout(LIVE_QUERY_TIMEOUT_MS))
        .maybeSingle();
    if (error) throw new Error(`rooms/leagues: ${error.message}`);
    const lg = (data as { leagues?: { spectate_enabled: boolean; status: string } | { spectate_enabled: boolean; status: string }[] } | null)?.leagues;
    const league = Array.isArray(lg) ? lg[0] : lg;
    return !!league && league.spectate_enabled === true && (league.status === 'in_progress' || league.status === 'finished');
}

async function handleLiveGame(req: Request, url: URL): Promise<Response> {
    const cors = {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
    };
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const userId = token ? await verifyTokenCached(token) : null;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const roomId = url.searchParams.get('roomId');
    const gameId = url.searchParams.get('gameId');
    if (!roomId || !gameId) return json({ error: 'roomId and gameId required' }, 400);

    if (!(await canReadRoomCached(userId, roomId, () => verifyRoomReadAccess(userId, roomId)))) return json({ error: 'Forbidden' }, 403);

    // [2026-10-20] 같은 경기를 보는 여러 접속자의 폴링을 2초 단위로 한 번의 조회로 합친다(DB 장애 시 60초까지 직전 값으로 버팀).
    // row의 공개 구간은 아래 buildWindowedViewSince가 요청 시각 기준으로 자르므로 행 자체는 캐시해도 스포일러 위험이 없다.
    const row = await loadLiveGameRow(`${roomId}:${gameId}`, async () => {
        const { data, error } = await supabase
            .from('game_pbp')
            .select('game_id,home_team_id,away_team_id,home_score,away_score,game_start_time,events,shot_events,home_box,away_box,box_timeline,rotation_data')
            .eq('room_id', roomId)
            .eq('game_id', gameId)
            .abortSignal(AbortSignal.timeout(LIVE_QUERY_TIMEOUT_MS))
            .maybeSingle();
        if (error) throw new Error(`game_pbp: ${error.message}`);
        return data;
    });

    if (!row) return json({ ok: false, error: 'not found' }, 404);

    // sinceEvents/sinceShots/sinceBox — 클라이언트가 지난 폴링에서 이미 받은 개수(eventCount 등)를
    // 그대로 돌려보내면, 매번 지금까지 공개된 전체를 재전송하는 대신 그 이후 새로 공개된
    // 구간만 내려준다. 파라미터가 없으면(최초 조회) 기존과 동일하게 전체를 반환.
    const parseSince = (key: string) => {
        const raw = url.searchParams.get(key);
        return raw != null ? parseInt(raw, 10) : undefined;
    };
    // [2026-09-18 2단계] 리플레이 길이는 리그 설정 — 방 기준으로 조회(60초 캐시).
    const replayMs = await getRoomReplayMs(roomId);
    return json(buildWindowedViewSince(row as GamePbpSource, Date.now(), {
        events: parseSince('sinceEvents'),
        shots:  parseSince('sinceShots'),
        box:    parseSince('sinceBox'),
    }, replayMs));
}

async function handleLiveGames(req: Request, url: URL): Promise<Response> {
    const cors = {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
    };
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const userId = token ? await verifyTokenCached(token) : null;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const roomId = url.searchParams.get('roomId');
    if (!roomId) return json({ error: 'roomId required' }, 400);

    if (!(await canReadRoomCached(userId, roomId, () => verifyRoomReadAccess(userId, roomId)))) return json({ error: 'Forbidden' }, 403);

    const replayMs = await getRoomReplayMs(roomId);

    // [2026-10-20] 방당 3초에 한 번만 DB 조회 — 접속자·화면 수와 무관(전엔 접속자×화면×5초마다 큰 JSONB 5컬럼 조회).
    // 요약(buildLiveSummary)은 (행, 현재시각)만으로 계산되는 순수 함수라, 행을 캐시해도 응답 시각마다 새로 계산해 값이 낡지 않는다.
    // DB가 막히면 loader가 60초까지 직전 행으로 대신한다.
    const rows = await loadLiveGameRows(roomId, async () => {
        const nowIso    = new Date().toISOString();
        const cutoffIso = new Date(Date.now() - replayMs).toISOString();
        const { data, error } = await supabase
            .from('game_pbp')
            .select('game_id,home_team_id,away_team_id,home_score,away_score,game_start_time,events,shot_events,home_box,away_box,box_timeline')
            .eq('room_id', roomId)
            .lte('game_start_time', nowIso)
            .gt('game_start_time', cutoffIso)
            .abortSignal(AbortSignal.timeout(LIVE_QUERY_TIMEOUT_MS));
        if (error) throw new Error(`game_pbp: ${error.message}`);
        return data ?? [];
    });

    const summaries = rows.map(r => buildLiveSummary(r as GamePbpSource, Date.now(), replayMs));
    return json({ ok: true, games: summaries });
}

// ── 어드민 사용자 관리 ────────────────────────────────────────────────────────
// /admin 페이지 "사용자 관리" 탭 전용. profiles 테이블 RLS("Users can view/update own
// profile"만 허용)로는 전체 유저 목록 조회·타인 수정이 불가능해서, 서비스 롤 클라이언트를
// 쓰는 이 Fly 서버를 거친다. 세 엔드포인트 모두 호출자가 고정 어드민 계정인지부터 검증.

function adminCorsJson(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin':  '*',
            'Access-Control-Allow-Headers': 'authorization, content-type',
        },
    });
}

async function requireGlobalAdmin(req: Request): Promise<string | null> {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const userId = token ? await verifyToken(token) : null;
    return userId && (await isGlobalAdmin(userId)) ? userId : null;
}

async function handleAdminListUsers(req: Request): Promise<Response> {
    if (!(await requireGlobalAdmin(req))) return adminCorsJson({ error: 'Forbidden' }, 403);

    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, nickname, first_name, last_name, birth_year, nationality, avatar_url, created_at, updated_at, is_admin')
        .order('created_at', { ascending: false });

    if (error) return adminCorsJson({ error: error.message }, 500);
    return adminCorsJson({ ok: true, users: data ?? [] });
}

async function handleAdminUpdateUser(req: Request): Promise<Response> {
    if (!(await requireGlobalAdmin(req))) return adminCorsJson({ error: 'Forbidden' }, 403);

    let body: {
        userId?: string; nickname?: string | null; email?: string | null;
        first_name?: string | null; last_name?: string | null;
        birth_year?: number | null; nationality?: string | null; avatar_url?: string | null;
    };
    try { body = await req.json(); } catch { return adminCorsJson({ error: 'invalid json' }, 400); }

    const { userId, ...fields } = body;
    if (!userId) return adminCorsJson({ error: 'userId required' }, 400);

    const { data, error } = await supabase
        .from('profiles')
        .update({
            nickname:    fields.nickname    ?? null,
            email:       fields.email       ?? null,
            first_name:  fields.first_name  ?? null,
            last_name:   fields.last_name   ?? null,
            birth_year:  fields.birth_year  ?? null,
            nationality: fields.nationality ?? null,
            avatar_url:  fields.avatar_url  ?? null,
            updated_at:  new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .maybeSingle();

    if (error) return adminCorsJson({ error: error.message }, 500);
    if (!data) return adminCorsJson({ error: 'user not found' }, 404);
    return adminCorsJson({ ok: true, user: data });
}

async function handleAdminDeleteUser(req: Request): Promise<Response> {
    if (!(await requireGlobalAdmin(req))) return adminCorsJson({ error: 'Forbidden' }, 403);

    let body: { userId?: string };
    try { body = await req.json(); } catch { return adminCorsJson({ error: 'invalid json' }, 400); }

    const { userId } = body;
    if (!userId) return adminCorsJson({ error: 'userId required' }, 400);
    if (await isGlobalAdmin(userId)) return adminCorsJson({ error: '어드민 계정은 삭제할 수 없습니다' }, 400);

    // 삭제 전 이 유저가 붙잡고 있는 팀/참가 상태를 먼저 정리 — release_team이 room_members
    // 삭제까지 처리하므로(leagueService.releaseTeam과 동일 RPC), 계정만 지우고 팀은
    // 남겨두면 그 리그의 로스터가 "삭제된 유저 소유"인 채로 유령 상태가 된다.
    const { data: memberships } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', userId);

    for (const m of memberships ?? []) {
        await supabase.rpc('release_team', { p_room_id: m.room_id, p_user_id: userId });
    }

    await supabase.from('profiles').delete().eq('id', userId);

    const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
    if (authErr) return adminCorsJson({ error: authErr.message }, 500);

    return adminCorsJson({ ok: true });
}

// ── 어드민 사용자 관리 — 멀티플레이 전적 조회/수정/삭제/초기화 ───────────────────
// MultiplayerHistory.tsx(홈 화면)와 동일한 소스 테이블(league_user_history,
// tournament_team_records)을 다룬다. league_user_history는 RLS가 "그 리그 그룹의
// admin_user_id인 유저만 쓰기 가능"이라 대부분은 클라이언트에서 직접 써도 되지만,
// tournament_team_records는 UPDATE/DELETE RLS 정책이 아예 없어(서비스 롤 INSERT만 허용)
// 반드시 이 서버를 거쳐야 한다 — 두 테이블을 한 곳에서 다루려고 통째로 서버 경유로 통일.
async function handleAdminGetUserHistory(req: Request, url: URL): Promise<Response> {
    if (!(await requireGlobalAdmin(req))) return adminCorsJson({ error: 'Forbidden' }, 403);

    const userId = url.searchParams.get('userId');
    if (!userId) return adminCorsJson({ error: 'userId required' }, 400);

    const [leagueRes, tourRes] = await Promise.all([
        supabase
            .from('league_user_history')
            .select('group_id, user_id, season_number, tier, league_id, league_name, team_count, wins, losses, playoff_wins, playoff_losses, final_rank, playoff_result, completed_at')
            .eq('user_id', userId)
            .order('completed_at', { ascending: false }),
        supabase
            .from('tournament_team_records')
            .select('id, archive_id, placement, final_round, series_wins, series_losses, game_wins, game_losses, pts_for, pts_against, tournament_archives!inner(name, team_count, completed_at, league_type)')
            .eq('user_id', userId)
            .eq('tournament_archives.league_type', 'tournament')
            .order('id'),
    ]);

    if (leagueRes.error) return adminCorsJson({ error: leagueRes.error.message }, 500);
    if (tourRes.error) return adminCorsJson({ error: tourRes.error.message }, 500);

    return adminCorsJson({ ok: true, league: leagueRes.data ?? [], tournament: tourRes.data ?? [] });
}

async function handleAdminUpdateUserHistory(req: Request): Promise<Response> {
    if (!(await requireGlobalAdmin(req))) return adminCorsJson({ error: 'Forbidden' }, 403);

    let body: any;
    try { body = await req.json(); } catch { return adminCorsJson({ error: 'invalid json' }, 400); }

    if (body.kind === 'league') {
        const { groupId, userId, seasonNumber, ...fields } = body;
        if (!groupId || !userId || seasonNumber == null) {
            return adminCorsJson({ error: 'groupId, userId, seasonNumber required' }, 400);
        }
        const { data, error } = await supabase
            .from('league_user_history')
            .update({
                league_name:    fields.league_name,
                team_count:     fields.team_count,
                wins:           fields.wins,
                losses:         fields.losses,
                playoff_wins:   fields.playoff_wins,
                playoff_losses: fields.playoff_losses,
                final_rank:     fields.final_rank,
                playoff_result: fields.playoff_result,
            })
            .eq('group_id', groupId).eq('user_id', userId).eq('season_number', seasonNumber)
            .select()
            .maybeSingle();
        if (error) return adminCorsJson({ error: error.message }, 500);
        if (!data) return adminCorsJson({ error: 'record not found' }, 404);
        return adminCorsJson({ ok: true, record: data });
    }

    if (body.kind === 'tournament') {
        const { id, ...fields } = body;
        if (!id) return adminCorsJson({ error: 'id required' }, 400);
        const { data, error } = await supabase
            .from('tournament_team_records')
            .update({
                placement:      fields.placement,
                final_round:    fields.final_round,
                series_wins:    fields.series_wins,
                series_losses:  fields.series_losses,
                game_wins:      fields.game_wins,
                game_losses:    fields.game_losses,
                pts_for:        fields.pts_for,
                pts_against:    fields.pts_against,
            })
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error) return adminCorsJson({ error: error.message }, 500);
        if (!data) return adminCorsJson({ error: 'record not found' }, 404);
        return adminCorsJson({ ok: true, record: data });
    }

    return adminCorsJson({ error: 'kind must be "league" or "tournament"' }, 400);
}

async function handleAdminDeleteUserHistory(req: Request): Promise<Response> {
    if (!(await requireGlobalAdmin(req))) return adminCorsJson({ error: 'Forbidden' }, 403);

    let body: any;
    try { body = await req.json(); } catch { return adminCorsJson({ error: 'invalid json' }, 400); }

    if (body.kind === 'league') {
        const { groupId, userId, seasonNumber } = body;
        if (!groupId || !userId || seasonNumber == null) {
            return adminCorsJson({ error: 'groupId, userId, seasonNumber required' }, 400);
        }
        const { error } = await supabase
            .from('league_user_history')
            .delete()
            .eq('group_id', groupId).eq('user_id', userId).eq('season_number', seasonNumber);
        if (error) return adminCorsJson({ error: error.message }, 500);
        return adminCorsJson({ ok: true });
    }

    if (body.kind === 'tournament') {
        const { id } = body;
        if (!id) return adminCorsJson({ error: 'id required' }, 400);
        const { error } = await supabase.from('tournament_team_records').delete().eq('id', id);
        if (error) return adminCorsJson({ error: error.message }, 500);
        return adminCorsJson({ ok: true });
    }

    return adminCorsJson({ error: 'kind must be "league" or "tournament"' }, 400);
}

async function handleAdminResetUserHistory(req: Request): Promise<Response> {
    if (!(await requireGlobalAdmin(req))) return adminCorsJson({ error: 'Forbidden' }, 403);

    let body: { userId?: string };
    try { body = await req.json(); } catch { return adminCorsJson({ error: 'invalid json' }, 400); }

    const { userId } = body;
    if (!userId) return adminCorsJson({ error: 'userId required' }, 400);

    const [leagueDel, tourDel] = await Promise.all([
        supabase.from('league_user_history').delete().eq('user_id', userId),
        supabase.from('tournament_team_records').delete().eq('user_id', userId),
    ]);
    if (leagueDel.error) return adminCorsJson({ error: leagueDel.error.message }, 500);
    if (tourDel.error) return adminCorsJson({ error: tourDel.error.message }, 500);

    return adminCorsJson({ ok: true });
}

// ── 시작 ──────────────────────────────────────────────────────────────────────

// OVR 엔진의 아키타입 가중치/태그 DB 설정 프리로드 — 실패해도 서버는 정상 기동하고
// (getWeightConfigSync() 등이 null을 반환해 하드코딩 폴백을 탐), 이후 리그 생성
// 시점의 강제 refetch(refetchGameConfig)에서 다시 시도된다.
await preloadGameConfig().catch(err => {
    console.error('[index] preloadGameConfig failed, falling back to hardcoded weights:', err);
});

// 경기 시뮬레이션 워커 풀 — runFullGameSimulation()의 동기 연산이 메인 스레드 이벤트 루프를
// 막지 않도록 별도 OS 스레드에서 실행한다 (docs/plan/worker-thread-sim-plan.md)
await simWorkerPool.init();

startScheduler();

console.log(`[server] Draft WebSocket server running on port ${server.port}`);
