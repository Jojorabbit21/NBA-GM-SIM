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
[FA_OPEN 단계 — 유저 FAMarket 뷰 상시 접근 가능]
        │
        ├─ 유저 FA 서명: FAView → processUserOffer() → onOfferAccepted()
        │       → setTeams (로스터 추가) + setLeagueFAMarket
        │       → sendMessage(FA_SIGNING) → Inbox 서신
        │       → setTransactions('fa_signing') + forceSave
        │
        ├─ 유저 선수 방출: FAView(내 로스터 탭) → onReleasePlayer()
        │       → setTeams (로스터 제거 + deadMoney 추가)
        │       → releasePlayerToMarket() → setLeagueFAMarket
        │       → sendMessage(FA_RELEASE) → Inbox 서신
        │       → setTransactions('fa_release') + forceSave
        │
        └─ 날짜 진행 → rosterDeadline 도달
                  │  offseasonEventHandler: FA_OPEN → PRE_SEASON, faMarketClosed: true
                  ▼
             useSimulation (rosterDeadline 처리)
                  │  simulateCPUSigning(leagueFAMarket) → CPU 서명 완료
                  │  setTeams(CPU 서명 반영) + setLeagueFAMarket(null)
                  └─ sendMessage(FA_LEAGUE_NEWS) → Inbox 리그 소식
        ▼
[PRE_SEASON / openingNight — FA 시장 종료]
```

---

## 2. 파일 구조

| 파일 | 역할 |
|------|------|
| `types/fa.ts` | FA 시스템 전용 타입 정의 |
| `types/team.ts` | `DeadMoneyEntry`, `Team.deadMoney[]` |
| `types/finance.ts` | `SavedTeamFinances[teamId].deadMoney[]` |
| `types/message.ts` | `FA_SIGNING`, `FA_RELEASE`, `FA_LEAGUE_NEWS` 메시지 타입/콘텐츠 |
| `services/fa/faValuation.ts` | 연봉 산정 엔진 (MarketValueScore → askingSalary) |
| `services/fa/faMarketBuilder.ts` | 시장 개설, CPU 서명 시뮬, 유저 오퍼 처리, `releasePlayerToMarket()` |
| `views/FAView.tsx` | FA 시장 UI (FA 시장 탭 + 내 로스터 탭) + CapStatus(데드캡 표시) |
| `hooks/useGameData.ts` | `leagueFAMarket`, `faPlayerMap`, deadMoney 로드/저장 |
| `services/persistence.ts` | `league_fa_market` 컬럼, deadMoney → `team_finances` 저장 |
| `services/simulation/offseasonEventHandler.ts` | moratoriumStart(FA_OPEN) + rosterDeadline(PRE_SEASON, faMarketClosed) |
| `hooks/useSimulation.ts` | openFAMarket 호출 + rosterDeadline CPU 서명 트리거 |
| `components/AppRouter.tsx` | `onOfferAccepted`(FA_SIGNING) + `onReleasePlayer`(FA_RELEASE + deadMoney 계산) |
| `components/inbox/MessageContentRenderer.tsx` | FA_SIGNING/FA_RELEASE/FA_LEAGUE_NEWS 렌더러 |
| `components/Sidebar.tsx` | FA 시장 NavItem (상시 표시, FA_OPEN 시 NEW 배지) |

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
┌──────────────────────────────────────────────────────┐
│ CapStatus (페이롤 / 데드캡* / 잔여캡 / MLE / 캡 바)    │
├──────────────────────────────────────────────────────┤
│         [ FA 시장 ]  [ 내 로스터 ]  탭                  │
├──────────────┬───────────────────────────────────────┤
│ 필터/정렬 바  │                                        │
├──────────────┤        협상 패널 / 방출 모달             │
│ FA 선수 목록  │  (슬롯 선택 / 연봉 슬라이더 / 오퍼)       │
│  또는        │                                        │
│ 내 로스터    │                                        │
└──────────────┴───────────────────────────────────────┘
* 데드캡 > 0일 때만 표시 (빨간색)
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
    onReleasePlayer: (playerId: string) => void;
    onViewPlayer?: (player: Player) => void;
}
```

