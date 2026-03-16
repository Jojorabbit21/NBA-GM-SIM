
import { supabase } from './supabaseClient';
import { HallOfFameScoreBreakdown, RosterSnapshotPlayer } from '../utils/hallOfFameScorer';
import { DEFAULT_SEASON_CONFIG } from '../utils/seasonConfig';

export interface HallOfFameEntry {
    id: string;
    user_id: string;
    hof_id: string;
    team_id: string;
    season: string;
    total_score: number;
    score_breakdown: HallOfFameScoreBreakdown;
    roster_snapshot: RosterSnapshotPlayer[];
    user_email?: string;
    submitted_at: string;
}

/**
 * Fetch all hall of fame entries, ordered by total_score DESC.
 */
export const fetchHallOfFameEntries = async (season = DEFAULT_SEASON_CONFIG.seasonLabel): Promise<HallOfFameEntry[]> => {
    const { data, error } = await supabase
        .from('hall_of_fame')
        .select('*')
        .eq('season', season)
        .order('total_score', { ascending: false });

    if (error) {
        console.error("❌ Failed to fetch hall of fame entries:", error);
        return [];
    }
    return data || [];
};

/**
 * Check if the current save (hof_id) has already submitted.
 */
export const checkUserHasSubmitted = async (
    hofId: string | null
): Promise<boolean> => {
    if (!hofId) return false;
    const { data, error } = await supabase
        .from('hall_of_fame')
        .select('id')
        .eq('hof_id', hofId)
        .maybeSingle();

    if (error) {
        console.error("❌ Failed to check HOF submission:", error);
        return false;
    }
    return !!data;
};

/**
 * Submit a hall of fame entry. Returns success/alreadySubmitted status.
 */
export const submitHallOfFameEntry = async (
    userId: string,
    teamId: string,
    hofId: string,
    totalScore: number,
    breakdown: HallOfFameScoreBreakdown,
    rosterSnapshot: RosterSnapshotPlayer[],
    userEmail?: string,
    season = DEFAULT_SEASON_CONFIG.seasonLabel
): Promise<{ success: boolean; alreadySubmitted: boolean }> => {
    const payload = {
        user_id: userId,
        team_id: teamId,
        hof_id: hofId,
        season,
        total_score: totalScore,
        score_breakdown: breakdown,
        roster_snapshot: rosterSnapshot,
        user_email: userEmail || null,
    };

    const { error } = await supabase
        .from('hall_of_fame')
        .insert(payload);

    if (error) {
        // Unique constraint violation = already submitted
        if (error.code === '23505') {
            return { success: false, alreadySubmitted: true };
        }
        console.error("❌ Failed to submit hall of fame entry:", error);
        return { success: false, alreadySubmitted: false };
    }

    console.log("✅ Hall of Fame entry submitted.");
    return { success: true, alreadySubmitted: false };
};
