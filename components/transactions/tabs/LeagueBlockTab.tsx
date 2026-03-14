
import React, { useState, useMemo } from 'react';
import { Check, Package, ArrowLeft, Info, Handshake } from 'lucide-react';
import { Player, Team, TradeOffer } from '../../../types';
import { DraftPickAsset, LeaguePickAssets } from '../../../types/draftAssets';
import { TradeBlockEntry, LeagueTradeBlocks, PersistentTradeOffer, PersistentPickRef } from '../../../types/trade';
import { OvrBadge } from '../../common/OvrBadge';
import { TeamLogo } from '../../common/TeamLogo';
import { OfferInboxPanel } from '../OfferInboxPanel';
import { TradeNegotiationBuilder } from '../TradeNegotiationBuilder';
import { calculatePlayerOvr, getTeamLogoUrl } from '../../../utils/constants';
import { formatMoney } from '../../../utils/formatMoney';
import { LeagueGMProfiles, TeamDirection, DIRECTION_LABELS } from '../../../types/gm';
import { TEAM_DATA } from '../../../data/teamData';

const DIRECTION_COLORS: Record<TeamDirection, string> = {
    winNow: 'text-red-400',
    buyer: 'text-amber-400',
    standPat: 'text-slate-400',
    seller: 'text-blue-400',
    tanking: 'text-purple-400',
};

interface LeagueBlockTabProps {
    team: Team;
    teams: Team[];
    isTradeDeadlinePassed: boolean;
    currentSimDate: string;
    handleViewPlayer: (p: Player) => void;
    sortedUserRoster: Player[];

    // 영속 블록 시스템
    userBlockEntries: TradeBlockEntry[];
    togglePersistentBlockPlayer: (playerId: string) => void;
    userPicks: DraftPickAsset[];
    leaguePickAssets?: LeaguePickAssets;
    leagueGMProfiles?: LeagueGMProfiles;
    leagueTradeBlocks?: LeagueTradeBlocks;

    // 수신 오퍼
    incomingOffers: PersistentTradeOffer[];
    onAcceptOffer: (offer: PersistentTradeOffer) => void;
    onRejectOffer: (offerId: string) => void;

    // 비동기 제안
    sendPersistentProposal: (
        targetTeamId: string,
        offeredPlayerIds: string[],
        offeredPicks: PersistentPickRef[],
        requestedPlayerIds: string[],
        requestedPicks: PersistentPickRef[]
    ) => void;
}

interface NegotiationTarget {
    teamId: string;
    requestedPlayerIds: Set<string>;
}

