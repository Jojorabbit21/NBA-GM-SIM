import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CoachMarketView } from '../views/CoachMarketView';
import { useGame } from '../hooks/useGameContext';
import { hireCoach, fireCoach } from '../services/coachingStaff/coachHiringEngine';
import type { StaffRole } from '../types/coaching';

const CoachMarketPage: React.FC = () => {
    const { gameData } = useGame();
    const navigate = useNavigate();

    const myTeamId = gameData.myTeamId;
    if (!myTeamId || !gameData.coachingData || !gameData.coachFAPool) {
        return (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                코치 데이터를 불러오는 중...
            </div>
        );
    }

    const handleHire = (role: StaffRole, coachId: string, demandSalary?: number) => {
        const teamStaff = gameData.coachingData![myTeamId] ?? {
            headCoach: null, offenseCoordinator: null, defenseCoordinator: null,
            developmentCoach: null, trainingCoach: null,
        };
        const { staff: newStaff, pool: newPool } = hireCoach(teamStaff, gameData.coachFAPool!, role, coachId, demandSalary);
        const newCoachingData = { ...gameData.coachingData!, [myTeamId]: newStaff };
        gameData.setCoachingData(newCoachingData);
        gameData.setCoachFAPool(newPool);
        gameData.forceSave({ coachingData: newCoachingData, coachFAPool: newPool });
    };

    const handleFire = (role: StaffRole) => {
        const teamStaff = gameData.coachingData![myTeamId];
        if (!teamStaff) return;
        const { staff: newStaff, pool: newPool } = fireCoach(teamStaff, gameData.coachFAPool!, role);
        const newCoachingData = { ...gameData.coachingData!, [myTeamId]: newStaff };
        gameData.setCoachingData(newCoachingData);
        gameData.setCoachFAPool(newPool);
        gameData.forceSave({ coachingData: newCoachingData, coachFAPool: newPool });
    };

    return (
        <CoachMarketView
            coachFAPool={gameData.coachFAPool}
            coachingData={gameData.coachingData}
            userTeamId={myTeamId}
            onHire={handleHire}
            onFire={handleFire}
            onBack={() => navigate(-1)}
        />
    );
};

export default CoachMarketPage;
