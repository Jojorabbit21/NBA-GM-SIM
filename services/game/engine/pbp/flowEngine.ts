
import { GameState, PossessionResult, TeamState, LivePlayer } from './pbpTypes';
import { calculatePossessionTime } from './timeEngine';
import { OFFENSE_STRATEGY_CONFIG, DEFENSE_STRATEGY_CONFIG } from './strategyMap';
import { OffenseTactic, DefenseTactic, PlayType, Player } from '../../../../types';
import { resolvePlayAction, PlayContext } from './playTypes';
import { calculateAceStopperImpact } from '../aceStopperSystem';
import { SIM_CONFIG } from '../../config/constants'; // [Fixed] Correct import path
import { FOUL_CONFIG } from '../foulSystem';

// --- Text Generator Interfaces ---
type ShotZone = 'Rim' | 'Paint' | 'Mid-L' | 'Mid-C' | 'Mid-R' | '3PT-L' | '3PT-C' | '3PT-R' | '3PT-Corn';

// --- Adapter: LivePlayer to Player (for Legacy Systems) ---
function flattenPlayer(lp: LivePlayer): Player {
    // [Integration Fix] Calculate missing aggregate stats 'ath' and 'plm' required by Ace Stopper & Core logic
    const ath = Math.round((lp.attr.speed + lp.attr.agility + lp.attr.strength + lp.attr.vertical + lp.attr.stamina + lp.attr.hustle + lp.attr.durability) / 7);
    const plm = Math.round((lp.attr.passAcc + lp.attr.handling + lp.attr.speed + lp.attr.passVision + lp.attr.passIq) / 5);

    return {
        id: lp.playerId,
        name: lp.playerName,
        position: lp.position,
        ...lp.attr, // Spread attributes to root
        ath,
        plm,
        condition: lp.currentCondition,
        // Mock stats needed for Ace Stopper type checking
        stats: {} as any,
        playoffStats: {} as any,
        age: 0, height: lp.attr.height, weight: lp.attr.weight, salary: 0, contractYears: 0, ovr: lp.ovr, potential: 0, health: lp.health,
        tendencies: { hand: 'Right', lateralBias: 0 },
        // Essential stats mapping for consistency with Core Engine
        closeShot: lp.attr.ins, midRange: lp.attr.mid, threeCorner: lp.attr.out, three45: lp.attr.out, threeTop: lp.attr.out,
        ft: lp.attr.ft, shotIq: lp.attr.shotIq, offConsist: lp.attr.offConsist,
        layup: lp.attr.ins, dunk: lp.attr.ins, postPlay: lp.attr.postPlay, drawFoul: lp.attr.drFoul, hands: lp.attr.hands,
        passAcc: lp.attr.pas, handling: lp.attr.handling, spdBall: lp.attr.speed, passIq: lp.attr.passIq, passVision: lp.attr.passVision,
        intDef: lp.attr.intDef, perDef: lp.attr.perDef, steal: lp.attr.stl, blk: lp.attr.blk, helpDefIq: lp.attr.helpDefIq, passPerc: lp.attr.def, defConsist: lp.attr.defConsist,
        offReb: lp.attr.reb, defReb: lp.attr.reb,
        speed: lp.attr.speed, agility: lp.attr.agility, strength: lp.attr.strength, vertical: lp.attr.vertical, stamina: lp.attr.stamina, hustle: lp.attr.hustle, durability: lp.attr.durability,
        intangibles: 50, revealedPotential: 50
    };
}

// --- Helper: Calculate Team Tactical Fit Score (0.8 ~ 1.2) ---
function calculateOffensiveEfficiency(team: TeamState): number {
    const config = OFFENSE_STRATEGY_CONFIG[team.tactics.offenseTactics[0] || 'Balance'];
    return calculateEfficiency(team, config.fit);
}

function calculateDefensiveEfficiency(team: TeamState): number {
    const config = DEFENSE_STRATEGY_CONFIG[team.tactics.defenseTactics[0] || 'ManToManPerimeter'];
    return calculateEfficiency(team, config.fit);
}

