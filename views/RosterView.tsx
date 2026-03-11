
import React, { useState, useMemo, useEffect } from 'react';
import { Team, Player, Game } from '../types';
import { LeagueCoachingData } from '../types/coaching';
import { RosterGrid } from '../components/roster/RosterGrid';
import { RosterTabs } from '../components/roster/RosterTabs';
import { TeamGameLog } from '../components/roster/TeamGameLog';
import { TeamLogo } from '../components/common/TeamLogo';
import { getTeamTheme } from '../utils/teamTheme';
import { TEAM_DATA } from '../data/teamData';

interface RosterViewProps {
  allTeams: Team[];
  myTeamId: string;
  initialTeamId?: string | null;
  tendencySeed?: string;
  onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
  schedule?: Game[];
  onViewGameResult?: (result: any) => void;
  userId?: string;
  coachingData?: LeagueCoachingData | null;
  onCoachClick?: (teamId: string) => void;
}

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId, onViewPlayer, schedule = [], onViewGameResult, userId, coachingData, onCoachClick }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || myTeamId);
  const [tab, setTab] = useState<'roster' | 'records'>('roster');

  useEffect(() => { if (initialTeamId) setSelectedTeamId(initialTeamId); }, [initialTeamId]);

  const selectedTeam = useMemo(() =>
      allTeams.find(t => t.id === selectedTeamId) || allTeams[0]
  , [allTeams, selectedTeamId]);

  const teamColors = TEAM_DATA[selectedTeam?.id]?.colors || null;
  const theme = getTeamTheme(selectedTeam?.id, teamColors);

  const headCoach = coachingData?.[selectedTeam?.id]?.headCoach;

  if (!selectedTeam) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
      {/* Header Bar */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-white/10 flex items-center justify-between" style={{ backgroundColor: theme.bg }}>
          <div className="flex items-center gap-3">
              <TeamLogo teamId={selectedTeam.id} size="sm" />
              <span className="text-sm font-black uppercase tracking-wide" style={{ color: theme.text }}>{selectedTeam.city} {selectedTeam.name}</span>
              <span className="text-xs font-bold" style={{ color: theme.accent }}>{selectedTeam.wins}-{selectedTeam.losses}</span>
              {headCoach && (
                  <>
                      <span className="text-slate-500 text-[10px]">|</span>
                      <span className="text-[10px] text-slate-500 tracking-wider font-bold ko-normal">헤드코치</span>
                      <span
                          className="text-xs font-semibold text-slate-300 hover:text-indigo-400 cursor-pointer transition-colors"
                          onClick={() => onCoachClick?.(selectedTeam.id)}
                      >
                          {headCoach.name}
                      </span>
                  </>
              )}
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
