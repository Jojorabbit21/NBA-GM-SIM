/**
 * [2026-10-06] 리그 부트스트랩 게이트(hooks/useLeagueBootstrap.ts)가 진입 시 미리 받는 공통 쿼리의 루트 키.
 * errorCollector는 이 키들의 조회 실패를 토스트로 올리지 않는다 — 게이트가 조용한 재시도(3초×3회)와
 * 확정 실패 화면으로 직접 처리하고, 진입 뒤의 백그라운드 재조회 실패는 화면이 이전 데이터를 그대로 쓰므로
 * 알릴 필요가 없다. 별도 모듈에 둔 이유: errorCollector(services) ↔ hooks 사이 순환 임포트 방지.
 */
export const BOOTSTRAP_QUERY_ROOT_KEYS: ReadonlySet<string> = new Set([
    'multiSearchPool',
    'metaPlayerOrder',
    'gameShortCodes',
    'leagueRawPlayers',
    'leagueRawSeasonInjury',
    'playerSeasonStatsLeague',
    'homeLeagueTransactions',
    'leagueNewsStories',
    'pendingTradeCount',
]);

export function isBootstrapQueryKey(queryKey: readonly unknown[]): boolean {
    return BOOTSTRAP_QUERY_ROOT_KEYS.has(String(queryKey?.[0] ?? ''));
}
