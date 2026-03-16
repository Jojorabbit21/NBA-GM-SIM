# 플레이오프 시스템

> NBA-GM-SIM의 플레이오프 브래킷 진행, 타이브레이커, 일정 생성 로직 문서.
> 핵심 파일: `utils/playoffLogic.ts`, `utils/tiebreaker.ts`, `services/simulation/seasonService.ts`

---

## 전체 포스트시즌 흐름

```
정규시즌 종료
    │
    ▼
checkAndInitPlayoffs()          ← Play-In 브래킷 생성 (Round 0)
    │
    ▼
[매일 시뮬레이션 루프]
    ├─ updateSeriesState()      ← 경기 결과 → 시리즈 승수 변경 (직접 mutation)
    ├─ advancePlayoffState()    ← 브래킷 진행 (Play-In → R1 → Semis → CF → Finals)
    ├─ generateNextPlayoffGames() ← 다음 경기 일정 생성
    └─ savePlayoffState()       ← DB 저장 (항상 실행)
```

---

## 타이브레이커 시스템

### 파일: `utils/tiebreaker.ts`

NBA 실제 규칙 기반 간소화 버전. 시즌 종료 후 순위 결정 및 플레이오프 시딩에 사용.

**적용 순서:**
1. **승률 (PCT)** — `wins / (wins + losses)` 내림차순
2. **상대전적 (H2H)** — 두 팀 간 직접 대결 승패
3. **컨퍼런스 승률** — 같은 컨퍼런스 내 경기만 집계 (같은 컨퍼런스 팀 비교 시만)
4. **점수차 (Diff)** — 시즌 전체 총득점 - 총실점
5. **폴백: 승수** — 위 기준으로도 동률이면 승수 내림차순

### 주요 함수

| 함수 | 설명 |
|------|------|
| `computeH2HMap(schedule)` | 모든 팀 쌍의 상대전적 사전 계산 (정규시즌만) |
| `createTiebreakerComparator(teams, schedule)` | `Array.sort()`에 직접 사용 가능한 비교 함수 반환 |
| `rankByConference(teams, schedule, conf)` | 컨퍼런스별 최종 순위 반환 |

### 적용 위치

| 위치 | 용도 |
|------|------|
| `utils/playoffLogic.ts` — `checkAndInitPlayoffs()` | 시즌 종료 후 시딩 결정 |
| `utils/playoffLogic.ts` — `advancePlayoffState()` | R1 생성 시 시딩 결정 |
| `views/StandingsView.tsx` | 순위표 UI 렌더링 |
| `services/reportGenerator.ts` | 시즌 리포트 생성 (선택적) |

> **주의**: 타이브레이커가 없으면 동률 팀이 정렬 순서에 따라 10위 안에 들거나 빠지면서,
> 순위표에서 11팀이 플레이오프 진출하는 것처럼 보이는 버그가 발생함.

---

## 플레이오프 브래킷 구조

### Round 0: Play-In Tournament

각 컨퍼런스별 3개 시리즈 (단판):

| 시리즈 ID | 매치업 | 결과 |
|-----------|--------|------|
| `{conf}_PI_7v8` | 7시드 vs 8시드 | 승자 → 7시드 확정 |
| `{conf}_PI_9v10` | 9시드 vs 10시드 | 패자 탈락 |
| `{conf}_PI_8th_Decider` | 7v8 패자 vs 9v10 승자 | 승자 → 8시드 확정 |

- 8th_Decider 시리즈는 초기에 `TBD_7v8_LOSER`, `TBD_9v10_WINNER`로 생성
- 7v8, 9v10 완료 후 `advancePlayoffState()`에서 실제 팀 ID로 교체

### Round 1: First Round (7전4선)

```
M1: 1시드 vs 8시드  ──┐
                      ├─ S1 (Semis 1)
M2: 4시드 vs 5시드  ──┘
M3: 3시드 vs 6시드  ──┐
                      ├─ S2 (Semis 2)
M4: 2시드 vs 7시드  ──┘
```

시리즈 ID 형식: `{conf}_R1_{M1|M2|M3|M4}`

### Round 2~4: Semis → Conference Finals → NBA Finals

| 라운드 | ID 형식 | targetWins |
|--------|---------|-----------|
| Semis (2) | `{conf}_SEMIS_{S1\|S2}` | 4 |
| Conf Finals (3) | `{conf}_FINALS` | 4 |
| NBA Finals (4) | `BPL_FINALS` | 4 |

---

## 브래킷 진행 로직

### `advancePlayoffState(seriesList, teams, schedule)`

3단계 재귀적 진행:

