# 퇴화/노화 시스템

> 소스: `services/playerDevelopment/playerAging.ts` → `calculatePerGameDecline()`

## 개요

선수 능력치 퇴화는 **경기별(per-game)** 로 계산된다.
나이에 따라 두 가지 구간이 존재한다:

1. **유지 노이즈 구간** (peakAge ~ declineOnset) — 소폭 등락
2. **퇴화 구간** (declineOnset 이후) — 체계적 하락

---

## 1. 퇴화 구간 (age ≥ declineOnset)

### 공식

```
baseSeasonDecline = min(maxSeasonDecline, (yearsOver / 8) × maxSeasonDecline)

if age ≥ 33 && group ≠ iqSkill/never:
    baseSeasonDecline × (1.0 + (age - 33) × 0.15)   // 33세+ 가속

seasonDecline = baseSeasonDecline × (1 + variance) × declineRate + heightPenalty

perGameDecline = min(0.3, seasonDecline / 82) × mpRatio
```

### 변수 설명

| 변수 | 값/범위 | 설명 |
|------|--------|------|
| `yearsOver` | age - effectiveOnset | 퇴화 시작 후 경과 연수 |
| `maxSeasonDecline` | 속성별 (ATTR_CONFIG) | 시즌당 최대 퇴화량 |
| `variance` | -0.4 ~ +0.4 | 시드 기반 개인차 (±40%) |
| `declineRate` | 0.0~2.0 | 사용자 설정 노화 속도 배율 |
| `heightPenalty` | max(0, (현재값-70) × 0.03) | 능력치가 높을수록 빠르게 퇴화 (평균 회귀) |
| `mpRatio` | min(1.0, mp/36) | 출전시간 비례 |

### 핵심 메커니즘

- **점진적 가속**: `yearsOver / 8`로 퇴화가 서서히 강해짐 (8년 후 최대치 도달)
- **33세 가속**: iqSkill/never 그룹 제외, 33세 이후 매년 +15%씩 가속
- **평균 회귀**: 현재 능력치가 70 이상이면 추가 퇴화 (높은 능력치일수록 더 떨어짐)
- **바닥값**: `cfg.floor` 이하로 절대 떨어지지 않음 (38 또는 40)
- **1경기 캡**: `perGameDecline`은 최대 0.3 (시즌 최대 24.6 = 0.3 × 82)

---

## 2. 유지 노이즈 구간 (peakAge < age < declineOnset)

### 공식

```
seasonNoise = seededNormal(0, noiseStdev) × declineRate
perGameNoise = (seasonNoise / 82) × mpRatio
```

### 설명

퇴화 그룹(DECLINE_GROUPS)의 `peakAge` 이후부터 `declineOnset` 전까지, 체계적 퇴화는 아니지만 소폭 등락이 발생한다.

| 그룹 | noiseStdev | 시즌 등락 범위 (대략) |
|------|-----------|-------------------|
| earlyAthletic | 0.4 | ±1.0 |
| midPhysical | 0.4 | ±1.0 |
| lateStable | 0.3 | ±0.7 |
| iqSkill | 0.2 | ±0.5 |
| never | 0.0 | 없음 |

노이즈가 음수면 소폭 하락, 양수면 소폭 상승. 바닥/천장 제한 적용.

---

## 3. Athletic Resilience

`generateGrowthProfile()`에서 시드 기반으로 선수별 `athleticResilience`를 부여.

- 범위: -2 ~ +2
- 평균: 0
- **earlyAthletic 그룹만 적용**

```
effectiveOnset = cfg.declineOnset + athleticResilience
```

| athleticResilience | 효과 | 예시 (speed, onset=27) |
|-------------------|------|---------------------|
| +2 | 퇴화 2년 늦게 시작 | 29세부터 퇴화 |
| 0 | 기본 | 27세부터 퇴화 |
| -2 | 퇴화 2년 일찍 시작 | 25세부터 퇴화 |

speed, agility, vertical 같은 순수 신체 능력에만 적용되어, 같은 나이의 선수라도 운동 능력 유지 기간에 개인차가 생긴다.

---

## 4. 퇴화 시나리오 예시

### 27세 가드 (speed onset=27, athleticResilience=0)
- speed: 퇴화 시작 (yearsOver=0, 매우 소폭)
- agility: 퇴화 시작
- shotIq: 아직 peakAge(32) 전, 변화 없음

### 33세 포워드
- speed: yearsOver=6, 가속 적용 (33세+), 시즌 -4~5 감소
- layup: onset=38, 아직 퇴화 전
- passIq: onset=38, 아직 퇴화 전 (경험 성장 계속 가능)
- shotIq: iqSkill 유지 노이즈 구간 (peakAge=32 이후)

### 38세 베테랑
- speed: yearsOver=11, 최대 퇴화 + 33세 가속, 시즌 -6~8
- shotIq: onset=38, 이제 퇴화 시작하지만 iqSkill이라 33세 가속 없음
- layup: onset=38, 이제 퇴화 시작

---

## 5. 설정 (SimSettings)

| 설정 | 기본값 | 범위 | 설명 |
|------|-------|------|------|
| `declineRate` | 1.0 | 0.0~2.0 | 노화 속도 배율 (퇴화 + 유지 노이즈 모두에 곱셈) |

`declineRate = 0`이면 모든 퇴화가 차단된다.
`declineRate = 2.0`이면 2배속 노화.
