# 계약 익스텐션 협상 엔진

## 개요

단순 `salary >= askingSalary → 수락` 구조는 유저가 가격 흥정으로 뚫을 수 있음.
**"선수도 시장가치와 대체 선택지(BATNA)를 알고 있다"** 는 구조로 구현하여
염가 계약 악용을 막고 현실적인 협상이 가능하도록 설계.

**익스텐션 창**: POST_DRAFT 페이즈 (루키드래프트 완료 ~ moratoriumStart 사이)
*(디버그 중에는 FAView 항상 노출, 프로덕션 전환 시 페이즈 제한 추가 예정)*
**대상 선수**: 계약 1~2년 남은 자기 팀 선수 (선수옵션 보유·Season-Ending 부상 제외)

---

## 핵심 철학

```
협상 = 선수의 시장가치(BATNA)와 최소 수용선(Reservation Floor) 안에서
       유저가 얼마나 좋은 합의를 찾느냐
```

선수가 오퍼를 평가할 때 판단하는 것:
1. 나는 이 정도 가치의 선수다 (시장가치)
2. 다른 팀에서도 대충 이 정도는 받을 수 있다 (BATNA)
3. 이 팀에 남을 이유가 있는가 (loyalty / winDesire)
4. 이 제안은 나를 존중하는가 (감정 상태)
5. 내 성격상 돈/우승/충성/자존심 중 무엇이 더 중요한가 (SaveTendencies)

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `services/fa/extensionEngine.ts` | 협상 엔진 전체 |
| `views/FAView.tsx` | `'extensions'` 탭 + `ExtensionPanel` 컴포넌트 |
| `components/AppRouter.tsx` | `onExtensionOffer` 핸들러 + FAView props |
| `types/message.ts` | `EXTENSION_SIGNED` 메시지 타입 + `ExtensionSignedContent` |
| `components/inbox/MessageContentRenderer.tsx` | `EXTENSION_SIGNED` 인박스 렌더러 |

---

## 핵심 타입

### ExtensionPersonality (6개 성격 지표)

`generateSaveTendencies(tendencySeed, playerId)` + 나이로 계산:

```typescript
interface ExtensionPersonality {
    pride: number;             // 0~1  ← (ego + 1) / 2             [모욕선 결정]
    financialAmbition: number; // 0~1  ← SaveTendencies.financialAmbition
    loyalty: number;           // 0~1  ← SaveTendencies.loyalty     [Floor 완화, teamScore 보너스]
    winDesire: number;         // 0~1  ← SaveTendencies.winDesire   [강팀 선호 보너스]
    patience: number;          // 0~1  ← 1 - (temperament + 1) / 2
    riskAversion: number;      // 0~1  ← (player.age - 24) / 12    [안정성 할인]
}
```

> `loyalty`와 `winDesire`는 `SaveTendencies`에서 `seededUniform(0.0, 1.0)`으로 생성된 값을
> 그대로 사용 (파생 계산 없음). 이 엔진이 두 필드를 처음으로 실제 게임 로직에서 소비.

### ExtensionDemand (협상 핵심 5값)

```
Opening Ask > Target AAV >= BATNA >= Reservation Floor > Insult Threshold
```

```typescript
interface ExtensionDemand {
    openingAsk: number;       // 처음 요구 금액 (앵커 역할)
    targetAAV: number;        // 실제 원하는 적정 AAV
    reservationFloor: number; // 최소 수용선 (BATNA * 0.82 이상 하드 보장)
    insultThreshold: number;  // 모욕선 (Floor * 0.86~0.94, pride 비례)
    batnaAAV: number;         // 대체 시장 기대치
    askingYears: number;      // 요구 연수 (FA보다 1년 짧음, 최소 1)
}
```

### NegotiationState (React state로 라운드 간 유지, 저장 안 함)

```typescript
interface NegotiationState {
    playerId: string;
    demand: ExtensionDemand;
    personality: ExtensionPersonality;
    // 감정 (0~1)
    respect: number;             // 초기 0.70
    trust: number;               // 초기 0.75 (원소속팀 기본 신뢰)
    frustration: number;         // 초기 0.00
    // 이력
    roundsUsed: number;
    lowballCount: number;        // 모욕선 이하 누적 횟수
    lastOfferAAV: number;
    currentCounterAAV: number;
    currentCounterYears: number;
    // 플래그
    walkedAway: boolean;
    signed: boolean;
}
```

