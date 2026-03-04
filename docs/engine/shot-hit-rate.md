# 슛 성공률(Hit Rate) 분석

> PBP 엔진의 `calculateHitRate()` 공식을 분석하여 능력치 → 실제 FG% 변환 과정을 정리한 문서.
> 밸런싱 작업 시 참조용.

## 핵심 공식

### 3PT (비선형 커브)
```
offMod = interpolateCurve(offAttr, THREE_OFF_CURVE)  // 비선형 piecewise linear
defMod = defAttr × contestFactor × THREE_DEF_COEFF   // 0.001
cornerBonus = (zone_c3 ? 0.015 : 0)                  // 코너 3PT +1.5%p
hitRate = BASE_PCT + playBonus + fatigueMod + offMod - defMod + cornerBonus
```

### Mid / Rim / Paint (비선형 커브, per-shotType)
```
offMod = interpolateCurve(offAttr, SHOT_CURVE[shotType])
defMod = defAttr × contestFactor × DEF_COEFF
hitRate = BASE_PCT + playBonus + fatigueMod + offMod - defMod
```

DEF_COEFF: Dunk=0.002, Rim/Paint=0.0015, Mid=0.0012

### 공통: shotIq + offConsist 일관성 노이즈 (모든 존)
```
shotIqRange = (shotIq - 70) × 0.0008
shotIqNoise = shotIqRange > 0 ? random(0, +shotIqRange)    // 상방 편향
            : shotIqRange < 0 ? random(shotIqRange, 0)     // 하방 편향
            : 0

consistRange = max(0, (70 - offConsist)) × 0.0010
consistNoise = random(-consistRange, +consistRange)         // 대칭 노이즈

hitRate += shotIqNoise + consistNoise
```

- `BASE_PCT`: 존별 기본 성공률
- `playBonus`: 플레이 타입별 추가 보너스
- `fatigueMod`: 컨디션 기반 보정
- `offAttr`: 공격 능력치 (슛 타입에 따라 다름)
- `defAttr`: 수비 능력치 (존에 따라 intDef 또는 perDef)
- `contestFactor`: 슛 타입별 수비 반영 비율 (0.40~1.00)
- 최종 클램프: `Math.max(0.05, Math.min(0.95, hitRate))`

### 참조 파일
- `services/game/engine/pbp/flowEngine.ts` — calculateHitRate()
- `services/game/engine/config/constants.ts` — BASE_PCT, SHOT_DEFENSE 등
- `services/game/engine/pbp/playTypes.ts` — 플레이 타입별 bonusHitRate

---

## 1. 존별 기본 성공률 (BASE_PCT)

| 존 | 상수명 | 값 |
|---|---|---|
| Rim / Paint | INSIDE_BASE_PCT | **0.57** |
| Mid | MID_BASE_PCT | **0.38** |
| 3PT | THREE_BASE_PCT | **0.34** |

---

## 2. contestFactor (SHOT_DEFENSE.CONTEST)

수비 능력치가 얼마나 반영되는지 결정. 낮을수록 수비 영향이 적음.

| 슛 타입 | contestFactor | 주 사용 존 |
|---|---|---|
| CatchShoot | **1.00** | 3PT |
| Layup | **1.00** | Rim |
| Jumper | **0.85** | Mid / Paint |
| Dunk | **0.85** | Rim |
| Pullup | **0.80** | Mid / 3PT |
| Floater | **0.60** | Paint |
| Hook | **0.50** | Paint |
| Fadeaway | **0.40** | Mid |

---

## 3. 슛 타입별 사용 능력치

| 존 | 슛 타입 | 공격 능력치 | 수비 능력치 |
|---|---|---|---|
| 3PT | CatchShoot (코너) | threeCorner (3c) | perDef |
| 3PT | CatchShoot (윙) | three45 (3_45) | perDef |
| 3PT | CatchShoot/Pullup (탑) | threeTop (3t) | perDef |
| Mid | Pullup / Jumper | mid | intDef |
| Mid | Fadeaway | post×0.3 + mid×0.5 + close×0.2 | intDef |
| Rim | Layup | layup (lay) | intDef |
| Rim | Dunk | dunk (dnk) | intDef |
| Paint | Floater | closeShot (close) | intDef |
| Paint | Hook | post×0.45 + close×0.30 + hands×0.25 | intDef |

