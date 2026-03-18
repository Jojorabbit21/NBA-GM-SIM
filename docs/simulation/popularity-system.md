# 선수 인기도 시스템 (Player Popularity System)

## 개요

선수 인기도는 경기 퍼포먼스 기반으로 축적되어 **관중 수익 · 머천다이즈 · 스폰서십** 세 가지 재정 항목에 직접 영향을 주는 시스템이다.
기존에는 OVR 90+ 선수 수로 거칠게 보정하던 방식을 대체한다.

---

## 데이터 구조

```ts
// types/player.ts
export interface PlayerPopularity {
    local: number;    // 0~100 — 연고지 인기 (관중·MD 직결)
    national: number; // 0~100 — 전국 인기 (스폰서십·MD 보정)
}

// Player, SavedPlayerState 모두에 optional 필드로 추가
popularity?: PlayerPopularity;
```

- `local`: 홈 팬덤 강도. 관중 점유율과 MD 인당 지출에 반영된다.
- `national`: 전국 미디어 노출도. 스폰서십 수익과 MD 보정에 반영된다.
- 두 값 모두 **0~100** 범위. 0은 완전 무명, 100은 리그 최고 스타 수준이다.

---

## 구현 파일

| 파일 | 역할 |
|---|---|
| `services/playerPopularity.ts` | 핵심 로직 (초기값·경기후·오프시즌·재정보정 함수) |
| `services/popularitySeeds.ts` | 현역 선수 초기값 시드맵 (한국어 이름 → local/national) |
| `types/player.ts` | `PlayerPopularity` 인터페이스 + Player/SavedPlayerState 필드 |
| `services/financeEngine/attendanceModel.ts` | local → 관중 점유율 보정 / national → MD 보정 |
| `services/financeEngine/revenueCalculator.ts` | national → 스폰서십 보정 |
| `services/snapshotBuilder.ts` | 스냅샷 저장 |
| `hooks/useGameData.ts` | DB 저장 / 복원 |
| `services/simulation/userGameService.ts` | 경기 후 훅 |
| `services/simulation/cpuGameService.ts` | 경기 후 훅 |
| `services/simulation/batchSeasonService.ts` | 경기 후 훅 (유저 경기 + CPU 경기 2곳) |
| `services/playerDevelopment/playerAging.ts` | 오프시즌 자연 감소 훅 |

---

## 생애주기 (Lifecycle)

```
시즌 시작
  └─ 선수에 popularity 없으면 generateInitialPopularity() 호출 (첫 접근 시 lazy init)
       ↓
정규시즌 / 플레이오프 경기
  └─ processGameDevelopment() 직후 updatePopularityFromGame() 호출
       ↓
오프시즌 (processOffseason 내부)
  └─ decayPopularityOffseason() 호출
       ↓
저장 (SavedPlayerState.popularity + ReplaySnapshot)
복원 (useGameData.ts → roster restore / snapshotBuilder 양쪽)
```

---

## 1. 초기값 생성 (`generateInitialPopularity`)

**호출 시점**: `updatePopularityFromGame()` 내부에서 `player.popularity`가 없는 선수 첫 접근 시 자동 생성.

### 우선순위 로직

```
1. popularitySeeds.ts에 이름 존재? → seed 값 + 지터 (±3)
2. 없으면                           → OVR 기반 자동 계산
```

### 1-A. 현역 선수 시드맵 (`popularitySeeds.ts`)

`PLAYER_POPULARITY_SEEDS: Map<한국어 이름, {local, national}>` 형태로 관리.

**현역 선수 444명 전원** 수록 (6개 Tier 분류):

| Tier | national 범위 | 생성 방식 | 예시 |
|---|---|---|---|
| S — 글로벌 슈퍼스타 | 88+ | 수동 조정 | 커리(95), 르브론(97), 야니스(91) |
| A — 리그 최정상급 | 72~88 | 수동 조정 | 요키치(83), SGA(80), 하든(82) |
| B — 올스타급 | 58~72 | 수동 조정 | 자 모란트(76), 테이텀(78), 할리버튼(70) |
| C — 주전급 | 42~58 | 수동 조정 | 고베어(58), 홈그렌(62), 배럿(52) |
| D — 로테이션 | 25~42 | 공식 자동 계산 | OVR 80대 백업 |
| E — 엔드오브벤치 | 0~25 | 공식 자동 계산 | OVR 70대 이하 |

**공식 자동 계산 (Tier D~E)**:
```python
local    = clamp( (OVR - 58) × 1.7 + market_bonus + franchise_bonus + age_factor, 5, 92 )
national = clamp( local × 0.38 + national_fame(OVR) + age_factor, 0, 92 )

market_bonus    = 3~10 (팀 마켓 규모별)
franchise_bonus = 14/8/4/1/0 (팀 내 OVR 순위 1/2/3/4/5+위)
age_factor      = -5 ~ 0 (21세 이하 -5, 37세 이상 -6)
national_fame   = OVR 96+→55, 94+→44, 92+→34, 90+→24 ... (OVR 별 celebrity 보너스)
```

