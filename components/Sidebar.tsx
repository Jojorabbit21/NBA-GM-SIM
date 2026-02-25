
import React, { useState } from 'react';
import {
  LayoutDashboard, Users, Trophy, BarChart3, Swords,
  Calendar as CalendarIcon, ArrowLeftRight,
  RotateCcw, LogOut, Mail, Gavel, User, MoreHorizontal,
  PanelLeftClose, PanelLeftOpen, BookOpen, FileText
} from 'lucide-react';
import { Team, AppView } from '../types';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from './common/TeamLogo';
import { Dropdown } from './common/Dropdown';

interface SidebarProps {
  team: Team | undefined;
  currentSimDate: string;
  currentView: AppView;
  isGuestMode: boolean;
  unreadMessagesCount: number;
  isRegularSeasonOver: boolean;
  userEmail?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate: (view: AppView) => void;
  onResetClick: () => void;
  onLogout: () => void;
}

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '79, 70, 229';
};

// Color mixing: blend base + overlay at given ratio (0=pure base, 1=pure overlay)
const hexToRgbObj = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 15, g: 23, b: 42 };
};

const mixColor = (baseHex: string, overlayHex: string, amount: number): string => {
  const b = hexToRgbObj(baseHex);
  const o = hexToRgbObj(overlayHex);
  return `rgb(${Math.round(b.r + (o.r - b.r) * amount)}, ${Math.round(b.g + (o.g - b.g) * amount)}, ${Math.round(b.b + (o.b - b.b) * amount)})`;
};

const SLATE_900 = '#0f172a';
const SLATE_800 = '#1e293b';

const getSidebarTheme = (colors: { primary: string; secondary: string; text: string } | null) => {
  const fallback = { primary: '#4f46e5', secondary: '#6366f1', text: '#FFFFFF' };
  const c = colors || fallback;
  // Black teams (Nets, Spurs): use secondary for tinting since primary is invisible on dark bg
  const tint = c.primary === '#000000' ? c.secondary : c.primary;

  return {
    sidebarBg: mixColor(SLATE_900, tint, 0.08),
    borderColor: mixColor(SLATE_800, tint, 0.15),
    profileBg: mixColor(SLATE_900, tint, 0.05),
    bannerBg: c.primary,
    bannerText: c.text,
    navHoverBg: mixColor(SLATE_900, tint, 0.18),
    navActiveBg: c.primary,
    navActiveText: c.text,
    navActiveRgb: hexToRgb(c.primary),
  };
};

