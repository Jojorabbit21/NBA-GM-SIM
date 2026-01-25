
import React, { useMemo } from 'react';
import { Activity, Lock, Newspaper, ChevronRight, Crown, Shield, Target, Zap } from 'lucide-react';
import { Team, PlayerBoxScore, Game, TacticalSnapshot } from '../types';
import { getOvrBadgeStyle } from '../components/SharedComponents';

interface GameStatLeaders {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
}

const OFFENSE_LABELS: Record<string, string> = {
    'Balance': '밸런스',
    'PaceAndSpace': '페이스&스페이스',
    'PerimeterFocus': '퍼리미터 포커스',
    'PostFocus': '포스트 포커스',
    'Grind': '그라인드',
    'SevenSeconds': '세븐 세컨즈'
};

const DEFENSE_LABELS: Record<string, string> = {
    'ManToManPerimeter': '대인방어',
    'ZoneDefense': '지역방어',
    'AceStopper': '에이스 봉쇄'
};

const ResultBoxScore: React.FC<{ 
    team: Team, 
    box: PlayerBoxScore[], 
    isFirst?: boolean, 
    mvpId: string, 
    leaders: GameStatLeaders
}> = ({ team, box, isFirst, mvpId, leaders }) => {
  const sortedBox = useMemo(() => [...box].sort((a, b) => b.gs - a.gs || b.mp - a.mp), [box]);
  const teamTotals = useMemo(() => {
    return box.reduce((acc, p) => ({
      mp: acc.mp + p.mp, pts: acc.pts + p.pts, reb: acc.reb + p.reb, offReb: acc.offReb + (p.offReb || 0), defReb: acc.defReb + (p.defReb || 0), ast: acc.ast + p.ast,
      stl: acc.stl + p.stl, blk: acc.blk + p.blk, tov: acc.tov + p.tov,
      fgm: acc.fgm + p.fgm, fga: acc.fga + p.fga,
      p3m: acc.p3m + p.p3m, p3a: acc.p3a + p.p3a, ftm: acc.ftm + p.ftm, fta: acc.fta + p.fta,
    }), { mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });
  }, [box]);

  const highlightClass = "text-yellow-400 font-medium pretendard drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]";
  const statCellClass = "py-2.5 px-2 text-xs font-medium pretendard";

  const getPct = (m: number, a: number) => a > 0 ? (m / a * 100).toFixed(1) : '0.0';

  return (
    <div className={`flex flex-col ${!isFirst ? 'mt-10' : ''}`}>
       <div className="flex items-center gap-3 mb-4 px-2">
           <img src={team.logo} className="w-8 h-8 object-contain" alt="" />
           <h3 className="text-lg font-black uppercase text-white tracking-widest">{team.city} {team.name}</h3>
       </div>
       <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto custom-scrollbar">
             <table className="w-full text-left whitespace-nowrap">
                <thead>
                   <tr className="bg-slate-950/50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                      <th className="py-3 px-4 sticky left-0 bg-slate-950 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)] w-[140px]">Player</th>
                      <th className="py-3 px-2 text-center w-14">POS</th>
                      <th className="py-3 px-2 text-center w-14">OVR</th>
                      <th className="py-3 px-2 text-right w-14">MIN</th>
                      <th className="py-3 px-2 text-right w-14">PTS</th>
                      <th className="py-3 px-2 text-right w-14">REB</th>
                      <th className="py-3 px-2 text-right w-14">AST</th>
                      <th className="py-3 px-2 text-right w-14">STL</th>
                      <th className="py-3 px-2 text-right w-14">BLK</th>
                      <th className="py-3 px-2 text-right w-14">TOV</th>
                      <th className="py-3 px-2 text-right w-14">FG</th>
                      <th className="py-3 px-2 text-right w-14">FG%</th>
                      <th className="py-3 px-2 text-right w-14">3P</th>
                      <th className="py-3 px-2 text-right w-14">3P%</th>
                      <th className="py-3 px-2 text-right w-14">FT</th>
                      <th className="py-3 px-2 text-right w-14">FT%</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                   {sortedBox.map(p => {
                       const playerInfo = team.roster.find(r => r.id === p.playerId);
                       const isMvp = p.playerId === mvpId;
                       const ovr = playerInfo?.ovr || 0;
                       
                       return (
                           <tr key={p.playerId} className={`hover:bg-white/5 transition-colors group ${isMvp ? 'bg-amber-900/10' : ''}`}>
                               <td className="py-2.5 px-4 sticky left-0 bg-slate-900 group-hover:bg-slate-800 transition-colors z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                                   <div className="flex items-center gap-2">
                                       <span className={`text-sm font-bold truncate max-w-[100px] ${isMvp ? 'text-amber-200' : 'text-slate-200'}`}>{p.playerName}</span>
                                       <div className="flex items-center gap-1 flex-shrink-0">
                                            {isMvp && <Crown size={12} className="text-amber-400 fill-amber-400 animate-pulse" />}
                                            {p.isStopper && (
                                                <div className="group/tooltip relative">
                                                    <Shield size={12} className="text-blue-400 fill-blue-900/50" />
                                                </div>
                                            )}
                                            {p.isAceTarget && (p.matchupEffect || 0) < 0 && (
                                                <div className="flex items-center gap-1 bg-red-950/50 border border-red-500/30 px-1.5 py-0.5 rounded">
                                                    <Lock size={10} className="text-red-400" />
                                                    <span className="text-[9px] font-black text-red-400 leading-none">
                                                        {p.matchupEffect}%
                                                    </span>
                                                </div>
                                            )}
                                       </div>
                                   </div>
                               </td>
                               <td className={`${statCellClass} text-center text-slate-500`}>{playerInfo?.position}</td>
                               <td className={`${statCellClass} text-center`}>
                                   <div className={getOvrBadgeStyle(ovr) + " !w-7 !h-7 !text-xs !mx-auto"}>{ovr}</div>
                               </td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{Math.round(p.mp)}</td>
                               <td className={`${statCellClass} text-right ${p.pts === leaders.pts && p.pts > 0 ? highlightClass : 'text-white'}`}>{p.pts}</td>
                               <td className={`${statCellClass} text-right ${p.reb === leaders.reb && p.reb > 0 ? highlightClass : 'text-slate-300'}`}>{p.reb}</td>
                               <td className={`${statCellClass} text-right ${p.ast === leaders.ast && p.ast > 0 ? highlightClass : 'text-slate-300'}`}>{p.ast}</td>
                               <td className={`${statCellClass} text-right ${p.stl === leaders.stl && p.stl > 0 ? highlightClass : 'text-slate-400'}`}>{p.stl}</td>
                               <td className={`${statCellClass} text-right ${p.blk === leaders.blk && p.blk > 0 ? highlightClass : 'text-slate-400'}`}>{p.blk}</td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.tov}</td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.fgm}/{p.fga}</td>
                               <td className={`${statCellClass} text-right text-slate-500`}>{getPct(p.fgm, p.fga)}</td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.p3m}/{p.p3a}</td>
                               <td className={`${statCellClass} text-right text-slate-500`}>{getPct(p.p3m, p.p3a)}</td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.ftm}/{p.fta}</td>
                               <td className={`${statCellClass} text-right text-slate-500`}>{getPct(p.ftm, p.fta)}</td>
                           </tr>
                       );
                   })}
                </tbody>
                <tfoot className="bg-slate-950/30 font-black text-xs border-t border-slate-800">
                    <tr>
                        <td className="py-3 px-4 sticky left-0 bg-slate-950 z-10 text-indigo-400 uppercase tracking-widest shadow-[2px_0_5px_rgba(0,0,0,0.5)]">Total</td>
                        <td colSpan={2}></td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{Math.round(teamTotals.mp)}</td>
                        <td className={`${statCellClass} text-right text-white`}>{teamTotals.pts}</td>
                        <td className={`${statCellClass} text-right text-slate-300`}>{teamTotals.reb}</td>
                        <td className={`${statCellClass} text-right text-slate-300`}>{teamTotals.ast}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.stl}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.blk}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.tov}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.fgm}/{teamTotals.fga}</td>
                        <td className={`${statCellClass} text-right text-slate-500`}>{getPct(teamTotals.fgm, teamTotals.fga)}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.p3m}/{teamTotals.p3a}</td>
                        <td className={`${statCellClass} text-right text-slate-500`}>{getPct(teamTotals.p3m, teamTotals.p3a)}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.ftm}/{teamTotals.fta}</td>
                        <td className={`${statCellClass} text-right text-slate-500`}>{getPct(teamTotals.ftm, teamTotals.fta)}</td>
                    </tr>
                </tfoot>
             </table>
          </div>
       </div>
    </div>
  );
};

