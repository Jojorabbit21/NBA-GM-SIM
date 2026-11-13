/**
 * 시즌 달력(정규시즌 시작·종료 + 올스타 브레이크) — 일정 생성기 v2와 함께 리그별로 저장되는 단일 소스.
 *
 * [2026-10-23] docs/plan/schedule-generator-v2.md §3·§4. 실측(docs/research/nba-schedule-patterns.md)으로
 * 검증된 요일 규칙:
 *   - 개막 = 10월 18일 이후 첫 화요일 (최근 5시즌 일치)
 *   - 정규시즌 종료 = 개막 + 173일(일요일, 174일 시즌) (최근 5시즌 일치)
 *   - 올스타 본경기 = 2월 14일 이후 첫 일요일 (10시즌 일치)
 * 브레이크 6일 = 목(참가자 발표) · 금(라이징스타) · 토(3점/덩크) · 일(본경기) · 월 · 화 → 수요일 재개.
 * 올스타 서브 이벤트 날짜는 전부 allStarStart 기준 상대값(+1/+2/+3, 종료 +5)이라 allStarStart만 저장하면 된다
 * (getAllStarKeyDates가 파생).
 *
 * 리그 생성 시(finalize) buildSeasonCalendar() 결과를 leagues.season_calendar에 저장한다. 저장값이 없는
 * 리그(이 변경 전에 만든 리그)는 legacySeasonCalendar() — 기존 고정값(10/21~4/13, 올스타 2/13~18) —
 * 그대로라 진행 중 리그의 날짜는 바뀌지 않는다. 연도만으로는 구/신 규칙을 구분할 수 없으므로
 * (가상 시즌 연도가 같다) 반드시 저장값을 넘겨서 resolveSeasonCalendar()로 풀 것.
 *
 * utils/seasonCalendar.ts와 미러 — 로직을 바꿀 땐 양쪽 다 같이 고칠 것.
 */

export interface SeasonCalendar {
    version: number;
    /** 정규시즌 첫날(개막일) 'YYYY-MM-DD' */
    regularStart: string;
    /** 정규시즌 마지막 날 'YYYY-MM-DD' */
    regularEnd: string;
    /** 올스타 브레이크 첫날(참가자 발표일) — 이 날부터 allStarEnd까지 정규시즌 경기 없음 */
    allStarStart: string;
    /** 올스타 브레이크 마지막 날 */
    allStarEnd: string;
    /** [2026-10-26] 포스트시즌 휴식일 수 — 정규시즌 최종일 → 포스트시즌 첫 경기, 플레이인 디사이더 → 본선 1라운드
     *  사이에 각각 넣는 경기 없는 날. 0 = 기존 규칙(최종일 다음 날 바로 포스트시즌, 디사이더 다음 경기 간격에 1라운드).
     *  저장값에 없으면(v3 이전 달력) 0 — 그 리그 타임라인은 옛 규칙 일수로 이미 깔려 있다. leagueTimeline.postseasonDayOffsets 참고. */
    postseasonRestDays: number;
    /** [2026-11-13] 올스타 키데이트 오프셋(세션 설정 "올스타" 탭). resolveSeasonCalendar는 저장값이 있을 때만 채운다 —
     *  없으면 getAllStarKeyDates가 DEFAULT_ALL_STAR_OFFSETS(기존 고정 규칙)를 쓴다. */
    allStarOffsets?: AllStarOffsets;
    /** [2026-11-13] false = 올스타를 끈 채 일정을 만든 시즌 — 브레이크 날짜에도 정규시즌 경기가 있다(finalize가 기록).
     *  없으면 브레이크 있음. */
    allStarBreak?: boolean;
}

/** [2026-11-13] 올스타 키데이트 — 브레이크 첫날(allStarStart, 참가자 발표일) 기준 가상 일수 오프셋.
 *  투표 2개는 정규시즌 안(음수), 행사 3개는 브레이크 안(1 이상, allStarEnd 전날까지)의 서로 다른 날.
 *  update_league_allstar_settings RPC가 검증 후 leagues.season_calendar.allStarOffsets에 저장한다. */
export interface AllStarOffsets {
    /** 팬 투표 시작일 */
    voteStart: number;
    /** 팬 투표 마감일 = 올스타 명단 발표일 */
    voteEnd: number;
    /** 라이징스타 챌린지 */
    rising: number;
    /** 3점·덩크 컨테스트(같은 날) */
    contests: number;
    /** 올스타 본경기 */
    main: number;
}

/** 기존 고정 규칙 — 투표 마감 = 브레이크 7일 전, 투표 기간 28일, 라이징스타 +1 · 컨테스트 +2 · 본경기 +3. */
export const DEFAULT_ALL_STAR_OFFSETS: AllStarOffsets = { voteStart: -35, voteEnd: -7, rising: 1, contests: 2, main: 3 };

