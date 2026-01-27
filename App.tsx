
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Trophy, Users, Calendar as CalendarIcon, ArrowLeftRight, LayoutDashboard, 
  RefreshCw, Clock, Swords, AlertTriangle, LogOut, Cloud, Loader2, Copy, Check, X, BarChart3,
  MonitorX, Lock, GraduationCap, FlaskConical, WifiOff
} from 'lucide-react';
import { AppView, Team, Game, Player, PlayerBoxScore, PlayoffSeries, Transaction, TacticalSnapshot, TeamTacticHistory, TacticStatRecord } from './types';
import { 
  INITIAL_TEAMS_DATA, getTeamLogoUrl, 
  generateSeasonSchedule, exportScheduleToCSV,
  SEASON_START_DATE, INITIAL_STATS, calculatePlayerOvr
} from './utils/constants';
import { simulateGame, GameTactics, RosterUpdate, SimulationResult } from './services/gameEngine';
import { generateNewsTicker, generateOwnerWelcome, generateGameRecapNews } from './services/geminiService';
import { initGA, logPageView, logEvent, logError } from './services/analytics'; 
import { NavItem, Toast, ActionToast } from './components/SharedComponents';
import { TeamSelectView } from './views/TeamSelectView';
import { DashboardView } from './views/DashboardView';
import { RosterView } from './views/RosterView';
import { StandingsView } from './views/StandingsView';
import { ScheduleView } from './views/ScheduleView';
import { TransactionsView } from './views/TransactionsView';
import { DraftView } from './views/DraftView';
import { PlayoffsView } from './views/PlayoffsView';
import { GameSimulatingView } from './views/GameSimulationView';
import { GameResultView } from './views/GameResultView';
import { OnboardingView } from './views/OnboardingView';
import { LeaderboardView } from './views/LeaderboardView';
import { SeasonReviewView } from './views/SeasonReviewView'; 
import { PlayoffReviewView } from './views/PlayoffReviewView'; 
import { OvrCalculatorView } from './views/OvrCalculatorView';
import { HelpView } from './views/HelpView';
import { LiveScoreTicker } from './components/LiveScoreTicker';
import { Footer } from './components/Footer';
import { supabase } from './services/supabaseClient';
import { AuthView } from './views/AuthView';
import { useQueryClient } from '@tanstack/react-query';

// TanStack Query Hooks
import { useBaseData, useLoadSave, useSaveGame, useSessionHeartbeat } from './services/queries';

const DEFAULT_TACTICS: GameTactics = {
  offenseTactics: ['Balance'],
  defenseTactics: ['ManToManPerimeter'],
  sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 5, zoneUsage: 5, rotationFlexibility: 5 },
  starters: { PG: '', SG: '', SF: '', PF: '', C: '' },
  minutesLimits: {},
  stopperId: undefined
};

type NewsItem = 
  | { type: 'text'; content: string }
  | { type: 'game'; home: Team; away: Team; homeScore: number; awayScore: number };