const NavItem: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color: string;
  textColor: string;
  hoverBg: string;
  badge?: number;
  isCollapsed: boolean;
}> = ({ active, icon, label, onClick, color, textColor, hoverBg, badge, isCollapsed }) => {
  const [isHovered, setIsHovered] = useState(false);
  const rgb = hexToRgb(color);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`w-full flex items-center transition-all duration-500 group relative overflow-hidden ${
        isCollapsed ? 'px-3.5 py-2.5 rounded-xl' : 'px-5 py-4 rounded-2xl'
      } ${
        active
          ? 'shadow-lg ring-1'
          : 'text-slate-400 hover:text-slate-200'
      }`}
      style={active ? {
        backgroundColor: color,
        color: textColor,
        boxShadow: `0 10px 15px -3px rgba(${rgb}, 0.4)`,
        borderColor: `rgba(${rgb}, 0.3)`
      } : isHovered ? {
        backgroundColor: hoverBg,
      } : {}}
      title={isCollapsed ? label : undefined}
    >
      <div className={`flex items-center relative z-10 transition-all duration-500 ${isCollapsed ? 'gap-0' : 'gap-4'}`}>
          <span
            className="transition-colors shrink-0"
            style={!active ? { color: 'inherit' } : {}}
          >
            {React.cloneElement(icon as React.ReactElement<any>, {
               color: active ? textColor : undefined,
               className: !active ? `transition-colors duration-300 group-hover:text-[${color}]` : '',
               size: 20
            })}
          </span>

          <span className={`text-sm font-bold ko-tight tracking-tight whitespace-nowrap overflow-hidden transition-all duration-500 ${
            isCollapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[200px] delay-150'
          }`}>
            {label}
          </span>
      </div>

      {badge !== undefined && badge > 0 && (
          <span className={`absolute z-10 flex items-center justify-center rounded-full bg-red-500 text-white shadow-sm font-bold transition-all duration-500 ${
            isCollapsed ? '-top-0.5 -right-0.5 h-4 w-4 text-[8px]' : 'right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[10px] ring-2 ring-white'
          }`}>
             {badge > 9 ? '9+' : badge}
          </span>
      )}

      {active && (
        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-50 pointer-events-none"></div>
      )}
    </button>
  );
};

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  team,
  currentView,
  isGuestMode,
  unreadMessagesCount,
  isRegularSeasonOver,
  userEmail,
  isCollapsed,
  onToggleCollapse,
  onNavigate,
  onResetClick,
  onLogout
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const teamStatic = team ? TEAM_DATA[team.id] : null;
  const theme = getSidebarTheme(teamStatic?.colors ?? null);

  // Shared nav props
  const navProps = { color: theme.navActiveBg, textColor: theme.navActiveText, hoverBg: theme.navHoverBg, isCollapsed };

  return (
    <aside
      className={`${isCollapsed ? 'w-20' : 'w-72'} border-r flex flex-col shadow-2xl z-20 overflow-hidden transition-all duration-500`}
      style={{ backgroundColor: theme.sidebarBg, borderColor: theme.borderColor }}
    >

      {/* Profile Section */}
      <div
        className="px-6 py-3 border-b flex items-center transition-all duration-500"
        style={{ backgroundColor: theme.profileBg, borderColor: theme.borderColor }}
      >
        <div className={`flex items-center flex-1 min-w-0 transition-all duration-500 ${isCollapsed ? 'gap-0' : 'gap-3'}`}>
          <button
            onClick={isCollapsed ? onToggleCollapse : undefined}
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-slate-400 transition-all duration-500 ${
              isCollapsed ? 'hover:text-white cursor-pointer' : 'cursor-default'
            }`}
            style={{ backgroundColor: `${theme.navHoverBg}` }}
            title={isCollapsed ? (userEmail || '프로필') : undefined}
          >
            <User size={16} />
          </button>
          <span className={`text-xs font-bold text-slate-400 whitespace-nowrap overflow-hidden transition-all duration-500 ${
            isCollapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[200px] delay-150'
          }`}>
            {userEmail || (isGuestMode ? '게스트 모드' : '로그인 필요')}
          </span>
        </div>
        <div className={`shrink-0 overflow-hidden transition-all duration-500 ${isCollapsed ? 'opacity-0 pointer-events-none max-w-0' : 'opacity-100 max-w-[50px] ml-auto delay-150'}`}>
          <Dropdown
            isOpen={isMenuOpen}
            onOpenChange={setIsMenuOpen}
            width="w-56"
            align="left"
            trigger={
              <button
                onClick={() => setIsMenuOpen(prev => !prev)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all shrink-0"
              >
                <MoreHorizontal size={16} />
              </button>
            }
          >
            <div className="p-1.5 space-y-0.5">
              <button
                onClick={() => { onNavigate('Help'); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-left"
              >
                <BookOpen size={15} />
                <span className="text-xs font-bold">초보자 가이드</span>
              </button>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-left"
              >
                <FileText size={15} />
                <span className="text-xs font-bold">이용약관</span>
              </button>
              <div className="my-1 border-t" style={{ borderColor: theme.borderColor }} />
              <button
                onClick={() => { onResetClick(); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/5 transition-all text-left"
              >
                <RotateCcw size={15} />
                <span className="text-xs font-bold">데이터 초기화</span>
              </button>
              <button
                onClick={() => { onLogout(); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-left"
              >
                <LogOut size={15} />
                <span className="text-xs font-bold">{isGuestMode ? '로그인으로 이동' : '로그아웃'}</span>
              </button>
            </div>
          </Dropdown>
        </div>
      </div>

      {/* Team Profile Section */}
      <div
        className="border-b relative overflow-hidden transition-all duration-500"
        style={{ backgroundColor: theme.bannerBg, borderColor: theme.borderColor }}
      >
        <div className={`flex items-center relative z-10 transition-all duration-500 ${
          isCollapsed ? 'px-5 py-3 gap-0' : 'p-8 gap-5'
        }`}>
          <TeamLogo
            teamId={team?.id || ''}
            size="custom"
            className={`drop-shadow-2xl filter brightness-110 shrink-0 transition-all duration-500 ${
              isCollapsed ? 'w-10 h-10' : 'w-16 h-16 hover:scale-105'
            }`}
          />
          <div className={`min-w-0 whitespace-nowrap overflow-hidden transition-all duration-500 ${
            isCollapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[200px] delay-150'
          }`}>
            <h2
                className="font-black text-2xl leading-none uppercase oswald truncate drop-shadow-md"
                style={{ color: theme.bannerText }}
            >
              {team?.name || 'NBA GM'}
            </h2>
            <span
                className="text-xs font-black uppercase tracking-widest mt-1.5 inline-block drop-shadow-sm opacity-90"
                style={{ color: theme.bannerText }}
            >
              {team?.wins || 0}W - {team?.losses || 0}L
            </span>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className={`flex-1 space-y-1.5 overflow-y-auto custom-scrollbar transition-all duration-500 ${isCollapsed ? 'p-4' : 'p-6'}`}>
        <NavItem active={currentView === 'Dashboard'} icon={<LayoutDashboard size={20}/>} label="라커룸" onClick={() => onNavigate('Dashboard')} {...navProps} />
        <NavItem active={currentView === 'Inbox'} icon={<Mail size={20}/>} label="받은 메세지" onClick={() => onNavigate('Inbox')} badge={unreadMessagesCount} {...navProps} />
        <NavItem active={currentView === 'Roster'} icon={<Users size={20}/>} label="선수단" onClick={() => onNavigate('Roster')} {...navProps} />
        <NavItem active={currentView === 'Standings'} icon={<Trophy size={20}/>} label="순위표" onClick={() => onNavigate('Standings')} {...navProps} />
        <NavItem active={currentView === 'Leaderboard'} icon={<BarChart3 size={20}/>} label="리더보드" onClick={() => onNavigate('Leaderboard')} {...navProps} />
        {isRegularSeasonOver && (
          <NavItem active={currentView === 'Playoffs'} icon={<Swords size={20}/>} label="플레이오프" onClick={() => onNavigate('Playoffs')} {...navProps} />
        )}
        <NavItem active={currentView === 'Schedule'} icon={<CalendarIcon size={20}/>} label="일정" onClick={() => onNavigate('Schedule')} {...navProps} />
        <NavItem active={currentView === 'Transactions'} icon={<ArrowLeftRight size={20}/>} label="트레이드" onClick={() => onNavigate('Transactions')} {...navProps} />
        <div className="mt-auto pt-4 border-t" style={{ borderColor: theme.borderColor }}>
          <NavItem active={currentView === 'DraftRoom'} icon={<Gavel size={20}/>} label="드래프트룸" onClick={() => onNavigate('DraftRoom')} {...navProps} />
        </div>
      </nav>

      {/* Collapse Toggle */}
      <div className="p-4 border-t transition-all duration-500" style={{ borderColor: theme.borderColor }}>
        <button
          onClick={onToggleCollapse}
          className={`w-full flex items-center py-2.5 rounded-xl text-slate-500 hover:text-slate-300 transition-all duration-500 ${
            isCollapsed ? 'px-3.5 gap-0' : 'px-4 gap-3'
          }`}
          title={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          <span className="shrink-0">
            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </span>
          <span className={`text-xs font-bold uppercase tracking-widest whitespace-nowrap overflow-hidden transition-all duration-500 ${
            isCollapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[100px] delay-150'
          }`}>접기</span>
        </button>
      </div>
    </aside>
  );
});