### ExtensionOfferContext (유저 제출 오퍼)

```typescript
interface ExtensionOfferContext {
    years: number;
    annualSalary: number;      // AAV
    contenderScore: number;    // 0~1 (팀 승률 기반: wins / (wins+losses) * 1.5, min 1)
}
```

### NegotiationResponse

```typescript
type NegotiationResponse =
    | { outcome: 'ACCEPT'; contract: PlayerContract }
    | { outcome: 'COUNTER'; counterAAV: number; counterYears: number; message: string }
    | { outcome: 'REJECT_HARD'; message: string }   // 모욕선 이하
    | { outcome: 'WALKED_AWAY'; message: string }   // 협상 중단
```

---

## 함수 설계

### `getExtensionCandidates(myTeam): Player[]`

```
필터:
  contractYears >= 1 && contractYears <= 2
  contract.option.type !== 'player'
  health !== 'Injured' || injuryHistory에 Season-Ending 없음
```

### `buildExtensionPersonality(player, tendencySeed): ExtensionPersonality`

```
st = generateSaveTendencies(tendencySeed, player.id)

pride             = clamp((st.ego + 1) / 2)
financialAmbition = clamp(st.financialAmbition)
loyalty           = clamp(st.loyalty)           // SaveTendencies 직접
winDesire         = clamp(st.winDesire)          // SaveTendencies 직접
patience          = clamp(1.0 - (st.temperament + 1) / 2)
riskAversion      = clamp((player.age - 24) / 12)  // 24세=0, 36세=1
```

### `calcTenureAvailability(player): number` *(내부 헬퍼)*

팀 재직 기간 동안의 가용성 계수 (0.82~1.00). 연봉 앵커에 할인으로 적용된다.

```
tenure  = max(1, player.teamTenure)
currentG = player.stats?.g ?? 0

// 현재 시즌 출전율 (75경기 = 풀시즌 기준)
currentAvail = currentG > 0 ? min(1, currentG / 75) : null

// 재직 기간 내 심각 부상 빈도 (Minor 제외)
recentInjuries = injuryHistory.slice(-(tenure * 5))
seriousCount   = recentInjuries.filter(severity ≠ 'Minor').length
injuryRate     = seriousCount / tenure       // 시즌당 심각 부상 횟수

availScore     = currentAvail ?? clamp(1 - injuryRate * 0.25)
injuryDiscount = min(0.10, injuryRate * 0.04)  // 최대 -10%

return clamp(0.85 + 0.15 * availScore - injuryDiscount, 0.82, 1.00)
```

| 상황 | availDiscount |
|------|--------------|
| 75경기 출전 + 부상 없음 | 1.00 (할인 없음) |
| 40경기 출전 + Minor만 | ~0.93 |
| 20경기 출전 + Season-Ending | ~0.82 (최대 할인) |

---

### `calcSalaryAnchorBATNA(player, personality): number` *(내부 헬퍼)*

직전 연봉(`player.salary`)에 성격 보정과 가용성 할인을 적용하여 BATNA 앵커를 산출한다.
시즌 중 협상이나 부상으로 인해 퍼포먼스 스탯이 비어 있어도 비현실적으로 낮은 BATNA를 방지한다.

```
// 앵커 비율: 직전 연봉 대비 FA 시장에서 기대하는 최소 수령액
anchorRatio = clamp(
    0.80
    + riskAversion      * 0.10   // 안정 선호 → 직전 연봉 기준 더 고수
    - loyalty           * 0.08   // 팀 충성 → 조금 더 양보 가능
    + financialAmbition * 0.08,  // 재정 야망 → 높은 앵커
    0.70, 0.92                   // 범위: 직전 연봉의 70%~92%
)

availDiscount    = calcTenureAvailability(player)   // 0.82~1.00
salaryAnchor     = prevSalary * anchorRatio * availDiscount
```

**성격 조합 예시** (직전 연봉 $30M 기준):

| riskAversion | loyalty | financialAmbition | anchorRatio | 앵커 (부상 없음) |
|:---:|:---:|:---:|:---:|:---:|
| 0.8 | 0.2 | 0.9 | 0.92 (상한) | ~$27.6M |
| 0.5 | 0.5 | 0.5 | 0.81 | ~$24.3M |
| 0.2 | 0.9 | 0.1 | 0.70 (하한) | ~$21.0M |

---

### `calcExtensionBATNA(player, allPlayers, tendencySeed, ...): number`

