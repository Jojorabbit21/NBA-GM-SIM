
import type { Player } from '../../types';
import type { PlayerStats } from '../../types/player';
import type {
    ArchetypeType,
    TraitTag,
    ArchetypeModuleScores,
    PlayerArchetypeState,
    ArchetypeDisplayInfo,
} from '../../types/archetype';

// ─────────────────────────────────────────────────────────────
// Step 1: 10+1 Module Score Calculation (player attrs → 0~100)
// ─────────────────────────────────────────────────────────────

export function calcModuleScores(player: Player): ArchetypeModuleScores {
    const p = player;

    const rimFinishing =
        p.layup      * 0.26 +
        p.dunk       * 0.18 +
        p.closeShot  * 0.12 +
        p.drawFoul   * 0.12 +
        p.hands      * 0.08 +
        p.spdBall    * 0.08 +
        p.vertical   * 0.08 +
        p.agility    * 0.08;

    const postCraft =
        p.postPlay   * 0.34 +
        p.closeShot  * 0.18 +
        p.strength   * 0.16 +
        p.drawFoul   * 0.10 +
        p.hands      * 0.10 +
        p.shotIq     * 0.06 +
        p.offConsist * 0.06;

    const spotUpShooting =
        p.threeCorner * 0.30 +
        p.three45     * 0.24 +
        p.threeTop    * 0.18 +
        p.ft          * 0.12 +
        p.shotIq      * 0.08 +
        p.offConsist  * 0.08;

    const shotCreation =
        p.midRange   * 0.26 +
        p.threeTop   * 0.16 +
        p.three45    * 0.10 +
        p.handling   * 0.18 +
        p.spdBall    * 0.12 +
        p.drawFoul   * 0.10 +
        p.shotIq     * 0.08;

    const playmaking =
        p.passVision      * 0.28 +
        p.passAcc         * 0.24 +
        p.passIq          * 0.18 +
        p.handling        * 0.14 +
        p.spdBall         * 0.10 +
        p.offBallMovement * 0.06;

    // offballAttack uses spotUpShooting module score
    const offballAttack =
        p.offBallMovement * 0.28 +
        spotUpShooting    * 0.20 +
        p.layup           * 0.12 +
        p.speed           * 0.10 +
        p.agility         * 0.10 +
        p.shotIq          * 0.10 +
        p.offConsist      * 0.10;

    const poaDefense =
        p.perDef     * 0.30 +
        p.steal      * 0.14 +
        p.agility    * 0.12 +
        p.speed      * 0.10 +
        p.passPerc   * 0.12 +
        p.helpDefIq  * 0.10 +
        p.defConsist * 0.12;

    const teamDefense =
        p.helpDefIq  * 0.20 +
        p.passPerc   * 0.18 +
        p.perDef     * 0.16 +
        p.intDef     * 0.14 +
        p.steal      * 0.08 +
        p.blk        * 0.08 +
        p.boxOut     * 0.08 +
        p.defConsist * 0.08;

    const rimProtection =
        p.intDef     * 0.34 +
        p.blk        * 0.24 +
        p.helpDefIq  * 0.12 +
        p.strength   * 0.10 +
        p.vertical   * 0.10 +
        p.defConsist * 0.10;

    const rebounding =
        p.offReb   * 0.24 +
        p.defReb   * 0.34 +
        p.boxOut   * 0.24 +
        p.strength * 0.10 +
        p.hustle   * 0.08;

    const motorAvailability =
        p.stamina    * 0.26 +
        p.hustle     * 0.24 +
        p.durability * 0.30 +
        p.offConsist * 0.10 +
        p.defConsist * 0.10;

    return {
        rimFinishing,
        postCraft,
        spotUpShooting,
        shotCreation,
        playmaking,
        offballAttack,
        poaDefense,
        teamDefense,
        rimProtection,
        rebounding,
        motorAvailability,
    };
}

// ─────────────────────────────────────────────────────────────
// Step 2: Position Gate
// ─────────────────────────────────────────────────────────────

const POSITION_ELIGIBLE: Record<string, ArchetypeType[]> = {
    'PG': [
        'primary_creator_guard', 'scoring_combo_guard', 'movement_shooter',
    ],
    'SG': [
        'primary_creator_guard', 'scoring_combo_guard', 'movement_shooter',
        'perimeter_3nd', 'two_way_wing', 'slashing_wing', 'shot_creator_wing',
    ],
    'SF': [
        'movement_shooter', 'perimeter_3nd', 'two_way_wing', 'slashing_wing',
        'shot_creator_wing', 'connector_forward', 'playmaking_big',
    ],
    'PF': [
        'perimeter_3nd', 'two_way_wing', 'connector_forward',
        'post_scoring_big', 'rim_runner_big', 'stretch_big',
        'rim_protector_anchor', 'playmaking_big',
    ],
    'C': [
        'post_scoring_big', 'rim_runner_big', 'stretch_big',
        'rim_protector_anchor', 'playmaking_big',
    ],
};

