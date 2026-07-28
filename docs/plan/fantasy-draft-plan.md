# Fantasy Draft 마스터플랜

## Context

현재 NBA-GM-SIM은 팀 선택 시 meta_players의 기존 로스터를 그대로 사용합니다. 멀티플레이어(30인 동시접속) 전환을 위해 **Fantasy Draft** 기능이 필요합니다. 모든 445명 선수를 풀에 넣고, 30팀이 Snake Draft로 한 명씩 지명하여 처음부터 로스터를 구성하는 방식입니다. 현재는 싱글플레이어(유저 1명 + CPU 29팀)로 동작하되, 멀티플레이어 확장이 용이한 구조로 설계합니다.

---

## 게임 플로우 변경

### 기존
```
AuthView → TeamSelectView → handleSelectTeam() → OnboardingView → Dashboard
```

### 변경 후
```
AuthView → TeamSelectView → FantasyDraftView (전체화면) → OnboardingView → Dashboard
```

- 팀 선택 = 팀 아이덴티티(로고, 색상, 이름) 선택. **로스터는 비어있는 상태**
- Draft 완료 후 auto-tactics 생성 → OnboardingView → Dashboard 진입
- `FantasyDraftView`는 `OnboardingView`, `LiveGameView`처럼 **full-screen 오버레이**로 렌더 (Sidebar 없음)

### 세이브 복원 시
- `saves.draft_state.status === 'in_progress'` → FantasyDraftView로 복원 (중단 지점부터 재개)
- `saves.draft_state.status === 'completed'` → 정상 게임 로드 (stateReplayer가 FantasyDraft 트랜잭션 적용)

---

## 핵심 타입 정의

### 신규: `types/draft.ts`
```typescript
interface DraftPick {
    round: number;        // 1-15
    pickNumber: number;   // 1-450 (전체 순번)
    teamId: string;
    playerId: string;
    playerName: string;
}

interface DraftState {
    status: 'in_progress' | 'completed';
    currentPickIndex: number;  // 0-449
    draftOrder: string[];      // 450개 팀ID (snake 순서)
    picks: DraftPick[];
    availablePlayerIds: string[];
    userTeamId: string;
}
```

### 변경: `types/app.ts`
- AppView에 `'FantasyDraft'` 추가

### 변경: Transaction type union
- `'FantasyDraft'` 추가 (`'Trade' | 'Sign' | 'Release' | 'InjuryUpdate' | 'FantasyDraft'`)

---

## Draft Engine

### 신규: `services/draft/draftEngine.ts`

| 함수 | 설명 |
|------|------|
| `generateSnakeDraftOrder(teamIds, rounds)` | 30팀 × 15라운드 snake 순서 배열 생성 (홀수 라운드 1→30, 짝수 라운드 30→1) |
| `createDraftPool(teams)` | 전체 팀 로스터에서 445명 추출 → OVR 내림차순 정렬 |
| `clearAllRosters(teams)` | 모든 팀 roster를 빈 배열로 초기화 |
| `initDraftState(teamIds, userTeamId)` | DraftState 초기 객체 생성 (드래프트 순서 랜덤 셔플) |
| `advanceDraft(state, playerId)` | pick 기록 → currentPickIndex++ → availablePlayerIds에서 제거 |

### 신규: `services/draft/cpuDraftAI.ts` — CPU 오토픽 알고리즘 상세

---

#### 0. 설계 철학

- **현실적 다양성**: 29개 AI 팀이 동일한 전략을 쓰면 비현실적 → **GM 성향(Personality)** 시스템으로 팀마다 다른 드래프트 스타일
- **밸런스 보장**: 아무리 공격형 GM이라도 센터 0명 같은 비현실적 로스터 방지 → **하드 플로어(Hard Floor)** 규칙
- **BPA vs Need**: 초반엔 Best Player Available 우세, 후반엔 Need 우세 → **라운드별 가중치 시프트**
- **기존 시스템 재활용**: `archetypeSystem.ts`의 12개 역할 적합도 점수 + `overallWeights.ts`의 OVR 공식을 적극 활용

