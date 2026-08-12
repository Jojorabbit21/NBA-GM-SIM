
import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { useSeasonContext } from './seasonContext';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { useLeagueRawStats, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { RosterView } from '../../RosterView';
import { PlayerDetailView } from '../../PlayerDetailView';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import { isFinal } from './multiGameReveal';
import { findCurrentVirtualDate } from './multiScheduleUtils';
import { getServerNow } from '../../../utils/serverClock';
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

// game_pbp 박스스코어에서 선수별 누적 스탯 집계 (zone 포함)
function buildStatsMap(pbpRows: any[], serverNow: number): Map<string, Partial<PlayerStats>> {
    const statsMap = new Map<string, Partial<PlayerStats>>();

    for (const row of pbpRows) {
        if (!isFinal({ scheduledAt: row.game_start_time, played: true }, serverNow)) continue;

        const sides = [
            { box: row.home_box ?? [], teamId: row.home_team_id },
            { box: row.away_box ?? [], teamId: row.away_team_id },
        ];

        for (const { box, teamId } of sides) {
            for (const bs of box) {
                if (!bs.playerId || bs.mp <= 0) continue;
                const prev = statsMap.get(bs.playerId) ?? {} as any;
                const add  = (k: string) => (prev[k] ?? 0) + (bs[k] ?? 0);
                // zone 스탯은 bs.zoneData 중첩 객체 안에 저장됨
                const zd   = bs.zoneData ?? {};
                const addZ = (k: string) => (prev[k] ?? 0) + (zd[k] ?? 0);
                statsMap.set(bs.playerId, {
                    ...prev,
                    g:        (prev.g ?? 0) + 1,
                    gs:       add('gs'),
                    mp:       add('mp'),
                    pts:      add('pts'),
                    reb:      add('reb'),
                    offReb:   add('offReb'),
                    defReb:   add('defReb'),
                    ast:      add('ast'),
                    stl:      add('stl'),
                    blk:      add('blk'),
                    tov:      add('tov'),
                    pf:       add('pf'),
                    fgm:      add('fgm'),
                    fga:      add('fga'),
                    p3m:      add('p3m'),
                    p3a:      add('p3a'),
                    ftm:      add('ftm'),
                    fta:      add('fta'),
                    rimM:     add('rimM'),
                    rimA:     add('rimA'),
                    midM:     add('midM'),
                    midA:     add('midA'),
                    plusMinus:          add('plusMinus'),
                    contestedAttempted: add('contestedAttempted'),
                    contestedMade:      add('contestedMade'),
                    // 존별 수비 스탯 (기록 탭 Defense 카테고리용) — MultiLeaderboardView.tsx와 동일하게
                    // 누락돼 있던 필드. 여기 없으면 useLeaderboardData가 항상 0으로 읽어 DFG% 등이 집계 안 됨.
                    defRAAttempted:   add('defRAAttempted'),
                    defRAMade:        add('defRAMade'),
                    defITPAttempted:  add('defITPAttempted'),
                    defITPMade:       add('defITPMade'),
                    defMIDAttempted:  add('defMIDAttempted'),
                    defMIDMade:       add('defMIDMade'),
                    defCNRAttempted:  add('defCNRAttempted'),
                    defCNRMade:       add('defCNRMade'),
                    defWINGAttempted: add('defWINGAttempted'),
                    defWINGMade:      add('defWINGMade'),
                    defATBAttempted:  add('defATBAttempted'),
                    defATBMade:       add('defATBMade'),
                    // zone 세부 스탯 (샷 차트용) — bs.zoneData에서 접근
                    zone_rim_m:    addZ('zone_rim_m'),
                    zone_rim_a:    addZ('zone_rim_a'),
                    zone_paint_m:  addZ('zone_paint_m'),
                    zone_paint_a:  addZ('zone_paint_a'),
                    zone_mid_l_m:  addZ('zone_mid_l_m'),
                    zone_mid_l_a:  addZ('zone_mid_l_a'),
                    zone_mid_c_m:  addZ('zone_mid_c_m'),
                    zone_mid_c_a:  addZ('zone_mid_c_a'),
                    zone_mid_r_m:  addZ('zone_mid_r_m'),
                    zone_mid_r_a:  addZ('zone_mid_r_a'),
                    zone_c3_l_m:   addZ('zone_c3_l_m'),
                    zone_c3_l_a:   addZ('zone_c3_l_a'),
                    zone_c3_r_m:   addZ('zone_c3_r_m'),
                    zone_c3_r_a:   addZ('zone_c3_r_a'),
                    zone_atb3_l_m: addZ('zone_atb3_l_m'),
                    zone_atb3_l_a: addZ('zone_atb3_l_a'),
                    zone_atb3_c_m: addZ('zone_atb3_c_m'),
                    zone_atb3_c_a: addZ('zone_atb3_c_a'),
                    zone_atb3_r_m: addZ('zone_atb3_r_m'),
                    zone_atb3_r_a: addZ('zone_atb3_r_a'),
                } as any);
            }
        }
    }
    return statsMap;
}

// game_pbp 박스스코어에서 선수별 경기 기록 목록 빌드 (최근 경기용)
function buildGameLogMap(pbpRows: any[], serverNow: number): Map<string, any[]> {
    const logMap = new Map<string, any[]>();

    for (const row of pbpRows) {
        if (!isFinal({ scheduledAt: row.game_start_time, played: true }, serverNow)) continue;

        const addSide = (box: any[], isHome: boolean) => {
            const oppId = isHome ? row.away_team_id : row.home_team_id;
            for (const bs of box) {
                if (!bs.playerId || bs.mp <= 0) continue;
                const entry = {
                    date:          (row.game_start_time ?? '').slice(0, 10),
                    opponentId:    oppId,
                    isHome,
                    teamScore:     isHome ? row.home_score : row.away_score,
                    opponentScore: isHome ? row.away_score : row.home_score,
                    isPlayoff:     false,
                    ...bs,
                };
                const prev = logMap.get(bs.playerId) ?? [];
                logMap.set(bs.playerId, [...prev, entry]);
            }
        };
        addSide(row.home_box ?? [], true);
        addSide(row.away_box ?? [], false);
    }

    // 날짜 내림차순 정렬
    for (const [id, logs] of logMap) {
        logMap.set(id, logs.sort((a, b) => b.date.localeCompare(a.date)));
    }
    return logMap;
}

const HIDE_SECTIONS: Array<'contract' | 'awards' | 'injuryHistory'> = ['contract', 'awards', 'injuryHistory'];

const MultiRosterView: React.FC = () => {
    const { league, room, leagueTeams, members, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const { session } = useGame();
    const { schedule, tendencySeed, currentSimDate: roomSimDate } = useSeasonContext();

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

    const location = useLocation();
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { getGameUrlId } = useGameShortCodes(room?.id);
    const navState = (location.state ?? {}) as { viewPlayer?: Player; viewTeamId?: string };
    const [searchParams, setSearchParams] = useSearchParams();

    const myTeamId = useMemo(
        () => members.find(m => m.user_id === session?.user?.id)?.team_id ?? null,
        [members, session],
    );

    // 헤더 우측 GM 닉네임 표시용 — AI팀은 null(미표시)
    const teamNicknames = useMemo(
        () => Object.fromEntries(leagueTeams.map(lt => [lt.team_slug, lt.is_ai ? null : lt.nickname])),
        [leagueTeams],
    );

    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );

    // 홈 화면 로스터 위젯/리더보드와 원본 fetch(meta_players+game_pbp)를 공유 — queryKey가
    // 같으면 어느 화면이 먼저 로드하든 나머지는 캐시를 그대로 재사용해 로더 없이 즉시 뜬다.
    const selectRosterData = useCallback((raw: LeagueRawStatsData) => {
        const serverNow = getServerNow();
        const playerBaseMap = new Map<string, Player>(
            raw.playersRaw.map((r: any) => [
                String(r.id),
                mapRawPlayerToRuntimePlayer(r, useCustomOverrides, true),
            ]),
        );
        const statsMap = buildStatsMap(raw.pbpRows, serverNow);
        const logMap   = buildGameLogMap(raw.pbpRows, serverNow);

        const builtTeams: Team[] = leagueTeams.map(lt => ({
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
            abbr:           lt.team_abbr,
            roster: (lt.roster ?? []).map(id => {
                const base = playerBaseMap.get(id);
                if (!base) return null;
                return { ...base, stats: { ...(base.stats ?? {}), ...(statsMap.get(id) ?? {}) } as PlayerStats };
            }).filter(Boolean) as Player[],
        }));

        return {
            builtTeams,
            logMap,
            gameTeamStatsMap: buildGameTeamStatsMap(raw.pbpRows),
        };
    }, [leagueTeams, useCustomOverrides]);

    const {
        data: rosterData,
        isPending: fetchLoading,
        refetch: refetchRoster,
    } = useLeagueRawStats(room?.id, allRosterIds, selectRosterData);

    const allTeams         = rosterData?.builtTeams ?? [];
    const gameLogMap       = rosterData?.logMap ?? new Map<string, any[]>();
    const gameTeamStatsMap = rosterData?.gameTeamStatsMap ?? new Map<string, { homeStats: Record<string, number>; awayStats: Record<string, number> }>();

    // 선수 상세 열림 상태를 로컬 state가 아니라 URL 쿼리 파라미터(?player=&team=)로 관리한다.
    // 로컬 state로만 열면 브라우저 히스토리에 기록이 안 남아서, 브라우저 뒤로가기를 누르면
    // 로스터 화면을 건너뛰고 그 이전 화면(예: 순위표)으로 바로 튕기는 문제가 있었다.
    const viewingPlayerId = searchParams.get('player');
    const viewingTeamId   = searchParams.get('team');
    const viewing = useMemo(() => {
        if (!viewingPlayerId) return null;
        const team = viewingTeamId ? allTeams.find(t => t.id === viewingTeamId) : undefined;
        const player = team?.roster.find(p => p.id === viewingPlayerId);
        if (!player) return null;
        return { player, teamId: viewingTeamId ?? '', teamName: team?.name ?? '' };
    }, [viewingPlayerId, viewingTeamId, allTeams]);

    const openPlayer = useCallback((playerId: string, teamId?: string) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('player', playerId);
            if (teamId) next.set('team', teamId); else next.delete('team');
            return next;
        });
    }, [setSearchParams]);

    // 헤더 검색 → navigate state로 선수/팀 자동 열기 (allTeams 로드 완료 후 1회 실행)
    const navHandledRef = useRef(false);
    useEffect(() => {
        if (navHandledRef.current || !navState.viewPlayer || !allTeams.length) return;
        navHandledRef.current = true;
        openPlayer(navState.viewPlayer.id, navState.viewTeamId);
    }, [allTeams]); // eslint-disable-line react-hooks/exhaustive-deps

    const onViewPlayer = useCallback((player: Player, teamId?: string) => {
        openPlayer(player.id, teamId);
    }, [openPlayer]);

    // TeamGameLog(경기 기록 탭)용 — schedule에 game_pbp 기반 팀 단위 박스스코어(homeStats/awayStats) 병합
    const scheduleWithStats = useMemo(
        () => schedule.map(g => {
            const st = gameTeamStatsMap.get(g.id);
            return st ? ({ ...g, homeStats: st.homeStats, awayStats: st.awayStats } as Game) : g;
        }),
        [schedule, gameTeamStatsMap],
    );

    const onScoreClick = useCallback((gameId: string) => {
        navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(gameId)}`);
    }, [navigate, leagueId, getGameUrlId]);

    // 경기 기록 탭 진입 시점에만 최신 game_pbp로 재조회 (로스터 탭은 자주 안 바뀌니 캐시 그대로 사용)
    // 탭을 빠르게 왔다갔다해도 쿨다운(3초) 안에서는 재조회를 건너뛴다.
    const RECORDS_REFETCH_COOLDOWN_MS = 3000;
    const lastRecordsRefetchRef = useRef(0);
    const onRosterTabChange = useCallback((t: string) => {
        if (t !== 'records') return;
        const now = Date.now();
        if (now - lastRecordsRefetchRef.current < RECORDS_REFETCH_COOLDOWN_MS) return;
        lastRecordsRefetchRef.current = now;
        refetchRoster();
    }, [refetchRoster]);

    const isLoading = leagueLoading || fetchLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    if (viewing) {
        // allTeams에서 최신 stats가 반영된 선수로 교체
        const freshPlayer = allTeams
            .find(t => t.id === viewing.teamId)
            ?.roster.find(p => p.id === viewing.player.id)
            ?? viewing.player;

        return (
            <PlayerDetailView
                player={freshPlayer}
                teamId={viewing.teamId}
                teamName={viewing.teamName}
                allTeams={allTeams}
                schedule={schedule}
                tendencySeed={tendencySeed ?? undefined}
                seasonShort={room?.season ?? '2025-26'}
                myTeamId={myTeamId ?? undefined}
                onBack={() => navigate(-1)}
                hideSections={HIDE_SECTIONS}
                externalGameLog={gameLogMap.get(viewing.player.id) ?? []}
                externalGameLogLoading={false}
            />
        );
    }

    return (
        <RosterView
            allTeams={allTeams}
            myTeamId={myTeamId ?? allTeams[0]?.id ?? ''}
            initialTeamId={navState.viewTeamId ?? myTeamId}
            onViewPlayer={onViewPlayer}
            schedule={scheduleWithStats}
            onScoreClick={onScoreClick}
            userId={session?.user?.id}
            currentSimDate={currentSimDate}
            hideTabs={['coaching', 'draftPicks']}
            onTabChange={onRosterTabChange}
            teamNicknames={teamNicknames}
        />
    );
};

export default MultiRosterView;
