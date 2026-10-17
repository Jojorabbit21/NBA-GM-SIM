// CountBadge.tsx — 읽지 않음/대기 건수 빨간 원형 배지. [2026-10-13]
// 사이드바 NavItem·헤더 메뉴 항목·헤더 "리그" 탭·TabBar 탭이 같은 `rounded-full bg-red-500 text-white text-[8px]` 블록을
// 각자 들고 있던 것(ui-audit/10 후보 4). 0이면 아무것도 그리지 않고, 10 이상은 "9+".
import React from 'react';

interface CountBadgeProps {
    count: number | undefined | null;
    /** sm = 14px(text-[8px], 사이드바·탭 모서리) / md = 16px(text-[9px], 메뉴 항목 옆 인라인) / lg = 20px(text-[11px], 채팅 FAB처럼 눈에 띄어야 하는 단독 배지) */
    size?: 'sm' | 'md' | 'lg';
    /** 모서리에 띄울 때 `absolute -top-2 -right-3` 같은 위치 클래스를 넘긴다 */
    className?: string;
}

const SIZE = {
    sm: 'w-3.5 h-3.5 text-[8px]',
    md: 'w-4 h-4 text-[9px]',
    lg: 'w-5 h-5 text-[11px]',
} as const;

export const CountBadge: React.FC<CountBadgeProps> = ({ count, size = 'sm', className = '' }) => {
    if (!count || count <= 0) return null;
    return (
        <span className={`flex items-center justify-center rounded-full bg-red-500 text-white font-bold shrink-0 ${SIZE[size]} ${className}`}>
            {count > 9 ? '9+' : count}
        </span>
    );
};
