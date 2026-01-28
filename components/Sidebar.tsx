
import React from 'react';
import { 
  LayoutDashboard, Users, Trophy, BarChart3, Swords, 
  Calendar as CalendarIcon, ArrowLeftRight, Clock, 
  RotateCcw, LogOut, FlaskConical, UserCircle
} from 'lucide-react';
import { Team, AppView } from '../types';

interface SidebarProps {
  team: Team | undefined;
  currentSimDate: string;
  currentView: AppView;
  isGuestMode: boolean;
  onNavigate: (view: AppView) => void;
  onResetClick: () => void;
  onLogout: () => void;
}

const NavItem: React.FC<{ active: boolean, icon: React.ReactNode, label: string, onClick: () => void }> = ({ active, icon, label, onClick }) => (
  <button 
    onClick={onClick} 
    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-200 group ${
      active 
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/30' 
        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
    }`}
  >
    <span className={`${active ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'} transition-colors`}>
      {icon}
    </span>
    <span className="text-sm font-bold ko-tight tracking-tight">{label}</span>
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({ 
  team, 
  currentSimDate, 
  currentView, 
  isGuestMode, 
  onNavigate, 
  onResetClick, 
  onLogout 
}) => {
  return (
    <aside className="w-72 border-r border-slate-800 bg-slate-900/95 flex flex-col shadow-2xl z-20 overflow-hidden">
      {/* Team Profile Section */}
      <div className="p-8 border-b border-slate-800 bg-slate-950/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-950 rounded-xl p-2 border border-slate-800 shadow-inner flex items-center justify-center">
            {team?.logo ? (
              <img src={team.logo} className="w-full h-full object-contain" alt="" />
            ) : (
              <UserCircle className="text-slate-700" size={32} />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-lg leading-tight uppercase oswald text-white truncate">
              {team?.name || 'NBA GENERAL MANAGER'}
            </h2>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {team ? `${team.wins}W - ${team.losses}L` : 'SEASON 2025-26'}
            </span>
          </div>
        </div>
      </div>

      {/* Date Ticker */}
      <div className="px-8 py-5 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Clock className="text-indigo-400" size={16} />
          <span className="text-sm font-bold text-white oswald tracking-wider">{currentSimDate}</span>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-6 space-y-2 overflow-y-auto custom-scrollbar">
        <NavItem 
          active={currentView === 'Dashboard'} 
          icon={<LayoutDashboard size={20}/>} 
          label="라커룸" 
          onClick={() => onNavigate('Dashboard')} 
        />
        <NavItem 
          active={currentView === 'Roster'} 
          icon={<Users size={20}/>} 
          label="로스터 & 기록" 
          onClick={() => onNavigate('Roster')} 
        />
        <NavItem 
          active={currentView === 'Standings'} 
          icon={<Trophy size={20}/>} 
          label="순위표" 
          onClick={() => onNavigate('Standings')} 
        />
        <NavItem 
          active={currentView === 'Leaderboard'} 
          icon={<BarChart3 size={20}/>} 
          label="리더보드" 
          onClick={() => onNavigate('Leaderboard')} 
        />
        <NavItem 
          active={currentView === 'Playoffs'} 
          icon={<Swords size={20}/>} 
          label="플레이오프" 
          onClick={() => onNavigate('Playoffs')} 
        />
        <NavItem 
          active={currentView === 'Schedule'} 
          icon={<CalendarIcon size={20}/>} 
          label="일정" 
          onClick={() => onNavigate('Schedule')} 
        />
        <NavItem 
          active={currentView === 'Transactions'} 
          icon={<ArrowLeftRight size={20}/>} 
          label="트레이드" 
          onClick={() => onNavigate('Transactions')} 
        />
        <NavItem 
          active={currentView === 'OvrCalculator'} 
          icon={<FlaskConical size={20}/>} 
          label="OVR 실험실" 
          onClick={() => onNavigate('OvrCalculator')} 
        />
      </nav>

      {/* System Menu Section */}
      <div className="p-6 border-t border-slate-800 bg-slate-950/40 space-y-2">
        <button 
          onClick={onResetClick}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-400/5 transition-all group"
        >
          <RotateCcw size={18} className="group-hover:rotate-[-90deg] transition-transform duration-500" />
          <span className="text-xs font-black uppercase tracking-widest ko-tight">데이터 초기화</span>
        </button>
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition-all group"
        >
          <LogOut size={18} className="group-hover:translate-x-1 transition-transform" />
          <span className="text-xs font-black uppercase tracking-widest ko-tight">
            {isGuestMode ? '로그인으로 이동' : '로그아웃'}
          </span>
        </button>
      </div>
    </aside>
  );
};
