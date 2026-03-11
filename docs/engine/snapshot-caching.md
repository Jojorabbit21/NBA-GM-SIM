# Snapshot Caching (데이터 로딩 최적화)

## 개요

새로고침 시 게임 상태를 복원하는 두 가지 최적화 계층.

- **Tier 1 — 컬럼 프로젝션**: `SELECT *` 대신 필요한 컬럼만 요청
- **Tier 2 — 스냅샷 캐싱**: 재조립(replay) 자체를 스킵

---

## 배경: 기존 방식의 문제

### 상태 재구성 아키텍처 (Event Sourcing)

이 프로젝트는 사용자별 선수 스탯 테이블을 두지 않는다. 대신:

```
saves (체크포인트) → user_game_results (박스스코어 전체) → stateReplayer (재조립)
```

매 새로고침마다 모든 경기 결과를 DB에서 가져와 1경기씩 순회하며 선수 스탯을 누적한다.

### 문제점

| 항목 | 시즌 초반 (10경기) | 시즌 후반 (1,230경기) |
|---|---|---|
| 전송 데이터 | ~1MB | **수십~100MB+** |
| CPU replay | 즉시 | **수 초~10초+** |

`SELECT *`로 인해 `pbp_logs`, `shot_events` 등 stateReplayer가 **사용하지 않는** 대용량 컬럼까지 전송된다.

---

## Tier 1: 컬럼 프로젝션

### 원리

Supabase의 `select('*')` → 실제 필요한 컬럼만 명시.

```typescript
// Before
supabase.from('user_game_results').select('*')

// After — stateReplayer가 실제로 읽는 컬럼만
supabase.from('user_game_results')
  .select('game_id, date, home_team_id, away_team_id, home_score, away_score, box_score, tactics, is_playoff, series_id')
```

`useMonthlySchedule`은 점수 표시 용도이므로 `box_score`, `tactics` 제외:
```typescript
supabase.from('user_game_results')
  .select('game_id, date, home_team_id, away_team_id, home_score, away_score')
```

### 적용 대상

| 파일 | 함수 | 변경 |
|---|---|---|
| `services/persistence.ts` | `loadUserHistory()` | `user_game_results`, `user_transactions` 컬럼 프로젝션 |
| `services/persistence.ts` | `loadCheckpoint()` | `saves` 컬럼 프로젝션 |
| `services/playoffService.ts` | `loadPlayoffGameResults()` | `user_playoffs_results` 컬럼 프로젝션 |
| `services/queries.ts` | `useMonthlySchedule()` | `user_game_results` 컬럼 프로젝션 |

### 효과

- DB → 클라이언트 전송량 대폭 감소
- `pbp_logs`, `shot_events`, `rotation_data` 등 미사용 대용량 컬럼 제거
- **DB 스키마 변경 불필요**, 코드 수정만으로 적용

---

## Tier 2: 스냅샷 캐싱

### 원리 (비유)

가계부를 떠올리면 쉽다:

- **기존**: 잔액을 알려면 1월 1일부터 모든 거래를 다시 합산
- **스냅샷**: 마지막 거래 후 "현재 잔액: 527만원" 메모 → 다음에 메모만 보면 끝

게임에 적용하면:

- **기존**: 새로고침 → 모든 경기 박스스코어 로드 → 1경기씩 순회하며 선수 스탯 누적
- **스냅샷**: 경기 후 현재 상태를 사진 찍듯 저장 → 새로고침 시 사진만 불러오면 끝

### 스냅샷에 저장되는 데이터

```typescript
interface ReplaySnapshot {
  version: number;            // 스키마 버전 (현재 v4)
  game_count: number;         // 정규시즌 경기 수
  playoff_game_count: number; // 플레이오프 경기 수
  transaction_count: number;  // 트랜잭션 수

  teams_data: {               // 팀별 데이터
    [teamId]: {
      wins, losses,           // 승패 기록
      tacticHistory,          // 전술 사용 이력
      roster_stats: {         // 선수별 누적 스탯 + 성장 상태
        [playerId]: {
          stats, playoffStats,
          growthState?: {                                // v4: 성장/퇴화 시스템
            fractionalGrowth?: Record<string, number>,   // 소수점 누적 (sparse)
            attrDeltas?: Record<string, number>,         // 시즌 내 정수 변화 합계
            changeLog?: AttributeChangeEvent[],          // 정수 변화 이벤트 로그
            seasonStartAttributes?: Record<string, number> // 시즌 시작 기준 속성값
          }
        }
      }
    }
  };

  schedule_results: {         // 완료된 경기 결과
    [gameId]: { homeScore, awayScore, homeStats, awayStats }
  };

  playoff_schedule: [...];    // 플레이오프 경기 목록
}
```

