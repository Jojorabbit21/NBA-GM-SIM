/**
 * index.ts — Bun WebSocket 서버 엔트리.
 *
 * HTTP 라우트:
 *   GET  /          → 헬스체크
 *   POST /start-draft  → 어드민이 드래프트 수동 시작
 *   POST /run-lottery  → 어드민이 로터리 추첨 실행 (직후 방 준비까지 이어서 처리)
 *   GET  /ws        → WebSocket 업그레이드 (드래프트 방 입장)
 *
 * WS 흐름:
 *   open  → 대기 (미인증)
 *   auth  → JWT 검증 + room 로드 + snapshot 전송
 *   submitPick / admin / ping 처리
 */
import type { ServerWebSocket } from 'bun';
import { verifyToken } from './auth';
import { RoomManager } from './RoomManager';
import { startScheduler } from './scheduler';
import { handleStartDraft, handleRunLottery } from './startDraft';
import { simWorkerPool } from './workers/simWorkerPool';
import { forceInitSchedule } from './finalize';
import { supabase } from './supabaseAdmin';
import { decode, encode } from './protocol';
import type { WsData } from './DraftRoom';
import { buildWindowedViewSince, buildLiveSummary, type GamePbpSource } from './liveGameView';
import { getRoomReplayMs } from './replayConfig';
import { preloadGameConfig } from './shared/services/admin/gameConfigService';

const PORT = parseInt(Bun.env.PORT ?? '3001', 10);

// 전역 어드민 계정(admin@mail.com) — App.tsx/AdminGuard.tsx의 ADMIN_USER_ID와 동일한 값.
// 리그별 admin_user_id(leagues.admin_user_id)와는 별개로, /admin/users* 는 이 고정 계정만
// 호출할 수 있어야 한다(전체 유저를 다루는 기능이라 특정 리그 소유권 체크로는 대체 불가).
const ADMIN_USER_ID = 'd2f6a469-9182-4dac-a098-278e6e758c79';

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

            // 초기 스냅샷 전송
            ws.send(encode(room.buildSnapshot()));
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
            return handleLiveGame(req, url);
        }

        // 방 전체의 "지금 진행 중"인 경기 요약 (일정 리스트 라이브 스코어용)
        if (url.pathname === '/live-games' && req.method === 'GET') {
            return handleLiveGames(req, url);
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
    if (league.admin_user_id !== userId) return json({ error: 'Forbidden' }, 403);

    // 관리자 수동 시뮬 오버라이드는 항상 "지금 바로 시작"으로 처리 (원래 예정 시각 무시)
    const result = await simWorkerPool.runSimulationInWorker(roomId, gameId, true);
    return json(result, result.ok ? 200 : 500);
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

    const { error } = await supabase
        .from('leagues')
        .update({ games_per_real_day: gamesPerDay })
        .eq('id', leagueId);

    if (error) return json({ error: error.message }, 500);

    console.log(`[sim-speed] league=${leagueId} gamesPerDay=${gamesPerDay}`);
    return json({ ok: true, leagueId, gamesPerDay });
}

// ── 경기 상세 라이브뷰 ───────────────────────────────────────────────────────

async function verifyRoomMember(userId: string, roomId: string): Promise<boolean> {
    const { count } = await supabase
        .from('room_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .eq('user_id', userId);
    return (count ?? 0) > 0;
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
    const userId = token ? await verifyToken(token) : null;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const roomId = url.searchParams.get('roomId');
    const gameId = url.searchParams.get('gameId');
    if (!roomId || !gameId) return json({ error: 'roomId and gameId required' }, 400);

    if (!(await verifyRoomMember(userId, roomId))) return json({ error: 'Forbidden' }, 403);

    const { data: row } = await supabase
        .from('game_pbp')
        .select('game_id,home_team_id,away_team_id,home_score,away_score,game_start_time,events,shot_events,home_box,away_box,box_timeline,rotation_data')
        .eq('room_id', roomId)
        .eq('game_id', gameId)
        .maybeSingle();

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
    const userId = token ? await verifyToken(token) : null;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const roomId = url.searchParams.get('roomId');
    if (!roomId) return json({ error: 'roomId required' }, 400);

    if (!(await verifyRoomMember(userId, roomId))) return json({ error: 'Forbidden' }, 403);

    const replayMs  = await getRoomReplayMs(roomId);
    const nowIso    = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - replayMs).toISOString();

    const { data: rows } = await supabase
        .from('game_pbp')
        .select('game_id,home_team_id,away_team_id,home_score,away_score,game_start_time,events,shot_events,home_box,away_box,box_timeline')
        .eq('room_id', roomId)
        .lte('game_start_time', nowIso)
        .gt('game_start_time', cutoffIso);

    const summaries = (rows ?? []).map(r => buildLiveSummary(r as GamePbpSource, Date.now(), replayMs));
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
    return userId === ADMIN_USER_ID ? userId : null;
}

async function handleAdminListUsers(req: Request): Promise<Response> {
    if (!(await requireGlobalAdmin(req))) return adminCorsJson({ error: 'Forbidden' }, 403);

    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, nickname, first_name, last_name, birth_year, nationality, avatar_url, created_at, updated_at')
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
    if (userId === ADMIN_USER_ID) return adminCorsJson({ error: '어드민 계정은 삭제할 수 없습니다' }, 400);

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
