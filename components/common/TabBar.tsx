
import React from 'react';

interface TabBarProps<T extends string> {
    tabs: { id: T; label: string }[];
    activeTab: T;
    onTabChange: (tab: T) => void;
    /** 탭 버튼 영역 우측 끝에 추가로 배치할 컨텐츠 (예: 저장 버튼) */
    rightSlot?: React.ReactNode;
}

export function TabBar<T extends string>({ tabs, activeTab, onTabChange, rightSlot }: TabBarProps<T>) {
    return (
        <div className="px-8 border-b border-slate-800 bg-slate-950 flex items-center gap-8 h-14 flex-shrink-0">
            {tabs.map(t => (
                <button
                    key={t.id}
                    onClick={() => onTabChange(t.id)}
                    className={`flex items-center transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ko-normal ${
                        activeTab === t.id
                            ? 'text-indigo-400 border-indigo-400'
                            : 'text-slate-500 hover:text-slate-300 border-transparent'
                    }`}
                >
                    {t.label}
                </button>
            ))}
            {rightSlot && <div className="ml-auto flex items-center gap-3">{rightSlot}</div>}
        </div>
    );
}
