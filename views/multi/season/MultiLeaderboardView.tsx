
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import { useGame } from '../../../hooks/useGameContext';
import { supabase } from '../../../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import { LeaderboardView } from '../../LeaderboardView';
import { INITIAL_STATS } from '../../../utils/constants';
import { getServerNow } from '../../../utils/serverClock';
import { isFinal, resolveRealAt } from './multiGameReveal';
import type { Team, Player, Game } from '../../../types';
import type { PlayerBoxScore } from '../../../types/engine';

const MultiLeaderboardView: React.FC = () => {
    const { league, leagueTeams, room, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const { session } = useGame();
    const { isLoading: gameLoading, schedule, myTeamId } = useMultiGameData(session, room?.id ?? null);
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();

    const [teams, setTeams] = useState<Team[]>([]);
    const [fetchLoading, setFetchLoading] = useState(false);

    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );

    useEffect(() => {
        if (!allRosterIds.length || !room?.id) return;
        let cancelled = false;
        setFetchLoading(true);

        const fetchData = async () => {
            const [playersRes, pbpRes] = await Promise.all([
                supabase
                    .from('meta_players')
                    .select('id, name, position, base_attributes, tendencies')
                    .in('id', allRosterIds),
                supabase
                    .from('game_pbp')
                    .select('home_box, away_box, home_team_id, away_team_id, game_start_time')
                    .eq('room_id', room.id),
            ]);

            if (cancelled) return;

            const playerBaseMap = new Map<string, Player>(
                (playersRes.data ?? []).map((raw: any) => [
                    String(raw.id),
                    mapRawPlayerToRuntimePlayer(raw, useCustomOverrides, true),
                ]),
            );

            // Aggregate box scores into cumulative PlayerStats per playerId
            // (정시+10분 경과 — final 상태인 경기만 집계. live 구간 박스는 비공개이므로 제외)
            const statsMap = new Map<string, ReturnType<typeof INITIAL_STATS>>();
            const serverNow = getServerNow();

            for (const row of (pbpRes.data ?? [])) {
                if (!isFinal({ scheduledAt: row.game_start_time }, serverNow)) continue;
                const sides: { box: PlayerBoxScore[] }[] = [
                    { box: row.home_box ?? [] },
                    { box: row.away_box ?? [] },
                ];
                for (const { box } of sides) {
                    for (const bs of box) {
                        if (!bs.playerId || bs.mp <= 0) continue;
                        const prev = statsMap.get(bs.playerId) ?? INITIAL_STATS();
                        // 10존 슈팅 세부 데이터는 bs.zoneData 중첩 객체 안에 저장됨 (MultiRosterView와 동일 패턴)
                        const zd = (bs as any).zoneData ?? {};
                        const addZ = (k: string) => ((prev as any)[k] ?? 0) + (zd[k] ?? 0);
                        statsMap.set(bs.playerId, {
                            ...prev,
                            g:             prev.g + 1,
                            gs:            prev.gs + (bs.gs ?? 0),
                            mp:            prev.mp + bs.mp,
                            pts:           prev.pts + bs.pts,
                            reb:           prev.reb + bs.reb,
                            offReb:        prev.offReb + (bs.offReb ?? 0),
                            defReb:        prev.defReb + (bs.defReb ?? 0),
                            ast:           prev.ast + bs.ast,
                            stl:           prev.stl + bs.stl,
                            blk:           prev.blk + bs.blk,
                            tov:           prev.tov + bs.tov,
                            pf:            prev.pf + (bs.pf ?? 0),
                            techFouls:     prev.techFouls + (bs.techFouls ?? 0),
                            flagrantFouls: prev.flagrantFouls + (bs.flagrantFouls ?? 0),
                            fgm:           prev.fgm + bs.fgm,
                            fga:           prev.fga + bs.fga,
                            p3m:           prev.p3m + bs.p3m,
                            p3a:           prev.p3a + bs.p3a,
                            ftm:           prev.ftm + bs.ftm,
                            fta:           prev.fta + bs.fta,
                            rimM:          prev.rimM + (bs.rimM ?? 0),
                            rimA:          prev.rimA + (bs.rimA ?? 0),
                            midM:          prev.midM + (bs.midM ?? 0),
                            midA:          prev.midA + (bs.midA ?? 0),
                            plusMinus:     prev.plusMinus + (bs.plusMinus ?? 0),
                            // Shooting 탭(10존 breakdown)
                            zone_rim_m:     addZ('zone_rim_m'),     zone_rim_a:     addZ('zone_rim_a'),
                            zone_paint_m:   addZ('zone_paint_m'),   zone_paint_a:   addZ('zone_paint_a'),
                            zone_mid_l_m:   addZ('zone_mid_l_m'),   zone_mid_l_a:   addZ('zone_mid_l_a'),
                            zone_mid_c_m:   addZ('zone_mid_c_m'),   zone_mid_c_a:   addZ('zone_mid_c_a'),
                            zone_mid_r_m:   addZ('zone_mid_r_m'),   zone_mid_r_a:   addZ('zone_mid_r_a'),
                            zone_c3_l_m:    addZ('zone_c3_l_m'),    zone_c3_l_a:    addZ('zone_c3_l_a'),
                            zone_c3_r_m:    addZ('zone_c3_r_m'),    zone_c3_r_a:    addZ('zone_c3_r_a'),
                            zone_atb3_l_m:  addZ('zone_atb3_l_m'),  zone_atb3_l_a:  addZ('zone_atb3_l_a'),
                            zone_atb3_c_m:  addZ('zone_atb3_c_m'),  zone_atb3_c_a:  addZ('zone_atb3_c_a'),
                            zone_atb3_r_m:  addZ('zone_atb3_r_m'),  zone_atb3_r_a:  addZ('zone_atb3_r_a'),
                            // Defense 탭(피포제이 방어 스탯) — 같은 원인으로 함께 누락돼 있던 필드
                            contestedAttempted: prev.contestedAttempted + (bs.contestedAttempted ?? 0),
                            contestedMade:      prev.contestedMade      + (bs.contestedMade      ?? 0),
                            defRimAttempted:    prev.defRimAttempted    + (bs.defRimAttempted    ?? 0),
                            defRimMade:         prev.defRimMade         + (bs.defRimMade         ?? 0),
                            defMidAttempted:    prev.defMidAttempted    + (bs.defMidAttempted    ?? 0),
                            defMidMade:         prev.defMidMade         + (bs.defMidMade         ?? 0),
                            defThreeAttempted:  prev.defThreeAttempted  + (bs.defThreeAttempted  ?? 0),
                            defThreeMade:       prev.defThreeMade       + (bs.defThreeMade       ?? 0),
                            defRAAttempted:     prev.defRAAttempted     + (bs.defRAAttempted     ?? 0),
                            defRAMade:          prev.defRAMade          + (bs.defRAMade          ?? 0),
                            defITPAttempted:    prev.defITPAttempted    + (bs.defITPAttempted    ?? 0),
                            defITPMade:         prev.defITPMade         + (bs.defITPMade         ?? 0),
                            defMIDAttempted:    prev.defMIDAttempted    + (bs.defMIDAttempted    ?? 0),
                            defMIDMade:         prev.defMIDMade         + (bs.defMIDMade         ?? 0),
                            defCNRAttempted:    prev.defCNRAttempted    + (bs.defCNRAttempted    ?? 0),
                            defCNRMade:         prev.defCNRMade         + (bs.defCNRMade         ?? 0),
                            defWINGAttempted:   prev.defWINGAttempted   + (bs.defWINGAttempted   ?? 0),
                            defWINGMade:        prev.defWINGMade        + (bs.defWINGMade        ?? 0),
                            defATBAttempted:    prev.defATBAttempted    + (bs.defATBAttempted    ?? 0),
                            defATBMade:         prev.defATBMade         + (bs.defATBMade         ?? 0),
                        });
                    }
                }
            }

            const builtTeams: Team[] = leagueTeams.map(lt => ({
                id:           lt.team_slug,
                name:         lt.team_name,
                city:         '',
                logo:         lt.team_abbr,
                conference:   (lt.conference as 'East' | 'West') ?? 'East',
                division:     '',
                wins:         0,
                losses:       0,
                budget:       0,
                salaryCap:    0,
                luxuryTaxLine: 0,
                colorPrimary:   lt.color_primary,
                colorSecondary: lt.color_secondary,
                abbr:           lt.team_abbr,
                roster: (lt.roster ?? []).map(id => {
                    const base = playerBaseMap.get(id);
                    if (!base) return null;
                    return {
                        ...base,
                        stats: statsMap.get(id) ?? INITIAL_STATS(),
                    };
                }).filter(Boolean) as Player[],
            }));

            setTeams(builtTeams);
            setFetchLoading(false);
        };

        fetchData();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allRosterIds.join(','), room?.id]);

    const handleViewPlayer = useCallback((player: Player, teamId?: string, teamName?: string) => {
        navigate(`/multi/leagues/${leagueId}/season/roster`, {
            state: { viewPlayer: player, viewTeamId: teamId },
        });
    }, [navigate, leagueId]);

    // schedule의 game_seq 기반 경기는 scheduledAt이 없을 수 있어(레거시) resolveRealAt으로
    // 역산해 채워야 useLeaderboardData의 isFinal() 게이팅이 정확히 동작한다.
    // (isLoading 조기 return보다 반드시 위에 있어야 함 — Hooks는 매 렌더 동일한 순서로 호출돼야 한다.)
    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    const normalizedSchedule = useMemo(
        () => (schedule as Game[]).map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt })),
        [schedule, simStart, gprd],
    );

    const isLoading = leagueLoading || gameLoading || fetchLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    const isTournament = league?.type === 'tournament';

    return (
        <LeaderboardView
            teams={teams}
            schedule={normalizedSchedule}
            onViewPlayer={handleViewPlayer}
            onTeamClick={() => {}}
            hideSeasonType={isTournament}
        />
    );
};

export default MultiLeaderboardView;
