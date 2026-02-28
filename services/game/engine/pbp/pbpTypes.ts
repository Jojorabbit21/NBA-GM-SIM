
import { Player, PlayerBoxScore, GameTactics, PbpLog, RotationData, DepthChart, PlayType, RosterUpdate } from '../../../../types';
import { ArchetypeRatings } from './archetypeSystem';

export interface LivePlayer extends PlayerBoxScore {
    // Current runtime attributes
    currentCondition: number;
    startCondition: number; // [New] To calculate fatigue used
    position: string;
    ovr: number;
    isStarter: boolean; 
    health: 'Healthy' | 'Injured' | 'Day-to-Day'; 
    injuryType?: string; // [Added] For runtime injury tracking
    returnDate?: string; // [Added] For runtime injury tracking
    
    // [New] Rotation Stability & Fatigue Tracking
    lastSubInTime: number; // Game clock seconds when they entered (720 -> 0)
    conditionAtSubIn: number; // Condition when they last entered the court (for Delta calc)
    
    // [New] Fatigue Flags for Substitution System
    isShutdown?: boolean;

    // [New] Temporary Bench Tracking (파울 트러블 / 탈진 임시 벤치)
    benchReason?: 'foul_trouble' | 'shutdown' | null;
    benchedAtMinute?: number;        // 벤치된 시점의 게임 분(0-47)
    benchedAtQuarter?: number;       // 벤치된 시점의 쿼터(1-4)
    scheduledReturnMinute?: number;  // 자동 복귀 예정 분 (undefined = 조건 복귀)

    // [New] Hot/Cold Streak (슈팅 분산)
    hotColdRating: number;    // -1.0(아이스) ~ +1.0(온 파이어), 초기값 0
    recentShots: boolean[];   // 최근 5개 슛 결과 순환 버퍼

    // Dynamic Role Ratings (0-100+) - Recalculated on substitutions
    archetypes: ArchetypeRatings;

    // Attributes needed for simulation (Expanded for precise archetype calc)
    attr: {
        // General
        ins: number; out: number; mid: number;
        ft: number; threeVal: number; // Derived 3pt average
        // Inside sub-attributes (Rim/Paint 세분화)
        layup: number; dunk: number; closeShot: number;
        
        // Physical
        speed: number; agility: number; strength: number; vertical: number;
        stamina: number; durability: number; hustle: number;
        height: number; weight: number;

        // Skill
        handling: number; hands: number;
        pas: number; passAcc: number; passVision: number; passIq: number;
        shotIq: number; offConsist: number;
        postPlay: number;
        
        // Defense
        def: number; intDef: number; perDef: number;
        blk: number; stl: number; 
        helpDefIq: number; defConsist: number; passPerc: number; // Added passPerc
        drFoul: number; foulTendency: number;

        // Rebound
        reb: number;
        offReb: number;  // 공격 리바운드 전용 능력치
        defReb: number;  // 수비 리바운드 전용 능력치

        // Intangibles (클러치, 강심장, 해결사 능력)
        intangibles: number;
    }
    
    // [New] Runtime Zone Tracking (Flat structure for easy increment)
    // These need to be initialized in main.ts
    zone_rim_m: number; zone_rim_a: number;
    zone_paint_m: number; zone_paint_a: number;
    zone_mid_l_m: number; zone_mid_l_a: number;
    zone_mid_c_m: number; zone_mid_c_a: number;
    zone_mid_r_m: number; zone_mid_r_a: number;
    zone_c3_l_m: number; zone_c3_l_a: number;
    zone_c3_r_m: number; zone_c3_r_a: number;
    zone_atb3_l_m: number; zone_atb3_l_a: number;
    zone_atb3_c_m: number; zone_atb3_c_a: number;
    zone_atb3_r_m: number; zone_atb3_r_a: number;

    // [New] Ace Stopper Tracking
    matchupEffectSum: number; // Cumulative impact score
    matchupEffectCount: number; // Number of possessions targeted
}

export interface TeamState {
    id: string;
    name: string;
    score: number;
    tactics: GameTactics;
    depthChart?: DepthChart; // [New] Added Depth Chart info
    onCourt: LivePlayer[]; // Always 5 players
    bench: LivePlayer[];
    timeouts: number;
    fouls: number; // Team fouls in quarter
    bonus: boolean; // Penalty situation
    acePlayerId?: string; // [New] Identify the team's Ace (Highest OVR Starter)
}

// [New] Structured Shot Event for Visualization
export interface ShotEvent {
    id: string;
    quarter: number;
    gameClock: number;
    teamId: string;
    playerId: string;
    x: number;
    y: number;
    zone: string;
    isMake: boolean;
    playType?: string;
    assistPlayerId?: string;
}

