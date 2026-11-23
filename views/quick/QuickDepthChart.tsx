import React, { useMemo, useState } from 'react';
import { GripVertical } from 'lucide-react';
import type { DepthChart, Player } from '../../types';
import { OvrBadge } from '../../components/common/OvrBadge';
import { PlayerSlotDropdown } from '../../components/dashboard/DepthRotationBoard';
import { calculatePlayerOvr } from '../../utils/constants';
import { DEPTH_LABELS, DEPTH_POSITIONS, emptyDepthChart } from './quickGameTypes';

// [2026-11-23] Quick Game 1단계 왼쪽 로스터 — 뎁스 차트·로테이션 보드(components/dashboard/DepthRotationBoard.tsx)의
// 슬롯 | 포지션 | 드래그 핸들 | 선수 드롭다운 | OVR 열을 그대로 옮긴 것(로테이션 간트 없음).
// 드래그 = 두 슬롯 맞바꾸기, 드롭다운 = 슬롯 선수 선택/제거(다른 슬롯에 있던 같은 선수는 그 슬롯이 비워짐 — 보드와 동일 규칙).

type SlotRef = { pos: keyof DepthChart; idx: number };

const SH = 'bg-slate-950';
const SK = 'bg-slate-900';
const SB = 'border-r border-slate-800';

const clone = (dc: DepthChart): DepthChart => {
    const next = emptyDepthChart();
    for (const p of DEPTH_POSITIONS) next[p] = [...dc[p]] as DepthChart[typeof p];
    return next;
};

export const QuickDepthChart: React.FC<{
    depthChart: DepthChart;
    /** 드롭다운 후보(OVR 내림차순으로 보여 줌) */
    candidates: Player[];
    onChange: (dc: DepthChart) => void;
}> = ({ depthChart, candidates, onChange }) => {
    const [draggedSlot, setDraggedSlot] = useState<SlotRef | null>(null);
    const [dropTargetSlot, setDropTargetSlot] = useState<SlotRef | null>(null);

    const sorted = useMemo(() => [...candidates].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)), [candidates]);
    const byId = useMemo(() => new Map(candidates.map(p => [p.id, p])), [candidates]);

    const handleSlotChange = (pos: keyof DepthChart, idx: number, playerId: string) => {
        const next = clone(depthChart);
        const val = playerId === '' ? null : playerId;
        if (val) for (const p of DEPTH_POSITIONS) for (let i = 0; i < 3; i++) {
            if (!(p === pos && i === idx) && next[p][i] === val) next[p][i] = null;
        }
        next[pos][idx] = val;
        onChange(next);
    };
    const handleSlotSwap = (from: SlotRef, to: SlotRef) => {
        if (from.pos === to.pos && from.idx === to.idx) return;
        const next = clone(depthChart);
        next[from.pos][from.idx] = depthChart[to.pos][to.idx];
        next[to.pos][to.idx] = depthChart[from.pos][from.idx];
        onChange(next);
    };

    return (
        <table className="border-separate border-spacing-0 w-full" style={{ tableLayout: 'fixed' }}>
            <colgroup>
                <col style={{ width: 56 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: 28 }} />
                <col />
                <col style={{ width: 48 }} />
            </colgroup>
            <thead className={`${SH} sticky top-0 z-40`}>
                <tr className="text-sm font-bold text-slate-400">
                    <th className={`${SH} ${SB} border-b border-slate-800 py-3 text-center`} colSpan={2}>슬롯</th>
                    <th className={`${SH} ${SB} border-b border-slate-800 py-3 text-left px-3`} colSpan={2}>선수</th>
                    <th className={`${SH} border-b border-slate-800 py-3 text-center`}>OVR</th>
                </tr>
            </thead>
            <tbody>
                {DEPTH_LABELS.map((depthLabel, depthIndex) => DEPTH_POSITIONS.map((pos, posIdx) => {
                    const selectedId = depthChart[pos][depthIndex];
                    const selectedPlayer = selectedId ? byId.get(selectedId) ?? null : null;
                    const isDropTarget = dropTargetSlot?.pos === pos && dropTargetSlot?.idx === depthIndex
                        && !(draggedSlot?.pos === pos && draggedSlot?.idx === depthIndex);
                    const groupEndBorder = posIdx === DEPTH_POSITIONS.length - 1 ? 'border-b-2 border-b-slate-800' : 'border-b border-b-slate-800';
                    return (
                        <tr
                            key={`${String(pos)}-${depthIndex}`}
                            className={`group h-9 transition-colors ${isDropTarget ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'}`}
                            onDragOver={e => { if (draggedSlot) { e.preventDefault(); setDropTargetSlot({ pos, idx: depthIndex }); } }}
                            onDragLeave={() => setDropTargetSlot(prev => (prev?.pos === pos && prev?.idx === depthIndex ? null : prev))}
                            onDrop={e => {
                                e.preventDefault();
                                if (draggedSlot) handleSlotSwap(draggedSlot, { pos, idx: depthIndex });
                                setDraggedSlot(null);
                                setDropTargetSlot(null);
                            }}
                        >
                            {posIdx === 0 && (
                                <td rowSpan={DEPTH_POSITIONS.length} className={`bg-slate-800 text-center align-middle ${SB} border-b-2 border-b-slate-800`}>
                                    <span className={`text-sm font-bold ${DEPTH_POSITIONS.some(p => depthChart[p][depthIndex]) ? 'text-white' : 'text-slate-600'}`}>{depthLabel}</span>
                                </td>
                            )}
                            <td className={`${SK} text-center align-middle ${SB} ${groupEndBorder}`}>
                                <span className={`text-sm font-bold ${depthChart[pos].some(Boolean) ? 'text-white' : 'text-slate-500'}`}>{String(pos)}</span>
                            </td>
                            <td className={`border-r border-slate-800 ${SK} text-center align-middle ${groupEndBorder}`}>
                                <div
                                    draggable
                                    onDragStart={() => setDraggedSlot({ pos, idx: depthIndex })}
                                    onDragEnd={() => { setDraggedSlot(null); setDropTargetSlot(null); }}
                                    className="flex items-center justify-center h-full cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-300"
                                    title="드래그해서 다른 슬롯과 선수 교체"
                                >
                                    <GripVertical size={14} />
                                </div>
                            </td>
                            <td className={`${SK} !p-0 ${SB} ${groupEndBorder}`}>
                                <PlayerSlotDropdown
                                    players={sorted}
                                    selectedPlayer={selectedPlayer}
                                    onChange={playerId => handleSlotChange(pos, depthIndex, playerId)}
                                />
                            </td>
                            <td className={`${SK} text-center ${groupEndBorder}`}>
                                {selectedPlayer && (
                                    <div className="flex justify-center">
                                        <OvrBadge value={calculatePlayerOvr(selectedPlayer)} size="sm" className="!shadow-none" />
                                    </div>
                                )}
                            </td>
                        </tr>
                    );
                }))}
            </tbody>
        </table>
    );
};
