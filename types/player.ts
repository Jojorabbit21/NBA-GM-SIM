
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
    techFouls: number;
    flagrantFouls: number;
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

// [New] Save-seeded hidden tendencies (세이브별 랜덤 배정, 매 플레이스루 고유)
export interface SaveTendencies {
    // 멘탈 (6)
    clutchGene: number;              // -1.0~+1.0 클러치 히트레이트 ±3%
    consistency: number;             // 0.0~1.0   콜드스트릭 회복률 0.7x~1.3x
    confidenceSensitivity: number;   // 0.3~1.7   핫/콜드 진폭 배율
    composure: number;               // -1.0~+1.0 턴오버 확률 ±1%
    motorIntensity: number;          // 0.5~1.5   리바운드 확률 ±15%
    focusDrift: number;              // 0.0~1.0   피로 시 히트레이트 추가 감소

    // 플레이스타일 (5)
    shotDiscipline: number;          // -1.0~+1.0 히트레이트 ±1.5%
    defensiveMotor: number;          // -1.0~+1.0 수비 레이팅 ±3pt
    ballDominance: number;           // 0.5~1.5   액터 선택 가중치 배율
    foulProneness: number;           // -1.0~+1.0 파울 확률 ±2%
    playStyle: number;               // -1.0(패스)~+1.0(슛) 플레이 성향

    // 성격 (2)
    temperament: number;             // -1.0(냉정)~+1.0(다혈질) 테크니컬 확률
    ego: number;                     // -1.0(겸손)~+1.0(자존심) 옵션 순위별 퍼포먼스
}

// [New] Interface for saving player state (Condition + Health)
export interface SavedPlayerState {
    condition: number;
    health?: 'Healthy' | 'Injured' | 'Day-to-Day';
    injuryType?: string;
    returnDate?: string;
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
    // 커스텀 모드용 전성기 능력치 오버라이드 (base_attributes.custom_overrides에서 로드)
    customOverrides?: Partial<Pick<Player,
        'closeShot' | 'midRange' | 'threeCorner' | 'three45' | 'threeTop' |
        'ft' | 'shotIq' | 'offConsist' | 'layup' | 'dunk' | 'postPlay' |
        'drawFoul' | 'hands' | 'passAcc' | 'handling' | 'spdBall' |
        'passIq' | 'passVision' | 'intDef' | 'perDef' | 'steal' | 'blk' |
        'helpDefIq' | 'passPerc' | 'defConsist' | 'offReb' | 'defReb' |
        'speed' | 'agility' | 'strength' | 'vertical' | 'stamina' |
        'hustle' | 'durability' | 'intangibles'
    >>;
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
