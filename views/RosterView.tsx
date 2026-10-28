
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
import { TeamPayrollTable, type RosterCapSettings } from '../components/roster/TeamPayrollTable';
import { TeamLogo } from '../components/common/TeamLogo';
import { Dropdown } from '../components/common/Dropdown';
import { HeadCoachTable } from '../components/dashboard/CoachProfileCard';
import { GMProfileCard } from '../components/dashboard/GMProfileCard';
import { DraftPicksPanel } from '../components/frontoffice/DraftPicksPanel';
import { getTeamTheme } from '../utils/teamTheme';
import { getReadableTextColor } from '../utils/colorContrast';
import { IconButton } from '../components/common/IconButton';
import { TEAM_DATA } from '../data/teamData';
import type { TeamAdvancedStatsWithRank } from '../hooks/useTeamSeasonAdvancedStats';
import { useViewportClass } from '../hooks/useViewportClass';
import { ActionSheet } from '../components/mobile/ActionSheet';
import { PhoneRosterOverview, PhoneRosterSummary } from '../components/roster/PhoneRosterOverview';
import { PhoneRosterAttributes } from '../components/roster/PhoneRosterAttributes';
import { PhoneRosterStats } from '../components/roster/PhoneRosterStats';
import { PhoneTeamGameLog } from '../components/roster/PhoneTeamGameLog';
import { PhoneTeamSchedule } from '../components/roster/PhoneTeamSchedule';
import { PhoneTeamPayroll } from '../components/roster/PhoneTeamPayroll';

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
  /** 헤더 우측 영역을 직접 그린다 — teamId에 대해 null이 아닌 값을 돌려주면 위 "GM : 닉네임" 대신 그 노드를 표시(멀티플레이어 AI 팀 프런트). */
  renderTeamFront?: (teamId: string) => React.ReactNode;
  hideTabs?: RosterTab[];
  onTabChange?: (tab: RosterTab) => void;
  /** 시뮬레이션 상의 현재 날짜(YYYY-MM-DD) — "일정" 탭 캘린더의 오늘 강조 기준 */
  currentSimDate?: string;
  /** 리그 샐러리캡 설정(멀티플레이어 전용) — 전달된 경우에만 "재정" 탭이 노출됨.
   * 싱글플레이어는 이 prop을 넘기지 않으므로 자동으로 탭이 숨겨짐(별도 hideTabs 지정 불필요). */
  capSettings?: RosterCapSettings;
  /** "재정" 탭 페이롤 테이블의 첫 시즌 연도(예: 2026 → "2026-27" 컬럼부터 시작). */
  baseSeasonYear?: number;
  /** teamId → Off Rtg/Def Rtg/Pace(+리그 순위) — 포제션 추정이 필요해 싱글플레이어는 소스가
   * 없으므로 이 prop 자체가 없으면(미지정) 헤더에서 해당 줄을 통째로 숨긴다(멀티플레이어 전용). */
  advancedStatsByTeam?: Record<string, TeamAdvancedStatsWithRank>;
  /** 선수 이름 hover 시 능력치+스탯 팝업 표시 — 멀티플레이어 전용 기능이라 지정된 경우에만 켜짐. */
  enableHoverCard?: boolean;
  /** 지정된 경우 "내 팀"을 볼 때만 개요 탭에 방출 버튼이 표시됨(멀티플레이어 전용 — 싱글플레이어는 미지정). */
  onReleasePlayer?: (player: Player, teamId: string) => void;
  /** 방출 처리 중인 선수 id — 버튼 로딩/비활성 표시용. */
  releasingId?: string | null;
  /** 지정 시 "본인 팀"을 보고 있을 때만 탭 그룹 최우측에 "팀 설정" 탭이 노출됨(멀티플레이어 전용). */
  enableTeamSettingsTab?: boolean;
  /** "팀 설정" 탭 컨텐츠 렌더러 — RosterView는 팀 컬러/코트 컬러 등 멀티 전용 필드를 모르므로
   * 호출부(MultiRosterView)가 자체 컨텍스트로 그리는 패널을 그대로 주입받아 배치만 한다. */
  renderTeamSettingsPanel?: () => React.ReactNode;
  /** "로스터" 탭 테이블 하단 "정규 계약 슬롯" 푸터의 분모 — 팀당 최대 로스터 인원(멀티플레이어
   * leagues.max_roster_size, 15~20). 미지정 시(싱글플레이어) NBA 기본 정원 15명으로 표시. */
  maxRosterSize?: number;
  /** "로스터" 탭 테이블 하단 "투웨이 슬롯" 푸터의 분모(멀티플레이어 leagues.two_way_slots,
   * 1~5). 미지정 시(싱글플레이어) 기본 3명으로 표시. */
  twoWaySlots?: number;
  /** "투웨이 슬롯" 푸터 표시 여부(기본 true). 멀티플레이어는 CBA 규정이 꺼진 리그에서 false를
   * 넘겨 숨긴다(RosterOverviewGrid.tsx의 동명 prop 참고). */
  showTwoWaySlots?: boolean;
  /** [2026-10-17] 멀티 전용 — 로스터 탭 "체력" 열 데이터(RosterOverviewGrid.playerConditions). 미전달 시 열 없음(싱글). */
  playerConditions?: Map<string, number | null>;
  /** [2026-10-27] 폰 팀색 헤더 우측 액션(검색·수신함) — 멀티는 MobileHeaderActions를 넘긴다(RosterView는 리그 컨텍스트를 모름). */
  phoneHeaderActions?: React.ReactNode;
}

