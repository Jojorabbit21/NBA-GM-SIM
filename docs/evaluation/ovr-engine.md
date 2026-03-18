# OVR 산출 엔진 (ovrEngine)

> 최종 업데이트: 2026-03
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
IntangibleBonus = clamp((intangible - 50) / 50 × 2.5, -2.5, +2.5)
```
intangible 50 → 0 / 80 → +1.5 / 95 → +2.25

---

### Step 9: rawCurrentOVR 합산

```
rawCurrentOVR =
  0.55 × PositionBase
  + 0.25 × PrimaryArchetypeScore
  + 0.10 × SecondaryArchetypeScore
  + TagBonus
  + SignatureSkillBonus
  + RareComboBonus
  - FatalWeaknessPenalty
  + IntangibleBonus

범위: clamp(40, 99)
```

---

### Step 10: displayOVR (리그 분포 보정)

```
z = (rawOVR - leagueMean) / leagueStd
displayOVR = round(clamp(76 + 5.8×z + 1.0×z³, 50, 99))
```

- `leagueMean`, `leagueStd`: 전체 445명 rawOVR에서 산출 (게임 로드 시 1회)
- **z³ 항**: 비선형 — 진짜 상위권은 더 벌어지고, 평균권은 집중

**목표 분포:**
| 백분위 | displayOVR |
|--------|-----------|
| 상위 0.5% | 98~99 |
| 상위 2% | 95~97 |
| 상위 7% | 91~94 |
| 상위 15% | 87~90 |
| 상위 30% | 82~86 |
| 상위 55% | 77~81 |
| 하위 45% | 50~76 |

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

---

## 6. 관련 파일

| 파일 | 역할 |
|------|------|
| `utils/ovrEngine.ts` | 엔진 핵심 로직 (순수 함수, Player 타입 미참조) |
| `utils/ovrUtils.ts` | 어댑터 + 분포 캐시 + 공개 API |
| `utils/overallWeights.ts` | **deprecated** — OVR 계산에 미사용, 레거시 참조용만 보존 |
| `services/dataMapper.ts` | `postProcessAllPlayersOVR()` — 배치 분포 초기화 |
| `services/queries.ts` | `postProcessAllPlayersOVR` 호출 진입점 |
| `services/playerDevelopment/archetypeEvaluator.ts` | `calcModuleScores` → `ovrEngine.calculateModules` 재사용 |
| `types/archetype.ts` | 13 아키타입 / 14 태그 타입 정의 |
| `types/player.ts` | `Player.rawOvr?`, `Player.futureOvr?` 필드 |

---

## 7. 튜닝 포인트

새 데이터셋 추가 또는 분포가 맞지 않을 때 조정할 항목:

1. **`mapRawOVRToDisplayOVR()` 상수** (`76`, `5.8`, `1.0`): 분포 폭 조정
2. **`ARCHETYPE_CANDIDATES`**: 포지션별 후보 아키타입 추가/제거
3. **`calcRareComboBonus()`**: 희귀 조합 임계값 및 보너스 크기
4. **`calcFatalWeaknessPenalty()`**: 아키타입별 최소 능력치 기준
5. **태그 임계값** (`calcTagBonus()`): 각 태그 획득 조건 수치
