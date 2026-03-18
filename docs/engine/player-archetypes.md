# Player Archetype System

## 개요

선수의 플레이스타일과 역할 **정체성**을 표현하는 시스템.
기존 두 아키타입 시스템과 완전히 별개 레이어로 동작한다.

| 시스템 | 목적 | 위치 |
|--------|------|------|
| **PBP ArchetypeRatings** (12종) | 경기 중 액터 선택 가중치 | `services/game/engine/pbp/archetypeSystem.ts` |
| **히든 아키타입** (18종) | 엘리트 임계값 도달 시 보너스 | `flowEngine.ts`, `possessionHandler.ts` |
| **플레이어 아키타입** (본 문서) | 선수 정체성 표현 + FA 연봉 산정 | `services/playerDevelopment/archetypeEvaluator.ts` |

---

## 아키텍처

```
Player 능력치
    │
    ▼
calcModuleScores()          ← 11개 역할 모듈 점수 (0~100)
    │
    ├─ calcArchetypeScore()  ← 13개 아키타입 점수 (모듈 가중 합산)
    │      + 포지션 게이트
    │      + 시즌 성적 StyleFit 보정 (±5)
    │      + 기존 아키타입 관성 보너스 (+5)
    │
    ├─ Primary Archetype     ← 최고 점수
    │  Secondary Archetype   ← 2위 (1위와 차이 ≤ 7 시 부여)
    │
    └─ calcTraitTags()       ← 14개 특성 태그 (모듈 임계값 기반)
```

---

## 1. 11개 역할 모듈

능력치 조합으로 계산한 역할별 퍼포먼스 점수 (0~100).

| 모듈 | 핵심 능력치 | 공식 |
|------|-----------|------|
| `rimFinishing` | layup, dunk, closeShot | layup×0.26 + dunk×0.18 + closeShot×0.12 + drawFoul×0.12 + hands×0.08 + spdBall×0.08 + vertical×0.08 + agility×0.08 |
| `postCraft` | postPlay, closeShot, strength | postPlay×0.34 + closeShot×0.18 + strength×0.16 + drawFoul×0.10 + hands×0.10 + shotIq×0.06 + offConsist×0.06 |
| `spotUpShooting` | threeCorner, three45, threeTop | threeCorner×0.30 + three45×0.24 + threeTop×0.18 + ft×0.12 + shotIq×0.08 + offConsist×0.08 |
| `shotCreation` | midRange, handling, spdBall | midRange×0.26 + threeTop×0.16 + three45×0.10 + handling×0.18 + spdBall×0.12 + drawFoul×0.10 + shotIq×0.08 |
| `playmaking` | passVision, passAcc, passIq | passVision×0.28 + passAcc×0.24 + passIq×0.18 + handling×0.14 + spdBall×0.10 + offBallMovement×0.06 |
| `offballAttack` | offBallMovement, *spotUpShooting* | offBallMovement×0.28 + **spotUpShooting모듈**×0.20 + layup×0.12 + speed×0.10 + agility×0.10 + shotIq×0.10 + offConsist×0.10 |
| `poaDefense` | perDef, steal, agility | perDef×0.30 + steal×0.14 + agility×0.12 + speed×0.10 + passPerc×0.12 + helpDefIq×0.10 + defConsist×0.12 |
| `teamDefense` | helpDefIq, passPerc, perDef | helpDefIq×0.20 + passPerc×0.18 + perDef×0.16 + intDef×0.14 + steal×0.08 + blk×0.08 + boxOut×0.08 + defConsist×0.08 |
| `rimProtection` | intDef, blk, helpDefIq | intDef×0.34 + blk×0.24 + helpDefIq×0.12 + strength×0.10 + vertical×0.10 + defConsist×0.10 |
| `rebounding` | offReb, defReb, boxOut | offReb×0.24 + defReb×0.34 + boxOut×0.24 + strength×0.10 + hustle×0.08 |
| `motorAvailability` | stamina, hustle, durability | stamina×0.26 + hustle×0.24 + durability×0.30 + offConsist×0.10 + defConsist×0.10 |

> **주의:** `offballAttack`은 `spotUpShooting` **모듈 점수**를 재입력으로 사용한다. 계산 순서 보장 필요.

---

## 2. 13개 아키타입

### 가드 계열 (PG/SG)

| 아키타입 | 설명 | 핵심 모듈 |
|---------|------|---------|
| `primary_creator_guard` | 공격 설계자형 가드 | play×0.38 + shotC×0.22 + rim×0.12 + spot×0.08 + poa×0.08 + motor×0.12 |
| `scoring_combo_guard` | 득점형 콤보 가드 | shotC×0.32 + rim×0.20 + spot×0.18 + play×0.12 + offball×0.08 + motor×0.10 |
| `movement_shooter` | 오프볼 무브먼트 슈터 | spot×0.40 + offball×0.28 + motor×0.12 + poa×0.10 + team×0.10 |
| `perimeter_3nd` | 외곽 수비 & 슈터 | spot×0.30 + poa×0.28 + team×0.20 + offball×0.10 + motor×0.12 |

