# OVR 산출 엔진 (ovrEngine)

> 최종 업데이트: 2026-03 (튜닝 v2 — 아키타입 인플레 억제 + z-score 기반 티어 임계값)
> 관련 파일: `utils/ovrEngine.ts`, `utils/ovrUtils.ts`

---

## 1. 개요 및 설계 철학

### 기존 방식 (구 POSITION_WEIGHTS)
```
OVR = round(weightedAvg(abilities) * 0.6 + 40)
```
포지션별 능력치 가중 평균 + 선형 압축. `potential`이 직접 OVR에 포함.

**문제점:**
- 80~90 구간 과밀
- 유망주 OVR 인플레 (potential이 current OVR 올림)
- 요키치(C+플레이메이킹), 커리(PG+elite 슈팅) 같은 비전통 슈퍼스타 저평가
- 동일 포지션 내 선수 역할 구분 없음

### 새 방식 (ovrEngine)
```
Current OVR =
  PositionBase          (포지션 기본 뼈대)
  + PrimaryArchetypeScore  (주 아키타입 정체성)
  + SecondaryArchetypeScore (보조 아키타입)
  + TagBonus            (특성 태그 보정)
  + SignatureSkillBonus  (역사급 특기)
  + RareComboBonus      (희귀 조합 — 커리/요키치형 부스트)
  - FatalWeaknessPenalty (치명적 약점)
  + IntangibleBonus     (소규모 클러치/포이즈 보정)
```

**핵심 원칙:**
- **Current OVR ≠ Potential**: `potential`은 `futureOvr`에만 반영
- **역할 기반**: 포지션 평균이 아니라 아키타입 정체성으로 평가
- **리그 상대 OVR**: rawOVR → 리그 분포(z-score) → displayOVR

---

## 2. 데이터 흐름

```
[DB: meta_players base_attributes]
         │
         ▼
[services/dataMapper.ts]
  mapRawPlayerToRuntimePlayer()
  ├─ Player 필드명으로 변환 (handling, spdBall, three45, ...)
  └─ calculateOvr(player) → 폴백 분포로 첫 OVR 계산
         │
         ▼
[mapPlayersToTeams() + mapFreeAgents() 완료 후]
  postProcessAllPlayersOVR(teams, freeAgents)
  ├─ 전체 445명 rawOvr 계산
  ├─ calculateLeagueDistribution(rawValues) → { mean, std }
  ├─ setLeagueDistribution(dist)  ← ovrUtils 캐시 갱신
  └─ 각 Player에 ovr / rawOvr / futureOvr 최종 세팅
         │
         ▼
[런타임 — calculatePlayerOvr(player)]
  utils/constants.ts → utils/ovrUtils.ts → utils/ovrEngine.ts
  └─ displayOVR (리그 분포 반영, 50~99)
```

### 어댑터 레이어 (ovrUtils.ts)
Player 필드명 → 엔진 내부 `PlayerRatings` 변환:

| Player 필드 | PlayerRatings 필드 |
|-------------|-------------------|
| `handling` | `ballHandling` |
| `spdBall` | `speedWithBall` |
| `three45` | `fortyFiveThree` |
| `threeCorner` | `cornerThree` |
| `threeTop` | `topThree` |
| `ft` | `freeThrow` |
| `shotIq` | `shotIQ` |
| `passAcc` | `passAccuracy` |
| `passIq` | `passIQ` |
| `offBallMovement` | `offballMovement` |
| `intDef` | `interiorDefense` |
| `perDef` | `perimeterDefense` |
| `blk` | `block` |
| `helpDefIq` | `helpDefenseIQ` |
| `passPerc` | `passPerception` |
| `offConsist` | `offensiveConsistency` |
| `defConsist` | `defensiveConsistency` |
| `offReb` | `offensiveRebounds` |
| `defReb` | `defensiveRebounds` |
| `boxOut` | `boxout` |
| `intangibles` | `intangible` |
| `height` (cm) | `heightInches` (cm / 2.54) |

