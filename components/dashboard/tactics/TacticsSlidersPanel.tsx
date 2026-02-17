
import React, { useState } from 'react';
import { Sliders, HelpCircle, ChevronDown, Target, Shield, ShieldAlert } from 'lucide-react';
import { GameTactics, TacticalSliders, OffenseTactic, DefenseTactic, Player } from '../../../types';
import { OFFENSE_TACTIC_INFO, DEFENSE_TACTIC_INFO } from '../../../utils/tacticUtils';
import { calculatePlayerOvr } from '../../../utils/constants';

interface TacticsSlidersPanelProps {
    tactics: GameTactics;
    onUpdateTactics: (t: GameTactics) => void;
    roster: Player[]; // Needed for Stopper selection
}

// Reusable Slider Component
const SliderControl: React.FC<{ 
    label: string, 
    value: number, 
    onChange: (val: number) => void, 
    min?: number, 
    max?: number, 
    leftLabel?: string, 
    rightLabel?: string, 
    tooltip?: string,
    colorClass?: string
}> = ({ label, value, onChange, min=1, max=10, leftLabel, rightLabel, tooltip, colorClass = "accent-indigo-500" }) => (
  <div className="space-y-1.5 w-full">
    <div className="flex justify-between items-end">
      <div className="flex items-center gap-1.5 relative group/tooltip">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight cursor-help">{label}</span>
        {tooltip && (
            <>
                <HelpCircle size={10} className="text-slate-600 hover:text-indigo-400 transition-colors cursor-help" />
                <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-900 border border-slate-700 text-slate-300 text-[10px] p-2 rounded-lg shadow-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 font-medium break-keep leading-relaxed">
                    {tooltip}
                </div>
            </>
        )}
      </div>
      <span className="text-xs font-black text-white font-mono">{value}</span>
    </div>
    <div className="relative flex items-center h-4">
       <input 
         type="range" 
         min={min} 
         max={max} 
         value={value} 
         onChange={(e) => onChange(parseInt(e.target.value))} 
         className={`w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer hover:bg-slate-700 focus:outline-none ${colorClass}`}
       />
    </div>
    <div className="flex justify-between text-[8px] font-bold text-slate-600 uppercase tracking-tighter">
       <span>{leftLabel}</span>
       <span>{rightLabel}</span>
    </div>
  </div>
);

