
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { MultiSidebar } from '../../../components/MultiSidebar';
import { MultiHeader } from '../../../components/MultiHeader';
import { TournamentChampionModal } from '../../../components/multi/TournamentChampionModal';

export function MultiSeasonLayout() {
    const location = useLocation();
    // 경기 관람 화면(game/:gameId)에서는 헤더를 숨겨 화면을 넓게 쓴다.
    const isWatchingGame = /\/season\/game\/[^/]+$/.test(location.pathname);

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
