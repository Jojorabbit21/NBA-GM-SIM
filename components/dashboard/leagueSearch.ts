// leagueSearch.ts — 리그 안 팀·선수 검색 매칭 규칙(순수 함수). [2026-10-27]
// MultiGlobalSearch(데스크톱 헤더 검색)에 인라인으로 있던 것을 모바일 검색 시트(MobileSearchSheet)와 공유하려고 분리.
// 규칙은 그대로: 팀은 이름/슬러그/약어 부분 일치 최대 5건, 선수는 이름 부분 일치 최대 20건, 팀 → 선수 순.
import type { Player } from '../../types';
import type { LeagueTeamRow } from '../../services/multi/roomQueries';

export type LeagueSearchResult =
    | { type: 'team';   team: LeagueTeamRow }
    | { type: 'player'; player: Player; teamSlug: string | null; teamAbbr: string | null; teamColor: string | null };

export const SEARCH_CATEGORY_LABELS: Record<LeagueSearchResult['type'], string> = { team: '팀', player: '선수' };

export function searchLeagueEntities(
    query: string,
    leagueTeams: LeagueTeamRow[],
    poolPlayers: Player[],
    rosterMap: Map<string, string>,
    limits: { teams: number; players: number } = { teams: 5, players: 20 },
): LeagueSearchResult[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const teamBySlug = new Map<string, LeagueTeamRow>();
    for (const t of leagueTeams) teamBySlug.set(t.team_slug, t);
    const out: LeagueSearchResult[] = [];

    let teamCount = 0;
    for (const t of leagueTeams) {
        if (teamCount >= limits.teams) break;
        if (t.team_name.toLowerCase().includes(q) || t.team_slug.includes(q) || t.team_abbr.toLowerCase().includes(q)) {
            out.push({ type: 'team', team: t });
            teamCount++;
        }
    }

    let playerCount = 0;
    for (const player of poolPlayers) {
        if (playerCount >= limits.players) break;
        if (!player.name.toLowerCase().includes(q)) continue;
        const slug = rosterMap.get(player.id) ?? null;
        const team = slug ? teamBySlug.get(slug) ?? null : null;
        out.push({ type: 'player', player, teamSlug: slug, teamAbbr: team?.team_abbr ?? null, teamColor: team?.color_primary ?? null });
        playerCount++;
    }
    return out;
}

/** 팀 → 선수 순으로 묶는다(빈 그룹 제외). */
export function groupLeagueSearchResults(results: LeagueSearchResult[]): { type: LeagueSearchResult['type']; items: LeagueSearchResult[] }[] {
    const order: LeagueSearchResult['type'][] = ['team', 'player'];
    return order
        .map(type => ({ type, items: results.filter(r => r.type === type) }))
        .filter(g => g.items.length > 0);
}
