
import React, { useState, useMemo } from 'react';
import { Target, Zap, Shield, Activity } from 'lucide-react';
import { Player, Team } from '../types';
import { getTeamLogoUrl } from '../utils/constants';
import { calculatePlayerOvr } from '../utils/constants';
import { VisualShotChart } from './VisualShotChart';
import { TEAM_DATA } from '../data/teamData';
import { Modal } from './common/Modal'; // New Modal
import { OvrBadge } from './common/OvrBadge'; // New OvrBadge

interface PlayerDetailModalProps {
    player: Player;
    teamName?: string;
    teamId?: string;
    allTeams?: Team[];
    onClose: () => void;
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({ player, teamName, teamId, allTeams, onClose }) => {
    const [activeTab, setActiveTab] = useState<'attributes' | 'stats'>('attributes');

    // Flatten all players for ranking
    const allPlayers = useMemo(() => {
        if (!allTeams) return undefined;
        return allTeams.flatMap(t => t.roster);
    }, [allTeams]);

    // Determine Team Color
    const teamColor = teamId ? (TEAM_DATA[teamId]?.colors.primary || '#6366f1') : '#6366f1';

    const AttributeRow = ({ label, value, isGrade = false }: { label: string, value: number, isGrade?: boolean }) => (
        <div className={`flex items-center justify-between py-1.5 ${isGrade ? 'border-t border-slate-700/60 mt-2 pt-2' : 'border-b border-slate-800/40 last:border-0'}`}>
            <span className={`text-xs font-bold uppercase tracking-tight ${isGrade ? 'text-white' : 'text-slate-400'}`}>{label}</span>
            <span className={`text-sm font-black font-mono ${value >= 90 ? 'text-fuchsia-400' : value >= 80 ? 'text-emerald-400' : value >= 70 ? 'text-amber-400' : 'text-slate-500'}`}>{value}</span>
        </div>
    );

    const calculatedOvr = calculatePlayerOvr(player);

    const headerContent = (
        <div className="flex items-center gap-6">
            <OvrBadge value={calculatedOvr} size="xl" />
            <div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tight leading-none oswald">{player.name}</h2>
                <div className="flex items-center gap-4 mt-2 text-sm font-bold text-slate-400">
                    {teamId && <div className="flex items-center gap-2"><img src={getTeamLogoUrl(teamId)} className="w-5 h-5 object-contain opacity-80" alt="" /> <span>{teamName || 'Free Agent'}</span></div>}
                    <div className="w-1 h-1 bg-slate-600 rounded-full"></div>
                    <span>{player.position}</span>
                    <div className="w-1 h-1 bg-slate-600 rounded-full"></div>
                    <span>{player.height}cm / {player.weight}kg</span>
                    <div className="w-1 h-1 bg-slate-600 rounded-full"></div>
                    <span>{player.age}세</span>
                </div>
            </div>
        </div>
    );

    return (
        <Modal isOpen={true} onClose={onClose} title={headerContent} size="xl" headerColor={teamColor}>
            
            {/* Tab Navigation */}
            <div className="px-8 border-b border-slate-800 bg-slate-950 flex gap-6 sticky top-0 z-20">
                <button 
                    onClick={() => setActiveTab('attributes')}
                    className={`py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'attributes' ? 'text-white' : 'text-slate-500 border-transparent hover:text-white'}`}
                    style={activeTab === 'attributes' ? { borderColor: teamColor, color: teamColor } : {}}
                >
                    능력치
                </button>
                <button 
                    onClick={() => setActiveTab('stats')}
                    className={`py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'stats' ? 'text-white' : 'text-slate-500 border-transparent hover:text-white'}`}
                    style={activeTab === 'stats' ? { borderColor: teamColor, color: teamColor } : {}}
                >
                    시즌 기록 & 샷차트
                </button>
            </div>

            <div className="p-8 bg-slate-900/50">
                {activeTab === 'attributes' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-300">
                        {/* Scoring */}
                        <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 flex flex-col gap-4">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                                <Target size={16} className="text-orange-400" />
                                <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">스코어링</h4>
                            </div>
                            <div className="space-y-1">
                                <AttributeRow label="레이업" value={player.layup} />
                                <AttributeRow label="덩크" value={player.dunk} />
                                <AttributeRow label="포스트" value={player.postPlay} />
                                <AttributeRow label="미드레인지" value={player.midRange} />
                                <AttributeRow label="3점" value={Math.round((player.threeCorner + player.three45 + player.threeTop)/3)} /> 
                                <AttributeRow label="자유투" value={player.ft} />
                                <AttributeRow label="오펜스" value={Math.round((player.ins + player.out)/2)} isGrade />
                            </div>
                        </div>

                        {/* Playmaking */}
                        <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 flex flex-col gap-4">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                                <Zap size={16} className="text-yellow-400" />
                                <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">플레이메이킹</h4>
                            </div>
                            <div className="space-y-1">
                                <AttributeRow label="패스 정확도" value={player.passAcc} />
                                <AttributeRow label="핸들링" value={player.handling} />
                                <AttributeRow label="스피드(볼)" value={player.spdBall} />
                                <AttributeRow label="시야" value={player.passVision} />
                                <AttributeRow label="IQ" value={player.passIq} />
                                <AttributeRow label="플레이메이킹" value={player.plm} isGrade />
                            </div>
                        </div>

                        {/* Defense */}
                        <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 flex flex-col gap-4">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                                <Shield size={16} className="text-blue-400" />
                                <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">수비 & 리바운드</h4>
                            </div>
                            <div className="space-y-1">
                                <AttributeRow label="내곽 수비" value={player.intDef} />
                                <AttributeRow label="외곽 수비" value={player.perDef} />
                                <AttributeRow label="스틸" value={player.steal} />
                                <AttributeRow label="블락" value={player.blk} />
                                <AttributeRow label="공격 리바운드" value={player.offReb} />
                                <AttributeRow label="수비 리바운드" value={player.defReb} />
                                <AttributeRow label="디펜스" value={player.def} isGrade />
                            </div>
                        </div>

                        {/* Athleticism */}
                        <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 flex flex-col gap-4">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                                <Activity size={16} className="text-emerald-400" />
                                <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">피지컬</h4>
                            </div>
                            <div className="space-y-1">
                                <AttributeRow label="속도" value={player.speed} />
                                <AttributeRow label="민첩성" value={player.agility} />
                                <AttributeRow label="힘" value={player.strength} />
                                <AttributeRow label="점프력" value={player.vertical} />
                                <AttributeRow label="지구력" value={player.stamina} />
                                <AttributeRow label="운동 능력" value={player.ath} isGrade />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'stats' && (
                    <div className="animate-in fade-in duration-300">
                        <VisualShotChart player={player} allPlayers={allPlayers} />
                    </div>
                )}
            </div>
        </Modal>
    );
};
