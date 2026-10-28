
import React, { useEffect, useRef } from 'react';
import { CountBadge } from './CountBadge';
import { StatusDot } from './StatusDot';
import type { InlineNoticeTone } from './InlineNotice';

interface TabBarProps<T extends string> {
    tabs: {
        id: T;
        label: string;
        badge?: number;
        /** [2026-10-13] 라벨 오른쪽 16px 상태 점(StatusDot sm) — 탭 단위 "항목별 상태"(미저장 등)에만.
         *  액션 실패의 1차 표시로는 쓰지 않는다(그건 탭 바 아래 InlineNotice). */
        dot?: { tone: InlineNoticeTone; label: string };
    }[];
    activeTab: T;
    onTabChange: (tab: T) => void;
    /** 탭 버튼 영역 우측 끝에 추가로 배치할 컨텐츠 (예: 저장 버튼) */
    rightSlot?: React.ReactNode;
    /** 지정 시 팀 테마 색상(헤더와 동일)으로 배경/텍스트를 칠한다 — 미지정이면 기존 slate/indigo 스타일 유지 */
    theme?: { bg: string; text: string; accent: string };
    /** theme 미지정 시 배경색 클래스 오버라이드 (기본값 bg-slate-950) */
    bgClassName?: string;
    /** [2026-10-23] 탭 버튼 정렬 — 기본 start(좌측). center면 탭 묶음을 바 가운데에 둔다(라이브 경기 화면). rightSlot은 그대로 우측 끝 */
    align?: 'start' | 'center';
    /** [2026-10-27] 폰(<768) 치수 — h-11 px-4 gap-5, 넘치면 가로 스크롤(스크롤바 숨김). 데스크톱 기본값 불변(§8-5). */
    compact?: boolean;
}

export function TabBar<T extends string>({ tabs, activeTab, onTabChange, rightSlot, theme, bgClassName, align = 'start', compact = false }: TabBarProps<T>) {
    // [2026-10-28] compact(폰 가로 스크롤) — 활성 탭이 보이는 범위 밖이면 그 탭까지 가로로만 스크롤(세로 스크롤 영향 없음)
    const barRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!compact) return;
        const bar = barRef.current;
        const el = bar?.querySelector<HTMLElement>('[data-active="true"]');
        if (!bar || !el) return;
        const left = el.offsetLeft - 16, right = el.offsetLeft + el.offsetWidth + 16;
        if (left < bar.scrollLeft) bar.scrollTo({ left, behavior: 'smooth' });
        else if (right > bar.scrollLeft + bar.clientWidth) bar.scrollTo({ left: right - bar.clientWidth, behavior: 'smooth' });
    }, [compact, activeTab]);
    return (
        <div
            ref={barRef}
            className={`${compact ? 'px-4 gap-5 h-11 overflow-x-auto [scrollbar-width:none]' : 'px-8 gap-8 h-14'} border-b flex items-center flex-shrink-0 ${align === 'center' ? 'justify-center relative' : ''} ${theme ? 'border-black/20' : `border-slate-800 ${bgClassName ?? 'bg-slate-950'}`}`}
            style={theme ? { backgroundColor: theme.bg } : undefined}
        >
            {tabs.map(t => {
                const isActive = activeTab === t.id;
                return (
                    <button
                        key={t.id}
                        data-active={isActive ? 'true' : undefined}
                        onClick={() => onTabChange(t.id)}
                        className={`flex items-center transition-all h-full border-b-2 font-black tracking-tight text-sm ko-normal ${compact ? 'shrink-0 whitespace-nowrap' : ''} ${
                            theme
                                ? isActive ? '' : 'hover:opacity-100'
                                : isActive ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'
                        }`}
                        style={theme ? {
                            color: theme.text,
                            opacity: isActive ? 1 : 0.6,
                            borderColor: isActive ? theme.accent : 'transparent',
                        } : undefined}
                    >
                        <span className="relative inline-flex items-center">
                            {t.label}
                            {t.dot && <StatusDot size="sm" tone={t.dot.tone} label={t.dot.label} className="ml-1.5" />}
                            {/* 미확인 항목이 있는 탭에 표시 — 사이드바 NavItem과 같은 공용 CountBadge. */}
                            <CountBadge count={t.badge} className="absolute -top-2 -right-3" />
                        </span>
                    </button>
                );
            })}
            {/* center 정렬일 땐 ml-auto가 justify-center를 이겨 탭이 왼쪽으로 쏠리므로 rightSlot을 절대 배치로 뺀다 */}
            {rightSlot && <div className={align === 'center' ? 'absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-3' : 'ml-auto flex items-center gap-3'}>{rightSlot}</div>}
        </div>
    );
}
