# 시뮬레이션 전체 구조

> NBA-GM-SIM의 시뮬레이션 파이프라인 전체를 설명한 문서.
> 각 파일의 역할과 데이터 흐름을 중심으로 기록.

---

## 전체 파이프라인 개요

```
[유저 "다음날" 클릭]
        │
        ▼
useSimulation.handleExecuteSim()
        │
        ├─ processCpuGames()        ← CPU vs CPU 게임 처리
        │
        ├─ runUserSimulation()      ← 유저 팀 경기 시뮬레이션
        │
        ├─ applyUserGameResult()    ← 경기 결과 반영 (스탯, DB 저장)
        │
        ├─ handleSeasonEvents()     ← 시즌 이벤트 (플레이오프, 트레이드)
        │
        └─ setTeams/setSchedule/setPlayoffSeries()  ← React 상태 반영
```

---

## 레이어 구조

| 레이어 | 위치 | 역할 |
|--------|------|------|
| **Hook (진입점)** | `hooks/useSimulation.ts` | React 상태 관리, 시뮬레이션 조율 |
| **Service Layer** | `services/simulation/*.ts` | CPU/유저 게임 처리, 시즌 이벤트 |
| **Game Engine** | `services/gameEngine.ts` | simulateGame() wrapper |
| **PBP Core** | `services/game/engine/pbp/` | 실제 경기 시뮬레이션 (포세션별) |
| **Persistence** | `services/persistence.ts` | DB 저장/로드 |
| **State Replay** | `services/stateReplayer.ts` | 로그인 시 상태 재구성 |

---

## 파일별 역할

### hooks/useSimulation.ts
- 시뮬레이션의 최상위 조율자
- `handleExecuteSim(userTactics, skipAnimation)`: 하루치 시뮬레이션 실행
- `finalizeSimRef`: 애니메이션 완료 후 결과 확정 콜백 (ref로 저장)
- `activeGame`: 현재 진행 중인 게임 (애니메이션 대상)
- `lastGameResult`: 결과 화면에 표시할 경기 데이터
- `tempSimulationResult`: 애니메이션 중 보관하는 Raw 결과

**실행 흐름:**
```
1. newTeams = deepClone(teams)       ← 변경 불가 원본 보호
2. processCpuGames(newTeams, ...)    ← CPU 게임 처리 (newTeams 직접 변경)
3. runUserSimulation()               → SimulationResult (순수 계산, 부작용 없음)
4. setActiveGame() / setTempResult() ← 애니메이션 시작
5. finalizeSimRef.current = async () => {
     applyUserGameResult()           ← 결과 반영
     handleSeasonEvents()            ← 시즌 이벤트
     setTeams(newTeams)              ← 상태 커밋
   }
6. 애니메이션 완료 후 finalizeSim() 호출
```

---

### services/simulation/cpuGameService.ts
- CPU vs CPU 경기 처리 (유저 게임 제외)
- `processCpuGames()`: 당일 스케줄에서 유저 게임 제외한 나머지 전부 시뮬레이션

**내부 흐름:**
```
1. simulateCpuGames() [simulationService.ts]
   ├─ 당일 미완료 경기 필터 (userGameId 제외)
   └─ 각 경기마다 simulateGame(home, away, null) 호출

2. 결과 처리 루프:
   ├─ updateTeamStats()              ← 팀 승패 업데이트
   ├─ applyBoxToRoster(home, box)    ← 선수 시즌 스탯 누적
   ├─ applyBoxToRoster(away, box)    ← 선수 시즌 스탯 누적
   ├─ schedule[idx].played = true   ← 스케줄 완료 처리
   └─ updateSeriesState()           ← 플레이오프 시리즈 업데이트

3. 반환:
   ├─ gameResultsToSave   ← DB 저장용 (snake_case)
   ├─ playoffResultsToSave ← 플레이오프 DB 저장용
   ├─ viewData            ← UI용 간단한 데이터
   └─ cpuResults          ← 전체 상세 데이터 (camelCase)
```

---

### services/simulation/userGameService.ts

**runUserSimulation():**
- B2B(Back-to-Back) 여부 확인 (전날 같은 팀 경기 존재 시)
- `simulateGame()` 순수 계산 실행
- 반환: `SimulationResult` (부작용 없음)

**applyUserGameResult():**
```
1. updateTeamStats()              ← 팀 승패
2. applyBoxToRoster(home/away)    ← 선수 시즌 스탯 누적
3. rosterUpdates 적용            ← 피로도/부상 반영
4. schedule 업데이트             ← played = true
5. updateSeriesState()           ← 플레이오프 처리 (해당 시)
6. DB 저장                       ← saveGameResults() 또는 savePlayoffGameResult()
7. AI 뉴스 + 메시지              ← generateGameRecapNews() (비활성), sendMessage()
```

---

### services/simulation/seasonService.ts
- 경기 후 시즌 이벤트 처리
- `handleSeasonEvents()` 반환: `{ updatedPlayoffSeries, newTransactions, newsItems, tradeToast }`

**처리 순서:**
```
1. 플레이오프 상태 확인
   ├─ 기존 시리즈 있으면: advancePlayoffState() → generateNextPlayoffGames()
   └─ 정규시즌 종료 시: checkAndInitPlayoffs() → 1라운드 브래킷 생성

2. CPU 트레이드 (정규시즌만, 30% 확률)
   ├─ simulateCPUTrades()
   └─ 트레이드 뉴스 생성

3. 플레이오프 상태 DB 저장
   └─ savePlayoffState()
```

---

