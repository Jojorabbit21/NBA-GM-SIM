
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Trophy, Users, Calendar as CalendarIcon, ArrowLeftRight, LayoutDashboard, 
  RefreshCw, Clock, Swords, AlertTriangle, LogOut, Cloud, Loader2, Copy, Check, X, BarChart3,
  MonitorX, Lock
} from 'lucide-react';
import { AppView, Team, Game, PlayerBoxScore, PlayoffSeries, Transaction } from './types';
import { 
  INITIAL_TEAMS_DATA, getTeamLogoUrl, 
  mapDatabasePlayerToRuntimePlayer, mapDatabaseScheduleToRuntimeGame,
  generateSeasonSchedule, exportScheduleToCSV,
  SEASON_START_DATE, parseCSVToObjects
} from './utils/constants';
import { simulateGame, GameTactics, RosterUpdate } from './services/gameEngine';
// Import generateGameRecapNews to fix missing import
import { generateNewsTicker, generateOwnerWelcome, generateGameRecapNews } from './services/geminiService';
import { initGA, logPageView, logEvent, logError } from './services/analytics'; // Analytics Import
import { NavItem, Toast } from './components/SharedComponents';
import { TeamSelectView } from './views/TeamSelectView';
import { DashboardView } from './views/DashboardView';
import { RosterView } from './views/RosterView';
import { StandingsView } from './views/StandingsView';
import { ScheduleView } from './views/ScheduleView';
import { TransactionsView } from './views/TransactionsView';
import { PlayoffsView } from './views/PlayoffsView';
import { GameSimulatingView, GameResultView } from './views/GameViews';
import { OnboardingView } from './views/OnboardingView';
import { LeaderboardView } from './views/LeaderboardView';
import { SeasonReviewView } from './views/SeasonReviewView'; // New Import
import { PlayoffReviewView } from './views/PlayoffReviewView'; // New Import
import { supabase } from './services/supabaseClient';
import { AuthView } from './views/AuthView';

const DEFAULT_TACTICS: GameTactics = {
  offenseTactics: ['Balance'],
  defenseTactics: ['ManToManPerimeter'],
  sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 5, zoneUsage: 5, rotationFlexibility: 5 },
  starters: { PG: '', SG: '', SF: '', PF: '', C: '' },
  minutesLimits: {},
  stopperId: undefined
};

// Define News Item Type for structured ticker
type NewsItem = 
  | { type: 'text'; content: string }
  | { type: 'game'; home: Team; away: Team; homeScore: number; awayScore: number };