### FA 시장 탭 UX

1. 선수 클릭 → 우측 협상 패널 열림
2. 슬롯 선택 (사용 불가 슬롯 비활성화 / Bird Rights 자팀 FA만 표시)
3. 연봉 슬라이더 (vetMin ~ slotCap 범위)
4. 연수 버튼 (1~maxYears)
5. 수락 확률 힌트 (walkAway~askingSalary 구간 표시)
6. 오퍼 제출 → 수락/거절 결과

### 내 로스터 탭 UX

1. 자팀 로스터 전체 표시 (OVR 내림차순)
2. 선수별 행: 이름·포지션·OVR·연봉·잔여 계약연수
3. 방출 버튼 클릭 → 확인 모달
4. 확인 시 `onReleasePlayer(playerId)` 호출

### AppRouter 연동 (`onOfferAccepted`)

```ts
onOfferAccepted={(playerId, contract, signingType, updatedMarket) => {
    const faPlayer = gameData.faPlayerMap?.[playerId];
    const salary = contract.years[contract.currentYear];
    const signedPlayer = { ...faPlayer, contract, salary, teamTenure: 0 };
    const newTeams = gameData.teams.map(t =>
        t.id === gameData.myTeamId ? { ...t, roster: [...t.roster, signedPlayer] } : t
    );
    gameData.setTeams(newTeams);
    const marketWithPlayers = { ...updatedMarket, players: gameData.leagueFAMarket?.players };
    gameData.setLeagueFAMarket(marketWithPlayers);
    // FA_SIGNING 서신 발송
    sendMessage(userId, myTeamId, date, 'FA_SIGNING', `[FA 서명] ${faPlayer.name} 영입 완료`, signingContent);
    gameData.setTransactions(prev => [{ type: 'fa_signing', ... }, ...prev]);
    gameData.forceSave({ teams: newTeams, leagueFAMarket: marketWithPlayers });
}}
```

### AppRouter 연동 (`onReleasePlayer`)

```ts
onReleasePlayer={(playerId) => {
    const player = myTeam?.roster.find(p => p.id === playerId);
    if (!player) return;

    // 데드캡 계산: 현재 연차 포함 잔여 계약 전액
    const contract = player.contract;
    const deadAmount = contract
        ? contract.years.slice(contract.currentYear).reduce((s, v) => s + v, 0)
        : (player.salary ?? 0);
    const newDeadEntry: DeadMoneyEntry = { playerId, playerName: player.name, amount: deadAmount, season: currentSeason };

    // 로스터 제거 + deadMoney 추가
    const newTeams = gameData.teams.map(t =>
        t.id === gameData.myTeamId
            ? { ...t, roster: t.roster.filter(p => p.id !== playerId), deadMoney: [...(t.deadMoney ?? []), newDeadEntry] }
            : t
    );
    gameData.setTeams(newTeams);

    // FA 시장에 추가 (null 시장 자동 생성)
    const updatedMarket = releasePlayerToMarket(gameData.leagueFAMarket ?? null, player, ...);
    gameData.setLeagueFAMarket(updatedMarket);

    // FA_RELEASE 서신 발송
    sendMessage(userId, myTeamId, date, 'FA_RELEASE', `[방출] ${player.name} 방출 완료`, releaseContent);
    gameData.setTransactions(prev => [{ type: 'fa_release', ... }, ...prev]);
    gameData.forceSave({ teams: newTeams, leagueFAMarket: updatedMarket });
}}
```

---

## 12. 데드캡 (Dead Money) 시스템

방출된 선수의 잔여 보장 계약금이 샐러리캡에 산정되는 규칙.

### 방출 방식 3종

| 방식 | 데드캡 계산 | 선택 조건 | 특징 |
|------|------------|---------|------|
| **웨이브 (Waive)** | 잔여 계약 전액 | 항상 가능 | 즉시 처리, 단순 |
| **스트레치 웨이브 (Stretch)** | `total / (2n-1)` per year | 잔여 2년 이상 | 연당 캡 부담 감소, 오래 지속 |
| **바이아웃 (Buyout)** | 협상 금액 (최소값 이상) | 항상 가능 | 선수가 수락해야 성립 |

