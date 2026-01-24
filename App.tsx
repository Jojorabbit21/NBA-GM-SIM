
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Trophy, Users, Calendar as CalendarIcon, ArrowLeftRight, LayoutDashboard, 
  RefreshCw, Clock, Swords, AlertTriangle, LogOut, Cloud, Loader2, Copy, Check, X, BarChart3,
  MonitorX, Lock, GraduationCap, FlaskConical
} from 'lucide-react';
import { AppView, Team, Game, Player, PlayerBoxScore, PlayoffSeries, Transaction } from './types';
import { 
  INITIAL_TEAMS_DATA, getTeamLogoUrl, 
  mapDatabasePlayerToRuntimePlayer, mapDatabaseScheduleToRuntimeGame,
  generateSeasonSchedule, exportScheduleToCSV,
  SEASON_START_DATE, parseCSVToObjects, INITIAL_STATS, calculatePlayerOvr
} from './utils/constants';
import { simulateGame, GameTactics, RosterUpdate } from './services/gameEngine';
import { generateNewsTicker, generateOwnerWelcome, generateGameRecapNews } from './services/geminiService';
import { initGA, logPageView, logEvent, logError } from './services/analytics'; 
import { NavItem, Toast } from './components/SharedComponents';
import { TeamSelectView } from './views/TeamSelectView';
import { DashboardView } from './views/DashboardView';
import { RosterView } from './views/RosterView';
import { StandingsView } from './views/StandingsView';
import { ScheduleView } from './views/ScheduleView';
import { TransactionsView } from './views/TransactionsView';
import { DraftView } from './views/DraftView';
import { PlayoffsView } from './views/PlayoffsView';
import { GameSimulatingView, GameResultView } from './views/GameViews';
import { OnboardingView } from './views/OnboardingView';
import { LeaderboardView } from './views/LeaderboardView';
import { SeasonReviewView } from './views/SeasonReviewView'; 
import { PlayoffReviewView } from './views/PlayoffReviewView'; 
import { OvrCalculatorView } from './views/OvrCalculatorView';
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

