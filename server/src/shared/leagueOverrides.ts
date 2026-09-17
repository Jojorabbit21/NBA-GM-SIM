
// utils/leagueOverrides.ts의 서버 미러. "이 리그가 custom_overrides(선수 피크시즌 스탯
// 오버라이드)를 적용할지" 판단을 클라이언트와 동일하게 leagues.use_custom_overrides
// 컬럼 하나로 판단한다. [2026-09-16] 예전엔 draft_pool 문자열에 'alltime' 토큰이
// 포함되는지로 판단했는데, draft_pool의 standard/alltime 풀 타입 구분이 폐지되면서
// draft_pool이 항상 'standard'로 고정돼 이 기능을 켤 수 없게 되는 회귀가 있었다 —
// 전용 컬럼으로 분리해서 클라이언트/서버가 항상 같은 값을 보게 한다.
export function shouldUseCustomOverrides(league: { use_custom_overrides?: boolean | null } | null | undefined): boolean {
    return league?.use_custom_overrides ?? false;
}
