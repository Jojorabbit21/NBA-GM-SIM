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
│     ├─ shotDistribution.ts ← 존별 슈팅 분포 + 3PT 서브존 결정
│     └─ pbpTypes.ts      ← 타입 정의 (LivePlayer, TeamState, etc.)

services/game/engine/
├── fatigueSystem.ts       ← 피로도 소모량 계산
├── aceStopperSystem.ts    ← Ace Stopper 효과 계산
├── shotDistribution.ts    ← resolveDynamicZone() (서브존 랜덤 선택)

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
// 정의: pbpTypes.ts, 초기화: initializer.ts
{
    playerId: string,
    playerName: string,
    position: string,
    ovr: number,
    currentCondition: number,          // 현재 피로도 (0-100)
    startCondition: number,            // 입장 시 피로도 (피로 소모 계산용)
    mp: number,                        // 누적 플레이 분
    isStarter: boolean,
    isShutdown: boolean,               // 피로도 < 20 교체 대기
    health: 'Healthy' | 'Injured' | 'Day-to-Day',

    // 아키타입 (12개 역할 적합도 점수)
    archetypes: ArchetypeRatings,

    // 세이브별 고유 성향 (hiddenTendencies.ts)
    tendencies: SaveTendencies,

    // 핫/콜드 스트릭
    hotColdRating: number,    // -1.0 ~ +1.0
    recentShots: boolean[],   // 최근 5개 슛 결과

    // 능력치 (독자 생성 레이팅, initializer.ts에서 매핑)
    attr: {
        // 슈팅
        ins: number,            // 골밑 종합
        out: number,            // 외곽 종합
        mid: number,            // 중거리
        ft: number,             // 자유투
        threeVal: number,       // 3PT 평균 (corner+45+top)/3 — 아키타입용
        threeCorner: number,    // 코너 3PT (서브존별 hitRate에 사용)
        three45: number,        // 윙/45도 3PT
        threeTop: number,       // 탑 3PT

        // 골밑 세부
        layup: number,          // 레이업
        dunk: number,           // 덩크
        closeShot: number,      // 근거리 슛 (플로터, 훅)

        // 피지컬
        speed: number,          // 순수 주력 (오프볼, 수비 추격)
        spdBall: number,        // 볼 드리블 속도 (드라이브, 속공 볼캐리)
        agility: number,
        strength: number,
        vertical: number,
        stamina: number,
        durability: number,
        hustle: number,
        height: number,         // cm
        weight: number,         // kg

        // 스킬
        handling: number,       // 볼 핸들링
        hands: number,          // 볼 컨트롤/확보
        passAcc: number,        // 패스 정확도
        passVision: number,     // 패스 비전
        passIq: number,         // 패스 IQ
        offBallMovement: number, // 오프볼 무브먼트 (Cut/OffBallScreen 액터 선정)
        shotIq: number,         // 슛 선택 IQ
        offConsist: number,     // 공격 일관성
        postPlay: number,       // 포스트 무브

        // 수비
        def: number,            // 수비 종합
        intDef: number,         // 내선 수비
        perDef: number,         // 외곽 수비
        blk: number,            // 블록
        stl: number,            // 스틸
        helpDefIq: number,      // 헬프 수비 IQ
        defConsist: number,     // 수비 일관성 (defRating 보정 + 래프스)
        passPerc: number,       // 패싱레인 인식
        drFoul: number,         // 파울 유도

        // 리바운드
        reb: number,            // 리바운드 종합
        offReb: number,         // 공격 리바운드
        defReb: number,         // 수비 리바운드
        boxOut: number,         // 박스아웃 (수비 리바운드 파워 보정)

        // 기타
        intangibles: number,    // 클러치/강심장
    },

    // 런타임 존별 스탯 (15개 세부존 × make/attempt)
    zone_rim_m/a, zone_paint_m/a, zone_mid_l/c/r_m/a,
    zone_c3_l/r_m/a, zone_atb3_l/c/r_m/a,

    // Ace Stopper 추적
    matchupEffectSum: number,
    matchupEffectCount: number,
}

// 포세션 결과 (PossessionResult)
interface PossessionResult {
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'freethrow'
        | 'offensiveFoul' | 'technicalFoul' | 'flagrantFoul' | 'shotClockViolation',
    playType: PlayType,
    actor: LivePlayer,
    defender: LivePlayer,
    assister?: LivePlayer,
    rebounder?: LivePlayer,
    reboundType?: 'off' | 'def',
    points: 0 | 1 | 2 | 3,
    zone?: 'Rim' | 'Paint' | 'Mid' | '3PT',
    shotType?: string,             // 'Dunk'|'Layup'|'Floater'|'Hook'|'Pullup'|'Jumper'|'Fadeaway'|'CatchShoot'
    subZone?: string,              // 3PT 서브존 키 (hitRate↔스탯 일관성)
    isBlock?: boolean,
    isSteal?: boolean,
    isAndOne: boolean,
    matchupEffect?: number,
    isAceTarget?: boolean,
    isSwitch?: boolean,
    isMismatch?: boolean,
    isBotchedSwitch?: boolean,
    pnrCoverage?: 'drop' | 'hedge' | 'blitz',
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
   │   └─ LivePlayer 배열 생성 (attr 매핑 포함)
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
baseTovProb = 0.085

modifiers:
  + max(0, (ballMovement-5)*0.004) × visionDampen  // [A-2] 볼무브 리스크 (passVision 완화)
    ↳ teamAvgVision = team 평균 passVision
    ↳ visionDampen = clamp(0.85, 1.15, 1-(teamAvgVision-70)*0.005)
    ↳ vision 85팀 → 0.925x (7.5% 감소), vision 55팀 → 1.075x (증가)
  + max(0, (defIntensity - 5) * 0.008)   // 수비 강도
  + max(0, (70 - handling) * 0.001)      // 핸들링 부족
  + max(0, (70 - passIq) * 0.001)        // 패스 IQ 부족
  + (70 - hands) * (isContactPlay ? 0.0015 : 0.0005) // 핸즈 (접촉 플레이 강화)
  + (70 - passAcc) * (isPassPlay ? 0.0012 : 0.0005) // [B-1] 패스 정확도 → 패스 미스 턴오버
    ↳ isPassPlay = CatchShoot/Handoff/PnR_*/Cut
    ↳ passAcc 50+패스플레이 → +2.4%, passAcc 90 → -2.4%
  + PlayType 보정:
    Transition: +0.03 + max(0,(70-passAcc))*0.001  // [B-3] 롱패스 리스크
    PostUp: +0.02
    Iso: +0.01
  + PnR Coverage 보정:
    Blitz + PnR_Handler: +0.04
    Hedge + PnR_Handler: +0.015

