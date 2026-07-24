/**
 * index.ts — Bun WebSocket 서버 엔트리.
 *
 * HTTP 라우트:
 *   GET  /          → 헬스체크
 *   POST /start-draft → 어드민이 드래프트 수동 시작
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
import { handleStartDraft } from './startDraft';
import { runSimulation } from './simRunner';
import { forceInitSchedule } from './finalize';
import { supabase } from './supabaseAdmin';
import { decode, encode } from './protocol';
import type { WsData } from './DraftRoom';
import { buildWindowedView, buildLiveSummary, REPLAY_DURATION_MS, type GamePbpSource } from './liveGameView';
import { preloadGameConfig } from './shared/services/admin/gameConfigService';

const PORT = parseInt(Bun.env.PORT ?? '3001', 10);

// ── WebSocket 핸들러 ──────────────────────────────────────────────────────────

const wsHandlers = {
    async open(ws: ServerWebSocket<WsData>): Promise<void> {
        // 인증 전: userId/roomId 없는 상태
        (ws.data as any) = { userId: '', roomId: '' };
        console.log('[ws] client connected (unauthenticated)');
    },

    async message(ws: ServerWebSocket<WsData>, raw: string | Buffer): Promise<void> {
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
    const result = await runSimulation(roomId, gameId, true);
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
        .select('game_id,home_team_id,away_team_id,home_score,away_score,game_start_time,events,shot_events,home_box,away_box,box_timeline')
        .eq('room_id', roomId)
        .eq('game_id', gameId)
        .maybeSingle();

    if (!row) return json({ ok: false, error: 'not found' }, 404);

    return json(buildWindowedView(row as GamePbpSource, Date.now()));
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

    const nowIso   = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - REPLAY_DURATION_MS).toISOString();

    const { data: rows } = await supabase
        .from('game_pbp')
        .select('game_id,home_team_id,away_team_id,home_score,away_score,game_start_time,events,shot_events,home_box,away_box,box_timeline')
        .eq('room_id', roomId)
        .lte('game_start_time', nowIso)
        .gt('game_start_time', cutoffIso);

    const summaries = (rows ?? []).map(r => buildLiveSummary(r as GamePbpSource, Date.now()));
    return json({ ok: true, games: summaries });
}

// ── 시작 ──────────────────────────────────────────────────────────────────────

// OVR 엔진의 아키타입 가중치/태그 DB 설정 프리로드 — 실패해도 서버는 정상 기동하고
// (getWeightConfigSync() 등이 null을 반환해 하드코딩 폴백을 탐), 이후 리그 생성
// 시점의 강제 refetch(refetchGameConfig)에서 다시 시도된다.
await preloadGameConfig().catch(err => {
    console.error('[index] preloadGameConfig failed, falling back to hardcoded weights:', err);
});

startScheduler();

console.log(`[server] Draft WebSocket server running on port ${server.port}`);
