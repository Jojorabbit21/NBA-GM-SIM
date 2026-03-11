
import { Team, Player, PlayerBoxScore, TacticalSnapshot, GameTactics, RosterUpdate, SimulationResult, DepthChart } from '../types';
import { LeagueCoachingData } from '../types/coaching';
import { SimSettings } from '../types/simSettings';
import { SIM_CONFIG, POSITION_PENALTY_MAP } from './game/config/constants';
import { stableSort, distributeMinutes } from './game/tactics/minutesManager';
import { generateAutoTactics } from './game/tactics/tacticGenerator';
import { runFullGameSimulation } from './game/engine/pbp/main';

// ==========================================================================================
//  🏀 Basketball GM Simulator - GAME ENGINE (CORE)
//  Focus: Game Physics Loop & Stats Generation
// ==========================================================================================

export { generateAutoTactics };

/**
 * NEW ENTRY POINT: Uses the Play-by-Play Engine
 */
export function simulateGame(
    homeTeam: Team,
    awayTeam: Team,
    userTeamId: string | null,
    userTactics?: GameTactics,
    isHomeB2B: boolean = false,
    isAwayB2B: boolean = false,
    homeDepthChart?: DepthChart | null,
    awayDepthChart?: DepthChart | null,
    tendencySeed?: string,
    simSettings?: SimSettings,
    coachingData?: LeagueCoachingData | null
): SimulationResult {

    // Call the new PbP engine
    const result = runFullGameSimulation(
        homeTeam,
        awayTeam,
        userTeamId,
        userTactics,
        isHomeB2B,
        isAwayB2B,
        homeDepthChart,
        awayDepthChart,
        tendencySeed,
        simSettings,
        coachingData
    );
    
    return result;
}
