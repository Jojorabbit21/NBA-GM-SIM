
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Loader2, Play, FileText, Eye } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../types';
import { useMonthlySchedule, fetchFullGameResult } from '../services/queries';
import { CALENDAR_EVENTS } from '../utils/constants';
import { TeamLogo } from '../components/common/TeamLogo';

interface ScheduleViewProps {
  schedule: Game[];
  teamId: string;
  teams: Team[];
  currentSimDate: string;
  userId: string;
  initialMonth?: Date | null;
  onMonthChange?: (d: Date) => void;
  onViewGameResult: (result: any) => void;
  calendarOnly?: boolean;
  onSpectateGame?: (gameId: string) => void;
  onStartUserGame?: () => void;
  isSimulating?: boolean;
  playoffSeries?: PlayoffSeries[];
}

const MIN_MONTH = new Date(2025, 9, 1);  // October 2025
const MAX_MONTH = new Date(2026, 5, 1);  // June 2026

interface CalendarCell {
  day: number;
  isOverflow: boolean;  // previous/next month
  dateStr: string;      // YYYY-MM-DD for game lookup
  year: number;
  month: number;        // 0-indexed
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({ schedule: localSchedule, teamId, teams, currentSimDate, userId, initialMonth, onMonthChange, onViewGameResult, calendarOnly = false, onSpectateGame, onStartUserGame, isSimulating = false, playoffSeries = [] }) => {
  const [currentDate, setCurrentDate] = useState(() => {
    if (initialMonth) return new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1);
    if (currentSimDate) {
      const d = new Date(currentSimDate);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(2025, 9, 1);
  });
  const showLeagueSchedule = !calendarOnly;
  const [fetchingGameId, setFetchingGameId] = useState<string | null>(null);

  // 유저 팀이 오늘 경기가 있는지 (있으면 참관 불가)
  const userHasGameToday = useMemo(() =>
    localSchedule.some(g => !g.played && g.date === currentSimDate && (g.homeTeamId === teamId || g.awayTeamId === teamId)),
    [localSchedule, currentSimDate, teamId]
  );

  const { data: userResults, isLoading: isDbLoading } = useMonthlySchedule(
      userId,
      currentDate.getFullYear(),
      currentDate.getMonth()
  );

  // [Sync] Update calendar view when sim date changes (only if needed)
  useEffect(() => {
    if (currentSimDate) {
        const simDate = new Date(currentSimDate);
        setCurrentDate(prev => {
            if (prev.getMonth() !== simDate.getMonth() || prev.getFullYear() !== simDate.getFullYear()) {
                return new Date(simDate.getFullYear(), simDate.getMonth(), 1);
            }
            return prev;
        });
    }
  }, [currentSimDate]);

  // Month range check helpers
  const isAtMinMonth = currentDate.getFullYear() === MIN_MONTH.getFullYear() && currentDate.getMonth() === MIN_MONTH.getMonth();
  const isAtMaxMonth = currentDate.getFullYear() === MAX_MONTH.getFullYear() && currentDate.getMonth() === MAX_MONTH.getMonth();

  const changeMonth = (offset: number) => {
    const next = new Date(currentDate);
    next.setMonth(currentDate.getMonth() + offset);
    // Clamp to range
    if (next < MIN_MONTH) return;
    if (next > MAX_MONTH) return;
    setCurrentDate(next);
    onMonthChange?.(next);
  };

  const asbStart = new Date(CALENDAR_EVENTS.ALL_STAR_START);
  const asbEnd = new Date(CALENDAR_EVENTS.ALL_STAR_END);

  // [Single Month Calendar] Fixed 6-row layout
  const calendarContainerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(0);

  const calendarLayout = useMemo((): { cells: CalendarCell[] } => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const startDay = currentDate.getDay(); // 0=Sun
      const totalDays = new Date(year, month + 1, 0).getDate();
      const prevMonthDays = new Date(year, month, 0).getDate();

      const NUM_ROWS = 6;
      const cells: CalendarCell[] = [];

      for (let i = 0; i < NUM_ROWS * 7; i++) {
          const d = i - startDay + 1;
          if (d < 1) {
              // Previous month overflow
              const prevDay = prevMonthDays + d;
              const pm = month === 0 ? 11 : month - 1;
              const py = month === 0 ? year - 1 : year;
              cells.push({
                  day: prevDay,
                  isOverflow: true,
                  dateStr: `${py}-${String(pm + 1).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`,
                  year: py,
                  month: pm,
              });
          } else if (d > totalDays) {
              // Next month overflow
              const nextDay = d - totalDays;
              const nm = month === 11 ? 0 : month + 1;
              const ny = month === 11 ? year + 1 : year;
              cells.push({
                  day: nextDay,
                  isOverflow: true,
                  dateStr: `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`,
                  year: ny,
                  month: nm,
              });
          } else {
              cells.push({
                  day: d,
                  isOverflow: false,
                  dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                  year,
                  month,
              });
          }
      }
      return { cells };
  }, [currentDate]);

