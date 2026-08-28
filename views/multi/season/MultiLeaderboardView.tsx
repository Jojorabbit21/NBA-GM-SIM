
import React, { useMemo, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useLeagueRawStats, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { LeaderboardView, type LeaderboardFilterState } from '../../LeaderboardView';
import { buildLeagueTeams } from '../../../services/multi/buildLeagueTeams';
import { resolveRealAt } from './multiGameReveal';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import type { Team, Game, Player } from '../../../types';
import type { ViewMode, StatCategory } from '../../../data/leaderboardConfig';
import type { SeasonType } from '../../../hooks/useLeaderboardData';

function parseFilters(raw: string | null) {
    if (!raw) return [];
    try { return JSON.parse(atob(raw)); }
    catch { return []; }
}

const MultiLeaderboardView: React.FC = () => {
    const { league, leagueTeams, room, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const { isLoading: gameLoading, schedule } = useSeasonContext();
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();

    // 화면 이동 후 뒤로가기로 돌아와도 필터가 유지되도록, 싱글플레이어 LeaderboardPage와
    // 동일하게 필터 상태를 URL 쿼리스트링에 저장한다(로컬 useState뿐이면 뒤로가기 시
    // 컴포넌트가 재마운트되며 초기화됨).
    const savedFilterState: LeaderboardFilterState = {
        mode:         (searchParams.get('mode') ?? 'Players') as ViewMode,
        statCategory: (searchParams.get('cat')  ?? 'Traditional') as StatCategory,
        sortConfig: {
            key:       searchParams.get('sort') ?? 'pts',
            direction: (searchParams.get('dir') ?? 'desc') as 'asc' | 'desc',
        },
        itemsPerPage:      Number(searchParams.get('perPage') ?? 50),
        currentPage:       Number(searchParams.get('page')    ?? 1),
        showHeatmap:       searchParams.get('heatmap') !== 'false',
        activeFilters:     parseFilters(searchParams.get('filters')),
        selectedTeams:     searchParams.getAll('team'),
        selectedPositions: searchParams.getAll('pos'),
        searchQuery:       searchParams.get('q') ?? '',
        seasonType:        (searchParams.get('season') ?? 'regular') as SeasonType,
    };

    const handleFilterStateChange = (s: LeaderboardFilterState) => {
        const params = new URLSearchParams();
        params.set('mode',    s.mode);
        params.set('cat',     s.statCategory);
        params.set('sort',    s.sortConfig.key);
        params.set('dir',     s.sortConfig.direction);
        params.set('perPage', String(s.itemsPerPage));
        params.set('page',    String(s.currentPage));
        params.set('heatmap', String(s.showHeatmap));
        params.set('season',  s.seasonType);
        if (s.searchQuery)              params.set('q', s.searchQuery);
        if (s.activeFilters.length > 0) params.set('filters', btoa(JSON.stringify(s.activeFilters)));
        s.selectedTeams.forEach(t     => params.append('team', t));
        s.selectedPositions.forEach(p => params.append('pos', p));
        setSearchParams(params, { replace: true });
    };

    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );

    // 홈 화면 로스터 위젯/로스터 화면과 원본 fetch(meta_players+game_pbp)를 공유 — queryKey가
    // 같으면 어느 화면이 먼저 로드하든 나머지는 캐시를 그대로 재사용해 로더 없이 즉시 뜬다.
    // 최신 경기 결과를 바로 보고 싶으면 툴바의 새로고침 버튼(onRefresh)으로 수동 강제 갱신.
    // [2026-08-14] 집계 로직은 services/multi/buildLeagueTeams.ts로 추출 — MultiTacticsView의
    // "인사이트" 탭도 동일한 리그 전체 30팀 스탯이 필요해져 공용화함(로직 두 곳에 중복 방지).
    const selectLeaderboardTeams = useCallback(
        (raw: LeagueRawStatsData): Team[] => buildLeagueTeams(raw, leagueTeams, useCustomOverrides),
        [leagueTeams, useCustomOverrides],
    );

    const {
        data: teams = [],
        isPending: fetchLoading,
        isFetching: fetchRefreshing,
        refetch: refetchTeams,
    } = useLeagueRawStats(room?.id, allRosterIds, selectLeaderboardTeams);

    // 선수 이름 클릭 → 선수 프로필 전용 캐노니컬 라우트(MultiPlayerDetailView)로 이동.
    // 리더보드 행은 useLeaderboardData가 항상 정확한 teamId를 채워주지만(hooks/useLeaderboardData.ts),
    // 그 화면 자체가 리그 전체 로스터에서 playerId로 다시 찾으므로 별도로 넘길 필요는 없다.
    const { getPlayerUrlId } = usePlayerShortCodes();
    const handleViewPlayer = useCallback((player: Player) => {
        navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(player.id)}`);
    }, [navigate, leagueId, getPlayerUrlId]);

    // schedule의 game_seq 기반 경기는 scheduledAt이 없을 수 있어(레거시) resolveRealAt으로
    // 역산해 채워야 useLeaderboardData의 isFinal() 게이팅이 정확히 동작한다.
    // (isLoading 조기 return보다 반드시 위에 있어야 함 — Hooks는 매 렌더 동일한 순서로 호출돼야 한다.)
    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    const normalizedSchedule = useMemo(
        () => (schedule as Game[]).map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt })),
        [schedule, simStart, gprd],
    );

    const isLoading = leagueLoading || gameLoading || fetchLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    const isTournament = league?.type === 'tournament';

    return (
        <LeaderboardView
            teams={teams}
            schedule={normalizedSchedule}
            onViewPlayer={handleViewPlayer}
            onTeamClick={() => {}}
            hideSeasonType={isTournament}
            savedState={savedFilterState}
            onStateChange={handleFilterStateChange}
            onRefresh={() => refetchTeams()}
            refreshing={fetchRefreshing}
        />
    );
};

export default MultiLeaderboardView;
