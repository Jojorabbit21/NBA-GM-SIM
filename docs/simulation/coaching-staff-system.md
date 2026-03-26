# 코칭스태프 시스템 (Coaching Staff System)

> **타입 정의**: `types/coaching.ts`
> **생성 엔진**: `services/coachingStaff/coachGenerator.ts`
> **고용/해고**: `services/coachingStaff/coachHiringEngine.ts`
> **훈련 효율**: `services/coachingStaff/trainingEngine.ts`
> **UI 진입점**: `/coach-market` → `pages/CoachMarketPage.tsx` → `views/CoachMarketView.tsx`
> **코치 상세**: `/coach/:coachId` → `pages/CoachDetailPage.tsx` → `views/CoachDetailView.tsx`

---

## 1. 시스템 개요

코칭스태프 시스템은 **5개 직무**로 구성된다. 각 직무는 서로 다른 능력치 구조와 역할을 갖는다.

### 두 가지 영향 채널

| 채널 | 대상 데이터 | 영향 시점 |
|---|---|---|
| **HeadCoachPreferences** (HC 전용) | 전술 성향 7개 슬라이더 | 경기 시뮬레이션 — 항상 실시간 |
| **CoachAbilities** (5직무 공통) | 코치 능력치 10~13개 | **오프시즌 훈련 효율에만** 반영 |

> **핵심 원칙**: 코치 능력치는 경기 결과에 **절대 영향을 주지 않는다**. 오직 오프시즌 훈련을 통한 선수 성장에만 반영된다. 헤드코치 전술 선호도(Preferences)와 코치 능력치(Abilities)는 완전히 독립된 두 채널이다.

---

## 2. 5개 직무 구조

### 2-1. 직무 일람

```typescript
// types/coaching.ts
export type StaffRole =
    | 'headCoach'
    | 'offenseCoordinator'
    | 'defenseCoordinator'
    | 'developmentCoach'
    | 'trainingCoach';

export interface CoachingStaff {
    headCoach:            HeadCoach | null;
    offenseCoordinator:   OffenseCoordinator | null;
    defenseCoordinator:   DefenseCoordinator | null;
    developmentCoach:     DevelopmentCoach | null;
    trainingCoach:        TrainingCoach | null;
}
```

모든 슬롯은 `null` 가능. 빈 슬롯은 훈련 효율 자동 50% (기본값).

### 2-2. 직무별 인터페이스

```typescript
export interface HeadCoach {
    id: string;
    name: string;
    preferences: HeadCoachPreferences; // 전술 성향 (경기 영향)
    abilities: CoachAbilities;         // 훈련 능력치 (오프시즌 영향)
    contractYears: number;
    contractSalary: number;
    contractYearsRemaining: number;
}

export interface OffenseCoordinator {
    id: string; name: string;
    abilities: CoachAbilities;
    contractYears: number; contractSalary: number; contractYearsRemaining: number;
}
// DefenseCoordinator, DevelopmentCoach — OffenseCoordinator와 동일 구조

export interface TrainingCoach {
    id: string; name: string;
    abilities: TrainingCoachAbilities; // 전용 3개 능력치 (다른 직무와 상이)
    contractYears: number; contractSalary: number; contractYearsRemaining: number;
}
```

---

## 3. 능력치 체계

### 3-1. CoachAbilities (HC/OC/DC/Dev 공통 10개)

