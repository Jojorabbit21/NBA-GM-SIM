
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabaseClient';
import { useBaseData, useLoadSave, useSaveGame } from './services/queries';
import { initGA, logPageView } from './services/analytics';
import { Team, Game, AppView, PlayoffSeries, Transaction, Player, PlayerBoxScore, TeamTacticHistory, TacticStatRecord } from './types';
// Import INITIAL_STATS to fix the error in line 289
import { generateSeasonSchedule, INITIAL_STATS } from './utils/constants';
import { generateAutoTactics, GameTactics, SimulationResult, simulateGame } from './services/gameEngine';
import { generateGameRecapNews, generateOwnerWelcome } from './services/geminiService';

// Icons
import { 
  Trophy, Users, Calendar as CalendarIcon, ArrowLeftRight, LayoutDashboard, 
  RefreshCw, Clock, Swords, LogOut, Cloud, Loader2, BarChart3,
  FlaskConical
} from 'lucide-react';

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
import { GameSimulatingView } from './views/GameSimulationView';
import { GameResultView } from './views/GameResultView';

// Components
import { Footer } from './components/Footer';
import { LiveScoreTicker } from './components/LiveScoreTicker';
import { Toast, ActionToast, NavItem } from './components/SharedComponents';

const INITIAL_DATE = '2025-10-22';

