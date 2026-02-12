
export interface PlayerStats {
    g: number;
    gs: number;
    mp: number;
    pts: number;
    reb: number;
    offReb: number;
    defReb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
    pf: number;
    fgm: number;
    fga: number;
    p3m: number;
    p3a: number;
    ftm: number;
    fta: number;
    rimM: number;
    rimA: number;
    midM: number;
    midA: number;
    plusMinus: number;
    [key: string]: number; // for zones
}

export interface ShotZones {
    ra: number;  // Restricted Area
    itp: number; // In The Paint (Non-RA)
    mid: number; // Mid-Range
    cnr: number; // Corner 3
    p45: number; // 45 Degree 3 (Wing)
    atb: number; // Above The Break (Top)
}

export interface PlayerTendencies {
    lateral_bias: number; // 0: Strong Left, 1: Left, 2: Right, 3: Strong Right
    zones: ShotZones;
    touch?: number; // Optional
    foul?: number;  // Optional
}

export interface HiddenTendencies {
    hand: 'Right' | 'Left';
    lateralBias: number;
}

export interface Player {
    id: string;
    name: string;
    position: string;
    age: number;
    height: number;
    weight: number;
    salary: number;
    contractYears: number;
    ovr: number;
    potential: number;
    revealedPotential: number;
    health: 'Healthy' | 'Injured' | 'Day-to-Day';
    injuryType?: string;
    returnDate?: string;
    condition?: number;
    conditionDelta?: number; // [New] Tracks daily change (e.g., +15, -10)
    ins: number;
    out: number;
    plm: number;
    def: number;
    reb: number;
    ath: number;
    closeShot: number;
    midRange: number;
    threeCorner: number;
    three45: number;
    threeTop: number;
    ft: number;
    shotIq: number;
    offConsist: number;
    layup: number;
    dunk: number;
    postPlay: number;
    drawFoul: number;
    hands: number;
    passAcc: number;
    handling: number;
    spdBall: number;
    passIq: number;
    passVision: number;
    intDef: number;
    perDef: number;
    steal: number;
    blk: number;
    helpDefIq: number;
    passPerc: number;
    defConsist: number;
    offReb: number;
    defReb: number;
    speed: number;
    agility: number;
    strength: number;
    vertical: number;
    stamina: number;
    hustle: number;
    durability: number;
    intangibles: number;
    stats: PlayerStats;
    playoffStats?: PlayerStats;
    // Runtime hidden tendencies (Calculated or DB)
    tendencies?: PlayerTendencies; // Real DB Data
    hiddenTendencies?: HiddenTendencies; // Fallback Hash Data
}

export interface RosterUpdate {
    condition?: number;
    health?: string;
    injuryType?: string;
    returnDate?: string;
}
