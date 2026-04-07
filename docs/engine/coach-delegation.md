# 코치 위임 시스템 (Coach Delegation)

> **구현 파일**:
> - `services/game/engine/pbp/pbpTypes.ts` — `GameState.isUserDelegated`
> - `services/game/engine/pbp/liveEngine.ts` — `checkAITimeout` 가드
> - `hooks/useLiveGame.ts` — `delegateToCoach()`, `takeBackControl()`, `applyCoachTactics()`
> - `views/LiveGameView.tsx` — 위임 토글 버튼 + 카운트다운 단축
> - `components/game/tabs/LiveTacticsTab.tsx` — `disabled` prop

---

## 1. 개요

라이브 경기 진행 중 유저가 헤드코치에게 경기 운영을 전면 위임하는 기능.
위임 중에는 코치가 전술, 타임아웃, 교체를 자동으로 결정하며, 유저는 언제든 회수할 수 있다.

**목표**: 경기 중 유저 결정 피로도 경감 + 코치 시스템의 실질적 활용

---

## 2. 위임 범위

| 항목 | 위임 전 (유저 직접) | 위임 후 (코치 자동) |
|---|---|---|
| 전술 슬라이더 13개 | 유저가 실시간 조정 | 코치 성향 40% blending, 읽기 전용 |
| 타임아웃 호출 | 유저가 수동 | 모멘텀 8점 런 시 AI 자동 발동 |
| 수동 선수 교체 | 드래그&드롭 | 비활성화 (드래그 불가) |
| 로테이션 맵 편집 | pause 중 가능 | readOnly 잠금 |
| 경기 속도 / skip | 유저 직접 | 변경 없음 (메타 컨트롤이므로) |
| 자동 교체 (부상/파울/탈진) | 이미 자동 | 동일 (기존 substitutionSystem 작동) |
| pause 자동 resume | 30초 후 | **5초 후** (빠른 진행) |

---

## 3. 전술 적용 메커니즘

### 3-1. 위임 시작 시점

```ts
// hooks/useLiveGame.ts — delegateToCoach()
delegationBaseSlidersRef.current = { ...userTeam.tactics.sliders }; // 현재 슬라이더 스냅샷
state.isUserDelegated = true;
applyCoachTacticsRef.current(); // 즉시 1회 적용
```

### 3-2. applyCoachTactics — 코치 성향 blending

`tacticGenerator.ts`의 `blendWithCoach()`와 동일한 로직을 인라인으로 적용.
**기준값**: 위임 시작 시점의 슬라이더 (`delegationBaseSlidersRef.current`).
**코치 영향**: 40% (`W = 0.4`). 재평가 시에도 항상 기준값 기준으로 lerp → 누적 표류 없음.

```ts
const lerp = (a: number, b: number) => clamp(Math.round(a * (1 - W) + b * W));

userTeam.tactics.sliders = {
    ...base,
    playStyle:      lerp(base.playStyle,      coachPrefs.offenseIdentity),
    ballMovement:   lerp(base.ballMovement,   coachPrefs.offenseIdentity),
    pace:           lerp(base.pace,           coachPrefs.tempo),
    offReb:         lerp(base.offReb,         11 - coachPrefs.tempo),
    insideOut:      lerp(base.insideOut,      coachPrefs.scoringFocus),
    shot_3pt:       lerp(base.shot_3pt,       coachPrefs.scoringFocus),
    shot_rim:       lerp(base.shot_rim,       11 - coachPrefs.scoringFocus),
    pnrFreq:        lerp(base.pnrFreq,        coachPrefs.pnrEmphasis),
    defIntensity:   lerp(base.defIntensity,   coachPrefs.defenseStyle),
    fullCourtPress: lerp(base.fullCourtPress, coachPrefs.defenseStyle),
    helpDef:        lerp(base.helpDef,        coachPrefs.helpScheme),
    switchFreq:     lerp(base.switchFreq,     coachPrefs.helpScheme),
    zoneFreq:       lerp(base.zoneFreq,       coachPrefs.zonePreference),
    zoneUsage:      lerp(base.zoneUsage,      coachPrefs.zonePreference),
    // shot_mid, defReb, pnrDefense: 코치 선호 무관, 기준값 그대로
};
```

