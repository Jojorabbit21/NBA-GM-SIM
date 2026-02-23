# 실시간 PBP (Live Game Mode) 아키텍처

> 작성 기준: 2026-02 플랜 세션 확정본

---

## 개요

현재 시뮬레이션은 배치(Batch) 방식으로 4쿼터 전체를 즉시 연산하고 재생만 한다.
**Live Game Mode**는 유저가 타임아웃/쿼터 휴식 중 전술을 변경하거나 선수를 교체하면
이후 PBP에 즉시 반영되는 인터랙티브 경기 모드다.

설계의 핵심 원칙: **추후 서버사이드 멀티플레이어 전환을 전제**로 한다.
클라이언트 로컬 연산 → WebSocket/SSE 스트림으로 데이터 소스만 교체 시 hook 인터페이스 불변.

---

## 현재 vs 목표 아키텍처

```
[현재 - Batch]
handleExecuteSim()
  └→ runFullGameSimulation()        ← 동기적, 4쿼터 전체 한 번에
       └→ SimulationResult(pbpLogs[])
            └→ GameSimulatingView   ← 타이머로 index++ 재생만 (개입 불가)

[목표 - Live]
handleStartLiveGame()
  └→ createGameState(...)           ← GameState 초기화만
       └→ useLiveGame hook          ← setInterval로 possession씩 step
            ├─ displayState (React state) ← 점수/쿼터/최근 PBP/런
            ├─ [Quarter End/Halftime] → auto-pause → 전술 편집 모달
            ├─ [Timeout 버튼] → pause + 모멘텀 초기화
            └─ [resume()] → 변경된 GameState로 다음 포세션부터 반영
```

**CPU 경기**: 기존 `runFullGameSimulation()` 유지 — 변경 없음.
**유저 경기**: 새 Live 모드로 진행.

---

## 레이어별 설계

### Layer 1: Engine — `services/game/engine/pbp/liveEngine.ts` (신규)

`main.ts`의 게임 루프 body를 분리해 단일 포세션 단위로 실행 가능하게 만든다.

```typescript
// ① GameState 초기화
export function createGameState(
    homeTeam: Team,
    awayTeam: Team,
    userTeamId: string | null,
    userTactics?: GameTactics,
    isHomeB2B?: boolean,
    isAwayB2B?: boolean,
    homeDepthChart?: DepthChart | null,
    awayDepthChart?: DepthChart | null
): GameState

// ② 포세션 1회 처리
// simulatePossession + applyPossessionResult + clock update + sub check + 쿼터 경계 모두 포함
export function stepPossession(state: GameState): StepResult

export interface StepResult {
    result: PossessionResult;
    isQuarterEnd: boolean;   // gameClock이 0에 도달
    isGameEnd: boolean;      // quarter > 4
    newLogs: PbpLog[];       // 이번 step에서 생성된 로그들
}

// ③ 최종 결과 추출
export function extractSimResult(state: GameState): SimulationResult
```

`main.ts`는 `createGameState` + `stepPossession` 루프로 재구성. 외부 API 불변 → CPU 경기 코드 무변경.

---

### Layer 2: Hook — `hooks/useLiveGame.ts` (신규)

`GameState`를 `useRef`로 보유 (리렌더링 방지). 디스플레이용 요약 state만 `useState`로 관리.

```typescript
export interface LiveDisplayState {
    homeScore: number;
    awayScore: number;
    quarter: number;
    gameClock: number;           // seconds
    recentLogs: PbpLog[];
    pauseReason: PauseReason | null;
    isGameEnd: boolean;
    timeoutsLeft: { home: number; away: number };
    // 모멘텀 런 (null = 런 없음 또는 diff < 6)
    activeRun: {
        teamId: string;
        teamPts: number;       // 런 팀의 에포크 득점
        oppPts: number;        // 상대 팀의 에포크 득점
        durationSec: number;   // 런 선언(diff≥8) 이후 경과 초
    } | null;
}

export type PauseReason = 'timeout' | 'quarterEnd' | 'halftime' | 'gameEnd';

export interface UseLiveGameReturn {
    displayState: LiveDisplayState;
    callTimeout: () => void;                                    // 타임아웃 + 모멘텀 초기화
    applyTactics: (t: TacticalSliders) => void;                 // 슬라이더만 교체 (rotationMap 보존)
    makeSubstitution: (outId: string, inId: string) => void;    // 다음 포세션 반영
    resume: () => void;
    getResult: () => SimulationResult | null;
    userOnCourt: LivePlayer[];
    userBench: LivePlayer[];
}
```

