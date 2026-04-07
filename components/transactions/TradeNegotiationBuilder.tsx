
import React, { useState, useMemo } from 'react';
import { Loader2, X, Search, CheckCircle2, Check, Send, Package, ArrowRight } from 'lucide-react';
import { Player, Team, TradeOffer } from '../../types';
import { DraftPickAsset, LeaguePickAssets } from '../../types/draftAssets';
import { PersistentPickRef, TradePickRef } from '../../types/trade';
import { Dropdown, DropdownButton } from '../common/Dropdown';
import { TeamLogo } from '../common/TeamLogo';
import { OvrBadge } from '../common/OvrBadge';
import { PickSelector } from './PickSelector';
import { calculatePlayerOvr } from '../../utils/constants';
import { formatMoney } from '../../utils/formatMoney';
import { LeagueGMProfiles, DIRECTION_LABELS, TeamDirection } from '../../types/gm';
import { calculatePackageTrueValue } from '../../services/tradeEngine/tradeValue';
import { getPickTradeValue } from '../../services/tradeEngine/pickValueEngine';

const DIRECTION_COLORS: Record<TeamDirection, string> = {
    winNow: 'text-red-400',
    buyer: 'text-amber-400',
    standPat: 'text-slate-400',
    seller: 'text-blue-400',
    tanking: 'text-purple-400',
};

interface TradeNegotiationBuilderProps {
    teams: Team[];
    userTeam: Team;
    userPicks: DraftPickAsset[];
    leaguePickAssets?: LeaguePickAssets;
    leagueGMProfiles?: LeagueGMProfiles;
    isTradeDeadlinePassed: boolean;
    currentSimDate: string;

    handleViewPlayer: (p: Player) => void;

    sendPersistentProposal: (
        targetTeamId: string,
        offeredPlayerIds: string[],
        offeredPicks: PersistentPickRef[],
        requestedPlayerIds: string[],
        requestedPicks: PersistentPickRef[]
    ) => void;

    showInstantMode?: boolean;
    handleRequestRequirements?: () => void;
    proposalIsProcessing?: boolean;

    proposalRequirements?: TradeOffer[];
    proposalSearchPerformed?: boolean;
    onAcceptRequirement?: (req: TradeOffer, targetTeam: Team) => void;

    initialTargetTeamId?: string;
    initialRequestedPlayerIds?: Set<string>;
    initialOfferedPlayerIds?: Set<string>;

    externalTargetTeamId?: string;
    onTargetTeamChange?: (teamId: string) => void;
    externalSelectedIds?: Set<string>;
    onSelectedIdsChange?: (ids: Set<string>) => void;
    onSearchPerformedReset?: () => void;
}

