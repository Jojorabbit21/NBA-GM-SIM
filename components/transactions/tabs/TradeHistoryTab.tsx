
import React, { useState, useMemo } from 'react';
import { Transaction, Team } from '../../../types';
import { TradeHistoryTable } from '../TradeHistoryTable';

interface TradeHistoryTabProps {
    transactions: Transaction[];
    teamId: string;
    teams: Team[];
    currentSimDate: string;
}

export const TradeHistoryTab: React.FC<TradeHistoryTabProps> = ({
    transactions,
    teamId,
    teams,
    currentSimDate
}) => {
    const [historyFilter, setHistoryFilter] = useState<'all' | 'mine'>('all');

    const filteredTransactions = useMemo(() => {
        // 1. Filter by Type 'Trade'
        const trades = transactions.filter(t => t.type === 'Trade');
        
        // 2. Filter by User selection
        if (historyFilter === 'mine') {
            return trades.filter(t => t.teamId === teamId || t.details?.partnerTeamId === teamId);
        }
        return trades;
    }, [transactions, historyFilter, teamId]);

    return (
        <div className="h-full flex flex-col">
            {/* Filter Toolbar */}
            <div className="px-8 py-4 border-b border-slate-800 bg-slate-900/50 flex justify-end flex-shrink-0">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button 
                        onClick={() => setHistoryFilter('all')} 
                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${historyFilter === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        전체 리그
                    </button>
                    <button 
                        onClick={() => setHistoryFilter('mine')} 
                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${historyFilter === 'mine' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        내 팀
                    </button>
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 bg-slate-950/30 overflow-hidden">
                <TradeHistoryTable 
                    transactions={filteredTransactions} 
                    historyFilter={historyFilter} 
                    teamId={teamId} 
                    teams={teams}
                    currentSimDate={currentSimDate}
                />
            </div>
        </div>
    );
};
