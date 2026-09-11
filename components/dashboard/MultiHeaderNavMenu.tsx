
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { MultiGlobalSearch } from './MultiGlobalSearch';
import { usePendingTradeCount } from '../../hooks/usePendingTradeCount';
import type { Player } from '../../types';
import type { LeagueTeamRow } from '../../services/multi/roomQueries';

interface MultiHeaderNavMenuProps {
    leagueTeams:   LeagueTeamRow[];
    poolPlayers:   Player[];
    rosterMap:     Map<string, string>;
    myTeamId?:     string | null;
    roomId?:       string | null;
    hasPlayoffs?:  boolean;
    /** tournament 세션 여부 — 올스타는 main_league 전용 기능이라 tournament에서는 메뉴에서 제외한다. */
    isTournament?: boolean;
    /** 리그 샐러리캡 마스터 스위치 — 켜져 있을 때만 "내 팀" 드롭다운에 "재정" 항목 노출. */
    capEnabled?:   boolean;
    /** 드래프트 완료 여부(league.status가 in_progress/finished) — false면 "내 팀"/"전술"
     * 탭 자체를 숨긴다(드래프트 전엔 로스터가 비어있어 두 메뉴가 빈 화면으로 이어짐). */
    isDraftComplete?: boolean;
    onViewPlayer:  (player: Player, teamSlug: string | null) => void;
    onViewTeam:    (teamSlug: string) => void;
}

type DropdownId = 'team' | 'tactics' | 'league' | null;

interface DropdownItem {
    label: string;
    path: string;
    /** 실제 navigate() 대상 — 쿼리 파라미터 포함. 미지정 시 path를 그대로 사용. */
    navTo?: string;
    /** roster/tactics처럼 한 페이지 안에서 ?tab= 으로 하위 화면을 나누는 경우의 판별용 값. */
    tabValue?: string;
    dividerBefore?: boolean;
    badge?: number;
}

