
import { TEAM_FINANCE_DATA } from '../../data/teamFinanceData';
import {
    InvestmentCategory,
    InvestmentEffects,
    TeamInvestmentState,
    LeagueInvestmentState,
} from '../../types/finance';
import type { OwnerProfile } from '../../types/finance';

// ── 효과 곡선 파라미터 ──
// effect = maxVal * (1 - exp(-x / scale))
const CURVE_PARAMS: Record<InvestmentCategory, { maxVal: number; scale: number }> = {
    facility:  { maxVal: 0.15,  scale: 20_000_000 },
    training:  { maxVal: 0.50,  scale: 15_000_000 },  // trainingMultiplier = 1.0 + maxVal * curve
    scouting:  { maxVal: 1.0,   scale: 10_000_000 },
    marketing: { maxVal: 0.20,  scale: 18_000_000 },
};

function expCurve(x: number, maxVal: number, scale: number): number {
    return maxVal * (1 - Math.exp(-x / scale));
}

/**
 * 투자 효과 계산 (지수 수익 체감)
 */
export function computeInvestmentEffects(
    allocations: Record<InvestmentCategory, number>,
): InvestmentEffects {
    const { facility, training, scouting, marketing } = allocations;
    return {
        facilityBonus:       expCurve(facility,  CURVE_PARAMS.facility.maxVal,  CURVE_PARAMS.facility.scale),
        trainingMultiplier:  1.0 + expCurve(training, CURVE_PARAMS.training.maxVal, CURVE_PARAMS.training.scale),
        scoutingAccuracy:    expCurve(scouting,  CURVE_PARAMS.scouting.maxVal,  CURVE_PARAMS.scouting.scale),
        marketingBonus:      expCurve(marketing, CURVE_PARAMS.marketing.maxVal, CURVE_PARAMS.marketing.scale),
    };
}

/**
 * 구단주 재량 예산 계산
 *
 * fromRevenue = max(0, operatingIncome) * (0.15 + (winNowPriority-1)/9 * 0.25)
 * fromNetWorth = netWorth * (0.00005 + (spendingWillingness-1)/9 * 0.00015)
 * discretionaryBudget = clamp(fromRevenue + fromNetWorth, $5M, $60M)
 */
export function calculateDiscretionaryBudget(
    teamId: string,
    operatingIncome: number,
): number {
    const finData = TEAM_FINANCE_DATA[teamId];
    if (!finData) return 10_000_000; // fallback $10M

    const { ownerProfile } = finData;
    const { netWorth, winNowPriority, spendingWillingness } = ownerProfile;

    const fromRevenue = Math.max(0, operatingIncome)
        * (0.15 + ((winNowPriority - 1) / 9) * 0.25);

    const fromNetWorth = netWorth
        * (0.00005 + ((spendingWillingness - 1) / 9) * 0.00015);

    const total = fromRevenue + fromNetWorth;
    return Math.round(Math.max(5_000_000, Math.min(60_000_000, total)));
}

/**
 * CPU 팀 자동 예산 배분 (구단주 성향 기반)
 *
 * winNowPriority > 7  → facility + marketing 우선
 * patience > 7        → training + scouting 우선
 * 기본                → 균등 배분
 */
export function autoAllocateCPUBudget(
    teamId: string,
    budget: number,
    ownerProfile: OwnerProfile,
): Record<InvestmentCategory, number> {
    const { winNowPriority, patience, marketingFocus } = ownerProfile;

    // 비율 결정
    let weights: Record<InvestmentCategory, number>;

    if (winNowPriority >= 8) {
        // 즉각적 성과 중시: 시설 + 마케팅
        weights = { facility: 0.35, training: 0.15, scouting: 0.15, marketing: 0.35 };
    } else if (patience >= 8) {
        // 장기 육성 중시: 훈련 + 스카우팅
        weights = { facility: 0.15, training: 0.40, scouting: 0.35, marketing: 0.10 };
    } else if (marketingFocus >= 8) {
        // 수익 극대화: 마케팅 + 시설
        weights = { facility: 0.25, training: 0.15, scouting: 0.15, marketing: 0.45 };
    } else {
        // 균형 배분
        weights = { facility: 0.25, training: 0.25, scouting: 0.25, marketing: 0.25 };
    }

    return {
        facility:  Math.round(budget * weights.facility),
        training:  Math.round(budget * weights.training),
        scouting:  Math.round(budget * weights.scouting),
        marketing: Math.round(budget * weights.marketing),
    };
}

/**
 * 기본 투자 상태 생성 (새 세이브 / 구세이브 폴백)
 */
export function createDefaultInvestmentState(seasonNumber: number): TeamInvestmentState {
    const allocations: Record<InvestmentCategory, number> = {
        facility: 0,
        training: 0,
        scouting: 0,
        marketing: 0,
    };
    return {
        discretionaryBudget: 0,
        remainingBudget: 0,
        allocations,
        effects: computeInvestmentEffects(allocations),
        allocationConfirmed: false,
        seasonNumber,
    };
}

/**
 * 전 팀 투자 상태 초기화 (오프시즌 ownerBudgetDay 도달 시)
 *
 * - CPU 팀: 자동 배분 + confirmed
 * - 유저 팀: discretionaryBudget만 설정, confirmed: false
 */
export function initializeLeagueInvestmentState(
    userTeamId: string,
    teamFinances: Record<string, { operatingIncome: number }>,
    seasonNumber: number,
): LeagueInvestmentState {
    const result: LeagueInvestmentState = {};

    for (const [teamId, fin] of Object.entries(teamFinances)) {
        const budget = calculateDiscretionaryBudget(teamId, fin.operatingIncome);
        const finData = TEAM_FINANCE_DATA[teamId];

        if (teamId === userTeamId) {
            // 유저팀: 예산만 설정, 배분은 유저가 직접
            const allocations: Record<InvestmentCategory, number> = {
                facility: 0, training: 0, scouting: 0, marketing: 0,
            };
            result[teamId] = {
                discretionaryBudget: budget,
                remainingBudget: budget,
                allocations,
                effects: computeInvestmentEffects(allocations),
                allocationConfirmed: false,
                seasonNumber,
            };
        } else {
            // CPU팀: 자동 배분
            const ownerProfile = finData?.ownerProfile;
            const allocations = ownerProfile
                ? autoAllocateCPUBudget(teamId, budget, ownerProfile)
                : { facility: 0, training: 0, scouting: 0, marketing: 0 };

            result[teamId] = {
                discretionaryBudget: budget,
                remainingBudget: 0,
                allocations,
                effects: computeInvestmentEffects(allocations),
                allocationConfirmed: true,
                seasonNumber,
            };
        }
    }

    return result;
}
