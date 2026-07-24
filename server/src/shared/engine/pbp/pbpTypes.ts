
import { Player, PlayerBoxScore, GameTactics, PbpLog, RotationData, DepthChart, PlayType, RosterUpdate, SaveTendencies, BoxTick, BoxDelta } from '../../types.ts';
import { SimSettings } from '../../types/simSettings.ts';
import type { ArchetypeRatings } from './archetypeSystem.ts';

export interface LivePlayer extends PlayerBoxScore {
    // Current runtime attributes
    currentCondition: number;
    startCondition: number;
    position: string;
    ovr: number;
    isStarter: boolean;
    health: 'Healthy' | 'Injured' | 'Day-to-Day';
    injuryType?: string;
    returnDate?: string;
    injuredThisGame?: boolean;

    // Rotation Stability & Fatigue Tracking
    lastSubInTime: number;
    conditionAtSubIn: number;

    // Fatigue Flags for Substitution System
    isShutdown?: boolean;

    // Temporary Bench Tracking
    benchReason?: 'foul_trouble' | 'shutdown' | null;
    benchedAtMinute?: number;
    benchedAtQuarter?: number;
    scheduledReturnMinute?: number;

    // Hot/Cold Streak
    hotColdRating: number;
    recentShots: boolean[];

    // Dynamic Role Ratings (0-100+) - Recalculated on substitutions
    archetypes: ArchetypeRatings;

    // Save-seeded hidden tendencies
    tendencies: SaveTendencies;

    // 선수 기분/사기 (0~100, 50 = 중립)
    morale: number;

    // 선수 DNA — 4존 선호도 (합계 = 1.0)
    zonePref: { ra: number; itp: number; mid: number; three: number };
    // 좌우 슈팅 편향 (0: 강한 왼쪽 ~ 3: 강한 오른쪽, 기본 2)
    lateralBias: number;

    // Attributes needed for simulation
    attr: {
        // General
        ins: number; out: number; mid: number;
        ft: number; threeVal: number;
        threeCorner: number; three45: number; threeTop: number;
        // Inside sub-attributes
        layup: number; dunk: number; closeShot: number;

        // Physical
        speed: number; spdBall: number; agility: number; strength: number; vertical: number;
        stamina: number; durability: number; hustle: number;
        height: number; weight: number;

        // Skill
        handling: number; hands: number;
        pas: number; passAcc: number; passVision: number; passIq: number;
        offBallMovement: number;
        shotIq: number; offConsist: number;
        postPlay: number;

        // Defense
        def: number; intDef: number; perDef: number;
        blk: number; stl: number;
        helpDefIq: number; defConsist: number; passPerc: number;
        drFoul: number;

        // Rebound
        reb: number;
        offReb: number;
        defReb: number;
        boxOut: number;

        // Intangibles
        intangibles: number;
    }

    // Runtime Zone Tracking
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

    // Ace Stopper Tracking
    matchupEffectSum: number;
    matchupEffectCount: number;
}

export interface TeamState {
    id: string;
    name: string;
    score: number;
    tactics: GameTactics;
    depthChart?: DepthChart;
    onCourt: LivePlayer[];
    bench: LivePlayer[];
    timeouts: number;
    fouls: number;
    bonus: boolean;
    acePlayerId?: string;
    garbageApplied?: boolean;
}

// Structured Shot Event for Visualization
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
    playerName?: string;
    assistPlayerName?: string;
    defenderName?: string;
    shotType?: string;
    points?: 0 | 2 | 3;
    isBlock?: boolean;
    subZone?: string;
}

// Structured Injury Event
export interface InjuryEvent {
    playerId: string;
    playerName: string;
    teamId: string;
    injuryType: string;
    durationDesc: string;
    severity: 'Minor' | 'Major' | 'Season-Ending';
    quarter: number;
    timeRemaining: string;
}

// Suspension Event
export interface SuspensionEvent {
    playerId: string;
    playerName: string;
    teamId: string;
    opponentPlayerId: string;
    opponentPlayerName: string;
    opponentTeamId: string;
    suspensionGames: number;
    opponentSuspensionGames: number;
    quarter: number;
    timeRemaining: string;
}

// Momentum/Run tracking for Live Game Mode
export interface MomentumState {
    homeEpochPts: number;
    awayEpochPts: number;
    epochStartTotalSec: number;
    activeRun: {
        teamId: string;
        startTotalSec: number;
    } | null;
}

// Clutch Context for late-game situations
export interface ClutchContext {
    isClutch: boolean;
    isSuperClutch: boolean;
    trailingTeamSide: 'home' | 'away' | null;
    scoreDiff: number;
    desperation: number;
}

// Rotation Override for temporary bench
export interface RotationOverride {
    outPlayerId: string;
    fillerPlayerId: string;
    reason: 'foul_trouble' | 'shutdown';
    fromMinute: number;
    toMinute: number;
    originalSlots: boolean[];
    active: boolean;
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

    isHomeB2B: boolean;
    isAwayB2B: boolean;

    rotationHistory: RotationData;

    shotEvents: ShotEvent[];

    injuries: InjuryEvent[];

    suspensions: SuspensionEvent[];

    momentum: MomentumState;

    userTeamId?: string | null;

    originalRotationMap: Record<string, boolean[]>;
    activeOverrides: RotationOverride[];

    possessionTimeAccum: {
        home: { total: number; count: number };
        away: { total: number; count: number };
    };

    courtSnapshot: CourtSnapshot | null;

    simSettings: SimSettings;

    isUserDelegated: boolean;

    // [New] 박스스코어 점진 공개용 포세션 단위 델타 타임라인
    boxTimeline: BoxTick[];
    prevBoxSnap: Record<string, BoxDelta>; // 직전 포세션 종료 시점의 누적 스냅샷 (diff 기준점)
}

// Court Position Visualization
export interface PlayerCourtPosition {
    playerId: string;
    x: number;
    y: number;
    role: 'ballHandler' | 'screener' | 'spacer' | 'onBallDef' | 'helpDef' | 'zoneDef';
    hasBall: boolean;
    position: string;
    isHome: boolean;
}

export interface CourtSnapshot {
    offTeamId: string;
    playType?: PlayType;
    zone?: 'Rim' | 'Paint' | 'Mid' | '3PT';
    positions: PlayerCourtPosition[];
}

export interface PossessionResult {
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'freethrow' | 'rebound'
        | 'offensiveFoul' | 'technicalFoul' | 'flagrantFoul' | 'shotClockViolation' | 'fight';

    offTeam: TeamState;
    defTeam: TeamState;
    actor: LivePlayer;
    defender?: LivePlayer;
    assister?: LivePlayer;
    rebounder?: LivePlayer;
    reboundType?: 'off' | 'def';

    playType?: PlayType;
    zone?: 'Rim' | 'Paint' | 'Mid' | '3PT';
    points: 0 | 1 | 2 | 3;
    isAndOne: boolean;

    shotType?: string;
    isBlock?: boolean;
    isSteal?: boolean;

    isAceTarget?: boolean;
    matchupEffect?: number;

    isSwitch?: boolean;
    isMismatch?: boolean;
    isBotchedSwitch?: boolean;

    isFlagrant2?: boolean;

    fighter?: LivePlayer;
    fightOpponent?: LivePlayer;
    fighterSuspension?: number;
    opponentSuspension?: number;

    pnrCoverage?: 'drop' | 'hedge' | 'blitz';

    subZone?: string;

    isZone?: boolean;
}