**local** 설계 원칙:
- 이적 직후 선수: local을 낮게 설정 (예: 이적 후 하든 64, 듀란트 68)
- 프랜차이즈 스타: local을 높게 설정 (예: GS 커리 95, BOS 테이텀 88)
- national이 local보다 높은 경우도 있음 (이적 직후 superstar)

**±3 지터**로 매 게임 시작 시 미세하게 다른 초기값이 생성된다.

### 1-B. OVR 기반 자동 계산 (레전드·신인·생성선수)

시드맵에 없는 선수 (레전드 올타임, 신인, 생성선수):

```
local  = clamp( (OVR - 50) + tenureBonus + awardsBonus + rookiePenalty + rand(), 5, 80 )
national = clamp( round(local × 0.45) + awardsBonus + rand(), 0, 70 )
```

| 항목 | 값 | 설명 |
|---|---|---|
| OVR 기반 베이스 | `OVR - 50` | OVR 75 → +25, OVR 60 → +10 |
| tenureBonus | `min(teamTenure × 2, 12)` | 6시즌 이상 팀에 있으면 최대 +12 |
| awardsBonus | `+8` (수상 이력 있으면) | player.awards 배열 기준 |
| rookiePenalty | `-8` (age ≤ 22 && tenure = 0) | 신인 선수 초기 낮은 인지도 반영 |
| rand | `-5 ~ +5` (정수 랜덤) | 초기 불확실성 |

> 레전드는 올타임 전성기 기준으로 OVR이 높게 책정되지만, 시즌 내에서 기술적으로 의미 있는 인기 반영은 어렵다 (단년 시즌제). OVR 자동 계산으로 충분.

### 예시 비교

| 선수 | 경로 | local | national |
|---|---|---|---|
| 스테판 커리 | 시드맵 | 95 ± 3 | 95 ± 3 |
| 니콜라 요키치 | 시드맵 | 80 ± 3 | 83 ± 3 |
| OVR 90 신인 (22세) | 자동 계산 | ~32 | ~14 |
| OVR 90 레전드 (tenure 0) | 자동 계산 | ~40 | ~18 |

---

## 2. 경기 후 업데이트 (`updatePopularityFromGame`)

**호출 시점**: 유저 경기·CPU 경기·배치 시즌 모두, `processGameDevelopment()` 직후.
정규시즌·플레이오프 모두 적용된다.

### 이벤트 테이블 (기본 delta)

| 조건 | local delta | national delta |
|---|---|---|
| 득점 30점 이상 | +0.5 | +0.3 |
| 트리플더블 (PTS/REB/AST 모두 10+) | +0.5 | +0.3 |
| 더블더블 (위 셋 중 두 항목 10+) | +0.3 | +0.1 |
| 부진 (득점 < 8, FGA ≥ 5, FG% < 30%) | -0.2 | -0.1 |

> 득점 30+와 트리플더블은 동시 적용 가능 (최대 +1.0 / +0.6).
> 출전 시간 1분 미만 선수는 판정에서 제외된다.

### 배율 (Multiplier)

| 조건 | 배율 |
|---|---|
| 플레이오프 경기 | × 2.0 |
| 상위 8팀 상대 (현재 승률 기준) | × 1.5 |
| 두 조건 동시 | × 3.0 (2.0 × 1.5) |

**부정 delta는 배율 미적용**: 패배·부진 페널티가 플레이오프에서 과도하게 쌓이는 것을 방지한다.

### Ceiling 감쇠

높은 인기도일수록 추가 상승이 느려지는 자연 포화 효과:

```
localDelta    *= (1 - player.popularity.local    / 130)
nationalDelta *= (1 - player.popularity.national / 130)
```

| 현재 local | 감쇠 계수 | 30점 경기 실제 local 상승 |
|---|---|---|
| 20 | 0.846 | +0.42 |
| 50 | 0.615 | +0.31 |
| 80 | 0.385 | +0.19 |
| 95 | 0.269 | +0.13 |

→ local 100에서 계수 0.23, national 100에서도 동일. 100에 수렴하지만 쉽게 도달하지 못한다.

### 범위 클램프

```
local:    0 ~ 100
national: 0 ~ 100
```

---

## 3. 오프시즌 자연 감소 (`decayPopularityOffseason`)

**호출 시점**: `processOffseason()` 내부, 각 선수의 나이·계약 처리 후.

```ts
localDecay    = hasRecentAward ? 1 : 3
nationalDecay = hasRecentAward ? 1 : 2

local    = max(5,  local    - localDecay)
national = max(0,  national - nationalDecay)
```

- **수상 선수 (player.awards 존재)**: 감소폭 절반 (이미 커리어 수상 이력 보유 기준).
- **local 최솟값 5**: 리그에 소속된 이상 완전한 무명은 없음.
- **national 최솟값 0**: 국내 노출 없을 수 있음.

---

## 4. 재정 연결

### 4-1. 관중 점유율 (attendanceModel.ts)

`calculateGameAttendance()`에서 세 가지 보정이 적용된다:

