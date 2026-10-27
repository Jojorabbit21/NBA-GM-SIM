
import { Player, PlayerBoxScore, GameTactics, PbpLog, RotationData, DepthChart, PlayType, RosterUpdate, SaveTendencies, BoxTick, BoxDelta, TeamPlayTypeStats } from '../../types.ts';
import { SimSettings } from '../../types/simSettings.ts';
import type { ArchetypeRatings } from './archetypeSystem.ts';
import type { PlayContext } from './playTypes.ts';
import type { TacticSets, TacticSetId } from './tacticSchedule.ts';

// [2026-10-19] 퇴장 사유 — 퇴장 여부는 pf가 아니라 ejectionReason으로 판정한다(isOut).
// 예전엔 테크니컬 2회/플래그런트 2/싸움 퇴장 시 pf=6을 마커로 덮어써 박스스코어 PF가 오염됐음.
// 교체 로그 사유 문구도 여기로 분기한다(substitutionSystem). 미설정이면 'foul_out'으로 간주.
export type EjectionReason = 'foul_out' | 'technical' | 'flagrant' | 'fight';

/** 코트 복귀 불가(6반칙 파울아웃 또는 퇴장) 여부. pf 값은 실제 개인파울 수 그대로 둔다. */
export function isOut(p: { pf: number; ejectionReason?: EjectionReason }): boolean {
    return p.pf >= 6 || p.ejectionReason !== undefined;
}

export interface LivePlayer extends PlayerBoxScore {
    ejectionReason?: EjectionReason;
    // Current runtime attributes
    currentCondition: number;
    startCondition: number;
    position: string;
    /** [2026-10-22] 선수 고유 포지션(meta). position은 "지금 맡은 코트 슬롯" — 슬롯 배정(slotAssignment.ts)에만 쓴다 */
    nativePosition?: string;
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
    foulCheckedPf?: number;          // [2026-10-23] 파울 트러블 판정을 마친 파울 수 — 파울이 이보다 늘었을 때만 다시 판정

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
    // 3점 서브존 선호(코너/45도/탑, 합계 = 1.0) — DB tendencies.zones.cnr/p45/atb 기반
    threeSubPref: { cnr: number; p45: number; atb: number };
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

/** [2026-10-26] 가비지 타임 상태 — 발동 시 로테이션 표를 통째로 덮어쓰므로 해제 때 되돌릴 원본을 보관 */
export interface GarbageTimeState {
    mapSnapshot: Record<string, boolean[]>;   // 발동 직전 rotationMap 전체 복사본
    restIds: string[];                        // 쉬게 한 선수(선발 + 발동 시 코트 위) — 대체자·승계·폴백에서 후순위
}

export interface TeamState {
    id: string;
    name: string;
    // [2026-10-08] 연고지명(PBP 공격권 안내용). 싱글은 Team.city, 멀티는 빈 문자열로 들어오므로
    // 소비처(statsMappers regionOf)가 비어 있으면 name 첫 어절로 폴백한다.
    city?: string;
    score: number;
    tactics: GameTactics;
    depthChart?: DepthChart;
    onCourt: LivePlayer[];
    bench: LivePlayer[];
    timeouts: number;
    fouls: number;
    bonus: boolean;
    acePlayerId?: string;
    // [2026-10-26] 가비지 타임 진행 중 상태(없으면 정상 로테이션). rotationLogic.updateGarbageTime 참고
    garbage?: GarbageTimeState;
    // [2026-10-23] Time-based tactic sets (tacticSchedule.ts) — tactics.sliders = currently active set
    tacticSets?: TacticSets;
    activeTacticSet?: TacticSetId;
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
    severity: 'Grade1' | 'Grade2' | 'Grade3' | 'Grade4' | 'Grade5';
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
    // [2026-10-07] 직전 포제션 진입이 오펜시브 리바운드였는지 — 풋백 플레이 선택 조건(possessionHandler)을
    // shotClock===14 대신 이 플래그로 판정(플래그런트 후 샷클락 14초가 풋백을 유발하지 않도록). optional: 미설정=false.
    lastEntryWasOffReb?: boolean;
    lastEntryWasFlagrant?: boolean; // 플래그런트 후 공격권 유지(샷클락 14) — 샷클락 바이올레이션 문구 분기용
    /** [2026-10-26] 4쿼터 이후 마지막 역전·리드 득점(동점이 되면 null) — 경기 종료 시 위닝샷 해설용. buzzer = 0:00 버저비터로 이미 해설함 */
    lastGoAhead?: { side: 'home' | 'away'; playerName: string; quarter: number; gameClock: number; buzzer?: boolean } | null;
    // [2026-10-23] simulatePossession이 슛 판정 전에 미리 뽑은 이번 포세션 소요 시간(초) — 샷클락 막판 페널티 판정용.
    // liveEngine은 이 값이 있으면 calculatePossessionTime을 다시 부르지 않고 그대로 쓴다. 미설정 = 기존처럼 계산.
    preSampledPossessionTime?: number;
    // [2026-10-23] 이번 포세션에 수비팀이 실제로 프레스를 걸었는지(공격 리바운드 이어진 포세션·1단계 제외) — 프레스 체력 소모 판정용
    pressActiveThisPossession?: boolean;
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

