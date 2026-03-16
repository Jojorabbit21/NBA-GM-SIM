/**
 * 생성된 신인 선수 타입 정의
 *
 * rookieGenerator로 생성된 선수의 DB 행, FA 풀 상태 등.
 * meta_players와 동일한 base_attributes JSONB 형식을 사용하여
 * 기존 mapRawPlayerToRuntimePlayer() 파이프라인과 호환.
 */

/** 생성 선수 상태 */
export type GeneratedPlayerStatus = 'fa' | 'drafted' | 'retired';

/** user_generated_players 테이블 행 */
export interface GeneratedPlayerRow {
    id: string;                           // 'gen_{uuid}'
    user_id: string;
    season_number: number;                // 드래프트 클래스 시즌
    draft_pick: number | null;            // 1~30 (null = 미드래프트)
    draft_team_id: string | null;         // 드래프트한 팀 (null = 미드래프트)
    status: GeneratedPlayerStatus;        // 'drafted' | 'fa' | 'retired'
    base_attributes: Record<string, any>; // meta_players와 동일 JSONB 형식
    age_at_draft: number;                 // 생성 시 나이 (불변)
    created_at?: string;
    updated_at?: string;
}

/** saves.league_fa_pool JSONB — 현재 FA에 있는 생성 선수 ID 목록 */
export interface LeagueFAPool {
    generatedIds: string[];
}
