import React from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useGame } from '../hooks/useGameContext';

const ADMIN_USER_ID = 'd2f6a469-9182-4dac-a098-278e6e758c79';

const AdminGuard: React.FC = () => {
    const { session } = useGame();
    const location = useLocation();

    if (!session) {
        return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
    }

    if (session.user.id !== ADMIN_USER_ID) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};

export default AdminGuard;
