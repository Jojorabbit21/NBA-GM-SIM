/**
 * leagueScheduleCompressor.ts — 메인리그(main_league) 정규시즌 스케줄을
 * 관리자가 정한 실제 기간(1~4주) + 일일 시뮬 시간대로 압축한다.
 *
 * scheduleGenerator.ts의 generateSeasonSchedule()은 항상 "현실적인 가상 NBA
 * 시즌 캘린더"(약 175일, All-Star 브레이크 포함)를 기준으로 82경기×30팀 스케줄을
 * 만든다 — 이 생성기 자체는 건드리지 않는다. 이 파일은 그 출력(이미 시간순 정렬된
 * Game[])을 받아서, 토너먼트의 scheduledAt SSOT 패턴과 동일하게 "생성 시점에 딱
 * 한 번" 실제 방송 시각을 계산해 붙인다.
 *
 * 압축 방식: 정렬된 게임 리스트를 durationWeeks*7개의 "실제 날짜" 버킷으로 순서대로
 * 나눠 담고(하루당 게임 수 = 전체 게임 수 / 전체 일수), 각 버킷 안에서는 관리자가 정한
 * 일일 시간대(dailyWindowStart~End) 안에 균등 간격으로 배치한다. 생성기가 이미
 * B2B/3-in-3 회피 순서로 정렬해 뒀으므로, 버킷 경계에서 약간의 오차는 있어도 전체적인
 * "몰아치지 않는" 페이스 감각은 유지된다.
 */
import { kstMidnightPlusDays, addMinutes, kstDateStr, kstTimeStr } from './kst.ts';

export interface CompressibleGame {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    date: string;
    time?: string;
    game_seq?: number;
    scheduledAt?: string;
    played?: boolean;
    isPlayoff?: boolean;
    seriesId?: string;
}

export interface LeagueCompressionConfig {
    /** 리그 실제 시작 시각 (ISO) — 이 시각의 KST 날짜가 압축 캘린더의 1일차가 된다. */
    realStartAt: string;
    /** 실제 압축 기간 (주 단위, 1~4). */
    durationWeeks: number;
    /** 일일 시뮬 시간대 시작 — 자정 기준 분(KST). 예: 19:00 = 1140. */
    dailyWindowStartMin: number;
    /** 일일 시뮬 시간대 종료 — 자정 기준 분(KST). 예: 23:00 = 1380. */
    dailyWindowEndMin: number;
}

/**
 * games는 이미 시간순으로 정렬돼 있어야 한다 (generateSeasonSchedule()의 출력이 그렇다).
 * 반환값은 game_seq/scheduledAt/date/time이 압축된 실제 시각으로 덮어써진 새 배열.
 */
export function compressLeagueSchedule<T extends CompressibleGame>(
    games: T[],
    config: LeagueCompressionConfig,
): T[] {
    const totalDays = Math.max(1, config.durationWeeks * 7);
    const gamesPerDay = Math.max(1, Math.ceil(games.length / totalDays));
    const windowMin = Math.max(1, config.dailyWindowEndMin - config.dailyWindowStartMin);
    const intervalMin = Math.max(1, windowMin / gamesPerDay);

    return games.map((g, i) => {
        const dayIndex   = Math.floor(i / gamesPerDay);
        const indexInDay = i % gamesPerDay;
        const dayMidnight = kstMidnightPlusDays(config.realStartAt, dayIndex);
        const scheduledAt = addMinutes(dayMidnight, config.dailyWindowStartMin + indexInDay * intervalMin);

        return {
            ...g,
            game_seq:    i,
            scheduledAt: scheduledAt.toISOString(),
            // 생성기가 붙인 가상 캘린더 날짜/시간(team-arena 기반 tipoff)은 압축 실제
            // 시각과 무관해지므로 폐기하고, 실제 방송 시각 기준으로 덮어쓴다.
            date: kstDateStr(scheduledAt),
            time: kstTimeStr(scheduledAt),
        };
    });
}
