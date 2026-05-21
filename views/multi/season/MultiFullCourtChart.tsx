
import React, { useState, useEffect, useRef } from 'react';
import type { ShotEvent } from '../../../types';
import { useShotChartTooltip } from '../../../hooks/useShotChartTooltip';
import { ShotTooltip } from '../../../components/game/ShotTooltip';

interface MultiFullCourtChartProps {
    homeTeamId: string;
    homeColor:  string;
    homeAbbr:   string;
    awayTeamId: string;
    awayColor:  string;
    awayAbbr:   string;
    shotEvents: ShotEvent[];
}

const BasketLines = () => (
    <g fill="none" stroke="#4a3728" strokeWidth="2" strokeMiterlimit="10">
        <path d="M0,30h140s150,55,150,220-150,220,-150,220H0" />
        <polyline points="0,170 190,170 190,330 0,330" />
        <line x1="190" y1="310" y2="310" />
        <line y1="190" x2="190" y2="190" />
        <path d="M190,190c33.14,0,60,26.86,60,60s-26.86,60-60,60" />
        <path d="M190,310c-1.6,0-3.18-.06-4.75-.19" />
        <path d="M177.77,308.75c-27.27-5.65-47.77-29.81-47.77-58.75s22.39-55.27,51.49-59.4" strokeDasharray="9.58 7.56" />
        <path d="M185.25,190.19c1.57-.12,3.15-.19,4.75-.19" />
        <line x1="280" y1="480" x2="280" y2="500" />
        <line x1="280" x2="280" y2="20" />
        <path d="M40,290h12.5c22.09,0,40-17.91,40-40s-17.91-40-40-40h-12.5" />
        <line x1="145" y1="310" x2="145" y2="318" />
        <line x1="115" y1="310" x2="115" y2="318" />
        <line x1="85"  y1="310" x2="85"  y2="318" />
        <line x1="70"  y1="310" x2="70"  y2="318" />
        <line x1="145" y1="182" x2="145" y2="190" />
        <line x1="115" y1="182" x2="115" y2="190" />
        <line x1="85"  y1="182" x2="85"  y2="190" />
        <line x1="70"  y1="182" x2="70"  y2="190" />
        <line x1="40"  y1="222" x2="40"  y2="278" stroke="#333" strokeWidth="2" />
        <circle cx="48" cy="250" r="7.5" stroke="#e65100" />
    </g>
);

export const MultiFullCourtChart: React.FC<MultiFullCourtChartProps> = ({
    homeTeamId, homeColor, homeAbbr,
    awayTeamId, awayColor, awayAbbr,
    shotEvents,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ w: 940, h: 500 });

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const { tooltip, highlightShotIds, svgRef, handleMouseMove, handleMouseLeave } =
        useShotChartTooltip(shotEvents, 10);

    const makes  = shotEvents.filter(s => s.isMake).length;
    const misses = shotEvents.length - makes;

    return (
        <div className="w-full">
            {/* Legend */}
            <div className="flex items-center gap-4 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: awayColor }} />
                    <span className="text-xs font-bold text-slate-300">{awayAbbr} 원정</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: homeColor }} />
                    <span className="text-xs font-bold text-slate-300">{homeAbbr} 홈</span>
                </div>
                <div className="flex-1" />
                <span className="text-[10px] text-slate-500 font-mono">● {makes} / ✕ {misses}</span>
            </div>

            {/* Court — aspect ratio 940:500, fills width */}
            <div
                ref={containerRef}
                className="relative w-full"
                style={{ aspectRatio: '940/500' }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                <svg ref={svgRef} viewBox="0 0 940 500" className="w-full h-full">
                    {/* Background */}
                    <rect width="940" height="500" fill="rgb(221,200,173)" />

                    {/* Paint backgrounds */}
                    <rect y="170" width="190" height="160" fill="rgb(195,172,145)" />
                    <rect x="750" y="170" width="190" height="160" fill="rgb(195,172,145)" />

                    {/* Left basket */}
                    <BasketLines />

                    {/* Right basket (X-mirror) */}
                    <g transform="translate(940,0) scale(-1,1)">
                        <BasketLines />
                    </g>

                    {/* Center court */}
                    <g fill="none" stroke="#4a3728" strokeWidth="2">
                        <line x1="470" y1="0" x2="470" y2="500" />
                        <circle cx="470" cy="250" r="60" />
                        <circle cx="470" cy="250" r="20" />
                    </g>

                    {/* Shots — raw coords (no normalization), ×10 to SVG units */}
                    {shotEvents.map((shot, i) => {
                        const isHl  = highlightShotIds.has(shot.id);
                        const color = shot.teamId === homeTeamId ? homeColor : awayColor;
                        const cx    = shot.x * 10;
                        const cy    = shot.y * 10;
                        return (
                            <g key={`${shot.id}-${i}`}>
                                {shot.isMake ? (
                                    <circle
                                        cx={cx} cy={cy}
                                        r={isHl ? 8.5 : 6.5}
                                        fill={color}
                                        stroke={isHl ? '#fff' : 'white'}
                                        strokeWidth={isHl ? 2 : 1}
                                        opacity={isHl ? 1 : 0.9}
                                        className="transition-all duration-150"
                                    />
                                ) : (
                                    <g
                                        transform={`translate(${cx},${cy})`}
                                        opacity={isHl ? 1 : 0.5}
                                        className="transition-all duration-150"
                                    >
                                        <line x1="-5" y1="-5" x2="5" y2="5"
                                            stroke={isHl ? '#fff' : color}
                                            strokeWidth={isHl ? 3 : 2.5} />
                                        <line x1="-5" y1="5" x2="5" y2="-5"
                                            stroke={isHl ? '#fff' : color}
                                            strokeWidth={isHl ? 3 : 2.5} />
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {tooltip && (
                    <ShotTooltip
                        tooltip={tooltip}
                        containerWidth={containerSize.w}
                        containerHeight={containerSize.h}
                    />
                )}
            </div>
        </div>
    );
};
