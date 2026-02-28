
import { Team, Game, PlayoffSeries, GameTactics, DepthChart, SimulationResult } from '../../types';
import { simulateGame } from '../gameEngine';
import { updateTeamStats, updateSeriesState, applyBoxToRoster } from '../../utils/simulationUtils';
import { saveGameResults } from '../queries';
import { savePlayoffGameResult } from '../playoffService';
import { generateGameRecapNews } from '../geminiService';
import { sendMessage } from '../messageService';

export const runUserSimulation = (
    userGame: Game,
    teams: Team[],
    schedule: Game[],
    myTeamId: string,
    userTactics: GameTactics,
    currentSimDate: string,
    depthChart?: DepthChart | null,
    tendencySeed?: string
): SimulationResult => {
    const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
    const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;
    const isHome = userGame.homeTeamId === myTeamId;

    // Back-to-Back Check
    const checkB2B = (teamId: string) => {
        const yesterday = new Date(currentSimDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];
        return schedule.some(g => g.played && g.date === yStr && (g.homeTeamId === teamId || g.awayTeamId === teamId));
    };

    const isHomeB2B = checkB2B(homeTeam.id);
    const isAwayB2B = checkB2B(awayTeam.id);

    const homeDepth = isHome ? depthChart : undefined;
    const awayDepth = !isHome ? depthChart : undefined;

    return simulateGame(
        homeTeam,
        awayTeam,
        myTeamId,
        userTactics,
        isHomeB2B,
        isAwayB2B,
        homeDepth,
        awayDepth,
        tendencySeed
    );
};

export const applyUserGameResult = async (
    result: SimulationResult,
    userGame: Game,
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[],
    currentSimDate: string,
    userId: string | undefined,
    myTeamId: string,
    userTactics: GameTactics,
    isGuestMode: boolean,
    refreshUnreadCount: () => void
) => {
    const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
    const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;
    const isHome = userGame.homeTeamId === myTeamId;

    // 1. Update Stats (team wins/losses + player season stats)
    updateTeamStats(homeTeam, awayTeam, result.homeScore, result.awayScore);
    applyBoxToRoster(homeTeam, result.homeBox);
    applyBoxToRoster(awayTeam, result.awayBox);

    // 2. Update Roster (Fatigue/Injury)
    if (result.rosterUpdates) {
        [homeTeam, awayTeam].forEach(t => {
            t.roster.forEach(p => {
                const update = result.rosterUpdates[p.id];
                if (update) {
                    if (update.condition !== undefined) p.condition = update.condition;
                    if (update.health) p.health = update.health;
                    if (update.injuryType) p.injuryType = update.injuryType;
                    if (update.returnDate) p.returnDate = update.returnDate;
                }
            });
        });
    }

    // 3. Update Schedule
    const uGameIdx = schedule.findIndex(g => g.id === userGame.id);
    if (uGameIdx !== -1) {
        schedule[uGameIdx].played = true;
        schedule[uGameIdx].homeScore = result.homeScore;
        schedule[uGameIdx].awayScore = result.awayScore;
    }

    // 4. Update Playoffs
    if (userGame.isPlayoff && userGame.seriesId) {
        updateSeriesState(playoffSeries, userGame.seriesId, userGame.homeTeamId, userGame.awayTeamId, result.homeScore, result.awayScore);
    }

    // 5. DB Save & Messages
    const resultPayload = {
        user_id: userId || 'guest',
        game_id: userGame.id,
        date: currentSimDate,
        home_team_id: homeTeam.id,
        away_team_id: awayTeam.id,
        home_score: result.homeScore,
        away_score: result.awayScore,
        box_score: { home: result.homeBox, away: result.awayBox },
        tactics: { home: result.homeTactics, away: result.awayTactics },
        pbp_logs: result.pbpLogs,
        shot_events: result.pbpShotEvents,
        is_playoff: userGame.isPlayoff || false,
        series_id: userGame.seriesId,
        rotation_data: result.rotationData
    };

    if (!isGuestMode) {
        if (userGame.isPlayoff) {
            await savePlayoffGameResult(resultPayload as any);
        } else {
            await saveGameResults([resultPayload]);
        }
    }

    if (userId) {
        const recapNews = await generateGameRecapNews({
            home: homeTeam, away: awayTeam,
            homeScore: result.homeScore, awayScore: result.awayScore,
            homeBox: result.homeBox, awayBox: result.awayBox,
            userTactics, myTeamId
        });

        await sendMessage(
            userId,
            myTeamId,
            currentSimDate,
            'GAME_RECAP',
            `[경기 결과] ${homeTeam.name} vs ${awayTeam.name}`,
            {
                gameId: userGame.id,
                homeTeamId: homeTeam.id,
                awayTeamId: awayTeam.id,
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                userBoxScore: isHome ? result.homeBox : result.awayBox,
                recap: recapNews
            }
        );
        refreshUnreadCount();
    }

    return {
        home: homeTeam,
        away: awayTeam
    };
};
