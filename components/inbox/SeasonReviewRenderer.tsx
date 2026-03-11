import React, { useMemo } from 'react';
import { ArrowRightLeft, AlertTriangle } from 'lucide-react';
import { SeasonReviewContent } from '../../types';
import { TeamLogo } from '../common/TeamLogo';
import { OvrBadge } from '../common/OvrBadge';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import type { TeamStatTab } from './shared/inboxTypes';
import { SR_TEAM_COLS, SR_TAB_LABELS } from './shared/inboxConstants';
import { makeComputeRank } from './shared/inboxUtils';
import { TeamStatsWithRanks } from './shared/TeamStatsWithRanks';
import { RosterStatsTable } from './shared/RosterStatsTable';

interface SeasonReviewRendererProps {
    sr: SeasonReviewContent;
    myTeamId: string;
    onPlayerClick: (id: string) => void;
}

export const SeasonReviewRenderer: React.FC<SeasonReviewRendererProps> = ({ sr, myTeamId, onPlayerClick }) => {
    const myTeamStats = useMemo(() => {
        if (!sr.allTeamsStats) return null;
        return sr.allTeamsStats.find(t => t.teamId === myTeamId) ?? null;
    }, [sr.allTeamsStats, myTeamId]);

    const computeRank = useMemo(() => makeComputeRank(sr.allTeamsStats, myTeamId), [sr.allTeamsStats, myTeamId]);

    return (
        <div className="space-y-10 max-w-5xl mx-auto">
            {/* Standings Context */}
            {sr.standingsContext && sr.standingsContext.length > 0 && (
                <div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">시즌 순위</h3>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table className="!rounded-none !border-0 !shadow-none" style={{ minWidth: '100%' }}>
                                <TableHead className="bg-slate-950">
                                    <TableHeaderCell align="center" className="w-10">#</TableHeaderCell>
                                    <TableHeaderCell align="left" className="pl-4 min-w-[160px]">팀</TableHeaderCell>
                                    <TableHeaderCell align="center">W</TableHeaderCell>
                                    <TableHeaderCell align="center">L</TableHeaderCell>
                                    <TableHeaderCell align="center">PCT</TableHeaderCell>
                                    <TableHeaderCell align="center">GB</TableHeaderCell>
                                    <TableHeaderCell align="center">HOME</TableHeaderCell>
                                    <TableHeaderCell align="center">AWAY</TableHeaderCell>
                                    <TableHeaderCell align="center">CONF</TableHeaderCell>
                                    <TableHeaderCell align="center">PPG</TableHeaderCell>
                                    <TableHeaderCell align="center">OPPG</TableHeaderCell>
                                    <TableHeaderCell align="center">DIFF</TableHeaderCell>
                                    <TableHeaderCell align="center">STRK</TableHeaderCell>
                                    <TableHeaderCell align="center">L10</TableHeaderCell>
                                </TableHead>
                                <TableBody>
                                    {sr.standingsContext.map(row => (
                                        <TableRow key={row.teamId} className={row.isUserTeam ? 'bg-indigo-900/20' : ''}>
                                            <TableCell align="center" className="text-xs font-mono text-white">{row.rank}</TableCell>
                                            <TableCell className="pl-4">
                                                <div className="flex items-center gap-2">
                                                    <TeamLogo teamId={row.teamId} size="sm" />
                                                    <span className={`text-xs font-bold truncate ${row.isUserTeam ? 'text-indigo-300' : 'text-slate-300'}`}>{row.teamName}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-white">{row.wins}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-white">{row.losses}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-white">{row.pct}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.gb}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.home}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.away}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.conf}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.ppg}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.oppg}</TableCell>
                                            <TableCell align="center" className={`text-xs font-mono ${
                                                parseFloat(row.diff) > 0 ? 'text-emerald-400' : parseFloat(row.diff) < 0 ? 'text-red-400' : 'text-slate-500'
                                            }`}>{row.diff}</TableCell>
                                            <TableCell align="center" className={`text-xs font-mono ${
                                                row.streak.startsWith('W') ? 'text-emerald-400' : row.streak.startsWith('L') ? 'text-red-400' : 'text-slate-500'
                                            }`}>{row.streak}</TableCell>
                                            <TableCell align="center" className="text-xs font-mono text-slate-400">{row.l10}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            )}

            {/* Team Stats (user team with league ranks) */}
            {myTeamStats && (
                <TeamStatsWithRanks
                    sectionTitle="팀 스탯"
                    tabs={['Traditional', 'Advanced', 'Opponent'] as TeamStatTab[]}
                    tabLabels={SR_TAB_LABELS}
                    colsMap={SR_TEAM_COLS}
                    teamStats={myTeamStats.stats}
                    computeRank={computeRank}
                />
            )}

            {/* Roster Stats */}
            <RosterStatsTable
                rosterStats={sr.rosterStats}
                sectionLabel="로스터 스탯"
                onPlayerClick={onPlayerClick}
                stickyPlayerCol={false}
            />

            {/* Trade History */}
            {sr.trades.length > 0 && (
                <div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <ArrowRightLeft size={14} className="text-indigo-400" /> 트레이드 내역
                    </h3>
                    <div className="space-y-3">
                        {sr.trades.map((t, idx) => (
                            <div key={idx} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                                <span className="text-[10px] font-bold text-slate-500 w-24 flex-shrink-0">{t.date}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <TeamLogo teamId={t.partnerId} size="sm" />
                                    <span className="text-xs font-black text-white uppercase">{t.partnerName}</span>
                                </div>
                                <div className="flex-1 grid grid-cols-2 gap-3 ml-4">
                                    <div>
                                        <span className="text-[9px] font-black text-emerald-500 uppercase">영입</span>
                                        {t.acquired.map((p, i) => (
                                            <div key={i} className="flex items-center gap-2 mt-0.5">
                                                <OvrBadge value={p.ovr} size="sm" className="!w-5 !h-5 !text-[9px] !mx-0" />
                                                <span className="text-xs font-bold text-emerald-300">{p.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-black text-red-500 uppercase">방출</span>
                                        {t.departed.map((p, i) => (
                                            <div key={i} className="flex items-center gap-2 mt-0.5">
                                                <OvrBadge value={p.ovr} size="sm" className="!w-5 !h-5 !text-[9px] !mx-0 grayscale opacity-50" />
                                                <span className="text-xs font-bold text-slate-400">{p.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Performance Alert */}
            {sr.winPct < 0.4 && (
                <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
                    <div>
                        <h4 className="text-xs font-bold text-red-400 uppercase tracking-wide mb-1">성적 경고</h4>
                        <p className="text-xs text-red-300/70 leading-relaxed">
                            팀 성적이 저조합니다. 오프시즌 동안 드래프트와 FA 영입을 통해 로스터를 재정비해야 합니다.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
