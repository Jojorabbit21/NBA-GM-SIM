// tradeSalaryMatching.ts — CBA 샐러리 매칭(캡/에이프런 구간별 트레이드 제약) 사전 검증.
//
// migrations/add_trade_salary_matching.sql의 check_trade_salary_match() SQL 함수와 반드시
// 동일한 결과를 내야 한다 — 이 모듈은 서버 RPC(respond_trade_offer accept)가 최종 판정을
// 내리기 전에 클라이언트에서 미리 보여주는 경고용이며 강제력이 없다.
//
// 검증된 현행(2023~) CBA 규칙:
//   1. 팀 페이롤 < 캡              → 매칭 불필요, 잔여 캡 스페이스만큼 자유롭게 수신
//   2. 캡 ≤ 페이롤 < 1차 에이프런  → 송신액 기준 3단계 (택스 여부 무관)
//   3. 1차 에이프런 ≤ 페이롤 < 2차 에이프런 → 100% 매칭($250K 여유 없음, aggregation은 허용)
//   4. 페이롤 ≥ 2차 에이프런        → 100% 매칭 + aggregation 금지(기준은 sum이 아니라
//      내보내는 선수 중 가장 큰 한 명의 연봉 — "한 명 보내고 여러 명 받기"는 허용되므로)
//   + [2026-10-01] 최저연봉 예외: 받는 선수 중 최저연봉 계약(isMinimumContractPlayer)은 어느 구간이든
//      매칭 대상에서 제외 — 호출부가 incomingTotal을 sumMatchableIncoming()으로 계산해 넘긴다.
//
// [2026-09-29] 2차 에이프런 실패를 reason 하나로 뭉쳐두면 UI 문구가 전부 "샐러리 매칭 규칙
// 위반"으로만 떴다(사용자 피드백) — 실패 원인을 5가지로 분리해 케이스별 문구를 붙인다.
// 2차 에이프런 구간의 실패는 다시 두 가지로 갈린다: 내보내는 선수가 1명뿐인데 100%를 넘긴
// 경우(apron2_100pct, 1차 에이프런과 동일한 100% 룰이 더 엄격한 환경에서 걸린 것뿐)와, 여러
// 선수를 합쳐야만 실패하는 경우(apron2_aggregation, 진짜 aggregation 금지 룰에 걸린 것) —
// outgoingSalaries.length > 1일 때만 후자.

import { i, eun } from './newsBlurb';
import { formatMoney } from '../../utils/formatMoney';
import type { Player } from '../../types';

/**
 * [2026-10-01] 최저연봉 예외(Minimum Salary Exception) — 최저연봉 계약 선수는 받는 팀의 페이롤 구간과
 * 무관하게 매칭 없이 받을 수 있다(실제 CBA: 1~2년 미니멈 계약은 예외로 영입/트레이드 수령 가능).
 * [2026-10-02] 판정은 계약의 signingType === 'minimum_exception' **하나뿐**. 처음엔 "또는 연봉 ≤ 캡 2.35%"
 * 금액 조건을 안전망으로 뒀지만(standard 모드 스크랩 계약에 플래그가 전혀 없었음), meta_players 실제
 * 계약의 서명 유형을 사용자 검토로 전부 채운 뒤(dev-log 2026-10-01 (3), 2026-10-02) 제거 — 기준이 둘이면
 * 어긋났을 때 어느 쪽이 맞는지 정해야 하고, 레전드 수기 계약($1M 등)이 금액 때문에 예외로 잡히는 부작용도
 * 있었다. 플래그 출처: FA 미니멈 서명(faService), 대체 모드 드래프트 스케일 미니멈급(buildDraftScaleContract),
 * 스크랩 계약 백필. 서버 player_is_minimum_contract()와 동일 규칙. cap 인자는 호출부 호환용으로 남겨둠.
 */
export function isMinimumContractPlayer(player: Player | undefined, _cap?: number): boolean {
    if (!player) return false;
    return player.contract?.signingType === 'minimum_exception';
}