---

## 3. Step-by-Step 계산 흐름

### Step 1: 모듈 점수 계산 (13개)

원시 능력치 39개를 역할 단위 모듈로 압축. 공식 출처: `utils/ovrEngine.ts: calculateModules()`.

> **통합 원칙**: `services/playerDevelopment/archetypeEvaluator.ts`의 `calcModuleScores()`도 이 함수를 재사용 — 모듈 공식 단일 소스.

| 모듈 | 주요 입력 능력치 | 용도 |
|------|----------------|------|
| `spotUpShooting` | cornerThree×0.30, fortyFiveThree×0.28, topThree×0.22, freeThrow, shotIQ, offensiveConsistency | 캐치&슛 |
| `shotCreation` | midRange×0.28, ballHandling×0.16, speedWithBall×0.12, drawFoul, layup, shotIQ | 자체 창출 |
| `rimFinishing` | layup×0.26, dunk×0.18, closeShot×0.14, drawFoul×0.12, vertical | 림 마무리 |
| `postCraft` | postPlay×0.34, closeShot×0.18, strength×0.14 | 포스트 플레이 |
| `playmaking` | passVision×0.28, passAccuracy×0.24, passIQ×0.18, ballHandling×0.16 | 패스/오케스트레이팅 |
| `offballAttack` | offballMovement×0.28, spotUpShooting×0.22, layup×0.14, speed, agility | 오프볼 공격 |
| `poaDefense` | perimeterDefense×0.30, steal×0.14, passPerception, helpDefenseIQ, agility, speed | 일대일 수비 |
| `teamDefense` | helpDefenseIQ×0.20, passPerception×0.18, perimeterDefense×0.16, interiorDefense×0.14 | 팀 수비 |
| `rimProtection` | interiorDefense×0.34, block×0.24, helpDefenseIQ, strength, vertical | 림 보호 |
| `rebounding` | defensiveRebounds×0.34, offensiveRebounds×0.24, boxout×0.24, strength | 리바운드 |
| `athleticism` | speed, agility, vertical, strength, stamina, hustle | 신체 능력 (PositionBase에만 사용) |
| `motorAvailability` | durability×0.35, stamina×0.25, hustle×0.20, offensiveConsistency, defensiveConsistency | 출전 능력 |
| `sizeFit` | `\|heightInches - idealHeight(pos)\|` 기반 페널티 | 포지션 체형 적합도 |

