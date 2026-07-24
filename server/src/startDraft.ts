/**
 * startDraft.ts — 드래프트 준비/시작 핸들러.
 *
 * start-draft EF와 draft-scheduler 섹션2를 통합 이식.
 * - HTTP POST /start-draft : 어드민이 수동 시작 (JWT 인증 필수)
 * - HTTP POST /run-lottery : 어드민이 로터리 추첨 실행 (JWT 인증 필수) — 추첨 직후
 *   곧바로 prepareDraftRoom()을 이어붙여 스케줄러 폴링(최대 30초) 없이 즉시 방을 준비한다.
 * - startDraftForRoom(roomId) : 스케줄러가 자동 시작 시 사용
 *
 * [로터리 후 사전입장] AI 슬롯 채우기 + 풀 구성 + 픽 순서 계산(무거운 부분)은 로터리
 * 완료 직후 prepareDraftRoom()이 미리 실행해 draft_config를 만들어두고, 예정 시각에
 * activateDraftRoom()이 커서만 'active'로 뒤집는다 — 그래야 예정 시각 전에도 유저가
 * 룸에 접속해 풀/픽순서를 미리 볼 수 있다(DraftRoom.load()는 draft_config만 있으면
 * 성공하므로). draft_config가 아직 없는 레거시/예외 경로는 _runStartDraft()로 폴백한다.
 */
import { supabase } from './supabaseAdmin';
import { verifyToken } from './auth';
import { RoomManager } from './RoomManager';
import {
    generateSnakePickOrder,
    generateLinearPickOrder,
    seededShuffle,
} from './shared/multiDraftEngine';
import { mapRawPlayerToRuntimePlayer } from './shared/dataMapper';

const DEFAULT_TOTAL_ROUNDS      = 10;
const DEFAULT_PICK_DURATION_SEC = 30;
const POOL_QUERY_CHUNK          = 100;

// ── HTTP POST /start-draft 핸들러 ─────────────────────────────────────────────

export async function handleStartDraft(req: Request): Promise<Response> {
    // 인증
    const authHeader = req.headers.get('Authorization') ?? '';
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const userId = await verifyToken(token);
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => null) as { leagueId?: string } | null;
    if (!body?.leagueId) return json({ error: 'leagueId required' }, 400);

    // 어드민 검증
    const { data: league } = await supabase
        .from('leagues')
        .select('id, admin_user_id, status')
        .eq('id', body.leagueId)
        .single();

    if (!league)                            return json({ error: 'league not found' }, 404);
    if (league.admin_user_id !== userId)    return json({ error: 'Forbidden' }, 403);
    if (league.status !== 'recruiting')     return json({ error: 'league not in recruiting status' }, 400);

    const { data: room } = await supabase
        .from('rooms')
        .select('id, draft_cursor')
        .eq('league_id', body.leagueId)
        .eq('status', 'active')
        .single();

    if (!room) return json({ error: 'room not found' }, 404);
    if ((room.draft_cursor as any)?.status === 'active') {
        return json({ error: 'draft already started' }, 400);
    }

    const result = await activateDraftRoom(body.leagueId, room.id);
    if (!result.ok) return json({ error: result.error }, 500);

    return json({ ok: true, roomId: room.id });
}

