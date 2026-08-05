import React, { useMemo } from 'react';
import { PlayerBoxScore, BoxTick, BoxDelta } from '../../../types/engine';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../common/Table';

interface GameOnOffTabProps {
    boxTimeline?: BoxTick[];
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    homeTeamId: string;
    awayTeamId: string;
    homeTeamName: string;
    awayTeamName: string;
    homeBadge: { color: string; abbr: string };
    awayBadge: { color: string; abbr: string };
}

// ─── 집계 자료구조 ──────────────────────────────────────────────────────────────
// 한 tick(포제션 1회)은 정확히 한 팀의 공격 포제션이다(possessionHandler.ts — 스틸 직후
// 속공 득점도 다음 tick으로 넘어가 possession이 뒤집힌 뒤 처리됨, 같은 tick에 섞이지 않음).
// 그래서 tick.off로 공격팀을 확정하면 그 tick의 총 득점(offPts)을 공격팀 On_Off/수비팀 On_Def에
// 정확히 귀속시킬 수 있다.

interface RatingBucket {
    offPoss: number; offPts: number; // 자팀 공격 포제션 수 / 득점
    defPoss: number; defPts: number; // 자팀 수비 포제션 수 / 실점
}

function emptyBucket(): RatingBucket {
    return { offPoss: 0, offPts: 0, defPoss: 0, defPts: 0 };
}

function ratingOf(b: RatingBucket): { off: number | null; def: number | null; net: number | null } {
    const off = b.offPoss > 0 ? (b.offPts / b.offPoss) * 100 : null;
    const def = b.defPoss > 0 ? (b.defPts / b.defPoss) * 100 : null;
    const net = off != null && def != null ? off - def : null;
    return { off, def, net };
}

interface PlayerOnOffRow {
    playerId: string;
    playerName: string;
    onMp: number; offMp: number;
    on: RatingBucket; off: RatingBucket;
}

interface ComboRow {
    key: string;
    names: string[];
    mp: number;
    bucket: RatingBucket;
}

function combinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [head, ...rest] = arr;
    const withHead = combinations(rest, k - 1).map(c => [head, ...c]);
    const withoutHead = combinations(rest, k);
    return [...withHead, ...withoutHead];
}

function sumPts(ids: string[], d: Record<string, BoxDelta>): number {
    let total = 0;
    for (const id of ids) total += d[id]?.pts ?? 0;
    return total;
}

