
import React, { useMemo } from 'react';
import type { Player } from '../../../../types';
import { ZONE_CONFIG, ZONE_AVG } from '../../../../utils/courtZones';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../../common/Table';
import { PlayerNameLink } from '../../../common/PlayerNameLink';
import { InsightCard } from './InsightCard';
import { useIsPhone } from '../../../../hooks/useViewportClass';

// TeamZoneChart.tsx의 ZONE_STAT_MAP과 동일(그쪽은 export 안 되어 있어 로컬로 재정의) — 10존
// 각각의 원시 zone_*_m/zone_*_a 스탯 키. ZONE_CONFIG 선언 순서 그대로 테이블 행 순서로 사용.
const ZONE_STAT_KEYS: Record<string, { m: string; a: string }> = {
    rim: { m: 'zone_rim_m', a: 'zone_rim_a' },
    paint: { m: 'zone_paint_m', a: 'zone_paint_a' },
    midL: { m: 'zone_mid_l_m', a: 'zone_mid_l_a' },
    midC: { m: 'zone_mid_c_m', a: 'zone_mid_c_a' },
    midR: { m: 'zone_mid_r_m', a: 'zone_mid_r_a' },
    c3L: { m: 'zone_c3_l_m', a: 'zone_c3_l_a' },
    c3R: { m: 'zone_c3_r_m', a: 'zone_c3_r_a' },
    atb3L: { m: 'zone_atb3_l_m', a: 'zone_atb3_l_a' },
    atb3C: { m: 'zone_atb3_c_m', a: 'zone_atb3_c_a' },
    atb3R: { m: 'zone_atb3_r_m', a: 'zone_atb3_r_a' },
};

type Leader = { player: Player; value: number } | null;

interface ZoneRow {
    key: string;
    label: string;
    m: number;
    a: number;
    pct: number;
    avg: number;
    countLeader: Leader;
    pctLeader: Leader;
}

/** "리더 이름 | 값" 두 칸 — 성공개수 리더와 성공률 리더가 값 포맷만 다른 같은 구조(감사 Y5) */
const LeaderCells: React.FC<{ leader: Leader; format: (v: number) => string; teamAbbr?: string; onPlayerClick?: (p: Player) => void }> = ({ leader, format, teamAbbr, onPlayerClick }) => (
    leader ? (
        <>
            <TableCell align="left"><PlayerNameLink player={leader.player} teamAbbr={teamAbbr} onClick={onPlayerClick} className="block" /></TableCell>
            <TableCell align="left" className="text-sm text-slate-300 tabular-nums">{format(leader.value)}</TableCell>
        </>
    ) : (
        <>
            <TableCell align="left" className="text-sm text-slate-600">-</TableCell>
            <TableCell />
        </>
    )
);

/** 기존 TeamZoneEfficiencyTable(존별 팀 전체 성공/시도·FG%)과 TeamZoneLeadersTable(존별
 *  성공개수·성공률 팀 내 1위 선수)을 한 행에 합친 테이블. 두 표 모두 ZONE_CONFIG 순서를
 *  그대로 행 순서로 쓰던 걸 하나의 useMemo에서 같이 계산. 선수명은 클릭 시 onPlayerClick으로
 *  프로필 이동, hover 시 PlayerHoverCard(항상 활성 — MultiTacticsView.tsx 전용 컴포넌트라
 *  enableHoverCard 게이트 불필요).
 *  [2026-10-13] flex-div 표(빈 span으로 열 맞추던 구조) → 공용 Table(bare, 리더 헤더 colSpan=2). */
export const TeamZoneStatsTable: React.FC<{ roster: Player[]; teamAbbr?: string; onPlayerClick?: (player: Player) => void }> = ({ roster, teamAbbr, onPlayerClick }) => {
    const rows = useMemo((): ZoneRow[] => {
        return ZONE_CONFIG.map(cfg => {
            const stat = ZONE_STAT_KEYS[cfg.key];
            const m = roster.reduce((sum, p) => sum + ((p.stats as any)[stat.m] || 0), 0);
            const a = roster.reduce((sum, p) => sum + ((p.stats as any)[stat.a] || 0), 0);

            let countLeader: Leader = null;
            let pctLeader: Leader = null;
            for (const p of roster) {
                const pm = (p.stats as any)[stat.m] || 0;
                const pa = (p.stats as any)[stat.a] || 0;
                if (pm > 0 && (!countLeader || pm > countLeader.value)) {
                    countLeader = { player: p, value: pm };
                }
                if (pa > 0) {
                    const ppct = pm / pa;
                    if (!pctLeader || ppct > pctLeader.value) {
                        pctLeader = { player: p, value: ppct };
                    }
                }
            }

            return {
                key: cfg.key,
                label: cfg.label,
                m,
                a,
                pct: a > 0 ? m / a : 0,
                avg: ZONE_AVG[cfg.avgKey],
                countLeader,
                pctLeader,
            };
        });
    }, [roster]);

    // [2026-10-28] 폰(<768, §9-1-11 X6): 7열 가로 스크롤 — "존" 열만 sticky(배경은 PlayerStatsTable과 같은 혼합색)
    const phone = useIsPhone();
    const stickyZone = (odd: boolean) => (phone ? `sticky left-0 z-30 ${odd ? 'bg-[#121a2d]' : 'bg-[#070d1f]'}` : '');

    return (
        <InsightCard title="존별 효율 · 리더">
            <Table variant="bare" dividers={false}>
                <TableHead>
                    <TableHeaderCell align="left" stickyLeft={phone ? 0 : undefined}>존</TableHeaderCell>
                    <TableHeaderCell align="left">성공/시도</TableHeaderCell>
                    <TableHeaderCell align="left">FG%</TableHeaderCell>
                    <TableHeaderCell align="left" colSpan={2}>성공개수 리더</TableHeaderCell>
                    <TableHeaderCell align="left" colSpan={2}>성공률 리더</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {rows.map((row, i) => {
                        const diff = row.pct - row.avg;
                        const diffColor = diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-500';
                        return (
                            <TableRow key={row.key} className={i % 2 === 1 ? 'bg-slate-700/25' : ''}>
                                <TableCell align="left" className={`text-sm text-slate-400 ${stickyZone(i % 2 === 1)}`}>{row.label}</TableCell>
                                <TableCell align="left" className="text-sm text-white tabular-nums">{row.m}/{row.a}</TableCell>
                                <TableCell align="left" className="text-sm text-white tabular-nums">
                                    {(row.pct * 100).toFixed(1)}%
                                    <span className={`ml-1 ${diffColor}`}>({diff > 0 ? '+' : ''}{(diff * 100).toFixed(1)})</span>
                                </TableCell>
                                <LeaderCells leader={row.countLeader} format={v => String(v)} teamAbbr={teamAbbr} onPlayerClick={onPlayerClick} />
                                <LeaderCells leader={row.pctLeader} format={v => `${(v * 100).toFixed(1)}%`} teamAbbr={teamAbbr} onPlayerClick={onPlayerClick} />
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </InsightCard>
    );
};