type NewsItem = 
  | { type: 'text'; content: string }
  | { type: 'game'; home: Team; away: Team; homeScore: number; awayScore: number };

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [view, setView] = useState<AppView>('TeamSelect');
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<Game[]>([]);
  const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);
  const [userTactics, setUserTactics] = useState<GameTactics>(DEFAULT_TACTICS);
  const [transactions, setTransactions] = useState<Transaction[]>([]); 
  const [prospects, setProspects] = useState<Player[]>([]);
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
  const [isSimulating, setIsSimulating] = useState(false); 
  
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [deviceId] = useState(() => self.crypto.randomUUID());
  const [isDuplicateSession, setIsDuplicateSession] = useState(false);
  const [isSessionVerifying, setIsSessionVerifying] = useState(false); 

  const tickerContainerRef = useRef<HTMLDivElement>(null);
  const tickerContentRef = useRef<HTMLDivElement>(null);

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
    if (!session?.user) return;
    let heartbeatInterval: any;
    let subscription: any;
    const setupSession = async () => {
        setIsSessionVerifying(true);
        try {
            const { data: profile } = await supabase.from('profiles').select('active_device_id, last_seen_at').eq('id', session.user.id).single();
            const now = Date.now();
            let shouldBlock = false;
            if (profile && profile.active_device_id && profile.last_seen_at) {
                const lastSeenTime = new Date(profile.last_seen_at).getTime();
                if ((now - lastSeenTime) < 60000 && profile.active_device_id !== deviceId) {
                    shouldBlock = true;
                }
            }
            if (shouldBlock) { setIsDuplicateSession(true); setIsSessionVerifying(false); } 
            else {
                await supabase.from('profiles').upsert({ id: session.user.id, email: session.user.email, active_device_id: deviceId, last_seen_at: new Date().toISOString() }, { onConflict: 'id' });
                setIsDuplicateSession(false); setIsSessionVerifying(false);
            }
            subscription = supabase.channel(`profile:${session.user.id}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, (payload) => {
                if (payload.new.active_device_id && payload.new.active_device_id !== deviceId) { setIsDuplicateSession(true); }
            }).subscribe();
            heartbeatInterval = setInterval(async () => {
                if (!isDuplicateSession) {
                    await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', session.user.id).eq('active_device_id', deviceId);
                }
            }, 10000);
        } catch (err: any) { setIsSessionVerifying(false); }
    };
    setupSession();
    return () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (subscription) supabase.removeChannel(subscription);
    };
  }, [session, deviceId, isDuplicateSession]);

  const handleForceLogin = async () => {
      if (!session?.user) return;
      setIsSessionVerifying(true);
      try {
          await supabase.from('profiles').update({ active_device_id: deviceId, last_seen_at: new Date().toISOString() }).eq('id', session.user.id);
          setIsDuplicateSession(false); setIsSessionVerifying(false);
      } catch (e: any) { setIsSessionVerifying(false); }
  };

  /**
   * 모든 로드된 데이터에 대해 최신 오버롤 공식을 강제 적용합니다.
   */
  const syncOvrWithLatestWeights = useCallback((teamsToSync: Team[]): Team[] => {
      return teamsToSync.map(t => ({
          ...t,
          roster: t.roster.map(p => ({
              ...p,
              ovr: calculatePlayerOvr(p)
          }))
      }));
  }, []);

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

        // 가중치에 따른 정확한 OVR 산출
        mockPlayer.ovr = calculatePlayerOvr(mockPlayer);
        
        // 시각적 편의를 위한 덩어리 능력치 갱신
        mockPlayer.ath = baseOvr; mockPlayer.out = baseOvr; mockPlayer.ins = baseOvr; mockPlayer.plm = baseOvr; mockPlayer.def = baseOvr; mockPlayer.reb = baseOvr;
        
        return mockPlayer as Player;
    });
  }, []);

  const loadBaseData = useCallback(async () => {
    try {
      let combinedPlayers: any[] = [];
      let source: 'DB' | 'CSV' = 'DB';
      const { data: dbPlayers, error } = await supabase.from('players').select('*');
      if (error || !dbPlayers || dbPlayers.length === 0) {
          source = 'CSV';
          const rosterFiles = ['roster_atlantic.csv', 'roster_central.csv', 'roster_southeast.csv', 'roster_northwest.csv', 'roster_pacific.csv', 'roster_southwest.csv'];
          for (const file of rosterFiles) {
              try {
                  const res = await fetch(`/${file}`);
                  if (res.ok) { combinedPlayers.push(...parseCSVToObjects(await res.text())); }
              } catch (e: any) { logError('Data Load', `CSV fallback failed for ${file}`); }
          }
      } else { combinedPlayers = dbPlayers; }
      setDataSource(source);
      const fullRosterMap: Record<string, any[]> = {};
      if (combinedPlayers.length > 0) {
          combinedPlayers.forEach((p: any) => {
              const teamName = p.team || p.Team || p.TEAM || p.team_name; 
              if (!teamName) return;
              const t = INITIAL_TEAMS_DATA.find(it => it.name === teamName || `${it.city} ${it.name}` === teamName || it.name.toLowerCase() === teamName.toLowerCase());
              if (t) {
                  if (!fullRosterMap[t.id]) fullRosterMap[t.id] = [];
                  fullRosterMap[t.id].push(mapDatabasePlayerToRuntimePlayer(p, t.id));
              }
          });
      }
      
      const initializedTeams: Team[] = INITIAL_TEAMS_DATA.map(t => ({
        ...t, roster: fullRosterMap[t.id] || [], wins: 0, losses: 0, budget: 200, salaryCap: 140, luxuryTaxLine: 170, logo: getTeamLogoUrl(t.id)
      }));

      // 가중치 동기화 강제 실행
      setTeams(syncOvrWithLatestWeights(initializedTeams));
      setProspects(generateInitialProspects());
    } catch (err: any) { logError('Data Load', 'Critical Roster Loading Error'); }
  }, [generateInitialProspects, syncOvrWithLatestWeights]);

  useEffect(() => { loadBaseData(); }, [loadBaseData]);

  useEffect(() => {
    const checkExistingSave = async () => {
        if (!session?.user || isDataLoaded || teams.length === 0 || isDuplicateSession) return;
        setIsInitializing(true);
        try {
            const { data: saveData, error } = await supabase.from('saves').select('team_id, game_data').eq('user_id', session.user.id).maybeSingle();
            if (!error && saveData && saveData.game_data) {
                const gd = saveData.game_data;
                setMyTeamId(saveData.team_id);
                // 세이브 파일 로드 시에도 최신 가중치 강제 반영
                setTeams(syncOvrWithLatestWeights(gd.teams)); 
                setSchedule(gd.schedule);
                setCurrentSimDate(gd.currentSimDate);
                setUserTactics(gd.tactics || DEFAULT_TACTICS);
                setPlayoffSeries(gd.playoffSeries || []);
                setTransactions(gd.transactions || []);
                setProspects(gd.prospects || generateInitialProspects());
                setRosterTargetId(saveData.team_id);
                setIsDataLoaded(true);
                setView('Dashboard');
                setToastMessage("최신 가중치를 적용하여 게임을 불러왔습니다.");
            }
        } catch (err: any) { logError('Data Load', 'Auto-load save failed'); } 
        finally { setIsInitializing(false); }
    };
    checkExistingSave();
  }, [session, isDataLoaded, teams, isDuplicateSession, generateInitialProspects, syncOvrWithLatestWeights]);

  const handleTeamSelection = useCallback(async (teamId: string) => {
    if (!session?.user) return;
    if (isDataLoaded && myTeamId) { setRosterTargetId(teamId); return; }
    setIsInitializing(true);
    setMyTeamId(teamId);
    setRosterTargetId(teamId);
    
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
    } catch (e: any) {}
    if (allScheduleRows.length > 0) loadedSchedule = mapDatabaseScheduleToRuntimeGame(allScheduleRows);
    else {
        try {
            const res = await fetch('/schedule.csv');
            if (res.ok) { loadedSchedule = mapDatabaseScheduleToRuntimeGame(parseCSVToObjects(await res.text())); }
        } catch (e: any) {}
    }
    if (loadedSchedule.length > 0) { setSchedule(loadedSchedule); } 
    else { setSchedule(generateSeasonSchedule(teamId)); }
    setCurrentSimDate(SEASON_START_DATE);

    const teamData = INITIAL_TEAMS_DATA.find(t => t.id === teamId);
    if (teamData) {
      const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
      setNews([{ type: 'text', content: welcome }, { type: 'text', content: "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료." }]);
    }
    setIsDataLoaded(true); setIsInitializing(false); setView('Onboarding'); 
  }, [teams, session, isDataLoaded, myTeamId]);

  const saveToCloud = useCallback(async () => {
        if (!isDataLoaded || !myTeamId || !session?.user || !hasWritePermission || isDuplicateSession) return;
        setIsSaving(true);
        await supabase.from('saves').upsert({ 
            user_id: session.user.id, team_id: myTeamId, 
            game_data: { teams, schedule, currentSimDate, tactics: userTactics, playoffSeries, transactions, prospects },
            updated_at: new Date()
        }, { onConflict: 'user_id, team_id' });
        setIsSaving(false);
  }, [teams, schedule, myTeamId, isDataLoaded, currentSimDate, userTactics, playoffSeries, transactions, prospects, session, hasWritePermission, isDuplicateSession]);

  useEffect(() => {
    const timeoutId = setTimeout(saveToCloud, 3000);
    return () => clearTimeout(timeoutId);
  }, [saveToCloud]);

  const handleHardReset = async () => {
    if (!session?.user || !myTeamId) return;
    setAuthLoading(true);
    await supabase.from('saves').delete().eq('user_id', session.user.id).eq('team_id', myTeamId);
    setMyTeamId(null); setSchedule([]); setPlayoffSeries([]); setTransactions([]);
    setProspects(generateInitialProspects());
    setNews([{ type: 'text', content: "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료." }]);
    setCurrentSimDate(SEASON_START_DATE);
    setLastGameResult(null); setActiveGame(null); setIsDataLoaded(false); 
    await loadBaseData();
    setShowResetConfirm(false); setAuthLoading(false); setView('TeamSelect');
  };

  const handleLogout = async () => {
    if (session?.user) { await supabase.from('profiles').update({ active_device_id: null, last_seen_at: null }).eq('id', session.user.id); }
    await supabase.auth.signOut();
    setSession(null); setMyTeamId(null); setSchedule([]); setPlayoffSeries([]); setTransactions([]); setProspects([]);
    setIsDataLoaded(false); setView('TeamSelect'); setIsDuplicateSession(false);
  };

  const handleExecuteSim = async (tactics: GameTactics) => {
    const myTeam = teams.find(t => t.id === myTeamId);
    if (!myTeamId || !myTeam) return;
    const targetSimDate = currentSimDate;
    const gamesToday = schedule.filter(g => g.date === targetSimDate && !g.played);
    const userGameToday = gamesToday.find(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId);
    if (userGameToday) { setActiveGame(userGameToday); setView('GameSim'); } 
    else { setIsSimulating(true); }

    const delayTime = userGameToday ? 3000 : 800;
    setTimeout(async () => {
      let updatedTeams = [...teams];
      let updatedSchedule = [...schedule];
      let userGameResult = null;
      const getTeam = (id: string) => updatedTeams.find(t => t.id === id)!;

      for (const game of gamesToday) {
          const isUserGame = (game.homeTeamId === myTeamId || game.awayTeamId === myTeamId);
          const home = getTeam(game.homeTeamId);
          const away = getTeam(game.awayTeamId);
          const result = simulateGame(home, away, myTeamId, isUserGame ? tactics : undefined);
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
                  let newRegularStats = { ...p.stats };
                  let newPlayoffStats = p.playoffStats ? { ...p.playoffStats } : { ...newRegularStats, g:0, gs:0, mp:0, pts:0, reb:0, ast:0, stl:0, blk:0, tov:0, fgm:0, fga:0, p3m:0, p3a:0, ftm:0, fta:0, offReb:0, defReb:0 };
                  const targetStats = isPlayoffGame ? newPlayoffStats : newRegularStats;
                  if (box) {
                      targetStats.g += 1; targetStats.gs += box.gs; targetStats.mp += box.mp; targetStats.pts += box.pts; targetStats.reb += box.reb;
                      targetStats.offReb += box.offReb || 0; targetStats.defReb += box.defReb || 0; targetStats.ast += box.ast; targetStats.stl += box.stl;
                      targetStats.blk += box.blk; targetStats.tov += box.tov; targetStats.fgm += box.fgm; targetStats.fga += box.fga;
                      targetStats.p3m += box.p3m; targetStats.p3a += box.p3a; targetStats.ftm += box.ftm; targetStats.fta += box.fta;
                  }
                  return { ...p, stats: newRegularStats, playoffStats: newPlayoffStats, condition: update?.condition ?? p.condition, health: update?.health ?? p.health, injuryType: update?.injuryType ?? p.injuryType, returnDate: update?.returnDate ?? p.returnDate };
              });
          };
          updateRosterStats(homeIdx, result.homeBox, result.rosterUpdates);
          updateRosterStats(awayIdx, result.awayBox, result.rosterUpdates);
          const schIdx = updatedSchedule.findIndex(g => g.id === game.id);
          if (schIdx !== -1) { updatedSchedule[schIdx] = { ...game, played: true, homeScore: result.homeScore, awayScore: result.awayScore, boxScore: { home: result.homeBox, away: result.awayBox } }; }
          if (isUserGame) { userGameResult = { ...result, home: updatedTeams[homeIdx], away: updatedTeams[awayIdx], userTactics: tactics, myTeamId }; }
      }

      const currentDateObj = new Date(targetSimDate);
      currentDateObj.setDate(currentDateObj.getDate() + 1);
      const nextDayStr = currentDateObj.toISOString().split('T')[0];
      setTeams(updatedTeams); setSchedule(updatedSchedule); setCurrentSimDate(nextDayStr);

      if (userGameResult) {
          const recap = await generateGameRecapNews(userGameResult);
          setLastGameResult({ ...userGameResult, recap: recap || [] });
          setView('GameResult');
      } else { setIsSimulating(false); }
    }, delayTime);
  };

  const handleDraftPlayer = (player: Player) => {
    if (!myTeamId) return;
    setTeams(prev => prev.map(t => {
        if (t.id === myTeamId) {
            return { ...t, roster: [...t.roster, player] };
        }
        return t;
    }));
    setProspects(prev => prev.filter(p => p.id !== player.id));
    setTransactions(prev => [{
        id: `dr_${Date.now()}`, date: currentSimDate, type: 'Draft', teamId: myTeamId, description: `신인 드래프트 지명: ${player.name} (${player.position})`
    }, ...prev]);
    setToastMessage(`${player.name} 선수를 지명했습니다!`);
    setView('Dashboard');
  };

  if (authLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200"><Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" /><p className="text-sm font-bold uppercase tracking-widest text-slate-500">Connecting...</p></div>;
  if (!session) return <AuthView />;
  if (isDuplicateSession) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center"><MonitorX size={64} className="text-red-500 mb-6" /><h2 className="text-3xl font-black text-white mb-4">중복 로그인 감지</h2><button onClick={handleForceLogin} className="px-8 py-4 bg-indigo-600 text-white font-black rounded-xl">여기서 다시 접속</button></div>;
  if (isSessionVerifying) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200"><Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" /></div>;
  if (view === 'TeamSelect') return <TeamSelectView teams={teams} isInitializing={isInitializing} onSelectTeam={handleTeamSelection} onReload={loadBaseData} dataSource={dataSource} />;
  
  const myTeam = teams.find(t => t.id === myTeamId);
  if (view === 'Onboarding') return <OnboardingView team={myTeam!} onComplete={() => setView('Dashboard')} />;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden ko-normal pretendard">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-red-500/50 rounded-3xl max-w-md w-full p-8 shadow-2xl flex flex-col items-center text-center space-y-6">
                <AlertTriangle size={40} className="text-red-500" /><h3 className="text-2xl font-black text-white">데이터 초기화</h3><div className="flex gap-3 w-full"><button onClick={() => setShowResetConfirm(false)} className="flex-1 py-4 rounded-xl font-bold bg-slate-800">취소</button><button onClick={handleHardReset} className="flex-1 py-4 rounded-xl font-black bg-red-600">초기화</button></div>
            </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <aside className="w-72 border-r border-slate-800 bg-slate-900/60 flex flex-col shadow-2xl z-20">
            <div className="p-8 border-b border-slate-800"><div className="flex items-center gap-4"><img src={myTeam?.logo} className="w-12 h-12 object-contain" alt="" /><div><h2 className="font-black text-lg leading-tight uppercase oswald">{myTeam?.name}</h2><span className="text-[10px] font-bold text-slate-500 uppercase">{myTeam?.wins}W - {myTeam?.losses}L</span></div></div></div>
            <div className="px-8 py-5 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center"><div className="flex items-center gap-3"><Clock className="text-indigo-400" size={16} /><span className="text-sm font-bold text-white oswald">{currentSimDate}</span></div>{isSaving && <Cloud size={16} className="text-emerald-500 animate-pulse" />}</div>
            <nav className="flex-1 p-6 space-y-3 overflow-y-auto custom-scrollbar">
                <NavItem active={view === 'Dashboard'} icon={<LayoutDashboard size={20}/>} label="라커룸" onClick={() => setView('Dashboard')} />
                <NavItem active={view === 'Roster'} icon={<Users size={20}/>} label="로스터 & 기록" onClick={() => { setRosterTargetId(myTeamId); setView('Roster'); }} />
                <NavItem active={view === 'Standings'} icon={<Trophy size={20}/>} label="순위표" onClick={() => setView('Standings')} />
                <NavItem active={view === 'Leaderboard'} icon={<BarChart3 size={20}/>} label="리더보드" onClick={() => setView('Leaderboard')} />
                <NavItem active={view === 'Playoffs'} icon={<Swords size={20}/>} label="플레이오프" onClick={() => setView('Playoffs')} />
                <NavItem active={view === 'Schedule'} icon={<CalendarIcon size={20}/>} label="일정" onClick={() => setView('Schedule')} />
                <NavItem active={view === 'Transactions'} icon={<ArrowLeftRight size={20}/>} label="트레이드" onClick={() => setView('Transactions')} />
                <NavItem active={view === 'OvrCalculator'} icon={<FlaskConical size={20}/>} label="OVR 실험실" onClick={() => setView('OvrCalculator')} />
            </nav>
            <div className="p-6 border-t border-slate-800 space-y-2">
            <button onClick={() => setShowResetConfirm(true)} className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-white rounded-xl flex items-center justify-center gap-2"><RefreshCw size={14} /> 데이터 초기화</button>
            <button onClick={handleLogout} className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-red-400 rounded-xl flex items-center justify-center gap-2"><LogOut size={14} /> 로그아웃</button>
            </div>
        </aside>
        
        <main className="flex-1 overflow-y-auto bg-slate-950/50 relative">
            <div className="p-8 lg:p-12">
            {view === 'Dashboard' && myTeam && <DashboardView team={myTeam} teams={teams} schedule={schedule} onSim={handleExecuteSim} tactics={userTactics} onUpdateTactics={setUserTactics} currentSimDate={currentSimDate} isSimulating={isSimulating} onShowSeasonReview={() => setView('SeasonReview')} onShowPlayoffReview={() => setView('PlayoffReview')} hasPlayoffHistory={playoffSeries.length > 0} />}
            {view === 'Roster' && <RosterView allTeams={teams} myTeamId={myTeamId!} initialTeamId={rosterTargetId} />}
            {view === 'Standings' && <StandingsView teams={teams} onTeamClick={id => { setRosterTargetId(id); setView('Roster'); }} />}
            {view === 'Leaderboard' && <LeaderboardView teams={teams} />}
            {view === 'Draft' && myTeam && <DraftView prospects={prospects} onDraft={handleDraftPlayer} team={myTeam} />}
            {view === 'Playoffs' && <PlayoffsView teams={teams} schedule={schedule} series={playoffSeries} setSeries={setPlayoffSeries} setSchedule={setSchedule} myTeamId={myTeamId!} />}
            {view === 'Schedule' && <ScheduleView schedule={schedule} teamId={myTeamId!} teams={teams} onExport={() => {}} currentSimDate={currentSimDate} />}
            {view === 'Transactions' && myTeam && <TransactionsView team={myTeam} teams={teams} setTeams={setTeams} addNews={() => {}} onShowToast={setToastMessage} currentSimDate={currentSimDate} transactions={transactions} onAddTransaction={t => setTransactions(p => [t, ...p])} />}
            {view === 'SeasonReview' && myTeam && <SeasonReviewView team={myTeam} teams={teams} transactions={transactions} onBack={() => setView('Dashboard')} />}
            {view === 'PlayoffReview' && myTeam && <PlayoffReviewView team={myTeam} teams={teams} playoffSeries={playoffSeries} schedule={schedule} onBack={() => setView('Dashboard')} />}
            {view === 'OvrCalculator' && <OvrCalculatorView teams={teams} />}
            </div>
        </main>

        {view === 'GameSim' && activeGame && <GameSimulatingView homeTeam={teams.find(t => t.id === activeGame.homeTeamId)!} awayTeam={teams.find(t => t.id === activeGame.awayTeamId)!} userTeamId={myTeamId} />}
        {view === 'GameResult' && lastGameResult && <GameResultView result={lastGameResult} myTeamId={myTeamId!} teams={teams} onFinish={() => setView('Dashboard')} />}
      </div>
    </div>
  );
};

export default App;
