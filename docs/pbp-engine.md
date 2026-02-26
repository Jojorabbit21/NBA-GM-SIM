# PBP 엔진 상세 문서

> NBA-GM-SIM의 Play-by-Play 엔진 내부 구조, 확률 계산, 선수 역할 결정 과정을 상세히 기록.
> 위치: `services/game/engine/pbp/`

---

## 파일 구조 및 의존 관계

```
services/game/engine/pbp/
├── main.ts               ← 4쿼터 게임 루프 (Entry)
│     ├─ initializer.ts   ← 팀 상태 초기화 (LivePlayer 생성)
│     ├─ possessionHandler.ts ← 포세션별 결과 계산
│     │     ├─ playTypes.ts   ← 플레이타입 선택 및 배우 결정
│     │     │     └─ usageSystem.ts ← Option Rank 계산
│     │     ├─ flowEngine.ts  ← 슈팅 성공률 계산
│     │     │     └─ aceStopperSystem.ts ← Ace vs Stopper 매칭업
│     │     └─ reboundLogic.ts ← 리바운더 선택
│     ├─ statsMappers.ts  ← 결과 적용 (스탯 기록, PBP 로그)
│     │     └─ handlers/statUtils.ts ← Zone 스탯, +/- 업데이트
│     ├─ stateUpdater.ts  ← 피로도 소모, 분 기록
│     │     └─ fatigueSystem.ts ← 피로도 계산
│     ├─ rotationLogic.ts ← 로테이션 맵 기반 교체
│     ├─ substitutionSystem.ts ← 응급 교체 (부상/파울아웃)
│     ├─ timeEngine.ts    ← 포세션 시간 계산
│     ├─ archetypeSystem.ts ← 12가지 역할 점수 계산
│     ├─ shotDistribution.ts ← 존별 슈팅 분포
│     └─ pbpTypes.ts      ← 타입 정의 (LivePlayer, TeamState, etc.)

services/game/engine/
├── fatigueSystem.ts       ← 피로도 소모량 계산
├── aceStopperSystem.ts    ← Ace Stopper 효과 계산

services/game/config/
├── constants.ts           ← SIM_CONFIG (기본 확률 상수)
├── usageWeights.ts        ← PLAY_TYPE_USAGE_WEIGHTS (Option Rank별 가중치)
└── tacticPresets.ts       ← DEFAULT_SLIDERS

services/game/tactics/
└── tacticGenerator.ts     ← generateAutoTactics() (AI팀 자동 전술 생성)
```

---

## 핵심 타입

```typescript
// 코트 위 선수 상태 (LivePlayer)
{
    id: string,
    name: string,
    position: string,
    attr: Player['base_attributes'],   // NBA 2K 능력치 전체
    archetypes: ArchetypeScores,       // 역할 점수 (12개)
    optionRank: 1|2|3|4|5,            // 팀 내 옵션 순위
    currentCondition: number,          // 현재 피로도 (0-100)
    mp: number,                        // 누적 플레이 분
    stats: BoxScoreAccumulator,        // 누적 통계
    isStopper: boolean,                // Ace Stopper 여부
    isOnCourt: boolean,
    isShutdown: boolean,               // 피로도 < 20 교체 대기
}

// 포세션 결과
interface PossessionResult {
    type: 'score' | 'miss' | 'turnover' | 'foul',
    playType: PlayType,
    actor: LivePlayer,                 // 주 공격자 (슈터 or 턴오버 선수)
    defender: LivePlayer,
    secondaryActor?: LivePlayer,       // 어시스터 or 스크리너
    points: number,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT',
    isBlock: boolean,
    isSteal: boolean,
    rebounder?: LivePlayer,
    reboundType?: 'off' | 'def',
    isOffensiveRebound: boolean,       // 공격 리바운드 → 포세션 유지
    isAndOne: boolean,
    isBonus: boolean,                  // 팀 파울 5개 이상
    hitRate: number,                   // 최종 슈팅 성공률
    matchupEffect?: number,            // Ace Stopper 효과 (-50 ~ +40)
}
```

