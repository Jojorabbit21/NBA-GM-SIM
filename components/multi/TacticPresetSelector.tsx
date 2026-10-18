import React, { useState } from 'react';
import { PenLine, Trash2, Plus, Undo2 } from 'lucide-react';
import { Dropdown, DropdownButton } from '../common/Dropdown';
import { Button } from '../common/Button';
import { IconButton } from '../common/IconButton';
import { TACTIC_PRESET_SLOTS, TACTIC_PRESET_NAME_MAX, normalizePresetName, type MultiTacticPreset, type TacticPresetSlot } from '../../services/multi/tacticPresets';

interface TacticPresetSelectorProps {
    /** 한 종류(depth 또는 team) 프리셋만 (있는 슬롯만, 최대 3개) */
    presets: MultiTacticPreset[];
    activeSlot: TacticPresetSlot | null;
    disabled?: boolean;
    /** 드롭다운에서 다른 프리셋 선택 — 호출부가 즉시 편집기에 적용 */
    onSelect: (slot: TacticPresetSlot) => void;
    /** 새 프리셋 확정(빈 슬롯 중 가장 앞 번호). error 문자열을 돌려주면 입력 모드 유지 */
    onCreate: (slot: TacticPresetSlot, name: string) => Promise<string | null>;
    /** 활성 프리셋 이름 확정. error 문자열을 돌려주면 입력 모드 유지 */
    onRename: (name: string) => Promise<string | null>;
    onDelete: () => void;
    /** 활성 프리셋에 저장된 값으로 되돌리기(초기화와 별개). canRevert = 화면 값이 활성 프리셋과 다를 때만 true */
    onRevert: () => void;
    canRevert: boolean;
}

/** 전술 프리셋 선택기 — 뎁스·로테이션 탭과 팀 전술 탭 공용 [2026-10-18 v3 — 사용자가 원할 때 추가]
 *  - 프리셋 0개: [프리셋 +] 버튼만. 누르면 이름 입력창(포커스·전체 선택) + [확인] → 확인 시 생성
 *  - 1개 이상: [드롭다운][+ (3개 미만일 때)][되돌리기][이름 변경][삭제]. 선택 즉시 적용, 저장은 상단 저장 버튼이 활성 프리셋에 덮어씀
 *  - 입력 모드에서 Esc = 취소 */
export const TacticPresetSelector: React.FC<TacticPresetSelectorProps> = ({ presets, activeSlot, disabled, onSelect, onCreate, onRename, onDelete, onRevert, canRevert }) => {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<'idle' | 'create' | 'rename'>('idle');
    const [draft, setDraft] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const bySlot = new Map(presets.map(p => [p.slot, p]));
    const sorted = [...presets].sort((a, b) => a.slot - b.slot);
    const active = activeSlot !== null ? bySlot.get(activeSlot) : undefined;
    const nextFreeSlot = TACTIC_PRESET_SLOTS.find(s => !bySlot.has(s)) ?? null;

    const startCreate = () => {
        if (nextFreeSlot === null) return;
        setDraft(`프리셋 ${nextFreeSlot}`);
        setMode('create');
    };
    const startRename = () => {
        if (!active) return;
        setDraft(active.name);
        setMode('rename');
    };
    const confirm = async () => {
        const name = normalizePresetName(draft);
        if (!name) return;
        if (mode === 'rename' && name === active?.name) { setMode('idle'); return; }
        setSubmitting(true);
        const err = mode === 'create' && nextFreeSlot !== null
            ? await onCreate(nextFreeSlot, name)
            : await onRename(name);
        setSubmitting(false);
        if (!err) setMode('idle');
    };

    if (mode !== 'idle') {
        return (
            <div className="flex items-center gap-2 min-w-0">
                <input
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onFocus={e => e.currentTarget.select()}
                    onKeyDown={e => {
                        if (e.key === 'Enter') confirm();
                        if (e.key === 'Escape') setMode('idle');
                    }}
                    maxLength={TACTIC_PRESET_NAME_MAX}
                    placeholder="프리셋 이름"
                    autoFocus
                    className="h-8 w-[168px] px-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <Button variant="primary" size="md" onClick={confirm} disabled={!normalizePresetName(draft)} isLoading={submitting}>
                    확인
                </Button>
            </div>
        );
    }

    if (presets.length === 0) {
        return (
            <Button variant="success" size="md" iconRight={<Plus size={14} />} onClick={startCreate} disabled={disabled}>
                프리셋
            </Button>
        );
    }

    return (
        <div className="flex items-center gap-2 min-w-0">
            <Dropdown
                isOpen={open}
                onOpenChange={o => !disabled && setOpen(o)}
                align="left"
                width="w-44"
                trigger={
                    // 공용 DropdownButton(트레이드 제안·박스스코어와 같은 select형 트리거) — 툴바 높이 32px에 맞춰 h-8·px-3
                    <DropdownButton
                        isOpen={open}
                        label={active ? active.name : <span className="text-slate-400">프리셋 선택</span>}
                        className={`h-8 w-[168px] !px-3 !py-0 ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    />
                }
                items={sorted.map(p => ({
                    id: String(p.slot),
                    label: <span className="truncate">{p.name}</span>,
                    active: p.slot === activeSlot,
                    onClick: () => { if (p.slot !== activeSlot) onSelect(p.slot); },
                }))}
            />
            {nextFreeSlot !== null && (
                <IconButton label="프리셋 추가" size="lg" tone="success" onClick={startCreate} disabled={disabled}>
                    <Plus size={16} />
                </IconButton>
            )}
            <IconButton label="프리셋 값으로 되돌리기" size="lg" tone="subtle" onClick={onRevert} disabled={disabled || !active || !canRevert}>
                <Undo2 size={16} />
            </IconButton>
            <IconButton label="이름 변경" size="lg" tone="subtle" onClick={startRename} disabled={disabled || !active}>
                <PenLine size={16} />
            </IconButton>
            <IconButton label="삭제" size="lg" tone="danger" onClick={onDelete} disabled={disabled || !active}>
                <Trash2 size={16} />
            </IconButton>
        </div>
    );
};
