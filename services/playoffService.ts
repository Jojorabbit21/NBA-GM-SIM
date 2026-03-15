
import { supabase } from './supabaseClient';
import { PlayoffSeries, PlayoffStateDB, PlayoffGameResultDB } from '../types';

/**
 * Loads the current state of the playoffs from DB.
 */
export const loadPlayoffState = async (userId: string, teamId: string): Promise<PlayoffStateDB | null> => {
    const { data, error } = await supabase
        .from('user_playoffs')
        .select('*')
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .maybeSingle();
    
    if (error) {
        console.error("❌ Failed to load playoff state:", error);
        return null;
    }
    return data;
};

/**
 * Initializes or Updates the Playoff Bracket State in DB.
 */
export const savePlayoffState = async (
    userId: string,
    teamId: string,
    bracketData: PlayoffSeries[],
    currentRound: number = 0,
    isFinished: boolean = false,
    championId?: string,
    seasonLabel?: string
) => {
    const payload = {
        user_id: userId,
        team_id: teamId,
        season: seasonLabel ?? '2025-2026',
        bracket_data: { series: bracketData }, // Wrap in object for JSONB
        current_round: currentRound,
        is_finished: isFinished,
        champion_id: championId,
        updated_at: new Date().toISOString()
    };

    const { error } = await supabase
        .from('user_playoffs')
        .upsert(payload, { onConflict: 'user_id, team_id, season' });

    if (error) {
        console.error("❌ Failed to save playoff state:", error);
    } else {
        console.log("✅ Playoff Bracket Saved.");
    }
};

/**
 * Saves a single playoff game result.
 */
export const savePlayoffGameResult = async (result: any) => {
    // user_playoffs_results 테이블에 존재하는 컬럼만 전송
    // (is_playoff, shot_events, pbp_logs 등은 테이블에 없음)
    const payload = {
        user_id: result.user_id,
        game_id: result.game_id,
        date: result.date,
        series_id: result.series_id,
        round_number: result.round_number || 0,
        game_number: result.game_number || 0,
        home_team_id: result.home_team_id,
        away_team_id: result.away_team_id,
        home_score: result.home_score,
        away_score: result.away_score,
        box_score: result.box_score,
        tactics: result.tactics,
        rotation_data: result.rotation_data,
    };

    const { error } = await supabase
        .from('user_playoffs_results')
        .insert(payload);

    if (error) {
        console.error("❌ Failed to save playoff game result:", error);
    }
};

export const fetchPlayoffGameResult = async (gameId: string, userId: string) => {
    const { data, error } = await supabase
        .from('user_playoffs_results')
        .select('*')
        .eq('game_id', gameId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error("❌ Failed to fetch playoff game details:", error);
        return null;
    }
    return data;
};

export const fetchPlayoffSeriesResults = async (seriesId: string, userId: string) => {
    const { data, error } = await supabase
        .from('user_playoffs_results')
        .select('game_id, home_team_id, away_team_id, home_score, away_score, box_score')
        .eq('series_id', seriesId)
        .eq('user_id', userId)
        .order('game_number', { ascending: true });

    if (error) {
        console.error("❌ Failed to fetch playoff series results:", error);
        return [];
    }
    return data || [];
};

/**
 * Loads all playoff games for the current user/team.
 * Used to replay state on load.
 */
export const loadPlayoffGameResults = async (userId: string) => {
    const { data, error } = await supabase
        .from('user_playoffs_results')
        .select('game_id, date, home_team_id, away_team_id, home_score, away_score, box_score, tactics, series_id, round_number, game_number')
        .eq('user_id', userId)
        .order('date', { ascending: true });

    if (error) {
        console.error("❌ Failed to load playoff results:", error);
        return [];
    }
    return data;
};
