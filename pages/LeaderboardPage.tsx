import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LeaderboardView, LeaderboardFilterState } from '../views/LeaderboardView';
import { useGame } from '../hooks/useGameContext';
import type { ViewMode, StatCategory } from '../data/leaderboardConfig';
import type { SeasonType } from '../hooks/useLeaderboardData';

function parseFilters(raw: string | null) {
    if (!raw) return [];
    try { return JSON.parse(atob(raw)); }
    catch { return []; }
}

const LeaderboardPage: React.FC = () => {
    const { gameData, setViewPlayerData } = useGame();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const savedState: LeaderboardFilterState = {
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

    const handleStateChange = (s: LeaderboardFilterState) => {
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

    return (
        <LeaderboardView
            teams={gameData.teams}
            schedule={gameData.schedule}
            tendencySeed={gameData.tendencySeed || undefined}
            onViewPlayer={(player, teamId, teamName) => {
                setViewPlayerData({ player, teamId, teamName });
                navigate(`/player/${player.id}`, { state: { player, teamId, teamName } });
            }}
            onTeamClick={(id) => navigate(`/roster/${id}`)}
            savedState={savedState}
            onStateChange={handleStateChange}
        />
    );
};

export default LeaderboardPage;
