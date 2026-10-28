// useSeasonNavModel.ts — 시즌 내비 항목의 노출 조건·경로·활성 판정을 한 곳에. [2026-10-27 모바일 셸]
// MultiSidebar.tsx가 들고 있던 조건(드래프트 완료 전 숨김, 개인 팩 드래프트, 올스타 기간, 순위 경쟁 창, 관전자 등)을
// 모바일 더보기 화면(MobileMoreView)·탭 바·레일이 같은 기준으로 쓰도록 모델로 뽑았다. 사이드바 자체는 아직 자기
// JSX를 그대로 두고 있다(동작 변경 없음) — 항목을 추가/숨길 때는 두 곳을 같이 고칠 것.
import { useLocation, useParams } from 'react-router-dom';
import { useLeagueContext } from '../../views/multi/league/LeagueLayout';
import { useGame } from '../../hooks/useGameContext';
import { usePendingTradeCount } from '../../hooks/usePendingTradeCount';
import { usePersonalDraftStatus } from '../../hooks/usePersonalDraftStatus';
import { useSeasonContext } from '../../views/multi/season/seasonContext';
import { useCurrentVirtualDate } from '../../hooks/useCurrentVirtualDate';
import { isAllStarWindowActive } from '../../utils/allStarSelection';
import { usePlayoffRaceOpen } from '../../hooks/usePlayoffRaceOpen';
import type { SidenavIconName } from './navIcons';

export interface SeasonNavItem {
    id: string;
    label: string;
    icon: SidenavIconName;
    path: string;
    active: boolean;
    badge?: number;
    /** 조건부 항목의 노출 조건 설명(더보기 리스트 보조 글자) */
    note?: string;
    /** 이 항목 앞에 구분선 */
    dividerBefore?: boolean;
}

export interface SeasonNavModel {
    base: string;
    items: SeasonNavItem[];
    isAdmin: boolean;
    isSpectator: boolean;
    myTeam: ReturnType<typeof useLeagueContext>['leagueTeams'][number] | undefined;
    currentVirtualDate: string | null;
    isDraftComplete: boolean;
    pendingTradeCount: number;
}

export function useSeasonNavModel(): SeasonNavModel {
    const { pathname, search } = useLocation();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, room, leagueTeams, timeline, isSpectator } = useLeagueContext();
    const { session } = useGame();
    const { schedule } = useSeasonContext();

    const isAdmin = !!(league && session?.user?.id && league.admin_user_id === session.user.id);
    const myTeam = leagueTeams.find(t => t.user_id === session?.user?.id);
    const hasPlayoffs = !!league?.bracket_data && league?.type !== 'tournament';
    const isDraftComplete = league?.status === 'in_progress' || league?.status === 'finished';
    const currentVirtualDate = useCurrentVirtualDate(schedule, league?.type, league?.sim_real_start_at, league?.games_per_real_day, timeline);
    const showAllStar = isAllStarWindowActive(currentVirtualDate, league?.virtual_season_year ?? new Date().getFullYear(), league?.season_calendar);
    const showPlayoffRace = usePlayoffRaceOpen(schedule, currentVirtualDate, league?.type);

    const base = `/multi/leagues/${leagueId}/season`;
    const isRosterActive = pathname.startsWith(`${base}/roster`);
    const isTransactionPath = pathname.startsWith(`${base}/transaction`);
    const isFaTab = new URLSearchParams(search).get('tab') === 'fa';

    const roomId = room?.id ?? null;
    const myTeamDbId = myTeam?.id ?? null;
    const pendingTradeCount = usePendingTradeCount(roomId, myTeamDbId);
    const isPersonalDraft = !!league?.personal_draft_format;
    const personalDraftStatus = usePersonalDraftStatus(roomId, myTeamDbId, isPersonalDraft);
    const myPersonalDraftDone = personalDraftStatus === 'completed';
    const showPoolMenu = !isSpectator && !isDraftComplete && !myPersonalDraftDone;
    const showTeamMenus = isDraftComplete || myPersonalDraftDone;

    const items: SeasonNavItem[] = [];
    const starts = (seg: string) => pathname.startsWith(`${base}/${seg}`);

    items.push({ id: 'home', label: '홈', icon: 'home', path: base, active: pathname === base || pathname === `${base}/` });
    items.push({ id: 'news', label: '뉴스피드', icon: 'news', path: `${base}/news`, active: starts('news') });
    if (showPoolMenu) items.push({ id: 'pool', label: '드래프트 풀', icon: 'pool', path: `${base}/pool`, active: starts('pool'), note: '드래프트 전·중에만' });
    if (showTeamMenus) {
        items.push({ id: 'roster', label: '로스터', icon: 'team', path: myTeam ? `${base}/roster?rteam=${myTeam.team_slug}` : `${base}/roster`, active: isRosterActive });
        if (!isSpectator) items.push({ id: 'tactics', label: '전술', icon: 'tactics', path: `${base}/tactics`, active: starts('tactics') });
    }
    if (isDraftComplete) {
        let first = true;
        const push = (it: SeasonNavItem) => { items.push({ ...it, dividerBefore: first }); first = false; };
        if (hasPlayoffs) push({ id: 'playoffs', label: '플레이오프', icon: 'playoffs', path: `${base}/playoffs`, active: starts('playoffs'), note: '포스트시즌에만' });
        if (!isSpectator && league?.type !== 'tournament' && showAllStar) push({ id: 'allstar', label: '올스타', icon: 'allstar', path: `${base}/allstar`, active: starts('allstar'), note: '올스타 기간에만' });
        push({ id: 'standings', label: '순위표', icon: 'standings', path: `${base}/standings`, active: starts('standings') });
        if (showPlayoffRace) push({ id: 'race', label: '순위 경쟁', icon: 'race', path: `${base}/race`, active: starts('race'), note: '정규시즌 막판에만' });
        push({ id: 'leaderboard', label: '리더보드', icon: 'leaderboard', path: `${base}/leaderboard`, active: starts('leaderboard') });
        push({ id: 'schedule', label: '일정', icon: 'schedule', path: `${base}/schedule`, active: starts('schedule') });
        if (!isSpectator) {
            items.push({ id: 'transaction', label: '트레이드', icon: 'transactions', path: `${base}/transaction`, active: isTransactionPath && !isFaTab, badge: pendingTradeCount, dividerBefore: true });
            items.push({ id: 'fa', label: '자유 계약', icon: 'free-agents', path: `${base}/transaction?tab=fa`, active: isTransactionPath && isFaTab });
        }
    }
    items.push({ id: 'compare', label: '선수 비교', icon: 'compare', path: `${base}/compare`, active: starts('compare'), dividerBefore: true });

    return { base, items, isAdmin, isSpectator, myTeam, currentVirtualDate, isDraftComplete, pendingTradeCount };
}
