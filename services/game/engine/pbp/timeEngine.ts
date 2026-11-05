
import { GameState } from './pbpTypes';
import { TacticalSliders, PlayType } from '../../../../types';
import { SIM_CONFIG } from '../../config/constants';

/**
 * Calculates how much time a possession takes (= time until the shot/turnover/foul).
 * [2026-11-04] 상황별 클락 운영 재설계 (server 미러 참조, SIM_CONFIG.CLOCK_MGMT, docs/history/dev-log.md 11-04)
 *  기본(페이스·플레이타입) → 공격 리바운드 리셋 단축·마지막 2분 전진 → 하한 → ±1.5초 → 상황 규칙 → 샷클락 상한(맨 마지막).
 *  상황 규칙(위가 우선): ④ 4Q·연장 지는 팀 서두르기 / ① 샷클락 꺼진 구간 = 마지막 슛까지 홀드 /
 *  ② 샷클락만 다 쓰면 피리어드가 끝나는 구간 = 샷클락 끝까지 / ⑤ 4Q 앞선 팀 = 샷클락 거의 다 / ③ 2-for-1 = 30~33초에 슛.
 *  이전: 2-for-1(30~45초 → 6초, 하한 8초가 뒤에 적용돼 실제 8초)·앞선 팀 최소 18초(샷클락 상한 뒤라 공격 리바운드 후 14초를
 *  넘김)·무작위 ±1.5초도 상한 뒤라 리셋 샷클락을 1초 초과(경기당 ~2.8회).
 */
