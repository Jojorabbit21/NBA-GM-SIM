
import React, { useState, useMemo } from 'react';
import { Team, PlayerBoxScore } from '../../types';
import { TeamMark } from '../common/TeamMark';
import { TEAM_DATA } from '../../data/teamData';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { PlayerIdentityHeaderCells, PlayerIdentityCells } from './PlayerIdentityCells';
import { BlankBoxRows, DnpCell, BoxColGroup, TRAD_STAT_COL_PCTS, fixedBoxTableStyle } from './boxScoreRows';

export interface GameStatLeaders {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
}

interface BoxScoreTableProps {
    team: Team;
    box: PlayerBoxScore[];
    isFirst?: boolean;
    mvpId?: string;
    leaders: GameStatLeaders;
    /** 제공되면 원형 TeamLogo 대신 이 색상/약어로 사각형 배지를 렌더링(멀티플레이어 전용 스타일) */
    badge?: { color: string; abbr: string };
    /** true면 상하로 이어붙는 seamless 스타일(border-y만) 대신 독립된 카드(전체 border+라운딩)로 렌더링
     *  — 좌우 분할 배치(splitLayout)에서 테이블이 옆 테이블과 안 붙어있으니 독립 카드처럼 보여야 함 */
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

type SortKey = 'default' | 'mp' | 'pts' | 'reb' | 'oreb' | 'dreb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'tf' | 'ff' | 'fgm' | 'fg%' | 'p3m' | '3p%' | 'ftm' | 'ft%' | 'pm';

export const BoxScoreTable: React.FC<BoxScoreTableProps> = ({ team, box, isFirst, mvpId, leaders, badge, standalone, headerRight, getProfileHref, padRows = 0, padSkeleton, dnpLabel, hideOvr }) => {
    // Default sort state preserves the "Starters First, then Minutes" logic
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'default', direction: 'desc' });
    // 행마다 team.roster.find()를 반복하지 않도록 팀당 1회만 Map으로 인덱싱
    const rosterMap = useMemo(() => new Map(team.roster.map(rp => [rp.id, rp])), [team.roster]);

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const getSortValue = (p: PlayerBoxScore, key: SortKey): number => {
        switch (key) {
            case 'mp': return p.mp;
            case 'pts': return p.pts;
            case 'reb': return p.reb;
            case 'oreb': return p.offReb || 0;
            case 'dreb': return p.defReb || 0;
            case 'ast': return p.ast;
            case 'stl': return p.stl;
            case 'blk': return p.blk;
            case 'tov': return p.tov;
            case 'pf': return p.pf;
            case 'tf': return p.techFouls || 0;
            case 'ff': return p.flagrantFouls || 0;
            case 'fgm': return p.fgm;
            case 'fg%': return p.fga > 0 ? p.fgm / p.fga : 0;
            case 'p3m': return p.p3m;
            case '3p%': return p.p3a > 0 ? p.p3m / p.p3a : 0;
            case 'ftm': return p.ftm;
            case 'ft%': return p.fta > 0 ? p.ftm / p.fta : 0;
            case 'pm': return p.plusMinus;
            default: return 0;
        }
    };

    // Sort players
    const sortedBox = useMemo(() => {
        const data = [...box];
        // Did Not Play(mp 0) 선수는 정렬 기준과 무관하게 항상 맨 아래 — 출전 선수만 정렬한다
        const played = data.filter(p => p.mp > 0);
        const dnp = data.filter(p => !(p.mp > 0));

        if (sortConfig.key === 'default') {
            // Original Default: Starters (GS=1) first, then by MP desc
            played.sort((a, b) => {
                if (a.gs !== b.gs) return b.gs - a.gs;
                return b.mp - a.mp;
            });
        } else {
            played.sort((a, b) => {
                const valA = getSortValue(a, sortConfig.key);
                const valB = getSortValue(b, sortConfig.key);
                return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
            });
        }
        return [...played, ...dnp];
    }, [box, sortConfig]);

    // Calculate Team Totals
    const totals = useMemo(() => {
        return box.reduce((acc, p) => ({
            mp: acc.mp + p.mp,
            pts: acc.pts + p.pts,
            reb: acc.reb + p.reb,
            ast: acc.ast + p.ast,
            stl: acc.stl + p.stl,
            blk: acc.blk + p.blk,
            tov: acc.tov + p.tov,
            pf: acc.pf + (p.pf || 0),
            tf: acc.tf + (p.techFouls || 0),
            ff: acc.ff + (p.flagrantFouls || 0),
            fgm: acc.fgm + p.fgm,
            fga: acc.fga + p.fga,
            p3m: acc.p3m + p.p3m,
            p3a: acc.p3a + p.p3a,
            ftm: acc.ftm + p.ftm,
            fta: acc.fta + p.fta,
            offReb: acc.offReb + (p.offReb || 0),
            defReb: acc.defReb + (p.defReb || 0),
        }), {
            mp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, tf: 0, ff: 0,
            fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, offReb: 0, defReb: 0
        });
    }, [box]);

    // Updated: Central Alignment for Stats
    // 푸터 셀은 py-2 + leading-6(24px)으로 본문 행(OVR 배지 h-6 + py-2)과 같은 높이를 맞춘다
    const textSize = standalone ? 'text-sm' : 'text-xs';
    const totalCellClass = `py-2 px-2 leading-6 text-center ${textSize} font-semibold text-white tabular-nums bg-slate-800/50 border-t border-slate-700`;
    const sc = `${textSize} font-semibold text-white tabular-nums`;
    // DNP/빈/스켈레톤 행이 덮을 스탯 열 수(숨김 열 제외) — 헤더 열 수와 정확히 같아야 한다(1이라도 크면 표에 빈 열이 생김).
    // standalone: MIN~PF 9(OREB/DREB 포함) + FG/3P/FT 3 + +/- 1 = 13, 기본: FAT 1 + MIN~FF 11 + FG/FG%/3P/3P%/FT/FT% 6 + +/- 1 = 19
    const statCols = standalone ? 13 : 19;

    const formatPct = (m: number, a: number) => {
        if (a === 0) return '-';
        return ((m / a) * 100).toFixed(1) + '%';
    };

    // badge가 있으면 그 색(멀티플레이어 커스텀 컬러) — 없으면 TEAM_DATA 폴백(싱글플레이어).
    const teamColor = badge?.color ?? TEAM_DATA[team.id]?.colors.primary ?? '#6366f1';

    // [2026-08-02] standalone(좌우 분할) 전용 — FAT/TF/FF/FG%/3P%/FT% 컬럼을 삭제하지 않고 숨김
    // (컬럼 정의/로직은 그대로 유지, CSS로만 미표시). 기본(상하 배치)에선 전부 그대로 노출.
    const hideCls = standalone ? 'hidden' : '';

    // Helper for Header Cells to reduce verbosity
    const SortableHeader = ({ label, sKey, width, hidden }: { label: string, sKey: SortKey, width?: string, hidden?: boolean }) => (
        <TableHeaderCell
            align="center"
            className={`w-${width || '12'} ${label === 'PTS' ? 'text-slate-300' : ''} ${hidden ? hideCls : ''}`}
            sortable
            onSort={() => handleSort(sKey)}
            sortDirection={sortConfig.key === sKey ? sortConfig.direction : null}
        >
            {label}
        </TableHeaderCell>
    );

    return (
        // [2026-08-02] standalone=true(좌우 분할): 바깥 카드 컨테이너(bg/border/rounded)를 해체 —
        // 헤더 바만 남기고, 아래 Table 컴포넌트 자체의 기본 border/rounded/shadow를 그대로 살려서
        // (기존엔 !important로 지워서 바깥 div가 대신 담당했음) 그게 유일한 테두리가 되도록 함.
        // 이러면 두 테이블이 갭 없이 붙어도 각자 테두리로 구분되고, 바디를 꽉 채운다.
        // 기본(상하 배치): 기존처럼 border-y만 써서 두 테이블이 이어붙은 seamless 룩 유지.
        <div className={standalone
            ? "w-full relative"
            : "w-full bg-slate-900 border-y border-slate-800 relative"
        }>
            {/* Team Color Top Border — standalone(멀티플레이어)에선 탭 그룹 바로 아래 구분선이라 제거 */}
            {!standalone && <div className="absolute top-0 left-0 right-0 h-0.5 z-10" style={{ backgroundColor: teamColor }}></div>}

            {/* standalone: 헤더는 테두리 없이 라벨만 — 유일한 테두리는 아래 Table 자체가 담당 */}
            <div className={`px-6 py-4 bg-slate-950/80 flex items-center justify-between mt-0.5 ${standalone ? 'border-l border-r border-slate-800' : 'border-b border-slate-800'}`}>
                <div className="flex items-center gap-3">
                    <TeamMark teamId={team.id} teamName={team.name} size="custom" className="w-8 h-8" />
                    <span className="text-sm font-black text-white">{team.name}</span>
                </div>
                {headerRight}
            </div>
            
            {/* standalone: Table 자체의 기본 border/shadow는 살리되 라운딩만 제거(테이블 외부가
                바디 가장자리에 바로 붙으므로). 기본(상하 배치): 바깥 wrapper가 테두리를 담당하므로
                Table 쪽은 지움(중복 방지). */}
            {/* standalone: 고정 레이아웃 + 퍼센트 colgroup(열 흔들림 방지). hidden 열(FAT/TF/FF/FG%/3P%/FT%)은 display:none이라 열 슬롯을 차지하지 않으므로 colgroup은 보이는 16열만. */}
            <Table className={standalone ? "!rounded-none box-compact-head" : "!rounded-none !border-0 !shadow-none"} tableStyle={standalone ? fixedBoxTableStyle(760) : undefined}>
                {standalone && <BoxColGroup statPcts={TRAD_STAT_COL_PCTS} hideOvr={hideOvr} />}
                <TableHead>
                    <PlayerIdentityHeaderCells hideOvr={hideOvr} />
                    <TableHeaderCell align="center" className={`w-10 ${hideCls}`}>FAT</TableHeaderCell>

                    <SortableHeader label="MIN" sKey="mp" />
                    <SortableHeader label="PTS" sKey="pts" />
                    <SortableHeader label="OREB" sKey="oreb" width="14" />
                    <SortableHeader label="DREB" sKey="dreb" width="14" />
                    <SortableHeader label="AST" sKey="ast" />
                    <SortableHeader label="STL" sKey="stl" />
                    <SortableHeader label="BLK" sKey="blk" />
                    <SortableHeader label="TOV" sKey="tov" />
                    <SortableHeader label="PF" sKey="pf" />
                    <SortableHeader label="TF" sKey="tf" hidden />
                    <SortableHeader label="FF" sKey="ff" hidden />

                    <SortableHeader label="FG" sKey="fgm" width="16" />
                    <SortableHeader label="FG%" sKey="fg%" width="14" hidden />
                    <SortableHeader label="3P" sKey="p3m" width="16" />
                    <SortableHeader label="3P%" sKey="3p%" width="14" hidden />
                    <SortableHeader label="FT" sKey="ftm" width="16" />
                    <SortableHeader label="FT%" sKey="ft%" width="14" hidden />
                    
                    <TableHeaderCell 
                        align="center" 
                        className="w-14 pr-4" 
                        sortable 
                        onSort={() => handleSort('pm')}
                        sortDirection={sortConfig.key === 'pm' ? sortConfig.direction : null}
                    >
                        +/-
                    </TableHeaderCell>
                </TableHead>
                <TableBody>
                    {sortedBox.map(p => {
                        const isMvp = p.playerId === mvpId;

                        // Condition Color Logic (Fatigue Calculation Fix)
                        // p.condition is remaining stamina (0-100). Fatigue = 100 - p.condition.
                        const currentCondition = p.condition ?? 100;
                        const fatigueUsed = 100 - currentCondition;

                        let fatColor = 'text-emerald-500';
                        if (fatigueUsed > 25) fatColor = 'text-red-500';
                        else if (fatigueUsed > 15) fatColor = 'text-amber-500';

                        return (
                            <TableRow key={p.playerId} className={isMvp && !standalone ? 'bg-amber-900/10' : ''}>
                                <PlayerIdentityCells player={p} playerInfo={rosterMap.get(p.playerId)} mvpId={mvpId} standalone={standalone} profileHref={getProfileHref?.(p.playerId)} teamAbbr={badge?.abbr} hideOvr={hideOvr} />
                                {!(p.mp > 0) ? <DnpCell colSpan={statCols} standalone={standalone} label={dnpLabel} /> : (<>
                                <TableCell align="center" className={hideCls}>
                                    <span className={`${textSize} font-semibold ${fatColor}`}>{Math.round(fatigueUsed)}</span>
                                </TableCell>
                                <TableCell align="center" className={sc}>{Math.round(p.mp)}</TableCell>
                                <TableCell align="center" className={sc}>{p.pts}</TableCell>
                                <TableCell align="center" className={sc}>{p.offReb || 0}</TableCell>
                                <TableCell align="center" className={sc}>{p.defReb || 0}</TableCell>
                                <TableCell align="center" className={sc}>{p.ast}</TableCell>
                                <TableCell align="center" className={sc}>{p.stl}</TableCell>
                                <TableCell align="center" className={sc}>{p.blk}</TableCell>
                                <TableCell align="center" className={sc}>{p.tov}</TableCell>
                                <TableCell align="center" className={sc}>{p.pf}</TableCell>
                                <TableCell align="center" className={`${sc} ${hideCls}`}>{p.techFouls || 0}</TableCell>
                                <TableCell align="center" className={`${sc} ${hideCls}`}>{p.flagrantFouls || 0}</TableCell>
                                <TableCell align="center" className={sc}>{p.fgm}/{p.fga}</TableCell>
                                <TableCell align="center" className={`${sc} ${hideCls}`}>{formatPct(p.fgm, p.fga)}</TableCell>
                                <TableCell align="center" className={sc}>{p.p3m}/{p.p3a}</TableCell>
                                <TableCell align="center" className={`${sc} ${hideCls}`}>{formatPct(p.p3m, p.p3a)}</TableCell>
                                <TableCell align="center" className={sc}>{p.ftm}/{p.fta}</TableCell>
                                <TableCell align="center" className={`${sc} ${hideCls}`}>{formatPct(p.ftm, p.fta)}</TableCell>
                                <TableCell align="center" className="pr-4">
                                    <span className={`font-semibold ${textSize} tabular-nums ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                        {p.plusMinus > 0 ? '+' : ''}{p.plusMinus}
                                    </span>
                                </TableCell>
                                </>)}
                            </TableRow>
                        );
                    })}
                    <BlankBoxRows count={padRows} totalCols={(hideOvr ? 2 : 3) + statCols} skeleton={padSkeleton} />
                </TableBody>
                <tfoot>
                    <tr>
                        <td className="py-2 px-4 leading-6 bg-slate-800/50 border-t border-slate-800">
                            <span className={`${textSize} font-black text-white`}>TEAM TOTALS</span>
                        </td>
                        {/* standalone: FAT 컬럼이 숨겨져서 POS+OVR 2칸만 span(원래 POS+OVR+FAT 3칸) */}
                        <td className={totalCellClass} colSpan={(standalone ? 2 : 3) - (hideOvr ? 1 : 0)}></td>
                        <td className={totalCellClass}>{Math.round(totals.mp)}</td>
                        <td className={totalCellClass}>{totals.pts}</td>
                        <td className={totalCellClass}>{totals.offReb}</td>
                        <td className={totalCellClass}>{totals.defReb}</td>
                        <td className={totalCellClass}>{totals.ast}</td>
                        <td className={totalCellClass}>{totals.stl}</td>
                        <td className={totalCellClass}>{totals.blk}</td>
                        <td className={totalCellClass}>{totals.tov}</td>
                        <td className={totalCellClass}>{totals.pf}</td>
                        <td className={`${totalCellClass} ${hideCls}`}>{totals.tf}</td>
                        <td className={`${totalCellClass} ${hideCls}`}>{totals.ff}</td>

                        <td className={totalCellClass}>{totals.fgm}/{totals.fga}</td>
                        <td className={`${totalCellClass} ${hideCls}`}>{formatPct(totals.fgm, totals.fga)}</td>

                        <td className={totalCellClass}>{totals.p3m}/{totals.p3a}</td>
                        <td className={`${totalCellClass} ${hideCls}`}>{formatPct(totals.p3m, totals.p3a)}</td>
                        
                        <td className={totalCellClass}>{totals.ftm}/{totals.fta}</td>
                        <td className={`${totalCellClass} ${hideCls}`}>{formatPct(totals.ftm, totals.fta)}</td>
                        
                        <td className={totalCellClass}>-</td>
                    </tr>
                </tfoot>
            </Table>
        </div>
    );
};
