
import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useGame } from '../hooks/useGameContext';
import Loader from './Loader';

/**
 * 멀티플레이어 라우트 가드.
 * 싱글의 ProtectedLayout과 분리된 독립 레이아웃.
 *
 * 조건:
 *   - 인증 로딩 중   → Loader
 *   - 미인증         → /
 *   - playMode 확인  → multi가 아니어도 진입 허용 (로비에서 multi 선택 후 바로 진입)
 */
const MultiProtectedLayout: React.FC = () => {
    const { session, authLoading } = useGame();

    if (authLoading) return <Loader message="잠시만 기다려주세요..." />;
    if (!session)    return <Navigate to="/" replace />;

    return <Outlet />;
};

export default MultiProtectedLayout;
