/**
 * 시즌 설정 유틸리티
 *
 * 모든 시즌별 날짜/라벨을 seasonNumber 기반으로 동적 생성.
 * 요일 앵커링 규칙으로 매 시즌 날짜가 자연스럽게 달라진다.
 */

// ── 헬퍼 함수 ──

/** N번째 특정 요일 계산 (dayOfWeek: 0=일, 1=월, ..., 6=토, month: 0-indexed) */
function nthDayOfMonth(year: number, month: number, dayOfWeek: number, nth: number): Date {
    const first = new Date(year, month, 1);
    const firstDow = first.getDay();
    const day = 1 + ((dayOfWeek - firstDow + 7) % 7) + (nth - 1) * 7;
    return new Date(year, month, day);
}

/** 해당 월의 마지막 특정 요일 */
function lastDayOfWeekInMonth(year: number, month: number, dayOfWeek: number): Date {
    const last = new Date(year, month + 1, 0); // 말일
    const diff = (last.getDay() - dayOfWeek + 7) % 7;
    return new Date(year, month, last.getDate() - diff);
}

/** Date → 'YYYY-MM-DD' */
function fmt(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Date + N일 */
function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

// ── 타입 정의 ──

export interface SeasonKeyDates {
    // 오프시즌
    draftLottery: string;        // 5월 2번째 화요일
    rookieDraft: string;         // 6월 4번째 목요일
    moratoriumStart: string;     // 6월 30일 (고정)
    freeAgencyOpen: string;      // 7월 1번째 일요일 +1일
    freeAgencyClose: string;     // 9월 2번째 금요일
    trainingCamp: string;        // 9월 마지막 화요일
    rosterDeadline: string;      // 10월 3번째 월요일
    // 정규시즌
    openingNight: string;        // 10월 3번째 화요일
    prospectReveal: string;      // 1월 1번째 월요일 — 드래프트 풀 공개
    christmasDay: string;        // 12월 25일 (고정)
    tradeDeadline: string;       // 2월 1번째 목요일
    allStarStart: string;        // 2월 3번째 금요일
    allStarEnd: string;          // 올스타 시작 +3일
    regularSeasonEnd: string;    // 4월 2번째 일요일
    awardsAnnouncement: string;  // 정규시즌 종료 +1일
    // 포스트시즌
    playInStart: string;         // 정규시즌 종료 +2일
    playInEnd: string;           // 플레이인 시작 +3일
    playoffsR1Start: string;     // 플레이인 종료 +2일
    playoffsR2Start: string;     // R1 시작 +14일
    conferenceFinals: string;    // R2 시작 +14일
    finalsStart: string;         // CF 시작 +14일
    finalsEndTarget: string;     // 파이널 시작 +18일
}

export interface SeasonConfig {
    seasonLabel: string;       // '2025-2026'
    seasonShort: string;       // '2025-26'
    seasonNumber: number;      // 1, 2, 3...
    startYear: number;         // 2025
    endYear: number;           // 2026
    startDate: string;         // 이 시즌 개막일 (keyDates.openingNight은 다음 시즌 개막)
    regularSeasonEnd: string;  // 정규시즌 종료
    tradeDeadline: string;     // 트레이드 데드라인
    allStarStart: string;      // 올스타 브레이크 시작
    allStarEnd: string;        // 올스타 브레이크 종료
    keyDates: SeasonKeyDates;  // 전체 Key Dates
}

// ── 빌더 ──

/**
 * seasonNumber로 SeasonConfig 생성
 * season 1 = 2025-2026, season 2 = 2026-2027, ...
 * 요일 앵커링 규칙으로 매 시즌 날짜가 자연스럽게 달라짐
 */
export function buildSeasonConfig(seasonNumber: number): SeasonConfig {
    const startYear = 2024 + seasonNumber;   // season 1 → 2025
    const endYear = startYear + 1;           // season 1 → 2026

    // ── 시즌 시작일 (startYear 기준) ──
    const seasonStart     = nthDayOfMonth(startYear, 9, 2, 3);                // 10월 3번째 화요일

    // ── 정규시즌 (endYear 기준) ──
    const prospectReveal   = nthDayOfMonth(endYear, 0, 1, 1);                 // 1월 1번째 월요일 (드래프트 풀 공개)
    const tradeDeadline    = nthDayOfMonth(endYear, 1, 4, 1);                 // 2월 1번째 목요일
    const allStarStart     = nthDayOfMonth(endYear, 1, 5, 3);                 // 2월 3번째 금요일
    const allStarEnd       = addDays(allStarStart, 3);                        // +3일 (월요일)
    const regularSeasonEnd = nthDayOfMonth(endYear, 3, 0, 2);                 // 4월 2번째 일요일
    const awardsAnnouncement = addDays(regularSeasonEnd, 1);                  // 정규시즌 종료 +1일

    // ── 포스트시즌 (정규시즌 종료 기준 상대 오프셋) ──
    const playInStart      = addDays(regularSeasonEnd, 2);
    const playInEnd        = addDays(playInStart, 3);
    const playoffsR1Start  = addDays(playInEnd, 2);
    const playoffsR2Start  = addDays(playoffsR1Start, 14);
    const conferenceFinals = addDays(playoffsR2Start, 14);
    const finalsStart      = addDays(conferenceFinals, 14);
    const finalsEndTarget  = addDays(finalsStart, 18);

    // ── 오프시즌 (finalsEndTarget 기준 상대 오프셋 — 파이널 종료 후 순차 진행) ──
    const draftLottery    = addDays(finalsEndTarget, 3);                      // 파이널 종료 +3일
    const rookieDraft     = addDays(draftLottery, 14);                        // 로터리 +14일
    const moratoriumStart = addDays(rookieDraft, 5);                          // 드래프트 +5일
    const freeAgencyOpen  = addDays(moratoriumStart, 7);                      // 모라토리엄 +7일
    const freeAgencyClose = nthDayOfMonth(endYear, 8, 5, 2);                  // 9월 2번째 금요일
    const trainingCamp    = lastDayOfWeekInMonth(endYear, 8, 2);              // 9월 마지막 화요일
    const rosterDeadline  = nthDayOfMonth(endYear, 9, 1, 3);                  // 10월 3번째 월요일
    const openingNight    = nthDayOfMonth(endYear, 9, 2, 3);                  // 10월 3번째 화요일 (다음 시즌 개막)

    const keyDates: SeasonKeyDates = {
        // 오프시즌
        draftLottery: fmt(draftLottery),
        rookieDraft: fmt(rookieDraft),
        moratoriumStart: fmt(moratoriumStart),
        freeAgencyOpen: fmt(freeAgencyOpen),
        freeAgencyClose: fmt(freeAgencyClose),
        trainingCamp: fmt(trainingCamp),
        rosterDeadline: fmt(rosterDeadline),
        // 정규시즌
        openingNight: fmt(openingNight),
        prospectReveal: fmt(prospectReveal),
        christmasDay: `${startYear}-12-25`,
        tradeDeadline: fmt(tradeDeadline),
        allStarStart: fmt(allStarStart),
        allStarEnd: fmt(allStarEnd),
        regularSeasonEnd: fmt(regularSeasonEnd),
        awardsAnnouncement: fmt(awardsAnnouncement),
        // 포스트시즌
        playInStart: fmt(playInStart),
        playInEnd: fmt(playInEnd),
        playoffsR1Start: fmt(playoffsR1Start),
        playoffsR2Start: fmt(playoffsR2Start),
        conferenceFinals: fmt(conferenceFinals),
        finalsStart: fmt(finalsStart),
        finalsEndTarget: fmt(finalsEndTarget),
    };

    return {
        seasonLabel: `${startYear}-${endYear}`,
        seasonShort: `${startYear}-${String(endYear).slice(2)}`,
        seasonNumber,
        startYear,
        endYear,
        // startDate = 이 시즌의 개막일 (keyDates.openingNight은 다음 시즌 개막)
        startDate: fmt(seasonStart),
        regularSeasonEnd: keyDates.regularSeasonEnd,
        tradeDeadline: keyDates.tradeDeadline,
        allStarStart: keyDates.allStarStart,
        allStarEnd: keyDates.allStarEnd,
        keyDates,
    };
}

/** 시즌 1 기본 설정 (하위 호환용) */
export const DEFAULT_SEASON_CONFIG = buildSeasonConfig(1);
