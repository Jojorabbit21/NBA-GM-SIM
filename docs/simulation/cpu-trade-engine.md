# CPU 트레이드 엔진 아키텍처

## 개요

CPU 팀들의 트레이드 의사결정을 담당하는 고도화 엔진.
"팀의 문제와 목표를 먼저 정의하고, GM 성격에 따라 자산 가치를 다르게 평가하며, 트레이드 후 팀 상태 개선을 기준으로 결정"하는 5단계 파이프라인으로 구성.

> **주 진입점**: `cpuTradeSimulator.ts` → `runCPUTradeRound()`
> **고도화 엔진 파일**: `services/tradeEngine/` 내 신규 모듈들
> **CBA/실행**: 기존 `tradeExecutor.ts`, `salaryRules.ts`, `stepienRule.ts` 그대로 유지

---

## 5단계 파이프라인

```
매 트레이드 사이클 (runCPUTradeRound 호출마다):

1. TeamTradeState 계산     → buildTeamTradeState()      [teamAnalysis.ts]
2. 시장 참가 팀 선정       → calculateParticipationScore() [tradeParticipation.ts]
3. 트레이드 목표 생성      → generateTradeGoal()         [tradeGoalEngine.ts]
4. 목표 기반 타깃 탐색     → findTradeTargets()          [tradeTargetFinder.ts]
5. 유틸리티 검증 후 실행   → calculateTradeUtility()     [tradeUtilityEngine.ts]
                              → executeTrade()            [tradeExecutor.ts]
```

---

## 1단계: 팀 트레이드 상태 (`TeamTradeState`)

### 타입 (`types/trade.ts`)

```ts
interface TeamTradeState {
    phase: TeamDirection;        // winNow / buyer / standPat / seller / tanking
    strengthNow: number;         // 현재 전력 (스타팅5 ×1.0 + 로테이션3 ×0.6 가중 평균)
    strengthFuture: number;      // 미래 전력 (나이 계수 적용 OVR 가중 평균)
    timelineAge: number;         // 주전 8인 평균 나이
    financialPressure: number;   // 재정 압박 (0~1, 캡→럭셔리택스 구간)
    winPct: number;              // 현재 시즌 승률
    needs: Partial<Record<FARole, number>>;  // FA롤별 필요도 (0~1)
    surpluses: Record<string, number>;       // 포지션별 과잉 선수 수
    picksOwnedScore: number;     // 보유 픽 가치 합계
    openRosterFlex: number;      // 로스터 여유 인원 (15 - 현재)
    tradeGoal?: TradeGoalType;
}
```

### 계산 로직 (`teamAnalysis.ts` → `buildTeamTradeState`)

| 필드 | 계산 방법 |
|---|---|
| `strengthNow` | top8 중 스타팅5 OVR×1.0 + 벤치3 OVR×0.6 가중 평균 |
| `strengthFuture` | 나이계수(≤24→×1.15, ≤28→×1.0, ≤32→×0.85, ≥33→×0.65) 적용 OVR 평균 |
| `timelineAge` | top8 단순 평균 나이 |
| `financialPressure` | `max(0, (payroll - capLine) / (taxLine - capLine))` — 1에 클램프 |
| `needs[role]` | 롤별 최고 OVR 기준: `max(0, (75 - bestOvr) / 40)` |
| `surpluses[pos]` | 포지션별 선수 수 - 2 (최솟값 0) |
| `picksOwnedScore` | 팀 보유 픽 전체 `getPickTradeValue` 합산 |

**FARole**: `lead_guard` / `combo_guard` / `3and_d` / `shot_creator` / `stretch_big` / `rim_big` / `floor_big` (FA 시스템 `determineFARole()` 재활용)

---

## 2단계: 시장 참가 결정 (`tradeParticipation.ts`)

### `calculateParticipationScore(teamState, gmProfile, daysSinceLastTrade, daysToDeadline): number`

0~1 점수. **임계값 0.35 이상**이면 시장 참가 (`PARTICIPATION_THRESHOLD`).

| 요인 | 기여 | 상세 |
|---|---|---|
| 팀 필요도 | ×0.25 | `max(Object.values(needs))` |
| 성적-전력 괴리 | ×0.15 | `abs(winPct - expectedWinPct)` |
| 재정 압박 | ×0.10 | `financialPressure` |
| GM 공격성 | ×0.25 | `aggressiveness / 10` |
| 방향성 보너스 | — | winNow+0.10, tanking+0.12, seller+0.08, buyer+0.07, standPat-0.05 |
| 데드라인 근접 | 최대+0.20 | 30일 이내 선형 증가 |
| 쿨다운 패널티 | 최대-0.50 | 14일 미만 → `-(1 - days/14) × 0.50` |

