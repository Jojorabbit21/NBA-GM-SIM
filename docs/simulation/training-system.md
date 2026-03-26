# 오프시즌 훈련 시스템 (Training System)

> **구현 파일**: `services/coachingStaff/trainingEngine.ts`
> **타입 정의**: `types/training.ts`
> **오프시즌 연동**: `services/simulation/offseasonEventHandler.ts`
> **UI 진입점**: `/training` → `pages/TrainingPage.tsx` → `views/TrainingView.tsx`

---

## 1. 시스템 개요

훈련 시스템은 **오프시즌 한정**으로 동작하는 선수 성장 파이프라인이다. GM이 배분한 훈련 포인트와 코칭스태프 능력치가 결합해 각 선수의 능력치를 성장시킨다. 정규시즌 경기 결과와는 완전히 독립적으로 작동한다.

### 핵심 원칙

| 원칙 | 설명 |
|---|---|
| **오프시즌 전용** | `moratoriumStart` 도달 시 `processOffseason()` 직후 1회 실행 |
| **트레이드오프 구조** | 총 포인트가 고정되어 있어 어디에 집중하느냐가 전략적 선택 |
| **코치 효율 반감** | 해당 담당 코치 미배치 시 효율 50%로 자동 반감 |
| **기존 개발 시스템 재활용** | `applyDevelopmentResult()` (playerAging.ts)를 그대로 호출 |
| **하위 호환** | `league_training_configs` 없으면 훈련 단계 전체 스킵 |

---

## 2. 오프시즌 파이프라인 위치

```
moratoriumStart 날짜 도달
  │
  ├─ processOffseason(teams, ...)     ← 에이징 / 계약만료 / 은퇴 처리
  │
  └─ processOffseasonTraining(        ← 훈련 시스템 (processOffseason 직후)
         teams,
         leagueTrainingConfigs,
         leagueCoachingData
     )
```

`offseasonEventHandler.ts`의 `handleMoratoriumStart()` 내부에서 순차 호출. `leagueTrainingConfigs` 또는 `leagueCoachingData`가 `null/undefined`이면 훈련 단계 전체를 스킵한다.

---

## 3. 총 훈련 포인트 계산

```typescript
// types/training.ts
export function calcTotalTrainingPoints(budget: number): number {
    return Math.floor(80 + budget / 250_000);
}
```

| 훈련 예산 | 총 포인트 |
|---|---|
| $0 | 80pt |
| $3M (기본값) | 80 + 12 = **92pt** |
| $5M | 80 + 20 = **100pt** |
| $10M | 80 + 40 = **120pt** |
| $15M | 80 + 60 = **140pt** |
| $20M (최대) | 80 + 80 = **160pt** |

### 예산 재정 연동

- `TeamFinance.expenses.trainingBudget` 필드로 저장
- 기본값: `$3,000,000` (revenueCalculator.ts 초기화 시 설정)
- `budgetManager.ts`의 `loadFromSaveData()`: 기존 saves에 필드 없으면 `$3M` fallback 적용
- TrainingView에서 슬라이더($0~$20M, $250K 단위)로 조정

---

## 4. 10개 훈련 프로그램

### 4-1. 프로그램 정의 테이블

| 변수명 | 라벨 | 담당 코치 | 영향 능력치 (개수) |
|---|---|---|---|
| `shootingTraining` | 슈팅 훈련 | OC | midRange, threeCorner, three45, threeTop, ft, offConsist (6개) |
| `insideTraining` | 인사이드 훈련 | OC | closeShot, layup, dunk, postPlay, drawFoul, hands (6개) |
| `playmakingTraining` | 플레이메이킹 훈련 | OC | passAcc, handling, spdBall, passVision, offBallMovement (5개) |
| `manDefTraining` | 대인 수비 훈련 | DC | perDef, intDef, steal, blk (4개) |
| `helpDefTraining` | 팀 수비 훈련 | DC | helpDefIq, passPerc, defConsist (3개) |
| `reboundTraining` | 리바운드 훈련 | DC | offReb, defReb, boxOut (3개) |
| `explosivnessTraining` | 폭발력 훈련 | Trainer | speed, agility, vertical (3개) |
| `strengthTraining` | 근력·지구력 훈련 | Trainer | strength, stamina, hustle, durability (4개) |
| `offTacticsTraining` | 공격 전술 훈련 | HC + Dev | shotIq, passIq, passVision (3개) |
| `defTacticsTraining` | 수비 전술 훈련 | HC + Dev | helpDefIq, defConsist, intangibles (3개) |

