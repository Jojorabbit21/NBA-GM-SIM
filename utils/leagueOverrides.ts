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

/**
 * [2026-09-18] 이 리그에서 Two-Way 계약 경로(슬롯 표시·설정, 협상 화면의 투웨이 유형)가 살아 있는지.
 * CBA 규정(cba_rules_enabled)이 꺼지면 협상 화면 자체가 없어 투웨이가 성립하지 않고(2026-09-17), 그 위에
 * 리그 설정의 Two-Way 사용 스위치(two_way_enabled, 기본 true)가 추가로 걸린다. 서버 RPC
 * sign_free_agent_negotiated()도 two_way_enabled=false면 two_way 계약을 거부한다(two_way_disabled).
 * 화면마다 두 플래그를 각자 조합하지 말고 이 함수를 쓸 것.
 */
export function isTwoWayContractEnabled(
    league: { cba_rules_enabled?: boolean | null; two_way_enabled?: boolean | null } | null | undefined,
): boolean {
    return !!league?.cba_rules_enabled && (league?.two_way_enabled ?? true);
}
