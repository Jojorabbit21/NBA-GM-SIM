
/**
 * simulate-games-cron — 오늘 날짜 경기 자동 시뮬레이션 크론 함수
 *
 * Supabase 크론 또는 외부 스케줄러가 매일 특정 시각에 호출.
 * rooms.sim_date가 오늘 날짜인 모든 방의 미완료 경기를 시뮬레이션한다.
 *
 * 헤더: X-Cron-Secret: <SIMULATE_CRON_SECRET>
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CRON_SECRET = Deno.env.get('SIMULATE_CRON_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
    }

    // 크론 시크릿 인증
    const cronHeader = req.headers.get('X-Cron-Secret') ?? '';
    if (!CRON_SECRET || cronHeader !== CRON_SECRET) {
        return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 요청 본문에서 날짜 오버라이드 가능 (수동 실행용)
    let targetDate: string;
    try {
        const body = await req.json().catch(() => ({}));
        targetDate = body?.date ?? new Date().toISOString().slice(0, 10);
    } catch {
        targetDate = new Date().toISOString().slice(0, 10);
    }

    const nowIso = new Date().toISOString();
    console.log(`[simulate-games-cron] now=${nowIso} (legacy date=${targetDate})`);

    // in_progress 상태 리그의 id 조회 → rooms.league_id로 조인
    const { data: leagues } = await supabase
        .from('leagues')
        .select('id')
        .eq('status', 'in_progress');

    if (!leagues?.length) {
        return json({ ok: true, processed: 0, message: 'No active leagues' });
    }

    const leagueIds = leagues.map(l => l.id);

    const { data: leagueRooms } = await supabase
        .from('rooms')
        .select('id')
        .in('league_id', leagueIds);

    const roomIds = (leagueRooms ?? []).map(r => r.id);

    // 각 방의 미완료 경기 수집
    const { data: rooms } = await supabase
        .from('rooms')
        .select('id, schedule, sim_date')
        .in('id', roomIds);

    const tasks: { roomId: string; gameId: string }[] = [];

    for (const room of rooms ?? []) {
        const schedule: any[] = room.schedule ?? [];
        for (const game of schedule) {
            if (game.played) continue;
            // scheduledAt 기반 (신규 리그)
            if (game.scheduledAt) {
                if (game.scheduledAt <= nowIso) tasks.push({ roomId: room.id, gameId: game.id });
            } else {
                // 레거시: date 기반 (scheduledAt 없는 구버전 스케줄)
                if (game.date === targetDate) tasks.push({ roomId: room.id, gameId: game.id });
            }
        }
    }

    console.log(`[simulate-games-cron] found ${tasks.length} games to simulate`);

    // simulate-game 함수를 순차 호출
    // (동시 실행 시 same room의 DB 업데이트가 충돌할 수 있으므로 room 단위로 직렬 처리)
    const results: { gameId: string; ok: boolean; error?: string }[] = [];

    for (const { roomId, gameId } of tasks) {
        try {
            const resp = await fetch(
                `${SUPABASE_URL}/functions/v1/simulate-game`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':   'application/json',
                        'X-Cron-Secret':  CRON_SECRET,
                        'Authorization':  `Bearer ${SERVICE_KEY}`,
                    },
                    body: JSON.stringify({ roomId, gameId }),
                },
            );
            const data = await resp.json();
            results.push({ gameId, ok: data.ok ?? false, error: data.error });
        } catch (err) {
            results.push({ gameId, ok: false, error: String(err) });
        }
    }

    // sim_date를 하루 전진 (모든 경기가 완료된 방만)
    await advanceSimDates(supabase, rooms ?? [], targetDate);

    const succeeded = results.filter(r => r.ok).length;
    const failed    = results.filter(r => !r.ok).length;

    console.log(`[simulate-games-cron] done: ${succeeded} ok, ${failed} failed`);
    return json({ ok: true, processed: tasks.length, succeeded, failed, results });
});

// ── sim_date 하루 전진 ────────────────────────────────────────────────────────

async function advanceSimDates(
    supabase:   ReturnType<typeof createClient>,
    rooms:      { id: string; schedule: any; sim_date: string }[],
    targetDate: string,
) {
    const nowIso = new Date().toISOString();
    for (const room of rooms) {
        const schedule: any[] = room.schedule ?? [];

        // scheduledAt 기반 (신규) / date 기반 (레거시) 구분
        const hasScheduledAt = schedule.some(g => g.scheduledAt);
        let allCurrentPlayed: boolean;

        if (hasScheduledAt) {
            // 이미 시각이 지난(≤ now) 게임이 모두 played 상태인지 확인
            const dueGames = schedule.filter(g => g.scheduledAt && g.scheduledAt <= nowIso);
            allCurrentPlayed = dueGames.length > 0 && dueGames.every(g => g.played);
        } else {
            const todayGames = schedule.filter(g => g.date === targetDate);
            allCurrentPlayed = todayGames.length > 0 && todayGames.every(g => g.played);
        }

        if (allCurrentPlayed) {
            // 아직 플레이되지 않은 가장 빠른 다음 경기의 날짜로 전진
            const upcoming = schedule
                .filter(g => !g.played)
                .map(g => (g.scheduledAt ?? g.date ?? '').slice(0, 10))
                .filter(Boolean)
                .sort();
            const nextDate = upcoming[0] ?? targetDate;
            await supabase.from('rooms')
                .update({ sim_date: nextDate })
                .eq('id', room.id);
        }
    }
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
