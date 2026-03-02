
import React from 'react';
import { CourtSnapshot } from '../../services/game/engine/pbp/pbpTypes';

interface PlayerMarkersProps {
    courtSnapshot: CourtSnapshot | null;
    homeTeamId: string;
    homeColor: string;
    awayColor: string;
    scale: number;
}

export const PlayerMarkers: React.FC<PlayerMarkersProps> = ({
    courtSnapshot,
    homeTeamId,
    homeColor,
    awayColor,
    scale,
}) => {
    if (!courtSnapshot) return null;

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
                        transform={`translate(${cx}, ${cy})`}
                    >
                        {/* Ball indicator ring */}
                        {pos.hasBall && (
                            <circle r={22} fill="none" stroke="#fbbf24" strokeWidth={3} opacity={0.9} />
                        )}
                        {/* Player circle */}
                        <circle
                            r={18}
                            fill={color}
                            opacity={1}
                            stroke={isOffense ? '#fff' : '#64748b'}
                            strokeWidth={isOffense ? 2 : 1}
                        />
                        {/* Position label */}
                        <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="white"
                            fontSize={14}
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
