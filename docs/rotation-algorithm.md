# 로테이션 알고리즘

> 관련 파일: `services/game/engine/pbp/rotationLogic.ts`, `liveEngine.ts`, `pbpTypes.ts`

## 개요

PBP 엔진의 로테이션 시스템은 **유저가 설정한 48분짜리 로테이션 맵**을 최우선으로 존중하되, 부상·퇴장·파울 트러블·탈진 등 예외 상황에서 자동으로 교체를 관리한다.

---

## 1. 로테이션 맵 (Rotation Map)

```
Record<string, boolean[]>   // playerId → 48개 boolean (분 단위)
```

- 각 선수에게 48개 슬롯(0분~47분)이 할당됨
- `true` = 해당 분에 코트 위에 있어야 함
- 유저가 로테이션 매트릭스 UI에서 토글로 직접 편집
- AI 팀은 `generateAutoTactics()`로 자동 생성 (주전 36분, 벤치 12분)

---

## 2. 매 포세션 파이프라인

`stepPossession()` (liveEngine.ts)에서 포세션 실행 후 4단계 순서로 교체를 처리한다.

```
포세션 실행
    ↓
① checkTemporaryReturns()     — 임시 벤치 선수 복귀 판정 → 맵 복원
    ↓
② checkAndApplyRotation()     — 정기 로테이션 (맵 기반 물리적 교체)
    ↓
③ checkSubstitutionsV2()      — 긴급 교체 감지 (4단계 우선순위)
    ↓
④ executeSubstitution()       — 교체 실행 (임시 vs 영구 분기)
```

이 순서가 중요하다:
- ①에서 맵을 복원해야 ②가 올바른 맵으로 교체를 결정
- ③은 ②가 끝난 후 코트 위 선수를 기준으로 긴급 상황 감지
- ④에서 임시/영구를 구분하여 처리

---

## 3. 정기 로테이션 (checkAndApplyRotation)

**로직**:
1. 현재 분(minute)에 `rotationMap[playerId][minute] === true`인 선수들을 수집
2. 출전 가능 조건: `health === 'Healthy'` && `pf < 6`
3. 5명이 안 되면 Fallback:
   - 1단계: 건강하고 탈진 아닌 선수 중 OVR 순
   - 2단계(비상): 탈진 선수라도 포함 (기권패 방지)
4. 5명 초과 시 OVR 순으로 5명 컷
5. 현재 코트 멤버와 비교 후 변경이 있으면 물리적 스왑 실행

---

## 4. 강제 교체 — 영구 퇴장 (forceSubstitution)

**트리거**: 부상, 6파울 퇴장

**승계 로직** (`applyRotationSuccession`):
- 뎁스 차트(PG/SG/SF/PF/C × [주전, 벤치, 써드])를 참조
- 아웃된 선수의 위치에 따라 하위 뎁스로 맵을 승계:
  - 주전 OUT → 벤치가 주전 맵 상속, 써드가 벤치 맵 상속
  - 벤치 OUT → 써드가 벤치 맵 상속
  - 써드 OUT → RES(로테이션 외) 선수가 맵 상속
- **아웃된 선수의 잔여 맵은 영구적으로 비워짐** (복귀 불가)

**대체자 탐색 우선순위** (`findResCandidate`):
1. 동일 포지션 우선
2. OVR 높은 순
3. 체력 높은 순
4. 기본적으로 탈진(Shutdown) 선수 제외, 비상시 포함

---

## 5. 임시 벤치 — 맵 보존 + 자동 복귀 (benchWithOverride)

**트리거**: 파울 트러블, 탈진(Shutdown)

**핵심 차이**: `forceSubstitution`과 달리 승계 로직을 호출하지 않음.