---

## 게임 루프 (main.ts)

```
runFullGameSimulation(homeTeam, awayTeam, userTactics, homeB2B, awayB2B, depthCharts)

1. 초기화 (initializer.ts)
   ├─ initTeamState(team, tactics) → TeamState
   │   ├─ 선수별 archetypes 계산 (archetypeSystem.ts)
   │   ├─ optionRank 배정 (usageSystem.ts)
   │   └─ LivePlayer 배열 생성
   └─ GameState = { home, away, quarter:1, gameClock:720, possession:'home' }

2. 4쿼터 루프
   for Q in 1..4:
     gameClock = 720  // 12분
     while gameClock > 0:
       A. simulatePossession(state) → PossessionResult
       B. calculatePossessionTime(state, playType) → 시간(초)
       C. applyPossessionResult(state, result) → 스탯 기록 + 로그
       D. gameClock -= timeTaken
       E. updateOnCourtStates(state, timeTaken) → 피로도 소모 + 분 기록
       F. checkAndApplyRotation() → 로테이션 맵 기반 교체
       G. checkSubstitutions() → 응급 교체
       H. 포세션 전환 (offReb이면 유지, shotClock=14)

3. 결과 수집
   return SimulationResult {
     homeScore, awayScore,
     homeBox, awayBox,
     pbpLogs, rotationData, pbpShotEvents, injuries
   }
```

---

## 포세션 처리 상세 (possessionHandler.ts)

### 1단계: 턴오버 선 체크

```
baseTovProb = 0.08

modifiers:
  + max(0, (ballMovement - 5) * 0.004)   // 볼 무브먼트 높을수록 패스 리스크
  + max(0, (defIntensity - 5) * 0.008)   // 수비 강도
  + max(0, (70 - handling) * 0.001)      // 핸들링 부족
  + max(0, (70 - passIq) * 0.001)        // 패스 IQ 부족
  + PlayType 보정:
    Transition: +0.03
    PostUp: +0.02
    Iso: +0.01

totalTovProb = clamp(0.02, 0.25, sum)

if Random < totalTovProb:
  → Turnover
  → Steal 여부 결정:
    baseStealRatio = 0.50
    + stl >= 90: +0.20
    + stl >= 80: +0.10
    + passPerc>=85 && agility>=85: +0.15 ("Interceptor")
    → Shadow Stealer: helpDefIq>=90 && stl>=85 → 20% 확률로 helper가 steal
```

### 2단계: 스위치 체크 (PnR/Handoff)

```
isScreenPlay = playType in [PnR_Handler, PnR_Roll, PnR_Pop, Handoff]

if isScreenPlay:
  switchChance = switchFreq * 0.05      // switchFreq=5 → 25% 스위치

  if Random < switchChance && !isZone:
    // 포지션 미스매치 교환
    defenderA, defenderB 위치 교환

    confusionChance = max(0, (10 - helpDef) * 0.02)
    if Random < confusionChance:
      isBotchedSwitch = true             // 개방 슈팅 85% 확정
```

### 3단계: 플레이타입 선택

```
// Transition 특별 체크 (가중치 밖)
if Random < pace * 0.03:  // pace=5 → 15%
  playType = 'Transition'

// 아니면 가중 랜덤 선택
weights = {
  Iso:         sliders.play_iso,
  PnR_Handler: sliders.play_pnr * 0.6,
  PnR_Roll:    sliders.play_pnr * 0.2,
  PnR_Pop:     sliders.play_pnr * 0.2,
  PostUp:      sliders.play_post,
  CatchShoot:  sliders.play_cns,
  Cut:         sliders.play_drive,
  Handoff:     2 (고정),
}

// Putback (2차 공격 상황)
if (isShotClockShort && 공격리바운드 직후):
  putbackChance = 0.5 + offReb * 0.03
  if Random < putbackChance: playType = 'Putback'
```

