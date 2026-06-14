
/**
 * admin-draft-override — 어드민 전용 드래프트 오버라이드 API.
 * Actions:
 *   rollback     — 특정 픽 인덱스 이전으로 되돌리기
 *   pause        — 드래프트 일시정지 (pausedAt 기록)
 *   resume       — 드래프트 재개 (일시정지 기간만큼 currentPickStartedAt 보정 → 남은 시간 보존)
 *   reset-timer  — 현재 차례 타이머 초기화
 *   skip-turn    — 현재 차례 강제 오토픽
 *   autocomplete — 남은 모든 픽 AI로 자동완성
 *
 * 개선 (2026-04-21): draft_state JSONB 대신 draft_config + draft_cursor + draft_picks 사용
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action = 'rollback' | 'pause' | 'resume' | 'reset-timer' | 'skip-turn' | 'autocomplete';

interface RequestBody {
    action:   Action;
    roomId:   string;
    leagueId: string;
    params?:  { targetPickIndex?: number };
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
    }

    // ── 인증 ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    const supabase   = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json() as RequestBody;
    const { action, roomId, leagueId, params } = body;

    // ── 어드민 검증 ───────────────────────────────────────────────────────────
    const { data: league } = await supabase
        .from('leagues')
        .select('admin_user_id, status, draft_pool, draft_ovr_min, draft_ovr_max')
        .eq('id', leagueId)
        .single();
    if (!league)                          return json({ error: 'League not found' }, 404);
    if (league.admin_user_id !== user.id) return json({ error: 'Forbidden' }, 403);

    // ── 방 상태 로드 (config + cursor만 — picks는 action에서 필요 시 쿼리) ────
    const { data: room } = await supabase
        .from('rooms')
        .select('draft_config, draft_cursor')
        .eq('id', roomId)
        .single();
    if (!room)              return json({ error: 'Room not found' }, 404);
    if (!room.draft_cursor) return json({ error: 'No draft cursor' }, 400);

    const config = room.draft_config as any;
    const cursor = room.draft_cursor as any;
    const nowIso = new Date().toISOString();

    switch (action) {

    case 'rollback': {
        const targetIndex = params?.targetPickIndex ?? 0;
        if (targetIndex < 0 || targetIndex > (cursor.currentPickIndex ?? 0)) {
            return json({ error: 'Invalid targetPickIndex' }, 400);
        }

        // 롤백 대상 픽 조회
        const { data: picksToRemove } = await supabase
            .from('draft_picks')
            .select('pick_index, player_id, team_id')
            .eq('room_id', roomId)
            .gte('pick_index', targetIndex);

        const removedCount        = (picksToRemove ?? []).length;
        const playerIdsToRemove   = new Set<string>((picksToRemove ?? []).map((p: any) => p.player_id));
        const teamIdsAffected     = [...new Set<string>((picksToRemove ?? []).map((p: any) => p.team_id))];

        // league_teams.roster에서 해당 선수 제거
        for (const teamId of teamIdsAffected) {
            const { data: team } = await supabase
                .from('league_teams')
                .select('roster')
                .eq('room_id', roomId)
                .eq('team_slug', teamId)
                .single();
            if (team) {
                await supabase
                    .from('league_teams')
                    .update({ roster: (team.roster ?? []).filter((id: string) => !playerIdsToRemove.has(id)) })
                    .eq('room_id', roomId)
                    .eq('team_slug', teamId);
            }
        }

        // draft_picks 테이블에서 대상 행 삭제
        await supabase
            .from('draft_picks')
            .delete()
            .eq('room_id', roomId)
            .gte('pick_index', targetIndex);

        // draft_cursor 갱신 (active로 복귀)
        await supabase.from('rooms').update({
            draft_cursor: {
                status:               'active',
                currentPickIndex:     targetIndex,
                currentPickStartedAt: nowIso,
            },
        }).eq('id', roomId);

        if (cursor.status === 'completed') {
            await supabase.from('leagues').update({ status: 'drafting' }).eq('id', leagueId);
        }
        return json({ ok: true, rolledBackPicks: removedCount, targetIndex });
    }

    case 'pause': {
        if (cursor.status !== 'active') return json({ error: 'Draft is not active' }, 400);
        await supabase.from('rooms').update({
            draft_cursor: { ...cursor, status: 'paused', pausedAt: nowIso },
        }).eq('id', roomId);
        return json({ ok: true });
    }

    case 'resume': {
        if (cursor.status !== 'paused') return json({ error: 'Draft is not paused' }, 400);

        // 일시정지 기간만큼 currentPickStartedAt을 앞으로 당겨
        // → 재개 후 타이머가 일시정지 직전 남은 시간부터 이어서 카운트됨
        let newPickStartedAt = nowIso;
        if (cursor.pausedAt) {
            const pauseDurationMs = Date.now() - new Date(cursor.pausedAt).getTime();
            newPickStartedAt = new Date(
                new Date(cursor.currentPickStartedAt).getTime() + pauseDurationMs
            ).toISOString();
        }

        const { pausedAt: _, ...cursorWithoutPause } = cursor;
        await supabase.from('rooms').update({
            draft_cursor: {
                ...cursorWithoutPause,
                status:               'active',
                currentPickStartedAt: newPickStartedAt,
            },
        }).eq('id', roomId);
        return json({ ok: true });
    }

    case 'reset-timer': {
        if (cursor.status !== 'active') return json({ error: 'Draft is not active' }, 400);
        await supabase.from('rooms').update({
            draft_cursor: { ...cursor, currentPickStartedAt: nowIso },
        }).eq('id', roomId);
        return json({ ok: true });
    }

    case 'skip-turn': {
        if (cursor.status !== 'active') return json({ error: 'Draft is not active' }, 400);
        const currentEntry = (config?.pickOrder ?? [])[cursor.currentPickIndex];
        if (!currentEntry) return json({ error: 'No current pick entry' }, 400);

        // 이미 선발된 선수 ID 조회
        const { data: draftedRows } = await supabase
            .from('draft_picks')
            .select('player_id')
            .eq('room_id', roomId);
        const drafted = new Set<string>((draftedRows ?? []).map((r: any) => r.player_id));

        // draft_config.poolIds 기반으로 풀 조회 (URL 길이 제한 우회 위해 100개 청크)
        const poolPlayers = await fetchPoolPlayers(supabase, config, league);
        if (!poolPlayers.length) return json({ error: 'No players in pool' }, 400);

        const best = poolPlayers.find((p: any) => !drafted.has(p.id));
        if (!best) return json({ error: 'No undrafted players' }, 400);

        // 메타 파라미터 제거 — RPC가 meta_players에서 직접 조회
        const { error } = await supabase.rpc('submit_draft_pick_v2', {
            p_room_id:   roomId,
            p_user_id:   currentEntry.userId,
            p_player_id: best.id,
        });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, pickedPlayer: best.name });
    }

    case 'autocomplete': {
        if (cursor.status !== 'active' && cursor.status !== 'paused') {
            return json({ error: 'Draft is not in progress' }, 400);
        }

        // draft_config.poolIds 기반으로 풀 조회 (URL 길이 제한 우회 위해 100개 청크)
        const poolPlayers = await fetchPoolPlayers(supabase, config, league);
        if (!poolPlayers.length) return json({ error: 'No players in pool' }, 400);

        // 기존 선발 목록
        const { data: draftedRows } = await supabase
            .from('draft_picks')
            .select('player_id')
            .eq('room_id', roomId);
        const draftedSet = new Set<string>((draftedRows ?? []).map((r: any) => r.player_id));

        const pickOrder  = config.pickOrder  as any[];
        const teamCount  = config.teamCount  as number;
        const totalPicks = pickOrder.length;
        let   curIdx     = cursor.currentPickIndex as number;

        const newPickRows: any[]                        = [];
        const rosterAdd: Record<string, string[]>       = {};

        while (curIdx < totalPicks) {
            const entry = pickOrder[curIdx];
            const best  = poolPlayers.find((p: any) => !draftedSet.has(p.id));
            if (!best) break;

            draftedSet.add(best.id);
            const round = Math.floor(curIdx / teamCount) + 1;
            const slot  = (curIdx % teamCount) + 1;

            newPickRows.push({
                room_id:     roomId,
                pick_index:  curIdx,
                round, slot,
                team_id:     entry.teamId,
                user_id:     entry.userId,
                player_id:   best.id,
                player_name: best.name,
                position:    best.position,
                ovr:         (best.base_attributes as any)?.ovr ?? 0,
                picked_at:   nowIso,
            });

            if (!rosterAdd[entry.teamId]) rosterAdd[entry.teamId] = [];
            rosterAdd[entry.teamId].push(best.id);
            curIdx++;
        }

        // draft_picks 일괄 삽입
        if (newPickRows.length > 0) {
            const { error: insertErr } = await supabase
                .from('draft_picks')
                .insert(newPickRows);
            if (insertErr) return json({ error: insertErr.message }, 500);
        }

        // league_teams.roster 갱신
        for (const [teamId, additions] of Object.entries(rosterAdd)) {
            const { data: team } = await supabase
                .from('league_teams')
                .select('roster')
                .eq('room_id', roomId)
                .eq('team_slug', teamId)
                .single();
            if (team) {
                await supabase
                    .from('league_teams')
                    .update({ roster: [...(team.roster ?? []), ...additions] })
                    .eq('room_id', roomId)
                    .eq('team_slug', teamId);
            }
        }

        // draft_cursor 완료 처리
        const { pausedAt: _pa, ...cursorForComplete } = cursor;
        await supabase.from('rooms').update({
            draft_cursor: {
                ...cursorForComplete,
                status:               'completed',
                currentPickIndex:     totalPicks,
                currentPickStartedAt: null,
            },
        }).eq('id', roomId);

        // 시즌 일정/브라켓 생성 및 leagues.status='in_progress' 전환은 클라이언트의
        // finalizeDraft(draftFinalizer.ts)가 draft_cursor.status==='completed' 감지 시 단독 처리한다.
        // (여기서 status를 먼저 set하면 finalizeDraft가 멱등성 체크에 걸려 일정 생성을 건너뜀 — main_league 스케줄 미생성 버그)

        return json({ ok: true, completedPicks: curIdx - (cursor.currentPickIndex as number) });
    }

    default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
});

/** draft_config.poolIds 기반으로 선수 풀을 OVR 내림차순으로 반환.
 *  poolIds가 없으면 league.draft_pool 설정에 따라 start-draft와 동일한 필터를 적용.
 *  URL 길이 제한 우회 위해 100개 청크 병렬 쿼리. */