```
faDemand    = calcFADemand(player, allPlayers, NEUTRAL_MARKET, ...)
tieredFloor = getTierFloor(player.ovr)
personality = buildExtensionPersonality(player, tendencySeed)
salaryAnchor = calcSalaryAnchorBATNA(player, personality)

batna = max(
    faDemand.targetSalary * 0.95,  // FA 시장가치 기준
    tieredFloor,                    // OVR 티어 하한
    salaryAnchor,                   // 직전 연봉 앵커 ← 신규
)
```

**NEUTRAL_MARKET**: FA 개막 전이므로 시장 수급 미반영, 모든 롤 ratio=1.0 중립값 사용.

**OVR 티어 하한** (`getTierFloor`): 동적 z-score 기반 (`getOVRThreshold('STARTER'|'ROLE'|...)`).
기본 분포(mean=75, std=7) 기준 대략적 임계값:

| 티어 | z-score | display OVR (대략) | floor |
|------|---------|-------------------|-------|
| SUPERSTAR | 1.8 | ~89 | $30M |
| STAR | 1.1 | ~83 | $20M |
| STARTER | 0.35 | ~77 | $9M |
| ROLE | -0.25 | ~73 | $4M |
| FRINGE | — | 미만 | $1.1M |

> **설계 의도**: 세 후보 중 최댓값을 취하므로, 당해 스탯이 부재하거나 부상으로 FA 가치가
> 붕괴된 경우에도 직전 연봉 앵커가 BATNA를 현실적인 수준으로 유지한다.

### `buildExtensionDemand(player, personality, batnaAAV, ...): ExtensionDemand`

```
faDemand = calcFADemand(player, allPlayers, NEUTRAL_MARKET, ...)

// 안정성 할인: riskAversion 높을수록 FA보다 낮게 요구
// financialAmbition 높으면 할인 폭 절반
securityDiscount = 1.0 - riskAversion * 0.12 * (1 - financialAmbition * 0.5)
                   // 최대 12% 할인

targetAAV = max(tieredFloor, faDemand.targetSalary * securityDiscount)

// Reservation Floor: loyalty + winDesire 완화
//   loyalty   높음 → 원소속팀에 최대 8% 완화
//   winDesire 높음 + 강팀 → 최대 6% 추가 완화
//   합산 최대 12% 완화, 하드 가드: BATNA * 0.82
loyaltyRelief   = loyalty * 0.08
winDesireRelief = isContender ? winDesire * 0.06 : 0
totalRelief     = min(loyaltyRelief + winDesireRelief, 0.12)

reservationFloor = max(
    batnaAAV * (1.0 - totalRelief),
    batnaAAV * 0.82,     // 하드 가드
    tieredFloor
)

// Opening Ask: FA 요구보다 약간 낮게 (익스텐션 할인), 샐러리캡 35% 상한
openingAsk = min(
    SALARY_CAP * 0.35,
    max(reservationFloor * 1.06, faDemand.askingSalary * 0.92)
)

insultThreshold = reservationFloor * (0.94 - pride * 0.08)  // 0.86~0.94
askingYears     = max(1, faDemand.askingYears - 1)
```

### `calcUnderpaymentBoost(player, faDemand, personality): number` *(내부 헬퍼)*

선수가 자신이 저평가됐음을 인식할 때 `openingAsk`에 더하는 상향 부스트. 두 단계로 분리된다.

```
// Step 1: 저평가 감지 (객관적)
underpaymentRatio = faDemand.targetSalary / player.salary
if underpaymentRatio < 1.20 → return 0   // 20% 미만 저평가 = 무반응

underpaymentScale = min(1.0, (underpaymentRatio - 1.20) / 0.80)
                                          // 1.2배=0, 2.0배=1.0

// Step 2: 지각된 시장가치 (주관적) — 성격으로 과대 인식
perceivedValue = targetSalary × (1 + pride × 0.15 + financialAmbition × 0.10)
boostFactor    = financialAmbition × 0.6 + pride × 0.4

perceivedGap = max(0, perceivedValue - prevSalary)
rawBoost     = perceivedGap × boostFactor × underpaymentScale
return min(rawBoost, targetSalary × 0.30)  // 상한: targetSalary의 30%
```

**성격 조합 예시** (prevSalary=$5M, targetSalary=$20M 기준):

