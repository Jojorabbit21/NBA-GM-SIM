
import { TEAM_FINANCE_DATA } from '../../data/teamFinanceData';
import { getOVRThreshold } from '../../utils/ovrUtils';
import { TeamFinance } from '../../types/finance';
import { Team } from '../../types/team';
import { Player } from '../../types/player';
import { getNationalPopBonus } from '../playerPopularity';

/**
 * 시즌 고정 수익 계산 (시즌 초 확정)
 *
 * - 중앙 방송 분배금: 리그 총 방송 수익 ÷ 30 (균등)
 * - 로컬 미디어: 팀별 차등 (마켓/계약)
 * - 스폰서십: 기본값 × 전시즌 성적 보정
 */

// 2025-26 기준: 리그 전체 중앙 방송 수익 ~$4.65B → 팀당 ~$155M
const CENTRAL_BROADCASTING_PER_TEAM = 155_000_000;

/** 기준값에 ±pct% 범위의 노이즈 (달러 정수) */
function jitter(base: number, pct: number = 3): number {
    const noise = base * (pct / 100) * (Math.random() * 2 - 1);
    return Math.round(base + noise);
}

export function calculateFixedRevenue(
    teamId: string,
    prevSeasonWinPct?: number,
    roster?: Player[],
): Pick<TeamFinance['revenue'], 'broadcasting' | 'localMedia' | 'sponsorship'> {
    const finData = TEAM_FINANCE_DATA[teamId];
    if (!finData) {
        return { broadcasting: CENTRAL_BROADCASTING_PER_TEAM, localMedia: 30_000_000, sponsorship: 30_000_000 };
    }

    const { market } = finData;

    // 중앙 방송: 전팀 균등 + 노이즈
    const broadcasting = jitter(CENTRAL_BROADCASTING_PER_TEAM);

    // 로컬 미디어: 팀별 계약 기반 + 노이즈
    const localMedia = jitter(market.localMediaDeal);

    // 스폰서십: 기본값 × 성적 보정 (±15%) × 인기도 보정 (최대 +15%) + 노이즈
    const winPctBonus = prevSeasonWinPct !== undefined
        ? 1 + (prevSeasonWinPct - 0.5) * 0.3  // 70% 승률 → ×1.06, 30% → ×0.94
        : 1.0;
    const nationalPopBonus = roster ? getNationalPopBonus(roster) : 0;
    const sponsorship = jitter(Math.round(market.sponsorshipBase * winPctBonus * (1 + nationalPopBonus)));

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
    const operations = jitter(arenaCapacity * 3000); // ~$54~63M

    // 선수 연봉 합계
    const payroll = roster.reduce((sum, p) => sum + (p.salary ?? 0), 0);

    return {
        operations,
        coachSalary,
        payroll,
    };
}

/**
 * 시즌 기타 수익 추정 (달러)
 * 마켓 티어별 기타 수익 (주차, 구장 이벤트 등)
 */
const OTHER_REVENUE: Record<number, number> = {
    1: 45_000_000,
    2: 30_000_000,
    3: 20_000_000,
    4: 15_000_000,
};

export function calculateOtherRevenue(teamId: string): number {
    const finData = TEAM_FINANCE_DATA[teamId];
    if (!finData) return jitter(20_000_000);
    return jitter(OTHER_REVENUE[finData.market.marketTier] ?? 20_000_000);
}

/**
 * 스카우팅/선수 개발비 (달러)
 * 마켓 티어별 기본값 + jitter — 시설, 트레이닝 스태프, 스카우트 인력
 */
const SCOUTING_BASE: Record<number, number> = { 1: 28_000_000, 2: 25_000_000, 3: 22_000_000, 4: 20_000_000 };

export function calculateScoutingExpense(teamId: string): number {
    const finData = TEAM_FINANCE_DATA[teamId];
    if (!finData) return jitter(24_000_000);
    return jitter(SCOUTING_BASE[finData.market.marketTier] ?? 24_000_000);
}

/**
 * 마케팅/홍보비 (달러)
 * 마켓 티어별 기본값 + 슈퍼스타(OVR 90+) 기하급수 증가
 *   0명 → +$0, 1명 → +$5M, 2명 → +$15M, 3명 → +$30M, 4명+ → +$50M
 */
const MARKETING_BASE: Record<number, number> = { 1: 25_000_000, 2: 18_000_000, 3: 12_000_000, 4: 8_000_000 };
const STAR_MARKETING_BONUS = [0, 5_000_000, 15_000_000, 30_000_000, 50_000_000];

export function calculateMarketingExpense(
    teamId: string,
    roster?: Team['roster'],
): number {
    const finData = TEAM_FINANCE_DATA[teamId];
    const base = finData ? (MARKETING_BASE[finData.market.marketTier] ?? 15_000_000) : 15_000_000;

    let starBonus = 0;
    if (roster) {
        const starCount = roster.filter(p => p.ovr >= getOVRThreshold('SUPERSTAR')).length;
        starBonus = STAR_MARKETING_BONUS[Math.min(starCount, STAR_MARKETING_BONUS.length - 1)];
    }

    return jitter(base + starBonus);
}

/**
 * 일반 관리비 (달러) — 프런트오피스 + 원정 경비 + 보험/법무
 *
 * 원정 경비 산출 근거:
 *   41 원정 × ~$300K/경기 (전세기 $200K + 호텔 $70K + 식비·이동 $30K) ≈ $12.3M
 * 프런트오피스/보험/기타: 마켓 티어별 $18~28M
 */
const ADMIN_BASE: Record<number, number> = { 1: 28_000_000, 2: 24_000_000, 3: 21_000_000, 4: 18_000_000 };

export function calculateAdministrationExpense(teamId: string): number {
    const finData = TEAM_FINANCE_DATA[teamId];
    const adminBase = finData ? (ADMIN_BASE[finData.market.marketTier] ?? 22_000_000) : 22_000_000;
    const travelExpense = jitter(12_300_000, 8); // 41 games × ~$300K (±8%)
    return jitter(adminBase) + travelExpense;
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
    const fixed = calculateFixedRevenue(teamId, prevSeasonWinPct, roster);
    const expenses = calculateFixedExpenses(teamId, coachSalary, roster);
    const otherRev = calculateOtherRevenue(teamId);
    const scouting = calculateScoutingExpense(teamId);
    const marketing = calculateMarketingExpense(teamId, roster);
    const administration = calculateAdministrationExpense(teamId);

    const revenue: TeamFinance['revenue'] = {
        gate: 0,
        broadcasting: fixed.broadcasting,
        localMedia: fixed.localMedia,
        sponsorship: fixed.sponsorship,
        merchandise: 0,
        other: otherRev,
    };

    const allExpenses: TeamFinance['expenses'] = {
        ...expenses,
        luxuryTax: 0,
        scouting,
        marketing,
        administration,
        trainingBudget: 3_000_000,  // 기본 오프시즌 훈련 예산 $3M
    };

    const totalRevenue = Object.values(revenue).reduce((s, v) => s + v, 0);
    const totalExpenses = Object.values(allExpenses).reduce((s, v) => s + v, 0);

    return {
        revenue,
        expenses: allExpenses,
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

    return Math.round(estimatedRevenue * multiplier);
}
