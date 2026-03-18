# 선수 기분 시스템 (Player Morale System)

## 개요

선수 기분(Morale)은 경기 퍼포먼스와 출전 시간에 따라 매 경기 소폭 변동하며,
**PBP 엔진의 슈팅 히트레이트에 직접 보정값으로 반영**된다.
기분이 좋은 선수는 슛이 잘 들어가고, 기분이 나쁜 선수는 퍼포먼스가 소폭 저하된다.

> 인기(Popularity)가 재정과 연결된다면, 기분(Morale)은 **퍼포먼스**와 연결된다.

---

## 데이터 구조

```ts
// types/player.ts

export type MoraleEventType =
    | 'TEAM_WIN'      // 팀 승리
    | 'TEAM_LOSS'     // 팀 패배
    | 'MINUTES_HIGH'  // 32분 이상 출전
    | 'MINUTES_LOW'   // 15분 미만 출전
    | 'GREAT_GAME'    // 개인 호성적 (25pts+ 또는 15pts+8reb/ast)
    | 'BAD_GAME'      // 개인 저조 (6pts 미만 + FGA 5+ + FG% 30% 미만)
    | 'STAR_IGNORED'; // 스타(OVR 85+)인데 20분 미만 출전

export interface MoraleEvent {
    type: MoraleEventType;
    delta: number;   // 실제 적용된 기분 변화량 (감쇠 전 원본)
    date: string;    // 경기 날짜 'YYYY-MM-DD'
}

export interface PlayerMorale {
    score: number;               // 0~100 (50 = 중립)
    recentEvents: MoraleEvent[]; // 최근 10개 이벤트 (UI 툴팁용)
}

// Player, SavedPlayerState 모두에 optional 필드로 추가
morale?: PlayerMorale;
```

- `score 50` = 중립. 0에 가까울수록 의기소침, 100에 가까울수록 최고조.
- `recentEvents`는 UI 툴팁 표시를 위한 슬라이딩 윈도우(최대 10개)이며 게임 플레이에는 영향 없다.

---

## 구현 파일

| 파일 | 역할 |
|------|------|
| `services/moraleService.ts` | 핵심 로직 — 초기값 생성, 경기 후 업데이트, 오프시즌 수렴, UI 라벨 |
| `types/player.ts` | `MoraleEventType` / `MoraleEvent` / `PlayerMorale` 타입 정의 |
| `services/game/engine/pbp/pbpTypes.ts` | `LivePlayer.morale: number` 런타임 필드 |
| `services/game/engine/pbp/initializer.ts` | `morale: p.morale?.score ?? 50` 초기화 |
| `services/game/engine/pbp/possessionHandler.ts` | `bonusHitRate`에 moraleBonus 합산 |
| `services/simulation/userGameService.ts` | `updateMoraleFromGame()` 훅 |
| `services/simulation/cpuGameService.ts` | `updateMoraleFromGame()` 훅 |
| `services/simulation/batchSeasonService.ts` | `updateMoraleFromGame()` 훅 (2곳) |
| `services/playerDevelopment/playerAging.ts` | `decayMoraleOffseason()` 훅 |
| `services/snapshotBuilder.ts` | morale 스냅샷 포함 |
| `hooks/useGameData.ts` | morale 저장/복원 |

---

## 작동 원리 (Life Cycle)

```
시즌 시작
    │
    └─ 기분값 없는 선수 → generateInitialMorale() → score: 45~55 (지터 ±5)

경기 시뮬레이션 (매 경기)
    │
    ├─ PBP 엔진 초기화 (initializer.ts)
    │     LivePlayer.morale = player.morale?.score ?? 50
    │
    ├─ possessionHandler.ts (슈팅 포세션마다)
    │     moraleBonus = ((actor.morale - 50) / 50) * 0.018
    │     → bonusHitRate에 합산
    │     → score=50: ±0% / score=100: +1.8% / score=0: -1.8%
    │
    └─ 경기 종료 후 (userGameService / cpuGameService / batchSeasonService)
          updatePopularityFromGame() 다음 줄에서
          updateMoraleFromGame() 호출
          → 이벤트 판정 → delta 합산 → 천장/바닥 감쇠 → score 갱신

오프시즌
    └─ processOffseason() 내부
          decayMoraleOffseason()
          → score를 중립(50) 방향으로 gap × 20% 회귀 (최소 1포인트)
          → recentEvents 초기화

저장/복원
    ├─ snapshotBuilder.ts: morale → replay_snapshot entry
    └─ useGameData.ts: savedState.morale → player.morale 복원
```

---

## 이벤트 테이블

| 이벤트 | 조건 | 기분 delta |
|--------|------|-----------|
| TEAM_WIN | 팀이 이긴 경기 | **+0.4** |
| TEAM_LOSS | 팀이 진 경기 | **-0.3** |
| MINUTES_HIGH | 출전 시간 ≥ 32분 | **+0.3** |
| MINUTES_LOW | 출전 시간 < 15분 | **-0.5** |
| GREAT_GAME | 25점+ 또는 (15점+ AND REB/AST ≥ 8) | **+0.3** |
| BAD_GAME | 6점 미만 AND FGA ≥ 5 AND FG% < 30% | **-0.2** |
| STAR_IGNORED | OVR ≥ 85 AND 출전 시간 < 20분 | **-0.3** |

> 한 경기에서 여러 이벤트가 동시에 발생 가능하다 (예: TEAM_WIN + MINUTES_HIGH + GREAT_GAME = +1.0).