**HeadCoachPreferences → TacticalSliders 매핑**:

| HeadCoachPreferences (1-10) | TacticalSliders 대상 |
|---|---|
| `offenseIdentity` | `playStyle`, `ballMovement` |
| `tempo` | `pace`, `offReb` (역방향) |
| `scoringFocus` | `insideOut`, `shot_3pt`, `shot_rim` (역방향) |
| `pnrEmphasis` | `pnrFreq` |
| `defenseStyle` | `defIntensity`, `fullCourtPress` |
| `helpScheme` | `helpDef`, `switchFreq` |
| `zonePreference` | `zoneFreq`, `zoneUsage` |

### 3-3. 재평가 시점

위임 중 쿼터 종료 / 하프타임 pause 진입 시 `applyCoachTactics()` 자동 호출.
경기 상황(점수차, 체력) 변화를 다음 쿼터에 자연스럽게 반영.

```ts
// hooks/useLiveGame.ts — startInterval 내부
if (step.isQuarterEnd) {
    // ...
    if (state.isUserDelegated) {
        applyCoachTacticsRef.current(); // 위임 중이면 재평가
    }
    syncDisplay();
}
```

> `applyCoachTacticsRef`를 사용하는 이유: `startInterval`은 마운트 시 빈 deps로 고정되므로, `applyCoachTactics` 함수를 ref에 동기화해 stale closure 문제를 방지한다.

---

## 4. AI 타임아웃 활성화

### 기존 가드 (위임 비활성 시)

```ts
// services/game/engine/pbp/liveEngine.ts — checkAITimeout()
if (state.userTeamId && victimTeam.id === state.userTeamId && !state.isUserDelegated) return null;
```

- 위임 비활성: 유저 팀이 런을 당해도 AI 타임아웃 스킵 (유저가 직접 판단)
- **위임 활성**: `isUserDelegated = true` → 가드 통과 → 모멘텀 8점 런 시 AI가 자동 타임아웃 발동

### AI 타임아웃 트리거 조건

```ts
// 상대 팀이 8점 이상의 연속 득점을 기록 중이고, 잔여 타임아웃이 있을 때
if (runEpochPts - victimEpochPts >= 8 && victimTeam.timeouts > 0) {
    // → applyTimeout(state, victimTeam.id, false) 호출
}
```

---

## 5. 유저 액션 가드

위임 중에는 4개 직접 조작 함수가 모두 early return:

```ts
// hooks/useLiveGame.ts
const callTimeout = useCallback(() => {
    if (!userTeamId) return; // spectate mode
    if (state.isUserDelegated) return; // 위임 중
    // ...
}, [...]);

// applyTactics, applyRotationMap, makeSubstitution — 동일 패턴
```

UI 레벨에서도 이중 차단:
- 타임아웃 버튼: `disabled={... || isDelegated}`
- OnCourtPanel: `isUser={... && !isDelegated}` → 드래그 불가
- RotationGanttChart: `readOnly={!canEditRotation || isDelegated}`
- LiveTacticsTab: `disabled={isDelegated}` → `pointer-events-none`

---

## 6. Pause 카운트다운 단축

```ts
// views/LiveGameView.tsx
const PAUSE_COUNTDOWN_SEC = isDelegated ? 5 : 30;
```

- 위임 중 타임아웃/쿼터엔드/하프타임 pause → 5초 후 자동 resume
- 위임 해제 후 동일 pause 상태 → 30초로 즉시 갱신 (`isDelegated` deps 연결)

---

## 7. 상태 구조

