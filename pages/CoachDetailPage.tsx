import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { CoachDetailView } from '../views/CoachDetailView';
import { useGame } from '../hooks/useGameContext';

const CoachDetailPage: React.FC = () => {
    const { coachId } = useParams<{ coachId: string }>();
    const { state } = useLocation();
    const { gameData } = useGame();
    const navigate = useNavigate();

    // location.state 우선 (FrontOfficePage/RosterPage에서 navigate 시 state 전달)
    const stateData = state as { coach: any; teamId: string } | null;

    // fallback: coachingData에서 coachId로 탐색
    const coachData = stateData ?? (() => {
        if (!coachId) return null;
        for (const [teamId, staff] of Object.entries(gameData.coachingData ?? {})) {
            const coach = staff?.headCoach;
            if (coach?.id === coachId) return { coach, teamId };
        }
        return null;
    })();

    if (!coachData) { navigate(-1); return null; }

    return (
        <CoachDetailView
            coach={coachData.coach}
            teamId={coachData.teamId}
            onBack={() => navigate(-1)}
        />
    );
};

export default CoachDetailPage;
