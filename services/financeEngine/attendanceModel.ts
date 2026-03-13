
import { TEAM_FINANCE_DATA } from '../../data/teamFinanceData';
import { Team } from '../../types/team';

/**
 * 관중 모델 — 매 홈 경기 관중 수 / 점유율 계산
 *
 * 기본 점유율 (마켓 티어별, 낮은 베이스):
 *   Tier 1: 60%  |  Tier 2: 50%  |  Tier 3: 40%  |  Tier 4: 30%
 *
 * 보정 요소 (대폭 강화):
 *   1. 팀 승률 — 50% 기준 ±30% (승률이 관중의 핵심 요인)
 *   2. 스타 선수 — OVR 90+ 보유 시 최대 +20%
 *   3. 상대팀 인기도 — 빅마켓 원정 시 +5%
 */

const BASE_OCCUPANCY: Record<number, number> = {
    1: 0.60,
    2: 0.50,
    3: 0.40,
    4: 0.30,
};

const BIG_MARKET_TEAMS = new Set([
    'nyk', 'bkn', 'lam', 'law', 'gs', 'chi', 'bos', 'phi', 'dal',
]);

export function calculateGameAttendance(
    homeTeam: Team,
    awayTeamId: string,
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

    // 2. 스타 선수 보정 (OVR 90+, 최대 +20%)
    const starCount = homeTeam.roster.filter(p => p.ovr >= 90).length;
    if (starCount >= 3) {
        occupancy += 0.20;
    } else if (starCount === 2) {
        occupancy += 0.15;
    } else if (starCount === 1) {
        occupancy += 0.08;
    }

    // 3. 상대팀 인기도 보정
    if (BIG_MARKET_TEAMS.has(awayTeamId)) {
        occupancy += 0.05;
    }

    // 최소 25%, 최대 100%
    occupancy = Math.max(0.25, Math.min(1.0, occupancy));

    const attendance = Math.round(market.arenaCapacity * occupancy);
    return { attendance, occupancyRate: occupancy };
}

/**
 * 홈 경기 입장료 수익 ($M)
 */
export function calculateGateRevenue(
    homeTeamId: string,
    attendance: number,
): number {
    const finData = TEAM_FINANCE_DATA[homeTeamId];
    if (!finData) return 0;

    const ticketRevenue = attendance * finData.market.baseTicketPrice;
    return ticketRevenue / 1_000_000; // $M 단위
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
    roster?: Team['roster'],
): number {
    const finData = TEAM_FINANCE_DATA[homeTeamId];
    if (!finData) return 0;

    let mdSpend = MD_PER_CAPITA[finData.market.marketTier] ?? 7;

    // 스타 선수 머천다이즈 보정: OVR 90+ 선수 1인당 +$2 (최대 +$8)
    if (roster) {
        const starCount = roster.filter(p => p.ovr >= 90).length;
        mdSpend += Math.min(starCount * 2, 8);
    }

    return (attendance * mdSpend) / 1_000_000; // $M 단위
}
