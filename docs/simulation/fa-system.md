# FA 시스템 문서

> NBA-GM-SIM의 자유계약(Free Agency) 시스템 전체 아키텍처.
> 설계 → 구현 완료 상태 기록. 2025-26 실제 CBA 기반.

---

## 1. 전체 파이프라인

```
[오프시즌 moratoriumStart 도달]
        │
        ▼
offseasonEventHandler.handleMoratoriumStart()
        │  ① processOffseason() — 에이징/은퇴/계약만료
        │  ② expiredPlayerObjects 수집 (로스터 필터링 전)
        │  ③ 은퇴 선수 + 만료 선수 로스터에서 제거
        │  ④ offseasonPhase: 'FA_OPEN' 반환
        ▼
useSimulation (moratoriumStart 결과 처리)
        │  ⑤ openFAMarket() 호출 → LeagueFAMarket 생성
        │  ⑥ setLeagueFAMarket() + forceSave()
        ▼
[FA_OPEN 단계 — 유저 FAMarket 뷰 진입 가능]
        │
        ├─ 유저: FAView.tsx → processUserOffer() → onOfferAccepted()
        │       → setTeams (로스터 추가) + setLeagueFAMarket + forceSave
        │
        └─ CPU 서명: simulateCPUSigning() — 미사용 (현재 수동 단계)
                  (향후 FA 시장 마감 시 자동 실행 예정)
        ▼
[PRE_SEASON / openingNight — FA 시장 자동 종료]
```

---

## 2. 파일 구조

| 파일 | 역할 |
|------|------|
| `types/fa.ts` | FA 시스템 전용 타입 정의 |
| `services/fa/faValuation.ts` | 연봉 산정 엔진 (MarketValueScore → askingSalary) |
| `services/fa/faMarketBuilder.ts` | 시장 개설, CPU 서명 시뮬, 유저 오퍼 처리 |
| `views/FAView.tsx` | FA 시장 UI (선수 목록 + 협상 패널) |
| `hooks/useGameData.ts` | `leagueFAMarket`, `faPlayerMap` 상태 관리 |
| `services/persistence.ts` | `league_fa_market` 컬럼 저장/복원 |
| `services/simulation/offseasonEventHandler.ts` | moratoriumStart 시 만료 선수 수집 + FA_OPEN 전환 |
| `hooks/useSimulation.ts` | openFAMarket 호출 + setLeagueFAMarket |

---

## 3. 타입 (`types/fa.ts`)

```ts
// FA 시장에서의 선수 역할 (7종)
export type FARole =
    | 'lead_guard' | 'combo_guard' | '3and_d' | 'shot_creator'
    | 'stretch_big' | 'rim_big' | 'floor_big';

// 계약 슬롯 종류 (7종)
export type SigningType =
    | 'cap_space'    // 팀 페이롤 < 캡
    | 'non_tax_mle'  // $14.104M, 1차 에이프런 미만
    | 'tax_mle'      // $5.685M, 1~2차 에이프런 사이
    | 'bird_full'    // Full Bird Rights (teamTenure ≥ 3)
    | 'bird_early'   // Early Bird Rights (teamTenure = 2)
    | 'bird_non'     // Non-Bird Rights (teamTenure = 1)
    | 'vet_min';     // 베테랑 미니멈 (항상 가능)

// 시장 수급 지표 (롤별)
export interface MarketCondition {
    roleSupply: number;   // FA 후보 중 해당 롤 선수 수
    roleDemand: number;   // 해당 롤이 부족한 팀 수
    ratio: number;        // demand / supply
}

// 선수 FA 요구 조건 산정 결과
export interface FADemandResult {
    askingSalary: number;     // 협상 시작가 (openingAsk)
    walkAwaySalary: number;   // 이 이하면 무조건 거절
    targetSalary: number;     // 내부 목표가
    askingYears: number;
    marketValueScore: number;
    faRole: FARole;
}

// FA 시장 엔트리 (선수 1명)
export interface FAMarketEntry {
    playerId: string;
    askingYears: number;
    askingSalary: number;
    walkAwaySalary: number;
    marketValueScore: number;
    faRole: FARole;
    interestedTeamIds: string[];   // 관심 팀 (최대 6팀)
    userOffer?: FAUserOffer;
    status: 'available' | 'signed' | 'withdrawn';
    signedTeamId?: string;
    signedYears?: number;
    signedSalary?: number;
}

// FA 시장 전체
export interface LeagueFAMarket {
    openDate: string;
    closeDate: string;
    entries: FAMarketEntry[];
    usedMLE: Record<string, boolean>;  // teamId → MLE 사용 여부
    players?: Player[];                // FA 후보 전체 Player 객체 (faPlayerMap 구성용, 영속)
}
```

