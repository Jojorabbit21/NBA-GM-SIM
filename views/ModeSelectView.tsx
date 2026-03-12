
import React from 'react';
import { Shield, Shuffle, ChevronRight } from 'lucide-react';
import { RosterMode } from '../types';
import { APP_FULL_NAME } from '../utils/constants';

interface ModeSelectViewProps {
    onSelectMode: (mode: RosterMode) => void;
}

export const ModeSelectView: React.FC<ModeSelectViewProps> = ({ onSelectMode }) => {
    return (
        <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center gap-12 pretendard selection:bg-indigo-500/30 relative">
            {/* Header */}
            <div className="text-center space-y-4">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-[0.3em]">
                    {APP_FULL_NAME}
                </h2>
                <h1 className="text-4xl font-black oswald text-white uppercase tracking-widest">
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
                    className="group relative w-80 bg-emerald-500/8 border border-emerald-500/30 rounded-3xl p-10 text-left transition-all hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:shadow-[0_0_40px_rgba(16,185,129,0.15)] active:scale-[0.98]"
                >
                    <div className="space-y-5">
                        <Shield size={32} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                        <div>
                            <h2 className="text-xl font-black text-emerald-300 ko-tight">기본 로스터</h2>
                            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed ko-normal">
                                기본 로스터 구성 그대로 시즌을 시작합니다.
                                <br />
                                즉시 경기를 진행할 수 있습니다.
                            </p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                            바로 시작 <ChevronRight size={14} />
                        </div>
                    </div>
                </button>

                {/* Custom Roster (Draft) */}
                <button
                    onClick={() => onSelectMode('custom')}
                    className="group relative w-80 bg-amber-500/8 border border-amber-500/30 rounded-3xl p-10 text-left transition-all hover:bg-amber-500/15 hover:border-amber-500/40 hover:shadow-[0_0_40px_rgba(245,158,11,0.15)] active:scale-[0.98]"
                >
                    <div className="space-y-5">
                        <Shuffle size={32} className="text-amber-400 group-hover:scale-110 transition-transform" />
                        <div>
                            <h2 className="text-xl font-black text-amber-300 ko-tight">커스텀 로스터</h2>
                            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed ko-normal">
                                30개 팀이 드래프트에 참가해 로스터를 새롭게
                                <br />
                                구성합니다. 나만의 드림팀을 만들어보세요.
                            </p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                            드래프트 설정 <ChevronRight size={14} />
                        </div>
                    </div>
                </button>
            </div>

            {/* Copyright */}
            <div className="absolute bottom-6 text-[10px] text-slate-600 tracking-wider">
                &copy; 2025 {APP_FULL_NAME}. All rights reserved.
            </div>
        </div>
    );
};
