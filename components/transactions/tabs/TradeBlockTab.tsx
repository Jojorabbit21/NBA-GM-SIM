
import React, { useState } from 'react';
import { Check, Package, ShieldCheck, Info } from 'lucide-react';
import { Player, Team } from '../../../types';
import { DraftPickAsset } from '../../../types/draftAssets';
import { TradeBlockEntry, TradePickRef } from '../../../types/trade';
import { OvrBadge } from '../../common/OvrBadge';
import { PickSelector } from '../PickSelector';
import { calculatePlayerOvr } from '../../../utils/constants';
import { formatMoney } from '../../../utils/formatMoney';
import { LeagueGMProfiles, TeamDirection, DIRECTION_LABELS } from '../../../types/gm';
import { DirectionBadge } from '../../common/DirectionBadge';
import { TEAM_DATA } from '../../../data/teamData';
import { getTeamLogoUrl } from '../../../utils/constants';

interface TradeBlockTabProps {
    team: Team;
    isTradeDeadlinePassed: boolean;
    handleViewPlayer: (p: Player) => void;
    sortedUserRoster: Player[];

    // 영속 블록 시스템
    userBlockEntries: TradeBlockEntry[];
    togglePersistentBlockPlayer: (playerId: string) => void;
    togglePersistentBlockPick: (pickRef: TradePickRef) => void;
    userPicks: DraftPickAsset[];
    leagueGMProfiles?: LeagueGMProfiles;
}

