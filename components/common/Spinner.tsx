import React from 'react';
import { Loader2 } from 'lucide-react';

export type SpinnerVariant = 'page' | 'section' | 'inline';

interface SpinnerProps {
    /**
     * page    = 화면/열 전체 로딩 — 부모의 남은 높이를 채우고 정중앙(28px). `min-h-screen`을 쓰지 않는다
     *           (사이드바·헤더 아래 본문이 min-h-screen이면 세로 스크롤이 생김).
     * section = 패널·모달 목록 로딩 — 세로 40px 패딩, 정중앙(20px)
     * inline  = 셀·칩·헤더 옆 상태(14px) + 선택적 라벨("불러오는 중…")
     */
    variant?: SpinnerVariant;
    /** inline 전용 — 스피너 오른쪽 12px 라벨 */
    label?: React.ReactNode;
    className?: string;
}

const SIZE: Record<SpinnerVariant, number> = { page: 28, section: 20, inline: 14 };
const WRAP: Record<SpinnerVariant, string> = {
    // h-full: 부모가 flex가 아닌 라우트 컨테이너(flex-1 overflow-y-auto div)여도 남은 높이를 채운다
    page:    'h-full flex-1 min-h-0 flex items-center justify-center',
    section: 'py-10 flex items-center justify-center',
    inline:  'inline-flex items-center gap-1.5 text-xs text-slate-500',
};

/**
 * 로딩 스피너 — 2026-10-13 신설(docs/plan/ui-consolidation.md 7장 8번).
 * 멀티 세션에서 `<Loader2 className="animate-spin">`을 71곳이 크기 11종·컨테이너 7종으로 직접 쓰던 것을 자리 3종으로 고정.
 * 버튼 안 로딩은 이 컴포넌트가 아니라 `Button isLoading`을 쓴다. 색은 전부 indigo-400.
 */
export const Spinner: React.FC<SpinnerProps> = ({ variant = 'section', label, className = '' }) => (
    <div role="status" aria-live="polite" className={`${WRAP[variant]} ${className}`}>
        <Loader2 size={SIZE[variant]} className="animate-spin text-indigo-400 shrink-0" />
        {variant === 'inline' && label ? <span className="ko-normal">{label}</span> : null}
        <span className="sr-only">불러오는 중</span>
    </div>
);
