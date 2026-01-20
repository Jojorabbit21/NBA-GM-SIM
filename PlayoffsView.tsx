
import React, { useMemo, useState } from 'react';
import { Swords, Trophy, Zap, BarChart3 } from 'lucide-react';
import { Team, Game, PlayoffSeries } from './types';

interface PlayoffsViewProps {
  teams: Team[];
  schedule: Game[];
  series: PlayoffSeries[];
  setSeries: (s: PlayoffSeries[]) => void;
  setSchedule: (g: Game[]) => void;
  myTeamId: string;
}

// --- Constants ---
const CELL_BORDER = "border-b border-r border-slate-800";
const HEADER_STYLE = "py-3 px-2 md:px-4 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-900/90 border-r border-slate-800 text-center truncate";
const EAST_SECTION_HEIGHT = "h-[460px]";
const WEST_SECTION_HEIGHT = "h-[460px]";

// NBA Team Colors (Primary)
const TEAM_COLORS: Record<string, string> = {
  'atl': '#C8102E', 'bos': '#007A33', 'bkn': '#333333', 'cha': '#1D1160', 'chi': '#CE1141', 'cle': '#860038',
  'dal': '#00538C', 'den': '#0E2240', 'det': '#C8102E', 'gsw': '#1D428A', 'hou': '#CE1141', 'ind': '#002D62',
  'lac': '#1D428A', 'lal': '#552583', 'mem': '#5D76A9', 'mia': '#98002E', 'mil': '#00471B', 'min': '#0C2340',
  'nop': '#0C2340', 'nyk': '#006BB6', 'okc': '#007AC1', 'orl': '#0077C0', 'phi': '#006BB6', 'phx': '#1D1160',
  'por': '#E03A3E', 'sac': '#5A2D81', 'sas': '#C4CED4', 'tor': '#CE1141', 'uta': '#002B5C', 'was': '#002B5C'
};

