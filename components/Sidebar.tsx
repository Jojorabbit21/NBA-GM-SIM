
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, LayoutDashboard, Trophy, PieChart,
  CalendarDays, ArrowLeftRight,
  RotateCcw, LogOut, Globe, Gavel, CircleUser,
  BookOpen, FileText, Wand2, Crown, Settings, Landmark,
  Sparkles, Dices, Contact, UserPlus, GitPullRequestClosed, TrafficCone,
  Table2,
} from 'lucide-react';
import { Team } from '../types';
import { PendingOffseasonAction, type OffseasonPhase } from '../types/app';
import { TEAM_DATA } from '../data/teamData';

import { LegalModal } from './LegalModal';
import { getTeamTheme, SIDEBAR_ICON_COLORS, SIDEBAR_SELECTED_ICON_COLORS } from '../utils/teamTheme';

interface SidebarProps {
  team: Team | undefined;
  isGuestMode: boolean;
  unreadMessagesCount: number;
  isRegularSeasonOver: boolean;
  isPostseasonOver: boolean;
  pendingOffseasonAction: PendingOffseasonAction;
  hasProspects: boolean;
  offseasonPhase?: OffseasonPhase | null;
  userEmail?: string;
  onResetClick: () => void;
  onEditorClick: () => void;
  onSimSettingsClick: () => void;
  onLogout: () => void;
}

