import React, { useMemo } from 'react';
import { Table, TableHead, TableBody, TableFoot, TableRow, TableHeaderCell, TableCell } from '../../../components/common/Table';
import { Spinner } from '../../../components/common/Spinner';
import { InlineNotice } from '../../../components/common/InlineNotice';
import { PLAY_TYPES_WITH_TRANSITION } from '../../../components/dashboard/tactics/charts/playTypeConstants';
import { usePlayerPlayTypeStats, useLeaguePlayerPlayTypeStats } from '../../../hooks/usePlayerPlayTypeStats';

// [2026-11-16] 선수 프로필 샷 차트 탭 하단 "플레이타입별 기록" — 선수의 플레이타입별 포제션·PPP(자유투·턴오버 포함)를 리그 평균과 비교.
// 팀 전술 화면(PlayTypePPP)과 달리 풋백도 보여준다(빅맨은 풋백 비중이 커서 빼면 선수 합이 비어 보임).
// 샷 차트 필터(결과·쿼터·슛 타입·상대팀)는 슛 단위라 적용하지 않고, 정규/플레이오프 토글만 따른다.
// [2026-11-21] 기록이 없어도 모든 플레이타입을 표시(+ 킥아웃). 리그 평균은 PPP 옆 괄호로, 리그 평균 = 선수 집계 합(get_league_player_playtype_stats —
//   선수 집계는 킥아웃 슛을 Kickout으로 떼어 내 팀 집계와 기준이 다름). PPP 오른쪽에 CPP·PO·AST/Play·PAST(엔진 statsMappers.passCreation 집계):
//   PO = 이 플레이를 패스로 끝낸 횟수, 플레이 = 횟수 + PO, CPP = (득점 + PAST) ÷ 플레이, AST/Play = 어시스트 ÷ 플레이, PAST = 어시스트된 야투 득점.

const ALL_PLAY_TYPES: { key: string; label: string }[] = [
    ...PLAY_TYPES_WITH_TRANSITION.map(p => ({ key: p.key, label: p.label })),
    { key: 'Putback', label: '풋백' },
    { key: 'Kickout', label: '킥아웃' },
];
const PPP_COLOR_THRESHOLD = 0.03;   // 팀 PPP 화면과 같은 기준
// [2026-11-21] 표본 적은 행 흐리게(PPP_MIN_POSS 10) 폐지 — 사용자 요청으로 전부 같은 색

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-');
const ratio = (n: number, d: number) => (d > 0 ? (n / d).toFixed(2) : '-');

export const PlayerPlayTypeTable: React.FC<{ roomId: string | undefined | null; playerId: string; isPlayoff: boolean; isPhone: boolean }> = ({ roomId, playerId, isPlayoff, isPhone }) => {
    const { data: mine, isPending, isError } = usePlayerPlayTypeStats(roomId, playerId, isPlayoff);
    const { data: league } = useLeaguePlayerPlayTypeStats(roomId, isPlayoff);

    const view = useMemo(() => {
        if (!mine) return null;
        const total = { poss: 0, pts: 0, fga: 0, fgm: 0, tov: 0, po: 0, ast: 0, past: 0 };
        const rows = ALL_PLAY_TYPES
            .map((pt, order) => {
                const l = mine[pt.key] ?? { poss: 0, pts: 0, fga: 0, fgm: 0, fta: 0, tov: 0, po: 0, ast: 0, past: 0 };
                total.poss += l.poss; total.pts += l.pts; total.fga += l.fga; total.fgm += l.fgm; total.tov += l.tov;
                total.po += l.po; total.ast += l.ast; total.past += l.past;
                const lg = league?.[pt.key];
                return {
                    ...pt, ...l, order,
                    ppp: l.poss > 0 ? l.pts / l.poss : null,
                    avg: lg?.poss ? lg.pts / lg.poss : null,
                    plays: l.poss + l.po,
                };
            })
            .sort((a, b) => b.plays - a.plays || a.order - b.order);
        return { rows, total };
    }, [mine, league]);

    const first = isPhone ? 'pl-4' : '';
    const last = isPhone ? 'pr-4' : '';

    let body: React.ReactNode;
    if (isError) body = <InlineNotice tone="danger" size="sm">플레이타입별 기록을 불러오지 못했습니다</InlineNotice>;
    else if (isPending || !view) body = <Spinner variant="section" />;
    else body = (
        <Table variant="bare" dividers={false} className="text-sm">
            <TableHead>
                <TableHeaderCell align="left" className={first}>{isPhone ? '플레이타입별 기록' : '플레이타입'}</TableHeaderCell>
                <TableHeaderCell align="right">횟수</TableHeaderCell>
                <TableHeaderCell align="right">비중</TableHeaderCell>
                <TableHeaderCell align="right">PPP</TableHeaderCell>
                <TableHeaderCell align="right">CPP</TableHeaderCell>
                <TableHeaderCell align="right">PO</TableHeaderCell>
                <TableHeaderCell align="right">AST/Play</TableHeaderCell>
                <TableHeaderCell align="right">PAST</TableHeaderCell>
                <TableHeaderCell align="right" className={isPhone ? last : ''}>+/-</TableHeaderCell>
                {!isPhone && <TableHeaderCell align="right">FG%</TableHeaderCell>}
                {!isPhone && <TableHeaderCell align="right">TOV%</TableHeaderCell>}
            </TableHead>
            <TableBody>
                {view.rows.map(r => {
                    const delta = r.ppp === null || r.avg === null ? null : r.ppp - r.avg;
                    const tone = delta === null ? 'text-slate-500'
                        : delta >= PPP_COLOR_THRESHOLD ? 'text-emerald-400' : delta <= -PPP_COLOR_THRESHOLD ? 'text-rose-400' : 'text-slate-300';
                    return (
                        <TableRow key={r.key}>
                            <TableCell align="left" className={`text-white font-medium ${first}`}>{r.label}</TableCell>
                            <TableCell align="right" className="text-slate-200 tabular-nums">{r.poss}</TableCell>
                            <TableCell align="right" className="text-slate-200 tabular-nums">{pct(r.poss, view.total.poss)}</TableCell>
                            <TableCell align="right" className="text-white tabular-nums whitespace-nowrap">
                                {r.ppp === null ? '-' : r.ppp.toFixed(2)}
                                <span className="text-slate-500"> ({r.avg === null ? '-' : r.avg.toFixed(2)})</span>
                            </TableCell>
                            <TableCell align="right" className="text-slate-200 tabular-nums">{ratio(r.pts + r.past, r.plays)}</TableCell>
                            <TableCell align="right" className="text-slate-200 tabular-nums">{r.po}</TableCell>
                            <TableCell align="right" className="text-slate-200 tabular-nums">{ratio(r.ast, r.plays)}</TableCell>
                            <TableCell align="right" className="text-slate-200 tabular-nums">{r.past}</TableCell>
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
                    <TableCell align="right" className="text-white tabular-nums">{ratio(view.total.pts, view.total.poss)}</TableCell>
                    <TableCell align="right" className="text-white tabular-nums">{ratio(view.total.pts + view.total.past, view.total.poss + view.total.po)}</TableCell>
                    <TableCell align="right" className="text-white tabular-nums">{view.total.po}</TableCell>
                    <TableCell align="right" className="text-white tabular-nums">{ratio(view.total.ast, view.total.poss + view.total.po)}</TableCell>
                    <TableCell align="right" className="text-white tabular-nums">{view.total.past}</TableCell>
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
