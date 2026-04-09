
import React from 'react';
import { Shield, Shuffle, ChevronRight } from 'lucide-react';
import { RosterMode } from '../types';
import { APP_FULL_NAME } from '../utils/constants';

interface ModeSelectViewProps {
    onSelectMode: (mode: RosterMode) => void;
}

export const ModeSelectView: React.FC<ModeSelectViewProps> = ({ onSelectMode }) => {
    return (
        <div className="fixed inset-0 bg-[#0f172a] flex flex-col items-center justify-center gap-12 pretendard selection:bg-indigo-500/30 z-50">
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
            <div className="flex gap-4">
                {/* Default Roster */}
                <button
                    onClick={() => onSelectMode('default')}
                    className="group relative overflow-hidden rounded-2xl p-6 w-72 text-left transition-all active:scale-[0.98] bg-gradient-to-br from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 shadow-lg hover:shadow-indigo-500/30"
                >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.08),transparent_60%)]" />

                    <div className="relative space-y-4">
                        <p className="text-xs font-bold text-indigo-200 uppercase tracking-wider">기본 모드</p>

                        <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
                            <Shield size={22} className="text-white" />
                        </div>

                        <div>
                            <h2 className="text-xl font-black text-white ko-tight">기본 로스터</h2>
                            <p className="text-sm text-indigo-200 mt-1 ko-normal leading-relaxed">
                                기본 로스터 그대로 시즌을 시작합니다.<br />
                                즉시 경기를 진행할 수 있습니다.
                            </p>
                        </div>

                        <div className="flex items-center gap-2 text-sm font-bold text-white mt-2">
                            바로 시작
                            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                        </div>
                    </div>
                </button>

                {/* Custom Roster (Draft) */}
                <button
                    onClick={() => onSelectMode('custom')}
                    className="group relative overflow-hidden rounded-2xl p-6 w-72 text-left transition-all active:scale-[0.98] bg-gradient-to-br from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 shadow-lg hover:shadow-amber-500/30"
                >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.08),transparent_60%)]" />

                    <div className="relative space-y-4">
                        <p className="text-xs font-bold text-amber-200 uppercase tracking-wider">커스텀 모드</p>

                        <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
                            <Shuffle size={22} className="text-white" />
                        </div>

                        <div>
                            <h2 className="text-xl font-black text-white ko-tight">커스텀 로스터</h2>
                            <p className="text-sm text-amber-200 mt-1 ko-normal leading-relaxed">
                                30개 팀이 드래프트에 참가해<br />
                                나만의 드림팀을 만들어보세요.
                            </p>
                        </div>

                        <div className="flex items-center gap-2 text-sm font-bold text-white mt-2">
                            드래프트 설정
                            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
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
