
import { Player } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { TRADE_CONFIG as C } from './tradeConfig';

export function getPlayerTradeValue(p: Player): number {
    const ovr = calculatePlayerOvr(p);
    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, ovr);

    let value = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    // Superstar / Star premium
    if (ovr >= C.BASE.SUPERSTAR_PREMIUM_THRESHOLD) value *= C.BASE.SUPERSTAR_MULTIPLIER;
    else if (ovr >= 85) value *= C.BASE.STAR_MULTIPLIER;

    // Age adjustment
    if (p.age <= C.AGE.YOUNG_PREMIUM_AGE && p.potential > ovr) {
        value *= (1.0 + ((p.potential - ovr) * C.AGE.YOUNG_PREMIUM_RATE));
    } else if (p.age >= C.AGE.DECLINE_START_AGE) {
        const yearsOver = p.age - C.AGE.DECLINE_START_AGE + 1;
        value *= Math.max(C.AGE.DECLINE_FLOOR, 1.0 - (yearsOver * C.AGE.DECLINE_RATE_PER_YEAR));
    }

    // Contract penalty
    if (ovr < C.CONTRACT.BAD_CONTRACT_OVR && p.salary > C.CONTRACT.BAD_CONTRACT_SALARY) {
        value *= C.CONTRACT.BAD_CONTRACT_PENALTY;
        if (p.contractYears >= 3) value *= C.CONTRACT.LONG_BAD_PENALTY;
    }
    if (p.contractYears === 1 && ovr >= 75) {
        value *= C.CONTRACT.EXPIRING_BONUS;
    }

    // Injury penalty
    if (p.health === 'Injured') value *= C.INJURY.INJURED_PENALTY;
    else if (p.health === 'Day-to-Day') value *= C.INJURY.DTD_PENALTY;

    return Math.max(1, Math.floor(value));
}

export function calculatePackageTrueValue(players: Player[]): number {
    const sorted = [...players].sort((a, b) => getPlayerTradeValue(b) - getPlayerTradeValue(a));
    const weights = C.DEPTH.PACKAGE_WEIGHTS;

    let total = 0;
    sorted.forEach((p, idx) => {
        const weight = idx < weights.length ? weights[idx] : 0.05;
        total += getPlayerTradeValue(p) * weight;
    });

    return total;
}
