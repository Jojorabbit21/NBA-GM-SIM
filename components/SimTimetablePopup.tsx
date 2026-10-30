import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Table, TableBody, TableRow, TableCell } from './common/Table';
import { IconButton } from './common/IconButton';
import { buildSimTimetable, fmtMonthDayWeekday } from '../utils/simTimetable';
import { kstDateStr } from '../utils/kstTime';
import type { VirtualDayRow } from '../utils/leagueTimeline';

// 데스크톱 헤더의 시뮬레이션 타임테이블 팝업. 플레이오프 브라켓 시리즈 창(TournamentBracketView SeriesWindow)과 같은
// 껍데기(createPortal + position:fixed + 뷰포트 클램핑, 헤더 바 + 닫기, 공용 Table compact)를 쓰고 클릭 지점에 띄운다.
// 한 줄 = [현실 날짜] [가상 시작] [가상 종료] [시뮬레이션 시각].
const MARGIN = 12;

interface SimTimetablePopupProps {
    timeline: VirtualDayRow[];
    nowMs: number;
    /** 클릭 지점(뷰포트 좌표) */
    anchor: { x: number; y: number };
    onClose: () => void;
}

export const SimTimetablePopup: React.FC<SimTimetablePopupProps> = ({ timeline, nowMs, anchor, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const entries = useMemo(() => buildSimTimetable(timeline), [timeline]);
    const todayKey = kstDateStr(new Date(nowMs));

    // 클릭 지점에서 열고, 실측 크기로 뷰포트 안에 넣는다. 오늘 행이 가운데 오도록 스크롤.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const x = Math.max(MARGIN, Math.min(anchor.x, window.innerWidth - el.offsetWidth - MARGIN));
        const y = Math.max(MARGIN, Math.min(anchor.y, window.innerHeight - el.offsetHeight - MARGIN));
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        const box = scrollRef.current;
        const row = box?.querySelector<HTMLElement>('[data-today-row]');
        if (box && row) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2;
    }, [anchor]);

    // 팝업 바깥 pointerdown → 닫기. 트리거(data-sim-timetable-trigger)는 토글이 처리하므로 제외.
    useEffect(() => {
        const onDown = (e: PointerEvent) => {
            const t = e.target as HTMLElement | null;
            if (!t || ref.current?.contains(t) || t.closest('[data-sim-timetable-trigger]')) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    const fmtVirtual = (d: string) => `${d.slice(0, 4)}.${fmtMonthDayWeekday(d)}`;

    return createPortal(
        <div
            ref={ref}
            role="dialog"
            aria-label="일정"
            className="fixed left-0 top-0 z-popover w-max max-w-[calc(100vw-32px)] bg-slate-900 border border-slate-800 shadow-[0_18px_40px_rgba(0,0,0,.55),0_0_0_1px_rgba(0,0,0,.4)]"
            style={{ transform: `translate3d(${anchor.x}px, ${anchor.y}px, 0)` }}
        >
            <div className="flex items-center gap-3 pl-3 pr-1.5 py-1.5 bg-slate-950 border-b border-slate-800 select-none">
                <span className="flex-1 text-sm font-bold text-slate-400 whitespace-nowrap">일정</span>
                <IconButton label="닫기" size="md" tone="subtle" onClick={onClose}>
                    <X size={16} />
                </IconButton>
            </div>
            <div ref={scrollRef} className="relative max-h-[60vh] overflow-y-auto custom-scrollbar">
                <Table density="compact" fullHeight={false} className="!rounded-none !shadow-none !border-0">
                    <TableBody>
                        {entries.map(e => {
                            const isToday = e.realDate === todayKey;
                            const tone = isToday ? 'text-white font-bold' : e.endMs < nowMs ? 'text-slate-500' : 'text-slate-200';
                            const cls = `text-xs font-semibold tabular-nums whitespace-nowrap ${tone}`;
                            return (
                                <TableRow key={e.realDate} {...(isToday ? { 'data-today-row': '' } : {})} className={isToday ? 'bg-emerald-500/15' : ''}>
                                    <TableCell align="left" className={cls}>{fmtMonthDayWeekday(e.realDate)}</TableCell>
                                    <TableCell align="left" className={cls}>{fmtVirtual(e.fromDate)}</TableCell>
                                    <TableCell align="left" className={cls}>{fmtVirtual(e.toDate)}</TableCell>
                                    <TableCell align="left" className={cls}>{e.startTime}~{e.endTime}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>,
        document.body,
    );
};
