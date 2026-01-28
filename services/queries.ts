
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { generateScoutingReport } from './geminiService';
import { Player, Transaction, Game, Team } from '../types';
import { mapDatabasePlayerToRuntimePlayer, mapDatabaseScheduleToRuntimeGame, resolveTeamId } from '../utils/constants';

/**
 * [Robust Data Loader]
 * 리그 메타 데이터를 불러오고 선수들을 구단에 강제 배정합니다.
 */
export const fetchLeagueData = async (userId?: string) => {
    console.log("[Fetch] Starting global data fetch...");
    
    // 1. 모든 메타 데이터 병렬 로드
    const [teamsRes, playersRes, scheduleRes] = await Promise.all([
        supabase.from('meta_teams').select('*'),
        supabase.from('meta_players').select('*'),
        supabase.from('meta_schedule').select('*').order('game_date', { ascending: true })
    ]);

    if (teamsRes.error) { console.error("Teams Load Error:", teamsRes.error); throw teamsRes.error; }
    if (playersRes.error) { console.error("Players Load Error:", playersRes.error); throw playersRes.error; }
    if (scheduleRes.error) { console.error("Schedule Load Error:", scheduleRes.error); throw scheduleRes.error; }

    const rawTeams = teamsRes.data || [];
    const rawPlayers = playersRes.data || [];
    const rawSchedule = scheduleRes.data || [];

    console.log(`[Fetch] Raw Data: ${rawTeams.length} Teams, ${rawPlayers.length} Players found.`);
    
    // [Debug] 데이터 샘플 확인
    if (rawTeams.length > 0) console.log("[Fetch] Team Sample:", rawTeams[0]);
    if (rawPlayers.length > 0) console.log("[Fetch] Player Sample:", rawPlayers[0]);

    // 2. 전적(Standings) 맵 생성
    let userStandingsMap = new Map<string, { wins: number, losses: number }>();
    if (userId && userId !== 'guest') {
        try {
            const { data: standings } = await supabase
                .from('team_standings') 
                .select('team_id, wins, losses')
                .eq('user_id', userId);
            
            if (standings) {
                standings.forEach(s => userStandingsMap.set(s.team_id, { wins: s.wins, losses: s.losses }));
            }
        } catch (e) {
            console.warn("[Fetch] No standings table found, skipping stats merge.");
        }
    }

    // 3. 데이터 통합 매핑 (Universal Matching Logic)
    const mappedTeams: Team[] = rawTeams.map(t => {
        // 팀의 고유 ID 추출 (ID 컬럼 우선, 없으면 이름으로 변환)
        const teamCanonicalId = resolveTeamId(t.id) !== 'unknown' ? resolveTeamId(t.id) : resolveTeamId(t.name);

        const teamPlayers = rawPlayers.filter(p => {
            // [CRITICAL FIX] 'unknown' vs 'unknown' 매칭 방지
            if (teamCanonicalId === 'unknown') {
                console.warn(`[Fetch] Team ID resolution failed for: ${t.name} (ID: ${t.id})`);
                return false;
            }

            const rawPlayerTeam = p.team_id || p.team || p.Team || "";
            const playerCanonicalId = resolveTeamId(rawPlayerTeam);
            
            // playerCanonicalId가 'unknown'이면 배정 실패 처리
            if (playerCanonicalId === 'unknown') {
                // Debugging (Only log once per team name to reduce noise)
                // console.debug(`[Fetch] Player ID resolution failed for team: ${rawPlayerTeam}`);
                return false;
            }
            
            return playerCanonicalId === teamCanonicalId;
        });

        const userStats = userStandingsMap.get(t.id) || { wins: 0, losses: 0 };
        
        return {
            id: teamCanonicalId !== 'unknown' ? teamCanonicalId : t.id, 
            name: t.name,
            city: t.city,
            logo: t.logo_url || `https://a.espncdn.com/i/teamlogos/nba/500/${teamCanonicalId}.png`,
            conference: t.conference,
            division: t.division,
            wins: userStats.wins,
            losses: userStats.losses,
            budget: 150,
            salaryCap: 140,
            luxuryTaxLine: 170,
            roster: teamPlayers.map(p => mapDatabasePlayerToRuntimePlayer(p, teamCanonicalId))
        };
    });

    const mappedSchedule = mapDatabaseScheduleToRuntimeGame(rawSchedule);

    // [Debug] Log Mapping Results
    const emptyTeams = mappedTeams.filter(t => t.roster.length === 0);
    if (emptyTeams.length > 0) {
        console.warn(`[CRITICAL] ${emptyTeams.length} teams have EMPTY rosters!`, emptyTeams.map(t => t.name));
    } else {
        console.log(`[Fetch] Mapping Complete. All teams have players.`);
    }

    return {
        teams: mappedTeams,
        schedule: mappedSchedule
    };
};

export const runServerSideSim = async (params: {
    userId: string;
    teamId: string;
    tactics: any;
    date: string;
}) => {
    const { data, error } = await supabase.functions.invoke('simulate-game', {
        body: params
    });
    if (error) throw error;
    return data;
};

export const useMonthlySchedule = (userId: string | undefined, year: number, month: number) => {
    return useQuery({
        queryKey: ['schedule', userId, year, month],
        queryFn: async () => {
            if (!userId) return [];
            try {
                const { data, error } = await supabase
                    .from('game_results')
                    .select('*')
                    .eq('user_id', userId)
                    .gte('game_date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
                    .lte('game_date', `${year}-${String(month + 1).padStart(2, '0')}-31`);
                if (error) throw error;
                return data || [];
            } catch (e) {
                return [];
            }
        },
        enabled: !!userId,
    });
};

export const saveUserTransaction = async (userId: string, transaction: Transaction) => {
    try {
        const { error } = await supabase
            .from('user_transactions')
            .insert({
                user_id: userId,
                ...transaction
            });
        if (error) console.error("Transaction save failed:", error.message);
    } catch (e) {}
};

export const useScoutingReport = (prospect: Player | null) => {
    return useQuery({
        queryKey: ['scoutingReport', prospect?.id],
        queryFn: () => generateScoutingReport(prospect!),
        enabled: !!prospect,
        staleTime: Infinity,
    });
};
