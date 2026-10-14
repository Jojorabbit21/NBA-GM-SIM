import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    /** 본문 1줄 — 14px slate-500 */
    title: React.ReactNode;
    /** 보조 1줄 — 12px slate-600 */
    subtitle?: React.ReactNode;
    /** 화면 단위 빈 상태에만 — 32px slate-700. 목록/패널 빈 상태엔 쓰지 않는다 */
    icon?: LucideIcon;
    /** 복구 동선이 있을 때만(필터 초기화 등). `Button variant="secondary" size="sm"` 권장 */
    action?: React.ReactNode;
    /** 좁은 패널은 'sm'(세로 28px) — 기본 40px */
    padding?: 'md' | 'sm';
    className?: string;
}

/**
 * 빈 상태 — 2026-10-13 신설(docs/plan/ui-consolidation.md 7장 8번).
 * "…없습니다" 문장 30곳이 글자 크기 3종·색 4종·패딩 7종으로 흩어져 있던 것을 text / icon 두 변형으로 고정.
 * 점선 박스(뎁스차트 빈 슬롯 등)는 드롭 대상 UI라 여기 범위가 아니다. 표 본문이 비었을 땐 `TableEmptyRow`.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle, icon: Icon, action, padding = 'md', className = '' }) => (
    <div className={`flex flex-col items-center justify-center text-center gap-1.5 px-4 ${padding === 'sm' ? 'py-7' : 'py-10'} ${className}`}>
        {Icon && <Icon size={32} strokeWidth={1.75} className="text-slate-700 mb-1.5" />}
        <p className="text-sm font-medium text-slate-500 ko-normal">{title}</p>
        {subtitle && <p className="text-xs text-slate-600 ko-normal">{subtitle}</p>}
        {action && <div className="mt-2">{action}</div>}
    </div>
);

interface TableEmptyRowProps {
    colSpan: number;
    children: React.ReactNode;
    subtitle?: React.ReactNode;
}

/** 표 본문이 비었을 때의 한 행 — `<tbody>` 안에서 `<TableEmptyRow colSpan={7}>기록이 없습니다.</TableEmptyRow>` */
export const TableEmptyRow: React.FC<TableEmptyRowProps> = ({ colSpan, children, subtitle }) => (
    <tr>
        <td colSpan={colSpan} className="!p-0 !border-r-0">
            <EmptyState title={children} subtitle={subtitle} padding="sm" />
        </td>
    </tr>
);
