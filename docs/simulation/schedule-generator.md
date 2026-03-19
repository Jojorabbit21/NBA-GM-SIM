# 시즌 일정 자동생성 시스템

## 개요

`utils/scheduleGenerator.ts` — NBA 실제 경기 배분 공식 기반으로 82경기 × 30팀 시즌 일정을 자동 생성하는 독립 모듈.
현재 기존 코드와 연동되어 있지 않으며, 멀티시즌 전환 작업 시 연동 예정.

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `utils/scheduleGenerator.ts` | 스케줄 생성 알고리즘 전체 |
| `data/teamData.ts` | 팀 conference/division 정보 (입력) |
| `types/game.ts` | `Game` 인터페이스 (출력 타입) |

---

## API

```typescript
import { generateSeasonSchedule, validateSchedule, ScheduleConfig } from '../utils/scheduleGenerator';

const games: Game[] = generateSeasonSchedule({
    seasonYear: 2025,         // seed로도 사용 → 같은 시즌은 같은 일정
    seasonStart: '2025-10-21',
    regularSeasonEnd: '2026-04-12',
    allStarStart: '2026-02-13',
    allStarEnd: '2026-02-18',
});

// 검증
const result = validateSchedule(games, TEAM_DATA);
// result.valid === true, result.errors === []
```

---

## NBA 경기 배분 공식 (전통 방식, 82경기)

| 구분 | 상대 | 경기 수 | H/A | 소계 |
|------|------|---------|-----|------|
| 같은 디비전 | 4팀 × 4경기 | 2H/2A | 16 |
| 같은 컨퍼런스 비디비전 (Group A) | 6팀 × 4경기 | 2H/2A | 24 |
| 같은 컨퍼런스 비디비전 (Group B) | 4팀 × 3경기 | 2H/1A 또는 1H/2A | 12 |
| 다른 컨퍼런스 | 15팀 × 2경기 | 1H/1A | 30 |
| **합계** | | | **82** |

**수학적 검증**: 240(디비전) + 540(컨퍼런스 비디비전) + 450(인터컨퍼런스) = **1,230 경기**

---

## 알고리즘 구조

### 1. Seeded PRNG (Mulberry32)

- `seasonYear`를 seed로 사용 → **결정론적** (같은 seed = 같은 일정)
- 다른 시즌은 다른 일정 (Group A/B 로테이션, 셔플 순서 변경)
- Fisher-Yates 셔플에 사용

### 2. 매치업 생성 (generateMatchups)

**Step 2-1: 디비전 경기**
- 6개 디비전 × C(5,2)=10 페어 × 4경기(2H/2A) = 240 매치업

**Step 2-2: 컨퍼런스 비디비전 (Group A/B)**
- 핵심 문제: 10개 비디비전 상대 중 6팀=4경기(Group A), 4팀=3경기(Group B) 결정
- **순환 순열 기반 3-regular bipartite subgraph 생성**
  - 각 디비전 페어(5×5)에서 3개 순환 순열로 정확히 15 Group A 페어 선택
  - 3개 디비전 조합 × 15 = 45 Group A 페어 (수학적으로 보장)
  - 각 팀은 정확히 3+3 = 6 Group A 상대를 가짐
- Group A: 45페어 × 4경기 = 180, Group B: 30페어 × 3경기 = 90 → 270 × 2컨퍼런스 = 540

**Step 2-3: 인터컨퍼런스**
- 15(East) × 15(West) = 225 페어 × 2경기(1H/1A) = 450 매치업

### 3. H/A 밸런스 보정 (balanceHomeAway)

- Group B의 3경기 배분(2H/1A 또는 1H/2A)으로 41/41에서 벗어날 수 있음
- 반복 보정: 홈 초과 팀의 매치업 H/A를 스왑 (상대 팀 밸런스도 동시 확인)
- 최대 50회 반복으로 수렴

### 4. 날짜 배정 (assignDates) — Rest-First 알고리즘

**핵심 아이디어**: 각 날짜에 대해 "쉰 팀" 우선 배정.

**Phase A (non-B2B 우선)**:
- 양 팀 모두 어제 안 뛰었는 매치업만 배정
- 목표 경기 수의 `target - 1`까지 채움 (B2B용 1자리 남김)

**Phase B (B2B 허용, 예산 내)**:
- 한 팀만 B2B인 매치업 허용
- 양쪽 모두 B2B면 스킵
- 팀당 B2B 예산 15회 초과 시 추가 B2B 불가

