import React, { useEffect, useMemo, useRef } from 'react';
import { buildSimTimetable, fmtMonthDayWeekday, fmtVirtualRange } from '../utils/simTimetable';
import { kstDateStr } from '../utils/kstTime';
import type { VirtualDayRow } from '../utils/leagueTimeline';

// 시뮬레이션 타임테이블 목록 — 헤더 호버 툴팁(데스크톱)과 바텀 시트(폰)가 공용으로 쓴다.
// 행 = 현실 날짜(KST) · 시뮬 시간대 → 그날 시뮬되는 가상 날짜 구간. 오늘 행을 강조하고 열릴 때 그 행으로 스크롤한다.
interface SimTimetableListProps {
    timeline: VirtualDayRow[];
    nowMs: number;
    maxHeightClass?: string;
}

export const SimTimetableList: React.FC<SimTimetableListProps> = ({ timeline, nowMs, maxHeightClass = 'max-h-80' }) => {
    const entries = useMemo(() => buildSimTimetable(timeline), [timeline]);
    const todayKey = kstDateStr(new Date(nowMs));
    // 오늘 행(없으면 오늘 이후 첫 행)을 강조 기준으로 삼는다
    const focusIdx = useMemo(() => {
        const i = entries.findIndex(e => e.realDate >= todayKey);
        return i < 0 ? entries.length - 1 : i;
    }, [entries, todayKey]);
    const boxRef = useRef<HTMLDivElement>(null);
    const focusRef = useRef<HTMLLIElement>(null);

    useEffect(() => {
        const box = boxRef.current, row = focusRef.current;
        if (!box || !row) return;
        box.scrollTop = row.offsetTop - (box.clientHeight - row.clientHeight) / 2;
    }, []);

    return (
        <div ref={boxRef} className={`relative ${maxHeightClass} overflow-y-auto custom-scrollbar`}>
            <ul className="m-0 p-0 list-none">
                {entries.map((e, i) => {
                    const isToday = e.realDate === todayKey;
                    const isPast = e.endMs < nowMs;
                    return (
                        <li
                            key={e.realDate}
                            ref={i === focusIdx ? focusRef : undefined}
                            className={`flex items-baseline gap-3 px-3 py-1.5 border-b border-slate-800 last:border-b-0 ${isToday ? 'bg-emerald-500/15' : ''}`}
                        >
                            <div className="w-24 shrink-0">
                                <div className={`text-sm tabular-nums ${isToday ? 'font-bold text-white' : isPast ? 'text-slate-500' : 'text-slate-300'}`}>
                                    {fmtMonthDayWeekday(e.realDate)}
                                </div>
                                <div className="text-xs tabular-nums text-slate-500">{e.startTime}~{e.endTime}</div>
                            </div>
                            <div className={`text-sm tabular-nums min-w-0 ${isToday ? 'font-semibold text-white' : isPast ? 'text-slate-500' : 'text-slate-300'}`}>
                                {fmtVirtualRange(e.fromDate, e.toDate, false)}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};
