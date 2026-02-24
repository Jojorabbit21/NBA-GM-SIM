
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
 * - 기본 공격 스탯 (60%)
 * - 멘탈리티/스타성 (40%)
 * - 현재 체력 (Fatigue) 보정 적용
 */
function calculateScoringGravity(p: LivePlayer): number {
    // 1. 기본 공격 스탯 (내외곽 슛 + 자유투)
    const baseOffense = (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);
    
    // 2. 멘탈리티 (공격 적극성/기복/IQ) - 스타성을 결정하는 요소
    const mentality = (p.attr.offConsist * 0.4) + (p.attr.shotIq * 0.4) + (p.attr.pas * 0.2); // [Fix] intangibles -> pas/handling for creation
    
    // 3. 체력 보정 (지치면 옵션 순위에서 밀려남)
    const fatigueFactor = Math.max(0.5, p.currentCondition / 100);

    return (baseOffense * 0.6 + mentality * 0.4) * fatigueFactor;
}

/**
 * 현재 코트 위에 있는 팀원들의 옵션 순위를 매깁니다.
 * @returns Map<PlayerID, OptionRank(1~5)>
 */
export function getTeamOptionRanks(team: TeamState): Map<string, number> {
    const rankMap = new Map<string, number>();

    // 점수 기준으로 내림차순 정렬
    const sortedPlayers = [...team.onCourt].sort((a, b) => {
        return calculateScoringGravity(b) - calculateScoringGravity(a);
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
    return Math.max(...team.onCourt.map(p => calculateScoringGravity(p)));
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
