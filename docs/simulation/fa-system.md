# FA & 샐러리캡 시스템 설계 문서

## Context

싱글플레이어 → 멀티시즌 확장을 위한 FA 시장 및 샐러리캡 예외 조항 구현.
트레이드 시스템이 완성된 구조 위에 FA 서명 파이프라인을 추가.
**실제 NBA 2025-26 룰 기반**, 복잡도 대비 가치 낮은 예외 조항은 제외.

---

## 1. 샐러리캡 상수

```ts
// utils/constants.ts — 2025-26 실제 금액
export const LEAGUE_FINANCIALS = {
    SALARY_FLOOR:   139_182_000,
    SALARY_CAP:     154_647_000,
    TAX_LEVEL:      187_895_000,
    FIRST_APRON:    195_945_000,
    SECOND_APRON:   207_824_000,
};

export const SIGNING_EXCEPTIONS = {
    NON_TAX_MLE:  14_104_000,  // Non-Taxpayer MLE (1차 에이프런 미만 팀, 최대 4년)
    TAXPAYER_MLE:  5_685_000,  // Taxpayer MLE (1~2차 에이프런 사이 팀, 최대 2년)
};
```

---

## 2. 개인 연봉 상한 (맥스 실링) — CBA 절대 한도

**맥스 상한은 팀이 아무리 캡 스페이스가 남아도 초과 불가능한 하드 실링이다.**
YOS(경력)에 따라 개인별 상한이 결정되며, 유저 오퍼 입력 시 슬라이더 최대값으로 강제 적용.

```
YOS 0~6년: CAP × 25% = $38.7M
YOS 7~9년: CAP × 30% = $46.4M
YOS 10+년: CAP × 35% = $54.1M
```

→ `maxAllowed` = 선수 요구 상한 + 유저/CPU 오퍼 절대 상한 (동일 값)

---

## 3. FA 협상 UX 플로우 (2단계)

```
1단계: 계약 슬롯 선택
   → 팀 상황에 따라 사용 불가 슬롯은 비활성화(그레이아웃)
   → 자팀 FA가 아니면 Bird Rights 슬롯 숨김

2단계: 해당 슬롯의 허용 범위 내에서 금액(연봉) · 연수 입력
   → 슬롯별 상한이 슬라이더 최대값으로 자동 적용
   → 선수의 askingSalary / askingYears 기준점 표시
```

---

## 4. 계약 슬롯 (`signingType`)

```ts
type SigningType = 'cap_space' | 'non_tax_mle' | 'tax_mle' | 'bird_full' | 'bird_early' | 'bird_non' | 'vet_min';
```

| 슬롯 | 조건 | 연봉 상한 | 제약 |
|------|------|-----------|------|
| `cap_space` | 팀 페이롤 < 캡 (캡 아래 팀의 기본 상태) | 잔여 캡 스페이스 *(단, maxAllowed 초과 불가)* | — |
| `non_tax_mle` | 1차 에이프런 미만, MLE 미사용 | $14.104M | 하드캡 트리거, 시즌 1회 |
| `tax_mle` | 1~2차 에이프런 사이, MLE 미사용 | $5.685M | 최대 2년, 시즌 1회 |
| `bird_full` | 자팀 FA, teamTenure ≥ 3 | maxAllowed (캡 초과 가능) | — |
| `bird_early` | 자팀 FA, teamTenure = 2 | 직전연봉 175% or 리그평균 105% | 캡 초과 가능 |
| `bird_non` | 자팀 FA, teamTenure = 1 | 직전연봉 120% | 캡 초과 가능 |
| `vet_min` | 항상 가능 | 경력별 최저연봉 | — |

> **캡 스페이스 슬롯 주의:** 별도 예외 조항이 아니라 캡 아래 팀의 기본 상태.
> 팀 페이롤이 캡을 초과하면 이 슬롯 자체가 비활성화됨.
> 개인 맥스 실링(maxAllowed)은 캡 스페이스 슬롯에서도 동일하게 적용.

