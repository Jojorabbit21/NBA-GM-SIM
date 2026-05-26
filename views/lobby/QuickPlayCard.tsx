import React from 'react';
import { Swords, ChevronRight } from 'lucide-react';

interface QuickPlayCardProps {
    onClick: () => void;
}

export const QuickPlayCard: React.FC<QuickPlayCardProps> = ({ onClick }) => (
    <button
        onClick={onClick}
        className="group relative overflow-hidden rounded-2xl p-6 text-left transition-all active:scale-[0.98] bg-gradient-to-br from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 shadow-lg hover:shadow-amber-500/30"
    >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.08),transparent_60%)]" />

        <div className="relative space-y-4">
            <p className="text-xs font-bold text-amber-200 uppercase tracking-wider">퀵플레이</p>

            <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
                <Swords size={22} className="text-white" />
            </div>

            <div>
                <h2 className="text-xl font-black text-white ko-tight">퀵플레이</h2>
                <p className="text-sm text-amber-200 mt-1 ko-normal leading-relaxed">
                    팀과 선수를 직접 구성하고<br />
                    바로 경기를 시뮬레이션하세요.
                </p>
            </div>

            <div className="flex items-center gap-2 text-sm font-bold text-white mt-2">
                설정하기
                <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
        </div>
    </button>
);