export const TradeBlockTab: React.FC<TradeBlockTabProps> = ({
    team,
    isTradeDeadlinePassed,
    handleViewPlayer,
    sortedUserRoster,
    userBlockEntries,
    togglePersistentBlockPlayer,
    togglePersistentBlockPick,
    userPicks,
    leagueGMProfiles,
}) => {
    const [showPickSelector, setShowPickSelector] = useState(false);

    // 영속 블록에 등록된 선수/픽 ID 세트
    const persistentPlayerIds = new Set(
        userBlockEntries.filter(e => e.type === 'player').map(e => e.playerId!)
    );
    const persistentPickRefs = userBlockEntries.filter(e => e.type === 'pick').map(e => e.pick!);
    const persistentBlockCount = userBlockEntries.length;
    const playerBlockCount = userBlockEntries.filter(e => e.type === 'player').length;
    const pickBlockCount = persistentPickRefs.length;

    const selectedPickRefs: TradePickRef[] = persistentPickRefs;

    return (
        <div className="flex flex-1 min-h-0 h-full">
            {/* Left: My Roster + Picks */}
            <div className="w-[380px] lg:w-[420px] border-r border-slate-700 flex flex-col flex-shrink-0">
                <div className="px-6 py-3 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                    <span className="text-xs font-bold uppercase text-slate-500">내 로스터</span>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold uppercase ${persistentBlockCount > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>
                            {persistentBlockCount} / 8 등록
                        </span>
                        <button
                            onClick={() => setShowPickSelector(!showPickSelector)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                                showPickSelector
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Package size={10} className="inline mr-1" />
                            픽 {pickBlockCount > 0 ? `(${pickBlockCount})` : ''}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                    {/* Pick Selector (토글) */}
                    {showPickSelector && (
                        <div className="border-b border-slate-700">
                            <PickSelector
                                picks={userPicks}
                                selectedPicks={selectedPickRefs}
                                onTogglePick={togglePersistentBlockPick}
                                disabled={isTradeDeadlinePassed}
                                maxSelections={3}
                            />
                        </div>
                    )}

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
                                        onClick={() => {
                                            if (disabled) return;
                                            togglePersistentBlockPlayer(p.id);
                                        }}
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

            {/* Right: Block Summary */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="px-6 py-3 border-b border-slate-700 flex items-center bg-slate-800 flex-shrink-0">
                    <ShieldCheck size={14} className="text-indigo-400 mr-2" />
                    <span className="text-xs font-bold uppercase text-slate-500">트레이드 블록 현황</span>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                    {persistentBlockCount > 0 ? (
                        <div className="p-5 space-y-4">
                            {/* 등록 선수 */}
                            {playerBlockCount > 0 && (
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">
                                        등록 선수 ({playerBlockCount})
                                    </div>
                                    <div className="space-y-1">
                                        {userBlockEntries.filter(e => e.type === 'player').map((entry, i) => {
                                            const p = team.roster.find(r => r.id === entry.playerId);
                                            if (!p) return null;
                                            const ovr = calculatePlayerOvr(p);
                                            return (
                                                <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                                                    <OvrBadge value={ovr} size="sm" />
                                                    <div className="flex-1 min-w-0">
                                                        <span
                                                            className="font-bold text-sm text-slate-200 truncate hover:text-indigo-400 hover:underline cursor-pointer"
                                                            onClick={() => handleViewPlayer(p)}
                                                        >
                                                            {p.name}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-500 uppercase w-8 text-center">{p.position}</span>
                                                    <span className="text-xs font-mono text-slate-500 w-6 text-center">{p.age}</span>
                                                    <span className="text-xs font-mono font-bold text-slate-300 w-16 text-right">{formatMoney(p.salary)}</span>
                                                    <button
                                                        onClick={() => togglePersistentBlockPlayer(p.id)}
                                                        className="ml-2 text-[10px] font-bold text-red-400 hover:text-red-300 uppercase"
                                                    >
                                                        해제
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 등록 픽 */}
                            {pickBlockCount > 0 && (
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2">
                                        등록 드래프트 픽 ({pickBlockCount})
                                    </div>
                                    <div className="space-y-1">
                                        {userBlockEntries.filter(e => e.type === 'pick').map((entry, i) => {
                                            const pick = entry.pick!;
                                            return (
                                                <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-800/60 border border-amber-500/20">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${pick.round === 1 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                                                        R{pick.round}
                                                    </span>
                                                    <span className="text-sm font-bold text-slate-200">
                                                        {pick.season} 시즌 {pick.round}라운드 픽
                                                    </span>
                                                    <div className="flex-1" />
                                                    <button
                                                        onClick={() => togglePersistentBlockPick(pick)}
                                                        className="text-[10px] font-bold text-red-400 hover:text-red-300 uppercase"
                                                    >
                                                        해제
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 안내 */}
                            <div className="mt-4 px-4 py-3 rounded-xl bg-indigo-600/5 border border-indigo-500/20">
                                <div className="flex items-start gap-2">
                                    <Info size={14} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-[11px] font-bold text-indigo-300/70 leading-relaxed">
                                        시뮬을 진행하면 CPU 팀들이 블록에 등록된 자산을 평가하고 오퍼를 보내옵니다.
                                        수신된 오퍼는 <span className="text-indigo-400">수신 오퍼</span> 탭에서 확인할 수 있습니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3">
                            <Package size={32} className="text-slate-700" />
                            <p className="font-black text-sm text-slate-500 uppercase tracking-widest">블록 비어있음</p>
                            <p className="text-xs font-bold text-slate-600 text-center">
                                좌측 로스터에서 트레이드에 내놓을<br/>
                                선수를 클릭하여 등록하세요.
                            </p>
                            <p className="text-[10px] font-bold text-indigo-400/60 text-center mt-2">
                                픽 버튼을 눌러 드래프트 픽도<br/>
                                블록에 등록할 수 있습니다.
                            </p>
                        </div>
                    )}

                    {/* 리그 노선 현황 */}
                    {leagueGMProfiles && Object.keys(leagueGMProfiles).length > 0 && (
                        <LeagueDirectionOverview leagueGMProfiles={leagueGMProfiles} />
                    )}
                </div>
            </div>
        </div>
    );
};

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
                            <DirectionBadge direction={direction} size="sm" />
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
