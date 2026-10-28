
import React, { useMemo, useState } from 'react';
import { Spinner } from '../../../components/common/Spinner';
import { EmptyState } from '../../../components/common/EmptyState';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useIsPhone } from '../../../hooks/useViewportClass';
import { MobilePushHeader } from '../../../components/mobile/MobilePushHeader';
import { MOBILE_TAB_BAR_HEIGHT } from '../../../components/mobile/MobileTabBar';

import { Button } from '../../../components/common/Button';
import { usePlayerNews, type LeagueEvent } from '../../../hooks/useLeagueHeadlines';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { formatRelativeTime } from '../../../utils/formatRelativeTime';
import { StoryCard, extractEventPlayerIds } from './newsFeedCards';
import { buildPlayerCardMap, mergeStatsIntoPlayerCardMap } from '../../../components/common/PlayerHoverCard';
import { usePlayerSeasonStatsFull } from '../../../hooks/usePlayerSeasonStatsFull';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { useLeagueContext } from '../league/LeagueLayout';

// [2026-10-07] 선수 프로필 "뉴스" 탭 — 이 선수가 player_ids에 포함된 league_events를 뉴스 피드
// (MultiNewsFeedView.tsx)와 같은 좌측 리스트 + 우측 StoryCard 본문 레이아웃으로 표시.
function formatSimDateShort(simDate: string): string {
    const [y, m, d] = simDate.split('-');
    return y && m && d ? `${y.slice(2)}/${m}/${d}` : simDate;
}

interface Props {
    roomId: string | undefined;
    playerId: string;
    myTeamSlug: string | null;
    leagueTeams: LeagueTeamRow[];
    /** [2026-10-28] 폰 기사 화면 머리 제목("선수명 · 뉴스") */
    playerName?: string;
}

