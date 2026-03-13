# 멀티시즌 지원 구현 계획

## Context

현재 NBA-GM-SIM은 단일 시즌(2025-26)만 플레이 가능합니다. 파이널이 끝나면 게임이 사실상 종료되며, "다음 시즌"으로 넘어가는 로직이 전혀 없습니다. 이 계획은 시즌 종료 후 오프시즌을 거쳐 다음 시즌을 계속 플레이할 수 있도록 만드는 것입니다.

### 현재 단일 시즌 가정이 박힌 핵심 지점들
- DB: `user_game_results`, `user_transactions`, `user_playoffs_results`에 **season 컬럼 없음**
- DB: `saves`는 `user_id` 단일 upsert — 시즌 번호 개념 없음
- 코드: 20개+ 파일에 `'2025-10-20'`, `'2026-02-06'`, `'2025-2026'` 하드코딩
- `stateReplayer.ts`: 전체 `user_game_results`를 시즌 필터 없이 재조합
- `Player.age`, `contractYears`, `salary`: 정적 — 에이징/계약만료 로직 없음
- 파이널 종료 후: 다음 시즌 진입 코드 없음

---

## 1단계: 데이터 레이어 기반 (기능 영향 없음)

### 1-1. DB 스키마 변경

**기존 테이블 season 컬럼 추가:**
```sql
ALTER TABLE user_game_results     ADD COLUMN season TEXT NOT NULL DEFAULT '2025-2026';
ALTER TABLE user_playoffs_results ADD COLUMN season TEXT NOT NULL DEFAULT '2025-2026';
ALTER TABLE user_transactions     ADD COLUMN season TEXT NOT NULL DEFAULT '2025-2026';
-- user_playoffs: 이미 season 컬럼 존재
-- hall_of_fame: 이미 season 컬럼 존재

CREATE INDEX idx_ugr_user_season  ON user_game_results(user_id, season);
CREATE INDEX idx_utr_user_season  ON user_transactions(user_id, season);
CREATE INDEX idx_upr_user_season  ON user_playoffs_results(user_id, season);
```

**saves 테이블 확장:**
```sql
ALTER TABLE saves ADD COLUMN current_season TEXT NOT NULL DEFAULT '2025-2026';
ALTER TABLE saves ADD COLUMN season_number  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE saves ADD COLUMN season_end_snapshot JSONB;  -- 시즌 종료 시 로스터 스냅샷
```

**신규 테이블 — `user_season_history`:**
```sql
CREATE TABLE user_season_history (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID NOT NULL,
    season           TEXT NOT NULL,
    season_number    INTEGER NOT NULL,
    player_overrides JSONB NOT NULL,  -- {playerId: {age, contractYears, ovr, seasonStats, ...}}
    roster_assignments JSONB,          -- 시즌 시작 시 팀별 로스터 배정
    created_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, season)
);
```

### 1-2. SeasonConfig 타입 + 생성 함수

**새 파일: `utils/seasonConfig.ts`**
```typescript
export interface SeasonConfig {
    seasonLabel: string;      // '2025-2026'
    seasonShort: string;      // '2025-26'
    seasonNumber: number;
    startDate: string;        // '2025-10-22'
    tradeDeadline: string;
    allStarStart: string;
    allStarEnd: string;
    scheduleMinMonth: Date;
    scheduleMaxMonth: Date;
}

export function buildSeasonConfig(seasonNumber: number): SeasonConfig { ... }
```

### 1-3. 하드코딩 교체

| 파일 | 현재 | 교체 |
|------|------|------|
| `utils/constants.ts` | `SEASON_START_DATE = '2025-10-20'` | `seasonConfig.startDate` |
| `utils/constants.ts` | `TRADE_DEADLINE = '2026-02-06'` | `seasonConfig.tradeDeadline` |
| `hooks/useGameData.ts` | `INITIAL_DATE = '2025-10-20'` | `seasonConfig.startDate` |
| `views/ScheduleView.tsx` | `MIN/MAX_MONTH` 하드코딩 | `seasonConfig` props |
| `services/playoffService.ts` | `season: '2025-2026'` | `seasonConfig.seasonLabel` |
| `services/simulation/seasonService.ts` | 메시지 내 `'2025-26'` | `seasonConfig.seasonShort` |
| `hooks/useSimulation.ts` | 메시지 내 `'2025-26'` | 동일 |
| `hooks/useFullSeasonSim.ts` | 메시지 내 `'2025-26'` | 동일 |
| `views/HallOfFameView.tsx` | `'2025-26'` | props |
| `views/PlayerDetailView.tsx` | `'2025-26 시즌 스탯'` | 동적 |
| `views/OnboardingView.tsx` | `'2025-26'` | 동적 |
| `tradeEngine/cpuTradeSimulator.ts` | `TRADE_DEADLINE` import | `seasonConfig` |

