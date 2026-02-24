
import React, { useMemo } from 'react';
import { Player } from '../../../../types';

interface RadarChartProps {
    roster: Player[];
    hideTitle?: boolean;
}

const AXES = [
    { key: 'out', label: '아웃사이드', color: '#10b981' },
    { key: 'plm', label: '플레이메이킹', color: '#3b82f6' },
    { key: 'ath', label: '운동능력', color: '#f97316' },
    { key: 'def', label: '수비', color: '#6366f1' },
    { key: 'reb', label: '리바운드', color: '#d946ef' },
    { key: 'ins', label: '인사이드', color: '#ef4444' },
];

const CX = 140;
const CY = 130;
const R = 100;
const LEVELS = [20, 40, 60, 80, 100];

const polarToXY = (angle: number, value: number, max: number = 100) => {
    const r = (value / max) * R;
    return {
        x: CX + r * Math.cos(angle - Math.PI / 2),
        y: CY + r * Math.sin(angle - Math.PI / 2),
    };
};

export const RadarChart: React.FC<RadarChartProps> = ({ roster, hideTitle }) => {
    const teamAvg = useMemo(() => {
        if (roster.length === 0) return AXES.map(() => 0);
        return AXES.map(axis => {
            const sum = roster.reduce((acc, p) => acc + ((p as any)[axis.key] || 0), 0);
            return Math.round(sum / roster.length);
        });
    }, [roster]);

    const angleStep = (2 * Math.PI) / AXES.length;

    const polygonPoints = teamAvg
        .map((val, i) => {
            const { x, y } = polarToXY(i * angleStep, val);
            return `${x},${y}`;
        })
        .join(' ');

    return (
        <div className="flex flex-col gap-2">
            {!hideTitle && <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">로스터 레이더</h5>}
            <svg viewBox="0 0 280 270" className="w-full">
                {/* Grid Levels */}
                {LEVELS.map(level => {
                    const pts = AXES.map((_, i) => {
                        const { x, y } = polarToXY(i * angleStep, level);
                        return `${x},${y}`;
                    }).join(' ');
                    return (
                        <polygon
                            key={level}
                            points={pts}
                            fill="none"
                            stroke="#1e293b"
                            strokeWidth={level === 60 ? 1.5 : 0.8}
                            strokeDasharray={level === 60 ? "4 2" : undefined}
                        />
                    );
                })}

                {/* Axis Lines */}
                {AXES.map((_, i) => {
                    const { x, y } = polarToXY(i * angleStep, 100);
                    return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#1e293b" strokeWidth={0.8} />;
                })}

                {/* Data Polygon */}
                <polygon
                    points={polygonPoints}
                    fill="#6366f1"
                    fillOpacity={0.2}
                    stroke="#818cf8"
                    strokeWidth={2}
                />

                {/* Data Points */}
                {teamAvg.map((val, i) => {
                    const { x, y } = polarToXY(i * angleStep, val);
                    return <circle key={i} cx={x} cy={y} r={3.5} fill={AXES[i].color} stroke="#020617" strokeWidth={1.5} />;
                })}

                {/* Labels */}
                {AXES.map((axis, i) => {
                    const { x, y } = polarToXY(i * angleStep, 120);
                    return (
                        <g key={i}>
                            <text
                                x={x}
                                y={y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#94a3b8"
                                fontSize="11"
                                fontWeight="700"
                            >
                                {axis.label}
                            </text>
                            <text
                                x={x}
                                y={y + 13}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={AXES[i].color}
                                fontSize="13"
                                fontWeight="800"
                            >
                                {teamAvg[i]}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};