> **중복 능력치 주의**: `passVision`은 playmakingTraining과 offTacticsTraining 양쪽에 포함됨. `helpDefIq`와 `defConsist`는 helpDefTraining과 defTacticsTraining 양쪽에 포함됨. 두 프로그램에 모두 투자하면 해당 능력치가 두 번 적용되어 성장이 빠름.

### 4-2. 포인트 배분 제약

```typescript
// processOffseasonTraining 내부
const maxPerProgram = Math.floor(totalPoints * 0.5);
const allocCapped: Record<TrainingProgramKey, number> = {} as any;
for (const key of TRAINING_PROGRAM_KEYS) {
    allocCapped[key] = Math.min(config.program[key] ?? 0, maxPerProgram);
}
```

- **개별 프로그램 최대 cap**: `totalPoints × 50%`
  - 예) 총 92pt → 단일 프로그램 최대 46pt
  - 예) 총 120pt → 단일 프로그램 최대 60pt
- **목적**: 1개 프로그램 몰빵으로 전체 팀 능력치를 왜곡하는 것 방지
- **주의**: 총 합계 ≤ totalPoints 검증은 UI(TrainingView)에서 수행; 엔진 내부에서는 개별 cap만 적용

### 4-3. 기본값 (균등 배분)

```typescript
// types/training.ts
export function getDefaultTrainingConfig(): TeamTrainingConfig {
    return {
        budget: 3_000_000,
        program: {
            shootingTraining:     10,
            insideTraining:       10,
            playmakingTraining:   10,
            manDefTraining:       10,
            helpDefTraining:      10,
            reboundTraining:      10,
            explosivnessTraining: 10,
            strengthTraining:     10,
            offTacticsTraining:   10,
            defTacticsTraining:   10,
        },
    };
}
```

총 100pt 균등 배분 → 총 포인트 92pt와 8pt 차이가 발생하므로, 실제로는 프로그램 합계가 총 포인트보다 클 수 있음. 엔진은 cap만 적용하므로 초과분은 그대로 처리됨 (UI가 합계 검증 담당).

---

## 5. 코치 효율 계산 (`computeTrainingEfficiency`)

### 5-1. 정규화 공식

```typescript
// trainingEngine.ts 내부 헬퍼
function norm(raw: number): number {
    return Math.min(1.0, Math.max(0.5, raw / 99 * 0.5 + 0.5));
}
```

- 입력: 코치 능력치 가중합 (0~99 스케일)
- 출력: 훈련 효율 (0.5~1.0)
- 의미: 최악의 코치도 50% 효율 보장; 최고의 코치(all 99)는 100% 효율

### 5-2. 프로그램별 효율 공식

#### OC 담당 (공격 3개 프로그램)

```
shootingEff   = norm(OC.teaching × 0.5 + OC.schemeDepth × 0.3 + OC.communication × 0.2)
insideEff     = norm(OC.teaching × 0.6 + OC.playerEval × 0.2 + OC.communication × 0.2)
playmakingEff = norm(OC.teaching × 0.4 + OC.schemeDepth × 0.4 + OC.communication × 0.2)
```

OC 미배치 시: `shootingEff = insideEff = playmakingEff = 0.5`

#### DC 담당 (수비 3개 프로그램)

```
manDefEff   = norm(DC.teaching × 0.6 + DC.playerEval × 0.2 + DC.communication × 0.2)
helpDefEff  = norm(DC.teaching × 0.4 + DC.schemeDepth × 0.4 + DC.communication × 0.2)
reboundEff  = norm(DC.teaching × 0.5 + DC.adaptability × 0.3 + DC.communication × 0.2)
```

DC 미배치 시: `manDefEff = helpDefEff = reboundEff = 0.5`

#### TrainingCoach 담당 (신체 2개 프로그램)

```
explosivnessEff = norm(Trainer.athleticTraining × 0.7 + Trainer.conditioning × 0.3)
strengthEff     = norm(Trainer.conditioning × 0.6 + Trainer.athleticTraining × 0.4)
```

Trainer 미배치 시: `explosivnessEff = strengthEff = 0.5`

#### HC + Dev 공동 담당 (전술 2개 프로그램)

```typescript
const offTacticsRaw =
    (hc  ? hc.mentalCoaching * 0.3 + hc.motivation * 0.2  : 0) +
    (dev ? dev.schemeDepth * 0.3   + dev.teaching * 0.2   : 0);
const offTacticsEff = (hc || dev) ? norm(offTacticsRaw) : 0.5;

const defTacticsRaw =
    (hc  ? hc.mentalCoaching * 0.3 + hc.adaptability * 0.2 : 0) +
    (dev ? dev.schemeDepth * 0.3   + dev.teaching * 0.2    : 0);
const defTacticsEff = (hc || dev) ? norm(defTacticsRaw) : 0.5;
```