**핵심 로직**:
- `intervalRef`로 setInterval 관리 (pause → clearInterval, resume → setInterval)
- `stepPossession(gameStateRef.current)` → `StepResult` 수신
- `isQuarterEnd` / `isGameEnd` 시 interval 중단, `pauseReason` set
- 타임아웃 시: interval 중단 + 타임아웃 카운트 차감 + `resetMomentum()` 호출

**속도**: 기본 600ms/possession (1x/2x/4x 토글)

---

### Layer 3: View — `views/LiveGameView.tsx` (신규)

#### 헤더 (항상 고정, 2행)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Away Logo] BOS  74    05:42    78  LAL [Home Logo]              [⏸ 타임아웃] │
│       TO:●●○○  파울:3   🔥BOS 12-4 · 1:23   1Q   파울:2  TO:●●●○  [2x▸]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ [탭] Box Score │ Rotation Map │ Tactics Sliders                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **1행**: `[원정로고] 원정명 원정점수 — 시계 — 홈점수 홈명 [홈로고]` + `[타임아웃][속도]`
- **2행**: 원정(TO/파울) — **런 인디케이터** — 쿼터 — 홈(파울/TO)
  - 런 인디케이터: `diff ≥ 6` 시 `🔥 BOS 10-4`, `diff ≥ 8` 시 `🔥 BOS 10-4 · 1:23` 추가
- **탭**: Box Score (MIN/PTS/REB/AST/STL/BLK/TOV/FG/3P/FT/+/-) / Rotation Map / Tactics Sliders

#### 바디 레이아웃 (3컬럼)

```
┌──────────────────┬────────────────────────────┬──────────────────┐
│ LEFT (25%)        │ CENTER (50%)                │ RIGHT (25%)       │
│ Away OnCourt      │ Shot Chart (상단)            │ Home OnCourt      │
│ 5명 카드           │  반코트 SVG + 성공●/실패○    │ 5명 카드           │
│ 포지션/이름        │  호버 → PBP 툴팁            │ 포지션/이름        │
│ OVR/체력/파울     │─────────────────────────────│ OVR/체력/파울     │
│ [교체 UI]         │ PBP Log (하단)              │ (관람 전용)        │
│  (유저팀만)        │  전체 누적, 최신 상단 표시   │                   │
└──────────────────┴────────────────────────────┴──────────────────┘
```

- Shot Chart: `state.shotEvents[]`의 실제 x/y 좌표 사용 (`courtCoordinates.ts` 기준 NBA 피트 단위)
- PBP Log: `state.logs` 전체 누적 / 로그 타입별 색상 (score=emerald, turnover=red, foul=amber, info=slate-400)
- On Court 교체 버튼: **항상 활성화** (경기 중 → 다음 포세션 적용, 타임아웃 중 → 즉시 적용)

#### 전술 변경 권한 요약

| 기능 | 경기 중 | 타임아웃 | 쿼터 사이/하프타임 |
|-----|:---:|:---:|:---:|
| Sliders 수정 | ✓ | ✓ | ✓ |
| 선수 교체 | ✓ (다음 possession) | ✓ | ✓ |
| Rotation Map 편집 | ✗ | ✗ | ✓ |
| 경기 일시정지 | ✗ | ✓ | ✓ (자동) |
| 모멘텀 초기화 | ✗ | ✓ | ✗ |

