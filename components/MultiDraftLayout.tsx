
import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useGame } from '../hooks/useGameContext';
import Loader from './Loader';

/**
 * 드래프트 전용 레이아웃 — 인증만 체크, nav 바 없음.
 * MultiProtectedLayout의 상단 nav가 드래프트 풀스크린 뷰를 방해하므로 분리.
 */
const MultiDraftLayout: React.FC = () => {
    const { session, authLoading } = useGame();
    if (authLoading) return <Loader message="잠시만 기다려주세요..." />;
    if (!session)    return <Navigate to="/" replace />;
    return <Outlet />;
};

export default MultiDraftLayout;
