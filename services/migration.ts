
import { supabase } from './supabaseClient';
import { 
    parseCSVToObjects, 
    resolveTeamId 
} from '../utils/constants';

type ProgressCallback = (message: string, percent: number) => void;

/**
 * 1. Meta Teams 초기화 (Skipped)
 */
export async function seedMetaTeams(onProgress?: ProgressCallback) {
    // Skipped as per user request
    console.log("Skipping Meta Teams Migration");
}

/**
 * 2. Meta Players 초기화 (Skipped)
 */
export async function seedMetaPlayers(onProgress?: ProgressCallback) {
    // Skipped as per user request
    console.log("Skipping Meta Players Migration");
}

/**
 * 3. Meta Schedule 초기화 (CSV 기반, 중복 제거)
 * Teams/Players가 이미 존재한다고 가정하고 스케줄만 적재합니다.
 */
export async function seedMetaSchedule(onProgress?: ProgressCallback) {
    onProgress?.("스케줄 데이터 CSV 다운로드 중...", 10);

    const response = await fetch('/schedule.csv');
    if (!response.ok) throw new Error("Failed to fetch schedule.csv");
    const csvText = await response.text();
    const rawSchedule = parseCSVToObjects(csvText);
    
    // Deduplication Logic
    // CSV contains 2460 rows (Home & Away perspective for each game).
    // We want 1230 unique games.
    const uniqueGames = new Map<string, any>();

    onProgress?.("스케줄 데이터 정제 중...", 20);

    rawSchedule.forEach(row => {
        let dateStr = row.date || row.Date;
        if (dateStr && dateStr.includes(' ')) {
             try {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                    dateStr = d.toISOString().split('T')[0];
                }
            } catch(e) {}
        }
        
        const site = row.site || row.Site;
        const teamName = row.team || row.Team;
        const oppName = row.opponent || row.Opponent;
        
        // Normalize IDs
        const tId = resolveTeamId(teamName);
        const oppId = resolveTeamId(oppName);
        
        // Determine Home/Away based on 'site'
        // If site is '홈' or 'Home', then team is Home, opp is Away.
        // If site is '어웨이' or 'Away', then team is Away, opp is Home.
        const isHome = site === '홈' || site === 'Home';
        
        const homeTeamId = isHome ? tId : oppId;
        const awayTeamId = isHome ? oppId : tId;
        
        // Generate Unique Game ID
        // Format: g_HOME_AWAY_DATE
        const gameId = `g_${homeTeamId}_${awayTeamId}_${dateStr}`;
        
        if (!uniqueGames.has(gameId) && homeTeamId !== 'unknown' && awayTeamId !== 'unknown') {
            uniqueGames.set(gameId, {
                id: gameId,
                game_date: dateStr,
                home_team_id: homeTeamId,
                away_team_id: awayTeamId,
                home_score: null,
                away_score: null,
                played: false
            });
        }
    });

    const gamesPayload = Array.from(uniqueGames.values());
    const totalGames = gamesPayload.length;
    
    onProgress?.(`스케줄 데이터 정제 완료 (유니크 ${totalGames}경기)`, 30);

    // Batch Insert
    const chunkSize = 100;
    let processed = 0;

    for (let i = 0; i < gamesPayload.length; i += chunkSize) {
        const chunk = gamesPayload.slice(i, i + chunkSize);
        const { error } = await supabase
            .from('meta_schedule')
            .upsert(chunk, { onConflict: 'id' });
        
        if (error) {
            console.error("Error inserting schedule chunk:", error);
            throw error;
        }

        processed += chunk.length;
        // 진행률 계산: 30% ~ 100% 구간 매핑
        const percent = 30 + Math.round((processed / totalGames) * 70);
        onProgress?.(`스케줄 DB 적재 중... (${processed}/${totalGames})`, percent);
    }
}

/**
 * Main Migration Runner
 */
export async function runFullMigration(onProgress?: ProgressCallback) {
    try {
        // [Modified] Skip Teams & Players, only run Schedule
        // await seedMetaTeams(onProgress);
        // await seedMetaPlayers(onProgress);
        await seedMetaSchedule(onProgress);
        
        onProgress?.("스케줄 데이터 업데이트 완료!", 100);
        return { success: true, message: "스케줄 데이터 적재가 완료되었습니다!" };
    } catch (e: any) {
        console.error("Migration Failed:", e);
        return { success: false, message: e.message || "스케줄 초기화 실패" };
    }
}
