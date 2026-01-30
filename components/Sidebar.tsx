
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

// NBA Team Primary Colors
const TEAM_COLORS: Record<string, string> = {
  'atl': '#C8102E', 'bos': '#007A33', 'bkn': '#FFFFFF', 'cha': '#1D1160', 'chi': '#CE1141', 'cle': '#860038',
  'dal': '#00538C', 'den': '#FEC524', 'det': '#C8102E', 'gsw': '#1D428A', 'hou': '#CE1141', 'ind': '#FDBB30',
  'lac': '#1D428A', 'lal': '#FDB927', 'mem': '#5D76A9', 'mia': '#98002E', 'mil': '#00471B', 'min': '#236192',
  'nop': '#85714D', 'nyk': '#F58426', 'okc': '#007AC1', 'orl': '#0077C0', 'phi': '#006BB6', 'phx': '#1D1160',
  'por': '#E03A3E', 'sac': '#5A2D81', 'sas': '#C4CED4', 'tor': '#CE1141', 'uta': '#002B5C', 'was': '#002B5C'
};

const NavItem: React.FC<{ active: boolean, icon: React.ReactNode, label: string, onClick: () => void, color: string }> = ({ active, icon, label, onClick, color }) => {
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
          ? 'text-white shadow-lg ring-1' 
          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
      }`}
      style={active ? {
        backgroundColor: color,
        boxShadow: `0 10px 15px -3px rgba(${rgb}, 0.4)`,
        borderColor: `rgba(${rgb}, 0.3)`
      } : {}}
    >
      {/* Hover Effect for Inactive State - Text Color Change */}
      <span 
        className="transition-colors relative z-10"
        style={!active ? { color: 'inherit' } : {}}
      >
        {/* If not active, apply color on hover via inline style or CSS variable, 
            but for simplicity here we use group-hover with dynamic style on parent */}
        {React.cloneElement(icon as React.ReactElement<any>, {
           color: active ? 'white' : undefined, // Reset icon color if active
           className: !active ? `transition-colors duration-300 group-hover:text-[${color}]` : ''
        })}
      </span>
      
      {/* Label */}
      <span className="text-sm font-bold ko-tight tracking-tight relative z-10" style={!active ? {} : {}}>
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
  // Determine Team Color
  const teamColor = team ? (TEAM_COLORS[team.id] || '#4f46e5') : '#4f46e5';

  return (
    // [Optimization] bg-slate-900/60 -> bg-slate-900/95 (Almost opaque to save GPU)
    <aside className="w-72 border-r border-slate-800 bg-slate-900/95 flex flex-col shadow-2xl z-20 overflow-hidden">
      {/* Team Profile Section */}
      <div className="p-8 border-b border-slate-800 bg-slate-950/20 relative">
        {/* Dynamic ambient glow based on team color */}
        <div 
            className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full blur-[60px] opacity-10 pointer-events-none"
            style={{ backgroundColor: teamColor }}
        ></div>

        <div className="flex items-center gap-4 relative z-10">
          <div 
            className="w-14 h-14 bg-slate-950 rounded-2xl p-2 border shadow-lg flex items-center justify-center transition-all duration-500"
            style={{ borderColor: `${teamColor}40`, boxShadow: `0 0 15px ${teamColor}20` }}
          >
            <img src={team?.logo} className="w-full h-full object-contain drop-shadow-md" alt="" />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-lg leading-tight uppercase oswald text-white truncate">{team?.name || 'NBA GM'}</h2>
            <span 
                className="text-[10px] font-black uppercase tracking-widest mt-1 inline-block"
                style={{ color: teamColor }}
            >
              {team?.wins || 0}W - {team?.losses || 0}L
            </span>
          </div>
        </div>
      </div>

      {/* Date Ticker */}
      <div className="px-8 py-5 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Clock size={16} style={{ color: teamColor }} />
          <span className="text-sm font-bold text-white oswald tracking-wider">{currentSimDate}</span>
        </div>
        <div 
            className="w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_currentColor]"
            style={{ backgroundColor: teamColor, color: teamColor }}
        ></div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-6 space-y-2 overflow-y-auto custom-scrollbar">
        <NavItem 
          active={currentView === 'Dashboard'} 
          icon={<LayoutDashboard size={20}/>} 
          label="라커룸" 
          onClick={() => onNavigate('Dashboard')} 
          color={teamColor}
        />
        <NavItem 
          active={currentView === 'Roster'} 
          icon={<Users size={20}/>} 
          label="로스터 & 기록" 
          onClick={() => onNavigate('Roster')} 
          color={teamColor}
        />
        <NavItem 
          active={currentView === 'Standings'} 
          icon={<Trophy size={20}/>} 
          label="순위표" 
          onClick={() => onNavigate('Standings')} 
          color={teamColor}
        />
        <NavItem 
          active={currentView === 'Leaderboard'} 
          icon={<BarChart3 size={20}/>} 
          label="리더보드" 
          onClick={() => onNavigate('Leaderboard')} 
          color={teamColor}
        />
        <NavItem 
          active={currentView === 'Playoffs'} 
          icon={<Swords size={20}/>} 
          label="플레이오프" 
          onClick={() => onNavigate('Playoffs')} 
          color={teamColor}
        />
        <NavItem 
          active={currentView === 'Schedule'} 
          icon={<CalendarIcon size={20}/>} 
          label="일정" 
          onClick={() => onNavigate('Schedule')} 
          color={teamColor}
        />
        <NavItem 
          active={currentView === 'Transactions'} 
          icon={<ArrowLeftRight size={20}/>} 
          label="트레이드" 
          onClick={() => onNavigate('Transactions')} 
          color={teamColor}
        />
        <NavItem 
          active={currentView === 'OvrCalculator'} 
          icon={<FlaskConical size={20}/>} 
          label="OVR 실험실" 
          onClick={() => onNavigate('OvrCalculator')} 
          color={teamColor}
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
