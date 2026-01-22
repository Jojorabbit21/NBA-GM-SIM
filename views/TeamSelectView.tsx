
import React, { useMemo, useState, useEffect } from 'react';
import { Loader2, Wifi, WifiOff, RefreshCw, Database, FileSpreadsheet } from 'lucide-react';
import { Team } from '../types';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { logEvent } from '../services/analytics'; // Analytics Import

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

const LogoTeamButton: React.FC<{ team: Team, colorClass: string, onSelect: (id: string) => void }> = ({ team, colorClass, onSelect }) => (
  <button 
    onClick={() => {
        logEvent('Team Selection', 'Select', team.name); // Analytics Event
        onSelect(team.id);
    }} 
    className={`group relative flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 xl:w-20 xl:h-20 2xl:w-24 2xl:h-24 rounded-full bg-slate-900/40 border-2 border-slate-800 transition-all duration-300 hover:scale-125 hover:bg-slate-900 hover:z-50 hover:shadow-[0_0_30px_rgba(0,0,0,0.5)] ${colorClass}`}
    title={`${team.city} ${team.name}`}
  >
    <img src={team.logo} className="w-9 h-9 lg:w-10 lg:h-10 xl:w-12 xl:h-12 2xl:w-16 2xl:h-16 object-contain drop-shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]" alt={team.name} />
  </button>
);

export const TeamSelectView: React.FC<TeamSelectViewProps> = ({ teams, isInitializing, onSelectTeam, onReload, dataSource = 'DB' }) => {
  const eastTeams = useMemo(() => teams.filter(t => t.conference === 'East'), [teams]);
  const westTeams = useMemo(() => teams.filter(t => t.conference === 'West'), [teams]);
  const [isReloading, setIsReloading] = useState(false);
  const [loadingText, setLoadingText] = useState(LOADING_MESSAGES[0]);

  useEffect(() => {
    if (isInitializing) {
        // 초기 메시지도 랜덤으로 설정
        setLoadingText(LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);

        const interval = setInterval(() => {
            setLoadingText(prev => {
                let nextIndex;
                // 이전 메시지와 다른 메시지가 나올 때까지 랜덤 선택 (연속 중복 방지)
                do {
                    nextIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
                } while (LOADING_MESSAGES[nextIndex] === prev && LOADING_MESSAGES.length > 1);
                
                return LOADING_MESSAGES[nextIndex];
            });
        }, 800);
        return () => clearInterval(interval);
    }
  }, [isInitializing]);

  const handleReload = async () => {
      if (onReload) {
          logEvent('System', 'Force Reload DB'); // Analytics Event
          setIsReloading(true);
          await onReload();
          setTimeout(() => setIsReloading(false), 800);
      }
  };

  return (
    <div className="h-screen w-full bg-slate-950 flex flex-col overflow-hidden relative ko-normal pretendard selection:bg-indigo-500/30">
      
      {/* Loading Overlay */}
      {isInitializing && (
        <div className="fixed inset-0 bg-slate-950/90 z-[100] flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in duration-300">
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

      {/* Enhanced Header */}
      <header className="flex-shrink-0 h-32 border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center relative z-20">
        <div className="absolute right-8 top-8 flex flex-col gap-2 items-end">
            <div className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider flex items-center gap-2 ${dataSource === 'DB' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                {dataSource === 'DB' ? <Database size={12} /> : <FileSpreadsheet size={12} />}
                <span>Data Source: {dataSource === 'DB' ? 'LIVE DATABASE (SUPABASE)' : 'LOCAL CSV (FALLBACK)'}</span>
            </div>
            {onReload && (
                <button 
                    onClick={handleReload}
                    disabled={isReloading}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw size={12} className={isReloading ? 'animate-spin' : ''} />
                    <span>DB 강제 새로고침 (한글 이름 반영)</span>
                </button>
            )}
        </div>

        <div className="flex items-center gap-8">
          <img src="https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg" className="h-16 opacity-90 drop-shadow-2xl" alt="NBA" />
          <div className="h-12 w-[2px] bg-slate-700/50"></div>
          <div>
            <h1 className="text-5xl font-black bebas text-white tracking-widest leading-none drop-shadow-lg">
              NBA GM SIM <span className="text-indigo-500">2026</span>
            </h1>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.3em] leading-none mt-2 text-shadow-sm">
              Select Your Franchise
            </p>
          </div>
        </div>
      </header>

      {/* Split Main Content */}
      <div className="flex-1 flex relative min-h-0">
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-gradient-to-b from-slate-800 via-slate-700 to-slate-800 z-10 hidden lg:block"></div>
        
        {/* Eastern Conference (Left) */}
        <div className="flex-1 relative flex flex-col p-4 lg:p-8 border-r border-slate-800/50 min-h-0">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/10 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative z-10 flex flex-col h-full items-center justify-center gap-8">
            <h2 className="text-3xl font-extrabold uppercase tracking-tighter text-blue-100 flex items-center gap-3">동부 컨퍼런스</h2>
            <div className="grid grid-cols-5 gap-3 lg:gap-5 xl:gap-8 content-center">
              {eastTeams.map(t => (
                <LogoTeamButton key={t.id} team={t} colorClass="hover:border-blue-400" onSelect={onSelectTeam} />
              ))}
            </div>
          </div>
        </div>

        {/* Western Conference (Right) */}
        <div className="flex-1 relative flex flex-col p-4 lg:p-8 min-h-0">
          <div className="absolute inset-0 bg-gradient-to-bl from-red-900/10 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative z-10 flex flex-col h-full items-center justify-center gap-8">
            <h2 className="text-3xl font-extrabold uppercase tracking-tighter text-red-100 flex items-center gap-3">서부 컨퍼런스</h2>
            <div className="grid grid-cols-5 gap-3 lg:gap-5 xl:gap-8 content-center">
              {westTeams.map(t => (
                <LogoTeamButton key={t.id} team={t} colorClass="hover:border-red-400" onSelect={onSelectTeam} />
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-shrink-0 h-8 bg-slate-950 border-t border-slate-900 flex items-center justify-between px-6 text-[10px] font-bold text-slate-600 uppercase tracking-widest z-20 relative">
        <span>Season 2025-26 &bull; Korean Translation Database Active</span>
        <div className={`flex items-center gap-2 ${isSupabaseConfigured ? 'text-emerald-500' : 'text-red-500'}`}>
            {isSupabaseConfigured ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{isSupabaseConfigured ? 'SERVER CONNECTED' : 'SERVER DISCONNECTED'}</span>
        </div>
      </div>
    </div>
  );
};
