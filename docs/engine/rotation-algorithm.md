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

**승계 로직** (`rotationSuccession.ts`의 `planSuccession` — 2026-10-22 통일): 경기 전 부상 선수 처리(`initializer`)와 경기 중 영구 이탈(`applyRotationSuccession`)이 **같은 함수**를 쓴다. 로테이션 맵을 직접 갱신한다.
- 하드 규칙은 하나: 매 분 예정 인원을 `min(5, 처리 전 인원)` 이상으로 유지. 출전 시간 상한 같은 하드 제한은 없다(건강한 선수가 5~6명이면 상한이 규칙끼리 충돌).
- **1) 역할 승계**: 같은 슬롯 뎁스차트에서 건강한 선수를 순서대로 세워 주전 역할·백업 역할·써드 역할(= 그 순번 선수의 원래 출전 패턴)을 한 칸씩 위로 올린다.
  - 주전 OUT → 백업이 주전 패턴(예: 36분), 써드가 백업 패턴(예: 12분). 백업이 48분 풀타임이 되지 않는다.
  - 백업 OUT → 써드가 백업 패턴. 소속 슬롯은 "뎁스차트에서 주전으로 등재된 슬롯, 없으면 처음 등재된 슬롯".
- **2) 남은 구멍 메우기**: 승계 후에도 그 분의 예정 인원이 모자라면, 그 분에 쉬고 있는 선수 중 점수가 가장 낮은 선수가 맡는다.
  - 점수 = 자리 적합도(`slotAssignment.vacancyFit`) + 0.06 × 이미 예정된 분 + 컨디션 단계 페널티(탈진·임시 벤치 +20, 부상 +100 — 건강한 선수가 없을 때만, 부상은 복귀 빠른 순) − 직전 분에 같은 구멍을 메운 선수 우대(0.4).
  - 결과: 인접 포지션 비주전 > 같은 슬롯 주전 연장 > 두 칸 이상 떨어진 선수 순.
  - 사용자가 원래부터 비워 둔 분(예정 5명 미만)은 건드리지 않는다(런타임 폴백 몫).
- 선발도 이 결과 표의 0분 출전자로 정한다(`initializer`). 이전엔 선발을 별도 규칙(OVR 순)으로 채워 표와 어긋났다.
- **아웃된 선수의 잔여 맵은 영구적으로 비워짐** (복귀 불가)
- 시험: `scripts/rotationSuccessionScenarios.ts`(예외 12개 + 건강한 선수 5·6·7명).

**대체자 탐색 우선순위** (`findResCandidate`):
1. 동일 포지션 우선
2. OVR 높은 순
3. 체력 높은 순
4. 기본적으로 탈진(Shutdown) 선수 제외, 비상시 포함

---

## 5. 임시 벤치 — 맵 보존 + 자동 복귀 (benchWithOverride)

**트리거**: 파울 트러블, 탈진(Shutdown), **개인 전술 휴식 임계치(restThreshold)**

> 개인 전술 시스템 전체: [player-tactics.md](player-tactics.md)

### 파울 트러블 — 2026-10-23 개정 (`benchForFoulTrouble`)
기준·판정 시점·측정은 [foul-trouble.md](foul-trouble.md). 요약:
- 4파울부터, 주전·벤치 구분 없이, 복귀 시각이 항상 정해진 임시 벤치(영구 벤치 없음). 로테이션 표에 있는 분에도 판정.
- 빈 시간은 `planSuccession(..., toMinute = 복귀 시각)` — 4절과 같은 연쇄 승계를 복귀 시각까지만. 복귀 시각 이후 표는 그대로라 복귀 시 되돌리기가 없다.
- 후보 단계(`successionPlayers`, 4절 영구 이탈과 공용): 퇴장·경기 중 부상 = 제외 / Day-to-Day·탈진·임시 벤치·체력 20% 이하·파울 트러블 위험 = 최후 수단(연쇄 승계에서 빠지고 자기 역할 유지) / 그 외 정상.
- 교체는 1:1, 슬롯은 `assignCourtSlots`(10절).

### 탈진 (`benchWithOverride`)
**핵심 차이**: `forceSubstitution`과 달리 승계 로직을 호출하지 않음.