> **`players` 필드 설계 이유:**
> 만료 선수는 오프시즌 처리 시 team.roster에서 제거된다.
> 이후 FAView에서 선수 정보(이름, OVR, 포지션 등)를 표시하려면
> 전체 Player 객체가 필요하므로 LeagueFAMarket에 직접 포함해 영속화한다.
> `faPlayerMap = Object.fromEntries(players.map(p => [p.id, p]))` 형태로 변환해 사용.

---

## 4. 샐러리캡 상수 (`utils/constants.ts`)

```ts
// 2025-26 실제 금액
export const LEAGUE_FINANCIALS = {
    SALARY_FLOOR:   139_182_000,
    SALARY_CAP:     154_647_000,
    TAX_LEVEL:      187_895_000,
    FIRST_APRON:    195_945_000,
    SECOND_APRON:   207_824_000,
};

export const SIGNING_EXCEPTIONS = {
    NON_TAX_MLE:  14_104_000,   // Non-Taxpayer MLE (최대 4년)
    TAXPAYER_MLE:  5_685_000,   // Taxpayer MLE (최대 2년)
};
```

---

## 5. 계약 슬롯 상세

| 슬롯 | 조건 | 연봉 상한 | 최대 연수 |
|------|------|-----------|---------|
| `cap_space` | 팀 페이롤 < CAP | 잔여 캡 (maxAllowed 이내) | 5년 |
| `non_tax_mle` | payroll < FIRST_APRON, MLE 미사용 | $14.104M | 4년 |
| `tax_mle` | FIRST_APRON ≤ payroll < SECOND_APRON, MLE 미사용 | $5.685M | 2년 |
| `bird_full` | 자팀 FA, teamTenure ≥ 3 | maxAllowed (캡 초과 가능) | 5년 |
| `bird_early` | 자팀 FA, teamTenure = 2 | max(직전연봉×1.75, CAP×1.05) | 4년 |
| `bird_non` | 자팀 FA, teamTenure = 1 | 직전연봉×1.20 | 4년 |
| `vet_min` | 항상 | 경력별 최저연봉 | 2년 |

**개인 맥스 실링 (YOS별):**
```
YOS 0~6: CAP × 25% = $38.7M
YOS 7~9: CAP × 30% = $46.4M
YOS 10+: CAP × 35% = $54.1M
```

**베테랑 미니멈 (YOS별):**
```
YOS 0~3: $1.5M / YOS 4~6: $2.2M / YOS 7+: $3.0M
```

---

## 6. Bird Rights 시스템

```ts
// player.teamTenure: 같은 팀에서 보낸 시즌 수
// 오프시즌 playerAging.ts에서 갱신
function getBirdRightsLevel(teamTenure: number): 'full' | 'early' | 'non' | 'none' {
    if (teamTenure >= 3) return 'full';
    if (teamTenure === 2) return 'early';
    if (teamTenure === 1) return 'non';
    return 'none';
}
```

**teamTenure 갱신 규칙 (`playerAging.ts`):**
- 계약 계속 유지(재계약/Bird Rights): `teamTenure += 1`
- FA 이적 / 신규 서명: `teamTenure = 0` (onOfferAccepted에서 적용)
- 은퇴: 무관

---

## 7. FA 연봉 산정 엔진 (`services/fa/faValuation.ts`)

