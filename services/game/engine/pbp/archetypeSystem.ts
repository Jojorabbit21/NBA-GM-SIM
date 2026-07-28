
import { LivePlayer } from './pbpTypes';

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
export function calculatePlayerArchetypes(attr: LivePlayer['attr'], condition: number = 100, archetypesEnabled?: boolean): ArchetypeRatings {

    // archetypesEnabled가 명시적으로 전달되면 그 값 사용, 아니면 모듈 기본값
    const disabled = archetypesEnabled !== undefined ? !archetypesEnabled : ARCHETYPES_DISABLED;

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

    // rebounder를 제외한 11개는 archetypesEnabled 토글과 무관하게 항상 실계산한다 — playTypes.ts의
    // 액터/패서 선택뿐 아니라 미스매치 판정(flowEngine.ts의 offSkill/defSkill)과 헬프 디펜스 블락
    // 보너스(possessionHandler.ts의 rimProtector 임계값 체크)가 이 값들에 의존하는데, disabled 시
    // 전부 50으로 뭉개지면 이 기능들이 사실상 죽어있는 상태가 된다(2026-07-28 확인). rebounder는
    // 엔진 어디서도 소비되지 않는 dead code라 리바운드 로직 재검토와 함께 별도로 다루기로 하고
    // 이번엔 예외로 남긴다.

    // 1. Handler (Handling + Pass IQ + Pass Vision + Pass Accuracy)
    const handler = getVal(
        (attr.handling  * 0.30) +
        (attr.passIq    * 0.25) +
        (attr.passVision * 0.25) +
        (attr.passAcc   * 0.20)
    );

    // 2. Spacer (3PT + Shot IQ + Off Consist)
    const spacer = getVal(
        (threeAvg * 0.60) +
        (attr.shotIq * 0.25) +
        (attr.offConsist * 0.15)
    );

    // 3. Driver (Speed + Agility + Vertical + Finishing)
    const driver = getVal(
        (attr.speed * 0.20) +
        (attr.agility * 0.15) +
        (attr.vertical * 0.10) +
        (attr.ins * 0.35) + // Inside scoring composite
        (attr.mid * 0.20)
    );

    // 4. Screener (Strength + Height + Weight) - Less affected by fatigue
    const screener = getVal(
        (attr.strength * 0.40) +
        (normHeight * 0.30) +
        (normWeight * 0.30)
    );

    // 5. Roller (Finishing + Vertical + Speed)
    const roller = getVal(
        (attr.ins * 0.40) +
        (attr.vertical * 0.30) +
        (attr.speed * 0.30)
    );

    // 6. Popper (3PT + Shot IQ)
    const popper = getVal(
        (threeAvg * 0.70) +
        (attr.shotIq * 0.30)
    );

    // 7. Rebounder (Off Reb + Hustle + Vertical) — dead code, 토글 그대로 유지 (별도 검토 예정)
    const rebounder = disabled ? 50 : getVal(
        (attr.reb * 0.70) + // Using general reb attr for simplicity
        (attr.hustle * 0.15) +
        (attr.vertical * 0.15)
    );

    // 8. Post Scorer (Post Play + Strength + Inside)
    const postScorer = getVal(
        (attr.ins * 0.50) + // 'ins' includes post play in aggregation
        (attr.strength * 0.30) +
        (attr.hands * 0.20)
    );

    // 9. Iso Creator (Handling + Mid + Speed + Agility)
    const isoScorer = getVal(
        (attr.handling * 0.25) +
        (attr.mid * 0.25) +
        (attr.speed * 0.25) +
        (attr.agility * 0.25)
    );

    // 10. Connector (Pass IQ + Help Def + Hustle)
    const connector = getVal(
        (attr.passIq * 0.30) +
        (attr.helpDefIq * 0.20) +
        (attr.hustle * 0.30) +
        (attr.hands * 0.20)
    );

    // 11. Perimeter Lock (Per Def + Agility + Steal)
    const perimLock = getVal(
        (attr.perDef * 0.50) +
        (attr.agility * 0.25) +
        (attr.stl * 0.25)
    );

    // 12. Rim Protector (Block + Int Def + Vertical + Height)
    const rimProtector = getVal(
        (attr.blk * 0.35) +
        (attr.intDef * 0.35) +
        (attr.vertical * 0.15) +
        (normHeight * 0.15)
    );

    return {
        handler, spacer, driver, screener, roller, popper, rebounder,
        postScorer, isoScorer, connector, perimLock, rimProtector,
    };
}
