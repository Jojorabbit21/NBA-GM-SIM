import React from 'react';
import { ChevronDown } from 'lucide-react';

interface FilterTriggerProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    label: React.ReactNode;
    /** 선택된 항목 수 — 0보다 크면 인디고 활성 테두리 + 숫자 배지 */
    count?: number;
    /** count 없이도 활성 상태를 강제할 때 */
    active?: boolean;
}

/**
 * 툴바 필터 열기 버튼(36px 필) — 2026-10-12 신설(docs/plan/ui-buttons.md 3-4).
 * 리더보드 팀/포지션, 뉴스 팀, FA·드래프트 풀 포지션/아키타입 드롭다운 7곳이 같은 마크업을 복제하던 것.
 * 패널 위치 계산을 위해 ref를 그대로 <button>에 넘긴다.
 */
export const FilterTrigger = React.forwardRef<HTMLButtonElement, FilterTriggerProps>(({
    label, count = 0, active, className = '', type = 'button', ...props
}, ref) => {
    const isActive = active ?? count > 0;
    return (
        <button
            ref={ref}
            type={type}
            className={[
                'flex items-center gap-2 h-[36px] px-3 bg-slate-950 rounded-lg border shadow-sm text-sm font-semibold transition-colors whitespace-nowrap',
                isActive ? 'border-indigo-500/50 text-indigo-400' : 'border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white',
                className,
            ].filter(Boolean).join(' ')}
            {...props}
        >
            <span>{label}</span>
            {count > 0 && (
                <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full tabular-nums">{count}</span>
            )}
            <ChevronDown size={12} />
        </button>
    );
});
FilterTrigger.displayName = 'FilterTrigger';