**타임아웃 고유 가치**: 경기 일시정지 + 모멘텀 완전 초기화 (상대 런 차단).
선수 교체/슬라이더는 경기 중에도 가능하므로 타임아웃의 핵심은 "흐름 끊기".

---

### Layer 4: 라우팅 통합

- `hooks/useSimulation.ts`: `handleStartLiveGame()` 추가 → `view = 'LiveGame'`
- `components/AppRouter.tsx`: `view === 'LiveGame'` → `<LiveGameView>` 라우트 추가
- CPU 경기(`handleExecuteSim()`) → 기존 배치 재생 유지

---

## 전술 변경 메커니즘

### 슬라이더 수정 (applyTactics)

**rotationMap 보존 필수** — `team.tactics = newTactics` 방식은 rotationMap을 날리므로 금지:

```typescript
const applyTactics = (newSliders: TacticalSliders) => {
    const team = userTeamId === state.home.id ? state.home : state.away;
    team.tactics.sliders = newSliders;  // sliders만 교체
};
```

Rotation Map 편집: 쿼터 사이 / 하프타임에만 허용.

### 선수 수동 교체 (makeSubstitution) — transferSchedule 방식

`rotationLogic.ts`의 `transferSchedule()` 재사용:

```typescript
const makeSubstitution = (outId: string, inId: string) => {
    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const currentMinute   = Math.min(47, Math.floor(currentTotalSec / 60));
    const quarterEndMin   = state.quarter * 12; // Q1=12, Q2=24, Q3=36, Q4=48

    // 1. outPlayer 잔여 슬롯 → inPlayer 이전
    transferSchedule(userTeam, outId, inId, currentMinute);

    // 2. inPlayer의 현재~쿼터 끝을 강제 true
    for (let m = currentMinute; m < quarterEndMin; m++)
        userTeam.tactics.rotationMap![inId][m] = true;

    // 3. outPlayer의 현재~쿼터 끝 false
    for (let m = currentMinute; m < quarterEndMin; m++)
        userTeam.tactics.rotationMap![outId][m] = false;

    // 4. 물리적 교체: onCourt ↔ bench 스왑 + rotationHistory 기록
};
```

Player A(원래 그 시간 예약된 선수)의 슬롯은 유지 → `checkAndApplyRotation` OVR top5 컷으로 자연 경쟁.

---

## 모멘텀 런 시스템

### 개념

NBA 런(Run)의 정의: **특정 구간 동안 한 팀이 상대보다 월등히 많이 득점하는 현상**.
예: "BOS 14-4 RUN" = 현재 구간에서 BOS 14점, 상대 4점. 상대가 0점이 아니어도 런이 성립.

### 에포크(Epoch)

런 측정의 기준 시간 구간. 에포크 내 양 팀 누적 득점의 차이(diff)로 런 판정.

| 상태 | 조건 |
|-----|------|
| 런 표시 시작 | `diff ≥ 6` |
| 런 공식 선언 + 타이머 시작 | `diff ≥ 8` |
| 에포크 리셋 | 타임아웃 / 쿼터 경계 / diff 부호 역전(상대가 에포크 리드) |

```
에포크 예시 (Q3 8:00 시작):
  BOS +6, LAL 0  → diff=+6, 인디케이터 표시 "🔥 BOS 6-0"
  BOS +8, LAL 0  → diff=+8, 런 선언 "🔥 BOS 8-0 · 0:18"
  BOS +10, LAL 4 → diff=+6, 런 지속 "🔥 BOS 10-4 · 1:05"
  BOS +10, LAL 10→ diff=0,  에포크 리셋 → 새 에포크 시작
```

### GameState 필드

**파일**: `services/game/engine/pbp/pbpTypes.ts`

```typescript
// GameState에 추가
momentum: {
    homeEpochPts: number;
    awayEpochPts: number;
    epochStartTotalSec: number;
    activeRun: {
        teamId: string;
        startTotalSec: number;   // diff ≥ 8 달성 순간 (타이머 기준)
    } | null;
};
```

