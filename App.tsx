
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabaseClient';
import { useBaseData, useLoadSave, useSaveGame } from './services/queries';
import { initGA, logPageView } from './services/analytics';
import { Team, Game, AppView, PlayoffSeries, Transaction, Player, PlayerBoxScore } from './types';
import { generateSeasonSchedule } from './utils/constants';
import { generateAutoTactics, GameTactics } from './services/gameEngine';

// Views
import { AuthView } from './views/AuthView';
import { TeamSelectView } from './views/TeamSelectView';
import { OnboardingView } from './views/OnboardingView';
import { DashboardView } from './views/DashboardView';
import { RosterView } from './views/RosterView';
import { ScheduleView } from './views/ScheduleView';
import { StandingsView } from './views/StandingsView';
import { LeaderboardView } from './views/LeaderboardView';
import { TransactionsView } from './views/TransactionsView';
import { PlayoffsView } from './views/PlayoffsView';
import { SeasonReviewView } from './views/SeasonReviewView';
import { PlayoffReviewView } from './views/PlayoffReviewView';
import { DraftView } from './views/DraftView';
import { HelpView } from './views/HelpView';
import { OvrCalculatorView } from './views/OvrCalculatorView';

// Components
import { Footer } from './components/Footer';
import { LiveScoreTicker } from './components/LiveScoreTicker';
import { Toast } from './components/SharedComponents';

const INITIAL_DATE = '2025-10-22';

