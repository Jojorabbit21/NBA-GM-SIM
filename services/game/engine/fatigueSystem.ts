
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

    // [Updated] Removed Durability from Drain, Focused on Stamina
    // Stamina 99 -> Factor ~0.6 (Slow drain)
    // Stamina 75 -> Factor ~1.0 (Base drain)
    // Stamina 50 -> Factor ~1.5 (Fast drain)
    // Formula: 1.0 + (75 - Stamina) * 0.02
    const staminaDiff = 75 - p.stamina;
    const staminaFactor = 1.0 + (staminaDiff * 0.02);
    
    const baseDrain = mp * C.DRAIN_BASE * Math.max(0.5, staminaFactor);
    
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

    // 2. Calculate Injury Risk (Durability affects Injury Chance, NOT Drain)
    let newHealth = p.health;
    let injuryType = p.injuryType;
    let returnDate = p.returnDate;

    let injuryRisk = I.BASE_RISK;
    if (newCondition < 20) injuryRisk += I.RISK_CRITICAL_COND;
    else if (newCondition < 40) injuryRisk += 0.03;
    else if (newCondition < 60) injuryRisk += I.RISK_LOW_COND;
    
    // Durability Impact on Injury
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

    // 1. Base Factors (Focus on Stamina)
    // Pivot at Stamina 75. 
    // Higher Stamina reduces drain, Lower Stamina increases drain.
    // Range constraint: Factor cannot go below 0.5 (even for 99 stamina)
    const staminaDiff = 75 - player.attr.stamina;
    const staminaFactor = Math.max(0.5, 1.0 + (staminaDiff * 0.02));
    
    // 2. Base Drain for this time slice
    const baseDrain = minutes * C.DRAIN_BASE * staminaFactor;

    // 3. Tactical Intensity (Sliders)
    // 1(Low) ~ 10(High). Average 5.
    // Higher intensity = Significantly higher drain
    const sliderIntensity = 1 + ((sliders.pace + sliders.defIntensity + sliders.fullCourtPress - 15) * 0.05);
    
    let drain = baseDrain * Math.max(0.5, sliderIntensity);

    // 4. Situational Multipliers
    if (isB2B) drain *= 1.5;
    if (isStopper) drain *= 1.25;

    // 5. [PbP Specific] Real-time Workload Penalty
    // If player is already tired, they drain faster (Death Spiral)
    if (player.currentCondition < 50) drain *= 1.2;
    if (player.currentCondition < 20) drain *= 1.5;

    // 6. Injury Check (Micro-roll)
    // Durability affects INJURY CHANCE, not Drain rate.
    let injuryOccurred = false;
    let injuryDetails = undefined;

    if (player.currentCondition < 70) {
        const I = SIM_CONFIG.INJURY;
        let riskPerMinute = I.BASE_RISK * 0.1;
        
        // Durability Modifier for Injury
        const durabilityRiskMult = 1 + ((100 - player.attr.durability) * 0.02);
        riskPerMinute *= durabilityRiskMult;
        
        if (player.currentCondition < 20) riskPerMinute *= 5; 
        else if (player.currentCondition < 40) riskPerMinute *= 2;

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
