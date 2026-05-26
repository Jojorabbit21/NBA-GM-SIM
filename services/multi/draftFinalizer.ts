
import { saveRoom } from './roomPersistence';
import { updateLeagueStatus, saveBracketData } from './leagueService';
import { loadLeague, listLeagueTeams } from './roomQueries';
import { generateSeasonSchedule } from '../../utils/scheduleGenerator';
import { initializeTournamentBracket } from './tournamentInitializer';
import { TEAM_DATA } from '../../data/teamData';
import type { SavedPlayerState } from '../../types';
import type { Game } from '../../types/game';

// Regular-season day allocations per league duration (weeks 1-4)
const REGULAR_DAYS_BY_WEEK = [5, 10, 16, 20] as const;

// 10:00 KST = 01:00 UTC
function computeSlotTime(leagueStartDate: string, realDay: number, slotInDay: number): string {
    const [y, m, d] = leagueStartDate.split('-').map(Number);
    const baseMs = Date.UTC(y, m - 1, d, 1, 0, 0, 0); // 10:00 KST on day 0
    return new Date(baseMs + realDay * 86_400_000 + slotInDay * 30 * 60_000).toISOString();
}

function injectScheduledAt(schedule: Game[], leagueStartDate: string, seasonEndDate: string | null): void {
    const endDate = seasonEndDate ?? (() => {
        const d = new Date(leagueStartDate);
        d.setDate(d.getDate() + 28);
        return d.toISOString().slice(0, 10);
    })();
    const totalDays = Math.round(
        (new Date(endDate).getTime() - new Date(leagueStartDate).getTime()) / 86_400_000,
    );
    const weeks = Math.min(4, Math.max(1, Math.round(totalDays / 7)));
    const regularDays = REGULAR_DAYS_BY_WEEK[weeks - 1];
    const gameDaysPerRealDay = Math.ceil(82 / regularDays);

    const uniqueDates = [...new Set(schedule.map(g => g.date))].sort();
    const dateToSlot = new Map<string, string>();
    uniqueDates.forEach((date, i) => {
        dateToSlot.set(date, computeSlotTime(leagueStartDate, Math.floor(i / gameDaysPerRealDay), i % gameDaysPerRealDay));
    });

    for (const game of schedule) {
        game.scheduledAt = dateToSlot.get(game.date);
    }
}

/**
 * 드래프트 완료 후 시즌을 초기화한다.
 * - league.type === 'main_league': 정규시즌 일정 생성
 * - league.type === 'tournament':  토너먼트 브라켓 + 게임 생성
 *
 * 멱등성 보장: leagues.status가 이미 'in_progress'면 즉시 반환.
 */
export async function finalizeDraft(
    roomId: string,
    leagueId: string,
): Promise<{ error: string | null }> {
    const league = await loadLeague(leagueId);
    if (!league) return { error: '리그를 찾을 수 없습니다.' };

    // 토너먼트이고 bracket_data가 없으면 재실행 허용 (autocomplete가 status만 먼저 set한 경우 대비)
    const needsBracket = league.type === 'tournament' && !league.bracket_data;
    if (league.status === 'in_progress' && !needsBracket) return { error: null };

    // draft picks are stored in league_teams.roster via submit_draft_pick_v2 RPC
    const leagueTeams = await listLeagueTeams(roomId);
    if (!leagueTeams.length) return { error: '팀 데이터가 없습니다.' };

    const rosterState: Record<string, SavedPlayerState> = {};
    for (const team of leagueTeams) {
        for (const playerId of team.roster) {
            rosterState[playerId] = { condition: 100 };
        }
    }

    // For tournaments: use admin-configured tournament_start_at if set; otherwise fall back to today.
    // For main_league: always use today so scheduledAt aligns with wall-clock time.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const tournamentStartIso = league.type === 'tournament' ? (league.tournament_start_at ?? null) : null;
    const seasonStartDate  = tournamentStartIso ? tournamentStartIso.slice(0, 10) : today;
    const startUtcHour     = tournamentStartIso ? new Date(tournamentStartIso).getUTCHours()   : 1;
    const startUtcMinute   = tournamentStartIso ? new Date(tournamentStartIso).getUTCMinutes() : 0;

    const adminDurDays = (() => {
        if (league.season_start_date && league.season_end_date) {
            return Math.max(7, Math.round(
                (new Date(league.season_end_date).getTime() - new Date(league.season_start_date).getTime()) / 86_400_000,
            ));
        }
        return 14; // default 2 weeks
    })();
    const endD = new Date(now.getFullYear(), now.getMonth(), now.getDate() + adminDurDays);
    const computedSeasonEndDate = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;

    // ── 토너먼트 분기 ──────────────────────────────────────────────────────────
    if (league.type === 'tournament') {
        const tendencySeed = `${leagueId}-${seasonStartDate}`;
        const { series, schedule } = initializeTournamentBracket(
            leagueTeams,
            league.tournament_format,
            league.match_format,
            league.finals_match_format,
            tendencySeed,
            seasonStartDate,
            startUtcHour,
            startUtcMinute,
        );

        const { error: bracketErr } = await saveBracketData(leagueId, { series, schedule });
        if (bracketErr) return { error: bracketErr };

        const { error: saveErr } = await saveRoom(roomId, {
            rosterState,
            schedule,
            simDate: seasonStartDate,
        });
        if (saveErr) return { error: saveErr };

        return updateLeagueStatus(leagueId, 'in_progress');
    }

    // ── 메인리그: 정규시즌 일정 생성 ──────────────────────────────────────────
    const teamSlugs = new Set(leagueTeams.map(t => t.team_slug));
    const filteredTeamData = Object.fromEntries(
        Object.entries(TEAM_DATA).filter(([slug]) => teamSlugs.has(slug)),
    );

    const seasonYear = parseInt(seasonStartDate.slice(0, 4), 10);

    const schedule = generateSeasonSchedule(
        {
            seasonYear,
            seasonStart:        seasonStartDate,
            regularSeasonEnd:   computedSeasonEndDate,
            allStarStart:       `${seasonYear + 1}-02-13`,
            allStarEnd:         `${seasonYear + 1}-02-18`,
        },
        filteredTeamData,
    );

    // Inject real-world scheduledAt timestamps (30-min slot, KST 10:00~)
    injectScheduledAt(schedule, seasonStartDate, computedSeasonEndDate);

    const { error: saveErr } = await saveRoom(roomId, {
        rosterState,
        schedule,
        simDate: seasonStartDate,
    });
    if (saveErr) return { error: saveErr };

    return updateLeagueStatus(leagueId, 'in_progress');
}
