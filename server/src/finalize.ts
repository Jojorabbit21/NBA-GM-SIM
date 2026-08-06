/**
 * finalize.ts — 드래프트 완료 후 시즌 초기화.
 *
 * draft-scheduler EF 섹션4를 Bun 서버로 이식.
 * leagues.status: 'drafting' → 'in_progress' 원자적 claim으로 중복 처리 방지.
 * 호출자: DraftRoom.onCompleted() (dynamic import)
 */
import { supabase } from './supabaseAdmin';
import { generateSeasonSchedule } from './shared/scheduleGenerator';
import { compressLeagueSchedule } from './shared/leagueScheduleCompressor';
import { initializeTournamentBracket } from './shared/tournamentInitializer';
import { TEAM_DATA } from './shared/teamData';
import { mapRawPlayerToRuntimePlayer, buildTeamForSim } from './shared/dataMapper';
import { generateAutoTactics } from './shared/game/tactics/tacticGenerator';
import { refetchGameConfig } from './shared/services/admin/gameConfigService';
import { getOrComputeDraftPoolMuLeague } from './shared/engine/pbp/leagueNormalization';
import { SIM_CONFIG } from './shared/game/config/constants';
import type { TacticalSliders } from './shared/types/tactics';

// URL에 노출되는 게임 ID(T_R1_M0_G1 등)를 대체하는 짧은 코드 — services/multi/leagueService.ts의
// 리그 코드와 동일한 알파벳/길이(client 미러, server는 별도 빌드 컨텍스트라 중복 정의).
// [2026-08-01] game_pbp/game_sim_claims/tournament_game_log 등의 실제 저장 키(game_id)는
// 그대로 유지 — game_short_codes는 라우팅 전용 매핑 테이블일 뿐, 이 함수가 실패해도(로그만 남기고)
// finalize 전체를 막지 않는다(경기 URL이 짧은 코드 대신 원래 game_id로 폴백 가능하도록 설계됨).
const SHORT_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
function generateShortCode(length = 8): string {
    let code = '';
    for (let i = 0; i < length; i++) {
        code += SHORT_CODE_ALPHABET[Math.floor(Math.random() * SHORT_CODE_ALPHABET.length)];
    }
    return code;
}

// [2026-08-03] export — simRunner.ts의 advanceTournamentState()가 새 라운드 경기를 생성할 때도
// 재사용한다. 기존엔 이 함수가 finalize 시점(1라운드 일정)에만 호출돼, 2라운드 이상 경기는
// 숏코드가 영원히 안 생겨 URL이 원래 game_id로 계속 노출되는 문제가 있었음.
export async function insertGameShortCodes(roomId: string, schedule: { id: string }[]): Promise<void> {
    if (schedule.length === 0) return;
    const seen = new Set<string>();
    const rows = schedule.map(g => {
        let code = generateShortCode();
        while (seen.has(code)) code = generateShortCode(); // 같은 배치 내 중복만 방지(DB unique 제약이 최종 방어선)
        seen.add(code);
        return { room_id: roomId, game_id: g.id, short_code: code };
    });
    const { error } = await supabase.from('game_short_codes').insert(rows);
    if (error) {
        console.error(`[finalize] game_short_codes insert 실패(${roomId}) — 경기 URL은 원래 game_id로 폴백됨: ${error.message}`);
    }
}

// [migration 2026-08-06] rooms.schedule JSONB 대신 games 테이블에 일괄 삽입.
// 순수 함수(initializeTournamentBracket / generateSeasonSchedule)가 만든 camelCase Game[]을
// snake_case row로 변환하는 유일한 경계 — 서버 쪽 매핑은 여기 하나만 유지한다.
// simRunner.ts의 handleTournamentAdvance()가 새 라운드 경기를 삽입할 때도 재사용한다.
export interface ScheduleGameLike {
    id: string; homeTeamId: string; awayTeamId: string; date: string;
    time?: string; game_seq?: number; scheduledAt?: string;
    played?: boolean; isPlayoff?: boolean; seriesId?: string;
}

