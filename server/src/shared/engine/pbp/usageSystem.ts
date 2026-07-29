
import { LivePlayer, TeamState } from './pbpTypes.ts';
import { PlayType } from '../../types.ts';
import { PLAY_TYPE_USAGE_WEIGHTS } from '../../game/config/usageWeights.ts';

// ==========================================================================================
//  USAGE PRIORITY SYSTEM (옵션 시스템)
// ==========================================================================================

// [2026-07-28] mentality/fatigueFactor 제거 — flowEngine.ts 히트레이트 계산에 이미 독립 반영되어
// 있어 gravity에도 넣으면 이중 페널티가 됨. 순수 능력치로만 옵션 순위를 매김(client 미러 참조).
// [2026-07-29] zoneAvg(고정 0.4/0.3/0.2/0.1) → peak/secondary 동적 가중(0.7/0.3) + OVR 게이팅 +
// 대칭형 systemBonus + 99 캡 제거로 전면 교체(client 미러 상세 docstring 참조). 주의: 아래
// insZone/outZone은 p.attr.ins/p.attr.out(dataMapper.ts 계산값 — hands/shotIq/offConsist 혼합)과
// 이름만 비슷할 뿐 다른 값 — closeShot/layup/dunk/postPlay(순수 인사이드)와 midRange+3점 서브존
// 평균(순수 아웃사이드)만으로 그라비티 전용으로 재조합했다. p.attr.ins/out은 건드리지 않음(OVR 등
// 다른 계산이 계속 참조 중). 99 캡 제거는 getTeamOptionRanks가 순위만 쓰고, getTopPlayerGravity가
// 먹이는 Star Gravity 부스트(possessionHandler.ts)도 자체 Math.min(0.30,...)로 topGravity=83부터
// saturate돼서 부작용 없음(확인 완료). 320명 리그 실측: raw≥99 29명(전부 OVR87+), 중앙값 60.1 —
// 기존 부스트 임계값(63/83)과 여전히 맞아떨어져 재조정 없이 유지.
function calculateScoringGravity(p: LivePlayer, insideOut: number): number {
    const a = p.attr;
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

export function getTeamOptionRanks(team: TeamState): Map<string, number> {
    const rankMap = new Map<string, number>();
    const insideOut = team.tactics.sliders.insideOut;

    const sortedPlayers = [...team.onCourt].sort((a, b) => {
        return calculateScoringGravity(b, insideOut) - calculateScoringGravity(a, insideOut);
    });

    sortedPlayers.forEach((p, index) => {
        rankMap.set(p.playerId, index + 1);
    });

    return rankMap;
}

export function getTopPlayerGravity(team: TeamState): number {
    if (team.onCourt.length === 0) return 0;
    const insideOut = team.tactics.sliders.insideOut;
    return Math.max(...team.onCourt.map(p => calculateScoringGravity(p, insideOut)));
}

export function getContextualMultiplier(
    playerRank: number,
    playType: PlayType
): number {
    const safeRank = Math.max(1, Math.min(5, playerRank));
    const weights = PLAY_TYPE_USAGE_WEIGHTS[playType];

    if (!weights) return 1.0;

    return weights[safeRank - 1];
}