#### 스트레치 공식 (NBA 규정)

```ts
// n = 잔여 계약 연수
stretchYearsTotal = 2 * remainingYears - 1;
stretchAnnual = totalRemaining / stretchYearsTotal;
// 예: 잔여 3년 $90M → 5년 분산 → 연 $18M 데드캡
```

#### 바이아웃 최소 수락액

선수 성격(loyalty, financialAmbition), OVR, 모럴, 잔여 연수를 종합한 공식:

```ts
const minBuyoutPct = (() => {
    const loyalty           = tendencies.loyalty           ?? 0.5;
    const financialAmbition = tendencies.financialAmbition ?? 0.5;
    let pct = 73; // 기본값 (NBA 중앙값)
    pct += (financialAmbition - 0.5) * 20;  // ±10%  (재정 야망이 높을수록 더 많이 요구)
    pct += (loyalty - 0.5) * 14;             // ±7%   (충성심 높을수록 거절 경향)
    pct += (player.ovr - 75) / 25 * 5;       // ±5%   (스타일수록 협상력 있음)
    pct += (moraleScore - 50) / 50 * 6;      // ±6%   (불만족 선수일수록 수락 용이)
    if (remainingYears <= 1) pct = Math.max(pct, 80); // 올해 만료 선수 — 협상력 약함
    return Math.round(Math.min(90, Math.max(62, pct)));
})();
const minBuyoutAmount = totalRemaining * (minBuyoutPct / 100);
```

| 요소 | 범위 | 효과 |
|------|------|------|
| 재정 야망 (`financialAmbition`) | ±10% | 높을수록 더 많은 금액 요구 |
| 충성심 (`loyalty`) | ±7% | 높을수록 바이아웃 거절 경향 |
| OVR | ±5% | OVR 75 기준, 높을수록 요구액 상향 |
| 모럴 (`moraleScore`) | ±6% | 불만족할수록 조금 더 수락하기 쉬움 |
| 잔여 연수 = 1 | 최소 80% | 올해 만료 선수는 협상 여지 좁음 |
| **범위** | **62% ~ 90%** | 역사적 NBA 바이아웃 범위 |

유저는 슬라이더로 `minBuyoutAmount ~ totalRemaining` 범위에서 제시액을 설정한다.
최소 수락액 미만 제시 시 방출 확정 버튼 비활성화.

### 자료구조 (`types/team.ts`)

```ts
export type ReleaseType = 'waive' | 'buyout' | 'stretch';

export interface DeadMoneyEntry {
    playerId: string;
    playerName: string;
    amount: number;              // 이번 시즌 데드캡 (달러)
    season: string;              // 발생 시즌 라벨
    releaseType: ReleaseType;
    stretchYearsTotal?: number;     // 스트레치: 총 분산 연수 (= 2n-1)
    stretchYearsRemaining?: number; // 스트레치: 남은 분산 연수 (매 오프시즌 -1)
}
```

### 페이롤 합산 (`services/fa/faMarketBuilder.ts`)

```ts
export function calcTeamPayroll(team: Team): number {
    const rosterTotal = team.roster.reduce((sum, p) => sum + (p.salary ?? 0), 0);
    const deadTotal = (team.deadMoney ?? []).reduce((sum, d) => sum + d.amount, 0);
    return rosterTotal + deadTotal;
}
```

모든 캡 계산이 `calcTeamPayroll()`을 통하므로 방출 방식에 무관하게 데드캡이 자동 반영됨.

### 방출 모달 UX (`views/FAView.tsx`)

```
[선수 방출] LeBron James  SF · OVR 92
잔여 계약: $90.0M (3년 잔여)

● 웨이브            데드캡: $90.0M (전액)
○ 스트레치 웨이브    데드캡: $18.0M × 5년
○ 바이아웃           데드캡: $45.0M~ (협상)

[바이아웃 선택 시]:
  제시 금액: $54.0M  ✓ 수락 예상
  [─────────────●──────] ($45M ~ $90M)
  최소 50.0M (56%)    전액 $90.0M

이번 시즌 데드캡: $18.0M
[취소]  [방출 확정]
```

