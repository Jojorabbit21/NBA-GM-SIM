
import { GameState, TeamState } from './pbpTypes';
import { calculateIncrementalFatigue, calculateRecovery } from '../fatigueSystem';
import { formatTime } from './timeEngine';
import { SIM_CONFIG } from '../../config/constants';

/**
 * Updates fatigue, injury checks, and minutes played for all players on court.
 * Also recovers stamina for players on the bench.
 */
export function updateOnCourtStates(state: GameState, timeTaken: number) {
    const teams = [state.home, state.away];
    const C = SIM_CONFIG.FATIGUE;
    
    teams.forEach(team => {
        const isB2B = team.id === state.home.id ? state.isHomeB2B : state.isAwayB2B;
        
        // 1. Process On-Court Players (Drain Fatigue & Update MP)
        team.onCourt.forEach(p => {
            // Update MP
            p.mp += timeTaken / 60;

            // Fatigue Calculation
            // Check if Ace Stopper
            const isStopper = team.tactics.stopperId === p.playerId;

            const fatigueRes = calculateIncrementalFatigue(
                p,
                timeTaken,
                team.tactics.sliders,
                isB2B,
                isStopper,
                state.simSettings.injuryFrequency
            );

            // Apply Drain
            p.currentCondition = Math.max(0, p.currentCondition - fatigueRes.drain);

            // Injury Check — state.simSettings.injuriesEnabled로 제어
            if (state.simSettings.injuriesEnabled && fatigueRes.injuryOccurred && p.health === 'Healthy') {
                const injuryTypes = ['Ankle Sprain', 'Hamstring Strain', 'Knee Soreness', 'Calf Strain', 'Back Spasms'];
                const durations = ['1 Week', '2 Weeks', '1 Month', 'Day-to-Day', '3 Days'];
                
                const type = injuryTypes[Math.floor(Math.random() * injuryTypes.length)];
                const duration = durations[Math.floor(Math.random() * durations.length)];

                p.health = 'Injured';
                p.injuryType = type;
                p.returnDate = duration; // Storing duration string temporarily as returnDate for simple display
                
                // Add Log
                const timeStr = formatTime(state.gameClock);
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: timeStr,
                    teamId: team.id,
                    text: `🚨 ${p.playerName} 선수가 고통을 호소하며 쓰러졌습니다. (${type})`,
                    type: 'info'
                });

                // [New] Record Structural Injury Event
                state.injuries.push({
                    playerId: p.playerId,
                    playerName: p.playerName,
                    teamId: team.id,
                    injuryType: type,
                    durationDesc: duration,
                    quarter: state.quarter,
                    timeRemaining: timeStr
                });
            }
        });

        // 2. Process Bench Players (Recover Fatigue)
        // Stamina + Durability 기반 개인별 회복 속도 적용
        if (team.bench.length > 0) {
            const baseAmount = (timeTaken / 60) * C.BENCH_RECOVERY_RATE;

            team.bench.forEach(p => {
                if (p.currentCondition < 100) {
                    const recovery = calculateRecovery(p, baseAmount);
                    p.currentCondition = Math.min(100, p.currentCondition + recovery);

                    if (p.isShutdown && p.currentCondition > 70) {
                        p.isShutdown = false;
                    }
                }
            });
        }
    });
}