### 4단계: 공격자 및 슈터 결정 (playTypes.ts)

```
resolvePlayAction(team, playType) → PlayContext {
  actor: LivePlayer,              // 주 공격자 / 슈터
  secondaryActor?: LivePlayer,    // 어시스터 or 스크리너
  preferredZone: ZoneType,
  bonusHitRate: number,           // PlayType 보너스
}

공격자 선택 방식:
  rawScore = PlayType별 archetypeScore(player)
  usageMultiplier = PLAY_TYPE_USAGE_WEIGHTS[playType][optionRank - 1]
  weight = rawScore^2.5 * usageMultiplier
  → 가중 랜덤 선택

PlayType별 선택 기준:
  Iso:         isoScorer (handling+mid+speed+agility) | 1옵션 4.0x
  PnR_Handler: handler (handling+passIq+passVision)    | 1옵션 3.0x
  PnR_Roll:    roller (ins+vertical+speed)              | 균등(1.5x~0.8x)
  PnR_Pop:     popper (3pt+shotIq)                     | 균등
  PostUp:      postScorer (ins+strength+hands)          | 1옵션 3.5x
  CatchShoot:  spacer (3pt+shotIq+offConsist)           | 균등
  Cut:         driver (speed+agility+vertical+ins)      | 균등
  Transition:  speed+driver 높은 선수                   | 완전 균등(1.0x)
```

### 5단계: 슈팅 성공률 계산 (flowEngine.ts)

```
calculateHitRate(actor, defender, defTeam, playType, zone, offSliders, bonusHitRate, acePlayerId)

// 특수 케이스
if isBotchedSwitch: return 0.85       // 개방 슈팅 확정

// 기본값 (SIM_CONFIG)
Rim / Paint: 0.62
Mid:         0.42
3PT:         0.36

// 선수 속성 비교 (피로도 반영)
fatigueOff = actor.currentCondition / 100     // 공격자 피로도 비율
fatigueDef = defender.currentCondition / 100  // 수비자 피로도 비율

zone == 3PT:
  offRating = actor.attr.out    // 외곽 공격력
  defRating = defender.attr.perDef  // 페리미터 수비
zone == Rim/Paint:
  offRating = actor.attr.ins    // 내선 공격력
  defRating = defender.attr.intDef  // 내선 수비

hitRate += (offRating - defRating) * 0.003
  // 차이 10 → ±3% (선수 능력치 영향)

// 수비 슬라이더
hitRate -= (defIntensity - 5) * 0.005      // 강도: ±2.5%
if Rim/Paint:
  hitRate -= (helpDef - 5) * 0.008         // 헬프: ±4.0%

// Pace 페널티 (단계별)
// pace 5 이하: 0%, 6: -1%, 7: -2%, 8: -3%, 9: -4%, 10: -5%
if pace > 5: hitRate -= (pace - 5) * 0.01  // 빠른 공격 = 서두른 슛

// Ace Stopper 매칭업
if (stopperId === defender.id && actor.id === acePlayerId):
  impact = calculateAceStopperImpact(actor, defender, mp)
    // impact 범위: -50 ~ +40 (음수 = 강한 수비)
  hitRate *= (1 + impact / 100)
  matchupEffect = impact

// 최종
return clamp(0.05, 0.95, hitRate)
```

### 6단계: 슈팅 결과 분기

