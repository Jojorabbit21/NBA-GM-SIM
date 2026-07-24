/**
 * finalize.ts — 드래프트 완료 후 시즌 초기화.
 *
 * draft-scheduler EF 섹션4를 Bun 서버로 이식.
 * leagues.status: 'drafting' → 'in_progress' 원자적 claim으로 중복 처리 방지.
 * 호출자: DraftRoom.onCompleted() (dynamic import)
 */
import { supabase } from './supabaseAdmin';
import { generateSeasonSchedule } from './shared/scheduleGenerator';
import { initializeTournamentBracket } from './shared/tournamentInitializer';
import { TEAM_DATA } from './shared/teamData';
import { mapRawPlayerToRuntimePlayer, buildTeamForSim } from './shared/dataMapper';
import { generateAutoTactics } from './shared/game/tactics/tacticGenerator';
import { refetchGameConfig } from './shared/services/admin/gameConfigService';

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

function injectGameSeq(schedule: any[]): void {
    const uniqueDates = [...new Set(schedule.map((g: any) => g.date as string))].sort();
    const dateToSeq = new Map<string, number>(uniqueDates.map((d, i) => [d, i]));
    for (const game of schedule) {
        game.game_seq = dateToSeq.get(game.date) ?? 0;
    }
}

/**
 * 드래프트 완료 직후 각 팀(사람/AI 모두)의 뎁스차트/로테이션/팀 전술을 자동 생성해
 * room_members.tactics + depth_chart에 최초 저장한다.
 * preserveDraftOrder=true — 드래프트에서 먼저 뽑힌 선수가 주전을 차지하도록(tacticGenerator와 동일 규칙).
 * 이후 유저가 전술 화면에서 직접 수정하면 그 값으로 덮어써진다 — 여기서는 "빈 값" 상태를 없애는 최초 seed일 뿐이다.
 */
async function initializeTeamTactics(
    roomId: string,
    leagueTeams: { team_slug: string; team_name: string; roster: string[]; user_id: string | null }[],
    rosterState: Record<string, any>,
): Promise<void> {
    const allPlayerIds = leagueTeams.flatMap(t => t.roster ?? []);
    if (allPlayerIds.length === 0) return;

    const { data: rawPlayers } = await supabase
        .from('meta_players')
        .select('id, name, position, base_attributes, tendencies')
        .in('id', allPlayerIds);

    const playerMap = new Map<string, any>();
    for (const raw of rawPlayers ?? []) {
        playerMap.set(String(raw.id), mapRawPlayerToRuntimePlayer(raw));
    }

    const updates = leagueTeams
        .filter(lt => lt.user_id)
        .map(lt => {
            const team = buildTeamForSim(lt, playerMap, rosterState);
            const tactics = generateAutoTactics(team, undefined, true);
            return { userId: lt.user_id as string, tactics, depthChart: tactics.depthChart ?? null };
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
 * claim 없이 강제로 브라켓/스케줄 생성.
 * 이미 in_progress이지만 schedule이 null인 리그 복구용.
 */
export async function forceInitSchedule(roomId: string): Promise<{ ok: boolean; error?: string }> {
    const { data: room } = await supabase
        .from('rooms')
        .select('id, league_id, draft_cursor, schedule')
        .eq('id', roomId)
        .single();

    if (!room) return { ok: false, error: 'room not found' };
    if (room.schedule) return { ok: false, error: 'schedule already exists' };

    const { data: league } = await supabase
        .from('leagues')
        .select('id, type, season_start_date, season_end_date, tournament_start_at, tournament_format, match_format, finals_match_format, games_per_real_day')
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

    const nowDate         = new Date();
    const tournamentStart = league.type === 'tournament' ? (league.tournament_start_at ?? null) : null;
    const seasonStartDate = tournamentStart ? tournamentStart.slice(0, 10) : nowDate.toISOString().slice(0, 10);
    // 토너먼트는 유저가 지정한 시:분(tournament_start_at)을 시뮬레이션 시각의 기준점(game_seq=0)으로
    // 그대로 사용한다 — 이미 지난 시각이면(드래프트가 늦게 끝나는 등) 지금 시각을 10분 단위로 반올림해 사용.
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
        const seasonYear = parseInt(seasonStartDate.slice(0, 4), 10);
        const computedEnd = league.season_end_date ?? (() => {
            const d = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 14);
            return d.toISOString().slice(0, 10);
        })();
        schedule = generateSeasonSchedule(
            { seasonYear, seasonStart: seasonStartDate, regularSeasonEnd: computedEnd,
              allStarStart: `${seasonYear + 1}-02-13`, allStarEnd: `${seasonYear + 1}-02-18` },
            filteredTeamData as any,
        );
        injectGameSeq(schedule);
    }

    if (bracketData) {
        const { error } = await supabase.from('leagues').update({ bracket_data: bracketData, sim_real_start_at: simRealStartAt, games_per_real_day: gamesPerRealDay }).eq('id', room.league_id);
        if (error) return { ok: false, error: `bracket save: ${error.message}` };
    } else {
        await supabase.from('leagues').update({ sim_real_start_at: simRealStartAt }).eq('id', room.league_id);
    }

    const { error: saveErr } = await supabase.from('rooms').update({
        roster_state: rosterState,
        schedule,
        sim_date: seasonStartDate,
        draft_cursor: { ...(room.draft_cursor as any ?? {}), status: 'finalized', finalizedAt: simRealStartAt },
    }).eq('id', roomId);

    if (saveErr) return { ok: false, error: `rooms save: ${saveErr.message}` };

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
        .select('id, type, season_start_date, season_end_date, tournament_start_at, tournament_format, match_format, finals_match_format, games_per_real_day')
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

    const adminDurDays = (() => {
        if (league.season_start_date && league.season_end_date) {
            return Math.max(7, Math.round(
                (new Date(league.season_end_date).getTime() - new Date(league.season_start_date).getTime()) / 86_400_000,
            ));
        }
        return 14;
    })();
    const endD = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + adminDurDays);
    const computedSeasonEndDate = endD.toISOString().slice(0, 10);

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
        injectGameSeq(schedule);
    }

    // ── 브라켓/리그 저장 ──────────────────────────────────────────────────────
    if (bracketData) {
        const { error: bracketErr } = await supabase
            .from('leagues')
            .update({ bracket_data: bracketData, sim_real_start_at: simRealStartAt, games_per_real_day: gamesPerRealDay })
            .eq('id', room.league_id);
        if (bracketErr) {
            console.error(`[finalize] bracket save error: ${bracketErr.message}`);
            return;
        }
    } else {
        await supabase.from('leagues').update({ sim_real_start_at: simRealStartAt }).eq('id', room.league_id);
    }

    // ── rooms 저장 ────────────────────────────────────────────────────────────
    const { error: saveErr } = await supabase
        .from('rooms')
        .update({
            roster_state: rosterState,
            schedule,
            sim_date:     seasonStartDate,
            draft_cursor: { status: 'finalized', finalizedAt: simRealStartAt },
        })
        .eq('id', roomId);

    if (saveErr) {
        console.error(`[finalize] rooms save error: ${saveErr.message}`);
    } else {
        console.log(`[finalize] ${roomId} — done (league=${room.league_id})`);
    }
}
