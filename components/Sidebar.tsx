
import React from 'react';
import { 
  LayoutDashboard, Users, Trophy, BarChart3, Swords, 
  Calendar as CalendarIcon, ArrowLeftRight, Clock, 
  RotateCcw, LogOut, FlaskConical 
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

// 1. Team Info Section Background Colors
const TEAM_INFO_BG_COLORS: Record<string, string> = {
  'atl': '#C8102E', 'bos': '#007A33', 'bkn': '#FFFFFF', 'cha': '#00778B', 'chi': '#CE1141', 'cle': '#6F263D',
  'dal': '#0050B5', 'den': '#0C2340', 'det': '#1d42ba', 'gsw': '#1D428A', 'hou': '#BA0C2F', 'ind': '#FFCD00',
  'lac': '#C8102E', 'lal': '#FDB927', 'mem': '#5D76A9', 'mia': '#862633', 'mil': '#2C5234', 'min': '#236192',
  'nop': '#C8102E', 'nyk': '#F58426', 'okc': '#007AC1', 'orl': '#0050B5', 'phi': '#006BB6', 'phx': '#1D1160',
  'por': '#C8102E', 'sac': '#5A2D81', 'sas': '#9EA2A2', 'tor': '#CE1141', 'uta': '#010101', 'was': '#0C2340'
};

// 2. Team Info Section Text Colors (New)
const TEAM_INFO_TEXT_COLORS: Record<string, string> = {
  'atl': '#FFFFFF', 'bos': '#FFFFFF', 'bkn': '#000000', 'cha': '#FFFFFF', 'chi': '#FFFFFF', 'cle': '#FFFFFF',
  'dal': '#FFFFFF', 'den': '#FFFFFF', 'det': '#FFFFFF', 'gsw': '#FFFFFF', 'hou': '#FFFFFF', 'ind': '#FFFFFF',
  'lac': '#FFFFFF', 'lal': '#FFFFFF', 'mem': '#FFFFFF', 'mia': '#FFFFFF', 'mil': '#FFFFFF', 'min': '#FFFFFF',
  'nop': '#FFFFFF', 'nyk': '#FFFFFF', 'okc': '#FFFFFF', 'orl': '#FFFFFF', 'phi': '#FFFFFF', 'phx': '#FFFFFF',
  'por': '#FFFFFF', 'sac': '#FFFFFF', 'sas': '#FFFFFF', 'tor': '#FFFFFF', 'uta': '#FFFFFF', 'was': '#FFFFFF'
};

// 3. Navigation Active State Background Colors
const TEAM_NAV_ACTIVE_COLORS: Record<string, string> = {
  'atl': '#C8102E', 'bos': '#007A33', 'bkn': '#FFFFFF', 'cha': '#00778B', 'chi': '#CE1141', 'cle': '#6F263D',
  'dal': '#0050B5', 'den': '#0C2340', 'det': '#1d42ba', 'gsw': '#1D428A', 'hou': '#CE1141', 'ind': '#FFCD00',
  'lac': '#C8102E', 'lal': '#FDB927', 'mem': '#5D76A9', 'mia': '#862633', 'mil': '#2C5234', 'min': '#236192',
  'nop': '#C8102E', 'nyk': '#006bb6', 'okc': '#007AC1', 'orl': '#0050B5', 'phi': '#006BB6', 'phx': '#1D1160',
  'por': '#C8102E', 'sac': '#5A2D81', 'sas': '#9EA2A2', 'tor': '#CE1141', 'uta': '#330072', 'was': '#0C2340'
};

// 4. Navigation Active State Text Colors (New)
const TEAM_NAV_TEXT_COLORS: Record<string, string> = {
  'atl': '#FFFFFF', 'bos': '#FFFFFF', 'bkn': '#000000', 'cha': '#FFFFFF', 'chi': '#FFFFFF', 'cle': '#FFFFFF',
  'dal': '#FFFFFF', 'den': '#FFFFFF', 'det': '#FFFFFF', 'gsw': '#FFFFFF', 'hou': '#FFFFFF', 'ind': '#FFFFFF',
  'lac': '#FFFFFF', 'lal': '#330072', 'mem': '#FFFFFF', 'mia': '#FFFFFF', 'mil': '#FFFFFF', 'min': '#FFFFFF',
  'nop': '#FFFFFF', 'nyk': '#FFFFFF', 'okc': '#FFFFFF', 'orl': '#FFFFFF', 'phi': '#FFFFFF', 'phx': '#FFFFFF',
  'por': '#FFFFFF', 'sac': '#FFFFFF', 'sas': '#FFFFFF', 'tor': '#FFFFFF', 'uta': '#FFFFFF', 'was': '#FFFFFF'
};

const NavItem: React.FC<{ active: boolean, icon: React.ReactNode, label: string, onClick: () => void, color: string, textColor: string }> = ({ active, icon, label, onClick, color, textColor }) => {
  // Convert Hex to RGB for opacity handling in shadows/hovers
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '79, 70, 229'; // Default Indigo
  };
  const rgb = hexToRgb(color);

  return (
    <button 
      onClick={onClick} 
      className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden ${
        active 
          ? 'shadow-lg ring-1' // Removed 'text-white' to allow dynamic color
          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
      }`}
      style={active ? {
        backgroundColor: color,
        color: textColor, // Apply Dynamic Text Color
        boxShadow: `0 10px 15px -3px rgba(${rgb}, 0.4)`,
        borderColor: `rgba(${rgb}, 0.3)`
      } : {}}
    >
      {/* Hover Effect for Inactive State - Text Color Change */}
      <span 
        className="transition-colors relative z-10"
        style={!active ? { color: 'inherit' } : {}}
      >
        {React.cloneElement(icon as React.ReactElement<any>, {
           color: active ? textColor : undefined, // Apply Dynamic Icon Color
           className: !active ? `transition-colors duration-300 group-hover:text-[${color}]` : ''
        })}
      </span>
      
      {/* Label */}
      <span className="text-sm font-bold ko-tight tracking-tight relative z-10">
        {label}
      </span>

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
  onNavigate, 
  onResetClick, 
  onLogout 
}) => {
  // Determine Colors
  const infoBgColor = team ? (TEAM_INFO_BG_COLORS[team.id] || '#4f46e5') : '#4f46e5';
  const infoTextColor = team ? (TEAM_INFO_TEXT_COLORS[team.id] || '#FFFFFF') : '#FFFFFF';
  
  const navActiveColor = team ? (TEAM_NAV_ACTIVE_COLORS[team.id] || '#4f46e5') : '#4f46e5';
  const navTextColor = team ? (TEAM_NAV_TEXT_COLORS[team.id] || '#FFFFFF') : '#FFFFFF';

  return (
    <aside className="w-72 border-r border-slate-800 bg-slate-900/95 flex flex-col shadow-2xl z-20 overflow-hidden transition-all duration-500">
      
      {/* Team Profile Section - Redesigned */}
      <div 
        className="p-8 border-b border-slate-800 relative overflow-hidden transition-colors duration-700"
        style={{ backgroundColor: infoBgColor }}
      >
        {/* Gradient Overlay for Depth & Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/5 via-black/10 to-black/40 pointer-events-none"></div>
        {/* Decorative Orb */}
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none mix-blend-overlay"></div>

        <div className="flex items-center gap-5 relative z-10">
          {/* Logo */}
          <img 
            src={team?.logo} 
            className="w-16 h-16 object-contain drop-shadow-2xl filter brightness-110 transform transition-transform hover:scale-105 duration-300" 
            alt="" 
          />
          
          <div className="min-w-0">
            <h2 
                className="font-black text-2xl leading-none uppercase oswald truncate drop-shadow-md"
                style={{ color: infoTextColor }}
            >
              {team?.name || 'NBA GM'}
            </h2>
            
            {/* Stats */}
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
          {/* Fixed Slate Color for Icon */}
          <Clock size={16} className="text-slate-400" />
          <span className="text-sm font-bold text-white oswald tracking-wider">{currentSimDate}</span>
        </div>
        {/* Fixed Green Color for Dot */}
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
        <NavItem 
          active={currentView === 'Playoffs'} 
          icon={<Swords size={20}/>} 
          label="플레이오프" 
          onClick={() => onNavigate('Playoffs')} 
          color={navActiveColor}
          textColor={navTextColor}
        />
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
        <NavItem 
          active={currentView === 'OvrCalculator'} 
          icon={<FlaskConical size={20}/>} 
          label="OVR 실험실" 
          onClick={() => onNavigate('OvrCalculator')} 
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
