
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { Team, Game, Player, Transaction } from '../types';
import { generateScoutingReport } from './geminiService';
import { mapPlayersToTeams, mapFreeAgents, mapDatabaseScheduleToRuntimeGame, postProcessAllPlayersOVR } from './dataMapper';
import { populateTeamData } from '../data/teamData';
import { populateStaffData } from './coachingStaff/coachGenerator';
import { populateGMData } from './tradeEngine/gmProfiler';
import { rebuildDerivedConstants } from '../utils/constants';

// --- Fetch Base Data (Static Initial State) ---
export const useBaseData = (enabled: boolean = true) => {
    return useQuery({
        queryKey: ['baseData'],
        enabled,
        queryFn: async () => {
            console.log("🔄 Fetching Base Data from Supabase...");

            // 4개 meta 테이블 병렬 fetch
            const [teamsRes, playersRes, scheduleRes, coachesRes, gmsRes] = await Promise.all([
                supabase.from('meta_teams').select('*'),
                supabase.from('meta_players').select('*').or('draft_year.is.null,draft_year.neq.2026'),
                supabase.from('meta_schedule').select('*'),
                supabase.from('meta_coaches').select('*'),
                supabase.from('meta_gms').select('*'),
            ]);

            // 1. meta_teams → TEAM_DATA 갱신 (mapPlayersToTeams보다 먼저!)
            if (!teamsRes.error && teamsRes.data && teamsRes.data.length > 0) {
                populateTeamData(teamsRes.data);
                rebuildDerivedConstants();
            } else {
                console.warn("⚠️ 'meta_teams' empty/error, using fallback hardcoded data", teamsRes.error);
            }

            // 1-b. meta_coaches → STAFF_DATA 갱신 (전 직무)
            if (!coachesRes.error && coachesRes.data && coachesRes.data.length > 0) {
                populateStaffData(coachesRes.data);
            } else {
                console.warn("⚠️ 'meta_coaches' empty/error, using fallback seed-based data", coachesRes.error);
            }

            // 1-c. meta_gms → GM_DATA 갱신
            if (!gmsRes.error && gmsRes.data && gmsRes.data.length > 0) {
                populateGMData(gmsRes.data);
            } else {
                console.warn("⚠️ 'meta_gms' empty/error, using fallback seed-based generation", gmsRes.error);
            }

            // 2. meta_players — 핵심 테이블, 실패 시 throw
            if (playersRes.error) throw new Error(`선수 데이터 로드 실패: ${playersRes.error.message}`);
            const playersData = playersRes.data || [];

            // 3. meta_schedule — 핵심 테이블, 실패 시 throw
            if (scheduleRes.error) throw new Error(`일정 데이터 로드 실패: ${scheduleRes.error.message}`);
            const scheduleData = scheduleRes.data || [];

            const teams: Team[] = mapPlayersToTeams(playersData);
            const freeAgents: Player[] = mapFreeAgents(playersData);

            // 전체 선수 로드 완료 → 리그 분포 기반 OVR / futureOvr 최종 보정
            postProcessAllPlayersOVR(teams, freeAgents);

            let schedule: Game[] = [];
            if (scheduleData && scheduleData.length > 0) {
                schedule = mapDatabaseScheduleToRuntimeGame(scheduleData);
            }

            return { teams, schedule, freeAgents };
        },
        staleTime: Infinity,
        retry: 2
    });
};

// --- Monthly Schedule for Calendar View ---
export const useMonthlySchedule = (userId?: string, year?: number, month?: number) => {
    return useQuery({
        queryKey: ['monthlySchedule', userId, year, month],
        queryFn: async () => {
            if (!userId || year === undefined || month === undefined) return [];

            const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month + 1, 0).getDate();
            const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;

            const { data, error } = await supabase
                .from('user_game_results')
                .select('game_id, date, home_team_id, away_team_id, home_score, away_score')
                .eq('user_id', userId)
                .gte('date', startStr)
                .lte('date', endStr);

            if (error) {
                console.error("❌ Failed to fetch monthly schedule:", error);
                return [];
            }
            return data || [];
        },
        enabled: !!userId && year !== undefined && month !== undefined,
        staleTime: 60 * 1000 // 1 minute
    });
};

// --- Fetch Predefined Draft Class from meta_players (by draft_year) ---
export const fetchPredefinedDraftClass = async (draftYear: string): Promise<any[]> => {
    const { data, error } = await supabase
        .from('meta_players')
        .select('*')
        .eq('draft_year', draftYear);

    if (error) {
        console.error(`❌ Failed to fetch draft class for ${draftYear}:`, error);
        return [];
    }
    return data || [];
};

