import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Spinner } from '../../../components/common/Spinner';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../../components/common/Table';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { SegmentedControl } from '../../../components/common/SegmentedControl';
import { CONFERENCE_COLORS } from '../../../utils/constants';
import { useServerClockBucket } from '../../../utils/serverClock';
import { useCurrentVirtualDate } from '../../../hooks/useCurrentVirtualDate';
import { useGame } from '../../../hooks/useGameContext';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { CRITERION_LABEL } from '../../../utils/nbaTiebreak';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { computeMultiStandingsStats, fmtDate, fmtWinPct } from './multiSeasonUtils';
import { addDaysToKey, daysBetweenKeys } from './multiScheduleUtils';
import {
    PLAYOFF_RACE_WINDOW_DAYS, TIEBREAK_RULE_TABLE, getRaceZones, getRegularSeasonEndDate, isPlayoffRaceOpen,
    computeConferenceRaces, computeRaceOdds, computeKeyGames, buildScenarioLines,
    type RaceRow, type RaceStatus, type RaceOdds, type ConferenceRace, type RaceZones, type TieGroup, type KeyGame, type KeyGameKind,
} from './playoffRaceUtils';

type Conf = 'East' | 'West';

const CONF_TABS: { value: Conf; label: string }[] = [
    { value: 'East', label: '동부' },
    { value: 'West', label: '서부' },
];

const STATUS_LABEL: Record<RaceStatus, { text: string; cls: string }> = {
    clinched_auto:  { text: '직행 확정',   cls: 'text-emerald-400' },
    clinched_entry: { text: '진출 확정',   cls: 'text-emerald-400' },
    eliminated:     { text: '탈락',        cls: 'text-slate-600' },
    auto_zone:      { text: '직행권',      cls: 'text-slate-200' },
    playin_zone:    { text: '플레이인권',  cls: 'text-amber-400' },
    chasing:        { text: '추격 중',     cls: 'text-red-400' },
};

// 0%/100%는 정확히 확정된 값만 그대로, 그 외 극단값은 <1% / >99%로 뭉개서 "확정처럼" 보이지 않게 한다.
const fmtPct = (p: number): string => {
    if (p <= 0) return '0%';
    if (p >= 1) return '100%';
    const r = Math.round(p * 100);
    return r < 1 ? '<1%' : r > 99 ? '>99%' : `${r}%`;
};
const oddsColor = (p: number) => (p >= 0.75 ? 'text-emerald-400' : p >= 0.25 ? 'text-amber-400' : 'text-red-400');

const fmtPd = (v: number) => (v === 0 ? '0' : `${v > 0 ? '+' : ''}${Math.round(v)}`);

// 매직넘버 셀 — ≤0은 이미 확정(✓), 남은 경기 안에 자력으로 닿을 수 없으면 흐리게(경쟁팀 도움 필요).
const MagicCell: React.FC<{ value: number; remaining: number; dead?: boolean }> = ({ value, remaining, dead }) => {
    if (dead || !Number.isFinite(value)) return <span className="text-slate-700">-</span>;
    if (value <= 0) return <span className="text-emerald-400">✓</span>;
    return <span className={value <= remaining ? 'text-white' : 'text-slate-500'}>{value}</span>;
};

const ElimCell: React.FC<{ value: number; dead?: boolean }> = ({ value, dead }) => {
    if (!Number.isFinite(value)) return <span className="text-slate-700">-</span>;
    if (value <= 0) return <span className="text-slate-600">{dead ? '✕' : '-'}</span>;
    return <span className={value <= 3 ? 'text-red-400' : 'text-slate-300'}>{value}</span>;
};

const CutLine: React.FC<{ colSpan: number; tone: 'auto' | 'last' }> = ({ colSpan, tone }) => (
    <tr>
        <td colSpan={colSpan} className="p-0">
            <div className={`h-[1px] ${tone === 'auto' ? 'bg-emerald-500/40' : 'bg-amber-500/40'}`} />
        </td>
    </tr>
);

const RaceHeader: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <div className="flex items-center justify-between px-4 py-3 shrink-0 bg-slate-900 border-b border-slate-800">
        <h1 className="text-lg font-black text-white ko-tight truncate">순위 경쟁</h1>
        {children}
    </div>
);

