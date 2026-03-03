# Rebound Logic (reboundLogic.ts)

## 개요
슛 실패 시 리바운드 해결을 담당하는 2단계 시스템.
1단계: 공격 리바운드(ORB) vs 수비 리바운드(DRB) 확률 판정
2단계: 해당 팀 5인 중 리바운더 선택

**파일**: `services/game/engine/pbp/reboundLogic.ts`
**호출 위치**: `statsMappers.ts` → `applyPossessionResult()` (miss, FT miss)

---

## 1단계: ORB% 확률 판정 (`calculateOrbChance`)

### 공식
```
orbChance = clamp(MIN, MAX, BASE + qualityAdj + sliderAdj)
```

### 상수 (constants.ts → SIM_CONFIG.REBOUND)
| 상수 | 값 | 설명 |
|------|------|------|
| `BASE_ORB_RATE` | 0.23 | NBA 평균 ORB% (2023-24: 22.8%) |
| `MIN_ORB_RATE` | 0.12 | 하한 |
| `MAX_ORB_RATE` | 0.38 | 상한 |
| `SLIDER_IMPACT` | 0.012 | 슬라이더 1포인트당 ORB% ±1.2% |
| `QUALITY_FACTOR` | 0.08 | 팀 리바운드 능력 차이 반영 계수 |

### qualityAdj (팀 능력치 차이)
```
offPower = Σ(공격팀 onCourt) [offReb × 0.6 + vertical × 0.2 + (height - 180) × 0.5 + hands × 0.1] × posBonus
defPower = Σ(수비팀 onCourt) [defReb × 0.6 + vertical × 0.2 + (height - 180) × 0.5 + hands × 0.1 + boxOut × 0.15] × posBonus
qualityAdj = (offPower / defPower - 1) × QUALITY_FACTOR
```

> **boxOut**: 수비 리바운드 파워(defPower)에만 `boxOut × 0.15` 가산. 박스아웃은 수비 기술(상대를 밀어내고 리바운드 포지션 확보)이므로 공격 리바운드 파워에는 포함되지 않음.

### posBonus (포지션 가중치)
| 포지션 | 가중치 |
|--------|--------|
| C | 1.3 |
| PF | 1.2 |
| 기타 | 1.0 |

### sliderAdj (슬라이더 보정)
```
sliderAdj = (offTeam.offReb - 5) × 0.012 - (defTeam.defReb - 5) × 0.012
```

---

## 2단계: 리바운더 선택 (`selectRebounder`)

코트 위 5인 중 가장 높은 점수를 받은 선수가 리바운드 획득.

### 점수 공식
```
score = (rebAttr × 0.6 + vertical × 0.2 + (height - 180) × 0.5 + hands × 0.1 + boxOutMod)
        × posBonus × shooterPenalty × archetypeBonus × random(0.7 + motorIntensity × 0.6)
```

- `rebAttr`: 공격 리바운드 → `offReb`, 수비 리바운드 → `defReb`
- `boxOutMod`: 수비 리바운드일 때만 `boxOut × 0.15`, 공격 리바운드일 때는 0
- `shooterPenalty`: 슈터 본인 = 0.3, 그 외 = 1.0
- `random`: `Math.random() × (0.7 + motorIntensity × 0.6)` — 히든 텐던시 motorIntensity 반영

### 히든 아키타입 보너스

#### F-1. Harvester (하베스터) — Andre Drummond, DeAndre Jordan
- **조건**: offReb ≥ 95 OR defReb ≥ 95
- **효과**: score × 1.3

#### F-2. Raider (레이더) — Dennis Rodman, Charles Barkley
- **조건**: height ≤ 200 AND offReb ≥ 90 AND vertical ≥ 90
- **적용**: 공격 리바운드 전용
- **효과**: score × 1.4

---

## API

### `resolveRebound(homeTeam, awayTeam, shooterId)`
- **입력**: 양 팀 상태 + 슈터 ID
- **출력**: `{ player: LivePlayer, type: 'off' | 'def' }`
- 슈터 팀 자동 판별 → 1단계 → 2단계 → 결과 반환

### `calculateOrbChance(offTeam, defTeam)`
- **출력**: 0.12 ~ 0.38 범위의 ORB% 확률
- 외부에서 직접 호출 가능 (export됨)

---

## 수정 시 주의사항
- 리바운드 스탯 기록은 `statsMappers.ts`에서 처리 (reb, offReb, defReb 증가)
- 자유투 미스 리바운드도 동일한 `resolveRebound` 호출
- `motorIntensity` 텐던시가 없는 선수는 기본값 1.0 적용