const App: React.FC = () => {
  const queryClient = useQueryClient();
  
  // Auth State
  const [session, setSession] = useState<Session | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);

  // App Navigation
  const [view, setView] = useState<AppView>('TeamSelect');
  
  // Game Data State
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<Game[]>([]);
  const [boxScores, setBoxScores] = useState<Record<string, PlayerBoxScore[]>>({});
  const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [prospects, setProspects] = useState<Player[]>([]);
  const [currentSimDate, setCurrentSimDate] = useState<string>(INITIAL_DATE);
  const [userTactics, setUserTactics] = useState<GameTactics | null>(null);

  // UI State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Refs for logic/save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameDataRef = useRef<any>({});

  // Mutations & Queries
  const saveGameMutation = useSaveGame();
  const { data: baseData, isLoading: isBaseDataLoading } = useBaseData();
  const { data: saveData } = useLoadSave(session?.user?.id);

  // Initialize GA
  useEffect(() => {
    initGA();
  }, []);

  // Update GameData Ref for Save/Logout
  useEffect(() => {
    gameDataRef.current = {
        myTeamId, teams, schedule, boxScores, currentSimDate, userTactics, playoffSeries, transactions, prospects
    };
  }, [myTeamId, teams, schedule, boxScores, currentSimDate, userTactics, playoffSeries, transactions, prospects]);

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize Base Data
  useEffect(() => {
      if (baseData && teams.length === 0) {
          setTeams(baseData.teams);
          setSchedule(baseData.schedule);
      }
  }, [baseData]);

  // Load Save Data
  useEffect(() => {
      if (saveData && saveData.game_data) {
          const gd = saveData.game_data;
          setMyTeamId(saveData.team_id);
          if (gd.teams) setTeams(gd.teams);
          if (gd.schedule) setSchedule(gd.schedule);
          if (gd.boxScores) setBoxScores(gd.boxScores);
          if (gd.currentSimDate) setCurrentSimDate(gd.currentSimDate);
          if (gd.tactics) setUserTactics(gd.tactics);
          if (gd.playoffSeries) setPlayoffSeries(gd.playoffSeries);
          if (gd.transactions) setTransactions(gd.transactions);
          if (gd.prospects) setProspects(gd.prospects);
          
          if (saveData.team_id) setView('Dashboard');
          setToastMessage('저장된 게임을 불러왔습니다.');
      }
  }, [saveData]);

  // View Logger
  useEffect(() => {
      logPageView(view);
  }, [view]);

  const handleLogout = async () => {
    // 1. Clear any pending auto-saves immediately
    if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
    }

    // 2. Perform Final Save
    if (session?.user && !isGuestMode && myTeamId) {
        setToastMessage("데이터 안전 저장 중... 잠시만 기다려주세요.");
        const currentData = gameDataRef.current;
        
        if (!currentData.myTeamId) {
            console.error("Logout Error: No Team ID found for save.");
        } else {
            try {
                await saveGameMutation.mutateAsync({
                    userId: session.user.id,
                    teamId: currentData.myTeamId,
                    gameData: { 
                        teams: currentData.teams, 
                        schedule: currentData.schedule, 
                        boxScores: currentData.boxScores, 
                        currentSimDate: currentData.currentSimDate, 
                        tactics: currentData.userTactics, 
                        playoffSeries: currentData.playoffSeries, 
                        transactions: currentData.transactions, 
                        prospects: currentData.prospects 
                    }
                });
                console.log("Logout: Final save completed successfully.");
            } catch (e) {
                console.error("Logout: Final save failed", e);
                alert("데이터 저장에 실패했습니다. 인터넷 연결을 확인해주세요. (로그아웃이 취소되었습니다)");
                setToastMessage(null); 
                return; 
            }
        }
    }

    // [PERFORMANCE FIX] 
    // 로그아웃 시 모든 진행중인 쿼리를 취소하고 캐시를 '완전히' 초기화합니다.
    // 이는 거대한 BaseData 객체가 메모리에 남아서 다음 로그인 세션에 영향을 주는 것을 방지합니다.
    await queryClient.cancelQueries();
    queryClient.clear();

    // 3. Clear Session & State
    if (session?.user) { 
        try { await supabase.from('profiles').update({ active_device_id: null, last_seen_at: null }).eq('id', session.user.id); } catch(e){}
        await supabase.auth.signOut();
    }
    setSession(null); setMyTeamId(null); setSchedule([]); setBoxScores({}); setPlayoffSeries([]); setTransactions([]); setProspects([]);
    setView('TeamSelect'); setIsGuestMode(false);
  };

  const handleSelectTeam = (id: string) => {
      setMyTeamId(id);
      setView('Onboarding');
  };

  const handleSim = (tactics: GameTactics) => {
      setUserTactics(tactics);
      setIsSimulating(true);
      setTimeout(() => {
          setIsSimulating(false);
          setToastMessage('시뮬레이션 완료 (Demo)');
      }, 1000);
  };

  const myTeam = teams.find(t => t.id === myTeamId);

  // Render Logic
  if (!session && !isGuestMode) {
      return (
        <>
            {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
            <AuthView />
        </>
      );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white font-sans">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      
      {/* Top Bar with Live Ticker */}
      <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center relative z-50">
          <div className="flex-1 overflow-hidden h-full">
             <LiveScoreTicker games={schedule.filter(g => g.played && g.date === currentSimDate)} />
          </div>
          <div className="px-4 flex items-center gap-4 bg-slate-900 h-full border-l border-slate-800">
              <button onClick={handleLogout} className="text-[10px] font-black uppercase text-red-400 hover:text-red-300 transition-colors">
                  LOGOUT
              </button>
          </div>
      </div>

      <main className="flex-1 overflow-y-auto relative custom-scrollbar">
        {view === 'TeamSelect' && (
            <TeamSelectView 
                teams={teams} 
                isInitializing={isBaseDataLoading} 
                onSelectTeam={handleSelectTeam}
            />
        )}

        {view === 'Onboarding' && myTeam && (
            <OnboardingView team={myTeam} onComplete={() => setView('Dashboard')} />
        )}

        {view === 'Dashboard' && myTeam && (
            <DashboardView 
                team={myTeam} 
                teams={teams} 
                schedule={schedule} 
                onSim={handleSim} 
                tactics={userTactics || generateAutoTactics(myTeam)} 
                onUpdateTactics={setUserTactics}
                currentSimDate={currentSimDate}
                isSimulating={isSimulating}
                onShowSeasonReview={() => setView('SeasonReview')}
                onShowPlayoffReview={() => setView('PlayoffReview')}
            />
        )}

        {view === 'Roster' && (
            <RosterView allTeams={teams} myTeamId={myTeamId || ''} />
        )}

        {view === 'Schedule' && myTeam && (
            <ScheduleView schedule={schedule} teamId={myTeamId || ''} teams={teams} onExport={() => {}} currentSimDate={currentSimDate} />
        )}

        {view === 'Standings' && (
            <StandingsView teams={teams} onTeamClick={(id) => { console.log('Team clicked:', id); }} />
        )}

        {view === 'Leaderboard' && (
            <LeaderboardView teams={teams} />
        )}

        {view === 'Transactions' && myTeam && (
            <TransactionsView 
                team={myTeam} 
                teams={teams} 
                setTeams={setTeams} 
                addNews={() => {}} 
                onShowToast={setToastMessage} 
                currentSimDate={currentSimDate} 
                transactions={transactions} 
                onAddTransaction={(t) => setTransactions(prev => [...prev, t])} 
            />
        )}

        {view === 'Playoffs' && (
            <PlayoffsView 
                teams={teams} 
                schedule={schedule} 
                series={playoffSeries} 
                setSeries={setPlayoffSeries} 
                setSchedule={setSchedule} 
                myTeamId={myTeamId || ''} 
            />
        )}

        {view === 'SeasonReview' && myTeam && (
            <SeasonReviewView team={myTeam} teams={teams} transactions={transactions} onBack={() => setView('Dashboard')} />
        )}

        {view === 'PlayoffReview' && myTeam && (
            <PlayoffReviewView team={myTeam} teams={teams} playoffSeries={playoffSeries} schedule={schedule} onBack={() => setView('Dashboard')} />
        )}

        {view === 'Draft' && myTeam && (
            <DraftView prospects={prospects} onDraft={(p) => console.log('Draft', p)} team={myTeam} />
        )}

        {view === 'OvrCalculator' && (
            <OvrCalculatorView teams={teams} />
        )}

        {view === 'Help' && (
            <HelpView onBack={() => setView('Dashboard')} />
        )}
      </main>

      {myTeamId && view !== 'TeamSelect' && view !== 'Onboarding' && (
          <Footer onNavigate={setView} />
      )}
    </div>
  );
};

export default App;
