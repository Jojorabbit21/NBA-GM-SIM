/**
 * leagueScheduleCompressor.ts — 메인리그(main_league) 정규시즌 스케줄을
 * 관리자가 정한 실제 기간(1~4주) + 일일 시뮬 시간대로 압축한다.
 *
 * scheduleGenerator.ts의 generateSeasonSchedule()은 항상 "현실적인 가상 NBA
 * 시즌 캘린더"(약 175일, All-Star 브레이크 포함)를 기준으로 82경기×30팀 스케줄을
 * 만든다 — 이 생성기 자체는 건드리지 않는다. 이 파일은 그 출력(이미 날짜순 정렬된
 * Game[])을 받아서, 토너먼트의 scheduledAt SSOT 패턴과 동일하게 "생성 시점에 딱
 * 한 번" 실제 방송 시각을 계산해 붙인다.
 *
 * 압축 방식: 정렬된 게임 리스트를 같은 g.date(가상 캘린더 날짜)끼리 그룹으로 묶은 뒤,
 * 그 그룹들을 순서대로 실제 시간 예산(하루 windowMin분)에 맞춰 걸어가며 배치한다. 날짜
 * 그룹은 절대 쪼개서 서로 다른 버킷(=압축된 실제 하루)에 나눠 담지 않는다 — [2026-08-28]
 * 예전에는 인덱스를 목표 게임수 단위로 기계적으로 잘랐는데, 그 절단선이 같은 가상 날짜
 * 도중에 떨어지면 같은 날짜의 경기 일부는 이미 종료, 나머지는 아직 시작도 안 한(예정)
 * 상태로 갈라지는 버그가 있었다(예: 11/13 경기 6개 중 2개만 종료).
 *
 * [2026-08-30] 가상 날짜가 바뀌는 지점에는 최소 DATE_TRANSITION_GAP_MIN(10분,
 * views/multi/season/multiGameReveal.ts의 REPLAY_DURATION_MS와 반드시 같은 값 —
 * 클라이언트/서버 미러 쌍)을 강제로 끼워 넣는다. 그전엔 압축 버킷 안에서 날짜가 몇 개든
 * 상관없이 하나의 연속 간격으로만 채워서, 어제 날짜 경기가 아직 "라이브"인데 오늘 날짜
 * 경기가 이미 시작된 것처럼 보이는 문제가 있었다. 같은 날짜 안의 경기 간격(baseIntervalMin)
 * 은 그대로 촘촘할 수 있다 — 실제 NBA도 같은 날 여러 경기가 방송 시간대별로 겹치는 게
 * 정상이라, 요구사항은 "날짜가 바뀔 때"만 해당한다. 이 최소 간격 때문에 관리자가 설정한
 * 압축 기간(durationWeeks)보다 실제로 더 걸릴 수 있다 — 그 경우 하드 실패 없이 그만큼
 * 늘어나며 console.warn만 남긴다(호출부 server/src/finalize.ts는 반환 타입이 그대로라
 * 수정 불필요).
 *
 * [2026-08-06 정정] date/time은 절대 덮어쓰지 않는다 — generateSeasonSchedule()이 붙인
 * 값은 사용자에게 보여주는 "가상 NBA 캘린더" 날짜/시간(예: 2027년 10월 24일 19:00)이고,
 * scheduledAt은 그 경기가 실제로 시뮬레이션되는 압축된 실제 시각이다. 이 둘은 의도적으로
 * 다른 값이며, 실제 시각을 사용자에게 노출해서는 안 된다(내부 스케줄링/라이브 상태 판정
 * 전용). 과거에는 여기서 date/time을 scheduledAt 기준으로 덮어써서 가상 캘린더가
 * 통째로 사라지는 버그가 있었다.
 */
import { kstMidnightPlusDays, addMinutes, kstMinuteOfDay } from './kst.ts';

// views/multi/season/multiGameReveal.ts의 REPLAY_DURATION_MS(10분)와 반드시 같은 값으로
// 유지해야 하는 클라이언트/서버 미러 쌍 — 한쪽만 고치면 "아직 라이브인데 다음 날짜 경기가
// 이미 시작됨" 버그가 재발한다.
const DATE_TRANSITION_GAP_MIN = 10;

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
 * games는 이미 날짜순으로 정렬돼 있어야 한다 (generateSeasonSchedule()의 출력이 그렇다).
 * 같은 g.date를 가진 경기들은 배열에서 항상 연속 구간을 이룬다고 가정한다(마찬가지로
 * generateSeasonSchedule()이 보장). 반환값은 game_seq/scheduledAt만 압축된 실제 시각으로
 * 새로 채워진 배열 — date/time(가상 캘린더 표시값)은 생성기가 붙인 값 그대로 보존된다.
 */
