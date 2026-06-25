
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import { supabase } from '../../../services/supabaseClient';
import { RosterView } from '../../RosterView';
import { PlayerDetailView } from '../../PlayerDetailView';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import { isFinal } from './multiGameReveal';
import { getServerNow } from '../../../utils/serverClock';
import type { Team, Player } from '../../../types';
import type { PlayerStats } from '../../../types/player';

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
    const { schedule, tendencySeed } = useMultiGameData(session, room?.id ?? null);
    const location = useLocation();
    const navState = (location.state ?? {}) as { viewPlayer?: Player; viewTeamId?: string };

    const myTeamId = useMemo(
        () => members.find(m => m.user_id === session?.user?.id)?.team_id ?? null,
        [members, session],
    );

    const [allTeams,     setAllTeams]     = useState<Team[]>([]);
    const [gameLogMap,   setGameLogMap]   = useState<Map<string, any[]>>(new Map());
    const [fetchLoading, setFetchLoading] = useState(false);

    // viewingPlayer: { player, teamId, teamName }
    const [viewing, setViewing] = useState<{ player: Player; teamId: string; teamName: string } | null>(null);

    // 헤더 검색 → navigate state로 선수/팀 자동 열기 (allTeams 로드 완료 후 1회 실행)
    const navHandledRef = useRef(false);
    useEffect(() => {
        if (navHandledRef.current || !navState.viewPlayer || !allTeams.length) return;
        navHandledRef.current = true;
        const { viewPlayer, viewTeamId } = navState;
        const team = viewTeamId ? allTeams.find(t => t.id === viewTeamId) : null;
        const freshPlayer = team?.roster.find(p => p.id === viewPlayer.id) ?? viewPlayer;
        setViewing({ player: freshPlayer, teamId: viewTeamId ?? '', teamName: team?.name ?? '' });
    }, [allTeams]); // eslint-disable-line react-hooks/exhaustive-deps

    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );

    useEffect(() => {
        if (!allRosterIds.length || !room?.id) return;
        let cancelled = false;
        setFetchLoading(true);

        const load = async () => {
            const [playersRes, pbpRes] = await Promise.all([
                supabase
                    .from('meta_players')
                    .select('id, name, position, base_attributes, tendencies')
                    .in('id', allRosterIds),
                supabase
                    .from('game_pbp')
                    .select('home_box, away_box, home_team_id, away_team_id, home_score, away_score, game_start_time')
                    .eq('room_id', room.id),
            ]);

            if (cancelled) return;

            const serverNow = getServerNow();
            const playerBaseMap = new Map<string, Player>(
                (playersRes.data ?? []).map((raw: any) => [
                    String(raw.id),
                    mapRawPlayerToRuntimePlayer(raw, useCustomOverrides),
                ]),
            );
            const statsMap = buildStatsMap(pbpRes.data ?? [], serverNow);
            const logMap   = buildGameLogMap(pbpRes.data ?? [], serverNow);

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
                roster: (lt.roster ?? []).map(id => {
                    const base = playerBaseMap.get(id);
                    if (!base) return null;
                    return { ...base, stats: { ...(base.stats ?? {}), ...(statsMap.get(id) ?? {}) } as PlayerStats };
                }).filter(Boolean) as Player[],
            }));

            setAllTeams(builtTeams);
            setGameLogMap(logMap);
            setFetchLoading(false);
        };

        load();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allRosterIds.join(','), room?.id]);

    const onViewPlayer = useCallback((player: Player, teamId?: string, teamName?: string) => {
        setViewing({ player, teamId: teamId ?? '', teamName: teamName ?? '' });
    }, []);

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
                onBack={() => setViewing(null)}
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
            userId={session?.user?.id}
            hideTabs={['coaching', 'draftPicks']}
        />
    );
};

export default MultiRosterView;