| pride | financialAmbition | underpaymentScale | boost |
|:---:|:---:|:---:|:---:|
| 1.0 | 1.0 | 1.0 | $6.0M (30% 상한) |
| 0.5 | 0.8 | 1.0 | ~$4.8M |
| 0.2 | 0.3 | 1.0 | ~$1.2M |
| any | any | 0.025 (1.22배) | < $0.1M (미미) |

**설계 의도**: `targetAAV`·`reservationFloor`는 객관적 시장가치 그대로 유지하고,
초기 앵커(`openingAsk`)만 올려서 "나는 저평가됐다"는 협상 태도를 표현한다.
과지급 선수(underpaymentRatio < 1.20)는 이 메커니즘이 전혀 작동하지 않는다.

> **내부 최적화**: `initNegotiationState`는 `calcFADemand`를 1회만 호출하고 결과를
> 내부 헬퍼 `_buildDemandFromFA`에 전달. (allPlayers 450명 × 12회 정렬 연산 중복 방지)

### `calcOfferUtility(offer, state): number`

```
// 모욕선 이하 → 강제 차단
if annualSalary < insultThreshold: return -1

moneyScore     = clamp(annualSalary / targetAAV, 0, 1.5)
guaranteeScore = clamp((annualSalary * years) / (targetAAV * askingYears), 0, 1.5)

// loyalty: 원소속팀 잔류 보너스 (항상 원소속팀이므로 조건 없음)
loyaltyBonus   = loyalty * 0.30
// winDesire: 강팀 선호 보너스
winDesireBonus = winDesire * contenderScore * 0.25
teamScore      = clamp(loyaltyBonus + winDesireBonus, 0, 0.80)

emotionScore   = clamp(respect * 0.5 + trust * 0.5 - frustration, 0, 1)

yearsDiff  = |offer.years - askingYears|
yearsScore = clamp(1.0 - yearsDiff * 0.2)

utility =
    0.48 * moneyScore
  + 0.14 * guaranteeScore
  + 0.14 * teamScore
  + 0.14 * emotionScore
  + 0.10 * yearsScore
```

### `evaluateExtensionOffer(offer, state, tendencySeed): { response, updatedState }`

**평가 순서**:
1. `annualSalary < insultThreshold` → `REJECT_HARD` + 감정 악화 + `lowballCount++`
2. `lowballCount >= 3` → `WALKED_AWAY` (협상 종료)
3. `|annualSalary - lastOfferAAV| < 500_000` → 동일 금액 패널티, 수락 불가
4. `utility >= (0.90 - frustration * 0.10)` → `ACCEPT`
5. 나머지 → `COUNTER` 생성

**감정 변화 규칙**:
```
annualSalary < insultThreshold  → respect -= 0.25, frustration += 0.30, lowballCount++
annualSalary < reservationFloor → respect -= 0.10, frustration += 0.15, lowballCount++
annualSalary >= targetAAV       → respect += 0.10, trust += 0.05, frustration -= 0.05
동일 금액 재제시               → frustration += 0.10
```

### `generateCounterOffer(state): { counterAAV, counterYears }`

```
// 점진적 양보: 재정야망 높을수록, 짜증 쌓일수록 양보 폭 감소
concessionStep = (currentCounterAAV - reservationFloor)
               * (0.20 - financialAmbition * 0.12)
               * (1.0 - frustration * 0.50)

newCounterAAV = max(reservationFloor, currentCounterAAV - concessionStep)
counterYears  = demand.askingYears  // 연수는 협상 불가
```

### `buildExtensionContract(annualSalary, years): PlayerContract`

```typescript
{
    years: Array.from({ length: years }, (_, i) =>
        Math.round(annualSalary * Math.pow(1.05, i))  // 연 5% 인상
    ),
    currentYear: 0,
    type: 'extension',
}
```

---

## UI 구조 (`views/FAView.tsx`)

### 탭
```typescript
'market' | 'roster' | 'extensions'
```
extensions 탭 헤더에 후보 수 뱃지 (violet).

### ExtensionPanel 레이아웃

```
[후보 선수 목록]                  [협상 패널 — w-80]
- OVR, 포지션, 나이, 연봉, 잔여   - 선수 이름 / CONTRACT EXT. 뱃지
                                  - 감정 상태 바 (Respect / Trust / Frustration)
                                  - 저가 경고 배너 (lowballCount >= 1)
                                  - 선수 요구 조건 (counterAAV / counterYears / roundsUsed)
                                  - 연봉 슬라이더 (insultThreshold*0.9 ~ openingAsk*1.3)
                                    색상: targetAAV 이상→green, insultThreshold 미만→red
                                  - 연수 버튼 (1 / 2 / 3 / 4년)
                                  - 응답 배너 (ACCEPT ✅ / COUNTER 💬 / REJECT ❌ / WALKED 🚪)
                                  - [오퍼 제출] 버튼
```

