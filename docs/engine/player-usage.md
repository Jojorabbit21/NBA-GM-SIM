# USG% 현실화 — 액터 선택 확률 시스템

## 문제 배경

시뮬레이션에서 1옵션 에이스의 단일 경기 USG%가 **50~55%**에 달하는 현상이 빈번했음.
현실 NBA에서 시즌 최고 USG%는 35%(Giannis 2024-25), 단일 경기 역대 최고는 62.4%(코비 은퇴경기).
50%+ USG%가 매 경기 나오는 것은 명백한 비현실.

### 원인: 3중 곱셈 효과

`pickWeightedActor` (playTypes.ts)에서 액터 선택 가중치를 계산할 때:

```
weight = pow(rawScore, 2.5) × usageMultiplier × ballDominance × playStyle
```

| 증폭 요소 | 1옵 vs 5옵 배율 |
|----------|---------------|
| `pow(score, 2.5)` | ~11x |
| USAGE_WEIGHTS Iso `[6.0, ..., 0.05]` | **120x** |
| ballDominance (극단) | ~2x |
| playStyle (극단) | ~1.9x |
| **합산** | **~5,000x** |

추가로 `gravityBoost`가 최대 0.9까지 올라가며 Hero 플레이 비중을 65%까지 끌어올림.

---

## 수정 내역 (3개 파일)

### A. pow(2.5) → 선형 (playTypes.ts:170)

```typescript
// Before
let weight = Math.pow(Math.max(1, rawScore), 2.5) * usageMultiplier;

// After
let weight = Math.max(1, rawScore) * usageMultiplier;
```

**왜 1.0(선형)인가:**
- USAGE_WEIGHTS가 **이미** 계층 구조를 만듦 (1옵션에 높은 가중치)
- pow 함수가 **같은 방향으로 이중 증폭**하면 과도한 집중 발생
- pow=1.0이면 rawScore 차이(130 vs 74 = 1.76x)만 반영, 나머지는 USAGE_WEIGHTS에 위임

### B. USAGE_WEIGHTS 비율 압축 (usageWeights.ts)

1옵:5옵 비율을 **120:1 → 6~8:1**로 압축.

```
                          Before                     After
                    [Rank1, ..., Rank5]         [Rank1, ..., Rank5]
Hero:
  Iso:              [6.0, 2.5, 0.4, 0.1, 0.05] → [2.5, 1.8, 1.2, 0.7, 0.4]
  PostUp:           [5.0, 2.5, 0.6, 0.15, 0.05]→ [2.2, 1.6, 1.0, 0.6, 0.3]
  PnR_Handler:      [5.0, 2.2, 0.8, 0.2, 0.1] → [2.5, 1.8, 1.2, 0.7, 0.4]

Designed:
  Handoff:          [2.5, 1.8, 1.0, 0.6, 0.3] → [2.0, 1.6, 1.2, 0.8, 0.5]
  PnR_Pop:          [1.8, 1.6, 1.2, 0.8, 0.5] → [1.6, 1.4, 1.2, 0.9, 0.6]

System:
  PnR_Roll:         [1.5, 1.4, 1.2, 1.0, 0.8] → [1.3, 1.2, 1.1, 1.0, 0.9]
  CatchShoot:       [1.8, 1.4, 1.2, 0.9, 0.6] → [1.5, 1.3, 1.2, 1.0, 0.8]
  Cut:              [1.6, 1.3, 1.2, 1.0, 0.7] → [1.4, 1.2, 1.1, 1.0, 0.8]

Chaos (변경 없음):
  Transition:       [1.0, 1.0, 1.0, 1.0, 1.0]
  Putback:          [1.0, 1.0, 1.0, 1.0, 1.0]
```

### C. gravityBoost 계수 축소 + 캡 (possessionHandler.ts:335)

```typescript
// Before
const gravityBoost = Math.max(0, (topGravity - 60) * 0.03);
// gravity 90 → 0.9 (Hero 90% 증가!)

// After
const gravityBoost = Math.min(0.30, Math.max(0, (topGravity - 65) * 0.015));
// gravity 90 → 0.30 (캡), gravity 78 → 0.195, gravity 65 이하 → 0
```

| topGravity | Before | After |
|------------|--------|-------|
| 90 (엘리트) | 0.90 | **0.30** |
| 80 | 0.60 | **0.225** |
| 70 | 0.30 | **0.075** |
| 65 이하 | 0.15~0 | **0** |

---

## 수학적 검증

### Iso 액터 선택 확률

일반적인 5인 라인업 rawScore (isoScorer + handler×0.5):

