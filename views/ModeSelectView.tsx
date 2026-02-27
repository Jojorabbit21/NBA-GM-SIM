
import React from 'react';
import { RosterMode } from '../types';

interface ModeSelectViewProps {
    onSelectMode: (mode: RosterMode) => void;
}

export const ModeSelectView: React.FC<ModeSelectViewProps> = ({ onSelectMode }) => {
    return (
        <div className="h-screen w-full bg-slate-900 flex flex-col items-center justify-center gap-12 pretendard selection:bg-indigo-500/30 relative">
            {/* Header */}
            <div className="text-center space-y-4">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-[0.3em]">
                    Basketball GM Simulator 2025-26
                </h2>
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
                    className="group relative w-72 bg-emerald-500/8 border border-emerald-500/20 rounded-3xl p-8 text-left transition-all hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.12)] active:scale-[0.98]"
                >
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-lg font-black text-emerald-300 ko-tight">기본 로스터</h2>
                            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed ko-normal">
                                기본 로스터 구성 그대로 시즌을 시작합니다.
                                <br />
                                즉시 경기를 진행할 수 있습니다.
                            </p>
                        </div>
                    </div>
                </button>

                {/* Custom Roster (Draft) */}
                <button
                    onClick={() => onSelectMode('custom')}
                    className="group relative w-72 bg-amber-500/8 border border-amber-500/20 rounded-3xl p-8 text-left transition-all hover:bg-amber-500/15 hover:border-amber-500/40 hover:shadow-[0_0_30px_rgba(245,158,11,0.12)] active:scale-[0.98]"
                >
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-lg font-black text-amber-300 ko-tight">커스텀 로스터</h2>
                            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed ko-normal">
                                30개 팀이 드래프트에 참가해 로스터를 새롭게
                                <br />
                                구성합니다. 나만의 드림팀을 만들어보세요.
                            </p>
                        </div>
                    </div>
                </button>
            </div>

            {/* Copyright */}
            <div className="absolute bottom-6 text-[10px] text-slate-600 tracking-wider">
                &copy; 2025 BPL GM SIM. All rights reserved.
            </div>
        </div>
    );
};
