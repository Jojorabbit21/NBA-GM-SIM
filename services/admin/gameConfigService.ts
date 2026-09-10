import { supabase } from '../supabaseClient';
import type { ArchetypeGateConfig, ArchetypeWeightConfig, ArchetypeLabelConfig, ArchetypePositionConfig, TagConfigList } from '../../types/gameConfig';

export interface ArchetypeConfig {
    gates:     ArchetypeGateConfig;
    weights:   ArchetypeWeightConfig;
    labels:    ArchetypeLabelConfig;
    positions: ArchetypePositionConfig;
}

const EMPTY_ARCHETYPE_CONFIG: ArchetypeConfig = { gates: {}, weights: {}, labels: {}, positions: {} };

let archetypeCache: ArchetypeConfig | null = null;
let tagCache: TagConfigList | null = null;
// [2026-09-07] 캐시 값(archetypeCache/tagCache)만 체크하고 "진행 중인 요청"은 체크하지
// 않아서, 첫 요청의 await가 끝나기 전에 두 번째 호출이 들어오면(예: 여러 화면이 동시에
// preloadGameConfig를 부르는 경우, 또는 React StrictMode의 effect 이중 실행) 캐시가 아직
// 비어있어 네트워크를 한 번 더 태웠다(실측으로 발견) — 진행 중인 Promise 자체를 캐시해
// 동시 호출이 같은 요청을 공유하도록 수정.
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

export async function saveArchetypeConfig(config: ArchetypeConfig): Promise<void> {
    const { error } = await supabase
        .from('archetypes')
        .upsert({ key: 'archetypes', value: config }, { onConflict: 'key' });
    if (error) throw error;
    archetypeCache = config;
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

export async function saveTagConfig(tags: TagConfigList): Promise<void> {
    const { error } = await supabase
        .from('archetypes')
        .upsert({ key: 'tags', value: tags }, { onConflict: 'key' });
    if (error) throw error;
    tagCache = tags;
}

// ── Individual fetch helpers (하위 호환) ──────────────────────

export async function fetchArchetypeGates():     Promise<ArchetypeGateConfig>     { return (await fetchArchetypeConfig()).gates; }
export async function fetchArchetypeWeights():   Promise<ArchetypeWeightConfig>   { return (await fetchArchetypeConfig()).weights; }
export async function fetchArchetypeLabels():    Promise<ArchetypeLabelConfig>    { return (await fetchArchetypeConfig()).labels; }
export async function fetchArchetypePositions(): Promise<ArchetypePositionConfig> { return (await fetchArchetypeConfig()).positions; }
export async function fetchArchetypeTags():      Promise<TagConfigList>           { return fetchTagConfig(); }

// ── Sync getters (엔진에서 preload 후 동기 참조) ──────────────

export function getWeightConfigSync():   ArchetypeWeightConfig   | null { return archetypeCache?.weights   ?? null; }
export function getPositionConfigSync(): ArchetypePositionConfig | null { return archetypeCache?.positions ?? null; }
export function getLabelConfigSync():    ArchetypeLabelConfig    | null { return archetypeCache?.labels    ?? null; }
export function getTagConfigSync():      TagConfigList           | null { return tagCache; }

// ── Preload (앱/시뮬 초기화 시 1회 호출) ─────────────────────

export async function preloadGameConfig(): Promise<void> {
    await Promise.all([
        fetchArchetypeConfig(),
        fetchTagConfig(),
    ]);
}

// ── Cache invalidation ────────────────────────────────────────

export function invalidateArchetypeCache(): void { archetypeCache = null; }
export function invalidateTagCache():       void { tagCache = null; }

// 하위 호환 alias
export const invalidateConfigCache   = () => { archetypeCache = null; tagCache = null; };
export const invalidateGateCache     = invalidateArchetypeCache;
export const invalidateWeightCache   = invalidateArchetypeCache;
export const invalidateLabelCache    = invalidateArchetypeCache;
export const invalidatePositionCache = invalidateArchetypeCache;
