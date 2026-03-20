
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, LayoutDashboard, Trophy, BarChart3, Swords,
  Calendar as CalendarIcon, ArrowLeftRight,
  RotateCcw, LogOut, Mail, Gavel, User,
  BookOpen, FileText, Wand2, Crown, Settings, Briefcase,
  Sparkles, Dices, Users, UserPlus, SlidersHorizontal, Dumbbell,
} from 'lucide-react';
import { Team } from '../types';
import { PendingOffseasonAction, type OffseasonPhase } from '../types/app';
import { TEAM_DATA } from '../data/teamData';

import { LegalModal } from './LegalModal';
import { getTeamTheme } from '../utils/teamTheme';

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
}> = ({ active, icon, label, onClick, badge, textBadge }) => (
  <button
    onClick={onClick}
    title={label}
    className={`w-full flex items-center justify-center p-2 rounded-[4px] relative transition-all duration-150 outline outline-2 outline-transparent ${
      active
        ? 'bg-black/35'
        : 'hover:bg-black/15 hover:outline-black/25'
    }`}
  >
    {React.cloneElement(icon as React.ReactElement<any>, {
      size: 24,
      color: 'white',
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

  const teamStatic = team ? TEAM_DATA[team.id] : null;
  const theme = getTeamTheme(team?.id ?? null, teamStatic?.colors ?? null);

  // 프로필 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!isMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isMenuOpen]);

  return (
    <>
      <aside
        className="w-20 shrink-0 flex flex-col h-screen z-20 relative"
        style={{
          backgroundColor: theme.bg,
          borderRight: '1px solid rgba(255,255,255,0.2)',
        }}
      >
        {/* 메인 네비게이션 */}
        <nav className="flex-1 flex flex-col gap-2 px-5 pt-4 pb-2">
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

          <NavItem active={pathname === '/'} icon={<Home />} label="홈" onClick={() => navigate('/')} />
          <NavItem active={pathname.startsWith('/inbox')} icon={<Mail />} label="받은 메세지" onClick={() => navigate('/inbox')} badge={unreadMessagesCount} />
          <NavItem active={pathname.startsWith('/front-office')} icon={<Briefcase />} label="프론트 오피스" onClick={() => navigate('/front-office')} />
          <NavItem active={pathname.startsWith('/dashboard')} icon={<LayoutDashboard />} label="라커룸" onClick={() => navigate('/dashboard')} />
          <NavItem active={pathname.startsWith('/standings')} icon={<Trophy />} label="순위표" onClick={() => navigate('/standings')} />
          <NavItem active={pathname.startsWith('/leaderboard')} icon={<BarChart3 />} label="리더보드" onClick={() => navigate('/leaderboard')} />
          <NavItem active={pathname.startsWith('/fa-market')} icon={<Users />} label="FA 시장" onClick={() => navigate('/fa-market')} textBadge={offseasonPhase === 'FA_OPEN' ? 'NEW' : undefined} />
          <NavItem active={pathname.startsWith('/schedule')} icon={<CalendarIcon />} label="리그 일정" onClick={() => navigate('/schedule')} />
          {isRegularSeasonOver && (
            <NavItem active={pathname.startsWith('/playoffs')} icon={<Swords />} label="플레이오프" onClick={() => navigate('/playoffs')} />
          )}
          <NavItem active={false} icon={<SlidersHorizontal />} label="전술 (준비 중)" onClick={() => {}} />
          <NavItem active={pathname.startsWith('/transactions')} icon={<ArrowLeftRight />} label="트레이드" onClick={() => navigate('/transactions')} />
          <NavItem active={false} icon={<Dumbbell />} label="훈련 (준비 중)" onClick={() => {}} />
          {hasProspects && (
            <NavItem active={pathname.startsWith('/draft-board')} icon={<UserPlus />} label="드래프트" onClick={() => navigate('/draft-board')} />
          )}
        </nav>

        {/* 하단 프로필/설정 영역 */}
        <div
          className="flex flex-col gap-6 px-5 py-6 shrink-0"
          style={{ background: 'rgba(0,0,0,0.15)' }}
        >
          {/* 프로필 버튼 (드롭다운 위 방향 오픈) */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setIsMenuOpen(prev => !prev)}
              title={userEmail || '프로필'}
              className={`w-full flex items-center justify-center p-2 rounded-[4px] transition-all duration-150 ${
                isMenuOpen
                  ? 'bg-black/35'
                  : 'hover:bg-black/15 hover:outline hover:outline-2 hover:outline-black/25'
              }`}
            >
              <User size={24} color="white" />
            </button>

            {/* 드롭다운 — 위쪽 방향 */}
            {isMenuOpen && (
              <div
                className="absolute bottom-full left-0 mb-2 w-56 rounded-xl overflow-hidden shadow-2xl z-[300]"
                style={{
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
              </div>
            )}
          </div>

          {/* 시뮬레이션 설정 버튼 */}
          <button
            onClick={onSimSettingsClick}
            title="시뮬레이션 설정"
            className="w-full flex items-center justify-center p-2 rounded-[4px] transition-all duration-150 hover:bg-black/15 hover:outline hover:outline-2 hover:outline-black/25"
          >
            <Settings size={24} color="white" />
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