export function getEligibleArchetypes(position: string): ArchetypeType[] {
    return POSITION_ELIGIBLE[position] ?? POSITION_ELIGIBLE['SF'];
}

// ─────────────────────────────────────────────────────────────
// Step 3: Archetype Score from Module Scores
// ─────────────────────────────────────────────────────────────

export function calcArchetypeScore(m: ArchetypeModuleScores, type: ArchetypeType): number {
    switch (type) {
        case 'primary_creator_guard':
            return m.playmaking * 0.38 + m.shotCreation * 0.22 + m.rimFinishing * 0.12 +
                   m.spotUpShooting * 0.08 + m.poaDefense * 0.08 + m.motorAvailability * 0.12;

        case 'scoring_combo_guard':
            return m.shotCreation * 0.32 + m.rimFinishing * 0.20 + m.spotUpShooting * 0.18 +
                   m.playmaking * 0.12 + m.offballAttack * 0.08 + m.motorAvailability * 0.10;

        case 'movement_shooter':
            return m.spotUpShooting * 0.40 + m.offballAttack * 0.28 + m.motorAvailability * 0.12 +
                   m.poaDefense * 0.10 + m.teamDefense * 0.10;

        case 'perimeter_3nd':
            return m.spotUpShooting * 0.30 + m.poaDefense * 0.28 + m.teamDefense * 0.20 +
                   m.offballAttack * 0.10 + m.motorAvailability * 0.12;

        case 'two_way_wing':
            return m.spotUpShooting * 0.18 + m.rimFinishing * 0.16 + m.poaDefense * 0.18 +
                   m.teamDefense * 0.18 + m.shotCreation * 0.10 + m.rebounding * 0.10 +
                   m.motorAvailability * 0.10;

        case 'slashing_wing':
            return m.rimFinishing * 0.34 + m.shotCreation * 0.16 + m.offballAttack * 0.14 +
                   m.poaDefense * 0.12 + m.teamDefense * 0.10 + m.motorAvailability * 0.14;

        case 'shot_creator_wing':
            return m.shotCreation * 0.30 + m.rimFinishing * 0.18 + m.spotUpShooting * 0.16 +
                   m.playmaking * 0.10 + m.poaDefense * 0.10 + m.motorAvailability * 0.16;

        case 'connector_forward':
            return m.playmaking * 0.24 + m.spotUpShooting * 0.18 + m.teamDefense * 0.16 +
                   m.rebounding * 0.14 + m.offballAttack * 0.10 + m.rimFinishing * 0.08 +
                   m.motorAvailability * 0.10;

        case 'post_scoring_big':
            return m.postCraft * 0.38 + m.rimFinishing * 0.20 + m.rebounding * 0.16 +
                   m.rimProtection * 0.10 + m.teamDefense * 0.08 + m.motorAvailability * 0.08;

        case 'rim_runner_big':
            return m.rimFinishing * 0.30 + m.rimProtection * 0.24 + m.rebounding * 0.22 +
                   m.teamDefense * 0.10 + m.motorAvailability * 0.14;

        case 'stretch_big':
            return m.spotUpShooting * 0.30 + m.rebounding * 0.20 + m.rimProtection * 0.18 +
                   m.teamDefense * 0.12 + m.postCraft * 0.10 + m.motorAvailability * 0.10;

        case 'rim_protector_anchor':
            return m.rimProtection * 0.38 + m.rebounding * 0.26 + m.teamDefense * 0.14 +
                   m.motorAvailability * 0.10 + m.postCraft * 0.12;

        case 'playmaking_big':
            return m.playmaking * 0.26 + m.postCraft * 0.20 + m.spotUpShooting * 0.16 +
                   m.rebounding * 0.16 + m.teamDefense * 0.12 + m.rimProtection * 0.10;

        default:
            return 0;
    }
}

// ─────────────────────────────────────────────────────────────
// Step 4: Stats-based StyleFit Bonus (seasonal, -5~+5 per archetype)
// ─────────────────────────────────────────────────────────────

