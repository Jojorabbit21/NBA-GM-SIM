
import type { TeamTradeState } from '../../types/trade';
import type { GMProfile } from '../../types/gm';

// 참가 점수 임계값 — 이 이상이면 시장 참가
export const PARTICIPATION_THRESHOLD = 0.35;

/**
 * 팀이 이번 트레이드 사이클에 시장에 참가해야 하는지 결정하는 점수 (0~1).
 *
 * 높은 필요도, 적극적인 GM, 데드라인 근접 시 상승.
 * 최근 트레이드 직후 쿨다운 패널티 적용.
 */
export function calculateParticipationScore(
    teamState: TeamTradeState,
    gmProfile: GMProfile,
    daysSinceLastTrade: number,   // 마지막 트레이드 후 경과 일수
    daysToDeadline: number,        // 트레이드 데드라인까지 남은 일수
): number {
    let score = 0;

    // 1. 팀 필요도 (가장 심각한 롤 부재)
    const needs = Object.values(teamState.needs);
    const maxNeed = needs.length > 0 ? Math.max(...needs) : 0;
    score += maxNeed * 0.25;

    // 2. 성적 vs 전력 괴리 (전력 대비 성적이 나쁘면 변화 욕구 증가)
    const expectedWinPct = (teamState.strengthNow - 60) / 40; // 대략적 추정
    const resultGap = Math.abs(teamState.winPct - Math.min(1, Math.max(0, expectedWinPct)));
    score += resultGap * 0.15;

    // 3. 재정 압박 (압박이 클수록 연봉 정리 욕구 증가)
    score += teamState.financialPressure * 0.10;

    // 4. GM 공격성 (1~10 → 0~0.25 기여)
    score += (gmProfile.sliders.aggressiveness / 10) * 0.25;

    // 5. 방향성 보정
    const directionBonus: Record<string, number> = {
        winNow: 0.10,
        buyer: 0.07,
        standPat: -0.05,
        seller: 0.08,
        tanking: 0.12,
    };
    score += directionBonus[teamState.phase] ?? 0;

    // 6. 데드라인 근접 (30일 이내 급격 상승)
    if (daysToDeadline <= 30) {
        const urgency = 1 - daysToDeadline / 30;
        score += urgency * 0.20;
    }

    // 7. 쿨다운 패널티 (14일 이내 트레이드 직후)
    if (daysSinceLastTrade < 14) {
        score -= (1 - daysSinceLastTrade / 14) * 0.50;
    }

    return Math.max(0, Math.min(1, score));
}

export function shouldParticipate(
    teamState: TeamTradeState,
    gmProfile: GMProfile,
    daysSinceLastTrade: number,
    daysToDeadline: number,
): boolean {
    return calculateParticipationScore(teamState, gmProfile, daysSinceLastTrade, daysToDeadline)
        >= PARTICIPATION_THRESHOLD;
}