**처리 흐름**:
1. 아웃 선수의 잔여 맵 스냅샷 저장
2. 대체자(Filler) 탐색
3. 아웃 선수의 맵 슬롯을 Filler에게 **복귀 예정 분까지만** 전이
4. 복귀 예정 분 이후: `originalRotationMap`에서 원본 맵 복원
5. `activeOverrides` 스택에 오버라이드 기록
6. 선수에 `benchReason`, `scheduledReturnMinute` 등 메타데이터 설정
7. 물리적 스왑 실행

### 탈진(Shutdown) 기준 — 2026-10-22 동적화 (`substitutionSystem.ts`)
기준 체력은 기본 20%(`HARD_FLOOR`; 개인 휴식 임계치는 2026-10-17부터 비활성이라 실제로는 전원 20%). **쓸 수 있는 벤치 선수 수**에 따라 낮춘다.
쓸 수 있는 벤치 = 건강하고, 퇴장·탈진·임시 벤치가 아니고, 코트에 없는 선수.

| 쓸 수 있는 벤치 | 기준 (`shutdownFloorScale`) |
|---|---|
| 3명 이상 | ×1 → 20% (이전과 동일) |
| 2명 | ×0.75 → 15% |
| 1명 | ×0.5 → 10% |
| 0명 | ×0 → 빼지 않음 (바꿀 사람이 없으니 탈진 플래그도 켜지 않음) |

- **대체자 조건**: 벤치 최고 체력이 지금 선수보다 `SHUTDOWN_MIN_GAIN`(15) 이상 높을 때만 교체. `benchWithOverride`의 대체자 후보도 같은 조건(체력이 이만큼 높지 않은 벤치 선수 제외)을 적용해 두 곳의 판단이 어긋나지 않게 한다.
- 이유: 벤치가 얇을 때 20%에서 계속 빼면 지친 대체자와 번갈아 들락거린다(체력 회복 기준이 70%라 한 번 탈진하면 오래 못 돌아옴). 사람이 부족할수록 지친 채로 버티게 한다 — 체력 낮은 선수의 성능 페널티는 기존 체력 시스템 그대로.
- 실측(Pro Basketball League 30팀, 건강한 선수 수 제한): 건강한 6명일 때 경기당 탈진 교체 56.1회 → 1.0회, 7명 5.5 → 1.6, 15명(정상)은 완전히 동일. 대신 체력 20% 미만 선수가 뛴 공격권 비율은 6명 11.2 → 16.3%, 7명 0.3 → 10.8%로 늘어난다(의도된 맞교환).
- 한계: 비상 보충(`checkAndApplyRotation`)의 "탈진 선수도 포함" 단계와 후임 선정(`rotationSuccession`)의 컨디션 단계 페널티는 이 기준과 별개로 같은 원칙(건강 > 탈진 > 부상)을 따른다.

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

**파울 트러블 복귀 조건** (2026-10-23):
- 오버라이드의 `toMinute`(복귀 시각)에 도달하면 그대로 복귀. 재평가 없음(벤치에서는 파울이 늘지 않음).
- 표 복원도 없음 — 승계를 복귀 시각까지만 했기 때문(아래 "복귀 처리" 1·2는 탈진 전용).

**탈진(Shutdown) 복귀 조건**:
- `isShutdown === false` (벤치에서 체력 회복 시 자동 해제)
- `currentCondition > returnThreshold` (선수별 개인 전술 설정값, 기본 70)
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
   - (2026-10-23부터 탈진 오버라이드만 해당 — 파울 트러블은 연쇄 승계로 메워 대체자 1명에 묶이지 않음. 승계받은 선수가 이탈하면 일반 영구 이탈 승계가 처리)
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

## 10. Assigned Position (슬롯 포지션) — 2026-10-22 개정

`LivePlayer.position`은 선수의 고유 포지션이 아닌 **지금 맡은 코트 슬롯**을 나타낸다. 고유 포지션은 `LivePlayer.nativePosition`(2026-10-22 추가)에 따로 둔다.
코트에는 항상 PG·SG·SF·PF·C 슬롯이 하나씩 있으며, **모든 교체 경로가 `slotAssignment.ts`의 `assignCourtSlots()` 하나로 슬롯을 정한다.**

### 배정 규칙 (`slotAssignment.ts`)
코트 위 5명을 다섯 슬롯에 놓는 120가지를 모두 비교해 "어색함" 합이 가장 낮은 배치:

