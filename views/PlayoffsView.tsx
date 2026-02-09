
import React, { useMemo } from 'react';
import { Zap, BarChart3, Trophy } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../types';
import { GridSeriesBox } from '../components/playoffs/GridSeriesBox';
import { TEAM_DATA } from '../data/teamData';
import { PageHeader } from '../components/common/PageHeader';

interface PlayoffsViewProps {
  teams: Team[];
  schedule: Game[];
  series: PlayoffSeries[];
  setSeries: (s: PlayoffSeries[]) => void;
  setSchedule: (g: Game[]) => void;
  myTeamId: string;
}

const HEADER_STYLE = "py-3 px-2 md:px-4 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-900/90 border-r border-slate-800 text-center truncate";
const EAST_SECTION_HEIGHT = "h-[460px]";
const WEST_SECTION_HEIGHT = "h-[460px]";

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

  const pi_east = [getPISeries('East', '7v8'), getPISeries('East', '9v10'), getPISeries('East', '8th')];
  const pi_west = [getPISeries('West', '7v8'), getPISeries('West', '9v10'), getPISeries('West', '8th')];
  
  const r1_east = [getR1Match('East', 1, 8), getR1Match('East', 4, 5), getR1Match('East', 3, 6), getR1Match('East', 2, 7)];
  const r1_west = [getR1Match('West', 1, 8), getR1Match('West', 4, 5), getR1Match('West', 3, 6), getR1Match('West', 2, 7)];
  
  const r2_east = [getRoundMatch('East', 2, 0), getRoundMatch('East', 2, 1)];
  const r2_west = [getRoundMatch('West', 2, 0), getRoundMatch('West', 2, 1)];
  
  const cf_east = getRoundMatch('East', 3, 0);
  const cf_west = getRoundMatch('West', 3, 0);
  
  const finals = getRoundMatch('NBA', 4, 0);

  const getFinalsGradient = () => {
      const defaultGradient = 'linear-gradient(to bottom right, #1d428a, #c8102e)';
      if (!finals) return defaultGradient;
      const team1 = TEAM_DATA[finals.higherSeedId];
      const team2 = TEAM_DATA[finals.lowerSeedId];
      
      const c1 = team1 ? team1.colors.primary : '#1d428a';
      const c2 = team2 ? team2.colors.primary : '#c8102e';
      return `linear-gradient(to bottom right, ${c1}, ${c2})`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20 w-full flex flex-col h-full">
      <PageHeader 
        title="플레이오프" 
        icon={<Trophy size={24} />}
        actions={
            <div className="flex gap-2">
                {regularSeasonFinished && hasPlayInStarted && !isPlayInFinished && (
                    <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-2 rounded-lg border border-slate-800">
                        <Zap size={14} className="text-yellow-400 animate-pulse" />
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Play-In Active</span>
                    </div>
                )}
                {!regularSeasonFinished && (
                    <div className="px-4 py-2 bg-slate-900 rounded-lg border border-slate-800 flex items-center gap-3">
                        <BarChart3 size={14} className="text-emerald-400" />
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">실시간 시드 예측</span>
                    </div>
                )}
            </div>
        }
      />

      <div className="w-full border border-slate-800 bg-slate-900 shadow-2xl rounded-sm">
          <div className="grid grid-cols-[30px_repeat(4,minmax(0,1fr))_1.2fr] w-full">
              <div className={`${HEADER_STYLE} !px-0 bg-slate-950 border-b border-slate-800`}></div>
              <div className={HEADER_STYLE}>Play-In</div>
              <div className={HEADER_STYLE}>Round 1</div>
              <div className={HEADER_STYLE}>Semis</div>
              <div className={HEADER_STYLE}>Conf. Finals</div>
              <div className="py-3 px-2 md:px-4 text-[10px] md:text-[12px] font-black uppercase tracking-[0.1em] md:tracking-[0.2em] text-yellow-500 text-center bg-yellow-950/20 border-b border-yellow-500/30 flex items-center justify-center gap-1 md:gap-2 truncate">
                  NBA FINALS
              </div>

              <div className="flex flex-col border-r border-slate-800">
                  <div className={`${EAST_SECTION_HEIGHT} bg-blue-900/40 border-b border-slate-800 flex items-center justify-center relative overflow-hidden`}>
                      <span className="text-sm font-black text-white uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 cursor-default select-none">EAST</span>
                  </div>
                  <div className={`${WEST_SECTION_HEIGHT} bg-red-900/40 flex items-center justify-center relative overflow-hidden`}>
                      <span className="text-sm font-black text-white uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 cursor-default select-none">WEST</span>
                  </div>
              </div>

              <div className="border-r border-slate-800 flex flex-col min-w-0">
                  <div className={`${EAST_SECTION_HEIGHT} flex flex-col border-b border-slate-800`}>
                      <div className="flex-1 flex flex-col justify-center gap-2 p-1 md:p-2 bg-slate-950/50">
                          <GridSeriesBox series={pi_east[0]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="7 vs 8" isProjected={!hasPlayInStarted} />
                          <GridSeriesBox series={pi_east[1]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="9 vs 10" isProjected={!hasPlayInStarted} />
                          <GridSeriesBox series={pi_east[2]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="8th Decider" isProjected={!hasPlayInStarted} />
                      </div>
                  </div>
                  <div className={`${WEST_SECTION_HEIGHT} flex flex-col bg-slate-950/80`}>
                      <div className="flex-1 flex flex-col justify-center gap-2 p-1 md:p-2">
                          <GridSeriesBox series={pi_west[0]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="7 vs 8" isProjected={!hasPlayInStarted} />
                          <GridSeriesBox series={pi_west[1]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="9 vs 10" isProjected={!hasPlayInStarted} />
                          <GridSeriesBox series={pi_west[2]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="8th Decider" isProjected={!hasPlayInStarted} />
                      </div>
                  </div>
              </div>

              <div className="border-r border-slate-800 flex flex-col min-w-0">
                  <div className={`${EAST_SECTION_HEIGHT} flex flex-col border-b border-slate-800`}>
                      <div className="flex-1 flex flex-col justify-around p-1 md:p-2 bg-slate-950/50">
                          {r1_east.map((s, i) => (
                              <GridSeriesBox key={`e_r1_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Match ${i+1}`} isProjected={series.length===0} />
                          ))}
                      </div>
                  </div>
                  <div className={`${WEST_SECTION_HEIGHT} flex flex-col bg-slate-950/80`}>
                      <div className="flex-1 flex flex-col justify-around p-1 md:p-2">
                          {r1_west.map((s, i) => (
                              <GridSeriesBox key={`w_r1_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Match ${i+1}`} isProjected={series.length===0} />
                          ))}
                      </div>
                  </div>
              </div>

              <div className="border-r border-slate-800 flex flex-col min-w-0">
                  <div className={`${EAST_SECTION_HEIGHT} flex flex-col border-b border-slate-800`}>
                      <div className="flex-1 flex flex-col justify-around p-1 md:p-2 bg-slate-950/50">
                          {r2_east.map((s, i) => (
                              <GridSeriesBox key={`e_r2_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Semis ${i+1}`} />
                          ))}
                      </div>
                  </div>
                  <div className={`${WEST_SECTION_HEIGHT} flex flex-col bg-slate-950/80`}>
                      <div className="flex-1 flex flex-col justify-around p-1 md:p-2">
                          {r2_west.map((s, i) => (
                              <GridSeriesBox key={`w_r2_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Semis ${i+1}`} />
                          ))}
                      </div>
                  </div>
              </div>

              <div className="border-r border-slate-800 flex flex-col min-w-0">
                  <div className={`${EAST_SECTION_HEIGHT} flex flex-col border-b border-slate-800`}>
                      <div className="flex-1 flex flex-col justify-center p-1 md:p-2 bg-slate-950/50">
                          <GridSeriesBox series={cf_east as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="East Finals" />
                      </div>
                  </div>
                  <div className={`${WEST_SECTION_HEIGHT} flex flex-col bg-slate-950/80`}>
                      <div className="flex-1 flex flex-col justify-center p-1 md:p-2">
                          <GridSeriesBox series={cf_west as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="West Finals" />
                      </div>
                  </div>
              </div>

              <div className="flex flex-col relative overflow-hidden border-l border-slate-800 min-w-0 bg-black">
                  <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: getFinalsGradient() }}></div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <img 
                        src="/trophy_dark.png" 
                        alt="NBA Finals Trophy" 
                        className="w-40 md:w-56 opacity-20 drop-shadow-2xl grayscale" 
                        onError={(e) => {
                            // Fallback if local image missing
                            e.currentTarget.src = "https://content.sportslogos.net/logos/6/6662/full/_nba_finals_logo_alternate_2022_sportslogosnet-6354.png";
                        }}
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