  useEffect(() => {
      if (showLeagueSchedule) { setCellSize(0); return; }
      const el = calendarContainerRef.current;
      if (!el) return;
      const update = () => {
          const { width, height } = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const px = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
          const py = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
          const headerH = 36;
          const fromH = (height - py - headerH) / 6;
          const fromW = (width - px) / 7;
          setCellSize(Math.floor(Math.min(fromH, fromW)));
      };
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
  }, [showLeagueSchedule]);

  // Full season game map (selected team only)
  const seasonGameMap = useMemo(() => {
      const map = new Map<string, Game>();
      localSchedule
          .filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId)
          .forEach(g => map.set(g.date, g));
      return map;
  }, [localSchedule, teamId]);

  // [League Schedule] All games for current month, merged with DB results
  const leagueGames = useMemo(() => {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth();
      const baseGames = localSchedule.filter(g => {
          const d = new Date(g.date);
          return d.getFullYear() === y && d.getMonth() === m;
      });

      const resultMap = new Map<string, any>();
      if (userResults && Array.isArray(userResults)) {
          userResults.forEach((r: any) => resultMap.set(r.game_id, r));
      }

      return baseGames.map(g => {
          const dbResult = resultMap.get(g.id);
          return {
              ...g,
              played: g.played || !!dbResult,
              homeScore: g.homeScore ?? dbResult?.home_score,
              awayScore: g.awayScore ?? dbResult?.away_score
          };
      }).sort((a, b) => a.date.localeCompare(b.date));
  }, [localSchedule, userResults, currentDate]);

  // [League Schedule] Group games by date
  const gamesByDate = useMemo(() => {
      const map = new Map<string, typeof leagueGames>();
      leagueGames.forEach(g => {
          const existing = map.get(g.date) || [];
          existing.push(g);
          map.set(g.date, existing);
      });
      return map;
  }, [leagueGames]);

  // [Day Carousel] — only for league schedule mode
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const dayCarouselRef = useRef<HTMLDivElement>(null);

  // All days in current month (1 ~ lastDay)
  const allDays = useMemo(() => {
      const totalDays = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      return Array.from({ length: totalDays }, (_, i) => i + 1);
  }, [currentDate]);

  // Auto-select day when month changes
  useEffect(() => {
      if (!showLeagueSchedule || allDays.length === 0) { setSelectedDay(null); return; }
      const simDate = new Date(currentSimDate);
      const inSameMonth = simDate.getFullYear() === currentDate.getFullYear() && simDate.getMonth() === currentDate.getMonth();
      setSelectedDay(inSameMonth ? simDate.getDate() : 1);
  }, [allDays, currentSimDate, currentDate, showLeagueSchedule]);

  // Auto-scroll carousel to selected day
  useEffect(() => {
      if (selectedDay === null || !dayCarouselRef.current) return;
      const btn = dayCarouselRef.current.querySelector(`[data-day="${selectedDay}"]`) as HTMLElement;
      btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedDay]);

  // Selected day's dateStr and games
  const selectedDayDateStr = useMemo(() => {
      if (selectedDay === null) return '';
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth();
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  }, [selectedDay, currentDate]);

  const selectedDayGames = useMemo(() => {
      if (!selectedDayDateStr) return [];
      return gamesByDate.get(selectedDayDateStr) || [];
  }, [selectedDayDateStr, gamesByDate]);

  const scrollCarousel = (direction: number) => {
      const el = dayCarouselRef.current;
      if (el) el.scrollBy({ left: direction * 200, behavior: 'smooth' });
  };

  const getSeriesLabel = (series: PlayoffSeries) => {
      const conf = series.conference === 'East' ? '동부' : series.conference === 'West' ? '서부' : '';
      switch (series.round) {
          case 0:
              if (series.id.includes('PI_7v8')) return `${conf} 컨퍼런스 플레이-인 7시드 결정전`;
              if (series.id.includes('PI_9v10')) return `${conf} 컨퍼런스 플레이-인 1라운드`;
              if (series.id.includes('PI_8th')) return `${conf} 컨퍼런스 플레이-인 8시드 결정전`;
              return `${conf} 컨퍼런스 플레이-인`;
          case 1: return `${conf} 컨퍼런스 1라운드`;
          case 2: return `${conf} 컨퍼런스 2라운드`;
          case 3: return `${conf} 컨퍼런스 파이널`;
          case 4: return '파이널';
          default: return `라운드 ${series.round}`;
      }
  };

  // [Box Score Navigation]
  const handleViewBoxScore = async (gameId: string) => {
      if (fetchingGameId || !userId) {
          console.warn('[BoxScore] blocked:', { fetchingGameId, userId });
          return;
      }
      setFetchingGameId(gameId);
      try {
          const raw = await fetchFullGameResult(gameId, userId);
          if (!raw) {
              console.warn('[BoxScore] DB에서 결과를 찾을 수 없습니다:', { gameId, userId });
              return;
          }
          const homeTeam = teams.find(t => t.id === raw.home_team_id);
          const awayTeam = teams.find(t => t.id === raw.away_team_id);
          if (!homeTeam || !awayTeam) {
              console.warn('[BoxScore] 팀을 찾을 수 없습니다:', { home_team_id: raw.home_team_id, away_team_id: raw.away_team_id });
              return;
          }
          onViewGameResult({
              home: homeTeam, away: awayTeam,
              homeScore: raw.home_score, awayScore: raw.away_score,
              homeBox: raw.box_score?.home || [], awayBox: raw.box_score?.away || [],
              homeTactics: raw.tactics?.home, awayTactics: raw.tactics?.away,
              pbpLogs: raw.pbp_logs || [], pbpShotEvents: raw.shot_events || [],
              rotationData: raw.rotation_data,
              otherGames: [], date: raw.date, recap: []
          });
      } catch (err) {
          console.error('[BoxScore] 에러 발생:', err);
      } finally {
          setFetchingGameId(null);
      }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
      {/* Header Bar — only shown for league schedule mode */}
      {!calendarOnly && (
      <div className="flex-shrink-0 px-6 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
              <Calendar size={16} className="text-slate-500" />
              <span className="text-xs font-black text-slate-300 uppercase tracking-widest">리그 전체 일정</span>
              {isDbLoading && <Loader2 className="animate-spin text-indigo-500" size={14} />}
          </div>
      </div>
      )}

      {/* Shared Month Navigation */}
      <div className="flex items-center justify-center gap-4 py-2.5 shrink-0 border-b border-slate-700 bg-slate-800">
        <button
          onClick={() => changeMonth(-1)}
          disabled={isAtMinMonth}
          className={`p-1.5 rounded-lg transition-colors ${isAtMinMonth ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-sm font-black text-white uppercase tracking-wide min-w-[160px] text-center">
          {currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
        </h3>
        <button
          onClick={() => changeMonth(1)}
          disabled={isAtMaxMonth}
          className={`p-1.5 rounded-lg transition-colors ${isAtMaxMonth ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Content */}
      {!showLeagueSchedule ? (
        /* ── Single Month Calendar ── */
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Calendar Grid — fills viewport, square cells, centered */}
          <div ref={calendarContainerRef} className="flex-1 min-h-0 flex justify-center items-start p-4 bg-slate-900">
            {cellSize > 0 && (() => {
              const gridWidth = cellSize * 7;

              return (
                <div style={{ width: gridWidth }} className="pb-4">
                  {/* Day Headers */}
                  <div className="grid grid-cols-7">
                    {['일','월','화','수','목','금','토'].map((name, idx) => (
                      <div key={name} style={{ height: 36 }}
                        className={`flex items-center justify-center text-xs font-black uppercase tracking-widest border border-slate-800 bg-slate-900/50 ${
                          idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-500'
                        }`}
                      >{name}</div>
                    ))}
                  </div>

                  {/* Day Grid — fixed 6 rows */}
                  <div className="grid grid-cols-7">
                    {calendarLayout.cells.map((cell, idx) => {
                      const { day, isOverflow, dateStr } = cell;
                      const dayDate = new Date(cell.year, cell.month, day);

                      const game = !isOverflow ? seasonGameMap.get(dateStr) : undefined;
                      const isToday = dateStr === currentSimDate;
                      const isASB = !isOverflow && dayDate >= asbStart && dayDate <= asbEnd;

                      const isHome = game?.homeTeamId === teamId;
                      const oppId = isHome ? game?.awayTeamId : game?.homeTeamId;
                      const opp = teams.find(t => t.id === oppId);

                      let bgStyle = isOverflow ? 'bg-slate-950/60' : 'bg-slate-900/30';
                      let isWon = false;

                      if (game?.played) {
                        isWon = isHome ? (game.homeScore! > game.awayScore!) : (game.awayScore! > game.homeScore!);
                        bgStyle = isWon ? 'bg-emerald-900/50' : 'bg-red-900/50';
                      } else if (game) {
                        bgStyle = 'bg-slate-800/40';
                      } else if (!isOverflow && isToday) {
                        bgStyle = 'bg-indigo-500/10';
                      }
                      if (isToday && !isOverflow) bgStyle += ' ring-1 ring-indigo-600 ring-inset z-10';

                      // Scale content based on cell size
                      const logoClass = cellSize >= 120 ? 'w-10 h-10' : cellSize >= 80 ? 'w-8 h-8' : 'w-6 h-6';

                      return (
                        <div key={idx}
                          style={{ width: cellSize, height: cellSize }}
                          className={`border border-slate-700/40 relative p-1 flex flex-col ${bgStyle}`}
                        >
                          <span className={`text-xs font-black leading-none ${
                            isOverflow ? 'text-slate-700' : isToday ? 'text-indigo-400' : 'text-slate-500'
                          }`}>{day}</span>

                          {game && opp && !isOverflow ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0">
                              <TeamLogo teamId={opp.id} size="custom" className={`${logoClass} drop-shadow`} />
                              {game.played ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleViewBoxScore(game.id); }}
                                  disabled={!!fetchingGameId}
                                  className={`text-sm font-black leading-none hover:underline cursor-pointer disabled:opacity-50 ${isWon ? 'text-emerald-300' : 'text-red-300'}`}
                                >
                                  {fetchingGameId === game.id ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    isHome ? `${game.homeScore}:${game.awayScore}` : `${game.awayScore}:${game.homeScore}`
                                  )}
                                </button>
                              ) : (
                                <span className={`text-xs font-bold uppercase leading-none ${isHome ? 'text-indigo-400' : 'text-slate-500'}`}>
                                  {isHome ? 'vs' : '@'}
                                </span>
                              )}
                            </div>
                          ) : isASB ? (
                            <div className="flex-1 flex items-center justify-center">
                              <span className="text-xs font-black text-yellow-500/60">올스타 기간</span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        /* ── League Schedule: Day Carousel + Game Cards ── */
        <React.Fragment>
          {/* Day Carousel */}
          <div className="shrink-0 border-b border-slate-700/50 bg-slate-900 flex items-center">
            <button
              onClick={() => scrollCarousel(-1)}
              className="shrink-0 px-2 py-3 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <div
              ref={dayCarouselRef}
              className="flex-1 overflow-x-auto custom-scrollbar-hide flex items-center justify-center gap-1.5 py-2"
            >
              {allDays.map(day => {
                const y = currentDate.getFullYear();
                const m = currentDate.getMonth();
                const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isToday = ds === currentSimDate;
                const isSelected = selectedDay === day;
                const dayOfWeek = new Date(y, m, day).toLocaleDateString('ko-KR', { weekday: 'short' });
                const gameCount = gamesByDate.get(ds)?.length || 0;

                return (
                  <button
                    key={day}
                    data-day={day}
                    onClick={() => setSelectedDay(day)}
                    className={`shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl transition-all min-w-[52px] ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                        : isToday
                        ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/30'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                    }`}
                  >
                    <span className="text-[9px] font-bold">{dayOfWeek}</span>
                    <span className="text-sm font-black">{day}</span>
                    <span className={`text-[8px] font-bold ${isSelected ? 'text-indigo-200' : 'text-slate-600'}`}>{gameCount}경기</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => scrollCarousel(1)}
              className="shrink-0 px-2 py-3 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Game Cards */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900">
            <div className="p-4">
              {selectedDay === null || selectedDayGames.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-slate-500 text-sm font-bold">
                  오늘은 예정된 경기가 없습니다.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedDayGames.map(game => {
                    const homeTeam = teams.find(t => t.id === game.homeTeamId);
                    const awayTeam = teams.find(t => t.id === game.awayTeamId);
                    if (!homeTeam || !awayTeam) return null;

                    const isMyGame = game.homeTeamId === teamId || game.awayTeamId === teamId;
                    const isTodayGame = selectedDayDateStr === currentSimDate && !game.played;
                    const canSpectate = isTodayGame && !isMyGame && !userHasGameToday && !!onSpectateGame;
                    const canStartUserGame = isTodayGame && isMyGame && !!onStartUserGame;

                    // Playoff info
                    const series = game.isPlayoff && game.seriesId
                      ? playoffSeries.find(s => s.id === game.seriesId)
                      : undefined;

                    const awayIsWinner = game.played && game.awayScore! > game.homeScore!;
                    const homeIsWinner = game.played && game.homeScore! > game.awayScore!;

                    return (
                      <div
                        key={game.id}
                        className={`rounded-2xl border overflow-hidden transition-all ${
                          isMyGame
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-slate-700/50 bg-slate-800/40'
                        }`}
                      >
                        {/* Playoff Header */}
                        {series && (
                          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                              {getSeriesLabel(series)}
                            </span>
                            <span className="text-[9px] text-amber-500/60">·</span>
                            <span className="text-[10px] font-bold text-amber-500/80">
                              시리즈 {series.higherSeedWins}-{series.lowerSeedWins}
                            </span>
                          </div>
                        )}

                        {/* Game Content */}
                        <div className="px-4 py-3 space-y-2">
                          {/* Away Team Row */}
                          <div className="flex items-center gap-3">
                            <TeamLogo teamId={awayTeam.id} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs font-black uppercase truncate ${
                                isMyGame && game.awayTeamId === teamId ? 'text-amber-400' : 'text-slate-300'
                              }`}>
                                {awayTeam.city} {awayTeam.name}
                              </div>
                              <div className="text-[10px] text-slate-500 font-bold">{awayTeam.wins}-{awayTeam.losses}</div>
                            </div>
                            {game.played ? (
                              <span className={`text-lg font-black ${awayIsWinner ? 'text-white' : 'text-slate-600'}`}>
                                {game.awayScore}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-600 font-bold">AWAY</span>
                            )}
                          </div>

                          {/* Divider */}
                          <div className="border-t border-slate-700/30" />

                          {/* Home Team Row */}
                          <div className="flex items-center gap-3">
                            <TeamLogo teamId={homeTeam.id} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs font-black uppercase truncate ${
                                isMyGame && game.homeTeamId === teamId ? 'text-amber-400' : 'text-slate-300'
                              }`}>
                                {homeTeam.city} {homeTeam.name}
                              </div>
                              <div className="text-[10px] text-slate-500 font-bold">{homeTeam.wins}-{homeTeam.losses}</div>
                            </div>
                            {game.played ? (
                              <span className={`text-lg font-black ${homeIsWinner ? 'text-white' : 'text-slate-600'}`}>
                                {game.homeScore}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-600 font-bold">HOME</span>
                            )}
                          </div>
                        </div>

                        {/* Action Button */}
                        {(game.played || canSpectate || canStartUserGame) && (
                          <div className="px-4 pb-3">
                            {game.played ? (
                              <button
                                onClick={() => handleViewBoxScore(game.id)}
                                disabled={!!fetchingGameId}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all bg-slate-700/50 hover:bg-slate-700 text-slate-300 disabled:opacity-50"
                              >
                                {fetchingGameId === game.id ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : (
                                  <><FileText size={10} /> 박스스코어</>
                                )}
                              </button>
                            ) : canStartUserGame ? (
                              <button
                                onClick={() => onStartUserGame!()}
                                disabled={isSimulating}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
                              >
                                {isSimulating ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : (
                                  <><Play size={10} fill="currentColor" /> 경기 시작</>
                                )}
                              </button>
                            ) : canSpectate ? (
                              <button
                                onClick={() => onSpectateGame!(game.id)}
                                disabled={isSimulating}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                              >
                                {isSimulating ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : (
                                  <><Eye size={10} /> 경기 보기</>
                                )}
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </React.Fragment>
      )}
    </div>
  );
};