export async function insertGames(
    roomId: string, leagueId: string, games: ScheduleGameLike[],
): Promise<{ error: string | null }> {
    if (games.length === 0) return { error: null };
    const rows = games.map(g => ({
        room_id: roomId, league_id: leagueId, game_id: g.id,
        home_team_id: g.homeTeamId, away_team_id: g.awayTeamId,
        game_date: g.date, game_time: g.time ?? null,
        game_seq: g.game_seq ?? null, scheduled_at: g.scheduledAt ?? null,
        played: false, is_playoff: g.isPlayoff ?? false, series_id: g.seriesId ?? null,
    }));
    // 정규시즌은 ~1230경기가 될 수 있음 — tournament_game_log 배치 삽입(archiver)과 동일하게 500개씩.
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('games')
            .upsert(rows.slice(i, i + 500), { onConflict: 'room_id,game_id', ignoreDuplicates: true });
        if (error) return { error: error.message };
    }
    return { error: null };
}

// 멀티플레이어 AI 팀 전용 — 로스터 기반 계산값 대신 모든 슬라이더를 중간값(5)으로 고정한다.
// 사람 팀/싱글플레이어 CPU는 영향받지 않음(generateAutoTactics()의 기본 계산 결과를 그대로 씀).
// [2026-08-01 Fix] pnrDefense는 다른 슬라이더와 달리 0~10이 아니라 0~2 스케일(0=Drop,1=Hedge,
// 2=Blitz, types/tactics.ts 참조) — 여기서 다른 슬라이더처럼 5로 넣으면 possessionHandler.ts의
// Math.min(2, Math.round(sliders.pnrDefense))에 걸려 무조건 index 2(Blitz 70%)로 클램프됨.
// 멀티플레이어 AI 팀 전체가 항상 최고 강도 더블팀 커버리지로 고정되면서 PnR_Roll/PnR_Pop
// hitRate 보너스가 의도(index 1, Hedge 60% 중심)의 약 2배로 뻥튀기되고 있었음 — DEFAULT_SLIDERS와
// 동일하게 1(Hedge 밸런스)로 수정.
const MIDDLE_SLIDERS: TacticalSliders = {
    pace: 5, ballMovement: 5, offReb: 5,
    insideOut: 5, pnrFreq: 5,
    shot_3pt: 5, shot_mid: 5, shot_rim: 5,
    defIntensity: 5, helpDef: 5, switchFreq: 5, defReb: 5, zoneFreq: 5, pnrDefense: 1,
    fullCourtPress: 5, zoneUsage: 5,
};

/**
 * 시뮬레이션 실시각 계산의 기준점(game_seq=0)을 결정한다.
 * tournamentStart(유저가 지정한 토너먼트 시작 시:분)가 아직 미래 시각이면 그 값을 그대로 쓰고,
 * 없거나 이미 지난 시각이면(드래프트가 늦게 끝나는 경우 등) 지금을 10분 단위로 반올림해 사용한다.
 */
function resolveSimRealStartAt(tournamentStart: string | null, nowDate: Date): string {
    if (tournamentStart) {
        const target = new Date(tournamentStart).getTime();
        if (target > nowDate.getTime()) return new Date(target).toISOString();
    }
    return new Date(Math.round(nowDate.getTime() / 600_000) * 600_000).toISOString();
}

/**
 * 드래프트 완료 직후 각 팀(사람/AI 모두)의 뎁스차트/로테이션/팀 전술을 자동 생성해
 * room_members.tactics + depth_chart에 최초 저장한다.
 * [Fix 2026-07-26] preserveDraftOrder=false — 드래프트 픽 순서가 아니라 항상 OVR 내림차순으로
 * 뎁스차트를 채운다. 이전엔 true였는데, 그러면 낮은 OVR 선수를 먼저 뽑았다는 이유만으로 나중에
 * 뽑은 더 높은 OVR의 동포지션 선수를 밀어내고 주전을 차지하는 버그가 있었다.
 * 이후 유저가 전술 화면에서 직접 수정하면 그 값으로 덮어써진다 — 여기서는 "빈 값" 상태를 없애는 최초 seed일 뿐이다.
 */
