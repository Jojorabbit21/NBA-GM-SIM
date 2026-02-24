
import React, { useMemo } from 'react';
import { Player } from '../../../../types';
import { PLAY_TYPES, PLAY_ATTR_MAP } from './playTypeConstants';

interface KeyPlayerFitProps {
    roster: Player[];
}

// Extract last name (or full name if single word)
const getShortName = (name: string): string => {
    const parts = name.split(' ');
    if (parts.length <= 1) return name;
    // Handle suffixes like "Jr.", "II", "III", "IV"
    const last = parts[parts.length - 1];
    if (['Jr.', 'Jr', 'II', 'III', 'IV', 'Sr.', 'Sr'].includes(last)) {
        return parts.length >= 3 ? parts[parts.length - 2] : parts[0];
    }
    return last;
};

export const KeyPlayerFit: React.FC<KeyPlayerFitProps> = ({ roster }) => {
    const data = useMemo(() => {
        if (roster.length === 0) return [];

        // Use top 8 rotation players
        const sorted = [...roster].sort((a, b) => b.ovr - a.ovr);
        const rotationPlayers = sorted.slice(0, Math.min(8, sorted.length));

        return PLAY_TYPES.map(pt => {
            const attrMap = PLAY_ATTR_MAP[pt.key];

            // Score each player for this play type
            const scored = rotationPlayers.map(p => {
                const fitScore = attrMap.attrs.reduce((s, attr, j) => {
                    return s + ((p as any)[attr] || 50) * attrMap.weights[j];
                }, 0);
                return { name: p.name, score: Math.round(fitScore) };
            });

            // Sort by score descending, take top 2
            scored.sort((a, b) => b.score - a.score);

            return {
                key: pt.key,
                label: pt.label,
                color: pt.color,
                top2: scored.slice(0, 2),
            };
        });
    }, [roster]);

    if (data.length === 0) return null;

    return (
        <div className="flex flex-col gap-3">
            <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">핵심 선수 적합도</h5>
            <div className="space-y-2.5">
                {data.map(item => (
                    <div key={item.key} className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color, opacity: 0.8 }} />
                            <span className="text-[10px] font-bold text-slate-300 w-14 shrink-0 truncate">{item.label}</span>
                            <div className="flex-1 flex gap-2">
                                {item.top2.map((player, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5 flex-1 min-w-0">
                                        <span className="text-[10px] font-bold text-white truncate">{getShortName(player.name)}</span>
                                        <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: item.color }}>{player.score}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="text-[9px] text-slate-600 text-right">* 상위 8인 로테이션 기준</div>
        </div>
    );
};
