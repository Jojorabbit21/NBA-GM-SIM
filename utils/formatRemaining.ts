// formatRemaining.ts — 남은 시간 문자열. [2026-10-14] MultiHeader.tsx의 로컬 함수를 공용으로(홈 밴드 1 타이머와 공유).
// compact: "1일 3시간" / "1:23:45" / "12:34" — 헤더 다음 경기 카운트다운.
// clock:   자리수 고정 "1일 03:04:05" / "03:04:05" — 추첨/드래프트 이벤트 타이머.
// 0 이하일 때 문구(zeroText)는 호출부가 정한다.
export function fmtRemaining(diffMs: number, zeroText = '곧 시작', style: 'compact' | 'clock' = 'compact'): string {
    if (diffMs <= 0) return zeroText;
    const totalSec = Math.floor(diffMs / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const sec = totalSec % 60;
    if (style === 'clock') {
        const hms = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        return d > 0 ? `${d}일 ${hms}` : hms;
    }
    if (d > 0) return `${d}일 ${h}시간`;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