async function initializeTeamTactics(
    roomId: string,
    leagueTeams: { team_slug: string; team_name: string; roster: string[]; user_id: string | null }[],
    rosterState: Record<string, any>,
): Promise<void> {
    const allPlayerIds = leagueTeams.flatMap(t => t.roster ?? []);
    if (allPlayerIds.length === 0) return;

    // [Fix 2026-07-26] league_teams.user_id는 auth.users FK 제약 때문에 AI 팀에서는 항상
    // null로 남는다(가짜 UUID를 못 씀 — buildDraftSetup 참조). 그래서 team_slug → 실제 담당
    // userId(사람/AI 공통) 매핑은 FK 제약 없는 room_members에서 가져온다 — 이걸 안 하면 AI
    // 팀은 전부 뎁스차트/전술 시드 자체가 안 생긴다.
    const { data: members } = await supabase
        .from('room_members')
        .select('team_id, user_id, is_ai')
        .eq('room_id', roomId);
    const userIdByTeamSlug = new Map<string, string>();
    const isAiByTeamSlug = new Map<string, boolean>();
    for (const m of members ?? []) {
        if (m.team_id && m.user_id) userIdByTeamSlug.set(m.team_id, m.user_id);
        if (m.team_id) isAiByTeamSlug.set(m.team_id, !!m.is_ai);
    }

    const { data: rawPlayers } = await supabase
        .from('meta_players')
        .select('id, name, position, base_attributes, tendencies')
        .in('id', allPlayerIds);

    const playerMap = new Map<string, any>();
    for (const raw of rawPlayers ?? []) {
        playerMap.set(String(raw.id), mapRawPlayerToRuntimePlayer(raw));
    }

    const updates = leagueTeams
        .map(lt => ({ lt, userId: userIdByTeamSlug.get(lt.team_slug) }))
        .filter((x): x is { lt: typeof leagueTeams[number]; userId: string } => !!x.userId)
        .map(({ lt, userId }) => {
            const team = buildTeamForSim(lt, playerMap, rosterState);
            const tactics = generateAutoTactics(team, undefined, false);
            // AI 팀은 로스터 기반 계산 슬라이더 대신 중간값으로 고정 — 뎁스차트/로테이션은 그대로 유지.
            if (isAiByTeamSlug.get(lt.team_slug)) {
                tactics.sliders = { ...MIDDLE_SLIDERS };
            }
            return { userId, tactics, depthChart: tactics.depthChart ?? null };
        });

    await Promise.all(updates.map(u =>
        supabase
            .from('room_members')
            .update({ tactics: u.tactics, depth_chart: u.depthChart })
            .eq('room_id', roomId)
            .eq('user_id', u.userId),
    ));
}

/**
 * 리그 상대 정규화(league-normalization.md) 컨텍스트를 드래프트 완료 시점에 계산해
 * rooms.sim_settings.leagueContext에 캐싱한다. muLeague는 "이번에 실제로 뽑힌 로스터"가
 * 아니라 "드래프트 풀 자체"(뽑힐 수 있었던 후보군) 기준으로 계산한다 — 같은 풀 설정
 * (draftPool/ovrMin/ovrMax/팀수)을 쓰는 리그는 항상 같은 값을 쓰게 되어, 방마다 실제
 * 드래프트 결과(어느 팀이 더 세게 뽑혔는지)에 따라 압축 강도가 들쭉날쭉해지는 것을 막는다.
 * getOrComputeDraftPoolMuLeague()가 프로세스 메모리에 캐싱하므로 같은 풀 설정을 쓰는
 * 리그가 여러 개 생겨도 최초 1회만 실제 계산(meta_players 조회)이 일어난다.
 * simRunner.ts는 매 경기 이 캐시된 값만 읽으므로 게임 시뮬레이션 시점엔 계산이 없다.
 */
