
/**
 * draft-scheduler — 30초마다 Supabase Cron으로 호출.
 *
 * 세 가지 역할을 통합 처리:
 *  1. 추첨 자동 실행  : lottery_scheduled_at <= now() 이고 draft_order 미배정 리그
 *  2. 드래프트 자동 시작: draft_scheduled_at <= now() 이고 추첨 완료(draft_order 있음) 리그
 *  3. 오토픽         : 픽 시간이 초과된 활성 드래프트 방
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateSnakePickOrder, generateLinearPickOrder } from '../_shared/multiDraftEngine.ts';
import { mapRawPlayerToRuntimePlayer } from '../_shared/dataMapper.ts';

const AI_MIN_THINK_SEC = 3;
const DEFAULT_TOTAL_ROUNDS = 10;

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

    const now = new Date().toISOString();
    const results = {
        lotteriesRun:  0,
        draftsStarted: 0,
        autoPicks:     0,
        errors:        [] as string[],
    };

    // ════════════════════════════════════════════════════════════════════════
    // 1. 추첨 자동 실행
    //    조건: lottery_scheduled_at <= now, status = 'recruiting',
    //          해당 room에 draft_order 배정된 팀이 0개
    // ════════════════════════════════════════════════════════════════════════
    {
        const { data: lotteryLeagues } = await supabase
            .from('leagues')
            .select('id, admin_user_id')
            .eq('status', 'recruiting')
            .not('lottery_scheduled_at', 'is', null)
            .lte('lottery_scheduled_at', now);

        for (const league of lotteryLeagues ?? []) {
            // 해당 리그의 방 조회
            const { data: room } = await supabase
                .from('rooms')
                .select('id')
                .eq('league_id', league.id)
                .eq('status', 'active')
                .maybeSingle();

            if (!room) continue;

            // 이미 draft_order가 배정된 팀이 있는지 확인
            const { count } = await supabase
                .from('league_teams')
                .select('id', { count: 'exact', head: true })
                .eq('room_id', room.id)
                .not('draft_order', 'is', null);

            if ((count ?? 0) > 0) continue; // 이미 추첨됨

            const { error } = await supabase.rpc('run_draft_lottery', {
                p_room_id:  room.id,
                p_admin_id: league.admin_user_id,
            });

            if (error) {
                if (!error.message.includes('lottery_already_done')) {
                    results.errors.push(`lottery [${league.id}]: ${error.message}`);
                }
            } else {
                results.lotteriesRun++;
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2. 드래프트 자동 시작
    //    조건: draft_scheduled_at <= now, status = 'recruiting',
    //          해당 room에 draft_order 배정된 팀이 1개 이상 (추첨 완료)
    //          + draft_cursor.status !== 'active' (미시작)
    //    개선 (2026-06): draft_state(레거시) 대신 draft_config + draft_cursor 생성
    //    (start-draft EF와 동일 포맷 — AI 슬롯 채우기 + OVR 범위 필터 포함)
    // ════════════════════════════════════════════════════════════════════════
    {
        const { data: draftLeagues } = await supabase
            .from('leagues')
            .select('id, draft_total_rounds, draft_pick_duration_sec, draft_pool, draft_pool_strategy, draft_ovr_min, draft_ovr_max')
            .eq('status', 'recruiting')
            .not('draft_scheduled_at', 'is', null)
            .lte('draft_scheduled_at', now);

        for (const league of draftLeagues ?? []) {
            // 방 + draft_cursor 조회
            const { data: room } = await supabase
                .from('rooms')
                .select('id, draft_cursor')
                .eq('league_id', league.id)
                .eq('status', 'active')
                .maybeSingle();

            if (!room) continue;

            // 이미 드래프트 진행 중이면 스킵 (신 아키텍처: draft_cursor)
            if ((room.draft_cursor as any)?.status === 'active') continue;

            // draft_order가 배정된 팀 조회 (추첨 완료 확인)
            const { data: teams } = await supabase
                .from('league_teams')
                .select('id, team_slug, team_name, team_abbr, color_primary, color_secondary, user_id, is_ai, draft_order')
                .eq('room_id', room.id)
                .not('draft_order', 'is', null)
                .order('draft_order', { ascending: true });

            if (!teams?.length) continue; // 추첨 미완료

            // ── user_id 미배정 팀 → AI 슬롯으로 채우기 (start-draft와 동일 패턴) ──
            const unassigned = teams.filter((t: any) => !t.user_id);
            if (unassigned.length > 0) {
                const { count: existingAiCount } = await supabase
                    .from('room_members')
                    .select('user_id', { count: 'exact', head: true })
                    .eq('room_id', room.id)
                    .eq('is_ai', true);

                const newAiMembers: any[] = [];
                const leagueTeamUpdates: { id: string; userId: string }[] = [];
                let n = existingAiCount ?? 0;

                for (const t of unassigned) {
                    n += 1;
                    const userId = `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
                    newAiMembers.push({
                        room_id:              room.id,
                        user_id:              userId,
                        team_id:              t.team_slug,
                        team_name:            t.team_name,
                        team_abbr:            t.team_abbr,
                        team_color_primary:   t.color_primary,
                        team_color_secondary: t.color_secondary,
                        is_ai:                true,
                        ai_gm_personality:    'balanced',
                    });
                    leagueTeamUpdates.push({ id: t.id, userId });
                    t.user_id = userId;
                    t.is_ai   = true;
                }

                const { error: aiErr } = await supabase
                    .from('room_members')
                    .upsert(newAiMembers, { onConflict: 'room_id,user_id' });

                if (aiErr) {
                    results.errors.push(`start-draft ai-fill [${league.id}]: ${aiErr.message}`);
                    continue;
                }
                await Promise.all(leagueTeamUpdates.map(({ id, userId }) =>
                    supabase.from('league_teams').update({ user_id: userId, is_ai: true }).eq('id', id)
                ));
            }

            // ── 드래프트 선수 풀 구성 (start-draft와 동일: 다중 풀 유형 + OVR 범위) ──
            const { draft_total_rounds, draft_pool_strategy, draft_ovr_min, draft_ovr_max } = league as any;
            const draftPoolRaw   = league.draft_pool ?? 'standard';
            const draftPoolTypes = draftPoolRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
            const ovrMin = draft_ovr_min ?? 0;
            const ovrMax = draft_ovr_max ?? 99;

            const seenPoolIds = new Set<string>();
            const nonRookieIds: string[] = [];
            const rookieIds: string[] = [];
            for (const pt of draftPoolTypes) {
                let q = supabase.from('meta_players').select('id, position, base_attributes');
                if (pt === 'standard') {
                    q = (q as any).eq('in_multi_pool', true).lt('draft_year', 2026).not('base_team_id', 'is', null);
                } else if (pt === 'alltime') {
                    q = (q as any).eq('in_multi_pool', true).eq('include_alltime', true).lt('draft_year', 2026);
                } else {
                    q = (q as any).eq('draft_year', 2026);
                }
                const { data: pts } = await q;
                for (const p of pts ?? []) {
                    if (seenPoolIds.has(p.id)) continue;
                    seenPoolIds.add(p.id);
                    if (pt === 'rookies') {
                        rookieIds.push(p.id);
                    } else {
                        // start-draft와 동일한 OVR 산출 방식 (base_attributes.ovr 직접 참조 시 alltime custom_overrides 미반영되어 풀 구성이 어긋남)
                        const mapped = mapRawPlayerToRuntimePlayer(p);
                        if (mapped.ovr >= ovrMin && mapped.ovr <= ovrMax) nonRookieIds.push(p.id);
                    }
                }
            }
            const poolIds = [...nonRookieIds, ...rookieIds];

            const totalRounds     = draft_total_rounds ?? DEFAULT_TOTAL_ROUNDS;
            const pickDurationSec = league.draft_pick_duration_sec ?? 300;
            const format          = draft_pool_strategy === 'linear' ? 'linear' : 'snake';

            // teams의 draft_order 순서대로 pickOrder 생성 (run_draft_lottery가 부여한 순서 유지)
            const orderedTeams = teams.map((t: any) => ({
                userId: t.user_id,
                teamId: t.team_slug,
                isAi:   t.is_ai === true,
            }));

            const pickOrder = format === 'linear'
                ? generateLinearPickOrder(orderedTeams, totalRounds)
                : generateSnakePickOrder(orderedTeams, totalRounds);

            const draftConfig = {
                format,
                totalRounds,
                pickDurationSec,
                teamCount:       orderedTeams.length,
                poolIds,
                pickOrder,
            };

            const draftCursor = {
                status:               'active',
                currentPickIndex:     0,
                currentPickStartedAt: new Date().toISOString(),
            };

            const { error: roomErr } = await supabase
                .from('rooms')
                .update({ draft_config: draftConfig, draft_cursor: draftCursor, draft_state: null })
                .eq('id', room.id);

            const { error: leagueErr } = await supabase
                .from('leagues')
                .update({ status: 'drafting' })
                .eq('id', league.id);

            if (roomErr || leagueErr) {
                results.errors.push(`start-draft [${league.id}]: ${roomErr?.message ?? leagueErr?.message}`);
            } else {
                results.draftsStarted++;
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3. 오토픽 — 픽 시간 초과된 활성 드래프트 방 처리
    //    신 아키텍처: draft_config + draft_cursor + draft_picks 테이블 사용
    //    (draft_state JSONB는 레거시 — start-draft v10 이후 사용 안 함)
    // ════════════════════════════════════════════════════════════════════════
    {
        // draft_config(대용량 JSONB) 조회 전 count 사전 체크 — 드래프트 없으면 즉시 스킵
        const { count: activeDraftCount } = await supabase
            .from('rooms')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .not('draft_cursor', 'is', null);

        if ((activeDraftCount ?? 0) === 0) return json(results);

        const { data: rooms } = await supabase
            .from('rooms')
            .select('id, draft_config, draft_cursor')
            .eq('status', 'active')
            .not('draft_cursor', 'is', null);

        for (const room of rooms ?? []) {
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

            const schedulerPoolIds: string[] = (config.poolIds ?? []).map(String);
            if (schedulerPoolIds.length === 0) continue;

            const { data: rawPool } = await supabase
                .from('meta_players')
                .select('id, base_attributes')
                .in('id', schedulerPoolIds);
            const poolPlayers = (rawPool ?? []).sort((a: any, b: any) =>
                ((b.base_attributes as any)?.ovr ?? 0) - ((a.base_attributes as any)?.ovr ?? 0)
            );

            if (!poolPlayers.length) continue;

            // AI 연속 픽 루프 — 다음 인간 턴이 나올 때까지 같은 사이클 안에서 연속 처리.
            // 인간 타임아웃(첫 번째 픽)은 한 번만 처리 후 종료.
            let activeCursor = cursor;
            const MAX_AUTO_PICKS = 60; // 한 사이클 상한 (전체 픽수: 팀수×라운드)

            for (let pickLoop = 0; pickLoop < MAX_AUTO_PICKS; pickLoop++) {
                const entry = config.pickOrder[activeCursor.currentPickIndex];
                if (!entry) break;

                const isAiTurn   = entry.isAi === true;
                const elapsed    = (Date.now() - new Date(activeCursor.currentPickStartedAt).getTime()) / 1000;

                if (!isAiTurn && elapsed < config.pickDurationSec) break;
                if ( isAiTurn && elapsed < AI_MIN_THINK_SEC)       break;

                const best = poolPlayers.find((p: any) => !draftedSet.has(String(p.id)));
                if (!best) break;

                const { data: newCursor, error } = await supabase.rpc('submit_draft_pick_v2', {
                    p_room_id:   room.id,
                    p_player_id: best.id,
                    p_user_id:   entry.userId,
                });

                if (error) {
                    results.errors.push(`auto-pick [${room.id}]: ${error.message}`);
                    break;
                }
                draftedSet.add(String(best.id)); // 로컬 Set 갱신 — DB 재조회 불필요
                results.autoPicks++;

                if (!isAiTurn) break;

                const next = newCursor as any;
                if (!next || next.status !== 'active') break;
                // 연속 AI 픽: elapsed 체크를 통과하도록 시작 시각을 과거로 설정
                activeCursor = { ...next, currentPickStartedAt: new Date(Date.now() - (AI_MIN_THINK_SEC + 1) * 1000).toISOString() };
            }
        }
    }

    return json(results);
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
