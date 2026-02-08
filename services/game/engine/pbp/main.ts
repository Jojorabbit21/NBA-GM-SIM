
import { Team, GameTactics, DepthChart, SimulationResult, PlayerBoxScore, PbpLog, RotationData } from '../../../../types';
import { initTeamState } from './initializer';
import { calculatePossessionTime, formatTime } from './timeEngine';
import { calculateIncrementalFatigue } from '../fatigueSystem';
import { checkAndApplyRotation } from './rotationLogic';
import { calculateFoulStats } from '../foulSystem';

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

            // [Process Both Teams]
            [state.home, state.away].forEach(team => {
                const isB2B = team.id === homeTeam.id ? isHomeB2B : isAwayB2B;
                
                team.onCourt.forEach(p => {
                    // 1. MP & Fatigue
                    p.mp += timeTaken / 60;
                    const isStopper = team.tactics.defenseTactics.includes('AceStopper') && team.tactics.stopperId === p.playerId;
                    const fatigue = calculateIncrementalFatigue(p, timeTaken, team.tactics.sliders, isB2B, isStopper, team.tactics.offenseTactics[0], team.tactics.defenseTactics[0]);
                    p.currentCondition = Math.max(0, p.currentCondition - fatigue.drain);
                    
                    // 2. Foul Simulation
                    const foulRes = calculateFoulStats(p as any, p.mp, team.tactics, team.tactics, team.tactics.sliders);
                    p.pf = foulRes.pf;
                    
                    // 3. Injury Check
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
                
                // 4. Substitution Logic
                checkAndApplyRotation(state as any, team, ((state.quarter - 1) * 720) + (720 - state.gameClock));
            });

            // 5. Scoring Resolution (Simulated per possession)
            const attackingTeam = Math.random() > 0.5 ? state.home : state.away;
            const shooter = attackingTeam.onCourt[Math.floor(Math.random() * 5)];
            
            const isThree = Math.random() > 0.7;
            const hitRate = isThree ? 0.35 : 0.45;
            
            shooter.fga += 1;
            if (isThree) shooter.p3a += 1;

            if (Math.random() < hitRate) {
                const pts = isThree ? 3 : 2;
                shooter.pts += pts;
                shooter.fgm += 1;
                if (isThree) shooter.p3m += 1;
                attackingTeam.score += pts;
            }
        }
    }

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
