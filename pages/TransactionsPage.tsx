import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TransactionsView } from '../views/TransactionsView';
import { useGame } from '../hooks/useGameContext';

const TransactionsPage: React.FC = () => {
    const { session, gameData, setToastMessage, refreshUnreadCount, setViewPlayerData } = useGame();
    const navigate = useNavigate();

    const myTeam = gameData.teams.find(t => t.id === gameData.myTeamId);
    if (!myTeam) return null;

    return (
        <TransactionsView
            team={myTeam}
            teams={gameData.teams}
            setTeams={gameData.setTeams}
            addNews={() => {}}
            onShowToast={setToastMessage}
            currentSimDate={gameData.currentSimDate}
            transactions={gameData.transactions}
            onAddTransaction={(tx) => gameData.setTransactions((prev: any) => [tx, ...prev])}
            onForceSave={gameData.forceSave}
            userId={session?.user?.id}
            refreshUnreadCount={refreshUnreadCount}
            tendencySeed={gameData.tendencySeed || undefined}
            onViewPlayer={(player, teamId, teamName) => {
                setViewPlayerData({ player, teamId, teamName });
                navigate(`/player/${player.id}`, { state: { player, teamId, teamName } });
            }}
            userTactics={gameData.userTactics ?? undefined}
            setUserTactics={gameData.setUserTactics}
            leagueTradeBlocks={gameData.leagueTradeBlocks}
            setLeagueTradeBlocks={gameData.setLeagueTradeBlocks}
            leagueTradeOffers={gameData.leagueTradeOffers}
            setLeagueTradeOffers={gameData.setLeagueTradeOffers}
            leaguePickAssets={gameData.leaguePickAssets ?? undefined}
            setLeaguePickAssets={gameData.setLeaguePickAssets}
            leagueGMProfiles={gameData.leagueGMProfiles}
            seasonConfig={gameData.seasonConfig ?? undefined}
        />
    );
};

export default TransactionsPage;
