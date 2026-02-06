
import React, { useMemo, useState, useEffect } from 'react';
import { Team, Game, Player, OffenseTactic, DefenseTactic, PlayoffSeries, GameTactics } from '../types';
import { generateAutoTactics } from '../services/gameEngine';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { calculatePlayerOvr } from '../utils/constants';
import { logEvent } from '../services/analytics'; 
import { calculateTacticScore } from '../utils/tacticUtils';

// Import sub-components
import { DashboardHeader, DashboardReviewBanners } from '../components/dashboard/DashboardHeader';
import { RosterTable } from '../components/dashboard/RosterTable';
import { TacticsBoard } from '../components/dashboard/TacticsBoard';

interface DashboardViewProps {
  team: Team;
  teams: Team[];
  schedule: Game[];
  onSim: (tactics: GameTactics) => void;
  tactics: GameTactics;
  onUpdateTactics: (t: GameTactics) => void;
  currentSimDate?: string;
  isSimulating?: boolean;
  onShowSeasonReview: () => void;
  onShowPlayoffReview: () => void;
  hasPlayoffHistory?: boolean;
  playoffSeries?: PlayoffSeries[];
  depthChart?: any; 
  onUpdateDepthChart?: (dc: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  team, teams, schedule, onSim, tactics, onUpdateTactics, 
  currentSimDate, isSimulating, onShowSeasonReview, onShowPlayoffReview, hasPlayoffHistory = false,
  playoffSeries = [], depthChart, onUpdateDepthChart
}) => {
  // 1. Find the next game for the user's team
  const nextGameDisplay = useMemo(() => {
      if (!team?.id) return undefined;
      const myGames = schedule.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id);
      myGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return myGames.find(g => !g.played) || myGames[myGames.length - 1];
  }, [schedule, team?.id]);

  const isHome = nextGameDisplay?.homeTeamId === team?.id;
  const opponentId = isHome ? nextGameDisplay?.awayTeamId : nextGameDisplay?.homeTeamId;
  const opponent = useMemo(() => teams.find(t => t.id === opponentId), [teams, opponentId]);

  // 2. Check if the NEXT game is actually TODAY
  const userHasGameToday = useMemo(() => {
      if (!nextGameDisplay || !currentSimDate) return false;
      return nextGameDisplay.date === currentSimDate && !nextGameDisplay.played;
  }, [nextGameDisplay, currentSimDate]);

  // 3. Determine Current Playoff Series
  const currentSeries = useMemo(() => {
      if (!nextGameDisplay?.isPlayoff || !nextGameDisplay.seriesId || !playoffSeries) return undefined;
      return playoffSeries.find(s => s.id === nextGameDisplay.seriesId);
  }, [nextGameDisplay, playoffSeries]);

  // 4. Banner Visibility Logic
  const isRegularSeasonFinished = useMemo(() => {
      if (!team?.id) return false;
      const myRegularGames = schedule.filter(g => !g.isPlayoff && (g.homeTeamId === team.id || g.awayTeamId === team.id));
      return myRegularGames.length > 0 && myRegularGames.every(g => g.played);
  }, [schedule, team?.id]);

  const isPostseasonOver = useMemo(() => {
      if (!team?.id || !playoffSeries || playoffSeries.length === 0) return false;
      const myPlayoffSeries = playoffSeries.filter(s => s.higherSeedId === team.id || s.lowerSeedId === team.id);
      if (myPlayoffSeries.length === 0) return false;

      const latest = [...myPlayoffSeries].sort((a, b) => b.round - a.round)[0];
      if (!latest.finished) return false;

      if (latest.winnerId !== team.id) return true;
      return latest.round === 4;
  }, [playoffSeries, team?.id]);

  const [activeRosterTab, setActiveRosterTab] = useState<'mine' | 'opponent'>('mine');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);
  
  const { starters } = tactics;
  
  const effectiveRoster = team?.roster || [];
  const effectiveOppRoster = opponent?.roster || [];

  // [Fix] Calculate Sort OVR dynamically
  const healthySorted = useMemo(() => effectiveRoster.filter(p => p.health !== 'Injured').sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)), [effectiveRoster]);
  const injuredSorted = useMemo(() => effectiveRoster.filter(p => p.health === 'Injured').sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)), [effectiveRoster]);
  
  // [Fix] Calculate Sort OVR dynamically
  const oppHealthySorted = useMemo(() => effectiveOppRoster.filter(p => p.health !== 'Injured').sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)), [effectiveOppRoster]);
  
  // Auto-Fill Starters if Empty
  useEffect(() => {
    if (healthySorted.length >= 5 && Object.values(starters).every(v => v === '')) {
      const newStarters = {
        PG: healthySorted.find(p => p.position.includes('PG'))?.id || healthySorted[0]?.id || '',
        SG: healthySorted.find(p => p.position.includes('SG') && !['PG'].includes(p.position))?.id || healthySorted[1]?.id || '',
        SF: healthySorted.find(p => p.position.includes('SF'))?.id || healthySorted[2]?.id || '',
        PF: healthySorted.find(p => p.position.includes('PF'))?.id || healthySorted[3]?.id || '',
        C: healthySorted.find(p => p.position === 'C')?.id || healthySorted[4]?.id || ''
      };
      onUpdateTactics({ ...tactics, starters: newStarters });
    }
  }, [healthySorted, starters, tactics, onUpdateTactics]);

  const myOvr = useMemo(() => {
    if (!effectiveRoster.length) return 0;
    return Math.round(effectiveRoster.reduce((s, p) => s + calculatePlayerOvr(p), 0) / effectiveRoster.length);
  }, [effectiveRoster]);

  const opponentOvrValue = useMemo(() => {
    if (!effectiveOppRoster.length) return 0;
    return Math.round(effectiveOppRoster.reduce((s, p) => s + calculatePlayerOvr(p), 0) / effectiveOppRoster.length);
  }, [effectiveOppRoster]);

  const handleCalculateTacticScore = (type: OffenseTactic | DefenseTactic) => {
      return calculateTacticScore(type, { ...team, roster: effectiveRoster }, tactics);
  };

  const handleAutoSet = () => {
    const autoTactics = generateAutoTactics({ ...team, roster: effectiveRoster });
    onUpdateTactics(autoTactics);
  };

  const handleSimClick = () => {
    onSim(tactics);
  };

  const playerTeam = viewPlayer ? (effectiveRoster.some(rp => rp.id === viewPlayer.id) ? team : opponent) : null;

  if (!team) return null;

  return (
    <div className="min-h-screen animate-in fade-in duration-700 ko-normal pb-20 relative text-slate-200 flex flex-col items-center gap-10">
      {viewPlayer && <PlayerDetailModal player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} teamName={playerTeam?.name} teamId={playerTeam?.id} onClose={() => setViewPlayer(null)} allTeams={teams} />}
      
      {/* Review Banners */}
      <DashboardReviewBanners 
        onShowSeasonReview={onShowSeasonReview} 
        onShowPlayoffReview={onShowPlayoffReview} 
        hasPlayoffHistory={hasPlayoffHistory}
        showSeasonBanner={isRegularSeasonFinished}
        showPlayoffBanner={isPostseasonOver}
      />

      <DashboardHeader 
        team={team}
        nextGame={nextGameDisplay}
        opponent={opponent}
        isHome={isHome}
        myOvr={myOvr}
        opponentOvrValue={opponentOvrValue}
        isGameToday={userHasGameToday} 
        isSimulating={isSimulating}
        onSimClick={handleSimClick}
        onShowSeasonReview={onShowSeasonReview}
        onShowPlayoffReview={onShowPlayoffReview}
        hasPlayoffHistory={hasPlayoffHistory}
        currentSeries={currentSeries}
      />

      <div className="w-full max-w-[1900px] grid grid-cols-1 lg:grid-cols-12 min-h-0 border border-white/10 rounded-3xl overflow-hidden shadow-2xl bg-slate-900/80 backdrop-blur-xl">
          <RosterTable 
            activeRosterTab={activeRosterTab}
            setActiveRosterTab={setActiveRosterTab}
            team={team}
            opponent={opponent}
            healthySorted={healthySorted}
            injuredSorted={injuredSorted}
            oppHealthySorted={oppHealthySorted}
            tactics={tactics}
            onUpdateTactics={onUpdateTactics}
            onViewPlayer={setViewPlayer}
            depthChart={depthChart}
            onUpdateDepthChart={onUpdateDepthChart}
          />
          <TacticsBoard 
            tactics={tactics}
            roster={effectiveRoster}
            onUpdateTactics={onUpdateTactics}
            onAutoSet={handleAutoSet}
            calculateTacticScore={handleCalculateTacticScore}
          />
      </div>
    </div>
  );
};
