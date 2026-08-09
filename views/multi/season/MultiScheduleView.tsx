
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Tv, LayoutList, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { MonthCalendarPopover } from './MonthCalendarPopover';
import {
    kstDateKey, fmtDateShort, fmtTime, fmtMonthDot, groupByDay, findCurrentVirtualDate,
    addDaysToKey, type DayGroup,
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

// 일정 테이블(리스트 뷰) 컬럼 폭 — 전부 고정값(auto 없음)으로 지정해야 컬럼 헤더 행과 각
// 경기 행이 별개의 grid 컨테이너(행마다 독립 인스턴스)라도 컬럼별 폭이 항상 정확히 일치한다.
// 원정/홈은 하나의 "매치업" 컬럼으로 합쳐서 그 안을 flex-1 두 칸으로 나눈다 — 그래야 두 팀
// 색상 블록 사이에 grid gap이 끼어들지 않는다(패딩 제거 요구사항).
const SCHEDULE_GRID_COLS =
    // 매치업 컬럼은 더 이상 1fr로 남는 공간을 전부 가져가지 않는다 — 넓은 화면에서
    // 원정/홈 영역이 지나치게 넓어진다는 피드백으로 480px 상한을 둠. 그렇게 줄어든 만큼의
    // 남는 공간은 PTS/REB/AST 세 컬럼이 1fr로 균등하게 나눠 가진다.
    'grid-cols-[56px_64px_64px_minmax(320px,480px)_minmax(128px,1fr)_minmax(128px,1fr)_minmax(128px,1fr)_72px_80px_72px]';

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

// 값이 없을 때 항상 "-"로 표시(빈 셀 방지) — PTS/REB/AST/쿼터·상태 컬럼 공통.
const EMPTY_CELL = '-';

interface MatchupTeamBlockProps {
    team: any;
    fallbackId: string;
    showLive?: boolean;
}

// 원정/홈 팀을 로고 배지 대신 "셀 배경 = 팀 메인 컬러" 블록으로 표시. 두 블록을 붙여서
// (gap 없이) 렌더링하면 매치업 컬럼 전체가 원정/홈 컬러로 절반씩 나뉜 하나의 띠처럼 보인다.
const MatchupTeamBlock: React.FC<MatchupTeamBlockProps> = ({ team, fallbackId, showLive }) => {
    const colorPrimary = team?.color_primary ?? '#334155';
    const colorText = team?.color_text ?? getReadableTextColor(colorPrimary);
    return (
        <div
            // py-4가 이 블록의 실질 높이(및 grid 행 높이 자동계산의 기준)를 키운다 — h-full은
            // 퍼센트 높이라 행 높이를 정하는 계산에서는 auto로 취급되고 stretch로만 채워지므로,
            // "행을 지금보다 높게" 요구사항은 반드시 실제 padding으로 만들어야 한다.
            className="flex-1 h-full min-w-0 flex items-center gap-2 px-3 py-4"
            style={{ backgroundColor: colorPrimary, color: colorText }}
        >
            <span className="font-bold text-sm shrink-0 ko-normal">{team?.team_abbr ?? fallbackId}</span>
            <span className="font-bold text-sm truncate ko-normal">{team?.team_name ?? fallbackId}</span>
            {showLive && (
                <span className="flex items-center gap-1 shrink-0 animate-pulse ml-auto">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    <span className="font-bold text-xs">LIVE</span>
                </span>
            )}
        </div>
    );
};

const GameRow: React.FC<GameRowProps> = ({ g, state, teamMap, myTeamId, liveSummaries, gameLeadersMap, roundLabelMap, onView, serverNow, zebra, preferVirtual }) => {
    const home = teamMap[g.homeTeamId];
    const away = teamMap[g.awayTeamId];
    const isMyGame = g.homeTeamId === myTeamId || g.awayTeamId === myTeamId;
    const roundLabel = g.isPlayoff && g.seriesId ? roundLabelMap[g.seriesId] : undefined;
    const leaders = gameLeadersMap[g.id];

    // 필 스타일(보기/리뷰 버튼) 공통 — 색상만 상태별로 다르다.
    const pillBtn = "flex items-center justify-center gap-1 h-7 px-2.5 text-white rounded-md text-sm font-bold leading-none transition-all active:scale-95 ko-normal";

    return (
        <div className={`grid ${SCHEDULE_GRID_COLS} gap-x-4 items-stretch px-2 border-b border-slate-800 transition-colors ${
            isMyGame
                ? 'bg-emerald-500/20'
                : `hover:bg-slate-800/40 ${zebra ? 'bg-slate-800/25' : ''}`
        }`}>
            {/* 날짜 */}
            <div className="h-full flex items-center justify-center">
                <span className="text-center text-sm font-medium text-slate-300 ko-normal">
                    {fmtDateShort(g, preferVirtual)}
                </span>
            </div>

            {/* 시간 (KST) */}
            <div className="h-full flex items-center justify-center">
                <span className="text-center text-sm font-medium text-slate-300 ko-normal">
                    {fmtTime(g, preferVirtual)}
                </span>
            </div>

            {/* 토너먼트 라운드 */}
            <div className="h-full flex items-center justify-center">
                <span className="text-sm font-medium text-slate-300 ko-normal truncate text-center">
                    {roundLabel ?? EMPTY_CELL}
                </span>
            </div>

            {/* 매치업(원정+홈) — 로고 없이 팀 컬러 배경 블록 2개를 패딩 없이 붙여서 표시 */}
            <div className="flex h-full">
                <MatchupTeamBlock team={away} fallbackId={g.awayTeamId} />
                <MatchupTeamBlock team={home} fallbackId={g.homeTeamId} showLive={state === 'live'} />
            </div>

            {/* PTS 리더 — 경기 종료 후에만 표시 */}
            <div className="h-full flex items-center">
                <span className="truncate text-sm font-medium text-slate-300 ko-normal">
                    {state === 'final' && leaders?.pts ? `${leaders.pts.name} (${leaders.pts.value})` : EMPTY_CELL}
                </span>
            </div>

            {/* REB 리더 */}
            <div className="h-full flex items-center">
                <span className="truncate text-sm font-medium text-slate-300 ko-normal">
                    {state === 'final' && leaders?.reb ? `${leaders.reb.name} (${leaders.reb.value})` : EMPTY_CELL}
                </span>
            </div>

            {/* AST 리더 */}
            <div className="h-full flex items-center">
                <span className="truncate text-sm font-medium text-slate-300 ko-normal">
                    {state === 'final' && leaders?.ast ? `${leaders.ast.name} (${leaders.ast.value})` : EMPTY_CELL}
                </span>
            </div>

            {/* 스코어 (원정-홈 순) */}
            <div className="h-full flex items-center justify-center gap-1 tabular-nums text-sm ko-normal">
                {state === 'final' && g.homeScore != null && g.awayScore != null ? (
                    <>
                        <span className="text-slate-300 font-semibold">{g.awayScore}</span>
                        <span className="text-slate-400">-</span>
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
                            <span className="text-slate-400">-</span>
                            <span className={liveHomeWon ? 'text-yellow-400 font-bold' : 'text-white font-bold'}>{live.homeScore}</span>
                        </>
                    );
                })() : (
                    <span className="text-slate-300">{EMPTY_CELL}</span>
                )}
            </div>

            {/* 쿼터/게임클락 (LIVE) / 종료 표시 (완료) */}
            <div className="h-full flex items-center justify-center">
                <span className={`text-center text-sm ko-normal ${state === 'live' ? 'text-white font-bold' : 'font-medium text-slate-300'}`}>
                    {state === 'live' && liveSummaries[g.id]
                        ? `Q${liveSummaries[g.id].quarter ?? 1} ${liveSummaries[g.id].clock ?? ''}`
                        : state === 'final'
                        ? '종료'
                        : EMPTY_CELL}
                </span>
            </div>

            {/* 보기/리뷰 버튼 — 셋 다 동일한 필 스타일, 색상만 상태별로 구분.
                [Fix 2026-08-04] 시작 전 경기도 미리 중계방에 입장 가능(정시가 되면 화면이 자동으로
                라이브로 전환됨) — 라이브 버튼과 동일한 모양, 색상만 슬레이트로 구분. */}
            <div className="h-full flex items-center justify-center">
                {state === 'live' ? (
                    <button onClick={() => onView(g.id)} className={`${pillBtn} bg-red-600 hover:bg-red-500`}>
                        <Tv size={12} />
                        보기
                    </button>
                ) : state === 'scheduled' ? (
                    <button onClick={() => onView(g.id)} className={`${pillBtn} bg-slate-700 hover:bg-slate-600`}>
                        <Tv size={12} />
                        보기
                    </button>
                ) : (
                    <button onClick={() => onView(g.id)} className={`${pillBtn} bg-indigo-600 hover:bg-indigo-500`}>
                        리뷰
                    </button>
                )}
            </div>
        </div>
    );
};