### 1-4. persistence.ts + stateReplayer.ts 시즌 필터

- `loadUserHistory(userId, season)` — season 파라미터 추가
- `stateReplayer.ts` — `seasonConfig` 파라미터 추가, 시작일 하드코딩 제거
- `ReplaySnapshot`에 `season`, `season_number` 필드 추가

**수정 대상 파일:**
- `services/persistence.ts`
- `services/stateReplayer.ts`
- `services/snapshotBuilder.ts`
- `utils/constants.ts`
- `hooks/useGameData.ts`

---

## 2단계: 시즌 전환 기본 Flow

### 2-1. 파이널 종료 → 오프시즌 진입

- `useSimulation.ts`에서 파이널 종료 감지 시 `onSeasonComplete` 콜백 호출
- `App.tsx`에서 `setView('Offseason')` 전환
- `AppView` 타입에 `'Offseason'` 추가

### 2-2. OffseasonView 기본 골격

```
OffseasonView (Step 단계 UI)
├── Step 1: 시즌 결과 요약 (챔피언, HOF 제출)
├── Step 2: 선수 에이징 미리보기 (OVR 변화: ▲ green / ▼ red)
├── Step 3: 계약 만료 선수 목록 (FA 방출 확정)
├── Step 4: FA 시장 (서명 UI)
└── Step 5: "시즌 시작" 버튼 → 다음 시즌 진입
```

### 2-3. handleStartNextSeason() 핵심 로직

```
1. 현재 시즌 스탯 → user_season_history에 아카이브
2. 에이징 결과(playerOverrides) → user_season_history에 저장
3. FA 서명 트랜잭션 → user_transactions(season = 다음시즌)에 저장
4. saves 업데이트: current_season, season_number, sim_date 리셋
5. 스케줄 생성 (generateSeasonSchedule(buildScheduleConfig(nextSeasonNumber)))
6. 인메모리 상태 리셋: stats 초기화, W/L 리셋, playoff 클리어
7. 이전 시즌 대용량 데이터 정리 (5단계 참조)
8. setView('Dashboard')
```

**수정/생성 대상 파일:**
- `hooks/useSimulation.ts`
- `App.tsx`
- `types/app.ts`
- 신규: `views/OffseasonView.tsx`
- `hooks/useGameData.ts`

---

## 3단계: 선수 에이징 + FA 시스템

### 3-1. 에이징 공식

**새 파일: `services/offseason/playerAging.ts`**

```
age ≤ 26 & potential > ovr → 성장 (성장 여지의 ~25%)
age 27-29 → 소폭 성장 또는 유지
age 30-32 → 유지 또는 소폭 감소
age 33+ → 노화 감소 (나이에 비례)
```

tendencySeed 기반 seeded random으로 결정론적 재현 보장.

### 3-2. 은퇴 시스템 (나이 + OVR 복합 기준)

에이징 처리 후 은퇴 판정을 실행:
```
age < 36              → 은퇴 없음
age 36-37 & OVR < 65  → 은퇴 확률 40%
age 36-37 & OVR ≥ 65  → 은퇴 확률 10%
age 38-39             → 은퇴 확률 70% (OVR 무관)
age 40+               → 은퇴 확정 (100%)
```

은퇴 선수는 로스터에서 제거되고, `user_season_history`에 `retired: true` 플래그로 기록.
은퇴 선수 목록은 OffseasonView Step 2에서 에이징 결과와 함께 표시.

### 3-3. 계약 만료 처리

- `contractYears`를 1 감소, 0이 되면 FA 풀로 이동
- CPU 팀 만료 선수: 자동 재계약 (단일 플레이어이므로 CPU FA 로직 불필요)
- 유저 팀 만료 선수: OffseasonView Step 3에서 표시, Step 4에서 재서명 가능

