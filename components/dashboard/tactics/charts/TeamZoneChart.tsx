
import React, { useMemo } from 'react';
import { Player } from '../../../../types';
import { ZONE_PATHS, COURT_LINES, ZONE_AVG, ZONE_CONFIG, getZoneStyle, getZoneVolumeStyle, getZonePillColors } from '../../../../utils/courtZones';

interface TeamZoneChartProps {
    roster: Player[];
    /** zone_rim_m, zone_rim_a 등 키-값 맵 (있으면 roster 대신 이 데이터 사용) */
    zoneOverride?: Record<string, number>;
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

export const TeamZoneChart: React.FC<TeamZoneChartProps> = ({ roster, zoneOverride }) => {
    // 상단 성공률/시도수 · 컬러스케일 토글 UI를 제거하면서 고정값으로 대체(전환 UI 없이 항상
    // 성공률 모드 + 컬러스케일 On으로 렌더링).
    const mode: 'efficiency' | 'volume' = 'efficiency';
    const colorScaleOn = true;

    const teamZones = useMemo(() => {
        const result: Record<ZoneKey, { m: number; a: number }> = {} as any;
        for (const key of Object.keys(ZONE_STAT_MAP) as ZoneKey[]) {
            const { m, a } = ZONE_STAT_MAP[key];
            if (zoneOverride) {
                result[key] = { m: zoneOverride[m] || 0, a: zoneOverride[a] || 0 };
            } else {
                result[key] = {
                    m: roster.reduce((sum, p) => sum + ((p.stats as any)[m] || 0), 0),
                    a: roster.reduce((sum, p) => sum + ((p.stats as any)[a] || 0), 0),
                };
            }
        }
        return result;
    }, [roster, zoneOverride]);

    const zones = useMemo(() =>
        ZONE_CONFIG.map(cfg => ({
            ...cfg,
            path: ZONE_PATHS[cfg.pathKey],
            avg: ZONE_AVG[cfg.avgKey],
            data: teamZones[cfg.key as ZoneKey],
        }))
    , [teamZones]);

    const maxAttempts = useMemo(() => Math.max(...zones.map(z => z.data.a), 0), [zones]);
    const totalAttempts = useMemo(() => zones.reduce((sum, z) => sum + z.data.a, 0), [zones]);

    return (
        <div className="flex flex-col gap-2">
            <div className="relative w-full aspect-[435/403] bg-slate-950 overflow-hidden">
            <svg viewBox="0 0 435 403" className="w-full h-full">
                <rect x="0" y="0" width="435" height="403" fill="#020617" />

                {/* Zone Heatmap */}
                <g>
                    {zones.map((z, i) => {
                        const style = mode === 'efficiency'
                            ? getZoneStyle(z.data.m, z.data.a, z.avg)
                            : getZoneVolumeStyle(z.data.a, maxAttempts);
                        const opacity = colorScaleOn ? style.opacity : 0;
                        return (
                            <path
                                key={i}
                                d={z.path}
                                fill={style.fill}
                                fillOpacity={opacity}
                                stroke="#64748b"
                                strokeWidth={0.75}
                                strokeOpacity={0.5}
                                className="transition-all duration-300"
                            />
                        );
                    })}
                </g>

                {/* Court Lines */}
                <g fill="#94a3b8" fillRule="evenodd" stroke="none" pointerEvents="none">
                    {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                </g>

                {/* Zone Labels */}
                <g pointerEvents="none">
                    {zones.map((z, i) => {
                        const hasData = z.data.a > 0;
                        const width = 54;
                        const height = hasData ? 42 : 32;

                        if (mode === 'efficiency') {
                            const pct = hasData ? (z.data.m / z.data.a * 100).toFixed(0) : '0';
                            const style = getZoneStyle(z.data.m, z.data.a, z.avg);
                            const colors = getZonePillColors(style.delta, hasData);
                            return (
                                <g key={i} transform={`translate(${z.cx}, ${z.cy})`}>
                                    <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={8}
                                        fill={colors.pillFill} stroke={colors.borderStroke} strokeWidth={1} />
                                    <text textAnchor="middle" y={hasData ? -5 : 0} fill={colors.textFill} fontSize="13px" fontWeight="800" dominantBaseline="middle">
                                        {pct}%
                                    </text>
                                    {hasData && (
                                        <text textAnchor="middle" y={12} fill="rgba(255,255,255,0.7)" fontSize="9px" fontWeight="600" dominantBaseline="middle">
                                            {z.data.m}/{z.data.a}
                                        </text>
                                    )}
                                </g>
                            );
                        }

                        const volPct = totalAttempts > 0 ? (z.data.a / totalAttempts * 100).toFixed(0) : '0';
                        const colors = getZonePillColors(0, hasData);
                        return (
                            <g key={i} transform={`translate(${z.cx}, ${z.cy})`}>
                                <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={8}
                                    fill={colors.pillFill} stroke={colors.borderStroke} strokeWidth={1} />
                                <text textAnchor="middle" y={hasData ? -5 : 0} fill={colors.textFill} fontSize="13px" fontWeight="800" dominantBaseline="middle">
                                    {z.data.a}
                                </text>
                                {hasData && (
                                    <text textAnchor="middle" y={12} fill="rgba(255,255,255,0.7)" fontSize="9px" fontWeight="600" dominantBaseline="middle">
                                        {volPct}%
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
