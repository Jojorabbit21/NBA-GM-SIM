
import { supabase } from './supabaseClient';
import { Transaction, GameTactics, DepthChart, SavedPlayerState, ReplaySnapshot } from '../types';
import { SimSettings } from '../types/simSettings';
import { SavedTeamFinances } from '../types/finance';
import { LeaguePickAssets } from '../types/draftAssets';
import { LeagueTradeBlocks, LeagueTradeOffers } from '../types/trade';

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
    leagueTradeOffers?: LeagueTradeOffers | null  // [New] Persistent trade offers
) => {
    if (!userId || !teamId || !simDate) return null;

    const payload: any = {
        user_id: userId,
        team_id: teamId,
        sim_date: simDate,
        updated_at: new Date().toISOString()
    };

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

    // Direct upsert (Column 'roster_state' and 'depth_chart' confirmed to exist)
    let { data, error } = await supabase
        .from('saves')
        .upsert(payload, { onConflict: 'user_id' })
        .select('hof_id');

    if (error) {
        // 새 컬럼이 DB에 없을 수 있음 → 해당 필드 제거 후 재시도
        if (payload.league_trade_blocks !== undefined || payload.league_trade_offers !== undefined) {
            console.warn('⚠️ [saveCheckpoint] Save failed, retrying without trade columns:', error.message);
            delete payload.league_trade_blocks;
            delete payload.league_trade_offers;
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
        .select('team_id, sim_date, tactics, roster_state, depth_chart, tendency_seed, draft_picks, replay_snapshot, hof_id, updated_at, sim_settings, coaching_staff, team_finances, league_pick_assets, league_trade_blocks, league_trade_offers')
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
export const loadUserHistory = async (userId: string) => {
    const [gamesRes, txRes] = await Promise.all([
        supabase.from('user_game_results')
            .select('game_id, date, home_team_id, away_team_id, home_score, away_score, box_score, tactics, is_playoff, series_id')
            .eq('user_id', userId).order('date', { ascending: true }),
        supabase.from('user_transactions')
            .select('id, date, type, team_id, description, details')
            .eq('user_id', userId).order('date', { ascending: true })
    ]);

    return {
        games: gamesRes.data || [],
        transactions: txRes.data || []
    };
};

// 3-1. Count user data for snapshot validation (HEAD request, no body)
export const countUserData = async (userId: string) => {
    const [gamesCount, playoffCount, txCount] = await Promise.all([
        supabase.from('user_game_results').select('game_id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('user_playoffs_results').select('game_id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('user_transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    return {
        games: gamesCount.count || 0,
        playoffs: playoffCount.count || 0,
        transactions: txCount.count || 0,
    };
};

// 3-2. Load only transactions (for snapshot hydration path — no game results needed)
export const loadUserTransactions = async (userId: string) => {
    const { data, error } = await supabase
        .from('user_transactions')
        .select('id, date, type, team_id, description, details')
        .eq('user_id', userId)
        .order('date', { ascending: true });
    if (error) throw error;
    return data || [];
};

// 4. Write Logs
export const writeGameResult = async (result: any) => {
    // result object now contains shot_events, assuming the backend can handle it
    await supabase.from('user_game_results').insert(result);
};

export const writeTransaction = async (userId: string, tx: Transaction) => {
    await supabase.from('user_transactions').insert({
        id: tx.id,
        user_id: userId,
        date: tx.date,
        type: tx.type,
        team_id: tx.teamId,
        description: tx.description,
        details: tx.details
    });
};
