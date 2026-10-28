// ActionSheet.tsx — 폰 바텀 시트 선택기. [2026-10-27 모바일 홈]
// docs/ui/mobile-design-system.md §9-0-2·§9-3: 패널 헤더의 Dropdown 트리거를 탭하면 폰에선 팝오버 대신 바텀 시트.
// 항목 48, 선택 항목 indigo-600/10 틴트 + 체크, 핸들 36×4, 하단 안전 영역. z-modal(500) — 탭 바(100)·위젯(300) 위.
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface ActionSheetItem<T extends string> {
    value: T;
    label: React.ReactNode;
}

interface ActionSheetProps<T extends string> {
    open: boolean;
    title: string;
    items: ActionSheetItem<T>[];
    value: T;
    onSelect: (value: T) => void;
    onClose: () => void;
}

export function ActionSheet<T extends string>({ open, title, items, value, onSelect, onClose }: ActionSheetProps<T>) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-modal flex flex-col justify-end" onClick={onClose}>
            <div className="absolute inset-0 bg-slate-950/80" aria-hidden="true" />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={e => e.stopPropagation()}
                className="relative bg-slate-900 border-t border-slate-700 rounded-t-2xl shadow-2xl px-2 pb-safe"
            >
                <div className="flex justify-center pt-2 pb-1"><span className="w-9 h-1 rounded-full bg-slate-600" /></div>
                <div className="px-2 pt-1 pb-2 text-base font-semibold text-white">{title}</div>
                <div role="listbox" className="flex flex-col gap-0.5 pb-2 max-h-[70dvh] overflow-y-auto custom-scrollbar">
                    {items.map(it => {
                        const on = it.value === value;
                        return (
                            <button
                                key={it.value}
                                type="button"
                                role="option"
                                aria-selected={on}
                                onClick={() => { onSelect(it.value); onClose(); }}
                                className={`w-full h-12 px-4 rounded-lg flex items-center justify-between text-sm font-bold text-left ${on ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 active:bg-white/5'}`}
                            >
                                <span>{it.label}</span>
                                {on && <Check size={18} className="text-indigo-400" />}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body,
    );
}

/** 패널 헤더용 트리거 + 시트 한 쌍 — 라벨 12px bold white + ChevronDown 16 slate-500, 높이 28(§9-0-2). */
export function SheetSelect<T extends string>({ title, items, value, onChange }: { title: string; items: ActionSheetItem<T>[]; value: T; onChange: (v: T) => void }) {
    const [open, setOpen] = React.useState(false);
    const current = items.find(i => i.value === value);
    return (
        <>
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={title}
                onClick={() => setOpen(true)}
                className="h-7 pl-2.5 pr-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold text-white whitespace-nowrap active:bg-slate-800"
            >
                {current?.label ?? value}
                <ChevronDown size={16} className="text-slate-500" />
            </button>
            <ActionSheet open={open} title={title} items={items} value={value} onSelect={onChange} onClose={() => setOpen(false)} />
        </>
    );
}
