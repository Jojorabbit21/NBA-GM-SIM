# 개인 전술 시스템 (Player Tactics)

> 관련 파일:
> - `types/tactics.ts` — `PlayerTacticConfig`, `GameTactics.playerTactics`
> - `services/game/engine/pbp/substitutionSystem.ts` — 엔진 소비 지점
> - `services/game/engine/pbp/rotationLogic.ts` — `checkTemporaryReturns` 복귀 임계치
> - `components/dashboard/tactics/PlayerTacticsPanel.tsx` — UI
> - `components/dashboard/TacticsBoard.tsx` — 탭 진입점

---

## 개요

**개인 전술**은 선수 단위로 교체·기용 의사결정을 덮어쓰는 기능이다. 팀 단위 슬라이더로 제어할 수 없는 개별 선수의 체력 관리, 파울 리스크, 가비지타임 출전 여부, 클러치 상황 기용 방침을 GM이 직접 지정한다.

설정은 `GameTactics.playerTactics: Record<string, PlayerTacticConfig>` 맵에 저장되며, `saves.tactics` JSONB 단일 컬럼에 나머지 전술 데이터와 함께 직렬화된다. 미설정 선수는 기존 엔진 기본값(하드코딩 상수)으로 동작한다.

---

## 타입 정의

```ts
// types/tactics.ts

export type FoulTroublePolicy = 'auto' | 'ignore';
export type GarbageTimePolicy = 'auto' | 'play' | 'bench';
export type ClutchPolicy      = 'auto' | 'must-play' | 'must-bench';

export interface PlayerTacticConfig {
    restThreshold?:   number;              // 0~80 (%). 0=비활성. 이 값 이하 체력에서 자동 임시 벤치
    returnThreshold?: number;              // 50~95 (%). 기본 70. 임시 벤치 후 복귀 임계치
    foulPolicy?:      FoulTroublePolicy;   // 파울 트러블 처리 방식
    garbagePolicy?:   GarbageTimePolicy;   // 가비지타임 출전 여부
    clutchPolicy?:    ClutchPolicy;        // Q4 마지막 6분 기용 방침
}

export interface GameTactics {
    // ... 기존 필드
    playerTactics?: Record<string, PlayerTacticConfig>;
}
```

---

## 4가지 개인 전술 상세

### (A) 체력 기반 자동 휴식 — `restThreshold` / `returnThreshold`

**작동 방식**

`checkSubstitutionsV2()` Priority 2 블록 내부:

```
effectiveFloor = max(HARD_FLOOR=20, restThreshold)
if currentCondition <= effectiveFloor → isShutdown = true, exitType='temporary'
```

- `restThreshold=0` (기본): 기존 `HARD_FLOOR=20`만 작동 (탈진 셧다운)
- `restThreshold=40`: 체력 40% 이하에서 임시 벤치 시작
- `HARD_FLOOR=20`는 절대 최솟값이므로 0으로 설정해도 탈진 셧다운은 그대로 동작

**복귀 조건**

`checkTemporaryReturns()` shutdown 분기:

```
returnThreshold = playerConfig?.returnThreshold ?? 70
if !isShutdown && currentCondition > returnThreshold → 복귀
```

- 기본값 70은 기존 하드코딩 상수와 동일 → 미설정 선수 동작 불변
- 설정 선수만 개별 복귀 임계치가 적용됨

**자동 복귀 메커니즘**

임시 벤치는 `benchWithOverride`가 처리 → `originalRotationMap`에 원본 맵 보존 → 체력 회복 후 원본 맵 복원 → `checkAndApplyRotation`이 다음 포세션에 자동 투입. 48분 로테이션 스케줄과 충돌하지 않음.

---

### (B) 파울 트러블 무시 — `foulPolicy`

| 값 | 동작 |
|----|------|
| `'auto'` | 기본 파울 트러블 매트릭스 적용 (Q/파울수/중요도별 벤치 결정) |
| `'ignore'` | 파울 트러블 매트릭스 스킵. 파울이 몇 개 쌓여도 벤치 안 보냄 |

**구현 위치**: `substitutionSystem.ts` Priority 3:

```ts
const ignoreFoul = playerConfig?.foulPolicy === 'ignore';
if (!isScheduled && !ignoreFoul) { evaluateFoulTroubleAction(...) }
```

> **주의**: 6파울 퇴장은 Priority 1에서 처리되므로 `ignore`를 설정해도 항상 적용됨. `ignore`는 5파울 이하의 파울 트러블 벤치 결정만 무력화한다.

---

### (C) 가비지타임 정책 — `garbagePolicy`

가비지타임 기준: `Q4 && gameClock < 150초(2:30) && 점수차 >= 15`

| 값 | 동작 |
|----|------|
| `'auto'` | 기본 동작 — 가비지 트리거 시 코트 전원 교체 |
| `'play'` | **가비지타임 멤버** — 가비지 일괄 교체 대상에서 제외, 코트에 잔류 |
| `'bench'` | **가비지타임 미출전** — Q4에서 점수차 15점 이상이면 트리거보다 일찍 즉시 교체 |

**`play` 구현**: 가비지 일괄 교체 filter에서 제외

```ts
return cfg?.garbagePolicy !== 'play';
```

**`bench` 구현**: 별도 분기 — Q4 + 점수차 >= 15 이면 즉시 교체 요청 (시간 무관)

