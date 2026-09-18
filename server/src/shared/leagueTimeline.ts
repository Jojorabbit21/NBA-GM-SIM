/**
 * leagueTimeline.ts — 고정 길이 가상 하루(Fixed-Day) 타임라인.
 *
 * [2026-09-18] 메인리그(main_league)의 "가상 캘린더 날짜 ↔ 실제 시각" 대응을 이 파일 하나로
 * 정의한다(docs/plan/fixed-day-schedule-plan.md). 예전 압축기(leagueScheduleCompressor.ts,
 * 폐기)는 가상 하루의 실제 길이가 그날 경기 수에 비례해 "지금이 며칠인가"를 시간으로 정할 수
 * 없었고, 그 결과 (1) 같은 날짜 안 경기 시작 순서가 배열 순서에 좌우되고 (2) 날짜 전환이
 * 경기 역산에 의존해 라이브 도중 미리 넘어가는 문제가 있었다.
 *
 * 핵심 규칙:
 *  - 가상 하루 하나 = 실제 D분(dayLengthMin, 20~40, 기본 30) 고정. 경기 없는 날(휴식일·올스타
 *    브레이크·플레이오프 빈 날)도 똑같이 D분을 쓴다.
 *  - 가상 시계는 19:00(VIRTUAL_DAY_START_MIN) → 다음 날 03:00(8시간)을 D분에 선형 매핑한다.
 *    낮 시간은 흐르지 않는다. 가상 자정은 D×5/8 지점(real_midnight_at) — 날짜 전환 시점.
 *  - 실제 하루에는 가상 k일을 담는다(k = ceil(전체 가상 일수 / 실제 일수)). 일일 시뮬 시간대
 *    길이는 k×D로 "계산"된다(입력값이 아님). 시작 시각(windowStartMin)만 관리자가 고른다.
 *  - 경기 실제 시각 = 가상 날짜 행의 real_start_at + (가상 시각 − 19:00) × (D / 480분).
 *    마지막 경기 시작 + 리플레이가 real_end_at을 넘지 않도록 클램프한다.
 *
 * ⚠️ 클라이언트 미러: utils/leagueTimeline.ts — import 경로만 다르고 내용은 동일해야 한다.
 * 이 파일을 고치면 미러도 같은 내용으로 갱신할 것(dev-log 2026-09-18 항목).
 */
import { KST_OFFSET_MS } from './kst.ts';

// ── 상수 ──────────────────────────────────────────────────────────────────────

/** 가상 하루의 시계가 흐르기 시작하는 가상 시각(분). 생성기의 첫 경기 슬롯(19:00)과 동일. */
export const VIRTUAL_DAY_START_MIN = 19 * 60;
/** 가상 하루의 시계 구간 길이(분) — 19:00 → 다음 날 03:00. */
export const VIRTUAL_DAY_SPAN_MIN = 8 * 60;
/** 가상 자정까지의 시계 구간(분) — 19:00 → 00:00. */
export const VIRTUAL_MIDNIGHT_OFFSET_MIN = 5 * 60;

export const MIN_DAY_LENGTH_MIN = 20;
export const MAX_DAY_LENGTH_MIN = 40;
export const DEFAULT_DAY_LENGTH_MIN = 30;
/** 일일 시뮬 시간대 시작 기본값 — 10:00 KST. */
export const DEFAULT_WINDOW_START_MIN = 10 * 60;
/** 리플레이(결과 공개 지연) 길이 기본값(분). [2026-09-18 2단계] 리그 설정 leagues.replay_minutes로
 *  승격 — 선택지 REPLAY_MINUTE_OPTIONS. 미러: multiGameReveal.getReplayDurationMs(), 서버 replayConfig,
 *  DB room_replay_interval(). */