export function calcStatStyleFit(stats: PlayerStats): Partial<Record<ArchetypeType, number>> {
    if (!stats || stats.g === 0) return {};

    const g = stats.g;
    const astPG = stats.ast / g;
    const p3aPG = stats.p3a / g;
    const p3Pct = stats.p3a > 0 ? stats.p3m / stats.p3a : 0;
    const rimPG = (stats.rimA ?? 0) / g;
    const ftaPG = stats.fta / g;
    const blkPG = stats.blk / g;
    const rebPG = stats.reb / g;

    const bonuses: Partial<Record<ArchetypeType, number>> = {};

    // High assists → lead guard
    if (astPG >= 7) bonuses['primary_creator_guard'] = 5;
    else if (astPG >= 5) bonuses['primary_creator_guard'] = 3;

    // High 3pt volume + efficiency → shooter archetypes
    if (p3aPG >= 6 && p3Pct >= 0.36) {
        bonuses['movement_shooter'] = 5;
        bonuses['perimeter_3nd'] = 4;
        bonuses['stretch_big'] = 4;
    } else if (p3aPG >= 4 && p3Pct >= 0.35) {
        bonuses['movement_shooter'] = 3;
        bonuses['stretch_big'] = 3;
    }

    // Rim attempts + FTA → slashing / rim runner
    if (rimPG >= 6 && ftaPG >= 5) {
        bonuses['slashing_wing'] = 5;
        bonuses['rim_runner_big'] = 4;
    } else if (rimPG >= 4 || ftaPG >= 4) {
        bonuses['slashing_wing'] = 2;
        bonuses['rim_runner_big'] = 2;
    }

    // High blocks + rebounds → rim protector
    if (blkPG >= 2.5 && rebPG >= 9) {
        bonuses['rim_protector_anchor'] = 5;
    } else if (blkPG >= 1.5) {
        bonuses['rim_protector_anchor'] = 3;
    }

    // High assists + low scoring → playmaking types
    if (astPG >= 4 && stats.pts / g < 14) {
        bonuses['connector_forward'] = 4;
        bonuses['playmaking_big'] = 3;
    }

    return bonuses;
}

// ─────────────────────────────────────────────────────────────
// Step 5: Trait Tags (module score thresholds)
// ─────────────────────────────────────────────────────────────

export function calcTraitTags(modules: ArchetypeModuleScores, player: Player): TraitTag[] {
    const tags: TraitTag[] = [];

    if (modules.rimFinishing >= 85)                       tags.push('elite_finisher');
    if (player.drawFoul >= 88)                             tags.push('foul_merchant');
    if (modules.shotCreation >= 85)                        tags.push('shotmaker');
    if (modules.spotUpShooting >= 85)                      tags.push('floor_spacer');
    if (modules.offballAttack >= 82 && modules.spotUpShooting >= 82) tags.push('off_ball_mover');
    if (modules.playmaking >= 82)                          tags.push('plus_playmaker');
    if (modules.poaDefense >= 84)                          tags.push('poa_stopper');
    if (modules.teamDefense >= 84)                         tags.push('team_defender');
    if (modules.rimProtection >= 85)                       tags.push('rim_protector');
    if (modules.rebounding >= 84)                          tags.push('glass_cleaner');
    if (modules.motorAvailability >= 85)                   tags.push('high_motor');
    if (player.durability >= 90 && player.stamina >= 85)   tags.push('ironman');
    if ((modules.shotCreation >= 72 || modules.spotUpShooting >= 72) && player.offConsist <= 65)
                                                           tags.push('streaky_scorer');
    if (player.offConsist >= 75 && player.defConsist >= 75) tags.push('reliable_two_way');

    return tags;
}

// ─────────────────────────────────────────────────────────────
// Step 6: Main Assignment Function
// ─────────────────────────────────────────────────────────────

export function assignArchetypes(
    player: Player,
    season: string,
    prevState?: PlayerArchetypeState,
    seasonStats?: PlayerStats,
): PlayerArchetypeState {
    const modules = calcModuleScores(player);
    const eligible = getEligibleArchetypes(player.position);

    // Style fit bonus from season stats
    const statFit = seasonStats && seasonStats.g > 0 ? calcStatStyleFit(seasonStats) : {};

    // Score each eligible archetype
    const scores: { type: ArchetypeType; score: number }[] = eligible.map(type => {
        const attrScore  = calcArchetypeScore(modules, type);
        const styleBonus = statFit[type] ?? 0;
        const prevBonus  = prevState?.primary === type ? 5 : 0;

        let score: number;
        if (!prevState) {
            // First assignment: pure attribute-based
            score = attrScore;
        } else {
            score = attrScore * 0.60 + (attrScore + styleBonus) * 0.25 + prevBonus * 0.15;
        }
        return { type, score };
    });

    scores.sort((a, b) => b.score - a.score);

    const topType  = scores[0].type;
    const topScore = scores[0].score;
    const second   = scores[1];

    // Determine change threshold by age
    let threshold: number;
    if (player.age <= 24) threshold = 5;
    else if (player.age <= 30) threshold = 8;
    else threshold = 10;

    // Check if we should keep previous archetype (not enough games or score gap too small)
    if (prevState) {
        const playedEnough = (seasonStats?.g ?? 0) >= 50 || (seasonStats?.mp ?? 0) >= 1200;
        const prevPrimaryScore = calcArchetypeScore(modules, prevState.primary);
        const shouldChange = topType !== prevState.primary && topScore > prevPrimaryScore + threshold && playedEnough;

        if (!shouldChange) {
            // Keep primary, but still update tags and module scores
            return {
                primary: prevState.primary,
                secondary: second && topScore - second.score <= 7 ? second.type : undefined,
                tags: calcTraitTags(modules, player),
                moduleScores: modules,
                lastUpdated: season,
            };
        }
    }

    const primary   = topType;
    const secondary = second && topScore - second.score <= 7 ? second.type : undefined;
    const tags      = calcTraitTags(modules, player);

    return { primary, secondary, tags, moduleScores: modules, lastUpdated: season };
}

