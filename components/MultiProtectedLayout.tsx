
import React from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
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
    const navigate = useNavigate();

    if (authLoading) return <Loader message="잠시만 기다려주세요..." />;
    if (!session)    return <Navigate to="/" replace />;

    return (
        <div className="min-h-screen bg-slate-950 text-white pretendard">
            {/* 상단 네비게이션 바 */}
            <nav className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-40">
                <div className="max-w-5xl mx-auto px-4 h-11 flex items-center gap-3">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-white transition-colors"
                    >
                        <ChevronLeft size={14} />
                        <span className="ko-normal">홈으로</span>
                    </button>
                    <span className="text-slate-700 text-xs">|</span>
                    <span className="text-xs font-bold text-slate-400 ko-normal">멀티플레이</span>
                </div>
            </nav>
            <Outlet />
        </div>
    );
};

export default MultiProtectedLayout;
