
import React from 'react';
import { getPlayerStarRating } from '../../utils/ovrUtils';

interface StarRatingProps {
    ovr: number;
    size?: 'sm' | 'md' | 'lg';
    showValue?: boolean;
    className?: string;
}

/** OVR 기반 별점 그라디언트 — [상단 하이라이트, 메인, 하단 섀도] */
const getStarGradient = (stars: number, ovr: number): [string, string, string] => {
    if (stars >= 5.0 && ovr >= 97) return ['#a5f3fc', '#22d3ee', '#0891b2']; // cyan
    if (stars >= 5.0) return ['#fdba74', '#f97316', '#c2410c'];              // orange
    if (stars >= 4.5) return ['#fed7aa', '#fb923c', '#ea580c'];              // orange light
    if (stars >= 4.0) return ['#fde68a', '#fbbf24', '#d97706'];              // amber
    if (stars >= 3.5) return ['#fef08a', '#facc15', '#ca8a04'];              // yellow
    if (stars >= 3.0) return ['#d9f99d', '#a3e635', '#65a30d'];              // lime
    if (stars >= 2.5) return ['#bbf7d0', '#4ade80', '#16a34a'];              // green
    if (stars >= 2.0) return ['#a7f3d0', '#34d399', '#059669'];              // emerald
    if (stars >= 1.5) return ['#cbd5e1', '#94a3b8', '#64748b'];              // slate
    return ['#94a3b8', '#64748b', '#475569'];                                // slate dark
};

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z';

const sizeMap = { sm: 12, md: 16, lg: 20 };

export const StarRating: React.FC<StarRatingProps> = ({ ovr, size = 'md', showValue = false, className = '' }) => {
    const stars = getPlayerStarRating(ovr);
    const [hi, mid, lo] = getStarGradient(stars, ovr);
    const px = sizeMap[size];
    const fullCount = Math.floor(stars);
    const hasHalf = stars % 1 !== 0;
    const emptyCount = 5 - fullCount - (hasHalf ? 1 : 0);
    const uid = React.useId();
    const gradId = `sg-${uid}`;
    const clipId = `sc-${uid}`;

    const gradDef = (
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hi} />
            <stop offset="50%" stopColor={mid} />
            <stop offset="100%" stopColor={lo} />
        </linearGradient>
    );

    return (
        <div className={`flex items-center gap-0.5 ${className}`}>
            {/* Full stars */}
            {Array.from({ length: fullCount }).map((_, i) => (
                <svg key={`f${i}`} width={px} height={px} viewBox="0 0 24 24">
                    <defs>{gradDef}</defs>
                    <path d={STAR_PATH} fill={`url(#${gradId})`} stroke={lo} strokeWidth="0.5" />
                </svg>
            ))}

            {/* Half star */}
            {hasHalf && (
                <svg width={px} height={px} viewBox="0 0 24 24">
                    <defs>
                        {gradDef}
                        <clipPath id={clipId}>
                            <rect x="0" y="0" width="12" height="24" />
                        </clipPath>
                    </defs>
                    <path d={STAR_PATH} fill="none" stroke="#334155" strokeWidth="1.5" />
                    <path d={STAR_PATH} fill={`url(#${gradId})`} stroke={lo} strokeWidth="0.5" clipPath={`url(#${clipId})`} />
                </svg>
            )}

            {/* Empty stars */}
            {Array.from({ length: emptyCount }).map((_, i) => (
                <svg key={`e${i}`} width={px} height={px} viewBox="0 0 24 24">
                    <path d={STAR_PATH} fill="none" stroke="#334155" strokeWidth="1.5" />
                </svg>
            ))}

            {showValue && (
                <span className="ml-1 font-mono font-bold tabular-nums text-slate-400" style={{ fontSize: px * 0.7 }}>
                    {stars.toFixed(1)}
                </span>
            )}
        </div>
    );
};