```ts
if (cfg?.garbagePolicy === 'bench' && state.quarter >= 4 && scoreDiff >= 15) {
    requests.push({ exitType: 'permanent', benchReason: 'garbage', ... });
}
```

> 'bench'는 표준 가비지 트리거(2:30)보다 일찍 동작한다. 15점차가 되는 순간 Q4면 자동 교체됨.

---

### (D) 클러치 기용 정책 — `clutchPolicy`

클러치 구간: `Q4 && currentMinute >= 42` (= 남은 시간 6분 이내)

| 값 | 동작 |
|----|------|
| `'auto'` | 기본 동작 — 로테이션 맵 스케줄대로 |
| `'must-play'` | 클러치 구간에 벤치에 있으면 rotationMap 42~47분을 true로 설정 → 다음 포세션 자동 투입 |
| `'must-bench'` | 클러치 구간에 코트에 있으면 영구 교체 요청 |

**처리 순서**: `checkSubstitutionsV2()` 진입 직후 (가비지 판정보다 앞선 Priority 0)

**`must-play` 상세**:
1. `tactics.rotationMap[playerId][i] = true` (i: currentMinute~47)
2. OVR 가장 낮은 비-must-play 코트 위 선수의 슬롯 해제 (스왑 준비)
3. `checkAndApplyRotation`이 다음 포세션에 맵 기반으로 실제 투입 처리

> `originalRotationMap`은 건드리지 않으므로 다음 경기 시작 시 `initTeamState`의 deep-clone으로 영향이 초기화됨.

**`must-bench` 상세**: `benchReason: 'garbage'` 로 처리 (기존 영구 교체 코드 재사용). 교체된 선수는 벤치에서 대기하며 복귀하지 않음.

**충돌 처리**: must-play 대상자가 6명 이상이면 OVR 낮은 순으로 스왑 대상 선택. 5명 코트 제한은 `checkAndApplyRotation`이 보장.

---

## 설정 저장/로드 경로

```
[UI 변경] PlayerTacticsPanel.updateConfig()
    ↓
onUpdateTactics({ ...tactics, playerTactics: next })
    ↓ (디바운스 자동저장)
persistence.ts saveCheckpoint()
    ↓
saves.tactics JSONB (전체 GameTactics 직렬화)
```

**로드 시**: `hooks/useGameData.ts` tactics 로드 블록에서 `playerTactics ?? {}`로 빈 맵 보장 → 기존 세이브와 100% 호환.

**엔진 주입**: `initializer.ts initTeamState()`에서 `safeTactics` deep-clone 시 `playerTactics`가 자동으로 `TeamState.tactics`에 포함됨. 별도 주입 코드 불필요.

---

## UI 구조

전술 화면(`TacticsBoard.tsx`) → 탭 "개인 전술" → `PlayerTacticsPanel.tsx`

```
┌─ 팀 전술 │ 개인 전술 ─────────────────────────────────────────────────────┐
│ [스타 보호 프리셋]  [전원 초기화]                                            │
├────────┬──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│ 선수   │ 휴식임계치│ 복귀임계치│ 파울정책 │ 가비지타임│ 클러치 정책         │
├────────┴──────────┴──────────┴──────────┴──────────┴─────────────────────┤
│ PG                                                                        │
│  L.Doncic 96 │ [35]% │ [70]% │ [파울 무시 ▾] │ [미출전 ▾] │ [필수 투입 ▾]│
│  ...                                                                      │
│ SG                                                                        │
│  ...                                                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

- **number input**: 휴식 임계치(0~80, step=5), 복귀 임계치(50~95, step=5)
- **select**: 파울 정책(자동/파울 무시), 가비지타임(자동/출전/미출전), 클러치 정책(자동/필수 투입/필수 벤치)
- 기본값이 아닌 설정은 인디고 테두리로 강조
- 선수 그룹: `tactics.depthChart` 기반 PG/SG/SF/PF/C/RES 포지션 섹션

**스타 보호 프리셋** (OVR 85+에 일괄 적용):
- `restThreshold=35`, `returnThreshold=70`, `foulPolicy='ignore'`, `garbagePolicy='bench'`, `clutchPolicy='must-play'`

---

## 기본값 정리

| 필드 | 기본값 | 엔진 상수/동작 |
|------|--------|--------------|
| `restThreshold` | 0 (비활성) | `HARD_FLOOR=20`만 작동 |
| `returnThreshold` | 70 | 기존 하드코딩 상수와 동일 |
| `foulPolicy` | `'auto'` | 파울 트러블 매트릭스 정상 적용 |
| `garbagePolicy` | `'auto'` | 가비지 트리거 시 일괄 교체 |
| `clutchPolicy` | `'auto'` | 로테이션 맵 스케줄대로 |

모든 필드가 기본값이면 `playerTactics` 맵에서 해당 선수 키가 자동으로 삭제됨 (저장 용량 절약).

---

## 주의사항

- **가비지 `play`(출전)는 "주전 보호"가 아님**: 점수가 크게 벌어져도 코트에 남는다 → 부상 위험. 주전을 빨리 빼고 싶다면 `bench`(미출전)를 사용할 것.
- **클러치 `must-play` 중복**: 6명 이상이 must-play면 OVR 낮은 순 스왑 대상 선택. 정확히 5명을 투입하려면 must-play 선수가 5명 이하여야 함.
- **CPU 팀**: `playerTactics` 미설정 → 빈 맵 → 엔진 기본값 동작, CPU 동작 변화 없음.
