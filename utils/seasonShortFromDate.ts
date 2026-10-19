// NBA 시즌은 10월에 시작해 이듬해 6월에 끝나므로, 7월 이전(1~6월)이면 시즌 시작 연도가
// 작년이다 — "2026-27" 형태로 표기(단일플레이어 utils/seasonConfig.ts의 seasonShort와 동일 포맷).
// [2026-10-19] MultiHeader.tsx 로컬 함수를 공용으로 이동(리그 홈 화면도 같은 표기를 써야 함).
export function seasonShortFromDate(dateKey: string): string {
    const d = new Date(dateKey + 'T00:00:00');
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const startYear = m >= 7 ? y : y - 1;
    return `${startYear}-${String(startYear + 1).slice(2)}`;
}
