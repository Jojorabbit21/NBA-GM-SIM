
import React, { useState, useMemo } from 'react';
import { Loader2, X, Search, CheckCircle2, Check, Send, Package } from 'lucide-react';
import { Player, Team, TradeOffer } from '../../../types';
import { DraftPickAsset, LeaguePickAssets } from '../../../types/draftAssets';
import { PersistentPickRef, TradePickRef } from '../../../types/trade';
import { Dropdown, DropdownButton } from '../../common/Dropdown';
import { TeamLogo } from '../../common/TeamLogo';
import { OvrBadge } from '../../common/OvrBadge';
import { PickSelector } from '../PickSelector';
import { calculatePlayerOvr } from '../../../utils/constants';
import { formatMoney } from '../../../utils/formatMoney';
import { LeagueGMProfiles } from '../../../types/gm';
import { DirectionBadge } from '../../common/DirectionBadge';

interface TradeProposalTabProps {
    teams: Team[];
    proposalTargetTeamId: string;
    proposalSelectedIds: Set<string>;
    proposalRequirements: TradeOffer[];
    proposalIsProcessing: boolean;
    proposalSearchPerformed: boolean;
    isTradeDeadlinePassed: boolean;

    // Actions
    setProposalTargetTeamId: (id: string) => void;
    setProposalSelectedIds: (ids: Set<string>) => void;
    setProposalRequirements: (reqs: TradeOffer[]) => void;
    setProposalSearchPerformed: (performed: boolean) => void;

    toggleProposalPlayer: (id: string) => void;
    handleViewPlayer: (p: Player) => void;
    handleRequestRequirements: () => void;
    onAcceptRequirement: (req: TradeOffer, targetTeam: Team) => void;

    targetTeamRoster: Player[];
    allOtherTeamsSorted: Team[];

    // 비동기 제안 시스템
    sendPersistentProposal: (
        targetTeamId: string,
        offeredPlayerIds: string[],
        offeredPicks: PersistentPickRef[],
        requestedPlayerIds: string[],
        requestedPicks: PersistentPickRef[]
    ) => void;
    userTeam: Team;
    userPicks: DraftPickAsset[];
    leaguePickAssets?: LeaguePickAssets;
    leagueGMProfiles?: LeagueGMProfiles;
}