```typescript
// types/coaching.ts
export interface CoachAbilities {
    // 훈련 효율 직접 기여
    teaching: number;           // 0~99: 지도력 — 담당 훈련 카테고리 효율의 핵심 가중치
    schemeDepth: number;        // 0~99: 전술 깊이 — 공격/수비/전술 훈련의 깊이
    communication: number;      // 0~99: 소통력 — 훈련 피드백 전달력
    playerEval: number;         // 0~99: 선수 평가 — potential 소프트캡 완화

    // 팀 전체 보정 (globalMult — HC 주력)
    motivation: number;         // 0~99: 동기부여 — 팀 전체 훈련 참여도
    playerRelation: number;     // 0~99: 선수 관계 — 훈련 흡수율
    adaptability: number;       // 0~99: 적응력 — 다양한 아키타입 균등 훈련

    // 젊은 선수 특화 (Dev 주력)
    developmentVision: number;  // 0~99: 성장 비전 — age≤25 추가 배율
    experienceTransfer: number; // 0~99: 경험 전수 — age≤22 추가 배율

    // 전술 훈련 효율 (HC + Dev 주력)
    mentalCoaching: number;     // 0~99: 멘탈 코칭 — offTactics/defTactics 훈련 효율
}
```

### 3-2. TrainingCoachAbilities (Trainer 전용 3개)

```typescript
export interface TrainingCoachAbilities {
    athleticTraining: number;  // 0~99: 신체 훈련 — 폭발력 훈련 효율 주력
    recovery: number;          // 0~99: 회복 관리 — 훈련 후 부상 위험 감소 (미구현)
    conditioning: number;      // 0~99: 컨디셔닝 — 근력·지구력 훈련 효율 주력
}
```

> **주의**: TrainingCoachAbilities는 CoachAbilities와 완전히 다른 인터페이스다. 훈련 엔진에서 `trainer.athleticTraining`, `trainer.conditioning`만 참조하며, `recovery`는 현재 미구현 상태.

### 3-3. HeadCoachPreferences (HC 전용 7개 — 경기 영향)

```typescript
export interface HeadCoachPreferences {
    // 공격 철학 (1~10 양극 스케일)
    offenseIdentity: number;  // 1=히어로볼 ... 10=시스템농구
    tempo: number;            // 1=하프코트 그라인드 ... 10=런앤건
    scoringFocus: number;     // 1=페인트존 ... 10=3점라인
    pnrEmphasis: number;      // 1=ISO/포스트업 ... 10=PnR헤비

    // 수비 철학
    defenseStyle: number;     // 1=보수적 대인 ... 10=공격적 프레셔
    helpScheme: number;       // 1=1:1 고수 ... 10=적극 로테이션
    zonePreference: number;   // 1=대인 전용 ... 10=존 위주
}
```

이 7개 슬라이더는 경기 시뮬레이션의 PBP 엔진에서 자동전술을 결정하는 데 사용된다. 훈련 시스템과는 무관하다. 상세 동작 방식은 `docs/engine/tendency-system.md` 참조.

---

## 4. 직무별 훈련 효율 기여

### 4-1. 담당 훈련 프로그램 매핑

| 직무 | 담당 프로그램 | 핵심 능력치 |
|---|---|---|
| OC (공격 코디) | shootingTraining, insideTraining, playmakingTraining | teaching, schemeDepth, communication |
| DC (수비 코디) | manDefTraining, helpDefTraining, reboundTraining | teaching, schemeDepth, adaptability |
| Trainer (트레이닝 코치) | explosivnessTraining, strengthTraining | athleticTraining, conditioning |
| HC + Dev (공동) | offTacticsTraining, defTacticsTraining | mentalCoaching, adaptability / schemeDepth, teaching |

### 4-2. 역할별 능력치 주력 (훈련 관점)

| 능력치 | HC | OC | DC | Dev | Trainer |
|---|:---:|:---:|:---:|:---:|:---:|
| teaching | 보조 | **★★★** | **★★★** | ★★★ | — |
| schemeDepth | 보조 | **★★★** | **★★★** | ★★ | — |
| communication | 보조 | **★★** | **★★** | ★★ | — |
| playerEval | 보조 | ★ | ★ | **★★★** | — |
| motivation | **★★★** | — | — | 보조 | — |
| playerRelation | **★★★** | — | — | **★★** | — |
| adaptability | **★★** | 보조 | ★ | 보조 | — |
| developmentVision | — | — | — | **★★★** | — |
| experienceTransfer | — | — | — | **★★★** | — |
| mentalCoaching | **★★★** | — | — | **★★** | — |
| athleticTraining | — | — | — | — | **★★★** |
| recovery | — | — | — | — | ★★ |
| conditioning | — | — | — | — | **★★★** |

