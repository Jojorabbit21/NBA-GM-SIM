# 코칭스태프 × 훈련 시스템 통합 설계

## Context
현재 코칭 시스템은 헤드코치 1명(선호도 7개)만 존재하며 능력치와 훈련 시스템이 없음.
두 시스템은 분리 불가 — 코치 능력치의 유의미성은 훈련 시스템에서 비롯됨.

**핵심 원칙:**
- 코치 선호도(HeadCoachPreferences 7개) → 자동전술 생성 (기존 유지, 변경 없음)
- 코치 능력치(CoachAbilities) → **오프시즌 훈련 효율**에만 영향 (경기 결과 무관)
- 훈련 시스템 → 오프시즌 한정, 총 훈련 포인트를 10개 프로그램에 배분

---

## 1. 시스템 아키텍처

```
[오프시즌 파이프라인 — offseasonEventHandler.ts]
  moratoriumStart 도달
    ├─ processOffseason()              [기존: 은퇴/계약만료/에이징]
    └─ processOffseasonTraining()      [신규 — trainingEngine.ts]
             ↑
  [GM 입력]                   [코칭스태프]
  TrainingProgramConfig        CoachingStaff
  (10개 프로그램, 포인트 배분)  (5개 직무, 능력치)
             ↓
  computeTrainingEfficiency()
  (프로그램별 코치효율 계산)
             ↓
  각 선수 카테고리별 성장 delta 계산
  → playerAging.ts의 applyDevelopmentResult() 재활용
```

---

## 2. 훈련 프로그램 (10개)

### 총 훈련 포인트 트레이드오프

```
총 훈련 포인트 = 80pt (기본) + budget / 250_000pt
예산 $0:   80pt  /  $5M: 100pt  /  $10M: 120pt  /  $20M: 160pt
```

- 10개 프로그램에 자유 배분 (각 0~총포인트)
- **개별 프로그램 최대 cap: 총 포인트의 50%** (한 프로그램 몰빵 방지)
- 코치 미배치 프로그램: 포인트 투자해도 효율 50%로 반감 → 해당 코치 고용 없이 포인트 낭비

### 10개 프로그램 정의

| 변수명 | 라벨 | 영향 능력치 | 담당 코치 | 효율 공식 |
|---|---|---|---|---|
| `shootingTraining` | 슈팅 훈련 | midRange, threeCorner, three45, threeTop, ft, offConsist | OC | `OC.teaching×0.5 + OC.schemeDepth×0.3 + OC.communication×0.2` |
| `insideTraining` | 인사이드 훈련 | closeShot, layup, dunk, postPlay, drawFoul, hands | OC | `OC.teaching×0.6 + OC.playerEval×0.2 + OC.communication×0.2` |
| `playmakingTraining` | 플레이메이킹 훈련 | passAcc, handling, spdBall, passVision, offBallMovement | OC | `OC.teaching×0.4 + OC.schemeDepth×0.4 + OC.communication×0.2` |
| `manDefTraining` | 대인 수비 훈련 | perDef, intDef, steal, blk | DC | `DC.teaching×0.6 + DC.playerEval×0.2 + DC.communication×0.2` |
| `helpDefTraining` | 팀 수비 훈련 | helpDefIq, passPerc, defConsist | DC | `DC.teaching×0.4 + DC.schemeDepth×0.4 + DC.communication×0.2` |
| `reboundTraining` | 리바운드 훈련 | offReb, defReb, boxOut | DC | `DC.teaching×0.5 + DC.adaptability×0.3 + DC.communication×0.2` |
| `explosivnessTraining` | 폭발력 훈련 | speed, agility, vertical | TrainingCoach | `Trainer.athleticTraining×0.7 + Trainer.conditioning×0.3` |
| `strengthTraining` | 근력·지구력 훈련 | strength, stamina, hustle, durability | TrainingCoach | `Trainer.conditioning×0.6 + Trainer.athleticTraining×0.4` |
| `offTacticsTraining` | 공격 전술 훈련 | shotIq, passIq, passVision | HC + Dev | `HC.mentalCoaching×0.3 + HC.motivation×0.2 + Dev.schemeDepth×0.3 + Dev.teaching×0.2` |
| `defTacticsTraining` | 수비 전술 훈련 | helpDefIq, defConsist, intangibles | HC + Dev | `HC.mentalCoaching×0.3 + HC.adaptability×0.2 + Dev.schemeDepth×0.3 + Dev.teaching×0.2` |

> 효율 공식 결과 정규화: `능력치합계 / 99 → 0.0~1.0` (코치 미배치 시 0.5 기본값)

### 전체 보정 (globalMult)

HC가 있을 때 팀 전체 훈련 효율 보정:
```
globalMult = 1.0 + (HC.motivation×0.3 + HC.playerRelation×0.4 + HC.adaptability×0.3) / 99 × 0.2
범위: 1.0 ~ 1.2 (HC 없으면 1.0)
```