async function applyLeagueNormalization(
    roomId: string,
    league: { draft_pool?: string | null; draft_ovr_min?: number | null; draft_ovr_max?: number | null },
    teamCount: number,
): Promise<void> {
    const draftPoolRaw = league.draft_pool ?? 'standard';
    const ovrMin = league.draft_ovr_min ?? 0;
    const ovrMax = league.draft_ovr_max ?? 99;
    const cacheKey = `${draftPoolRaw}|${ovrMin}|${ovrMax}|${teamCount}`;

    const muLeague = await getOrComputeDraftPoolMuLeague(cacheKey, teamCount, async () => {
        // buildDraftSetup()(startDraft.ts)의 풀 필터 로직과 동일하게 유지할 것 — 여기서 계산하는
        // muLeague가 "실제 드래프트 가능한 후보군"을 정확히 대표하려면 필터가 어긋나면 안 된다.
        const draftPools = draftPoolRaw.split(',').map((s: string) => s.trim());
        const applyCustomOverrides = draftPools.includes('alltime');
        const seenIds = new Set<string>();
        const ovrs: number[] = [];

        for (const pt of draftPools) {
            let q = supabase.from('meta_players').select('id, base_attributes');
            if (pt === 'standard') {
                q = (q as any).eq('in_multi_pool', true).lt('draft_year', 2026).not('base_team_id', 'is', null);
            } else if (pt === 'alltime') {
                q = (q as any).eq('in_multi_pool', true).eq('include_alltime', true).lt('draft_year', 2026);
            } else {
                q = (q as any).eq('draft_year', 2026);
            }
            const { data: poolData } = await q;
            for (const p of poolData ?? []) {
                if (seenIds.has(String(p.id))) continue;
                seenIds.add(String(p.id));
                const mapped = mapRawPlayerToRuntimePlayer(p, applyCustomOverrides);
                // 루키는 buildDraftSetup()에서도 ovr 필터 없이 무조건 풀에 포함되므로 동일하게 처리.
                if (pt === 'rookies' || (mapped.ovr >= ovrMin && mapped.ovr <= ovrMax)) {
                    ovrs.push(mapped.ovr);
                }
            }
        }
        return ovrs;
    });

    const leagueContext = {
        muRef: SIM_CONFIG.NORMALIZATION.MU_REF,
        muLeague,
        k: SIM_CONFIG.NORMALIZATION.DEFAULT_K,
    };

    const { data: roomRow } = await supabase.from('rooms').select('sim_settings').eq('id', roomId).single();
    await supabase.from('rooms').update({
        sim_settings: { ...(roomRow?.sim_settings as any ?? {}), leagueContext },
    }).eq('id', roomId);

    console.log(`[finalize] room ${roomId} — league normalization cached (muLeague=${muLeague.toFixed(1)})`);
}

/**
 * claim 없이 강제로 브라켓/스케줄 생성.
 * 이미 in_progress이지만 schedule이 null인 리그 복구용.
 */