### 3-4. FA 시장 UI (최소 기능)

- 계약 만료된 유저 팀 선수 + 기존 FA 풀 표시
- "서명" 버튼 → 샐러리 캡 체크 → Transaction(type: 'Sign') 생성
- 최소 로스터 13명 미만이면 경고

### 3-5. 스케줄 생성

- **구현 완료**: `utils/scheduleGenerator.ts` — NBA 실제 경기 배분 공식 기반 자동 생성
- 상세 문서: `docs/engine/schedule-generator.md`
- 시즌 1(2025-26)은 기존 `meta_schedule` 유지, 시즌 2부터 `generateSeasonSchedule()` 사용
- `seasonNumber`로 seed 결정 → 매 시즌 다른 매치업/일정 (결정론적)
- 게임 ID: `g_{home}_{away}_{YYYY-MM-DD}` (연도가 다르므로 시즌 간 충돌 없음)

**생성 대상 파일:**
- 신규: `services/offseason/playerAging.ts`
- 신규: `services/offseason/offseasonService.ts`

---

## 4단계: 히스토리 UI

### 4-1. PlayerDetailView 시즌별 스탯

- 현재 시즌 스탯 (기본 표시)
- 커리어 스탯 탭 추가 (user_season_history 합산)
- 시즌 드롭다운으로 과거 시즌 스탯 조회

### 4-2. 시즌 번호 표시

- DashboardHeader에 현재 시즌 라벨 표시
- StandingsView는 항상 현재 시즌만 표시 (이전 시즌 아카이브는 추후)

**수정 대상 파일:**
- `views/PlayerDetailView.tsx`
- DashboardHeader 관련 컴포넌트

---

## 5단계: 데이터 정리 및 스토리지 최적화

### 5-1. 오래된 시즌 상세 데이터 정리

시즌 전환 시(`handleStartNextSeason`) 직전 시즌의 대용량 필드를 정리:

```
user_game_results WHERE season = 이전시즌:
  - pbp_logs → NULL      (~80-120 KB/행, 유저 경기만)
  - shot_events → NULL    (~30-36 KB/행, 전체 경기)
  - rotation_data → NULL  (~5-8 KB/행, 전체 경기)
```

**유지하는 데이터**: game_id, date, 팀 ID, 스코어, box_score, tactics, is_playoff, series_id
→ 과거 시즌 박스스코어 조회는 여전히 가능. 샷차트/PBP 애니메이션만 불가.

효과: 시즌당 디스크 사용량 **~25 MB → ~8 MB** (약 70% 절감)

### 5-2. CPU 경기 shot_events 저장 생략

CPU-vs-CPU 경기의 shot_events는 유저가 볼 일이 거의 없으므로 저장 시점에 생략:

```typescript
// cpuGameService.ts - saveGameResults에서
shot_events: undefined  // CPU 경기는 shot_events 미저장
```

효과: 시즌당 원본 데이터 **~35 MB 절약** (1,148 CPU 경기 × ~30 KB)

### 5-3. 스토리지 예산 예측 (정리 전략 적용 후)

| 시나리오 | 유저 1명 | 유저 10명 | 유저 30명 |
|---------|---------|----------|----------|
| 시즌 1 (현재 시즌, 전체 데이터) | ~25 MB | ~250 MB | ~750 MB |
| 시즌 5 (최신만 전체, 과거 4시즌 정리) | ~57 MB | ~570 MB | ~1.7 GB |
| 시즌 10 | ~97 MB | ~970 MB | ~2.9 GB |

Free 플랜 (500 MB): 유저 1명 × ~50시즌 / 유저 5명 × ~10시즌
Pro 플랜 (8 GB): 유저 30명 × ~10시즌까지 여유

### 5-4. 구현 시점

- CPU shot_events 생략: **1단계**에서 즉시 적용 (기존 기능 영향 없음)
- 오래된 시즌 정리: **2단계** `handleStartNextSeason()`에서 이전 시즌 정리 쿼리 실행

**수정 대상 파일:**
- `services/game/cpuGameService.ts` (shot_events 생략)
- `hooks/useGameData.ts` 또는 `services/offseason/offseasonService.ts` (시즌 전환 시 정리 쿼리)

