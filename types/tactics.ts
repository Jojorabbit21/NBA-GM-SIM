
export type OffenseTactic = 'Balance' | 'PaceAndSpace' | 'PerimeterFocus' | 'PostFocus' | 'Grind' | 'SevenSeconds';
export type DefenseTactic = 'ManToManPerimeter' | 'ZoneDefense' | 'AceStopper';

export interface TacticalSliders {
    pace: number;
    offReb: number;
    defIntensity: number;
    defReb: number;
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
    offenseTactics: OffenseTactic[];
    defenseTactics: DefenseTactic[];
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
