
import { LivePlayer } from './pbp/pbpTypes';
import { TacticalSliders } from '../../../types';
import { SIM_CONFIG } from '../config/constants';

/**
 * Calculates incremental fatigue during a possession based on various factors.
 */
export function calculateIncrementalFatigue(
    player: LivePlayer,
    timeTakenSeconds: number,
    sliders: TacticalSliders,
    isB2B: boolean,
    isStopper: boolean
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

    // Injury Check (Micro-roll)
    let injuryOccurred = false;
    
    // [Disabled] Injury logic temporarily disabled per user request
    /*
    // [Update] Lowered threshold from 30 to 15 to reduce injury frequency
    if (effectiveCondition < 15) {
        const roll = Math.random() * 10000;
        // Adjusted multiplier to 5.0:
        // At condition 14: (15-14)*5 = 5/10000 = 0.05%
        // At condition 0:  (15-0)*5  = 75/10000 = 0.75% (Same peak risk as before, but safer zone is larger)
        if (roll < (15 - effectiveCondition) * 5.0) {
            injuryOccurred = true;
        }
    }
    */

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
