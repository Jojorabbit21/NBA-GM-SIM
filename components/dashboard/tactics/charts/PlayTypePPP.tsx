
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../../types';
import { PLAY_TYPES, PLAY_ATTR_MAP, PNR_HANDLER_MAP, PNR_ROLLER_MAP } from './playTypeConstants';

interface PlayTypePPPProps {
    sliders: TacticalSliders;
    roster: Player[];
}

// Extract last name
const getShortName = (name: string): string => {
    const parts = name.split(' ');
    if (parts.length <= 1) return name;
    const last = parts[parts.length - 1];
    if (['Jr.', 'Jr', 'II', 'III', 'IV', 'Sr.', 'Sr'].includes(last)) {
        return parts.length >= 3 ? parts[parts.length - 2] : parts[0];
    }
    return last;
};

// Calculate best-fit player for a given attr map
const findBestPlayer = (
    players: Player[],
    attrMap: { attrs: string[]; weights: number[] },
    excludeId?: string
): { name: string; score: number } | null => {
    const pool = excludeId ? players.filter(p => p.id !== excludeId) : players;
    if (pool.length === 0) return null;

    let best = { name: '', score: 0 };
    for (const p of pool) {
        const score = attrMap.attrs.reduce((s, attr, j) => {
            return s + ((p as any)[attr] || 50) * attrMap.weights[j];
        }, 0);
        if (score > best.score) best = { name: p.name, score: Math.round(score) };
    }
    return best;
};

export const PlayTypePPP: React.FC<PlayTypePPPProps> = ({ sliders, roster }) => {
    const data = useMemo(() => {
        const rawWeights = PLAY_TYPES.map(pt => sliders[pt.sliderKey] || 5);
        const totalWeight = rawWeights.reduce((s, v) => s + v, 0);
        const distribution = rawWeights.map(w => (w / totalWeight) * 100);

        // Top 8 rotation players
        const sorted = [...roster].sort((a, b) => b.ovr - a.ovr);
        const rotationPlayers = sorted.slice(0, Math.min(8, sorted.length));

        return PLAY_TYPES.map((pt, i) => {
            const attrMap = PLAY_ATTR_MAP[pt.key];
            let teamAttrScore = 0;

            if (rotationPlayers.length > 0) {
                const avgScore = rotationPlayers.reduce((sum, p) => {
                    const playerScore = attrMap.attrs.reduce((s, attr, j) => {
                        return s + ((p as any)[attr] || 50) * attrMap.weights[j];
                    }, 0);
                    return sum + playerScore;
                }, 0) / rotationPlayers.length;
                teamAttrScore = avgScore / 100;
            }

            const predictedPPP = pt.baseEff * (0.7 + teamAttrScore * 0.6);

            // Find best-fit players
            let players: string = '';
            if (rotationPlayers.length > 0) {
                if (pt.key === 'pnr') {
                    // PnR: handler + roller pair
                    const handler = findBestPlayer(rotationPlayers, PNR_HANDLER_MAP);
                    const roller = findBestPlayer(rotationPlayers, PNR_ROLLER_MAP, handler?.name ? rotationPlayers.find(p => p.name === handler.name)?.id : undefined);
                    const parts = [];
                    if (handler) parts.push(getShortName(handler.name));
                    if (roller) parts.push(getShortName(roller.name));
                    players = parts.join(' · ');
                } else {
                    const best = findBestPlayer(rotationPlayers, attrMap);
                    if (best) players = getShortName(best.name);
                }
            }

            return {
                ...pt,
                distribution: distribution[i],
                predictedPPP: Math.round(predictedPPP * 100) / 100,
                players,
            };
        });
    }, [sliders, roster]);

    const maxPPP = Math.max(...data.map(d => d.predictedPPP), 1.2);

    return (
        <div className="flex flex-col gap-3">
            <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">플레이타입 효율</h5>
            <div className="space-y-3">
                {data.map(item => {
                    const barWidth = (item.predictedPPP / maxPPP) * 100;
                    return (
                        <div key={item.key} className="space-y-1">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-300">{item.label}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-400 tabular-nums">{item.distribution.toFixed(0)}%</span>
                                    <span className="text-[13px] font-black text-white tabular-nums">{item.predictedPPP.toFixed(2)}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{ width: `${barWidth}%`, backgroundColor: '#6366f1', opacity: 0.7 }}
                                    />
                                </div>
                                {item.players && (
                                    <span className="text-xs font-bold text-slate-400 shrink-0 max-w-[120px] truncate">{item.players}</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="text-xs text-slate-400 text-right">* 로스터 능력치 기반 예측값</div>
        </div>
    );
};
