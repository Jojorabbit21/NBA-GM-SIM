/**
 * 시즌 설정 유틸리티
 *
 * 모든 시즌별 날짜/라벨을 seasonNumber 기반으로 동적 생성.
 * 하드코딩된 '2025-10-20', '2026-02-06' 등을 대체한다.
 */

export interface SeasonConfig {
    seasonLabel: string;       // '2025-2026'
    seasonShort: string;       // '2025-26'
    seasonNumber: number;      // 1, 2, 3...
    startYear: number;         // 2025
    endYear: number;           // 2026
    startDate: string;         // '2025-10-20'
    regularSeasonEnd: string;  // '2026-04-13'
    tradeDeadline: string;     // '2026-02-06'
    allStarStart: string;      // '2026-02-13'
    allStarEnd: string;        // '2026-02-18'
}

/**
 * seasonNumber로 SeasonConfig 생성
 * season 1 = 2025-2026, season 2 = 2026-2027, ...
 * 날짜 패턴은 매 시즌 year 오프셋만 변경 (고정 월/일)
 */
export function buildSeasonConfig(seasonNumber: number): SeasonConfig {
    const startYear = 2024 + seasonNumber;   // season 1 → 2025
    const endYear = startYear + 1;           // season 1 → 2026

    return {
        seasonLabel: `${startYear}-${endYear}`,
        seasonShort: `${startYear}-${String(endYear).slice(2)}`,
        seasonNumber,
        startYear,
        endYear,
        startDate: `${startYear}-10-20`,
        regularSeasonEnd: `${endYear}-04-13`,
        tradeDeadline: `${endYear}-02-06`,
        allStarStart: `${endYear}-02-13`,
        allStarEnd: `${endYear}-02-18`,
    };
}

/** 시즌 1 기본 설정 (하위 호환용) */
export const DEFAULT_SEASON_CONFIG = buildSeasonConfig(1);
