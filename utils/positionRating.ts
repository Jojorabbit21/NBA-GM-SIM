// positionRating.ts — "포지션 레이팅" 별점. [2026-10-14]
// 리그 전체에서 같은 포지션 선수들 사이의 OVR 백분위를 0.5~5.0 별점(0.5 단위)으로 바꾼다.
// 선수 상세 "포지션 평점"(PlayerDetailView)과 로스터 탭 "포지션 레이팅" 열이 같은 함수를 쓴다.
// 별도 파일인 이유: calculatePlayerOvr가 utils/constants.ts에 있어 ovrUtils.ts에 넣으면 constants ↔ ovrUtils 순환 임포트가 생긴다.
import type { Player } from '../types';
import { calculatePlayerOvr } from './constants';

/**
 * @param player     대상 선수
 * @param allPlayers 비교 풀(리그 전체 로스터 평탄화). 같은 position만 골라 비교한다.
 * @param ovr        대상 선수 OVR을 이미 계산해 뒀으면 전달(선수 상세). 없으면 여기서 계산.
 * @returns 0.5~5.0, 0.5 단위. 비교 풀이 비어 있으면 0.5(본인만 있으면 자기보다 낮은 선수 0명 → 0.5).
 */
export function getPositionStars(player: Player, allPlayers: Player[], ovr?: number): number {
    const mine = ovr ?? calculatePlayerOvr(player);
    let total = 0;
    let below = 0;
    for (const p of allPlayers) {
        if (p.position !== player.position) continue;
        total++;
        if (calculatePlayerOvr(p) < mine) below++;
    }
    const pct = below / Math.max(1, total);
    return Math.round(Math.max(0.5, Math.min(5.0, 0.5 + pct * 4.5)) * 2) / 2;
}