const ALL_STAR_OFFSET_KEYS = ['voteStart', 'voteEnd', 'rising', 'contests', 'main'] as const;

/** 저장값(검증 전) → 다섯 값이 모두 정수면 그 값, 아니면 undefined. */
export function parseAllStarOffsets(v: unknown): AllStarOffsets | undefined {
    if (!v || typeof v !== 'object') return undefined;
    const o = v as Record<string, unknown>;
    if (!ALL_STAR_OFFSET_KEYS.every(k => Number.isInteger(o[k]))) return undefined;
    return { voteStart: o.voteStart as number, voteEnd: o.voteEnd as number, rising: o.rising as number, contests: o.contests as number, main: o.main as number };
}

/** v3(2026-10-26): postseasonRestDays 추가. */
export const SEASON_CALENDAR_VERSION = 3;

/** [2026-10-26] 새 리그의 포스트시즌 휴식일 — 최종일과 플레이인 사이, 플레이인과 플레이오프 사이에 하루씩.
 *  같은 팀 백투백에서 앞 경기 리플레이(연장 포함)가 끝나기 전에 다음 경기가 시작되는 것을 막는다(docs/plan/overtime-system.md). */
export const POSTSEASON_REST_DAYS = 1;

function fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return fmt(d);
}

/** year-month-day 이후(당일 포함) 첫 번째 dayOfWeek(0=일 … 6=토) */
function firstWeekdayOnOrAfter(year: number, month: number, day: number, dayOfWeek: number): string {
    const d = new Date(year, month - 1, day, 12);
    d.setDate(d.getDate() + ((dayOfWeek - d.getDay() + 7) % 7));
    return fmt(d);
}

/** 새 리그용 달력 — 요일 규칙(파일 상단 주석). virtualSeasonYear = 개막 연도. */
export function buildSeasonCalendar(virtualSeasonYear: number): SeasonCalendar {
    const regularStart = firstWeekdayOnOrAfter(virtualSeasonYear, 10, 18, 2);
    const regularEnd = addDays(regularStart, 173);
    const mainGame = firstWeekdayOnOrAfter(virtualSeasonYear + 1, 2, 14, 0);
    const allStarStart = addDays(mainGame, -3);
    return {
        version: SEASON_CALENDAR_VERSION, regularStart, regularEnd, allStarStart, allStarEnd: addDays(allStarStart, 5),
        postseasonRestDays: POSTSEASON_REST_DAYS,
    };
}

/** 저장값이 없는 리그(2026-10-23 이전 생성)의 기존 고정 달력. */
export function legacySeasonCalendar(virtualSeasonYear: number): SeasonCalendar {
    return {
        version: 1,
        regularStart: `${virtualSeasonYear}-10-21`,
        regularEnd: `${virtualSeasonYear + 1}-04-13`,
        allStarStart: `${virtualSeasonYear + 1}-02-13`,
        allStarEnd: `${virtualSeasonYear + 1}-02-18`,
        postseasonRestDays: 0,
    };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** leagues.season_calendar(jsonb, 검증 전 unknown) → 유효하면 그 값, 아니면 legacy. */
export function resolveSeasonCalendar(virtualSeasonYear: number, stored?: unknown): SeasonCalendar {
    const s = stored as Partial<SeasonCalendar> | null | undefined;
    // [2026-11-13] 올스타 설정은 날짜 유효성과 무관하게 넘긴다 — season_calendar가 없던 리그(legacy 달력)도
    // RPC가 {allStarOffsets}만 담아 저장하므로.
    const offsets = parseAllStarOffsets(s?.allStarOffsets);
    const allStarExtras: Pick<SeasonCalendar, 'allStarOffsets' | 'allStarBreak'> = {
        ...(offsets ? { allStarOffsets: offsets } : {}),
        ...(s?.allStarBreak === false ? { allStarBreak: false } : {}),
    };
    if (s && typeof s === 'object'
        && [s.regularStart, s.regularEnd, s.allStarStart, s.allStarEnd].every(v => typeof v === 'string' && DATE_RE.test(v))) {
        return {
            version: typeof s.version === 'number' ? s.version : SEASON_CALENDAR_VERSION,
            regularStart: s.regularStart!, regularEnd: s.regularEnd!, allStarStart: s.allStarStart!, allStarEnd: s.allStarEnd!,
            postseasonRestDays: typeof s.postseasonRestDays === 'number' && s.postseasonRestDays >= 0 ? Math.round(s.postseasonRestDays) : 0,
            ...allStarExtras,
        };
    }
    return { ...legacySeasonCalendar(virtualSeasonYear), ...allStarExtras };
}
