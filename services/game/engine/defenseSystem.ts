
import { Player, TacticalSliders } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { DefenseResult, OpponentDefensiveMetrics } from './types';

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
//  INDIVIDUAL DEFENSE CALCULATION
// --------------------------------------------------------------------------------
export function calculateDefenseStats(
    p: Player, 
    mp: number, 
    sliders: TacticalSliders, 
    perfDrop: number
): DefenseResult {
    const C = SIM_CONFIG.STATS;

    // 1. Rebounds
    const offRebSlider = 1.0 + (sliders.offReb - 5) * 0.05;
    const defRebSlider = 1.0 + (sliders.defReb - 5) * 0.03;
    
    const rebAttr = (p.reb * 0.6 + p.vertical * 0.1 + p.hustle * 0.1 + p.strength * 0.2);
    let rebBase = rebAttr * (mp / 48) * C.REB_BASE_FACTOR; 
    
    if (p.position === 'C') rebBase *= 1.15;
    if (p.position === 'PF') rebBase *= 1.08;

    const totalReb = Math.round(rebBase * (Math.random() * 0.4 + 0.8) * defRebSlider);
    const offRebRatio = (p.offReb / (p.offReb + p.defReb * 1.5)); 
    const offReb = Math.round(totalReb * offRebRatio * offRebSlider);
    const defReb = Math.max(0, totalReb - offReb);

    // 2. Steals
    const stlAttr = (p.steal * 0.5 + p.perDef * 0.3 + p.hustle * 0.2) * (1 - perfDrop);
    const stlIntensity = 1 + (sliders.defIntensity - 5) * 0.06;
    let stlBase = stlAttr * (mp / 48) * C.STL_BASE_FACTOR * stlIntensity;
    if (p.position === 'PG' || p.position === 'SG') stlBase *= 1.1; 
    const stl = Math.round(stlBase * (Math.random() * 0.5 + 0.75));

    // 3. Blocks
    const blkAttr = (p.blk * 0.6 + p.vertical * 0.2 + p.height * 0.2) * (1 - perfDrop);
    let blkFactor = C.BLK_GUARD_FACTOR; 
    if (p.position === 'C') blkFactor = C.BLK_BIG_FACTOR;
    else if (p.position === 'PF') blkFactor = 0.045;
    const blk = Math.round(blkAttr * (mp / 48) * blkFactor * (Math.random() * 0.6 + 0.7));

    return { reb: totalReb, offReb, defReb, stl, blk };
}