export const PlayerNewsTab: React.FC<Props> = ({ roomId, playerId, myTeamSlug, leagueTeams, playerName }) => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league } = useLeagueContext();
    const navigate = useNavigate();
    const { getGameUrlId } = useGameShortCodes(roomId);
    const { getPlayerUrlId } = usePlayerShortCodes();
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);
    const { stories, isLoading, hasMore, fetchNextPage, isFetchingNextPage } = usePlayerNews(roomId, playerId, myTeamSlug);
    const teamBySlug = useMemo(() => {
        const m = new Map<string, LeagueTeamRow>();
        for (const t of leagueTeams) m.set(t.team_slug, t);
        return m;
    }, [leagueTeams]);

    // 피드와 동일: id만 상태로 두고 선택 항목은 파생(목록이 바뀌면 맨 위로 폴백).
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    // [2026-10-28] 폰(§9-2, 목업 P11·P12): 목록 전폭 → 행 탭 = `?story=` push → 기사 화면(뉴스피드 폰판과 같은 방식). 선택 = URL 하나뿐, 첫 항목 폴백 없음.
    const isPhone = useIsPhone();
    const [searchParams, setSearchParams] = useSearchParams();
    const storyParam = searchParams.get('story');
    const selectedEvent = isPhone
        ? (storyParam ? stories.find(e => e.id === storyParam) ?? null : null)
        : stories.find(e => e.id === selectedEventId) ?? stories[0] ?? null;
    const openStory = (id: string) => setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('story', id); return next; });
    const closeStory = () => {
        if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1);
        else setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('story'); return next; }, { replace: true });
    };

    // hover 카드 — 선택된 이벤트에 등장하는 선수의 시즌 스탯만 조회해 병합(피드와 동일, 부상 병합은 생략).
    const basePlayerCardMap = useMemo(
        () => buildPlayerCardMap(poolPlayers, rosterMap, slug => teamBySlug.get(slug)?.team_abbr),
        [poolPlayers, rosterMap, teamBySlug],
    );
    const selectedEventPlayerIds = useMemo(() => selectedEvent ? extractEventPlayerIds(selectedEvent) : [], [selectedEvent]);
    const { data: selectedEventStats } = usePlayerSeasonStatsFull(roomId, selectedEventPlayerIds);
    const playerCardMap = useMemo(
        () => selectedEventStats ? mergeStatsIntoPlayerCardMap(basePlayerCardMap, selectedEventStats) : basePlayerCardMap,
        [basePlayerCardMap, selectedEventStats],
    );

    const openGame = (gameId: string) => navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(gameId)}`);
    const openPlayer = (id: string) => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(id)}`);
    const openTeam = (teamSlug: string) => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${teamSlug}`);
    const openAllStar = (view?: string) => navigate(`/multi/leagues/${leagueId}/season/allstar${view ? `?view=${view}` : ''}`);
    const openDraftResult = () => navigate(`/multi/leagues/${leagueId}/season/draft-result`);

    if (isLoading) {
        return (
            <Spinner variant="section" />
        );
    }

    if (stories.length === 0) {
        return <EmptyState title="이 선수와 관련된 뉴스가 없습니다" />;
    }

    if (isPhone) {
        return (
            <div className="bg-slate-900">
                {stories.map((e: LeagueEvent) => (
                    // 데스크톱 목록 행과 같은 글자·색(14 slate-300 · 날짜 tabular) — 폰은 선택 강조 없이 py-3(44)
                    <button
                        key={e.id}
                        type="button"
                        onClick={() => openStory(e.id)}
                        className="w-full flex items-start gap-2 px-3 py-3 text-left border-b border-slate-800/50 text-sm ko-normal bg-slate-900 active:bg-white/5"
                    >
                        <span className="flex-1 min-w-0 truncate leading-snug text-slate-300">{e.headline}</span>
                        <span className="shrink-0 text-sm tabular-nums text-slate-300">{e.simDate ? formatSimDateShort(e.simDate) : formatRelativeTime(e.createdAt)}</span>
                    </button>
                ))}
                {hasMore && (
                    <div className="p-3">
                        <Button variant="secondary" size="lg" fullWidth className="ko-normal" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                            {isFetchingNextPage ? '불러오는 중...' : '더 보기'}
                        </Button>
                    </div>
                )}
                {selectedEvent && (
                    // 기사 화면 — 화면 전체를 덮는 push(H4 ‹ + "선수명 · 뉴스"), 하단 탭 바는 그대로 보이므로 그 높이만큼 아래 여백
                    <div className="fixed inset-0 z-header flex flex-col bg-slate-950" style={{ paddingBottom: `calc(${MOBILE_TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))` }}>
                        <MobilePushHeader title={playerName ? `${playerName} · 뉴스` : '뉴스'} onBack={closeStory} />
                        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-900 px-4 py-4">
                            <StoryCard
                                event={selectedEvent} teamBySlug={teamBySlug} playerCardMap={playerCardMap}
                                roomId={roomId}
                                onOpenGame={openGame} onPlayerClick={openPlayer} onOpenTeam={openTeam}
                                onOpenAllStar={openAllStar} onOpenDraftResult={openDraftResult}
                            />
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="h-full min-h-[480px] flex">
            <div className="w-[30%] shrink-0 border-r border-slate-800 overflow-y-auto custom-scrollbar bg-slate-900">
                {stories.map((e: LeagueEvent) => {
                    const selected = e.id === selectedEvent?.id;
                    return (
                        <div
                            key={e.id}
                            onClick={() => setSelectedEventId(e.id)}
                            className={`flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b border-slate-800/50 text-sm ko-normal transition-colors ${
                                selected ? 'bg-slate-700 text-white' : 'bg-slate-900 hover:bg-white/5'
                            }`}
                        >
                            <span className={`flex-1 min-w-0 truncate leading-snug ${selected ? 'text-white' : 'text-slate-300'}`}>{e.headline}</span>
                            <span className={`shrink-0 text-sm tabular-nums ${selected ? 'text-white' : 'text-slate-300'}`}>{e.simDate ? formatSimDateShort(e.simDate) : formatRelativeTime(e.createdAt)}</span>
                        </div>
                    );
                })}
                {hasMore && (
                    <div className="p-3">
                        <Button
                            variant="secondary"
                            size="lg"
                            fullWidth
                            className="ko-normal"
                            onClick={() => fetchNextPage()}
                            disabled={isFetchingNextPage}
                        >
                            {isFetchingNextPage ? '불러오는 중...' : '더 보기'}
                        </Button>
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-slate-900 p-10">
                {selectedEvent && (
                    <StoryCard
                        event={selectedEvent} teamBySlug={teamBySlug} playerCardMap={playerCardMap}
                        roomId={roomId}
                        onOpenGame={openGame} onPlayerClick={openPlayer} onOpenTeam={openTeam}
                        onOpenAllStar={openAllStar} onOpenDraftResult={openDraftResult}
                    />
                )}
            </div>
        </div>
    );
};
