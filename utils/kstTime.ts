/**
 * kstTime.ts — KST(UTC+9) 고정 오프셋 날짜/시간 헬퍼 (클라이언트).
 *
 * server/src/shared/kst.ts의 미러 — 두 파일은 함수 이름/동작이 동일해야 한다(클라이언트
 * utils/leagueScheduleCompressor.ts가 서버 압축기와 같은 결과를 내기 위한 전제). 이 앱은
 * 브라우저의 실제 로컬 타임존과 무관하게 항상 KST 벽시계를 기준으로 표시/계산한다.
 */

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTC 인스턴트(ms) → 그 순간의 KST 달력 날짜 기준 자정(00:00 KST)에 해당하는 UTC 인스턴트. */
export function kstMidnightUtcMs(ms: number): number {
    const kst = new Date(ms + KST_OFFSET_MS);
    const y = kst.getUTCFullYear();
    const m = kst.getUTCMonth();
    const d = kst.getUTCDate();
    return Date.UTC(y, m, d) - KST_OFFSET_MS;
}

/** realStartAt(ISO)의 KST 날짜를 기준으로 dayIndex일 뒤 KST 자정(00:00 KST) 시각. */
export function kstMidnightPlusDays(realStartAtIso: string, dayIndex: number): Date {
    const base = kstMidnightUtcMs(new Date(realStartAtIso).getTime());
    return new Date(base + dayIndex * 86_400_000);
}

export function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60_000);
}

/** KST 기준 'YYYY-MM-DD' */
export function kstDateStr(date: Date): string {
    const kst = new Date(date.getTime() + KST_OFFSET_MS);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kst.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** KST 기준 'HH:MM' */
export function kstTimeStr(date: Date): string {
    const kst = new Date(date.getTime() + KST_OFFSET_MS);
    const h = String(kst.getUTCHours()).padStart(2, '0');
    const mi = String(kst.getUTCMinutes()).padStart(2, '0');
    return `${h}:${mi}`;
}

/** KST 기준 그날 자정(00:00)으로부터 경과한 분(0~1439). */
export function kstMinuteOfDay(date: Date): number {
    const kst = new Date(date.getTime() + KST_OFFSET_MS);
    return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}
