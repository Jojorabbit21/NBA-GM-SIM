
import type { Team, Player } from '../../types';
import type { PlayerBoxScore } from '../../types/engine';
import type { LeagueRawStatsData } from '../../hooks/useLeagueRawStats';
import type { LeagueTeamRow } from './roomQueries';
import { mapRawPlayerToRuntimePlayer } from '../dataMapper';
import { INITIAL_STATS } from '../../utils/constants';
import { isFinal } from '../../views/multi/season/multiGameReveal';
import { getServerNow } from '../../utils/serverClock';

// 공격 10존 shooting 키(zone_*) — 인사이트 탭 CONTEST 섹션(팀이 상대에게 허용한 존별 슈팅)용.
// "상대가 우리를 상대로 기록한 zone_* 슈팅" = 우리 팀이 허용한 존별 DFGM/DFGA와 동일하므로,
// 별도의 defXAttempted/Made(6존 체계)가 아니라 이미 있는 offense 10존 체계를 재사용한다.
const OPP_ZONE_KEYS = [
    'zone_rim_m', 'zone_rim_a', 'zone_paint_m', 'zone_paint_a',
    'zone_mid_l_m', 'zone_mid_l_a', 'zone_mid_c_m', 'zone_mid_c_a', 'zone_mid_r_m', 'zone_mid_r_a',
    'zone_c3_l_m', 'zone_c3_l_a', 'zone_c3_r_m', 'zone_c3_r_a',
    'zone_atb3_l_m', 'zone_atb3_l_a', 'zone_atb3_c_m', 'zone_atb3_c_a', 'zone_atb3_r_m', 'zone_atb3_r_a',
] as const;

export interface LeagueTeamWithOppZones extends Team {
    /** 이 팀이 상대에게 허용한 존별 슈팅 시즌 누적(zone_* 키, 상대 팀 zone_* 원시 합계 —
     *  경기당 평균이 아닌 시즌 총합이라 사용하는 쪽에서 games played로 직접 나눠야 함). */
    oppZoneStats: Record<string, number>;
}

/** room 전체(모든 팀)의 원시 game_pbp 박스스코어를 선수별로 누적해 Team[](로스터+시즌 누적
 *  스탯 포함)를 구성한다. `MultiLeaderboardView.tsx`의 `selectLeaderboardTeams`에서 추출한
 *  로직 — 리더보드·인사이트 등 "리그 전체 30팀 스탯"이 필요한 화면에서 공용으로 사용. */
export function buildLeagueTeams(
    raw: LeagueRawStatsData,
    leagueTeams: LeagueTeamRow[],
    useCustomOverrides: boolean,
): LeagueTeamWithOppZones[] {
    const playerBaseMap = new Map<string, Player>(
        raw.playersRaw.map((r: any) => [
            String(r.id),
            mapRawPlayerToRuntimePlayer(r, useCustomOverrides, true),
        ]),
    );

    // Aggregate box scores into cumulative PlayerStats per playerId
    // (정시+10분 경과 — final 상태인 경기만 집계. live 구간 박스는 비공개이므로 제외)
    const statsMap = new Map<string, ReturnType<typeof INITIAL_STATS>>();
    const oppZoneMap = new Map<string, Record<string, number>>();
    const serverNow = getServerNow();

    const addOppZones = (teamId: string | undefined, box: PlayerBoxScore[]) => {
        if (!teamId) return;
        const prev = oppZoneMap.get(teamId) ?? {};
        const next = { ...prev };
        for (const bs of box as any[]) {
            const zd = bs.zoneData ?? {};
            for (const k of OPP_ZONE_KEYS) next[k] = (next[k] ?? 0) + (zd[k] ?? 0);
        }
        oppZoneMap.set(teamId, next);
    };

    for (const row of raw.pbpRows) {
        if (!isFinal({ scheduledAt: row.game_start_time }, serverNow)) continue;
        // 홈팀 입장에서 "상대"는 원정팀이 기록한 슈팅(away_box), 원정팀 입장에서 "상대"는 홈팀의
        // 슈팅(home_box) — 즉 각 팀의 oppZoneStats는 그 팀을 상대한 쪽의 zone_* 합계다.
        addOppZones((row as any).home_team_id, (row as any).away_box ?? []);
        addOppZones((row as any).away_team_id, (row as any).home_box ?? []);

        const sides: { box: PlayerBoxScore[] }[] = [
            { box: row.home_box ?? [] },
            { box: row.away_box ?? [] },
        ];
        for (const { box } of sides) {
            for (const bs of box) {
                if (!bs.playerId || bs.mp <= 0) continue;
                const prev = statsMap.get(bs.playerId) ?? INITIAL_STATS();
                // 10존 슈팅 세부 데이터는 bs.zoneData 중첩 객체 안에 저장됨
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
                    tovForced:     (prev.tovForced ?? 0) + (bs.tovForced ?? 0),
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
                    // Defense 탭(피포제션 방어 스탯)
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

    // room 전용 커리어 스냅샷(league_player_seasons) — playerId별로 모아서 아래에서
    // meta_players의 실제 NBA career_history 뒤에 이어붙인다("이 리그 안에서 쌓인 시즌들").
    const leagueSeasonsByPlayer = new Map<string, Record<string, any>[]>();
    for (const row of raw.leagueSeasonRows ?? []) {
        const arr = leagueSeasonsByPlayer.get(row.player_id) ?? [];
        arr.push(row.stat_line);
        leagueSeasonsByPlayer.set(row.player_id, arr);
    }

    // room_player_state.injury_history — server(simRunner.ts)가 경기 시뮬 후 기록한 부상/
    // 출장정지 이력. meta_players엔 이 데이터가 없어(mapRawPlayerToRuntimePlayer가
    // injuryHistory를 채우지 않음) 여기서 player.injuryHistory로 얹어야만 PlayerDetailView의
    // 부상 이력 섹션에 노출된다. 현재 진행 중인 부상 상태(health/injuryType/returnDate)는
    // forceHealthy=true로 의도적으로 감춘 값이라 이 merge 대상에서 제외 — 이력만 보여준다.
    const injuryHistoryByPlayer = new Map<string, Record<string, any>[]>(
        (raw.playerInjuryRows ?? []).map(row => [row.player_id, row.injury_history ?? []]),
    );

    return leagueTeams.map(lt => ({
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
            const leagueSeasons = leagueSeasonsByPlayer.get(id);
            const injuryHistory = injuryHistoryByPlayer.get(id);
            return {
                ...base,
                stats: statsMap.get(id) ?? INITIAL_STATS(),
                career_history: leagueSeasons
                    ? [...(base.career_history ?? []), ...leagueSeasons]
                    : base.career_history,
                injuryHistory: injuryHistory?.length ? (injuryHistory as any) : base.injuryHistory,
            };
        }).filter(Boolean) as Player[],
        oppZoneStats: oppZoneMap.get(lt.team_slug) ?? {},
    })) as LeagueTeamWithOppZones[];
}
