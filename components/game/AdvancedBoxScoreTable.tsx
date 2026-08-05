
import React, { useMemo } from 'react';
import { Team, PlayerBoxScore } from '../../types';
import { TeamLogo } from '../common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { TEAM_DATA } from '../../data/teamData';
import { computeTeamBoxTotals, computeAdvancedStats, computePieRaw } from '../../utils/advancedBoxStats';
import { PlayerIdentityHeaderCells, PlayerIdentityCells } from './PlayerIdentityCells';

interface AdvancedBoxScoreTableProps {
    team: Team;
    box: PlayerBoxScore[];
    oppBox: PlayerBoxScore[];
    mvpId?: string;
    badge?: { color: string; abbr: string };
    standalone?: boolean;
    /** 헤더 바 우측에 렌더링할 커스텀 요소(예: Traditional/Advanced/Defense 셀렉터) */
    headerRight?: React.ReactNode;
}

const fmtPct = (v: number | null) => v == null ? '-' : v.toFixed(1);
const statCellClass = "text-xs font-semibold text-white font-mono tabular-nums";
const totalCellClass = "py-3 px-2 text-center text-xs font-semibold text-white font-mono tabular-nums bg-slate-800/50 border-t border-slate-700";

export const AdvancedBoxScoreTable: React.FC<AdvancedBoxScoreTableProps> = ({ team, box, oppBox, mvpId, badge, standalone, headerRight }) => {
    const teamTotals = useMemo(() => computeTeamBoxTotals(box), [box]);
    const oppTotals = useMemo(() => computeTeamBoxTotals(oppBox), [oppBox]);

    // PIE 분모는 그 경기 양팀 전체 선수의 합산이라 두 박스를 합쳐서 구한다.
    const totalPieRaw = useMemo(() => {
        const all = [...box, ...oppBox];
        return all.reduce((sum, p) => sum + computePieRaw(p), 0);
    }, [box, oppBox]);

    const sortedBox = useMemo(() => [...box].sort((a, b) => {
        if (a.gs !== b.gs) return b.gs - a.gs;
        return b.mp - a.mp;
    }), [box]);

    // 행마다 team.roster.find()를 반복하지 않도록 팀당 1회만 Map으로 인덱싱
    const rosterMap = useMemo(() => new Map(team.roster.map(rp => [rp.id, rp])), [team.roster]);

    const teamColor = TEAM_DATA[team.id]?.colors.primary || '#6366f1';

    return (
        <div className={standalone ? "w-full relative" : "w-full bg-slate-900 border-y border-slate-800 relative"}>
            {!standalone && <div className="absolute top-0 left-0 right-0 h-0.5 z-10" style={{ backgroundColor: teamColor }}></div>}

            <div className={`px-6 py-4 bg-slate-950/80 flex items-center justify-between mt-0.5 ${standalone ? 'border-l border-r border-slate-800' : 'border-b border-slate-800'}`}>
                <div className="flex items-center gap-3">
                    {badge ? (
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                            style={{ backgroundColor: badge.color, color: '#fff' }}
                        >
                            {badge.abbr.slice(0, 3)}
                        </div>
                    ) : (
                        <TeamLogo teamId={team.id} size="md" />
                    )}
                    <span className="text-sm font-black text-white uppercase tracking-wider">{team.name}</span>
                </div>
                {headerRight}
            </div>

            <Table className={standalone ? "!rounded-none" : "!rounded-none !border-0 !shadow-none"}>
                <TableHead>
                    <PlayerIdentityHeaderCells />
                    <TableHeaderCell align="center" className="w-12">MIN</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14">TS%</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14">EFG%</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14">USG%</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14">AST%</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14">TOV%</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14">OREB%</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14">DREB%</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14">TRB%</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14 pr-4">PIE</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {sortedBox.map(p => {
                        const adv = computeAdvancedStats(p, teamTotals, oppTotals);
                        const pie = totalPieRaw > 0 ? (computePieRaw(p) / totalPieRaw) * 100 : null;
                        return (
                            <TableRow key={p.playerId}>
                                <PlayerIdentityCells player={p} playerInfo={rosterMap.get(p.playerId)} mvpId={mvpId} standalone={standalone} />
                                <TableCell align="center" className={statCellClass}>{Math.round(p.mp)}</TableCell>
                                <TableCell align="center" className={statCellClass}>{fmtPct(adv.tsPct)}</TableCell>
                                <TableCell align="center" className={statCellClass}>{fmtPct(adv.efgPct)}</TableCell>
                                <TableCell align="center" className={statCellClass}>{fmtPct(adv.usgPct)}</TableCell>
                                <TableCell align="center" className={statCellClass}>{fmtPct(adv.astPct)}</TableCell>
                                <TableCell align="center" className={statCellClass}>{fmtPct(adv.tovPct)}</TableCell>
                                <TableCell align="center" className={statCellClass}>{fmtPct(adv.orebPct)}</TableCell>
                                <TableCell align="center" className={statCellClass}>{fmtPct(adv.drebPct)}</TableCell>
                                <TableCell align="center" className={statCellClass}>{fmtPct(adv.trbPct)}</TableCell>
                                <TableCell align="center" className={`pr-4 ${statCellClass}`}>{fmtPct(pie)}</TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
                <tfoot>
                    <tr>
                        <td className="py-3 px-4 bg-slate-800/50 border-t border-slate-700">
                            <span className="text-xs font-black text-white uppercase tracking-wider">TEAM TOTALS</span>
                        </td>
                        <td className={totalCellClass} colSpan={2}></td>
                        <td className={totalCellClass}>{Math.round(teamTotals.mp)}</td>
                        {/* TS%~PIE는 선수 개인의 팀 대비 점유율 지표라 "팀 합계"라는 개념 자체가
                            성립하지 않아 빈 칸으로 둔다 — Traditional/Defense와 동일한 TEAM TOTALS
                            행 구조(디자인/행 높이)만 맞추는 목적. */}
                        <td className={totalCellClass}>-</td>
                        <td className={totalCellClass}>-</td>
                        <td className={totalCellClass}>-</td>
                        <td className={totalCellClass}>-</td>
                        <td className={totalCellClass}>-</td>
                        <td className={totalCellClass}>-</td>
                        <td className={totalCellClass}>-</td>
                        <td className={totalCellClass}>-</td>
                        <td className={`${totalCellClass} pr-4`}>-</td>
                    </tr>
                </tfoot>
            </Table>
        </div>
    );
};
