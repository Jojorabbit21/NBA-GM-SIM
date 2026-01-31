
import React, { useMemo, useState, useEffect } from 'react';
import { Loader2, Wifi, WifiOff, Trophy } from 'lucide-react';
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
    "라커룸을 청소하는 중...",
    "농구공에 바람 넣는 중...",
    "림에 새 그물을 다는 중...",
    "전술 보드를 닦는 중...",
    "선수들 유니폼 다림질 중...",
    "스카우팅 리포트 인쇄 중...",
    "경기장 조명 예열 중...",
    "마스코트 춤 연습 시키는 중...",
    "치어리더 대형 맞추는 중...",
    "단장님 명패 닦는 중..."
];

// Team Primary Colors for Backgrounds
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
      {/* Dark Overlay that vanishes on hover */}
      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/0 transition-colors duration-500 ease-in-out" />
      
      {/* Background Ambience */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-700 bg-gradient-to-tr from-white/0 via-white/30 to-white/0" />

      {/* Content Container */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-4">
        {/* Logo */}
        <img 
          src={team.logo} 
          className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 object-contain drop-shadow-2xl transform transition-transform duration-500 ease-out group-hover:scale-125 group-hover:-translate-y-2" 
          alt={team.name} 
        />
        
        {/* Team Name (Appears on Hover) */}
        <div className="absolute bottom-6 opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 ease-out">
            <div className="text-center">
                <span className="block text-[10px] font-bold text-white/80 uppercase tracking-widest leading-none">{team.city}</span>
                <span className="block text-lg font-black text-white uppercase tracking-tight leading-none oswald text-shadow-md">{team.name}</span>
            </div>
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
      
      {/* Loading Overlay */}
      {isInitializing && (
        <div className="fixed inset-0 bg-slate-950/95 z-[100] flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in duration-300">
           <div className="text-center space-y-8">
             <Loader2 size={80} className="text-indigo-500 animate-spin mx-auto opacity-50" />
             <div className="space-y-3">
               <p className="text-3xl md:text-4xl font-black pretendard text-white tracking-tight animate-pulse leading-relaxed">
                 {loadingText}
               </p>
             </div>
           </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex relative">
        
        {/* WEST Conference (Left Side) */}
        <div className="w-1/2 h-full flex flex-col relative">
            {/* Conference Label Overlay */}
            <div className="absolute top-4 left-6 z-20 pointer-events-none opacity-50">
                <h2 className="text-6xl font-black text-white/10 uppercase tracking-tighter leading-none select-none">WEST</h2>
            </div>
            
            <div className="grid grid-cols-3 grid-rows-5 w-full h-full">
                {westTeams.map(t => (
                    <TeamGridCell key={t.id} team={t} onSelect={onSelectTeam} />
                ))}
            </div>
        </div>

        {/* EAST Conference (Right Side) */}
        <div className="w-1/2 h-full flex flex-col relative">
             {/* Conference Label Overlay */}
             <div className="absolute top-4 right-6 z-20 pointer-events-none opacity-50 text-right">
                <h2 className="text-6xl font-black text-white/10 uppercase tracking-tighter leading-none select-none">EAST</h2>
            </div>

            <div className="grid grid-cols-3 grid-rows-5 w-full h-full">
                {eastTeams.map(t => (
                    <TeamGridCell key={t.id} team={t} onSelect={onSelectTeam} />
                ))}
            </div>
        </div>

        {/* Center Divider / Header Overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-30">
             <div className="bg-slate-950/80 backdrop-blur-md border border-white/10 px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center transform hover:scale-105 transition-transform duration-500 pointer-events-auto">
                <div className="flex items-center gap-3 mb-2">
                    <img src="https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg" className="h-8 opacity-80" alt="NBA" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest border-l border-slate-600 pl-3">Season 2025-26</span>
                </div>
                <h1 className="text-4xl lg:text-5xl font-black bebas text-white tracking-widest leading-none drop-shadow-lg text-center">
                  SELECT <span className="text-indigo-500">FRANCHISE</span>
                </h1>
             </div>
        </div>

      </div>

      {/* Footer Status Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-slate-950/80 backdrop-blur-sm border-t border-white/5 flex items-center justify-between px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest z-40 pointer-events-none">
        <div className="flex items-center gap-2">
            <Trophy size={12} className="text-yellow-500" />
            <span>Road to the Championship</span>
        </div>
        <div className={`flex items-center gap-2 ${isSupabaseConfigured ? 'text-emerald-500' : 'text-red-500'}`}>
            {isSupabaseConfigured ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{isSupabaseConfigured ? 'DB Connected' : 'Offline Mode'}</span>
        </div>
      </div>

    </div>
  );
};
