
import { TEAM_DATA } from '../../data/teamData';
import type { RoomTeamMetaMap } from '../../types/multiDraft';

export interface TeamDisplay {
    name:           string;
    abbr:           string;
    colorPrimary:   string;
    colorSecondary: string;
    textColor:      string;
    isCustom:       boolean;   // true = 멀티 커스텀 팀 (로고 대체 필요)
}

/**
 * teamId 기준으로 표시용 팀 데이터를 반환한다.
 * - teamMeta에 있으면 사용자 정의 팀 (isCustom=true)
 * - 없으면 TEAM_DATA fallback (싱글/NBA 경로, isCustom=false)
 */
export function resolveTeamDisplay(
    teamId: string,
    teamMeta?: RoomTeamMetaMap
): TeamDisplay {
    const custom = teamMeta?.[teamId];
    if (custom) {
        return {
            name:           custom.name,
            abbr:           custom.abbr,
            colorPrimary:   custom.colorPrimary,
            colorSecondary: custom.colorSecondary,
            textColor:      '#FFFFFF',
            isCustom:       true,
        };
    }
    const nba = TEAM_DATA[teamId];
    return {
        name:           nba?.name             ?? teamId.toUpperCase(),
        abbr:           teamId.toUpperCase(),
        colorPrimary:   nba?.colors.primary   ?? '#6366f1',
        colorSecondary: nba?.colors.secondary ?? nba?.colors.primary ?? '#6366f1',
        textColor:      nba?.colors.text      ?? '#FFFFFF',
        isCustom:       false,
    };
}
