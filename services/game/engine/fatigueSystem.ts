
import { Player, TacticalSliders } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { FatigueResult } from './types';
import { LivePlayer } from './pbp/pbpTypes';

// --- Legacy / Post-Game Calculation (For Box Score Sim) ---
export function calculateFatigueAndInjury(
    p: Player,
    mp: number,
    sliders: TacticalSliders,
    tacticDrainMult: number,
    isB2B: boolean,
    isStopper: boolean
): FatigueResult {
    const C = SIM_CONFIG.FATIGUE;
    const I = SIM_CONFIG.INJURY;

    const preGameCondition = p.condition !== undefined ? p.condition : 100;
    
    if (mp <= 0) {
        return {
            newCondition: preGameCondition,
            newHealth: p.health,
            fatiguePerfPenalty: 0,
            inGameFatiguePenalty: 0
        };
    }

    // 1. Calculate Stamina Drain
    const staminaFactor = Math.max(0.25, C.DRAIN_BASE - (p.stamina * C.STAMINA_SAVE_FACTOR)); 
    const durabilityFactor = 1 + (80 - p.durability) * C.DURABILITY_FACTOR;
    const baseDrain = mp * staminaFactor * durabilityFactor;
    
    const sliderIntensity = (sliders.pace + sliders.defIntensity + sliders.fullCourtPress) / 15; 
    let drain = baseDrain * sliderIntensity * tacticDrainMult;
    
    // Workload Penalty
    let workloadMult = 1.0;
    if (mp <= 15) workloadMult = 1.0;
    else if (mp <= 25) workloadMult = 1.1;
    else if (mp <= 32) workloadMult = 1.2;
    else if (mp <= 36) workloadMult = 1.35;
    else if (mp <= 40) workloadMult = 1.6;
    else workloadMult = 1.8; 

    drain *= workloadMult;
    
    if (isB2B) drain *= 1.5;
    if (isStopper && mp > 5) drain *= 1.25;

    const newCondition = Math.max(0, Math.floor(preGameCondition - drain));

    // 2. Calculate Injury Risk (Simulated for whole game)
    let newHealth = p.health;
    let injuryType = p.injuryType;
    let returnDate = p.returnDate;

    let injuryRisk = I.BASE_RISK;
    if (newCondition < 20) injuryRisk += I.RISK_CRITICAL_COND;
    else if (newCondition < 40) injuryRisk += 0.03;
    else if (newCondition < 60) injuryRisk += I.RISK_LOW_COND;
    
    injuryRisk *= (1 + (100 - p.durability) / 50); 

    if (Math.random() < injuryRisk) {
        const isSevere = Math.random() > I.SEVERE_INJURY_CHANCE;
        const minorInjuries = ['Ankle Sprain', 'Knee Soreness', 'Back Spasms', 'Calf Strain', 'Groin Tightness', 'Hamstring Tightness'];
        const severeInjuries = ['Hamstring Strain', 'MCL Sprain', 'High Ankle Sprain', 'Calf Strain', 'Bone Bruise', 'Achilles Soreness'];
        
        newHealth = isSevere ? 'Injured' : 'Day-to-Day';
        
        if (isSevere) {
            injuryType = severeInjuries[Math.floor(Math.random() * severeInjuries.length)];
            const days = Math.floor(Math.random() * 21) + 7;
            const rDate = new Date();
            rDate.setDate(rDate.getDate() + days);
            returnDate = rDate.toISOString().split('T')[0];
        } else {
            injuryType = minorInjuries[Math.floor(Math.random() * minorInjuries.length)];
            const days = Math.floor(Math.random() * 4) + 1;
            const rDate = new Date();
            rDate.setDate(rDate.getDate() + days);
            returnDate = rDate.toISOString().split('T')[0];
        }
    }

    return {
        newCondition,
        newHealth,
        injuryType,
        returnDate,
        fatiguePerfPenalty: 0,
        inGameFatiguePenalty: 0
    };
}


// --- [NEW] Incremental Calculation for PbP Engine ---
// Designed to be called every possession (seconds scale)
export function calculateIncrementalFatigue(
    player: LivePlayer,
    secondsPlayed: number,
    sliders: TacticalSliders,
    isB2B: boolean,
    isStopper: boolean
): { drain: number, injuryOccurred: boolean, injuryDetails?: any } {
    
    const C = SIM_CONFIG.FATIGUE;
    const minutes = secondsPlayed / 60;

    // 1. Base Factors (Shared Logic)
    // Stamina: Higher (99) -> Lower Factor (0.25). Lower (50) -> Higher Factor.
    const staminaFactor = Math.max(0.25, C.DRAIN_BASE - (player.attr.stamina * C.STAMINA_SAVE_FACTOR));
    
    // Durability: Higher -> Lower Drain
    const durabilityFactor = 1 + (80 - player.attr.durability) * C.DURABILITY_FACTOR;
    
    // 2. Base Drain for this time slice
    const baseDrain = minutes * staminaFactor * durabilityFactor;

    // 3. Tactical Intensity (Sliders)
    // 1(Low) ~ 10(High). Average 5.
    const sliderIntensity = (sliders.pace + sliders.defIntensity + sliders.fullCourtPress) / 15;
    
    let drain = baseDrain * sliderIntensity;

    // 4. Situational Multipliers
    if (isB2B) drain *= 1.5;
    if (isStopper) drain *= 1.25;

    // 5. [PbP Specific] Real-time Workload Penalty
    // If player is already tired, they drain faster
    if (player.currentCondition < 50) drain *= 1.2;
    if (player.currentCondition < 20) drain *= 1.5;

    // 6. Injury Check (Micro-roll)
    // Probability scaled down to per-second, but weighted heavily by exhaustion
    let injuryOccurred = false;
    let injuryDetails = undefined;

    // Only risk injury if condition is compromised or extreme bad luck
    if (player.currentCondition < 70) {
        const I = SIM_CONFIG.INJURY;
        // Base risk per minute played under load
        let riskPerMinute = I.BASE_RISK * 0.1; // Reduced for gameplay flow
        
        if (player.currentCondition < 20) riskPerMinute *= 5; // Danger zone
        else if (player.currentCondition < 40) riskPerMinute *= 2;

        const currentRisk = riskPerMinute * minutes;

        if (Math.random() < currentRisk) {
            injuryOccurred = true;
            // Generate basic injury details (simplified for PbP)
            const severe = Math.random() > 0.7; // 30% Severe
            injuryDetails = {
                health: severe ? 'Injured' : 'Day-to-Day',
                type: severe ? 'Hamstring Strain' : 'Ankle Sprain'
            };
        }
    }

    return { drain, injuryOccurred, injuryDetails };
}