const PlayoffRaceView: React.FC = () => {
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, room, leagueTeams, timeline, isLoading: leagueLoading } = useLeagueContext();
    const { session } = useGame();
    const { getGameUrlId } = useGameShortCodes(room?.id);
    const myTeam = leagueTeams.find(t => t.user_id === session?.user?.id);
    const { isLoading: gameLoading, schedule } = useSeasonContext();
    const serverNow = useServerClockBucket();

    const playoffTeamsPerConf = league?.playoff_team_count ?? 8;
    const playInEnabled = league?.play_in_enabled ?? true;
    const zones: RaceZones = getRaceZones(playoffTeamsPerConf, playInEnabled);

    const currentVirtualDate = useCurrentVirtualDate(schedule, league?.type, league?.sim_real_start_at, league?.games_per_real_day, timeline);
    const seasonEnd = useMemo(() => getRegularSeasonEndDate(schedule), [schedule]);
    const isOpen = league?.type === 'main_league' && isPlayoffRaceOpen(currentVirtualDate, seasonEnd);

    const [conf, setConf] = useState<Conf>(() => (myTeam?.conference === 'West' ? 'West' : 'East'));
    const [expanded, setExpanded] = useState<string | null>(null);

    const slugs = useMemo(() => leagueTeams.map(t => t.team_slug), [leagueTeams]);
    const teamBySlug = useMemo(() => new Map(leagueTeams.map(t => [t.team_slug, t])), [leagueTeams]);
    const statsMap = useMemo(
        () => computeMultiStandingsStats(slugs, schedule, serverNow, {}),
        [slugs, schedule, serverNow],
    );

    const races = useMemo(
        () => isOpen ? computeConferenceRaces(leagueTeams, statsMap, schedule, serverNow, playoffTeamsPerConf, playInEnabled) : null,
        [isOpen, leagueTeams, statsMap, schedule, serverNow, playoffTeamsPerConf, playInEnabled],
    );

    // 몬테카를로는 무작위라 매 틱 재계산하면 숫자가 흔들린다 — "공개된 경기 수"가 바뀔 때만 다시 돌린다.
    // (statsMap/schedule/serverNow는 그 렌더 시점의 최신 값을 클로저로 읽음)
    const completedKey = useMemo(
        () => Object.values(statsMap).reduce((s, r) => s + r.wins + r.losses, 0),
        [statsMap],
    );
    const odds = useMemo(
        () => isOpen ? computeRaceOdds(leagueTeams, statsMap, schedule, serverNow, playoffTeamsPerConf, playInEnabled) : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isOpen, completedKey, leagueTeams, playoffTeamsPerConf, playInEnabled],
    );

    // 중요한 경기 — 남은 경기마다 승/패 두 가정으로 확정·탈락 판정을 다시 돌린다(playoffRaceUtils.computeKeyGames).
    const keyGames = useMemo(
        () => isOpen
            ? computeKeyGames(conf, leagueTeams, statsMap, schedule, serverNow, playoffTeamsPerConf, playInEnabled,
                slug => teamBySlug.get(slug)?.team_name ?? slug)
            : [],
        [isOpen, conf, leagueTeams, statsMap, schedule, serverNow, playoffTeamsPerConf, playInEnabled, teamBySlug],
    );

    if (leagueLoading || gameLoading) return <Spinner variant="page" />;

    if (!isOpen || !races || !odds) {
        const openFrom = seasonEnd ? fmtDate(addDaysToKey(seasonEnd, -PLAYOFF_RACE_WINDOW_DAYS)) : null;
        return (
            <div className="flex flex-col h-full">
                <RaceHeader />
                <div className="flex-1 flex items-center justify-center text-sm text-slate-500 px-6 text-center leading-relaxed">
                    {league?.type !== 'main_league'
                        ? '이 세션에서는 순위 경쟁 화면을 지원하지 않습니다.'
                        : `정규시즌 종료 ${PLAYOFF_RACE_WINDOW_DAYS}일 전${openFrom ? `(${openFrom})` : ''}부터 열립니다.`}
                </div>
            </div>
        );
    }

    const daysLeft = seasonEnd && currentVirtualDate ? Math.max(0, daysBetweenKeys(currentVirtualDate, seasonEnd)) : null;

    return (
        <PlayoffRaceBody
            conf={conf}
            onConfChange={setConf}
            race={races[conf]}
            odds={odds}
            keyGames={keyGames}
            zones={zones}
            playInEnabled={playInEnabled}
            teamBySlug={teamBySlug}
            daysLeft={daysLeft}
            onOpenTeam={slug => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${slug}`)}
            onOpenGame={gameId => navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(gameId)}`)}
        />
    );
};