---

## 성능 분석: 멀티시즌에서의 로드 성능

### 핵심: 시즌별 파티셔닝으로 로드 성능은 항상 1시즌 분량으로 제한

```
시즌 N 로드:
  saves (1행) → snapshot 유효?
    → YES: hydrateFromSnapshot (~250KB) ← 시즌 1과 동일한 성능
    → NO:  user_season_history (1행, 시즌 N base)
         + user_game_results WHERE season = N (~1,258행만)
         + replay → 새 snapshot 생성
```

시즌이 아무리 쌓여도 현재 시즌의 데이터만 로드하므로 기하급수적 증가 없음.

### 추가 최적화 여지

`stateReplayer.ts`의 `schedule.findIndex()` — 매 게임마다 O(1,230) 선형 탐색.
`Map<gameId, index>`로 교체하면 O(1)로 개선 가능 (멀티시즌과 무관하게 적용 가능).

---

## 6단계: 선수 성장/퇴화 크로스시즌 과제

현재 성장/퇴화 시스템(`playerAging.ts`)은 단일 시즌 전제로 설계되어 있다. 멀티시즌 도입 시 아래 구조적 갭을 해결해야 한다.

### 6-1. 현재 구조의 한계

| 갭 | 현재 상태 | 문제 |
|----|----------|------|
| **크로스시즌 베이스라인 없음** | `meta_players`가 항상 시즌 1 원본 | 시즌 2 로드 시 `reapplyAttrDeltas()`로 시즌 2의 delta만 적용하면 시즌 1 성장분이 소실됨 |
| **`processOffseason()` 미호출** | 함수 존재하나 호출자 없음 | `age += 1`, `contractYears -= 1`, 성장 필드 리셋이 실행되지 않음 |
| **season 컬럼 부재** | `user_game_results`에 시즌 구분 없음 | `stateReplayer`가 전체 시즌 데이터를 무차별 리플레이 |
| **age 비영속** | `player.age`가 `meta_players` 고정값 | 오프시즌 `age += 1`이 메모리에서만 동작, 리로드 시 원래 나이로 복귀 |
| **seasonNumber 고정** | `processGameDevelopment()`에 항상 `1` 전달 | 시드 기반 `variance` 계산에서 시즌별 분산이 동일해짐 (결정론 깨짐) |
| **stateReplayer 성장 미지원** | 스탯(pts, reb 등)만 리플레이, 성장 미처리 | game results로부터 성장을 재구성할 수 없음 (growth는 snapshot/roster_state에만 존재) |

### 6-2. 해결 방안: 시즌 종료 베이스라인 스냅샷

**권장 방안**: 시즌 종료 시 선수별 "성장 반영 완료 베이스라인"을 저장.

```
시즌 N 종료:
  1. processOffseason() 호출
     - age += 1, contractYears -= 1
     - fractionalGrowth/attrDeltas/changeLog/seasonStartAttributes 리셋
  2. 현재 선수 능력치를 시즌 종료 베이스라인으로 저장
     → user_season_history.player_overrides에 포함
     → 또는 saves.season_end_snapshot에 저장

시즌 N+1 로드:
  1. meta_players 원본 로드
  2. user_season_history에서 시즌 N 베이스라인 로드
  3. 베이스라인 능력치를 meta_players 위에 덮어쓰기 (age, 모든 속성값)
  4. 시즌 N+1의 attrDeltas 적용 (현재 시즌 내 성장분)
  5. fractionalGrowth 복원 (이어서 누적)
```

### 6-3. `user_season_history.player_overrides` 확장

기존 계획(1-1)의 `player_overrides` JSONB에 성장 베이스라인 필드 추가:

```typescript
// player_overrides[playerId] 구조
{
    age: number;                          // 오프시즌 age+1 반영된 나이
    contractYears: number;                // 계약 잔여 년수
    ovr: number;                          // 시즌 종료 시점 OVR
    attributes: Record<string, number>;   // 37개 속성의 시즌 종료 값 (성장/퇴화 모두 반영)
    retired?: boolean;                    // 은퇴 여부
    seasonStats: { ... };                 // 시즌 스탯 아카이브
}
```

### 6-4. 구현 시 주의사항