---

## 5. Bird Rights (버드 권한) 시스템

| 등급 | 조건 | 최대 연수 |
|------|------|---------|
| **Full Bird** | 같은 팀 3+ 시즌 | 5년 |
| **Early Bird** | 같은 팀 2시즌 | 4년 |
| **Non-Bird** | 같은 팀 1시즌 | 4년 |

→ 트레이드 시 버드 권한도 이동. FA로 이적 시 리셋.

```ts
function getBirdRightsLevel(teamTenure: number): 'full' | 'early' | 'non' | 'none' {
    if (teamTenure >= 3) return 'full';
    if (teamTenure === 2) return 'early';
    if (teamTenure === 1) return 'non';
    return 'none';
}
```

오프시즌 처리 (`playerAging.ts`):
- 재계약(같은 팀 유지): `teamTenure += 1`
- 트레이드/FA 이적: `teamTenure = 0`

---

## 6. MLE (Mid-Level Exception) 시스템

```ts
type MLETier = 'non_tax' | 'taxpayer' | 'none';

function getMLETier(totalPayroll: number): MLETier {
    if (totalPayroll < FIRST_APRON)   return 'non_tax';   // $14.104M, 4년
    if (totalPayroll < SECOND_APRON) return 'taxpayer';  // $5.685M, 2년
    return 'none';  // 2차 에이프런 초과: MLE 불가
}
```

- 시즌당 1회 제한: `TeamSigningState.usedMLE: boolean` (league_fa_market 내 저장)
- Non-Taxpayer MLE 사용 시 하드캡 트리거 → 이후 1차 에이프런 초과 서명 불가

---

## 7. FA 연봉 산정 엔진 (`services/fa/faValuation.ts`)

### 핵심 공식

```
MarketValueScore = (RoleScore × Reliability) + AwardBonus + AgeBonus + ScarcityBonus + DemandBonus - InjuryPenalty
```

### 재사용 기존 코드

| 함수/타입 | 파일 |
|-----------|------|
| `ArchetypeRatings` 12종 롤 정의 | `services/game/engine/pbp/pbpTypes.ts` |
| `InjuryHistoryEntry` | `types/player.ts` |
| `PlayerAwardEntry`, `PlayerAwardType` | `types/player.ts` |
| `generateSaveTendencies()` | `utils/hiddenTendencies.ts` |

---

### Step 1: FA 롤 결정 (`determineFARole()`)

포지션 + 능력치 조합으로 7개 FA 롤 중 하나 결정.
(`calculatePlayerArchetypes()`는 LivePlayer 전용이므로 능력치 직접 계산)

```ts
type FARole = 'lead_guard' | 'combo_guard' | '3and_d' | 'shot_creator' | 'stretch_big' | 'rim_big' | 'floor_big';

// 롤 판별 기준
// PG: handling+passIq 우세 → lead_guard, 아니면 combo_guard
// SG/SF: (threeVal+perDef) 우세 → 3and_d / (handling+mid) 우세 → shot_creator
// PF: threeVal >= 72 → stretch_big, 아니면 floor_big
// C:  blk/intDef 우세 → rim_big, 아니면 floor_big
```

---

### Step 2: 롤별 퍼포먼스 스코어 (`calcRoleScore()`)

per-game 스탯 → 리그 동 롤 풀 백분위 정규화 → 롤 가중치 적용 → 0~100점.
최소 기준: `stats.g >= 10`만 비교 풀 포함.

**효율 스탯 (직접 계산, 사전계산 필드 없음):**
```ts
const tsPct  = stats.pts / (2 * (stats.fga + 0.44 * stats.fta)) || 0;
const efgPct = (stats.fgm + 0.5 * stats.p3m) / stats.fga || 0;
const avail  = Math.min(1, stats.g / 60) * Math.min(1, stats.mp / 1800);
```

