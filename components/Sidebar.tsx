
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

const NavItem: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color: string;
  textColor: string;
  badge?: number;
  isCollapsed: boolean;
}> = ({ active, icon, label, onClick, color, textColor, badge, isCollapsed }) => {
  const rgb = hexToRgb(color);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center rounded-2xl transition-all duration-500 group relative overflow-hidden ${
        isCollapsed ? 'justify-center px-0 py-3' : 'justify-between px-5 py-4'
      } ${
        active
          ? 'shadow-lg ring-1'
          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
      }`}
      style={active ? {
        backgroundColor: color,
        color: textColor,
        boxShadow: `0 10px 15px -3px rgba(${rgb}, 0.4)`,
        borderColor: `rgba(${rgb}, 0.3)`
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

          <span className={`text-sm font-bold ko-tight tracking-tight whitespace-nowrap transition-opacity duration-300 ${
            isCollapsed ? 'opacity-0' : 'opacity-100 delay-150'
          }`}>
            {label}
          </span>
      </div>

      {badge !== undefined && badge > 0 && (
          <span className={`z-10 flex items-center justify-center rounded-full bg-red-500 text-white shadow-sm font-bold transition-all duration-500 ${
            isCollapsed ? 'absolute -top-0.5 -right-0.5 h-4 w-4 text-[8px]' : 'absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[10px] ring-2 ring-white'
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

  const infoBgColor = teamStatic ? teamStatic.colors.primary : '#4f46e5';
  const infoTextColor = teamStatic ? teamStatic.colors.text : '#FFFFFF';
  const navActiveColor = teamStatic ? teamStatic.colors.primary : '#4f46e5';
  const navTextColor = teamStatic ? teamStatic.colors.text : '#FFFFFF';

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-72'} border-r border-slate-800 bg-slate-900/95 flex flex-col shadow-2xl z-20 overflow-hidden transition-all duration-500`}>

      {/* Profile Section */}
      <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between transition-all duration-500">
        <div className={`flex items-center min-w-0 transition-all duration-500 ${isCollapsed ? 'gap-0' : 'gap-3'}`}>
          <button
            onClick={isCollapsed ? onToggleCollapse : undefined}
            className={`rounded-lg bg-slate-800/50 flex items-center justify-center shrink-0 text-slate-400 transition-all duration-500 ${
              isCollapsed ? 'w-10 h-10 rounded-xl hover:text-white hover:bg-slate-700 cursor-pointer' : 'w-8 h-8 cursor-default'
            }`}
            title={isCollapsed ? (userEmail || '프로필') : undefined}
          >
            <User size={isCollapsed ? 18 : 16} />
          </button>
          <span className={`text-xs font-bold text-slate-400 truncate whitespace-nowrap transition-opacity duration-300 ${
            isCollapsed ? 'opacity-0' : 'opacity-100 delay-150'
          }`}>
            {userEmail || (isGuestMode ? '게스트 모드' : '로그인 필요')}
          </span>
        </div>
        <div className={`shrink-0 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100 delay-150'}`}>
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
              <div className="my-1 border-t border-slate-800" />
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
        className="border-b border-slate-800 relative overflow-hidden transition-all duration-500"
        style={{ backgroundColor: infoBgColor }}
      >
        <div className={`flex items-center relative z-10 transition-all duration-500 ${
          isCollapsed ? 'p-3 justify-center gap-0' : 'p-8 gap-5'
        }`}>
          <TeamLogo
            teamId={team?.id || ''}
            size="custom"
            className={`drop-shadow-2xl filter brightness-110 shrink-0 transition-all duration-500 ${
              isCollapsed ? 'w-10 h-10' : 'w-16 h-16 hover:scale-105'
            }`}
          />
          <div className={`min-w-0 whitespace-nowrap transition-opacity duration-300 ${
            isCollapsed ? 'opacity-0' : 'opacity-100 delay-150'
          }`}>
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

      {/* Main Navigation */}
      <nav className={`flex-1 space-y-2 overflow-y-auto custom-scrollbar transition-all duration-500 ${isCollapsed ? 'p-2' : 'p-6'}`}>
        <NavItem
          active={currentView === 'Dashboard'}
          icon={<LayoutDashboard size={20}/>}
          label="라커룸"
          onClick={() => onNavigate('Dashboard')}
          color={navActiveColor}
          textColor={navTextColor}
          isCollapsed={isCollapsed}
        />
        <NavItem
          active={currentView === 'Inbox'}
          icon={<Mail size={20}/>}
          label="받은 메세지"
          onClick={() => onNavigate('Inbox')}
          color={navActiveColor}
          textColor={navTextColor}
          badge={unreadMessagesCount}
          isCollapsed={isCollapsed}
        />
        <NavItem
          active={currentView === 'Roster'}
          icon={<Users size={20}/>}
          label="선수단"
          onClick={() => onNavigate('Roster')}
          color={navActiveColor}
          textColor={navTextColor}
          isCollapsed={isCollapsed}
        />
        <NavItem
          active={currentView === 'Standings'}
          icon={<Trophy size={20}/>}
          label="순위표"
          onClick={() => onNavigate('Standings')}
          color={navActiveColor}
          textColor={navTextColor}
          isCollapsed={isCollapsed}
        />
        <NavItem
          active={currentView === 'Leaderboard'}
          icon={<BarChart3 size={20}/>}
          label="리더보드"
          onClick={() => onNavigate('Leaderboard')}
          color={navActiveColor}
          textColor={navTextColor}
          isCollapsed={isCollapsed}
        />
        {isRegularSeasonOver && (
          <NavItem
            active={currentView === 'Playoffs'}
            icon={<Swords size={20}/>}
            label="플레이오프"
            onClick={() => onNavigate('Playoffs')}
            color={navActiveColor}
            textColor={navTextColor}
            isCollapsed={isCollapsed}
          />
        )}
        <NavItem
          active={currentView === 'Schedule'}
          icon={<CalendarIcon size={20}/>}
          label="일정"
          onClick={() => onNavigate('Schedule')}
          color={navActiveColor}
          textColor={navTextColor}
          isCollapsed={isCollapsed}
        />
        <NavItem
          active={currentView === 'Transactions'}
          icon={<ArrowLeftRight size={20}/>}
          label="트레이드"
          onClick={() => onNavigate('Transactions')}
          color={navActiveColor}
          textColor={navTextColor}
          isCollapsed={isCollapsed}
        />
        <div className="mt-auto pt-4 border-t border-slate-800/50">
          <NavItem
            active={currentView === 'DraftRoom'}
            icon={<Gavel size={20}/>}
            label="드래프트룸"
            onClick={() => onNavigate('DraftRoom')}
            color={navActiveColor}
            textColor={navTextColor}
            isCollapsed={isCollapsed}
          />
        </div>
      </nav>

      {/* Collapse Toggle */}
      <div className={`border-t border-slate-800 transition-all duration-500 ${isCollapsed ? 'p-2' : 'p-4'}`}>
        <button
          onClick={onToggleCollapse}
          className={`w-full flex items-center py-3 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-all duration-500 ${
            isCollapsed ? 'justify-center px-0' : 'gap-3 px-4'
          }`}
          title={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          <span className="shrink-0">
            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </span>
          <span className={`text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-opacity duration-300 ${
            isCollapsed ? 'opacity-0' : 'opacity-100 delay-150'
          }`}>접기</span>
        </button>
      </div>
    </aside>
  );
});
