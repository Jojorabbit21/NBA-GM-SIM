
import React, { useCallback, useRef } from 'react';
import { CourtBackground } from './CourtBackground';
import { PlayerMarkers } from './PlayerMarkers';
import { BallMarker } from './BallMarker';
import { ZoneGuides } from './ZoneGuides';
import type { CourtSnapshot } from '../../services/game/engine/pbp/pbpTypes';

// ─────────────────────────────────────────────────────────────
// Shared court renderer for the physics lab. Reuses PlayerMarkers UNMODIFIED — its markers
// are already keyed by playerId internally, so as long as WE don't remount PlayerMarkers
// itself (fixed `key`), React updates each <g transform=...> in place every render instead
// of destroying/recreating DOM nodes. That's what turns the existing "teleport on snapshot
// swap" behavior (LiveGameView deliberately remounts via an incrementing key) into smooth
// per-frame motion here: the lab calls setState ~60x/sec with interpolated positions, so
// each render is a small, visually continuous nudge rather than a single big jump.
// ─────────────────────────────────────────────────────────────

const SCALE = 10; // 940x500 viewBox = 94x50 ft court

interface PhysicsCourtViewProps {
    courtSnapshot: CourtSnapshot | null;
    homeTeamId: string;
    homeColor: string;
    awayColor: string;
    onCourtClick?: (point: { x: number; y: number }) => void;
    ball?: { x: number; y: number; height: number } | null;
    // Arbitrary annotation dots (court-feet coords) — used by dev tools like the point picker
    // that don't have a full CourtSnapshot to draw, just raw points to mark. onClick (if set)
    // makes that one marker interactive — stopPropagation keeps it from also firing onCourtClick.
    markers?: { x: number; y: number; label?: string; color?: string; onClick?: () => void; opacity?: number }[];
    // Rim/L-C-R divider guide overlay — dev-tool aid, see ZoneGuides.tsx for what's real engine
    // geometry vs a proposed split.
    showZoneGuides?: boolean;
    // Debug overlay: the ACTUAL sampled path each player's icon has moved along so far this
    // playback (keyed by playerId) — draw as a line to compare against final-position markers
    // and see whether motion tracks the intended target or wanders/jitters.
    trails?: Record<string, { x: number; y: number }[]>;
}

export const PhysicsCourtView: React.FC<PhysicsCourtViewProps> = ({
    courtSnapshot, homeTeamId, homeColor, awayColor, onCourtClick, ball, markers, showZoneGuides, trails,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);

    const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (!onCourtClick || !svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * 940;
        const py = ((e.clientY - rect.top) / rect.height) * 500;
        onCourtClick({ x: px / SCALE, y: py / SCALE });
    }, [onCourtClick]);

    return (
        <div className="w-full relative" style={{ aspectRatio: '940/500' }}>
            <svg
                ref={svgRef}
                viewBox="0 0 940 500"
                className={`w-full h-full ${onCourtClick ? 'cursor-crosshair' : ''}`}
                onClick={handleClick}
            >
                <CourtBackground />
                {showZoneGuides && <ZoneGuides />}
                {trails && Object.entries(trails).map(([playerId, points]) => (
                    points.length < 2 ? null : (
                        <polyline
                            key={playerId}
                            points={points.map(p => `${p.x * SCALE},${p.y * SCALE}`).join(' ')}
                            fill="none"
                            stroke="#f472b6"
                            strokeWidth={1.5}
                            strokeOpacity={0.55}
                            style={{ pointerEvents: 'none' }}
                        />
                    )
                ))}
                {/* Point markers render BELOW players/ball so a spawned player icon sits visibly
                    on top of the dot marking its shooting spot, not hidden under it. */}
                {markers?.map((m, i) => (
                    <g
                        key={i}
                        style={{ pointerEvents: m.onClick ? 'auto' : 'none', cursor: m.onClick ? 'pointer' : undefined }}
                        onClick={m.onClick ? (e) => { e.stopPropagation(); m.onClick!(); } : undefined}
                    >
                        <circle cx={m.x * SCALE} cy={m.y * SCALE} r={6} fill={m.color ?? '#22d3ee'} fillOpacity={m.opacity ?? 0.3} stroke="#0f172a" strokeOpacity={m.opacity ?? 0.3} strokeWidth={1.5} />
                        {m.label && (
                            <text x={m.x * SCALE} y={m.y * SCALE - 10} textAnchor="middle" fontSize={11} fontWeight="bold" fill={m.color ?? '#22d3ee'} style={{ pointerEvents: 'none' }}>
                                {m.label}
                            </text>
                        )}
                    </g>
                ))}
                <PlayerMarkers
                    key="physics-lab-markers"
                    courtSnapshot={courtSnapshot}
                    homeTeamId={homeTeamId}
                    homeColor={homeColor}
                    awayColor={awayColor}
                    scale={SCALE}
                />
                {ball && <BallMarker x={ball.x} y={ball.y} height={ball.height} scale={SCALE} />}
            </svg>
        </div>
    );
};
