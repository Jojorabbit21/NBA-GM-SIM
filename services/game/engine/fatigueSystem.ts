
import { Player, TacticalSliders, OffenseTactic, DefenseTactic } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { FatigueResult } from './types';
import { LivePlayer } from './pbp/pbpTypes';

// --- [NEW] Incremental Calculation for PbP Engine ---
// Designed to be called every possession (seconds scale)
export function calculateIncrementalFatigue(
    player: LivePlayer,
    secondsPlayed: number,
    sliders: TacticalSliders,
    isB2B: boolean,
    isStopper: boolean,
    // [New] Need tactics to apply combo penalty
    offTactic?: OffenseTactic,
    defTactic?: DefenseTactic
): { drain: number, injuryOccurred: boolean, injuryDetails?: any } {
    
    const C = SIM_CONFIG.FATIGUE;
    const minutes = secondsPlayed / 60;

    // 1. Base Factors (Focus on Stamina)
    const staminaDiff = 75 - player.attr.stamina;
    const staminaFactor = Math.max(0.5, 1.0 + (staminaDiff * 0.02));
    
    // 2. Base Drain for this time slice
    const baseDrain = minutes * C.DRAIN_BASE * staminaFactor;

    // 3. [UPDATED] Tactical Intensity (Sliders)
    // Pace Slider has exponential impact on fatigue
    // Pace 5 (Base) -> 1.0x
    // Pace 7 -> 1.2x
    // Pace 10 -> 1.8x
    const paceMult = 1.0 + Math.max(0, (sliders.pace - 5) * 0.16);
    
    // Other sliders (Defense, Press)
    const defIntensityMult = 1.0 + ((sliders.defIntensity - 5) * 0.05);
    const pressMult = sliders.fullCourtPress > 5 ? (1.0 + (sliders.fullCourtPress - 5) * 0.1) : 1.0;

    let drain = baseDrain * paceMult * defIntensityMult * pressMult;

    // 4. Situational Multipliers
    if (isB2B) drain *= 1.5;
    if (isStopper) drain *= 1.25;

    // 5. [NEW] The "Run & Chase" Tax
    // Seven Seconds Offense + Man To Man Defense = Exhaustion
    if (offTactic === 'SevenSeconds' && defTactic === 'ManToManPerimeter') {
        drain *= 1.30; // +30% Fatigue
    }

    // 6. [FATIGUE SPIRAL] Progressive Drain based on Current Condition
    // The more tired you are, the faster you get MORE tired.
    const cumulativeFatiguePenalty = 1.0 + Math.max(0, (100 - player.currentCondition) * 0.015);
    drain *= cumulativeFatiguePenalty;

    // 7. Injury Check (Micro-roll)
    let injuryOccurred = false;
    let injuryDetails = undefined;

    if (player.currentCondition < 60) { // Lowered threshold for risk start
        const I = SIM_CONFIG.INJURY;
        let riskPerMinute = I.BASE_RISK * 0.1;
        
        // Durability Modifier for Injury
        const durabilityRiskMult = 1 + ((100 - player.attr.durability) * 0.02);
        riskPerMinute *= durabilityRiskMult;
        
        // High Pace increases injury risk when tired
        if (sliders.pace > 7) riskPerMinute *= 1.5;

        if (player.currentCondition < 20) riskPerMinute *= 8; // Danger zone
        else if (player.currentCondition < 40) riskPerMinute *= 3;

        const currentRisk = riskPerMinute * minutes;

        if (Math.random() < currentRisk) {
            injuryOccurred = true;
            const severe = Math.random() > 0.7; 
            injuryDetails = {
                health: severe ? 'Injured' : 'Day-to-Day',
                type: severe ? 'Hamstring Strain' : 'Ankle Sprain'
            };
        }
    }

    return { drain, injuryOccurred, injuryDetails };
}

/**
 * Recovers condition for bench players.
 * Should be called every simulation tick.
 */
export function recoverBenchPlayers(bench: LivePlayer[], secondsElapsed: number) {
    const minutes = secondsElapsed / 60;
    // Base recovery rate: ~4% per minute
    const baseRecovery = 4.0 * minutes;

    bench.forEach(p => {
        if (p.health === 'Healthy' && p.currentCondition < 100) {
            // Stamina bonus to recovery
            const staminaBonus = (p.attr.stamina - 70) * 0.05 * minutes; 
            const totalRecovery = baseRecovery + Math.max(0, staminaBonus);
            
            p.currentCondition = Math.min(100, p.currentCondition + totalRecovery);

            // Release Deep Recovery Lock if recovered enough
            if (p.needsDeepRecovery && p.currentCondition > 70) {
                p.needsDeepRecovery = false;
            }
        }
    });
}
