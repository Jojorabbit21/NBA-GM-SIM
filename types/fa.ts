import type { Player, PlayerContract } from './player';

// FA valuation role (7 market roles for salary estimation)
export type FARole =
    | 'lead_guard'
    | 'combo_guard'
    | '3and_d'
    | 'shot_creator'
    | 'stretch_big'
    | 'rim_big'
    | 'floor_big';

// Contract exception clauses ("예외 조항") — [2026-09-17] "체결 방식"에서 개명 + 11종 →
// 10종 재설계. 'cap_space'는 폐기(모든 계약이 기본적으로 캡스페이스를 쓰고, 부족할 때만
// 예외를 쓰는 것이므로 signingType이 undefined인 상태 자체가 "캡스페이스로 체결"을 뜻함).
// 'rookie_scale'/'two_way'는 ContractType으로 이동(계약의 구조이지 예외 조항이 아니었음).
// 계약 유형(ContractType)에 따라 허용되는 예외 조항이 다름 — utils/contractLabels.ts의
// getAllowedSigningTypes() 참고: extension/two_way는 없음, rookie_scale은
// rookie_scale_exception 하나뿐, free_agent만 아래 9종 전부 허용.
export type SigningType =
    | 'full_bird'              // Full Bird Rights (teamTenure >= 3)
    | 'early_bird'             // Early Bird Rights (teamTenure == 2)
    | 'non_bird'                // Non-Bird Rights (teamTenure == 1)
    | 'non_taxpayer_mle'       // Non-Taxpayer MLE ($14.104M, 1차 에이프런 미만)
    | 'taxpayer_mle'           // Taxpayer MLE ($5.685M, 1~2차 에이프런 사이)
    | 'room_mle'               // Room Exception — 캡스페이스로 서명한 팀이 잔여 캡 소진 후
                                // 소액 추가 예외로 한 명 더 데려올 때 씀(~$8M, 2년)
    | 'biannual_exception'     // Bi-Annual Exception (~$4.516M, 비납세자, 2시즌에 1번)
    | 'minimum_exception'      // Minimum Salary Exception (YOS별 미니멈, 항상 가능)
    | 'second_round_exception' // Second-Round Pick Exception — 자팀이 드래프트한 2라운드 픽
                                // 재계약 시 캡 초과 가능 (최대 4년, 연봉 상한은 리그 평균연봉 수준)
    | 'rookie_scale_exception';// Rookie Scale Exception — 1라운드 픽 4년 루키스케일 계약
                                // 체결 시 캡 초과분에 적용(계약 유형 자체는 ContractType의
                                // 'rookie_scale'이 담당, 이건 그 계약의 캡 처리 방식).

// Per-role league supply/demand metrics
export interface MarketCondition {
    roleSupply: number;   // FA 후보 중 해당 롤 선수 수
    roleDemand: number;   // 해당 롤이 부족한 팀 수 (리그 하위 25%)
    ratio: number;        // demand / supply
}