const App: React.FC = () => {
  const queryClient = useQueryClient();

  // Auth State
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isGuestMode, setIsGuestMode] = useState(false);
  
  // App State
  const [view, setView] = useState<AppView>('TeamSelect');
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<Game[]>([]);
  const [boxScores, setBoxScores] = useState<Record<string, { home: PlayerBoxScore[], away: PlayerBoxScore[] }>>({});
  const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);
  const [userTactics, setUserTactics] = useState<GameTactics>(DEFAULT_TACTICS);
  const [transactions, setTransactions] = useState<Transaction[]>([]); 
  const [prospects, setProspects] = useState<Player[]>([]);
  const [news, setNews] = useState<NewsItem[]>([{ type: 'text', content: "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료." }]);
  const [currentSimDate, setCurrentSimDate] = useState<string>(SEASON_START_DATE);

  // UI State
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [lastGameResult, setLastGameResult] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false); // Version Check State
  const [rosterTargetId, setRosterTargetId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Session & Device - [FIX] Persistent Device ID (LocalStorage 사용)
  // 새로고침 시마다 ID가 바뀌는 문제를 방지합니다.
  const [deviceId] = useState(() => {
      const stored = localStorage.getItem('nba_gm_device_id');
      if (stored) return stored;
      const newId = self.crypto.randomUUID();
      localStorage.setItem('nba_gm_device_id', newId);
      return newId;
  });
  const [isDuplicateSession, setIsDuplicateSession] = useState(false);

  // Refs for logic control
  const finalizeSimRef = useRef<((userResult?: any) => void) | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isResettingRef = useRef(false); // [CRITICAL] Reset Safety Lock
  const isRecoveringRef = useRef(false); // [CRITICAL] Reconnect Loop Preventer

  // --- TanStack Query Integration ---

  // 1. Base Data Loading
  const { data: baseData, isLoading: isBaseDataLoading, refetch: refetchBaseData } = useBaseData();

  // 2. Save Data Loading (Only when user is logged in)
  const { data: saveData, isLoading: isSaveLoading } = useLoadSave(session?.user?.id);

  // 3. Save Game Mutation
  const saveGameMutation = useSaveGame();

  // 4. Session Heartbeat (Polling)
  // [DEBUG] 중복 로그인 감지 기능 비활성화 (enabled: false)
  const { data: isSessionValid } = useSessionHeartbeat(
      session?.user?.id, 
      deviceId, 
      false // !isDuplicateSession && !isGuestMode -> 강제 비활성화
  );

  // [DEBUG] Keep-Alive 로직 비활성화
  useEffect(() => {
      /*
      if (!session?.user || isGuestMode) return;

      const claimSession = async () => {
          try {
              await supabase.from('profiles').update({ 
                  active_device_id: deviceId, 
                  last_seen_at: new Date().toISOString() 
              }).eq('id', session.user.id);
          } catch (e) {
              // Keep-alive 실패는 조용히 넘어감
          }
      };

      // 초기 실행
      claimSession();

      // 주기적 실행
      const interval = setInterval(claimSession, 2 * 60 * 1000);
      return () => clearInterval(interval);
      */
  }, [session, deviceId, isGuestMode]);

  // Game Data Ref for Silent Saves & Version Check Saves
  const gameDataRef = useRef({ teams, schedule, boxScores, currentSimDate, userTactics, playoffSeries, transactions, prospects, myTeamId });
  
  const triggerSave = useCallback(() => {
        // [SAFETY LOCK] Reset 진행 중이면 저장 금지 (좀비 데이터 방지)
        if (isResettingRef.current) return;

        if (!session?.user || isDuplicateSession || isGuestMode) return;
        
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            // [SAFETY LOCK] 타임아웃 실행 시점에도 Reset 중인지 다시 확인
            if (isResettingRef.current) return;

            const currentData = gameDataRef.current;
            if (!currentData.myTeamId) return;
            
            console.log("Auto-save triggered...");
            saveGameMutation.mutate({
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
        }, 5000); 
  }, [session, isDuplicateSession, isGuestMode, saveGameMutation]);

  useEffect(() => {
      gameDataRef.current = { teams, schedule, boxScores, currentSimDate, userTactics, playoffSeries, transactions, prospects, myTeamId };
      if (myTeamId && session?.user && !isGuestMode) {
          triggerSave();
      }
  }, [teams, schedule, boxScores, currentSimDate, userTactics, playoffSeries, transactions, prospects, myTeamId, session, isGuestMode, triggerSave]);

  // --- Session Validation Effect ---
  // [DEBUG] 중복 로그인 상태 변경 로직 비활성화
  useEffect(() => {
      /*
      if (isRecoveringRef.current || isGuestMode) return;

      // 명시적으로 false가 반환된 경우에만 중복 로그인 처리
      if (isSessionValid === false) {
          setIsDuplicateSession(true);
      } else if (isSessionValid === true) {
          // 유효하다면 상태 복구 (네트워크 일시 오류 후 복구 등)
          setIsDuplicateSession(false);
      }
      */
  }, [isSessionValid, isGuestMode]);

  // --- Version Check Logic (Optimized) ---
  const currentVersion = useRef<string | null>(null);
  useEffect(() => {
    const checkVersion = async () => {
        if (document.hidden) return;
        try {
            const res = await fetch(`/version.json?t=${Date.now()}`);
            if (!res.ok) return;
            const data = await res.json();
            if (!currentVersion.current) {
                currentVersion.current = data.version;
            } else if (currentVersion.current !== data.version) {
                setUpdateAvailable(true);
            }
        } catch (e) {}
    };
    checkVersion(); 
    const interval = setInterval(checkVersion, 15 * 60 * 1000); 
    return () => clearInterval(interval);
  }, []);

  const handleUpdateAndReload = async () => {
    if (session?.user && !isGuestMode && gameDataRef.current.myTeamId) {
        setToastMessage("데이터 저장 후 업데이트합니다...");
        const currentData = gameDataRef.current;
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
        } catch (e) {
            console.error("Save before update failed", e);
        }
    }
    window.location.reload();
  };

  useEffect(() => { initGA(); }, []);
  useEffect(() => { logPageView(view); }, [view]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
      if (baseData && teams.length === 0 && !myTeamId) {
          setTeams(baseData.teams);
          setProspects(generateInitialProspects());
      }
  }, [baseData, teams.length, myTeamId]);

  useEffect(() => {
      if (saveData && saveData.game_data) {
          const gd = saveData.game_data;
          setMyTeamId(saveData.team_id);
          setTeams(gd.teams || []);
          setSchedule(gd.schedule || []);
          setBoxScores(gd.boxScores || {});
          setCurrentSimDate(gd.currentSimDate || SEASON_START_DATE);
          setUserTactics(gd.tactics || DEFAULT_TACTICS);
          setPlayoffSeries(gd.playoffSeries || []);
          setTransactions(gd.transactions || []);
          setProspects(gd.prospects || []);
          setRosterTargetId(saveData.team_id);
          setView('Dashboard');
          setToastMessage("사용자 정보 불러오기 성공");
      }
  }, [saveData]);

  const generateInitialProspects = useCallback(() => {
    const firstNames = ["James", "Marcus", "Dylan", "Xavier", "Andre", "Caleb", "Elias", "Jaxon", "Kobe", "Zaire", "이", "김", "박", "최", "정"];
    const lastNames = ["Williams", "Jackson", "Smith", "Johnson", "Davis", "Brown", "준", "현", "호", "민", "태"];
    const positions: Array<'PG' | 'SG' | 'SF' | 'PF' | 'C'> = ['PG', 'SG', 'SF', 'PF', 'C'];
    return Array.from({ length: 30 }, (_, i) => {
        const pos = positions[Math.floor(Math.random() * positions.length)];
        const baseOvr = 68 + Math.floor(Math.random() * 8);
        const pot = 82 + Math.floor(Math.random() * 15);
        const mockPlayer: any = {
            id: `prospect_${i}_${Date.now()}`,
            name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
            position: pos, age: 19, height: 190 + Math.floor(Math.random() * 30), weight: 85 + Math.floor(Math.random() * 30),
            salary: 4.5, contractYears: 4, health: 'Healthy' as const, potential: pot, revealedPotential: pot,
            intangibles: 70, condition: 100,
            speed: baseOvr, agility: baseOvr, strength: baseOvr, vertical: baseOvr, stamina: baseOvr, hustle: baseOvr, durability: baseOvr,
            closeShot: baseOvr, midRange: baseOvr, threeCorner: baseOvr, three45: baseOvr, threeTop: baseOvr, ft: baseOvr, shotIq: baseOvr, offConsist: baseOvr,
            layup: baseOvr, dunk: baseOvr, postPlay: baseOvr, drawFoul: baseOvr, hands: baseOvr,
            passAcc: baseOvr, handling: baseOvr, spdBall: baseOvr, passIq: baseOvr, passVision: baseOvr,
            intDef: baseOvr, perDef: baseOvr, steal: baseOvr, blk: baseOvr, helpDefIq: baseOvr, passPerc: baseOvr, defConsist: baseOvr,
            offReb: baseOvr, defReb: baseOvr,
            stats: INITIAL_STATS(), playoffStats: INITIAL_STATS()
        };
        mockPlayer.ovr = calculatePlayerOvr(mockPlayer);
        return mockPlayer as Player;
    });
  }, []);

  // [FIX] Force Login Logic Reinvented - Optimistic Update
  const handleForceLogin = async () => {
      if (!session?.user || isGuestMode) return;
      
      // 1. Lock: 복구 중에는 상태 체크를 잠시 멈춥니다.
      isRecoveringRef.current = true;
      setAuthLoading(true);

      try {
          // 2. DB Update: 내가 활성 기기라고 선언
          await supabase.from('profiles').update({ 
              active_device_id: deviceId, 
              last_seen_at: new Date().toISOString() 
          }).eq('id', session.user.id);

          // 3. Optimistic Cache Update: 쿼리를 다시 부르지 않고 캐시를 강제 주입
          queryClient.setQueryData(['heartbeat', session.user.id, deviceId], true);

          // 4. UI Update
          setIsDuplicateSession(false);
          setToastMessage("성공적으로 재접속되었습니다.");

          // 5. Unlock after delay: DB 전파 시간을 고려해 안전장치 해제
          setTimeout(() => {
              isRecoveringRef.current = false;
          }, 3000);

      } catch (e) {
          console.error("Force Login Error:", e);
          alert("재접속 중 오류가 발생했습니다.");
          isRecoveringRef.current = false; 
      } finally {
          setAuthLoading(false);
      }
  };

  const handleTeamSelection = useCallback(async (teamId: string) => {
    if (myTeamId) { setRosterTargetId(teamId); return; } 
    setMyTeamId(teamId);
    setRosterTargetId(teamId);
    if (baseData?.schedule && baseData.schedule.length > 0) {
        setSchedule(baseData.schedule);
    } else {
        setSchedule(generateSeasonSchedule(teamId));
    }
    setCurrentSimDate(SEASON_START_DATE);
    const teamData = INITIAL_TEAMS_DATA.find(t => t.id === teamId);
    if (teamData) {
      const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
      setNews([{ type: 'text', content: welcome }, { type: 'text', content: "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료." }]);
    }
    setView('Onboarding'); 
  }, [baseData, myTeamId]);

  const handleOnboardingComplete = async () => {
      if (session?.user && !isGuestMode) {
          try {
              const metaName = session.user.user_metadata?.nickname;
              const emailName = session.user.email?.split('@')[0] || 'User';
              
              // DB 초기화 및 Device ID 점유
              await supabase.from('profiles').upsert({
                  id: session.user.id,
                  email: session.user.email,
                  nickname: metaName || emailName,
                  active_device_id: deviceId, 
                  last_seen_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
              }, { onConflict: 'id' });
              
              // 캐시 초기화
              queryClient.setQueryData(['heartbeat', session.user.id, deviceId], true);
              
              triggerSave();
          } catch(e) {
              console.error("Initialization Save Error:", e);
          }
      }
      setView('Dashboard');
  };

  // [SAFETY] Safe Hard Reset with Locking
  const handleHardReset = async () => {
    if (session?.user && !isGuestMode) {
        // 1. LOCK & KILL
        isResettingRef.current = true; // Lock Save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }

        setAuthLoading(true);
        try { 
            // 2. NUKE QUERIES
            await queryClient.cancelQueries(); // Stop all background fetches
            
            // 3. DELETE FROM DB (Await ensures completion)
            await supabase.from('saves').delete().eq('user_id', session.user.id);

            // 4. CLEAN CACHE
            queryClient.removeQueries({ queryKey: ['saveData', session.user.id] });

            // 5. SESSION UPDATE (Prevents duplicate login error)
            await supabase.from('profiles').update({
                active_device_id: deviceId,
                last_seen_at: new Date().toISOString()
            }).eq('id', session.user.id);
            
            console.log("Safe Reset: Data wiped successfully.");
        } catch(e) {
            console.error("Reset Error:", e);
            alert("초기화 중 오류가 발생했습니다. 페이지를 새로고침해주세요.");
        }
    }
    
    // 6. RESET LOCAL STATE (Atomic)
    setMyTeamId(null); setSchedule([]); setBoxScores({}); setPlayoffSeries([]); setTransactions([]);
    setProspects(generateInitialProspects());
    setNews([{ type: 'text', content: "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료." }]);
    setCurrentSimDate(SEASON_START_DATE);
    setLastGameResult(null); setActiveGame(null);
    
    // 7. RESTORE BASE
    if (baseData) {
        setTeams(baseData.teams);
        if(baseData.schedule) setSchedule(baseData.schedule);
    }
    
    setIsDuplicateSession(false);
    setShowResetConfirm(false); 
    if (session?.user && !isGuestMode) setAuthLoading(false);
    setView('TeamSelect');

    // 8. UNLOCK (Delayed to ensure UI settles)
    setTimeout(() => {
        isResettingRef.current = false;
    }, 1000);
  };

  const handleLogout = async () => {
    // 1. Clear any pending auto-saves immediately
    if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
    }

    // 2. Perform Final Save
    if (session?.user && !isGuestMode && myTeamId) {
        setToastMessage("데이터 안전 저장 중... 잠시만 기다려주세요.");
        const currentData = gameDataRef.current;
        
        // Critical: Ensure we have data to save
        if (!currentData.myTeamId) {
            console.error("Logout Error: No Team ID found for save.");
        } else {
            try {
                // await here is crucial - we must wait for the network response
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
                alert("데이터 저장에 실패했습니다. 인터넷 연결을 확인해주세요.");
            }
        }
    }

    // 3. Clear Session & State
    if (session?.user) { 
        try { await supabase.from('profiles').update({ active_device_id: null, last_seen_at: null }).eq('id', session.user.id); } catch(e){}
        await supabase.auth.signOut();
    }
    setSession(null); setMyTeamId(null); setSchedule([]); setBoxScores({}); setPlayoffSeries([]); setTransactions([]); setProspects([]);
    setView('TeamSelect'); setIsDuplicateSession(false); setIsGuestMode(false);
  };

  const handleDraftPlayer = useCallback((player: Player) => {
    if (!myTeamId) return;
    setTeams(prev => prev.map(t => t.id === myTeamId ? { ...t, roster: [...t.roster, player] } : t));
    setProspects(prev => prev.filter(p => p.id !== player.id));
    const draftTransaction: Transaction = {
      id: `tr_draft_${Date.now()}`, date: currentSimDate, type: 'Draft', teamId: myTeamId, description: `${player.name} (${player.position}) 드래프트 지명`, details: { acquired: [{ id: player.id, name: player.name, ovr: player.ovr, position: player.position }], traded: [] }
    };
    setTransactions(prev => [draftTransaction, ...prev]);
    setToastMessage(`${player.name} 선수를 성공적으로 지명했습니다.`);
    triggerSave(); 
    setView('Dashboard');
  }, [myTeamId, currentSimDate, triggerSave]);

  const handleAddTransaction = useCallback((t: Transaction) => {
      setTransactions(prev => [t, ...prev]);
      triggerSave();
  }, [triggerSave]);

  const handleExecuteSim = async (tactics: GameTactics) => {
    const myTeam = teams.find(t => t.id === myTeamId);
    if (!myTeamId || !myTeam) return;
    const targetSimDate = currentSimDate;
    const gamesToday = schedule.filter(g => g.date === targetSimDate && !g.played);
    const userGameToday = gamesToday.find(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId);
    
    const processSimulation = async (precalcUserResult?: SimulationResult) => {
        let teamsWithDailyRecovery = teams.map(t => ({
            ...t,
            roster: t.roster.map(p => {
                const currentCond = p.condition ?? 100;
                const recovery = 16 + (p.stamina * 0.18); 
                return { ...p, condition: Math.min(100, Math.floor(currentCond + recovery)) };
            })
        }));

        let updatedTeams = [...teamsWithDailyRecovery];
        let updatedSchedule = [...schedule];
        let updatedBoxScores = { ...boxScores };
        let updatedSeries = [...playoffSeries];
        let updatedNews = [...news];
        let userGameResultOutput = null;
        let allPlayedToday: Game[] = [];
        
        const getTeam = (id: string) => updatedTeams.find(t => t.id === id);
        for (const game of gamesToday) {
            const isUserGame = (game.homeTeamId === myTeamId || game.awayTeamId === myTeamId);
            const home = getTeam(game.homeTeamId);
            const away = getTeam(game.awayTeamId);
            if (!home || !away) continue;
            const result = (isUserGame && precalcUserResult) ? precalcUserResult : simulateGame(home, away, myTeamId, isUserGame ? tactics : undefined);
            const homeIdx = updatedTeams.findIndex(t => t.id === home.id);
            const awayIdx = updatedTeams.findIndex(t => t.id === away.id);
            updatedTeams[homeIdx] = { ...home, wins: home.wins + (result.homeScore > result.awayScore ? 1 : 0), losses: home.losses + (result.homeScore < result.awayScore ? 1 : 0) };
            updatedTeams[awayIdx] = { ...away, wins: away.wins + (result.awayScore > result.homeScore ? 1 : 0), losses: away.losses + (result.awayScore < result.homeScore ? 1 : 0) };
             const updateRosterStats = (teamIdx: number, boxScore: PlayerBoxScore[], rosterUpdates: RosterUpdate) => {
                const t = updatedTeams[teamIdx];
                t.roster = t.roster.map(p => {
                    const update = rosterUpdates[p.id];
                    const box = boxScore.find(b => b.playerId === p.id);
                    const isPlayoffGame = game.isPlayoff;
                    let targetStats = isPlayoffGame ? (p.playoffStats || INITIAL_STATS()) : p.stats;
                    if (box) {
                        targetStats.g += 1; targetStats.gs += box.gs; targetStats.mp += box.mp; targetStats.pts += box.pts; targetStats.reb += box.reb;
                        targetStats.ast += box.ast; targetStats.stl += box.stl; targetStats.blk += box.blk; targetStats.tov += box.tov;
                        targetStats.fgm += box.fgm; targetStats.fga += box.fga; targetStats.p3m += box.p3m; targetStats.p3a += box.p3a;
                        targetStats.ftm += box.ftm; targetStats.fta += box.fta;
                        targetStats.rimM += (box.rimM || 0);
                        targetStats.rimA += (box.rimA || 0);
                        targetStats.midM += (box.midM || 0);
                        targetStats.midA += (box.midA || 0);
                    }
                    const returnObj = { ...p, condition: update?.condition ?? p.condition, health: update?.health ?? p.health, injuryType: update?.injuryType ?? p.injuryType, returnDate: update?.returnDate ?? p.returnDate };
                    if (isPlayoffGame) returnObj.playoffStats = targetStats; else returnObj.stats = targetStats;
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
                    const series = updatedSeries[sIdx];
                    const winnerId = result.homeScore > result.awayScore ? home.id : away.id;
                    const isHigherWinner = winnerId === series.higherSeedId;
                    const newH = series.higherSeedWins + (isHigherWinner ? 1 : 0);
                    const newL = series.lowerSeedWins + (!isHigherWinner ? 1 : 0);
                    const target = series.targetWins || 4;
                    const finished = newH >= target || newL >= target;
                    updatedSeries[sIdx] = { ...series, higherSeedWins: newH, lowerSeedWins: newL, finished, winnerId: finished ? (newH >= target ? series.higherSeedId : series.lowerSeedId) : undefined };
                    if (!finished) {
                        const nextGameNum = newH + newL + 1;
                        const nextGameDate = new Date(targetSimDate);
                        nextGameDate.setDate(nextGameDate.getDate() + 2);
                        const nextId = `${series.id}_g${nextGameNum}`;
                        if (!updatedSchedule.some(g => g.id === nextId)) {
                             updatedSchedule.push({
                                 id: nextId, seriesId: series.id, isPlayoff: true,
                                 homeTeamId: nextGameNum % 2 !== 0 ? series.higherSeedId : series.lowerSeedId,
                                 awayTeamId: nextGameNum % 2 !== 0 ? series.lowerSeedId : series.higherSeedId,
                                 date: nextGameDate.toISOString().split('T')[0], played: false
                             });
                        }
                    }
                }
            }
            updatedBoxScores[game.id] = { home: result.homeBox, away: result.awayBox };
            allPlayedToday.push(updatedGame);
            if (isUserGame) userGameResultOutput = { ...result, home: updatedTeams[homeIdx], away: updatedTeams[awayIdx], userTactics: tactics, myTeamId }; 
        }
        const currentDateObj = new Date(targetSimDate);
        currentDateObj.setDate(currentDateObj.getDate() + 1);
        setTeams(updatedTeams); 
        setSchedule(updatedSchedule); 
        setBoxScores(updatedBoxScores);
        setPlayoffSeries(updatedSeries); 
        setCurrentSimDate(currentDateObj.toISOString().split('T')[0]); 
        setNews(updatedNews);
        triggerSave();
        if (userGameResultOutput) {
            const recap = await generateGameRecapNews(userGameResultOutput);
            setLastGameResult({ ...userGameResultOutput, recap: recap || [], otherGames: allPlayedToday.filter(g => g.homeTeamId !== myTeamId && g.awayTeamId !== myTeamId) });
            setView('GameResult');
        } else { setIsSimulating(false); }
    };
    
    if (userGameToday) {
        const recoveredMyTeam = {
            ...myTeam,
            roster: myTeam.roster.map(p => {
                const currentCond = p.condition ?? 100;
                const recovery = 16 + (p.stamina * 0.18);
                return { ...p, condition: Math.min(100, Math.floor(currentCond + recovery)) };
            })
        };
        const home = userGameToday.homeTeamId === myTeamId ? recoveredMyTeam : teams.find(t => t.id === userGameToday.homeTeamId)!;
        const away = userGameToday.awayTeamId === myTeamId ? recoveredMyTeam : teams.find(t => t.id === userGameToday.awayTeamId)!;
        const homeReady = home.id === myTeamId ? home : {
            ...home,
            roster: home.roster.map(p => ({ ...p, condition: Math.min(100, (p.condition ?? 100) + 16 + (p.stamina * 0.18)) }))
        };
        const awayReady = away.id === myTeamId ? away : {
            ...away,
            roster: away.roster.map(p => ({ ...p, condition: Math.min(100, (p.condition ?? 100) + 16 + (p.stamina * 0.18)) }))
        };
        const precalculatedUserResult = simulateGame(homeReady, awayReady, myTeamId, tactics);
        setActiveGame({ ...userGameToday, homeScore: precalculatedUserResult.homeScore, awayScore: precalculatedUserResult.awayScore }); 
        setView('GameSim');
        finalizeSimRef.current = () => processSimulation(precalculatedUserResult);
    } else { 
        setIsSimulating(true); 
        setTimeout(() => processSimulation(), 800);
    }
  };

  const tickerGames = useMemo(() => {
    const played = schedule.filter(g => g.played);
    if (played.length === 0) return [];
    const sorted = [...played].sort((a,b) => b.date.localeCompare(a.date));
    const lastDate = sorted[0].date;
    return played.filter(g => g.date === lastDate);
  }, [schedule]);

  if (authLoading || isBaseDataLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200"><Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" /><p className="text-sm font-bold uppercase tracking-widest text-slate-500">Initializing League Data...</p></div>;
  if (!session && !isGuestMode) return <AuthView />;
  
  // [DEBUG] 중복 로그인 기능 비활성화로 인해 아래 코드 주석 처리
  /*
  if (isDuplicateSession && !isGuestMode) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center"><MonitorX size={64} className="text-red-500 mb-6" /><h2 className="text-3xl font-black text-white mb-4">중복 로그인 감지</h2><button onClick={handleForceLogin} className="px-8 py-4 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-500 transition-colors">여기서 다시 접속</button></div>;
  */

  if (view === 'TeamSelect') return <TeamSelectView teams={teams} isInitializing={isBaseDataLoading} onSelectTeam={handleTeamSelection} onReload={refetchBaseData} dataSource='DB' />;
  
  const myTeam = teams.find(t => t.id === myTeamId);
  if (view === 'Onboarding') return <OnboardingView team={myTeam!} onComplete={handleOnboardingComplete} />;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden ko-normal pretendard">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      {updateAvailable && (
          <ActionToast 
              message="새로운 버전이 출시되었습니다."
              actionLabel="업데이트"
              onAction={handleUpdateAndReload}
              onClose={() => setUpdateAvailable(false)}
          />
      )}
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
      <div className="flex-1 flex overflow-hidden relative">
        <aside className="w-72 border-r border-slate-800 bg-slate-900/60 flex flex-col shadow-2xl z-20">
            <div className="p-8 border-b border-slate-800"><div className="flex items-center gap-4"><img src={myTeam?.logo} className="w-12 h-12 object-contain" alt="" /><div><h2 className="font-black text-lg leading-tight uppercase oswald">{myTeam?.name}</h2><span className="text-[10px] font-bold text-slate-500 uppercase">{myTeam?.wins}W - {myTeam?.losses}L</span></div></div></div>
            <div className="px-8 py-5 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center"><div className="flex items-center gap-3"><Clock className="text-indigo-400" size={16} /><span className="text-sm font-bold text-white oswald">{currentSimDate}</span></div>{saveGameMutation.isPending && <Cloud size={16} className="text-emerald-500 animate-pulse" />}</div>
            <nav className="flex-1 p-6 space-y-3 overflow-y-auto custom-scrollbar">
                <NavItem active={view === 'Dashboard'} icon={<LayoutDashboard size={20}/>} label="라커룸" onClick={() => setView('Dashboard')} />
                <NavItem active={view === 'Roster'} icon={<Users size={20}/>} label="로스터 & 기록" onClick={() => { setRosterTargetId(myTeamId); setView('Roster'); }} />
                <NavItem active={view === 'Standings'} icon={<Trophy size={20}/>} label="순위표" onClick={() => setView('Standings')} />
                <NavItem active={view === 'Leaderboard'} icon={<BarChart3 size={20}/>} label="리더보드" onClick={() => setView('Leaderboard')} />
                <NavItem active={view === 'Playoffs'} icon={<Swords size={20}/>} label="플레이오프" onClick={() => setView('Playoffs')} />
                <NavItem active={view === 'Schedule'} icon={<CalendarIcon size={20}/>} label="일정" onClick={() => setView('Schedule')} />
                <NavItem active={view === 'Transactions'} icon={<ArrowLeftRight size={20}/>} label="트레이드" onClick={() => setView('Transactions')} />
                <div className="h-px bg-slate-800 my-2 mx-4"></div>
                <NavItem active={view === 'OvrCalculator'} icon={<FlaskConical size={20}/>} label="OVR 실험실" onClick={() => setView('OvrCalculator')} />
            </nav>
            <div className="p-6 border-t border-slate-800 space-y-2">
                <button onClick={() => setShowResetConfirm(true)} className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-white rounded-xl flex items-center justify-center gap-2"><RefreshCw size={14} /> 데이터 초기화</button>
                <button onClick={handleLogout} className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-red-400 rounded-xl flex items-center justify-center gap-2"><LogOut size={14} /> 로그아웃</button>
            </div>
        </aside>
        <main className="flex-1 overflow-y-auto bg-slate-950/50 relative flex flex-col">
            <div className="flex-1">
              <div className="p-8 lg:p-12">
              {view === 'Dashboard' && myTeam && <DashboardView team={myTeam} teams={teams} schedule={schedule} onSim={handleExecuteSim} tactics={userTactics} onUpdateTactics={setUserTactics} currentSimDate={currentSimDate} isSimulating={isSimulating} onShowSeasonReview={() => setView('SeasonReview')} onShowPlayoffReview={() => setView('PlayoffReview')} hasPlayoffHistory={playoffSeries.length > 0} />}
              {view === 'Roster' && <RosterView allTeams={teams} myTeamId={myTeamId!} initialTeamId={rosterTargetId} />}
              {view === 'Standings' && <StandingsView teams={teams} onTeamClick={id => { setRosterTargetId(id); setView('Roster'); }} />}
              {view === 'Leaderboard' && <LeaderboardView teams={teams} />}
              {view === 'Playoffs' && <PlayoffsView teams={teams} schedule={schedule} series={playoffSeries} setSeries={setPlayoffSeries} setSchedule={setSchedule} myTeamId={myTeamId!} />}
              {view === 'Schedule' && <ScheduleView schedule={schedule} teamId={myTeamId!} teams={teams} onExport={() => exportScheduleToCSV(schedule)} currentSimDate={currentSimDate} />}
              {view === 'Transactions' && myTeam && <TransactionsView team={myTeam} teams={teams} setTeams={setTeams} addNews={() => {}} onShowToast={setToastMessage} currentSimDate={currentSimDate} transactions={transactions} onAddTransaction={handleAddTransaction} />}
              {view === 'SeasonReview' && myTeam && <SeasonReviewView team={myTeam} teams={teams} transactions={transactions} onBack={() => setView('Dashboard')} />}
              {view === 'PlayoffReview' && myTeam && <PlayoffReviewView team={myTeam} teams={teams} playoffSeries={playoffSeries} schedule={schedule} onBack={() => setView('Dashboard')} />}
              {view === 'OvrCalculator' && <OvrCalculatorView teams={teams} />}
              {view === 'Help' && <HelpView onBack={() => setView('Dashboard')} />}
              {view === 'Draft' && myTeam && <DraftView prospects={prospects} onDraft={handleDraftPlayer} team={myTeam} />}
              </div>
            </div>
            <Footer onNavigate={setView} />
        </main>
        {view === 'GameSim' && activeGame && <GameSimulatingView homeTeam={teams.find(t => t.id === activeGame.homeTeamId)!} awayTeam={teams.find(t => t.id === activeGame.awayTeamId)!} userTeamId={myTeamId} finalHomeScore={activeGame.homeScore} finalAwayScore={activeGame.awayScore} onSimulationComplete={() => finalizeSimRef.current?.()} />}
        {view === 'GameResult' && lastGameResult && <GameResultView 
            result={lastGameResult}
            myTeamId={myTeamId!}
            teams={teams}
            onFinish={() => {
                setLastGameResult(null);
                setIsSimulating(false);
                setView('Dashboard');
            }}
        />}
      </div>
    </div>
  );
};

export default App;
