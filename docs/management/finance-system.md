# 구단 재정 시스템 (Team Finance System)

> 샐러리캡 시스템의 기반이 되는 구단 재정 인프라.
> 후속 과제: `docs/plan/salary-cap-plan.md`

---

## 1. 개요

NBA 구단의 수익/지출/예산을 시뮬레이션하여, 단순 하드코딩(`budget=150`)이던 재정 구조를
**30팀 차등 모델**로 대체한다. 매 홈 경기마다 관중/입장료/MD 수익이 누적되고,
시즌 종료 시 럭셔리 택스가 확정된다.

### 핵심 원칙

- **현실 반영**: 실제 NBA 데이터 기반 (마켓 규모, 경기장 좌석수, 입장료 등)
- **30팀 차등**: 빅마켓 vs 스몰마켓 수익 격차가 전략적 의미를 가짐
- **경기별 누적**: 관중/MD 수익은 경기마다 계산되어 시즌 내내 누적
- **구단주 성향**: spendingWillingness 등 4개 성향이 예산/지출 결정에 영향

---

## 2. 데이터 모델

### 2-1. 구단주 프로필 (OwnerProfile)

| 필드 | 타입 | 설명 |
|------|------|------|
| `name` | string | 구단주 이름 (이니셜 형태) |
| `netWorth` | number | 순자산 ($B) |
| `spendingWillingness` | 1~10 | 택스 납부 및 FA 투자 의지 |
| `winNowPriority` | 1~10 | 단기 우승 vs 장기 육성 |
| `marketingFocus` | 1~10 | 수익 극대화 vs 팬 서비스 |
| `patience` | 1~10 | 리빌딩 과정에 대한 인내심 |

**spendingWillingness 해석**:
- 10: 무제한 예산, 택스 무관 (예: LAW)
- 7~9: 우승 경쟁 시 택스 감수
- 4~6: 택스 라인 근처에서 절약
- 1~3: 플로어 근처 운영, 수익 추구

### 2-2. 마켓 & 경기장 (MarketData)

| 필드 | 타입 | 설명 |
|------|------|------|
| `metroPopulation` | number | 광역 인구 (만 명) |
| `marketTier` | 1\|2\|3\|4 | 대/중대/중소/소도시 |
| `arenaCapacity` | number | 좌석 수 |
| `arenaName` | string | 경기장 이름 (가상) |
| `baseTicketPrice` | number | 기본 입장료 ($) |
| `localMediaDeal` | number | 로컬 방송 계약 ($M/년) |
| `sponsorshipBase` | number | 기본 스폰서 수익 ($M/년) |

**마켓 티어 분류**:
| 티어 | 분류 | 팀 예시 | 인구 기준 |
|------|------|--------|----------|
| 1 | 대도시 | NYK, BKN, LAM, LAW, GS, CHI | 9M+ |
| 2 | 중대도시 | DAL, PHI, HOU, WAS, MIA, ATL, BOS, PHX, DEN, MIN | 4~9M |
| 3 | 중소도시 | DET, POR, CLE, SAC, ORL, SAS, IND, CHA, MIL, TOR | 2~4M |
| 4 | 소도시 | NOP, MEM, OKC, UTA | 2M 미만 |

### 2-3. 구단 재정 상태 (TeamFinance — 런타임)

```
revenue:
  gate          — 관중 입장료 (경기별 누적)
  broadcasting  — 중앙 방송 분배금 (시즌 초 확정, 전팀 $155M)
  localMedia    — 로컬 미디어 (시즌 초 확정, 팀별 차등)
  sponsorship   — 스폰서십 (시즌 초 확정, 성적 보정)
  merchandise   — MD 수익 (경기별 누적)
  other         — 기타 (주차, 이벤트 등)

expenses:
  payroll       — 선수 연봉 총액
  luxuryTax     — 럭셔리 택스 (시즌 종료 시 확정)
  operations    — 구장 운영비 (좌석수 기반 고정)
  coachSalary   — 감독/코치 연봉

operatingIncome — 총수익 - 총지출
budget          — 시즌 지출 가능 예산 (구단주 승인)
```

---

## 3. 수익 시뮬레이션

### 3-1. 시즌 고정 수익 (시즌 시작 시 확정)

| 수익원 | 계산 방식 | 비고 |
|--------|----------|------|
| 중앙 방송 | $155M/팀 균등 배분 | NBA 총 방송 수익 ÷ 30 |
| 로컬 미디어 | `market.localMediaDeal` | 팀별 차등 ($20M~$200M) |
| 스폰서십 | `sponsorshipBase × (1 + (winPct-0.5)×0.3)` | 전시즌 성적 ±15% 보정 |
| 기타 | 마켓 티어별 고정 (T1:$45M, T2:$30M, T3:$20M, T4:$15M) | |

### 3-2. 경기별 수익 (매 홈 경기 누적)

