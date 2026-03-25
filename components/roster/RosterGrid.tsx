
import React, { useState, useMemo } from 'react';
import { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot } from '../common/Table';
import { ATTR_GROUPS, ATTR_LABEL, ATTR_NAME_MAP, ATTR_AVG_KEYS } from '../../data/attributeConfig';

interface RosterGridProps {
    team: Team;
    tab: 'roster' | 'stats';
    onPlayerClick: (player: Player) => void;
    showFooter?: boolean;
    hideAvgColumns?: boolean;
    renderRowAction?: (player: Player) => React.ReactNode;
}

type SortConfig = { key: string; direction: 'asc' | 'desc'; };

// --- Styling Constants ---
const WIDTHS = {
    NAME: 180,
    POS: 60,
    AGE: 50,
    OVR: 60,
    ATTR: 54,
    STAT: 60
};

// ATTR_GROUPS, ATTR_LABEL, ATTR_NAME_MAP → data/attributeConfig.ts에서 import

const GROUP_LABEL_KR: Record<string, string> = {
    INSIDE: '인사이드 스코어링', OUTSIDE: '아웃사이드 스코어링', PLAYMAKING: '플레이메이킹',
    DEFENSE: '수비능력', REBOUND: '리바운드', ATHLETIC: '운동능력',
};