export const TacticsSlidersPanel: React.FC<TacticsSlidersPanelProps> = ({ tactics, onUpdateTactics, roster }) => {
    const [activeTab, setActiveTab] = useState<'offense' | 'defense'>('offense');
    
    const { offenseTactics, defenseTactics, sliders, stopperId } = tactics;
    const currentOffense = offenseTactics[0] || 'Balance';
    const currentDefense = defenseTactics.find(t => t !== 'AceStopper') || 'ManToManPerimeter';

    // Helper to update a specific slider
    const updateSlider = (key: keyof TacticalSliders, val: number) => {
        onUpdateTactics({ ...tactics, sliders: { ...sliders, [key]: val } });
    };

    // Helper to update preset
    const handleOffenseChange = (val: string) => {
        onUpdateTactics({ ...tactics, offenseTactics: [val as OffenseTactic] });
    };

    const handleDefenseChange = (val: string) => {
        const newDefTactic = val as DefenseTactic;
        if (newDefTactic === 'ZoneDefense') {
            onUpdateTactics({ 
                ...tactics, 
                defenseTactics: ['ZoneDefense'],
                stopperId: undefined 
            });
        } else {
            const currentStopper = defenseTactics.includes('AceStopper') ? 'AceStopper' : null;
            const newTactics = currentStopper ? [currentStopper, newDefTactic] : [newDefTactic];
            onUpdateTactics({ ...tactics, defenseTactics: newTactics as DefenseTactic[] });
        }
    };

    const handleStopperChange = (playerId: string) => {
        const baseDefense = defenseTactics.find(t => t !== 'AceStopper') || 'ManToManPerimeter';
        if (playerId) {
            onUpdateTactics({ ...tactics, stopperId: playerId, defenseTactics: ['AceStopper', baseDefense] });
        } else {
            onUpdateTactics({ ...tactics, stopperId: undefined, defenseTactics: [baseDefense] });
        }
    };

    const offOptions = (Object.keys(OFFENSE_TACTIC_INFO) as OffenseTactic[]).map(t => ({ value: t, label: OFFENSE_TACTIC_INFO[t].label }));
    const defOptions = (Object.keys(DEFENSE_TACTIC_INFO) as DefenseTactic[]).filter(t => t !== 'AceStopper').map(t => ({ value: t, label: DEFENSE_TACTIC_INFO[t].label }));
    const sortedRoster = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    return (
        <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {/* Tab Header */}
            <div className="flex border-b border-slate-800">
                <button 
                    onClick={() => setActiveTab('offense')}
                    className={`flex-1 py-4 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'offense' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
                >
                    <Target size={16} /> 공격 설정
                </button>
                <div className="w-px bg-slate-800"></div>
                <button 
                    onClick={() => setActiveTab('defense')}
                    className={`flex-1 py-4 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'defense' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
                >
                    <Shield size={16} /> 수비 설정
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-900/50">
                
                {/* --- OFFENSE TAB --- */}
                {activeTab === 'offense' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
                        {/* 1. Preset Selector */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">메인 공격 전술</label>
                            <div className="relative group">
                                <select 
                                    value={currentOffense} 
                                    onChange={(e) => handleOffenseChange(e.target.value)} 
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:border-slate-500 transition-all shadow-inner"
                                >
                                    {offOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium leading-relaxed bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                                {OFFENSE_TACTIC_INFO[currentOffense].desc}
                            </p>
                        </div>

                        <div className="w-full h-px bg-slate-800/50"></div>

                        {/* 2. Sliders: Style */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-black text-orange-400 uppercase tracking-widest flex items-center gap-2">
                                <Sliders size={12} /> 운영 스타일 (Style)
                            </h4>
                            <div className="grid grid-cols-1 gap-5 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
                                <SliderControl 
                                    label="게임 템포 (Pace)" value={sliders.pace} onChange={v => updateSlider('pace', v)}
                                    leftLabel="Slow (Grind)" rightLabel="Fast (Run)" tooltip="높을수록 빠른 공수전환과 얼리 오펜스를 시도합니다." colorClass="accent-orange-500"
                                />
                                <SliderControl 
                                    label="볼 무브먼트" value={sliders.ballMovement} onChange={v => updateSlider('ballMovement', v)}
                                    leftLabel="Iso / Star" rightLabel="Team Pass" tooltip="높을수록 더 많은 패스를 돌려 오픈 찬스를 찾지만, 턴오버 위험도 증가합니다." colorClass="accent-orange-500"
                                />
                                <SliderControl 
                                    label="공격 리바운드" value={sliders.offReb} onChange={v => updateSlider('offReb', v)}
                                    leftLabel="Get Back" rightLabel="Crash Glass" tooltip="높을수록 슛 이후 공격 리바운드에 가담하지만, 상대 속공에 취약해집니다." colorClass="accent-orange-500"
                                />
                            </div>
                        </div>

                        {/* 3. Sliders: Shot Tendency */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                <Target size={12} /> 슈팅 선호 구역 (Tendency)
                            </h4>
                            <div className="grid grid-cols-2 gap-4 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
                                <SliderControl 
                                    label="3점 슛 (3PT)" value={sliders.shot_3pt} onChange={v => updateSlider('shot_3pt', v)}
                                    leftLabel="Avoid" rightLabel="Focus" colorClass="accent-emerald-500"
                                />
                                <SliderControl 
                                    label="림 어택 (Rim)" value={sliders.shot_rim} onChange={v => updateSlider('shot_rim', v)}
                                    leftLabel="Avoid" rightLabel="Focus" colorClass="accent-emerald-500"
                                />
                                <SliderControl 
                                    label="미드레인지" value={sliders.shot_mid} onChange={v => updateSlider('shot_mid', v)}
                                    leftLabel="Avoid" rightLabel="Focus" colorClass="accent-emerald-500"
                                />
                                <SliderControl 
                                    label="풀업 점퍼" value={sliders.shot_pullup} onChange={v => updateSlider('shot_pullup', v)}
                                    leftLabel="Set Shot" rightLabel="Pull-up" tooltip="드리블 중 슛을 쏘는 빈도입니다. 높을수록 난이도 높은 슛을 시도합니다." colorClass="accent-emerald-500"
                                />
                            </div>
                        </div>

                        {/* 4. Sliders: Play Types */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                                <Sliders size={12} /> 공격 루트 비중 (Play Types)
                            </h4>
                            <div className="space-y-5 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
                                <SliderControl label="Pick & Roll" value={sliders.play_pnr} onChange={v => updateSlider('play_pnr', v)} leftLabel="Low" rightLabel="High" colorClass="accent-blue-500" />
                                <SliderControl label="Isolation" value={sliders.play_iso} onChange={v => updateSlider('play_iso', v)} leftLabel="Low" rightLabel="High" colorClass="accent-blue-500" />
                                <SliderControl label="Post Up" value={sliders.play_post} onChange={v => updateSlider('play_post', v)} leftLabel="Low" rightLabel="High" colorClass="accent-blue-500" />
                                <SliderControl label="Catch & Shoot" value={sliders.play_cns} onChange={v => updateSlider('play_cns', v)} leftLabel="Low" rightLabel="High" colorClass="accent-blue-500" />
                                <SliderControl label="Cut & Drive" value={sliders.play_drive} onChange={v => updateSlider('play_drive', v)} leftLabel="Low" rightLabel="High" colorClass="accent-blue-500" />
                            </div>
                        </div>
                    </div>
                )}

                {/* --- DEFENSE TAB --- */}
                {activeTab === 'defense' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                        {/* 1. Preset Selector */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">메인 수비 전술</label>
                            <div className="relative group">
                                <select 
                                    value={currentDefense} 
                                    onChange={(e) => handleDefenseChange(e.target.value)} 
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:border-slate-500 transition-all shadow-inner"
                                >
                                    {defOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium leading-relaxed bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                                {DEFENSE_TACTIC_INFO[currentDefense].desc}
                            </p>
                        </div>

                        {/* 2. Stopper Setting */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                                <ShieldAlert size={12} /> 에이스 스토퍼 (Ace Stopper)
                            </label>
                            <div className="relative group">
                                <select 
                                    value={stopperId || ""} 
                                    onChange={(e) => handleStopperChange(e.target.value)}
                                    disabled={currentDefense === 'ZoneDefense'}
                                    className={`w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none shadow-inner transition-all ${currentDefense === 'ZoneDefense' ? 'opacity-50 cursor-not-allowed text-slate-500' : 'cursor-pointer hover:border-slate-500'}`}
                                >
                                    {currentDefense === 'ZoneDefense' ? (
                                        <option value="">지역 방어 사용 중 (지정 불가)</option>
                                    ) : (
                                        <option value="">지정 안함 (팀 수비 모드)</option>
                                    )}
                                    
                                    {currentDefense !== 'ZoneDefense' && sortedRoster.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.position}) - OVR {calculatePlayerOvr(p)}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                            </div>
                        </div>

                        <div className="w-full h-px bg-slate-800/50"></div>

                        {/* 3. Sliders: General Defense */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                <Sliders size={12} /> 수비 일반 (General)
                            </h4>
                            <div className="grid grid-cols-1 gap-5 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
                                <SliderControl 
                                    label="수비 강도 (Intensity)" value={sliders.defIntensity} onChange={v => updateSlider('defIntensity', v)}
                                    leftLabel="Sag Off" rightLabel="Press" tooltip="높을수록 상대 야투 억제와 스틸 시도가 늘어나지만, 파울 트러블 위험이 커집니다." colorClass="accent-indigo-500"
                                />
                                <SliderControl 
                                    label="헬프 수비 (Help)" value={sliders.helpDef} onChange={v => updateSlider('helpDef', v)}
                                    leftLabel="Stay Home" rightLabel="Help & Rotate" tooltip="높을수록 페인트존 보호가 강해지지만, 외곽 3점슛을 허용할 위험이 커집니다." colorClass="accent-indigo-500"
                                />
                                <SliderControl 
                                    label="스위치 빈도 (Switch)" value={sliders.switchFreq} onChange={v => updateSlider('switchFreq', v)}
                                    leftLabel="Fight Thru" rightLabel="Switch All" tooltip="스크린 대처 방식입니다. 높을수록 미스매치가 발생할 확률이 높지만 오픈 찬스는 줄어듭니다." colorClass="accent-indigo-500"
                                />
                                <SliderControl 
                                    label="수비 리바운드" value={sliders.defReb} onChange={v => updateSlider('defReb', v)}
                                    leftLabel="Leak Out" rightLabel="Box Out" tooltip="높을수록 안전하게 리바운드를 잡지만, 속공 기회는 줄어듭니다." colorClass="accent-indigo-500"
                                />
                            </div>
                        </div>

                        {/* 4. Sliders: Scheme */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-black text-fuchsia-400 uppercase tracking-widest flex items-center gap-2">
                                <Sliders size={12} /> 수비 스킴 (Scheme)
                            </h4>
                            <div className="grid grid-cols-2 gap-4 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
                                <SliderControl 
                                    label="풀 코트 프레스" value={sliders.fullCourtPress} onChange={v => updateSlider('fullCourtPress', v)}
                                    leftLabel="Never" rightLabel="Always" tooltip="체력을 급격히 소모하며 턴오버를 유발합니다." colorClass="accent-fuchsia-500"
                                />
                                <SliderControl 
                                    label="존 디펜스 빈도" value={sliders.zoneUsage} onChange={v => updateSlider('zoneUsage', v)}
                                    leftLabel="Man-to-Man" rightLabel="Zone Only" tooltip="대인 방어와 지역 방어의 혼용 비율을 결정합니다." colorClass="accent-fuchsia-500"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
