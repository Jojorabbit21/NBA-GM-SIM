
import React from 'react';
import { CourtSnapshot, LivePlayer } from '../../services/game/engine/pbp/pbpTypes';
import { GameSpeed } from '../../hooks/useLiveGame';

interface PlayerMarkersProps {
    courtSnapshot: CourtSnapshot | null;
    homeTeamId: string;
    homeColor: string;
    awayColor: string;
    homeOnCourt: LivePlayer[];
    awayOnCourt: LivePlayer[];
    scale: number;
    speed: GameSpeed;
}

const TRANSITION_MS: Record<GameSpeed, number> = {
    0.5: 500,
    1: 400,
    2: 250,
    4: 120,
};

export const PlayerMarkers: React.FC<PlayerMarkersProps> = ({
    courtSnapshot,
    homeTeamId,
    homeColor,
    awayColor,
    homeOnCourt,
    awayOnCourt,
    scale,
    speed,
}) => {
    if (!courtSnapshot) return null;

    const transMs = TRANSITION_MS[speed] || 400;

    // Build lookup maps
    const playerPosMap = new Map<string, string>(); // playerId → position string
    const playerTeamMap = new Map<string, boolean>(); // playerId → isHome
    for (const p of homeOnCourt) {
        playerPosMap.set(p.playerId, p.position);
        playerTeamMap.set(p.playerId, true);
    }
    for (const p of awayOnCourt) {
        playerPosMap.set(p.playerId, p.position);
        playerTeamMap.set(p.playerId, false);
    }

    const isOffenseHome = courtSnapshot.offTeamId === homeTeamId;

    return (
        <g className="player-markers">
            {courtSnapshot.positions.map(pos => {
                const isHome = playerTeamMap.get(pos.playerId) ?? false;
                const isOffense = (isHome && isOffenseHome) || (!isHome && !isOffenseHome);
                const color = isHome ? homeColor : awayColor;
                const posLabel = playerPosMap.get(pos.playerId) || '?';

                const cx = pos.x * scale;
                const cy = pos.y * scale;

                return (
                    <g
                        key={pos.playerId}
                        transform={`translate(${cx}, ${cy})`}
                        style={{ transition: `transform ${transMs}ms ease-out` }}
                    >
                        {/* Ball indicator ring */}
                        {pos.hasBall && (
                            <circle r={18} fill="none" stroke="#fbbf24" strokeWidth={3} opacity={0.9} />
                        )}
                        {/* Player circle */}
                        <circle
                            r={14}
                            fill={color}
                            opacity={isOffense ? 0.9 : 0.5}
                            stroke={isOffense ? '#fff' : '#64748b'}
                            strokeWidth={isOffense ? 1.5 : 1}
                        />
                        {/* Position label */}
                        <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="white"
                            fontSize={9}
                            fontWeight="bold"
                            fontFamily="monospace"
                            style={{ pointerEvents: 'none' }}
                        >
                            {posLabel}
                        </text>
                    </g>
                );
            })}
        </g>
    );
};
