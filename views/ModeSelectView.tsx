
import React from 'react';
import { Users, Wand2 } from 'lucide-react';
import { RosterMode } from '../types';

interface ModeSelectViewProps {
    onSelectMode: (mode: RosterMode) => void;
}

export const ModeSelectView: React.FC<ModeSelectViewProps> = ({ onSelectMode }) => {
    return (
        <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center gap-12 pretendard selection:bg-indigo-500/30">
            {/* Header */}
            <div className="text-center space-y-3">
                <h1 className="text-4xl font-black bebas text-white tracking-widest">
                    CHOOSE YOUR <span className="text-indigo-500">MODE</span>
                </h1>
                <p className="text-sm text-slate-400 ko-normal">
                    시즌을 시작하기 전에 로스터 구성 방식을 선택하세요
                </p>
            </div>

            {/* Cards */}
            <div className="flex gap-6">
                {/* Default Roster */}
                <button
                    onClick={() => onSelectMode('default')}
                    className="group relative w-72 bg-slate-900 border border-slate-800 rounded-3xl p-8 text-left transition-all hover:border-indigo-500/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] active:scale-[0.98]"
                >
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                            <Users size={24} className="text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white ko-tight">기본 로스터</h2>
                            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed ko-normal">
                                실제 NBA 로스터 구성 그대로 시즌을 시작합니다. 즉시 경기를 진행할 수 있습니다.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            빠른 시작
                        </div>
                    </div>
                </button>

                {/* Custom Roster (Draft) */}
                <button
                    onClick={() => onSelectMode('custom')}
                    className="group relative w-72 bg-slate-900 border border-slate-800 rounded-3xl p-8 text-left transition-all hover:border-amber-500/50 hover:shadow-[0_0_30px_rgba(245,158,11,0.15)] active:scale-[0.98]"
                >
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <Wand2 size={24} className="text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white ko-tight">커스텀 로스터</h2>
                            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed ko-normal">
                                30개 팀이 드래프트를 통해 로스터를 새로 구성합니다. 나만의 드림팀을 만들어보세요.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            드래프트 모드
                        </div>
                    </div>
                </button>
            </div>
        </div>
    );
};
