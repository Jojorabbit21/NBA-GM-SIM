import React from 'react';
import { GameTactics, Player, OffenseTactic, DefenseTactic } from '../../types';
import { OFFENSE_TACTIC_INFO, DEFENSE_TACTIC_INFO, getEfficiencyStyles } from '../../utils/tacticUtils';
import { HelpCircle, Zap, Shield, RotateCcw, Sliders as SlidersIcon, Info } from 'lucide-react';

const SliderControl: React.FC<{ label: string, value: number, onChange: (val: number) => void, min?: number, max?: number, leftLabel?: string, rightLabel?: string, tooltip?: string }> = ({ label, value, onChange, min=1, max=10, leftLabel, rightLabel, tooltip }) => (
  <div className="space-y-2 group/slider w-full">
    <div className="flex justify-between items-end">
      <div className="flex items-center gap-1.5 relative">
        <span className="text-sm font-black text-slate-400 uppercase tracking-tight cursor-help">{label}</span>
        {tooltip && (
            <div className="relative group/tooltip">
                <HelpCircle size={14} className="text-slate-600 hover:text-indigo-400 transition-colors cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-900 border border-slate-700 text-slate-300 text-[10px] p-2.5 rounded-xl shadow-2xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 font-medium break-keep leading-relaxed text-center">
                    {tooltip}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-b border-r border-slate-700 rotate-45"></div>
                </div>
            </div>
        )}
      </div>
      <span className="text-lg font-black text-indigo-400 font-mono">{value}</span>
    </div>
    <div className="relative flex items-center h-6">
       <input 
         type="range" 
         min={min} 
         max={max} 
         value={value} 
         onChange={(e) => onChange(parseInt(e.target.value))} 
         className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
       />
    </div>
    <div className="flex justify-between text-xs font-bold text-slate-600 uppercase tracking-tighter">
       <span>{leftLabel || 'Low'}</span>
       <span>{rightLabel || 'High'}</span>
    </div>
  </div>
);

interface TacticsBoardProps {
  tactics: GameTactics;
  roster: Player[];
  onUpdateTactics: (t: GameTactics) => void;
  onAutoSet: () => void;
  calculateTacticScore: (type: OffenseTactic | DefenseTactic) => number;
}