> **현재 구현 제약**: `daysSinceLastTrade`는 `cpuTradeSimulator.ts`에서 99로 고정 전달 (쿨다운 미활성화). 향후 팀별 마지막 트레이드 날짜 추적 시 활성화.

---

## 3단계: 트레이드 목표 생성 (`tradeGoalEngine.ts`)

### `generateTradeGoal(teamState, gmProfile, team): TradeGoalType`

우선순위 순으로 조건 체크:

| 우선순위 | 조건 | 목표 |
|---|---|---|
| 1 | `financialPressure ≥ 0.85` | `SALARY_RELIEF` |
| 2 | `phase === 'winNow' && starWillingness ≥ 7 && OVR90+ 없음` | `STAR_UPGRADE` |
| 3 | `(winNow\|buyer) && 롤 need ≥ 0.7` | `ROLE_ADD` |
| 4 | `(seller\|tanking) && contractYears=1 && OVR≥70 선수 보유` | `EXPIRING_LEVERAGE` |
| 5 | `(seller\|tanking) && youthBias ≥ 6` | `FUTURE_ASSETS` |
| 6 | `(seller\|tanking)` | `SURPLUS_CLEAR` |
| 7 | `standPat && youthBias ≥ 7` | `FUTURE_ASSETS` |
| 8 | 전체 surplus 합 ≥ 4 | `SURPLUS_CLEAR` |
| 9 | 어떤 롤 need ≥ 0.4 | `DEPTH_ADD` |
| 기본 | — | `STARTER_UPGRADE` |

### TradeGoalType 8종

| 목표 | 설명 |
|---|---|
| `STAR_UPGRADE` | OVR 85+ 스타 확보 |
| `STARTER_UPGRADE` | OVR 78+ 주전 보강 |
| `ROLE_ADD` | 급박한 FA 롤 보강 |
| `DEPTH_ADD` | OVR 68+ 뎁스 보강 |
| `FUTURE_ASSETS` | 젊은 선수(≤24) + OVR 65+ 확보 |
| `SALARY_RELIEF` | 저연봉(< $12M) 선수 수혈 |
| `SURPLUS_CLEAR` | 잉여 자원 정리 (OVR 68+) |
| `EXPIRING_LEVERAGE` | 단기계약(≤2년) OVR 72+ 타깃 |

---

## 4단계: 자산 가용성 평가 (`assetAvailability.ts`)

### `getPlayerAvailability(player, team, teamState, gmProfile): number` (0~1)

#### Hard Block (즉시 0)
- `player.contract.noTrade === true`
- `OVR ≥ UNTOUCHABLE_OVR` (tradeConfig 상수)

#### 상승 요인
| 요인 | 가중치 |
|---|---|
| 방향성 기본 (tanking) | +0.40 |
| 방향성 기본 (seller) | +0.30 |
| 방향성 기본 (buyer) | +0.15 |
| 방향성 기본 (winNow) | +0.10 |
| 포지션 surplus ≥ 2 | +0.20 |
| 포지션 surplus ≥ 1 | +0.08 |
| 나쁜 만기 계약 (contractYears≤1 && OVR<78 && salary>$12M) | +0.20 |
| 타임라인 불일치 (age≥33 && timelineAge<28) | +0.20 |
| 탱킹팀 + age≥30 | +0.15 |
| 팀 수준 이하 (OVR < strengthNow - 15) | +0.10 |
| 로스터 순위 12위 이하 | +0.10 |
| 로스터 순위 9~11위 | +0.05 |

#### 하강 요인
| 요인 | 가중치 |
|---|---|
| 로스터 Top 2 | -0.40 |
| 로스터 Top 2~4 | -0.20 |
| OVR ≥ 90 | -0.50 |
| OVR ≥ 87 | -0.30 |
| OVR ≥ 83 | -0.10 |
| youthBias ≥ 8 && age ≤ 22 | -0.30 |
| youthBias ≥ 6 && age ≤ 23 | -0.15 |
| starWillingness ≥ 8 && OVR ≥ 85 | -0.30 |
| 부상 중 | -0.30 |

> **임계값**: `findTradeTargets()`에서 `availability < 0.20` 선수 제외

---

## 5단계: 목표 기반 타깃 탐색 (`tradeTargetFinder.ts`)

### `findTradeTargets(buyerTeam, buyerState, buyerProfile, goal, allTeams, allProfiles, allStates): TradeTarget[]`

