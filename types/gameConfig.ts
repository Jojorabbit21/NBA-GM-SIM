import type { ArchetypeType } from './archetype';
import type { ArchetypeModuleScores } from './archetype';

// Gate conditions per archetype — all specified modules must meet minimum score
export type ArchetypeGate = Partial<Record<keyof ArchetypeModuleScores, number>>;

// Full gate config: only archetypes that need a gate are listed (others = no gate)
export type ArchetypeGateConfig = Partial<Record<ArchetypeType, ArchetypeGate>>;

// Weight config per archetype — module → weight (should sum to ~1.0)
export type ArchetypeWeights = Partial<Record<keyof ArchetypeModuleScores, number>>;
export type ArchetypeWeightConfig = Partial<Record<ArchetypeType, ArchetypeWeights>>;

// Label overrides per archetype key (UPPER_SNAKE_CASE → display string)
export type ArchetypeLabelConfig = Record<string, string>;

// Position eligibility per archetype key (UPPER_SNAKE_CASE → position array)
export type ArchetypePositionConfig = Record<string, string[]>;

// ── Tag config ────────────────────────────────────────────────

// A single condition clause (module score or raw player rating)
export interface TagClause {
    fieldType: 'module' | 'rating'; // module = ArchetypeModuleScores, rating = Player field
    field: string;
    op: '>=' | '<=';
    value: number;
}

// Condition expression:
//   single   → one clause
//   all_of   → all clauses must pass (AND)
//   or_first → any of the first N clauses pass AND all remaining clauses pass
export type TagConditionExpr =
    | { type: 'single';   clause: TagClause }
    | { type: 'all_of';   clauses: TagClause[] }
    | { type: 'or_first'; orClauses: TagClause[]; andClauses: TagClause[] };

export interface TagConfigEntry {
    id: string;
    label: string;
    color: string;
    condition: TagConditionExpr;
    ovrBonus: number;                          // applied in calcTagBonus; negative = penalty
    posOvrBonus?: Partial<Record<string, number>>; // position-specific override
}

export type TagConfigList = TagConfigEntry[];

export interface GameConfig {
    archetype_gates: ArchetypeGateConfig;
    archetype_weights: ArchetypeWeightConfig;
    archetype_labels: ArchetypeLabelConfig;
    archetype_tags: TagConfigList;
}
