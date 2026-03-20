import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { InboxView } from '../views/InboxView';
import { useGame } from '../hooks/useGameContext';

const InboxPage: React.FC = () => {
    const { session, gameData, refreshUnreadCount, setViewPlayerData } = useGame();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialMessageId = searchParams.get('msgId') ?? undefined;

    if (!session?.user?.id) return null;

    const seasonShort: string = gameData.seasonConfig?.seasonShort ?? '2025-26';

    return (
        <InboxView
            myTeamId={gameData.myTeamId!}
            userId={session.user.id}
            initialMessageId={initialMessageId}
            teams={gameData.teams}
            onUpdateUnreadCount={refreshUnreadCount}
            tendencySeed={gameData.tendencySeed || undefined}
            currentSimDate={gameData.currentSimDate}
            seasonShort={seasonShort}
            onViewPlayer={(player, teamId, teamName) => {
                setViewPlayerData({ player, teamId, teamName });
                navigate(`/player/${player.id}`, { state: { player, teamId, teamName } });
            }}
            onViewGameResult={(result) => {
                navigate(`/result/${result.gameId ?? result.id ?? 'unknown'}`, { state: { result } });
            }}
            onNavigateToHof={() => navigate('/hall-of-fame')}
            onNavigateToDraft={() => navigate('/draft-board')}
            onNavigateToDraftLottery={() => navigate('/draft-lottery')}
            onTeamOptionExecuted={(playerId, exercised) => {
                const newTeams = gameData.teams.map(t => {
                    if (t.id !== gameData.myTeamId) return t;
                    if (exercised) {
                        return { ...t, roster: t.roster.map(p =>
                            p.id === playerId && p.contract?.option
                                ? { ...p, contract: { ...p.contract, option: undefined } }
                                : p
                        ) };
                    } else {
                        return { ...t, roster: t.roster.filter(p => p.id !== playerId) };
                    }
                });
                gameData.setTeams(newTeams);
                gameData.forceSave({ teams: newTeams, withSnapshot: true });
            }}
        />
    );
};

export default InboxPage;