```
occupancy = BASE_OCCUPANCY[marketTier]
  + winBonus         (승률 기반, 최대 ±30%)
  + popBonus         (localPopularity 기반, 최대 +18%)  ← 신규
  + awayBonus        (빅마켓 원정팀 +5%)
```

**`getTeamLocalStarPower(roster)`** 가중 합성:

```
starPower = top1 × 0.45 + top2 × 0.25 + top3 × 0.15 + (top4~8 평균) × 0.15
popBonus  = (starPower / 100) × 0.18    ← 최대 +18% 점유율
```

> 예) 로스터의 top local: [75, 60, 45, 30, 25]
> starPower = 75×0.45 + 60×0.25 + 45×0.15 + 28×0.15 ≈ 59.0
> popBonus  = 0.590 × 0.18 ≈ +10.6% 점유율

### 4-2. 머천다이즈 수익 (attendanceModel.ts)

`calculateMerchandiseRevenue()`에서 에이스 선수의 national popularity로 인당 지출을 보정:

```
topNational = max(roster.map(p => p.popularity?.national ?? 0))
mdMultiplier = 1 + (topNational / 1000)    ← national 100 → 최대 +10%
mdSpend = round(BASE_MD_PER_CAPITA[marketTier] × mdMultiplier)
```

| national 값 | MD 인당 보정 |
|---|---|
| 0 | ×1.000 (보정 없음) |
| 50 | ×1.050 (+5%) |
| 80 | ×1.080 (+8%) |
| 100 | ×1.100 (+10%) |

### 4-3. 스폰서십 수익 (revenueCalculator.ts)

`calculateFixedRevenue()`에서 national 60+ 선수 수로 스폰서십을 보정:

```
count60          = roster.filter(p => p.popularity?.national >= 60).length
nationalPopBonus = min(count60 × 0.03, 0.15)    ← 선수당 +3%, 최대 +15%
sponsorship      = sponsorshipBase × winPctBonus × (1 + nationalPopBonus)
```

| national 60+ 선수 수 | 스폰서십 보너스 |
|---|---|
| 0명 | +0% |
| 1명 | +3% |
| 3명 | +9% |
| 5명 이상 | +15% (상한) |

---

## 5. 저장 / 복원

### 스냅샷 (`snapshotBuilder.ts`)

기존 `archetypeState`, `contract` 패턴과 동일:

```ts
const hasPopularity = !!player.popularity;
// if (hasStats || hasAnyGrowthData || ... || hasPopularity) {
if (hasPopularity) entry.popularity = player.popularity;
```

### DB 저장·복원 (`hooks/useGameData.ts`)

- **저장**: `buildRosterState()` 내 `SavedPlayerState`에 `popularity` 포함
- **복원**: roster hydration 시 `savedState.popularity` → `player.popularity` 재할당

---

## 6. 설계 원칙 및 주의사항

### 순환 import 없음
`playerPopularity.ts` → `popularitySeeds.ts` → `types/player.ts` (단방향).
재정 파일·시뮬레이션 파일이 `playerPopularity.ts`를 단방향으로 import한다.

### 시드맵 유지 원칙 (`popularitySeeds.ts`)
- **키**: 게임 내 한국어 이름 (meta_players.name 기준)
- **이적 반영**: 팀을 옮긴 선수는 local을 낮게 조정 (새 팀에서 팬덤 재구축 필요)
- **추가**: 신규 선수 영입 시 시드맵에 수동 추가 가능 (없으면 OVR 기반 자동 fallback)
- **삭제**: 은퇴/방출 선수는 그대로 둬도 무방 (시드맵 미등록 이름은 자동 무시됨)

### Lazy initialization
`generateInitialPopularity()`는 첫 경기 진행 시 자동 호출된다. 기존 saves에 `popularity` 필드가 없어도 오류 없이 동작한다.

### 부정 delta 배율 미적용
부진 경기의 페널티는 플레이오프·강팀 상대 배율을 적용하지 않는다. 슈퍼스타가 한 번 부진한 플레이오프 경기로 인기가 급락하는 것을 방지한다.

### 오프시즌 감소 하한
`local >= 5`: 현역 선수가 완전한 무명이 되는 것을 방지.
`national >= 0`: 국내 노출 없음은 허용 (신인·마이너 마켓 선수).

---

## 7. 향후 확장 계획

| 기능 | 설명 | 우선순위 |
|---|---|---|
| **Morale 시스템** | popularity를 선수 사기(Morale)의 입력값으로 활용 | 중 |
| **loyalty 트레잇 연결** | loyalty 낮은 선수 → 인기 낮으면 트레이드 요청 이벤트 | 중 |
| **winDesire 트레잇 연결** | 우승 가능성 높은 팀 FA 할인에 popularity 반영 | 낮음 |
| **이탈 이벤트** | local 70+ 선수 방출/트레이드 시 LEAGUE_NEWS 발송 | 낮음 |
| **UI 표시** | PlayerDetailView에 인기도 게이지 표시 | 낮음 |
