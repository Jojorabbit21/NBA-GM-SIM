
import { GameState, TeamState } from './pbpTypes.ts';
import { calculateIncrementalFatigue, calculateRecovery } from '../fatigueSystem.ts';
import { formatTime } from './timeEngine.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';
import { pickWeighted, pickInjuryGrade } from '../injuryGrades.ts';

export function updateOnCourtStates(state: GameState, timeTaken: number) {
    const teams = [state.home, state.away];
    const C = SIM_CONFIG.FATIGUE;

    // [2026-10-23] 프레스 체력 소모는 프레스를 거는 수비팀에만(공격 포세션·프레스 미적용 포세션은 1단계로), C·PF 슬롯은 절반 강도
    const pressingTeam = state.pressActiveThisPossession ? (state.possession === 'home' ? state.away : state.home) : null;
    const pressCfg = SIM_CONFIG.FULL_COURT_PRESS;

    teams.forEach(team => {
        const isB2B = team.id === state.home.id ? state.isHomeB2B : state.isAwayB2B;

        team.onCourt.forEach(p => {
            p.mp += timeTaken / 60;

            const isStopper = team.tactics.stopperId === p.playerId;
            const __lvl = team.tactics.sliders.fullCourtPress;
            const __effLvl = team !== pressingTeam ? 1
                : (p.position === 'C' || p.position === 'PF') ? 1 + (__lvl - 1) * pressCfg.DRAIN_BIG_SHARE : __lvl;
            const __fatigueSliders = __effLvl === __lvl ? team.tactics.sliders : { ...team.tactics.sliders, fullCourtPress: __effLvl };
            const fatigueRes = calculateIncrementalFatigue(
                p, timeTaken, __fatigueSliders, isB2B, isStopper,
                state.simSettings.injuryFrequency,
                state.simSettings.fatigueB2BMultiplier ?? 1.5
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
