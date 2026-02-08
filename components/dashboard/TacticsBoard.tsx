
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

// SVG Paths from VisualShotChart (Standard NBA Half Court)
const COURT_LINES = [
  "M149.6,403 V238.4 H285 V403", // Key (Modified: Open Bottom)
  "M269.2,237.7h-1.4c0-27.8-22.6-50.4-50.4-50.4s-50.4,22.6-50.4,50.4h-1.4c0-28.6,23.3-51.8,51.8-51.8s51.8,23.3,51.8,51.8Z", // Free Throw Circle
  "M269.1,237.7c0,2.6-.2,5.3-.6,7.9l-1.4-.2c.6-3.6.7-7.3.5-11h1.4c0,1,.1,2.2.1,3.3ZM267.1,223.2l-1.4.4c-1-3.5-2.4-6.9-4.2-10.1l1.3-.7c1.8,3.3,3.3,6.8,4.3,10.4ZM265.6,256.5c-1.4,3.5-3.1,6.9-5.2,10l-1.2-.8c2-3,3.7-6.3,5.1-9.7l1.3.5ZM256.3,203.5l-1.1.9c-2.4-2.7-5.1-5.2-8.1-7.4l.9-1.2c3,2.2,5.8,4.8,8.3,7.6ZM253.1,275.1c-2.7,2.6-5.7,4.9-9,6.9l-.7-1.2c3.1-1.9,6.1-4.1,8.7-6.7l1,1ZM238.2,190.2l-.6,1.3c-3.4-1.5-6.9-2.6-10.5-3.3l.3-1.4c3.7.7,7.3,1.9,10.8,3.4ZM233.9,286.8c-1.4.5-2.8.9-4.3,1.2-2.2.5-4.5,1-6.8,1.2l-.2-1.4c2.2-.2,4.4-.6,6.6-1.2,1.4-.3,2.8-.7,4.1-1.2l.5,1.4ZM216.2,187.3c-3.6,0-7.3.6-10.9,1.5-2.8.7-5.5,1.6-8.2,2.7l-.6-1.3c2.7-1.2,5.5-2.1,8.4-2.8,3.7-.9,7.4-1.4,11.2-1.5v1.4ZM211.8,287.8l-.2,1.4c-3.7-.4-7.5-1.2-11-2.5l.5-1.4c3.5,1.2,7.1,2,10.7,2.4ZM191.1,280.7l-.7,1.2c-3.2-2-6.2-4.3-9-6.9l1-1c2.6,2.5,5.6,4.8,8.7,6.7ZM187.6,196.9c-3,2.2-5.7,4.6-8.1,7.4l-1.1-1c2.5-2.8,5.3-5.4,8.3-7.6l.8,1.2ZM175.4,265.6l-1.2.8c-2.1-3.1-3.8-6.5-5.2-10l1.3-.5c1.3,3.4,3,6.7,5,9.8ZM173.2,213.3c-1.8,3.2-3.2,6.6-4.2,10.1l-1.4-.4c1.1-3.6,2.5-7.1,4.4-10.4l1.3.7ZM167.5,245.2l-1.4.2c-.6-3.7-.7-7.5-.5-11.3h1.4c-.2,3.7,0,7.4.5,11.1Z",
  "M252.9,355.9v10.7h-1.4v-10.7c0-18.9-15.3-34.2-34.2-34.2s-34.2,15.3-34.2,34.2v10.7h-1.4v-10.7c0-19.6,16-35.6,35.6-35.6s35.6,16,35.6,35.6Z", // Restricted Area Arc (Index 3)
  "M407.4,278.3v122.8h-1.4v-122.5c-31.5-76.9-105.5-126.6-188.6-126.6S60.2,201.7,28.7,278.6v122.5h-1.4v-122.9h0c15.2-37.4,40.9-69.1,74.3-91.9,34.2-23.4,74.2-35.7,115.7-35.7s81.6,12.4,115.7,35.7c33.4,22.8,59,54.6,74.3,91.9h0Z" // 3PT Arc (Index 4)
];

// Helper for Color Coding Stats (Text Class)
const getStatColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 85) return 'text-purple-400';
    if (val >= 80) return 'text-indigo-400';
    if (val >= 75) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

// Helper for Color Coding Stats (Hex for SVG Fill)
const getStatHex = (val: number) => {
    if (val >= 90) return '#e879f9'; // fuchsia-400
    if (val >= 85) return '#c084fc'; // purple-400
    if (val >= 80) return '#818cf8'; // indigo-400
    if (val >= 75) return '#34d399'; // emerald-400
    if (val >= 70) return '#fbbf24'; // amber-400
    return '#64748b'; // slate-500
};

