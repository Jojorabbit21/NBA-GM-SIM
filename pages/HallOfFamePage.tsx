import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HallOfFameView } from '../views/HallOfFameView';
import { useGame } from '../hooks/useGameContext';

const HallOfFamePage: React.FC = () => {
    const { session, gameData } = useGame();
    const navigate = useNavigate();
    const seasonShort: string = gameData.seasonConfig?.seasonShort ?? '2025-26';

    return (
        <HallOfFameView
            currentUserId={session?.user?.id}
            currentHofId={gameData.hofId}
            onBack={() => navigate(-1)}
            seasonShort={seasonShort}
        />
    );
};

export default HallOfFamePage;
