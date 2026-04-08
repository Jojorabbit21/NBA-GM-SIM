
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateSnakePickOrder, seededShuffle } from '../_shared/multiDraftEngine.ts';

const TOTAL_ROUNDS      = 10;
const PICK_DURATION_SEC = 30;

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
    const supabase   = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) return json({ error: 'Unauthorized' }, 401);

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
        .select('id, max_players, tendency_seed, draft_state')
        .eq('league_id', leagueId)
        .eq('status', 'active')
        .single();

    if (!room) return json({ error: 'room not found' }, 404);
    if ((room.draft_state as any)?.status === 'active') {
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

    // 사용자가 직접 설정한 team_id 사용 (자동 배정 없음)
    const assignedMembers: { userId: string; teamId: string }[] = members.map((m: any) => ({
        userId: m.user_id,
        teamId: m.team_id as string,
    }));

    // ── 드래프트 풀 구성 (in_multi_pool = true 선수만) ──────────────────────
    const { data: poolPlayers } = await supabase
        .from('meta_players')
        .select('id')
        .eq('in_multi_pool', true);

    const poolIds = (poolPlayers ?? []).map((p: any) => p.id);

    // ── Snake 픽 순서 생성 ───────────────────────────────────────────────────
    const shuffledMembers = seededShuffle(assignedMembers, seed + '_order');
    const pickOrder       = generateSnakePickOrder(shuffledMembers, TOTAL_ROUNDS);

    // ── draft_state 초기화 ───────────────────────────────────────────────────
    const draftState = {
        format:               'snake',
        totalRounds:          TOTAL_ROUNDS,
        pickDurationSec:      PICK_DURATION_SEC,
        teamCount:            assignedMembers.length,
        poolIds,
        pickOrder,
        status:               'active',
        currentPickIndex:     0,
        currentPickStartedAt: new Date().toISOString(),
        picks:                [],
        draftedIds:           [],
    };

    await supabase.from('rooms').update({ draft_state: draftState }).eq('id', room.id);
    await supabase.from('leagues').update({ status: 'drafting' }).eq('id', leagueId);

    return json({ ok: true, roomId: room.id });
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
