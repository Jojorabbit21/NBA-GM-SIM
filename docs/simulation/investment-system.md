# 구단주 예산 할당 & 투자 시스템

## 개요

매 오프시즌, 구단주는 팀 운영 예산 외에 별도의 **재량 투자 예산(discretionaryBudget)** 을 결정하고, 이 예산을 4개 카테고리에 배분한다. 배분 결과는 다음 시즌의 경기 수익, 선수 성장, 드래프트 정확도에 직접 영향을 준다.

- **유저팀**: `/owner-budget` 페이지에서 슬라이더로 수동 배분
- **CPU팀**: 구단주 성향 프로필(OwnerProfile)을 기반으로 자동 배분

---

## 1. 타입 구조

**파일**: `types/finance.ts`

```typescript
/** 투자 카테고리 */
export type InvestmentCategory = 'facility' | 'training' | 'scouting' | 'marketing';

/** 시즌 내 적용되는 투자 효과 */
export interface InvestmentEffects {
    facilityBonus: number;       // 0.0 ~ 0.15  (관중 점유율 보정)
    trainingMultiplier: number;  // 1.0 ~ 1.50  (오프시즌 성장 배율)
    scoutingAccuracy: number;    // 0.0 ~ 1.0   (드래프트 포텐셜 노이즈 감소율)
    marketingBonus: number;      // 0.0 ~ 0.20  (관중 수익 + MD 수익 보정)
}

/** 팀별 투자 상태 (시즌 단위로 초기화) */
export interface TeamInvestmentState {
    discretionaryBudget: number;                     // 시즌 가용 예산
    remainingBudget: number;                         // 미배분 잔여
    allocations: Record<InvestmentCategory, number>; // 카테고리별 배분액
    effects: InvestmentEffects;                      // 계산된 시즌 효과
    allocationConfirmed: boolean;                    // 유저 배분 확정 여부
    seasonNumber: number;
}

/** 리그 전체 투자 상태 */
export type LeagueInvestmentState = Record<string, TeamInvestmentState>;
```

`SavedTeamFinances[teamId]`에 `investmentState?: TeamInvestmentState`가 추가되어 checkpoint에 저장·복원된다.

---

## 2. 투자 카테고리 & 효과

| 카테고리 | 적용 위치 | 최대 효과 | 포화 투자액(scale) |
|---|---|---|---|
| 🏟️ **facility** (시설) | `attendanceModel.ts` — 관중 점유율 보정 | +15% 점유율 | $20M |
| 🏋️ **training** (훈련) | `trainingEngine.ts` — 오프시즌 성장 배율 | ×1.50 | $15M |
| 🔍 **scouting** (스카우팅) | `rookieGenerator.ts` — 포텐셜 노이즈 감소 | 100% 정확도 | $10M |
| 📣 **marketing** (마케팅) | `attendanceModel.ts`, `revenueCalculator.ts` — 수익 보정 | +20% 수익 | $18M |

### 효과 곡선 (지수 감소)

```
effect = maxVal × (1 − e^(−allocation / scale))
```

투자액이 클수록 **단위당 추가 효과가 감소**한다 (조수익 체감의 법칙).

#### 실제 효과 예시 (facility, scale=$20M, max=0.15)

| 투자액 | facilityBonus | 점유율 상승 |
|---|---|---|
| $5M | 0.022 | +2.2% |
| $10M | 0.039 | +3.9% |
| $20M | 0.072 | +7.2% |
| $40M | 0.118 | +11.8% |
| $60M (최대) | 0.141 | +14.1% |

---

## 3. 구단주 예산 계산 공식

**파일**: `services/financeEngine/investmentEngine.ts` — `calculateDiscretionaryBudget()`

```
fromRevenue = max(0, operatingIncome) × (0.15 + (winNowPriority−1)/9 × 0.25)
fromNetWorth = netWorth × (0.00005 + (spendingWillingness−1)/9 × 0.00015)

discretionaryBudget = clamp(fromRevenue + fromNetWorth, $5M, $60M)
```

### 파라미터 설명

