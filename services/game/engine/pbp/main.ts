
import { Team, GameTactics, DepthChart, SimulationResult, PlayerBoxScore, PbpLog, RotationData } from '../../../../types';
import { initTeamState } from './initializer';
import { calculatePossessionTime, formatTime } from './timeEngine';
import { calculateIncrementalFatigue } from '../fatigueSystem';
import { checkAndApplyRotation } from './rotationLogic';

/**
 * Executes a full Play-by-Play game simulation.
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
    
    const state = {
        home: initTeamState(homeTeam, userTeamId === homeTeam.id ? userTactics : undefined, homeDepthChart),
        away: initTeamState(awayTeam, userTeamId === awayTeam.id ? userTactics : undefined, awayDepthChart),
        quarter: 1,
        gameClock: 720,
        logs: [] as PbpLog[],
        rotationHistory: {} as RotationData
    };

    // Main Simulation Loop
    for (state.quarter = 1; state.quarter <= 4; state.quarter++) {
        state.gameClock = 720;
        
        while (state.gameClock > 0) {
            const timeTaken = calculatePossessionTime(state as any, state.home.tactics.sliders);
            state.gameClock -= timeTaken;

            [state.home, state.away].forEach(team => {
                const isB2B = team.id === homeTeam.id ? isHomeB2B : isAwayB2B;
                team.onCourt.forEach(p => {
                    p.mp += timeTaken / 60;
                    const isStopper = team.tactics.defenseTactics.includes('AceStopper') && team.tactics.stopperId === p.playerId;
                    const fatigue = calculateIncrementalFatigue(p, timeTaken, team.tactics.sliders, isB2B, isStopper, team.tactics.offenseTactics[0], team.tactics.defenseTactics[0]);
                    
                    // [Fix] 체력이 0 미만으로 떨어지지 않도록 물리적 하한선 적용
                    p.currentCondition = Math.max(0, p.currentCondition - fatigue.drain);
                    
                    if (fatigue.injuryOccurred) {
                        p.health = 'Injured';
                        state.logs.push({
                            quarter: state.quarter,
                            timeRemaining: formatTime(state.gameClock),
                            teamId: team.id,
                            text: `${p.playerName} 선수가 부상으로 퇴장합니다.`,
                            type: 'info'
                        });
                    }
                });
                
                checkAndApplyRotation(state as any, team, ((state.quarter - 1) * 720) + (720 - state.gameClock));
            });

            // Baseline scoring for simulation flow
            if (Math.random() > 0.5) state.home.score += Math.random() > 0.7 ? 3 : 2;
            else state.away.score += Math.random() > 0.7 ? 3 : 2;
        }
    }

    const homeBox: PlayerBoxScore[] = [...state.home.onCourt, ...state.home.bench].map(p => ({
        ...p,
        plusMinus: state.home.score - state.away.score
    }));

    const awayBox: PlayerBoxScore[] = [...state.away.onCourt, ...state.away.bench].map(p => ({
        ...p,
        plusMinus: state.away.score - state.home.score
    }));

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox,
        awayBox,
        homeTactics: {},
        awayTactics: {},
        rosterUpdates: {},
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}
