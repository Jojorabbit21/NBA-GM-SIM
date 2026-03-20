import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HomeView } from '../views/HomeView';
import { useGame } from '../hooks/useGameContext';
const VIEW_TO_PATH: Record<string, string> = {
    Dashboard:    '/dashboard',
    Roster:       '/roster',
    Schedule:     '/schedule',
    Standings:    '/standings',
    Leaderboard:  '/leaderboard',
    Transactions: '/transactions',
    Playoffs:     '/playoffs',
    Inbox:        '/inbox',
    Help:         '/help',
    FrontOffice:  '/front-office',
    FAMarket:     '/fa-market',
    HallOfFame:   '/hall-of-fame',
    DraftHistory: '/draft-history',
    DraftLottery: '/draft-lottery',
    DraftBoard:   '/draft-board',
};

const HomePage: React.FC = () => {
    const { session, gameData, unreadCount, setViewPlayerData } = useGame();
    const navigate = useNavigate();

    const myTeam = gameData.teams.find(t => t.id === gameData.myTeamId);
    if (!myTeam) return null;

    const seasonShort: string = gameData.seasonConfig?.seasonShort ?? '2025-26';

    return (
        <HomeView
            team={myTeam}
            teams={gameData.teams}
            schedule={gameData.schedule}
            currentSimDate={gameData.currentSimDate}
            unreadCount={unreadCount}
            offseasonPhase={gameData.offseasonPhase}
            seasonShort={seasonShort}
            userId={session?.user?.id}
            onNavigate={(view) => {
                const path = VIEW_TO_PATH[view];
                if (path) navigate(path);
            }}
            onViewPlayer={(player, teamId, teamName) => {
                setViewPlayerData({ player, teamId, teamName });
                navigate(`/player/${player.id}`, { state: { player, teamId, teamName } });
            }}
        />
    );
};

export default HomePage;
