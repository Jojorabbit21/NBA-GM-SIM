
import type { TeamTradeState, TradeGoalType } from '../../types/trade';
import type { GMProfile } from '../../types/gm';
import { calculatePlayerOvr } from '../../utils/constants';
import type { Team } from '../../types';

/**
 * 팀 상태와 GM 성격을 바탕으로 이번 트레이드 사이클의 목표를 결정.
 *
 * 순서: 재정압박 → 스타의향/방향성 → 포지션 필요도 → 자산 정리 → 기본
 */
export function generateTradeGoal(
    teamState: TeamTradeState,
    gmProfile: GMProfile,
    team: Team,
): TradeGoalType {
    const sliders = gmProfile.sliders;
    const phase = teamState.phase;

    // 1. 재정 압박이 극심하면 연봉 정리 최우선
    if (teamState.financialPressure >= 0.85) {
        return 'SALARY_RELIEF';
    }

    // 2. 올인 + 스타의향 높음 → 스타 업그레이드
    if (phase === 'winNow' && sliders.starWillingness >= 7) {
        // 현재 팀에 진짜 스타(OVR 90+)가 없을 때만
        const hasTopStar = team.roster.some(p => calculatePlayerOvr(p) >= 90);
        if (!hasTopStar) return 'STAR_UPGRADE';
    }

    // 3. 올인/바이어 + 특정 롤 심각하게 부족
    if (phase === 'winNow' || phase === 'buyer') {
        const urgentRole = Object.entries(teamState.needs)
            .filter(([, need]) => need >= 0.7)
            .sort(([, a], [, b]) => b - a)[0];
        if (urgentRole) return 'ROLE_ADD';
    }

    // 4. 셀러/탱킹 + 만기 계약 선수 있으면 레버리지 활용
    if (phase === 'seller' || phase === 'tanking') {
        const hasExpiring = team.roster.some(p => p.contractYears === 1 && calculatePlayerOvr(p) >= 70);
        if (hasExpiring) return 'EXPIRING_LEVERAGE';
    }

    // 5. 셀러/탱킹 → 미래 자산 확보 (픽/유망주)
    if (phase === 'seller' || phase === 'tanking') {
        if (sliders.youthBias >= 6) return 'FUTURE_ASSETS';
        return 'SURPLUS_CLEAR';
    }

    // 6. 유스 편향 높고 standPat → 미래 자산 (seller/tanking은 위에서 처리됨)
    if (sliders.youthBias >= 7 && phase === 'standPat') {
        return 'FUTURE_ASSETS';
    }

    // 7. 중복 자원 많으면 정리 (surplus 합계가 4 이상)
    const totalSurplus = Object.values(teamState.surpluses).reduce((sum, v) => sum + v, 0);
    if (totalSurplus >= 4) return 'SURPLUS_CLEAR';

    // 8. 일반 필요도가 있으면 뎁스 보강
    const hasAnyNeed = Object.values(teamState.needs).some(n => n >= 0.4);
    if (hasAnyNeed) return 'DEPTH_ADD';

    // 9. 기본
    return 'STARTER_UPGRADE';
}
