
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Tv, ChevronLeft, ChevronRight, LayoutList, LayoutGrid } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { useGame } from '../../../hooks/useGameContext';
import { useServerClock } from '../../../utils/serverClock';
import { getGameDisplayState, resolveRealAt, computeRevealedSeries, type GameDisplayState } from './multiGameReveal';
import { fetchLiveGamesSummary, type LiveGameSummary } from '../../../services/multi/liveGameService';
import { supabase } from '../../../services/supabaseClient';
import { loadGameLeadersCache, mergeGameLeadersCache, type GameLeaders } from '../../../services/multi/gameLeadersCache';
import type { Game } from '../../../types';
import type { PlayerBoxScore } from '../../../types/engine';
import { getReadableTextColor } from '../../../utils/colorContrast';
import {
    fmtDayLabel, kstDateKey, fmtDateShort, fmtTime, groupByDay, findCurrentVirtualDate,
    addDaysToKey, addMonthsToKey, fmtFullDate, type DayGroup,
} from './multiScheduleUtils';

const LIVE_POLL_MS = 5000;

// ── 경기 리더(득점/리바운드/어시스트) ─────────────────────────────────────────

function computeGameLeaders(homeBox: PlayerBoxScore[] | null, awayBox: PlayerBoxScore[] | null): GameLeaders {
    const all = [...(homeBox ?? []), ...(awayBox ?? [])];
    const topBy = (fn: (p: PlayerBoxScore) => number) =>
        all.reduce<PlayerBoxScore | null>((best, p) => (!best || fn(p) > fn(best) ? p : best), null);
    const ptsP = topBy(p => p.pts);
    const rebP = topBy(p => p.reb);
    const astP = topBy(p => p.ast);
    return {
        pts: ptsP ? { name: ptsP.playerName, value: ptsP.pts, position: ptsP.position } : undefined,
        reb: rebP ? { name: rebP.playerName, value: rebP.reb, position: rebP.position } : undefined,
        ast: astP ? { name: astP.playerName, value: astP.ast, position: astP.position } : undefined,
    };
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
// [2026-08-04] 날짜 관련 헬퍼(fmtDayLabel/kstDateKey/fmtDateShort/fmtTime/groupByDay)는
// MultiGamePbpView.tsx의 날짜 셀렉터 스트립에서도 재사용하기 위해 ./multiScheduleUtils.ts로 이동.

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

// ── 서브 컴포넌트 ──────────────────────────────────────────────────────────────

interface TeamCellProps {
    name: string;
    abbr: string;
    colorPrimary: string;
    colorText?: string | null;
    isMyTeam: boolean;
    showLive?: boolean;
}

const TeamCell: React.FC<TeamCellProps> = ({ name, abbr, colorPrimary, colorText, isMyTeam, showLive }) => (
    <div className="flex items-center gap-1.5 min-w-0">
        <div
            className="w-9 h-5 rounded text-[10px] font-black flex items-center justify-center shrink-0"
            style={{ backgroundColor: colorPrimary, color: colorText ?? getReadableTextColor(colorPrimary) }}
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
    preferVirtual: boolean;
}

const GameRow: React.FC<GameRowProps> = ({ g, state, teamMap, myTeamId, liveSummaries, gameLeadersMap, roundLabelMap, onView, serverNow, zebra, preferVirtual }) => {
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
                {fmtDateShort(g, preferVirtual)}
            </span>

            {/* 시간 (KST) */}
            <span className="w-12 text-center font-mono text-xs font-medium text-slate-300">
                {fmtTime(g, preferVirtual)}
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
                        colorText={away.color_text}
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
                        colorText={home.color_text}
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

            {/* 보기/리뷰 버튼 — 행 높이가 라이브/비라이브에 따라 달라지지 않도록 h-5로 고정.
                [Fix 2026-08-04] 시작 전 경기도 미리 중계방에 입장 가능(정시가 되면 화면이 자동으로
                라이브로 전환됨) — 라이브 버튼과 동일한 모양, 색상만 슬레이트로 구분. */}
            <div className="w-16 h-5 flex items-center justify-center">
                {state === 'live' ? (
                    <button
                        onClick={() => onView(g.id)}
                        className="flex items-center justify-center gap-1 h-5 px-2 bg-red-600 hover:bg-red-500 text-white rounded-md text-[10px] font-bold leading-none transition-all active:scale-95 ko-normal"
                    >
                        <Tv size={10} />
                        보기
                    </button>
                ) : state === 'scheduled' ? (
                    <button
                        onClick={() => onView(g.id)}
                        className="flex items-center justify-center gap-1 h-5 px-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-[10px] font-bold leading-none transition-all active:scale-95 ko-normal"
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

// ── 카드 뷰 ───────────────────────────────────────────────────────────────────
// [2026-08-07] 리그당 최대 1230경기가 한 리스트로 전부 스크롤되어 보기 힘들다는 피드백 —
// 기존 리스트 뷰는 그대로 두고, 하루치 경기만 카드로 보여주는 뷰를 토글 옵션으로 추가.

interface GameCardProps {
    g: Game;
    state: GameDisplayState;
    teamMap: Record<string, any>;
    myTeamId: string | null;
    liveSummaries: Record<string, LiveGameSummary>;
    gameLeadersMap: Record<string, GameLeaders>;
    onView: (gameId: string) => void;
    preferVirtual: boolean;
}

const GameCard: React.FC<GameCardProps> = ({ g, state, teamMap, myTeamId, liveSummaries, gameLeadersMap, onView, preferVirtual }) => {
    const home = teamMap[g.homeTeamId];
    const away = teamMap[g.awayTeamId];
    const isMyGame = g.homeTeamId === myTeamId || g.awayTeamId === myTeamId;
    const live = liveSummaries[g.id];
    const leaders = gameLeadersMap[g.id];

    const awayScore = state === 'final' ? g.awayScore : state === 'live' ? live?.awayScore : null;
    const homeScore = state === 'final' ? g.homeScore : state === 'live' ? live?.homeScore : null;
    // 리스트 뷰(GameRow)와 동일한 규칙 — 진행중 경기는 이기고 있는 팀을 흰색/굵게 표시.
    const liveHomeWon = state === 'live' && homeScore != null && awayScore != null ? homeScore > awayScore : null;

    return (
        <div className={`flex flex-col rounded-lg border overflow-hidden ${
            isMyGame ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'
        }`}>
            {/* 상단: 상태 배지 + 보기 버튼 */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/70">
                <span className="flex items-center gap-1.5 text-xs font-bold ko-normal">
                    {state === 'live' ? (
                        <>
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-red-400">Q{live?.quarter ?? 1} {live?.clock ?? ''}</span>
                        </>
                    ) : state === 'final' ? (
                        <span className="text-slate-400">Final</span>
                    ) : (
                        <span className="text-slate-400 font-mono">{fmtTime(g, preferVirtual)}</span>
                    )}
                </span>
                <button
                    onClick={() => onView(g.id)}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors ko-normal"
                >
                    <Tv size={11} />
                    보기
                </button>
            </div>

            {/* 팀 행 */}
            <div className="flex flex-col gap-2 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                    <TeamCell
                        name={away?.team_name ?? g.awayTeamId}
                        abbr={away?.team_abbr ?? g.awayTeamId}
                        colorPrimary={away?.color_primary ?? '#334155'}
                        colorText={away?.color_text}
                        isMyTeam={g.awayTeamId === myTeamId}
                    />
                    <span className={`font-mono text-sm tabular-nums shrink-0 ${
                        liveHomeWon === null ? 'font-semibold text-slate-200' : liveHomeWon ? 'font-bold text-yellow-400' : 'font-bold text-white'
                    }`}>
                        {awayScore ?? ''}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <TeamCell
                        name={home?.team_name ?? g.homeTeamId}
                        abbr={home?.team_abbr ?? g.homeTeamId}
                        colorPrimary={home?.color_primary ?? '#334155'}
                        colorText={home?.color_text}
                        isMyTeam={g.homeTeamId === myTeamId}
                    />
                    <span className={`font-mono text-sm tabular-nums shrink-0 ${
                        liveHomeWon === null ? 'font-semibold text-slate-200' : liveHomeWon ? 'font-bold text-white' : 'font-bold text-yellow-400'
                    }`}>
                        {homeScore ?? ''}
                    </span>
                </div>
            </div>

            {/* 리더 (종료된 경기만) */}
            {state === 'final' && leaders && (
                <div className="flex flex-col gap-1.5 px-3 py-2.5 border-t border-slate-800/70 bg-black/10">
                    {(['pts', 'reb', 'ast'] as const).map(stat => {
                        const l = leaders[stat];
                        if (!l) return null;
                        return (
                            <div key={stat} className="flex items-center justify-between gap-2 text-[11px]">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="w-7 shrink-0 font-bold text-slate-500 ko-normal">{stat.toUpperCase()}</span>
                                    <span className="truncate text-slate-300 ko-normal">{l.name}</span>
                                    {l.position && <span className="shrink-0 text-slate-500 ko-normal">{l.position}</span>}
                                </div>
                                <span className="shrink-0 font-mono font-semibold text-slate-200">{l.value}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

interface DateControlBarProps {
    activeDate: string;
    todayKey: string | null;
    onChange: (dateKey: string) => void;
}

const DateControlBar: React.FC<DateControlBarProps> = ({ activeDate, todayKey, onChange }) => {
    const navBtn = "px-2.5 py-1.5 rounded-md text-xs font-bold text-slate-300 hover:bg-slate-800 transition-colors ko-normal";
    const arrowBtn = "p-1.5 rounded-md text-slate-300 hover:bg-slate-800 transition-colors";
    return (
        <div className="flex items-center gap-1 mb-4 flex-wrap">
            <button className={navBtn} onClick={() => onChange(addMonthsToKey(activeDate, -1))}>저번달</button>
            <button className={navBtn} onClick={() => onChange(addDaysToKey(activeDate, -7))}>저번주</button>
            <button className={arrowBtn} onClick={() => onChange(addDaysToKey(activeDate, -1))}>
                <ChevronLeft size={16} />
            </button>
            <label className="relative flex items-center px-3 py-1.5 rounded-md bg-slate-800 text-sm font-bold text-white cursor-pointer ko-normal whitespace-nowrap">
                {fmtFullDate(activeDate)}
                <input
                    type="date"
                    value={activeDate}
                    onChange={e => e.target.value && onChange(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
            </label>
            <button className={arrowBtn} onClick={() => onChange(addDaysToKey(activeDate, 1))}>
                <ChevronRight size={16} />
            </button>
            <button className={navBtn} onClick={() => onChange(addDaysToKey(activeDate, 7))}>다음주</button>
            <button className={navBtn} onClick={() => onChange(addMonthsToKey(activeDate, 1))}>다음달</button>
            <div className="flex-1" />
            <button
                className="px-2.5 py-1.5 rounded-md text-xs font-bold text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors ko-normal"
                onClick={() => todayKey && onChange(todayKey)}
                disabled={!todayKey}
            >
                오늘
            </button>
        </div>
    );
};

// ── 메인 뷰 ───────────────────────────────────────────────────────────────────

const MultiScheduleView: React.FC = () => {
    const { leagueId }                                    = useParams<{ leagueId: string }>();
    const navigate                                         = useNavigate();
    const { league, room, leagueTeams, isLoading: leagueLoading } = useLeagueContext();
    const { getGameUrlId } = useGameShortCodes(room?.id);
    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    // 메인리그 정규시즌 경기는 date/time이 가상 NBA 캘린더 값이라 사용자에게 그대로 보여줘야
    // 한다(실제 실행 시각인 scheduledAt은 노출 금지) — 플레이오프(isPlayoff)는 kstDateKey 내부에서
    // 별도로 scheduledAt 우선으로 처리되므로 여기선 리그 타입만 확인하면 된다.
    const preferVirtual = league?.type === 'main_league';
    const { session } = useGame();
    const { isLoading: gameLoading, schedule, myTeamId, currentSimDate } = useSeasonContext();
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

    // 종료된 경기의 득점/리바운드/어시스트 리더 — game_pbp row는 시뮬레이션 완료 시 1회
    // upsert된 뒤 갱신되지 않으므로, localStorage에 캐시된 game_id는 다시 조회하지 않는다
    // (docs/plan/schedule-leaders-cache-plan.md). game_pbp RLS가 리플레이 종료(+10분) 후에만
    // row를 노출하므로, 캐시에 없어 조회하는 행들도 자동으로 "이미 공개 가능한" 경기만 포함된다.
    const [gameLeadersMap, setGameLeadersMap] = useState<Record<string, GameLeaders>>(
        () => room?.id ? loadGameLeadersCache(room.id) : {},
    );
    useEffect(() => {
        if (!room?.id) return;
        let cancelled = false;
        const loadLeaders = async () => {
            const cached = loadGameLeadersCache(room.id);
            const missingIds = schedule.filter(g => g.played && !(g.id in cached)).map(g => g.id);

            if (missingIds.length === 0) {
                setGameLeadersMap(cached);
                return;
            }

            const { data } = await supabase
                .from('game_pbp')
                .select('game_id, home_box, away_box')
                .eq('room_id', room.id)
                .in('game_id', missingIds);
            if (cancelled || !data) return;
            const updates: Record<string, GameLeaders> = {};
            for (const row of data as { game_id: string; home_box: PlayerBoxScore[] | null; away_box: PlayerBoxScore[] | null }[]) {
                updates[row.game_id] = computeGameLeaders(row.home_box, row.away_box);
            }
            setGameLeadersMap(mergeGameLeadersCache(room.id, updates));
        };
        loadLeaders();
        const timer = setInterval(loadLeaders, LIVE_POLL_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, [room?.id, schedule]);

    const isLoading = leagueLoading || gameLoading;

    const teamMap = useMemo(() => {
        const m: Record<string, typeof leagueTeams[number]> = {};
        for (const t of leagueTeams) m[t.team_slug] = t;
        return m;
    }, [leagueTeams]);

    const roundLabelMap = useMemo(() => computeRoundLabelMap(league?.bracket_data), [league?.bracket_data]);

    // 서버는 시리즈 결정 경기를 시뮬레이션한 즉시(리플레이 10분 대기 전) bracket_data.series에
    // 다음 라운드 진출팀을 채워 넣는다. 이 뷰는 raw schedule을 그대로 나열하다 보니 그 다음 라운드
    // 매치업(상대팀 이름 포함)이 실제 시리즈가 아직 안 끝난 것처럼 보이는 시점에도 노출되는
    // 스포일러가 있었다 — TournamentBracketView와 동일한 게이팅으로 아직 "공개"되지 않은
    // (피더 시리즈가 isFinal 게이팅을 통과하지 못한) 라운드의 경기는 목록에서 제외한다.
    const revealedSeriesById = useMemo(() => {
        const series: any[] = (league?.bracket_data as any)?.series ?? [];
        if (!series.length) return null;
        return computeRevealedSeries(series, schedule as any, serverNow);
    }, [league?.bracket_data, schedule, serverNow]);

    const allGames = useMemo(() =>
        [...schedule]
            .filter(g => {
                if (!g.isPlayoff || !g.seriesId || !revealedSeriesById) return true;
                const gated = revealedSeriesById.get(g.seriesId);
                return !!gated && gated.higherSeedId !== 'TBD' && gated.lowerSeedId !== 'TBD';
            })
            .map(g => ({
                ...g,
                scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt,
            }))
            // g.date는 달력 날짜(YYYY-MM-DD)만 갖고 있어 같은 날 여러 경기가 팀/시리즈 생성 순서로
            // 묶여버렸다 — 실제 예정 시각(scheduledAt) 기준으로 정렬해야 시간순이 된다.
            .sort((a, b) => (a.scheduledAt ?? a.date).localeCompare(b.scheduledAt ?? b.date)),
    [schedule, simStart, gprd, revealedSeriesById]);

    // 시간순 정렬(allGames가 이미 scheduledAt 기준 오름차순) — 종료된 경기가 과거 시각이라
    // 자연히 최상단에, 진행중/예정 경기는 시간이 흐른 순서 그대로 아래에 이어진다.
    const groupedByDay = useMemo(() => groupByDay(allGames, preferVirtual), [allGames, preferVirtual]);
    const totalPlayed  = useMemo(() => allGames.filter(g => getGameDisplayState(g, serverNow) === 'final').length, [allGames, serverNow]);

    // "오늘" 배지 판정 기준값 — 메인리그(preferVirtual)는 dateKey가 가상 캘린더 값이라
    // currentSimDate(실제 KST, useSeasonContext에서 옴)와 직접 비교하면 항상 어긋난다.
    // 이때는 findCurrentVirtualDate()로 계산한 가상 "오늘"과 비교해야 한다.
    // serverNow는 1초마다 갱신되므로 15초 버킷으로 낮춰 allGames 재스캔 빈도를 줄인다.
    const dateBucket = Math.floor(serverNow / 15000);
    const todayKey = useMemo(() => {
        if (!preferVirtual) return currentSimDate;
        return findCurrentVirtualDate(allGames, simStart, gprd, dateBucket * 15000);
    }, [preferVirtual, currentSimDate, allGames, simStart, gprd, dateBucket]);

    // [2026-08-01] 경기 URL도 짧은 코드로 대체 — 매핑 없으면(구 리그) 원래 game_id로 폴백.
    const handleView = (gameId: string) => navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(gameId)}`);

    // 리스트/카드 보기 모드 — 리그당 최대 1230경기가 리스트 하나로 전부 스크롤되는 문제 완화용.
    // 선택은 기기에 저장해 다음 방문에도 유지.
    const [viewMode, setViewMode] = useState<'list' | 'card'>(() => {
        try { return (localStorage.getItem('nbagm:scheduleViewMode') as 'list' | 'card') === 'card' ? 'card' : 'list'; }
        catch { return 'list'; }
    });
    useEffect(() => {
        try { localStorage.setItem('nbagm:scheduleViewMode', viewMode); } catch { /* 용량 초과 등 무시 */ }
    }, [viewMode]);

    // 카드 뷰에서 현재 보고 있는 날짜 — 최초 진입 시 "오늘"로 자동 선택(GameDateStrip과 동일 패턴).
    const [selectedCardDate, setSelectedCardDate] = useState<string | null>(null);
    useEffect(() => {
        if (selectedCardDate === null && todayKey) setSelectedCardDate(todayKey);
    }, [selectedCardDate, todayKey]);
    const activeCardDate = selectedCardDate ?? todayKey ?? groupedByDay[0]?.dateKey ?? null;
    const cardDayGames = useMemo(
        () => groupedByDay.find(g => g.dateKey === activeCardDate)?.games ?? [],
        [groupedByDay, activeCardDate],
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="p-6 text-slate-200 pretendard">
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <h1 className="text-xl font-black text-white ko-tight">시즌 일정</h1>
                    <p className="text-sm text-slate-500 ko-normal mt-1">
                        전체 {allGames.length}경기 &nbsp;·&nbsp; 완료 {totalPlayed} &nbsp;·&nbsp; 잔여 {allGames.length - totalPlayed}
                    </p>
                </div>

                {/* 보기 모드 토글 */}
                <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1 shrink-0">
                    <button
                        onClick={() => setViewMode('list')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold ko-normal transition-colors ${
                            viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <LayoutList size={14} />
                        리스트
                    </button>
                    <button
                        onClick={() => setViewMode('card')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold ko-normal transition-colors ${
                            viewMode === 'card' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <LayoutGrid size={14} />
                        카드
                    </button>
                </div>
            </div>

            {viewMode === 'list' ? (
                <div className="flex flex-col gap-6">
                    {groupedByDay.map(({ dateKey, label, games }) => {
                        const isToday = dateKey === todayKey;
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
                                        preferVirtual={preferVirtual}
                                    />
                                ))}
                            </div>
                        );
                    })}
                </div>
            ) : activeCardDate ? (
                <div>
                    <DateControlBar activeDate={activeCardDate} todayKey={todayKey} onChange={setSelectedCardDate} />

                    {cardDayGames.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {cardDayGames.map(g => (
                                <GameCard
                                    key={g.id}
                                    g={g}
                                    state={getGameDisplayState(g, serverNow)}
                                    teamMap={teamMap}
                                    myTeamId={myTeamId}
                                    liveSummaries={liveSummaries}
                                    gameLeadersMap={gameLeadersMap}
                                    onView={handleView}
                                    preferVirtual={preferVirtual}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 ko-normal py-12 text-center">이 날짜엔 예정된 경기가 없습니다.</p>
                    )}
                </div>
            ) : null}
        </div>
    );
};

export default MultiScheduleView;
