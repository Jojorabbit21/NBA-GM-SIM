
import { LivePlayer } from './pbp/pbpTypes';
import { TacticalSliders, OffenseTactic, DefenseTactic } from '../../../types';
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
    offTactic: OffenseTactic,
    defTactic: DefenseTactic
) {
    const C = SIM_CONFIG.FATIGUE;
    let drain = (timeTakenSeconds / 60) * C.DRAIN_BASE;

    // Mitigation based on player attributes
    drain *= (1 - (player.attr.stamina * C.STAMINA_SAVE_FACTOR / 100));

    if (isB2B) drain *= 1.5;
    if (isStopper) drain *= 1.3;

    // [Fix] player.currentCondition이 0 미만으로 계산에 참여하지 않도록 Math.max 처리
    const effectiveCondition = Math.max(0, player.currentCondition);
    const cumulativeFatiguePenalty = 1.0 + Math.max(0, (100 - effectiveCondition) * 0.012);
    drain *= cumulativeFatiguePenalty;

    // Injury Check (Micro-roll)
    let injuryOccurred = false;
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

    return { drain, injuryOccurred };
}