const NavItem: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: number;
  textBadge?: string;
  iconColor: string;
  activeIconColor: string;
  activeBg: string;
}> = ({ active, icon, label, onClick, badge, textBadge, iconColor, activeIconColor, activeBg }) => (
  <button
    onClick={onClick}
    title={label}
    className={`w-full flex items-center justify-center p-2 rounded-[4px] relative transition-all duration-150 outline outline-2 outline-transparent ${
      active ? '' : 'hover:bg-black/15 hover:outline-black/25'
    }`}
    style={active ? { backgroundColor: activeBg } : undefined}
  >
    {React.cloneElement(icon as React.ReactElement<any>, {
      size: 24,
      color: active ? activeIconColor : iconColor,
    })}
    {badge !== undefined && badge > 0 && (
      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold shadow">
        {badge > 9 ? '9+' : badge}
      </span>
    )}
    {textBadge && (
      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[6px] font-black shadow">
        !
      </span>
    )}
  </button>
);

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  team,
  isGuestMode,
  unreadMessagesCount,
  isRegularSeasonOver,
  pendingOffseasonAction,
  hasProspects,
  offseasonPhase,
  userEmail,
  onResetClick,
  onEditorClick,
  onSimSettingsClick,
  onLogout,
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownBottom, setDropdownBottom] = useState(0);

  const teamStatic = team ? TEAM_DATA[team.id] : null;
  const theme = getTeamTheme(team?.id ?? null, teamStatic?.colors ?? null);

  // 사이드바 배경: 항상 팀 primary 색 (Figma 기준)
  const sidebarBg = teamStatic?.colors?.primary ?? '#0f172a';

  // 비선택 아이콘: Figma {TEAM}/secondary 기준
  const iconColor = team ? (SIDEBAR_ICON_COLORS[team.id] ?? '#ffffff') : '#ffffff';

  // 선택(active) 아이콘: Figma {TEAM}/accent 기준, 기본 #ffffff
  const activeIconColor = team ? (SIDEBAR_SELECTED_ICON_COLORS[team.id] ?? '#ffffff') : '#ffffff';

  // 선택 버튼 배경: tertiary 우선, 없으면 secondary (Figma 기준)
  const activeBg = teamStatic?.colors?.tertiary ?? teamStatic?.colors?.secondary ?? 'rgba(255,255,255,0.2)';

  // 프로필 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!isMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inBtn = menuRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inBtn && !inDropdown) setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isMenuOpen]);

  const handleProfileClick = () => {
    if (profileBtnRef.current) {
      const rect = profileBtnRef.current.getBoundingClientRect();
      setDropdownBottom(window.innerHeight - rect.top + 8);
    }
    setIsMenuOpen(prev => !prev);
  };

  // NavItem 래퍼 — iconColor/activeIconColor/activeBg 자동 주입
  const Nav = (props: Omit<React.ComponentProps<typeof NavItem>, 'iconColor' | 'activeIconColor' | 'activeBg'>) => (
    <NavItem {...props} iconColor={iconColor} activeIconColor={activeIconColor} activeBg={activeBg} />
  );

  return (
    <>
      <aside
        className="w-20 shrink-0 flex flex-col h-screen z-20 relative"
        style={{
          backgroundColor: sidebarBg,
          borderRight: '1px solid rgba(255,255,255,0.2)',
        }}
      >
        {/* 그라디언트 오버레이: 좌(투명) → 우(약 12% 검정) */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.12) 100%)',
          }}
        />

        {/* 메인 네비게이션 */}
        <nav className="flex-1 flex flex-col gap-6 px-5 pt-6 pb-2 relative z-10">
          {/* 오프시즌 이벤트 버튼 */}
          {pendingOffseasonAction && (() => {
            const cfg = pendingOffseasonAction === 'lottery'
              ? { path: '/draft-lottery', icon: <Dices size={22} color="white" />, label: '로터리 추첨' }
              : { path: '/draft/', icon: <Sparkles size={22} color="white" />, label: '신인 드래프트' };
            return (
              <button
                onClick={() => navigate(cfg.path)}
                title={cfg.label}
                className="w-full flex items-center justify-center p-2 rounded-[4px] bg-emerald-600/80 hover:bg-emerald-500/80 transition-all duration-150 relative"
              >
                {cfg.icon}
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              </button>
            );
          })()}

          <Nav active={pathname === '/'} icon={<Home />} label="홈" onClick={() => navigate('/')} />
          <Nav active={pathname.startsWith('/inbox')} icon={<Globe />} label="받은 메세지" onClick={() => navigate('/inbox')} badge={unreadMessagesCount} />
          <Nav active={pathname.startsWith('/front-office')} icon={<Landmark />} label="프론트 오피스" onClick={() => navigate('/front-office')} />
          <Nav active={pathname.startsWith('/locker-room')} icon={<LayoutDashboard />} label="라커룸" onClick={() => navigate('/locker-room')} />
          <Nav active={pathname.startsWith('/tactics')} icon={<GitPullRequestClosed />} label="전술" onClick={() => navigate('/tactics')} />
          <Nav active={false} icon={<TrafficCone />} label="훈련 (준비 중)" onClick={() => {}} />
          <Nav active={pathname.startsWith('/standings')} icon={<Table2 />} label="순위표" onClick={() => navigate('/standings')} />
          <Nav active={pathname.startsWith('/leaderboard')} icon={<PieChart />} label="리더보드" onClick={() => navigate('/leaderboard')} />
          <Nav active={pathname.startsWith('/fa-market')} icon={<Contact />} label="FA 시장" onClick={() => navigate('/fa-market')} textBadge={offseasonPhase === 'FA_OPEN' ? 'NEW' : undefined} />
          <Nav active={pathname.startsWith('/schedule')} icon={<CalendarDays />} label="리그 일정" onClick={() => navigate('/schedule')} />
          {isRegularSeasonOver && (
            <Nav active={pathname.startsWith('/playoffs')} icon={<Trophy />} label="플레이오프" onClick={() => navigate('/playoffs')} />
          )}
          <Nav active={pathname.startsWith('/transactions')} icon={<ArrowLeftRight />} label="트레이드" onClick={() => navigate('/transactions')} />
          {hasProspects && (
            <Nav active={pathname.startsWith('/draft-board')} icon={<UserPlus />} label="드래프트" onClick={() => navigate('/draft-board')} />
          )}
        </nav>

        {/* 하단 프로필/설정 영역 */}
        <div
          className="flex flex-col gap-6 px-5 py-6 shrink-0 relative z-10"
          style={{ background: 'rgba(0,0,0,0.15)' }}
        >
          {/* 프로필 버튼 (드롭다운 위 방향 오픈) */}
          <div ref={menuRef} className="relative">
            <button
              ref={profileBtnRef}
              onClick={handleProfileClick}
              title={userEmail || '프로필'}
              className={`w-full flex items-center justify-center p-2 rounded-[4px] transition-all duration-150 outline outline-2 outline-transparent ${
                isMenuOpen ? '' : 'hover:bg-black/15 hover:outline-black/25'
              }`}
              style={isMenuOpen ? { backgroundColor: activeBg } : undefined}
            >
              <CircleUser size={24} color={isMenuOpen ? '#ffffff' : iconColor} />
            </button>

            {/* 드롭다운 — Portal로 body에 렌더링 (스태킹 컨텍스트 탈출) */}
            {isMenuOpen && createPortal(
              <div
                ref={dropdownRef}
                className="fixed left-20 w-56 rounded-xl overflow-hidden shadow-2xl z-[300]"
                style={{
                  bottom: `${dropdownBottom}px`,
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {userEmail && (
                  <div className="px-3 py-2.5 border-b border-slate-700">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">계정</p>
                    <p className="text-xs text-slate-300 font-medium truncate mt-0.5">{userEmail}</p>
                  </div>
                )}
                <div className="p-1.5 space-y-0.5">
                  <button
                    onClick={() => { navigate('/hall-of-fame'); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all text-left"
                  >
                    <Crown size={14} />
                    <span className="text-xs font-bold">명예의 전당</span>
                  </button>
                  <div className="my-1 border-t border-slate-700" />
                  <button
                    onClick={() => { navigate('/draft-history'); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-left"
                  >
                    <Gavel size={14} />
                    <span className="text-xs font-bold">드래프트 기록</span>
                  </button>
                  <button
                    onClick={() => { onEditorClick(); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-left"
                  >
                    <Wand2 size={14} />
                    <span className="text-xs font-bold">에디터</span>
                  </button>
                  <div className="my-1 border-t border-slate-700" />
                  <button
                    onClick={() => { onResetClick(); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/5 transition-all text-left"
                  >
                    <RotateCcw size={14} />
                    <span className="text-xs font-bold">데이터 초기화</span>
                  </button>
                  <button
                    onClick={() => { navigate('/help'); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-left"
                  >
                    <BookOpen size={14} />
                    <span className="text-xs font-bold">초보자 가이드</span>
                  </button>
                  <button
                    onClick={() => { setShowTermsModal(true); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-left"
                  >
                    <FileText size={14} />
                    <span className="text-xs font-bold">이용약관</span>
                  </button>
                  <div className="my-1 border-t border-slate-700" />
                  <button
                    onClick={() => { onLogout(); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-left"
                  >
                    <LogOut size={14} />
                    <span className="text-xs font-bold">{isGuestMode ? '로그인으로 이동' : '로그아웃'}</span>
                  </button>
                </div>
              </div>,
              document.body
            )}
          </div>

          {/* 시뮬레이션 설정 버튼 */}
          <button
            onClick={onSimSettingsClick}
            title="시뮬레이션 설정"
            className="w-full flex items-center justify-center p-2 rounded-[4px] transition-all duration-150 outline outline-2 outline-transparent hover:bg-black/15 hover:outline-black/25"
          >
            <Settings size={24} color={iconColor} />
          </button>
        </div>
      </aside>

      <LegalModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />
    </>
  );
});
