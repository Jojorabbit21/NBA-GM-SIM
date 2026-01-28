
import React from 'react';
import { Activity, Wand2, Target, Shield, ShieldAlert, Sliders, HelpCircle } from 'lucide-react';
import { GameTactics } from '../../services/gameEngine';
import { OffenseTactic, DefenseTactic, Team } from '../../types';
import { OFFENSE_TACTIC_INFO, DEFENSE_TACTIC_INFO, getEfficiencyStyles } from '../../utils/tacticUtils';

interface TacticsBoardProps {
  tactics: GameTactics;
  onUpdateTactics: (t: GameTactics) => void;
  onAutoSet: () => void;
  calculateTacticScore: (type: OffenseTactic | DefenseTactic) => number;
}

const SliderControl: React.FC<{ label: string, value: number, onChange: (val: number) => void, min?: number, max?: number, leftLabel?: string, rightLabel?: string, tooltip?: string }> = ({ label, value, onChange, min=1, max=10, leftLabel, rightLabel, tooltip }) => (
  <div className="space-y-2 group/slider">
    <div className="flex justify-between items-end">
      <div className="flex items-center gap-1.5 relative">
        <span className="text-sm font-black text-slate-400 uppercase tracking-tight cursor-help">{label}</span>
        {tooltip && (
            <div className="relative group/tooltip">
                <HelpCircle size={12} className="text-slate-600 hover:text-indigo-400 transition-colors cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-900 border border-slate-700 text-slate-300 text-[10px] p-2.5 rounded-xl shadow-2xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 font-medium break-keep leading-relaxed text-center">
                    {tooltip}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-b border-r border-slate-700 rotate-45"></div>
                </div>
            </div>
        )}
      </div>
      <span className="text-base font-black text-indigo-400 font-mono">{value}</span>
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
    <div className="flex justify-between text-[11px] font-bold text-slate-600 uppercase tracking-tighter">
       <span>{leftLabel || 'Low'}</span>
       <span>{rightLabel || 'High'}</span>
    </div>
  </div>
);

