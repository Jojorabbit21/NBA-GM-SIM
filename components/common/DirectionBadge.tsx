
import React from 'react';
import { TeamDirection, DIRECTION_LABELS } from '../../types/gm';

interface DirectionBadgeProps {
    direction: TeamDirection;
    size?: 'sm' | 'md';
}

const DIRECTION_STYLES: Record<TeamDirection, string> = {
    winNow: 'bg-red-500/15 text-red-400 border-red-500/30',
    buyer: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    standPat: 'bg-slate-600/20 text-slate-400 border-slate-500/30',
    seller: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    tanking: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

export const DirectionBadge: React.FC<DirectionBadgeProps> = ({ direction, size = 'md' }) => {
    const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-[10px]';

    return (
        <span className={`inline-flex items-center justify-center font-black uppercase tracking-wider rounded-full border ${sizeClass} ${DIRECTION_STYLES[direction]}`}>
            {DIRECTION_LABELS[direction]}
        </span>
    );
};
