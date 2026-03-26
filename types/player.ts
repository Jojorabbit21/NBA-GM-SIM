
import type { PlayerArchetypeState } from './archetype';

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

// 선수 인기도 (재정 시스템 연결)
export interface PlayerPopularity {
    local: number;    // 0~100, 연고지 인기 (관중/MD 직결)
    national: number; // 0~100, 전국 인기 (스폰서십/MD)
}

// 선수 기분/사기 (퍼포먼스·트레이드 요청에 영향)
export type MoraleEventType =
    | 'TEAM_WIN' | 'TEAM_LOSS'
    | 'MINUTES_HIGH' | 'MINUTES_LOW'
    | 'GREAT_GAME' | 'BAD_GAME'
    | 'STAR_IGNORED';

export interface MoraleEvent {
    type: MoraleEventType;
    delta: number;
    date: string;   // 경기 날짜 'YYYY-MM-DD'
}

export interface PlayerMorale {
    score: number;              // 0~100, 50 = 중립
    recentEvents: MoraleEvent[]; // 최근 10개 (UI 툴팁 표시용)
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

    // 성격 (5)
    temperament: number;             // -1.0(냉정)~+1.0(다혈질) 테크니컬 확률
    ego: number;                     // -1.0(겸손)~+1.0(자존심) 옵션 순위별 퍼포먼스
    financialAmbition: number;       // 0.0(겸손)~1.0(탐욕) FA 요구 연봉 및 오퍼 수락 기준
    loyalty: number;                 // 0.0(이적 욕구)~1.0(팀 충성도) FA 재계약 수락 기준 완화
    winDesire: number;               // 0.0(돈/역할 우선)~1.0(우승 욕구) 컨텐더 오퍼 수락 우대
}

// [New] 부상 이력 기록 (부상 발생 시마다 push)
export interface InjuryHistoryEntry {
    injuryType: string;
    severity: 'Minor' | 'Major' | 'Season-Ending';
    duration: string;
    date: string;
    returnDate: string;
    isTraining: boolean;
}

// [New] 능력치 변화 이벤트 (성장/퇴화 시 |fractional| >= 1.0 도달마다 기록)
export interface AttributeChangeEvent {
    date: string;           // 경기 날짜 (예: '2025-12-15')
    attribute: string;      // SkillAttribute key
    delta: number;          // +1 or -1
    oldValue: number;
    newValue: number;
}

// [New] 수상 내역 (멀티시즌 대비 배열 구조)
export type PlayerAwardType =
    | 'MVP' | 'DPOY' | 'FINALS_MVP' | 'CHAMPION' | 'REG_SEASON_CHAMPION'
    | 'ALL_NBA_1' | 'ALL_NBA_2' | 'ALL_NBA_3'
    | 'ALL_DEF_1' | 'ALL_DEF_2';

export interface PlayerAwardEntry {
    type: PlayerAwardType;
    season: string;   // e.g. '2025-26'
    teamId: string;
    rank?: number;    // MVP 1~10위, DPOY 1~5위 (없으면 수상/선정)
}

// ── 선수 계약 구조 ──
export type ContractType = 'rookie' | 'veteran' | 'max' | 'min' | 'extension';

export interface ContractOption {
    type: 'player' | 'team';
    year: number;               // 적용 연차 (0-based, 보통 마지막 해)
}

