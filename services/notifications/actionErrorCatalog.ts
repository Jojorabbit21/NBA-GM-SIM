// actionErrorCatalog.ts — "버튼 액션(저장·참가·방출·시작…)" 실패 문구 카탈로그. [2026-10-13] 에러 표시 정책(0-7,
// docs/plan/ui-inline-notice.md 3장): 서비스가 Postgres/PostgREST/fetch 원문(영문)을 그대로 돌려주던 것을 막고,
// 인라인(InlineNotice)에 바로 넣을 수 있는 "{무엇}에 실패했습니다. {원인}" 형태로 바꾼다. 원문은 콘솔에만 남긴다.
// 조회(useQuery) 실패는 queryErrorCatalog.ts, RPC가 직접 던지는 도메인 코드(roster_full 등)는 각 서비스의 매핑표가 먼저
// 처리하고 여기엔 그 표에 없는 나머지만 온다.

import { classifyQueryError, CAUSE_TEXT } from './queryErrorCatalog';

function messageOf(err: unknown): string {
    if (!err) return '';
    if (typeof err === 'string') return err;
    return String((err as { message?: unknown })?.message ?? '');
}
function codeOf(err: unknown): string {
    return String((err as { code?: unknown })?.code ?? '');
}

/**
 * Supabase 뮤테이션/RPC 실패 → 사용자 문구. `what`은 "리그 설정 저장", "팀 선택"처럼 동작의 이름(조사 없이).
 * 예: actionFailure(error, '팀 이름 저장') → "팀 이름 저장에 실패했습니다. 권한이 없습니다."
 */
export function actionFailure(err: unknown, what: string): string {
    const msg = messageOf(err);
    const code = codeOf(err);
    const head = `${what}에 실패했습니다.`;
    if (msg) console.warn(`[actionFailure] ${what}:`, err); // 원문은 콘솔에만

    if (code === '23505' || /duplicate key|unique_violation/i.test(msg)) return `${head} 이미 같은 값이 있습니다.`;
    if (code === '42501' || /row-level security|permission denied|not_authorized|not_admin/i.test(msg)) return `${head} 권한이 없습니다.`;
    if (code === '57014' || /statement timeout|canceling statement/i.test(msg)) return `${head} 처리 시간이 초과되었습니다. 잠시 후 다시 시도하세요.`;
    if (/jwt expired|invalid claim|not_authenticated|refresh token/i.test(msg)) return `${head} 로그인이 만료되었습니다. 다시 로그인하세요.`;
    return `${head} ${CAUSE_TEXT[classifyQueryError(err)]}`;
}

/** Fly.io HTTP 엔드포인트(/start-draft, /run-lottery, /sim-override 등)의 비-2xx 응답 → 사용자 문구. */
export function httpActionFailure(status: number, serverError: string | undefined, what: string): string {
    const head = `${what}에 실패했습니다.`;
    const s = serverError ?? '';
    console.warn(`[httpActionFailure] ${what}: HTTP ${status} ${s}`); // 원문은 콘솔에만
    // 서버가 돌려주는 도메인 문자열(server/src/*.ts) — 알려진 것만 번역, 나머지는 상태 코드 부류로
    if (/not in recruiting/i.test(s))     return `${head} 모집 중 상태에서만 할 수 있습니다.`;
    if (/already started/i.test(s))       return `${head} 드래프트가 이미 시작되었습니다.`;
    if (/lottery_already_done/i.test(s))  return '이미 추첨이 완료되었습니다.';
    if (/room not found|league not found|not found/i.test(s) || status === 404) return `${head} 대상을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.`;
    if (status === 401) return `${head} 로그인이 만료되었습니다. 다시 로그인하세요.`;
    if (status === 403) return `${head} 권한이 없습니다.`;
    if (status === 400) return `${head} 요청이 올바르지 않습니다.`;
    if (status >= 500)  return `${head} 서버 처리 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.`;
    return `${head} ${CAUSE_TEXT.unknown}`;
}
