
import React from 'react';

type RosterTab = 'roster' | 'records';

interface RosterTabsProps {
    activeTab: RosterTab;
    onTabChange: (tab: RosterTab) => void;
}

export const RosterTabs: React.FC<RosterTabsProps> = ({ activeTab, onTabChange }) => {
    const tabs = [
        { id: 'roster', label: '능력치' },
        { id: 'records', label: '경기 기록' },
    ];

    return (
        <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-800 w-fit shadow-sm">
            {tabs.map((t) => (
                <button
                    key={t.id}
                    onClick={() => onTabChange(t.id as any)}
                    className={`
                        px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all
                        ${activeTab === t.id
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-300'}
                    `}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
};
