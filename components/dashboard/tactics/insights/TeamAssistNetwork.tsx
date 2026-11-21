// TeamAssistNetwork.tsx — 팀 전술 › 인사이트 최하단 "어시스트 네트워크". [2026-11-21]
// 하프코트 위 포지션 자리에 선수(등번호 원)를 놓고, 패스한 선수 → 받아 넣은 선수 방향 화살표를 어시스트 수 4단계(굵기·색)로 그린다.
// 데이터 = team_assist_pairs(엔진 statsMappers.recordAssistPair — 어시스트가 인정된 야투만). 보관본 엔진 방(stable)은 기록이 없다.
// 노드 = 현재 로스터 중 어시스트를 주거나 받은 선수(떠난 선수와의 쌍은 표시하지 않음). 선수 위에 올리면 그 선수의 선만 강조.
// 사용자 참고 이미지: 축구 패스 네트워크(경기장 위 번호 원 + 4단계 화살표 + 범례 + 선수 목록) — 배치는 사용자 선택 "하프코트 + 포지션 자리".
import React, { useMemo, useState } from 'react';
import type { Player } from '../../../../types';
import { COURT_LINES } from '../../../../utils/courtZones';
import { InsightCard } from './InsightCard';
import { Spinner } from '../../../common/Spinner';
import { InlineNotice } from '../../../common/InlineNotice';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../../common/Table';
import { PlayerNameLink } from '../../../common/PlayerNameLink';
import { SeasonTypeToggle } from '../../../roster/StatsToggles';
import type { SeasonType } from '../../../../hooks/useLeaderboardData';
import type { AssistPairTotal } from '../../../../hooks/useTeamAssistPairs';

// 435×403 캔버스(COURT_LINES와 같은 좌표 — 림이 아래). 포지션 자리 + 같은 포지션 여럿일 때 펼치는 방향.
const SLOTS: Record<string, { x: number; y: number; dx: number; dy: number }> = {
    PG: { x: 217, y: 92,  dx: 1, dy: 0 },   // 탑
    SG: { x: 368, y: 200, dx: 0, dy: 1 },   // 우측 윙
    SF: { x: 67,  y: 200, dx: 0, dy: 1 },   // 좌측 윙
    PF: { x: 300, y: 285, dx: 0, dy: 1 },   // 우측 엘보·숏코너
    C:  { x: 135, y: 318, dx: 0, dy: 1 },   // 좌측 블록
};
const SLOT_STEP = 40;
const NODE_R = 13;
const EDGE_GAP = 3.5;   // 양방향 화살표가 겹치지 않게 진행 방향 오른쪽으로 비키는 거리

// 4단계 = 팀 내 최다 쌍 대비 비율(25% 단위). 색·굵기는 참고 이미지 톤(드묾 = 푸른 회색 → 매우 잦음 = 밝은 초록).
const TIERS = [
    { label: '드묾',      color: '#3e5872', width: 1.5, opacity: 0.5 },
    { label: '가끔',      color: '#2b8a8a', width: 2.5, opacity: 0.75 },
    { label: '잦음',      color: '#7cbf72', width: 4,   opacity: 0.9 },
    { label: '매우 잦음', color: '#1ff27a', width: 6,   opacity: 1 },
];
// [2026-11-21] 화살촉 = 선 굵기 비례 삼각형(SVG marker 대신 직접 그림) — marker는 선 끝(둥근 캡)이 촉 끝 밖으로 비어져 나오고
//   촉 크기가 굵기와 따로 놀아 어색했다(사용자 지적). 선은 촉 밑변에서 끊는다(butt 캡).
const headLenOf = (w: number) => Math.max(7, w * 2.4);
const headHalfOf = (w: number) => Math.max(3.5, w * 1.5);
const tierOf = (ast: number, max: number) => {
    const t = max > 0 ? ast / max : 0;
    return t < 0.25 ? 0 : t < 0.5 ? 1 : t < 0.75 ? 2 : 3;
};

/** 원 안 표시 — 등번호, 없으면 이름 마지막 단어 앞 두 글자 */
const badgeText = (p: Player) => {
    if (p.jerseyNumber != null) return String(p.jerseyNumber);
    const parts = (p.name ?? '').trim().split(/\s+/);
    return (parts[parts.length - 1] ?? '').slice(0, 2);
};