---

## 4. 플레이 타입별 bonusHitRate

| 플레이 타입 | bonus | 비고 |
|---|---|---|
| Iso | +0.00 | 순수 개인기 |
| PnR_Handler | +0.01 | 스크린 활용 |
| PnR_Roll | +0.03 | 롤러 림 어택 |
| PnR_Pop | +0.01 | 팝아웃 3점 |
| PostUp | +0.01 | 포스트업 포지션 |
| CatchShoot | +0.02 | 스팟업 |
| Cut | +0.03 | 컷팅 타이밍 |
| Handoff | +0.02 | 핸드오프 |
| Transition | +0.04 | 속공 오픈 |
| Putback | +0.05 | 세컨드찬스 |
| OffBallScreen | +0.02 ~ +0.04 | 스크린 퀄리티 가산 |
| DriveKick | +0.02 ~ +0.04 | 드라이브 퀄리티 가산 |

---

## 5. 컨디션(Fatigue) 보정

```
fatigueOff = +(condition/100 - 0.70) × 0.10    // 공격측
fatigueDef = -(condition/100 - 0.70) × 0.05    // 수비측 (hitRate에 마이너스)
```

| 컨디션 | 공격 보정 | 수비 보정 | 순 효과 |
|--------|----------|----------|--------|
| 100 | +0.030 | -0.015 | **+0.015** |
| 85 | +0.015 | -0.008 | **+0.008** |
| 70 (중립) | 0.000 | 0.000 | **0.000** |
| 55 | -0.015 | +0.008 | **-0.008** |
| 40 | -0.030 | +0.015 | **-0.015** |

---

## 6. 능력치 구간별 FG% 테이블

조건: 평균 수비수 (intDef/perDef = 70), Iso (bonus=0), cond=100

### 6-1. 3PT — 비선형 커브 (THREE_OFF_CURVE)

> **v3 공식**: `hitRate = 0.34 + offMod(attr) - defAttr × CF × 0.001 + bonus + fatigue`

커브 breakpoints (`THREE_OFF_CURVE` in constants.ts):
```
[25, -0.234] → [40, -0.154] → [55, -0.084] → [70, -0.014]  (완만 감속)
[85, +0.046] → [90, +0.078] → [95, +0.110] → [99, +0.136]  (급경사)
```

#### CatchShoot (CF=1.00) vs 평균 수비 (perDef=56)

| 능력치 | offMod | FG% | 구간 |
|--------|--------|-----|------|
| 25 | -0.234 | 5.0% | 비슈터 |
| 30 | -0.201 | 8% | |
| 40 | -0.154 | 13% | |
| 50 | -0.107 | 18% | |
| 55 | -0.084 | 20% | 평균 이하 |
| 60 | -0.061 | 22% | |
| 70 | -0.014 | 27% | |
| 75 | +0.016 | 29% | |
| 80 | +0.026 | 31% | 리그 평균 부근 |
| 85 | +0.046 | 33% | ← plateau |
| 86 | +0.052 | 34% | ← 엘리트 진입 |
| 88 | +0.065 | 35% | |
| 90 | +0.078 | 36% | |
| 92 | +0.091 | 38% | |
| 95 | +0.110 | 39% | 엘리트 |
| 99 | +0.136 | 42% | 최고 (Curry급) |

**구간 편차: 25→99 = 37%p** (기존 선형: 9.8%p)

#### 코너 3PT 보너스
코너(zone_c3) 슛은 수비 회전이 느리고 거리가 짧아 **+1.5%p** 보너스 (THREE_CORNER_BONUS).
- 능력치 90 코너: **37.7%** (윙/탑 36.2% 대비 +1.5%p)
- 윙(zone_atb3) / 탑(zone_atb3_c): 기본값 유지, 차등 없음

기울기 변화:
- 25→85: 0.53→0.47→0.47→0.40 %p/attr (감속)
- 86→99: 0.64~0.65 %p/attr (60% 점프)

### 6-3. Mid — Pullup/Jumper (MID_OFF_CURVE, bonus=0)

> `hitRate = 0.38 + offMod(MID_OFF_CURVE) - defMod`
> Pullup CF=0.80 → defMod = 70×0.80×0.0012 = 0.067

