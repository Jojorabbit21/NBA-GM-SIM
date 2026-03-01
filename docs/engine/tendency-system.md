# 텐던시 시스템 (Tendency System)

> 선수의 숨겨진 성격·플레이스타일·멘탈 특성을 정의하고 경기 시뮬레이션에 반영하는 시스템.
> 세이브파일마다 고유 시드로 445명 선수에게 13개 히든 텐던시를 배정하여 매 플레이스루를 독특하게 만든다.

---

## 1. 시스템 개요

텐던시는 **3단계 레이어**로 구성된다:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: PlayerTendencies (meta_players DB)                 │
│   zones (ShotZones), lateral_bias, touch, foul              │
│   → 모든 세이브에서 동일, DB에 저장                            │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: HiddenTendencies (player.id + player.name 해시)    │
│   hand (Right/Left), lateralBias (-1.0~+1.0)               │
│   → 모든 세이브에서 동일, 런타임 생성                          │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: SaveTendencies (tendency_seed + playerId 해시)     │
│   13개 텐던시 (멘탈 6 + 플레이스타일 5 + 성격 2)              │
│   → 세이브마다 다름, 런타임 생성, DB 저장 없음 (시드만 저장)    │
└─────────────────────────────────────────────────────────────┘
```

### 핵심 설계 원리

- **결정론적 생성**: `stringToHash(seed + playerId)` → `seededRandom()` → Box-Muller 정규분포
- **DB 저장 0**: 시드 1개(`tendency_seed TEXT`)만 `saves` 테이블에 저장
- **445명 × 13개 = 5,785개** 텐던시를 시드 하나로 재구성
- **하위호환**: 모든 접근에 `?.` + `?? defaultValue` → 레거시 세이브도 정상 동작

---

## 2. 타입 정의

### 2.1 PlayerTendencies (DB 데이터)

```typescript
// types/player.ts
interface ShotZones {
    ra: number;   // Restricted Area (골밑)
    itp: number;  // In The Paint (페인트 비-RA)
    mid: number;  // Mid-Range (중거리)
    cnr: number;  // Corner 3 (코너 3점)
    p45: number;  // 45° Wing 3 (날개 3점)
    atb: number;  // Above The Break (탑 3점)
}

interface PlayerTendencies {
    lateral_bias: number;  // 0: Strong Left, 1: Left, 2: Right, 3: Strong Right
    zones: ShotZones;      // 구역별 슈팅 빈도 분포
    touch?: number;
    foul?: number;
}
```

**용도**: PBP 엔진의 슈팅 구역 결정, 선수 프로필의 "선호 지역" 표시

### 2.2 HiddenTendencies (해시 기반)

```typescript
// types/player.ts
interface HiddenTendencies {
    hand: 'Right' | 'Left';   // 주 사용 손 (90% Right, 10% Left)
    lateralBias: number;       // -1.0 (왼쪽) ~ +1.0 (오른쪽)
}
```

**생성**: `generateHiddenTendencies(player)` → `player.id + player.name` 해시
**용도**: 선수 프로필의 "좌우 편향" 표시, PBP 엔진의 슈팅 구역 좌우 배분

### 2.3 SaveTendencies (세이브별 고유)

```typescript
// types/player.ts
interface SaveTendencies {
    // 멘탈 (6)
    clutchGene: number;              // -1.0~+1.0  클러치 히트레이트 ±3%
    consistency: number;             //  0.0~1.0   콜드스트릭 회복률
    confidenceSensitivity: number;   //  0.3~1.7   핫/콜드 진폭 배율
    composure: number;               // -1.0~+1.0  턴오버 확률 ±1%
    motorIntensity: number;          //  0.5~1.5   리바운드 확률 배율
    focusDrift: number;              //  0.0~1.0   피로 시 추가 히트레이트 감소

    // 플레이스타일 (5)
    shotDiscipline: number;          // -1.0~+1.0  히트레이트 ±1.5%
    defensiveMotor: number;          // -1.0~+1.0  수비 레이팅 ±3pt
    ballDominance: number;           //  0.5~1.5   액터 선택 가중치 배율
    foulProneness: number;           // -1.0~+1.0  파울 확률 ±2%
    playStyle: number;               // -1.0(패스)~+1.0(슛) 플레이 성향