**롤별 가중치 테이블 (합 1.0):**

| 롤 | 핵심 가중치 |
|----|-----------|
| `lead_guard` | pts×0.20, ast×0.24, ts%×0.16, 3p%×0.08, tov_inv×0.10, fta×0.07, avail×0.10, stl×0.05 |
| `combo_guard` | pts×0.25, ast×0.18, 3p%×0.14, ts%×0.14, tov_inv×0.08, stl×0.06, avail×0.10, def×0.05 |
| `3and_d` | 3p%×0.18, 3pa×0.12, ts%×0.14, def×0.22, stl×0.08, tov_inv×0.06, avail×0.12, pts×0.08 |
| `shot_creator` | pts×0.28, ts%×0.16, ast×0.14, reb×0.08, tov_inv×0.08, avail×0.10, def×0.06, stl×0.10 |
| `stretch_big` | 3p%×0.20, ts%×0.16, reb×0.18, def×0.14, blk×0.08, avail×0.12, pts×0.12 |
| `rim_big` | reb×0.20, blk×0.18, def×0.18, ts%×0.14, fta×0.07, avail×0.12, pts×0.10, tov_inv×0.05 |
| `floor_big` | reb×0.22, ast×0.14, ts%×0.14, def×0.16, avail×0.14, pts×0.12, tov_inv×0.08 |

---

### Step 3: 신뢰도 계수 (`calcReliability()`)

소표본 과대평가 방지. 72경기/2200분 → 1.0 / 18경기/400분 → ~0.48

```ts
function calcReliability(stats: PlayerStats): number {
    return 0.35 + 0.65 * Math.min(1, stats.g / 60) * Math.min(1, stats.mp / 1800);
}
const adjustedPerfScore = roleScore * reliability;  // 0~100
```

---

### Step 4: 수상 보너스 (`calcAwardBonus()`) — 직전 시즌, 상한 +12

```ts
const AWARD_BONUS: Record<PlayerAwardType, number> = {
    MVP: 10, ALL_NBA_1: 8, DPOY: 6, FINALS_MVP: 5,
    ALL_NBA_2: 6, ALL_NBA_3: 5, ALL_DEF_1: 4, ALL_DEF_2: 3,
    CHAMPION: 2, REG_SEASON_CHAMPION: 1,
};
// min(직전시즌 awards 합산, 12)
```

---

### Step 5: 나이 보정 (`calcAgeBonus()`)

고연봉 예상(adjustedPerf >= 75) 선수는 나이 패널티 완화 (절반).

```ts
function calcAgeBonus(age: number, adjustedPerf: number): number {
    const hi = adjustedPerf >= 75;
    if (age <= 22) return hi ? 4 : 6;
    if (age <= 26) return hi ? 2 : 4;
    if (age <= 30) return hi ? 1 : 2;
    if (age <= 33) return hi ? -2 : -4;
    if (age <= 35) return hi ? -3 : -7;
    return hi ? -5 : -10;
}
```

---

### Step 6: 부상 패널티 (`calcInjuryPenalty()`)

`InjuryHistoryEntry.severity` 기반, 최대 -12.

```
직전 시즌 Season-Ending: -8
Major 2건+: -5 / Major 1건: -2
반복 부상 패턴 (비Minor 3건+): -2 추가
30세 이상: 패널티 × 1.5
```

---

### Step 7: 시장 희소성/수요 보정 (`buildMarketConditions()` + `calcMarketBonus()`)

**공급(Supply):** FA 후보 중 동 FA 롤 선수 수
**수요(Demand):** 30팀 중 해당 롤의 top-8 로테이션 능력치가 리그 하위 25%인 팀 수

```ts
export interface MarketCondition {
    roleSupply: number;
    roleDemand: number;
    ratio: number;  // demand / supply
}
```

