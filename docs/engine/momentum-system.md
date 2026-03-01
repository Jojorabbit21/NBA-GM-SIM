# 모멘텀/런 추적 시스템

> 관련 파일: `services/game/engine/pbp/liveEngine.ts`, `possessionHandler.ts`, `pbpTypes.ts`

## 개요

NBA 경기의 "런(Run)" — 한 팀이 연속으로 득점하며 흐름을 잡는 현상을 시뮬레이션.
런 팀은 슈팅 보너스를 받고, 상대팀의 유일한 차단 수단은 **타임아웃**.

---

## 1. 핵심 타입: MomentumState

```typescript
// pbpTypes.ts
interface MomentumState {
    homeEpochPts: number;       // 현재 에포크 내 홈팀 누적 득점
    awayEpochPts: number;       // 현재 에포크 내 원정팀 누적 득점
    epochStartTotalSec: number; // 에포크 시작 시점 (경기 총 경과초)
    activeRun: {
        teamId: string;
        startTotalSec: number;  // 런 선언 시점
    } | null;
}
```

### 에포크(Epoch) 개념

에포크 = 모멘텀 추적 단위 기간. 아래 이벤트 시 에포크가 리셋됨:
- 타임아웃 (유저/AI 모두)
- 쿼터 전환
- 에포크 방향 역전 (상대팀이 에포크 내 리드 역전)

---

## 2. 데이터 흐름

```
stepPossession()
  ├─ simulatePossession() → result
  ├─ applyPossessionResult() → 스코어 변경
  ├─ ★ updateMomentum() → 에포크 포인트 누적 + 런 선언/리셋
  ├─ (교체/로테이션)
  ├─ 포세션 전환
  └─ checkAITimeout() → 8pt+ 런 감지 시 타임아웃
         └─ applyTimeout() → 모멘텀 리셋 + 핫/콜드 반감
```

---

## 3. updateMomentum() — 런 감지 로직

```typescript
// liveEngine.ts
function updateMomentum(state, scoringTeamId, points, currentTotalSec):
  1. 득점팀의 에포크 포인트 누적 (homeEpochPts or awayEpochPts += points)
  2. diff = homeEpochPts - awayEpochPts
  3. 에포크 방향 역전 체크:
     - 기존 런 팀의 반대 팀이 에포크 리드 → 전체 리셋
     - 동점 → 전체 리셋
  4. 새 런 선언: diff ≥ 8 or diff ≤ -8 → activeRun 설정
```

### 런 선언 기준

| 조건 | 결과 |
|------|------|
| 에포크 내 diff < 8 | 런 없음 (보너스 0%) |
| 에포크 내 diff ≥ 8 | **런 선언** → 런 팀에 hitRate 보너스 |
| 상대가 에포크 리드 역전 | 에포크 완전 리셋 (런 종료) |
| 동점 | 에포크 완전 리셋 |

---

## 4. getMomentumBonus() — hitRate 보정

```typescript
// possessionHandler.ts
function getMomentumBonus(state, offTeamId): number
  - activeRun이 없거나 offTeamId가 런 팀이 아니면 → 0
  - diff 기반 보너스:
```

| 에포크 diff | hitRate 보너스 | 의미 |
|-------------|---------------|------|
| 0~7 | 0% | 런 아님 |
| **8~11** | **+1.5%** | 소규모 런 |
| **12~15** | **+2.5%** | 중간 런 |
| **16+** | **+3.5%** (상한) | 대규모 런 |

### hitRate 적용 위치

```typescript
// possessionHandler.ts — simulatePossession() 내
const shotContext = calculateHitRate(
    ...,
    bonusHitRate + zoneQualityMod + getMomentumBonus(state, offTeam.id) + foulDefPenalty,
    ...
);
```

모멘텀 보너스는 다른 보정들(존 퀄리티, 파울 수비 페널티 등)과 합산되어 flowEngine에 전달.

---

## 5. 런 차단: 타임아웃

### AI 타임아웃 (자동)

```typescript
// liveEngine.ts
function checkAITimeout(state): string | null
  1. activeRun 없으면 → null
  2. 런에 당하는 팀(victimTeam) 식별
  3. 라이브 모드에서 유저 팀이면 스킵 (유저가 직접 결정)
  4. 타임아웃이 없으면 → null
  5. 에포크 diff ≥ 8 → victimTeam.id 반환 (타임아웃 선언)
```

### 타임아웃 효과 (applyTimeout)

```typescript
function applyTimeout(state, teamId):
  1. 타임아웃 차감 (team.timeouts -= 1)
  2. resetMomentum() → 에포크 완전 초기화
  3. dampenHotCold() → 양팀 핫/콜드 스트릭 반감
  4. PBP 로그 추가
```

---

## 6. 리셋 타이밍 정리

| 이벤트 | 모멘텀 처리 | 핫/콜드 처리 |
|--------|------------|-------------|
| **타임아웃** | 완전 리셋 | 반감 (×0.5) |
| **쿼터 전환** (Q2,Q4) | 완전 리셋 | 반감 (×0.5) |
| **하프타임** (Q3 시작) | 완전 리셋 | **완전 리셋** |
| **에포크 역전** | 완전 리셋 | 변화 없음 |
| **득점** | 에포크 누적 | 변화 없음 |

---

## 7. 전략적 의미

- **유저(감독)**는 상대 런 감지 시 타임아웃을 사용하여 흐름을 끊을 수 있음
- AI 팀은 8pt+ 런을 당하면 자동 타임아웃 (유저 팀은 자동 스킵)
- 런이 지속되면 최대 +3.5% hitRate → 약 1.5~2점/경기 수준의 영향
- **타임아웃 관리**가 전술적으로 중요해짐 (7개 한정 자원)
