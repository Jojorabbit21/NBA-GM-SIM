
import { TeamFinance, SavedTeamFinances, MonthlyAttendanceData } from '../../types/finance';
import { TEAM_FINANCE_DATA } from '../../data/teamFinanceData';
import { Team } from '../../types/team';
import { LEAGUE_FINANCIALS } from '../../utils/constants';
import { calculateGameAttendance, calculateGateRevenue, calculateMerchandiseRevenue } from './attendanceModel';
import { initializeTeamFinance, calculateScoutingExpense, calculateMarketingExpense, calculateAdministrationExpense } from './revenueCalculator';

/**
 * 리그 전체 재정 상태 관리
 */
export class BudgetManager {
    private finances: Record<string, TeamFinance> = {};
    private gamesPlayed: Record<string, number> = {};
    private totalAttendance: Record<string, number> = {};
    private monthlyAttendance: Record<string, Record<string, MonthlyAttendanceData>> = {};

    /**
     * 시즌 시작 시 전팀 재정 초기화
     */
    initializeSeason(
        teams: Team[],
        coachSalaries: Record<string, number>,
    ): void {
        for (const team of teams) {
            const coachSalary = coachSalaries[team.id] ?? 7_000_000;
            this.finances[team.id] = initializeTeamFinance(
                team.id,
                coachSalary,
                team.roster,
            );
            this.gamesPlayed[team.id] = 0;
            this.totalAttendance[team.id] = 0;
            this.monthlyAttendance[team.id] = {};
        }
    }

    /**
     * 홈 경기 후 수익 누적
     */
    processHomeGame(homeTeam: Team, awayTeamId: string, gameDate?: string): {
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
        const mdRevenue = calculateMerchandiseRevenue(homeTeam.id, attendance, homeTeam.roster);

        finance.revenue.gate += gateRevenue;
        finance.revenue.merchandise += mdRevenue;
        this.gamesPlayed[homeTeam.id] = (this.gamesPlayed[homeTeam.id] ?? 0) + 1;

        // 관중 누적
        this.totalAttendance[homeTeam.id] = (this.totalAttendance[homeTeam.id] ?? 0) + attendance;

        // 월별 관중 누적
        if (gameDate) {
            const monthKey = gameDate.slice(0, 7); // "2025-10"
            if (!this.monthlyAttendance[homeTeam.id]) this.monthlyAttendance[homeTeam.id] = {};
            const monthly = this.monthlyAttendance[homeTeam.id];
            if (!monthly[monthKey]) monthly[monthKey] = { games: 0, total: 0 };
            monthly[monthKey].games += 1;
            monthly[monthKey].total += attendance;
        }

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
     * 관중 통계 조회
     */
    getAttendanceStats(teamId: string): {
        totalAttendance: number;
        averageAttendance: number;
        averageOccupancy: number;
        monthlyAttendance: Record<string, MonthlyAttendanceData>;
    } {
        const games = this.gamesPlayed[teamId] ?? 0;
        const total = this.totalAttendance[teamId] ?? 0;
        const avg = games > 0 ? Math.round(total / games) : 0;

        const finData = TEAM_FINANCE_DATA[teamId];
        const capacity = finData?.market.arenaCapacity ?? 18000;
        const occupancy = games > 0 ? avg / capacity : 0;

        return {
            totalAttendance: total,
            averageAttendance: avg,
            averageOccupancy: occupancy,
            monthlyAttendance: this.monthlyAttendance[teamId] ?? {},
        };
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
                totalAttendance: this.totalAttendance[teamId] ?? 0,
                monthlyAttendance: this.monthlyAttendance[teamId] ?? {},
            };
        }
        return result;
    }

    /**
     * 저장 데이터에서 복원
     */
    loadFromSaveData(data: SavedTeamFinances): void {
        for (const [teamId, saved] of Object.entries(data)) {
            // 구세이브 호환: $M 단위 → 달러 변환 (payroll < 1000이면 $M 단위로 간주)
            if (saved.expenses.payroll > 0 && saved.expenses.payroll < 1000) {
                for (const key of Object.keys(saved.revenue) as Array<keyof typeof saved.revenue>) {
                    (saved.revenue as any)[key] = Math.round(saved.revenue[key] * 1_000_000);
                }
                for (const key of Object.keys(saved.expenses) as Array<keyof typeof saved.expenses>) {
                    (saved.expenses as any)[key] = Math.round(saved.expenses[key] * 1_000_000);
                }
                saved.budget = Math.round(saved.budget * 1_000_000);
            }

            // 구세이브 호환: 새 지출 필드 없으면 재계산
            const expenses = { ...saved.expenses };
            if (expenses.scouting === undefined) expenses.scouting = calculateScoutingExpense(teamId);
            if (expenses.marketing === undefined) expenses.marketing = calculateMarketingExpense(teamId);
            if (expenses.administration === undefined) expenses.administration = calculateAdministrationExpense(teamId);
            if (expenses.trainingBudget === undefined) expenses.trainingBudget = 3_000_000;

            this.finances[teamId] = {
                revenue: { ...saved.revenue },
                expenses,
                operatingIncome: 0,
                budget: saved.budget,
            };
            this.gamesPlayed[teamId] = saved.gamesPlayed;
            this.totalAttendance[teamId] = saved.totalAttendance ?? 0;
            this.monthlyAttendance[teamId] = saved.monthlyAttendance ?? {};
            this.recalculateIncome(teamId);
        }
    }

    private recalculateIncome(teamId: string): void {
        const finance = this.finances[teamId];
        if (!finance) return;

        const totalRevenue = Object.values(finance.revenue).reduce((s, v) => s + v, 0);
        const totalExpenses = Object.values(finance.expenses).reduce((s, v) => s + v, 0);
        finance.operatingIncome = Math.round(totalRevenue - totalExpenses);
    }
}