- **HC + Dev 둘 다 있을 때**: raw 최대값 ≈ 99 × (0.3+0.2+0.3+0.2) = 99 → norm = 1.0
- **HC만 있을 때**: raw 최대 ≈ 99 × (0.5) = 49.5 → norm ≈ 0.75
- **Dev만 있을 때**: raw 최대 ≈ 99 × (0.5) = 49.5 → norm ≈ 0.75
- **둘 다 없을 때**: 0.5 (기본값 fallback)

### 5-3. 전체 보정 (globalMult)

```typescript
const globalMult = hc
    ? 1.0 + (hc.motivation * 0.3 + hc.playerRelation * 0.4 + hc.adaptability * 0.3) / 99 * 0.2
    : 1.0;
```

| HC 능력치 수준 | globalMult |
|---|---|
| HC 없음 | 1.0 (기본값) |
| HC 평균 (all 50) | 1.0 + 50/99 × 0.2 ≈ **1.101** |
| HC 최고 (all 99) | 1.0 + 99/99 × 0.2 = **1.200** |

- HC의 `motivation(30%)`, `playerRelation(40%)`, `adaptability(30%)` 가중 평균으로 계산
- 범위: 1.0 ~ 1.2 (최대 20% 전체 성장 보너스)

### 5-4. 젊은 선수 보정

```typescript
// computeTrainingEfficiency에서 사전 계산 (선수 나이 조건 없음)
const youngPlayerMult = dev ? 1 + dev.developmentVision / 400 : 1.0;
const rookieMult      = dev ? 1 + dev.experienceTransfer / 350 : 1.0;

// computePlayerTrainingResult에서 선수 나이 조건 적용
const yMult = age <= 25 ? eff.youngPlayerMult : 1.0;
const rMult = age <= 22 ? eff.rookieMult : 1.0;
```

| Dev 능력치 | youngPlayerMult (age≤25) | rookieMult (age≤22) |
|---|---|---|
| Dev 없음 | 1.0 | 1.0 |
| developmentVision=50 | 1 + 50/400 = **1.125** | — |
| developmentVision=99 | 1 + 99/400 = **1.2475** | — |
| experienceTransfer=50 | — | 1 + 50/350 = **1.143** |
| experienceTransfer=99 | — | 1 + 99/350 = **1.283** |

> **중첩 적용**: age 22 이하 루키는 youngPlayerMult × rookieMult 둘 다 적용됨.
> 예) Dev 코치 all 99 → yMult=1.2475, rMult=1.283 → 두 배율 곱셈으로 최대 ~1.60 보너스

---

## 6. 선수별 성장량 공식

### 6-1. 나이 보정 (ageMult)

```typescript
function getAgeMult(age: number, programKey: TrainingProgramKey): number {
    const isPhysical = programKey === 'explosivnessTraining' || programKey === 'strengthTraining';
    if (age <= 22) return 1.3;
    if (age <= 25) return 1.0;
    if (age <= 29) return 0.7;
    if (age <= 33) return isPhysical ? 0.2 : 0.4;
    return isPhysical ? 0.05 : 0.2;
}
```

| 나이 | 일반 프로그램 | 신체 프로그램 (폭발력/근력) |
|---|---|---|
| ≤ 22 (루키) | **1.3** | **1.3** |
| 23~25 | **1.0** | **1.0** |
| 26~29 | **0.7** | **0.7** |
| 30~33 | **0.4** | **0.2** |
| 34+ | **0.2** | **0.05** |

> 신체 훈련(폭발력·근력)은 30대 이후 급격히 비효율적. 35세 선수에게 폭발력 훈련을 집중해도 성장량이 거의 없음.

### 6-2. 프로그램 성장량 계산

```typescript
const BASE_GROWTH_PER_PT = 0.025; // 포인트당 기본 성장량

const programDelta =
    pts           // 배분 포인트 (0 ~ totalPoints × 0.5)
  × coachEff      // 코치 효율 (0.5 ~ 1.0)
  × BASE_GROWTH_PER_PT
  × eff.globalMult   // HC 전체 보정 (1.0 ~ 1.2)
  × ageMult          // 나이 보정
  × yMult            // youngPlayerMult (age≤25만)
  × rMult;           // rookieMult (age≤22만)

// 프로그램 영향 능력치에 균등 배분
const deltaPerAttr = programDelta / attrs.length;
```