### 윙 계열 (SG/SF/PF)

| 아키타입 | 설명 | 핵심 모듈 |
|---------|------|---------|
| `two_way_wing` | 공수 균형형 윙 | spot×0.18 + rim×0.16 + poa×0.18 + team×0.18 + shotC×0.10 + reb×0.10 + motor×0.10 |
| `slashing_wing` | 돌파 & 컷인형 윙 | rim×0.34 + shotC×0.16 + offball×0.14 + poa×0.12 + team×0.10 + motor×0.14 |
| `shot_creator_wing` | 볼핸들링 득점형 윙 | shotC×0.30 + rim×0.18 + spot×0.16 + play×0.10 + poa×0.10 + motor×0.16 |
| `connector_forward` | 패스 & 허슬형 포워드 | play×0.24 + spot×0.18 + team×0.16 + reb×0.14 + offball×0.10 + rim×0.08 + motor×0.10 |

### 빅 계열 (PF/C)

| 아키타입 | 설명 | 핵심 모듈 |
|---------|------|---------|
| `post_scoring_big` | 로우포스트 스코어러 | post×0.38 + rim×0.20 + reb×0.16 + rimProt×0.10 + team×0.08 + motor×0.08 |
| `rim_runner_big` | 롤맨 & 마무리형 빅 | rim×0.30 + rimProt×0.24 + reb×0.22 + team×0.10 + motor×0.14 |
| `stretch_big` | 외곽슛 가능한 빅 | spot×0.30 + reb×0.20 + rimProt×0.18 + team×0.12 + post×0.10 + motor×0.10 |
| `rim_protector_anchor` | 수비 앵커형 센터 | rimProt×0.38 + reb×0.26 + team×0.14 + motor×0.10 + post×0.12 |
| `playmaking_big` | 패스 허브형 빅 | play×0.26 + post×0.20 + spot×0.16 + reb×0.16 + team×0.12 + rimProt×0.10 |

---

## 3. 포지션 게이트

아키타입 후보를 포지션으로 1차 필터링한다. 경계 포지션(SG, PF)은 중복 허용.

```
PG  → primary_creator_guard, scoring_combo_guard, movement_shooter
SG  → 가드 4종 + two_way_wing, slashing_wing, shot_creator_wing
SF  → movement_shooter, perimeter_3nd, two_way_wing, slashing_wing,
       shot_creator_wing, connector_forward, playmaking_big
PF  → perimeter_3nd, two_way_wing, connector_forward + 빅 5종
C   → post_scoring_big, rim_runner_big, stretch_big,
       rim_protector_anchor, playmaking_big
```

---

## 4. 아키타입 배정 알고리즘 (`assignArchetypes`)

```
1. modules = calcModuleScores(player)
2. eligible = getEligibleArchetypes(player.position)

3. 각 eligible 아키타입의 finalScore 계산:
   ┌ 첫 배정 (prevState 없음):
   │   finalScore = attrScore
   └ 갱신 (prevState 있음):
       styleBonus = calcStatStyleFit(seasonStats)[type] ?? 0
       prevBonus  = prevState.primary === type ? 5 : 0
       finalScore = attrScore × 0.60 + (attrScore + styleBonus) × 0.25 + prevBonus × 0.15

4. primary  = 최고 finalScore 아키타입
   secondary = 2위 (1위와 차이 ≤ 7 시 부여)

5. 변경 임계값 체크 (prevState 있는 경우):
   ┌ 충분한 출전: stats.g ≥ 50 OR stats.mp ≥ 1200
   └ 점수 차 임계값:
       나이 ≤ 24 → 5점 초과 시 변경
       나이 25~30 → 8점 초과 시 변경
       나이 31+   → 10점 초과 시 변경
   ※ 미달 시 primary는 유지, tags + moduleScores만 갱신

6. tags = calcTraitTags(modules, player)
7. return { primary, secondary, tags, moduleScores, lastUpdated }
```

---

## 5. 시즌 성적 StyleFit 보정 (`calcStatStyleFit`)

시즌 스탯이 특정 패턴을 보이면 해당 아키타입 점수에 보너스(+2~+5)를 부여.