export const DEFAULT_REPLAY_MIN = 10;
export const REPLAY_MINUTE_OPTIONS = [5, 8, 10, 12] as const;
/** 하루 길이 하한 = 리플레이 + 이 여유(분) — 마지막 경기 시작 이후 최소한의 재생 시간을 보장. */
export const DAY_LENGTH_REPLAY_MARGIN_MIN = 2;
export const DEFAULT_PLAYOFF_INTERVAL_DAYS = 1;
/** 정규시즌 가상 캘린더 — finalize.ts의 generateSeasonSchedule 설정과 동일 규칙. */
export const REGULAR_SEASON_START_MMDD = '10-21';
export const REGULAR_SEASON_END_MMDD   = '04-13';

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type VirtualDayKind =
    | 'regular'          // 정규시즌 캘린더 날짜(경기가 있을 수도, 휴식일일 수도 있음)
    | 'allstar_announce' // 올스타 참가자 발표(allStarStart)
    | 'allstar_rising'   // 라이징스타 챌린지(allStarStart+1)
    | 'allstar_contests' // 3점 챌린지·덩크 컨테스트(allStarStart+2)
    | 'allstar_main'     // 올스타 본경기(allStarStart+3)
    | 'allstar_break'    // 그 외 브레이크 날짜
    | 'playoff';         // 포스트시즌(플레이인 포함) 캘린더 날짜

export interface VirtualCalendarDay {
    date: string;   // 'YYYY-MM-DD'
    kind: VirtualDayKind;
}

export interface VirtualDayRow extends VirtualCalendarDay {
    dayIndex: number;
    realStartAt: string;    // ISO — 가상 19:00
    realMidnightAt: string; // ISO — 가상 00:00 (날짜 전환)
    realEndAt: string;      // ISO — 가상 03:00 (= realStartAt + D)
}

export interface AllStarKeyDatesLike {
    allStarStart: string;
    allStarEnd: string;
    allStarRisingStarsDate: string;
    allStarThreePointContestDate: string;
    allStarMainGameDate: string;
}

export interface PlayoffCalendarSpec {
    /** 시리즈 안 경기 간격(가상 일). 1=매일, 2=격일. 라운드 사이 간격도 같은 값. */
    intervalDays: number;
    playInEnabled: boolean;
    /** 컨퍼런스별 진출 팀 수 — 전체 브라켓 크기(2n → 다음 2의 거듭제곱)로 라운드 수 결정. */
    teamsPerConference: number;
    targetWins: number;
    finalsTargetWins: number;
}

export interface TimelineFeasibilityInput {
    realStartDate: string;   // 'YYYY-MM-DD' (KST)
    realEndDate: string;     // 'YYYY-MM-DD' (KST, inclusive)
    dayLengthMin: number;
    windowStartMin: number;  // KST 자정 기준 분
    virtualDayCount: number;
    /** 리플레이 길이(분). 주면 하루 길이 ≥ 리플레이 + DAY_LENGTH_REPLAY_MARGIN_MIN 조건을 함께 검사. */
    replayMin?: number;
}

export interface TimelineFeasibility {
    realDays: number;
    perDay: number;          // 실제 하루에 담기는 가상 일수 k
    windowMin: number;       // k × D
    windowEndMin: number;    // windowStartMin + windowMin (1440 초과 가능 — 그 경우 불가능)
    feasible: boolean;
    reasons: string[];
    /** 불가능할 때의 대안 — 각각 독립적으로 적용하면 가능해지는 값. */
    suggestions: {
        minEndDate: string | null;        // 종료일을 이 날짜 이후로
        maxDayLengthMin: number | null;   // 하루 길이를 이 값 이하로
        latestWindowStartMin: number | null; // 시작 시각을 이 시각 이전으로
    };
}

// ── 날짜 문자열 헬퍼 (KST 고정, 로컬 타임존 무관) ──────────────────────────────

export function kstDateToMidnightMs(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, m - 1, d) - KST_OFFSET_MS;
}

export function msToKstDateStr(ms: number): string {
    const k = new Date(ms + KST_OFFSET_MS);
    return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
}

