
import React from 'react';

interface TabBarProps<T extends string> {
    tabs: { id: T; label: string; badge?: number }[];
    activeTab: T;
    onTabChange: (tab: T) => void;
    /** 탭 버튼 영역 우측 끝에 추가로 배치할 컨텐츠 (예: 저장 버튼) */
    rightSlot?: React.ReactNode;
    /** 지정 시 팀 테마 색상(헤더와 동일)으로 배경/텍스트를 칠한다 — 미지정이면 기존 slate/indigo 스타일 유지 */
    theme?: { bg: string; text: string; accent: string };
    /** theme 미지정 시 배경색 클래스 오버라이드 (기본값 bg-slate-950) */
    bgClassName?: string;
}

export function TabBar<T extends string>({ tabs, activeTab, onTabChange, rightSlot, theme, bgClassName }: TabBarProps<T>) {
    return (
        <div
            className={`px-8 border-b flex items-center gap-8 h-14 flex-shrink-0 ${theme ? 'border-black/20' : `border-slate-800 ${bgClassName ?? 'bg-slate-950'}`}`}
            style={theme ? { backgroundColor: theme.bg } : undefined}
        >
            {tabs.map(t => {
                const isActive = activeTab === t.id;
                return (
                    <button
                        key={t.id}
                        onClick={() => onTabChange(t.id)}
                        className={`flex items-center transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ko-normal ${
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
                        <span className="relative">
                            {t.label}
                            {/* [2026-08-31] 사이드바 NavItem 배지와 동일한 스타일(bg-red-500, 9+ 캡) —
                                미확인 항목이 있는 탭에 표시. */}
                            {!!t.badge && (
                                <span className="absolute -top-2 -right-3 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold normal-case">
                                    {t.badge > 9 ? '9+' : t.badge}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
            {rightSlot && <div className="ml-auto flex items-center gap-3">{rightSlot}</div>}
        </div>
    );
}
