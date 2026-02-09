
import { Team, GameTactics, DepthChart, SimulationResult, PlayerBoxScore, PbpLog, RotationData } from '../../../../types';
import { initTeamState } from './initializer';
import { calculatePossessionTime } from './timeEngine';
import { checkAndApplyRotation } from './rotationLogic';
import { simulatePossession } from './possessionHandler';
import { updateOnCourtStates } from './stateUpdater';
import { applyPossessionResult } from './statsMappers';
import { checkSubstitutions } from './substitutionSystem';

/**
 * Executes a full Play-by-Play game simulation.
 * REFACTORED: Now uses a modular pipeline architecture.
 */
export function runFullGameSimulation(
    homeTeam: Team,
    awayTeam: Team,
    userTeamId: string | null,
    userTactics?: GameTactics,
    isHomeB2B: boolean = false,
    isAwayB2B: boolean = false,
    homeDepthChart?: DepthChart | null,
    awayDepthChart?: DepthChart | null
): SimulationResult {
    
    // 1. Initialization Phase
    const state = {
        home: initTeamState(homeTeam, userTeamId === homeTeam.id ? userTactics : undefined, homeDepthChart),
        away: initTeamState(awayTeam, userTeamId === awayTeam.id ? userTactics : undefined, awayDepthChart),
        quarter: 1,
        gameClock: 720,
        shotClock: 24,
        possession: 'home' as 'home' | 'away',
        isDeadBall: false,
        logs: [] as PbpLog[],
        rotationHistory: {} as RotationData,
        isHomeB2B,
        isAwayB2B
    };

    // Main Simulation Loop
    for (state.quarter = 1; state.quarter <= 4; state.quarter++) {
        state.gameClock = 720;
        state.possession = (state.quarter === 2 || state.quarter === 3) ? 'away' : 'home'; // Simple alt possession

        while (state.gameClock > 0) {
            // [A] Time Phase
            // Determine who has possession (simple toggle for now, handled at end of loop or by rebound)
            const offTeamState = state.possession === 'home' ? state.home : state.away;
            const timeTaken = calculatePossessionTime(state as any, offTeamState.tactics.sliders);
            
            // Tick Clock
            state.gameClock -= timeTaken;
            if (state.gameClock < 0) state.gameClock = 0;

            // [B] Player Phase (Fatigue, Injuries)
            updateOnCourtStates(state as any, timeTaken);
            
            // [C] Coaching Phase (Rotation)
            // 1. Standard Rotation Map check
            checkAndApplyRotation(state as any, state.home, ((state.quarter - 1) * 720) + (720 - state.gameClock));
            checkAndApplyRotation(state as any, state.away, ((state.quarter - 1) * 720) + (720 - state.gameClock));
            
            // 2. Emergency Subs (Injury/Fouls) - checkSubstitutions returns requests, need to apply them
            // For now, we rely on checkAndApplyRotation which has fallback logic for unavailable players.
            // To be explicit:
            // const homeSubs = checkSubstitutions(state as any, state.home);
            // applySubs(homeSubs)... (Future expansion)

            // [D] Action Phase (The Play)
            const result = simulatePossession(state as any);

            // [E] Commit Phase (Stats & Logs)
            applyPossessionResult(state as any, result);

            // [F] Flow Control (Next Possession)
            // If Off Rebound, keep possession. Else toggle.
            // Check result.rebounder
            let nextPossession = state.possession === 'home' ? 'away' : 'home';
            
            if (result.type === 'miss' && result.rebounder) {
                // Determine which team the rebounder belongs to
                const isHomeRebound = state.home.onCourt.some(p => p.playerId === result.rebounder?.playerId);
                nextPossession = isHomeRebound ? 'home' : 'away';
            } else if (result.type === 'score' || result.type === 'turnover' || result.type === 'freethrow') {
                // Standard swap
                nextPossession = state.possession === 'home' ? 'away' : 'home';
            }
            
            state.possession = nextPossession as 'home' | 'away';
        }
    }

    // Post-Game: Map to Output Format
    const mapToBox = (teamState: any): PlayerBoxScore[] => 
        [...teamState.onCourt, ...teamState.bench].map(p => ({
            ...p,
            plusMinus: teamState.score - (teamState === state.home ? state.away.score : state.home.score)
        }));

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: mapToBox(state.home),
        awayBox: mapToBox(state.away),
        homeTactics: {},
        awayTactics: {},
        rosterUpdates: {},
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}