// ── HTTP POST /run-lottery 핸들러 ─────────────────────────────────────────────
// 로터리 자체(run_draft_lottery RPC)는 순수 DB 로직이라 원래 Bun 서버가 필요 없었지만,
// 로터리 완료를 스케줄러가 30초 폴링으로 뒤늦게 발견하는 대신 그 즉시 prepareDraftRoom()을
// 이어붙이기 위해 이 경로를 신설한다 — 로터리 → 방 준비가 한 요청 안에서 순차 처리된다.
export async function handleRunLottery(req: Request): Promise<Response> {
    // 인증
    const authHeader = req.headers.get('Authorization') ?? '';
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const userId = await verifyToken(token);
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => null) as { roomId?: string; leagueId?: string } | null;
    if (!body?.roomId || !body?.leagueId) return json({ error: 'roomId, leagueId required' }, 400);

    // 어드민 검증 — run_draft_lottery RPC는 p_admin_id를 받지만 실제로 검증하지 않으므로 여기서 대신 확인한다.
    const { data: league } = await supabase
        .from('leagues')
        .select('id, admin_user_id, status')
        .eq('id', body.leagueId)
        .single();

    if (!league)                          return json({ error: 'league not found' }, 404);
    if (league.admin_user_id !== userId)  return json({ error: 'Forbidden' }, 403);
    if (league.status !== 'recruiting')   return json({ error: 'league not in recruiting status' }, 400);

    const { data: lotteryResult, error: lotteryErr } = await supabase.rpc('run_draft_lottery', {
        p_room_id:  body.roomId,
        p_admin_id: userId,
    });
    if (lotteryErr) {
        const msg = lotteryErr.message ?? '';
        if (msg.includes('lottery_already_done')) return json({ error: '이미 추첨이 완료되었습니다.' }, 400);
        return json({ error: msg }, 500);
    }

    // 로터리 직후 곧바로 방 준비 — 원자적 클레임을 거치므로 스케줄러 폴링과 동시 실행돼도
    // 중복 없이 안전하다. 실패해도 스케줄러 폴링(runDraftRoomPrep)이 안전망으로 재시도한다.
    const prep = await claimAndPrepareRoom(body.leagueId, body.roomId);
    if (!prep.ok) {
        console.error(`[run-lottery] prepareDraftRoom failed for room ${body.roomId}: ${prep.error}`);
    }

    return json({ ok: true, leagueTeams: lotteryResult });
}

// ── 스케줄러 진입점 (자동 시작) ───────────────────────────────────────────────

export async function startDraftForRoom(leagueId: string, roomId: string): Promise<boolean> {
    const result = await activateDraftRoom(leagueId, roomId);
    if (!result.ok) {
        console.error(`[startDraft] ${roomId}: ${result.error}`);
    }
    return result.ok;
}

// ── 공통 준비 로직 (AI 슬롯 채우기 + 풀 구성 + 픽 순서 계산) ──────────────────
// prepareDraftRoom(로터리 직후, 미리)과 _runStartDraft(레거시 폴백, 즉시 시작) 둘 다
// 이 결과로 draft_config를 만든다 — cursor.status만 다르게 쓴다.

interface DraftSetup {
    draftConfig: {
        format: 'snake' | 'linear';
        totalRounds: number;
        pickDurationSec: number;
        teamCount: number;
        poolIds: string[];
        pickOrder: ReturnType<typeof generateSnakePickOrder>;
        applyCustomOverrides: boolean;
    };
}

