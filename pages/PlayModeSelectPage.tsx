
import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { PlayModeSelectView } from '../views/PlayModeSelectView';
import { useGame } from '../hooks/useGameContext';
import type { PlayMode } from '../types/app';

const PlayModeSelectPage: React.FC = () => {
    const { session, isGuestMode, setPlayMode } = useGame();
    const navigate = useNavigate();

    if (!session && !isGuestMode) return <Navigate to="/auth" replace />;

    const handleSelectMode = (mode: PlayMode) => {
        if (mode === 'multi') return; // Coming Soon — no-op
        setPlayMode(mode);
        navigate('/', { replace: true });
    };

    return <PlayModeSelectView onSelectMode={handleSelectMode} />;
};

export default PlayModeSelectPage;
