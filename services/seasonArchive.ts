/**
 * 시즌 아카이브 서비스
 *
 * 시즌 종료 시 현재 시즌 데이터를 user_season_history에 저장하고,
 * 이전 시즌 기록/커리어 스탯 조회를 제공한다.
 */

import { supabase } from './supabaseClient';
import { Team, Player, PlayoffSeries, PlayerStats } from '../types';
import { SeasonConfig } from '../utils/seasonConfig';
import { LotteryResult } from './draft/lotteryEngine';
import { SavedTeamFinances } from '../types/finance';

// ── 타입 정의 ──

export interface SeasonArchiveEntry {
    season: string;
    seasonNumber: number;
    teamId: string;
    wins: number;
    losses: number;
    playoffResult: string | null;
    playerStats: Record<string, PlayerStats>;
    playerOverrides: Record<string, PlayerOverrideSnapshot> | null;
    awards: any | null;
    lotteryResult: LotteryResult | null;
    teamFinances: SavedTeamFinances | null;
}

export interface PlayerOverrideSnapshot {
    age: number;
    ovr: number;
    contractYears: number;
    position: string;
    teamId: string;
    isGenerated?: boolean;  // gen_ 접두사 선수 식별
}

export interface CareerSeasonLine {
    season: string;
    seasonNumber: number;
    stats: PlayerStats;
}

// ── 아카이브 저장 ──

/**
 * 현재 시즌 데이터를 user_season_history에 아카이브.
 * 시즌 전환 시 한 번 호출된다.
 */
export async function archiveCurrentSeason(
    userId: string,
    seasonConfig: SeasonConfig,
    myTeam: Team,
    allTeams: Team[],
    playoffSeries: PlayoffSeries[],
    teamFinances: SavedTeamFinances | null = null,
    lotteryResult: LotteryResult | null = null
): Promise<void> {
    // 플레이오프 결과 판정
    const playoffResult = determinePlayoffResult(myTeam.id, playoffSeries);

    // 모든 선수의 시즌 스탯 수집
    const playerStats: Record<string, PlayerStats> = {};
    for (const team of allTeams) {
        for (const player of team.roster) {
            if (player.stats && player.stats.g > 0) {
                playerStats[player.id] = { ...player.stats };
            }
        }
    }

    // 선수 상태 스냅샷 (추후 크로스시즌 성장 베이스라인)
    const playerOverrides: Record<string, PlayerOverrideSnapshot> = {};
    for (const team of allTeams) {
        for (const player of team.roster) {
            playerOverrides[player.id] = {
                age: player.age,
                ovr: player.ovr,
                contractYears: player.contractYears,
                position: player.position,
                teamId: team.id,
                ...(player.id.startsWith('gen_') && { isGenerated: true }),
            };
        }
    }

    const payload = {
        user_id: userId,
        season: seasonConfig.seasonLabel,
        season_number: seasonConfig.seasonNumber,
        team_id: myTeam.id,
        wins: myTeam.wins,
        losses: myTeam.losses,
        playoff_result: playoffResult,
        player_stats: playerStats,
        player_overrides: playerOverrides,
        awards: null, // 추후 오프시즌 어워드 콘텐츠에서 채움
        lottery_result: lotteryResult ?? null, // 이미 알고 있으면 바로 저장, 아니면 updateSeasonArchiveLottery로 추후 업데이트
        team_finances: teamFinances,
    };

    const { error } = await supabase
        .from('user_season_history')
        .upsert(payload, { onConflict: 'user_id, season' });

    if (error) {
        console.error('❌ [seasonArchive] Failed to archive season:', error);
    } else {
        console.log(`✅ Season ${seasonConfig.seasonLabel} archived.`);
    }
}

/**
 * 시즌 아카이브에 로터리 결과를 업데이트.
 * 로터리 추첨 시점에 호출 (아카이브는 파이널 종료 시 먼저 생성됨).
 */