#### 관중 모델

```
관중 수 = arenaCapacity × 점유율

점유율 = 기본 점유율 + 승률 보정 + 스타 보정 + 상대팀 보정
```

| 요소 | 계산 | 범위 |
|------|------|------|
| 기본 점유율 | T1: 95%, T2: 88%, T3: 82%, T4: 78% | — |
| 승률 보정 | `(winPct - 0.5) × 0.4` | 30%→-8%, 70%→+8% |
| 스타 보정 | OVR 90+ 2명 이상: +5%, 1명: +3% | 0~5% |
| 상대팀 보정 | 빅마켓 팀 원정 시 +3% | 0~3% |
| 최종 범위 | clamp(60%, 100%) | — |

**빅마켓 원정 보정 대상**: NYK, BKN, LAM, LAW, GS, CHI, BOS, PHI, DAL

#### 입장료 수익

```
gateRevenue ($M) = attendance × baseTicketPrice / 1,000,000
```

#### MD(머천다이즈) 수익

```
mdRevenue ($M) = attendance × perCapitaSpend / 1,000,000

인당 지출: T1: $15, T2: $10, T3: $7, T4: $5
```

### 3-3. 지출 구조

| 지출항목 | 계산 | 비고 |
|---------|------|------|
| 선수 연봉 | `roster.reduce(salary)` | 트레이드/FA 후 업데이트 |
| 럭셔리 택스 | 6구간 누진 (아래 참조) | 시즌 종료 시 확정 |
| 운영비 | `arenaCapacity × $3,000/석` | ~$54~63M |
| 코치 연봉 | 코칭 시스템 데이터 | ~$5~12M |

#### 럭셔리 택스 계산 (6구간 누진)

택스 라인 초과분에 대해 구간별 세율 적용:

| 초과 구간 ($M) | 세율 ($/$ 초과) |
|---------------|----------------|
| 0~5 | $1.50 |
| 5~10 | $1.75 |
| 10~15 | $2.50 |
| 15~20 | $3.25 |
| 20~25 | $3.75 |
| 25+ | $4.25 + $0.50/추가 $5M |

예시: 택스 라인 $170M, 페이롤 $195M → 초과 $25M
→ 5×1.5 + 5×1.75 + 5×2.5 + 5×3.25 + 5×3.75 = $63.75M

### 3-4. 예산 결정

구단주 `spendingWillingness`에 따라 예상 수익 대비 예산 결정:

```
budget = estimatedRevenue × multiplier

multiplier = 0.75 + (spendingWillingness - 1) × (0.75 / 9)
```

| spendingWillingness | multiplier | 의미 |
|--------------------|-----------|------|
| 1 | 0.75× | 수익의 75%, 극단적 절약 |
| 3 | 0.92× | 이윤 추구 |
| 5 | 1.08× | 손익분기 근처 |
| 7 | 1.25× | 우승 경쟁 시 적극 투자 |
| 10 | 1.50× | 수익의 150%, 무제한 투자 |

---

## 4. 아키텍처

### 4-1. 파일 구조

```
types/
  finance.ts                    ← 타입 정의 (OwnerProfile, MarketData, TeamFinance 등)

data/
  teamFinanceData.ts            ← 30팀 정적 데이터 (구단주, 마켓, 경기장)

services/financeEngine/
  index.ts                      ← 배럴 export
  attendanceModel.ts            ← 경기별 관중/입장료/MD 수익 계산
  revenueCalculator.ts          ← 시즌 고정 수익/지출 + 초기화 + 예산 결정
  budgetManager.ts              ← BudgetManager 싱글턴 (전팀 재정 관리)

views/
  FrontOfficeView.tsx           ← 프론트 오피스 UI (3탭: 재정/구단주/경기장)
```

### 4-2. BudgetManager (싱글턴)

전체 재정 상태를 관리하는 중앙 매니저:

| 메서드 | 호출 시점 | 역할 |
|--------|----------|------|
| `initializeSeason(teams, coachSalaries)` | 시즌 시작 / 체크포인트 로드 | 전팀 재정 초기화 |
| `processHomeGame(homeTeam, awayTeamId)` | 매 홈 경기 후 | 입장료 + MD 수익 누적 |
| `updatePayroll(teamId, roster)` | 트레이드/FA 후 | 페이롤 재계산 |
| `finalizeLuxuryTax()` | 시즌 종료 | 6구간 누진 택스 확정 |
| `getFinance(teamId)` | UI 표시 등 | 팀 재정 조회 |
| `toSaveData()` | 체크포인트 저장 | SavedTeamFinances 생성 |
| `loadFromSaveData(data)` | 체크포인트 로드 | 저장 데이터 복원 |

접근: `getBudgetManager()` / `resetBudgetManager()`

### 4-3. 데이터 흐름

