
import React, { useMemo } from 'react';
import { Team, PlayerBoxScore } from '../../types';
import { TeamMark } from '../common/TeamMark';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { TEAM_DATA } from '../../data/teamData';
import { computeTeamBoxTotals, computeAdvancedStats, computePieRaw } from '../../utils/advancedBoxStats';
import { PlayerIdentityHeaderCells, PlayerIdentityCells } from './PlayerIdentityCells';
import { BlankBoxRows, DnpCell, BoxColGroup, ADV_STAT_COL_PCTS, fixedBoxTableStyle } from './boxScoreRows';

interface AdvancedBoxScoreTableProps {
    team: Team;
    box: PlayerBoxScore[];
    oppBox: PlayerBoxScore[];
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

const fmtPct = (v: number | null) => v == null ? '-' : v.toFixed(1);
// 푸터 셀은 py-2 + leading-6(24px)으로 본문 행(OVR 배지 h-6 + py-2)과 같은 높이를 맞춘다. 멀티(standalone)는 text-sm.
const statCellClass = (standalone?: boolean) => `${standalone ? 'text-sm' : 'text-xs'} font-semibold text-white tabular-nums`;
const totalCellClass = (standalone?: boolean) => `py-2 px-2 leading-6 text-center ${standalone ? 'text-sm' : 'text-xs'} font-semibold text-white tabular-nums bg-slate-800/50 border-t border-slate-700`;

export const AdvancedBoxScoreTable: React.FC<AdvancedBoxScoreTableProps> = ({ team, box, oppBox, mvpId, badge, standalone, headerRight, getProfileHref, padRows = 0, padSkeleton, dnpLabel, hideOvr }) => {
    const teamTotals = useMemo(() => computeTeamBoxTotals(box), [box]);
    const oppTotals = useMemo(() => computeTeamBoxTotals(oppBox), [oppBox]);

    // PIE 분모는 그 경기 양팀 전체 선수의 합산이라 두 박스를 합쳐서 구한다.
    const totalPieRaw = useMemo(() => {
        const all = [...box, ...oppBox];
        return all.reduce((sum, p) => sum + computePieRaw(p), 0);
    }, [box, oppBox]);

    const sortedBox = useMemo(() => [...box].sort((a, b) => {
        // Did Not Play(mp 0)는 항상 맨 아래
        if ((a.mp > 0) !== (b.mp > 0)) return a.mp > 0 ? -1 : 1;
        if (a.gs !== b.gs) return b.gs - a.gs;
        return b.mp - a.mp;
    }), [box]);

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

            <Table className={standalone ? "!rounded-none box-compact-head" : "!rounded-none !border-0 !shadow-none"} tableStyle={standalone ? fixedBoxTableStyle(720) : undefined}>
                {standalone && <BoxColGroup statPcts={ADV_STAT_COL_PCTS} hideOvr={hideOvr} />}
                <TableHead>
                    <PlayerIdentityHeaderCells hideOvr={hideOvr} />
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
                                <PlayerIdentityCells player={p} playerInfo={rosterMap.get(p.playerId)} mvpId={mvpId} standalone={standalone} profileHref={getProfileHref?.(p.playerId)} teamAbbr={badge?.abbr} hideOvr={hideOvr} />
                                {!(p.mp > 0) ? <DnpCell colSpan={10} standalone={standalone} label={dnpLabel} /> : (<>
                                <TableCell align="center" className={statCell}>{Math.round(p.mp)}</TableCell>
                                <TableCell align="center" className={statCell}>{fmtPct(adv.tsPct)}</TableCell>
                                <TableCell align="center" className={statCell}>{fmtPct(adv.efgPct)}</TableCell>
                                <TableCell align="center" className={statCell}>{fmtPct(adv.usgPct)}</TableCell>
                                <TableCell align="center" className={statCell}>{fmtPct(adv.astPct)}</TableCell>
                                <TableCell align="center" className={statCell}>{fmtPct(adv.tovPct)}</TableCell>
                                <TableCell align="center" className={statCell}>{fmtPct(adv.orebPct)}</TableCell>
                                <TableCell align="center" className={statCell}>{fmtPct(adv.drebPct)}</TableCell>
                                <TableCell align="center" className={statCell}>{fmtPct(adv.trbPct)}</TableCell>
                                <TableCell align="center" className={`pr-4 ${statCell}`}>{fmtPct(pie)}</TableCell>
                            </>)}
                            </TableRow>
                        );
                    })}
                    <BlankBoxRows count={padRows} totalCols={hideOvr ? 12 : 13} skeleton={padSkeleton} />
                </TableBody>
                <tfoot>
                    <tr>
                        <td className="py-2 px-4 leading-6 bg-slate-800/50 border-t border-slate-800">
                            <span className={`${standalone ? 'text-sm' : 'text-xs'} font-black text-white`}>TEAM TOTALS</span>
                        </td>
                        <td className={totalCell} colSpan={hideOvr ? 1 : 2}></td>
                        <td className={totalCell}>{Math.round(teamTotals.mp)}</td>
                        {/* TS%~PIE는 선수 개인의 팀 대비 점유율 지표라 "팀 합계"라는 개념 자체가
                            성립하지 않아 빈 칸으로 둔다 — Traditional/Defense와 동일한 TEAM TOTALS
                            행 구조(디자인/행 높이)만 맞추는 목적. */}
                        <td className={totalCell}>-</td>
                        <td className={totalCell}>-</td>
                        <td className={totalCell}>-</td>
                        <td className={totalCell}>-</td>
                        <td className={totalCell}>-</td>
                        <td className={totalCell}>-</td>
                        <td className={totalCell}>-</td>
                        <td className={totalCell}>-</td>
                        <td className={`${totalCell} pr-4`}>-</td>
                    </tr>
                </tfoot>
            </Table>
        </div>
    );
};