> **★★★** = 해당 직무의 핵심 기여 능력치 / **★★** = 중요 기여 / **★** = 보조 기여 / **—** = 관여 없음

### 4-3. globalMult — HC의 팀 전체 성장 보정

HC는 담당 훈련 프로그램은 없지만 팀 전체 훈련 효율에 글로벌 보정을 적용한다:

```
globalMult = 1.0 + (HC.motivation×0.3 + HC.playerRelation×0.4 + HC.adaptability×0.3) / 99 × 0.2
범위: 1.0 (HC 없음) ~ 1.2 (HC 모든 능력치 99)
```

HC가 없어도 다른 코치의 효율이 감소하지 않는다. 단, globalMult가 1.0이 되어 전체 성장량이 최대 20% 감소한다.

---

## 5. 능력치 생성 로직

### 5-1. 시드 기반 결정론적 생성

```typescript
// coachGenerator.ts
function stringToHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function seededNormalInt(seed, mean, stdev, min, max): number {
    const u1 = Math.max(0.0001, seededRandom(seed));
    const u2 = seededRandom(seed + 7919);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(min, Math.min(max, Math.round(mean + z * stdev)));
}
```

- 같은 `tendencySeed` + `teamId` 조합이면 항상 동일한 코치 능력치 생성
- Box-Muller 변환 기반 정규분포 샘플링

### 5-2. 직무별 생성 파라미터 (평균/표준편차/최솟값/최댓값)

#### HC 능력치 생성 (`generateHCAbilities`)

| 능력치 | 평균 | 표준편차 | 최솟값 | 최댓값 |
|---|---|---|---|---|
| teaching | 55 | 15 | 30 | 99 |
| schemeDepth | 55 | 15 | 30 | 99 |
| communication | 65 | 12 | 40 | 99 |
| playerEval | 65 | 12 | 40 | 99 |
| **motivation** | **70** | **12** | **45** | **99** |
| **playerRelation** | **70** | **12** | **45** | **99** |
| **adaptability** | **65** | **12** | **40** | **99** |
| developmentVision | 50 | 15 | 25 | 90 |
| experienceTransfer | 50 | 15 | 25 | 90 |
| **mentalCoaching** | **70** | **12** | **45** | **99** |

HC의 주력인 motivation, playerRelation, adaptability, mentalCoaching이 평균 70, 최솟값 45로 높게 설정됨.

#### OC 능력치 생성 (`generateOCAbilities`)

| 능력치 | 평균 | 표준편차 | 최솟값 | 최댓값 |
|---|---|---|---|---|
| **teaching** | **72** | **12** | **45** | **99** |
| **schemeDepth** | **70** | **12** | **45** | **99** |
| **communication** | **68** | **12** | **40** | **99** |
| playerEval | 60 | 15 | 30 | 95 |
| motivation | 50 | 15 | 25 | 90 |
| playerRelation | 50 | 15 | 25 | 90 |
| adaptability | 55 | 15 | 30 | 90 |
| developmentVision | 45 | 15 | 20 | 85 |
| experienceTransfer | 45 | 15 | 20 | 85 |
| mentalCoaching | 50 | 15 | 25 | 85 |

DC 능력치 생성(`generateDCAbilities`)은 OC와 동일한 파라미터 구조를 가짐.

#### Dev 능력치 생성 (`generateDevAbilities`)

| 능력치 | 평균 | 표준편차 | 최솟값 | 최댓값 |
|---|---|---|---|---|
| teaching | 62 | 12 | 35 | 95 |
| schemeDepth | 60 | 12 | 35 | 95 |
| communication | 65 | 12 | 40 | 95 |
| **playerEval** | **72** | **12** | **45** | **99** |
| motivation | 60 | 12 | 35 | 95 |
| **playerRelation** | **70** | **12** | **45** | **99** |
| adaptability | 60 | 12 | 35 | 95 |
| **developmentVision** | **72** | **12** | **45** | **99** |
| **experienceTransfer** | **70** | **12** | **45** | **99** |
| mentalCoaching | 65 | 12 | 40 | 99 |