```
if Random < hitRate:
  → 득점 (score)
  → 2점 or 3점
  → And-1 체크: Random < 0.12 (내선) / 0.05 (외곽)

else:
  → 미스 (miss)

  // 블록 계산
  blockProb 기본값:
    Rim: 0.10, Paint: 0.05, Mid: 0.035, 3PT: 0.01

  수비자 속성 보정:
    + (defBlk - 70) * 0.001          // blk 속성
    + (defVert - 70) * 0.0005        // 버티컬
    + 신장 보정 (cm당 0.001)

  Elite Blocker 보너스 (아키타입별):
    blk >= 97: +0.12                  // "The Wall"
    height>=216 && blk>=80: +0.10    // "The Alien"
    vert>=95 && blk>=75: +0.08       // "Skywalker"
    helpDefIq>=92 && blk>=80: +0.06  // "Defensive Anchor"

  공격자 저항:
    - max(0, (shotIq - 70) * 0.001 + (height - 190) * 0.0005)

  Help Defense Block (Rim/Paint만):
    bestHelper = argmax(blk, onCourt helpers)
    helpBlockProb = 0.02
    + (helper.blk >= 90 ? 0.04 : 0)
    + (helper.rimProtector > 80 ? 0.03 : 0)

  → 블록이면: blk++, deflection 처리
  → 미스면: resolveRebound()
```

### 7단계: 리바운드 (reboundLogic.ts)

```
resolveRebound(homeTeam, awayTeam, shooterId)

모든 코트 위 선수(10명) 대상:
  score = (reb*0.6 + vertical*0.2 + height*0.2)
          * positionBonus
          * fatigueMultiplier

  positionBonus:
    C: 1.30, PF: 1.20, SF: 1.05, SG: 0.90, PG: 0.75

  슈터 패널티: 슈터 본인 → score *= 0.3

  offrebounderBonus:
    offReb 슬라이더 >= 7인 팀 → 공격 리바운더 score 증가

  → 가중 랜덤 선택
  → 팀 기준으로 offReb / defReb 판정
```

### 8단계: 자유투 (statsMappers.ts)

```
파울 발생 시:
  defTeam.fouls++

  if defTeam.fouls > 4 (보너스):
    FTA += 2
    ftPct = actor.attr.ft / 100

    // Shot 1
    if Random < ftPct: ftm++, score++

    // Shot 2
    if Random < ftPct: ftm++, score++, lastMade=true
    else: resolveRebound() (수비 리바운드 확률 높음)

  And-1 (슛+파울):
    FTA += 1
    if Random < ftPct: ftm++, score++
```

---

## 파울 확률

```
baseFoulChance = 0.08 + (defIntensity * 0.015)

defIntensity = 1: 9.5%
defIntensity = 5: 15.5%
defIntensity = 10: 23.0%

→ 높은 defIntensity = 더 많은 파울 = 더 많은 FT 허용
→ 리얼 NBA: 어그레시브 수비는 파울 리스크 상승
```

---

## 아키타입 시스템 (archetypeSystem.ts)

```typescript
calculatePlayerArchetypes(attr, condition):

fatigueFactor = max(0.5, 0.5 + condition * 0.005)
  // condition=100 → 1.0, condition=50 → 0.75, condition=0 → 0.5

scores = {
  // 공격 역할
  handler:     (handling*0.35 + passIq*0.25 + passVision*0.20 + pas*0.20) * fatigue
  spacer:      (threeVal*0.60 + shotIq*0.25 + offConsist*0.15) * fatigue
  driver:      (speed*0.20 + agility*0.15 + vertical*0.10 + ins*0.35 + mid*0.20) * fatigue
  screener:    (strength*0.40 + height*0.30 + weight*0.30) * fatigue
  roller:      (ins*0.40 + vertical*0.30 + speed*0.30) * fatigue
  popper:      (threeVal*0.70 + shotIq*0.30) * fatigue
  connector:   (passIq*0.30 + helpDefIq*0.20 + hustle*0.30 + hands*0.20) * fatigue
  postScorer:  (ins*0.50 + strength*0.30 + hands*0.20) * fatigue
  isoScorer:   (handling*0.25 + mid*0.25 + speed*0.25 + agility*0.25) * fatigue

  // 수비 역할
  perimLock:   (perDef*0.50 + agility*0.25 + stl*0.25) * fatigue
  rimProtector:(blk*0.35 + intDef*0.35 + vertical*0.15 + height*0.15) * fatigue
  rebounder:   (reb*0.70 + hustle*0.15 + vertical*0.15) * fatigue
}
```

