
import { GameState, TeamState } from './pbpTypes.ts';
import { calculateIncrementalFatigue, calculateRecovery } from '../fatigueSystem.ts';
import { formatTime } from './timeEngine.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';

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
                const dur = p.attr?.durability ?? 70;
                const tierRoll = Math.random() * 100;
                const seThreshold  = Math.max(1, 12 - dur * 0.12);
                const majorThreshold = seThreshold + Math.max(10, 40 - dur * 0.3);

                const pickWeighted = (options: string[], d: number): string => {
                    const n = options.length;
                    const bias = (70 - d) * 0.05;
                    const weights = options.map((_, i) => {
                        const normalized = i / (n - 1);
                        return Math.max(0.1, 1 + bias * (normalized * 2 - 1));
                    });
                    const total = weights.reduce((a, b) => a + b, 0);
                    let roll = Math.random() * total;
                    for (let i = 0; i < n; i++) { roll -= weights[i]; if (roll <= 0) return options[i]; }
                    return options[n - 1];
                };

                let severity: 'Minor' | 'Major' | 'Season-Ending';
                let type: string;
                let duration: string;

                if (tierRoll < seThreshold) {
                    severity = 'Season-Ending';
                    const seInjuries = ['전방십자인대(ACL) 파열', '아킬레스건 파열', '골절', '반월판 파열'];
                    type = seInjuries[Math.floor(Math.random() * seInjuries.length)];
                    duration = '시즌아웃';
                } else if (tierRoll < majorThreshold) {
                    severity = 'Major';
                    type = ['햄스트링 부상', '종아리 부상', '발목 인대 손상', '허리 경련'][Math.floor(Math.random() * 4)];
                    duration = pickWeighted(['2주', '3주', '1개월'], dur);
                } else {
                    severity = 'Minor';
                    type = ['발목 염좌', '무릎 통증', '허리 경직', '타박상'][Math.floor(Math.random() * 4)];
                    duration = pickWeighted(['당일 복귀', '3일', '1주'], dur);
                }

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