  // [Steal Archetypes] 수비자 능력에 따른 턴오버 유발력
  + The Clamp (perDef≥92 && stl≥80): +3%
  + The Pickpocket (stl≥85 && agility≥92, PostUp/Iso/Cut): +4%
  + The Hawk (helpDefIq≥85 && passPerc≥80 && stl≥75, 상대 BM≥7): +3%
  + The Press (speed≥85 && stamina≥85 && hustle≥85, Transition): +5%

  // [spdBall] 드리블 갭 페널티
  // 드리블 플레이(Iso/Cut/Transition/PnR_Handler)에서 speed↑ spdBall↓ = 볼컨트롤 실수
  + max(0, (speed - spdBall)) * 0.001   // gap 20pt → +2% 턴오버

  // [SaveTendency] composure: ±1% 턴오버 확률
  - composure * 0.01

  // [Gradual] 수비자 능력치 연속 기여
  + (defender.stl - 70) * 0.0008      // stl 볼 탈취 압박 (모든 상황)
  + isPassPlay ? (defender.passPerc - 70) * 0.0010 : 0  // passPerc 패싱레인 읽기 (패싱 플레이 전용)

totalTovProb = clamp(0.02, 0.25, sum)

if Random < totalTovProb:
  → Turnover
  → Steal 여부 결정:
    baseStealRatio = 0.45
    // [Gradual] 연속 기여 (아키타입 보너스 이전에 적용)
    + (stl - 70) * 0.003                // stl 스틸 실행력 (모든 상황)
    + isPassPlay ? (passPerc - 70) * 0.0025 : 0  // passPerc 인터셉트 위치 (패싱 플레이 전용)
    // 아키타입 임계값 보너스 (기존 유지, 연속효과 위에 중첩)
    + stl >= 90: +0.15 ("The Glove")
    + stl >= 80: +0.08
    + passPerc>=85 && agility>=85: +0.10 ("Interceptor")
    + The Press (Transition): +0.15 스틸 비율
    = clamp(0.15, 0.75)               // stealRatio 캡
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
      isBotchedSwitch = true             // 개방 슈팅 (선수 능력 반영)
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

// Star Gravity: 1옵션 에이스가 코트에 있으면 Hero 플레이 비중 증가
gravityBoost = min(0.30, max(0, (topGravity - 65) * 0.015))
// gravity 90 → 0.30 (캡), gravity 78 → 0.195, gravity 65 이하 → 0
weights[Iso] *= (1 + gravityBoost)
weights[PnR_Handler] *= (1 + gravityBoost)
weights[PostUp] *= (1 + gravityBoost * 0.5)

// Clutch: 뒤지는 팀 → 3PT 비중 증가, 이기는 팀 → Iso/PostUp 증가

// Putback (2차 공격 상황)
if shotClock==14: putbackChance = 0.15 + (offReb * 0.02)
```

### 4단계: 공격자 및 마무리 결정 (playTypes.ts)

```
resolvePlayAction(team, playType, sliders) → PlayContext {
  actor: LivePlayer,              // 주 공격자 / 슈터
  secondaryActor?: LivePlayer,    // 어시스터 or 스크리너
  preferredZone: ZoneType,
  shotType: ShotType,             // 마무리 타입
  bonusHitRate: number,           // PlayType 보너스
}

공격자 선택 방식:
  rawScore = PlayType별 archetypeScore(player)
  usageMultiplier = PLAY_TYPE_USAGE_WEIGHTS[playType][optionRank - 1]
  weight = rawScore * usageMultiplier   // 선형 (pow=1.0)
  weight *= ballDominance              // 텐던시: 0.5~1.5x
  weight *= playStyleMod               // Iso/PostUp: +(ps*0.3), PnR/Handoff: -(ps*0.2)
  → 가중 랜덤 선택

