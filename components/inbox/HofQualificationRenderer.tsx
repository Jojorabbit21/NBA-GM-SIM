import React, { useMemo } from 'react';
import { Crown } from 'lucide-react';
import { HofQualificationContent } from '../../types';
import { TEAM_DATA } from '../../data/teamData';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import type { ChampStatTab } from './shared/inboxTypes';
import { CHAMP_TEAM_COLS, CHAMP_TAB_LABELS, HOF_SCORE_COLS } from './shared/inboxConstants';
import { makeComputeRank } from './shared/inboxUtils';
import { TeamStatsWithRanks } from './shared/TeamStatsWithRanks';
import { RosterStatsTable } from './shared/RosterStatsTable';

interface HofQualificationRendererProps {
    hof: HofQualificationContent;
    onNavigateToHof: () => void;
}

export const HofQualificationRenderer: React.FC<HofQualificationRendererProps> = ({ hof, onNavigateToHof }) => {
    const teamId = hof.teamId;

    const myTeamStats = useMemo(() => {
        return hof.allTeamsStats?.find(t => t.teamId === teamId) ?? null;
    }, [hof.allTeamsStats, teamId]);

    const computeRank = useMemo(() => makeComputeRank(hof.allTeamsStats, teamId), [hof.allTeamsStats, teamId]);

    const scoreData: Record<string, number> = {
        total: hof.totalScore,
        season: hof.breakdown.season_score,
        ptDiff: hof.breakdown.ptDiff_score,
        stat: hof.breakdown.stat_score,
        playoff: hof.breakdown.playoff_score,
    };

    return (
        <div className="space-y-10 max-w-5xl mx-auto">
            {/* Trophy Header */}
            <div className="text-center space-y-4">
                <img src="/images/hof.webp" alt="Hall of Fame" className="mx-auto h-40 object-contain" />
                <h2 className="text-3xl font-black text-white tracking-tight">
                    {TEAM_DATA[teamId]?.city ?? ''} {hof.teamName}
                </h2>
                <p className="text-sm font-bold text-slate-400">
                    {hof.conference === 'East' ? '동부' : '서부'} 컨퍼런스&nbsp;&nbsp;|&nbsp;&nbsp;{hof.wins}승 {hof.losses}패 ({hof.pct})
                </p>
            </div>

            {/* HOF Score Table */}
            <div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">명예의 전당 점수</h3>
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <Table className="!rounded-none !border-0 !shadow-none" style={{ minWidth: '100%' }}>
                        <TableHead className="bg-slate-950">
                            {HOF_SCORE_COLS.map(c => (
                                <TableHeaderCell key={c.key} align="center" className="w-20">{c.label}</TableHeaderCell>
                            ))}
                        </TableHead>
                        <TableBody>
                            <TableRow>
                                {HOF_SCORE_COLS.map(c => (
                                    <TableCell key={c.key} align="center" className={`text-sm font-black font-mono tabular-nums ${c.key === 'total' ? 'text-amber-400' : 'text-white'}`}>
                                        {scoreData[c.key].toFixed(1)}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Team Stats (with league ranks) */}
            {myTeamStats && (
                <TeamStatsWithRanks
                    sectionTitle="팀 스탯"
                    tabs={['Traditional', 'Advanced'] as ChampStatTab[]}
                    tabLabels={CHAMP_TAB_LABELS}
                    colsMap={CHAMP_TEAM_COLS}
                    teamStats={myTeamStats.stats}
                    computeRank={computeRank}
                />
            )}

            {/* Roster Stats */}
            <RosterStatsTable
                rosterStats={hof.rosterStats}
                sectionLabel="로스터 스탯"
            />

            {/* Navigate Button */}
            <div className="pt-2">
                <button
                    onClick={onNavigateToHof}
                    className="w-full py-4 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3"
                >
                    <Crown size={18} />
                    명예의 전당 보기
                </button>
            </div>
        </div>
    );
};
