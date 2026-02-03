
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Activity, Shield, Zap, Target } from 'lucide-react';
import { Player } from '../types';
import { getTeamLogoUrl } from '../utils/constants';
import { getOvrBadgeStyle } from './SharedComponents';
import { VisualShotChart } from './VisualShotChart';

interface PlayerDetailModalProps {
    player: Player;
    teamName?: string;
    teamId?: string;
    onClose: () => void;
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({ player, teamName, teamId, onClose }) => {
    const [activeTab, setActiveTab] = useState<'attributes' | 'stats'>('attributes');

    // Prevent background scrolling
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    const AttributeRow = ({ label, value, isGrade = false }: { label: string, value: number, isGrade?: boolean }) => (
        <div className={`flex items-center justify-between py-1 ${isGrade ? 'border-t border-slate-700/60 mt-2 pt-2' : 'border-b border-slate-800/40 last:border-0'}`}>
            <span className={`text-xs font-bold uppercase tracking-tight ${isGrade ? 'text-white' : 'text-slate-400'}`}>{label}</span>
            <span className={`text-sm font-black font-mono ${value >= 90 ? 'text-fuchsia-400' : value >= 80 ? 'text-emerald-400' : value >= 70 ? 'text-amber-400' : 'text-slate-500'}`}>{value}</span>
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-[2rem] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden relative" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                    <div className="flex items-center gap-6">
                        <div className={getOvrBadgeStyle(player.ovr) + " !w-16 !h-16 !text-3xl !rounded-2xl shadow-lg"}>{player.ovr}</div>
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
                    <button onClick={onClose} className="p-3 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="px-8 border-b border-slate-800 bg-slate-950 flex gap-6">
                    <button 
                        onClick={() => setActiveTab('attributes')}
                        className={`py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'attributes' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent hover:text-white'}`}
                    >
                        능력치 (Attributes)
                    </button>
                    <button 
                        onClick={() => setActiveTab('stats')}
                        className={`py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'stats' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent hover:text-white'}`}
                    >
                        시즌 기록 (Stats)
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900/50">
                    <div className="p-8">
                        
                        {/* Tab 1: Attributes Grid */}
                        {activeTab === 'attributes' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-300">
                                
                                {/* Scoring (INSIDE + OUTSIDE) */}
                                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 flex flex-col gap-6">
                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                                        <Target size={16} className="text-orange-400" />
                                        <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">스코어링</h4>
                                    </div>
                                    
                                    {/* Inside Subgroup */}
                                    <div className="space-y-1">
                                        <AttributeRow label="레이업" value={player.layup} />
                                        <AttributeRow label="덩크" value={player.dunk} />
                                        <AttributeRow label="포스트 플레이" value={player.postPlay} />
                                        <AttributeRow label="파울 유도" value={player.drawFoul} />
                                        <AttributeRow label="손끝 감각" value={player.hands} />
                                        <AttributeRow label="INS GRADE" value={player.ins} isGrade />
                                    </div>
                                    
                                    {/* Outside Subgroup */}
                                    <div className="space-y-1">
                                        <AttributeRow label="근접" value={player.closeShot} />
                                        <AttributeRow label="미드레인지" value={player.midRange} />
                                        <AttributeRow label="3점" value={player.threeCorner} /> 
                                        <AttributeRow label="자유투" value={player.ft} />
                                        <AttributeRow label="슈팅 IQ" value={player.shotIq} />
                                        <AttributeRow label="공격 일관성" value={player.offConsist} />
                                        <AttributeRow label="OUT GRADE" value={player.out} isGrade />
                                    </div>
                                </div>

                                {/* Playmaking */}
                                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 h-fit">
                                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
                                        <Zap size={16} className="text-yellow-400" />
                                        <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">플레이메이킹</h4>
                                    </div>
                                    <div className="space-y-1">
                                        <AttributeRow label="패스 정확도" value={player.passAcc} />
                                        <AttributeRow label="핸들링" value={player.handling} />
                                        <AttributeRow label="드리블 속도" value={player.spdBall} />
                                        <AttributeRow label="시야" value={player.passVision} />
                                        <AttributeRow label="패스 지능" value={player.passIq} />
                                        <AttributeRow label="PLM GRADE" value={player.plm} isGrade />
                                    </div>
                                </div>

                                {/* Defense (GENERAL + REBOUND) */}
                                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 flex flex-col gap-6">
                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                                        <Shield size={16} className="text-blue-400" />
                                        <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">수비</h4>
                                    </div>
                                    
                                    {/* General Defense */}
                                    <div className="space-y-1">
                                        <AttributeRow label="내곽 수비" value={player.intDef} />
                                        <AttributeRow label="외곽 수비" value={player.perDef} />
                                        <AttributeRow label="스틸" value={player.steal} />
                                        <AttributeRow label="블락" value={player.blk} />
                                        <AttributeRow label="도움 수비 IQ" value={player.helpDefIq} />
                                        <AttributeRow label="패스 예측" value={player.passPerc} />
                                        <AttributeRow label="수비 일관성" value={player.defConsist} />
                                        <AttributeRow label="DEF GRADE" value={player.def} isGrade />
                                    </div>

                                    {/* Rebound */}
                                    <div className="space-y-1">
                                        <AttributeRow label="공격 리바운드" value={player.offReb} />
                                        <AttributeRow label="수비 리바운드" value={player.defReb} />
                                        <AttributeRow label="REB GRADE" value={player.reb} isGrade />
                                    </div>
                                </div>

                                {/* Athleticism */}
                                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 h-fit">
                                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
                                        <Activity size={16} className="text-emerald-400" />
                                        <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">운동능력</h4>
                                    </div>
                                    <div className="space-y-1">
                                        <AttributeRow label="속도" value={player.speed} />
                                        <AttributeRow label="민첩성" value={player.agility} />
                                        <AttributeRow label="힘" value={player.strength} />
                                        <AttributeRow label="점프력" value={player.vertical} />
                                        <AttributeRow label="지구력" value={player.stamina} />
                                        <AttributeRow label="허슬" value={player.hustle} />
                                        <AttributeRow label="내구도" value={player.durability} />
                                        <AttributeRow label="ATH GRADE" value={player.ath} isGrade />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab 2: Stats & Shot Chart */}
                        {activeTab === 'stats' && (
                            <div className="animate-in fade-in duration-300">
                                <VisualShotChart player={player} />
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
