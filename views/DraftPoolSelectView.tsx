
import React from 'react';
import { ArrowLeft, Users, Crown, ChevronRight } from 'lucide-react';
import { DraftPoolType } from '../types';
import { APP_FULL_NAME } from '../utils/constants';

interface DraftPoolSelectViewProps {
    onSelectPool: (pool: DraftPoolType) => void;
    onBack: () => void;
}

export const DraftPoolSelectView: React.FC<DraftPoolSelectViewProps> = ({ onSelectPool, onBack }) => {
    return (
        <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center gap-12 pretendard selection:bg-indigo-500/30 relative">
            {/* Back button */}
            <button
                onClick={onBack}
                className="absolute top-6 left-6 p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={20} />
            </button>

            {/* Header */}
            <div className="text-center space-y-4">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-[0.3em]">
                    {APP_FULL_NAME}
                </h2>
                <h1 className="text-4xl font-black oswald text-white uppercase tracking-widest">
                    DRAFT <span className="text-amber-500">POOL</span>
                </h1>
                <p className="text-sm text-slate-400 ko-normal">
                    드래프트에 포함될 선수 풀을 선택하세요
                </p>
            </div>

            {/* Cards */}
            <div className="flex gap-6">
                {/* Current Players Only */}
                <button
                    onClick={() => onSelectPool('current')}
                    className="group relative w-80 bg-emerald-500/8 border border-emerald-500/30 rounded-3xl p-10 text-left transition-all hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:shadow-[0_0_40px_rgba(16,185,129,0.15)] active:scale-[0.98]"
                >
                    <div className="space-y-5">
                        <Users size={32} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                        <div>
                            <h2 className="text-xl font-black text-emerald-300 ko-tight">현역 선수</h2>
                            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed ko-normal">
                                2025-26 시즌 현역 선수들만 드래프트 풀에
                                <br />
                                포함됩니다. 현실적인 구성을 원한다면 추천합니다.
                            </p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                            선택 <ChevronRight size={14} />
                        </div>
                    </div>
                </button>

                {/* All-Time Legends */}
                <button
                    onClick={() => onSelectPool('alltime')}
                    className="group relative w-80 bg-fuchsia-500/8 border border-fuchsia-500/30 rounded-3xl p-10 text-left transition-all hover:bg-fuchsia-500/15 hover:border-fuchsia-500/40 hover:shadow-[0_0_40px_rgba(217,70,239,0.15)] active:scale-[0.98]"
                >
                    <div className="space-y-5">
                        <Crown size={32} className="text-fuchsia-400 group-hover:scale-110 transition-transform" />
                        <div>
                            <h2 className="text-xl font-black text-fuchsia-300 ko-tight">올타임 레전드</h2>
                            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed ko-normal">
                                현역 선수에 더해 역대 레전드 선수들까지
                                <br />
                                드래프트 풀에 포함됩니다. 드림팀을 만들어보세요.
                            </p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-fuchsia-400 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                            선택 <ChevronRight size={14} />
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
