// rosterStateSync.ts — 로스터가 바뀐 선수만 골라 room_player_state 행을 부분 갱신하기 위한 순수 함수들(외부 import 없음).
//
// [2026-10-25] leagueRawSeasonInjury를 방 단위 5분 신선도로 바꾸면서, FA 서명·트레이드·드래프트 직후 새로 로스터에 들어온 선수의
// 계약(room_player_state.contract — buildLeagueTeams가 선수 계약 오버라이드로 씀)이 최대 5분 동안 옛 값(원본 계약)으로 보이는
// 문제가 생겼다. 예전엔 로스터가 바뀌면 캐시 키가 바뀌어 곧바로 전체를 다시 받아 가려졌던 부분. 그래서 로스터 배치가 바뀐 선수의
// 행만 다시 받아 캐시에 합친다(요청 1건, 선수 몇 명).

export interface RosterTeamLike { team_slug: string; roster?: (string | null)[] | null }

/** 선수 id → 소속 팀 slug. 같은 id가 두 팀에 있으면 뒤의 팀이 이긴다(데이터 이상 시에도 항상 하나로 정해짐). */
export function rosterPlacement(teams: RosterTeamLike[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const t of teams) for (const id of t.roster ?? []) if (id != null) m.set(String(id), t.team_slug);
    return m;
}

/** 이전 배치와 비교해 "새로 들어왔거나 팀이 바뀐" 선수 id. 로스터에서 빠진 선수는 화면에 안 쓰이므로 제외. */
export function changedPlacementIds(prev: Map<string, string>, next: Map<string, string>): string[] {
    const out: string[] = [];
    for (const [id, slug] of next) if (prev.get(id) !== slug) out.push(id);
    return out;
}

/** old 행 목록에 fresh 행을 player_id 기준으로 덮어쓰고(없으면 추가) 새 배열을 돌려준다. old의 나머지 행·순서는 유지. */
export function mergeStateRows<T extends { player_id: string }>(old: T[], fresh: T[]): T[] {
    const freshById = new Map<string, T>(fresh.map(r => [String(r.player_id), r]));
    const out = old.map(r => freshById.get(String(r.player_id)) ?? r);
    const seen = new Set(old.map(r => String(r.player_id)));
    for (const r of fresh) if (!seen.has(String(r.player_id))) out.push(r);
    return out;
}
