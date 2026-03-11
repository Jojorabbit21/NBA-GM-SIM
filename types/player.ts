
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

// [New] 능력치 변화 이벤트 (성장/퇴화 시 |fractional| >= 1.0 도달마다 기록)
export interface AttributeChangeEvent {
    date: string;           // 경기 날짜 (예: '2025-12-15')
    attribute: string;      // SkillAttribute key
    delta: number;          // +1 or -1
    oldValue: number;
    newValue: number;
}

// [New] Interface for saving player state (Condition + Health + Growth)
export interface SavedPlayerState {
    condition: number;
    health?: 'Healthy' | 'Injured' | 'Day-to-Day';
    injuryType?: string;
    returnDate?: string;
    // 성장/퇴화 상태 (per-game 미세 누적)
    fractionalGrowth?: Record<string, number>;  // 소수점 누적값 (sparse)
    attrDeltas?: Record<string, number>;         // 시즌 내 정수 변화 합계 (sparse)
    changeLog?: AttributeChangeEvent[];          // 정수 변화 이벤트 로그
    seasonStartAttributes?: Record<string, number>; // 시즌 시작 기준 속성값
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
    manualOvr?: number;
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
    offBallMovement: number;
    intDef: number;
    perDef: number;
    steal: number;
    blk: number;
    helpDefIq: number;
    passPerc: number;
    defConsist: number;
    offReb: number;
    defReb: number;
    boxOut: number;
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
        'passIq' | 'passVision' | 'offBallMovement' | 'intDef' | 'perDef' | 'steal' | 'blk' |
        'helpDefIq' | 'passPerc' | 'defConsist' | 'offReb' | 'defReb' | 'boxOut' |
        'speed' | 'agility' | 'strength' | 'vertical' | 'stamina' |
        'hustle' | 'durability' | 'intangibles'
    >>;
    // 올타임 드래프트 풀 포함 여부 (DB include_alltime 컬럼, 기본 true)
    includeAlltime?: boolean;
    stats: PlayerStats;
    playoffStats?: PlayerStats;
    // Runtime hidden tendencies (Calculated or DB)
    tendencies?: PlayerTendencies; // Real DB Data
    hiddenTendencies?: HiddenTendencies; // Fallback Hash Data
    // 성장/퇴화 시스템 (런타임 상태)
    fractionalGrowth?: Record<string, number>;       // 소수점 누적 (sparse, 경기마다 갱신)
    attrDeltas?: Record<string, number>;             // 시즌 내 정수 변화 합계 (sparse, 저장/복원용)
    changeLog?: AttributeChangeEvent[];              // 시즌 내 정수 변화 이벤트 로그
    seasonStartAttributes?: Record<string, number>;  // 시즌 시작 시 속성 스냅샷 (delta 표시용)
}

export interface RosterUpdate {
    condition?: number;
    health?: string;
    injuryType?: string;
    returnDate?: string;
}
