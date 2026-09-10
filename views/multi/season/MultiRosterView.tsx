
import React, { useMemo, useCallback, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { releasePlayer } from '../../../services/multi/faService';
import { useSeasonContext } from './seasonContext';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { useLeagueRawStats, useRoomGamePbp, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { useTeamSeasonAdvancedStats } from '../../../hooks/useTeamSeasonAdvancedStats';
import { usePlayerSeasonStatsFull } from '../../../hooks/usePlayerSeasonStatsFull';
import { RosterView } from '../../RosterView';
import { TeamSettingsPanel } from '../../../components/multi/TeamSettingsPanel';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import { buildActiveInjurySeverityMap } from '../../../services/multi/activeInjuryStatus';
import { findCurrentVirtualDate } from './multiScheduleUtils';
import { getServerNow } from '../../../utils/serverClock';
import { computeGameLeaders, type GameLeaders } from '../../../services/multi/gameLeadersCache';
import type { Team, Player, Game } from '../../../types';
import type { PlayerStats } from '../../../types/player';

// game_pbp box(선수별)에서 팀 단위 경기별 합산 스탯 산출 (TeamGameLog의 homeStats/awayStats용)
function sumTeamBoxStats(box: any[]): Record<string, number> {
    const keys = ['reb', 'offReb', 'defReb', 'ast', 'stl', 'blk', 'tov', 'pf', 'techFouls', 'flagrantFouls', 'fgm', 'fga', 'p3m', 'p3a', 'ftm', 'fta'];
    const s: Record<string, number> = Object.fromEntries(keys.map(k => [k, 0]));
    for (const bs of box) {
        for (const k of keys) s[k] += bs[k] ?? 0;
    }
    return s;
}

// game_pbp 행들에서 gameId → { homeStats, awayStats } 맵 생성 (TeamGameLog 팀 스탯 컬럼용)
function buildGameTeamStatsMap(pbpRows: any[]): Map<string, { homeStats: Record<string, number>; awayStats: Record<string, number> }> {
    const map = new Map<string, { homeStats: Record<string, number>; awayStats: Record<string, number> }>();
    for (const row of pbpRows) {
        if (!row.game_id) continue;
        map.set(row.game_id, {
            homeStats: sumTeamBoxStats(row.home_box ?? []),
            awayStats: sumTeamBoxStats(row.away_box ?? []),
        });
    }
    return map;
}

// game_pbp 행들에서 gameId → 경기 리더(PTS/REB/AST) 맵 생성 (TeamScheduleCalendar
// "최우수선수" 컬럼용) — MultiScheduleView.tsx가 쓰는 computeGameLeaders와 동일 로직 재사용.
function buildGameLeadersMap(pbpRows: any[]): Map<string, GameLeaders> {
    const map = new Map<string, GameLeaders>();
    for (const row of pbpRows) {
        if (!row.game_id) continue;
        map.set(row.game_id, computeGameLeaders(row.home_box ?? [], row.away_box ?? []));
    }
    return map;
}

const MultiRosterView: React.FC = () => {
    const { league, room, leagueTeams, members, isLoading: leagueLoading, reload } = useLeagueContext();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const { session } = useGame();
    const { schedule, currentSimDate: roomSimDate } = useSeasonContext();
    const { data: advancedStatsByTeam, isPending: advancedStatsLoading } = useTeamSeasonAdvancedStats(room?.id);

    // MultiScheduleView.tsx와 동일한 preferVirtual 패턴 — 메인리그(main_league)는
    // 로스터 일정 탭의 달력이 가상 NBA 시즌 캘린더(game.date)로 그려지는데,
    // room.sim_date(roomSimDate)는 실제 KST 날짜(scheduler.ts의 kstDateFromMs 참조,
    // 서버가 다음 경기 실행 타이밍을 잡기 위한 값)라 직접 비교하면 항상 어긋난다 —
    // findCurrentVirtualDate로 계산한 가상 "오늘"을 써야 한다. main_league가 아닌
    // 리그 타입(예: 토너먼트)은 애초에 date가 실제 시각 기준이라 roomSimDate를 그대로 쓴다.
    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    const preferVirtual = league?.type === 'main_league';
    const currentSimDate = useMemo(() => {
        if (!preferVirtual) return roomSimDate;
        return findCurrentVirtualDate(schedule, simStart, gprd, getServerNow()) ?? roomSimDate;
    }, [preferVirtual, roomSimDate, schedule, simStart, gprd]);

    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { getGameUrlId } = useGameShortCodes(room?.id);
    const { getPlayerUrlId } = usePlayerShortCodes();

    const myTeamId = useMemo(
        () => members.find(m => m.user_id === session?.user?.id)?.team_id ?? null,
        [members, session],
    );

    // 방출 RPC(release_player)는 league_teams.id(uuid)를 받는다 — myTeamId(team_slug)로
    // 실제 팀 행을 찾아 그 uuid를 전달한다. MultiFreeAgentView.tsx의 계약 버튼과 동일 패턴.
    const myTeamRow = useMemo(
        () => leagueTeams.find(lt => lt.team_slug === myTeamId) ?? null,
        [leagueTeams, myTeamId],
    );
    const [releasingId, setReleasingId] = useState<string | null>(null);
    const [releaseError, setReleaseError] = useState<string | null>(null);
    const handleReleasePlayer = useCallback(async (player: Player) => {
        if (!myTeamRow || releasingId) return;
        setReleasingId(player.id);
        setReleaseError(null);
        const { error } = await releasePlayer(myTeamRow.id, player.id);
        setReleasingId(null);
        if (error) { setReleaseError(error); return; }
        reload();
    }, [myTeamRow, releasingId, reload]);

    // 헤더 우측 GM 닉네임 표시용 — AI팀은 null(미표시)
    const teamNicknames = useMemo(
        () => Object.fromEntries(leagueTeams.map(lt => [lt.team_slug, lt.is_ai ? null : lt.nickname])),
        [leagueTeams],
    );

    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );

    // 홈 화면 로스터 위젯/리더보드/선수상세와 선수 신원(meta_players 등) fetch를 공유 —
    // queryKey가 같으면 어느 화면이 먼저 로드하든 나머지는 캐시를 그대로 재사용해 로더 없이
    // 즉시 뜬다. [2026-09-07] 이 select는 더 이상 game_pbp를 안 받음(includePbp:false) —
    // 선수 시즌 스탯은 아래 usePlayerSeasonStatsFull(서버 집계 RPC)에서 별도로 받아 병합한다
    // (팀 화면 최초 진입 시 game_pbp 통째 다운로드가 최대 병목이었던 문제 개선).
    const selectRosterIdentity = useCallback((raw: LeagueRawStatsData): Team[] => {
        const playerBaseMap = new Map<string, Player>(
            raw.playersRaw.map((r: any) => [
                String(r.id),
                mapRawPlayerToRuntimePlayer(r, useCustomOverrides, true),
            ]),
        );

        // room_player_state → "지금 활성 부상인지" 판정 + 배지 색상용 severity.
        // MultiTacticsView.tsx(뎁스차트)도 동일 로직을 쓰므로 공용 헬퍼로 뽑아뒀다.
        // suspensionContext: 출장정지 "N경기"를 발부 당시 고정값이 아니라 지금 기준 남은
        // 경기 수로 재계산하기 위해 playerId→teamId 맵 + 전체 스케줄을 넘긴다.
        const teamIdByPlayer = new Map<string, string>();
        for (const lt of leagueTeams) for (const id of (lt.roster ?? [])) teamIdByPlayer.set(id, lt.team_slug);
        const activeInjuryByPlayer = buildActiveInjurySeverityMap(raw.playerInjuryRows, currentSimDate, room?.season_number, {
            schedule: schedule as { homeTeamId: string; awayTeamId: string; date: string; played: boolean }[],
            getTeamId: id => teamIdByPlayer.get(id),
        });

        return leagueTeams.map(lt => ({
            id:            lt.team_slug,
            name:          lt.team_name,
            city:          '',
            logo:          lt.team_abbr,
            conference:    (lt.conference as 'East' | 'West') ?? 'East',
            division:      '',
            wins:          0,
            losses:        0,
            budget:        0,
            salaryCap:     0,
            luxuryTaxLine: 0,
            colorPrimary:   lt.color_primary,
            colorSecondary: lt.color_secondary,
            colorText:      lt.color_text,
            abbr:           lt.team_abbr,
            roster: (lt.roster ?? []).map(id => {
                const base = playerBaseMap.get(id);
                if (!base) return null;
                const injuryStatus = activeInjuryByPlayer.get(id);
                return {
                    ...base,
                    activeInjurySeverity: injuryStatus?.severity,
                    injuryType: injuryStatus?.injuryType,
                    activeInjuryDuration: injuryStatus?.duration,
                    returnDate: injuryStatus?.returnDate ?? undefined,
                };
            }).filter(Boolean) as Player[],
        }));
    }, [leagueTeams, useCustomOverrides, currentSimDate, room?.season_number, schedule]);

    const {
        data: allTeamsBase = [],
        isPending: identityLoading,
    } = useLeagueRawStats(room?.id, allRosterIds, selectRosterIdentity, { includePbp: false });

    // 선수당 시즌 평균(존 슛차트/수비존 포함) — 서버 집계 RPC(2026-09-07 신설, 예전엔
    // game_pbp 원본을 통째로 받아 buildStatsMap()으로 클라이언트에서 집계했다).
    const { data: statsFull, isPending: statsFullLoading } = usePlayerSeasonStatsFull(room?.id, allRosterIds);

    const allTeams = useMemo(() => {
        if (!statsFull) return allTeamsBase;
        return allTeamsBase.map(t => ({
            ...t,
            roster: t.roster.map(p => ({
                ...p,
                stats: { ...(p.stats ?? {}), ...(statsFull[p.id] ?? {}) } as PlayerStats,
            })),
        }));
    }, [allTeamsBase, statsFull]);

    // "기록"/"일정" 탭만 게임 단위 원본(game_pbp)이 실제로 필요하다 — 그 탭이 열려 있을
    // 때만 지연 로딩(URL의 ?tab= 을 직접 읽어, 딥링크로 곧장 그 탭에 들어와도 놓치지 않음).
    const [searchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') ?? 'overview';
    const needsGamePbp = activeTab === 'records' || activeTab === 'schedule';
    const { data: pbpRows = [] } = useRoomGamePbp(room?.id, needsGamePbp);

    const gameTeamStatsMap = useMemo(() => buildGameTeamStatsMap(pbpRows), [pbpRows]);
    const gameLeadersMap   = useMemo(() => buildGameLeadersMap(pbpRows), [pbpRows]);

    // 선수 이름 클릭 → 선수 프로필 전용 캐노니컬 라우트(MultiPlayerDetailView)로 이동.
    // 예전엔 이 화면 안에서 ?player=&team= 쿼리파라미터로 PlayerDetailView를 바꿔치기했는데,
    // 로스터/리더보드/인사이트/헤더 검색 등 어디서 선수를 열든 동일한 고유 URL로 들어가도록
    // 통일했다(뒤로가기·새로고침·링크 공유가 전부 자연스럽게 동작).
    const onViewPlayer = useCallback((player: Player) => {
        navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(player.id)}`);
    }, [navigate, leagueId, getPlayerUrlId]);

    // TeamGameLog(경기 기록 탭)용 — schedule에 game_pbp 기반 팀 단위 박스스코어(homeStats/awayStats) 병합.
    // leaders(PTS/REB/AST 리더)도 같이 병합 — TeamScheduleCalendar(일정 탭) "최우수선수" 컬럼용.
    const scheduleWithStats = useMemo(
        () => schedule.map(g => {
            const st = gameTeamStatsMap.get(g.id);
            const leaders = gameLeadersMap.get(g.id);
            return (st || leaders)
                ? ({ ...g, homeStats: st?.homeStats, awayStats: st?.awayStats, leaders } as Game)
                : g;
        }),
        [schedule, gameTeamStatsMap, gameLeadersMap],
    );

    const onScoreClick = useCallback((gameId: string) => {
        navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(gameId)}`);
    }, [navigate, leagueId, getGameUrlId]);

    // "재정" 탭 — 리그의 캡 마스터 스위치(cap_enabled)가 꺼져있으면 아예 숨김.
    const capSettings = useMemo(() => {
        if (!league?.cap_enabled) return undefined;
        return {
            capEnabled:         league.cap_enabled,
            salaryCapAmount:    league.salary_cap_amount,
            luxuryTaxEnabled:   league.luxury_tax_enabled,
            luxuryTaxAmount:    league.luxury_tax_amount,
            apron1Enabled:      league.apron1_enabled,
            apron1Amount:       league.apron1_amount,
            apron2Enabled:      league.apron2_enabled,
            apron2Amount:       league.apron2_amount,
            salaryFloorEnabled: league.salary_floor_enabled,
            salaryFloorAmount:  league.salary_floor_amount,
        };
    }, [league]);

    // 페이롤 테이블 첫 시즌 컬럼 연도 — NBA 시즌은 10월 시작~이듬해 6월 종료이므로
    // 7월 이전(1~6월)이면 시즌 시작 연도가 작년(MultiHeader.tsx의 seasonShortFromDate와 동일 규칙).
    const baseSeasonYear = useMemo(() => {
        const src = league?.season_start_date;
        if (!src) return new Date().getFullYear();
        const d = new Date(src + 'T00:00:00');
        const m = d.getMonth() + 1;
        return m >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    }, [league?.season_start_date]);

    // Off Rtg/Def Rtg/Pace(advancedStatsByTeam)는 별도 RPC라 로딩이 느린데, 게이트에서
    // 빠져 있으면 헤더의 나머지 순위 텍스트만 먼저 뜨고 이 줄만 한 박자 늦게 팝인되는
    // 문제가 있었다 — 전체를 한 번에 기다렸다 같이 표시하도록 게이트에 포함. game_pbp(pbpRows)
    // 로딩은 일부러 뺐다 — "기록"/"일정" 탭에서만 필요한 지연 로딩이라 개요 탭 진입을
    // 붙잡아두면 안 됨(2026-09-07, 팀 화면 최초 진입 병목 개선).
    const isLoading = leagueLoading || identityLoading || statsFullLoading || advancedStatsLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {releaseError && (
                <div className="shrink-0 flex items-center gap-2 mx-4 mt-3 px-3 py-2.5 rounded-lg bg-red-950/40 border border-red-900/40 text-sm text-red-400 ko-normal">
                    <ShieldAlert size={15} className="shrink-0" /> {releaseError}
                </div>
            )}
            <div className="flex-1 min-h-0">
                <RosterView
                    allTeams={allTeams}
                    myTeamId={myTeamId ?? allTeams[0]?.id ?? ''}
                    initialTeamId={myTeamId}
                    onViewPlayer={onViewPlayer}
                    schedule={scheduleWithStats}
                    onScoreClick={onScoreClick}
                    userId={session?.user?.id}
                    currentSimDate={currentSimDate}
                    enableHoverCard
                    hideTabs={['coaching', 'draftPicks']}
                    teamNicknames={teamNicknames}
                    capSettings={capSettings}
                    baseSeasonYear={baseSeasonYear}
                    onReleasePlayer={handleReleasePlayer}
                    releasingId={releasingId}
                    enableTeamSettingsTab
                    renderTeamSettingsPanel={() => <TeamSettingsPanel />}
                    advancedStatsByTeam={advancedStatsByTeam}
                />
            </div>
        </div>
    );
};

export default MultiRosterView;
