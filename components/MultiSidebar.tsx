
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import {
    Home, Users, ListOrdered, Calendar,
    GitPullRequestClosed, BarChart2,
    CircleUser, LogOut, ArrowLeft, ChevronLeft, Settings2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLeagueContext } from '../views/multi/league/LeagueLayout';
import { useGame } from '../hooks/useGameContext';

const NavItem: React.FC<{
    active: boolean;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    buttonRef?: React.RefObject<HTMLButtonElement>;
}> = ({ active, icon, label, onClick, buttonRef }) => (
    <button
        ref={buttonRef}
        onClick={onClick}
        title={label}
        className={`w-full flex items-center justify-center p-2 rounded-[4px] relative transition-colors duration-150 ${
            active ? 'text-white' : 'text-zinc-700 hover:text-zinc-400'
        }`}
    >
        {React.cloneElement(icon as React.ReactElement<any>, { size: 24 })}
    </button>
);

const Divider = () => <div className="w-6 h-px bg-border-dim shrink-0" />;

export const MultiSidebar: React.FC = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { handleLogout } = useAuth();
    const { league } = useLeagueContext();
    const { session } = useGame();
    const isAdmin = !!(league && session?.user?.id && league.admin_user_id === session.user.id);

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const profileBtnRef = useRef<HTMLButtonElement>(null);
    const [dropdownBottom, setDropdownBottom] = useState(0);
    const [dropdownLeft, setDropdownLeft] = useState(0);

    const base = `/multi/leagues/${leagueId}/season`;

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
        <aside className="w-[40px] shrink-0 flex flex-col h-screen z-20 relative bg-surface-sidebar border-r border-border-default">

            <nav className="flex-1 flex flex-col items-center gap-6 pt-6 pb-2 relative z-10">
                <NavItem
                    active={pathname === base}
                    icon={<Home />}
                    label="홈"
                    onClick={() => navigate(base)}
                />
                <NavItem
                    active={pathname.startsWith(`${base}/roster`)}
                    icon={<Users />}
                    label="로스터"
                    onClick={() => navigate(`${base}/roster`)}
                />
                <NavItem
                    active={pathname.startsWith(`${base}/tactics`)}
                    icon={<GitPullRequestClosed />}
                    label="전술"
                    onClick={() => navigate(`${base}/tactics`)}
                />

                <Divider />

                <NavItem
                    active={pathname.startsWith(`${base}/standings`)}
                    icon={<ListOrdered />}
                    label="순위표"
                    onClick={() => navigate(`${base}/standings`)}
                />
                <NavItem
                    active={pathname.startsWith(`${base}/leaderboard`)}
                    icon={<BarChart2 />}
                    label="리더보드"
                    onClick={() => navigate(`${base}/leaderboard`)}
                />
                <NavItem
                    active={pathname.startsWith(`${base}/schedule`)}
                    icon={<Calendar />}
                    label="일정"
                    onClick={() => navigate(`${base}/schedule`)}
                />
            </nav>

            <div className="flex flex-col items-center gap-6 py-6 shrink-0 relative z-10">
                <div ref={menuRef} className="relative w-full">
                    <NavItem
                        active={isMenuOpen}
                        icon={<CircleUser />}
                        label="프로필"
                        onClick={handleProfileClick}
                        buttonRef={profileBtnRef}
                    />

                    {isMenuOpen && createPortal(
                        <div
                            ref={dropdownRef}
                            className="fixed w-48 rounded-xl overflow-hidden shadow-2xl z-[300] bg-surface-elevated border border-border-default"
                            style={{ bottom: `${dropdownBottom}px`, left: `${dropdownLeft}px` }}
                        >
                            <div className="p-1.5 space-y-0.5">
                                {isAdmin && (
                                    <button
                                        onClick={() => { navigate(`/multi/leagues/${leagueId}/settings`); setIsMenuOpen(false); }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-white hover:bg-surface-hover transition-all text-left"
                                    >
                                        <Settings2 size={14} />
                                        <span className="text-xs font-bold">세션 설정</span>
                                    </button>
                                )}
                                {isAdmin && <div className="my-1 border-t border-zinc-700/60" />}
                                <button
                                    onClick={() => { navigate('/multi'); setIsMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-white hover:bg-surface-hover transition-all text-left"
                                >
                                    <ArrowLeft size={14} />
                                    <span className="text-xs font-bold">리그 목록으로</span>
                                </button>
                                <button
                                    onClick={() => { navigate('/'); setIsMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-white hover:bg-surface-hover transition-all text-left"
                                >
                                    <ChevronLeft size={14} />
                                    <span className="text-xs font-bold">홈으로</span>
                                </button>
                                <div className="my-1 border-t border-zinc-700" />
                                <button
                                    onClick={() => { handleLogout(); setIsMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-white hover:bg-surface-hover transition-all text-left"
                                >
                                    <LogOut size={14} />
                                    <span className="text-xs font-bold">로그아웃</span>
                                </button>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            </div>
        </aside>
    );
};
