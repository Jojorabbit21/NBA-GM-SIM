
import React, { useMemo } from 'react';
import { Player } from '../../../../types';
import { ZONE_PATHS, COURT_LINES, ZONE_AVG, ZONE_CONFIG } from '../../../../utils/courtZones';

// 리그 평균 대비 성공률 델타를 빨강→노랑→초록 3단 스펙트럼(신호등 톤)으로 표시 — "샷차트
// 컬러 랩" 아티팩트에서 사용자가 직접 고른 값(courtZones.ts의 공용 getZoneStyle/
// getZonePillColors는 항상 단색 초록이라 이 파일에서만 로컬로 재정의 — 다른 3개 렌더 지점
// (원본 TeamZoneChart)에는 영향 없음). 델타<0이면 MIN~MID, 델타>=0이면 MID~MAX 구간에서
// 선형 보간(델타 0 = 리그평균 지점이 정확히 MID 색으로 고정됨).
const ZONE_MIN_COLOR = '#ff0000';
const ZONE_MID_COLOR = '#fff000'; // 델타 0(리그평균)
const ZONE_MAX_COLOR = '#37ff00';
const TIER_RANGE = 0.10; // ±10%p를 풀스케일로 클램프

const hexToRgb = (hex: string): [number, number, number] => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lerpChannel = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const spectrumColor = (delta: number): string => {
    const clamped = Math.max(-TIER_RANGE, Math.min(TIER_RANGE, delta));
    const [fromHex, toHex, t] = clamped < 0
        ? [ZONE_MIN_COLOR, ZONE_MID_COLOR, (clamped + TIER_RANGE) / TIER_RANGE]
        : [ZONE_MID_COLOR, ZONE_MAX_COLOR, clamped / TIER_RANGE];
    const [r1, g1, b1] = hexToRgb(fromHex);
    const [r2, g2, b2] = hexToRgb(toHex);
    return `rgb(${lerpChannel(r1, r2, t)}, ${lerpChannel(g1, g2, t)}, ${lerpChannel(b1, b2, t)})`;
};

const getZoneTierStyle = (makes: number, attempts: number, avg: number) => {
    if (attempts === 0) return { fill: '#334155', delta: 0 };
    const pct = makes / attempts;
    const delta = pct - avg;
    return { fill: spectrumColor(delta), delta };
};
// 라벨(pill) 배경은 tier 색과 무관하게 항상 흰색 40% 반투명 고정 — 델타는 퍼센트 텍스트가
// 아니라 존 배경(getZoneTierStyle)에서만 표현. 텍스트는 검정, 테두리는 흰색.
const PILL_BG = 'rgba(255,255,255,0.4)';
const getZoneTierPillColors = (_delta: number, _hasAttempts: boolean) => {
    return { pillFill: PILL_BG, textFill: '#000000', borderStroke: '#ffffff' };
};

