
import React, { useState, useMemo } from 'react';
import { Team, PlayerBoxScore } from '../../types';
import { Crown, Shield, Lock, Unlock } from 'lucide-react';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { calculatePlayerOvr } from '../../utils/constants';
import { TEAM_DATA } from '../../data/teamData';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';

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
}

type SortKey = 'default' | 'mp' | 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'tf' | 'ff' | 'fgm' | 'fg%' | 'p3m' | '3p%' | 'ftm' | 'ft%' | 'pm';

export const BoxScoreTable: React.FC<BoxScoreTableProps> = ({ team, box, isFirst, mvpId, leaders, badge, standalone }) => {
    // Default sort state preserves the "Starters First, then Minutes" logic
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'default', direction: 'desc' });

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
        
        if (sortConfig.key === 'default') {
            // Original Default: Starters (GS=1) first, then by MP desc
            return data.sort((a, b) => {
                if (a.gs !== b.gs) return b.gs - a.gs;
                return b.mp - a.mp;
            });
        }

        return data.sort((a, b) => {
            const valA = getSortValue(a, sortConfig.key);
            const valB = getSortValue(b, sortConfig.key);
            return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        });
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
    const totalCellClass = "py-3 px-2 text-center text-xs font-semibold text-white font-mono tabular-nums bg-slate-800/50 border-t border-slate-700";
    const sc = "text-xs font-semibold text-white font-mono tabular-nums";

    const formatPct = (m: number, a: number) => {
        if (a === 0) return '-';
        return ((m / a) * 100).toFixed(1) + '%';
    };

    const teamColor = TEAM_DATA[team.id]?.colors.primary || '#6366f1';

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
            {/* Team Color Top Border */}
            <div className="absolute top-0 left-0 right-0 h-0.5 z-10" style={{ backgroundColor: teamColor }}></div>

            {/* standalone: 헤더는 테두리 없이 라벨만 — 유일한 테두리는 아래 Table 자체가 담당 */}
            <div className={`px-6 py-4 bg-slate-950/80 flex items-center justify-between mt-0.5 ${standalone ? '' : 'border-b border-slate-800'}`}>
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
            </div>
            
            {/* standalone: Table 자체의 기본 border/shadow는 살리되 라운딩만 제거(테이블 외부가
                바디 가장자리에 바로 붙으므로). 기본(상하 배치): 바깥 wrapper가 테두리를 담당하므로
                Table 쪽은 지움(중복 방지). */}
            <Table className={standalone ? "!rounded-none" : "!rounded-none !border-0 !shadow-none"}>
                <TableHead>
                    <TableHeaderCell align="left" className="px-4 sticky left-0 bg-slate-950 z-20 w-40 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">PLAYER</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-12">POS</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-10">OVR</TableHeaderCell>
                    <TableHeaderCell align="center" className={`w-10 ${hideCls}`}>FAT</TableHeaderCell>

                    <SortableHeader label="MIN" sKey="mp" />
                    <SortableHeader label="PTS" sKey="pts" />
                    <SortableHeader label="REB" sKey="reb" />
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
                        const playerInfo = team.roster.find(rp => rp.id === p.playerId);
                        const ovr = playerInfo ? calculatePlayerOvr(playerInfo) : 70;
                        const isMvp = p.playerId === mvpId;
                        
                        const effect = p.matchupEffect || 0;
                        const isBuff = effect > 0;
                        const isDebuff = effect < 0;

                        // Condition Color Logic (Fatigue Calculation Fix)
                        // p.condition is remaining stamina (0-100). Fatigue = 100 - p.condition.
                        const currentCondition = p.condition ?? 100;
                        const fatigueUsed = 100 - currentCondition;
                        
                        let fatColor = 'text-emerald-500';
                        if (fatigueUsed > 25) fatColor = 'text-red-500';
                        else if (fatigueUsed > 15) fatColor = 'text-amber-500';

                        return (
                            <TableRow key={p.playerId} className={isMvp && !standalone ? 'bg-amber-900/10' : ''}>
                                <TableCell className="px-4 sticky left-0 bg-slate-900 group-hover:bg-slate-800 transition-colors z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-semibold truncate max-w-[100px] ${isMvp ? 'text-amber-200' : 'text-white'}`}>{p.playerName}</span>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {isMvp && !standalone && <Crown size={12} className="text-amber-400 fill-amber-400 animate-pulse" />}
                                            {p.isStopper && (
                                                <div className="flex items-center justify-center" title="Ace Stopper">
                                                    <Shield size={12} className="text-cyan-400 fill-cyan-900" />
                                                </div>
                                            )}
                                            {p.isAceTarget && (
                                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${isDebuff ? 'bg-red-950/50 border-red-500/30' : isBuff ? 'bg-emerald-950/50 border-emerald-500/30' : 'bg-slate-800 border-slate-600/30'}`}>
                                                    {isDebuff ? (
                                                        <Lock size={10} className="text-red-400" />
                                                    ) : (
                                                        <Unlock size={10} className={isBuff ? "text-emerald-400" : "text-slate-400"} />
                                                    )}
                                                    <span className={`text-[9px] font-black leading-none ${isDebuff ? 'text-red-400' : isBuff ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                        {effect > 0 ? '+' : ''}{effect}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell align="center" className="text-xs font-semibold text-white">{playerInfo?.position || '-'}</TableCell>
                                <TableCell align="center">
                                    <div className="flex justify-center">
                                        <OvrBadge value={ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" />
                                    </div>
                                </TableCell>
                                <TableCell align="center" className={hideCls}>
                                    <span className={`text-xs font-semibold font-mono ${fatColor}`}>{Math.round(fatigueUsed)}</span>
                                </TableCell>
                                <TableCell align="center" className={sc}>{Math.round(p.mp)}</TableCell>
                                <TableCell align="center" className={sc}>{p.pts}</TableCell>
                                <TableCell align="center" className={sc}>{p.reb}</TableCell>
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
                                    <span className={`font-mono font-semibold text-xs tabular-nums ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                        {p.plusMinus > 0 ? '+' : ''}{p.plusMinus}
                                    </span>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
                <tfoot>
                    <tr>
                        <td className="py-3 px-4 sticky left-0 bg-slate-800 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)] border-t border-slate-700">
                            <span className="text-xs font-black text-white uppercase tracking-wider">TEAM TOTALS</span>
                        </td>
                        {/* standalone: FAT 컬럼이 숨겨져서 POS+OVR 2칸만 span(원래 POS+OVR+FAT 3칸) */}
                        <td className={totalCellClass} colSpan={standalone ? 2 : 3}></td>
                        <td className={totalCellClass}>{Math.round(totals.mp)}</td>
                        <td className={totalCellClass}>{totals.pts}</td>
                        <td className={totalCellClass}>{totals.reb}</td>
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
