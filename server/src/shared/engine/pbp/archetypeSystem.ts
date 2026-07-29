
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

    const fatigueFactor = Math.max(0.5, 0.5 + (condition * 0.005));

    const getVal = (val: number) => val * fatigueFactor;

    const threeAvg = attr.threeVal;

    const normHeight = Math.max(0, (attr.height - 185) * 3);
    const normWeight = Math.max(0, (attr.weight - 80) * 1.6);

    // 아래 11개는 archetypesEnabled 토글과 무관하게 항상 실계산한다 — playTypes.ts의
    // 액터/패서 선택뿐 아니라 미스매치 판정(flowEngine.ts의 offSkill/defSkill)과 헬프 디펜스 블락
    // 보너스(possessionHandler.ts의 rimProtector 임계값 체크)가 이 값들에 의존하는데, disabled 시
    // 전부 50으로 뭉개지면 이 기능들이 사실상 죽어있는 상태가 된다(2026-07-28 확인). rebounder는
    // 엔진 어디서도 소비되지 않는 dead code라 삭제함(2026-07-28) — 실제 리바운드 선정은
    // reboundLogic.ts가 raw 능력치를 직접 사용.

    const handler = getVal(
        (attr.handling  * 0.30) +
        (attr.passIq    * 0.25) +
        (attr.passVision * 0.25) +
        (attr.passAcc   * 0.20)
    );

    const spacer = getVal(
        (threeAvg * 0.60) +
        (attr.shotIq * 0.25) +
        (attr.offConsist * 0.15)
    );

    const driver = getVal(
        (attr.speed * 0.20) +
        (attr.agility * 0.15) +
        (attr.vertical * 0.10) +
        (attr.ins * 0.35) +
        (attr.mid * 0.20)
    );

    const screener = getVal(
        (attr.strength * 0.40) +
        (normHeight * 0.30) +
        (normWeight * 0.30)
    );

    const roller = getVal(
        (attr.ins * 0.40) +
        (attr.vertical * 0.30) +
        (attr.speed * 0.30)
    );

    const popper = getVal(
        (threeAvg * 0.70) +
        (attr.shotIq * 0.30)
    );

    const postScorer = getVal(
        (attr.ins * 0.50) +
        (attr.strength * 0.30) +
        (attr.hands * 0.20)
    );

    const isoScorer = getVal(
        (attr.handling * 0.25) +
        (attr.mid * 0.25) +
        (attr.speed * 0.25) +
        (attr.agility * 0.25)
    );

    const connector = getVal(
        (attr.passIq * 0.30) +
        (attr.helpDefIq * 0.20) +
        (attr.hustle * 0.30) +
        (attr.hands * 0.20)
    );

    const perimLock = getVal(
        (attr.perDef * 0.50) +
        (attr.agility * 0.25) +
        (attr.stl * 0.25)
    );

    const rimProtector = getVal(
        (attr.blk * 0.35) +
        (attr.intDef * 0.35) +
        (attr.vertical * 0.15) +
        (normHeight * 0.15)
    );

    return {
        handler, spacer, driver, screener, roller, popper,
        postScorer, isoScorer, connector, perimLock, rimProtector,
    };
}