export const TradeNegotiationBuilder: React.FC<TradeNegotiationBuilderProps> = ({
    teams,
    userTeam,
    userPicks,
    leaguePickAssets,
    leagueGMProfiles,
    isTradeDeadlinePassed,
    currentSimDate,
    handleViewPlayer,
    sendPersistentProposal,
    showInstantMode = false,
    handleRequestRequirements,
    proposalIsProcessing = false,
    proposalRequirements = [],
    proposalSearchPerformed = false,
    onAcceptRequirement,
    initialTargetTeamId,
    initialRequestedPlayerIds,
    initialOfferedPlayerIds,
    externalTargetTeamId,
    onTargetTeamChange,
    externalSelectedIds,
    onSelectedIdsChange,
    onSearchPerformedReset,
}) => {
    const [internalTargetTeamId, setInternalTargetTeamId] = useState(initialTargetTeamId || '');
    const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(initialRequestedPlayerIds || new Set());

    const targetTeamId = externalTargetTeamId ?? internalTargetTeamId;
    const setTargetTeamId = onTargetTeamChange ?? setInternalTargetTeamId;
    const requestedPlayerIds = externalSelectedIds ?? internalSelectedIds;
    const setRequestedPlayerIds = onSelectedIdsChange ?? setInternalSelectedIds;

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showMyPicks, setShowMyPicks] = useState(false);
    const [showTargetPicks, setShowTargetPicks] = useState(false);

    const [myOfferedPlayerIds, setMyOfferedPlayerIds] = useState<Set<string>>(initialOfferedPlayerIds || new Set());
    const [myOfferedPicks, setMyOfferedPicks] = useState<TradePickRef[]>([]);
    const [requestedPicks, setRequestedPicks] = useState<TradePickRef[]>([]);

    const selectedTargetTeam = teams.find(t => t.id === targetTeamId);

    const targetPicks = useMemo(() => {
        if (!leaguePickAssets || !targetTeamId) return [];
        return leaguePickAssets[targetTeamId] || [];
    }, [leaguePickAssets, targetTeamId]);

    const targetTeamRoster = useMemo(() => {
        const t = teams.find(t => t.id === targetTeamId);
        return t ? [...t.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)) : [];
    }, [teams, targetTeamId]);

    const sortedUserRoster = useMemo(() =>
        [...(userTeam?.roster || [])].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)),
        [userTeam?.roster]
    );

    const allOtherTeamsSorted = useMemo(() => {
        if (!userTeam) return [];
        return teams.filter(t => t.id !== userTeam.id);
    }, [teams, userTeam?.id]);

    const handleTeamSelect = (id: string) => {
        setTargetTeamId(id);
        setIsDropdownOpen(false);
        setSearchTerm('');
        setRequestedPlayerIds(new Set());
        setMyOfferedPlayerIds(new Set());
        setMyOfferedPicks([]);
        setRequestedPicks([]);
        onSearchPerformedReset?.();
    };

    const toggleTargetPlayer = (id: string) => {
        const next = new Set(requestedPlayerIds);
        if (next.has(id)) next.delete(id);
        else if (next.size < 5) next.add(id);
        setRequestedPlayerIds(next);
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
        if (!targetTeamId) return;
        const offeredPicks: PersistentPickRef[] = myOfferedPicks.map(p => ({
            ...p,
            currentTeamId: userTeam.id,
        }));
        const reqPicks: PersistentPickRef[] = requestedPicks.map(p => ({
            ...p,
            currentTeamId: targetTeamId,
        }));
        sendPersistentProposal(
            targetTeamId,
            Array.from(myOfferedPlayerIds),
            offeredPicks,
            Array.from(requestedPlayerIds),
            reqPicks
        );
        setMyOfferedPlayerIds(new Set());
        setMyOfferedPicks([]);
        setRequestedPicks([]);
    };

    const hasProposalContent = myOfferedPlayerIds.size > 0 || myOfferedPicks.length > 0 ||
        requestedPlayerIds.size > 0 || requestedPicks.length > 0;

    const myOfferedPlayers = useMemo(() =>
        sortedUserRoster.filter(p => myOfferedPlayerIds.has(p.id)),
        [sortedUserRoster, myOfferedPlayerIds]
    );

    const requestedPlayers = useMemo(() =>
        targetTeamRoster.filter(p => requestedPlayerIds.has(p.id)),
        [targetTeamRoster, requestedPlayerIds]
    );

    const valueComparison = useMemo(() => {
        if (!hasProposalContent) return null;

        const myPlayerValue = myOfferedPlayers.length > 0 ? calculatePackageTrueValue(myOfferedPlayers) : 0;
        const targetPlayerValue = requestedPlayers.length > 0 ? calculatePackageTrueValue(requestedPlayers) : 0;

        let myPickValue = 0;
        for (const pickRef of myOfferedPicks) {
            const pickAsset = userPicks.find(p =>
                p.season === pickRef.season && p.round === pickRef.round && p.originalTeamId === pickRef.originalTeamId
            );
            if (pickAsset) myPickValue += getPickTradeValue(pickAsset, teams, currentSimDate);
        }

        let targetPickValue = 0;
        for (const pickRef of requestedPicks) {
            const pickAsset = targetPicks.find(p =>
                p.season === pickRef.season && p.round === pickRef.round && p.originalTeamId === pickRef.originalTeamId
            );
            if (pickAsset) targetPickValue += getPickTradeValue(pickAsset, teams, currentSimDate);
        }

        const myTotal = myPlayerValue + myPickValue;
        const targetTotal = targetPlayerValue + targetPickValue;
        const ratio = targetTotal > 0 ? myTotal / targetTotal : 0;

        return { myTotal, targetTotal, ratio };
    }, [myOfferedPlayers, requestedPlayers, myOfferedPicks, requestedPicks, userPicks, targetPicks, teams, currentSimDate, hasProposalContent]);

    // ── 공통 플레이어 행 렌더 ──
    const renderPlayerRow = (
        p: Player,
        isSelected: boolean,
        disabled: boolean,
        onClick: () => void,
        onViewClick: (e: React.MouseEvent) => void,
        accentColor: 'indigo' | 'emerald' = 'indigo'
    ) => {
        const ovr = calculatePlayerOvr(p);
        const selectedBg = accentColor === 'emerald' ? 'bg-emerald-600/10 border border-emerald-500/25' : 'bg-indigo-600/10 border border-indigo-500/25';
        const checkBg = accentColor === 'emerald' ? 'bg-emerald-500 border-emerald-400' : 'bg-indigo-500 border-indigo-400';
        return (
            <div
                key={p.id}
                onClick={() => !disabled && onClick()}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl mx-2 my-0.5 transition-all ${
                    disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                } ${isSelected ? selectedBg : 'hover:bg-white/5 border border-transparent'}`}
            >
                {/* 체크박스 */}
                <div className={`w-4.5 h-4.5 w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? checkBg : 'border-slate-700 bg-slate-900'
                }`}>
                    {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                </div>
                {/* OVR */}
                <OvrBadge value={ovr} size="sm" />
                {/* 이름 */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span
                        className="font-bold text-sm text-slate-200 truncate hover:text-indigo-400 hover:underline cursor-pointer"
                        onClick={onViewClick}
                    >
                        {p.name}
                    </span>
                    {p.health !== 'Healthy' && (
                        <span className={`px-1 py-0.5 rounded text-[8px] font-black uppercase flex-shrink-0 ${
                            p.health === 'Injured' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'
                        }`}>
                            {p.health === 'Injured' ? 'OUT' : 'DTD'}
                        </span>
                    )}
                </div>
                {/* 포지션 */}
                <span className="text-[10px] font-black uppercase text-slate-500 w-8 text-center flex-shrink-0">{p.position}</span>
                {/* 나이 */}
                <span className="text-[10px] font-mono text-slate-500 w-6 text-center flex-shrink-0">{p.age}</span>
                {/* 연봉 */}
                <span className="text-xs font-mono font-bold text-slate-300 w-16 text-right flex-shrink-0">{formatMoney(p.salary)}</span>
            </div>
        );
    };

    return (
        <div className="flex flex-1 min-h-0 h-full">

            {/* ── 좌측 패널: 상대 로스터 ── */}
            <div className="w-[380px] lg:w-[420px] border-r border-slate-700 flex flex-col flex-shrink-0">

                {/* 헤더 */}
                <div className="px-6 py-3 border-b border-slate-700 flex justify-between items-center bg-slate-800 flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">상대 로스터</span>
                        {selectedTargetTeam && leagueGMProfiles?.[selectedTargetTeam.id] && (
                            <span className={`text-[10px] font-black uppercase ${DIRECTION_COLORS[leagueGMProfiles[selectedTargetTeam.id].direction]}`}>
                                {DIRECTION_LABELS[leagueGMProfiles[selectedTargetTeam.id].direction]}
                            </span>
                        )}
                        {selectedTargetTeam && requestedPlayerIds.size > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-black">
                                {requestedPlayerIds.size}명
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
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-all group ${targetTeamId === t.id ? 'bg-indigo-900/20' : ''}`}
                                        >
                                            <TeamLogo teamId={t.id} size="xs" className="opacity-70 group-hover:opacity-100" />
                                            <span className={`text-xs font-bold uppercase truncate ${targetTeamId === t.id ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}>{t.city} {t.name}</span>
                                            {targetTeamId === t.id && <CheckCircle2 size={14} className="ml-auto text-indigo-500 flex-shrink-0" />}
                                        </button>
                                    ))}
                            </div>
                        </Dropdown>
                    </div>
                </div>

                {/* 바디 */}
                {selectedTargetTeam ? (
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                        {/* 픽 요청 섹션 */}
                        {showTargetPicks && targetPicks.length > 0 && (
                            <div className="mx-3 mt-3 mb-1 rounded-xl border border-red-500/20 bg-red-500/5 overflow-hidden">
                                <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-400 border-b border-red-500/15">
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

                        {/* 컬럼 헤더 */}
                        <div className="flex items-center gap-2.5 px-3 pt-3 pb-1 mx-2">
                            <div className="w-[18px] flex-shrink-0" />
                            <div className="w-8 flex-shrink-0 text-center text-[9px] font-black uppercase text-slate-600">OVR</div>
                            <div className="flex-1 text-[9px] font-black uppercase text-slate-600">선수</div>
                            <div className="w-8 text-center text-[9px] font-black uppercase text-slate-600">POS</div>
                            <div className="w-6 text-center text-[9px] font-black uppercase text-slate-600">AGE</div>
                            <div className="w-16 text-right text-[9px] font-black uppercase text-slate-600">연봉</div>
                        </div>

                        {/* 선수 목록 */}
                        <div className="pb-3">
                            {targetTeamRoster.map(p =>
                                renderPlayerRow(
                                    p,
                                    requestedPlayerIds.has(p.id),
                                    isTradeDeadlinePassed,
                                    () => toggleTargetPlayer(p.id),
                                    (e) => { e.stopPropagation(); handleViewPlayer(p); },
                                    'indigo'
                                )
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-600 bg-slate-900">
                        <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                            <Search size={20} className="text-slate-600" />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-widest">상대 팀을 선택하세요</p>
                    </div>
                )}
            </div>

            {/* ── 우측 패널: 내 제안 ── */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* 헤더 */}
                <div className="px-6 py-3 border-b border-slate-700 flex justify-between items-center bg-slate-800 flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">내 제안 자산</span>
                        {userPicks.length > 0 && (
                            <button
                                onClick={() => setShowMyPicks(!showMyPicks)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                                    showMyPicks
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <Package size={10} className="inline mr-1" />픽 추가
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {showInstantMode && handleRequestRequirements && (
                            <button
                                onClick={handleRequestRequirements}
                                disabled={!targetTeamId || requestedPlayerIds.size === 0 || proposalIsProcessing}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold uppercase text-[10px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {proposalIsProcessing && <Loader2 className="animate-spin" size={14} />}
                                즉시 협상
                            </button>
                        )}
                        <button
                            onClick={handleSendProposal}
                            disabled={!targetTeamId || !hasProposalContent || isTradeDeadlinePassed}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase text-[10px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Send size={12} />
                            제안 전송
                        </button>
                    </div>
                </div>

                {/* 바디 */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">

                    {/* 픽 추가 섹션 */}
                    {showMyPicks && (
                        <div className="mx-3 mt-3 mb-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
                            <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-400 border-b border-emerald-500/15">
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

                    {/* 보낼 선수 섹션 */}
                    <div>
                        <div className="flex items-center gap-2.5 px-3 pt-3 pb-1 mx-2">
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 flex-1">보낼 선수 선택</div>
                            {myOfferedPlayerIds.size > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black">
                                    {myOfferedPlayerIds.size}명
                                </span>
                            )}
                        </div>
                        <div className="pb-1">
                            {sortedUserRoster.map(p =>
                                renderPlayerRow(
                                    p,
                                    myOfferedPlayerIds.has(p.id),
                                    false,
                                    () => toggleMyPlayer(p.id),
                                    (e) => { e.stopPropagation(); handleViewPlayer(p); },
                                    'emerald'
                                )
                            )}
                        </div>
                    </div>

                    {/* 가치 비교 위젯 */}
                    {valueComparison && (
                        <div className="mx-3 mb-3 mt-2 rounded-xl border border-slate-700/60 bg-slate-800/40 overflow-hidden">
                            <div className="px-4 py-2 border-b border-slate-700/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                가치 비교
                            </div>
                            <div className="px-4 py-3">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="flex-1 text-center">
                                        <div className="text-[9px] font-black uppercase text-slate-600 mb-1">내 자산</div>
                                        <div className="text-sm font-black text-emerald-400">
                                            {Math.round(valueComparison.myTotal).toLocaleString()}
                                        </div>
                                    </div>
                                    <ArrowRight size={14} className="text-slate-700" />
                                    <div className="flex-1 text-center">
                                        <div className="text-[9px] font-black uppercase text-slate-600 mb-1">상대 자산</div>
                                        <div className="text-sm font-black text-red-400">
                                            {Math.round(valueComparison.targetTotal).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                                <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            valueComparison.ratio >= 0.9
                                                ? 'bg-emerald-500'
                                                : valueComparison.ratio >= 0.7
                                                    ? 'bg-amber-500'
                                                    : 'bg-red-500'
                                        }`}
                                        style={{ width: `${Math.min(100, valueComparison.ratio * 100)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between mt-1.5">
                                    <span className={`text-[10px] font-black ${
                                        valueComparison.ratio >= 0.9
                                            ? 'text-emerald-400'
                                            : valueComparison.ratio >= 0.7
                                                ? 'text-amber-400'
                                                : 'text-red-400'
                                    }`}>
                                        {valueComparison.ratio >= 0.9 ? '공정 거래' : valueComparison.ratio >= 0.7 ? '약간 부족' : '크게 부족'}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-500">
                                        {(valueComparison.ratio * 100).toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 즉시 협상 결과 (Tab 3) */}
                    {showInstantMode && proposalSearchPerformed && (
                        <div className="mx-3 mb-3 mt-2 rounded-xl border border-slate-700/60 overflow-hidden">
                            <div className="px-4 py-2 bg-slate-800/60 border-b border-slate-700/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                즉시 협상 결과 {proposalRequirements.length > 0 && `(${proposalRequirements.length}건)`}
                            </div>
                            {proposalRequirements.length > 0 ? (
                                <div className="p-3 space-y-3">
                                    {proposalRequirements.map((req, idx) => (
                                        <div key={idx} className="rounded-xl border border-slate-700/50 bg-slate-900 overflow-hidden">
                                            <div className="px-4 py-2.5 bg-slate-950/60 flex items-center justify-between">
                                                <span className="text-xs font-black uppercase tracking-tight text-slate-300">
                                                    요구 자산 ({req.players.length}인)
                                                </span>
                                                <button
                                                    onClick={() => selectedTargetTeam && onAcceptRequirement?.(req, selectedTargetTeam)}
                                                    className="px-3 py-1.5 rounded-xl font-bold text-xs uppercase text-white bg-indigo-600 hover:bg-indigo-500 transition-all active:scale-95"
                                                >
                                                    수락
                                                </button>
                                            </div>
                                            <div className="divide-y divide-slate-800/50 px-1 py-1">
                                                {req.players.map(p => {
                                                    const ovr = calculatePlayerOvr(p);
                                                    return (
                                                        <div key={p.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                                                            <OvrBadge value={ovr} size="sm" />
                                                            <span
                                                                className="font-bold text-sm text-slate-200 truncate hover:text-indigo-400 cursor-pointer flex-1"
                                                                onClick={() => handleViewPlayer(p)}
                                                            >
                                                                {p.name}
                                                            </span>
                                                            <span className="text-[10px] font-black uppercase text-slate-500 w-8 text-center">{p.position}</span>
                                                            <span className="text-xs font-mono font-bold text-slate-300 w-16 text-right">{formatMoney(p.salary)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-8 flex flex-col items-center justify-center gap-3">
                                    <div className="p-5 bg-red-500/10 rounded-2xl border border-red-500/20">
                                        <X size={28} className="text-red-500/50" />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-bold text-sm text-slate-500">협상 결렬</p>
                                        <p className="text-xs text-slate-600 mt-1">상대방이 트레이드에 관심이 없거나,<br/>샐러리 캡 조건을 맞출 수 없습니다.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 빈 상태 */}
                    {!proposalSearchPerformed && !showMyPicks && myOfferedPlayerIds.size === 0 && !valueComparison && (
                        <div className="py-12 flex flex-col items-center justify-center gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                                <Send size={22} className="text-slate-600" />
                            </div>
                            <div className="text-center space-y-1">
                                <p className="font-black text-sm text-slate-500 uppercase tracking-widest">제안 구성</p>
                                <p className="text-xs text-slate-600">
                                    좌측에서 영입할 선수를 선택하고<br/>
                                    우측에서 보낼 자산을 구성하세요.
                                </p>
                                <p className="text-[10px] font-bold text-indigo-400/60 pt-1">
                                    &quot;제안 전송&quot; 시 다음 시뮬에서 CPU가 응답합니다.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
