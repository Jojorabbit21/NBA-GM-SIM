
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
    tendencies?: HiddenTendencies;
}

export interface RosterUpdate {
    condition?: number;
    health?: string;
    injuryType?: string;
    returnDate?: string;
}
