import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayoffsView } from '../views/PlayoffsView';
import { useGame } from '../hooks/useGameContext';

const PlayoffsPage: React.FC = () => {
    const { session, gameData, sim } = useGame();
    const navigate = useNavigate();

    return (
        <PlayoffsView
            teams={gameData.teams}
            schedule={gameData.schedule}
            series={gameData.playoffSeries}
            setSeries={gameData.setPlayoffSeries}
            setSchedule={gameData.setSchedule}
            myTeamId={gameData.myTeamId!}
            userId={session?.user?.id}
            onViewGameResult={(result) => {
                sim.loadSavedGameResult(result);
                navigate(`/result/${result.gameId ?? result.id ?? 'unknown'}`, { state: { result } });
            }}
        />
    );
};

export default PlayoffsPage;