function calculateEfficiency(team: TeamState, fitWeights: Partial<Record<string, number>>): number {
    let totalFitScore = 0;
    let maxPossibleScore = 0;

    team.onCourt.forEach(p => {
        Object.entries(fitWeights).forEach(([arch, weight]) => {
            const rating = p.archetypes[arch as keyof typeof p.archetypes] || 50;
            const w = weight as number;
            totalFitScore += rating * w;
            maxPossibleScore += 100 * w;
        });
    });

    const rawRatio = maxPossibleScore > 0 ? totalFitScore / maxPossibleScore : 0.5;
    return 0.8 + (rawRatio * 0.4);
}

// --- Helper: Calculate Real-time Team Defensive Metrics ---
function calculateTeamDefensiveRating(team: TeamState): { intDef: number, perDef: number, pressure: number, help: number } {
    let intSum = 0, perSum = 0, pressSum = 0, helpSum = 0;
    const count = team.onCourt.length || 1;
    
    team.onCourt.forEach(p => {
        // Fatigue affects team defense coordination
        const cond = Math.max(0.5, p.currentCondition / 100);
        intSum += p.attr.intDef * cond;
        perSum += p.attr.perDef * cond;
        pressSum += p.attr.def * cond;
        helpSum += p.attr.helpDefIq * cond;
    });

    const metrics = {
        intDef: intSum / count,
        perDef: perSum / count,
        pressure: pressSum / count,
        help: helpSum / count
    };

    // [New] Apply Zone Defense Slider Impact (Parity with Core Engine's defenseSystem.ts)
    // Zone boosts Interior Defense but hurts Perimeter Defense
    const zoneUsage = team.tactics.sliders.zoneUsage; // 1-10
    const zoneEffect = (zoneUsage - 5) * 2.0; 
    metrics.intDef += zoneEffect; 
    metrics.perDef -= zoneEffect;

    return metrics;
}

// --- Helper: Select Play Type based on Strategy Distribution ---
function selectPlayType(tactic: OffenseTactic): PlayType {
    const config = OFFENSE_STRATEGY_CONFIG[tactic || 'Balance'];
    const dist = config.playDistribution;
    
    let roll = Math.random();
    for (const [type, prob] of Object.entries(dist)) {
        roll -= prob as number;
        if (roll <= 0) return type as PlayType;
    }
    
    return 'Iso'; // Fallback
}

// --- Helper: Select Rebounder (Weighted Random) ---
// [Updated] Connected to SIM_CONFIG.STATS.REB_BASE_FACTOR implicitly via weight logic parity
function selectRebounder(players: LivePlayer[], isOffensive: boolean = false, sliders: any): LivePlayer {
    const weightedPool = players.map(p => {
        const fatigue = Math.max(0.5, p.currentCondition / 100);
        
        // [Fix] Use Off/Def specific stats if available (LivePlayer attr is usually flat, but we check)
        // If p.attr doesn't have split, fallback to generic reb
        // Note: Core Engine uses (Reb * 0.6 + Phys * 0.4). We match that.
        const baseStat = isOffensive ? (p.offReb || p.attr.reb) : (p.defReb || p.attr.reb);
        
        const physical = (p.attr.strength * 0.2) + (p.attr.vertical * 0.1) + (p.attr.hustle * 0.1);
        
        let weight = (baseStat * 0.6 + physical) * fatigue;

        // Positional Bias (Centers are naturally positioned closer)
        if (p.position === 'C') weight *= 1.5;
        else if (p.position === 'PF') weight *= 1.3;
        else if (p.position === 'PG') weight *= 0.8;
        
        // [New] Slider Impact from SIM_CONFIG parity
        // In defenseSystem.ts: slider impact is 0.15 for Off, 0.10 for Def
        const sliderVal = isOffensive ? sliders.offReb : sliders.defReb;
        const sliderMod = 1.0 + (sliderVal - 5) * (isOffensive ? 0.15 : 0.10);
        weight *= sliderMod;

        weight *= (0.8 + Math.random() * 0.4); // Random noise

        return { player: p, weight: Math.max(1, weight) };
    });

    const totalWeight = weightedPool.reduce((sum, item) => sum + item.weight, 0);
    let randomVal = Math.random() * totalWeight;
    
    for (const item of weightedPool) {
        randomVal -= item.weight;
        if (randomVal <= 0) {
            return item.player;
        }
    }

    return weightedPool[0].player;
}

