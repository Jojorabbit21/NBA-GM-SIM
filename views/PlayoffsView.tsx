
import React, { useState, useMemo } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../types';
import { GridSeriesBox } from '../components/playoffs/GridSeriesBox';
import { ChevronRight } from 'lucide-react';
import { TeamLogo } from '../components/common/TeamLogo';
import { TEAM_COLORS } from '../data/teamData';
import { fetchFullGameResult } from '../services/queries';
import { fetchPlayoffGameResult } from '../services/playoffService';
import { createTiebreakerComparator } from '../utils/tiebreaker';
import { ROUND_NAMES } from '../utils/playoffLogic';

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



export const PlayoffsView: React.FC<PlayoffsViewProps> = ({ teams, schedule, series, setSeries, setSchedule, myTeamId, userId, onViewGameResult }) => {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [fetchingGameId, setFetchingGameId] = useState<string | null>(null);

  const playInSeries = useMemo(() => series.filter(s => s.round === 0), [series]);
  const hasPlayInStarted = playInSeries.length > 0;

  const regularStandingsSeeds = useMemo(() => {
      const comparator = createTiebreakerComparator(teams, schedule);
      const getSeeds = (conf: 'East' | 'West') => {
        return [...teams]
          .filter(t => t.conference === conf)
          .sort(comparator);
      };
      return { East: getSeeds('East'), West: getSeeds('West') };
  }, [teams, schedule]);

  const seedMap = useMemo(() => {
      const map: Record<string, number> = {};
      regularStandingsSeeds.East.forEach((t, i) => map[t.id] = i + 1);
      regularStandingsSeeds.West.forEach((t, i) => map[t.id] = i + 1);

      // 플레이인 결과가 나오는 즉시 시드 오버라이드 (시리즈 ID로 검색)
      (['East', 'West'] as const).forEach(conf => {
          const piGames = playInSeries.filter(s => s.conference === conf);
          const pi7v8 = piGames.find(s => s.id.includes('7v8'));
          const piDecider = piGames.find(s => s.id.includes('8th'));
          if (pi7v8?.winnerId) map[pi7v8.winnerId] = 7;
          if (piDecider?.winnerId) map[piDecider.winnerId] = 8;
      });
      return map;
  }, [teams, regularStandingsSeeds, series, playInSeries]);

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

  // 플레이인 결과를 반영한 R1 프로젝션용 시드 배열
  const projectedR1Seeds = useMemo(() => {
      const getSeeds = (conf: 'East' | 'West'): (Team | undefined)[] => {
          const ranked = regularStandingsSeeds[conf];
          const piGames = playInSeries.filter(s => s.conference === conf);

          if (piGames.length === 0) return ranked.slice(0, 8);

          // 플레이인 참가팀 ID 수집 → 상위 6팀에서 제외
          const playInTeamIds = new Set<string>();
          piGames.forEach(s => {
              if (s.higherSeedId && !s.higherSeedId.includes('TBD')) playInTeamIds.add(s.higherSeedId);
              if (s.lowerSeedId && !s.lowerSeedId.includes('TBD')) playInTeamIds.add(s.lowerSeedId);
          });
          const topSix = ranked.filter(t => !playInTeamIds.has(t.id)).slice(0, 6);

          const pi7v8 = piGames.find(s => s.id.includes('7v8'));
          const piDecider = piGames.find(s => s.id.includes('8th'));

          const seed7 = pi7v8?.winnerId
              ? teams.find(t => t.id === pi7v8.winnerId)
              : undefined; // 미결정 시 TBD
          const seed8 = piDecider?.winnerId
              ? teams.find(t => t.id === piDecider.winnerId)
              : undefined; // 미결정 시 TBD

          return [...topSix, seed7, seed8];
      };
      return { East: getSeeds('East'), West: getSeeds('West') };
  }, [teams, regularStandingsSeeds, playInSeries]);

  const getR1Match = (conf: 'East' | 'West', matchId: string, hSeed: number, lSeed: number) => {
      // 실제 생성된 시리즈는 ID로 정확히 검색
      const existing = series.find(s => s.id === `${conf}_R1_${matchId}`);
      if (existing) return existing;

      // 프로젝션: 플레이인 결과 반영된 시드 배열 사용
      const seeds = projectedR1Seeds[conf];
      return {
          higherSeedId: seeds[hSeed - 1]?.id || '',
          lowerSeedId: seeds[lSeed - 1]?.id || '',
          conference: conf,
      };
  };

  const getRoundMatch = (conf: 'East' | 'West' | 'BPL', round: number, index: number) => {
      const candidates = series.filter(s => s.conference === conf && s.round === round);
      return candidates[index] || null;
  };

  const pi_east = [getPISeries('East', '7v8'), getPISeries('East', '9v10'), getPISeries('East', '8th')];
  const pi_west = [getPISeries('West', '7v8'), getPISeries('West', '9v10'), getPISeries('West', '8th')];

  const r1_east = [getR1Match('East', 'M1', 1, 8), getR1Match('East', 'M2', 4, 5), getR1Match('East', 'M3', 3, 6), getR1Match('East', 'M4', 2, 7)];
  const r1_west = [getR1Match('West', 'M1', 1, 8), getR1Match('West', 'M2', 4, 5), getR1Match('West', 'M3', 3, 6), getR1Match('West', 'M4', 2, 7)];

  const r2_east = [getRoundMatch('East', 2, 0), getRoundMatch('East', 2, 1)];
  const r2_west = [getRoundMatch('West', 2, 0), getRoundMatch('West', 2, 1)];

  const cf_east = getRoundMatch('East', 3, 0);
  const cf_west = getRoundMatch('West', 3, 0);

  const finals = getRoundMatch('BPL', 4, 0);

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
      const raw = await fetchPlayoffGameResult(gameId, userId) || await fetchFullGameResult(gameId, userId);
      if (raw) {
        const homeTeam = teams.find(t => t.id === raw.home_team_id);
        const awayTeam = teams.find(t => t.id === raw.away_team_id);
        const mappedResult = {
          gameId,
          home: homeTeam, away: awayTeam,
          homeScore: raw.home_score, awayScore: raw.away_score,
          homeBox: raw.box_score?.home || [], awayBox: raw.box_score?.away || [],
          homeTactics: raw.tactics?.home, awayTactics: raw.tactics?.away,
          pbpLogs: raw.pbp_logs || [], pbpShotEvents: raw.shot_events || [],
          rotationData: raw.rotation_data,
          quarterScoresData: raw.quarter_scores,
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

  const conn = (paths: string[]) => (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full block">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgb(51,65,85)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      ))}
    </svg>
  );

  return (
    <div className="flex h-full animate-in fade-in duration-700">
      {/* Bracket — CSS Grid: 9 rows × 6 columns */}
      <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0">
        <div
          className="min-w-[1050px] min-h-full px-6 pt-5 pb-10"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 40px 1fr 40px 1fr 40px 1fr 40px 1fr 40px 1fr',
            gridTemplateRows: 'repeat(9, minmax(110px, 1fr))',
            gap: '12px 0',
          }}
        >
          {/* ══ East Play-In ══ */}
          <div className="flex items-center" style={{ gridColumn: 1, gridRow: '1 / 3' }}>
            <GridSeriesBox series={pi_east[1]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="동부 플레이인 9 VS 10" isProjected={!hasPlayInStarted} {...sb(pi_east[1])} />
          </div>
          {/* c: PI-A→PI-B East (9v10 승자 → 8시드 결정전) */}
          <div style={{ gridColumn: 2, gridRow: '1 / 5' }}>
            {conn(['M 0,25 H 50 V 75 H 100'])}
          </div>
          <div className="flex items-center" style={{ gridColumn: 3, gridRow: '1 / 3' }}>
            <GridSeriesBox series={pi_east[0]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="동부 7시드 결정전" isProjected={!hasPlayInStarted} {...sb(pi_east[0])} />
          </div>
          <div className="flex items-center" style={{ gridColumn: 3, gridRow: '3 / 5' }}>
            <GridSeriesBox series={pi_east[2]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="동부 8시드 결정전" isProjected={!hasPlayInStarted} {...sb(pi_east[2])} />
          </div>

          {/* c: PI-B→R1 East (crossing X — 7시드→2v7, 8시드→1v8) */}
          <div style={{ gridColumn: 4, gridRow: '1 / 5' }}>
            {conn(['M 0,25 H 35 V 88 H 100', 'M 0,75 H 65 V 12 H 100'])}
          </div>

          {/* ══ East R1 (col 5) ══ */}
          {r1_east.map((s, i) => (
            <div key={`e_r1_${i}`} className="flex items-center" style={{ gridColumn: 5, gridRow: i + 1 }}>
              <GridSeriesBox series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="동부 1라운드" isProjected={series.length===0} {...sb(s as any)} />
            </div>
          ))}
          {/* c: R1→Semis East */}
          <div style={{ gridColumn: 6, gridRow: '1 / 3' }}>
            {conn(['M 0,25 H 50 V 75 H 0', 'M 50,50 H 100'])}
          </div>
          <div style={{ gridColumn: 6, gridRow: '3 / 5' }}>
            {conn(['M 0,25 H 50 V 75 H 0', 'M 50,50 H 100'])}
          </div>

          {/* ══ East Semis (col 7) ══ */}
          {r2_east.map((s, i) => (
            <div key={`e_r2_${i}`} className="flex items-center" style={{ gridColumn: 7, gridRow: `${i * 2 + 1} / ${i * 2 + 3}` }}>
              <GridSeriesBox series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="동부 2라운드" {...sb(s as any)} />
            </div>
          ))}
          {/* c: Semis→CF East */}
          <div style={{ gridColumn: 8, gridRow: '1 / 5' }}>
            {conn(['M 0,25 H 50 V 75 H 0', 'M 50,50 H 100'])}
          </div>

          {/* ══ East CF (col 9) ══ */}
          <div className="flex items-center" style={{ gridColumn: 9, gridRow: '1 / 5' }}>
            <GridSeriesBox series={cf_east as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="동부 컨퍼런스 파이널" {...sb(cf_east as any)} />
          </div>

          {/* c: CF→Finals (단일 셀, 9행 span) */}
          <div style={{ gridColumn: 10, gridRow: '1 / 10' }}>
            {conn(['M 0,22 H 50 V 78 H 0', 'M 50,50 H 100'])}
          </div>

          {/* ══ Finals (row 5, col 11) ══ */}
          <div className="flex items-center justify-center" style={{ gridColumn: 11, gridRow: 5 }}>
            <GridSeriesBox series={finals as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="파이널" {...sb(finals as any)} />
          </div>

          {/* ══ West Play-In ══ */}
          <div className="flex items-center" style={{ gridColumn: 1, gridRow: '6 / 8' }}>
            <GridSeriesBox series={pi_west[1]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="서부 플레이인 9 VS 10" isProjected={!hasPlayInStarted} {...sb(pi_west[1])} />
          </div>
          {/* c: PI-A→PI-B West */}
          <div style={{ gridColumn: 2, gridRow: '6 / 10' }}>
            {conn(['M 0,25 H 50 V 75 H 100'])}
          </div>
          <div className="flex items-center" style={{ gridColumn: 3, gridRow: '6 / 8' }}>
            <GridSeriesBox series={pi_west[0]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="서부 7시드 결정전" isProjected={!hasPlayInStarted} {...sb(pi_west[0])} />
          </div>
          <div className="flex items-center" style={{ gridColumn: 3, gridRow: '8 / 10' }}>
            <GridSeriesBox series={pi_west[2]} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="서부 8시드 결정전" isProjected={!hasPlayInStarted} {...sb(pi_west[2])} />
          </div>

          {/* c: PI-B→R1 West (crossing X — 7시드→2v7, 8시드→1v8) */}
          <div style={{ gridColumn: 4, gridRow: '6 / 10' }}>
            {conn(['M 0,25 H 35 V 88 H 100', 'M 0,75 H 65 V 12 H 100'])}
          </div>

          {/* ══ West R1 (col 5) ══ */}
          {r1_west.map((s, i) => (
            <div key={`w_r1_${i}`} className="flex items-center" style={{ gridColumn: 5, gridRow: i + 6 }}>
              <GridSeriesBox series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="서부 1라운드" isProjected={series.length===0} {...sb(s as any)} />
            </div>
          ))}
          {/* c: R1→Semis West */}
          <div style={{ gridColumn: 6, gridRow: '6 / 8' }}>
            {conn(['M 0,25 H 50 V 75 H 0', 'M 50,50 H 100'])}
          </div>
          <div style={{ gridColumn: 6, gridRow: '8 / 10' }}>
            {conn(['M 0,25 H 50 V 75 H 0', 'M 50,50 H 100'])}
          </div>

          {/* ══ West Semis (col 7) ══ */}
          {r2_west.map((s, i) => (
            <div key={`w_r2_${i}`} className="flex items-center" style={{ gridColumn: 7, gridRow: `${i * 2 + 6} / ${i * 2 + 8}` }}>
              <GridSeriesBox series={s as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="서부 2라운드" {...sb(s as any)} />
            </div>
          ))}
          {/* c: Semis→CF West */}
          <div style={{ gridColumn: 8, gridRow: '6 / 10' }}>
            {conn(['M 0,25 H 50 V 75 H 0', 'M 50,50 H 100'])}
          </div>

          {/* ══ West CF (col 9) ══ */}
          <div className="flex items-center" style={{ gridColumn: 9, gridRow: '6 / 10' }}>
            <GridSeriesBox series={cf_west as any} teams={teams} myTeamId={myTeamId} seedMap={seedMap} label="서부 컨퍼런스 파이널" {...sb(cf_west as any)} />
          </div>
        </div>
      </div>

      {/* ── Side Panel ── */}
      {selectedSeries && (() => {
        const conf = selectedSeries.conference as 'East' | 'West' | 'BPL';
        const confLabel = conf === 'East' ? '동부' : conf === 'West' ? '서부' : '';
        const higherColor = higherTeam ? TEAM_COLORS[higherTeam.id]?.primary : 'rgb(30,41,59)';
        const lowerColor = lowerTeam ? TEAM_COLORS[lowerTeam.id]?.primary : 'rgb(30,41,59)';

        return (
          <div className="w-80 flex-shrink-0 border-l border-slate-800 bg-slate-900 flex flex-col overflow-hidden">
            {/* Header + Matchup (통합) */}
            <div
              className="px-4 pt-3 pb-4 border-b border-slate-800 flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${higherColor}, ${lowerColor})` }}
            >
              <div className="flex items-center mb-4">
                <div className="w-1/3">
                  {confLabel && <span className="text-xs font-black text-white/60 tracking-widest">{confLabel}</span>}
                </div>
                <div className="w-1/3 text-center">
                  <span className="text-xs font-black text-white tracking-wide">
                    {ROUND_NAMES[selectedSeries.round] || `${selectedSeries.round}라운드`}
                  </span>
                </div>
                <div className="w-1/3 flex justify-end">
                  <button onClick={() => setSelectedSeriesId(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                    <X size={14} className="text-white/80" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {higherTeam && <TeamLogo teamId={higherTeam.id} size="custom" className="w-8 h-8" />}
                <div className="flex-1 min-w-0 text-center">
                  <div className="text-xs font-bold text-white/90 truncate">
                    {higherTeam?.name || 'TBD'} vs {lowerTeam?.name || 'TBD'}
                  </div>
                  <div className="text-lg font-black text-white">
                    {selectedSeries.higherSeedWins} - {selectedSeries.lowerSeedWins}
                  </div>
                </div>
                {lowerTeam && <TeamLogo teamId={lowerTeam.id} size="custom" className="w-8 h-8" />}
              </div>
            </div>

            {/* Game list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {selectedGames.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-600 text-xs font-bold tracking-widest">
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
                      <div key={g.id} className="flex items-center px-4 py-3 hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-2 w-16 flex-shrink-0">
                          <span className="text-xs font-bold text-slate-500">{gIdx + 1}차전</span>
                          {isMyGame && (
                            <span className={`text-xs font-black px-1 py-0.5 rounded ${isWin ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                              {isWin ? 'W' : 'L'}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 flex items-center justify-center gap-2">
                          <span className="text-xs font-bold text-slate-400 uppercase">{g.homeTeamId}</span>
                          <span className="text-xs font-mono font-bold text-slate-200 tabular-nums">
                            {g.homeScore} - {g.awayScore}
                          </span>
                          <span className="text-xs font-bold text-slate-400 uppercase">{g.awayTeamId}</span>
                        </div>
                        <div className="w-16 flex-shrink-0 flex justify-end">
                          {userId && onViewGameResult && (
                            <button
                              onClick={() => handleViewBoxScore(g.id)}
                              disabled={!!fetchingGameId}
                              className="flex items-center gap-0.5 text-xs font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                            >
                              {fetchingGameId === g.id ? <Loader2 size={10} className="animate-spin" /> : (<>자세히<ChevronRight size={12} /></>)}
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
        );
      })()}
    </div>
  );
};
