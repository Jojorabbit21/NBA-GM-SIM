
import { Team, GameTactics, DepthChart, SimulationResult, PlayerBoxScore, PbpLog, RotationData, TacticalSnapshot } from '../../../../types';
import { initTeamState } from './initializer';
import { calculatePossessionTime } from './timeEngine';
import { checkAndApplyRotation } from './rotationLogic';
import { simulatePossession } from './possessionHandler';
import { updateOnCourtStates } from './stateUpdater';
import { applyPossessionResult } from './statsMappers';
import { checkSubstitutions } from './substitutionSystem';
import { LivePlayer } from './pbpTypes';

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

    // [Fix] Initialize rotation history for ALL players (Bench included) to avoid undefined push errors
    [state.home, state.away].forEach(team => {
        const allPlayers = [...team.onCourt, ...team.bench];
        allPlayers.forEach(p => {
             if (!state.rotationHistory[p.playerId]) {
                 state.rotationHistory[p.playerId] = [];
             }
        });
        
        // Add start segment only for Starters
        team.onCourt.forEach(p => {
             state.rotationHistory[p.playerId].push({ in: 0, out: 0 });
        });
    });

    // Main Simulation Loop
    for (state.quarter = 1; state.quarter <= 4; state.quarter++) {
        state.gameClock = 720;
        state.possession = (state.quarter === 2 || state.quarter === 3) ? 'away' : 'home'; 
        
        // Reset Team Fouls each quarter
        state.home.fouls = 0;
        state.away.fouls = 0;

        while (state.gameClock > 0) {
            const offTeamState = state.possession === 'home' ? state.home : state.away;
            const timeTaken = calculatePossessionTime(state as any, offTeamState.tactics.sliders);
            
            state.gameClock -= timeTaken;
            if (state.gameClock < 0) state.gameClock = 0;

            updateOnCourtStates(state as any, timeTaken);
            checkAndApplyRotation(state as any, state.home, ((state.quarter - 1) * 720) + (720 - state.gameClock));
            checkAndApplyRotation(state as any, state.away, ((state.quarter - 1) * 720) + (720 - state.gameClock));
            
            // Check Substitutions for Fouls/Injuries
            [state.home, state.away].forEach(team => {
                const subs = checkSubstitutions(state as any, team);
                // Implementation of substitution would happen here if we were using the return value
            });

            const result = simulatePossession(state as any);
            applyPossessionResult(state as any, result);

            let nextPossession = state.possession === 'home' ? 'away' : 'home';
            if (result.type === 'miss' && result.rebounder) {
                const isHomeRebound = state.home.onCourt.some(p => p.playerId === result.rebounder?.playerId);
                nextPossession = isHomeRebound ? 'home' : 'away';
            } else if (result.type === 'score' || result.type === 'turnover' || result.type === 'freethrow' || result.type === 'foul') {
                 // Foul without FT also changes possession if not bonus? 
                 // For simplicity in engine, non-shooting fouls typically reset shot clock but keep possession unless bonus. 
                 // Here we simplify: Defensive fouls keep possession, Offensive fouls (turnover) change it.
                 if (result.type === 'foul') {
                     // If defensive foul, offense keeps ball (unless bonus logic invoked in statsMapper)
                     // For simplicity, let's swap for now to prevent infinite loops, or assume resets.
                     // Better: check if it was turnover. simulatePossession returns 'foul' for defensive fouls mostly.
                     nextPossession = state.possession; // Keep possession on def foul
                 } else {
                    nextPossession = state.possession === 'home' ? 'away' : 'home';
                 }
            }
            state.possession = nextPossession as 'home' | 'away';
        }
    }

    const gameEndSec = 48 * 60;
    [state.home, state.away].forEach(team => {
        team.onCourt.forEach(p => {
            const hist = state.rotationHistory[p.playerId];
            if (hist && hist.length > 0) {
                hist[hist.length - 1].out = gameEndSec;
            }
        });
    });

    // [Fix] Map LivePlayer state directly to BoxScore, explicitly including currentCondition
    const mapToBox = (teamState: any): PlayerBoxScore[] => 
        [...teamState.onCourt, ...teamState.bench].map((p: LivePlayer) => ({
            ...p,
            condition: p.currentCondition, // Explicitly pass the runtime condition
            plusMinus: teamState.score - (teamState === state.home ? state.away.score : state.home.score)
        }));

    // [Fix] Map GameTactics to TacticalSnapshot for UI display
    const mapTactics = (t: GameTactics): TacticalSnapshot => ({
        offense: t.offenseTactics[0],
        defense: t.defenseTactics[0],
        stopperId: t.stopperId,
        pace: t.sliders.pace,
        sliders: t.sliders
    });

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: mapToBox(state.home),
        awayBox: mapToBox(state.away),
        // [Fix] Actually return the tactics used
        homeTactics: mapTactics(state.home.tactics),
        awayTactics: mapTactics(state.away.tactics),
        rosterUpdates: {},
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}
