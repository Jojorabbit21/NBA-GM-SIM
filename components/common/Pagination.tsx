import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './IconButton';

/** 1 … (현재±2) … 마지막 — 7페이지 이하면 전부 표시 */
export function getPageNumbers(page: number, totalPages: number): (number | '...')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const left = Math.max(2, page - 2);
    const right = Math.min(totalPages - 1, page + 2);
    const pages: (number | '...')[] = [1];
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
}

export const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 75, 100];

interface PaginationProps {
    page: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    /** 없으면 "페이지 당" 셀렉트를 숨긴다 */
    onPageSizeChange?: (size: number) => void;
    pageSizeOptions?: number[];
    /** 좌측 "총 N명 중 a–b"의 단위 */
    unit?: string;
    className?: string;
    /** [2026-10-28] 폰 — 한 줄(범위 텍스트 · ‹ · 번호 최대 5 · ›), 페이지 당 셀렉트 없음(필터 시트에서) */
    compact?: boolean;
}

/**
 * 표 하단 페이지네이션 푸터 — 2026-10-12 신설(docs/plan/ui-buttons.md 3-4).
 * 리더보드·FA·드래프트 풀이 각자 복제하던 getPageNumbers + 푸터 마크업을 하나로 합쳤다.
 * 좌: 범위 텍스트 / 중앙(절대 위치): 이전·번호·다음 / 우: 페이지 당 셀렉트.
 */
export const Pagination: React.FC<PaginationProps> = ({
    page, pageSize, totalItems, onPageChange, onPageSizeChange,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS, unit = '명', className = '', compact = false,
}) => {
    const totalPages = Math.ceil(totalItems / pageSize);
    const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, totalItems);

    if (compact) {
        // 번호는 최대 5칸: 4페이지 이하 전부 / 앞쪽 1 2 3 ·· N / 그 외 1 ·· p ·· N
        const nums: (number | '...')[] = totalPages <= 4
            ? Array.from({ length: totalPages }, (_, i) => i + 1)
            : page <= 3 ? [1, 2, 3, '...', totalPages]
            : page >= totalPages - 2 ? [1, '...', totalPages - 2, totalPages - 1, totalPages]
            : [1, '...', page, '...', totalPages];
        return (
            <div className={`flex items-center gap-1.5 px-4 h-12 bg-slate-950 border-t border-slate-800 flex-shrink-0 ${className}`}>
                <div className="flex-1 min-w-0 text-sm font-semibold text-slate-500 tabular-nums truncate">총 {totalItems}{unit} 중 {from}–{to}</div>
                <IconButton label="이전 페이지" size="sm" tone="subtle" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}><ChevronLeft size={14} /></IconButton>
                {nums.map((p, idx) =>
                    p === '...'
                        ? <span key={`e${idx}`} className="w-7 text-center text-sm text-slate-600 font-semibold select-none">··</span>
                        : <button key={p} type="button" aria-current={page === p ? 'page' : undefined} onClick={() => onPageChange(p)}
                            className={`w-7 h-7 text-sm font-semibold rounded-lg tabular-nums ${page === p ? 'bg-indigo-600 text-white' : 'text-indigo-400 active:bg-slate-800'}`}>{p}</button>
                )}
                <IconButton label="다음 페이지" size="sm" tone="subtle" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}><ChevronRight size={14} /></IconButton>
            </div>
        );
    }

    return (
        <div className={`relative flex items-center px-6 py-3 bg-slate-950 border-t border-slate-800 flex-shrink-0 z-50 ${className}`}>
            <div className="text-sm font-semibold text-slate-500 w-48 tabular-nums">
                총 {totalItems}{unit} 중 {from}–{to}
            </div>

            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
                <IconButton label="이전 페이지" size="sm" tone="subtle" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
                    <ChevronLeft size={14} />
                </IconButton>

                {getPageNumbers(page, totalPages).map((p, idx) =>
                    p === '...'
                        ? <span key={`ellipsis-${idx}`} className="w-7 text-center text-sm text-slate-600 font-semibold select-none">··</span>
                        : <button
                            key={p}
                            type="button"
                            aria-current={page === p ? 'page' : undefined}
                            onClick={() => onPageChange(p)}
                            className={`w-7 h-7 text-sm font-semibold rounded-lg transition-colors tabular-nums ${
                                page === p ? 'bg-indigo-600 text-white' : 'text-indigo-400 hover:bg-slate-800 hover:text-indigo-300'
                            }`}
                        >
                            {p}
                        </button>
                )}

                <IconButton label="다음 페이지" size="sm" tone="subtle" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
                    <ChevronRight size={14} />
                </IconButton>
            </div>

            {onPageSizeChange && (
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-500">페이지 당</span>
                    <select
                        value={pageSize}
                        onChange={e => onPageSizeChange(Number(e.target.value))}
                        className="bg-slate-800 border border-slate-700 text-slate-300 text-sm font-semibold rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                        {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
            )}
        </div>
    );
};
