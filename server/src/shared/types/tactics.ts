
export type FoulTroublePolicy = 'auto' | 'ignore';
export type GarbageTimePolicy = 'auto' | 'play' | 'bench';
export type ClutchPolicy = 'auto' | 'must-play' | 'must-bench';

export interface PlayerTacticConfig {
    restThreshold?: number;
    returnThreshold?: number;
    foulPolicy?: FoulTroublePolicy;
    garbagePolicy?: GarbageTimePolicy;
    clutchPolicy?: ClutchPolicy;
}

export interface TacticalSliders {
    // A. Offense Style
    pace: number;
    ballMovement: number;
    offReb: number;

    // B. Coaching Philosophy
    playStyle: number;
    insideOut: number;
    pnrFreq: number;

    // C. Shot Tendency
    shot_3pt: number;
    shot_mid: number;
    shot_rim: number;

    // D. Defense
    defIntensity: number;
    helpDef: number;
    switchFreq: number;
    defReb: number;
    zoneFreq: number;
    pnrDefense: number;

    // Additional
    fullCourtPress: number;
    zoneUsage: number;
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
    playerTactics?: Record<string, PlayerTacticConfig>;
}

export interface TacticalSnapshot {
    offense?: string;
    defense?: string;
    stopperId?: string;
    pace?: number;
    sliders?: TacticalSliders;
}

export interface TacticPreset {
    slot: number;
    name: string;
    data: Partial<GameTactics>;
}
