
import { Player, Team } from '../../types';
import { TRADE_CONFIG as C } from './tradeConfig';

export function checkTradeLegality(team: Team, incoming: Player[], outgoing: Player[]): boolean {
    const currentCap = team.roster.reduce((sum, p) => sum + p.salary, 0);
    const inSalary = incoming.reduce((sum, p) => sum + p.salary, 0);
    const outSalary = outgoing.reduce((sum, p) => sum + p.salary, 0);

    // Cap space team: can absorb up to remaining cap space
    if (currentCap < C.SALARY.CAP_LINE) {
        const remainingCap = C.SALARY.CAP_LINE - currentCap;
        // Can take back outgoing salary + remaining cap space
        if (inSalary > outSalary + remainingCap) return false;
        return true;
    }

    if (currentCap >= C.SALARY.APRON_2) {
        // Aggregation ban: can't send multiple players for one
        if (outgoing.length > 1 && incoming.length === 1) return false;
        // 100% salary match
        if (inSalary > outSalary) return false;
    } else if (currentCap >= C.SALARY.APRON_1) {
        if (inSalary > outSalary) return false;
    } else if (currentCap >= C.SALARY.TAX_LINE) {
        if (inSalary > outSalary * 1.10) return false;
    } else {
        // Above cap but below tax: 125% + padding
        if (inSalary > (outSalary * 1.25) + 250_000) return false;
    }

    return true;
}

/**
 * NTC (No-Trade Clause) 위반 검사.
 * 트레이드로 내보내려는 선수 중 noTrade 플래그가 있는 선수 목록을 반환.
 * 반환 배열이 비어있으면 위반 없음.
 */
export function checkNTCViolation(players: Player[]): Player[] {
    return players.filter(p => p.contract?.noTrade === true);
}