export function compressLeagueSchedule<T extends CompressibleGame>(
    games: T[],
    config: LeagueCompressionConfig,
): T[] {
    const totalDays    = Math.max(1, config.durationWeeks * 7);
    const targetPerDay = Math.max(1, games.length / totalDays);
    const windowMin    = Math.max(1, config.dailyWindowEndMin - config.dailyWindowStartMin);

    // [Fix 2026-08-13] realStartAt(리그 실제 시작/드래프트 완료 시각)이 그날의 일일 시뮬
    // 시간대(dailyWindowStartMin) 도중이거나 이미 지난 뒤라면, 1일차를 오늘로 잡으면 "윈도우
    // 시작~지금" 구간 슬롯들이 스케줄이 만들어지는 바로 그 순간 이미 "과거"가 되어 곧바로
    // 자동 시뮬레이션되는 버그가 있었다(예: 09:00~18:00 윈도우인데 정오에 드래프트를 끝내면
    // 09:00~12:00 구간이 생성 직후 몰아서 처리됨). 그날 윈도우가 이미 시작됐으면(>=
    // dailyWindowStartMin) 1일차 자체를 다음 날로 민다 — 아직 시작 전(예: 새벽에 리그 생성)
    // 이면 오늘 그대로 1일차로 쓴다.
    const startDayOffset = kstMinuteOfDay(new Date(config.realStartAt)) >= config.dailyWindowStartMin ? 1 : 0;

    // 같은 g.date끼리 그룹으로 묶는다 — generateSeasonSchedule()의 출력이 날짜순 정렬돼
    // 있으므로 같은 날짜는 항상 연속 구간이다.
    const dateGroups: { date: string; games: T[] }[] = [];
    for (const g of games) {
        const last = dateGroups[dateGroups.length - 1];
        if (last && last.date === g.date) last.games.push(g);
        else dateGroups.push({ date: g.date, games: [g] });
    }

    // 목표 페이스(하루당 게임수)에서 역산한 "같은 날짜 안" 기본 간격 — 날짜가 안 바뀌는 한
    // 이 값 그대로 촘촘하게 쓴다(기존과 동일한 이상적 페이스 감각 유지).
    const baseIntervalMin = Math.max(1, windowMin / targetPerDay);

    const result: T[] = [];
    let seq = 0;
    let dayIndex = 0;
    let usedMinInDay = 0;
    let isFirstGroupOfDay = true;

    for (const group of dateGroups) {
        const neededForGroup = (group.games.length - 1) * baseIntervalMin;
        const gapBefore = isFirstGroupOfDay ? 0 : DATE_TRANSITION_GAP_MIN;

        // 오늘 윈도우에 (날짜 전환 최소 간격 + 이 날짜 그룹 전체)가 안 들어가면 다음 실제
        // 날짜로 넘긴다 — 자정을 넘는 자연스러운 텀 자체가 이미 DATE_TRANSITION_GAP_MIN보다
        // 훨씬 크므로 이중으로 간격을 더하지 않는다. 단, 오늘이 아직 비어 있는데도 그룹
        // 하나가 윈도우보다 큰 경우(하루치 경기가 유난히 많은 날)는 어쩔 수 없이 그대로
        // 담아 진행한다 — 그래야 다음 날로 무한정 밀리지 않는다.
        if (!isFirstGroupOfDay && usedMinInDay + gapBefore + neededForGroup > windowMin) {
            dayIndex++;
            usedMinInDay = 0;
            isFirstGroupOfDay = true;
        }

        const actualGap = isFirstGroupOfDay ? 0 : DATE_TRANSITION_GAP_MIN;
        usedMinInDay += actualGap;

        const dayMidnight = kstMidnightPlusDays(config.realStartAt, startDayOffset + dayIndex);
        for (let i = 0; i < group.games.length; i++) {
            const scheduledAt = addMinutes(dayMidnight, config.dailyWindowStartMin + usedMinInDay + i * baseIntervalMin);
            result.push({ ...group.games[i], game_seq: seq++, scheduledAt: scheduledAt.toISOString() });
        }
        usedMinInDay += neededForGroup;
        isFirstGroupOfDay = false;
    }

    if (dayIndex + 1 > totalDays) {
        console.warn(
            `[compressLeagueSchedule] 설정한 압축 기간(${totalDays}일)보다 ${dayIndex + 1 - totalDays}일 ` +
            `더 걸림 — 날짜 전환 최소 간격(${DATE_TRANSITION_GAP_MIN}분) 확보 때문.`,
        );
    }

    return result;
}
