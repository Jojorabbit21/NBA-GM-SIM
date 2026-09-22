
// 멀티플레이어 UFA/RFA 자격 판정 + QO(Qualifying Offer) 금액 계산 — 순수 함수 모음.
//
// [2026-09-17] 설계 전용 라운드 — plans/mellow-booping-sunbeam.md 참고. 아직 이 파일을
// 실제로 호출하는 트리거(계약 연차 자동 진행/오프시즌 자동화/RPC/UI)는 존재하지 않는다.
// 멀티플레이어는 room_player_state.contract.currentYear가 시즌마다 진행되지 않아(신규
// 서명 시 0으로 고정 후 방치) 계약이 "만료"되는 경로 자체가 지금 구조상 없다 — 이 파일은
// 그 트리거가 붙었을 때 바로 호출 가능하도록 순수 함수로만 판정 로직/공식을 준비해둔다.
//
// 범위: Bird Rights, Two-way→RFA 경로는 의도적으로 제외(합의된 축소 범위). Two-way 계약은
// 호출부가 이 함수들에 넘기기 전에 걸러 항상 UFA로 처리해야 한다.
import type { PlayerContract } from '../../../types/player';
import { calcYOSBounds } from '../../fa/faValuation';

// ─────────────────────────────────────────────────────────────
// 1. RFA 자격 판정
// ─────────────────────────────────────────────────────────────

export type FAEligibility =
    | { status: 'NOT_EXPIRED' }                                      // 계약 진행 중
    | { status: 'UFA' }
    | { status: 'RFA'; path: 'rookie_scale' | 'standard' };

/**
 * 계약이 "자연 만료로 끝났다"는 전제하의 UFA/RFA 판정 — determineFAEligibility()와
 * previewFAStatusAfterContract() 둘 다 이 코어를 공유한다(전자는 실제 만료 후, 후자는
 * 아직 진행 중인 계약의 "만약 이대로 끝나면" 미리보기).
 */
function decideTerminalFAStatus(
    contract: PlayerContract,
    careerYOS: number,
): { status: 'UFA' } | { status: 'RFA'; path: 'rookie_scale' | 'standard' } {
    // [2026-09-17] contract.type의 'rookie_scale'(ContractType)과 이 함수가 반환하는
    // path: 'rookie_scale'(RFA 경로 판별용, 무관한 필드)은 문자열은 같지만 다른 개념이다 —
    // 혼동 방지를 위한 주석. contract.type이 'rookie_scale'이어도 4년이 아니면(예: 수동
    // 편집된 3년짜리 계약) 이 경로가 아니라 표준 YOS≤3 경로로 판정된다.
    if (contract.type === 'rookie_scale' && contract.years.length === 4) {
        return { status: 'RFA', path: 'rookie_scale' };
    }
    if (careerYOS <= 3) {
        return { status: 'RFA', path: 'standard' };
    }
    return { status: 'UFA' };
}

/**
 * 계약 객체 단위로 스코프된 UFA/RFA 판정. 재계약하면 완전히 새 계약 객체(currentYear 0부터
 * 다시 시작)이므로 과거 계약의 흔적은 안 본다 — "루키 옵션 거절 후 재계약해도 이중 RFA 안
 * 됨" 원칙이 자동으로 지켜진다(대화에서 검증한 시나리오).
 *
 * 중요 불변식: 3·4년차 팀옵션이 거절돼 계약이 조기종료된 경우, 그 계약은 currentYear가
 * years.length에 절대 도달하지 못한 채(옵션 거절 시점에 바로 만료 처리되어) 끝나야 한다 —
 * 옵션 거절 처리 로직(트리거 작업 시 구현)이 이 불변식을 지키면, 이 함수는 "자연 만료로
 * currentYear가 years.length에 도달한 경우"만 보게 되어 옵션 거절 UFA 강제 규칙(1라운더
 * 3·4년차 옵션 거절 시 YOS와 무관하게 무조건 UFA)이 별도 분기 없이 자동으로 성립한다.
 */
export function determineFAEligibility(
    contract: PlayerContract,
    careerYOS: number,
): FAEligibility {
    if (contract.currentYear < contract.years.length) {
        return { status: 'NOT_EXPIRED' };
    }
    return decideTerminalFAStatus(contract, careerYOS);
}

/**
 * [화면 표시 전용] 아직 진행 중인 계약이 "이대로 끝까지 간다면" 만료 다음 해에 UFA가 될지
 * RFA 자격을 얻을지 미리 보여준다 — 재정 탭에서 계약 마지막 연도 다음 컬럼에 칩으로 표시할
 * 때 쓴다. 트리거(계약 연차 자동 진행)가 아직 없어 실제 만료를 기다릴 수 없으므로, "지금
 * 시점 기준 careerYOS에 남은 계약 연차를 더하면 만료 시점의 YOS"라는 가정으로 미리 계산한다.
 *
 * 앞으로 남은 연차에 팀옵션이 걸려있어도(예: 루키 3·4년차) 팀이 실제로 행사할지 거절할지는
 * 아직 알 수 없으므로 — 옵션을 전부 행사해 계약이 끝까지 간다고 가정한 "가장 가능성 높은
 * 시나리오"만 보여준다(옵션 거절 조기종료 시나리오까지 미리보기하진 않음 — 과도한 설계).
 *
 * Two-way 계약은 항상 UFA(합의된 축소 범위)라 칩 자체를 안 띄우도록 null을 반환한다 —
 * 호출부에서 null이면 칩을 렌더링하지 않으면 된다.
 */