---

## 3. 성장량 공식

```typescript
// 선수 1명, 프로그램 1개, 오프시즌 1회
const BASE_GROWTH_PER_PT = 0.025;  // 포인트당 기본 성장량

programGrowthDelta =
    pts                   // 배분 포인트 (0~totalPts×0.5)
  × coachEff              // 코치 효율 (0.5~1.0)
  × BASE_GROWTH_PER_PT
  × globalMult            // HC 전체 보정 (1.0~1.2)
  × ageMult               // 나이 보정
  × youngPlayerMult       // age≤25: Dev.developmentVision 보정
  × rookieMult            // age≤22: Dev.experienceTransfer 보정
  × potentialMult         // Dev.playerEval → potential 소프트캡 완화

// 나이 보정 (ageMult)
// age ≤ 22: 1.3   (루키: 흡수력 최고)
// age 23~25: 1.0
// age 26~29: 0.7
// age 30~33: 0.4  (폭발력/근력 훈련 제외)
// age 34+:   0.2  (폭발력/근력 훈련: 0.05)

// youngPlayerMult = 1 + Dev.developmentVision / 400  (age≤25만, Dev 코치 있을 때)
// rookieMult      = 1 + Dev.experienceTransfer / 350 (age≤22만, Dev 코치 있을 때)
```

### 예시 (총 100pt, 슈팅 훈련 40pt 집중, OC teaching=80, schemeDepth=70)

```
coachEff = (80×0.5 + 70×0.3 + 60×0.2) / 99 = (40+21+12)/99 ≈ 0.737
programGrowthDelta = 40 × 0.737 × 0.025 × 1.1 × 1.0 = 0.812

→ 슈팅 훈련 영향 능력치(midRange, threeCorner 등 6개)에
  각 0.812 / 6 ≈ 0.135 delta 추가
  → fractionalGrowth 누적 → 정수 도달 시 +1 능력치
```

---

## 4. 코칭스태프 설계

### 4-A. 공통 CoachAbilities (헤드코치·오펜스·디펜스·디벨롭먼트 — 동일 10개)

| 변수명 | 한국어 라벨 | 훈련 시스템 역할 |
|---|---|---|
| `teaching` | 지도력 | 담당 훈련 카테고리 효율의 핵심 가중치 |
| `schemeDepth` | 전술 깊이 | 공격/수비/전술 훈련의 깊이 (IQ 계열 성장) |
| `motivation` | 동기부여 | 팀 전체 훈련 참여도 (globalMult — HC 주력) |
| `playerRelation` | 선수 관계 | 훈련 흡수율 (globalMult — HC 주력) |
| `communication` | 소통력 | 훈련 피드백 전달력 |
| `developmentVision` | 성장 비전 | age≤25 훈련 효율 추가 배율 (Dev 주력) |
| `experienceTransfer` | 경험 전수 | age≤22 훈련 효율 추가 배율 (Dev 주력) |
| `playerEval` | 선수 평가 | potential 소프트캡 완화 |
| `adaptability` | 적응력 | 다양한 아키타입 선수 균등 훈련 (globalMult 일부) |
| `mentalCoaching` | 멘탈 코칭 | 전술 훈련(offTactics/defTactics) 효율 |

### 4-B. TrainingCoachAbilities (트레이닝 코치 전용 — 3개)

| 변수명 | 한국어 라벨 | 훈련 시스템 역할 |
|---|---|---|
| `athleticTraining` | 신체 훈련 | 폭발력 훈련 효율 주력 |
| `recovery` | 회복 관리 | 훈련 후 부상 위험 감소 |
| `conditioning` | 컨디셔닝 | 근력·지구력 훈련 효율 주력 |

### 4-C. 5개 직무 타입 (`types/coaching.ts`)

