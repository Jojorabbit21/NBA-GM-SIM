import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { GameTactics } from '../../../types';
import {
    parseSchedule, serializeSchedule, TACTIC_SCHEDULE_MINUTES,
    type ScheduleSet, type TacticSetId,
} from '../../../services/game/engine/pbp/tacticSchedule';
import { getSetLabel, isClutchOn, withClutchEnabled } from '../../../utils/tacticSetEdit';
import { IconButton } from '../../common/IconButton';
import { useIsPhone } from '../../../hooks/useViewportClass';

// [2026-10-23] 팀 전술 — 전술 로테이션 차트. 표 구조·글자 크기는 뎁스차트·로테이션 탭(DepthRotationBoard)과 동일.
// - 1번/2번 행만 로테이션 행: 48칸 드래그로 칠하고, 이미 그 세트인 칸에서 시작하면 지운다(미지정 '0').
// - 두 행은 독립이지만 같은 분을 동시에 가질 수 없다 — 드래그 중 상대 행이 가진 칸은 빨간색으로 표시하고 적용하지 않는다.
// - 미지정 분은 엔진에서 1번 전술로 진행(tacticSchedule.scheduledSetAt) — 안내는 팀 전술 세트 선택 바 우측 상시 문구.
// - 클러치 행은 같은 표에 붙어 있지만 로테이션 행이 아님 — 체크박스로 켜고 끄며, 발동 시간은 자동 표기(엔진 isClutch).

interface TacticSetTimelineProps {
    tactics: GameTactics;
    onUpdateTactics: (t: GameTactics) => void;
    /** 지금 슬라이더 패널에서 편집 중인 세트(행 강조용) */
    selectedSet: TacticSetId;
}

type PaintRow = '1' | '2';

interface PaintDrag {
    row: PaintRow;
    startMin: number;
    currentMin: number;
    /** row = 칠하기, '0' = 지우기 */
    target: PaintRow | '0';
}

const ROW_SET: Record<PaintRow, 'main' | 'alt'> = { '1': 'main', '2': 'alt' };
const OTHER: Record<PaintRow, PaintRow> = { '1': '2', '2': '1' };
const BLOCK_STYLE: Record<PaintRow, string> = {
    '1': 'bg-indigo-500/40 border border-indigo-400/60',
    '2': 'bg-amber-500/35 border border-amber-400/60',
};
const MINUTES_STYLE: Record<PaintRow, string> = { '1': 'text-indigo-300', '2': 'text-amber-300' };

const pct = (m: number) => `${m / TACTIC_SCHEDULE_MINUTES * 100}%`;

function segmentsOf(sets: ScheduleSet[], row: PaintRow): { start: number; end: number }[] {
    const out: { start: number; end: number }[] = [];
    let i = 0;
    while (i < TACTIC_SCHEDULE_MINUTES) {
        if (sets[i] !== row) { i++; continue; }
        const start = i;
        while (i < TACTIC_SCHEDULE_MINUTES && sets[i] === row) i++;
        out.push({ start, end: i - 1 });
    }
    return out;
}

/** 드래그 결과 적용 — 상대 행이 가진 칸은 건너뛴다 */
function applyDrag(sets: ScheduleSet[], d: PaintDrag): ScheduleSet[] {
    const next = [...sets];
    const lo = Math.min(d.startMin, d.currentMin);
    const hi = Math.max(d.startMin, d.currentMin);
    for (let m = lo; m <= hi; m++) {
        if (d.target === '0') { if (next[m] === d.row) next[m] = '0'; }
        else if (next[m] !== OTHER[d.row]) next[m] = d.row;
    }
    return next;
}

const SH = 'bg-slate-950';   // 헤더 배경(DepthRotationBoard와 동일)
const SK = 'bg-slate-900';   // 고정 셀 배경