| 능력치 | offMod | Pullup FG% | Jumper FG% | 구간 |
|--------|--------|------------|------------|------|
| 25 | -0.083 | 23% | 23% | 비슈터 |
| 40 | -0.033 | 28% | 28% | |
| 55 | +0.007 | 32% | 32% | 완만 |
| 70 | +0.047 | 36% | 36% | |
| 85 | +0.077 | 39% | 39% | plateau |
| 92 | +0.097 | 41% | 41% | ← 전환점 |
| 95 | +0.137 | 45% | 45% | 급경사 |
| 99 | +0.187 | 50% | 50% | 엘리트 |

### 6-4. Mid — Fadeaway (MID_OFF_CURVE, CF=0.40)

> `defMod = 70×0.40×0.0012 = 0.034`
> 발동 조건: postPlay≥80, mid≥85, closeShot≥85 (composite attr ~85+)

| 합성 능력치 | FG% | 비고 |
|------------|-----|------|
| 85 | 42% | 적격 최소 |
| 90 | 46% | |
| 92 | 44% | |
| 95 | 48% | |
| 99 | 53% | 엘리트 (Dirk/KD급) |

### 6-5. Rim — Layup (LAYUP_OFF_CURVE, CF=1.00)

> `hitRate = 0.57 + offMod(LAYUP_OFF_CURVE) - defMod`
> defMod = 70×1.0×0.0015 = 0.105

| 능력치 | offMod | FG% | 구간 |
|--------|--------|-----|------|
| 25 | -0.135 | 33% | 비슈터 |
| 40 | -0.105 | 36% | |
| 55 | -0.075 | 39% | 완만 |
| 70 | -0.045 | 42% | |
| 85 | -0.005 | 46% | plateau |
| 90 | +0.015 | 48% | ← 전환점 |
| 95 | +0.075 | 54% | 급경사 |
| 99 | +0.135 | 60% | 엘리트 |

Transition(+4%) 시: attr 90→52%, attr 99→64%

### 6-6. Rim — Dunk (DUNK_OFF_CURVE, CF=0.85, DUNK_DEF_COEFF=0.002)

> defMod = 70×0.85×0.002 = 0.119
> 덩크 게이트: vert≥70, str≥65

| 능력치 | offMod | FG% | 구간 |
|--------|--------|-----|------|
| 40 | +0.199 | 65% | 하위 |
| 55 | +0.269 | 72% | |
| 70 | +0.339 | 79% | 진입 |
| 80 | +0.389 | 84% | 평균 |
| 90 | +0.429 | 88% | 엘리트 |
| 99 | +0.469 | 92% | 최고 |

수비 스윙: **6.8pp** (전 샷 타입 최대)

### 6-7. Paint — Floater (FLOATER_OFF_CURVE, CF=0.60)

> defMod = 70×0.60×0.0015 = 0.063
> 발동 조건: closeShot ≥ 80

| 능력치 | offMod | FG% | 구간 |
|--------|--------|-----|------|
| 50 | -0.177 | 33% | 하위 |
| 70 | -0.107 | 40% | |
| 80 | -0.067 | 44% | 적격 최소 |
| 85 | -0.047 | 46% | |
| 90 | -0.027 | 48% | |
| 95 | -0.007 | 50% | |
| 99 | +0.013 | 52% | |

Cut(+3%) 시: attr 80→47%, attr 90→51%

### 6-8. Paint — Hook (HOOK_OFF_CURVE, CF=0.50)

> defMod = 70×0.50×0.0015 = 0.053
> 발동 조건: height ≥ 208 AND closeShot ≥ 80

| 합성 능력치 | offMod | FG% | 비고 |
|------------|--------|-----|------|
| 50 | -0.217 | 30% | 하위 |
| 70 | -0.107 | 41% | |
| 80 | -0.037 | 48% | 적격 평균 |
| 85 | -0.017 | 50% | |
| 90 | +0.003 | 52% | |
| 95 | +0.023 | 54% | |
| 99 | +0.033 | 55% | 엘리트 센터 |

PostUp(+1%) 시: attr 80→49%, attr 90→53%

---

## 7. 아키타입 보너스

### B-1. Mr. Fundamental (미드레인지 마스터)
- **조건**: zone=Mid AND `mid ≥ 97`
- **효과**: 클러치 시 +0.03, ISO 시 +0.03 (중첩 가능 → 최대 +0.06)