| 파라미터 | 출처 | 범위 | 의미 |
|---|---|---|---|
| `operatingIncome` | 전 시즌 BudgetManager | 가변 | 전 시즌 팀 순영업이익 |
| `winNowPriority` | OwnerProfile | 1~10 | 높을수록 즉시 투자 확대 (최대 40%) |
| `netWorth` | OwnerProfile | 고정 | 구단주 순자산 (팀별 다름) |
| `spendingWillingness` | OwnerProfile | 1~10 | 높을수록 사비 투자 확대 (최대 0.020%) |

### 계산 예시

```
operatingIncome = $80M, netWorth = $500M
winNowPriority = 7, spendingWillingness = 5

fromRevenue = 80M × (0.15 + 6/9 × 0.25) = 80M × 0.317 = $25.4M
fromNetWorth = 500M × (0.00005 + 4/9 × 0.00015) = 500M × 0.000117 = $0.06M

discretionaryBudget = $25.5M
```

---

## 4. CPU 팀 자동 배분

**파일**: `services/financeEngine/investmentEngine.ts` — `autoAllocateCPUBudget()`

구단주 성향에 따라 4가지 배분 전략 중 하나를 선택한다.

| 조건 | 전략 | facility | training | scouting | marketing |
|---|---|---|---|---|---|
| `winNowPriority ≥ 8` | 즉시 성과 | 35% | 15% | 15% | 35% |
| `patience ≥ 8` | 장기 육성 | 15% | 40% | 35% | 10% |
| `marketingFocus ≥ 8` | 수익 극대화 | 25% | 15% | 15% | 45% |
| 기본값 | 균등 배분 | 25% | 25% | 25% | 25% |

조건이 중복되면 첫 번째 매칭 조건이 우선된다.

---

## 5. 오프시즌 이벤트 흐름

### 5.1 Key Date

```
ownerBudgetDay = rosterDeadline + 7일
                ≈ 10월 말 (2025-26 시즌 기준)
```

**파일**: `utils/seasonConfig.ts`

```typescript
const rosterDeadline = nthDayOfMonth(endYear, 9, 1, 3);  // 10월 3번째 월요일
const ownerBudgetDay = addDays(rosterDeadline, 7);
```

### 5.2 이벤트 디스패처

**파일**: `services/simulation/offseasonEventHandler.ts`

```
dispatchOffseasonEvent()
  조건: currentDate >= ownerBudgetDay
        && offseasonPhase === 'PRE_SEASON'
        && !investmentConfirmed    ← 멱등성 보장

  → initializeLeagueInvestmentState() 호출
      ├─ CPU팀: autoAllocateCPUBudget() + computeInvestmentEffects() → confirmed=true
      └─ 유저팀: discretionaryBudget만 계산 → confirmed=false

  → return { blocked: true, navigateTo: 'OwnerBudget', updates: { leagueInvestmentState } }
```

`blocked: true`이면 `useSimulation`이 날짜 진행을 중단하고 `/owner-budget`으로 라우팅한다.

### 5.3 전체 오프시즌 타임라인 (투자 관련)

```
finalsEndTarget
    ↓
POST_FINALS → draftLottery → DraftLotteryPage
    ↓
POST_LOTTERY → rookieDraft → DraftRoomPage
    ↓
POST_DRAFT → moratoriumStart
    │         └─ processOffseason() — 에이징/은퇴/계약만료
    │            processOffseasonTraining() — trainingMultiplier 적용 (이전 시즌 값)
    ↓
FA_OPEN → freeAgencyOpen, freeAgencyClose
    ↓
FA_OPEN → luxuryTaxDay — 럭셔리 택스 정산
    ↓
FA_OPEN → rosterDeadline → FA 시장 마감 + CPU 자동 서명
    ↓
PRE_SEASON → ownerBudgetDay ← ★ 구단주 예산 배분 이벤트
    ↓ (investmentConfirmed=true 후 진행)
PRE_SEASON → openingNight — 새 시즌 시작 (이번 시즌의 투자 효과 적용 시작)
```

---

## 6. 유저 배분 UI

### 6.1 OwnerBudgetPage (`pages/OwnerBudgetPage.tsx`)

라우트: `/owner-budget`

- `InvestmentPanel`을 래핑하는 페이지 컴포넌트
- `handleConfirm`: `handleInvestmentConfirm(allocations, () => navigate('/'))` 호출
- `handleSkip`: 구단주 성향 기반 자동 배분(`autoAllocateCPUBudget`) 후 `handleConfirm` 호출

