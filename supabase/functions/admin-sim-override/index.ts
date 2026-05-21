
/**
 * admin-sim-override — 어드민 전용 경기 수동 시뮬레이션 API.
 *
 * Actions:
 *   sim-game  — 지정 gameId 단일 경기 시뮬레이션
 *
 * 어드민 검증 후 simulate-game EF를 service role 키로 호출한다.
 * 배치 처리는 클라이언트가 루프를 돌며 sim-game을 반복 호출한다.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
    action:   'sim-game';
    roomId:   string;
    leagueId: string;
    gameId:   string;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (!token) return json({ error: 'Unauthorized' }, 401);

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json() as RequestBody;
    const { action, roomId, leagueId, gameId } = body;

    if (!roomId || !leagueId) return json({ error: 'roomId and leagueId required' }, 400);

    // 어드민 검증
    const { data: league } = await supabase
        .from('leagues')
        .select('admin_user_id, status')
        .eq('id', leagueId)
        .single();
    if (!league)                          return json({ error: 'League not found' }, 404);
    if (league.admin_user_id !== user.id) return json({ error: 'Forbidden' }, 403);

    if (action === 'sim-game') {
        if (!gameId) return json({ error: 'gameId required' }, 400);

        // simulate-game EF 호출
        // Supabase는 service_role JWT를 verify_jwt 처리 후 함수에 전달하지 않으므로
        // anon key(일반 JWT)를 사용하거나 요청 본문의 adminToken으로 인증
        const simUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/simulate-game`;
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const res = await fetch(simUrl, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${anonKey}`,
                'apikey':        anonKey,
            },
            body: JSON.stringify({ roomId, gameId, adminToken: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }),
        });

        const data = await res.json();
        return json({ ok: res.ok, ...data }, res.ok ? 200 : 500);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