export const GameOnOffTab: React.FC<GameOnOffTabProps> = ({
    boxTimeline, homeBox, awayBox, homeTeamId, awayTeamId, homeTeamName, awayTeamName, homeBadge, awayBadge,
}) => {
    const hasData = (boxTimeline?.length ?? 0) > 0 && boxTimeline!.some(t => t.off != null);

    const result = useMemo(() => {
        if (!hasData) return null;
        const ticks = boxTimeline!;

        const nameOf = new Map<string, string>();
        for (const p of [...homeBox, ...awayBox]) nameOf.set(p.playerId, p.playerName);
        const homeIds = new Set(homeBox.map(p => p.playerId));
        const awayIds = new Set(awayBox.map(p => p.playerId));

        const playerAcc = new Map<string, { on: RatingBucket; off: RatingBucket; onMp: number; offMp: number }>();
        const comboAcc = new Map<string, { ids: string[]; bucket: RatingBucket; mp: number }>();
        const lineupAcc = new Map<string, { ids: string[]; bucket: RatingBucket; mp: number }>();

        const ensurePlayer = (id: string) => {
            let a = playerAcc.get(id);
            if (!a) { a = { on: emptyBucket(), off: emptyBucket(), onMp: 0, offMp: 0 }; playerAcc.set(id, a); }
            return a;
        };

        for (const tick of ticks) {
            if (tick.off == null) continue; // 구버전 저장 데이터(off 필드 없음) — 이 tick만 스킵
            const offIsHome = tick.off === 'home';
            const homeOn = tick.on.filter(id => homeIds.has(id));
            const awayOn = tick.on.filter(id => awayIds.has(id));
            const offRosterOn = offIsHome ? homeOn : awayOn;
            const offPts = sumPts(offRosterOn, tick.d);

            // ── 선수별 On/Off ──
            for (const p of homeBox) {
                const acc = ensurePlayer(p.playerId);
                const isOn = homeIds.has(p.playerId) && homeOn.includes(p.playerId);
                const bucket = isOn ? acc.on : acc.off;
                if (offIsHome) { bucket.offPoss++; bucket.offPts += offPts; }
                else { bucket.defPoss++; bucket.defPts += offPts; }
                if (isOn) acc.onMp += tick.mp; else acc.offMp += tick.mp;
            }
            for (const p of awayBox) {
                const acc = ensurePlayer(p.playerId);
                const isOn = awayIds.has(p.playerId) && awayOn.includes(p.playerId);
                const bucket = isOn ? acc.on : acc.off;
                if (!offIsHome) { bucket.offPoss++; bucket.offPts += offPts; }
                else { bucket.defPoss++; bucket.defPts += offPts; }
                if (isOn) acc.onMp += tick.mp; else acc.offMp += tick.mp;
            }

            // ── 조합(2인/3인) + 5인 라인업 — 실제로 같이 코트에 있던 부분집합만 ──
            const accumulateCombos = (onCourt: string[], isTeamOffense: boolean, target: Map<string, { ids: string[]; bucket: RatingBucket; mp: number }>, sizes: number[]) => {
                for (const size of sizes) {
                    for (const combo of combinations(onCourt, size)) {
                        const sorted = [...combo].sort();
                        const key = sorted.join(',');
                        let a = target.get(key);
                        if (!a) { a = { ids: sorted, bucket: emptyBucket(), mp: 0 }; target.set(key, a); }
                        if (isTeamOffense) { a.bucket.offPoss++; a.bucket.offPts += offPts; }
                        else { a.bucket.defPoss++; a.bucket.defPts += offPts; }
                        a.mp += tick.mp;
                    }
                }
            };
            accumulateCombos(homeOn, offIsHome, comboAcc, [2, 3]);
            accumulateCombos(awayOn, !offIsHome, comboAcc, [2, 3]);
            accumulateCombos(homeOn, offIsHome, lineupAcc, [5]);
            accumulateCombos(awayOn, !offIsHome, lineupAcc, [5]);
        }

        const buildPlayerRows = (box: PlayerBoxScore[]): PlayerOnOffRow[] =>
            box.map(p => {
                const acc = ensurePlayer(p.playerId);
                return { playerId: p.playerId, playerName: p.playerName, onMp: acc.onMp, offMp: acc.offMp, on: acc.on, off: acc.off };
            }).sort((a, b) => b.onMp - a.onMp);

        // teamIds에 속한 조합만(= 이 팀 로스터 조합) arity 크기로 걸러 시간순 정렬
        const buildComboRows = (
            target: Map<string, { ids: string[]; bucket: RatingBucket; mp: number }>,
            teamIds: Set<string>,
            arity: number,
            limit: number,
        ): ComboRow[] =>
            [...target.values()]
                .filter(a => a.ids.length === arity && a.ids.every(id => teamIds.has(id)))
                .sort((a, b) => b.mp - a.mp)
                .slice(0, limit)
                .map(a => ({ key: a.ids.join(','), names: a.ids.map(id => nameOf.get(id) ?? id), mp: a.mp, bucket: a.bucket }));

        return {
            homePlayers: buildPlayerRows(homeBox),
            awayPlayers: buildPlayerRows(awayBox),
            homeCombos2: buildComboRows(comboAcc, homeIds, 2, 10),
            awayCombos2: buildComboRows(comboAcc, awayIds, 2, 10),
            homeCombos3: buildComboRows(comboAcc, homeIds, 3, 10),
            awayCombos3: buildComboRows(comboAcc, awayIds, 3, 10),
            homeLineups: buildComboRows(lineupAcc, homeIds, 5, 8),
            awayLineups: buildComboRows(lineupAcc, awayIds, 5, 8),
        };
    }, [hasData, boxTimeline, homeBox, awayBox]);

    if (!hasData || !result) {
        return (
            <div className="text-center text-slate-500 py-20 font-bold bg-slate-900/30 rounded-3xl border border-slate-800">
                On/Off 데이터가 없습니다. (이전 버전에 시뮬레이션된 경기는 지원되지 않습니다)
            </div>
        );
    }

    const fmt = (v: number | null) => v == null ? '-' : v.toFixed(1);
    const fmtSigned = (v: number | null) => v == null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
    // 박스스코어(BoxScoreTable.tsx)의 stat 셀 톤과 동일 — 흰색/모노스페이스/세미볼드/tabular-nums
    const sc = "text-xs font-semibold text-white font-mono tabular-nums";
    const netColor = (v: number | null) => v == null ? 'text-slate-500' : v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-500';
    const NetCell: React.FC<{ v: number | null }> = ({ v }) => (
        <TableCell align="center">
            <span className={`font-mono font-semibold text-xs tabular-nums ${netColor(v)}`}>{fmtSigned(v)}</span>
        </TableCell>
    );

    // 박스스코어 standalone(좌우 분할) 헤더와 동일한 톤: bg-slate-950/80 헤더 바 + 사각 배지 + 대문자 트래킹
    const TeamHeader: React.FC<{ badge: { color: string; abbr: string }; name: string; label: string }> = ({ badge, name, label }) => (
        <div className="px-6 py-4 bg-slate-950/80 flex items-center justify-between mt-0.5 border-l border-r border-slate-800">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0" style={{ backgroundColor: badge.color, color: '#fff' }}>
                    {badge.abbr.slice(0, 3)}
                </div>
                <span className="text-sm font-black text-white uppercase tracking-wider">{name}</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        </div>
    );

    const PlayerTable: React.FC<{ rows: PlayerOnOffRow[]; badge: { color: string; abbr: string }; name: string }> = ({ rows, badge, name }) => (
        <div className="w-full relative">
            <TeamHeader badge={badge} name={name} label="선수별 On/Off" />
            <Table className="!rounded-none" fullHeight={false}>
                <TableHead>
                    <TableHeaderCell align="left" stickyLeft>선수</TableHeaderCell>
                    <TableHeaderCell>ON MIN</TableHeaderCell>
                    <TableHeaderCell>ON ORTG</TableHeaderCell>
                    <TableHeaderCell>ON DRTG</TableHeaderCell>
                    <TableHeaderCell>ON NET</TableHeaderCell>
                    <TableHeaderCell>OFF NET</TableHeaderCell>
                    <TableHeaderCell className="pr-4">차이</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {rows.map(r => {
                        const on = ratingOf(r.on);
                        const off = ratingOf(r.off);
                        const diff = on.net != null && off.net != null ? on.net - off.net : null;
                        return (
                            <TableRow key={r.playerId}>
                                <TableCell align="left" stickyLeft>
                                    <span className="text-xs font-semibold text-white truncate">{r.playerName}</span>
                                </TableCell>
                                <TableCell align="center" className={sc}>{r.onMp.toFixed(1)}</TableCell>
                                <TableCell align="center" className={sc}>{fmt(on.off)}</TableCell>
                                <TableCell align="center" className={sc}>{fmt(on.def)}</TableCell>
                                <NetCell v={on.net} />
                                <NetCell v={off.net} />
                                <TableCell align="center" className="pr-4">
                                    <span className={`font-mono font-semibold text-xs tabular-nums ${netColor(diff)}`}>{fmtSigned(diff)}</span>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );

    // 팀별로 2인/3인/5인 조합을 테이블 1개로 병합(인원수 구분은 종류별 라벨 행), 원정/홈은 좌우 분할 유지.
    const ARITY_LABEL: Record<number, string> = { 2: '2인 조합', 3: '3인 조합', 5: '5인 라인업' };

    const CombinedComboTable: React.FC<{ groups: { arity: number; rows: ComboRow[] }[] }> = ({ groups }) => (
        <div className="w-full relative">
            <Table className="!rounded-none" fullHeight={false}>
                <TableHead>
                    <TableHeaderCell align="left" stickyLeft>조합</TableHeaderCell>
                    <TableHeaderCell>MIN</TableHeaderCell>
                    <TableHeaderCell>ORTG</TableHeaderCell>
                    <TableHeaderCell>DRTG</TableHeaderCell>
                    <TableHeaderCell className="pr-4">NET</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {groups.map(g => (
                        <React.Fragment key={g.arity}>
                            <TableRow>
                                <TableCell colSpan={5} className="!py-1.5 bg-slate-950/60">
                                    <span className="text-xs font-black uppercase tracking-widest text-slate-500">{ARITY_LABEL[g.arity]}</span>
                                </TableCell>
                            </TableRow>
                            {g.rows.length === 0 ? (
                                <TableRow><TableCell colSpan={5} align="center" className={sc} value="데이터 없음" /></TableRow>
                            ) : g.rows.map(r => {
                                const rt = ratingOf(r.bucket);
                                return (
                                    <TableRow key={`${g.arity}-${r.key}`}>
                                        <TableCell align="left" stickyLeft>
                                            <span className="text-xs font-semibold text-white truncate">{r.names.join(' + ')}</span>
                                        </TableCell>
                                        <TableCell align="center" className={sc}>{r.mp.toFixed(1)}</TableCell>
                                        <TableCell align="center" className={sc}>{fmt(rt.off)}</TableCell>
                                        <TableCell align="center" className={sc}>{fmt(rt.def)}</TableCell>
                                        <TableCell align="center" className="pr-4">
                                            <span className={`font-mono font-semibold text-xs tabular-nums ${netColor(rt.net)}`}>{fmtSigned(rt.net)}</span>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </TableBody>
            </Table>
        </div>
    );

    const awayComboGroups: { arity: number; rows: ComboRow[] }[] = [
        { arity: 2, rows: result.awayCombos2 },
        { arity: 3, rows: result.awayCombos3 },
        { arity: 5, rows: result.awayLineups },
    ];
    const homeComboGroups: { arity: number; rows: ComboRow[] }[] = [
        { arity: 2, rows: result.homeCombos2 },
        { arity: 3, rows: result.homeCombos3 },
        { arity: 5, rows: result.homeLineups },
    ];

    return (
        <div className="w-full flex flex-col gap-0 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* 선수별 On/Off — 원정 | 홈 1:1 분할 (좌우 간격 없음, 각자 테두리로 구분) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                <PlayerTable rows={result.awayPlayers} badge={awayBadge} name={awayTeamName} />
                <PlayerTable rows={result.homePlayers} badge={homeBadge} name={homeTeamName} />
            </div>

            {/* 2인/3인 조합 + 5인 라인업 — 팀별로 1개 테이블에 병합, 원정 | 홈 좌우 분할 유지 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                <CombinedComboTable groups={awayComboGroups} />
                <CombinedComboTable groups={homeComboGroups} />
            </div>
        </div>
    );
};