interface Props {
    roster: Player[];
    pairs: AssistPairTotal[] | undefined;
    isPending: boolean;
    isError: boolean;
    seasonType: SeasonType;
    onSeasonTypeChange: (v: SeasonType) => void;
    teamAbbr?: string;
    onPlayerClick?: (player: Player) => void;
    /** [2026-11-21] 노드(번호 원) 팀 색 — utils/teamTheme getTeamTheme 결과(bg = 원 바탕, text = 번호, accent = 테두리). 없으면 흰 원 */
    teamTheme?: { bg: string; text: string; accent: string };
}

export const TeamAssistNetwork: React.FC<Props> = ({ roster, pairs, isPending, isError, seasonType, onSeasonTypeChange, teamAbbr, onPlayerClick, teamTheme }) => {
    const nodeBg = teamTheme?.bg ?? '#f8fafc', nodeText = teamTheme?.text ?? '#0f172a', nodeRing = teamTheme?.accent ?? '#0f172a';
    const [focusId, setFocusId] = useState<string | null>(null);
    // [2026-11-21] 노드 팝업 — 코트의 선수 원에 올렸을 때만(목록 행 호버는 선 강조만)
    const [popupId, setPopupId] = useState<string | null>(null);

    const view = useMemo(() => {
        if (!pairs) return null;
        const byId = new Map(roster.map(p => [p.id, p]));
        const edges = pairs.filter(e => e.ast > 0 && e.passerId !== e.receiverId && byId.has(e.passerId) && byId.has(e.receiverId));
        const given = new Map<string, number>(), received = new Map<string, number>();
        for (const e of edges) {
            given.set(e.passerId, (given.get(e.passerId) ?? 0) + e.ast);
            received.set(e.receiverId, (received.get(e.receiverId) ?? 0) + e.ast);
        }
        const passPair = (id: string) => pairs.some(e => e.passes > 0 && e.passerId !== e.receiverId && byId.has(e.passerId) && byId.has(e.receiverId) && (e.passerId === id || e.receiverId === id));
        const players = roster.filter(p => given.has(p.id) || received.has(p.id) || passPair(p.id));

        // 포지션 자리별로 출전 시간 순 정렬 후 펼침
        const pos = new Map<string, { x: number; y: number }>();
        const groups = new Map<string, Player[]>();
        for (const p of players) {
            const key = SLOTS[p.position] ? p.position : 'SF';
            (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
        }
        for (const [key, list] of groups) {
            list.sort((a, b) => (b.stats?.mp ?? 0) - (a.stats?.mp ?? 0) || a.id.localeCompare(b.id));
            const s = SLOTS[key];
            list.forEach((p, i) => {
                const off = (i - (list.length - 1) / 2) * SLOT_STEP;
                pos.set(p.id, { x: s.x + s.dx * off, y: s.y + s.dy * off });
            });
        }

        const max = edges.reduce((m, e) => Math.max(m, e.ast), 0);
        const lines = edges
            .map(e => {
                const a = pos.get(e.passerId)!, b = pos.get(e.receiverId)!;
                const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
                const nx = -uy * EDGE_GAP, ny = ux * EDGE_GAP;
                const tier = tierOf(e.ast, max);
                const w = TIERS[tier].width;
                const x1 = a.x + ux * (NODE_R + 2) + nx, y1 = a.y + uy * (NODE_R + 2) + ny;
                const tx = b.x - ux * (NODE_R + 2) + nx, ty = b.y - uy * (NODE_R + 2) + ny;   // 촉 끝
                const avail = Math.max(0, len - 2 * (NODE_R + 2));
                const hl = Math.min(headLenOf(w), avail * 0.6), hh = headHalfOf(w) * (hl / headLenOf(w));   // 가까운 노드끼리는 촉을 같은 비율로 줄임
                const bx = tx - ux * hl, by = ty - uy * hl;                                           // 촉 밑변 중심 = 선 끝
                const px = -uy * hh, py = ux * hh;
                return {
                    ...e, tier, x1, y1, x2: bx, y2: by,
                    head: `${tx},${ty} ${bx + px},${by + py} ${bx - px},${by - py}`,
                };
            })
            .sort((p, q) => p.ast - q.ast);   // 굵은 선이 위로

        const list = [...players].sort((a, b) => (given.get(b.id) ?? 0) - (given.get(a.id) ?? 0) || (received.get(b.id) ?? 0) - (received.get(a.id) ?? 0));
        // 팝업: 패서별 받은 선수 목록(패스 = 야투로 이어진 패스, 성공 = 그 야투 성공, AST = 어시스트 인정) — 어시스트 0인 쌍도 포함
        const outgoing = new Map<string, AssistPairTotal[]>();
        for (const e of pairs) {
            if (e.passerId === e.receiverId || !byId.has(e.passerId) || !byId.has(e.receiverId) || (e.passes <= 0 && e.ast <= 0)) continue;
            (outgoing.get(e.passerId) ?? outgoing.set(e.passerId, []).get(e.passerId)!).push(e);
        }
        for (const list of outgoing.values()) list.sort((a, b) => b.passes - a.passes || b.ast - a.ast || a.receiverId.localeCompare(b.receiverId));
        // [2026-11-21] 우측 목록 = 팝업 '전체' 줄과 같은 값(패스·성공·FG%·AST)
        const passTot = new Map<string, { passes: number; fgm: number }>();
        for (const [id, list] of outgoing) passTot.set(id, list.reduce((t, r) => ({ passes: t.passes + r.passes, fgm: t.fgm + r.fgm }), { passes: 0, fgm: 0 }));
        return { lines, pos, players, list, given, received, outgoing, byId, passTot };
    }, [pairs, roster]);

    const isLit = (passerId: string, receiverId: string) => !focusId || passerId === focusId || receiverId === focusId;

    let body: React.ReactNode;
    if (isError) body = <div className="p-3"><InlineNotice tone="danger" size="sm">어시스트 네트워크를 불러오지 못했습니다</InlineNotice></div>;
    else if (isPending || !view) body = <Spinner variant="section" />;
    else if (view.players.length === 0) body = <div className="p-6 text-sm text-slate-500">기록이 없습니다</div>;
    else body = (
        <div className="flex flex-col md:flex-row">
            <div className="md:flex-[6] p-3 flex flex-col gap-2">
                <div className="relative" onMouseLeave={() => { setFocusId(null); setPopupId(null); }}>
                <svg viewBox="0 0 435 403" className="block w-full h-auto bg-slate-950 border border-slate-800">
                    <g fill="#334155" fillRule="evenodd" pointerEvents="none">
                        {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                    </g>
                    <g>
                        {view.lines.map(l => {
                            const t = TIERS[l.tier];
                            return (
                                <g key={`${l.passerId}>${l.receiverId}`} opacity={isLit(l.passerId, l.receiverId) ? (focusId ? 1 : t.opacity) : 0.08}>
                                    <title>{`${view.players.find(p => p.id === l.passerId)?.name} → ${view.players.find(p => p.id === l.receiverId)?.name}: ${l.ast}어시스트 · ${l.pts}점`}</title>
                                    <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={t.color} strokeWidth={t.width} strokeLinecap="butt" />
                                    <polygon points={l.head} fill={t.color} />
                                </g>
                            );
                        })}
                    </g>
                    <g>
                        {view.players.map(p => {
                            const at = view.pos.get(p.id)!;
                            const dim = focusId != null && focusId !== p.id
                                && !view.lines.some(l => (l.passerId === focusId && l.receiverId === p.id) || (l.receiverId === focusId && l.passerId === p.id));
                            return (
                                <g key={p.id} transform={`translate(${at.x},${at.y})`} opacity={dim ? 0.3 : 1}
                                    onMouseEnter={() => { setFocusId(p.id); setPopupId(p.id); }} onMouseLeave={() => { setFocusId(null); setPopupId(null); }} style={{ cursor: 'default' }}>
                                    <circle r={NODE_R} fill={nodeBg} stroke={nodeRing} strokeWidth={2} />
                                    <text textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill={nodeText}>{badgeText(p)}</text>
                                </g>
                            );
                        })}
                    </g>
                </svg>
                {popupId && view.pos.get(popupId) && (() => {
                    const at = view.pos.get(popupId)!;
                    const who = view.byId.get(popupId)!;
                    const rows = view.outgoing.get(popupId) ?? [];
                    const tot = rows.reduce((t, r) => ({ passes: t.passes + r.passes, fgm: t.fgm + r.fgm, ast: t.ast + r.ast }), { passes: 0, fgm: 0, ast: 0 });
                    const left = at.x > 217;
                    const ty = at.y < 130 ? '-12%' : at.y > 290 ? '-88%' : '-50%';
                    const pct = (m: number, a: number) => (a > 0 ? `${((m / a) * 100).toFixed(1)}%` : '-');
                    return (
                        <div className="absolute z-20 pointer-events-none w-64 bg-slate-900 border border-slate-700 shadow-lg"
                            style={{ left: `${(at.x / 435) * 100}%`, top: `${(at.y / 403) * 100}%`,
                                transform: `translate(${left ? 'calc(-100% - 20px)' : '20px'}, ${ty})` }}>
                            <div className="px-3 py-2 border-b border-slate-800 text-sm text-white truncate">{who.name}</div>
                            {rows.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-slate-500">기록이 없습니다</div>
                            ) : (
                                <table className="w-full text-xs tabular-nums">
                                    <thead>
                                        <tr className="text-slate-500">
                                            <th className="px-3 py-1 text-left font-normal">받은 선수</th>
                                            <th className="px-1 py-1 text-right font-normal">패스</th>
                                            <th className="px-1 py-1 text-right font-normal">성공</th>
                                            <th className="px-1 py-1 text-right font-normal">FG%</th>
                                            <th className="pl-1 pr-3 py-1 text-right font-normal">AST</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(r => (
                                            <tr key={r.receiverId} className="text-slate-200">
                                                <td className="px-3 py-0.5 text-left truncate max-w-[7rem]">{view.byId.get(r.receiverId)?.name}</td>
                                                <td className="px-1 py-0.5 text-right">{r.passes}</td>
                                                <td className="px-1 py-0.5 text-right">{r.fgm}</td>
                                                <td className="px-1 py-0.5 text-right">{pct(r.fgm, r.passes)}</td>
                                                <td className="pl-1 pr-3 py-0.5 text-right">{r.ast}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="text-white border-t border-slate-800">
                                            <td className="px-3 py-1 text-left">전체</td>
                                            <td className="px-1 py-1 text-right">{tot.passes}</td>
                                            <td className="px-1 py-1 text-right">{tot.fgm}</td>
                                            <td className="px-1 py-1 text-right">{pct(tot.fgm, tot.passes)}</td>
                                            <td className="pl-1 pr-3 py-1 text-right">{tot.ast}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>
                    );
                })()}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                    {TIERS.map((t, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                            <svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke={t.color} strokeWidth={Math.min(t.width, 5)} strokeLinecap="round" /></svg>
                            {t.label}
                        </span>
                    ))}
                </div>
            </div>
            <div className="md:flex-[4] md:border-l border-slate-800">
                <Table variant="bare" density="compact" dividers={false} className="text-sm">
                    <TableHead>
                        <TableHeaderCell align="center" width={44}>번호</TableHeaderCell>
                        <TableHeaderCell align="left">선수</TableHeaderCell>
                        <TableHeaderCell align="right">패스</TableHeaderCell>
                        <TableHeaderCell align="right">성공</TableHeaderCell>
                        <TableHeaderCell align="right">FG%</TableHeaderCell>
                        <TableHeaderCell align="right">AST</TableHeaderCell>
                        <TableHeaderCell align="right">받음</TableHeaderCell>
                    </TableHead>
                    <TableBody>
                        {view.list.map(p => (
                            <TableRow key={p.id} className={focusId === p.id ? 'bg-slate-800/60' : ''}>
                                <TableCell align="center">
                                    <span onMouseEnter={() => setFocusId(p.id)} onMouseLeave={() => setFocusId(null)}
                                        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold"
                                        style={{ backgroundColor: nodeBg, color: nodeText, boxShadow: `inset 0 0 0 2px ${nodeRing}` }}>
                                        {badgeText(p)}
                                    </span>
                                </TableCell>
                                <TableCell align="left">
                                    <span onMouseEnter={() => setFocusId(p.id)} onMouseLeave={() => setFocusId(null)}>
                                        <PlayerNameLink player={p} teamAbbr={teamAbbr} onClick={onPlayerClick} className="block" />
                                    </span>
                                </TableCell>
                                {(() => {
                                    const pt = view.passTot.get(p.id) ?? { passes: 0, fgm: 0 };
                                    return (
                                        <>
                                            <TableCell align="right" className="text-slate-200 tabular-nums">{pt.passes}</TableCell>
                                            <TableCell align="right" className="text-slate-200 tabular-nums">{pt.fgm}</TableCell>
                                            <TableCell align="right" className="text-slate-200 tabular-nums">{pt.passes > 0 ? `${((pt.fgm / pt.passes) * 100).toFixed(1)}%` : '-'}</TableCell>
                                        </>
                                    );
                                })()}
                                <TableCell align="right" className="text-slate-200 tabular-nums">{view.given.get(p.id) ?? 0}</TableCell>
                                <TableCell align="right" className="text-slate-200 tabular-nums">{view.received.get(p.id) ?? 0}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );

    return (
        <InsightCard title="어시스트 네트워크" headerRight={<SeasonTypeToggle size="sm" value={seasonType} onChange={onSeasonTypeChange} />}>
            {body}
        </InsightCard>
    );
};
