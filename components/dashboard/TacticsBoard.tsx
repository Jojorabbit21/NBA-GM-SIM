
import React, { useState, useEffect, memo } from 'react';
import { RotateCcw, Save, PenLine, Trash2, Copy, ClipboardPaste } from 'lucide-react';
import { GameTactics, Player, Team, TacticPreset } from '../../types';
import { DefensiveStats } from '../../utils/defensiveStats';
import { TacticsSlidersPanel } from './tactics/TacticsSlidersPanel';
import { PlayerTacticsPanel } from './tactics/PlayerTacticsPanel';
import { DEFAULT_SLIDERS } from '../../services/game/config/tacticPresets';
import { fetchPresets, savePreset, deletePreset } from '../../services/tacticsService';
import { PresetRenameModal } from './tactics/PresetRenameModal';
import { TabBar } from '../common/TabBar';
import { Button } from '../common/Button';
import { IconButton } from '../common/IconButton';
import { supabase } from '../../services/supabaseClient';

type TacticsTab = 'team' | 'player';

interface TacticsBoardProps {
  team: Team;
  tactics: GameTactics;
  roster: Player[];
  onUpdateTactics: (t: GameTactics) => void;
  onAutoSet: () => void;
  onForceSave?: (overrides?: any) => void;
  defensiveStats?: DefensiveStats;
  coachName?: string;
  hidePresets?: boolean;
  teamTacticsOnly?: boolean;
}

const TacticsBoardInner: React.FC<TacticsBoardProps> = ({ team, tactics, roster, onUpdateTactics, onAutoSet, onForceSave, defensiveStats, coachName, hidePresets, teamTacticsOnly }) => {
    const [activeTab, setActiveTab] = useState<TacticsTab>('team');
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
            try {
                const { data, error } = await supabase.auth.getUser();
                if (error) {
                    console.warn('⚠️ [TacticsBoard] getUser failed:', error.message);
                    return;
                }
                if (data.user) {
                    setUserId(data.user.id);
                    loadPresets(data.user.id);
                }
            } catch (e) {
                console.warn('⚠️ [TacticsBoard] init error:', e);
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
            onForceSave?.({ userTactics: tactics });
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
            {/* Tab Bar — teamTacticsOnly 모드에서는 숨김 */}
            {!teamTacticsOnly && (
            <TabBar
                tabs={[
                    { id: 'team' as TacticsTab, label: '팀 전술' },
                    { id: 'player' as TacticsTab, label: '개인 전술' },
                ]}
                activeTab={activeTab}
                onTabChange={(tab) => setActiveTab(tab as TacticsTab)}
            />
            )}

            {/* Header Controls */}
            {!hidePresets && (
            <div className="px-8 py-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between flex-shrink-0 relative z-20">

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
                        <IconButton label="저장" tone="inherit" shape="md" onClick={handleSave} className="text-slate-400 hover:bg-indigo-600">
                            <Save size={14} />
                        </IconButton>
                        <IconButton label="이름 변경" tone="inherit" shape="md" onClick={() => setIsRenameModalOpen(true)} className="text-slate-400 hover:bg-amber-600">
                            <PenLine size={14} />
                        </IconButton>
                        <IconButton label="삭제" tone="inherit" shape="md" onClick={handleDelete} className="text-slate-400 hover:bg-red-600">
                            <Trash2 size={14} />
                        </IconButton>
                        {/* Divider */}
                        <div className="w-px h-5 bg-slate-600 mx-0.5" />
                        <IconButton label="전술 복사 (JSON)" tone="inherit" shape="md" onClick={handleCopy} className="text-slate-400 hover:bg-cyan-600">
                            <Copy size={14} />
                        </IconButton>
                        <IconButton
                            label="전술 붙여넣기 (JSON)"
                            tone="inherit"
                            shape="md"
                            onClick={() => { setShowPasteInput(!showPasteInput); setPasteValue(''); }}
                            className={showPasteInput ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-indigo-600'}
                        >
                            <ClipboardPaste size={14} />
                        </IconButton>
                    </div>
                </div>

                {/* Right: Delegation & Reset */}
                <div className="flex items-center gap-3">
                    <Button variant="primary" onClick={onAutoSet}>
                        {coachName ? `${coachName}에게 위임` : '코치에게 위임'}
                    </Button>
                    <Button variant="secondary" onClick={handleReset} icon={<RotateCcw size={14} />}>
                        초기화
                    </Button>
                </div>
            </div>
            )}

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {(activeTab === 'team' || teamTacticsOnly) && (
                    <>
                        {/* Paste Input Area — hidePresets가 아닐 때만 표시 */}
                        {!teamTacticsOnly && showPasteInput && (
                            <div className="px-8 py-3 bg-slate-900/60 border-b border-slate-800 flex items-start gap-3">
                                <textarea
                                    value={pasteValue}
                                    onChange={e => setPasteValue(e.target.value)}
                                    placeholder='{"sliders": { "pace": 6, ... }}'
                                    rows={4}
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500"
                                />
                                <div className="flex flex-col gap-1.5">
                                    <Button variant="primary" size="lg" onClick={handlePasteApply}>
                                        적용
                                    </Button>
                                    <Button variant="secondary" size="lg" onClick={() => { setShowPasteInput(false); setPasteValue(''); }}>
                                        취소
                                    </Button>
                                </div>
                            </div>
                        )}
                        <div className="p-8 pb-20">
                            <TacticsSlidersPanel
                                tactics={tactics}
                                onUpdateTactics={onUpdateTactics}
                                roster={roster}
                                defensiveStats={defensiveStats}
                                slidersOnly={teamTacticsOnly}
                            />
                        </div>
                    </>
                )}
                {!teamTacticsOnly && activeTab === 'player' && (
                    <div className="pb-20">
                        <PlayerTacticsPanel
                            tactics={tactics}
                            roster={roster}
                            onUpdateTactics={onUpdateTactics}
                        />
                    </div>
                )}
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
    prev.defensiveStats === next.defensiveStats &&
    prev.hidePresets === next.hidePresets &&
    prev.teamTacticsOnly === next.teamTacticsOnly
);
