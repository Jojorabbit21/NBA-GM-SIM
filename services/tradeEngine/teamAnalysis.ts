
import { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { TRADE_CONFIG as C } from './tradeConfig';
import { GMProfile, TeamDirection } from '../../types/gm';
import { TeamTradeState } from '../../types/trade';
import { FARole } from '../../types/fa';
import { determineFARole } from '../fa/faValuation';
import { calcTeamPayroll } from '../fa/faMarketBuilder';
import { LeaguePickAssets } from '../../types/draftAssets';
import { getPickTradeValue } from './pickValueEngine';

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

// ──────────────────────────────────────────────
// 팀 트레이드 상태 (고도화 엔진용)
// ──────────────────────────────────────────────

const FA_ROLES: FARole[] = ['lead_guard', 'combo_guard', '3and_d', 'shot_creator', 'stretch_big', 'rim_big', 'floor_big'];

/**
 * 팀 트레이드 상태를 즉석 계산. CPU 트레이드 엔진의 참가/목표/평가에 활용.
 */
export function buildTeamTradeState(
    team: Team,
    gmProfile: GMProfile,
    leaguePickAssets?: LeaguePickAssets,
    currentDate?: string,
): TeamTradeState {
    const roster = team.roster;
    const sortedByOvr = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
    const top8 = sortedByOvr.slice(0, 8);

    // 현재 전력 (스타팅5 + 로테이션3 가중)
    const strengthNow = top8.reduce((sum, p, idx) => {
        const weight = idx < 5 ? 1.0 : 0.6;
        return sum + calculatePlayerOvr(p) * weight;
    }, 0) / Math.max(1, Math.min(top8.length, 5) + Math.min(Math.max(0, top8.length - 5), 3) * 0.6);

    // 미래 전력 (어린 선수 가중)
    const strengthFuture = top8.reduce((sum, p) => {
        const ovr = calculatePlayerOvr(p);
        const ageFactor = p.age <= 24 ? 1.15 : p.age <= 28 ? 1.0 : p.age <= 32 ? 0.85 : 0.65;
        return sum + ovr * ageFactor;
    }, 0) / Math.max(top8.length, 1);

    // 타임라인 나이 (주전 8인 가중 평균)
    const timelineAge = top8.length > 0
        ? top8.reduce((sum, p) => sum + p.age, 0) / top8.length
        : 28;

    // 재정 압박 (캡 초과 → 럭셔리택스 범위)
    const payroll = calcTeamPayroll(team);
    const capLine = C.SALARY.CAP_LINE;
    const taxLine = C.SALARY.TAX_LINE;
    const financialPressure = payroll <= capLine
        ? 0
        : Math.min(1, (payroll - capLine) / (taxLine - capLine));

    // 승률
    const totalGames = (team.wins || 0) + (team.losses || 0);
    const winPct = totalGames > 0 ? (team.wins || 0) / totalGames : 0.5;

    // FARole 기반 needs (롤 최고 OVR이 낮을수록 필요도 높음)
    const needs: Partial<Record<FARole, number>> = {};
    for (const role of FA_ROLES) {
        const bestOvr = roster
            .filter(p => determineFARole(p) === role)
            .reduce((max, p) => Math.max(max, calculatePlayerOvr(p)), 0);
        // OVR 75 미만이면 필요도 상승 (0~1)
        needs[role] = Math.max(0, Math.min(1, (75 - bestOvr) / 40));
    }

    // 포지션별 과잉 (주전 초과 선수 수)
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const surpluses: Record<string, number> = {};
    for (const pos of positions) {
        const depth = roster.filter(p => p.position.includes(pos));
        surpluses[pos] = Math.max(0, depth.length - 2);
    }

    // 보유 픽 가치 합계
    let picksOwnedScore = 0;
    if (leaguePickAssets && currentDate) {
        const teamPicks = leaguePickAssets[team.id] || [];
        picksOwnedScore = teamPicks.reduce((sum, pick) => {
            return sum + getPickTradeValue(pick, [team], currentDate);
        }, 0);
    }

    const openRosterFlex = Math.max(0, 15 - roster.length);

    return {
        phase: gmProfile.direction,
        strengthNow,
        strengthFuture,
        timelineAge,
        financialPressure,
        winPct,
        needs,
        surpluses,
        picksOwnedScore,
        openRosterFlex,
    };
}
