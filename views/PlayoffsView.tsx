
import React, { useState, useMemo } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../types';
import { GridSeriesBox } from '../components/playoffs/GridSeriesBox';
import { BracketConnector } from '../components/playoffs/BracketConnector';
import { TeamLogo } from '../components/common/TeamLogo';
import { fetchFullGameResult } from '../services/queries';

interface PlayoffsViewProps {
  teams: Team[];
  schedule: Game[];
  series: PlayoffSeries[];
  setSeries: (s: PlayoffSeries[]) => void;
  setSchedule: (g: Game[]) => void;
  myTeamId: string;
  userId?: string;
  onViewGameResult?: (result: any) => void;
}

const SECTION_H = 460;
const CONNECTOR_W = 28;

const ROUND_NAMES: Record<number, string> = { 0: 'Play-In', 1: 'Round 1', 2: 'Semis', 3: 'Conf. Finals', 4: 'BPL Finals' };

export const PlayoffsView: React.FC<PlayoffsViewProps> = ({ teams, schedule, series, setSeries, setSchedule, myTeamId, userId, onViewGameResult }) => {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [fetchingGameId, setFetchingGameId] = useState<string | null>(null);

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

  const getRoundMatch = (conf: 'East' | 'West' | 'BPL', round: number, index: number) => {
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

  const finals = getRoundMatch('BPL', 4, 0);

  const mergePairs = (inputCount: number) => {
    const pairs = [];
    for (let i = 0; i < inputCount; i += 2) {
      pairs.push({ leftIndices: [i, i + 1], rightIndex: i / 2 });
    }
    return pairs;
  };
  const r1SemisPairs = mergePairs(4);
  const semisCfPairs = mergePairs(2);

  /* --- Side panel data --- */
  const allSeriesFlat = useMemo(() => [
    ...pi_east, ...pi_west,
    ...r1_east, ...r1_west,
    ...r2_east, ...r2_west,
    cf_east, cf_west, finals,
  ].filter(Boolean) as PlayoffSeries[], [pi_east, pi_west, r1_east, r1_west, r2_east, r2_west, cf_east, cf_west, finals]);

  const selectedSeries = allSeriesFlat.find(s => s.id === selectedSeriesId);
  const selectedGames = useMemo(() => {
    if (!selectedSeriesId) return [];
    return schedule.filter(g => g.seriesId === selectedSeriesId && g.played)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [schedule, selectedSeriesId]);

  const higherTeam = selectedSeries ? teams.find(t => t.id === selectedSeries.higherSeedId) : undefined;
  const lowerTeam = selectedSeries ? teams.find(t => t.id === selectedSeries.lowerSeedId) : undefined;

  const handleSeriesClick = (s?: PlayoffSeries) => {
    if (!s?.id) return;
    setSelectedSeriesId(prev => prev === s.id ? null : s.id);
  };

  const handleViewBoxScore = async (gameId: string) => {
    if (!userId || !onViewGameResult || fetchingGameId) return;
    setFetchingGameId(gameId);
    try {
      const raw = await fetchFullGameResult(gameId, userId);
      if (raw) {
        const homeTeam = teams.find(t => t.id === raw.home_team_id);
        const awayTeam = teams.find(t => t.id === raw.away_team_id);
        const mappedResult = {
          home: homeTeam, away: awayTeam,
          homeScore: raw.home_score, awayScore: raw.away_score,
          homeBox: raw.box_score?.home || [], awayBox: raw.box_score?.away || [],
          homeTactics: raw.tactics?.home, awayTactics: raw.tactics?.away,
          pbpLogs: raw.pbp_logs || [], pbpShotEvents: raw.shot_events || [],
          rotationData: raw.rotation_data,
          otherGames: [], date: raw.date, recap: []
        };
        if (homeTeam && awayTeam) onViewGameResult(mappedResult);
      }
    } finally {
      setFetchingGameId(null);
    }
  };

  const sb = (s?: PlayoffSeries) => ({
    onClick: () => handleSeriesClick(s),
    selected: s?.id === selectedSeriesId,
  });

  return (
    <div className="flex h-full animate-in fade-in duration-700">
      {/* Bracket */}
      <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0">
        <div className="flex min-w-[900px] h-full">

          {/* ── Play-In ── */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div style={{ height: SECTION_H }}>
              <div className="h-full flex flex-col justify-around p-1 md:p-2">
                <GridSeriesBox series={pi_east[0]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="7 vs 8" isProjected={!hasPlayInStarted} {...sb(pi_east[0])} />
                <GridSeriesBox series={pi_east[1]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="9 vs 10" isProjected={!hasPlayInStarted} {...sb(pi_east[1])} />
                <GridSeriesBox series={pi_east[2]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="8th Decider" isProjected={!hasPlayInStarted} {...sb(pi_east[2])} />
              </div>
            </div>
            <div style={{ height: SECTION_H }}>
              <div className="h-full flex flex-col justify-around p-1 md:p-2">
                <GridSeriesBox series={pi_west[0]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="7 vs 8" isProjected={!hasPlayInStarted} {...sb(pi_west[0])} />
                <GridSeriesBox series={pi_west[1]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="9 vs 10" isProjected={!hasPlayInStarted} {...sb(pi_west[1])} />
                <GridSeriesBox series={pi_west[2]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="8th Decider" isProjected={!hasPlayInStarted} {...sb(pi_west[2])} />
              </div>
            </div>
          </div>

          {/* ── R1 ── */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div style={{ height: SECTION_H }}>
              <div className="h-full flex flex-col justify-around p-1 md:p-2">
                {r1_east.map((s, i) => (
                  <GridSeriesBox key={`e_r1_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Match ${i+1}`} isProjected={series.length===0} {...sb(s as any)} />
                ))}
              </div>
            </div>
            <div style={{ height: SECTION_H }}>
              <div className="h-full flex flex-col justify-around p-1 md:p-2">
                {r1_west.map((s, i) => (
                  <GridSeriesBox key={`w_r1_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Match ${i+1}`} isProjected={series.length===0} {...sb(s as any)} />
                ))}
              </div>
            </div>
          </div>

          {/* ── R1 → Semis connector ── */}
          <div className="flex-shrink-0 flex flex-col" style={{ width: CONNECTOR_W }}>
            <div style={{ height: SECTION_H }}>
              <BracketConnector leftCount={4} rightCount={2} sectionHeight={SECTION_H} pairs={r1SemisPairs} width={CONNECTOR_W} />
            </div>
            <div style={{ height: SECTION_H }}>
              <BracketConnector leftCount={4} rightCount={2} sectionHeight={SECTION_H} pairs={r1SemisPairs} width={CONNECTOR_W} />
            </div>
          </div>

          {/* ── Semis ── */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div style={{ height: SECTION_H }}>
              <div className="h-full flex flex-col justify-around p-1 md:p-2">
                {r2_east.map((s, i) => (
                  <GridSeriesBox key={`e_r2_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Semis ${i+1}`} {...sb(s as any)} />
                ))}
              </div>
            </div>
            <div style={{ height: SECTION_H }}>
              <div className="h-full flex flex-col justify-around p-1 md:p-2">
                {r2_west.map((s, i) => (
                  <GridSeriesBox key={`w_r2_${i}`} series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label={`Semis ${i+1}`} {...sb(s as any)} />
                ))}
              </div>
            </div>
          </div>

          {/* ── Semis → CF connector ── */}
          <div className="flex-shrink-0 flex flex-col" style={{ width: CONNECTOR_W }}>
            <div style={{ height: SECTION_H }}>
              <BracketConnector leftCount={2} rightCount={1} sectionHeight={SECTION_H} pairs={semisCfPairs} width={CONNECTOR_W} />
            </div>
            <div style={{ height: SECTION_H }}>
              <BracketConnector leftCount={2} rightCount={1} sectionHeight={SECTION_H} pairs={semisCfPairs} width={CONNECTOR_W} />
            </div>
          </div>

          {/* ── Conf. Finals ── */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div style={{ height: SECTION_H }}>
              <div className="h-full flex flex-col justify-center p-1 md:p-2">
                <GridSeriesBox series={cf_east as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="East Finals" {...sb(cf_east as any)} />
              </div>
            </div>
            <div style={{ height: SECTION_H }}>
              <div className="h-full flex flex-col justify-center p-1 md:p-2">
                <GridSeriesBox series={cf_west as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="West Finals" {...sb(cf_west as any)} />
              </div>
            </div>
          </div>

          {/* ── CF → Finals connector ── */}
          <div className="flex-shrink-0 flex flex-col" style={{ width: CONNECTOR_W }}>
            <div style={{ height: SECTION_H * 2 }}>
              <BracketConnector leftCount={2} rightCount={1} sectionHeight={SECTION_H * 2} pairs={[{ leftIndices: [0, 1], rightIndex: 0 }]} width={CONNECTOR_W} />
            </div>
          </div>

          {/* ── Finals ── */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="h-full flex items-center justify-center p-2 md:p-4" style={{ height: SECTION_H * 2 }}>
              <div className="w-full max-w-[200px]">
                <GridSeriesBox series={finals as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="BPL FINALS" {...sb(finals as any)} />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Side Panel ── */}
      {selectedSeries && (
        <div className="w-80 flex-shrink-0 border-l border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {ROUND_NAMES[selectedSeries.round] || `Round ${selectedSeries.round}`}
            </span>
            <button onClick={() => setSelectedSeriesId(null)} className="p-1 hover:bg-slate-800 rounded-lg transition-colors">
              <X size={14} className="text-slate-500" />
            </button>
          </div>

          {/* Matchup */}
          <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3">
            {higherTeam && <TeamLogo teamId={higherTeam.id} size="custom" className="w-8 h-8" />}
            <div className="flex-1 min-w-0 text-center">
              <div className="text-xs font-bold text-slate-300 truncate">
                {higherTeam?.name || 'TBD'} vs {lowerTeam?.name || 'TBD'}
              </div>
              <div className="text-lg font-black oswald text-white">
                {selectedSeries.higherSeedWins} - {selectedSeries.lowerSeedWins}
              </div>
            </div>
            {lowerTeam && <TeamLogo teamId={lowerTeam.id} size="custom" className="w-8 h-8" />}
          </div>

          {/* Game list */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {selectedGames.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-600 text-xs font-bold uppercase tracking-widest">
                경기 결과 없음
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {selectedGames.map((g, gIdx) => {
                  const isHome = g.homeTeamId === myTeamId;
                  const myScore = isHome ? g.homeScore : g.awayScore;
                  const oppScore = isHome ? g.awayScore : g.homeScore;
                  const isWin = (myScore || 0) > (oppScore || 0);
                  const isMyGame = g.homeTeamId === myTeamId || g.awayTeamId === myTeamId;

                  return (
                    <div key={g.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-slate-500 w-10 flex-shrink-0">G{gIdx + 1}</span>
                        {isMyGame && (
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${isHome ? 'bg-blue-900/40 text-blue-400' : 'bg-amber-900/40 text-amber-400'}`}>
                            {isHome ? 'HOME' : 'AWAY'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {isMyGame && (
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${isWin ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                            {isWin ? 'W' : 'L'}
                          </span>
                        )}
                        <span className="text-xs font-mono font-bold text-slate-200 tabular-nums">
                          {g.homeScore} - {g.awayScore}
                        </span>
                        {userId && onViewGameResult && (
                          <button
                            onClick={() => handleViewBoxScore(g.id)}
                            disabled={!!fetchingGameId}
                            className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider disabled:opacity-50 flex-shrink-0"
                          >
                            {fetchingGameId === g.id ? <Loader2 size={10} className="animate-spin" /> : 'BOX'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