**Hard constraints (절대 위반 불가)**:
- 한 팀이 같은 날 2경기 불가
- 3일 연속 3경기 불가 (3-in-3 금지)

**Pass 2 (미배치 매치업)**:
- B2B 예산 무시, 3-in-3만 방지하며 배정

### 5. B2B 후처리 (balanceBackToBacks)

- B2B 16회 초과 팀의 경기를 인접 날짜로 이동 시도
- 이동 시 3-in-3 발생하지 않는지 검증
- 최대 200회 반복

### 6. 경기 시간 배정 (assignGameTimes)

**핵심 원칙**: 홈팀 도시의 시간대 기준 현지 약 7:00 PM 시작을 ET(미국 동부 표준시)로 환산.
모든 시간은 ET 기준 `'HH:MM'` 형식으로 `Game.time`에 저장.

#### 팀별 기본 슬롯

| 시간대 | 해당 팀 (홈) | ET 기준 슬롯 | 현지 시간 |
|--------|-------------|-------------|----------|
| ET (Eastern) | atl, bos, bkn, cha, cle, det, ind, mia, nyk, orl, phi, tor, was | **19:30** | 7:30 PM ET |
| CT (Central) | chi, dal, hou, mem, mil, min, no, okc, sa | **20:00** | 7:00 PM CT |
| MT (Mountain) | den, phx, uta | **21:00** | 7:00 PM MT |
| PT (Pacific) | gs, law, lam, por, sac | **22:00** | 7:00 PM PT |

#### 슬롯 충돌 처리 규칙

같은 날 같은 슬롯에 여러 경기가 몰릴 수 있음 (NBA 실제로도 동시간대 복수 경기 진행).

1. 날짜별 경기를 ET 빠른 순으로 정렬
2. 동일 슬롯 **최대 3경기**까지 허용 (동시간대 중복 방송 허용)
3. 초과 시 다음 허용 슬롯(`+30분`)으로 이동 → 그 슬롯도 꽉 찼으면 다시 다음 슬롯 탐색
4. 허용 슬롯 범위: `19:00 ~ 22:30` (30분 단위, 총 8개 슬롯)

```
예시: 서부 원정팀 다수가 동부팀 홈 경기에 방문하는 날
  19:30 → bos vs gs (bos 홈), phi vs lam (phi 홈), nyk vs sac (nyk 홈)   [3경기 허용]
  20:00 → was vs por (was 홈), det vs den (det 홈) ...                    [슬롯 이동 없음]

예시: PT 팀 홈경기 4개가 같은 날 겹칠 때
  22:00 → gs vs okc, lam vs sa, sac vs dal                               [3경기]
  22:30 → law vs hou                                                      [초과 → 다음 슬롯]
```

#### 처리 순서

```
generateSeasonSchedule()
  → Step 7: 날짜순 정렬 + Game[] 변환
  → Step 8: assignGameTimes(games)
      ├── 날짜별 그룹핑
      ├── 홈팀 기본 슬롯 기준 정렬 (ET 빠른 순)
      └── 슬롯 카운트 추적 → 초과 시 다음 슬롯 탐색
```

---

## 검증 시스템 (validateSchedule)

반환값: `ScheduleValidation` (총 경기 수, 팀별 상세 통계, 에러 목록)

### 검증 항목
- 총 경기 수 = 1,230
- 팀당 총 경기 수 = 82 (홈 41 / 원정 41)
- 디비전 경기 수 = 16 (팀당)
- 인터컨퍼런스 경기 수 = 30 (팀당)
- 같은 날 2경기 없음
- 3-in-3 없음

---

## 성능 (검증 결과)

| 항목 | 값 |
|------|-----|
| 생성 시간 | ~50-80ms (Node 14) |
| B2B 범위 | 5~15회 (팀별) |
| B2B 평균 | ~10.5회 |
| 하루 경기 수 | 4~10 (평균 7.3) |
| 게임일 수 | ~168일 (올스타 브레이크 제외) |
| 5시즌 연속 테스트 | 모두 PASS |
| 결정론적 검증 | PASS (같은 seed = 같은 결과) |

---

## 출력 포맷

```typescript
interface Game {
    id: string;           // 'g_{home}_{away}_{YYYY-MM-DD}'
    homeTeamId: string;
    awayTeamId: string;
    date: string;         // 'YYYY-MM-DD'
    time?: string;        // 'HH:MM' ET 기준 (예: '19:30', '22:00')
    played: false;
    isPlayoff: false;
}
```

