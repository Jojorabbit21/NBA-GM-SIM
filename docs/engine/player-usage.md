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

## 역할 적합도 점수 (Role Fit Score) — `pickWeightedActor`의 rawScore 입력

`pickWeightedActor`(playTypes.ts)의 criteria 함수가 반환하는 rawScore는 대부분 `player.archetypes.*`
값을 조합해서 만든다 — 예: Iso는 `isoScorer + handler×0.5`, CatchShoot는 `spacer` 단독, PnR_Roll은
`roller + screener×0.5`.

**주의 — 필드명은 "아키타입"이지만 분류 시스템이 아니다.** `archetypeSystem.ts`의 `ArchetypeRatings`(11종:
handler/spacer/driver/screener/roller/popper/postScorer/isoScorer/connector/perimLock/rimProtector)는
선수를 몇 개 카테고리로 분류하는 게 아니라, **"이 선수를 지금 이 역할로 캐스팅했을 때 얼마나 적합한가"를
기존 raw 능력치의 가중평균으로 매 순간(피로도 반영) 계산하는 연속값**이다. `player.archetype`/
`secondaryArchetype`("Rim Protector", "Post Scoring Big" 같은 선수 정체성 라벨, →
[player-archetypes.md](player-archetypes.md))이나 threshold 기반 히든 보너스 시스템(→
[hidden-archetypes.md](hidden-archetypes.md))과는 이름만 겹칠 뿐 완전히 다른 세 번째 시스템이다.

### 11개 역할 점수 공식 (`archetypeSystem.ts:calculatePlayerArchetypes`)

전부 동일한 구조 — `getVal(가중치 합=1.0인 raw 능력치 선형결합)`, `getVal`은 피로도(condition) 배율만 적용:

| 역할 | 공식 |
|------|------|
| handler | handling×0.30 + passIq×0.25 + passVision×0.25 + passAcc×0.20 |
| spacer | threeVal×0.60 + shotIq×0.25 + offConsist×0.15 |
| driver | speed×0.20 + agility×0.15 + vertical×0.10 + ins×0.35 + mid×0.20 |
| screener | strength×0.40 + normHeight×0.30 + normWeight×0.30 |
| roller | ins×0.40 + vertical×0.30 + speed×0.30 |
| popper | threeVal×0.70 + shotIq×0.30 |
| postScorer | ins×0.50 + strength×0.30 + hands×0.20 |
| isoScorer | handling×0.25 + mid×0.25 + speed×0.25 + agility×0.25 |
| connector | passIq×0.30 + helpDefIq×0.20 + hustle×0.30 + hands×0.20 |
| perimLock | perDef×0.50 + agility×0.25 + stl×0.25 |
| rimProtector | blk×0.35 + intDef×0.35 + vertical×0.15 + normHeight×0.15 |

`normHeight = max(0, (height-185)×3)`, `normWeight = max(0, (weight-80)×1.6)` — screener/rimProtector 전용,
raw 키/몸무게(cm/kg)를 다른 능력치와 비슷한 0~100대 스케일로 정규화.

### `archetypesEnabled` 토글과 disabled 시 동작

`SimSettings.archetypesEnabled`(기본 `false`, 설정 UI에 "실험적"으로 라벨링됨)가 꺼져있으면 위 11개
공식을 계산하지 않고 **전부 50으로 반환**한다(`archetypeSystem.ts`의 `ARCHETYPES_DISABLED` 모듈 기본값도
`true`라 명시적으로 켜지 않는 한 싱글/멀티 어디서든 꺼진 채로 동작). git 히스토리 확인 결과 이 disabled
상태는 의도된 설계가 아니라 2026-03-07 `98f84a3 disabled player archetypes` 커밋(직전 커밋 `c1ea42c`로
동적 아키타입 시스템을 도입한 직후)에서 `★ TEMPORARY`로 표시된 채 응급 롤백된 뒤 재검토 없이 방치된
것으로 보인다 — 커밋 메시지에 사유가 안 남아있어 정확한 원인은 미상. 같은 커밋에서
`SIM_CONFIG.BLOCK`/`PLAYMAKING`/`CLUTCH_ARCHETYPE`/`ZONE_SHOOTING`(→ [hidden-archetypes.md](hidden-archetypes.md))도
함께 꺼졌으나, 이 4개는 별도 하드코딩 상수라 `archetypesEnabled`와 런타임으로 연결되어 있지 않다.

**2026-07-28부로 11개 전부 토글과 무관하게 항상 실계산하도록 수정됨.** 처음엔
`spacer`만 예외 처리했다가(CatchShoot 액터 선택의 유일한 신호였음), 조사 과정에서 disabled 상태가
`playTypes.ts`의 액터/패서 선택뿐 아니라 두 기능을 더 무력화하고 있는 걸 발견해 나머지도 정리함:
- **미스매치 판정**(`flowEngine.ts:296-320`) — `offSkill`(spacer/driver/postScorer) vs
  `defSkill`(perimLock/rimProtector) 비교인데, 수비 쪽이 50 고정이면 `skillGap`이 포지션 기반 케이스
  말고는 15 이상 못 나와 `hitRate -= 0.03` 페널티만 거의 항상 적용되던 상태였음
- **헬프 디펜스 블락 보너스**(`possessionHandler.ts:977`) — `rimProtector > HELP_RIM_THRESHOLD(75)`
  체크가 rimProtector 고정 50 때문에 누구에게도 절대 참이 될 수 없어 완전히 죽어있었음

`rebounder`는 실계산 대신 완전히 삭제됨(2026-07-28) — `archetypes.rebounder`를 읽는 코드가 엔진
어디에도 없는 dead code로 확인됐고(`reboundLogic.ts`는 raw 능력치를 직접 씀), 마침 같은 시기에
`reboundLogic.ts`에 hustle 능력치를 반영하는 별도 작업이 있어 굳이 살려둘 이유가 없다고 판단해
`ArchetypeRatings` 인터페이스/계산/반환 전부에서 제거함. 상세: [dev-log.md](../history/dev-log.md)의
관련 항목("spacer 아키타입, archetypesEnabled 토글과 무관하게 항상 실계산" / "역할 적합도 점수 11종
(rebounder 제외) 토글과 무관하게 항상 실계산" / "archetypes.rebounder dead code 삭제").

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

rawScore (spacer 역할 점수 — 3&D 윙이 높음, 아래 "역할 적합도 점수" 절 참조):

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
| `services/game/engine/pbp/archetypeSystem.ts` | calculatePlayerArchetypes — 역할 적합도 점수 12종 (rawScore 입력) |
| `hooks/useLeaderboardData.ts` | USG% 계산 공식 (Basketball-Reference 표준) |
