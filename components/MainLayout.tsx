
import React, { Suspense } from 'react';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { AppView, Team } from '../types';
import FullScreenLoader from './FullScreenLoader';

interface MainLayoutProps {
    children: React.ReactNode;
    sidebarProps: {
        team: Team | undefined;
        currentSimDate: string;
        currentView: AppView;
        isGuestMode: boolean;
        unreadMessagesCount: number;
        onNavigate: (view: AppView) => void;
        onResetClick: () => void;
        onLogout: () => void;
    };
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, sidebarProps }) => (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200 selection:bg-indigo-500/30">
        <Sidebar {...sidebarProps} />
        <main className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col">
            <div className="flex-1 p-8 lg:p-12">
                <Suspense fallback={<FullScreenLoader />}>
                    {children}
                </Suspense>
            </div>
            <Footer onNavigate={sidebarProps.onNavigate} />
        </main>
    </div>
);

export default MainLayout;