### B-2. Rangemaster (클러치 3점)
- **조건**: zone=3PT AND 클러치 AND `threeVal ≥ 90` AND `shotIq ≥ 85`
- **효과**: +0.015

### B-3. Tyrant (페인트 피니셔)
- **조건**: zone=Rim/Paint AND `ins ≥ 90` AND (`strength ≥ 88` OR `vertical ≥ 88`)
- **효과**: hitRate +0.015, 블록 확률 -0.03

### B-5. Afterburner (속공 피니셔)
- **조건**: playType=Transition AND `speed ≥ 95` AND `spdBall ≥ 90` AND `agility ≥ 93`
- **효과**: +0.02

### B-7. Deadeye (3점 컨테스트 저항)
- **조건**: `shotIq ≥ 88` AND `offConsist ≥ 88`
- **효과**: contestFactor × 0.90 (CatchShoot 기준 perDef 70 → +0.014 효과)

---

## 8. possessionHandler.ts 추가 보정

calculateHitRate에 들어가는 bonusHitRate에 합산되는 모디파이어들:

| 모디파이어 | 공식 | 범위 |
|-----------|------|------|
| assistQualityMod | (패서 passVision - 70) × 0.001 | ±0.030 |
| openDetectionMod | (패서 passVision - 70) × 0.0015 | ±0.045 |
| deliveryQualityMod | (패서 passAcc - 70) × 0.0008 | ±0.024 |
| shotDiscMod | tendencies.shotDiscipline × 0.015 | ±0.015 |
| momentumBonus | 런 기반 | 0 ~ +0.035 |
| foulDefPenalty | 수비수 파울 트러블 | 0 / +0.015 / +0.040 |
| lobBonus | PnR_Roll 로브 성공 시 | +0.08 |
| playmakingBonus (Clairvoyant) | passIq≥92, passVision≥90, passAcc≥90 | +0.02 |
| playmakingBonus (Overseer) | PnR_Roll/Pop, passIq≥88, passAcc≥95 | +0.03 |

---

## 9. 수비측 defRating 보정

```
defRating = baseDefRating + (defensiveMotor tendency) × 3
defRating += (defConsist - 70) × 0.3
// defConsist < 70이면 확률적 집중력 저하 (defRating × 0.7)
lapseChance = max(0, (70 - defConsist) × 0.003)
```

| defConsist | defRating 보정 | intDef=70 기준 실효 |
|-----------|---------------|-------------------|
| 50 | -6.0 | 64.0 |
| 60 | -3.0 | 67.0 |
| 70 | 0.0 | 70.0 |
| 80 | +3.0 | 73.0 |
| 90 | +6.0 | 76.0 |

---

## 10. 슬라이더 보정

| 슬라이더 | 공식 | 비고 |
|---------|------|------|
| defIntensity | -(defIntensity - 5) × 0.005 | 전 존 적용 |
| helpDef | -(helpDef - 5) × 0.008 | Rim/Paint만 |
| pace | -(pace - 5) × 0.01 | pace > 5일 때만 |
| 홈코트 | +0.02 | 홈팀 보너스 |

---

## 11. 밸런싱 이슈 요약

### 3PT: 비선형 커브 도입 완료 (v3)

기존 선형 `× 0.002` 방식의 3PT 변별력 부족 문제를 해결.

| 비교 구간 | 능력치 차이 | 기존 FG% 차이 | **v3 커브 FG% 차이** |
|----------|-----------|-------------|-------------------|
| 비슈터(50) → 엘리트(95) | 45 | 9.0%p | **21%p** |
| 평균(80) → 엘리트(95) | 15 | 3.0%p | **8%p** |
| 상급(90) → 최고(99) | 9 | 1.8%p | **6%p** |

커브 특성:
- **25→85**: 감속형 완만 곡선 (기울기 0.53→0.40, plateau)
- **86→99**: 급경사 (기울기 0.64~0.65, plateau 대비 60% 점프)
- attr 85까지 33% (리그 평균) → 86부터 엘리트 구간 진입

### Mid / Rim / Paint: 비선형 커브 도입 완료 (per-shotType)

기존 선형 `× 0.002`가 모든 샷 타입에 동일한 9.8pp 변별력만 제공하던 문제를 해결.
per-shotType 커브 + per-zone DEF_COEFF로 각 샷 타입별 현실적 FG% 분포 구현.

