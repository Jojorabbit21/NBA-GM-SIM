
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
                // durability 기반 부상 등급 결정
                const dur = p.attr?.durability ?? 70;
                const tierRoll = Math.random() * 100;
                // dur 50: 60/30/10, dur 70: 72/24/4, dur 90: 84/14/2
                const seThreshold = Math.max(1, 12 - dur * 0.12);
                const majorThreshold = seThreshold + Math.max(10, 40 - dur * 0.3);

                let severity: 'Minor' | 'Major' | 'Season-Ending';
                let type: string;
                let duration: string;

                // durability 기반 가중치 랜덤 선택 (낮을수록 긴 기간에 가중)
                // dur 40: 긴 기간 가중, dur 90: 짧은 기간 가중
                const pickWeighted = (options: string[], dur: number): string => {
                    const n = options.length;
                    // dur 40 → bias 1.5 (긴 쪽 가중), dur 70 → bias 0 (균등), dur 90 → bias -0.6 (짧은 쪽 가중)
                    const bias = (70 - dur) * 0.05;
                    const weights = options.map((_, i) => {
                        const normalized = i / (n - 1); // 0(짧)~1(긴)
                        return Math.max(0.1, 1 + bias * (normalized * 2 - 1));
                    });
                    const total = weights.reduce((a, b) => a + b, 0);
                    let roll = Math.random() * total;
                    for (let i = 0; i < n; i++) {
                        roll -= weights[i];
                        if (roll <= 0) return options[i];
                    }
                    return options[n - 1];
                };

                if (tierRoll < seThreshold) {
                    severity = 'Season-Ending';
                    const seInjuries = ['전방십자인대(ACL) 파열', '아킬레스건 파열', '골절', '반월판 파열'];
                    type = seInjuries[Math.floor(Math.random() * seInjuries.length)];
                    duration = '시즌아웃';
                } else if (tierRoll < majorThreshold) {
                    severity = 'Major';
                    const majorInjuries = ['햄스트링 부상', '종아리 부상', '발목 인대 손상', '허리 경련', '어깨 부상', '사타구니 부상'];
                    const majorDurations = ['2주', '3주', '1개월']; // 짧→긴 순
                    type = majorInjuries[Math.floor(Math.random() * majorInjuries.length)];
                    duration = pickWeighted(majorDurations, dur);
                } else {
                    severity = 'Minor';
                    const minorInjuries = ['발목 염좌', '무릎 통증', '허리 경직', '타박상', '손가락 염좌'];
                    const minorDurations = ['당일 복귀', '3일', '1주']; // 짧→긴 순
                    type = minorInjuries[Math.floor(Math.random() * minorInjuries.length)];
                    duration = pickWeighted(minorDurations, dur);
                }

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
