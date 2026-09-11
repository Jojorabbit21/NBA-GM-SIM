
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import {
    CircleUser, LogOut, ChevronLeft, Settings2, Wrench, Palette,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLeagueContext } from '../views/multi/league/LeagueLayout';
import { useGame } from '../hooks/useGameContext';
import { usePendingTradeCount } from '../hooks/usePendingTradeCount';

const NavItem: React.FC<{
    active: boolean;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    buttonRef?: React.RefObject<HTMLButtonElement>;
    badge?: number;
}> = ({ active, icon, label, onClick, buttonRef, badge }) => (
    <button
        ref={buttonRef}
        onClick={onClick}
        title={label}
        className={`w-full flex items-center justify-center p-1.5 rounded-[4px] relative transition-colors duration-150 ${
            active ? 'text-white' : 'text-slate-700 hover:text-slate-400'
        }`}
    >
        {icon}
        {!!badge && (
            <span className="absolute top-0.5 right-1 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold">
                {badge > 9 ? '9+' : badge}
            </span>
        )}
    </button>
);

const Divider = () => <div className="w-6 h-px bg-slate-800 shrink-0" />;

// public/images/sidenav/{name}.svg ↔ {name}-selected.svg 쌍을 상태에 따라 스왑
const NavIcon: React.FC<{ name: string; active: boolean }> = ({ name, active }) => (
    <img
        src={`/images/sidenav/${name}${active ? '-selected' : ''}.svg`}
        alt=""
        className="w-7 h-7"
        draggable={false}
    />
);

// 로스터(저지) 아이콘 — team-selected.svg 원본 path 그대로, 선택 상태에서만
// 팀 테마 컬러를 입힌다: 유니폼 넓은 면(body)=primary, 칼라 테두리(collar)=secondary, 넘버(number)=text
// text를 넘버에 쓰면 secondary===primary인 팀(예: 세컨더리가 프라이머리와 동일한 배색)도
// 넘버가 묻히지 않는다 — 아티팩트로 30팀 전수 검증 후 반영.
const JERSEY_PATHS = {
    body: 'M4 10V20H20V10C18.3431 10 17 8.65685 17 7V4H14C14 5.10457 13.1046 6 12 6C10.8954 6 10 5.10457 10 4H7V7C7 8.65685 5.65685 10 4 10Z',
    collar: 'M10.5 4C10.5 4.82843 11.1716 5.5 12 5.5C12.8284 5.5 13.5 4.82843 13.5 4H17V6.87012C17.0003 8.52675 18.3433 9.87012 20 9.87012V10.8701C17.791 10.8701 16.0003 9.07903 16 6.87012V5H14.29C13.9041 5.88257 13.0249 6.5 12 6.5C10.9751 6.5 10.0959 5.88257 9.70996 5H8V6.87012C7.99974 9.07903 6.20898 10.8701 4 10.8701V9.87012C5.65669 9.87012 6.99974 8.52675 7 6.87012V4H10.5Z',
    number: 'M13 18H11.1548V11.7931H9V10.589C9.56872 10.5641 9.96682 10.5269 10.1943 10.4772C10.5566 10.3986 10.8515 10.2414 11.079 10.0055C11.2349 9.84414 11.3528 9.62897 11.4329 9.36C11.4792 9.19862 11.5024 9.07862 11.5024 9H13V18Z',
};
const JERSEY_DEFAULT_PRIMARY = '#62748E';
const JERSEY_DEFAULT_SECONDARY = '#CAD5E2';

const RosterIcon: React.FC<{ active: boolean; primary?: string | null; secondary?: string | null; text?: string | null }> = ({ active, primary, secondary, text }) => {
    if (!active) {
        return <img src="/images/sidenav/team.svg" alt="" className="w-7 h-7" draggable={false} />;
    }
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" fill="#0F172A" />
            <path d={JERSEY_PATHS.body} fill={primary || JERSEY_DEFAULT_PRIMARY} />
            <path d={JERSEY_PATHS.collar} fill={secondary || JERSEY_DEFAULT_SECONDARY} />
            <path d={JERSEY_PATHS.number} fill={text || JERSEY_DEFAULT_SECONDARY} />
        </svg>
    );
};

