import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Save, Calendar, CheckCircle2, Search, ChevronDown, Loader2 } from 'lucide-react';
import { Team, Game } from '../types';
import { useMonthlySchedule } from '../services/queries';
import { supabase } from '../services/supabaseClient';

interface ScheduleViewProps {
  schedule: Game[]; // From App state (Local Source of Truth)
  teamId: string;
  teams: Team[];
  onExport: () => void;
  currentSimDate: string;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({ schedule: localSchedule, teamId, teams, onExport, currentSimDate }) => {
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  // [Pagination] Fetch ONLY Game Results for the current month
  const [userId, setUserId] = useState<string | undefined>(undefined);
  
  useEffect(() => {
      (supabase.auth as any).getUser().then(({ data }: any) => {
          setUserId(data.user?.id);
      });
  }, []);

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
  // 1. Calculate base schedule from 'localSchedule' (Memory) -> INSTANT display
  // 2. Overlay 'userResults' (DB) when they arrive -> Updates scores/played status
  const monthlyGames = useMemo(() => {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth();

      // 1. Filter games for current month from full local schedule (O(N) but N=1230 is fast)
      const baseGames = localSchedule.filter(g => {
          const d = new Date(g.date);
          return d.getFullYear() === y && d.getMonth() === m;
      });

      // 2. Create Map for DB Results (if available)
      const resultMap = new Map<string, any>();
      // Fix: Error in file views/ScheduleView.tsx on line 73: Property 'forEach' does not exist on type 'unknown'.
      // Added Array.isArray check to narrow type and allow forEach.
      if (userResults && Array.isArray(userResults)) {
          userResults.forEach((r: any) => resultMap.set(r.game_id, r));
      }

      // 3. Merge Local + DB
      // Priority: Local "Played" status (most recent sim) > DB Result > Base
      const mergedGames = baseGames.map(g => {
          // If local state says played (just simulated), rely on it.
          if (g.played) return g;

          // Otherwise check DB for historical results
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
  const asbStart = new Date(2026, 1, 13); 
  const asbEnd = new Date(2026, 1, 18);

  const filteredTeamsList = useMemo(() => {
    return teams
        .filter(t => (t.city + t.name).toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => a.city.localeCompare(b.city));
  }, [teams, searchTerm]);

  return (
    <div className="space-y-6 w-full flex flex-col pb-24 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-slate-800 pb-6 flex-shrink-0 relative z-30">
        <div>
           <div className="flex items-center gap-3">
             <h2 className="text-5xl font-black ko-tight text-slate-100 uppercase">시즌 일정</h2>
             {isDbLoading && <Loader2 className="animate-spin text-indigo-500" size={24} />}
           </div>
        </div>
        
        <div className="flex items-center gap-3">
            <div className="relative" ref={dropdownRef}>
                <button 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-64 h-12 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl px-4 flex items-center justify-between transition-all shadow-lg group"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        {selectedTeam ? (
                            <>
                                <img src={selectedTeam.logo} className="w-6 h-6 object-contain" alt={selectedTeam.name} />
                                <span className="font-bold text-white text-sm uppercase truncate">{selectedTeam.city} {selectedTeam.name}</span>
                            </>
                        ) : (
                            <span className="font-bold text-slate-500 text-sm">팀 선택...</span>
                        )}
                    </div>
                    <ChevronDown size={16} className={`text-slate-500 transition-transform group-hover:text-white flex-shrink-0 ml-2 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isDropdownOpen && (
                    <div className="absolute top-full right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50">
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
                                    <img src={t.logo} className="w-5 h-5 object-contain opacity-70 group-hover:opacity-100 transition-opacity" alt="" />
                                    <span className={`text-xs font-bold uppercase truncate ${selectedTeamId === t.id ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}>{t.city} {t.name}</span>
                                    {t.id === teamId && (
                                        <span className="ml-2 px-1.5 py-0.5 bg-red-600 text-[9px] font-black text-white rounded uppercase tracking-tighter shadow-sm">MY TEAM</span>
                                    )}
                                    {selectedTeamId === t.id && <CheckCircle2 size={14} className="ml-auto text-indigo-500 flex-shrink-0" />}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <button onClick={onExport} className="h-12 flex items-center gap-2 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black uppercase transition-all border border-emerald-500 shadow-lg shadow-emerald-900/20">
               <Save size={16} /> CSV로 저장
            </button>
        </div>
      </div>

      <div className="bg-slate-900/95 rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col relative z-10">
        <div className="px-6 py-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0 bg-slate-800/20">
           <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"><ChevronLeft size={24} /></button>
           <div className="flex items-center gap-3">
              <Calendar size={18} className="text-indigo-500" />
              <h3 className="text-xl font-black ko-tight text-white oswald uppercase tracking-wide">{currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</h3>
           </div>
           <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"><ChevronRight size={24} /></button>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/50 flex-shrink-0">
           {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
             <div key={day} className={`py-3 text-center text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-500'}`}>{day}</div>
           ))}
        </div>

        <div className="grid grid-cols-7">
           {days.map((day, idx) => {
             if (day === null) return <div key={idx} className="border-b border-r border-slate-800/50 bg-slate-950/20 aspect-square"></div>;
             
             const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
             const game = getGameOnDate(day); // O(1) Lookup
             const isToday = isTodayDate(day);
             const isASB = dayDate >= asbStart && dayDate <= asbEnd;

             const isHome = game?.homeTeamId === selectedTeamId;
             const oppId = isHome ? game?.awayTeamId : game?.homeTeamId;
             const opp = teams.find(t => t.id === oppId);
             
             // Base style based on Game Status
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
                            {/* Logo: Increased size */}
                            <img 
                                src={opp.logo} 
                                className="w-14 h-14 lg:w-20 lg:h-20 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300" 
                                alt="" 
                            />
                            
                            {/* Text: Centered below logo, larger font */}
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
      </div>
    </div>
  );
};