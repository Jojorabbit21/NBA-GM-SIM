
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Team, Player, Game } from '../types';
import { LeagueCoachingData } from '../types/coaching';
import { LeaguePickAssets } from '../types/draftAssets';
import { LeagueGMProfiles } from '../types/gm';
import { RosterGrid } from '../components/roster/RosterGrid';
import { RosterOverviewGrid } from '../components/roster/RosterOverviewGrid';
import { RosterStatsStack } from '../components/roster/RosterStatsStack';
import { RosterTabs, RosterTab } from '../components/roster/RosterTabs';
import { TeamGameLog } from '../components/roster/TeamGameLog';
import { TeamScheduleCalendar } from '../components/roster/TeamScheduleCalendar';
import { TeamBadge } from '../components/common/TeamBadge';
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
  onScoreClick?: (gameId: string) => void;
  userId?: string;
  coachingData?: LeagueCoachingData | null;
  onCoachClick?: (teamId: string) => void;
  onGMClick?: (teamId: string) => void;
  leaguePickAssets?: LeaguePickAssets | null;
  leagueGMProfiles?: LeagueGMProfiles | null;
  userNickname?: string;
  /** teamId → 담당 GM 닉네임. AI팀은 null/미포함. 지정 시 이 맵을 우선 사용(멀티플레이어) — 미지정이면 내 팀에 한해 userNickname 표시(싱글플레이어). */
  teamNicknames?: Record<string, string | null>;
  hideTabs?: RosterTab[];
  onTabChange?: (tab: RosterTab) => void;
  /** 시뮬레이션 상의 현재 날짜(YYYY-MM-DD) — "일정" 탭 캘린더의 오늘 강조 기준 */
  currentSimDate?: string;
}