export async function updateSeasonArchiveLottery(
    userId: string,
    seasonLabel: string,
    lotteryResult: LotteryResult
): Promise<void> {
    // 기존 아카이브 레코드가 있으면 update, 없으면 조용히 실패하므로
    // update 후 영향받은 행이 없으면 upsert로 폴백해 lotteryResult를 보존한다.
    const { error, count } = await supabase
        .from('user_season_history')
        .update({ lottery_result: lotteryResult })
        .eq('user_id', userId)
        .eq('season', seasonLabel)
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('❌ [seasonArchive] Failed to update lottery result:', error);
        return;
    }

    if (count === 0) {
        // 아카이브 레코드가 없는 경우 — 최소 필드로 upsert해 lottery_result를 보존
        const { error: upsertError } = await supabase
            .from('user_season_history')
            .upsert(
                { user_id: userId, season: seasonLabel, lottery_result: lotteryResult },
                { onConflict: 'user_id, season' }
            );
        if (upsertError) {
            console.error('❌ [seasonArchive] Failed to upsert lottery result (fallback):', upsertError);
        } else {
            console.log(`✅ Lottery result upserted (fallback) for season ${seasonLabel}.`);
        }
        return;
    }

    console.log(`✅ Lottery result archived for season ${seasonLabel}.`);
}

// ── 이전 시즌 기록 조회 ──

/**
 * 특정 선수의 커리어 스탯 (시즌별) 조회.
 */
export async function getCareerStats(userId: string, playerId: string): Promise<CareerSeasonLine[]> {
    const { data, error } = await supabase
        .from('user_season_history')
        .select('season, season_number, player_stats')
        .eq('user_id', userId)
        .order('season_number', { ascending: true });

    if (error || !data) {
        console.error('❌ [seasonArchive] Failed to load career stats:', error);
        return [];
    }

    return data
        .filter((row: any) => row.player_stats?.[playerId])
        .map((row: any) => ({
            season: row.season,
            seasonNumber: row.season_number,
            stats: row.player_stats[playerId],
        }));
}

/**
 * 모든 시즌 히스토리 로드 (팀 성적 + 플레이오프 결과).
 */
export async function loadSeasonHistory(userId: string): Promise<SeasonArchiveEntry[]> {
    const { data, error } = await supabase
        .from('user_season_history')
        .select('*')
        .eq('user_id', userId)
        .order('season_number', { ascending: true });

    if (error || !data) {
        console.error('❌ [seasonArchive] Failed to load season history:', error);
        return [];
    }

    return data.map((row: any) => ({
        season: row.season,
        seasonNumber: row.season_number,
        teamId: row.team_id,
        wins: row.wins,
        losses: row.losses,
        playoffResult: row.playoff_result,
        playerStats: row.player_stats,
        playerOverrides: row.player_overrides,
        awards: row.awards,
        lotteryResult: row.lottery_result ?? null,
        teamFinances: row.team_finances ?? null,
    }));
}

// ── 헬퍼 ──

function determinePlayoffResult(teamId: string, playoffSeries: PlayoffSeries[]): string | null {
    if (playoffSeries.length === 0) return null;

    // 팀이 참여한 시리즈 중 가장 높은 라운드
    const teamSeries = playoffSeries.filter(
        s => s.higherSeedId === teamId || s.lowerSeedId === teamId
    );

    if (teamSeries.length === 0) return null;

    const maxRound = Math.max(...teamSeries.map(s => s.round));
    const lastSeries = teamSeries.find(s => s.round === maxRound);

    if (!lastSeries) return null;

    // 파이널(round 4) 우승
    if (lastSeries.round === 4 && lastSeries.winnerId === teamId) return 'Champion';

    // 라운드별 결과
    const roundNames: Record<number, string> = {
        0: 'Play-In',
        1: 'R1',
        2: 'R2',
        3: 'CF',
        4: 'Finals',
    };

    return roundNames[maxRound] || null;
}
