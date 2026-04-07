
import React from 'react';
import { Clock, Check, X } from 'lucide-react';
import { Team, Player } from '../../types';
import { PersistentTradeOffer } from '../../types/trade';
import { TeamLogo } from '../common/TeamLogo';
import { OvrBadge } from '../common/OvrBadge';
import { calculatePlayerOvr } from '../../utils/constants';
import { formatMoney } from '../../utils/formatMoney';

interface OutgoingOffersPanelProps {
    teams: Team[];
    outgoingOffers: PersistentTradeOffer[];
    handleViewPlayer: (p: Player) => void;
    currentSimDate: string;
}

function findPlayer(playerId: string, teams: Team[]): Player | undefined {
    for (const t of teams) {
        const p = t.roster.find(r => r.id === playerId);
        if (p) return p;
    }
    return undefined;
}

export const OutgoingOffersPanel: React.FC<OutgoingOffersPanelProps> = ({
    teams,
    outgoingOffers,
    handleViewPlayer,
    currentSimDate,
}) => {
    const [collapsed, setCollapsed] = React.useState(false);
    const pendingOutgoing = outgoingOffers.filter(o => o.status === 'pending');
    const respondedOutgoing = outgoingOffers.filter(o => o.status !== 'pending');

    if (pendingOutgoing.length === 0 && respondedOutgoing.length === 0) return null;

    return (
        <div className="border-t border-slate-700">
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full px-6 py-2.5 bg-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-800/80"
            >
                <span className="text-xs font-bold uppercase text-slate-500">
                    발신 오퍼 ({pendingOutgoing.length + respondedOutgoing.length})
                </span>
                <span className="text-[10px] font-bold text-slate-500">
                    {collapsed ? '펼치기' : '접기'}
                </span>
            </button>
            {!collapsed && (
                <div className="p-4 space-y-6">
                    {/* Pending Outgoing */}
                    {pendingOutgoing.length > 0 && (
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">
                                발신 대기 ({pendingOutgoing.length})
                            </h4>
                            <div className="space-y-3">
                                {pendingOutgoing.map(o => renderOutgoingCard(o, teams, currentSimDate, handleViewPlayer))}
                            </div>
                        </div>
                    )}

                    {/* Responded */}
                    {respondedOutgoing.length > 0 && (
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">
                                처리 완료
                            </h4>
                            <div className="space-y-3 opacity-60">
                                {respondedOutgoing.slice(0, 10).map(o => renderOutgoingCard(o, teams, currentSimDate, handleViewPlayer))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

function renderOutgoingCard(
    offer: PersistentTradeOffer,
    teams: Team[],
    currentSimDate: string,
    handleViewPlayer: (p: Player) => void,
) {
    const otherTeam = teams.find(t => t.id === offer.toTeamId);

    const daysLeft = Math.max(0, Math.ceil(
        (new Date(offer.expiresDate).getTime() - new Date(currentSimDate).getTime()) / (1000 * 60 * 60 * 24)
    ));

    return (
        <div key={offer.id} className="rounded-2xl border border-slate-700/50 bg-slate-900 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 bg-slate-950/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <TeamLogo teamId={offer.toTeamId} size="sm" />
                    <span className="text-sm font-black uppercase tracking-tight text-white">
                        {otherTeam?.name ?? offer.toTeamId}
                    </span>
                    {offer.status === 'pending' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400">
                            <Clock size={10} /> {daysLeft}일 남음
                        </span>
                    )}
                    {offer.status === 'accepted' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">수락됨</span>
                    )}
                    {offer.status === 'rejected' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/10 text-red-400 border border-red-500/30">거절됨</span>
                    )}
                    {offer.status === 'expired' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-slate-600/30 text-slate-500 border border-slate-600/50">만료됨</span>
                    )}
                </div>
            </div>

            {/* Body — Two Columns */}
            <div className="grid grid-cols-2 divide-x divide-slate-800/50">
                {/* Sent */}
                <div>
                    <div className="px-4 py-2 bg-slate-800/30 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                        보낸 자산
                    </div>
                    <div className="divide-y divide-slate-800/30">
                        {offer.offeredPlayers.map(ref => {
                            const p = findPlayer(ref.playerId, teams);
                            if (!p) return (
                                <div key={ref.playerId} className="px-4 py-2 text-xs text-slate-500">{ref.playerName}</div>
                            );
                            return (
                                <div key={p.id} className="flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors">
                                    <OvrBadge value={calculatePlayerOvr(p)} size="sm" />
                                    <span
                                        className="text-xs font-bold text-slate-200 truncate hover:text-indigo-400 cursor-pointer"
                                        onClick={() => handleViewPlayer(p)}
                                    >
                                        {p.name}
                                    </span>
                                    <span className="text-[10px] text-slate-500 ml-auto">{formatMoney(p.salary)}</span>
                                </div>
                            );
                        })}
                        {offer.offeredPicks.map(pick => (
                            <div key={`${pick.season}-${pick.round}-${pick.originalTeamId}`} className="flex items-center gap-2 px-4 py-2">
                                <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                    pick.round === 1 ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-700/50 text-slate-400'
                                }`}>
                                    R{pick.round}
                                </div>
                                <span className="text-xs font-bold text-slate-200">{pick.season} {pick.round === 1 ? '1라운드' : '2라운드'}</span>
                                {pick.protection && (
                                    <span className="text-[9px] text-orange-400 ml-auto">{pick.protection}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Requested */}
                <div>
                    <div className="px-4 py-2 bg-slate-800/30 text-[10px] font-black uppercase tracking-widest text-red-400">
                        요청한 자산
                    </div>
                    <div className="divide-y divide-slate-800/30">
                        {offer.requestedPlayers.map(ref => {
                            const p = findPlayer(ref.playerId, teams);
                            if (!p) return (
                                <div key={ref.playerId} className="px-4 py-2 text-xs text-slate-500">{ref.playerName}</div>
                            );
                            return (
                                <div key={p.id} className="flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors">
                                    <OvrBadge value={calculatePlayerOvr(p)} size="sm" />
                                    <span
                                        className="text-xs font-bold text-slate-200 truncate hover:text-indigo-400 cursor-pointer"
                                        onClick={() => handleViewPlayer(p)}
                                    >
                                        {p.name}
                                    </span>
                                    <span className="text-[10px] text-slate-500 ml-auto">{formatMoney(p.salary)}</span>
                                </div>
                            );
                        })}
                        {offer.requestedPicks.map(pick => (
                            <div key={`${pick.season}-${pick.round}-${pick.originalTeamId}`} className="flex items-center gap-2 px-4 py-2">
                                <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                    pick.round === 1 ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-700/50 text-slate-400'
                                }`}>
                                    R{pick.round}
                                </div>
                                <span className="text-xs font-bold text-slate-200">{pick.season} {pick.round === 1 ? '1라운드' : '2라운드'}</span>
                                {pick.protection && (
                                    <span className="text-[9px] text-orange-400 ml-auto">{pick.protection}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Analysis */}
            {offer.analysis && offer.analysis.length > 0 && (
                <div className="px-5 py-2 bg-slate-950/40 border-t border-slate-800/50">
                    {offer.analysis.map((a, i) => (
                        <p key={i} className="text-[10px] text-slate-500 font-bold">{a}</p>
                    ))}
                </div>
            )}
        </div>
    );
}
