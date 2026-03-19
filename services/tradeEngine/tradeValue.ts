
import { Player } from '../../types';
import { calculatePlayerOvr, getOVRThreshold } from '../../utils/constants';
import { TRADE_CONFIG as C } from './tradeConfig';
import type { TeamTradeState } from '../../types/trade';
import type { GMProfile } from '../../types/gm';
import { determineFARole } from '../fa/faValuation';

export function getPlayerTradeValue(p: Player): number {
    const ovr = calculatePlayerOvr(p);
    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, ovr);

    let value = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    // Superstar / Star premium
    if (ovr >= getOVRThreshold('SUPERSTAR')) value *= C.BASE.SUPERSTAR_MULTIPLIER;
    else if (ovr >= getOVRThreshold('STAR')) value *= C.BASE.STAR_MULTIPLIER;

    // Age adjustment
    if (p.age <= C.AGE.YOUNG_PREMIUM_AGE && p.potential > ovr) {
        value *= (1.0 + ((p.potential - ovr) * C.AGE.YOUNG_PREMIUM_RATE));
    } else if (p.age >= C.AGE.DECLINE_START_AGE) {
        const yearsOver = p.age - C.AGE.DECLINE_START_AGE + 1;
        value *= Math.max(C.AGE.DECLINE_FLOOR, 1.0 - (yearsOver * C.AGE.DECLINE_RATE_PER_YEAR));
    }

    // Contract penalty
    if (ovr < getOVRThreshold('STARTER') && p.salary > C.CONTRACT.BAD_CONTRACT_SALARY) {
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

/**
 * 리그 공통 시장가치 — 기존 getPlayerTradeValue와 동일 (alias로 재사용).
 * 향후 희소성 보정 등을 추가하려면 여기서 확장.
 */
export function getPlayerMarketValue(player: Player): number {
    return getPlayerTradeValue(player);
}

/**
 * GM 성격과 팀 상태를 반영한 팀별 선수 가치.
 * market value + 필요도 핏 보너스 + 타임라인 보너스 + 성격 보정 - 패널티
 */
export function getPlayerValueToTeam(
    player: Player,
    teamState: TeamTradeState,
    gmProfile: GMProfile,
): number {
    const base = getPlayerMarketValue(player);
    const ovr = calculatePlayerOvr(player);
    const sliders = gmProfile.sliders;
    let value = base;

    // 1. 역할 필요도 보너스 (팀이 해당 롤을 필요로 할수록 +)
    const role = determineFARole(player);
    const roleNeed = teamState.needs[role] ?? 0;
    value += base * roleNeed * 0.3;

    // 2. 타임라인 보너스 (팀 평균 나이와 가까울수록 +)
    const ageDiff = Math.abs(player.age - teamState.timelineAge);
    if (ageDiff <= 3) value *= 1.05;
    else if (ageDiff >= 8) value *= 0.85;

    // 3. 스타 의향 보너스 (sliders 1~10)
    const starFactor = sliders.starWillingness / 10;
    if (starFactor > 0.6) {
        if (ovr >= getOVRThreshold('STAR')) value *= 1.0 + starFactor * 0.25;
        else if (ovr >= getOVRThreshold('STARTER')) value *= 1.0 + starFactor * 0.12;
    }

    // 4. 유스 편향 보너스/패널티
    const youthFactor = sliders.youthBias / 10;
    if (youthFactor > 0.6) {
        if (player.age <= 23 && player.potential > ovr) {
            value *= 1.0 + (player.potential - ovr) * 0.06 * youthFactor;
        }
        if (player.age >= 32) {
            value *= Math.max(0.5, 1.0 - (player.age - 31) * 0.04 * youthFactor);
        }
    }

    // 5. 부상 패널티 (리스크 허용이 높을수록 패널티 감소)
    const riskFactor = sliders.riskTolerance / 10;
    if (player.health === 'Injured') {
        const rawPenalty = base * 0.6;
        value -= rawPenalty * (1 - riskFactor * 0.7);
    } else if (player.health === 'Day-to-Day') {
        value *= 1.0 - 0.05 * (1 - riskFactor * 0.5);
    }

    // 6. 중복 포지션 패널티
    const positionKey = player.position.split('/')[0]; // 주포지션
    const surplus = teamState.surpluses[positionKey] ?? 0;
    if (surplus >= 2) value *= 0.85;

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
