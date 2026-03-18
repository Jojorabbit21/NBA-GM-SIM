# 계약 익스텐션 협상 엔진 설계

## 개요

단순 `salary >= askingSalary → 수락` 구조는 유저가 가격 흥정으로 뚫을 수 있음.
**"선수도 시장가치와 대체 선택지(BATNA)를 알고 있다"** 는 구조로 구현해야
염가 계약 악용을 막고 현실적인 협상이 가능함.

**익스텐션 창**: POST_DRAFT 페이즈 (루키드래프트 완료 ~ moratoriumStart 사이)
**대상 선수**: 계약 1~2년 남은 자기 팀 선수 (선수옵션 보유 제외)

---

## 핵심 철학

```
협상 = 선수의 시장가치(BATNA)와 최소 수용선(Reservation Floor) 안에서
       유저가 얼마나 좋은 합의를 찾느냐
```

선수가 오퍼를 평가할 때 판단하는 것:
1. 나는 이 정도 가치의 선수다 (시장가치)
2. 다른 팀에서도 대충 이 정도는 받을 수 있다 (BATNA)
3. 이 팀에 남을 이유가 있는가 (충성심/우승가능성)
4. 이 제안은 나를 존중하는가 (감정 상태)
5. 내 성격상 돈/우승/충성/자존심 중 무엇이 더 중요한가 (성격)

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `services/fa/extensionEngine.ts` | **신규** — 협상 엔진 전체 |
| `views/FAView.tsx` | `'extensions'` 탭 + ExtensionPanel 컴포넌트 |
| `components/AppRouter.tsx` | `onExtensionOffer` 핸들러 + FAView props 확장 |
| `types/message.ts` | `EXTENSION_SIGNED` 메시지 타입 추가 |

---

## 핵심 타입

### ExtensionPersonality (6개 성격 지표)

`generateSaveTendencies(tendencySeed, playerId)` + 파생값으로 계산:

```typescript
interface ExtensionPersonality {
    pride: number;           // 0~1  ← (ego + 1) / 2
    financialAmbition: number; // 0~1 ← SaveTendencies.financialAmbition
    loyalty: number;         // 0~1  ← teamTenure 기반 (0년=0.1, 5년+=0.9)
    ringPriority: number;    // 0~1  ← awards + isContender 기반
    patience: number;        // 0~1  ← 1 - (temperament + 1) / 2
    riskAversion: number;    // 0~1  ← 나이 기반 (25세=0.3, 35세=0.8)
}
```

### ExtensionDemand (협상 핵심 5값)

```
Opening Ask > Target AAV >= BATNA >= Reservation Floor > Insult Threshold
```

```typescript
interface ExtensionDemand {
    openingAsk: number;       // 처음 요구 금액 (앵커 역할)
    targetAAV: number;        // 실제 원하는 적정 AAV
    reservationFloor: number; // 최소 수용선 (BATNA * 0.85 이상)
    insultThreshold: number;  // 이 아래 → 감정 악화 (Floor * 0.86~0.94)
    batnaAAV: number;         // 대체 시장 기대치
    askingYears: number;      // 요구 연수 (FA보다 1년 짧음)
}
```

### NegotiationState (라운드 간 누적, React state로 관리)

```typescript
interface NegotiationState {
    demand: ExtensionDemand;
    personality: ExtensionPersonality;
    // 감정 (0~1)
    respect: number;       // 초기 0.70
    trust: number;         // 초기 0.60 (원소속팀 +0.15)
    frustration: number;   // 초기 0.00
    // 이력
    roundsUsed: number;
    lowballCount: number;       // 모욕선 이하 제안 누적 횟수
    lastOfferAAV: number;
    currentCounterAAV: number;
    // 상태
    hardline: boolean;
    walkedAway: boolean;
    signed: boolean;
}
```

### OfferContext (유저 제출 오퍼)

```typescript
interface OfferContext {
    years: number;
    annualSalary: number;      // AAV
    contenderScore: number;    // 0~1 (analyzeTeamSituation().isContender 기반)
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

### `getExtensionCandidates(myTeam, tendencySeed): Player[]`

필터:
- `player.contractYears <= 2`
- `player.contract?.option?.type !== 'player'`
- `player.health !== 'Injured'` (Season-Ending 제외)

### `buildExtensionPersonality(player, myTeam, tendencySeed): ExtensionPersonality`

```
saveTendencies = generateSaveTendencies(tendencySeed, player.id)