export const TacticSetTimeline: React.FC<TacticSetTimelineProps> = ({ tactics, onUpdateTactics, selectedSet }) => {
    const sets = useMemo(() => parseSchedule(tactics.sliderSchedule), [tactics.sliderSchedule]);
    const minutesOf = (row: PaintRow) => sets.filter(s => s === row).length;

    const [drag, setDrag] = useState<PaintDrag | null>(null);
    const tacticsRef = useRef(tactics);
    tacticsRef.current = tactics;
    const onUpdateRef = useRef(onUpdateTactics);
    onUpdateRef.current = onUpdateTactics;

    const commitSets = useCallback((next: ScheduleSet[]) => {
        const t = tacticsRef.current;
        const schedule = serializeSchedule(next);
        const { sliderSchedule: _prev, ...rest } = t;
        const updated: GameTactics = schedule ? { ...rest, sliderSchedule: schedule } : rest;
        // 2번 구간을 처음 칠할 때 2번 전술이 없으면 1번 값으로 시작
        if (next.includes('2') && !updated.altSliders) updated.altSliders = { ...t.sliders };
        onUpdateRef.current(updated);
    }, []);

    const minuteAt = useCallback((el: HTMLElement, clientX: number) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) return 0;
        return Math.max(0, Math.min(TACTIC_SCHEDULE_MINUTES - 1, Math.floor((clientX - rect.left) / rect.width * TACTIC_SCHEDULE_MINUTES)));
    }, []);

    // 전역 mouseup — 드래그 구간 확정
    useEffect(() => {
        if (!drag) return;
        const handleUp = () => {
            commitSets(applyDrag(parseSchedule(tacticsRef.current.sliderSchedule), drag));
            setDrag(null);
        };
        window.addEventListener('mouseup', handleUp);
        return () => window.removeEventListener('mouseup', handleUp);
    }, [drag, commitSets]);

    const handleResetRow = (row: PaintRow) => {
        commitSets(sets.map(s => (s === row ? '0' : s)));
    };

    const renderPaintRow = (row: PaintRow) => {
        const setId = ROW_SET[row];
        const isSelected = selectedSet === setId;
        const isDraggingRow = drag?.row === row;
        const mins = minutesOf(row);
        // 드래그 미리보기 — 칠하기 중 상대 행이 가진 칸은 빨간색(적용 안 됨)
        const preview: { m: number; blocked: boolean }[] = [];
        if (isDraggingRow && drag) {
            const lo = Math.min(drag.startMin, drag.currentMin);
            const hi = Math.max(drag.startMin, drag.currentMin);
            for (let m = lo; m <= hi; m++) preview.push({ m, blocked: drag.target !== '0' && sets[m] === OTHER[row] });
        }
        return (
            <tr className="group h-9 hover:bg-white/[0.03]">
                {/* 시간이 배정된 전술 = 초록 이름 + 옅은 초록 틴트. sticky 셀이라 배경은 불투명 유지하고 틴트는 inset 그림자로 덧칠 */}
                <td className={`sticky left-0 z-30 ${SK} border-r border-b border-slate-800 px-3 ${isSelected ? '!bg-slate-800' : ''} ${
                    mins > 0 ? (isSelected ? 'shadow-[inset_0_0_0_999px_rgba(16,185,129,0.18)]' : 'shadow-[inset_0_0_0_999px_rgba(16,185,129,0.10)]') : ''
                }`}>
                    <span className={`text-sm font-bold truncate block ${mins > 0 ? (isSelected ? 'text-emerald-300' : 'text-emerald-400') : isSelected ? 'text-white' : 'text-slate-400'}`}>
                        {getSetLabel(tactics, setId)}
                    </span>
                </td>
                <td className="border-r border-b border-slate-800 p-0 h-9">
                    <div
                        className="relative w-full h-full select-none cursor-crosshair"
                        onMouseDown={e => {
                            e.preventDefault();
                            const m = minuteAt(e.currentTarget, e.clientX);
                            setDrag({ row, startMin: m, currentMin: m, target: sets[m] === row ? '0' : row });
                        }}
                        onMouseMove={e => {
                            if (!isDraggingRow) return;
                            const m = minuteAt(e.currentTarget, e.clientX);
                            setDrag(prev => (prev && prev.currentMin !== m ? { ...prev, currentMin: m } : prev));
                        }}
                    >
                        <div className="absolute inset-0 bg-slate-900/60 pointer-events-none" />
                        {[12, 24, 36].map(m => (
                            <div key={m} className="absolute top-0 bottom-0 w-px bg-slate-800 pointer-events-none" style={{ left: pct(m) }} />
                        ))}
                        {segmentsOf(sets, row).map(seg => (
                            <div
                                key={seg.start}
                                className={`absolute top-1.5 bottom-1.5 pointer-events-none ${BLOCK_STYLE[row]}`}
                                style={{ left: pct(seg.start), width: pct(seg.end - seg.start + 1) }}
                            />
                        ))}
                        {preview.map(({ m, blocked }) => (
                            <div
                                key={m}
                                className={`absolute top-0.5 bottom-0.5 pointer-events-none ${blocked ? 'bg-red-500/45 border-y border-red-400/70' : 'bg-white/15 border-y border-white/25'}`}
                                style={{ left: pct(m), width: pct(1) }}
                            />
                        ))}
                    </div>
                </td>
                <td className={`border-r border-b border-slate-800 ${SK} text-center align-middle`}>
                    <span className={`text-sm font-semibold ${mins > 0 ? MINUTES_STYLE[row] : 'text-slate-600'}`}>{mins}</span>
                </td>
                <td className={`border-b border-slate-800 ${SK} text-center align-middle`}>
                    {mins > 0 && (
                        <IconButton
                            label={`${getSetLabel(tactics, setId)} 시간 초기화`}
                            tone="inherit"
                            size="xs"
                            onClick={() => handleResetRow(row)}
                            className="mx-auto text-slate-400 hover:!text-red-400"
                        >
                            <RotateCcw size={12} />
                        </IconButton>
                    )}
                </td>
            </tr>
        );
    };

    const clutchOn = isClutchOn(tactics);
    const clutchSelected = selectedSet === 'clutch';

    // [2026-10-28] 폰(<768) — docs/ui/mobile-design-system.md §9-1-11 X4: 가로 스크롤 표 대신 로테이션 탭과 같은 쿼터 탭 틀.
    // 상태(sets·drag)·commitSets·applyDrag는 위 그대로 공유, 칠하기는 포인터 이벤트(터치), 커밋은 pointerup에서.
    const isPhone = useIsPhone();
    if (isPhone) {
        return (
            <PhoneTacticSetTimeline
                tactics={tactics}
                sets={sets}
                drag={drag}
                selectedSet={selectedSet}
                clutchOn={clutchOn}
                onDragStart={(row, m) => setDrag({ row, startMin: m, currentMin: m, target: sets[m] === row ? '0' : row })}
                onDragMove={m => setDrag(prev => (prev && prev.currentMin !== m ? { ...prev, currentMin: m } : prev))}
                onDragEnd={d => { commitSets(applyDrag(parseSchedule(tacticsRef.current.sliderSchedule), d)); setDrag(null); }}
                onClutchToggle={on => onUpdateTactics(withClutchEnabled(tactics, on))}
            />
        );
    }

    return (
        <div className="flex-shrink-0 border-b border-slate-600">
            <div className="overflow-x-auto">
                <table className="border-separate border-spacing-0 w-full" style={{ minWidth: '960px', tableLayout: 'fixed' }}>
                    <colgroup>
                        <col style={{ width: 200 }} />
                        <col />
                        <col style={{ width: 40 }} />
                        <col style={{ width: 54 }} />
                    </colgroup>
                    <thead className={SH}>
                        <tr className="text-sm font-bold text-slate-400">
                            <th rowSpan={2} className={`sticky left-0 z-40 ${SH} border-r border-b border-slate-800 py-3 text-left px-3`}>전술</th>
                            <th className={`${SH} border-r border-b border-slate-800 py-3 px-0`}>
                                <div className="flex text-sm font-black">
                                    {['1쿼터', '2쿼터', '3쿼터', '4쿼터'].map(q => (
                                        <div key={q} className="flex-1 flex items-center justify-center text-slate-400">{q}</div>
                                    ))}
                                </div>
                            </th>
                            <th rowSpan={2} className={`${SH} border-r border-b border-slate-800 py-3 text-center`}>시간</th>
                            <th rowSpan={2} className={`${SH} border-b border-slate-800 py-3 text-center`}>초기화</th>
                        </tr>
                        {/* 분 눈금(2분 간격) — 드래그로 칠할 때 위치 기준 */}
                        <tr>
                            <th className={`${SH} border-r border-b border-slate-800 p-0`}>
                                <div className="relative h-6">
                                    {Array.from({ length: 24 }, (_, i) => (i + 1) * 2).map(m => (
                                        <span
                                            key={m}
                                            className={`absolute bottom-1 text-sm select-none ${m === 48 ? 'right-1' : '-translate-x-1/2'} ${m % 12 === 0 ? 'text-slate-400 font-semibold' : 'text-slate-600 font-normal'}`}
                                            style={m < 48 ? { left: pct(m) } : undefined}
                                        >
                                            {m}
                                        </span>
                                    ))}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {renderPaintRow('1')}
                        {renderPaintRow('2')}
                        {/* 클러치 — 로테이션 행 아님(같은 표에 붙어만 있음). 체크박스로 켜고 끄며 발동 시간은 자동 표기 */}
                        <tr className="h-9">
                            <td className={`sticky left-0 z-30 ${SK} border-r border-t-2 border-slate-800 px-3 ${clutchSelected ? '!bg-slate-800' : ''}`}>
                                <label className="flex items-center gap-2 cursor-pointer min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={clutchOn}
                                        onChange={e => onUpdateTactics(withClutchEnabled(tactics, e.target.checked))}
                                        className="w-4 h-4 rounded accent-indigo-500 cursor-pointer shrink-0"
                                    />
                                    <span className={`text-sm font-bold truncate ${clutchSelected ? 'text-white' : clutchOn ? 'text-slate-300' : 'text-slate-500'}`}>
                                        {getSetLabel(tactics, 'clutch')}
                                    </span>
                                </label>
                            </td>
                            <td colSpan={3} className={`${SK} border-t-2 border-slate-800 px-3`}>
                                <span className={`text-sm font-semibold ${clutchOn ? 'text-rose-300' : 'text-slate-500'}`}>
                                    4쿼터 5:00 ~ 0:00 · 점수 차 10점 이내일 때 자동 발동 (일반 전술보다 우선 적용)
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ── 폰 전술 로테이션 차트 ──────────────────────────────────────────────────────
const QUARTER_LABELS = ['1쿼터', '2쿼터', '3쿼터', '4쿼터'];
const NAME_COL_W = 160;
const ROW_COLOR: Record<PaintRow, { seg: string; strip: string; mins: string }> = {
    '1': { seg: 'bg-indigo-500/40 border border-indigo-400/60', strip: 'bg-indigo-400/80', mins: 'text-indigo-300' },
    '2': { seg: 'bg-amber-500/35 border border-amber-400/60', strip: 'bg-amber-400/80', mins: 'text-amber-300' },
};

const PhoneTacticSetTimeline: React.FC<{
    tactics: GameTactics;
    sets: ScheduleSet[];
    drag: PaintDrag | null;
    selectedSet: TacticSetId;
    clutchOn: boolean;
    onDragStart: (row: PaintRow, minute: number) => void;
    onDragMove: (minute: number) => void;
    onDragEnd: (d: PaintDrag) => void;
    onClutchToggle: (on: boolean) => void;
}> = ({ tactics, sets, drag, selectedSet, clutchOn, onDragStart, onDragMove, onDragEnd, onClutchToggle }) => {
    const [quarter, setQuarter] = useState(0);
    const clutchSelected = selectedSet === 'clutch';
    return (
        <div className="flex-shrink-0 border-b border-slate-700">
            <div role="tablist" aria-label="쿼터" className="h-10 grid grid-cols-4 bg-slate-950 border-b border-slate-800">
                {QUARTER_LABELS.map((label, q) => (
                    <button key={label} type="button" role="tab" aria-selected={quarter === q} onClick={() => setQuarter(q)}
                        className={`h-full text-xs font-black tracking-tight border-b-2 ${quarter === q ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent'}`}>
                        {label}
                    </button>
                ))}
            </div>
            {/* 머리 — 전술 | 분 | 1~12 (로테이션 탭과 같은 열 구조) */}
            <div className="flex h-7 bg-slate-950 border-b border-slate-800">
                <div className="shrink-0 flex items-center pl-3 pr-2 border-r border-slate-800 text-xs font-bold text-slate-400" style={{ width: NAME_COL_W }}>
                    전술<span className="ml-auto self-stretch w-9 flex items-center justify-center border-l border-slate-800 text-[11px] font-normal text-slate-500">분</span>
                </div>
                <div className="flex flex-1 min-w-0">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <span key={m} className={`flex-1 text-center text-[10px] leading-7 select-none ${m % 6 === 0 ? 'text-slate-400 font-semibold' : 'text-slate-600'}`}>{m}</span>
                    ))}
                </div>
            </div>
            {(['1', '2'] as PaintRow[]).map(row => {
                const setId = ROW_SET[row];
                const isSelected = selectedSet === setId;
                const mins = sets.filter(s => s === row).length;
                return (
                    <div key={row} className={`flex ${isSelected ? 'bg-slate-800' : 'bg-slate-900'}`}>
                        <div className="shrink-0 h-11 flex items-center pl-3 pr-2 border-b border-r border-slate-800" style={{ width: NAME_COL_W }}>
                            <span className={`flex-1 min-w-0 text-[13px] font-bold truncate ${mins > 0 ? (isSelected ? 'text-emerald-300' : 'text-emerald-400') : isSelected ? 'text-white' : 'text-slate-400'}`}>
                                {getSetLabel(tactics, setId)}
                            </span>
                            <span className={`self-stretch w-9 shrink-0 flex items-center justify-center border-l border-slate-800 text-xs font-bold tabular-nums ${mins > 0 ? ROW_COLOR[row].mins : 'text-slate-600'}`}>{mins}</span>
                        </div>
                        <PhoneQuarterPaintRow row={row} sets={sets} drag={drag} quarter={quarter} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} />
                    </div>
                );
            })}
            {/* 클러치 — 로테이션 행 아님. 체크박스로 켜고 끄며 발동 시간은 자동 */}
            <div className={`flex border-t border-slate-700 ${clutchSelected ? 'bg-slate-800' : 'bg-slate-900'}`}>
                <label className="shrink-0 h-11 flex items-center gap-2 pl-3 pr-2 border-b border-r border-slate-800 cursor-pointer min-w-0" style={{ width: NAME_COL_W }}>
                    <input type="checkbox" checked={clutchOn} onChange={e => onClutchToggle(e.target.checked)} className="w-4 h-4 rounded accent-indigo-500 shrink-0" />
                    <span className={`text-[13px] font-bold truncate ${clutchSelected ? 'text-white' : clutchOn ? 'text-slate-300' : 'text-slate-500'}`}>{getSetLabel(tactics, 'clutch')}</span>
                </label>
                <div className="flex-1 min-w-0 h-11 flex items-center px-3 border-b border-slate-800">
                    <span className={`text-[11px] leading-[14px] font-semibold ${clutchOn ? 'text-rose-300' : 'text-slate-500'}`}>4Q 5:00~0:00 · 10점 이내 자동 발동(일반보다 우선)</span>
                </div>
            </div>
        </div>
    );
};