const GridSeriesBox: React.FC<{ 
  series?: PlayoffSeries, 
  teams: Team[], 
  myTeamId: string, 
  seedMap: Record<string, number>,
  isProjected?: boolean,
  label?: string
}> = ({ series, teams, myTeamId, seedMap, isProjected, label }) => {
  const higher = teams.find(t => t.id === series?.higherSeedId);
  const lower = teams.find(t => t.id === series?.lowerSeedId);
  
  const hWins = series?.higherSeedWins || 0;
  const lWins = series?.lowerSeedWins || 0;
  const finished = series?.finished;
  const winnerId = series?.winnerId;

  // Status Text Logic
  let statusText = label || '-';
  const higherCode = higher?.id.toUpperCase() || 'TBD';
  const lowerCode = lower?.id.toUpperCase() || 'TBD';

  if (finished) {
      if (winnerId === higher?.id) statusText = `WIN: ${higherCode}`;
      else statusText = `WIN: ${lowerCode}`;
  } else if (series) {
      if (hWins === 0 && lWins === 0) statusText = 'VS';
      else if (hWins === lWins) statusText = `TIED ${hWins}-${lWins}`;
      else if (hWins > lWins) statusText = `${higherCode} +${hWins-lWins}`;
      else statusText = `${lowerCode} +${lWins-hWins}`;
  }

  // --- Standard Bracket Layout (Unified for all rounds including Finals) ---
  const TeamRow = ({ team, wins, opponentWins, isBottom }: { team?: Team, wins: number, opponentWins: number, isBottom?: boolean }) => {
      const isUser = team?.id === myTeamId;
      const isWinner = finished && winnerId === team?.id;
      const isEliminated = finished && winnerId !== team?.id;
      const seed = team ? seedMap[team.id] : '-';
      
      // Changed to Emerald (Green) for user team
      const rowBg = isUser ? 'bg-emerald-900/30' : 'bg-slate-950';
      
      // Determine Score Color: Highlight if winner or leading
      const scoreColor = (isWinner || (series && wins > opponentWins)) ? 'text-emerald-400' : 'text-slate-600';

      return (
          <div className={`
            flex items-center h-9 px-2 md:px-3 gap-2 md:gap-3 
            ${rowBg} 
            ${!isBottom ? 'border-b border-slate-800/50' : ''}
            hover:bg-white/5 transition-colors
          `}>
              <span className={`w-3 md:w-4 text-center font-mono text-[9px] md:text-[10px] ${isUser ? 'text-emerald-400' : 'text-slate-600'}`}>{seed}</span>
              
              {team && (
                  <img 
                    src={team.logo} 
                    alt="" 
                    className={`
                        w-4 h-4 md:w-5 md:h-5 object-contain flex-shrink-0 
                        ${isEliminated ? 'opacity-40 grayscale' : ''}
                    `} 
                  />
              )}
              
              <span className={`
                  text-[10px] md:text-xs flex-1 truncate min-w-0 
                  ${isWinner ? 'text-white font-bold' : 'text-slate-400'}
                  ${isEliminated ? 'line-through decoration-slate-600 opacity-50' : ''}
              `}>
                  {team?.name || 'TBD'}
              </span>
              
              <span className={`text-[10px] md:text-xs font-mono font-black ${scoreColor}`}>
                  {wins}
              </span>
          </div>
      );
  };

  return (
    <div className={`flex flex-col w-full ${CELL_BORDER} relative group bg-slate-900`}>
        {/* Conf Indicator Strip */}
        <div className={`absolute left-0 top-0 bottom-0 w-0.5 md:w-1 ${series?.conference === 'East' ? 'bg-blue-600/50' : series?.conference === 'West' ? 'bg-red-600/50' : 'bg-transparent'}`}></div>
        
        {/* Meta Header */}
        <div className="flex justify-between items-center px-2 md:px-3 py-1.5 bg-slate-900/50 border-b border-slate-800/50 min-h-[22px]">
            {statusText === label ? (
                <span className="w-full text-center text-[8px] md:text-[9px] font-bold text-slate-500 uppercase tracking-tighter truncate">{label}</span>
            ) : (
                <>
                    <span className="text-[8px] md:text-[9px] font-bold text-slate-600 uppercase tracking-tighter truncate max-w-[60%]">{label}</span>
                    <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-tighter truncate ${finished ? 'text-emerald-500' : 'text-slate-500'}`}>{statusText}</span>
                </>
            )}
        </div>

        <TeamRow team={higher} wins={hWins} opponentWins={lWins} />
        <TeamRow team={lower} wins={lWins} opponentWins={hWins} isBottom />
    </div>
  );
};

export const PlayoffsView: React.FC<PlayoffsViewProps> = ({ teams, schedule, series, setSeries, setSchedule, myTeamId }) => {
  const regularSeasonFinished = useMemo(() => {
    const userTeamGames = schedule.filter(g => !g.isPlayoff && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId));
    return userTeamGames.length > 0 && userTeamGames.every(g => g.played);
  }, [schedule, myTeamId]);

  const playInSeries = useMemo(() => series.filter(s => s.round === 0), [series]);
  const hasPlayInStarted = playInSeries.length > 0;
  
  const isPlayInFinished = useMemo(() => {
      const mainStarted = series.some(s => s.round === 1);
      if (mainStarted) return true;
      const eastPI = playInSeries.filter(s => s.conference === 'East');
      const westPI = playInSeries.filter(s => s.conference === 'West');
      return eastPI.length === 3 && westPI.length === 3 && eastPI.every(s => s.finished) && westPI.every(s => s.finished);
  }, [series, playInSeries]);

  const regularStandingsSeeds = useMemo(() => {
      const getSeeds = (conf: 'East' | 'West') => {
        return [...teams]
          .filter(t => t.conference === conf)
          .sort((a, b) => {
              const aPct = (a.wins / (a.wins + a.losses || 1));
              const bPct = (b.wins / (b.wins + b.losses || 1));
              return bPct - aPct || b.wins - a.wins;
          });
      };
      return { East: getSeeds('East'), West: getSeeds('West') };
  }, [teams]);

  const seedMap = useMemo(() => {
      const map: Record<string, number> = {};
      regularStandingsSeeds.East.forEach((t, i) => map[t.id] = i + 1);
      regularStandingsSeeds.West.forEach((t, i) => map[t.id] = i + 1);

      if (isPlayInFinished || series.some(s => s.round === 1)) {
          ['East', 'West'].forEach(conf => {
              const piGames = playInSeries.filter(s => s.conference === conf);
              const g1 = piGames.find(s => {
                  const hSeed = regularStandingsSeeds[conf as 'East'|'West'].findIndex(t => t.id === s.higherSeedId) + 1;
                  return hSeed === 7; 
              });
              const g3 = piGames.find(s => s.id.includes('8th'));
              if (g1 && g1.winnerId) map[g1.winnerId] = 7;
              if (g3 && g3.winnerId) map[g3.winnerId] = 8;
          });
      }
      return map;
  }, [teams, regularStandingsSeeds, isPlayInFinished, series, playInSeries]);

  const getPISeries = (conf: 'East'|'West', type: '7v8'|'9v10'|'8th') => {
      const existing = playInSeries.find(s => s.conference === conf && s.id.includes(type));
      if (existing) return existing;
      const seeds = regularStandingsSeeds[conf];
      
      const seedH_7v8 = seeds[6]?.id || '';
      const seedL_7v8 = seeds[7]?.id || '';
      const seedH_9v10 = seeds[8]?.id || '';
      const seedL_9v10 = seeds[9]?.id || '';

      if (type === '7v8') {
          return { 
              id: `proj_${conf}_7v8`, higherSeedId: seedH_7v8, lowerSeedId: seedL_7v8, 
              round: 0 as 0, conference: conf as any, higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 1 
          };
      }
      if (type === '9v10') {
          return { 
              id: `proj_${conf}_9v10`, higherSeedId: seedH_9v10, lowerSeedId: seedL_9v10, 
              round: 0 as 0, conference: conf as any, higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 1 
          };
      }
      return undefined;
  };

  const getR1Match = (conf: 'East' | 'West', rankH: number, rankL: number) => {
      const existing = series.find(s => s.conference === conf && s.round === 1 && 
          ((s.higherSeedId === (conf==='East'?regularStandingsSeeds.East:regularStandingsSeeds.West)[rankH-1].id) || 
           (s.lowerSeedId === (conf==='East'?regularStandingsSeeds.East:regularStandingsSeeds.West)[rankH-1].id))
      );
      if (existing) return existing;
      const seeds = conf === 'East' ? regularStandingsSeeds.East : regularStandingsSeeds.West;
      return { higherSeedId: seeds[rankH-1]?.id, lowerSeedId: seeds[rankL-1]?.id, conference: conf };
  };

  const getRoundMatch = (conf: 'East' | 'West' | 'NBA', round: number, index: number) => {
      const candidates = series.filter(s => s.conference === conf && s.round === round);
      return candidates[index] || null;
  };

  // --- Actions ---
  const generatePlayIn = () => {
      if (hasPlayInStarted) return;
      const newSeries: PlayoffSeries[] = [];
      const newGames: Game[] = [];
      ['East', 'West'].forEach(conf => {
          const seeds = regularStandingsSeeds[conf as 'East'|'West'];
          const s7 = seeds[6], s8 = seeds[7], s9 = seeds[8], s10 = seeds[9];
          
          const id7v8 = `pi_${conf}_7v8`;
          newSeries.push({ id: id7v8, round: 0, conference: conf as any, higherSeedId: s7.id, lowerSeedId: s8.id, higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 1 });
          newGames.push({ id: `${id7v8}_g1`, homeTeamId: s7.id, awayTeamId: s8.id, date: `2026-04-14`, played: false, isPlayoff: true, seriesId: id7v8 });

          const id9v10 = `pi_${conf}_9v10`;
          newSeries.push({ id: id9v10, round: 0, conference: conf as any, higherSeedId: s9.id, lowerSeedId: s10.id, higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 1 });
          newGames.push({ id: `${id9v10}_g1`, homeTeamId: s9.id, awayTeamId: s10.id, date: `2026-04-15`, played: false, isPlayoff: true, seriesId: id9v10 });
      });
      setSeries([...series, ...newSeries]);
      setSchedule([...schedule, ...newGames]);
  };

  const advancePlayIn = () => {
      if (!hasPlayInStarted || isPlayInFinished) return;
      const newSeries: PlayoffSeries[] = [];
      const newGames: Game[] = [];
      let updated = false;
      ['East', 'West'].forEach(conf => {
          const piGames = playInSeries.filter(s => s.conference === conf);
          if (piGames.length === 2 && piGames.every(s => s.finished)) {
              const g7v8 = piGames.find(s => s.id.includes('7v8'));
              const g9v10 = piGames.find(s => s.id.includes('9v10'));
              if (g7v8 && g9v10) {
                  const loser7v8 = g7v8.winnerId === g7v8.higherSeedId ? g7v8.lowerSeedId : g7v8.higherSeedId;
                  const winner9v10 = g9v10.winnerId;
                  const id8th = `pi_${conf}_8th`;
                  newSeries.push({ id: id8th, round: 0, conference: conf as any, higherSeedId: loser7v8, lowerSeedId: winner9v10!, higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 1 });
                  newGames.push({ id: `${id8th}_g1`, homeTeamId: loser7v8, awayTeamId: winner9v10!, date: `2026-04-17`, played: false, isPlayoff: true, seriesId: id8th });
                  updated = true;
              }
          }
      });
      if (updated) {
          setSeries([...series, ...newSeries]);
          setSchedule([...schedule, ...newGames]);
      }
  };

  if (hasPlayInStarted && !isPlayInFinished && !series.some(s => s.id.includes('8th'))) {
      const eastReady = series.filter(s => s.conference === 'East' && s.round === 0 && s.finished).length === 2;
      const westReady = series.filter(s => s.conference === 'West' && s.round === 0 && s.finished).length === 2;
      if (eastReady || westReady) setTimeout(advancePlayIn, 100);
  }

  const generateMainPlayoffs = () => {
    if (series.some(s => s.round === 1)) return; 
    const getFinalSeeds = (conf: 'East' | 'West') => {
        const baseSeeds = regularStandingsSeeds[conf].slice(0, 6);
        const piGames = playInSeries.filter(s => s.conference === conf);
        const g7v8 = piGames.find(s => s.id.includes('7v8'));
        const g8th = piGames.find(s => s.id.includes('8th'));
        const seed7 = teams.find(t => t.id === g7v8?.winnerId)!;
        const seed8 = teams.find(t => t.id === g8th?.winnerId)!;
        return [...baseSeeds, seed7, seed8];
    };
    const eastSeeds = getFinalSeeds('East');
    const westSeeds = getFinalSeeds('West');
    const newSeries: PlayoffSeries[] = [];
    const newGames: Game[] = [];
    const createSeriesMatchup = (h: Team, l: Team, conf: 'East' | 'West', round: number) => {
      const sId = `s_${conf}_r${round}_${h.id}_${l.id}`;
      newSeries.push({ id: sId, round: round as any, conference: conf, higherSeedId: h.id, lowerSeedId: l.id, higherSeedWins: 0, lowerSeedWins: 0, finished: false, targetWins: 4 });
      for(let i=1; i<=4; i++) newGames.push({ id: `${sId}_g${i}`, homeTeamId: i % 2 !== 0 ? h.id : l.id, awayTeamId: i % 2 !== 0 ? l.id : h.id, date: `2026-04-${20 + i}`, played: false, isPlayoff: true, seriesId: sId });
    };
    [eastSeeds, westSeeds].forEach((seeds, idx) => {
        const conf = idx === 0 ? 'East' : 'West';
        createSeriesMatchup(seeds[0], seeds[7], conf, 1);
        createSeriesMatchup(seeds[3], seeds[4], conf, 1);
        createSeriesMatchup(seeds[2], seeds[5], conf, 1);
        createSeriesMatchup(seeds[1], seeds[6], conf, 1);
    });
    setSeries([...series, ...newSeries]);
    setSchedule([...schedule, ...newGames]);
  };

  // --- Grid Data Preparation ---
  const pi_east = [getPISeries('East', '7v8'), getPISeries('East', '9v10'), getPISeries('East', '8th')];
  const pi_west = [getPISeries('West', '7v8'), getPISeries('West', '9v10'), getPISeries('West', '8th')];
  
  const r1_east = [getR1Match('East', 1, 8), getR1Match('East', 4, 5), getR1Match('East', 3, 6), getR1Match('East', 2, 7)];
  const r1_west = [getR1Match('West', 1, 8), getR1Match('West', 4, 5), getR1Match('West', 3, 6), getR1Match('West', 2, 7)];
  
  const r2_east = [getRoundMatch('East', 2, 0), getRoundMatch('East', 2, 1)];
  const r2_west = [getRoundMatch('West', 2, 0), getRoundMatch('West', 2, 1)];
  
  const cf_east = getRoundMatch('East', 3, 0);
  const cf_west = getRoundMatch('West', 3, 0);
  
  const finals = getRoundMatch('NBA', 4, 0);

  // --- Finals Gradient Logic ---
  const getFinalsGradient = () => {
      // Default: East Blue (Top Left) to West Red (Bottom Right)
      const defaultGradient = 'linear-gradient(to bottom right, #1d428a, #c8102e)';
      
      if (!finals) return defaultGradient;

      const team1 = teams.find(t => t.id === finals.higherSeedId);
      const team2 = teams.find(t => t.id === finals.lowerSeedId);

      if (!team1 || !team2) return defaultGradient;

      const c1 = TEAM_COLORS[team1.id] || '#1d428a';
      const c2 = TEAM_COLORS[team2.id] || '#c8102e';

      return `linear-gradient(to bottom right, ${c1}, ${c2})`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20 w-full flex flex-col h-full">
      {/* Control Toolbar */}
      <div className="flex flex-col lg:flex-row justify-between items-end gap-4 border-b border-slate-800 pb-4 min-w-[300px] flex-shrink-0 bg-slate-950">
        <div>
           <div className="flex items-center gap-3">
             <h2 className="text-5xl font-black ko-tight text-slate-100 uppercase tracking-tighter">
                플레이오프
             </h2>
           </div>
           <p className="text-slate-500 font-bold mt-1 uppercase text-sm tracking-widest pl-1">
                {regularSeasonFinished ? "2025-26 플레이오프 브라켓" : "순위 예측에 따른 시드"}
           </p>
        </div>
        
        {regularSeasonFinished && (
            <div className="flex gap-2">
                {!hasPlayInStarted && (
                    <button onClick={generatePlayIn} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 border border-indigo-500 shadow-lg">
                        <Swords size={14} /> Start Play-In
                    </button>
                )}
                {hasPlayInStarted && !isPlayInFinished && (
                    <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-2 rounded-lg border border-slate-800">
                        <Zap size={14} className="text-yellow-400 animate-pulse" />
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Play-In Active</span>
                    </div>
                )}
                {isPlayInFinished && !series.some(s => s.round === 1) && (
                    <button onClick={generateMainPlayoffs} className="px-5 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 border border-yellow-500 shadow-lg animate-pulse">
                        <Trophy size={14} /> Start Playoffs
                    </button>
                )}
            </div>
        )}
        {!regularSeasonFinished && (
            <div className="px-4 py-2 bg-slate-900 rounded-lg border border-slate-800 flex items-center gap-3">
                <BarChart3 size={14} className="text-emerald-400" />
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">실시간 시드 예측</span>
            </div>
        )}
      </div>

      {/* Spreadsheet Grid Container - Removed overflow-x-auto and fixed min-width */}
      <div className="w-full border border-slate-800 bg-slate-900 shadow-2xl rounded-sm">
          {/* Main Grid Definition: 5 Columns evenly distributed, with NO fixed min-width to prevent scroll */}
          {/* Added first column for labels (30px width) */}
          <div className="grid grid-cols-[30px_repeat(4,minmax(0,1fr))_1.2fr] w-full">
              
              {/* --- LABEL HEADER CORNER --- */}
              <div className={`${HEADER_STYLE} !px-0 bg-slate-950 border-b border-slate-800`}></div>

              {/* --- HEADER ROW --- */}
              <div className={HEADER_STYLE}>Play-In</div>
              <div className={HEADER_STYLE}>Round 1</div>
              <div className={HEADER_STYLE}>Semis</div>
              <div className={HEADER_STYLE}>Conf. Finals</div>
              {/* NBA Finals Header with Flashy Style */}
              <div className="py-3 px-2 md:px-4 text-[10px] md:text-[12px] font-black uppercase tracking-[0.1em] md:tracking-[0.2em] text-yellow-500 text-center bg-yellow-950/20 border-b border-yellow-500/30 flex items-center justify-center gap-1 md:gap-2 truncate">
                  NBA FINALS
              </div>

              {/* --- COLUMN 0: LABELS (Restored EAST/WEST text) --- */}
              <div className="flex flex-col border-r border-slate-800">
                  <div className={`${EAST_SECTION_HEIGHT} bg-blue-900/40 border-b border-slate-800 flex items-center justify-center relative overflow-hidden`}>
                      <span className="text-sm font-black text-white uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 cursor-default select-none">EAST</span>
                  </div>
                  <div className={`${WEST_SECTION_HEIGHT} bg-red-900/40 flex items-center justify-center relative overflow-hidden`}>
                      <span className="text-sm font-black text-white uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 cursor-default select-none">WEST</span>
                  </div>
              </div>

              {/* --- COLUMN 1: PLAY-IN --- */}
              <div className="border-r border-slate-800 flex flex-col min-w-0">
                  {/* East Section */}
                  <div className={`${EAST_SECTION_HEIGHT} flex flex-col border-b border-slate-800`}>
                      <div className="flex-1 flex flex-col justify-center gap-2 p-1 md:p-2 bg-slate-950/50">
                          <GridSeriesBox series={pi_east[0]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="7 vs 8" isProjected={!hasPlayInStarted} />
                          <GridSeriesBox series={pi_east[1]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="9 vs 10" isProjected={!hasPlayInStarted} />
                          <GridSeriesBox series={pi_east[2]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="8th Decider" isProjected={!hasPlayInStarted} />
                      </div>
                  </div>
                  {/* West Section */}
                  <div className={`${WEST_SECTION_HEIGHT} flex flex-col bg-slate-950/80`}>
                      <div className="flex-1 flex flex-col justify-center gap-2 p-1 md:p-2">
                          <GridSeriesBox series={pi_west[0]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="7 vs 8" isProjected={!hasPlayInStarted} />
                          <GridSeriesBox series={pi_west[1]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="9 vs 10" isProjected={!hasPlayInStarted} />
                          <GridSeriesBox series={pi_west[2]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="8th Decider" isProjected={!hasPlayInStarted} />
                      </div>
                  </div>
              </div>

              {/* --- COLUMN 2: ROUND 1 --- */}
              <div className="border-r border-slate-800 flex flex-col min-w-0">
                  {/* East Section */}
                  <div className={`${EAST_SECTION_HEIGHT} flex flex-col border-b border-slate-800`}>
                      <div className="flex-1 flex flex-col justify-around p-1 md:p-2 bg-slate-950/50">
                          {r1_east.map((s, i) => (
                              <GridSeriesBox key={`e_r1_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Match ${i+1}`} isProjected={series.length===0} />
                          ))}
                      </div>
                  </div>
                  {/* West Section */}
                  <div className={`${WEST_SECTION_HEIGHT} flex flex-col bg-slate-950/80`}>
                      <div className="flex-1 flex flex-col justify-around p-1 md:p-2">
                          {r1_west.map((s, i) => (
                              <GridSeriesBox key={`w_r1_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Match ${i+1}`} isProjected={series.length===0} />
                          ))}
                      </div>
                  </div>
              </div>

              {/* --- COLUMN 3: SEMIS --- */}
              <div className="border-r border-slate-800 flex flex-col min-w-0">
                  {/* East Section */}
                  <div className={`${EAST_SECTION_HEIGHT} flex flex-col border-b border-slate-800`}>
                      <div className="flex-1 flex flex-col justify-around p-1 md:p-2 bg-slate-950/50">
                          {r2_east.map((s, i) => (
                              <GridSeriesBox key={`e_r2_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Semis ${i+1}`} />
                          ))}
                      </div>
                  </div>
                  {/* West Section */}
                  <div className={`${WEST_SECTION_HEIGHT} flex flex-col bg-slate-950/80`}>
                      <div className="flex-1 flex flex-col justify-around p-1 md:p-2">
                          {r2_west.map((s, i) => (
                              <GridSeriesBox key={`w_r2_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Semis ${i+1}`} />
                          ))}
                      </div>
                  </div>
              </div>

              {/* --- COLUMN 4: CONF FINALS --- */}
              <div className="border-r border-slate-800 flex flex-col min-w-0">
                  {/* East Section - REMOVED Inner Header */}
                  <div className={`${EAST_SECTION_HEIGHT} flex flex-col border-b border-slate-800`}>
                      <div className="flex-1 flex flex-col justify-center p-1 md:p-2 bg-slate-950/50">
                          <GridSeriesBox series={cf_east as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="East Finals" />
                      </div>
                  </div>
                  {/* West Section - REMOVED Inner Header */}
                  <div className={`${WEST_SECTION_HEIGHT} flex flex-col bg-slate-950/80`}>
                      <div className="flex-1 flex flex-col justify-center p-1 md:p-2">
                          <GridSeriesBox series={cf_west as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="West Finals" />
                      </div>
                  </div>
              </div>

              {/* --- COLUMN 5: NBA FINALS --- */}
              <div className="flex flex-col relative overflow-hidden border-l border-slate-800 min-w-0 bg-black">
                  {/* Background Gradient with 30% Opacity */}
                  <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: getFinalsGradient() }}></div>
                  
                  {/* Trophy Background Image - Centered and behind content */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <img 
                        src="https://content.sportslogos.net/logos/6/6662/full/_nba_finals_logo_alternate_2022_sportslogosnet-6354.png" 
                        alt="NBA Finals Trophy" 
                        className="w-40 md:w-56 opacity-20 drop-shadow-2xl grayscale" 
                      />
                  </div>
                  
                  <div className="flex-1 flex flex-col items-center justify-center p-1 md:p-2 relative z-10 w-full">
                      <div className="w-full flex flex-col items-center gap-8">
                          <GridSeriesBox series={finals as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="NBA FINALS" />
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};
