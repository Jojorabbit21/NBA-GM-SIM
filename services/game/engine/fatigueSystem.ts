
import { LivePlayer } from './pbp/pbpTypes';
import { TacticalSliders, Player, Team } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { interpolateCurve } from './pbp/flowEngine';
import { pickWeighted, pickInjuryGrade } from './injuryGrades';

/**
 * Calculates incremental fatigue during a possession based on various factors.
 */
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

    // Mitigation based on player stamina attribute
    // stamina 50 = 기준(변화 없음), 90 = 12% 감소, 30 = 6% 증가
    const staminaMitigation = (player.attr.stamina - 50) / 100;
    drain *= (1 - staminaMitigation * 0.30);

    if (isB2B) drain *= 1.5;
    if (isStopper) drain *= 1.3;

    // [Fix 2026-07-26] Full Court Press Fatigue Impact
    // Pressing consumes more energy, in exchange for steal/TOV유발/샷클락 위반 보너스(possessionHandler.ts).
    // Scale: Level 1 (0% penalty) -> Level 10 (15% penalty, 기존 45%에서 하향)
    if (sliders.fullCourtPress > 1) {
        const pressPenalty = (sliders.fullCourtPress - 1) * (0.15 / 9);
        drain *= (1.0 + pressPenalty);
    }

    // [defIntensity 체력 트레이드오프] 1단계 +5%p(절약) ~ 10단계 -8%p(추가 소모) 선형
    const intensityFatigueMod = interpolateCurve(sliders.defIntensity, C.DEF_INTENSITY_CURVE);
    drain *= (1 - intensityFatigueMod / 100);

    // [pace 체력 트레이드오프 2026-07 신규] 5단계 미만 페널티 없음, 5단계 +5% ~ 10단계 +15% 선형
    if (sliders.pace >= C.PACE_FATIGUE_THRESHOLD) {
        const paceFatiguePenalty = C.PACE_FATIGUE_BASE + (sliders.pace - C.PACE_FATIGUE_THRESHOLD) * C.PACE_FATIGUE_PER_LEVEL;
        drain *= (1 + paceFatiguePenalty / 100);
    }

    // [defReb 속공 트레이드오프 C] defReb<5일 때만 추가 체력 소모 (매 포제션 상시, 팀 전체 균일 — 1단계 +1.5%p ~ 5단계 0%p)
    const drtCfg = SIM_CONFIG.DEF_REB_TRANSITION;
    if (sliders.defReb < drtCfg.FREQ_THRESHOLD) {
        const defRebFatiguePenalty = (drtCfg.FREQ_THRESHOLD - sliders.defReb) * drtCfg.FATIGUE_PENALTY_PER_LEVEL;
        drain *= (1 + defRebFatiguePenalty / 100);
    }

    // [Fix] player.currentCondition이 0 미만으로 계산에 참여하지 않도록 Math.max 처리
    const effectiveCondition = Math.max(0, player.currentCondition);
    const cumulativeFatiguePenalty = 1.0 + Math.max(0, (100 - effectiveCondition) * 0.012);
    drain *= cumulativeFatiguePenalty;

    // Injury Check (Micro-roll) — injuriesEnabled는 stateUpdater에서 체크
    // 기본 확률(0.03%) + 체력 저하 시 추가 확률 (durability 반영)
    let injuryOccurred = false;
    const durability = player.attr?.durability ?? 70;
    // 기본 부상 확률: durability 비선형 커브
    // dur 99: 0.12, dur 90: 0.15, dur 80: 0.20, dur 70: 0.25, dur 60: 0.30, dur 55: 0.325 (경계)
    // dur 55 이하: 이차함수 급등 (dur 50: 1.325, dur 45: 4.325, dur 40: 9.325)
    // dur 40 미만은 40으로 취급 (바닥)
    const clampedDur = Math.max(40, durability);
    let baseInjuryChance: number;
    if (clampedDur >= 55) {
        baseInjuryChance = Math.max(0.12, 0.6 - clampedDur * 0.005);
    } else {
        // 55~40: 전 구간 급경사 (gap² × 0.04)
        const gap = 55 - clampedDur;
        baseInjuryChance = 0.325 + gap * gap * 0.04;
    }
    // 체력 저하 추가 확률: 체력 35 이하부터 완만 증가, 10 이하에서 소폭 급등
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

/**
 * 선수별 체력 회복량 계산 (Stamina + Durability 반영)
 * 벤치 회복, 타임아웃, 쿼터 휴식, 하프타임 등 모든 회복에 공통 적용.
 *
 * stamina 50 / durability 50 = 기준(변화 없음)
 * stamina 90 / durability 90 = +12% / +8% = 총 +20% 회복량
 * stamina 30 / durability 30 = -6% / -4% = 총 -10% 회복량
 */
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

/** 훈련 중 부상은 경기 중보다 중증 비율을 낮춘다(GRADE3 이상 가중치에 0.5를 곱함) — 기존
 *  seThreshold/majorThreshold를 0.5배 하던 것과 동일한 의도를 새 가중치 방식으로 재현. */
const TRAINING_SEVERITY_MULTIPLIER = 0.5;

/**
 * 비경기일 휴식 회복: 모든 팀의 모든 선수에게 REST_DAY_RECOVERY 적용.
 * stamina/durability가 높을수록 더 빠르게 회복.
 *
 * 훈련 중 부상: 건강한 선수 중 durability가 낮은 선수는 훈련/일상 활동 중 부상 가능.
 * 경기 중 부상 확률의 ~1/5 수준. GRADE1~5 등급(injuryGrades.ts 공용).
 * 경기 중보다 중증(GRADE3+) 비율 절반으로 감소(TRAINING_SEVERITY_MULTIPLIER).
 * dur 90+: 거의 0%, dur 55 이하: 급증 (비선형 커브 동일)
 *
 * 기본 40pt 회복 기준:
 *   stamina 50 / durability 50 → 40 회복
 *   stamina 90 / durability 90 → 48 회복
 *   stamina 30 / durability 30 → 36 회복
 */
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
            // 체력 회복
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

            // 훈련 중 부상 체크 (건강한 선수만)
            if (player.health !== 'Healthy') continue;

            const durability = player.durability ?? 70;
            const clampedDur = Math.max(40, durability);
            let baseChance: number;
            if (clampedDur >= 55) {
                // dur 55~99: 완만 (경기 중의 1/5)
                baseChance = Math.max(0.024, (0.6 - clampedDur * 0.005)) * 0.2;
            } else {
                // dur 40~55: 이차함수 급등 (경기 중의 1/5)
                const gap = 55 - clampedDur;
                baseChance = (0.325 + gap * gap * 0.04) * 0.2;
            }

            const totalChance = baseChance * injuryFrequency;
            const roll = Math.random() * 10000;
            if (roll >= totalChance) continue;

            // 부상 등급(GRADE1~5) 결정 — injuryGrades.ts 공용 로직, 훈련 중이라 GRADE3+
            // 비중을 TRAINING_SEVERITY_MULTIPLIER(0.5배)만큼 낮춰서 뽑는다.
            const grade = pickInjuryGrade(durability, majorInjuryFrequency, TRAINING_SEVERITY_MULTIPLIER);
            const severity = grade.severity;
            const type = grade.injuries[Math.floor(Math.random() * grade.injuries.length)];
            const duration = pickWeighted(grade.durations, durability);

            player.health = 'Injured';
            player.injuryType = type;
            // returnDate는 호출측에서 computeReturnDate로 변환
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
