
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

    // D. Defense
    defIntensity: number;  // 1-10: Pressure on ball & passing lanes
    helpDef: number;       // 1-10: Rotation speed & Paint packing
    switchFreq: number;    // 1-10: Frequency of switching screens
    defReb: number;        // 1-10: Defensive rebound commitment (box-out vs fast break)
    zoneFreq: number;      // 1-10: Frequency of using Zone logic
    pnrDefense: number;    // 0-2: PnR coverage (0=Drop, 1=Hedge, 2=Blitz)

    // Additional
    fullCourtPress: number; // 1-10
    zoneUsage: number;      // 1-10: Zone execution quality (rotation speed & communication)
}

export interface DepthChart {
    PG: (string | null)[];
    SG: (string | null)[];
    SF: (string | null)[];
    PF: (string | null)[];
    C: (string | null)[];
}

export interface GameTactics {
    sliders: TacticalSliders;
    starters: { PG: string; SG: string; SF: string; PF: string; C: string };
    rotationMap: Record<string, boolean[]>;
    stopperId?: string;
    minutesLimits: Record<string, number>;
    depthChart?: DepthChart;
}

export interface TacticalSnapshot {
    offense?: string;  // Kept as string for DB compat (no longer populated)
    defense?: string;  // Kept as string for DB compat (no longer populated)
    stopperId?: string;
    pace?: number;
    sliders?: TacticalSliders;
}

export interface TacticPreset {
    slot: number;
    name: string;
    data: Partial<GameTactics>;
}