  * USAGE_WEIGHTS가 계층 구조를 담당, 능력치는 선형 반영
  * Hero 1옵:5옵 ≈ 6:1, System 1옵:5옵 ≈ 1.8:1

PlayType별 선택 기준:
  Iso:         isoScorer (handling+mid+speed+agility) | 1옵션 2.5x
  PnR_Handler: handler (handling+passIq+passVision)    | 1옵션 2.5x
  PnR_Roll:    roller (ins+vertical+speed)              | 균등(1.3x~0.9x)
  PnR_Pop:     popper (3pt+shotIq)                     | 균등(1.6x~0.6x)
  PostUp:      postScorer (ins+strength+hands)          | 1옵션 2.2x
  CatchShoot:  spacer (3pt+shotIq+offConsist)           | 균등(1.5x~0.8x)
  Cut:         driver (speed+agility+vertical+ins) + offBallMovement×0.5 | 균등(1.4x~0.8x)
  Transition:  spdBall+driver 높은 선수                 | 완전 균등(1.0x)
```

#### resolveFinish 시스템 (마무리 타입 결정)

Rim/Paint 공격 시 선수의 능력치에 따라 마무리 타입을 가중 랜덤으로 결정:

```
resolveFinish(actor, context, sliders) → { zone, shotType }

context = 'drive' | 'post' | 'roll' | 'putback'

후보 옵션 (weight = max(0, 능력치 - 60) × 가중치):
  Dunk  (Rim)   → vertical≥70 && strength≥65일 때만, weight=(dunk-60)×1.5
  Layup (Rim)   → 항상 가능, weight=(layup-60)×1.0
  Floater(Paint)→ closeShot≥80, putback 제외, weight=(closeShot-60)×0.7
  Hook  (Paint) → height≥208 && closeShot≥80, post/roll만, weight=(postPlay-60)×0.8
  Pullup (Mid)  → mid≥72, drive만, weight=(mid-60)×0.5×(shot_mid/5)
  Jumper (Mid)  → mid≥72, post/roll만, weight=(mid-60)×0.7×(shot_mid/5)
  Fadeaway(Mid) → postPlay≥80 && mid≥85 && closeShot≥85, post만,
                   weight=(mid-60)×0.6×(shot_mid/5)

→ 가중 랜덤 선택 (fallback: Layup)
```

### 5단계: 슈팅 성공률 계산 (flowEngine.ts)

```
calculateHitRate(actor, defender, defTeam, playType, zone, offSliders,
                 bonusHitRate, acePlayerId, isBotchedSwitch, isSwitch,
                 minHitRate, isHome, clutchContext, pnrCoverage,
                 screenerDefender, shotType, threeSubZone)

// === 공격 능력치 매핑 (zoneOffRating) ===
zone == 3PT:
  서브존별 개별 능력치 적용:
    zone_c3_*  → actor.attr.threeCorner    // 코너 3점
    zone_atb3_c → actor.attr.threeTop      // 탑 3점
    zone_atb3_* → actor.attr.three45       // 윙/45도 3점
    fallback    → actor.attr.threeVal      // 평균
zone == Mid:
  Fadeaway → postPlay*0.3 + mid*0.5 + closeShot*0.2
  그 외    → mid
zone == Rim:
  Dunk → dunk, 그 외 → layup
zone == Paint:
  Floater → closeShot
  그 외   → postPlay*0.45 + closeShot*0.30 + hands*0.25

// === Botched Switch (수비 혼란 = Wide Open) ===
if isBotchedSwitch:
  return min(0.82, hitRate + 0.20 + (offRating-70)*0.001)

// === 기본값 (SIM_CONFIG) ===
Rim / Paint: 0.57
Mid:         0.38
3PT:         0.34
hitRate += bonusHitRate   // playType 보너스 + 모멘텀 + 패서 퀄리티 등 합산
  bonusHitRate 포함 요소:
    + playType 고유 보너스 (resolvePlayAction)
    + zoneQualityMod (존 수비 숙련도)
    + getMomentumBonus (연속 득점/턴오버)
    + foulDefPenalty (파울 기피 수비 감소)
    + shotDiscMod (shotDiscipline tendency)
    + egoMod (ego tendency × optionRank)
    + assistQualityMod    [A-1] (secondaryActor.passVision-70)*0.001
    + openDetectionMod    [A-3] CatchShoot/Handoff: (passer.passVision-70)*0.0015
    + deliveryQualityMod  [B-2] (secondaryActor.passAcc-70)*0.0008
    + lobBonus            [B-4] PnR 랍 성공 시 +8%

// === 피로도 보정 ===
hitRate += (fatigueOff - 0.70) * 0.10   // 공격자 (condition 70=중립)
hitRate -= (fatigueDef - 0.70) * 0.05   // 수비자

// === 수비 능력치 (defRating) ===
baseDefRating:
  3PT    → defender.attr.perDef (외곽 수비)
  Rim/Paint/Mid → defender.attr.intDef (내선 수비)

defRating 보정:
  + (defensiveMotor tendency) * 3       // 세이브 텐던시
  + (defConsist - 70) * 0.3             // [defConsist] flat modifier (70 기준)
  × 0.7 (확률적)                        // [defConsist] Defensive Lapse
    ↳ 발동 확률 = max(0, (70-defConsist)*0.003)
    ↳ defConsist 70+ → 0% (절대 발동 안 함)
    ↳ defConsist 50  → 6% 확률로 defRating 30% 감소

// === shotType별 컨테스트 효과 ===
hitRate += (offRating - defRating × contestFactor) * 0.002

contestFactor (SHOT_DEFENSE.CONTEST):
  Dunk: 0.85      // 덩크는 컨테스트 영향 적음
  Layup: 1.0      // 기준
  Floater: 0.6    // 수비 도달 어려움
  Hook: 0.5       // 독특한 릴리스
  Pullup: 0.8
  Jumper: 0.85
  Fadeaway: 0.4   // 수비 영향 최소
  CatchShoot: 1.0

// === 수비 슬라이더 ===
hitRate -= (defIntensity - 5) * 0.005      // 강도: ±2.5%
if Rim/Paint:
  hitRate -= (helpDef - 5) * 0.008         // 헬프: ±4.0%

// === ZONE SHOOTING ARCHETYPES ===
B-1. Mr. Fundamental: mid≥97 → 클러치+Mid+3%, ISO+Mid+3%
B-2. Rangemaster: threeVal≥90 && shotIq≥85, 클러치+3PT+1.5%
B-3. Tyrant: ins≥90 && (strength≥88 || vert≥88) → Rim/Paint+3%
B-5. Afterburner: speed≥95 && spdBall≥90 && agility≥93 → Transition+2%

// === spdBall 드라이브 보너스 ===
// Rim/Paint + 드리블 플레이(Iso/Cut/Transition/PnR_Handler)
hitRate += (spdBall - 70) * 0.001   // spdBall 90→+2%, 50→-2%

// === PnR Coverage ===
Drop:  Handler Mid+4%, 3PT+1%, Roll -4%, Pop+1.5%
Hedge: Handler -2%, Roll+3% (+2% slow big extra)
Blitz: Handler -8%, Roll+7%, Pop+6%

// === Mismatch (스위치 발생 시) ===
speedAdv = actor.spdBall - defender.speed   // 공격자 볼드리블 vs 수비자 추격
heightDiff, agilityAdv, strengthAdv 비교
Guard on Big / Big on Guard / Skill Gap ≥ 15 → mismatch bonus (최대 +12%)
성공적 스위치 (미스매치 없음) → -3%

// === Pace 페널티 ===
pace > 5: hitRate -= (pace - 5) * 0.01   // pace 10: -5%

// === Home Court ===
+2% hitRate

// === Clutch ===
clutchRating = (intangibles*0.5 + offConsist*0.3 + shotIq*0.2)
clutchModifier = (clutchRating/100 - 0.70) * 0.10
The Closer: intangibles≥90 && shotIq≥85 → modifier ×2
Ice in Veins: intangibles≥85 && offConsist≥88 → 프레셔 페널티 면제
Big Stage: intangibles≥85 && strength≥85 && ins≥85 → Rim/Paint+3%

// === Hot/Cold Streak ===
hitRate += hotColdRating * 0.04   // ±4% 캡

// === 최종 ===
return clamp(0.05, 0.95, hitRate)
```

### 6단계: 슈팅 결과 분기

```
if Random < hitRate:
  → 득점 (score)
  → 2점 or 3점
  → And-1 체크 (Rim/Paint만):
    andOneBase = 0.03 + max(0, (defIntensity-5)*0.004) + drawFoul 보정
    × shotType별 And-1 배율 (SHOT_DEFENSE.AND1_MULT):
      Dunk: 1.5x      // 접촉 많음
      Layup: 1.0x     // 기준
      Floater: 0.3x   // 비접촉
      Hook: 0.5x
      Pullup: 0.0x    // 점프슛 → And-1 불가
      Jumper: 0.0x
      Fadeaway: 0.0x
      CatchShoot: 0.0x

else:
  → 미스 (miss)