---

## 천장/바닥 감쇠 (Ceiling Dampening)

score가 극단(0 또는 100)에 가까울수록 추가 변화 속도가 줄어든다.

```
dampFactor = 1 - |score - 50| / 120
totalDelta  = rawDelta * dampFactor
```

| score | dampFactor | 예시 (+0.4 raw) |
|-------|-----------|----------------|
| 50 (중립) | 1.00 | +0.40 |
| 70 | 0.83 | +0.33 |
| 85 | 0.71 | +0.28 |
| 95 | 0.63 | +0.25 |
| 100 | 0.58 | +0.23 |

100에 도달해도 TEAM_WIN 연속으로는 완전히 멈추지 않고 천천히 수렴한다.

---

## PBP 엔진 연결

`possessionHandler.ts`의 `calculateHitRate()` 호출 직전에 `bonusHitRate` 합산에 포함된다.

```ts
bonusHitRate
  + zoneQualityMod
  + getMomentumBonus(...)
  + foulDefPenalty
  + shotDiscMod
  + egoMod
  + assistQualityMod
  + openDetectionMod
  + deliveryQualityMod
  + lobBonus
  + playmakingBonus
  + ((actor.morale - 50) / 50) * 0.018   // ← moraleBonus
```

**영향 범위:**
- score 100 → **+1.8%p** 히트레이트 보너스 (최고조)
- score 75 → **+0.9%p**
- score 50 → **±0%** (중립, 영향 없음)
- score 25 → **-0.9%p**
- score 0 → **-1.8%p** 히트레이트 페널티 (위기)

현실 NBA에서 선수 기분이 개인 퍼포먼스에 미치는 영향은 실제로 측정하기 어렵다.
±1.8%p는 의도적으로 **감지 가능하지만 게임을 지배하지 않는** 수준으로 설계되었다.
(참고: hotColdRating은 최대 ±3~4%p, momentumBonus는 ±2~3%p 수준)

---

## 오프시즌 중립 수렴

시즌이 끝나면 기분이 중립(50) 방향으로 회귀한다.

```ts
gap   = score - 50
decay = sign(gap) * max(1, |gap| * 0.20)
score = score - decay
```

| 오프시즌 전 score | 회귀량 | 오프시즌 후 score |
|-------------------|--------|-------------------|
| 95 | -9 | 86 |
| 80 | -6 | 74 |
| 65 | -3 | 62 |
| 50 | 0 | 50 |
| 35 | +3 | 38 |
| 20 | +6 | 26 |

또한 `recentEvents` 배열은 오프시즌 후 초기화되어 새 시즌 시작 시 UI에 이전 시즌 이벤트가 표시되지 않는다.

---

## 기분 라벨 (UI 표시)

`getMoraleLabel(score: number)` 함수 반환값:

| score 범위 | 라벨 |
|------------|------|
| 90~100 | 최고조 |
| 80~89 | 매우 좋음 |
| 70~79 | 좋음 |
| 60~69 | 괜찮음 |
| 50~59 | 보통 |
| 40~49 | 약간 침울 |
| 30~39 | 불만 |
| 20~29 | 매우 불만 |
| 10~19 | 사기 저하 |
| 0~9 | 위기 |

`getMoraleEventLabel(type: MoraleEventType)` — 이벤트 타입을 한국어 문자열로 변환 (툴팁 표시용).

---

## 저장/복원 패턴

인기(Popularity)와 동일한 패턴을 따른다.

```
[저장]
snapshotBuilder.ts
  hasMorale = !!player.morale
  → replay_snapshot entry에 morale 포함

useGameData.ts (roster_state 폴백)
  hasMorale = !!p.morale
  → rosterState[id].morale = p.morale

[복원]
useGameData.ts
  savedState.morale → player.morale 재할당
```

---

## 초기값 생성 (`generateInitialMorale`)

```
score = 50 + jitter   (jitter: -5 ~ +5 균등 랜덤)
→ clamp(30, 70)
recentEvents = []
```

- 모든 선수는 첫 경기 전 **45~55** 범위의 중립 기분으로 시작한다.
- 이후 경기 결과에 따라 자연스럽게 분화된다.

---

## 설계 원칙

1. **미세 누적**: popularity와 달리 morale은 0.x 단위의 소수점 직접 누적.
   정수 반올림 없이 score 자체가 부동소수점으로 관리된다.

2. **천장/바닥 감쇠**: 극단에 도달하기 어렵도록 설계. 100/0 은 이론적 상한/하한.

3. **PBP 내 적용 대상**: bonusHitRate에만 영향. 파울 확률, 리바운드, 턴오버에는 영향 없음.
   과도한 시스템 복잡도 방지.

4. **이벤트 이력**: 최대 10개. 너무 많으면 UI 노이즈, 너무 적으면 정보 부족.

5. **트레이드 요청 연동 (미구현)**: score < 25 구간에서 트레이드 요청 이벤트 발생 예정.

---

## 향후 확장 계획

| 기능 | 설명 |
|------|------|
| 트레이드 요청 | score < 25 → 인박스 TRADE_REQUEST 이벤트 |
| 로커룸 케미스트리 | 팀 평균 morale → 팀 전술 보정 |
| 계약 연장 의향 | score가 낮으면 재계약 요구 연봉 상승 |
| loyalty 트레잇 연결 | loyalty 높을수록 STAR_IGNORED 페널티 감소 |
| PlayerDetailView UI | score + recentEvents 툴팁 표시 |