export const LeagueBlockTab: React.FC<LeagueBlockTabProps> = ({
    team,
    teams,
    isTradeDeadlinePassed,
    currentSimDate,
    handleViewPlayer,
    sortedUserRoster,
    userBlockEntries,
    togglePersistentBlockPlayer,
    userPicks,
    leaguePickAssets,
    leagueGMProfiles,
    leagueTradeBlocks,
    incomingOffers,
    onAcceptOffer,
    onRejectOffer,
    sendPersistentProposal,
}) => {
    const [subView, setSubView] = useState<'block' | 'negotiate'>('block');
    const [negotiationTarget, setNegotiationTarget] = useState<NegotiationTarget | null>(null);

    // 영속 블록에 등록된 선수 ID 세트
    const persistentPlayerIds = new Set(
        userBlockEntries.filter(e => e.type === 'player').map(e => e.playerId!)
    );
    const persistentBlockCount = userBlockEntries.filter(e => e.type === 'player').length;

    // CPU 블록 팀 데이터
    const cpuBlockTeams = useMemo(() => {
        if (!leagueTradeBlocks) return [];
        return Object.entries(leagueTradeBlocks)
            .filter(([id, block]) => id !== team.id && block.entries.some(e => e.type === 'player'))
            .map(([id, block]) => {
                const t = teams.find(t => t.id === id);
                return { teamId: id, team: t, block, gmProfile: leagueGMProfiles?.[id] };
            })
            .sort((a, b) => b.block.entries.filter(e => e.type === 'player').length - a.block.entries.filter(e => e.type === 'player').length);
    }, [leagueTradeBlocks, teams, team.id, leagueGMProfiles]);

    const handleStartNegotiation = (teamId: string, playerIds: string[] = []) => {
        setNegotiationTarget({
            teamId,
            requestedPlayerIds: new Set(playerIds),
        });
        setSubView('negotiate');
    };

    // ── 협상 서브뷰 ──
    if (subView === 'negotiate' && negotiationTarget) {
        return (
            <div className="flex flex-col flex-1 min-h-0 h-full">
                <div className="px-6 py-2 bg-slate-800 border-b border-slate-700 flex items-center gap-3 flex-shrink-0">
                    <button
                        onClick={() => { setSubView('block'); setNegotiationTarget(null); }}
                        className="flex items-center gap-1 text-xs font-bold uppercase text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <ArrowLeft size={14} /> 돌아가기
                    </button>
                    <span className="text-xs text-slate-600">|</span>
                    <TeamLogo teamId={negotiationTarget.teamId} size="xs" />
                    <span className="text-xs font-black uppercase text-slate-300">
                        {teams.find(t => t.id === negotiationTarget.teamId)?.name ?? negotiationTarget.teamId} 협상
                    </span>
                </div>
                <TradeNegotiationBuilder
                    key={negotiationTarget.teamId}
                    teams={teams}
                    userTeam={team}
                    userPicks={userPicks}
                    leaguePickAssets={leaguePickAssets}
                    leagueGMProfiles={leagueGMProfiles}
                    isTradeDeadlinePassed={isTradeDeadlinePassed}
                    currentSimDate={currentSimDate}
                    handleViewPlayer={handleViewPlayer}
                    sendPersistentProposal={sendPersistentProposal}
                    initialTargetTeamId={negotiationTarget.teamId}
                    initialRequestedPlayerIds={negotiationTarget.requestedPlayerIds}
                />
            </div>
        );
    }

    // ── 메인 블록 뷰 ──
    return (
        <div className="flex flex-1 min-h-0 h-full">
            {/* Left: My Roster */}
            <div className="w-[380px] lg:w-[420px] border-r border-slate-700 flex flex-col flex-shrink-0">
                <div className="px-6 py-3 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                    <span className="text-xs font-bold uppercase text-slate-500">내 로스터</span>
                    <span className={`text-xs font-bold uppercase ${persistentBlockCount > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>
                        {persistentBlockCount}명 등록
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                    {/* Player Table */}
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className="bg-slate-800 sticky top-0 z-10">
                            <tr className="text-slate-500 text-xs font-bold uppercase">
                                <th className="py-2.5 px-3 w-8 border-b border-slate-700"></th>
                                <th className="py-2.5 px-1 w-10 border-b border-slate-700 text-center">OVR</th>
                                <th className="py-2.5 px-3 border-b border-slate-700">선수</th>
                                <th className="py-2.5 px-2 w-10 border-b border-slate-700 text-center">POS</th>
                                <th className="py-2.5 px-2 w-10 border-b border-slate-700 text-center">AGE</th>
                                <th className="py-2.5 px-3 w-16 border-b border-slate-700 text-right">연봉</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedUserRoster.map(p => {
                                const isRegistered = persistentPlayerIds.has(p.id);
                                const ovr = calculatePlayerOvr(p);
                                const disabled = isTradeDeadlinePassed;
                                return (
                                    <tr
                                        key={p.id}
                                        onClick={() => !disabled && togglePersistentBlockPlayer(p.id)}
                                        className={`transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${isRegistered ? 'bg-indigo-600/10' : 'hover:bg-white/5'}`}
                                    >
                                        <td className="py-2 px-3 border-b border-slate-800/50">
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isRegistered ? 'bg-emerald-500 border-emerald-400' : 'border-slate-700 bg-slate-900'}`}>
                                                {isRegistered && <Check size={12} className="text-white" strokeWidth={3} />}
                                            </div>
                                        </td>
                                        <td className="py-2 px-1 border-b border-slate-800/50 text-center">
                                            <OvrBadge value={ovr} size="sm" />
                                        </td>
                                        <td className="py-2 px-3 border-b border-slate-800/50">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span
                                                    className="font-bold text-sm text-slate-200 truncate hover:text-indigo-400 hover:underline cursor-pointer"
                                                    onClick={(e) => { e.stopPropagation(); handleViewPlayer(p); }}
                                                >
                                                    {p.name}
                                                </span>
                                                {p.health !== 'Healthy' && (
                                                    <span className={`px-1 py-0.5 rounded text-[8px] font-black uppercase flex-shrink-0 ${p.health === 'Injured' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                                        {p.health === 'Injured' ? 'OUT' : 'DTD'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2 px-2 border-b border-slate-800/50 text-center text-xs font-bold text-slate-400 uppercase">{p.position}</td>
                                        <td className="py-2 px-2 border-b border-slate-800/50 text-center text-xs font-mono text-slate-400">{p.age}</td>
                                        <td className="py-2 px-3 border-b border-slate-800/50 text-right text-xs font-mono font-bold text-slate-300">{formatMoney(p.salary)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Right: Incoming Offers + League Blocks */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="px-6 py-3 border-b border-slate-700 flex items-center bg-slate-800 flex-shrink-0">
                    <span className="text-xs font-bold uppercase text-slate-500">리그 트레이드 블록</span>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                    {/* 수신 오퍼 (있을 때만) */}
                    <OfferInboxPanel
                        teams={teams}
                        incomingOffers={incomingOffers}
                        onAcceptOffer={onAcceptOffer}
                        onRejectOffer={onRejectOffer}
                        handleViewPlayer={handleViewPlayer}
                        currentSimDate={currentSimDate}
                        collapsible
                    />

                    {/* 안내 */}
                    {persistentBlockCount > 0 && (
                        <div className="px-5 py-2.5 bg-indigo-600/5 border-b border-slate-700">
                            <div className="flex items-start gap-2">
                                <Info size={12} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                                <p className="text-[10px] font-bold text-indigo-300/70 leading-relaxed">
                                    시뮬을 진행하면 CPU 팀들이 블록에 등록된 자산을 평가하고 오퍼를 보내옵니다.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* CPU 트레이드 블록 목록 */}
                    {cpuBlockTeams.length > 0 ? (
                        <div className="p-4 space-y-3">
                            {cpuBlockTeams.map(({ teamId, team: cpuTeam, block, gmProfile }) => {
                                const playerEntries = block.entries.filter(e => e.type === 'player');
                                const direction = gmProfile?.direction;

                                return (
                                    <div key={teamId} className="rounded-xl border border-slate-700/50 bg-slate-900 overflow-hidden">
                                        {/* Team Header */}
                                        <div className="px-4 py-2.5 bg-slate-950/60 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <TeamLogo teamId={teamId} size="sm" />
                                                <span className="text-sm font-black uppercase tracking-tight text-white">
                                                    {cpuTeam?.name ?? teamId}
                                                </span>
                                                {direction && (
                                                    <span className={`text-[10px] font-black uppercase ${DIRECTION_COLORS[direction]}`}>
                                                        {DIRECTION_LABELS[direction]}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleStartNegotiation(
                                                    teamId,
                                                    playerEntries.map(e => e.playerId!).filter(Boolean)
                                                )}
                                                disabled={isTradeDeadlinePassed}
                                                className="px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase text-white bg-indigo-600 hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                            >
                                                <Handshake size={12} />협상
                                            </button>
                                        </div>

                                        {/* Block Entries */}
                                        <div className="divide-y divide-slate-800/30">
                                            {playerEntries.map(entry => {
                                                const p = cpuTeam?.roster.find(r => r.id === entry.playerId);
                                                if (!p) return null;
                                                const ovr = calculatePlayerOvr(p);
                                                return (
                                                    <div key={entry.playerId} className="flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors">
                                                        <OvrBadge value={ovr} size="sm" />
                                                        <span
                                                            className="text-xs font-bold text-slate-200 truncate hover:text-indigo-400 cursor-pointer flex-1"
                                                            onClick={() => handleViewPlayer(p)}
                                                        >
                                                            {p.name}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase w-8 text-center">{p.position}</span>
                                                        <span className="text-[10px] font-mono text-slate-500 w-6 text-center">{p.age}</span>
                                                        <span className="text-[10px] font-mono text-slate-400 w-14 text-right">{formatMoney(p.salary)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-12 flex flex-col items-center justify-center text-slate-600 space-y-3">
                            <Package size={32} className="text-slate-700" />
                            <p className="font-black text-sm text-slate-500 uppercase tracking-widest">리그 블록 없음</p>
                            <p className="text-xs font-bold text-slate-600 text-center">
                                시뮬을 진행하면 CPU 팀들이<br/>
                                트레이드 블록에 선수를 올립니다.
                            </p>
                        </div>
                    )}

                    {/* 리그 노선 현황 (블록이 없어도 표시) */}
                    {leagueGMProfiles && Object.keys(leagueGMProfiles).length > 0 && (
                        <LeagueDirectionOverview leagueGMProfiles={leagueGMProfiles} />
                    )}
                </div>
            </div>
        </div>
    );
};

// ── 리그 노선 현황 (TradeBlockTab에서 이식) ──

const DIRECTION_ORDER: TeamDirection[] = ['winNow', 'buyer', 'standPat', 'seller', 'tanking'];

const LeagueDirectionOverview: React.FC<{ leagueGMProfiles: LeagueGMProfiles }> = ({ leagueGMProfiles }) => {
    const groups = DIRECTION_ORDER.map(dir => ({
        direction: dir,
        teamIds: Object.entries(leagueGMProfiles)
            .filter(([, p]) => p.direction === dir)
            .map(([id]) => id),
    }));

    return (
        <div className="border-t border-slate-700 mt-2">
            <div className="px-5 py-2.5 bg-slate-800">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">리그 노선 현황</span>
            </div>
            <div className="px-5 py-3 space-y-2">
                {groups.map(({ direction, teamIds }) => (
                    <div key={direction} className="flex items-start gap-2">
                        <div className="w-16 flex-shrink-0 pt-0.5">
                            <span className={`text-[10px] font-black uppercase ${DIRECTION_COLORS[direction]}`}>
                                {DIRECTION_LABELS[direction]}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {teamIds.length === 0 ? (
                                <span className="text-[10px] text-slate-700 ko-normal">-</span>
                            ) : (
                                teamIds.map(id => (
                                    <span
                                        key={id}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 text-[10px] text-slate-400 ko-normal"
                                    >
                                        <img src={getTeamLogoUrl(id)} className="w-3 h-3 object-contain" alt="" />
                                        {TEAM_DATA[id]?.name || id.toUpperCase()}
                                    </span>
                                ))
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
