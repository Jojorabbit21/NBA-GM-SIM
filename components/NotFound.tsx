import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGame } from '../hooks/useGameContext';
import { Button } from './common/Button';

/**
 * 404 화면 — 잘못된 URL은 조용히 리다이렉트하지 않고 이 화면으로 알려준다.
 * 복귀 버튼은 현재 위치로 정한다: 리그 URL이면 "리그 홈으로", 아니면 로그인 여부에 따라 "홈으로"/"로그인으로".
 */
const LEAGUE_PATH = /^\/multi\/leagues\/([^/]+)/;

export const NotFound: React.FC = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { session, authLoading } = useGame();

    const leagueId = pathname.match(LEAGUE_PATH)?.[1] ?? null;
    const canGoBack = typeof window !== 'undefined' && window.history.length > 1;

    const primary = leagueId
        ? { label: '리그 홈으로', to: `/multi/leagues/${leagueId}/season` }
        : session
            ? { label: '홈으로', to: '/' }
            : { label: '로그인으로', to: '/' };

    return (
        <div className="flex flex-col items-center justify-center text-center px-6 min-h-screen bg-slate-950">
            <p className="text-6xl font-black text-slate-700 tabular-nums">404</p>
            <h1 className="mt-4 text-lg font-bold text-white ko-tight">페이지를 찾을 수 없습니다</h1>
            <p className="mt-2 text-sm text-white leading-relaxed">
                주소가 잘못되었거나 이동·삭제된 페이지입니다.
            </p>
            <div className="mt-6 flex items-center gap-2">
                {canGoBack && <Button variant="secondary" size="lg" onClick={() => navigate(-1)}>이전 페이지</Button>}
                {/* 인증 확인 중엔 "홈/로그인" 라벨이 틀릴 수 있어 잠깐 비활성 */}
                <Button variant="primary" size="lg" disabled={!leagueId && authLoading} onClick={() => navigate(primary.to, { replace: true })}>
                    {primary.label}
                </Button>
            </div>
        </div>
    );
};

export default NotFound;
