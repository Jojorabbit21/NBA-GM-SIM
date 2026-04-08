
import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthView } from '../views/AuthView';
import { useGame } from '../hooks/useGameContext';

const AuthPage: React.FC = () => {
    const { session, isGuestMode, gameData, setPlayMode, logout } = useGame();
    const navigate = useNavigate();

    // nickname: profiles에서 가져오는 대신 이메일 앞부분으로 fallback
    const nickname = session?.user?.user_metadata?.nickname
        ?? session?.user?.email?.split('@')[0]
        ?? 'GM';

    const handleContinue = useCallback(() => {
        setPlayMode('single');
        navigate('/', { replace: true });
    }, [setPlayMode, navigate]);

    const handleNewGame = useCallback(() => {
        setPlayMode('single');
        navigate('/', { replace: true });
    }, [setPlayMode, navigate]);

    const handleMultiPlay = useCallback(() => {
        setPlayMode('multi');
        navigate('/multi');
    }, [setPlayMode, navigate]);

    return (
        <AuthView
            onGuestLogin={() => {}}
            session={session}
            teams={gameData.teams}
            nickname={isGuestMode ? 'Guest' : nickname}
            onContinue={handleContinue}
            onNewGame={handleNewGame}
            onLogout={logout}
            onMultiPlay={handleMultiPlay}
        />
    );
};

export default AuthPage;