### 6-3. 소수점 누적 → 정수 변화

```typescript
// computePlayerTrainingResult
for (const attr of attrs) {
    const prev = existingFrac[attr] ?? 0;
    const newAcc = prev + deltaPerAttr;
    const intPart = Math.floor(newAcc);

    fractionalDeltas[attr] = (fractionalDeltas[attr] ?? 0) + deltaPerAttr;
    if (intPart > 0) {
        integerChanges[attr] = (integerChanges[attr] ?? 0) + intPart;
    }
}
```

- `player.fractionalGrowth` (기존 소수점 누적)에 delta를 더함
- 누적값이 1.0 이상이 되면 `integerChanges`에 정수 부분 기록
- `applyDevelopmentResult(player, result)` 호출로 실제 능력치 업데이트

> **중요**: 오프시즌 1회 훈련으로 능력치가 즉시 +1되지 않을 수 있음. 누적이 1.0을 넘어야 +1. 포인트를 적게 투자하거나 나이가 많은 선수는 여러 시즌에 걸쳐 누적 후 성장함.

---

## 7. 계산 예시

### 예시 1: 슈팅 훈련 집중 투자 (25세 선수)

**조건:**
- 총 포인트: 100pt (예산 $5M)
- 슈팅 훈련 배분: 40pt (cap 50pt 이내)
- OC 능력치: teaching=80, schemeDepth=70, communication=60
- HC: motivation=70, playerRelation=75, adaptability=65 → globalMult
- Dev 코치: developmentVision=60

**계산:**
```
shootingEff = norm(80×0.5 + 70×0.3 + 60×0.2) = norm(40 + 21 + 12) = norm(73) = 73/99×0.5+0.5 ≈ 0.869

globalMult = 1.0 + (70×0.3 + 75×0.4 + 65×0.3) / 99 × 0.2
           = 1.0 + (21 + 30 + 19.5) / 99 × 0.2
           = 1.0 + 70.5/99 × 0.2 ≈ 1.143

youngPlayerMult = 1 + 60/400 = 1.15 (age 25 → 적용)
ageMult = 1.0 (age 23~25)

programDelta = 40 × 0.869 × 0.025 × 1.143 × 1.0 × 1.15 × 1.0
             ≈ 1.143

슈팅 훈련 영향 능력치 6개 균등 배분:
deltaPerAttr = 1.143 / 6 ≈ 0.190

→ midRange, threeCorner, three45, threeTop, ft, offConsist에 각각 +0.190 소수점 누적
→ 시즌당 +0.19 누적, 약 5~6시즌 후 +1 달성 (단독 투자 시)
→ 실제로는 매 시즌 누적되어 4~5시즌에 +1씩 성장
```

### 예시 2: 루키 (21세) vs 노장 (35세) 동일 조건

**공통 조건:** strengthTraining 30pt, Trainer conditioning=75, athleticTraining=65, HC all 60

```
strengthEff  = norm(75×0.6 + 65×0.4) = norm(45 + 26) = norm(71) ≈ 0.859
globalMult   = 1.0 + 60/99 × 0.2 ≈ 1.121

루키 (21세):
  ageMult = 1.3
  programDelta = 30 × 0.859 × 0.025 × 1.121 × 1.3 ≈ 0.888

노장 (35세):
  ageMult = 0.05  (신체 훈련 — 34+ 적용)
  programDelta = 30 × 0.859 × 0.025 × 1.121 × 0.05 ≈ 0.034

→ 루키: 강도·체력·활력·내구성에 각각 +0.222 누적 (4~5시즌 후 +1)
→ 노장: 각각 +0.0085 누적 (사실상 성장 없음, 117시즌 이상 필요)
```

---

## 8. 데이터 저장 구조

### 8-1. `types/training.ts` 타입 구조

```typescript
// GM이 설정하는 10개 프로그램 배분
interface TrainingProgramConfig {
    shootingTraining:      number;
    insideTraining:        number;
    playmakingTraining:    number;
    manDefTraining:        number;
    helpDefTraining:       number;
    reboundTraining:       number;
    explosivnessTraining:  number;
    strengthTraining:      number;
    offTacticsTraining:    number;
    defTacticsTraining:    number;
}

// 팀 단위 훈련 설정 (프로그램 + 예산)
interface TeamTrainingConfig {
    program: TrainingProgramConfig;
    budget: number;  // $0 ~ $20,000,000
}

// 리그 전체 (30팀)
type LeagueTrainingConfigs = Record<string, TeamTrainingConfig>; // teamId → config

// 훈련 엔진 내부 계산 결과
interface TrainingEfficiency {
    shootingEff:      number;  // 0.5~1.0
    insideEff:        number;
    playmakingEff:    number;
    manDefEff:        number;
    helpDefEff:       number;
    reboundEff:       number;
    explosivnessEff:  number;
    strengthEff:      number;
    offTacticsEff:    number;
    defTacticsEff:    number;
    globalMult:       number;  // 1.0~1.2
    youngPlayerMult:  number;
    rookieMult:       number;
    totalPoints:      number;
}
```

