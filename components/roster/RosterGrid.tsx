
import React, { useState, useMemo } from 'react';
import { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot } from '../common/Table';

interface RosterGridProps {
    team: Team;
    tab: 'roster' | 'stats' | 'shooting';
    onPlayerClick: (player: Player) => void;
}

type SortConfig = { key: string; direction: 'asc' | 'desc'; };

// --- Styling Constants ---
const WIDTHS = {
    NAME: 180,
    POS: 60,
    AGE: 50,
    OVR: 60,
    ATTR: 54,
    STAT: 60,
    ZONE_STAT: 70
};

// Full name mapping for tooltips
const ATTR_NAME_MAP: Record<string, string> = {
    ins: '인사이드 득점 평균 (Inside Scoring Avg)',
    closeShot: '근접 슛 (Close Shot)',
    layup: '레이업 (Layup)',
    dunk: '덩크 (Dunk)',
    postPlay: '포스트 플레이 (Post Play)',
    drawFoul: '파울 유도 (Draw Foul)',
    hands: '핸즈 (Hands)',
    out: '외곽 득점 평균 (Outside Scoring Avg)',
    midRange: '중거리 슛 (Mid-Range)',
    threeCorner: '3점 슛 (3pt)',
    ft: '자유투 (Free Throw)',
    shotIq: '슛 지능 (Shot IQ)',
    offConsist: '공격 기복 (Offensive Consistency)',
    plm: '플레이메이킹 평균 (Playmaking Avg)',
    passAcc: '패스 정확도 (Pass Accuracy)',
    handling: '볼 핸들링 (Ball Handling)',
    spdBall: '볼 핸들링 속도 (Speed with Ball)',
    passVision: '시야 (Pass Vision)',
    passIq: '패스 지능 (Pass IQ)',
    def: '수비 평균 (Defense Avg)',
    intDef: '내곽 수비 (Interior Defense)',
    perDef: '외곽 수비 (Perimeter Defense)',
    steal: '스틸 (Steal)',
    blk: '블록 (Block)',
    helpDefIq: '헬프 수비 지능 (Help Def IQ)',
    passPerc: '패스 차단 (Pass Perception)',
    defConsist: '수비 기복 (Defensive Consistency)',
    reb: '리바운드 평균 (Rebound Avg)',
    offReb: '공격 리바운드 (Offensive Rebound)',
    defReb: '수비 리바운드 (Defensive Rebound)',
    ath: '운동 능력 평균 (Athleticism Avg)',
    speed: '속도 (Speed)',
    agility: '민첩성 (Agility)',
    strength: '힘 (Strength)',
    vertical: '점프력 (Vertical)',
    stamina: '지구력 (Stamina)',
    hustle: '허슬 (Hustle)',
    durability: '내구도 (Durability)'
};

// Attribute Groups Configuration
const ATTR_GROUPS = [
    { id: 'INS', label: 'INSIDE', keys: ['ins', 'closeShot', 'layup', 'dunk', 'postPlay', 'drawFoul', 'hands'] },
    { id: 'OUT', label: 'OUTSIDE', keys: ['out', 'midRange', 'threeCorner', 'ft', 'shotIq', 'offConsist'] },
    { id: 'PLM', label: 'PLAYMAKING', keys: ['plm', 'passAcc', 'handling', 'spdBall', 'passVision', 'passIq'] },
    { id: 'DEF', label: 'DEFENSE', keys: ['def', 'intDef', 'perDef', 'steal', 'blk', 'helpDefIq', 'passPerc', 'defConsist'] },
    { id: 'REB', label: 'REBOUND', keys: ['reb', 'offReb', 'defReb'] },
    { id: 'ATH', label: 'ATHLETIC', keys: ['ath', 'speed', 'agility', 'strength', 'vertical', 'stamina', 'hustle', 'durability'] }
];

