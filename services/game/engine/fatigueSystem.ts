
import { LivePlayer } from './pbp/pbpTypes';
import { TacticalSliders, Player, Team } from '../../../types';
import { SIM_CONFIG } from '../config/constants';

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

    // [New] Full Court Press Fatigue Impact
    // Pressing consumes significantly more energy.
    // Scale: Level 1 (0% penalty) -> Level 10 (45% penalty)
    if (sliders.fullCourtPress > 1) {
        const pressPenalty = (sliders.fullCourtPress - 1) * 0.05;
        drain *= (1.0 + pressPenalty);
    }

    // [Fix] player.currentCondition이 0 미만으로 계산에 참여하지 않도록 Math.max 처리
    const effectiveCondition = Math.max(0, player.currentCondition);
    const cumulativeFatiguePenalty = 1.0 + Math.max(0, (100 - effectiveCondition) * 0.012);
    drain *= cumulativeFatiguePenalty;

    // Injury Check (Micro-roll) — injuriesEnabled는 stateUpdater에서 체크
    // 기본 확률(0.03%) + 체력 저하 시 추가 확률 (durability 반영)
    let injuryOccurred = false;
    const durability = player.attr?.durability ?? 70;
    // 기본 부상 확률: durability 높을수록 낮음 (dur 70: 3/10000, dur 90: 1/10000, dur 50: 5/10000)
    const baseInjuryChance = Math.max(0.5, 5 - durability * 0.04);
    // 체력 저하 추가 확률: 체력 50 이하부터 점진적 증가, 15 이하에서 급등
    let fatigueBonus = 0;
    if (effectiveCondition < 50) {
        fatigueBonus = (50 - effectiveCondition) * 0.8;
    }
    if (effectiveCondition < 15) {
        fatigueBonus += (15 - effectiveCondition) * 3.0;
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

/**
 * 비경기일 휴식 회복: 모든 팀의 모든 선수에게 REST_DAY_RECOVERY 적용.
 * stamina/durability가 높을수록 더 빠르게 회복.
 *
 * 기본 25pt 회복 기준:
 *   stamina 50 / durability 50 → 25 회복
 *   stamina 90 / durability 90 → 30 회복
 *   stamina 30 / durability 30 → 22.5 회복
 */
export function applyRestDayRecovery(teams: Team[]): void {
    const C = SIM_CONFIG.FATIGUE;
    const base = C.REST_DAY_RECOVERY;

    for (const team of teams) {
        for (const player of team.roster) {
            const current = player.condition ?? 100;
            if (current >= 100) continue;

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
    }
}