```ts
interface TradeTarget {
    sellerTeamId: string;
    player: Player;
    valueToTeam: number;       // 구매자 팀 기준 선수 가치
    availability: number;      // 판매자 팀의 판매 의향 (0~1)
    compatibilityScore: number;
}
```

**탐색 순서:**
1. 목표별 조건으로 전 리그 선수 필터 (`matchesGoal`)
2. `availability ≥ 0.20` 필터
3. `valueToTeam > 0` 필터
4. `compatibilityScore` 내림차순 정렬 → 상위 5개 반환

**compatibilityScore 공식:**
```
availability × 0.5 + estimateCompatibility × 0.3 + (valueToTeam / 50000) × 0.2
```

**estimateCompatibility:** 판매자가 seller/tanking이면 +0.4, 구매자 잉여 포지션 있으면 +0.3, winNow↔seller 매칭이면 +0.3

---

## 자산 가치 이원화

### 시장 가치 vs 팀별 가치 (`tradeValue.ts`)

#### `getPlayerMarketValue(player)` — 리그 공통 기준
기존 `getPlayerTradeValue()` 알리아스. OVR × 샐러리효율 × 나이계수 × 계약연수 기반.

#### `getPlayerValueToTeam(player, teamState, gmProfile)` — GM 성격 반영

```
base = getPlayerMarketValue(player)

+ needFitBonus:
    roleNeed = teamState.needs[determineFARole(player)]
    bonus = base × roleNeed × 0.30

+ timelineBonus:
    ageDiff = abs(player.age - teamState.timelineAge)
    ≤3세 차이 → ×1.05
    ≥8세 차이 → ×0.85

+ starBiasBonus (starWillingness/10 > 0.6):
    OVR ≥ 87 → base × (1 + (slider/10 - 0.6) × 0.25)
    OVR ≥ 82 → base × (1 + (slider/10 - 0.6) × 0.10)

+ youthBiasBonus (youthBias/10 > 0.6):
    age ≤ 23 && potential > ovr → (potential - ovr) × base × 0.08
    age ≥ 32 → -(age - 31) × base × 0.05

- injuryPenalty:
    rawPenalty = injuryRisk × base × 0.4
    adjusted = rawPenalty × (1 - riskTolerance/10 × 0.7)

- redundancyPenalty:
    surpluses[position] ≥ 2 → × 0.85
```

### GM 성격 반영 픽 가치 (`pickValueEngine.ts`)

#### `getPickValueToGM(pick, teams, currentDate, gmProfile, teamState)`

```
base = getPickTradeValue(pick, teams, currentDate)
× (1.0 + youthBias/10 × 0.20)          // 유스 선호 → 픽 가치 상승
× (1.0 - pickWillingness/10 × 0.15)    // 픽 방출 성향 → 자기 팀 픽 저평가
× phaseMultiplier:
    winNow → ×0.75   (픽보다 즉시 전력 선호)
    buyer  → ×0.90
    seller → ×1.10
    tanking→ ×1.20   (픽이 핵심 자산)
    standPat→×1.00
```

---

## 트레이드 유틸리티 평가 (`tradeUtilityEngine.ts`)

### TradeUtility 공식

```
utility = (incomingValue - outgoingValue) / outgoingValue
        + goalBonus / outgoingValue
        - regretCost / outgoingValue

incomingValue = Σ getPlayerValueToTeam(incoming) + Σ getPickValueToGM(incomingPicks)
outgoingValue = Σ getPlayerValueToTeam(outgoing) + Σ getPickValueToGM(outgoingPicks)
goalBonus     = incomingValue × 0.20 (목표 달성 시)
```

**목표 달성 판정 (`checkGoalFulfillment`):**
- `STAR_UPGRADE`: incoming에 OVR ≥ 87 선수 존재
- `STARTER_UPGRADE`: OVR ≥ 78 선수 존재
- `ROLE_ADD`: 급박한 롤 선수 수혈
- 나머지: incoming 선수 있으면 달성

### RegretCost (후회 비용)

| 상황 | 비용 |
|---|---|
| pickWillingness ≤ 4 + 1라운드 픽 방출 | 픽당 `500 × (5 - slider)` |
| youthBias ≥ 7 + 22세 이하 방출 | 선수당 `1000 × (slider - 6)` |
| 포지션 공백 우려 (해당 롤 need ≥ 0.5) | 선수당 800 |
| phase === 'standPat' (더 좋은 딜 대기) | 200 |

### AcceptScore (유저 제안 수락 기준)

`calculateAcceptScore()` = `calculateTradeUtility()` + direction별 임계값 적용

