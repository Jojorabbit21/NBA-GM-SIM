
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../../types';
import { calculatePlayerOvr } from '../../../../utils/constants';
import { PLAY_TYPES, getPlayTypeDistribution } from './playTypeConstants';

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

// 10개 플레이타입별 슈팅 존 프로파일
const PLAY_ZONE_MAP: Record<string, Record<string, number>> = {
    'PnR_Handler':   { '3pt': 0.35, mid: 0.30, rim: 0.35 },
    'PnR_Roll':      { rim: 0.85, paint: 0.15 },
    'PnR_Pop':       { '3pt': 0.85, mid: 0.15 },
    'CatchShoot':    { '3pt': 0.85, mid: 0.15 },
    'DriveKick':     { '3pt': 0.70, mid: 0.30 },
    'Iso':           { '3pt': 0.25, mid: 0.35, rim: 0.40 },
    'PostUp':        { paint: 0.70, mid: 0.30 },
    'Cut':           { rim: 0.85, paint: 0.15 },
    'OffBallScreen': { '3pt': 0.75, mid: 0.25 },
    'Handoff':       { '3pt': 0.60, mid: 0.30, rim: 0.10 },
};

export const ShotDistribution: React.FC<ShotDistributionProps> = ({ sliders, roster }) => {
    const data = useMemo(() => {
        const dist = getPlayTypeDistribution(sliders);

        // 플레이타입 비중 × 존 프로파일 → 전체 존 분포 예측
        const predicted: Record<string, number> = { rim: 0, paint: 0, mid: 0, '3pt': 0 };
        PLAY_TYPES.forEach((pt, i) => {
            const share = dist[i] / 100;
            const zoneProfile = PLAY_ZONE_MAP[pt.key];
            if (zoneProfile) {
                for (const [zone, pct] of Object.entries(zoneProfile)) {
                    predicted[zone] = (predicted[zone] || 0) + share * pct;
                }
            }
        });

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
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden relative">
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
            <div className="text-xs text-slate-400 text-right">* 슬라이더 기반 예측 {data.actualPct && '| 흰선=실적'}</div>
        </div>
    );
};