/** 매칭 대상 수신 연봉 합 — 최저연봉 예외 선수를 뺀 나머지 연봉의 합. 받는 팀 입장에서 "매칭해야 하는" 금액. */
export function sumMatchableIncoming(players: (Player | undefined)[], _cap?: number): number {
    return players.reduce((sum, p) => sum + (isMinimumContractPlayer(p) ? 0 : (p?.salary ?? 0)), 0);
}

export interface SalaryMatchThresholds {
    cap: number;
    apron1: number;
    apron1Enabled: boolean;
    apron2: number;
    apron2Enabled: boolean;
}

export type SalaryMatchFailReason = 'cap_space' | 'tiered' | 'apron1' | 'apron2_100pct' | 'apron2_aggregation';

export interface SalaryMatchResult {
    ok: boolean;
    /** 위반 시 어느 규칙에 걸렸는지 — UI 문구 조립용. */
    reason?: SalaryMatchFailReason;
    /** 위반 시 이 트레이드에서 허용되는 최대 수신 연봉(케이스에 따라 없을 수 있음 — aggregation 자체가 금지 룰이라 "한도"가 의미 없는 경우). */
    limit?: number;
}

export function checkSalaryMatch(
    teamPayroll: number,
    outgoingTotal: number,
    incomingTotal: number,
    outgoingSalaries: number[],
    thresholds: SalaryMatchThresholds,
): SalaryMatchResult {
    const { cap, apron1, apron1Enabled, apron2, apron2Enabled } = thresholds;

    if (teamPayroll < cap) {
        const remainingCap = cap - teamPayroll;
        const limit = outgoingTotal + remainingCap;
        return incomingTotal <= limit ? { ok: true } : { ok: false, reason: 'cap_space', limit };
    }

    if (apron2Enabled && teamPayroll >= apron2) {
        const maxOut = outgoingSalaries.length > 0 ? Math.max(...outgoingSalaries) : 0;
        if (incomingTotal <= maxOut) return { ok: true };
        return outgoingSalaries.length > 1
            ? { ok: false, reason: 'apron2_aggregation' }
            : { ok: false, reason: 'apron2_100pct', limit: maxOut };
    }

    if (apron1Enabled && teamPayroll >= apron1) {
        return incomingTotal <= outgoingTotal ? { ok: true } : { ok: false, reason: 'apron1', limit: outgoingTotal };
    }

    let limit: number;
    if (outgoingTotal <= 7_500_000) {
        limit = outgoingTotal * 2 + 250_000;
    } else if (outgoingTotal <= 29_000_000) {
        limit = outgoingTotal + 7_500_000;
    } else {
        limit = outgoingTotal * 1.25 + 250_000;
    }
    return incomingTotal <= limit ? { ok: true } : { ok: false, reason: 'tiered', limit };
}

/** 위반 결과를 한국어 문구로 — reason별로 다른 템플릿(사용자 확정본). */
export function formatSalaryMatchMessage(teamName: string, result: SalaryMatchResult): string {
    switch (result.reason) {
        case 'cap_space':
            return `${teamName}의 캡 스페이스를 초과하여 트레이드가 불가능합니다.`;
        case 'tiered':
            return `${i(teamName)} 받을 수 있는 최대 샐러리는 ${formatMoney(result.limit ?? 0)}입니다.`;
        case 'apron1':
            // [2026-09-29] 이 팀이 "내보내는" 선수를 하나도 안 골랐으면(송신 $0) 100% 매칭
            // 규칙상 한도도 $0 — 다른 선수를 골라도 항상 $0으로 뜨는 게 당연한데, 문구만
            // 보면 버그처럼 보인다는 피드백. 원인을 바로 알 수 있게 힌트를 붙인다.
            return result.limit === 0
                ? `${eun(teamName)} 1차 에이프런을 초과한 팀이라 내보내는 선수 없이는 아무도 받을 수 없습니다 (먼저 내보낼 선수를 선택하세요).`
                : `${eun(teamName)} 1차 에이프런을 초과하여 최대 ${formatMoney(result.limit ?? 0)}까지만 받을 수 있습니다.`;
        case 'apron2_100pct':
            return result.limit === 0
                ? `${eun(teamName)} 2차 에이프런을 초과한 팀이라 내보내는 선수 없이는 아무도 받을 수 없습니다 (먼저 내보낼 선수를 선택하세요).`
                : `${eun(teamName)} 2차 에이프런을 초과하여 100% 매칭(${formatMoney(result.limit ?? 0)})만 가능합니다.`;
        case 'apron2_aggregation':
            return `${eun(teamName)} 2차 에이프런을 초과하여 합산 매칭이 불가능합니다.`;
        default:
            return `${teamName}의 샐러리 매칭 규칙(캡/에이프런) 위반으로 트레이드를 진행할 수 없습니다.`;
    }
}