### 전체 공식

```
MarketValueScore = (RoleScore × Reliability) + AwardBonus + AgeBonus
                   + ScarcityBonus + DemandBonus - InjuryPenalty
targetSalary = CAP × scoreToCapShare(marketValueScore)
```

### Step 1: FARole 결정 (`determineFARole()`)

아키타입 기반 (우선) → 포지션+능력치 폴백:

```ts
// ARCHETYPE_TO_FA_ROLE 매핑 (types/archetype.ts)
'primary_creator_guard' → 'lead_guard'
'scoring_combo_guard'   → 'combo_guard'
'movement_shooter'      → '3and_d'
'perimeter_3nd'         → '3and_d'
'two_way_wing'          → '3and_d'
'slashing_wing'         → 'shot_creator'
'shot_creator_wing'     → 'shot_creator'
'connector_forward'     → 'floor_big'
'post_scoring_big'      → 'floor_big'
'rim_runner_big'        → 'rim_big'
'stretch_big'           → 'stretch_big'
'rim_protector_anchor'  → 'rim_big'
'playmaking_big'        → 'floor_big'
```

### Step 2: 롤 퍼포먼스 스코어 (`calcRoleScore()`)

- per-game 스탯 → 리그 동 롤 풀 백분위 정규화 → 롤 가중치 합산 → 0~100점
- 비교 풀 기준: `stats.g >= 10` 이상 출전자만 포함

**롤별 핵심 가중치 (합 1.0):**

| 롤 | 주요 스탯 가중치 |
|----|----------------|
| `lead_guard` | ast×0.24, pts×0.20, ts%×0.16, tov_inv×0.10, avail×0.10 |
| `combo_guard` | pts×0.25, ast×0.18, 3p%×0.14, ts%×0.14, avail×0.10 |
| `3and_d` | def×0.22, 3p%×0.18, ts%×0.14, 3pa×0.12, avail×0.12 |
| `shot_creator` | pts×0.28, ts%×0.16, ast×0.14, avail×0.10, stl×0.10 |
| `stretch_big` | 3p%×0.20, reb×0.18, ts%×0.16, def×0.14, avail×0.12 |
| `rim_big` | reb×0.20, blk×0.18, def×0.18, ts%×0.14, avail×0.12 |
| `floor_big` | reb×0.22, def×0.16, ast×0.14, ts%×0.14, avail×0.14 |

### Step 3: 신뢰도 (`calcReliability()`)

```ts
// 소표본 과대평가 방지. 72경기/2200분 → 1.0 / 18경기/400분 → ~0.48
return 0.35 + 0.65 * min(1, g/60) * min(1, mp/1800);
const adjustedPerfScore = roleScore * reliability;
```

### Step 4: 수상 보너스 (`calcAwardBonus()`) — 상한 +12

```ts
MVP: +10 / ALL_NBA_1: +8 / DPOY: +6 / FINALS_MVP: +5
ALL_NBA_2: +6 / ALL_NBA_3: +5 / ALL_DEF_1: +4 / ALL_DEF_2: +3
CHAMPION: +2 / REG_SEASON_CHAMPION: +1
```

### Step 5: 나이 보정 (`calcAgeBonus()`)

```
≤22세: +6 (고성능: +4) / 23~26세: +4 (고성능: +2) / 27~30세: +2 (고성능: +1)
31~33세: -4 (고성능: -2) / 34~35세: -7 (고성능: -3) / 36+세: -10 (고성능: -5)
※ adjustedPerf ≥ 75이면 고성능 — 나이 패널티 완화
```

### Step 6: 부상 패널티 (`calcInjuryPenalty()`) — 상한 -12

```
직전 시즌 Season-Ending: -8
Major 2건+: -5 / Major 1건: -2
반복 부상 패턴 (비Minor 3건+): -2 추가
30세 이상: 패널티 × 1.5
```

### Step 7: 시장 희소성/수요 (`buildMarketConditions()`)

