
import { LivePlayer } from './pbpTypes';

// ==========================================================================================
//  ARCHETYPE SYSTEM
//  Calculates Role Suitability Scores (0-100+) based on attributes & CURRENT CONDITION.
// ==========================================================================================

export interface ArchetypeRatings {
    // Basic
    handler: number;    
    spacer: number;     
    driver: number;     
    screener: number;   
    roller: number;     
    popper: number;     
    rebounder: number;  

    // Advanced (Requested)
    postScorer: number; // Low post scoring (Strength + Post Moves)
    isoScorer: number;  // 1-on-1 creation (Handling + Agility + Shooting)
    connector: number;  // High IQ, Hustle, Passing (Glue guy)
    perimLock: number;  // Lockdown Perimeter Defense
    rimProtector: number; // Anchor Defense
}

/**
 * Calculates all archetype scores for a given player based on attributes AND fatigue.
 * 
 * @param attr - The player's attribute object
 * @param condition - Current stamina condition (0-100). Fatigue reduces effectiveness.
 */
export function calculatePlayerArchetypes(attr: LivePlayer['attr'], condition: number = 100): ArchetypeRatings {
    
    // Fatigue Multiplier: 
    // 100-90 condition = 1.0 (No penalty)
    // 50 condition = 0.8 (20% penalty to ratings)
    // 0 condition = 0.5 (50% penalty)
    const fatigueFactor = Math.max(0.5, 0.5 + (condition * 0.005));

    // Helper to apply fatigue
    const getVal = (val: number) => val * fatigueFactor;

    // Helper for 3PT average (Approximation from 'out' if specifics missing, 
    // but typically we want specific stats. Assuming 'out' maps roughly to shooting ability in simplified attr)
    // Note: LivePlayer.attr is simplified. For deep calculation, we map specific stats in main.ts
    
    const threeAvg = attr.threeVal; // Mapped in main.ts
    
    // Normalize Height/Weight for internal calc (approximate 0-100 scale)
    const normHeight = Math.max(0, (attr.height - 185) * 3);
    const normWeight = Math.max(0, (attr.weight - 80) * 1.6);

    return {
        // 1. Handler (Handling + Pass IQ + Pass Vision + Pass Accuracy)
        handler: getVal(
            (attr.handling  * 0.30) +
            (attr.passIq    * 0.25) +
            (attr.passVision * 0.25) +
            (attr.passAcc   * 0.20)
        ),

        // 2. Spacer (3PT + Shot IQ + Off Consist)
        spacer: getVal(
            (threeAvg * 0.60) + 
            (attr.shotIq * 0.25) + 
            (attr.offConsist * 0.15)
        ),

        // 3. Driver (Speed + Agility + Vertical + Finishing)
        driver: getVal(
            (attr.speed * 0.20) + 
            (attr.agility * 0.15) + 
            (attr.vertical * 0.10) + 
            (attr.ins * 0.35) + // Inside scoring composite
            (attr.mid * 0.20)
        ),

        // 4. Screener (Strength + Height + Weight) - Less affected by fatigue
        screener: getVal(
            (attr.strength * 0.40) + 
            (normHeight * 0.30) + 
            (normWeight * 0.30)
        ),

        // 5. Roller (Finishing + Vertical + Speed)
        roller: getVal(
            (attr.ins * 0.40) + 
            (attr.vertical * 0.30) + 
            (attr.speed * 0.30)
        ),

        // 6. Popper (3PT + Shot IQ)
        popper: getVal(
            (threeAvg * 0.70) + 
            (attr.shotIq * 0.30)
        ),

        // 7. Rebounder (Off Reb + Hustle + Vertical)
        rebounder: getVal(
            (attr.reb * 0.70) + // Using general reb attr for simplicity
            (attr.hustle * 0.15) + 
            (attr.vertical * 0.15)
        ),

        // --- NEW ---

        // 8. Post Scorer (Post Play + Strength + Inside)
        postScorer: getVal(
            (attr.ins * 0.50) + // 'ins' includes post play in aggregation
            (attr.strength * 0.30) + 
            (attr.hands * 0.20)
        ),

        // 9. Iso Creator (Handling + Mid + Speed + Agility)
        isoScorer: getVal(
            (attr.handling * 0.25) + 
            (attr.mid * 0.25) + 
            (attr.speed * 0.25) + 
            (attr.agility * 0.25)
        ),

        // 10. Connector (Pass IQ + Help Def + Hustle)
        connector: getVal(
            (attr.passIq * 0.30) + 
            (attr.helpDefIq * 0.20) + 
            (attr.hustle * 0.30) + 
            (attr.hands * 0.20)
        ),

        // 11. Perimeter Lock (Per Def + Agility + Steal)
        perimLock: getVal(
            (attr.perDef * 0.50) + 
            (attr.agility * 0.25) + 
            (attr.stl * 0.25)
        ),

        // 12. Rim Protector (Block + Int Def + Vertical + Height)
        rimProtector: getVal(
            (attr.blk * 0.35) + 
            (attr.intDef * 0.35) + 
            (attr.vertical * 0.15) + 
            (normHeight * 0.15)
        )
    };
}