const VALID_ROSTER_TABS: RosterTab[] = ['overview', 'attributes', 'stats', 'records', 'schedule', 'coaching', 'draftPicks'];

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId, onViewPlayer, schedule = [], onViewGameResult, onScoreClick, userId, coachingData, onCoachClick, onGMClick, leaguePickAssets, leagueGMProfiles, userNickname, teamNicknames, hideTabs, onTabChange, currentSimDate }) => {
  // 탭 상태를 URL 쿼리 파라미터(?tab=)로 관리 — 새로고침/북마크/공유 링크에서도 마지막으로
  // 보던 탭이 유지된다. 탭 전환은 히스토리를 계속 쌓지 않고 현재 항목만 갱신(replace) —
  // MultiLeaderboardView의 필터 상태 URL 동기화와 동일한 방침.
  //
  // 팀 전환(헤더 드롭다운 / 경기 기록 탭에서 상대팀 클릭)은 반대로 ?rteam=으로 관리하되
  // push(기본, replace 아님)한다 — 팀 전환은 실제 "이동"이라 뒤로가기로 되돌릴 수 있어야
  // 함(안 그러면 로스터 화면을 건너뛰고 그 이전 화면으로 바로 튕기는 버그가 생김).
  // 키 이름을 MultiRosterView가 이미 쓰는 ?team=(선수 상세용)과 겹치지 않게 rteam으로 분리.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as RosterTab | null;
  const tab: RosterTab = (tabParam && VALID_ROSTER_TABS.includes(tabParam) && !hideTabs?.includes(tabParam))
    ? tabParam
    : 'overview';
  const handleTabChange = (t: RosterTab) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', t);
      return next;
    }, { replace: true });
    onTabChange?.(t);
  };

  const rteamParam = searchParams.get('rteam');
  const fallbackTeamId = initialTeamId || myTeamId;
  const selectedTeamId = (rteamParam && allTeams.some(t => t.id === rteamParam)) ? rteamParam : fallbackTeamId;
  const handleTeamChange = (teamId: string, opts?: { tab?: RosterTab }) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('rteam', teamId);
      if (opts?.tab) next.set('tab', opts.tab);
      return next;
    });
  };

  // 멀티플레이어(MultiRosterView)는 initialTeamId를 location.state(navState.viewTeamId)로
  // 넘기는데, location.state는 실제 URL에 없는 값이라 handleTabChange의 setSearchParams(...,
  // {replace:true}) 호출 한 번만으로도 통째로 사라진다(react-router의 navigator.replace가
  // options.state 미지정 시 undefined로 덮어씀) — 그 결과 진입 직후엔 타팀이 잘 보이다가 아무
  // 탭이나 누르면 내 팀으로 되돌아가는 버그가 있었다. initialTeamId를 마운트 시점에 곧바로
  // ?rteam=으로 URL에 박제해 이후 어떤 setSearchParams 호출에도 살아남게 한다.
  useEffect(() => {
    if (initialTeamId && initialTeamId !== myTeamId && !searchParams.get('rteam')) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('rteam', initialTeamId);
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTeamId]);

  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const teamMenuRef = useRef<HTMLDivElement>(null);

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

  // 정보 라인(컨퍼런스 순위/전적/승률/GB) — schedule 기준 실제 경기 결과 집계.
  // 멀티/싱글 공용 컴포넌트라 멀티 전용 isFinal(정시+10분 공개 딜레이) 없이 played만 기준으로 삼는다.
  const conferenceStandings = useMemo(() => {
    const confTeams = allTeams.filter(t => t.conference === selectedTeam?.conference);
    const records = confTeams.map(t => {
      let wins = 0, losses = 0;
      for (const g of schedule) {
        if (!g.played || g.homeScore == null || g.awayScore == null) continue;
        if (g.homeTeamId !== t.id && g.awayTeamId !== t.id) continue;
        const isHome = g.homeTeamId === t.id;
        const myScore = isHome ? g.homeScore : g.awayScore;
        const oppScore = isHome ? g.awayScore : g.homeScore;
        if (myScore > oppScore) wins++; else losses++;
      }
      const gp = wins + losses;
      return { id: t.id, wins, losses, pct: gp > 0 ? wins / gp : 0 };
    });
    records.sort((a, b) => b.pct - a.pct || b.wins - a.wins);
    const leader = records[0];
    return records.map((r, i) => ({
      ...r,
      rank: i + 1,
      gb: i === 0 || !leader ? 0 : ((leader.wins - leader.losses) - (r.wins - r.losses)) / 2,
    }));
  }, [allTeams, schedule, selectedTeam?.conference]);

  const myStanding = conferenceStandings.find(r => r.id === selectedTeam?.id);
  const confLabel = selectedTeam?.conference === 'West' ? '서부' : '동부';
  const pctLabel = (myStanding?.pct ?? 0).toFixed(3).replace(/^0\./, '.');

  const gmNickname = teamNicknames
    ? teamNicknames[selectedTeam?.id ?? ''] ?? null
    : (isMyTeam ? (userNickname ?? null) : null);

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
                  <span className="text-lg font-black uppercase tracking-wide" style={{ color: theme.text }}>{selectedTeam.city} {selectedTeam.name}</span>
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
                              onClick={() => { handleTeamChange(t.id); setTeamMenuOpen(false); }}
                              className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded transition-colors ${
                                  t.id === selectedTeam.id
                                      ? 'bg-white/15 text-white font-semibold'
                                      : 'font-medium text-zinc-400 hover:bg-white/10 hover:text-white'
                              }`}
                          >
                              <TeamBadge
                                  teamId={t.id}
                                  abbr={t.abbr}
                                  colorPrimary={t.colorPrimary}
                                  colorSecondary={t.colorSecondary}
                                  size="sm"
                              />
                              <span className="truncate">{t.city} {t.name}</span>
                              {t.id === myTeamId && <span className="ml-auto text-[10px] font-bold text-indigo-400 shrink-0">MY</span>}
                          </button>
                      ))}
                  </div>
              )}
          </div>

          {/* 정보 라인 — 컨퍼런스 순위 / 전적 / 승률 / GB */}
          <div className="flex items-center gap-3 ml-4">
              {[
                  `${confLabel} 컨퍼런스 ${myStanding?.rank ?? 0}위`,
                  `${myStanding?.wins ?? 0}W-${myStanding?.losses ?? 0}L`,
                  `${pctLabel} Win%`,
                  `GB ${(myStanding?.gb ?? 0).toFixed(1)}`,
              ].map((label, i) => (
                  <span
                      key={i}
                      className="text-base font-bold whitespace-nowrap"
                      style={{ color: theme.text }}
                  >
                      {label}
                  </span>
              ))}
          </div>

          {gmNickname && (
              <span className="ml-auto text-sm font-semibold" style={{ color: theme.text }}>GM : {gmNickname}</span>
          )}
      </div>

      {/* Tab Navigation — FrontOfficeView 스타일 */}
      <RosterTabs activeTab={tab} onTabChange={handleTabChange} hideTabs={hideTabs} theme={theme} />

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'overview' && (
              <RosterOverviewGrid
                  team={selectedTeam}
                  onPlayerClick={(p) => onViewPlayer(p, selectedTeam.id, selectedTeam.name)}
              />
          )}
          {tab === 'attributes' && (
              <RosterGrid
                  team={selectedTeam}
                  tab="roster"
                  onPlayerClick={(p) => onViewPlayer(p, selectedTeam.id, selectedTeam.name)}
              />
          )}
          {tab === 'stats' && (
              <RosterStatsStack
                  team={selectedTeam}
                  schedule={schedule}
                  onPlayerClick={onViewPlayer}
              />
          )}
          {tab === 'records' && (onViewGameResult || onScoreClick) && (
              <TeamGameLog
                  team={selectedTeam}
                  schedule={schedule}
                  allTeams={allTeams}
                  onViewGameResult={onViewGameResult ?? (() => {})}
                  onScoreClick={onScoreClick}
                  userId={userId}
                  onTeamClick={(teamId) => handleTeamChange(teamId, { tab: 'overview' })}
              />
          )}
          {tab === 'schedule' && (
              <TeamScheduleCalendar
                  team={selectedTeam}
                  schedule={schedule}
                  allTeams={allTeams}
                  onViewGameResult={onViewGameResult}
                  onScoreClick={onScoreClick}
                  userId={userId}
                  currentSimDate={currentSimDate}
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
