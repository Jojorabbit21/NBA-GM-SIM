
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { MultiSidebar } from '../../../components/MultiSidebar';
import { MultiHeader } from '../../../components/MultiHeader';
import { TournamentChampionModal } from '../../../components/multi/TournamentChampionModal';
import { useSeasonContext } from './seasonContext';

/**
 * 시즌 서브라우트(로스터/순위/일정/리더보드/전술/경기) 공유 레이아웃.
 * 시즌 데이터(useMultiGameData) 자체는 이제 LeagueLayout에서 리그 진입 시 1회만 로드하고
 * SeasonCtx로 내려준다 — 여기서는 그 컨텍스트를 그대로 소비만 한다. 로비/설정 화면을 오가며
 * 이 레이아웃이 언마운트→재마운트돼도(시즌 섹션을 벗어났다 돌아와도) 데이터를 다시 불러오지
 * 않는다. 아래 로딩 게이트는 리그 진입 직후처럼 아직 시즌 데이터 로드가 안 끝난 채로 URL을
 * 통해 곧바로 시즌 라우트에 진입한 경우를 위한 안전장치다.
 */
export function MultiSeasonLayout() {
    const location = useLocation();
    // 경기 관람 화면(game/:gameId)에서는 헤더를 숨겨 화면을 넓게 쓴다.
    const isWatchingGame = /\/season\/game\/[^/]+$/.test(location.pathname);

    const gameData = useSeasonContext();

    if (gameData.isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-screen bg-gray-950">
                <Loader2 size={32} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="flex h-screen overflow-hidden bg-slate-950">
            <MultiSidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                {!isWatchingGame && <MultiHeader />}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <Outlet />
                </div>
            </div>
            <TournamentChampionModal />
        </div>
    );
}