```typescript
export interface CoachAbilities {
    teaching: number; schemeDepth: number; motivation: number;
    playerRelation: number; communication: number; developmentVision: number;
    experienceTransfer: number; playerEval: number; adaptability: number;
    mentalCoaching: number;
}
export interface TrainingCoachAbilities {
    athleticTraining: number; recovery: number; conditioning: number;
}
export interface HeadCoach {
    id: string; name: string;
    preferences: HeadCoachPreferences;  // 기존 7개 유지
    abilities: CoachAbilities;
    contractYears: number; contractSalary: number; contractYearsRemaining: number;
}
export interface OffenseCoordinator {
    id: string; name: string;
    abilities: CoachAbilities;
    contractYears: number; contractSalary: number; contractYearsRemaining: number;
}
export interface DefenseCoordinator {
    id: string; name: string;
    abilities: CoachAbilities;
    contractYears: number; contractSalary: number; contractYearsRemaining: number;
}
export interface DevelopmentCoach {
    id: string; name: string;
    abilities: CoachAbilities;
    contractYears: number; contractSalary: number; contractYearsRemaining: number;
}
export interface TrainingCoach {
    id: string; name: string;
    abilities: TrainingCoachAbilities;
    contractYears: number; contractSalary: number; contractYearsRemaining: number;
}
export interface CoachingStaff {
    headCoach:            HeadCoach | null;
    offenseCoordinator:   OffenseCoordinator | null;
    defenseCoordinator:   DefenseCoordinator | null;
    developmentCoach:     DevelopmentCoach | null;
    trainingCoach:        TrainingCoach | null;
}
export interface CoachFAPool {
    headCoaches:         HeadCoach[];
    offenseCoordinators: OffenseCoordinator[];
    defenseCoordinators: DefenseCoordinator[];
    developmentCoaches:  DevelopmentCoach[];
    trainingCoaches:     TrainingCoach[];
}
export type LeagueCoachingData = Record<string, CoachingStaff>;
```

### 4-D. 역할별 능력치 주력 (훈련 효율 가중치)

| 능력치 | HC | OC | DC | Dev | Trainer |
|---|---|---|---|---|---|
| teaching | ☆ | ★★★ | ★★★ | ★★★ | — |
| schemeDepth | ☆ | ★★★ | ★★★ | ★★☆ | — |
| motivation | ★★★ | ☆ | ☆ | ★★☆ | — |
| playerRelation | ★★★ | ☆ | ☆ | ★★★ | — |
| communication | ★☆ | ★★★ | ★★★ | ★★☆ | — |
| developmentVision | ☆ | ☆ | ☆ | ★★★ | — |
| experienceTransfer | ★☆ | ☆ | ☆ | ★★★ | — |
| playerEval | ★★☆ | ★★☆ | ★★☆ | ★★★ | — |
| adaptability | ★★★ | ★☆ | ★☆ | ★★☆ | — |
| mentalCoaching | ★★★ | ☆ | ☆ | ★★★ | — |
| athleticTraining | — | — | — | — | ★★★ |
| recovery | — | — | — | — | ★★★ |
| conditioning | — | — | — | — | ★★★ |

---

## 5. 훈련 타입 (`types/training.ts` 신규)

```typescript
export interface TrainingProgramConfig {
    // 10개 프로그램별 배분 포인트 (합계 ≤ totalPoints)
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
export interface TeamTrainingConfig {
    program: TrainingProgramConfig;
    budget: number;  // $0~$20M
}
export type LeagueTrainingConfigs = Record<string, TeamTrainingConfig>;

// 내부 계산 결과
export interface TrainingEfficiency {
    [programKey: string]: number;  // 0.5~1.0
    globalMult: number;            // 1.0~1.2
    youngPlayerMult: number;
    rookieMult: number;
    totalPoints: number;           // 80 + budget/250_000
}
```

---

## 6. 핵심 신규 파일 — `services/coachingStaff/trainingEngine.ts`

```typescript
// 코치 효율 계산 (0.5~1.0)
export function computeTrainingEfficiency(
    staff: CoachingStaff,
    budget: number,
): TrainingEfficiency

// 오프시즌 훈련 성장 적용
export function processOffseasonTraining(
    teams: Team[],
    leagueTrainingConfigs: LeagueTrainingConfigs,
    leagueCoachingData: LeagueCoachingData,
): void
// 내부 흐름:
// 1. 팀별 computeTrainingEfficiency()
// 2. 각 선수별 10개 프로그램 순회
// 3. programGrowthDelta 계산 → 영향 능력치에 누적
// 4. applyDevelopmentResult() 재활용
```

---

## 7. 오프시즌 파이프라인 수정 (`offseasonEventHandler.ts`)

```typescript
// handleMoratoriumStart() 내부에 추가
const offseasonResult = processOffseason(teams, tendencySeed, seasonNumber, userTeamId);

// 훈련 성장 (processOffseason 직후)
if (leagueTrainingConfigs && leagueCoachingData) {
    processOffseasonTraining(teams, leagueTrainingConfigs, leagueCoachingData);
}
```

DispatchParams에 `leagueTrainingConfigs?: LeagueTrainingConfigs` 추가.

---

## 8. 재정 연동

- `TeamFinance.expenses.trainingBudget` 신규 항목 (기본값 $3M)
- `revenueCalculator.ts`: `calculateTrainingExpense()` 신규
- `budgetManager.ts`: `initializeSeason()` 에 trainingBudget 처리 추가

---

## 9. 고용/해고 시스템 (`services/coachingStaff/coachHiringEngine.ts` 신규)

