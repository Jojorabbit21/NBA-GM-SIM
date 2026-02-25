
import React from 'react';

type RosterTab = 'roster' | 'stats' | 'shooting';

interface RosterTabsProps {
    activeTab: RosterTab;
    onTabChange: (tab: RosterTab) => void;
}

export const RosterTabs: React.FC<RosterTabsProps> = ({ activeTab, onTabChange }) => {
    const tabs = [
        { id: 'roster', label: '능력치' },
        { id: 'stats', label: '기록' },
        { id: 'shooting', label: '슈팅' },
    ];

    return (
        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800 w-fit shadow-sm">
            {tabs.map((t) => (
                <button
                    key={t.id}
                    onClick={() => onTabChange(t.id as any)}
                    className={`
                        px-6 py-1.5 rounded-md text-xs font-black uppercase tracking-widest transition-all duration-300
                        ${activeTab === t.id 
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-500/50' 
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}
                    `}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
};
