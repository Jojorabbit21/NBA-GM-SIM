
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Team, Player, Game } from '../types';
import { LeagueCoachingData } from '../types/coaching';
import { LeaguePickAssets } from '../types/draftAssets';
import { LeagueGMProfiles } from '../types/gm';
import { RosterGrid } from '../components/roster/RosterGrid';
import { RosterTabs, RosterTab } from '../components/roster/RosterTabs';
import { TeamGameLog } from '../components/roster/TeamGameLog';
import { TeamLogo } from '../components/common/TeamLogo';
import { HeadCoachTable } from '../components/dashboard/CoachProfileCard';
import { GMProfileCard } from '../components/dashboard/GMProfileCard';
import { DraftPicksPanel } from '../components/frontoffice/DraftPicksPanel';
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
  onGMClick?: (teamId: string) => void;
  leaguePickAssets?: LeaguePickAssets | null;
  leagueGMProfiles?: LeagueGMProfiles | null;
  userNickname?: string;
  hideTabs?: RosterTab[];
}

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId, onViewPlayer, schedule = [], onViewGameResult, userId, coachingData, onCoachClick, onGMClick, leaguePickAssets, leagueGMProfiles, userNickname, hideTabs }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || myTeamId);
  const [tab, setTab] = useState<RosterTab>('roster');
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const teamMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (initialTeamId) setSelectedTeamId(initialTeamId); }, [initialTeamId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (teamMenuRef.current && !teamMenuRef.current.contains(e.target as Node)) setTeamMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedTeam = useMemo(() =>
      allTeams.find(t => t.id === selectedTeamId) || allTeams[0]
  , [allTeams, selectedTeamId]);

  const teamColors = TEAM_DATA[selectedTeam?.id]?.colors || null;
  const theme = getTeamTheme(selectedTeam?.id, teamColors);

  const headCoach = coachingData?.[selectedTeam?.id]?.headCoach;
  const isMyTeam = selectedTeam?.id === myTeamId;

  if (!selectedTeam) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
      {/* Header Bar — 팀 정보 + 팀 전환 드롭다운 */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-white/10 flex items-center" style={{ backgroundColor: theme.bg }}>
          <div className="relative" ref={teamMenuRef}>
              <button
                  onClick={() => setTeamMenuOpen(o => !o)}
                  className="flex items-center gap-3 group"
              >
                  <TeamLogo teamId={selectedTeam.id} size="sm" />
                  <span className="text-sm font-black uppercase tracking-wide" style={{ color: theme.text }}>{selectedTeam.city} {selectedTeam.name}</span>
                  <span className="text-xs font-bold" style={{ color: theme.accent }}>{selectedTeam.wins}-{selectedTeam.losses}</span>
                  {teamMenuOpen
                      ? <ChevronUp size={16} className="shrink-0 opacity-70 group-hover:opacity-100" style={{ color: theme.text }} />
                      : <ChevronDown size={16} className="shrink-0 opacity-70 group-hover:opacity-100" style={{ color: theme.text }} />
                  }
              </button>
              {teamMenuOpen && (
                  <div className="absolute top-full left-0 mt-2 bg-black border border-zinc-700 rounded-lg p-2 flex flex-col gap-0.5 z-[200] min-w-[220px] max-h-80 overflow-y-auto custom-scrollbar">
                      {allTeams.map(t => (
                          <button
                              key={t.id}
                              onClick={() => { setSelectedTeamId(t.id); setTeamMenuOpen(false); }}
                              className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded transition-colors ${
                                  t.id === selectedTeam.id
                                      ? 'bg-white/15 text-white font-semibold'
                                      : 'font-medium text-zinc-400 hover:bg-white/10 hover:text-white'
                              }`}
                          >
                              <TeamLogo teamId={t.id} size="sm" />
                              <span className="truncate">{t.city} {t.name}</span>
                              {t.id === myTeamId && <span className="ml-auto text-[10px] font-bold text-indigo-400 shrink-0">MY</span>}
                          </button>
                      ))}
                  </div>
              )}
          </div>
      </div>

      {/* Tab Navigation — FrontOfficeView 스타일 */}
      <RosterTabs activeTab={tab} onTabChange={setTab} hideTabs={hideTabs} />

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
          {tab === 'coaching' && (
              <div className="h-full overflow-y-auto custom-scrollbar">
                  {/* GM */}
                  <GMProfileCard
                      gmProfile={leagueGMProfiles?.[selectedTeam.id]}
                      onGMClick={() => onGMClick?.(selectedTeam.id)}
                  />

                  {/* Coach */}
                  <HeadCoachTable
                      coach={headCoach}
                      onCoachClick={() => onCoachClick?.(selectedTeam.id)}
                  />
              </div>
          )}
          {tab === 'draftPicks' && (
              <div className="h-full overflow-y-auto custom-scrollbar">
                  <DraftPicksPanel teamId={selectedTeam.id} leaguePickAssets={leaguePickAssets} />
              </div>
          )}
      </div>
    </div>
  );
};