    // 성격 (2)
    temperament: number;             // -1.0(냉정)~+1.0(다혈질)
    ego: number;                     // -1.0(겸손)~+1.0(자존심)
}
```

---

## 3. 생성 알고리즘

### 3.1 시드 해시 함수

```typescript
// utils/hiddenTendencies.ts
function stringToHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 32bit 정수 변환
    }
    return Math.abs(hash);
}
```

### 3.2 시드 기반 의사난수

```typescript
function seededRandom(seed: number): number {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);  // 0~1 사이 값
}
```

### 3.3 Box-Muller 정규분포

```typescript
function seededNormal(baseSeed, offset, mean, stdev, min, max): number {
    const u1 = Math.max(0.001, seededRandom(baseSeed + offset * 7));
    const u2 = seededRandom(baseSeed + offset * 7 + 1);
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return Math.max(min, Math.min(max, mean + z * stdev));
}
```

- `offset * 7`: 텐던시별 서로 다른 난수 시퀀스 보장
- `clamp(min, max)`: 극단값 방지

### 3.4 메인 생성 함수

```typescript
// utils/hiddenTendencies.ts:105
function generateSaveTendencies(tendencySeed: string, playerId: string): SaveTendencies {
    const baseSeed = stringToHash(tendencySeed + playerId);
    return {
        clutchGene:            seededNormal(baseSeed, 0,  0,   0.4,   -1.0, 1.0),
        consistency:           seededNormal(baseSeed, 1,  0.6, 0.15,   0.0, 1.0),
        confidenceSensitivity: seededNormal(baseSeed, 2,  1.0, 0.25,   0.3, 1.7),
        composure:             seededNormal(baseSeed, 3,  0,   0.35,  -1.0, 1.0),
        motorIntensity:        seededNormal(baseSeed, 4,  1.0, 0.2,    0.5, 1.5),
        focusDrift:            seededUniform(baseSeed, 5, 0.0, 1.0),  // 균등분포
        shotDiscipline:        seededNormal(baseSeed, 6,  0.1, 0.35,  -1.0, 1.0),
        defensiveMotor:        seededNormal(baseSeed, 7,  0,   0.4,   -1.0, 1.0),
        ballDominance:         seededNormal(baseSeed, 8,  1.0, 0.2,    0.5, 1.5),
        foulProneness:         seededNormal(baseSeed, 9,  0,   0.3,   -1.0, 1.0),
        playStyle:             seededNormal(baseSeed, 10, 0,   0.35,  -1.0, 1.0),
        temperament:           seededNormal(baseSeed, 11, 0,   0.35,  -1.0, 1.0),
        ego:                   seededNormal(baseSeed, 12, 0,   0.3,   -1.0, 1.0),
    };
}
```

### 3.5 기본값 (레거시 호환)

```typescript
const DEFAULT_TENDENCIES: SaveTendencies = {
    clutchGene: 0, consistency: 0.6, confidenceSensitivity: 1.0,
    composure: 0, motorIntensity: 1.0, focusDrift: 0.5,
    shotDiscipline: 0, defensiveMotor: 0, ballDominance: 1.0,
    foulProneness: 0, playStyle: 0, temperament: 0, ego: 0,
};
```

모든 값이 **중립** → 기존 엔진과 동일하게 동작

---

## 4. 시드 전달 경로 (Threading)

```
saves 테이블 (tendency_seed TEXT)
  ↓ loadCheckpoint()
hooks/useGameData.ts (tendencySeed state)
  ↓ gameData.tendencySeed
App.tsx → useSimulation(tendencySeed)
  ↓
services/simulation/userGameService.ts
  ↓ simulateGame(tendencySeed)
services/gameEngine.ts
  ↓ runFullGameSimulation(tendencySeed)
services/game/engine/pbp/main.ts
  ↓ createGameState(tendencySeed)
services/game/engine/pbp/liveEngine.ts
  ↓ initTeamState(team, tactics, depthChart, tendencySeed)
services/game/engine/pbp/initializer.ts
  ↓ generateSaveTendencies(tendencySeed, player.id)
