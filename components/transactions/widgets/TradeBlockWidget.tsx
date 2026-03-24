
import React, { useMemo } from 'react';
import { ShieldCheck, ChevronRight, Package, Handshake } from 'lucide-react';
import { Team, Player } from '../../../types';
import { TradeBlockEntry, LeagueTradeBlocks, PersistentTradeOffer } from '../../../types/trade';
import { LeagueGMProfiles } from '../../../types/gm';
import { OvrBadge } from '../../common/OvrBadge';
import { TeamLogo } from '../../common/TeamLogo';
import { calculatePlayerOvr } from '../../../utils/constants';
import { formatMoney } from '../../../utils/formatMoney';

interface TradeBlockWidgetProps {
    team: Team;
    teams: Team[];
    /** 유저 팀의 트레이드 블록 등록 항목 */
    userBlockEntries: TradeBlockEntry[];
    /** 선수 토글 핸들러 */
    togglePersistentBlockPlayer: (playerId: string) => void;
    /** 리그 전체 블록 */
    leagueTradeBlocks?: LeagueTradeBlocks;
    leagueGMProfiles?: LeagueGMProfiles;
    /** 수신 오퍼 건수 (뱃지용) */
    incomingOfferCount?: number;
    /** 트레이드 데드라인 마감 여부 */
    isTradeDeadlinePassed: boolean;
    onViewPlayer: (p: Player) => void;
    /** 전체 탭 뷰로 이동 */
    onOpenFullView?: () => void;
    /** 특정 CPU 팀과 협상 시작 */
    onStartNegotiation?: (teamId: string, playerIds: string[]) => void;
}

