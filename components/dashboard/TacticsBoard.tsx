import React, { useState } from 'react';
import { 
    Target, Shield, Sliders, Check, 
    RefreshCw, Info, ShieldAlert, ChevronDown 
} from 'lucide-react';
import { GameTactics, Player, OffenseTactic, DefenseTactic } from '../../types';
import { OFFENSE_TACTIC_INFO, DEFENSE_TACTIC_INFO, getEfficiencyStyles } from '../../utils/tacticUtils';

interface TacticsBoardProps {
    tactics: GameTactics;
    roster: Player[];
    onUpdateTactics: (t: GameTactics) => void;
    onAutoSet: () => void;
    calculateTacticScore: (type: OffenseTactic | DefenseTactic) => number;
}

const SliderControl: React.FC<{
    label: string;
    value: number;
    onChange: (val: number) => void;
    leftLabel?: string;
    rightLabel?: string;
    tooltip?: string;
}> = ({ label, value, onChange, leftLabel, rightLabel, tooltip }) => (
    <div className="space-y-3">
        <div className="flex justify-between items-center">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                {label}
                {tooltip && <div className="group relative">
                    <Info size={12} className="text-slate-600 hover:text-slate-400 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-900 border border-slate-700 p-2 rounded-lg text-[10px] text-slate-300 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
                        {tooltip}
                    </div>
                </div>}
            </label>
            <span className="text-sm font-black text-white font-mono bg-slate-800 px-2 py-0.5 rounded">{value}</span>
        </div>
        <input 
            type="range" min="1" max="10" step="1" 
            value={value} 
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
        />
        <div className="flex justify-between text-[9px] font-bold text-slate-600 uppercase tracking-tighter">
            <span>{leftLabel}</span>
            <span>{rightLabel}</span>
        </div>
    </div>
);

