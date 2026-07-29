
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

    // 아래 11개는 archetypesEnabled 토글과 무관하게 항상 실계산한다 — playTypes.ts의
    // 액터/패서 선택뿐 아니라 미스매치 판정(flowEngine.ts의 offSkill/defSkill)과 헬프 디펜스 블락
    // 보너스(possessionHandler.ts의 rimProtector 임계값 체크)가 이 값들에 의존하는데, disabled 시
    // 전부 50으로 뭉개지면 이 기능들이 사실상 죽어있는 상태가 된다(2026-07-28 확인). rebounder는
    // 엔진 어디서도 소비되지 않는 dead code라 삭제함(2026-07-28) — 실제 리바운드 선정은
    // reboundLogic.ts가 raw 능력치를 직접 사용.

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
    const screenerRaw = (attr.strength * 0.40) + (normHeight * 0.30) + (normWeight * 0.30);
    const screener = getVal(screenerRaw);

    // 5. Roller (Finishing + Vertical + Speed)
    const roller = getVal(
        (attr.ins * 0.40) +
        (attr.vertical * 0.30) +
        (attr.speed * 0.30)
    );

    // 6. Popper (Screener + 45도/탑 3점 — 코너 3점은 픽앤팝 상황에서 나오지 않아 제외)
    // [2026-07-29] 기존 threeAvg*0.7+shotIq*0.3 공식은 순수 슈팅력만 봐서 PG/SG가 1위로 나옴(픽앤팝은
    // 스크린을 세운 빅맨이 팝아웃하는 액션인데 거꾸로였음). screenerRaw(신체 스탯 기반)를 0.6 비중으로
    // 반영해 "스크린을 설 수 있는 스트레치 빅"만 후보가 되도록 함 — playTypes.ts의 PnR_Pop에서 이
    // 값에 C/PF 전용 자격 필터까지 추가로 걸어 SF 이하는 완전히 배제한다.
    const popper = getVal(
        screenerRaw * 0.6 +
        ((attr.three45 + attr.threeTop) / 2) * 0.4
    );

    // 8. Post Scorer (Post Play 중심 + 인사이드 피니시 + 핸즈)
    // [2026-07-29] 기존 ins*0.5+strength*0.3+hands*0.2 공식은 'ins'(layup+dunk+postPlay+drawFoul+hands
    // 평균)에서 postPlay 지분이 1/5뿐이라, 진짜 로우포스트 기술보다 범용 림 피니시(layup/dunk)가 더
    // 크게 반영됐다 — 32 TEST 실측: C/PF 평균 postScorer가 74.4/74.1로 사실상 동률이라 순수 스킬
    // 경쟁으론 센터가 밀리는 원인 중 하나였음. postPlay를 직접 50% 반영하고 (closeShot+layup+dunk)
    // 평균은 30%로 낮춰 일반 인사이드 피니시 비중을 줄임 (playTypes.ts 'PostUp'에서 이 값에 포지션
    // 가중치(constants.ts SIM_CONFIG.POSITION_WEIGHT.POST_UP)를 추가로 곱해 최종 액터를 정함).
    const postScorer = getVal(
        (attr.postPlay * 0.50) +
        (((attr.closeShot + attr.layup + attr.dunk) / 3) * 0.30) +
        (attr.hands * 0.20)
    );

    // 9. Iso Creator (Handling + 종합 스코어링 — peak/secondary 구조)
    // [2026-07-29] 기존 handling+mid+speed+agility(피지컬 50%) 공식은 3점을 아예 반영 안 하고
    // 운동능력 비중이 너무 커서, 하든/릴라드처럼 폭발적이진 않지만 핸들+슈팅으로 아이소를 지배하는
    // 유형이 부당하게 낮게 나왔다(실측: 하든 83.0으로 이 그룹 최하위). 1차로 mid/three/CLD를
    // 고정 비율(0.20/0.60/0.20)로 선형 블렌드했으나, 이러면 골밑 피니시가 압도적인 파워 드라이버형
    // (야니스 97.7, 자이언 93.3)이 3점이 약하다는 이유로 부당하게 낮게 나옴(실측: 야니스 81.4로
    // 르브론 87.3보다 낮음) — 3점 슈팅형과 골밑 파워형 둘 다 "각자의 강점 경로"로 정당하게 평가받도록
    // usageSystem.ts의 calculateScoringGravity와 동일한 peak/secondary 구조로 교체.
    const isoInsideScore = (attr.closeShot + attr.layup + attr.dunk) / 3;
    const isoOutsideScore = (attr.mid * 0.4) + (threeAvg * 0.6);
    const isoPeak = Math.max(isoInsideScore, isoOutsideScore);
    const isoSecondary = Math.min(isoInsideScore, isoOutsideScore);
    const scoringComposite = (isoPeak * 0.7) + (isoSecondary * 0.3);
    const isoScorer = getVal(
        (attr.handling * 0.40) +
        (scoringComposite * 0.60)
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
        handler, spacer, driver, screener, roller, popper,
        postScorer, isoScorer, connector, perimLock, rimProtector,
    };
}
