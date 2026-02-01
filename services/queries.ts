
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { Team, Game, Player, Transaction } from '../types';
import { resolveTeamId, mapDatabaseScheduleToRuntimeGame, FALLBACK_TEAMS, getTeamLogoUrl } from '../utils/constants';
import { generateScoutingReport } from './geminiService';

// --- Fetch Base Data (Teams & Schedule) ---
export const useBaseData = () => {
    return useQuery({
        queryKey: ['baseData'],
        queryFn: async () => {
            // 1. Fetch Teams
            const { data: teamsData, error: teamsError } = await supabase
                .from('teams')
                .select('*');
            
            // 2. Fetch Players
            const { data: playersData, error: playersError } = await supabase
                .from('players')
                .select('*');

            // 3. Fetch Schedule
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('schedule')
                .select('*');
            
            // Data Validation: If key tables are missing, fallback to hardcoded data
            // But prefer DB data if available, even if partial.
            const useFallback = teamsError || !teamsData || teamsData.length === 0;
            
            const rawTeams = useFallback ? FALLBACK_TEAMS : teamsData;

            // Map Players to Teams
            const teams: Team[] = rawTeams.map((t: any) => {
                // Determine ID: DB uses 'id' (uuid or string), Fallback uses 'id' (string)
                const teamId = t.id; 
                
                // Determine Name/City: Prefer DB columns, fallback to t.* props
                // If using FALLBACK_TEAMS, t.name is already Korean.
                // If using DB teamsData, we expect columns like 'city', 'name', 'conference'.
                // If DB data is English, we might need a mapping here, but assuming DB is source of truth or matches.
                
                // Robust Conference Mapping
                let conf = t.conference || t.Conference || 'East';
                if (typeof conf === 'string') {
                    if (conf.toLowerCase().includes('east')) conf = 'East';
                    else if (conf.toLowerCase().includes('west')) conf = 'West';
                }

                const logoUrl = getTeamLogoUrl(teamId);

                // Find roster in playersData
                // [Critical Fix]: Ensure ID types match. DB might use UUID for team_id.
                // If using FALLBACK_TEAMS, we rely on 'team_id' column in players table matching 'atl', 'bos' etc.
                // If DB teams table is used, we match t.id with p.team_id.
                const roster = (playersData || [])
                    .filter((p: any) => p.team_id == teamId) // Loose equality for string/number match
                    .map((p: any) => ({
                        ...p,
                        stats: { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 },
                        playoffStats: { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 }
                    }));

                return {
                    id: teamId,
                    name: t.name,
                    city: t.city,
                    logo: logoUrl,
                    conference: conf as 'East' | 'West',
                    division: t.division,
                    wins: 0,
                    losses: 0,
                    budget: 150, // Default
                    salaryCap: 140, // Default
                    luxuryTaxLine: 170, // Default
                    roster: roster
                };
            });

            // Map Schedule
            let schedule: Game[] = [];
            if (scheduleData && scheduleData.length > 0) {
                schedule = mapDatabaseScheduleToRuntimeGame(scheduleData);
            }

            return { teams, schedule };
        },
        staleTime: Infinity
    });
};

// --- Save/Load System ---
export const useSaveGame = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ userId, teamId, gameData }: { userId: string, teamId: string, gameData: any }) => {
            // Simplified Save: Upsert to 'saves' table
            const { error } = await supabase
                .from('saves')
                .upsert({ 
                    user_id: userId, 
                    team_id: teamId, 
                    game_data: gameData,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
            
            if (error) throw error;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['saveData', variables.userId] });
        }
    });
};

export const useLoadSave = (userId?: string) => {
    return useQuery({
        queryKey: ['saveData', userId],
        queryFn: async () => {
            if (!userId) return null;
            const { data, error } = await supabase
                .from('saves')
                .select('*')
                .eq('user_id', userId)
                .single();
            
            if (error && error.code !== 'PGRST116') throw error; // Ignore no rows found
            return data;
        },
        enabled: !!userId
    });
};

// --- Game Results & Schedule ---
export const useMonthlySchedule = (userId: string | undefined, year: number, month: number) => {
    return useQuery({
        queryKey: ['monthlySchedule', userId, year, month],
        queryFn: async () => {
            if (!userId) return [];
            
            // Calculate start and end date for the month
            const startDate = new Date(year, month, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

            const { data, error } = await supabase
                .from('user_game_results')
                .select('*')
                .eq('user_id', userId)
                .gte('date', startDate)
                .lte('date', endDate);

            if (error) throw error;
            return data;
        },
        enabled: !!userId
    });
};

export const saveGameResults = async (results: any[]) => {
    const { error } = await supabase
        .from('user_game_results')
        .insert(results);
    if (error) console.error("Error saving game results:", error);
};

// --- Transactions ---
export const saveUserTransaction = async (userId: string, transaction: Transaction) => {
    const { error } = await supabase
        .from('user_transactions')
        .insert({
            user_id: userId,
            transaction_id: transaction.id,
            date: transaction.date,
            type: transaction.type,
            team_id: transaction.teamId,
            description: transaction.description,
            details: transaction.details
        });
    if (error) console.error("Error saving transaction:", error);
};

// --- Scouting ---
export const useScoutingReport = (player: Player | null) => {
    return useQuery({
        queryKey: ['scoutingReport', player?.id],
        queryFn: async () => {
            if (!player) return null;
            return await generateScoutingReport(player);
        },
        enabled: !!player,
        staleTime: Infinity
    });
};
