
import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { generateAutoTactics } from './services/gameEngine';
import { initGA } from './services/analytics';

// Custom Hooks (Modularized Logic)
import { useAuth } from './hooks/useAuth';
import { useGameData } from './hooks/useGameData';
import { useSimulation } from './hooks/useSimulation';

// Icons & UI
import { Loader2, Save, Newspaper } from 'lucide-react';
import { Footer } from './components/Footer';
import { LiveScoreTicker } from './components/LiveScoreTicker';
import { Toast } from './components/SharedComponents';
import { Sidebar } from './components/Sidebar';
import { ResetDataModal } from './components/ResetDataModal';

// Views - Static Imports
import { AuthView } from './views/AuthView';
import { TeamSelectView } from './views/TeamSelectView';
import { OnboardingView } from './views/OnboardingView';

// Views - Lazy Imports
const DashboardView = lazy(() => import('./views/DashboardView').then(m => ({ default: m.DashboardView })));
const RosterView = lazy(() => import('./views/RosterView').then(m => ({ default: m.RosterView })));
const ScheduleView = lazy(() => import('./views/ScheduleView').then(m => ({ default: m.ScheduleView })));
const StandingsView = lazy(() => import('./views/StandingsView').then(m => ({ default: m.StandingsView })));
const LeaderboardView = lazy(() => import('./views/LeaderboardView').then(m => ({ default: m.LeaderboardView })));
const TransactionsView = lazy(() => import('./views/TransactionsView').then(m => ({ default: m.TransactionsView })));
const PlayoffsView = lazy(() => import('./views/PlayoffsView').then(m => ({ default: m.PlayoffsView })));
const SeasonReviewView = lazy(() => import('./views/SeasonReviewView').then(m => ({ default: m.SeasonReviewView })));
const PlayoffReviewView = lazy(() => import('./views/PlayoffReviewView').then(m => ({ default: m.PlayoffReviewView })));
const DraftView = lazy(() => import('./views/DraftView').then(m => ({ default: m.DraftView })));
const HelpView = lazy(() => import('./views/HelpView').then(m => ({ default: m.HelpView })));
const OvrCalculatorView = lazy(() => import('./views/OvrCalculatorView').then(m => ({ default: m.OvrCalculatorView })));
const GameSimulatingView = lazy(() => import('./views/GameSimulationView').then(m => ({ default: m.GameSimulatingView })));
const GameResultView = lazy(() => import('./views/GameResultView').then(m => ({ default: m.GameResultView })));

const LOADING_MESSAGES = [
    "라커룸을 청소하는 중...", "농구공에 바람 넣는 중...", "림에 새 그물을 다는 중...", "전술 보드를 닦는 중...",
    "선수들 유니폼 다림질 중...", "스카우팅 리포트 인쇄 중...", "경기장 조명 예열 중...", "마스코트 춤 연습 시키는 중...",
    "치어리더 대형 맞추는 중...", "단장님 명패 닦는 중...", "FA 시장 동향 파악 중...", "드래프트 픽 순번 확인 중..."
];

const ViewLoader = () => (
    <div className="flex flex-col items-center justify-center h-full w-full min-h-[400px] text-slate-500 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Loading View...</p>
    </div>
);

const FullScreenLoader = () => (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md text-slate-200">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
        <p className="text-sm font-black uppercase tracking-widest animate-pulse text-slate-400">Loading Game Engine...</p>
    </div>
);