// [New] Structured Injury Event
export interface InjuryEvent {
    playerId: string;
    playerName: string;
    teamId: string;
    injuryType: string;
    durationDesc: string; // e.g., "2 Weeks", "Day-to-Day"
    quarter: number;
    timeRemaining: string;
}

// [New] Momentum/Run tracking for Live Game Mode
export interface MomentumState {
    homeEpochPts: number;       // 현재 에포크 내 홈팀 누적 득점
    awayEpochPts: number;       // 현재 에포크 내 원정팀 누적 득점
    epochStartTotalSec: number; // 에포크 시작 시점 (경기 총 경과초)
    activeRun: {
        teamId: string;
        startTotalSec: number;  // diff ≥ 8 달성 순간 (타이머 기준)
    } | null;
}

// [New] Clutch Context for late-game situations
export interface ClutchContext {
    isClutch: boolean;        // Q4 && gameClock <= 300 && scoreDiff <= 10
    isSuperClutch: boolean;   // Q4 && gameClock <= 120 && scoreDiff <= 5
    trailingTeamSide: 'home' | 'away' | null;
    scoreDiff: number;        // 절대값 점수차
    desperation: number;      // 0.0~1.0 (시간↓ × 점수차↑ = 절박도)
}

// [New] Rotation Override for temporary bench (foul trouble / shutdown)
export interface RotationOverride {
    outPlayerId: string;          // 임시 벤치된 선수
    fillerPlayerId: string;       // 대체 투입된 선수
    reason: 'foul_trouble' | 'shutdown';
    fromMinute: number;           // 오버라이드 시작 분
    toMinute: number;             // 원래 선수 복귀 예정 분 (48 = 조건 복귀)
    originalSlots: boolean[];     // outPlayer의 원본 맵 스냅샷(48 boolean)
    active: boolean;              // 해결되면 false
}

export interface GameState {
    home: TeamState;
    away: TeamState;

    quarter: number;
    gameClock: number;
    shotClock: number;

    possession: 'home' | 'away';
    isDeadBall: boolean;

    logs: PbpLog[];

    // Config
    isHomeB2B: boolean;
    isAwayB2B: boolean;

    // [New] Rotation Tracking
    rotationHistory: RotationData;

    // [New] Shot Chart Data
    shotEvents: ShotEvent[];

    // [New] Injury Tracking
    injuries: InjuryEvent[];

    // [New] Momentum/Run System (Live Game Mode)
    momentum: MomentumState;

    // Live mode: 유저 팀 ID (유저 팀은 자동 타임아웃 스킵)
    // null/undefined = 배치 모드 (양팀 모두 AI 타임아웃)
    userTeamId?: string | null;

    // [New] Rotation Override System (임시 벤치 + 자동 복귀)
    originalRotationMap: Record<string, boolean[]>; // 경기 시작 시 deep copy, 엔진 수정 불가
    activeOverrides: RotationOverride[];            // 임시 교체 추적 스택

    // [New] Possession Time Tracking (평균 샷클락 소모 시간)
    possessionTimeAccum: {
        home: { total: number; count: number };
        away: { total: number; count: number };
    };
}

export interface PossessionResult {
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'freethrow' | 'rebound'
        | 'offensiveFoul' | 'technicalFoul' | 'flagrantFoul' | 'shotClockViolation';
    
    // Actors
    offTeam: TeamState;
    defTeam: TeamState;
    actor: LivePlayer; // The one who shot, turned it over, or got fouled
    defender?: LivePlayer; // The primary defender (or stealer/blocker)
    assister?: LivePlayer; // If scored
    rebounder?: LivePlayer; // If missed
    reboundType?: 'off' | 'def'; // resolveRebound에서 결정된 리바운드 타입

    // Details
    playType?: PlayType;
    zone?: 'Rim' | 'Paint' | 'Mid' | '3PT';
    points: 0 | 1 | 2 | 3;
    isAndOne: boolean;
    
    // Stats for logs
    shotType?: string; // "Jump Shot", "Dunk", "Layup"
    isBlock?: boolean;
    isSteal?: boolean;

    // [New] Matchup Context
    isAceTarget?: boolean;
    matchupEffect?: number;
    
    // [New] Switch & Mismatch Info (For Log flavor)
    isSwitch?: boolean;
    isMismatch?: boolean;
    isBotchedSwitch?: boolean; // 수비 실수 (오픈 찬스)

    // [New] Flagrant Foul
    isFlagrant2?: boolean;
}
