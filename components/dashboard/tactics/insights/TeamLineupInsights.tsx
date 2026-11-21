// TeamLineupInsights.tsx — 팀 전술 › 인사이트 "라인업"·"온/오프" [2026-11-21]
// 표는 density="compact" — 기본 밀도는 헤더 px-1.5·본문 px-3이라 오른쪽 정렬 숫자 열의 헤더가 6px 어긋난다(사용자 지적). compact는 둘 다 px-2.
// 데이터 = team_lineup_stats(경기별 5인 조합 시간·득실·포제션, DB 함수 compute_game_lineups) 합산. 엔진 무관이라 모든 방(보관본 엔진 포함).
// 레이팅 = 100포제션당 득점(ORTG = 득점 ÷ 우리 포제션, DRTG = 실점 ÷ 상대 포제션), NET = ORTG − DRTG.
// 온/오프: ON = 그 선수가 코트에 있던 조합 합, OFF = 팀 전체 − ON. 선수 이름은 경기 당시 박스스코어 이름(떠난 선수 포함).
// [2026-11-21] 모든 선수 호버 카드·프로필 이동(사용자) — 호출부가 리그 선수 풀로 만든 PlayerCardMap(buildPlayerCardMap)을 넘긴다. 맵에도 없으면 카드 없이 이동만.
import React, { useMemo, useState } from 'react';
import type { Player } from '../../../../types';
import { InsightCard } from './InsightCard';
import { Spinner } from '../../../common/Spinner';
import { InlineNotice } from '../../../common/InlineNotice';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../../common/Table';
import { TableEmptyRow } from '../../../common/EmptyState';
import { PlayerNameLink } from '../../../common/PlayerNameLink';
import type { PlayerCardMap } from '../../../common/PlayerHoverCard';
import { SeasonTypeToggle } from '../../../roster/StatsToggles';
import { CheckboxFilterDropdown } from '../../../common/filters/CheckboxFilterDropdown';
import type { SeasonType } from '../../../../hooks/useLeaderboardData';
import { useTeamLineupCombo, type LineupTotal, type OnOffRow } from '../../../../hooks/useTeamLineupStats';

const LINEUP_LIMIT = 15;   // 출전 시간 상위 조합만(짧은 조합은 레이팅 표본이 너무 작음)