1. **`reapplyAttrDeltas` 기준값 변경**: 시즌 2+에서는 `meta_players` 원본이 아닌 `user_season_history`의 베이스라인이 기준. `reapplyAttrDeltas()`가 참조하는 원본 능력치를 시즌별로 분기해야 함.

2. **`seasonNumber` 전달**: `processGameDevelopment()` 호출 시 현재 `seasonNumber`를 정확히 전달해야 시드 기반 variance가 시즌별로 다르게 동작. 현재는 하드코딩 `1`.

3. **`processOffseason()` 호출 시점**: `handleStartNextSeason()` (2-3) Step 1~2 사이에 호출. 에이징 미리보기 UI(Step 2)는 processOffseason 결과를 표시.

4. **이중 적용 방지**: 현재 snapshot + roster_state 이중 로드에서 `snapshotUsed` 플래그로 방지 중. 크로스시즌 베이스라인 추가 시 3중 적용 가능성 주의. 로드 경로를 명확하게 단일화할 것.

5. **fractionalGrowth 처리**: 오프시즌에서 리셋하되, 시즌 마지막 경기의 소수 누적분은 버림. (정수 반영 완료분만 베이스라인에 포함)

6. **결정론 보장**: 같은 시드 + 같은 경기 결과 → 동일한 성장 결과. 시즌 종료 베이스라인을 저장하면 리플레이 필요 없이 결정론이 유지됨.

### 6-5. 대안: 누적 attrDeltas (비권장)

시즌 종료 시 attrDeltas를 리셋하지 않고 전체 시즌에 걸쳐 누적하는 방식. `meta_players` 원본 + 누적 delta = 현재 능력치.

**장점**: 구현 단순 (processOffseason에서 리셋 안 하면 됨)
**단점**:
- delta 값이 시즌이 쌓일수록 커져서 디버깅 어려움
- "이번 시즌 성장량"을 보려면 별도 계산 필요 (시즌 시작 스냅샷 대비)
- 부동소수점 누적 오차 위험
- 오프시즌 에이징(체계적 퇴화)이 delta에 섞여 구분 불가

---

## 주요 설계 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| 드래프트 (신인 입단) | 추후 별도 구현 | 멀티시즌 기본 프레임 먼저 완성 후 독립 태스크로 |
| 은퇴 시스템 | 나이 + OVR 복합 기준 | 36세+ & OVR 기반 확률적 은퇴, 40세+ 확정 은퇴 |
| CPU 팀 FA 처리 | 자동 재계약 | 싱글플레이어에서 CPU FA 로직은 불필요한 복잡도 |
| 스케줄 생성 | `scheduleGenerator.ts` 자동 생성 (시즌 2+) | NBA 실제 경기 배분 공식 적용, 매 시즌 다른 매치업 |
| saves 구조 | 단일 row 유지 + season 컬럼 | 유저는 항상 하나의 진행 중 게임만 가짐 |
| 스탯 저장 | 시즌 종료 시 user_season_history에 아카이브 | Player 타입 변경 최소화 |
| OVR 변화 | seeded random (tendencySeed 활용) | 결정론적 재현 보장 |
| 데이터 정리 | 시즌 전환 시 이전 시즌 pbp/shot/rotation NULL화 | 디스크 ~70% 절감, 박스스코어는 유지 |
| CPU shot_events | 저장 생략 | 시즌당 ~35MB 절약, 유저가 볼 일 없음 |

---

## 검증 방법

1. **1단계 검증**: DB 마이그레이션 후 기존 시즌 1 플레이가 정상 동작하는지 확인 (season='2025-2026' 디폴트가 기존 데이터와 호환)
2. **2단계 검증**: 파이널 종료 → OffseasonView 전환 → "시즌 시작" → Dashboard로 복귀, sim_date가 다음 시즌 시작일인지 확인
3. **3단계 검증**: 에이징 결과 확인 (젊은 선수 OVR 상승, 노령 선수 하락), FA 서명 후 로스터 반영, 계약 만료 선수 방출 확인
4. **4단계 검증**: PlayerDetailView에서 시즌 1/시즌 2 스탯이 분리 표시되는지 확인
5. **전체 E2E**: 시즌 1 완료 → 오프시즌 → 시즌 2 시작 → 몇 경기 시뮬 → 저장 → 리로드 → 상태 복원 정상 확인
