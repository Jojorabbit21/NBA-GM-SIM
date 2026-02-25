
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Loader2, List, LayoutGrid } from 'lucide-react';
import { Team, Game } from '../types';
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
}

const MIN_MONTH = new Date(2025, 9, 1);  // October 2025
const MAX_MONTH = new Date(2026, 3, 1);  // April 2026

interface CalendarCell {
  day: number;
  isOverflow: boolean;  // previous/next month
  dateStr: string;      // YYYY-MM-DD for game lookup
  year: number;
  month: number;        // 0-indexed
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({ schedule: localSchedule, teamId, teams, currentSimDate, userId, initialMonth, onMonthChange, onViewGameResult }) => {
  const [currentDate, setCurrentDate] = useState(() => {
    if (initialMonth) return new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1);
    if (currentSimDate) {
      const d = new Date(currentSimDate);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(2025, 9, 1);
  });
  const [showLeagueSchedule, setShowLeagueSchedule] = useState(false);
  const [fetchingGameId, setFetchingGameId] = useState<string | null>(null);

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
          const headerH = 36;
          const fromH = (height - headerH) / 6;
          const fromW = width / 7;
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

  // [Box Score Navigation]
  const handleViewBoxScore = async (gameId: string) => {
      if (fetchingGameId) return;
      setFetchingGameId(gameId);
      try {
          const raw = await fetchFullGameResult(gameId, userId);
          if (raw) {
              const homeTeam = teams.find(t => t.id === raw.home_team_id);
              const awayTeam = teams.find(t => t.id === raw.away_team_id);
              const mappedResult = {
                  home: homeTeam, away: awayTeam,
                  homeScore: raw.home_score, awayScore: raw.away_score,
                  homeBox: raw.box_score?.home || [], awayBox: raw.box_score?.away || [],
                  homeTactics: raw.tactics?.home, awayTactics: raw.tactics?.away,
                  pbpLogs: raw.pbp_logs || [], pbpShotEvents: raw.shot_events || [],
                  rotationData: raw.rotation_data,
                  otherGames: [], date: raw.date, recap: []
              };
              if (homeTeam && awayTeam) onViewGameResult(mappedResult);
          }
      } finally {
          setFetchingGameId(null);
      }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
      {/* Header Bar */}
      <div className="flex-shrink-0 px-6 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
              <Calendar size={16} className="text-slate-500" />
              <span className="text-xs font-black text-slate-300 uppercase tracking-widest">시즌 일정</span>
              {isDbLoading && <Loader2 className="animate-spin text-indigo-500" size={14} />}
          </div>
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-sm">
              <button
                  onClick={() => setShowLeagueSchedule(false)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                      !showLeagueSchedule ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                  <LayoutGrid size={12} /> 캘린더
              </button>
              <button
                  onClick={() => setShowLeagueSchedule(true)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                      showLeagueSchedule ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                  <List size={12} /> 리그 전체 일정
              </button>
          </div>
      </div>

      {/* Shared Month Navigation */}
      <div className="flex items-center justify-center gap-4 py-2.5 shrink-0 border-b border-slate-800 bg-slate-900/30">
        <button
          onClick={() => changeMonth(-1)}
          disabled={isAtMinMonth}
          className={`p-1.5 rounded-lg transition-colors ${isAtMinMonth ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-sm font-black text-white oswald uppercase tracking-wide min-w-[160px] text-center">
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
          <div ref={calendarContainerRef} className="flex-1 min-h-0 flex justify-center items-start p-4">
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
                          <span className={`text-xs font-black oswald leading-none ${
                            isOverflow ? 'text-slate-700' : isToday ? 'text-indigo-400' : 'text-slate-500'
                          }`}>{day}</span>

                          {game && opp && !isOverflow ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0">
                              <TeamLogo teamId={opp.id} size="custom" className={`${logoClass} drop-shadow`} />
                              {game.played ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleViewBoxScore(game.id); }}
                                  disabled={!!fetchingGameId}
                                  className={`text-sm font-black oswald leading-none hover:underline cursor-pointer disabled:opacity-50 ${isWon ? 'text-emerald-300' : 'text-red-300'}`}
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
                              <span className="text-xs font-black text-yellow-500/60 uppercase">ASB</span>
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
        /* ── League Schedule List View (Flat Table) ── */
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <div className="px-6 py-4">
            {leagueGames.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-500 text-sm font-bold">
                이번 달에는 경기가 없습니다.
              </div>
            ) : (
              <div className="space-y-4">
                {Array.from(gamesByDate.entries()).map(([dateStr, games]) => {
                  const d = new Date(dateStr + 'T12:00:00');
                  const isSimDay = dateStr === currentSimDate;
                  const dayLabel = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

                  return (
                    <div key={dateStr}>
                      {/* Date Header */}
                      <div className={`flex items-center gap-3 mb-1.5 ${isSimDay ? 'text-indigo-400' : 'text-slate-500'}`}>
                        <div className="h-px flex-1 bg-slate-800" />
                        <span className="text-[11px] font-black uppercase tracking-wider whitespace-nowrap">
                          {dayLabel}
                          {isSimDay && <span className="ml-2 px-1.5 py-0.5 bg-indigo-600 text-[8px] font-black text-white rounded">TODAY</span>}
                        </span>
                        <div className="h-px flex-1 bg-slate-800" />
                      </div>

                      {/* Games — Flat rows */}
                      <div>
                        {games.map(game => {
                          const homeTeam = teams.find(t => t.id === game.homeTeamId);
                          const awayTeam = teams.find(t => t.id === game.awayTeamId);
                          if (!homeTeam || !awayTeam) return null;

                          const isMyGame = game.homeTeamId === teamId || game.awayTeamId === teamId;

                          return (
                            <div
                              key={game.id}
                              className={`flex items-center justify-center gap-3 py-2.5 px-4 border-b border-slate-800/30 ${
                                isMyGame ? 'bg-amber-500/10' : ''
                              }`}
                            >
                              {/* Away Team */}
                              <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                                <span className={`text-xs font-black uppercase truncate ${
                                  isMyGame && game.awayTeamId === teamId ? 'text-amber-400' : 'text-slate-400'
                                }`}>
                                  {awayTeam.city} {awayTeam.name}
                                </span>
                                <TeamLogo teamId={awayTeam.id} size="xs" />
                              </div>

                              {/* Score / @ */}
                              {game.played ? (
                                <button
                                  onClick={() => handleViewBoxScore(game.id)}
                                  disabled={!!fetchingGameId}
                                  className="flex items-center gap-2 shrink-0 px-3 py-0.5 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {fetchingGameId === game.id ? (
                                    <Loader2 size={14} className="animate-spin text-indigo-400" />
                                  ) : (
                                    <>
                                      <span className={`text-xs font-black oswald hover:underline ${game.awayScore! > game.homeScore! ? 'text-white' : 'text-slate-500'}`}>
                                        {game.awayScore}
                                      </span>
                                      <span className="text-[10px] text-slate-600 font-bold">-</span>
                                      <span className={`text-xs font-black oswald hover:underline ${game.homeScore! > game.awayScore! ? 'text-white' : 'text-slate-500'}`}>
                                        {game.homeScore}
                                      </span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-600 font-bold shrink-0 px-3">@</span>
                              )}

                              {/* Home Team */}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <TeamLogo teamId={homeTeam.id} size="xs" />
                                <span className={`text-xs font-black uppercase truncate ${
                                  isMyGame && game.homeTeamId === teamId ? 'text-amber-400' : 'text-slate-400'
                                }`}>
                                  {homeTeam.city} {homeTeam.name}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
