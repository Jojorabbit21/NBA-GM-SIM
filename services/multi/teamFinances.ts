import type { DeadMoneyEntry } from '../../types/team';
import type { SavedTeamFinances } from '../../types/finance';

// ============================================================
// rooms.team_finances 조회 — 유일한 소스
//
// release_player() RPC(waive만, migrations/fix_release_player_*.sql 최신)가 유일한 write
// 경로: cap_enabled 리그에서 방출 시 rooms.team_finances[team_slug].deadMoney에 항목을
// append한다. 화면마다 `room?.team_finances?.[slug]?.deadMoney` 조회를 따로 인라인으로
// 쓰지 말고 이 함수로 통일할 것 — 2026-09-21에 이걸 안 지켜서 MultiNegotiationView.tsx/
// MultiFrontOfficeView.tsx 둘 다 각자 따로 팀 페이롤을 계산하다 데드캡을 누락한 회귀가
// 두 번 발생했다(docs/history/dev-log.md 2026-09-21 항목들 참고).
//
// 팀 페이롤 합계(로스터 연봉 + 데드캡)가 필요하면 이 함수가 반환한 배열을
// services/fa/faMarketBuilder.ts의 calcTeamPayroll({ roster, deadMoney })에 그대로 넘길 것.
// ============================================================

/**
 * 특정 팀(team_slug)의 데드캡 목록. 없으면 빈 배열(항상 안전하게 .reduce/.map 가능).
 *
 * `season`을 생략하면(예: '2026-27' 형태) 그 팀의 데드캡 항목을 전부 반환 — 재정 탭처럼
 * 항목마다 자기 시즌 컬럼에 따로 표시해야 하는 다중 시즌 뷰(`TeamPayrollTable.tsx`)에서 씀.
 *
 * `season`을 넘기면 그 시즌에 해당하는 항목만 걸러서 반환한다 — "지금 이 팀의 캡에 실제로
 * 얼마가 잡히는가"(팀 페이롤 스칼라 합계, `calcTeamPayroll()`에 넘길 값)를 구할 때 반드시
 * 이 필터를 거칠 것. [2026-09-21] 예전엔 이 필터 없이 팀의 데드캡 전체를 시즌 구분 없이
 * 그대로 합산했다 — waive는 항목이 하나뿐이라 우연히 문제가 안 됐지만, stretch처럼 한 번의
 * 방출로 여러 시즌에 걸친 항목이 생기면(연도별로 항목을 나눠 만듦 — 각 항목의 season이 그
 * 해당 시즌) 전부 더하면 7년치 총액이 올해 캡에 한꺼번에 잡히는 오류가 난다. 실제 CBA는
 * "해당 시즌의 캡에만" 잡히는 게 절대 규칙(docs/domain/nba-salary-cap-2025-26.md §8-4).
 */
export function getTeamDeadMoney(
    teamFinances: SavedTeamFinances | null | undefined,
    teamSlug: string | null | undefined,
    season?: string,
): DeadMoneyEntry[] {
    if (!teamSlug) return [];
    const all = teamFinances?.[teamSlug]?.deadMoney ?? [];
    return season != null ? all.filter(d => d.season === season) : all;
}
