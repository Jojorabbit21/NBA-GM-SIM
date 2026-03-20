import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScheduleView } from '../views/ScheduleView';
import { useGame } from '../hooks/useGameContext';

const SchedulePage: React.FC = () => {
    const { session, gameData, sim } = useGame();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    if (!session?.user?.id) return null;

    const monthParam = searchParams.get('month');
    const initialMonth = monthParam ? new Date(monthParam + '-01') : null;

    return (
        <ScheduleView
            schedule={gameData.schedule}
            teamId={gameData.myTeamId!}
            teams={gameData.teams}
            currentSimDate={gameData.currentSimDate}
            userId={session.user.id}
            initialMonth={initialMonth}
            onMonthChange={(d) => {
                const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                setSearchParams({ month: ym }, { replace: true });
            }}
            onViewGameResult={(result) => {
                navigate(`/result/${result.gameId ?? result.id ?? 'unknown'}`, { state: { result } });
            }}
            onSpectateGame={(gameId) => {
                if (gameData.userTactics) {
                    sim.handleExecuteSim(gameData.userTactics, false, gameId);
                }
            }}
            onStartUserGame={() => {
                if (gameData.userTactics) {
                    sim.handleStartLiveGame(gameData.userTactics);
                }
            }}
            isSimulating={sim.isSimulating}
            playoffSeries={gameData.playoffSeries}
            seasonStartYear={gameData.seasonConfig?.startYear}
        />
    );
};

export default SchedulePage;
