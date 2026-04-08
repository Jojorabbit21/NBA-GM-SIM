
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { roomId, playerId } = await req.json() as { roomId: string; playerId: string };
    if (!roomId || !playerId) return json({ error: 'roomId and playerId required' }, 400);

    // ── 선수 정보 조회 (ovr은 base_attributes 안에 있음) ──────────────────────
    const { data: player } = await supabase
        .from('meta_players')
        .select('id, name, position, base_attributes')
        .eq('id', playerId)
        .single();

    if (!player) return json({ error: 'player not found' }, 404);

    const ovr = (player.base_attributes as any)?.ovr ?? 0;

    // ── 원자적 픽 처리 (PostgreSQL RPC) ──────────────────────────────────────
    const { data, error } = await supabase.rpc('submit_draft_pick', {
        p_room_id:     roomId,
        p_user_id:     user.id,
        p_player_id:   playerId,
        p_player_name: player.name,
        p_position:    player.position,
        p_ovr:         ovr,
    });

    if (error) {
        const msg = error.message ?? '';
        if (msg.includes('not_your_turn'))   return json({ error: 'not your turn' }, 409);
        if (msg.includes('already_drafted')) return json({ error: 'player already drafted' }, 409);
        if (msg.includes('draft_not_active'))return json({ error: 'draft not active' }, 409);
        return json({ error: msg }, 500);
    }

    return json({ ok: true, draftState: data });
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