const VALID_ROSTER_TABS: RosterTab[] = ['overview', 'attributes', 'stats', 'records', 'schedule', 'finance', 'coaching', 'draftPicks', 'settings'];

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId, onViewPlayer, schedule = [], onViewGameResult, onScoreClick, userId, coachingData, onCoachClick, onGMClick, leaguePickAssets, leagueGMProfiles, userNickname, teamNicknames, renderTeamFront, hideTabs, onTabChange, currentSimDate, capSettings, baseSeasonYear, enableHoverCard = false, onReleasePlayer, releasingId, enableTeamSettingsTab, renderTeamSettingsPanel, advancedStatsByTeam, maxRosterSize, twoWaySlots, showTwoWaySlots, playerConditions, phoneHeaderActions }) => {
  // 탭 상태를 URL 쿼리 파라미터(?tab=)로 관리 — 새로고침/북마크/공유 링크에서도 마지막으로
  // 보던 탭이 유지된다. 탭 전환은 히스토리를 계속 쌓지 않고 현재 항목만 갱신(replace) —
  // MultiLeaderboardView의 필터 상태 URL 동기화와 동일한 방침.
  //
  // 팀 전환(헤더 드롭다운 / 경기 기록 탭에서 상대팀 클릭)은 반대로 ?rteam=으로 관리하되
  // push(기본, replace 아님)한다 — 팀 전환은 실제 "이동"이라 뒤로가기로 되돌릴 수 있어야
  // 함(안 그러면 로스터 화면을 건너뛰고 그 이전 화면으로 바로 튕기는 버그가 생김).
  // 키 이름을 MultiRosterView가 이미 쓰는 ?team=(선수 상세용)과 겹치지 않게 rteam으로 분리.
  const [searchParams, setSearchParams] = useSearchParams();

  const rteamParam = searchParams.get('rteam');
  const fallbackTeamId = initialTeamId || myTeamId;
  const selectedTeamId = (rteamParam && allTeams.some(t => t.id === rteamParam)) ? rteamParam : fallbackTeamId;
  // 배너 로고 좌측 위/아래 버튼 — allTeams(드롭다운과 동일 순서)에서 ±1칸, 양 끝은 반대편으로 순환.
  // selectedTeam(useMemo)은 아래에서 선언되므로 여기선 먼저 계산된 selectedTeamId를 쓴다.
  const stepTeam = (delta: 1 | -1) => {
    if (!selectedTeamId || allTeams.length === 0) return;
    const idx = allTeams.findIndex(t => t.id === selectedTeamId);
    const next = allTeams[(idx + delta + allTeams.length) % allTeams.length];
    if (next && next.id !== selectedTeamId) handleTeamChange(next.id);
  };

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
  // [2026-10-27] 모바일 팀 화면 — 폰(<768)은 아래 phone 분기(팀색 H3 헤더 + compact 탭 + 폰 표). 데스크톱 렌더 불변.
  const isPhone = useViewportClass() === 'phone';
  const [teamSheetOpen, setTeamSheetOpen] = useState(false);

  // [2026-10-12] ↑/↓ 방향키로 이전/다음 팀 이동(사용자 요청). stepTeam은 렌더마다 새로 만들어지므로
  // ref로 최신 함수를 들고 리스너는 한 번만 등록. 입력 요소에 포커스가 있거나(검색창 등) 팀 드롭다운이
  // 열려 있을 땐 무시 — 그 외엔 preventDefault로 페이지/테이블 스크롤 대신 팀 전환을 우선한다.
  const stepTeamRef = useRef(stepTeam);
  stepTeamRef.current = stepTeam;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (teamMenuOpen) return;
      e.preventDefault();
      stepTeamRef.current(e.key === 'ArrowUp' ? -1 : 1);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [teamMenuOpen]);

  const selectedTeam = useMemo(() =>
      allTeams.find(t => t.id === selectedTeamId) || allTeams[0]
  , [allTeams, selectedTeamId]);

  // 멀티플레이어에서 팀 설정으로 지정한 커스텀 컬러(selectedTeam.colorPrimary)가 있으면 그걸
  // 우선 사용 — 없으면(싱글플레이/미설정) 기존처럼 TEAM_DATA(실제 NBA 팀 컬러)로 폴백.
  // 커스텀 컬러가 있을 땐 THEME_OVERRIDES(실제 NBA 팀 slug 기준 보정 규칙)를 적용하지 않도록
  // teamId 자리에 null을 넘긴다 — team_slug가 실제 NBA slug와 같아 잘못 매칭될 수 있기 때문.
  const teamColors = selectedTeam?.colorPrimary
      ? {
          primary: selectedTeam.colorPrimary,
          secondary: selectedTeam.colorSecondary || '#64748b',
          text: selectedTeam.colorText || getReadableTextColor(selectedTeam.colorPrimary),
        }
      : (TEAM_DATA[selectedTeam?.id]?.colors || null);
  const theme = getTeamTheme(selectedTeam?.colorPrimary ? null : (selectedTeam?.id ?? null), teamColors);

  const headCoach = coachingData?.[selectedTeam?.id]?.headCoach;
  const isMyTeam = selectedTeam?.id === myTeamId;

  // capSettings가 없으면(싱글플레이어) "재정" 탭 자체를 숨김 — 호출부마다 hideTabs에
  // 'finance'를 일일이 추가하지 않아도 되도록 여기서 한 번에 처리.
  // "팀 설정" 탭도 마찬가지로 기본 숨김 — enableTeamSettingsTab이 켜져 있고(멀티플레이어)
  // 지금 보고 있는 팀이 내 팀일 때만 노출한다(다른 팀을 볼 땐 숨김).
  const effectiveHideTabs = useMemo(() => {
    const base = [...(hideTabs ?? [])];
    if (!capSettings) base.push('finance' as RosterTab);
    if (!enableTeamSettingsTab || !isMyTeam) base.push('settings' as RosterTab);
    return base;
  }, [hideTabs, capSettings, enableTeamSettingsTab, isMyTeam]);

  const tabParam = searchParams.get('tab') as RosterTab | null;
  const tab: RosterTab = (tabParam && VALID_ROSTER_TABS.includes(tabParam) && !effectiveHideTabs.includes(tabParam))
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

  // Pts/g・Opp Pts/g + 리그(전체 30팀) 순위 — GB 계산과 동일하게 스케줄 최종 스코어만으로 산출.
  // Off Rtg/Def Rtg/Pace(advancedStatsByTeam)와 달리 포제션 추정이 필요 없어 싱글/멀티 공용.
  const leagueScoringStats = useMemo(() => {
    const totals: Record<string, { pts: number; opp: number; g: number }> = {};
    for (const t of allTeams) totals[t.id] = { pts: 0, opp: 0, g: 0 };
    for (const g of schedule) {
      if (!g.played || g.homeScore == null || g.awayScore == null) continue;
      const h = totals[g.homeTeamId];
      const a = totals[g.awayTeamId];
      if (h) { h.pts += g.homeScore; h.opp += g.awayScore; h.g++; }
      if (a) { a.pts += g.awayScore; a.opp += g.homeScore; a.g++; }
    }
    const rows = allTeams.map(t => ({
      id: t.id,
      ppg: totals[t.id].g > 0 ? totals[t.id].pts / totals[t.id].g : 0,
      oppg: totals[t.id].g > 0 ? totals[t.id].opp / totals[t.id].g : 0,
    }));
    const ppgRank: Record<string, number> = {};
    [...rows].sort((a, b) => b.ppg - a.ppg).forEach((r, i) => { ppgRank[r.id] = i + 1; });
    const oppgRank: Record<string, number> = {};
    [...rows].sort((a, b) => a.oppg - b.oppg).forEach((r, i) => { oppgRank[r.id] = i + 1; });

    const map: Record<string, { ppg: number; oppg: number; ppgRank: number; oppgRank: number }> = {};
    for (const r of rows) map[r.id] = { ppg: r.ppg, oppg: r.oppg, ppgRank: ppgRank[r.id], oppgRank: oppgRank[r.id] };
    return map;
  }, [allTeams, schedule]);

  const myScoring = leagueScoringStats[selectedTeam?.id ?? ''];
  const myAdvanced = advancedStatsByTeam?.[selectedTeam?.id ?? ''];

  const gmNickname = teamNicknames
    ? teamNicknames[selectedTeam?.id ?? ''] ?? null
    : (isMyTeam ? (userNickname ?? null) : null);
  const teamFront = renderTeamFront && selectedTeam ? renderTeamFront(selectedTeam.id) : null;

  // [2026-10-27] 탭 콘텐츠 — 데스크톱/폰 두 렌더가 공유(폰 1차는 overview만 전용 표, 나머지는 그대로).
  const renderTabContent = () => {
    if (!selectedTeam) return null;
    return (
      <>
          {tab === 'overview' && (
              <RosterOverviewGrid
                  team={selectedTeam}
                  allTeams={allTeams}
                  onPlayerClick={(p) => onViewPlayer(p, selectedTeam.id, selectedTeam.name)}
                  enableHoverCard={enableHoverCard}
                  onReleasePlayer={isMyTeam && onReleasePlayer ? (p) => onReleasePlayer(p, selectedTeam.id) : undefined}
                  releasingId={releasingId}
                  maxRosterSize={maxRosterSize}
                  twoWaySlots={twoWaySlots}
                  showTwoWaySlots={showTwoWaySlots}
                  playerConditions={playerConditions}
              />
          )}
          {tab === 'attributes' && (
              <RosterGrid
                  team={selectedTeam}
                  tab="roster"
                  onPlayerClick={(p) => onViewPlayer(p, selectedTeam.id, selectedTeam.name)}
                  enableHoverCard={enableHoverCard}
              />
          )}
          {tab === 'stats' && (
              <RosterStatsStack
                  team={selectedTeam}
                  schedule={schedule}
                  onPlayerClick={onViewPlayer}
                  enableHoverCard={enableHoverCard}
                  teamAdvanced={advancedStatsByTeam}
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
                  onPlayerClick={onViewPlayer}
                  onTeamClick={(teamId) => handleTeamChange(teamId, { tab: 'overview' })}
                  enableHoverCard={enableHoverCard}
              />
          )}
          {tab === 'finance' && capSettings && (
              <TeamPayrollTable
                  team={selectedTeam}
                  capSettings={capSettings}
                  baseSeasonYear={baseSeasonYear ?? new Date().getFullYear()}
                  onPlayerClick={(p) => onViewPlayer(p, selectedTeam.id, selectedTeam.name)}
                  enableHoverCard={enableHoverCard}
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
          {tab === 'settings' && isMyTeam && renderTeamSettingsPanel && (
              <div className="h-full overflow-y-auto custom-scrollbar">
                  {renderTeamSettingsPanel()}
              </div>
          )}
      </>
    );
  };

  if (!selectedTeam) return null;

  if (isPhone) {
    // §8-3 H3: 상단 바(안전영역 포함) 배경 = 팀 color_primary, 구분선 없음. 좌 로고 = 검정 35% 원 28 안에 로고 20(밝은 팀색이면 흰 35%).
    // 제목 2줄 = 팀명 18/700 + "W–L · 동부 N위" 12(80%). 제목 탭 = 팀 선택 바텀 시트(데스크톱 드롭다운 대체). 우측 ‹ › = 이전/다음 팀.
    const headerText = theme.text;
    // 글자색이 어두우면(밝은 팀색) 로고 원을 흰 35%로 — 휘도로 판정(#RRGGBB가 아니면 어두운 배경으로 간주)
    const hex = /^#([0-9a-f]{6})$/i.exec(headerText.trim())?.[1];
    const lum = hex ? (0.2126 * parseInt(hex.slice(0, 2), 16) + 0.7152 * parseInt(hex.slice(2, 4), 16) + 0.0722 * parseInt(hex.slice(4, 6), 16)) : 255;
    const darkText = lum < 128;
    const circleBg = darkText ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
    const teamSheetItems = allTeams.map(t => ({
      value: t.id,
      label: (
        <span className={`flex items-center gap-2 min-w-0 ${t.id === myTeamId ? 'text-amber-200' : ''}`}>
          <TeamLogo teamId={t.id} teamName={t.abbr ?? t.id} size="custom" className="w-6 h-6 shrink-0" shadow={false} />
          <span className="truncate">{t.city} {t.name}</span>
        </span>
      ),
    }));
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <header className="shrink-0 pt-safe" style={{ backgroundColor: theme.bg, color: headerText }}>
          <div className="h-14 flex items-center gap-2.5 pl-4 pr-2">
            <span className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center" style={{ backgroundColor: circleBg }}>
              <TeamLogo teamId={selectedTeam.id} teamName={selectedTeam.name} size="custom" className="w-5 h-5" shadow={false} />
            </span>
            <button type="button" onClick={() => setTeamSheetOpen(true)} aria-haspopup="dialog" className="flex-1 min-w-0 flex flex-col text-left active:opacity-80">
              <span className="flex items-center gap-1 min-w-0">
                <span className="text-lg leading-6 font-bold truncate">{selectedTeam.city} {selectedTeam.name}</span>
                <ChevronDown size={16} className="shrink-0 opacity-70" />
              </span>
              <span className="text-xs leading-4 font-medium opacity-80 tabular-nums truncate">
                {myStanding?.wins ?? 0}–{myStanding?.losses ?? 0} · {confLabel} {myStanding?.rank ?? 0}위
              </span>
            </button>
            {/* 우측 = 검색·수신함(멀티가 슬롯으로 넘김, 글자색 상속). 이전/다음 팀 이동은 제목 탭 → 팀 선택 시트로(액션 ≤2 규칙, 2026-10-27). */}
            {phoneHeaderActions}
          </div>
        </header>
        <ActionSheet open={teamSheetOpen} title="팀 선택" items={teamSheetItems} value={selectedTeam.id} onSelect={id => handleTeamChange(id)} onClose={() => setTeamSheetOpen(false)} />
        <RosterTabs activeTab={tab} onTabChange={handleTabChange} hideTabs={effectiveHideTabs} theme={theme} compact />
        {tab === 'overview' || tab === 'attributes' ? (
          // 폰 표는 자연 높이 — 이 영역 하나가 세로·가로 스크롤을 다 맡는다(표 안의 sticky 열·헤더·팀 평균 행이 이 상자를 기준으로 고정).
          // 우측 24px 페이드는 스크롤 상자 밖(형제)에 두어 가로 스크롤과 무관하게 제자리.
          <div className="relative flex-1 min-h-0 flex flex-col">
          {/* 로스터 요약 줄은 스크롤 상자 밖(탭 아래 고정) — 가로 스크롤에 밀리지 않게(2026-10-27) */}
          {tab === 'overview' && (
            <PhoneRosterSummary team={selectedTeam} maxRosterSize={maxRosterSize} twoWaySlots={twoWaySlots} showTwoWaySlots={showTwoWaySlots} capSettings={capSettings} />
          )}
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar overscroll-x-contain">
            {tab === 'overview' ? (
              <PhoneRosterOverview
                team={selectedTeam}
                allTeams={allTeams}
                onPlayerClick={(p) => onViewPlayer(p, selectedTeam.id, selectedTeam.name)}
                playerConditions={playerConditions}
              />
            ) : (
              <PhoneRosterAttributes
                team={selectedTeam}
                onPlayerClick={(p) => onViewPlayer(p, selectedTeam.id, selectedTeam.name)}
                playerConditions={playerConditions}
              />
            )}
            <div aria-hidden="true" className="h-14 pb-safe sticky left-0" />
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-r from-transparent to-slate-900" />
          </div>
        ) : tab === 'records' && onScoreClick ? (
          // 폰 경기 기록 = 카드형(§9-1-4, 상단 필터 줄·스크롤 상자 포함). onScoreClick(멀티 경기 상세)이 없는 호출부(싱글)는 아래 데스크톱 표 폴백.
          <PhoneTeamGameLog team={selectedTeam} schedule={schedule} allTeams={allTeams} onScoreClick={onScoreClick} />
        ) : tab === 'schedule' && onScoreClick ? (
          // 폰 일정 = 월 내비 고정 + 달력 + 리스트(날짜·상대·결과만, §9-1-5). 싱글(onScoreClick 없음)은 데스크톱 폴백.
          <PhoneTeamSchedule team={selectedTeam} schedule={schedule} allTeams={allTeams} onScoreClick={onScoreClick} currentSimDate={currentSimDate} />
        ) : tab === 'finance' && capSettings ? (
          // 폰 재정 = 요약 블록 고정 + 축약 금액 표(§9-1-6).
          <PhoneTeamPayroll
            team={selectedTeam}
            capSettings={capSettings}
            baseSeasonYear={baseSeasonYear ?? new Date().getFullYear()}
            onPlayerClick={(p) => onViewPlayer(p, selectedTeam.id, selectedTeam.name)}
            playerConditions={playerConditions}
          />
        ) : tab === 'stats' ? (
          <PhoneRosterStats
            team={selectedTeam}
            schedule={schedule}
            onPlayerClick={onViewPlayer}
            teamAdvanced={advancedStatsByTeam}
            playerConditions={playerConditions}
          />
        ) : (
          // 나머지 탭은 1차에선 데스크톱 컴포넌트 그대로(내부 스크롤) — 폰 틀은 탭별로 이어서 적용(§9-1-4~§9-1-7).
          <div className="flex-1 min-h-0 overflow-hidden pb-14">
            {renderTabContent()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
      {/* Header Bar — 좌: 팀 로고 / 우: 팀 정보(드롭다운+전적+순위+스탯) 2컬럼 */}
      {/* [2026-10-12] 배너의 팀 테마 배경/텍스트 색 제거 → slate-950 + 흰 텍스트(사용자 요청).
          theme는 아래 RosterTabs(탭 바)에서는 계속 사용. */}
      {/* z-20: isolate가 만든 스태킹 컨텍스트 안의 z-[200]은 바깥 형제(탭 바·테이블)에 대해선 z-auto와 같아,
          드롭다운이 아래 탭 바에 가려졌다. 헤더 자체를 형제보다 위 레이어로 올려 해결. */}
      <div className="relative z-20 isolate flex-shrink-0 px-9 py-8 border-b border-white/10 flex items-center gap-4 bg-slate-950">
          {/* [2026-10-12] 팀 테마 컬러 45% 틴트 — slate-950 위에 팀 색을 반투명으로 한 겹 얹는다.
              컨테이너 isolate로 스태킹 컨텍스트를 만들어 -z-10 오버레이가 "컨테이너 배경 위, 콘텐츠 아래"에
              정확히 깔리게 함(isolate 없으면 -z-10이 컨테이너 배경 뒤로 숨어 안 보임). */}
          <div
              aria-hidden
              className="absolute inset-0 -z-10 pointer-events-none"
              style={{ backgroundColor: selectedTeam.colorPrimary ?? theme.bg, opacity: 0.45 }}
          />
          {/* [2026-10-12] 로고 크기를 고정 96px(w-24)에서 "정보 섹션 높이"에 맞춰 늘림 — 래퍼를
              self-stretch로 배너 콘텐츠 높이(=가장 큰 자식인 정보 섹션)만큼 세우고 aspect-square로
              같은 폭을 잡는다. 정보 줄 수(싱글은 Off/Def Rtg 줄 없음)·폰트가 달라져도 자동 추종. */}
          {/* 이미지는 absolute로 띄워 래퍼의 콘텐츠 높이에 안 잡히게 한다 — 안 그러면 img 원본 크기가
              래퍼→배너 높이를 키우고 그걸 다시 래퍼가 따라가는 순환으로 로고가 과대해진다(2026-10-12 실측). */}
          <div className="relative self-stretch aspect-square shrink-0">
              {/* 멀티/싱글 구분 없이 TeamLogo 공용(public/logos/teams/, 리그 로고 1회 폴백) */}
              <TeamLogo teamId={selectedTeam.id} teamName={selectedTeam.name} size="custom" className="absolute inset-0 w-full h-full" />
          </div>

          {/* [2026-10-12] 로고 우측 위/아래 Chevron(로고 | 화살표 | 정보 순서) — 드롭다운과 같은 allTeams 순서로 이전/다음 팀 이동(끝에서 순환). */}
          <div className="flex flex-col items-center justify-center gap-1 shrink-0 -ml-2">
              <IconButton label="이전 팀" tone="subtle" onClick={() => stepTeam(-1)}>
                  <ChevronUp size={18} />
              </IconButton>
              <IconButton label="다음 팀" tone="subtle" onClick={() => stepTeam(1)}>
                  <ChevronDown size={18} />
              </IconButton>
          </div>
          {/* 로고↔화살표 간격: 컨테이너 gap-4(16)에서 -ml-2로 8px로 축소. */}

          {/* [2026-10-12] 로고↔정보 간격만 16→24px: 컨테이너 gap-4(16)는 GM 닉네임 등 다른 자식에도
              걸리므로 건드리지 않고, 정보 섹션에 ml-2(8)를 더해 이 한 곳만 24px로 맞춘다. */}
          {/* [2026-10-12] 정보 섹션 타이포/구조는 당일 반복 수정(B안·테이블화·행 병합·문단화) 후 사용자
              요청으로 원형 복원. 색(text-white)과 ml-2만 별도 요청 사항이라 유지. */}
          <div className="flex flex-col gap-1 min-w-0 ml-2">
              {/* 1행 — 팀이름 드랍다운 */}
              {/* [2026-10-16] 패널을 공용 Dropdown(포털, body 직속)으로 이관 — 기존 absolute 패널은 아래
                  본문(스크롤 컨테이너)의 스태킹/overflow에 잘려 들어갔음. 내 팀은 노란 틴트로 구분. */}
              <div className="w-fit">
                  <Dropdown
                      align="left"
                      width="w-64"
                      isOpen={teamMenuOpen}
                      onOpenChange={setTeamMenuOpen}
                      trigger={
                          <span className="flex items-center gap-3 group">
                              <span className="text-lg font-black tracking-wide text-white">{selectedTeam.city} {selectedTeam.name}</span>
                              {teamMenuOpen
                                  ? <ChevronUp size={16} className="shrink-0 opacity-70 group-hover:opacity-100 text-white" />
                                  : <ChevronDown size={16} className="shrink-0 opacity-70 group-hover:opacity-100 text-white" />
                              }
                          </span>
                      }
                      items={allTeams.map(t => {
                          const isSelected = t.id === selectedTeam.id;
                          const isMine     = t.id === myTeamId;
                          return {
                              id: t.id,
                              active: isSelected,
                              label: (
                                  <span className={`flex items-center gap-2 min-w-0 w-full rounded ${isMine ? 'text-amber-200' : ''}`}>
                                      <TeamLogo teamId={t.id} teamName={t.abbr ?? t.id} size="custom" className="w-6 h-6 shrink-0" shadow={false} />
                                      <span className="truncate">{t.city} {t.name}</span>
                                  </span>
                              ),
                              onClick: () => handleTeamChange(t.id),
                          };
                      })}
                  />
              </div>

              {/* 2행 — 전적 / 승률 / GB */}
              <div className="flex items-center gap-3">
                  {[
                      `${myStanding?.wins ?? 0}W-${myStanding?.losses ?? 0}L`,
                      `${pctLabel} Win%`,
                      `GB ${(myStanding?.gb ?? 0).toFixed(1)}`,
                  ].map((label, i) => (
                      <span key={i} className="text-sm font-bold whitespace-nowrap text-white">{label}</span>
                  ))}
              </div>

              {/* 3행 — 컨퍼런스 순위 */}
              <span className="text-sm font-bold whitespace-nowrap text-white">
                  {confLabel} 컨퍼런스 {myStanding?.rank ?? 0}위
              </span>

              {/* 4행 — Pts/g・Opp Pts/g (리그 순위) — 스케줄 최종 스코어만으로 계산, 싱글/멀티 공용 */}
              <div className="flex items-center gap-4">
                  <span className="text-xs font-semibold whitespace-nowrap opacity-80 text-white">
                      Pts/g : {(myScoring?.ppg ?? 0).toFixed(1)} (리그 {myScoring?.ppgRank ?? 0}위)
                  </span>
                  <span className="text-xs font-semibold whitespace-nowrap opacity-80 text-white">
                      Opp Pts/g : {(myScoring?.oppg ?? 0).toFixed(1)} (리그 {myScoring?.oppgRank ?? 0}위)
                  </span>
              </div>

              {/* 5행 — Off/Def Rtg・Pace (리그 순위) — 포제션 추정이 필요해 advancedStatsByTeam이
                  있을 때만(멀티플레이어) 표시. 싱글플레이어는 소스가 없어 줄 자체를 숨김. */}
              {myAdvanced && (
                  <div className="flex items-center gap-4">
                      <span className="text-xs font-semibold whitespace-nowrap opacity-80 text-white">
                          Off Rtg : {myAdvanced.offRtg.toFixed(1)} (리그 {myAdvanced.offRtgRank}위)
                      </span>
                      <span className="text-xs font-semibold whitespace-nowrap opacity-80 text-white">
                          Def Rtg : {myAdvanced.defRtg.toFixed(1)} (리그 {myAdvanced.defRtgRank}위)
                      </span>
                      <span className="text-xs font-semibold whitespace-nowrap opacity-80 text-white">
                          Pace : {myAdvanced.pace.toFixed(1)} (리그 {myAdvanced.paceRank}위)
                      </span>
                  </div>
              )}
          </div>

          {teamFront ?? (gmNickname && (
              <span className="ml-auto text-sm font-semibold self-start text-white">GM : {gmNickname}</span>
          ))}
      </div>

      {/* Tab Navigation — FrontOfficeView 스타일 */}
      <RosterTabs activeTab={tab} onTabChange={handleTabChange} hideTabs={effectiveHideTabs} theme={theme} />

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {renderTabContent()}
      </div>
    </div>
  );
};
