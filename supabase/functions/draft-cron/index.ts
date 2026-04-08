
/**
 * draft-cron — 매 30초마다 실행 (Supabase Cron 또는 외부 cron 호출).
 * 픽 시간이 초과된 드래프트를 찾아 OVR 최고 선수로 자동 픽.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── 활성 드래프트 방 전체 조회 ─────────────────────────────────────────
    const { data: rooms } = await supabase
        .from('rooms')
        .select('id, draft_state')
        .eq('status', 'active')
        .not('draft_state', 'is', null);

    if (!rooms?.length) return json({ ok: true, processed: 0 });

    let processed = 0;

    for (const room of rooms) {
        const state = room.draft_state as any;
        if (state?.status !== 'active') continue;

        const startedAt  = new Date(state.currentPickStartedAt).getTime();
        const elapsedSec = (Date.now() - startedAt) / 1000;

        if (elapsedSec < state.pickDurationSec) continue; // 아직 시간 남음

        // ── 자동 픽 처리 ───────────────────────────────────────────────────
        const currentEntry = state.pickOrder[state.currentPickIndex];
        if (!currentEntry) continue;

        // 선수 풀 조회 (ovr은 base_attributes 안에 있음 — JS에서 정렬)
        const { data: poolPlayers } = await supabase
            .from('meta_players')
            .select('id, name, position, base_attributes')
            .limit(600);

        if (!poolPlayers?.length) continue;

        // OVR 내림차순 정렬 후 미드래프트 선수 중 최고 선수 선택
        const sorted = poolPlayers
            .slice()
            .sort((a: any, b: any) =>
                ((b.base_attributes?.ovr ?? 0) as number) - ((a.base_attributes?.ovr ?? 0) as number)
            );

        const draftedSet = new Set<string>(state.draftedIds ?? []);
        const best = sorted.find((p: any) => !draftedSet.has(p.id));
        if (!best) continue;

        const ovr = (best.base_attributes as any)?.ovr ?? 0;

        const { error } = await supabase.rpc('submit_draft_pick', {
            p_room_id:     room.id,
            p_user_id:     currentEntry.userId,
            p_player_id:   best.id,
            p_player_name: best.name,
            p_position:    best.position,
            p_ovr:         ovr,
        });

        if (!error) processed++;
    }

    return json({ ok: true, processed });
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
