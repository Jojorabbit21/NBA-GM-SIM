import React from 'react';
import { DraftView } from '../views/DraftView';
import { useGame } from '../hooks/useGameContext';

const DraftBoardPage: React.FC = () => {
    const { gameData } = useGame();

    const myTeam = gameData.teams.find(t => t.id === gameData.myTeamId);

    if (!myTeam || !gameData.prospects?.length) return null;

    return (
        <DraftView
            prospects={gameData.prospects}
            onDraft={() => {}}
            team={myTeam}
            readOnly
            lotteryResult={gameData.lotteryResult}
            resolvedDraftOrder={gameData.resolvedDraftOrder || null}
            teams={gameData.teams}
            myTeamId={gameData.myTeamId || undefined}
        />
    );
};

export default DraftBoardPage;