### 6.2 InvestmentPanel (`components/frontoffice/InvestmentPanel.tsx`)

```
┌─────────────────────────────────────────┐
│  구단주명                                │
│  이번 시즌 운영 외 가용 예산을 배분하세요. │
├─────────────────────────────────────────┤
│  가용 예산  │  배분 완료  │  잔여         │
│  $25.5M    │  $15.0M    │  $10.5M       │
├─────────────────────────────────────────┤
│ 🏟️ 경기장 시설   [관중 점유율 최대 +15%]  │
│    $10M ←──────●──────────→           │
│    → 관중 점유율 +6.5%                  │
├─────────────────────────────────────────┤
│ 🏋️ 훈련 프로그램 [성장 배율 최대 ×1.5]   │
│    $5M ←──●──────────────→            │
│    → 성장 배율 ×1.29                   │
├─────────────────────────────────────────┤
│ 🔍 스카우팅      [드래프트 정확도 100%]   │
│    $3M ←─●───────────────→            │
│    → 스카우팅 정확도 26%                │
├─────────────────────────────────────────┤
│ 📣 마케팅        [스폰서십/MD +20%]      │
│    $2M ←●────────────────→            │
│    → 수익 보정 +10.5%                  │
├─────────────────────────────────────────┤
│  시즌 효과 미리보기                       │
│  🏟️ 관중 점유율  +6.5%                  │
│  🏋️ 성장 배율   ×1.29                  │
│  🔍 드래프트 정확도  26%                 │
│  📣 수익 보정   +10.5%                  │
├─────────────────────────────────────────┤
│  [  배분 확정  ]  [ 기본 배분 ]          │
└─────────────────────────────────────────┘
```

- 슬라이더 스텝: **$1M 단위**
- 잔여 예산 < 0이면 "배분 확정" 비활성화
- 미리보기: `computeInvestmentEffects(allocations)` 실시간 호출

---

## 7. 확정 후 상태 처리

**파일**: `hooks/useGameData.ts` — `handleInvestmentConfirm()`

```typescript
handleInvestmentConfirm(allocations, investmentConfirmedSignal):
  1. computeInvestmentEffects(allocations)  → effects 계산
  2. leagueInvestmentState[myTeamId].allocationConfirmed = true
  3. setLeagueInvestmentState(updated)      → React 상태 업데이트
  4. getBudgetManager().setInvestmentState(updated)  → 싱글턴 동기화
  5. 훈련 예산 동기화: leagueTrainingConfigs[myTeamId].budget = allocations.training
  6. forceSave({ leagueInvestmentState: updated })   → DB 저장
  7. investmentConfirmedSignal()            → 날짜 진행 재개
```

`investmentConfirmed = leagueInvestmentState[myTeamId]?.allocationConfirmed ?? false`

이 값이 `true`로 바뀌면, 다음 `dispatchOffseasonEvent` 호출에서 ownerBudgetDay 블록이 스킵되어 정상 진행된다.

---

## 8. 투자 효과 적용 상세

### 8.1 시설 (facility) → 관중 점유율

**파일**: `services/financeEngine/attendanceModel.ts`

```typescript
calculateGameAttendance(homeTeam, awayTeamId, facilityBonus?)

// occupancy 계산 순서:
// 1. BASE_OCCUPANCY[marketTier]         (Tier 1: 45%, Tier 4: 30%)
// 2. 승률 보정: (winPct − 0.5) × 0.8   (최대 ±40%)
// 3. 스타 인기도: (starPower/100) × 0.18
// 4. 빅마켓 상대: +5%
// 5. facilityBonus                      ← ★ 투자 효과
// clamp: [25%, 100%]
```

`BudgetManager.processHomeGame()` → `getTeamInvestmentEffects(homeTeamId)?.facilityBonus` 전달

### 8.2 마케팅 (marketing) → MD 수익

**파일**: `services/financeEngine/attendanceModel.ts`

```typescript
calculateMerchandiseRevenue(homeTeamId, attendance, roster?, marketingBonus?)

// MD 수익 = attendance × mdSpend × (1 + marketingBonus × 0.5)
// marketingBonus=0.20 → ×1.10 (+10% MD 수익)
```