export async function forceInitSchedule(roomId: string): Promise<{ ok: boolean; error?: string }> {
    const { data: room } = await supabase
        .from('rooms')
        .select('id, league_id, draft_cursor')
        .eq('id', roomId)
        .single();

    if (!room) return { ok: false, error: 'room not found' };
    // [migration 2026-08-06] rooms.schedule 존재 여부 대신 games 테이블 행 수로 판정.
    const { count: existingGames } = await supabase
        .from('games').select('game_id', { count: 'exact', head: true }).eq('room_id', roomId);
    if ((existingGames ?? 0) > 0) return { ok: false, error: 'schedule already exists' };

    const { data: league } = await supabase
        .from('leagues')
        .select('id, type, season_start_date, season_end_date, tournament_start_at, tournament_format, match_format, finals_match_format, games_per_real_day, draft_pool, draft_ovr_min, draft_ovr_max, duration_weeks, daily_window_start_min, daily_window_end_min, virtual_season_year')
        .eq('id', room.league_id)
        .single();

    if (!league) return { ok: false, error: 'league not found' };

    const { data: leagueTeams } = await supabase
        .from('league_teams')
        .select('team_slug, team_name, roster, user_id')
        .eq('room_id', roomId);

    if (!leagueTeams?.length) return { ok: false, error: 'no league teams' };

    const rosterState: Record<string, { condition: number }> = {};
    for (const team of leagueTeams) {
        for (const playerId of (team.roster ?? [])) {
            rosterState[playerId] = { condition: 100 };
        }
    }

    // 리그 생성(강제 스케줄 초기화) 시점의 최신 아키타입 가중치/태그를 강제로 다시 받아온다.
    await refetchGameConfig().catch(err => console.error('[finalize:force] refetchGameConfig failed:', err));
    await initializeTeamTactics(roomId, leagueTeams as any, rosterState);
    await applyLeagueNormalization(roomId, league, leagueTeams.length)
        .catch(err => console.error('[finalize:force] applyLeagueNormalization failed:', err));

    const nowDate         = new Date();
    const tournamentStart = league.type === 'tournament' ? (league.tournament_start_at ?? null) : null;
    const seasonStartDate = tournamentStart ? tournamentStart.slice(0, 10) : nowDate.toISOString().slice(0, 10);
    // 토너먼트는 유저가 지정한 시:분(tournament_start_at)을 시뮬레이션 시각의 기준점(game_seq=0)으로
    // 그대로 사용한다 — 이미 지난 시각이면(드래프트가 늦게 끝나는 등) 지금 시각을 10분 단위로 반올림해 사용.
    // 메인리그는 tournamentStart가 없으므로 항상 "지금(10분 단위 반올림)"이 리그 실제 시작 시각이 된다.
    const simRealStartAt = resolveSimRealStartAt(tournamentStart, nowDate);
    // 토너먼트 경기 간 간격(기본 30분) — games_per_real_day로 환산해 저장(어드민 설정값 없으면 기본치를 그대로 확정)
    const gamesPerRealDay = league.games_per_real_day ?? 48;
    const intervalMinutes = 1440 / gamesPerRealDay;

    let schedule: any[];
    let bracketData: { series: any[]; schedule: any[] } | null = null;

    if (league.type === 'tournament') {
        const result = initializeTournamentBracket(
            leagueTeams as any,
            league.tournament_format ?? null,
            league.match_format ?? null,
            league.finals_match_format ?? null,
            `${room.league_id}-${seasonStartDate}`,
            seasonStartDate,
            intervalMinutes,
            simRealStartAt,
        );
        schedule    = result.schedule;
        bracketData = result;
    } else {
        const teamSlugs = new Set(leagueTeams.map((t: any) => t.team_slug));
        const filteredTeamData = Object.fromEntries(
            Object.entries(TEAM_DATA).filter(([slug]) => teamSlugs.has(slug)),
        );
        // 가상 NBA 시즌 캘린더는 관리자 설정과 무관하게 항상 고정된 현실적인 길이(약 175일,
        // All-Star 브레이크 포함)를 쓴다 — generateSeasonSchedule()이 82경기×30팀(1,230경기)을
        // B2B/3-in-3 제약을 지키며 배치하려면 이 정도 길이가 필요하다("리그 주기"인 1~4주와는
        // 완전히 다른 개념 — 그건 아래 compressLeagueSchedule()이 별도로 적용한다).
        // 연도 자체(예: 2027)는 관리자가 지정 가능 — 지정 안 하면 실제 생성 시점 연도로 폴백.
        const virtualSeasonYear = league.virtual_season_year ?? nowDate.getFullYear();
        const rawSchedule = generateSeasonSchedule(
            {
                seasonYear:       virtualSeasonYear,
                seasonStart:      `${virtualSeasonYear}-10-21`,
                regularSeasonEnd: `${virtualSeasonYear + 1}-04-13`,
                allStarStart:     `${virtualSeasonYear + 1}-02-13`,
                allStarEnd:       `${virtualSeasonYear + 1}-02-18`,
            },
            filteredTeamData as any,
        );
        schedule = compressLeagueSchedule(rawSchedule, {
            realStartAt:         simRealStartAt,
            durationWeeks:       league.duration_weeks ?? 2,
            dailyWindowStartMin: league.daily_window_start_min ?? 1140, // 기본 19:00 KST
            dailyWindowEndMin:   league.daily_window_end_min   ?? 1380, // 기본 23:00 KST
        });
    }

    if (bracketData) {
        const { error } = await supabase.from('leagues').update({ bracket_data: { series: bracketData.series }, sim_real_start_at: simRealStartAt, games_per_real_day: gamesPerRealDay }).eq('id', room.league_id);
        if (error) return { ok: false, error: `bracket save: ${error.message}` };
    } else {
        await supabase.from('leagues').update({ sim_real_start_at: simRealStartAt }).eq('id', room.league_id);
    }

    // [migration 2026-08-06] rooms.schedule 대신 games 테이블에 삽입. 결정론적 game_id
    // (T_R1_M0_G1 등)가 리셋 후 재초기화 시 PK와 충돌할 수 있어 방어적으로 먼저 지운다.
    await supabase.from('games').delete().eq('room_id', roomId);
    const { error: gamesErr } = await insertGames(roomId, room.league_id, schedule);
    if (gamesErr) return { ok: false, error: `games save: ${gamesErr}` };

    const { error: saveErr } = await supabase.from('rooms').update({
        roster_state: rosterState,
        sim_date: seasonStartDate,
        draft_cursor: { ...(room.draft_cursor as any ?? {}), status: 'finalized', finalizedAt: simRealStartAt },
    }).eq('id', roomId);

    if (saveErr) return { ok: false, error: `rooms save: ${saveErr.message}` };

    await insertGameShortCodes(roomId, schedule);

    console.log(`[finalize:force] ${roomId} — done, ${schedule.length} games, bracket=${!!bracketData}`);
    return { ok: true };
}