/**
 * 지금 이 팀이 어느 구간에 있고 그 구간의 매칭 규칙이 뭔지 — 실패했을 때만 뜨는
 * checkSalaryMatch()/formatSalaryMatchMessage()와 달리 항상 표시하는 안내용. 특정 트레이드를
 * 평가하는 게 아니라 "지금 상태에서 이 팀이 트레이드에서 지켜야 하는 조건"을 텍스트 리스트로
 * 설명한다 — 사용자가 선수를 고르기 전에 왜 특정 조합이 막힐지 미리 알 수 있게(1차 에이프런
 * 팀이 아무것도 안 내보내고 받으려다 "최대 $0"에 혼란스러워했던 사례 재발 방지 목적).
 */
export function describeSalaryMatchBracket(teamPayroll: number, thresholds: SalaryMatchThresholds): string[] {
    const { cap, apron1, apron1Enabled, apron2, apron2Enabled } = thresholds;

    if (teamPayroll < cap) {
        const remainingCap = cap - teamPayroll;
        return [
            '캡 이하 팀입니다.',
            `잔여 캡 스페이스 ${formatMoney(remainingCap)}만큼 매칭 없이 자유롭게 받을 수 있습니다.`,
            '최저연봉 예외 계약 선수는 매칭 없이 받을 수 있습니다.',
        ];
    }

    if (apron2Enabled && teamPayroll >= apron2) {
        return [
            '2차 에이프런 초과 팀입니다.',
            '100% 매칭만 가능합니다 — 받는 연봉이 내보내는 연봉을 넘을 수 없습니다.',
            '여러 선수를 합쳐서 매칭하는 것(aggregation)은 금지됩니다 — 내보내는 선수 중 가장 큰 연봉 한 명 기준으로만 매칭할 수 있습니다.',
            '최저연봉 예외 계약 선수는 매칭 없이 받을 수 있습니다.',
        ];
    }

    if (apron1Enabled && teamPayroll >= apron1) {
        return [
            '1차 에이프런 초과 팀입니다.',
            '100% 매칭만 가능합니다 — 받는 연봉이 내보내는 연봉을 넘을 수 없습니다($250K 여유 없음).',
            '최저연봉 예외 계약 선수는 매칭 없이 받을 수 있습니다.',
        ];
    }

    return [
        '캡 스페이스 초과이며 1차 에이프런 미만입니다.',
        '보내는 선수의 연봉이 $7.5M 이하면 "나가는 연봉×2+$250K"까지 받을 수 있습니다.',
        '보내는 선수의 연봉이 $7.5M~$29M이면 "나가는 연봉+$7.5M"까지 받을 수 있습니다.',
        '보내는 선수의 연봉이 $29M을 초과하면 "나가는 연봉×1.25+$250K"까지 받을 수 있습니다.',
        '최저연봉 예외 계약 선수는 매칭 없이 받을 수 있습니다.',
    ];
}
