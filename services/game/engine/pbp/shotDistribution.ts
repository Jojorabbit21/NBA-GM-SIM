
import { Player, HiddenTendencies, PlayerTendencies, TacticalSliders } from '../../../types';
import { generateHiddenTendencies } from '../../../utils/hiddenTendencies';

export interface ZoneAttempts {
    zone_rim_a: number; zone_paint_a: number;
    zone_mid_l_a: number; zone_mid_c_a: number; zone_mid_r_a: number;
    zone_c3_l_a: number; zone_c3_r_a: number;
    zone_atb3_l_a: number; zone_atb3_c_a: number; zone_atb3_r_a: number;
}

export function distributeAttemptsToZones(
    player: Player,
    totalFGA: number,
    sliders: TacticalSliders // [New] Sliders drive distribution
): ZoneAttempts {
    const tendency = player.tendencies || (player.hiddenTendencies || generateHiddenTendencies(player));
    const lateralBias = (tendency as any).lateral_bias || 0; // 0=Left, 3=Right

    // 1. Determine Range Distribution (Rim / Mid / 3PT)
    // Based on Sliders (1-10) and Player Attributes
    
    // Base Weights from Sliders
    let wRim = sliders.shot_rim * 1.0;
    let wMid = sliders.shot_mid * 1.0;
    let w3pt = sliders.shot_3pt * 1.0;

    // Attribute Modifiers (Player capability affects preference)
    const attr = player as any; // Using flat player structure
    
    // If player is elite at a range, they gravitate towards it
    if (attr.threeVal > 85) w3pt += 3;
    if (attr.mid > 85) wMid += 2;
    if (attr.ins > 85) wRim += 2;
    
    // If player is bad, they avoid it
    if (attr.threeVal < 65) w3pt *= 0.3;
    
    const totalW = wRim + wMid + w3pt || 1;
    
    const rimA = Math.round(totalFGA * (wRim / totalW));
    const midA = Math.round(totalFGA * (wMid / totalW));
    const p3A = totalFGA - rimA - midA;

    // 2. Sub-Zone Distribution (Lateral Bias)
    // Bias: 0 (Strong Left), 1 (Left), 2 (Right), 3 (Strong Right)
    // Left Mult: 0->1.6, 1->1.2, 2->0.8, 3->0.4
    
    let leftMult = 1.0;
    let rightMult = 1.0;
    
    if (lateralBias === 0) { leftMult = 1.6; rightMult = 0.4; }
    else if (lateralBias === 1) { leftMult = 1.2; rightMult = 0.8; }
    else if (lateralBias === 2) { leftMult = 0.8; rightMult = 1.2; }
    else if (lateralBias === 3) { leftMult = 0.4; rightMult = 1.6; }

    const result: ZoneAttempts = {
        zone_rim_a: Math.round(rimA * 0.7), 
        zone_paint_a: Math.round(rimA * 0.3), // Non-RA paint
        
        zone_mid_l_a: Math.round(midA * 0.3 * leftMult),
        zone_mid_c_a: Math.round(midA * 0.4),
        zone_mid_r_a: Math.round(midA * 0.3 * rightMult),
        
        zone_c3_l_a: Math.round(p3A * 0.15 * leftMult),
        zone_atb3_l_a: Math.round(p3A * 0.20 * leftMult),
        zone_atb3_c_a: Math.round(p3A * 0.30),
        zone_atb3_r_a: Math.round(p3A * 0.20 * rightMult),
        zone_c3_r_a: Math.round(p3A * 0.15 * rightMult)
    };
    
    return result;
}

export function resolveDynamicZone(player: any, broadZone: 'Rim' | 'Paint' | 'Mid' | '3PT'): string {
    const rand = Math.random();
    if (broadZone === 'Mid') {
        if (rand < 0.33) return 'zone_mid_l';
        if (rand < 0.66) return 'zone_mid_c';
        return 'zone_mid_r';
    }
    if (broadZone === '3PT') {
        if (rand < 0.15) return 'zone_c3_l';
        if (rand < 0.35) return 'zone_atb3_l';
        if (rand < 0.65) return 'zone_atb3_c';
        if (rand < 0.85) return 'zone_atb3_r';
        return 'zone_c3_r';
    }
    return broadZone === 'Rim' ? 'zone_rim' : 'zone_paint';
}

// For UI projection
export function getProjectedZoneDensity(player: Player) {
    // Simple projection for now
    return {
        rim: 0.4, paint: 0.1,
        midL: 0.1, midC: 0.1, midR: 0.1,
        c3L: 0.05, atb3L: 0.05, atb3C: 0.05, atb3R: 0.05, c3R: 0.05
    };
}
