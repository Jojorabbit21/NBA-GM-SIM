
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// MultiGamePbpView.tsx의 GameDateStrip에 있던 월간 달력 드롭다운을 공용화 —
// MultiScheduleView.tsx의 날짜 컨트롤 바에서도 똑같은 데이트피커 UI/동작을 써야 한다는
// 피드백(두 화면의 데이트피커가 서로 달라 보인다는 지적)으로 분리. 두 화면 모두 이 컴포넌트
// 하나만 쓰므로 앞으로는 동작이 자동으로 같이 간다.

export interface MonthCalendarPopoverProps {
    /** 화면 좌표(px) — 트리거 버튼의 getBoundingClientRect() 기준으로 호출부에서 계산해 넘긴다. */
    position: { x: number; y: number };
    /** 달력이 보여주는 연/월(선택된 날짜와 별개 — 화살표로 다른 달을 미리보기만 할 수 있음). */
    viewYM: [number, number];
    onViewYMChange: (ym: [number, number]) => void;
    /** 이 안에 있는 날짜만 클릭 가능(경기가 있는 날짜만 선택 가능하도록 하는 용도). */
    selectableDates: Set<string>;
    activeDateKey: string;
    onSelect: (dateKey: string) => void;
}

export const MonthCalendarPopover = React.forwardRef<HTMLDivElement, MonthCalendarPopoverProps>(
    ({ position, viewYM, onViewYMChange, selectableDates, activeDateKey, onSelect }, ref) => {
        const [vy, vm] = viewYM; // vm: 0-indexed
        const firstWeekday = new Date(vy, vm, 1).getDay();
        const daysInMonth = new Date(vy, vm + 1, 0).getDate();
        const cells: (number | null)[] = [
            ...Array.from({ length: firstWeekday }, () => null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];
        while (cells.length % 7 !== 0) cells.push(null);

        return (
            <div
                ref={ref}
                className="fixed z-30 w-72 bg-slate-900 border border-slate-700 shadow-2xl p-3"
                style={{ left: position.x, top: position.y }}
            >
                <div className="flex items-center justify-between mb-2">
                    <button
                        onClick={() => onViewYMChange(vm === 0 ? [vy - 1, 11] : [vy, vm - 1])}
                        className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-bold text-white tabular-nums">{vy}년 {vm + 1}월</span>
                    <button
                        onClick={() => onViewYMChange(vm === 11 ? [vy + 1, 0] : [vy, vm + 1])}
                        className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                    {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                        <div key={d} className="text-xs font-bold text-slate-500 text-center">{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {cells.map((day, i) => {
                        if (day === null) return <div key={i} />;
                        const dk = `${vy}-${String(vm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const hasGame = selectableDates.has(dk);
                        const isActive = dk === activeDateKey;
                        return (
                            <button
                                key={i}
                                disabled={!hasGame}
                                onClick={() => onSelect(dk)}
                                className={`h-8 rounded text-xs font-bold tabular-nums transition-colors ${
                                    isActive
                                        ? 'bg-indigo-600 text-white ring-1 ring-inset ring-indigo-400'
                                        : hasGame
                                            ? 'text-white hover:bg-slate-800 cursor-pointer'
                                            : 'text-slate-700 cursor-not-allowed'
                                }`}
                            >
                                {day}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    },
);
