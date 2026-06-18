
/**
 * draft-scheduler — 30초마다 Supabase Cron으로 호출.
 *
 * 네 가지 역할을 통합 처리:
 *  1. 추첨 자동 실행  : lottery_scheduled_at <= now() 이고 draft_order 미배정 리그
 *  2. 드래프트 자동 시작: draft_scheduled_at <= now() 이고 추첨 완료(draft_order 있음) 리그
 *     └─ 원자적 claim: UPDATE WHERE status='recruiting' → count=0이면 다른 틱이 선점, skip
 *  3. 오토픽         : 픽 시간이 초과된 활성 드래프트 방 (status='active' DB 필터 + 방별 try/catch)
 *  4. 완료된 드래프트 시즌 초기화: draft_cursor.status='completed' 원자적 claim 처리
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateSnakePickOrder, generateLinearPickOrder } from '../_shared/multiDraftEngine.ts';
import { mapRawPlayerToRuntimePlayer } from '../_shared/dataMapper.ts';
import { generateSeasonSchedule } from '../_shared/scheduleGenerator.ts';
import { initializeTournamentBracket } from '../_shared/tournamentInitializer.ts';
import { TEAM_DATA } from '../_shared/teamData.ts';

const AI_MIN_THINK_SEC = 3;
const DEFAULT_TOTAL_ROUNDS = 10;
const POOL_QUERY_CHUNK = 100;

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
    const results: any = {
        lotteriesRun:  0,
        draftsStarted: 0,
        autoPicks:     0,
        errors:        [] as string[],
    };

    // ════════════════════════════════════════════════════════════════════════
    // 1. 추첨 자동 실행
    // ════════════════════════════════════════════════════════════════════════
    {
        const { data: lotteryLeagues } = await supabase
            .from('leagues')
            .select('id, admin_user_id')
            .eq('status', 'recruiting')
            .not('lottery_scheduled_at', 'is', null)
            .lte('lottery_scheduled_at', now);

        for (const league of lotteryLeagues ?? []) {
            const { data: room } = await supabase
                .from('rooms')
                .select('id')
                .eq('league_id', league.id)
                .eq('status', 'active')
                .maybeSingle();

            if (!room) continue;

            const { count } = await supabase
                .from('league_teams')
                .select('id', { count: 'exact', head: true })
                .eq('room_id', room.id)
                .not('draft_order', 'is', null);

            if ((count ?? 0) > 0) continue;

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
    // ════════════════════════════════════════════════════════════════════════
    {
        const { data: draftLeagues } = await supabase
            .from('leagues')
            .select('id, draft_total_rounds, draft_pick_duration_sec, draft_pool, draft_pool_strategy, draft_ovr_min, draft_ovr_max')
            .eq('status', 'recruiting')
            .not('draft_scheduled_at', 'is', null)
            .lte('draft_scheduled_at', now);

        for (const league of draftLeagues ?? []) {
            const { data: room } = await supabase
                .from('rooms')
                .select('id, draft_cursor')
                .eq('league_id', league.id)
                .eq('status', 'active')
                .maybeSingle();

            if (!room) continue;

            if ((room.draft_cursor as any)?.status === 'active') continue;

            // Issue 1 수정: 원자적 claim — 이 틱이 처음 'recruiting' → 'drafting' 전환에 성공한 경우만 진행
            // 두 틱이 동시에 조건을 통과해도 PostgreSQL UPDATE의 행 잠금으로 한 틱만 count=1을 얻음
            const { count: startClaim } = await supabase
                .from('leagues')
                .update({ status: 'drafting' })
                .eq('id', league.id)
                .eq('status', 'recruiting')
                .select('id', { count: 'exact', head: true });

            if (!startClaim) continue; // 다른 틱이 이미 선점 → skip

            const { data: teams } = await supabase
                .from('league_teams')
                .select('id, team_slug, team_name, team_abbr, color_primary, color_secondary, user_id, is_ai, draft_order')
                .eq('room_id', room.id)
                .not('draft_order', 'is', null)
                .order('draft_order', { ascending: true });

            if (!teams?.length) continue;

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
                        const mapped = mapRawPlayerToRuntimePlayer(p);
                        if (mapped.ovr >= ovrMin && mapped.ovr <= ovrMax) nonRookieIds.push(p.id);
                    }
                }
            }
            const poolIds = [...nonRookieIds, ...rookieIds];

            const totalRounds     = draft_total_rounds ?? DEFAULT_TOTAL_ROUNDS;
            const pickDurationSec = league.draft_pick_duration_sec ?? 300;
            const format          = draft_pool_strategy === 'linear' ? 'linear' : 'snake';

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

            if (roomErr) {
                // 방 설정 실패 시 claim 롤백 — 다음 틱이 재시도할 수 있도록 'recruiting'으로 복원
                await supabase.from('leagues').update({ status: 'recruiting' }).eq('id', league.id);
                results.errors.push(`start-draft [${league.id}]: ${roomErr.message}`);
            } else {
                results.draftsStarted++;
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3. 오토픽 — 픽 시간 초과된 활성 드래프트 방 처리
    // ════════════════════════════════════════════════════════════════════════
    {
        // Issue 13 수정: DB 레벨에서 active 상태만 필터링 — paused/finalized 방 불필요하게 로드하지 않음
        const { count: activeDraftCount } = await supabase
            .from('rooms')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .filter('draft_cursor->>status', 'eq', 'active');

        if ((activeDraftCount ?? 0) === 0) return json(results);

        const { data: rooms } = await supabase
            .from('rooms')
            .select('id, draft_config, draft_cursor')
            .eq('status', 'active')
            .filter('draft_cursor->>status', 'eq', 'active');

        // Issue 15 수정: 방별 try/catch — 한 방의 오류가 다른 방 오토픽 처리를 중단시키지 않음
        for (const room of rooms ?? []) {
          try {
            const config = room.draft_config as any;
            const cursor = room.draft_cursor as any;

            if (cursor?.status !== 'active') continue;
            if (!config?.pickOrder) continue;

            const firstEntry = config.pickOrder[cursor.currentPickIndex];
            if (!firstEntry) continue;
            const firstElapsed = (Date.now() - new Date(cursor.currentPickStartedAt).getTime()) / 1000;
            if (!firstEntry.isAi && firstElapsed < config.pickDurationSec) continue;
            if ( firstEntry.isAi && firstElapsed < AI_MIN_THINK_SEC)       continue;

            const { data: draftedRows } = await supabase
                .from('draft_picks')
                .select('player_id')
                .eq('room_id', room.id);
            const draftedSet = new Set<string>((draftedRows ?? []).map((r: any) => String(r.player_id)));

            const schedulerPoolIds: string[] = (config.poolIds ?? []).map(String);
            if (schedulerPoolIds.length === 0) continue;

            // URL 길이 제한(Edge Function 내부 네트워크)을 우회하기 위해 청크 단위 병렬 조회
            const chunks: string[][] = [];
            for (let i = 0; i < schedulerPoolIds.length; i += POOL_QUERY_CHUNK) {
                chunks.push(schedulerPoolIds.slice(i, i + POOL_QUERY_CHUNK));
            }
            const chunkResults = await Promise.all(
                chunks.map((ids) =>
                    supabase.from('meta_players').select('id, base_attributes').in('id', ids)
                )
            );
            const rawPool = chunkResults.flatMap((r) => r.data ?? []);
            const poolPlayers = rawPool.sort((a: any, b: any) =>
                ((b.base_attributes as any)?.ovr ?? 0) - ((a.base_attributes as any)?.ovr ?? 0)
            );

            if (!poolPlayers.length) continue;

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

                if (error) {
                    results.errors.push(`auto-pick [${room.id}]: ${error.message}`);
                    break;
                }
                draftedSet.add(String(best.id));
                results.autoPicks++;

                if (!isAiTurn) break;

                const next = newCursor as any;
                if (!next || next.status !== 'active') break;
                activeCursor = { ...next, currentPickStartedAt: new Date(Date.now() - (AI_MIN_THINK_SEC + 1) * 1000).toISOString() };
            }
          } catch (e: any) {
              results.errors.push(`auto-pick [${room.id}]: ${e?.message ?? String(e)}`);
          }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 4. 완료된 드래프트 시즌 초기화 — 원자적 claim으로 경쟁 조건 방지
    //    draft_cursor.status='completed'인 방 탐색 → leagues.status='drafting' 인 리그만 처리
    //    UPDATE WHERE status='drafting' 성공한 단일 스케줄러 틱만 일정/브라켓 생성
    // ════════════════════════════════════════════════════════════════════════
    {
        const { data: completedRooms } = await supabase
            .from('rooms')
            .select('id, league_id, draft_config')
            .eq('status', 'active')
            .filter('draft_cursor->>status', 'eq', 'completed');

        for (const room of completedRooms ?? []) {
            // 원자적 claim: 이 틱이 처음 도달한 경우에만 1개 행이 갱신됨
            const { count: claimCount } = await supabase
                .from('leagues')
                .update({ status: 'in_progress' })
                .eq('id', room.league_id)
                .eq('status', 'drafting')
                .select('id', { count: 'exact', head: true });

            if (!claimCount) continue; // 이미 다른 틱 또는 클라이언트가 처리

            // claim 성공 → 시즌 초기화 진행
            const { data: league } = await supabase
                .from('leagues')
                .select('id, type, season_start_date, season_end_date, tournament_start_at, tournament_format, match_format, finals_match_format')
                .eq('id', room.league_id)
                .single();

            if (!league) {
                results.errors.push(`finalize [${room.league_id}]: league not found`);
                continue;
            }

            const { data: leagueTeams } = await supabase
                .from('league_teams')
                .select('team_slug, roster')
                .eq('room_id', room.id);

            if (!leagueTeams?.length) {
                results.errors.push(`finalize [${room.league_id}]: no league teams`);
                continue;
            }

            // 로스터 상태 구성
            const rosterState: Record<string, { condition: number }> = {};
            for (const team of leagueTeams) {
                for (const playerId of (team.roster ?? [])) {
                    rosterState[playerId] = { condition: 100 };
                }
            }

            const nowDate = new Date();
            const today = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;

            const tournamentStartIso = league.type === 'tournament' ? (league.tournament_start_at ?? null) : null;
            const seasonStartDate    = tournamentStartIso ? tournamentStartIso.slice(0, 10) : today;
            const startUtcHour       = tournamentStartIso ? new Date(tournamentStartIso).getUTCHours()   : 1;
            const startUtcMinute     = tournamentStartIso ? new Date(tournamentStartIso).getUTCMinutes() : 0;

            const adminDurDays = (() => {
                if (league.season_start_date && league.season_end_date) {
                    return Math.max(7, Math.round(
                        (new Date(league.season_end_date).getTime() - new Date(league.season_start_date).getTime()) / 86_400_000,
                    ));
                }
                return 14;
            })();
            const endD = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + adminDurDays);
            const computedSeasonEndDate = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;

            let schedule: any[];
            let bracketData: { series: any[]; schedule: any[] } | null = null;

            if (league.type === 'tournament') {
                const tendencySeed = `${room.league_id}-${seasonStartDate}`;
                const result = initializeTournamentBracket(
                    leagueTeams as any,
                    league.tournament_format ?? null,
                    league.match_format ?? null,
                    league.finals_match_format ?? null,
                    tendencySeed,
                    seasonStartDate,
                    startUtcHour,
                    startUtcMinute,
                );
                schedule    = result.schedule;
                bracketData = result;
            } else {
                // main_league: 정규시즌 일정 생성
                const teamSlugs = new Set(leagueTeams.map((t: any) => t.team_slug));
                const filteredTeamData = Object.fromEntries(
                    Object.entries(TEAM_DATA).filter(([slug]) => teamSlugs.has(slug)),
                );
                const seasonYear = parseInt(seasonStartDate.slice(0, 4), 10);
                schedule = generateSeasonSchedule(
                    {
                        seasonYear,
                        seasonStart:      seasonStartDate,
                        regularSeasonEnd: computedSeasonEndDate,
                        allStarStart:     `${seasonYear + 1}-02-13`,
                        allStarEnd:       `${seasonYear + 1}-02-18`,
                    },
                    filteredTeamData as any,
                );
                // scheduledAt 주입: 시즌 날짜 → 실제 벽시계 시간 (30분 슬롯, KST 10:00~)
                injectScheduledAt(schedule, seasonStartDate, computedSeasonEndDate);
            }

            // 브라켓 저장 (토너먼트)
            if (bracketData) {
                const { error: bracketErr } = await supabase
                    .from('leagues')
                    .update({ bracket_data: bracketData })
                    .eq('id', room.league_id);
                if (bracketErr) {
                    results.errors.push(`finalize bracket [${room.league_id}]: ${bracketErr.message}`);
                    continue;
                }
            }

            // 방 저장: 로스터 + 일정 + 시작일
            const { error: roomErr } = await supabase
                .from('rooms')
                .update({
                    roster_state:   rosterState,
                    schedule:       schedule,
                    sim_date:       seasonStartDate,
                    // 완료 마킹: 다음 틱에서 재처리 방지
                    draft_cursor:   { status: 'finalized', finalizedAt: new Date().toISOString() },
                })
                .eq('id', room.id);

            if (roomErr) {
                results.errors.push(`finalize save [${room.league_id}]: ${roomErr.message}`);
            } else {
                (results as any).draftsFinalized = ((results as any).draftsFinalized ?? 0) + 1;
            }
        }
    }

    return json(results);
});

// ── 헬퍼: 시즌 날짜를 실제 벽시계 scheduledAt으로 변환 ─────────────────────────
// 멀티플레이어 리그의 압축된 일정(82게임 → 수주)을 실제 UTC 타임스탬프에 매핑한다.

const REGULAR_DAYS_BY_WEEK = [5, 10, 16, 20] as const;

function computeSlotTime(leagueStartDate: string, realDay: number, slotInDay: number): string {
    const [y, m, d] = leagueStartDate.split('-').map(Number);
    const baseMs = Date.UTC(y, m - 1, d, 1, 0, 0, 0); // 10:00 KST
    return new Date(baseMs + realDay * 86_400_000 + slotInDay * 30 * 60_000).toISOString();
}

function injectScheduledAt(schedule: any[], leagueStartDate: string, seasonEndDate: string): void {
    const totalDays = Math.round(
        (new Date(seasonEndDate).getTime() - new Date(leagueStartDate).getTime()) / 86_400_000,
    );
    const weeks = Math.min(4, Math.max(1, Math.round(totalDays / 7)));
    const regularDays = REGULAR_DAYS_BY_WEEK[weeks - 1];
    // Issue 8 수정: 82 하드코딩 대신 실제 고유 경기 날짜 수 기준으로 슬롯 계산
    const uniqueDates = [...new Set(schedule.map((g: any) => g.date as string))].sort();
    const gameDaysPerRealDay = Math.ceil(uniqueDates.length / regularDays);
    const dateToSlot = new Map<string, string>();
    uniqueDates.forEach((date, i) => {
        dateToSlot.set(date, computeSlotTime(leagueStartDate, Math.floor(i / gameDaysPerRealDay), i % gameDaysPerRealDay));
    });

    for (const game of schedule) {
        game.scheduledAt = dateToSlot.get(game.date);
    }
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