> **v4 변경점**: `roster_stats`에 `growthState` 추가. `hydrateFromSnapshot()` 시 `attrDeltas`를 기반으로 `reapplyAttrDeltas(player)`를 호출하여 `meta_players` 원본 능력치에 시즌 내 정수 변화를 재적용한다.

### 저장 위치

`saves` 테이블의 `replay_snapshot` JSONB 컬럼.

```sql
ALTER TABLE saves ADD COLUMN IF NOT EXISTS replay_snapshot JSONB;
```

### 스냅샷 생성 시점

경기 결과 저장 직후 `forceSave({ withSnapshot: true })` 호출 시:

```
경기 시뮬레이션 완료
  → 박스스코어 DB 저장 (user_game_results INSERT)
  → 현재 메모리 상태에서 스냅샷 빌드 (buildReplaySnapshot)
  → saves 테이블에 스냅샷 포함하여 체크포인트 저장
```

### 스냅샷 검증 (유효성 판단)

새로고침 시 저장된 스냅샷을 무조건 신뢰하지 않는다. **경기 수 대조**로 검증:

```
스냅샷 기록: "82경기 기준"
DB 실제 수:  "82경기 존재"  ← HEAD 요청 (본문 없음, 카운트만)
  → 일치 → 스냅샷 유효 ✅ → 바로 사용
  → 불일치 → 스냅샷 폐기 ❌ → 기존 방식 full replay → 새 스냅샷 자동 생성
```

3가지 카운트를 모두 비교:
- `game_count` vs `user_game_results` 행 수
- `playoff_game_count` vs `user_playoffs_results` 행 수
- `transaction_count` vs `user_transactions` 행 수

HEAD 요청은 응답 본문이 없어 데이터 전송량이 0에 가깝다.

### 로딩 플로우

```
새로고침
  → useBaseData() — meta_players + meta_schedule (TanStack Query, 병렬)
  → loadCheckpoint() (saves 테이블)
  → replay_snapshot 존재?
    │
    ├─ YES → Promise.all([                    ← 3개 병렬 실행
    │           loadPlayoffState(),
    │           countUserData(),              ← HEAD 요청 3개
    │           loadUserTransactions(),
    │        ])
    │         → version 일치 && 3개 카운트 모두 일치?
    │           ├─ YES → ⚡ hydrateFromSnapshot() — replay 스킵!
    │           │         (growthState에서 attrDeltas → reapplyAttrDeltas로 능력치 복원)
    │           └─ NO  → 🔄 loadUserHistory() → replayGameState()
    │                     → 새 스냅샷 빌드 & 저장
    │
    └─ NO  → loadPlayoffState()
              → 🔄 loadUserHistory() → replayGameState()
              → 새 스냅샷 빌드 & 저장
```

### 병렬화 최적화

스냅샷 경로에서 `loadPlayoffState`, `countUserData`, `loadUserTransactions` 3개 요청을 `Promise.all`로 병렬 실행한다.

```
[순차 실행]  loadPlayoffState (~200ms) → countUserData (~214ms) → loadUserTransactions (~210ms) = ~624ms
[병렬 실행]  Promise.all([...3개...]) = ~214ms (가장 느린 요청 기준)
```

Fallback 경로에서는 `loadPlayoffState`가 스냅샷 블록에서 이미 로드되었으면 재사용하고, 아니면 그때 로드한다.

### 공통 후처리: roster_state 패치

스냅샷/리플레이 양쪽 경로 모두, 마지막에 `checkpoint.roster_state`를 적용한다:

```
roster_state[playerId] = {
  condition, health, injuryType, returnDate,        // 피로/부상
  fractionalGrowth?, attrDeltas?, changeLog?,       // 성장/퇴화 누적 상태
  seasonStartAttributes?                            // 시즌 시작 기준 속성값
}
```

`attrDeltas`가 있으면 `reapplyAttrDeltas(player)`를 호출하여 `meta_players` 원본에 정수 변화를 재적용한다. 이 이중 경로(스냅샷 + roster_state) 덕분에 어느 쪽으로 로드하든 성장 데이터가 보존된다.

### 트랜잭션은 왜 별도로 로드하나?

스냅샷은 선수 스탯과 팀 승패를 저장하지만, **어떤 선수가 어떤 팀에 있는지**(로스터 구성)는 저장하지 않는다. 트레이드로 선수가 팀을 옮긴 경우, 트랜잭션 내역을 적용해야 올바른 로스터가 복원된다.

다만 트랜잭션 데이터는 가볍기 때문에 (경기당 ~100B vs 박스스코어 ~10KB+) 성능 영향이 거의 없다.

---

## 관련 파일

| 파일 | 역할 |
|---|---|
| `services/snapshotBuilder.ts` | `buildReplaySnapshot()`, `hydrateFromSnapshot()` + `reapplyAttrDeltas()` 호출 |
| `services/playerDevelopment/playerAging.ts` | `reapplyAttrDeltas()` — 로드 시 능력치 재적용, `initializeSeasonGrowth()` |
| `services/persistence.ts` | `saveCheckpoint()` (스냅샷 저장), `countUserData()` (검증), `loadUserTransactions()` |
| `hooks/useGameData.ts` | `initializeGame()` 분기 로직, `forceSave()` 스냅샷 빌드 + roster_state에 성장 데이터 포함 |
| `hooks/useSimulation.ts` | 경기 후 `forceSave({ withSnapshot: true })` 호출 |
| `hooks/useFullSeasonSim.ts` | 풀시즌 시뮬 후 스냅샷 저장 |
| `components/AppRouter.tsx` | 경기 결과 dismiss 후 스냅샷 저장 |
| `types/game.ts` | `ReplaySnapshot` 인터페이스 |

---

## 검증 방법

### Network 탭

| 요청 | 기대 결과 |
|---|---|
| `saves?select=...replay_snapshot...` | 스냅샷 JSONB 포함된 응답 |
| `user_game_results?select=game_id` | HEAD 요청, 응답 본문 없음 (정상) |
| `user_game_results?select=game_id,date,...box_score...` | 스냅샷 유효 시 **이 요청 자체가 없어야** 함 |

### 콘솔 로그

| 상황 | 로그 |
|---|---|
| 스냅샷 유효 | `⚡ Snapshot valid — skipping full replay` |
| 스냅샷 무효/없음 | `🔄 Full replay` → `💾 Snapshot saved` |

### 성능 비교

| 항목 | 기존 (full replay) | 스냅샷 + 병렬화 |
|---|---|---|
| DB 전송량 | 수십~100MB+ (시즌 후반) | ~수백KB (saves 1행) |
| CPU 계산 | 1,230경기 순회 | 없음 (역직렬화만) |
| 네트워크 순차 대기 | ~624ms (3개 순차) | ~214ms (3개 병렬) |
| 체감 로딩 (시즌 후반) | 수 초~10초+ | **~2초** |

### 실측 요청별 소요 시간 (시즌 후반 기준)

| 요청 | 시간 | 비고 |
|---|---|---|
| `meta_players` | ~688ms | TanStack Query (새로고침 시 재요청) |
| `meta_schedule` | ~443ms | TanStack Query (meta_players와 병렬) |
| `saves` (replay_snapshot 포함) | ~495ms | useBaseData 완료 후 순차 |
| `user_game_results` (HEAD count) | ~214ms | 병렬 그룹 |
| `user_playoffs_results` (HEAD count) | — | 병렬 그룹 |
| `user_transactions` (HEAD count) | — | 병렬 그룹 |
| `user_transactions` (실제 데이터) | ~210ms | 병렬 그룹 |
| `user_playoffs` (bracket) | ~200ms | 병렬 그룹 |