#### Trainer 능력치 생성 (`generateTrainerAbilities`)

| 능력치 | 평균 | 표준편차 | 최솟값 | 최댓값 |
|---|---|---|---|---|
| **athleticTraining** | **65** | **15** | **30** | **99** |
| recovery | 60 | 15 | 30 | 99 |
| **conditioning** | **65** | **15** | **30** | **99** |

### 5-3. 계약 생성 파라미터

```typescript
function generateContract(baseSeed, baseSalary, salaryVariance) {
    contractYears = seededNormalInt(baseSeed+20, 3, 0.8, 2, 4);  // 2~4년
    contractSalary = max(500_000, seededNormalInt(baseSeed+21,
        baseSalary, salaryVariance, baseSalary*0.5, baseSalary*2));
}
```

| 직무 | 기본 연봉 | 편차 | 최솟값 | 최댓값 |
|---|---|---|---|---|
| HC | `$6M + extremity×$2M` | $1.5M | $3M | $16M |
| OC | $2.5M | $0.8M | $1.25M | $5M |
| DC | $2.5M | $0.8M | $1.25M | $5M |
| Dev | $2M | $0.6M | $1M | $4M |
| Trainer | $1.5M | $0.5M | $0.75M | $3M |

**HC 연봉 계산 상세:**
```typescript
// generateHeadCoach()
const extremity = Object.values(preferences).reduce(
    (sum, v) => sum + Math.abs(v - 5.5), 0
) / 7;
// preferences 7개의 극단성 평균 (0~4.5)
// baseSalary = round((6 + extremity × 2) × 1,000,000)
// 극단적 성향 HC (extremity≈4.5) → baseSalary ≈ $15M
// 중간 성향 HC (extremity≈0) → baseSalary ≈ $6M
```

HC의 연봉은 전술 선호도의 '극단성'에 비례한다. 전술적으로 독특하고 강한 색깔을 가진 코치일수록 몸값이 높다.

---

## 6. 리그 생성 및 초기화

### 6-1. 게임 시작 시 리그 전체 스태프 생성

```typescript
// coachGenerator.ts
export function generateLeagueStaff(teamIds: string[], tendencySeed: string): LeagueCoachingData {
    const data: LeagueCoachingData = {};
    for (const teamId of teamIds) {
        const hc = generateHeadCoach(teamId, tendencySeed);
        data[teamId] = {
            headCoach:          hc,
            offenseCoordinator: generateOffenseCoordinator(`${tendencySeed}:oc:${teamId}`),
            defenseCoordinator: generateDefenseCoordinator(`${tendencySeed}:dc:${teamId}`),
            developmentCoach:   generateDevelopmentCoach(`${tendencySeed}:dev:${teamId}`),
            trainingCoach:      generateTrainingCoach(`${tendencySeed}:trainer:${teamId}`),
        };
    }
    return data;
}
```

30팀 × 5직무 = **150명** 코치 생성. 모든 팀이 게임 시작 시 풀 스태프를 보유한다.

### 6-2. DB 헤드코치 데이터 우선 반영

```typescript
// populateCoachData() — queries.ts의 useBaseData()에서 앱 시작 시 호출
// meta_coaches DB → COACH_DATA 싱글턴에 로드
// generateHeadCoach() 호출 시 COACH_DATA에 teamId가 있으면 DB 데이터 반환
```

`meta_coaches` 테이블에 저장된 HC는 DB 데이터(이름, 선호도, 능력치, 계약)를 그대로 사용. DB에 없는 팀의 HC는 시드 기반 생성.

### 6-3. FA 코치 풀 초기 생성