  // 블록 계산
  blockProb 기본값:
    Rim: 0.10, Paint: 0.05, Mid: 0.035, 3PT: 0.01

  수비자 속성 보정:
    + (defBlk - 70) * 0.0015       // blk 속성
    + (defVert - 70) * 0.00075     // 버티컬
    + (defHeight - 200) * 0.001    // 신장 보정

  Elite Blocker 보너스 (아키타입별):
    blk >= 97: +0.08                  // "The Wall"
    height>=216 && blk>=80: +0.06    // "The Alien"
    vert>=95 && blk>=75: +0.05       // "Skywalker"
    helpDefIq>=92 && blk>=80: +0.03  // "Defensive Anchor"

  공격자 저항:
    - max(0, (shotIq - 70) * 0.001 + (height - 190) * 0.0005)

  Zone Shooting 아키타입 블록 감소:
    Tyrant (ins≥90): -3% 블록
    Levitator (closeShot≥96, agility≥85, height≤195): 블록 ×0.5
    Ascendant (PG/SG, vert≥95, closeShot≥93): Rim 블록 ×0.6

  shotType별 블록 배율 (SHOT_DEFENSE.BLOCK_MULT):
    Dunk: 0.85      // 파워풀해서 블록 어려움
    Layup: 1.0      // 기준
    Floater: 0.3    // 높은 아크 → 블록 매우 어려움
    Hook: 0.4       // 독특한 릴리스
    Pullup: 0.7
    Jumper: 0.6
    Fadeaway: 0.2   // 거의 블록 불가
    CatchShoot: 1.0

  Dunk 전용 저항:
    - (strength - 70) * 0.001    // 파워 저항
    - (vertical - 70) * 0.0005   // 높이 저항

  PnR Coverage:
    Drop + Rim/Paint: +3% 블록 (빅맨 림 보호)
    Blitz + Rim/Paint: -2% 블록 (빅맨 부재)

  Help Defense Block (Rim/Paint/Mid):
    bestHelper = argmax(blk, onCourt helpers)
    helpBlockProb = 0.02
    + (helper.blk >= 85 ? 0.03 : 0)
    + (helper.rimProtector > 75 ? 0.03 : 0)
    Mid: helpBlockProb *= 0.5

  → 블록이면: blk++, deflection 처리
  → 미스면: resolveRebound()
```

### 7단계: 리바운드 (reboundLogic.ts)

```
resolveRebound(homeTeam, awayTeam, shooterId)

2단계 시스템:
  Step 1: ORB% 판정 (공격 리바운드 확률)
    BASE_ORB_RATE = 0.23 (NBA 평균)
    offPower = Σ(offTeam) [offReb×0.6 + vertical×0.2 + (height-180)×0.5 + hands×0.1] × posBonus
    defPower = Σ(defTeam) [defReb×0.6 + vertical×0.2 + (height-180)×0.5 + hands×0.1 + boxOut×0.15] × posBonus
    ↳ boxOut은 수비 리바운드 파워에만 가산 (박스아웃 = 수비 기술)
    ± 슬라이더 보정
    범위: 0.12 ~ 0.38

  Step 2: 리바운더 선택
    score = (rebAttr×0.6 + vertical×0.2 + (height-180)×0.5 + hands×0.1 + boxOutMod)
            × posBonus × shooterPenalty × archetypeBonus × random(0.7 + motorIntensity×0.6)
    ↳ boxOutMod = 수비 리바운드일 때만 boxOut × 0.15 (공격 리바운드에서는 0)

    positionBonus: C:1.3, PF:1.2, 기타:1.0

    슈터 패널티: score *= 0.3

    Harvester (offReb≥95 or defReb≥95): score ×1.3
    Raider (height≤200 && offReb≥90 && vert≥90): 공격 리바 score ×1.4
```

### 8단계: 자유투 (statsMappers.ts)

```
파울 발생 시:
  defTeam.fouls++

  // 슈팅 파울: 존별 차등 비율
  Rim/Paint: 45% + (defIntensity-5)*1.5% + drawFoul보정 (cap 65%)
  Mid:       25% + (defIntensity-5)*1.2% + drawFoul보정 (cap 40%)
  3PT:       10% + (defIntensity-5)*0.8% + drawFoul보정 (cap 25%)

  if 슈팅파울 || defTeam.fouls > 4 (보너스):
    FTA += (3PT면 3, 아니면 2)
    ftPct = actor.attr.ft / 100
    // 각 FT: if Random < ftPct → ftm++, score++

