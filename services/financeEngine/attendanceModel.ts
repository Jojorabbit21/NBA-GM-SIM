
import { TEAM_FINANCE_DATA } from '../../data/teamFinanceData';
import { Team } from '../../types/team';
import { Player } from '../../types/player';
import { getTeamLocalStarPower } from '../playerPopularity';

/**
 * 관중 모델 — 매 홈 경기 관중 수 / 점유율 계산
 *
 * 기본 점유율 (마켓 티어별, 낮은 베이스):
 *   Tier 1: 45%  |  Tier 2: 40%  |  Tier 3: 35%  |  Tier 4: 30%
 *
 * 보정 요소 (대폭 강화):
 *   1. 팀 승률 — 50% 기준 ±30% (승률이 관중의 핵심 요인)
 *   2. 스타 선수 — OVR 90+ 보유 시 최대 +20%
 *   3. 상대팀 인기도 — 빅마켓 원정 시 +5%
 */

const BASE_OCCUPANCY: Record<number, number> = {
    1: 0.45,
    2: 0.40,
    3: 0.35,
    4: 0.30,
};

const BIG_MARKET_TEAMS = new Set([
    'nyk', 'bkn', 'lam', 'law', 'gs', 'chi', 'bos', 'phi', 'dal',
]);

export function calculateGameAttendance(
    homeTeam: Team,
    awayTeamId: string,
    facilityBonus?: number,
): { attendance: number; occupancyRate: number } {
    const finData = TEAM_FINANCE_DATA[homeTeam.id];
    if (!finData) {
        return { attendance: 18000, occupancyRate: 0.85 };
    }

    const { market } = finData;
    let occupancy = BASE_OCCUPANCY[market.marketTier] ?? 0.85;

    // 1. 승률 보정 (50% 기준, 최대 ±30%)
    const totalGames = homeTeam.wins + homeTeam.losses;
    if (totalGames > 0) {
        const winPct = homeTeam.wins / totalGames;
        // 승률 80% → +24%, 승률 50% → 0%, 승률 20% → -24%
        const winBonus = (winPct - 0.5) * 0.8;
        occupancy += winBonus;
    }

    // 2. 스타 인기도 보정 (localPopularity 기반, 최대 +18%)
    const starPower = getTeamLocalStarPower(homeTeam.roster);
    const popBonus = (starPower / 100) * 0.18;
    occupancy += popBonus;

    // 3. 상대팀 인기도 보정
    if (BIG_MARKET_TEAMS.has(awayTeamId)) {
        occupancy += 0.05;
    }

    // 4. 시설 투자 보정 (최대 +15%)
    if (facilityBonus && facilityBonus > 0) {
        occupancy += facilityBonus;
    }

    // 최소 25%, 최대 100%
    occupancy = Math.max(0.25, Math.min(1.0, occupancy));

    const attendance = Math.round(market.arenaCapacity * occupancy);
    return { attendance, occupancyRate: occupancy };
}

/**
 * 홈 경기 입장료 수익 (달러)
 */
export function calculateGateRevenue(
    homeTeamId: string,
    attendance: number,
): number {
    const finData = TEAM_FINANCE_DATA[homeTeamId];
    if (!finData) return 0;

    return attendance * finData.market.baseTicketPrice;
}

/**
 * 홈 경기 MD(머천다이즈) 수익 ($M)
 * 마켓 티어별 인당 지출: Tier1 $15, T2 $10, T3 $7, T4 $5
 */
const MD_PER_CAPITA: Record<number, number> = {
    1: 15,
    2: 10,
    3: 7,
    4: 5,
};

export function calculateMerchandiseRevenue(
    homeTeamId: string,
    attendance: number,
    roster?: Player[],
    marketingBonus?: number,
): number {
    const finData = TEAM_FINANCE_DATA[homeTeamId];
    if (!finData) return 0;

    let mdSpend = MD_PER_CAPITA[finData.market.marketTier] ?? 7;

    // 스타 선수 머천다이즈 보정: national popularity 기반 (최대 +10%)
    if (roster) {
        const topNational = roster
            .map(p => p.popularity?.national ?? 0)
            .sort((a, b) => b - a)[0] ?? 0;
        const mdMultiplier = 1 + (topNational / 1000); // national 100 → +10%
        mdSpend = Math.round(mdSpend * mdMultiplier);
    }

    // 마케팅 투자 보정 (최대 +10% → marketingBonus * 0.5)
    const mktMult = 1 + ((marketingBonus ?? 0) * 0.5);

    return Math.round(attendance * mdSpend * mktMult);
}
