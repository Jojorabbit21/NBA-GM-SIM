
export type FoulTroublePolicy = 'auto' | 'ignore';
export type GarbageTimePolicy = 'auto' | 'play' | 'bench'; // play=출전, bench=미출전
export type ClutchPolicy = 'auto' | 'must-play' | 'must-bench';

export interface PlayerTacticConfig {
    restThreshold?: number;     // 0~80, 0=비활성. 이 값 이하 체력에서 자동 임시 벤치
    returnThreshold?: number;   // 50~95, 기본 70. 이 값 이상 체력 회복 시 복귀
    foulPolicy?: FoulTroublePolicy;   // 'auto'=기본 매트릭스 | 'ignore'=파울 트러블 무시 (6파울 퇴장은 항상 적용)
    garbagePolicy?: GarbageTimePolicy; // 'auto' | 'play'=가비지타임 멤버(빠지지 않음) | 'bench'=가비지타임 무조건 미출전
    clutchPolicy?: ClutchPolicy;      // 'auto' | 'must-play'=Q4 마지막 6분 강제 투입 | 'must-bench'=필수 벤치
}

export interface TacticalSliders {
    // A. Offense Style
    pace: number;          // 1-10: Game speed & transition frequency
    ballMovement: number;  // 1-10: Pass vs Iso tendency
    offReb: number;        // 1-10: Crash glass vs Get back

    // B. Coaching Philosophy (abstract sliders → 10 play type weights)
    playStyle: number;     // 2=히어로 볼, 5=밸런스, 9=시스템 농구
    insideOut: number;     // 2=인사이드, 5=밸런스, 9=아웃사이드
    pnrFreq: number;       // 2=P&R 낮음, 5=보통, 9=P&R 높음

    // C. Shot Tendency (Weights 1-10)
    shot_3pt: number;      // Preference for 3PT shots
    shot_mid: number;      // Preference for Mid-range shots
    shot_rim: number;      // Preference for Rim attacks

    // D. Defense
    defIntensity: number;  // 1-10: Pressure on ball & passing lanes
    helpDef: number;       // 1-10: Rotation speed & Paint packing
    switchFreq: number;    // 1-10: Frequency of switching screens
    defReb: number;        // 1-10: Defensive rebound commitment (box-out vs fast break)
    zoneFreq: number;      // 1-10: Frequency of using Zone logic
    pnrDefense: number;    // 0-2: PnR coverage (0=Drop, 1=Hedge, 2=Blitz)

    // Additional
    fullCourtPress: number; // 1-10
    zoneUsage: number;      // 1-10: Zone execution quality (rotation speed & communication)
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
    offense?: string;  // Kept as string for DB compat (no longer populated)
    defense?: string;  // Kept as string for DB compat (no longer populated)
    stopperId?: string;
    pace?: number;
    sliders?: TacticalSliders;
}

export interface TacticPreset {
    slot: number;
    name: string;
    data: Partial<GameTactics>;
}
