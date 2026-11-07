// PhoneDraftQueue.tsx — 드래프트 룸 폰 "큐" 탭. [2026-11-08]
// docs/ui/mobile-design-system.md §9-0-4 "큐": 서브헤더 40(포지션별 남은 수 | "저장 안 됨" · 저장 32) + 행 48
// (핸들 24 터치 드래그 정렬 · 순번 20 · OVR 24 · 이름 · POS 28 · 드래프트 32 · 삭제 32). 지명된 선수는 보이지 않는다(DraftQueuePanel과 동일 규칙).
// 정렬은 포인터 이벤트(터치)로: 핸들을 누른 채 위아래로 끌면 놓는 자리로 이동, 놓을 때 onChange 1회.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { OvrBadge } from '../../common/OvrBadge';
import { Button } from '../../common/Button';
import { InlineNotice } from '../../common/InlineNotice';
import type { QueuePlayerInfo } from '../DraftQueuePanel';

const ROW_H = 48;
const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

interface PhoneDraftQueueProps {
    queue: string[];
    playersById: Map<string, QueuePlayerInfo>;
    draftedIds: Set<string>;
    onChange: (ids: string[]) => void;
    selectedPlayerId: string | null;
    onSelect: (id: string) => void;
    onOpenPlayer: (id: string) => void;
    /** 내 차례 + 연결됨 + 전송 중 아님 */
    canDraft: boolean;
    onDraft: (id: string) => void;
    disabled?: boolean;
    dirty: boolean;
    saving: boolean;
    saveError: string | null;
    onSave: () => void;
}

export const PhoneDraftQueue: React.FC<PhoneDraftQueueProps> = ({
    queue, playersById, draftedIds, onChange, selectedPlayerId, onSelect, onOpenPlayer, canDraft, onDraft,
    disabled = false, dirty, saving, saveError, onSave,
}) => {
    const visible = useMemo(() => queue.filter(id => !draftedIds.has(id)), [queue, draftedIds]);
    const posCounts = useMemo(() => {
        const c: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
        for (const id of visible) { const pos = playersById.get(id)?.position; if (pos && pos in c) c[pos] += 1; }
        return c;
    }, [visible, playersById]);

    // ── 터치 드래그 정렬 ─────────────────────────────────────────────────────
    const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
    const dragRef = useRef<{ from: number; startY: number } | null>(null);
    const onHandleDown = useCallback((idx: number, e: React.PointerEvent<HTMLButtonElement>) => {
        if (disabled) return;
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { from: idx, startY: e.clientY };
        setDrag({ from: idx, to: idx });
    }, [disabled]);
    const onHandleMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
        const d = dragRef.current;
        if (!d) return;
        const delta = Math.round((e.clientY - d.startY) / ROW_H);
        const to = Math.max(0, Math.min(visible.length - 1, d.from + delta));
        setDrag(prev => (prev && prev.to === to) ? prev : { from: d.from, to });
    }, [visible.length]);
    const onHandleUp = useCallback(() => {
        const d = dragRef.current;
        dragRef.current = null;
        setDrag(prev => {
            if (d && prev && prev.from !== prev.to) {
                const next = [...visible];
                const [item] = next.splice(prev.from, 1);
                next.splice(prev.to, 0, item);
                onChange(next);
            }
            return null;
        });
    }, [visible, onChange]);

    const remove = useCallback((idx: number) => onChange(visible.filter((_, i) => i !== idx)), [visible, onChange]);

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 h-10 px-4 flex items-center justify-between gap-2 border-b border-slate-800/50 bg-slate-800/30">
                <span className="flex items-center gap-2 min-w-0 overflow-hidden">
                    {POSITION_ORDER.map(pos => (
                        <span key={pos} className="flex items-center gap-0.5 shrink-0">
                            <span className="text-xs font-bold text-slate-400">{pos}</span>
                            <span className="text-xs text-white">{posCounts[pos]}</span>
                        </span>
                    ))}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                    {saveError ? (
                        <InlineNotice tone="danger" size="sm">{saveError}</InlineNotice>
                    ) : dirty && !saving ? (
                        <InlineNotice tone="warning" size="sm">저장 안 됨</InlineNotice>
                    ) : null}
                    <Button variant={dirty ? 'primary' : 'secondary'} size="md" shape="md" onClick={onSave} disabled={disabled || saving || !dirty} className="!text-xs">
                        {saving ? '저장 중…' : dirty ? '저장' : '저장됨'}
                    </Button>
                </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
                {visible.length === 0 && (
                    <div className="px-4 py-6 text-sm text-slate-500 text-center ko-normal">선수 팝업에서 큐에 추가하세요</div>
                )}
                {visible.map((id, idx) => {
                    const info = playersById.get(id);
                    const sel = selectedPlayerId === id;
                    const isDragging = drag?.from === idx;
                    const isOver = drag !== null && drag.to === idx && drag.from !== idx;
                    return (
                        <div
                            key={id}
                            onClick={() => onSelect(id)}
                            className={`flex items-center gap-1.5 pl-3 pr-3 border-b border-slate-700/50 ${isDragging ? 'opacity-40' : ''} ${isOver ? 'bg-indigo-500/10' : sel ? 'bg-amber-500/[0.06]' : ''}`}
                            style={{ height: ROW_H }}
                        >
                            <button
                                type="button"
                                aria-label="순서 이동"
                                disabled={disabled}
                                onPointerDown={e => onHandleDown(idx, e)}
                                onPointerMove={onHandleMove}
                                onPointerUp={onHandleUp}
                                onPointerCancel={onHandleUp}
                                onClick={e => e.stopPropagation()}
                                className="w-6 h-11 flex items-center justify-center text-slate-600 touch-none shrink-0 disabled:text-slate-800"
                            >
                                <GripVertical size={16} />
                            </button>
                            <span className="w-5 text-center text-sm font-bold text-slate-500 shrink-0 tabular-nums">{idx + 1}</span>
                            {info ? <OvrBadge value={info.ovr} size="sm" /> : <span className="w-6 shrink-0" />}
                            <button
                                type="button"
                                onClick={e => { e.stopPropagation(); onOpenPlayer(id); }}
                                className="flex-1 min-w-0 text-left text-sm font-semibold text-slate-200 truncate"
                            >
                                {info?.name ?? id}
                            </button>
                            <span className="w-7 shrink-0 text-sm font-bold text-slate-400">{info?.position ?? '?'}</span>
                            <Button variant="success" size="md" shape="md" disabled={!canDraft} onClick={e => { e.stopPropagation(); onDraft(id); }} className="!px-2.5 !text-xs shrink-0">
                                드래프트
                            </Button>
                            <Button variant="secondary" size="md" shape="md" disabled={disabled} onClick={e => { e.stopPropagation(); remove(idx); }} className="!px-2.5 !text-xs shrink-0">
                                삭제
                            </Button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
