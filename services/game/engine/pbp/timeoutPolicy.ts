import type { GameState, TeamState } from './pbpTypes';

/**
 * 타임아웃 정책 (NBA 룰북 Rule 5 §VI 기반).
 * - 팀당 경기 7회, 의무 타임아웃도 7회에서 차감(기록원 강제 선언 없음 — 양 팀이 알아서 나눠 쓴다).
 * - 4쿼터 진입 시 최대 4회 / 4쿼터 3분 이후(그리고 두 번째 의무 타임아웃 이후) 최대 2회 — 초과분이 소멸하지
 *   않도록 AI(멀티는 유저 팀 포함)가 미리 소진한다.
 * - 연장전 규칙은 연장전 시스템 구현 시 연결(현재 quarter > 4 는 전부 무동작).
 * 순수 함수 모음 — RNG 없음(결정론). liveEngine.ts 와 server/src/shared 미러 쌍으로 유지할 것.
 */

export const TIMEOUT_RULES = {
    REGULATION_TOTAL: 7,
    Q4_ENTRY_MAX: 4,            // 4쿼터 진입 시 보유 상한
    LATE_Q4_MAX: 2,             // 4쿼터 3분 이후 보유 상한
    MANDATORY_FIRST_CLOCK: 419, // 6:59 — 이 시각 이하 첫 포세션 종료 시 첫 의무 타임아웃
    MANDATORY_SECOND_CLOCK: 179,// 2:59 — 두 번째 의무 타임아웃
    MIN_GAP_SEC: 45,            // 같은 팀 자발 타임아웃 최소 간격(경기 경과초)
    ANY_TEAM_GAP_SEC: 20,       // 양 팀 통틀어 연속 타임아웃 최소 간격
    SURPLUS_LEAD_SEC: 150,      // 초과분 1개당 소진 시작 여유 시간
    STRATEGIC_CLOCK: 150,       // 4쿼터 막판 전략 타임아웃 시작 시계(2:30)
    STRATEGIC_MARGIN: 8,        // 이 점수차 이내로 뒤질 때만
    STRATEGIC_TIED_CLOCK: 90,   // 동점은 더 늦게
    FINAL_SPEND_CLOCK: 60,      // 4쿼터 마지막 1분 — 남은 타임아웃 전부 소진
    FINAL_GAP_SEC: 20,
    RUN_DIFF: 8,                // 상대 런 판정(기존 checkAITimeout 기준 유지)
} as const;

type Side = 'home' | 'away';

export interface TimeoutDecision {
    teamId: string;
    mandatory: boolean;
}

const teamsOf = (state: GameState): TeamState[] => [state.home, state.away];
const sideOf = (state: GameState, team: TeamState): Side => (team.id === state.home.id ? 'home' : 'away');
const elapsedSec = (state: GameState): number => ((state.quarter - 1) * 720) + (720 - state.gameClock);

/** 유저가 직접 조작하는 팀(라이브 싱글, 위임 안 함)은 자동 자발 타임아웃 대상이 아님 */
function isAutoTeam(state: GameState, team: TeamState): boolean {
    if (state.userTeamId && team.id === state.userTeamId && !state.isUserDelegated) return false;
    return true;
}

/** 새 피리어드 시작 시 호출 — 의무 타임아웃 슬롯 리셋 + 4쿼터 진입 상한 */
export function startTimeoutPeriod(state: GameState): void {
    state.timeoutPeriod = { slots: 0, firstTeamId: null, lateCapApplied: false };
    if (state.quarter === 4) {
        for (const t of teamsOf(state)) t.timeouts = Math.min(t.timeouts, TIMEOUT_RULES.Q4_ENTRY_MAX);
    }
}

/** 4쿼터 3분 이후 + 두 번째 의무 타임아웃 소화 후 팀당 2회 상한(1회성) */
export function applyLateCapIfDue(state: GameState): void {
    const p = state.timeoutPeriod;
    if (state.quarter !== 4 || p.lateCapApplied) return;
    if (state.gameClock > TIMEOUT_RULES.MANDATORY_SECOND_CLOCK || p.slots < 2) return;
    p.lateCapApplied = true;
    for (const t of teamsOf(state)) t.timeouts = Math.min(t.timeouts, TIMEOUT_RULES.LATE_Q4_MAX);
}

/** 타임아웃이 실제로 적용된 직후 호출(applyTimeout 내부) — 슬롯/간격 기록 */
export function recordTimeoutTaken(state: GameState, teamId: string): void {
    const p = state.timeoutPeriod;
    if (p.slots === 0) p.firstTeamId = teamId;
    if (p.slots < 2) p.slots += 1;
    const side: Side = teamId === state.home.id ? 'home' : 'away';
    state.lastTimeoutSec[side] = elapsedSec(state);
    applyLateCapIfDue(state);
}

/** 이 피리어드에서 앞으로 이 팀에 청구될 것으로 예상되는 의무 타임아웃 수(0 또는 1) */
function expectedMandatoryAhead(state: GameState, team: TeamState): number {
    if (state.quarter > 4) return 0;
    const p = state.timeoutPeriod;
    if (p.slots >= 2) return 0;
    if (p.slots === 1) return p.firstTeamId !== team.id ? 1 : 0; // 두 번째는 첫 번째 안 낸 팀
    return 1; // 아직 아무도 안 냄: 첫째=홈, 둘째=원정 → 각 팀 1개씩
}

function gapOk(state: GameState, team: TeamState, minGap: number, anyGap: number): boolean {
    const now = elapsedSec(state);
    const own = state.lastTimeoutSec[sideOf(state, team)];
    const other = state.lastTimeoutSec[sideOf(state, team) === 'home' ? 'away' : 'home'];
    return now - own >= minGap && now - Math.max(own, other) >= anyGap;
}

