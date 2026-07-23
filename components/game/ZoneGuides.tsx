
import React from 'react';
import { COURT_WIDTH, COURT_HEIGHT, PAINT_LENGTH } from '../../utils/courtCoordinates';
import { ZONE_PATHS, ZONE_CONFIG } from '../../utils/courtZones';

// ─────────────────────────────────────────────────────────────
// Dev-tool overlay for CourtPointPicker — reuses the EXACT SAME 10-zone SVG paths used by the
// real shot chart in PlayerDetailView.tsx (utils/courtZones.ts's ZONE_PATHS/ZONE_CONFIG), not a
// separately invented boundary. That chart is drawn on its own 435x403 canvas, basket-at-bottom
// ("top of key" near canvas y=0, rim near canvas y=403) — this remaps those same paths onto our
// engine's basket-at-LEFT, court-feet×SCALE(=10) coordinate space via a single affine transform,
// calibrated from two facts baked into that canvas itself:
//   - canvas y=401.6 (bottom edge, ≈baseline) → real x=0 ; canvas y=237.9 (paint's far edge,
//     shared by the PAINT/RIM/MID_* path coordinates) → real x=PAINT_LENGTH(19ft)
//   - canvas x=0/435 (left/right edges) → real y=COURT_HEIGHT/0 ; canvas x=217.5 (center) → real
//     y=COURT_HEIGHT/2 (=HOOP_Y_CENTER)
// No new zone geometry is introduced here — same shapes, just reoriented. Paths are transformed
// via the SVG matrix (fine for filled shapes regardless of the implied rotation/reflection), but
// labels are transformed manually in JS first so the text itself stays upright and readable.
// ─────────────────────────────────────────────────────────────

const SCALE = 10;
const CANVAS_W = 435;
const CANVAS_BASELINE_Y = 401.6;
const CANVAS_PAINT_FAR_Y = 237.9;

const xScale = PAINT_LENGTH / (CANVAS_BASELINE_Y - CANVAS_PAINT_FAR_Y); // canvas-y units → real ft
const yScale = COURT_HEIGHT / CANVAS_W; // canvas-x units → real ft

// matrix(a,b,c,d,e,f): svgX = c*canvasY + e ; svgY = b*canvasX + f
const MATRIX_C = -xScale * SCALE;
const MATRIX_E = xScale * SCALE * CANVAS_BASELINE_Y;
const MATRIX_B = -yScale * SCALE;
const MATRIX_F = COURT_HEIGHT * SCALE;
const LEFT_BASKET_MATRIX = `matrix(0, ${MATRIX_B.toFixed(5)}, ${MATRIX_C.toFixed(5)}, 0, ${MATRIX_E.toFixed(3)}, ${MATRIX_F})`;

function toLeftBasketSvg(canvasX: number, canvasY: number) {
    return { x: MATRIX_C * canvasY + MATRIX_E, y: MATRIX_B * canvasX + MATRIX_F };
}

const ZONE_STROKE = '#22d3ee';

function ZoneLabels({ mirrored }: { mirrored: boolean }) {
    return (
        <>
            {ZONE_CONFIG.map(z => {
                const p = toLeftBasketSvg(z.cx, z.cy);
                const x = mirrored ? COURT_WIDTH * SCALE - p.x : p.x;
                return (
                    <text
                        key={`${z.key}-label${mirrored ? '-r' : ''}`}
                        x={x} y={p.y}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize={12} fontWeight="bold" fill={ZONE_STROKE} opacity={0.85}
                        style={{ pointerEvents: 'none' }}
                    >
                        {z.label}
                    </text>
                );
            })}
        </>
    );
}

/** PlayerDetailView.tsx의 실제 샷차트 존 10개(ZONE_PATHS/ZONE_CONFIG)를 그대로 재사용 —
 *  왼쪽 골대 기준으로 한 번 그리고, 오른쪽 골대는 좌우 미러링해서 재사용. */
export const ZoneGuides: React.FC = () => (
    <g style={{ pointerEvents: 'none' }}>
        <g transform={LEFT_BASKET_MATRIX}>
            {ZONE_CONFIG.map(z => (
                <path
                    key={z.key}
                    d={ZONE_PATHS[z.pathKey]}
                    fill={ZONE_STROKE} fillOpacity={0.06}
                    stroke={ZONE_STROKE} strokeWidth={1.2} strokeOpacity={0.7}
                    vectorEffect="non-scaling-stroke"
                />
            ))}
        </g>
        <g transform={`translate(${COURT_WIDTH * SCALE}, 0) scale(-1, 1)`}>
            <g transform={LEFT_BASKET_MATRIX}>
                {ZONE_CONFIG.map(z => (
                    <path
                        key={`${z.key}-r`}
                        d={ZONE_PATHS[z.pathKey]}
                        fill={ZONE_STROKE} fillOpacity={0.06}
                        stroke={ZONE_STROKE} strokeWidth={1.2} strokeOpacity={0.7}
                        vectorEffect="non-scaling-stroke"
                    />
                ))}
            </g>
        </g>
        <ZoneLabels mirrored={false} />
        <ZoneLabels mirrored />
    </g>
);
