/**
 * 멀티플레이어 리그 트레이드 데드라인 — 기본값 및 조정 가능 범위 계산.
 *
 * 기본값: virtualSeasonYear(시즌 개막 연도) 기준 다음 해 2월 둘째 주 목요일
 *   (getAllStarKeyDates의 allStarStart='${virtualSeasonYear+1}-02-13'와 같은 방식으로
 *   "정규시즌 연도"를 +1로 잡는다 — utils/allStarSelection.ts 참고).
 * 조정 범위: 기본값 자체를 상한(더 늦출 수 없음)으로, 기본값의 한 달 전을 하한으로 한다
 *   (사용자 요청 — "이전 한달까지만 조절 가능, 그 이후로 늘릴 수는 없음").
 */

/** N번째 특정 요일 계산 → 'YYYY-MM-DD' (month: 1-indexed, dayOfWeek: 0=일 ... 6=토) */
function nthWeekdayOfMonthStr(year: number, month: number, dayOfWeek: number, nth: number): string {
    const first = new Date(year, month - 1, 1);
    const firstDow = first.getDay();
    const day = 1 + ((dayOfWeek - firstDow + 7) % 7) + (nth - 1) * 7;
    const d = new Date(year, month - 1, day);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' + N개월 → 'YYYY-MM-DD' */
function addMonthsStr(dateStr: string, months: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setMonth(d.getMonth() + months);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** virtualSeasonYear 기준 기본 트레이드 데드라인 — (virtualSeasonYear+1)년 2월 둘째 주 목요일. */
export function getDefaultTradeDeadline(virtualSeasonYear: number): string {
    return nthWeekdayOfMonthStr(virtualSeasonYear + 1, 2, 4, 2);
}

export interface TradeDeadlineBounds {
    /** 기본값(2월 둘째 주 목요일) — 이 날짜보다 뒤로는 늘릴 수 없음(상한). */
    default: string;
    /** 기본값의 한 달 전 — 이 날짜보다 앞당길 수 없음(하한). */
    min: string;
    /** 기본값과 동일(상한). */
    max: string;
}

export function getTradeDeadlineBounds(virtualSeasonYear: number): TradeDeadlineBounds {
    const def = getDefaultTradeDeadline(virtualSeasonYear);
    return { default: def, min: addMonthsStr(def, -1), max: def };
}

/** 범위(min~max) 밖의 값이 들어오면 가장 가까운 경계값으로 clamp — 'YYYY-MM-DD' 문자열은 사전식 비교가 날짜 비교와 동치. */
export function clampTradeDeadline(dateStr: string, bounds: TradeDeadlineBounds): string {
    if (dateStr < bounds.min) return bounds.min;
    if (dateStr > bounds.max) return bounds.max;
    return dateStr;
}
