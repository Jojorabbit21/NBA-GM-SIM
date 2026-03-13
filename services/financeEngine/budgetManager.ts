
import { TeamFinance, SavedTeamFinances } from '../../types/finance';
import { TEAM_FINANCE_DATA } from '../../data/teamFinanceData';
import { Team } from '../../types/team';
import { LEAGUE_FINANCIALS } from '../../utils/constants';
import { calculateGameAttendance, calculateGateRevenue, calculateMerchandiseRevenue } from './attendanceModel';
import { initializeTeamFinance } from './revenueCalculator';

/**
 * 리그 전체 재정 상태 관리
 */
export class BudgetManager {
    private finances: Record<string, TeamFinance> = {};
    private gamesPlayed: Record<string, number> = {};

    /**
     * 시즌 시작 시 전팀 재정 초기화
     */
    initializeSeason(
        teams: Team[],
        coachSalaries: Record<string, number>,
    ): void {
        for (const team of teams) {
            const coachSalary = coachSalaries[team.id] ?? 7;
            this.finances[team.id] = initializeTeamFinance(
                team.id,
                coachSalary,
                team.roster,
            );
            this.gamesPlayed[team.id] = 0;
        }
    }

    /**
     * 홈 경기 후 수익 누적
     */
    processHomeGame(homeTeam: Team, awayTeamId: string): {
        attendance: number;
        gateRevenue: number;
        mdRevenue: number;
    } {
        const finance = this.finances[homeTeam.id];
        if (!finance) {
            return { attendance: 0, gateRevenue: 0, mdRevenue: 0 };
        }

        const { attendance } = calculateGameAttendance(homeTeam, awayTeamId);
        const gateRevenue = calculateGateRevenue(homeTeam.id, attendance);
        const mdRevenue = calculateMerchandiseRevenue(homeTeam.id, attendance);

        finance.revenue.gate += gateRevenue;
        finance.revenue.merchandise += mdRevenue;
        this.gamesPlayed[homeTeam.id] = (this.gamesPlayed[homeTeam.id] ?? 0) + 1;

        this.recalculateIncome(homeTeam.id);

        return { attendance, gateRevenue, mdRevenue };
    }

    /**
     * 선수 연봉 변동 시 payroll 업데이트 (트레이드/FA 영입·방출 후)
     */
    updatePayroll(teamId: string, roster: Team['roster']): void {
        const finance = this.finances[teamId];
        if (!finance) return;

        finance.expenses.payroll = roster.reduce((sum, p) => sum + (p.salary ?? 0), 0);
        this.recalculateIncome(teamId);
    }

    /**
     * 시즌 종료 시 럭셔리 택스 확정
     */
    finalizeLuxuryTax(): void {
        for (const [teamId, finance] of Object.entries(this.finances)) {
            const payroll = finance.expenses.payroll;
            const taxLevel = LEAGUE_FINANCIALS.TAX_LEVEL;

            if (payroll > taxLevel) {
                finance.expenses.luxuryTax = calculateLuxuryTax(payroll, taxLevel);
            } else {
                finance.expenses.luxuryTax = 0;
            }

            this.recalculateIncome(teamId);
        }
    }

    /**
     * 팀 재정 상태 조회
     */
    getFinance(teamId: string): TeamFinance | undefined {
        return this.finances[teamId];
    }

    /**
     * 전팀 재정 상태 조회
     */
    getAllFinances(): Record<string, TeamFinance> {
        return { ...this.finances };
    }

    /**
     * 저장용 데이터 생성
     */
    toSaveData(): SavedTeamFinances {
        const result: SavedTeamFinances = {};
        for (const [teamId, finance] of Object.entries(this.finances)) {
            result[teamId] = {
                revenue: { ...finance.revenue },
                expenses: { ...finance.expenses },
                budget: finance.budget,
                gamesPlayed: this.gamesPlayed[teamId] ?? 0,
            };
        }
        return result;
    }

    /**
     * 저장 데이터에서 복원
     */
    loadFromSaveData(data: SavedTeamFinances): void {
        for (const [teamId, saved] of Object.entries(data)) {
            this.finances[teamId] = {
                revenue: { ...saved.revenue },
                expenses: { ...saved.expenses },
                operatingIncome: 0,
                budget: saved.budget,
            };
            this.gamesPlayed[teamId] = saved.gamesPlayed;
            this.recalculateIncome(teamId);
        }
    }

    private recalculateIncome(teamId: string): void {
        const finance = this.finances[teamId];
        if (!finance) return;

        const totalRevenue = Object.values(finance.revenue).reduce((s, v) => s + v, 0);
        const totalExpenses = Object.values(finance.expenses).reduce((s, v) => s + v, 0);
        finance.operatingIncome = Math.round((totalRevenue - totalExpenses) * 10) / 10;
    }
}

/**
 * 럭셔리 택스 계산 (6구간 누진)
 *
 * | 구간 ($M 초과) | 세율 |
 * |---------------|------|
 * | 0~5           | $1.50 |
 * | 5~10          | $1.75 |
 * | 10~15         | $2.50 |
 * | 15~20         | $3.25 |
 * | 20~25         | $3.75 |
 * | 25+           | $4.25 + $0.50/추가 $5M |
 */
export function calculateLuxuryTax(payroll: number, taxLevel: number): number {
    const excess = payroll - taxLevel;
    if (excess <= 0) return 0;

    const brackets = [
        { limit: 5, rate: 1.50 },
        { limit: 5, rate: 1.75 },
        { limit: 5, rate: 2.50 },
        { limit: 5, rate: 3.25 },
        { limit: 5, rate: 3.75 },
    ];

    let tax = 0;
    let remaining = excess;

    for (const { limit, rate } of brackets) {
        if (remaining <= 0) break;
        const taxable = Math.min(remaining, limit);
        tax += taxable * rate;
        remaining -= taxable;
    }

    // 25M+ 초과분: $4.25 + $0.50 per additional $5M bracket
    if (remaining > 0) {
        const extraBrackets = Math.ceil(remaining / 5);
        let extraRemaining = remaining;
        for (let i = 0; i < extraBrackets; i++) {
            const bracketRate = 4.25 + i * 0.50;
            const taxable = Math.min(extraRemaining, 5);
            tax += taxable * bracketRate;
            extraRemaining -= taxable;
        }
    }

    return Math.round(tax * 10) / 10;
}

/**
 * 싱글턴 인스턴스
 */
let _instance: BudgetManager | null = null;

export function getBudgetManager(): BudgetManager {
    if (!_instance) {
        _instance = new BudgetManager();
    }
    return _instance;
}

export function resetBudgetManager(): void {
    _instance = null;
}
