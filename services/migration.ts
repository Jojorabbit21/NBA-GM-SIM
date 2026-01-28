
import { supabase } from './supabaseClient';
import { 
    INITIAL_TEAMS_DATA, 
    getTeamLogoUrl, 
    TEAM_OWNERS, 
    parseCSVToObjects, 
    resolveTeamId 
} from '../utils/constants';

type ProgressCallback = (message: string, percent: number) => void;

/**
 * 1. Meta Teams 초기화
 */
export async function seedMetaTeams(onProgress?: ProgressCallback) {
    onProgress?.("팀 데이터 초기화 중...", 0);
    
    const teamsPayload = INITIAL_TEAMS_DATA.map(t => ({
        id: t.id,
        name: t.name,
        city: t.city,
        conference: t.conference,
        division: t.division,
        logo_url: getTeamLogoUrl(t.id),
        base_attributes: {
            owner: TEAM_OWNERS[t.id] || 'Unknown',
            founded: 1946 
        }
    }));

    const { error } = await supabase
        .from('meta_teams')
        .upsert(teamsPayload, { onConflict: 'id' });

    if (error) throw error;
    onProgress?.(`✅ 30개 팀 데이터 적재 완료`, 10);
}

/**
 * 2. Meta Players 초기화 (CSV 기반)
 */
export async function seedMetaPlayers(onProgress?: ProgressCallback) {
    onProgress?.("선수 데이터 CSV 다운로드 중...", 15);

    // 1. Fetch CSV
    const response = await fetch('/players.csv');
    if (!response.ok) throw new Error("Failed to fetch players.csv");
    const csvText = await response.text();
    const players = parseCSVToObjects(csvText);
    const totalPlayers = players.length;

    onProgress?.(`선수 데이터 변환 중... (0/${totalPlayers})`, 20);

    // 2. Transform Data
    const playersPayload = players.map((p: any) => {
        const teamName = p.Team || p.team;
        const teamId = resolveTeamId(teamName);
        const { id, ...attributes } = p;

        return {
            base_team_id: teamId !== 'unknown' ? teamId : null,
            name: p.Name || p.name,
            position: p.Position || p.position,
            height: parseInt(p.Height || p.height || '200'),
            weight: parseInt(p.Weight || p.weight || '100'),
            draft_year: 2020,
            base_attributes: attributes
        };
    });

    // 3. Batch Insert
    const chunkSize = 50; // 청크 사이즈를 줄여서 업데이트 빈도를 높임
    let processed = 0;

    for (let i = 0; i < playersPayload.length; i += chunkSize) {
        const chunk = playersPayload.slice(i, i + chunkSize);
        const { error } = await supabase
            .from('meta_players')
            .upsert(chunk, { onConflict: 'name' }); 
        
        if (error) {
            console.error("Error inserting players chunk:", error);
            throw error;
        }

        processed += chunk.length;
        // 진행률 계산: 20% ~ 100% 구간 매핑
        const percent = 20 + Math.round((processed / totalPlayers) * 80);
        onProgress?.(`선수 데이터 DB 적재 중... (${processed}/${totalPlayers})`, percent);
    }
}

/**
 * Main Migration Runner
 */
export async function runFullMigration(onProgress?: ProgressCallback) {
    try {
        await seedMetaTeams(onProgress);
        await seedMetaPlayers(onProgress);
        onProgress?.("모든 데이터 초기화 완료!", 100);
        return { success: true, message: "메타 데이터 초기화 완료!" };
    } catch (e: any) {
        console.error("Migration Failed:", e);
        return { success: false, message: e.message || "초기화 실패" };
    }
}