export function addDaysToDateStr(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** b − a (일). 둘 다 'YYYY-MM-DD'. */
export function daysBetweenDateStr(a: string, b: string): number {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function hhmmToMin(hhmm: string | undefined | null, fallback = VIRTUAL_DAY_START_MIN): number {
    if (!hhmm) return fallback;
    const [h, m] = hhmm.split(':').map(Number);
    if (!Number.isFinite(h)) return fallback;
    return h * 60 + (Number.isFinite(m) ? m : 0);
}

export function minToHHMM(min: number): string {
    const v = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

// ── 가상 캘린더 ───────────────────────────────────────────────────────────────

function nextPow2(n: number): number {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

/**
 * 포스트시즌 가상 캘린더 최대 일수 — 앵커(정규시즌 종료 다음 날)를 offset 0으로:
 *  - 플레이인: 7v8·9v10 = offset 0, 디사이더 = offset g
 *  - 1라운드 시작 = 플레이인 있으면 2g, 없으면 0
 *  - 시리즈 안 경기: G_n = roundStart + (n−1)·g, 다음 라운드 시작 = roundStart + maxGames·g
 *  - 총 일수 = 결승 마지막 가능 경기 offset + 1
 * g=1·Bo7·플레이인: 30일, g=2: 59일 (컨퍼런스 8팀 기준 4라운드).
 */
export function playoffMaxDays(spec: PlayoffCalendarSpec): number {
    const g = Math.max(1, Math.round(spec.intervalDays));
    const bracketSize = nextPow2(Math.max(2, spec.teamsPerConference * 2));
    const rounds = Math.max(1, Math.round(Math.log2(bracketSize)));
    let roundStart = spec.playInEnabled ? 2 * g : 0;
    let lastGameOffset = 0;
    for (let r = 1; r <= rounds; r++) {
        const tw = r === rounds ? spec.finalsTargetWins : spec.targetWins;
        const maxGames = tw * 2 - 1;
        lastGameOffset = roundStart + (maxGames - 1) * g;
        roundStart = roundStart + maxGames * g;
    }
    return lastGameOffset + 1;
}

/** 시리즈 경기 n(1-based)의 가상 날짜 — roundStartDate + (n−1)·g. */
export function seriesGameVirtualDate(roundStartDate: string, gameNum: number, intervalDays: number): string {
    return addDaysToDateStr(roundStartDate, (gameNum - 1) * Math.max(1, intervalDays));
}

export interface BuildVirtualCalendarInput {
    virtualSeasonYear: number;
    keyDates: AllStarKeyDatesLike;
    playoff: PlayoffCalendarSpec;
    /** 기본값 `${year}-10-21` / `${year+1}-04-13` — finalize.ts의 정규시즌 설정과 동일. */
    regularStart?: string;
    regularEnd?: string;
}

/** 정규시즌 첫날 ~ 포스트시즌 최대 마지막 날까지, 하루도 빠짐없이(휴식일 포함) 나열한다. */
export function buildVirtualCalendar(input: BuildVirtualCalendarInput): VirtualCalendarDay[] {
    const regularStart = input.regularStart ?? `${input.virtualSeasonYear}-${REGULAR_SEASON_START_MMDD}`;
    const regularEnd   = input.regularEnd   ?? `${input.virtualSeasonYear + 1}-${REGULAR_SEASON_END_MMDD}`;
    const kd = input.keyDates;
    const days: VirtualCalendarDay[] = [];
    const regularDays = daysBetweenDateStr(regularStart, regularEnd) + 1;
    for (let i = 0; i < regularDays; i++) {
        const date = addDaysToDateStr(regularStart, i);
        let kind: VirtualDayKind = 'regular';
        if (date >= kd.allStarStart && date <= kd.allStarEnd) {
            if (date === kd.allStarStart)                    kind = 'allstar_announce';
            else if (date === kd.allStarRisingStarsDate)     kind = 'allstar_rising';
            else if (date === kd.allStarThreePointContestDate) kind = 'allstar_contests';
            else if (date === kd.allStarMainGameDate)        kind = 'allstar_main';
            else                                             kind = 'allstar_break';
        }
        days.push({ date, kind });
    }
    const poDays = playoffMaxDays(input.playoff);
    const anchor = addDaysToDateStr(regularEnd, 1);
    for (let i = 0; i < poDays; i++) days.push({ date: addDaysToDateStr(anchor, i), kind: 'playoff' });
    return days;
}

// ── 실현 가능성 ───────────────────────────────────────────────────────────────

export function computeTimelineFeasibility(input: TimelineFeasibilityInput): TimelineFeasibility {
    const reasons: string[] = [];
    const realDays = daysBetweenDateStr(input.realStartDate, input.realEndDate) + 1;
    const D = input.dayLengthMin;
    const V = Math.max(1, input.virtualDayCount);
    if (realDays < 1) reasons.push('종료일이 시작일보다 앞섭니다.');
    if (D < MIN_DAY_LENGTH_MIN || D > MAX_DAY_LENGTH_MIN) reasons.push(`하루 길이는 ${MIN_DAY_LENGTH_MIN}~${MAX_DAY_LENGTH_MIN}분이어야 합니다.`);
    if (input.replayMin != null && D < input.replayMin + DAY_LENGTH_REPLAY_MARGIN_MIN) {
        reasons.push(`하루 길이는 리플레이(${input.replayMin}분) + ${DAY_LENGTH_REPLAY_MARGIN_MIN}분 이상이어야 합니다.`);
    }
    const perDay = Math.max(1, Math.ceil(V / Math.max(1, realDays)));
    const windowMin = perDay * D;
    const windowEndMin = input.windowStartMin + windowMin;
    if (windowEndMin > 1440) reasons.push('일일 시뮬 시간대가 자정을 넘습니다.');

    const available = 1440 - input.windowStartMin;
    const minRealDays = Math.ceil((V * D) / Math.max(1, available));
    const minEndDate = addDaysToDateStr(input.realStartDate, Math.max(0, minRealDays - 1));
    const maxDayLengthMin = Math.floor(available / perDay);
    const latestWindowStartMin = 1440 - windowMin;
    return {
        realDays, perDay, windowMin, windowEndMin,
        feasible: reasons.length === 0,
        reasons,
        suggestions: {
            minEndDate: windowEndMin > 1440 ? minEndDate : null,
            maxDayLengthMin: windowEndMin > 1440 && maxDayLengthMin >= MIN_DAY_LENGTH_MIN ? maxDayLengthMin : null,
            latestWindowStartMin: windowEndMin > 1440 && latestWindowStartMin >= 0 ? latestWindowStartMin : null,
        },
    };
}

// ── 타임라인 생성 ─────────────────────────────────────────────────────────────

export interface BuildTimelineConfig {
    realStartDate: string;   // KST 날짜 — 이 날의 창부터 배치
    dayLengthMin: number;
    windowStartMin: number;
    /** 실제 하루당 가상 일수(k). computeTimelineFeasibility().perDay를 그대로 넘긴다. */
    perDay: number;
    /** 이 시각(ms) 이전에 시작하는 슬롯은 건너뛴다 — 드래프트가 늦게 끝나 첫날 창이 이미
     *  진행 중일 때, 또는 진행 중 리그의 남은 날짜를 "지금부터" 다시 깔 때. 건너뛴 만큼 뒤로
     *  밀리므로 마지막 날이 종료일을 넘길 수 있다(호출부가 경고). */
    notBeforeMs?: number;
    /** 첫 행의 dayIndex(재배치 시 기존 인덱스를 이어가기 위함). 기본 0. */
    firstDayIndex?: number;
}

export function buildLeagueTimeline(calendar: VirtualCalendarDay[], config: BuildTimelineConfig): VirtualDayRow[] {
    const D = config.dayLengthMin;
    const perDay = Math.max(1, config.perDay);
    const baseMidnight = kstDateToMidnightMs(config.realStartDate);
    const rows: VirtualDayRow[] = [];
    let slot = 0;
    // 첫 슬롯을 notBeforeMs 이후로 맞춘다(그 전 슬롯은 통째로 건너뜀).
    if (config.notBeforeMs != null) {
        while (slotStartMs(baseMidnight, slot, perDay, D, config.windowStartMin) < config.notBeforeMs) slot++;
    }
    for (let i = 0; i < calendar.length; i++, slot++) {
        const startMs = slotStartMs(baseMidnight, slot, perDay, D, config.windowStartMin);
        rows.push({
            date: calendar[i].date,
            kind: calendar[i].kind,
            dayIndex: (config.firstDayIndex ?? 0) + i,
            realStartAt:    new Date(startMs).toISOString(),
            realMidnightAt: new Date(startMs + D * 60_000 * (VIRTUAL_MIDNIGHT_OFFSET_MIN / VIRTUAL_DAY_SPAN_MIN)).toISOString(),
            realEndAt:      new Date(startMs + D * 60_000).toISOString(),
        });
    }
    return rows;
}

function slotStartMs(baseMidnight: number, slot: number, perDay: number, D: number, windowStartMin: number): number {
    const realDayIdx = Math.floor(slot / perDay);
    const inDay = slot % perDay;
    return baseMidnight + realDayIdx * 86_400_000 + (windowStartMin + inDay * D) * 60_000;
}

// ── 경기 실제 시각 배정 ───────────────────────────────────────────────────────

export interface TimedGameLike {
    id: string;
    date: string;
    time?: string;
    game_seq?: number;
    scheduledAt?: string;
    seriesId?: string;
}

/** 가상 시각(HH:MM) → 그 가상 하루 안의 실제 오프셋(분). 19:00 이전이면 0, 03:00 이후면 D. */
export function virtualTimeToRealOffsetMin(timeHHMM: string | undefined, dayLengthMin: number): number {
    let t = hhmmToMin(timeHHMM);
    // 자정 이후(00:00~03:00) 표기는 다음 날 새벽으로 해석
    if (t < VIRTUAL_DAY_START_MIN) t += 1440;
    const frac = Math.min(1, Math.max(0, (t - VIRTUAL_DAY_START_MIN) / VIRTUAL_DAY_SPAN_MIN));
    return frac * dayLengthMin;
}

/** 가장 늦은 슬롯(22:30) 경기가 클램프(시작을 앞당김)되는 조합인지 — 22:30은 하루의 7/16 지점이므로
 *  D×(1−7/16) < 리플레이이면 원래 위치에서 시작해선 하루 안에 못 끝난다. 생성 모달/일정 탭 경고용. */
export function lateGameClampsAt(dayLengthMin: number, replayMin: number): boolean {
    const lateOffset = (22.5 * 60 - VIRTUAL_DAY_START_MIN) / VIRTUAL_DAY_SPAN_MIN * dayLengthMin;
    return lateOffset + replayMin > dayLengthMin + 1e-9;
}

/** 경기 시작 실제 시각(ms) — 클램프: 시작 + 리플레이 ≤ real_end_at. */
export function gameRealStartMs(row: VirtualDayRow, timeHHMM: string | undefined, dayLengthMin: number, replayMin: number): number {
    const start = new Date(row.realStartAt).getTime();
    const maxOffset = Math.max(0, dayLengthMin - replayMin);
    const offset = Math.min(maxOffset, virtualTimeToRealOffsetMin(timeHHMM, dayLengthMin));
    return start + offset * 60_000;
}

/** 플레이오프 시리즈 ID → 같은 가상 날짜 안에서 쓰는 가상 시각 슬롯. 매치 인덱스 기반이라
 *  라운드/컨퍼런스가 달라도 결정론적이고, 별도 insert 경로(플레이인 디사이더, 1라운드 TBD
 *  채움, 다음 라운드 생성)가 서로 몰라도 슬롯이 겹치지 않는다. */
export function playoffTimeSlot(seriesId: string | undefined): string {
    if (!seriesId) return '19:00';
    const PI: Record<string, number> = {
        PI_EAST_7v8: 0, PI_WEST_7v8: 1, PI_EAST_9v10: 2, PI_WEST_9v10: 3, PI_EAST_8th: 0, PI_WEST_8th: 1,
    };
    let slot = PI[seriesId];
    if (slot === undefined) {
        const m = seriesId.split('_M')[1];
        slot = m !== undefined ? (parseInt(m, 10) || 0) % 8 : 0;
    }
    return minToHHMM(VIRTUAL_DAY_START_MIN + slot * 30);
}

export function indexTimelineByDate(rows: VirtualDayRow[]): Map<string, VirtualDayRow> {
    return new Map(rows.map(r => [r.date, r]));
}

/**
 * 경기 목록에 scheduledAt을 채운다(순수 함수, 새 배열 반환). 가상 날짜가 타임라인에 없는
 * 경기는 그대로 두고 missing에 모아 돌려준다. game_seq는 실제 시각 순서로 다시 매긴다
 * (renumberFrom 이후부터).
 */
export function assignRealTimes<T extends TimedGameLike>(
    games: T[],
    rows: VirtualDayRow[] | Map<string, VirtualDayRow>,
    dayLengthMin: number,
    replayMin: number,
    opts: { renumberSeq?: boolean; renumberFrom?: number; timeFor?: (g: T) => string | undefined } = {},
): { games: T[]; missing: T[] } {
    const byDate = rows instanceof Map ? rows : indexTimelineByDate(rows);
    const missing: T[] = [];
    const timed: T[] = games.map(g => {
        const row = byDate.get(g.date);
        if (!row) { missing.push(g); return g; }
        const time = opts.timeFor ? opts.timeFor(g) : (g.time ?? (g.seriesId ? playoffTimeSlot(g.seriesId) : undefined));
        const ms = gameRealStartMs(row, time, dayLengthMin, replayMin);
        return { ...g, time: time ?? g.time, scheduledAt: new Date(ms).toISOString() };
    });
    if (opts.renumberSeq) {
        const sorted = [...timed].sort((a, b) =>
            (a.scheduledAt ?? '9').localeCompare(b.scheduledAt ?? '9') || a.id.localeCompare(b.id));
        const seqById = new Map(sorted.map((g, i) => [g.id, (opts.renumberFrom ?? 0) + i]));
        return { games: timed.map(g => ({ ...g, game_seq: seqById.get(g.id) })), missing };
    }
    return { games: timed, missing };
}

// ── "오늘" 판정 ───────────────────────────────────────────────────────────────

/** rows는 realStartAt 오름차순이어야 한다. 지금 시각이 속한(또는 직전) 가상 하루 행. */
export function resolveVirtualDayRow(rows: VirtualDayRow[], nowMs: number): VirtualDayRow | null {
    if (!rows.length) return null;
    // 이진 탐색: realStartAt ≤ now 인 마지막 행
    let lo = 0, hi = rows.length - 1, found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (new Date(rows[mid].realStartAt).getTime() <= nowMs) { found = mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return found >= 0 ? rows[found] : rows[0];
}

/**
 * 현재 가상 날짜 — 시작한 마지막 가상 하루의 날짜, 단 그 하루의 가상 자정을 지났으면 +1일.
 * 시즌 시작 전이면 첫 행의 날짜. SQL current_virtual_date()와 반드시 같은 규칙.
 */
export function resolveVirtualDate(rows: VirtualDayRow[], nowMs: number): string | null {
    if (!rows.length) return null;
    const first = rows[0];
    if (nowMs < new Date(first.realStartAt).getTime()) return first.date;
    const row = resolveVirtualDayRow(rows, nowMs)!;
    return nowMs < new Date(row.realMidnightAt).getTime() ? row.date : addDaysToDateStr(row.date, 1);
}

/** 올스타 서브 이벤트 실제 시각 — scheduler.ts가 now()와 직접 비교하는 leagues.allstar_schedule 형식. */
export function allStarScheduleFromTimeline(rows: VirtualDayRow[]): { announceAt: string; risingStarsAt: string; contestsAt: string; mainGameAt: string } | null {
    const pick = (kind: VirtualDayKind) => rows.find(r => r.kind === kind)?.realStartAt;
    const announceAt = pick('allstar_announce'), risingStarsAt = pick('allstar_rising');
    const contestsAt = pick('allstar_contests'), mainGameAt = pick('allstar_main');
    if (!announceAt || !risingStarsAt || !contestsAt || !mainGameAt) return null;
    return { announceAt, risingStarsAt, contestsAt, mainGameAt };
}

// ── DB row 변환 ───────────────────────────────────────────────────────────────

export interface VirtualDayDbRow {
    league_id: string; room_id: string; virtual_date: string; day_index: number; kind: string;
    real_start_at: string; real_midnight_at: string; real_end_at: string;
}

export function toDbRows(leagueId: string, roomId: string, rows: VirtualDayRow[]): VirtualDayDbRow[] {
    return rows.map(r => ({
        league_id: leagueId, room_id: roomId, virtual_date: r.date, day_index: r.dayIndex, kind: r.kind,
        real_start_at: r.realStartAt, real_midnight_at: r.realMidnightAt, real_end_at: r.realEndAt,
    }));
}

export function fromDbRows(rows: any[]): VirtualDayRow[] {
    const toIso = (v: string) => new Date(v).toISOString();
    return (rows ?? []).map(r => ({
        date: String(r.virtual_date).slice(0, 10),
        kind: r.kind as VirtualDayKind,
        dayIndex: Number(r.day_index),
        realStartAt: toIso(r.real_start_at), realMidnightAt: toIso(r.real_midnight_at), realEndAt: toIso(r.real_end_at),
    })).sort((a, b) => a.realStartAt.localeCompare(b.realStartAt));
}
