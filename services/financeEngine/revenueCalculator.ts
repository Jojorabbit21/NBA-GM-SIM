
import { TEAM_FINANCE_DATA } from '../../data/teamFinanceData';
import { TeamFinance } from '../../types/finance';
import { Team } from '../../types/team';

/**
 * 시즌 고정 수익 계산 (시즌 초 확정)
 *
 * - 중앙 방송 분배금: 리그 총 방송 수익 ÷ 30 (균등)
 * - 로컬 미디어: 팀별 차등 (마켓/계약)
 * - 스폰서십: 기본값 × 전시즌 성적 보정
 */

// 2025-26 기준: 리그 전체 중앙 방송 수익 ~$4.65B → 팀당 ~$155M
const CENTRAL_BROADCASTING_PER_TEAM = 155; // $M

export function calculateFixedRevenue(
    teamId: string,
    prevSeasonWinPct?: number,
): Pick<TeamFinance['revenue'], 'broadcasting' | 'localMedia' | 'sponsorship'> {
    const finData = TEAM_FINANCE_DATA[teamId];
    if (!finData) {
        return { broadcasting: CENTRAL_BROADCASTING_PER_TEAM, localMedia: 30, sponsorship: 30 };
    }

    const { market } = finData;

    // 중앙 방송: 전팀 균등
    const broadcasting = CENTRAL_BROADCASTING_PER_TEAM;

    // 로컬 미디어: 팀별 계약 기반
    const localMedia = market.localMediaDeal;

    // 스폰서십: 기본값 × 성적 보정 (±15%)
    const winPctBonus = prevSeasonWinPct !== undefined
        ? 1 + (prevSeasonWinPct - 0.5) * 0.3  // 70% 승률 → ×1.06, 30% → ×0.94
        : 1.0;
    const sponsorship = Math.round(market.sponsorshipBase * winPctBonus * 10) / 10;

    return { broadcasting, localMedia, sponsorship };
}

/**
 * 시즌 고정 지출 계산
 *
 * - 운영비: 경기장 규모 비례 (~$50~80M)
 * - 코치 연봉: coachSalary 파라미터
 * - 선수 연봉(payroll): 로스터에서 직접 계산
 */
export function calculateFixedExpenses(
    teamId: string,
    coachSalary: number,
    roster: Team['roster'],
): Pick<TeamFinance['expenses'], 'operations' | 'coachSalary' | 'payroll'> {
    const finData = TEAM_FINANCE_DATA[teamId];

    // 운영비: 경기장 좌석수 기반 (좌석당 $3,000 연간 운영비 가정)
    const arenaCapacity = finData?.market.arenaCapacity ?? 18000;
    const operations = Math.round(arenaCapacity * 3000 / 1_000_000 * 10) / 10; // ~$54~63M

    // 선수 연봉 합계
    const payroll = roster.reduce((sum, p) => sum + (p.salary ?? 0), 0);

    return {
        operations,
        coachSalary,
        payroll,
    };
}

/**
 * 시즌 기타 수익 추정 ($M)
 * 마켓 티어별 기타 수익 (주차, 구장 이벤트 등)
 */
const OTHER_REVENUE: Record<number, number> = {
    1: 45,
    2: 30,
    3: 20,
    4: 15,
};

export function calculateOtherRevenue(teamId: string): number {
    const finData = TEAM_FINANCE_DATA[teamId];
    if (!finData) return 20;
    return OTHER_REVENUE[finData.market.marketTier] ?? 20;
}

/**
 * 초기 TeamFinance 생성 (시즌 시작 시)
 */
export function initializeTeamFinance(
    teamId: string,
    coachSalary: number,
    roster: Team['roster'],
    prevSeasonWinPct?: number,
): TeamFinance {
    const fixed = calculateFixedRevenue(teamId, prevSeasonWinPct);
    const expenses = calculateFixedExpenses(teamId, coachSalary, roster);
    const otherRev = calculateOtherRevenue(teamId);

    const revenue: TeamFinance['revenue'] = {
        gate: 0,
        broadcasting: fixed.broadcasting,
        localMedia: fixed.localMedia,
        sponsorship: fixed.sponsorship,
        merchandise: 0,
        other: otherRev,
    };

    const totalRevenue = Object.values(revenue).reduce((s, v) => s + v, 0);
    const totalExpenses = Object.values(expenses).reduce((s, v) => s + v, 0);

    return {
        revenue,
        expenses: { ...expenses, luxuryTax: 0 },
        operatingIncome: totalRevenue - totalExpenses,
        budget: calculateBudget(teamId, totalRevenue),
    };
}

/**
 * 예산 결정 (구단주 spendingWillingness 기반)
 */
function calculateBudget(teamId: string, estimatedRevenue: number): number {
    const finData = TEAM_FINANCE_DATA[teamId];
    if (!finData) return estimatedRevenue;

    const { spendingWillingness } = finData.ownerProfile;

    // spendingWillingness 10: 수익의 150%
    // spendingWillingness 7: 수익의 110%
    // spendingWillingness 5: 수익의 100%
    // spendingWillingness 3: 수익의 85%
    // spendingWillingness 1: 수익의 75%
    const multiplier = 0.75 + (spendingWillingness - 1) * (0.75 / 9);
    // 1→0.75, 5→1.08, 7→1.25, 10→1.50

    return Math.round(estimatedRevenue * multiplier * 10) / 10;
}
