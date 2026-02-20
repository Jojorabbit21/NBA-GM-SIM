
import React from 'react';
import {
  LayoutDashboard, Users, Trophy, BarChart3, Swords,
  Calendar as CalendarIcon, ArrowLeftRight, Clock,
  RotateCcw, LogOut, Mail
} from 'lucide-react';
import { Team, AppView } from '../types';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from './common/TeamLogo';

interface SidebarProps {
  team: Team | undefined;
  currentSimDate: string;
  currentView: AppView;
  isGuestMode: boolean;
  unreadMessagesCount: number;
  isRegularSeasonOver: boolean;
  onNavigate: (view: AppView) => void;
  onResetClick: () => void;
  onLogout: () => void;
}

const NavItem: React.FC<{ active: boolean, icon: React.ReactNode, label: string, onClick: () => void, color: string, textColor: string, badge?: number }> = ({ active, icon, label, onClick, color, textColor, badge }) => {
  // Convert Hex to RGB for opacity handling in shadows/hovers
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '79, 70, 229'; // Default Indigo
  };
  const rgb = hexToRgb(color);

  return (
    <button 
      onClick={onClick} 
      className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden ${
        active 
          ? 'shadow-lg ring-1' 
          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
      }`}
      style={active ? {
        backgroundColor: color,
        color: textColor, // Apply Dynamic Text Color
        boxShadow: `0 10px 15px -3px rgba(${rgb}, 0.4)`,
        borderColor: `rgba(${rgb}, 0.3)`
      } : {}}
    >
      <div className="flex items-center gap-4 relative z-10">
          {/* Hover Effect for Inactive State - Text Color Change */}
          <span 
            className="transition-colors"
            style={!active ? { color: 'inherit' } : {}}
          >
            {React.cloneElement(icon as React.ReactElement<any>, {
               color: active ? textColor : undefined, // Apply Dynamic Icon Color
               className: !active ? `transition-colors duration-300 group-hover:text-[${color}]` : ''
            })}
          </span>
          
          {/* Label */}
          <span className="text-sm font-bold ko-tight tracking-tight">
            {label}
          </span>
      </div>

      {badge !== undefined && badge > 0 && (
          <span className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white animate-in zoom-in duration-300">
             {badge > 9 ? '9+' : badge}
          </span>
      )}

      {/* Subtle shine effect for active items */}
      {active && (
        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-50 pointer-events-none"></div>
      )}
    </button>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  team,
  currentSimDate,
  currentView,
  isGuestMode,
  unreadMessagesCount,
  isRegularSeasonOver,
  onNavigate,
  onResetClick,
  onLogout
}) => {
  
  const teamStatic = team ? TEAM_DATA[team.id] : null;

  // Determine Colors using unified TEAM_DATA
  const infoBgColor = teamStatic ? teamStatic.colors.primary : '#4f46e5';
  const infoTextColor = teamStatic ? teamStatic.colors.text : '#FFFFFF';
  
  // Use same primary color for Nav active state, or fallback
  const navActiveColor = teamStatic ? teamStatic.colors.primary : '#4f46e5';
  const navTextColor = teamStatic ? teamStatic.colors.text : '#FFFFFF';

  return (
    <aside className="w-72 border-r border-slate-800 bg-slate-900/95 flex flex-col shadow-2xl z-20 overflow-hidden transition-all duration-500">
      
      {/* Team Profile Section */}
      <div 
        className="p-8 border-b border-slate-800 relative overflow-hidden transition-colors duration-700"
        style={{ backgroundColor: infoBgColor }}
      >
        <div className="flex items-center gap-5 relative z-10">
          <TeamLogo 
            teamId={team?.id || ''} 
            size="custom"
            className="w-16 h-16 drop-shadow-2xl filter brightness-110 transform transition-transform hover:scale-105 duration-300" 
          />
          <div className="min-w-0">
            <h2 
                className="font-black text-2xl leading-none uppercase oswald truncate drop-shadow-md"
                style={{ color: infoTextColor }}
            >
              {team?.name || 'NBA GM'}
            </h2>
            <span 
                className="text-xs font-black uppercase tracking-widest mt-1.5 inline-block drop-shadow-sm opacity-90"
                style={{ color: infoTextColor }}
            >
              {team?.wins || 0}W - {team?.losses || 0}L
            </span>
          </div>
        </div>
      </div>

      {/* Date Ticker */}
      <div className="px-8 py-5 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Clock size={16} className="text-slate-400" />
          <span className="text-sm font-bold text-white oswald tracking-wider">{currentSimDate}</span>
        </div>
        <div className="w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)] bg-emerald-500"></div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-6 space-y-2 overflow-y-auto custom-scrollbar">
        <NavItem 
          active={currentView === 'Dashboard'} 
          icon={<LayoutDashboard size={20}/>} 
          label="라커룸" 
          onClick={() => onNavigate('Dashboard')} 
          color={navActiveColor}
          textColor={navTextColor}
        />
        {/* Inbox Added */}
        <NavItem 
          active={currentView === 'Inbox'} 
          icon={<Mail size={20}/>} 
          label="받은 메세지" 
          onClick={() => onNavigate('Inbox')} 
          color={navActiveColor}
          textColor={navTextColor}
          badge={unreadMessagesCount}
        />
        <NavItem 
          active={currentView === 'Roster'} 
          icon={<Users size={20}/>} 
          label="로스터 & 기록" 
          onClick={() => onNavigate('Roster')} 
          color={navActiveColor}
          textColor={navTextColor}
        />
        <NavItem 
          active={currentView === 'Standings'} 
          icon={<Trophy size={20}/>} 
          label="순위표" 
          onClick={() => onNavigate('Standings')} 
          color={navActiveColor}
          textColor={navTextColor}
        />
        <NavItem 
          active={currentView === 'Leaderboard'} 
          icon={<BarChart3 size={20}/>} 
          label="리더보드" 
          onClick={() => onNavigate('Leaderboard')} 
          color={navActiveColor}
          textColor={navTextColor}
        />
        {isRegularSeasonOver && (
          <NavItem
            active={currentView === 'Playoffs'}
            icon={<Swords size={20}/>}
            label="플레이오프"
            onClick={() => onNavigate('Playoffs')}
            color={navActiveColor}
            textColor={navTextColor}
          />
        )}
        <NavItem 
          active={currentView === 'Schedule'} 
          icon={<CalendarIcon size={20}/>} 
          label="일정" 
          onClick={() => onNavigate('Schedule')} 
          color={navActiveColor}
          textColor={navTextColor}
        />
        <NavItem 
          active={currentView === 'Transactions'} 
          icon={<ArrowLeftRight size={20}/>} 
          label="트레이드" 
          onClick={() => onNavigate('Transactions')} 
          color={navActiveColor}
          textColor={navTextColor}
        />
      </nav>

      {/* System Menu Section */}
      <div className="p-6 border-t border-slate-800 bg-slate-900/40 space-y-2">
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
