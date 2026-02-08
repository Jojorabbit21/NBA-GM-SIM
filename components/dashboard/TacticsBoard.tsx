
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Wand2, Target, Shield, ShieldAlert, Sliders, HelpCircle, ChevronDown, Edit3, Trash2, TrendingUp, Lock } from 'lucide-react';
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

// Helper for Color Coding Stats
const getStatColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 85) return 'text-purple-400';
    if (val >= 80) return 'text-indigo-400';
    if (val >= 75) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

// [Design Update] New Stat Item without container background
const CourtStatItem: React.FC<{ label: string, value: number, top: string, left: string }> = ({ label, value, top, left }) => (
    <div className="absolute flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2 text-center select-none" style={{ top, left }}>
        <span className="text-[10px] font-black text-slate-500/80 uppercase tracking-widest mb-0.5">{label}</span>
        <span className={`text-xl font-black font-mono ${getStatColor(value)} drop-shadow-md`}>{value}</span>
    </div>
);

// Vertical Court Visualization Component
const TacticalCourt: React.FC<{ starters: Player[] }> = ({ starters }) => {
    // Calculate Averages
    const stats = useMemo(() => {
        if (starters.length === 0) return null;
        
        const sum = (key: keyof Player) => starters.reduce((acc, p) => acc + (p[key] as number || 0), 0);
        const avg = (val: number) => Math.round(val / starters.length);

        // Offense
        const layup = sum('layup');
        const dunk = sum('dunk');
        const close = sum('closeShot');
        const mid = sum('midRange');
        
        // 3PT Avg Calculation per player then sum
        const threeSum = starters.reduce((acc, p) => acc + ((p.threeCorner + p.three45 + p.threeTop) / 3), 0);
        
        // Defense
        const perDef = sum('perDef');
        const intDef = sum('intDef');

        return {
            rim: avg((layup + dunk) / 2),
            paint: avg(close),
            mid: avg(mid),
            three: Math.round(threeSum / starters.length),
            perDef: avg(perDef),
            intDef: avg(intDef)
        };
    }, [starters]);

    if (!stats) return <div className="h-full flex items-center justify-center text-slate-500 text-xs">주전 정보 없음</div>;

    // SVG Coordinate System: 500 x 940 (1 unit = 0.1 ft approx, Standard NBA Court 50ft x 94ft)
    // 3PT Line: Corner 22ft (220 units) -> Straight line 14ft (140 units) -> Arc 23.75ft (237.5 units)
    return (
        <div className="w-full aspect-[50/94] bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden relative shadow-inner">
            {/* Court SVG Layer */}
            <svg viewBox="0 0 500 940" className="w-full h-full opacity-50">
                {/* Floor */}
                <rect x="0" y="0" width="500" height="940" fill="#0f172a" />
                
                {/* Lines Style */}
                <g stroke="#475569" strokeWidth="3" fill="none">
                    {/* Center Court */}
                    <line x1="0" y1="470" x2="500" y2="470" />
                    <circle cx="250" cy="470" r="60" />
                    
                    {/* --- Top Half (Offense) --- */}
                    {/* 3PT Line: Corner Straight (14ft) then Arc */}
                    {/* Corners at X=30 and X=470 (3ft from sideline). Straight till Y=140. */}
                    <path d="M 30,0 V 140 C 30,237.5 60,237.5 250,237.5 C 440,237.5 470,237.5 470,140 V 0" />
                    
                    {/* Key (Paint): 16ft wide (160 units), 19ft long (190 units) */}
                    <rect x="170" y="0" width="160" height="190" />
                    
                    {/* Free Throw Circle (Top of Key): Radius 6ft (60 units) at y=190 */}
                    <path d="M 170,190 A 80,80 0 0,0 330,190" />

                    {/* --- Bottom Half (Defense) --- */}
                    {/* 3PT Line */}
                    <path d="M 30,940 V 800 C 30,702.5 60,702.5 250,702.5 C 440,702.5 470,702.5 470,800 V 940" />
                    
                    {/* Key */}
                    <rect x="170" y="750" width="160" height="190" />
                    
                    {/* Free Throw Circle */}
                    <path d="M 170,750 A 80,80 0 0,1 330,750" />
                </g>
            </svg>

            {/* Stats Overlays Layer */}
            <div className="absolute inset-0">
                {/* --- OFFENSE (Top) --- */}
                {/* Rim: Near Basket */}
                <CourtStatItem label="Rim Finish" value={stats.rim} top="10%" left="50%" />
                
                {/* Paint: Inside Key */}
                <CourtStatItem label="Paint" value={stats.paint} top="17%" left="50%" />
                
                {/* Mid-Range: Between Paint and 3PT */}
                <CourtStatItem label="Mid-Range" value={stats.mid} top="27%" left="50%" />
                
                {/* 3PT: Outside Arc */}
                <CourtStatItem label="3PT Shot" value={stats.three} top="35%" left="50%" />


                {/* --- DEFENSE (Bottom) --- */}
                {/* Perimeter Def: High outside arc */}
                <CourtStatItem label="Perimeter Def" value={stats.perDef} top="65%" left="50%" />
                
                {/* Interior Def: Inside Key */}
                <CourtStatItem label="Interior Def" value={stats.intDef} top="83%" left="50%" />
            </div>
        </div>
    );
};