// --- Helper: Generate Flavor Text ---
function generateScoreLog(context: PlayContext): string {
    const { playType, actor, secondaryActor, shotType, preferredZone } = context;
    const pName = actor.playerName;
    const sName = secondaryActor ? secondaryActor.playerName : '';
    
    const logs: string[] = [];

    switch (playType) {
        case 'Iso':
            if (shotType === 'Pullup') logs.push(`${pName}, 현란한 드리블 후 풀업 점퍼!`);
            else logs.push(`${pName}, 1대1 상황에서 돌파 득점.`);
            break;
        case 'PnR_Handler':
            if (secondaryActor) logs.push(`${sName}의 스크린을 타고 ${pName}의 슛!`);
            else logs.push(`${pName}, 픽앤롤 게임으로 득점을 만들어냅니다.`);
            break;
        case 'PnR_Roll':
            if (secondaryActor) logs.push(`${secondaryActor.playerName}의 킬패스! ${pName}의 호쾌한 덩크!`);
            else logs.push(`${pName}, 롤링 후 골밑 마무리.`);
            break;
        case 'PnR_Pop':
            logs.push(`${pName}, 팝아웃 후 오픈 찬스에서 슛.`);
            break;
        case 'PostUp':
            if (shotType === 'Hook') logs.push(`${pName}, 포스트업에 이은 훅슛 성공.`);
            else logs.push(`${pName}, 수비수를 등지고 페이더웨이!`);
            break;
        case 'CatchShoot':
            if (secondaryActor) logs.push(`${sName}의 킥아웃 패스, ${pName}의 3점!`);
            else logs.push(`${pName}, 캐치앤슛 깨끗합니다.`);
            break;
        case 'Cut':
             logs.push(`${pName}, 빈 공간으로 컷인 득점.`);
             break;
        case 'Handoff':
             logs.push(`${sName}의 핸드오프를 받아 ${pName}의 득점.`);
             break;
        case 'Transition':
             logs.push(`${pName}, 빠른 속공으로 레이업 올려놓습니다.`);
             break;
        default:
             logs.push(`${pName}, 득점 성공.`);
    }

    return logs[Math.floor(Math.random() * logs.length)];
}

function getLocationName(zone: string): string {
    const names: Record<string, string> = {
        'Rim': '골밑',
        'Paint': '페인트존',
        'Mid': '미드레인지',
        '3PT': '3점 라인',
    };
    return names[zone] || '외곽';
}

function determineShotZoneId(preferredZone: 'Rim' | 'Paint' | 'Mid' | '3PT'): string {
    const rand = Math.random();

    // [Update] Simple Bias simulation (Left/Right/Center)
    // Most players are Right-handed, slight bias to Right or Center
    const bias = Math.random(); 

    if (preferredZone === 'Rim') return 'zone_rim';
    if (preferredZone === 'Paint') return 'zone_paint';
    
    if (preferredZone === 'Mid') {
        if (bias < 0.3) return 'zone_mid_l';
        if (bias < 0.6) return 'zone_mid_c';
        return 'zone_mid_r';
    }

    if (preferredZone === '3PT') {
        if (bias < 0.15) return 'zone_c3_l';
        if (bias < 0.40) return 'zone_atb3_l';
        if (bias < 0.60) return 'zone_atb3_c';
        if (bias < 0.85) return 'zone_atb3_r';
        return 'zone_c3_r';
    }

    return 'zone_paint'; // Fallback
}

// --- Main Logic ---

