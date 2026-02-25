
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
        if (inSalary > (outSalary * 1.25) + 0.25) return false;
    }

    return true;
}
