
import { GameState, ShotEvent, PossessionResult } from '../pbpTypes';
import { generateShotCoordinate, generateHeaveCoordinate, CourtSide } from '../../../../../utils/courtCoordinates';

/**
 * Generates and records a shot event for the shot chart visualization.
 */
export function recordShotEvent(state: GameState, result: PossessionResult) {
    const { type, zone, offTeam, actor, playType, assister,
            defender, shotType, isBlock, subZone, points } = result;

    if ((type === 'score' || type === 'miss') && zone) {
        const side: CourtSide = (offTeam.id === state.home.id) ? 'Right' : 'Left';
        const coords = result.isHeave ? generateHeaveCoordinate(result.heaveFt ?? 60, side) : generateShotCoordinate(zone, side);   // [2026-11-05] 버저 히브 좌표 (server 미러 참조)

        const shotEvent: ShotEvent = {
            id: `shot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            quarter: state.quarter,
            gameClock: state.gameClock,
            teamId: offTeam.id,
            playerId: actor.playerId,
            x: coords.x,
            y: coords.y,
            zone: zone,
            isMake: type === 'score',
            playType: playType,
            assistPlayerId: assister?.playerId,
            // Tooltip data
            playerName: actor.playerName,
            assistPlayerName: assister?.playerName,
            defenderName: defender?.playerName,
            shotType,
            points: points as 0 | 2 | 3,
            isBlock: isBlock ?? false,
            subZone,
            ...(result.isHeave ? { isHeave: true, distanceFt: result.heaveFt } : {}),
        };

        state.shotEvents.push(shotEvent);
    }
}