pride              = (saveTendencies.ego + 1) / 2
financialAmbition  = saveTendencies.financialAmbition
loyalty            = clamp(player.teamTenure / 5, 0.10, 0.90)
ringPriority       = player.awards?.length > 0 ? 0.70 :
                     isContender ? 0.55 : 0.35
patience           = 1.0 - (saveTendencies.temperament + 1) / 2
riskAversion       = normalize(player.age, 24, 36)    // 나이 기반
```

### `calcExtensionBATNA(player, allPlayers, tendencySeed, ...): number`

```
faDemand = calcFADemand(player, allPlayers, ...)

// 티어별 하한 (염가 계약 버그 방지)
TIER_FLOOR = {
    max:      30_000_000,
    star:     20_000_000,
    starter:   9_000_000,
    rotation:  4_000_000,
    minimum:   1_100_000,
}
tieredFloor = getTierFloor(player.ovr, faRole)

batna = max(faDemand.targetSalary * 0.95, tieredFloor)
```

### `buildExtensionDemand(player, personality, batnaAAV, ...): ExtensionDemand`

```
faDemand = calcFADemand(player, allPlayers, ...)

// 안정성 할인 (선수 입장에서 FA보다 낮게 요구)
securityDiscount  = 1.0 - (personality.riskAversion * 0.12)   // 0.88~1.0

targetAAV         = faDemand.targetSalary * securityDiscount
reservationFloor  = max(
    batnaAAV * (0.85 + personality.loyalty * 0.05),   // 최대 0.90까지 완화
    tieredFloor
)
openingAsk        = max(faDemand.askingSalary * 0.92, targetAAV * 1.06)
insultThreshold   = reservationFloor * (0.94 - personality.pride * 0.08)
                    // 자존심 높을수록 상승: 0.86~0.94
askingYears       = max(1, faDemand.askingYears - 1)
```

**할인 상한 보장**: 충성 완화 최대 5%, 보안 할인 최대 12% (합쳐도 절대 BATNA * 0.80 이하 불가)

### `calcOfferUtility(offer, state): number`

```
// 모욕선 이하 → 강제 차단
if offer.annualSalary < state.demand.insultThreshold:
    return -1

moneyScore     = clamp(offer.annualSalary / state.demand.targetAAV, 0, 1.5)
guaranteeScore = clamp(totalGuarantee / preferredGuarantee, 0, 1.5)
teamScore      = offer.contenderScore * personality.ringPriority
               + (isCurrentTeam ? personality.loyalty * 0.30 : 0)
emotionScore   = (state.respect * 0.5 + state.trust * 0.5 - state.frustration)

utility =
    0.48 * moneyScore
  + 0.14 * guaranteeScore
  + 0.14 * teamScore
  + 0.14 * emotionScore
  + 0.10 * yearsScore   // 요구 연수와의 적합도
```

### `evaluateExtensionOffer(offer, state, seed): { response, updatedState }`

**평가 순서**:
1. `salary < insultThreshold` → `REJECT_HARD` + `respect -= 0.25`, `frustration += 0.30`
2. `lowballCount >= 3` → `WALKED_AWAY`
3. `|offer.AAV - lastOfferAAV| < 500_000` → 같은 금액 재제시 패널티, 수락 불가
4. `utility >= (0.90 - frustration * 0.10)` → `ACCEPT`
5. 나머지 → `COUNTER` 생성

**감정 변화 규칙**:
```
salary < insultThreshold    → respect -= 0.25, frustration += 0.30
salary < reservationFloor   → respect -= 0.10, frustration += 0.15
salary >= targetAAV         → respect += 0.10, trust += 0.05, frustration -= 0.05
```

### `generateCounterOffer(offer, state): { counterAAV, counterYears }`

```
// 라운드에 따라 점진적 양보, 짜증날수록 양보 감소
concessionStep = (currentCounterAAV - reservationFloor)
                 * (0.20 - financialAmbition * 0.12)
                 * (1.0 - frustration * 0.50)

