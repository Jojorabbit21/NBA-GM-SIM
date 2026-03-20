import React from 'react';
import { Navigate } from 'react-router-dom';
import { AuthView } from '../views/AuthView';
import { useGame } from '../hooks/useGameContext';

const AuthPage: React.FC = () => {
    const { session, isGuestMode } = useGame();

    if (session || isGuestMode) return <Navigate to="/" replace />;

    return <AuthView onGuestLogin={() => { /* handled in AuthView internally */ }} />;
};

export default AuthPage;