**처리 흐름**:
1. 아웃 선수의 잔여 맵 스냅샷 저장
2. 대체자(Filler) 탐색
3. 아웃 선수의 맵 슬롯을 Filler에게 **복귀 예정 분까지만** 전이
4. 복귀 예정 분 이후: `originalRotationMap`에서 원본 맵 복원
5. `activeOverrides` 스택에 오버라이드 기록
6. 선수에 `benchReason`, `scheduledReturnMinute` 등 메타데이터 설정
7. 물리적 스왑 실행

---

## 6. 원본 맵 보존 (originalRotationMap)

```typescript
// GameState
originalRotationMap: Record<string, boolean[]>;  // 경기 시작 시 deep copy
activeOverrides: RotationOverride[];              // 임시 교체 추적 스택
```

- `createGameState()`에서 양 팀의 로테이션 맵을 deep copy
- **엔진이 절대 수정하지 않음** — 복원의 유일한 원본
- 임시 벤치 해제 시 이 맵에서 슬롯을 복사하여 런타임 맵 복원

---

## 7. 자동 복귀 체크 (checkTemporaryReturns)

매 포세션마다 `checkAndApplyRotation` 이전에 호출.

**파울 트러블 복귀 조건**:
- `scheduledReturnMinute`에 도달
- 복귀 전 `evaluateFoulTroubleAction()` 재평가 → 아직 위험하면 연장

**탈진(Shutdown) 복귀 조건**:
- `isShutdown === false` (벤치에서 체력 70 초과 시 자동 해제)
- `currentCondition > 70`
- `originalRotationMap`에 현재 또는 이후 분에 출전 슬롯이 있음

**복귀 처리**:
1. `restorePlayerMap()` — 원본 맵에서 런타임 맵 복원
2. `restoreFillerMap()` — Filler의 상속 슬롯 제거, 원본 맵 복원
3. 오버라이드 비활성화, 메타데이터 클리어
4. 실제 물리적 투입은 `checkAndApplyRotation`이 맵 기반으로 처리

---

## 8. Filler 체인 관리 (handleFillerExit)

대체자(Filler)가 추가로 영구 퇴장하는 경우:

1. 원래 선수가 복귀 가능한지 확인
   - 탈진 해소 + 체력 > 70 → 원래 선수 조기 복귀
   - 파울 트러블 재평가 → 벤치 불필요 시 조기 복귀
2. 복귀 불가 → 새 Filler 탐색
   - Filler의 잔여 맵을 새 Filler에게 전이
   - 오버라이드의 `fillerPlayerId` 갱신
3. 뎁스 완전 소진 → 오버라이드 비활성화, Fallback이 처리

---

## 9. RotationOverride 타입

```typescript
interface RotationOverride {
    outPlayerId: string;          // 임시 벤치된 선수
    fillerPlayerId: string;       // 대체 투입된 선수
    reason: 'foul_trouble' | 'shutdown';
    fromMinute: number;           // 오버라이드 시작 분
    toMinute: number;             // 복귀 예정 분 (48 = 조건 복귀)
    originalSlots: boolean[];     // outPlayer의 원본 맵 스냅샷
    active: boolean;              // 해결되면 false
}
```

---

## 10. 엣지 케이스 정리

| 케이스 | 처리 |
|--------|------|
| 벤치 중 추가 파울 | 불가능 (벤치 선수는 파울 안 받음) |
| 복귀 직후 재탈진 | 다음 포세션에서 `checkSubstitutionsV2`가 재감지 → 새 override |
| 동시 다수 스타터 아웃 | override 스택이 독립 추적, `excludeIds`가 중복 filler 방지 |
| 뎁스 완전 소진 | `benchWithOverride`가 filler 못 찾으면 벤치 불가, 계속 기용 |
| 하프타임 복귀 (returnMinute=24) | Q3 첫 포세션에서 `checkTemporaryReturns` 감지 → 맵 복원 |
| 유저 맵에 명시된 선수 | `isScheduled === true`면 탈진·파울트러블 체크 스킵 (유저 의사 존중) |