```typescript
type StaffRole = 'headCoach' | 'offenseCoordinator' | 'defenseCoordinator' | 'developmentCoach' | 'trainingCoach';

function hireCoach(staff, pool, role, coachId): { staff, pool }
function fireCoach(staff, pool, role): { staff, pool }
function processCoachContracts(leagueStaff, pool): { leagueStaff, pool }
// contractYearsRemaining -= 1 → 0이면 FA풀 반환
```

---

## 10. DB 스키마

```sql
-- meta_coaches 테이블
ALTER TABLE meta_coaches ADD COLUMN role TEXT DEFAULT 'head_coach';
-- role: 'head_coach' | 'offense_coord' | 'defense_coord' | 'development' | 'training'
ALTER TABLE meta_coaches ADD COLUMN abilities JSONB;
-- HC/OC/DC/Dev: CoachAbilities 10개 / Trainer: TrainingCoachAbilities 3개

-- saves 테이블
ALTER TABLE saves ADD COLUMN league_training_configs JSONB;  -- LeagueTrainingConfigs
ALTER TABLE saves ADD COLUMN coach_fa_pool JSONB;             -- CoachFAPool
```

---

## 11. 수정 대상 파일

| 파일 | 변경 내용 |
|---|---|
| `types/coaching.ts` | CoachAbilities 10개, TrainingCoachAbilities 3개, 5개 직무, CoachFAPool |
| `types/training.ts` (신규) | TrainingProgramConfig, TeamTrainingConfig, TrainingEfficiency, LeagueTrainingConfigs |
| `types/save.ts` | league_training_configs, coach_fa_pool 필드 추가 |
| `services/coachingStaff/coachGenerator.ts` | 5개 직무 생성, generateCoachFAPool, generateLeagueStaff |
| `services/coachingStaff/trainingEngine.ts` (신규) | computeTrainingEfficiency, processOffseasonTraining |
| `services/coachingStaff/coachHiringEngine.ts` (신규) | hireCoach, fireCoach, processCoachContracts |
| `services/simulation/offseasonEventHandler.ts` | handleMoratoriumStart에 훈련 연동, DispatchParams 확장 |
| `services/financeEngine/revenueCalculator.ts` | calculateTrainingExpense 추가 |
| `services/financeEngine/budgetManager.ts` | trainingBudget 처리 |
| `services/persistence.ts` | league_training_configs, coach_fa_pool 저장/로드 |
| `services/queries.ts` | meta_coaches role 컬럼 활용 |
| `hooks/useGameData.ts` | 5개 직무 초기화, FA풀, 훈련 설정 초기화 |
| `views/CoachDetailView.tsx` | 5개 직무 렌더링, 능력치 + 선호도 표시 |
| `views/TrainingView.tsx` (신규) | 훈련 포인트 배분 UI + 예산 설정 + 코치 효율 미리보기 |
| `views/CoachMarketView.tsx` (신규) | 코치 FA풀 브라우징, 고용/해고 |
| `components/dashboard/CoachProfileCard.tsx` | 5개 직무 테이블 행 확장 |
| `views/FrontOfficeView.tsx` | 코칭탭 → CoachMarketView·TrainingView 진입 |
| DB migration | meta_coaches, saves 컬럼 |

---

## 12. 구현 순서

1. **타입** — `types/coaching.ts`, `types/training.ts`
2. **DB 마이그레이션** — Supabase MCP
3. **생성 엔진** — coachGenerator.ts (5직무, FA풀)
4. **훈련 엔진** — trainingEngine.ts (computeTrainingEfficiency, processOffseasonTraining)
5. **오프시즌 연동** — offseasonEventHandler.ts
6. **재정 연동** — trainingBudget → BudgetManager
7. **고용 시스템** — coachHiringEngine.ts
8. **저장/로드** — persistence.ts, useGameData.ts
9. **UI** — CoachDetailView, TrainingView, CoachMarketView

---

## 13. 검증

1. **트레이드오프**: 100pt를 1개 프로그램에 50pt 집중 vs 5개 균등 20pt → 집중 프로그램 성장량 유의미하게 큰지
2. **코치 미배치**: 코치 없는 프로그램에 포인트 배분 시 효율 50% 반감 확인
3. **예산 차이**: $3M(92pt) vs $15M(140pt) 총 포인트 차이 → 성장량 비교
4. **나이 보정**: age 20 루키 vs age 33 선수 동일 프로그램 → 성장량 차이 확인
5. **Dev 코치 보정**: developmentVision=99 Dev 코치 있는 팀의 age≤25 선수 성장 우세 확인
6. **하위호환**: 기존 saves 로드 시 leagueTrainingConfigs=undefined → 훈련 스킵 확인
7. **고용/해고**: hireCoach → FA풀 제거, fireCoach → FA풀 복귀
8. **재정**: trainingBudget이 TeamFinance.expenses에 반영되는지
