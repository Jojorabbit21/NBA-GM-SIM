
import React, { useMemo } from 'react';
import { Player } from '../../../../types';
import { ZONE_PATHS, COURT_LINES, ZONE_AVG, ZONE_CONFIG, getZoneStyle, getZonePillColors } from '../../../../utils/courtZones';

interface TeamZoneChartProps {
    roster: Player[];
}

type ZoneKey = 'rim' | 'paint' | 'midL' | 'midC' | 'midR' | 'c3L' | 'c3R' | 'atb3L' | 'atb3C' | 'atb3R';

const ZONE_STAT_MAP: Record<ZoneKey, { m: string; a: string }> = {
    rim: { m: 'zone_rim_m', a: 'zone_rim_a' },
    paint: { m: 'zone_paint_m', a: 'zone_paint_a' },
    midL: { m: 'zone_mid_l_m', a: 'zone_mid_l_a' },
    midC: { m: 'zone_mid_c_m', a: 'zone_mid_c_a' },
    midR: { m: 'zone_mid_r_m', a: 'zone_mid_r_a' },
    c3L: { m: 'zone_c3_l_m', a: 'zone_c3_l_a' },
    c3R: { m: 'zone_c3_r_m', a: 'zone_c3_r_a' },
    atb3L: { m: 'zone_atb3_l_m', a: 'zone_atb3_l_a' },
    atb3C: { m: 'zone_atb3_c_m', a: 'zone_atb3_c_a' },
    atb3R: { m: 'zone_atb3_r_m', a: 'zone_atb3_r_a' },
};

export const TeamZoneChart: React.FC<TeamZoneChartProps> = ({ roster }) => {
    const teamZones = useMemo(() => {
        const result: Record<ZoneKey, { m: number; a: number }> = {} as any;
        for (const key of Object.keys(ZONE_STAT_MAP) as ZoneKey[]) {
            const { m, a } = ZONE_STAT_MAP[key];
            result[key] = {
                m: roster.reduce((sum, p) => sum + ((p.stats as any)[m] || 0), 0),
                a: roster.reduce((sum, p) => sum + ((p.stats as any)[a] || 0), 0),
            };
        }
        return result;
    }, [roster]);

    const zones = useMemo(() =>
        ZONE_CONFIG.map(cfg => ({
            ...cfg,
            path: ZONE_PATHS[cfg.pathKey],
            avg: ZONE_AVG[cfg.avgKey],
            data: teamZones[cfg.key as ZoneKey],
        }))
    , [teamZones]);

    return (
        <div className="flex flex-col gap-2">
            <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">슈팅 존 히트맵</h5>
            <div className="relative w-full max-w-[300px] mx-auto aspect-[435/403] bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
            <svg viewBox="0 0 435 403" className="w-full h-full">
                <rect x="0" y="0" width="435" height="403" fill="#020617" />

                {/* Zone Heatmap */}
                <g>
                    {zones.map((z, i) => {
                        const style = getZoneStyle(z.data.m, z.data.a, z.avg);
                        return (
                            <path
                                key={i}
                                d={z.path}
                                fill={style.fill}
                                fillOpacity={style.opacity}
                                stroke="none"
                            />
                        );
                    })}
                </g>

                {/* Court Lines */}
                <g fill="none" stroke="#334155" strokeWidth="1.5" strokeOpacity="1" pointerEvents="none">
                    {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                </g>

                {/* Zone Labels — FG% and M/A at same size */}
                <g pointerEvents="none">
                    {zones.map((z, i) => {
                        const pct = z.data.a > 0 ? (z.data.m / z.data.a * 100).toFixed(0) : '0';
                        const style = getZoneStyle(z.data.m, z.data.a, z.avg);
                        const colors = getZonePillColors(style.delta, z.data.a > 0);
                        const hasData = z.data.a > 0;
                        const width = 64;
                        const height = hasData ? 52 : 32;

                        return (
                            <g key={i} transform={`translate(${z.cx}, ${z.cy})`}>
                                <rect
                                    x={-width / 2} y={-height / 2}
                                    width={width} height={height}
                                    rx={6}
                                    fill={colors.pillFill}
                                    stroke={colors.borderStroke}
                                    strokeWidth={1}
                                    fillOpacity={0.95}
                                />
                                <text textAnchor="middle" y={hasData ? -6 : 2} fill="#ffffff" fontSize="15" fontWeight="800">
                                    {pct}%
                                </text>
                                {hasData && (
                                    <text textAnchor="middle" y={16} fill="#ffffff" fontSize="15" fontWeight="700">
                                        {z.data.m}/{z.data.a}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </g>
            </svg>
            </div>
        </div>
    );
};
