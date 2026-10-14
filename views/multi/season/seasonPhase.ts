// seasonPhase.ts — 포스트시즌 시리즈 승수 집계. [2026-10-14]
// MultiHeader가 들고 있던 로직을 공용으로 옮긴 것. 승수는 bracket_data.winnerId(서버가 시뮬 직후 즉시 세팅)가 아니라
// 리플레이 공개창(10분)이 지난 경기만 센다 — 진행 중인 결과가 헤더로 새지 않게.
// (같은 날 여기 있던 홈 밴드 1용 `resolveSeasonPhase`는 밴드 1 삭제와 함께 제거 — dev-log 2026-10-14 참고.)
import type { Game } from '../../../types';
import { isFinal, resolveRealAt } from './multiGameReveal';

/** seriesId → (teamSlug → 공개된 승수) */
export type SeriesWinsMap = Map<string, Map<string, number>>;

export function computeSeriesWins(schedule: Game[], simStart: string | null, gprd: number, nowMs: number): SeriesWinsMap {
    const map: SeriesWinsMap = new Map();
    for (const g of schedule) {
        if (!g.seriesId || !g.played || g.homeScore == null || g.awayScore == null) continue;
        if (!isFinal({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) }, nowMs)) continue;
        const winnerId = g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
        let byTeam = map.get(g.seriesId);
        if (!byTeam) { byTeam = new Map(); map.set(g.seriesId, byTeam); }
        byTeam.set(winnerId, (byTeam.get(winnerId) ?? 0) + 1);
    }
    return map;
}

/** 한 시리즈의 (기준 팀 승수, 상대 승수). 기준 팀이 null이면 my=0, opp=전체. */
export function seriesWinsFor(map: SeriesWinsMap, seriesId: string, teamId: string | null): { my: number; opp: number } {
    const byTeam = map.get(seriesId);
    if (!byTeam) return { my: 0, opp: 0 };
    let my = 0, opp = 0;
    byTeam.forEach((w, id) => { if (id === teamId) my += w; else opp += w; });
    return { my, opp };
}