// [2026-09-07] MultiHeader.tsx는 "다음 경기까지 남은 시간" 카운트다운 때문에 정말로 매초
// 리렌더돼야 한다(다른 화면들의 useServerClock 오남용과는 다른, 정당한 케이스) — 그런데
// 이 네비 메뉴(검색창/드롭다운/트레이드 배지)는 그 카운트다운과 무관한데도 부모가 리렌더될
// 때마다 매초 같이 리렌더되고 있었다. props가 전부 값 기준으로 안정적이라(참조는 리렌더마다
// 새로 만들어져도 값 자체는 안 바뀜) React.memo로 감싸면 부모의 매초 리렌더를 여기서 차단할
// 수 있다 — 실제 네비게이션/검색 등 이 컴포넌트 자신의 상태 변화로 인한 리렌더는 그대로 동작.
export const MultiHeaderNavMenu: React.FC<MultiHeaderNavMenuProps> = React.memo(({
    leagueTeams,
    poolPlayers,
    rosterMap,
    myTeamId,
    roomId,
    hasPlayoffs,
    isTournament,
    capEnabled,
    isDraftComplete,
    onViewPlayer,
    onViewTeam,
}) => {
    const navigate         = useNavigate();
    const { pathname, search } = useLocation();
    const { leagueId }     = useParams<{ leagueId: string }>();

    // 받은 트레이드 제안(대기중) 개수 — "프론트 오피스" 탭 배지용
    // [2026-09-07] MultiSidebar.tsx와 완전히 동일한 조회를 각자 따로 하고 있어서 공용 훅
    // (usePendingTradeCount)으로 통합 — react-query가 같은 queryKey면 두 컴포넌트가 동시에
    // 마운트돼도 fetch를 한 번만 묶어서 실행한다(네트워크 요청 중복 제거).
    const myTeamDbId = leagueTeams.find(t => t.team_slug === myTeamId)?.id ?? null;
    const pendingTradeCount = usePendingTradeCount(roomId, myTeamDbId);
    const base          = `/multi/leagues/${leagueId}/season`;

    const [openDropdown, setOpenDropdown] = useState<DropdownId>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggle = (id: DropdownId) =>
        setOpenDropdown(prev => (prev === id ? null : id));

    const handleNav = (path: string) => {
        setOpenDropdown(null);
        navigate(path);
    };

    // [2026-08-27] 프랜차이즈 시뮬레이션 게임(Basketball GM류) 참고 디자인 — 알약형 팀컬러
    // 하이라이트 대신 각진 슬레이트 계열 플랫 하이라이트로 통일.
    // 헤더 실제 콘텐츠 높이(h-10=40px - border-b 1px)에 정확히 맞춘 고정 높이 —
    // padding 기반 높이(py-*)로는 항상 헤더 높이와 딱 안 맞아 하이라이트 위아래로
    // 미세한 틈이 생김.
    const tabBase    = 'flex items-center gap-1 px-4 h-[39px] text-base font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap select-none';
    // 드롭다운이 펼쳐진 상태(패널과 이어져 보여야 함)만 배경 하이라이트를 쓰고, 단순히
    // "현재 페이지가 여기다" 상태는 배경 없이 흰 텍스트만 — 두 상태를 시각적으로 구분.
    const tabOpen       = 'bg-slate-700 text-white';
    const tabActivePage = 'text-white';
    const tabDefault    = 'text-slate-400 hover:text-white hover:bg-slate-800';

    const isHomeActive    = pathname === base;
    const isTeamActive    = pathname.startsWith(`${base}/roster`);
    const isTacticsActive = pathname.startsWith(`${base}/tactics`);
    const isLeagueActive  = pathname.startsWith(`${base}/standings`) || pathname.startsWith(`${base}/leaderboard`)
        || pathname.startsWith(`${base}/schedule`) || pathname.startsWith(`${base}/transaction`)
        || pathname.startsWith(`${base}/playoffs`);

    // tabValue가 있으면 같은 경로 안에서 ?tab= 값까지 맞아야 활성 처리(로스터/전술처럼
    // 한 페이지가 여러 하위 화면을 쿼리파라미터로 나누는 경우).
    const isItemActive = (item: DropdownItem) => {
        if (pathname !== item.path) return false;
        if (item.tabValue === undefined) return true;
        return new URLSearchParams(search).get('tab') === item.tabValue;
    };

    // rteam=내 팀 슬러그를 모든 로스터 하위 탭에 공통으로 붙여, 헤더에서 들어갈 때 항상
    // 내 팀 기준으로 열리게 한다.
    const rosterNavTo = (tab: string) =>
        `${base}/roster?tab=${tab}${myTeamId ? `&rteam=${myTeamId}` : ''}`;

    const teamItems: DropdownItem[] = [
        { label: '로스터',    path: `${base}/roster`, navTo: rosterNavTo('overview'),   tabValue: 'overview' },
        { label: '능력치',    path: `${base}/roster`, navTo: rosterNavTo('attributes'), tabValue: 'attributes' },
        { label: '선수 기록', path: `${base}/roster`, navTo: rosterNavTo('stats'),      tabValue: 'stats' },
        { label: '경기 기록', path: `${base}/roster`, navTo: rosterNavTo('records'),    tabValue: 'records' },
        { label: '일정',      path: `${base}/roster`, navTo: rosterNavTo('schedule'),   tabValue: 'schedule' },
        // 리그 샐러리캡이 켜져 있을 때만 노출 — RosterView도 capSettings 미전달 시 동일하게 숨김.
        ...(capEnabled ? [{ label: '재정', path: `${base}/roster`, navTo: rosterNavTo('finance'), tabValue: 'finance' }] : []),
    ];

    const tacticsItems: DropdownItem[] = [
        { label: '뎁스 차트', path: `${base}/tactics`, navTo: `${base}/tactics?tab=depth`,    tabValue: 'depth' },
        { label: '팀 전술',   path: `${base}/tactics`, navTo: `${base}/tactics?tab=team`,     tabValue: 'team' },
        { label: '인사이트',  path: `${base}/tactics`, navTo: `${base}/tactics?tab=insights`, tabValue: 'insights' },
        { label: '개인 전술', path: `${base}/tactics`, navTo: `${base}/tactics?tab=player`,   tabValue: 'player' },
    ];

    const leagueItems: DropdownItem[] = [
        { label: '순위표',    path: `${base}/standings` },
        ...(hasPlayoffs ? [{ label: '플레이오프', path: `${base}/playoffs` }] : []),
        ...(isTournament ? [] : [{ label: '올스타', path: `${base}/allstar` }]),
        { label: '리더보드',  path: `${base}/leaderboard` },
        { label: '일정',      path: `${base}/schedule` },
        { label: '트레이드',  path: `${base}/transaction`, badge: pendingTradeCount },
    ];

    // 각진 플랫 드롭다운 — 버튼 바로 아래 틈 없이 붙고(mt-0), 항목은 알약형 칩이 아니라
    // 전체 폭을 채우는 플랫 행으로 표시(참고 이미지 스타일).
    const DropdownPanel: React.FC<{ items: DropdownItem[]; minWidth?: string }> = ({
        items,
        minWidth = '180px',
    }) => (
        <div
            className="absolute top-full right-0 mt-0 bg-slate-900 border border-slate-700 flex flex-col z-[200]"
            style={{ minWidth }}
        >
            {items.map(item => {
                const active = isItemActive(item);
                return (
                    <React.Fragment key={item.navTo ?? item.path}>
                        {item.dividerBefore && <div className="border-t border-slate-700" />}
                        <button
                            onClick={() => handleNav(item.navTo ?? item.path)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm text-left transition-colors ${
                                active
                                    ? 'bg-slate-800 text-white font-semibold'
                                    : 'font-medium text-slate-400 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            {item.label}
                            {!!item.badge && (
                                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold shrink-0">
                                    {item.badge > 9 ? '9+' : item.badge}
                                </span>
                            )}
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );

    return (
        <div ref={containerRef} className="flex items-center gap-6">
            {/* 검색창 — 메뉴보다 먼저(좌측) 배치. 드래프트 완료 전엔 검색 대상(로스터/선수)
                자체가 의미 없어 숨김. */}
            {isDraftComplete && (
                <MultiGlobalSearch
                    leagueTeams={leagueTeams}
                    poolPlayers={poolPlayers}
                    rosterMap={rosterMap}
                    onViewPlayer={onViewPlayer}
                    onViewTeam={onViewTeam}
                />
            )}

            {/* Nav 탭 묶음 */}
            <div className="flex items-center gap-0">
                {/* 홈 */}
                <button
                    onClick={() => navigate(base)}
                    className={`${tabBase} ${isHomeActive ? tabActivePage : tabDefault}`}
                >
                    홈
                </button>

                {/* 내 팀 / 전술 — 드래프트 완료 전엔 로스터가 없어 숨김 */}
                {isDraftComplete && (
                    <>
                        <div className="relative">
                            <button
                                onClick={() => toggle('team')}
                                className={`${tabBase} ${openDropdown === 'team' ? tabOpen : isTeamActive ? tabActivePage : tabDefault}`}
                            >
                                내 팀
                                {openDropdown === 'team'
                                    ? <ChevronUp size={16} className="shrink-0" />
                                    : <ChevronDown size={16} className="shrink-0" />
                                }
                            </button>
                            {openDropdown === 'team' && <DropdownPanel items={teamItems} minWidth="140px" />}
                        </div>

                        <div className="relative">
                            <button
                                onClick={() => toggle('tactics')}
                                className={`${tabBase} ${openDropdown === 'tactics' ? tabOpen : isTacticsActive ? tabActivePage : tabDefault}`}
                            >
                                전술
                                {openDropdown === 'tactics'
                                    ? <ChevronUp size={16} className="shrink-0" />
                                    : <ChevronDown size={16} className="shrink-0" />
                                }
                            </button>
                            {openDropdown === 'tactics' && <DropdownPanel items={tacticsItems} minWidth="140px" />}
                        </div>
                    </>
                )}

                {/* 리그 — 드래프트 완료 전엔 숨김(홈/뉴스/드래프트 풀만 접근 가능해야 함) */}
                {isDraftComplete && (
                    <div className="relative">
                        <button
                            onClick={() => toggle('league')}
                            className={`${tabBase} relative ${openDropdown === 'league' ? tabOpen : isLeagueActive ? tabActivePage : tabDefault}`}
                        >
                            리그
                            {openDropdown === 'league'
                                ? <ChevronUp size={16} className="shrink-0" />
                                : <ChevronDown size={16} className="shrink-0" />
                            }
                            {pendingTradeCount > 0 && (
                                <span className="absolute -top-1.5 -right-2.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold">
                                    {pendingTradeCount > 9 ? '9+' : pendingTradeCount}
                                </span>
                            )}
                        </button>
                        {openDropdown === 'league' && <DropdownPanel items={leagueItems} />}
                    </div>
                )}
            </div>{/* end Nav 탭 묶음 */}
        </div>
    );
});
MultiHeaderNavMenu.displayName = 'MultiHeaderNavMenu';
