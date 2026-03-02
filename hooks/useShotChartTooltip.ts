
import { useState, useCallback, useRef } from 'react';
import { ShotEvent } from '../types';
import { HOOP_X_LEFT, HOOP_Y_CENTER, COURT_WIDTH } from '../utils/courtCoordinates';

export interface TooltipState {
    primaryShot: ShotEvent;
    clusterShots: ShotEvent[];  // additional shots in radius (excluding primary)
    mouseX: number;             // px relative to container
    mouseY: number;
}

/**
 * Shot chart tooltip hook.
 * Tracks mouse on an SVG-wrapping container, finds nearest shot(s),
 * and returns tooltip data + event handlers.
 *
 * @param shots - array of ShotEvent (already transformed to display coords)
 * @param scale - coordinate multiplier (e.g. 10 for 940x500 viewBox)
 * @param clusterRadius - ft radius to collect nearby shots (default 1.5)
 */
export function useShotChartTooltip(
    shots: (ShotEvent & { x: number; y: number })[],
    scale: number,
    clusterRadius: number = 1.5
) {
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const [highlightShotIds, setHighlightShotIds] = useState<Set<string>>(new Set());
    const svgRef = useRef<SVGSVGElement | null>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const svg = svgRef.current;
        if (!svg || shots.length === 0) return;

        // Convert mouse position to SVG coordinate space
        const ctm = svg.getScreenCTM();
        if (!ctm) return;

        const svgX = (e.clientX - ctm.e) / ctm.a;
        const svgY = (e.clientY - ctm.f) / ctm.d;

        // Convert SVG coords to court feet
        const courtX = svgX / scale;
        const courtY = svgY / scale;

        // Find nearest shot
        let minDist = Infinity;
        let nearest: (typeof shots)[number] | null = null;

        for (const shot of shots) {
            const dx = shot.x - courtX;
            const dy = shot.y - courtY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                nearest = shot;
            }
        }

        // Threshold: must be within 2ft to show tooltip
        if (!nearest || minDist > 2) {
            if (tooltip !== null) {
                setTooltip(null);
                setHighlightShotIds(new Set());
            }
            return;
        }

        // Collect cluster (all shots within clusterRadius of nearest shot's position)
        const cluster: typeof shots = [];
        for (const shot of shots) {
            if (shot.id === nearest.id) continue;
            const dx = shot.x - nearest.x;
            const dy = shot.y - nearest.y;
            if (Math.sqrt(dx * dx + dy * dy) <= clusterRadius) {
                cluster.push(shot);
            }
        }

        // Mouse position relative to container
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const ids = new Set([nearest.id, ...cluster.map(s => s.id)]);
        setHighlightShotIds(ids);
        setTooltip({ primaryShot: nearest, clusterShots: cluster, mouseX, mouseY });
    }, [shots, scale, clusterRadius, tooltip]);

    const handleMouseLeave = useCallback(() => {
        setTooltip(null);
        setHighlightShotIds(new Set());
    }, []);

    return { tooltip, highlightShotIds, svgRef, handleMouseMove, handleMouseLeave };
}

/**
 * Calculate shot distance in feet from the nearest hoop.
 */
export function calcShotDistance(x: number, y: number): number {
    // Determine which hoop is closer
    const hoopRightX = COURT_WIDTH - HOOP_X_LEFT;
    const distLeft = Math.sqrt((x - HOOP_X_LEFT) ** 2 + (y - HOOP_Y_CENTER) ** 2);
    const distRight = Math.sqrt((x - hoopRightX) ** 2 + (y - HOOP_Y_CENTER) ** 2);
    return Math.round(Math.min(distLeft, distRight));
}
