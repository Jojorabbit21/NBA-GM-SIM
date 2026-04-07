
import { supabase } from './supabaseClient';
import { Transaction, GameTactics, DepthChart, SavedPlayerState, ReplaySnapshot } from '../types';
import { SimSettings } from '../types/simSettings';
import { SavedTeamFinances } from '../types/finance';
import { LeaguePickAssets } from '../types/draftAssets';
import { LeagueTradeBlocks, LeagueTradeOffers } from '../types/trade';
import { LeagueGMProfiles } from '../types/gm';
import { OffseasonPhase, type SaveSummary } from '../types/app';
import { LeagueFAPool } from '../types/generatedPlayer';
import { LeagueFAMarket } from '../types/fa';
import type { LeagueTrainingConfigs } from '../types/training';
import type { CoachFAPool } from '../types/coaching';

// 1. Save Metadata (Pointer to current progress)
export const saveCheckpoint = async (
    userId: string,
    teamId: string,
    simDate: string,
    tactics?: GameTactics | null,
    rosterState?: Record<string, SavedPlayerState | number>, // Supports legacy number or new Object
    depthChart?: DepthChart | null, // [New] Depth Chart Data
    draftPicks?: { teams: Record<string, string[]>; picks: any[] } | null,
    tendencySeed?: string | null, // [New] Save-seeded hidden tendencies
    replaySnapshot?: ReplaySnapshot | null, // [New] Cached replay state
    simSettings?: SimSettings | null, // [New] User simulation settings
    coachingStaff?: Record<string, any> | null, // [New] League coaching staff data
    teamFinances?: SavedTeamFinances | null, // [New] Team finance state
    leaguePickAssets?: LeaguePickAssets | null, // [New] League-wide draft pick assets
    leagueTradeBlocks?: LeagueTradeBlocks | null, // [New] Persistent trade blocks
    leagueTradeOffers?: LeagueTradeOffers | null,  // [New] Persistent trade offers
    leagueGMProfiles?: LeagueGMProfiles | null,  // [New] GM profiles
    seasonNumber?: number,      // [Multi-Season] 현재 시즌 번호
    currentSeason?: string,     // [Multi-Season] 현재 시즌 라벨 (e.g. '2025-2026')
    lotteryResult?: any | null,  // [New] 드래프트 로터리 추첨 결과
    offseasonPhase?: OffseasonPhase,  // [Multi-Season] 오프시즌 진행 단계
    leagueFAPool?: LeagueFAPool | null,  // [Multi-Season] 생성 FA 선수 목록
    retiredPlayerIds?: string[] | null,  // [Multi-Season] 누적 은퇴 선수 ID 목록
    leagueFAMarket?: LeagueFAMarket | null,  // [FA] FA 시장 상태
    leagueCapHistory?: Record<number, number> | null,  // [Multi-Season] 시즌별 샐러리 캡 히스토리
    leagueTrainingConfigs?: LeagueTrainingConfigs | null,  // [Training] 팀별 훈련 설정
    coachFAPool?: CoachFAPool | null  // [Coaching] 코치 FA 풀
) => {
    if (!userId || !teamId || !simDate) return null;

    const payload: any = {
        user_id: userId,
        team_id: teamId,
        sim_date: simDate,
        updated_at: new Date().toISOString()
    };

    // season 정보: 값이 있을 때만 저장
    if (seasonNumber !== undefined) {
        payload.season_number = seasonNumber;
    }
    if (currentSeason !== undefined) {
        payload.current_season = currentSeason;
    }

    if (tactics) {
        payload.tactics = tactics;
    }

    if (rosterState) {
        payload.roster_state = rosterState;
    }

    if (depthChart) {
        payload.depth_chart = depthChart;
    }

    // draft_picks: null이면 명시적으로 null 저장하지 않음 (기존 값 유지)
    // 값이 있으면 저장
    if (draftPicks !== undefined) {
        payload.draft_picks = draftPicks;
    }

    // tendency_seed: 명시적으로 값이 있을 때만 저장 (null로 기존 시드를 덮어쓰지 않도록)
    if (tendencySeed) {
        payload.tendency_seed = tendencySeed;
    }

    // replay_snapshot: 경기 결과 저장 후 호출 시에만 포함
    if (replaySnapshot !== undefined) {
        payload.replay_snapshot = replaySnapshot;
    }

    // sim_settings: 값이 있을 때만 저장
    if (simSettings !== undefined) {
        payload.sim_settings = simSettings;
    }

    // coaching_staff: 값이 있을 때만 저장
    if (coachingStaff !== undefined) {
        payload.coaching_staff = coachingStaff;
    }

    // team_finances: 값이 있을 때만 저장
    if (teamFinances !== undefined) {
        payload.team_finances = teamFinances;
    }

    // league_pick_assets: 값이 있을 때만 저장
    if (leaguePickAssets !== undefined) {
        payload.league_pick_assets = leaguePickAssets;
    }

    // league_trade_blocks: 값이 있을 때만 저장
    if (leagueTradeBlocks !== undefined) {
        payload.league_trade_blocks = leagueTradeBlocks;
    }

    // league_trade_offers: 값이 있을 때만 저장
    if (leagueTradeOffers !== undefined) {
        payload.league_trade_offers = leagueTradeOffers;
    }

    // league_gm_profiles: 값이 있을 때만 저장
    if (leagueGMProfiles !== undefined) {
        payload.league_gm_profiles = leagueGMProfiles;
    }

    // lottery_result: 값이 있을 때만 저장
    if (lotteryResult !== undefined) {
        payload.lottery_result = lotteryResult;
    }

    // offseason_phase: 값이 있을 때만 저장 (null도 명시적 저장)
    if (offseasonPhase !== undefined) {
        payload.offseason_phase = offseasonPhase;
    }

    // league_fa_pool: 생성 FA 선수 ID 목록
    if (leagueFAPool !== undefined) {
        payload.league_fa_pool = leagueFAPool;
    }

    // retired_player_ids: 누적 은퇴 선수 ID 목록
    if (retiredPlayerIds !== undefined) {
        payload.retired_player_ids = retiredPlayerIds ?? [];
    }

    // league_fa_market: FA 시장 상태
    if (leagueFAMarket !== undefined) {
        payload.league_fa_market = leagueFAMarket;
    }

    // league_cap_history: 시즌별 샐러리 캡 히스토리
    if (leagueCapHistory !== undefined) {
        payload.league_cap_history = leagueCapHistory;
    }

    // league_training_configs: 팀별 훈련 설정
    if (leagueTrainingConfigs !== undefined) {
        payload.league_training_configs = leagueTrainingConfigs;
    }

    // coach_fa_pool: 코치 FA 풀
    if (coachFAPool !== undefined) {
        payload.coach_fa_pool = coachFAPool;
    }

    // Direct upsert (Column 'roster_state' and 'depth_chart' confirmed to exist)
    let { data, error } = await supabase
        .from('saves')
        .upsert(payload, { onConflict: 'user_id' })
        .select('hof_id');

    if (error) {
        // 새 컬럼이 DB에 없을 수 있음 → 해당 필드 모두 제거 후 재시도
        const optionalColumns = [
            'league_trade_blocks', 'league_trade_offers', 'league_gm_profiles',
            'league_training_configs', 'coach_fa_pool',
        ] as const;
        const hasOptionalColumn = optionalColumns.some(k => payload[k] !== undefined);
        if (hasOptionalColumn) {
            console.warn('⚠️ [saveCheckpoint] Save failed, retrying without optional columns:', error.message);
            optionalColumns.forEach(k => delete payload[k]);
            const retry = await supabase
                .from('saves')
                .upsert(payload, { onConflict: 'user_id' })
                .select('hof_id');
            if (retry.error) {
                console.error("❌ [Supabase] Save Failed (retry):", retry.error);
                throw retry.error;
            }
            return retry.data;
        }
        console.error("❌ [Supabase] Save Failed:", error);
        throw error;
    }
    return data;
};

