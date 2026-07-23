
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Tv } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import { useGame } from '../../../hooks/useGameContext';
import { useServerClock } from '../../../utils/serverClock';
import { getGameDisplayState, isStarted, resolveRealAt, type GameDisplayState } from './multiGameReveal';
import { fetchLiveGamesSummary, type LiveGameSummary } from '../../../services/multi/liveGameService';
import { supabase } from '../../../services/supabaseClient';
import type { Game } from '../../../types';
import type { PlayerBoxScore } from '../../../types/engine';

const LIVE_POLL_MS = 5000;

// ── 경기 리더(득점/리바운드/어시스트) ─────────────────────────────────────────

interface StatLeader { name: string; value: number }
interface GameLeaders { pts?: StatLeader; reb?: StatLeader; ast?: StatLeader }

function computeGameLeaders(homeBox: PlayerBoxScore[] | null, awayBox: PlayerBoxScore[] | null): GameLeaders {
    const all = [...(homeBox ?? []), ...(awayBox ?? [])];
    const topBy = (fn: (p: PlayerBoxScore) => number) =>
        all.reduce<PlayerBoxScore | null>((best, p) => (!best || fn(p) > fn(best) ? p : best), null);
    const ptsP = topBy(p => p.pts);
    const rebP = topBy(p => p.reb);
    const astP = topBy(p => p.ast);
    return {
        pts: ptsP ? { name: ptsP.playerName, value: ptsP.pts } : undefined,
        reb: rebP ? { name: rebP.playerName, value: rebP.reb } : undefined,
        ast: astP ? { name: astP.playerName, value: astP.ast } : undefined,
    };
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function fmtDayLabel(dateKey: string): string {
    const dt = new Date(dateKey + 'T00:00:00');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${days[dt.getDay()]})`;
}

// g.date는 슬롯(game_seq) 기반 달력 계산값이라 sim_real_start_at의 시각 오프셋에 따라
// 실제 KST 자정 경계와 어긋날 수 있다(예: 23:40 다음 슬롯이 00:10인데도 g.date가 그대로).
// "시간" 컬럼과 항상 같은 진실(scheduledAt의 KST 환산)을 기준으로 삼아야 자정을 넘는 경기가
// 정확한 다음날 날짜로 표시된다.
function kstDateKey(g: Game): string {
    if (g.scheduledAt) {
        const kst = new Date(new Date(g.scheduledAt).getTime() + 9 * 3_600_000);
        const y = kst.getUTCFullYear();
        const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
        const d = String(kst.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return g.date.slice(0, 10);
}

function fmtDateShort(g: Game): string {
    const dt = new Date(kstDateKey(g) + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

// scheduledAt (UTC ISO) → KST 시각 문자열. game_seq 방식은 normalize 후 호출하므로 항상 scheduledAt 있음.
function fmtTime(g: Game): string {
    if (g.scheduledAt) {
        const kst = new Date(new Date(g.scheduledAt).getTime() + 9 * 3_600_000);
        const h = kst.getUTCHours().toString().padStart(2, '0');
        const m = kst.getUTCMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }
    if (g.time) return g.time;
    return '—';
}

// 토너먼트 시리즈 id → 라운드 라벨("1라운드"/"준결승"/"결승"). TournamentBracketView/MultiHeader와 동일한 규칙.
function computeRoundLabelMap(bracketData: unknown): Record<string, string> {
    const series: any[] = (bracketData as any)?.series ?? [];
    if (!series.length) return {};
    const totalRounds = series.reduce((max: number, s: any) => Math.max(max, s.round ?? 1), 1);
    const map: Record<string, string> = {};
    for (const s of series) {
        const r = s.round ?? 1;
        map[s.id] = r === totalRounds ? '결승'
            : r === totalRounds - 1 && totalRounds > 2 ? '준결승'
            : `${r}라운드`;
    }
    return map;
}

interface DayGroup { dateKey: string; label: string; games: Game[] }

function groupByDay(games: Game[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const g of games) {
        const dateKey = kstDateKey(g);
        const last = groups[groups.length - 1];
        if (last && last.dateKey === dateKey) {
            last.games.push(g);
        } else {
            groups.push({ dateKey, label: fmtDayLabel(dateKey), games: [g] });
        }
    }
    return groups;
}

// ── 서브 컴포넌트 ──────────────────────────────────────────────────────────────

interface TeamCellProps {
    name: string;
    abbr: string;
    colorPrimary: string;
    colorSecondary: string;
    isMyTeam: boolean;
    showLive?: boolean;
}

const TeamCell: React.FC<TeamCellProps> = ({ name, abbr, colorPrimary, colorSecondary, isMyTeam, showLive }) => (
    <div className="flex items-center gap-1.5 min-w-0">
        <div
            className="w-9 h-5 rounded text-[10px] font-black flex items-center justify-center shrink-0"
            style={{ backgroundColor: colorPrimary, color: colorSecondary }}
        >
            {abbr.slice(0, 3)}
        </div>
        <span className={`font-medium truncate text-xs ko-normal ${isMyTeam ? 'text-yellow-400 font-bold' : 'text-slate-300'}`}>
            {name}
        </span>
        {showLive && (
            <span className="flex items-center gap-1 shrink-0 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-[10px] font-bold text-red-400">LIVE</span>
            </span>
        )}
    </div>
);

interface GameRowProps {
    g: Game;
    state: GameDisplayState;
    teamMap: Record<string, any>;
    myTeamId: string | null;
    liveSummaries: Record<string, LiveGameSummary>;
    gameLeadersMap: Record<string, GameLeaders>;
    roundLabelMap: Record<string, string>;
    onView: (gameId: string) => void;
    serverNow: number;
    zebra: boolean;
}

const GameRow: React.FC<GameRowProps> = ({ g, state, teamMap, myTeamId, liveSummaries, gameLeadersMap, roundLabelMap, onView, serverNow, zebra }) => {
    const home = teamMap[g.homeTeamId];
    const away = teamMap[g.awayTeamId];
    const isMyGame = g.homeTeamId === myTeamId || g.awayTeamId === myTeamId;
    const roundLabel = g.isPlayoff && g.seriesId ? roundLabelMap[g.seriesId] : undefined;

    return (
        <div className={`grid grid-cols-[auto_auto_auto_160px_1fr_auto_auto_auto_auto_auto_auto] gap-x-4 items-center px-2 py-2 border-b border-slate-800/70 ${
            isMyGame ? 'bg-emerald-500/20' : zebra ? 'bg-white/[0.025]' : ''
        }`}>
            {/* 날짜 */}
            <span className="w-10 text-center font-mono text-xs font-medium text-slate-300">
                {fmtDateShort(g)}
            </span>

            {/* 시간 (KST) */}
            <span className="w-12 text-center font-mono text-xs font-medium text-slate-300">
                {fmtTime(g)}
            </span>

            {/* 토너먼트 라운드 */}
            <span className="w-14 text-xs font-medium text-slate-300 ko-normal truncate">
                {roundLabel ?? ''}
            </span>

            {/* 원정팀 */}
            <div className="min-w-0">
                {away ? (
                    <TeamCell
                        name={away.team_name}
                        abbr={away.team_abbr}
                        colorPrimary={away.color_primary ?? '#334155'}
                        colorSecondary={away.color_secondary ?? '#fff'}
                        isMyTeam={g.awayTeamId === myTeamId}
                    />
                ) : (
                    <span className="text-xs font-medium text-slate-300">{g.awayTeamId}</span>
                )}
            </div>

            {/* 홈팀 */}
            <div className="min-w-0">
                {home ? (
                    <TeamCell
                        name={home.team_name}
                        abbr={home.team_abbr}
                        colorPrimary={home.color_primary ?? '#334155'}
                        colorSecondary={home.color_secondary ?? '#fff'}
                        isMyTeam={g.homeTeamId === myTeamId}
                        showLive={state === 'live'}
                    />
                ) : (
                    <span className="text-xs font-medium text-slate-300">{g.homeTeamId}</span>
                )}
            </div>

            {/* PTS 리더 — 경기 종료 후에만 표시 */}
            <span className="w-28 truncate text-xs font-medium text-slate-300 ko-normal">
                {state === 'final' && gameLeadersMap[g.id]?.pts
                    ? `${gameLeadersMap[g.id].pts!.name} (${gameLeadersMap[g.id].pts!.value})`
                    : ''}
            </span>

            {/* REB 리더 */}
            <span className="w-28 truncate text-xs font-medium text-slate-300 ko-normal">
                {state === 'final' && gameLeadersMap[g.id]?.reb
                    ? `${gameLeadersMap[g.id].reb!.name} (${gameLeadersMap[g.id].reb!.value})`
                    : ''}
            </span>

            {/* AST 리더 */}
            <span className="w-28 truncate text-xs font-medium text-slate-300 ko-normal">
                {state === 'final' && gameLeadersMap[g.id]?.ast
                    ? `${gameLeadersMap[g.id].ast!.name} (${gameLeadersMap[g.id].ast!.value})`
                    : ''}
            </span>

            {/* 스코어 (원정-홈 순) */}
            <div className="w-16 flex items-center justify-center gap-0.5 font-mono tabular-nums text-xs">
                {state === 'final' && g.homeScore != null && g.awayScore != null ? (
                    <>
                        <span className="text-slate-300 font-semibold">{g.awayScore}</span>
                        <span className="text-slate-400 mx-0.5">-</span>
                        <span className="text-slate-300 font-semibold">{g.homeScore}</span>
                    </>
                ) : state === 'live' ? (() => {
                    const live = liveSummaries[g.id];
                    if (!live || live.homeScore == null || live.awayScore == null) {
                        return <span className="text-red-400 font-bold animate-pulse">LIVE</span>;
                    }
                    const liveHomeWon = live.homeScore > live.awayScore;
                    return (
                        <>
                            <span className={liveHomeWon ? 'text-white font-bold' : 'text-yellow-400 font-bold'}>{live.awayScore}</span>
                            <span className="text-slate-400 mx-0.5">-</span>
                            <span className={liveHomeWon ? 'text-yellow-400 font-bold' : 'text-white font-bold'}>{live.homeScore}</span>
                        </>
                    );
                })() : (
                    <span className="text-slate-300">—</span>
                )}
            </div>

            {/* 쿼터/게임클락 (LIVE) / 종료 표시 (완료) */}
            <span className={`w-16 text-center font-mono text-xs ${state === 'live' ? 'text-white font-bold' : 'font-medium text-slate-300'}`}>
                {state === 'live' && liveSummaries[g.id]
                    ? `Q${liveSummaries[g.id].quarter ?? 1} ${liveSummaries[g.id].clock ?? ''}`
                    : state === 'final'
                    ? '종료'
                    : ''}
            </span>

            {/* 보기/리뷰 버튼 — 행 높이가 라이브/비라이브에 따라 달라지지 않도록 h-5로 고정 */}
            <div className="w-16 h-5 flex items-center justify-center">
                {isStarted(g, serverNow) && (
                    state === 'live' ? (
                        <button
                            onClick={() => onView(g.id)}
                            className="flex items-center justify-center gap-1 h-5 px-2 bg-red-600 hover:bg-red-500 text-white rounded-md text-[10px] font-bold leading-none transition-all active:scale-95 ko-normal"
                        >
                            <Tv size={10} />
                            보기
                        </button>
                    ) : (
                        <button
                            onClick={() => onView(g.id)}
                            className="flex items-center gap-1 text-xs font-medium leading-none text-indigo-400 hover:text-indigo-300 transition-colors ko-normal"
                        >
                            리뷰
                        </button>
                    )
                )}
            </div>
        </div>
    );
};

const COLUMN_HEADER = (
    <div className="grid grid-cols-[auto_auto_auto_160px_1fr_auto_auto_auto_auto_auto_auto] gap-x-4 px-2 py-1.5 border-b border-slate-700">
        <span className="text-xs font-medium text-slate-300 ko-normal w-10 text-center">날짜</span>
        <span className="text-xs font-medium text-slate-300 ko-normal w-12 text-center">시간</span>
        <span className="text-xs font-medium text-slate-300 ko-normal w-14">라운드</span>
        <span className="text-xs font-medium text-slate-300 ko-normal">원정</span>
        <span className="text-xs font-medium text-slate-300 ko-normal">홈</span>
        <span className="text-xs font-medium text-slate-300 ko-normal w-28">PTS</span>
        <span className="text-xs font-medium text-slate-300 ko-normal w-28">REB</span>
        <span className="text-xs font-medium text-slate-300 ko-normal w-28">AST</span>
        <span className="text-xs font-medium text-slate-300 ko-normal w-16 text-center">스코어</span>
        <span className="text-xs font-medium text-slate-300 ko-normal w-16 text-center">쿼터/시간</span>
        <span className="text-xs font-medium text-slate-300 ko-normal w-16 text-center">보기</span>
    </div>
);

// ── 메인 뷰 ───────────────────────────────────────────────────────────────────

const MultiScheduleView: React.FC = () => {
    const { leagueId }                                    = useParams<{ leagueId: string }>();
    const navigate                                         = useNavigate();
    const { league, room, leagueTeams, isLoading: leagueLoading } = useLeagueContext();
    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    const { session } = useGame();
    const { isLoading: gameLoading, schedule, myTeamId, currentSimDate } = useMultiGameData(session, room?.id ?? null);
    const serverNow = useServerClock();

    // 진행 중(LIVE)인 경기의 실시간 스코어/쿼터/클락 — 서버가 elapsed까지만 잘라서 계산한 값
    const [liveSummaries, setLiveSummaries] = useState<Record<string, LiveGameSummary>>({});
    useEffect(() => {
        if (!room?.id) return;
        let cancelled = false;
        const poll = async () => {
            const summaries = await fetchLiveGamesSummary(room.id, session?.access_token);
            if (cancelled) return;
            setLiveSummaries(Object.fromEntries(summaries.map(s => [s.gameId, s])));
        };
        poll();
        const timer = setInterval(poll, LIVE_POLL_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, [room?.id, session?.access_token]);

    // 종료된 경기의 득점/리바운드/어시스트 리더 — game_pbp RLS가 리플레이 종료(+10분) 후에만
    // row를 노출하므로, 여기서 받아오는 행들은 자동으로 "이미 공개 가능한" 경기만 포함된다.
    const [gameLeadersMap, setGameLeadersMap] = useState<Record<string, GameLeaders>>({});
    useEffect(() => {
        if (!room?.id) return;
        let cancelled = false;
        const loadLeaders = async () => {
            const { data } = await supabase
                .from('game_pbp')
                .select('game_id, home_box, away_box')
                .eq('room_id', room.id);
            if (cancelled || !data) return;
            const map: Record<string, GameLeaders> = {};
            for (const row of data as { game_id: string; home_box: PlayerBoxScore[] | null; away_box: PlayerBoxScore[] | null }[]) {
                map[row.game_id] = computeGameLeaders(row.home_box, row.away_box);
            }
            setGameLeadersMap(map);
        };
        loadLeaders();
        const timer = setInterval(loadLeaders, LIVE_POLL_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, [room?.id]);

    const isLoading = leagueLoading || gameLoading;

    const teamMap = useMemo(() => {
        const m: Record<string, typeof leagueTeams[number]> = {};
        for (const t of leagueTeams) m[t.team_slug] = t;
        return m;
    }, [leagueTeams]);

    const roundLabelMap = useMemo(() => computeRoundLabelMap(league?.bracket_data), [league?.bracket_data]);

    const allGames = useMemo(() =>
        [...schedule]
            .map(g => ({
                ...g,
                scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt,
            }))
            // g.date는 달력 날짜(YYYY-MM-DD)만 갖고 있어 같은 날 여러 경기가 팀/시리즈 생성 순서로
            // 묶여버렸다 — 실제 예정 시각(scheduledAt) 기준으로 정렬해야 시간순이 된다.
            .sort((a, b) => (a.scheduledAt ?? a.date).localeCompare(b.scheduledAt ?? b.date)),
    [schedule, simStart, gprd]);

    // 시간순 정렬(allGames가 이미 scheduledAt 기준 오름차순) — 종료된 경기가 과거 시각이라
    // 자연히 최상단에, 진행중/예정 경기는 시간이 흐른 순서 그대로 아래에 이어진다.
    const groupedByDay = useMemo(() => groupByDay(allGames), [allGames]);
    const totalPlayed  = useMemo(() => allGames.filter(g => getGameDisplayState(g, serverNow) === 'final').length, [allGames, serverNow]);

    const handleView = (gameId: string) => navigate(`/multi/leagues/${leagueId}/season/game/${gameId}`);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="p-6 text-slate-200 pretendard">
            <div className="mb-6">
                <h1 className="text-xl font-black text-white ko-tight">시즌 일정</h1>
                <p className="text-sm text-slate-500 ko-normal mt-1">
                    전체 {allGames.length}경기 &nbsp;·&nbsp; 완료 {totalPlayed} &nbsp;·&nbsp; 잔여 {allGames.length - totalPlayed}
                </p>
            </div>

            <div className="flex flex-col gap-6">
                {groupedByDay.map(({ dateKey, label, games }) => {
                    const isToday = dateKey === currentSimDate;
                    return (
                        <div key={dateKey}>

                            {/* 날짜 헤더 — 박스 없이 제목만 */}
                            <div className="flex items-center gap-2 mb-2">
                                <h2 className={`text-base font-bold ko-normal ${isToday ? 'text-indigo-300' : 'text-white'}`}>{label}</h2>
                                {isToday && <span className="text-[10px] font-bold text-indigo-400 bg-indigo-900/50 px-1.5 py-0.5 rounded ko-normal">오늘</span>}
                                <span className="text-xs text-slate-500 ko-normal">{games.length}경기</span>
                            </div>

                            {/* 컬럼 헤더 */}
                            {COLUMN_HEADER}

                            {/* 경기 행 */}
                            {games.map((g, i) => (
                                <GameRow
                                    key={g.id}
                                    g={g}
                                    state={getGameDisplayState(g, serverNow)}
                                    teamMap={teamMap}
                                    myTeamId={myTeamId}
                                    liveSummaries={liveSummaries}
                                    gameLeadersMap={gameLeadersMap}
                                    roundLabelMap={roundLabelMap}
                                    onView={handleView}
                                    serverNow={serverNow}
                                    zebra={i % 2 === 1}
                                />
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MultiScheduleView;