### 영속화 경로

별도 DB 컬럼 없이 기존 `team_finances` JSONB에 포함:

```ts
// 저장 (forceSave 내부)
finances[teamId].deadMoney = team.deadMoney;

// 로드
const dm = checkpoint.team_finances[teamId]?.deadMoney;
if (dm?.length) team.deadMoney = dm;
```

`SavedTeamFinances[teamId].deadMoney?: DeadMoneyEntry[]` (`types/finance.ts`)

### UI 표시 (`views/FAView.tsx` — CapStatus)

데드캡 > 0인 경우에만 CapStatus 헤더에 빨간색으로 표시:
```
총 페이롤   데드캡*   잔여 캡   MLE
$187.5M   $18.0M   캡 초과   없음
* 데드캡이 있을 때만 표시
```

### 소멸 시점 (`offseasonEventHandler.ts` — `handleMoratoriumStart`)

매 오프시즌 `moratoriumStart` 처리 시 다음 규칙으로 정리:

```ts
team.deadMoney = (team.deadMoney ?? [])
    .filter(e => e.releaseType === 'stretch')          // waive / buyout: 1회성 → 제거
    .map(e => ({ ...e, stretchYearsRemaining: (e.stretchYearsRemaining ?? 1) - 1 }))
    .filter(e => (e.stretchYearsRemaining ?? 0) > 0); // 0이 되면 제거
```

| 방식 | 소멸 규칙 |
|------|---------|
| **waive** | 1회성. 다음 오프시즌에 제거. 단, **다른 팀이 해당 선수를 영입하면 즉시 Set-Off 적용** (아래 참조) |
| **buyout** | 1회성. 다음 오프시즌에 제거. Set-Off 없음 (합의된 고정 금액) |
| **stretch** | `stretchYearsRemaining`이 0이 될 때까지 매 시즌 `amount`씩 캡 산정 후 제거. Set-Off 없음 |

### Set-Off Rule (NBA CBA Article 13.14)

웨이브된 선수가 FA 시장에서 다른 팀(B팀)과 계약하면, 원 소속팀(A팀)의 데드캡 의무가 줄어든다.

```
A팀 잔여 데드캡 = max(0, 원래 waive 데드캡 - B팀 총 계약액)
```

B팀 총 계약액이 A팀 데드캡 이상이면 항목 자체 소멸.
B팀 총 계약액이 더 작으면 차액만큼 A팀 데드캡이 잔존.

**예시:**
```
A팀 웨이브, 남은 보장 = $20M
→ A팀 deadMoney amount = $20M

B팀이 2년 × $6M = $12M 계약 체결
→ A팀 잔여 데드캡 = $20M - $12M = $8M (잔존)

B팀이 3년 × $8M = $24M 계약 체결
→ A팀 잔여 데드캡 = $0 (소멸)
```

**구현 위치:**
- 유저가 웨이브된 선수 영입 시: `pages/FAMarketPage.tsx` → `onOfferAccepted`
- CPU가 웨이브된 선수 영입 시: `services/fa/faMarketBuilder.ts` → `simulateCPUSigning`

**Set-Off 적용 조건: `releaseType === 'waive'` 항목만.**
스트레치/바이아웃은 이미 당사자 간 합의된 고정 금액이므로 B팀 서명 여부와 무관.

---

