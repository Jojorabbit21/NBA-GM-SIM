
import { Team, GameTactics, DepthChart } from '../../../../types';
import { TeamState, LivePlayer } from './pbpTypes';
import { calculatePlayerArchetypes } from './archetypeSystem';
import { INITIAL_STATS, calculatePlayerOvr } from '../../../../utils/constants';
import { generateAutoTactics } from '../../tactics/tacticGenerator';

export function initTeamState(team: Team, tactics: GameTactics | undefined, depthChart?: DepthChart | null): TeamState {
    // 1. 전술이 없거나 뎁스차트가 없는 경우(AI팀 등) 자동 생성
    let safeTactics: GameTactics;
    if (!tactics || (!tactics.depthChart && !depthChart)) {
        safeTactics = generateAutoTactics(team);
    } else {
        safeTactics = tactics;
    }

    const effectiveDepthChart = depthChart || safeTactics.depthChart;

    // 2. 로스터 정렬
    const sortedRoster = [...team.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
    
    const liveRoster: LivePlayer[] = sortedRoster.map(p => {
        const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
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
            pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
            fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
            rimM: 0, rimA: 0, midM: 0, midA: 0,
            pf: 0, plusMinus: 0, mp: 0, g: 1, gs: 0,
            zoneData: { ...INITIAL_STATS() },
            currentCondition,
            startCondition: currentCondition,
            position: p.position,
            ovr: calculatePlayerOvr(p),
            isStarter: false,
            health: p.health || 'Healthy',
            injuryType: p.injuryType,
            returnDate: p.returnDate,
            lastSubInTime: 0,
            conditionAtSubIn: currentCondition,
            attr,
            archetypes: calculatePlayerArchetypes(attr, currentCondition),
            zone_rim_m: 0, zone_rim_a: 0, zone_paint_m: 0, zone_paint_a: 0,
            zone_mid_l_m: 0, zone_mid_l_a: 0, zone_mid_c_m: 0, zone_mid_c_a: 0, zone_mid_r_m: 0, zone_mid_r_a: 0,
            zone_c3_l_m: 0, zone_c3_l_a: 0, zone_c3_r_m: 0, zone_c3_r_a: 0,
            zone_atb3_l_m: 0, zone_atb3_l_a: 0, zone_atb3_c_m: 0, zone_atb3_c_a: 0, zone_atb3_r_m: 0, zone_atb3_r_a: 0
        };
    });

    const onCourt: LivePlayer[] = [];
    const bench: LivePlayer[] = [];
    const starterIds = Object.values(safeTactics.starters).filter(id => id !== '');
    
    liveRoster.forEach(p => {
        if (starterIds.includes(p.playerId) && onCourt.length < 5) {
            p.isStarter = true;
            p.gs = 1;
            p.lastSubInTime = 720;
            onCourt.push(p);
        } else {
            bench.push(p);
        }
    });

    return {
        id: team.id,
        name: team.name,
        score: 0,
        tactics: safeTactics,
        depthChart: effectiveDepthChart || undefined,
        onCourt,
        bench,
        timeouts: 7,
        fouls: 0,
        bonus: false
    };
}
