// MobilePushHeader.tsx — 폰 2단계(push) 화면 상단 헤더 H4. [2026-10-27 뉴스피드 폰판]
// docs/ui/mobile-design-system.md §8-3 H4: 안전영역 + 56, 좌 뒤로 44(가장자리 4px), 가운데 제목(텍스트 또는 마스트헤드 같은 노드), 우측 액션 ≤2.
// 공용 상단 바(MobileTopBar, 시즌 정보)를 대신하므로 레이아웃(MultiSeasonLayout)이 이 헤더를 쓰는 라우트에선 상단 바를 생략해야 한다.
import React from 'react';
import { ChevronLeft } from 'lucide-react';

interface MobilePushHeaderProps {
    /** 제목 — 문자열이면 18/700 1줄 말줄임, 노드면 그대로(예: 뉴스피드 BrandMark) */
    title: React.ReactNode;
    onBack: () => void;
    /** 우측 액션(44×44 버튼 ≤2) */
    actions?: React.ReactNode;
    /** 헤더 전체를 다른 내용으로 바꿀 때(검색 활성 H6) — title/onBack/actions 대신 이 노드만 그린다 */
    replace?: React.ReactNode;
}

export const MobilePushHeader: React.FC<MobilePushHeaderProps> = ({ title, onBack, actions, replace }) => (
    <header className="shrink-0 pt-safe bg-slate-950 border-b border-slate-800 z-header relative">
        <div className="h-14 flex items-center gap-1 pl-1 pr-2">
            {replace ?? (
                <>
                    <button type="button" onClick={onBack} aria-label="뒤로" className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-slate-200 active:bg-white/10">
                        <ChevronLeft size={24} strokeWidth={2} />
                    </button>
                    <div className="flex-1 min-w-0 flex items-center">
                        {typeof title === 'string'
                            ? <h1 className="text-lg font-bold text-white truncate ko-tight">{title}</h1>
                            : title}
                    </div>
                    {actions}
                </>
            )}
        </div>
    </header>
);

/** 헤더 우측 아이콘 버튼 44 — `dot`이면 우상단 indigo 점(필터가 기본값이 아닐 때) */
export const MobilePushHeaderButton: React.FC<{ label: string; onClick: () => void; dot?: boolean; children: React.ReactNode }> = ({ label, onClick, dot = false, children }) => (
    <button type="button" onClick={onClick} aria-label={label} className="relative w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-slate-200 active:bg-white/10">
        {children}
        {dot && <span aria-hidden="true" className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-slate-950" />}
    </button>
);