`time` 필드는 항상 채워짐 (동적 생성 시 `assignGameTimes()` 자동 호출).
`meta_schedule` DB 로드 시에는 `game_time` 컬럼 → `time` 필드로 매핑.

### meta_schedule 테이블 구조 (현행)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | TEXT PK | `g_{home}_{away}_{YYYY-MM-DD}` |
| `game_date` | DATE | 경기 날짜 |
| `game_time` | TEXT | 경기 시작 시간 (ET 기준 `'HH:MM'`) |
| `home_team_id` | TEXT | 홈팀 약어 |
| `away_team_id` | TEXT | 원정팀 약어 |
| `home_score` | INTEGER | 경기 전 NULL |
| `away_score` | INTEGER | 경기 전 NULL |
| `played` | BOOLEAN | |
| `is_playoff` | BOOLEAN | |
| `series_id` | TEXT | 플레이오프 시리즈 ID (정규시즌 NULL) |

`game_time` 컬럼은 `scripts/migrate_game_time.sql`로 추가됨 (nullable, 기존 데이터 호환).

---

## 연동 계획 (멀티시즌 전환 시)

> 아래 내용은 `docs/plan/multi-season-plan.md`와 연계됨.

### 현재 상태
- 1시즌(2025-26): `meta_schedule` SQL(ESPN API 원본) 사용
- `scheduleGenerator.ts`는 독립 모듈로 존재, 기존 코드에서 호출하지 않음

### 연동 시 수정 필요 사항

**1. seasonConfig에서 ScheduleConfig 생성 (이미 완료)**

```typescript
// utils/seasonConfig.ts (신규 예정)
export function buildScheduleConfig(seasonNumber: number): ScheduleConfig {
    const startYear = 2024 + seasonNumber;  // 시즌 1 = 2025-26
    return {
        seasonYear: startYear,
        seasonStart: `${startYear}-10-21`,
        regularSeasonEnd: `${startYear + 1}-04-12`,
        allStarStart: `${startYear + 1}-02-13`,
        allStarEnd: `${startYear + 1}-02-18`,
    };
}
```

**2. 시즌 전환 시 호출 위치**

```
handleStartNextSeason() (hooks/useGameData.ts 또는 offseasonService.ts)
  → ...
  → const config = buildScheduleConfig(nextSeasonNumber);
  → const schedule = generateSeasonSchedule(config);
  → setSchedule(schedule);  // in-memory 교체
```

**3. 첫 시즌(2025-26) 처리 옵션**

| 옵션 | 설명 |
|------|------|
| A. meta_schedule 유지 | 시즌 1만 ESPN 원본 사용, 시즌 2부터 생성기 사용 |
| B. 생성기로 통합 | 시즌 1도 생성기 사용 (meta_schedule 폐기). 날짜/매치업이 실제 NBA와 달라짐 |

**권장: 옵션 A** — 시즌 1은 실제 데이터로 현실감 유지, 시즌 2부터 생성기 전환.

**4. 수정 대상 파일 (예상)**

| 파일 | 변경 내용 |
|------|-----------|
| `hooks/useGameData.ts` | 시즌 2+ 로드 시 `generateSeasonSchedule()` 호출 |
| `services/queries.ts` | `useBaseData()`에서 시즌별 스케줄 소스 분기 |
| `services/stateReplayer.ts` | 시즌별 스케줄 소스 분기 |
| `utils/seasonConfig.ts` (신규) | `buildScheduleConfig()` + `buildSeasonConfig()` |
| `utils/constants.ts` | 하드코딩 날짜 → `seasonConfig` 참조로 교체 |
| `views/ScheduleView.tsx` | `MIN_MONTH`/`MAX_MONTH` → `seasonConfig` props |

**5. 게임 ID 충돌 방지**

시즌이 다르면 같은 팀 매치업+날짜가 겹칠 수 있음 (날짜 offset이 1년이므로 실제로는 겹치지 않음).
만약 게임 ID에 시즌 정보가 필요하면: `s{seasonNumber}_g_{home}_{away}_{date}` 형태로 변환.
이는 `user_game_results` 등에서 시즌 간 ID 고유성을 보장.

**6. 플레이오프 일정과의 관계**

플레이오프 일정은 `playoffLogic.ts`에서 런타임 생성되므로 `scheduleGenerator`와 무관.
레귤러 시즌이 끝나면 기존 플레이오프 생성 로직이 그대로 동작.
