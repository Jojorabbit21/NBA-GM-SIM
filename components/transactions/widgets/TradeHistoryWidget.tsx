
import React, { useMemo } from 'react';
import { History, ChevronRight, ArrowRightLeft } from 'lucide-react';
import { Transaction, Team } from '../../../types';
import { OvrBadge } from '../../common/OvrBadge';
import { TeamLogo } from '../../common/TeamLogo';
import { calculatePlayerOvr } from '../../../utils/constants';

interface TradeHistoryWidgetProps {
    transactions: Transaction[];
    teamId: string;
    teams: Team[];
    currentSimDate: string;
    /** 최대 표시 건수 (기본 5) */
    maxItems?: number;
    /** 내 팀만 필터링 여부 (기본 false = 전체) */
    myTeamOnly?: boolean;
    /** 전체 탭 뷰로 이동 */
    onOpenFullView?: () => void;
}

export const TradeHistoryWidget: React.FC<TradeHistoryWidgetProps> = ({
    transactions,
    teamId,
    teams,
    currentSimDate,
    maxItems = 5,
    myTeamOnly = false,
    onOpenFullView,
}) => {
    const recentTrades = useMemo(() => {
        const trades = transactions.filter(t => t.type === 'Trade');
        if (myTeamOnly) {
            return trades.filter(t =>
                t.teamId === teamId || t.details?.partnerTeamId === teamId
            );
        }
        return trades;
    }, [transactions, teamId, myTeamOnly]);

    const displayTrades = recentTrades.slice(0, maxItems);

    const getSnapshot = (id: string, savedOvr?: number) => {
        for (const t of teams) {
            const p = t.roster.find(rp => rp.id === id);
            if (p) return calculatePlayerOvr(p);
        }
        return savedOvr ?? 0;
    };

    const formatDate = (d: string) => {
        if (d === 'TODAY') d = currentSimDate;
        const dt = new Date(d.slice(0, 10) + 'T00:00:00');
        return `${dt.getMonth() + 1}/${dt.getDate()}`;
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-slate-800/80 border-b border-slate-700/50">
                <div className="flex items-center gap-2">
                    <History size={13} className="text-slate-400" />
                    <span className="text-sm font-bold text-white">트레이드 이력</span>
                    {recentTrades.length > 0 && (
                        <span className="text-[10px] font-bold text-slate-500">{recentTrades.length}건</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {onOpenFullView && (
                        <button
                            onClick={onOpenFullView}
                            className="flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                        >
                            전체 보기 <ChevronRight size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* 이력 리스트 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {displayTrades.length === 0 ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2">
                        <History size={24} className="text-slate-700" />
                        <p className="text-[10px] font-black text-slate-500 uppercase">트레이드 기록 없음</p>
                        <p className="text-[10px] text-slate-600 text-center">
                            {myTeamOnly ? '내 팀의 트레이드가 없습니다' : '아직 진행된 트레이드가 없습니다'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-800/50">
                        {displayTrades.map(t => {
                            if (!t) return null;

                            const team1 = teams.find(it => it.id === t.teamId);
                            const partnerTeamId = t.details?.partnerTeamId || t.details?.counterpartTeamId;
                            const team2 = teams.find(pt => pt.id === partnerTeamId);

                            const team1Name = team1?.name ?? t.teamId;
                            const team2Name = team2?.name ?? t.details?.partnerTeamName ?? 'Unknown';

                            const inboundPlayers = t.details?.acquired
                                ?? (t.details?.players?.received ?? []).map((p: any) => ({
                                    id: p.playerId, name: p.playerName, ovr: undefined,
                                }));
                            const outboundPlayers = t.details?.traded
                                ?? (t.details?.players?.sent ?? []).map((p: any) => ({
                                    id: p.playerId, name: p.playerName, ovr: undefined,
                                }));

                            const isMyTeamTrade = t.teamId === teamId || partnerTeamId === teamId;

                            return (
                                <div
                                    key={t.id ?? Math.random()}
                                    className={`px-3 py-2 transition-colors hover:bg-white/5 ${isMyTeamTrade ? 'border-l-2 border-indigo-500/50' : ''}`}
                                >
                                    {/* 팀 행 */}
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <span className="text-[10px] font-mono text-slate-500 w-8 shrink-0">
                                            {formatDate(t.date)}
                                        </span>
                                        <TeamLogo teamId={t.teamId} size="xs" />
                                        <span className={`text-[10px] font-black uppercase ${t.teamId === teamId ? 'text-indigo-400' : 'text-slate-300'}`}>
                                            {team1Name}
                                        </span>
                                        <ArrowRightLeft size={9} className="text-slate-600 flex-shrink-0 mx-0.5" />
                                        <TeamLogo teamId={partnerTeamId ?? ''} size="xs" />
                                        <span className={`text-[10px] font-black uppercase ${partnerTeamId === teamId ? 'text-indigo-400' : 'text-slate-300'}`}>
                                            {team2Name}
                                        </span>
                                    </div>

                                    {/* 선수 행 */}
                                    <div className="ml-8 flex gap-3">
                                        {/* IN */}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[9px] font-black uppercase text-emerald-500/70 mb-0.5">IN</div>
                                            <div className="flex flex-col gap-0.5">
                                                {(inboundPlayers ?? []).slice(0, 3).map((p: any, i: number) => {
                                                    const ovr = getSnapshot(p.id, p.ovr);
                                                    return (
                                                        <div key={i} className="flex items-center gap-1">
                                                            <OvrBadge value={ovr || 70} size="sm" />
                                                            <span className="text-[10px] font-bold text-emerald-300/80 truncate">{p.name}</span>
                                                        </div>
                                                    );
                                                })}
                                                {(inboundPlayers ?? []).length === 0 && (
                                                    <span className="text-[10px] text-slate-600 italic">-</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* OUT */}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[9px] font-black uppercase text-red-500/70 mb-0.5">OUT</div>
                                            <div className="flex flex-col gap-0.5">
                                                {(outboundPlayers ?? []).slice(0, 3).map((p: any, i: number) => {
                                                    const ovr = getSnapshot(p.id, p.ovr);
                                                    return (
                                                        <div key={i} className="flex items-center gap-1">
                                                            <OvrBadge value={ovr || 70} size="sm" />
                                                            <span className="text-[10px] font-bold text-red-300/70 truncate">{p.name}</span>
                                                        </div>
                                                    );
                                                })}
                                                {(outboundPlayers ?? []).length === 0 && (
                                                    <span className="text-[10px] text-slate-600 italic">-</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {recentTrades.length > maxItems && onOpenFullView && (
                            <button
                                onClick={onOpenFullView}
                                className="w-full py-2 text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors text-center"
                            >
                                + {recentTrades.length - maxItems}건 더 보기
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