### GameState (엔진 레벨)
```ts
// services/game/engine/pbp/pbpTypes.ts
interface GameState {
    // ...
    isUserDelegated: boolean; // 초기값 false
}
```

엔진 내부에서 직접 mutate → 다음 포세션부터 즉시 반영. `createGameState()`에서 `false`로 초기화.

### useLiveGame (훅 레벨)

```ts
// hooks/useLiveGame.ts
const [isDelegated, setIsDelegated] = useState(false);
const delegationBaseSlidersRef = useRef<GameTactics['sliders'] | null>(null);
const applyCoachTacticsRef = useRef<() => void>(() => {});
```

- `isDelegated` React state → UI 리렌더 트리거
- `delegationBaseSlidersRef` — 위임 시작 시점 슬라이더 스냅샷 (재평가 기준값)
- `applyCoachTacticsRef` — stale closure 방지용 최신 함수 참조

### 반환 인터페이스

```ts
interface UseLiveGameReturn {
    // ...
    isDelegated: boolean;      // UI 상태 표시용
    canDelegate: boolean;      // coachPrefs 존재 여부 (버튼 렌더 조건)
    delegateToCoach: () => void;
    takeBackControl: () => void;
}
```

---

## 8. 회수 (takeBackControl)

```ts
const takeBackControl = useCallback(() => {
    state.isUserDelegated = false;
    setIsDelegated(false);
    // PBP 로그: "직접 지휘로 복귀"
    syncDisplay();
}, [userTeamId, syncDisplay]);
```

- 회수 시: `isDelegated = false` 토글만. 코치가 적용한 슬라이더는 그대로 유지
- 유저는 코치가 만든 슬라이더에서 이어받아 자유롭게 편집 가능
- `saves.tactics` 영속화 없음 (라이브 경기 중 `applyTactics` 전체가 엔진 in-place only)

---

## 9. 코치 미보유 팀 처리

```ts
// components/ProtectedLayout.tsx
const userCoachPrefs =
    gameData.myTeamId
        ? gameData.coachingData?.[gameData.myTeamId]?.headCoach?.preferences ?? null
        : null;

// hooks/useLiveGame.ts
canDelegate: !!coachPrefs  // false이면 버튼 렌더 안 됨
```

- `headCoach`가 null이거나 prefs가 없으면 위임 버튼 자체가 렌더되지 않음
- `delegateToCoach()` 내부에도 `if (!coachPrefs) return` 가드 존재

---

## 10. UI 구성

```
[툴바]
경기 종료까지 ▶▶  |  [코치 위임] ← 토글 버튼  |  타임아웃 (N)  |  [속도 버튼]

[전술 탭 — 위임 중]
┌─────────────────────────────────────────────────────────────────┐
│ ⚠ 코치 지휘 중 — 전술 변경이 잠겨 있습니다                         │
├─────────────────────────────────────────────────────────────────┤
│ [슬라이더 그리드 — opacity 60%, pointer-events-none]             │
└─────────────────────────────────────────────────────────────────┘
```

- 위임 버튼은 유저팀 쪽 툴바에만 표시 (`canDelegate && !isSpectateMode`)
- 위임 중: `bg-emerald-700` (초록), 해제 상태: `bg-slate-700` (회색)
- PBP 로그에 "코치가 전술을 조정했습니다" (쿼터별) + "직접 지휘로 복귀" 기록

---

## 11. 관련 문서

- [tactic-system.md](tactic-system.md) — `generateAutoTactics`, `blendWithCoach` 상세
- [rotation-algorithm.md](rotation-algorithm.md) — 자동 교체 시스템 (위임 중 그대로 동작)
- [momentum-system.md](momentum-system.md) — AI 타임아웃 트리거 (8점 런 조건)
- [../simulation/coaching-staff-system.md](../simulation/coaching-staff-system.md) — `HeadCoachPreferences` 7개 슬라이더 정의