const CourtStatItem: React.FC<{ label: string, value: number, top: string, left: string, align?: 'left'|'center'|'right' }> = ({ label, value, top, left, align='center' }) => (
    <div className={`absolute flex flex-col items-center justify-center transform -translate-y-1/2 z-10 bg-slate-900/90 border border-slate-700/50 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-lg min-w-[60px]`} style={{ top, left, transform: `translate(${align === 'center' ? '-50%' : align === 'left' ? '0' : '-100%'}, -50%)` }}>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">{label}</span>
        <span className={`text-lg font-black font-mono leading-none ${getStatColor(value)}`}>{value}</span>
    </div>
);

// Half Court Visualization Component
const TacticalHalfCourt: React.FC<{ starters: Player[], type: 'offense' | 'defense' }> = ({ starters, type }) => {
    const stats = useMemo(() => {
        if (starters.length === 0) return null;
        
        // Helper to get average attribute for specific positions (handling multi-position strings)
        const getGroupAvg = (positions: string[], stat: keyof Player) => {
            const group = starters.filter(p => positions.some(pos => p.position.includes(pos)));
            if (!group.length) return 0;
            return Math.round(group.reduce((acc, p) => acc + (p[stat] as number || 0), 0) / group.length);
        };

        const sum = (key: keyof Player) => starters.reduce((acc, p) => acc + (p[key] as number || 0), 0);
        const avg = (val: number) => Math.round(val / starters.length);

        // Offense (Team Average)
        const layup = sum('layup');
        const dunk = sum('dunk');
        const close = sum('closeShot');
        const mid = sum('midRange');
        const threeSum = starters.reduce((acc, p) => acc + ((p.threeCorner + p.three45 + p.threeTop) / 3), 0);
        
        // Defense (Specific Groups)
        // Perimeter Defense & Steal: PG, SG, SF
        const perDef = getGroupAvg(['PG', 'SG', 'SF'], 'perDef');
        const steal = getGroupAvg(['PG', 'SG', 'SF'], 'steal');
        
        // Interior Defense & Block: SF, PF, C (Including SF as swing defender)
        const intDef = getGroupAvg(['SF', 'PF', 'C'], 'intDef');
        const block = getGroupAvg(['SF', 'PF', 'C'], 'blk');

        return {
            rim: avg((layup + dunk) / 2),
            paint: avg(close),
            mid: avg(mid),
            three: Math.round(threeSum / starters.length),
            perDef,
            intDef,
            steal,
            block
        };
    }, [starters]);

    if (!stats) return <div className="h-full flex items-center justify-center text-slate-500 text-xs">주전 정보 없음</div>;

    // ViewBox 435x403 (from VisualShotChart)
    return (
        <div className="w-full aspect-[435/403] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden relative shadow-inner group">
            {/* Court SVG Layer */}
            <svg viewBox="0 0 435 403" className="w-full h-full">
                {/* 1. Background Fill (Base) - Original Dark Blue */}
                <rect x="0" y="0" width="435" height="403" fill="#0f172a" />
                
                {/* 2. Zone Fills (Layered from largest to smallest) - Keep zones but remove base background tint */}
                {type === 'offense' && (
                    <>
                         {/* Mid-Range (Inside 3PT Arc) */}
                         <path d={COURT_LINES[4]} fill={getStatHex(stats.mid)} fillOpacity="0.25" stroke="none" />
                         {/* Paint (Key) */}
                         <path d={COURT_LINES[0]} fill={getStatHex(stats.paint)} fillOpacity="0.3" stroke="none" />
                         {/* Rim (Restricted) */}
                         <path d={COURT_LINES[3]} fill={getStatHex(stats.rim)} fillOpacity="0.4" stroke="none" />
                    </>
                )}
                
                {type === 'defense' && (
                    <>
                        {/* Interior (Paint/Key) */}
                         <path d={COURT_LINES[0]} fill={getStatHex(stats.intDef)} fillOpacity="0.3" stroke="none" />
                    </>
                )}

                {/* 3. Lines */}
                <g fill="none" stroke="#475569" strokeWidth="2">
                    {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                    {/* Hoop */}
                    <circle cx="217.5" cy="375" r="7.5" stroke="#94a3b8" />
                    <line x1="187.5" y1="390" x2="247.5" y2="390" stroke="#94a3b8" strokeWidth="3" /> 
                </g>
            </svg>

            {/* Stats Overlays Layer */}
            <div className="absolute inset-0">
                {type === 'offense' ? (
                    <>
                        <CourtStatItem label="3PT" value={stats.three} top="20%" left="50%" />
                        <CourtStatItem label="MID" value={stats.mid} top="48%" left="50%" />
                        <CourtStatItem label="PAINT" value={stats.paint} top="75%" left="50%" />
                        <CourtStatItem label="RIM" value={stats.rim} top="88%" left="25%" align="left" />
                    </>
                ) : (
                    <>
                        {/* Perimeter & Steal (Guard/Wing Focus) - Upper/Mid Court */}
                        <CourtStatItem label="PER. DEF" value={stats.perDef} top="35%" left="30%" align="right" />
                        <CourtStatItem label="STEAL" value={stats.steal} top="35%" left="70%" align="left" />
                        
                        {/* Interior & Block (Big Focus) - Lower Court */}
                        <CourtStatItem label="INT. DEF" value={stats.intDef} top="75%" left="30%" align="right" />
                        <CourtStatItem label="BLOCK" value={stats.block} top="75%" left="70%" align="left" />
                    </>
                )}
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
            
            {/* 2-Column Layout */}
            <div className="p-6 lg:p-10 flex-1 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                    
                    {/* Left Column: Combined Tactics (8 cols) */}
                    <div className="lg:col-span-8 space-y-6">
                        
                        {/* Offense Container */}
                        <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl overflow-hidden shadow-sm">
                             <div className="grid grid-cols-1 md:grid-cols-2">
                                {/* Left Side: Half Court Viz */}
                                <div className="p-6 border-b md:border-b-0 md:border-r border-slate-800/50 flex flex-col justify-center bg-slate-950/20">
                                     <TacticalHalfCourt starters={starters} type="offense" />
                                </div>
                                
                                {/* Right Side: Controls */}
                                <div className="flex flex-col">
                                    {/* Merged Background Color */}
                                    <div className="px-6 py-5 border-b border-white/5 space-y-3 bg-slate-950/20">
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
                                    <div className="p-6 space-y-3 bg-slate-950/20 flex-1">
                                        <div className="text-xs font-black text-slate-400 uppercase tracking-widest pb-1 border-b border-white/5 mb-2">{OFFENSE_TACTIC_INFO[currentOffense].desc}</div>
                                        <div className="grid grid-cols-1 gap-2.5">
                                            {OFFENSE_TACTIC_INFO[currentOffense].pros.map((pro, i) => (
                                                <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-emerald-500 text-xs mt-0.5">✅</span><span className="leading-relaxed">{pro}</span></div>
                                            ))}
                                            {OFFENSE_TACTIC_INFO[currentOffense].cons.map((con, i) => (
                                                <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-red-500 text-xs mt-0.5">❌</span><span className="leading-relaxed">{con}</span></div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                             </div>
                        </div>
                        
                        {/* Defense Container */}
                        <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl overflow-hidden shadow-sm">
                             <div className="grid grid-cols-1 md:grid-cols-2">
                                {/* Left Side: Half Court Viz */}
                                <div className="p-6 border-b md:border-b-0 md:border-r border-slate-800/50 flex flex-col justify-center bg-slate-950/20">
                                     <TacticalHalfCourt starters={starters} type="defense" />
                                </div>

                                {/* Right Side: Controls */}
                                <div className="flex flex-col">
                                    {/* Merged Background Color */}
                                    <div className="px-6 py-5 border-b border-white/5 space-y-3 bg-slate-950/20">
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
                                    <div className="p-6 space-y-3 bg-slate-950/20 flex-1">
                                        <div className="text-xs font-black text-slate-400 uppercase tracking-widest pb-1 border-b border-white/5 mb-2">{DEFENSE_TACTIC_INFO[currentDefense].desc}</div>
                                        <div className="grid grid-cols-1 gap-2.5">
                                            {DEFENSE_TACTIC_INFO[currentDefense].pros.map((pro, i) => (
                                                <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-emerald-500 text-xs mt-0.5">✅</span><span className="leading-relaxed">{pro}</span></div>
                                            ))}
                                            {DEFENSE_TACTIC_INFO[currentDefense].cons.map((con, i) => (
                                                <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-red-500 text-xs mt-0.5">❌</span><span className="leading-relaxed">{con}</span></div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* Ace Stopper Section inside Defense Container */}
                                    <div className="px-6 py-4 border-t border-white/5 bg-slate-950/20">
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
                        </div>

                    </div>

                    {/* Right Column: Sliders (4 cols) */}
                    <div className="lg:col-span-4 flex flex-col space-y-4">
                        {/* Removed isolated Title, moved inside container */}
                        <div className="flex flex-col gap-8 bg-slate-950/40 p-6 pt-6 rounded-2xl border border-slate-800/50 shadow-inner h-full">
                            {/* Title moved here */}
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
            </div>
        </div>
    );
};
