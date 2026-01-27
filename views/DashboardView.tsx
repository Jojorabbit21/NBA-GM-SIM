
import React, { useMemo, useState, useEffect } from 'react';
import { Team, Game, Player, OffenseTactic, DefenseTactic } from '../types';
import { GameTactics, generateAutoTactics } from '../services/gameEngine';
import { PlayerDetailModal } from '../components/SharedComponents';
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
}

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  team, teams, schedule, onSim, tactics, onUpdateTactics, 
  currentSimDate, isSimulating, onShowSeasonReview, onShowPlayoffReview, hasPlayoffHistory = false 
}) => {
  // Find the next game for the user's team
  const nextGame = useMemo(() => {
    if (!team?.id) return undefined;
    return schedule.find(g => !g.played && (g.homeTeamId === team.id || g.awayTeamId === team.id));
  }, [schedule, team?.id]);

  // Check if the user has a game scheduled for TODAY (currentSimDate)
  const isGameToday = useMemo(() => {
      if (!currentSimDate || !nextGame) return false;
      return nextGame.date === currentSimDate;
  }, [currentSimDate, nextGame]);

  const isHome = nextGame?.homeTeamId === team?.id;
  const opponentId = isHome ? nextGame?.awayTeamId : nextGame?.homeTeamId;
  const opponent = useMemo(() => teams.find(t => t.id === opponentId), [teams, opponentId]);

  const [activeRosterTab, setActiveRosterTab] = useState<'mine' | 'opponent'>('mine');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);
  
  const { starters, stopperId, defenseTactics } = tactics;
  
  const healthySorted = useMemo(() => (team?.roster || []).filter(p => p.health !== 'Injured').sort((a, b) => b.ovr - a.ovr), [team?.roster]);
  const injuredSorted = useMemo(() => (team?.roster || []).filter(p => p.health === 'Injured').sort((a, b) => b.ovr - a.ovr), [team?.roster]);
  const oppHealthySorted = useMemo(() => (opponent?.roster || []).filter(p => p.health !== 'Injured').sort((a, b) => b.ovr - a.ovr), [opponent?.roster]);
  
  // Ensure starters are valid
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

  // Clean up stopperId if not using AceStopper
  useEffect(() => {
    if (!defenseTactics.includes('AceStopper')) {
      if (stopperId !== undefined) onUpdateTactics({ ...tactics, stopperId: undefined });
    } else if (!stopperId && healthySorted.length > 0) {
      const best = [...healthySorted].sort((a,b) => b.def - a.def)[0];
      if (best) onUpdateTactics({ ...tactics, stopperId: best.id });
    }
  }, [defenseTactics, stopperId, healthySorted, tactics, onUpdateTactics]);

  const myOvr = useMemo(() => {
    if (!team?.roster?.length) return 0;
    return Math.round(team.roster.reduce((s, p) => s + p.ovr, 0) / team.roster.length);
  }, [team?.roster]);

  const opponentOvrValue = useMemo(() => {
    if (!opponent?.roster?.length) return 0;
    return Math.round(opponent.roster.reduce((s, p) => s + p.ovr, 0) / opponent.roster.length);
  }, [opponent?.roster]);

  // Wrapper for calculateTacticScore to inject team/tactics state
  const handleCalculateTacticScore = (type: OffenseTactic | DefenseTactic) => {
      return calculateTacticScore(type, team, tactics);
  };

  const handleAutoSet = () => {
    const autoTactics = generateAutoTactics(team);
    onUpdateTactics(autoTactics);
  };

  const handleSimClick = () => {
    logEvent('Game', 'Simulate', isGameToday ? 'Play Game' : 'Skip Day');
    onSim(tactics);
  };

  const playerTeam = viewPlayer ? (team.roster.some(rp => rp.id === viewPlayer.id) ? team : opponent) : null;

  if (!team) return null;

  return (
    <div className="min-h-screen animate-in fade-in duration-700 ko-normal pb-20 relative text-slate-200 flex flex-col items-center gap-10">
      {viewPlayer && <PlayerDetailModal player={viewPlayer} teamName={playerTeam?.name} teamId={playerTeam?.id} onClose={() => setViewPlayer(null)} />}
      
      {/* Review Banners */}
      <DashboardReviewBanners 
        onShowSeasonReview={onShowSeasonReview} 
        onShowPlayoffReview={onShowPlayoffReview} 
        hasPlayoffHistory={hasPlayoffHistory} 
      />

      {/* Main Dashboard Container */}
      <DashboardHeader 
        team={team}
        nextGame={nextGame}
        opponent={opponent}
        isHome={isHome}
        myOvr={myOvr}
        opponentOvrValue={opponentOvrValue}
        isGameToday={isGameToday}
        isSimulating={isSimulating}
        onSimClick={handleSimClick}
        onShowSeasonReview={onShowSeasonReview}
        onShowPlayoffReview={onShowPlayoffReview}
        hasPlayoffHistory={hasPlayoffHistory}
      />

      <div className="w-full max-w-[1900px] grid grid-cols-1 lg:grid-cols-12 min-h-0 border border-white/10 rounded-3xl overflow-hidden shadow-2xl bg-slate-900/60 backdrop-blur-3xl">
          {/* Left Panel: Roster Table */}
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
          />

          {/* Right Panel: Tactics Board */}
          <TacticsBoard 
            tactics={tactics}
            onUpdateTactics={onUpdateTactics}
            onAutoSet={handleAutoSet}
            calculateTacticScore={handleCalculateTacticScore}
          />
      </div>
    </div>
  );
};