> **용어 안내**: 이 문서에서 "역할"이라고 쓴 것은 `archetypeSystem.ts`의 `ArchetypeRatings`(spacer/handler/
> screener 등 12종)를 가리킨다. 필드명이 "아키타입"이라 이 문서도 예전엔 그렇게 불렀지만, 실제로는 선수
> 정체성을 분류하는 시스템이 아니라 "이 선수가 특정 역할에 얼마나 적합한가"를 raw 능력치로 계산한 연속
> 점수다. 상세: [player-usage.md](../engine/player-usage.md#역할-적합도-점수-role-fit-score--pickweightedactor의-rawscore-입력).
> (선수 정체성 라벨인 "Rim Protector" 같은 것은 별개 시스템 — [player-archetypes.md](../engine/player-archetypes.md) 참조.)

---

#### 1. GM 성향(Personality) 시스템

각 AI 팀에 드래프트 시작 시 6가지 성향 중 하나를 **랜덤 배정**합니다.

| 성향 | 비율 | 핵심 특성 | 가중치 조정 |
|------|------|-----------|-------------|
| **Balanced** | 30% | 무난한 BPA + 적당한 Need | 기본값 (모든 가중치 1.0×) |
| **Win-Now** | 20% | 높은 OVR 극단 선호, 나이 무관 | OVR 가중치 1.3×, 나이 보정 0.7× |
| **Youth-Builder** | 15% | 25세 이하 젊은 선수 선호 | 나이 가중치 1.5×, OVR 가중치 0.85× |
| **Defense-First** | 15% | 수비 역할(perimLock, rimProtector) 선호 | 수비 역할 보너스 +8 |
| **Offense-First** | 10% | 공격 역할(spacer, handler, isoScorer) 선호 | 공격 역할 보너스 +8 |
| **Star-Hunter** | 10% | OVR 85+ 스타에 올인, 나머지 라운드는 BPA | 스타 보너스 +15 (OVR 85+일 때) |

```typescript
type GmPersonality = 'balanced' | 'winNow' | 'youthBuilder' | 'defenseFirst' | 'offenseFirst' | 'starHunter';

interface GmProfile {
    personality: GmPersonality;
    ovrWeight: number;       // 기본 1.0
    ageWeight: number;       // 기본 1.0
    archetypeBias: Partial<Record<keyof ArchetypeRatings, number>>; // 역할별 추가 보너스
    starBonus: number;       // OVR 85+ 추가 점수 (기본 0)
}

function assignGmProfiles(teamIds: string[], userTeamId: string): Map<string, GmProfile> {
    const profiles = new Map<string, GmProfile>();
    const personalities: GmPersonality[] = [
        ...Array(9).fill('balanced'),      // 30%
        ...Array(6).fill('winNow'),        // 20%
        ...Array(5).fill('youthBuilder'),  // 15%
        ...Array(5).fill('defenseFirst'),  // 15%
        ...Array(3).fill('offenseFirst'),  // 10%
        ...Array(3).fill('starHunter'),    // 10% (총 31개, 셔플 후 29개 사용)
    ];
    shuffle(personalities);

    let idx = 0;
    for (const teamId of teamIds) {
        if (teamId === userTeamId) continue; // 유저 팀은 건너뜀
        profiles.set(teamId, createProfile(personalities[idx++]));
    }
    return profiles;
}
```

---

#### 2. 선수 평가 점수 (Player Draft Score)

모든 가용 선수에 대해 **복합 점수**를 계산합니다.

```
DraftScore = (OVR점수 × ovrW) + (나이점수 × ageW) + (포지션니즈 점수) + (역할니즈 점수) + (성향 보너스) + (랜덤 노이즈)
```

##### 2-1. OVR 점수 (0~100 스케일)

선수의 OVR을 그대로 사용하되, **비선형 곡선**으로 스타급과 일반 선수의 격차를 강조합니다.

```typescript
function calcOvrScore(ovr: number): number {
    // 90+ → 100점, 80 → ~73점, 70 → ~51점, 60 → ~34점
    return Math.pow(ovr / 99, 2) * 100;
}
```

| OVR | 점수 | 설명 |
|-----|------|------|
| 95 | 92 | 프랜차이즈 스타 |
| 90 | 83 | 올스타급 |
| 85 | 74 | 핵심 스타터 |
| 80 | 65 | 견실한 스타터 |
| 75 | 57 | 로테이션 |
| 70 | 50 | 벤치 |
| 65 | 43 | 엔드벤치 |

##### 2-2. 나이 점수

실제 NBA GM처럼 나이에 따른 가치를 반영합니다.

```typescript
function calcAgeScore(age: number): number {
    if (age <= 22) return 12;  // 유망주 프리미엄
    if (age <= 25) return 8;   // 프라임 진입
    if (age <= 28) return 5;   // 피크 연령
    if (age <= 30) return 2;   // 쇠퇴 시작
    if (age <= 33) return -3;  // 고령 패널티
    return -8;                 // 34세+ 대폭 감점
}
```

##### 2-3. 포지션 니즈 점수 (Position Need Score)

현재 로스터의 포지션 분포를 분석해 부족한 포지션에 보너스를 줍니다.

```
목표 분포: PG=3, SG=3, SF=3, PF=3, C=3 (총 15명)
```

```typescript
function calcPositionNeedScore(
    position: string,
    roster: Player[],
    round: number
): number {
    const TARGET: Record<string, number> = { PG: 3, SG: 3, SF: 3, PF: 3, C: 3 };
    const counts: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    roster.forEach(p => { counts[p.position] = (counts[p.position] || 0) + 1; });

    const deficit = TARGET[position] - (counts[position] || 0);

    if (deficit <= 0) return -5;  // 이미 충분 → 감점

    // 라운드가 진행될수록 니즈 가중치 증가 (초반: 약한 영향, 후반: 강한 영향)
    const roundMultiplier = 1 + (round - 1) * 0.15; // R1: 1.0, R8: 2.05, R15: 3.1

    return deficit * 4 * roundMultiplier;
    // deficit=3(0명 보유) → R1: +12, R8: +24.6, R15: +37.2
    // deficit=1(2명 보유) → R1: +4,  R8: +8.2,  R15: +12.4
}
```

##### 2-4. 역할 니즈 점수 (Role Need Score)

기존 `archetypeSystem.ts`의 12종 역할을 활용합니다. 팀에 부족한 **역할**을 파악하여 해당 역할을 잘 수행할 선수에게 보너스를 줍니다.

```typescript
// 팀에 필요한 역할 구성 (이상적 로스터)
const ARCHETYPE_TARGETS: Record<string, { min: number; ideal: number }> = {
    handler:      { min: 1, ideal: 2 },  // 핸들러 (PG 역할)
    spacer:       { min: 2, ideal: 4 },  // 슈터 (가장 많이 필요)
    driver:       { min: 1, ideal: 2 },  // 드라이버
    rimProtector: { min: 1, ideal: 1 },  // 림프로텍터 (핵심 1명)
    perimLock:    { min: 1, ideal: 2 },  // 수비 스페셜리스트
    rebounder:    { min: 1, ideal: 2 },  // 리바운더
    roller:       { min: 0, ideal: 1 },  // 롤맨
    postScorer:   { min: 0, ideal: 1 },  // 포스트업
    isoScorer:    { min: 0, ideal: 1 },  // 아이솔레이션
    connector:    { min: 0, ideal: 1 },  // 커넥터 (글루가이)
    screener:     { min: 0, ideal: 1 },  // 스크리너
    popper:       { min: 0, ideal: 1 },  // 팝 슈터
};

function calcArchetypeNeedScore(player: Player, roster: Player[]): number {
    // 1. 선수의 역할 산출 (상위 3개)
    const playerArchetypes = calculatePlayerArchetypes(playerToLiveAttr(player));
    const topArchetypes = getTopArchetypes(playerArchetypes, 3); // [{name: 'spacer', score: 85}, ...]

    // 2. 현재 로스터의 역할 보유 현황 (역할 70+ 기준으로 카운트)
    const rosterArchetypeCounts = countRosterArchetypes(roster);

    // 3. 부족한 역할에 대한 보너스
    let bonus = 0;
    for (const { name, score } of topArchetypes) {
        const target = ARCHETYPE_TARGETS[name];
        if (!target) continue;

        const current = rosterArchetypeCounts[name] || 0;

        if (current < target.min) {
            // 최소 요건 미충족 → 강한 보너스
            bonus += (score / 100) * 10;  // 역할 점수 85 → +8.5
        } else if (current < target.ideal) {
            // 이상적 수준 미달 → 약한 보너스
            bonus += (score / 100) * 4;   // 역할 점수 85 → +3.4
        }
    }

    return bonus;
}
```

**역할 판정 기준**: 선수의 역할 점수가 **70 이상**이면 해당 역할을 수행할 수 있다고 판단합니다.

```typescript
function getTopArchetypes(ratings: ArchetypeRatings, n: number): { name: string; score: number }[] {
    return Object.entries(ratings)
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, n);
}

function countRosterArchetypes(roster: Player[]): Record<string, number> {
    const counts: Record<string, number> = {};
    roster.forEach(player => {
        const archetypes = calculatePlayerArchetypes(playerToLiveAttr(player));
        Object.entries(archetypes).forEach(([name, score]) => {
            if (score >= 70) {
                counts[name] = (counts[name] || 0) + 1;
            }
        });
    });
    return counts;
}
```

##### 2-5. GM 성향 보너스

GM Personality에 따른 추가 점수입니다.

```typescript
function calcPersonalityBonus(player: Player, profile: GmProfile): number {
    let bonus = 0;

    // Star Hunter: OVR 85+ 대폭 추가점
    if (player.ovr >= 85) bonus += profile.starBonus;

    // 역할 편향 (defenseFirst, offenseFirst 등)
    const archetypes = calculatePlayerArchetypes(playerToLiveAttr(player));
    for (const [archName, biasBonus] of Object.entries(profile.archetypeBias)) {
        const score = archetypes[archName as keyof ArchetypeRatings];
        if (score >= 70) bonus += biasBonus;
    }

    return bonus;
}
```

##### 2-6. 랜덤 노이즈

결정론적 결과를 방지하는 노이즈입니다. 라운드가 후반으로 갈수록 노이즈 범위가 커져 예측 불가능성이 증가합니다.

```typescript
function calcNoise(round: number): number {
    const baseNoise = 6;
    const roundScale = 1 + (round - 1) * 0.1; // R1: 1.0, R8: 1.7, R15: 2.4
    const range = baseNoise * roundScale;
    return (Math.random() - 0.5) * 2 * range;
    // R1: -6 ~ +6,  R8: -10.2 ~ +10.2,  R15: -14.4 ~ +14.4
}
```

---

#### 3. 최종 점수 계산 및 선택

```typescript
function cpuSelectPlayer(
    availablePlayers: Player[],
    teamRoster: Player[],
    round: number,
    gmProfile: GmProfile
): Player {
    const scored = availablePlayers.map(player => {
        const ovrScore    = calcOvrScore(player.ovr) * gmProfile.ovrWeight;
        const ageScore    = calcAgeScore(player.age) * gmProfile.ageWeight;
        const posNeed     = calcPositionNeedScore(player.position, teamRoster, round);
        const archNeed    = calcArchetypeNeedScore(player, teamRoster);
        const personality = calcPersonalityBonus(player, gmProfile);
        const noise       = calcNoise(round);

        return {
            player,
            total: ovrScore + ageScore + posNeed + archNeed + personality + noise,
            breakdown: { ovrScore, ageScore, posNeed, archNeed, personality, noise }
        };
    });

    scored.sort((a, b) => b.total - a.total);

    // 상위 3명 중 가중 랜덤 선택 (1위 50%, 2위 30%, 3위 20%)
    const topN = Math.min(3, scored.length);
    const weights = [0.50, 0.30, 0.20];
    const roll = Math.random();
    let cumulative = 0;
    for (let i = 0; i < topN; i++) {
        cumulative += weights[i];
        if (roll < cumulative) return scored[i].player;
    }
    return scored[0].player;
}
```

**점수 구성 예시 (라운드 1, Win-Now GM):**

| 선수 | OVR점수(×1.3) | 나이(×0.7) | 포지션니즈 | 역할니즈 | 성향보너스 | 노이즈 | **합계** |
|------|-------------|----------|-----------|------------|----------|-------|---------|
| A (OVR 95, 28세, PG) | 119.6 | 3.5 | +4 | +5.2 | 0 | +2.1 | **134.4** |
| B (OVR 92, 23세, C) | 107.9 | 5.6 | +12 | +8.5 | 0 | -1.3 | **132.7** |
| C (OVR 88, 22세, SF) | 97.2 | 8.4 | +8 | +3.4 | 0 | +4.8 | **121.8** |

---

#### 4. 하드 플로어 규칙 (Hard Floor Rules)

성향과 점수에 관계없이 반드시 지켜야 하는 최소 로스터 요건입니다. 이 규칙은 **라운드 11 이후** 발동됩니다 (남은 4픽으로 빈 포지션 채워야 할 때).

```typescript
function applyHardFloor(
    availablePlayers: Player[],
    teamRoster: Player[],
    round: number
): Player[] | null {
    if (round < 11) return null; // 초반엔 발동 안 함

    const remainingPicks = 15 - teamRoster.length;
    const counts: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    teamRoster.forEach(p => { counts[p.position] = (counts[p.position] || 0) + 1; });

    // 각 포지션 최소 1명 필요 → 빈 포지션이 남은 픽 수와 같거나 크면 강제 지정
    const emptyPositions = Object.entries(counts)
        .filter(([_, count]) => count === 0)
        .map(([pos]) => pos);

    if (emptyPositions.length >= remainingPicks) {
        // 강제: 빈 포지션 중 하나에서 최고 OVR 선수 선택
        const forcedPosition = emptyPositions[0];
        return availablePlayers.filter(p => p.position === forcedPosition);
    }

    return null; // 일반 로직 사용
}
```

**하드 플로어 규칙 요약:**
| 조건 | 행동 |
|------|------|
| 라운드 11+, 빈 포지션 수 ≥ 남은 픽 수 | 빈 포지션에서만 선택 가능 (강제) |
| 라운드 13+, 특정 포지션 0명 | 해당 포지션 선수 중 최고 OVR 강제 지명 |
| 라운드 15, 여전히 빈 포지션 | 무조건 해당 포지션 선수 지명 |

---

#### 5. 라운드별 전략 시프트 (Round Strategy)

```
초반 (R1~R5):  BPA 중심. OVR 최우선. 포지션/역할 니즈는 약한 참고용.
중반 (R6~R10): BPA와 Need 균형. 포지션 배분 시작. 역할 갭 보충.
후반 (R11~R15): Need 중심. 빈 포지션 강제 채움. 하드 플로어 발동.
```

이 시프트는 `calcPositionNeedScore`의 `roundMultiplier`와 `calcNoise`의 `roundScale`에 이미 내장되어 있습니다:

| 라운드 | posNeed 배율 | 노이즈 범위 | 실질 전략 |
|--------|-------------|------------|----------|
| R1 | ×1.0 | ±6 | OVR 95 vs OVR 88+니즈12 → OVR 승리 |
| R5 | ×1.6 | ±8.4 | OVR 82 vs OVR 78+니즈19 → 니즈 경쟁 |
| R10 | ×2.35 | ±11.4 | OVR 75 vs OVR 70+니즈28 → 니즈 승리 |
| R15 | ×3.1 | ±14.4 | 하드 플로어 강제 발동 가능 |

---

#### 6. 전체 흐름도

```
cpuSelectPlayer(availablePlayers, teamRoster, round, gmProfile)
│
├─ [1] applyHardFloor() → 강제 포지션 제한 체크 (R11+)
│     ├─ 강제 필요? → 해당 포지션 풀에서만 최고 OVR 선택 → 즉시 반환
│     └─ 강제 불필요? → 계속
│
├─ [2] 전체 가용 선수 스코어링
│     ├─ OVR 점수 (비선형 곡선) × gmProfile.ovrWeight
│     ├─ 나이 점수 (-8 ~ +12) × gmProfile.ageWeight
│     ├─ 포지션 니즈 점수 (라운드 가중)
│     ├─ 역할 니즈 점수 (12종 역할 기반)
│     ├─ GM 성향 보너스 (스타보너스, 역할 편향)
│     └─ 랜덤 노이즈 (라운드 확대)
│
├─ [3] 점수 상위 3명 추출
│
└─ [4] 가중 랜덤 선택 (50% / 30% / 20%)
       └─ 최종 지명 선수 반환
```

---

#### 7. 예상 결과물 (시뮬레이션 예측)

| 지표 | 기대값 |
|------|--------|
| 팀당 평균 OVR | 74~78 (30팀 평균) |
| 포지션 분포 | PG 2~4, SG 2~4, SF 2~4, PF 2~4, C 2~3 |
| 빈 포지션 팀 수 | 0 (하드 플로어 보장) |
| 스타 선수(85+) 편중 | 상위 5~8픽 팀에 분산 (snake 특성상 균등) |
| 드래프트 결과 다양성 | 동일 시드에서도 70%+ 상이한 결과 (랜덤+성향) |

---

#### 8. 함수 시그니처 요약

```typescript
// services/draft/cpuDraftAI.ts

export type GmPersonality = 'balanced' | 'winNow' | 'youthBuilder' | 'defenseFirst' | 'offenseFirst' | 'starHunter';

export interface GmProfile { ... }

// 메인 엔트리
export function cpuSelectPlayer(
    availablePlayers: Player[],
    teamRoster: Player[],
    round: number,
    gmProfile: GmProfile
): Player;

// GM 프로필 생성
export function assignGmProfiles(
    teamIds: string[],
    userTeamId: string
): Map<string, GmProfile>;

// 내부 스코어링 (export for testing)
export function calcOvrScore(ovr: number): number;
export function calcAgeScore(age: number): number;
export function calcPositionNeedScore(position: string, roster: Player[], round: number): number;
export function calcArchetypeNeedScore(player: Player, roster: Player[]): number;
export function calcPersonalityBonus(player: Player, profile: GmProfile): number;
export function applyHardFloor(available: Player[], roster: Player[], round: number): Player[] | null;
```

---

## 저장/복원 전략

### DB 변경
```sql
ALTER TABLE saves ADD COLUMN IF NOT EXISTS draft_state JSONB DEFAULT NULL;
```

### `services/persistence.ts` 변경
- `saveCheckpoint()`에 `draft_state` 파라미터 추가
- upsert payload에 포함

### `services/stateReplayer.ts` 변경
- `applyFantasyDraft(teams, picks)` 함수 추가:
  1. 모든 팀 로스터 비우기
  2. 전체 선수를 ID Map으로 변환
  3. picks 순서대로 선수를 해당 팀 roster에 push
- 트랜잭션 루프에 `type === 'FantasyDraft'` 케이스 추가

### Draft 완료 시 저장 항목
1. `saves.draft_state` → `{ status: 'completed', picks: [...] }`
2. `user_transactions` → 단일 FantasyDraft 트랜잭션 (date: '2025-10-20')
3. `saves.tactics` → generateAutoTactics() 결과
4. `saves.team_id`, `saves.sim_date` → 기존 방식 동일

### 중단 복원
- 유저 픽 완료할 때마다 `saveCheckpoint({ draft_state })` 호출
- CPU 픽은 라운드 완료 시점에 일괄 저장
- 브라우저 새로고침 → `initializeGame()`에서 `checkpoint.draft_state.status === 'in_progress'` 감지 → FantasyDraftView 렌더

---

## `hooks/useGameData.ts` 변경

### 새로운 state/함수
| 항목 | 설명 |
|------|------|
| `draftState` / `setDraftState` | DraftState \| null |
| `initializeDraftMode(teamId)` | myTeamId 설정, 로스터 비우기, 드래프트 풀 생성, draftState 초기화 |
| `handleDraftPick(playerId)` | 유저 픽 처리 → advanceDraft → CPU 연속 픽 실행 → save |
| `finalizeDraft(draftedTeams)` | 로스터 확정, 전술 생성, FantasyDraft 트랜잭션 기록, checkpoint 저장 |

### initializeGame() 수정
```
if (checkpoint.draft_state?.status === 'in_progress') {
    // 드래프트 재개: myTeamId만 설정, FantasyDraftView로 전환
    setDraftState(checkpoint.draft_state);
    setMyTeamId(checkpoint.team_id);
    return;
}
```

### handleResetData() 수정
- `setDraftState(null)` 추가

---

## `App.tsx` 변경

```tsx
// OnboardingView 가드 아래에 추가 (line ~94 이후)
if ((view as string) === 'FantasyDraft' && myTeam) {
    return (
        <div className="fixed inset-0 z-[500]">
            <FantasyDraftView
                teams={gameData.teams}
                myTeamId={gameData.myTeamId!}
                draftState={gameData.draftState}
                onDraftPick={gameData.handleDraftPick}
                onDraftComplete={async () => {
                    await gameData.finalizeDraft();
                    setView('Onboarding');
                }}
            />
        </div>
    );
}
```

`handleSelectTeamAndOnboard` → `handleSelectTeamAndStartDraft`로 변경:
```tsx
const handleSelectTeamAndStartDraft = useCallback(async (teamId: string) => {
    setView('FantasyDraft' as any);
    await gameData.initializeDraftMode(teamId);
}, [gameData]);
```

---

## UI 구조: `views/FantasyDraftView.tsx`

> **디자인 원칙**: LiveGameView와 동일한 **플랫/컴팩트/정보밀도 우선** 스타일.
> 카드 형태 UI 금지. 얇은 보더로 영역 분리. 패딩 최소화. 폰트 작게.
> `rounded-3xl` 사용 안 함. 최대 `rounded-lg`. 스크롤바 숨김.

### 전체 레이아웃 (전체화면 `fixed inset-0 z-[500]`)

```
┌─────────────────────────────────────────────────────────────────────┐
│ DraftHeader (h-10, shrink-0)  ROUND 1 · #1 Overall · [팀] · ⏩    │
│ [======================== 진행률 h-0.5 ============================]│
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ DraftBoard (flex-[boardRatio], overflow-auto, 드래그로 높이 조절)   │
│ <table border-collapse>                                             │
│ ┌──────┬─────┬─────┬─────┬─ ··· ─┬─────┐                          │
│ │      │ R1  │ R2  │ R3  │       │ R15 │  sticky top              │
│ ├──────┼─────┼─────┼─────┤       ├─────┤                          │
│ │ BOS  │95 A │82 B │     │       │     │  h-8 per row            │
│ │★LAL │94 C │     │     │       │     │  sticky left col        │
│ │ GSW  │93 D │     │     │       │     │                          │
│ └──────┴─────┴─────┴─────┴───────┴─────┘                          │
│                                                                     │
│ ═══════════ 드래그 디바이더 (h-1.5, cursor-row-resize) ════════════ │
│                                                                     │
├──────────────┬──────────────────────────────┬───────────────────────┤
│ PickHistory  │ PlayerPool (중앙)             │ MyRoster (우측)       │
│ w-[25%]      │ flex-1                        │ w-[25%]               │
│              │                               │                       │
│ #1 BOS       │ [검색] [All|PG|SG|SF|PF|C]   │ PG ─────────         │
│ 95 선수A PG  │                               │ 95 선수A              │
│ #2 LAL       │ OVR│Name    │Pos│Age│INS│OUT..│ 78 선수H              │
│ 94 선수C SG  │ 87 │선수E   │PF │24 │82 │75..│ SG ─────────         │
│ #3 GSW       │ 85 │선수F   │ C │27 │90 │55..│ 88 선수C              │
│ 93 선수D SF  │ 83 │선수G   │SG │22 │78 │82..│ ─────────            │
│ ···          │                               │ 3/15 · Avg 82        │
│              │ [선택시: 인라인 상세 + 지명]    │                       │
└──────────────┴──────────────────────────────┴───────────────────────┘
```

### LiveGameView 스타일 규칙 (전 컴포넌트 공통 적용)

| 항목 | 패턴 | 기존 디자인시스템과의 차이 |
|------|------|--------------------------|
| **패딩** | `px-2 py-1` (행), `px-3 py-2` (섹션헤더) | 카드의 `p-6` 대신 최소 패딩 |
| **폰트** | `text-xs` (본문), `text-[10px]` (라벨), `text-[9px]` (서브라벨) | `text-sm`/`text-base` 사용 안 함 |
| **보더** | `border-b border-slate-800` 또는 `border-slate-800/50` | 두꺼운 카드 보더 대신 얇은 구분선 |
| **배경** | `bg-slate-950` (기본), `bg-slate-900/80` (약간 부각) | `bg-slate-900 rounded-3xl` 카드 사용 안 함 |
| **둥근모서리** | `rounded-md` (버튼), `rounded-lg` (컨트롤) — 최대 `rounded-lg` | `rounded-3xl`, `rounded-2xl` 사용 안 함 |
| **간격** | `gap-x-0.5` (그리드 내), `gap-1`~`gap-1.5` (요소 간) | `gap-4`~`gap-6` 대신 타이트 |
| **스크롤바** | `style={{ scrollbarWidth: 'none' }}` 숨김 | `custom-scrollbar` 보다 더 미니멀 |
| **행 높이** | `h-8` (32px) 기본, `h-6` (24px) 컴팩트 | 기존 테이블 행 높이보다 작게 |

---

### 영역별 상세

#### A. DraftHeader (`components/draft/DraftHeader.tsx`)

**한 줄짜리 플랫 바** — LiveGameView의 ScoreBar처럼 최소 높이로 정보 압축.

구조: `shrink-0 bg-slate-950 border-b border-slate-800 px-3 py-1.5`
```
flex items-center justify-between h-10
├─ Left:  "ROUND 1" (oswald font-black text-xs uppercase) · "PICK #1" (text-[10px] text-slate-400)
├─ Center: [팀로고 20px] 팀이름 (text-xs font-bold) + 유저턴시 "YOUR PICK" (text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-sm animate-pulse)
├─ Right:  "23/450" (text-[10px] text-slate-500 font-mono) + [⏩ 빨리감기] (px-2 py-0.5 rounded-md bg-slate-800 hover:bg-indigo-600 text-[10px])
└─ 진행률 바: absolute bottom-0 left-0 h-0.5 bg-indigo-600 (진행률 % 너비)
```

#### B. DraftBoard (`components/draft/DraftBoard.tsx`)

**`<table>` 기반 엑셀 그리드** — LiveGameView의 Rotation Table과 동일한 접근.

구조: `flex-1 min-h-0 overflow-auto` (스크롤바 숨김)
```html
<table className="border-collapse text-[10px]">
  <!-- 헤더 -->
  <thead className="sticky top-0 z-20 bg-slate-950">
    <tr>
      <th className="sticky left-0 z-30 bg-slate-950 min-w-[110px] px-2 py-1 text-left font-bold text-slate-500 text-[9px] uppercase">Team</th>
      <th className="min-w-[100px] px-1 py-1 text-center font-bold text-slate-500">R1</th>
      <!-- ... R15 -->
    </tr>
  </thead>
  <tbody>
    <tr className="h-8 border-b border-slate-800/30 hover:bg-white/[0.02]">
      <td className="sticky left-0 bg-slate-950 px-2 py-1 flex items-center gap-1.5">
        <img src={logo} className="w-4 h-4" /> <span className="text-xs font-semibold text-slate-300 truncate">BOS</span>
      </td>
      <td className="px-1 py-0.5 text-center">
        <!-- 완료된 픽 셀 -->
        <div className="text-xs font-bold text-slate-200">95</div>
        <div className="text-[9px] text-slate-500 truncate">르브론</div>
      </td>
    </tr>
  </tbody>
</table>
```

셀 상태:
| 상태 | 스타일 |
|------|--------|
| 빈 셀 | `bg-transparent` (보더만 `border-slate-800/20`) |
| 완료된 픽 | `bg-slate-900/50` — OVR(text-xs font-bold) + 이름(text-[9px] truncate) |
| 현재 픽 | `bg-indigo-500/10 ring-1 ring-indigo-500` |
| 유저 팀 행 | 좌측 `border-l-2 border-[teamColor]` + 행 배경 `bg-[teamColor]/5` |

유저 팀 행 강조: `TEAM_DATA[userTeamId].colors.primary` 사용
현재 라운드 열 자동 스크롤: `scrollIntoView({ behavior: 'smooth', inline: 'center' })`

##### 높이 조절 (Resizable Divider)

```typescript
const [boardRatio, setBoardRatio] = useState(45); // %
```
디바이더: `h-1.5 bg-slate-800/80 hover:bg-indigo-600/50 cursor-row-resize flex items-center justify-center`
+ `GripHorizontal` 아이콘 (lucide, `w-4 h-3 text-slate-600`)
최소 30% / 최대 70%

---

#### C. 하단 3컬럼 (`flex overflow-hidden`)

전체: `flex flex-1 min-h-0 overflow-hidden`

##### C-1. PickHistory (좌측 `w-[25%] border-r border-slate-800`)
`components/draft/PickHistory.tsx`

LiveGameView의 PBP Log 패턴 — 최신 픽부터 역순, 슬림 행.

```
<div className="flex flex-col h-full bg-slate-950">
  <!-- 헤더 (shrink-0) -->
  <div className="px-2 py-1.5 border-b border-slate-800 shrink-0">
    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">PICK HISTORY</span>
  </div>
  <!-- 스크롤 영역 -->
  <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
    <!-- 각 엔트리: h-8 -->
    <div className="px-2 py-1 border-b border-slate-800/30 flex items-center gap-2">
      <span className="text-[9px] text-slate-600 font-mono w-6 shrink-0">#1</span>
      <img src={logo} className="w-3.5 h-3.5 shrink-0" />
      <span className="text-xs font-bold text-slate-200 truncate flex-1">선수A</span>
      <span className="text-[10px] font-bold text-indigo-400">95</span>
      <span className="text-[9px] text-slate-500">PG</span>
    </div>
  </div>
</div>
```

최신 엔트리: `bg-indigo-500/5` 하이라이트
자동 스크롤: `scrollIntoView({ behavior: 'smooth' })`

##### C-2. PlayerPool (중앙 `flex-1 border-r border-slate-800`)
`components/draft/PlayerPool.tsx`

선수 검색 + 필터 + 테이블 + 인라인 상세 + 지명 버튼.

**상단 툴바** (`shrink-0 px-2 py-1.5 border-b border-slate-800 flex items-center gap-2`):
```
[🔍 input (bg-slate-900 border-slate-800 rounded-md px-2 py-1 text-xs w-40)]
[All|PG|SG|SF|PF|C] (text-[10px] px-1.5 py-0.5 rounded-md — 비활성: bg-transparent text-slate-500, 활성: bg-indigo-600 text-white)
```

**선수 테이블** (`flex-1 min-h-0 overflow-y-auto`, 스크롤바 숨김):
```html
<table className="w-full border-collapse text-xs">
  <thead className="sticky top-0 z-10 bg-slate-950">
    <tr className="text-[9px] font-black uppercase text-slate-500">
      <th className="px-2 py-1 text-left w-8">OVR</th>
      <th className="px-2 py-1 text-left">NAME</th>
      <th className="px-1 py-1 text-center w-8">POS</th>
      <th className="px-1 py-1 text-center w-8">AGE</th>
      <th className="px-1 py-1 text-center w-8">INS</th>
      <th className="px-1 py-1 text-center w-8">OUT</th>
      <th className="px-1 py-1 text-center w-8">ATH</th>
      <th className="px-1 py-1 text-center w-8">PLM</th>
      <th className="px-1 py-1 text-center w-8">DEF</th>
      <th className="px-1 py-1 text-center w-8">REB</th>
    </tr>
  </thead>
  <tbody>
    <tr className="h-7 border-b border-slate-800/20 hover:bg-white/[0.03] cursor-pointer">
      <td className="px-2 py-0.5 font-bold text-slate-200">87</td>
      <td className="px-2 py-0.5 font-semibold text-slate-200 truncate max-w-[120px]">선수 E</td>
      <td className="px-1 py-0.5 text-center text-slate-400">PF</td>
      <td className="px-1 py-0.5 text-center text-slate-400 font-mono">24</td>
      <!-- 6카테 값: colorScale 적용 (90+: text-fuchsia-400, 80+: text-emerald-400, 70+: text-amber-400, <70: text-slate-500) -->
      <td className="px-1 py-0.5 text-center font-mono text-emerald-400">82</td>
      ...
    </tr>
  </tbody>
</table>
```

**선택된 선수 인라인 상세** (테이블 행 클릭 시 바로 아래 확장):
```
<tr className="bg-slate-900/60 border-b border-indigo-500/30">
  <td colSpan={10} className="px-3 py-2">
    <div className="flex items-center gap-3">
      <OvrBadge ovr={87} size="md" />
      <div>
        <div className="text-xs font-bold text-slate-200">선수 E</div>
        <div className="text-[10px] text-slate-400">PF · 24세 · 198cm · 98kg</div>
      </div>
      <div className="flex-1" />
      <!-- 6카테 미니 바 (inline flex) -->
      <div className="flex gap-1.5">
        <span className="text-[9px] text-slate-500">INS<b className="text-emerald-400 ml-0.5">82</b></span>
        <span className="text-[9px] text-slate-500">OUT<b className="text-amber-400 ml-0.5">75</b></span>
        ...
      </div>
      <button className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase ml-2"
              disabled={!isMyTurn}>
        DRAFT
      </button>
    </div>
  </td>
</tr>
```
지명 버튼 비활성 시: `opacity-40 cursor-not-allowed`

##### C-3. MyRoster (우측 `w-[25%]`)
`components/draft/MyRoster.tsx`

포지션별 슬림 리스트 — LiveGameView의 OnCourtPanel 패턴.

```
<div className="flex flex-col h-full bg-slate-950">
  <!-- 헤더 -->
  <div className="px-2 py-1.5 border-b border-slate-800 shrink-0 flex items-center justify-between">
    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">MY ROSTER</span>
    <span className="text-[10px] text-slate-400 font-mono">3/15</span>
  </div>
  <!-- 스크롤 영역 -->
  <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
    <!-- 포지션 그룹 -->
    <div className="text-[9px] font-bold uppercase text-slate-600 bg-slate-900/50 px-2 py-0.5 border-b border-slate-800/30">PG</div>
    <!-- 선수 행 -->
    <div className="px-2 py-1 border-b border-slate-800/20 flex items-center gap-1.5">
      <span className="text-[10px] font-bold text-indigo-400 w-6 text-right">95</span>
      <span className="text-xs font-semibold text-slate-200 truncate">선수A</span>
    </div>
    <!-- 빈 슬롯 -->
    <div className="px-2 py-1 border-b border-slate-800/20 text-[10px] text-slate-700 italic">— empty —</div>
  </div>
  <!-- 푸터 -->
  <div className="px-2 py-1 border-t border-slate-800 shrink-0 text-[10px] text-slate-500">
    Avg OVR <b className="text-slate-300">82.5</b>
  </div>
</div>
```

포지션 그룹 순서: PG → SG → SF → PF → C
최신 추가 선수: `bg-emerald-500/5` 하이라이트 (1초 후 fade)

---

### CPU 픽 애니메이션

- CPU 픽: **400ms 딜레이** → DraftBoard 셀에 값 출현 (opacity transition)
- PickHistory에 동시 추가 (push to top)
- 연속 CPU 픽 **10개 이상** 시 DraftHeader에 `⏩` 버튼 표시 → 클릭 시 CPU 픽 즉시 완료
- 현재 픽 셀: `ring-1 ring-indigo-500 bg-indigo-500/10`
- 유저 턴 도달: DraftHeader에 `YOUR PICK` 배지 + PlayerPool 테이블 행 클릭 활성화

### 디자인 요약 (LiveGameView 스타일)

- **플랫 레이어링**: 카드 없음 → 보더(`border-slate-800`)로 영역 분리
- **최소 패딩**: `px-2 py-1` 기본. 큰 패딩 없음
- **작은 폰트**: `text-xs` 최대. 라벨은 `text-[10px]`~`text-[9px]`
- **최소 둥근모서리**: 버튼/인풋만 `rounded-md`. 컨테이너에 둥근모서리 없음
- **숨긴 스크롤바**: `scrollbarWidth: 'none'`
- **플렉스 레이아웃**: `flex flex-col h-screen` → `shrink-0`(고정) + `flex-1 min-h-0`(스크롤)
- **OvrBadge 재사용**: 인라인 상세에서만 `size="md"`. 테이블/리스트에서는 순수 텍스트 OVR
- **attribute colorScale**: 90+: `text-fuchsia-400`, 80+: `text-emerald-400`, 70+: `text-amber-400`, <70: `text-slate-500`
- **팀 색상**: `TEAM_DATA[teamId].colors` — 유저 팀 행 좌측 보더 + 배경 글로우

### 컴포넌트 파일 목록

| 파일 | 역할 |
|------|------|
| `views/FantasyDraftView.tsx` | 메인 컨테이너 — `flex flex-col h-screen` + 리사이즈 + 드래프트 루프 |
| `components/draft/DraftHeader.tsx` | 상단 플랫바 h-10: 라운드/픽/현재팀/빨리감기/진행률 |
| `components/draft/DraftBoard.tsx` | `<table>` 엑셀 그리드: 30팀×15라운드 + sticky 헤더/컬럼 |
| `components/draft/PickHistory.tsx` | 좌측 w-[25%]: 슬림 픽 로그 (역순) |
| `components/draft/PlayerPool.tsx` | 중앙 flex-1: 검색/필터/테이블/인라인상세/지명 |
| `components/draft/MyRoster.tsx` | 우측 w-[25%]: 포지션별 슬림 로스터 현황 |

---

## 445명 < 450픽 문제 처리

- 15라운드 × 30팀 = 450픽이지만 선수는 445명
- **해결**: `availablePlayers.length === 0`이면 드래프트 조기 종료
- 마지막 5개 픽의 팀은 14명 로스터 (현실적으로 수용 가능)
- 드래프트 순서가 snake이므로 마지막 라운드 후반의 팀들(1~5번 순서 팀)이 14명

---

## 멀티플레이어 확장 포인트

현재 구현에서 미래 확장을 위해 분리해둘 인터페이스:

```typescript
interface DraftController {
    submitPick(playerId: string): Promise<void>;
    onPickMade: (pick: DraftPick) => void;
    getCurrentPickTeamId(): string;
    isMyTurn(): boolean;
}
```

- 현재: `SinglePlayerDraftController` (in-memory, CPU 동기 처리)
- 미래: `MultiplayerDraftController` (Supabase Realtime 구독, Edge Function으로 픽 제출)
- `FantasyDraftView`는 DraftController만 의존 → 싱글/멀티 전환 시 View 변경 불필요

---

## 구현 순서 (5단계)

### Phase 1: 타입 & 엔진 (UI 없음)
1. `types/draft.ts` 생성
2. `types/app.ts`에 `'FantasyDraft'` 추가
3. Transaction type에 `'FantasyDraft'` 추가
4. `services/draft/draftEngine.ts` 생성
5. `services/draft/cpuDraftAI.ts` 생성

### Phase 2: 저장/복원 레이어
6. SQL: saves 테이블에 `draft_state JSONB` 컬럼 추가
7. `services/persistence.ts` 수정 (draft_state 파라미터)
8. `services/stateReplayer.ts` 수정 (applyFantasyDraft)

### Phase 3: 상태 관리
9. `hooks/useGameData.ts` 수정 (draftState, initializeDraftMode, handleDraftPick, finalizeDraft)

### Phase 4: UI
10. `components/draft/DraftHeader.tsx` 생성 (상단 고정바)
11. `components/draft/DraftBoard.tsx` 생성 (엑셀 그리드 매트릭스)
12. `components/draft/PickHistory.tsx` 생성 (좌측 불렛틴)
13. `components/draft/PlayerPool.tsx` 생성 (중앙 검색/필터/테이블/지명)
14. `components/draft/MyRoster.tsx` 생성 (우측 로스터 현황)
15. `views/FantasyDraftView.tsx` 생성 (메인 레이아웃 + 리사이즈 + 드래프트 루프)

### Phase 5: 통합
16. `App.tsx` 수정 (FantasyDraft 가드 + 팀선택 플로우 변경)
17. E2E 테스트: 팀선택 → 드래프트 → 온보딩 → 대시보드 → 로스터 확인
18. 복원 테스트: 드래프트 중 브라우저 닫기 → 재접속 → 이어서 진행
19. 리셋 테스트: handleResetData → 드래프트 상태 초기화 확인

---

## 수정 대상 파일 요약

### 신규 생성 (9개)
| 파일 | 설명 |
|------|------|
| `types/draft.ts` | DraftPick, DraftState, DraftConfig, GmProfile 타입 |
| `services/draft/draftEngine.ts` | 드래프트 순서 생성, 풀 관리, 상태 진행 |
| `services/draft/cpuDraftAI.ts` | CPU 자동 지명 알고리즘 (GM 성향 시스템) |
| `views/FantasyDraftView.tsx` | 드래프트 메인 뷰 (전체화면 + 리사이즈 레이아웃) |
| `components/draft/DraftHeader.tsx` | 상단 고정바: 라운드/픽/타이머/진행률/빨리감기 |
| `components/draft/DraftBoard.tsx` | 엑셀 그리드: 30팀×15라운드 매트릭스 |
| `components/draft/PickHistory.tsx` | 좌측 25%: 불렛틴 스타일 픽 히스토리 |
| `components/draft/PlayerPool.tsx` | 중앙 flex-1: 검색/필터/테이블/인라인상세/지명 |
| `components/draft/MyRoster.tsx` | 우측 25%: 포지션별 실시간 로스터 현황 |

### 기존 수정 (5개)
| 파일 | 변경 내용 |
|------|-----------|
| `types/app.ts` | AppView에 `'FantasyDraft'` 추가 |
| `App.tsx` | FantasyDraft 전체화면 가드, 팀선택→드래프트 플로우 |
| `hooks/useGameData.ts` | draftState 상태, 드래프트 관련 함수 4개, 초기화 로직 수정 |
| `services/persistence.ts` | saveCheckpoint에 draft_state 파라미터 |
| `services/stateReplayer.ts` | applyFantasyDraft 함수 + FantasyDraft 트랜잭션 핸들러 |

### DB 마이그레이션 (1건)
```sql
ALTER TABLE saves ADD COLUMN IF NOT EXISTS draft_state JSONB DEFAULT NULL;
```

---

## 검증 방법

1. **드래프트 완료 테스트**: 팀 선택 → 15라운드 완료 → 모든 30팀 로스터 14-15명 확인
2. **CPU AI 검증**: CPU 팀 로스터에 포지션 편중 없는지 확인 (PG~C 각 2-4명)
3. **저장/복원**: 드래프트 7라운드 진행 → 브라우저 닫기 → 재접속 → 7라운드부터 재개
4. **stateReplayer**: 드래프트 완료 후 게임 진행 → 리로드 → 드래프트 결과 + 경기 결과 모두 정상 반영
5. **리셋**: 게임 리셋 → 드래프트부터 다시 시작 가능
6. **UI**: LiveGameView 스타일 준수 (플랫 레이아웃, 최소 패딩, text-xs, 카드 없음, 숨긴 스크롤바)