/** 폰 칠하기 행 — 선택한 쿼터의 12분만 전폭. 분 인덱스는 절대값(quarter*12 + 칸). 상대 행이 가진 칸은 드래그 중 빨강(적용 안 됨). */
const PhoneQuarterPaintRow: React.FC<{
    row: PaintRow;
    sets: ScheduleSet[];
    drag: PaintDrag | null;
    quarter: number;
    onDragStart: (row: PaintRow, minute: number) => void;
    onDragMove: (minute: number) => void;
    onDragEnd: (d: PaintDrag) => void;
}> = ({ row, sets, drag, quarter, onDragStart, onDragMove, onDragEnd }) => {
    const ref = useRef<HTMLDivElement>(null);
    const dragRef = useRef(drag);
    dragRef.current = drag;
    const activePointer = useRef<number | null>(null);
    const q0 = quarter * 12;
    const q1 = q0 + 11;
    const minuteAtX = (clientX: number) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return q0;
        return q0 + Math.max(0, Math.min(11, Math.floor((clientX - rect.left) / rect.width * 12)));
    };
    const finish = (e: React.PointerEvent) => {
        if (activePointer.current !== e.pointerId) return;
        activePointer.current = null;
        const d = dragRef.current;
        if (d && d.row === row) onDragEnd(d);
    };
    const clip = (start: number, end: number) => {
        const a = Math.max(start, q0);
        const b = Math.min(end, q1);
        if (a > b) return null;
        return { left: `${(a - q0) / 12 * 100}%`, width: `${(b - a + 1) / 12 * 100}%` };
    };
    const isDraggingRow = drag?.row === row;
    const preview: { m: number; blocked: boolean }[] = [];
    if (isDraggingRow && drag) {
        const lo = Math.max(q0, Math.min(drag.startMin, drag.currentMin));
        const hi = Math.min(q1, Math.max(drag.startMin, drag.currentMin));
        for (let m = lo; m <= hi; m++) preview.push({ m, blocked: drag.target !== '0' && sets[m] === OTHER[row] });
    }
    return (
        <div
            ref={ref}
            className="relative flex-1 min-w-0 h-11 border-b border-slate-800 select-none touch-none bg-slate-900/60"
            onPointerDown={e => {
                e.preventDefault();
                activePointer.current = e.pointerId;
                e.currentTarget.setPointerCapture(e.pointerId);
                onDragStart(row, minuteAtX(e.clientX));
            }}
            onPointerMove={e => { if (activePointer.current === e.pointerId) onDragMove(minuteAtX(e.clientX)); }}
            onPointerUp={finish}
            onPointerCancel={finish}
        >
            {Array.from({ length: 11 }, (_, i) => i + 1).map(m => (
                <div key={m} className={`absolute top-0 bottom-1.5 w-px pointer-events-none ${m === 6 ? 'bg-slate-700' : 'bg-slate-800'}`} style={{ left: `${m / 12 * 100}%` }} />
            ))}
            {segmentsOf(sets, row).map(seg => {
                const pos = clip(seg.start, seg.end);
                return pos && <div key={seg.start} className={`absolute top-1.5 bottom-[10px] pointer-events-none ${ROW_COLOR[row].seg}`} style={pos} />;
            })}
            {preview.map(({ m, blocked }) => (
                <div key={m} className={`absolute top-1 bottom-[8px] pointer-events-none ${blocked ? 'bg-red-500/45 border-y border-red-400/70' : 'bg-white/15 border-y border-white/25'}`} style={{ left: `${(m - q0) / 12 * 100}%`, width: `${100 / 12}%` }} />
            ))}
            {/* 48분 요약 띠 + 현재 쿼터 테두리 */}
            <div className="absolute left-0 right-0 bottom-0.5 h-1 flex pointer-events-none">
                {sets.map((s, m) => (
                    <span key={m} className={`flex-1 ${s === row ? ROW_COLOR[row].strip : 'bg-slate-800'} ${m % 12 === 0 && m > 0 ? 'border-l border-slate-950' : ''}`} />
                ))}
                <span className="absolute top-[-2px] bottom-[-2px] border border-slate-400/70 pointer-events-none" style={{ left: `${quarter * 25}%`, width: '25%' }} />
            </div>
        </div>
    );
};
