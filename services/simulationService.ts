
import { Team, Game, SimulationResult } from '../types';
import { simulateGame } from './gameEngine';

export interface CpuGameResult {
    gameId: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    isPlayoff?: boolean;
    seriesId?: string;
}

/**
 * Simulates all scheduled CPU games for a specific date.
 */
export const simulateCpuGames = (
    schedule: Game[],
    teams: Team[],
    date: string,
    excludeGameId?: string
): CpuGameResult[] => {
    const results: CpuGameResult[] = [];
    
    // Filter games to play
    const gamesToPlay = schedule.filter(g => 
        !g.played && 
        g.date === date && 
        g.id !== excludeGameId
    );

    for (const game of gamesToPlay) {
        const homeTeam = teams.find(t => t.id === game.homeTeamId);
        const awayTeam = teams.find(t => t.id === game.awayTeamId);

        if (homeTeam && awayTeam) {
            // Simple Simulation for CPU vs CPU
            const simResult: SimulationResult = simulateGame(homeTeam, awayTeam, null);

            results.push({
                gameId: game.id,
                homeTeamId: homeTeam.id,
                awayTeamId: awayTeam.id,
                homeScore: simResult.homeScore,
                awayScore: simResult.awayScore,
                isPlayoff: game.isPlayoff,
                seriesId: game.seriesId
            });
        }
    }

    return results;
};
