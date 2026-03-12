# Technical Foul & Flagrant Foul 시스템

## 개요

테크니컬 파울(TF)과 플래그런트 파울(FF)은 포제션당 **독립 이벤트**로 발생한다.
두 파울 모두 수비팀 코트 전원 중 텐던시 기반 **가중 랜덤**으로 대상을 선택하여,
특정 포지션(센터)에 편중되지 않고 성격/플레이 성향에 따라 분산된다.

---

## 1. Technical Foul (테크니컬 파울)

### 발동 조건
- 포제션당 base 확률: `TECHNICAL_FOUL_BASE = 0.003` (0.3%)
- 확률 roll 통과 시 → 수비팀 코트 전원 중 대상 선택

### 대상 선택: temperament 가중 커브
```
normalize(t) = max(0.05, (temperament + 1) / 2)   // -1~+1 → 0.05~1.0
weight = normalize(t) ^ TECH_TEMPERAMENT_POWER     // POWER = 2.0
```

| temperament | normalized | weight (^2.0) | 상대 비율 |
|-------------|-----------|---------------|----------|
| -1.0 (냉정) | 0.05 | 0.0025 | ~0.25% |
| -0.5 | 0.25 | 0.0625 | ~6.25% |
| 0.0 (중립) | 0.50 | 0.25 | ~25% |
| +0.5 | 0.75 | 0.5625 | ~56% |
| +1.0 (다혈질) | 1.00 | 1.00 | ~100% |

→ 다혈질(+1.0) 선수는 냉정(-1.0) 선수 대비 **400배** 높은 가중치.

### 처리
- PF **미합산**, 별도 `techFouls` 카운트
- FT 1개: 팀 내 베스트 슈터가 쏨
- 공격권 유지
- 테크니컬 2개 누적 → **퇴장** (pf = 6)

---

## 2. Flagrant Foul (플래그런트 파울)

### 설계 의도
플래그런트 파울은 위험한 하드 파울, 언네세서리 러프니스 등에서 발생.
`foulProneness`(파울 성향)가 주 영향, `temperament`(기질)가 보조 영향.

### 발동 방식 (2단계)

**Step 1: 대상 선택** — 수비팀 코트 전원 중 가중 랜덤
```
combined = foulProneness × 0.7 + temperament × 0.3
normalize(c) = max(0.02, (combined + 1) / 2)    // -1~+1 → 0.02~1.0
weight = normalize(c) ^ FLAGRANT_CURVE_POWER     // POWER = 2.5
```

**Step 2: 최종 발동 확률** — 선택된 선수의 합산값으로 확률 결정
```
ffChance = min(FLAGRANT_MAX_RATE, FLAGRANT_BASE × (1 + normalize^POWER × 3))
```

### 상수값
| 상수 | 값 | 설명 |
|------|-----|------|
| `FLAGRANT_BASE` | 0.0004 | 포제션당 베이스 확률 (0.04%) |
| `FLAGRANT_FOULPRONE_WEIGHT` | 0.7 | foulProneness 기여 비중 |
| `FLAGRANT_TEMPER_WEIGHT` | 0.3 | temperament 기여 비중 |
| `FLAGRANT_CURVE_POWER` | 2.5 | 커브 지수 (고값 선수 집중) |
| `FLAGRANT_MAX_RATE` | 0.0015 | 실링 0.15% |
| `FLAGRANT_2_CHANCE` | 0.10 | 플래그런트 중 F2 확률 10% |

### 시즌 예상치 (82경기, ~8,200포제션/팀)

| foulProneness | temperament | combined | normalized | ffChance | 시즌 예상 |
|---------------|------------|----------|-----------|----------|----------|
| -1.0 | -1.0 | -1.0 | 0.02 | ~0.04% | ~3개 |
| 0.0 | 0.0 | 0.0 | 0.50 | ~0.06% | ~5개 |
| +0.5 | +0.5 | +0.5 | 0.75 | ~0.08% | ~7개 |
| +1.0 | +1.0 | +1.0 | 1.00 | ~0.15% | ~12개 |

→ 클린 팀: 시즌 ~3개, 평균 팀: ~5개, 더티 팀: ~12개 (NBA 실제 범위 내).

### 처리
- **Flagrant 1**: PF 합산, FT 2개(파울 당한 공격자), 공격권 유지, `flagrantFouls` 카운트
- **Flagrant 2**: F1과 동일 + **즉시 퇴장** (pf = 6)
- F2 확률: 플래그런트 중 10% (`FLAGRANT_2_CHANCE`)

---

## 3. 이전 방식과의 차이

| 항목 | 이전 | 현재 |
|------|------|------|
| FF 발동 | 슈팅 파울의 5% 전환 | 독립 이벤트 (base 0.3%) |
| FF 대상 | 현재 defender 고정 | 수비팀 전원 가중 랜덤 |
| FF 텐던시 반영 | 없음 | foulProneness(70%) + temperament(30%) |
| TF 대상 | 현재 defender 고정 | 수비팀 전원 가중 랜덤 |
| TF 텐던시 | defender.temperament × 0.8 | 전원 temperament 커브 (power=2.0) |
| 센터 편중 | 심각 (~90%) | 텐던시 기반 분산 |

---

## 4. 관련 파일

| 파일 | 역할 |
|------|------|
| `services/game/config/constants.ts` | FOUL_EVENTS 상수 정의 |
| `services/game/engine/pbp/possessionHandler.ts` | 3.6~3.6.1 섹션: TF/FF 발동 + 대상 선택 |
| `services/game/engine/pbp/statsMappers.ts` | TF/FF 결과 처리 (스탯, FT, 퇴장) |
| `services/game/engine/commentary/textGenerator.ts` | TF/FF 해설 텍스트 |
| `utils/hiddenTendencies.ts` | temperament, foulProneness 생성 |