const rating = (pts: number, poss: number) => (poss > 0 ? (pts / poss) * 100 : null);
const fmt1 = (v: number | null) => (v === null ? '-' : v.toFixed(1));
const signed = (v: number | null) => (v === null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`);
const netTone = (v: number | null) => (v === null ? 'text-slate-500' : v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-300');
const mins = (secs: number) => Math.round(secs / 60);

interface CommonProps {
    /** playerId → { 완전한 Player, 현재 소속팀 약어 } — 호버 카드·프로필 이동용(떠난 선수 포함) */
    playerLookup: PlayerCardMap;
    isPending: boolean;
    isError: boolean;
    seasonType: SeasonType;
    onSeasonTypeChange: (v: SeasonType) => void;
    onPlayerClick?: (player: Player) => void;
}

// [2026-11-21] 라인업 칸 이름 사이 연결 표시 — 초록 십자(+)만(사용자 요청: 원 없이, 직접 그린 SVG — Lucide 금지)
const PlusMark: React.FC = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
        <path d="M6 1.5v9M1.5 6h9" stroke="#10b981" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
);

const NameLink: React.FC<{ id: string; name: string; lookup: PlayerCardMap; onPlayerClick?: (p: Player) => void }> = ({ id, name, lookup, onPlayerClick }) => {
    const entry = lookup.get(id);
    if (entry) return <PlayerNameLink player={entry.player} teamAbbr={entry.teamAbbr || undefined} onClick={onPlayerClick} />;
    // 리그 선수 풀에도 없는 선수(드묾) — 카드 없이 이동만(프로필 이동은 id만 쓴다)
    return <PlayerNameLink player={{ id, name } as Player} enableHoverCard={false} onClick={onPlayerClick} />;
};

export const TeamLineupTable: React.FC<CommonProps & { lineups: LineupTotal[] | undefined; roomId: string | undefined | null; teamId: string | undefined | null }> = ({ playerLookup, lineups, isPending, isError, seasonType, onSeasonTypeChange, onPlayerClick, roomId, teamId }) => {
    // [2026-11-21] 선수 필터(사용자) — 고르면 그 선수 묶음 한 줄(예: 2명 → A+B가 함께 코트에 있던 기록)만, 안 고르면 출전 시간 상위 5인 조합.
    //   한 줄 값은 DB get_team_lineup_combo(함께 뛴 경기 수 포함). 6명 이상은 묶음이 성립하지 않아 빈 표.
    const [selected, setSelected] = useState<string[]>([]);
    const five = useMemo(() => (lineups ?? []).filter(l => l.playerIds.length === 5), [lineups]);
    const playerOptions = useMemo(() => {
        const acc = new Map<string, { name: string; secs: number }>();
        for (const l of five) l.playerIds.forEach((id, k) => {
            const x = acc.get(id) ?? { name: playerLookup.get(id)?.player.name ?? l.playerNames[k] ?? '?', secs: 0 };
            x.secs += l.secs; acc.set(id, x);
        });
        return [...acc.entries()].sort((a, b) => b[1].secs - a[1].secs).map(([value, x]) => ({ value, label: x.name }));
    }, [five, playerLookup]);
    const nameOf = useMemo(() => new Map(playerOptions.map(o => [o.value, o.label])), [playerOptions]);
    const combo = useTeamLineupCombo(roomId, teamId, selected, seasonType === 'playoff');

    type Row = LineupTotal & { o: number | null; d: number | null; net: number | null; pm: number };
    const withRatings = (l: LineupTotal): Row => {
        const o = rating(l.ptsFor, l.possFor), d = rating(l.ptsAgainst, l.possAgainst);
        return { ...l, o, d, net: o !== null && d !== null ? o - d : null, pm: l.ptsFor - l.ptsAgainst };
    };
    const rows: Row[] = useMemo(() => {
        if (selected.length === 0) {
            return [...five].sort((a, b) => b.secs - a.secs || a.key.localeCompare(b.key)).slice(0, LINEUP_LIMIT).map(withRatings);
        }
        if (selected.length > 5 || !combo.data || combo.data.secs <= 0) return [];
        const ids = [...selected].sort((a, b) => (playerOptions.findIndex(o => o.value === a)) - (playerOptions.findIndex(o => o.value === b)));
        return [withRatings({ key: ids.join(','), playerIds: ids, playerNames: ids.map(id => nameOf.get(id) ?? '?'), ...combo.data })];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [five, selected, combo.data, playerOptions, nameOf]);
    const comboPending = selected.length >= 1 && selected.length <= 5 && combo.isPending;

    return (
        <InsightCard title="라인업" headerRight={
            <div className="flex items-center gap-2">
                <CheckboxFilterDropdown label="선수" options={playerOptions} selected={selected} onChange={setSelected} width="w-64" />
                <SeasonTypeToggle size="sm" value={seasonType} onChange={onSeasonTypeChange} />
            </div>
        }>
            {isError || combo.isError ? <div className="p-3"><InlineNotice tone="danger" size="sm">라인업 기록을 불러오지 못했습니다</InlineNotice></div>
            : isPending || comboPending ? <Spinner variant="section" />
            : (
                <Table variant="bare" density="compact" dividers={false}>
                    <TableHead>
                        <TableHeaderCell align="left">라인업</TableHeaderCell>
                        <TableHeaderCell align="right">GP</TableHeaderCell>
                        <TableHeaderCell align="right">MIN</TableHeaderCell>
                        <TableHeaderCell align="right">+/-</TableHeaderCell>
                        <TableHeaderCell align="right">ORTG</TableHeaderCell>
                        <TableHeaderCell align="right">DRTG</TableHeaderCell>
                        <TableHeaderCell align="right">NET</TableHeaderCell>
                        <TableHeaderCell align="right">POSS</TableHeaderCell>
                    </TableHead>
                    <TableBody>
                        {rows.length === 0 ? (
                            <TableEmptyRow colSpan={8}>{selected.length > 0 ? '함께 뛴 기록이 없습니다.' : '아직 완료된 경기가 없습니다.'}</TableEmptyRow>
                        ) : rows.map((r, i) => (
                            <TableRow key={r.key} className={i % 2 === 1 ? 'bg-slate-700/25' : ''}>
                                <TableCell align="left" className="whitespace-normal">
                                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                        {r.playerIds.map((id, k) => (
                                            <React.Fragment key={id}>
                                                {k > 0 && <PlusMark />}
                                                <NameLink id={id} name={r.playerNames[k] ?? '?'} lookup={playerLookup} onPlayerClick={onPlayerClick} />
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell align="right" className="text-sm text-white tabular-nums">{r.games}</TableCell>
                                <TableCell align="right" className="text-sm text-white tabular-nums">{mins(r.secs)}</TableCell>
                                <TableCell align="right" className={`text-sm tabular-nums ${netTone(r.pm)}`}>{r.pm > 0 ? `+${r.pm}` : r.pm}</TableCell>
                                <TableCell align="right" className="text-sm text-white tabular-nums">{fmt1(r.o)}</TableCell>
                                <TableCell align="right" className="text-sm text-white tabular-nums">{fmt1(r.d)}</TableCell>
                                <TableCell align="right" className={`text-sm tabular-nums ${netTone(r.net)}`}>{signed(r.net)}</TableCell>
                                <TableCell align="right" className="text-sm text-white tabular-nums">{r.possFor}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </InsightCard>
    );
};

export const TeamOnOffTable: React.FC<CommonProps & { rows: OnOffRow[] | undefined }> = ({ playerLookup, rows: data, isPending, isError, seasonType, onSeasonTypeChange, onPlayerClick }) => {
    const rows = useMemo(() => (data ?? [])
        .map(r => {
            const onNet = (() => { const o = rating(r.onPtsFor, r.onPossFor), d = rating(r.onPtsAgainst, r.onPossAgainst); return o !== null && d !== null ? o - d : null; })();
            const offNet = (() => {
                const o = rating(r.totPtsFor - r.onPtsFor, r.totPossFor - r.onPossFor), d = rating(r.totPtsAgainst - r.onPtsAgainst, r.totPossAgainst - r.onPossAgainst);
                return o !== null && d !== null ? o - d : null;
            })();
            return { ...r, onNet, offNet, diff: onNet !== null && offNet !== null ? onNet - offNet : null, offSecs: r.totSecs - r.onSecs };
        })
        .sort((a, b) => b.onSecs - a.onSecs || a.playerId.localeCompare(b.playerId)), [data]);

    return (
        <InsightCard title="온/오프" headerRight={<SeasonTypeToggle size="sm" value={seasonType} onChange={onSeasonTypeChange} />}>
            {isError ? <div className="p-3"><InlineNotice tone="danger" size="sm">온/오프 기록을 불러오지 못했습니다</InlineNotice></div>
            : isPending ? <Spinner variant="section" />
            : (
                <Table variant="bare" density="compact" dividers={false}>
                    <TableHead>
                        <TableHeaderCell align="left">선수</TableHeaderCell>
                        <TableHeaderCell align="right">ON MIN</TableHeaderCell>
                        <TableHeaderCell align="right">ON NET</TableHeaderCell>
                        <TableHeaderCell align="right">OFF MIN</TableHeaderCell>
                        <TableHeaderCell align="right">OFF NET</TableHeaderCell>
                        <TableHeaderCell align="right">ON−OFF</TableHeaderCell>
                    </TableHead>
                    <TableBody>
                        {rows.length === 0 ? (
                            <TableEmptyRow colSpan={6}>아직 완료된 경기가 없습니다.</TableEmptyRow>
                        ) : rows.map((r, i) => (
                            <TableRow key={r.playerId} className={i % 2 === 1 ? 'bg-slate-700/25' : ''}>
                                <TableCell align="left"><NameLink id={r.playerId} name={r.playerName} lookup={playerLookup} onPlayerClick={onPlayerClick} /></TableCell>
                                <TableCell align="right" className="text-sm text-white tabular-nums">{mins(r.onSecs)}</TableCell>
                                <TableCell align="right" className={`text-sm tabular-nums ${netTone(r.onNet)}`}>{signed(r.onNet)}</TableCell>
                                <TableCell align="right" className="text-sm text-white tabular-nums">{mins(r.offSecs)}</TableCell>
                                <TableCell align="right" className={`text-sm tabular-nums ${netTone(r.offNet)}`}>{signed(r.offNet)}</TableCell>
                                <TableCell align="right" className={`text-sm tabular-nums ${netTone(r.diff)}`}>{signed(r.diff)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </InsightCard>
    );
};