```typescript
// coachGenerator.ts
const FA_POOL_SIZES: Record<StaffRole, number> = {
    headCoach:          10,
    offenseCoordinator: 12,
    defenseCoordinator: 12,
    developmentCoach:   10,
    trainingCoach:       8,
};

export function generateCoachFAPool(tendencySeed: string): CoachFAPool {
    // 각 직무별 FA_POOL_SIZES만큼 생성
    // HC FA 풀: fa_hc_0 ~ fa_hc_9 시드 사용
    // OC FA 풀: ${tendencySeed}:fa_oc_0 ~ :fa_oc_11 시드 사용
    // ...
}
```

총 FA 코치 수: 10+12+12+10+8 = **52명**

### 6-4. 불완전 스태프 보완

```typescript
// ensureFullStaff — 기존 saves 로드 시 빈 슬롯 보완
export function ensureFullStaff(
    data: LeagueCoachingData,
    teamIds: string[],
    tendencySeed: string
): LeagueCoachingData
```

기존 saves에서 특정 직무 슬롯이 null이거나 누락된 경우 자동으로 시드 기반 생성으로 채움. 구버전 saves 하위 호환에 사용.

---

## 7. 고용/해고 시스템 (`coachHiringEngine.ts`)

### 7-1. 고용 흐름 (hireCoach)

```typescript
export function hireCoach(
    staff: CoachingStaff,
    pool: CoachFAPool,
    role: StaffRole,
    coachId: string,
): { staff: CoachingStaff; pool: CoachFAPool }
```

**흐름:**
1. FA 풀에서 `coachId` 검색 → 없으면 경고 로그 후 원본 반환
2. 기존 슬롯 코치가 있으면 `fireCoachInternal()` 호출 → FA 풀로 반환
3. FA 풀에서 선택 코치 제거 (`splice`)
4. 슬롯에 배치 (`newStaff[role] = coach`)
5. **불변 복사본 반환** — 원본 staff/pool 변이 없음

```typescript
// hireCoach 내부
const newStaff = { ...staff };
const newPool = {
    headCoaches:         [...pool.headCoaches],
    offenseCoordinators: [...pool.offenseCoordinators],
    // ...
};
```

### 7-2. 해고 흐름 (fireCoach)

```typescript
export function fireCoach(
    staff: CoachingStaff,
    pool: CoachFAPool,
    role: StaffRole,
): { staff: CoachingStaff; pool: CoachFAPool }
```

**흐름:**
1. 복사본 생성
2. `fireCoachInternal()` 호출:
   - 슬롯 코치 `contractYearsRemaining = 0`으로 리셋 후 FA 풀에 push
   - 슬롯을 `null`로 설정
3. 복사본 반환

```typescript
// fireCoachInternal
const resetCoach = { ...existing, contractYearsRemaining: 0 };
getPoolArray(pool, role).push(resetCoach);
(staff as any)[role] = null;
```

해고된 코치는 `contractYearsRemaining: 0` 상태로 FA 풀에 복귀. GM이 원하면 재고용 가능.

### 7-3. 계약 만료 처리 (processCoachContracts)

```typescript
export function processCoachContracts(
    leagueStaff: LeagueCoachingData,
    pool: CoachFAPool,
): { leagueStaff: LeagueCoachingData; pool: CoachFAPool }
```

**흐름:**
- 리그 전체 30팀 × 5직무 순회
- 각 코치 `contractYearsRemaining -= 1`
- `remaining <= 0` → FA 풀 반환 (`contractYearsRemaining: 0`), 슬롯 `null`
- `remaining > 0` → `contractYearsRemaining` 갱신
- **불변 복사본 반환**

**호출 시점:** 오프시즌 파이프라인 내에서 시즌 종료 시 1회 호출. `offseasonEventHandler.ts`에서 관리.

### 7-4. Page 레벨 연동 (CoachMarketPage.tsx)

