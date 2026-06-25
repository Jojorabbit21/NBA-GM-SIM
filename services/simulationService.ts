
import { Team, Game, SimulationResult, PlayerBoxScore, TacticalSnapshot, RotationData, ShotEvent, PbpLog } from '../types';
import { LeagueCoachingData } from '../types/coaching';
import { SimSettings, DEFAULT_SIM_SETTINGS } from '../types/simSettings';
import { simulateGame } from './gameEngine';
import { computeLeagueContext } from './game/engine/pbp/leagueNormalization';
import { calculatePlayerOvr } from '../utils/constants';

export interface CpuGameResult {
    gameId: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    isPlayoff?: boolean;
    seriesId?: string;
    boxScore: { home: PlayerBoxScore[]; away: PlayerBoxScore[] };
    tactics: { home: TacticalSnapshot; away: TacticalSnapshot };
    rotationData?: RotationData;
    pbpShotEvents?: ShotEvent[];
    pbpLogs?: PbpLog[]; // In-memory only, not saved to DB
    rosterUpdates?: Record<string, any>;
    suspensions?: SimulationResult['suspensions'];
}

/**
 * Simulates all scheduled CPU games for a specific date.
 */
export const simulateCpuGames = (
    schedule: Game[],
    teams: Team[],
    date: string,
    excludeGameId?: string,
    simSettings?: SimSettings,
    coachingData?: LeagueCoachingData | null
): CpuGameResult[] => {
    const results: CpuGameResult[] = [];

    // League-relative normalization: compute once per batch
    const leagueContext = computeLeagueContext(teams, calculatePlayerOvr, simSettings?.normalizationStrength);
    const effectiveSettings: SimSettings = { ...DEFAULT_SIM_SETTINGS, ...simSettings, leagueContext };

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
            const simResult: SimulationResult = simulateGame(
                homeTeam, awayTeam, null,
                undefined, false, false, undefined, undefined, undefined,
                effectiveSettings, coachingData
            );

            results.push({
                gameId: game.id,
                homeTeamId: homeTeam.id,
                awayTeamId: awayTeam.id,
                homeScore: simResult.homeScore,
                awayScore: simResult.awayScore,
                isPlayoff: game.isPlayoff,
                seriesId: game.seriesId,
                boxScore: { home: simResult.homeBox, away: simResult.awayBox },
                tactics: { home: simResult.homeTactics, away: simResult.awayTactics },
                rotationData: simResult.rotationData,
                pbpShotEvents: simResult.pbpShotEvents,
                pbpLogs: simResult.pbpLogs,
                rosterUpdates: simResult.rosterUpdates,
                suspensions: simResult.suspensions
            });
        }
    }

    return results;
};