  And-1:
    FTA += 1
    if Random < ftPct: ftm++, score++
```

---

## 파울 확률

```
baseFoulChance = min(0.18, 0.08 + (defIntensity * 0.015))
  ↳ defIntensity=5: 15.5%, defIntensity≥7: 18% 캡

+ Manipulator (drFoul≥95 && shotIq≥88): +3% (캡 무시)
+ foulProneness tendency: ±2%
× 파울 트러블 감소: 3파울 0.85x, 4파울 0.60x, 5파울 0.30x

→ 높은 defIntensity = 더 많은 파울 = 더 많은 FT 허용

추가 파울 이벤트:
  오펜시브 파울: 1.5% (PostUp/Iso: 2.5%, PnR: +0.8%)
  테크니컬 파울: 0.3% (× temperament tendency)
  플래그런트: 수비 파울의 5%가 전환 (그 중 10%가 F2)
  샷클락 바이올레이션: 0.3% + 수비 전술 보정
```

---

## 3PT 서브존 시스템

3PT 슈팅 시 서브존을 **1회만 결정**하여 hitRate 계산과 스탯 기록에 동일하게 적용:

```
// possessionHandler.ts에서 결정
subZone = resolveDynamicZone(actor, '3PT')  // 3PT일 때만

서브존별 확률분포 (shotDistribution.ts):
  zone_c3_l   (코너 좌): 15%  → threeCorner 능력치
  zone_atb3_l (윙 좌):   20%  → three45 능력치
  zone_atb3_c (탑):      30%  → threeTop 능력치
  zone_atb3_r (윙 우):   20%  → three45 능력치
  zone_c3_r   (코너 우): 15%  → threeCorner 능력치

데이터 흐름:
  possessionHandler → subZone 결정
  → calculateHitRate(threeSubZone=subZone) → 서브존별 offRating 적용
  → PossessionResult.subZone에 저장
  → statsMappers → updateZoneStats(preResolvedSubZone=subZone) → 스탯 기록
```

---

## spdBall (Speed with Ball) 시스템

`speed`(순수 주력)과 `spdBall`(볼 드리블 속도)을 구분하여 적용:

```
speed:    오프볼 달리기, 수비 추격, 클로즈아웃, 헬프 로테이션
spdBall:  드리블 돌파, 속공 볼캐리, PnR 핸들링

적용 위치:
1. Transition 핸들러 선정 (playTypes.ts):
   actor = pickWeightedActor(p => p.attr.spdBall + p.archetypes.driver)
   ↳ 속공에서 공을 몰고 달리는 역할 → 드리블 속도가 핵심

2. Afterburner 아키타입 조건 (flowEngine.ts):
   speed ≥ 95 AND spdBall ≥ 90 AND agility ≥ 93 → Transition hitRate +2%
   ↳ 순수 주력만 빠르고 드리블이 느리면 Afterburner 미자격

3. 드라이브 spdBall 보너스 (flowEngine.ts):
   Rim/Paint + 드리블 플레이(Iso/Cut/Transition/PnR_Handler):
   hitRate += (spdBall - 70) * 0.001   // spdBall 90→+2%, 50→-2%

4. 턴오버 갭 페널티 (possessionHandler.ts):
   드리블 플레이에서 speed↑ spdBall↓ 갭 → 볼 컨트롤 실수
   totalTovProb += max(0, speed - spdBall) * 0.001   // gap 20→+2%

5. 미스매치 blow-by (flowEngine.ts):
   스위치 후: 공격자 spdBall vs 수비자 speed
   ↳ 공격자는 볼 가지고 돌파, 수비자는 볼 없이 추격
```

---

## defConsist (수비 일관성) 시스템

수비자의 `defConsist` 능력치가 defRating에 영향:

```
적용 위치: flowEngine.ts (defRating 계산 직후)

1. Flat Modifier (항상 적용):
   defRating += (defConsist - 70) * 0.3
   ↳ defConsist 99 → +8.7, defConsist 70 → ±0, defConsist 50 → -6.0

2. Defensive Lapse (확률적 집중력 저하):
   lapseChance = max(0, (70 - defConsist) * 0.003)
   if Random < lapseChance: defRating *= 0.7   // 30% 감소

   defConsist별 lapse 확률:
     70+ → 0% (절대 안 함)
     60  → 3%
     50  → 6%
     40  → 9%
     30  → 12%

효과: 높은 defConsist = 안정적 수비, 낮은 defConsist = 가끔 무너지는 수비
```

---

## passVision (패스 비전) 시스템

코트 전체를 읽고 오픈 동료를 찾아내는 시야 (요키치, CP3):

```
적용 위치: possessionHandler.ts

1. [A-1] 어시스트 퀄리티 보너스 (hitRate 섹션):
   secondaryActor 존재 시:
   assistQualityMod = (passer.passVision - 70) * 0.001
   ↳ passVision 90 → +2.0%, 50 → -2.0%
   ↳ secondaryActor 없는 플레이(Iso, PostUp, Transition, Putback)에서는 0

2. [A-2] 볼무브먼트 턴오버 완화 (턴오버 섹션):
   teamAvgVision = 코트 5인 passVision 평균
   visionDampen = clamp(0.85, 1.15, 1 - (teamAvgVision - 70) * 0.005)
   passRisk = rawPassRisk × visionDampen
   ↳ 시야 좋은 팀 (avg 85) → 볼무브 턴오버 7.5% 감소
   ↳ 시야 나쁜 팀 (avg 55) → 볼무브 턴오버 7.5% 증가

3. [A-3] CatchShoot/Handoff 오픈 탐지 보너스 (hitRate 섹션):
   CatchShoot or Handoff + secondaryActor 존재 시:
   openDetectionMod = (passer.passVision - 70) * 0.0015
   ↳ passVision 90 → +3.0% (A-1의 +2%와 중첩 = 총 +5%)
   ↳ 시야 넓은 패서가 더 좋은 오픈 찬스를 만듬

passVision 영향 요약:
  | 상황                       | vis 50 | vis 70 | vis 90 |
  |---------------------------|:------:|:------:|:------:|
  | 어시스트 시 hitRate (A-1)   | -2.0%  |  ±0%   | +2.0%  |
  | CatchShoot 추가 (A-3)     | -3.0%  |  ±0%   | +3.0%  |
  | 볼무브 TOV 완화 (A-2,팀평균)| +7.5%↑ |  ±0%   | -7.5%↓ |
```

---

## passAcc (패스 정확도) 시스템

패스를 정확한 위치에 전달하는 실행력 (바운스패스, 스킵패스, 랍패스):

```
적용 위치: possessionHandler.ts

1. [B-1] 턴오버에 직접 반영 (턴오버 섹션):
   isPassPlay = CatchShoot/Handoff/PnR_Handler/PnR_Roll/PnR_Pop/Cut
   passAccFactor = (70 - passAcc) × (isPassPlay ? 0.0012 : 0.0005)
   → totalTovProb에 합산
   ↳ passAcc 50 + 패스 플레이 → +2.4% 턴오버
   ↳ passAcc 50 + 비패스 플레이(Iso/PostUp) → +1.0%
   ↳ passAcc 90 + 패스 플레이 → -2.4% (정확한 패스 = 턴오버 감소)

2. [B-2] 어시스트 전달 퀄리티 (hitRate 섹션):
   secondaryActor 존재 시:
   deliveryQualityMod = (passer.passAcc - 70) * 0.0008
   ↳ passAcc 90 → +1.6%, 50 → -1.6%
   ↳ passVision(0.001)보다 작은 계수: 시야>전달

3. [B-3] Transition 롱패스 리스크 (턴오버 섹션):
   Transition 플레이 시:
   contextRisk += max(0, (70 - passAcc)) × 0.001
   ↳ passAcc 50 → Transition 턴오버 +2% 추가 (기존 3% + 2% = 5%)
   ↳ passAcc 90 → 추가 리스크 없음
   ↳ 풀코트 아웃렛 패스는 정확도가 필수

passAcc 영향 요약:
  | 상황                       | acc 50 | acc 70 | acc 90 |
  |---------------------------|:------:|:------:|:------:|
  | 턴오버-패스플레이 (B-1)     | +2.4%  |  ±0%   | -2.4%  |
  | 턴오버-비패스플레이 (B-1)   | +1.0%  |  ±0%   | -1.0%  |
  | 어시스트 시 hitRate (B-2)   | -1.6%  |  ±0%   | +1.6%  |
  | Transition 롱패스 (B-3)    | +2.0%  |  ±0%   |  ±0%   |
```

---

## PnR 랍패스 (Alley-Oop) 시스템

PnR_Roll + Rim + (Dunk/Layup) + secondaryActor(핸들러) 조건에서 발동:

```
적용 위치: possessionHandler.ts (hitRate 계산 직전)

[B-4] 2단계 판정:

