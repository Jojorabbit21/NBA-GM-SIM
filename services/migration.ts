
import { supabase } from './supabaseClient';
import { 
    parseCSVToObjects, 
    resolveTeamId 
} from '../utils/constants';

type ProgressCallback = (message: string, percent: number) => void;

const DIVISION_FILES = [
    '/roster_atlantic.csv', 
    '/roster_central.csv', 
    '/roster_southeast.csv', 
    '/roster_northwest.csv', 
    '/roster_pacific.csv', 
    '/roster_southwest.csv'
];

// Helper to map CSV keys to DB/Attribute keys
const mapCsvRowToPlayerAttributes = (row: any) => {
    return {
        // Core
        ins: Number(row.INS || 70),
        out: Number(row.OUT || 70),
        plm: Number(row.PLM || 70),
        def: Number(row.DEF || 70),
        reb: Number(row.REB || 70),
        ath: Number(row.ATH || 70),
        
        // Shooting
        closeShot: Number(row.CLOSE || 70),
        midRange: Number(row.MID || 70),
        threeCorner: Number(row['3C'] || 70),
        three45: Number(row['3_45'] || 70),
        threeTop: Number(row['3T'] || 70),
        ft: Number(row.FT || 70),
        shotIq: Number(row.SIQ || 70),
        offConsist: Number(row.OCON || 70),
        
        // Inside
        layup: Number(row.LAY || 70),
        dunk: Number(row.DNK || 70),
        postPlay: Number(row.POST || 70),
        drawFoul: Number(row.DRAW || 70),
        hands: Number(row.HANDS || 70),
        
        // Playmaking
        passAcc: Number(row.PACC || 70),
        handling: Number(row.HANDL || 70),
        spdBall: Number(row.SPWB || 70),
        passIq: Number(row.PIQ || 70),
        passVision: Number(row.PVIS || 70),
        
        // Defense
        intDef: Number(row.IDEF || 70),
        perDef: Number(row.PDEF || 70),
        steal: Number(row.STL || 70),
        blk: Number(row.BLK || 70),
        helpDefIq: Number(row.HDEF || 70),
        passPerc: Number(row.PPER || 70),
        defConsist: Number(row.DCON || 70),
        
        // Physical
        speed: Number(row.SPD || 70),
        agility: Number(row.AGI || 70),
        strength: Number(row.STR || 70),
        vertical: Number(row.VERT || 70),
        stamina: Number(row.STA || 70),
        hustle: Number(row.HUS || 70),
        durability: Number(row.DUR || 70),
        
        // Rebound
        offReb: Number(row.OREB || 70),
        defReb: Number(row.DREB || 70),
        
        // Misc
        potential: Number(row.POT || 70),
        intangibles: Number(row.Intangibles || 70),
    };
};

/**
 * DB와 CSV를 대조하여 누락된 선수 명단을 반환합니다.
 */
export async function checkMissingPlayers(onProgress?: ProgressCallback) {
    onProgress?.("로스터 데이터 스캔 중...", 10);

    // 1. Fetch All CSV Data
    let allCsvPlayers: any[] = [];
    for (const file of DIVISION_FILES) {
        try {
            const response = await fetch(file);
            if (response.ok) {
                const text = await response.text();
                const rows = parseCSVToObjects(text);
                allCsvPlayers = [...allCsvPlayers, ...rows];
            }
        } catch (e) {
            console.error(`Failed to load ${file}`, e);
        }
    }
    
    onProgress?.(`CSV 데이터 로드 완료 (총 ${allCsvPlayers.length}명)`, 30);

    // 2. Fetch All DB Players (ID & Name only)
    const { data: dbPlayers, error } = await supabase
        .from('meta_players')
        .select('name, team_id');
        
    if (error) throw error;

    const dbPlayerSet = new Set(dbPlayers?.map(p => `${resolveTeamId(p.team_id)}_${p.name.toLowerCase().trim()}`));
    
    // 3. Find Missing
    const missingPlayers = allCsvPlayers.filter(row => {
        const teamId = resolveTeamId(row.Team);
        const key = `${teamId}_${row.Name.toLowerCase().trim()}`;
        return !dbPlayerSet.has(key);
    });

    onProgress?.(`분석 완료: ${missingPlayers.length}명의 선수가 누락됨`, 100);
    return missingPlayers;
}

/**
 * 누락된 선수들을 DB에 일괄 삽입합니다.
 */
export async function seedMissingPlayers(missingPlayers: any[], onProgress?: ProgressCallback) {
    if (missingPlayers.length === 0) return { success: true, message: "추가할 선수가 없습니다." };

    onProgress?.("데이터 변환 중...", 10);

    const payload = missingPlayers.map(row => {
        const teamId = resolveTeamId(row.Team);
        const attributes = mapCsvRowToPlayerAttributes(row);
        
        return {
            team_id: teamId,
            name: row.Name,
            position: row.Position,
            age: Number(row.Age),
            height: Number(row.Height),
            weight: Number(row.Weight),
            salary: Number(row.Salary),
            contract_years: Number(row.ContractYears),
            base_attributes: attributes // Store detailed stats in JSONB column
        };
    });

    onProgress?.("DB에 데이터 적재 중...", 50);

    // Batch Insert (Supabase limit is usually handy, splitting into chunks of 50)
    const chunkSize = 50;
    for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error } = await supabase.from('meta_players').insert(chunk);
        if (error) {
            console.error("Insert Error:", error);
            throw error;
        }
        const percent = 50 + Math.round(((i + chunk.length) / payload.length) * 50);
        onProgress?.(`업로드 중... (${i + chunk.length}/${payload.length})`, percent);
    }

    return { success: true, message: `${payload.length}명의 선수가 성공적으로 복구되었습니다.` };
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
        await seedMetaSchedule(onProgress);
        
        onProgress?.("스케줄 데이터 업데이트 완료!", 100);
        return { success: true, message: "스케줄 데이터 적재가 완료되었습니다!" };
    } catch (e: any) {
        console.error("Migration Failed:", e);
        return { success: false, message: e.message || "스케줄 초기화 실패" };
    }
}