```typescript
// pages/CoachMarketPage.tsx
const handleHire = (role: StaffRole, coachId: string) => {
    const { staff: newStaff, pool: newPool } = hireCoach(teamStaff, gameData.coachFAPool!, role, coachId);
    const newCoachingData = { ...gameData.coachingData!, [myTeamId]: newStaff };
    gameData.setCoachingData(newCoachingData);
    gameData.setCoachFAPool(newPool);
    gameData.forceSave({ coachingData: newCoachingData, coachFAPool: newPool });
};
```

고용/해고 후 즉시 `forceSave`로 DB에 영속화.

---

## 8. 데이터 저장 구조

### 8-1. DB 스키마

```sql
-- meta_coaches: HC는 DB에서 로드, 나머지는 런타임 생성
ALTER TABLE meta_coaches ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'head_coach';
ALTER TABLE meta_coaches ADD COLUMN IF NOT EXISTS abilities JSONB;
ALTER TABLE meta_coaches ADD CONSTRAINT meta_coaches_role_check
    CHECK (role IN ('head_coach', 'offense_coord', 'defense_coord', 'development', 'training'));

-- saves: 리그 전체 스태프 + FA 풀 저장
ALTER TABLE saves ADD COLUMN IF NOT EXISTS coach_fa_pool JSONB;
-- (league_coaching_data는 기존 coaching_data 컬럼 사용)
```

### 8-2. saves 컬럼 매핑

| saves 컬럼 | 타입 | 내용 |
|---|---|---|
| `coaching_data` | JSONB | `LeagueCoachingData` — 30팀 × CoachingStaff |
| `coach_fa_pool` | JSONB | `CoachFAPool` — 5개 직무별 FA 코치 목록 |

### 8-3. 저장/복원 (`persistence.ts`)

```typescript
// saveCheckpoint payload
coaching_data:    JSON.stringify(leagueCoachingData),
coach_fa_pool:    coachFAPool ? JSON.stringify(coachFAPool) : null,

// 복원
const savedCoachFAPool = data.coach_fa_pool
    ? (typeof data.coach_fa_pool === 'string'
        ? JSON.parse(data.coach_fa_pool)
        : data.coach_fa_pool) as CoachFAPool
    : null;
```

### 8-4. useGameData.ts 상태 관리

```typescript
// 새 게임 시작 시
const newCoachingData = generateLeagueStaff(teamIds, tendencySeed);
const defaultTrainingConfig = getDefaultTrainingConfig();
const leagueTrainingConfigs = Object.fromEntries(teamIds.map(id => [id, defaultTrainingConfig]));
const newCoachFAPool = generateCoachFAPool(tendencySeed);

// 체크포인트 로드 시
setCoachingData(savedCoachingData);
setCoachFAPool(savedCoachFAPool ?? generateCoachFAPool(tendencySeed));
```

---

## 9. UI 흐름

### 9-1. CoachMarketView 진입

```
FrontOfficeView (코칭 탭)
  ├─ HC, OC, DC, Dev, Trainer 요약 카드 표시
  └─ "코치 영입" 버튼 → onCoachMarketOpen() → navigate('/coach-market')
       └─ CoachMarketPage.tsx
            └─ CoachMarketView
                 ├─ 5개 직무 탭
                 ├─ 현재 팀 코치 섹션 (능력치 바, 해고 버튼)
                 └─ FA 풀 테이블 (평균 능력치 정렬, 고용 버튼)
```

### 9-2. CoachDetailView 진입

```
FrontOfficeView 코치 카드 클릭 → onCoachClick(teamId) → navigate('/coach/:coachId')
  └─ CoachDetailPage.tsx
       └─ CoachDetailView
            ├─ 좌측: 5개 직무 카드 탭 (클릭 → selectedRole 전환)
            └─ 우측: 선택 직무 능력치 AbilityBar 테이블
                 └─ HC 선택 시: 전술 선호도 7개 + 능력치 10개 표시
```

---

## 10. HeadCoachPreferences — 경기 영향 상세

HeadCoachPreferences의 7개 슬라이더가 PBP 엔진에서 어떻게 작동하는지 정리.