// FA salary demand result (per player)
export interface FADemandResult {
    askingSalary: number;     // 협상 시작가 (openingAsk)
    walkAwaySalary: number;   // 이 이하면 무조건 거절
    targetSalary: number;     // 내부 목표가
    askingYears: number;
    // [2026-09-17] 희망 변동률(%) — financialAmbition이 높을수록 매년 연봉이 오르는
    // 상향식 구조를 원함(0~8%, CBA Bird류 변동률 상한과 동일 축). calcDeclineAversionPenalty
    // (하향식 계약 거부감)와 같은 축(financialAmbition)이라 두 값이 서로 어긋나지 않음.
    // 옵셔널인 이유: calcFADemand()는 항상 채우지만, services/fa/faMarketBuilder.ts(싱글
    // 플레이어)가 evaluateFAOffer() 호출용으로 FADemandResult 모양을 즉석에서 만드는
    // 3곳은 이 값을 안 쓰므로(raisePercent/financialAmbition을 evaluateFAOffer에 안
    // 넘김 — declinePenalty가 애초에 발동 안 함) 굳이 채울 필요가 없다.
    askingRaisePercent?: number;
    // [2026-09-17] 변동률 최저선(%) — walkAwaySalary와 동일한 "히든 트레잇" 성격(화면에
    // 노출하지 않고 판정 로직 내부 비교용으로만 사용). calcDeclineAversionPenalty가 이
    // 값을 "거부감이 최대치에 도달하는 하락 폭" 기준점으로 써서, financialAmbition이
    // 낮은 선수는 훨씬 가파른 하향식까지 용인하고(walkAway가 -8%에 가까움), 높은 선수는
    // 살짝만 하향해도 곧바로 최대 거부감에 도달하도록(walkAway가 0%에 가까움) 만든다.
    walkAwayRaisePercent?: number;
    // [2026-09-17] 하향식 계약 거부감(calcDeclineAversionPenalty)에 나이/직전 시즌 성적을
    // 추가 반영하기 위한 히든 트레잇 2종(둘 다 0~1, 값이 클수록 하향식을 더 잘 받아들임).
    // 화면에 노출하지 않음 — walkAwayRaisePercent와 동일하게 판정 로직 내부 비교용.
    // declineAgeTolerance: 27세 미만이면 0, 27~35세 구간에서 선형 증가, 35세 이상이면 1
    // (나이 많을수록 하향식에 관대). declinePerfTolerance: 직전 시즌 롤 스코어(roleScore,
    // 0~100 백분위)가 50(평균) 이상이면 0, 낮을수록(부진할수록) 1에 가까워짐 — "직전
    // 시즌 성적이 좋지 않았던 경우 하향식을 더 잘 받아들인다"는 요청 반영. 우선순위는
    // 나이 > 직전 시즌 성적 > 재정적 야망 > 우승욕(calcDeclineAversionPenalty 주석 참고).
    declineAgeTolerance?: number;
    declinePerfTolerance?: number;
    marketValueScore: number;
    faRole: FARole;
}

export interface FAUserOffer {
    years: number;
    salary: number;
    offeredAt: string;
}

export interface FAMarketEntry {
    playerId: string;
    prevTeamId?: string;   // FA 등록 직전 소속팀 ID (Bird Rights 판정용)
    prevTeamTenure?: number; // Bird Rights 판정용 — teamTenure 리셋 전 값 (계약 만료 선수)
    isBuyout?: boolean;    // 방출(waive/buyout/stretch) 출신 여부 — 에이프런 영입 제한 적용

    // 선수 요구 조건 (FA 시장 개막 시 계산, 고정)
    askingYears: number;
    askingSalary: number;     // openingAsk (협상 시작가)
    walkAwaySalary: number;   // 최저 수락선
    marketValueScore: number; // 내부 평가 점수 (표시용)
    faRole: FARole;

    // 경쟁 상황 (표시용)
    interestedTeamIds: string[];

    // 유저 오퍼
    userOffer?: FAUserOffer;

    // RFA 관련
    isRFA?: boolean;           // 1라운드 루키 QO 텐더 시 true
    qualifyingOffer?: number;  // QO 텐더 금액
    originalTeamId?: string;  // RFA 원소속팀 ID (매칭 권한 판정용)

    // 상태
    status: 'available' | 'pending_match' | 'signed' | 'withdrawn';
    signedTeamId?: string;
    signedYears?: number;
    signedSalary?: number;
}

// 오퍼시트 — RFA 원소속팀 매칭 대기 중인 계약
export interface PendingOfferSheet {
    id: string;
    playerId: string;
    offeringTeamId: string;     // 오퍼시트를 제출한 팀
    originalTeamId: string;     // 매칭 권한을 가진 원소속팀
    salary: number;
    years: number;
    contract: PlayerContract;
    signingType?: SigningType;  // 비어있으면 캡 스페이스로 체결된 오퍼시트
    submittedDate: string;
    matchDeadline: string;      // submittedDate + 3일
}

export interface LeagueFAMarket {
    openDate: string;
    closeDate: string;
    entries: FAMarketEntry[];
    usedMLE: Record<string, boolean>;  // teamId → MLE 사용 여부
    players?: Player[];                // FA 후보 전체 선수 객체 (faPlayerMap 구성용)
    pendingOfferSheets?: PendingOfferSheet[];  // 매칭 대기 중인 RFA 오퍼시트
}