LivePlayer.tendencies ← SaveTendencies 할당
```

### 시드 생성 시점

- **새 세이브**: 팀 선택 시 `crypto.randomUUID()` → `saves.tendency_seed`에 저장
- **레거시 세이브**: `tendency_seed = null` → 로드 시 자동 생성 후 즉시 저장
- **게스트 모드**: 세이브 없음 → `DEFAULT_TENDENCIES` 사용

---

## 5. 엔진 효과 상세 (13개 텐던시)

### 5.1 멘탈 텐던시 (6개)

#### clutchGene — 클러치 유전자

| 속성 | 값 |
|------|-----|
| 범위 | -1.0 ~ +1.0 |
| 분포 | 정규 (μ=0, σ=0.4) |
| 적용 파일 | `flowEngine.ts:213` |
| 함수 | `calculateHitRate()` — 클러치 상황 판정 후 |

**트리거 조건**: Q4 잔여 5분 이하 + 점수차 ≤ 7점 (isClutch 판정)

**공식**:
```
clutchModifier = (clutchRating - 0.70) * 0.10     ← 기존 능력치 기반
clutchModifier += clutchGene * 0.03                ← SaveTendency 추가
```

**효과**: clutchGene +1.0 → 클러치 히트레이트 +3% / -1.0 → -3%

**NBA 맥락**: 카와이 레너드(+1.0급)는 4쿼터 타이트한 경기에서 평소보다 3% 높은 FG%, 반대로 "새가슴" 선수는 클러치에서 평소보다 3% 낮은 FG%

---

#### consistency — 일관성

| 속성 | 값 |
|------|-----|
| 범위 | 0.0 ~ 1.0 |
| 분포 | 정규 (μ=0.6, σ=0.15) |
| 적용 파일 | `usageSystem.ts:24` |
| 함수 | `calculateScoringGravity()` |

**공식**:
```
consistMod = 1.0 + (consistency - 0.5) * 0.2
mentality = offConsist * 0.4 * consistMod + shotIq * 0.4 + pas * 0.2
```

**효과**: consistency 높으면 → offConsist 기여도 1.2배 → 스코어링 그래비티 상승 → 옵션 순위 상승
consistency 낮으면 → offConsist 기여도 0.8배 → 옵션 순위 하락

**NBA 맥락**: 꾸준한 선수(consistency=0.9)는 기복이 적어 코칭스탭이 더 높은 옵션으로 기용. 기복이 심한 선수(consistency=0.2)는 능력치가 높아도 낮은 옵션으로 밀림.

---

#### confidenceSensitivity — 자신감 민감도

| 속성 | 값 |
|------|-----|
| 범위 | 0.3 ~ 1.7 |
| 분포 | 정규 (μ=1.0, σ=0.25) |
| 적용 파일 | `flowEngine.ts:246` |
| 함수 | `calculateHitRate()` — Hot/Cold Streak 섹션 |

**공식**:
```
temperatureBonus = hotColdRating * 0.04 * confidenceSensitivity
// hotColdRating: -1.0(아이스) ~ +1.0(불붙음)
```

**효과**:
- confidenceSensitivity 1.7 + Hot(+1.0) → +6.8% FG% 보너스
- confidenceSensitivity 1.7 + Cold(-1.0) → -6.8% FG% 페널티
- confidenceSensitivity 0.3 + Hot/Cold → ±1.2% (거의 무덤덤)

**NBA 맥락**: 닉 영(Swaggy P) 같은 선수는 연속 성공 시 자신감이 폭등하지만 연속 실패 시 급추락(1.7급). 팀 던컨 같은 선수는 연속 성공/실패에 관계없이 꾸준(0.3급).

---

#### composure — 침착함

| 속성 | 값 |
|------|-----|
| 범위 | -1.0 ~ +1.0 |
| 분포 | 정규 (μ=0, σ=0.35) |
| 적용 파일 | `possessionHandler.ts:150` |
| 함수 | `calculateTurnoverChance()` |

**공식**:
```
composureFactor = -(composure) * 0.01
totalTovProb = baseProb + passRisk + ... + composureFactor
```

**효과**: composure +1.0 → 턴오버 확률 -1% / composure -1.0 → +1%

**NBA 맥락**: 크리스 폴(+1.0급)은 압박 상황에서도 턴오버가 적음. 반대로 composure가 낮은 선수는 풀코트 프레스에 취약.

---

#### motorIntensity — 허슬 강도

| 속성 | 값 |
|------|-----|
| 범위 | 0.5 ~ 1.5 |
| 분포 | 정규 (μ=1.0, σ=0.2) |
| 적용 파일 | `reboundLogic.ts:82` |
| 함수 | `selectRebounder()` |

**공식**:
```
score *= Math.random() * (0.7 + motorIntensity * 0.6)
// motorIntensity 1.5 → 랜덤 범위 0~1.6 (최대 1.6배 부스트)
// motorIntensity 0.5 → 랜덤 범위 0~1.0 (기존과 동일)
```

**효과**: 허슬이 높은 선수는 리바운드 쟁탈에서 더 유리한 랜덤 롤을 받음.
motorIntensity 1.5 → 리바운드 획득 확률 ~30% 증가

**NBA 맥락**: 데니스 로드먼(1.5급)은 능력치 이상의 리바운드를 기록. 노력을 안 하는 빅맨(0.5급)은 능력치 대비 리바운드가 적음.

---

#### focusDrift — 집중력 저하

| 속성 | 값 |
|------|-----|
| 범위 | 0.0 ~ 1.0 |
| 분포 | 균등 분포 |
| 적용 파일 | `flowEngine.ts:81` |
| 함수 | `calculateHitRate()` — 피로도 보정 섹션 |

**트리거 조건**: 컨디션(fatigueOff) < 60%

**공식**:
```
if (fatigueOff < 0.60) {
    hitRate -= focusDrift * (0.60 - fatigueOff) * 0.05;
}
// 예: focusDrift=1.0, 컨디션=40% → hitRate -= 1.0 * 0.20 * 0.05 = -1.0%
// 예: focusDrift=1.0, 컨디션=0%  → hitRate -= 1.0 * 0.60 * 0.05 = -3.0%
```

**효과**: 피로 시 추가 집중력 저하. focusDrift 0 → 피로해도 집중력 유지, 1.0 → 피로 시 최대 -3% 추가 페널티

**NBA 맥락**: 르브론 제임스(0급)는 40분 뛰어도 집중력 유지. 반대로 focusDrift가 높은 선수는 후반 출전 시간이 길어지면 급격히 효율 하락.

---

### 5.2 플레이스타일 텐던시 (5개)

#### shotDiscipline — 샷 선택 규율

| 속성 | 값 |
|------|-----|
| 범위 | -1.0 ~ +1.0 |
| 분포 | 정규 (μ=0.1, σ=0.35) |
| 적용 파일 | `possessionHandler.ts:449` |
| 함수 | `simulatePossession()` — 슈팅 계산 섹션 |

**공식**:
```
shotDiscMod = shotDiscipline * 0.015
// bonusHitRate에 합산
```

**효과**: shotDiscipline +1.0 → 히트레이트 +1.5% (좋은 샷만 선택) / -1.0 → -1.5% (억지 슛)

**NBA 맥락**: 카일 코버(+1.0급)는 항상 양질의 오픈 슛만 시도. 러셀 웨스트브룩(-1.0급)은 수비 밀착 상태에서도 강행 슛.

---

#### defensiveMotor — 수비 모터

| 속성 | 값 |
|------|-----|
| 범위 | -1.0 ~ +1.0 |
| 분포 | 정규 (μ=0, σ=0.4) |
| 적용 파일 | `flowEngine.ts:89` |
| 함수 | `calculateHitRate()` — 공수 레이팅 비교 섹션 |

**공식**:
```
defRating = baseDefRating + defensiveMotor * 3
hitRate += (offRating - defRating) * 0.002
```

**효과**: defensiveMotor +1.0 → 실효 수비 레이팅 +3pt → 상대 히트레이트 -0.6%
defensiveMotor -1.0 → 실효 수비 레이팅 -3pt → 상대 히트레이트 +0.6%

**NBA 맥락**: 패트릭 베벌리(+1.0급)는 능력치 이상의 수비 임팩트. 제임스 하든(-1.0급)은 수비 능력치가 있어도 실전에서 느슨.

---

#### ballDominance — 볼 지배력

| 속성 | 값 |
|------|-----|
| 범위 | 0.5 ~ 1.5 |
| 분포 | 정규 (μ=1.0, σ=0.2) |
| 적용 파일 | `playTypes.ts:126` |
| 함수 | `pickWeightedActor()` (resolvePlayAction 내부) |

**공식**:
```
weight = Math.pow(rawScore, 2.5) * usageMultiplier
weight *= ballDominance       // ← 직접 곱셈
weight *= ... (playStyle 등)
```

**효과**: ballDominance 1.5 → 해당 선수가 공을 잡을 확률 1.5배
ballDominance 0.5 → 공을 요구하지 않아 0.5배

**NBA 맥락**: 루카 돈치치(1.5급)는 항상 공을 요구하고 USG%가 높음. 역할 수행형 선수(0.5급)는 시스템 안에서 패스를 기다림.

> `ballDominance` = 공을 얼마나 **요구**하는가 (사용률 결정)
> `playStyle` = 공을 받으면 **어떻게** 하는가 (패스 vs 슛 선택)

---

#### foulProneness — 파울 성향

| 속성 | 값 |
|------|-----|
| 범위 | -1.0 ~ +1.0 |
| 분포 | 정규 (μ=0, σ=0.3) |
| 적용 파일 | `possessionHandler.ts:336` |
| 함수 | `simulatePossession()` — 수비 파울 체크 |

**공식**:
```
baseFoulChance += foulProneness * 0.02
baseFoulChance = Math.max(0.03, baseFoulChance)  // 최소 3%
```

**효과**: foulProneness +1.0 → 파울 확률 +2% / -1.0 → -2% (하한 3%)

**NBA 맥락**: 드레이먼드 그린(+1.0급)은 공격적 수비로 파울이 잦음. 카와이 레너드(-1.0급)는 깨끗한 수비.

---

#### playStyle — 플레이 성향

| 속성 | 값 |
|------|-----|
| 범위 | -1.0(패스 퍼스트) ~ +1.0(슛 퍼스트) |
| 분포 | 정규 (μ=0, σ=0.35) |
| 적용 파일 | `playTypes.ts:132`, `statsMappers.ts:150` |
| 함수 | `pickWeightedActor()`, `applyPossessionResult()` |

**효과 1 — 플레이타입별 액터 선택** (`playTypes.ts`):
```
if (Iso || PostUp)       → weight *= (1 + playStyle * 0.3)
if (PnR_Handler || Handoff) → weight *= (1 - playStyle * 0.2)
if (CatchShoot || Cut)   → 중립 (수신자 역할)
```
- playStyle +1.0(슛형) + Iso → 가중치 +30%
- playStyle -1.0(패스형) + PnR_Handler → 가중치 +20%

**효과 2 — 어시스트 확률** (`statsMappers.ts`):
```
assistMod = playStyle * -0.10
if (Math.random() < assistProb + assistMod) → 어시스트 기록
```
- playStyle -1.0(패스형) → 어시스트 확률 +10%
- playStyle +1.0(슛형) → 어시스트 확률 -10%

**NBA 맥락**: 르브론(-0.7급 패스형)은 PnR 핸들러로 많이 선택되고 어시스트가 잘 기록됨. 코비(+0.8급 슛형)는 Iso/PostUp에서 자주 공을 받고 어시스트보다 직접 슛 선호.

---

### 5.3 성격 텐던시 (2개)

#### temperament — 기질

| 속성 | 값 |
|------|-----|
| 범위 | -1.0(냉정) ~ +1.0(다혈질) |
| 분포 | 정규 (μ=0, σ=0.35) |
| 적용 파일 | `possessionHandler.ts:402` |
| 함수 | `simulatePossession()` — 테크니컬 파울 체크 |

**공식**:
```
techChance = TECHNICAL_FOUL_CHANCE * (1 + temperament * 0.8)
// temperament +1.0 → 기본 확률 × 1.8배
// temperament -1.0 → 기본 확률 × 0.2배
```

**효과**: 다혈질(+1.0) → 테크니컬 파울 확률 1.8배 (0.3% → 0.54%)
냉정(-1.0) → 테크니컬 파울 확률 0.2배 (0.3% → 0.06%)

> 주의: 테크니컬은 **수비자(defender)** 에게 부여 → defender의 tendencies 사용

**NBA 맥락**: 라시드 월리스(+1.0급)는 매 경기 테크니컬 위험. 팀 던컨(-1.0급)은 거의 테크니컬을 받지 않음.

---

#### ego — 자존심

| 속성 | 값 |
|------|-----|
| 범위 | -1.0(겸손) ~ +1.0(자존심) |
| 분포 | 정규 (μ=0, σ=0.3) |
| 적용 파일 | `possessionHandler.ts:454` |
| 함수 | `simulatePossession()` — 슈팅 계산 섹션 |

**공식**:
```
actorOptionRank = getTeamOptionRanks(offTeam).get(actor.playerId) || 3
egoMod = ego * ((3 - actorOptionRank) / 2) * 0.015
```

| ego | 1옵션(에이스) | 2옵션 | 3옵션 | 4옵션 | 5옵션 |
|-----|-------------|-------|-------|-------|-------|
| +1.0 | +1.5% | +0.75% | 0% | -0.75% | -1.5% |
| +0.5 | +0.75% | +0.375% | 0% | -0.375% | -0.75% |
| 0 | 0% | 0% | 0% | 0% | 0% |
| -1.0 | -1.5% | -0.75% | 0% | +0.75% | +1.5% |

**효과**: ego가 높은 선수는 에이스(1옵션)일 때 더 잘하지만, 벤치 역할(5옵션)로 밀리면 오히려 퍼포먼스 하락.
ego가 낮은(겸손한) 선수는 어떤 역할이든 안정적.

**NBA 맥락**: 코비 브라이언트(ego=+1.0)는 에이스 역할에서 극대화되지만, 보조 역할로 밀리면 불만족으로 효율 하락.
앙드레 이구오달라(ego=-0.8)는 에이스→식스맨 전환에도 안정적 퍼포먼스.

---

## 6. 엔진 효과 요약표

| 텐던시 | 파일 | 라인 | 함수 | 공식 | 최대 영향 |
|--------|------|------|------|------|----------|
| clutchGene | flowEngine | 213 | calculateHitRate | `+= value * 0.03` | ±3% FG% |
| consistency | usageSystem | 24 | calculateScoringGravity | `consistMod = 1+(val-0.5)*0.2` | 0.8x~1.2x |
| confidenceSensitivity | flowEngine | 246 | calculateHitRate | `temperatureBonus *= value` | 0.3x~1.7x |
| composure | possessionHandler | 150 | calculateTurnoverChance | `-= value * 0.01` | ±1% TOV |
| motorIntensity | reboundLogic | 82 | selectRebounder | `*= rand*(0.7+val*0.6)` | ~30% REB |
| focusDrift | flowEngine | 81 | calculateHitRate | `-= val*(0.6-cond)*0.05` | 0~3% FG% |
| shotDiscipline | possessionHandler | 449 | simulatePossession | `+= value * 0.015` | ±1.5% FG% |
| defensiveMotor | flowEngine | 89 | calculateHitRate | `defRating += val * 3` | ±0.6% 상대FG% |
| ballDominance | playTypes | 126 | pickWeightedActor | `weight *= value` | 0.5x~1.5x 선택 |
| foulProneness | possessionHandler | 336 | simulatePossession | `+= value * 0.02` | ±2% 파울 |
| playStyle | playTypes/statsMappers | 132/150 | pickWeightedActor/applyResult | ±20~30% 가중치 / ±10% 어시스트 | 복합 |
| temperament | possessionHandler | 402 | simulatePossession | `techChance *= (1+val*0.8)` | 0.2x~1.8x 테크 |
| ego | possessionHandler | 454 | simulatePossession | `val*((3-rank)/2)*0.015` | ±1.5% FG% |

---

## 7. 분포 통계 (445명 기준 예상)

| 텐던시 | σ | 극단값(|x|≥0.4) 비율 | 극단값(|x|≥0.7) 비율 |
|--------|---|--------------------|---------------------|
| clutchGene | 0.4 | ~32% | ~8% |
| composure | 0.35 | ~25% | ~5% |
| temperament | 0.35 | ~25% | ~5% |
| ego | 0.3 | ~18% | ~2% |
| defensiveMotor | 0.4 | ~32% | ~8% |
| shotDiscipline | 0.35 | ~25% | ~5% |
| foulProneness | 0.3 | ~18% | ~2% |
| playStyle | 0.35 | ~25% | ~5% |

- ballDominance, motorIntensity: 범위가 0.5~1.5 (중심=1.0)이므로 양극 개념 없음
- consistency: 범위가 0.0~1.0 (중심=0.6)이므로 양극 개념 없음
- confidenceSensitivity: 범위가 0.3~1.7 (중심=1.0)이므로 양극 개념 없음
- focusDrift: 균등분포 0.0~1.0

---

## 8. 선수 프로필 표시

`PlayerDetailModal.tsx`에서 텐던시를 **뱃지 형태**로 표시.

### 표시 항목 6개

| # | 특성 | 데이터 소스 | 표시 조건 |
|---|------|-----------|----------|
| 1 | 선호 지역 | `player.tendencies.zones` | 항상 (zones 있을 때) |
| 2 | 좌우 편향 | `generateHiddenTendencies().lateralBias` | 항상 |
| 3 | 클러치 | `SaveTendencies.clutchGene` | |val| ≥ 0.4 |
| 4 | 침착함 | `SaveTendencies.composure` | |val| ≥ 0.4 |
| 5 | 기질 | `SaveTendencies.temperament` | |val| ≥ 0.4 |
| 6 | 에고 | `SaveTendencies.ego` | |val| ≥ 0.4 |

### 레이블 & 색상

| 텐던시 | 양극(+) | 색상 | 양극(-) | 색상 |
|--------|---------|------|---------|------|
| clutchGene | "강심장" | emerald | "새가슴" | red |
| composure | "침착함" | emerald | "부담감을 느낌" | amber |
| temperament | "다혈질" | amber | "냉정함" | sky |
| ego | "자존심이 강함" | amber | "모두와 잘 어울림" | emerald |

### tendencySeed 전달 경로 (UI)

```
AppRouter → 5개 View (prop) → PlayerDetailModal (prop)
  DashboardView, RosterView, LeaderboardView,
  TransactionsView, InboxView
