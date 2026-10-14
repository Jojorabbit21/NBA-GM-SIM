import React from 'react';

interface KeyValueRowProps {
    label: React.ReactNode;
    children: React.ReactNode;
    /** 숫자·금액 값이면 tabular-nums */
    numeric?: boolean;
    /** 값 글자 톤 — 기본 white(강조). muted는 slate-300. none은 색 클래스를 안 붙임(valueClassName으로 직접 지정) */
    tone?: 'default' | 'muted' | 'none';
    /** 행 세로 패딩 — 협상/방출 kv 행은 없음(none), 로비 InfoRow는 py-2 */
    padding?: 'none' | 'xs' | 'sm';
    /** 라벨 왼쪽 아이콘 등 */
    labelPrefix?: React.ReactNode;
    className?: string;
    valueClassName?: string;
    /** 라벨 span 추가 클래스 (예: 합계 행의 font-semibold) */
    labelClassName?: string;
}

const PAD = { none: '', xs: 'py-0.5', sm: 'py-2' } as const;

/**
 * 키-값 한 줄 — 2026-10-13 신설(docs/plan/ui-consolidation.md 6장 3번).
 * 협상 19곳·방출 17곳·로비 InfoRow 11곳이 `flex justify-between items-center text-sm` + 라벨 slate-400 + 값 흰색을 복붙하던 것.
 * 좌: 라벨(slate-400) / 우: 값(흰색 semibold). 값이 링크면 children에 ClickableText/Button link를 넣는다.
 */
export const KeyValueRow: React.FC<KeyValueRowProps> = ({
    label, children, numeric = false, tone = 'default', padding = 'none', labelPrefix, className = '', valueClassName = '', labelClassName = '',
}) => (
    <div className={`flex justify-between items-center gap-3 text-sm ${PAD[padding]} ${className}`}>
        <span className={`flex items-center gap-1.5 text-slate-400 ko-normal min-w-0 ${labelClassName}`}>{labelPrefix}{label}</span>
        <span className={`font-semibold text-right ${tone === 'muted' ? 'text-slate-300' : tone === 'none' ? '' : 'text-white'} ${numeric ? 'tabular-nums' : ''} ${valueClassName}`}>
            {children}
        </span>
    </div>
);
