
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Inbox, Landmark, CircleDollarSign, Users, GitPullRequestClosed,
  ListOrdered, ChartNoAxesColumn, ArrowLeftRight, ZoomIn, Calendar, Medal,
  CircleUser, Settings,
  RotateCcw, LogOut, Crown, BookOpen, FileText, Wand2, Gavel, Sparkles, Dices,
} from 'lucide-react';
import { Team } from '../types';
import { PendingOffseasonAction, type OffseasonPhase } from '../types/app';
import { LegalModal } from './LegalModal';

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
  gmDisplayName?: string;
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
  buttonRef?: React.RefObject<HTMLButtonElement>;
}> = ({ active, icon, label, onClick, badge, textBadge, buttonRef }) => (
  <button
    ref={buttonRef}
    onClick={onClick}
    title={label}
    className={`w-full flex items-center justify-center p-2 rounded-[4px] relative transition-all duration-150 ${
      active
        ? 'bg-zinc-950'
        : 'opacity-70 hover:opacity-100 hover:bg-surface-hover'
    }`}
  >
    {React.cloneElement(icon as React.ReactElement<any>, { size: 24, color: 'white' })}
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

const Divider = () => <div className="w-6 h-px bg-border-dim shrink-0" />;

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  team,
  isGuestMode,
  unreadMessagesCount,
  isRegularSeasonOver,
  pendingOffseasonAction,
  hasProspects,
  offseasonPhase,
  userEmail,
  gmDisplayName,
  onResetClick,
  onEditorClick,
  onSimSettingsClick,
  onLogout,
}) => {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownBottom, setDropdownBottom] = useState(0);
  const [dropdownLeft, setDropdownLeft] = useState(0);

  const isSalaryTab = search.includes('tab=salary');

  useEffect(() => {
    if (!isMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isMenuOpen]);

  const handleProfileClick = () => {
    if (profileBtnRef.current) {
      const rect = profileBtnRef.current.getBoundingClientRect();
      setDropdownBottom(window.innerHeight - rect.bottom + 8);
      setDropdownLeft(rect.right + 8);
    }
    setIsMenuOpen(prev => !prev);
  };

  return (
    <>
      <aside className="w-[40px] shrink-0 flex flex-col h-screen z-20 relative bg-surface-sidebar border-r border-border-default">

        {/* Upper navigation */}
        <nav className="flex-1 flex flex-col items-center gap-6 pt-6 pb-2 relative z-10">

          {/* Offseason action */}
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

          <NavItem
            active={pathname === '/'}
            icon={<Home />}
            label="홈"
            onClick={() => navigate('/')}
          />
          <NavItem
            active={pathname.startsWith('/inbox')}
            icon={<Inbox />}
            label="받은 메일함"
            onClick={() => navigate('/inbox')}
            badge={unreadMessagesCount}
          />

          <Divider />

          {/* My Team */}
          <NavItem
            active={pathname.startsWith('/front-office') && !isSalaryTab}
            icon={<Landmark />}
            label="프론트 오피스"
            onClick={() => navigate('/front-office')}
          />
          <NavItem
            active={pathname.startsWith('/front-office') && isSalaryTab}
            icon={<CircleDollarSign />}
            label="샐러리"
            onClick={() => navigate('/front-office?tab=salary')}
          />
          <NavItem
            active={pathname.startsWith('/locker-room')}
            icon={<Users />}
            label="로스터"
            onClick={() => navigate('/locker-room')}
          />
          <NavItem
            active={pathname.startsWith('/tactics')}
            icon={<GitPullRequestClosed />}
            label="전술"
            onClick={() => navigate('/tactics')}
          />
          {/* TrafficCone — 훈련 기능 활성화 시 표시 예정 */}

          <Divider />

          {/* League */}
          <NavItem
            active={pathname.startsWith('/standings')}
            icon={<ListOrdered />}
            label="순위표"
            onClick={() => navigate('/standings')}
          />
          <NavItem
            active={pathname.startsWith('/leaderboard')}
            icon={<ChartNoAxesColumn />}
            label="리더보드"
            onClick={() => navigate('/leaderboard')}
          />
          <NavItem
            active={pathname.startsWith('/transactions')}
            icon={<ArrowLeftRight />}
            label="선수 이동"
            onClick={() => navigate('/transactions')}
          />
          <NavItem
            active={pathname.startsWith('/fa-market')}
            icon={<ZoomIn />}
            label="자유 계약"
            onClick={() => navigate('/fa-market')}
            textBadge={offseasonPhase === 'FA_OPEN' ? 'NEW' : undefined}
          />
          <NavItem
            active={pathname.startsWith('/schedule')}
            icon={<Calendar />}
            label="리그 일정"
            onClick={() => navigate('/schedule')}
          />
          {isRegularSeasonOver && (
            <NavItem
              active={pathname.startsWith('/playoffs')}
              icon={<Medal />}
              label="플레이오프"
              onClick={() => navigate('/playoffs')}
            />
          )}
          {hasProspects && (
            <NavItem
              active={pathname.startsWith('/draft-board')}
              icon={<Sparkles />}
              label="드래프트"
              onClick={() => navigate('/draft-board')}
            />
          )}
        </nav>

        {/* Lower — Profile / Settings */}
        <div className="flex flex-col items-center gap-6 py-6 shrink-0 relative z-10">
          <div ref={menuRef} className="relative w-full">
            <NavItem
              active={isMenuOpen}
              icon={<CircleUser />}
              label={gmDisplayName || userEmail || '프로필'}
              onClick={handleProfileClick}
              buttonRef={profileBtnRef}
            />

            {isMenuOpen && createPortal(
              <div
                ref={dropdownRef}
                className="fixed w-56 rounded-xl overflow-hidden shadow-2xl z-[300] bg-surface-elevated border border-border-default"
                style={{
                  bottom: `${dropdownBottom}px`,
                  left: `${dropdownLeft}px`,
                }}
              >
                {(gmDisplayName || userEmail) && (
                  <div className="px-3 py-2.5 border-b border-zinc-700">
                    <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">단장</p>
                    <p className="text-xs text-zinc-300 font-medium truncate mt-0.5">{gmDisplayName || userEmail}</p>
                    {gmDisplayName && userEmail && (
                      <p className="text-[10px] text-zinc-600 truncate mt-0.5">{userEmail}</p>
                    )}
                  </div>
                )}
                <div className="p-1.5 space-y-0.5">
                  {gmDisplayName && team?.id && (
                    <button
                      onClick={() => { navigate(`/gm/${team.id}`); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-all text-left"
                    >
                      <CircleUser size={14} />
                      <span className="text-xs font-bold">내 프로필</span>
                    </button>
                  )}
                  <button
                    onClick={() => { navigate('/hall-of-fame'); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all text-left"
                  >
                    <Crown size={14} />
                    <span className="text-xs font-bold">명예의 전당</span>
                  </button>
                  <div className="my-1 border-t border-zinc-700" />
                  <button
                    onClick={() => { navigate('/draft-history'); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-white hover:bg-surface-hover transition-all text-left"
                  >
                    <Gavel size={14} />
                    <span className="text-xs font-bold">드래프트 기록</span>
                  </button>
                  <button
                    onClick={() => { onEditorClick(); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-white hover:bg-surface-hover transition-all text-left"
                  >
                    <Wand2 size={14} />
                    <span className="text-xs font-bold">에디터</span>
                  </button>
                  <div className="my-1 border-t border-zinc-700" />
                  <button
                    onClick={() => { onResetClick(); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-400/5 transition-all text-left"
                  >
                    <RotateCcw size={14} />
                    <span className="text-xs font-bold">데이터 초기화</span>
                  </button>
                  <button
                    onClick={() => { navigate('/help'); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-white hover:bg-surface-hover transition-all text-left"
                  >
                    <BookOpen size={14} />
                    <span className="text-xs font-bold">초보자 가이드</span>
                  </button>
                  <button
                    onClick={() => { setShowTermsModal(true); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-white hover:bg-surface-hover transition-all text-left"
                  >
                    <FileText size={14} />
                    <span className="text-xs font-bold">이용약관</span>
                  </button>
                  <div className="my-1 border-t border-zinc-700" />
                  <button
                    onClick={() => { onLogout(); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-white hover:bg-surface-hover transition-all text-left"
                  >
                    <LogOut size={14} />
                    <span className="text-xs font-bold">{isGuestMode ? '로그인으로 이동' : '로그아웃'}</span>
                  </button>
                </div>
              </div>,
              document.body
            )}
          </div>

          <NavItem
            active={false}
            icon={<Settings />}
            label="시뮬레이션 설정"
            onClick={onSimSettingsClick}
          />
        </div>
      </aside>

      <LegalModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />
    </>
  );
});
