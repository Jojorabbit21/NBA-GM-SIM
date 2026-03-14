
import React from 'react';

export type RosterTab = 'roster' | 'records' | 'coaching' | 'draftPicks';

interface RosterTabsProps {
    activeTab: RosterTab;
    onTabChange: (tab: RosterTab) => void;
}

const TABS: { id: RosterTab; label: string }[] = [
    { id: 'roster', label: '로스터' },
    { id: 'records', label: '경기 기록' },
    { id: 'coaching', label: '코칭 스태프' },
    { id: 'draftPicks', label: '드래프트 픽' },
];

export const RosterTabs: React.FC<RosterTabsProps> = ({ activeTab, onTabChange }) => {
    return (
        <div className="px-8 border-b border-slate-800 bg-slate-950 flex items-center h-12 flex-shrink-0">
            <div className="flex items-center gap-8 h-full">
                {TABS.map(t => (
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
            </div>
        </div>
    );
};
