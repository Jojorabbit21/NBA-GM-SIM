import React from 'react';
import { DraftHistoryView } from '../views/DraftHistoryView';
import { useGame } from '../hooks/useGameContext';

const DraftHistoryPage: React.FC = () => {
    const { gameData } = useGame();

    return (
        <DraftHistoryView
            myTeamId={gameData.myTeamId!}
            draftPicks={gameData.draftPicks}
        />
    );
};

export default DraftHistoryPage;
