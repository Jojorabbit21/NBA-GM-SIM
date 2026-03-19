
import { Player, Team } from '../../types';
import { calculatePlayerOvr, getOVRThreshold } from '../../utils/constants';
import type { TeamTradeState } from '../../types/trade';
import type { GMProfile } from '../../types/gm';
import { TRADE_CONFIG as C } from './tradeConfig';

/**
 * 선수의 트레이드 가용성 점수 (0~1).
 * 1 = 적극 매도, 0 = 절대 불가
 *
 * NTC, 부상, 스타 등 hard block 먼저 확인 후
 * 팀 방향성, 나이/타임라인 불일치, 포지션 과잉 등으로 점수 산정.
 */
export function getPlayerAvailability(
    player: Player,
    team: Team,
    teamState: TeamTradeState,
    gmProfile: GMProfile,
): number {
    const ovr = calculatePlayerOvr(player);
    const sliders = gmProfile.sliders;

    // ── Hard Block (불가) ──
    if (player.contract?.noTrade) return 0;
    if (ovr >= getOVRThreshold('SUPERSTAR')) return 0;

    let score = 0;

    // ── 상승 요인 ──

    // 방향성 기반 기본 성향
    const directionBase: Record<string, number> = {
        winNow: 0.10,
        buyer: 0.15,
        standPat: 0.05,
        seller: 0.30,
        tanking: 0.40,
    };
    score += directionBase[teamState.phase] ?? 0.10;

    // 포지션 과잉 (2명 이상 초과 시)
    const posKey = player.position.split('/')[0];
    const surplus = teamState.surpluses[posKey] ?? 0;
    if (surplus >= 2) score += 0.20;
    else if (surplus >= 1) score += 0.08;

    // 나쁜 만기 계약
    if (player.contractYears <= 1 && ovr < getOVRThreshold('STARTER') && player.salary > 12_000_000) {
        score += 0.20;
    }

    // 타임라인 불일치 (리빌딩팀의 노장)
    if (player.age >= 33 && teamState.timelineAge < 28) {
        score += 0.20;
    } else if (player.age >= 30 && teamState.phase === 'tanking') {
        score += 0.15;
    }

    // 팀 수준 이하 선수
    if (ovr < teamState.strengthNow - 15) {
        score += 0.10;
    }

    // OVR 로스터 순위 하위 (팀 내 13번째 이후)
    const sortedRoster = [...team.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
    const rank = sortedRoster.findIndex(p => p.id === player.id);
    if (rank >= 12) score += 0.10;
    else if (rank >= 9) score += 0.05;

    // ── 하강 요인 ──

    // 팀 내 Top 2~5 선수 (코어/보호 대상)
    if (rank < 2) score -= 0.40;
    else if (rank < 5) score -= 0.20;

    // 스타 선수 보호
    if (ovr >= getOVRThreshold('SUPERSTAR')) score -= 0.50;
    else if (ovr >= getOVRThreshold('STAR')) score -= 0.30;
    else if (ovr >= getOVRThreshold('STARTER')) score -= 0.10;

    // 유스 편향 GM의 유망주 보호
    if (sliders.youthBias >= 8 && player.age <= 22) {
        score -= 0.30;
    } else if (sliders.youthBias >= 6 && player.age <= 23) {
        score -= 0.15;
    }

    // 스타의향 높은 GM의 스타 보호
    if (sliders.starWillingness >= 8 && ovr >= getOVRThreshold('STAR')) {
        score -= 0.30;
    }

    // 부상 (부상 선수는 가치 없어 팔기도 어려움)
    if (player.health === 'Injured') score -= 0.30;

    return Math.max(0, Math.min(1, score));
}
