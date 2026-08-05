
import React, { useMemo } from 'react';
import { Team, PlayerBoxScore } from '../../types';
import { TeamLogo } from '../common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { TEAM_DATA } from '../../data/teamData';
import { PlayerIdentityHeaderCells, PlayerIdentityCells } from './PlayerIdentityCells';

interface DefenseBoxScoreTableProps {
    team: Team;
    box: PlayerBoxScore[];
    mvpId?: string;
    badge?: { color: string; abbr: string };
    standalone?: boolean;
    /** 헤더 바 우측에 렌더링할 커스텀 요소(예: Traditional/Advanced/Defense 셀렉터) */
    headerRight?: React.ReactNode;
}

const fmtPct = (m: number, a: number) => a > 0 ? ((m / a) * 100).toFixed(1) : '-';
const statCellClass = "text-xs font-semibold text-white font-mono tabular-nums";
const totalCellClass = "py-3 px-2 text-center text-xs font-semibold text-white font-mono tabular-nums bg-slate-800/50 border-t border-slate-700";

// DFGA/DFGM/DFG% — 이 선수가 컨테스트(contest)한 상대 슛 시도/성공/피FG%.
// 존별 세분화(림/미드/3점 등)는 컬럼이 너무 많아져 컨테스트 전체 합산만 노출한다.
export const DefenseBoxScoreTable: React.FC<DefenseBoxScoreTableProps> = ({ team, box, mvpId, badge, standalone, headerRight }) => {
    const sortedBox = useMemo(() => [...box].sort((a, b) => {
        if (a.gs !== b.gs) return b.gs - a.gs;
        return b.mp - a.mp;
    }), [box]);

    const totals = useMemo(() => box.reduce((acc, p) => ({
        mp: acc.mp + p.mp,
        stl: acc.stl + p.stl,
        blk: acc.blk + p.blk,
        dreb: acc.dreb + (p.defReb || 0),
        pf: acc.pf + (p.pf || 0),
        dfga: acc.dfga + p.contestedAttempted,
        dfgm: acc.dfgm + p.contestedMade,
    }), { mp: 0, stl: 0, blk: 0, dreb: 0, pf: 0, dfga: 0, dfgm: 0 }), [box]);

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
                    <TableHeaderCell align="center" className="w-12">STL</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-12">BLK</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-12">DREB</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-12">PF</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14">DFGA</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14">DFGM</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-14 pr-4">DFG%</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {sortedBox.map(p => (
                        <TableRow key={p.playerId}>
                            <PlayerIdentityCells player={p} playerInfo={rosterMap.get(p.playerId)} mvpId={mvpId} standalone={standalone} />
                            <TableCell align="center" className={statCellClass}>{Math.round(p.mp)}</TableCell>
                            <TableCell align="center" className={statCellClass}>{p.stl}</TableCell>
                            <TableCell align="center" className={statCellClass}>{p.blk}</TableCell>
                            <TableCell align="center" className={statCellClass}>{p.defReb}</TableCell>
                            <TableCell align="center" className={statCellClass}>{p.pf}</TableCell>
                            <TableCell align="center" className={statCellClass}>{p.contestedAttempted}</TableCell>
                            <TableCell align="center" className={statCellClass}>{p.contestedMade}</TableCell>
                            <TableCell align="center" className={`pr-4 ${statCellClass}`}>{fmtPct(p.contestedMade, p.contestedAttempted)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <tfoot>
                    <tr>
                        <td className="py-3 px-4 bg-slate-800/50 border-t border-slate-700">
                            <span className="text-xs font-black text-white uppercase tracking-wider">TEAM TOTALS</span>
                        </td>
                        <td className={totalCellClass} colSpan={2}></td>
                        <td className={totalCellClass}>{Math.round(totals.mp)}</td>
                        <td className={totalCellClass}>{totals.stl}</td>
                        <td className={totalCellClass}>{totals.blk}</td>
                        <td className={totalCellClass}>{totals.dreb}</td>
                        <td className={totalCellClass}>{totals.pf}</td>
                        <td className={totalCellClass}>{totals.dfga}</td>
                        <td className={totalCellClass}>{totals.dfgm}</td>
                        <td className={`${totalCellClass} pr-4`}>{fmtPct(totals.dfgm, totals.dfga)}</td>
                    </tr>
                </tfoot>
            </Table>
        </div>
    );
};