async function buildDraftSetup(
    leagueId: string,
    roomId: string
): Promise<{ ok: true; setup: DraftSetup } | { ok: false; error: string }> {
    // 리그 전체 정보 조회
    const { data: league } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', leagueId)
        .single();
    if (!league) return { ok: false, error: 'league not found' };

    const { data: room } = await supabase
        .from('rooms')
        .select('id, max_players, tendency_seed, draft_cursor')
        .eq('id', roomId)
        .single();
    if (!room) return { ok: false, error: 'room not found' };

    // 멤버 조회
    const { data: members } = await supabase
        .from('room_members')
        .select('user_id, team_id, team_name, team_abbr, team_color_primary, team_color_secondary, is_ai')
        .eq('room_id', roomId);
    if (!members?.length) return { ok: false, error: 'no members' };

    const seed = room.tendency_seed ?? roomId;

    // AI 슬롯 채우기 — 로터리가 이미 팀 배정을 확정한 뒤라 예정 시각 전에 미리 채워도 안전하다
    // (로터리 완료 후엔 팀 선점 변경이 막히므로, 여기서 채운 AI 슬롯이 나중에 사람으로 바뀔 일이 없다).
    const maxPlayers = room.max_players ?? 30;
    const aiNeeded   = Math.max(0, maxPlayers - members.length);
    const newAiMembers: any[] = [];

    if (aiNeeded > 0) {
        const claimedSlugs = new Set(members.map((m: any) => m.team_id).filter(Boolean));
        const { data: unclaimedTeams } = await supabase
            .from('league_teams')
            .select('id, team_slug, team_name, team_abbr, color_primary, color_secondary')
            .eq('room_id', roomId)
            .is('user_id', null);

        const available: any[] = seededShuffle(
            (unclaimedTeams ?? []).filter((t: any) => !claimedSlugs.has(t.team_slug)),
            seed + '_ai',
        );

        const leagueTeamUpdates: { id: string; userId: string }[] = [];
        for (let i = 0; i < aiNeeded; i++) {
            const lt = available[i];
            if (!lt) break;
            const userId = `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`;
            newAiMembers.push({
                room_id:              roomId,
                user_id:              userId,
                team_id:              lt.team_slug,
                team_name:            lt.team_name,
                team_abbr:            lt.team_abbr,
                team_color_primary:   lt.color_primary,
                team_color_secondary: lt.color_secondary,
                is_ai:                true,
                ai_gm_personality:    'balanced',
            });
            leagueTeamUpdates.push({ id: lt.id, userId });
        }

        if (newAiMembers.length > 0) {
            const { error: aiErr } = await supabase
                .from('room_members')
                .upsert(newAiMembers, { onConflict: 'room_id,user_id' });
            if (aiErr) return { ok: false, error: `AI fill: ${aiErr.message}` };

            for (const { id, userId } of leagueTeamUpdates) {
                await supabase.from('league_teams').update({ user_id: userId, is_ai: true }).eq('id', id);
            }
        }
    }

    // 전체 멤버 배열
    const allMembers: { userId: string; teamId: string; isAi: boolean }[] = [
        ...members.map((m: any) => ({ userId: m.user_id, teamId: m.team_id as string, isAi: m.is_ai === true })),
        ...newAiMembers.map((m: any) => ({ userId: m.user_id, teamId: m.team_id, isAi: true })),
    ];

    // 드래프트 설정
    const totalRounds     = (league as any).draft_total_rounds      ?? DEFAULT_TOTAL_ROUNDS;
    const pickDurationSec = (league as any).draft_pick_duration_sec ?? DEFAULT_PICK_DURATION_SEC;
    const draftPoolRaw    = (league as any).draft_pool              ?? 'standard';
    const draftStrategy   = (league as any).draft_pool_strategy     ?? 'snake';
    const ovrMin          = (league as any).draft_ovr_min           ?? 0;
    const ovrMax          = (league as any).draft_ovr_max           ?? 99;
    const draftPools      = (draftPoolRaw as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    // 올타임 풀이 포함되면 custom_overrides를 반영한 OVR로 필터링/전송해야 한다 —
    // 안 그러면 오버라이드 적용 전 원본 능력치 기준으로 ovrMin/ovrMax를 걸러버리는 버그가 생긴다.
    const applyCustomOverrides = draftPools.includes('alltime');

    // 풀 구성
    const seenIds: Set<string>  = new Set();
    const nonRookieRaw: any[] = [];
    const rookieRaw: any[]    = [];

    for (const pt of draftPools) {
        let q = supabase.from('meta_players').select('id, position, base_attributes');
        if (pt === 'standard') {
            q = (q as any).eq('in_multi_pool', true).lt('draft_year', 2026).not('base_team_id', 'is', null);
        } else if (pt === 'alltime') {
            q = (q as any).eq('in_multi_pool', true).eq('include_alltime', true).lt('draft_year', 2026);
        } else {
            q = (q as any).eq('draft_year', 2026);
        }

        // 청크 단위 병렬 조회 (URL 길이 제한 우회)
        const { data: poolData } = await q;
        for (const p of poolData ?? []) {
            if (seenIds.has(String(p.id))) continue;
            seenIds.add(String(p.id));
            const mapped = mapRawPlayerToRuntimePlayer(p, applyCustomOverrides);
            if (pt === 'rookies') rookieRaw.push(mapped);
            else nonRookieRaw.push(mapped);
        }
    }

    const filteredNonRookies = nonRookieRaw.filter((p: any) => p.ovr >= ovrMin && p.ovr <= ovrMax);
    const poolIds = [...filteredNonRookies, ...rookieRaw].map((p: any) => String(p.id));

    // 픽 순서 생성 — 로비에서 진행한 로터리 추첨 결과(league_teams.draft_order)를 그대로 반영한다.
    // (예전엔 여기서 seededShuffle로 순서를 새로 뽑아써서, 로비에 표시된 추첨 결과와 실제 드래프트
    // 순서가 서로 다른 버그가 있었다 — 로터리 결과가 유일한 신뢰 원천이 되도록 고정한다.)
    const { data: teamOrderRows } = await supabase
        .from('league_teams')
        .select('team_slug, draft_order')
        .eq('room_id', roomId);
    const draftOrderBySlug = new Map<string, number>(
        (teamOrderRows ?? [])
            .filter((t: any) => t.draft_order != null)
            .map((t: any) => [t.team_slug as string, t.draft_order as number]),
    );
    const shuffledMembers = [...allMembers].sort((a, b) => {
        const oa = draftOrderBySlug.get(a.teamId);
        const ob = draftOrderBySlug.get(b.teamId);
        if (oa == null && ob == null) return 0;
        if (oa == null) return 1;   // 로터리 결과가 없는 경우(비정상 상황) 맨 뒤로 안전하게 배치
        if (ob == null) return -1;
        return oa - ob;
    });
    const pickOrder = draftStrategy === 'linear'
        ? generateLinearPickOrder(shuffledMembers, totalRounds)
        : generateSnakePickOrder(shuffledMembers, totalRounds);

    const draftConfig = {
        format: draftStrategy === 'linear' ? 'linear' as const : 'snake' as const,
        totalRounds, pickDurationSec, teamCount: allMembers.length, poolIds, pickOrder, applyCustomOverrides,
    };

    return { ok: true, setup: { draftConfig } };
}

// ── [신규] 로터리 완료 직후 사전 준비 — cursor를 'waiting'으로 만들어 입장만 허용 ──

export async function prepareDraftRoom(
    leagueId: string,
    roomId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    const built = await buildDraftSetup(leagueId, roomId);
    if (!built.ok) return built;

    const draftCursor = { status: 'waiting' as const, currentPickIndex: 0, currentPickStartedAt: null };

    const { error: roomErr } = await supabase
        .from('rooms')
        .update({ draft_config: built.setup.draftConfig, draft_cursor: draftCursor, draft_state: null })
        .eq('id', roomId);
    if (roomErr) return { ok: false, error: roomErr.message };

    // leagues.status는 그대로 'recruiting' 유지 — 로터리 후에도 팀 변경만 막힐 뿐 리그 상태는 안 바뀐다.
    console.log(`[prepareDraftRoom] room ${roomId} prepared (waiting)`);
    return { ok: true };
}

// ── [신규] 원자적 클레임 + 방 준비 — 스케줄러 폴링(runDraftRoomPrep)과 /run-lottery
// 엔드포인트가 동시에 같은 방을 준비하려 해도 draft_cursor가 여전히 null일 때만 클레임에
// 성공하므로 중복 실행되지 않는다. 이미 다른 경로가 선점/완료했으면 조용히 skipped로 반환한다.
export async function claimAndPrepareRoom(
    leagueId: string,
    roomId: string,
): Promise<{ ok: true; skipped: boolean } | { ok: false; error: string }> {
    const { data: claimedRows } = await supabase
        .from('rooms')
        .update({ draft_cursor: { status: 'preparing', currentPickIndex: 0, currentPickStartedAt: null } })
        .eq('id', roomId)
        .is('draft_config', null)
        .select('id');

    if (!claimedRows?.length) return { ok: true, skipped: true }; // 다른 경로가 이미 선점/완료

    const result = await prepareDraftRoom(leagueId, roomId);
    if (!result.ok) {
        await supabase.from('rooms').update({ draft_cursor: null }).eq('id', roomId); // 재시도 가능하게 복원
        return { ok: false, error: result.error };
    }
    return { ok: true, skipped: false };
}

// ── [신규] 예정 시각 도달 시 활성화 — 이미 준비된 draft_config가 있으면 커서만 전환 ──

export async function activateDraftRoom(
    leagueId: string,
    roomId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data: room } = await supabase
        .from('rooms')
        .select('draft_config')
        .eq('id', roomId)
        .single();

    // draft_config가 아직 없으면(prepare가 안 된 레거시/예외 경로) 기존 전체 로직으로 폴백.
    if (!room?.draft_config) {
        return _runStartDraft(leagueId, roomId);
    }

    // 이미 메모리에 로드돼 있으면(대기 중 누가 접속해 있었음) — DraftRoom.activate()가
    // 상태 전환 + DB 반영 + broadcastCursor()(접속자 전원에게 실시간 통지) + scheduleNext()까지
    // 전부 처리한다. RoomManager.get()은 캐시 조회만 하고 새로 로드하지 않는다.
    const existing = RoomManager.get(roomId);
    if (existing) {
        const activated = await existing.activate();
        if (!activated) {
            console.warn(`[activateDraftRoom] room ${roomId}: activate() returned false (status was not 'waiting')`);
        }
        await supabase.from('leagues').update({ status: 'drafting' }).eq('id', leagueId);
        return { ok: true };
    }

    // 메모리에 없으면 — DB의 cursor를 먼저 'active'로 바꾸고, 새로 로드해서 타이머를 시작한다.
    const nowIso = new Date().toISOString();
    const { error: roomErr } = await supabase
        .from('rooms')
        .update({ draft_cursor: { status: 'active', currentPickIndex: 0, currentPickStartedAt: nowIso } })
        .eq('id', roomId);
    if (roomErr) return { ok: false, error: roomErr.message };

    await supabase.from('leagues').update({ status: 'drafting' }).eq('id', leagueId);

    const draftRoom = await RoomManager.getOrLoad(roomId);
    if (draftRoom) {
        draftRoom.scheduleNext();
        console.log(`[activateDraftRoom] room ${roomId} loaded into memory, scheduleNext called`);
    }

    return { ok: true };
}

// ── 레거시 폴백: prepare 없이 곧바로 전체 시작 (AI채움+풀+픽순서+active 커서 한 번에) ──

async function _runStartDraft(
    leagueId: string,
    roomId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    const built = await buildDraftSetup(leagueId, roomId);
    if (!built.ok) return built;

    const nowIso = new Date().toISOString();
    const draftCursor = { status: 'active' as const, currentPickIndex: 0, currentPickStartedAt: nowIso };

    // rooms 업데이트
    const { error: roomErr } = await supabase
        .from('rooms')
        .update({ draft_config: built.setup.draftConfig, draft_cursor: draftCursor, draft_state: null })
        .eq('id', roomId);
    if (roomErr) return { ok: false, error: roomErr.message };

    // leagues.status 업데이트
    await supabase.from('leagues').update({ status: 'drafting' }).eq('id', leagueId);

    // 방 메모리 로드 + 타이머 시작
    const draftRoom = await RoomManager.getOrLoad(roomId);
    if (draftRoom) {
        draftRoom.scheduleNext();
        console.log(`[startDraft] room ${roomId} loaded into memory, scheduleNext called`);
    }

    return { ok: true };
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}
