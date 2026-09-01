
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { kstDateKey, groupByDay, findCurrentVirtualGame } from './multiScheduleUtils';
import { MonthCalendarPopover } from './MonthCalendarPopover';
import type { Game } from '../../../types';
import { getGameDisplayState, resolveRealAt, computeRevealedSeries } from './multiGameReveal';
import { fetchLiveGamesSummary, type LiveGameSummary } from '../../../services/multi/liveGameService';

// [2026-08-28] views/multi/season/MultiGamePbpView.tsx에서 분리 — 원래 그 화면(경기 관람)
// 최상단에만 있던 "오늘 경기 목록" 스트립을 모든 시즌 화면(MultiSeasonLayout, 헤더 바로
// 아래)에 공용으로 배치하기 위해 독립 모듈로 뽑음. MultiGamePbpView는 더 이상 이 컴포넌트를
// 직접 렌더하지 않고(레이아웃이 전역으로 하나만 그림) import만 해서 쓰던 자리를 비웠다.

export interface TeamStripInfo { team_name: string; team_abbr: string; color_primary?: string | null; color_text?: string | null }

const StripTeamRow: React.FC<{ team: TeamStripInfo | undefined; teamId: string; score?: number; won?: boolean }> = ({ team, teamId, score, won }) => (
    <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-black tabular-nums truncate ${won ? 'text-white' : 'text-slate-500'}`}>
            {(team?.team_abbr ?? teamId).slice(0, 3).toUpperCase()}
        </span>
        {score != null && (
            <span className={`text-sm font-mono tabular-nums ${won ? 'text-white font-black' : 'text-slate-500 font-bold'}`}>{score}</span>
        )}
    </div>
);

export interface GameDateStripProps {
    leagueId: string | undefined;
    currentGameId: string | undefined;
    schedule: Game[];
    teamMap: Record<string, TeamStripInfo>;
    simStart: string | null;
    gprd: number;
    bracketData: unknown;
    serverNow: number;
    roomId: string | undefined;
    accessToken: string | undefined;
    getGameUrlId: (gameId: string) => string;
    preferVirtual: boolean;
}

export const GameDateStrip: React.FC<GameDateStripProps> = ({
    leagueId, currentGameId, schedule, teamMap, simStart, gprd, bracketData, serverNow, roomId, accessToken, getGameUrlId, preferVirtual,
}) => {
    const navigate = useNavigate();

    // MultiScheduleView.tsx와 동일한 계산(플레이오프 시리즈 미공개 매치업 스포일러 차단 포함) —
    // scheduledAt 보정 + 시간순 정렬.
    // [Fix 2026-08-05] serverNow(1초 틱)를 그대로 deps에 넣으면 매초 스케줄 전체를 재스캔한다 —
    // "리플레이 공개 여부"는 분 단위로만 바뀌므로 15초 버킷으로 낮춰 재계산 빈도를 줄인다.
    const revealBucket = Math.floor(serverNow / 15000);
    const revealedSeriesById = useMemo(() => {
        const series: any[] = (bracketData as any)?.series ?? [];
        if (!series.length) return null;
        return computeRevealedSeries(series, schedule as any, serverNow);
    }, [bracketData, schedule, revealBucket]); // eslint-disable-line react-hooks/exhaustive-deps

    const allGames = useMemo(() =>
        [...schedule]
            .filter(g => {
                if (!g.isPlayoff || !g.seriesId || !revealedSeriesById) return true;
                const gated = revealedSeriesById.get(g.seriesId);
                return !!gated && gated.higherSeedId !== 'TBD' && gated.lowerSeedId !== 'TBD';
            })
            .map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt }))
            .sort((a, b) => (a.scheduledAt ?? a.date).localeCompare(b.scheduledAt ?? b.date)),
    [schedule, simStart, gprd, revealedSeriesById]);

    const groupedByDay = useMemo(() => groupByDay(allGames, preferVirtual), [allGames, preferVirtual]);

    const currentGame = useMemo(() => allGames.find(g => g.id === currentGameId), [allGames, currentGameId]);
    const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

    // 처음 진입 시 현재 보고 있는 경기의 날짜로 자동 선택. 초기값이 아직 없을 때만 반영해서
    // 사용자가 화살표로 다른 날짜를 골라놓은 뒤 currentGame이 바뀌어도 선택이 안 튀게 한다.
    useEffect(() => {
        if (selectedDateKey === null && currentGame) {
            setSelectedDateKey(kstDateKey(currentGame, preferVirtual));
        }
    }, [selectedDateKey, currentGame, preferVirtual]);

    const dateKeys = useMemo(() => groupedByDay.map(g => g.dateKey), [groupedByDay]);
    // [Fix 2026-08-28] "상단 스트립이 계속 리그 마지막 날로 이동한다" 버그 — 이 컴포넌트가
    // MultiSeasonLayout에 전역 배치된 뒤로는 경기 관람 화면이 아닌 한 currentGameId가 없어(위
    // useEffect가 절대 selectedDateKey를 채우지 못함), 예전 폴백이었던 dateKeys 배열의 마지막
    // 항목(=시즌 스케줄 최종일)이 그대로 초기 표시일로 쓰이고 있었다. "오늘 경기 목록"이라는
    // 이름에 맞게, 아직 아무 날짜도 직접 고르지 않았을 때는 "오늘"(서버 시각 기준 가장 가까운
    // 경기의 날짜 — MultiScheduleView/MultiHeader의 "오늘" 배지 판정과 동일 로직)로 폴백한다.
    const todayDateKey = useMemo(() => {
        const g = findCurrentVirtualGame(allGames, simStart, gprd, serverNow);
        return g ? kstDateKey(g, preferVirtual) : null;
    }, [allGames, simStart, gprd, serverNow, preferVirtual]);
    const activeDateKey = selectedDateKey ?? todayDateKey ?? dateKeys[dateKeys.length - 1] ?? null;
    const activeIdx = activeDateKey ? dateKeys.indexOf(activeDateKey) : -1;
    const activeGroup = activeIdx >= 0 ? groupedByDay[activeIdx] : null;

    // "2026" / "8.3" 2줄 표기용 — activeDateKey(YYYY-MM-DD)에서 직접 뽑음(라벨 문자열 파싱 대신).
    const [activeYear, activeMonth, activeDay] = activeDateKey
        ? activeDateKey.split('-').map(Number)
        : [0, 0, 0];

    // 날짜 드롭다운 — 클릭하면 월간 달력이 펼쳐지고, 경기가 있는 날짜만 선택 가능.
    // [Fix 2026-08-04] 부모 컨테이너 기준 absolute 대신, 클릭한 지점(clientX/clientY)에 고정
    // 위치(position: fixed)로 띄운다 — 어디를 눌러도 그 자리 근처에서 펼쳐진다.
    const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
    const dateMenuRef = useRef<HTMLDivElement>(null);
    // [Fix 2026-08-04] "경기 카드 리스트가 화면 우측 끝을 넘어가도 스크롤할 방법이 없다는 피드백 —
    // 가로 스크롤 컨테이너에 ref를 달고, 맨 우측에 ">" 버튼으로 scrollBy 이동.
    const gameStripRef = useRef<HTMLDivElement>(null);
    // [Fix 2026-08-05] "라이브/기록 화면 진입 시 상단 경기 리스트가 현재 선택한 경기로 포커스되게"
    // 요청 — 날짜는 이미 자동 선택되지만(위 useEffect), 그 날짜의 경기가 많으면 현재 보고 있는
    // 카드가 가로 스크롤 밖에 있을 수 있어 수동으로 찾아 스크롤해야 했다. 현재 카드에 ref를 달아
    // 자동으로 보이는 위치로 스크롤.
    // [Fix 2026-08-05] "스크롤해도 다시 원래 위치로 돌아간다" 버그 — activeGroup을 의존성으로 쓰면
    // revealedSeriesById(플레이오프 시리즈 미공개 판정)가 serverNow(1초 틱)에 의존해 매초 새
    // 객체로 재계산되고, 그게 allGames→groupedByDay→activeGroup까지 매초 새 참조로 전파되어
    // 이 effect가 1초마다 재실행되며 스크롤을 계속 원위치로 되돌리고 있었다. 실제로 다시 스크롤할
    // 필요가 있는 시점(날짜 전환/경기 전환)만 잡도록 원시값(activeDateKey, currentGameId)만 의존.
    const currentCardRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        currentCardRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [activeDateKey, currentGameId]);
    // [Fix 2026-08-04] "무한스크롤처럼 느껴진다"는 피드백 — 스크롤바를 숨겨놔서 끝에 도달했는지
    // 알 방법이 없었음. 스크롤 위치를 추적해 끝에 도달하면 우측 버튼을 비활성화(회색 처리)해서
    // "여기가 끝"임을 명확히 보여준다. [Fix 2026-08-04] 좌측 이동 버튼 추가 요청으로 canScrollLeft도 함께 추적.
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const updateScrollState = () => {
        const el = gameStripRef.current;
        if (!el) return;
        setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
        setCanScrollLeft(el.scrollLeft > 4);
    };
    useEffect(() => {
        updateScrollState();
        const el = gameStripRef.current;
        if (!el) return;
        const ro = new ResizeObserver(updateScrollState);
        ro.observe(el);
        return () => ro.disconnect();
    }, [activeGroup]);
    // [Fix 2026-08-04] "경기 리스트를 마우스 드래그로 스크롤" 요청 — 트랙패드/스크롤바 없이도
    // 마우스로 클릭+드래그하면 좌우로 스크롤되도록 처리. 드래그가 실제로 발생했을 때만(임계값
    // 3px 초과) 다음 클릭을 캡처 단계에서 막아, 드래그 끝에 카드 위에서 손을 떼도 경기 상세로
    // 잘못 이동하지 않게 한다.
    const dragRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);
    const wasDraggedRef = useRef(false);
    const handleStripMouseDown = (e: React.MouseEvent) => {
        const el = gameStripRef.current;
        if (!el) return;
        dragRef.current = { startX: e.pageX, startScrollLeft: el.scrollLeft };
    };
    const handleStripMouseMove = (e: React.MouseEvent) => {
        const drag = dragRef.current;
        const el = gameStripRef.current;
        if (!drag || !el) return;
        const dx = e.pageX - drag.startX;
        if (Math.abs(dx) > 3) {
            wasDraggedRef.current = true;
            el.scrollLeft = drag.startScrollLeft - dx;
        }
    };
    const endStripDrag = () => { dragRef.current = null; };
    const handleStripClickCapture = (e: React.MouseEvent) => {
        if (wasDraggedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            wasDraggedRef.current = false;
        }
    };
    useEffect(() => {
        if (!isDateMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (!dateMenuRef.current?.contains(e.target as Node)) setIsDateMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isDateMenuOpen]);

    const gameDateSet = useMemo(() => new Set(dateKeys), [dateKeys]);

    // 달력이 보여주는 연/월(선택된 날짜와 별개 — 화살표로 다른 달을 미리보기만 할 수 있음).
    // 드롭다운을 열 때마다 현재 선택된 날짜의 달로 초기화.
    const [viewYM, setViewYM] = useState<[number, number] | null>(null);
    useEffect(() => {
        if (isDateMenuOpen && activeDateKey) {
            const [y, m] = activeDateKey.split('-').map(Number);
            setViewYM([y, m - 1]);
        }
    }, [isDateMenuOpen, activeDateKey]);

    // 진행 중(LIVE)인 경기의 실시간 스코어 — MultiScheduleView.tsx와 동일한 5초 폴링.
    const [liveSummaries, setLiveSummaries] = useState<Record<string, LiveGameSummary>>({});
    useEffect(() => {
        if (!roomId) return;
        let cancelled = false;
        const poll = async () => {
            const summaries = await fetchLiveGamesSummary(roomId, accessToken);
            if (cancelled) return;
            setLiveSummaries(Object.fromEntries(summaries.map(s => [s.gameId, s])));
        };
        poll();
        const timer = setInterval(poll, 5000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [roomId, accessToken]);

    if (!activeGroup) return null;

    return (
        <div className="shrink-0 flex items-stretch bg-slate-950 border-b border-slate-800 h-[76px]">
            {/* 날짜 셀렉터 — 화살표 이동 + 클릭 시 전체 날짜 드롭다운.
                [Fix 2026-08-29] 인디고 색상을 slate 계열로 변경. */}
            <div ref={dateMenuRef} className="relative shrink-0 flex items-center gap-0.5 px-1.5 bg-slate-800 border-r border-slate-700">
                <button
                    onClick={() => activeIdx > 0 && setSelectedDateKey(dateKeys[activeIdx - 1])}
                    disabled={activeIdx <= 0}
                    className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                    <ChevronLeft size={16} />
                </button>
                <button
                    onClick={(e) => {
                        // [Fix 2026-08-04] 클릭 좌표(clientX/Y) 대신 날짜 버튼 자신의 위치를 써서
                        // "어딜 눌러도 날짜선택영역 바로 좌측 하단"에 여백 없이 붙도록 고정.
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenuPos({ x: rect.left, y: rect.bottom });
                        setIsDateMenuOpen(o => !o);
                    }}
                    className={`flex flex-col items-center justify-center px-3 py-2 rounded transition-colors ${isDateMenuOpen ? 'bg-slate-700' : 'hover:bg-slate-700'}`}
                >
                    <span className="text-sm font-black text-white leading-tight tabular-nums whitespace-nowrap">{activeYear}</span>
                    <span className="text-sm font-black text-white leading-tight tabular-nums whitespace-nowrap">
                        {activeMonth}.{activeDay}
                    </span>
                </button>
                <button
                    onClick={() => activeIdx >= 0 && activeIdx < dateKeys.length - 1 && setSelectedDateKey(dateKeys[activeIdx + 1])}
                    disabled={activeIdx < 0 || activeIdx >= dateKeys.length - 1}
                    className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                    <ChevronRight size={16} />
                </button>

                {/* 월간 달력 — 경기가 있는 날짜만 선택 가능(없는 날짜는 비활성) */}
                {isDateMenuOpen && viewYM && menuPos && (
                    <MonthCalendarPopover
                        position={menuPos}
                        viewYM={viewYM}
                        onViewYMChange={setViewYM}
                        selectableDates={gameDateSet}
                        activeDateKey={activeDateKey ?? ''}
                        onSelect={dk => { setSelectedDateKey(dk); setIsDateMenuOpen(false); }}
                    />
                )}
            </div>

            {/* 좌측 이동 버튼 — 우측 버튼과 동일한 패턴(끝 도달 시 비활성화, 인디고 색상) */}
            <button
                onClick={() => gameStripRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                disabled={!canScrollLeft}
                className="shrink-0 w-8 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 disabled:cursor-default transition-colors"
            >
                <ChevronLeft size={18} />
            </button>

            {/* 그 날짜의 경기 카드 — 가로 스크롤 */}
            <div
                ref={gameStripRef}
                onScroll={updateScrollState}
                onMouseDown={handleStripMouseDown}
                onMouseMove={handleStripMouseMove}
                onMouseUp={endStripDrag}
                onMouseLeave={endStripDrag}
                onClickCapture={handleStripClickCapture}
                className="flex-1 min-w-0 overflow-x-auto flex select-none cursor-grab active:cursor-grabbing"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
            >
                {activeGroup.games.map(g => {
                    const state = getGameDisplayState(g, serverNow);
                    const live = liveSummaries[g.id];
                    const isCurrent = g.id === currentGameId;
                    const homeWon = state === 'final' && g.homeScore != null && g.awayScore != null && g.homeScore > g.awayScore;
                    const awayWon = state === 'final' && g.homeScore != null && g.awayScore != null && g.awayScore > g.homeScore;
                    const statusLabel = state === 'final' ? '종료'
                        : state === 'live' ? (live ? `${live.quarter ?? 1}Q ${live.clock ?? ''}` : 'LIVE')
                        : '예정';

                    return (
                        <button
                            key={g.id}
                            ref={isCurrent ? currentCardRef : undefined}
                            onClick={() => !isCurrent && navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(g.id)}`)}
                            className={`shrink-0 w-36 px-3 py-2 flex flex-col justify-center gap-1 border-r border-slate-800 transition-colors text-left cursor-pointer ${
                                isCurrent ? 'bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/50' : 'hover:bg-slate-900'
                            }`}
                        >
                            <span className={`text-xs font-bold uppercase tracking-wider ${state === 'live' ? 'text-red-400' : 'text-slate-500'}`}>
                                {statusLabel}
                            </span>
                            <StripTeamRow
                                team={teamMap[g.awayTeamId]}
                                teamId={g.awayTeamId}
                                score={state === 'final' ? g.awayScore : state === 'live' ? live?.awayScore : undefined}
                                won={awayWon}
                            />
                            <StripTeamRow
                                team={teamMap[g.homeTeamId]}
                                teamId={g.homeTeamId}
                                score={state === 'final' ? g.homeScore : state === 'live' ? live?.homeScore : undefined}
                                won={homeWon}
                            />
                        </button>
                    );
                })}
            </div>

            {/* 리스트가 화면 우측 끝을 넘어가도 스크롤할 방법이 없다는 피드백 — 맨 우측에
                고정 화살표 버튼 추가, 클릭 시 스트립을 오른쪽으로 스크롤. */}
            <button
                onClick={() => gameStripRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                disabled={!canScrollRight}
                className="shrink-0 w-8 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 disabled:cursor-default transition-colors"
            >
                <ChevronRight size={18} />
            </button>
        </div>
    );
};
