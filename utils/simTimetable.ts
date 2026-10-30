/**
 * simTimetable.ts — 멀티 리그 시뮬레이션 타임테이블: 현실(KST) 날짜별로 그날 시뮬되는 가상 날짜 구간.
 * 가상 하루 행(VirtualDayRow)을 realStartAt의 KST 날짜로 묶는다(고정 길이 가상 하루 타임라인 기준).
 */
import type { VirtualDayRow } from './leagueTimeline';
import { kstDateStr, kstTimeStr } from './kstTime';

export interface SimTimetableEntry {
    /** 현실 날짜(KST) 'YYYY-MM-DD' */
    realDate: string;
    /** 그날 시뮬 시간대(KST) 'HH:MM' */
    startTime: string;
    endTime: string;
    startMs: number;
    endMs: number;
    /** 그날 시뮬되는 가상 날짜 구간 'YYYY-MM-DD' (양끝 포함) */
    fromDate: string;
    toDate: string;
    dayCount: number;
}

export function buildSimTimetable(timeline: VirtualDayRow[] | null | undefined): SimTimetableEntry[] {
    if (!timeline?.length) return [];
    const out: SimTimetableEntry[] = [];
    for (const row of timeline) {
        const start = new Date(row.realStartAt);
        const end = new Date(row.realEndAt);
        const realDate = kstDateStr(start);
        const last = out[out.length - 1];
        if (last && last.realDate === realDate) {
            last.toDate = row.date;
            last.endMs = end.getTime();
            last.endTime = kstTimeStr(end);
            last.dayCount += 1;
        } else {
            out.push({
                realDate,
                startTime: kstTimeStr(start),
                endTime: kstTimeStr(end),
                startMs: start.getTime(),
                endMs: end.getTime(),
                fromDate: row.date,
                toDate: row.date,
                dayCount: 1,
            });
        }
    }
    return out;
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' → '10.30 (금)' (달력 날짜 그대로, 타임존 무관) */
export function fmtMonthDayWeekday(dateKey: string): string {
    const d = new Date(dateKey + 'T00:00:00Z');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${mm}.${dd} (${WEEKDAY_KO[d.getUTCDay()]})`;
}

/** 가상 날짜 구간 표기 — 연도가 같으면 끝 날짜에서 연도 생략, 하루뿐이면 단일 날짜. */
export function fmtVirtualRange(fromDate: string, toDate: string, withWeekday = true): string {
    const md = (d: string) => withWeekday ? fmtMonthDayWeekday(d) : fmtMonthDayWeekday(d).replace(/ \(.\)$/, '');
    const from = `${fromDate.slice(0, 4)}.${md(fromDate)}`;
    if (fromDate === toDate) return from;
    const sameYear = fromDate.slice(0, 4) === toDate.slice(0, 4);
    return `${from} ~ ${sameYear ? '' : toDate.slice(0, 4) + '.'}${md(toDate)}`;
}
