
import { Team, Game, PlayoffSeries, SimulationResult, PlayerBoxScore, TacticalSnapshot, RotationData, ShotEvent } from '../../types';
import { simulateCpuGames, CpuGameResult } from '../simulationService';
import { updateTeamStats, updateSeriesState, applyBoxToRoster } from '../../utils/simulationUtils';

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
    userId: string | undefined
): ProcessedCpuResults => {
    // These results are already in CpuGameResult (camelCase) format
    const results = simulateCpuGames(schedule, teams, currentSimDate, userGameId);
    
    const gameResultsToSave: any[] = [];
    const playoffResultsToSave: any[] = [];
    const viewData: any[] = [];

    results.forEach(res => {
        const home = teams.find(t => t.id === res.homeTeamId);
        const away = teams.find(t => t.id === res.awayTeamId);

        if (home && away) {
            // Update Stats (team wins/losses + player season stats)
            updateTeamStats(home, away, res.homeScore, res.awayScore);
            if (res.boxScore?.home) applyBoxToRoster(home, res.boxScore.home);
            if (res.boxScore?.away) applyBoxToRoster(away, res.boxScore.away);

            // Update Schedule (Mutates schedule)
            const gameIdx = schedule.findIndex(g => g.id === res.gameId);
            if (gameIdx !== -1) {
                schedule[gameIdx].played = true;
                schedule[gameIdx].homeScore = res.homeScore;
                schedule[gameIdx].awayScore = res.awayScore;
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
                is_playoff: res.isPlayoff || false
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
