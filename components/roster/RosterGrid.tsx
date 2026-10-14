
import React, { useMemo } from 'react';
import { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot, TableGroupHeaderCell } from '../common/Table';
import {
    ATTR_NAME_MAP,
    COMPACT_ATTR_GROUPS, COMPACT_ITEM_BY_KEY, getCompactAttrValue,
} from '../../data/attributeConfig';
import { useTableSort, sortByConfig } from '../../hooks/useTableSort';
import { PlayerInfoColGroup, PlayerInfoHeaderCells, PlayerInfoCells, PlayerInfoFooterCells } from './PlayerInfoColumns';

interface RosterGridProps {
    team: Team;
    tab: 'roster' | 'stats';
    onPlayerClick: (player: Player) => void;
    showFooter?: boolean;
    renderRowAction?: (player: Player) => React.ReactNode;
    /** 선수 이름 hover 시 능력치+스탯 팝업 표시 — 멀티플레이어 전용 기능이라 지정된 경우에만 켜짐. */
    enableHoverCard?: boolean;
}

// --- Styling Constants --- (이름|포지션|나이|OVR 4열은 PlayerInfoColumns.tsx)
const WIDTHS = { ATTR: 64, STAT: 60, ACTION: 80 };

// ATTR_GROUPS, ATTR_LABEL, ATTR_NAME_MAP → data/attributeConfig.ts에서 import

