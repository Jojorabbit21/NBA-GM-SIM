
import { TEAM_FINANCE_DATA } from '../../data/teamFinanceData';
import { Team } from '../../types/team';

/**
 * 관중 모델 — 매 홈 경기 관중 수 / 점유율 계산
 *
 * 기본 점유율 (마켓 티어별):
 *   Tier 1: 95%  |  Tier 2: 88%  |  Tier 3: 82%  |  Tier 4: 78%
 *
 * 보정 요소:
 *   1. 팀 승률 — 50% 기준 ±
 *   2. 스타 선수 — OVR 90+ 보유 시 +3~5%
 *   3. 상대팀 인기도 — 빅마켓 원정 시 +2~5%
 */

const BASE_OCCUPANCY: Record<number, number> = {
    1: 0.95,
    2: 0.88,
    3: 0.82,
    4: 0.78,
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

    // 1. 승률 보정 (50% 기준)
    const totalGames = homeTeam.wins + homeTeam.losses;
    if (totalGames > 0) {
        const winPct = homeTeam.wins / totalGames;
        // 승률 70% → +8%, 승률 30% → -12%
        const winBonus = (winPct - 0.5) * 0.4;
        occupancy += winBonus;
    }

    // 2. 스타 선수 보정 (OVR 90+)
    const starCount = homeTeam.roster.filter(p => p.ovr >= 90).length;
    if (starCount >= 2) {
        occupancy += 0.05;
    } else if (starCount === 1) {
        occupancy += 0.03;
    }

    // 3. 상대팀 인기도 보정
    if (BIG_MARKET_TEAMS.has(awayTeamId)) {
        occupancy += 0.03;
    }

    // 최소 60%, 최대 100%
    occupancy = Math.max(0.60, Math.min(1.0, occupancy));

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
): number {
    const finData = TEAM_FINANCE_DATA[homeTeamId];
    if (!finData) return 0;

    const mdSpend = MD_PER_CAPITA[finData.market.marketTier] ?? 7;
    return (attendance * mdSpend) / 1_000_000; // $M 단위
}