### updateMomentum()

**파일**: `services/game/engine/pbp/liveEngine.ts`

```typescript
function updateMomentum(state: GameState, scoringTeamId: string, points: number, currentTotalSec: number) {
    const m = state.momentum;
    if (scoringTeamId === state.home.id) m.homeEpochPts += points;
    else m.awayEpochPts += points;

    const diff = m.homeEpochPts - m.awayEpochPts;

    // 에포크 방향 역전 → 리셋
    if ((m.activeRun?.teamId === state.home.id && diff < 0) ||
        (m.activeRun?.teamId === state.away.id && diff > 0) ||
        diff === 0) {
        m.homeEpochPts = 0; m.awayEpochPts = 0;
        m.epochStartTotalSec = currentTotalSec;
        m.activeRun = null;
        return;
    }

    // 새 런 선언
    if (!m.activeRun) {
        if (diff >= 8)  m.activeRun = { teamId: state.home.id, startTotalSec: currentTotalSec };
        if (diff <= -8) m.activeRun = { teamId: state.away.id, startTotalSec: currentTotalSec };
    }
}

function resetMomentum(state: GameState, currentTotalSec: number) {
    state.momentum = { homeEpochPts: 0, awayEpochPts: 0, epochStartTotalSec: currentTotalSec, activeRun: null };
}
```

### getMomentumBonus()

**파일**: `services/game/engine/pbp/possessionHandler.ts`

```typescript
function getMomentumBonus(state: GameState, offTeamId: string): number {
    const m = state.momentum;
    if (!m.activeRun || m.activeRun.teamId !== offTeamId) return 0;

    const diff = offTeamId === state.home.id
        ? m.homeEpochPts - m.awayEpochPts
        : m.awayEpochPts - m.homeEpochPts;

    if (diff < 8)  return 0;
    if (diff < 12) return 0.015;  // +1.5%
    if (diff < 16) return 0.025;  // +2.5%
    return 0.035;                  // +3.5% (상한)
}
// calculateHitRate 호출 시: bonusHitRate: playType.bonusHitRate + getMomentumBonus(state, offTeam.id)
```

---

## 연장전 없음 — 버저비터 메커니즘

**원칙**: 경기는 반드시 4쿼터 안에 종료. 연장(OT) 없음.

### 동작 방식

Q4 `gameClock ≤ 0` 시점에 `homeScore === awayScore`이면 버저비터 포세션 실행:

1. **공격팀 랜덤 선택** (홈/원정 50%)
2. **hitRate 하한선 강제**: `hitRate = Math.max(calculatedHitRate, 0.75)` → 75% 확률로 득점
3. **득점 시** → PBP 로그에 일반 플레이처럼 표시 (`Q4 0:00` 타임스탬프) — 자연스러운 버저비터
4. **미스 시** (~25%) → silent +1pt 처리 (로그 없음) → 사용자에게는 1점 차 승리처럼 보임

시스템이 강제했다는 흔적 없음. 사용자 경험상 우연에 의한 결과처럼 보여야 함.

### 구현

**파일**: `services/game/engine/pbp/flowEngine.ts`

`calculateHitRate()`에 `minHitRate?: number` 옵션 파라미터 추가:
```typescript
// hitRate 최종 반환 직전:
if (options.minHitRate !== undefined) {
    hitRate = Math.max(hitRate, options.minHitRate);
}
```

**파일**: `services/game/engine/pbp/liveEngine.ts`

`stepPossession()` 내 Q4 종료 처리:
```typescript
if (state.quarter === 4 && state.gameClock <= 0) {
    if (state.home.score === state.away.score) {
        // 버저비터 포세션 실행
        const buzzOffTeam = Math.random() < 0.5 ? state.home : state.away;
        const buzzResult = simulatePossession(state, buzzOffTeam, { minHitRate: 0.75 });
        if (buzzResult.type === 'score') {
            applyPossessionResult(state, buzzResult); // 정상 PBP 로그 포함
        } else {
            // 미스 → silent +1pt (로그 없음)
            buzzOffTeam.score += 1;
        }
    }
    state.quarter = 5; // 게임 종료 마킹
    return { ..., isGameEnd: true };
}
```

