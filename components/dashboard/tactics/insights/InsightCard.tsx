// InsightCard.tsx — 전술 인사이트 탭 위젯 공통 카드(직각, `bg-slate-900/40 border-slate-800`). [2026-10-13]
// 7개 위젯이 컨테이너·헤더 바·빈 상태를 각자 복붙하던 것(docs/plan/ui-audit/09-tactics.md 후보 3).
// 헤더 제목은 text-sm 일반 굵기 흰색으로 통일(시즌 경기 로그만 font-black이던 불일치 해소).
import React from 'react';

interface InsightCardProps {
    title?: React.ReactNode;
    /** 제목 왼쪽/오른쪽 슬롯(페이저 쉐브론 등). 하나라도 있으면 헤더가 justify-between */
    headerLeft?: React.ReactNode;
    headerRight?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}

export const InsightCard: React.FC<InsightCardProps> = ({ title, headerLeft, headerRight, className = '', children }) => {
    const hasHeader = title != null || headerLeft != null || headerRight != null;
    return (
        <div className={`w-full bg-slate-900/40 border border-slate-800 overflow-hidden ${className}`}>
            {hasHeader && (
                <div className={`px-3 py-2 border-b border-slate-800 flex items-center ${headerLeft || headerRight ? 'justify-between' : ''}`}>
                    {headerLeft}
                    {title != null && <h4 className="text-sm font-normal text-white">{title}</h4>}
                    {headerRight}
                </div>
            )}
            {children}
        </div>
    );
};