// 2. Load Metadata
export const loadCheckpoint = async (userId: string) => {
    // 먼저 새 컬럼 포함 시도, 실패 시 기존 컬럼만으로 폴백
    const { data, error } = await supabase
        .from('saves')
        .select('team_id, sim_date, tactics, roster_state, depth_chart, tendency_seed, draft_picks, replay_snapshot, hof_id, updated_at, sim_settings, coaching_staff, team_finances, league_pick_assets, league_trade_blocks, league_trade_offers, league_gm_profiles, season_number, current_season, lottery_result, offseason_phase, league_fa_pool, retired_player_ids, league_fa_market, league_cap_history, league_training_configs, coach_fa_pool')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        // 새 컬럼(league_trade_blocks/offers)이 DB에 없으면 → 기존 컬럼만으로 재시도
        console.warn('⚠️ [loadCheckpoint] Query failed, retrying without trade columns:', error.message);
        const { data: fallbackData, error: fallbackError } = await supabase
            .from('saves')
            .select('team_id, sim_date, tactics, roster_state, depth_chart, tendency_seed, draft_picks, replay_snapshot, hof_id, updated_at, sim_settings, coaching_staff, team_finances, league_pick_assets')
            .eq('user_id', userId)
            .maybeSingle();
        if (fallbackError) throw fallbackError;
        return fallbackData;
    }
    return data;
};

