
import React, { useState, useEffect, useCallback } from 'react';
import { Team, Game, PlayoffSeries, Player } from './types';
import { INITIAL_TEAMS_DATA, generateSeasonSchedule, parseRostersCSV, SEASON_START_DATE } from './utils/constants';
import { simulateGame, GameTactics, generateAutoTactics } from './services/gameEngine';
import { TeamSelectView } from './views/TeamSelectView';
import { DashboardView } from './views/DashboardView';
import { RosterView } from './views/RosterView';
import { StandingsView } from './views/StandingsView';
import { ScheduleView } from './views/ScheduleView';
import { TransactionsView } from './views/TransactionsView';
import { GameSimulatingView, GameResultView } from './views/GameViews';
import { PlayoffsView } from './views/PlayoffsView';
import { AuthView } from './views/AuthView';
import { OnboardingView } from './views/OnboardingView';
import { LeaderboardView } from './views/LeaderboardView';
import { Toast, NavItem } from './components/SharedComponents';
import { LayoutDashboard, Users, Trophy, Calendar, Briefcase, LogOut, BarChart2 } from 'lucide-react';
import { initGA, logPageView } from './services/analytics';
import { generateGameRecapNews } from './services/geminiService';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';

export interface NewsItem {
  type: 'game' | 'text';
  home?: Team;
  away?: Team;
  homeScore?: number;
  awayScore?: number;
  text?: string;
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState('Auth');
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<Game[]>([]);
  const [myTeamId, setMyTeamId] = useState<string>('');
  const [currentDate, setCurrentDate] = useState(SEASON_START_DATE);
  const [tactics, setTactics] = useState<GameTactics>({
      offenseTactics: ['Balance'],
      defenseTactics: ['ManToManPerimeter'],
      sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 3, zoneUsage: 3, rotationFlexibility: 5 },
      starters: { PG: '', SG: '', SF: '', PF: '', C: '' },
      minutesLimits: {}
  });
  const [isSimulating, setIsSimulating] = useState(false);
  const [gameResult, setGameResult] = useState<any>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);
  const [initializing, setInitializing] = useState(false);

  useEffect(() => {
      initGA();
      const checkSession = async () => {
          if (isSupabaseConfigured) {
            const { data } = await supabase.auth.getSession();
            if (data.session) {
                setUser(data.session.user);
                setView('TeamSelect'); 
            }
          }
      };
      checkSession();
  }, []);

  const loadData = useCallback(async () => {
      setInitializing(true);
      try {
          // Attempt to load from CSV
          const response = await fetch('/rosters.csv');
          if (response.ok) {
              const csvText = await response.text();
              const rosterMap = parseRostersCSV(csvText);
              
              const loadedTeams = INITIAL_TEAMS_DATA.map(t => ({
                  ...t,
                  logo: `https://a.espncdn.com/i/teamlogos/nba/500/${t.id === 'nop' ? 'no' : t.id === 'uta' ? 'utah' : t.id}.png`,
                  wins: 0,
                  losses: 0,
                  budget: 135,
                  salaryCap: 140.5,
                  luxuryTaxLine: 170,
                  roster: rosterMap[t.id] || []
              }));
              setTeams(loadedTeams);
          } else {
              // Fallback if no CSV found
              const loadedTeams = INITIAL_TEAMS_DATA.map(t => ({
                  ...t,
                  logo: `https://a.espncdn.com/i/teamlogos/nba/500/${t.id === 'nop' ? 'no' : t.id === 'uta' ? 'utah' : t.id}.png`,
                  wins: 0,
                  losses: 0,
                  budget: 135,
                  salaryCap: 140.5,
                  luxuryTaxLine: 170,
                  roster: [] // Empty roster fallback
              }));
              setTeams(loadedTeams);
          }
      } catch (e) {
          console.error("Failed to load data", e);
      } finally {
          setInitializing(false);
      }
  }, []);

  useEffect(() => {
      if (view === 'TeamSelect' && teams.length === 0) {
          loadData();
      }
  }, [view, teams.length, loadData]);

  const handleSelectTeam = (id: string) => {
      setMyTeamId(id);
      const myTeam = teams.find(t => t.id === id);
      if (myTeam) {
          const auto = generateAutoTactics(myTeam);
          setTactics(auto);
          const sched = generateSeasonSchedule(id);
          setSchedule(sched);
          setView('Onboarding');
      }
  };

  const handleSimulate = async (userTactics: GameTactics) => {
      if (isSimulating) return;
      setIsSimulating(true);

      // Simulation Logic
      const targetSimDate = currentDate;
      const gamesToday = schedule.filter(g => g.date === targetSimDate && !g.played);
      
      let updatedSchedule = [...schedule];
      let updatedTeams = [...teams];
      let userGameResultData = null;
      let userGameToday: Game | undefined = undefined;

      // Process each game for today
      for (const game of gamesToday) {
          const isUserGame = game.homeTeamId === myTeamId || game.awayTeamId === myTeamId;
          if (isUserGame) userGameToday = game;

          const homeIdx = updatedTeams.findIndex(t => t.id === game.homeTeamId);
          const awayIdx = updatedTeams.findIndex(t => t.id === game.awayTeamId);

          if (homeIdx === -1 || awayIdx === -1) continue;

          // Simulate Game
          const result = simulateGame(
              updatedTeams[homeIdx], 
              updatedTeams[awayIdx], 
              myTeamId, 
              isUserGame ? userTactics : undefined
          );

          // Update Teams (Stats & Roster Condition)
          const updateTeamStats = (teamIdx: number, box: any[], updates: any, pointsFor: number, pointsAgainst: number) => {
              const team = updatedTeams[teamIdx];
              const isWinner = pointsFor > pointsAgainst;
              
              const newRoster = team.roster.map(p => {
                  const pBox = box.find((b: any) => b.playerId === p.id);
                  const pUpdate = updates[p.id];
                  
                  let newStats = { ...p.stats };
                  if (pBox) {
                      newStats.g += 1;
                      newStats.gs += pBox.gs;
                      newStats.mp += pBox.mp;
                      newStats.pts += pBox.pts;
                      newStats.reb += pBox.reb;
                      newStats.offReb += pBox.offReb;
                      newStats.defReb += pBox.defReb;
                      newStats.ast += pBox.ast;
                      newStats.stl += pBox.stl;
                      newStats.blk += pBox.blk;
                      newStats.tov += pBox.tov;
                      newStats.fgm += pBox.fgm;
                      newStats.fga += pBox.fga;
                      newStats.p3m += pBox.p3m;
                      newStats.p3a += pBox.p3a;
                      newStats.ftm += pBox.ftm;
                      newStats.fta += pBox.fta;
                  }

                  return {
                      ...p,
                      stats: newStats,
                      condition: pUpdate ? pUpdate.condition : p.condition,
                      health: pUpdate ? pUpdate.health : p.health,
                      injuryType: pUpdate ? pUpdate.injuryType : p.injuryType,
                      returnDate: pUpdate ? pUpdate.returnDate : p.returnDate
                  };
              });

              updatedTeams[teamIdx] = {
                  ...team,
                  wins: team.wins + (isWinner ? 1 : 0),
                  losses: team.losses + (isWinner ? 0 : 1),
                  roster: newRoster
              };
          };

          updateTeamStats(homeIdx, result.homeBox, result.rosterUpdates, result.homeScore, result.awayScore);
          updateTeamStats(awayIdx, result.awayBox, result.rosterUpdates, result.awayScore, result.homeScore);

          // Update Schedule (Mark as played)
          const schIdx = updatedSchedule.findIndex(g => g.id === game.id);
          if (schIdx !== -1) {
              // [MEMORY OPTIMIZATION]
              // Do not store full box scores for AI-vs-AI games in the global schedule state.
              // Stats are already aggregated into the Team/Player objects.
              // Only keep box scores for the User's games or Playoffs for detailed viewing.
              const shouldKeepBoxScore = isUserGame || game.isPlayoff;

              updatedSchedule[schIdx] = {
                  ...game,
                  played: true,
                  homeScore: result.homeScore,
                  awayScore: result.awayScore,
                  boxScore: shouldKeepBoxScore ? { home: result.homeBox, away: result.awayBox } : undefined
              };
          }

          // Capture User Game Result
          if (isUserGame) {
              userGameResultData = {
                  ...result,
                  home: updatedTeams[homeIdx], // Use updated state
                  away: updatedTeams[awayIdx],
                  userTactics: userTactics,
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

      // Update News State (Memory Optimization: Limit history to 30 items)
      if (scoreNews.length > 0) {
          setNews(prev => {
              const filteredPrev = prev.filter(item => item.type === 'text'); // Keep text news
              return [...scoreNews, ...filteredPrev].slice(0, 30);
          });
      }

      // If user game happened, generate recap and show result
      if (userGameResultData) {
          const recap = await generateGameRecapNews(userGameResultData);
          setGameResult({ ...userGameResultData, recap, otherGames });
      }

      // 5. Advance Date (Move to the next day)
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 1);
      const nextDate = d.toISOString().split('T')[0];
      
      setTeams(updatedTeams);
      setSchedule(updatedSchedule);
      setCurrentDate(nextDate);
      setIsSimulating(false);
  };

  const NavButton = ({ active, icon, label, onClick }: any) => (
      <NavItem active={active} icon={icon} label={label} onClick={onClick} />
  );

  const renderContent = () => {
    const myTeam = teams.find(t => t.id === myTeamId);
    if (!myTeam && view !== 'Auth' && view !== 'TeamSelect') return <div>Loading...</div>;

    switch (view) {
        case 'Auth': return <AuthView />;
        case 'TeamSelect': return <TeamSelectView teams={teams} isInitializing={initializing} onSelectTeam={handleSelectTeam} onReload={loadData} />;
        case 'Onboarding': return myTeam ? <OnboardingView team={myTeam} onComplete={() => setView('Dashboard')} /> : null;
        case 'Dashboard': return myTeam ? <DashboardView team={myTeam} teams={teams} schedule={schedule} onSim={handleSimulate} tactics={tactics} onUpdateTactics={setTactics} currentSimDate={currentDate} isSimulating={isSimulating} /> : null;
        case 'Roster': return myTeam ? <RosterView allTeams={teams} myTeamId={myTeamId} /> : null;
        case 'Schedule': return myTeam ? <ScheduleView schedule={schedule} teamId={myTeamId} teams={teams} onExport={() => {}} currentSimDate={currentDate} /> : null;
        case 'Standings': return <StandingsView teams={teams} onTeamClick={(id) => { setView('Roster'); }} />;
        case 'Transactions': return myTeam ? <TransactionsView team={myTeam} teams={teams} setTeams={setTeams} addNews={(n) => setNews(prev => [...n.map(txt => ({ type: 'text', text: txt } as NewsItem)), ...prev])} onShowToast={setToastMsg} currentSimDate={currentDate} /> : null;
        case 'Playoffs': return <PlayoffsView teams={teams} schedule={schedule} series={playoffSeries} setSeries={setPlayoffSeries} setSchedule={setSchedule} myTeamId={myTeamId} />;
        case 'Leaderboard': return <LeaderboardView teams={teams} />;
        default: return null;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
      
      {/* Game Result Modal */}
      {gameResult && (
        <GameResultView 
            result={gameResult} 
            myTeamId={myTeamId} 
            teams={teams} 
            onFinish={() => setGameResult(null)} 
        />
      )}

      {/* Main Layout */}
      {(view !== 'Auth' && view !== 'TeamSelect' && view !== 'Onboarding') && (
        <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 border-r border-slate-800 flex-shrink-0 flex flex-col hidden lg:flex">
                <div className="p-6 border-b border-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        <Trophy className="text-white" size={20} />
                    </div>
                    <div>
                        <h1 className="font-black text-xl italic tracking-tighter text-white">NBA GM</h1>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Simulation 2026</p>
                    </div>
                </div>
                
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <NavButton active={view === 'Dashboard'} icon={<LayoutDashboard size={20} />} label="대시보드" onClick={() => { setView('Dashboard'); logPageView('Dashboard'); }} />
                    <NavButton active={view === 'Roster'} icon={<Users size={20} />} label="로스터 & 분석" onClick={() => { setView('Roster'); logPageView('Roster'); }} />
                    <NavButton active={view === 'Transactions'} icon={<Briefcase size={20} />} label="트레이드 센터" onClick={() => { setView('Transactions'); logPageView('Transactions'); }} />
                    <div className="pt-4 pb-2 px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest">League Data</div>
                    <NavButton active={view === 'Schedule'} icon={<Calendar size={20} />} label="일정 및 결과" onClick={() => { setView('Schedule'); logPageView('Schedule'); }} />
                    <NavButton active={view === 'Standings'} icon={<Trophy size={20} />} label="순위표" onClick={() => { setView('Standings'); logPageView('Standings'); }} />
                    <NavButton active={view === 'Leaderboard'} icon={<BarChart2 size={20} />} label="리더보드" onClick={() => { setView('Leaderboard'); logPageView('Leaderboard'); }} />
                    <NavButton active={view === 'Playoffs'} icon={<Trophy size={20} className="text-yellow-500" />} label="플레이오프" onClick={() => { setView('Playoffs'); logPageView('Playoffs'); }} />
                </nav>

                <div className="p-4 border-t border-slate-800">
                     <button onClick={async () => { await supabase.auth.signOut(); setUser(null); setView('Auth'); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-800 hover:text-red-400 transition-colors">
                        <LogOut size={18} />
                        <span className="text-xs font-bold uppercase tracking-wider">로그아웃</span>
                     </button>
                </div>
            </aside>

            {/* Mobile Header / Layout Content */}
            <main className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
                {/* Ticker */}
                <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center overflow-hidden whitespace-nowrap relative z-20">
                    <div className="bg-indigo-600 px-4 h-full flex items-center z-10 shadow-lg">
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">NEWS</span>
                    </div>
                    <div className="flex items-center animate-marquee pl-4">
                        {news.length > 0 ? news.map((n, i) => (
                            <span key={i} className="mx-6 text-xs font-medium text-slate-400 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                                {n.type === 'game' ? (
                                    <>
                                        <span className="font-bold text-slate-200">{n.away?.city} {n.away?.name}</span>
                                        <span className="font-mono text-indigo-400">{n.awayScore}</span>
                                        <span className="text-slate-600">-</span>
                                        <span className="font-mono text-indigo-400">{n.homeScore}</span>
                                        <span className="font-bold text-slate-200">{n.home?.city} {n.home?.name}</span>
                                    </>
                                ) : (
                                    <span>{n.text}</span>
                                )}
                            </span>
                        )) : (
                            <span className="text-xs text-slate-500 mx-4">2025-26 시즌 개막 준비 중...</span>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-4 lg:p-8 relative">
                    {renderContent()}
                </div>
            </main>
        </div>
      )}

      {/* Views without Sidebar */}
      {(view === 'Auth' || view === 'TeamSelect' || view === 'Onboarding') && renderContent()}
      
    </div>
  );
}

export default App;