export const MultiSidebar: React.FC = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { handleLogout } = useAuth();
    const { league, room, leagueTeams } = useLeagueContext();
    const { session } = useGame();
    const isAdmin = !!(league && session?.user?.id && league.admin_user_id === session.user.id);
    const myTeam = leagueTeams.find(t => t.user_id === session?.user?.id);
    // main_league는 정규시즌 종료 시 playoffSeeder/playInSeeder가 leagues.bracket_data를
    // 채우지만 league.type은 절대 'tournament'로 바뀌지 않는다 — bracket_data 존재 여부로
    // 포스트시즌 진입을 판별해 "플레이오프" 메뉴를 노출한다. tournament 타입은 "순위표"
    // 메뉴 자체가 곧 브라켓이라 별도 메뉴가 필요 없다.
    const hasPlayoffs = !!league?.bracket_data && league?.type !== 'tournament';
    // [2026-09-11] "드래프트 끝나기 전엔 내 팀/전술 메뉴 숨김" 요청 — 드래프트 완료 전엔
    // 로스터 자체가 없어(팀이 아직 비어있음) 두 메뉴가 사실상 빈 화면으로 이어지므로 접근을
    // 막는다. league.status가 in_progress/finished가 되면(=드래프트 종료) 다시 노출.
    const isDraftComplete = league?.status === 'in_progress' || league?.status === 'finished';

    const base = `/multi/leagues/${leagueId}/season`;
    const isRosterActive = pathname.startsWith(`${base}/roster`);

    // 받은 트레이드 제안 중 안읽은 것 개수 — 사이드바 트레이드 아이콘 배지용
    // (인박스 "메세지함" 탭 배지와 동일한 기준: to_team_read_at이 null인 것만 카운트)
    // [2026-09-07] MultiHeaderNavMenu.tsx와 완전히 동일한 조회를 각자 따로 하고 있어서
    // 공용 훅(usePendingTradeCount)으로 통합 — react-query가 같은 queryKey면 두 컴포넌트가
    // 동시에 마운트돼도 fetch를 한 번만 묶어서 실행한다(네트워크 요청 중복 제거).
    const roomId = room?.id ?? null;
    const myTeamDbId = myTeam?.id ?? null;
    const pendingTradeCount = usePendingTradeCount(roomId, myTeamDbId);

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const profileBtnRef = useRef<HTMLButtonElement>(null);
    const [dropdownBottom, setDropdownBottom] = useState(0);
    const [dropdownLeft, setDropdownLeft] = useState(0);

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
        <aside className="w-[40px] shrink-0 flex flex-col h-screen z-20 relative bg-slate-900 border-r border-slate-700">

            <nav className="flex-1 flex flex-col items-center gap-6 pt-6 pb-2 relative z-10">
                <NavItem
                    active={pathname === base}
                    icon={<NavIcon name="home" active={pathname === base} />}
                    label="홈"
                    onClick={() => navigate(base)}
                />
                <NavItem
                    active={pathname.startsWith(`${base}/news`)}
                    icon={<NavIcon name="news" active={pathname.startsWith(`${base}/news`)} />}
                    label="뉴스피드"
                    onClick={() => navigate(`${base}/news`)}
                />
                {/* [2026-09-11] 드래프트가 끝나면(정규 시즌 진입) 더 이상 지명 대상 풀을
                    조회할 필요가 없어 메뉴 자체를 숨긴다(요청 — 접근 자체를 막음). */}
                {!isDraftComplete && (
                    <NavItem
                        active={pathname.startsWith(`${base}/pool`)}
                        icon={<NavIcon name="pool" active={pathname.startsWith(`${base}/pool`)} />}
                        label="드래프트 풀"
                        onClick={() => navigate(`${base}/pool`)}
                    />
                )}
                {/* [2026-09-11 후속] "리그 메뉴도 모두 숨겨줘야, 홈/뉴스/드래프트풀 3개만
                    접근 가능해야" 요청 — 로스터/전술뿐 아니라 순위표~자유계약, 어드민 팀
                    관리까지 드래프트 완료 전엔 전부 숨긴다(구분선 포함). */}
                {isDraftComplete && (
                    <>
                        <NavItem
                            active={isRosterActive}
                            icon={<RosterIcon active={isRosterActive} primary={myTeam?.color_primary} secondary={myTeam?.color_secondary} text={myTeam?.color_text} />}
                            label="로스터"
                            onClick={() => navigate(myTeam ? `${base}/roster?rteam=${myTeam.team_slug}` : `${base}/roster`)}
                        />
                        <NavItem
                            active={pathname.startsWith(`${base}/tactics`)}
                            icon={<NavIcon name="tactics" active={pathname.startsWith(`${base}/tactics`)} />}
                            label="전술"
                            onClick={() => navigate(`${base}/tactics`)}
                        />

                        <Divider />

                        <NavItem
                            active={pathname.startsWith(`${base}/standings`)}
                            icon={<NavIcon name="standings" active={pathname.startsWith(`${base}/standings`)} />}
                            label="순위표"
                            onClick={() => navigate(`${base}/standings`)}
                        />
                        {hasPlayoffs && (
                            <NavItem
                                active={pathname.startsWith(`${base}/playoffs`)}
                                icon={<NavIcon name="playoffs" active={pathname.startsWith(`${base}/playoffs`)} />}
                                label="플레이오프"
                                onClick={() => navigate(`${base}/playoffs`)}
                            />
                        )}
                        {/* 올스타 이벤트는 main_league 전용(server/src/scheduler.ts가
                            type='main_league'만 투표/경기를 자동 진행) — tournament
                            세션에서는 기능 자체가 동작하지 않으므로 메뉴도 숨긴다. */}
                        {league?.type !== 'tournament' && (
                            <NavItem
                                active={pathname.startsWith(`${base}/allstar`)}
                                icon={<NavIcon name="allstar" active={pathname.startsWith(`${base}/allstar`)} />}
                                label="올스타"
                                onClick={() => navigate(`${base}/allstar`)}
                            />
                        )}
                        <NavItem
                            active={pathname.startsWith(`${base}/leaderboard`)}
                            icon={<NavIcon name="leaderboard" active={pathname.startsWith(`${base}/leaderboard`)} />}
                            label="리더보드"
                            onClick={() => navigate(`${base}/leaderboard`)}
                        />
                        <NavItem
                            active={pathname.startsWith(`${base}/schedule`)}
                            icon={<NavIcon name="schedule" active={pathname.startsWith(`${base}/schedule`)} />}
                            label="일정"
                            onClick={() => navigate(`${base}/schedule`)}
                        />
                        <NavItem
                            active={pathname.startsWith(`${base}/transaction`)}
                            icon={<NavIcon name="transactions" active={pathname.startsWith(`${base}/transaction`)} />}
                            label="트레이드"
                            onClick={() => navigate(`${base}/transaction`)}
                            badge={pendingTradeCount}
                        />
                        <NavItem
                            active={pathname.startsWith(`${base}/free-agent`)}
                            icon={<NavIcon name="free-agents" active={pathname.startsWith(`${base}/free-agent`)} />}
                            label="자유 계약"
                            onClick={() => navigate(`${base}/free-agent`)}
                        />

                        {isAdmin && (
                            <>
                                <Divider />
                                <NavItem
                                    active={pathname.startsWith(`/multi/leagues/${leagueId}/admin/teams`)}
                                    icon={<Wrench size={24} />}
                                    label="어드민: 팀 관리"
                                    onClick={() => navigate(`/multi/leagues/${leagueId}/admin/teams`)}
                                />
                            </>
                        )}
                    </>
                )}
            </nav>

            <div className="flex flex-col items-center gap-6 py-6 shrink-0 relative z-10">
                <div ref={menuRef} className="relative w-full">
                    <NavItem
                        active={isMenuOpen}
                        icon={<CircleUser size={24} />}
                        label="프로필"
                        onClick={handleProfileClick}
                        buttonRef={profileBtnRef}
                    />

                    {isMenuOpen && createPortal(
                        <div
                            ref={dropdownRef}
                            className="fixed w-48 rounded-xl overflow-hidden shadow-2xl z-[300] bg-slate-800 border border-slate-700"
                            style={{ bottom: `${dropdownBottom}px`, left: `${dropdownLeft}px` }}
                        >
                            <div className="p-1.5 space-y-0.5">
                                {/* [2026-08-05] "팀 설정" 진입점 — 비어드민은 목록 최상단(뒤에 구분선),
                                    어드민은 세션 설정 바로 아래에 위치. 팀을 아직 선점 안 했으면
                                    설정할 대상이 없으므로 아예 숨김.
                                    [Fix 2026-09-04] "모달이 아니라 탭 그룹에서 직접 수정" 요청 —
                                    모달을 여는 대신 로스터 화면(내 팀)의 "팀 설정" 탭으로 이동(바디 스왑).
                                    [Fix 2026-09-05] "세션 설정도 팀 설정처럼 사이드바/헤더 유지한 채
                                    바디만 스왑" 요청 — LeagueSettingsView를 MultiSeasonLayout 하위
                                    라우트(season/settings)로 옮겨서 이 화면도 동일한 방식이 되도록
                                    경로를 `${base}/settings`로 변경(기존 `/multi/leagues/:id/settings`는
                                    LeagueLayout 직계 자식이라 사이드바/헤더가 없는 별도 풀페이지였음). */}
                                {isAdmin && (
                                    <button
                                        onClick={() => { navigate(`${base}/settings`); setIsMenuOpen(false); }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-600 transition-all text-left"
                                    >
                                        <Settings2 size={14} />
                                        <span className="text-xs font-bold">세션 설정</span>
                                    </button>
                                )}
                                {myTeam && (
                                    <button
                                        onClick={() => { navigate(`${base}/roster?rteam=${myTeam.team_slug}&tab=settings`); setIsMenuOpen(false); }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-600 transition-all text-left"
                                    >
                                        <Palette size={14} />
                                        <span className="text-xs font-bold">팀 설정</span>
                                    </button>
                                )}
                                {(isAdmin || myTeam) && <div className="my-1 border-t border-slate-700/60" />}
                                <button
                                    onClick={() => { navigate('/'); setIsMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-600 transition-all text-left"
                                >
                                    <ChevronLeft size={14} />
                                    <span className="text-xs font-bold">홈으로</span>
                                </button>
                                <div className="my-1 border-t border-slate-700" />
                                <button
                                    onClick={() => { handleLogout(); setIsMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-600 transition-all text-left"
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