async function fetchPoolPlayers(supabase: any, config: any, league: any): Promise<any[]> {
    const poolIds: string[] = config?.poolIds ?? [];
    if (poolIds.length === 0) {
        const draftPoolRaw: string = (league?.draft_pool ?? 'standard');
        const ovrMin: number = (league?.draft_ovr_min ?? 0);
        const ovrMax: number = (league?.draft_ovr_max ?? 99);
        const draftPools = draftPoolRaw.split(',').map((s: string) => s.trim()).filter(Boolean);

        const seenIds = new Set<string>();
        const all: any[] = [];
        for (const pt of draftPools) {
            let q = supabase.from('meta_players').select('id, name, position, base_attributes');
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
                const ovr = (p.base_attributes as any)?.ovr ?? 0;
                if (pt !== 'rookies' && (ovr < ovrMin || ovr > ovrMax)) continue;
                all.push(p);
            }
        }
        all.sort((a: any, b: any) =>
            ((b.base_attributes as any)?.ovr ?? 0) - ((a.base_attributes as any)?.ovr ?? 0)
        );
        return all;
    }

    const CHUNK = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < poolIds.length; i += CHUNK) {
        chunks.push(poolIds.slice(i, i + CHUNK));
    }
    const results = await Promise.all(
        chunks.map((ids: string[]) =>
            supabase
                .from('meta_players')
                .select('id, name, position, base_attributes')
                .in('id', ids)
        )
    );
    const all: any[] = results.flatMap((r: any) => r.data ?? []);
    all.sort((a: any, b: any) =>
        ((b.base_attributes as any)?.ovr ?? 0) - ((a.base_attributes as any)?.ovr ?? 0)
    );
    return all;
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
