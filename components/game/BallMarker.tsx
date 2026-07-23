
import React from 'react';

// ─────────────────────────────────────────────────────────────
// Ball renderer for a top-down 2D court. A pure overhead view has no natural "up" direction
// to show height with, so this uses the standard top-down-game convention: draw a ground
// shadow at the ball's true (x,y), and draw the ball itself shifted upward on screen by
// height * a px-per-foot factor, growing slightly as it climbs. The shadow marks "where it
// would land right now"; the offset ball marks "how high it currently is" — together they
// read as an arc during a shot/pass without needing an actual 3D projection.
// ─────────────────────────────────────────────────────────────

interface BallMarkerProps {
    x: number;      // ground position, feet
    y: number;      // ground position, feet
    height: number; // z, feet
    scale: number;  // px per foot (matches PlayerMarkers' scale)
}

const HEIGHT_PX_PER_FT_FACTOR = 0.6; // visual exaggeration so arcs read clearly at court scale

export const BallMarker: React.FC<BallMarkerProps> = ({ x, y, height, scale }) => {
    const cx = x * scale;
    const groundCy = y * scale;
    const heightPx = height * scale * HEIGHT_PX_PER_FT_FACTOR;
    const cy = groundCy - heightPx;
    const shadowOpacity = Math.max(0.12, 0.42 - height * 0.025);
    const radius = 5 + Math.min(4, height * 0.5);

    return (
        <g className="ball-marker" style={{ pointerEvents: 'none' }}>
            <ellipse cx={cx} cy={groundCy} rx={7} ry={3} fill="#000" opacity={shadowOpacity} />
            <circle cx={cx} cy={cy} r={radius} fill="#d2691e" stroke="#4a2c0a" strokeWidth={1.2} />
            <line x1={cx - radius * 0.5} y1={cy} x2={cx + radius * 0.5} y2={cy} stroke="#4a2c0a" strokeWidth={0.8} />
        </g>
    );
};