const STATS_COLS = [
    { key: 'g', label: 'G' }, { key: 'gs', label: 'GS' }, { key: 'mp', label: 'MIN' },
    { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' }, 
    { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' }, 
    { key: 'pf', label: 'PF' }, { key: 'fg%', label: 'FG%' }, { key: '3p%', label: '3P%' }, 
    { key: 'ft%', label: 'FT%' }, { key: 'ts%', label: 'TS%' }, { key: 'pm', label: '+/-' }
];


export const RosterGrid: React.FC<RosterGridProps> = ({ team, tab, onPlayerClick, showFooter = true, hideAvgColumns = false, renderRowAction }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ovr', direction: 'desc' });

    const handleSort = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

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

        // 3. Attribute Fallback (Root properties like 'ins', 'out', 'speed', etc.)
        if (key in p) return (p as any)[key];

        return 0;
    };

    const sortedRoster = useMemo(() => {
        return [...team.roster].sort((a, b) => {
            const aVal = getSortValue(a, sortConfig.key);
            const bVal = getSortValue(b, sortConfig.key);
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortConfig.direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
    }, [team.roster, sortConfig, tab]); // Depend on tab to re-calc when switching views

    const averages = useMemo(() => {
        const count = team.roster.length || 1;
        const attrAvg: any = {};
        const allAttrKeys = ATTR_GROUPS.flatMap(g => g.keys);
        allAttrKeys.push('ovr', 'age');
        
        allAttrKeys.forEach(k => {
            if (k === 'ovr') attrAvg[k] = Math.round(team.roster.reduce((sum, p) => sum + calculatePlayerOvr(p), 0) / count);
            else attrAvg[k] = Math.round(team.roster.reduce((sum, p) => sum + ((p as any)[k] || 0), 0) / count);
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

    // Calculate left positions for sticky columns
    const LEFT_POS = WIDTHS.NAME;
    const LEFT_AGE = WIDTHS.NAME + WIDTHS.POS;
    const LEFT_OVR = WIDTHS.NAME + WIDTHS.POS + WIDTHS.AGE;

    // Helper to enforce seamless sticky cells
    const getStickyStyle = (left: number, width: number, isLast: boolean = false) => ({
        left: left,
        width: width,
        minWidth: width,
        maxWidth: width,
        position: 'sticky' as 'sticky',
        zIndex: 30,
        borderRight: isLast ? undefined : 'none',
    });

    return (
        <div className={`h-full ${tab === 'stats' ? 'overflow-y-auto custom-scrollbar' : 'flex flex-col overflow-hidden'}`}>
            {/* Table 1: Main Stats / Attributes / Salary */}
            {(tab === 'roster' || tab === 'stats') && (
            <div className={tab === 'stats' ? '' : 'flex-1 min-h-0'}>
            <Table style={{ tableLayout: 'fixed', minWidth: '100%' }} fullHeight={tab === 'roster'} className="!rounded-none !border-x-0 !border-t-0">
                <colgroup>
                    <col style={{ width: WIDTHS.NAME }} />
                    <col style={{ width: WIDTHS.POS }} />
                    <col style={{ width: WIDTHS.AGE }} />
                    <col style={{ width: WIDTHS.OVR }} />
                    {tab === 'roster' && ATTR_GROUPS.flatMap(g => g.keys).filter(k => !hideAvgColumns || !ATTR_AVG_KEYS.has(k)).map((_, i) => <col key={`attr-${i}`} style={{ width: WIDTHS.ATTR }} />)}
                    {tab === 'stats' && STATS_COLS.map((_, i) => <col key={`stat-${i}`} style={{ width: WIDTHS.STAT }} />)}
                    {renderRowAction && <col style={{ width: 80 }} />}
                </colgroup>
                <thead className="bg-slate-950 sticky top-0 z-40 shadow-sm">
                    {/* Header Row 1: Groups */}
                    <tr className="h-10">
                        <th colSpan={4} className="bg-slate-950 border-b border-r border-slate-800 sticky left-0 z-50 align-middle">
                            <div className="h-full flex items-center justify-center">
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest ko-normal">선수 정보</span>
                            </div>
                        </th>
                        {tab === 'roster' && ATTR_GROUPS.map(g => {
                            const visibleKeys = hideAvgColumns ? g.keys.filter(k => !ATTR_AVG_KEYS.has(k)) : g.keys;
                            if (visibleKeys.length === 0) return null;
                            return (
                                <th key={g.id} colSpan={visibleKeys.length} className="bg-slate-950 border-b border-r border-slate-800 px-2 align-middle">
                                    <div className="h-full flex items-center justify-center">
                                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest ko-normal">{GROUP_LABEL_KR[g.label] || g.label}</span>
                                    </div>
                                </th>
                            );
                        })}
                        {tab === 'stats' && (
                            <th colSpan={STATS_COLS.length} className="bg-slate-950 border-b border-slate-800 px-2 align-middle">
                                <div className="h-full flex items-center justify-center">
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Season Averages (Per Game)</span>
                                </div>
                            </th>
                        )}
                        {renderRowAction && <th className="bg-slate-950 border-b border-slate-800" />}
                    </tr>
                    {/* Header Row 2: Labels */}
                    <tr className="h-10 text-slate-500 text-xs font-black uppercase tracking-widest">
                        {/* Use inline styles to force border removal and width locking */}
                        <TableHeaderCell 
                            style={{ ...getStickyStyle(0, WIDTHS.NAME), zIndex: 50 }} 
                            align="left" className="pl-4 bg-slate-950" 
                            sortable onSort={() => handleSort('name')} sortDirection={sortConfig.key === 'name' ? sortConfig.direction : null}
                        >이름</TableHeaderCell>
                        <TableHeaderCell 
                            style={{ ...getStickyStyle(LEFT_POS, WIDTHS.POS), zIndex: 50 }} 
                            className="bg-slate-950" 
                            sortable onSort={() => handleSort('position')} sortDirection={sortConfig.key === 'position' ? sortConfig.direction : null}
                        >포지션</TableHeaderCell>
                        <TableHeaderCell 
                            style={{ ...getStickyStyle(LEFT_AGE, WIDTHS.AGE), zIndex: 50 }} 
                            className="bg-slate-950" 
                            sortable onSort={() => handleSort('age')} sortDirection={sortConfig.key === 'age' ? sortConfig.direction : null}
                        >나이</TableHeaderCell>
                        <TableHeaderCell 
                            style={{ ...getStickyStyle(LEFT_OVR, WIDTHS.OVR, true), zIndex: 50}} 
                            className="bg-slate-950 border-r border-slate-800" 
                            sortable onSort={() => handleSort('ovr')} sortDirection={sortConfig.key === 'ovr' ? sortConfig.direction : null}
                        >OVR</TableHeaderCell>
                        
                        {tab === 'roster' && ATTR_GROUPS.map(g =>
                            g.keys
                                .filter(k => !hideAvgColumns || !ATTR_AVG_KEYS.has(k))
                                .map(k => (
                                    <TableHeaderCell
                                        key={k}
                                        width={WIDTHS.ATTR}
                                        className="border-r border-slate-800"
                                        sortable
                                        onSort={() => handleSort(k)}
                                        sortDirection={sortConfig.key === k ? sortConfig.direction : null}
                                        title={ATTR_NAME_MAP[k] || k}
                                    >
                                        {ATTR_LABEL[k] || k}
                                    </TableHeaderCell>
                                ))
                        )}
                        {tab === 'stats' && STATS_COLS.map(c => (
                            <TableHeaderCell key={c.key} width={WIDTHS.STAT} className="border-r border-slate-800" sortable onSort={() => handleSort(c.key)} sortDirection={sortConfig.key === c.key ? sortConfig.direction : null}>{c.label}</TableHeaderCell>
                        ))}
                        {renderRowAction && <th className="bg-slate-950 border-b border-slate-800 w-20" />}
                    </tr>
                </thead>
                <TableBody>
                    {sortedRoster.map(p => (
                        <TableRow key={p.id} className="group">
                            {/* Use inline styles to force border removal and width locking */}
                            <TableCell style={getStickyStyle(0, WIDTHS.NAME)} className="pl-4 bg-slate-900 group-hover:bg-slate-800 transition-colors">
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-slate-200 truncate hover:text-indigo-400 cursor-pointer transition-colors" onClick={() => onPlayerClick(p)}>{p.name}</span>
                                    {p.health !== 'Healthy' && (
                                        <span 
                                            className={`text-[9px] font-black uppercase cursor-help ${p.health === 'Injured' ? 'text-red-500' : 'text-amber-500'}`}
                                            title={`${p.injuryType || '부상'} | 예상 복귀: ${p.returnDate || '미정'}`}
                                        >
                                            {p.health}
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell style={getStickyStyle(LEFT_POS, WIDTHS.POS)} className="text-slate-500 font-semibold text-xs bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">{p.position}</TableCell>
                            <TableCell style={getStickyStyle(LEFT_AGE, WIDTHS.AGE)} className="text-slate-500 font-semibold text-xs bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">{p.age}</TableCell>
                            <TableCell 
                                style={{ ...getStickyStyle(LEFT_OVR, WIDTHS.OVR, true)}}
                                className="border-r border-slate-800 bg-slate-900 group-hover:bg-slate-800 transition-colors text-center"
                            >
                                <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                            </TableCell>

                            {tab === 'roster' && ATTR_GROUPS.flatMap(g => g.keys)
                                .filter(k => !hideAvgColumns || !ATTR_AVG_KEYS.has(k))
                                .map(k => (
                                    <TableCell key={k} align="center" className="font-semibold font-mono border-r border-slate-800/30 text-xs" value={(p as any)[k]} variant="attribute" colorScale />
                                ))}
                            {tab === 'stats' && STATS_COLS.map(c => {
                                // 출전 시간(MP)이 0이면 데이터 없음(-)으로 표시
                                if (p.stats.mp === 0) {
                                    return <TableCell key={c.key} align="center" className="border-r border-slate-800/30"><span className="font-mono font-medium text-xs text-slate-600">-</span></TableCell>;
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
                                    <TableCell key={c.key} align="center" className="border-r border-slate-800/30">
                                        <span className={`font-mono font-medium text-xs tabular-nums ${textColor}`}>
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
                {showFooter && <TableFoot className="bg-slate-900 border-t-2 border-slate-800 sticky bottom-0 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                    <tr className="h-10">
                        {/* Use inline styles to force border removal and width locking */}
                        <TableCell style={getStickyStyle(0, WIDTHS.NAME)} className="pl-4 text-left bg-slate-950 font-black text-indigo-400 text-xs uppercase tracking-widest">팀 평균</TableCell>
                        <TableCell style={getStickyStyle(LEFT_POS, WIDTHS.POS)} className="bg-slate-950"></TableCell>
                        <TableCell style={getStickyStyle(LEFT_AGE, WIDTHS.AGE)} className="bg-slate-950 text-center font-semibold text-slate-500 text-xs">{averages.attr.age}</TableCell>
                        <TableCell 
                            style={{ ...getStickyStyle(LEFT_OVR, WIDTHS.OVR, true)}}
                            className="border-r border-slate-800 bg-slate-950 text-center"
                        >
                            <div className="flex justify-center"><OvrBadge value={averages.attr.ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none opacity-80" /></div>
                        </TableCell>

                        {tab === 'roster' && ATTR_GROUPS.flatMap(g => g.keys)
                            .filter(k => !hideAvgColumns || !ATTR_AVG_KEYS.has(k))
                            .map(k => (
                                <TableCell key={k} align="center" className="font-semibold font-mono border-r border-slate-800/30 text-xs" value={averages.attr[k]} variant="attribute" colorScale />
                            ))}
                        {tab === 'stats' && STATS_COLS.map(c => {
                            // G, GS, MIN은 팀 평균에서 제외 (빈칸 처리)
                            if (['g', 'gs', 'mp'].includes(c.key)) {
                                return <TableCell key={c.key} className="border-r border-slate-800/30 bg-slate-950" />;
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
                                <TableCell key={c.key} align="center" className="border-r border-slate-800/30">
                                    <span className={`font-mono font-medium text-xs tabular-nums ${textColor}`}>
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
