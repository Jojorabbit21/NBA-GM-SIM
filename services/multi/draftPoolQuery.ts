// 멀티 드래프트/선수풀 관련 화면(useMultiSearchData, DraftPoolModal, DraftPoolSettings,
// LeagueLobbyPanel)이 공통으로 쓰는 meta_players 풀 필터. server/src/shared/draftPoolQuery.ts와
// 미러 쌍 — 한쪽만 고치면 서버/클라 드래프트 풀 구성이 어긋나므로 항상 같이 수정할 것.
//
// [2026-09-16] 여러 차례의 시행착오 끝에 'standard'/'alltime' 풀 타입 구분(체크박스) 자체를
// 폐지했다. 처음엔 in_multi_pool=true 외에 base_team_id IS NOT NULL까지 요구해서 데이터가
// 누락된 현역(드와이트 파웰 등)이 통째로 빠지는 버그가 있었고, 그 조건을 없앴더니 이번엔
// base_team_id=null인 은퇴 레전드(마이클 조던 등) 590명이 'standard'만 쓰는 리그에 전부
// 새어들어오는 회귀가 생겼다. include_alltime으로 레전드를 구분해보려 했으나 이것도
// 신뢰할 수 없는 필드였다 — Ed Macauley(1950년대 선수)/Mitch Richmond(2002년 은퇴) 등
// 명백한 은퇴 레전드가 include_alltime=false로 표시돼 있는 등 데이터 큐레이션이 들쭉날쭉.
// 결론: include_alltime/base_team_id는 풀 자격 판정에서 완전히 배제하고, 상대적으로
// 신뢰할 수 있는 draft_year 범위(leagues.draft_year_min~draft_year_max) 하나로 통일한다.
// draft_year가 아예 없는 선수(21명, 대부분 옛날 선수)는 범위 필터를 만족할 수 없어 자연히
// 제외되는데, 이는 필터 설계 문제가 아니라 해당 선수들의 draft_year 데이터 자체가 없어서다.
export function applyMetaPlayerPoolFilter<Q extends { eq: any; gte: any; lte: any }>(
    query: Q,
    draftYearMin: number,
    draftYearMax: number,
): Q {
    const min = Number.isFinite(draftYearMin) ? Math.trunc(draftYearMin) : 1946;
    const max = Number.isFinite(draftYearMax) ? Math.trunc(draftYearMax) : 2025;
    return query.eq('in_multi_pool', true).gte('draft_year', min).lte('draft_year', max);
}
