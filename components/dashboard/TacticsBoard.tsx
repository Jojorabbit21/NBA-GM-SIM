
import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Wand2, ChevronDown, Edit3, Trash2 } from 'lucide-react';
import { OffenseTactic, DefenseTactic, GameTactics, TacticPreset, Player } from '../../types';
import { OFFENSE_TACTIC_INFO, DEFENSE_TACTIC_INFO } from '../../utils/tacticUtils';
import { fetchPresets, savePreset, deletePreset, renamePreset } from '../../services/tacticsService';
import { supabase } from '../../services/supabaseClient';
import { calculatePlayerOvr } from '../../utils/constants';
import { Dropdown } from '../common/Dropdown';
import { PresetRenameModal } from './tactics/PresetRenameModal';
import { TacticsSlidersPanel } from './tactics/TacticsSlidersPanel';
import { StrategyCard } from './tactics/StrategyCard';

interface TacticsBoardProps {
  tactics: GameTactics;
  roster: Player[];
  onUpdateTactics: (t: GameTactics) => void;
  onAutoSet: () => void;
  calculateTacticScore: (type: OffenseTactic | DefenseTactic) => number;
}

export const TacticsBoard: React.FC<TacticsBoardProps> = ({ tactics, roster, onUpdateTactics, onAutoSet }) => {
    const { offenseTactics: offTactics, defenseTactics: defTactics, sliders, stopperId } = tactics;
    
    const [userId, setUserId] = useState<string | null>(null);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [presets, setPresets] = useState<Record<number, TacticPreset>>({});
    const [activeSlot, setActiveSlot] = useState<number>(1);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    
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

    // --- Strategy Change Handlers ---
    const handleOffenseChange = (val: string) => {
        onUpdateTactics({ ...tactics, offenseTactics: [val as OffenseTactic] });
    };

    const handleDefenseChange = (val: string) => {
        const currentStopper = defTactics.includes('AceStopper') ? 'AceStopper' : null;
        const newTactics = currentStopper ? [currentStopper, val as DefenseTactic] : [val as DefenseTactic];
        onUpdateTactics({ ...tactics, defenseTactics: newTactics as DefenseTactic[] });
    };

    const handleStopperChange = (playerId: string) => {
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

    // Options for Selects
    const offOptions = (['Balance', 'PaceAndSpace', 'PerimeterFocus', 'PostFocus', 'Grind', 'SevenSeconds'] as OffenseTactic[]).map(t => ({ value: t, label: OFFENSE_TACTIC_INFO[t].label }));
    const defOptions = (['ManToManPerimeter', 'ZoneDefense'] as DefenseTactic[]).map(t => ({ value: t, label: DEFENSE_TACTIC_INFO[t].label }));

    return (
        <div className="flex flex-col h-full bg-slate-900/20">
            <PresetRenameModal 
                isOpen={renameModalOpen} 
                onClose={() => setRenameModalOpen(false)} 
                onConfirm={handleRenameConfirm} 
                initialName={targetRenameSlot ? (presets[targetRenameSlot]?.name || `Preset ${targetRenameSlot}`) : ""}
            />

            {/* Header Controls */}
            <div className="px-8 py-5 bg-slate-950/40 border-b border-white/5 flex items-center justify-between flex-shrink-0 relative z-20">
                <div className="flex items-center gap-6">
                    <Dropdown
                        isOpen={isDropdownOpen}
                        onOpenChange={setIsDropdownOpen}
                        width="w-64"
                        align="left"
                        trigger={
                            <button 
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="w-full flex items-center justify-between gap-2 bg-slate-900 border border-slate-700 hover:border-indigo-500/50 text-white px-4 py-2.5 rounded-xl transition-all shadow-sm group w-64"
                            >
                                <span className="text-sm font-bold truncate">
                                    {presets[activeSlot] ? presets[activeSlot].name : `프리셋 ${activeSlot}`}
                                </span>
                                <ChevronDown size={16} className={`text-slate-500 transition-transform group-hover:text-indigo-400 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                        }
                    >
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
                    </Dropdown>

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
            
            {/* Main Content */}
            <div className="p-6 lg:p-10 flex-1 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                    
                    {/* Left Column: Strategies (8 cols) */}
                    <div className="lg:col-span-8 space-y-6">
                        
                        <StrategyCard 
                            type="offense"
                            starters={starters}
                            selectedTactic={currentOffense}
                            onChange={handleOffenseChange}
                            info={OFFENSE_TACTIC_INFO[currentOffense]}
                            options={offOptions}
                        />

                        <StrategyCard 
                            type="defense"
                            starters={starters}
                            selectedTactic={currentDefense}
                            onChange={handleDefenseChange}
                            info={DEFENSE_TACTIC_INFO[currentDefense]}
                            options={defOptions}
                            stopperProps={{
                                stopperId,
                                onStopperChange: handleStopperChange,
                                roster: sortedRoster
                            }}
                        />

                    </div>

                    {/* Right Column: Sliders (4 cols) */}
                    <div className="lg:col-span-4 flex flex-col space-y-4">
                        <TacticsSlidersPanel 
                            sliders={sliders} 
                            onUpdateSliders={(s) => onUpdateTactics({ ...tactics, sliders: s })} 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
