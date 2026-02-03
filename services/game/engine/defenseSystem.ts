
import { Player, TacticalSliders, PlayerBoxScore } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { DefenseResult, OpponentDefensiveMetrics, PlayerSimContext } from './types';

// --------------------------------------------------------------------------------
//  OPPONENT METRICS AGGREGATION
// --------------------------------------------------------------------------------
export function getOpponentDefensiveMetrics(roster: Player[], minutes: number[], zoneUsage: number): OpponentDefensiveMetrics {
    let totalMin = 0;
    const metrics = { intDef: 0, perDef: 0, block: 0, pressure: 0, helpDef: 0 };
    
    roster.forEach((p, i) => {
        const min = minutes[i];
        if (min > 0) {
            metrics.intDef += p.intDef * min;
            metrics.perDef += p.perDef * min;
            metrics.block += p.blk * min;
            metrics.pressure += p.def * min;
            metrics.helpDef += p.helpDefIq * min;
            totalMin += min;
        }
    });

    if (totalMin > 0) {
        metrics.intDef /= totalMin;
        metrics.perDef /= totalMin;
        metrics.block /= totalMin;
        metrics.pressure /= totalMin;
        metrics.helpDef /= totalMin;
    }

    // Apply Zone Defense Modifier globally to the team's metrics
    const zoneEffect = (zoneUsage - 5) * 2.0; 
    metrics.intDef += zoneEffect; 
    metrics.perDef -= zoneEffect;

    return metrics;
}

// --------------------------------------------------------------------------------
//  INDIVIDUAL DEFENSE CALCULATION (Events & Weights)
// --------------------------------------------------------------------------------
export function calculateDefenseStats(
    p: Player, 
    mp: number, 
    sliders: TacticalSliders, 
    perfDrop: number
): DefenseResult {
    const C = SIM_CONFIG.STATS;

    // 1. Rebound Weights (Potential) - Not actual stats yet
    // 리바운드 능력치 + 신체조건(힘, 점프) + 전술 슬라이더
    
    // 공격 리바운드 가중치
    const offRebSlider = 1.0 + (sliders.offReb - 5) * 0.15; // 슬라이더 영향력 강화
    const offRebAttr = (p.offReb * 0.6 + p.strength * 0.2 + p.vertical * 0.1 + p.hustle * 0.1);
    let offRebWeight = offRebAttr * (mp / 48) * offRebSlider;
    
    // 수비 리바운드 가중치
    const defRebSlider = 1.0 + (sliders.defReb - 5) * 0.10;
    const defRebAttr = (p.defReb * 0.65 + p.strength * 0.2 + p.vertical * 0.1 + p.hustle * 0.05);
    let defRebWeight = defRebAttr * (mp / 48) * defRebSlider;

    // Position Bonus for Rebounding
    if (p.position === 'C') { offRebWeight *= 1.2; defRebWeight *= 1.2; }
    if (p.position === 'PF') { offRebWeight *= 1.1; defRebWeight *= 1.1; }

    // 2. Steals (Direct Event)
    const stlAttr = (p.steal * 0.5 + p.perDef * 0.3 + p.hustle * 0.2) * (1 - perfDrop);
    const stlIntensity = 1 + (sliders.defIntensity - 5) * 0.06;
    let stlBase = stlAttr * (mp / 48) * C.STL_BASE_FACTOR * stlIntensity;
    if (p.position === 'PG' || p.position === 'SG') stlBase *= 1.1; 
    const stl = Math.round(stlBase * (Math.random() * 0.5 + 0.75));

    // 3. Blocks (Direct Event)
    const blkAttr = (p.blk * 0.6 + p.vertical * 0.2 + p.height * 0.2) * (1 - perfDrop);
    let blkFactor = C.BLK_GUARD_FACTOR; 
    if (p.position === 'C') blkFactor = C.BLK_BIG_FACTOR;
    else if (p.position === 'PF') blkFactor = 0.045;
    const blk = Math.round(blkAttr * (mp / 48) * blkFactor * (Math.random() * 0.6 + 0.7));

    return { stl, blk, offRebWeight, defRebWeight };
}

// --------------------------------------------------------------------------------
//  DISTRIBUTE REBOUNDS (Post-Simulation Phase)
//  Logic: Real miss counts -> Contested by Team Weights
// --------------------------------------------------------------------------------
export function distributeRebounds(
    teamPlayers: PlayerSimContext[], 
    oppPlayers: PlayerSimContext[], 
    teamMisses: number, 
    oppMisses: number
) {
    // 1. Calculate Team Aggregate Weights
    const teamOffRebPower = teamPlayers.reduce((sum, p) => sum + p.stats.offRebWeight, 0);
    const teamDefRebPower = teamPlayers.reduce((sum, p) => sum + p.stats.defRebWeight, 0);
    
    const oppOffRebPower = oppPlayers.reduce((sum, p) => sum + p.stats.offRebWeight, 0);
    const oppDefRebPower = oppPlayers.reduce((sum, p) => sum + p.stats.defRebWeight, 0);

    // 2. Resolve Rebounds on OPPONENT'S Misses (Defensive Rebounding Opportunity)
    // 수비 리바운드 기회 = 상대의 야투 실패 + (상대 자유투 실패 * 0.4 [Live Ball Rate])
    // NBA Average DRB% is ~73-77%
    const totalDefRebOpps = oppMisses;
    
    // DRB% Formula: Team Def Power / (Team Def Power + Opp Off Power)
    // Base bias towards defense (x2.5 factor on defensive weight) to simulate positional advantage
    const drbChance = (teamDefRebPower * 2.5) / ((teamDefRebPower * 2.5) + oppOffRebPower);
    const teamTotalDefRebs = Math.round(totalDefRebOpps * Math.min(0.95, Math.max(0.55, drbChance)));

    // Distribute DRB to individual players based on their contribution to the team's weight
    teamPlayers.forEach(p => {
        if (teamDefRebPower > 0) {
            const share = p.stats.defRebWeight / teamDefRebPower;
            // Add randomness to distribution so it's not perfectly proportional every time
            const variance = 0.8 + (Math.random() * 0.4);
            p.stats.defReb = Math.round(teamTotalDefRebs * share * variance);
        } else {
            p.stats.defReb = 0;
        }
    });

    // 3. Resolve Rebounds on OWN Misses (Offensive Rebounding Opportunity)
    // 공격 리바운드 기회 = 우리팀 야투 실패 + (우리팀 자유투 실패 * 0.4)
    const totalOffRebOpps = teamMisses;
    
    // ORB% Formula: Team Off Power / (Team Off Power + Opp Def Power)
    // Defense has advantage
    const orbChance = teamOffRebPower / (teamOffRebPower + (oppDefRebPower * 2.5));
    const teamTotalOffRebs = Math.round(totalOffRebOpps * Math.min(0.40, Math.max(0.15, orbChance)));

    // Distribute ORB
    teamPlayers.forEach(p => {
        if (teamOffRebPower > 0) {
            const share = p.stats.offRebWeight / teamOffRebPower;
            const variance = 0.8 + (Math.random() * 0.4);
            p.stats.offReb = Math.round(teamTotalOffRebs * share * variance);
        } else {
            p.stats.offReb = 0;
        }
        
        // Final Sum
        p.stats.reb = p.stats.offReb + p.stats.defReb;
    });
}
