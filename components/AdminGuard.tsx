import React from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useGame } from '../hooks/useGameContext';
import Loader from './Loader';

const AdminGuard: React.FC = () => {
    const { session, isAdmin, isAdminLoading } = useGame();
    const location = useLocation();

    if (!session) {
        return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
    }

    // profiles.is_admin 조회가 끝나기 전에 섣불리 리다이렉트하면 실제 어드민도 새로고침 시
    // 튕겨나간다 — 로딩 중엔 대기.
    if (isAdminLoading) {
        return <Loader message="확인 중..." />;
    }

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};

export default AdminGuard;