export const TacticsBoard: React.FC<TacticsBoardProps> = ({ tactics, roster, onUpdateTactics, onAutoSet, calculateTacticScore }) => {
    
    const handleSliderChange = (key: keyof typeof tactics.sliders, value: number) => {
        onUpdateTactics({
            ...tactics,
            sliders: { ...tactics.sliders, [key]: value }
        });
    };

    const handleOffenseChange = (type: OffenseTactic) => {
        onUpdateTactics({ ...tactics, offenseTactics: [type] });
    };

    const handleDefenseChange = (type: DefenseTactic) => {
        onUpdateTactics({ ...tactics, defenseTactics: [type] });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-8 h-full bg-slate-950/20">
            {/* Left Column: Tactic Selection */}
            <div className="lg:col-span-7 flex flex-col gap-8">
                {/* Offense */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col gap-6 relative overflow-hidden">
                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-orange-500/10 rounded-xl"><Zap size={20} className="text-orange-500" /></div>
                            <h3 className="text-lg font-black uppercase text-white tracking-widest oswald">Offensive Scheme</h3>
                        </div>
                        <button onClick={onAutoSet} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-400 transition-all">
                            <RotateCcw size={14} /> Auto Set
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                        {(Object.keys(OFFENSE_TACTIC_INFO) as OffenseTactic[]).map((t) => {
                            const info = OFFENSE_TACTIC_INFO[t];
                            const isSelected = tactics.offenseTactics[0] === t;
                            const score = calculateTacticScore(t);
                            const style = getEfficiencyStyles(score);

                            return (
                                <button 
                                    key={t}
                                    onClick={() => handleOffenseChange(t)}
                                    className={`relative p-4 rounded-2xl border text-left transition-all group ${isSelected ? 'bg-indigo-600 border-indigo-500 shadow-xl' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-xs font-black uppercase tracking-tight ${isSelected ? 'text-white' : 'text-slate-300'}`}>{info.label}</span>
                                        <div className={`px-2 py-0.5 rounded text-[10px] font-black ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-900 text-slate-500'}`}>
                                            FIT: {score}
                                        </div>
                                    </div>
                                    <p className={`text-[10px] leading-snug ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>{info.desc}</p>
                                    {isSelected && <div className="absolute inset-0 border-2 border-indigo-400 rounded-2xl opacity-50 animate-pulse pointer-events-none"></div>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Defense */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col gap-6 relative overflow-hidden">
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="p-2 bg-blue-500/10 rounded-xl"><Shield size={20} className="text-blue-500" /></div>
                        <h3 className="text-lg font-black uppercase text-white tracking-widest oswald">Defensive Scheme</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
                        {(Object.keys(DEFENSE_TACTIC_INFO) as DefenseTactic[]).map((t) => {
                            const info = DEFENSE_TACTIC_INFO[t];
                            const isSelected = tactics.defenseTactics[0] === t;
                            const score = calculateTacticScore(t);

                            return (
                                <button 
                                    key={t}
                                    onClick={() => handleDefenseChange(t)}
                                    className={`relative p-4 rounded-2xl border text-left transition-all group ${isSelected ? 'bg-indigo-600 border-indigo-500 shadow-xl' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-xs font-black uppercase tracking-tight ${isSelected ? 'text-white' : 'text-slate-300'}`}>{info.label}</span>
                                        <div className={`px-2 py-0.5 rounded text-[10px] font-black ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-900 text-slate-500'}`}>
                                            FIT: {score}
                                        </div>
                                    </div>
                                    <p className={`text-[10px] leading-snug ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>{info.desc}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Right Column: Sliders */}
            <div className="lg:col-span-5 flex flex-col gap-8">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 h-full flex flex-col">
                    <div className="flex items-center gap-3 mb-8 border-b border-slate-800 pb-4">
                        <div className="p-2 bg-indigo-500/10 rounded-xl"><SlidersIcon size={20} className="text-indigo-500" /></div>
                        <div>
                            <h3 className="text-lg font-black uppercase text-white tracking-widest oswald">Tactical Adjustments</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Fine-tune your strategy</p>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col gap-8 overflow-y-auto custom-scrollbar pr-2">
                        <SliderControl 
                            label="Game Pace" 
                            value={tactics.sliders.pace} 
                            onChange={(v) => handleSliderChange('pace', v)} 
                            leftLabel="Slow (Grind)" 
                            rightLabel="Fast (Run)"
                            tooltip="경기 템포를 조절합니다. 빠를수록 공격 횟수가 늘어나지만 체력 소모와 턴오버가 증가합니다."
                        />
                        <SliderControl 
                            label="Offensive Rebound" 
                            value={tactics.sliders.offReb} 
                            onChange={(v) => handleSliderChange('offReb', v)} 
                            leftLabel="Get Back" 
                            rightLabel="Crash Glass"
                            tooltip="공격 리바운드 참여도를 조절합니다. 높으면 세컨 찬스가 늘어나지만, 속공 허용 위험이 커집니다."
                        />
                        <SliderControl 
                            label="Defensive Intensity" 
                            value={tactics.sliders.defIntensity} 
                            onChange={(v) => handleSliderChange('defIntensity', v)} 
                            leftLabel="Conservative" 
                            rightLabel="Aggressive"
                            tooltip="수비 적극성을 조절합니다. 높으면 스틸과 슛 억제력이 좋아지지만, 파울과 체력 소모가 급증합니다."
                        />
                        <SliderControl 
                            label="Defensive Rebound" 
                            value={tactics.sliders.defReb} 
                            onChange={(v) => handleSliderChange('defReb', v)} 
                            leftLabel="Leak Out" 
                            rightLabel="Box Out"
                            tooltip="수비 리바운드 집중도를 조절합니다. 높으면 리바운드를 확실히 단속하지만, 속공 전개가 늦어질 수 있습니다."
                        />
                        <SliderControl 
                            label="Full Court Press" 
                            value={tactics.sliders.fullCourtPress} 
                            onChange={(v) => handleSliderChange('fullCourtPress', v)} 
                            leftLabel="Half Court" 
                            rightLabel="Full Press"
                            tooltip="전방 압박 빈도를 조절합니다. 높으면 상대 턴오버를 유발하지만, 체력이 매우 빨리 소모되고 뒷공간이 노출될 수 있습니다."
                        />
                        <SliderControl 
                            label="Zone Frequency" 
                            value={tactics.sliders.zoneUsage} 
                            onChange={(v) => handleSliderChange('zoneUsage', v)} 
                            leftLabel="Man-to-Man" 
                            rightLabel="Zone Heavy"
                            tooltip="지역 방어 사용 빈도를 조절합니다. 높으면 골밑을 강화하지만, 3점 슛을 허용할 가능성이 커집니다."
                        />
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-slate-800">
                        <div className="flex items-start gap-3 bg-indigo-900/20 p-4 rounded-xl">
                            <Info size={16} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-indigo-200/80 leading-relaxed font-medium">
                                슬라이더 조정은 팀의 에너지 레벨과 파울 트러블에 직접적인 영향을 미칩니다. 선수들의 체력 상태를 고려하여 신중하게 조정하십시오.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
