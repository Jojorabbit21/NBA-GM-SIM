
import React, { useState, useCallback } from 'react';
import { GripVertical, X, ListX } from 'lucide-react';
import { OvrBadge } from '../common/OvrBadge';
import { IconButton } from '../common/IconButton';
import { Button } from '../common/Button';
import { InlineNotice } from '../common/InlineNotice';

/** 큐 행에 표시할 최소 정보 — 미지명 선수는 풀에서, 이미 지명된 선수는 draft picks 에서 채운다(MultiDraftView). */
export interface QueuePlayerInfo {
    name: string;
    position: string;
    ovr: number;
}

interface DraftQueuePanelProps {
    /** 희망 순서 playerId[] — 지명된 선수도 그대로 남아 있음(D5), 여기선 라디오 disabled + 이름/OVR 흐리게 */
    queue: string[];
    playersById: Map<string, QueuePlayerInfo>;
    draftedIds: Set<string>;
    onChange: (ids: string[]) => void;
    /** 풀과 공유하는 선택 상태 — 큐에서 고르면 풀의 같은 선수도 선택돼 "드래프트" 버튼이 켜진다 */
    selectedPlayerId: string | null;
    onSelect: (playerId: string) => void;
    /** WS 끊김 중 편집 잠금 */
    disabled?: boolean;
    /** 헤더 좌측 슬롯 — MultiDraftView 가 [기록 | 큐] 세그먼트를 넣는다(없으면 제목 텍스트) */
    headerLeft?: React.ReactNode;
    /** [2026-10-23] 저장 버튼 방식 — 로컬 편집본 ≠ 서버 저장본이면 dirty. 오토픽은 저장본만 본다 */
    dirty: boolean;
    saving: boolean;
    saveError: string | null;
    onSave: () => void;
}

/**
 * [2026-10-23] 멀티 드래프트 큐 패널 — 좌측 "드래프트 기록" 패널과 탭으로 자리를 나눠 쓴다
 * (docs/plan/draft-queue-plan.md D5/D7/D8). 헤더 h-10(PickHistory/MyRoster 와 동일), 행은 h-10(사용자 요청으로 풀/기록의 h-8 보다 높게).
 * 정렬은 네이티브 HTML5 드래그(↑/↓ 버튼은 사용자 요청으로 제거), 라이브러리 없음. 행 라디오/클릭은 풀과 선택 상태를 공유해 큐에서 바로 지명 가능.
 * 헤더 아래 서브헤더(h-8)에 남은 큐 선수의 포지션별 수를 표시.
 */
const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