| 샷 타입 | 기존 선형 (attr=85) | **커브 (attr=85)** | NBA 현실 |
|---------|-------------------|--------------------|----------|
| Layup | 60.0% | **46%** | 55-65% (with bonus) |
| Dunk | 62.1% | **86%** | 85-90% |
| Pullup | 43.8% | **39%** | 38-45% |
| Floater | 65.6% | **46%** | 42-48% |
| Hook | 67.0% | **50%** | 50-55% |

수비 변별력 (DEF_COEFF × contestFactor):
| 샷 타입 | DEF_COEFF | 수비 스윙 (intDef 50→90) |
|---------|-----------|------------------------|
| Dunk | 0.002 | **6.8pp** (최대) |
| Layup | 0.0015 | 6.0pp |
| Jumper | 0.0012 | 4.1pp |
| Floater | 0.0015 | 3.6pp |
| Hook | 0.0015 | 3.0pp |
| Fadeaway | 0.0012 | 1.9pp |

---

## 12. shotIq + offConsist 일관성 시스템

**모든 존에 공통 적용**. 매 슛마다 두 종류의 마이크로 노이즈를 합산.

### 역할 분리

| 능력치 | 역할 | 노이즈 유형 |
|--------|------|-----------|
| **shotIq** | 좋은 타이밍에 좋은 샷을 고르는 능력 | **편향 노이즈**: 높으면 상방(0~+max), 낮으면 하방(-max~0) |
| **offConsist** | 매 슛의 실행 기복 폭 | **대칭 노이즈**: 70 미만일 때만 양방향(±range) |

### shotIq — 편향 노이즈

```
shotIqRange = (shotIq - 70) × 0.0008
shotIqNoise = shotIqRange > 0 ? random(0, +shotIqRange)  // 상방만
            : shotIqRange < 0 ? random(shotIqRange, 0)    // 하방만
```

| shotIq | 노이즈 범위 | 평균 효과 |
|--------|-----------|----------|
| 50 | -1.6%p ~ 0 | 평균 -0.8%p |
| 60 | -0.8%p ~ 0 | 평균 -0.4%p |
| 70 | 0 (중립) | 0 |
| 80 | 0 ~ +0.8%p | 평균 +0.4%p |
| 90 | 0 ~ +1.6%p | 평균 +0.8%p |
| 99 | 0 ~ +2.3%p | 평균 +1.2%p |

### offConsist — 대칭 노이즈

```
consistRange = max(0, (70 - offConsist)) × 0.0010
consistNoise = random(-consistRange, +consistRange)
```

| offConsist | 노이즈 범위 | 비고 |
|------------|-----------|------|
| 70+ | 0 | 안정 (노이즈 없음) |
| 60 | ±1.0%p | 가끔 흔들림 |
| 50 | ±2.0%p | 매 슛 기복 |
| 40 | ±3.0%p | 심한 기복 |

### 자연 아키타입 (shotIq × offConsist)

| shotIq | offConsist | 유형 | NBA 예시 |
|--------|-----------|------|----------|
| 높음 | 높음 | 가끔 보너스, 기복 없음 | Klay Thompson |
| 높음 | 낮음 | 가끔 보너스 + 양방향 기복 | JR Smith |
| 낮음 | 높음 | 가끔 페널티, 기복 없음 | Andre Roberson |
| 낮음 | 낮음 | 가끔 페널티 + 양방향 기복 | 루키급 |

### 기존 시스템과의 관계

| 시스템 | 레이어 | 영향 범위 | offConsist/shotIq 사용 방식 |
|--------|--------|---------|--------------------------|
| Hot/Cold streak | 매크로 (연속 성공/실패) | ±4% 캡 | offConsist → 콜드 스트릭 완화 |
| **일관성 노이즈** | **마이크로 (매 단발 슛)** | shotIq ±2.3%, offConsist ±3% | **편향/대칭 노이즈** |
| Deadeye | 아키타입 (임계값) | contestFactor ×0.90 | shotIq≥88, offConsist≥88 체크 |
| Clutch modifier | 클러치 한정 | ±보정 | shotIq 20% 가중치 |

두 시스템은 서로 다른 레이어에서 독립 작동 → **보완적**
