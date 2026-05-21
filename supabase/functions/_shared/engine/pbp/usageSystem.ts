
import { LivePlayer, TeamState } from './pbpTypes.ts';
import { PlayType } from '../../types.ts';
import { PLAY_TYPE_USAGE_WEIGHTS } from '../../game/config/usageWeights.ts';

// ==========================================================================================
//  USAGE PRIORITY SYSTEM (옵션 시스템)
// ==========================================================================================

function calculateScoringGravity(p: LivePlayer): number {
    const baseOffense = (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);

    const consistMod = 1.0 + ((p.tendencies?.consistency ?? 0.6) - 0.5) * 0.2;
    const mentality = (p.attr.offConsist * 0.4 * consistMod) + (p.attr.shotIq * 0.4) + (p.attr.pas * 0.2);

    const fatigueFactor = Math.max(0.5, p.currentCondition / 100);

    return (baseOffense * 0.6 + mentality * 0.4) * fatigueFactor;
}

export function getTeamOptionRanks(team: TeamState): Map<string, number> {
    const rankMap = new Map<string, number>();

    const sortedPlayers = [...team.onCourt].sort((a, b) => {
        return calculateScoringGravity(b) - calculateScoringGravity(a);
    });

    sortedPlayers.forEach((p, index) => {
        rankMap.set(p.playerId, index + 1);
    });

    return rankMap;
}

export function getTopPlayerGravity(team: TeamState): number {
    if (team.onCourt.length === 0) return 0;
    return Math.max(...team.onCourt.map(p => calculateScoringGravity(p)));
}

export function getContextualMultiplier(
    playerRank: number,
    playType: PlayType
): number {
    const safeRank = Math.max(1, Math.min(5, playerRank));
    const weights = PLAY_TYPE_USAGE_WEIGHTS[playType];

    if (!weights) return 1.0;

    return weights[safeRank - 1];
}
