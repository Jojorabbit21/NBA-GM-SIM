import React, { useMemo } from 'react';
import { RegSeasonChampionContent } from '../../types';
import { TEAM_DATA } from '../../data/teamData';
import type { ChampStatTab } from './shared/inboxTypes';
import { CHAMP_TEAM_COLS, CHAMP_TAB_LABELS } from './shared/inboxConstants';
import { makeComputeRank } from './shared/inboxUtils';
import { TeamStatsWithRanks } from './shared/TeamStatsWithRanks';
import { RosterStatsTable } from './shared/RosterStatsTable';

interface RegSeasonChampionRendererProps {
    rc: RegSeasonChampionContent;
    championTeamId: string;
}

export const RegSeasonChampionRenderer: React.FC<RegSeasonChampionRendererProps> = ({ rc, championTeamId }) => {
    const champTeamStats = useMemo(() => {
        return rc.allTeamsStats?.find(t => t.teamId === championTeamId) ?? null;
    }, [rc.allTeamsStats, championTeamId]);

    const computeRank = useMemo(() => makeComputeRank(rc.allTeamsStats, championTeamId), [rc.allTeamsStats, championTeamId]);

    return (
        <div className="space-y-10 max-w-5xl mx-auto">
            {/* Trophy Header */}
            <div className="text-center space-y-4">
                <img src="/images/reg.webp" alt="Regular Season Champion" className="mx-auto h-40 object-contain" />
                <h2 className="text-3xl font-black text-white tracking-tight">
                    {TEAM_DATA[championTeamId]?.city ?? ''} {rc.championTeamName}
                </h2>
                <p className="text-sm font-bold text-slate-400">
                    {rc.conference === 'East' ? '동부' : '서부'} 컨퍼런스&nbsp;&nbsp;|&nbsp;&nbsp;{rc.wins}승 {rc.losses}패 ({rc.pct})
                </p>
            </div>

            {/* Team Stats (champion team with league ranks) */}
            {champTeamStats && (
                <TeamStatsWithRanks
                    sectionTitle="팀 스탯"
                    tabs={['Traditional', 'Advanced'] as ChampStatTab[]}
                    tabLabels={CHAMP_TAB_LABELS}
                    colsMap={CHAMP_TEAM_COLS}
                    teamStats={champTeamStats.stats}
                    computeRank={computeRank}
                />
            )}

            {/* Roster Stats */}
            <RosterStatsTable
                rosterStats={rc.rosterStats}
                sectionLabel="로스터 스탯"
            />
        </div>
    );
};
