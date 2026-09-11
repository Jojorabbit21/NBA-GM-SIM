
import React from 'react';

interface SingleSaveCardProps {
    onClick:   () => void;
    /** summary 조회 중 — 이어하기/새 게임 여부가 아직 정해지지 않았으므로 클릭을 막는다 */
    disabled?: boolean;
}

export const SingleSaveCard: React.FC<SingleSaveCardProps> = ({ onClick, disabled = false }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className="w-full rounded-xl px-5 py-3.5 text-center transition-all active:scale-[0.98] bg-transparent border border-white/15 hover:bg-white/5 hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
    >
        <span className="text-base font-black text-white ko-tight">싱글플레이</span>
    </button>
);