| 선수와 슬롯 관계 | 어색함 |
|---|---|
| 뎁스차트에 그 슬롯의 **주전**으로 등재 | 0 |
| 그 슬롯 백업·써드로 등재, 또는 고유 포지션 = 슬롯 | 0.6 |
| 고유 포지션과 한 칸 / 두 칸 / 세 칸+ 차이 | 1 / 3 / 10 |
| 코트에 계속 있던 선수가 슬롯을 옮김 | +0.5 |

- 1:1 교체면 결과적으로 **나간 선수의 슬롯을 승계**한다(남은 선수가 움직이는 쪽이 항상 더 비쌈).
- 8인 로테이션의 "커버 후 복귀"(벤치 가드가 PG를 커버하다가 PG 주전 복귀와 동시에 SG 주전이 쉴 때)는 벤치 가드가 SG로 옮긴다.
- 동점: 기존 슬롯을 더 많이 유지하는 배치 → 선수 id 순(결정론).
- 판단(매치업·PnR 자격 등)은 계속 **슬롯 기준** — 고유 포지션은 배정에만 쓴다(고유 포지션 게이팅은 [pf-slot-stacking-issue.md](pf-slot-stacking-issue.md)에서 기각).

### 적용 경로
| 교체 경로 | 슬롯 배정 |
|---|---|
| 경기 시작 (`initTeamState`) | 선발 확정 후 `assignCourtSlots` |
| 정기 교체 `checkAndApplyRotation` | 교체 직전 스냅샷 → 교체 후 `assignCourtSlots` (이전: 뎁스차트 첫 등재 슬롯 `getSlotPosition` — 삭제) |
| 빈 시간 보충(맵에 5명 미만) | 후보를 한 명씩 고를 때 `체력 점수 − 10 × vacancyFit`(남은 빈 슬롯 적합도) |
| 6명 이상 예정 | `pickBestFive` — 슬롯을 가장 잘 채우는 5명(동점 OVR 합). 이전: OVR 상위 5명 |
| `forceSubstitution` / `benchWithOverride` / `executeGarbageSubstitution` / `applyManualSubstitution` | 스왑 후 `assignCourtSlots` (이전: 나간 선수 position 직접 복사) |

실측(2026-10-22, Pro Basketball League 저장 전술 120경기): 슬롯이 PG~C 하나씩이 아닌 공격권 11.3% → 0.0%(서버·클라이언트 엔진 모두). 리그 득점·포지션별 득점 변화 없음(잡음 범위). 상세: `docs/history/dev-log.md` 2026-10-22.

### 영향 범위
position은 엔진 내 수비자 매칭, 존 디펜스 앵커, PnR 스크리너 수비, 코트 비주얼 등에서 `===` 비교로 사용됨. 슬롯 포지션 덕분에 PG를 C에 넣으면 상대 C를 정상 매칭한다.

### 포지션 미스매치 페널티
별도 페널티 없음. 능력치(`intDef`, `blk`, `height`, `strength` 등) 자체가 자연 페널티 역할.

---

## 11. 엣지 케이스 정리

| 케이스 | 처리 |
|--------|------|
| 벤치 중 추가 파울 | 불가능 (벤치 선수는 파울 안 받음) |
| 복귀 직후 재탈진 | 다음 포세션에서 `checkSubstitutionsV2`가 재감지 → 새 override |
| 동시 다수 스타터 아웃 | override 스택이 독립 추적, `excludeIds`가 중복 filler 방지 |
| 뎁스 완전 소진 | 들어올 선수가 없으면 벤치 불가, 계속 기용 (파울 트러블은 표를 되돌리고 다음 공격권에 재시도) |
| 하프타임 복귀 (returnMinute=24) | Q3 첫 포세션에서 `checkTemporaryReturns` 감지 → 복귀 (파울 트러블은 표 복원 없이 원래 표대로) |
| 유저 맵에 명시된 선수 | 탈진(2026-10-22~)·파울 트러블(2026-10-23~) 모두 표와 무관하게 판정. 파울 트러블을 끄려면 선수별 `foulPolicy:'ignore'` |
| 복귀 후 같은 파울 수 | 다시 빼지 않음 — 파울이 새로 늘었을 때만 판정(`foulCheckedPf`) |
