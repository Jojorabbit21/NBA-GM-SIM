import type { ContractType, ContractDetail } from '../types/player';
import type { SigningType, FARole } from '../types/fa';

// PlayerDetailView.tsx/NegotiationScreen.tsx가 공유하는 계약 타입 한글 라벨 — 예전엔 두 파일에
// 각자 복사돼 있어서 새 타입 추가 시 한쪽만 갱신되는(드리프트) 문제가 있었다.
// [2026-09-17] 11종 → 4종 재설계 — types/player.ts의 ContractType 주석 참고.
export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
    extension: '연장',
    free_agent: '자유계약',
    rookie_scale: '루키 스케일',
    two_way: '투웨이',
};

// "체결 방식"에서 "예외 조항"으로 개명 + 11종 → 10종 재설계 — types/fa.ts의 SigningType 주석 참고.
export const SIGNING_TYPE_LABEL: Record<SigningType, string> = {
    full_bird: '풀 버드',
    early_bird: '얼리 버드',
    non_bird: '논 버드',
    non_taxpayer_mle: '논택스 MLE',
    taxpayer_mle: '택스페이어 MLE',
    room_mle: '룸 예외',
    biannual_exception: '바이애뉴얼 예외',
    minimum_exception: 'Minimum Salary Exception',
    second_round_exception: '2라운드 픽 예외',
    rookie_scale_exception: '루키 스케일 예외',
};

// [2026-09-17 신규] 계약 유형(ContractType) 하위 세부사항 — extension/free_agent에만 존재.
export const CONTRACT_DETAIL_LABEL: Record<ContractDetail, string> = {
    rookie_extension: '루키 연장',
    rookie_max_extension: '루키 맥스 연장',
    rose_rule_extension: '로즈 룰 연장',
    veteran_extension: '베테랑 연장',
    veteran_max_extension: '베테랑 맥스 연장',
    supermax_extension: '슈퍼맥스 연장',
    general: '일반',
    qualifying_offer: '자격제시(QO)',
};

// 계약 유형별로 선택 가능한 예외 조항 — admin 에디터(pages/PlayerEditorPage.tsx)와
// 멀티플레이어 FA 협상 화면(views/multi/season/MultiNegotiationView.tsx) 둘 다 이 함수로
// "예외 조항" 드롭다운을 필터링한다(부모 select 값으로 자식 옵션을 거르는 기존
// MultiNegotiationView.tsx 패턴을 공용 함수로 승격).
export function getAllowedSigningTypes(contractType: ContractType): SigningType[] {
    switch (contractType) {
        case 'free_agent':
            return [
                'full_bird', 'early_bird', 'non_bird',
                'non_taxpayer_mle', 'taxpayer_mle', 'room_mle',
                'biannual_exception', 'minimum_exception', 'second_round_exception',
            ];
        case 'rookie_scale':
            return ['rookie_scale_exception'];
        case 'extension':
        case 'two_way':
            return [];
    }
}

// 계약 유형별로 선택 가능한 세부사항 — rookie_scale/two_way는 세부사항이 없어 빈 배열
// (호출부가 이 값으로 "세부사항" 행 자체를 숨김).
export function getAllowedContractDetails(contractType: ContractType): ContractDetail[] {
    switch (contractType) {
        case 'extension':
            return [
                'rookie_extension', 'rookie_max_extension', 'rose_rule_extension',
                'veteran_extension', 'veteran_max_extension', 'supermax_extension',
            ];
        case 'free_agent':
            return ['general', 'qualifying_offer'];
        case 'rookie_scale':
        case 'two_way':
            return [];
    }
}

// FA 수요 계산(calcFADemand)이 산출하는 선수의 희망 팀 내 역할(FARole) 한글 라벨 —
// 원래 views/FAView.tsx에 로컬 상수로만 있던 걸(FA_ROLE_LABELS) 공유용으로 옮겨옴.
export const FA_ROLE_LABEL: Record<FARole, string> = {
    lead_guard:   '리드 가드',
    combo_guard:  '콤보 가드',
    '3and_d':     '3&D',
    shot_creator: '득점 창출자',
    stretch_big:  '스트레치 빅',
    rim_big:      '림 프로텍터',
    floor_big:    '플로어 빅',
};

// estimateAcceptProbability()(services/fa/faValuation.ts)가 반환하는 0~1 확률을 사용자에게
// 보여줄 5단계 키워드로 변환 — MultiNegotiationView.tsx(협상 화면 단건)와 MultiFreeAgentView.tsx
// (FA 목록 "가능성" 컬럼, 다건) 둘 다 같은 기준을 써야 해서 공용 유틸로 둠.
export function getAcceptLikelihoodLabel(probability: number): { text: string; color: string } {
    if (probability >= 0.8) return { text: '매우 높음', color: 'text-emerald-400' };
    if (probability >= 0.6) return { text: '높음',      color: 'text-lime-400' };
    if (probability >= 0.4) return { text: '보통',      color: 'text-amber-400' };
    if (probability >= 0.2) return { text: '어려움',    color: 'text-orange-400' };
    return { text: '매우 어려움', color: 'text-red-400' };
}
