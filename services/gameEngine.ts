
import { Team, Player, PlayerBoxScore, TacticalSnapshot, GameTactics, RosterUpdate, SimulationResult, DepthChart } from '../types';
import { SIM_CONFIG, POSITION_PENALTY_MAP } from './game/config/constants';
import { stableSort, distributeMinutes } from './game/tactics/minutesManager';
import { generateAutoTactics } from './game/tactics/tacticGenerator';
import { runFullGameSimulation } from './game/engine/pbp/main';

// ==========================================================================================
//  🏀 NBA GM SIMULATOR - GAME ENGINE (CORE)
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
    homeDepthChart?: DepthChart | null, // [New]
    awayDepthChart?: DepthChart | null  // [New]
): SimulationResult {
    
    // Call the new PbP engine
    const result = runFullGameSimulation(
        homeTeam,
        awayTeam,
        userTeamId,
        userTactics,
        isHomeB2B,
        isAwayB2B,
        homeDepthChart, // [New]
        awayDepthChart  // [New]
    );
    
    return result;
}