### 10-1. 공격 철학 4개

| 슬라이더 | 범위 | 작동 방식 |
|---|---|---|
| `offenseIdentity` | 1(히어로볼)~10(시스템) | 에이스 의존도 vs 분산 오펜스 비중 조정 |
| `tempo` | 1(하프코트)~10(런앤건) | 포세션 속도, 속공 시도율 결정 |
| `scoringFocus` | 1(페인트)~10(3점) | 내부/외곽 슛 시도 비중 |
| `pnrEmphasis` | 1(ISO/포스트)~10(PnR) | PnR 세팅 빈도 |

### 10-2. 수비 철학 3개

| 슬라이더 | 범위 | 작동 방식 |
|---|---|---|
| `defenseStyle` | 1(보수적)~10(공격적) | 수비 압박 강도, 스틸 시도율 |
| `helpScheme` | 1(1:1고수)~10(적극로테이션) | 헬프 수비 빈도 |
| `zonePreference` | 1(대인전용)~10(존위주) | 존 디펜스 채택 확률 |

### 10-3. 자동전술 블렌딩

```
HeadCoachPreferences → 자동전술 생성 (GameTactics 파생)
  ↓
PBP 엔진 calculateHitRate() 호출 시 전술 값 반영
```

코치 능력치와 완전히 독립. 코치를 교체하면 다음 경기부터 새 전술 성향이 즉시 적용된다. 전술 선호도 상세는 `docs/engine/tendency-system.md` 참조.

---

## 11. 전략적 설계 의도

### 직무 시너지 설계

| 팀 전략 | 권장 코치 조합 | 훈련 집중 |
|---|---|---|
| 슈팅 팀 | OC 우선 (teaching/schemeDepth 고) | shootingTraining / playmakingTraining |
| 수비 팀 | DC 우선 (teaching/schemeDepth 고) | manDefTraining / helpDefTraining |
| 리빌딩 팀 | Dev 코치 우선 (developmentVision/experienceTransfer 고) | 균등 배분 + 루키 집중 |
| 전술 팀 | HC + Dev 둘 다 | offTacticsTraining / defTacticsTraining |
| 운동능력 팀 | Trainer (athleticTraining/conditioning 고) | explosivnessTraining |
| 올라운드 팀 | 5직무 모두 채우기 | globalMult 최대화 |

### HC 연봉과 전략

- 중간 성향 HC($6M) → globalMult 기여 낮을 수 있으나 연봉 저렴
- 극단적 성향 HC($15M) → 명확한 팀 아이덴티티, globalMult도 높을 가능성
- 연봉 절약 후 OC/DC 강화 → 특정 훈련 카테고리 집중 전략도 유효

### 코치 FA 풀 관리

- 총 52명 FA 코치 초기 생성
- 고용 시 FA 풀에서 제거 → 수요 집중 시 풀 고갈 가능
- 해고/계약만료 시 FA 풀 복귀 → 순환 구조
- 시즌이 쌓일수록 FA 풀 구성이 변화 (은퇴 코치 없음 — 현재 코치 은퇴 미구현)

---

## 12. 알려진 제약 및 미구현 항목

| 항목 | 현황 |
|---|---|
| **코치 은퇴** | 미구현. FA 풀은 무한히 순환하며 늙지 않음 |
| **CPU 코치 고용/해고** | 미구현. CPU 팀은 초기 생성 스태프 그대로 유지 |
| **Trainer.recovery** | 능력치 존재하나 훈련 부상 시스템 미구현으로 실제 효과 없음 |
| **코치 성장/퇴화** | 미구현. 코치 능력치는 고정 |
| **멀티시즌 FA 풀 재생성** | processCoachContracts로 만료 코치 FA 복귀까지만 구현. 신규 코치 진입 없음 |
| **코치 트레이드** | 미구현 |
| **코치 연봉 샐러리캡 반영** | 미구현. 코치 연봉은 TeamFinance.expenses에 별도 항목으로 미포함 |
