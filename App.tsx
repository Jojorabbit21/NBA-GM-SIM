
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Trophy, Users, Calendar as CalendarIcon, ArrowLeftRight, LayoutDashboard, 
  RefreshCw, Clock, Swords, AlertTriangle, LogOut, Cloud, Loader2
} from 'lucide-react';
import { AppView, Team, Game, PlayerBoxScore, PlayoffSeries } from './types';
import { 
  INITIAL_TEAMS_DATA, getTeamLogoUrl, 
  mapDatabasePlayerToRuntimePlayer, mapDatabaseScheduleToRuntimeGame,
  generateSeasonSchedule, exportScheduleToCSV,
  SEASON_START_DATE, parseCSVToObjects
} from './utils/constants';
import { simulateGame, GameTactics, RosterUpdate } from './services/gameEngine';
import { generateNewsTicker, generateOwnerWelcome } from './services/geminiService';
import { NavItem, Toast } from './components/SharedComponents';
import { TeamSelectView } from './views/TeamSelectView';
import { DashboardView } from './views/DashboardView';
import { RosterView } from './views/RosterView';
import { StandingsView } from './views/StandingsView';
import { ScheduleView } from './views/ScheduleView';
import { TransactionsView } from './views/TransactionsView';
import { PlayoffsView } from './views/PlayoffsView';
import { GameSimulatingView, GameResultView } from './views/GameViews';
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