### 8-2. DB 저장

```sql
-- saves 테이블
ALTER TABLE saves ADD COLUMN IF NOT EXISTS league_training_configs JSONB;
-- 저장: LeagueTrainingConfigs (30팀 × TeamTrainingConfig)
-- null → 훈련 단계 스킵 (하위 호환 보장)
```

`services/persistence.ts`의 `saveCheckpoint()`에서 `league_training_configs` 컬럼으로 저장/복원.

### 8-3. 선수 성장 결과 저장 위치

훈련 결과는 `applyDevelopmentResult(player, result)`를 통해 적용:
- `player.fractionalGrowth`: 소수점 누적값 업데이트
- `player.attrDeltas`: 정수 변화량 누적
- `player.changeLog`: 이벤트 로그 ('training' 이벤트 추가)
- 저장: `roster_state` (JSONB) + `replay_snapshot` 양쪽에 영속화

---

## 9. UI 흐름

```
FrontOfficeView (코칭 탭)
  └─ "훈련 설정" 버튼 클릭
       └─ onTrainingViewOpen() → navigate('/training')
            └─ TrainingPage.tsx
                 ├─ trainingConfig = leagueTrainingConfigs[myTeamId] ?? getDefaultTrainingConfig()
                 ├─ staff = coachingData[myTeamId]
                 └─ TrainingView
                      ├─ 예산 슬라이더 ($0~$20M)
                      ├─ 총 포인트 표시 (calcTotalTrainingPoints(budget))
                      ├─ 10개 프로그램 포인트 +/- 입력
                      ├─ 코치 효율 배지 (computeTrainingEfficiency 실시간 호출)
                      └─ 저장 → onSave(config) → setLeagueTrainingConfigs + forceSave
```

TrainingView는 저장 전 실시간으로 `computeTrainingEfficiency(staff, budget)`를 호출해 각 프로그램의 예상 효율(0.5~1.0)을 배지로 표시함으로써 GM이 코치 미배치 프로그램을 시각적으로 파악할 수 있게 한다.

---

## 10. 전략적 설계 의도

### 트레이드오프 설계
- 총 포인트가 고정 → 어디에 집중할지 선택
- 코치 미배치 슬롯에 포인트를 투자해도 50% 효율만 → 코치 고용 인센티브
- 예산 증액은 total 포인트 증가 + 재정 압박 → 경제적 트레이드오프

### 팀 전략과의 연계
- 슈팅 팀 → OC 우선 고용 + shootingTraining/playmakingTraining 집중
- 수비 팀 → DC 우선 고용 + manDefTraining/helpDefTraining 집중
- 리빌딩 팀 → Dev 코치 우선 고용 + 루키 성장 배율 극대화
- 모든 라운드형 팀 → 분산 투자로 균형 성장

### 장기 성장 설계
- 단일 시즌에 劇적인 성장 없음 (소수점 누적 방식)
- 3~5시즌 꾸준한 투자로 누적 성장
- 루키 집중 투자 → 27~28세 전성기에 최대치 도달

---

## 11. 알려진 제약 및 한계

| 항목 | 현황 |
|---|---|
| CPU 팀 훈련 | CPU 팀도 `processOffseasonTraining` 대상에 포함됨. 단, CPU 팀의 훈련 설정은 `getDefaultTrainingConfig()` 기본값(균등 배분)이 사용됨 |
| 능력치 상한 | `applyDevelopmentResult`의 기존 로직을 따름. potential 소프트캡 완화는 코치 `playerEval` 능력치가 관여하나 현재 구현은 단순 delta 누적만 적용 |
| 부상 위험 | Trainer `recovery` 능력치는 코치 데이터로는 존재하나 훈련 부상 시스템은 미구현 |
| 포인트 합계 검증 | 엔진 내부에서는 개별 cap만 적용. 총 합계 > totalPoints 방지는 UI(TrainingView) 책임 |
| 동적 cap 반영 | 샐러리 캡 변화가 trainingBudget에 영향을 주지 않음 (독립 설정) |
