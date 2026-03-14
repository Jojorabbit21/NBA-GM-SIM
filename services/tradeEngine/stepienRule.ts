
import { DraftPickAsset } from '../../types/draftAssets';

/**
 * 스테피언 룰 검증.
 *
 * NBA 규칙: 팀은 연속 두 해의 1라운드 픽을 모두 트레이드할 수 없다.
 * → 향후 7시즌(현재~+6) 중 연속 2년간 자기 1라운드 픽이 0개인 구간이 있으면 위반.
 *
 * @param teamId 검증 대상 팀
 * @param currentPicks 이 팀의 현재 보유 픽 목록
 * @param proposedSentPicks 이 트레이드로 내보낼 픽 목록
 * @param currentSimDate 현재 시뮬레이션 날짜
 */
export function checkStepienRule(
    teamId: string,
    currentPicks: DraftPickAsset[],
    proposedSentPicks: DraftPickAsset[],
    currentSimDate: string
): { valid: boolean; violationReason?: string } {
    const currentYear = new Date(currentSimDate).getFullYear();
    // 현재 시즌부터 향후 7시즌 검사
    const checkSeasons: number[] = [];
    for (let y = currentYear; y <= currentYear + 6; y++) {
        checkSeasons.push(y);
    }

    // 트레이드 후 남는 1라운드 픽 계산
    const sentPickKeys = new Set(
        proposedSentPicks
            .filter(p => p.round === 1)
            .map(p => `${p.season}-${p.originalTeamId}`)
    );

    // 이 팀이 보유한 "자기 팀" 1라운드 픽 (originalTeamId === teamId)
    const ownFirstRoundPicks = currentPicks
        .filter(p => p.round === 1 && p.originalTeamId === teamId)
        .filter(p => !sentPickKeys.has(`${p.season}-${p.originalTeamId}`));

    const ownPickSeasons = new Set(ownFirstRoundPicks.map(p => p.season));

    // 연속 2년 체크
    for (let i = 0; i < checkSeasons.length - 1; i++) {
        const y1 = checkSeasons[i];
        const y2 = checkSeasons[i + 1];
        if (!ownPickSeasons.has(y1) && !ownPickSeasons.has(y2)) {
            return {
                valid: false,
                violationReason: `스테피언 룰 위반: ${y1}~${y2} 연속 2년간 자체 1라운드 픽이 없습니다.`,
            };
        }
    }

    return { valid: true };
}
