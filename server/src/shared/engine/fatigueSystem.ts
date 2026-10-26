
import { LivePlayer } from './pbp/pbpTypes.ts';
import { TacticalSliders, Player, Team } from '../types.ts';
import { SIM_CONFIG } from '../game/config/constants.ts';
import { interpolateCurve } from './pbp/flowEngine.ts';
import { pickWeighted, pickInjuryGrade } from './injuryGrades.ts';

export function calculateIncrementalFatigue(
    player: LivePlayer,
    timeTakenSeconds: number,
    sliders: TacticalSliders,
    isB2B: boolean,
    isStopper: boolean,
    injuryFrequency: number = 1.0,
    // [2026-10-17] B2B drain multiplier — multiplayer passes sim_settings.fatigueB2BMultiplier (resolved, default 1.3).
    // Fallback 1.5 = previous hardcoded value (single keeps it).
    b2bMultiplier: number = 1.5,
    drainMultiplier: number = 1.0
) {
    const C = SIM_CONFIG.FATIGUE;
    let drain = (timeTakenSeconds / 60) * C.DRAIN_BASE;

    const staminaMitigation = (player.attr.stamina - 50) / 100;
    drain *= (1 - staminaMitigation * 0.30);

    if (isB2B) drain *= b2bMultiplier;
    if (isStopper) drain *= 1.3;

    // [2026-10-23] 풀코트 프레스 체력 소모 — 호출부(stateUpdater)가 프레스를 거는 수비 포세션에만 실제 단계를 넘기고
    // (아니면 1), C·PF 슬롯은 환산 단계를 넘긴다. 9~10단계 배율 × DRAIN_MAX × ((단계−1)/9)^DRAIN_EXP × 스태미나 배율.
    // (이전: 공·수 모든 포세션에 1 + (단계−1)×0.15/9, 10단계 +15% 직선)
    if (sliders.fullCourtPress > 1) {
        const P = SIM_CONFIG.FULL_COURT_PRESS;
        const staminaScale = Math.max(P.DRAIN_STAMINA_MIN, Math.min(P.DRAIN_STAMINA_MAX,
            1 - ((player.attr.stamina ?? 70) - P.DRAIN_STAMINA_NEUTRAL) * P.DRAIN_STAMINA_SLOPE));
        const pressPenalty = (P.HIGH_LEVEL_MULT[sliders.fullCourtPress] ?? 1) * P.DRAIN_MAX
            * Math.pow((sliders.fullCourtPress - 1) / 9, P.DRAIN_EXP) * staminaScale;
        drain *= (1.0 + pressPenalty);
    }

    // [defIntensity 체력 트레이드오프] 1단계 +5%p(절약) ~ 10단계 -8%p(추가 소모) 선형
    const intensityFatigueMod = interpolateCurve(sliders.defIntensity, C.DEF_INTENSITY_CURVE);
    drain *= (1 - intensityFatigueMod / 100);

    // [pace 체력 트레이드오프 2026-07 신규] 5단계 미만 페널티 없음, 5단계 +5% ~ 10단계 +15% 선형
    // [2026-10-25] 중립(5) 기준 대칭 커브로 교체 — 1단계 −8%(절약) / 5단계 0% / 10단계 +30%. 슛 감점 삭제 후 빠른 페이스의 유일한 대가.
    // 이전: pace ≥ 5일 때 5% + (pace−5)×2% (10단계 +15%)
    drain *= (1 + interpolateCurve(sliders.pace, C.PACE_FATIGUE_CURVE) / 100);

    // [defReb 속공 트레이드오프 C] defReb<5일 때만 추가 체력 소모 (매 포제션 상시, 팀 전체 균일 — 1단계 +1.5%p ~ 5단계 0%p)
    const drtCfg = SIM_CONFIG.DEF_REB_TRANSITION;
    if (sliders.defReb < drtCfg.FREQ_THRESHOLD) {
        const defRebFatiguePenalty = (drtCfg.FREQ_THRESHOLD - sliders.defReb) * drtCfg.FATIGUE_PENALTY_PER_LEVEL;
        drain *= (1 + defRebFatiguePenalty / 100);
    }

    const effectiveCondition = Math.max(0, player.currentCondition);
    const cumulativeFatiguePenalty = 1.0 + Math.max(0, (100 - effectiveCondition) * 0.012);
    drain *= cumulativeFatiguePenalty;

    // [2026-10-26] In-game drain coefficient — multiplayer sim_settings.fatigueDrainMultiplier (default 1.0). Final multiplier after all modifiers; does not affect injury chance.
    drain *= drainMultiplier;

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
    severity: 'Grade1' | 'Grade2' | 'Grade3' | 'Grade4' | 'Grade5';
}

/** 훈련 중 부상은 경기 중보다 중증 비율을 낮춘다(GRADE3 이상 가중치에 0.5를 곱함). */
const TRAINING_SEVERITY_MULTIPLIER = 0.5;

export function applyRestDayRecovery(
    teams: Team[],
    injuryFrequency: number = 1.0,
    majorInjuryFrequency: number = 1.0,
): TrainingInjury[] {
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

            const grade = pickInjuryGrade(durability, majorInjuryFrequency, TRAINING_SEVERITY_MULTIPLIER);
            const severity = grade.severity;
            const type = grade.injuries[Math.floor(Math.random() * grade.injuries.length)];
            const duration = pickWeighted(grade.durations, durability);

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
