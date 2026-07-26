
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { MultiSidebar } from '../../../components/MultiSidebar';
import { MultiHeader } from '../../../components/MultiHeader';
import { TournamentChampionModal } from '../../../components/multi/TournamentChampionModal';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import { SeasonCtx } from './seasonContext';

/**
 * 시즌 서브라우트(로스터/순위/일정/리더보드/전술/경기) 공유 레이아웃.
 * LeagueLayout과 동일한 패턴 — useMultiGameData()를 여기서 한 번만 호출해 Context로
 * 공유한다. 이전엔 각 하위 화면이 독립적으로 useMultiGameData()를 호출해서, 뒤로가기로
 * 돌아오면 컴포넌트가 다시 마운트되며 매번 새로 데이터를 불러오고 로컬 상태(저장 안 한
 * 전술 수정 등)가 초기화되는 문제가 있었다.
 */
export function MultiSeasonLayout() {
    const location = useLocation();
    // 경기 관람 화면(game/:gameId)에서는 헤더를 숨겨 화면을 넓게 쓴다.
    const isWatchingGame = /\/season\/game\/[^/]+$/.test(location.pathname);

    const { room } = useLeagueContext();
    const { session } = useGame();
    const gameData = useMultiGameData(session, room?.id ?? null);

    if (gameData.isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-screen bg-gray-950">
                <Loader2 size={32} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <SeasonCtx.Provider value={gameData}>
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
        </SeasonCtx.Provider>
    );
}
