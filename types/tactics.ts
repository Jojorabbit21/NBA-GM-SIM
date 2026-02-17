
export type OffenseTactic = 'Balance' | 'PaceAndSpace' | 'PerimeterFocus' | 'PostFocus' | 'Grind' | 'SevenSeconds' | 'Custom';
export type DefenseTactic = 'ManToManPerimeter' | 'ZoneDefense' | 'AceStopper' | 'Custom';

export interface TacticalSliders {
    // A. Offense Style
    pace: number;          // 1-10: Game speed & transition frequency
    ballMovement: number;  // 1-10: Pass vs Iso tendency
    offReb: number;        // 1-10: Crash glass vs Get back

    // B. Play Types (Weights 1-10)
    play_pnr: number;      // Pick & Roll frequency
    play_post: number;     // Post-up frequency
    play_iso: number;      // Isolation frequency
    play_cns: number;      // Catch & Shoot frequency
    play_drive: number;    // Drive/Cut frequency

    // C. Shot Tendency (Weights 1-10)
    shot_3pt: number;      // Preference for 3PT shots
    shot_mid: number;      // Preference for Mid-range shots
    shot_rim: number;      // Preference for Rim attacks
    shot_pullup: number;   // Preference for Pull-up jumpers vs Set shots

    // D. Defense
    defIntensity: number;  // 1-10: Pressure on ball & passing lanes
    helpDef: number;       // 1-10: Rotation speed & Paint packing
    switchFreq: number;    // 1-10: Frequency of switching screens
    defReb: number;        // 1-10: Box out focus vs Leak out
    zoneFreq: number;      // 1-10: Frequency of using Zone logic
    
    // [New] Added missing properties
    fullCourtPress: number; // 1-10
    zoneUsage: number;      // 1-10 (Redundant with zoneFreq? code seems to use zoneUsage in some places and zoneFreq in others. Unifying to zoneUsage in logic, keeping types compatible)
}

export interface DepthChart {
    PG: (string | null)[];
    SG: (string | null)[];
    SF: (string | null)[];
    PF: (string | null)[];
    C: (string | null)[];
}

export interface GameTactics {
    offenseTactics: OffenseTactic[]; // Changed from offensePreset
    defenseTactics: DefenseTactic[]; // Changed from defensePreset
    sliders: TacticalSliders;
    starters: { PG: string; SG: string; SF: string; PF: string; C: string };
    rotationMap: Record<string, boolean[]>; 
    stopperId?: string;
    minutesLimits: Record<string, number>;
    depthChart?: DepthChart; 
}

export interface TacticalSnapshot {
    offense?: OffenseTactic;
    defense?: DefenseTactic;
    stopperId?: string;
    pace?: number;
    sliders?: TacticalSliders;
}

export interface TacticPreset {
    slot: number;
    name: string;
    data: Partial<GameTactics>;
}
