import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { HomeView } from '../views/HomeView';
import { useGame } from '../hooks/useGameContext';

const VIEW_TO_PATH: Record<string, string> = {
    Dashboard:    '/locker-room',
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

    // 유저 트레이드 블록 항목 추출
    const userBlockEntries = useMemo(
        () => (gameData.myTeamId && gameData.leagueTradeBlocks?.[gameData.myTeamId]?.entries) ?? [],
        [gameData.myTeamId, gameData.leagueTradeBlocks]
    );

    // 유저 보유 픽
    const userPicks = useMemo(
        () => (gameData.myTeamId && gameData.leaguePickAssets?.[gameData.myTeamId]) ?? [],
        [gameData.myTeamId, gameData.leaguePickAssets]
    );

    // 수신 오퍼 건수
    const incomingOfferCount = useMemo(
        () => (gameData.leagueTradeOffers?.offers ?? []).filter(
            (o: any) => o.toTeamId === gameData.myTeamId && o.status === 'pending'
        ).length,
        [gameData.leagueTradeOffers, gameData.myTeamId]
    );

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
            teamFinances={gameData.teamFinances}
            depthChart={gameData.depthChart}
            onNavigate={(view, messageId) => {
                const path = VIEW_TO_PATH[view];
                if (!path) return;
                navigate(messageId ? `${path}?msgId=${messageId}` : path);
            }}
            onViewPlayer={(player, teamId, teamName) => {
                setViewPlayerData({ player, teamId, teamName });
                navigate(`/player/${player.id}`, { state: { player, teamId, teamName } });
            }}
            // 트레이드 위젯 props
            transactions={gameData.transactions}
            leagueTradeBlocks={gameData.leagueTradeBlocks}
            leagueGMProfiles={gameData.leagueGMProfiles}
            userBlockEntries={userBlockEntries}
            togglePersistentBlockPlayer={() => navigate('/transactions')}
            userPicks={userPicks}
            incomingOfferCount={incomingOfferCount}
            isTradeDeadlinePassed={false}
            isTradeLimitReached={false}
            dailyTradeAttempts={0}
            maxDailyTrades={3}
        />
    );
};

export default HomePage;
