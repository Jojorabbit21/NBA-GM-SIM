
import type { Team, Player } from '../../types';
import type { PlayerStats } from '../../types/player';
import type { LeagueRawStatsData } from '../../hooks/useLeagueRawStats';
import type { LeagueTeamRow } from './roomQueries';
import { mapRawPlayerToRuntimePlayer } from '../dataMapper';
import { INITIAL_STATS } from '../../utils/constants';

export interface LeagueTeamWithOppZones extends Team {
    /** 이 팀이 상대에게 허용한 존별 슈팅 시즌 누적(zone_* 키, 상대 팀 zone_* 원시 합계 —
     *  경기당 평균이 아닌 시즌 총합이라 사용하는 쪽에서 games played로 직접 나눠야 함). */
    oppZoneStats: Record<string, number>;
}

/**
 * 리그 로스터(Team[])를 구성한다 — 선수 신원(meta_players)은 raw에서, 시즌 누적 스탯과
 * 팀별 "상대에게 허용한 존별 슈팅"(oppZoneStats)은 각각 서버 집계 RPC 결과(호출부가
 * usePlayerSeasonStatsLeague/useTeamOpponentZoneStats로 미리 받아온 값)를 그대로 병합한다.
 *
 * [2026-09-07] 예전엔 이 함수가 raw.pbpRows(room 전체 game_pbp 원본, 게임당 수십~수백KB)를
 * 직접 순회해 두 값을 클라이언트에서 집계했다 — 홈/리더보드/트레이드/선수상세/전술 5개
 * 화면이 전부 이 함수를 공유해서, 그 원본 fetch 자체가(홈 화면 실측 8.2초) 최대 병목이었다.
 * 팀 화면(MultiRosterView.tsx)에서 이미 겪은 문제와 동일 — 서버 RPC(get_player_season_stats_league,
 * get_team_opponent_zone_stats)로 옮기고 이 함수는 이미 집계된 결과를 merge만 하도록 변경.
 * statsByPlayer/oppZoneByTeam을 안 넘기면(기본값 {}) 모든 선수/팀이 INITIAL_STATS()/빈
 * 객체로 채워진다 — 라우팅 전환 중 아직 두 번째 쿼리가 안 끝난 과도기 렌더에서도 크래시
 * 없이 0으로 표시되도록 하는 안전장치.
 *
 * [2026-09-15 Fix] playoffStatsByPlayer(선택) — 넘기면 player.playoffStats도 함께 채운다.
 * 기본값 빈 객체라 이 파라미터를 안 쓰는 5개 호출부(홈/트레이드/선수상세/전술/리더보드
 * 정규시즌)는 전혀 영향 없음 — 리더보드가 "플레이오프" 토글일 때만
 * usePlayerSeasonStatsLeague(..., isPlayoff=true)로 따로 받아와 넘긴다.
 *
 * [2026-09-15] player.contract도 room_player_state.contract(raw.playerInjuryRows에 같이
 * 실려옴)가 있으면 그걸로, 없으면 meta_players 원본(base.contract)으로 폴백 — 트레이드/
 * FA서명/방출로 이 리그에서 바뀐 계약이 다른 리그나 meta_players에 새지 않는다(싱글플레이어
 * saves.roster_state와 동일한 패턴). salary/contractYears도 함께 재파생한다.
 */
export function buildLeagueTeams(
    raw: LeagueRawStatsData,
    leagueTeams: LeagueTeamRow[],
    useCustomOverrides: boolean,
    statsByPlayer: Record<string, Partial<PlayerStats>> = {},
    oppZoneByTeam: Record<string, Record<string, number>> = {},
    playoffStatsByPlayer: Record<string, Partial<PlayerStats>> = {},
): LeagueTeamWithOppZones[] {
    const playerBaseMap = new Map<string, Player>(
        raw.playersRaw.map((r: any) => [
            String(r.id),
            mapRawPlayerToRuntimePlayer(r, useCustomOverrides, true),
        ]),
    );

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

    // room_player_state.contract — 이 리그에서 트레이드/FA서명/방출로 바뀐 계약 오버라이드.
    // null인 행(또는 행 자체가 없는 선수)은 이 Map에 들어오지 않아 meta_players 원본
    // 계약(base.contract)으로 자연스럽게 폴백한다 — migrations/add_room_player_state_contract.sql.
    const contractByPlayer = new Map<string, Record<string, any>>(
        (raw.playerInjuryRows ?? [])
            .filter(row => row.contract != null)
            .map(row => [row.player_id, row.contract as Record<string, any>]),
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
        colorText:      lt.color_text,
        abbr:           lt.team_abbr,
        roster: (lt.roster ?? []).map(id => {
            const base = playerBaseMap.get(id);
            if (!base) return null;
            const leagueSeasons = leagueSeasonsByPlayer.get(id);
            const injuryHistory = injuryHistoryByPlayer.get(id);
            const roomContract = contractByPlayer.get(id);
            // dataMapper.ts의 buildPlayerContract와 동일한 파생 공식 — contract가 오버라이드
            // 되면 salary/contractYears도 같이 재계산해야 로스터 페이롤 화면 등에서 어긋나지 않는다.
            const contract = (roomContract ?? base.contract) as Player['contract'];
            const salary = contract?.years?.[contract.currentYear] ?? base.salary;
            const contractYears = contract?.years
                ? contract.years.length - contract.currentYear
                : base.contractYears;
            return {
                ...base,
                stats: { ...INITIAL_STATS(), ...(statsByPlayer[id] ?? {}) } as PlayerStats,
                playoffStats: { ...INITIAL_STATS(), ...(playoffStatsByPlayer[id] ?? {}) } as PlayerStats,
                career_history: leagueSeasons
                    ? [...(base.career_history ?? []), ...leagueSeasons]
                    : base.career_history,
                injuryHistory: injuryHistory?.length ? (injuryHistory as any) : base.injuryHistory,
                contract,
                salary,
                contractYears,
            };
        }).filter(Boolean) as Player[],
        oppZoneStats: oppZoneByTeam[lt.team_slug] ?? {},
    })) as LeagueTeamWithOppZones[];
}
