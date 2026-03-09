
import React, { useState, useMemo, useEffect } from 'react';
import { Team, Player, Game } from '../types';
import { RosterGrid } from '../components/roster/RosterGrid';
import { RosterTabs } from '../components/roster/RosterTabs';
import { TeamGameLog } from '../components/roster/TeamGameLog';
import { TeamLogo } from '../components/common/TeamLogo';

interface RosterViewProps {
  allTeams: Team[];
  myTeamId: string;
  initialTeamId?: string | null;
  tendencySeed?: string;
  onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
  schedule?: Game[];
  onViewGameResult?: (result: any) => void;
  userId?: string;
}

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId, onViewPlayer, schedule = [], onViewGameResult, userId }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || myTeamId);
  const [tab, setTab] = useState<'roster' | 'records'>('roster');

  useEffect(() => { if (initialTeamId) setSelectedTeamId(initialTeamId); }, [initialTeamId]);

  const selectedTeam = useMemo(() =>
      allTeams.find(t => t.id === selectedTeamId) || allTeams[0]
  , [allTeams, selectedTeamId]);

  if (!selectedTeam) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
      {/* Header Bar */}
      <div className="flex-shrink-0 px-6 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
              <TeamLogo teamId={selectedTeam.id} size="sm" />
              <span className="text-sm font-black text-white uppercase oswald tracking-wide">{selectedTeam.city} {selectedTeam.name}</span>
              <span className="text-xs font-bold text-slate-500">{selectedTeam.wins}-{selectedTeam.losses}</span>
          </div>
          <RosterTabs activeTab={tab} onTabChange={setTab} />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'roster' && (
              <RosterGrid
                  team={selectedTeam}
                  tab="roster"
                  onPlayerClick={(p) => onViewPlayer(p, selectedTeam.id, selectedTeam.name)}
              />
          )}
          {tab === 'records' && onViewGameResult && (
              <TeamGameLog
                  team={selectedTeam}
                  schedule={schedule}
                  allTeams={allTeams}
                  onViewGameResult={onViewGameResult}
                  userId={userId}
              />
          )}
      </div>
    </div>
  );
};