**파일**: `services/financeEngine/revenueCalculator.ts`

```typescript
calculateFixedRevenue(teamId, prevSeasonWinPct?, roster?, marketingBonus?)

// 스폰서십 = sponsorshipBase × winPctBonus × nationalPopBonus × (1 + marketingBonus)
// marketingBonus=0.20 → +20% 스폰서십
```

마케팅은 두 채널에 모두 반영된다:
- 스폰서십(연간 고정): marketingBonus × 1.0
- MD(경기별): marketingBonus × 0.5

### 8.3 훈련 (training) → 선수 성장 배율

**파일**: `services/coachingStaff/trainingEngine.ts`

```typescript
computeTrainingEfficiency(staff, budget, trainingInvestmentMult?)

globalMult = baseGlobalMult × (trainingInvestmentMult ?? 1.0)
```

`trainingInvestmentMult` = `leagueInvestmentState[teamId]?.effects.trainingMultiplier`

**적용 시점**: `moratoriumStart` 이벤트 → `handleMoratoriumStart()` → `processOffseasonTraining(teams, configs, coaching, trainingInvestmentMults)`

> **중요**: `moratoriumStart`에서 적용되는 훈련 배율은 **이전 시즌**에 배분한 값이다. 현재 시즌 ownerBudgetDay에 배분한 값은 **다음 오프시즌** 훈련에 적용된다.

### 8.4 스카우팅 (scouting) → 드래프트 포텐셜 정확도

**파일**: `services/draft/rookieGenerator.ts`

```typescript
generatePotential(rng, rank, potOffset, scoutingAccuracy = 0)

// 포텐셜 stddev = 4 × (1 − scoutingAccuracy × 0.7)
// scoutingAccuracy = 0.0 → stddev = 4.0 (최대 노이즈, 불확실성 높음)
// scoutingAccuracy = 1.0 → stddev = 1.2 (최소 노이즈, 예측 정확)
```

높은 스카우팅 투자 → 드래프트 전망치와 실제 포텐셜의 차이가 줄어든다.

---

## 9. BudgetManager 싱글턴 통합

**파일**: `services/financeEngine/budgetManager.ts`

```typescript
class BudgetManager {
    private investmentState: LeagueInvestmentState = {};

    setInvestmentState(state: LeagueInvestmentState): void
    getInvestmentState(): LeagueInvestmentState
    getTeamInvestmentEffects(teamId: string): InvestmentEffects | undefined
}
```

### 저장/복원

```typescript
// 저장 (toSaveData)
team_finances[teamId].investmentState = this.investmentState[teamId]

// 복원 (loadFromSaveData)
this.investmentState[teamId] = saved.investmentState ?? createDefaultInvestmentState(1)
```

구세이브에 `investmentState`가 없으면 `createDefaultInvestmentState(1)`로 폴백된다.

---

## 10. FrontOffice 통합

**파일**: `views/FrontOfficeView.tsx`

`FrontOfficeTab`에 `'investment'` 탭 추가. 미배분 상태일 때 탭 버튼에 노란 맥박 인디케이터가 표시된다.

```
[클럽] [연봉] [코칭] [드래프트픽] [구단주투자 ●]
                                           ↑ 미배분 시 노란 점
```

**탭 콘텐츠**:
- 배분 상태 (`배분 완료 / 미배분`)
- 배분 완료: 현재 시즌 효과 수치 조회
- 미배분: "지금 배분하기" 버튼 → `/owner-budget` 이동

**파일**: `pages/FrontOfficePage.tsx`

```typescript
onInvestmentTabOpen={() => navigate('/owner-budget')}
investmentConfirmed={gameData.leagueInvestmentState[gameData.myTeamId]?.allocationConfirmed ?? false}
```

---

## 11. 상태 동기화 다이어그램

