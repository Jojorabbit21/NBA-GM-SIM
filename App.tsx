
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, Calendar, Trophy, ArrowLeftRight, LogOut, BarChart3 } from 'lucide-react';

import { Team, Game, GameTactics, PlayoffSeries, AppView, NewsItem } from './types';
import { INITIAL_TEAMS_DATA, SEASON_START_DATE, generateSeasonSchedule, exportScheduleToCSV } from './utils/constants';
import { simulateGame, generateAutoTactics } from './services/gameEngine';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import { logEvent, initGA, logPageView } from './services/analytics';

// Views
import { TeamSelectView } from './views/TeamSelectView';
import { DashboardView } from './views/DashboardView';
import { RosterView } from './views/RosterView';
import { ScheduleView } from './views/ScheduleView';
import { StandingsView } from './views/StandingsView';
import { TransactionsView } from './views/TransactionsView';
import { GameSimulatingView, GameResultView } from './views/GameViews';
import { PlayoffsView } from './views/PlayoffsView';
import { OnboardingView } from './views/OnboardingView';
import { AuthView } from './views/AuthView';
import { LeaderboardView } from './views/LeaderboardView';

// Components
import { Toast, NavItem } from './components/SharedComponents';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('Onboarding'); 
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasSelectedTeam, setHasSelectedTeam] = useState(false);
  
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<Game[]>([]);
  const [myTeamId, setMyTeamId] = useState<string>('');
  
  const [currentSimDate, setCurrentSimDate] = useState<string>(SEASON_START_DATE);
  const [isSimulating, setIsSimulating] = useState(false);

  const [tactics, setTactics] = useState<GameTactics>({
    offenseTactics: ['Balance'],
    defenseTactics: ['ManToManPerimeter'],
    sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 3, zoneUsage: 3, rotationFlexibility: 5 },
    starters: { PG: '', SG: '', SF: '', PF: '', C: '' },
    minutesLimits: {}
  });

  const [news, setNews] = useState<NewsItem[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  
  // Game Visualization State
  const [activeGameResult, setActiveGameResult] = useState<any>(null);
  const [showGameSim, setShowGameSim] = useState(false);
  const [showGameResult, setShowGameResult] = useState(false);

  // Playoffs
  const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);

  // Initialization
  const [isInitializing, setIsInitializing] = useState(true);

  // GA Init
  useEffect(() => {
    initGA();
  }, []);

  // Load Data
  useEffect(() => {
    const loadData = async () => {
      setIsInitializing(true);
      try {
        const initialTeams = INITIAL_TEAMS_DATA.map(t => ({
            ...t,
            roster: [],
            wins: 0,
            losses: 0,
            budget: 150,
            salaryCap: 140,
            luxuryTaxLine: 170,
            logo: `https://a.espncdn.com/i/teamlogos/nba/500/${t.id === 'nop' ? 'no' : t.id === 'uta' ? 'utah' : t.id}.png`
        } as Team));
        
        setTeams(initialTeams);
      } catch (e) {
        console.error(e);
      } finally {
        setIsInitializing(false);
      }
    };
    loadData();
  }, []);

  // View tracking
  useEffect(() => {
    logPageView(view);
  }, [view]);

  const handleShowToast = (msg: string) => {
      setToastMsg(msg);
  };

  const handleSelectTeam = async (id: string) => {
      setMyTeamId(id);
      const selectedTeam = teams.find(t => t.id === id);
      if (selectedTeam) {
          setTactics(generateAutoTactics(selectedTeam));
          const sched = generateSeasonSchedule(id);
          setSchedule(sched);
          
          setHasSelectedTeam(true);
          setView('Onboarding'); 
          logEvent('Team', 'Select', id);
      }
  };

  const handleOnboardingComplete = () => {
      setView('Dashboard');
  };

  const handleSimulate = async (currentTactics: GameTactics) => {
    if (isSimulating) return;
    setIsSimulating(true);
    
    const gamesToday = schedule.filter(g => g.date === currentSimDate && !g.played);
    
    if (gamesToday.length === 0) {
        advanceDate();
        setIsSimulating(false);
        handleShowToast("오늘은 예정된 경기가 없습니다. 다음 날로 이동합니다.");
        return;
    }

    const userGameToday = gamesToday.find(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId);
    
    let updatedTeams = [...teams];
    let updatedSchedule = [...schedule];
    let userGameResultData = null;

    for (const game of gamesToday) {
        const homeIdx = updatedTeams.findIndex(t => t.id === game.homeTeamId);
        const awayIdx = updatedTeams.findIndex(t => t.id === game.awayTeamId);
        
        if (homeIdx === -1 || awayIdx === -1) continue;

        const isUserGame = (game.homeTeamId === myTeamId || game.awayTeamId === myTeamId);
        
        const homeTeam = updatedTeams[homeIdx];
        const awayTeam = updatedTeams[awayIdx];
        
        const result = simulateGame(homeTeam, awayTeam, myTeamId, isUserGame ? currentTactics : undefined);
        
        const updateTeamStats = (team: Team, box: any[], score: number, oppScore: number) => {
            const newRoster = team.roster.map(p => {
                const pStats = box.find(b => b.playerId === p.id);
                if (pStats) {
                    p.stats.g += 1;
                    p.stats.gs += pStats.gs;
                    p.stats.mp += pStats.mp;
                    p.stats.pts += pStats.pts;
                    p.stats.reb += pStats.reb;
                    p.stats.offReb += pStats.offReb;
                    p.stats.defReb += pStats.defReb;
                    p.stats.ast += pStats.ast;
                    p.stats.stl += pStats.stl;
                    p.stats.blk += pStats.blk;
                    p.stats.tov += pStats.tov;
                    p.stats.fgm += pStats.fgm;
                    p.stats.fga += pStats.fga;
                    p.stats.p3m += pStats.p3m;
                    p.stats.p3a += pStats.p3a;
                    p.stats.ftm += pStats.ftm;
                    p.stats.fta += pStats.fta;
                }
                
                if (result.rosterUpdates[p.id]) {
                    const update = result.rosterUpdates[p.id];
                    p.condition = update.condition;
                    p.health = update.health;
                    p.injuryType = update.injuryType;
                    p.returnDate = update.returnDate;
                }
                
                return p;
            });
            
            return {
                ...team,
                roster: newRoster,
                wins: team.wins + (score > oppScore ? 1 : 0),
                losses: team.losses + (score < oppScore ? 1 : 0)
            };
        };

        updatedTeams[homeIdx] = updateTeamStats(homeTeam, result.homeBox, result.homeScore, result.awayScore);
        updatedTeams[awayIdx] = updateTeamStats(awayTeam, result.awayBox, result.awayScore, result.homeScore);

        const schIdx = updatedSchedule.findIndex(g => g.id === game.id);
        if (schIdx !== -1) {
            const shouldKeepBoxScore = isUserGame || game.isPlayoff;
            updatedSchedule[schIdx] = {
                ...game,
                played: true,
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                boxScore: shouldKeepBoxScore ? { home: result.homeBox, away: result.awayBox } : undefined
            };
        }

        if (isUserGame) {
            userGameResultData = {
                ...result,
                home: updatedTeams[homeIdx],
                away: updatedTeams[awayIdx],
                userTactics: currentTactics,
                myTeamId
            };
        }
    }

    setTeams(updatedTeams);
    setSchedule(updatedSchedule);

    const scoreNews: NewsItem[] = gamesToday
        .filter(g => !userGameToday || g.id !== userGameToday.id)
        .map(g => {
            const h = updatedTeams.find(t => t.id === g.homeTeamId);
            const a = updatedTeams.find(t => t.id === g.awayTeamId);
            const scheduledGame = updatedSchedule.find(sg => sg.id === g.id);
            if (h && a && scheduledGame && scheduledGame.played) {
                return {
                    type: 'game',
                    home: h,
                    away: a,
                    homeScore: scheduledGame.homeScore,
                    awayScore: scheduledGame.awayScore
                } as NewsItem;
            }
            return null;
        }).filter(Boolean) as NewsItem[];
    
    setNews(prev => [...scoreNews, ...prev].slice(0, 30));

    if (userGameResultData) {
        setActiveGameResult(userGameResultData);
        setShowGameSim(true);
        setTimeout(() => {
            setShowGameSim(false);
            setShowGameResult(true);
            setIsSimulating(false);
        }, 3000);
    } else {
        advanceDate();
        setIsSimulating(false);
        handleShowToast(`${currentSimDate} 일정 시뮬레이션 완료`);
    }
  };

  const advanceDate = () => {
    const d = new Date(currentSimDate);
    d.setDate(d.getDate() + 1);
    const nextDate = d.toISOString().split('T')[0];
    setCurrentSimDate(nextDate);
  };

  const handleGameResultFinish = () => {
      setShowGameResult(false);
      setActiveGameResult(null);
      advanceDate();
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
        return; 
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        setIsAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!isAuthenticated && isSupabaseConfigured) {
      return <AuthView />;
  }

  if (!hasSelectedTeam) {
      return (
        <TeamSelectView 
            teams={teams} 
            isInitializing={isInitializing} 
            onSelectTeam={handleSelectTeam} 
            onReload={async () => {
                setIsInitializing(true);
                setTimeout(() => setIsInitializing(false), 1000);
            }} 
        />
      );
  }

  if (view === 'Onboarding') {
      const myTeam = teams.find(t => t.id === myTeamId);
      if (!myTeam) return <div>Error loading team</div>;
      return <OnboardingView team={myTeam} onComplete={handleOnboardingComplete} />;
  }

  const myTeam = teams.find(t => t.id === myTeamId);
  if (!myTeam) return <div>Loading...</div>;

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 font-sans overflow-hidden">
        {showGameSim && activeGameResult && (
            <GameSimulatingView 
                homeTeam={activeGameResult.home} 
                awayTeam={activeGameResult.away} 
                userTeamId={myTeamId} 
            />
        )}
        
        {showGameResult && activeGameResult && (
            <GameResultView 
                result={{...activeGameResult, otherGames: schedule.filter(g => g.date === currentSimDate && g.played && (g.homeTeamId !== activeGameResult.home.id && g.awayTeamId !== activeGameResult.home.id))}}
                myTeamId={myTeamId}
                teams={teams}
                onFinish={handleGameResultFinish}
            />
        )}

        <nav className="w-20 lg:w-64 bg-slate-900 border-r border-slate-800 flex flex-col items-center lg:items-stretch py-6 gap-2 z-50">
            <div className="px-4 mb-6 flex items-center justify-center lg:justify-start gap-3">
                <img src={myTeam.logo} className="w-10 h-10 object-contain drop-shadow-lg" alt="" />
                <div className="hidden lg:block">
                    <h1 className="font-black text-xl leading-none uppercase oswald tracking-tight">{myTeam.name}</h1>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">GM Mode</p>
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-1 px-2 w-full">
                <NavItem active={view === 'Dashboard'} icon={<LayoutDashboard size={20} />} label="대시보드" onClick={() => setView('Dashboard')} />
                <NavItem active={view === 'Roster'} icon={<Users size={20} />} label="로스터" onClick={() => setView('Roster')} />
                <NavItem active={view === 'Schedule'} icon={<Calendar size={20} />} label="일정" onClick={() => setView('Schedule')} />
                <NavItem active={view === 'Standings'} icon={<Trophy size={20} />} label="순위" onClick={() => setView('Standings')} />
                <NavItem active={view === 'Leaderboard'} icon={<BarChart3 size={20} />} label="리그 리더보드" onClick={() => setView('Leaderboard')} />
                <NavItem active={view === 'Transactions'} icon={<ArrowLeftRight size={20} />} label="트레이드" onClick={() => setView('Transactions')} />
            </div>

            <div className="px-2 mt-auto">
                <button onClick={() => {
                    if (isSupabaseConfigured) supabase.auth.signOut();
                    window.location.reload();
                }} className="w-full flex items-center gap-4 px-5 py-4 text-slate-500 hover:text-red-400 hover:bg-slate-800/50 rounded-2xl transition-all">
                    <LogOut size={20} />
                    <span className="hidden lg:inline text-sm font-bold">로그아웃</span>
                </button>
            </div>
        </nav>

        <main className="flex-1 overflow-hidden relative flex flex-col">
            <header className="h-16 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between px-8 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="text-xl font-black text-white uppercase oswald tracking-wide">{currentSimDate}</div>
                    <div className="h-4 w-[1px] bg-slate-700"></div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{view}</div>
                </div>
                
                <div className="hidden md:flex items-center gap-4 overflow-hidden max-w-xl mask-linear-fade">
                    <div className="flex gap-8 animate-ticker whitespace-nowrap">
                        {news.length > 0 ? news.slice(0, 5).map((n, i) => (
                            <span key={i} className="text-xs font-bold text-slate-400 flex items-center gap-2">
                                {n.type === 'game' ? (
                                    <>
                                        <span className="text-slate-500">FINAL:</span> 
                                        {n.away?.name} <span className="text-white">{n.awayScore}</span> - <span className="text-white">{n.homeScore}</span> {n.home?.name}
                                    </>
                                ) : (
                                    <span>{n.text}</span>
                                )}
                            </span>
                        )) : (
                            <span className="text-xs text-slate-600">No news available...</span>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-auto custom-scrollbar p-6 bg-slate-950">
                {view === 'Dashboard' && (
                    <DashboardView 
                        team={myTeam} 
                        teams={teams}
                        schedule={schedule}
                        onSim={handleSimulate}
                        tactics={tactics}
                        onUpdateTactics={setTactics}
                        currentSimDate={currentSimDate}
                        isSimulating={isSimulating}
                    />
                )}
                {view === 'Roster' && (
                    <RosterView 
                        allTeams={teams} 
                        myTeamId={myTeamId} 
                    />
                )}
                {view === 'Schedule' && (
                    <ScheduleView 
                        schedule={schedule}
                        teamId={myTeamId}
                        teams={teams}
                        currentSimDate={currentSimDate}
                        onExport={() => {
                            const csv = exportScheduleToCSV(schedule, teams);
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'season_schedule.csv';
                            a.click();
                        }}
                    />
                )}
                {view === 'Standings' && (
                    <StandingsView 
                        teams={teams} 
                        onTeamClick={(id) => {
                             handleShowToast(`팀 선택: ${id} (로스터 뷰에서 확인하세요)`);
                        }}
                    />
                )}
                {view === 'Transactions' && (
                    <TransactionsView 
                        team={myTeam}
                        teams={teams}
                        setTeams={setTeams}
                        addNews={(items) => setNews(prev => [...items.map(t => ({ type: 'text', text: t } as NewsItem)), ...prev])}
                        onShowToast={handleShowToast}
                        currentSimDate={currentSimDate}
                    />
                )}
                {view === 'Playoffs' && (
                    <PlayoffsView 
                        teams={teams}
                        schedule={schedule}
                        series={playoffSeries}
                        setSeries={setPlayoffSeries}
                        setSchedule={(newGames) => setSchedule([...schedule, ...newGames])}
                        myTeamId={myTeamId}
                    />
                )}
                {view === 'Leaderboard' && (
                    <LeaderboardView teams={teams} />
                )}
            </div>
        </main>

        {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  );
};

export default App;
