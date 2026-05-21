import type { Player } from '../../types';
import type { Team } from '../../types/team';
import type { GMProfile, GMPersonalityType } from '../../types/gm';
import { calculatePlayerOvr } from '../../utils/constants';
import { stringToHash } from '../../utils/hiddenTendencies';
import { analyzeTeamSituation } from '../tradeEngine/teamAnalysis';

export interface DraftPickContext {
    pickNumber: number; // 1..60
    round: 1 | 2;
}

export interface CPUDraftDecision {
    player: Player;
    score: number;
    components: {
        talent: number;
        positionFit: number;
        archetypeFit: number;
        scarcity: number;
    };
    reason: 'BPA' | 'NEED' | 'FIT' | 'SCARCITY';
}

// Pick tier base weights — higher picks prioritize raw talent, later picks favor positional need
const DRAFT_PICK_TIER_WEIGHTS = {
    top3:    { talent: 0.80, positionFit: 0.07, archetypeFit: 0.05, scarcity: 0.08 },
    lottery: { talent: 0.55, positionFit: 0.20, archetypeFit: 0.15, scarcity: 0.10 },
    lateR1:  { talent: 0.35, positionFit: 0.30, archetypeFit: 0.25, scarcity: 0.10 },
    r2:      { talent: 0.45, positionFit: 0.20, archetypeFit: 0.15, scarcity: 0.20 },
} as const;

type TierWeights = { talent: number; positionFit: number; archetypeFit: number; scarcity: number };

// Personality modifiers — additive on top of tier weights, must sum to ~0 per personality
const DRAFT_PERSONALITY_MODIFIERS: Record<GMPersonalityType, TierWeights> = {
    balanced:       { talent:  0,     positionFit:  0,     archetypeFit:  0,     scarcity:  0    },
    starHunter:     { talent: +0.15,  positionFit: -0.08,  archetypeFit: -0.05,  scarcity: -0.02 },
    rebuilder:      { talent: +0.10,  positionFit: -0.05,  archetypeFit: -0.05,  scarcity:  0    },
    defenseFocused: { talent: -0.05,  positionFit: -0.05,  archetypeFit: +0.15,  scarcity: -0.05 },
    valueTrader:    { talent: -0.08,  positionFit: -0.05,  archetypeFit:  0,     scarcity: +0.13 },
    youthMovement:  { talent: +0.10,  positionFit: -0.05,  archetypeFit: -0.05,  scarcity:  0    },
    winNow:         { talent: -0.12,  positionFit: +0.18,  archetypeFit:  0,     scarcity: -0.06 },
};

function getTierWeights(pickNumber: number, round: 1 | 2): TierWeights {
    if (round === 2) return { ...DRAFT_PICK_TIER_WEIGHTS.r2 };
    if (pickNumber <= 3) return { ...DRAFT_PICK_TIER_WEIGHTS.top3 };
    if (pickNumber <= 14) return { ...DRAFT_PICK_TIER_WEIGHTS.lottery };
    return { ...DRAFT_PICK_TIER_WEIGHTS.lateR1 };
}

function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

function calcTalentValue(player: Player, personality: GMPersonalityType | undefined): number {
    const potNorm = clamp01((player.potential - 60) / (95 - 60));
    const ovrNorm = clamp01((calculatePlayerOvr(player) - 50) / (80 - 50));
    // youthMovement cares more about ceiling than current OVR
    const potWeight = personality === 'youthMovement' ? 0.85 : 0.70;
    return potNorm * potWeight + ovrNorm * (1 - potWeight);
}

function calcPositionalFit(
    player: Player,
    weakPositions: string[],
    strongPositions: string[],
): number {
    const positions = player.position.split('/').map(p => p.trim());
    if (positions.some(p => weakPositions.includes(p))) return 1.0;
    if (positions.some(p => strongPositions.includes(p))) return 0.2;
    return 0.6;
}

function calcArchetypeFit(
    player: Player,
    statNeeds: string[],
    personality: GMPersonalityType | undefined,
): number {
    let boost = 0;
    const defBoost = personality === 'defenseFocused' ? 0.7 : 0.4;
    if (statNeeds.includes('DEF') && player.def >= 70) boost += defBoost;
    if (statNeeds.includes('REB') && player.reb >= 70) boost += 0.4;
    if (statNeeds.includes('3PT') && player.out >= 70) boost += 0.4;
    return clamp01(0.5 + boost);
}

