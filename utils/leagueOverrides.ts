// [2026-09-16] "이 리그가 custom_overrides(피크시즌 오버라이드)를 적용해서 선수 능력치를
// 보여줄지" 판단하는 로직을 한 곳으로 통합. 원래는 화면마다
// `(league?.draft_pool ?? '').split(',').includes('alltime')`를 각자 복붙해서 썼는데,
// hooks/useMultiSearchData.ts만 이 분기를 안 쓰고 항상 true로 하드코딩돼 있어 같은 리그의
// 화면끼리(예: 트레이드 새 제안 탭 vs 로스터 화면) 같은 선수의 OVR이 다르게 표기되는 버그가
// 있었다.
//
// 그 직후, draft_pool의 'standard'/'alltime' 풀 타입 구분(체크박스) 자체가 폐지되면서
// draft_pool이 항상 DB 기본값 'standard'로 고정돼버려 이 기능을 켤 수 있는 UI가 사라지는
// 회귀가 생겼다. 풀 자격 판정(draft_year 범위)과는 완전히 별개의 축이므로, 전용 컬럼
// `leagues.use_custom_overrides`(기본 false)로 분리했다 — 리그 생성 시 설정하고 이후에도
// 리그 설정 화면에서 바꿀 수 있다. server/src/shared/leagueOverrides.ts가 서버 미러.
// 앞으로 이 판단이 필요한 모든 곳은 반드시 이 함수(또는 서버 미러)를 거칠 것 — 화면마다
// 다시 구현하지 말 것.
export function shouldUseCustomOverrides(league: { use_custom_overrides?: boolean | null } | null | undefined): boolean {
    return league?.use_custom_overrides ?? false;
}
