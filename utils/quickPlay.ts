import type { Team, Player, GameTactics, DepthChart } from '../types';
import { TEAM_DATA } from '../data/teamData';
import { getTeamLogoUrl } from './constants';

const SALARY_CAP_DEFAULT  = 136_021_000;
const LUXURY_TAX_DEFAULT  = 165_294_000;
const BUDGET_DEFAULT      = 200_000_000;

/** meta_players row에서 선택한 roster로 최소 Team 객체 조립 — 모든 부상 상태 클리어 */
export function buildVirtualTeam(teamId: string, roster: Player[]): Team {
    const meta = TEAM_DATA[teamId];
    const healthyRoster = roster.map(p => ({
        ...p,
        health:     'Healthy' as const,
        injuryType: undefined,
        returnDate: undefined,
    }));
    return {
        id:            teamId,
        name:          meta?.name   ?? teamId,
        city:          meta?.city   ?? '',
        logo:          getTeamLogoUrl(teamId),
        conference:    meta?.conference ?? 'West',
        division:      meta?.division   ?? 'Pacific',
        wins:          0,
        losses:        0,
        budget:        BUDGET_DEFAULT,
        salaryCap:     SALARY_CAP_DEFAULT,
        luxuryTaxLine: LUXURY_TAX_DEFAULT,
        roster:        healthyRoster,
    };
}

/** 선택된 roster + tactics.starters 기반으로 기본 DepthChart 생성 */
export function buildDefaultDepthChart(roster: Player[], tactics: GameTactics): DepthChart {
    const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
    const dc: DepthChart = { PG: [], SG: [], SF: [], PF: [], C: [] };

    for (const pos of positions) {
        const starterId = tactics.starters[pos];
        if (starterId) dc[pos].push(starterId);
        // 나머지 선수들을 포지션 우선 순위에 따라 채움
        for (const p of roster) {
            if (p.id === starterId) continue;
            if (p.position.includes(pos)) dc[pos].push(p.id);
        }
        // 위에서 채워지지 않은 슬롯을 나머지로 채움
        for (const p of roster) {
            if (!dc[pos].includes(p.id)) dc[pos].push(p.id);
        }
    }

    return dc;
}

/** OVR 상위 N명 자동 채우기 — 해당 팀 소속 선수 우선 */
export function autoPickTopPlayers(
    pool: Player[],
    teamId: string,
    count: number,
): Player[] {
    const byTeam    = pool.filter(p => (p as any).baseTeamId === teamId || (p as any).base_team_id === teamId);
    const others    = pool.filter(p => (p as any).baseTeamId !== teamId && (p as any).base_team_id !== teamId);
    const sortedTeam   = [...byTeam].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
    const sortedOthers = [...others].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
    const combined  = [...sortedTeam, ...sortedOthers];
    return combined.slice(0, count);
}
