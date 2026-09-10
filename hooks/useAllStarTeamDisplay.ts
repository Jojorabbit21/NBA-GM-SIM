
import { useMemo } from 'react';
import { useAllStarVotes } from './useAllStarVotes';
import { CONFERENCE_COLORS, RISING_STARS_COLORS } from '../utils/constants';
import { getReadableTextColor } from '../utils/colorContrast';

// [2026-09-09] 올스타 본경기/라이징스타 챌린지는 가상 팀 ID(EAST-ALLSTAR 등)를 쓰기 때문에
// league_teams에 실제 행이 없다 — 일정/라이브뷰가 팀 이름·테마색을 표시하려 할 때
// leagueTeams.find()가 항상 실패한다. 이 훅이 그 4개 가상 ID 전용 표시 정보를 대신 제공한다.
//
// 라이징스타 팀명(주장 성 기반, 예: "팀 플래그")은 시즌마다 바뀌므로 하드코딩할 수 없고,
// league_allstar_votes.roster.risingStars.teamAName/teamBName(투표 마감일에 이미 저장된 값,
// useAllStarVotes가 이미 조회해 캐시함 — 재조회 없음)에서 가져온다. 로스터가 아직 없는
// 시즌 초반(투표 전)엔 임시로 "라이징스타 A/B"로 폴백한다.

export const EAST_ALLSTAR_ID = 'EAST-ALLSTAR';
export const WEST_ALLSTAR_ID = 'WEST-ALLSTAR';
export const RISING_STARS_A_ID = 'RISINGSTARS-A';
export const RISING_STARS_B_ID = 'RISINGSTARS-B';

export interface AllStarTeamDisplayInfo {
    name: string;
    /** team_abbr 대응 — 최우수선수 옆 "(팀약칭)" 같은 짧은 표기용. */
    abbr: string;
    colorPrimary: string;
    colorText: string;
    /** 이 팀의 로스터 선수 ID — league_teams에 없는 가상 팀이라 별도로 실어준다(경기 시작 전
     * 로스터 미리보기 등에서 leagueTeams.find()?.roster 대신 사용). */
    roster: string[];
}

/** roomId/seasonNumber 기준 4개 가상 올스타 팀의 표시 정보(이름/테마색/로스터)를 반환한다. */
export function useAllStarTeamDisplay(
    roomId: string | undefined | null,
    seasonNumber: number | undefined | null,
): Record<string, AllStarTeamDisplayInfo> {
    const { data: snapshot } = useAllStarVotes(roomId, seasonNumber);
    const roster = snapshot?.roster;

    return useMemo(() => {
        const eastColor = CONFERENCE_COLORS.East;
        const westColor = CONFERENCE_COLORS.West;
        return {
            [EAST_ALLSTAR_ID]: {
                name: '동부 올스타', abbr: '동부',
                colorPrimary: eastColor, colorText: getReadableTextColor(eastColor),
                roster: [...(roster?.east.starters ?? []), ...(roster?.east.reserves ?? [])].map(p => p.playerId),
            },
            [WEST_ALLSTAR_ID]: {
                name: '서부 올스타', abbr: '서부',
                colorPrimary: westColor, colorText: getReadableTextColor(westColor),
                roster: [...(roster?.west.starters ?? []), ...(roster?.west.reserves ?? [])].map(p => p.playerId),
            },
            [RISING_STARS_A_ID]: {
                name: roster?.risingStars?.teamAName ? `팀 ${roster.risingStars.teamAName}` : '라이징스타 A',
                abbr: roster?.risingStars?.teamAName ?? 'RS-A',
                colorPrimary: RISING_STARS_COLORS.A, colorText: getReadableTextColor(RISING_STARS_COLORS.A),
                roster: (roster?.risingStars?.teamA ?? []).map(p => p.playerId),
            },
            [RISING_STARS_B_ID]: {
                name: roster?.risingStars?.teamBName ? `팀 ${roster.risingStars.teamBName}` : '라이징스타 B',
                abbr: roster?.risingStars?.teamBName ?? 'RS-B',
                colorPrimary: RISING_STARS_COLORS.B, colorText: getReadableTextColor(RISING_STARS_COLORS.B),
                roster: (roster?.risingStars?.teamB ?? []).map(p => p.playerId),
            },
        };
    }, [roster]);
}