export const TradeBlockWidget: React.FC<TradeBlockWidgetProps> = ({
    team,
    teams,
    userBlockEntries,
    togglePersistentBlockPlayer,
    leagueTradeBlocks,
    leagueGMProfiles,
    incomingOfferCount = 0,
    isTradeDeadlinePassed,
    onViewPlayer,
    onOpenFullView,
    onStartNegotiation,
}) => {
    // 유저 블록 선수
    const userBlockPlayers = useMemo(() =>
        userBlockEntries
            .filter(e => e.type === 'player')
            .map(e => team.roster.find(p => p.id === e.playerId))
            .filter(Boolean) as Player[],
        [userBlockEntries, team.roster]
    );

    // CPU 블록 팀 (선수 있는 팀만, 최대 4개)
    const cpuBlockTeams = useMemo(() => {
        if (!leagueTradeBlocks) return [];
        return Object.entries(leagueTradeBlocks)
            .filter(([id, block]) => id !== team.id && block.entries.some(e => e.type === 'player'))
            .map(([id, block]) => ({
                teamId: id,
                teamObj: teams.find(t => t.id === id),
                playerEntries: block.entries.filter(e => e.type === 'player'),
                gmProfile: leagueGMProfiles?.[id],
            }))
            .sort((a, b) => b.playerEntries.length - a.playerEntries.length)
            .slice(0, 4);
    }, [leagueTradeBlocks, teams, team.id, leagueGMProfiles]);

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-emerald-900/40 border-b border-emerald-800/30">
                <div className="flex items-center gap-2">
                    <ShieldCheck size={13} className="text-emerald-400" />
                    <span className="text-sm font-bold text-white">트레이드 블록</span>
                    {incomingOfferCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-black rounded-full">
                            {incomingOfferCount}
                        </span>
                    )}
                </div>
                {onOpenFullView && (
                    <button
                        onClick={onOpenFullView}
                        className="flex items-center gap-0.5 text-xs text-emerald-300/60 hover:text-emerald-300 transition-colors"
                    >
                        전체 보기 <ChevronRight size={12} />
                    </button>
                )}
            </div>

            {/* 내 블록 */}
            <div className="border-b border-slate-800/60">
                <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-500">내 블록</span>
                    <span className={`text-[10px] font-bold uppercase ${userBlockPlayers.length > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {userBlockPlayers.length} / 8
                    </span>
                </div>

                {userBlockPlayers.length > 0 ? (
                    <div className="px-3 pb-2 space-y-1">
                        {userBlockPlayers.map(p => {
                            const ovr = calculatePlayerOvr(p);
                            return (
                                <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/30">
                                    <OvrBadge value={ovr} size="sm" />
                                    <button
                                        onClick={() => onViewPlayer(p)}
                                        className="flex-1 text-left text-xs font-bold text-slate-200 truncate hover:text-indigo-400 transition-colors"
                                    >
                                        {p.name}
                                    </button>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase w-7 text-center">{p.position}</span>
                                    <span className="text-[10px] font-mono text-slate-400 w-14 text-right">{formatMoney(p.salary)}</span>
                                    {!isTradeDeadlinePassed && (
                                        <button
                                            onClick={() => togglePersistentBlockPlayer(p.id)}
                                            className="text-[10px] font-bold text-red-400/70 hover:text-red-400 uppercase transition-colors ml-1"
                                        >
                                            해제
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="px-3 pb-2.5 flex items-center gap-2 text-slate-600">
                        <Package size={13} className="text-slate-700" />
                        <p className="text-[10px] font-bold">
                            {isTradeDeadlinePassed
                                ? '트레이드 데드라인 마감'
                                : '트레이드 탭에서 선수를 블록에 등록하세요'}
                        </p>
                    </div>
                )}
            </div>

            {/* 리그 블록 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar max-h-56">
                <div className="px-3 py-1.5">
                    <span className="text-[10px] font-black uppercase text-slate-500">리그 블록</span>
                </div>

                {cpuBlockTeams.length > 0 ? (
                    <div className="px-3 pb-2 space-y-2">
                        {cpuBlockTeams.map(({ teamId, teamObj, playerEntries }) => (
                            <div key={teamId} className="rounded-lg border border-slate-700/50 overflow-hidden">
                                <div className="px-2.5 py-1.5 bg-slate-950/50 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <TeamLogo teamId={teamId} size="xs" />
                                        <span className="text-xs font-black uppercase text-slate-200">
                                            {teamObj?.name ?? teamId}
                                        </span>
                                        <span className="text-[10px] text-slate-500">{playerEntries.length}명</span>
                                    </div>
                                    {onStartNegotiation && (
                                        <button
                                            onClick={() => onStartNegotiation(
                                                teamId,
                                                playerEntries.map(e => e.playerId!).filter(Boolean)
                                            )}
                                            disabled={isTradeDeadlinePassed}
                                            className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px] font-black text-white bg-indigo-600 hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <Handshake size={10} /> 협상
                                        </button>
                                    )}
                                </div>
                                <div className="divide-y divide-slate-800/20">
                                    {playerEntries.slice(0, 3).map(entry => {
                                        const p = teamObj?.roster.find(r => r.id === entry.playerId);
                                        if (!p) return null;
                                        const ovr = calculatePlayerOvr(p);
                                        return (
                                            <div key={entry.playerId} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white/5 transition-colors">
                                                <OvrBadge value={ovr} size="sm" />
                                                <button
                                                    onClick={() => onViewPlayer(p)}
                                                    className="flex-1 text-left text-[10px] font-bold text-slate-300 truncate hover:text-indigo-400 transition-colors"
                                                >
                                                    {p.name}
                                                </button>
                                                <span className="text-[10px] text-slate-500 uppercase w-6 text-center">{p.position}</span>
                                                <span className="text-[10px] font-mono text-slate-500 w-12 text-right">{formatMoney(p.salary)}</span>
                                            </div>
                                        );
                                    })}
                                    {playerEntries.length > 3 && (
                                        <div className="px-2.5 py-1 text-[9px] text-slate-600 font-bold">
                                            + {playerEntries.length - 3}명 더
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {leagueTradeBlocks && Object.keys(leagueTradeBlocks).filter(id => id !== team.id && leagueTradeBlocks[id].entries.some(e => e.type === 'player')).length > 4 && onOpenFullView && (
                            <button
                                onClick={onOpenFullView}
                                className="w-full py-1.5 text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors text-center"
                            >
                                전체 리그 블록 보기
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="px-3 pb-3 flex items-center gap-2 text-slate-600">
                        <Package size={13} className="text-slate-700" />
                        <p className="text-[10px] font-bold">시뮬 진행 후 CPU 블록이 등록됩니다</p>
                    </div>
                )}
            </div>
        </div>
    );
};
