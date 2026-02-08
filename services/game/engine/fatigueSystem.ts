
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

    // [Fix] player.currentCondition이 0 미만일 때 가중치가 폭발하지 않도록 보정
    const effectiveCondition = Math.max(0, player.currentCondition);
    const cumulativeFatiguePenalty = 1.0 + Math.max(0, (100 - effectiveCondition) * 0.012);
    drain *= cumulativeFatiguePenalty;

    // Injury Check (Micro-roll)
    let injuryOccurred = false;
    if (effectiveCondition < 30) {
        const roll = Math.random() * 10000;
        if (roll < (30 - effectiveCondition) * 2.5) {
            injuryOccurred = true;
        }
    }

    return { drain, injuryOccurred };
}