export const TacticsBoard: React.FC<TacticsBoardProps> = ({ tactics, onUpdateTactics, onAutoSet, calculateTacticScore }) => {
    const { offenseTactics: offTactics, defenseTactics: defTactics, sliders } = tactics;

    const handleTacticToggle = (t: OffenseTactic) => {
        const newTactics = offTactics.includes(t) ? (offTactics.length === 1 ? offTactics : offTactics.filter(i => i !== t)) : [...offTactics, t].slice(-1);
        onUpdateTactics({ ...tactics, offenseTactics: newTactics });
    };

    const toggleDefTactic = (t: DefenseTactic) => {
        const newTactics = t === 'AceStopper' ? (defTactics.includes(t) ? defTactics.filter(i => i !== t) : [...defTactics, t]) : [defTactics.includes('AceStopper') ? 'AceStopper' : '', t].filter(Boolean) as DefenseTactic[];
        onUpdateTactics({ ...tactics, defenseTactics: newTactics });
    };

    return (
        <div className="lg:col-span-4 flex flex-col min-h-0 overflow-y-auto custom-scrollbar bg-slate-900/40 rounded-br-3xl">
            <div className="px-8 border-b border-white/10 bg-slate-950/80 flex items-center justify-between h-[88px] flex-shrink-0">
                <div className="flex items-center gap-4">
                    <Activity size={24} className="text-indigo-400" />
                    <h3 className="text-2xl font-black uppercase text-white oswald tracking-tight ko-tight">전술 설정</h3>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={onAutoSet}
                        className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-900/40 flex items-center gap-2 transition-all active:scale-95"
                    >
                        <Wand2 size={16} className="text-violet-200" />
                        <span className="text-[10px] font-black uppercase tracking-wider">감독에게 위임</span>
                    </button>
                </div>
            </div>
            <div className="p-8 space-y-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3 text-indigo-400 px-2"><Target size={20} /><span className="font-black text-sm uppercase tracking-widest ko-tight">공격 전술</span></div>
                    <div className="grid grid-cols-1 gap-3">
                        {(['Balance', 'PaceAndSpace', 'PerimeterFocus', 'PostFocus', 'Grind', 'SevenSeconds'] as OffenseTactic[]).map(t => {
                            const score = calculateTacticScore(t);
                            const isActive = offTactics.includes(t);
                            const { bar, text, border } = getEfficiencyStyles(score);

                            return (
                                <button key={t} onClick={() => handleTacticToggle(t)} className={`w-full relative p-4 rounded-2xl border text-left overflow-hidden transition-all ${isActive ? `bg-slate-900/90 ${border} shadow-xl ring-1 ring-white/10` : 'bg-slate-950/40 border-white/5 hover:bg-slate-900/80'}`}>
                                    <div className="flex justify-between items-center relative z-10">
                                        <div>
                                            <div className={`font-black text-base uppercase tracking-tight ${isActive ? 'text-white' : 'text-slate-300'}`}>{OFFENSE_TACTIC_INFO[t].label}</div>
                                            <div className={`text-xs mt-1 opacity-60 ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>{OFFENSE_TACTIC_INFO[t].desc}</div>
                                        </div>
                                        <div className={`text-2xl font-black oswald leading-none ${isActive ? text : 'text-slate-600'}`}>
                                            {score}<span className="text-sm opacity-50 ml-0.5">%</span>
                                        </div>
                                    </div>
                                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden mt-3 relative z-10">
                                        <div className={`h-full transition-all duration-1000 ease-out ${isActive ? bar : 'bg-slate-700/30'}`} style={{ width: `${score}%` }} />
                                    </div>
                                    {isActive && (
                                        <div className={`absolute top-0 right-0 w-24 h-24 blur-[40px] opacity-20 pointer-events-none ${bar}`} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
                
                <div className="space-y-6">
                    <div className="flex items-center gap-3 text-indigo-400 px-2"><Shield size={20} /><span className="font-black text-sm uppercase tracking-widest ko-tight">수비 전술</span></div>
                    <div className="space-y-8">
                        <div className="grid grid-cols-2 gap-3">
                            {(['ManToManPerimeter', 'ZoneDefense'] as DefenseTactic[]).map(t => {
                                const score = calculateTacticScore(t);
                                const isActive = defTactics.includes(t);
                                const { text } = getEfficiencyStyles(score);

                                return (
                                    <button key={t} onClick={() => toggleDefTactic(t)} className={`relative p-4 rounded-2xl border text-left transition-all ${isActive ? 'bg-indigo-600 border-indigo-400 shadow-xl' : 'bg-slate-950/40 border-white/5 hover:bg-slate-900/80'}`}>
                                        <div className={`font-black text-sm uppercase tracking-tight mb-2 ${isActive ? 'text-white' : 'text-slate-400'}`}>{DEFENSE_TACTIC_INFO[t].label}</div>
                                        <div className={`text-2xl font-black oswald leading-none ${isActive ? 'text-white' : 'text-slate-600'}`}>{score}%</div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="pt-4 border-t border-white/5">
                            {(['AceStopper'] as DefenseTactic[]).map(t => {
                                const score = calculateTacticScore(t);
                                const isActive = defTactics.includes(t);
                                return (
                                    <button key={t} onClick={() => toggleDefTactic(t)} className={`w-full relative p-5 rounded-2xl border text-left transition-all ${isActive ? 'bg-fuchsia-600 border-fuchsia-400 shadow-[0_0_30px_rgba(192,38,211,0.2)]' : 'bg-slate-950/40 border-white/5 hover:border-fuchsia-500/30 group'}`}>
                                        <div className="flex justify-between items-start relative z-10">
                                            <div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${isActive ? 'bg-white/20' : 'bg-slate-800'}`}><ShieldAlert size={18} className={isActive ? 'text-white' : 'text-fuchsia-500'} /></div>
                                            <div>
                                                <div className={`font-black text-base uppercase tracking-tight ${isActive ? 'text-white' : 'text-slate-300'}`}>{DEFENSE_TACTIC_INFO[t].label}</div>
                                                <div className={`text-xs mt-1 opacity-70 ${isActive ? 'text-white' : 'text-slate-500'}`}>{DEFENSE_TACTIC_INFO[t].desc}</div>
                                            </div></div>
                                            <div className="text-right"><div className={`text-2xl font-black oswald leading-none ${isActive ? 'text-white' : 'text-slate-600'}`}>{score}%</div></div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="space-y-6 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-3 text-indigo-400 px-2"><Sliders size={20} /><span className="font-black text-sm uppercase tracking-widest ko-tight">전술 세부 조정</span></div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-8 bg-slate-950/20 p-5 rounded-2xl border border-slate-800/50">
                        <div className="col-span-2">
                            <SliderControl 
                                label="로테이션 유연성" 
                                value={sliders.rotationFlexibility ?? 5} 
                                onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, rotationFlexibility: v } })}
                                leftLabel="Strict (42m+)" 
                                rightLabel="Deep (25m)" 
                                tooltip="0에 가까울수록 주전 5명을 혹사(최대 42~44분)시키며, 10에 가까울수록 벤치를 폭폭넓게 활용해 체력을 안배합니다. (설정된 시간 제한 우선)" 
                            />
                        </div>
                        <SliderControl 
                            label="공격 페이스" 
                            value={sliders.pace} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, pace: v } })}
                            leftLabel="Slow" 
                            rightLabel="Fast" 
                            tooltip="수치를 높이면 런앤건 스타일로 공격 횟수가 증가하지만, 실점 위험도 함께 증가합니다." 
                        />
                        <SliderControl 
                            label="공격 리바운드" 
                            value={sliders.offReb} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, offReb: v } })}
                            leftLabel="Transition" 
                            rightLabel="Crash" 
                            tooltip="수치를 높이면 공격 리바운드 참여도가 늘어나지만, 백코트가 늦어져 실점(속공 허용) 위험이 늘어납니다." 
                        />
                        <SliderControl 
                            label="수비 강도" 
                            value={sliders.defIntensity} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, defIntensity: v } })}
                            leftLabel="Safe" 
                            rightLabel="Physical" 
                            tooltip="수치를 높이면 스틸과 블록 시도가 늘어나지만, 파울 트러블과 체력 저하 위험이 커집니다." 
                        />
                        <SliderControl 
                            label="수비 리바운드" 
                            value={sliders.defReb} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, defReb: v } })}
                            leftLabel="Leak Out" 
                            rightLabel="Secure" 
                            tooltip="수치를 높이면 박스아웃에 집중해 리바운드를 사수하지만, 우리 팀의 속공 전개는 느려집니다." 
                        />
                        <SliderControl 
                            label="풀 코트 프레스" 
                            value={sliders.fullCourtPress} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, fullCourtPress: v } })}
                            leftLabel="Never" 
                            rightLabel="Always" 
                            tooltip="수치를 높이면 풀코트 압박으로 상대 실책을 유발하지만, 선수들의 체력이 급격히 소모됩니다." 
                        />
                        <SliderControl 
                            label="존 디펜스 빈도" 
                            value={sliders.zoneUsage} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, zoneUsage: v } })}
                            leftLabel="Rarely" 
                            rightLabel="Frequent" 
                            tooltip="수치를 높이면 골밑 수비가 강화되지만, 상대에게 외곽 3점슛 기회를 더 많이 허용합니다." 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
