
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Wand2, Target, Shield, ShieldAlert, Sliders, HelpCircle, ChevronDown, Edit3, Trash2 } from 'lucide-react';
import { OffenseTactic, DefenseTactic, GameTactics, TacticPreset, Player } from '../../types';
import { OFFENSE_TACTIC_INFO, DEFENSE_TACTIC_INFO } from '../../utils/tacticUtils';
import { fetchPresets, savePreset, deletePreset, renamePreset } from '../../services/tacticsService';
import { supabase } from '../../services/supabaseClient';
import { calculatePlayerOvr } from '../../utils/constants';

interface TacticsBoardProps {
  tactics: GameTactics;
  roster: Player[];
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

const RenameModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: (name: string) => void; initialName: string }> = ({ isOpen, onClose, onConfirm, initialName }) => {
    const [name, setName] = useState(initialName);
    useEffect(() => { setName(initialName); }, [initialName, isOpen]);
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95">
                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-4">프리셋 이름 변경</h3>
                <input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-indigo-500 transition-colors mb-6"
                    placeholder="전술 이름을 입력하세요"
                    autoFocus
                />
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">취소</button>
                    <button onClick={() => { if(name.trim()) onConfirm(name.trim()); onClose(); }} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all">확인</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export const TacticsBoard: React.FC<TacticsBoardProps> = ({ tactics, roster, onUpdateTactics, onAutoSet }) => {
    const { offenseTactics: offTactics, defenseTactics: defTactics, sliders, stopperId } = tactics;
    
    const [userId, setUserId] = useState<string | null>(null);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [presets, setPresets] = useState<Record<number, TacticPreset>>({});
    const [activeSlot, setActiveSlot] = useState<number>(1);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [targetRenameSlot, setTargetRenameSlot] = useState<number | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
                const { data: save } = await supabase.from('saves').select('team_id').eq('user_id', user.id).maybeSingle();
                if (save) {
                    setTeamId(save.team_id);
                    loadPresetsFromDB(user.id, save.team_id);
                }
            }
        };
        init();
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadPresetsFromDB = async (uid: string, tid: string) => {
        const loaded = await fetchPresets(uid, tid);
        const map: Record<number, TacticPreset> = {};
        loaded.forEach(p => map[p.slot] = p);
        setPresets(map);
    };

    const handleSlotSelect = (slot: number) => {
        setActiveSlot(slot);
        if (presets[slot]) {
            const presetData = presets[slot].data;
            const newTactics = { ...tactics, ...presetData };
            onUpdateTactics(newTactics as GameTactics);
        }
        setIsDropdownOpen(false);
    };

    const handleSaveCurrent = async () => {
        if (!userId || !teamId) return;
        setIsProcessing(true);
        const currentName = presets[activeSlot]?.name || `맞춤 전술 ${activeSlot}`;
        const success = await savePreset(userId, teamId, activeSlot, currentName, tactics);
        if (success) await loadPresetsFromDB(userId, teamId);
        setIsProcessing(false);
    };

    const handleDeletePreset = async (e: React.MouseEvent, slot: number) => {
        e.stopPropagation();
        if (!userId || !teamId) return;
        if (!confirm("정말 이 프리셋을 삭제하시겠습니까?")) return;
        await deletePreset(userId, teamId, slot);
        await loadPresetsFromDB(userId, teamId);
    };

    const openRenameModal = (e: React.MouseEvent, slot: number) => {
        e.stopPropagation();
        setTargetRenameSlot(slot);
        setRenameModalOpen(true);
        setIsDropdownOpen(false);
    };

    const handleRenameConfirm = async (newName: string) => {
        if (!userId || !teamId || targetRenameSlot === null) return;
        if (presets[targetRenameSlot]) {
             await renamePreset(userId, teamId, targetRenameSlot, newName);
             await loadPresetsFromDB(userId, teamId);
        } else {
             await savePreset(userId, teamId, targetRenameSlot, newName, tactics);
             await loadPresetsFromDB(userId, teamId);
             setActiveSlot(targetRenameSlot);
        }
    };

    const handleOffenseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const t = e.target.value as OffenseTactic;
        onUpdateTactics({ ...tactics, offenseTactics: [t] });
    };

    const handleDefenseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const t = e.target.value as DefenseTactic;
        const currentStopper = defTactics.includes('AceStopper') ? 'AceStopper' : null;
        const newTactics = currentStopper ? [currentStopper, t] as DefenseTactic[] : [t];
        onUpdateTactics({ ...tactics, defenseTactics: newTactics });
    };

    const handleStopperChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const playerId = e.target.value;
        const baseDefense = defTactics.find(t => t !== 'AceStopper') || 'ManToManPerimeter';
        if (playerId) {
            onUpdateTactics({ ...tactics, stopperId: playerId, defenseTactics: ['AceStopper', baseDefense] });
        } else {
            onUpdateTactics({ ...tactics, stopperId: undefined, defenseTactics: [baseDefense] });
        }
    };

    const currentOffense = offTactics[0] || 'Balance';
    const currentDefense = defTactics.find(t => t !== 'AceStopper') || 'ManToManPerimeter';
    const sortedRoster = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    return (
        <div className="flex flex-col h-full bg-slate-900/20">
            <RenameModal 
                isOpen={renameModalOpen} 
                onClose={() => setRenameModalOpen(false)} 
                onConfirm={handleRenameConfirm} 
                initialName={targetRenameSlot ? (presets[targetRenameSlot]?.name || `Preset ${targetRenameSlot}`) : ""}
            />

            {/* Header Controls */}
            <div className="px-8 py-5 bg-slate-950/40 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div className="relative w-64" ref={dropdownRef}>
                        <button 
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="w-full flex items-center justify-between gap-2 bg-slate-900 border border-slate-700 hover:border-indigo-500/50 text-white px-4 py-2.5 rounded-xl transition-all shadow-sm group"
                        >
                            <span className="text-sm font-bold truncate">
                                {presets[activeSlot] ? presets[activeSlot].name : `프리셋 ${activeSlot}`}
                            </span>
                            <ChevronDown size={16} className={`text-slate-500 transition-transform group-hover:text-indigo-400 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                {[1, 2, 3].map(slot => {
                                    const hasData = !!presets[slot];
                                    return (
                                        <div key={slot} className="flex items-center border-b border-slate-800 last:border-0 hover:bg-slate-800/50 transition-colors">
                                            <button onClick={() => handleSlotSelect(slot)} className="flex-1 flex items-center gap-3 px-5 py-3 text-left min-w-0">
                                                <div className={`w-2 h-2 rounded-full ${activeSlot === slot ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]' : 'bg-slate-700'}`}></div>
                                                <span className={`text-sm font-bold truncate ${activeSlot === slot ? 'text-white' : 'text-slate-400'}`}>
                                                    {hasData ? presets[slot].name : `프리셋 ${slot} (비어있음)`}
                                                </span>
                                            </button>
                                            <div className="flex items-center gap-1 pr-3">
                                                <button onClick={(e) => openRenameModal(e, slot)} className="p-2 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-all"><Edit3 size={14} /></button>
                                                {hasData && <button onClick={(e) => handleDeletePreset(e, slot)} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"><Trash2 size={14} /></button>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={handleSaveCurrent}
                        disabled={isProcessing || !teamId}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-6 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg transition-all active:scale-95"
                    >
                        {isProcessing ? <Activity size={16} className="animate-spin" /> : "현재 전술 저장"}
                    </button>
                </div>
                
                <button 
                    onClick={onAutoSet}
                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-all active:scale-95 border border-white/5"
                >
                    <Wand2 size={16} /> AI 자동 설정
                </button>
            </div>
            
            <div className="p-10 grid grid-cols-1 lg:grid-cols-2 gap-12 overflow-y-auto custom-scrollbar">
                
                {/* Left Column: Strategy Selection */}
                <div className="space-y-10">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-indigo-400 px-2">
                            <Target size={24} />
                            <span className="font-black text-lg uppercase tracking-widest oswald">공격 시스템</span>
                        </div>
                        <div className="relative group">
                            <select value={currentOffense} onChange={handleOffenseChange} className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:bg-slate-900/80 transition-all">
                                {(['Balance', 'PaceAndSpace', 'PerimeterFocus', 'PostFocus', 'Grind', 'SevenSeconds'] as OffenseTactic[]).map(t => (
                                    <option key={t} value={t}>{OFFENSE_TACTIC_INFO[t].label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400" size={20} />
                        </div>
                        <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-6 space-y-4">
                            <div className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">{OFFENSE_TACTIC_INFO[currentOffense].desc}</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    {OFFENSE_TACTIC_INFO[currentOffense].pros.map((pro, i) => (
                                        <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-emerald-500 text-sm mt-0.5">✅</span><span className="leading-relaxed">{pro}</span></div>
                                    ))}
                                </div>
                                <div className="space-y-2">
                                    {OFFENSE_TACTIC_INFO[currentOffense].cons.map((con, i) => (
                                        <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-red-500 text-sm mt-0.5">❌</span><span className="leading-relaxed">{con}</span></div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-indigo-400 px-2">
                            <Shield size={24} />
                            <span className="font-black text-lg uppercase tracking-widest oswald">수비 시스템</span>
                        </div>
                        <div className="relative group">
                            <select value={currentDefense} onChange={handleDefenseChange} className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:bg-slate-900/80 transition-all">
                                {(['ManToManPerimeter', 'ZoneDefense'] as DefenseTactic[]).map(t => (
                                    <option key={t} value={t}>{DEFENSE_TACTIC_INFO[t].label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400" size={20} />
                        </div>
                        <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-6 space-y-4">
                            <div className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">{DEFENSE_TACTIC_INFO[currentDefense].desc}</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    {DEFENSE_TACTIC_INFO[currentDefense].pros.map((pro, i) => (
                                        <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-emerald-500 text-sm mt-0.5">✅</span><span className="leading-relaxed">{pro}</span></div>
                                    ))}
                                </div>
                                <div className="space-y-2">
                                    {DEFENSE_TACTIC_INFO[currentDefense].cons.map((con, i) => (
                                        <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-red-500 text-sm mt-0.5">❌</span><span className="leading-relaxed">{con}</span></div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="pt-4">
                             <div className="flex items-center gap-2 mb-3 px-1">
                                <ShieldAlert size={18} className="text-indigo-400" />
                                <span className="text-sm font-black text-slate-400 uppercase tracking-widest">에이스 스토퍼 (Lockdown Defender)</span>
                             </div>
                             <div className="relative">
                                <select value={stopperId || ""} onChange={handleStopperChange} className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:bg-slate-900/80 transition-all">
                                    <option value="">지정 안함 (팀 수비 모드)</option>
                                    {sortedRoster.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.position}) - OVR {calculatePlayerOvr(p)}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Sliders */}
                <div className="space-y-8">
                    <div className="flex items-center gap-3 text-indigo-400 px-2">
                        <Sliders size={24} />
                        <span className="font-black text-lg uppercase tracking-widest oswald">디테일 전술 조정 (Sliders)</span>
                    </div>
                    <div className="grid grid-cols-1 gap-10 bg-slate-950/40 p-10 rounded-[2rem] border border-slate-800/50 shadow-inner">
                        <SliderControl 
                            label="로테이션 유연성" 
                            value={sliders.rotationFlexibility ?? 5} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, rotationFlexibility: v } })}
                            leftLabel="주전 중심" rightLabel="벤치 활용" 
                            tooltip="수치가 낮을수록 소수의 주전급 선수들을 길게 기용하며, 높을수록 벤치 자원들을 폭넓게 활용하여 체력을 안배합니다." 
                        />
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
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
            </div>
        </div>
    );
};
