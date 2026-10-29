# 경기 엔진 해부도 (Engine Anatomy)

> 작성: 2026-10-29 · 기준 코드: `cea9f45f` (킥아웃·에이스 하한·속공 재설계 반영) · 대상 디렉터리: `services/game/engine/`, `services/game/config/`
>
> 이 문서는 엔진의 **모든 부품이 어떤 순서로 실행되고, 서로 어떻게 영향을 주고, 어떤 결과를 만드는지**를 한 곳에 모은 것이다.
> 개별 주제 문서(`docs/engine/*.md`)보다 넓게, 코드 줄 단위의 순서와 수식을 기준으로 썼다.
> 수치는 이 시점의 `SIM_CONFIG`(constants.ts) 값이다 — 값이 바뀌면 이 문서의 수치도 낡는다. **판단 전에 반드시 현재 코드를 다시 확인할 것.**

---

## 목차

1. [전체 구조](#1-전체-구조)
2. [입력: 선수·팀 데이터가 엔진에 들어오는 길](#2-입력-선수팀-데이터가-엔진에-들어오는-길)
3. [경기 루프 (stepPossession)](#3-경기-루프-steppossession)
4. [포세션 파이프라인 (simulatePossession)](#4-포세션-파이프라인-simulatepossession)
5. [슛 성공률 계산 (calculateHitRate)](#5-슛-성공률-계산-calculatehitrate)
6. [블락 · 성공 판정 · 앤드원 · 리바운드](#6-블락--성공-판정--앤드원--리바운드)
7. [결과 기록 (statsMappers)](#7-결과-기록-statsmappers)
8. [시간 (포세션 시간 · 샷클락)](#8-시간-포세션-시간--샷클락)
9. [체력 · 부상 · 회복](#9-체력--부상--회복)
10. [교체 · 로테이션 · 가비지 · 타임아웃 · 모멘텀 · 클러치 · 연장](#10-교체--로테이션--가비지--타임아웃--모멘텀--클러치--연장)
11. [영향 지도: 슬라이더](#11-영향-지도-슬라이더)
12. [영향 지도: 능력치](#12-영향-지도-능력치)
13. [영향 지도: 시드 성향(히든 텐던시)과 DB 성향](#13-영향-지도-시드-성향히든-텐던시와-db-성향)
14. [무작위성(분산)이 생기는 곳](#14-무작위성분산이-생기는-곳)
15. [현재 엔진이 만드는 결과 (측정치)](#15-현재-엔진이-만드는-결과-측정치)
16. [구조적 특성 · 알려진 이슈 · 주의점](#16-구조적-특성--알려진-이슈--주의점)
17. [비활성 기능 · 미러 차이 · 데드 코드](#17-비활성-기능--미러-차이--데드-코드)
18. [엔진을 고칠 때 체크리스트](#18-엔진을-고칠-때-체크리스트)

---

## 1. 전체 구조

### 1-1. 파일 지도

| 층 | 파일 | 역할 |
|---|---|---|
| 진입 | `engine/pbp/main.ts` | `runFullGameSimulation` — 상태 생성 → `stepPossession` 반복 → `extractSimResult` |
| 경기 루프 | `engine/pbp/liveEngine.ts` | `createGameState`, `stepPossession`(쿼터 전환·시간·교체·공격권·타임아웃), `extractSimResult` |
| 팀 초기화 | `engine/pbp/initializer.ts` | 선수 → `LivePlayer`(능력치 정규화, 아키타입, 시드 성향, 존 성향), 선발, 슬롯 |
| 포세션 | `engine/pbp/possessionHandler.ts` | `simulatePossession` — 플레이 선택부터 슛·파울·턴오버·블락·리바운드까지 |
| 플레이 | `engine/pbp/playTypes.ts` | `resolvePlayAction` — 플레이별 액터·패서·존·슛 종류·보너스, `selectZone`, `resolveFinish` |
| 성공률 | `engine/pbp/flowEngine.ts` | `calculateHitRate`, `calculateMatchupGap`, `interpolateCurve` |
| 옵션 순위 | `engine/pbp/usageSystem.ts` | 스코어링 그래비티, 옵션 순위, 에이스 격차 |
| 아키타입 | `engine/pbp/archetypeSystem.ts` | 11개 역할 점수 |
| 리바운드 | `engine/pbp/reboundLogic.ts` | 공격/수비 리바운드 확률, 리바운더 선정 |
| 기록 | `engine/pbp/statsMappers.ts` | 박스스코어·로그·자유투·어시스트·플레이타입 PPP·샷 이벤트 |
| 시간 | `engine/pbp/timeEngine.ts` | 포세션 소요 시간 |
| 체력 | `engine/pbp/stateUpdater.ts`, `engine/fatigueSystem.ts`, `engine/injuryGrades.ts` | 소모·회복·부상 |
| 교체 | `engine/pbp/substitutionSystem.ts`, `rotationLogic.ts`, `rotationSuccession.ts`, `slotAssignment.ts` | 긴급 교체, 로테이션 표, 승계, 슬롯 |
| 경기 운영 | `timeoutPolicy.ts`, `tacticSchedule.ts`, `periodRules.ts` | 타임아웃, 시간별 전술 세트, 연장·점프볼 |
| 정규화 | `engine/pbp/leagueNormalization.ts` | 리그 수준 보정 |
| 서브존 | `engine/shotDistribution.ts` | 코너/45도/탑, 미드 좌/중/우 |
| 에이스 스토퍼 | `engine/aceStopperSystem.ts` | 지정 스토퍼의 에이스 억제 |
| 설정 | `config/constants.ts`(`SIM_CONFIG`), `playTypeProfiles.ts`, `usageWeights.ts`, `tacticPresets.ts` | 모든 계수 |
| 입력 | `services/dataMapper.ts`(클라) / `server/src/shared/dataMapper.ts`(서버) | DB 행 → 런타임 Player |
| AI 전술 | `services/game/tactics/tacticGenerator.ts`, 서버 `tacticRepair.ts`, `aiCoach/aiCoachPlan.ts` | 전술 자동 생성·보정 |

### 1-2. 실행 경로

- **싱글 플레이(클라이언트)**: `services/gameEngine.ts` → `main.ts`. 전체 PBP를 먼저 만든 뒤 화면이 타임라인으로 재생한다.
- **멀티 리그(서버)**: `server/src/simRunner.ts` → `server/src/shared/engine/pbp/main.ts`(미러). 경기 직전 AI 팀 전술을 AI 감독(`planAiTeam`) 또는 `repairAiTactics`로 정한 뒤 시뮬한다. 정규화 컨텍스트는 `rooms.sim_settings.leagueContext` 캐시를 쓴다.
- **미러 규칙**: `services/game/**` ↔ `server/src/shared/**`는 로직이 같아야 한다(임포트 경로·주석만 다름). Docker 이미지가 `server/src`만 복사하므로 서버가 쓰는 코드는 반드시 미러에 있어야 한다.

### 1-3. 한 줄 요약

> 매 포세션마다 **플레이 → 액터 → 존·슛 종류 → 수비수 → (프레스·블리츠) → 헬프·킥아웃 → 림 프로텍터 → 파울 계열 → 바이올레이션 → 턴오버 → 랍 → 성공률 → 블락 → 성공/실패 → 리바운드**를 정해진 순서로 굴리고, 앞 단계에서 끝나면 뒤는 실행되지 않는다. 결과를 기록한 뒤 시간·체력·교체·공격권을 갱신한다.

---

## 2. 입력: 선수·팀 데이터가 엔진에 들어오는 길

### 2-1. 선수 능력치 → `LivePlayer.attr`

1. **DB → Player** (`dataMapper`): `meta_players.base_attributes`(+ 리그 설정에 따라 `custom_overrides`). 멀티는 `room_player_state`의 체력·부상·`attrDeltas`(성장)를 덧씌운다.
2. **합성값**: `ins`/`out`/`plm`/`def`/`reb`/`ath`는 개별 능력치 평균(클라·서버 동일 정의, 17절).
3. **Player → attr** (`initializer`): 개별 능력치를 그대로 복사하고 `threeVal = (코너+45도+탑)/3`, `drFoul = drawFoul`, `stl = steal`, `mid = midRange`.
4. **리그 정규화** (`normalizeAttrs`): 리그 로테이션(팀별 상위 9명) 평균 OVR `muLeague`가 기준 `MU_REF 75`보다 높으면, 정해진 능력치에서 `(muLeague − 75) × k × boost`만큼 일괄 차감한다(0~99로 자름).
   - **대상**: layup, dunk, closeShot, mid, postPlay, intDef, perDef, def, helpDefIq, defConsist, shotIq, offConsist, spdBall, speed, stamina, durability, handling, passAcc, passIq, passVision, hands, offReb, blk, **drFoul(×2.5)**
   - **비대상**: 3점 3종, ft, strength, vertical, agility, height, defReb, boxOut, steal, passPerc, hustle, intangibles
   - **k 결정(멀티)**: `sim_settings.normalization.k` → `normalizationStrength` → 캐시 k 순서. 예: NBA Active는 `normalization.k = 0.3`, muLeague 81.19 → 차감 약 1.9(drFoul 약 4.6).
5. **아키타입** (`calculatePlayerArchetypes`): 경기 시작 시 1회, 시작 체력 계수(`0.5 + condition × 0.005`)를 곱해 계산한다. **경기 중 체력이 떨어져도 다시 계산하지 않는다.**

| 아키타입 | 식 | 주 사용처 |
|---|---|---|
| handler | handling .30 + passIq .25 + passVision .25 + passAcc .20 | 플레이메이킹 그래비티, 패서 선정, Iso/PnR 액터 보조, 속공 운반자 |
| spacer | threeVal .60 + shotIq .25 + offConsist .15 | CS·킥아웃 수신자, 트레일러, 핸드오프·OBS 슈터 |
| driver | speed .20 + agility .15 + vertical .10 + ins .35 + mid .20 | 컷, DriveKick 드라이버, 속공 러너 |
| screener | 체격(키·몸무게·근력) | 스크린 판정, 스크리너 선정, 체격 자격(≥55) |
| roller | ins .40 + vertical .30 + speed .30 | PnR 롤러 |
| popper | screener체격 .30 + (45도+탑)/2 .70 | PnR 팝퍼 |
| postScorer | postPlay .50 + (closeShot+layup+dunk)/3 .30 + hands .20 | 포스트업 액터, PostUp 빈도 보정 |
| isoScorer | handling .40 + 득점 합성 .60 (인사이드 vs 아웃사이드 중 강점 .7 + 약점 .3) | Iso·PnR 핸들러 액터 |
| connector | passIq .30 + helpDefIq .20 + hustle .30 + hands .20 | 패서 선정 |
| perimLock | perDef .50 + agility .25 + stl .25 | (현재 소비처 적음) |
| rimProtector | blk .35 + intDef .35 + vertical .15 + 키 .15 | 림 프로텍터 선정 |

### 2-2. 선수 성향

- **시드 성향** (`generateSaveTendencies(tendencySeed, playerId)`): 리그(세이브)마다 다른 시드로 선수별 무작위 값이 고정된다. 같은 선수라도 리그마다 성격이 다르다(기획 의도).
  - 주요 값: playStyle N(0, 0.35), ballDominance N(1.0, 0.2) [0.5~1.5], shotDiscipline N(0.1, 0.35), clutchGene N(0, 0.4), composure, focusDrift U(0,1), defensiveMotor N(0, 0.4), foulProneness N(0, 0.3), temperament N(0, 0.35), ego N(0, 0.3) 등. 쓰이는 곳은 13절.
- **DB 존 성향** (`tendencies.zones`: ra/itp/mid/cnr/p45/atb, `lateral_bias`): 선수별 슛 위치 분포. `zonePref`(림·페인트·미드·3점 비중)와 `threeSubPref`(3점 안 세부)로 정규화된다. 없으면 능력치 기반 폴백.
  - ⚠️ 상당수가 공용 템플릿이고, 리그 전체로 림 비중이 현실보다 약 11%p 높다(16절).
- **사기**: `player.morale.score`(기본 50) → 슛 성공률 ±1.8%p.

### 2-3. 팀 전술

- **슬라이더 16개**(기본값): pace 5, ballMovement 5, offReb 5, insideOut 5, pnrFreq 5, shot_3pt 5, shot_mid 5, shot_rim 5, defIntensity 5, helpDef 5, switchFreq 5, defReb 5, zoneFreq 5, pnrDefense 1(0 drop / 1 hedge / 2 blitz), fullCourtPress 1, zoneUsage 5.
- **로테이션 표**: 선수별 48칸(분 단위) Boolean. 0분 체크가 선발이다.
- **뎁스차트**: 슬롯(PG~C)별 순서.
- **스토퍼**: `stopperId`(상대 에이스 전담 수비).
- **시간별 전술 세트**: main/alt(분 단위 스케줄)/clutch 세트.
- `playerTactics`(선수별 정책)는 2026-10-17부터 무시된다.
- **전술이 없을 때**: AI 팀 등은 `generateAutoTactics(team, coachPrefs)`가 로스터 아키타입과 감독 성향(7슬라이더 블렌딩)으로 만든다. 멀티 서버는 경기 직전 AI 감독 계획 또는 `repairAiTactics`를 적용한다.

### 2-4. 팀 초기화 (`initTeamState`)

1. 부상자가 있으면 `planSuccession`으로 로테이션 표를 먼저 승계한다.
2. 선발 = 0분 체크(부상자 제외) → 5명이 안 되면 뎁스 선발 → OVR 순 → 비상시 부상자.
3. 에이스 = 선발 중 최고 OVR. 타임아웃 7회. `assignCourtSlots`로 서로 다른 슬롯을 배정한다.

---

## 3. 경기 루프 (`stepPossession`)

```
[A] gameClock ≤ 0 이면 피리어드 전환
    quarter++ → 종료/연장 판정 → 시계(정규 720·연장 300) → 팀파울 0 → 타임아웃 슬롯 리셋 → 모멘텀 리셋
    하프타임: 핫콜드 리셋 + 체력 회복 5 / 쿼터 휴식: 핫콜드 반감 + 체력 회복 1.5
    연장: 선발 5명 재구성(43~47칸) + 점프볼
[B] 포세션
 1. 클러치 컨텍스트: Q4+ & 300초 이하 & 10점 이내 → isClutch, 120초·5점 → superClutch
    desperation = (1 − 남은초/300) × 0.6 + min(1, 점수차/10) × 0.4
 2. 시간별 전술 세트 적용(양 팀 슬라이더 교체)
 3. 결승 공격(마지막 연장 동점 24초 이내): 득점까지 최대 8회 재시도(minHitRate 1.0)
 4. result = simulatePossession(...)                       ← 4~6절
 5. 시간 차감(8절) → updateOnCourtStates(체력·부상·출전 시간)  ← 9절
 6. applyPossessionResult(기록·자유투·자유투 리바운드)        ← 7절
 7. 공격 리바운드 판정(자유투 공리바 포함, 교체 전에)
 8. 모멘텀 갱신, 리드 추적, 박스 타임라인 틱
 9. 교체: 임시 벤치 복귀 확인 → [라이브볼이면 보류] 가비지 판정 → 긴급 교체 → 로테이션 표 적용  ← 10절
10. 공격권: 공리바·테크니컬·플래그런트·보너스 전 비슈팅 파울은 유지(샷클락 14 / max(14, 잔여)),
    아니면 전환(샷클락 24) + 진입 정보 저장(lastEntryWasDefReb / Steal / OffReb, lastEntryPlayerId)
11. 피리어드 종료 해설, 로그 스코어 스탬프, 종료·연장 판정
12. 타임아웃 결정(AI·위임 팀) → 적용 시 보류된 교체 실행
```

- **라이브볼 교체 보류**: 야투 실패, 스틸, 마지막 자유투 실패 후 리바운드로 끝난 포세션은 다음 데드볼까지 교체를 미룬다. 부상·퇴장 선수가 코트에 있으면 즉시 처리한다.
- **진입 정보**: 다음 포세션의 속공 확률(4-1), 프레스 가능 여부(4-5), 그랩 앤 고(4-2)에 쓰인다.

---

## 4. 포세션 파이프라인 (`simulatePossession`)

**순서가 곧 확률 구조다.** 앞 단계에서 포세션이 끝나면(파울·턴오버 등) 뒤 단계는 굴리지 않는다. 그래서 앞 단계의 확률이 오르면 뒤 단계 사건의 실제 빈도가 줄어든다.

### 4-1. 플레이 선택

1. **풋백**: 직전 진입이 공격 리바운드이고 샷클락이 14면, `0.15 + offReb슬라이더 × 0.02` 확률로 Putback.
2. **하프코트 가중치** (`computePlayTypeWeights`):
   `weight = max(0.5, base + inside × (5 − insideOut)/5 + pnr × (pnrFreq − 5)/5 + bm × (ballMovement − 5)/5)`

   | 플레이 | base | inside | pnr | bm |
   |---|---|---|---|---|
   | Iso | 1.1 | 0 | 0 | −2.0 |
   | PostUp | 1.8 | +2.5 | 0 | −1.0 |
   | PnR_Handler | 2.0 | 0 | +3.0 | 0 |
   | PnR_Roll | 1.3 | +1.5 | +2.0 | 0 |
   | PnR_Pop | 0.8 | −1.5 | +2.0 | 0 |
   | CatchShoot | 1.0 | −2.0 | 0 | +2.0 |
   | OffBallScreen | 0.8 | −1.0 | 0 | +1.5 |
   | DriveKick | 0.8 | −1.0 | 0 | +2.0 |
   | Cut | 0.7 | +1.5 | 0 | +1.5 |
   | Handoff | 0.5 | 0 | 0 | +1.0 |

3. **로스터 보정**:
   - **스타 그래비티**: 코트 위 최고 스코어링 그래비티 g → boost = clamp((g − 63) × 0.015, 0, 0.30). Iso·PnR_Handler ×(1 + boost), Roll·Pop ×(1 − boost × 0.5).
   - **포스트 위협**: PostUp ×clamp(0.5 + (최고 postScorer − 40)/60, 0.5, 1.5).
   - **플레이메이킹 그래비티**: 최고 handler h → b = clamp((h − 70) × 0.02, 0, 0.30). Roll·CatchShoot·Handoff ×(1 + b), Cut·OBS ×(1 + 0.7b).
   - **클러치**: 뒤지는 팀(3점차 이상)은 CatchShoot·Pop↑, PostUp·Cut↓. 앞선 팀은 Iso·PostUp↑, CatchShoot↓, 속공 금지.
4. **속공 롤**:
   `P = (pace × 0.03 × 진입배율 + 수비리바 빈도 보너스 + 스틸 보너스 0.45) × 아웃렛배율`
   - **진입배율**: 스틸 ×2.0, 수비 리바운드 ×2.0, 데드볼 ×0.35, 공격 리바운드 0
   - **수비리바 빈도 보너스**: defReb 슬라이더가 5 미만이면 단계당 +0.0375
   - **아웃렛배율**: 진입 선수(리바운더·스틸러)가 그랩 앤 고면 1.1, 아웃렛이면 그 선수 패스 능력에 따라 0.8~1.2
5. 속공이 아니면 가중 룰렛으로 하프코트 플레이를 정한다.

> **스코어링 그래비티** (`calculateScoringGravity`): 인사이드 존(closeShot·layup·dunk·postPlay 평균)과 아웃사이드 존(미드와 3점 평균)의 강점 0.7 + 약점 0.3 + ft 0.1 + 강점 초과분(80 이상) + insideOut 기울기 항, 마지막에 OVR 게이트(clamp((OVR − 65)/30, 0.5, 1.15))를 곱한다. 옵션 순위(1~5)는 이 값의 코트 내 순위다.

### 4-2. 액터 선정 (`resolvePlayAction`)

**공통 선정 함수** `pickWeightedActor(criteria, 제외, 역할, 필터)`:
- **슈터 역할**: `가중치 = max(1, criteria) × 로컬순위배율[플레이][criteria 기준 순위] × 스타배율[팀 그래비티 순위] × ballDominance′ × (1 + playStyle × 0.25)`
  - 로컬순위배율(1~5위): Iso·PnR_Handler [2.5, 1.8, 1.2, 0.7, 0.4], PostUp [3.0, 1.5, 0.8, 0.4, 0.2], Handoff·OBS [2.0, 1.6, 1.2, 0.8, 0.5], Pop [1.6, 1.4, 1.2, 0.9, 0.6], Roll [1.3~0.9], CatchShoot·DriveKick [1.5, 1.3, 1.2, 1.0, 0.8], Cut [1.4~0.8], Transition·Putback 1.0
  - 스타배율: [1.25, 1.10, 1.0, 0.9, 0.8]
  - ballDominance′: 시드 값이고, 코트 위 1옵션이 2옵션과 그래비티 25 이상 앞서면 하한 0.9
- **패서 역할**: `(2 − ballDominance) × (1 − playStyle × 0.25)`. `pickPasser`는 여기에 `(passVision × passIq / 2500)^1.5`를 곱해 좋은 패서에게 집중시킨다.

| 플레이 | 액터(슈터) 기준 | 패서·보조 | 존 후보 | 기본 보너스 |
|---|---|---|---|---|
| Iso | isoScorer + handler × 0.5 | connector + handler × 0.3 | 3점·미드·페인트·림 | 0 |
| PnR_Handler | isoScorer + handler × 0.5 | 스크리너 = screener + roller × 0.5 (체격 55 이상) | 4존 | +0.01 |
| PnR_Roll | (roller + screener × 0.5) × 포지션(C .5 / PF .3 / SF .15) | 핸들러 = handler(패서) | 림·페인트·미드 | +0.03 |
| PnR_Pop | popper × 포지션 × min(1, 3점성향/0.15) | handler | 3점·미드 | +0.01 |
| PostUp | postScorer × 0.6 + 체격 × 0.4 | 엔트리 = handler + connector × 0.5 | 림·페인트·미드(post) | +0.01 |
| CatchShoot | spacer × min(1, 3점성향/0.15) | handler + connector | 3점 고정 | +0.02 |
| Cut | driver + offBallMovement × 0.5 | connector | 림·페인트·미드 | +0.03 |
| Handoff | spacer + driver × 0.5 | 빅 = 패스 허브(passIq·hands, 패서 집중) | 4존 | +0.02 |
| OffBallScreen | spacer + offBallMovement × 0.3 + speed × 0.1 | 스크리너 screener, 패서 handler + connector × 0.5 | 4존 | +0.02 + 스크린 질(최대 +0.02) |
| DriveKick | 슈터 spacer + out × 0.3 / 드라이버(패서) driver + handler × 0.3 | keepChance = 침투/(침투+킥패스) → 드라이버 직접 마무리 | 드라이버 림·페인트 / 슈터 4존 | +0.02 + 드라이브 질 |
| Transition | 운반자(그랩 앤 고 or 아웃렛 받은 spdBall + handler) / 러너 / 트레일러 | 아래 | 3점(×0.04)·페인트·림 | +0.04 |
| Putback | offReb .4 + vertical .3 + hustle .2 + 마무리 .1 | – | 림·페인트 | +0.05 |

**선택 시점 킥아웃** (수비 상태를 보지 않는 판정):
- PostUp과 PnR_Roll만 남아 있다. 확률은 `패스 커브(최대 0.40·0.20) × 마인드 × 0.5`이고, 받는 선수는 spacer 가중 동료입니다.
- Iso의 선택 시점 킥아웃은 폐지됐다(10-28).

**속공 상세** (10-28):
- **그랩 앤 고**: 진입 선수의 `(handling + spdBall)/2 ≥ 80`이거나 코트 최고와 5 이내면 본인이 운반한다. 본인이 마무리하면 어시스트가 없다.
- **아웃렛**: 운반자 = spdBall + handler(진입 선수 제외), 아웃렛 패서 = 진입 선수.
- **3점**(가중치 ×0.04 → 속공 슛의 약 8%): 트레일러 캐치앤슛 확률은 `(0.35 + 0.45 × 패스) × 마인드`(최대 0.9), 나머지는 운반자 풀업.
- **림·페인트**: 러너 점수는 `(speed .4 + vertical .3 + driver .3) × 0.75 + 체격 × 0.25`이고, 수비 리바운드 진입이면 리바운드 경합 정도만큼 감점한다(최대 −30% × defReb/5).
  - 러너 패스 확률 = clamp(0.45 × (0.6 + 0.8 × 운반자 패스) × 마인드 × clamp((러너 마무리 ÷ 운반자 마무리)², 0.5, 2), 0.05, 0.85)
  - 마무리 점수 = max(layup, dunk) .5 + vertical .2 + speed .3

**존 선택** (`selectZone`):
- `점수 = 존성향(0.15 미만이면 ×0.2) × (1 + (슬라이더 − 5)/5 × 0.5) × 플레이별 배율`
- 슬라이더 대응: 3점 = shot_3pt, 미드 = shot_mid, 림·페인트 = shot_rim
- **돌파 능력은 존 선택에 관여하지 않는다**(존 성향 상관 0.88, 돌파 0.08).

**슛 종류** (`resolveFinish`):
- **림**: 덩크는 `reach(vertical + 키 200 초과 cm당 1) ≥ 70`일 때 가중 (dunk − 60) × 1.5, 레이업은 항상 (layup − 60) × 1.0
- **페인트**: 플로터(closeShot ≥ 80) × 0.7, 훅(closeShot ≥ 80, 키 배율) × 1.6 × postPlay, 페인트 점퍼(closeShot ≥ 75) × 0.6 × shot_mid/5
- 미드·3점은 풀업, 점퍼, 페이더웨이, 캐치앤슛

### 4-3. 수비수 결정 (`identifyDefender`)

1. **지역방어 여부**: 매 포세션 `zoneFreq × 0.08` 확률로 지역방어다.
   - 림·페인트 슛이면 코트의 C·PF·SF 중 intDef² 가중(SF ×0.5)으로 앵커가 수비하고, PnR은 drop으로 고정된다.
2. **스토퍼**: 에이스가 액터이고 스토퍼가 지정돼 있으면 스토퍼가 수비한다.
3. **기본**: 같은 슬롯(position)의 수비수, 없으면 무작위.
4. **PostUp 크로스매치**: C 대 C면 `0.15 + (helpDef − 1) × 0.022` 확률로 PF가 수비한다.
5. **스크린 플레이 스위치**: `switchFreq × 0.05`(롤은 최소 0.15) 확률로 스크리너의 수비수가 수비하고, 그중 10%는 스위치 실수(와이드 오픈)다.
6. **PnR 커버리지**(스위치가 아니면): `pnrDefense`에 따라 [drop, hedge, blitz] 분포
   - 0: [.80, .15, .05], 1: [.15, .70, .15], 2: [.10, .25, .65]

### 4-4. 풀코트 프레스 (`resolveFullCourtPress`) — 포세션 시작 1회

- **발동 조건**: 상대가 직전 공격 리바운드나 스틸로 공을 잡은 포세션이 아닐 것. 프레스 강도 `f = (fullCourtPress − 1)/9 × 지역방어 감쇠(zoneFreq)`.
- **운반자**: 공격팀 핸들링 점수 1위. **1차 수비**: 스토퍼(에이스가 운반할 때) 또는 같은 슬롯.
- **트랩**(5단계 이상, 확률 5~22% × 감쇠 × 9·10단계 배율): 실책(스틸) / 파울 / 탈출(슛 +8%p, 슈팅파울 +3%p).
- **1대1**: 뚫림(슛 +4%p, 시간 −4초) / 압박 실책 / 리치인 파울 / 버팀(시간 +f × 3초).
- 체력 85 미만 프레스 수비수는 수비 점수가 떨어지고 파울이 늘어난다. 프레스 팀은 체력 소모가 커진다(9절).

### 4-5. 블리츠 트랩 (PnR_Handler + blitz)

- 핸들러(handling .5 + passVision .25 + passIq .25) 대 트랩 2명(perDef .4 + stl .3 + agility .3) 격차로 ESCAPE 커브를 굴린다(격차 0 → 80%).
- **실패**: 60%는 스틸(속공으로 연결), 나머지는 실책.
- **탈출**: 스크리너 4대3(22%) 또는 위크사이드 오픈 슈터(+5%p)로 패스아웃하고, 로테이션 수비수가 붙는다.

### 4-6. 포세션 시간 미리 뽑기 + 샷클락 막판 페널티

- `calculatePossessionTime`(8절)로 시간을 먼저 정한다. 남은 샷클락이 4초 미만이면 PENALTY 커브(1초 −6%p ~ 3초 −2.5%p)를 적용하고, 클러치 능력으로 최대 40%까지 줄인다.

### 4-7. 헬프 수비 · 킥아웃 · 림 프로텍터

1. **헬프 시도**: `0.10 + (helpDef − 1) × 0.0778`(10단계 = 80%) 확률. 킥아웃으로 받은 슛에는 헬프가 없다.
   - 헬퍼 = 존별 포지션 풀(3점: PG·SG·SF, 미드: C 제외)에서 helpDefIq 가중으로 뽑고, `switchFreq × 0.05` 확률로 전원 풀을 쓴다.
   - 성공 = iq게이트((helpDefIq − 60)/40) × 신체게이트(((agility+speed)/2 − 55)/40) 확률.
2. **헬프 킥아웃**(10-28): 헬프 **성공** 시, 존이 림·페인트·미드거나 3점 풀업이면 판정한다.
   - 확률 = 0.5 × 패스정규화((vision+acc)/2: 40~99) × 마인드(clamp(1 − playStyle × 0.6, 0.4, 1.6))
   - 받는 선수 = 헬퍼와 같은 슬롯의 동료(없으면 무작위), 클로즈아웃 수비 = 헬퍼
   - 받은 존이 림·페인트면 클로즈아웃 돌파(+2.5%p), 3점·미드면 캐치앤슛·점퍼(+5%p)
3. **헬프 성공 & 킥아웃 아님**: 슛 성공률 −3.3%p.
4. **림 프로텍터 개입**(림·페인트):
   - 1차 수비수를 뺀 4명 중 `max(0, rimProtector − 50)` 가중으로 1명을 고른다.
   - 개입 확률 = 0.65 + (helpDefIq − 75) × 0.006 + [지역방어 하프코트 zoneUsage 보너스 / 맨투맨 PnR drop +0.15·blitz −0.10 / 비PnR 하프코트는 커버리지 분포 경향], 범위 0.2~0.9, 파울 트러블 배율 적용
   - 개입하면 슈팅 파울에 프로텍터 몫이 붙고, 1차 블락이 실패하면 개입 블락을 굴린다.

### 4-8. 파울 계열 (이 순서로 굴린다)

1. **슈팅 파울** → 자유투(type `freethrow`)
   ```
   rate = 존 기본(림 .10 / 페인트 .08 / 미드 .045 / 3점 .025)
        + DRAW_FOUL_CURVE(drFoul) × 존스케일(림·페인트 .5 / 미드 .3 / 3점 .2)
        + 수비 스킬 커브(내부: intDef .65 + defConsist .35, 외곽: perDef) × 존스케일
        + (defIntensity − 5.5) × 0.0067 + 프레스 트랩 탈출 보너스
        + 헬프 시도 골밑 +0.006 (프로텍터 개입 시 생략) + foulProneness × 0.02
   rate = ((rate − 헬프분) × 수비수 파울트러블 + 헬프분 × 헬퍼 파울트러블) × 매치업배수(미드·3점만 0.5~1.5)
        + 프로텍터 몫(FOUL_CURVE(intDef/defConsist) × 페인트 .75 + foulProneness × .01, × 파울트러블)
   clamp 0.01~0.40
   ```
   - DRAW_FOUL_CURVE: 40 → −.06, 70 → 0, 85 → +.035, 90 → +.06, 95 → +.15, 99 → +.19. **90 이후 급경사**라 drFoul 정규화(×2.5 차감)가 엘리트 파울 유도자에게 크게 작용한다.
   - 파울트러블 배율(PROB_MOD): 3파울 0.85, 4파울 0.60, 5파울 0.30. 수비수가 4·5파울이면 공격 슛 성공률 +1.5·+4%p.
2. **비슈팅 파울**: `0.05 + (defIntensity − 5.5) × 0.0044 + 플레이별(Iso +.012, PnR_H·DK +.008, Roll·Cut +.006, PostUp +.003, CS −.01)`, × 파울트러블 × 매치업, 최대 0.12.
   - 보너스 전(팀파울 4개 이하)이면 공격권 유지 + 시간 25~75%. 5번째 파울부터는 자유투 2개(연장 4번째부터).
3. **공격자 파울**:
   - **차징**: 기본 1%(PostUp 2.5%) + (수비 defConsist − 70) × 0.0003, 범위 0.5~4%
   - **일리걸 스크린**: PnR 0.8%, OBS 2.5%(실제 스크리너에게 귀속)
4. **테크니컬** 0.3%(양 팀 temperament² 가중, 지는 팀 최대 1.5배) → **플래그런트** 0.04~0.15%(foulProneness .7 + temperament .3) → **싸움** 0.003%(temperament ≥ 0.5, 출장정지)

### 4-9. 샷클락 바이올레이션 · 턴오버

- **바이올레이션**: `0.0024 + max(0, 5 − pace) × 0.0004 + ballMovement × 0.00032 + 프레스(버텨진 경우)`. 게임클락이 샷클락보다 적으면 불가.
- **턴오버·스틸** (`calculateTurnoverChance`, 이 순서):
  1. **온볼 스틸**: ONBALL 커브(수비 stl: 70 → .052, 99 → .095) − (handling 또는 hands − 70) × 0.001 + 블리츠 .02, 최소 0.005
  2. **패싱레인 스틸**(패스 플레이): 다른 수비 4명 각각 LANE 커브(stl .7 + passPerc .3) − (패서 passAcc − 70) × 0.0005
  3. **헬프 스틸**(헬프 성공): 헬퍼 LANE 커브
  4. **비강제 실책**: 0.035 + 볼무브((bm − 5) × 0.004 × 팀 시야 보정) + 볼스킬(드리블 플레이 handling, 컨택 플레이 hands × 1.5, 그 외 hands × 0.5, 70 기준 0.001/점) + 패서 passIq + 맥락(속공 .03 + passAcc, Iso .01, PostUp .02, 블리츠 .04, 헤지 .015) − composure × 0.01 + (speed − spdBall) × 0.001, 범위 0.015~0.18
  - **드리블 플레이**: Iso·Cut·Transition·PnR_Handler(속공 러너·트레일러 제외). **패스 플레이**: CS·Handoff·PnR 3종·Cut·OBS·DriveKick(+속공 러너·트레일러). PnR 핸들러 본인 슛은 패스가 아니다.

### 4-10. 랍 (PnR_Roll 또는 속공 러너, 림 덩크·레이업)

- **시도**: `0.15 + (vertical − 70) × .003 + (패서 vision − 70) × .002`, blitz +.10, drop −.08, 범위 0.05~0.45
- **성공**: `0.5 + (패서 passAcc − 70) × .008 + (hands − 70) × .004 + (vertical − 70) × .003`, 범위 0.15~0.90 → 성공률 +8%p
- **실패**: 턴오버

### 4-11. 슛 성공률 보정항 합산 (`bonusHitRate`)

`calculateHitRate`에 넘기기 전에 아래를 모두 더한다.

| 항목 | 값 |
|---|---|
| 플레이 기본 보너스 | 4-2 표 |
| 지역방어 | 내부 (5 − zoneUsage) × .003, 3점 오픈 (zoneUsage − 1) × .0011, Iso·PostUp·OBS −, Cut·CS·DK +, 맨투맨 OBS (10 − switchFreq) × .0017 |
| 모멘텀 | 런 팀 +1.5/2.5/3.5%p (에포크 8·12·16점) |
| 수비수 파울 트러블 | +1.5%p(4파울), +4%p(5파울) |
| shotDiscipline | × 0.015 |
| ego | × ((3 − 옵션순위)/2) × 0.015 |
| 패서 품질 | 시야 (vision − 70) × .001, CS·Handoff·OBS·DK 오픈 감지 (vision − 70) × .0015, 정확도 (passAcc − 70) × .0008 |
| 랍 | +.08 |
| 사기 | (morale − 50)/50 × .018 |
| 헬프 성공 | −.033 |
| 속공 | 수비리바 진입 +.03 / 데드볼 −.04 / 스틸 림·페인트 +.07 / 스피드 ((speed+spdBall)/2 − 80) × .0025 (±.04) / defReb 트레이드오프 |
| 프레스 | 뚫림 +.04, 트랩 탈출 +.08 (9·10단계 배율) |
| 샷클락 막판 | −(최대 .06) |
| 스크린 | clean +.05, partial +.02 (지역방어 ×.5) |

---

## 5. 슛 성공률 계산 (`calculateHitRate`)

```
1. 기본: 림·페인트 .57 / 미드 .40 / 3점 .34   [사용자 잠금 — 수정 금지]
   + bonusHitRate
2. 존 능력치(offRating):
   3점 = 서브존별(코너 threeCorner / 45도 three45 / 탑 threeTop)
   미드 = midRange (페이더웨이: postPlay .3 + mid .5 + closeShot .2)
   림 = 덩크 dunk / 레이업 layup
   페인트 = 플로터 closeShot / 점퍼 closeShot .6 + mid .4 / 훅 postPlay .45 + closeShot .3 + hands .25
3. 스위치 실수 → min(.82, 기본 + 보너스 + .20 + (rating − 70) × .001) 즉시 반환
4. 체력: 공격 + (체력/100 − .30) × .10  (100 → +7%p, 85 → +5.5%p, 30 → 0)
         체력 30 미만 focusDrift 추가 감점
         수비 − (수비 체력/100 − .30) × .05  (100 → −3.5%p)
5. 수비 rating = (3점: perDef / 그 외: intDef) + defensiveMotor × 10 + (defConsist − 70) × 0.3
   집중력 저하: (70 − defConsist) × .003 확률로 ×0.7
6. 공격 커브 − 수비 항:
   3점:  + THREE_OFF_CURVE(rating) − 수비rating × 컨테스트 × .001  (+ 코너 .015)
   그 외: + 슛종류 커브(rating) − 수비rating × 컨테스트 × (덩크 .002 / 미드 .0012 / 내부 .0015)
   림·페인트 체격 보너스(키 200 기준; 덩크는 근력+키)
   컨테스트 배율: Dunk .85 · Layup 1.0 · Floater .6 · Hook .5 · Pullup .8 · Jumper .85 · Fadeaway .4 · CS 1.0
7. 노이즈: shotIq 대칭 ±|shotIq − 70| × .0008, offConsist 70 미만 대칭 ±(70 − oc) × .001
8. 수비 강도: −(defIntensity − 5.5) × .006 × 매치업커브(수비 rating − 공격 rating)
9. 돌파 드리블(림·페인트 & Iso·Cut·Transition·PnR_Handler): + (spdBall − 70) × .001
10. PnR 커버리지:
    drop  — 핸들러 미드 +.04 · 3점 +.01, 롤 −.04, 팝 +.015 (빅 intDef로 스케일)
    hedge — 핸들러 −.02, 롤 +.03 (+느린 빅 +.02)
    blitz — 핸들러 −.08, 롤 +.07, 팝 +.06
11. 미스매치: 격차(림·페인트: strength 차 / 외곽: (speed+agility)/2 차) ÷ 60 → clamp ±1 → × .12 (±12%p)
    |정규화| ≥ .3이면 미스매치 표시, 미스매치 없는 스위치 −.03
12. 에이스 스토퍼: × (1 + impact/100)
13. 홈: + homeAdvantage(기본 .005)
14. 클러치: ((intangibles .5 + offConsist .3 + shotIq .2)/100 − .70) × .10 + clutchGene × .03
    (superClutch ×1.5), 프레셔 −.015
15. clamp .05~.95, 결승 공격은 minHitRate 하한
```

- **주요 커브**(능력치 → 성공률 가산):

| 능력치 | 3점 | 레이업 | 덩크 | 미드 | 페인트 점퍼 | 플로터 | 훅 |
|---|---|---|---|---|---|---|---|
| 70 | −.055 | +.005 | +.202 | −.013 | −.13 | −.207 | −.217 |
| 85 | +.024 | +.045 | (80: +.232) | +.017 | −.10 | −.147 | −.127 |
| 95 | +.060 | +.125 | (90: +.256) | +.077 | −.04 | −.107 | −.087 |
| 99 | +.072 | +.185 | +.280 | +.127 | +.01 | −.087 | −.077 |

- **삭제된 항목**: 페이스 슛 감점(10-25, 대가를 체력으로 일원화), 핫/콜드 슛 반영(08-01, 연출 전용).

---

## 6. 블락 · 성공 판정 · 앤드원 · 리바운드

1. **1차 블락**:
   - 기본(림 .08 / 페인트 .045 / 미드 .025 / 3점 .007) + BLK 커브(70 → 0, 85 → +.038, 99 → +.105) + (키 − 200) × .0006 + (vertical − 70) × .0006
   - 슈터 저항: −(shotIq − 70) × .001 − (키 − 190) × .0005, × 슛 종류 배율(Dunk .85 · Layup 1.0 · Floater .35 · Hook .55 · Pullup .7 · Jumper .6 · Fadeaway .25 · CS 1.0), 덩크는 근력·점프 저항 추가
2. **림 프로텍터 개입 블락**(1차 실패 + 개입 시): BLK 커브(70 → .08, 85 → .17, 99 → .31) + 키·점프, 페인트 ×.75, 같은 슈터 저항
3. **성공**: 블락이 아니면 `rand < rate`
4. **앤드원**: (림·페인트 .03 / 그 외 .012 + DRAW_FOUL_CURVE × .15) × 배율(Dunk 1.5 · Layup 1.0 · Floater .3 · Hook .5 · Pullup .15 · Jumper .10 · CS .08). 추가 자유투 1개.
5. **리바운드**(실패 시) `resolveRebound`:
   - **공격 리바운드 확률** = clamp(.23 + (공격팀 Σ(offReb .8 + hustle .1 + vertical .1) / 수비팀 Σ(defReb .65 + boxOut .2 + vertical .05 + strength .1) − 1) × .08 + (offReb 슬라이더 − 5) × .012 − (defReb 슬라이더 − 5) × (5 초과 .006 / 이하 .012), .12, .38)
   - **리바운더**: 팀 5명 중 `점수^2 × (슈터 ×.3) × (0.7 + motor × .1 + 키커브 × .1 + 포지션(C 1.5 / PF 1.2) × .1)` 가중
   - 팀 리바운드는 없다(빗나간 슛은 거의 100% 개인 리바운드).

---

## 7. 결과 기록 (`statsMappers.applyPossessionResult`)

- **성공**: FGA·FGM·3점, 존 기록, 수비수 컨테스트 기록, 핫/콜드(연출), 어시스트(확률), 앤드원 자유투.
  - **어시스트 확률**:

    | 경우 | 확률 |
    |---|---|
    | 킥아웃 | .90 |
    | PnR 핸들러 본인 슛 | 0 |
    | 속공 그랩 앤 고 본인 | 0 |
    | 속공 러너 | .95 |
    | 속공 트레일러 | .97 |
    | CatchShoot, DriveKick | .97 |
    | Cut, OBS, Pop | .95 |
    | Roll | .90 |
    | Handoff, Transition | .78 |
    | PostUp | .55 |
    | Iso | .38 |
    | Putback | .10 |
    | 기타 | .60 |

- **실패**: FGA, 리바운드, 블락(수비수).
- **자유투**: 확률 = `attr.ft / 100`(정규화 비대상이라 원값). 슈팅 파울은 3점이면 3개, 아니면 2개. 팀파울 보너스는 2개. 마지막 실패 시 리바운드(공격 리바운드면 공격 유지).
- **파울**: 6개 파울 아웃 → 퇴장 사유 기록. 공격자 파울은 actor의 PF와 턴오버.
- **부가 기록**: 플레이타입 PPP(`playTypeStats`), 샷 이벤트(샷차트), +/-, 박스 델타 타임라인(라이브 중계용), 로그 스코어 스탬프.

---

## 8. 시간 (포세션 시간 · 샷클락)

```
Putback: 2~4초
그 외: 19 − (5 + (pace − 5) × 0.2)          → pace 1 = 14.8 / 5 = 14 / 10 = 13초
  + 플레이: 속공 −5, PostUp·Iso +2, CS·Cut −1
  + 쿼터 30~45초 남음 → ≤ 6초 (2-for-1)
  하한 8초(속공 4), 상한 min(23, 샷클락), 노이즈 ±1.5
  Q4 5분 이하 & 10점 이내 리드 팀 → ≥ 18초 (시간 끌기)
  최소 3초, 남은 시계 이하, 반올림
프레스: 버팀 +f × 3초, 뚫림 −4초 / 프레스 단계에서 끝나면 3~6초
보너스 전 비슈팅 파울: 25~75%만 소모, 공격권 유지, 샷클락 max(14, 잔여)
샷클락 바이올레이션: 남은 샷클락 전부 / 테크니컬: 0초
```

- 결과: 중립 전술이면 팀당 경기 약 100~102 포세션(BASE 19, 10-27 확정).

---

## 9. 체력 · 부상 · 회복

### 9-1. 소모 (매 포세션, 코트 위 선수)

```
drain = t/60 × 1.5
      × (1 − (stamina − 50)/100 × 0.30)
      × B2B(fatigueB2BMultiplier, 기본 1.5)
      × 스토퍼 1.3
      × 프레스(1 + 단계배율 × 0.5; 프레스 팀 빅맨은 절반 단계)
      × (1 − DEF_INTENSITY_CURVE(1 → 5, 10 → −8)/100)   → 강도 10이면 +8%
      × (1 + PACE_FATIGUE_CURVE(1 → −8, 5 → 0, 10 → +30)/100)
      × defReb < 5 페널티(단계당 +0.375%)
      × 누적 피로(1 + (100 − 체력) × 0.012)
      × fatigueDrainMultiplier(리그 설정, NBA Active 1.5)
```

### 9-2. 회복

- **벤치**: `t/60 × 3.0 × (1 + (stamina − 50)/100 × 0.30 + (durability − 50)/100 × 0.20)`
- **휴식 시점**: 타임아웃 0.5, 쿼터 휴식 1.5, 하프타임 5(같은 배율)
- **경기 사이**: 휴식일 40(싱글 `applyRestDayRecovery`). 멀티는 `fatigueRecovery.recoverThrough`(밤사이 유지율, 휴식일 유지율, B2B)를 쓴다.

### 9-3. 체력이 영향을 주는 곳

1. 슛 성공률(공격 +7%p ~ 0, 수비 −3.5%p ~ +1.5%p)
2. 탈진 교체(10절)
3. 프레스 수비 점수·파울
4. 부상 확률
5. 아키타입은 **시작 체력만** 반영(경기 중 갱신 없음)

### 9-4. 부상

- 매 포세션 선수별 `(내구도 기반 기본 확률 + 체력 35 미만·10 미만 보너스) × injuryFrequency / 10000`
- 내구도 55 이상: max(0.12, 0.6 − dur × 0.005). 55 미만: 0.325 + (55 − dur)² × 0.04.
- 등급은 내구도와 `majorInjuryFrequency`로 정해진다. 기간은 `returnDate`, 이번 경기 부상은 `rosterUpdates`로 저장된다.

---

## 10. 교체 · 로테이션 · 가비지 · 타임아웃 · 모멘텀 · 클러치 · 연장

### 10-1. 교체 순서 (데드볼에서만)

1. **임시 벤치 복귀** (`checkTemporaryReturns`)
2. **가비지 타임** (`updateGarbageTime`):
   - 4쿼터 임계 점수차 = max(최소, 3 + K × 남은초^0.6), 연장 150초 미만은 최소값
   - 발동 시 로테이션 표를 "선발·현재 코트 제외, 같은 포지션 OVR 낮은 순" 유닛으로 덮어쓰고, 차이가 임계 − 5 아래로 내려가면 복원한다.
3. **긴급 교체** (`checkSubstitutionsV2`):
   - **부상**(이번 경기) → 영구
   - **퇴장**(6파울·테크니컬·플래그런트·싸움) → 영구
   - **탈진**: 체력 ≤ max(20, 휴식 임계) × 벤치계수(쓸 수 있는 벤치 3+ 1.0 / 2명 .75 / 1명 .5 / 0명 0) & 대체자 체력이 15 이상 높을 때 → 임시
   - **파울 트러블**(파울이 늘 때만): 1·2쿼터 4파울 → 24분 복귀, 3쿼터 5파울 → 36분, 3쿼터 4파울 → +6분, 4쿼터 5파울(42분 전) → +3분 → 임시
4. **실행**:
   - **영구**: `forceSubstitution` → `applyRotationSuccession`(= `planSuccession` 연쇄 승계)
   - **임시**: `benchWithOverride`(복귀 시 표 복원)
5. **로테이션 표 적용** (`checkAndApplyRotation`):
   - 현재 분 체크된 건강한 선수 → 5명 미만이면 폴백(체력 + 코트 보너스 정렬, 방금 내려온 선수·임시 벤치 제외, 슬롯 적합, 최소 출전 보호) → 5명 초과면 `pickBestFive`(슬롯 적합)
   - 바뀌면 교체 + `assignCourtSlots`
- **슬롯**: 모든 교체 경로는 `assignCourtSlots`로 슬롯을 다시 배정한다. 수비 매칭은 슬롯 기준이다(4-3).

### 10-2. 타임아웃 (`decideTimeout`, AI·위임 팀만)

- **보유**: 팀당 7회, 4쿼터 진입 시 상한 4, 의무 타임아웃 슬롯 2개(아무도 안 부르면 홈 → 원정 차감).
- **우선순위**: 전략(4쿼터) → 잉여 소진 → 런 피해팀(상대 8점 이상 런, 예비분 유지) → 4쿼터 막판 소진. 연장은 2회.
- **효과**: 모멘텀 리셋(런 보너스 소멸), 핫/콜드 반감(성공률 영향 없음), 전원 체력 +0.5 × 배율, 보류된 교체 실행.

### 10-3. 모멘텀

- 에포크 득점차가 8 이상이면 그 팀이 런 상태다. 런 팀 슛 +1.5/2.5/3.5%p.
- 역전·동점이면 리셋되고, 쿼터 시작·타임아웃에서 리셋된다.

### 10-4. 클러치

- **판정**: 4쿼터 이상, 5분 이하, 10점 이내. superClutch는 2분·5점.
- **작용**: 플레이 선택(4-1), 시간별 클러치 전술 세트, 슛 성공률(5절 14번).

### 10-5. 연장 · 점프볼 · 결승 공격

- **연장**: 리그 스위치가 켜져 있으면 최대 2회 + 결승 공격(마지막 연장 동점 24초 이내에 득점할 때까지 재시도).
- **점프볼**: 경기 시작마다 항상(10-27). 센터 키·점프력으로 결정한다.

---

## 11. 영향 지도: 슬라이더

| 슬라이더 | 작용하는 곳 |
|---|---|
| pace | 속공 확률(pace × 0.03 × 진입배율), 포세션 시간(±0.2초/단계), 체력 소모(1 → −8%, 10 → +30%), 샷클락 바이올레이션(5 미만), AI 전술 offReb 연동 |
| ballMovement | 플레이 가중치(Iso −2, CS·DK +2, OBS·Cut +1.5, Handoff +1, PostUp −1), 비강제 실책(5 초과 +0.4%p/단계), 샷클락 바이올레이션 |
| offReb | 풋백 확률(+2%p/단계), 공격 리바운드 확률(±1.2%p/단계), 상대 속공 성공률(7 이상이면 상대 속공 +) |
| insideOut | 플레이 가중치(PostUp·Roll·Cut ↔ CS·Pop·OBS·DK), 그래비티 기울기 항 |
| pnrFreq | PnR 3종 가중치(+3/+2/+2) |
| shot_3pt / shot_mid / shot_rim | 존 선택 배율(±50% at 1·10), shot_mid는 페인트 점퍼·미드 풀업 가중에도 |
| defIntensity | 수비 강도 성공률(−0.6%p/단계 × 매치업), 슈팅파울(+0.67%p/단계), 비슈팅파울(+0.44%p/단계), 체력(10 → +8%) |
| helpDef | 헬프 시도(10% → 80%), PostUp 크로스매치(15 → 35%), 헬프 킥아웃 빈도(상대에게 기회) |
| switchFreq | 스크린 스위치(5%/단계), 헬프 전원 풀 확률, 맨투맨 OBS 보정 |
| defReb | 공격 리바운드 억제, 5 미만이면 속공 빈도 + 체력 페널티, 5 초과면 우리 속공 성공률 −, 러너 리바운드 경합 감점 |
| zoneFreq | 지역방어 확률(8%/단계), 프레스 감쇠 |
| zoneUsage | 지역방어 품질(내부 억제, 3점 오픈, 플레이별 보정), 림 프로텍터 개입 |
| pnrDefense | 커버리지 분포(drop/hedge/blitz) → 성공률·실책·블리츠 트랩·림 프로텍터 개입 |
| fullCourtPress | 프레스 단계(트랩·1대1), 체력 소모, 샷클락 바이올레이션 |

> 전술 책임 원칙: 플레이 빈도는 유저 전술이 결정하고, 엔진은 로스터 반영을 "누가·어떻게 마무리하는가"(실행 층)에서만 한다. 플레이 빈도 자동 보정 금지(`feedback_tactics_responsibility`).

---

## 12. 영향 지도: 능력치

| 능력치 | 작용하는 곳 |
|---|---|
| 3점 3종 | 3점 성공률 커브(서브존별), spacer·popper·isoScorer·그래비티, 팝퍼 자격 |
| midRange | 미드 성공률, 페인트 점퍼·페이더웨이, isoScorer, 그래비티, 돌파 실패(미적용 안) |
| layup / dunk | 림 성공률, 슛 종류 선택 가중, 속공 마무리 점수 |
| closeShot | 플로터·페인트 점퍼·훅, 플로터·훅 자격(80) |
| postPlay | 훅·페이더웨이, postScorer |
| drawFoul | 슈팅파울(커브 급경사), 앤드원 (정규화 ×2.5 차감) |
| ft | 자유투 성공률 = ft/100 |
| shotIq | 성공률 노이즈 진폭, 블락 저항, 클러치, spacer |
| offConsist | 70 미만 노이즈, 클러치, spacer |
| handling | isoScorer·handler, 온볼 스틸 저항, 드리블 실책, 블리츠·프레스·트랩, 그랩 앤 고 |
| spdBall | 프레스, 돌파 성공률(+0.1%p/점), 속공 운반자·스피드 보너스, 드리블 갭 실책 |
| passVision / passAcc / passIq | handler, 패서 선정 집중, 킥아웃·트레일러·러너 패스 확률, 패스 품질 보정, 패싱레인 저항, 랍, 블리츠 탈출 |
| hands | 캐치 플레이 실책·스틸 저항, postScorer, 훅, connector |
| speed / agility | 외곽 미스매치 격차, driver·roller, 헬프 신체 게이트, 프레스, 속공 러너 |
| strength | 골밑 미스매치 격차, 덩크 체격·블락 저항, 리바운드, 스크린 체격 |
| vertical | 덩크 자격, 블락, 랍, 리바운드, 러너 |
| height / weight | 체격(스크린·포스트), 블락, 훅 배율, 피니셔 보너스, 리바운드 |
| intDef / perDef | 수비 rating(성공률), 수비 스킬 파울 커브, 프레스·블리츠·스크린 회피 |
| defConsist | 수비 rating ±, 집중력 저하 확률, 파울 커브, 차징 유도 |
| helpDefIq | 헬퍼 선정·성공, 림 프로텍터 개입 |
| blk | 블락 커브, rimProtector |
| steal / passPerc | 온볼·레인·헬프 스틸 |
| offReb / defReb / boxOut / hustle | 리바운드 |
| stamina / durability | 체력 소모·회복, 부상 |
| intangibles | 클러치, 샷클락 막판 완화 |

---

## 13. 영향 지도: 시드 성향(히든 텐던시)과 DB 성향

| 성향 | 작용 |
|---|---|
| playStyle (N(0, .35)) | 슈터·패서 선정 ±25%, 킥아웃·트레일러·러너 패스 마인드(×0.4~1.6), 선택 시점 킥아웃 |
| ballDominance (N(1, .2)) | 슈터 선정 가중치 ×0.5~1.5(에이스 하한 0.9), 패서 선정 반전 |
| shotDiscipline | 성공률 ±1.5%p |
| ego | 1·2옵션 성공률 ± |
| clutchGene | 클러치 ±3%p, 샷클락 막판 완화 |
| composure | 비강제 실책 ±1%p |
| focusDrift | 체력 30 미만 추가 감점 |
| defensiveMotor | 수비 rating ±10 (성공률 ±2.9%p 폭) |
| foulProneness | 슈팅파울 ±2%p, 프로텍터 파울, 플래그런트, 프레스 파울 |
| temperament | 테크니컬·플래그런트·싸움 |
| motorIntensity | 리바운더 선정 |
| DB zones / lateral_bias | 존 선택(성향 × 슬라이더), 서브존·좌우 |

---

## 14. 무작위성(분산)이 생기는 곳

- **포세션당 난수**: 플레이 선택, 액터, 존, 슛 종류, 수비(지역방어·스위치·커버리지), 헬프, 킥아웃, 파울 계열(최대 7회 판정), 실책(스틸 최대 6회), 랍, 블락 2회, 성공, 앤드원, 리바운드, 시간 노이즈, 성공률 노이즈 2종.
- **경기 단위**: 시드 성향(리그 고정), 점프볼, 부상.
- **결과 분산**: 같은 로스터·전술이라도 한 시즌(82경기)의 선수별 TS는 ±1~2%p 흔들린다. 13~20경기 표본은 3점 성공률이 ±5~7%p 흔들린다. 진단에는 하네스 4~8시즌 반복을 쓴다.

---

## 15. 현재 엔진이 만드는 결과 (측정치)

하네스(실제 NBA Active 로스터·전술·일정 1,230경기 × 4시즌, 체력 이월·점프볼), HEAD `cea9f45f` 기준이다. 실경기(10-28 패치 후 56경기)도 같은 방향이었다.

| 지표 (팀 경기당) | 엔진 | 참고: 현실 |
|---|---|---|
| 득점 / 포세션 / ORtg | 107.3 / 100.1 / 107.2 | 2024-25 평균 113.8 / 약 101 / 114.5 |
| FGA / 3PA (비중) | 85.9 / 29.2 (33.9%) | 3점 비중 41.3% (2025-26) |
| FTA / TOV / AST | 22.2 / 14.4 / 25.5 | – |
| 블락 / 공격 리바운드 | 5.45 / 10.0 | – |
| 존 분포 (림 / 페인트 / 미드 / 3점) | 44.3 / 12.4 / 9.4 / 33.9% | 24.5 / 20.9 / 13.3 / 41.3% (bbref 0~3피트 / 3~10피트 / 10피트~3점 / 3점) |
| 존 성공률 (림 / 페인트 / 미드 / 3점) | 58.0 / 41.2 / 40.4 / 34.7% | 70.6 / 45.9 / 약 42~44 / 35.9% |
| 슛 종류 (비중, 성공률) | CS 25.4% (34), 레이업 23.9% (50), 덩크 20.4% (68), 풀업 12.1% (37), 점퍼 10.5% (41), 플로터 6.7% (40), 훅 1.0% (44) | – |
| 포지션 TS (PG / SG / SF / PF / C) | 55.6 / 56.1 / 55.5 / 55.4 / 57.8 | 55.8 / 57.3 / 57.0 / 57.9 / 60.8 (StatMuse 2024-25) |
| 속공 슛 (림 / 페인트 / 3점) | 71 / 21 / 8% | – |
| 헬프 10 순이득 (helpDef 10 대 5) | 약 +0.3점/경기 | 목표 범위 |

- 현실 수치는 basketball-reference·StatMuse에서 가져왔다. 범위 정의가 엔진 존과 정확히 일치하지는 않는다.

---

## 16. 구조적 특성 · 알려진 이슈 · 주의점

1. **존 성향이 림 쪽으로 치우쳐 있고, 엔진의 림 성공률은 낮다.**
   - DB 존 성향이 리그 평균으로 림 +11%p, 페인트 −6%p, 3점 −5.5%p 치우쳐 있다(410명 비교). 공용 템플릿을 쓰는 선수가 65명 이상이다.
   - 반면 엔진의 림 성공률(58%)은 현실(70.6%)보다 12%p 낮다. 성향을 현실로 고치면 득점이 −3.7점 떨어지고, 림·페인트 커브를 보정하면(레이업 +0.17, 덩크 +0.11, 페인트 +0.05) 111.7점이 된다.
   - **미적용, 결정 대기**(2026-10-28, 득점 증가폭 A/B/C안).
2. **존 선택은 돌파 능력과 무관하다.** 슛 위치는 성향과 슬라이더로만 정해진다. 하프코트 돌파 판정은 시험 후 기각됐다(재제안 금지).
3. **아키타입은 경기 중 고정이다.** 체력 저하는 성공률 체력 항으로만 반영된다.
4. **리그 정규화의 비대칭.**
   - 내부 마무리·수비·패스·drFoul(×2.5)은 깎이고 3점·ft·근력·점프는 깎이지 않는다.
   - 상위 리그일수록 3점과 운동능력 상대가치가 오르고, 파울 유도형 스타의 자유투가 줄어든다(돈치치 FTA 5.0 대 현실 10.1 사례).
5. **볼 배분.**
   - 슈터 선정은 시드 `ballDominance`의 영향이 크다(에이스 하한으로 일부 완화).
   - 36분당 볼륨은 평균으로는 현실과 비슷하지만, 고볼륨 스타(돈치치·SGA·커리)가 낮고 다른 선수가 높게 나오는 식으로 순위가 어긋난다.
   - 경기당 볼륨 부족의 주원인은 출전 시간(스타 27~30분 대 현실 33~36분)이다.
6. **3점 레이팅 커브 자체는 설계대로 작동한다**(같은 선수 통제 실험: 72 → 31%, 99 → 43%). 다만 같은 레이팅이어도 슛 구성(풀업 대 오픈) 때문에 선수별 3~5%p 차이가 난다.
7. **팀 3점 비중이 낮다**(33.9% 대 현실 41%). 원인은 성향 편향과, 플레이 구조상 림·페인트로 가는 경로(속공·컷·풋백·롤·포스트)다.
8. **블락은 레이업에 취약하다**(배율 1.0, 덩크 저항 없음). 가드 레이업 블락은 약 13.5%(1차 7.5 + 개입 6.0)다.
9. **속공 턴오버**: 러너·트레일러 캐치 플레이와 랍 실패로 재설계 전보다 1~2%p 높다. 속공 랍 개선안(성공 기본 0.675, 실패 절반은 슛 미스)은 미적용이다.
10. **선택 시점 킥아웃이 PostUp·PnR_Roll에 남아 있다**(×0.5). Iso는 폐지.
11. **PF 슬롯 스태킹 편법**은 미해결이다(`docs/engine/pf-slot-stacking-issue.md`). 슬롯 기반 매칭·롤·팝 자격과 얽혀 있다.
12. **표본 함정**: 13~20경기 실리그 기록으로 엔진 문제를 단정하지 말 것. 하네스로 반복 측정한다.

---

## 17. 비활성 기능 · 미러 차이 · 데드 코드

- **비활성(ENABLED false)**: `PLAYMAKING`(Clairvoyant/Overseer/Needle), `CLUTCH_ARCHETYPE`(Curtain Call/Ice/High Roller — 다만 프레셔 −1.5%p는 항상 적용), `ZONE_SHOOTING`(Fundamental/Rangemaster/Tyrant/Levitator/Afterburner/Ascendant/Deadeye/Manipulator), `BLOCK` 아키(Alien/Skywalker), `REBOUND` 아키(Harvester/Raider).
- **미사용 상수**: `ISO_KICKOUT`, `PNR_HANDLER_KICKOUT`(10-24·10-28 이후 코드에서 안 씀), `POSITION_PENALTY_MAP`(전부 1.0), `STATS`, `FATIGUE`의 일부 항목.
- **무시되는 데이터**: `playerTactics`(선수별 정책, 10-17부터 빈 객체) → 클러치 must-play/must-bench, 가비지 정책, 휴식 임계, 파울 무시 정책이 실제로 작동하지 않는다.
- **클라·서버 합성값**: 2026-10-29에 클라이언트(`services/dataMapper.ts`, `hooks/useGameData.ts` 커스텀 모드)를 서버 `CATEGORY_ATTRS` 정의로 통일했다. ins = (closeShot + layup + dunk + postPlay + drawFoul)/5, out = (midRange + 3점 3종 + shotIq + offConsist)/6, plm 6종, def 7종, reb = (offReb + defReb + boxOut)/3, ath 6종(내구도 제외). 세 곳을 같이 바꿀 것.
- **레거시**: `engine/shootingSystem.ts`, `defenseSystem.ts`, `foulSystem.ts`, `playmakingSystem.ts`(CLAUDE.md 데드 코드 목록), `flowEngine.calculateTeamDefensiveRating`(미사용).

---

## 18. 엔진을 고칠 때 체크리스트

1. **미러**: `services/game/**`와 `server/src/shared/**`를 같이 고친다(임포트에 `.ts`). 한쪽만 고치면 싱글과 멀티 결과가 달라진다.
2. **순서 효과**: 4절의 판정 순서상 앞 단계 확률을 바꾸면 뒤 단계의 실제 빈도가 바뀐다. 파울을 늘리면 실책·슛이 줄어든다.
3. **사용자 잠금**: `SHOOTING.INSIDE/MID/THREE_BASE_PCT`(`[EDITED BY USER! DO NOT CHANGE!]`)는 수정하지 않는다. 3점 커브(`THREE_OFF_CURVE`)는 사용자가 목표값을 정한 것이다.
4. **측정**: 하네스(실제 리그 로스터·전술·일정, 체력 이월, 4~8시즌)로 리그 득점·포세션·ORtg·존 분포·포지션 TS를 전후 비교한다. 헬프·프레스 같은 전술 슬라이더는 그룹 대 대조군 순이득으로 본다.
5. **기록**: `docs/history/dev-log.md`에 Before/After·검증·롤백을 남긴다(미러 쌍 모두).
6. **배포**: 커밋·푸시 후 `scripts/deploy-server.sh`(Fly). main 푸시는 Vercel(싱글 클라 엔진)로 바로 나간다.
7. **전술 책임 원칙**: 플레이 빈도 자동 보정은 하지 않는다. 로스터 반영은 실행 층에서만 한다.
8. **공유 데이터**: `meta_players`(능력치·성향)를 바꾸면 모든 리그와 싱글에 즉시 반영된다. 바꾸기 전에 백업한다.
