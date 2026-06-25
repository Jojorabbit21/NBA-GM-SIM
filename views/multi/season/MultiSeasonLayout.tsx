
import React from 'react';
import { Outlet } from 'react-router-dom';
import { MultiSidebar } from '../../../components/MultiSidebar';
import { MultiHeader } from '../../../components/MultiHeader';

export function MultiSeasonLayout() {
    return (
        <div className="flex h-screen overflow-hidden bg-slate-950">
            <MultiSidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <MultiHeader />
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
