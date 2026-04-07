
import React from 'react';
import { User, Users, ChevronRight } from 'lucide-react';
import type { PlayMode } from '../types/app';
import { APP_FULL_NAME } from '../utils/constants';

interface PlayModeSelectViewProps {
    onSelectMode: (mode: PlayMode) => void;
}

export const PlayModeSelectView: React.FC<PlayModeSelectViewProps> = ({ onSelectMode }) => {
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
                    플레이 방식을 선택하세요
                </p>
            </div>

            {/* Cards */}
            <div className="flex gap-6">
                {/* Single Play */}
                <button
                    onClick={() => onSelectMode('single')}
                    className="group relative w-80 bg-indigo-500/8 border border-indigo-500/30 rounded-3xl p-10 text-left transition-all hover:bg-indigo-500/15 hover:border-indigo-500/40 hover:shadow-[0_0_40px_rgba(99,102,241,0.15)] active:scale-[0.98]"
                >
                    <div className="space-y-5">
                        <User size={32} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                        <div>
                            <h2 className="text-xl font-black text-indigo-300 ko-tight">싱글플레이</h2>
                            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed ko-normal">
                                혼자서 NBA 구단주가 되어 시즌을 운영합니다.
                                <br />
                                언제든 저장하고 이어서 플레이할 수 있습니다.
                            </p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                            바로 시작 <ChevronRight size={14} />
                        </div>
                    </div>
                </button>

                {/* Multi Play — Coming Soon */}
                <div
                    aria-disabled="true"
                    className="relative w-80 bg-slate-800/30 border border-slate-700/40 rounded-3xl p-10 text-left cursor-not-allowed opacity-60"
                >
                    {/* Coming Soon badge */}
                    <span className="absolute top-4 right-4 bg-slate-700/60 text-slate-300 text-[10px] px-2 py-0.5 rounded uppercase tracking-wider">
                        Coming Soon
                    </span>

                    <div className="space-y-5">
                        <Users size={32} className="text-slate-500" />
                        <div>
                            <h2 className="text-xl font-black text-slate-400 ko-tight">멀티플레이</h2>
                            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed ko-normal">
                                최대 30인이 동시 참가하는 리그에서 경쟁합니다.
                                <br />
                                곧 출시 예정입니다.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Copyright */}
            <div className="absolute bottom-6 text-[10px] text-slate-600 tracking-wider">
                &copy; 2025 {APP_FULL_NAME}. All rights reserved.
            </div>
        </div>
    );
};
