import React from 'react';

export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type IconButtonTone = 'ghost' | 'subtle' | 'solid' | 'inherit' | 'success' | 'danger';
export type IconButtonShape = 'md' | 'lg' | 'full';

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    /** 접근성 라벨(필수) — aria-label과 title에 함께 들어간다. 멀티 세션 아이콘 전용 버튼 76개 중 58개가 라벨이 없었다. */
    label: string;
    /** 정사각 한 변: xs 20 / sm 24 / md 28 / lg 32 (px) */
    size?: IconButtonSize;
    /**
     * ghost   = 아이콘 색만 바뀜(모달 닫기 X)
     * subtle  = hover 시 옅은 배경(스트립·캘린더 chevron)
     * solid   = 항상 배경(툴바)
     * inherit = 색을 부모에서 상속(칩 안의 X처럼 칩 색을 따라야 할 때)
     * success = 추가(+) 같은 생성 동작 — 초록 아이콘, hover 옅은 초록 배경 [2026-10-18 전술 프리셋]
     * danger  = 삭제·제거 — 평소 subtle과 같고 hover만 빨강(서비스 관례: 슬롯 초기화·카드 삭제) [2026-10-18]
     */
    tone?: IconButtonTone;
    shape?: IconButtonShape;
    children: React.ReactNode;
}

const SIZE: Record<IconButtonSize, string> = { xs: 'w-5 h-5', sm: 'w-6 h-6', md: 'w-7 h-7', lg: 'w-8 h-8' };
const SHAPE: Record<IconButtonShape, string> = { md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full' };
const TONE: Record<IconButtonTone, string> = {
    ghost:   'text-slate-500 hover:text-white',
    subtle:  'text-slate-400 hover:text-white hover:bg-slate-700',
    solid:   'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700',
    inherit: 'hover:text-white',
    success: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10',
    danger:  'text-slate-400 hover:text-red-400 hover:bg-red-500/10',
};

/** 아이콘 전용 정사각 버튼 — 2026-10-12 신설(docs/plan/ui-buttons.md 3-2). */
export const IconButton: React.FC<IconButtonProps> = ({
    label, size = 'md', tone = 'ghost', shape = 'lg', className = '', type = 'button', children, ...props
}) => (
    <button
        type={type}
        aria-label={label}
        title={label}
        className={[
            'inline-flex items-center justify-center shrink-0 transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            SIZE[size], SHAPE[shape], TONE[tone], className,
        ].filter(Boolean).join(' ')}
        {...props}
    >
        {children}
    </button>
);