export interface PlayerContract {
    years: number[];            // 연차별 연봉 (달러) [30_000_000, 32_000_000, ...]
    currentYear: number;        // 0-based
    type: ContractType;
    noTrade?: boolean;
    option?: ContractOption;
    tradeKicker?: number;       // e.g. 0.10 = 10% 보너스 (트레이드 시 지급)
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
    injuryHistory?: InjuryHistoryEntry[];
    awards?: PlayerAwardEntry[];
    contract?: PlayerContract;
    age?: number;         // 오프시즌 age+1 후 덮어쓰기용 (base_attributes.age는 불변이므로)
    teamTenure?: number;  // 현재 팀에서 뛴 시즌 수 (Bird Rights 판별용)
    archetypeState?: PlayerArchetypeState;  // 선수 플레이스타일 아키타입 (오프시즌 갱신)
    popularity?: PlayerPopularity;          // 선수 인기도 (재정 시스템 연결)
    morale?: PlayerMorale;                  // 선수 기분/사기 (퍼포먼스 연결)
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
    injuryHistory?: InjuryHistoryEntry[];
    awards?: PlayerAwardEntry[];
    career_history?: CareerSeasonStat[];
    contract?: PlayerContract;
    draftYear?: number;     // meta_players.draft_year (YOS 역산용)
    draftRound?: 1 | 2 | null;  // 드래프트 라운드 (null = 언드래프트)
    draftPick?: number | null;  // 픽 번호 (1~30: 1라운드, 31~60: 2라운드, null: 언드래프트)
    teamTenure?: number;    // 현재 팀에서 뛴 시즌 수 (Bird Rights 판별용)
    prevSeasonStats?: PrevSeasonStats; // 직전 시즌 성적 (생성 선수용, FA 가치 산정에 활용)
    prevSalary?: number;               // 직전 계약 연봉 AAV (생성 FA 선수용 — Bird Rights 기준)
    prevTeamTenure?: number;           // 직전 팀 재직 연수 (생성 FA 선수용)
    prevContract?: PlayerContract;     // 직전 계약 연도별 상세 (생성 FA 선수용, UI 표시용)
    archetypeState?: PlayerArchetypeState;  // 선수 플레이스타일 아키타입 (오프시즌 갱신)
    popularity?: PlayerPopularity;          // 런타임, 저장 경로: SavedPlayerState
    morale?: PlayerMorale;                  // 런타임, 저장 경로: SavedPlayerState
    // OVR 엔진 계산값 (dataMapper.ts 로드 시 배치 세팅, 저장 안 함 — 항상 동적 계산)
    rawOvr?: number;      // 리그 분포 보정 전 원시 OVR (트레이드 내부 계산용)
    futureOvr?: number;   // potential 기반 미래 OVR
}

// 과거 시즌 커리어 스탯 (meta_players.career_history JSONB, NBA Stats API에서 수집)
export interface CareerSeasonStat {
    season:   string;  // "2023-24"
    team:     string;  // "DEN"
    age:      number;
    // Traditional per game
    gp:  number;  gs:  number;
    min: number;  pts: number;
    oreb: number; dreb: number; reb: number;
    ast: number;  stl: number;  blk: number;
    tov: number;  pf:  number;
    fgm: number;  fga: number;
    fg3m: number; fg3a: number;
    ftm: number;  fta: number;
    fg_pct:  number;  fg3_pct: number; ft_pct: number;
    // Advanced (locally calculated from totals)
    ts_pct:    number;
    efg_pct:   number;
    tov_pct:   number;
    fg3a_rate: number;
    fta_rate:  number;
    // Advanced (team-context, from LeagueDashPlayerStats)
    usg_pct?: number;
    ast_pct?: number;
    orb_pct?: number;
    drb_pct?: number;
    trb_pct?: number;
    stl_pct?: number;
    blk_pct?: number;
    // 플레이오프 여부 (true면 playoff 기록, 없으면 정규시즌)
    playoff?: boolean;
    // 해당 시즌 수상 내역 (BBRef 기반 과거 이력, 시뮬 수상은 Player.awards에 별도 저장)
    awards?: PlayerAwardEntry[];
}

export interface PrevSeasonStats {
    gp: number;
    mpg: number;
    ppg: number;
    rpg: number;
    apg: number;
    spg: number;
    bpg: number;
    fgPct: number;
    fg3Pct: number;
    ftPct: number;
}

export interface RosterUpdate {
    condition?: number;
    health?: string;
    injuryType?: string;
    returnDate?: string;
}