```ts
interface MarketCondition {
    roleSupply: number;   // FA 후보 중 동 롤 선수 수
    roleDemand: number;   // 해당 롤 top-8 OVR이 리그 하위 25%인 팀 수
    ratio: number;        // demand / supply
}
```

**ratio → scarcityBonus:**
```
≥3.0: +6 / ≥2.0: +4 / ≥1.5: +2 / ≥1.0: 0 / ≥0.5: -2 / <0.5: -4
```
**demandBonus:** `min(5, floor(roleDemand / 3))`

**financialAmbition 민감도:** `ambitionScale = 0.7 + ambition × 0.6` (0.7~1.3)

### Step 8: Score → 목표 연봉

| Score | Cap % | 의미 |
|-------|-------|------|
| 90+ | 32.5% | 맥스급 |
| 82+ | 25.5% | 니어맥스 |
| 72+ | 18.5% | 상급 스타터 |
| 60+ | 12.5% | 스타터 |
| 48+ | 7.5% | 로테이션 |
| 35+ | 4.0% | 벤치 |
| 미만 | 1.5% | 최저계약 |

### Step 9: OpeningAsk / WalkAway

```ts
// seeded 결정론적 (tendencySeed + playerId + season 해시)
openingAsk = targetSalary × (1.03~1.17)   // financialAmbition 높을수록 높게
walkAway   = targetSalary × (0.80~0.99)   // financialAmbition 높을수록 기준선 높음
// 최종: clamp(vetMin, maxAllowed)
```

### Step 10: 오퍼 수락 판단 (`evaluateFAOffer()`)

```ts
if (offer.salary >= demand.askingSalary)   return true;    // 요구 이상 → 무조건 수락
if (offer.salary < demand.walkAwaySalary)  return false;   // 기준선 미달 → 무조건 거절
// walkAway ~ askingSalary 사이 → seed 기반 선형 확률
const acceptProb = (offer.salary - walkAwaySalary) / (askingSalary - walkAwaySalary);
```

---

## 8. FA 시장 개설 (`services/fa/faMarketBuilder.ts`)

### `openFAMarket()`

```ts
openFAMarket(
    expiredPlayers: Player[],   // 계약 만료 선수 전체 객체
    allPlayers: Player[],       // 30팀 전체 로스터 (수급 계산용)
    teams: Team[],
    openDate: string,
    closeDate: string,
    currentSeasonYear: number,
    currentSeason: string,
    tendencySeed: string,
): LeagueFAMarket
```

호출 흐름: `buildMarketConditions()` → `calcFADemand()` per player → entries 생성

**interestedTeamIds 선정 기준:**
- 해당 FA롤 최강 선수의 OVR < FA 선수 OVR인 팀
- MLE 또는 캡 스페이스가 있는 팀
- 최대 6팀

### `getAvailableSigningSlots()`

```ts
getAvailableSigningSlots(
    team: Team,
    player: Player,
    playerPrevTeamId: string | undefined,
    usedMLE: Record<string, boolean>,
): SigningType[]
```

슬롯 우선순위: cap_space → non_tax_mle / tax_mle → bird_full/early/non → vet_min

### `processUserOffer()`

```ts
processUserOffer(
    market: LeagueFAMarket,
    team: Team,
    player: Player,
    playerPrevTeamId: string | undefined,
    offer: { salary: number; years: number; signingType: SigningType },
    tendencySeed: string,
    currentSeasonYear: number,
): UserOfferResult
// { accepted: true; contract: PlayerContract; signingType: SigningType }
// | { accepted: false; reason: string }
```

검증 순서: ① 상태(available 여부) → ② 슬롯 유효성 → ③ 연봉 상한 → ④ 연수 → ⑤ evaluateFAOffer

### `simulateCPUSigning()`

CPU 팀별 FA 서명 시뮬레이션. 팀당 1라운드에 1명 서명 원칙.

```ts
simulateCPUSigning(
    market: LeagueFAMarket,
    teams: Team[],
    faPlayerMap: Record<string, Player>,
    userTeamId: string,
    tendencySeed: string,
    currentSeasonYear: number,
): CPUSigningResult   // { market, teams, signings }
```