```
[세이브 로드]
  saves.team_finances[teamId].investmentState
      ↓ loadFromSaveData()
  BudgetManager.investmentState
      ↓ getInvestmentState()
  useGameData.leagueInvestmentState (React 상태)

[ownerBudgetDay 이벤트]
  initializeLeagueInvestmentState()
      ↓ useSimulation → setLeagueInvestmentState
  useGameData.leagueInvestmentState
      ↓ getBudgetManager().setInvestmentState()
  BudgetManager.investmentState

[유저 배분 확정]
  handleInvestmentConfirm(allocations)
      ├─ setLeagueInvestmentState → React 상태
      ├─ getBudgetManager().setInvestmentState() → 싱글턴
      └─ forceSave() → DB checkpoint

[경기 진행 중]
  BudgetManager.processHomeGame()
      └─ getTeamInvestmentEffects(teamId) → facilityBonus, marketingBonus
```

---

## 12. 구현 파일 목록

| 파일 | 역할 |
|---|---|
| `types/finance.ts` | `InvestmentCategory`, `InvestmentEffects`, `TeamInvestmentState`, `LeagueInvestmentState` 타입 정의 |
| `services/financeEngine/investmentEngine.ts` | 예산 계산, CPU 자동 배분, 효과 계산, 초기화 함수 |
| `utils/seasonConfig.ts` | `ownerBudgetDay` Key Date 정의 (`SeasonKeyDates`) |
| `services/simulation/offseasonEventHandler.ts` | `ownerBudgetDay` 이벤트 디스패치, `handleMoratoriumStart` 훈련 효과 전달 |
| `services/financeEngine/budgetManager.ts` | `investmentState` 싱글턴 관리, 저장/복원 |
| `services/financeEngine/attendanceModel.ts` | `facilityBonus`, `marketingBonus` (MD) 적용 |
| `services/financeEngine/revenueCalculator.ts` | `marketingBonus` (스폰서십) 적용 |
| `services/coachingStaff/trainingEngine.ts` | `trainingInvestmentMult` 적용 |
| `services/draft/rookieGenerator.ts` | `scoutingAccuracy` 적용 (포텐셜 노이즈) |
| `hooks/useGameData.ts` | `leagueInvestmentState` 상태, 복원, `handleInvestmentConfirm` |
| `hooks/useSimulation.ts` | `investmentConfirmed` 멱등성, OwnerBudget blocked 케이스, `leagueInvestmentState` 전달 |
| `App.tsx` | `/owner-budget` 라우트, `OFFSEASON_VIEW_TO_PATH['OwnerBudget']` |
| `pages/OwnerBudgetPage.tsx` | 라우트 페이지, InvestmentPanel 래핑 |
| `components/frontoffice/InvestmentPanel.tsx` | 슬라이더 UI, 실시간 효과 미리보기 |
| `views/FrontOfficeView.tsx` | `investment` 탭 (배분 상태 조회/이동 버튼) |
| `pages/FrontOfficePage.tsx` | `onInvestmentTabOpen`, `investmentConfirmed` prop 연결 |

---

## 13. 알려진 제약 및 한계

- **첫 시즌 처리**: 시즌 1은 `openingNight` 이전에 `ownerBudgetDay`가 정상 발화되어야 하지만, 현재 게임 시작 시 `offseasonPhase === null`이므로 첫 시즌에는 투자 배분 UI가 나타나지 않는다. 첫 시즌은 `createDefaultInvestmentState(1)` 기본값(모두 0)으로 진행된다.
- **훈련 효과 시차**: 당해 ownerBudgetDay 배분의 `trainingMultiplier`는 **다음 시즌 오프시즌**에 적용된다. 첫 배분 연도의 훈련 효과는 없다.
- **leagueTrainingConfigs 미전달**: `dispatchOffseasonEvent`에 `leagueTrainingConfigs`가 전달되지 않아 `processOffseasonTraining`에서 코칭스태프 기반 훈련 효율이 항상 기본값으로 적용된다. (`leagueCoachingData`는 전달됨)
- **스카우팅 정확도**: 현재 `generateDraftClass`에서 `scoutingAccuracy`를 받아 포텐셜 stddev를 조정하지만, 드래프트 보드 UI의 "보이는" 수치에 노이즈를 얼마나 주는지는 별도 구현이 필요하다.
- **저장 키 일관성**: `forceSave`에서 `leagueInvestmentState`를 오버라이드로 넘기지만, `getFinancesSnapshot()`을 통해 `team_finances.investmentState`로도 저장된다. 양쪽 모두 저장되므로 복원은 `team_finances` 경로가 사용된다.
