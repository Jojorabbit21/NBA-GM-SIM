
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Tv, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { useGame } from '../../../hooks/useGameContext';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { useServerClock } from '../../../utils/serverClock';
import { getGameDisplayState, resolveRealAt, computeRevealedSeries, type GameDisplayState } from './multiGameReveal';
import { fetchLiveGamesSummary, type LiveGameSummary } from '../../../services/multi/liveGameService';
import { supabase } from '../../../services/supabaseClient';
import { loadGameLeadersCache, mergeGameLeadersCache, computeGameLeaders, type GameLeaders, type QuarterScores } from '../../../services/multi/gameLeadersCache';
import type { Game } from '../../../types';
import type { PlayerBoxScore } from '../../../types/engine';
import { MonthCalendarPopover } from './MonthCalendarPopover';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../../components/common/Table';
import { PlayerHoverCard, buildPlayerCardMap, type PlayerCardMap } from '../../../components/common/PlayerHoverCard';
import {
    kstDateKey, fmtDateShort, fmtTime, fmtMonthDot, groupByDay, findCurrentVirtualDate,
    addDaysToKey, type DayGroup,
} from './multiScheduleUtils';

const LIVE_POLL_MS = 5000;

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

// 일정 테이블(리스트 뷰) — TeamScheduleCalendar.tsx 좌측 리스트와 동일하게 공용 Table
// 컴포넌트(components/common/Table.tsx)로 렌더링한다. 컬럼 구성 자체(날짜/시간/[라운드]/
// 원정/홈/최우수선수/스코어/쿼터-시간/보기)는 기존 그대로 유지 — 시각 스타일(얇은 보더,
// 균일한 행 배경, 헤더 색/굵기)만 TeamScheduleCalendar와 통일한다.
// [2026-08-28] 라운드 컬럼은 정규시즌 경기만 있는 날엔 전부 "-"만 찍혀 어색하다는 지적 —
// 현재 보고 있는 날짜에 플레이오프 경기가 하나라도 있을 때만 컬럼 자체를 노출한다.
const getScheduleTableCols = (showRound: boolean): (number | undefined)[] =>
    showRound ? [64, 64, 64, 180, 180, undefined, 90, 90, 80] : [64, 64, 180, 180, undefined, 90, 90, 80];

interface GameRowProps {
    g: Game;
    state: GameDisplayState;
    teamMap: Record<string, any>;
    myTeamId: string | null;
    liveSummaries: Record<string, LiveGameSummary>;
    gameLeadersMap: Record<string, GameLeaders>;
    roundLabelMap: Record<string, string>;
    onView: (gameId: string) => void;
    onPlayerClick: (playerId: string) => void;
    playerCardMap: PlayerCardMap;
    serverNow: number;
    preferVirtual: boolean;
    showRound: boolean;
}

// 값이 없을 때 항상 "-"로 표시(빈 셀 방지) — 최우수선수/쿼터·상태 컬럼 공통.
const EMPTY_CELL = '-';