**피로도 영향**: condition이 낮아질수록 모든 역할 점수 감소 → Option Rank 하락 → 포세션 배분 감소

---

## Option Rank 시스템 (usageSystem.ts)

```
optionRank 결정:
  scoringGravity(player) = (baseOffense*0.6 + mentality*0.4) * fatigueFactor
    baseOffense = ins*0.3 + out*0.4 + mid*0.2 + ft*0.1
    mentality   = offConsist*0.4 + shotIq*0.4 + pas*0.2

  팀 내 5명 코트 선수를 scoringGravity 내림차순으로 정렬
  → 1옵션(최고) ~ 5옵션(최하)

PLAY_TYPE_USAGE_WEIGHTS (optionRank 1~5):
  Iso:          [4.0, 2.5, 0.8, 0.2, 0.1]  ← 에이스 집중
  PostUp:       [3.5, 2.2, 1.0, 0.3, 0.1]
  PnR_Handler:  [3.0, 2.0, 1.2, 0.5, 0.2]
  Handoff:      [2.0, 1.8, 1.2, 0.8, 0.4]
  PnR_Pop:      [1.8, 1.6, 1.2, 0.8, 0.5]
  PnR_Roll:     [1.5, 1.4, 1.2, 1.0, 0.8]  ← 핀 컷 비중
  CatchShoot:   [1.3, 1.2, 1.2, 1.1, 0.8]
  Cut:          [1.2, 1.2, 1.2, 1.2, 1.0]
  Transition:   [1.0, 1.0, 1.0, 1.0, 1.0]  ← 완전 균등
  Putback:      [1.0, 1.0, 1.0, 1.0, 1.0]
```

**의미**: 1옵션 선수가 Iso에서 4.0배 가중치 → 2옵션(2.5배)보다 선택 확률 약 3.6배 높음

---

## 피로도 시스템 (fatigueSystem.ts)

### 소모 공식

```
drain = (timeTakenSeconds / 60) * DRAIN_BASE (=2.5)

속성 보정:
  drain *= (1 - stamina * 0.015 / 100)   // stamina 높을수록 적게 소모

상황 보정:
  Back-to-Back: drain *= 1.5
  Ace Stopper:  drain *= 1.3
  Full Court Press: drain *= (1 + (fullCourtPress - 1) * 0.05)

누적 피로 패널티 (지친 선수가 더 빨리 지침):
  cumulativePenalty = 1 + max(0, (100 - condition) * 0.012)
    condition=100 → 1.0x (페널티 없음)
    condition=50  → 1.6x
    condition=0   → 2.2x
  drain *= cumulativePenalty
```

### 회복 공식

```
// 벤치 회복 (stateUpdater.ts)
recovery = (timeTaken / 60) * BENCH_RECOVERY_RATE (=5.0)
player.currentCondition = min(100, currentCondition + recovery)

// Shutdown 해제
if isShutdown && currentCondition > 70:
  isShutdown = false
```

### 교체 트리거

```
substitutionSystem.ts:
  condition < 20 → isShutdown = true → 다음 교체 타임에 강제 교체
  pf >= 6 → 파울아웃 강제 퇴장
  부상 발생 → 즉시 교체
```

---

## 로테이션 시스템 (rotationLogic.ts)

```
checkAndApplyRotation(state, currentMinute):

  loadadRotationMap[playerId] = boolean[48]  // 분 단위 출전 여부

  선수가 현재 분에 출전 표시(true)가 없으면:
    → 해당 선수 교체
    → 벤치에서 출전 표시된 후보와 교환

특수 케이스:
  condition < 10 → forceSubstitution() (체력 바닥)
  파울 누적 5개 (크리티컬) → 조심 모드
```

