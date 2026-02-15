
import { Team, Game, PlayoffSeries } from '../../types';
import { simulateCpuGames } from '../simulationService';
import { updateTeamStats, updateSeriesState } from '../../utils/simulationUtils';

export interface ProcessedCpuResults {
    gameResultsToSave: any[];
    playoffResultsToSave: any[];
    viewData: any[]; // For lastGameResult.otherGames
}

export const processCpuGames = (
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[],
    currentSimDate: string,
    userGameId: string | undefined,
    userId: string | undefined
): ProcessedCpuResults => {
    const results = simulateCpuGames(schedule, teams, currentSimDate, userGameId);
    
    const gameResultsToSave: any[] = [];
    const playoffResultsToSave: any[] = [];
    const viewData: any[] = [];

    results.forEach(res => {
        const home = teams.find(t => t.id === res.homeTeamId);
        const away = teams.find(t => t.id === res.awayTeamId);

        if (home && away) {
            // Update Stats (Mutates teams - ensure clones are passed)
            updateTeamStats(home, away, res.homeScore, res.awayScore);

            // Update Schedule (Mutates schedule)
            const gameIdx = schedule.findIndex(g => g.id === res.gameId);
            if (gameIdx !== -1) {
                schedule[gameIdx].played = true;
                schedule[gameIdx].homeScore = res.homeScore;
                schedule[gameIdx].awayScore = res.awayScore;
            }

            // Common Result Data Payload
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
                rotation_data: res.rotationData, // [New] Save Rotation
                shot_events: res.pbpShotEvents,  // [New] Save Shot Chart
                is_playoff: res.isPlayoff || false
            } : null;

            // Handle Playoff Series
            if (res.isPlayoff && res.seriesId) {
                updateSeriesState(playoffSeries, res.seriesId, res.homeTeamId, res.awayTeamId, res.homeScore, res.awayScore);
                
                if (resultData) {
                    playoffResultsToSave.push({
                        ...resultData,
                        series_id: res.seriesId,
                        round_number: 0, // Should be derived from series if needed
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

    return { gameResultsToSave, playoffResultsToSave, viewData };
};
