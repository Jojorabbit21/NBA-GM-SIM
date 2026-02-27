
import React from 'react';
import { ArrowLeft, Calendar, Crown } from 'lucide-react';
import { DraftPoolType } from '../types';

interface DraftPoolSelectViewProps {
    onSelectPool: (pool: DraftPoolType) => void;
    onBack: () => void;
}

export const DraftPoolSelectView: React.FC<DraftPoolSelectViewProps> = ({ onSelectPool, onBack }) => {
    return (
        <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center gap-12 pretendard selection:bg-indigo-500/30">
            {/* Back button */}
            <button
                onClick={onBack}
                className="absolute top-6 left-6 p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={20} />
            </button>

            {/* Header */}
            <div className="text-center space-y-3">
                <h1 className="text-4xl font-black bebas text-white tracking-widest">
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
                    className="group relative w-72 bg-slate-900 border border-slate-800 rounded-3xl p-8 text-left transition-all hover:border-emerald-500/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] active:scale-[0.98]"
                >
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <Calendar size={24} className="text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white ko-tight">현역 선수</h2>
                            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed ko-normal">
                                2025-26 시즌 현역 선수들만 드래프트 풀에 포함됩니다. 현실적인 로스터 구성을 원한다면 추천합니다.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            현역 선수만
                        </div>
                    </div>
                </button>

                {/* All-Time Legends */}
                <button
                    onClick={() => onSelectPool('alltime')}
                    className="group relative w-72 bg-slate-900 border border-slate-800 rounded-3xl p-8 text-left transition-all hover:border-fuchsia-500/50 hover:shadow-[0_0_30px_rgba(217,70,239,0.15)] active:scale-[0.98]"
                >
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-fuchsia-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center">
                            <Crown size={24} className="text-fuchsia-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white ko-tight">올타임 레전드</h2>
                            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed ko-normal">
                                현역 선수에 더해 역대 레전드 선수들까지 드래프트 풀에 포함됩니다. 드림팀을 만들어보세요.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />
                            현역 + 레전드
                        </div>
                    </div>
                </button>
            </div>
        </div>
    );
};