---

## 슈팅 존 시스템 (shotDistribution.ts)

### 존 분류

```
4개 광역 존:
  Rim   (레이업, 덩크, 핑거롤)
  Paint (페인트 존 미드레인지)
  Mid   (중거리, 페이드어웨이)
  3PT   (3점 슛)

15개 세부 존 (Shot Chart용):
  zone_rim         (림 근처 통합)
  zone_paint_l/r   (페인트 좌/우)
  zone_mid_l/c/r   (중거리 좌/중/우)
  zone_c3_l/r      (코너 3점 좌/우)
  zone_atb3_l/c/r  (일반 3점 좌/중/우)
```

### 존 가중치 결정

```
calculateZoneWeights(player, preferredZone, sliders):

  // 기본 비율 (shot_3pt, shot_rim, shot_mid 슬라이더)
  baseWeights = {
    Rim:   shot_rim * 0.08,
    Paint: 0.05,
    Mid:   shot_mid * 0.04,
    3PT:   shot_3pt * 0.07,
  }

  // PlayType 선호 존 가중치 추가
  preferredZone 가중치 증가

  // 선수 능력치 반영
  out >= 82: 3PT 가중치 ×1.3
  ins >= 85: Rim 가중치 ×1.2
  mid >= 82: Mid 가중치 ×1.3
```

---

## 기본 확률 상수 (SIM_CONFIG)

```typescript
SHOOTING: {
  INSIDE_BASE_PCT: 0.62,     // Rim/Paint 기본 62%
  MID_BASE_PCT:    0.42,     // Mid 기본 42%
  THREE_BASE_PCT:  0.36,     // 3PT 기본 36%
}

FATIGUE: {
  DRAIN_BASE:          2.5,  // 포세션당 기본 소모
  BENCH_RECOVERY_RATE: 5.0,  // 분당 회복
  STAMINA_SAVE_FACTOR: 0.015,
}

GAME_ENV: {
  BASE_POSSESSIONS: 98,      // 기본 포세션 수 (Pace 5 기준)
  HOME_ADVANTAGE:   0.02,    // 홈 팀 hitRate 보너스 2%
}
```

---

## 전술 슬라이더 영향 정리

| 슬라이더 | 범위 | 영향 |
|---------|------|------|
| `pace` | 1-10 | 포세션 시간 (pace=1: 20초, pace=10: 11초), Transition 확률 (×3%), hitRate 페널티 (>5: -(pace-5)×1% 단계별) |
| `ballMovement` | 1-10 | TOV 확률 (+0.4% per step above 5) |
| `play_pnr` | 1-10 | PnR 포세션 비중 (×0.6/0.2/0.2 분배) |
| `play_iso` | 1-10 | Iso 포세션 비중 |
| `play_post` | 1-10 | PostUp 포세션 비중 |
| `play_cns` | 1-10 | CatchShoot 포세션 비중 |
| `play_drive` | 1-10 | Cut 포세션 비중 |
| `shot_3pt` | 1-10 | 3PT 존 가중치 |
| `shot_rim` | 1-10 | Rim 존 가중치 |
| `shot_mid` | 1-10 | Mid 존 가중치 |
| `defIntensity` | 1-10 | hitRate (-0.5% per step), TOV (±0.8%), 파울 확률 (+1.5%) |
| `helpDef` | 1-10 | Rim/Paint hitRate (-0.8% per step), 스위치 혼란 감소 |
| `switchFreq` | 1-10 | 스크린 플레이 시 스위치 확률 (×5%) |
| `fullCourtPress` | 1-6 | 피로도 소모 (+5% per step above 1) |
| `zoneFreq` | 1-10 | ≥8이면 존 수비 활성화 (C/PF 고정 수비) |
| `offReb` | 1-10 | 공격 리바운더 가중치 보정, Putback 확률 |