const DraftQueuePanelComponent: React.FC<DraftQueuePanelProps> = ({
    queue, playersById, draftedIds, onChange, selectedPlayerId, onSelect, disabled = false, headerLeft,
    dirty, saving, saveError, onSave,
}) => {
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [overIdx, setOverIdx] = useState<number | null>(null);

    const remaining    = queue.filter(id => !draftedIds.has(id)).length;
    const draftedCount = queue.length - remaining;

    // 서브헤더용 — 남은(미지명) 큐 선수의 포지션별 수
    const posCounts: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    for (const id of queue) {
        if (draftedIds.has(id)) continue;
        const pos = playersById.get(id)?.position;
        if (pos && pos in posCounts) posCounts[pos] += 1;
    }

    const move = useCallback((from: number, to: number) => {
        if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
        const next = [...queue];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        onChange(next);
    }, [queue, onChange]);

    const remove = useCallback((idx: number) => {
        onChange(queue.filter((_, i) => i !== idx));
    }, [queue, onChange]);

    const clearDrafted = useCallback(() => {
        onChange(queue.filter(id => !draftedIds.has(id)));
    }, [queue, draftedIds, onChange]);

    const endDrag = () => { setDragIdx(null); setOverIdx(null); };

    let rank = 0;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-3 h-10 border-b border-slate-800/50 shrink-0 flex items-center justify-between bg-slate-800/30">
                {headerLeft ?? <span className="text-sm font-black text-indigo-400">드래프트 큐</span>}
                <div className="flex items-center gap-1.5">
                    {draftedCount > 0 && (
                        <IconButton
                            label={`지명된 선수 ${draftedCount}명 정리`}
                            size="sm"
                            tone="danger"
                            shape="md"
                            onClick={clearDrafted}
                            disabled={disabled}
                        >
                            <ListX size={13} />
                        </IconButton>
                    )}
                    {/* 저장 — 미저장 편집이 있을 때만 활성(primary). 저장 전까지 오토픽은 옛 저장본을 쓴다 */}
                    <Button
                        variant={dirty ? 'primary' : 'secondary'}
                        size="xs"
                        shape="md"
                        onClick={onSave}
                        disabled={disabled || saving || !dirty}
                        title={disabled ? '연결이 끊겨 저장할 수 없습니다' : dirty ? '큐를 서버에 저장' : '저장된 상태'}
                        className="shrink-0"
                    >
                        {saving ? '저장 중…' : dirty ? '저장' : '저장됨'}
                    </Button>
                </div>
            </div>

            {/* Sub-header — 포지션별 남은 큐 수 (MyRoster 헤더의 포지션 카운트와 같은 표기) + 저장 실패/미저장 안내 */}
            <div className="shrink-0 px-3 h-8 flex items-center gap-2 border-b border-slate-800/50 bg-slate-800/15">
                {POSITION_ORDER.map(pos => (
                    <span key={pos} className="flex items-center gap-0.5">
                        <span className="text-xs font-bold text-slate-400">{pos}</span>
                        <span className="text-xs text-white">{posCounts[pos]}</span>
                    </span>
                ))}
                <span className="ml-auto min-w-0 truncate">
                    {saveError ? (
                        <InlineNotice tone="danger" size="sm">{saveError}</InlineNotice>
                    ) : dirty && !saving ? (
                        <InlineNotice tone="warning" size="sm">저장 안 됨</InlineNotice>
                    ) : null}
                </span>
            </div>

            {/* Scroll Area */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {queue.length === 0 && (
                    <div className="px-3 py-4 text-sm text-slate-600 italic text-center ko-normal">
                        선수 풀에서 + 를 눌러 큐에 추가하세요
                    </div>
                )}
                {queue.map((id, idx) => {
                    const info    = playersById.get(id);
                    const drafted = draftedIds.has(id);
                    if (!drafted) rank += 1;
                    const isDragging = dragIdx === idx;
                    const isOver     = overIdx === idx && dragIdx !== null && dragIdx !== idx;
                    const canEdit    = !disabled && !drafted;
                    const isSelected = !drafted && selectedPlayerId === id;

                    return (
                        <div
                            key={id}
                            draggable={canEdit}
                            onDragStart={canEdit ? (e) => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(idx); } : undefined}
                            onDragOver={(e) => { if (dragIdx === null) return; e.preventDefault(); if (overIdx !== idx) setOverIdx(idx); }}
                            onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) move(dragIdx, idx); endDrag(); }}
                            onDragEnd={endDrag}
                            onClick={drafted ? undefined : () => onSelect(id)}
                            className={`group h-10 min-h-10 max-h-10 px-2 border-b border-slate-700/50 flex items-center gap-1.5 transition-colors ${
                                drafted ? '' : 'cursor-pointer'
                            } ${isDragging ? 'opacity-40' : ''} ${
                                isOver ? 'bg-indigo-500/10' : isSelected ? 'bg-amber-500/[0.06]' : drafted ? '' : 'hover:bg-white/[0.03]'
                            }`}
                        >
                            {/* 라디오 — 풀(PlayerPool)과 같은 스타일, 선택 상태 공유. 지명된 선수는 disabled */}
                            <span className="w-4 shrink-0 flex items-center justify-center">
                                <input
                                    type="radio"
                                    name="draft-player-queue"
                                    checked={isSelected}
                                    disabled={drafted}
                                    onChange={() => onSelect(id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="block w-3.5 h-3.5 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2.5px_rgb(2,6,23)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                                />
                            </span>
                            {/* 핸들 */}
                            <span className={`w-4 shrink-0 flex items-center justify-center ${canEdit ? 'cursor-grab text-slate-600 group-hover:text-slate-400' : 'text-slate-800'}`}>
                                <GripVertical size={12} />
                            </span>
                            {/* 순번 — 남은 선수만 매김 */}
                            <span className="text-sm font-bold w-5 shrink-0 text-slate-500 text-center">
                                {drafted ? '—' : rank}
                            </span>
                            {/* 지명된 선수: 이름·OVR 배지만 흐리게(행 전체는 그대로) */}
                            <span className={`shrink-0 flex items-center ${drafted ? 'opacity-40' : ''}`}>
                                {info ? <OvrBadge value={info.ovr} size="sm" /> : <span className="w-7 shrink-0" />}
                            </span>
                            <span className={`text-sm font-semibold truncate flex-1 text-slate-200 ${drafted ? 'opacity-40' : ''}`}>
                                {info?.name ?? id}
                            </span>
                            {/* 포지션 — 이름 뒤, 텍스트 좌측 정렬 */}
                            <span className="text-sm font-bold w-7 shrink-0 text-slate-400 text-left">
                                {info?.position ?? '?'}
                            </span>
                            {/* 제거 — 상시 표시, 행 우측 끝. 행 클릭(선택)으로 번지지 않게 막는다 */}
                            <span className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                                <IconButton label="큐에서 제거" size="xs" tone="danger" shape="md" disabled={disabled} onClick={() => remove(idx)}>
                                    <X size={12} />
                                </IconButton>
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const DraftQueuePanel = React.memo(DraftQueuePanelComponent);