const TacticsAnalysisBoard: React.FC<{ 
    homeTeam: Team, 
    awayTeam: Team, 
    homeTactics?: TacticalSnapshot, 
    awayTactics?: TacticalSnapshot, 
    homeBox: PlayerBoxScore[], 
    awayBox: PlayerBoxScore[] 
}> = ({ homeTeam, awayTeam, homeTactics, awayTactics, homeBox, awayBox }) => {
    
    // Helper to calculate tactic grade based on logic
    const getTacticGrade = (tactic: string, box: PlayerBoxScore[], opponentBox: PlayerBoxScore[], pace: number) => {
        const teamTotals = box.reduce((acc, p) => ({
            pts: acc.pts + p.pts,
            p3a: acc.p3a + p.p3a,
            p3m: acc.p3m + p.p3m,
            ast: acc.ast + p.ast,
            fta: acc.fta + p.fta,
            fgm: acc.fgm + p.fgm,
            fga: acc.fga + p.fga
        }), { pts: 0, p3a: 0, p3m: 0, ast: 0, fta: 0, fgm: 0, fga: 0 });

        const oppTotals = opponentBox.reduce((acc, p) => ({
            pts: acc.pts + p.pts,
            fgm: acc.fgm + p.fgm,
            fga: acc.fga + p.fga
        }), { pts: 0, fgm: 0, fga: 0 });

        const p3Pct = teamTotals.p3a > 0 ? (teamTotals.p3m / teamTotals.p3a) : 0;
        const oppFgPct = oppTotals.fga > 0 ? (oppTotals.fgm / oppTotals.fga) : 0;

        let score = 70; // Base C
        let feedback = "무난한 전술 수행력을 보였습니다.";

        switch(tactic) {
            case 'PaceAndSpace':
            case 'SevenSeconds':
                // Check 3PA volume and efficiency, and Pace
                if (teamTotals.p3a > 35) score += 10;
                if (p3Pct > 0.38) score += 15; else if (p3Pct < 0.33) score -= 10;
                if (teamTotals.ast > 25) score += 5;
                if (score >= 90) feedback = "완벽한 공간 창출! 외곽 슛이 불을 뿜었습니다.";
                else if (score >= 80) feedback = "빠른 템포와 3점 슛으로 상대를 공략했습니다.";
                else feedback = "슛 감각 난조로 스페이싱 효과를 보지 못했습니다.";
                break;
            case 'PostFocus':
                // Check Paint scoring proxy (High FG% usually, low 3PA ratio) or FTA
                if (teamTotals.fta > 25) score += 10;
                if ((teamTotals.fgm / teamTotals.fga) > 0.5) score += 10;
                if (score >= 90) feedback = "골밑을 완전히 장악하며 파울을 이끌어냈습니다.";
                else if (score >= 80) feedback = "인사이드 공격이 효과적으로 통했습니다.";
                else feedback = "상대 골밑 수비에 고전하며 효율이 떨어졌습니다.";
                break;
            case 'Grind':
                // Low Pace, Low Opponent Score
                if (oppTotals.pts < 100) score += 15;
                else if (oppTotals.pts > 115) score -= 15;
                if (pace < 4) score += 5;
                if (score >= 85) feedback = "진흙탕 수비로 상대 득점을 억제했습니다.";
                else feedback = "수비가 무너지며 의도한 경기 흐름을 놓쳤습니다.";
                break;
            case 'PerimeterFocus':
                if (teamTotals.p3a > 30 && p3Pct > 0.36) score += 15;
                feedback = score > 80 ? "외곽 자원들의 활약이 돋보였습니다." : "외곽 슛 침묵으로 경기가 풀리지 않았습니다.";
                break;
            case 'Balance':
                if (teamTotals.ast > 25 && teamTotals.pts > 110) score += 10;
                feedback = score > 80 ? "고른 득점 분포로 안정적인 경기를 펼쳤습니다." : "특색 없는 공격으로 흐름을 내줬습니다.";
                break;
        }
        
        // Return Grade Letter
        if (score >= 95) return { grade: 'S', score, feedback };
        if (score >= 90) return { grade: 'A+', score, feedback };
        if (score >= 85) return { grade: 'A', score, feedback };
        if (score >= 80) return { grade: 'B+', score, feedback };
        if (score >= 75) return { grade: 'B', score, feedback };
        if (score >= 70) return { grade: 'C+', score, feedback };
        if (score >= 60) return { grade: 'C', score, feedback };
        return { grade: 'F', score, feedback };
    };

    const homeGrade = getTacticGrade(homeTactics?.offense || 'Balance', homeBox, awayBox, homeTactics?.pace || 5);
    const awayGrade = getTacticGrade(awayTactics?.offense || 'Balance', awayBox, homeBox, awayTactics?.pace || 5);

    const TacticalCard: React.FC<{ team: Team, tactics?: TacticalSnapshot, grade: any, isHome: boolean }> = ({ team, tactics, grade, isHome }) => (
        <div className={`flex flex-col gap-4 p-5 rounded-2xl border ${isHome ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-900/40 border-slate-800'}`}>
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                <img src={team.logo} className="w-8 h-8 object-contain" alt="" />
                <div className="flex-1">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{isHome ? 'HOME' : 'AWAY'} STRATEGY</div>
                    <div className="font-black text-white uppercase">{OFFENSE_LABELS[tactics?.offense || 'Balance']}</div>
                </div>
                <div className={`text-2xl font-black oswald ${grade.score >= 80 ? 'text-emerald-400' : grade.score >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {grade.grade}
                </div>
            </div>
            <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Defensive Scheme</span>
                    <span className="text-slate-300 font-bold">{DEFENSE_LABELS[tactics?.defense || 'ManToManPerimeter']}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Game Pace</span>
                    <div className="flex gap-1">
                        {Array.from({length: 10}).map((_, i) => (
                            <div key={i} className={`w-1 h-2 rounded-full ${i < (tactics?.pace || 5) ? 'bg-indigo-500' : 'bg-slate-800'}`}></div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="pt-2 border-t border-white/5">
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                    "<span className="text-white font-bold">{grade.feedback}</span>"
                </p>
            </div>
        </div>
    );

    if (!homeTactics || !awayTactics) return null;

    return (
        <div className="w-full bg-slate-950/30 border border-slate-800 rounded-3xl p-6 mb-8">
            <div className="flex items-center gap-3 mb-6">
                <Target className="text-indigo-400" size={20} />
                <h3 className="text-lg font-black uppercase text-white tracking-widest ko-tight">Tactical Matchup Report</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <TacticalCard team={homeTeam} tactics={homeTactics} grade={homeGrade} isHome={true} />
                <TacticalCard team={awayTeam} tactics={awayTactics} grade={awayGrade} isHome={false} />
            </div>
        </div>
    );
};

export const GameResultView: React.FC<{
  result: {
    home: Team;
    away: Team;
    homeScore: number;
    awayScore: number;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    recap: string[];
    otherGames: Game[];
    homeTactics?: TacticalSnapshot;
    awayTactics?: TacticalSnapshot;
    userTactics?: any;
    myTeamId: string;
  };
  myTeamId: string;
  teams: Team[];
  onFinish: () => void;
}> = ({ result, myTeamId, teams, onFinish }) => {
  const { home, away, homeScore, awayScore, homeBox, awayBox, recap, otherGames, homeTactics, awayTactics } = result;
  
  const isHome = myTeamId === home.id;
  const isWin = isHome ? homeScore > awayScore : awayScore > homeScore;
  
  const headline = recap && recap.length > 0 ? recap[0] : "경기 종료";

  const getTeamInfo = (id: string) => teams.find(t => t.id === id);

  // MVP Calculation
  const allPlayers = [...homeBox, ...awayBox];
  const mvp = allPlayers.reduce((prev, curr) => (curr.pts > prev.pts ? curr : prev), allPlayers[0]);

  // Leaders Calculation
  const leaders: GameStatLeaders = {
      pts: Math.max(...allPlayers.map(p => p.pts)),
      reb: Math.max(...allPlayers.map(p => p.reb)),
      ast: Math.max(...allPlayers.map(p => p.ast)),
      stl: Math.max(...allPlayers.map(p => p.stl)),
      blk: Math.max(...allPlayers.map(p => p.blk)),
      tov: Math.max(...allPlayers.map(p => p.tov)),
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-[100] overflow-y-auto animate-in fade-in duration-500 ko-normal pretendard pb-24">
       <div className="min-h-screen flex flex-col">
          {/* Header */}
          <div className="bg-slate-900 border-b border-slate-800 pt-10 pb-8 px-8 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl z-20">
              <div className={`absolute inset-0 opacity-20 pointer-events-none bg-gradient-to-b ${isWin ? 'from-emerald-900 to-slate-900' : 'from-red-900 to-slate-900'}`}></div>
              
              <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-5xl">
                  {/* Scoreboard Row */}
                  <div className="flex items-center justify-between w-full">
                      <div className="flex flex-col items-center gap-4 flex-1">
                          <img src={away.logo} className="w-20 h-20 md:w-28 md:h-28 object-contain drop-shadow-2xl" alt={away.name} />
                          <div className="text-center">
                              <div className="text-2xl md:text-4xl font-black text-white oswald uppercase tracking-tight">{away.name}</div>
                              <div className={`text-5xl md:text-7xl font-black oswald mt-2 ${awayScore > homeScore ? 'text-white' : 'text-slate-600'}`}>{Math.round(awayScore)}</div>
                          </div>
                      </div>

                      <div className="flex flex-col items-center justify-center px-4 md:px-12">
                          <div className="text-xl md:text-2xl font-black text-slate-700 oswald tracking-widest mb-4">FINAL</div>
                          {isWin ? (
                              <div className="px-4 py-1.5 md:px-6 md:py-2 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs md:text-sm tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.4)]">Victory</div>
                          ) : (
                              <div className="px-4 py-1.5 md:px-6 md:py-2 bg-red-600 text-white rounded-xl font-black uppercase text-xs md:text-sm tracking-widest shadow-[0_0_20px_rgba(239,68,68,0.4)]">Defeat</div>
                          )}
                      </div>

                      <div className="flex flex-col items-center gap-4 flex-1">
                          <img src={home.logo} className="w-20 h-20 md:w-28 md:h-28 object-contain drop-shadow-2xl" alt={home.name} />
                          <div className="text-center">
                              <div className="text-2xl md:text-4xl font-black text-white oswald uppercase tracking-tight">{home.name}</div>
                              <div className={`text-5xl md:text-7xl font-black oswald mt-2 ${homeScore > awayScore ? 'text-white' : 'text-slate-600'}`}>{Math.round(homeScore)}</div>
                          </div>
                      </div>
                  </div>

                  {/* Headline in Header */}
                  <div className="w-full bg-slate-950/50 border border-white/5 rounded-2xl p-4 text-center backdrop-blur-md">
                      <p className="text-sm md:text-base font-bold text-slate-200 leading-relaxed break-keep">
                          <Newspaper className="inline-block mr-2 text-indigo-400 mb-0.5" size={16} />
                          {headline}
                      </p>
                  </div>
              </div>
          </div>

          <div className="flex-1 max-w-6xl mx-auto w-full p-6 space-y-8">
              {/* Tactical Analysis Section Added Here */}
              <TacticsAnalysisBoard 
                  homeTeam={home} 
                  awayTeam={away} 
                  homeTactics={homeTactics} 
                  awayTactics={awayTactics} 
                  homeBox={homeBox}
                  awayBox={awayBox}
              />

              <ResultBoxScore team={away} box={awayBox} isFirst mvpId={mvp.playerId} leaders={leaders} />
              <ResultBoxScore team={home} box={homeBox} mvpId={mvp.playerId} leaders={leaders} />
              
              {/* Around the League */}
              {otherGames && otherGames.length > 0 && (
                 <div className="mt-12 pt-8 border-t border-slate-800">
                     <h3 className="text-lg font-black uppercase text-slate-500 tracking-widest mb-6 flex items-center gap-2">
                        <Activity size={20} /> Around the League
                     </h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                         {otherGames.map(g => {
                             const h = getTeamInfo(g.homeTeamId);
                             const a = getTeamInfo(g.awayTeamId);
                             if (!h || !a) return null;
                             const hWin = (g.homeScore || 0) > (g.awayScore || 0);
                             return (
                                 <div key={g.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
                                     <div className="flex justify-between items-center">
                                         <div className="flex items-center gap-3">
                                             <img src={a.logo} className="w-6 h-6 object-contain opacity-80" alt="" />
                                             <span className={`text-sm font-bold uppercase ${!hWin ? 'text-white' : 'text-slate-500'}`}>{a.name}</span>
                                         </div>
                                         <span className={`text-lg font-black oswald ${!hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{g.awayScore}</span>
                                     </div>
                                     <div className="flex justify-between items-center">
                                         <div className="flex items-center gap-3">
                                             <img src={h.logo} className="w-6 h-6 object-contain opacity-80" alt="" />
                                             <span className={`text-sm font-bold uppercase ${hWin ? 'text-white' : 'text-slate-500'}`}>{h.name}</span>
                                         </div>
                                         <span className={`text-lg font-black oswald ${hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{g.homeScore}</span>
                                     </div>
                                 </div>
                             );
                         })}
                     </div>
                 </div>
              )}
          </div>

          {/* Bottom Button Fixed */}
          <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/80 backdrop-blur-md border-t border-slate-800 flex justify-center z-50">
              <button 
                  onClick={onFinish}
                  className="px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-lg tracking-widest shadow-[0_10px_30px_rgba(79,70,229,0.4)] transition-all active:scale-95 flex items-center gap-4"
              >
                  Continue to Dashboard <ChevronRight />
              </button>
          </div>
       </div>
    </div>
  );
};
