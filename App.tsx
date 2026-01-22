
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Trophy, Users, Calendar as CalendarIcon, ArrowLeftRight, LayoutDashboard, 
  RefreshCw, Clock, Swords, AlertTriangle, LogOut, Cloud, Loader2, Database, Copy, Check, X, BarChart3
} from 'lucide-react';
import { AppView, Team, Game, PlayerBoxScore, PlayoffSeries } from './types';
import { 
  INITIAL_TEAMS_DATA, getTeamLogoUrl, 
  mapDatabasePlayerToRuntimePlayer, mapDatabaseScheduleToRuntimeGame,
  generateSeasonSchedule, exportScheduleToCSV,
  SEASON_START_DATE, parseCSVToObjects
} from './utils/constants';
import { simulateGame, GameTactics, RosterUpdate } from './services/gameEngine';
// Import generateGameRecapNews to fix missing import
import { generateNewsTicker, generateOwnerWelcome, generateGameRecapNews } from './services/geminiService';
import { initGA, logPageView } from './services/analytics'; // Analytics Import
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

// SQL Setup Helper Component
const DbSetupHelpModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [copied, setCopied] = useState(false);
    
    const sqlScript = `-- 1. saves 테이블 (게임 저장) 생성 및 RLS 설정
create table if not exists public.saves (
  user_id uuid references auth.users not null,
  team_id text not null,
  game_data jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, team_id)
);

alter table public.saves enable row level security;

drop policy if exists "Users can all on own saves" on public.saves;
create policy "Users can all on own saves" on public.saves for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. profiles 테이블 (회원가입/닉네임) 생성 및 RLS 설정
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  nickname text
);

alter table public.profiles enable row level security;

drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users can read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id);

-- 3. (권장) 회원가입 시 프로필 자동 생성 트리거
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, nickname)
  values (new.id, new.email, new.raw_user_meta_data->>'nickname')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();`;

    const handleCopy = () => {
        navigator.clipboard.writeText(sqlScript);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-in fade-in duration-200 ko-normal">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl p-8 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-start mb-6">
                    <div className="space-y-1">
                        <h3 className="text-2xl font-black text-white uppercase flex items-center gap-3">
                            <Database className="text-indigo-500" /> 데이터베이스 설정 필요
                        </h3>
                        <p className="text-slate-400 text-sm font-bold">
                            Supabase SQL Editor에서 아래 스크립트를 실행하여 테이블 및 권한을 설정하세요.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-y-auto custom-scrollbar relative group">
                    <pre className="text-[11px] md:text-xs font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
                        {sqlScript}
                    </pre>
                    <button 
                        onClick={handleCopy}
                        className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg shadow-lg border border-slate-700 transition-all flex items-center gap-2"
                    >
                        {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                        <span className="text-xs font-bold">{copied ? '복사됨!' : 'SQL 복사'}</span>
                    </button>
                </div>

                <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl uppercase tracking-widest text-xs transition-all shadow-lg">
                        확인 완료
                    </button>
                </div>
            </div>
        </div>
    );
};

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
  const [showDbHelp, setShowDbHelp] = useState(false);
  
  // Ticker State
  const tickerContainerRef = useRef<HTMLDivElement>(null);
  const tickerContentRef = useRef<HTMLDivElement>(null);
  const [isTickerScroll, setIsTickerScroll] = useState(false);

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

  // [INIT] Reusable Function to Load Base Roster Data
  const loadBaseData = useCallback(async () => {
    try {
      let combinedPlayers: any[] = [];
      let source: 'DB' | 'CSV' = 'DB';
      
      // 1. Try Loading from Supabase (Fresh check of the players table)
      const { data: dbPlayers, error } = await supabase.from('players').select('*');
      
      if (error || !dbPlayers || dbPlayers.length === 0) {
          console.warn("Supabase Load Failed, using fallback CSVs.");
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
              } catch (e) { console.error(`CSV Load Error for ${file}`, e); }
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
    } catch (err) { 
      console.error("Critical Roster Loading Error:", err); 
    }
  }, []);

  useEffect(() => {
    loadBaseData();
  }, [loadBaseData]);

  // [AUTO-LOAD]
  useEffect(() => {
    const checkExistingSave = async () => {
        if (!session?.user || isDataLoaded || teams.length === 0) return;
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
                setRosterTargetId(saveData.team_id);
                setIsDataLoaded(true);
                setView('Dashboard');
                setToastMessage("저장된 게임을 불러왔습니다.");
                setHasWritePermission(true);
            }
        } catch (err) { console.error("Auto-load failed:", err); } 
        finally { setIsInitializing(false); }
    };
    checkExistingSave();
  }, [session, isDataLoaded, teams]);

  const handleTeamSelection = useCallback(async (teamId: string) => {
    if (!session?.user) return;
    if (isDataLoaded && myTeamId) { setRosterTargetId(teamId); return; }

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
    } catch (e) { console.error("Schedule Fetch Exception:", e); }
    
    if (allScheduleRows.length > 0) loadedSchedule = mapDatabaseScheduleToRuntimeGame(allScheduleRows);
    else {
        try {
            const res = await fetch('/schedule.csv');
            if (res.ok) {
                const txt = await res.text();
                loadedSchedule = mapDatabaseScheduleToRuntimeGame(parseCSVToObjects(txt));
            }
        } catch (e) { console.error("Schedule CSV Fallback Failed", e); }
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
        if (!isDataLoaded || !myTeamId || !session?.user || !hasWritePermission) return;
        setIsSaving(true);
        const { error } = await supabase.from('saves').upsert({ 
            user_id: session.user.id, 
            team_id: myTeamId, 
            game_data: { teams, schedule, currentSimDate, tactics: userTactics, playoffSeries },
            updated_at: new Date()
        }, { onConflict: 'user_id, team_id' });
        if (error) {
            if (error.code === '42501' || error.code === '42P01') setHasWritePermission(false);
            setToastMessage("클라우드 저장 실패! 네트워크 상태를 확인하세요.");
        }
        setIsSaving(false);
  }, [teams, schedule, myTeamId, isDataLoaded, currentSimDate, userTactics, playoffSeries, session, hasWritePermission]);

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
        setAuthLoading(false);
        return;
    }
    setMyTeamId(null); setSchedule([]); setPlayoffSeries([]); setUserTactics(DEFAULT_TACTICS);
    setNews([{ type: 'text', content: "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료." }]);
    setCurrentSimDate(SEASON_START_DATE);
    setLastGameResult(null); setActiveGame(null); setIsDataLoaded(false); 
    
    // 🔥 중요: 리셋 시 최신 DB 데이터를 다시 불러옴
    await loadBaseData();

    setShowResetConfirm(false); setAuthLoading(false); setView('TeamSelect');
    setToastMessage("데이터가 초기화되었습니다. DB의 최신 정보를 불러왔습니다.");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null); setMyTeamId(null); setSchedule([]); setPlayoffSeries([]); 
    setIsDataLoaded(false); setView('TeamSelect');
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
                  
                  const newStats = { ...p.stats };
                  if (box) {
                      newStats.g += 1;
                      newStats.gs += box.gs;
                      newStats.mp += box.mp;
                      newStats.pts += box.pts;
                      newStats.reb += box.reb;
                      newStats.offReb += box.offReb || 0;
                      newStats.defReb += box.defReb || 0;
                      newStats.ast += box.ast;
                      newStats.stl += box.stl;
                      newStats.blk += box.blk;
                      newStats.tov += box.tov;
                      newStats.fgm += box.fgm;
                      newStats.fga += box.fga;
                      newStats.p3m += box.p3m;
                      newStats.p3a += box.p3a;
                      newStats.ftm += box.ftm;
                      newStats.fta += box.fta;
                  }

                  return {
                      ...p,
                      stats: newStats,
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
          setNews(prev => [...scoreNews, ...prev].slice(0, 30));
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
  if (view === 'TeamSelect') return <TeamSelectView teams={teams} isInitializing={isInitializing} onSelectTeam={handleTeamSelection} onReload={loadBaseData} dataSource={dataSource} />;
  
  const myTeam = teams.find(t => t.id === myTeamId);

  if (view === 'Onboarding') return <OnboardingView team={myTeam!} onComplete={() => setView('Dashboard')} />;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden ko-normal pretendard">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      {showDbHelp && <DbSetupHelpModal onClose={() => setShowDbHelp(false)} />}

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
                    {!hasWritePermission && <button onClick={() => setShowDbHelp(true)}><Database size={16} className="text-red-500" /></button>}
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
                />
            )}
            {view === 'Roster' && <RosterView allTeams={teams} myTeamId={myTeamId!} initialTeamId={rosterTargetId} />}
            {view === 'Standings' && <StandingsView teams={teams} onTeamClick={id => { setRosterTargetId(id); setView('Roster'); }} />}
            {view === 'Leaderboard' && <LeaderboardView teams={teams} />}
            {view === 'Playoffs' && <PlayoffsView teams={teams} schedule={schedule} series={playoffSeries} setSeries={setPlayoffSeries} setSchedule={setSchedule} myTeamId={myTeamId!} />}
            {view === 'Schedule' && <ScheduleView schedule={schedule} teamId={myTeamId!} teams={teams} onExport={handleExport} currentSimDate={currentSimDate} />}
            {view === 'Transactions' && myTeam && <TransactionsView team={myTeam} teams={teams} setTeams={setTeams} addNews={n => setNews(p => [...n.map(txt => ({ type: 'text', content: txt } as NewsItem)), ...p].slice(0, 15))} onShowToast={setToastMessage} currentSimDate={currentSimDate} />}
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
                                        <img src={n.away.logo} className="w-7 h-7 object-contain drop-shadow-md" alt={n.away.name} title={n.away.name} />
                                    </div>
                                    <div className="flex items-center gap-2 px-2 border-x border-slate-700/50">
                                        <span className={`text-xs font-black font-mono ${n.awayScore > n.homeScore ? 'text-emerald-400' : 'text-slate-200'}`}>{n.awayScore}</span>
                                        <span className="text-[9px] font-bold text-slate-500">-</span>
                                        <span className={`text-xs font-black font-mono ${n.homeScore > n.awayScore ? 'text-emerald-400' : 'text-slate-200'}`}>{n.homeScore}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <img src={n.home.logo} className="w-7 h-7 object-contain drop-shadow-md" alt={n.home.name} title={n.home.name} />
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
