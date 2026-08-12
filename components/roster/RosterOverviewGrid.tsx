
import React, { useMemo, useState } from 'react';
import { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { StarRating } from '../common/StarRating';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { assignArchetypes, getArchetypeDisplayInfo, getTraitTagDisplayInfo } from '../../services/playerDevelopment/archetypeEvaluator';
import type { PlayerArchetypeState } from '../../types/archetype';

interface RosterOverviewGridProps {
    team: Team;
    onPlayerClick: (player: Player) => void;
}

type SortConfig = { key: string; direction: 'asc' | 'desc' };

const WIDTHS = {
    NAME: 180, POS: 60, AGE: 50, OVR: 60,
    HEIGHT: 70, WEIGHT: 70, ARCHETYPE: 150, SECONDARY: 150, TAGS: 220, RATING: 140,
};

function getPlayerArchetypeState(p: Player): PlayerArchetypeState {
    return p.archetypeState ?? assignArchetypes(p, '2025-26');
}

const getStickyStyle = (left: number, width: number, isLast: boolean = false) => ({
    left, width, minWidth: width, maxWidth: width,
    position: 'sticky' as const,
    zIndex: 30,
    borderRight: isLast ? undefined : 'none',
});

export const RosterOverviewGrid: React.FC<RosterOverviewGridProps> = ({ team, onPlayerClick }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ovr', direction: 'desc' });

    const handleSort = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const getSortValue = (p: Player, key: string): number | string => {
        if (key === 'name') return p.name;
        if (key === 'position') return p.position;
        if (key === 'age') return p.age;
        if (key === 'ovr') return calculatePlayerOvr(p);
        if (key === 'height') return p.height ?? 0;
        if (key === 'weight') return p.weight ?? 0;
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
    }, [team.roster, sortConfig]);

    const LEFT_POS = WIDTHS.NAME;
    const LEFT_AGE = WIDTHS.NAME + WIDTHS.POS;
    const LEFT_OVR = WIDTHS.NAME + WIDTHS.POS + WIDTHS.AGE;

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0">
                <Table style={{ tableLayout: 'fixed', minWidth: '100%' }} fullHeight className="!rounded-none !border-x-0 !border-t-0 !bg-slate-950">
                    <colgroup>
                        <col style={{ width: WIDTHS.NAME }} />
                        <col style={{ width: WIDTHS.POS }} />
                        <col style={{ width: WIDTHS.AGE }} />
                        <col style={{ width: WIDTHS.OVR }} />
                        <col style={{ width: WIDTHS.RATING }} />
                        <col style={{ width: WIDTHS.HEIGHT }} />
                        <col style={{ width: WIDTHS.WEIGHT }} />
                        <col style={{ width: WIDTHS.ARCHETYPE }} />
                        <col style={{ width: WIDTHS.SECONDARY }} />
                        <col style={{ width: WIDTHS.TAGS }} />
                    </colgroup>
                    <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                        <tr className="h-10 text-slate-500 text-sm font-black uppercase tracking-widest">
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
                                style={{ ...getStickyStyle(LEFT_OVR, WIDTHS.OVR, true), zIndex: 50 }}
                                className="bg-slate-950 border-r border-slate-800"
                                sortable onSort={() => handleSort('ovr')} sortDirection={sortConfig.key === 'ovr' ? sortConfig.direction : null}
                            >OVR</TableHeaderCell>
                            <TableHeaderCell width={WIDTHS.RATING} className="border-r border-slate-800">레이팅</TableHeaderCell>
                            <TableHeaderCell width={WIDTHS.HEIGHT} className="border-r border-slate-800" sortable onSort={() => handleSort('height')} sortDirection={sortConfig.key === 'height' ? sortConfig.direction : null}>키</TableHeaderCell>
                            <TableHeaderCell width={WIDTHS.WEIGHT} className="border-r border-slate-800" sortable onSort={() => handleSort('weight')} sortDirection={sortConfig.key === 'weight' ? sortConfig.direction : null}>몸무게</TableHeaderCell>
                            <TableHeaderCell colSpan={2} className="border-r border-slate-800">아키타입</TableHeaderCell>
                            <TableHeaderCell width={WIDTHS.TAGS} align="left" className="pl-3">태그</TableHeaderCell>
                        </tr>
                    </TableHead>
                    <TableBody>
                        {sortedRoster.map(p => {
                            const archetypeState = getPlayerArchetypeState(p);
                            const primaryInfo = getArchetypeDisplayInfo(archetypeState.primary);
                            const secondaryInfo = archetypeState.secondary ? getArchetypeDisplayInfo(archetypeState.secondary) : null;
                            const tagInfos = archetypeState.tags.slice(0, 3).map(t => getTraitTagDisplayInfo(t));

                            return (
                                <TableRow key={p.id} className="group">
                                    <TableCell align="left" style={getStickyStyle(0, WIDTHS.NAME)} className="pl-4 bg-slate-900 group-hover:bg-slate-800 transition-colors">
                                        <span className="text-sm font-semibold text-white truncate hover:text-indigo-400 cursor-pointer transition-colors" onClick={() => onPlayerClick(p)}>{p.name}</span>
                                    </TableCell>
                                    <TableCell style={getStickyStyle(LEFT_POS, WIDTHS.POS)} className="text-white font-semibold text-sm bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">{p.position}</TableCell>
                                    <TableCell style={getStickyStyle(LEFT_AGE, WIDTHS.AGE)} className="text-white font-semibold text-sm bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">{p.age}</TableCell>
                                    <TableCell style={getStickyStyle(LEFT_OVR, WIDTHS.OVR, true)} className="border-r border-slate-800 bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">
                                        <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                                    </TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30">
                                        <div className="flex justify-center"><StarRating ovr={calculatePlayerOvr(p)} size="lg" /></div>
                                    </TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-white">{p.height ? `${p.height}cm` : '-'}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-white">{p.weight ? `${p.weight}kg` : '-'}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm font-normal text-white truncate">{primaryInfo.label}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm font-normal text-white truncate">{secondaryInfo ? secondaryInfo.label : ''}</TableCell>
                                    <TableCell align="left" className="pl-3">
                                        <div className="flex flex-wrap gap-1">
                                            {tagInfos.length === 0 && <span className="text-sm text-slate-600">-</span>}
                                            {tagInfos.map((t, i) => (
                                                <span
                                                    key={i}
                                                    className="text-sm font-normal text-white whitespace-nowrap"
                                                >
                                                    {t.label}{i < tagInfos.length - 1 ? ',' : ''}
                                                </span>
                                            ))}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};