**sizeFit 이상 신장 (인치):**
| PG | SG | SF | PF | C |
|----|----|----|----|----|
| 77" (6'5) | 79" (6'7) | 81" (6'9) | 83" (6'11) | 85" (7'1) |

---

### Step 2: 아키타입 점수 (13종)

각 아키타입은 관련 모듈의 가중합으로 점수 계산. 포지션별 후보 제한:

| 포지션 | 후보 아키타입 |
|--------|-------------|
| PG | Primary Creator Guard, Scoring Combo Guard, Movement Shooter, Perimeter 3&D |
| SG | PG 후보 전체 + Two-Way Wing, Slashing Wing, Shot Creator Wing |
| SF | Movement Shooter, Perimeter 3&D, Two-Way Wing, Slashing Wing, Shot Creator Wing, Connector Forward |
| PF | Two-Way Wing, Connector Forward, Post Scoring Big, Rim Runner Big, Stretch Big, Rim Protector Anchor, Playmaking Big |
| C | Post Scoring Big, Rim Runner Big, Stretch Big, Rim Protector Anchor, Playmaking Big |

**아키타입별 모듈 가중치 예시:**

| 아키타입 | 핵심 모듈 (상위 3개) |
|---------|-------------------|
| Primary Creator Guard | playmaking×0.38, shotCreation×0.22, rimFinishing×0.12 |
| Movement Shooter | spotUpShooting×0.40, offballAttack×0.28, motorAvailability×0.12 |
| Perimeter 3&D | spotUpShooting×0.30, poaDefense×0.28, teamDefense×0.20 |
| Rim Protector Anchor | rimProtection×0.38, rebounding×0.26, teamDefense×0.14 |
| Playmaking Big | playmaking×0.26, postCraft×0.20, spotUpShooting×0.16 |

**주/보조 아키타입 선정:**
- 점수 1위 = Primary Archetype
- 점수 2위 = Secondary Archetype
- 점수 차이 >= 8: Primary 82% / Secondary 18%
- 점수 차이 < 8: Primary 70% / Secondary 30%

---

### Step 3: 포지션 기본 점수 (PositionBase)

아키타입 이전의 포지션 뼈대 점수. `utils/ovrEngine.ts: calcPositionBase()`.

예시 (C 기준):
```
C_Base =
  postCraft×0.18 + rimFinishing×0.10 + playmaking×0.10 +
  rimProtection×0.18 + rebounding×0.18 + teamDefense×0.08 +
  spotUpShooting×0.06 + athleticism×0.06 + motorAvailability×0.04 +
  sizeFit×0.04 + intangible×0.04
```
→ 요키치형: playmaking 10% 반영으로 순수 수비형 C보다 자연스럽게 높음

---

### Step 4: 14개 특성 태그 보너스

임계값 초과 시 태그 획득 → OVR 소폭 가산. **상위 3개 positive tag만 반영**, negative 전부 반영.

| 태그 | 조건 | 보너스 |
|------|------|--------|
| Elite Finisher | rimFinishing ≥ 88 | +0.8 |
| Shotmaker | shotCreation ≥ 88 | +0.9 |
| Floor Spacer | spotUpShooting ≥ 86 | +0.7 |
| Movement Shooter (tag) | offballAttack ≥ 84 && spotUpShooting ≥ 84 | +1.0 |
| Plus Playmaker | playmaking ≥ 86 | +0.9 (+1.2 if PF/C) |
| Rim Protector | rimProtection ≥ 88 | +0.9 |
| Reliable Two-Way | 공격/수비 평균 ≥ 82 && 일관성 ≥ 75 | +1.1 |
| Streaky Scorer | (shotCreation≥82 OR spotUpShooting≥82) && offensiveConsistency≤60 | -0.7 |

**TagBonus 최대값**: positive 합 최대 +3.2, negative 최소 -2.0

---

### Step 5: 엘리트 스킬 보너스 (SignatureSkillBonus)

한 모듈이 역사급이면 OVR 추가 상승. `calcSignatureSkillBonus()`:

| 최고 모듈 점수 | 보너스 |
|--------------|--------|
| ≥ 98 | +3.0 + (v-98)×0.20 |
| ≥ 95 | +2.0 + (v-95)×0.33 |
| ≥ 90 | +1.0 + (v-90)×0.20 |
| 2위 모듈도 적용 | × 0.40 배율 |

최대 합계: **+4.0**

---

### Step 6: 희귀 조합 보너스 (RareComboBonus)

비전통 슈퍼스타를 살리는 핵심 메커니즘. `calcRareComboBonus()`:

| 조건 | 포지션 | 보너스 |
|------|--------|--------|
| playmaking ≥ 90 && spotUpShooting ≥ 92 | PG/SG | +2.6 |
| spotUpShooting ≥ 98 | PG/SG | +1.6 (Curry급) |
| shotCreation ≥ 90 && spotUpShooting ≥ 88 | SG/SF | +2.2 |
| spotUpShooting ≥ 88 && poaDefense ≥ 88 | SG/SF | +1.8 (elite 3&D) |
| playmaking ≥ 88 && postCraft ≥ 82 | PF/C | +2.4 (Jokic급) |
| playmaking ≥ 94 | PF/C | +1.8 (elite PB big) |
| spotUpShooting ≥ 84 && rimProtection ≥ 88 | PF/C | +2.0 (stretch rim protector) |
| rebounding ≥ 90 && rimProtection ≥ 92 | PF/C | +1.6 (dominant defensive big) |

최대 합계: **+4.5**

---

### Step 7: 치명적 약점 패널티 (FatalWeaknessPenalty)

아키타입 핵심 능력이 부족하면 OVR 하락. 최대 **-8.0**. `calcFatalWeaknessPenalty()`:

예시:
- **Playmaking Big**: playmaking < 82 → 최대 -6
- **Rim Protector Anchor**: rimProtection < 80 → 최대 -7
- **Primary Creator Guard**: playmaking < 74 → 최대 -6

→ 요키치가 "C인데 블록 낮음"으로 과도하게 깎이지 않는 이유: Playmaking Big 기준에서는 rimProtection 패널티가 없음

---

### Step 8: Intangible 보너스

소규모 직접 OVR 효과. 게임플레이(클러치, 접전)에서 더 크게 반영.
```
IntangibleBonus = clamp((intangible - 50) / 50 × 1.0, -1.0, +1.0)
```
intangible 50 → 0 / 80 → +0.6 / 95 → +0.9
*(v2: 캡 ±2.5 → ±1.0으로 축소, OVR 영향 최소화)*

---

### Step 8.5: Core Position Penalty (신규)

포지션 필수 능력이 완전히 결여된 선수에 대한 추가 페널티. 최대 **-6.0**. `calcCorePositionPenalty()`:

| 포지션 | 조건 | 페널티 |
|--------|------|--------|
| PG | playmaking < 74 또는 spotUpShooting < 70 | 부족분 비례 (최대 -7.5) |
| SG | spotUpShooting < 72 AND shotCreation < 72 | -4.0 (고정) |
| SF | spotUpShooting < 70 AND poaDefense < 72 AND teamDefense < 72 | -4.5 (고정) |
| PF | rebounding < 72 또는 rimProtection < 70 | 부족분 비례 |
| C | rebounding < 74 또는 rimProtection < 72 | 부족분 비례 (최대 -9.5) |

> FatalWeaknessPenalty가 아키타입 기준이라면, CorePositionPenalty는 포지션 기준. 두 페널티는 독립 적용.

---

### Step 9: rawCurrentOVR 합산

**v2 변경**: 아키타입 점수를 full 가중합이 아닌 `posBase` 대비 조정값으로 적용. 아키타입 인플레 억제.

```
primaryAdj   = (primaryArchetypeScore - posBase) × 0.18
secondaryAdj = (secondaryArchetypeScore - posBase) × 0.08

rawCurrentOVR =
  posBase
  + primaryAdj
  + secondaryAdj
  + TagBonus
  + SignatureSkillBonus
  + RareComboBonus
  - FatalWeaknessPenalty
  - CorePositionPenalty
  + IntangibleBonus

범위: clamp(40, 99)
```

**보너스 캡 (v2 축소):**
| 항목 | 구버전 최대 | 현재 최대 |
|------|-----------|---------|
| TagBonus | +3.2 | +1.8 (감소 수익 적용) |
| SignatureSkillBonus | +4.0 | +2.2 |
| RareComboBonus | +4.5 | +2.5 |
| IntangibleBonus | ±2.5 | **±1.0** |

---

### Step 10: displayOVR (리그 분포 보정)

**v2 변경**: spread 확대(5.8→6.5) + 기저 조정(76→75) + z³ 계수 축소(1.0→0.35) + 압축 임계값 상향(93→95).

```
z = (rawOVR - leagueMean) / leagueStd
display = 75 + 6.5×z + 0.35×z³

// 상위 압축 (99를 사실상 불가능하게)
if display > 95:   display = 95 + (display - 95) × 0.55
if display > 97.5: display = 97.5 + (display - 97.5) × 0.28

displayOVR = round(clamp(display, 50, 99))
```

- `leagueMean`, `leagueStd`: 전체 445명 rawOVR에서 산출 (게임 로드 시 1회)
- `leagueStd` 최솟값: 1.75 (소규모 리그 극단 방지, 구버전 1.5에서 상향)
- 압축이 활성화되는 구간: z ≈ +3.1 이상 (445명 중 사실상 없음 → 의도적 예약)

**z값별 예상 displayOVR (445명 리그 기준):**
| z값 | 해당 순위(약) | displayOVR | 비고 |
|-----|------------|-----------|------|
| −1.0 | ~270위 | ~68 | 로스터 하위 |
| 0.0 | ~223위 | 75 | 리그 평균 |
| +0.35 | ~150위 | ~78 | 주전 수준 |
| +1.1 | ~70위 | ~83 | 올스타급 |
| +1.8 | ~20위 | ~88 | 슈퍼스타 |
| +2.3 | ~5위 | ~94 | MVP급 |
| +2.5 | ~2위 | ~96 | 리그 최정상 |

**목표 분포:**
| 백분위 | displayOVR |
|--------|-----------|
| 상위 0.5% | 97~99 |
| 상위 2% | 93~96 |
| 상위 7% | 88~92 |
| 상위 15% | 83~87 |
| 상위 30% | 78~82 |
| 상위 55% | 73~77 |
| 하위 45% | 50~72 |

---

### Step 11: futureOVR (Potential 반영)

```
ageFactor: 21↓=1.0 / 22-24=0.75 / 25-27=0.40 / 28-30=0.15 / 31+=0
futureOVR = displayOVR + max(0, (potential - displayOVR) × ageFactor × 0.55)
```

- Current OVR와 완전히 분리 → 유망주 인플레 없음
- 22세, potential 95, currentOVR 78: futureOVR ≈ 78 + (95-78)×0.75×0.55 ≈ 85

---

## 4. 리그 분포 초기화 흐름

```
게임 로드 (queries.ts: useBaseData)
  └─ mapPlayersToTeams(playersData)     ← 폴백 분포로 OVR 첫 계산
  └─ mapFreeAgents(playersData)
  └─ postProcessAllPlayersOVR(teams, freeAgents)
       ├─ 445명 rawOvr 수집
       ├─ calculateLeagueDistribution(rawValues) → { mean, std }
       ├─ setLeagueDistribution(dist)            ← 캐시 갱신
       └─ 각 Player.ovr / rawOvr / futureOvr 업데이트
```

**폴백 분포** (`{ meanRawOVR: 75.0, stdRawOVR: 7.0 }`):
- `setLeagueDistribution` 호출 전까지 사용
- 분포 세팅 후 `postProcessAllPlayersOVR`에서 전원 재계산

---

## 5. 공개 API (utils/ovrUtils.ts)

| 함수 | 설명 | 반환값 |
|------|------|--------|
| `calculateOvr(player, pos?)` | 리그 분포 반영 displayOVR | `number` (50~99) |
| `calculateRawOvr(player, pos?)` | 분포 보정 전 rawOVR | `number` (40~99) |
| `calculateFutureOvr(player, pos?)` | potential 기반 futureOVR | `number` |
| `setLeagueDistribution(dist)` | 리그 분포 캐시 세팅 | `void` |
| `getLeagueDistribution()` | 현재 분포 조회 | `LeagueDistribution` |
| `adaptPlayerToInput(player, pos?)` | Player → PlayerInput 변환 | `PlayerInput` |
| `getPlayerStarRating(ovr)` | OVR → 별점 (0.5~5.0) | `number` |
| **`getOVRThreshold(tier)`** | **z-score 기반 티어 OVR 임계값** | **`number`** |

### getOVRThreshold() — z-score 기반 티어 시스템 (신규)

하드코딩된 절대값 임계값(예: `ovr >= 88`) 대신 리그 분포 기반 상대 임계값을 반환.
OVR 공식이 바뀌어도 **퍼센타일 의미가 자동 유지**됨.

```ts
export type OvrTier = 'SUPERSTAR' | 'STAR' | 'STARTER' | 'ROLE' | 'FRINGE';

// 내부 z-score 기준
const OVR_TIER_Z = {
  SUPERSTAR: 1.8,   // ~상위 8명 (MVP/All-NBA First)
  STAR:      1.1,   // ~상위 23명 (올스타급)
  STARTER:   0.35,  // ~상위 60명 (주전 수준)
  ROLE:     -0.25,  // 로테이션
  FRINGE:   -0.9,   // FA/컷 후보
};

getOVRThreshold('SUPERSTAR') // ≈ 88
getOVRThreshold('STAR')      // ≈ 83
getOVRThreshold('STARTER')   // ≈ 78
getOVRThreshold('ROLE')      // ≈ 73
getOVRThreshold('FRINGE')    // ≈ 69
```

> **주의**: `getOVRThreshold()`는 반드시 함수 내부에서 호출할 것.
> 모듈 레벨 상수로 선언하면 `setLeagueDistribution()` 호출 전 폴백 분포를 캡처하여 잘못된 값을 반환함.
> 예: `const STAR_OVR = getOVRThreshold('STAR')` — ❌ / 함수 내 인라인 호출 — ✅

`utils/constants.ts`를 통해 re-export됨:
```ts
import { getOVRThreshold, OvrTier } from '../utils/constants';
```

---

## 6. 관련 파일

| 파일 | 역할 |
|------|------|
| `utils/ovrEngine.ts` | 엔진 핵심 로직 (순수 함수, Player 타입 미참조) |
| `utils/ovrUtils.ts` | 어댑터 + 분포 캐시 + 공개 API + `getOVRThreshold()` |
| `utils/constants.ts` | `getOVRThreshold`, `OvrTier` re-export |
| ~~`utils/overallWeights.ts`~~ | **삭제됨** (2026-03) — 구버전 포지션 가중치, dead code |
| `services/dataMapper.ts` | `postProcessAllPlayersOVR()` — 배치 분포 초기화 |
| `services/queries.ts` | `postProcessAllPlayersOVR` 호출 진입점 |
| `services/playerDevelopment/archetypeEvaluator.ts` | `calcModuleScores` → `ovrEngine.calculateModules` 재사용 |
| `types/archetype.ts` | 13 아키타입 / 14 태그 타입 정의 |
| `types/player.ts` | `Player.rawOvr?`, `Player.futureOvr?` 필드 |

---

## 7. 튜닝 포인트

새 데이터셋 추가 또는 분포가 맞지 않을 때 조정할 항목:

1. **`mapRawOVRToDisplayOVR()` 상수** (`75`, `6.5`, `0.35`): 분포 폭 조정
   - 현재: base=75, spread=6.5, z³ 계수=0.35, 1차 압축 임계=95, 2차=97.5
2. **`OVR_TIER_Z`** (ovrUtils.ts): 각 티어의 z-score 기준 조정
3. **`ARCHETYPE_CANDIDATES`**: 포지션별 후보 아키타입 추가/제거
4. **`calcRareComboBonus()`**: 희귀 조합 임계값 및 보너스 크기 (max 2.5)
5. **`calcFatalWeaknessPenalty()`**: 아키타입별 최소 능력치 기준 (max 9.0)
6. **`calcCorePositionPenalty()`**: 포지션별 기본 요건 기준 (max 6.0)
7. **태그 임계값** (`calcTagBonus()`): 각 태그 획득 조건 수치 (max +1.8)
8. **아키타입 조정 계수** (`primaryAdj ×0.18`, `secondaryAdj ×0.08`): 아키타입 영향력 강도

---

## 8. 목표 OVR 스케일 (역사적 위상 기준)

올타임 레전드 로스터 작업 시, 선수의 역사적 위상에 따라 아래 스케일을 기준으로 목표 OVR(= `pot` 값)을 설정한다.

| OVR 구간 | 등급 |
|---------|------|
| 99~96 | 시대의 지배자 / 올타임 레전드 / 포지션 고트 |
| 95~93 | 역사상 탑 30 레벨 / 올-데케이드 팀 |
| 92~90 | 올스타 |
| 89~85 | 팀 주전 자원 |
| 84~80 | 좋은 로테이션 자원 |
| 79~76 | 보통의 로테이션 자원 |

**운영 원칙:**
- 현재 엔진이 전체적으로 낮게 계산되는 문제가 있어, 엔진 개편 전까지 `pot` 값에 목표 OVR을 설정해 역사적 위상을 보존한다.
- 엔진이 이 스케일에 부합하도록 수렴하는 것이 튜닝의 최종 목표다.
- 슈팅 부재(벤 시몬스, 밥 쿠지 등 CorePositionPenalty 최대치 선수)처럼 구조적 한계로 display OVR이 목표에 도달하지 못하는 경우에도 `pot`으로 위상을 표현한다.

---

## 9. 엔진 수정 시 필수 검증 절차

### 반드시 검증해야 하는 3가지 항목

아래 세 항목을 수정할 때는 **단순 수치 변경으로 끝내지 말고**, 반드시 전체 선수(445명) OVR 분포를 재계산하여 인플레이션 여부를 확인해야 한다.

| 항목 | 위험 이유 |
|------|---------|
| `calcCorePositionPenalty()` 수치 완화 | 슈팅 없는 PG(시몬스, 쿠지 등) rawOVR 선택적 폭등 |
| `sizeFit` 패널티 완화 | 대형 PG(6'10" 이상) OVR 선택적 폭등 |
| `calcTagBonus()` threshold 하향 | 엘리트 모듈 보유 선수 전반 OVR 상승 |

### 검증 방법

수정 전후 전체 선수 OVR 분포 히스토그램을 비교한다:

```ts
// 검증 스크립트 예시 (개발용)
import { postProcessAllPlayersOVR } from '../services/dataMapper';

function validateOVRDistribution(before: number[], after: number[]) {
  const tiers = [76, 80, 85, 90, 93, 96];
  tiers.forEach(threshold => {
    const beforeCount = before.filter(v => v >= threshold).length;
    const afterCount  = after.filter(v => v >= threshold).length;
    console.log(`OVR≥${threshold}: ${beforeCount} → ${afterCount} (Δ${afterCount - beforeCount})`);
  });
}
```

### 허용 기준 (가이드라인)

| OVR 구간 | 현재 선수 수(약) | 수정 후 허용 변동 |
|---------|--------------|----------------|
| 96+ | ≤ 5명 | ±1명 이내 |
| 93+ | ≤ 15명 | ±3명 이내 |
| 90+ | ≤ 35명 | ±5명 이내 |
| 85+ | ≤ 80명 | ±10명 이내 |

> 이 기준을 초과하면 특정 선수 군에 편향된 인플레이션이 발생한 것으로 판단하고, 수정 범위를 좁혀 재검토해야 한다.

---

## 10. 변경 이력

| 버전 | 날짜 | 주요 변경 |
|------|------|---------|
| v1 (초기) | 2026-02 | 모듈/아키타입 기반 엔진 도입, `POSITION_WEIGHTS` 대체 |
| v2 | 2026-03 | ① 아키타입-조정값 방식으로 전환 (인플레 억제) ② displayOVR 파라미터 재조정 (75+6.5z+0.35z³) ③ 보너스 캡 전면 축소 ④ `CorePositionPenalty` 신규 추가 ⑤ `getOVRThreshold()` z-score 기반 API 추가 ⑥ `overallWeights.ts` 삭제 |