/**
 * 럭셔리 택스 계산 (6구간 누진, 달러 단위)
 *
 * | 구간 (초과) | 세율 |
 * |------------|------|
 * | 0~$5M      | $1.50 per $1 |
 * | $5~10M     | $1.75 |
 * | $10~15M    | $2.50 |
 * | $15~20M    | $3.25 |
 * | $20~25M    | $3.75 |
 * | $25M+      | $4.25 + $0.50/추가 $5M |
 */
export function calculateLuxuryTax(payroll: number, taxLevel: number): number {
    const excess = payroll - taxLevel;
    if (excess <= 0) return 0;

    const brackets = [
        { limit: 5_000_000, rate: 1.50 },
        { limit: 5_000_000, rate: 1.75 },
        { limit: 5_000_000, rate: 2.50 },
        { limit: 5_000_000, rate: 3.25 },
        { limit: 5_000_000, rate: 3.75 },
    ];

    let tax = 0;
    let remaining = excess;

    for (const { limit, rate } of brackets) {
        if (remaining <= 0) break;
        const taxable = Math.min(remaining, limit);
        tax += taxable * rate;
        remaining -= taxable;
    }

    // $25M+ 초과분: $4.25 + $0.50 per additional $5M bracket
    if (remaining > 0) {
        const extraBrackets = Math.ceil(remaining / 5_000_000);
        let extraRemaining = remaining;
        for (let i = 0; i < extraBrackets; i++) {
            const bracketRate = 4.25 + i * 0.50;
            const taxable = Math.min(extraRemaining, 5_000_000);
            tax += taxable * bracketRate;
            extraRemaining -= taxable;
        }
    }

    return Math.round(tax);
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

/**
 * BudgetManager 재정 스냅샷 + Team.deadMoney 통합 직렬화.
 * forceSave 및 archiveCurrentSeason 양쪽에서 공통 사용.
 */
export function getFinancesSnapshot(teams: Team[]): SavedTeamFinances {
    const finances = getBudgetManager().toSaveData();
    for (const t of teams) {
        if (t.deadMoney?.length) {
            finances[t.id] ??= {
                revenue: { gate: 0, broadcasting: 0, localMedia: 0, sponsorship: 0, merchandise: 0, other: 0 },
                expenses: { payroll: 0, luxuryTax: 0, operations: 0, coachSalary: 0, scouting: 0, marketing: 0, administration: 0, trainingBudget: 3_000_000 },
                budget: 0,
                gamesPlayed: 0,
            };
            finances[t.id].deadMoney = [...t.deadMoney];
        }
    }
    return finances;
}
