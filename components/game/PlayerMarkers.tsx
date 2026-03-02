
import React from 'react';
import { CourtSnapshot } from '../../services/game/engine/pbp/pbpTypes';
import { GameSpeed } from '../../hooks/useLiveGame';

interface PlayerMarkersProps {
    courtSnapshot: CourtSnapshot | null;
    homeTeamId: string;
    homeColor: string;
    awayColor: string;
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
    scale,
    speed,
}) => {
    if (!courtSnapshot) return null;

    const transMs = TRANSITION_MS[speed] || 400;
    const isOffenseHome = courtSnapshot.offTeamId === homeTeamId;

    return (
        <g className="player-markers">
            {courtSnapshot.positions.map(pos => {
                const isHome = pos.isHome;
                const isOffense = (isHome && isOffenseHome) || (!isHome && !isOffenseHome);
                const color = isHome ? homeColor : awayColor;

                const cx = pos.x * scale;
                const cy = pos.y * scale;

                return (
                    <g
                        key={pos.playerId}
                        style={{
                            transform: `translate(${cx}px, ${cy}px)`,
                            transition: `transform ${transMs}ms ease-out`,
                        }}
                    >
                        {/* Ball indicator ring */}
                        {pos.hasBall && (
                            <circle r={22} fill="none" stroke="#fbbf24" strokeWidth={3} opacity={0.9} />
                        )}
                        {/* Player circle */}
                        <circle
                            r={18}
                            fill={color}
                            opacity={isOffense ? 0.9 : 0.5}
                            stroke={isOffense ? '#fff' : '#64748b'}
                            strokeWidth={isOffense ? 2 : 1}
                        />
                        {/* Position label */}
                        <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="white"
                            fontSize={11}
                            fontWeight="bold"
                            fontFamily="monospace"
                            style={{ pointerEvents: 'none' }}
                        >
                            {pos.position}
                        </text>
                    </g>
                );
            })}
        </g>
    );
};
