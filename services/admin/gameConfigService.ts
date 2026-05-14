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

// ── Archetype config (gates / weights / labels / positions) ───

export async function fetchArchetypeConfig(): Promise<ArchetypeConfig> {
    if (archetypeCache) return archetypeCache;
    const { data, error } = await supabase
        .from('archetypes')
        .select('value')
        .eq('key', 'archetypes')
        .single();
    if (error) {
        if (error.code === 'PGRST116') { archetypeCache = { ...EMPTY_ARCHETYPE_CONFIG }; return archetypeCache; }
        throw error;
    }
    archetypeCache = { ...EMPTY_ARCHETYPE_CONFIG, ...(data?.value ?? {}) } as ArchetypeConfig;
    return archetypeCache;
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
    const { data, error } = await supabase
        .from('archetypes')
        .select('value')
        .eq('key', 'tags')
        .single();
    if (error) {
        if (error.code === 'PGRST116') { tagCache = []; return tagCache; }
        throw error;
    }
    tagCache = (data?.value ?? []) as TagConfigList;
    return tagCache;
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
