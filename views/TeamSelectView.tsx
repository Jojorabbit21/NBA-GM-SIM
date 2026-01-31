
import React, { useMemo, useState, useEffect } from 'react';
import { Loader2, Wifi, WifiOff, Trophy, ChevronRight } from 'lucide-react';
import { Team } from '../types';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { logEvent } from '../services/analytics';

interface TeamSelectViewProps {
  teams: Team[];
  isInitializing: boolean;
  onSelectTeam: (id: string) => void;
  onReload?: () => void;
  dataSource?: 'DB' | 'CSV';
}

const LOADING_MESSAGES = [
    "라커룸을 청소하는 중...", "농구공에 바람 넣는 중...", "림에 새 그물을 다는 중...", "전술 보드를 닦는 중...",
    "선수들 유니폼 다림질 중...", "스카우팅 리포트 인쇄 중...", "경기장 조명 예열 중...", "마스코트 춤 연습 시키는 중...",
    "치어리더 대형 맞추는 중...", "단장님 명패 닦는 중..."
];

// Team Primary Colors
const TEAM_BG_COLORS: Record<string, string> = {
  'atl': '#C8102E', 'bos': '#007A33', 'bkn': '#000000', 'cha': '#1D1160', 'chi': '#CE1141',
  'cle': '#860038', 'dal': '#00538C', 'den': '#0E2240', 'det': '#C8102E', 'gsw': '#1D428A',
  'hou': '#CE1141', 'ind': '#002D62', 'lac': '#C8102E', 'lal': '#552583', 'mem': '#5D76A9',
  'mia': '#98002E', 'mil': '#00471B', 'min': '#0C2340', 'nop': '#0A2240', 'nyk': '#006BB6',
  'okc': '#007AC1', 'orl': '#0077C0', 'phi': '#006BB6', 'phx': '#1D1160', 'por': '#E03A3E',
  'sac': '#5A2D81', 'sas': '#C4CED4', 'tor': '#CE1141', 'uta': '#002B5C', 'was': '#002B5C'
};

const TeamGridCell: React.FC<{ team: Team; onSelect: (id: string) => void }> = ({ team, onSelect }) => {
  const bgColor = TEAM_BG_COLORS[team.id] || '#1f2937';

  return (
    <button
      onClick={() => {
        logEvent('Team Selection', 'Select', team.name);
        onSelect(team.id);
      }}
      className="relative w-full h-full group overflow-hidden border-r border-b border-black/10 focus:outline-none focus:z-10 focus:ring-4 focus:ring-indigo-500"
      style={{ backgroundColor: bgColor }}
    >
      {/* Dark Overlay (Default: Visible, Hover: Invisible) */}
      <div className="absolute inset-0 bg-slate-950/60 group-hover:bg-slate-950/0 transition-colors duration-300 ease-out" />
      
      {/* Glossy Effect on Hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-gradient-to-tr from-white/0 via-white/40 to-white/0" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-2">
        <img 
          src={team.logo} 
          className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 object-contain drop-shadow-xl transform transition-transform duration-300 ease-out group-hover:scale-125 group-hover:-translate-y-2" 
          alt={team.name} 
        />
        
        {/* Text Container (Reveals on Hover) */}
        <div className="absolute bottom-2 left-0 right-0 text-center opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 ease-out">
            <span className="block text-[8px] sm:text-[10px] font-bold text-white/80 uppercase tracking-widest leading-none mb-0.5">{team.city}</span>
            <span className="block text-xs sm:text-sm lg:text-base font-black text-white uppercase tracking-tight leading-none oswald text-shadow-md">{team.name}</span>
        </div>
      </div>
    </button>
  );
};

