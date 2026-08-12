
import React from 'react';

interface TabBarProps<T extends string> {
    tabs: { id: T; label: string }[];
    activeTab: T;
    onTabChange: (tab: T) => void;
    /** 탭 버튼 영역 우측 끝에 추가로 배치할 컨텐츠 (예: 저장 버튼) */
    rightSlot?: React.ReactNode;
    /** 지정 시 팀 테마 색상(헤더와 동일)으로 배경/텍스트를 칠한다 — 미지정이면 기존 slate/indigo 스타일 유지 */
    theme?: { bg: string; text: string; accent: string };
}

export function TabBar<T extends string>({ tabs, activeTab, onTabChange, rightSlot, theme }: TabBarProps<T>) {
    return (
        <div
            className={`px-8 border-b flex items-center gap-8 h-14 flex-shrink-0 ${theme ? 'border-black/20' : 'border-slate-800 bg-slate-950'}`}
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
                        {t.label}
                    </button>
                );
            })}
            {rightSlot && <div className="ml-auto flex items-center gap-3">{rightSlot}</div>}
        </div>
    );
}
