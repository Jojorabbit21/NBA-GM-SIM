# 성장 시스템

> 소스: `services/playerDevelopment/playerAging.ts` → `calculatePerGameGrowth()`

## 개요

선수 능력치 성장은 **경기별(per-game)** 로 계산된다.
두 가지 독립적인 성장 경로가 존재한다:

1. **퍼포먼스 기반 성장** — 30세 미만, 실제 경기 퍼포먼스에 비례
2. **IQ 경험 성장** — 나이 무관, 정신적 속성 한정, **리그 평균 초과** 퍼포먼스에만 반영

---

## 1. 퍼포먼스 기반 성장

### 조건
- `growable: true`인 속성만 대상
- 나이 < 30세 (`ageFactor > 0`)
- `perfMult > 0` (리그 평균 2σ 이내)

### 공식

```
delta = (BASE_GROWTH_RATE × ageFactor × growthRate / 82)
      × perfMult × mpRatio × attrAffinity × growthMult × consistencyMult
```

최종 delta는 `maxPerGameGrowth`로 캡된다.

### 변수 설명

| 변수 | 값/범위 | 설명 |
|------|--------|------|
| `BASE_GROWTH_RATE` | 1.5 | 기본 성장 상수 (시즌당 기대 성장량) |
| `ageFactor` | 0.0~1.0 | 나이 계수 (아래 표 참조) |
| `growthRate` | 0.0~2.0 | 사용자 설정 성장 속도 배율 |
| `perfMult` | 0.0~2.5 | 카테고리별 퍼포먼스 배율 |
| `mpRatio` | 0.0~1.0 | `min(1.0, mp / 36)` — 출전시간 비례 |
| `attrAffinity` | 0.3~2.0 | 선수별 속성 친화도 (시드 기반) |
| `growthMult` | 0.0~1.0 | 천장 소프트캡 계수 |
| `consistencyMult` | 0.8~1.13 | 히든 텐던시 consistency 기반 보정 |

### 나이 계수 (ageFactor)

| 나이 | ageFactor | 설명 |
|------|-----------|------|
| ≤21 | 1.0 | 최대 성장 |
| 22~26 | 1.0 → 0.2 (선형) | 점진적 감소 |
| 27~29 | 0.1 | 최소 성장 |
| ≥30 | 0.0 | 퍼포먼스 기반 성장 차단 |

### 천장 소프트캡 (growthMult)

`ceiling = player.potential + 3`

| 현재값 위치 | growthMult | 설명 |
|------------|-----------|------|
| ≤ ceiling - 8 | 1.0 | 제한 없음 |
| ceiling - 8 ~ ceiling | 0.1 ~ 1.0 (선형) | 점진적 감속 |
| > ceiling | 지수 감소 | 거의 성장 불가 |

포텐셜이 높은 선수일수록 천장이 높아 더 많이 성장할 수 있다.

### 기대 성장량 (시즌당, growthRate=1.0)

| 선수 프로필 | 성장/속성/시즌 | 설명 |
|------------|--------------|------|
| 21세, 평균 퍼포먼스, 평균 친화도 | +1~2 | 기본 성장 |
| 21세, 우수(1.5×), 높은 친화도(1.5×) | +3~4 | 유망주 급성장 |
| 24세, 평균 | +0~1 | 감속 구간 |
| 28세, 우수 | ~0 | 거의 성장 없음 |

---

## 2. IQ 경험 성장

### 대상 속성 (7개)

| 속성 | 매핑 카테고리 | 설명 |
|------|-------------|------|
| shotIq | out | 슈팅 잘해야 성장 |
| offConsist | ins, out | 인사이드+아웃사이드 퍼포먼스 |
| passIq | plm | 어시스트/핸들링 잘해야 성장 |
| passVision | plm | 어시스트/핸들링 잘해야 성장 |
| helpDefIq | def | 수비 잘해야 성장 |
| passPerc | def | 수비 잘해야 성장 |
| defConsist | def | 수비 잘해야 성장 |

### 공식

```
excessPerf = max(0, iqPerfMult - 1.0)    ← 리그 평균 초과분만
delta = EXP_GROWTH_RATE × excessPerf × mpRatio × growthMult × growthRate × focusDriftMult
```

| 변수 | 값 | 설명 |
|------|---|------|
| `EXP_GROWTH_RATE` | 0.025 | IQ 경험 성장 기본값 |
| `iqPerfMult` | 0.0~2.5 | 해당 속성의 perfStats 카테고리 퍼포먼스 평균 |
| `excessPerf` | 0.0~1.5 | 리그 평균(1.0) 초과분 — 핵심 게이트 |
| `focusDriftMult` | 0.7~1.0 | 히든 텐던시 focusDrift 기반 보정 |