## 13. 구현 상태 체크리스트

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
| `releasePlayerToMarket()` | `services/fa/faMarketBuilder.ts` | ✅ 완료 |
| 오프시즌 만료 선수 객체 수집 | `offseasonEventHandler.ts` | ✅ 완료 |
| `rosterDeadline` 이벤트 (FA_OPEN → PRE_SEASON) | `offseasonEventHandler.ts` | ✅ 완료 |
| `openFAMarket` 자동 호출 | `hooks/useSimulation.ts` | ✅ 완료 |
| `simulateCPUSigning` rosterDeadline 연동 | `hooks/useSimulation.ts` | ✅ 완료 |
| `leagueFAMarket` 상태 + 복원 + 저장 | `hooks/useGameData.ts` | ✅ 완료 |
| `faPlayerMap` 파생값 | `hooks/useGameData.ts` | ✅ 완료 |
| FA 시장 뷰 (FA 시장 탭 + 내 로스터 탭) | `views/FAView.tsx` | ✅ 완료 |
| CapStatus 데드캡 표시 | `views/FAView.tsx` | ✅ 완료 |
| `onOfferAccepted` 로스터/마켓/메시지 연동 | `components/AppRouter.tsx` | ✅ 완료 |
| `onReleasePlayer` 방출/데드캡/메시지 연동 | `components/AppRouter.tsx` | ✅ 완료 |
| FA_SIGNING / FA_RELEASE / FA_LEAGUE_NEWS 메시지 | `types/message.ts` + renderer | ✅ 완료 |
| 사이드바 FA Market 상시 표시 + NEW 배지 | `components/Sidebar.tsx` | ✅ 완료 |
| DB 영속화 (`league_fa_market` 컬럼) | `services/persistence.ts` | ✅ 완료 |
| 데드캡 영속화 (`getFinancesSnapshot` → `team_finances` JSONB) | `hooks/useGameData.ts`, `financeEngine/budgetManager.ts` | ✅ 완료 |
| `ReleaseType`, `DeadMoneyEntry` 타입 + `Team.deadMoney[]` | `types/team.ts` | ✅ 완료 |
| `calcTeamPayroll` 데드캡 합산 | `faMarketBuilder.ts` | ✅ 완료 |
| 웨이브/바이아웃/스트레치 방출 방식 선택 모달 | `views/FAView.tsx` | ✅ 완료 |
| 방출 방식별 데드캡 계산 (`onReleasePlayer`) | `components/AppRouter.tsx` | ✅ 완료 |
| FA_RELEASE 메시지에 방출 방식 + 데드캡 금액 표시 | `MessageContentRenderer.tsx` | ✅ 완료 |
| 데드캡 오프시즌 정리 (waive/buyout 제거, stretch 차감) | `offseasonEventHandler.ts` | ✅ 완료 |
| 스트레치 다시즌 추적 (`stretchYearsRemaining`) | `types/team.ts` + `offseasonEventHandler.ts` | ✅ 완료 |
| CPU 팀 자동 웨이버 엔진 (`simulateCPUWaivers`) | `services/fa/cpuWaiverEngine.ts` | ✅ 완료 |
| CPU 웨이버 moratoriumStart 조기 실행 (Phase 1+3) | `hooks/useSimulation.ts` | ✅ 완료 |
| CPU 웨이버 rosterDeadline 실행 (Phase 1+2+3) | `hooks/useSimulation.ts` | ✅ 완료 |
| 트레이드 우선 필터 (`preferTradeBlock`) | `services/fa/cpuWaiverEngine.ts` | ✅ 완료 |
| Set-Off Rule — 웨이브 후 B팀 영입 시 A팀 데드캡 차감 | `FAMarketPage.tsx` + `faMarketBuilder.ts` | ✅ 완료 |
| 바이아웃 최소 수락액 — 성격 기반 공식 (loyalty/financialAmbition/OVR/morale) | `views/NegotiationScreen.tsx` | ✅ 완료 |

---

## 14. 미구현 / 제외 항목

| 항목 | 사유 |
|------|------|
| Room Exception ($8.781M) | 복잡도 대비 가치 낮음 |
| Bi-Annual Exception ($5.134M) | 동일 |
| 슈퍼맥스 | YOS + 수상 조건 복잡 |
| 데릭 로즈 룰 | 복잡도 대비 가치 낮음 |
| 루키 스케일 고정액 | 루키 드래프트에서 별도 처리 |
| 보장/비보장 계약 | 현재 전액 보장 계약만. `guaranteedSalary` 필드 추후 추가 예정 |

---

## 15. 향후 작업 예정

1. **보장/비보장 계약**: `guaranteedSalary` 필드 추가. 부분 보장 계약 방출 시 보장액만 데드캡으로 처리
2. **Room Exception / Bi-Annual Exception**: 복잡도 대비 우선순위 낮음 (멀티시즌 준비 시 검토)
