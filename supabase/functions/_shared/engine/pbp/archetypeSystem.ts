
import { LivePlayer } from './pbpTypes.ts';

// ==========================================================================================
//  ARCHETYPE SYSTEM
//  Calculates Role Suitability Scores (0-100+) based on attributes & CURRENT CONDITION.
// ==========================================================================================

// 아키타입 기본 비활성화 — SimSettings.archetypesEnabled로 오버라이드 가능
let ARCHETYPES_DISABLED = true;

export interface ArchetypeRatings {
    // Basic
    handler: number;
    spacer: number;
    driver: number;
    screener: number;
    roller: number;
    popper: number;
    rebounder: number;

    // Advanced
    postScorer: number;
    isoScorer: number;
    connector: number;
    perimLock: number;
    rimProtector: number;
}

/**
 * Calculates all archetype scores for a given player based on attributes AND fatigue.
 */
export function calculatePlayerArchetypes(attr: LivePlayer['attr'], condition: number = 100, archetypesEnabled?: boolean): ArchetypeRatings {

    const disabled = archetypesEnabled !== undefined ? !archetypesEnabled : ARCHETYPES_DISABLED;
    if (disabled) {
        return {
            handler: 50, spacer: 50, driver: 50, screener: 50,
            roller: 50, popper: 50, rebounder: 50, postScorer: 50,
            isoScorer: 50, connector: 50, perimLock: 50, rimProtector: 50
        };
    }

    const fatigueFactor = Math.max(0.5, 0.5 + (condition * 0.005));

    const getVal = (val: number) => val * fatigueFactor;

    const threeAvg = attr.threeVal;

    const normHeight = Math.max(0, (attr.height - 185) * 3);
    const normWeight = Math.max(0, (attr.weight - 80) * 1.6);

    return {
        handler: getVal(
            (attr.handling  * 0.30) +
            (attr.passIq    * 0.25) +
            (attr.passVision * 0.25) +
            (attr.passAcc   * 0.20)
        ),

        spacer: getVal(
            (threeAvg * 0.60) +
            (attr.shotIq * 0.25) +
            (attr.offConsist * 0.15)
        ),

        driver: getVal(
            (attr.speed * 0.20) +
            (attr.agility * 0.15) +
            (attr.vertical * 0.10) +
            (attr.ins * 0.35) +
            (attr.mid * 0.20)
        ),

        screener: getVal(
            (attr.strength * 0.40) +
            (normHeight * 0.30) +
            (normWeight * 0.30)
        ),

        roller: getVal(
            (attr.ins * 0.40) +
            (attr.vertical * 0.30) +
            (attr.speed * 0.30)
        ),

        popper: getVal(
            (threeAvg * 0.70) +
            (attr.shotIq * 0.30)
        ),

        rebounder: getVal(
            (attr.reb * 0.70) +
            (attr.hustle * 0.15) +
            (attr.vertical * 0.15)
        ),

        postScorer: getVal(
            (attr.ins * 0.50) +
            (attr.strength * 0.30) +
            (attr.hands * 0.20)
        ),

        isoScorer: getVal(
            (attr.handling * 0.25) +
            (attr.mid * 0.25) +
            (attr.speed * 0.25) +
            (attr.agility * 0.25)
        ),

        connector: getVal(
            (attr.passIq * 0.30) +
            (attr.helpDefIq * 0.20) +
            (attr.hustle * 0.30) +
            (attr.hands * 0.20)
        ),

        perimLock: getVal(
            (attr.perDef * 0.50) +
            (attr.agility * 0.25) +
            (attr.stl * 0.25)
        ),

        rimProtector: getVal(
            (attr.blk * 0.35) +
            (attr.intDef * 0.35) +
            (attr.vertical * 0.15) +
            (normHeight * 0.15)
        )
    };
}