### 협상 상태 관리

```typescript
// key={player.id}로 선수 변경 시 컴포넌트 리마운트 → 상태 자동 리셋
// lazy initializer로 useEffect 없이 초기화
const [negState, setNegState] = useState<NegotiationState>(() =>
    initNegotiationState(player, myTeam, allPlayers, tendencySeed, ...)
);
```

---

## 악용 방지 가드레일

| 가드 | 구현 방식 |
|------|---------|
| 하드 최소선 | `reservationFloor >= max(BATNA * 0.82, tieredFloor)` |
| 모욕선 강제 거절 | `annualSalary < insultThreshold` → 즉시 REJECT_HARD |
| 반복 저가 패널티 | `lowballCount >= 3` → WALKED_AWAY (해당 오프시즌 재협상 불가) |
| 같은 금액 재제시 | frustration +0.10 누적 + 수락 불가 |
| 티어 하한 | z-score 기반 동적 (기본 분포 기준 STARTER≈OVR 77 → $9M, ROLE≈OVR 73 → $4M) |
| 직전 연봉 앵커 | `salaryAnchor = prevSalary * anchorRatio * availDiscount` → BATNA 하한 |
| 앵커 비율 범위 | 0.70~0.92 (riskAversion·loyalty·financialAmbition 연동, clamp 강제) |
| 가용성 할인 범위 | 0.82~1.00 (결장·부상 기록 기반, 최대 -18% 할인) |
| 할인 합산 상한 | loyalty+winDesire 완화 합계 최대 12% (`min()` 강제) |
| 안정성 할인 상한 | securityDiscount 최대 12% (`riskAversion * 0.12`) |

---

## 검증 포인트

| 시나리오 | 기대 결과 |
|---------|-----------|
| OVR 85, FA 요구 $22M → $10M 제안 | REJECT_HARD (모욕선 이하) |
| $17M 제안 (Floor 위, Target 아래) | COUNTER 생성 |
| $22M 제안 (Target 이상) | 높은 확률 수락 |
| 3회 연속 모욕선 이하 | WALKED_AWAY |
| loyalty=0.9, isContender=true | Floor = BATNA * ~0.88 (8% + 6% → 최대 12%) |
| loyalty=0.9, isContender=false | Floor = BATNA * ~0.92 (8%만 적용) |
| winDesire=0.8, isContender=true | winDesireBonus = 0.8 * contenderScore * 0.25 상승 |
| winDesire=0.8, isContender=false | contenderScore≈0 → 보너스 없음 |
| financialAmbition=1.0 | securityDiscount 최소화, 카운터 양보 폭 최소 |
| pride=1.0 (ego 최대) | insultThreshold = reservationFloor * 0.86 (상한) |
| 수락 후 forceSave | 리로드 시 contract.type='extension' 확인 |
| contractYears=3 선수 | extensions 후보 목록 미표시 |
| 선수 옵션 보유자 | extensions 후보 목록 미표시 |
| 직전 연봉 $30M, 부상으로 stats 없음 | salaryAnchor가 BATNA 지배 → BATNA ≈ $21~27M |
| 직전 연봉 $30M, 20경기 출전 + Season-Ending | availDiscount ≈ 0.82 → 앵커 약 18% 추가 할인 |
| loyalty=0.9, financialAmbition=0.1 | anchorRatio = 0.70 (하한) → 팀에 양보 |
| riskAversion=1.0, financialAmbition=1.0 | anchorRatio = 0.92 (상한) → 강경 협상 |
| prevSalary=$5M, targetSalary=$20M, pride=1.0, amb=1.0 | underpaymentBoost = $6M (30% 상한) → openingAsk 대폭 상향 |
| prevSalary=$5M, targetSalary=$20M, pride=0.2, amb=0.3 | underpaymentBoost ≈ $1.2M → 소폭 상향 |
| prevSalary=$22M, targetSalary=$25M (1.14배) | underpaymentRatio < 1.20 → boost = 0 (무반응) |
| prevSalary=$30M, targetSalary=$4M (과지급) | underpaymentRatio < 1.20 → boost = 0 (무반응) |
