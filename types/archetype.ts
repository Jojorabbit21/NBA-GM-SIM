
import type { FARole } from './fa';

// ─────────────────────────────────────────────────────────────
// Archetype Type Definitions
// Player identity / playstyle system — separate from PBP engine archetypes
// ─────────────────────────────────────────────────────────────

// 16 archetype types across 3 positional groups
export type ArchetypeType =
    // Guard (PG/SG)
    | 'primary_creator_guard'
    | 'scoring_combo_guard'
    | 'movement_shooter'
    | 'perimeter_3nd'
    // Wing (SG/SF/PF)
    | 'two_way_wing'
    | 'slashing_wing'
    | 'shot_creator_wing'
    | 'connector_forward'
    | 'aerial_wing'
    | 'post_scoring_wing'
    | 'wing_protector'
    // Big (PF/C)
    | 'post_scoring_big'
    | 'rim_runner_big'
    | 'stretch_big'
    | 'rim_protector_anchor'
    | 'playmaking_big';

// 14 trait tags (threshold-based, fast-changing vs slow archetype)
export type TraitTag =
    | 'elite_finisher'
    | 'foul_merchant'
    | 'shotmaker'
    | 'floor_spacer'
    | 'off_ball_mover'
    | 'plus_playmaker'
    | 'poa_stopper'
    | 'team_defender'
    | 'rim_protector'
    | 'glass_cleaner'
    | 'high_motor'
    | 'ironman'
    | 'streaky_scorer'
    | 'reliable_two_way';

// 11 role module scores (computed from raw player attributes)
export interface ArchetypeModuleScores {
    rimFinishing: number;     // 0~100
    postCraft: number;
    spotUpShooting: number;
    shotCreation: number;
    playmaking: number;
    offballAttack: number;    // depends on spotUpShooting
    poaDefense: number;
    teamDefense: number;
    rimProtection: number;
    rebounding: number;
    motorAvailability: number;
}

// Player's current archetype assignment (stored in saves, updated on offseason)
export interface PlayerArchetypeState {
    primary: ArchetypeType;
    secondary?: ArchetypeType;   // assigned if 1st-2nd score diff <= 7
    tags: TraitTag[];
    moduleScores: ArchetypeModuleScores;
    lastUpdated: string;         // season string e.g. '2025-26'
}

// Display metadata for UI rendering
export interface ArchetypeDisplayInfo {
    label: string;        // e.g. "Primary Creator"
    description: string;  // e.g. "공격 설계자형 가드"
    color: string;        // Tailwind color class base e.g. "indigo"
    group: 'guard' | 'wing' | 'big';
}

// FA system bridge: maps archetype → FA role
export const ARCHETYPE_TO_FA_ROLE: Record<ArchetypeType, FARole> = {
    'primary_creator_guard': 'lead_guard',
    'scoring_combo_guard':   'combo_guard',
    'movement_shooter':      '3and_d',
    'perimeter_3nd':         '3and_d',
    'two_way_wing':          '3and_d',
    'slashing_wing':         'shot_creator',
    'shot_creator_wing':     'shot_creator',
    'connector_forward':     'floor_big',
    'aerial_wing':           'shot_creator',
    'post_scoring_wing':     'floor_big',
    'wing_protector':        'rim_big',
    'post_scoring_big':      'floor_big',
    'rim_runner_big':        'rim_big',
    'stretch_big':           'stretch_big',
    'rim_protector_anchor':  'rim_big',
    'playmaking_big':        'floor_big',
};