const App: React.FC = () => {
  // Auth State
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Game State
  const [view, setView] = useState<AppView>('TeamSelect');
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<Game[]>([]);
  const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);
  const [userTactics, setUserTactics] = useState<GameTactics>(DEFAULT_TACTICS);
  const [transactions, setTransactions] = useState<Transaction[]>([]); // Transaction History State
  const [news, setNews] = useState<NewsItem[]>([{ type: 'text', content: "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료." }]);
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [lastGameResult, setLastGameResult] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [rosterTargetId, setRosterTargetId] = useState<string | null>(null);
  const [currentSimDate, setCurrentSimDate] = useState<string>(SEASON_START_DATE);
  
  const [isInitializing, setIsInitializing] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasWritePermission, setHasWritePermission] = useState(true);
  const [dataSource, setDataSource] = useState<'DB' | 'CSV'>('DB');
  const [isSimulating, setIsSimulating] = useState(false); // New state for day sim
  
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Ticker State
  const tickerContainerRef = useRef<HTMLDivElement>(null);
  const tickerContentRef = useRef<HTMLDivElement>(null);
  const [isTickerScroll, setIsTickerScroll] = useState(false);

  // Duplicate Login Prevention
  const [deviceId] = useState(() => self.crypto.randomUUID());
  const [isDuplicateSession, setIsDuplicateSession] = useState(false);
  const [isSessionVerifying, setIsSessionVerifying] = useState(false); // 로딩 화면용 상태

  // [Analytics] Initialize GA
  useEffect(() => {
    initGA();
  }, []);

  // [Analytics] Track Page Views
  useEffect(() => {
    logPageView(view);
  }, [view]);

  // Measure content width for conditional scrolling
  useEffect(() => {
    if (tickerContainerRef.current && tickerContentRef.current) {
        const containerWidth = tickerContainerRef.current.offsetWidth;
        const contentWidth = tickerContentRef.current.scrollWidth;
        setIsTickerScroll(contentWidth > containerWidth);
    }
  }, [news]);

  // [AUTH]
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // [Heartbeat & Realtime Lock Check]
  // 'Check-then-Claim' + Realtime Subscription for Mutually Exclusive Access
  useEffect(() => {
    if (!session?.user) return;

    let heartbeatInterval: any;
    let subscription: any;

    const setupSession = async () => {
        setIsSessionVerifying(true);
        try {
            // 1. 초기 상태 확인 (Check)
            const { data: profile } = await supabase
                .from('profiles')
                .select('active_device_id, last_seen_at')
                .eq('id', session.user.id)
                .single();

            const now = Date.now();
            let shouldBlock = false;

            if (profile && profile.active_device_id && profile.last_seen_at) {
                const lastSeenTime = new Date(profile.last_seen_at).getTime();
                const isActive = (now - lastSeenTime) < 60000; // 1분 이내 활동

                // 다른 기기가 활성 상태라면 일단 차단 (사용자가 "여기서 접속"을 누르면 뺏어옴)
                if (isActive && profile.active_device_id !== deviceId) {
                    shouldBlock = true;
                }
            }

            if (shouldBlock) {
                setIsDuplicateSession(true);
                setIsSessionVerifying(false);
            } else {
                // 2. 세션 점유 (Claim)
                await supabase
                    .from('profiles')
                    .upsert({ 
                        id: session.user.id,
                        email: session.user.email,
                        active_device_id: deviceId,
                        last_seen_at: new Date().toISOString()
                    }, { onConflict: 'id' });
                
                setIsDuplicateSession(false);
                setIsSessionVerifying(false);
            }

            // 3. Realtime Subscription (다른 탭에서 뺏어가는 것을 즉시 감지)
            const channel = supabase.channel(`profile:${session.user.id}`)
                .on(
                    'postgres_changes', 
                    { 
                        event: 'UPDATE', 
                        schema: 'public', 
                        table: 'profiles', 
                        filter: `id=eq.${session.user.id}` 
                    }, 
                    (payload) => {
                        const newDevice = payload.new.active_device_id;
                        // DB의 device_id가 내 것과 다르면, 누군가 뺏어간 것임 -> 즉시 차단
                        if (newDevice && newDevice !== deviceId) {
                            setIsDuplicateSession(true);
                        }
                    }
                )
                .subscribe();
            
            subscription = channel;

            // 4. 주기적 Heartbeat (내가 주인일 때만)
            heartbeatInterval = setInterval(async () => {
                // 화면이 잠겨있지 않을 때만 Heartbeat 전송
                if (!isDuplicateSession) {
                    await supabase
                        .from('profiles')
                        .update({ 
                            last_seen_at: new Date().toISOString()
                        })
                        .eq('id', session.user.id)
                        .eq('active_device_id', deviceId); // 내가 주인일 때만 시간 갱신 (Optimistic Concurrency)
                }
            }, 10000); // 10초마다 갱신

        } catch (err: any) {
            console.error("Session verification failed:", err);
            logError('Auth', `Session verification failed: ${err.message}`);
            setIsSessionVerifying(false); 
        }
    };

    setupSession();

    // 5. 탭 종료 시 정리 시도
    const handleUnload = () => {
        // 내가 주인일 때만 active_device_id 해제
        if (!isDuplicateSession) {
            const url = `${process.env.REACT_APP_SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}&active_device_id=eq.${deviceId}`;
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
                'apikey': process.env.REACT_APP_SUPABASE_ANON_KEY || '',
                'Prefer': 'return=minimal'
            };
            const data = JSON.stringify({ active_device_id: null });
            fetch(url, { method: 'PATCH', headers, body: data, keepalive: true });
        }
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (subscription) supabase.removeChannel(subscription);
        window.removeEventListener('beforeunload', handleUnload);
    };
  }, [session, deviceId, isDuplicateSession]);

  // "여기서 다시 접속하기" 핸들러 (강제 점유)
  const handleForceLogin = async () => {
      if (!session?.user) return;
      setIsSessionVerifying(true);
      try {
          // 강제로 내 Device ID로 덮어씀 -> Realtime이 트리거되어 다른 탭들은 잠김
          await supabase
              .from('profiles')
              .update({ 
                  active_device_id: deviceId,
                  last_seen_at: new Date().toISOString()
              })
              .eq('id', session.user.id);
          
          setIsDuplicateSession(false);
          setIsSessionVerifying(false);
      } catch (e: any) {
          console.error("Force login failed", e);
          logError('Auth', `Force login failed: ${e.message}`);
          setIsSessionVerifying(false);
      }
  };

  // [INIT] Reusable Function to Load Base Roster Data
  const loadBaseData = useCallback(async () => {
    try {
      let combinedPlayers: any[] = [];
      let source: 'DB' | 'CSV' = 'DB';
      
      // 1. Try Loading from Supabase (Fresh check of the players table)
      const { data: dbPlayers, error } = await supabase.from('players').select('*');
      
      if (error || !dbPlayers || dbPlayers.length === 0) {
          console.warn("Supabase Load Failed, using fallback CSVs.");
          logError('Data Load', 'Supabase roster load failed, falling back to CSV');
          source = 'CSV';
          const rosterFiles = ['roster_atlantic.csv', 'roster_central.csv', 'roster_southeast.csv', 'roster_northwest.csv', 'roster_pacific.csv', 'roster_southwest.csv'];
          for (const file of rosterFiles) {
              try {
                  const res = await fetch(`/${file}`);
                  if (res.ok) {
                      const txt = await res.text();
                      const parsed = parseCSVToObjects(txt);
                      combinedPlayers.push(...parsed);
                  }
              } catch (e: any) { 
                  console.error(`CSV Load Error for ${file}`, e);
                  logError('Data Load', `CSV fallback failed for ${file}: ${e.message}`);
              }
          }
      } else {
          combinedPlayers = dbPlayers;
          console.log("Successfully loaded roster from Supabase DB");
      }

      setDataSource(source);

      // Group players by team
      const fullRosterMap: Record<string, any[]> = {};
      if (combinedPlayers.length > 0) {
          combinedPlayers.forEach((p: any) => {
              const teamName = p.team || p.Team || p.TEAM || p.team_name; 
              if (!teamName) return;

              const t = INITIAL_TEAMS_DATA.find(it => 
                  it.name === teamName || 
                  `${it.city} ${it.name}` === teamName ||
                  it.name.toLowerCase() === teamName.toLowerCase() ||
                  it.name === teamName.replace(it.city, '').trim()
              );
              
              if (t) {
                  if (!fullRosterMap[t.id]) fullRosterMap[t.id] = [];
                  fullRosterMap[t.id].push(mapDatabasePlayerToRuntimePlayer(p, t.id));
              }
          });
      }

      const initializedTeams: Team[] = INITIAL_TEAMS_DATA.map(t => ({
        ...t, conference: t.conference as any, division: t.division as any,
        roster: fullRosterMap[t.id] || [], wins: 0, losses: 0, budget: 200, salaryCap: 140, luxuryTaxLine: 170,
        logo: getTeamLogoUrl(t.id)
      }));
      setTeams(initializedTeams);
    } catch (err: any) { 
      console.error("Critical Roster Loading Error:", err); 
      logError('Data Load', `Critical Roster Loading Error: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    loadBaseData();
  }, [loadBaseData]);

  // [AUTO-LOAD]
  useEffect(() => {
    const checkExistingSave = async () => {
        if (!session?.user || isDataLoaded || teams.length === 0) return;
        // 중복 세션이면 로드하지 않음 (충돌 방지)
        if (isDuplicateSession) return;

        setIsInitializing(true);
        try {
            const { data: saveData, error } = await supabase
                .from('saves')
                .select('team_id, game_data')
                .eq('user_id', session.user.id)
                .maybeSingle();

            if (!error && saveData && saveData.game_data) {
                const gd = saveData.game_data;
                setMyTeamId(saveData.team_id);
                setTeams(gd.teams); 
                setSchedule(gd.schedule);
                setCurrentSimDate(gd.currentSimDate);
                setUserTactics(gd.tactics || DEFAULT_TACTICS);
                setPlayoffSeries(gd.playoffSeries || []);
                setTransactions(gd.transactions || []); // Load transactions
                setRosterTargetId(saveData.team_id);
                setIsDataLoaded(true);
                setView('Dashboard');
                setToastMessage("저장된 게임을 불러왔습니다.");
                setHasWritePermission(true);
            }
        } catch (err: any) { 
            console.error("Auto-load failed:", err);
            logError('Data Load', `Auto-load save failed: ${err.message}`);
        } 
        finally { setIsInitializing(false); }
    };
    checkExistingSave();
  }, [session, isDataLoaded, teams, isDuplicateSession]);

  const handleTeamSelection = useCallback(async (teamId: string) => {
    if (!session?.user) return;
    if (isDataLoaded && myTeamId) { setRosterTargetId(teamId); return; }

    // [Analytics] Log Team Selection
    const selectedTeamData = INITIAL_TEAMS_DATA.find(t => t.id === teamId);
    logEvent('Game Start', 'Team Selected', selectedTeamData ? `${selectedTeamData.city} ${selectedTeamData.name}` : teamId);

    setIsInitializing(true);
    setMyTeamId(teamId);
    setRosterTargetId(teamId);
    setHasWritePermission(true);
    
    let loadedSchedule: Game[] = [];
    let allScheduleRows: any[] = [];
    try {
        let from = 0; const step = 1000; let more = true;
        while (more) {
            const { data, error } = await supabase.from('schedule').select('*').range(from, from + step - 1);
            if (error) break;
            if (data && data.length > 0) {
                allScheduleRows = [...allScheduleRows, ...data];
                if (data.length < step) more = false;
                from += step;
            } else more = false;
        }
    } catch (e: any) { 
        console.error("Schedule Fetch Exception:", e); 
        logError('Data Load', `Schedule Fetch Error: ${e.message}`);
    }
    
    if (allScheduleRows.length > 0) loadedSchedule = mapDatabaseScheduleToRuntimeGame(allScheduleRows);
    else {
        try {
            const res = await fetch('/schedule.csv');
            if (res.ok) {
                const txt = await res.text();
                loadedSchedule = mapDatabaseScheduleToRuntimeGame(parseCSVToObjects(txt));
            }
        } catch (e: any) { 
            console.error("Schedule CSV Fallback Failed", e); 
            logError('Data Load', `Schedule CSV Fallback Failed: ${e.message}`);
        }
    }

    if (loadedSchedule.length > 0) {
        setSchedule(loadedSchedule);
        setCurrentSimDate(SEASON_START_DATE);
    } else {
        setSchedule(generateSeasonSchedule(teamId));
        setCurrentSimDate(SEASON_START_DATE);
    }

    const teamData = INITIAL_TEAMS_DATA.find(t => t.id === teamId);
    if (teamData) {
      const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
      setNews([{ type: 'text', content: welcome }, { type: 'text', content: "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료." }]);
    }
    
    setIsDataLoaded(true); 
    setIsInitializing(false); 
    setView('Onboarding'); 
  }, [teams, session, isDataLoaded, myTeamId]);

  const saveToCloud = useCallback(async () => {
        if (!isDataLoaded || !myTeamId || !session?.user || !hasWritePermission || isDuplicateSession) return;
        setIsSaving(true);
        const { error } = await supabase.from('saves').upsert({ 
            user_id: session.user.id, 
            team_id: myTeamId, 
            game_data: { 
                teams, 
                schedule, 
                currentSimDate, 
                tactics: userTactics, 
                playoffSeries,
                transactions // Save transactions
            },
            updated_at: new Date()
        }, { onConflict: 'user_id, team_id' });
        if (error) {
            if (error.code === '42501' || error.code === '42P01') setHasWritePermission(false);
            setToastMessage("클라우드 저장 실패! 네트워크 상태를 확인하세요.");
            logError('Cloud Save', `Save failed: ${error.message}`);
        }
        setIsSaving(false);
  }, [teams, schedule, myTeamId, isDataLoaded, currentSimDate, userTactics, playoffSeries, transactions, session, hasWritePermission, isDuplicateSession]);

  useEffect(() => {
    const timeoutId = setTimeout(saveToCloud, 3000);
    return () => clearTimeout(timeoutId);
  }, [saveToCloud]);

  const handleHardReset = async () => {
    if (!session?.user || !myTeamId) return;
    setAuthLoading(true);
    const { error } = await supabase.from('saves').delete().eq('user_id', session.user.id).eq('team_id', myTeamId);
    if (error) {
        setToastMessage("초기화 실패. 서버 연결을 확인하세요.");
        logError('Data Reset', `Reset failed: ${error.message}`);
        setAuthLoading(false);
        return;
    }
    logEvent('System', 'Hard Reset');
    setMyTeamId(null); setSchedule([]); setPlayoffSeries([]); setUserTactics(DEFAULT_TACTICS); setTransactions([]);
    setNews([{ type: 'text', content: "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료." }]);
    setCurrentSimDate(SEASON_START_DATE);
    setLastGameResult(null); setActiveGame(null); setIsDataLoaded(false); 
    
    // 🔥 중요: 리셋 시 최신 DB 데이터를 다시 불러옴
    await loadBaseData();

    setShowResetConfirm(false); setAuthLoading(false); setView('TeamSelect');
    setToastMessage("데이터가 초기화되었습니다. DB의 최신 정보를 불러왔습니다.");
  };

  const handleLogout = async () => {
    // 로그아웃 시 DB의 세션 정보 클리어 (주도권 포기)
    if (session?.user) {
        await supabase.from('profiles').update({ active_device_id: null, last_seen_at: null }).eq('id', session.user.id);
    }
    await supabase.auth.signOut();
    setSession(null); setMyTeamId(null); setSchedule([]); setPlayoffSeries([]); setTransactions([]);
    setIsDataLoaded(false); setView('TeamSelect');
    setIsDuplicateSession(false);
  };

  // Fixed Export function to resolve reference error
  const handleExport = () => {
    const csv = exportScheduleToCSV(schedule, teams);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `nba_schedule_${myTeamId}.csv`);
    a.click();
    setToastMessage("일정이 CSV 파일로 저장되었습니다.");
  };

  const addTransaction = (t: Transaction) => {
      setTransactions(prev => [t, ...prev]);
  };

  // REVISED: Handle Simulation for ALL games on the CURRENT date + Advance Date
  const handleExecuteSim = async (tactics: GameTactics) => {
    const myTeam = teams.find(t => t.id === myTeamId);
    if (!myTeamId || !myTeam) return;

    // Use currentSimDate as the target simulation date
    const targetSimDate = currentSimDate;

    // Find ALL games scheduled for this date (User's + AI's)
    const gamesToday = schedule.filter(g => g.date === targetSimDate && !g.played);
    
    // Check if the user has a game today
    const userGameToday = gamesToday.find(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId);

    // If user has a game, switch to GameSim view. If not, show processing state.
    if (userGameToday) {
        setActiveGame(userGameToday);
        setView('GameSim');
    } else {
        setIsSimulating(true);
    }

    // Delay to simulate processing or wait for visuals
    const delayTime = userGameToday ? 3000 : 800; // Faster if just simulating day

    setTimeout(async () => {
      // Create local copies to batch update state
      let updatedTeams = [...teams];
      let updatedSchedule = [...schedule];
      let userGameResult = null; // To store result for GameResultView

      // Helper function to get team from local array
      const getTeam = (id: string) => updatedTeams.find(t => t.id === id)!;

      // 4. Loop through ALL games today
      for (const game of gamesToday) {
          const isUserGame = (game.homeTeamId === myTeamId || game.awayTeamId === myTeamId);
          const home = getTeam(game.homeTeamId);
          const away = getTeam(game.awayTeamId);

          // Run Simulation
          // If User Game: use user tactics. If AI Game: engine uses auto-tactics.
          const result = simulateGame(
              home, 
              away, 
              myTeamId, 
              isUserGame ? tactics : undefined 
          );

          // Update Win/Loss in local teams array
          const homeIdx = updatedTeams.findIndex(t => t.id === home.id);
          const awayIdx = updatedTeams.findIndex(t => t.id === away.id);

          updatedTeams[homeIdx] = {
              ...home,
              wins: home.wins + (result.homeScore > result.awayScore ? 1 : 0),
              losses: home.losses + (result.homeScore < result.awayScore ? 1 : 0)
          };
          
          updatedTeams[awayIdx] = {
              ...away,
              wins: away.wins + (result.awayScore > result.homeScore ? 1 : 0),
              losses: away.losses + (result.awayScore < result.homeScore ? 1 : 0)
          };

          // Apply Roster Updates (Stats & Condition)
          // Helper to update specific team roster in local array
          const updateRosterStats = (teamIdx: number, boxScore: PlayerBoxScore[], rosterUpdates: RosterUpdate) => {
              const t = updatedTeams[teamIdx];
              t.roster = t.roster.map(p => {
                  const update = rosterUpdates[p.id];
                  const box = boxScore.find(b => b.playerId === p.id);
                  
                  // Decide which stats to update based on game type
                  const isPlayoffGame = game.isPlayoff;
                  
                  let newRegularStats = { ...p.stats };
                  let newPlayoffStats = { ...p.playoffStats } || { ...newRegularStats, g:0, gs:0, mp:0, pts:0, reb:0, ast:0, stl:0, blk:0, tov:0, fgm:0, fga:0, p3m:0, p3a:0, ftm:0, fta:0, offReb:0, defReb:0 };

                  const targetStats = isPlayoffGame ? newPlayoffStats : newRegularStats;

                  if (box) {
                      targetStats.g += 1;
                      targetStats.gs += box.gs;
                      targetStats.mp += box.mp;
                      targetStats.pts += box.pts;
                      targetStats.reb += box.reb;
                      targetStats.offReb += box.offReb || 0;
                      targetStats.defReb += box.defReb || 0;
                      targetStats.ast += box.ast;
                      targetStats.stl += box.stl;
                      targetStats.blk += box.blk;
                      targetStats.tov += box.tov;
                      targetStats.fgm += box.fgm;
                      targetStats.fga += box.fga;
                      targetStats.p3m += box.p3m;
                      targetStats.p3a += box.p3a;
                      targetStats.ftm += box.ftm;
                      targetStats.fta += box.fta;
                  }

                  return {
                      ...p,
                      stats: newRegularStats,
                      playoffStats: newPlayoffStats,
                      condition: update?.condition ?? p.condition,
                      health: update?.health ?? p.health,
                      injuryType: update?.injuryType ?? p.injuryType,
                      returnDate: update?.returnDate ?? p.returnDate
                  };
              });
          };

          updateRosterStats(homeIdx, result.homeBox, result.rosterUpdates);
          updateRosterStats(awayIdx, result.awayBox, result.rosterUpdates);

          // Update Schedule (Mark as played)
          const schIdx = updatedSchedule.findIndex(g => g.id === game.id);
          if (schIdx !== -1) {
              updatedSchedule[schIdx] = {
                  ...game,
                  played: true,
                  homeScore: result.homeScore,
                  awayScore: result.awayScore,
                  boxScore: { home: result.homeBox, away: result.awayBox }
              };
          }

          // Capture User Game Result
          if (isUserGame) {
              userGameResult = {
                  ...result,
                  home: updatedTeams[homeIdx], // Use updated state
                  away: updatedTeams[awayIdx],
                  userTactics: tactics,
                  myTeamId,
              };
          }
      }

      // Collect results of other games played today for the ticker
      const otherGames = updatedSchedule.filter(g => 
          g.date === targetSimDate && 
          (!userGameToday || g.id !== userGameToday.id) && 
          g.played
      );

      // Generate Live Score Ticker News (Structured Data)
      const scoreNews: NewsItem[] = otherGames.map((g): NewsItem | null => {
          const home = updatedTeams.find(t => t.id === g.homeTeamId);
          const away = updatedTeams.find(t => t.id === g.awayTeamId);
          if (!home || !away) return null;
          return {
              type: 'game',
              home,
              away,
              homeScore: g.homeScore || 0,
              awayScore: g.awayScore || 0
          };
      }).filter((n): n is NewsItem => n !== null);

      // Update News State
      if (scoreNews.length > 0) {
          setNews(prev => {
              // Remove previous game results to avoid stacking old dates in the ticker
              const filteredPrev = prev.filter(n => n.type !== 'game');
              return [...scoreNews, ...filteredPrev].slice(0, 30);
          });
      }

      // 5. Advance Date (Move to the next day)
      const currentDateObj = new Date(targetSimDate);
      currentDateObj.setDate(currentDateObj.getDate() + 1);
      const nextDayStr = currentDateObj.toISOString().split('T')[0];

      // 6. Commit All State Changes
      setTeams(updatedTeams);
      setSchedule(updatedSchedule);
      setCurrentSimDate(nextDayStr); // CRITICAL FIX: Advance date

      // 7. Generate Recap & Transition View (User Game)
      if (userGameResult) {
          const homeWin = userGameResult.homeScore > userGameResult.awayScore;
          const isUserWin = (userGameResult.myTeamId === userGameResult.home.id && homeWin) || (userGameResult.myTeamId === userGameResult.away.id && !homeWin);
          const opponentName = userGameResult.myTeamId === userGameResult.home.id ? userGameResult.away.name : userGameResult.home.name;
          
          // [Analytics] Log Game Result
          logEvent('Simulation', 'Game Result', isUserWin ? 'Win' : 'Loss');
          logEvent('Simulation', 'Game Opponent', opponentName);

          const recap = await generateGameRecapNews({
              home: userGameResult.home,
              away: userGameResult.away,
              homeScore: userGameResult.homeScore,
              awayScore: userGameResult.awayScore,
              homeBox: userGameResult.homeBox,
              awayBox: userGameResult.awayBox,
              userTactics: tactics,
              myTeamId: myTeamId
          });

          setLastGameResult({
            ...userGameResult,
            recap: recap || [],
            otherGames // Include other games results in the view state
          });

          setView('GameResult');
      } else {
          // If no user game, just finish simulation and stay on dashboard
          setIsSimulating(false);
          const gameCount = gamesToday.length;
          setToastMessage(gameCount > 0 
              ? `${targetSimDate} 시뮬레이션 완료 (${gameCount}경기 종료)` 
              : `${targetSimDate} 휴식일 시뮬레이션 완료`
          );
      }

    }, delayTime);
  };

  if (authLoading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
      <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
      <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Connecting to Server...</p>
    </div>
  );

  if (!session) return <AuthView />;

  // [DUPLICATE LOGIN BLOCK]
  if (isDuplicateSession) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200 p-8 text-center relative overflow-hidden ko-normal">
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900 via-slate-950 to-slate-950"></div>
        <div className="relative z-10 bg-slate-900/50 border border-slate-700 p-12 rounded-3xl shadow-2xl max-w-lg w-full flex flex-col items-center gap-6 backdrop-blur-md animate-in fade-in zoom-in duration-300">
            <div className="p-6 bg-red-500/10 rounded-full border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                <MonitorX size={64} className="text-red-500" />
            </div>
            <div className="space-y-2">
                <h2 className="text-3xl font-black text-white uppercase tracking-tight">중복 로그인 감지</h2>
                <p className="text-slate-400 font-medium leading-relaxed">
                    다른 기기 또는 브라우저 탭에서<br/>이미 접속 중입니다.
                </p>
            </div>
            <div className="w-full h-px bg-slate-800"></div>
            <p className="text-xs text-slate-500 font-bold">
                데이터 무결성을 위해 동시 접속이 제한됩니다.<br/>
                현재 기기에서 다시 접속하면 다른 기기의 연결이 종료됩니다.
            </p>
            <button 
                onClick={handleForceLogin} 
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3"
            >
                <RefreshCw size={18} /> 여기서 다시 접속하기
            </button>
            <button onClick={handleLogout} className="text-slate-500 hover:text-slate-300 text-xs font-bold underline underline-offset-4 decoration-slate-700 hover:decoration-slate-400 transition-all">
                로그아웃
            </button>
        </div>
    </div>
  );

  // [SESSION VERIFYING LOADING SCREEN]
  if (isSessionVerifying) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
      <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
      <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Verifying Session...</p>
    </div>
  );

  if (view === 'TeamSelect') return <TeamSelectView teams={teams} isInitializing={isInitializing} onSelectTeam={handleTeamSelection} onReload={loadBaseData} dataSource={dataSource} />;
  
  const myTeam = teams.find(t => t.id === myTeamId);

  if (view === 'Onboarding') return <OnboardingView team={myTeam!} onComplete={() => setView('Dashboard')} />;

  if (view === 'SeasonReview' && myTeam) {
      return (
        <SeasonReviewView 
            team={myTeam} 
            teams={teams} 
            transactions={transactions} // 전달!
            onBack={() => setView('Dashboard')} 
        />
      );
  }

  if (view === 'PlayoffReview' && myTeam) return <PlayoffReviewView team={myTeam} teams={teams} playoffSeries={playoffSeries} schedule={schedule} onBack={() => setView('Dashboard')} />;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden ko-normal pretendard">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-red-500/50 rounded-3xl max-w-md w-full p-8 shadow-2xl">
               <div className="flex flex-col items-center text-center space-y-6">
                  <AlertTriangle size={40} className="text-red-500" />
                  <h3 className="text-2xl font-black text-white">데이터 초기화 및 DB 동기화</h3>
                  <p className="text-slate-300 text-sm font-bold leading-relaxed">
                    진행 중인 시즌 데이터를 삭제하고, <span className="text-indigo-400">현재 DB(Supabase)의 최신 선수 정보</span>를 다시 불러옵니다. 이 작업은 되돌릴 수 없습니다.
                  </p>
                  <div className="flex gap-3 w-full">
                    <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-4 rounded-xl font-bold text-slate-400 bg-slate-800">취소</button>
                    <button onClick={handleHardReset} className="flex-1 py-4 rounded-xl font-black text-white bg-red-600">초기화 및 로드</button>
                  </div>
               </div>
            </div>
        </div>
      )}

      {/* Main Content Area (Navigation + View Body) */}
      <div className="flex-1 flex overflow-hidden relative">
        <aside className="w-72 border-r border-slate-800 bg-slate-900/60 flex flex-col shadow-2xl z-20">
            <div className="p-8 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <img src={myTeam?.logo} className="w-12 h-12 object-contain" alt="" />
                    <div>
                        <h2 className="font-black text-lg leading-tight uppercase oswald">{myTeam?.name || "TEAM NAME"}</h2>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">{myTeam?.wins || 0}W - {myTeam?.losses || 0}L</span>
                    </div>
                </div>
            </div>
            <div className="px-8 py-5 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
                <div className="flex items-center gap-3"><Clock className="text-indigo-400" size={16} /><span className="text-sm font-bold text-white oswald">{currentSimDate}</span></div>
                <div className="flex items-center gap-3">
                    {isSaving && <Cloud size={16} className="text-emerald-500 animate-pulse" />}
                </div>
            </div>
            <nav className="flex-1 p-6 space-y-3 overflow-y-auto custom-scrollbar">
                <NavItem active={view === 'Dashboard'} icon={<LayoutDashboard size={20}/>} label="라커룸" onClick={() => setView('Dashboard')} />
                <NavItem active={view === 'Roster'} icon={<Users size={20}/>} label="로스터 & 기록" onClick={() => { setRosterTargetId(myTeamId); setView('Roster'); }} />
                <NavItem active={view === 'Standings'} icon={<Trophy size={20}/>} label="순위표" onClick={() => setView('Standings')} />
                <NavItem active={view === 'Leaderboard'} icon={<BarChart3 size={20}/>} label="리더보드" onClick={() => setView('Leaderboard')} />
                <NavItem active={view === 'Playoffs'} icon={<Swords size={20}/>} label="플레이오프" onClick={() => setView('Playoffs')} />
                <NavItem active={view === 'Schedule'} icon={<CalendarIcon size={20}/>} label="일정" onClick={() => setView('Schedule')} />
                <NavItem active={view === 'Transactions'} icon={<ArrowLeftRight size={20}/>} label="트레이드" onClick={() => setView('Transactions')} />
            </nav>
            <div className="p-6 border-t border-slate-800 space-y-2">
            <button onClick={() => setShowResetConfirm(true)} className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all flex items-center justify-center gap-2"><RefreshCw size={14} /> 데이터 초기화</button>
            <button onClick={handleLogout} className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-all flex items-center justify-center gap-2"><LogOut size={14} /> 로그아웃</button>
            </div>
        </aside>
        
        <main className="flex-1 overflow-y-auto bg-slate-950/50 relative">
            <div className="p-8 lg:p-12">
            {view === 'Dashboard' && myTeam && (
                <DashboardView 
                    team={myTeam} 
                    teams={teams} 
                    schedule={schedule} 
                    onSim={handleExecuteSim} 
                    tactics={userTactics} 
                    onUpdateTactics={setUserTactics} 
                    currentSimDate={currentSimDate} 
                    isSimulating={isSimulating}
                    onShowSeasonReview={() => setView('SeasonReview')}
                    onShowPlayoffReview={() => setView('PlayoffReview')}
                    hasPlayoffHistory={true} 
                />
            )}
            {view === 'Roster' && <RosterView allTeams={teams} myTeamId={myTeamId!} initialTeamId={rosterTargetId} />}
            {view === 'Standings' && <StandingsView teams={teams} onTeamClick={id => { setRosterTargetId(id); setView('Roster'); }} />}
            {view === 'Leaderboard' && <LeaderboardView teams={teams} />}
            {view === 'Playoffs' && <PlayoffsView teams={teams} schedule={schedule} series={playoffSeries} setSeries={setPlayoffSeries} setSchedule={setSchedule} myTeamId={myTeamId!} />}
            {view === 'Schedule' && <ScheduleView schedule={schedule} teamId={myTeamId!} teams={teams} onExport={handleExport} currentSimDate={currentSimDate} />}
            {view === 'Transactions' && myTeam && <TransactionsView 
                team={myTeam} 
                teams={teams} 
                setTeams={setTeams} 
                addNews={n => setNews(p => [...n.map(txt => ({ type: 'text', content: txt } as NewsItem)), ...p].slice(0, 15))} 
                onShowToast={setToastMessage} 
                currentSimDate={currentSimDate}
                transactions={transactions} 
                onAddTransaction={addTransaction}
            />}
            </div>
        </main>

        {/* Full-screen simulation overlays based on view state (Rendered inside the flex container to cover everything if absolute, or use fixed z-index) */}
        {view === 'GameSim' && activeGame && (
            <GameSimulatingView 
                homeTeam={teams.find(t => t.id === activeGame.homeTeamId)!} 
                awayTeam={teams.find(t => t.id === activeGame.awayTeamId)!} 
                userTeamId={myTeamId} 
            />
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

      {/* Global News Ticker (Footer) */}
      <div className="h-10 bg-indigo-900/90 border-t border-indigo-500/30 backdrop-blur-md flex items-center z-50 overflow-hidden flex-shrink-0" ref={tickerContainerRef}>
        <div className="flex items-center h-full px-4 bg-indigo-800 z-10 shadow-lg shrink-0">
            <span className="text-[10px] font-black text-white uppercase tracking-widest whitespace-nowrap flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> LIVE NEWS
            </span>
        </div>
        <div className="flex-1 overflow-hidden relative h-full flex items-center">
            <div ref={tickerContentRef} className={`${isTickerScroll ? 'animate-marquee' : ''} whitespace-nowrap flex items-center gap-12 px-4`}>
                {news.length === 0 ? (
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">NO NEW UPDATES</span>
                ) : (
                    news.map((n, i) => (
                        <div key={i} className="flex items-center">
                            {n.type === 'text' ? (
                                <span className="text-xs font-bold text-indigo-100 uppercase tracking-wide flex items-center gap-2">
                                    <span className="text-indigo-400">///</span> {n.content}
                                </span>
                            ) : (
                                <div className="flex items-center gap-2 bg-slate-900/40 px-3 py-1 rounded-lg border border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/60 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <img 
                                            src={n.away.logo} 
                                            className="w-5 h-5 object-contain drop-shadow-md flex-shrink-0" 
                                            alt={n.away.name} 
                                            title={n.away.name} 
                                            loading="eager"
                                            referrerPolicy="no-referrer"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 px-2 border-x border-slate-700/50">
                                        <span className={`text-xs font-black font-mono ${n.awayScore > n.homeScore ? 'text-emerald-400' : 'text-slate-200'}`}>{n.awayScore}</span>
                                        <span className="text-[9px] font-bold text-slate-500">-</span>
                                        <span className={`text-xs font-black font-mono ${n.homeScore > n.awayScore ? 'text-emerald-400' : 'text-slate-200'}`}>{n.homeScore}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <img 
                                            src={n.home.logo} 
                                            className="w-5 h-5 object-contain drop-shadow-md flex-shrink-0" 
                                            alt={n.home.name} 
                                            title={n.home.name} 
                                            loading="eager"
                                            referrerPolicy="no-referrer"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default App;
