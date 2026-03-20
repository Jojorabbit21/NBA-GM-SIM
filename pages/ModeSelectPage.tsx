import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ModeSelectView } from '../views/ModeSelectView';
import { useGame } from '../hooks/useGameContext';
import type { RosterMode } from '../types';

const ModeSelectPage: React.FC = () => {
    const { setRosterMode } = useGame();
    const navigate = useNavigate();

    const handleSelectMode = (mode: RosterMode) => {
        setRosterMode(mode);
        if (mode === 'custom') {
            navigate('/draft-pool-select', { replace: true });
        } else {
            navigate('/select-team', { replace: true });
        }
    };

    return <ModeSelectView onSelectMode={handleSelectMode} />;
};

export default ModeSelectPage;