const SliderControl: React.FC<{ label: string, value: number, onChange: (val: number) => void, min?: number, max?: number, leftLabel?: string, rightLabel?: string, tooltip?: string }> = ({ label, value, onChange, min=1, max=10, leftLabel, rightLabel, tooltip }) => (
  <div className="space-y-2 group/slider w-full">
    <div className="flex justify-between items-end">
      <div className="flex items-center gap-1.5 relative">
        <span className="text-xs font-black text-slate-400 uppercase tracking-tight cursor-help">{label}</span>
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
      <span className="text-sm font-black text-indigo-400 font-mono">{value}</span>
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
    <div className="flex justify-between text-[10px] font-bold text-slate-600 uppercase tracking-tighter">
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

    // Identify Starters for Court View
    const starters = useMemo(() => {
        const starterIds = Object.values(tactics.starters).filter(id => id !== '');
        return roster.filter(p => starterIds.includes(p.id));
    }, [tactics.starters, roster]);

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
            <div className="px-8 py-5 bg-slate-950/40 border-b border-white/5 flex items-center justify-between flex-shrink-0">
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
            
            {/* 3-Column Layout */}
            <div className="p-6 lg:p-10 flex-1 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                    
                    {/* Left Column: Court Visualization (3 cols) */}
                    <div className="lg:col-span-3 min-h-[500px]">
                        <TacticalCourt starters={starters} />
                    </div>

                    {/* Center Column: Strategy Selectors (5 cols) */}
                    <div className="lg:col-span-5 space-y-4">
                        
                        {/* Offense Container */}
                        <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl overflow-hidden shadow-sm">
                            <div className="px-5 py-4 border-b border-white/5 space-y-3 bg-slate-900/30">
                                <div className="flex items-center gap-3 text-indigo-400">
                                    <Target size={20} />
                                    <span className="font-black text-sm uppercase tracking-widest oswald">공격 시스템</span>
                                </div>
                                <div className="relative group">
                                    <select value={currentOffense} onChange={handleOffenseChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:bg-slate-800 transition-all shadow-inner">
                                        {(['Balance', 'PaceAndSpace', 'PerimeterFocus', 'PostFocus', 'Grind', 'SevenSeconds'] as OffenseTactic[]).map(t => (
                                            <option key={t} value={t}>{OFFENSE_TACTIC_INFO[t].label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400" size={16} />
                                </div>
                            </div>
                            <div className="p-5 space-y-3 bg-slate-950/20">
                                <div className="text-xs font-black text-slate-400 uppercase tracking-widest pb-1">{OFFENSE_TACTIC_INFO[currentOffense].desc}</div>
                                <div className="grid grid-cols-1 gap-2">
                                    {OFFENSE_TACTIC_INFO[currentOffense].pros.map((pro, i) => (
                                        <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-emerald-500 text-xs mt-0.5">✅</span><span className="leading-relaxed">{pro}</span></div>
                                    ))}
                                    {OFFENSE_TACTIC_INFO[currentOffense].cons.map((con, i) => (
                                        <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-red-500 text-xs mt-0.5">❌</span><span className="leading-relaxed">{con}</span></div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        
                        {/* Defense Container */}
                        <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl overflow-hidden shadow-sm">
                            <div className="px-5 py-4 border-b border-white/5 space-y-3 bg-slate-900/30">
                                <div className="flex items-center gap-3 text-indigo-400">
                                    <Shield size={20} />
                                    <span className="font-black text-sm uppercase tracking-widest oswald">수비 시스템</span>
                                </div>
                                <div className="relative group">
                                    <select value={currentDefense} onChange={handleDefenseChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:bg-slate-800 transition-all shadow-inner">
                                        {(['ManToManPerimeter', 'ZoneDefense'] as DefenseTactic[]).map(t => (
                                            <option key={t} value={t}>{DEFENSE_TACTIC_INFO[t].label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400" size={16} />
                                </div>
                            </div>
                            <div className="p-5 space-y-3 bg-slate-950/20">
                                <div className="text-xs font-black text-slate-400 uppercase tracking-widest pb-1">{DEFENSE_TACTIC_INFO[currentDefense].desc}</div>
                                <div className="grid grid-cols-1 gap-2">
                                    {DEFENSE_TACTIC_INFO[currentDefense].pros.map((pro, i) => (
                                        <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-emerald-500 text-xs mt-0.5">✅</span><span className="leading-relaxed">{pro}</span></div>
                                    ))}
                                    {DEFENSE_TACTIC_INFO[currentDefense].cons.map((con, i) => (
                                        <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-red-500 text-xs mt-0.5">❌</span><span className="leading-relaxed">{con}</span></div>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Ace Stopper Section inside Defense Container */}
                            <div className="px-5 py-4 border-t border-white/5 bg-slate-900/30">
                                <div className="flex items-center gap-2 mb-2">
                                    <ShieldAlert size={16} className="text-indigo-400" />
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">에이스 스토퍼 (Lockdown)</span>
                                </div>
                                <div className="relative group">
                                    <select value={stopperId || ""} onChange={handleStopperChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:bg-slate-800 transition-all shadow-inner">
                                        <option value="">지정 안함 (팀 수비 모드)</option>
                                        {sortedRoster.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} ({p.position}) - OVR {calculatePlayerOvr(p)}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400" size={14} />
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Right Column: Sliders (4 cols, 1 per row) */}
                    <div className="lg:col-span-4 flex flex-col space-y-4">
                        <div className="flex items-center gap-3 text-indigo-400 px-2">
                            <Sliders size={24} />
                            <span className="font-black text-sm uppercase tracking-widest oswald">디테일 전술 조정</span>
                        </div>
                        <div className="flex flex-col gap-8 bg-slate-950/40 p-6 rounded-2xl border border-slate-800/50 shadow-inner">
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
                            {/* 1 Column Layout for Sliders */}
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