CPU 서명 기준:
1. 팀별 FA 롤 커버리지 확인 (getRoleCoverage — 최강 OVR 기준)
2. 해당 롤 coverage < 75이면 서명 시도
3. walkAway × 1.05 오퍼 → evaluateFAOffer 통과 시 계약

---

## 9. 상태 관리 (`hooks/useGameData.ts`)

```ts
// 상태
const [leagueFAMarket, setLeagueFAMarket] = useState<LeagueFAMarket | null>(null);

// 파생값 (useMemo)
const faPlayerMap = useMemo<Record<string, Player>>(() => {
    if (!leagueFAMarket?.players) return {};
    return Object.fromEntries(leagueFAMarket.players.map(p => [p.id, p]));
}, [leagueFAMarket]);

// return에 포함
leagueFAMarket, setLeagueFAMarket,
faPlayerMap,
```

**복원:** 로드 시 `checkpoint.league_fa_market` → `setLeagueFAMarket()`
**저장:** `forceSave` 내 `savFAMarket = ov?.leagueFAMarket ?? gameStateRef.current.leagueFAMarket`

---

## 10. 오프시즌 연동 (`offseasonEventHandler.ts`)

`handleMoratoriumStart()`에서 로스터 필터링 **전** 만료 선수 전체 객체 수집:

```ts
// 계약 만료 선수 중 은퇴 제외한 FA 후보 수집 (로스터에서 제거되기 전)
const expiredPlayerObjects: Player[] = [];
for (const team of teams) {
    for (const player of team.roster) {
        if (removeIds.has(player.id) && !retiredIds.has(player.id)) {
            expiredPlayerObjects.push(player);
        }
    }
}
// team.roster 필터링 (선수 제거)
// updates에 expiredPlayerObjects 포함해 반환
```

`useSimulation.ts`에서 처리:
```ts
if (u.expiredPlayerObjects?.length > 0 && setLeagueFAMarket) {
    const newMarket = openFAMarket(u.expiredPlayerObjects, allPlayers, newTeams, ...);
    newMarket.players = u.expiredPlayerObjects;  // faPlayerMap용 영속화
    setLeagueFAMarket(newMarket);
    forceSave({ leagueFAMarket: newMarket });
}
```

---

## 11. FA 시장 UI (`views/FAView.tsx`)

### 레이아웃

```
┌─────────────────────────────────────────────────┐
│ 헤더 (캡 상태 바: 페이롤 / 잔여캡 / MLE 상태)       │
├──────────────┬──────────────────────────────────┤
│ 필터/정렬 바  │                                   │
├──────────────┤        협상 패널                   │
│ FA 선수 목록  │  (슬롯 선택 / 연봉 슬라이더 / 오퍼)  │
│ (역할 필터,   │                                   │
│  상태 필터,   │                                   │
│  정렬)        │                                   │
└──────────────┴──────────────────────────────────┘
```

### Props

```ts
interface FAViewProps {
    leagueFAMarket: LeagueFAMarket | null;
    faPlayerMap: Record<string, Player>;
    myTeam: Team;
    teams: Team[];
    tendencySeed: string;
    currentSeasonYear: number;
    currentSeason: string;
    onOfferAccepted: (
        playerId: string,
        contract: PlayerContract,
        signingType: SigningType,
        updatedMarket: LeagueFAMarket,
    ) => void;
    onViewPlayer?: (player: Player) => void;
}
```

### 협상 패널 UX

1. 선수 클릭 → 우측 협상 패널 열림
2. 슬롯 선택 (사용 불가 슬롯 비활성화 / Bird Rights 자팀 FA만 표시)
3. 연봉 슬라이더 (vetMin ~ slotCap 범위)
4. 연수 버튼 (1~maxYears)
5. 수락 확률 힌트 (walkAway~askingSalary 구간 표시)
6. 오퍼 제출 → 수락/거절 결과

### AppRouter 연동 (`onOfferAccepted`)