const App: React.FC = () => {
  const queryClient = useQueryClient();
  
  // Auth State
  const [session, setSession] = useState<Session | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // App Navigation
  const [view, setView] = useState<AppView>('TeamSelect');
  
  // Game Data State
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<Game[]>([]);
  const [boxScores, setBoxScores] = useState<Record<string, { home: PlayerBoxScore[], away: PlayerBoxScore[] }>>({});
  const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [prospects, setProspects] = useState<Player[]>([]);
  const [currentSimDate, setCurrentSimDate] = useState<string>(INITIAL_DATE);
  const [userTactics, setUserTactics] = useState<GameTactics | null>(null);
  const [news, setNews] = useState<any[]>([]);

  // UI State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Simulation State
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [lastGameResult, setLastGameResult] = useState<any>(null);
  const finalizeSimRef = useRef<((userResult?: any) => void) | null>(null);

  // Refs for logic/save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameDataRef = useRef<any>({});
  const isResettingRef = useRef(false);
  const isLoggingOutRef = useRef(false);
  const hasInitialLoadRef = useRef(false);

  // Mutations & Queries
  const saveGameMutation = useSaveGame();
  const { data: baseData, isLoading: isBaseDataLoading, refetch: refetchBaseData } = useBaseData();
  const { data: saveData, isLoading: isSaveLoading, isFetching: isSaveFetching } = useLoadSave(session?.user?.id);

  // Initialize GA
  useEffect(() => {
    initGA();
  }, []);

  // Update GameData Ref for Save/Logout
  useEffect(() => {
    gameDataRef.current = {
        myTeamId, 
        teams, 
        schedule, 
        boxScores, 
        currentSimDate, 
        tactics: userTactics, 
        playoffSeries, 
        transactions, 
        prospects
    };
  }, [myTeamId, teams, schedule, boxScores, currentSimDate, userTactics, playoffSeries, transactions, prospects]);

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !isLoggingOutRef.current) {
        setSession(session);
        isLoggingOutRef.current = false; 
      } else if (!session) {
        setSession(null);
        hasInitialLoadRef.current = false;
      }
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isLoggingOutRef.current) return;
      if (session) {
          setSession(session);
      } else {
          setSession(null);
          hasInitialLoadRef.current = false;
      }
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize Base Data
  useEffect(() => {
      if (baseData && teams.length === 0 && !myTeamId) {
          setTeams(baseData.teams);
          setSchedule(baseData.schedule);
      }
  }, [baseData, teams.length, myTeamId]);

  // Load Save Data
  useEffect(() => {
      if (isLoggingOutRef.current || isResettingRef.current || !session?.user || isGuestMode) return;
      if (hasInitialLoadRef.current) return;

      if (saveData && saveData.game_data) {
          const gd = saveData.game_data;
          setMyTeamId(saveData.team_id);
          if (gd.teams) setTeams(gd.teams);
          if (gd.schedule) setSchedule(gd.schedule);
          if (gd.boxScores) setBoxScores(gd.boxScores);
          if (gd.currentSimDate) setCurrentSimDate(gd.currentSimDate);
          if (gd.tactics) setUserTactics(gd.tactics);
          else if (gd.userTactics) setUserTactics(gd.userTactics);
          if (gd.playoffSeries) setPlayoffSeries(gd.playoffSeries);
          if (gd.transactions) setTransactions(gd.transactions);
          if (gd.prospects) setProspects(gd.prospects);
          if (saveData.team_id) setView('Dashboard');
          hasInitialLoadRef.current = true;
      }
  }, [saveData, session, isGuestMode]);

  // View Logger
  useEffect(() => {
      logPageView(view);
  }, [view]);

  // Auto Save Logic
  const triggerSave = useCallback(() => {
      if (isResettingRef.current || isLoggingOutRef.current) return;
      if (!session?.user || isGuestMode) return;
      
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
          if (isResettingRef.current || isLoggingOutRef.current) return;
          const currentData = gameDataRef.current;
          if (!currentData.myTeamId) return;
          saveGameMutation.mutate({
              userId: session.user.id,
              teamId: currentData.myTeamId,
              gameData: currentData
          });
      }, 5000); 
  }, [session, isGuestMode, saveGameMutation]);

  useEffect(() => {
    if (myTeamId && session?.user && !isGuestMode) triggerSave();
  }, [teams, schedule, boxScores, currentSimDate, userTactics, playoffSeries, transactions, prospects, myTeamId, session, isGuestMode, triggerSave]);

  const handleLogout = async () => {
    isLoggingOutRef.current = true;
    hasInitialLoadRef.current = false;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    if (session?.user && !isGuestMode && myTeamId && gameDataRef.current?.myTeamId) {
        saveGameMutation.mutate({
            userId: session.user.id,
            teamId: gameDataRef.current.myTeamId,
            gameData: gameDataRef.current
        });
    }

    supabase.auth.signOut().catch(() => {});
    queryClient.clear();
    
    setSession(null); setMyTeamId(null); setSchedule([]); setBoxScores({}); setPlayoffSeries([]); setTransactions([]); setProspects([]);
    setToastMessage(null); setView('TeamSelect'); setIsGuestMode(false);
    
    setTimeout(() => { isLoggingOutRef.current = false; }, 500);
  };

  const handleHardReset = async () => {
    if (session?.user && !isGuestMode) {
        isResettingRef.current = true;
        hasInitialLoadRef.current = false; 
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setAuthLoading(true);
        try { 
            await supabase.from('saves').delete().eq('user_id', session.user.id);
            queryClient.removeQueries({ queryKey: ['saveData', session.user.id] });
        } catch(e) {}
    }
    
    setMyTeamId(null); setSchedule([]); setBoxScores({}); setPlayoffSeries([]); setTransactions([]); setNews([]);
    setCurrentSimDate(INITIAL_DATE); setLastGameResult(null); setActiveGame(null);
    if (baseData) { setTeams(baseData.teams); if(baseData.schedule) setSchedule(baseData.schedule); }
    setShowResetConfirm(false); 
    if (session?.user && !isGuestMode) setAuthLoading(false);
    setView('TeamSelect');
    setTimeout(() => { isResettingRef.current = false; }, 1000);
  };

  const handleSelectTeam = useCallback(async (teamId: string) => {
    if (myTeamId) return;
    setMyTeamId(teamId);
    hasInitialLoadRef.current = true; 
    if (baseData?.schedule && baseData.schedule.length > 0) setSchedule(baseData.schedule);
    else setSchedule(generateSeasonSchedule(teamId));
    setCurrentSimDate(INITIAL_DATE);
    const teamData = teams.find(t => t.id === teamId);
    if (teamData) {
      const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
      setNews([{ type: 'text', content: welcome }]);
    }
    setView('Onboarding'); 
  }, [baseData, myTeamId, teams]);

  const handleExecuteSim = async (tactics: GameTactics) => {
    const myTeam = teams.find(t => t.id === myTeamId);
    if (!myTeamId || !myTeam) return;
    const targetSimDate = currentSimDate;
    const gamesToday = schedule.filter(g => g.date === targetSimDate && !g.played);
    const userGameToday = gamesToday.find(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId);
    
    const processSimulation = async (precalcUserResult?: SimulationResult) => {
        let teamsWithDailyRecovery = teams.map(t => ({
            ...t, roster: t.roster.map(p => ({ ...p, condition: Math.min(100, Math.floor((p.condition ?? 100) + 16 + (p.stamina * 0.18))) }))
        }));
        let updatedTeams = [...teamsWithDailyRecovery];
        let updatedSchedule = [...schedule];
        let updatedBoxScores = { ...boxScores };
        let updatedSeries = [...playoffSeries];
        let userGameResultOutput = null;
        let allPlayedToday: Game[] = [];
        const getTeam = (id: string) => updatedTeams.find(t => t.id === id);

        for (const game of gamesToday) {
            const isUserGame = (game.homeTeamId === myTeamId || game.awayTeamId === myTeamId);
            const home = getTeam(game.homeTeamId); const away = getTeam(game.awayTeamId);
            if (!home || !away) continue;
            const result = (isUserGame && precalcUserResult) ? precalcUserResult : simulateGame(home, away, myTeamId, isUserGame ? tactics : undefined);
            const homeIdx = updatedTeams.findIndex(t => t.id === home.id); const awayIdx = updatedTeams.findIndex(t => t.id === away.id);
            const homeWin = result.homeScore > result.awayScore;
            updatedTeams[homeIdx] = { ...home, wins: home.wins + (homeWin ? 1 : 0), losses: home.losses + (homeWin ? 0 : 1) };
            updatedTeams[awayIdx] = { ...away, wins: away.wins + (homeWin ? 0 : 1), losses: away.losses + (homeWin ? 1 : 0) };

            const updateRosterStats = (teamIdx: number, boxScore: PlayerBoxScore[], rosterUpdates: any) => {
                const t = updatedTeams[teamIdx];
                t.roster = t.roster.map(p => {
                    const update = rosterUpdates[p.id]; const box = boxScore.find(b => b.playerId === p.id);
                    let targetStats = game.isPlayoff ? (p.playoffStats || INITIAL_STATS()) : p.stats;
                    if (box) {
                        targetStats.g += 1; targetStats.gs += box.gs; targetStats.mp += box.mp; targetStats.pts += box.pts; targetStats.reb += box.reb;
                        targetStats.ast += box.ast; targetStats.stl += box.stl; targetStats.blk += box.blk; targetStats.tov += box.tov;
                        targetStats.fgm += box.fgm; targetStats.fga += box.fga; targetStats.p3m += box.p3m; targetStats.p3a += box.p3a;
                        targetStats.ftm += box.ftm; targetStats.fta += box.fta;
                    }
                    const returnObj = { ...p, condition: update?.condition ?? p.condition, health: update?.health ?? p.health, injuryType: update?.injuryType ?? p.injuryType, returnDate: update?.returnDate ?? p.returnDate };
                    if (game.isPlayoff) returnObj.playoffStats = targetStats; else returnObj.stats = targetStats;
                    return returnObj;
                });
            };
            updateRosterStats(homeIdx, result.homeBox, result.rosterUpdates);
            updateRosterStats(awayIdx, result.awayBox, result.rosterUpdates);

            const updatedGame: Game = { ...game, played: true, homeScore: result.homeScore, awayScore: result.awayScore, tactics: { home: result.homeTactics, away: result.awayTactics } };
            const schIdx = updatedSchedule.findIndex(g => g.id === game.id);
            if (schIdx !== -1) updatedSchedule[schIdx] = updatedGame;
            
            if (game.isPlayoff && game.seriesId) {
                const sIdx = updatedSeries.findIndex(s => s.id === game.seriesId);
                if (sIdx !== -1) {
                    const series = updatedSeries[sIdx]; const winnerId = result.homeScore > result.awayScore ? home.id : away.id;
                    const isHigherWinner = winnerId === series.higherSeedId;
                    const newH = series.higherSeedWins + (isHigherWinner ? 1 : 0); const newL = series.lowerSeedWins + (!isHigherWinner ? 1 : 0);
                    const target = series.targetWins || 4; const finished = newH >= target || newL >= target;
                    updatedSeries[sIdx] = { ...series, higherSeedWins: newH, lowerSeedWins: newL, finished, winnerId: finished ? (newH >= target ? series.higherSeedId : series.lowerSeedId) : undefined };
                }
            }
            updatedBoxScores[game.id] = { home: result.homeBox, away: result.awayBox }; allPlayedToday.push(updatedGame);
            if (isUserGame) userGameResultOutput = { ...result, home: updatedTeams[homeIdx], away: updatedTeams[awayIdx], userTactics: tactics, myTeamId }; 
        }

        const currentDateObj = new Date(targetSimDate); currentDateObj.setDate(currentDateObj.getDate() + 1);
        setTeams(updatedTeams); setSchedule(updatedSchedule); setBoxScores(updatedBoxScores); setPlayoffSeries(updatedSeries); 
        setCurrentSimDate(currentDateObj.toISOString().split('T')[0]); triggerSave();
        
        if (userGameResultOutput) {
            const recap = await generateGameRecapNews(userGameResultOutput);
            setLastGameResult({ ...userGameResultOutput, recap: recap || [], otherGames: allPlayedToday.filter(g => g.homeTeamId !== myTeamId && g.awayTeamId !== myTeamId) });
            setView('GameResult');
        } else setIsSimulating(false); 
    };
    
    if (userGameToday) {
        const home = teams.find(t => t.id === userGameToday.homeTeamId)!; const away = teams.find(t => t.id === userGameToday.awayTeamId)!;
        const precalculatedUserResult = simulateGame(home, away, myTeamId, tactics);
        setActiveGame({ ...userGameToday, homeScore: precalculatedUserResult.homeScore, awayScore: precalculatedUserResult.awayScore }); setView('GameSim');
        finalizeSimRef.current = () => processSimulation(precalculatedUserResult);
    } else { setIsSimulating(true); setTimeout(() => processSimulation(), 800); }
  };

  const myTeam = teams.find(t => t.id === myTeamId);

  if (authLoading || isBaseDataLoading) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
            <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Initializing League Data...</p>
        </div>
      );
  }

  if (!session && !isGuestMode) {
      return (
          <>
            {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
            <AuthView onGuestLogin={() => setIsGuestMode(true)} />
          </>
      );
  }

  if ((session && !isGuestMode && (isSaveLoading || isSaveFetching)) || (!isGuestMode && saveData && view === 'TeamSelect')) {
      return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
              <p className="text-sm font-bold uppercase tracking-widest text-slate-500">
                  {saveData ? 'Loading Team Data...' : 'Checking Saved Game...'}
              </p>
          </div>
      );
  }

  if (view === 'TeamSelect') return <TeamSelectView teams={teams} isInitializing={isBaseDataLoading} onSelectTeam={handleSelectTeam} onReload={refetchBaseData} dataSource='DB' />;
  if (view === 'Onboarding' && myTeam) return <OnboardingView team={myTeam} onComplete={() => setView('Dashboard')} />;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden ko-normal pretendard">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">데이터 초기화 확인</h3>
                <p className="text-slate-400 text-sm font-medium mb-8 leading-relaxed">
                    현재 진행 중인 시즌 데이터가 모두 삭제되며, 이 작업은 되돌릴 수 없습니다.<br/>
                    정말 초기화하시겠습니까?
                </p>
                <div className="flex gap-3">
                    <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition-all">취소</button>
                    <button onClick={handleHardReset} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-red-900/20">초기화 실행</button>
                </div>
            </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        <aside className="w-72 border-r border-slate-800 bg-slate-900/60 flex flex-col shadow-2xl z-20">
            <div className="p-8 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <img src={myTeam?.logo} className="w-12 h-12 object-contain" alt="" />
                    <div>
                        <h2 className="font-black text-lg leading-tight uppercase oswald text-white">{myTeam?.name}</h2>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">{myTeam?.wins}W - {myTeam?.losses}L</span>
                    </div>
                </div>
            </div>
            
            <div className="px-8 py-5 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Clock className="text-indigo-400" size={16} />
                    <span className="text-sm font-bold text-white oswald">{currentSimDate}</span>
                </div>
                {saveGameMutation.isPending && !isGuestMode && <Cloud size={16} className="text-emerald-500 animate-pulse" />}
            </div>

            <nav className="flex-1 p-6 space-y-3 overflow-y-auto custom-scrollbar">
                <NavItem active={view === 'Dashboard'} icon={<LayoutDashboard size={20}/>} label="라커룸" onClick={() => setView('Dashboard')} />
                <NavItem active={view === 'Roster'} icon={<Users size={20}/>} label="로스터 & 기록" onClick={() => setView('Roster')} />
                <NavItem active={view === 'Standings'} icon={<Trophy size={20}/>} label="순위표" onClick={() => setView('Standings')} />
                <NavItem active={view === 'Leaderboard'} icon={<BarChart3 size={20}/>} label="리더보드" onClick={() => setView('Leaderboard')} />
                <NavItem active={view === 'Playoffs'} icon={<Swords size={20}/>} label="플레이오프" onClick={() => setView('Playoffs')} />
                <NavItem active={view === 'Schedule'} icon={<CalendarIcon size={20}/>} label="일정" onClick={() => setView('Schedule')} />
                <NavItem active={view === 'Transactions'} icon={<ArrowLeftRight size={20}/>} label="트레이드" onClick={() => setView('Transactions')} />
                <div className="h-px bg-slate-800 my-2 mx-4"></div>
                <NavItem active={view === 'OvrCalculator'} icon={<FlaskConical size={20}/>} label="OVR 실험실" onClick={() => setView('OvrCalculator')} />
            </nav>
            
            <div className="p-6 border-t border-slate-800 space-y-2">
                <button onClick={() => setShowResetConfirm(true)} className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-white rounded-xl flex items-center justify-center gap-2 transition-colors"><RefreshCw size={14} /> 데이터 초기화</button>
                <button onClick={handleLogout} className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-red-400 rounded-xl flex items-center justify-center gap-2 transition-colors"><LogOut size={14} /> {isGuestMode ? '홈으로' : '로그아웃'}</button>
            </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-slate-950/50 relative flex flex-col">
            <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center relative z-10 flex-shrink-0">
                <LiveScoreTicker games={schedule.filter(g => g.played && g.date === currentSimDate)} />
            </div>

            <div className="flex-1">
              <div className="p-8 lg:p-12">
              {view === 'Dashboard' && myTeam && <DashboardView team={myTeam} teams={teams} schedule={schedule} onSim={handleExecuteSim} tactics={userTactics || generateAutoTactics(myTeam)} onUpdateTactics={setUserTactics} currentSimDate={currentSimDate} isSimulating={isSimulating} onShowSeasonReview={() => setView('SeasonReview')} onShowPlayoffReview={() => setView('PlayoffReview')} hasPlayoffHistory={playoffSeries.length > 0} />}
              {view === 'Roster' && <RosterView allTeams={teams} myTeamId={myTeamId!} />}
              {view === 'Standings' && <StandingsView teams={teams} onTeamClick={id => console.log(id)} />}
              {view === 'Leaderboard' && <LeaderboardView teams={teams} />}
              {view === 'Playoffs' && <PlayoffsView teams={teams} schedule={schedule} series={playoffSeries} setSeries={setPlayoffSeries} setSchedule={setSchedule} myTeamId={myTeamId!} />}
              {view === 'Schedule' && <ScheduleView schedule={schedule} teamId={myTeamId!} teams={teams} onExport={() => {}} currentSimDate={currentSimDate} />}
              {view === 'Transactions' && myTeam && <TransactionsView team={myTeam} teams={teams} setTeams={setTeams} addNews={() => {}} onShowToast={setToastMessage} currentSimDate={currentSimDate} transactions={transactions} onAddTransaction={(t) => setTransactions(prev => [t, ...prev])} />}
              {view === 'SeasonReview' && myTeam && <SeasonReviewView team={myTeam} teams={teams} transactions={transactions} onBack={() => setView('SeasonReview')} />}
              {view === 'PlayoffReview' && myTeam && <PlayoffReviewView team={myTeam} teams={teams} playoffSeries={playoffSeries} schedule={schedule} onBack={() => setView('PlayoffReview')} />}
              {view === 'OvrCalculator' && <OvrCalculatorView teams={teams} />}
              {view === 'Help' && <HelpView onBack={() => setView('Dashboard')} />}
              {view === 'Draft' && myTeam && <DraftView prospects={prospects} onDraft={(p) => console.log('Draft', p)} team={myTeam} />}
              </div>
            </div>
            <Footer onNavigate={setView} />
        </main>

        {view === 'GameSim' && activeGame && <GameSimulatingView homeTeam={teams.find(t => t.id === activeGame.homeTeamId)!} awayTeam={teams.find(t => t.id === activeGame.awayTeamId)!} userTeamId={myTeamId} finalHomeScore={activeGame.homeScore} finalAwayScore={activeGame.awayScore} onSimulationComplete={() => finalizeSimRef.current?.()} />}
        {view === 'GameResult' && lastGameResult && <GameResultView result={lastGameResult} myTeamId={myTeamId!} teams={teams} onFinish={() => { setLastGameResult(null); setIsSimulating(false); setView('Dashboard'); }} />}
      </div>
    </div>
  );
};

export default App;
