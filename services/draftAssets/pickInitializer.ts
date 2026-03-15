
import { TEAM_DATA } from '../../data/teamData';
import { DraftPickAsset, LeaguePickAssets } from '../../types/draftAssets';
import { TRADED_FIRST_ROUND_PICKS, TRADED_SECOND_ROUND_PICKS, SWAP_RIGHTS } from '../../data/draftPickTrades';

export const PICK_SEASONS = [2026, 2027, 2028, 2029, 2030, 2031, 2032];
const ROUNDS: (1 | 2)[] = [1, 2];

/** 리그 전체 드래프트 픽 자산 초기화 — 실제 NBA 거래 현황 반영 */
export function initializeLeaguePickAssets(): LeaguePickAssets {
    const assets: LeaguePickAssets = {};
    const teamIds = Object.keys(TEAM_DATA);

    // 1단계: 모든 팀에 자기 픽 부여 (기본 상태)
    for (const teamId of teamIds) {
        const picks: DraftPickAsset[] = [];
        for (const season of PICK_SEASONS) {
            for (const round of ROUNDS) {
                picks.push({
                    season,
                    round,
                    originalTeamId: teamId,
                    currentTeamId: teamId,
                });
            }
        }
        assets[teamId] = picks;
    }

    // 2단계: 실제 NBA 거래 반영 — 픽을 원래 소유팀에서 제거하고 현재 보유팀에 추가
    const allTradedPicks = [...TRADED_FIRST_ROUND_PICKS, ...TRADED_SECOND_ROUND_PICKS];
    for (const trade of allTradedPicks) {
        const { season, round, originalTeamId, currentTeamId, protection } = trade;

        // 원래 소유팀에서 해당 픽 제거
        if (assets[originalTeamId]) {
            assets[originalTeamId] = assets[originalTeamId].filter(
                p => !(p.season === season && p.round === round && p.originalTeamId === originalTeamId)
            );
        }

        // 현재 보유팀에 추가
        if (assets[currentTeamId]) {
            assets[currentTeamId].push({
                season,
                round,
                originalTeamId,
                currentTeamId,
                protection,
            });
        }
    }

    // 3단계: 스왑 권리 반영 — 해당 픽에 swapRight 필드 추가
    for (const swap of SWAP_RIGHTS) {
        const { season, round, beneficiaryTeamId, originTeamId } = swap;

        // originTeamId의 픽을 찾아서 swapRight 추가 (현재 보유팀에서 탐색)
        for (const teamId of teamIds) {
            const pick = assets[teamId]?.find(
                p => p.season === season && p.round === round && p.originalTeamId === originTeamId
            );
            if (pick) {
                pick.swapRight = { beneficiaryTeamId, originTeamId };
                break;
            }
        }
    }

    return assets;
}