export const TradeProposalTab: React.FC<TradeProposalTabProps> = ({
    teams,
    proposalTargetTeamId,
    proposalSelectedIds,
    proposalRequirements,
    proposalIsProcessing,
    proposalSearchPerformed,
    isTradeDeadlinePassed,
    setProposalTargetTeamId,
    setProposalSelectedIds,
    setProposalRequirements,
    setProposalSearchPerformed,
    toggleProposalPlayer,
    handleViewPlayer,
    handleRequestRequirements,
    onAcceptRequirement,
    targetTeamRoster,
    allOtherTeamsSorted,
    sendPersistentProposal,
    userTeam,
    userPicks,
    leaguePickAssets,
    leagueGMProfiles,
}) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showMyPicks, setShowMyPicks] = useState(false);
    const [showTargetPicks, setShowTargetPicks] = useState(false);

    // 보낼 자산 (내 선수 + 픽)
    const [myOfferedPlayerIds, setMyOfferedPlayerIds] = useState<Set<string>>(new Set());
    const [myOfferedPicks, setMyOfferedPicks] = useState<TradePickRef[]>([]);

    // 요청 자산 (상대 픽)
    const [requestedPicks, setRequestedPicks] = useState<TradePickRef[]>([]);

    const selectedTargetTeam = teams.find(t => t.id === proposalTargetTeamId);

    // 상대 팀 보유 픽
    const targetPicks = useMemo(() => {
        if (!leaguePickAssets || !proposalTargetTeamId) return [];
        return leaguePickAssets[proposalTargetTeamId] || [];
    }, [leaguePickAssets, proposalTargetTeamId]);

    const handleTeamSelect = (id: string) => {
        setProposalTargetTeamId(id);
        setIsDropdownOpen(false);
        setSearchTerm('');
        setProposalSelectedIds(new Set());
        setProposalRequirements([]);
        setProposalSearchPerformed(false);
        setMyOfferedPlayerIds(new Set());
        setMyOfferedPicks([]);
        setRequestedPicks([]);
    };

    const toggleMyPlayer = (id: string) => {
        setMyOfferedPlayerIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else if (next.size < 5) next.add(id);
            return next;
        });
    };

    const handleSendProposal = () => {
        if (!proposalTargetTeamId) return;
        const offeredPicks: PersistentPickRef[] = myOfferedPicks.map(p => ({
            ...p,
            currentTeamId: userTeam.id,
        }));
        const reqPicks: PersistentPickRef[] = requestedPicks.map(p => ({
            ...p,
            currentTeamId: proposalTargetTeamId,
        }));
        sendPersistentProposal(
            proposalTargetTeamId,
            Array.from(myOfferedPlayerIds),
            offeredPicks,
            Array.from(proposalSelectedIds),
            reqPicks
        );
        // 리셋
        setMyOfferedPlayerIds(new Set());
        setMyOfferedPicks([]);
        setRequestedPicks([]);
    };

    const hasProposalContent = myOfferedPlayerIds.size > 0 || myOfferedPicks.length > 0 ||
                               proposalSelectedIds.size > 0 || requestedPicks.length > 0;

    const sortedUserRoster = useMemo(() =>
        [...(userTeam?.roster || [])].sort((a,b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)),
        [userTeam?.roster]
    );

    return (
        <div className="flex flex-1 min-h-0 h-full">
            {/* Left: Target Team Roster */}
            <div className="flex-1 flex flex-col border-r border-slate-800 min-w-0">
                {/* Left Panel Header */}
                <div className="px-6 py-3 border-b border-slate-700 flex justify-between items-center bg-slate-800 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold uppercase text-slate-500">상대 로스터</span>
                        {selectedTargetTeam && leagueGMProfiles?.[selectedTargetTeam.id] && (
                            <DirectionBadge direction={leagueGMProfiles[selectedTargetTeam.id].direction} size="sm" />
                        )}
                        {selectedTargetTeam && (
                            <span className={`text-xs font-bold uppercase ${proposalSelectedIds.size > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>
                                {proposalSelectedIds.size}명 선택
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedTargetTeam && targetPicks.length > 0 && (
                            <button
                                onClick={() => setShowTargetPicks(!showTargetPicks)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                                    showTargetPicks
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <Package size={10} className="inline mr-1" />픽 요청
                            </button>
                        )}
                        <Dropdown
                            isOpen={isDropdownOpen}
                            onOpenChange={setIsDropdownOpen}
                            width="w-80"
                            trigger={
                                <DropdownButton
                                    isOpen={isDropdownOpen}
                                    label={selectedTargetTeam ? `${selectedTargetTeam.city} ${selectedTargetTeam.name}` : '상대 팀 선택...'}
                                    icon={selectedTargetTeam ? <TeamLogo teamId={selectedTargetTeam.id} size="sm" /> : undefined}
                                    className="h-9"
                                />
                            }
                        >
                            <div className="p-3 border-b border-slate-700 bg-slate-800">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="팀 검색..."
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-xs font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                {allOtherTeamsSorted
                                    .filter(t => (t.city + t.name).toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => handleTeamSelect(t.id)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-all group ${proposalTargetTeamId === t.id ? 'bg-indigo-900/20' : ''}`}
                                        >
                                            <TeamLogo teamId={t.id} size="xs" className="opacity-70 group-hover:opacity-100" />
                                            <span className={`text-xs font-bold uppercase truncate ${proposalTargetTeamId === t.id ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}>{t.city} {t.name}</span>
                                            {proposalTargetTeamId === t.id && <CheckCircle2 size={14} className="ml-auto text-indigo-500 flex-shrink-0" />}
                                        </button>
                                    ))}
                            </div>
                        </Dropdown>
                    </div>
                </div>

                {/* Left Panel Body */}
                {selectedTargetTeam ? (
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                        {/* Target Pick Selector */}
                        {showTargetPicks && targetPicks.length > 0 && (
                            <div className="border-b border-slate-700">
                                <div className="px-4 py-1.5 bg-red-500/5 text-[10px] font-black uppercase tracking-widest text-red-400">
                                    요청할 픽 선택
                                </div>
                                <PickSelector
                                    picks={targetPicks}
                                    selectedPicks={requestedPicks}
                                    onTogglePick={(pickRef) => {
                                        setRequestedPicks(prev => {
                                            const exists = prev.some(p =>
                                                p.season === pickRef.season && p.round === pickRef.round && p.originalTeamId === pickRef.originalTeamId
                                            );
                                            if (exists) return prev.filter(p =>
                                                !(p.season === pickRef.season && p.round === pickRef.round && p.originalTeamId === pickRef.originalTeamId)
                                            );
                                            return [...prev, pickRef];
                                        });
                                    }}
                                    disabled={isTradeDeadlinePassed}
                                    maxSelections={3}
                                />
                            </div>
                        )}

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
                                {targetTeamRoster.map(p => {
                                    const isSelected = proposalSelectedIds.has(p.id);
                                    const ovr = calculatePlayerOvr(p);
                                    const disabled = isTradeDeadlinePassed;
                                    return (
                                        <tr
                                            key={p.id}
                                            onClick={() => !disabled && toggleProposalPlayer(p.id)}
                                            className={`transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'bg-indigo-600/10' : 'hover:bg-white/5'}`}
                                        >
                                            <td className="py-2 px-3 border-b border-slate-800/50">
                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-400' : 'border-slate-700 bg-slate-900'}`}>
                                                    {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
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
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                        <p className="text-xs font-bold uppercase tracking-widest">상대 팀을 먼저 선택해주세요</p>
                    </div>
                )}
            </div>

            {/* Right: My Offer + Actions */}
            <div className="w-[420px] lg:w-[480px] flex flex-col flex-shrink-0 min-w-0">
                {/* Right Panel Header */}
                <div className="px-6 py-3 border-b border-slate-700 flex justify-between items-center bg-slate-800 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold uppercase text-slate-500">
                            내 제안 자산
                        </span>
                        {userPicks.length > 0 && (
                            <button
                                onClick={() => setShowMyPicks(!showMyPicks)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                                    showMyPicks
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <Package size={10} className="inline mr-1" />픽 추가
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {/* 레거시 즉시 협상 */}
                        <button
                            onClick={handleRequestRequirements}
                            disabled={!proposalTargetTeamId || proposalSelectedIds.size === 0 || proposalIsProcessing}
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold uppercase text-[10px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {proposalIsProcessing && <Loader2 className="animate-spin" size={14} />}
                            즉시 협상
                        </button>
                        {/* 비동기 제안 전송 */}
                        <button
                            onClick={handleSendProposal}
                            disabled={!proposalTargetTeamId || !hasProposalContent || isTradeDeadlinePassed}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase text-[10px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Send size={12} />
                            제안 전송
                        </button>
                    </div>
                </div>

                {/* Right Panel Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                    {/* My Pick Selector */}
                    {showMyPicks && (
                        <div className="border-b border-slate-700">
                            <div className="px-4 py-1.5 bg-emerald-500/5 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                                보낼 픽 선택
                            </div>
                            <PickSelector
                                picks={userPicks}
                                selectedPicks={myOfferedPicks}
                                onTogglePick={(pickRef) => {
                                    setMyOfferedPicks(prev => {
                                        const exists = prev.some(p =>
                                            p.season === pickRef.season && p.round === pickRef.round && p.originalTeamId === pickRef.originalTeamId
                                        );
                                        if (exists) return prev.filter(p =>
                                            !(p.season === pickRef.season && p.round === pickRef.round && p.originalTeamId === pickRef.originalTeamId)
                                        );
                                        return [...prev, pickRef];
                                    });
                                }}
                                disabled={isTradeDeadlinePassed}
                                maxSelections={3}
                            />
                        </div>
                    )}

                    {/* My Players to Offer */}
                    <div>
                        <div className="px-4 py-1.5 bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            보낼 선수 선택
                        </div>
                        <table className="w-full text-left border-separate border-spacing-0">
                            <tbody>
                                {sortedUserRoster.map(p => {
                                    const isSelected = myOfferedPlayerIds.has(p.id);
                                    const ovr = calculatePlayerOvr(p);
                                    return (
                                        <tr
                                            key={p.id}
                                            onClick={() => toggleMyPlayer(p.id)}
                                            className={`transition-colors cursor-pointer ${isSelected ? 'bg-indigo-600/10' : 'hover:bg-white/5'}`}
                                        >
                                            <td className="py-2 px-3 border-b border-slate-800/50 w-8">
                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-400' : 'border-slate-700 bg-slate-900'}`}>
                                                    {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                                                </div>
                                            </td>
                                            <td className="py-2 px-1 border-b border-slate-800/50 w-10 text-center">
                                                <OvrBadge value={ovr} size="sm" />
                                            </td>
                                            <td className="py-2 px-3 border-b border-slate-800/50">
                                                <span
                                                    className="font-bold text-sm text-slate-200 truncate hover:text-indigo-400 cursor-pointer"
                                                    onClick={(e) => { e.stopPropagation(); handleViewPlayer(p); }}
                                                >
                                                    {p.name}
                                                </span>
                                            </td>
                                            <td className="py-2 px-2 border-b border-slate-800/50 text-center text-xs font-bold text-slate-400 uppercase w-10">{p.position}</td>
                                            <td className="py-2 px-3 border-b border-slate-800/50 text-right text-xs font-mono font-bold text-slate-300 w-16">{formatMoney(p.salary)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Legacy: Requirements Results */}
                    {proposalSearchPerformed && (
                        <div className="border-t border-slate-700">
                            <div className="px-4 py-2 bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                즉시 협상 결과 {proposalRequirements.length > 0 && `(${proposalRequirements.length}건)`}
                            </div>
                            {proposalRequirements.length > 0 ? (
                                <div className="p-4 space-y-4">
                                    {proposalRequirements.map((req, idx) => (
                                        <div key={idx} className="rounded-xl border border-slate-700/50 bg-slate-900 overflow-hidden">
                                            <div className="px-5 py-3 bg-slate-950/60 flex items-center justify-between">
                                                <span className="text-xs font-black uppercase tracking-tight text-slate-300">
                                                    요구 자산 ({req.players.length}인)
                                                </span>
                                                <button
                                                    onClick={() => selectedTargetTeam && onAcceptRequirement(req, selectedTargetTeam)}
                                                    className="px-4 py-2 rounded-xl font-bold text-xs uppercase text-white bg-indigo-600 hover:bg-indigo-500 transition-all active:scale-95"
                                                >
                                                    제안 수락
                                                </button>
                                            </div>
                                            <div className="divide-y divide-slate-800/50">
                                                {req.players.map(p => {
                                                    const ovr = calculatePlayerOvr(p);
                                                    return (
                                                        <div key={p.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/5 transition-colors">
                                                            <OvrBadge value={ovr} size="sm" />
                                                            <span
                                                                className="font-bold text-sm text-slate-200 truncate hover:text-indigo-400 cursor-pointer flex-1"
                                                                onClick={() => handleViewPlayer(p)}
                                                            >
                                                                {p.name}
                                                            </span>
                                                            <span className="text-xs font-bold text-slate-500 uppercase w-8 text-center">{p.position}</span>
                                                            <span className="text-xs font-mono font-bold text-slate-300 w-16 text-right">{formatMoney(p.salary)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-8 flex flex-col items-center justify-center text-slate-600 space-y-3">
                                    <div className="p-6 bg-red-500/10 rounded-full border border-red-500/20">
                                        <X size={32} className="text-red-500/50" />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-bold text-sm text-slate-500">협상 결렬</p>
                                        <p className="text-xs mt-1">상대방이 트레이드에 관심이 없거나,<br/>샐러리 캡 조건을 맞출 수 없습니다.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Empty state when nothing selected */}
                    {!proposalSearchPerformed && !showMyPicks && myOfferedPlayerIds.size === 0 && (
                        <div className="py-12 flex flex-col items-center justify-center text-slate-600 space-y-3">
                            <p className="font-black text-sm text-slate-500 uppercase tracking-widest">제안 구성</p>
                            <p className="text-xs font-bold text-slate-600 text-center">
                                좌측에서 영입할 선수를 선택하고<br/>
                                우측에서 보낼 자산을 구성하세요.
                            </p>
                            <p className="text-[10px] font-bold text-indigo-400/60 text-center mt-2">
                                &quot;제안 전송&quot; 시 다음 시뮬에서 CPU가 응답합니다.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
