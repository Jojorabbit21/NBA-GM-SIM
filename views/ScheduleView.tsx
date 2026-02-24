
import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, CheckCircle2, Search, Loader2, List, LayoutGrid } from 'lucide-react';
import { Team, Game } from '../types';
import { useMonthlySchedule, fetchFullGameResult } from '../services/queries';
import { CALENDAR_EVENTS } from '../utils/constants';
import { TeamLogo } from '../components/common/TeamLogo';
import { PageHeader } from '../components/common/PageHeader';
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

  // [Optimization] Instant Rendering Strategy
  const monthlyGames = useMemo(() => {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth();

      // 1. Filter games for current month from full local schedule
      const baseGames = localSchedule.filter(g => {
          const d = new Date(g.date);
          return d.getFullYear() === y && d.getMonth() === m;
      });

      // 2. Create Map for DB Results (if available)
      const resultMap = new Map<string, any>();
      if (userResults && Array.isArray(userResults)) {
          userResults.forEach((r: any) => resultMap.set(r.game_id, r));
      }

      // 3. Merge Local + DB
      const mergedGames = baseGames.map(g => {
          if (g.played) return g;

          const dbResult = resultMap.get(g.id);
          if (dbResult) {
              return {
                  ...g,
                  played: true,
                  homeScore: dbResult.home_score,
                  awayScore: dbResult.away_score
              };
          }
          return g;
      });

      // 4. Filter by Selected Team
      return mergedGames.filter(g => (g.homeTeamId === selectedTeamId || g.awayTeamId === selectedTeamId));
  }, [localSchedule, userResults, currentDate, selectedTeamId]);

  // [Optimization] O(1) Lookup Map for Grid Rendering
  const gameMap = useMemo(() => {
      const map = new Map<string, Game>();
      monthlyGames.forEach(g => map.set(g.date, g));
      return map;
  }, [monthlyGames]);

  const changeMonth = (offset: number) => {
    const next = new Date(currentDate);
    next.setMonth(currentDate.getMonth() + offset);
    setCurrentDate(next);
  };

  const { start, total } = (() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const start = new Date(year, month, 1).getDay();
    const total = new Date(year, month + 1, 0).getDate();
    return { start, total };
  })();

  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => {
    const day = i - start + 1;
    return (day > 0 && day <= total) ? day : null;
  }), [start, total]);

  const getGameOnDate = (day: number) => {
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    return gameMap.get(dateStr);
  };

  const isTodayDate = (day: number) => {
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    return dateStr === currentSimDate;
  };

  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  const asbStart = new Date(CALENDAR_EVENTS.ALL_STAR_START); 
  const asbEnd = new Date(CALENDAR_EVENTS.ALL_STAR_END);

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
    <div className="space-y-6 w-full flex flex-col pb-24 animate-in fade-in duration-500">
      <PageHeader 
        title={
            <div className="flex items-center gap-3">
                <span>시즌 일정</span>
                {isDbLoading && <Loader2 className="animate-spin text-indigo-500" size={24} />}
            </div>
        }
        icon={<Calendar size={24} />}
        actions={
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
                            className="w-64 h-12"
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
                    className={`h-12 flex items-center gap-2 px-6 rounded-xl text-sm font-black uppercase transition-all border shadow-lg ${
                        showLeagueSchedule
                            ? 'bg-slate-700 hover:bg-slate-600 text-white border-slate-600 shadow-slate-900/20'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-indigo-900/20'
                    }`}
                >
                    {showLeagueSchedule ? <><LayoutGrid size={16} /> 캘린더</> : <><List size={16} /> 리그 전체 일정</>}
                </button>
            </div>
        }
      />

      {/* Month Navigation (shared between calendar & list) */}
      <div className="bg-slate-900/95 rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col relative z-10">
        <div className="px-6 py-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0 bg-slate-800/20">
           <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"><ChevronLeft size={24} /></button>
           <div className="flex items-center gap-3">
              <Calendar size={18} className="text-indigo-500" />
              <h3 className="text-xl font-black ko-tight text-white oswald uppercase tracking-wide">{currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</h3>
           </div>
           <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"><ChevronRight size={24} /></button>
        </div>

        {!showLeagueSchedule ? (
          <>
            {/* Calendar View */}
            <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/50 flex-shrink-0">
               {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                 <div key={day} className={`py-3 text-center text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-500'}`}>{day}</div>
               ))}
            </div>

            <div className="grid grid-cols-7">
               {days.map((day, idx) => {
                 if (day === null) return <div key={idx} className="border-b border-r border-slate-800/50 bg-slate-950/20 aspect-square"></div>;

                 const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                 const game = getGameOnDate(day);
                 const isToday = isTodayDate(day);
                 const isASB = dayDate >= asbStart && dayDate <= asbEnd;

                 const isHome = game?.homeTeamId === selectedTeamId;
                 const oppId = isHome ? game?.awayTeamId : game?.homeTeamId;
                 const opp = teams.find(t => t.id === oppId);

                 let bgStyle = "bg-slate-950/40";
                 let isWon = false;

                 if (game?.played) {
                    isWon = isHome ? (game.homeScore! > game.awayScore!) : (game.awayScore! > game.homeScore!);
                    bgStyle = isWon ? 'bg-emerald-900/50 border-emerald-500/30' : 'bg-red-900/50 border-red-500/30';
                 } else if (game) {
                    bgStyle = 'bg-slate-800/40 hover:bg-slate-800/60';
                 } else if (isToday) {
                    bgStyle = "bg-indigo-500/10";
                 }

                 if (isToday) {
                     bgStyle += " ring-2 ring-indigo-600 ring-inset z-10";
                 }

                 return (
                   <div key={idx} className={`border-b border-r border-slate-800/60 relative p-2 transition-all flex flex-col aspect-square ${bgStyle}`}>
                     <div className="flex justify-between items-start mb-1">
                        <span className={`text-xs font-black oswald ${isToday ? 'text-indigo-400' : 'text-slate-500'}`}>{day}</span>
                        {isToday && <span className="px-1 py-0.5 bg-indigo-600 text-[6px] font-black text-white rounded">TODAY</span>}
                        {isASB && !isToday && <span className="text-[6px] font-black text-yellow-500 uppercase tracking-tight">ALL-STAR</span>}
                     </div>

                     {game && opp ? (
                       <div className="flex-1 flex flex-col items-center justify-center gap-2 group cursor-default w-full p-1">
                          {!game.played ? (
                            <>
                                <TeamLogo
                                    teamId={opp.id}
                                    size="custom"
                                    className="w-14 h-14 lg:w-20 lg:h-20 drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                                />

                                <div className="text-center w-full z-10">
                                    <div className="text-xs lg:text-sm font-black text-slate-200 truncate w-full px-1 uppercase tracking-tight leading-none">
                                        <span className={`${isHome ? 'text-indigo-400' : 'text-slate-500'} mr-1`}>{isHome ? 'vs' : '@'}</span>{opp.name}
                                    </div>
                                </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center w-full h-full gap-1">
                                <div className="text-xs lg:text-sm font-black text-white w-full text-center uppercase tracking-tight leading-tight break-keep">
                                    <span className="text-[10px] text-slate-400 mr-1 align-middle">{isHome ? 'vs' : '@'}</span>{opp.name}
                                </div>
                                <div className={`text-xl lg:text-3xl font-black oswald leading-none ${isWon ? 'text-emerald-300' : 'text-red-300'}`}>
                                    {isHome ? `${game.homeScore}:${game.awayScore}` : `${game.awayScore}:${game.homeScore}`}
                                </div>
                            </div>
                          )}
                       </div>
                     ) : (
                        !isASB && <div className="flex-1"></div>
                     )}
                   </div>
                 );
               })}
            </div>
          </>
        ) : (
          /* League Schedule List View */
          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
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
        )}
      </div>
    </div>
  );
};
