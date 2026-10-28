// PhoneRosterAttributes.tsx — 폰(<768) 팀 화면 "능력치" 탭 표. [2026-10-27 모바일 팀 화면]
// docs/ui/mobile-design-system.md §9-1-2, 캔버스 5행 E3·E4. 데스크톱 RosterGrid(tab="roster")의 폰판 — 공용 Table(flush · phone · scroll parent):
//   헤더 2단(그룹 28: COMPACT_ATTR_GROUPS 6군 TableGroupHeaderCell + 열 36: 약어, 정렬 화살표) · 능력치 21열 48 · 값 TableCell attribute colorScale ·
//   sticky "선수" 열 136(PhonePlayerCell — 로스터 탭과 동일: 체력 바·부상·TW) · 행 44 · TableFoot "팀 평균" sticky bottom(탭 바 56 + 안전영역 위).
//   값·평균 계산은 데스크톱과 같은 getCompactAttrValue(콤보는 평균 반올림). 군 경계는 헤더·본문·푸터 전부 우측 1px(각 군 마지막 열).
// [2026-10-27 개정] 네이티브 <table> → 공용 Table(사용자 결정: 색·선·화살표를 데스크톱과 한 곳에서 관리).
import React, { useMemo } from 'react';
import type { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { COMPACT_ATTR_GROUPS, COMPACT_ITEM_BY_KEY, getCompactAttrValue } from '../../data/attributeConfig';
import { useTableSort, sortByConfig } from '../../hooks/useTableSort';
import { Table, TableHead, TableBody, TableFoot, TableRow, TableHeaderCell, TableCell, TableGroupHeaderCell } from '../common/Table';
import { PhonePlayerCell, PHONE_STICKY_COL_WIDTH } from './PhoneRosterOverview';

interface PhoneRosterAttributesProps {
    team: Team;
    onPlayerClick: (player: Player) => void;
    /** 로스터 탭과 같은 체력 맵 — 선수 칸 정보(체력 바·부상·TW)는 탭 공통(2026-10-27 사용자 지시) */
    playerConditions?: Map<string, number | null>;
}

const ATTR_COL_WIDTH = 48;
const ITEMS = COMPACT_ATTR_GROUPS.flatMap(g => g.items);
// 군 경계(각 군의 마지막 열) — 헤더·본문·팀 평균 행 모두 우측 1px slate-800(헤더에만 있으면 구분이 안 됨, 2026-10-27 사용자 피드백)
const GROUP_END_KEYS = new Set(COMPACT_ATTR_GROUPS.map(g => g.items[g.items.length - 1].key));
const groupEdge = (key: string) => (GROUP_END_KEYS.has(key) ? 'border-r border-slate-800' : '');
/** 팀 평균 행의 bottom 오프셋 — 하단 탭 바 56 + 안전영역 */
const FOOT_BOTTOM = 'calc(56px + env(safe-area-inset-bottom, 0px))';

export const PhoneRosterAttributes: React.FC<PhoneRosterAttributesProps> = ({ team, onPlayerClick, playerConditions }) => {
    const { sortConfig, sortProps } = useTableSort({ key: 'ovr', direction: 'desc' });
    const rows = useMemo(() => sortByConfig(team.roster, sortConfig, (p, key) =>
        key === 'ovr' ? calculatePlayerOvr(p) : getCompactAttrValue(p, COMPACT_ITEM_BY_KEY[key])), [team.roster, sortConfig]);

    const averages = useMemo(() => {
        const n = team.roster.length || 1;
        const m: Record<string, number> = {};
        for (const item of ITEMS) m[item.key] = Math.round(team.roster.reduce((s, p) => s + getCompactAttrValue(p, item), 0) / n);
        return m;
    }, [team.roster]);

    return (
        <Table variant="flush" density="phone" scroll="parent" dividers={false}>
            <TableHead noRow>
                {/* 그룹 헤더 28 — INSIDE · OUTSIDE · PLAYMAKING · DEFENSE · REBOUND · ATHLETIC(라벨 칸 우측 1px = 군 경계) */}
                <tr className="h-7">
                    <TableGroupHeaderCell stickyLeft={0} className="!px-4"><span className="block text-left">선수 정보</span></TableGroupHeaderCell>
                    {COMPACT_ATTR_GROUPS.map(g => (
                        <TableGroupHeaderCell key={g.id} colSpan={g.items.length} className="border-r border-slate-800">{g.label}</TableGroupHeaderCell>
                    ))}
                </tr>
                {/* 열 헤더 36 */}
                <tr className="h-9 text-slate-400 text-xs font-bold">
                    <TableHeaderCell stickyLeft={0} width={PHONE_STICKY_COL_WIDTH} align="left" className="pl-4" {...sortProps('ovr')}>선수</TableHeaderCell>
                    {ITEMS.map(item => (
                        <TableHeaderCell key={item.key} width={ATTR_COL_WIDTH} title={item.krLabel ?? item.label} className={groupEdge(item.key)} {...sortProps(item.key)}>
                            {item.label}
                        </TableHeaderCell>
                    ))}
                </tr>
            </TableHead>
            <TableBody>
                {rows.map(p => (
                    <TableRow key={p.id} onClick={() => onPlayerClick(p)}>
                        <TableCell stickyLeft={0} width={PHONE_STICKY_COL_WIDTH} align="left" className="pl-4">
                            <PhonePlayerCell player={p} condition={playerConditions ? (playerConditions.has(p.id) ? (playerConditions.get(p.id) as number | null) : undefined) : undefined} />
                        </TableCell>
                        {ITEMS.map(item => (
                            <TableCell key={item.key} width={ATTR_COL_WIDTH} variant="attribute" colorScale value={getCompactAttrValue(p, item)} className={`text-sm ${groupEdge(item.key)}`} />
                        ))}
                    </TableRow>
                ))}
            </TableBody>
            {/* 팀 평균 — 세로 스크롤 상자 하단(탭 바 위)에 고정. 아래 선으로 표 끝 표시. */}
            <TableFoot stickyBottom={FOOT_BOTTOM} className="border-b border-slate-800">
                <tr className="h-11">
                    <TableCell stickyLeft={0} width={PHONE_STICKY_COL_WIDTH} align="left" className="pl-4 font-bold text-indigo-400 text-sm">팀 평균</TableCell>
                    {ITEMS.map(item => (
                        <TableCell key={item.key} width={ATTR_COL_WIDTH} variant="attribute" colorScale value={averages[item.key]} className={`text-sm ${groupEdge(item.key)}`} />
                    ))}
                </tr>
            </TableFoot>
        </Table>
    );
};
