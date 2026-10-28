// MobileTabBar.tsx — 폰(<768) 하단 탭 바 5개. [2026-10-27 모바일 셸]
// docs/ui/mobile-design-system.md §8-1·§8-2, 캔버스 1행 Components.dc.html T1~T5.
// 높이 56 + 안전 영역, slate-950 바탕 + 상단 1px slate-800. 아이콘은 사이드바와 같은 public/images/sidenav 스왑 방식
// (활성 글자 #00D492), 필·인디고 없음. 항목 히트 = 56 × 폭/5. 탭 재탭 = 그 탭 루트로 이동 + 본문 최상단.
// 배지: 경기 = 내 팀 라이브 빨간 점, 더보기 = 미처리 트레이드 오퍼 + 안 읽은 채팅·알림 수(CountBadge 9+ 캡).
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../../views/multi/league/LeagueLayout';
import { useGame } from '../../hooks/useGameContext';
import { useMyNextGame } from '../../hooks/useMyNextGame';
import { usePendingTradeCount } from '../../hooks/usePendingTradeCount';
import { useChatDockUnread } from '../multi/chatDockBridge';
import { CountBadge } from '../common/CountBadge';
import { NavIcon, RosterIcon, MoreIcon } from '../nav/navIcons';

export const MOBILE_TAB_BAR_HEIGHT = 56;
/** 본문 스크롤 컨테이너 id — 탭 재탭 시 최상단 스크롤에 쓴다(MultiSeasonLayout이 붙임). */
export const SEASON_SCROLL_ID = 'season-scroll';

type TabId = 'home' | 'team' | 'games' | 'league' | 'more';

const TEAM_SEGMENTS = ['roster', 'tactics', 'player', 'negotiate', 'release'];
const GAME_SEGMENTS = ['schedule', 'game', 'playoffs', 'allstar'];
const LEAGUE_SEGMENTS = ['standings', 'race', 'leaderboard', 'news', 'pool', 'draft-result'];
const MORE_SEGMENTS = ['more', 'transaction', 'settings', 'compare'];

function firstSegment(pathname: string, base: string): string {
    if (!pathname.startsWith(base)) return '';
    return pathname.slice(base.length).replace(/^\/+/, '').split('/')[0] ?? '';
}

/** 입력 포커스(소프트 키보드) 중엔 탭 바를 숨긴다 — iOS에서 키보드 위로 떠오르는 문제(§8-2). */
function useKeyboardOpen(): boolean {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const isField = (el: EventTarget | null) => {
            const t = el as HTMLElement | null;
            if (!t || !t.tagName) return false;
            const tag = t.tagName.toLowerCase();
            return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
        };
        const onIn = (e: FocusEvent) => { if (isField(e.target)) setOpen(true); };
        const onOut = () => setOpen(false);
        document.addEventListener('focusin', onIn);
        document.addEventListener('focusout', onOut);
        return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); };
    }, []);
    return open;
}

export const MobileTabBar: React.FC = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, room, leagueTeams, isSpectator } = useLeagueContext();
    const { session } = useGame();
    const base = `/multi/leagues/${leagueId}/season`;
    const seg = firstSegment(pathname, base);

    const myTeam = leagueTeams.find(t => t.user_id === session?.user?.id);
    const isDraftComplete = league?.status === 'in_progress' || league?.status === 'finished';
    // 내 팀 라이브 경기 — 상단 바·홈 배지와 같은 판정(useMyNextGame).
    const hasMyLive = !!useMyNextGame({ tick: 'bucket' }).liveGame;

    const pendingTrades = usePendingTradeCount(room?.id ?? null, myTeam?.id ?? null);
    const chatUnread = useChatDockUnread();
    const moreBadge = (isSpectator ? 0 : pendingTrades) + chatUnread;

    const keyboardOpen = useKeyboardOpen();
    // [2026-10-28] 경기 화면도 탭 바 유지(§9-7 개정 — 멀티 경기 화면엔 재생 컨트롤이 없어 takeover 불필요). 옛 규칙: seg === 'game'이면 숨김.
    const hidden = keyboardOpen;

    const active: TabId = seg === '' ? 'home'
        : TEAM_SEGMENTS.includes(seg) ? 'team'
        : GAME_SEGMENTS.includes(seg) ? 'games'
        : LEAGUE_SEGMENTS.includes(seg) ? 'league'
        : MORE_SEGMENTS.includes(seg) ? 'more'
        : 'home';

    // 탭 루트 — 드래프트 전엔 "팀"이 드래프트 풀, "경기"는 일정 그대로(빈 화면이면 각 화면이 안내).
    const roots: Record<TabId, string> = {
        home: base,
        team: isDraftComplete && myTeam ? `${base}/roster?rteam=${myTeam.team_slug}` : isDraftComplete ? `${base}/roster` : `${base}/pool`,
        games: `${base}/schedule`,
        league: `${base}/standings`,
        more: `${base}/more`,
    };

    const go = (id: TabId) => {
        navigate(roots[id]);
        if (id === active) document.getElementById(SEASON_SCROLL_ID)?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (hidden) return null;

    const items: { id: TabId; label: string; icon: React.ReactNode; badge?: React.ReactNode }[] = [
        { id: 'home', label: '홈', icon: <NavIcon name="home" active={active === 'home'} /> },
        { id: 'team', label: '팀', icon: <RosterIcon active={active === 'team'} primary={myTeam?.color_primary} secondary={myTeam?.color_secondary} text={myTeam?.color_text} /> },
        {
            id: 'games', label: '경기', icon: <NavIcon name="schedule" active={active === 'games'} />,
            badge: hasMyLive ? <span aria-label="내 팀 경기 진행 중" className="absolute top-1.5 right-[calc(50%-18px)] w-2 h-2 rounded-full bg-red-500 ring-2 ring-slate-950" /> : undefined,
        },
        { id: 'league', label: '순위', icon: <NavIcon name="standings" active={active === 'league'} /> },
        {
            id: 'more', label: '더보기', icon: <MoreIcon active={active === 'more'} />,
            badge: <CountBadge count={moreBadge} size="md" className="absolute top-1 right-[calc(50%-20px)] ring-2 ring-slate-950" />,
        },
    ];

    return (
        <nav
            aria-label="주 탭"
            className="fixed bottom-0 inset-x-0 z-header bg-slate-950 border-t border-slate-800 pb-safe"
        >
            <div className="flex" style={{ height: MOBILE_TAB_BAR_HEIGHT }}>
                {items.map(it => {
                    const on = it.id === active;
                    return (
                        <button
                            key={it.id}
                            type="button"
                            onClick={() => go(it.id)}
                            aria-current={on ? 'page' : undefined}
                            className="relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 active:bg-white/10"
                        >
                            {it.icon}
                            <span className={`text-2xs font-semibold leading-[14px] ${on ? 'text-[#00D492]' : 'text-slate-400'}`}>{it.label}</span>
                            {it.badge}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};