export interface PlayoffRaceBodyProps {
    conf: Conf;
    onConfChange: (c: Conf) => void;
    race: ConferenceRace;
    odds: Record<string, RaceOdds>;
    keyGames: KeyGame[];
    zones: RaceZones;
    playInEnabled: boolean;
    teamBySlug: TeamBySlug;
    daysLeft: number | null;
    onOpenTeam: (slug: string) => void;
    onOpenGame: (gameId: string) => void;
    /** 처음부터 펼쳐 둘 팀(목업/스크린샷용) */
    initialExpanded?: string | null;
}

/** 화면 본체(표시 전용) — 데이터 로딩/계산은 PlayoffRaceView, 목업(dev)도 이 컴포넌트를 그대로 쓴다. */
export const PlayoffRaceBody: React.FC<PlayoffRaceBodyProps> = ({
    conf, onConfChange, race, odds, keyGames, zones, playInEnabled, teamBySlug, daysLeft, onOpenTeam, onOpenGame, initialExpanded = null,
}) => {
    const hasPlayInTier = playInEnabled && zones.autoK !== zones.lastK;
    const [expanded, setExpanded] = useState<string | null>(initialExpanded);
    const colCount = hasPlayInTier ? 14 : 11;
    const maxRemaining = Math.max(0, ...race.rows.map(r => r.remaining));

    return (
        <div className="flex flex-col h-full">
            <RaceHeader>
                <SegmentedControl<Conf>
                    className="shrink-0"
                    value={conf}
                    onChange={c => { onConfChange(c); setExpanded(null); }}
                    options={CONF_TABS}
                />
            </RaceHeader>

            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar bg-slate-950">
                {/* 요약 띠 — 컷 정의 */}
                <div className="px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-400 border-b border-slate-800">
                    <span style={{ color: CONFERENCE_COLORS[conf] }} className="text-base font-bold">{conf === 'East' ? '동부 컨퍼런스' : '서부 컨퍼런스'}</span>
                    {daysLeft !== null && <span>정규시즌 종료까지 <b className="text-white tabular-nums">{daysLeft}</b>일</span>}
                    <span>팀당 남은 경기 최대 <b className="text-white tabular-nums">{maxRemaining}</b></span>
                    <span className="flex items-center gap-1.5"><i className="inline-block w-3 h-[2px] bg-emerald-500/60" />{hasPlayInTier ? `직행 ${zones.autoK}위` : `진출 ${zones.autoK}위`}</span>
                    {hasPlayInTier && <span className="flex items-center gap-1.5"><i className="inline-block w-3 h-[2px] bg-amber-500/60" />플레이인 {zones.autoK + 1}~{zones.lastK}위</span>}
                </div>

                <Table variant="flush" className="custom-scrollbar-hide" fullHeight={false}>
                    <TableHead>
                        <TableHeaderCell align="center" width={44}>#</TableHeaderCell>
                        <TableHeaderCell align="left" width={190} className="pl-2">TEAM</TableHeaderCell>
                        <TableHeaderCell align="center" width={44}>W</TableHeaderCell>
                        <TableHeaderCell align="center" width={44}>L</TableHeaderCell>
                        <TableHeaderCell align="center" width={52}>잔여</TableHeaderCell>
                        <TableHeaderCell align="center" width={60}>컷 GB</TableHeaderCell>
                        <TableHeaderCell align="center" width={64}>득실차</TableHeaderCell>
                        {hasPlayInTier && <TableHeaderCell align="center" width={64}>직행%</TableHeaderCell>}
                        {hasPlayInTier && <TableHeaderCell align="center" width={72}>플레이인%</TableHeaderCell>}
                        <TableHeaderCell align="center" width={64}>진출%</TableHeaderCell>
                        {hasPlayInTier && <TableHeaderCell align="center" width={64}>직행 M</TableHeaderCell>}
                        <TableHeaderCell align="center" width={hasPlayInTier ? 72 : 64}>{hasPlayInTier ? '진출 M' : '매직넘버'}</TableHeaderCell>
                        <TableHeaderCell align="center" width={64}>탈락 N</TableHeaderCell>
                        <TableHeaderCell align="center" width={96}>상태</TableHeaderCell>
                    </TableHead>
                    <TableBody>
                        {race.rows.map(row => {
                            const team = teamBySlug.get(row.slug);
                            if (!team) return null;
                            const o = odds[row.slug];
                            const st = STATUS_LABEL[row.status];
                            // 플레이인 구간이 있으면 clinched_entry는 "플레이인 이상"만 확정 — "진출 확정"이면 본선 진출로 오해된다.
                            const stText = row.status === 'clinched_entry' && hasPlayInTier ? '플레이인 이상' : st.text;
                            const dead = row.status === 'eliminated';
                            const isOpenRow = expanded === row.slug;
                            const cutRow = race.rows[zones.lastK - (row.rank > zones.lastK ? 1 : 0)];
                            const cutGb = cutRow && cutRow.slug !== row.slug
                                ? (row.margin - cutRow.margin) / 2
                                : 0;
                            return (
                                <React.Fragment key={row.slug}>
                                    <TableRow onClick={() => setExpanded(isOpenRow ? null : row.slug)} className={dead ? 'opacity-60' : ''}>
                                        <TableCell align="center" className="text-sm tabular-nums text-white">{row.rank}</TableCell>
                                        <TableCell align="left" className="pl-2">
                                            <span className="flex items-center gap-2 min-w-0">
                                                {isOpenRow ? <ChevronDown size={14} className="text-slate-500 shrink-0" /> : <ChevronRight size={14} className="text-slate-600 shrink-0" />}
                                                <TeamLogo teamId={team.team_slug} teamName={team.team_abbr} size="custom" className="w-6 h-6 shrink-0" shadow={false} />
                                                <span
                                                    onClick={e => { e.stopPropagation(); onOpenTeam(team.team_slug); }}
                                                    className={`text-sm font-semibold truncate cursor-pointer hover:underline ${dead ? 'text-slate-600' : st.cls === 'text-emerald-400' ? 'text-emerald-400' : 'text-slate-200'}`}
                                                >
                                                    {team.team_name}
                                                </span>
                                            </span>
                                        </TableCell>
                                        <TableCell align="center" className="text-sm tabular-nums text-white">{row.wins}</TableCell>
                                        <TableCell align="center" className="text-sm tabular-nums text-white">{row.losses}</TableCell>
                                        <TableCell align="center" className="text-sm tabular-nums text-slate-300">{row.remaining}</TableCell>
                                        <TableCell align="center" className={`text-sm tabular-nums ${cutGb > 0 ? 'text-emerald-400' : cutGb < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                            {cutGb === 0 ? '-' : (cutGb > 0 ? '+' : '') + cutGb.toFixed(1)}
                                        </TableCell>
                                        <TableCell align="center" className={`text-sm tabular-nums ${row.pointDiff > 0 ? 'text-emerald-400' : row.pointDiff < 0 ? 'text-red-400' : 'text-slate-500'}`}>{fmtPd(row.pointDiff)}</TableCell>
                                        {hasPlayInTier && <TableCell align="center" className={`text-sm tabular-nums ${oddsColor(o.auto)}`}>{fmtPct(o.auto)}</TableCell>}
                                        {hasPlayInTier && <TableCell align="center" className="text-sm tabular-nums text-slate-300">{fmtPct(o.playIn)}</TableCell>}
                                        <TableCell align="center" className={`text-sm tabular-nums font-semibold ${oddsColor(o.qualify)}`}>{fmtPct(o.qualify)}</TableCell>
                                        {hasPlayInTier && (
                                            <TableCell align="center" className="text-sm tabular-nums">
                                                <MagicCell value={row.autoMagic} remaining={row.remaining} dead={dead || row.autoElim <= 0} />
                                            </TableCell>
                                        )}
                                        <TableCell align="center" className="text-sm tabular-nums">
                                            <MagicCell value={hasPlayInTier ? row.entryMagic : row.autoMagic} remaining={row.remaining} dead={dead} />
                                        </TableCell>
                                        <TableCell align="center" className="text-sm tabular-nums">
                                            <ElimCell value={row.entryElim} dead={dead} />
                                        </TableCell>
                                        <TableCell align="center" className={`text-xs font-semibold ${st.cls}`}>{stText}</TableCell>
                                    </TableRow>

                                    {isOpenRow && (
                                        <tr>
                                            <td colSpan={colCount} className="bg-slate-800/60 border-b border-slate-800">
                                                <TeamDetail row={row} zones={zones} playInEnabled={playInEnabled} teamBySlug={teamBySlug} />
                                            </td>
                                        </tr>
                                    )}

                                    {row.rank === zones.autoK && zones.autoK > 0 && <CutLine colSpan={colCount} tone="auto" />}
                                    {hasPlayInTier && row.rank === zones.lastK && <CutLine colSpan={colCount} tone="last" />}
                                </React.Fragment>
                            );
                        })}
                    </TableBody>
                </Table>

                <KeyGamesPanel games={keyGames} teamBySlug={teamBySlug} onOpenGame={onOpenGame} />

                <TieBreakPanel ties={race.ties} rows={race.rows} teamBySlug={teamBySlug} zones={zones} />

                <p className="px-4 pb-6 pt-1 text-[11px] leading-relaxed text-slate-400">
                    M(매직넘버) = 확정까지 필요한 「본인 승리 + 경쟁팀 패배」의 합, N(탈락넘버) = 탈락까지 「본인 패배 + 경쟁팀 승리」의 합입니다.
                    흐린 숫자는 남은 경기를 전승해도 닿지 않아 경쟁팀의 도움이 필요한 경우입니다. 동률은 위협으로 간주하는 보수적 계산이라 실제 확정보다 한 박자 늦게 표시될 수 있고,
                    확률은 승률 기반 1,000회 시뮬레이션(경기 결과가 공개될 때마다 갱신)입니다.
                </p>
            </div>
        </div>
    );
};

// ── 팀 상세(경우의 수 / 잔여 일정 / 맞대결) ─────────────────────────────────────

type TeamBySlug = Map<string, ReturnType<typeof useLeagueContext>['leagueTeams'][number]>;

const TeamDetail: React.FC<{ row: RaceRow; zones: RaceZones; playInEnabled: boolean; teamBySlug: TeamBySlug }> = ({ row, zones, playInEnabled, teamBySlug }) => {
    const scenarios = buildScenarioLines(row, zones, playInEnabled);
    const nameOf = (s: string) => teamBySlug.get(s)?.team_name ?? s;
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4 px-6 py-4 text-sm">
            <div>
                <p className="font-bold text-slate-300 mb-1.5">경우의 수</p>
                <ul className="space-y-1 text-slate-400 leading-relaxed list-disc pl-4">
                    {scenarios.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
                <p className="mt-2 text-slate-500">전승 시 {row.maxWins}승 · 잔여 일정 상대 평균 승률 <span className="text-slate-300 tabular-nums">{fmtWinPct(row.remainingSos)}</span></p>
            </div>
            <div>
                <p className="font-bold text-slate-300 mb-1.5">다음 경기</p>
                {row.nextGames.length === 0 ? <p className="text-slate-500">남은 경기 없음</p> : (
                    <ul className="space-y-1">
                        {row.nextGames.map((g, i) => (
                            <li key={i} className="flex items-center gap-2 text-slate-400">
                                <span className="tabular-nums text-slate-500 w-10">{fmtDate(g.date)}</span>
                                <span className="text-slate-500 w-6">{g.isHome ? 'vs' : '@'}</span>
                                <TeamLogo teamId={g.oppSlug} teamName={nameOf(g.oppSlug)} size="custom" className="w-4 h-4 shrink-0" shadow={false} />
                                <span className="truncate">{nameOf(g.oppSlug)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div>
                <p className="font-bold text-slate-300 mb-1.5">순위 인접팀과 남은 맞대결</p>
                {row.rivalGames.length === 0 ? <p className="text-slate-500">없음</p> : (
                    <ul className="space-y-1">
                        {row.rivalGames.map(r => (
                            <li key={r.slug} className="flex items-center gap-2 text-slate-400">
                                <TeamLogo teamId={r.slug} teamName={nameOf(r.slug)} size="custom" className="w-4 h-4 shrink-0" shadow={false} />
                                <span className="truncate flex-1">{nameOf(r.slug)}</span>
                                <span className="tabular-nums text-slate-300">{r.games}경기</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

// ── 중요한 경기 ───────────────────────────────────────────────────────────────

const KIND_TAG: Record<KeyGameKind, { text: string; cls: string }> = {
    elimination: { text: '탈락 결정', cls: 'text-red-400' },
    clinch:      { text: '확정 결정', cls: 'text-emerald-400' },
};
const KIND_ORDER: KeyGameKind[] = ['elimination', 'clinch'];

const KeyGamesPanel: React.FC<{ games: KeyGame[]; teamBySlug: TeamBySlug; onOpenGame: (gameId: string) => void }> = ({ games, teamBySlug, onOpenGame }) => {
    const nameOf = (s: string) => teamBySlug.get(s)?.team_name ?? s;
    return (
        <div className="border-t border-slate-800">
            <div className="px-4 pt-4 pb-3">
                <p className="text-sm font-bold text-white mb-1">중요한 경기 <span className="text-slate-400 font-medium tabular-nums">{games.length}</span></p>
                <p className="text-[11px] text-slate-400">결과에 따라 플레이오프·플레이인 진출이 확정되거나 탈락이 결정되는 경기만 보여줍니다. 같은 사건은 가장 가까운 기회만 표시하며, 날짜를 누르면 경기 화면으로 이동합니다.</p>
            </div>
            {games.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-white">진출 확정이나 탈락을 결정짓는 남은 경기가 아직 없습니다.</p>
            ) : (
                <Table variant="flush" className="custom-scrollbar-hide" fullHeight={false} density="compact">
                    <TableHead>
                        <TableHeaderCell align="left" width={72} className="pl-4">날짜</TableHeaderCell>
                        <TableHeaderCell align="left" width={150}>구분</TableHeaderCell>
                        <TableHeaderCell align="left" width={300}>매치업</TableHeaderCell>
                        <TableHeaderCell align="left">결과</TableHeaderCell>
                        <TableHeaderCell align="left" width={320}>타이브레이커</TableHeaderCell>
                    </TableHead>
                    <TableBody>
                        {games.map(g => (
                            <TableRow key={g.id} className="align-top">
                                <TableCell align="left" className="pl-4 text-xs text-white align-top">
                                    <button
                                        type="button"
                                        onClick={() => onOpenGame(g.id)}
                                        className="tabular-nums text-white hover:underline cursor-pointer"
                                    >
                                        {fmtDate(g.date)}
                                    </button>
                                </TableCell>
                                <TableCell align="left" className="text-xs align-top">
                                    <span className="flex flex-wrap gap-x-1.5">
                                        {KIND_ORDER.filter(k => g.kinds.includes(k)).map(k => (
                                            <b key={k} className={KIND_TAG[k].cls}>{KIND_TAG[k].text}</b>
                                        ))}
                                    </span>
                                </TableCell>
                                <TableCell align="left" className="text-xs font-semibold text-white align-top">
                                    {nameOf(g.awaySlug)} @ {nameOf(g.homeSlug)}
                                </TableCell>
                                <TableCell align="left" className="text-xs text-white leading-relaxed align-top">
                                    <ul className="space-y-0.5">
                                        {g.notes.map((n, i) => <li key={i}>{n}</li>)}
                                    </ul>
                                </TableCell>
                                <TableCell align="left" className="text-xs text-white align-top">
                                    {!g.tiebreak ? <span className="text-slate-400">-</span>
                                        : g.tiebreak.holderSlug
                                            ? <><b className="font-semibold">{nameOf(g.tiebreak.holderSlug)}</b> · {g.tiebreak.holderDetail} <span className="text-slate-300">(상대 {g.tiebreak.otherDetail})</span></>
                                            : <>추첨</>}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
};

// ── 타이브레이커 ────────────────────────────────────────────────────────────

const TieBreakPanel: React.FC<{ ties: TieGroup[]; rows: RaceRow[]; teamBySlug: TeamBySlug; zones: RaceZones }> = ({ ties, teamBySlug, zones }) => {
    const nameOf = (s: string) => teamBySlug.get(s)?.team_name ?? s;
    return (
        <div className="border-t border-slate-800">
            <div className="px-4 pt-4 pb-3">
                <p className="text-sm font-bold text-white mb-1">타이브레이커</p>
                <p className="text-[11px] text-slate-400">NBA 공식 규정(NBA.com 2025-26)을 따릅니다. 승률이 같을 때만 적용하며, 앞 기준에서 차이가 나면 뒤 기준은 보지 않습니다.</p>
            </div>

            {/* 적용 순서 */}
            <Table variant="flush" className="custom-scrollbar-hide" fullHeight={false} density="compact">
                <TableHead>
                    <TableHeaderCell align="left" width={72} className="pl-4">순서</TableHeaderCell>
                    <TableHeaderCell align="left" width={380}>2팀 동률</TableHeaderCell>
                    <TableHeaderCell align="left">3팀 이상 동률</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {TIEBREAK_RULE_TABLE.map((r, i) => (
                        <TableRow key={i}>
                            <TableCell align="left" className="pl-4 text-xs tabular-nums text-white">{i + 1}</TableCell>
                            <TableCell align="left" className="text-xs text-white">{r.two}</TableCell>
                            <TableCell align="left" className="text-xs text-white">{r.multi}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <ul className="px-4 pt-3 pb-1 space-y-0.5 text-[11px] text-slate-400 list-disc pl-8">
                <li>3팀 이상은 처음으로 차이가 생기는 기준을 적용하고, 일부만 갈리면 갈린 팀은 순위를 받은 뒤 남은 팀끼리 기준을 처음부터 다시 적용합니다(2팀이 남으면 2팀 기준).</li>
                <li>"진출권 팀" = 포스트시즌(플레이인 포함)에 나가는 컨퍼런스 상위 {zones.lastK}팀 + 그 마지막 순위와 승률이 같은 팀(NBA 규정: 상위 10팀 + 10위 동률 팀).</li>
                <li>모든 기준이 같으면 추첨으로 정합니다. 득실차는 현재 기록 기준이라 남은 경기에 따라 바뀔 수 있습니다.</li>
            </ul>

            {/* 현재 컷라인에 걸친 동률 */}
            <div className="px-4 pt-4 pb-2">
                <p className="text-xs font-bold text-white">현재 컷라인에 걸친 동률</p>
            </div>
            {ties.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-white">현재 컷라인에 걸친 동률 팀은 없습니다.</p>
            ) : (
                <Table variant="flush" className="custom-scrollbar-hide" fullHeight={false} density="compact">
                    <TableHead>
                        <TableHeaderCell align="left" width={150} className="pl-4">컷</TableHeaderCell>
                        <TableHeaderCell align="left" width={90}>전적</TableHeaderCell>
                        <TableHeaderCell align="left">동률 팀 (시드 순 · 결정 근거)</TableHeaderCell>
                        <TableHeaderCell align="left" width={320}>순서 결정</TableHeaderCell>
                    </TableHead>
                    <TableBody>
                        {ties.map(tg => (
                            <TableRow key={tg.slugs.join('|')} className="align-top">
                                <TableCell align="left" className="pl-4 text-xs font-semibold align-top">
                                    <span className={tg.boundary === 'auto' ? 'text-emerald-400' : 'text-amber-400'}>
                                        {tg.boundary === 'auto' ? `직행 컷 (${zones.autoK}위)` : `${zones.autoK === zones.lastK ? '진출' : '플레이인'} 컷 (${zones.lastK}위)`}
                                    </span>
                                </TableCell>
                                <TableCell align="left" className="text-xs tabular-nums text-white align-top">{tg.wins}-{tg.losses}</TableCell>
                                <TableCell align="left" className="text-xs text-white align-top">
                                    <ol className="space-y-0.5">
                                        {tg.slugs.map((s, i) => (
                                            <li key={s}>
                                                <span className="tabular-nums mr-1.5">{i + 1}.</span>
                                                {nameOf(s)} <span className="text-slate-300">— {tg.details[s] ?? '-'}</span>
                                            </li>
                                        ))}
                                    </ol>
                                </TableCell>
                                <TableCell align="left" className="text-xs text-white align-top">
                                    {tg.criteria.length === 0 ? '-' : tg.criteria.map(c => CRITERION_LABEL[c]).join(' → ')}
                                    {tg.drawn && ' (추첨으로 결정)'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
};

export default PlayoffRaceView;
