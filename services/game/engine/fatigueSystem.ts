
import { Player, TacticalSliders } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { FatigueResult } from './types';

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
    
    // Default response if no minutes played
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
    else workloadMult = 1.8; // 40+ min (Overwork)

    drain *= workloadMult;
    
    // Back-to-Back Penalty
    if (isB2B) {
        drain *= 1.5;
    }

    // Stopper Penalty
    if (isStopper && mp > 5) drain *= 1.25;

    const newCondition = Math.max(0, Math.floor(preGameCondition - drain));

    // 2. Calculate Injury Risk
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

    // 3. Performance Penalties
    // In-game fatigue (getting tired during the game)
    const intensityFactor = 1 + (sliders.defIntensity - 5) * 0.05 + (sliders.fullCourtPress - 5) * 0.05;
    const inGameFatiguePenalty = Math.max(0, (mp - (p.stamina * 0.4))) * 0.01 * intensityFactor; 
    
    // Pre-game fatigue (starting tired)
    let fatiguePerfPenalty = 0;
    if (preGameCondition < 40) fatiguePerfPenalty = C.FATIGUE_PENALTY_HIGH; 
    else if (preGameCondition < 60) fatiguePerfPenalty = C.FATIGUE_PENALTY_MED;
    else if (preGameCondition < 80) fatiguePerfPenalty = C.FATIGUE_PENALTY_LOW;

    return {
        newCondition,
        newHealth,
        injuryType,
        returnDate,
        fatiguePerfPenalty,
        inGameFatiguePenalty
    };
}