export function calculatePossessionTime(
    state: GameState,
    sliders: TacticalSliders,
    playType?: PlayType
): number {
    const { gameClock, shotClock } = state;
    const C = SIM_CONFIG.CLOCK_MGMT;
    const randIn = ([lo, hi]: readonly [number, number]) => lo + Math.random() * (hi - lo);
    state.clockMode = undefined;   // [2026-11-05] 적용된 상황 규칙 — 아래 분기에서 설정, liveEngine이 PBP 안내 줄로 사용

    // Putback: 리바운더의 즉시 슛
    if (playType === 'Putback') {
        const [lo, hi] = C.PUTBACK_TIME;
        return Math.max(1, Math.min(gameClock, lo + Math.floor(Math.random() * (hi - lo + 1))));
    }

    // 1. 기본 시간 — 페이스 압축(POSSESSION_TIME) + 플레이타입
    const ptCfg = SIM_CONFIG.POSSESSION_TIME;
    const pace = sliders.pace;
    const compressedPace = ptCfg.PACE_NEUTRAL + (pace - ptCfg.PACE_NEUTRAL) * ptCfg.PACE_COMPRESSION;
    let timeTaken = ptCfg.BASE - compressedPace;

    if (playType === 'Transition') {
        timeTaken -= 5;
    } else if (playType === 'PostUp' || playType === 'Iso') {
        timeTaken += 2;
    } else if (playType === 'CatchShoot' || playType === 'Cut') {
        timeTaken -= 1;
    }

    // ⑥ 공격 리바운드 후 리셋 공격 — 수비가 아직 정돈되기 전이라 짧게(NBA: 공격 리바운드 후 다음 슛까지 평균 3.4초, 풋백 포함).
    //    타임아웃 등 세트 인바운드로 재개되면(state.inbound) 일반 하프코트 공격.
    const isOrebReset = state.lastEntryWasOffReb === true && !state.inbound;
    if (isOrebReset) timeTaken *= C.OREB_RESET_SCALE;
    // 마지막 2분 타임아웃 후 프런트코트 전진 — 공을 넘기는 시간 생략(SIM_CONFIG.TIMEOUT_ADVANCE)
    if (state.inbound?.advanced) timeTaken -= SIM_CONFIG.TIMEOUT_ADVANCE.TIME_SAVED;

    const floor = playType === 'Transition' ? 4 : isOrebReset ? C.OREB_RESET_FLOOR : 8;
    if (timeTaken < floor) timeTaken = floor;

    timeTaken += (Math.random() * 3) - 1.5;

    // 2. 상황 규칙
    const sd = state.home.score - state.away.score;
    const lead = state.possession === 'home' ? sd : -sd;      // 공격 팀 기준 점수 차
    const late = state.quarter >= 4;                          // 4쿼터·연장
    const clockOff = gameClock <= shotClock;                  // 남은 경기 시간 ≤ 샷클락 → 샷클락 꺼짐
    const hurry = late && -lead <= C.HURRY.MAX_MARGIN
        && C.HURRY.TIERS.some(tier => gameClock <= tier.clock && -lead >= tier.margin);
    const milk = late && gameClock <= C.MILK.CLOCK && lead >= 1 && lead <= C.MILK.MAX_LEAD;
    const milkMax = milk && gameClock <= C.MILK.LAST_CLOCK;   // [2026-11-05] 2분 이내 리드 = 시간 최대한 소모 (server 미러 참조)

    if (hurry) {
        // ④ 지는 팀 — 여러 번 공격해야 하므로 빠르게
        timeTaken = Math.min(timeTaken, randIn(C.HURRY.TIME));
        if (-lead >= C.HURRY.MULTI_POSSESSION_DEFICIT) timeTaken = Math.min(timeTaken, Math.max(1, gameClock * C.HURRY.MULTI_POSSESSION_SHARE));   // [2026-11-05] 파울 작전 연계
        state.clockMode = 'hurry';
    } else if (clockOff && !(late && -lead > C.HURRY.MAX_MARGIN)) {   // 4Q 크게 뒤진 팀(승부 기욺)은 홀드 없이 평소대로
        // ① 마지막 공격 — 끝까지 들고 있다가 마지막 슛(4Q 1~3점 뒤지면 팁인·파울 여유를 조금 남김)
        //    4Q·연장에 앞선 팀은 여기 오지 않는다 — liveEngine이 드리블 아웃(clockExpire)으로 처리
        const left = late && lead < 0 ? C.LAST_SHOT_LEFT_TRAILING_CLOSE : C.LAST_SHOT_LEFT;
        timeTaken = gameClock - randIn(left);
        if (gameClock >= C.LAST_SHOT_LOG_MIN) state.clockMode = 'lastShot';
    } else if (gameClock < C.FULL_CLOCK_WINDOW) {
        // ② 샷클락을 다 쓰면 상대에게 짧은 마지막 공격만 남는 구간 — 샷클락 끝까지
        timeTaken = shotClock - randIn(milkMax ? C.MILK.LAST_LEFT_ON_SHOT_CLOCK : C.FULL_CLOCK_LEFT);
        state.clockMode = milkMax ? 'milkMax' : milk ? 'milk' : 'fullClock';
    } else if (milk) {
        // ⑤ 앞선 팀 — 샷클락을 거의 다 쓴다(5분 이내 2~5초 남김, 리셋된 14초면 9~12초). 2분 이내는 0.5~2초 남김(최대 소모)
        timeTaken = Math.max(timeTaken, shotClock - randIn(milkMax ? C.MILK.LAST_LEFT_ON_SHOT_CLOCK : C.MILK.LEFT_ON_SHOT_CLOCK));
        state.clockMode = milkMax ? 'milkMax' : 'milk';
    } else if (gameClock <= C.TWO_FOR_ONE.MAX_CLOCK) {
        // ③ 2-for-1 — 30~33초에 슛해 상대 공격 뒤 한 번 더 공격
        const twoForOne = Math.max(3, gameClock - randIn(C.TWO_FOR_ONE.TARGET_LEFT));
        if (twoForOne < timeTaken) { timeTaken = twoForOne; state.clockMode = 'twoForOne'; }   // 평소보다 서두를 때만 안내
    }

    // 3. 샷클락 상한은 맨 마지막(이전엔 클러치 하한·무작위 변동이 상한 뒤에 붙어 샷클락을 넘겼다)
    const ceiling = Math.min(23, shotClock);
    if (timeTaken > ceiling) timeTaken = ceiling;
    if (timeTaken < 1) timeTaken = 1;
    if (timeTaken > gameClock) timeTaken = gameClock;

    return Math.round(timeTaken);
}

export function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
