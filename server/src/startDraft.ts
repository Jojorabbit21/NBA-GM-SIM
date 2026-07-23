/**
 * startDraft.ts — 드래프트 시작 핸들러.
 *
 * start-draft EF와 draft-scheduler 섹션2를 통합 이식.
 * - HTTP POST /start-draft : 어드민이 수동 시작 (JWT 인증 필수)
 * - startDraftForRoom(roomId) : 스케줄러가 자동 시작 시 사용
 * 두 경로 모두 동일한 내부 로직(_runStartDraft)으로 처리.
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

    const result = await _runStartDraft(body.leagueId, room.id);
    if (!result.ok) return json({ error: result.error }, 500);

    return json({ ok: true, roomId: room.id });
}

// ── 스케줄러 진입점 (자동 시작) ───────────────────────────────────────────────

export async function startDraftForRoom(leagueId: string, roomId: string): Promise<boolean> {
    const result = await _runStartDraft(leagueId, roomId);
    if (!result.ok) {
        console.error(`[startDraft] ${roomId}: ${result.error}`);
    }
    return result.ok;
}

// ── 공통 로직 ─────────────────────────────────────────────────────────────────

async function _runStartDraft(
    leagueId: string,
    roomId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
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

    // AI 슬롯 채우기
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
            const mapped = mapRawPlayerToRuntimePlayer(p);
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

    const nowIso = new Date().toISOString();
    const draftConfig = { format: draftStrategy === 'linear' ? 'linear' : 'snake', totalRounds, pickDurationSec, teamCount: allMembers.length, poolIds, pickOrder };
    const draftCursor = { status: 'active', currentPickIndex: 0, currentPickStartedAt: nowIso };

    // rooms 업데이트
    const { error: roomErr } = await supabase
        .from('rooms')
        .update({ draft_config: draftConfig, draft_cursor: draftCursor, draft_state: null })
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
