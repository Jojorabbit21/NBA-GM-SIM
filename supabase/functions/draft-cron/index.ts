
/**
 * draft-cron — 매 10초마다 실행 (Supabase Cron 또는 외부 cron 호출).
 * - AI 팀 차례: AI_MIN_THINK_SEC 경과 후 자동픽 (최소 3초 "생각" 시간)
 * - 인간 팀 차례: 픽 시간 초과 시 자동픽 (타임아웃)
 *
 * 개선 (2026-04-21): draft_state JSONB 대신 draft_config + draft_cursor + draft_picks 사용
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AI_MIN_THINK_SEC = 3;

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

    // ── 활성 드래프트 방 전체 조회 (cursor만 읽음 — config는 RPC에서 처리) ──
    const { data: rooms } = await supabase
        .from('rooms')
        .select('id, draft_config, draft_cursor')
        .eq('status', 'active')
        .not('draft_cursor', 'is', null);

    if (!rooms?.length) return json({ ok: true, processed: 0 });

    let processed = 0;

    for (const room of rooms) {
        const config = room.draft_config as any;
        const cursor = room.draft_cursor as any;

        if (cursor?.status !== 'active') continue;
        if (!config?.pickOrder) continue;

        // 첫 번째 픽이 액션 대상인지 확인
        const firstEntry = config.pickOrder[cursor.currentPickIndex];
        if (!firstEntry) continue;
        const firstElapsed = (Date.now() - new Date(cursor.currentPickStartedAt).getTime()) / 1000;
        if (!firstEntry.isAi && firstElapsed < config.pickDurationSec) continue;
        if ( firstEntry.isAi && firstElapsed < AI_MIN_THINK_SEC)       continue;

        // 루프 전 1회만 조회 — 루프 안에서 로컬 Set 갱신으로 N+1 방지
        const { data: draftedRows } = await supabase
            .from('draft_picks')
            .select('player_id')
            .eq('room_id', room.id);
        const draftedSet = new Set<string>((draftedRows ?? []).map((r: any) => String(r.player_id)));

        // draft_config.poolIds — configured pool only; skip room if pool is unset
        const configPoolIds: string[] = (config.poolIds ?? []).map(String);
        if (configPoolIds.length === 0) continue;

        const { data: rawPool } = await supabase
            .from('meta_players')
            .select('id, base_attributes')
            .in('id', configPoolIds);
        const poolPlayers = (rawPool ?? []).sort((a: any, b: any) =>
            ((b.base_attributes as any)?.ovr ?? 0) - ((a.base_attributes as any)?.ovr ?? 0)
        );

        if (!poolPlayers.length) continue;

        // AI 연속 픽 루프 — 다음 인간 턴이 나올 때까지 연속 처리
        let activeCursor = cursor;
        const MAX_AUTO_PICKS = 60;

        for (let pickLoop = 0; pickLoop < MAX_AUTO_PICKS; pickLoop++) {
            const entry = config.pickOrder[activeCursor.currentPickIndex];
            if (!entry) break;

            const isAiTurn = entry.isAi === true;
            const elapsed  = (Date.now() - new Date(activeCursor.currentPickStartedAt).getTime()) / 1000;
            if (!isAiTurn && elapsed < config.pickDurationSec) break;
            if ( isAiTurn && elapsed < AI_MIN_THINK_SEC)       break;

            const best = poolPlayers.find((p: any) => !draftedSet.has(String(p.id)));
            if (!best) break;

            const { data: newCursor, error } = await supabase.rpc('submit_draft_pick_v2', {
                p_room_id:   room.id,
                p_player_id: best.id,
                p_user_id:   entry.userId,
            });

            if (error) break;
            draftedSet.add(String(best.id)); // 로컬 Set 갱신 — DB 재조회 불필요
            processed++;

            if (!isAiTurn) break; // 인간 타임아웃은 1회 처리 후 중단

            const next = newCursor as any;
            if (!next || next.status !== 'active') break;
            // 연속 AI 픽: elapsed 체크를 통과하도록 시작 시각을 과거로 설정
            activeCursor = { ...next, currentPickStartedAt: new Date(Date.now() - (AI_MIN_THINK_SEC + 1) * 1000).toISOString() };
        }
    }

    return json({ ok: true, processed });
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
