// periodRules.ts — 피리어드(쿼터·연장) 규칙. [2026-10-26] 연장전 P1 (docs/plan/overtime-system.md)
// - 정규 4쿼터 × 12분, 연장 5분 × 최대 MAX_OVERTIME_PERIODS회 — simSettings.overtimeEnabled일 때만(기본 off)
// - 경기 경과초, 로테이션 표·전술 타임라인(48칸) 분 인덱스, 팀파울 자유투 기준, 결승 공격 판정, 점프볼
// 점프볼만 Math.random을 쓰고 나머지는 순수 함수. 서버 미러: server/src/shared/engine/pbp/periodRules.ts
import type { GameState, TeamState, LivePlayer } from './pbpTypes';

export const QUARTER_SEC = 720;
export const REGULATION_PERIODS = 4;
export const REGULATION_SEC = QUARTER_SEC * REGULATION_PERIODS;
export const OT_PERIOD_SEC = 300;
/** 연장 최대 횟수 — 2차 연장도 동점이면 결승 공격으로 끝낸다. utils/leagueTimeline MAX_OVERTIME_PERIODS(B2B 간격)와 같은 값. */
export const MAX_OVERTIME_PERIODS = 2;
/** 연장 피리어드당 팀 타임아웃(이월 없음) */
export const OT_TIMEOUTS = 2;

type ClockState = Pick<GameState, 'quarter' | 'gameClock'>;

export const isOvertimePeriod = (quarter: number): boolean => quarter > REGULATION_PERIODS;

export const periodLengthSec = (quarter: number): number => (isOvertimePeriod(quarter) ? OT_PERIOD_SEC : QUARTER_SEC);

export function periodStartSec(quarter: number): number {
    return isOvertimePeriod(quarter)
        ? REGULATION_SEC + (quarter - REGULATION_PERIODS - 1) * OT_PERIOD_SEC
        : (quarter - 1) * QUARTER_SEC;
}

/** 경기 경과초 — 정규시간은 기존 식 (quarter−1)·720 + (720 − gameClock)과 같다. */
export function elapsedGameSec(state: ClockState): number {
    return periodStartSec(state.quarter) + periodLengthSec(state.quarter) - state.gameClock;
}

/** 로테이션 표·전술 타임라인(48칸) 인덱스 — 정규시간은 경과 분(최대 47), 연장 k분째는 4쿼터 마지막 5분(43+k) 재사용. */
export function scheduleMinute(state: ClockState): number {
    if (isOvertimePeriod(state.quarter)) {
        const k = Math.min(4, Math.max(0, Math.floor((OT_PERIOD_SEC - state.gameClock) / 60)));
        return 43 + k;
    }
    return Math.min(47, Math.floor(elapsedGameSec(state) / 60));
}

/** 이 수를 넘는 팀파울부터 자유투 — 정규 쿼터 4(5번째부터), 연장 3(4번째부터, NBA 규정). */
export const teamFoulLimit = (quarter: number): number => (isOvertimePeriod(quarter) ? 3 : 4);

/** 연장 시작 시스템 로그 — "1차 연장 시작"(현행), "연장 1 시작"(10-26 개발 중 초기 표기, 배포 전) 모두 인식 */
const OT_START_RE = /^(\d+차 연장|연장 \d+) 시작/;

/** 피리어드 이름 — 1~4쿼터, 1차 연장, 2차 연장 */
export const periodLabel = (quarter: number): string =>
    (isOvertimePeriod(quarter) ? `${quarter - REGULATION_PERIODS}차 연장` : `${quarter}쿼터`);

/** [2026-10-26] 연장 횟수 — "N차 연장 시작" 시스템 로그 수. 연장전 도입 전(그리고 스위치 off) 엔진은 경기 종료 로그를 항상
 *  5쿼터로 찍으므로(연장 아님) 로그의 최대 쿼터로 세면 안 된다. 서버는 이 값을 game_pbp·games.ot_periods로 저장(공개 시각). */
export function countOvertimePeriods(logs: { teamId?: string; text?: string }[]): number {
    return logs.filter(l => l.teamId === 'SYSTEM' && OT_START_RE.test(l.text ?? '')).length;
}

/** [2026-10-26] 연장 클러치 — 마지막 2분. 탈진으로 빠졌던 주전이 체력과 무관하게 복귀하고, 다시 탈진 교체되지 않는다. */
export const OT_CLUTCH_SEC = 120;
export const isOvertimeClutch = (state: Pick<GameState, 'quarter' | 'gameClock'>): boolean =>
    isOvertimePeriod(state.quarter) && state.gameClock <= OT_CLUTCH_SEC;

export const overtimeEnabled = (state: GameState): boolean => state.simSettings?.overtimeEnabled === true;

/** 방금 끝난 피리어드 다음에 연장을 하는지 — 4쿼터 이후 동점이고 연장 횟수가 남았을 때 */
export function shouldPlayOvertime(state: GameState): boolean {
    return overtimeEnabled(state)
        && state.quarter >= REGULATION_PERIODS
        && state.quarter < REGULATION_PERIODS + MAX_OVERTIME_PERIODS
        && state.home.score === state.away.score;
}

/** 결승 공격 — 마지막 연장에서 동점, 남은 시간이 샷클락(24초) 이내로 시작하는 공격. 시간을 끝까지 쓰고 반드시 득점한다. */
export function isDecisivePossession(state: GameState): boolean {
    return overtimeEnabled(state)
        && state.quarter >= REGULATION_PERIODS + MAX_OVERTIME_PERIODS
        && state.home.score === state.away.score
        && state.gameClock <= 24;
}

// ── 점프볼 (경기 시작·연장 시작) ──────────────────────────────────────────

const JUMP_BALL = {
    VERTICAL_WEIGHT: 0.25, // 점프력 1 = 신장 0.25cm
    SCALE: 4,              // 점수 차 4 → 로지스틱 1단계(약 73%)
    MIN_P: 0.2,
    MAX_P: 0.8,
} as const;

/** 점프하는 선수 — 코트 위 C 슬롯, 없으면 최장신 */
function jumperOf(team: TeamState): LivePlayer | undefined {
    return team.onCourt.find(p => p.position === 'C')
        ?? [...team.onCourt].sort((a, b) => b.attr.height - a.attr.height)[0];
}

const jumpScore = (p: LivePlayer | undefined): number => (p ? p.attr.height + JUMP_BALL.VERTICAL_WEIGHT * p.attr.vertical : 0);

export interface JumpBallResult {
    winner: 'home' | 'away';
    homeJumper?: LivePlayer;
    awayJumper?: LivePlayer;
}

/** 센터 신장·점프력으로 점프볼 승자를 정한다(20~80% 범위). */
export function resolveJumpBall(state: GameState): JumpBallResult {
    const homeJumper = jumperOf(state.home);
    const awayJumper = jumperOf(state.away);
    const diff = jumpScore(homeJumper) - jumpScore(awayJumper);
    const pHome = Math.min(JUMP_BALL.MAX_P, Math.max(JUMP_BALL.MIN_P, 1 / (1 + Math.exp(-diff / JUMP_BALL.SCALE))));
    return { winner: Math.random() < pHome ? 'home' : 'away', homeJumper, awayJumper };
}
