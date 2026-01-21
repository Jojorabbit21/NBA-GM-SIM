
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
  const [news, setNews] = useState<string[]>(["NBA 2025-26 시즌 구단 운영 시스템 활성화 완료."]);
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
  
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDbHelp, setShowDbHelp] = useState(false);
  
  const marqueeRef = useRef<HTMLDivElement>(null);
  const [marqueeDuration, setMarqueeDuration] = useState(60);

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
                setToastMessage("저장된 게임을 불러왔습니다. (DB 변경사항은 리셋 후 적용됩니다)");
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
      setNews([welcome, "NBA 2025-26 시즌 구단 운영 시스템 활성화 완료."]);
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
    setNews(["NBA 2025-26 시즌 구단 운영 시스템 활성화 완료."]);
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

  // Fixed handleExecuteSim to resolve reference error and handle simulation flow
  const handleExecuteSim = async (tactics: GameTactics) => {
    const myTeam = teams.find(t => t.id === myTeamId);
    if (!myTeamId || !myTeam) return;

    const nextGame = schedule.find(g => !g.played && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId));
    if (!nextGame) {
      setToastMessage("더 이상 남은 경기 일정이 없습니다.");
      return;
    }

    const homeTeam = teams.find(t => t.id === nextGame.homeTeamId);
    const awayTeam = teams.find(t => t.id === nextGame.awayTeamId);
    if (!homeTeam || !awayTeam) return;

    setActiveGame(nextGame);
    setView('GameSim');

    // Artificial delay for immersive simulation feel
    setTimeout(async () => {
      const result = simulateGame(homeTeam, awayTeam, myTeamId, tactics);
      
      const updatedTeams = teams.map(t => {
        if (t.id === homeTeam.id) {
          return { 
            ...t, 
            wins: t.wins + (result.homeScore > result.awayScore ? 1 : 0),
            losses: t.losses + (result.homeScore < result.awayScore ? 1 : 0)
          };
        }
        if (t.id === awayTeam.id) {
          return { 
            ...t, 
            wins: t.wins + (result.awayScore > result.homeScore ? 1 : 0),
            losses: t.losses + (result.awayScore < result.homeScore ? 1 : 0)
          };
        }
        return t;
      });

      const updatedSchedule = schedule.map(g => {
        if (g.id === nextGame.id) {
          return { 
            ...g, 
            played: true, 
            homeScore: result.homeScore, 
            awayScore: result.awayScore,
            boxScore: { home: result.homeBox, away: result.awayBox }
          };
        }
        return g;
      });

      const finalTeams = updatedTeams.map(t => ({
          ...t,
          roster: t.roster.map(p => {
              const update = result.rosterUpdates[p.id];
              const box = [...result.homeBox, ...result.awayBox].find(b => b.playerId === p.id);
              
              const newStats = { ...p.stats };
              if (box) {
                  newStats.g += 1;
                  newStats.gs += box.gs;
                  newStats.mp += box.mp;
                  newStats.pts += box.pts;
                  newStats.reb += box.reb;
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
          })
      }));

      setTeams(finalTeams);
      setSchedule(updatedSchedule);

      const recap = await generateGameRecapNews({
          home: homeTeam,
          away: awayTeam,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          homeBox: result.homeBox,
          awayBox: result.awayBox,
          userTactics: tactics,
          myTeamId: myTeamId
      });

      setLastGameResult({
        ...result,
        home: homeTeam,
        away: awayTeam,
        userTactics: tactics,
        myTeamId,
        recap: recap || []
      });

      setView('GameResult');
    }, 3000);
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
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden ko-normal pretendard">
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
        <nav className="flex-1 p-6 space-y-3">
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
          {view === 'Dashboard' && myTeam && <DashboardView team={myTeam} teams={teams} schedule={schedule} onSim={handleExecuteSim} tactics={userTactics} onUpdateTactics={setUserTactics} />}
          {view === 'Roster' && <RosterView allTeams={teams} myTeamId={myTeamId!} initialTeamId={rosterTargetId} />}
          {view === 'Standings' && <StandingsView teams={teams} onTeamClick={id => { setRosterTargetId(id); setView('Roster'); }} />}
          {view === 'Leaderboard' && <LeaderboardView teams={teams} />}
          {view === 'Playoffs' && <PlayoffsView teams={teams} schedule={schedule} series={playoffSeries} setSeries={setPlayoffSeries} setSchedule={setSchedule} myTeamId={myTeamId!} />}
          {view === 'Schedule' && <ScheduleView schedule={schedule} teamId={myTeamId!} teams={teams} onExport={handleExport} currentSimDate={currentSimDate} />}
          {view === 'Transactions' && myTeam && <TransactionsView team={myTeam} teams={teams} setTeams={setTeams} addNews={n => setNews(p => [...n, ...p].slice(0, 15))} onShowToast={setToastMessage} currentSimDate={currentSimDate} />}
        </div>
      </main>

      {/* Full-screen simulation overlays based on view state */}
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
            onFinish={() => setView('Dashboard')} 
          />
      )}
    </div>
  );
};

export default App;