| Rank | rawScore | × weight | 정규화 | (기존) |
|------|----------|----------|--------|-------|
| 1 (에이스) | 130 | × 2.5 = 325 | **44.7%** | 99%+ |
| 2 | 111 | × 1.8 = 200 | **27.5%** | 0.8% |
| 3 | 95 | × 1.2 = 114 | **15.7%** | 0.1% |
| 4 | 83 | × 0.7 = 58 | **8.0%** | ~0% |
| 5 (역할) | 74 | × 0.4 = 30 | **4.1%** | ~0% |

### CatchShoot 액터 선택 확률

rawScore (spacer 아키타입 — 3&D 윙이 높음):

| Rank | rawScore (spacer) | × weight | 정규화 |
|------|-------------------|----------|--------|
| 1 (스타) | 75 | × 1.5 = 113 | **26.8%** |
| 2 | 70 | × 1.3 = 91 | **21.6%** |
| 3 (3&D) | 85 | × 1.2 = 102 | **24.2%** |
| 4 | 72 | × 1.0 = 72 | **17.1%** |
| 5 | 55 | × 0.8 = 44 | **10.4%** |

→ 3&D 윙(Rank 3)이 CatchShoot에서 스타보다 많이 선택됨 = 현실적

### 전체 USG% 추정

하프코트 플레이 분배 (gravityBoost=0.30, 슬라이더=5):
- Hero (Iso+PnR_Handler+PostUp): **54%**
- System (CatchShoot+Cut+Handoff+PnR_Roll+PnR_Pop): **46%**

전체 포세션: 하프코트 80%, Transition 15%, Putback 5%

| 역할 | Hero 점유 | System 점유 | Trans/Put | **USG%** |
|------|----------|-----------|-----------|---------|
| 1옵션 | 45% | 25% | 20% | **~33%** |
| 2옵션 | 28% | 22% | 20% | **~24%** |
| 3옵션 | 15% | 22% | 20% | **~19%** |
| 4옵션 | 8% | 17% | 20% | **~14%** |
| 5옵션 | 4% | 14% | 20% | **~11%** |

---

## 현실 NBA 비교 (2024-25 시즌)

### 리그 USG% 리더

| 선수 | 팀 | USG% |
|------|-----|------|
| Giannis Antetokounmpo | MIL | 35.2% |
| Shai Gilgeous-Alexander | OKC | 34.6% |
| Cade Cunningham | DET | 33.2% |
| Anthony Edwards | MIN | 31.3% |
| Jayson Tatum | BOS | 31.1% |
| 리그 평균 | | **20.0%** |

### 팀별 USG% 분포 예시

**OKC Thunder (스타 원톱)**:

| 역할 | 선수 | USG% |
|------|------|------|
| 1옵션 | SGA | 34.6% |
| 2옵션 | Jalen Williams | 26.3% |
| 3옵션 | Chet Holmgren | 21.7% |
| 4옵션 | Aaron Wiggins | 20.1% |
| 5옵션 | Cason Wallace | 14.8% |

**Rockets (밸런스)**:

| 역할 | 선수 | USG% |
|------|------|------|
| 1옵션 | Jalen Green | 27.3% |
| 2옵션 | Alperen Sengun | 26.1% |
| 3옵션 | Fred VanVleet | 17.7% |

### 단일 경기 USG% 역대 기록 (15분+ 출전)

| 선수 | USG% | 날짜 |
|------|------|------|
| Kobe Bryant (은퇴경기) | 62.4% | 2016-04-13 |
| James Harden | 60.6% | 2019-01-14 |
| Michael Jordan | 59.0% | 2001-12-29 |
| Russell Westbrook | 58.0% | 2017-03-07 |

→ 단일 경기 50%+는 **역대급 이상치**이며, 매 경기 나올 수 없는 수치.

---

## Before/After 요약

| 지표 | Before | After |
|------|--------|-------|
| 1옵션 단일경기 USG% | 50~55% | **30~38%** |
| 5옵션 단일경기 USG% | 5~8% | **8~14%** |
| 1옵:5옵 weight 비율 (Iso) | ~5,000:1 | **~11:1** |
| Hero 플레이 비중 | ~65% | **~54%** |
| gravityBoost 최대 | 0.9 | **0.30** |
| pow 지수 | 2.5 | **1.0 (선형)** |

## 관련 파일

| 파일 | 역할 |
|------|------|
| `services/game/engine/pbp/playTypes.ts` | pickWeightedActor — pow 지수, 텐던시 적용 |
| `services/game/config/usageWeights.ts` | PLAY_TYPE_USAGE_WEIGHTS — 옵션별 가중치 |
| `services/game/engine/pbp/usageSystem.ts` | scoringGravity, optionRank, getTopPlayerGravity |
| `services/game/engine/pbp/possessionHandler.ts` | 플레이타입 선택, gravityBoost, Star Gravity |
| `hooks/useLeaderboardData.ts` | USG% 계산 공식 (Basketball-Reference 표준) |
