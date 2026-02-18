
import React from 'react';
import { Wand2, RotateCcw } from 'lucide-react';
import { GameTactics, Player, Team } from '../../types';
import { TacticsSlidersPanel } from './tactics/TacticsSlidersPanel';
import { DEFAULT_SLIDERS } from '../../services/game/config/tacticPresets';

interface TacticsBoardProps {
  team: Team; 
  tactics: GameTactics;
  roster: Player[];
  onUpdateTactics: (t: GameTactics) => void;
  onAutoSet: () => void;
  calculateTacticScore: (type: any) => number;
}

export const TacticsBoard: React.FC<TacticsBoardProps> = ({ team, tactics, roster, onUpdateTactics, onAutoSet }) => {
    
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

    return (
        <div className="flex flex-col h-full bg-slate-950/20">
            {/* Header Controls */}
            <div className="px-8 py-5 bg-slate-900/80 border-b border-white/5 flex items-center justify-between flex-shrink-0 relative z-20 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-black text-white uppercase tracking-widest oswald">전술 세부 설정</h2>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Strategy & Sliders</span>
                </div>
                
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
        </div>
    );
};
