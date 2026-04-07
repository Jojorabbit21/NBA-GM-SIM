
import React from 'react';
import { Users } from 'lucide-react';

export const MultiPlayCard: React.FC = () => (
    <div
        aria-disabled="true"
        className="relative w-72 bg-slate-800/30 border border-slate-700/40 rounded-3xl p-8 text-left cursor-not-allowed opacity-60 shrink-0"
    >
        {/* Coming Soon badge */}
        <span className="absolute top-4 right-4 bg-slate-700/60 text-slate-300 text-[10px] px-2 py-0.5 rounded uppercase tracking-wider">
            Coming Soon
        </span>

        <div className="space-y-4">
            <Users size={28} className="text-slate-500" />
            <div>
                <h2 className="text-lg font-black text-slate-400 ko-tight">멀티플레이</h2>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed ko-normal">
                    최대 30인이 참가하는 리그에서 경쟁합니다.
                    <br />
                    곧 출시 예정입니다.
                </p>
            </div>
        </div>
    </div>
);
