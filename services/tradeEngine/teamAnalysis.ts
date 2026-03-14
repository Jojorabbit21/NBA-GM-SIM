
import { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { TRADE_CONFIG as C } from './tradeConfig';
import { GMProfile, TeamDirection } from '../../types/gm';

export interface TeamNeeds {
    weakPositions: string[];
    strongPositions: string[];
    statNeeds: string[];
    direction: TeamDirection;
    isContender: boolean;  // direction === 'winNow' || 'buyer' (하위 호환)
    isSeller: boolean;     // direction === 'seller' || 'tanking' (하위 호환)
    capSpace: number;
    isTaxPayer: boolean;
}

export function analyzeTeamSituation(team: Team, gmProfile?: GMProfile): TeamNeeds {
    const roster = team.roster;
    const sorted = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
    const top8 = sorted.slice(0, 8);

    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const weakPositions: string[] = [];
    const strongPositions: string[] = [];

    positions.forEach(pos => {
        const depth = roster.filter(p => p.position.includes(pos));
        const bestOvr = depth.reduce((max, p) => Math.max(max, calculatePlayerOvr(p)), 0);
        if (bestOvr < 75 || depth.length < 2) {
            weakPositions.push(pos);
        } else if (bestOvr >= 85) {
            strongPositions.push(pos);
        }
    });

    const statNeeds: string[] = [];
    const avgDef = top8.reduce((sum, p) => sum + (p.def || 50), 0) / top8.length;
    const avgReb = top8.reduce((sum, p) => sum + (p.reb || 50), 0) / top8.length;
    const avgOut = top8.reduce((sum, p) => sum + (p.out || 50), 0) / top8.length;

    if (avgDef < 70) statNeeds.push('DEF');
    if (avgReb < 70) statNeeds.push('REB');
    if (avgOut < 70) statNeeds.push('3PT');

    // GM 프로필이 있으면 direction 사용, 없으면 기존 로직으로 fallback
    let direction: TeamDirection;
    if (gmProfile) {
        direction = gmProfile.direction;
    } else {
        const top3Ovr = sorted.slice(0, 3).reduce((sum, p) => sum + calculatePlayerOvr(p), 0) / 3;
        const oldContender = top3Ovr >= 85 || (team.wins || 0) > (team.losses || 0) + 5;
        const oldSeller = !oldContender && ((team.wins || 0) < (team.losses || 0) - 5);
        direction = oldContender ? 'buyer' : oldSeller ? 'seller' : 'standPat';
    }

    const isContender = direction === 'winNow' || direction === 'buyer';
    const isSeller = direction === 'seller' || direction === 'tanking';

    const currentCap = roster.reduce((sum, p) => sum + p.salary, 0);
    const capSpace = C.SALARY.CAP_LINE - currentCap;
    const isTaxPayer = currentCap > C.SALARY.TAX_LINE;

    return { weakPositions, strongPositions, statNeeds, direction, isContender, isSeller, capSpace, isTaxPayer };
}