interface TeamZoneChartInsightProps {
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

// 존 라벨 축약 영문 표기 — ZONE_CONFIG.label(한글 풀네임, TeamZoneStatsTable 등 다른 곳에서
// 공유)은 그대로 두고 이 파일의 pill 표시용으로만 로컬 매핑.
const ZONE_LABEL_EN: Record<ZoneKey, string> = {
    paint: 'PAINT',
    rim: 'RA',
    midL: 'MID_L',
    midC: 'MID_C',
    midR: 'MID_R',
    c3L: 'CNR_L',
    c3R: 'CNR_R',
    atb3L: '45_L',
    atb3C: 'ATB',
    atb3R: '45_R',
};

// 존 라벨 위치 미세조정(px, ZONE_CONFIG 기본 cx/cy 대비 오프셋) — "샷차트 컬러 랩"의
// 라벨 위치 편집 기능(클릭 후 방향키 이동)에서 사용자가 직접 조정한 값 그대로 적용.
const ZONE_LABEL_OFFSETS: Record<ZoneKey, { dx: number; dy: number }> = {
    paint: { dx: 0, dy: 8 },
    rim: { dx: 0, dy: 6 },
    midL: { dx: 10, dy: 0 },
    midC: { dx: 0, dy: -6 },
    midR: { dx: -10, dy: 0 },
    c3L: { dx: 7, dy: 0 },
    c3R: { dx: -6, dy: 0 },
    atb3L: { dx: 2, dy: 0 },
    atb3C: { dx: 0, dy: 0 },
    atb3R: { dx: -2, dy: 0 },
};

/** TeamZoneChart.tsx의 인사이트 탭 전용 복사본 — 디자인 개편 작업 중에만 사용. 다른
 *  3개 렌더 지점(TacticsDataPanel/TacticsSlidersPanel의 offenseDefenseSplit 분기)은
 *  원본 TeamZoneChart를 그대로 사용하며, 이 파일에서 확정된 디자인을 나중에 원본에도
 *  반영할 예정(현재는 원본과 100% 동일한 내용). */
export const TeamZoneChartInsight: React.FC<TeamZoneChartInsightProps> = ({ roster, zoneOverride }) => {
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

    const totalAttempts = useMemo(() => zones.reduce((sum, z) => sum + z.data.a, 0), [zones]);

    return (
        <div className="h-full">
            <div className="relative w-full h-full bg-slate-950 overflow-hidden" style={{ border: '1px solid #334155' }}>
            {/* SVG를 absolute로 분리 — in-flow 상태로 두면 viewBox 종횡비 기준으로 "선호 높이"를
                계산해 부모(flex-1) 박스에 역으로 반영되면서, 넓은 화면일수록 우측 테이블보다
                더 커지는 문제가 있었음(좁은 화면에선 우연히 테이블이 더 커서 안 드러났을 뿐).
                absolute+inset-0으로 정상 흐름에서 빼면 부모 높이 계산에 전혀 관여하지 않고,
                부모가 이미 확정한 크기(테이블과 동일하게 stretch된 높이)를 그대로 채운다. */}
            <svg viewBox="0 0 435 403" preserveAspectRatio="xMinYMid meet" className="absolute inset-0 w-full h-full">
                <rect x="0" y="0" width="435" height="403" fill="#020617" />

                {/* 라벨 배경 블러(글래스모피즘)용 — CSS backdrop-filter는 SVG rect에서 실제로
                    렌더링되지 않아(브라우저가 속성은 accept하지만 시각적으로 무시함, 확인됨)
                    feGaussianBlur 필터를 존 색상 레이어의 복사본에 적용하고 각 pill 영역만큼만
                    clipPath로 잘라 pill 뒤에 겹쳐 그리는 방식으로 동일한 효과를 구현. */}
                <defs>
                    <filter id="pillBlur" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="4" />
                    </filter>
                </defs>

                {/* Zone Heatmap — 존 간 구분선 없이 배경색만 완전 불투명으로 채움. */}
                <g id="zoneFillLayer">
                    {colorScaleOn && zones.map((z, i) => {
                        const fill = getZoneTierStyle(z.data.m, z.data.a, z.avg).fill;
                        return (
                            <path key={i} d={z.path} fill={fill} fillOpacity={1} />
                        );
                    })}
                </g>

                {/* Court Lines — 검정, 두께 0(사실상 미표시) — "샷차트 컬러 랩"에서 사용자가
                    선택한 값 그대로 적용. */}
                <g fill="#000000" stroke="#000000" strokeWidth={0} fillRule="evenodd" pointerEvents="none">
                    {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                </g>

                {/* Pill 배경 블러 윈도우 — 절대좌표(비변환) 상태에서 각 pill 위치만큼만 clipPath로
                    잘라 zoneFillLayer의 블러 버전을 겹쳐 그림. 라벨 rect/text를 감싸는 translate
                    그룹 밖에 둬야 좌표가 이중으로 밀리지 않음. */}
                <g pointerEvents="none">
                    {zones.map((z, i) => {
                        const width = 68;
                        const height = (z.data.a > 0) ? 56 : 40;
                        const offset = ZONE_LABEL_OFFSETS[z.key as ZoneKey];
                        const cx = z.cx + offset.dx;
                        const cy = z.cy + offset.dy;
                        return (
                            <React.Fragment key={i}>
                                <clipPath id={`pillClip-${z.key}`}>
                                    <rect x={cx - width / 2} y={cy - height / 2} width={width} height={height} />
                                </clipPath>
                                <use href="#zoneFillLayer" filter="url(#pillBlur)" clipPath={`url(#pillClip-${z.key})`} />
                            </React.Fragment>
                        );
                    })}
                </g>

                {/* Zone Labels */}
                <g pointerEvents="none">
                    {zones.map((z, i) => {
                        const hasData = z.data.a > 0;
                        const width = 68;
                        const height = hasData ? 56 : 40;

                        if (mode === 'efficiency') {
                            const pct = hasData ? (z.data.m / z.data.a * 100).toFixed(0) : '0';
                            const style = getZoneTierStyle(z.data.m, z.data.a, z.avg);
                            const colors = getZoneTierPillColors(style.delta, hasData);
                            return (
                                <g key={i} transform={`translate(${z.cx + ZONE_LABEL_OFFSETS[z.key as ZoneKey].dx}, ${z.cy + ZONE_LABEL_OFFSETS[z.key as ZoneKey].dy})`}>
                                    <rect x={-width / 2} y={-height / 2} width={width} height={height}
                                        fill={colors.pillFill} stroke={colors.borderStroke} strokeWidth={1} />
                                    <text textAnchor="middle" y={hasData ? -14 : -7} fill={colors.textFill} fontSize="14px" fontWeight="700" dominantBaseline="middle">
                                        {ZONE_LABEL_EN[z.key as ZoneKey]}
                                    </text>
                                    <text textAnchor="middle" y={hasData ? 1 : 8} fill={colors.textFill} fontSize="14px" fontWeight="700" dominantBaseline="middle">
                                        {pct}%
                                    </text>
                                    {hasData && (
                                        <text textAnchor="middle" y={16} fill={colors.textFill} fontSize="14px" fontWeight="700" dominantBaseline="middle">
                                            {z.data.m}/{z.data.a}
                                        </text>
                                    )}
                                </g>
                            );
                        }

                        const volPct = totalAttempts > 0 ? (z.data.a / totalAttempts * 100).toFixed(0) : '0';
                        const colors = getZoneTierPillColors(0, hasData);
                        return (
                            <g key={i} transform={`translate(${z.cx + ZONE_LABEL_OFFSETS[z.key as ZoneKey].dx}, ${z.cy + ZONE_LABEL_OFFSETS[z.key as ZoneKey].dy})`}>
                                <rect x={-width / 2} y={-height / 2} width={width} height={height}
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
            {/* FG% vs 리그 평균 범례 — 세로 그라데이션 바. 차트 박스가 코트 종횡비보다 넓어서
                생기는 좌우 레터박스 여백에 배치(우측 상단 고정 오버레이). 코트는 preserveAspectRatio
                xMinYMid로 왼쪽 정렬해 그 여백을 우측으로 몰아주고, 범례는 위아래 2개 라벨 대신
                +10%~-10% 5단 눈금을 바 좌측에 표시 + 하단에 "Lg Avg" 캡션. 눈금 컬럼과 바+캡션
                컬럼을 각각 "flex-1 콘텐츠 + 캡션 높이만큼의 자리" 구조로 동일하게 맞춰서(왼쪽엔
                투명 스페이서로 "Lg Avg"와 같은 높이를 확보) 눈금이 바의 실제 그라데이션 영역과
                정확히 정렬되고, "Lg Avg"도 바로 그 아래(전체 폭이 아니라 바 폭 기준)에 오도록 함. */}
            <div className="absolute top-3 right-3 bottom-3 w-24 flex items-stretch gap-1.5 pointer-events-none">
                <div className="flex flex-col">
                    <div className="flex-1 flex flex-col justify-between text-right text-sm font-bold text-white/90 tabular-nums">
                        <span>+10%</span>
                        <span>+5%</span>
                        <span>0%</span>
                        <span>-5%</span>
                        <span>-10%</span>
                    </div>
                    <span className="text-sm font-bold text-right invisible" aria-hidden="true">Lg Avg</span>
                </div>
                <div className="flex flex-col items-center">
                    <div
                        className="flex-1"
                        style={{ width: '30px', background: `linear-gradient(to top, ${ZONE_MIN_COLOR}, ${ZONE_MID_COLOR}, ${ZONE_MAX_COLOR})` }}
                    />
                    <span className="text-sm font-bold text-white/70 whitespace-nowrap">Lg Avg</span>
                </div>
            </div>
            </div>
        </div>
    );
};
