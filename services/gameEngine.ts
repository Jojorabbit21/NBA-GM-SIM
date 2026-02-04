import { Team, Player, PlayerBoxScore, TacticalSnapshot, GameTactics, RosterUpdate, SimulationResult } from '../types';
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
    isAwayB2B: boolean = false
): SimulationResult {
    
    // Call the new PbP engine
    const result = runFullGameSimulation(
        homeTeam,
        awayTeam,
        userTeamId,
        userTactics,
        isHomeB2B,
        isAwayB2B
    );
    
    // Ensure all players from original roster are in box score even if they didn't play
    // (The PbP engine initializes bench players, so this should be handled, 
    // but we double check merge to be safe in future if needed)
    
    return result;
}

// --------------------------------------------------------------------------
//  LEGACY CODE BELOW (Kept for reference or partial fallback if needed, 
//  but effectively bypassed by the new simulateGame wrapper)
// --------------------------------------------------------------------------
// ... (The rest of the file content is effectively unused now, but can be kept 
// in the codebase until the PbP engine is fully mature with all features)