**ratio → scarcityBonus (-4 ~ +6):**
```
ratio >= 3.0 → +6
ratio >= 2.0 → +4
ratio >= 1.5 → +2
ratio >= 1.0 → 0
ratio >= 0.5 → -2
ratio <  0.5 → -4
```

**demandBonus:** `min(5, floor(roleDemand / 3))`

**financialAmbition 민감도 스케일:**
```ts
// 야망 높을수록 시장 상황을 더 적극적으로 활용
const ambitionScale = 0.7 + financialAmbition × 0.6;  // 0.7~1.3
// 최종 적용: scarcityBonus × ambitionScale, demandBonus × ambitionScale
```

---

### Step 8: MarketValueScore 합산 → 캡 비중 → 목표 연봉

```ts
const marketValueScore =
    adjustedPerfScore + awardBonus + ageBonus + scarcityBonus + demandBonus - injuryPenalty;
```

**Score → capShare 티어:**

| Score | Cap % | 의미 |
|-------|-------|------|
| 90+   | 32.5% | 맥스급 |
| 82+   | 25.5% | 니어맥스 |
| 72+   | 18.5% | 상급 스타터 |
| 60+   | 12.5% | 스타터 |
| 48+   |  7.5% | 로테이션 상급 |
| 35+   |  4.0% | 벤치 |
| 미만  |  1.5% | 최저계약 |

```ts
const targetSalary = SALARY_CAP * scoreToCapShare(marketValueScore);
```

---

### Step 9: OpeningAsk / WalkAway (`calcNegotiationRange()`)

```ts
// financialAmbition 반영 (seeded 결정론적)
// openingAsk = targetSalary × (1.03~1.17)  야망 높을수록 높게 부름
// walkAway   = targetSalary × (0.80~0.99)  야망 높을수록 기준선 높음
// 최종: clamp(vetMin, maxAllowed)
```

---

### Step 10: 맥스 요구 게이트

```ts
const canDemandMax = maxEligible && marketValueScore >= 90 && (scarcityBonus + demandBonus) >= 4;
```

---

### Step 11: YOS → 개인 맥스 실링 + 베테랑 미니멈

```
maxAllowed: 0~6년 $38.7M / 7~9년 $46.4M / 10+년 $54.1M
vetMin:     0~3년 $1.5M  / 4~6년 $2.2M  / 7+년  $3.0M
```

### 요구 연수 (나이 기준)

```
≤25세: 4~5년 / 26~29세: 3~4년 / 30~32세: 2~3년 / 33~35세: 1~2년 / 36+세: 1년
marketValueScore > 60 → 범위 상한 / 이하 → 하한
```

---

### 주요 함수 시그니처

```ts
// 시장 공급/수요 지표 생성 (faMarketBuilder에서 먼저 호출)
export function buildMarketConditions(
    allPlayers: Player[],
    expiredPlayers: Player[],
    teams: Team[]
): Record<FARole, MarketCondition>

// 선수 FA 요구 조건 산정
export function calcFADemand(
    player: Player,
    allPlayers: Player[],
    marketConditions: Record<FARole, MarketCondition>,
    currentSeasonYear: number,
    currentSeason: string,
    tendencySeed: string
): FADemandResult

// 오퍼 수락 판단
export function evaluateFAOffer(
    offer: { salary: number; years: number },
    demand: FADemandResult,
    financialAmbition: number,
    seed: string
): boolean
```

**`FADemandResult` 타입 (`types/fa.ts`에 추가):**
```ts
export interface FADemandResult {
    askingSalary: number;      // openingAsk (협상 시작가)
    walkAwaySalary: number;    // 이 이하면 무조건 거절
    targetSalary: number;      // 내부 목표가
    askingYears: number;
    marketValueScore: number;
    faRole: FARole;
}
```

