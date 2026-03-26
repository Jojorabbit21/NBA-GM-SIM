import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrainingView } from '../views/TrainingView';
import { useGame } from '../hooks/useGameContext';
import { getDefaultTrainingConfig } from '../types/training';
import type { TeamTrainingConfig } from '../types/training';

const TrainingPage: React.FC = () => {
    const { gameData } = useGame();
    const navigate = useNavigate();

    const myTeamId = gameData.myTeamId;
    if (!myTeamId) return null;

    const trainingConfig = gameData.leagueTrainingConfigs?.[myTeamId] ?? getDefaultTrainingConfig();
    const staff = gameData.coachingData?.[myTeamId] ?? null;

    const handleSave = (config: TeamTrainingConfig) => {
        const newConfigs = {
            ...(gameData.leagueTrainingConfigs ?? {}),
            [myTeamId]: config,
        };
        gameData.setLeagueTrainingConfigs(newConfigs);
        gameData.forceSave({ leagueTrainingConfigs: newConfigs });
    };

    return (
        <TrainingView
            teamId={myTeamId}
            trainingConfig={trainingConfig}
            coachingStaff={staff}
            onSave={handleSave}
            onBack={() => navigate(-1)}
        />
    );
};

export default TrainingPage;
