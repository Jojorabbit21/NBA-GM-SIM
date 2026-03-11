import React, { useMemo } from 'react';
import { PlayoffChampionContent } from '../../types';
import { TEAM_DATA } from '../../data/teamData';
import type { ChampStatTab } from './shared/inboxTypes';
import { CHAMP_TEAM_COLS, CHAMP_TAB_LABELS } from './shared/inboxConstants';
import { makeComputeRank } from './shared/inboxUtils';
import { TeamStatsWithRanks } from './shared/TeamStatsWithRanks';
import { RosterStatsTable } from './shared/RosterStatsTable';

interface PlayoffChampionRendererProps {
    pc: PlayoffChampionContent;
    championTeamId: string;
}

export const PlayoffChampionRenderer: React.FC<PlayoffChampionRendererProps> = ({ pc, championTeamId }) => {
    const champTeamStats = useMemo(() => {
        return pc.allTeamsStats?.find(t => t.teamId === championTeamId) ?? null;
    }, [pc.allTeamsStats, championTeamId]);

    const computeRank = useMemo(() => makeComputeRank(pc.allTeamsStats, championTeamId), [pc.allTeamsStats, championTeamId]);

    const totalTeams = pc.allTeamsStats?.length ?? 16;

    return (
        <div className="space-y-10 max-w-5xl mx-auto">
            {/* Trophy Header */}
            <div className="text-center space-y-4">
                <img src="/images/final.png" alt="Playoff Champion" className="mx-auto h-40 object-contain" />
                <h2 className="text-3xl font-black text-white tracking-tight">
                    {TEAM_DATA[championTeamId]?.city ?? ''} {pc.championTeamName}
                </h2>
                <p className="text-sm font-bold text-slate-400">
                    {pc.conference === 'East' ? '동부' : '서부'} 컨퍼런스&nbsp;&nbsp;|&nbsp;&nbsp;플레이오프 {pc.playoffWins}승 {pc.playoffLosses}패
                </p>
            </div>

            {/* Team Stats (champion team with league ranks) */}
            {champTeamStats && (
                <TeamStatsWithRanks
                    sectionTitle="플레이오프 팀 스탯"
                    tabs={['Traditional', 'Advanced'] as ChampStatTab[]}
                    tabLabels={CHAMP_TAB_LABELS}
                    colsMap={CHAMP_TEAM_COLS}
                    teamStats={champTeamStats.stats}
                    computeRank={computeRank}
                    goodRankThreshold={3}
                    badRankThreshold={Math.ceil(totalTeams * 0.7)}
                />
            )}

            {/* Roster Stats */}
            <RosterStatsTable
                rosterStats={pc.rosterStats}
                sectionLabel="플레이오프 로스터 스탯"
            />
        </div>
    );
};