export async function finalizeDraft(roomId: string): Promise<void> {
    console.log(`[finalize] ${roomId} — start`);

    // ── 방 정보 조회 ──────────────────────────────────────────────────────────
    const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('id, league_id, draft_config, draft_cursor')
        .eq('id', roomId)
        .single();

    if (roomErr || !room) {
        console.error(`[finalize] room not found: ${roomId}`, roomErr?.message);
        return;
    }

    const cursor = (room.draft_cursor ?? {}) as any;
    if (cursor.status === 'finalized') {
        console.log(`[finalize] ${roomId} already finalized — skip`);
        return;
    }

    // ── 원자적 claim: drafting → in_progress ────────────────────────────────
    // update() 뒤에 체이닝되는 select()는 PostgrestTransformBuilder.select(columns)로,
    // {count, head} 옵션을 받지 않는다(무시됨) — 반환된 rows 배열 길이로 판정해야 한다.
    const { data: claimedRows } = await supabase
        .from('leagues')
        .update({ status: 'in_progress' })
        .eq('id', room.league_id)
        .eq('status', 'drafting')
        .select('id');

    if (!claimedRows?.length) {
        console.log(`[finalize] ${roomId} — claim failed (already processed)`);
        return;
    }

    // ── 리그 정보 조회 ─────────────────────────────────────────────────────────
    const { data: league } = await supabase
        .from('leagues')
        .select('id, type, season_start_date, season_end_date, tournament_start_at, tournament_format, match_format, finals_match_format, games_per_real_day, draft_pool, draft_ovr_min, draft_ovr_max, duration_weeks, daily_window_start_min, daily_window_end_min, virtual_season_year')
        .eq('id', room.league_id)
        .single();

    if (!league) {
        console.error(`[finalize] league not found: ${room.league_id}`);
        return;
    }

    // ── 리그 팀 / 로스터 조회 ─────────────────────────────────────────────────
    const { data: leagueTeams } = await supabase
        .from('league_teams')
        .select('team_slug, team_name, roster, user_id')
        .eq('room_id', roomId);

    if (!leagueTeams?.length) {
        console.error(`[finalize] no league teams for room ${roomId}`);
        return;
    }

    // 로스터 상태
    const rosterState: Record<string, { condition: number }> = {};
    for (const team of leagueTeams) {
        for (const playerId of (team.roster ?? [])) {
            rosterState[playerId] = { condition: 100 };
        }
    }

    // ── 팀별 뎁스차트/로테이션/전술 최초 자동 설정 ──────────────────────────────
    // 리그 생성(드래프트 완료) 시점의 최신 아키타입 가중치/태그를 강제로 다시 받아온다
    // (서버 부팅 이후 관리자가 튜닝했을 수 있으므로) — 실패해도 하드코딩 폴백으로 진행.
    await refetchGameConfig().catch(err => console.error('[finalize] refetchGameConfig failed:', err));
    await initializeTeamTactics(roomId, leagueTeams as any, rosterState);
    await applyLeagueNormalization(roomId, league, leagueTeams.length)
        .catch(err => console.error('[finalize] applyLeagueNormalization failed:', err));

    // ── 날짜 계산 ────────────────────────────────────────────────────────────
    const nowDate        = new Date();
    const today          = nowDate.toISOString().slice(0, 10);

    const tournamentStart = league.type === 'tournament' ? (league.tournament_start_at ?? null) : null;
    const seasonStartDate = tournamentStart ? tournamentStart.slice(0, 10) : today;
    // 토너먼트는 유저가 지정한 시:분(tournament_start_at)을 시뮬레이션 시각의 기준점(game_seq=0)으로
    // 그대로 사용한다 — 이미 지난 시각이면(드래프트가 늦게 끝나는 등) 지금 시각을 10분 단위로 반올림해 사용.
    const simRealStartAt = resolveSimRealStartAt(tournamentStart, nowDate);
    // 토너먼트 경기 간 간격(기본 30분) — games_per_real_day로 환산해 저장(어드민 설정값 없으면 기본치를 그대로 확정)
    const gamesPerRealDay = league.games_per_real_day ?? 48;
    const intervalMinutes = 1440 / gamesPerRealDay;

    // ── 일정 / 브라켓 생성 ──────────────────────────────────────────────────
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
            intervalMinutes,
            simRealStartAt,
        );
        schedule    = result.schedule;
        bracketData = result;
    } else {
        const teamSlugs = new Set(leagueTeams.map((t: any) => t.team_slug));
        const filteredTeamData = Object.fromEntries(
            Object.entries(TEAM_DATA).filter(([slug]) => teamSlugs.has(slug)),
        );
        // forceInitSchedule과 동일 — 가상 캘린더는 항상 고정된 현실적인 길이, 관리자가
        // 정한 "리그 주기"(1~4주)는 compressLeagueSchedule()에서 별도로 적용.
        // 연도 자체(예: 2027)는 관리자가 지정 가능 — 지정 안 하면 실제 생성 시점 연도로 폴백.
        const virtualSeasonYear = league.virtual_season_year ?? nowDate.getFullYear();
        const rawSchedule = generateSeasonSchedule(
            {
                seasonYear:       virtualSeasonYear,
                seasonStart:      `${virtualSeasonYear}-10-21`,
                regularSeasonEnd: `${virtualSeasonYear + 1}-04-13`,
                allStarStart:     `${virtualSeasonYear + 1}-02-13`,
                allStarEnd:       `${virtualSeasonYear + 1}-02-18`,
            },
            filteredTeamData as any,
        );
        schedule = compressLeagueSchedule(rawSchedule, {
            realStartAt:         simRealStartAt,
            durationWeeks:       league.duration_weeks ?? 2,
            dailyWindowStartMin: league.daily_window_start_min ?? 1140, // 기본 19:00 KST
            dailyWindowEndMin:   league.daily_window_end_min   ?? 1380, // 기본 23:00 KST
        });
    }

    // ── 브라켓/리그 저장 ──────────────────────────────────────────────────────
    if (bracketData) {
        const { error: bracketErr } = await supabase
            .from('leagues')
            .update({ bracket_data: { series: bracketData.series }, sim_real_start_at: simRealStartAt, games_per_real_day: gamesPerRealDay })
            .eq('id', room.league_id);
        if (bracketErr) {
            console.error(`[finalize] bracket save error: ${bracketErr.message}`);
            return;
        }
    } else {
        await supabase.from('leagues').update({ sim_real_start_at: simRealStartAt }).eq('id', room.league_id);
    }

    // [migration 2026-08-06] rooms.schedule 대신 games 테이블 삽입. 결정론적 game_id가
    // 재초기화 시 PK와 충돌할 수 있어 방어적으로 먼저 지운다.
    await supabase.from('games').delete().eq('room_id', roomId);
    const { error: gamesErr } = await insertGames(roomId, room.league_id, schedule);
    if (gamesErr) {
        console.error(`[finalize] games save error: ${gamesErr}`);
        return;
    }

    // ── rooms 저장 ────────────────────────────────────────────────────────────
    const { error: saveErr } = await supabase
        .from('rooms')
        .update({
            roster_state: rosterState,
            sim_date:     seasonStartDate,
            draft_cursor: { status: 'finalized', finalizedAt: simRealStartAt },
        })
        .eq('id', roomId);

    if (saveErr) {
        console.error(`[finalize] rooms save error: ${saveErr.message}`);
        return;
    }

    await insertGameShortCodes(roomId, schedule);
    console.log(`[finalize] ${roomId} — done (league=${room.league_id})`);
}
