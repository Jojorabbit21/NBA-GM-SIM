
/**
 * draft-cron — 매 30초마다 실행 (Supabase Cron 또는 외부 cron 호출).
 * 픽 시간이 초과된 드래프트를 찾아 OVR 최고 선수로 자동 픽.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getBestAvailableId } from '../_shared/multiDraftEngine.ts';

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

        // 선수 풀 조회 (OVR 내림차순)
        const { data: poolPlayers } = await supabase
            .from('meta_players')
            .select('id, name, position, ovr')
            .in('id', state.poolIds)
            .order('ovr', { ascending: false })
            .limit(400);

        const bestId = getBestAvailableId(poolPlayers ?? [], state.draftedIds);
        if (!bestId) continue;

        const best = (poolPlayers ?? []).find((p: any) => p.id === bestId);
        if (!best) continue;

        const { error } = await supabase.rpc('submit_draft_pick', {
            p_room_id:     room.id,
            p_user_id:     currentEntry.userId,
            p_player_id:   best.id,
            p_player_name: best.name,
            p_position:    best.position,
            p_ovr:         best.ovr,
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
