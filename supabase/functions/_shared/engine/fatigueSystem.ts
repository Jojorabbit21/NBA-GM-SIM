
import { LivePlayer } from './pbp/pbpTypes.ts';
import { TacticalSliders, Player, Team } from '../types.ts';
import { SIM_CONFIG } from '../game/config/constants.ts';

export function calculateIncrementalFatigue(
    player: LivePlayer,
    timeTakenSeconds: number,
    sliders: TacticalSliders,
    isB2B: boolean,
    isStopper: boolean,
    injuryFrequency: number = 1.0
) {
    const C = SIM_CONFIG.FATIGUE;
    let drain = (timeTakenSeconds / 60) * C.DRAIN_BASE;

    const staminaMitigation = (player.attr.stamina - 50) / 100;
    drain *= (1 - staminaMitigation * 0.30);

    if (isB2B) drain *= 1.5;
    if (isStopper) drain *= 1.3;

    if (sliders.fullCourtPress > 1) {
        const pressPenalty = (sliders.fullCourtPress - 1) * 0.05;
        drain *= (1.0 + pressPenalty);
    }

    const effectiveCondition = Math.max(0, player.currentCondition);
    const cumulativeFatiguePenalty = 1.0 + Math.max(0, (100 - effectiveCondition) * 0.012);
    drain *= cumulativeFatiguePenalty;

    let injuryOccurred = false;
    const durability = player.attr?.durability ?? 70;
    const clampedDur = Math.max(40, durability);
    let baseInjuryChance: number;
    if (clampedDur >= 55) {
        baseInjuryChance = Math.max(0.12, 0.6 - clampedDur * 0.005);
    } else {
        const gap = 55 - clampedDur;
        baseInjuryChance = 0.325 + gap * gap * 0.04;
    }
    let fatigueBonus = 0;
    if (effectiveCondition < 35) {
        fatigueBonus = (35 - effectiveCondition) * 0.15;
    }
    if (effectiveCondition < 10) {
        fatigueBonus += (10 - effectiveCondition) * 0.5;
    }
    const totalChance = (baseInjuryChance + fatigueBonus) * injuryFrequency;
    const roll = Math.random() * 10000;
    if (roll < totalChance) {
        injuryOccurred = true;
    }

    return { drain, injuryOccurred };
}

export function calculateRecovery(player: LivePlayer, baseAmount: number): number {
    const C = SIM_CONFIG.FATIGUE;
    const staminaBonus  = ((player.attr.stamina    ?? 50) - 50) / 100;
    const durabilityBonus = ((player.attr.durability ?? 50) - 50) / 100;
    const multiplier = 1
        + staminaBonus   * C.RECOVERY_STAMINA_FACTOR
        + durabilityBonus * C.RECOVERY_DURABILITY_FACTOR;
    return baseAmount * multiplier;
}

export interface TrainingInjury {
    playerId: string;
    playerName: string;
    teamId: string;
    injuryType: string;
    duration: string;
    severity: 'Minor' | 'Major' | 'Season-Ending';
}

export function applyRestDayRecovery(teams: Team[], injuryFrequency: number = 1.0): TrainingInjury[] {
    const C = SIM_CONFIG.FATIGUE;
    const base = C.REST_DAY_RECOVERY;
    const trainingInjuries: TrainingInjury[] = [];

    for (const team of teams) {
        for (const player of team.roster) {
            const current = player.condition ?? 100;
            if (current < 100) {
                const staminaBonus = ((player.stamina ?? 50) - 50) / 100;
                const durabilityBonus = ((player.durability ?? 50) - 50) / 100;
                const multiplier = 1
                    + staminaBonus * C.RECOVERY_STAMINA_FACTOR
                    + durabilityBonus * C.RECOVERY_DURABILITY_FACTOR;

                const recovery = base * multiplier;
                const newCondition = Math.min(100, current + recovery);
                const delta = newCondition - current;

                player.condition = parseFloat(newCondition.toFixed(1));
                player.conditionDelta = parseFloat(delta.toFixed(1));
            }

            if (player.health !== 'Healthy') continue;

            const durability = player.durability ?? 70;
            const clampedDur = Math.max(40, durability);
            let baseChance: number;
            if (clampedDur >= 55) {
                baseChance = Math.max(0.024, (0.6 - clampedDur * 0.005)) * 0.2;
            } else {
                const gap = 55 - clampedDur;
                baseChance = (0.325 + gap * gap * 0.04) * 0.2;
            }

            const totalChance = baseChance * injuryFrequency;
            const roll = Math.random() * 10000;
            if (roll >= totalChance) continue;

            const tierRoll = Math.random() * 100;
            const seThreshold = Math.max(0.5, (12 - durability * 0.12)) * 0.5;
            const majorThreshold = seThreshold + Math.max(5, (40 - durability * 0.3)) * 0.5;

            let type: string;
            let duration: string;
            let severity: 'Minor' | 'Major' | 'Season-Ending';

            const pickWeighted = (options: string[], dur: number): string => {
                const n = options.length;
                const bias = (70 - dur) * 0.05;
                const weights = options.map((_, i) => {
                    const normalized = i / (n - 1);
                    return Math.max(0.1, 1 + bias * (normalized * 2 - 1));
                });
                const wTotal = weights.reduce((a, b) => a + b, 0);
                let r = Math.random() * wTotal;
                for (let i = 0; i < n; i++) {
                    r -= weights[i];
                    if (r <= 0) return options[i];
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
                type = majorInjuries[Math.floor(Math.random() * majorInjuries.length)];
                duration = pickWeighted(['2주', '3주', '1개월'], durability);
            } else {
                severity = 'Minor';
                const minorInjuries = ['근육 경직', '타박상', '발목 염좌', '무릎 통증', '허리 경직'];
                type = minorInjuries[Math.floor(Math.random() * minorInjuries.length)];
                duration = pickWeighted(['당일 복귀', '3일', '1주'], durability);
            }

            player.health = 'Injured';
            player.injuryType = type;
            player.returnDate = duration;

            trainingInjuries.push({
                playerId: player.id,
                playerName: player.name,
                teamId: team.id,
                injuryType: type,
                duration,
                severity,
            });
        }
    }

    return trainingInjuries;
}
