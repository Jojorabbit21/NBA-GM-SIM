
import { Team, Game, PlayoffSeries } from '../../types';
import { LeagueCoachingData } from '../../types/coaching';
import { SimSettings } from '../../types/simSettings';
import { simulateCpuGames, CpuGameResult } from '../simulationService';
import { updateTeamStats, updateSeriesState, applyBoxToRoster, sumTeamBoxScore } from '../../utils/simulationUtils';
import { processGameDevelopment, computeLeagueAverages } from '../playerDevelopment/playerAging';
import { updatePopularityFromGame } from '../playerPopularity';
import { updateMoraleFromGame } from '../moraleService';
import { getBudgetManager } from '../financeEngine';

export interface ProcessedCpuResults {
    gameResultsToSave: any[];
    playoffResultsToSave: any[];
    viewData: any[]; // For lastGameResult.otherGames
    cpuResults: CpuGameResult[]; // [New] Full camelCase data for View
}

export const processCpuGames = (
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[],
    currentSimDate: string,
    userGameId: string | undefined,
    userId: string | undefined,
    tendencySeed?: string,
    simSettings?: SimSettings,
    coachingData?: LeagueCoachingData | null,
    season?: string,
): ProcessedCpuResults => {
    const growthRate = simSettings?.growthRate ?? 1.0;
    const declineRate = simSettings?.declineRate ?? 1.0;
    // These results are already in CpuGameResult (camelCase) format
    const results = simulateCpuGames(schedule, teams, currentSimDate, userGameId, simSettings, coachingData);

    const gameResultsToSave: any[] = [];
    const playoffResultsToSave: any[] = [];
    const viewData: any[] = [];

    // top8 계산: 루프 밖에서 1회만 (경기마다 재정렬 방지)
    const top8Ids = new Set(
        [...teams].sort((a, b) =>
            (b.wins / Math.max(1, b.wins + b.losses)) - (a.wins / Math.max(1, a.wins + a.losses))
        ).slice(0, 8).map(t => t.id)
    );

    results.forEach(res => {
        const home = teams.find(t => t.id === res.homeTeamId);
        const away = teams.find(t => t.id === res.awayTeamId);

        if (home && away) {
            // Update Stats (team wins/losses + player season stats)
            const isPlayoff = !!res.isPlayoff;
            updateTeamStats(home, away, res.homeScore, res.awayScore, isPlayoff);
            if (res.boxScore?.home) applyBoxToRoster(home, res.boxScore.home, isPlayoff);
            if (res.boxScore?.away) applyBoxToRoster(away, res.boxScore.away, isPlayoff);

            // 홈 경기 수익 누적
            if (!isPlayoff) {
                getBudgetManager().processHomeGame(home, away.id, currentSimDate);
            }

            // 선수 성장/퇴화 (정규시즌만)
            if (tendencySeed && !isPlayoff && res.boxScore?.home && res.boxScore?.away) {
                const leagueAvg = computeLeagueAverages(teams);
                processGameDevelopment(
                    home.roster, away.roster,
                    res.boxScore.home, res.boxScore.away,
                    tendencySeed, growthRate, declineRate, leagueAvg, currentSimDate,
                );
            }

            // 선수 인기도 업데이트 (정규시즌 + 플레이오프)
            if (res.boxScore?.home && res.boxScore?.away) {
                updatePopularityFromGame(home.roster, res.boxScore.home, isPlayoff, top8Ids.has(away.id));
                updatePopularityFromGame(away.roster, res.boxScore.away, isPlayoff, top8Ids.has(home.id));

                // 선수 기분 업데이트
                const homeWon = res.homeScore > res.awayScore;
                updateMoraleFromGame(home.roster, res.boxScore.home, homeWon, currentSimDate);
                updateMoraleFromGame(away.roster, res.boxScore.away, !homeWon, currentSimDate);
            }

            // Update Schedule (Mutates schedule)
            const gameIdx = schedule.findIndex(g => g.id === res.gameId);
            if (gameIdx !== -1) {
                schedule[gameIdx].played = true;
                schedule[gameIdx].homeScore = res.homeScore;
                schedule[gameIdx].awayScore = res.awayScore;
                if (res.boxScore?.home) (schedule[gameIdx] as any).homeStats = sumTeamBoxScore(res.boxScore.home);
                if (res.boxScore?.away) (schedule[gameIdx] as any).awayStats = sumTeamBoxScore(res.boxScore.away);
            }

            // Common Result Data Payload for DB (snake_case)
            const resultData = userId ? {
                user_id: userId,
                game_id: res.gameId,
                date: currentSimDate,
                home_team_id: res.homeTeamId,
                away_team_id: res.awayTeamId,
                home_score: res.homeScore,
                away_score: res.awayScore,
                box_score: res.boxScore,
                tactics: res.tactics,
                rotation_data: res.rotationData, 
                shot_events: res.pbpShotEvents,
                is_playoff: res.isPlayoff || false,
                ...(season && { season }),
            } : null;

            // Handle Playoff Series
            if (res.isPlayoff && res.seriesId) {
                updateSeriesState(playoffSeries, res.seriesId, res.homeTeamId, res.awayTeamId, res.homeScore, res.awayScore);
                
                if (resultData) {
                    playoffResultsToSave.push({
                        ...resultData,
                        series_id: res.seriesId,
                        round_number: 0, 
                        game_number: 0
                    });
                }
            } else if (resultData) {
                // Regular Season CPU Game
                gameResultsToSave.push(resultData);
            }
            
            viewData.push({
                id: res.gameId, homeTeamId: res.homeTeamId, awayTeamId: res.awayTeamId,
                homeScore: res.homeScore, awayScore: res.awayScore, played: true
            });
        }
    });

    return { 
        gameResultsToSave, 
        playoffResultsToSave, 
        viewData,
        cpuResults: results // Return full camelCase results for UI
    };
};
