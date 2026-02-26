# 클러치 메카닉

> 관련 파일: `services/game/engine/pbp/liveEngine.ts`, `flowEngine.ts`, `pbpTypes.ts`

## 개요

Q4 접전 상황에서 선수의 멘탈 능력치(intangibles, offConsist, shotIq)가 슈팅 확률에 영향을 미치는 시스템. 강심장 선수는 클러치에서 더 정확하고, 약한 멘탈의 선수는 프레셔에 눌려 확률이 떨어진다.

---

## 1. 클러치 진입 조건

```typescript
// liveEngine.ts — stepPossession() 내
const isClutch      = quarter >= 4 && gameClock <= 300 && scoreDiff <= 10;
const isSuperClutch = quarter >= 4 && gameClock <= 120 && scoreDiff <= 5;
```

| 단계 | 조건 | 설명 |
|------|------|------|
| **Clutch** | Q4 + 잔여 5분 이하 + 점수차 10점 이내 | 일반 클러치 |
| **Super Clutch** | Q4 + 잔여 2분 이하 + 점수차 5점 이내 | 극한 클러치 |

---

## 2. ClutchContext 타입

```typescript
interface ClutchContext {
    isClutch: boolean;
    isSuperClutch: boolean;
    trailingTeamSide: 'home' | 'away' | null;  // 지고 있는 팀
    scoreDiff: number;                          // 절대값 점수차
    desperation: number;                        // 0.0 ~ 1.0
}
```

### 절박도(desperation) 계산

```typescript
const timeUrgency   = 1 - (gameClock / 300);           // 300초→0, 0초→1
const scorePressure = Math.min(1, scoreDiff / 10);     // 0점→0, 10점→1
const desperation   = timeUrgency * 0.6 + scorePressure * 0.4;
```

- 시간이 적을수록 + 점수차가 클수록 절박도 상승
- 현재 코드에서 `desperation`은 계산만 되고 직접 사용되지 않음 (향후 확장용)

---

## 3. 슈팅 확률 보정 (flowEngine.ts — calculateHitRate)

```typescript
// 7. Clutch Modifier
if (clutchContext?.isClutch) {
    const clutchRating = (
        actor.attr.intangibles * 0.50 +
        actor.attr.offConsist  * 0.30 +
        actor.attr.shotIq      * 0.20
    ) / 100;

    const clutchModifier = (clutchRating - 0.70) * 0.10;

    hitRate += isSuperClutch ? clutchModifier * 1.5 : clutchModifier;
    hitRate -= 0.015;  // 전체 프레셔 페널티
}
```

### 능력치 가중치

| 능력치 | 비중 | 역할 |
|--------|------|------|
| intangibles | 50% | 클러치 유전자, 강심장 |
| offConsist | 30% | 공격 일관성 (흔들리지 않는 정도) |
| shotIq | 20% | 샷 셀렉션 (압박 속 올바른 판단) |

### 보정 계산 예시

**clutchRating** = 가중 평균 / 100

**clutchModifier** = (clutchRating - 0.70) × 0.10
- 기준점 = 0.70 (능력치 70)
- 기준 초과 → 양수 보정, 기준 미만 → 음수 보정

| 선수 유형 | intangibles | offConsist | shotIq | clutchRating | Modifier |
|-----------|-------------|------------|--------|--------------|----------|
| 클러치 퍼포머 | 90 | 85 | 80 | 0.865 | +1.65% |
| 평균 선수 | 70 | 70 | 70 | 0.700 | ±0% |
| 약한 멘탈 | 50 | 55 | 60 | 0.530 | -1.70% |

### Super Clutch 배율

- 일반 Clutch: `clutchModifier × 1.0`
- Super Clutch: `clutchModifier × 1.5`
  - 클러치 퍼포머: +1.65% → **+2.48%**
  - 약한 멘탈: -1.70% → **-2.55%**

### 전체 프레셔 페널티

모든 선수에게 일괄 **-1.5%** 적용. 클러치 상황에서 전반적인 슈팅 효율 하락을 시뮬레이션.

---

## 4. 최종 영향 범위

```
일반 Clutch:  약 -3.2% ~ +0.15% (프레셔 페널티 포함)
Super Clutch: 약 -4.05% ~ +0.98%
```

- 클러치 능력이 뛰어난 소수의 선수만 프레셔 페널티를 상쇄하고 양수 보정
- 대부분의 선수는 클러치에서 슈팅 효율이 소폭~중폭 하락
- 이는 NBA 실제 데이터와 일치: 클러치 FG%는 전체 FG%보다 평균 2~3% 낮음

---

## 5. 홈코트 어드밴티지와의 상호작용

```typescript
// flowEngine.ts
if (isHome) hitRate += 0.02;  // HOME_ADVANTAGE = 2%
```

- 클러치 보정과 독립적으로 적용
- 홈 팀의 클러치 선수는 추가 +2%의 이점
- 원정팀 약한 멘탈 선수: 클러치 패널티 + 홈 어드밴티지 부재 = 최대 ~5% 불리

---

## 6. 데이터 흐름

```
stepPossession()
    ├─ scoreDiff, gameClock, quarter 계산
    ├─ isClutch / isSuperClutch 판정
    ├─ ClutchContext 객체 생성
    └─ simulatePossession(state, { clutchContext })
            └─ calculateHitRate(..., clutchContext)
                   └─ hitRate에 clutchModifier + 프레셔 페널티 적용
```