function calcScarcityValue(player: Player, availablePlayers: Player[]): number {
    const top5 = availablePlayers.slice(0, 5);
    const positions = player.position.split('/').map(p => p.trim());
    const sameInTop5 = top5.filter(p =>
        p.position.split('/').map(pos => pos.trim()).some(pos => positions.includes(pos))
    ).length;
    const rarityScore = clamp01(1 - sameInTop5 / 5);
    const topTierBonus =
        availablePlayers.length > 0 &&
        availablePlayers.filter(p => p.potential >= player.potential).length / availablePlayers.length <= 0.05
            ? 0.3
            : 0;
    return clamp01(0.5 + rarityScore * 0.5 + topTierBonus);
}

function determineReason(
    components: CPUDraftDecision['components'],
    weights: TierWeights,
): CPUDraftDecision['reason'] {
    const contributions = {
        talent:       components.talent      * weights.talent,
        positionFit:  components.positionFit * weights.positionFit,
        archetypeFit: components.archetypeFit * weights.archetypeFit,
        scarcity:     components.scarcity    * weights.scarcity,
    };
    const max = Math.max(...Object.values(contributions));
    if (contributions.talent      === max) return 'BPA';
    if (contributions.positionFit === max) return 'NEED';
    if (contributions.archetypeFit=== max) return 'FIT';
    return 'SCARCITY';
}

export function pickRookieForCPU(
    team: Team,
    availablePlayers: Player[],
    gmProfile: GMProfile | undefined,
    pickContext: DraftPickContext,
    tendencySeed: string,
): CPUDraftDecision {
    if (availablePlayers.length === 1) {
        const player = availablePlayers[0];
        return {
            player,
            score: 0.5,
            components: { talent: 0.5, positionFit: 0.6, archetypeFit: 0.5, scarcity: 1.0 },
            reason: 'SCARCITY',
        };
    }

    const personality = gmProfile?.personalityType;
    const sliders = gmProfile?.sliders;
    const situation = analyzeTeamSituation(team, gmProfile);

    // Build final weights: tier base + personality modifier, then normalize
    const tier = getTierWeights(pickContext.pickNumber, pickContext.round);
    const mod = DRAFT_PERSONALITY_MODIFIERS[personality ?? 'balanced'];
    const raw = {
        talent:       Math.max(0, tier.talent       + mod.talent),
        positionFit:  Math.max(0, tier.positionFit  + mod.positionFit),
        archetypeFit: Math.max(0, tier.archetypeFit + mod.archetypeFit),
        scarcity:     Math.max(0, tier.scarcity     + mod.scarcity),
    };
    const total = raw.talent + raw.positionFit + raw.archetypeFit + raw.scarcity;
    const weights: TierWeights = total > 0
        ? { talent: raw.talent/total, positionFit: raw.positionFit/total, archetypeFit: raw.archetypeFit/total, scarcity: raw.scarcity/total }
        : { talent: 0.25, positionFit: 0.25, archetypeFit: 0.25, scarcity: 0.25 };

    const riskFactor = sliders ? sliders.riskTolerance / 10 : 0.5;
    const noiseAmp = 0.04 * (0.5 + riskFactor);

    const scored = availablePlayers.map(player => {
        const components = {
            talent:       calcTalentValue(player, personality),
            positionFit:  calcPositionalFit(player, situation.weakPositions, situation.strongPositions),
            archetypeFit: calcArchetypeFit(player, situation.statNeeds, personality),
            scarcity:     calcScarcityValue(player, availablePlayers),
        };
        const base =
            components.talent       * weights.talent +
            components.positionFit  * weights.positionFit +
            components.archetypeFit * weights.archetypeFit +
            components.scarcity     * weights.scarcity;
        const hash = stringToHash(`${tendencySeed}:draft:${team.id}:${player.id}`);
        const rand = ((hash % 10000) / 10000) * 2 - 1;
        return { player, finalScore: base + rand * noiseAmp, components };
    });

    scored.sort((a, b) => b.finalScore - a.finalScore);
    const best = scored[0];

    return {
        player: best.player,
        score: best.finalScore,
        components: best.components,
        reason: determineReason(best.components, weights),
    };
}
