
import { Team, GameTactics, DepthChart } from '../../../../types';
import { TeamState, LivePlayer } from './pbpTypes';
import { calculatePlayerArchetypes } from './archetypeSystem';
import { INITIAL_STATS } from '../../../../utils/constants';

export function initTeamState(team: Team, tactics: GameTactics | undefined, depthChart?: DepthChart | null): TeamState {
    // Default tactics if undefined
    const safeTactics: GameTactics = tactics || {
        offenseTactics: ['Balance'],
        defenseTactics: ['ManToManPerimeter'],
        sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 1, zoneUsage: 2, rotationFlexibility: 5 },
        starters: { PG: '', SG: '', SF: '', PF: '', C: '' },
        minutesLimits: {}
    };

    // Sort Roster by OVR to auto-fill empty slots
    const sortedRoster = [...team.roster].sort((a, b) => b.ovr - a.ovr);
    
    // Map Roster to LivePlayer
    const liveRoster: LivePlayer[] = sortedRoster.map(p => {
        const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
        
        // Prepare Attributes map for Engine use
        const attr = {
            ins: p.ins, out: p.out, mid: p.midRange, ft: p.ft, threeVal: threeAvg,
            speed: p.speed, agility: p.agility, strength: p.strength, vertical: p.vertical,
            stamina: p.stamina, durability: p.durability, hustle: p.hustle,
            height: p.height, weight: p.weight,
            handling: p.handling, hands: p.hands, pas: p.passAcc, passAcc: p.passAcc,
            passVision: p.passVision, passIq: p.passIq, shotIq: p.shotIq, offConsist: p.offConsist,
            postPlay: p.postPlay,
            def: p.def, intDef: p.intDef, perDef: p.perDef, blk: p.blk, stl: p.steal,
            helpDefIq: p.helpDefIq, defConsist: p.defConsist, drFoul: p.drawFoul, foulTendency: 50,
            reb: p.reb
        };

        const currentCondition = p.condition !== undefined ? p.condition : 100;

        return {
            playerId: p.id,
            playerName: p.name,
            // Box Score Init
            pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
            fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
            rimM: 0, rimA: 0, midM: 0, midA: 0,
            pf: 0, plusMinus: 0, mp: 0, g: 1, gs: 0,
            zoneData: { ...INITIAL_STATS() }, // Initialize Zone Stats
            
            // Live Props
            currentCondition,
            startCondition: currentCondition, // Track starting condition
            position: p.position,
            ovr: p.ovr,
            isStarter: false, // Set later
            health: p.health || 'Healthy',
            injuryType: p.injuryType,
            returnDate: p.returnDate,
            
            lastSubInTime: 0,
            conditionAtSubIn: currentCondition,
            isShutdown: false,
            needsDeepRecovery: false,
            
            attr,
            archetypes: calculatePlayerArchetypes(attr, currentCondition), // Initial calc

            // Zone Accumulators (Initialize to 0)
            zone_rim_m: 0, zone_rim_a: 0, zone_paint_m: 0, zone_paint_a: 0,
            zone_mid_l_m: 0, zone_mid_l_a: 0, zone_mid_c_m: 0, zone_mid_c_a: 0, zone_mid_r_m: 0, zone_mid_r_a: 0,
            zone_c3_l_m: 0, zone_c3_l_a: 0, zone_c3_r_m: 0, zone_c3_r_a: 0,
            zone_atb3_l_m: 0, zone_atb3_l_a: 0, zone_atb3_c_m: 0, zone_atb3_c_a: 0, zone_atb3_r_m: 0, zone_atb3_r_a: 0
        };
    });

    // Determine Starters
    const onCourt: LivePlayer[] = [];
    const bench: LivePlayer[] = [];
    const starterIds = Object.values(safeTactics.starters).filter(id => id !== '');
    
    // Auto-fill if missing starters
    if (starterIds.length < 5) {
        const needed = 5 - starterIds.length;
        const available = liveRoster.filter(p => !starterIds.includes(p.playerId));
        for (let i = 0; i < needed; i++) {
            if (available[i]) starterIds.push(available[i].playerId);
        }
    }

    liveRoster.forEach(p => {
        if (starterIds.includes(p.playerId) && onCourt.length < 5) {
            p.isStarter = true;
            p.gs = 1;
            p.lastSubInTime = 720; // Q1 Start (12 mins)
            onCourt.push(p);
        } else {
            bench.push(p);
        }
    });

    // Fallback if still not 5 (e.g. tiny roster)
    while (onCourt.length < 5 && bench.length > 0) {
        const p = bench.shift()!;
        p.isStarter = true;
        p.gs = 1;
        p.lastSubInTime = 720;
        onCourt.push(p);
    }

    return {
        id: team.id,
        name: team.name,
        score: 0,
        tactics: safeTactics,
        depthChart: depthChart || undefined,
        onCourt,
        bench,
        timeouts: 7,
        fouls: 0,
        bonus: false
    };
}
