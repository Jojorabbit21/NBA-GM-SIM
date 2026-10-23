
import React, { useMemo } from 'react';
import { Team, PlayerBoxScore } from '../../types';
import { TeamMark } from '../common/TeamMark';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { TEAM_DATA } from '../../data/teamData';
import { PlayerIdentityHeaderCells, PlayerIdentityCells } from './PlayerIdentityCells';
import { BlankBoxRows, DnpCell, BoxColGroup, DEF_STAT_COL_PCTS, fixedBoxTableStyle } from './boxScoreRows';

interface DefenseBoxScoreTableProps {
    team: Team;
    box: PlayerBoxScore[];
    mvpId?: string;
    badge?: { color: string; abbr: string };
    standalone?: boolean;
    /** 헤더 바 우측에 렌더링할 커스텀 요소(예: Traditional/Advanced/Defense 셀렉터) */
    headerRight?: React.ReactNode;
    /** 선수 id → 프로필 경로. 주어지면 이름이 링크가 된다(멀티플레이어 종료 화면 전용) */
    getProfileHref?: (playerId: string) => string | undefined;
    /** 상대 팀과 표 높이를 맞추려고 본문 끝에 덧붙일 빈 행 수 */
    padRows?: number;
    /** true면 padRows를 빈 칸 대신 스켈레톤 행으로 그린다(로딩 중) */
    padSkeleton?: boolean;
    /** 미출전 행 문구(기본 'Did Not Play'). 라이브 중엔 '출전 대기' */
    dnpLabel?: string;
    /** OVR 열 생략(라이브 박스스코어 탭) */
    hideOvr?: boolean;
}

const fmtPct = (m: number, a: number) => a > 0 ? ((m / a) * 100).toFixed(1) : '-';
// 푸터 셀은 py-2 + leading-6(24px)으로 본문 행(OVR 배지 h-6 + py-2)과 같은 높이를 맞춘다. 멀티(standalone)는 text-sm.
const statCellClass = (standalone?: boolean) => `${standalone ? 'text-sm' : 'text-xs'} font-semibold text-white tabular-nums`;
const totalCellClass = (standalone?: boolean) => `py-2 px-2 leading-6 text-center ${standalone ? 'text-sm' : 'text-xs'} font-semibold text-white tabular-nums bg-slate-800/50 border-t border-slate-700`;

// DFGA/DFGM/DFG% — 이 선수가 컨테스트(contest)한 상대 슛 시도/성공/피FG%.
// 존별 세분화(림/미드/3점 등)는 컬럼이 너무 많아져 컨테스트 전체 합산만 노출한다.
export const DefenseBoxScoreTable: React.FC<DefenseBoxScoreTableProps> = ({ team, box, mvpId, badge, standalone, headerRight, getProfileHref, padRows = 0, padSkeleton, dnpLabel, hideOvr }) => {
    const sortedBox = useMemo(() => [...box].sort((a, b) => {
        // Did Not Play(mp 0)는 항상 맨 아래
        if ((a.mp > 0) !== (b.mp > 0)) return a.mp > 0 ? -1 : 1;
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

    const statCell = statCellClass(standalone);
    const totalCell = totalCellClass(standalone);
    const teamColor = badge?.color ?? TEAM_DATA[team.id]?.colors.primary ?? '#6366f1';

    return (
        <div className={standalone ? "w-full relative" : "w-full bg-slate-900 border-y border-slate-800 relative"}>
            {!standalone && <div className="absolute top-0 left-0 right-0 h-0.5 z-10" style={{ backgroundColor: teamColor }}></div>}

            <div className={`px-6 py-4 bg-slate-950/80 flex items-center justify-between mt-0.5 ${standalone ? 'border-l border-r border-slate-800' : 'border-b border-slate-800'}`}>
                <div className="flex items-center gap-3">
                    <TeamMark teamId={team.id} teamName={team.name} size="custom" className="w-8 h-8" />
                    <span className="text-sm font-black text-white">{team.name}</span>
                </div>
                {headerRight}
            </div>

            <Table className={standalone ? "!rounded-none box-compact-head" : "!rounded-none !border-0 !shadow-none"} tableStyle={standalone ? fixedBoxTableStyle(640) : undefined}>
                {standalone && <BoxColGroup statPcts={DEF_STAT_COL_PCTS} hideOvr={hideOvr} />}
                <TableHead>
                    <PlayerIdentityHeaderCells hideOvr={hideOvr} />
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
                            <PlayerIdentityCells player={p} playerInfo={rosterMap.get(p.playerId)} mvpId={mvpId} standalone={standalone} profileHref={getProfileHref?.(p.playerId)} teamAbbr={badge?.abbr} hideOvr={hideOvr} />
                                {!(p.mp > 0) ? <DnpCell colSpan={8} standalone={standalone} label={dnpLabel} /> : (<>
                            <TableCell align="center" className={statCell}>{Math.round(p.mp)}</TableCell>
                            <TableCell align="center" className={statCell}>{p.stl}</TableCell>
                            <TableCell align="center" className={statCell}>{p.blk}</TableCell>
                            <TableCell align="center" className={statCell}>{p.defReb}</TableCell>
                            <TableCell align="center" className={statCell}>{p.pf}</TableCell>
                            <TableCell align="center" className={statCell}>{p.contestedAttempted}</TableCell>
                            <TableCell align="center" className={statCell}>{p.contestedMade}</TableCell>
                            <TableCell align="center" className={`pr-4 ${statCell}`}>{fmtPct(p.contestedMade, p.contestedAttempted)}</TableCell>
                        </>)}
                            </TableRow>
                    ))}
                    <BlankBoxRows count={padRows} totalCols={hideOvr ? 10 : 11} skeleton={padSkeleton} />
                </TableBody>
                <tfoot>
                    <tr>
                        <td className="py-2 px-4 leading-6 bg-slate-800/50 border-t border-slate-800">
                            <span className={`${standalone ? 'text-sm' : 'text-xs'} font-black text-white`}>TEAM TOTALS</span>
                        </td>
                        <td className={totalCell} colSpan={hideOvr ? 1 : 2}></td>
                        <td className={totalCell}>{Math.round(totals.mp)}</td>
                        <td className={totalCell}>{totals.stl}</td>
                        <td className={totalCell}>{totals.blk}</td>
                        <td className={totalCell}>{totals.dreb}</td>
                        <td className={totalCell}>{totals.pf}</td>
                        <td className={totalCell}>{totals.dfga}</td>
                        <td className={totalCell}>{totals.dfgm}</td>
                        <td className={`${totalCell} pr-4`}>{fmtPct(totals.dfgm, totals.dfga)}</td>
                    </tr>
                </tfoot>
            </Table>
        </div>
    );
};
