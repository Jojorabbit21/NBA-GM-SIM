// 리그 관전(Spectate) 모드 접근 규칙 — 클라이언트 쪽 UX 게이트.
// 진짜 권한 통제는 DB(spectatable_room_ids() + SELECT 전용 *_spectator_select RLS, 쓰기 RPC의 소유권 검증)가
// 담당하고, 여기서는 "허용된 메뉴만 보이고 나머지 URL은 홈으로 돌려보내기"만 한다.
// 관전 가능 조건·허용 경로를 바꾸면 migrations/add_league_spectate.sql 과 sidebar(MultiSidebar) 메뉴도 함께 볼 것.

import type { LeagueRow } from '../services/multi/roomQueries';

/** 관전 대상이 될 수 있는 리그 상태 — recruiting/drafting(드래프트 단계)은 관전 불가. */
export const SPECTATABLE_STATUSES = ['in_progress', 'finished'] as const;

export function isLeagueSpectatable(league: Pick<LeagueRow, 'status' | 'spectate_enabled'> | null | undefined): boolean {
    return !!league
        && !!league.spectate_enabled
        && (SPECTATABLE_STATUSES as readonly string[]).includes(league.status);
}

/** 관전자에게 허용되는 /season 하위 경로(첫 세그먼트). '' = 시즌 홈. */
const ALLOWED_SEGMENTS = new Set([
    '',            // 홈
    'news',        // 뉴스피드
    'roster',      // 팀(로스터) — 타 팀 포함 열람
    'standings',   // 순위표
    'race',        // 순위 경쟁
    'playoffs',    // 플레이오프 대진(읽기 전용)
    'leaderboard', // 리더보드
    'schedule',    // 일정
    'compare',     // 선수 비교
    'game',        // 경기 상세(일정에서 진입)
    'player',      // 선수 상세(로스터·리더보드에서 진입)
    'more',        // [2026-10-27] 모바일 셸 더보기 탭(메뉴 리스트, 쓰기 항목은 화면이 isSpectator로 숨김)
]);

/**
 * pathname이 관전자에게 허용된 경로인가.
 * - /multi/leagues/:id/season[/<segment>/...] 만 허용 (draft, personal-draft, admin, 그 외 전부 거부)
 * - 전술/트레이드·자유계약(transaction)/협상/방출/올스타/설정/드래프트 풀 등은 허용 목록에 없으므로 거부
 */
export function isSpectatorPathAllowed(pathname: string): boolean {
    const m = pathname.match(/^\/multi\/leagues\/[^/]+\/season(?:\/([^/]*))?\/?/);
    if (!m) return false;
    return ALLOWED_SEGMENTS.has(m[1] ?? '');
}