```
Phase 1: Play-In TBD 해소
    └─ 7v8/9v10 완료 시 → 8th_Decider에 실제 팀 ID 설정

Phase 2: R1 생성
    └─ Play-In 전부 끝나면 → R1 4개 시리즈 생성 (tiebreaker 기반 시딩)

Phase 3: 트리 진행 (ensureNextSeries 패턴)
    3a. R1 → Semis    (M1,M2 → S1 / M3,M4 → S2)
    3b. Semis → CF     (S1,S2 → {conf}_FINALS)
    3c. CF → Finals    (East_FINALS, West_FINALS → BPL_FINALS)
```

### `ensureNextSeries()` 패턴
- 다음 라운드 시리즈가 없으면 생성 (TBD 슬롯)
- 이미 있으면 TBD 슬롯을 승자 ID로 교체
- 변경 발생 시 `changed = true` → 새 배열 반환

### Phase 3c 조건 (중요)

```typescript
// 올바른 코드 (&&)
if (eastCF && westCF) {
    const finals = ensureNextSeries('BPL_FINALS', 4, 'BPL', ...);
}
```

> **주의**: `||`을 사용하면 한쪽 컨퍼런스만 끝났을 때 BPL_FINALS가 TBD 상태로 조기 생성되어,
> 이후 나머지 컨퍼런스 승자가 채워지지 않는 버그 발생.

---

## 일정 생성

### `generateNextPlayoffGames(schedule, seriesList, currentDate)`

각 활성 시리즈에 대해:
1. 미진행 경기(`!played`) 있으면 스킵
2. 없으면 다음 경기 생성

**홈코트 어드밴티지 (2-2-1-1-1):**
- 상위 시드 홈: 1, 2, 5, 7차전
- 하위 시드 홈: 3, 4, 6차전
- Play-In: 항상 상위 시드 홈

**일정 간격:** 2일 (이전 경기 기준)

게임 ID 형식: `po_{seriesId}_g{gameNum}`

---

## 플레이오프 상태 저장

### `seasonService.ts` — `handleSeasonEvents()`

```typescript
// 플레이오프 상태 저장 조건
if (!isGuestMode && updatedSeries.length > 0 && userId) {
    savePlayoffState(userId, updatedSeries);
}
```

> **설계 결정**: 플레이오프 기간 중에는 **항상** `savePlayoffState()` 호출.
>
> 이전 구현에서는 `playoffUpdateTriggered` 플래그로 조건부 저장했으나,
> `updateSeriesState()`가 시리즈 객체를 직접 mutation하기 때문에
> `advancePlayoffState()`나 `generateNextPlayoffGames()`에서 변경을 감지하지 못하는 경우가 있었음.
> 특히 시리즈 최종전(클린치 게임) 후 새로운 라운드가 아직 시작되지 않았을 때
> DB 저장이 누락되어, 다음 로그인 시 시리즈 승수가 롤백되는 버그 발생.

---

## 핵심 함수 시그니처

```typescript
// playoffLogic.ts
checkAndInitPlayoffs(teams: Team[], schedule: Game[], currentSeries: PlayoffSeries[], currentDate: string): PlayoffSeries[]
advancePlayoffState(seriesList: PlayoffSeries[], teams: Team[], schedule: Game[]): PlayoffSeries[]
generateNextPlayoffGames(schedule: Game[], seriesList: PlayoffSeries[], currentDate: string): { newGames: Game[], updatedSeries: PlayoffSeries[] }

// tiebreaker.ts
computeH2HMap(schedule: Game[]): Map<string, Map<string, H2HRecord>>
createTiebreakerComparator(teams: Team[], schedule: Game[]): (a: Team, b: Team) => number
rankByConference(teams: Team[], schedule: Game[], conference: 'East' | 'West'): Team[]

// simulationUtils.ts
updateSeriesState(seriesList: PlayoffSeries[], seriesId: string, homeId: string, awayId: string, homeScore: number, awayScore: number): void  // ⚠️ 직접 mutation
```

---

## 버그 수정 이력

### 1. 타이브레이커 부재 (순위표 버그)
- **증상**: 시즌 종료 후 순위표에서 11팀이 플레이오프 진출로 표시되거나 9팀만 표시
- **원인**: 모든 랭킹 함수가 PCT → wins 단순 비교만 사용, 동률 처리 없음
- **수정**: `utils/tiebreaker.ts` 신규 생성, 4개 파일에 적용

### 2. 파이널 일정 미생성 (4차전 이후)
- **증상**: NBA Finals Game 5~7 일정이 생성되지 않음
- **원인 1**: `playoffUpdateTriggered` 플래그가 `updateSeriesState()`의 mutation을 감지 못함 → 시리즈 승수 변경 후 DB 저장 누락
- **원인 2**: Phase 3c에서 `eastCF || westCF` 조건으로 BPL_FINALS가 TBD 상태로 조기 생성
- **수정**: `playoffUpdateTriggered` 제거 (항상 저장) + `||` → `&&` 변경
