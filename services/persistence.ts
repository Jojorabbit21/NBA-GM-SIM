
import { supabase } from './supabaseClient';
import { Transaction, GameTactics, DepthChart, SavedPlayerState, ReplaySnapshot } from '../types';

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
    replaySnapshot?: ReplaySnapshot | null // [New] Cached replay state
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

    // Direct upsert (Column 'roster_state' and 'depth_chart' confirmed to exist)
    const { data, error } = await supabase
        .from('saves')
        .upsert(payload, { onConflict: 'user_id' })
        .select();
    
    if (error) {
        console.error("❌ [Supabase] Save Failed:", error);
        throw error;
    }
    return data;
};

// 2. Load Metadata
export const loadCheckpoint = async (userId: string) => {
    const { data, error } = await supabase
        .from('saves')
        .select('team_id, sim_date, tactics, roster_state, depth_chart, tendency_seed, draft_picks, replay_snapshot, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data;
};

// 3. Load History Logs (Source of Truth)
export const loadUserHistory = async (userId: string) => {
    const [gamesRes, txRes] = await Promise.all([
        supabase.from('user_game_results')
            .select('game_id, date, home_team_id, away_team_id, home_score, away_score, box_score, tactics, is_playoff, series_id')
            .eq('user_id', userId).order('date', { ascending: true }),
        supabase.from('user_transactions')
            .select('id, transaction_id, date, type, team_id, description, details')
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
        .select('id, transaction_id, date, type, team_id, description, details')
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
        user_id: userId,
        transaction_id: tx.id,
        date: tx.date,
        type: tx.type,
        team_id: tx.teamId,
        description: tx.description,
        details: tx.details
    });
};
