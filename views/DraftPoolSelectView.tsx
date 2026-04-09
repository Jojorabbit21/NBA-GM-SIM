
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
        <div className="fixed inset-0 bg-[#0f172a] flex flex-col items-center justify-center gap-12 pretendard selection:bg-indigo-500/30 z-50">
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
            <div className="flex gap-4">
                {/* Current Players Only */}
                <button
                    onClick={() => onSelectPool('current')}
                    className="group relative overflow-hidden rounded-2xl p-6 w-72 text-left transition-all active:scale-[0.98] bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 shadow-lg hover:shadow-emerald-500/30"
                >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.08),transparent_60%)]" />

                    <div className="relative space-y-4">
                        <p className="text-xs font-bold text-emerald-200 uppercase tracking-wider">현역 선수</p>

                        <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
                            <Users size={22} className="text-white" />
                        </div>

                        <div>
                            <h2 className="text-xl font-black text-white ko-tight">현역 선수</h2>
                            <p className="text-sm text-emerald-200 mt-1 ko-normal leading-relaxed">
                                현역 선수들만 드래프트 풀에<br />
                                포함됩니다. 현실적인 구성 추천.
                            </p>
                        </div>

                        <div className="flex items-center gap-2 text-sm font-bold text-white mt-2">
                            선택하기
                            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                        </div>
                    </div>
                </button>

                {/* All-Time Legends */}
                <button
                    onClick={() => onSelectPool('alltime')}
                    className="group relative overflow-hidden rounded-2xl p-6 w-72 text-left transition-all active:scale-[0.98] bg-gradient-to-br from-fuchsia-600 to-purple-700 hover:from-fuchsia-500 hover:to-purple-600 shadow-lg hover:shadow-fuchsia-500/30"
                >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.08),transparent_60%)]" />

                    <div className="relative space-y-4">
                        <p className="text-xs font-bold text-fuchsia-200 uppercase tracking-wider">올타임 레전드</p>

                        <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
                            <Crown size={22} className="text-white" />
                        </div>

                        <div>
                            <h2 className="text-xl font-black text-white ko-tight">올타임 레전드</h2>
                            <p className="text-sm text-fuchsia-200 mt-1 ko-normal leading-relaxed">
                                역대 레전드 선수들까지 포함됩니다.<br />
                                드림팀을 만들어보세요.
                            </p>
                        </div>

                        <div className="flex items-center gap-2 text-sm font-bold text-white mt-2">
                            선택하기
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