### excessPerf 게이트

| perfMult | excessPerf | 의미 |
|----------|-----------|------|
| 0.7 | 0 | 평균 이하 → IQ 성장 **없음** |
| 1.0 | 0 | 딱 평균 → IQ 성장 **없음** |
| 1.5 | 0.5 | 평균 이상 → 절반 속도 |
| 2.0 | 1.0 | 우수 → 정상 속도 |
| 2.5 | 1.5 | 엘리트 → 1.5배 속도 |

### 핵심 특징
- **나이 제한 없음** — 30세 이상도 경험 기반으로 IQ 성장 가능
- **리그 평균 초과 필수** — 평균 이하 퍼포먼스는 IQ 경험 성장 불가
  - 예: 스코어링 가드가 수비 평균 이하 → helpDefIq/passPerc/defConsist 성장 없음
  - 예: 엘리트 투웨이 플레이어는 공수 모든 IQ 성장
- **30세 미만은 영향 제한적** — 퍼포먼스 기반 성장(perfMult > 0)으로도 IQ 성장 가능
- 퍼포먼스 기반 성장과 **중복 적용** (30세 미만 IQ 속성은 두 경로 합산 → maxPerGameGrowth 캡)

---

## 3. 히든 텐던시 보정

`processGameDevelopment()`에서 선수별 히든 텐던시를 성장에 반영한다.

| 텐던시 | 범위 | 대상 경로 | 보정 공식 | 효과 |
|--------|------|----------|----------|------|
| `consistency` | 0.0~1.0 (평균 0.6) | 퍼포먼스 기반 | `0.8 + consistency × 0.33` | 꾸준한 선수 → 스킬 성장 효율 ↑ |
| `focusDrift` | 0.0~1.0 | IQ 경험 | `1.0 - focusDrift × 0.3` | 집중력 부족 → IQ 성장 ↓ |

### 예시

| consistency | consistencyMult | 의미 |
|------------|----------------|------|
| 0.0 | 0.80x | 불안정한 선수 |
| 0.6 | 1.00x | 평균 |
| 1.0 | 1.13x | 매우 꾸준한 선수 |

| focusDrift | focusDriftMult | 의미 |
|-----------|----------------|------|
| 0.0 | 1.0x | 집중력 우수 |
| 0.5 | 0.85x | 보통 |
| 1.0 | 0.7x | 집중력 부족 |

---

## 4. 퍼포먼스 배율 (perfMult) 계산

`computeCatPerfMultipliers()` 함수가 각 경기의 박스스코어에서 6개 카테고리별 배율을 산출한다.

### 입력 스탯 → 카테고리 매핑

| 박스스코어 스탯 | 매핑 카테고리 | 비고 |
|---------------|-------------|------|
| pts (득점) | ins, out | |
| p3m (3점 성공) | out | |
| insideMakes (림+페인트) | ins | zoneData 기반 |
| fgPct (야투%) | ins, out | |
| ast (어시스트) | plm | |
| -tov (턴오버, 음수) | plm, out | 적을수록 좋음 |
| stl (스틸) | def | |
| blk (블록) | def | |
| -pf (파울, 음수) | def | 적을수록 좋음 |
| reb (리바운드) | reb | |

### 계산 방식

1. 각 스탯의 z-score 계산: `(stat - leagueAvg) / leagueStd`
2. 카테고리별 z-score 평균
3. `perfMult = clamp(1.0 + avgZ × 0.5, 0, 2.5)`

| perfMult | 의미 |
|----------|------|
| 0.0 | 리그 평균 2σ 이하 → 퍼포먼스 기반 성장 없음 |
| 1.0 | 리그 평균 수준 |
| 2.5 | 리그 최상위 퍼포먼스 |

**ath 카테고리**는 퍼포먼스 스탯이 없으므로 출전시간 비례: `0.3 + mpRatio × 1.7`

---

## 5. 속성 친화도 (attrAffinity)

`generateGrowthProfile()`에서 시드 기반으로 선수별 37개 속성 각각에 친화도를 부여.

- 범위: 0.3 ~ 2.0
- 평균: 1.0
- 표준편차: 0.4

같은 tendencySeed + playerId → 항상 동일한 친화도 (결정론적).
선수 A는 슈팅에 친화도 1.8, 패스에 0.5일 수 있어 개인차를 만든다.

---

## 6. 설정 (SimSettings)

| 설정 | 기본값 | 범위 | 설명 |
|------|-------|------|------|
| `growthRate` | 1.0 | 0.0~2.0 | 성장 속도 배율 (성장 공식 전체에 곱셈) |

`growthRate = 0`이면 모든 성장이 차단된다.
`growthRate = 2.0`이면 2배속 성장.