// 3. Load History Logs (Source of Truth)
export const loadUserHistory = async (userId: string, season?: string) => {
    let gamesQuery = supabase.from('user_game_results')
        .select('game_id, date, home_team_id, away_team_id, home_score, away_score, box_score, tactics, is_playoff, series_id, season')
        .eq('user_id', userId);
    if (season) gamesQuery = gamesQuery.eq('season', season);
    gamesQuery = gamesQuery.order('date', { ascending: true });

    let txQuery = supabase.from('user_transactions')
        .select('id, date, type, team_id, season, description, details')
        .eq('user_id', userId);
    if (season) txQuery = txQuery.eq('season', season);
    txQuery = txQuery.order('date', { ascending: true });

    const [gamesRes, txRes] = await Promise.all([gamesQuery, txQuery]);

    // 게임 기록은 state replay의 source of truth — 실패 시 throw
    if (gamesRes.error) throw gamesRes.error;
    // 트랜잭션은 비핵심 — 실패 시 경고 후 빈 배열
    if (txRes.error) console.warn('⚠️ [loadUserHistory] Transactions fetch failed:', txRes.error);

    return {
        games: gamesRes.data || [],
        transactions: txRes.data || []
    };
};

// 3-1. Count user data for snapshot validation (HEAD request, no body)
export const countUserData = async (userId: string, season?: string) => {
    let gamesQ = supabase.from('user_game_results').select('game_id', { count: 'exact', head: true }).eq('user_id', userId);
    if (season) gamesQ = gamesQ.eq('season', season);
    let playoffQ = supabase.from('user_playoffs_results').select('game_id', { count: 'exact', head: true }).eq('user_id', userId);
    if (season) playoffQ = playoffQ.eq('season', season);
    let txQ = supabase.from('user_transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if (season) txQ = txQ.eq('season', season);

    const [gamesCount, playoffCount, txCount] = await Promise.all([gamesQ, playoffQ, txQ]);
    return {
        games: gamesCount.error ? -1 : (gamesCount.count ?? 0),
        playoffs: playoffCount.error ? -1 : (playoffCount.count ?? 0),
        transactions: txCount.error ? -1 : (txCount.count ?? 0),
    };
};

// 3-2. Load only transactions (for snapshot hydration path — no game results needed)
export const loadUserTransactions = async (userId: string, season?: string) => {
    let query = supabase
        .from('user_transactions')
        .select('id, date, type, team_id, season, description, details')
        .eq('user_id', userId);
    if (season) query = query.eq('season', season);
    query = query.order('date', { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
};

// 4. Write Logs
export const writeGameResult = async (result: any) => {
    const res = await supabase.from('user_game_results').insert(result);
    if (res.error) {
        console.error('❌ [writeGameResult]:', res.error);
        throw res.error;
    }
};

export const writeTransaction = async (userId: string, tx: Transaction) => {
    const res = await supabase.from('user_transactions').insert({
        id: tx.id,
        user_id: userId,
        date: tx.date,
        type: tx.type,
        team_id: tx.teamId,
        season: tx.season ?? null,
        description: tx.description,
        details: tx.details
    });
    if (res.error) {
        console.error('❌ [writeTransaction]:', res.error);
        throw res.error;
    }
};

export const bulkWriteTransactions = async (userId: string, txList: Transaction[]) => {
    if (txList.length === 0) return;
    const rows = txList.map(tx => ({
        id: tx.id,
        user_id: userId,
        date: tx.date,
        type: tx.type,
        team_id: tx.teamId,
        season: tx.season ?? null,
        description: tx.description,
        details: tx.details,
    }));
    const res = await supabase.from('user_transactions').insert(rows);
    if (res.error) {
        console.error('❌ [bulkWriteTransactions]:', res.error);
        throw res.error;
    }
};

// 로비 화면용 경량 세이브 메타 조회 (풀 리플레이 로드 없이 팀/시즌/W-L만)
export const loadSaveSummary = async (userId: string): Promise<SaveSummary | null> => {
    const { data, error } = await supabase
        .from('saves')
        .select('team_id, current_season, season_number, offseason_phase, updated_at, replay_snapshot')
        .eq('user_id', userId)
        .maybeSingle();
    if (error || !data?.team_id) return null;
    const teamData = (data.replay_snapshot as any)?.teams_data?.[data.team_id];
    return {
        teamId:         data.team_id,
        currentSeason:  (data as any).current_season ?? null,
        seasonNumber:   (data as any).season_number ?? 1,
        offseasonPhase: (data as any).offseason_phase ?? null,
        updatedAt:      data.updated_at ?? new Date().toISOString(),
        wins:           teamData?.wins ?? 0,
        losses:         teamData?.losses ?? 0,
    };
};