```
[시즌 시작 / 체크포인트 로드]
  │
  ├─ 저장 데이터 있음 → loadFromSaveData()
  └─ 없음 → initializeSeason()
       ├─ 고정 수익 확정 (방송/로컬미디어/스폰서/기타)
       ├─ 고정 지출 확정 (운영비/코치/페이롤)
       └─ 예산 결정 (spendingWillingness → multiplier)

[매 경기] (정규시즌만)
  │
  └─ processHomeGame()
       ├─ calculateGameAttendance() → 관중 수
       ├─ calculateGateRevenue() → 입장료 누적
       ├─ calculateMerchandiseRevenue() → MD 누적
       └─ recalculateIncome() → 영업수입 갱신

[시즌 종료]
  │
  └─ finalizeLuxuryTax() → 6구간 누진 택스 확정

[체크포인트 저장]
  │
  └─ toSaveData() → saves.team_finances (JSONB)
```

### 4-4. 시뮬레이션 파이프라인 연동

재정 엔진은 3곳에서 호출된다 (모두 홈 경기 + 정규시즌만):

| 파일 | 함수 | 용도 |
|------|------|------|
| `userGameService.ts` | `applyUserGameResult()` | 유저 팀 경기 결과 반영 |
| `cpuGameService.ts` | `processCpuGames()` | CPU 간 경기 결과 반영 |
| `batchSeasonService.ts` | `processCpuGamesInPlace()` | 배치 모드 CPU 경기 |

호출 위치: 팀 스탯 업데이트 직후, `isPlayoff` 체크 후:
```typescript
if (!isPlayoff) {
    getBudgetManager().processHomeGame(homeTeam, awayTeam.id);
}
```

---

## 5. 저장/복원 (Persistence)

### DB 스키마

`saves` 테이블에 `team_finances` JSONB 컬럼 추가:

```sql
ALTER TABLE saves ADD COLUMN team_finances JSONB DEFAULT NULL;
```

### 저장 형식 (SavedTeamFinances)

```typescript
{
  [teamId: string]: {
    revenue: { gate, broadcasting, localMedia, sponsorship, merchandise, other },
    expenses: { payroll, luxuryTax, operations, coachSalary },
    budget: number,
    gamesPlayed: number,
  }
}
```

### 복원 로직 (`useGameData.ts`)

1. 체크포인트에 `team_finances` 있으면 → `loadFromSaveData()` 복원
2. 없으면 (기존 세이브) → `initializeSeason()` 새로 초기화
3. 저장 시 → `getBudgetManager().toSaveData()` → payload에 포함

---

## 6. UI: 프론트 오피스 (FrontOfficeView)

사이드바 "프론트 오피스" 메뉴 → `AppView = 'FrontOffice'`

### 3개 탭

| 탭 | 내용 |
|------|------|
| **재정** | 4개 요약 카드 (총수익/총지출/영업수입/시즌예산) + 수익/지출 내역 바 차트 |
| **구단주** | 구단주 프로필 + 4개 성향 슬라이더 (지출의지/우승우선/마케팅중시/인내심) |
| **경기장** | 경기장 정보 (좌석/입장료/마켓티어) + 연고지 정보 (인구/미디어/스폰서) |

---

## 7. 30팀 정적 데이터

`data/teamFinanceData.ts`에 하드코딩. 실제 NBA 데이터 기반 + 가상 경기장 이름.

**데이터 예시** (LAW):
```typescript
{
  ownerProfile: {
    name: 'S. Ballmer',
    netWorth: 120,              // $120B
    spendingWillingness: 10,    // 최대 투자
    winNowPriority: 9,
    marketingFocus: 7,
    patience: 4,
  },
  market: {
    metroPopulation: 1321,      // 1,321만 명
    marketTier: 1,
    arenaCapacity: 18000,
    arenaName: 'Pacific Dome',  // 가상 이름
    baseTicketPrice: 85,
    localMediaDeal: 55,
    sponsorshipBase: 100,
  },
}
```

경기장 이름은 저작권 회피를 위해 **도시 테마 가상 이름** 사용:
- NYK → Empire Arena
- GS → Golden Gate Arena
- CHI → Windy City Center
- BOS → Harbor Pavilion
- 등등

---

## 8. 후속 과제

- **샐러리캡 연동** (`docs/plan/salary-cap-plan.md`): budget ↔ 샐러리캡 연결, spendingWillingness → 택스 납부 의지
- **입장료 조정**: 유저가 입장료를 올리면 수익↑ 관중↓, 내리면 반대
- **구단주 만족도**: 시즌 성적 + 재정 상태 → 구단주 만족도 게이지
- **예산 요청**: 구단주에게 추가 예산 요청 (성적/우승 가능성에 따라 승인율 변동)
- **시즌 간 재정 이월**: 멀티시즌 시 전시즌 재정 결과가 다음 시즌에 영향
