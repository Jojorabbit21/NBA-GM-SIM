
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Save, Calendar, CheckCircle2, Search, ChevronDown } from 'lucide-react';
import { Team, Game } from '../types';

interface ScheduleViewProps {
  schedule: Game[];
  teamId: string;
  teams: Team[];
  onExport: () => void;
  currentSimDate: string;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({ schedule, teamId, teams, onExport, currentSimDate }) => {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 9, 1)); 
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teamId);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredGames = schedule.filter(g => (g.homeTeamId === selectedTeamId || g.awayTeamId === selectedTeamId));

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

  const days = Array.from({ length: 42 }, (_, i) => {
    const day = i - start + 1;
    return (day > 0 && day <= total) ? day : null;
  });

  const getGameOnDate = (day: number) => {
    const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const yyyy = dayDate.getFullYear();
    const mm = String(dayDate.getMonth() + 1).padStart(2, '0');
    const dd = String(dayDate.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    return filteredGames.find(g => g.date === dateStr);
  };

  const isTodayDate = (day: number) => {
    const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const yyyy = dayDate.getFullYear();
    const mm = String(dayDate.getMonth() + 1).padStart(2, '0');
    const dd = String(dayDate.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(currentSimDate)) {
        return dateStr === currentSimDate;
    }
    
    const simDateObj = new Date(currentSimDate);
    return dayDate.getFullYear() === simDateObj.getFullYear() &&
           dayDate.getMonth() === simDateObj.getMonth() &&
           dayDate.getDate() === simDateObj.getDate();
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
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-slate-800 pb-6 flex-shrink-0 relative z-30">
        <div>
           <div className="flex items-center gap-3">
             <h2 className="text-5xl font-black ko-tight text-slate-100 uppercase">시즌 일정</h2>
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

      <div className="bg-slate-900/80 rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden backdrop-blur-sm flex-1 min-h-[600px] flex flex-col relative z-10">
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

        <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
           {days.map((day, idx) => {
             if (day === null) return <div key={idx} className="border-b border-r border-slate-800/50 bg-slate-950/20"></div>;
             
             const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
             const game = getGameOnDate(day);
             const isToday = isTodayDate(day);
             const isASB = dayDate >= asbStart && dayDate <= asbEnd;

             const isHome = game?.homeTeamId === selectedTeamId;
             const oppId = isHome ? game?.awayTeamId : game?.homeTeamId;
             const opp = teams.find(t => t.id === oppId);
             
             let bgStyle = isToday ? "bg-indigo-500/10 ring-1 ring-indigo-500/80 z-10" : "bg-slate-950/40";
             let isWon = false;

             if (game?.played) {
                isWon = isHome ? (game.homeScore! > game.awayScore!) : (game.awayScore! > game.homeScore!);
                bgStyle = isWon ? 'bg-emerald-900/50 border-emerald-500/30' : 'bg-red-900/50 border-red-500/30';
             } else if (game) {
                bgStyle = 'bg-slate-800/40 hover:bg-slate-800/60';
             }

             return (
               <div key={idx} className={`border-b border-r border-slate-800/60 relative p-2 transition-all flex flex-col ${bgStyle}`}>
                 <div className="flex justify-between items-start mb-1">
                    <span className={`text-xs font-black oswald ${isToday ? 'text-indigo-400' : 'text-slate-500'}`}>{day}</span>
                    {isToday && <span className="px-1 py-0.5 bg-indigo-600 text-[6px] font-black text-white rounded">TODAY</span>}
                    {isASB && !isToday && <span className="text-[6px] font-black text-yellow-500 uppercase tracking-tight">ALL-STAR</span>}
                 </div>
                 
                 {game && opp ? (
                   <div className="flex-1 flex flex-col items-center justify-center gap-1 group cursor-default w-full">
                      {!game.played ? (
                        <>
                            <div className="relative flex-1 flex items-center justify-center w-full">
                                <img src={opp.logo} className="w-10 h-10 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300" alt="" />
                            </div>
                            <div className="text-center w-full relative z-10">
                                <div className="text-[10px] font-black text-slate-200 truncate w-full px-1 uppercase tracking-tight">
                                    <span className={`${isHome ? 'text-indigo-400' : 'text-slate-500'} mr-0.5`}>{isHome ? 'vs' : '@'}</span>{opp.name}
                                </div>
                            </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center w-full h-full gap-1">
                            <div className="text-sm font-black text-white w-full text-center uppercase tracking-tight leading-tight break-keep">
                                <span className="text-[10px] text-slate-400 mr-1 align-middle">{isHome ? 'vs' : '@'}</span>{opp.name}
                            </div>
                            <div className={`text-lg font-black oswald leading-none ${isWon ? 'text-emerald-300' : 'text-red-300'}`}>
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