const App: React.FC = () => {
    // 1. Auth Hook
    const { session, isGuestMode, setIsGuestMode, authLoading, handleLogout } = useAuth();
    
    // 2. Game Data Hook (State & Persistence)
    const gameData = useGameData(session, isGuestMode);
    
    // 3. UI State
    const [view, setView] = useState<'TeamSelect' | 'Onboarding' | 'GameSim' | 'GameResult' | 'Dashboard' | string>('TeamSelect');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [loadingText, setLoadingText] = useState(LOADING_MESSAGES[0]);

    // 4. Simulation Hook (Game Engine Logic)
    const sim = useSimulation(
        gameData.teams, gameData.setTeams,
        gameData.schedule, gameData.setSchedule,
        gameData.myTeamId,
        gameData.currentSimDate, 
        // [Critical Update] Pass overrides to forceSave to prevent race conditions during date advance
        (newDate, overrides) => { 
            gameData.setCurrentSimDate(newDate); 
            gameData.forceSave(overrides); 
        },
        gameData.playoffSeries, gameData.setPlayoffSeries,
        gameData.setTransactions,
        gameData.setNews,
        setToastMessage,
        // [New] Pass forceSave for Event-Driven Saves (Playoff Init, Game Finish)
        gameData.forceSave,
        session, isGuestMode
    );

    // Initialize GA
    useEffect(() => { initGA(); }, []);

    // Initial View Routing
    useEffect(() => {
        if (!session && !isGuestMode) return;
        if (gameData.myTeamId && gameData.hasInitialLoadRef.current && view === 'TeamSelect') {
            setView('Dashboard');
        }
    }, [gameData.myTeamId, gameData.hasInitialLoadRef.current, session, isGuestMode, view]);

    // View Switching logic for Simulation
    useEffect(() => {
        if (sim.activeGame) setView('GameSim');
    }, [sim.activeGame]);

    useEffect(() => {
        if (sim.lastGameResult) setView('GameResult');
    }, [sim.lastGameResult]);

    // Loading Message Cycler
    useEffect(() => {
        const isDataLoading = gameData.isBaseDataLoading || (session && gameData.isSaveLoading);
        if (isDataLoading) {
            setLoadingText(LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);
            const interval = setInterval(() => {
                setLoadingText(prev => {
                    let nextIndex;
                    do { nextIndex = Math.floor(Math.random() * LOADING_MESSAGES.length); } 
                    while (LOADING_MESSAGES[nextIndex] === prev && LOADING_MESSAGES.length > 1);
                    return LOADING_MESSAGES[nextIndex];
                });
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [gameData.isBaseDataLoading, session, gameData.isSaveLoading]);

    const handleSelectTeamWrapper = async (id: string) => {
        await gameData.handleSelectTeam(id);
        setView('Onboarding');
    };

    // [Critical Save] Updated Logout Handler
    const handleLogoutWrapper = async () => {
        // 1. Force save current data before logging out
        if (session && !isGuestMode && gameData.myTeamId) {
            setToastMessage("로그아웃 전 데이터를 저장하고 있습니다...");
            await gameData.forceSave();
        }
        
        // 2. Proceed with logout
        handleLogout(() => {
            gameData.cleanupData();
            setView('TeamSelect');
        });
    };

    // [Update] Ticker Data Logic with Dynamic Label
    const tickerData = useMemo(() => {
        const todayGames = gameData.schedule.filter(g => g.date === gameData.currentSimDate && g.played);
        if (todayGames.length > 0) return { games: todayGames, label: "Today's Results" };
        
        for (let i = gameData.schedule.length - 1; i >= 0; i--) {
            const game = gameData.schedule[i]; 
            if (game.played && game.date < gameData.currentSimDate) { 
                const pastGames = gameData.schedule.filter(g => g.date === game.date && g.played);
                // Return 'Latest Results' instead of specific date for cleaner UI, or use date if preferred
                return { games: pastGames, label: "Latest Results" }; 
            }
        }
        return { games: [], label: "Today's Results" };
    }, [gameData.schedule, gameData.currentSimDate]);

    // --- Render Conditions ---

    if (authLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-2">Initializing...</p>
            </div>
        );
    }

    if (!session && !isGuestMode) return <AuthView onGuestLogin={() => setIsGuestMode(true)} />;

    // [FIX] Update loading condition to rely on isSaveLoading instead of hasInitialLoadRef
    // This allows 'TeamSelect' to show up if no save exists.
    const isDataLoading = gameData.isBaseDataLoading || (session && gameData.isSaveLoading);
    
    if (isDataLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
                <p className="text-xl font-black uppercase tracking-tight text-white oswald animate-pulse">{loadingText}</p>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-2">Connecting to NBA Front Office...</p>
            </div>
        );
    }
    
    if (view === 'TeamSelect') return <TeamSelectView teams={gameData.teams} isInitializing={gameData.isBaseDataLoading} onSelectTeam={handleSelectTeamWrapper} dataSource='DB' />;
    if (view === 'Onboarding' && gameData.myTeamId) return <OnboardingView team={gameData.teams.find(t => t.id === gameData.myTeamId)!} onComplete={() => setView('Dashboard')} />;

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden ko-normal pretendard">
            {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
            {gameData.isSaving && (
                <div className="fixed bottom-4 right-4 z-[999] bg-slate-900/80 border border-slate-700 px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold text-slate-400 animate-pulse">
                    <Save size={12} /> Saving...
                </div>
            )}
            
            <ResetDataModal 
                isOpen={showResetConfirm} 
                isLoading={gameData.isResetting} 
                onClose={() => setShowResetConfirm(false)} 
                onConfirm={async () => {
                    const res = await gameData.handleResetData();
                    if (res.success) {
                        setToastMessage("구단 데이터가 완전히 초기화되었습니다.");
                        setShowResetConfirm(false);
                        setView('TeamSelect');
                    } else {
                        setToastMessage("초기화 중 오류가 발생했습니다.");
                    }
                }} 
            />

            <div className="flex-1 flex overflow-hidden relative">
                <Sidebar 
                    team={gameData.teams.find(t => t.id === gameData.myTeamId)}
                    currentSimDate={gameData.currentSimDate}
                    currentView={view as any}
                    isGuestMode={isGuestMode}
                    onNavigate={(v) => setView(v)}
                    onResetClick={() => setShowResetConfirm(true)}
                    onLogout={handleLogoutWrapper}
                />

                <main className="flex-1 overflow-y-auto bg-slate-950/50 relative flex flex-col">
                    <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center relative z-10 flex-shrink-0">
                        <LiveScoreTicker games={tickerData.games} label={tickerData.label} />
                    </div>

                    {gameData.news && gameData.news.length > 0 && (
                        <div className="bg-indigo-950/40 border-b border-indigo-500/20 px-8 py-2.5 flex items-center gap-4 overflow-hidden relative group">
                            <div className="flex-shrink-0 flex items-center gap-2 text-indigo-400 font-black text-[10px] uppercase tracking-[0.2em] oswald">
                                <Newspaper size={14} className="animate-pulse" />
                                <span>NBA Ticker</span>
                            </div>
                            <div className="flex-1 overflow-hidden relative h-5">
                                <div className="absolute inset-0 flex items-center animate-marquee whitespace-nowrap gap-12">
                                    {[...gameData.news, ...gameData.news].map((item, i) => (
                                        <span key={i} className="text-xs font-bold text-slate-300 ko-tight flex items-center gap-3">
                                            <div className="w-1 h-1 rounded-full bg-indigo-500"></div>
                                            {typeof item === 'string' ? item : item.content}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 p-8 lg:p-12">
                        <Suspense fallback={<ViewLoader />}>
                            {view === 'Dashboard' && gameData.myTeamId && <DashboardView team={gameData.teams.find(t => t.id === gameData.myTeamId)!} teams={gameData.teams} schedule={gameData.schedule} onSim={sim.handleExecuteSim} tactics={gameData.userTactics || generateAutoTactics(gameData.teams.find(t => t.id === gameData.myTeamId)!)} onUpdateTactics={gameData.setUserTactics} currentSimDate={gameData.currentSimDate} isSimulating={sim.isSimulating} onShowSeasonReview={() => setView('SeasonReview')} onShowPlayoffReview={() => setView('PlayoffReview')} hasPlayoffHistory={gameData.playoffSeries.length > 0} playoffSeries={gameData.playoffSeries} />}
                            {view === 'Roster' && <RosterView allTeams={gameData.teams} myTeamId={gameData.myTeamId!} />}
                            {view === 'Standings' && <StandingsView teams={gameData.teams} onTeamClick={id => console.log(id)} />}
                            {view === 'Leaderboard' && <LeaderboardView teams={gameData.teams} />}
                            {view === 'Playoffs' && <PlayoffsView teams={gameData.teams} schedule={gameData.schedule} series={gameData.playoffSeries} setSeries={gameData.setPlayoffSeries} setSchedule={gameData.setSchedule} myTeamId={gameData.myTeamId!} />}
                            {view === 'Schedule' && <ScheduleView schedule={gameData.schedule} teamId={gameData.myTeamId!} teams={gameData.teams} onExport={() => {}} currentSimDate={gameData.currentSimDate} />}
                            {view === 'Transactions' && gameData.myTeamId && <TransactionsView team={gameData.teams.find(t => t.id === gameData.myTeamId)!} teams={gameData.teams} setTeams={gameData.setTeams} addNews={() => {}} onShowToast={setToastMessage} currentSimDate={gameData.currentSimDate} transactions={gameData.transactions} onAddTransaction={(t) => gameData.setTransactions(prev => [t, ...prev])} onForceSave={gameData.forceSave} />}
                            {view === 'Help' && <HelpView onBack={() => setView('Dashboard')} />}
                            {view === 'OvrCalculator' && <OvrCalculatorView teams={gameData.teams} />}
                            {view === 'SeasonReview' && gameData.myTeamId && <SeasonReviewView team={gameData.teams.find(t => t.id === gameData.myTeamId)!} teams={gameData.teams} transactions={gameData.transactions} onBack={() => setView('Dashboard')} />}
                            {view === 'PlayoffReview' && gameData.myTeamId && <PlayoffReviewView team={gameData.teams.find(t => t.id === gameData.myTeamId)!} teams={gameData.teams} playoffSeries={gameData.playoffSeries} schedule={gameData.schedule} onBack={() => setView('Dashboard')} />}
                            {view === 'Draft' && <DraftView prospects={gameData.prospects} onDraft={(p) => console.log('Draft', p)} team={gameData.teams.find(t => t.id === gameData.myTeamId)!} />}
                        </Suspense>
                    </div>
                    <Footer onNavigate={(v) => setView(v)} />
                </main>

                <Suspense fallback={<FullScreenLoader />}>
                    {view === 'GameSim' && sim.activeGame && <GameSimulatingView homeTeam={gameData.teams.find(t => t.id === sim.activeGame!.homeTeamId)!} awayTeam={gameData.teams.find(t => t.id === sim.activeGame!.awayTeamId)!} userTeamId={gameData.myTeamId} finalHomeScore={sim.activeGame.homeScore} finalAwayScore={sim.activeGame.awayScore} onSimulationComplete={() => sim.finalizeSimRef.current?.()} />}
                    {view === 'GameResult' && sim.lastGameResult && <GameResultView result={sim.lastGameResult} myTeamId={gameData.myTeamId!} teams={gameData.teams} onFinish={() => { sim.setIsSimulating(false); setView('Dashboard'); }} />}
                </Suspense>
            </div>
        </div>
    );
};

export default App;