// ─────────────────────────────────────────────────────────────
// Display Helpers
// ─────────────────────────────────────────────────────────────

const ARCHETYPE_DISPLAY: Record<ArchetypeType, ArchetypeDisplayInfo> = {
    'primary_creator_guard':  { label: 'Primary Creator',   description: '공격 설계자형 가드',    color: 'violet',  group: 'guard' },
    'scoring_combo_guard':    { label: 'Scoring Guard',      description: '득점형 콤보 가드',       color: 'blue',    group: 'guard' },
    'movement_shooter':       { label: 'Movement Shooter',   description: '오프볼 무브먼트 슈터',   color: 'sky',     group: 'guard' },
    'perimeter_3nd':          { label: 'Perimeter 3&D',      description: '외곽 수비 & 슈터',       color: 'teal',    group: 'wing'  },
    'two_way_wing':           { label: 'Two-Way Wing',       description: '공수 균형형 윙',         color: 'green',   group: 'wing'  },
    'slashing_wing':          { label: 'Slashing Wing',      description: '돌파 & 컷인형 윙',       color: 'orange',  group: 'wing'  },
    'shot_creator_wing':      { label: 'Shot Creator',       description: '볼핸들링 득점형 윙',     color: 'amber',   group: 'wing'  },
    'connector_forward':      { label: 'Connector Forward',  description: '패스 & 허슬형 포워드',   color: 'lime',    group: 'wing'  },
    'post_scoring_big':       { label: 'Post Scorer',        description: '로우포스트 스코어러',    color: 'red',     group: 'big'   },
    'rim_runner_big':         { label: 'Rim Runner',         description: '롤맨 & 마무리형 빅',     color: 'rose',    group: 'big'   },
    'stretch_big':            { label: 'Stretch Big',        description: '외곽슛 가능한 빅',       color: 'cyan',    group: 'big'   },
    'rim_protector_anchor':   { label: 'Rim Protector',      description: '수비 앵커형 센터',       color: 'slate',   group: 'big'   },
    'playmaking_big':         { label: 'Playmaking Big',     description: '패스 허브형 빅',         color: 'indigo',  group: 'big'   },
};

export function getArchetypeDisplayInfo(type: ArchetypeType): ArchetypeDisplayInfo {
    return ARCHETYPE_DISPLAY[type];
}

const TRAIT_TAG_DISPLAY: Record<TraitTag, { label: string; color: string }> = {
    'elite_finisher':  { label: 'Elite Finisher',  color: 'orange'  },
    'foul_merchant':   { label: 'Foul Merchant',   color: 'yellow'  },
    'shotmaker':       { label: 'Shotmaker',        color: 'amber'   },
    'floor_spacer':    { label: 'Floor Spacer',     color: 'sky'     },
    'off_ball_mover':  { label: 'Off-Ball Mover',  color: 'cyan'    },
    'plus_playmaker':  { label: '+Playmaker',       color: 'violet'  },
    'poa_stopper':     { label: 'POA Stopper',      color: 'teal'    },
    'team_defender':   { label: 'Team Defender',    color: 'green'   },
    'rim_protector':   { label: 'Rim Protector',    color: 'slate'   },
    'glass_cleaner':   { label: 'Glass Cleaner',    color: 'stone'   },
    'high_motor':      { label: 'High Motor',       color: 'lime'    },
    'ironman':         { label: 'Ironman',           color: 'emerald' },
    'streaky_scorer':  { label: 'Streaky Scorer',   color: 'red'     },
    'reliable_two_way':{ label: 'Reliable 2-Way',   color: 'indigo'  },
};

export function getTraitTagDisplayInfo(tag: TraitTag): { label: string; color: string } {
    return TRAIT_TAG_DISPLAY[tag];
}
