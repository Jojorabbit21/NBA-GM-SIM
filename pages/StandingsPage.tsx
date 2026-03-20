import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StandingsView } from '../views/StandingsView';
import { useGame } from '../hooks/useGameContext';

const StandingsPage: React.FC = () => {
    const { gameData } = useGame();
    const navigate = useNavigate();

    return (
        <StandingsView
            teams={gameData.teams}
            schedule={gameData.schedule}
            onTeamClick={(id) => navigate(`/roster/${id}`)}
        />
    );
};

export default StandingsPage;
