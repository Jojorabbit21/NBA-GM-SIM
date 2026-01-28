
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Team, Game, AppView, PlayoffSeries, Transaction } from './types';
import { GameTactics } from './services/gameEngine';
import { runServerSideSim, fetchLeagueData } from './services/queries';
import { supabase } from './services/supabaseClient';
import { SEASON_START_DATE } from './utils/constants';

// Views
import { AuthView } from './views/AuthView';
import { TeamSelectView } from './views/TeamSelectView';
import { OnboardingView } from './views/OnboardingView';
import { DashboardView } from './views/DashboardView';
import { RosterView } from './views/RosterView';
import { StandingsView } from './views/StandingsView';
import { LeaderboardView } from './views/LeaderboardView';
import { ScheduleView } from './views/ScheduleView';
import { TransactionsView } from './views/TransactionsView';
import { PlayoffsView } from './views/PlayoffsView';
import { OvrCalculatorView } from './views/OvrCalculatorView';
import { HelpView } from './views/HelpView';
import { GameResultView } from './views/GameResultView';

// Components
import { Sidebar } from './components/Sidebar';
import { Footer } from './components/Footer';
import { Toast } from './components/SharedComponents';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [view, setView] = useState<AppView>('TeamSelect');
  const [teams, setTeams] = useState<Team[]>([]);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Game[]>([]);
  const [currentSimDate, setCurrentSimDate] = useState(SEASON_START_DATE);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastGameResult, setLastGameResult] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [tactics, setTactics] = useState<GameTactics | null>(null);
  const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  const loadAppData = useCallback(async (userId?: string) => {
    try {
      setIsInitializing(true);
      console.log(`[SaveSystem] Initializing for User: ${userId}`);
      
      // 1. 리그 메타 데이터 로드
      const { teams: dbTeams, schedule: dbSchedule } = await fetchLeagueData(userId);
      
      // [Validation] 로스터가 비었는지 체크
      const emptyTeams = dbTeams.filter(t => t.roster.length === 0);
      if (emptyTeams.length > 0) {
        console.error(`[CRITICAL] ${emptyTeams.length} teams have EMPTY rosters! Check team_id mapping in fetchLeagueData.`);
      }

      setTeams(dbTeams);
      setSchedule(dbSchedule);

      // 2. 세이브 데이터 복구 (Saves 테이블 -> LocalStorage)
      let recoveredTeamId = null;
      let recoveredDate = null;

      if (userId && userId !== 'guest') {
        // [Fix] Changed 'current_date' to 'sim_date' to avoid SQL keyword conflicts
        const { data: saveEntry, error: saveError } = await supabase
          .from('saves') 
          .select('team_id, sim_date') 
          .eq('user_id', userId)
          .maybeSingle();
        
        if (saveEntry) {
          console.log("[SaveSystem] DB Save found:", saveEntry);
          recoveredTeamId = saveEntry.team_id;
          recoveredDate = saveEntry.sim_date;
        } else if (saveError) {
          console.error("[SaveSystem] DB Query Error:", saveError.message);
        }
      }

      if (!recoveredTeamId) {
        const localSave = localStorage.getItem(`nba_gm_save_${userId || 'guest'}`);
        if (localSave) {
          const parsed = JSON.parse(localSave);
          recoveredTeamId = parsed.teamId;
          recoveredDate = parsed.currentDate;
          console.log("[SaveSystem] LocalStorage Save restored:", recoveredTeamId);
        }
      }

      if (recoveredTeamId) {
        setMyTeamId(recoveredTeamId);
        if (recoveredDate) setCurrentSimDate(recoveredDate);
        setView('Dashboard');
      } else {
        setView('TeamSelect');
      }
    } catch (e) {
      console.error("[SaveSystem] Critical load failure:", e);
      setToastMessage("데이터를 불러오지 못했습니다.");
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadAppData(session.user.id);
      else setIsInitializing(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadAppData(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [loadAppData]);

  const saveGameState = async (teamId: string, date: string) => {
    const userId = session?.user?.id;
    if (!userId) return;

    localStorage.setItem(`nba_gm_save_${userId}`, JSON.stringify({ teamId, currentDate: date }));

    if (userId !== 'guest') {
      // [Fix] Changed 'current_date' to 'sim_date'
      const { error } = await supabase
        .from('saves')
        .upsert({ 
          user_id: userId, 
          team_id: teamId, 
          sim_date: date,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      
      if (error) console.warn("[SaveSystem] DB Sync failed:", error.message);
    }
  };

  const handleSelectTeam = async (teamId: string) => {
    setMyTeamId(teamId);
    setView('Onboarding');
    await saveGameState(teamId, currentSimDate);
  };

  const handleExecuteSim = async (gameTactics: GameTactics) => {
    if (!myTeamId || !session?.user) return;
    setIsSimulating(true);
    try {
        const result = await runServerSideSim({
            userId: session.user.id,
            teamId: myTeamId,
            tactics: gameTactics,
            date: currentSimDate
        });
        if (result) {
            setTeams(result.updatedTeams);
            setSchedule(result.updatedSchedule);
            if (result.userGameResult) {
                setLastGameResult(result.userGameResult);
                setView('GameResult');
            } else {
                const d = new Date(currentSimDate);
                d.setDate(d.getDate() + 1);
                const nextDate = d.toISOString().split('T')[0];
                setCurrentSimDate(nextDate);
                await saveGameState(myTeamId, nextDate);
            }
        }
    } catch (e) {
        setToastMessage("시뮬레이션 중 오류가 발생했습니다.");
    } finally {
        setIsSimulating(false);
    }
  };

  if (!session) {
    return <AuthView onGuestLogin={() => { setSession({ user: { id: 'guest' } }); setView('TeamSelect'); setIsInitializing(false); }} />;
  }

  if (isInitializing) {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-indigo-500 mb-4" size={48} />
        <p className="text-slate-400 font-bold animate-pulse">단장님 리포트를 동기화 중...</p>
      </div>
    );
  }

  const myTeam = teams.find(t => t.id === myTeamId);

  if (view === 'TeamSelect') {
    return (
      <TeamSelectView 
        teams={teams} 
        isInitializing={false} 
        onSelectTeam={handleSelectTeam} 
      />
    );
  }

  if (view === 'Onboarding' && myTeam) {
    return <OnboardingView team={myTeam} onComplete={() => setView('Dashboard')} />;
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar 
        team={myTeam}
        currentSimDate={currentSimDate}
        currentView={view}
        isGuestMode={session?.user?.id === 'guest'}
        onNavigate={setView}
        onResetClick={() => {
            if(confirm("모든 세이브 데이터가 초기화됩니다. 계속하시겠습니까?")) {
                localStorage.clear();
                window.location.reload();
            }
        }}
        onLogout={() => supabase.auth.signOut()}
      />
      
      <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
        <div className="p-8 lg:p-12 flex-1">
          {view === 'Dashboard' && myTeam && (
            <DashboardView 
              team={myTeam}
              teams={teams}
              schedule={schedule}
              tactics={tactics || { offenseTactics: ['Balance'], defenseTactics: ['ManToManPerimeter'], sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 3, zoneUsage: 3, rotationFlexibility: 5 }, starters: { PG: '', SG: '', SF: '', PF: '', C: '' }, minutesLimits: {} }}
              onUpdateTactics={setTactics}
              onSim={handleExecuteSim}
              currentSimDate={currentSimDate}
              isSimulating={isSimulating}
              onShowSeasonReview={() => setView('SeasonReview')}
              onShowPlayoffReview={() => setView('PlayoffReview')}
              playoffSeries={playoffSeries}
            />
          )}
          {view === 'Roster' && (
            <RosterView allTeams={teams} myTeamId={myTeamId!} />
          )}
          {view === 'Standings' && (
            <StandingsView teams={teams} onTeamClick={() => {}} />
          )}
          {view === 'Leaderboard' && (
            <LeaderboardView teams={teams} />
          )}
          {view === 'Schedule' && (
            <ScheduleView schedule={schedule} teamId={myTeamId!} teams={teams} onExport={() => {}} currentSimDate={currentSimDate} />
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
                onAddTransaction={(t) => setTransactions([...transactions, t])}
            />
          )}
          {view === 'Playoffs' && (
            <PlayoffsView 
                teams={teams} 
                schedule={schedule} 
                series={playoffSeries} 
                setSeries={setPlayoffSeries} 
                setSchedule={setSchedule} 
                myTeamId={myTeamId!} 
            />
          )}
          {view === 'OvrCalculator' && (
            <OvrCalculatorView teams={teams} />
          )}
          {view === 'Help' && (
            <HelpView onBack={() => setView('Dashboard')} />
          )}
          {view === 'GameResult' && lastGameResult && (
            <GameResultView 
              result={lastGameResult}
              myTeamId={myTeamId!}
              teams={teams}
              onFinish={() => setView('Dashboard')}
            />
          )}
        </div>
        <Footer onNavigate={setView} />
      </main>

      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </div>
  );
}
