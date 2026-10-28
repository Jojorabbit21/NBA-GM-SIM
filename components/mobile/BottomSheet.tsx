// BottomSheet.tsx — 폰 바텀 시트(임의 콘텐츠). [2026-10-27]
// ActionSheet(단일 선택 목록)와 같은 껍데기(핸들 36×4, 제목 16/600, slate-900, 상단 둥근 16, z-modal, pb-safe)에 children을 넣는다.
// 선수 기록 탭 필터(정규/플레이오프·색상 스케일)처럼 토글 몇 개를 모아 두는 용도.
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    /** 제목 줄 우측(예: "초기화" 링크) — [2026-10-27 뉴스피드 필터 시트] */
    headerRight?: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({ open, title, onClose, children, headerRight }) => {
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
            <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} className="relative bg-slate-900 border-t border-slate-700 rounded-t-2xl shadow-2xl px-4 pb-safe">
                <div className="flex justify-center pt-2 pb-1"><span className="w-9 h-1 rounded-full bg-slate-600" /></div>
                <div className="pt-1 pb-2 flex items-center justify-between gap-3"><span className="text-base font-semibold text-white">{title}</span>{headerRight}</div>
                <div className="pb-3 max-h-[70dvh] overflow-y-auto">{children}</div>
            </div>
        </div>,
        document.body,
    );
};

/** 시트 안 토글 행 48 — 라벨 14 + 우측 스위치(StatsToggles.Switch와 같은 모양) */
export const SheetToggleRow: React.FC<{ label: string; description?: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, description, value, onChange }) => (
    <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className="w-full h-12 flex items-center justify-between gap-3 text-left border-b border-slate-800 last:border-b-0 active:bg-white/5">
        <span className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-slate-200">{label}</span>
            {description && <span className="text-xs text-slate-500 truncate">{description}</span>}
        </span>
        <span className={`w-8 h-4 rounded-full relative transition-colors duration-300 shrink-0 ${value ? 'bg-indigo-600' : 'bg-slate-800'}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${value ? 'right-0.5' : 'left-0.5'}`} />
        </span>
    </button>
);

/** 시트 안 선택 행 44 — radio(단일) / checkbox(다중). 모양은 필터 패널 CheckOption(18px, indigo-500)과 같다. */
export const SheetOptionRow: React.FC<{ type: 'radio' | 'checkbox'; label: string; checked: boolean; onChange: () => void }> = ({ type, label, checked, onChange }) => (
    <button type="button" role={type === 'radio' ? 'radio' : 'checkbox'} aria-checked={checked} onClick={onChange} className="w-full h-11 flex items-center gap-3 text-left active:bg-white/5">
        <span className={`w-[18px] h-[18px] shrink-0 border-2 box-border flex items-center justify-center ${type === 'radio' ? 'rounded-full' : 'rounded'} ${checked ? 'border-indigo-500 bg-indigo-500' : 'border-slate-600 bg-slate-950'}`}>
            {checked && (type === 'radio'
                ? <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>)}
        </span>
        <span className={`text-sm ${checked ? 'text-white font-bold' : 'text-slate-400'}`}>{label}</span>
    </button>
);

/** 시트 안 그룹 소제목 12/700 slate-500(위 여백 8, 그룹 사이 선) */
export const SheetGroupTitle: React.FC<{ children: React.ReactNode; first?: boolean }> = ({ children, first = false }) => (
    <div className={`pt-2 pb-1 text-xs font-bold text-slate-500 ${first ? '' : 'mt-1 border-t border-slate-800'}`}>{children}</div>
);
