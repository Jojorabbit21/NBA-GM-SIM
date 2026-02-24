
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../../types';
import { calculatePlayerOvr } from '../../../../utils/constants';
import { PLAY_TYPES } from './playTypeConstants';

interface ShotDistributionProps {
    sliders: TacticalSliders;
    roster: Player[];
}

const ZONE_CATS = [
    { key: 'rim', label: 'RIM' },
    { key: 'paint', label: 'PAINT' },
    { key: 'mid', label: 'MID' },
    { key: '3pt', label: '3PT' },
] as const;

// Mirrors engine's selectZone: score(zone) = (attr/100)*0.6 + (slider/10)*0.4
const calcZoneProbs = (
    zones: string[],
    teamOut: number,
    teamMid: number,
    teamIns: number,
    sliders: TacticalSliders
): Record<string, number> => {
    const attrMap: Record<string, number> = { '3pt': teamOut, mid: teamMid, rim: teamIns };
    const sliderMap: Record<string, number> = { '3pt': sliders.shot_3pt, mid: sliders.shot_mid, rim: sliders.shot_rim };

    const scored = zones.map(z => ({
        zone: z,
        score: (attrMap[z] / 100) * 0.60 + (sliderMap[z] / 10) * 0.40,
    }));
    const total = scored.reduce((s, c) => s + c.score, 0);
    const result: Record<string, number> = { rim: 0, paint: 0, mid: 0, '3pt': 0 };
    for (const { zone, score } of scored) {
        result[zone] = total > 0 ? score / total : 0;
    }
    return result;
};

export const ShotDistribution: React.FC<ShotDistributionProps> = ({ sliders, roster }) => {
    const data = useMemo(() => {
        const sorted = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
        const rot = sorted.slice(0, Math.min(8, sorted.length));
        const avg = (key: string) => rot.length > 0
            ? rot.reduce((s, p) => s + ((p as any)[key] || 70), 0) / rot.length
            : 70;

        const teamOut = avg('out');
        const teamMid = avg('midRange');
        const teamIns = avg('ins');

        const rawWeights = PLAY_TYPES.map(pt => sliders[pt.sliderKey] || 5);
        const totalWeight = rawWeights.reduce((s, v) => s + v, 0);
        const dist = rawWeights.map(w => w / totalWeight);

        const predicted: Record<string, number> = { rim: 0, paint: 0, mid: 0, '3pt': 0 };

        // play_pnr → Handler 40% (3pt/mid flex), Roll 40% (rim fixed), Pop 20% (3pt fixed)
        const pnrFlex = calcZoneProbs(['3pt', 'mid'], teamOut, teamMid, teamIns, sliders);
        predicted.rim += dist[0] * 0.40;
        predicted['3pt'] += dist[0] * 0.20;
        predicted['3pt'] += dist[0] * 0.40 * (pnrFlex['3pt'] || 0);
        predicted.mid += dist[0] * 0.40 * (pnrFlex.mid || 0);

        // play_iso → 3pt/mid/rim all flexible
        const isoFlex = calcZoneProbs(['3pt', 'mid', 'rim'], teamOut, teamMid, teamIns, sliders);
        predicted.rim += dist[1] * (isoFlex.rim || 0);
        predicted.mid += dist[1] * (isoFlex.mid || 0);
        predicted['3pt'] += dist[1] * (isoFlex['3pt'] || 0);

        // play_post → Paint fixed
        predicted.paint += dist[2];

        // play_cns → CatchShoot 60% (3pt fixed), Handoff 40% (3pt/mid flex)
        const cnsFlex = calcZoneProbs(['3pt', 'mid'], teamOut, teamMid, teamIns, sliders);
        predicted['3pt'] += dist[3] * 0.60;
        predicted['3pt'] += dist[3] * 0.40 * (cnsFlex['3pt'] || 0);
        predicted.mid += dist[3] * 0.40 * (cnsFlex.mid || 0);

        // play_drive → Cut 50% (rim fixed), Transition 50% (3pt/rim flex)
        const drvFlex = calcZoneProbs(['3pt', 'rim'], teamOut, teamMid, teamIns, sliders);
        predicted.rim += dist[4] * 0.50;
        predicted.rim += dist[4] * 0.50 * (drvFlex.rim || 0);
        predicted['3pt'] += dist[4] * 0.50 * (drvFlex['3pt'] || 0);

        const totalPred = Object.values(predicted).reduce((s, v) => s + v, 0);
        const predPct: Record<string, number> = {};
        for (const k of Object.keys(predicted)) {
            predPct[k] = totalPred > 0 ? (predicted[k] / totalPred) * 100 : 25;
        }

        let actualPct: Record<string, number> | null = null;
        const totalGames = roster.length > 0 ? Math.max(...roster.map(p => p.stats.g)) : 0;
        if (totalGames > 0) {
            const sumStat = (key: string) => roster.reduce((s, p) => s + ((p.stats as any)[key] || 0), 0);
            const actual = {
                rim: sumStat('zone_rim_a'),
                paint: sumStat('zone_paint_a'),
                mid: sumStat('zone_mid_l_a') + sumStat('zone_mid_c_a') + sumStat('zone_mid_r_a'),
                '3pt': sumStat('zone_c3_l_a') + sumStat('zone_c3_r_a') + sumStat('zone_atb3_l_a') + sumStat('zone_atb3_c_a') + sumStat('zone_atb3_r_a'),
            };
            const totalActual = Object.values(actual).reduce((s, v) => s + v, 0);
            if (totalActual > 0) {
                actualPct = {};
                for (const k of Object.keys(actual)) {
                    actualPct[k] = (actual[k as keyof typeof actual] / totalActual) * 100;
                }
            }
        }

        return { predPct, actualPct };
    }, [sliders, roster]);

    const maxPct = Math.max(...ZONE_CATS.map(z => data.predPct[z.key] || 0), 50);

    return (
        <div className="flex flex-col gap-3">
            <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">예상 슈팅 분포</h5>
            <div className="space-y-2.5">
                {ZONE_CATS.map(zone => {
                    const pred = data.predPct[zone.key] || 0;
                    const actual = data.actualPct?.[zone.key];
                    const barWidth = (pred / maxPct) * 100;
                    return (
                        <div key={zone.key} className="space-y-1">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-300">{zone.label}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[13px] font-black text-white tabular-nums">{pred.toFixed(0)}%</span>
                                    {actual !== undefined && (
                                        <span className="text-xs font-bold text-slate-400 tabular-nums">실 {actual.toFixed(0)}%</span>
                                    )}
                                </div>
                            </div>
                            <div className="h-2 bg-slate-900 rounded-full overflow-hidden relative">
                                <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{ width: `${barWidth}%`, backgroundColor: '#6366f1', opacity: 0.7 }}
                                />
                                {actual !== undefined && (
                                    <div
                                        className="absolute top-0 h-full w-0.5 bg-white/40"
                                        style={{ left: `${(actual / maxPct) * 100}%` }}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="text-xs text-slate-400 text-right">* 슬라이더+로스터 기반 예측 {data.actualPct && '| 흰선=실적'}</div>
        </div>
    );
};
