import React, { useMemo } from 'react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useTeamSeasonAdvancedStats } from '../../../hooks/useTeamSeasonAdvancedStats';
import { useServerClockBucket } from '../../../utils/serverClock';
import { TeamHoverCardBody } from '../../../components/common/TeamHoverCard';
import { TeamHoverRendererContext, type TeamHoverRenderer } from '../../../components/common/TeamHover';
import { buildTeamHoverData } from './teamHoverData';
import { useAiGmProfiles } from '../../../hooks/useAiGmProfiles';

// 팀 호버 카드(팀 요약+분야별 리그 순위)의 멀티플레이어용 내용 + 제공자.
// 팝업 내용(MultiTeamHoverContent)은 호버로 열릴 때만 마운트되므로 아래 쿼리/계산은 그때 처음 돈다.
// 쿼리 키가 리더보드·전술 화면과 같아 이미 열어본 화면이 있으면 캐시를 그대로 쓴다.

const MultiTeamHoverContent: React.FC<{ teamSlug: string }> = ({ teamSlug }) => {
    const { league, room, leagueTeams } = useLeagueContext();
    const { schedule } = useSeasonContext();
    const serverNowMs = useServerClockBucket();

    const { data: teamAdvanced, isPending: advPending } = useTeamSeasonAdvancedStats(room?.id);
    // [2026-10-20] AI 팀 "단장" 줄 — "없음" 대신 meta_gms 프런트 대표(사장 우선, 없으면 단장)와 실제 직함
    const aiGmProfiles = useAiGmProfiles();
    const aiProfile = aiGmProfiles.get(teamSlug);
    const aiFront = aiProfile ? (aiProfile.president ?? aiProfile.gm) : null;

    const info = useMemo(() => buildTeamHoverData({
        slug: teamSlug, leagueTeams, schedule, serverNowMs, teamAdvanced,
        playoffTeamsPerConf: league?.playoff_team_count ?? 8,
        playInEnabled: league?.play_in_enabled ?? true,
        aiFront,
    }), [teamSlug, leagueTeams, schedule, serverNowMs, teamAdvanced, league?.playoff_team_count, league?.play_in_enabled, aiFront]);

    if (!info) return null;
    return <TeamHoverCardBody info={info} loading={advPending} />;
};

// 카드 데이터(팀 어드밴스드 스탯 RPC)를 시즌 화면이 열릴 때 백그라운드로 미리 받는다 — 첫 호버에서 처음 요청하면
// 카드가 뜬 뒤에야 순위가 채워져 어색하다. 렌더링은 하지 않으며 children은 그대로라 하위 트리를 다시 그리지 않는다.
const TeamHoverPrefetch: React.FC = () => {
    const { room } = useLeagueContext();
    useTeamSeasonAdvancedStats(room?.id);
    return null;
};

const renderTeamHover: TeamHoverRenderer = teamId => <MultiTeamHoverContent teamSlug={teamId} />;

/** 멀티 시즌 화면 전체에 팀 호버 카드를 켠다 — MultiSeasonLayout이 감싼다. 하위의 <TeamHover>가 이 렌더러를 쓴다. */
export const MultiTeamHoverProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <TeamHoverRendererContext.Provider value={renderTeamHover}>
        <TeamHoverPrefetch />
        {children}
    </TeamHoverRendererContext.Provider>
);