const COLUMN_HEADER = (
    <div className={`grid ${SCHEDULE_GRID_COLS} gap-x-4 px-2 py-2 bg-slate-800/60 border-b border-slate-700`}>
        <span className="text-sm font-medium text-slate-300 ko-normal text-center">날짜</span>
        <span className="text-sm font-medium text-slate-300 ko-normal text-center">시간</span>
        <span className="text-sm font-medium text-slate-300 ko-normal text-center">라운드</span>
        <div className="flex">
            <span className="flex-1 text-sm font-medium text-slate-300 ko-normal text-center">원정</span>
            <span className="flex-1 text-sm font-medium text-slate-300 ko-normal text-center">홈</span>
        </div>
        <span className="text-sm font-medium text-slate-300 ko-normal">PTS</span>
        <span className="text-sm font-medium text-slate-300 ko-normal">REB</span>
        <span className="text-sm font-medium text-slate-300 ko-normal">AST</span>
        <span className="text-sm font-medium text-slate-300 ko-normal text-center">스코어</span>
        <span className="text-sm font-medium text-slate-300 ko-normal text-center">쿼터/시간</span>
        <span className="text-sm font-medium text-slate-300 ko-normal text-center">보기</span>
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

    const awayColorPrimary = away?.color_primary ?? '#334155';
    const awayColorText = away?.color_text ?? getReadableTextColor(awayColorPrimary);
    const homeColorPrimary = home?.color_primary ?? '#334155';
    const homeColorText = home?.color_text ?? getReadableTextColor(homeColorPrimary);

    return (
        <div className={`flex flex-col rounded-lg border overflow-hidden ${
            isMyGame ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-800'
        }`}>
            {/* 상단: 상태 배지 + 보기 버튼 */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/70">
                <span className="flex items-center gap-1.5 text-sm font-bold ko-normal">
                    {state === 'live' ? (
                        <>
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-red-400">Q{live?.quarter ?? 1} {live?.clock ?? ''}</span>
                        </>
                    ) : state === 'final' ? (
                        <span className="text-slate-400">Final</span>
                    ) : (
                        <span className="text-slate-400 ko-normal">{fmtTime(g, preferVirtual)}</span>
                    )}
                </span>
                <button
                    onClick={() => onView(g.id)}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors ko-normal"
                >
                    <Tv size={13} />
                    보기
                </button>
            </div>

            {/* 팀 행 — 로고 배지 대신 리스트와 동일하게 팀 컬러를 행 배경 전체에 칠함.
                점수 영역만 별도 중립 배경 박스로 분리해 팀 테마 색이 들어가지 않게 한다. */}
            <div className="flex flex-col">
                <div className="flex items-stretch">
                    <div
                        className="flex-1 flex items-center gap-2 px-3 py-2.5 min-w-0"
                        style={{ backgroundColor: awayColorPrimary, color: awayColorText }}
                    >
                        <span className="font-bold text-sm shrink-0 ko-normal">{away?.team_abbr ?? g.awayTeamId}</span>
                        <span className="font-bold text-sm truncate ko-normal">{away?.team_name ?? g.awayTeamId}</span>
                    </div>
                    <div className="flex items-center justify-center px-3 bg-slate-900/70 shrink-0">
                        <span className="font-bold text-sm tabular-nums text-slate-100 ko-normal">{awayScore ?? '-'}</span>
                    </div>
                </div>
                <div className="flex items-stretch">
                    <div
                        className="flex-1 flex items-center gap-2 px-3 py-2.5 min-w-0"
                        style={{ backgroundColor: homeColorPrimary, color: homeColorText }}
                    >
                        <span className="font-bold text-sm shrink-0 ko-normal">{home?.team_abbr ?? g.homeTeamId}</span>
                        <span className="font-bold text-sm truncate ko-normal">{home?.team_name ?? g.homeTeamId}</span>
                    </div>
                    <div className="flex items-center justify-center px-3 bg-slate-900/70 shrink-0">
                        <span className="font-bold text-sm tabular-nums text-slate-100 ko-normal">{homeScore ?? '-'}</span>
                    </div>
                </div>
            </div>

            {/* 리더 (종료된 경기만) */}
            {state === 'final' && leaders && (
                <div className="flex flex-col gap-1.5 px-3 py-2.5 border-t border-slate-800/70 bg-black/10">
                    {(['pts', 'reb', 'ast'] as const).map(stat => {
                        const l = leaders[stat];
                        if (!l) return null;
                        return (
                            <div key={stat} className="flex items-center justify-between gap-2 text-sm">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="w-7 shrink-0 font-bold text-slate-500 ko-normal">{stat.toUpperCase()}</span>
                                    <span className="truncate text-slate-300 ko-normal">{l.name}</span>
                                    {l.position && <span className="shrink-0 text-slate-500 ko-normal">{l.position}</span>}
                                </div>
                                <span className="shrink-0 font-semibold text-slate-200 ko-normal">{l.value}</span>
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
    onChange: (dateKey: string) => void;
    // 경기가 있는 날짜만 데이트피커에서 선택 가능하게 — GameDateStrip(라이브게임뷰 상단
    // 날짜 셀렉터)과 동일한 제약. 이 Set은 groupedByDay에서 뽑은 dateKey 전체다.
    selectableDates: Set<string>;
}

const CAROUSEL_OFFSETS = [-3, -2, -1, 0, 1, 2, 3];
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

// [2026-08-07] 연도 드롭다운 행 제거(사용자 요청) — 날짜 캐러셀 한 줄만 남김. 가운데(선택된
// 날짜) 칸을 클릭하면 MonthCalendarPopover가 뜬다(GameDateStrip과 동일 컴포넌트 재사용).
const DateControlBar: React.FC<DateControlBarProps> = ({ activeDate, onChange, selectableDates }) => {
    const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
    const dateMenuRef = useRef<HTMLDivElement>(null);
    const [viewYM, setViewYM] = useState<[number, number] | null>(null);

    // 드롭다운을 열 때마다 현재 선택된 날짜의 달로 초기화(GameDateStrip과 동일 패턴).
    useEffect(() => {
        if (!isDateMenuOpen) return;
        const [y, m] = activeDate.split('-').map(Number);
        setViewYM([y, m - 1]);
    }, [isDateMenuOpen, activeDate]);

    useEffect(() => {
        if (!isDateMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (!dateMenuRef.current?.contains(e.target as Node)) setIsDateMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isDateMenuOpen]);

    // 셀 크기(w-16 h-16)를 flex 정렬 기준으로 삼아 내부 콘텐츠(요일+날짜)가 수직/수평
    // 모두 중앙 정렬되도록 한다 — 이전엔 padding으로만 잡아서 정확히 중앙이 아니었다.
    const cellBase = "flex flex-col items-center justify-center w-16 h-16 rounded-md transition-colors shrink-0";

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={() => onChange(addDaysToKey(activeDate, -1))}
                className="p-1.5 rounded-md text-indigo-400 hover:bg-indigo-500/20 hover:text-white transition-colors shrink-0"
            >
                <ChevronLeft size={16} />
            </button>

            {CAROUSEL_OFFSETS.map(offset => {
                const dk = addDaysToKey(activeDate, offset);
                const isActive = offset === 0;
                const weekday = WEEKDAYS_KO[new Date(dk + 'T00:00:00').getDay()];
                const cellContent = (
                    <div className="flex flex-col items-center justify-center gap-1 leading-none">
                        <span className={`text-xs font-medium ${isActive ? 'text-indigo-200' : 'text-slate-500'}`}>
                            {weekday}
                        </span>
                        <span className={`font-bold text-base tabular-nums ko-normal ${isActive ? 'text-white' : 'text-slate-300'}`}>
                            {fmtMonthDot(dk)}
                        </span>
                    </div>
                );

                if (!isActive) {
                    return (
                        <button
                            key={offset}
                            onClick={() => onChange(dk)}
                            className={`${cellBase} hover:bg-slate-700/60`}
                        >
                            {cellContent}
                        </button>
                    );
                }

                return (
                    <div key={offset} ref={dateMenuRef} className="relative shrink-0">
                        <button
                            onClick={e => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setMenuPos({ x: rect.left, y: rect.bottom });
                                setIsDateMenuOpen(o => !o);
                            }}
                            className={`${cellBase} ${isDateMenuOpen ? 'bg-indigo-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                        >
                            {cellContent}
                        </button>
                        {isDateMenuOpen && viewYM && menuPos && (
                            <MonthCalendarPopover
                                position={menuPos}
                                viewYM={viewYM}
                                onViewYMChange={setViewYM}
                                selectableDates={selectableDates}
                                activeDateKey={activeDate}
                                onSelect={selected => { onChange(selected); setIsDateMenuOpen(false); }}
                            />
                        )}
                    </div>
                );
            })}

            <button
                onClick={() => onChange(addDaysToKey(activeDate, 1))}
                className="p-1.5 rounded-md text-indigo-400 hover:bg-indigo-500/20 hover:text-white transition-colors shrink-0"
            >
                <ChevronRight size={16} />
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
    // 데이트피커에서 경기가 있는 날짜만 선택 가능하도록(GameDateStrip과 동일 제약).
    const scheduleDateSet = useMemo(() => new Set(groupedByDay.map(g => g.dateKey)), [groupedByDay]);

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

    // 현재 보고 있는 날짜 — 리스트/카드 모드 공통으로 공유(둘 다 하루치만 보여줌).
    // 최초 진입 시 "오늘"로 자동 선택(GameDateStrip과 동일 패턴).
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    useEffect(() => {
        if (selectedDate === null && todayKey) setSelectedDate(todayKey);
    }, [selectedDate, todayKey]);
    const activeDate = selectedDate ?? todayKey ?? groupedByDay[0]?.dateKey ?? null;
    const activeDayGroup = useMemo(
        () => groupedByDay.find(g => g.dateKey === activeDate) ?? null,
        [groupedByDay, activeDate],
    );
    const activeDayGames = activeDayGroup?.games ?? [];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="text-slate-200 pretendard">
            {/* 통합 헤더 — 타이틀, 날짜 컨트롤, 리스트·카드 토글을 한 줄에 배치.
                컨테이너(카드 박스)를 쓰지 않고 페이지 가장자리까지 꽉 차는 색상 띠 하나로만
                구분한다 — 배경(slate-950)과 구분되도록 slate-900 + 하단 보더만 사용.
                [2026-08-07] 3영역 폭을 2:6:2 그리드로 고정 — flex justify-between은 양쪽
                아이템 크기에 따라 가운데 그룹이 미묘하게 안 맞을 수 있어, 날짜 컨트롤이
                항상 정확히 화면 중앙(전체 폭의 60%)에 오도록 grid-cols로 고정폭 배분. */}
            <div className="grid grid-cols-[2fr_6fr_2fr] items-center gap-4 px-4 py-3 bg-slate-900 border-b border-slate-800">
                <h1 className="text-lg font-black text-white ko-tight truncate">시즌 일정</h1>

                <div className="flex justify-center min-w-0">
                    {activeDate && <DateControlBar activeDate={activeDate} onChange={setSelectedDate} selectableDates={scheduleDateSet} />}
                </div>

                <div className="flex items-center justify-end gap-1 bg-slate-800 rounded-md p-1 shrink-0 justify-self-end">
                    <button
                        onClick={() => setViewMode('list')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold ko-normal transition-colors ${
                            viewMode === 'list' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <LayoutList size={15} />
                        리스트
                    </button>
                    <button
                        onClick={() => setViewMode('card')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold ko-normal transition-colors ${
                            viewMode === 'card' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <LayoutGrid size={15} />
                        카드
                    </button>
                </div>
            </div>

            {/* 본문 — 컨테이너 없이 페이지 가장자리에 바로 붙는다 */}
            {activeDate && (
                activeDayGames.length === 0 ? (
                    <p className="text-sm text-slate-500 ko-normal py-12 text-center">이 날짜엔 예정된 경기가 없습니다.</p>
                ) : viewMode === 'list' ? (
                    <div className="border border-slate-800 overflow-x-auto">
                        {COLUMN_HEADER}
                        {activeDayGames.map((g, i) => (
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
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                        {activeDayGames.map(g => (
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
                )
            )}
        </div>
    );
};

export default MultiScheduleView;
