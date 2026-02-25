
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar, CheckCircle2, Search, Loader2, List, LayoutGrid } from 'lucide-react';
import { Team, Game } from '../types';
import { useMonthlySchedule, fetchFullGameResult } from '../services/queries';
import { CALENDAR_EVENTS } from '../utils/constants';
import { TeamLogo } from '../components/common/TeamLogo';
import { Dropdown, DropdownButton } from '../components/common/Dropdown';

interface ScheduleViewProps {
  schedule: Game[]; // From App state (Local Source of Truth)
  teamId: string;
  teams: Team[];
  currentSimDate: string;
  userId: string;
  onViewGameResult: (result: any) => void;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({ schedule: localSchedule, teamId, teams, currentSimDate, userId, onViewGameResult }) => {
  const [currentDate, setCurrentDate] = useState(() => {
    if (currentSimDate) {
      const d = new Date(currentSimDate);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(2025, 9, 1);
  }); 
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teamId);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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

  const changeMonth = (offset: number) => {
    const next = new Date(currentDate);
    next.setMonth(currentDate.getMonth() + offset);
    setCurrentDate(next);
  };

  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  const asbStart = new Date(CALENDAR_EVENTS.ALL_STAR_START);
  const asbEnd = new Date(CALENDAR_EVENTS.ALL_STAR_END);

  // [Single Month Calendar] layout computation
  const calendarContainerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(0);

  const calendarLayout = useMemo(() => {
      const startDay = currentDate.getDay();
      const totalDays = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      const numRows = Math.ceil((startDay + totalDays) / 7);
      const cells = Array.from({ length: numRows * 7 }, (_, i) => {
          const d = i - startDay + 1;
          return (d > 0 && d <= totalDays) ? d : null;
      });
      return { numRows, cells };
  }, [currentDate]);

  useEffect(() => {
      if (showLeagueSchedule) { setCellSize(0); return; }
      const el = calendarContainerRef.current;
      if (!el) return;
      const update = () => {
          const { width, height } = el.getBoundingClientRect();
          const headerH = 32;
          const fromH = (height - headerH) / calendarLayout.numRows;
          const fromW = width / 7;
          setCellSize(Math.floor(Math.min(fromH, fromW)));
      };
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
  }, [calendarLayout.numRows, showLeagueSchedule]);

  // Full season game map (selected team only, no DB query needed — localSchedule is already replayed)
  const seasonGameMap = useMemo(() => {
      const map = new Map<string, Game>();
      localSchedule
          .filter(g => g.homeTeamId === selectedTeamId || g.awayTeamId === selectedTeamId)
          .forEach(g => map.set(g.date, g));
      return map;
  }, [localSchedule, selectedTeamId]);

  const filteredTeamsList = useMemo(() => {
    return teams
        .filter(t => (t.city + t.name).toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => a.city.localeCompare(b.city));
  }, [teams, searchTerm]);

  // [League Schedule] All games for current month (no team filter), merged with DB results
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

  // [Box Score Navigation] — Same pattern as InboxView
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
          <div className="flex items-center gap-3">
              <Dropdown
                  isOpen={isDropdownOpen}
                  onOpenChange={setIsDropdownOpen}
                  width="w-80"
                  trigger={
                      <DropdownButton
                          isOpen={isDropdownOpen}
                          label={selectedTeam ? `${selectedTeam.city} ${selectedTeam.name}` : '팀 선택...'}
                          icon={selectedTeam ? <TeamLogo teamId={selectedTeam.id} size="sm" /> : undefined}
                      />
                  }
              >
                   <div className="p-3 border-b border-slate-800 bg-slate-950/50">
                      <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                              autoFocus
                              type="text"
                              placeholder="팀 검색..."
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-xs font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                              value={searchTerm}
                              onChange={e => setSearchTerm(e.target.value)}
                          />
                      </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar p-2 space-y-1">
                      {filteredTeamsList.map(t => (
                          <button
                              key={t.id}
                              onClick={() => { setSelectedTeamId(t.id); setIsDropdownOpen(false); setSearchTerm(''); }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-all group ${selectedTeamId === t.id ? 'bg-indigo-900/20' : ''}`}
                          >
                              <TeamLogo teamId={t.id} size="xs" className="opacity-70 group-hover:opacity-100" />
                              <span className={`text-xs font-bold uppercase truncate ${selectedTeamId === t.id ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}>{t.city} {t.name}</span>
                              {t.id === teamId && (
                                  <span className="ml-2 px-1.5 py-0.5 bg-red-600 text-[9px] font-black text-white rounded uppercase tracking-tighter shadow-sm">MY TEAM</span>
                              )}
                              {selectedTeamId === t.id && <CheckCircle2 size={14} className="ml-auto text-indigo-500 flex-shrink-0" />}
                          </button>
                      ))}
                  </div>
              </Dropdown>

              <button
                  onClick={() => setShowLeagueSchedule(prev => !prev)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase transition-all border ${
                      showLeagueSchedule
                          ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
                  }`}
              >
                  {showLeagueSchedule ? <><LayoutGrid size={14} /> 캘린더</> : <><List size={14} /> 리그 전체 일정</>}
              </button>
          </div>
      </div>

      {/* Content */}
      {!showLeagueSchedule ? (
        /* ── Single Month Calendar ── */
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Month Navigation */}
          <div className="flex items-center justify-center gap-4 py-2.5 shrink-0 border-b border-slate-800 bg-slate-900/30">
            <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <h3 className="text-sm font-black text-white oswald uppercase tracking-wide min-w-[160px] text-center">
              {currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
            </h3>
            <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Calendar Grid — fills viewport, square cells, centered */}
          <div ref={calendarContainerRef} className="flex-1 min-h-0 flex justify-center items-start p-4">
            {cellSize > 0 && (() => {
              const gridWidth = cellSize * 7;
              const year = currentDate.getFullYear();
              const month = currentDate.getMonth();
              const mm = String(month + 1).padStart(2, '0');

              return (
                <div style={{ width: gridWidth }}>
                  {/* Day Headers */}
                  <div className="grid grid-cols-7">
                    {['일','월','화','수','목','금','토'].map((name, idx) => (
                      <div key={name} style={{ height: 32 }}
                        className={`flex items-center justify-center text-[10px] font-black uppercase tracking-widest ${
                          idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-600'
                        }`}
                      >{name}</div>
                    ))}
                  </div>

                  {/* Day Grid */}
                  <div className="grid grid-cols-7">
                    {calendarLayout.cells.map((day, idx) => {
                      if (day === null) {
                        return <div key={idx} style={{ width: cellSize, height: cellSize }} className="border border-slate-800/20 bg-slate-950/20" />;
                      }

                      const dd = String(day).padStart(2, '0');
                      const dateStr = `${year}-${mm}-${dd}`;
                      const dayDate = new Date(year, month, day);

                      const game = seasonGameMap.get(dateStr);
                      const isToday = dateStr === currentSimDate;
                      const isASB = dayDate >= asbStart && dayDate <= asbEnd;

                      const isHome = game?.homeTeamId === selectedTeamId;
                      const oppId = isHome ? game?.awayTeamId : game?.homeTeamId;
                      const opp = teams.find(t => t.id === oppId);

                      let bgStyle = 'bg-slate-950/40';
                      let isWon = false;

                      if (game?.played) {
                        isWon = isHome ? (game.homeScore! > game.awayScore!) : (game.awayScore! > game.homeScore!);
                        bgStyle = isWon ? 'bg-emerald-900/50' : 'bg-red-900/50';
                      } else if (game) {
                        bgStyle = 'bg-slate-800/40';
                      } else if (isToday) {
                        bgStyle = 'bg-indigo-500/10';
                      }
                      if (isToday) bgStyle += ' ring-1 ring-indigo-600 ring-inset z-10';

                      // Scale content based on cell size
                      const logoClass = cellSize >= 120 ? 'w-10 h-10' : cellSize >= 80 ? 'w-7 h-7' : 'w-5 h-5';
                      const dayFont = cellSize >= 80 ? 'text-xs' : 'text-[9px]';
                      const scoreFont = cellSize >= 100 ? 'text-sm' : cellSize >= 80 ? 'text-xs' : 'text-[10px]';
                      const labelFont = cellSize >= 80 ? 'text-[10px]' : 'text-[8px]';

                      return (
                        <div key={idx}
                          style={{ width: cellSize, height: cellSize }}
                          className={`border border-slate-800/30 relative p-1 flex flex-col ${bgStyle}`}
                        >
                          <span className={`${dayFont} font-black oswald leading-none ${isToday ? 'text-indigo-400' : 'text-slate-600'}`}>{day}</span>

                          {game && opp ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0">
                              <TeamLogo teamId={opp.id} size="custom" className={`${logoClass} drop-shadow`} />
                              {game.played ? (
                                <div className={`${scoreFont} font-black oswald leading-none ${isWon ? 'text-emerald-300' : 'text-red-300'}`}>
                                  {isHome ? `${game.homeScore}:${game.awayScore}` : `${game.awayScore}:${game.homeScore}`}
                                </div>
                              ) : (
                                <div className={`${labelFont} font-bold uppercase leading-none`}>
                                  <span className={isHome ? 'text-indigo-400' : 'text-slate-600'}>{isHome ? 'vs' : '@'}</span>
                                </div>
                              )}
                            </div>
                          ) : isASB ? (
                            <div className="flex-1 flex items-center justify-center">
                              <span className={`${labelFont} font-black text-yellow-500/60 uppercase`}>ASB</span>
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
        /* ── League Schedule List View ── */
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
          <div className="flex flex-col">
            {/* Month Navigation */}
            <div className="px-6 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 rounded-xl mb-4">
               <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"><ChevronLeft size={20} /></button>
               <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-indigo-500" />
                  <h3 className="text-sm font-black text-white oswald uppercase tracking-wide">{currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</h3>
               </div>
               <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"><ChevronRight size={20} /></button>
            </div>

            <div className="space-y-4">
              {leagueGames.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-slate-500 text-sm font-bold">
                  이번 달에는 경기가 없습니다.
                </div>
              ) : (
                Array.from(gamesByDate.entries()).map(([dateStr, games]) => {
                  const d = new Date(dateStr + 'T12:00:00');
                  const isSimDay = dateStr === currentSimDate;
                  const dayLabel = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

                  return (
                    <div key={dateStr}>
                      {/* Date Header */}
                      <div className={`flex items-center gap-3 mb-2 ${isSimDay ? 'text-indigo-400' : 'text-slate-500'}`}>
                        <div className="h-px flex-1 bg-slate-800" />
                        <span className="text-[11px] font-black uppercase tracking-wider whitespace-nowrap">
                          {dayLabel}
                          {isSimDay && <span className="ml-2 px-1.5 py-0.5 bg-indigo-600 text-[8px] font-black text-white rounded">TODAY</span>}
                        </span>
                        <div className="h-px flex-1 bg-slate-800" />
                      </div>

                      {/* Games */}
                      <div className="space-y-1.5">
                        {games.map(game => {
                          const homeTeam = teams.find(t => t.id === game.homeTeamId);
                          const awayTeam = teams.find(t => t.id === game.awayTeamId);
                          if (!homeTeam || !awayTeam) return null;

                          const isMyGame = game.homeTeamId === teamId || game.awayTeamId === teamId;

                          return (
                            <div
                              key={game.id}
                              className={`rounded-xl px-4 py-3 transition-all ${
                                isMyGame
                                  ? 'bg-indigo-950/30 border border-indigo-800/30'
                                  : 'bg-slate-900/60 border border-slate-800/40'
                              }`}
                            >
                              <div className="flex items-center justify-center gap-3">
                                {/* Away Team */}
                                <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                                  <span className="text-xs font-black uppercase truncate text-slate-400">
                                    {awayTeam.city} {awayTeam.name}
                                  </span>
                                  <TeamLogo teamId={awayTeam.id} size="xs" />
                                </div>

                                {/* Score (clickable) / @ */}
                                {game.played ? (
                                  <button
                                    onClick={() => handleViewBoxScore(game.id)}
                                    disabled={!!fetchingGameId}
                                    className="flex items-center gap-2 shrink-0 px-3 py-1 rounded-lg hover:bg-slate-800/80 transition-all cursor-pointer disabled:opacity-50"
                                  >
                                    {fetchingGameId === game.id ? (
                                      <Loader2 size={16} className="animate-spin text-indigo-400" />
                                    ) : (
                                      <>
                                        <span className={`text-lg font-black oswald ${game.awayScore! > game.homeScore! ? 'text-white' : 'text-slate-500'}`}>
                                          {game.awayScore}
                                        </span>
                                        <span className="text-[10px] text-slate-600 font-bold">-</span>
                                        <span className={`text-lg font-black oswald ${game.homeScore! > game.awayScore! ? 'text-white' : 'text-slate-500'}`}>
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
                                  <span className="text-xs font-black uppercase truncate text-slate-400">
                                    {homeTeam.city} {homeTeam.name}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
