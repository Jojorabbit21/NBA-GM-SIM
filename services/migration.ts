
import { supabase } from './supabaseClient';
import { resolveTeamId } from '../utils/constants';

type ProgressCallback = (message: string, percent: number) => void;

/**
 * 1. Meta Teams 초기화 (Deprecated)
 */
export async function seedMetaTeams(onProgress?: ProgressCallback) {
    console.log("Migration from CSV is deprecated. Please use Database Replication.");
}

/**
 * 2. Meta Players 초기화 (Deprecated)
 */
export async function seedMetaPlayers(onProgress?: ProgressCallback) {
    console.log("Migration from CSV is deprecated. Please use Database Replication.");
}

/**
 * 3. Meta Schedule 초기화 (Deprecated)
 */
export async function seedMetaSchedule(onProgress?: ProgressCallback) {
    console.warn("CSV Schedule Migration is deprecated. The system now runs fully on Supabase.");
    onProgress?.("CSV 마이그레이션 기능은 중단되었습니다.", 100);
}

/**
 * Main Migration Runner
 */
export async function runFullMigration(onProgress?: ProgressCallback) {
    try {
        console.warn("Full Migration from CSV is deprecated.");
        // Existing logic removed to allow safe deletion of CSV files.
        
        onProgress?.("마이그레이션 시스템이 비활성화되었습니다.", 100);
        return { success: true, message: "CSV 의존성 제거됨" };
    } catch (e: any) {
        console.error("Migration Failed:", e);
        return { success: false, message: e.message };
    }
}