```ts
onOfferAccepted={(playerId, contract, signingType, updatedMarket) => {
    const faPlayer = gameData.faPlayerMap?.[playerId];
    const signedPlayer = { ...faPlayer, contract, salary, teamTenure: 0 };
    const newTeams = gameData.teams.map(t =>
        t.id === gameData.myTeamId ? { ...t, roster: [...t.roster, signedPlayer] } : t
    );
    gameData.setTeams(newTeams);
    const marketWithPlayers = { ...updatedMarket, players: gameData.leagueFAMarket?.players };
    gameData.setLeagueFAMarket(marketWithPlayers);
    gameData.forceSave({ teams: newTeams, leagueFAMarket: marketWithPlayers });
}}
```

---

## 12. 구현 상태 체크리스트

| 항목 | 파일 | 상태 |
|------|------|------|
| 샐러리캡 상수 (2025-26 실제값) | `utils/constants.ts` | ✅ 완료 |
| `SIGNING_EXCEPTIONS` 추가 | `utils/constants.ts` | ✅ 완료 |
| FA 시스템 타입 정의 | `types/fa.ts` | ✅ 완료 |
| `Player.teamTenure`, `draftYear` 추가 | `types/player.ts` | ✅ 완료 |
| `SaveTendencies.financialAmbition` | `utils/hiddenTendencies.ts` | ✅ 완료 |
| `teamTenure` 오프시즌 갱신 | `services/playerDevelopment/playerAging.ts` | ✅ 완료 |
| FA 연봉 산정 엔진 | `services/fa/faValuation.ts` | ✅ 완료 |
| FA 시장 빌더 (개설/CPU서명/유저오퍼) | `services/fa/faMarketBuilder.ts` | ✅ 완료 |
| 오프시즌 만료 선수 객체 수집 | `offseasonEventHandler.ts` | ✅ 완료 |
| `openFAMarket` 자동 호출 | `hooks/useSimulation.ts` | ✅ 완료 |
| `leagueFAMarket` 상태 + 복원 + 저장 | `hooks/useGameData.ts` | ✅ 완료 |
| `faPlayerMap` 파생값 | `hooks/useGameData.ts` | ✅ 완료 |
| FA 시장 뷰 (목록 + 협상 패널) | `views/FAView.tsx` | ✅ 완료 |
| `onOfferAccepted` 로스터/마켓 연동 | `components/AppRouter.tsx` | ✅ 완료 |
| DB 영속화 (`league_fa_market` 컬럼) | `services/persistence.ts` | ✅ 완료 |
| CPU 팀 FA 서명 자동 시뮬 | `faMarketBuilder.simulateCPUSigning` | ⏳ 구현됨, 미연동 |
| FA 시장 마감 시 미서명 선수 처리 | — | ❌ 미구현 |
| 사이드바 FA 알림 배지 | `components/Sidebar.tsx` | ❌ 미구현 |

---

## 13. 미구현 / 제외 항목

| 항목 | 사유 |
|------|------|
| Room Exception ($8.781M) | 복잡도 대비 가치 낮음 |
| Bi-Annual Exception ($5.134M) | 동일 |
| 슈퍼맥스 | YOS + 수상 조건 복잡 |
| 데릭 로즈 룰 | 복잡도 대비 가치 낮음 |
| 루키 스케일 고정액 | 루키 드래프트에서 별도 처리 |
| 보장/비보장 계약 | 현재 전액 보장 계약만. `guaranteedSalary` 필드 추후 추가 예정 |

---

## 14. 향후 작업 예정

1. **CPU 팀 FA 서명 자동 시뮬**: FA 시장 마감일에 `simulateCPUSigning()` 호출 → 미서명 선수 자동 처리
2. **FA 시장 마감**: `openingNight` 도달 시 `leagueFAMarket` 정리 + 미서명 선수 `generatedFreeAgents` 이동
3. **사이드바 알림**: `offseasonPhase === 'FA_OPEN'` 시 사이드바 FA 링크에 배지 표시
4. **직접 서명 이력**: `Transactions`에 FA 서명 기록 추가
