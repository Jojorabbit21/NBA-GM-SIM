
import React, { useState } from 'react';
import { Handshake, Loader2, Target, X, Search, CheckCircle2 } from 'lucide-react';
import { Player, Team, TradeOffer } from '../../../types';
import { TradeRosterList } from '../TradeRosterList';
import { RequirementCard } from '../RequirementCard';
import { Dropdown, DropdownButton } from '../../common/Dropdown';
import { TeamLogo } from '../../common/TeamLogo';

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
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="px-8 py-4 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-4">
                    <span className="text-xs font-black uppercase text-slate-400 tracking-widest">
                        상대 구단 선택:
                    </span>
                    <Dropdown
                        isOpen={isDropdownOpen}
                        onOpenChange={setIsDropdownOpen}
                        width="w-80"
                        trigger={
                            <DropdownButton 
                                isOpen={isDropdownOpen}
                                label={selectedTargetTeam ? `${selectedTargetTeam.city} ${selectedTargetTeam.name}` : '상대 팀 선택...'}
                                icon={selectedTargetTeam ? <TeamLogo teamId={selectedTargetTeam.id} size="sm" /> : undefined}
                                className="w-64 h-12"
                            />
                        }
                    >
                        <div className="p-3 border-b border-slate-800 bg-slate-950/50">
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

                <button 
                    onClick={handleRequestRequirements}
                    disabled={!proposalTargetTeamId || proposalSelectedIds.size === 0 || proposalIsProcessing}
                    className="px-8 py-3 bg-white hover:bg-slate-200 text-slate-900 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] flex items-center gap-3 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {proposalIsProcessing ? <Loader2 className="animate-spin" size={16} /> : <Handshake size={16} />}
                    <span>협상 시도 (Ask Price)</span>
                </button>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Left: Target Team Roster */}
                <div className="flex-1 flex flex-col border-r border-slate-800 bg-slate-950/30 min-w-0">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                            {selectedTargetTeam ? `${selectedTargetTeam.name} Roster (Targets)` : 'Target Roster'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">{proposalSelectedIds.size} wanted</span>
                    </div>
                    {selectedTargetTeam ? (
                        <TradeRosterList 
                            roster={targetTeamRoster} 
                            selectedIds={proposalSelectedIds} 
                            onToggle={toggleProposalPlayer} 
                            onViewPlayer={handleViewPlayer} 
                            isTradeDeadlinePassed={isTradeDeadlinePassed}
                            mode="Proposal"
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                            <Target size={40} className="opacity-20 mb-4" />
                            <p className="text-xs font-bold uppercase tracking-widest">상대 팀을 먼저 선택해주세요</p>
                        </div>
                    )}
                </div>
                
                {/* Right: Counter Offers */}
                <div className="w-[450px] lg:w-[500px] bg-slate-900/50 p-6 overflow-y-auto custom-scrollbar border-l border-slate-800 flex-shrink-0">
                    <div className="mb-6 flex items-center gap-3 text-slate-400 border-b border-slate-800/50 pb-3">
                            <Handshake size={20} />
                            <h4 className="font-black uppercase text-sm tracking-widest">상대방의 요구 조건</h4>
                    </div>

                    {!proposalSearchPerformed ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-600 text-center">
                            <p className="text-xs font-bold mb-2">영입하고 싶은 선수를 선택 후<br/>협상을 시도하세요.</p>
                        </div>
                    ) : proposalRequirements.length > 0 ? (
                        <div className="space-y-4">
                            {proposalRequirements.map((req, idx) => (
                                <RequirementCard 
                                    key={idx} 
                                    requirement={req}
                                    targetPlayers={targetTeamRoster.filter(p => proposalSelectedIds.has(p.id))}
                                    onPlayerClick={handleViewPlayer}
                                    onAccept={() => selectedTargetTeam && onAcceptRequirement(req, selectedTargetTeam)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-600 text-center space-y-4">
                            <div className="p-6 bg-red-500/10 rounded-full border border-red-500/20">
                                <X size={32} className="text-red-500/50" />
                            </div>
                            <div>
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