  Step 1: 랍 시도 확률 (lobChance)
    base = 0.15 (15%)
    + (roller.vertical - 70) × 0.003    // vertical 90 → +6%
    + (handler.passVision - 70) × 0.002  // vision 90 → +4%
    + PnR Coverage:
      blitz → +10% (더블팀 → 레인 오픈)
      drop  → -8%  (빅맨 림 보호 → 랍 차단)
    = clamp(5%, 45%)

    | 상황        | base | vert 90 | vis 90 | 커버리지 | 합계 |
    |------------|:----:|:-------:|:------:|:-------:|:----:|
    | 일반 PnR    | 15%  |   +6%   |  +4%   |   0%    | 25%  |
    | Blitz 대응  | 15%  |   +6%   |  +4%   |  +10%   | 35%  |
    | Drop 대응   | 15%  |   +6%   |  +4%   |  -8%    | 17%  |

  Step 2: 랍 성공 판정 (lobSuccessRate, 시도 시에만)
    base = 0.50 (50%)
    + (handler.passAcc - 70) × 0.008    // passAcc 90 → +16% (핵심!)
    + (roller.hands - 70) × 0.004       // hands 90 → +8%
    + (roller.vertical - 70) × 0.003    // vertical 90 → +6%
    = clamp(15%, 90%)

    | handler passAcc | roller hands | roller vert | 성공률 |
    |:--------------:|:-----------:|:----------:|:-----:|
    | 90 (엘리트)     |     85      |     90     |  ~78% |
    | 70 (평범)       |     70      |     70     |  ~50% |
    | 50 (낮음)       |     60      |     60     |  ~27% |

  결과:
    성공 → lobBonus = +0.08 (이지 덩크/레이업 수준 hitRate 보너스)
    실패 → 즉시 turnover 반환 (악송구 = 공 분실)

  현실 모델: CP3→DeAndre Jordan 앨리웁 (높은 성공률)
            vs passAcc 낮은 센터의 랍 시도 (높은 실패율)
```

---

## stl + passPerc 연속적 효과 시스템

수비자의 `stl`(스틸)과 `passPerc`(패싱레인 인식)이 턴오버 확률과 스틸 비율에 연속적으로 기여:

```
능력치 본질:
  stl     = 볼을 빼앗는 실행력 (모든 상황: 드리블 긁어내기, 패스 낚아채기, 포스트업 탈취)
  passPerc = 패스 경로를 읽는 능력 (패스 발생 시에만 작동하는 선행 단계)
  패스 상황 체인: passPerc(경로 예측) → stl(실행) → 스틸 성공
  비패스 상황:    stl(실행)만 관여

적용 위치: possessionHandler.ts

1. 턴오버 확률 (totalTovProb):
   defStlPressure = (defender.stl - 70) × 0.0008     // 모든 상황
   defLaneReading = isPassPlay ? (defender.passPerc - 70) × 0.0010 : 0  // 패싱 플레이 전용

2. 스틸 비율 (stealRatio):
   stealRatio += (defender.stl - 70) × 0.003          // 모든 상황
   if isPassPlay: stealRatio += (defender.passPerc - 70) × 0.0025  // 패싱 플레이 전용
   stealRatio = clamp(0.15, 0.75)                     // 캡

isPassPlay = CatchShoot/Handoff/PnR_Handler/PnR_Roll/PnR_Pop/Cut

| 상황           | stl 역할               | passPerc 역할           |
|---------------|----------------------|----------------------|
| Iso/PostUp     | TOV 유발 + stealRatio | 없음 (패스 없음)         |
| PnR/CatchShoot | TOV 유발 + stealRatio | TOV 유발 + stealRatio  |
| Transition     | TOV 유발 + stealRatio | 없음 (isPassPlay 아님)  |

수비자 프로파일 비교:
  | 타입         | stl | passPerc | Iso TOV | PnR TOV | Iso stealR | PnR stealR |
  |-------------|-----|---------|---------|---------|-----------|-----------|
  | GP2 (Hands) | 95  |   70    | +2.0%   |  +2.0%  |   52.5%   |   52.5%   |
  | Draymond    | 70  |   95    |  ±0%    |  +2.5%  |   45.0%   |   51.3%   |
  | Kawhi       | 90  |   88    | +1.6%   |  +3.4%  |   51.0%   |   55.5%   |
  | Jokic       | 45  |   50    | -2.0%   |  -2.0%  |   37.5%   |   37.5%   |
```

---

## shotType별 수비 차등 시스템

마무리 타입(shotType)에 따라 수비의 영향력이 달라짐:

```
// SIM_CONFIG.SHOT_DEFENSE (constants.ts)

1. Contest Factor (defRating 영향력 스케일링):
   hitRate += (offRating - defRating × contestFactor) * 0.002

