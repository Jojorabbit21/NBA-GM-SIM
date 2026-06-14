
import React, { useEffect, useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import { useGame } from '../../../hooks/useGameContext';
import { supabase } from '../../../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import { LeaderboardView } from '../../LeaderboardView';
import { INITIAL_STATS } from '../../../utils/constants';
import { getServerNow } from '../../../utils/serverClock';
import { isFinal } from './multiGameReveal';
import type { Team, Player, Game } from '../../../types';
import type { PlayerBoxScore } from '../../../types/engine';

const MultiLeaderboardView: React.FC = () => {
    const { league, leagueTeams, room, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const { session } = useGame();
    const { isLoading: gameLoading, schedule, myTeamId } = useMultiGameData(session, room?.id ?? null);

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
                    mapRawPlayerToRuntimePlayer(raw, useCustomOverrides),
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
            schedule={schedule as Game[]}
            onViewPlayer={() => {}}
            onTeamClick={() => {}}
            hideSeasonType={isTournament}
        />
    );
};

export default MultiLeaderboardView;
