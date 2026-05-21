
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateSnakePickOrder, generateLinearPickOrder, seededShuffle } from '../_shared/multiDraftEngine.ts';
import { mapRawPlayerToRuntimePlayer } from '../_shared/dataMapper.ts';

const DEFAULT_TOTAL_ROUNDS      = 10;
const DEFAULT_PICK_DURATION_SEC = 30;


const CORS_HEADERS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
    }

    // ── 인증 ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    const supabase   = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    if (!token) {
        console.error('[start-draft] No token in Authorization header');
        return json({ error: 'Unauthorized' }, 401);
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (!user) {
        console.error('[start-draft] getUser failed:', authErr?.message, 'token prefix:', token.slice(0, 20));
        return json({ error: 'Unauthorized' }, 401);
    }

    const { leagueId } = await req.json() as { leagueId: string };
    if (!leagueId) return json({ error: 'leagueId required' }, 400);

    // ── 리그/방 조회 ──────────────────────────────────────────────────────────
    const { data: league } = await supabase
        .from('leagues').select('*').eq('id', leagueId).single();

    if (!league)                           return json({ error: 'league not found' }, 404);
    if (league.admin_user_id !== user.id)  return json({ error: 'Forbidden' }, 403);
    if (league.status !== 'recruiting')    return json({ error: 'league not in recruiting status' }, 400);

    const { data: room } = await supabase
        .from('rooms')
        .select('id, max_players, tendency_seed, draft_cursor')
        .eq('league_id', leagueId)
        .eq('status', 'active')
        .single();

    if (!room) return json({ error: 'room not found' }, 404);
    if ((room.draft_cursor as any)?.status === 'active') {
        return json({ error: 'draft already started' }, 400);
    }

    // ── 멤버 조회 ────────────────────────────────────────────────────────────
    const { data: members } = await supabase
        .from('room_members')
        .select('user_id, team_id, team_name, team_abbr, team_color_primary, team_color_secondary, is_ai')
        .eq('room_id', room.id);

    if (!members?.length) return json({ error: 'no members' }, 400);

    // 팀 미설정 멤버(AI 제외) 검증 — UI가 먼저 막지만 서버에서 최종 보증
    const unsetMembers = members.filter((m: any) => !m.is_ai && !m.team_id);
    if (unsetMembers.length > 0) {
        return json({
            error:        'team not set',
            message:      `${unsetMembers.length}명의 멤버가 팀을 설정하지 않았습니다`,
            unsetUserIds: unsetMembers.map((m: any) => m.user_id),
        }, 400);
    }

    const seed = room.tendency_seed ?? room.id;

    // ── 빈 슬롯 AI로 채우기 ──────────────────────────────────────────────────
    const maxPlayers   = room.max_players ?? 30;
    const humanCount   = members.length;
    const aiNeeded     = Math.max(0, maxPlayers - humanCount);
    const newAiMembers: any[] = [];

    if (aiNeeded > 0) {
        const claimedSlugs = new Set(members.map((m: any) => m.team_id).filter(Boolean));

        const { data: unclaimedTeams } = await supabase
            .from('league_teams')
            .select('id, team_slug, team_name, team_abbr, color_primary, color_secondary')
            .eq('room_id', room.id)
            .is('user_id', null);

        const available: any[] = seededShuffle(
            (unclaimedTeams ?? []).filter((t: any) => !claimedSlugs.has(t.team_slug)),
            seed + '_ai'
        );

        const leagueTeamUpdates: { id: string; userId: string }[] = [];

        for (let i = 0; i < aiNeeded; i++) {
            const n = i + 1;
            const userId = `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

            const lt = available[i];
            if (!lt) break;

            newAiMembers.push({
                room_id:              room.id,
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
            if (aiErr) return json({ error: `AI 슬롯 생성 실패: ${aiErr.message}` }, 500);

            for (const { id, userId } of leagueTeamUpdates) {
                await supabase.from('league_teams')
                    .update({ user_id: userId, is_ai: true })
                    .eq('id', id);
            }
        }
    }

    // 전체 멤버(인간 + AI) 픽오더용 배열
    const allMembers: { userId: string; teamId: string; isAi: boolean }[] = [
        ...members.map((m: any) => ({
            userId: m.user_id,
            teamId: m.team_id as string,
            isAi:  m.is_ai === true,
        })),
        ...newAiMembers.map((m: any) => ({
            userId: m.user_id,
            teamId: m.team_id,
            isAi:  true,
        })),
    ];

    // ── 드래프트 설정값: DB 저장값 우선, 없으면 기본값 ─────────────────────────
    const totalRounds     = (league as any).draft_total_rounds      ?? DEFAULT_TOTAL_ROUNDS;
    const pickDurationSec = (league as any).draft_pick_duration_sec ?? DEFAULT_PICK_DURATION_SEC;
    const draftPoolRaw  = (league as any).draft_pool              ?? 'standard';
    const draftStrategy = (league as any).draft_pool_strategy     ?? 'snake';
    const ovrMin        = (league as any).draft_ovr_min           ?? 0;
    const ovrMax        = (league as any).draft_ovr_max           ?? 99;
    const draftPools    = draftPoolRaw.split(',').map((s: string) => s.trim()).filter(Boolean);

    // ── 드래프트 풀 구성 (다중 풀 유형 + OVR 범위 적용) ─────────────────────
    const seenIds      = new Set<string>();
    const nonRookieRaw: any[] = [];
    const rookieRaw:    any[] = [];

    for (const pt of draftPools) {
        let q = supabase.from('meta_players').select('id, position, base_attributes');

        if (pt === 'standard') {
            q = (q as any).eq('in_multi_pool', true).lt('draft_year', 2026).not('base_team_id', 'is', null);
        } else if (pt === 'alltime') {
            q = (q as any).eq('in_multi_pool', true).eq('include_alltime', true).lt('draft_year', 2026);
        } else {
            q = (q as any).eq('draft_year', 2026);
        }

        const { data } = await q;
        if (!data) continue;

        for (const p of data) {
            if (seenIds.has(p.id)) continue;
            seenIds.add(p.id);
            const mapped = mapRawPlayerToRuntimePlayer(p);
            if (pt === 'rookies') rookieRaw.push(mapped);
            else                  nonRookieRaw.push(mapped);
        }
    }

    const filteredNonRookies = nonRookieRaw.filter((p: any) => p.ovr >= ovrMin && p.ovr <= ovrMax);
    const poolIds = [...filteredNonRookies, ...rookieRaw].map((p: any) => p.id);

    // ── 픽 순서 생성 (스네이크 or 선형) ────────────────────────────────────────
    const shuffledMembers = seededShuffle(allMembers, seed + '_order');
    const pickOrder = draftStrategy === 'linear'
        ? generateLinearPickOrder(shuffledMembers, totalRounds)
        : generateSnakePickOrder(shuffledMembers, totalRounds);

    // ── draft_config (정적, 1회 기록) + draft_cursor (휘발, 픽마다 갱신) ─────
    const nowIso = new Date().toISOString();

    const draftConfig = {
        format:          draftStrategy === 'linear' ? 'linear' : 'snake',
        totalRounds,
        pickDurationSec,
        teamCount:       allMembers.length,
        poolIds,
        pickOrder,
    };

    const draftCursor = {
        status:               'active',
        currentPickIndex:     0,
        currentPickStartedAt: nowIso,
    };

    await supabase.from('rooms').update({
        draft_config: draftConfig,
        draft_cursor: draftCursor,
        draft_state:  null,           // 레거시 컬럼 클리어
    }).eq('id', room.id);

    await supabase.from('leagues').update({ status: 'drafting' }).eq('id', leagueId);

    return json({ ok: true, roomId: room.id, teamCount: allMembers.length, aiCount: newAiMembers.length });
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
