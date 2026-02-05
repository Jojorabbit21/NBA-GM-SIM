
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Wand2, Target, Shield, ShieldAlert, Sliders, HelpCircle, Save, ChevronDown, Edit3, Trash2, Check, Download, AlertCircle, Info } from 'lucide-react';
import { OffenseTactic, DefenseTactic, Team, GameTactics, TacticPreset, Player } from '../../types';
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

// Slider Control Component (Preserved)
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

// Rename Modal Component
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

export const TacticsBoard: React.FC<TacticsBoardProps> = ({ tactics, roster, onUpdateTactics, onAutoSet, calculateTacticScore }) => {
    const { offenseTactics: offTactics, defenseTactics: defTactics, sliders, stopperId } = tactics;
    
    // Preset State
    const [userId, setUserId] = useState<string | null>(null);
    const [teamId, setTeamId] = useState<string | null>(null); // To store context
    const [presets, setPresets] = useState<Record<number, TacticPreset>>({});
    const [activeSlot, setActiveSlot] = useState<number>(1);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [targetRenameSlot, setTargetRenameSlot] = useState<number | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Initial Load & User Context
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

    // Actions
    const handleSlotSelect = (slot: number) => {
        setActiveSlot(slot);
        
        // Auto-Load if preset exists
        if (presets[slot]) {
            const presetData = presets[slot].data;
            const newTactics = {
                ...tactics,
                ...presetData,
                starters: tactics.starters,
                minutesLimits: tactics.minutesLimits,
                stopperId: tactics.stopperId
            };
            onUpdateTactics(newTactics as GameTactics);
        }
        setIsDropdownOpen(false);
    };

    const handleSaveCurrent = async () => {
        if (!userId || !teamId) return;
        setIsProcessing(true);
        
        const currentName = presets[activeSlot]?.name || `Custom Tactic ${activeSlot}`;
        
        const success = await savePreset(userId, teamId, activeSlot, currentName, tactics);
        if (success) {
            await loadPresetsFromDB(userId, teamId);
        }
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
            // Set Stopper
            onUpdateTactics({ 
                ...tactics, 
                stopperId: playerId,
                defenseTactics: ['AceStopper', baseDefense] 
            });
        } else {
            // Clear Stopper
            onUpdateTactics({ 
                ...tactics, 
                stopperId: undefined,
                defenseTactics: [baseDefense] 
            });
        }
    };

    const currentOffense = offTactics[0] || 'Balance';
    const currentDefense = defTactics.find(t => t !== 'AceStopper') || 'ManToManPerimeter';

    // Helper: Get Sorted Roster for Stopper Dropdown
    const sortedRoster = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    return (
        <div className="lg:col-span-4 flex flex-col min-h-0 overflow-y-auto custom-scrollbar bg-slate-900/40 rounded-br-3xl">
            
            <RenameModal 
                isOpen={renameModalOpen} 
                onClose={() => setRenameModalOpen(false)} 
                onConfirm={handleRenameConfirm} 
                initialName={targetRenameSlot ? (presets[targetRenameSlot]?.name || `Preset ${targetRenameSlot}`) : ""}
            />

            <div className="px-8 border-b border-white/10 bg-slate-950/80 flex items-center h-[88px] flex-shrink-0">
                <div className="flex items-center gap-4">
                    <Activity size={24} className="text-indigo-400" />
                    <h3 className="text-2xl font-black uppercase text-white oswald tracking-tight ko-tight">전술 설정</h3>
                </div>
            </div>

             {/* Preset Controls moved to separate row */}
            <div className="px-8 py-3 bg-slate-900/60 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2 w-full">
                    <div className="relative flex-1" ref={dropdownRef}>
                        <button 
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="w-full flex items-center justify-between gap-2 bg-slate-900 border border-slate-700 hover:border-indigo-500/50 text-white px-3 py-1.5 rounded-lg transition-all shadow-sm group"
                        >
                            <span className="text-xs font-bold truncate">
                                {presets[activeSlot] ? presets[activeSlot].name : `Slot ${activeSlot}`}
                            </span>
                            <ChevronDown size={14} className={`text-slate-500 transition-transform group-hover:text-indigo-400 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                {[1, 2, 3].map(slot => {
                                    const hasData = !!presets[slot];
                                    return (
                                        <div key={slot} className="flex items-center border-b border-slate-800 last:border-0 hover:bg-slate-800/50 transition-colors">
                                            <button 
                                                onClick={() => handleSlotSelect(slot)}
                                                className="flex-1 flex items-center gap-3 px-4 py-2.5 text-left min-w-0"
                                            >
                                                <div className={`w-1.5 h-1.5 rounded-full ${activeSlot === slot ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]' : 'bg-slate-700'}`}></div>
                                                <span className={`text-xs font-bold truncate ${activeSlot === slot ? 'text-white' : 'text-slate-400'}`}>
                                                    {hasData ? presets[slot].name : `Slot ${slot} (Empty)`}
                                                </span>
                                            </button>
                                            
                                            <div className="flex items-center gap-1 pr-2">
                                                <button 
                                                    onClick={(e) => openRenameModal(e, slot)}
                                                    className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
                                                    title="이름 변경"
                                                >
                                                    <Edit3 size={12} />
                                                </button>
                                                {hasData && (
                                                    <button 
                                                        onClick={(e) => handleDeletePreset(e, slot)}
                                                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                                        title="삭제"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
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
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-3 py-1.5 rounded-lg font-black uppercase text-xs tracking-wide shadow-lg shadow-indigo-900/20 transition-all active:scale-95 flex-shrink-0"
                    >
                        {isProcessing ? <Activity size={14} className="animate-spin" /> : "저장"}
                    </button>
                    
                    <button 
                        onClick={onAutoSet}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1.5 transition-all active:scale-95 border border-white/5 flex-shrink-0"
                        title="AI 추천 전술 적용"
                    >
                        <Wand2 size={14} />
                    </button>
                </div>
            </div>
            
            <div className="p-8 space-y-8">
                
                {/* Offensive Strategy */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 text-indigo-400 px-2">
                        <Target size={20} />
                        <span className="font-black text-sm uppercase tracking-widest ko-tight">공격 전술</span>
                    </div>
                    
                    <div className="relative group">
                        <select 
                            value={currentOffense} 
                            onChange={handleOffenseChange}
                            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:bg-slate-900/80 transition-all"
                        >
                            {(['Balance', 'PaceAndSpace', 'PerimeterFocus', 'PostFocus', 'Grind', 'SevenSeconds'] as OffenseTactic[]).map(t => (
                                <option key={t} value={t}>{OFFENSE_TACTIC_INFO[t].label}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400 transition-colors" size={16} />
                    </div>

                    {/* Offense Pros & Cons Display */}
                    <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-4 space-y-3">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{OFFENSE_TACTIC_INFO[currentOffense].desc}</div>
                        
                        <div className="space-y-2">
                            {OFFENSE_TACTIC_INFO[currentOffense].pros.map((pro, i) => (
                                <div key={`pro-${i}`} className="flex items-start gap-2.5 text-xs text-slate-300">
                                    <span className="text-emerald-500 text-sm mt-0.5">✅</span>
                                    <span className="leading-relaxed">{pro}</span>
                                </div>
                            ))}
                        </div>
                        <div className="border-t border-slate-800/50 my-2"></div>
                        <div className="space-y-2">
                            {OFFENSE_TACTIC_INFO[currentOffense].cons.map((con, i) => (
                                <div key={`con-${i}`} className="flex items-start gap-2.5 text-xs text-slate-300">
                                    <span className="text-red-500 text-sm mt-0.5">❌</span>
                                    <span className="leading-relaxed">{con}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                
                {/* Defensive Strategy */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 text-indigo-400 px-2">
                        <Shield size={20} />
                        <span className="font-black text-sm uppercase tracking-widest ko-tight">수비 전술</span>
                    </div>

                    <div className="relative group">
                        <select 
                            value={currentDefense} 
                            onChange={handleDefenseChange}
                            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:bg-slate-900/80 transition-all"
                        >
                            {(['ManToManPerimeter', 'ZoneDefense'] as DefenseTactic[]).map(t => (
                                <option key={t} value={t}>{DEFENSE_TACTIC_INFO[t].label}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400 transition-colors" size={16} />
                    </div>

                    {/* Defense Pros & Cons Display */}
                    <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-4 space-y-3">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{DEFENSE_TACTIC_INFO[currentDefense].desc}</div>
                        
                        <div className="space-y-2">
                            {DEFENSE_TACTIC_INFO[currentDefense].pros.map((pro, i) => (
                                <div key={`def-pro-${i}`} className="flex items-start gap-2.5 text-xs text-slate-300">
                                    <span className="text-emerald-500 text-sm mt-0.5">✅</span>
                                    <span className="leading-relaxed">{pro}</span>
                                </div>
                            ))}
                        </div>
                        <div className="border-t border-slate-800/50 my-2"></div>
                        <div className="space-y-2">
                            {DEFENSE_TACTIC_INFO[currentDefense].cons.map((con, i) => (
                                <div key={`def-con-${i}`} className="flex items-start gap-2.5 text-xs text-slate-300">
                                    <span className="text-red-500 text-sm mt-0.5">❌</span>
                                    <span className="leading-relaxed">{con}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* Ace Stopper Dropdown */}
                    <div className="relative group pt-2">
                         <div className="flex items-center gap-2 mb-2 px-1">
                            <ShieldAlert size={14} className="text-indigo-400" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">에이스 스토퍼 (전담 마크)</span>
                         </div>
                         <div className="relative">
                            <select 
                                value={stopperId || ""}
                                onChange={handleStopperChange}
                                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:bg-slate-900/80 transition-all"
                            >
                                <option value="">지정 안함 (기본 수비)</option>
                                {sortedRoster.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} ({p.position}) - OVR {calculatePlayerOvr(p)}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400 transition-colors" size={16} />
                        </div>
                        
                        {/* Ace Stopper Detail Info - Redesigned */}
                        {stopperId ? (
                            <div className="mt-3 bg-slate-950/40 border border-slate-800/50 rounded-xl p-4 space-y-3">
                                <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                                    <div className="flex items-start gap-2">
                                        <span className="text-slate-500 mt-0.5">•</span>
                                        <span>상대방의 에이스(가장 높은 OVR)를 계속 따라다니며 락다운 디펜스를 펼칩니다.</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="text-slate-500 mt-0.5">•</span>
                                        <span>퍼리미터 디펜스, 스틸, 패스 퍼셉션에 따라 락다운 디펜스 능력이 결정됩니다.</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="text-emerald-500 mt-0.5">▲</span>
                                        <span>능력이 좋다면 상대 에이스의 공격 효율이 감소합니다.</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="text-red-500 mt-0.5">▼</span>
                                        <span>능력이 부족하면 오히려 상대에게 기회를 줄 수 있습니다.</span>
                                    </div>
                                </div>
                                <div className="border-t border-slate-800/50 pt-2 mt-2">
                                    <div className="flex items-start gap-2 text-xs text-slate-400">
                                        <span className="text-red-500 mt-0.5">!</span>
                                        <span>주의: 스토퍼는 다른 수비수보다 훨씬 빠르게 체력이 소모됩니다.</span>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Sliders */}
                <div className="space-y-3">
                    <div className="flex items-center gap-3 text-indigo-400 px-2"><Sliders size={20} /><span className="font-black text-sm uppercase tracking-widest ko-tight">전술 세부 조정</span></div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-8 bg-slate-950/40 p-5 rounded-2xl border border-slate-800/50">
                        <div className="col-span-2">
                            <SliderControl 
                                label="로테이션 유연성" 
                                value={sliders.rotationFlexibility ?? 5} 
                                onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, rotationFlexibility: v } })}
                                leftLabel="주전 활용" 
                                rightLabel="모든 선수 활용" 
                                tooltip="0에 가까울수록 주전 5명을 혹사(최대 42~44분)시키며, 10에 가까울수록 벤치를 폭폭넓게 활용해 체력을 안배합니다. (설정된 시간 제한 우선)" 
                            />
                        </div>
                        <SliderControl 
                            label="공격 페이스" 
                            value={sliders.pace} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, pace: v } })}
                            leftLabel="느리게" 
                            rightLabel="빠르게" 
                            tooltip="수치를 높이면 런앤건 스타일로 공격 횟수가 증가하지만, 실점 위험도 함께 증가합니다." 
                        />
                        <SliderControl 
                            label="공격 리바운드" 
                            value={sliders.offReb} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, offReb: v } })}
                            leftLabel="소극적" 
                            rightLabel="적극적" 
                            tooltip="수치를 높이면 공격 리바운드 참여도가 늘어나지만, 백코트가 늦어져 실점(속공 허용) 위험이 늘어납니다." 
                        />
                        <SliderControl 
                            label="수비 강도" 
                            value={sliders.defIntensity} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, defIntensity: v } })}
                            leftLabel="약하게" 
                            rightLabel="강하게" 
                            tooltip="수치를 높이면 스틸과 블록 시도가 늘어나지만, 파울 트러블과 체력 저하 위험이 커집니다." 
                        />
                        <SliderControl 
                            label="수비 리바운드" 
                            value={sliders.defReb} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, defReb: v } })}
                            leftLabel="속공 준비" 
                            rightLabel="박스아웃" 
                            tooltip="수치를 높이면 박스아웃에 집중해 리바운드를 사수하지만, 우리 팀의 속공 전개는 느려집니다." 
                        />
                        <SliderControl 
                            label="풀 코트 프레스" 
                            value={sliders.fullCourtPress} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, fullCourtPress: v } })}
                            leftLabel="거의 하지 않음" 
                            rightLabel="항상" 
                            tooltip="수치를 높이면 풀코트 압박으로 상대 실책을 유발하지만, 선수들의 체력이 급격히 소모됩니다." 
                        />
                        <SliderControl 
                            label="존 디펜스 빈도" 
                            value={sliders.zoneUsage} 
                            onChange={v => onUpdateTactics({ ...tactics, sliders: { ...sliders, zoneUsage: v } })}
                            leftLabel="거의 하지 않음" 
                            rightLabel="항상" 
                            tooltip="수치를 높이면 골밑 수비가 강화되지만, 상대에게 외곽 3점슛 기회를 더 많이 허용합니다." 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
