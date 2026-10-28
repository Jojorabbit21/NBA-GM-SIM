// TabletNavRail.tsx — 태블릿(768~1023) 좌측 내비 레일 72. [2026-10-27 모바일 셸]
// docs/ui/mobile-design-system.md §8-4, 캔버스 Components.dc.html T6. 폰 탭 바와 같은 5개 묶음을 세로로,
// 아이콘 스왑 + #00D492 글자. 하단에 내 팀 로고 32(탭 → 더보기). 2단계 내비는 콘텐츠 영역 안 탭 바(§8-5).
import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../../views/multi/league/LeagueLayout';
import { useGame } from '../../hooks/useGameContext';
import { usePendingTradeCount } from '../../hooks/usePendingTradeCount';
import { useChatDockUnread } from '../multi/chatDockBridge';
import { CountBadge } from '../common/CountBadge';
import { TeamLogo } from '../common/TeamLogo';
import { NavIcon, RosterIcon, MoreIcon } from '../nav/navIcons';

type TabId = 'home' | 'team' | 'games' | 'league' | 'more';
const TEAM_SEGMENTS = ['roster', 'tactics', 'player', 'negotiate', 'release'];
const GAME_SEGMENTS = ['schedule', 'game', 'playoffs', 'allstar'];
const LEAGUE_SEGMENTS = ['standings', 'race', 'leaderboard', 'news', 'pool', 'draft-result'];
const MORE_SEGMENTS = ['more', 'transaction', 'settings', 'compare'];

export const TabletNavRail: React.FC = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, room, leagueTeams, isSpectator } = useLeagueContext();
    const { session } = useGame();
    const base = `/multi/leagues/${leagueId}/season`;
    const seg = pathname.startsWith(base) ? (pathname.slice(base.length).replace(/^\/+/, '').split('/')[0] ?? '') : '';
    const myTeam = leagueTeams.find(t => t.user_id === session?.user?.id);
    const isDraftComplete = league?.status === 'in_progress' || league?.status === 'finished';
    const pendingTrades = usePendingTradeCount(room?.id ?? null, myTeam?.id ?? null);
    const chatUnread = useChatDockUnread();
    const moreBadge = (isSpectator ? 0 : pendingTrades) + chatUnread;

    const active: TabId = seg === '' ? 'home'
        : TEAM_SEGMENTS.includes(seg) ? 'team'
        : GAME_SEGMENTS.includes(seg) ? 'games'
        : LEAGUE_SEGMENTS.includes(seg) ? 'league'
        : MORE_SEGMENTS.includes(seg) ? 'more' : 'home';
    const roots: Record<TabId, string> = {
        home: base,
        team: isDraftComplete && myTeam ? `${base}/roster?rteam=${myTeam.team_slug}` : isDraftComplete ? `${base}/roster` : `${base}/pool`,
        games: `${base}/schedule`,
        league: `${base}/standings`,
        more: `${base}/more`,
    };
    const items: { id: TabId; label: string; icon: React.ReactNode; badge?: number }[] = [
        { id: 'home', label: '홈', icon: <NavIcon name="home" active={active === 'home'} /> },
        { id: 'team', label: '팀', icon: <RosterIcon active={active === 'team'} primary={myTeam?.color_primary} secondary={myTeam?.color_secondary} text={myTeam?.color_text} /> },
        { id: 'games', label: '경기', icon: <NavIcon name="schedule" active={active === 'games'} /> },
        { id: 'league', label: '순위', icon: <NavIcon name="standings" active={active === 'league'} /> },
        { id: 'more', label: '더보기', icon: <MoreIcon active={active === 'more'} />, badge: moreBadge },
    ];

    return (
        <aside className="w-[72px] shrink-0 flex flex-col bg-slate-950 border-r border-slate-800 pt-safe">
            <nav aria-label="주 메뉴" className="flex-1 flex flex-col items-stretch gap-1 pt-2">
                {items.map(it => {
                    const on = it.id === active;
                    return (
                        <button
                            key={it.id}
                            type="button"
                            onClick={() => navigate(roots[it.id])}
                            aria-current={on ? 'page' : undefined}
                            className="relative h-14 flex flex-col items-center justify-center gap-0.5 active:bg-white/10"
                        >
                            {it.icon}
                            <span className={`text-2xs font-semibold leading-[14px] ${on ? 'text-[#00D492]' : 'text-slate-400'}`}>{it.label}</span>
                            <CountBadge count={it.badge} size="md" className="absolute top-1 right-3 ring-2 ring-slate-950" />
                        </button>
                    );
                })}
            </nav>
            {myTeam && (
                <button type="button" onClick={() => navigate(`${base}/more`)} aria-label="내 팀 메뉴" className="h-16 flex items-center justify-center pb-safe active:bg-white/10">
                    <TeamLogo teamId={myTeam.team_slug} teamName={myTeam.team_abbr} size="custom" className="w-8 h-8" shadow={false} />
                </button>
            )}
        </aside>
    );
};
