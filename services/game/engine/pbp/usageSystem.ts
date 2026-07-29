
import { LivePlayer, TeamState } from './pbpTypes';
import { PlayType } from '../../../../types';
import { PLAY_TYPE_USAGE_WEIGHTS } from '../../config/usageWeights';

// ==========================================================================================
//  👑 USAGE PRIORITY SYSTEM (옵션 시스템)
//  코트 위 5명의 선수에게 1~5옵션 순위를 매기고, 플레이 유형에 따라 볼 소유 확률을 조정합니다.
// ==========================================================================================

/**
 * 선수의 순수한 '공격력(Scoring Gravity)'을 계산합니다.
 * 이 점수가 높은 순서대로 1~5옵션이 정해집니다.
 *
 * [2026-07-28] mentality(offConsist/shotIq)와 fatigueFactor(체력)를 의도적으로 제외함 — 이 둘은
 * flowEngine.ts의 히트레이트 계산에 이미 독립적으로 반영되고 있어(shotIqNoise/consistNoise,
 * fatigueOff 등) gravity에도 넣으면 "볼을 못 받는 것"과 "넣지를 못하는 것"이 이중으로 겹쳐
 * 짓눌리는 문제가 있었음. 체력이 빠져도 옵션 순위(볼을 받는 빈도)는 유지되고, 그 대신 실제로 쏜
 * 슛의 성공률만 flowEngine.ts의 fatigueOff로 하락하는 게 의도된 동작.
 *
 * [2026-07-29] 존 정의를 zoneAvg(ins*0.4+out*0.3+mid*0.2+ft*0.1) → peak/secondary 동적 가중으로
 * 전면 교체. 주의: 아래 insZone/outZone은 p.attr.ins/p.attr.out(dataMapper.ts 계산값 — hands 포함,
 * shotIq/offConsist 혼합 등 그라비티와 무관한 범용 정의)과 이름만 비슷할 뿐 다른 값이다. 그라비티
 * 전용으로 closeShot/layup/dunk/postPlay(순수 인사이드)와 midRange+3점 서브존 평균(순수 아웃사이드)만
 * 다시 조합해 mentality/hands 혼입을 제거했다. p.attr.ins/out은 OVR 등 다른 계산에 계속 그대로 쓰이므로
 * 여기서 건드리지 않는다.
 *   - 기존 zoneAvg(고정 0.4/0.3/0.2/0.1 평균)는 "한쪽 zone만 압도적인 선수"를 구조적으로 저평가했다
 *     (예: BIG LEAGUE TEST 6 실측 — 하킴 올라주원 out=52라 zoneAvg에서 손해를 봐서, 밸런스형인
 *     빈스 카터보다 옵션 순위가 낮게 나옴). peak(강한 zone)을 0.7, secondary(약한 zone)를 0.3으로
 *     동적 가중해 편식형 득점원이 정당한 순위를 받도록 함.
 *   - ovrGate 추가 — zone 스탯 하나만 튀어도(예: 마누 지노빌리, 조 존슨) 종합 기량과 무관하게 최상위권에
 *     몰리는 문제(320명 중 74명이 99 이론값에 도달)를 막기 위해 종합 OVR로 최종값을 곱연산 억제.
 *     clamp((ovr-65)/30, 0.5, 1.15) — OVR 65면 절반, OVR 95 이상이면 원본 그대로/소폭 증폭.
 *   - systemBonus를 비대칭(기울어진 쪽 zone이 70 넘으면 보너스만, 반대쪽은 페널티 없음) →
 *     tilt*(insZone-outZone)*0.15 대칭형으로 교체. 비대칭 구조는 ins/out 둘 다 70+인 투웨이
 *     스코어러(예: 앤서니 데이비스)가 슬라이더=5(밸런스)에서 오히려 최저점을 찍는 골짜기를 만들었음
 *     (양쪽 다 보너스는 받고 페널티는 없어서). 대칭형은 slider=5에서 항상 정확히 0이고, 선수의 실제
 *     강점 방향과 전술이 어긋나면 페널티를 줘서 골짜기를 제거.
 *   - 99 하드캡 제거 — getTeamOptionRanks()는 순위(정렬 순서)만 쓰므로 캡이 있으나 없으나 무관하고,
 *     오히려 두 선수가 동시에 99에 닿으면 동점이 되어 정렬이 뭉개지는 부작용이 있었다(밀워키 하킴/카터
 *     사례, 캡 때문에 배열 순서로 우연히 카터가 항상 위로 감). getTopPlayerGravity()가 먹이는 Star
 *     Gravity 부스트(possessionHandler.ts)도 자체적으로 Math.min(0.30, ...)로 topGravity=83부터
 *     이미 saturate되어 99 캡이 실질적 역할을 한 적이 없었음(확인 완료) — 캡 제거로 인한 부작용 없음.
 *   - 320명 전체 리그(BIG LEAGUE TEST 6) 실측 검증: raw≥99 도달 29명(전부 OVR 87+ 스타/레전드),
 *     중앙값 60.1, p90 98.1 — Star Gravity 부스트 임계값(63/83, possessionHandler.ts:366)은 이
 *     분포와 여전히 합리적으로 맞아떨어져(63 미만 57%, 83 이상 19%) 별도 재조정 없이 유지.
 */
