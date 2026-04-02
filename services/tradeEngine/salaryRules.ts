
import { Player, Team } from '../../types';
import { LEAGUE_FINANCIALS } from '../../utils/constants';

function formatSalary(v: number): string {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
}

export function checkTradeLegality(team: Team, incoming: Player[], outgoing: Player[]): boolean {
    return checkTradeLegalityDetailed(team, incoming, outgoing).valid;
}

export interface SalaryCheckResult {
    valid: boolean;
    reason?: string;
}

export function checkTradeLegalityDetailed(team: Team, incoming: Player[], outgoing: Player[]): SalaryCheckResult {
    const deadMoney = (team.deadMoney ?? []).reduce((sum, d) => sum + d.amount, 0);
    const currentCap = team.roster.reduce((sum, p) => sum + p.salary, 0) + deadMoney;
    const inSalary = incoming.reduce((sum, p) => sum + p.salary, 0);
    const outSalary = outgoing.reduce((sum, p) => sum + p.salary, 0);

    // Dynamic cap thresholds from LEAGUE_FINANCIALS (updated each season)
    const CAP_LINE  = LEAGUE_FINANCIALS.SALARY_CAP;
    const TAX_LINE  = LEAGUE_FINANCIALS.TAX_LEVEL;
    const APRON_1   = LEAGUE_FINANCIALS.FIRST_APRON;
    const APRON_2   = LEAGUE_FINANCIALS.SECOND_APRON;

    // Cap space team: can absorb up to remaining cap space
    if (currentCap < CAP_LINE) {
        const remainingCap = CAP_LINE - currentCap;
        if (inSalary > outSalary + remainingCap) {
            return {
                valid: false,
                reason: `캡 스페이스 초과 — 수신 ${formatSalary(inSalary)} > 송신 ${formatSalary(outSalary)} + 잔여 캡 ${formatSalary(remainingCap)}`,
            };
        }
        return { valid: true };
    }

    if (currentCap >= APRON_2) {
        if (outgoing.length > 1 && incoming.length === 1) {
            return {
                valid: false,
                reason: `2차 에이프런 팀 — 복수 선수 합산(aggregation) 트레이드 불가`,
            };
        }
        if (inSalary > outSalary) {
            return {
                valid: false,
                reason: `2차 에이프런 — 수신 연봉 ${formatSalary(inSalary)} > 송신 연봉 ${formatSalary(outSalary)} (100% 매칭 필요)`,
            };
        }
    } else if (currentCap >= APRON_1) {
        if (inSalary > outSalary) {
            return {
                valid: false,
                reason: `1차 에이프런 — 수신 연봉 ${formatSalary(inSalary)} > 송신 연봉 ${formatSalary(outSalary)} (100% 매칭 필요)`,
            };
        }
    } else if (currentCap >= TAX_LINE) {
        const maxIn = outSalary * 1.10;
        if (inSalary > maxIn) {
            return {
                valid: false,
                reason: `택스 라인 초과 — 수신 연봉 ${formatSalary(inSalary)} > 허용 한도 ${formatSalary(maxIn)} (송신의 110%)`,
            };
        }
    } else {
        const maxIn = (outSalary * 1.25) + 250_000;
        if (inSalary > maxIn) {
            return {
                valid: false,
                reason: `캡 초과 — 수신 연봉 ${formatSalary(inSalary)} > 허용 한도 ${formatSalary(maxIn)} (송신의 125% + $250K)`,
            };
        }
    }

    return { valid: true };
}

/**
 * NTC (No-Trade Clause) 위반 검사.
 * 트레이드로 내보내려는 선수 중 noTrade 플래그가 있는 선수 목록을 반환.
 * 반환 배열이 비어있으면 위반 없음.
 */
export function checkNTCViolation(players: Player[]): Player[] {
    return players.filter(p => p.contract?.noTrade === true);
}
