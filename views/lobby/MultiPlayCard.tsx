
import React from 'react';
import { Users, Lock } from 'lucide-react';

export const MultiPlayCard: React.FC = () => (
    <div
        aria-disabled="true"
        className="relative overflow-hidden rounded-2xl p-6 cursor-not-allowed select-none bg-gradient-to-br from-cyan-700 to-teal-800"
    >
        {/* 어두운 비활성 오버레이 */}
        <div className="absolute inset-0 bg-slate-950/55" />

        {/* Coming Soon 배지 */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-slate-800/80 border border-slate-600/50 text-slate-300 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider z-10">
            <Lock size={9} />
            Coming Soon
        </div>

        <div className="relative space-y-4">
            {/* 라벨 */}
            <p className="text-xs font-bold text-teal-300/60 uppercase tracking-wider">멀티플레이</p>

            {/* 아이콘 */}
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <Users size={22} className="text-white/40" />
            </div>

            {/* 타이틀 */}
            <div>
                <h2 className="text-xl font-black text-white/40 ko-tight">멀티플레이</h2>
                <p className="text-sm text-white/30 mt-1 ko-normal leading-relaxed">
                    최대 30인이 참가하는 리그에서<br />
                    경쟁하세요.
                </p>
            </div>

            {/* 출시 예정 텍스트 */}
            <div className="text-sm font-bold text-white/30 ko-normal">
                곧 출시 예정
            </div>
        </div>
    </div>
);
