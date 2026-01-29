
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './services/supabaseClient';
import { useBaseData, useLoadSave, useSaveGame, saveGameResults, saveUserTransaction } from './services/queries';
import { initGA, logPageView } from './services/analytics';
import { Team, Game, AppView, PlayerBoxScore, TeamTacticHistory, TacticStatRecord, TacticalSnapshot, Player, Transaction, PlayoffSeries } from './types';
import { generateSeasonSchedule, INITIAL_STATS, TRADE_DEADLINE } from './utils/constants';
import { generateAutoTactics, GameTactics, SimulationResult, simulateGame } from './services/gameEngine';
import { generateGameRecapNews, generateOwnerWelcome, generateCPUTradeNews } from './services/geminiService';
import { simulateCPUTrades } from './services/tradeEngine';

// Icons
import { Loader2, Clock, Save, Newspaper } from 'lucide-react';

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
import { Toast, ActionToast } from './components/SharedComponents';
import { Sidebar } from './components/Sidebar';
import { ResetDataModal } from './components/ResetDataModal';

const INITIAL_DATE = '2025-10-20';

const LOADING_MESSAGES = [
    "라커룸을 청소하는 중...",
    "농구공에 바람 넣는 중...",
    "림에 새 그물을 다는 중...",
    "전술 보드를 닦는 중...",
    "선수들 유니폼 다림질 중...",
    "스카우팅 리포트 인쇄 중...",
    "경기장 조명 예열 중...",
    "마스코트 춤 연습 시키는 중...",
    "치어리더 대형 맞추는 중...",
    "단장님 명패 닦는 중...",
    "FA 시장 동향 파악 중...",
    "드래프트 픽 순번 확인 중..."
];

