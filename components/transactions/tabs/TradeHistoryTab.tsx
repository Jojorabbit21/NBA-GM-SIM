
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
            <div className="flex-1 bg-slate-900/40 overflow-hidden">
                <TradeHistoryTable
                    transactions={filteredTransactions}
                    historyFilter={historyFilter}
                    onFilterChange={setHistoryFilter}
                    teamId={teamId}
                    teams={teams}
                    currentSimDate={currentSimDate}
                />
            </div>
        </div>
    );
};
