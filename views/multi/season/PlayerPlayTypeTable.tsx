import React, { useMemo } from 'react';
import { Table, TableHead, TableBody, TableFoot, TableRow, TableHeaderCell, TableCell } from '../../../components/common/Table';
import { Spinner } from '../../../components/common/Spinner';
import { InlineNotice } from '../../../components/common/InlineNotice';
import { PLAY_TYPES_WITH_TRANSITION } from '../../../components/dashboard/tactics/charts/playTypeConstants';
import { usePlayerPlayTypeStats } from '../../../hooks/usePlayerPlayTypeStats';
import { useTeamPlayTypeStats } from '../../../hooks/useTeamPlayTypeStats';

// [2026-11-16] 선수 프로필 샷 차트 탭 하단 "플레이타입별 기록" — 선수의 플레이타입별 포제션·PPP(자유투·턴오버 포함)를 리그 평균과 비교.
// 리그 평균 = 같은 플레이타입의 전체 팀 합(get_team_playtype_stats 재사용 — 선수 집계와 같은 엔진 규칙).
// 팀 전술 화면(PlayTypePPP)과 달리 풋백도 보여준다(빅맨은 풋백 비중이 커서 빼면 선수 합이 비어 보임).
// 샷 차트 필터(결과·쿼터·슛 타입·상대팀)는 슛 단위라 적용하지 않고, 정규/플레이오프 토글만 따른다.

const PLAY_TYPE_LABELS: Record<string, string> = {
    ...Object.fromEntries(PLAY_TYPES_WITH_TRANSITION.map(p => [p.key, p.label])),
    Putback: '풋백',
};
const PPP_COLOR_THRESHOLD = 0.03;   // 팀 PPP 화면과 같은 기준
const PPP_MIN_POSS = 10;            // 이 미만이면 흐리게(표본 적음)

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-');

export const PlayerPlayTypeTable: React.FC<{ roomId: string | undefined | null; playerId: string; isPlayoff: boolean; isPhone: boolean }> = ({ roomId, playerId, isPlayoff, isPhone }) => {
    const { data: mine, isPending, isError } = usePlayerPlayTypeStats(roomId, playerId, isPlayoff);
    const { data: league } = useTeamPlayTypeStats(roomId, isPlayoff);

    const view = useMemo(() => {
        if (!mine) return null;
        const lg: Record<string, { pts: number; poss: number }> = {};
        for (const byPt of Object.values(league?.totals ?? {})) {
            for (const [pt, l] of Object.entries(byPt)) {
                const x = (lg[pt] ??= { pts: 0, poss: 0 });
                x.pts += l.pts; x.poss += l.poss;
            }
        }
        const total = { poss: 0, pts: 0, fga: 0, fgm: 0, tov: 0 };
        const rows = Object.entries(mine)
            .filter(([, l]) => l.poss > 0)
            .map(([pt, l]) => {
                total.poss += l.poss; total.pts += l.pts; total.fga += l.fga; total.fgm += l.fgm; total.tov += l.tov;
                const ppp = l.pts / l.poss;
                const avg = lg[pt]?.poss ? lg[pt].pts / lg[pt].poss : null;
                return { key: pt, label: PLAY_TYPE_LABELS[pt] ?? pt, ...l, ppp, avg, small: l.poss < PPP_MIN_POSS };
            })
            .sort((a, b) => b.poss - a.poss || a.key.localeCompare(b.key));
        return { rows, total };
    }, [mine, league]);

    const first = isPhone ? 'pl-4' : '';
    const last = isPhone ? 'pr-4' : '';

    let body: React.ReactNode;
    if (isError) body = <InlineNotice tone="danger" size="sm">플레이타입별 기록을 불러오지 못했습니다</InlineNotice>;
    else if (isPending || !view) body = <Spinner variant="section" />;
    else if (view.rows.length === 0) return null;
    else body = (
        <Table variant="bare" dividers={false} className="text-sm">
            <TableHead>
                <TableHeaderCell align="left" className={first}>{isPhone ? '플레이타입별 기록' : '플레이타입'}</TableHeaderCell>
                <TableHeaderCell align="right">횟수</TableHeaderCell>
                <TableHeaderCell align="right">비중</TableHeaderCell>
                <TableHeaderCell align="right">PPP</TableHeaderCell>
                <TableHeaderCell align="right">리그평균</TableHeaderCell>
                <TableHeaderCell align="right" className={isPhone ? last : ''}>+/-</TableHeaderCell>
                {!isPhone && <TableHeaderCell align="right">FG%</TableHeaderCell>}
                {!isPhone && <TableHeaderCell align="right">TOV%</TableHeaderCell>}
            </TableHead>
            <TableBody>
                {view.rows.map(r => {
                    const delta = r.avg === null ? null : r.ppp - r.avg;
                    const tone = delta === null || r.small ? 'text-slate-500'
                        : delta >= PPP_COLOR_THRESHOLD ? 'text-emerald-400' : delta <= -PPP_COLOR_THRESHOLD ? 'text-rose-400' : 'text-slate-300';
                    return (
                        <TableRow key={r.key} className={r.small ? 'opacity-50' : ''}>
                            <TableCell align="left" className={`text-white font-medium ${first}`}>{r.label}</TableCell>
                            <TableCell align="right" className="text-slate-200 tabular-nums">{r.poss}</TableCell>
                            <TableCell align="right" className="text-slate-200 tabular-nums">{pct(r.poss, view.total.poss)}</TableCell>
                            <TableCell align="right" className="text-white tabular-nums">{r.ppp.toFixed(2)}</TableCell>
                            <TableCell align="right" className="text-slate-500 tabular-nums">{r.avg === null ? '-' : r.avg.toFixed(2)}</TableCell>
                            <TableCell align="right" className={`tabular-nums ${tone} ${isPhone ? last : ''}`}>
                                {delta === null ? '-' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`}
                            </TableCell>
                            {!isPhone && <TableCell align="right" className="text-slate-200 tabular-nums">{pct(r.fgm, r.fga)}</TableCell>}
                            {!isPhone && <TableCell align="right" className="text-slate-200 tabular-nums">{pct(r.tov, r.poss)}</TableCell>}
                        </TableRow>
                    );
                })}
            </TableBody>
            <TableFoot>
                <tr>
                    <TableCell align="left" className={`text-white ${first}`}>전체</TableCell>
                    <TableCell align="right" className="text-white tabular-nums">{view.total.poss}</TableCell>
                    <TableCell />
                    <TableCell align="right" className="text-white tabular-nums">{(view.total.pts / view.total.poss).toFixed(2)}</TableCell>
                    <TableCell />
                    <TableCell className={isPhone ? last : ''} />
                    {!isPhone && <TableCell align="right" className="text-white tabular-nums">{pct(view.total.fgm, view.total.fga)}</TableCell>}
                    {!isPhone && <TableCell align="right" className="text-white tabular-nums">{pct(view.total.tov, view.total.poss)}</TableCell>}
                </tr>
            </TableFoot>
        </Table>
    );

    return (
        <div className={isPhone ? 'pb-4' : 'p-4'}>
            {!isPhone && <div className="text-xs text-slate-500 mb-2">플레이타입별 기록</div>}
            {body}
        </div>
    );
};