// --- Single Game Result for Inbox Detail ---
export const fetchFullGameResult = async (gameId: string, userId: string) => {
    const { data, error } = await supabase
        .from('user_game_results')
        .select('*')
        .eq('game_id', gameId)
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1);

    if (error) {
        console.error("❌ Failed to fetch game details:", error);
        return null;
    }
    return data?.[0] ?? null;
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

// --- Player Game Log (최근 경기 기록 — 정규시즌 + 플레이오프) ---
export const usePlayerGameLog = (playerId: string, teamId?: string) => {
    return useQuery({
        queryKey: ['playerGameLog', playerId, teamId],
        queryFn: async () => {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                console.warn('⚠️ [usePlayerGameLog] Session error:', sessionError.message);
                return [];
            }
            const userId = sessionData.session?.user?.id;
            if (!userId || !teamId) return [];

            const [regularRes, playoffRes] = await Promise.all([
                supabase
                    .from('user_game_results')
                    .select('date, home_team_id, away_team_id, home_score, away_score, box_score')
                    .eq('user_id', userId)
                    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
                    .order('date', { ascending: false }),
                supabase
                    .from('user_playoffs_results')
                    .select('date, home_team_id, away_team_id, home_score, away_score, box_score')
                    .eq('user_id', userId)
                    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
                    .order('date', { ascending: false }),
            ]);

            if (regularRes.error) console.warn('⚠️ [usePlayerGameLog] Regular games error:', regularRes.error);
            if (playoffRes.error) console.warn('⚠️ [usePlayerGameLog] Playoff games error:', playoffRes.error);

            const allGames = [
                ...(regularRes.data || []).map(g => ({ ...g, isPlayoff: false })),
                ...(playoffRes.data || []).map(g => ({ ...g, isPlayoff: true })),
            ].sort((a, b) => b.date.localeCompare(a.date));

            return allGames
                .map(game => {
                    const isHome = game.home_team_id === teamId;
                    const box = isHome ? game.box_score?.home : game.box_score?.away;
                    const playerBox = box?.find((p: any) => p.playerId === playerId);
                    if (!playerBox) return null;
                    return {
                        date: game.date,
                        opponentId: isHome ? game.away_team_id : game.home_team_id,
                        isHome,
                        teamScore: isHome ? game.home_score : game.away_score,
                        opponentScore: isHome ? game.away_score : game.home_score,
                        isPlayoff: game.isPlayoff,
                        ...playerBox,
                    };
                })
                .filter(Boolean);
        },
        enabled: !!teamId,
        staleTime: 60_000,
    });
};

// --- Mutations ---

export const saveGameResults = async (results: any[]) => {
    if (!results || results.length === 0) return;
    
    // 1. Try saving with FULL data (including pbp_logs, shot_events)
    const { error } = await supabase.from('user_game_results').insert(results);
    
    if (error) {
        console.error("❌ Save Full Game Results Error:", error.message);
        
        // 2. Fallback: If error is due to missing columns, retry without heavy logs
        // Postgres error code 42703 is "undefined_column", but Supabase/Postgrest message checking is safer
        if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
            console.warn("⚠️ DB Schema mismatch detected. Retrying save WITHOUT 'pbp_logs', 'shot_events', 'quarter_scores'. PLEASE RUN SQL MIGRATION.");

            const safeResults = results.map(r => {
                const { pbp_logs, shot_events, quarter_scores, game_number, series_id, round_number, ...rest } = r;
                return rest;
            });
            
            const { error: retryError } = await supabase.from('user_game_results').insert(safeResults);

            if (retryError) {
                console.error("❌ Save Fallback Failed:", retryError);
                throw retryError;
            } else {
                console.log("✅ Saved game results (Partial Data - Logs Dropped) to DB.");
            }
        }
    } else {
        console.log(`✅ Saved ${results.length} game results (Full Data) to DB.`);
    }
};

/** 배치 시뮬레이션용: 대량 결과를 50건씩 청크로 나눠 저장 */
export const bulkSaveGameResults = async (results: any[], chunkSize = 50) => {
    if (!results || results.length === 0) return;
    let failedChunks = 0;
    for (let i = 0; i < results.length; i += chunkSize) {
        const chunk = results.slice(i, i + chunkSize);
        try {
            await saveGameResults(chunk);
        } catch (e) {
            failedChunks++;
            console.error(`❌ Chunk ${Math.floor(i / chunkSize) + 1} save failed, continuing...`, e);
        }
    }
    const totalChunks = Math.ceil(results.length / chunkSize);
    if (failedChunks > 0) {
        console.warn(`⚠️ Bulk save: ${failedChunks}/${totalChunks} chunks failed.`);
    } else {
        console.log(`✅ Bulk saved ${results.length} game results in ${totalChunks} chunks.`);
    }
};