const App: React.FC = () => {
  const queryClient = useQueryClient();
  
  // Auth State
  const [session, setSession] = useState<any | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // App Navigation
  const [view, setView] = useState<AppView>('TeamSelect');
  
  // Game Data State
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<Game[]>([]);
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
  const [loadingText, setLoadingText] = useState(LOADING_MESSAGES[0]);
  
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
  const { data: saveData, isLoading: isSaveLoading } = useLoadSave(session?.user?.id);

  // Initialize GA
  useEffect(() => {
    initGA();
  }, []);

  // Update GameData Ref for Save/Logout
  useEffect(() => {
    gameDataRef.current = {
        myTeamId, teams, schedule, currentSimDate, 
        tactics: userTactics, playoffSeries, transactions, prospects
    };
  }, [myTeamId, teams, schedule, currentSimDate, userTactics, playoffSeries, transactions, prospects]);

  // Auth Listener
  useEffect(() => {
    (supabase.auth as any).getSession().then(({ data: { session } }: any) => {
      if (session && !isLoggingOutRef.current) {
        setSession(session);
      } else if (!session) {
        setSession(null);
        hasInitialLoadRef.current = false;
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange((_event: any, session: any) => {
      if (isLoggingOutRef.current) return;
      if (session) setSession(session);
      else { 
        setSession(null); 
        hasInitialLoadRef.current = false; 
        setView('TeamSelect');
      }
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Loading Message Cycler
  useEffect(() => {
    const isDataLoading = isBaseDataLoading || (session && !hasInitialLoadRef.current);
    if (isDataLoading) {
        setLoadingText(LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);
        const interval = setInterval(() => {
            setLoadingText(prev => {
                let nextIndex;
                do {
                    nextIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
                } while (LOADING_MESSAGES[nextIndex] === prev && LOADING_MESSAGES.length > 1);
                return LOADING_MESSAGES[nextIndex];
            });
        }, 1000);
        return () => clearInterval(interval);
    }
  }, [isBaseDataLoading, session]);

  // Initialize Base Data
  useEffect(() => {
      if (baseData && teams.length === 0 && !myTeamId) {
          setTeams(baseData.teams);
          setSchedule(baseData.schedule);
      }
  }, [baseData, teams.length, myTeamId]);

  // Load Save Data & Decision Gate for View
  useEffect(() => {
      if (isLoggingOutRef.current || isResettingRef.current || isGuestMode) return;
      
      if (session?.user && !isSaveLoading && !hasInitialLoadRef.current) {
          if (saveData && saveData.game_data) {
              const gd = saveData.game_data;
              setMyTeamId(saveData.team_id);
              if (gd.teams) setTeams(gd.teams);
              if (gd.schedule) setSchedule(gd.schedule);
              if (gd.currentSimDate) setCurrentSimDate(gd.currentSimDate);
              if (gd.tactics) setUserTactics(gd.tactics);
              if (gd.playoffSeries) setPlayoffSeries(gd.playoffSeries);
              if (gd.transactions) setTransactions(gd.transactions);
              if (gd.prospects) setProspects(gd.prospects);
              if (saveData.team_id) { setView('Dashboard'); }
          }
          hasInitialLoadRef.current = true;
      }
  }, [saveData, isSaveLoading, session, isGuestMode]);

  // Logout Logic
  const handleLogout = async () => {
      isLoggingOutRef.current = true;
      if (session) { await (supabase.auth as any).signOut(); }
      setIsGuestMode(false);
      setSession(null);
      setMyTeamId(null);
      setView('TeamSelect');
      hasInitialLoadRef.current = false;
      setTimeout(() => { isLoggingOutRef.current = false; }, 500);
  };

  // Reset Data Logic with Fix for Infinite Loading
  const handleResetData = async () => {
    console.log("🛠️ [RESET] Starting Data Reset Process...");
    isResettingRef.current = true;
    
    try {
        if (session?.user) {
            const userId = session.user.id;
            console.log(`🛠️ [RESET] Deleting data for User ID: ${userId}`);

            // Parallel Deletion
            await Promise.all([
                supabase.from('saves').delete().eq('user_id', userId),
                supabase.from('user_game_results').delete().eq('user_id', userId),
                supabase.from('user_transactions').delete().eq('user_id', userId)
            ]);
            
            console.log("🛠️ [RESET] Clearing Query Cache & Storage...");
            localStorage.removeItem(`nba_gm_save_${userId}`);
            
            // Critical: Remove the cached save data so it doesn't get reloaded by the useEffect
            queryClient.removeQueries({ queryKey: ['fullGameState', userId] });
            queryClient.setQueryData(['fullGameState', userId], null);
        }

        console.log("🛠️ [RESET] Resetting Local React State...");
        setMyTeamId(null);
        setPlayoffSeries([]);
        setTransactions([]);
        setCurrentSimDate(INITIAL_DATE);
        setUserTactics(null);
        
        console.log("🛠️ [RESET] Refreshing Base Data...");
        if (baseData) { 
            console.log("🛠️ [RESET] Using existing baseData cache.");
            setTeams(baseData.teams); 
            setSchedule(baseData.schedule); 
        } else { 
            console.log("🛠️ [RESET] Fetching baseData from source...");
            await refetchBaseData(); 
        }
        
        console.log("🛠️ [RESET] Setting view to TeamSelect...");
        setView('TeamSelect');
        
        // Critical Fix: Set this to TRUE because we are done with the "Loading" phase of the reset
        // We are now in a clean state ready for Team Selection
        hasInitialLoadRef.current = true; 
        
        setToastMessage("구단 데이터가 완전히 초기화되었습니다.");
        console.log("✅ [RESET] Reset Process Completed Successfully.");

    } catch (e) {
        console.error("❌ [RESET] Critical Error during reset:", e);
        setToastMessage("초기화 중 오류가 발생했습니다.");
    } finally {
        setShowResetConfirm(false);
        isResettingRef.current = false;
        console.log("🛠️ [RESET] isResettingRef set to false.");
    }
  };

  // Auto Save Strategy [CTO Optimization]
  const triggerSave = useCallback(() => {
      if (isResettingRef.current || isLoggingOutRef.current || !session?.user || isGuestMode) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
          const currentData = gameDataRef.current;
          if (!currentData.myTeamId) return;
          saveGameMutation.mutate({ userId: session.user.id, teamId: currentData.myTeamId, gameData: currentData });
      }, 60000); 
  }, [session, isGuestMode, saveGameMutation]);

  useEffect(() => {
    if (myTeamId && session?.user && !isGuestMode) triggerSave();
  }, [teams, schedule, currentSimDate, userTactics, playoffSeries, transactions, prospects, myTeamId, session, isGuestMode, triggerSave]);

  const advanceDate = useCallback(() => {
      setCurrentSimDate(prevDate => {
          const teamsPlayedToday = schedule
              .filter(g => g.date === prevDate && g.played)
              .reduce((acc, g) => {
                  acc.add(g.homeTeamId);
                  acc.add(g.awayTeamId);
                  return acc;
              }, new Set<string>());

          const currentDateObj = new Date(prevDate);
          currentDateObj.setDate(currentDateObj.getDate() + 1);
          const nextDate = currentDateObj.toISOString().split('T')[0];
          
          setTeams(prevTeams => {
              // Check for CPU-CPU trades on advance date
              const isTradeSeason = new Date(nextDate) <= new Date(TRADE_DEADLINE);
              // 약 2%의 확률로 CPU 트레이드 발생
              if (isTradeSeason && Math.random() < 0.02) {
                  const tradeResult = simulateCPUTrades(prevTeams, myTeamId);
                  if (tradeResult) {
                      const { updatedTeams, transaction } = tradeResult;
                      if (transaction) {
                          setTransactions(prev => [transaction, ...prev]);
                          if (session?.user && !isGuestMode) {
                              saveUserTransaction(session.user.id, transaction);
                          }
                          generateCPUTradeNews(transaction).then(newsItems => {
                              if (newsItems) setNews(prev => [...newsItems, ...prev.slice(0, 5)]);
                          });
                          setToastMessage("리그 속보: CPU 구단 간 트레이드 성사!");
                      }
                      return updatedTeams.map(t => ({
                          ...t,
                          roster: t.roster.map(p => {
                              if (teamsPlayedToday.has(t.id)) return p;
                              const baseRec = 10; const staBonus = (p.stamina || 75) * 0.1; const durBonus = (p.durability || 75) * 0.05;
                              return { ...p, condition: Math.min(100, Math.round((p.condition || 100) + baseRec + staBonus + durBonus)) };
                          })
                      }));
                  }
              }

              return prevTeams.map(t => ({
                  ...t,
                  roster: t.roster.map(p => {
                      if (teamsPlayedToday.has(t.id)) return p;
                      const baseRec = 10; const staBonus = (p.stamina || 75) * 0.1; const durBonus = (p.durability || 75) * 0.05;
                      return { ...p, condition: Math.min(100, Math.round((p.condition || 100) + baseRec + staBonus + durBonus)) };
                  })
              }));
          });

          return nextDate;
      });
      setLastGameResult(null);
  }, [setTeams, schedule, myTeamId, session, isGuestMode]);

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
    const unplayedGamesToday = schedule.filter(g => g.date === targetSimDate && !g.played);
    
    const playedYesterday = (teamId: string) => {
        const yesterday = new Date(currentSimDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        return schedule.some(g => g.date === yesterdayStr && (g.homeTeamId === teamId || g.awayTeamId === teamId));
    };

    if (unplayedGamesToday.length === 0) {
        setIsSimulating(true);
        setTimeout(() => { advanceDate(); setIsSimulating(false); }, 2000);
        return;
    }

    const userGameToday = unplayedGamesToday.find(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId);
    
    const processSimulation = async (precalcUserResult?: SimulationResult) => {
        let updatedTeams = [...teams];
        let updatedSchedule = [...schedule];
        let updatedSeries = [...playoffSeries];
        let userGameResultOutput = null;
        let allPlayedToday: Game[] = [];
        const gameResultsToInsert: any[] = [];
        const getTeam = (id: string) => updatedTeams.find(t => t.id === id);

        for (const game of unplayedGamesToday) {
            const isUserGame = (game.homeTeamId === myTeamId || game.awayTeamId === myTeamId);
            const home = getTeam(game.homeTeamId); const away = getTeam(game.awayTeamId);
            if (!home || !away) continue;

            const result = (isUserGame && precalcUserResult) ? precalcUserResult : simulateGame(home, away, myTeamId, isUserGame ? tactics : undefined, playedYesterday(home.id), playedYesterday(away.id));
            const homeIdx = updatedTeams.findIndex(t => t.id === home.id); const awayIdx = updatedTeams.findIndex(t => t.id === away.id);
            const homeWin = result.homeScore > result.awayScore;

            const updateHistory = (t: Team, myBox: PlayerBoxScore[], oppBox: PlayerBoxScore[], tactics: TacticalSnapshot, isWin: boolean) => {
                const history = { ...(t.tacticHistory || { offense: {}, defense: {} }) };
                const updateRecord = (record: Record<string, TacticStatRecord>, key: string) => {
                    if (!record[key]) record[key] = { games: 0, wins: 0, ptsFor: 0, ptsAgainst: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, aceImpact: 0 };
                    const r = record[key];
                    const totals = myBox.reduce((acc, p) => ({ pts: acc.pts + p.pts, fgm: acc.fgm + p.fgm, fga: acc.fga + p.fga, p3m: acc.p3m + p.p3m, p3a: acc.p3a + p.p3a, rimM: acc.rimM + (p.rimM || 0), rimA: acc.rimA + (p.rimA || 0), midM: acc.midM + (p.midM || 0), midA: acc.midA + (p.midA || 0) }), { pts: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 });
                    r.games++; if (isWin) r.wins++;
                    r.ptsFor += totals.pts; r.ptsAgainst += oppBox.reduce((sum, p) => sum + p.pts, 0);
                    r.fgm += totals.fgm; r.fga += totals.fga; r.p3m += totals.p3m; r.p3a += totals.p3a; r.rimM += totals.rimM; r.rimA += totals.rimA; r.midM += totals.midM; r.midA += totals.midA;
                };
                updateRecord(history.offense, tactics.offense); updateRecord(history.defense, tactics.defense);
                if (tactics.stopperId) {
                    if (!history.defense['AceStopper']) history.defense['AceStopper'] = { games: 0, wins: 0, ptsFor: 0, ptsAgainst: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, aceImpact: 0 };
                    const r = history.defense['AceStopper']; const targetAceBox = oppBox.find(b => b.isAceTarget);
                    if (targetAceBox) { r.games++; if (isWin) r.wins++; r.ptsAgainst += targetAceBox.pts; r.fgm += targetAceBox.fgm; r.fga += targetAceBox.fga; r.p3m += targetAceBox.p3m; r.p3a += targetAceBox.p3a; r.aceImpact = (r.aceImpact || 0) + (targetAceBox.matchupEffect || 0); }
                }
                return history;
            };

            updatedTeams[homeIdx] = { ...home, wins: home.wins + (homeWin ? 1 : 0), losses: home.losses + (homeWin ? 0 : 1), tacticHistory: updateHistory(home, result.homeBox, result.awayBox, result.homeTactics, homeWin) };
            updatedTeams[awayIdx] = { ...away, wins: away.wins + (homeWin ? 0 : 1), losses: away.losses + (homeWin ? 1 : 0), tacticHistory: updateHistory(away, result.awayBox, result.homeBox, result.awayTactics, !homeWin) };

            const updateRosterStats = (teamIdx: number, boxScore: PlayerBoxScore[], rosterUpdates: any) => {
                const t = updatedTeams[teamIdx];
                t.roster = t.roster.map(p => {
                    const update = rosterUpdates[p.id]; const box = boxScore.find(b => b.playerId === p.id);
                    let targetStats = game.isPlayoff ? (p.playoffStats || INITIAL_STATS()) : p.stats;
                    if (box) { 
                        targetStats.g += 1; targetStats.gs += box.gs; targetStats.mp += box.mp; targetStats.pts += box.pts; targetStats.reb += box.reb; targetStats.ast += box.ast; targetStats.stl += box.stl; targetStats.blk += box.blk; targetStats.tov += box.tov; targetStats.fgm += box.fgm; targetStats.fga += box.fga; targetStats.p3m += box.p3m; targetStats.p3a += box.p3a; targetStats.ftm += box.ftm; targetStats.fta += box.fta; 
                        targetStats.rimM = (targetStats.rimM || 0) + (box.rimM || 0); targetStats.rimA = (targetStats.rimA || 0) + (box.rimA || 0); targetStats.midM = (targetStats.midM || 0) + (box.midM || 0); targetStats.midA = (targetStats.midA || 0) + (box.midA || 0);
                    }
                    const returnObj = { ...p, condition: update?.condition !== undefined ? Math.round(update.condition) : p.condition, health: update?.health ?? p.health, injuryType: update?.injuryType ?? p.injuryType, returnDate: update?.returnDate ?? p.returnDate };
                    if (game.isPlayoff) returnObj.playoffStats = targetStats; else returnObj.stats = targetStats;
                    return returnObj;
                });
            };
            updateRosterStats(homeIdx, result.homeBox, result.rosterUpdates); updateRosterStats(awayIdx, result.awayBox, result.rosterUpdates);

            const updatedGame: Game = { ...game, played: true, homeScore: result.homeScore, awayScore: result.awayScore, tactics: { home: result.homeTactics, away: result.awayTactics } };
            const schIdx = updatedSchedule.findIndex(g => g.id === game.id); if (schIdx !== -1) updatedSchedule[schIdx] = updatedGame;
            
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
            if (session?.user && !isGuestMode) {
                gameResultsToInsert.push({ user_id: session.user.id, game_id: game.id, date: game.date, home_team_id: game.homeTeamId, away_team_id: game.awayTeamId, home_score: result.homeScore, away_score: result.awayScore, box_score: { home: result.homeBox, away: result.awayBox } });
            }
            allPlayedToday.push(updatedGame);
            if (isUserGame) userGameResultOutput = { ...result, home: updatedTeams[homeIdx], away: updatedTeams[awayIdx], userTactics: tactics, myTeamId }; 
        }

        if (gameResultsToInsert.length > 0) { saveGameResults(gameResultsToInsert); }
        setTeams(updatedTeams); setSchedule(updatedSchedule); setPlayoffSeries(updatedSeries); 
        
        if (userGameResultOutput) {
            const recap = await generateGameRecapNews(userGameResultOutput);
            setLastGameResult({ ...userGameResultOutput, recap: recap || [], otherGames: allPlayedToday.filter(g => g.homeTeamId !== myTeamId && g.awayTeamId !== myTeamId) });
            setView('GameResult');
        } else { setIsSimulating(false); advanceDate(); }
    };
    
    if (userGameToday) {
        const home = updatedTeamsRef.current.find(t => t.id === userGameToday.homeTeamId)!; const away = updatedTeamsRef.current.find(t => t.id === userGameToday.awayTeamId)!;
        const precalculatedUserResult = simulateGame(home, away, myTeamId, tactics, playedYesterday(home.id), playedYesterday(away.id));
        setActiveGame({ ...userGameToday, homeScore: precalculatedUserResult.homeScore, awayScore: precalculatedUserResult.awayScore }); setView('GameSim');
        finalizeSimRef.current = () => processSimulation(precalculatedUserResult);
    } else { setIsSimulating(true); setTimeout(() => processSimulation(), 2000); }
  };

  const updatedTeamsRef = useRef(teams);
  useEffect(() => { updatedTeamsRef.current = teams; }, [teams]);

  const tickerGames = useMemo(() => {
    const todayGames = schedule.filter(g => g.date === currentSimDate && g.played);
    if (todayGames.length > 0) return todayGames;
    for (let i = schedule.length - 1; i >= 0; i--) {
        const game = schedule[i]; if (game.played && game.date < currentSimDate) { return schedule.filter(g => g.date === game.date && g.played); }
    }
    return [];
  }, [schedule, currentSimDate]);

  if (authLoading) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-2">Initializing...</p>
        </div>
      );
  }

  if (!session && !isGuestMode) return <AuthView onGuestLogin={() => setIsGuestMode(true)} />;

  const isDataLoading = isBaseDataLoading || (session && !hasInitialLoadRef.current);
  if (isDataLoading) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
            <p className="text-xl font-black uppercase tracking-tight text-white oswald animate-pulse">{loadingText}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-2">Connecting to NBA Front Office...</p>
        </div>
      );
  }
  
  if (view === 'TeamSelect') return <TeamSelectView teams={teams} isInitializing={isBaseDataLoading} onSelectTeam={handleSelectTeam} dataSource='DB' />;
  if (view === 'Onboarding' && myTeamId) return <OnboardingView team={teams.find(t => t.id === myTeamId)!} onComplete={() => setView('Dashboard')} />;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden ko-normal pretendard">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      {saveGameMutation.isPending && (
          <div className="fixed bottom-4 right-4 z-[999] bg-slate-900/80 border border-slate-700 px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold text-slate-400 animate-pulse">
              <Save size={12} /> Saving...
          </div>
      )}
      
      <ResetDataModal 
        isOpen={showResetConfirm} 
        isLoading={isResettingRef.current} 
        onClose={() => setShowResetConfirm(false)} 
        onConfirm={handleResetData} 
      />

      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar 
          team={teams.find(t => t.id === myTeamId)}
          currentSimDate={currentSimDate}
          currentView={view}
          isGuestMode={isGuestMode}
          onNavigate={setView}
          onResetClick={() => setShowResetConfirm(true)}
          onLogout={handleLogout}
        />

        <main className="flex-1 overflow-y-auto bg-slate-950/50 relative flex flex-col">
            <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center relative z-10 flex-shrink-0">
                <LiveScoreTicker games={tickerGames} />
            </div>

            {/* News Ticker Overlay */}
            {news && news.length > 0 && (
                <div className="bg-indigo-950/40 border-b border-indigo-500/20 px-8 py-2.5 flex items-center gap-4 overflow-hidden relative group">
                    <div className="flex-shrink-0 flex items-center gap-2 text-indigo-400 font-black text-[10px] uppercase tracking-[0.2em] oswald">
                        <Newspaper size={14} className="animate-pulse" />
                        <span>NBA Ticker</span>
                    </div>
                    <div className="flex-1 overflow-hidden relative h-5">
                        <div className="absolute inset-0 flex items-center animate-marquee whitespace-nowrap gap-12">
                            {[...news, ...news].map((item, i) => (
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
              {view === 'Dashboard' && myTeamId && <DashboardView team={teams.find(t => t.id === myTeamId)!} teams={teams} schedule={schedule} onSim={handleExecuteSim} tactics={userTactics || generateAutoTactics(teams.find(t => t.id === myTeamId)!)} onUpdateTactics={setUserTactics} currentSimDate={currentSimDate} isSimulating={isSimulating} onShowSeasonReview={() => setView('SeasonReview')} onShowPlayoffReview={() => setView('PlayoffReview')} hasPlayoffHistory={playoffSeries.length > 0} playoffSeries={playoffSeries} />}
              {view === 'Roster' && <RosterView allTeams={teams} myTeamId={myTeamId!} />}
              {view === 'Standings' && <StandingsView teams={teams} onTeamClick={id => console.log(id)} />}
              {view === 'Leaderboard' && <LeaderboardView teams={teams} />}
              {view === 'Playoffs' && <PlayoffsView teams={teams} schedule={schedule} series={playoffSeries} setSeries={setPlayoffSeries} setSchedule={setSchedule} myTeamId={myTeamId!} />}
              {view === 'Schedule' && <ScheduleView schedule={schedule} teamId={myTeamId!} teams={teams} onExport={() => {}} currentSimDate={currentSimDate} />}
              {view === 'Transactions' && myTeamId && <TransactionsView team={teams.find(t => t.id === myTeamId)!} teams={teams} setTeams={setTeams} addNews={() => {}} onShowToast={setToastMessage} currentSimDate={currentSimDate} transactions={transactions} onAddTransaction={(t) => setTransactions(prev => [t, ...prev])} />}
              {view === 'Help' && <HelpView onBack={() => setView('Dashboard')} />}
              {view === 'OvrCalculator' && <OvrCalculatorView teams={teams} />}
              {view === 'SeasonReview' && myTeamId && <SeasonReviewView team={teams.find(t => t.id === myTeamId)!} teams={teams} transactions={transactions} onBack={() => setView('Dashboard')} />}
              {view === 'PlayoffReview' && myTeamId && <PlayoffReviewView team={teams.find(t => t.id === myTeamId)!} teams={teams} playoffSeries={playoffSeries} schedule={schedule} onBack={() => setView('Dashboard')} />}
              {view === 'Draft' && <DraftView prospects={prospects} onDraft={(p) => console.log('Draft', p)} team={teams.find(t => t.id === myTeamId)!} />}
            </div>
            <Footer onNavigate={setView} />
        </main>

        {view === 'GameSim' && activeGame && <GameSimulatingView homeTeam={teams.find(t => t.id === activeGame.homeTeamId)!} awayTeam={teams.find(t => t.id === activeGame.awayTeamId)!} userTeamId={myTeamId} finalHomeScore={activeGame.homeScore} finalAwayScore={activeGame.awayScore} onSimulationComplete={() => finalizeSimRef.current?.()} />}
        {view === 'GameResult' && lastGameResult && <GameResultView result={lastGameResult} myTeamId={myTeamId!} teams={teams} onFinish={() => { setIsSimulating(false); setView('Dashboard'); }} />}
      </div>
    </div>
  );
};

export default App;
