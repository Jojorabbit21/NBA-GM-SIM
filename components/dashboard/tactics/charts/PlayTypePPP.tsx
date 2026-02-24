
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../../types';
import { calculatePlayerOvr } from '../../../../utils/constants';
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

// Donut chart constants
const DONUT_CX = 80;
const DONUT_CY = 80;
const DONUT_R = 55;
const DONUT_STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_R; // ≈ 345.58

export const PlayTypePPP: React.FC<PlayTypePPPProps> = ({ sliders, roster }) => {
    const data = useMemo(() => {
        const rawWeights = PLAY_TYPES.map(pt => sliders[pt.sliderKey] || 5);
        const totalWeight = rawWeights.reduce((s, v) => s + v, 0);
        const distribution = rawWeights.map(w => (w / totalWeight) * 100);

        // Top 8 rotation players
        const sorted = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
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

    // Donut segments
    const donutSegments = useMemo(() => {
        let accumulated = 0;
        return data.map(item => {
            const segmentLength = (item.distribution / 100) * CIRCUMFERENCE;
            const offset = -accumulated;
            accumulated += segmentLength;
            return { segmentLength, offset, color: item.color };
        });
    }, [data]);

    const maxPPP = Math.max(...data.map(d => d.predictedPPP), 1.2);

    return (
        <div className="flex flex-col gap-3">
            <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">플레이타입 분석</h5>

            <div className="flex items-start gap-5">
                {/* Left: Donut Chart + Legend */}
                <div className="w-[180px] shrink-0 flex flex-col items-center gap-3">
                    {/* Donut SVG */}
                    <svg viewBox="0 0 160 160" className="w-[140px] h-[140px]">
                        {/* Background ring */}
                        <circle
                            cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
                            fill="none" stroke="#1e293b" strokeWidth={DONUT_STROKE}
                        />
                        {/* Segments */}
                        {donutSegments.map((seg, i) => (
                            <circle
                                key={i}
                                cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
                                fill="none"
                                stroke={seg.color}
                                strokeWidth={DONUT_STROKE}
                                strokeDasharray={`${seg.segmentLength} ${CIRCUMFERENCE}`}
                                strokeDashoffset={seg.offset}
                                strokeLinecap="butt"
                                transform={`rotate(-90 ${DONUT_CX} ${DONUT_CY})`}
                                className="transition-all duration-300"
                            />
                        ))}
                    </svg>

                    {/* Legend — 2 columns, last item centered */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 w-full">
                        {data.map((item, i) => (
                            <div
                                key={item.key}
                                className={`flex items-center gap-1.5 ${i === data.length - 1 && data.length % 2 !== 0 ? 'col-span-2 justify-center' : ''}`}
                            >
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                <span className="text-[11px] font-bold text-slate-400 truncate">{item.label}</span>
                                <span className="text-[11px] font-black text-white tabular-nums">{item.distribution.toFixed(0)}%</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: PPP Bar Graph */}
                <div className="flex-1 flex flex-col gap-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">효율 (PPP)</span>

                    <div className="space-y-2.5">
                        {data.map(item => {
                            const barWidth = (item.predictedPPP / maxPPP) * 100;
                            return (
                                <div key={item.key} className="flex items-center gap-2">
                                    {/* Play type name with color dot */}
                                    <div className="w-[72px] shrink-0 flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                        <span className="text-xs font-bold text-slate-300 truncate">{item.label}</span>
                                    </div>

                                    {/* PPP bar */}
                                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-300"
                                            style={{ width: `${barWidth}%`, backgroundColor: '#6366f1', opacity: 0.7 }}
                                        />
                                    </div>

                                    {/* PPP value */}
                                    <span className="w-10 text-[13px] font-black text-white tabular-nums text-right">{item.predictedPPP.toFixed(2)}</span>

                                    {/* Key player */}
                                    <span className="w-[100px] text-xs font-bold text-slate-400 text-right truncate">{item.players || '—'}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="text-xs text-slate-400 text-right mt-1">* 로스터 능력치 기반 예측값</div>
                </div>
            </div>
        </div>
    );
};
