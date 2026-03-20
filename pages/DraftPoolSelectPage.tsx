import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DraftPoolSelectView } from '../views/DraftPoolSelectView';
import { useGame } from '../hooks/useGameContext';
import type { DraftPoolType } from '../types';

const DraftPoolSelectPage: React.FC = () => {
    const { setDraftPoolType } = useGame();
    const navigate = useNavigate();

    const handleSelectPool = (pool: DraftPoolType) => {
        setDraftPoolType(pool);
        navigate('/select-team', { replace: true });
    };

    return (
        <DraftPoolSelectView
            onSelectPool={handleSelectPool}
            onBack={() => navigate('/mode-select', { replace: true })}
        />
    );
};

export default DraftPoolSelectPage;