/** 4쿼터 3분 이후/4쿼터 진입 상한을 넘겨 소멸하지 않도록 미리 소진해야 하는지 */
function mustSpendSurplus(state: GameState, team: TeamState): boolean {
    const p = state.timeoutPeriod;
    let cap: number;
    let checkpointClock: number;
    if (state.quarter === 3) { cap = TIMEOUT_RULES.Q4_ENTRY_MAX; checkpointClock = 0; }
    else if (state.quarter === 4 && !p.lateCapApplied) { cap = TIMEOUT_RULES.LATE_Q4_MAX; checkpointClock = TIMEOUT_RULES.MANDATORY_SECOND_CLOCK; }
    else return false;
    // 체크포인트 직전(40초 이내)에는 의무 타임아웃 예상분을 빼지 않는다 — 상대의 자발 타임아웃이 두 번째
    // 의무 슬롯을 먼저 소화해 버리면 예상이 빗나가 초과분이 소멸하기 때문(보수적으로 미리 소진).
    const nearCheckpoint = state.gameClock - checkpointClock <= 40;
    const surplus = team.timeouts - cap - (nearCheckpoint ? 0 : expectedMandatoryAhead(state, team));
    if (surplus <= 0) return false;
    return state.gameClock - checkpointClock <= surplus * TIMEOUT_RULES.SURPLUS_LEAD_SEC;
}

/** 자발(런 대응) 타임아웃 시 남겨둬야 하는 최소 보유량 */
function runReserve(state: GameState, team: TeamState): number {
    const ahead = expectedMandatoryAhead(state, team);
    if (state.quarter < 4) return ahead + (4 - state.quarter) + 1; // 이후 피리어드 의무분 + 막판 전략용 1
    return ahead + (state.gameClock > TIMEOUT_RULES.MANDATORY_SECOND_CLOCK ? TIMEOUT_RULES.LATE_Q4_MAX : 0);
}

/** 4쿼터 막판 접전에서 뒤진 팀이 공격권을 쥐고 있을 때의 전략 타임아웃 */
function wantsStrategic(state: GameState, team: TeamState): boolean {
    if (state.quarter !== 4 || state.gameClock > TIMEOUT_RULES.STRATEGIC_CLOCK) return false;
    const side = sideOf(state, team);
    if (state.possession !== side) return false;
    const mine = side === 'home' ? state.home.score : state.away.score;
    const theirs = side === 'home' ? state.away.score : state.home.score;
    const behind = theirs - mine;
    if (behind >= 1 && behind <= TIMEOUT_RULES.STRATEGIC_MARGIN) return true;
    return behind === 0 && state.gameClock <= TIMEOUT_RULES.STRATEGIC_TIED_CLOCK;
}

/**
 * 이번 포세션 종료 시점에 타임아웃이 발생해야 하는지 결정(최대 1건).
 * runVictimId: 상대 런을 맞고 있는 팀 ID(없으면 null) — 기존 checkAITimeout 의 런 판정 결과.
 * 우선순위: 4Q 전략 → 초과분 소진 → 런 대응 → 마지막 1분 소진 → 의무 타임아웃.
 */
export function decideTimeout(state: GameState, runVictimId: string | null): TimeoutDecision | null {
    if (state.quarter > 4) return null; // 연장전: 연장전 시스템 구현 시 연결
    applyLateCapIfDue(state);
    const R = TIMEOUT_RULES;

    // 보유량 많은 팀부터 평가(동률이면 홈 우선) — 소진 압박을 균등하게
    const order = teamsOf(state).sort((a, b) => b.timeouts - a.timeouts);
    const callable = order.filter(t => t.timeouts > 0 && isAutoTeam(state, t));

    for (const t of callable) {
        if (gapOk(state, t, R.MIN_GAP_SEC, R.ANY_TEAM_GAP_SEC) && wantsStrategic(state, t)) return { teamId: t.id, mandatory: false };
    }
    for (const t of callable) {
        if (gapOk(state, t, R.MIN_GAP_SEC, R.ANY_TEAM_GAP_SEC) && mustSpendSurplus(state, t)) return { teamId: t.id, mandatory: false };
    }
    for (const t of callable) {
        if (t.id === runVictimId && gapOk(state, t, R.MIN_GAP_SEC, R.ANY_TEAM_GAP_SEC) && t.timeouts - 1 >= runReserve(state, t)) {
            return { teamId: t.id, mandatory: false };
        }
    }
    if (state.quarter === 4 && state.gameClock <= R.FINAL_SPEND_CLOCK) {
        for (const t of callable) {
            if (gapOk(state, t, R.FINAL_GAP_SEC, R.FINAL_GAP_SEC)) return { teamId: t.id, mandatory: false };
        }
    }

    // 의무 타임아웃: 아무도 안 불렀으면 첫째=홈, 둘째=첫째 안 낸 팀이 차감하며 소화. 못 내면 상대, 둘 다 못 내면 슬롯만 소진.
    const p = state.timeoutPeriod;
    const due = (p.slots === 0 && state.gameClock <= R.MANDATORY_FIRST_CLOCK)
        || (p.slots === 1 && state.gameClock <= R.MANDATORY_SECOND_CLOCK);
    if (!due) return null;
    const preferred = p.slots === 0 ? state.home : (p.firstTeamId === state.home.id ? state.away : state.home);
    const fallback = preferred === state.home ? state.away : state.home;
    const payer = preferred.timeouts > 0 ? preferred : (fallback.timeouts > 0 ? fallback : null);
    if (!payer) {
        p.slots += 1; // 양 팀 모두 소진 — 의무 슬롯만 소화 처리
        applyLateCapIfDue(state);
        return null;
    }
    return { teamId: payer.id, mandatory: true };
}
