
import { GameState, PossessionResult } from '../pbpTypes.ts';
import { generateShotCoordinate, type ShotZone, type CourtSide } from '../../../utils/courtCoordinates.ts';

export function recordShotEvent(state: GameState, result: PossessionResult) {
    const { type, zone, offTeam, actor, playType, assister, defender, shotType, isBlock, subZone, points } = result;

    if ((type === 'score' || type === 'miss') && zone) {
        const side: CourtSide = offTeam.id === state.home.id ? 'Right' : 'Left';
        const coords = generateShotCoordinate(zone as ShotZone, side);

        state.shotEvents.push({
            id: `shot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            quarter: state.quarter,
            gameClock: state.gameClock,
            teamId: offTeam.id,
            playerId: actor.playerId,
            x: coords.x,
            y: coords.y,
            zone,
            isMake: type === 'score',
            playType,
            assistPlayerId: assister?.playerId,
            playerName: actor.playerName,
            assistPlayerName: assister?.playerName,
            defenderName: defender?.playerName,
            shotType,
            points: points as 0 | 2 | 3,
            isBlock: isBlock ?? false,
            subZone,
        });
    }
}
