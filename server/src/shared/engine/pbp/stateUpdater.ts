
import { GameState, TeamState } from './pbpTypes.ts';
import { calculateIncrementalFatigue, calculateRecovery } from '../fatigueSystem.ts';
import { formatTime } from './timeEngine.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';
import { pickWeighted, pickInjuryGrade } from '../injuryGrades.ts';

export function updateOnCourtStates(state: GameState, timeTaken: number) {
    const teams = [state.home, state.away];
    const C = SIM_CONFIG.FATIGUE;

    teams.forEach(team => {
        const isB2B = team.id === state.home.id ? state.isHomeB2B : state.isAwayB2B;

        team.onCourt.forEach(p => {
            p.mp += timeTaken / 60;

            const isStopper = team.tactics.stopperId === p.playerId;
            const fatigueRes = calculateIncrementalFatigue(
                p, timeTaken, team.tactics.sliders, isB2B, isStopper,
                state.simSettings.injuryFrequency
            );

            p.currentCondition = Math.max(0, p.currentCondition - fatigueRes.drain);

            if (state.simSettings.injuriesEnabled && fatigueRes.injuryOccurred && p.health === 'Healthy') {
                // majorInjuryFrequency 필드가 없는(신규 배포 전 저장된) 리그는 1.0으로 폴백.
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

                const timeStr = formatTime(state.gameClock);
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: timeStr,
                    teamId: team.id,
                    text: `부상: ${p.playerName} (${type})`,
                    type: 'injury',
                });
                state.injuries.push({
                    playerId: p.playerId,
                    playerName: p.playerName,
                    teamId: team.id,
                    injuryType: type,
                    durationDesc: duration,
                    severity,
                    quarter: state.quarter,
                    timeRemaining: timeStr,
                });
            }
        });

        if (team.bench.length > 0) {
            const baseAmount = (timeTaken / 60) * C.BENCH_RECOVERY_RATE;
            team.bench.forEach(p => {
                if (p.currentCondition < 100) {
                    const recovery = calculateRecovery(p, baseAmount);
                    p.currentCondition = Math.min(100, p.currentCondition + recovery);
                    if (p.isShutdown && p.currentCondition > 70) p.isShutdown = false;
                }
            });
        }
    });
}