```

tendencySeed 없으면 (게스트 모드 등) → 세이브 텐던시 4개 생략, 기본 2개(선호 지역 + 좌우 편향)만 표시

---

## 9. 관련 파일 목록

| 파일 | 역할 |
|------|------|
| `types/player.ts` | SaveTendencies, PlayerTendencies, HiddenTendencies 타입 |
| `utils/hiddenTendencies.ts` | 생성 함수 (generateSaveTendencies, generateHiddenTendencies, DEFAULT_TENDENCIES) |
| `services/persistence.ts` | tendency_seed DB 저장/로드 |
| `hooks/useGameData.ts` | tendencySeed state 관리, 시드 생성/로드 |
| `services/game/engine/pbp/pbpTypes.ts` | LivePlayer.tendencies 필드 |
| `services/game/engine/pbp/initializer.ts` | LivePlayer에 텐던시 할당 |
| `services/game/engine/pbp/flowEngine.ts` | clutchGene, confidenceSensitivity, focusDrift, defensiveMotor 효과 |
| `services/game/engine/pbp/possessionHandler.ts` | composure, foulProneness, temperament, shotDiscipline, ego 효과 |
| `services/game/engine/pbp/playTypes.ts` | ballDominance, playStyle 효과 (액터 선택) |
| `services/game/engine/pbp/statsMappers.ts` | playStyle 효과 (어시스트 확률) |
| `services/game/engine/pbp/reboundLogic.ts` | motorIntensity 효과 (리바운드) |
| `services/game/engine/pbp/usageSystem.ts` | consistency 효과 (옵션 순위) |
| `components/PlayerDetailModal.tsx` | 선수 프로필 성격 뱃지 UI |
| `components/AppRouter.tsx` | tendencySeed → 5개 View 전달 |
