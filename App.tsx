import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Trophy, Users, Calendar as CalendarIcon, ArrowLeftRight, LayoutDashboard, 
  RefreshCw, Clock, Swords, AlertTriangle, LogOut, Cloud, Loader2, Copy, Check, X, BarChart3,
  MonitorX, Lock, GraduationCap, FlaskConical, WifiOff
} from 'lucide-react';
import { AppView, Team, Game, Player, PlayerBoxScore, PlayoffSeries, Transaction, TacticalSnapshot, TeamTacticHistory, TacticStatRecord } from './types';
import { 
  INITIAL_TEAMS_DATA, getTeamLogoUrl, 
  mapDatabasePlayerToRuntimePlayer, mapDatabaseScheduleToRuntimeGame,
  generateSeasonSchedule, exportScheduleToCSV,
  SEASON_START_DATE, parseCSVToObjects, INITIAL_STATS, calculatePlayerOvr
} from './utils/constants';
import { simulateGame, GameTactics, RosterUpdate, SimulationResult } from './services/gameEngine';
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
import { GameSimulatingView } from './views/GameSimulationView';
import { GameResultView } from './views/GameResultView';
import { OnboardingView } from './views/OnboardingView';
import { LeaderboardView } from './views/LeaderboardView';
import { SeasonReviewView } from './views/SeasonReviewView'; 
import { PlayoffReviewView } from './views/PlayoffReviewView'; 
import { OvrCalculatorView } from './views/OvrCalculatorView';
import { LiveScoreTicker } from './components/LiveScoreTicker';
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
  const [isGuestMode, setIsGuestMode] = useState(false); // Guest Mode State
  
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

  // [Ref] Stores the function to finalize simulation after visual effect
  const finalizeSimRef = useRef<((userResult?: any) => void) | null>(null);

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

  // [Fix] Session Verification with Fail-Open Logic
  useEffect(() => {
    if (!session?.user || isGuestMode) return; // Skip in Guest Mode
    let heartbeatInterval: any;
    let subscription: any;
    
    const setupSession = async () => {
        setIsSessionVerifying(true);
        try {
            // profiles 테이블이 존재하는지 확인 (없으면 에러 발생 -> catch로 이동하여 로직 패스)
            const { data: profile, error } = await supabase.from('profiles').select('active_device_id, last_seen_at').eq('id', session.user.id).maybeSingle();
            
            if (error) {
                // 테이블이 없거나 권한 문제 시 중복 체크 기능을 비활성화하고 통과
                setIsDuplicateSession(false);
                setIsSessionVerifying(false);
                return;
            }

            const now = Date.now();
            let shouldBlock = false;
            if (profile && profile.active_device_id && profile.last_seen_at) {
                const lastSeenTime = new Date(profile.last_seen_at).getTime();
                // 1분 이상 활동 없으면 세션 탈취 가능
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
        } catch (err: any) { 
            setIsSessionVerifying(false); 
        }
    };
    setupSession();
    return () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (subscription) supabase.removeChannel(subscription);
    };
  }, [session, deviceId, isDuplicateSession, isGuestMode]);

  const handleForceLogin = async () => {
      if (!session?.user || isGuestMode) return;
      setIsSessionVerifying(true);
      try {
          await supabase.from('profiles').update({ active_device_id: deviceId, last_seen_at: new Date().toISOString() }).eq('id', session.user.id);
          setIsDuplicateSession(false); setIsSessionVerifying(false);
      } catch (e: any) { setIsSessionVerifying(false); }
  };

  // --- Auto-Generate Playoffs Logic ---
  useEffect(() => {
    if (!isDataLoaded || teams.length === 0 || schedule.length === 0) return;

    const regularGames = schedule.filter(g => !g.isPlayoff);
    const playedRegular = regularGames.filter(g => g.played).length;
    
    // Check if Regular Season is complete (1230 games usually, or check if all are played)
    if (playedRegular < regularGames.length) return;

    // --- 1. Play-In Generation ---
    const currentPlayInSeries = playoffSeries.filter(s => s.round === 0);
    if (currentPlayInSeries.length === 0) {
        // Generate Initial Play-In (7v8, 9v10)
        const newSeries: PlayoffSeries[] = [];
        const newGames: Game[] = [];
        
        ['East', 'West'].forEach(conf => {
            const confTeams = [...teams].filter(t => t.conference === conf).sort((a, b) => {
                const aPct = a.wins / (a.wins + a.losses || 1);
                const bPct = b.wins / (b.wins + b.losses || 1);
                return bPct - aPct || b.wins - a.wins;
            });
            
            // 7v8
            const s7 = confTeams[6], s8 = confTeams[7];
            const id7v8 = `pi_${conf}_7v8`;
            if (s7 && s8) {
                newSeries.push({ id: id7v8, round: 0, conference: conf as any, higherSeedId: s7.id, lowerSeedId: s8.id, higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 1 });
                newGames.push({ id: `${id7v8}_g1`, homeTeamId: s7.id, awayTeamId: s8.id, date: `2026-04-14`, played: false, isPlayoff: true, seriesId: id7v8 });
            }

            // 9v10
            const s9 = confTeams[8], s10 = confTeams[9];
            const id9v10 = `pi_${conf}_9v10`;
            if (s9 && s10) {
                newSeries.push({ id: id9v10, round: 0, conference: conf as any, higherSeedId: s9.id, lowerSeedId: s10.id, higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 1 });
                newGames.push({ id: `${id9v10}_g1`, homeTeamId: s9.id, awayTeamId: s10.id, date: `2026-04-15`, played: false, isPlayoff: true, seriesId: id9v10 });
            }
        });

        if (newSeries.length > 0) {
            setPlayoffSeries(prev => [...prev, ...newSeries]);
            setSchedule(prev => [...prev, ...newGames]);
            setNews(prev => [{ type: 'text', content: "정규 시즌 종료! 플레이-인 토너먼트 일정이 생성되었습니다." }, ...prev]);
            if (new Date(currentSimDate) < new Date('2026-04-14')) setCurrentSimDate('2026-04-14');
        }
        return;
    }

    // --- 2. Play-In Advancement (8th Seed Game) ---
    // Check if 7v8 and 9v10 are done but 8th seed game missing
    let newPIGames: Game[] = [];
    let newPISeries: PlayoffSeries[] = [];
    let hasNew8th = false;
    
    ['East', 'West'].forEach(conf => {
        const confPI = currentPlayInSeries.filter(s => s.conference === conf);
        const g7v8 = confPI.find(s => s.id.includes('7v8'));
        const g9v10 = confPI.find(s => s.id.includes('9v10'));
        const g8th = confPI.find(s => s.id.includes('8th'));

        if (g7v8?.finished && g9v10?.finished && !g8th) {
            const loser7v8Id = g7v8.winnerId === g7v8.higherSeedId ? g7v8.lowerSeedId : g7v8.higherSeedId;
            const winner9v10Id = g9v10.winnerId;
            
            if (loser7v8Id && winner9v10Id) {
                const id8th = `pi_${conf}_8th`;
                newPISeries.push({ id: id8th, round: 0, conference: conf as any, higherSeedId: loser7v8Id, lowerSeedId: winner9v10Id, higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 1 });
                newPIGames.push({ id: `${id8th}_g1`, homeTeamId: loser7v8Id, awayTeamId: winner9v10Id, date: `2026-04-17`, played: false, isPlayoff: true, seriesId: id8th });
                hasNew8th = true;
            }
        }
    });

    if (hasNew8th) {
        setPlayoffSeries(prev => [...prev, ...newPISeries]);
        setSchedule(prev => [...prev, ...newPIGames]);
        if (new Date(currentSimDate) < new Date('2026-04-17')) setCurrentSimDate('2026-04-17');
        return;
    }

    // --- 3. Round 1 Generation ---
    const allPIFinished = currentPlayInSeries.length >= 6 && currentPlayInSeries.every(s => s.finished); // At least 3 per conf
    const hasRound1 = playoffSeries.some(s => s.round === 1);

    if (allPIFinished && !hasRound1) {
        const newR1Series: PlayoffSeries[] = [];
        const newR1Games: Game[] = [];

        ['East', 'West'].forEach(conf => {
            // Get Seeds 1-6
            const confTeams = [...teams].filter(t => t.conference === conf).sort((a, b) => {
                const aPct = a.wins / (a.wins + a.losses || 1);
                const bPct = b.wins / (b.wins + b.losses || 1);
                return bPct - aPct || b.wins - a.wins;
            });
            const top6 = confTeams.slice(0, 6);

            // Get 7th and 8th from PI
            const pi = currentPlayInSeries.filter(s => s.conference === conf);
            const g7v8 = pi.find(s => s.id.includes('7v8'));
            const g8th = pi.find(s => s.id.includes('8th'));
            
            const seed7Id = g7v8?.winnerId;
            const seed8Id = g8th?.winnerId;
            
            if (seed7Id && seed8Id) {
                const seed7 = teams.find(t => t.id === seed7Id)!;
                const seed8 = teams.find(t => t.id === seed8Id)!;
                const finalSeeds = [...top6, seed7, seed8];

                // Create Series: 1v8, 2v7, 3v6, 4v5
                const matchups = [
                    { h: finalSeeds[0], l: finalSeeds[7] }, // 1v8
                    { h: finalSeeds[3], l: finalSeeds[4] }, // 4v5
                    { h: finalSeeds[2], l: finalSeeds[5] }, // 3v6
                    { h: finalSeeds[1], l: finalSeeds[6] }, // 2v7
                ];

                matchups.forEach(m => {
                    const sId = `s_${conf}_r1_${m.h.id}_${m.l.id}`;
                    newR1Series.push({ id: sId, round: 1, conference: conf as any, higherSeedId: m.h.id, lowerSeedId: m.l.id, higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 4 });
                    // Generate first 4 games
                    for(let i=1; i<=4; i++) {
                        newR1Games.push({ 
                            id: `${sId}_g${i}`, 
                            homeTeamId: i % 2 !== 0 ? m.h.id : m.l.id, 
                            awayTeamId: i % 2 !== 0 ? m.l.id : m.h.id, 
                            date: `2026-04-${20 + i}`, // Simple date logic
                            played: false, isPlayoff: true, seriesId: sId 
                        });
                    }
                });
            }
        });

        if (newR1Series.length > 0) {
            setPlayoffSeries(prev => [...prev, ...newR1Series]);
            setSchedule(prev => [...prev, ...newR1Games]);
            setNews(prev => [{ type: 'text', content: "2026 NBA 플레이오프 1라운드가 시작됩니다!" }, ...prev]);
            if (new Date(currentSimDate) < new Date('2026-04-20')) setCurrentSimDate('2026-04-20');
        }
    }

  }, [isDataLoaded, teams, schedule, playoffSeries]); // Fixed dependency: schedule (not length) and playoffSeries

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

        mockPlayer.ovr = calculatePlayerOvr(mockPlayer);
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
          if (error) console.warn("DB Load Error (switching to CSV):", error.message);
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
        ...t, 
        roster: fullRosterMap[t.id] || [], 
        wins: 0, 
        losses: 0, 
        budget: 200, 
        salaryCap: 140, 
        luxuryTaxLine: 170, 
        logo: getTeamLogoUrl(t.id),
        tacticHistory: { offense: {}, defense: {} } 
      }));

      setTeams(syncOvrWithLatestWeights(initializedTeams));
      setProspects(generateInitialProspects());
    } catch (err: any) { logError('Data Load', 'Critical Roster Loading Error'); }
  }, [generateInitialProspects, syncOvrWithLatestWeights]);

  useEffect(() => { loadBaseData(); }, [loadBaseData]);

  useEffect(() => {
    const checkExistingSave = async () => {
        if (!session?.user || isDataLoaded || teams.length === 0 || isDuplicateSession || isGuestMode) return;
        setIsInitializing(true);
        try {
            const { data: saveData, error } = await supabase.from('saves').select('team_id, game_data').eq('user_id', session.user.id).maybeSingle();
            
            if (error) {
                console.warn("Save load error (proceeding as new game):", error.message);
            } else if (saveData && saveData.game_data) {
                const gd = saveData.game_data;
                setMyTeamId(saveData.team_id);
                
                const syncedTeams = gd.teams.map((t: Team) => ({
                    ...t,
                    roster: t.roster.map(p => ({
                        ...p,
                        ovr: calculatePlayerOvr(p)
                    })),
                    tacticHistory: t.tacticHistory || { offense: {}, defense: {} }
                }));
                
                const syncedProspects = (gd.prospects || []).map((p: Player) => ({
                    ...p,
                    ovr: calculatePlayerOvr(p)
                }));

                setTeams(syncedTeams); 
                setSchedule(gd.schedule);
                setCurrentSimDate(gd.currentSimDate);
                setUserTactics(gd.tactics || DEFAULT_TACTICS);
                setPlayoffSeries(gd.playoffSeries || []);
                setTransactions(gd.transactions || []);
                setProspects(syncedProspects.length > 0 ? syncedProspects : generateInitialProspects());
                setRosterTargetId(saveData.team_id);
                setIsDataLoaded(true);
                setView('Dashboard');
                setToastMessage("세이브 데이터 로드 완료.");
            }
        } catch (err: any) { logError('Data Load', 'Auto-load save failed'); } 
        finally { setIsInitializing(false); }
    };
    checkExistingSave();
  }, [session, isDataLoaded, teams, isDuplicateSession, generateInitialProspects, isGuestMode]);

  const handleTeamSelection = useCallback(async (teamId: string) => {
    if (!session?.user && !isGuestMode) return;
    if (isDataLoaded && myTeamId) { setRosterTargetId(teamId); return; }
    setIsInitializing(true);
    setMyTeamId(teamId);
    setRosterTargetId(teamId);
    
    let allScheduleRows: any[] = [];
    try {
        if (!isGuestMode) {
            let from = 0; const step = 1000; let more = true;
            while (more) {
                const { data, error } = await supabase.from('schedule').select('*').range(from, from + step - 1);
                if (error) throw error;
                if (data && data.length > 0) {
                    allScheduleRows = [...allScheduleRows, ...data];
                    if (data.length < step) more = false;
                    from += step;
                } else more = false;
            }
        } else {
            throw new Error("Guest Mode: Skipping DB Load");
        }
    } catch (e: any) {
        console.warn("DB Schedule Load Failed (Using CSV):", e.message);
    }

    let loadedSchedule: Game[] = [];
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
  }, [teams, session, isDataLoaded, myTeamId, isGuestMode]);

  const saveToCloud = useCallback(async () => {
        if (!isDataLoaded || !myTeamId || !session?.user || !hasWritePermission || isDuplicateSession || isGuestMode) return;
        setIsSaving(true);
        try {
            await supabase.from('saves').upsert({ 
                user_id: session.user.id, team_id: myTeamId, 
                game_data: { teams, schedule, currentSimDate, tactics: userTactics, playoffSeries, transactions, prospects },
                updated_at: new Date()
            }, { onConflict: 'user_id, team_id' });
        } catch(e) {
            console.warn("Cloud save failed:", e);
        }
        setIsSaving(false);
  }, [teams, schedule, myTeamId, isDataLoaded, currentSimDate, userTactics, playoffSeries, transactions, prospects, session, hasWritePermission, isDuplicateSession, isGuestMode]);

  useEffect(() => {
    const timeoutId = setTimeout(saveToCloud, 3000);
    return () => clearTimeout(timeoutId);
  }, [saveToCloud]);

  const handleHardReset = async () => {
    if (session?.user && !isGuestMode) {
        setAuthLoading(true);
        try {
            await supabase.from('saves').delete().eq('user_id', session.user.id).eq('team_id', myTeamId);
        } catch(e) { console.warn("Reset failed on DB:", e); }
    }
    
    setMyTeamId(null); setSchedule([]); setPlayoffSeries([]); setTransactions([]);
    setProspects(generateInitialProspects());
    setNews([{ type: 'text', content: "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료." }]);
    setCurrentSimDate(SEASON_START_DATE);
    setLastGameResult(null); setActiveGame(null); setIsDataLoaded(false); 
    await loadBaseData();
    setShowResetConfirm(false); 
    if (session?.user && !isGuestMode) setAuthLoading(false);
    setView('TeamSelect');
  };

  const handleLogout = async () => {
    if (session?.user) { 
        try { await supabase.from('profiles').update({ active_device_id: null, last_seen_at: null }).eq('id', session.user.id); } catch(e){}
        await supabase.auth.signOut();
    }
    setSession(null); setMyTeamId(null); setSchedule([]); setPlayoffSeries([]); setTransactions([]); setProspects([]);
    setIsDataLoaded(false); setView('TeamSelect'); setIsDuplicateSession(false); setIsGuestMode(false);
  };

  const handleDraftPlayer = useCallback((player: Player) => {
    if (!myTeamId) return;
    logEvent('Draft', 'Player Drafted', player.name);
    setTeams(prev => prev.map(t => t.id === myTeamId ? { ...t, roster: [...t.roster, player] } : t));
    setProspects(prev => prev.filter(p => p.id !== player.id));
    const draftTransaction: Transaction = {
      id: `tr_draft_${Date.now()}`, date: currentSimDate, type: 'Draft', teamId: myTeamId, description: `${player.name} (${player.position}) 드래프트 지명`, details: { acquired: [{ id: player.id, name: player.name, ovr: player.ovr, position: player.position }], traded: [] }
    };
    setTransactions(prev => [draftTransaction, ...prev]);
    setToastMessage(`${player.name} 선수를 성공적으로 지명했습니다.`);
    setView('Dashboard');
  }, [myTeamId, currentSimDate]);

  const handleExecuteSim = async (tactics: GameTactics) => {
    const myTeam = teams.find(t => t.id === myTeamId);
    if (!myTeamId || !myTeam) return;
    const targetSimDate = currentSimDate;
    const gamesToday = schedule.filter(g => g.date === targetSimDate && !g.played);
    const userGameToday = gamesToday.find(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId);
    
    // Core simulation processing logic
    const processSimulation = async (precalcUserResult?: SimulationResult) => {
        let updatedTeams = [...teams];
        let updatedSchedule = [...schedule];
        let updatedSeries = [...playoffSeries];
        let updatedNews = [...news];
        let userGameResultOutput = null;
        let allPlayedToday: Game[] = [];
        const getTeam = (id: string) => updatedTeams.find(t => t.id === id)!;
        
        for (const game of gamesToday) {
            const isUserGame = (game.homeTeamId === myTeamId || game.awayTeamId === myTeamId);
            const home = getTeam(game.homeTeamId);
            const away = getTeam(game.awayTeamId);
            
            // Use precalculated result for user game to ensure consistency with visualization
            const result = (isUserGame && precalcUserResult) ? precalcUserResult : simulateGame(home, away, myTeamId, isUserGame ? tactics : undefined);
            
            const homeIdx = updatedTeams.findIndex(t => t.id === home.id);
            const awayIdx = updatedTeams.findIndex(t => t.id === away.id);
            updatedTeams[homeIdx] = { ...home, wins: home.wins + (result.homeScore > result.awayScore ? 1 : 0), losses: home.losses + (result.homeScore < result.awayScore ? 1 : 0) };
            updatedTeams[awayIdx] = { ...away, wins: away.wins + (result.awayScore > result.homeScore ? 1 : 0), losses: away.losses + (result.awayScore < result.homeScore ? 1 : 0) };
            
            // --- Playoff Series Update Logic ---
            if (game.isPlayoff && game.seriesId) {
                const sIdx = updatedSeries.findIndex(s => s.id === game.seriesId);
                if (sIdx !== -1) {
                    const s = { ...updatedSeries[sIdx] };
                    const isHigherWinner = result.homeScore > result.awayScore 
                        ? (s.higherSeedId === home.id) 
                        : (s.higherSeedId === away.id);
                    
                    if (isHigherWinner) s.higherSeedWins++;
                    else s.lowerSeedWins++;

                    const targetWins = s.targetWins || 4; // Default to 4 if undefined
                    
                    // Check if series is finished
                    if (s.higherSeedWins >= targetWins || s.lowerSeedWins >= targetWins) {
                        s.finished = true;
                        s.winnerId = s.higherSeedWins > s.lowerSeedWins ? s.higherSeedId : s.lowerSeedId;
                        
                        const winnerTeam = teams.find(t => t.id === s.winnerId);
                        const loserTeam = teams.find(t => t.id === (s.winnerId === s.higherSeedId ? s.lowerSeedId : s.higherSeedId));
                        if (winnerTeam && loserTeam) {
                            updatedNews.unshift({ 
                                type: 'text', 
                                content: `[PO] ${winnerTeam.name}, ${loserTeam.name} 꺾고 시리즈 승리! (${s.higherSeedWins}-${s.lowerSeedWins})` 
                            });
                        }
                    } else {
                        // Check if next game exists, if not, schedule it
                        const gamesInSeries = updatedSchedule.filter(g => g.seriesId === s.id);
                        const playedCount = gamesInSeries.filter(g => g.played).length + 1; // +1 including current game being processed
                        const nextGameId = `${s.id}_g${playedCount + 1}`;
                        const exists = updatedSchedule.some(g => g.id === nextGameId);
                        
                        if (!exists && !s.finished) {
                            const nextDateObj = new Date(targetSimDate);
                            nextDateObj.setDate(nextDateObj.getDate() + 2); // 2 days gap
                            const nextDateStr = nextDateObj.toISOString().split('T')[0];
                            
                            // Determine home court for next game (Standard NBA: 2-2-1-1-1)
                            // Game 1,2: Higher
                            // Game 3,4: Lower
                            // Game 5: Higher
                            // Game 6: Lower
                            // Game 7: Higher
                            const gameNum = playedCount + 1;
                            const isHigherHome = [1, 2, 5, 7].includes(gameNum);
                            
                            const newGame: Game = {
                                id: nextGameId,
                                homeTeamId: isHigherHome ? s.higherSeedId : s.lowerSeedId,
                                awayTeamId: isHigherHome ? s.lowerSeedId : s.higherSeedId,
                                date: nextDateStr,
                                played: false,
                                isPlayoff: true,
                                seriesId: s.id
                            };
                            updatedSchedule.push(newGame);
                        }
                    }
                    updatedSeries[sIdx] = s;
                }
            }
            // -----------------------------------

            // --- Tactic Stats Tracking ---
            if (isUserGame) {
                const myTeamIdx = updatedTeams.findIndex(t => t.id === myTeamId);
                const isHome = myTeamId === home.id;
                const myResult = isHome ? { wins: result.homeScore > result.awayScore ? 1 : 0, ptsFor: result.homeScore, ptsAgainst: result.awayScore } : { wins: result.awayScore > result.homeScore ? 1 : 0, ptsFor: result.awayScore, ptsAgainst: result.homeScore };
                
                const myBox = isHome ? result.homeBox : result.awayBox;
                const teamStats = myBox.reduce((acc, p) => ({
                    fgm: acc.fgm + p.fgm, fga: acc.fga + p.fga,
                    p3m: acc.p3m + p.p3m, p3a: acc.p3a + p.p3a,
                    rimM: acc.rimM + (p.rimM || 0), rimA: acc.rimA + (p.rimA || 0),
                    midM: acc.midM + (p.midM || 0), midA: acc.midA + (p.midA || 0),
                    tov: acc.tov + p.tov,
                }), { fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, tov: 0 });

                const oppBox = isHome ? result.awayBox : result.homeBox;
                const oppStats = oppBox.reduce((acc, p) => ({
                    fgm: acc.fgm + p.fgm, fga: acc.fga + p.fga,
                    p3m: acc.p3m + p.p3m, p3a: acc.p3a + p.p3a,
                    rimM: acc.rimM + (p.rimM || 0), rimA: acc.rimA + (p.rimA || 0),
                    midM: acc.midM + (p.midM || 0), midA: acc.midA + (p.midA || 0),
                    tov: acc.tov + p.tov,
                }), { fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, tov: 0 });

                const updateHistory = (history: TeamTacticHistory, type: 'offense' | 'defense', key: string, stats: typeof teamStats, specificPtsAgainst?: number) => {
                    const record = history[type][key] || { 
                        games: 0, wins: 0, ptsFor: 0, ptsAgainst: 0,
                        fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, tov: 0 
                    };
                    
                    history[type][key] = {
                        games: record.games + 1,
                        wins: record.wins + myResult.wins,
                        ptsFor: record.ptsFor + myResult.ptsFor,
                        ptsAgainst: record.ptsAgainst + (specificPtsAgainst !== undefined ? specificPtsAgainst : myResult.ptsAgainst),
                        fgm: (record.fgm || 0) + stats.fgm,
                        fga: (record.fga || 0) + stats.fga,
                        p3m: (record.p3m || 0) + stats.p3m,
                        p3a: (record.p3a || 0) + stats.p3a,
                        rimM: (record.rimM || 0) + stats.rimM,
                        rimA: (record.rimA || 0) + stats.rimA,
                        midM: (record.midM || 0) + stats.midM,
                        midA: (record.midA || 0) + stats.midA,
                        tov: (record.tov || 0) + stats.tov,
                    };
                };

                const currentHistory = { 
                    offense: { ...updatedTeams[myTeamIdx].tacticHistory?.offense }, 
                    defense: { ...updatedTeams[myTeamIdx].tacticHistory?.defense } 
                };

                updateHistory(currentHistory, 'offense', tactics.offenseTactics[0], teamStats);

                tactics.defenseTactics.forEach(dt => {
                    if (dt === 'AceStopper') {
                        const ace = oppBox.find(p => p.isAceTarget) || oppBox.reduce((max, p) => p.pts > max.pts ? p : max, oppBox[0]);
                        const aceStats = {
                            fgm: ace.fgm, fga: ace.fga,
                            p3m: ace.p3m, p3a: ace.p3a,
                            rimM: ace.rimM || 0, rimA: ace.rimA || 0,
                            midM: ace.midM || 0, midA: ace.midA || 0,
                            tov: ace.tov
                        };
                        updateHistory(currentHistory, 'defense', dt, aceStats, ace.pts);
                    } else {
                        updateHistory(currentHistory, 'defense', dt, oppStats);
                    }
                });

                updatedTeams[myTeamIdx] = { ...updatedTeams[myTeamIdx], tacticHistory: currentHistory };
            }
            // -----------------------------

            const updateRosterStats = (teamIdx: number, boxScore: PlayerBoxScore[], rosterUpdates: RosterUpdate) => {
                const t = updatedTeams[teamIdx];
                t.roster = t.roster.map(p => {
                    const update = rosterUpdates[p.id];
                    const box = boxScore.find(b => b.playerId === p.id);
                    const isPlayoffGame = game.isPlayoff;
                    let newRegularStats = { ...p.stats };
                    
                    if (newRegularStats.rimM === undefined) newRegularStats.rimM = 0;
                    if (newRegularStats.rimA === undefined) newRegularStats.rimA = 0;
                    if (newRegularStats.midM === undefined) newRegularStats.midM = 0;
                    if (newRegularStats.midA === undefined) newRegularStats.midA = 0;

                    let newPlayoffStats = p.playoffStats ? { ...p.playoffStats } : { ...newRegularStats, g:0, gs:0, mp:0, pts:0, reb:0, ast:0, stl:0, blk:0, tov:0, fgm:0, fga:0, p3m:0, p3a:0, ftm:0, fta:0, offReb:0, defReb:0, rimM: 0, rimA: 0, midM: 0, midA: 0 };
                    
                    if (p.playoffStats) {
                         if (newPlayoffStats.rimM === undefined) newPlayoffStats.rimM = 0;
                         if (newPlayoffStats.rimA === undefined) newPlayoffStats.rimA = 0;
                         if (newPlayoffStats.midM === undefined) newPlayoffStats.midM = 0;
                         if (newPlayoffStats.midA === undefined) newPlayoffStats.midA = 0;
                    }

                    const targetStats = isPlayoffGame ? newPlayoffStats : newRegularStats;
                    if (box) {
                        targetStats.g += 1; targetStats.gs += box.gs; targetStats.mp += box.mp; targetStats.pts += box.pts; targetStats.reb += box.reb;
                        targetStats.offReb += box.offReb || 0; targetStats.defReb += box.defReb || 0; targetStats.ast += box.ast; targetStats.stl += box.stl;
                        targetStats.blk += box.blk; targetStats.tov += box.tov; targetStats.fgm += box.fgm; targetStats.fga += box.fga;
                        targetStats.p3m += box.p3m; targetStats.p3a += box.p3a; targetStats.ftm += box.ftm; targetStats.fta += box.fta;
                        targetStats.rimM = (targetStats.rimM || 0) + (box.rimM || 0); 
                        targetStats.rimA = (targetStats.rimA || 0) + (box.rimA || 0);
                        targetStats.midM = (targetStats.midM || 0) + (box.midM || 0); 
                        targetStats.midA = (targetStats.midA || 0) + (box.midA || 0);
                    }
                    return { ...p, stats: newRegularStats, playoffStats: newPlayoffStats, condition: update?.condition ?? p.condition, health: update?.health ?? p.health, injuryType: update?.injuryType ?? p.injuryType, returnDate: update?.returnDate ?? p.returnDate };
                });
            };
            updateRosterStats(homeIdx, result.homeBox, result.rosterUpdates);
            updateRosterStats(awayIdx, result.awayBox, result.rosterUpdates);
            
            const updatedGame: Game = { 
                ...game, 
                played: true, 
                homeScore: result.homeScore, 
                awayScore: result.awayScore, 
                boxScore: { home: result.homeBox, away: result.awayBox },
                tactics: { home: result.homeTactics, away: result.awayTactics } 
            };
            
            const schIdx = updatedSchedule.findIndex(g => g.id === game.id);
            if (schIdx !== -1) { updatedSchedule[schIdx] = updatedGame; }
            allPlayedToday.push(updatedGame);
            
            if (isUserGame) { 
                userGameResultOutput = { ...result, home: updatedTeams[homeIdx], away: updatedTeams[awayIdx], userTactics: tactics, myTeamId }; 
            }
        }
        const currentDateObj = new Date(targetSimDate);
        currentDateObj.setDate(currentDateObj.getDate() + 1);
        const nextDayStr = currentDateObj.toISOString().split('T')[0];
        setTeams(updatedTeams); setSchedule(updatedSchedule); setPlayoffSeries(updatedSeries); setCurrentSimDate(nextDayStr); setNews(updatedNews);
        if (userGameResultOutput) {
            const recap = await generateGameRecapNews(userGameResultOutput);
            setLastGameResult({ ...userGameResultOutput, recap: recap || [], otherGames: allPlayedToday.filter(g => g.homeTeamId !== myTeamId && g.awayTeamId !== myTeamId) });
            setView('GameResult');
        } else { setIsSimulating(false); }
    };

    if (userGameToday) {
        const home = teams.find(t => t.id === userGameToday.homeTeamId)!;
        const away = teams.find(t => t.id === userGameToday.awayTeamId)!;
        const precalculatedUserResult = simulateGame(home, away, myTeamId, tactics);
        
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

  if (authLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200"><Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" /><p className="text-sm font-bold uppercase tracking-widest text-slate-500">Connecting...</p></div>;
  if (!session && !isGuestMode) return <AuthView onGuestLogin={() => setIsGuestMode(true)} />;
  
  if (isDuplicateSession && !isGuestMode) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center"><MonitorX size={64} className="text-red-500 mb-6" /><h2 className="text-3xl font-black text-white mb-4">중복 로그인 감지</h2><button onClick={handleForceLogin} className="px-8 py-4 bg-indigo-600 text-white font-black rounded-xl">여기서 다시 접속</button></div>;
  if (isSessionVerifying) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200"><Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" /></div>;
  if (view === 'TeamSelect') return <TeamSelectView teams={teams} isInitializing={isInitializing} onSelectTeam={handleTeamSelection} onReload={loadBaseData} dataSource={dataSource} />;
  
  const myTeam = teams.find(t => t.id === myTeamId);
  if (view === 'Onboarding') return <OnboardingView team={myTeam!} onComplete={() => setView('Dashboard')} />;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden ko-normal pretendard">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      
      {/* Guest Mode Banner */}
      {isGuestMode && (
          <div className="bg-amber-600/90 text-white text-[10px] font-bold text-center py-1 uppercase tracking-widest relative z-50">
              Offline Guest Mode Active - Cloud Saving Disabled
          </div>
      )}

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
            <button onClick={handleLogout} className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-red-400 rounded-xl flex items-center justify-center gap-2"><LogOut size={14} /> {isGuestMode ? '메인 화면' : '로그아웃'}</button>
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

        {view === 'GameSim' && activeGame && <GameSimulatingView homeTeam={teams.find(t => t.id === activeGame.homeTeamId)!} awayTeam={teams.find(t => t.id === activeGame.awayTeamId)!} userTeamId={myTeamId} finalHomeScore={activeGame.homeScore} finalAwayScore={activeGame.awayScore} onSimulationComplete={() => finalizeSimRef.current?.()} />}
        {view === 'GameResult' && lastGameResult && <GameResultView result={lastGameResult} myTeamId={myTeamId!} teams={teams} onFinish={() => setView('Dashboard')} />}
      </div>

      {tickerGames.length > 0 && (
        <footer className="h-14 bg-slate-900 border-t border-slate-800 flex items-center overflow-hidden relative z-30">
            <div className="flex-shrink-0 bg-indigo-600 px-6 h-full flex items-center gap-4 shadow-[10px_0_30px_rgba(0,0,0,0.5)] z-10 relative">
                <div className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />
                <img src="https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg" className="h-3 md:h-3.5 object-contain brightness-0 invert drop-shadow-sm" alt="ESPN" />
            </div>
            <div className="flex-1 overflow-hidden h-full flex items-center">
                <LiveScoreTicker games={tickerGames} />
            </div>
        </footer>
      )}
    </div>
  );
};

export default App;