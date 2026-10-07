/**
 * LeagueBootstrapErrorScreen — 리그 진입 부트스트랩(hooks/useLeagueBootstrap.ts)이 **확정 실패**했을 때만 뜨는 화면.
 *
 * [2026-10-06] 처음엔 퍼센트·에메랄드 막대·재치 문구가 있는 전용 로딩 화면(LeagueBootstrapScreen)이었으나,
 * 실제 로딩이 1초 안쪽이라 막대가 0%에서 바로 넘어가고 "스피너 → 막대 화면"으로 화면이 두 번 바뀌는 게
 * 더 거슬렸다. 로딩 중에는 LeagueLayout의 기존 스피너가 그대로 이어지도록 바꾸고, 이 컴포넌트는 실패 안내만 맡는다.
 * 좌상단 "‹ 홈으로"는 실패 화면의 유일한 다른 출구(네트워크: 다시 시도 / 세션: 다시 로그인).
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { LeagueBootstrapState } from '../../hooks/useLeagueBootstrap';
import { supabase } from '../../services/supabaseClient';

interface Props {
    boot: LeagueBootstrapState;
}

export const LeagueBootstrapErrorScreen: React.FC<Props> = ({ boot }) => {
    const navigate = useNavigate();
    const isAuth = boot.failKind === 'auth';

    const handleRelogin = async () => {
        try { await supabase.auth.signOut(); } catch (e) { console.error('[bootstrap] signOut', e); }
        navigate('/auth', { replace: true });
    };

    return (
        <div className="relative flex items-center justify-center h-full min-h-screen bg-gray-950 px-4">
            <button
                type="button"
                onClick={() => navigate('/')}
                className="absolute top-4 left-4 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
                <ChevronLeft size={16} />홈으로
            </button>

            <div className="w-full max-w-xs flex flex-col items-center gap-3 text-center" aria-live="polite">
                <p className="text-base text-red-200 ko-normal">
                    {isAuth ? '세션이 만료됐습니다. 다시 로그인해 주세요' : '서버가 응답하지 않아 리그 데이터를 불러오지 못했습니다'}
                </p>
                <button
                    type="button"
                    onClick={isAuth ? handleRelogin : boot.retry}
                    className="mt-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors"
                >
                    {isAuth ? '다시 로그인' : '다시 시도'}
                </button>
            </div>
        </div>
    );
};