export function resolvePossession(state: GameState): PossessionResult {
    const attTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = state.possession === 'home' ? state.away : state.home;
    
    // 1. Determine Play Type & Actor
    const tactic = attTeam.tactics.offenseTactics[0];
    const playType = selectPlayType(tactic);
    const playContext = resolvePlayAction(attTeam, playType);
    
    const { actor, secondaryActor, preferredZone, shotType, bonusHitRate } = playContext;
    
    // 1-1. Select Defender (Weighted by Matchup/Position)
    // Find defender playing same position OR best defender on court
    const defender = defTeam.onCourt.find(p => p.position === actor.position) || 
                     defTeam.onCourt.sort((a, b) => b.attr.def - a.attr.def)[0];

    const shotZoneId = determineShotZoneId(preferredZone);

    // 2. Calculate Time
    const timeTaken = calculatePossessionTime(state, attTeam.tactics.sliders, tactic);

    // 3. Efficiency Modifiers
    const attEfficiency = calculateOffensiveEfficiency(attTeam); 
    const defEfficiency = calculateDefensiveEfficiency(defTeam);
    
    // --- INTEGRATED FOUL LOGIC (from foulSystem.ts) ---
    // Calculates foul probability based on Defender's Discipline (Consist, Hustle, Stamina)
    const C = FOUL_CONFIG;
    
    // Discipline Rating (Higher is better)
    // Using simple weights: Consistency 35%, Hustle 10%, Stamina 15%, Positional IQ 40%
    const defDiscipline = (defender.attr.defConsist * C.WEIGHTS.COMMON.DEF_CONSISTENCY) + 
                          (defender.attr.hustle * C.WEIGHTS.COMMON.HUSTLE) + 
                          (defender.currentCondition * 0.15) + // Real-time stamina
                          (defender.attr.def * 0.4);

    // Base Propensity + Skill Gap
    // Average 75 -> Gap 25 -> 25/17 = ~1.5 extra fouls
    let foulPropensity = C.BASE_FOUL_RATE + ((100 - defDiscipline) / C.PROPENSITY_SCALE);

    // Matchup: Attacker's Draw Foul
    foulPropensity += (actor.attr.drFoul - 50) * C.DRAW_FOUL_FACTOR;

    // Sliders: Defense Intensity
    const intensity = defTeam.tactics.sliders.defIntensity;
    if (intensity > 5) {
        foulPropensity *= (1 + (intensity - 5) * C.SLIDERS.DEF_INTENSITY_IMPACT);
    }

    // Convert Propensity to Probability per Possession (Approximate)
    // Propensity is per 36 mins. ~75 poss per 36 mins.
    let foulChance = foulPropensity / 75; 

    // Cap probability (Max 15% per possession to avoid absurdity)
    foulChance = Math.min(0.15, Math.max(0.01, foulChance));

    if (Math.random() < foulChance) {
        // Shooting foul logic: if close to rim, higher chance of FTs
        const isShootingFoul = Math.random() < (preferredZone === 'Rim' ? 0.7 : 0.3);
        
        return {
            type: 'foul',
            player: actor,       // The one drawn the foul
            secondaryPlayer: defender, // The fouler
            timeTaken: Math.min(timeTaken, 3), // Foul stops clock early
            logText: `${defender.playerName}, ${actor.playerName}에게 파울 범함.`,
            nextPossession: isShootingFoul ? 'free_throw' : state.possession, // Simple logic
            isDeadBall: true,
            playType
        };
    }

    // --- INTEGRATED TURNOVER LOGIC (from playmakingSystem.ts) ---
    // Handle vs Pressure
    const handleSkill = actor.attr.handling * (actor.currentCondition / 100);
    const pressureSkill = defender.attr.def * (defender.currentCondition / 100);
    
    // Base TOV rate ~12-14% is realistic.
    let toChance = SIM_CONFIG.STATS.TOV_USAGE_FACTOR * 1.5; 
    
    // Skill Delta
    toChance -= (handleSkill - 70) * 0.002; // Better handle = less TOV
    toChance += (pressureSkill - 70) * 0.0015; // Better defense = more TOV

    // [New] Haste Penalty for Turnovers
    // Higher pace (e.g. 8, 9, 10) increases TOV chance significantly
    const paceSlider = attTeam.tactics.sliders.pace;
    if (paceSlider > 5) {
        // Pace 10 -> +0.025 (2.5%) more turnovers
        // Pace 6 -> +0.005 (0.5%)
        const hasteTOV = (paceSlider - 5) * 0.005; 
        toChance += hasteTOV;
    }
    
    // Pass Risk
    if (['PnR_Roll', 'Cut', 'CatchShoot'].includes(playType)) {
        toChance += 0.03; // Passing lanes
        // Passer IQ reduces risk
        if (secondaryActor) {
            toChance -= (secondaryActor.attr.passIq - 70) * 0.002;
        }
    }

    // Full Court Press Slider
    const press = defTeam.tactics.sliders.fullCourtPress;
    if (press > 5) toChance += (press - 5) * 0.01;

    if (Math.random() < toChance) {
        // [New] Check for Steal (Defensive Play) linked to SIM_CONFIG
        const stlFactor = SIM_CONFIG.STATS.STL_BASE_FACTOR; // 0.036
        const stlAttr = defender.attr.stl;
        const stealProb = (stlAttr / 100) * (stlFactor * 15); // Calibration to get ~50%
        
        const isSteal = Math.random() < stealProb;
        const logText = isSteal 
            ? `${defender.playerName}, ${actor.playerName}의 공을 가로챕니다!` 
            : `${actor.playerName}, ${playType} 시도 중 턴오버.`;

        return {
            type: 'turnover',
            player: actor,
            secondaryPlayer: isSteal ? defender : undefined, // Credited with steal if forced
            timeTaken,
            logText,
            nextPossession: state.possession === 'home' ? 'away' : 'home',
            isDeadBall: false,
            playType
        };
    }

    // --- INTEGRATED SHOOTING LOGIC (from shootingSystem.ts) ---
    const S = SIM_CONFIG.SHOOTING;
    let hitRate = 0.45;

    // 1. Base Percentages from Constants
    if (preferredZone === 'Rim') hitRate = S.INSIDE_BASE_PCT; // 0.58
    else if (preferredZone === 'Mid') hitRate = S.MID_BASE_PCT; // 0.40
    else if (preferredZone === '3PT') hitRate = S.THREE_BASE_PCT; // 0.35
    else hitRate = 0.45; 

    // 2. Attribute Delta (Offense vs Defense)
    // Fatigue applied
    const fatigueOff = actor.currentCondition / 100;
    const fatigueDef = defender.currentCondition / 100;

    const offRating = preferredZone === '3PT' ? (actor.attr.out * fatigueOff) : (actor.attr.ins * fatigueOff);
    
    // Defensive Stat Selection (Perimeter vs Interior)
    let defStat = defender.attr.perDef;
    let defImpactFactor = S.MID_DEF_IMPACT;

    if (preferredZone === 'Rim') {
        defStat = (defender.attr.intDef * 0.7) + (defender.attr.blk * 0.3);
        defImpactFactor = S.INSIDE_DEF_IMPACT;
    } else if (preferredZone === '3PT') {
        defStat = defender.attr.perDef;
        defImpactFactor = S.THREE_DEF_IMPACT;
    }

    const defRating = defStat * fatigueDef;
    
    // Apply Delta (Individual Matchup)
    // e.g. (90 - 70) * 0.004 = +0.08 (+8%)
    hitRate += (offRating - defRating) * defImpactFactor;

    // [New] Apply Team Defensive Metrics (Help Defense)
    const teamDefMetrics = calculateTeamDefensiveRating(defTeam);
    let helpImpact = 0;
    if (preferredZone === 'Rim' || preferredZone === 'Paint') {
        // Interior Help: IntDef + HelpIQ
        helpImpact = (teamDefMetrics.intDef + teamDefMetrics.help - 140) * 0.002;
    } else {
        // Perimeter Pressure: PerDef + Pressure + HelpIQ
        helpImpact = (teamDefMetrics.perDef + teamDefMetrics.pressure + teamDefMetrics.help - 210) * 0.001;
    }
    hitRate -= helpImpact; // Higher team defense reduces hit rate

    // 3. Tactical & Ace Stopper Impact
    const isStopperActive = defTeam.tactics.defenseTactics.includes('AceStopper') && 
                            defTeam.tactics.stopperId === defender.playerId;
    
    if (isStopperActive) {
        // Calculate detailed impact from AceStopper System
        const flatAce = flattenPlayer(actor);
        const flatStopper = flattenPlayer(defender);
        const stopperMp = defender.mp; 

        // calculateAceStopperImpact returns percentage (e.g. -15 for -15%)
        const impactPercent = calculateAceStopperImpact(flatAce, flatStopper, stopperMp);
        hitRate = hitRate * (1 + (impactPercent / 100));
    }

    // 4. Efficiency Modifiers
    hitRate += bonusHitRate; // From PlayType (e.g. +15% for Dunk)
    hitRate *= attEfficiency; // Team spacing/fit bonus
    hitRate *= (2.0 - defEfficiency); // Defense coordination penalty

    // [New] Haste Penalty (High Pace reduces Accuracy)
    // Only applies if playType is NOT Transition (Transitions are usually easy buckets)
    if (playType !== 'Transition' && paceSlider > 5) {
        // Pace 10 -> -7.5% Hit Rate
        // Pace 6 -> -1.5% Hit Rate
        const hastePenalty = (paceSlider - 5) * 0.015;
        hitRate -= hastePenalty;
    }

    const points = preferredZone === '3PT' ? 3 : 2;

    if (Math.random() < hitRate) {
        // MADE SHOT
        const logText = generateScoreLog(playContext);

        return {
            type: 'score',
            points: points,
            player: actor,
            secondaryPlayer: secondaryActor, // Assister
            timeTaken,
            logText,
            nextPossession: state.possession === 'home' ? 'away' : 'home',
            isDeadBall: false,
            playType: playType,
            shotZoneId
        };
    } else {
        // MISSED SHOT
        
        // [New] Check Block (Event)
        // [Fix] Connect to SIM_CONFIG.STATS.BLK_*_FACTOR
        let blkFactor = SIM_CONFIG.STATS.BLK_GUARD_FACTOR;
        if (defender.position === 'C') blkFactor = SIM_CONFIG.STATS.BLK_BIG_FACTOR;
        else if (defender.position === 'PF') blkFactor = SIM_CONFIG.STATS.BLK_BIG_FACTOR * 0.8;

        // Base chance derived from attribute & factor
        const blkAttr = defender.attr.blk * 0.6 + defender.attr.vertical * 0.2 + (defender.attr.height - 180) * 0.5;
        const blkChance = (blkAttr / 100) * (blkFactor * 3.0); // Multiplier to map factor to probability

        if (Math.random() < blkChance) {
             return {
                type: 'block',
                player: actor, // The one who missed
                secondaryPlayer: defender, // The blocker
                timeTaken,
                logText: `${defender.playerName}, ${actor.playerName}의 슛을 블록해냅니다!`,
                nextPossession: state.possession === 'home' ? 'away' : 'home', // Usually blocks turnover, simplified
                isDeadBall: false,
                playType,
                shotZoneId
            };
        }

        // Rebound Battle
        // [Fix] Passed Sliders to selectRebounder for Config Impact
        const homeReb = selectRebounder(state.home.onCourt, state.possession === 'home', state.home.tactics.sliders);
        const awayReb = selectRebounder(state.away.onCourt, state.possession === 'away', state.away.tactics.sliders);
        
        // Compare weights (with some randomness already baked in selectRebounder)
        // Defensive rebound is generally easier (Positioning) -> Bonus to DefTeam
        let homeWeight = homeReb.attr.reb; 
        let awayWeight = awayReb.attr.reb;

        if (state.possession === 'away') homeWeight *= 2.0; // Home is defending
        else awayWeight *= 2.0; // Away is defending

        const totalW = homeWeight + awayWeight;
        const roll = Math.random() * totalW;
        
        const rebounder = roll < homeWeight ? homeReb : awayReb;
        const isOffReb = (rebounder.playerId === actor.playerId) || 
                         (state.possession === 'home' && rebounder.playerId === state.home.onCourt.find(p=>p.playerId===rebounder.playerId)?.playerId) ||
                         (state.possession === 'away' && rebounder.playerId === state.away.onCourt.find(p=>p.playerId===rebounder.playerId)?.playerId);

        // If OffReb -> Keep Possession
        // If DefReb -> Switch Possession
        let nextPoss = state.possession === 'home' ? 'away' : 'home';
        if (isOffReb) nextPoss = 'keep'; // Reset shot clock handled in main loop if needed

        return {
            type: 'miss',
            player: actor,
            rebounder: rebounder,
            timeTaken,
            logText: `${actor.playerName}, ${getLocationName(preferredZone)} 슛 실패.`,
            nextPossession: nextPoss as any,
            isDeadBall: false,
            playType: playType,
            shotZoneId
        };
    }
}