   | shotType    | contestFactor | 의미                          |
   |-------------|:------------:|-------------------------------|
   | Dunk        | 0.85         | 파워 마무리, 컨테스트 영향 적음    |
   | Layup       | 1.00         | 기준                          |
   | Floater     | 0.60         | 높은 아크로 수비 도달 어려움      |
   | Hook        | 0.50         | 독특한 릴리스로 수비 관여 어려움    |
   | Pullup      | 0.80         | 이동 중 슛, 약간의 수비 이점      |
   | Jumper      | 0.85         | 셋 슛, 수비 예측 가능           |
   | Fadeaway    | 0.40         | 거리 두고 뒤로 빠지는 슛          |
   | CatchShoot  | 1.00         | 수비 클로즈아웃 정면             |

2. Block Multiplier (블록 확률 배율):
   blockProb *= blockMult

   | shotType    | blockMult | 의미                    |
   |-------------|:---------:|-----------------------|
   | Dunk        | 0.85      | 파워로 블록 저항          |
   | Layup       | 1.00      | 기준                   |
   | Floater     | 0.30      | 높은 아크 → 블록 극히 어려움 |
   | Hook        | 0.40      | 독특한 릴리스              |
   | Pullup      | 0.70      | 이동 중이라 일부 회피       |
   | Jumper      | 0.60      | 거리가 있어 블록 어려움      |
   | Fadeaway    | 0.20      | 거의 블록 불가            |
   | CatchShoot  | 1.00      | 클로즈아웃 수비            |

3. And-1 Multiplier (슛+파울 확률 배율):

