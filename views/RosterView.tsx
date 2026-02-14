
import React, { useState, useMemo, useEffect } from 'react';
import { Users } from 'lucide-react';
import { Team, Player } from '../types';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { calculatePlayerOvr } from '../utils/constants';
import { PageHeader } from '../components/common/PageHeader';
import { Dropdown, DropdownButton } from '../components/common/Dropdown';
import { TeamLogo } from '../components/common/TeamLogo';
import { SalaryCapDashboard } from '../components/roster/SalaryCapDashboard';
import { RosterGrid } from '../components/roster/RosterGrid';
import { RosterTabs } from '../components/roster/RosterTabs';

interface RosterViewProps {
  allTeams: Team[];
  myTeamId: string;
  initialTeamId?: string | null;
}

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || myTeamId);
  const [tab, setTab] = useState<'roster' | 'stats' | 'salary'>('roster');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);

  useEffect(() => { if (initialTeamId) setSelectedTeamId(initialTeamId); }, [initialTeamId]);

  const selectedTeam = useMemo(() => 
      allTeams.find(t => t.id === selectedTeamId) || allTeams[0]
  , [allTeams, selectedTeamId]);

  const teamStats = useMemo(() => {
    if (!selectedTeam) return null;
    const roster = selectedTeam.roster;
    const totalSalary = roster.reduce((sum, p) => sum + p.salary, 0);
    return { salary: totalSalary, count: roster.length };
  }, [selectedTeam]);

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
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 pb-20">
      {viewPlayer && (
        <PlayerDetailModal 
            player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} 
            teamName={selectedTeam.name} 
            teamId={selectedTeam.id} 
            onClose={() => setViewPlayer(null)} 
            allTeams={allTeams} 
        />
      )}

      {/* 1. Header */}
      <PageHeader 
        title="로스터 & 기록" 
        description="선수단 구성 및 기록 확인"
        icon={<Users size={24} />}
        actions={
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
        }
      />

      {/* 2. Salary Cap Info (Only on Salary Tab) */}
      {tab === 'salary' && teamStats && (
          <SalaryCapDashboard currentTotalSalary={teamStats.salary} />
      )}

      {/* 3. Controls & Grid */}
      <div className="flex flex-col gap-4">
          <RosterTabs activeTab={tab} onTabChange={setTab} />
          
          <RosterGrid 
              team={selectedTeam} 
              tab={tab} 
              onPlayerClick={setViewPlayer} 
          />
      </div>
    </div>
  );
};
