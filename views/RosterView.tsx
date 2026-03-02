
import React, { useState, useMemo, useEffect } from 'react';
import { Users } from 'lucide-react';
import { Team, Player } from '../types';
import { RosterGrid } from '../components/roster/RosterGrid';
import { RosterTabs } from '../components/roster/RosterTabs';

interface RosterViewProps {
  allTeams: Team[];
  myTeamId: string;
  initialTeamId?: string | null;
  tendencySeed?: string;
  onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
}

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId, onViewPlayer }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || myTeamId);
  const [tab, setTab] = useState<'roster' | 'stats' | 'shooting'>('roster');

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
              <Users size={16} className="text-slate-500" />
              <span className="text-xs font-black text-slate-300 uppercase tracking-widest">선수단</span>
          </div>
          <RosterTabs activeTab={tab} onTabChange={setTab} />
      </div>

      {/* Grid — fills remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
          <RosterGrid
              team={selectedTeam}
              tab={tab}
              onPlayerClick={(p) => onViewPlayer(p, selectedTeam.id, selectedTeam.name)}
          />
      </div>
    </div>
  );
};