export function previewFAStatusAfterContract(
    contract: PlayerContract,
    careerYOS: number,
): { status: 'UFA' } | { status: 'RFA'; path: 'rookie_scale' | 'standard' } | null {
    if (contract.type === 'two_way') return null;

    const remainingYears = contract.years.length - contract.currentYear;
    const yosAtExpiry = careerYOS + Math.max(0, remainingYears);
    return decideTerminalFAStatus(contract, yosAtExpiry);
}

// ─────────────────────────────────────────────────────────────
// 2. QO 금액 계산
// ─────────────────────────────────────────────────────────────

/** 표준 경로(YOS≤3, 루키스케일 아님) QO — CBA 135% 룰.
 *  max(직전 연봉 × 1.35, 다음 시즌 최저연봉 + $200,000). "다음 시즌 최저연봉"은
 *  calcYOSBounds(yos, salaryCap).vetMin — [2026-09-22] 이제 utils/minSalaryTable.ts의 YOS별 캡
 *  비율 표에서 나오므로 리그 캡(leagues.salary_cap_amount, 다음 시즌이면 성장률 적용값)을
 *  반드시 넘긴다. 예전엔 캡 없이 호출해 전역 싱글턴(2025-26 캡)에 폴백했었다. */
export function calcStandardQO(prevSalary: number, yos: number, salaryCap: number): number {
    const nextSeasonMin = calcYOSBounds(yos, salaryCap).vetMin;
    return Math.max(prevSalary * 1.35, nextSeasonMin + 200_000);
}

/**
 * 루키스케일 경로 QO% — 픽 순위별 선형보간.
 *
 * 2023 CBA 실측(웹 검색 확인, 2023 드래프트 클래스부터 적용 — 우리 시뮬 현재 시점 기준
 * 전부 해당): 1번픽 QO = 4년차 연봉의 140%, 30번픽 QO = 160%. 공개 자료에서 픽별 정확한
 * 스텝 테이블을 못 찾아 두 끝점 사이를 선형보간으로 근사한다 — 정확한 CBA 표를 구하면 이
 * 함수만 교체하면 되도록 분리해뒀다.
 */
export function rookieScaleQOPercent(pickNumber: number): number {
    const clamped = Math.max(1, Math.min(30, pickNumber));
    return 1.40 + (clamped - 1) * (0.20 / 29); // 1번픽 1.40 ~ 30번픽 1.60
}

export interface SeasonStartCriteriaLine {
    gamesStarted: number;
    minutes: number;
}

/**
 * Starter Criteria: 직전 시즌 41경기+ 선발 OR 2000분+ 출전, 또는 직전 2시즌 평균으로
 * 같은 기준 충족. `lastTwoSeasons[0]`이 가장 최근 시즌.
 *
 * 멀티플레이어는 시즌 롤오버가 아직 없어(league_player_seasons가 항상 빈 배열) 이 함수가
 * 받을 시즌별 스탯 데이터가 실제로는 없다 — 인터페이스만 정의해두고, 데이터가 생기면 바로
 * 연결 가능하게 시즌 단위 games-started/minutes를 파라미터로 받는 순수 함수로 설계했다.
 */
export function meetsStarterCriteria(lastTwoSeasons: SeasonStartCriteriaLine[]): boolean {
    const meetsOne = (s: SeasonStartCriteriaLine) => s.gamesStarted >= 41 || s.minutes >= 2000;

    if (lastTwoSeasons[0] && meetsOne(lastTwoSeasons[0])) return true;
    if (lastTwoSeasons.length >= 2) {
        const avgGS = (lastTwoSeasons[0].gamesStarted + lastTwoSeasons[1].gamesStarted) / 2;
        const avgMin = (lastTwoSeasons[0].minutes + lastTwoSeasons[1].minutes) / 2;
        return avgGS >= 41 || avgMin >= 2000;
    }
    return false;
}

/**
 * 루키스케일 경로 QO 금액. 1~14번픽인데 Starter Criteria 미충족이면 QO가 낮은 쪽(4 YOS
 * 최저연봉 수준)으로 캡된다 — 실측 CBA 규정(문서 15번). 15~30번픽은 이 캡 규정이 적용되지
 * 않는다(픽 순위별 QO%가 이미 낮게 잡혀 있어 별도 하향 규정이 없음).
 */
export function calcRookieScaleQO(
    pickNumber: number,
    year4Salary: number,
    starterCriteriaMet: boolean,
    salaryCap: number,
): number {
    const baseQO = year4Salary * rookieScaleQOPercent(pickNumber);
    if (pickNumber <= 14 && !starterCriteriaMet) {
        // [2026-09-22] 4 YOS 최저연봉 = 리그 캡 × MIN_SALARY_YOS_TABLE 비율(캡 필수 주입)
        const minBase = calcYOSBounds(4, salaryCap).vetMin;
        return Math.min(baseQO, minBase);
    }
    return baseQO;
}
