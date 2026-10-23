
import React, { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import {
    CircleUser, LogOut, ChevronLeft, Settings2, Palette,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLeagueContext } from '../views/multi/league/LeagueLayout';
import { useGame } from '../hooks/useGameContext';
import { usePendingTradeCount } from '../hooks/usePendingTradeCount';
import { usePersonalDraftStatus } from '../hooks/usePersonalDraftStatus';
import { useSeasonContext } from '../views/multi/season/seasonContext';
import { useCurrentVirtualDate } from '../hooks/useCurrentVirtualDate';
import { isAllStarWindowActive } from '../utils/allStarSelection';
import { usePlayoffRaceOpen } from '../hooks/usePlayoffRaceOpen';
import { CountBadge } from './common/CountBadge';
import { Dropdown } from './common/Dropdown';

const NavItem: React.FC<{
    active: boolean;
    icon: React.ReactNode;
    label: string;
    /** 생략 시 클릭은 바깥(Dropdown 트리거 래퍼)으로 버블만 시킨다. */
    onClick?: () => void;
    badge?: number;
}> = ({ active, icon, label, onClick, badge }) => (
    <button
        onClick={onClick}
        title={label}
        className={`w-full flex items-center justify-center p-1.5 rounded-[4px] relative transition-colors duration-150 ${
            active ? 'text-white' : 'text-slate-700 hover:text-slate-400'
        }`}
    >
        {icon}
        <CountBadge count={badge} className="absolute top-0.5 right-1" />
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
    const { pathname, search } = useLocation();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { handleLogout } = useAuth();
    const { league, room, leagueTeams , timeline, isSpectator } = useLeagueContext();
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
    // [2026-09-15 Fix] "올스타 투표 시작일에 보이고, 브레이크 종료일에 숨긴다" — 정확한 노출
    // 기간은 가상 캘린더 날짜를 실제로 비교해야 한다(hasPlayoffs 근사는 정규시즌 종료~
    // 플레이오프 시작 사이 공백 기간에 여전히 노출되는 오차가 있었음).
    const { schedule } = useSeasonContext();
    const currentVirtualDate = useCurrentVirtualDate(schedule, league?.type, league?.sim_real_start_at, league?.games_per_real_day, timeline);
    const showAllStar = isAllStarWindowActive(currentVirtualDate, league?.virtual_season_year ?? new Date().getFullYear(), league?.season_calendar);
    // [2026-10-15] 정규시즌 종료 30일 전부터 시즌 끝까지(브라켓 생성 후에도) "순위 경쟁" 메뉴 노출.
    const showPlayoffRace = usePlayoffRaceOpen(schedule, currentVirtualDate, league?.type);

    const base = `/multi/leagues/${leagueId}/season`;
    const isRosterActive = pathname.startsWith(`${base}/roster`);
    const isTransactionPath = pathname.startsWith(`${base}/transaction`);
    const isFaTab = new URLSearchParams(search).get('tab') === 'fa';

    // 받은 트레이드 제안 중 안읽은 것 개수 — 사이드바 트레이드 아이콘 배지용
    // (인박스 "메세지함" 탭 배지와 동일한 기준: to_team_read_at이 null인 것만 카운트)
    // [2026-09-07] MultiHeaderNavMenu.tsx와 완전히 동일한 조회를 각자 따로 하고 있어서
    // 공용 훅(usePendingTradeCount)으로 통합 — react-query가 같은 queryKey면 두 컴포넌트가
    // 동시에 마운트돼도 fetch를 한 번만 묶어서 실행한다(네트워크 요청 중복 제거).
    const roomId = room?.id ?? null;
    const myTeamDbId = myTeam?.id ?? null;
    const pendingTradeCount = usePendingTradeCount(roomId, myTeamDbId);
    // [2026-09-18] 개인 팩 드래프트(토너먼트) — 리그 상태는 토너먼트 시작 전까지 recruiting이라
    // isDraftComplete만으로는 팀 메뉴가 영영 안 열린다. "내 팀의 개인 드래프트 완료"를 기준으로
    // 드래프트 풀 메뉴는 숨기고 로스터/전술(팀 메뉴)은 미리 연다(요청). 순위표~자유계약 등
    // 리그 메뉴는 여전히 토너먼트 시작(in_progress) 후에만.
    const isPersonalDraft = !!league?.personal_draft_format;
    const personalDraftStatus = usePersonalDraftStatus(roomId, myTeamDbId, isPersonalDraft);
    const myPersonalDraftDone = personalDraftStatus === 'completed';
    // [2026-10-19] 관전자는 드래프트 풀·전술·트레이드/자유 계약·올스타(투표) 메뉴가 없다 — 읽기 전용 메뉴만.
    const showPoolMenu  = !isSpectator && !isDraftComplete && !myPersonalDraftDone;
    const showTeamMenus = isDraftComplete || myPersonalDraftDone;

    // 프로필 메뉴 — [2026-10-13] 직접 구현하던 body 포탈·바깥클릭 닫기·좌표 계산을 공용 Dropdown
    // (`side="right"`)으로 이관. 열림 상태만 여기서 들고 있는 이유는 트리거 NavItem의 active 표시 때문.
    // "팀 설정"은 모달이 아니라 로스터 화면(내 팀)의 "팀 설정" 탭으로, "세션 설정"은 MultiSeasonLayout
    // 하위 라우트(season/settings)로 이동해 사이드바/헤더를 유지한 채 바디만 스왑한다(2026-09-04/05 요청).
    // 팀을 아직 선점 안 했으면 "팀 설정"은 숨김.
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuLabel = (icon: React.ReactNode, text: string) => (
        <span className="flex items-center gap-3">{icon}{text}</span>
    );
    const profileMenuItems = [
        ...(isAdmin ? [{ id: 'settings', label: menuLabel(<Settings2 size={14} />, '세션 설정'), onClick: () => navigate(`${base}/settings`) }] : []),
        ...(myTeam  ? [{ id: 'team',     label: menuLabel(<Palette size={14} />, '팀 설정'),    onClick: () => navigate(`${base}/roster?rteam=${myTeam.team_slug}&tab=settings`) }] : []),
        { id: 'home',   label: menuLabel(<ChevronLeft size={14} />, '홈으로'), onClick: () => navigate('/'), dividerBefore: !!(isAdmin || myTeam) },
        { id: 'logout', label: menuLabel(<LogOut size={14} />, '로그아웃'),    onClick: handleLogout, dividerBefore: true },
    ];

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
                {showPoolMenu && (
                    <NavItem
                        active={pathname.startsWith(`${base}/pool`)}
                        icon={<NavIcon name="pool" active={pathname.startsWith(`${base}/pool`)} />}
                        label="드래프트 풀"
                        onClick={() => navigate(`${base}/pool`)}
                    />
                )}
                {/* [2026-09-11 후속] "리그 메뉴도 모두 숨겨줘야, 홈/뉴스/드래프트풀 3개만
                    접근 가능해야" 요청 — 로스터/전술뿐 아니라 순위표~자유계약, 어드민 팀
                    관리까지 드래프트 완료 전엔 전부 숨긴다(구분선 포함).
                    [2026-09-18] 개인 팩 드래프트는 내 드래프트가 끝나면 팀 메뉴(로스터/전술)만 먼저 연다. */}
                {showTeamMenus && (
                    <>
                        <NavItem
                            active={isRosterActive}
                            icon={<RosterIcon active={isRosterActive} primary={myTeam?.color_primary} secondary={myTeam?.color_secondary} text={myTeam?.color_text} />}
                            label="로스터"
                            onClick={() => navigate(myTeam ? `${base}/roster?rteam=${myTeam.team_slug}` : `${base}/roster`)}
                        />
                        {!isSpectator && (
                            <NavItem
                                active={pathname.startsWith(`${base}/tactics`)}
                                icon={<NavIcon name="tactics" active={pathname.startsWith(`${base}/tactics`)} />}
                                label="전술"
                                onClick={() => navigate(`${base}/tactics`)}
                            />
                        )}
                    </>
                )}
                {isDraftComplete && (
                    <>
                        <Divider />

                        {/* [2026-10-14] 기간 한정 메뉴(플레이오프 → 올스타)를 순위표보다 위에 — 사용자 지시 */}
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
                            세션에서는 기능 자체가 동작하지 않으므로 메뉴도 숨긴다.
                            [2026-09-15 Fix] 투표 시작일(allStarVoteStart)에 나타나고 브레이크
                            종료일(allStarEnd)에 사라지도록 가상 캘린더 날짜를 실제로 비교한다
                            (showAllStar, isAllStarWindowActive) — 원래는 tournament 여부만
                            체크하고 기간 조건이 아예 없어 끝나도 안 사라지던 버그. */}
                        {!isSpectator && league?.type !== 'tournament' && showAllStar && (
                            <NavItem
                                active={pathname.startsWith(`${base}/allstar`)}
                                icon={<NavIcon name="allstar" active={pathname.startsWith(`${base}/allstar`)} />}
                                label="올스타"
                                onClick={() => navigate(`${base}/allstar`)}
                            />
                        )}
                        <NavItem
                            active={pathname.startsWith(`${base}/standings`)}
                            icon={<NavIcon name="standings" active={pathname.startsWith(`${base}/standings`)} />}
                            label="순위표"
                            onClick={() => navigate(`${base}/standings`)}
                        />
                        {showPlayoffRace && (
                            <NavItem
                                active={pathname.startsWith(`${base}/race`)}
                                icon={<NavIcon name="race" active={pathname.startsWith(`${base}/race`)} />}
                                label="순위 경쟁"
                                onClick={() => navigate(`${base}/race`)}
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
                        {/* [2026-10-14] 리그 메뉴(순위~일정)와 선수 이동 메뉴(트레이드·자유 계약) 사이 구분선 */}
                        {!isSpectator && (<>
                        <Divider />
                        {/* [2026-10-14] 자유 계약은 트레이드 화면의 ?tab=fa 하위 탭 — 아이콘은 둘 다 두고 활성 판정만 탭으로 가른다. */}
                        <NavItem
                            active={isTransactionPath && !isFaTab}
                            icon={<NavIcon name="transactions" active={isTransactionPath && !isFaTab} />}
                            label="트레이드"
                            onClick={() => navigate(`${base}/transaction`)}
                            badge={pendingTradeCount}
                        />
                        <NavItem
                            active={isTransactionPath && isFaTab}
                            icon={<NavIcon name="free-agents" active={isTransactionPath && isFaTab} />}
                            label="자유 계약"
                            onClick={() => navigate(`${base}/transaction?tab=fa`)}
                        />
                        </>)}
                        {/* [2026-10-18] 도구 메뉴(헤더 "도구" 드롭다운과 동일 항목) */}
                        <Divider />
                        <NavItem
                            active={pathname.startsWith(`${base}/compare`)}
                            icon={<NavIcon name="compare" active={pathname.startsWith(`${base}/compare`)} />}
                            label="선수 비교"
                            onClick={() => navigate(`${base}/compare`)}
                        />

                    </>
                )}
            </nav>

            <div className="flex flex-col items-center gap-6 py-6 shrink-0 relative z-10">
                <Dropdown
                    className="w-full"
                    side="right"
                    width="w-48"
                    isOpen={isMenuOpen}
                    onOpenChange={setIsMenuOpen}
                    items={profileMenuItems}
                    trigger={<NavItem active={isMenuOpen} icon={<CircleUser size={24} />} label="프로필" />}
                />
            </div>
        </aside>
    );
};
