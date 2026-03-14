
import React from 'react';
import { Inbox, Check, X, Clock } from 'lucide-react';
import { Team, Player } from '../../../types';
import { PersistentTradeOffer } from '../../../types/trade';
import { TeamLogo } from '../../common/TeamLogo';
import { OvrBadge } from '../../common/OvrBadge';
import { calculatePlayerOvr } from '../../../utils/constants';
import { formatMoney } from '../../../utils/formatMoney';

interface IncomingOffersTabProps {
    team: Team;
    teams: Team[];
    incomingOffers: PersistentTradeOffer[];
    outgoingOffers: PersistentTradeOffer[];
    onAcceptOffer: (offer: PersistentTradeOffer) => void;
    onRejectOffer: (offerId: string) => void;
    handleViewPlayer: (p: Player) => void;
    currentSimDate: string;
}

export const IncomingOffersTab: React.FC<IncomingOffersTabProps> = ({
    team,
    teams,
    incomingOffers,
    outgoingOffers,
    onAcceptOffer,
    onRejectOffer,
    handleViewPlayer,
    currentSimDate,
}) => {
    const pendingIncoming = incomingOffers.filter(o => o.status === 'pending');
    const pendingOutgoing = outgoingOffers.filter(o => o.status === 'pending');
    const respondedOutgoing = outgoingOffers.filter(o => o.status !== 'pending');

    const findPlayer = (playerId: string): Player | undefined => {
        for (const t of teams) {
            const p = t.roster.find(r => r.id === playerId);
            if (p) return p;
        }
        return undefined;
    };

    const renderOfferCard = (offer: PersistentTradeOffer, type: 'incoming' | 'outgoing') => {
        const otherTeamId = type === 'incoming' ? offer.fromTeamId : offer.toTeamId;
        const otherTeam = teams.find(t => t.id === otherTeamId);

        const theyOffer = type === 'incoming' ? offer.offeredPlayers : offer.requestedPlayers;
        const theyOfferPicks = type === 'incoming' ? offer.offeredPicks : offer.requestedPicks;
        const theyWant = type === 'incoming' ? offer.requestedPlayers : offer.offeredPlayers;
        const theyWantPicks = type === 'incoming' ? offer.requestedPicks : offer.offeredPicks;

        const daysLeft = Math.max(0, Math.ceil(
            (new Date(offer.expiresDate).getTime() - new Date(currentSimDate).getTime()) / (1000 * 60 * 60 * 24)
        ));

        return (
            <div key={offer.id} className="rounded-2xl border border-slate-700/50 bg-slate-900 overflow-hidden">
                {/* Header */}
                <div className="px-5 py-3 bg-slate-950/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <TeamLogo teamId={otherTeamId} size="sm" />
                        <span className="text-sm font-black uppercase tracking-tight text-white">
                            {otherTeam?.name ?? otherTeamId}
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
                    {type === 'incoming' && offer.status === 'pending' && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onRejectOffer(offer.id)}
                                className="px-3 py-1.5 rounded-xl font-bold text-xs uppercase text-slate-400 hover:text-red-400 bg-slate-800 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 transition-all active:scale-95"
                            >
                                <X size={12} className="inline mr-1" />거절
                            </button>
                            <button
                                onClick={() => onAcceptOffer(offer)}
                                className="px-4 py-1.5 rounded-xl font-bold text-xs uppercase text-white bg-indigo-600 hover:bg-indigo-500 transition-all active:scale-95"
                            >
                                <Check size={12} className="inline mr-1" />수락
                            </button>
                        </div>
                    )}
                </div>

                {/* Body — Two Columns */}
                <div className="grid grid-cols-2 divide-x divide-slate-800/50">
                    {/* They Offer */}
                    <div>
                        <div className="px-4 py-2 bg-slate-800/30 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                            {type === 'incoming' ? '받는 자산' : '보낸 자산'}
                        </div>
                        <div className="divide-y divide-slate-800/30">
                            {theyOffer.map(ref => {
                                const p = findPlayer(ref.playerId);
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
                            {theyOfferPicks.map(pick => (
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

                    {/* They Want */}
                    <div>
                        <div className="px-4 py-2 bg-slate-800/30 text-[10px] font-black uppercase tracking-widest text-red-400">
                            {type === 'incoming' ? '보내는 자산' : '요청한 자산'}
                        </div>
                        <div className="divide-y divide-slate-800/30">
                            {theyWant.map(ref => {
                                const p = findPlayer(ref.playerId);
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
                            {theyWantPicks.map(pick => (
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
    };

    const hasAnyContent = pendingIncoming.length > 0 || pendingOutgoing.length > 0 || respondedOutgoing.length > 0;

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
            {!hasAnyContent ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3">
                    <div className="p-6 bg-slate-800/50 rounded-full border border-slate-700/50">
                        <Inbox size={32} className="text-slate-600" />
                    </div>
                    <p className="font-black text-sm text-slate-500 uppercase tracking-widest">오퍼 없음</p>
                    <p className="text-xs font-bold text-slate-600 text-center">
                        트레이드 블록에 선수/픽을 등록하면<br/>
                        CPU 팀들이 시뮬 진행 시 오퍼를 보내옵니다.
                    </p>
                </div>
            ) : (
                <div className="p-4 space-y-6">
                    {/* Incoming Offers */}
                    {pendingIncoming.length > 0 && (
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400 mb-3 px-1">
                                수신 오퍼 ({pendingIncoming.length})
                            </h3>
                            <div className="space-y-3">
                                {pendingIncoming.map(o => renderOfferCard(o, 'incoming'))}
                            </div>
                        </div>
                    )}

                    {/* Outgoing Pending */}
                    {pendingOutgoing.length > 0 && (
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 px-1">
                                발신 대기 ({pendingOutgoing.length})
                            </h3>
                            <div className="space-y-3">
                                {pendingOutgoing.map(o => renderOfferCard(o, 'outgoing'))}
                            </div>
                        </div>
                    )}

                    {/* Responded */}
                    {respondedOutgoing.length > 0 && (
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 px-1">
                                처리 완료
                            </h3>
                            <div className="space-y-3 opacity-60">
                                {respondedOutgoing.slice(0, 10).map(o => renderOfferCard(o, 'outgoing'))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