**`evaluateFAOffer()` 판단 로직:**
```ts
if (offer.salary >= demand.askingSalary)  return true;   // 요구 이상 → 무조건 수락
if (offer.salary < demand.walkAwaySalary) return false;  // 기준선 미달 → 무조건 거절
// walkAway ~ openingAsk 사이 → seed 기반 선형 확률
const acceptProb = (offer.salary - demand.walkAwaySalary) /
                   (demand.askingSalary - demand.walkAwaySalary);
```

---

## 8. 사전 작업 (타입·매핑 수정) — 1단계 완료

| 파일 | 변경 | 상태 |
|------|------|------|
| `types/player.ts` | `Player.draftYear?`, `Player.teamTenure?`, `SaveTendencies.financialAmbition`, `SavedPlayerState.teamTenure?` 추가 | ✅ 완료 |
| `services/dataMapper.ts` | `draft_year` row 매핑 추가 | ✅ 완료 |
| `utils/hiddenTendencies.ts` | `financialAmbition` 결정론적 생성 추가 | ✅ 완료 |
| `utils/constants.ts` | 샐러리캡 상수 2025-26 실제값 업데이트 + `SIGNING_EXCEPTIONS` 추가 | ✅ 완료 |
| `services/playerDevelopment/playerAging.ts` | 오프시즌 처리 시 `teamTenure` 갱신 | ⏳ 미완료 |
| `services/fa/faValuation.ts` (신규) | `buildMarketConditions()`, `calcFADemand()`, `evaluateFAOffer()` 구현 | ⏳ 미완료 |

---

## 9. 미구현 항목 (제외 결정)

| 항목 | 이유 |
|------|------|
| Room Exception ($8.781M) | 복잡도 대비 가치 낮음 |
| Bi-Annual Exception ($5.134M) | 동일 |
| 슈퍼맥스 | YOS + 수상 조건 복잡 |
| 데릭 로즈 룰 | 복잡도 대비 가치 낮음 |
| 루키 스케일 고정액 | 루키 드래프트에서 별도 처리 |

---

## 10. 미래 구현 예정 항목

| 항목 | 설명 |
|------|------|
| **보장/비보장 계약** | `guaranteedSalary` 필드, 방출 시 보장분만 데드캡으로 잡힘. 데드캡 추적 구조 필요 → FA 1차 구현 이후 추가. 현재는 전액 보장 계약만 구현. |

---

## 11. 검증 시나리오

| 케이스 | 기대 결과 |
|--------|-----------|
| 24세(YOS 3년), 평범한 스탯, 고야망(0.9) | $38.7M 상한 내 높은 요구 |
| 32세(YOS 11년), 올NBA1+스타스탯, 저야망(0.1) | $54.1M 상한이지만 대폭 할인 |
| 25세(루키 종료), 저스탯, 야망0.3 | $1.5M~$3M 근방 (앵커 없음) |
| YOS 7~9년 선수에게 $48M 오퍼 (maxAllowed $46.4M) | UI 슬라이더 최대값으로 차단 |
| 팀 페이롤 $120M → 잔여 캡 $34.6M | cap_space 슬롯 활성, 최대 $34.6M (단 maxAllowed 이내) |
| 팀 페이롤 $160M → 캡 오버 | cap_space 슬롯 비활성, MLE/Bird/vetMin만 가능 |
| 팀 페이롤 $180M → Non-Tax MLE 서명 | $14.104M 상한, 하드캡 트리거 |
| 팀 페이롤 $200M → Taxpayer MLE | $5.685M 상한, 최대 2년 |
| teamTenure=3인 자팀 FA → Full Bird | maxAllowed까지 오퍼 가능, 캡 초과 허용 |
| FA 시장 3&D 윙 희소(ratio 2.5), 고야망 선수 | scarcityBonus 높게 책정, openingAsk 상승 |
| 저야망 선수에게 walkAway의 110% 오퍼 | 높은 확률 수락 |
| 고야망 선수에게 openingAsk의 95% 오퍼 | 낮은 확률 수락 가능 |