   | shotType    | and1Mult | 의미                     |
   |-------------|:--------:|------------------------|
   | Dunk        | 1.50     | 접촉 多 → And-1 빈번      |
   | Layup       | 1.00     | 기준                     |
   | Floater     | 0.30     | 비접촉 슛                 |
   | Hook        | 0.50     | 포스트 접촉 있음            |
   | Pullup      | 0.00     | 점프슛 → And-1 불가        |
   | Jumper      | 0.00     |                         |
   | Fadeaway    | 0.00     |                         |
   | CatchShoot  | 0.00     |                         |

Dunk 전용 추가 블록 저항:
  - (strength - 70) * 0.001    // 파워로 블록 밀어내기
  - (vertical - 70) * 0.0005   // 더 높이 뛰어 블록 회피
```

---

## 아키타입 시스템 (archetypeSystem.ts)

```typescript
calculatePlayerArchetypes(attr, condition):

fatigueFactor = max(0.5, 0.5 + condition * 0.005)
  // condition=100 → 1.0, condition=50 → 0.75, condition=0 → 0.5

scores = {
  // 공격 역할
  handler:     (handling*0.30 + passIq*0.25 + passVision*0.25 + passAcc*0.20) * fatigue
  spacer:      (threeVal*0.60 + shotIq*0.25 + offConsist*0.15) * fatigue
  driver:      (speed*0.20 + agility*0.15 + vertical*0.10 + ins*0.35 + mid*0.20) * fatigue
  screener:    (strength*0.40 + normHeight*0.30 + normWeight*0.30) * fatigue
  roller:      (ins*0.40 + vertical*0.30 + speed*0.30) * fatigue
  popper:      (threeVal*0.70 + shotIq*0.30) * fatigue
  connector:   (passIq*0.30 + helpDefIq*0.20 + hustle*0.30 + hands*0.20) * fatigue
  postScorer:  (ins*0.50 + strength*0.30 + hands*0.20) * fatigue
  isoScorer:   (handling*0.25 + mid*0.25 + speed*0.25 + agility*0.25) * fatigue

  // 수비 역할
  perimLock:   (perDef*0.50 + agility*0.25 + stl*0.25) * fatigue
  rimProtector:(blk*0.35 + intDef*0.35 + vertical*0.15 + normHeight*0.15) * fatigue
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
  Hero:
    Iso:          [2.5, 1.8, 1.2, 0.7, 0.4]  ← 에이스 집중 (1옵:5옵 = 6.3:1)
    PostUp:       [2.2, 1.6, 1.0, 0.6, 0.3]
    PnR_Handler:  [2.5, 1.8, 1.2, 0.7, 0.4]
  Designed:
    Handoff:      [2.0, 1.6, 1.2, 0.8, 0.5]
    PnR_Pop:      [1.6, 1.4, 1.2, 0.9, 0.6]
  System:
    PnR_Roll:     [1.3, 1.2, 1.1, 1.0, 0.9]  ← 균등 (1옵:5옵 = 1.4:1)
    CatchShoot:   [1.5, 1.3, 1.2, 1.0, 0.8]
    Cut:          [1.4, 1.2, 1.1, 1.0, 0.8]
  Chaos:
    Transition:   [1.0, 1.0, 1.0, 1.0, 1.0]  ← 완전 균등
    Putback:      [1.0, 1.0, 1.0, 1.0, 1.0]

Star Gravity Boost:
  gravityBoost = min(0.30, max(0, (topGravity - 65) * 0.015))
  Hero 플레이 비중 최대 30% 증가 (캡)
```

**Iso 예시 (pow=1.0)**:
  1옵션(rawScore 130): 130 × 2.5 = 325 → 44.7%
  5옵션(rawScore 74):  74 × 0.4 = 30  → 4.1%
  → 목표 USG%: 1옵 ~33%, 5옵 ~11% (현실 NBA 수준)

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
recovery = (timeTaken / 60) * BENCH_RECOVERY_RATE (=3.0)
  + stamina 보정 (RECOVERY_STAMINA_FACTOR: 0.30)
  + durability 보정 (RECOVERY_DURABILITY_FACTOR: 0.20)
player.currentCondition = min(100, currentCondition + recovery)

// 특수 회복
타임아웃: +1 (전 선수)
쿼터 브레이크: +1.5 (전 선수)
하프타임: +5 (전 선수)

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
  Rim   (레이업, 덩크)
  Paint (플로터, 훅)
  Mid   (풀업, 점퍼, 페이드어웨이)
  3PT   (캐치앤슛, 트랜지션 3점)

15개 세부 존 (Shot Chart + 서브존 능력치 매핑):
  zone_rim         (림 근처 통합)
  zone_paint       (페인트 좌/우)
  zone_mid_l/c/r   (중거리 좌/중/우)
  zone_c3_l/r      (코너 3점 좌/우) → threeCorner
  zone_atb3_l/r    (윙 3점 좌/우)   → three45
  zone_atb3_c      (탑 3점)         → threeTop
```

### 존 가중치 결정

```
selectZone(zones, actor, sliders):

  score(zone) = (attr(zone) / 100) × 0.60 + (slider(zone) / 10) × 0.40

  속성 매핑:
    3PT → attr.out, slider: shot_3pt
    Mid → attr.mid, slider: shot_mid
    Rim → attr.ins, slider: shot_rim
```

---

## 기본 확률 상수 (SIM_CONFIG)

```typescript
SHOOTING: {
  INSIDE_BASE_PCT: 0.57,     // Rim/Paint 기본 57%
  MID_BASE_PCT:    0.38,     // Mid 기본 38%
  THREE_BASE_PCT:  0.34,     // 3PT 기본 34%
}

FATIGUE: {
  DRAIN_BASE:          2.5,
  BENCH_RECOVERY_RATE: 3.0,
  STAMINA_SAVE_FACTOR: 0.015,
  TIMEOUT_RECOVERY: 1,
  QUARTER_BREAK_RECOVERY: 1.5,
  HALFTIME_RECOVERY: 5,
}

GAME_ENV: {
  BASE_POSSESSIONS: 98,
  HOME_ADVANTAGE:   0.02,
}

FINISH: {
  BASELINE: 60,
  DUNK_VERT_MIN: 70, DUNK_STR_MIN: 65, DUNK_WEIGHT: 1.5,
  LAYUP_WEIGHT: 1.0,
  FLOATER_CLOSESHOT_MIN: 80, FLOATER_WEIGHT: 0.7,
  HOOK_HEIGHT_MIN: 208, HOOK_CLOSESHOT_MIN: 80, HOOK_WEIGHT: 0.8,
  MID_MIN: 72, MID_DRIVE_WEIGHT: 0.5, MID_POST_WEIGHT: 0.7,
  FADEAWAY_POSTPLAY_MIN: 80, FADEAWAY_MID_MIN: 85, FADEAWAY_CLOSESHOT_MIN: 85, FADEAWAY_WEIGHT: 0.6,
}

SHOT_DEFENSE: {
  CONTEST:   { Dunk:0.85, Layup:1.0, Floater:0.6, Hook:0.5, Pullup:0.8, Jumper:0.85, Fadeaway:0.4, CatchShoot:1.0 },
  BLOCK_MULT:{ Dunk:0.85, Layup:1.0, Floater:0.3, Hook:0.4, Pullup:0.7, Jumper:0.6,  Fadeaway:0.2, CatchShoot:1.0 },
  AND1_MULT: { Dunk:1.5,  Layup:1.0, Floater:0.3, Hook:0.5, Pullup:0.0, Jumper:0.0,  Fadeaway:0.0, CatchShoot:0.0 },
  DUNK_STR_RESIST: 0.001,
  DUNK_VERT_RESIST: 0.0005,
}

ZONE_SHOOTING: {
  B-1. Mr. Fundamental: mid≥97
  B-2. Rangemaster: threeVal≥90 && shotIq≥85
  B-3. Tyrant: ins≥90 && (str≥88 || vert≥88), hitRate+3%, block-3%
  B-4. Levitator: closeShot≥96 && agility≥85 && height≤195, block×0.5
  B-5. Afterburner: speed≥95 && spdBall≥90 && agility≥93, transition+2%
  B-6. Ascendant: vert≥95 && closeShot≥93 (PG/SG), rim block×0.6
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
| `defIntensity` | 1-10 | hitRate (-0.5% per step), TOV (±0.8%), 파울 확률 (+1.5%, cap 18%) |
| `helpDef` | 1-10 | Rim/Paint hitRate (-0.8% per step), 스위치 혼란 감소 |
| `switchFreq` | 1-10 | 스크린 플레이 시 스위치 확률 (×5%) |
| `fullCourtPress` | 1-6 | 피로도 소모 (+5% per step above 1) |
| `zoneFreq` | 1-10 | 존 수비 발동 확률 (×8%), C/PF 앵커 수비 |
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
  updateZoneStats(actor, zone, true, result.subZone)  // 서브존 전달
  if assister: assister.stats.ast += 1
  offTeam.score += points
  updatePlusMinus(offTeam, defTeam, points)

type === 'miss':
  actor.stats.fga += 1
  if zone === '3PT': actor.stats.p3a += 1
  updateZoneStats(actor, zone, false, result.subZone)  // 서브존 전달
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
| 3점슛 성공 | 34% | 5~95% |
| 중거리 성공 | 38% | 5~95% |
| 림 성공 | 57% | 5~95% |
| 턴오버 | 8.5% (base) | 2~25% |
| 파울 (defIntensity=5) | 15.5% | 3~21% |
| 블록 (Rim) | 10% × shotType 배율 | |
| 블록 (3PT) | 1% × shotType 배율 | |
| Transition 포세션 | pace × 3% | |
| Putback (공격리바 직후) | 15% + offReb×2% | |
| Steal (턴오버 시) | 45% 기본 | 15~75% |
| stl 압박 (수비자 stl 90) | +1.6% TOV, +6% stealR | |
| passPerc 레인 읽기 (passPerc 90, 패싱 플레이) | +2.0% TOV, +5% stealR | |
| And-1 (Rim/Paint) | 3% × shotType 배율 | |
| Defensive Lapse | defConsist 50→6% | 0~12% |
| PnR 랍 시도 (PnR_Roll+Rim) | 15% | 5~45% |
| PnR 랍 성공 | 50% | 15~90% |
| 어시스트 hitRate 보너스 (passVision 90) | +2.0% | |
| CatchShoot 오픈 보너스 (passVision 90) | +3.0% | |
| 패스 플레이 추가 턴오버 (passAcc 50) | +2.4% | |
| **액터 선택 pow 지수** | **1.0 (선형)** | |
| **Hero USAGE_WEIGHTS 1옵:5옵** | **6.3:1** | Iso [2.5, ..., 0.4] |
| **System USAGE_WEIGHTS 1옵:5옵** | **1.8:1** | CatchShoot [1.5, ..., 0.8] |
| **Star Gravity Boost** | **(topGravity-65)×0.015** | 캡 0.30 |
| **목표 1옵션 USG%** | **~33%** | 현실 30~36% |
| **목표 5옵션 USG%** | **~11%** | 현실 10~15% |
