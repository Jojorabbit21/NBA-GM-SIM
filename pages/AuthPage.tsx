
import React, { useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StartScreen } from '../views/home/StartScreen';
import { useGame } from '../hooks/useGameContext';

const AuthPage: React.FC<{ quickplayOnly?: boolean }> = ({ quickplayOnly = false }) => {
    const { session, isGuestMode, setPlayMode, logout } = useGame();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const redirectTo = searchParams.get('redirect');

    // 로그인 완료 후 redirect 파라미터가 있으면 해당 경로로 이동
    useEffect(() => {
        if (session && redirectTo) {
            navigate(redirectTo, { replace: true });
        }
    }, [session, redirectTo, navigate]);

    // nickname: profiles에서 가져오는 대신 이메일 앞부분으로 fallback
    const nickname = session?.user?.user_metadata?.nickname
        ?? session?.user?.email?.split('@')[0]
        ?? 'GM';

    const handleContinue = useCallback(() => {
        setPlayMode('single');
        navigate('/home', { replace: true });
    }, [setPlayMode, navigate]);

    const handleNewGame = useCallback(() => {
        setPlayMode('single');
        navigate('/home', { replace: true });
    }, [setPlayMode, navigate]);

    const handleQuickPlay = useCallback(() => {
        navigate('/quick');
    }, [navigate]);

    return (
        <StartScreen
            session={session}
            nickname={isGuestMode ? 'Guest' : nickname}
            onContinue={handleContinue}
            onNewGame={handleNewGame}
            onLogout={logout}
            onQuickPlay={handleQuickPlay}
            quickplayOnly={quickplayOnly}
        />
    );
};

export default AuthPage;
