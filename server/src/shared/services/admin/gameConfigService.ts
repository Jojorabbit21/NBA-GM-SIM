
/**
 * gameConfigService.ts — Phase 7: 실제 Supabase archetypes 테이블 연동.
 * 원본: services/admin/gameConfigService.ts
 *
 * ovrEngine.ts의 calcArchetypeScore/calcTagBonus 등은 "DB 설정이 있으면 그걸 쓰고
 * 없으면 하드코딩 폴백" 구조를 그대로 유지한 채(Phase 2에서 이미 포팅됨) 이 파일만
 * 교체한다 — 계산 로직은 다시 손대지 않는다.
 *
 * 관리자 저장 함수(saveArchetypeConfig/saveTagConfig)는 서버가 설정을 쓸 일이 없어
 * (읽기 전용) 이식 대상에서 제외했다. gates(ArchetypeGateConfig)는 ovrEngine.ts가
 * 실제로 참조하지 않는 필드로 확인되어(다른 아키타입 배정 시스템용) 캐시 구조체엔
 * 유지하되 별도 getter는 만들지 않았다.
 */

import { supabase } from '../../../supabaseAdmin.ts';
import type {
    ArchetypeGateConfig,
    ArchetypeWeightConfig,
    ArchetypeLabelConfig,
    ArchetypePositionConfig,
    TagConfigList,
} from '../../types/gameConfig.ts';

export interface ArchetypeConfig {
    gates:     ArchetypeGateConfig;
    weights:   ArchetypeWeightConfig;
    labels:    ArchetypeLabelConfig;
    positions: ArchetypePositionConfig;
}

const EMPTY_ARCHETYPE_CONFIG: ArchetypeConfig = { gates: {}, weights: {}, labels: {}, positions: {} };

let archetypeCache: ArchetypeConfig | null = null;
let tagCache: TagConfigList | null = null;
// [2026-09-07] client 미러(services/admin/gameConfigService.ts)와 동일한 수정 — 캐시 값만
// 체크하고 진행 중인 요청은 체크하지 않아 동시 호출(리그 생성 이벤트가 겹치는 경우 등)이
// 각자 네트워크를 태울 수 있었다. 진행 중인 Promise를 캐시해 공유하도록 수정.
let archetypeConfigPromise: Promise<ArchetypeConfig> | null = null;
let tagConfigPromise: Promise<TagConfigList> | null = null;

// ── Archetype config (gates / weights / labels / positions) ───

export async function fetchArchetypeConfig(): Promise<ArchetypeConfig> {
    if (archetypeCache) return archetypeCache;
    if (archetypeConfigPromise) return archetypeConfigPromise;
    archetypeConfigPromise = (async () => {
        const { data, error } = await supabase
            .from('archetypes')
            .select('value')
            .eq('key', 'archetypes')
            .maybeSingle();
        if (error) {
            if (error.code === 'PGRST116') { archetypeCache = { ...EMPTY_ARCHETYPE_CONFIG }; return archetypeCache; }
            throw error;
        }
        archetypeCache = { ...EMPTY_ARCHETYPE_CONFIG, ...(data?.value ?? {}) } as ArchetypeConfig;
        return archetypeCache;
    })();
    try {
        return await archetypeConfigPromise;
    } finally {
        archetypeConfigPromise = null;
    }
}

// ── Tag config ────────────────────────────────────────────────

export async function fetchTagConfig(): Promise<TagConfigList> {
    if (tagCache) return tagCache;
    if (tagConfigPromise) return tagConfigPromise;
    tagConfigPromise = (async () => {
        const { data, error } = await supabase
            .from('archetypes')
            .select('value')
            .eq('key', 'tags')
            .maybeSingle();
        if (error) {
            if (error.code === 'PGRST116') { tagCache = []; return tagCache; }
            throw error;
        }
        tagCache = (data?.value ?? []) as TagConfigList;
        return tagCache;
    })();
    try {
        return await tagConfigPromise;
    } finally {
        tagConfigPromise = null;
    }
}

// ── Sync getters (엔진에서 preload 후 동기 참조) ──────────────

export function getWeightConfigSync():   ArchetypeWeightConfig   | null { return archetypeCache?.weights   ?? null; }
export function getPositionConfigSync(): ArchetypePositionConfig | null { return archetypeCache?.positions ?? null; }
export function getLabelConfigSync():    ArchetypeLabelConfig    | null { return archetypeCache?.labels    ?? null; }
export function getTagConfigSync():      TagConfigList           | null { return tagCache; }

// ── Preload (서버 부팅 시 1회 + 리그 생성 시점 강제 refetch) ───

export async function preloadGameConfig(): Promise<void> {
    await Promise.all([
        fetchArchetypeConfig(),
        fetchTagConfig(),
    ]);
}

// ── Cache invalidation (강제 refetch 전 호출) ──────────────────

export function invalidateArchetypeCache(): void { archetypeCache = null; }
export function invalidateTagCache():       void { tagCache = null; }

/** 리그 생성(드래프트 완료) 시점에 그 순간의 최신 DB 설정을 강제로 다시 받아온다. */
export async function refetchGameConfig(): Promise<void> {
    invalidateArchetypeCache();
    invalidateTagCache();
    await preloadGameConfig();
}