function calculateScoringGravity(p: LivePlayer, insideOut: number): number {
    const a = p.attr;
    // 그라비티 전용 zone — p.attr.ins/out과는 다른 값 (위 docstring 참고)
    const insZone = (a.closeShot + a.layup + a.dunk + a.postPlay) / 4;
    const threeAvg = (a.threeCorner + a.three45 + a.threeTop) / 3;
    const outZone = (a.mid + threeAvg) / 2;

    const peak = Math.max(insZone, outZone);
    const secondary = Math.min(insZone, outZone);
    const peakBase = (peak * 0.7) + (secondary * 0.3) + (a.ft * 0.1);
    const dominanceBonus = Math.max(0, peak - 80) * 1.0;

    const tilt = (5 - insideOut) / 5;
    const systemBonus = tilt * (insZone - outZone) * 0.15;

    const ovrGate = Math.max(0.5, Math.min(1.15, (p.ovr - 65) / 30));
    return (peakBase + dominanceBonus + systemBonus) * ovrGate;
}

/**
 * 현재 코트 위에 있는 팀원들의 옵션 순위를 매깁니다.
 * @returns Map<PlayerID, OptionRank(1~5)>
 */
export function getTeamOptionRanks(team: TeamState): Map<string, number> {
    const rankMap = new Map<string, number>();
    const insideOut = team.tactics.sliders.insideOut;

    // 점수 기준으로 내림차순 정렬
    const sortedPlayers = [...team.onCourt].sort((a, b) => {
        return calculateScoringGravity(b, insideOut) - calculateScoringGravity(a, insideOut);
    });

    // 순위 할당 (1위 ~ 5위)
    sortedPlayers.forEach((p, index) => {
        rankMap.set(p.playerId, index + 1);
    });

    return rankMap;
}

/**
 * 현재 코트 위 1옵션의 Scoring Gravity를 반환합니다.
 * possessionHandler에서 Star Gravity boost 계산에 사용.
 */
export function getTopPlayerGravity(team: TeamState): number {
    if (team.onCourt.length === 0) return 0;
    const insideOut = team.tactics.sliders.insideOut;
    return Math.max(...team.onCourt.map(p => calculateScoringGravity(p, insideOut)));
}

/**
 * 플레이 타입과 옵션 순위에 따른 최종 멀티플라이어를 반환합니다.
 */
export function getContextualMultiplier(
    playerRank: number, 
    playType: PlayType
): number {
    // 1~5위 범위를 벗어나면 5위로 간주
    const safeRank = Math.max(1, Math.min(5, playerRank));
    const weights = PLAY_TYPE_USAGE_WEIGHTS[playType];

    if (!weights) return 1.0;

    // 배열 인덱스는 0부터 시작하므로 rank - 1
    return weights[safeRank - 1];
}
