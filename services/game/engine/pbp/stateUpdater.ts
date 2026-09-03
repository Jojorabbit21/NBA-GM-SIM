
import { GameState, TeamState } from './pbpTypes';
import { calculateIncrementalFatigue, calculateRecovery } from '../fatigueSystem';
import { formatTime } from './timeEngine';
import { SIM_CONFIG } from '../../config/constants';
import { pickWeighted, pickInjuryGrade } from '../injuryGrades';

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
                // durability 기반 부상 등급 결정 — majorInjuryFrequency 필드가 없는(신규 배포 전
                // 저장된) 리그는 1.0으로 폴백.
                const dur = p.attr?.durability ?? 70;
                const majorFreq = state.simSettings.majorInjuryFrequency ?? 1.0;
                const grade = pickInjuryGrade(dur, majorFreq);

                const severity = grade.severity;
                const type = grade.injuries[Math.floor(Math.random() * grade.injuries.length)];
                const duration = pickWeighted(grade.durations, dur);

                p.health = 'Injured';
                p.injuryType = type;
                p.returnDate = duration;
                p.injuredThisGame = true;

                // Add Log
                const timeStr = formatTime(state.gameClock);
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: timeStr,
                    teamId: team.id,
                    text: `🚨 ${p.playerName} 선수가 고통을 호소하며 쓰러졌습니다. (${type})`,
                    type: 'injury'
                });

                // Record Structural Injury Event
                state.injuries.push({
                    playerId: p.playerId,
                    playerName: p.playerName,
                    teamId: team.id,
                    injuryType: type,
                    durationDesc: duration,
                    severity,
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