---

## 박스스코어 기록 흐름 (statsMappers.ts)

```
applyPossessionResult(state, result):

type === 'score':
  actor.stats.pts += points
  actor.stats.fgm += 1
  actor.stats.fga += 1
  if points === 3: actor.stats.p3m/p3a += 1
  updateZoneStats(actor, zone, true)     // 세부 존 기록
  if assister: assister.stats.ast += 1
  offTeam.score += points
  updatePlusMinus(offTeam, defTeam, points)

type === 'miss':
  actor.stats.fga += 1
  if zone === '3PT': actor.stats.p3a += 1
  updateZoneStats(actor, zone, false)
  if isBlock: defender.stats.blk += 1
  if rebounder: rebounder.stats.reb += 1 (offReb or defReb)

type === 'turnover':
  actor.stats.tov += 1
  if isSteal: defender.stats.stl += 1

type === 'foul':
  defender.stats.pf += 1
  defTeam.fouls += 1
  // 보너스 FT 처리 (위 자유투 섹션 참조)

// +/- 업데이트
updatePlusMinus(offTeam, defTeam, points):
  offTeam.onCourt[].plusMinus += points
  defTeam.onCourt[].plusMinus -= points
```

---

## Ace Stopper 시스템 (aceStopperSystem.ts)

```
calculateAceStopperImpact(ace, stopper, minutesPlayed):

  // 기본 수비 점수
  stopperScore = stopper.perDef*0.4 + stopper.agility*0.3 + stopper.stl*0.3

  // Ace 공격 점수
  aceScore = ace.handling*0.3 + ace.out*0.3 + ace.speed*0.2 + ace.offConsist*0.2

  // 매칭업 비교
  advantage = aceScore - stopperScore  // 양수 = Ace 우세

  // 분 사용 패널티 (Stopper도 지침)
  if minutesPlayed > 30:
    minutesTax = (minutesPlayed - 30) * 0.5
    advantage += minutesTax  // Ace에게 유리해짐

  // 결과: -50 ~ +40 범위
  // 음수 = 강한 수비 (hitRate 감소)
  // 양수 = Ace 돌파 (hitRate 증가)

// flowEngine에서 적용:
hitRate *= (1 + impact / 100)
  // impact=-30 → hitRate *= 0.70 (30% 감소)
  // impact=+20 → hitRate *= 1.20 (20% 증가)
```

---

## 데이터 보존: LivePlayer → BoxScore

```
경기 종료 후 main.ts:
  homeBox = state.home.allPlayers
    .filter(p => p.stats.g > 0)
    .map(p => ({
      playerId: p.id,
      playerName: p.name,
      pts: p.stats.pts,
      reb: p.stats.reb,
      ...
      zoneData: {
        zone_rim_m: p.stats.zone_rim_m,
        zone_rim_a: p.stats.zone_rim_a,
        zone_mid_l_m: ...,
        zone_c3_l_m: ...,
        zone_atb3_c_m: ...,
        ...15개 존 데이터
      }
    }))
```

---

## 주요 확률 요약표

| 이벤트 | 기본 확률 | 범위 |
|--------|---------|------|
| 3점슛 성공 | 36% | 5~95% |
| 중거리 성공 | 42% | 5~95% |
| 림 성공 | 62% | 5~95% |
| 턴오버 | 8% | 2~25% |
| 파울 (defIntensity=5) | 15.5% | 9.5~23% |
| 블록 (Rim) | 10% + 보정 | |
| 블록 (3PT) | 1% + 보정 | |
| Transition 포세션 | pace × 3% | |
| Putback (공격리바 직후) | 50% + offReb×3% | |
| Steal (턴오버 시) | 50% 기본 | ~80% |
| And-1 (내선 득점 시) | 12% | |
| And-1 (외곽 득점 시) | 5% | |
