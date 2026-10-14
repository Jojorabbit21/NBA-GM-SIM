// 멀티 드래프트 룸(WS) 에러 코드 → 사용자 문구. [2026-10-13] hooks/useLeagueDraft.ts가 돌려주던 영어 코드
// ('not your turn', 'already_drafted' …)가 화면에 그대로 노출되던 것을 막는다. 코드 출처:
// 클라이언트 — useLeagueDraft.submitPick / 서버 — server/src/DraftRoom.ts, protocol.ts
const DRAFT_ERROR_TEXT: Record<string, string> = {
    'not authenticated': '로그인이 필요합니다.',
    'not your turn':     '지금은 내 차례가 아닙니다.',
    'not_your_turn':     '지금은 내 차례가 아닙니다.',
    'connection lost':   '연결이 끊겨 지명을 보낼 수 없습니다. 다시 연결 중…',
    'timeout':           '서버 응답이 없습니다. 잠시 후 다시 시도하세요.',
    'draft_not_active':  '드래프트가 진행 중이 아닙니다.',
    'already_drafted':   '이미 지명된 선수입니다. 목록을 새로고침합니다.',
    'unauthorized':      '권한이 없습니다.',
    'not_admin':         '어드민만 할 수 있는 동작입니다.',
    'internal':          '서버 처리 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.',
};

export function mapDraftError(code: string | null | undefined): string {
    if (!code) return DRAFT_ERROR_TEXT.internal;
    return DRAFT_ERROR_TEXT[code] ?? DRAFT_ERROR_TEXT.internal;
}