export const TacticsBoard: React.FC<TacticsBoardProps> = ({ 
    tactics, roster, onUpdateTactics, onAutoSet, calculateTacticScore 
}) => {
    const [isStopperOpen, setIsStopperOpen] = useState(false);
    const { sliders } = tactics;

    const handleOffenseChange = (tactic: OffenseTactic) => {
        onUpdateTactics({ ...tactics, offenseTactics: [tactic] });
    };

    const handleDefenseChange = (tactic: DefenseTactic) => {
        onUpdateTactics({ ...tactics, defenseTactics: [tactic] });
    };

    const handleStopperChange = (playerId: string) => {
        onUpdateTactics({ ...tactics, stopperId: playerId === tactics.stopperId ? undefined : playerId });
        setIsStopperOpen(false);
    };

    const getStopperName = () => {
        if (!tactics.stopperId) return "미지정";
        const p = roster.find(p => p.id === tactics.stopperId);
        return p ? p.name : "Unknown";
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 md:p-8 bg-slate-950/20">
            {/* Left Column: Tactics Selection (8 cols) */}
            <div className="lg:col-span-8 flex flex-col gap-8">
                
                {/* Header Actions */}
                <div className="flex justify-end">
                    <button 
                        onClick={onAutoSet}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-indigo-600 hover:border-indigo-500 text-slate-400 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                    >
                        <RefreshCw size={14} /> AI 자동 추천
                    </button>
                </div>

                {/* Offense Section */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 px-1">
                        <Target size={20} className="text-orange-400" />
                        <h3 className="text-base font-black text-white uppercase tracking-widest oswald">공격 전술</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(OFFENSE_TACTIC_INFO).map(([key, info]) => {
                            const isActive = tactics.offenseTactics.includes(key as OffenseTactic);
                            const score = calculateTacticScore(key as OffenseTactic);
                            const style = getEfficiencyStyles(score);

                            return (
                                <button 
                                    key={key}
                                    onClick={() => handleOffenseChange(key as OffenseTactic)}
                                    className={`relative p-5 rounded-2xl border transition-all text-left group overflow-hidden ${isActive ? 'bg-orange-500/10 border-orange-500 ring-1 ring-orange-500/50' : 'bg-slate-900/40 border-slate-800 hover:border-slate-600'}`}
                                >
                                    <div className="flex justify-between items-start mb-2 relative z-10">
                                        <div>
                                            <h4 className={`text-sm font-black uppercase tracking-tight ${isActive ? 'text-orange-400' : 'text-slate-300'}`}>{info.label}</h4>
                                            <p className="text-[10px] text-slate-500 font-bold mt-0.5">{info.desc}</p>
                                        </div>
                                        {isActive && <div className="bg-orange-500 text-white p-1 rounded-full"><Check size={12} strokeWidth={4} /></div>}
                                    </div>
                                    
                                    {/* Efficiency Bar */}
                                    <div className="mt-4 relative z-10">
                                        <div className="flex justify-between text-[9px] font-black uppercase tracking-widest mb-1">
                                            <span className="text-slate-500">예상 효율</span>
                                            <span className={style.text}>{score}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div className={`h-full ${style.bar}`} style={{ width: `${score}%` }}></div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Defense Section */}
                <div className="space-y-4 pt-4 border-t border-slate-800/50">
                    <div className="flex items-center gap-3 px-1">
                        <Shield size={20} className="text-blue-400" />
                        <h3 className="text-base font-black text-white uppercase tracking-widest oswald">수비 전술</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {Object.entries(DEFENSE_TACTIC_INFO).map(([key, info]) => {
                            const isActive = tactics.defenseTactics.includes(key as DefenseTactic);
                            const score = calculateTacticScore(key as DefenseTactic);
                            const style = getEfficiencyStyles(score);

                            return (
                                <button 
                                    key={key}
                                    onClick={() => handleDefenseChange(key as DefenseTactic)}
                                    className={`relative p-5 rounded-2xl border transition-all text-left group ${isActive ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500/50' : 'bg-slate-900/40 border-slate-800 hover:border-slate-600'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className={`text-sm font-black uppercase tracking-tight ${isActive ? 'text-blue-400' : 'text-slate-300'}`}>{info.label}</h4>
                                            <p className="text-[10px] text-slate-500 font-bold mt-0.5">{info.desc}</p>
                                        </div>
                                        {isActive && <div className="bg-blue-500 text-white p-1 rounded-full"><Check size={12} strokeWidth={4} /></div>}
                                    </div>

                                    {/* Efficiency Bar */}
                                    <div className="mt-4">
                                        <div className="flex justify-between text-[9px] font-black uppercase tracking-widest mb-1">
                                            <span className="text-slate-500">예상 효율</span>
                                            <span className={style.text}>{score}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div className={`h-full ${style.bar}`} style={{ width: `${score}%` }}></div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Ace Stopper Selection (Only if AceStopper tactic is active) */}
                    {tactics.defenseTactics.includes('AceStopper') && (
                        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-2">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-fuchsia-500/20 rounded-lg text-fuchsia-400">
                                    <ShieldAlert size={20} />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white uppercase tracking-tight">에이스 스토퍼 지정</h4>
                                    <p className="text-[10px] text-slate-400 font-bold">상대 에이스를 전담 마크할 선수를 선택하세요.</p>
                                </div>
                            </div>
                            <div className="relative">
                                <button 
                                    onClick={() => setIsStopperOpen(!isStopperOpen)}
                                    className="flex items-center gap-3 px-4 py-2 bg-slate-950 border border-slate-700 rounded-xl hover:border-fuchsia-500/50 transition-colors"
                                >
                                    <span className={`text-xs font-black uppercase ${tactics.stopperId ? 'text-fuchsia-400' : 'text-slate-500'}`}>
                                        {getStopperName()}
                                    </span>
                                    <ChevronDown size={14} className="text-slate-500" />
                                </button>
                                
                                {isStopperOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                                        <button 
                                            onClick={() => handleStopperChange('')}
                                            className="w-full text-left px-4 py-3 text-xs font-bold text-slate-500 hover:bg-slate-800 hover:text-white border-b border-slate-800"
                                        >
                                            선택 해제 (없음)
                                        </button>
                                        {roster.filter(p => p.health !== 'Injured').map(p => (
                                            <button 
                                                key={p.id}
                                                onClick={() => handleStopperChange(p.id)}
                                                className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800 border-b border-slate-800/50 last:border-0 group ${p.id === tactics.stopperId ? 'bg-fuchsia-900/20' : ''}`}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-200 group-hover:text-white">{p.name}</span>
                                                    <span className="text-[10px] text-slate-500">{p.position} | DEF {p.def}</span>
                                                </div>
                                                {p.id === tactics.stopperId && <Check size={14} className="text-fuchsia-400" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Sliders (4 cols) */}
            <div className="lg:col-span-4 flex flex-col space-y-4">
                <div className="flex flex-col gap-8 bg-slate-900/40 p-6 pt-6 rounded-2xl border border-slate-800/50 h-full">
                    <div className="flex items-center gap-3 text-indigo-400 px-1 mb-2">
                        <Sliders size={24} />
                        <span className="font-black text-sm uppercase tracking-widest oswald">디테일 전술 조정</span>
                    </div>

                    <SliderControl 
                        label="공격 페이스" 
                        value={sliders.pace} 
                        onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, pace: v } })}
                        leftLabel="슬로우 템포" rightLabel="런앤건" 
                        tooltip="수치가 높을수록 빠른 공수 전환과 얼리 오펜스를 시도하지만, 턴오버 위험과 체력 소모가 커집니다." 
                    />
                    <SliderControl 
                        label="수비 강도" 
                        value={sliders.defIntensity} 
                        onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, defIntensity: v } })}
                        leftLabel="안정적 수비" rightLabel="강한 압박" 
                        tooltip="수치가 높을수록 상대 야투 억제와 스틸 시도가 늘어나지만, 파울 트러블 위험이 커집니다." 
                    />
                    
                    <div className="w-full h-px bg-slate-800/50 my-2"></div>
                    
                    <SliderControl 
                        label="공격 리바운드" value={sliders.offReb} 
                        onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, offReb: v } })}
                        leftLabel="백코트 우선" rightLabel="적극 참여" 
                    />
                    <SliderControl 
                        label="수비 리바운드" value={sliders.defReb} 
                        onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, defReb: v } })}
                        leftLabel="속공 준비" rightLabel="박스아웃" 
                    />
                    
                    <div className="w-full h-px bg-slate-800/50 my-2"></div>
                    
                    <SliderControl 
                        label="풀 코트 프레스" value={sliders.fullCourtPress} 
                        onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, fullCourtPress: v } })}
                        leftLabel="거의 안함" rightLabel="항상 수행" 
                    />
                    <SliderControl 
                        label="존 디펜스 빈도" value={sliders.zoneUsage} 
                        onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, zoneUsage: v } })}
                        leftLabel="대인 방어" rightLabel="지역 방어" 
                    />
                </div>
            </div>
        </div>
    );
};