### services/gameEngine.ts
```typescript
simulateGame(
    homeTeam: Team,
    awayTeam: Team,
    userTeamId: string | null,
    userTactics?: GameTactics,
    isHomeB2B: boolean,
    isAwayB2B: boolean,
    homeDepthChart?: DepthChart | null,
    awayDepthChart?: DepthChart | null
): SimulationResult
```
- PBP 엔진(`runFullGameSimulation`)의 얇은 wrapper
- CPU 게임 시: `userTeamId = null`, AI가 양팀 전술 자동 생성

---

### services/stateReplayer.ts
- 로그인 시 DB 히스토리에서 현재 게임 상태 재구성
- `replayGameState(baseTeams, baseSchedule, transactions, gameResults, simDate)`

**재구성 순서:**
```
1. baseTeams/baseSchedule 깊은 복사
2. transactions 날짜순 정렬 → applyTrade/applyInjuryUpdate
3. gameResults 날짜순 정렬 →
   ├─ schedule[].played/score 업데이트
   ├─ 팀 wins/losses 카운트
   ├─ tacticHistory 업데이트
   ├─ homeStats/awayStats 팀 집계 (리더보드용)
   └─ applyBoxScore() → 선수 시즌 스탯 누적
```

> **주의**: 라이브 세션에서 수행되는 `applyBoxToRoster()`와 동일 로직.
> 단, stateReplayer는 로그인 시만 호출. 세션 내 누적은 simulationUtils의 함수 사용.

---

### services/persistence.ts

| 함수 | 역할 |
|------|------|
| `saveCheckpoint()` | saves 테이블에 팀ID/날짜/전술/로스터상태/depthChart 저장 |
| `loadCheckpoint()` | saves 테이블에서 최신 체크포인트 로드 |
| `loadUserHistory()` | user_game_results + user_transactions 전체 로드 |

**saveCheckpoint() 저장 내용:**
```
{
  team_id: string,
  sim_date: string,
  tactics: GameTactics (JSON),
  roster_state: Record<playerId, { condition, health, injuryType, returnDate }>,
  depth_chart: DepthChart (JSON)
}
```

---

### utils/simulationUtils.ts

| 함수 | 역할 |
|------|------|
| `applyBoxToRoster(team, box)` | 박스스코어를 team.roster[].stats에 누적 |
| `updateTeamStats(home, away, homeScore, awayScore)` | 팀 승패 카운트 |
| `updateSeriesState(seriesList, seriesId, ...)` | 플레이오프 시리즈 상태 업데이트 |

> `applyBoxToRoster`는 `stateReplayer.ts`의 `applyBoxScore`와 동일 로직.
> 세션 내 라이브 스탯 누적을 담당. 이 함수가 없으면 리더보드가 로그인 후에만 갱신됨.

---

## SimulationResult 타입

```typescript
interface SimulationResult {
    homeScore: number;
    awayScore: number;
    homeBox: PlayerBoxScore[];       // 선수별 박스스코어
    awayBox: PlayerBoxScore[];
    homeTactics: any;                // 경기 전술 스냅샷
    awayTactics: any;
    rosterUpdates: Record<string, { condition, health, injuryType, returnDate }>;
    pbpLogs: PbpLog[];               // PBP 텍스트 로그
    rotationData: RotationData;      // 분 단위 in/out 기록
    pbpShotEvents?: ShotEvent[];     // Shot chart 데이터
    injuries?: InjuryEvent[];        // 경기 중 부상 이벤트
}
```

---

## PlayerBoxScore 주요 필드

```typescript
{
    playerId, playerName,
    pts, reb, offReb, defReb, ast, stl, blk, tov,
    fgm, fga, p3m, p3a, ftm, fta,
    rimM, rimA, midM, midA,          // 존별 슈팅
    mp, g, gs, pf, plusMinus,
    condition,                         // 경기 후 피로도
    zoneData?: object                  // 세부 존 슈팅 (shot chart)
}
```

---

## 상태 관리 핵심 원칙

1. **Mutation 기반**: `newTeams = deepClone(teams)` 후 직접 변경, `setTeams(newTeams)` 커밋
2. **라이브 세션 스탯**: `applyBoxToRoster()`로 누적 (replayState 없이도 현재 세션 스탯 유지)
3. **재구성 패턴**: 로그인 시만 `stateReplayer`로 재구성, 이후는 라이브 누적
4. **DB 저장 시점**: 유저 게임 완료 후 즉시 저장 (CPU 게임도 동일)
5. **hasInitialLoadRef**: 중복 초기화 방지 (React Query 재조회 시 중복 실행 차단)

---

## 데이터 흐름: 로그인 시 재구성

```
Supabase
    ├─ saves 테이블 → loadCheckpoint() → 팀ID, 날짜, 전술, roster_state
    ├─ user_game_results → loadUserHistory() → 박스스코어 전체
    ├─ user_transactions → loadUserHistory() → 트레이드 기록
    ├─ user_playoffs → loadPlayoffState() → 플레이오프 브래킷
    └─ user_playoffs_results → loadPlayoffGameResults() → 플레이오프 경기 결과

replayGameState(baseTeams, baseSchedule, transactions, allGameResults, simDate)
    └─ 누적된 박스스코어 → player.stats (선수 시즌 통계)

+ checkpoint.roster_state → 피로도/부상 상태 복원
+ checkpoint.depth_chart  → 깊이 차트 복원
```

---

## Dead Code (참고)

- `services/game/engine/shootingSystem.ts`: 이전 배치 방식 잔재, import 없음
- `services/game/engine/defenseSystem.ts`: PBP 엔진으로 대체
- `services/game/engine/foulSystem.ts`: possessionHandler 내 인라인으로 대체
- `services/game/engine/playmakingSystem.ts`: possessionHandler에 import만, 실제 호출 없음
- `services/queries.ts`의 players/schedule 관련 fallback: 해당 테이블 실제 없음