const STATS_COLS = [
    { key: 'g', label: 'G' }, { key: 'gs', label: 'GS' }, { key: 'mp', label: 'MIN' },
    { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' }, 
    { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' }, 
    { key: 'pf', label: 'PF' }, { key: 'fg%', label: 'FG%' }, { key: '3p%', label: '3P%' }, 
    { key: 'ft%', label: 'FT%' }, { key: 'ts%', label: 'TS%' }, { key: 'pm', label: '+/-' }
];

const ZONE_CONFIG = [
    { id: 'rim', label: 'RIM', keyM: 'zone_rim_m', keyA: 'zone_rim_a' },
    { id: 'paint', label: 'PAINT', keyM: 'zone_paint_m', keyA: 'zone_paint_a' },
    { id: 'midL', label: 'MID-L', keyM: 'zone_mid_l_m', keyA: 'zone_mid_l_a' },
    { id: 'midC', label: 'MID-C', keyM: 'zone_mid_c_m', keyA: 'zone_mid_c_a' },
    { id: 'midR', label: 'MID-R', keyM: 'zone_mid_r_m', keyA: 'zone_mid_r_a' },
    { id: 'c3L', label: '3PT-LC', keyM: 'zone_c3_l_m', keyA: 'zone_c3_l_a' },
    { id: 'atb3L', label: '3PT-LW', keyM: 'zone_atb3_l_m', keyA: 'zone_atb3_l_a' },
    { id: 'atb3C', label: '3PT-T', keyM: 'zone_atb3_c_m', keyA: 'zone_atb3_c_a' },
    { id: 'atb3R', label: '3PT-RW', keyM: 'zone_atb3_r_m', keyA: 'zone_atb3_r_a' },
    { id: 'c3R', label: '3PT-RC', keyM: 'zone_c3_r_m', keyA: 'zone_c3_r_a' },
];

export const RosterGrid: React.FC<RosterGridProps> = ({ team, tab, onPlayerClick }) => {
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

        // 4. Zone Stats for Sorting
        if (key.startsWith('zone_pct_')) {
            const zId = key.replace('zone_pct_', '');
            const zCfg = ZONE_CONFIG.find(z => z.id === zId);
            if (zCfg) {
                const m = s[zCfg.keyM] || 0;
                const a = s[zCfg.keyA] || 0;
                return a > 0 ? m / a : 0;
            }
        }

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

        // Zone Totals
        const zoneAvg: any = {};
        ZONE_CONFIG.forEach(z => {
            const m = team.roster.reduce((sum, p) => sum + (p.stats[z.keyM] || 0), 0);
            const a = team.roster.reduce((sum, p) => sum + (p.stats[z.keyA] || 0), 0);
            zoneAvg[z.id] = { m, a, pct: a > 0 ? m/a : 0 };
        });

        return { attr: attrAvg, stat: statAvg, zone: zoneAvg };
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
        borderRight: isLast ? undefined : 'none', // Force removal of right border
        boxShadow: isLast ? '4px 0 4px -2px rgba(0,0,0,0.5)' : 'none' // Only shadow on last element
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
                    {tab === 'roster' && ATTR_GROUPS.flatMap(g => g.keys).map((_, i) => <col key={`attr-${i}`} style={{ width: WIDTHS.ATTR }} />)}
                    {tab === 'stats' && STATS_COLS.map((_, i) => <col key={`stat-${i}`} style={{ width: WIDTHS.STAT }} />)}
                </colgroup>
                <thead className="bg-slate-950 sticky top-0 z-40 shadow-sm">
                    {/* Header Row 1: Groups */}
                    <tr className="h-10">
                        <th colSpan={4} className="bg-slate-950 border-b border-r border-slate-800 sticky left-0 z-50 align-middle">
                            <div className="h-full flex items-center justify-center">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Basic Information</span>
                            </div>
                        </th>
                        {tab === 'roster' && ATTR_GROUPS.map(g => (
                            <th key={g.id} colSpan={g.keys.length} className="bg-slate-950 border-b border-r border-slate-800 px-2 align-middle">
                                <div className="h-full flex items-center justify-center">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{g.label}</span>
                                </div>
                            </th>
                        ))}
                        {tab === 'stats' && (
                            <th colSpan={STATS_COLS.length} className="bg-slate-950 border-b border-slate-800 px-2 align-middle">
                                <div className="h-full flex items-center justify-center">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Season Averages (Per Game)</span>
                                </div>
                            </th>
                        )}
                    </tr>
                    {/* Header Row 2: Labels */}
                    <tr className="h-10 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                        {/* Use inline styles to force border removal and width locking */}
                        <TableHeaderCell 
                            style={{ ...getStickyStyle(0, WIDTHS.NAME), zIndex: 50 }} 
                            align="left" className="pl-4 bg-slate-950" 
                            sortable onSort={() => handleSort('name')} sortDirection={sortConfig.key === 'name' ? sortConfig.direction : null}
                        >PLAYER NAME</TableHeaderCell>
                        <TableHeaderCell 
                            style={{ ...getStickyStyle(LEFT_POS, WIDTHS.POS), zIndex: 50 }} 
                            className="bg-slate-950" 
                            sortable onSort={() => handleSort('position')} sortDirection={sortConfig.key === 'position' ? sortConfig.direction : null}
                        >POS</TableHeaderCell>
                        <TableHeaderCell 
                            style={{ ...getStickyStyle(LEFT_AGE, WIDTHS.AGE), zIndex: 50 }} 
                            className="bg-slate-950" 
                            sortable onSort={() => handleSort('age')} sortDirection={sortConfig.key === 'age' ? sortConfig.direction : null}
                        >AGE</TableHeaderCell>
                        <TableHeaderCell 
                            style={{ ...getStickyStyle(LEFT_OVR, WIDTHS.OVR, true), zIndex: 50, clipPath: 'inset(0 -15px 0 0)' }} 
                            className="bg-slate-950 border-r border-slate-800" 
                            sortable onSort={() => handleSort('ovr')} sortDirection={sortConfig.key === 'ovr' ? sortConfig.direction : null}
                        >OVR</TableHeaderCell>
                        
                        {tab === 'roster' && ATTR_GROUPS.map(g => (
                            g.keys.map((k, idx) => {
                                const isGroupStart = idx === 0;
                                const label = isGroupStart ? 'AVG' : (k === 'threeAvg' || k === 'threeCorner' ? '3PT' : k.slice(0, 3).toUpperCase());
                                return (
                                    <TableHeaderCell 
                                        key={k} 
                                        width={WIDTHS.ATTR} 
                                        className="border-r border-slate-800" 
                                        sortable 
                                        onSort={() => handleSort(k)} 
                                        sortDirection={sortConfig.key === k ? sortConfig.direction : null}
                                        title={ATTR_NAME_MAP[k] || k}
                                    >
                                        {label}
                                    </TableHeaderCell>
                                );
                            })
                        ))}
                        {tab === 'stats' && STATS_COLS.map(c => (
                            <TableHeaderCell key={c.key} width={WIDTHS.STAT} className="border-r border-slate-800" sortable onSort={() => handleSort(c.key)} sortDirection={sortConfig.key === c.key ? sortConfig.direction : null}>{c.label}</TableHeaderCell>
                        ))}
                    </tr>
                </thead>
                <TableBody>
                    {sortedRoster.map(p => (
                        <TableRow key={p.id} onClick={() => onPlayerClick(p)} className="group">
                            {/* Use inline styles to force border removal and width locking */}
                            <TableCell style={getStickyStyle(0, WIDTHS.NAME)} className="pl-4 bg-slate-900 group-hover:bg-slate-800 transition-colors">
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-indigo-300">{p.name}</span>
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
                                style={{ ...getStickyStyle(LEFT_OVR, WIDTHS.OVR, true), clipPath: 'inset(0 -15px 0 0)' }}
                                className="border-r border-slate-800 bg-slate-900 group-hover:bg-slate-800 transition-colors text-center"
                            >
                                <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                            </TableCell>

                            {tab === 'roster' && ATTR_GROUPS.flatMap(g => g.keys).map(k => (
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
                        </TableRow>
                    ))}
                </TableBody>
                <TableFoot className="bg-slate-900 border-t-2 border-slate-800 sticky bottom-0 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                    <tr className="h-10">
                        {/* Use inline styles to force border removal and width locking */}
                        <TableCell style={getStickyStyle(0, WIDTHS.NAME)} className="pl-4 text-left bg-slate-950 font-black text-indigo-400 text-[10px] uppercase tracking-widest">TEAM AVERAGE</TableCell>
                        <TableCell style={getStickyStyle(LEFT_POS, WIDTHS.POS)} className="bg-slate-950"></TableCell>
                        <TableCell style={getStickyStyle(LEFT_AGE, WIDTHS.AGE)} className="bg-slate-950 text-center font-semibold text-slate-500 text-xs">{averages.attr.age}</TableCell>
                        <TableCell 
                            style={{ ...getStickyStyle(LEFT_OVR, WIDTHS.OVR, true), clipPath: 'inset(0 -15px 0 0)' }}
                            className="border-r border-slate-800 bg-slate-950 text-center"
                        >
                            <div className="flex justify-center"><OvrBadge value={averages.attr.ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none opacity-80" /></div>
                        </TableCell>

                        {tab === 'roster' && ATTR_GROUPS.flatMap(g => g.keys).map(k => (
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
                </TableFoot>
            </Table>
            </div>
            )}

            {/* Table 2: 10-Zone Shooting Stats */}
            {tab === 'shooting' && (
                <div className="flex-1 min-h-0">
                    <Table style={{ tableLayout: 'fixed', minWidth: '100%' }} fullHeight={true} className="!rounded-none !border-x-0 !border-t-0">
                        <colgroup>
                            <col style={{ width: WIDTHS.NAME }} />
                            <col style={{ width: WIDTHS.POS }} />
                            {ZONE_CONFIG.map(z => <React.Fragment key={z.id}><col style={{ width: 70 }} /><col style={{ width: 55 }} /></React.Fragment>)}
                        </colgroup>
                        <thead className="bg-slate-950 sticky top-0 z-40 shadow-sm">
                            <tr className="h-10">
                                <th colSpan={2} className="bg-slate-950 border-b border-r border-slate-800 sticky left-0 z-50 align-middle">
                                    <div className="h-full flex items-center justify-center">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Player</span>
                                    </div>
                                </th>
                                {ZONE_CONFIG.map(z => (
                                    <th key={z.id} colSpan={2} className="bg-slate-950 border-b border-r border-slate-800 px-1 align-middle">
                                        <div className="h-full flex items-center justify-center">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{z.label}</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                            <tr className="h-10 text-slate-500 text-[9px] font-black uppercase tracking-widest">
                                {/* Use inline styles to force border removal and width locking */}
                                <TableHeaderCell 
                                    style={{ ...getStickyStyle(0, WIDTHS.NAME), zIndex: 50 }} 
                                    align="left" className="pl-4 bg-slate-950" 
                                    sortable onSort={() => handleSort('name')} sortDirection={sortConfig.key === 'name' ? sortConfig.direction : null}
                                >NAME</TableHeaderCell>
                                <TableHeaderCell 
                                    style={{ ...getStickyStyle(WIDTHS.NAME, WIDTHS.POS, true), zIndex: 50, clipPath: 'inset(0 -15px 0 0)' }} 
                                    className="border-r border-slate-800 bg-slate-950" 
                                    sortable onSort={() => handleSort('position')} sortDirection={sortConfig.key === 'position' ? sortConfig.direction : null}
                                >POS</TableHeaderCell>
                                {ZONE_CONFIG.map(z => (
                                    <React.Fragment key={z.id}>
                                        <TableHeaderCell align="right" className="text-slate-500 border-r border-slate-800 bg-slate-950">M/A</TableHeaderCell>
                                        <TableHeaderCell align="right" className="border-r border-slate-800 text-slate-300" sortable onSort={() => handleSort(`zone_pct_${z.id}`)} sortDirection={sortConfig.key === `zone_pct_${z.id}` ? sortConfig.direction : null}>%</TableHeaderCell>
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        <TableBody>
                            {sortedRoster.map(p => (
                                <TableRow key={p.id} onClick={() => onPlayerClick(p)} className="group">
                                    {/* Use inline styles to force border removal and width locking */}
                                    <TableCell style={getStickyStyle(0, WIDTHS.NAME)} className="pl-4 bg-slate-900 group-hover:bg-slate-800 transition-colors">
                                        <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-indigo-300">{p.name}</span>
                                    </TableCell>
                                    <TableCell 
                                        style={{ ...getStickyStyle(WIDTHS.NAME, WIDTHS.POS, true), clipPath: 'inset(0 -15px 0 0)' }} 
                                        className="border-r border-slate-800 text-slate-500 font-semibold text-xs bg-slate-900 group-hover:bg-slate-800 transition-colors text-center"
                                    >
                                        {p.position}
                                    </TableCell>
                                    
                                    {ZONE_CONFIG.map(z => {
                                        const m = p.stats[z.keyM] || 0;
                                        const a = p.stats[z.keyA] || 0;
                                        const pct = a > 0 ? ((m/a)*100).toFixed(0) + '%' : '-';
                                        return (
                                            <React.Fragment key={z.id}>
                                                <TableCell align="right" className="font-mono font-semibold text-xs text-slate-300 border-r border-slate-800" value={`${m}/${a}`} />
                                                <TableCell align="right" className={`font-mono font-semibold text-xs border-r border-slate-800 ${a > 0 ? (m/a >= 0.4 ? 'text-emerald-400' : 'text-slate-300') : 'text-slate-600'}`} value={pct} />
                                            </React.Fragment>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFoot className="bg-slate-900 border-t-2 border-slate-800 sticky bottom-0 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                            <tr className="h-10">
                                {/* Use inline styles to force border removal and width locking */}
                                <TableCell style={getStickyStyle(0, WIDTHS.NAME)} className="pl-4 text-left bg-slate-950 font-black text-indigo-400 text-[10px] uppercase tracking-widest">TEAM TOTAL</TableCell>
                                <TableCell 
                                    style={{ ...getStickyStyle(WIDTHS.NAME, WIDTHS.POS, true), clipPath: 'inset(0 -15px 0 0)' }} 
                                    className="border-r border-slate-800 bg-slate-950"
                                ></TableCell>
                                {ZONE_CONFIG.map(z => {
                                    const avg = averages.zone[z.id];
                                    const pct = avg.a > 0 ? (avg.pct * 100).toFixed(1) + '%' : '-';
                                    return (
                                        <React.Fragment key={z.id}>
                                            <TableCell align="right" className="font-mono font-semibold text-xs text-slate-400 border-r border-slate-800" value={`${avg.m}/${avg.a}`} />
                                            <TableCell align="right" className="font-mono font-semibold text-xs text-slate-400 border-r border-slate-800" value={pct} />
                                        </React.Fragment>
                                    );
                                })}
                            </tr>
                        </TableFoot>
                    </Table>
                </div>
            )}
        </div>
    );
};
