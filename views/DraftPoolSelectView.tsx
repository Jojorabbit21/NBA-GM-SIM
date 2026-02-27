
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { DraftPoolType } from '../types';

interface DraftPoolSelectViewProps {
    onSelectPool: (pool: DraftPoolType) => void;
    onBack: () => void;
}

export const DraftPoolSelectView: React.FC<DraftPoolSelectViewProps> = ({ onSelectPool, onBack }) => {
    return (
        <div className="h-screen w-full bg-slate-900 flex flex-col items-center justify-center gap-12 pretendard selection:bg-indigo-500/30 relative">
            {/* Back button */}
            <button
                onClick={onBack}
                className="absolute top-6 left-6 p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={20} />
            </button>

            {/* Header */}
            <div className="text-center space-y-4">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-[0.3em]">
                    Basketball GM Simulator 2025-26
                </h2>
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
                    className="group relative w-72 bg-emerald-500/8 border border-emerald-500/20 rounded-3xl p-8 text-left transition-all hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.12)] active:scale-[0.98]"
                >
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-lg font-black text-emerald-300 ko-tight">현역 선수</h2>
                            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed ko-normal">
                                2025-26 시즌 현역 선수들만 드래프트 풀에
                                <br />
                                포함됩니다. 현실적인 구성을 원한다면 추천합니다.
                            </p>
                        </div>
                    </div>
                </button>

                {/* All-Time Legends */}
                <button
                    onClick={() => onSelectPool('alltime')}
                    className="group relative w-72 bg-fuchsia-500/8 border border-fuchsia-500/20 rounded-3xl p-8 text-left transition-all hover:bg-fuchsia-500/15 hover:border-fuchsia-500/40 hover:shadow-[0_0_30px_rgba(217,70,239,0.12)] active:scale-[0.98]"
                >
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-lg font-black text-fuchsia-300 ko-tight">올타임 레전드</h2>
                            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed ko-normal">
                                현역 선수에 더해 역대 레전드 선수들까지
                                <br />
                                드래프트 풀에 포함됩니다. 드림팀을 만들어보세요.
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
