
import React from 'react';

interface QuickPlayCardProps {
    onClick: () => void;
}

export const QuickPlayCard: React.FC<QuickPlayCardProps> = ({ onClick }) => (
    <button
        onClick={onClick}
        className="w-full rounded-xl px-5 py-3.5 text-center transition-all active:scale-[0.98] bg-transparent border border-white/15 hover:bg-white/5 hover:border-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
    >
        <span className="text-base font-black text-white ko-tight">퀵플레이</span>
    </button>
);
