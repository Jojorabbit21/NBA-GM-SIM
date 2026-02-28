
import React, { useState } from 'react';
import { Loader2, X, Search, CheckCircle2, Check } from 'lucide-react';
import { Player, Team, TradeOffer } from '../../../types';
import { Dropdown, DropdownButton } from '../../common/Dropdown';
import { TeamLogo } from '../../common/TeamLogo';
import { OvrBadge } from '../../common/OvrBadge';
import { calculatePlayerOvr } from '../../../utils/constants';

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
    allOtherTeamsSorted
}) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const selectedTargetTeam = teams.find(t => t.id === proposalTargetTeamId);

    const handleTeamSelect = (id: string) => {
        setProposalTargetTeamId(id);
        setIsDropdownOpen(false);
        setSearchTerm('');
        setProposalSelectedIds(new Set());
        setProposalRequirements([]);
        setProposalSearchPerformed(false);
    };

    return (
        <div className="flex flex-1 min-h-0 h-full">
            {/* Left: Target Team Roster */}
            <div className="flex-1 flex flex-col border-r border-slate-800 min-w-0">
                {/* Left Panel Header */}
                <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-800 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">상대 로스터</span>
                        {selectedTargetTeam && (
                            <span className={`text-[10px] font-black uppercase tracking-widest ${proposalSelectedIds.size > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>
                                {proposalSelectedIds.size}명 선택
                            </span>
                        )}
                    </div>
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
                        <div className="p-3 border-b border-slate-800 bg-slate-800">
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

                {/* Left Panel Body */}
                {selectedTargetTeam ? (
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                        <table className="w-full text-left border-separate border-spacing-0">
                            <thead className="bg-slate-800 sticky top-0 z-10">
                                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                                    <th className="py-2.5 px-3 w-8 border-b border-slate-800"></th>
                                    <th className="py-2.5 px-1 w-10 border-b border-slate-800 text-center">OVR</th>
                                    <th className="py-2.5 px-3 border-b border-slate-800">선수</th>
                                    <th className="py-2.5 px-2 w-10 border-b border-slate-800 text-center">POS</th>
                                    <th className="py-2.5 px-2 w-10 border-b border-slate-800 text-center">AGE</th>
                                    <th className="py-2.5 px-3 w-16 border-b border-slate-800 text-right">연봉</th>
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
                                            <td className="py-2 px-2 border-b border-slate-800/50 text-center text-[10px] font-bold text-slate-400 uppercase">{p.position}</td>
                                            <td className="py-2 px-2 border-b border-slate-800/50 text-center text-xs font-mono text-slate-400">{p.age}</td>
                                            <td className="py-2 px-3 border-b border-slate-800/50 text-right text-xs font-mono font-bold text-slate-300">${p.salary}M</td>
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

            {/* Right: Requirements */}
            <div className="w-[420px] lg:w-[480px] flex flex-col flex-shrink-0 min-w-0">
                {/* Right Panel Header */}
                <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-800 flex-shrink-0">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                        상대방 요구 조건 {proposalSearchPerformed && proposalRequirements.length > 0 && `(${proposalRequirements.length}건)`}
                    </span>
                    <button
                        onClick={handleRequestRequirements}
                        disabled={!proposalTargetTeamId || proposalSelectedIds.size === 0 || proposalIsProcessing}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {proposalIsProcessing && <Loader2 className="animate-spin" size={14} />}
                        협상 시도
                    </button>
                </div>

                {/* Right Panel Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                    {!proposalSearchPerformed ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3">
                            <p className="font-black text-sm text-slate-500 uppercase oswald tracking-widest">협상 대기</p>
                            <p className="text-xs font-bold text-slate-600 text-center">
                                영입하고 싶은 선수를 선택 후<br/>
                                협상을 시도하세요.
                            </p>
                        </div>
                    ) : proposalRequirements.length > 0 ? (
                        <div className="p-4 space-y-4">
                            {proposalRequirements.map((req, idx) => {
                                return (
                                    <div key={idx} className="rounded-xl border border-slate-700/50 bg-slate-900 overflow-hidden">
                                        {/* Card Header */}
                                        <div className="px-5 py-3 bg-slate-950/60 flex items-center justify-between">
                                            <span className="text-xs font-black uppercase oswald tracking-tight text-slate-300">
                                                요구 자산 ({req.players.length}인)
                                            </span>
                                            <button
                                                onClick={() => selectedTargetTeam && onAcceptRequirement(req, selectedTargetTeam)}
                                                className="px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-500 transition-all active:scale-95"
                                            >
                                                제안 수락
                                            </button>
                                        </div>
                                        {/* Card Body — Players */}
                                        <div className="divide-y divide-slate-800/50">
                                            {req.players.map(p => {
                                                const ovr = calculatePlayerOvr(p);
                                                return (
                                                    <div key={p.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/5 transition-colors">
                                                        <OvrBadge value={ovr} size="sm" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className="font-bold text-sm text-slate-200 truncate hover:text-indigo-400 hover:underline cursor-pointer"
                                                                    onClick={() => handleViewPlayer(p)}
                                                                >
                                                                    {p.name}
                                                                </span>
                                                                {p.health !== 'Healthy' && (
                                                                    <span className={`px-1 py-0.5 rounded text-[8px] font-black uppercase flex-shrink-0 ${p.health === 'Injured' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                                                        {p.health === 'Injured' ? 'OUT' : 'DTD'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase w-8 text-center">{p.position}</span>
                                                        <span className="text-xs font-mono text-slate-500 w-6 text-center">{p.age}</span>
                                                        <span className="text-xs font-mono font-bold text-slate-300 w-16 text-right">${p.salary.toFixed(1)}M</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3">
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
            </div>
        </div>
    );
};
