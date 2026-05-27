
import { supabase } from './supabaseClient';
import { Transaction } from '../types';
import { type SaveSummary } from '../types/app';

// 1. Save Metadata (Pointer to current progress)
export const saveCheckpoint = async (
    userId: string,
    teamId: string,
    simDate: string,
    columns: Record<string, any> = {},
) => {
    if (!userId || !teamId || !simDate) return null;

    const payload: Record<string, any> = {
        user_id: userId,
        team_id: teamId,
        sim_date: simDate,
        updated_at: new Date().toISOString(),
        ...columns,
    };

    let { data, error } = await supabase
        .from('saves')
        .upsert(payload, { onConflict: 'user_id' })
        .select('hof_id');

    if (error) {
        const optionalColumns = [
            'league_trade_blocks', 'league_trade_offers', 'league_gm_profiles',
            'league_training_configs', 'coach_fa_pool',
        ] as const;
        const hasOptionalColumn = optionalColumns.some(k => k in payload);
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

export const writeTransaction = async (userId: string, tx: Transaction, maxAttempts = 3) => {
    const row = {
        id: tx.id,
        user_id: userId,
        date: tx.date,
        type: tx.type,
        team_id: tx.teamId,
        season: tx.season ?? null,
        description: tx.description,
        details: tx.details
    };
    let lastError: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const res = await supabase.from('user_transactions').insert(row);
        if (!res.error) return;
        lastError = res.error;
        // Duplicate key — transaction already exists, treat as success
        if (res.error.code === '23505') return;
        console.warn(`⚠️ [writeTransaction] attempt ${attempt}/${maxAttempts}:`, res.error.message);
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
    console.error('❌ [writeTransaction] all attempts failed:', lastError);
    throw lastError;
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
