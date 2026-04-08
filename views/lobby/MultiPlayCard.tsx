
import React from 'react';
import { Users, ChevronRight } from 'lucide-react';

interface MultiPlayCardProps {
    onClick: () => void;
}

export const MultiPlayCard: React.FC<MultiPlayCardProps> = ({ onClick }) => (
    <button
        onClick={onClick}
        className="group relative overflow-hidden rounded-2xl p-6 text-left transition-all active:scale-[0.98] bg-gradient-to-br from-cyan-600 to-teal-700 hover:from-cyan-500 hover:to-teal-600 shadow-lg hover:shadow-cyan-500/30"
    >
        {/* 배경 glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.08),transparent_60%)]" />

        <div className="relative space-y-4">
            {/* 라벨 */}
            <p className="text-xs font-bold text-teal-200 uppercase tracking-wider">멀티플레이</p>

            {/* 아이콘 */}
            <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
                <Users size={22} className="text-white" />
            </div>

            {/* 타이틀 */}
            <div>
                <h2 className="text-xl font-black text-white ko-tight">멀티플레이</h2>
                <p className="text-sm text-teal-200 mt-1 ko-normal leading-relaxed">
                    최대 30인이 참가하는 리그에서<br />
                    경쟁하세요.
                </p>
            </div>

            {/* CTA */}
            <div className="flex items-center gap-2 text-sm font-bold text-white mt-2">
                참가하기
                <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
        </div>
    </button>
);
