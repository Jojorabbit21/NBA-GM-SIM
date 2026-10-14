import React from 'react';

export interface SegmentOption<T extends string> {
    value: T;
    label: React.ReactNode;
    disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
    value: T;
    onChange: (value: T) => void;
    options: SegmentOption<T>[];
    /** sm = h-7 text-xs(표 안·필터 바), md = h-8 text-sm(화면 상단 모드 전환) */
    size?: 'sm' | 'md';
    /**
     * indigo(기본) = "선택됨"의 앱 공통 색(정렬 활성·탭 밑줄·드롭다운 활성과 동일 계열)
     * slate = 선택이 아니라 "전환"에 가까운 곳(우리 팀/상대 등)만
     */
    tone?: 'indigo' | 'slate';
    className?: string;
    'aria-label'?: string;
}

const SIZE = { sm: 'h-7 px-2.5 text-xs', md: 'h-8 px-3 text-sm' } as const;
const ACTIVE = { indigo: 'bg-indigo-600 text-white', slate: 'bg-slate-600 text-white' } as const;

/**
 * 세그먼트 토글 — 2026-10-12 신설(docs/plan/ui-buttons.md 3-3).
 * 순위표 리그/컨퍼런스/디비전, 올스타 백코트/프론트코트, PBP 쿼터 필터처럼 "하나만 켜지는" 선택에 쓴다.
 * 컨테이너 `bg-slate-800 rounded-md p-1`, 활성 tone, 비활성 `text-slate-400 hover:text-white`로 통일.
 */
export function SegmentedControl<T extends string>({
    value, onChange, options, size = 'md', tone = 'indigo', className = '', 'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
    return (
        <div role="group" aria-label={ariaLabel} className={`inline-flex items-center gap-0.5 bg-slate-800 rounded-md p-1 ${className}`}>
            {options.map(opt => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        disabled={opt.disabled}
                        onClick={() => !active && onChange(opt.value)}
                        className={[
                            'inline-flex items-center justify-center rounded font-semibold whitespace-nowrap transition-colors',
                            'disabled:opacity-40 disabled:cursor-not-allowed',
                            SIZE[size],
                            active ? ACTIVE[tone] : 'text-slate-400 hover:text-white',
                        ].join(' ')}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