| 조건 | 보너스 아키타입 |
|------|--------------|
| ast/g ≥ 7 | `primary_creator_guard` +5 |
| ast/g ≥ 5 | `primary_creator_guard` +3 |
| 3PA/g ≥ 6 && 3P% ≥ 36% | `movement_shooter` +5, `stretch_big` +4 |
| 3PA/g ≥ 4 && 3P% ≥ 35% | `movement_shooter` +3, `stretch_big` +3 |
| rimA/g ≥ 6 && FTA/g ≥ 5 | `slashing_wing` +5, `rim_runner_big` +4 |
| blk/g ≥ 2.5 && reb/g ≥ 9 | `rim_protector_anchor` +5 |
| ast/g ≥ 4 && pts/g < 14 | `connector_forward` +4, `playmaking_big` +3 |

---

## 6. 14개 특성 태그

아키타입보다 빠르게 변하는 세부 특성. 모듈 점수 또는 개별 능력치 임계값으로 판별.

| 태그 | 조건 |
|------|------|
| `elite_finisher` | rimFinishing ≥ 85 |
| `foul_merchant` | drawFoul ≥ 88 |
| `shotmaker` | shotCreation ≥ 85 |
| `floor_spacer` | spotUpShooting ≥ 85 |
| `off_ball_mover` | offballAttack ≥ 82 AND spotUpShooting ≥ 82 |
| `plus_playmaker` | playmaking ≥ 82 |
| `poa_stopper` | poaDefense ≥ 84 |
| `team_defender` | teamDefense ≥ 84 |
| `rim_protector` | rimProtection ≥ 85 |
| `glass_cleaner` | rebounding ≥ 84 |
| `high_motor` | motorAvailability ≥ 85 |
| `ironman` | durability ≥ 90 AND stamina ≥ 85 |
| `streaky_scorer` | (shotCreation ≥ 72 OR spotUpShooting ≥ 72) AND offConsist ≤ 65 |
| `reliable_two_way` | offConsist ≥ 75 AND defConsist ≥ 75 |

---

## 7. 갱신 주기

| 시점 | 동작 |
|------|------|
| **첫 로드 (archetypeState 없음)** | `assignArchetypes(player, season)` — 능력치 기반 즉시 배정 |
| **오프시즌** | `assignArchetypes(player, season, prevState, seasonStats)` — 성적 반영, 나이별 임계값으로 천천히 변경 |
| **스냅샷/세이브 복원** | `player.archetypeState` 그대로 복원 (재계산 없음) |

> PlayerDetailView에서는 `player.archetypeState`가 없으면 `useMemo`로 즉시 계산해 표시한다.

---

## 8. FA 시스템 연동

FA 연봉 산정 엔진의 `FARole` (7종)으로 매핑된다.

```ts
primary_creator_guard  → lead_guard
scoring_combo_guard    → combo_guard
movement_shooter       → 3and_d
perimeter_3nd          → 3and_d
two_way_wing           → 3and_d
slashing_wing          → shot_creator
shot_creator_wing      → shot_creator
connector_forward      → floor_big
post_scoring_big       → floor_big
rim_runner_big         → rim_big
stretch_big            → stretch_big
rim_protector_anchor   → rim_big
playmaking_big         → floor_big
```

`ARCHETYPE_TO_FA_ROLE` 매핑은 `types/archetype.ts`에 정의.

---

## 9. 파일 구조

```
types/
├── archetype.ts                           ← 모든 타입 + ARCHETYPE_TO_FA_ROLE 매핑
│       ArchetypeType (13종)
│       TraitTag (14종)
│       ArchetypeModuleScores
│       PlayerArchetypeState
│       ArchetypeDisplayInfo
│       ARCHETYPE_TO_FA_ROLE
└── player.ts                              ← Player, SavedPlayerState에 archetypeState? 추가

services/playerDevelopment/
├── archetypeEvaluator.ts                  ← 핵심 계산 로직
│       calcModuleScores()
│       getEligibleArchetypes()
│       calcArchetypeScore()
│       calcStatStyleFit()
│       calcTraitTags()
│       assignArchetypes()               ← 메인 배정 함수
│       getArchetypeDisplayInfo()
│       getTraitTagDisplayInfo()
└── playerAging.ts                         ← 오프시즌 시 assignArchetypes() 호출

hooks/useGameData.ts                       ← roster_state 저장/복원 경로
services/snapshotBuilder.ts               ← replay_snapshot 저장/복원 경로
views/PlayerDetailView.tsx                ← Primary/Secondary 배지 + 태그 렌더링
```

---

## 10. 향후 확장 예정

| 항목 | 내용 |
|------|------|
| **팀 아키타입 균형 분석** | 5인 라인업의 아키타입 구성 시각화 (FrontOfficeView) |
| **드래프트 전망 연동** | 신인의 아키타입 + 잠재력으로 성장 방향 예측 |
| **아키타입별 OVR 가중치** | 현재 `calculateOvr()`는 포지션 기반. 아키타입 반영 옵션 고려 |