    // [2026-10-18] 팀별 플레이타입 실적(statsMappers.recordPlayTypeStat이 누적) — 멀티 PPP 집계용
    playTypeStats: TeamPlayTypeStats;

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
    prevCondSnap?: Record<string, number>; // [2026-10-17] 직전 틱에 기록한 체력 정수값 (BoxTick.c diff 기준점, 처음 쓸 때 생성)

    // [New 2026-07] 직전 포제션이 "우리 팀의 수비 리바운드"로 끝났는지 (defReb 속공 트레이드오프용)
    lastEntryWasDefReb: boolean;

    // [2026-10-24] 직전 포세션이 상대 턴오버 중 라이브볼 스틸로 끝났는지 (스틸 후 속공 연결용)
    lastEntryWasSteal?: boolean;

    // [2026-10-22] 타임아웃 NBA 규정화 — 피리어드별 의무 타임아웃 슬롯 진행 + 팀별 마지막 타임아웃 시각(경과초)
    timeoutPeriod: TimeoutPeriodState;
    lastTimeoutSec: { home: number; away: number };
}

// [2026-10-22] 피리어드별 타임아웃 진행 상태 (timeoutPolicy.ts 가 관리)
export interface TimeoutPeriodState {
    slots: number;                  // 소화된 의무 타임아웃 슬롯 수 (0~2) — 이 피리어드 타임아웃 횟수(최대 2)
    firstTeamId: string | null;     // 첫 번째 타임아웃을 쓴 팀(두 번째 의무는 반대 팀 차감)
    lateCapApplied: boolean;        // 4쿼터 3분 이후 2회 상한 적용 완료
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

    shotType?: PlayContext['shotType']; // 'Dunk' | 'Layup' | 'Floater' | 'Jumper' | 'Pullup' | 'Hook' | 'CatchShoot' | 'Fadeaway'
    isBlock?: boolean;
    isSteal?: boolean;

    // [New] offensiveFoul 세부 유형 — 차징(defender.attr.defConsist가 실제 확률에 기여)만
    // tovForced 귀속 대상. 일리걸 스크린은 defender 능력치와 무관한 flat rate라 귀속 제외.
    foulSubtype?: 'charge' | 'illegalScreen';

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
    // [2026-10-24] 스크린 판정 결과 (PnR 3종 + Handoff, 판정 생략 시 undefined)
    screenResult?: 'clean' | 'partial' | 'fail';

    subZone?: string;

    isZone?: boolean;

    // [New 2026-07] Help Defense: 이번 포제션에 헬프를 "시도"한 선수 (성공 여부 무관, 체력 추가 소모 대상)
    helpDefenderId?: string;
    // [2026-07-30] 이번 스틸/블락/파울이 헬프 디펜더에게 귀속된 것인지 (커멘터리 전용 문구용)
    isHelpPlay?: boolean;
    // [2026-07-31] PostUp/PnR_Roll 킥아웃 플래그 (client 미러 참고)
    isKickout?: boolean;
    // [2026-10-24] 블리츠 트랩 탈출 실패 턴오버
    isBlitzTrap?: boolean;
    // [2026-10-23] 풀코트 프레스 단계에서 끝난 포세션(트랩 스틸/트랩 파울/1대1 압박 턴오버/1대1 리치인) — 커멘터리 분기 + 플레이타입 PPP 집계 제외용
    pressEvent?: 'trapSteal' | 'trapFoul' | 'pressTurnover' | 'pressFoul';
}