const GameRow: React.FC<GameRowProps> = ({ g, state, teamMap, myTeamId, liveSummaries, gameLeadersMap, roundLabelMap, onView, onPlayerClick, playerCardMap, serverNow, preferVirtual, showRound }) => {
    const home = teamMap[g.homeTeamId];
    const away = teamMap[g.awayTeamId];
    const isMyGame = g.homeTeamId === myTeamId || g.awayTeamId === myTeamId;
    const roundLabel = g.isPlayoff && g.seriesId ? roundLabelMap[g.seriesId] : undefined;
    const leaders = gameLeadersMap[g.id];

    // 필 스타일(보기/리뷰 버튼) 공통 — 색상만 상태별로 다르다. w-full로 셀의 패딩 안쪽
    // 가로 영역을 꽉 채운다. 세로는 h-full이 아니라 h-6 고정값을 쓴다 — <td> 안에서는
    // height:100%(h-full)가 부모(테이블 셀)의 명시적 높이가 없다는 이유로 무시되는 경우가
    // 많아(퍼센트 높이 특유의 한계) 실제로 채워지지 않는 버그가 있었다. 행 높이(TableRow
    // h-10=40px)에서 셀 기본 패딩(py-2=상하 8px×2=16px)을 뺀 값(24px=h-6)으로 고정.
    const pillBtn = "flex items-center justify-center gap-1 w-full h-6 text-white rounded-md text-sm font-bold leading-none transition-all active:scale-95 ko-normal";
    const cellBorder = "border-r border-slate-800/30";

    // [2026-08-29] 최우수선수(팀당 1명씩)를 한 줄로 표시하도록 바꾸면서 모든 컬럼이 다시
    // 1줄뿐이라 h-10으로 충분 — 예전에 2줄 표시 때문에 h-14로 키웠던 걸 원복.
    return (
        <TableRow className={`h-10 ${isMyGame ? 'bg-emerald-500/20' : ''}`}>
            {/* 날짜 */}
            <TableCell className={`${cellBorder} text-center align-middle text-sm`}>
                <span className="font-medium text-slate-400 tabular-nums ko-normal">{fmtDateShort(g, preferVirtual)}</span>
            </TableCell>

            {/* 시간 (KST) */}
            <TableCell className={`${cellBorder} text-center align-middle text-sm`}>
                <span className="font-medium text-slate-400 tabular-nums ko-normal">{fmtTime(g, preferVirtual)}</span>
            </TableCell>

            {/* 토너먼트 라운드 — 플레이오프 경기가 있는 날짜에서만 렌더링(showRound) */}
            {showRound && (
                <TableCell className={`${cellBorder} text-center align-middle text-sm`}>
                    <span className="font-medium text-slate-400 truncate ko-normal">{roundLabel ?? EMPTY_CELL}</span>
                </TableCell>
            )}

            {/* 원정 */}
            <TableCell align="left" className={`${cellBorder} pl-4 align-middle text-sm`}>
                <span className="font-semibold text-slate-200 truncate ko-normal">{away?.team_name ?? g.awayTeamId}</span>
            </TableCell>

            {/* 홈 */}
            <TableCell align="left" className={`${cellBorder} pl-4 align-middle text-sm`}>
                <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-slate-200 truncate ko-normal">{home?.team_name ?? g.homeTeamId}</span>
                    {state === 'live' && (
                        <span className="flex items-center gap-1 shrink-0 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            <span className="font-bold text-xs text-red-400">LIVE</span>
                        </span>
                    )}
                </div>
            </TableCell>

            {/* 최우수선수 — 팀당 1명씩(computeGameLeaders().mvpAway/mvpHome: 각 팀 박스스코어
                기준 PIE 최댓값 선수 + 두드러진 대표 스탯 최대 5개), 이름 우측에 팀 약어 표기.
                두 선수를 절반씩 나눈 두 블록이 아니라, 하나의 흐르는 문장으로 이어 쓰고
                그 안에서만 "/"로 구분한다 — 문장 전체가 하나의 truncate 대상. */}
            <TableCell align="left" className={`${cellBorder} pl-4 align-middle text-sm`}>
                {state === 'final' && (leaders?.mvpAway || leaders?.mvpHome) ? (
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                        {leaders?.mvpAway && (
                            <>
                                <PlayerHoverCard player={playerCardMap.get(leaders.mvpAway.playerId)?.player} teamAbbr={playerCardMap.get(leaders.mvpAway.playerId)?.teamAbbr}>
                                    <span
                                        className="text-slate-200 shrink-0 ko-normal cursor-pointer hover:text-indigo-400 hover:underline"
                                        onClick={() => onPlayerClick(leaders.mvpAway!.playerId)}
                                    >
                                        {leaders.mvpAway.name} ({away?.team_abbr ?? g.awayTeamId})
                                    </span>
                                </PlayerHoverCard>
                                {leaders.mvpAway.stats.length > 0 && (
                                    <span className="text-white ko-normal shrink-0">
                                        {leaders.mvpAway.stats.map(s => `${s.value} ${s.label}`).join(', ')}
                                    </span>
                                )}
                            </>
                        )}
                        {leaders?.mvpAway && leaders?.mvpHome && <span className="text-slate-600 shrink-0">/</span>}
                        {leaders?.mvpHome && (
                            <>
                                <PlayerHoverCard player={playerCardMap.get(leaders.mvpHome.playerId)?.player} teamAbbr={playerCardMap.get(leaders.mvpHome.playerId)?.teamAbbr}>
                                    <span
                                        className="text-slate-200 shrink-0 ko-normal cursor-pointer hover:text-indigo-400 hover:underline"
                                        onClick={() => onPlayerClick(leaders.mvpHome!.playerId)}
                                    >
                                        {leaders.mvpHome.name} ({home?.team_abbr ?? g.homeTeamId})
                                    </span>
                                </PlayerHoverCard>
                                {leaders.mvpHome.stats.length > 0 && (
                                    <span className="text-white ko-normal shrink-0">
                                        {leaders.mvpHome.stats.map(s => `${s.value} ${s.label}`).join(', ')}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <span className="text-slate-600">{EMPTY_CELL}</span>
                )}
            </TableCell>

            {/* 스코어 (원정-홈 순) */}
            <TableCell className={`${cellBorder} text-center align-middle text-sm`}>
                {state === 'final' && g.homeScore != null && g.awayScore != null ? (
                    <span className="font-medium tabular-nums text-slate-300">{g.awayScore}-{g.homeScore}</span>
                ) : state === 'live' ? (() => {
                    const live = liveSummaries[g.id];
                    if (!live || live.homeScore == null || live.awayScore == null) {
                        return <span className="font-bold text-red-400 animate-pulse">LIVE</span>;
                    }
                    return <span className="font-bold tabular-nums text-white">{live.awayScore}-{live.homeScore}</span>;
                })() : (
                    <span className="font-medium tabular-nums text-slate-400">{fmtTime(g, preferVirtual)}</span>
                )}
            </TableCell>

            {/* 쿼터/게임클락 (LIVE) / 종료 표시 (완료) */}
            <TableCell className={`${cellBorder} text-center align-middle text-sm`}>
                <span className={`ko-normal ${state === 'live' ? 'text-white font-bold' : 'font-medium text-slate-400'}`}>
                    {state === 'live' && liveSummaries[g.id]
                        ? `Q${liveSummaries[g.id].quarter ?? 1} ${liveSummaries[g.id].clock ?? ''}`
                        : state === 'final'
                        ? '종료'
                        : EMPTY_CELL}
                </span>
            </TableCell>

            {/* 보기/리뷰 버튼 — 셋 다 동일한 필 스타일, 색상만 상태별로 구분. 버튼이 "보기"
                컬럼(의 패딩 안쪽 영역)을 꽉 채우도록 w-full h-full — 셀 자체의 패딩/버튼의
                둥근 모서리는 그대로 유지.
                [Fix 2026-08-04] 시작 전 경기도 미리 중계방에 입장 가능(정시가 되면 화면이 자동으로
                라이브로 전환됨) — 라이브 버튼과 동일한 모양, 색상만 슬레이트로 구분. */}
            <TableCell className="text-center align-middle text-sm">
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
            </TableCell>
        </TableRow>
    );
};

const renderColumnHeader = (showRound: boolean) => (
    <tr className="h-10 text-slate-500 text-sm font-black uppercase">
        <TableHeaderCell className="border-r border-slate-800 bg-slate-950 text-center">날짜</TableHeaderCell>
        <TableHeaderCell className="border-r border-slate-800 bg-slate-950 text-center">시간</TableHeaderCell>
        {showRound && (
            <TableHeaderCell className="border-r border-slate-800 bg-slate-950 text-center">라운드</TableHeaderCell>
        )}
        <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">원정</TableHeaderCell>
        <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">홈</TableHeaderCell>
        <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">최우수선수</TableHeaderCell>
        <TableHeaderCell className="border-r border-slate-800 bg-slate-950 text-center">스코어</TableHeaderCell>
        <TableHeaderCell className="border-r border-slate-800 bg-slate-950 text-center">쿼터/시간</TableHeaderCell>
        <TableHeaderCell className="bg-slate-950 text-center">보기</TableHeaderCell>
    </tr>
);

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
                className="p-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shrink-0"
            >
                <ChevronLeft size={20} />
            </button>

            {CAROUSEL_OFFSETS.map(offset => {
                const dk = addDaysToKey(activeDate, offset);
                const isActive = offset === 0;
                const weekday = WEEKDAYS_KO[new Date(dk + 'T00:00:00').getDay()];
                const cellContent = (
                    <div className="flex flex-col items-center justify-center gap-1 leading-none">
                        <span className={`text-sm font-medium ${isActive ? 'text-indigo-200' : 'text-slate-500'}`}>
                            {weekday}
                        </span>
                        <span className={`font-bold text-base ko-normal ${isActive ? 'text-white' : 'text-slate-300'}`}>
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
                className="p-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shrink-0"
            >
                <ChevronRight size={20} />
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
    const { getPlayerUrlId } = usePlayerShortCodes();
    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    // 메인리그 정규시즌 경기는 date/time이 가상 NBA 캘린더 값이라 사용자에게 그대로 보여줘야
    // 한다(실제 실행 시각인 scheduledAt은 노출 금지) — 플레이오프(isPlayoff)는 kstDateKey 내부에서
    // 별도로 scheduledAt 우선으로 처리되므로 여기선 리그 타입만 확인하면 된다.
    const preferVirtual = league?.type === 'main_league';
    const { session } = useGame();
    const { isLoading: gameLoading, schedule, myTeamId, currentSimDate } = useSeasonContext();
    // useSeasonContext().teams는 멀티플레이어 경로에서 항상 빈 배열로 남는 미사용 필드라
    // (실제로 채워주는 곳은 싱글플레이어 useGameData.ts뿐) 다른 멀티 화면들과 동일하게
    // useMultiSearchData(전체 드래프트풀 Player[] + playerId→team_slug 역인덱스)로 대체.
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);
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
            // [Fix 2026-08-29] mvpAway/mvpHome(팀별 최우수선수) 필드를 추가하기 전 캐시된
            // 항목은 "이미 캐시됨"으로 판정돼 영영 재조회되지 않아 최우수선수 컬럼이 계속
            // 비어 보이는 버그가 있었다 — 그 필드가 없는 낡은 캐시 항목도 다시 조회 대상에
            // 포함시켜 새 형식으로 덮어쓴다.
            const missingIds = schedule
                .filter(g => g.played && (!(g.id in cached) || cached[g.id].mvpAway === undefined))
                .map(g => g.id);

            if (missingIds.length === 0) {
                setGameLeadersMap(cached);
                return;
            }

            const { data } = await supabase
                .from('game_pbp')
                .select('game_id, home_box, away_box, quarter_scores')
                .eq('room_id', room.id)
                .in('game_id', missingIds);
            if (cancelled || !data) return;
            const updates: Record<string, GameLeaders> = {};
            for (const row of data as { game_id: string; home_box: PlayerBoxScore[] | null; away_box: PlayerBoxScore[] | null; quarter_scores: QuarterScores | null }[]) {
                updates[row.game_id] = { ...computeGameLeaders(row.home_box, row.away_box), quarterScores: row.quarter_scores ?? undefined };
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

    // 최우수선수(GameMvp)엔 완전한 Player 객체가 없어(그 경기 박스라인만) hover 카드를 위해
    // playerId → {완전한 Player, 소속팀 약어}를 미리 만들어 둔다. 방출/은퇴 등으로 로스터에
    // 없는 선수는 teamAbbr만 빈 문자열이 되고 능력치 팝업 자체는 그대로 뜬다.
    // (MultiNewsFeedView.tsx도 동일한 buildPlayerCardMap을 공유.)
    const playerCardMap = useMemo(
        () => buildPlayerCardMap(poolPlayers, rosterMap, slug => teamMap[slug]?.team_abbr),
        [poolPlayers, rosterMap, teamMap],
    );

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
            // 메인리그 정규시즌 경기는 화면에 "가상 NBA 캘린더" date/time을 그대로 보여주므로
            // (preferVirtual) 정렬도 그 값 기준이어야 한다. scheduledAt(내부 압축 실행 시각)으로
            // 정렬하면 표시되는 date/time과 실제 정렬 순서가 어긋나 같은 날짜 안에서도 시간 역순으로
            // 뜨는 버그가 있었다 — 플레이오프/토너먼트(isPlayoff)는 date/time이 없거나 scheduledAt에서
            // 파생되므로 그대로 scheduledAt을 기준으로 쓴다.
            .sort((a, b) => {
                const keyA = preferVirtual && !a.isPlayoff ? `${a.date}T${a.time ?? '00:00'}` : (a.scheduledAt ?? a.date);
                const keyB = preferVirtual && !b.isPlayoff ? `${b.date}T${b.time ?? '00:00'}` : (b.scheduledAt ?? b.date);
                return keyA.localeCompare(keyB);
            }),
    [schedule, simStart, gprd, revealedSeriesById, preferVirtual]);

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
    // 최우수선수 이름 클릭 → 선수 프로필(MultiPlayerDetailView) 캐노니컬 라우트로 이동.
    const handlePlayerClick = (playerId: string) => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(playerId)}`);

    // 현재 보고 있는 날짜 — 하루치만 보여준다.
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
    // 리스트 뷰용 — 종료/진행중/예정 순서로 재배치(카드 뷰의 섹션 순서와 동일 규칙).
    // 원래 activeDayGames는 시간순이라 종료된 경기와 예정 경기가 섞여 나왔다는 피드백 —
    // sort는 안정 정렬이라 각 상태 그룹 내부는 여전히 activeDayGames의 시간순 그대로 유지된다.
    const activeDayGamesByState = useMemo(() => {
        const order: Record<GameDisplayState, number> = { final: 0, live: 1, scheduled: 2 };
        return [...activeDayGames].sort((a, b) =>
            order[getGameDisplayState(a, serverNow)] - order[getGameDisplayState(b, serverNow)]);
    }, [activeDayGames, serverNow]);
    // 라운드 컬럼 — 지금 보고 있는 날짜에 플레이오프 경기가 하나도 없으면(정규시즌 날짜는
    // 전부 그렇다) 리스트 뷰에서 컬럼 자체를 숨긴다.
    const showRoundColumn = useMemo(() => activeDayGamesByState.some(g => g.isPlayoff), [activeDayGamesByState]);

    // 헤더 타이틀 옆 달력 아이콘 버튼 — DateControlBar/GameDateStrip과 동일한 데이트피커
    // (MonthCalendarPopover) 패턴 재사용.
    const [isHeaderDateMenuOpen, setIsHeaderDateMenuOpen] = useState(false);
    const [headerMenuPos, setHeaderMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [headerViewYM, setHeaderViewYM] = useState<[number, number] | null>(null);
    const headerDateMenuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (isHeaderDateMenuOpen && activeDate) {
            const [y, m] = activeDate.split('-').map(Number);
            setHeaderViewYM([y, m - 1]);
        }
    }, [isHeaderDateMenuOpen, activeDate]);
    useEffect(() => {
        if (!isHeaderDateMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (!headerDateMenuRef.current?.contains(e.target as Node)) setIsHeaderDateMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isHeaderDateMenuOpen]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="text-slate-200 pretendard">
            {/* 통합 헤더 — 타이틀, 날짜 컨트롤을 한 줄에 배치.
                컨테이너(카드 박스)를 쓰지 않고 페이지 가장자리까지 꽉 차는 색상 띠 하나로만
                구분한다 — 배경(slate-950)과 구분되도록 slate-900 + 하단 보더만 사용.
                [2026-08-07] 3영역 폭을 2:6:2 그리드로 고정 — flex justify-between은 양쪽
                아이템 크기에 따라 가운데 그룹이 미묘하게 안 맞을 수 있어, 날짜 컨트롤이
                항상 정확히 화면 중앙(전체 폭의 60%)에 오도록 grid-cols로 고정폭 배분.
                [2026-08-29] 카드 뷰 폐지(리스트 전용)로 우측 토글은 사라졌지만, 3번째 컬럼은
                가운데 날짜 컨트롤의 중앙 정렬을 유지하기 위해 빈 스페이서로 남겨둔다. */}
            <div className="grid grid-cols-[2fr_6fr_2fr] items-center gap-4 px-4 py-3 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-4 min-w-0">
                    <h1 className="text-lg font-black text-white ko-tight truncate">시즌 일정</h1>

                    <div className="flex items-center gap-1 shrink-0">
                        {/* 달력 아이콘 — 클릭 시 데이트피커(MonthCalendarPopover) 표시 */}
                        <div ref={headerDateMenuRef} className="relative shrink-0">
                            <button
                                onClick={e => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHeaderMenuPos({ x: rect.left, y: rect.bottom });
                                    setIsHeaderDateMenuOpen(o => !o);
                                }}
                                className={`h-8 w-8 flex items-center justify-center rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-colors ${isHeaderDateMenuOpen ? 'bg-indigo-500' : ''}`}
                            >
                                <Calendar size={16} />
                            </button>
                            {isHeaderDateMenuOpen && headerViewYM && headerMenuPos && activeDate && (
                                <MonthCalendarPopover
                                    position={headerMenuPos}
                                    viewYM={headerViewYM}
                                    onViewYMChange={setHeaderViewYM}
                                    selectableDates={scheduleDateSet}
                                    activeDateKey={activeDate}
                                    onSelect={dk => { setSelectedDate(dk); setIsHeaderDateMenuOpen(false); }}
                                />
                            )}
                        </div>

                        {/* 달력 아이콘 우측 — 오늘 날짜로 바로 이동. 스타일을 달력 버튼과 통일. */}
                        <button
                            onClick={() => todayKey && setSelectedDate(todayKey)}
                            disabled={!todayKey}
                            className="h-8 px-3 flex items-center rounded-md text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors ko-normal shrink-0"
                        >
                            오늘로 이동
                        </button>
                    </div>
                </div>

                <div className="flex justify-center min-w-0">
                    {activeDate && <DateControlBar activeDate={activeDate} onChange={setSelectedDate} selectableDates={scheduleDateSet} />}
                </div>

                <div className="shrink-0 justify-self-end" />
            </div>

            {/* 본문 — 컨테이너 없이 페이지 가장자리에 바로 붙는다 */}
            {activeDate && (
                activeDayGames.length === 0 ? (
                    <p className="text-sm text-slate-500 ko-normal py-12 text-center">이 날짜엔 예정된 경기가 없습니다.</p>
                ) : (
                    <Table className="!rounded-none !shadow-none" fullHeight={false} tableStyle={{ tableLayout: 'fixed', minWidth: '100%' }}>
                        <colgroup>
                            {getScheduleTableCols(showRoundColumn).map((w, i) => (
                                <col key={i} style={w !== undefined ? { width: w } : undefined} />
                            ))}
                        </colgroup>
                        <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                            {renderColumnHeader(showRoundColumn)}
                        </TableHead>
                        <TableBody>
                            {activeDayGamesByState.map(g => (
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
                                    onPlayerClick={handlePlayerClick}
                                    playerCardMap={playerCardMap}
                                    serverNow={serverNow}
                                    preferVirtual={preferVirtual}
                                    showRound={showRoundColumn}
                                />
                            ))}
                        </TableBody>
                    </Table>
                )
            )}
        </div>
    );
};

export default MultiScheduleView;