export const TeamSelectView: React.FC<TeamSelectViewProps> = ({ teams, isInitializing, onSelectTeam }) => {
  const eastTeams = useMemo(() => teams.filter(t => t.conference === 'East'), [teams]);
  const westTeams = useMemo(() => teams.filter(t => t.conference === 'West'), [teams]);
  const [loadingText, setLoadingText] = useState(LOADING_MESSAGES[0]);

  useEffect(() => {
    if (isInitializing) {
        setLoadingText(LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);
        const interval = setInterval(() => {
            setLoadingText(prev => {
                let nextIndex;
                do {
                    nextIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
                } while (LOADING_MESSAGES[nextIndex] === prev && LOADING_MESSAGES.length > 1);
                return LOADING_MESSAGES[nextIndex];
            });
        }, 800);
        return () => clearInterval(interval);
    }
  }, [isInitializing]);

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col relative overflow-hidden ko-normal pretendard">
      
      {/* 1. Header Section */}
      <header className="flex-shrink-0 h-20 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 lg:px-10 z-20 shadow-lg relative">
          <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 transform rotate-3">
                  <Trophy className="text-white" size={24} />
              </div>
              <div>
                  <h1 className="text-2xl lg:text-3xl font-black text-white uppercase italic tracking-tighter leading-none">
                      NBA GM <span className="text-indigo-500">Simulator</span>
                  </h1>
                  <p className="text-xs text-slate-500 font-bold tracking-[0.2em] mt-1">2025-26 Season</p>
              </div>
          </div>

          <div className="flex items-center gap-4 lg:gap-8">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${isSupabaseConfigured ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400' : 'bg-red-950/30 border-red-500/30 text-red-400'}`}>
                  {isSupabaseConfigured ? <Wifi size={14} /> : <WifiOff size={14} />}
                  <span className="text-[10px] font-black uppercase tracking-wider">{isSupabaseConfigured ? 'Online' : 'Offline'}</span>
              </div>
              <div className="text-right hidden sm:block">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Select Your Team</div>
                  <div className="text-sm font-black text-white">Choose a Franchise to Manage</div>
              </div>
          </div>
      </header>

      {/* 2. Loading Overlay */}
      {isInitializing && (
        <div className="absolute inset-0 bg-slate-950/90 z-[100] flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in duration-300">
           <div className="text-center space-y-8">
             <Loader2 size={60} className="text-indigo-500 animate-spin mx-auto opacity-80" />
             <p className="text-2xl font-black pretendard text-white tracking-tight animate-pulse leading-relaxed px-4">
                 {loadingText}
             </p>
           </div>
        </div>
      )}

      {/* 3. Main Content Area (Split Grid) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Western Conference */}
        <div className="w-1/2 flex flex-col border-r border-slate-800 relative group/west">
            {/* Conference Header Overlay */}
            <div className="absolute top-0 left-0 w-full py-2 bg-gradient-to-b from-black/90 to-transparent z-20 pointer-events-none flex items-center justify-center">
                <span className="text-red-500 font-black text-sm lg:text-xl uppercase tracking-[0.3em] drop-shadow-md flex items-center gap-3">
                   Western Conference
                </span>
            </div>
            
            {/* Grid */}
            <div className="flex-1 grid grid-cols-3 grid-rows-5 w-full h-full bg-slate-900">
                {westTeams.map(t => (
                    <TeamGridCell key={t.id} team={t} onSelect={onSelectTeam} />
                ))}
            </div>
        </div>

        {/* Right: Eastern Conference */}
        <div className="w-1/2 flex flex-col relative group/east">
             {/* Conference Header Overlay */}
             <div className="absolute top-0 left-0 w-full py-2 bg-gradient-to-b from-black/90 to-transparent z-20 pointer-events-none flex items-center justify-center">
                <span className="text-blue-500 font-black text-sm lg:text-xl uppercase tracking-[0.3em] drop-shadow-md flex items-center gap-3">
                   Eastern Conference
                </span>
            </div>

            {/* Grid */}
            <div className="flex-1 grid grid-cols-3 grid-rows-5 w-full h-full bg-slate-900">
                {eastTeams.map(t => (
                    <TeamGridCell key={t.id} team={t} onSelect={onSelectTeam} />
                ))}
            </div>
        </div>

      </div>
    </div>
  );
};
