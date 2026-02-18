
import React, { useState, useEffect, useCallback } from 'react';
import { Wand2, RotateCcw, Save, FolderOpen, PenLine, Trash2 } from 'lucide-react';
import { GameTactics, Player, Team, TacticPreset } from '../../types';
import { TacticsSlidersPanel } from './tactics/TacticsSlidersPanel';
import { DEFAULT_SLIDERS } from '../../services/game/config/tacticPresets';
import { fetchPresets, savePreset, deletePreset, renamePreset } from '../../services/tacticsService';
import { PresetRenameModal } from './tactics/PresetRenameModal';
import { supabase } from '../../services/supabaseClient';

interface TacticsBoardProps {
  team: Team; 
  tactics: GameTactics;
  roster: Player[];
  onUpdateTactics: (t: GameTactics) => void;
  onAutoSet: () => void;
  calculateTacticScore: (type: any) => number;
}

export const TacticsBoard: React.FC<TacticsBoardProps> = ({ team, tactics, roster, onUpdateTactics, onAutoSet }) => {
    const [presets, setPresets] = useState<TacticPreset[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<number>(1);
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    // Initial Load
    useEffect(() => {
        const init = async () => {
            const { data } = await supabase.auth.getUser();
            if (data.user) {
                setUserId(data.user.id);
                loadPresets(data.user.id);
            }
        };
        init();
    }, [team.id]);

    const loadPresets = async (uid: string) => {
        const data = await fetchPresets(uid, team.id);
        setPresets(data);
    };

    const handleSave = async () => {
        if (!userId) return;
        const currentName = presets.find(p => p.slot === selectedSlot)?.name || `Custom Slot ${selectedSlot}`;
        const success = await savePreset(userId, team.id, selectedSlot, currentName, tactics);
        if (success) {
            alert(`전술이 슬롯 ${selectedSlot}에 저장되었습니다.`);
            loadPresets(userId);
        }
    };

    const handleLoad = () => {
        const preset = presets.find(p => p.slot === selectedSlot);
        if (preset && preset.data) {
            // Merge loaded data with structure to ensure compatibility
            const loadedTactics = {
                ...tactics,
                ...preset.data,
                // Ensure sliders are merged correctly if schema changed
                sliders: { ...DEFAULT_SLIDERS, ...preset.data.sliders }
            };
            onUpdateTactics(loadedTactics);
        } else {
            alert('해당 슬롯에 저장된 전술이 없습니다.');
        }
    };

    const handleDelete = async () => {
        if (!userId) return;
        if (confirm(`슬롯 ${selectedSlot}의 전술을 삭제하시겠습니까?`)) {
            const success = await deletePreset(userId, team.id, selectedSlot);
            if (success) loadPresets(userId);
        }
    };

    const handleRename = async (newName: string) => {
        if (!userId) return;
        // Save first to ensure record exists
        await savePreset(userId, team.id, selectedSlot, newName, tactics);
        loadPresets(userId);
    };

    const handleReset = () => {
        if (confirm('모든 전술 설정을 기본값(5)으로 초기화하시겠습니까?')) {
            onUpdateTactics({
                ...tactics,
                offenseTactics: ['Balance'],
                defenseTactics: ['ManToManPerimeter'],
                sliders: { ...DEFAULT_SLIDERS },
                stopperId: undefined
            });
        }
    };

    const getSlotLabel = (slot: number) => {
        const preset = presets.find(p => p.slot === slot);
        return preset ? `[${slot}] ${preset.name}` : `[${slot}] (Empty)`;
    };

    return (
        <div className="flex flex-col h-full bg-slate-950/20">
            {/* Header Controls */}
            <div className="px-8 py-5 bg-slate-900/80 border-b border-white/5 flex items-center justify-between flex-shrink-0 relative z-20 backdrop-blur-sm">
                
                {/* Left: Preset Management */}
                <div className="flex items-center gap-3">
                    <div className="flex flex-col mr-2">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">커스텀 전술 관리</span>
                        <div className="flex items-center gap-2">
                            <select 
                                value={selectedSlot} 
                                onChange={(e) => setSelectedSlot(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 text-white text-xs font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 w-40"
                            >
                                {[1, 2, 3, 4, 5].map(slot => (
                                    <option key={slot} value={slot}>{getSlotLabel(slot)}</option>
                                ))}
                            </select>
                            
                            <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                                <button onClick={handleSave} className="p-1.5 hover:bg-indigo-600 hover:text-white text-slate-400 rounded-md transition-colors" title="저장">
                                    <Save size={14} />
                                </button>
                                <button onClick={handleLoad} className="p-1.5 hover:bg-emerald-600 hover:text-white text-slate-400 rounded-md transition-colors" title="불러오기">
                                    <FolderOpen size={14} />
                                </button>
                                <button onClick={() => setIsRenameModalOpen(true)} className="p-1.5 hover:bg-amber-600 hover:text-white text-slate-400 rounded-md transition-colors" title="이름 변경">
                                    <PenLine size={14} />
                                </button>
                                <button onClick={handleDelete} className="p-1.5 hover:bg-red-600 hover:text-white text-slate-400 rounded-md transition-colors" title="삭제">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Right: Reset & AI */}
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleReset}
                        className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-all active:scale-95 border border-white/5"
                    >
                        <RotateCcw size={14} /> 초기화
                    </button>
                    <button 
                        onClick={onAutoSet}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
                    >
                        <Wand2 size={14} /> AI 자동 설정
                    </button>
                </div>
            </div>
            
            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-8 pb-20">
                    <TacticsSlidersPanel 
                        tactics={tactics}
                        onUpdateTactics={onUpdateTactics}
                        roster={roster}
                    />
                </div>
            </div>

            <PresetRenameModal 
                isOpen={isRenameModalOpen}
                onClose={() => setIsRenameModalOpen(false)}
                onConfirm={handleRename}
                initialName={presets.find(p => p.slot === selectedSlot)?.name || ""}
            />
        </div>
    );
};