const App: React.FC = () => {
  // Auth State
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true); // Prevent flash of login screen
  
  // Game State
  const [view, setView] = useState<AppView>('TeamSelect');
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<Game[]>([]);
  const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);
  const [userTactics, setUserTactics] = useState<GameTactics>(DEFAULT_TACTICS);
  const [news, setNews] = useState<string[]>(["NBA 2025-26 시즌 구단 운영 시스템 활성화 완료."]);
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [lastGameResult, setLastGameResult] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [rosterTargetId, setRosterTargetId] = useState<string | null>(null);

  const initialFormattedDate = useMemo(() => {
    return new Date(SEASON_START_DATE).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const [currentSimDate, setCurrentSimDate] = useState<string>(initialFormattedDate);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Cloud Save Indicator
  const [hasWritePermission, setHasWritePermission] = useState(true); // RLS Check
  
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  const marqueeRef = useRef<HTMLDivElement>(null);
  const [marqueeDuration, setMarqueeDuration] = useState(60);

  // [AUTH] Check Session on Mount
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

  // [INIT] Reusable Function to Load Base Roster Data
  const loadBaseData = useCallback(async () => {
    try {
      let combinedPlayers: any[] = [];
      
      // 1. Try Loading from Supabase
      const { data: dbPlayers, error } = await supabase.from('players').select('*');
      
      if (error || !dbPlayers || dbPlayers.length === 0) {
          console.warn("Supabase Roster Load Failed or Empty (Switching to CSV fallback):", error ? JSON.stringify(error, null, 2) : "No data returned");
          
          // 2. Fallback to Local CSVs if Supabase fails
          const rosterFiles = [
              'roster_atlantic.csv', 
              'roster_central.csv', 
              'roster_southeast.csv', 
              'roster_northwest.csv', 
              'roster_pacific.csv', 
              'roster_southwest.csv'
          ];
          
          for (const file of rosterFiles) {
              try {
                  const res = await fetch(`/${file}`);
                  if (res.ok) {
                      const txt = await res.text();
                      const parsed = parseCSVToObjects(txt);
                      combinedPlayers.push(...parsed);
                  } else {
                      console.error(`Failed to fetch ${file}: ${res.status}`);
                  }
              } catch (e) {
                  console.error(`CSV Load Error for ${file}`, e);
              }
          }
      } else {
          combinedPlayers = dbPlayers;
      }

      // Group players by team
      const fullRosterMap: Record<string, any[]> = {};
      
      if (combinedPlayers.length > 0) {
          combinedPlayers.forEach((p: any) => {
              const teamName = p.team || p.Team || p.TEAM; 
              if (!teamName) return;

              const t = INITIAL_TEAMS_DATA.find(it => 
                  it.name === teamName || 
                  `${it.city} ${it.name}` === teamName ||
                  it.name.toLowerCase() === teamName.toLowerCase()
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
    } catch (err) { 
      console.error("Critical Roster Loading Error:", err); 
    }
  }, []);

  // [INIT] Load Static Data on Start
  useEffect(() => {
    loadBaseData();
  }, [loadBaseData]);

  // [AUTO-LOAD] Check for existing save on login and bypass TeamSelect
  useEffect(() => {
    const checkExistingSave = async () => {
        if (!session?.user) return;
        
        // Prevent double loading if already loaded
        if (isDataLoaded) return;

        // Only start loading if teams are initialized
        if (teams.length === 0) return;

        setIsInitializing(true);

        try {
            const { data: saveData, error } = await supabase
                .from('saves')
                .select('team_id, game_data')
                .eq('user_id', session.user.id)
                .maybeSingle();

            if (!error && saveData && saveData.game_data) {
                const gd = saveData.game_data;
                
                // Restore complete game state from cloud
                setMyTeamId(saveData.team_id);
                setTeams(gd.teams); // Restore roster state (injuries, stats, trades)
                setSchedule(gd.schedule); // Restore game results
                setCurrentSimDate(gd.currentSimDate);
                setUserTactics(gd.tactics || DEFAULT_TACTICS);
                setPlayoffSeries(gd.playoffSeries || []);
                setRosterTargetId(saveData.team_id);
                
                // Mark as loaded and switch view directly to Dashboard
                setIsDataLoaded(true);
                setView('Dashboard');
                setToastMessage("저장된 게임을 불러왔습니다.");
                
                const teamData = INITIAL_TEAMS_DATA.find(t => t.id === saveData.team_id);
                if (teamData) {
                   setNews([`[SYSTEM] ${teamData.city} ${teamData.name}의 GM으로 복귀했습니다.`, "NBA 2025-26 시즌 데이터 로드 완료."]);
                }
            }
        } catch (err) {
            console.error("Auto-load failed:", err);
        } finally {
            setIsInitializing(false);
        }
    };

    checkExistingSave();
  }, [session, isDataLoaded, teams]);

  useEffect(() => {
    if (marqueeRef.current) {
      const width = marqueeRef.current.scrollWidth;
      const duration = Math.max(20, width / 50);
      setMarqueeDuration(duration);
    }
  }, [news, view]);

  // [MANUAL TEAM SELECTION] Logic (New Game)
  const handleTeamSelection = useCallback(async (teamId: string) => {
    if (!session?.user) return;
    
    // If we already loaded data (auto-load succeeded), ignore this unless it's a reset
    if (isDataLoaded && myTeamId) {
        setRosterTargetId(teamId);
        return;
    }

    setIsInitializing(true);
    setMyTeamId(teamId);
    setRosterTargetId(teamId);
    setHasWritePermission(true); // Reset permission flag on new game
    
    // Explicitly assume New Game if we are here
    let loadedSchedule: Game[] = [];
    
    // 1. Try Loading Schedule from Supabase
    const { data: dbSchedule, error: schError } = await supabase
        .from('schedule')
        .select('*');
    
    if (!schError && dbSchedule && dbSchedule.length > 0) {
        loadedSchedule = mapDatabaseScheduleToRuntimeGame(dbSchedule);
    } else {
        // 2. Fallback to Local CSV
        console.warn("Supabase Schedule Load Failed (Switching to CSV fallback)", schError);
        try {
            const res = await fetch('/schedule.csv');
            if (res.ok) {
                const txt = await res.text();
                // Map raw objects to format expected by mapDatabaseScheduleToRuntimeGame
                const rawObjs = parseCSVToObjects(txt);
                loadedSchedule = mapDatabaseScheduleToRuntimeGame(rawObjs);
            }
        } catch (e) {
            console.error("Schedule CSV Load Failed", e);
        }
    }

    if (loadedSchedule.length > 0) {
        setSchedule(loadedSchedule);
        setCurrentSimDate(loadedSchedule[0].date);
    } else {
        console.warn("Falling back to random schedule generation");
        setSchedule(generateSeasonSchedule(teamId));
    }

    setUserTactics(DEFAULT_TACTICS);
    setPlayoffSeries([]);

    const teamData = INITIAL_TEAMS_DATA.find(t => t.id === teamId);
    if (teamData) {
      const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
      setNews([welcome, "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료."]);
    }
    
    setIsDataLoaded(true); 
    setIsInitializing(false); 
    setView('Dashboard');
  }, [teams, session, isDataLoaded, myTeamId]);

  // [CLOUD SAVE] Logic (Auto-save)
  useEffect(() => {
    const saveToCloud = async () => {
        if (!isDataLoaded || !myTeamId || !session?.user) return;
        if (!hasWritePermission) return; // Don't try if permission denied

        setIsSaving(true);

        const gameData = {
            teams,
            schedule,
            currentSimDate,
            tactics: userTactics,
            playoffSeries
        };

        const { error } = await supabase
            .from('saves')
            .upsert({ 
                user_id: session.user.id, 
                team_id: myTeamId, 
                game_data: gameData,
                updated_at: new Date()
            }, { onConflict: 'user_id, team_id' });

        if (error) {
            console.error("Cloud Save Failed:", error);
            if (error.code === '42501') {
                setHasWritePermission(false);
                setToastMessage("DB 저장 권한 오류: Supabase SQL Editor에서 RLS 정책을 설정해주세요.");
            } else {
                setToastMessage("클라우드 저장 실패! 네트워크를 확인하세요.");
            }
        }
        setIsSaving(false);
    };

    // Debounce save to avoid too many requests
    const timeoutId = setTimeout(saveToCloud, 2000);
    return () => clearTimeout(timeoutId);

  }, [teams, schedule, myTeamId, isDataLoaded, currentSimDate, userTactics, playoffSeries, session, hasWritePermission]);

  const handleExecuteSim = useCallback((tactics: GameTactics) => {
    // ... [Same Sim Logic] ...
    if (!myTeamId || teams.length === 0) return;

    setUserTactics(tactics);

    const gameToSim = schedule.find(x => !x.played && (x.homeTeamId === myTeamId || x.awayTeamId === myTeamId));
    if (!gameToSim) return;
    
    setActiveGame(gameToSim);
    const targetDate = new Date(gameToSim.date);
    const backgroundGames = schedule.filter(g => !g.played && g.id !== gameToSim.id && new Date(g.date) <= targetDate);

    setView('GameSim');
    
    // --- [INJECTED SIMULATION LOGIC START] ---
    const lastPlayedMap: Record<string, number> = {};
    teams.forEach(t => {
       const played = schedule.filter(g => g.played && (g.homeTeamId === t.id || g.awayTeamId === t.id));
       if (played.length > 0) {
           const lastGame = played.reduce((latest, g) => new Date(g.date).getTime() > new Date(latest.date).getTime() ? g : latest);
           lastPlayedMap[t.id] = new Date(lastGame.date).getTime();
       } else {
           lastPlayedMap[t.id] = new Date(SEASON_START_DATE).getTime() - (3 * 24 * 60 * 60 * 1000); 
       }
    });

    const getRestDaysDynamic = (teamId: string, gameDateStr: string) => {
        const gameTime = new Date(gameDateStr).getTime();
        const lastTime = lastPlayedMap[teamId];
        const diffTime = Math.abs(gameTime - lastTime);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays - 1);
    };

    setTimeout(() => {
        const bgResults: { game: Game, result: any }[] = [];
        backgroundGames.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        backgroundGames.forEach(bgGame => {
            const h = teams.find(t => t.id === bgGame.homeTeamId);
            const a = teams.find(t => t.id === bgGame.awayTeamId);
            if (!h || !a) return;
            const hRest = getRestDaysDynamic(h.id, bgGame.date);
            const aRest = getRestDaysDynamic(a.id, bgGame.date);
            const res = simulateGame(h, a, null, undefined, hRest, aRest);
            bgResults.push({ game: bgGame, result: res });
            const gameTime = new Date(bgGame.date).getTime();
            lastPlayedMap[h.id] = gameTime;
            lastPlayedMap[a.id] = gameTime;
        });

        const home = teams.find(t => t.id === gameToSim.homeTeamId);
        const away = teams.find(t => t.id === gameToSim.awayTeamId);
        
        if (!home || !away) { setView('Dashboard'); return; }

        const homeRest = getRestDaysDynamic(home.id, gameToSim.date);
        const awayRest = getRestDaysDynamic(away.id, gameToSim.date);
        const userResult = simulateGame(home, away, myTeamId, tactics, homeRest, awayRest);
        
        const updatedSchedule = [...schedule];
        const allResults = [...bgResults, { game: gameToSim, result: userResult }];
        const teamUpdates: Record<string, any> = {};
        const rosterConditionUpdates: RosterUpdate = { ...userResult.rosterUpdates };
        
        bgResults.forEach(r => { if (r.result.rosterUpdates) Object.assign(rosterConditionUpdates, r.result.rosterUpdates); });

        const accStats = (teamId: string, win: boolean, box: PlayerBoxScore[]) => {
            if (!teamUpdates[teamId]) teamUpdates[teamId] = { wins: 0, losses: 0, rosterStats: {} };
            if (win) teamUpdates[teamId].wins++; else teamUpdates[teamId].losses++;
            box.forEach(p => {
                if (!teamUpdates[teamId].rosterStats[p.playerId]) teamUpdates[teamId].rosterStats[p.playerId] = [];
                teamUpdates[teamId].rosterStats[p.playerId].push(p);
            });
        };

        allResults.forEach(({ game, result }) => {
            if (!game || !result) return;
            const idx = updatedSchedule.findIndex(g => g.id === game.id);
            if (idx !== -1) {
                updatedSchedule[idx] = {
                    ...game, played: true, homeScore: result.homeScore, awayScore: result.awayScore,
                    boxScore: { home: result.homeBox, away: result.awayBox }
                };
            }
            const homeWin = result.homeScore > result.awayScore;
            accStats(game.homeTeamId, homeWin, result.homeBox);
            accStats(game.awayTeamId, !homeWin, result.awayBox);
            
            if (game.isPlayoff && game.seriesId) {
                setPlayoffSeries(prev => prev.map(s => {
                    if (s.id === game.seriesId) {
                        const winnerId = homeWin ? game.homeTeamId : game.awayTeamId;
                        const hWins = s.higherSeedWins + (winnerId === s.higherSeedId ? 1 : 0);
                        const lWins = s.lowerSeedWins + (winnerId === s.lowerSeedId ? 1 : 0);
                        const targetWins = s.targetWins || 4; 
                        const finished = hWins === targetWins || lWins === targetWins;
                        return { 
                            ...s, higherSeedWins: hWins, lowerSeedWins: lWins, finished, 
                            winnerId: finished ? (hWins === targetWins ? s.higherSeedId : s.lowerSeedId) : undefined 
                        };
                    }
                    return s;
                }));
            }
        });

        const newCurrentDateStr = gameToSim.date;
        const newCurrentDateObj = new Date(newCurrentDateStr);
        const recoveredPlayersNews: string[] = [];
        const injuredPlayersNews: string[] = [];

        setTeams(prevTeams => prevTeams.map(t => {
            let updatedTeam = { ...t };
            const update = teamUpdates[t.id];
            
            let newRoster = updatedTeam.roster.map(p => {
                const condUpdate = rosterConditionUpdates[p.id];
                let pMod = { ...p };
                
                if (condUpdate) {
                    pMod.condition = condUpdate.condition;
                    if (condUpdate.health !== 'Healthy' && p.health === 'Healthy') {
                        pMod.health = condUpdate.health;
                        pMod.injuryType = condUpdate.injuryType;
                        pMod.returnDate = condUpdate.returnDate;
                        if (t.id === myTeamId) injuredPlayersNews.push(`[부상 발생] ${p.name}: ${pMod.injuryType} (${pMod.health === 'Injured' ? '결장' : 'DTD'})`);
                    }
                } else {
                    const daysRest = getRestDaysDynamic(t.id, newCurrentDateStr);
                    if (daysRest >= 1 && pMod.condition < 100) pMod.condition = Math.min(100, pMod.condition + 15);
                }

                if (update && update.rosterStats[p.id]) {
                    const boxes = update.rosterStats[p.id];
                    const addedStats = boxes.reduce((acc: any, box: any) => ({
                        g: acc.g + 1, gs: acc.gs + (box.gs || 0), mp: acc.mp + (box.mp || 0), pts: acc.pts + (box.pts || 0),
                        reb: acc.reb + (box.reb || 0), offReb: acc.offReb + (box.offReb || 0), defReb: acc.defReb + (box.defReb || 0),
                        ast: acc.ast + (box.ast || 0), stl: acc.stl + (box.stl || 0),
                        blk: acc.blk + (box.blk || 0), tov: acc.tov + (box.tov || 0), fgm: acc.fgm + (box.fgm || 0),
                        fga: acc.fga + (box.fga || 0), p3m: acc.p3m + (box.p3m || 0), p3a: acc.p3a + (box.p3a || 0),
                        ftm: acc.ftm + (box.ftm || 0), fta: acc.fta + (box.fta || 0)
                    }), { g:0, gs:0, mp:0, pts:0, reb:0, offReb: 0, defReb: 0, ast:0, stl:0, blk:0, tov:0, fgm:0, fga:0, p3m:0, p3a:0, ftm:0, fta:0 });
                    
                    pMod.stats = {
                        g: (p.stats?.g || 0) + addedStats.g, gs: (p.stats?.gs || 0) + addedStats.gs, mp: (p.stats?.mp || 0) + addedStats.mp,
                        pts: (p.stats?.pts || 0) + addedStats.pts, reb: (p.stats?.reb || 0) + addedStats.reb,
                        offReb: (p.stats?.offReb || 0) + addedStats.offReb, defReb: (p.stats?.defReb || 0) + addedStats.defReb,
                        ast: (p.stats?.ast || 0) + addedStats.ast,
                        stl: (p.stats?.stl || 0) + addedStats.stl, blk: (p.stats?.blk || 0) + addedStats.blk, tov: (p.stats?.tov || 0) + addedStats.tov,
                        fgm: (p.stats?.fgm || 0) + addedStats.fgm, fga: (p.stats?.fga || 0) + addedStats.fga, p3m: (p.stats?.p3m || 0) + addedStats.p3m,
                        p3a: (p.stats?.p3a || 0) + addedStats.p3a, ftm: (p.stats?.ftm || 0) + addedStats.ftm, fta: (p.stats?.fta || 0) + addedStats.fta
                    };
                }
                return pMod;
            });

            if (update) updatedTeam = { ...t, wins: t.wins + update.wins, losses: t.losses + update.losses, roster: newRoster };
            else updatedTeam = { ...t, roster: newRoster };

            const healedRoster = updatedTeam.roster.map(p => {
                if (p.health === 'Injured' && p.returnDate) {
                    const returnDateObj = new Date(p.returnDate);
                    if (newCurrentDateObj >= returnDateObj) {
                        if (t.id === myTeamId) recoveredPlayersNews.push(`[부상 복귀] ${t.name}의 ${p.name}, 부상에서 회복하여 로스터 복귀.`);
                        return { ...p, health: 'Healthy' as const, injuryType: undefined, returnDate: undefined };
                    }
                }
                return p;
            });
            return { ...updatedTeam, roster: healedRoster };
        }));

        if (recoveredPlayersNews.length > 0 || injuredPlayersNews.length > 0) {
            setNews(prev => [...injuredPlayersNews, ...recoveredPlayersNews, ...prev].slice(0, 20));
            if (injuredPlayersNews.length > 0) setToastMessage(injuredPlayersNews[0]);
            else if (recoveredPlayersNews.length > 0) setToastMessage(`${recoveredPlayersNews.length}명의 선수가 부상에서 복귀했습니다.`);
        }

        setSchedule(updatedSchedule);
        setCurrentSimDate(gameToSim.date);
        setLastGameResult({ 
            home, away, homeScore: userResult.homeScore, awayScore: userResult.awayScore, 
            homeBox: userResult.homeBox, awayBox: userResult.awayBox, 
            userTactics: tactics, myTeamId: myTeamId! 
        });
        generateNewsTicker(userResult.homeScore > userResult.awayScore ? home.name : away.name, [`${home.name} vs ${away.name} 경기 종료`]).then(res => setNews(p => [...res, ...p].slice(0, 15)));
        setView('GameResult');
    }, 3000);
    // --- [INJECTED SIMULATION LOGIC END] ---

  }, [schedule, teams, myTeamId, playoffSeries]);

  const onExport = useCallback(() => {
    if (!myTeamId) return;
    const csv = exportScheduleToCSV(schedule, teams);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `NBA_Schedule_${myTeamId}_${currentSimDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToastMessage("일정이 CSV 파일로 저장되었습니다.");
  }, [schedule, teams, myTeamId, currentSimDate]);

  const handleHardReset = async () => {
    if (!session?.user || !myTeamId) return;
    setAuthLoading(true);

    // 1. Delete save from cloud
    const { error } = await supabase
        .from('saves')
        .delete()
        .eq('user_id', session.user.id)
        .eq('team_id', myTeamId);

    if (error) {
        console.error("Hard Reset Failed:", error);
        setToastMessage("초기화 실패. 네트워크를 확인하세요.");
        setAuthLoading(false);
        return;
    }

    // 2. Reset Local State completely
    setMyTeamId(null);
    setSchedule([]);
    setPlayoffSeries([]);
    setUserTactics(DEFAULT_TACTICS);
    setNews(["NBA 2025-26 시즌 구단 운영 시스템 활성화 완료."]);
    setCurrentSimDate(initialFormattedDate);
    setLastGameResult(null);
    setActiveGame(null);
    setIsDataLoaded(false); 
    setHasWritePermission(true);
    
    // 3. Re-load clean base data (to wipe stats/injuries)
    await loadBaseData();

    // 4. Switch View
    setShowResetConfirm(false);
    setAuthLoading(false);
    setView('TeamSelect');
    setToastMessage("데이터가 초기화되었습니다. 새로운 팀을 선택하세요.");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setMyTeamId(null);
    setView('TeamSelect');
  };

  // Auth Loading State
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-200">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
        <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Connecting to Server...</p>
      </div>
    );
  }

  // If not logged in, show Auth View
  if (!session) {
    return <AuthView />;
  }

  if (view === 'TeamSelect') return <TeamSelectView teams={teams} isInitializing={isInitializing} onSelectTeam={handleTeamSelection} />;
  
  if (view === 'GameSim') {
    const h = teams.find(t => t.id === activeGame?.homeTeamId);
    const a = teams.find(t => t.id === activeGame?.awayTeamId);
    if (!h || !a) {
      setView('Dashboard');
      return null;
    }
    return <GameSimulatingView homeTeam={h} awayTeam={a} userTeamId={myTeamId} />;
  }
  
  if (view === 'GameResult' && lastGameResult) return <GameResultView result={lastGameResult} myTeamId={myTeamId!} onFinish={() => setView('Dashboard')} />;

  const myTeam = teams.find(t => t.id === myTeamId);
  const displayDate = new Date(currentSimDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden ko-normal pretendard">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      
      {/* Hard Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-red-500/50 rounded-3xl max-w-md w-full p-8 shadow-2xl relative overflow-hidden ring-1 ring-red-900/50">
               <div className="absolute -right-10 -top-10 w-40 h-40 bg-red-600/20 blur-[50px] rounded-full pointer-events-none"></div>
               <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-red-600/10 blur-[50px] rounded-full pointer-events-none"></div>

               <div className="flex flex-col items-center text-center space-y-6 relative z-10">
                  <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-2 ring-1 ring-red-500/30">
                    <AlertTriangle size={40} className="text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-2xl font-black text-white uppercase oswald tracking-wide">데이터 초기화 경고</h3>
                    <p className="text-slate-300 text-sm font-bold leading-relaxed break-keep">
                      현재 진행 중인 시즌 데이터, 로스터 변경 사항 등 <span className="text-red-400 font-black underline underline-offset-4 decoration-red-500/50">클라우드에 저장된 모든 데이터가 삭제</span>됩니다.
                    </p>
                    <p className="text-slate-500 text-xs font-medium bg-slate-950/50 py-2 px-4 rounded-lg inline-block">
                      이 작업은 절대 되돌릴 수 없습니다.
                    </p>
                  </div>
                  <div className="flex gap-3 w-full mt-2">
                    <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-4 rounded-xl font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors uppercase text-xs tracking-wider">취소</button>
                    <button onClick={handleHardReset} className="flex-1 py-4 rounded-xl font-black text-white bg-red-600 hover:bg-red-500 transition-all shadow-[0_4px_20px_rgba(220,38,38,0.4)] uppercase text-xs tracking-wider active:scale-95">초기화 실행</button>
                  </div>
               </div>
            </div>
        </div>
      )}

      <aside className="w-72 border-r border-slate-800 bg-slate-900/60 flex flex-col shadow-2xl z-20">
        <div className="p-8 border-b border-slate-800">
            <div className="flex items-center gap-4">
                <img src={myTeam?.logo} className="w-12 h-12 object-contain" alt="" />
                <div>
                    <h2 className="font-black text-lg leading-tight ko-tight uppercase oswald">{myTeam?.name || "TEAM NAME"}</h2>
                    <div className="mt-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{myTeam?.wins || 0}W - {myTeam?.losses || 0}L</span>
                    </div>
                </div>
            </div>
        </div>
        <div className="px-8 py-5 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
            <div className="flex items-center gap-3"><Clock className="text-indigo-400" size={16} /><div className="flex flex-col"><span className="text-[10px] font-black uppercase text-slate-500">TODAY</span><span className="text-sm font-bold text-white oswald uppercase">{displayDate}</span></div></div>
            {isSaving && <Cloud size={16} className="text-emerald-500 animate-pulse" />}
        </div>
        <nav className="flex-1 p-6 space-y-3">
            <NavItem active={view === 'Dashboard'} icon={<LayoutDashboard size={20}/>} label="라커룸" onClick={() => setView('Dashboard')} />
            <NavItem active={view === 'Roster'} icon={<Users size={20}/>} label="로스터 & 기록" onClick={() => { setRosterTargetId(myTeamId); setView('Roster'); }} />
            <NavItem active={view === 'Standings'} icon={<Trophy size={20}/>} label="순위표" onClick={() => setView('Standings')} />
            <NavItem active={view === 'Playoffs'} icon={<Swords size={20}/>} label="플레이오프" onClick={() => setView('Playoffs')} />
            <NavItem active={view === 'Schedule'} icon={<CalendarIcon size={20}/>} label="일정" onClick={() => setView('Schedule')} />
            <NavItem active={view === 'Transactions'} icon={<ArrowLeftRight size={20}/>} label="트레이드" onClick={() => setView('Transactions')} />
        </nav>
        <div className="p-6 border-t border-slate-800 space-y-2">
           <button onClick={() => setShowResetConfirm(true)} className="w-full py-2.5 text-xs font-bold uppercase text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all flex items-center justify-center gap-2"><RefreshCw size={14} /> 구단 변경 및 리셋</button>
           <button onClick={handleLogout} className="w-full py-2.5 text-xs font-bold uppercase text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-all flex items-center justify-center gap-2"><LogOut size={14} /> 로그아웃</button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-slate-950/50 relative">
        <div className="h-12 bg-red-950 border-b border-red-800 flex items-center px-6 overflow-hidden shadow-lg z-10">
            <div 
                ref={marqueeRef} 
                className="flex items-center gap-4 whitespace-nowrap animate-marquee"
                style={{ animationDuration: `${marqueeDuration}s` }}
            >
                {[...news, ...news].map((n, i) => (
                    <span key={i} className="flex items-center gap-6 text-[13px] font-bold uppercase text-white/90">
                        <span className="text-red-400 bebas text-lg tracking-widest bg-red-900/40 px-3 rounded">BREAKING</span> {n}
                    </span>
                ))}
            </div>
        </div>
        <div className="p-8 lg:p-12 backdrop-blur-sm">
          {view === 'Dashboard' && myTeam && <DashboardView team={myTeam} teams={teams} schedule={schedule} onSim={handleExecuteSim} tactics={userTactics} onUpdateTactics={setUserTactics} />}
          {view === 'Roster' && <RosterView allTeams={teams} myTeamId={myTeamId!} initialTeamId={rosterTargetId} />}
          {view === 'Standings' && <StandingsView teams={teams} onTeamClick={id => { setRosterTargetId(id); setView('Roster'); }} />}
          {view === 'Playoffs' && <PlayoffsView teams={teams} schedule={schedule} series={playoffSeries} setSeries={setPlayoffSeries} setSchedule={setSchedule} myTeamId={myTeamId!} />}
          {view === 'Schedule' && <ScheduleView schedule={schedule} teamId={myTeamId!} teams={teams} onExport={onExport} currentSimDate={currentSimDate} />}
          {view === 'Transactions' && myTeam && <TransactionsView team={myTeam} teams={teams} setTeams={setTeams} addNews={n => setNews(p => [...n, ...p].slice(0, 15))} onShowToast={setToastMessage} currentSimDate={currentSimDate} />}
        </div>
      </main>
    </div>
  );
};

export default App;