newCounterAAV = max(
    reservationFloor,
    currentCounterAAV - concessionStep
)
```

### `buildExtensionContract(salary, years): PlayerContract`

```typescript
{
    years: Array.from({ length: years }, (_, i) =>
        Math.round(salary * Math.pow(1.05, i))  // 연 5% 인상
    ),
    currentYear: 0,
    type: 'extension',
}
```

---

## UI 구조 (`views/FAView.tsx`)

### 탭 추가
```typescript
'market' | 'roster' | 'extensions'
```
extensions 탭 헤더에 후보 수 뱃지.

### ExtensionPanel 레이아웃

```
[후보 선수 목록]           [협상 패널]
- OVR, 나이, 계약잔여     - 선수 요구: $X.XM / Y년
- 현재 연봉              - Respect: ████░ Frustration: ██░░░
                         - 연봉 슬라이더 (insultThreshold ~ openingAsk * 1.2)
                         - 연수 버튼 (1~4년)
                         - [제출] 버튼
                         - 응답 배너 (ACCEPT ✅ / COUNTER 💬 / REJECT ❌ / WALKED 🚪)
                         - 경고: lowballCount >= 1 시 표시
```

### 협상 상태 관리
```typescript
// 선수 선택 시 initNegotiationState() 호출
// 선수 변경 시 상태 리셋
const [negState, setNegState] = useState<NegotiationState | null>(null);
```

---

## `AppRouter.tsx` `onExtensionOffer` 핸들러

```typescript
const handleExtensionOffer = (playerId: string, contract: PlayerContract) => {
    // 1. 해당 선수 contract 업데이트
    const updatedTeams = gameData.teams.map(t => ({
        ...t,
        roster: t.id === myTeam!.id
            ? t.roster.map(p => p.id === playerId
                ? { ...p, contract, salary: contract.years[0], contractYears: contract.years.length }
                : p)
            : t.roster,
    }));
    setTeams(updatedTeams);
    forceSave({ teams: updatedTeams });
    // 2. EXTENSION_SIGNED 인박스 발송
};
```

---

## 악용 방지 가드레일

| 가드 | 구현 방식 |
|------|---------|
| 하드 최소선 | `reservationFloor >= BATNA * 0.85 >= tieredFloor` — 코드에서 `max()` 보장 |
| 모욕선 강제 거절 | `salary < insultThreshold` → 즉시 REJECT_HARD |
| 반복 저가 패널티 | `lowballCount >= 3` → WALKED_AWAY (해당 오프시즌 재협상 불가) |
| 같은 금액 재제시 | `frustration` 누적 + 수락 불가 |
| 티어 하한 | star $20M / starter $9M / rotation $4M |
| 할인 상한 | 충성 완화 최대 5%, 보안 할인 최대 12% |

---

## Import 목록 (`extensionEngine.ts`)

```typescript
import type { Player, PlayerContract } from '../../types/player';
import type { Team } from '../../types/team';
import { calcFADemand } from './faValuation';
import { determineFARole } from './faValuation';
import { generateSaveTendencies } from '../../utils/hiddenTendencies';
import { analyzeTeamSituation } from '../tradeEngine/teamAnalysis';
```

**순환 임포트 체크**: `extensionEngine → faValuation → hiddenTendencies` (단방향, 안전)

---

## 검증 포인트

| 시나리오 | 기대 결과 |
|---------|-----------|
| OVR 85 스타터, FA 요구 $22M → $10M 제안 | REJECT_HARD (모욕선 이하) |
| $17M 제안 (Floor 위, Target 아래) | 카운터 생성 |
| $22M 제안 (Target 이상) | 높은 확률 수락 |
| 3회 연속 모욕선 이하 | WALKED_AWAY |
| teamTenure=5, loyalty=0.9 | Floor = BATNA * 0.90 |
| ego=0.9 (자존심 높음) | insultThreshold 상승 |
| 수락 후 forceSave | 리로드 시 contract.type='extension' 확인 |
| contractYears=3 선수 | extensions 후보 목록 미표시 |

---

## 구현 순서

1. `services/fa/extensionEngine.ts` — 타입 + 모든 함수
2. `views/FAView.tsx` — 탭 추가 + ExtensionPanel
3. `components/AppRouter.tsx` — 핸들러 연결
4. `types/message.ts` — EXTENSION_SIGNED 추가