---

## 서버사이드 전환 경로 (멀티플레이어)

| 현재 (클라이언트) | 멀티플레이어 전환 시 |
|-----------------|------------------------|
| `stepPossession(state)` 로컬 호출 | WebSocket `message` 이벤트로 `StepResult` 수신 |
| `applyTactics()` → `state.tactics.sliders` 직접 변이 | HTTP POST `/game/:id/tactics` |
| `makeSubstitution()` 로컬 처리 | HTTP POST `/game/:id/sub` |
| `useLiveGame` hook 내부만 변경 | UI (`LiveGameView`) 무변경 |

---

## 수정/신규 파일 목록

| 파일 | 타입 | 내용 |
|------|------|------|
| `services/game/engine/pbp/pbpTypes.ts` | 수정 | `GameState.momentum` 필드 추가 |
| `services/game/engine/pbp/liveEngine.ts` | **신규** | `createGameState`, `stepPossession`, `extractSimResult`, `updateMomentum`, `resetMomentum` |
| `services/game/engine/pbp/main.ts` | 수정 | liveEngine 재사용하도록 리팩토링 (API 불변) |
| `services/game/engine/pbp/possessionHandler.ts` | 수정 | `getMomentumBonus()` + bonusHitRate 합산 |
| `hooks/useLiveGame.ts` | **신규** | 실시간 경기 루프 훅 |
| `views/LiveGameView.tsx` | **신규** | 인터랙티브 경기 뷰 (헤더/바디/런 인디케이터) |
| `hooks/useSimulation.ts` | 수정 | `handleStartLiveGame()` 추가 |
| `components/AppRouter.tsx` | 수정 | `LiveGame` 라우트 추가 |

---

## 구현 순서

### Phase 1: Engine 분리
- `liveEngine.ts` 작성: `createGameState`, `stepPossession`, `extractSimResult`
- `pbpTypes.ts`: `GameState.momentum` 필드 추가
- `possessionHandler.ts`: `getMomentumBonus()` 추가
- `main.ts` 리팩토링 (기존 CPU 경기 API 유지)
- 검증: 기존 CPU 경기 시뮬레이션 정상 동작

### Phase 2: Hook
- `useLiveGame.ts` 작성
- 검증: console.log로 포세션별 로그 + 모멘텀 상태 확인

### Phase 3: View
- `LiveGameView.tsx` 작성 (헤더 + 3컬럼 바디 + 런 인디케이터)
- Pause Panel (타임아웃/쿼터 사이)
- 검증: 경기 중 전술 변경 → 다음 포세션 반영 / 런 인디케이터 동작

### Phase 4: 통합
- `useSimulation.ts`, `AppRouter.tsx` 수정
- 유저 경기 → LiveGameView / CPU 경기 → 기존 배치

---

## 검증 포인트

1. 타임아웃 선언 → `state.momentum` 즉시 초기화, 런 인디케이터 소멸
2. 상대 10-0 런 중 타임아웃 → 다음 포세션부터 보너스 없음
3. 선수 교체 (경기 중) → 다음 포세션 출장 로그 확인
4. 선수 교체 (타임아웃 중) → 즉시 OnCourt 변경 확인
5. 타임아웃 4회 소진 → 버튼 비활성화
6. 쿼터 경계 → Rotation Map 탭 잠금 해제
7. 경기 종료 → `extractSimResult()` → GameResultView 정상 전환
8. CPU 경기 → 기존 배치 방식 유지 (LiveGameView 미사용)
9. Q4 강제 동점 → 버저비터 포세션 발생 확인 + PBP 로그 자연스러움 확인 (연장 없음)
