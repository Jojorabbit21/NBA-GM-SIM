
import React, { useState, useEffect, memo } from 'react';
import { Wand2, RotateCcw, Save, PenLine, Trash2, Copy, ClipboardPaste } from 'lucide-react';
import { GameTactics, Player, Team, TacticPreset } from '../../types';
import { DefensiveStats } from '../../utils/defensiveStats';
import { TacticsSlidersPanel } from './tactics/TacticsSlidersPanel';
import { DEFAULT_SLIDERS } from '../../services/game/config/tacticPresets';
import { fetchPresets, savePreset, deletePreset } from '../../services/tacticsService';
import { PresetRenameModal } from './tactics/PresetRenameModal';
import { supabase } from '../../services/supabaseClient';

interface TacticsBoardProps {
  team: Team;
  tactics: GameTactics;
  roster: Player[];
  onUpdateTactics: (t: GameTactics) => void;
  onAutoSet: () => void;
  onForceSave?: () => void;
  defensiveStats?: DefensiveStats;
}

const TacticsBoardInner: React.FC<TacticsBoardProps> = ({ team, tactics, roster, onUpdateTactics, onAutoSet, onForceSave, defensiveStats }) => {
    const [presets, setPresets] = useState<TacticPreset[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<number>(1);
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [showPasteInput, setShowPasteInput] = useState(false);
    const [pasteValue, setPasteValue] = useState('');
    const [toast, setToast] = useState<string | null>(null);

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

    const showToast = (message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 2000);
    };

    const handleSlotChange = (slot: number) => {
        setSelectedSlot(slot);
        const preset = presets.find(p => p.slot === slot);
        if (preset && preset.data) {
            onUpdateTactics({
                ...tactics,
                ...preset.data,
                sliders: { ...DEFAULT_SLIDERS, ...preset.data.sliders }
            });
        }
    };

    const handleSave = async () => {
        if (!userId) return;
        const currentName = presets.find(p => p.slot === selectedSlot)?.name || `Custom Slot ${selectedSlot}`;
        const success = await savePreset(userId, team.id, selectedSlot, currentName, tactics);
        if (success) {
            onForceSave?.();
            showToast('전술 저장 완료');
            loadPresets(userId);
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
        await savePreset(userId, team.id, selectedSlot, newName, tactics);
        loadPresets(userId);
    };

    const handleReset = () => {
        if (confirm('모든 전술 설정을 기본값으로 초기화하시겠습니까?')) {
            onUpdateTactics({
                ...tactics,
                sliders: { ...DEFAULT_SLIDERS },
                stopperId: undefined
            });
        }
    };

    const handleCopy = async () => {
        const json = JSON.stringify({ sliders: tactics.sliders }, null, 2);
        await navigator.clipboard.writeText(json);
        showToast('전술 복사 완료');
    };

    const handlePasteApply = () => {
        try {
            const parsed = JSON.parse(pasteValue);
            const sliders = parsed.sliders || parsed;
            onUpdateTactics({ ...tactics, sliders: { ...DEFAULT_SLIDERS, ...sliders } });
            setShowPasteInput(false);
            setPasteValue('');
            showToast('전술 적용 완료');
        } catch {
            alert('올바른 JSON 형식이 아닙니다.');
        }
    };

    const hasPreset = (slot: number) => presets.some(p => p.slot === slot);
    const getSlotName = (slot: number) => presets.find(p => p.slot === slot)?.name;

    return (
        <div className="flex flex-col h-full bg-slate-900 relative">
            {/* Header Controls */}
            <div className="px-8 py-4 bg-slate-900/80 border-b border-white/5 flex items-center justify-between flex-shrink-0 relative z-20 backdrop-blur-sm">

                {/* Left: Slot Dropdown + Action Buttons */}
                <div className="flex items-center gap-4">
                    {/* Slot Dropdown */}
                    <select
                        value={selectedSlot}
                        onChange={e => handleSlotChange(Number(e.target.value))}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white focus:outline-none focus:border-indigo-500 cursor-pointer min-w-[180px]"
                    >
                        {[1, 2, 3, 4, 5].map(slot => (
                            <option key={slot} value={slot}>
                                {hasPreset(slot) ? `Slot ${slot} — ${getSlotName(slot) || 'Unnamed'}` : `Slot ${slot} — 빈 슬롯`}
                            </option>
                        ))}
                    </select>

                    {/* Action Buttons (Unified) */}
                    <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                        <button onClick={handleSave} className="p-1.5 hover:bg-indigo-600 hover:text-white text-slate-400 rounded-md transition-colors" title="저장">
                            <Save size={14} />
                        </button>
                        <button onClick={() => setIsRenameModalOpen(true)} className="p-1.5 hover:bg-amber-600 hover:text-white text-slate-400 rounded-md transition-colors" title="이름 변경">
                            <PenLine size={14} />
                        </button>
                        <button onClick={handleDelete} className="p-1.5 hover:bg-red-600 hover:text-white text-slate-400 rounded-md transition-colors" title="삭제">
                            <Trash2 size={14} />
                        </button>
                        {/* Divider */}
                        <div className="w-px h-5 bg-slate-600 mx-0.5" />
                        <button onClick={handleCopy} className="p-1.5 hover:bg-cyan-600 hover:text-white text-slate-400 rounded-md transition-colors" title="전술 복사 (JSON)">
                            <Copy size={14} />
                        </button>
                        <button onClick={() => { setShowPasteInput(!showPasteInput); setPasteValue(''); }} className={`p-1.5 rounded-md transition-colors ${showPasteInput ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-indigo-600 hover:text-white'}`} title="전술 붙여넣기 (JSON)">
                            <ClipboardPaste size={14} />
                        </button>
                    </div>
                </div>

                {/* Right: Delegation & Reset */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onAutoSet}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center gap-2 font-bold uppercase text-xs tracking-wider transition-all active:scale-95"
                    >
                        <Wand2 size={14} /> 코치에게 위임
                    </button>
                    <button
                        onClick={handleReset}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg flex items-center gap-2 font-bold uppercase text-xs tracking-wider transition-all active:scale-95 shadow-sm"
                    >
                        <RotateCcw size={14} /> 초기화
                    </button>
                </div>
            </div>

            {/* Paste Input Area */}
            {showPasteInput && (
                <div className="px-8 py-3 bg-slate-900/60 border-b border-slate-800 flex items-start gap-3 flex-shrink-0">
                    <textarea
                        value={pasteValue}
                        onChange={e => setPasteValue(e.target.value)}
                        placeholder='{"sliders": { "pace": 6, ... }}'
                        rows={4}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex flex-col gap-1.5">
                        <button onClick={handlePasteApply} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors">
                            적용
                        </button>
                        <button onClick={() => { setShowPasteInput(false); setPasteValue(''); }} className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold rounded-lg transition-colors">
                            취소
                        </button>
                    </div>
                </div>
            )}

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-8 pb-20">
                    <TacticsSlidersPanel
                        tactics={tactics}
                        onUpdateTactics={onUpdateTactics}
                        roster={roster}
                        defensiveStats={defensiveStats}
                    />
                </div>
            </div>

            <PresetRenameModal
                isOpen={isRenameModalOpen}
                onClose={() => setIsRenameModalOpen(false)}
                onConfirm={handleRename}
                initialName={presets.find(p => p.slot === selectedSlot)?.name || ""}
            />

            {/* Toast */}
            {toast && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="px-5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white shadow-xl backdrop-blur-sm">
                        {toast}
                    </div>
                </div>
            )}
        </div>
    );
};

export const TacticsBoard = memo(TacticsBoardInner, (prev, next) =>
    prev.team === next.team &&
    prev.tactics === next.tactics &&
    prev.roster === next.roster &&
    prev.onUpdateTactics === next.onUpdateTactics &&
    prev.onAutoSet === next.onAutoSet &&
    prev.onForceSave === next.onForceSave &&
    prev.defensiveStats === next.defensiveStats
);