const STATS_COLS = [
    { key: 'g', label: 'G' }, { key: 'gs', label: 'GS' }, { key: 'mp', label: 'MIN' },
    { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' },
    { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' },
    { key: 'pf', label: 'PF' }, { key: 'fg%', label: 'FG%' }, { key: '3p%', label: '3P%' },
    { key: 'ft%', label: 'FT%' }, { key: 'ts%', label: 'TS%' }, { key: 'pm', label: '+/-' }
];

const getSortValue = (p: Player, key: string): number | string => {
    // 1. Basic Metadata
    if (key === 'name') return p.name;
    if (key === 'position') return p.position;
    if (key === 'age') return p.age;
    if (key === 'ovr') return calculatePlayerOvr(p);

    // 2. Statistics Logic (p.stats)
    const s = p.stats;
    const g = s.g || 1;

    // Season Totals/Averages - Prioritize p.stats over root property names (like 'reb', 'blk')
    if (['pts','reb','ast','stl','blk','tov','pf'].includes(key)) {
        return s[key as keyof typeof s] / g;
    }
    if (key === 'mp') return s.mp / g;
    if (key === 'pm') return s.plusMinus / g;
    if (key === 'g') return s.g;
    if (key === 'gs') return s.gs;
    if (key === 'fg%') return s.fga > 0 ? s.fgm / s.fga : 0;
    if (key === '3p%') return s.p3m > 0 && s.p3a > 0 ? s.p3m / s.p3a : 0;
    if (key === 'ft%') return s.fta > 0 ? s.ftm / s.fta : 0;
    if (key === 'ts%') {
        const tsa = s.fga + 0.44 * s.fta;
        return tsa > 0 ? p.stats.pts / (2 * tsa) : 0;
    }

    // 3. 압축 능력치 콤보(여러 raw 능력치 평균) — 단일 항목 키는 raw 프로퍼티명과 동일해
    // 아래 fallback에서 자연히 처리되므로, 콤보(INS/3PT/SPD)만 여기서 특별 처리.
    const compactItem = COMPACT_ITEM_BY_KEY[key];
    if (compactItem) return getCompactAttrValue(p, compactItem);

    // 4. Attribute Fallback (Root properties like 'speed', 'strength', etc.)
    if (key in p) return (p as any)[key];

    return 0;
};

export const RosterGrid: React.FC<RosterGridProps> = ({ team, tab, onPlayerClick, showFooter = true, renderRowAction, enableHoverCard = false }) => {
    const { sortConfig, sortProps } = useTableSort({ key: 'ovr', direction: 'desc' });

    const sortedRoster = useMemo(
        () => sortByConfig(team.roster, sortConfig, getSortValue),
        [team.roster, sortConfig, tab], // Depend on tab to re-calc when switching views
    );

    const averages = useMemo(() => {
        const count = team.roster.length || 1;
        const attrAvg: any = {};
        attrAvg.ovr = Math.round(team.roster.reduce((sum, p) => sum + calculatePlayerOvr(p), 0) / count);
        attrAvg.age = Math.round(team.roster.reduce((sum, p) => sum + (p.age || 0), 0) / count);

        COMPACT_ATTR_GROUPS.flatMap(g => g.items).forEach(item => {
            attrAvg[item.key] = Math.round(team.roster.reduce((sum, p) => sum + getCompactAttrValue(p, item), 0) / count);
        });

        const statAvg: any = {};
        STATS_COLS.forEach(c => {
            const k = c.key;
            if (k.includes('%')) {
                let num=0, den=0;
                team.roster.forEach(p => {
                    const s = p.stats;
                    if (k==='fg%') { num+=s.fgm; den+=s.fga; }
                    else if (k==='3p%') { num+=s.p3m; den+=s.p3a; }
                    else if (k==='ft%') { num+=s.ftm; den+=s.fta; }
                    else if (k==='ts%') { num+=s.pts; den+=2*(s.fga+0.44*s.fta); }
                });
                statAvg[k] = den > 0 ? (num/den) : 0;
            } else {
                statAvg[k] = team.roster.reduce((sum, p) => sum + Number(getSortValue(p, k)), 0) / count;
            }
        });

        return { attr: attrAvg, stat: statAvg };
    }, [team.roster]);

    return (
        <div className={`h-full ${tab === 'stats' ? 'overflow-y-auto custom-scrollbar' : 'flex flex-col overflow-hidden'}`}>
            {/* Table 1: Main Stats / Attributes / Salary */}
            {(tab === 'roster' || tab === 'stats') && (
            <div className={tab === 'stats' ? '' : 'flex-1 min-h-0'}>
            <Table variant="flush" fullHeight={tab === 'roster'}>
                <colgroup>
                    <PlayerInfoColGroup />
                    {tab === 'roster' && COMPACT_ATTR_GROUPS.flatMap(g => g.items).map((_, i) => <col key={`attr-${i}`} style={{ width: WIDTHS.ATTR }} />)}
                    {tab === 'stats' && STATS_COLS.map((_, i) => <col key={`stat-${i}`} style={{ width: WIDTHS.STAT }} />)}
                    {renderRowAction && <col style={{ width: WIDTHS.ACTION }} />}
                </colgroup>
                <TableHead noRow>
                    {/* Header Row 1: Groups — "능력치" 탭(tab==='roster')은 요청에 따라 삭제, "stats" 모드만 유지 */}
                    {tab === 'stats' && (
                        <tr className="h-10">
                            <TableGroupHeaderCell colSpan={4} stickyLeft={0}>선수 정보</TableGroupHeaderCell>
                            <TableGroupHeaderCell colSpan={STATS_COLS.length}>Season Averages (Per Game)</TableGroupHeaderCell>
                            {renderRowAction && <TableGroupHeaderCell />}
                        </tr>
                    )}
                    {/* Header Row 2: Labels */}
                    <tr className="h-10 text-slate-400 text-sm font-bold">
                        <PlayerInfoHeaderCells sortProps={sortProps} />
                        {tab === 'roster' && COMPACT_ATTR_GROUPS.flatMap(g => g.items).map(item => (
                            <TableHeaderCell
                                key={item.key}
                                width={WIDTHS.ATTR}
                                title={item.sourceKeys.map(k => ATTR_NAME_MAP[k] || k).join(' + ')}
                                {...sortProps(item.key)}
                            >
                                {item.label}
                            </TableHeaderCell>
                        ))}
                        {tab === 'stats' && STATS_COLS.map(c => (
                            <TableHeaderCell key={c.key} width={WIDTHS.STAT} {...sortProps(c.key)}>{c.label}</TableHeaderCell>
                        ))}
                        {renderRowAction && <TableHeaderCell width={WIDTHS.ACTION} />}
                    </tr>
                </TableHead>
                <TableBody>
                    {sortedRoster.map(p => (
                        <TableRow key={p.id}>
                            <PlayerInfoCells
                                player={p}
                                teamAbbr={team.abbr}
                                onClick={onPlayerClick}
                                enableHoverCard={enableHoverCard}
                                nameExtra={p.health !== 'Healthy' && (
                                    <span
                                        className={`text-[9px] font-black cursor-help ${p.health === 'Injured' ? 'text-red-500' : 'text-amber-500'}`}
                                        title={`${p.injuryType || '부상'} | 예상 복귀: ${p.returnDate || '미정'}`}
                                    >
                                        {p.health}
                                    </span>
                                )}
                            />

                            {tab === 'roster' && COMPACT_ATTR_GROUPS.flatMap(g => g.items).map(item => (
                                <TableCell key={item.key} align="center" className="font-semibold text-sm" value={getCompactAttrValue(p, item)} variant="attribute" colorScale />
                            ))}
                            {tab === 'stats' && STATS_COLS.map(c => {
                                // 출전 시간(MP)이 0이면 데이터 없음(-)으로 표시
                                if (p.stats.mp === 0) {
                                    return <TableCell key={c.key} align="center"><span className="font-medium text-sm text-slate-600">-</span></TableCell>;
                                }

                                const val = getSortValue(p, c.key);
                                let displayVal = val;
                                let textColor = 'text-slate-300';

                                // 마진 컬럼 컬러 코딩
                                if (c.key === 'pm') {
                                    const numVal = Number(val);
                                    if (numVal > 0) textColor = 'text-emerald-400';
                                    else if (numVal < 0) textColor = 'text-red-400';
                                    else textColor = 'text-slate-500';
                                }

                                if (typeof val === 'number') {
                                    if (c.key.includes('%')) displayVal = (val * 100).toFixed(1) + '%';
                                    else if (['mp', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm'].includes(c.key)) displayVal = val.toFixed(1);
                                }

                                return (
                                    <TableCell key={c.key} align="center">
                                        <span className={`font-medium text-sm tabular-nums ${textColor}`}>
                                            {displayVal}
                                        </span>
                                    </TableCell>
                                );
                            })}
                            {renderRowAction && (
                                <TableCell className="px-3 py-1.5">{renderRowAction(p)}</TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
                {showFooter && <TableFoot>
                    <tr className="h-10">
                        <PlayerInfoFooterCells label="팀 평균" age={averages.attr.age} ovr={averages.attr.ovr} />

                        {tab === 'roster' && COMPACT_ATTR_GROUPS.flatMap(g => g.items).map(item => (
                            <TableCell key={item.key} align="center" className="font-semibold text-sm" value={averages.attr[item.key]} variant="attribute" colorScale />
                        ))}
                        {tab === 'stats' && STATS_COLS.map(c => {
                            // G, GS, MIN은 팀 평균에서 제외 (빈칸 처리)
                            if (['g', 'gs', 'mp'].includes(c.key)) {
                                return <TableCell key={c.key} />;
                            }

                            let val = averages.stat[c.key];
                            let displayVal = val;
                            let textColor = 'text-slate-400';

                            // Footer 마진 컬러링
                            if (c.key === 'pm') {
                                const numVal = Number(val);
                                if (numVal > 0) textColor = 'text-emerald-400';
                                else if (numVal < 0) textColor = 'text-red-400';
                            }

                            if (typeof val === 'number') {
                                if (c.key.includes('%')) displayVal = (val * 100).toFixed(1) + '%';
                                else displayVal = val.toFixed(1);
                            }

                            return (
                                <TableCell key={c.key} align="center">
                                    <span className={`font-medium text-sm tabular-nums ${textColor}`}>
                                        {displayVal}
                                    </span>
                                </TableCell>
                            );
                        })}
                    </tr>
                </TableFoot>}
            </Table>
            </div>
            )}

        </div>
    );
};