| direction | 최소 utility | 의미 |
|---|---|---|
| `winNow` | -0.08 | 8% 손해까지 허용 |
| `buyer` | -0.02 | 2% 손해까지 허용 |
| `standPat` | +0.04 | 4% 이상 개선만 수락 |
| `seller` | -0.12 | 12% 손해까지 허용 |
| `tanking` | -0.15 | 15% 손해까지 허용 |

---

## 파이프라인 통합 (`cpuTradeSimulator.ts`)

### `runCPUTradeRound()` 실행 흐름

```
1. 데드라인/시즌 전 체크
2. baseChance × 1.5 bail-out (데드라인 근접일수록 상승)
3. 전 CPU 팀 TeamTradeState 계산 (buildTeamTradeState)
4. ParticipationScore ≥ 0.35인 팀만 선별 (participatingTeams)
5. 참가 팀별 TradeGoal 생성 (generateTradeGoal)
6. [구매자 팀별 반복]
   a. goal === 'FUTURE_ASSETS' → 기존 호환성 방식 fallback (픽 탐색은 다른 경로)
   b. findTradeTargets() → 타깃 상위 5개
   c. reorderAssetsWithTarget() → 타깃 선수 최우선 배치
   d. constructTradePackage() → 패키지 구성
   e. calculateTradeUtility() — 양팀 모두 임계값 이상이어야 진행
   f. executePkg() → executeTrade() 경유
7. 목표 기반 탐색 실패 시 → 기존 호환성 방식 fallback
8. 참가 비율 외 팀: 기존 호환성 스캔 1회 추가 시도
```

### Fallback 설계

| 상황 | 처리 |
|---|---|
| goal === 'FUTURE_ASSETS' | 기존 `calculateCompatibility()` 기반 매칭 |
| `findTradeTargets()`에서 타깃 없음 | 기존 호환성 방식 3쌍 후보 시도 |
| leagueGMProfiles 없음 | 기존 전체 파이프라인 유지 |
| 참가 팀 < 2팀 | 즉시 null 반환 |

---

## GM 슬라이더 5종 영향 요약

| 슬라이더 | 영향 범위 |
|---|---|
| `aggressiveness` (1~10) | 참가 점수 +0~0.25 |
| `starWillingness` (1~10) | STAR_UPGRADE 목표 조건 / 스타 보호(-0.30) / 팀별 가치 starBiasBonus |
| `youthBias` (1~10) | FUTURE_ASSETS 목표 조건 / 유망주 보호(-0.30) / 픽 가치+20% / youthBiasBonus / RegretCost |
| `riskTolerance` (1~10) | 부상 페널티 감쇠 (높을수록 부상 선수도 가치 있게 평가) |
| `pickWillingness` (1~10) | 픽 가치 감산(-15%) / RegretCost (낮을수록 픽 방출 후회 ↑) |

---

## 파일 목록

### 신규 파일
| 파일 | 역할 |
|---|---|
| `tradeParticipation.ts` | 시장 참가 점수 계산 |
| `tradeGoalEngine.ts` | 트레이드 목표 생성 |
| `assetAvailability.ts` | 선수별 가용성 점수 (AvailabilityScore) |
| `tradeTargetFinder.ts` | 목표 기반 타깃 탐색 |
| `tradeUtilityEngine.ts` | TradeUtility + AcceptScore + RegretCost |

### 수정 파일
| 파일 | 추가 내용 |
|---|---|
| `types/trade.ts` | `TeamTradeState`, `TradeGoalType` |
| `teamAnalysis.ts` | `buildTeamTradeState()` |
| `tradeValue.ts` | `getPlayerMarketValue()`, `getPlayerValueToTeam()` |
| `pickValueEngine.ts` | `getPickValueToGM()` |
| `cpuTradeSimulator.ts` | 10단계 파이프라인 통합 |
| `tradeBlockManager.ts` | `evaluateUserProposals()` AcceptScore 기반 교체 |

### 유지 파일 (변경 없음)
- `tradeExecutor.ts` — CBA 검증 + 실행
- `salaryRules.ts` / `stepienRule.ts` — CBA 규칙
- `gmProfiler.ts` — 방향성 파라미터
- `pickValueEngine.ts` 기존 함수 — 하위호환 유지

---

## 하위호환

- `runCPUTradeRound()` 시그니처 변경 없음 (기존 callers 그대로)
- `leagueGMProfiles` 없이 호출 시 기존 방식으로 자동 폴백
- `getPlayerTradeValue()` 유지 (기존 호출부 변경 불필요)
- `getPickTradeValue()` 유지 (새 `getPickValueToGM()`은 별도 함수)
