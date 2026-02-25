
import React, { useState, useMemo, useEffect } from 'react';
import { Users } from 'lucide-react';
import { Team, Player } from '../types';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { calculatePlayerOvr } from '../utils/constants';
import { Dropdown, DropdownButton } from '../components/common/Dropdown';
import { TeamLogo } from '../components/common/TeamLogo';
import { RosterGrid } from '../components/roster/RosterGrid';
import { RosterTabs } from '../components/roster/RosterTabs';

interface RosterViewProps {
  allTeams: Team[];
  myTeamId: string;
  initialTeamId?: string | null;
}

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || myTeamId);
  const [tab, setTab] = useState<'roster' | 'stats' | 'shooting'>('roster');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);

  useEffect(() => { if (initialTeamId) setSelectedTeamId(initialTeamId); }, [initialTeamId]);

  const selectedTeam = useMemo(() => 
      allTeams.find(t => t.id === selectedTeamId) || allTeams[0]
  , [allTeams, selectedTeamId]);

  // Team Select Dropdown Items
  const teamItems = useMemo(() => allTeams.map(t => ({
      id: t.id,
      label: (
          <div className="flex items-center gap-3">
              <TeamLogo teamId={t.id} size="sm" />
              <span className="uppercase">{t.city} {t.name}</span>
          </div>
      ),
      onClick: () => setSelectedTeamId(t.id),
      active: selectedTeamId === t.id
  })), [allTeams, selectedTeamId]);

  if (!selectedTeam) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
      {viewPlayer && (
        <PlayerDetailModal
            player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}}
            teamName={selectedTeam.name}
            teamId={selectedTeam.id}
            onClose={() => setViewPlayer(null)}
            allTeams={allTeams}
        />
      )}

      {/* Header Bar */}
      <div className="flex-shrink-0 px-6 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
              <Users size={16} className="text-slate-500" />
              <span className="text-xs font-black text-slate-300 uppercase tracking-widest">로스터 & 기록</span>
          </div>
          <div className="flex items-center gap-4">
              <RosterTabs activeTab={tab} onTabChange={setTab} />
              <Dropdown
                  trigger={
                      <DropdownButton
                          label={`${selectedTeam.city} ${selectedTeam.name}`}
                          icon={<TeamLogo teamId={selectedTeam.id} size="sm" />}
                      />
                  }
                  items={teamItems}
                  align="right"
                  width="w-72"
              />
          </div>
      </div>

      {/* Grid — fills remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
          <RosterGrid
              team={selectedTeam}
              tab={tab}
              onPlayerClick={setViewPlayer}
          />
      </div>
    </div>
  );
};
