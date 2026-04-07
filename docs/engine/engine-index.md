# Engine Documentation Index

## PBP 경기 엔진 문서

PBP(Play-by-Play) 경기 시뮬레이션 엔진의 구성요소.
포세션 처리, 슈팅 확률, 선수 선택, 수비 매치업, 체력, 리바운드, 파울, 해설 등.

> 시즌 운영 시스템 (일정 생성, 플레이오프, 트레이드, 드래프트, 재정 등)은 [sim-index.md](../simulation/sim-index.md) 참조.

---

## 핵심 구조

| 문서 | 설명 | 핵심 파일 |
|------|------|----------|
| [pbp-engine.md](pbp-engine.md) | PBP 엔진 내부 구조 (포세션 8단계) | possessionHandler.ts, flowEngine.ts, playTypes.ts |

---

## 공격 시스템

| 문서 | 설명 | 핵심 파일 |
|------|------|----------|
| [player-usage.md](player-usage.md) | USG% 현실화, 액터 선택 확률 | playTypes.ts, usageWeights.ts, usageSystem.ts |
| [hidden-archetypes.md](hidden-archetypes.md) | 12종 히든 아키타입 (공격/수비/유틸리티) | constants.ts, flowEngine.ts, possessionHandler.ts |
| [shot-distribution.md](shot-distribution.md) | 10존 슈팅 분배, 텐던시/아키타입 기반 | shotDistribution.ts (pbp/, engine/) |
| [shot-hit-rate.md](shot-hit-rate.md) | 슈팅 적중률 계산 | flowEngine.ts |
| [hot-cold-streak.md](hot-cold-streak.md) | 핫/콜드 스트릭 시스템 | statsMappers.ts |
| [clutch-mechanic.md](clutch-mechanic.md) | 클러치 상황 보정 | flowEngine.ts |

---

## 수비 시스템

| 문서 | 설명 | 핵심 파일 |
|------|------|----------|
| [ace-stopper.md](ace-stopper.md) | 에이스 스토퍼 매치업 효과 (-50%~+40%) | aceStopperSystem.ts |
| [foul-trouble.md](foul-trouble.md) | 파울 트러블 심리 (파울 확률/수비 페널티) | possessionHandler.ts, constants.ts |
| [tf-ff-system.md](tf-ff-system.md) | 턴오버/자유투 시스템 | possessionHandler.ts |

---

## 게임 운영

| 문서 | 설명 | 핵심 파일 |
|------|------|----------|
| [time-engine.md](time-engine.md) | 포세션 시간 계산 (Pace, 2-for-1, 클러치) | timeEngine.ts |
| [fatigue-system.md](fatigue-system.md) | 체력 소모/회복, 부상 시스템 | fatigueSystem.ts, stateUpdater.ts |
| [rotation-algorithm.md](rotation-algorithm.md) | 로테이션 매트릭스 기반 선수 교체 | rotationLogic.ts, substitutionSystem.ts |
| [rebound-logic.md](rebound-logic.md) | 2단계 리바운드 시스템 (ORB%→리바운더) | reboundLogic.ts |
| [momentum-system.md](momentum-system.md) | 모멘텀/런 시스템 | possessionHandler.ts |
| [coach-delegation.md](coach-delegation.md) | 코치 위임 시스템 (라이브 전술/타임아웃 자동 결정) | useLiveGame.ts, liveEngine.ts, LiveGameView.tsx |

---

## 선수 & 전술

| 문서 | 설명 | 핵심 파일 |
|------|------|----------|
| [tendency-system.md](tendency-system.md) | 히든 텐던시 (5종 성향 파라미터) | hiddenTendencies.ts |
| [tactic-system.md](tactic-system.md) | 전술 자동생성, 슬라이더, 분 배분 | tacticGenerator.ts, tacticPresets.ts, sliderSteps.ts, minutesManager.ts |
| [player-tactics.md](player-tactics.md) | 개인 전술 (체력 휴식·파울 무시·가비지타임·클러치 기용 정책) | substitutionSystem.ts, rotationLogic.ts, PlayerTacticsPanel.tsx |

---

## 데이터 처리 & UI

| 문서 | 설명 | 핵심 파일 |
|------|------|----------|
| [stat-handlers.md](stat-handlers.md) | 스탯 기록 파이프라인, ±, 샷 차트 | statsMappers.ts, statUtils.ts, visUtils.ts |
| [commentary.md](commentary.md) | 한국어 PBP 해설 생성 (~110종) | textGenerator.ts |

---

## 선수 성장/퇴화

| 문서 | 설명 | 핵심 파일 |
|------|------|----------|
| [development/pipeline.md](development/pipeline.md) | 성장/퇴화 파이프라인 | playerAging.ts |
| [development/growth-system.md](development/growth-system.md) | 성장 시스템 상세 | playerAging.ts |
| [development/decline-system.md](development/decline-system.md) | 퇴화 시스템 상세 | playerAging.ts |
| [development/attr-config.md](development/attr-config.md) | 능력치별 성장/퇴화 설정 | playerAging.ts |

---

## 설정 & 상수

| 파일 | 역할 |
|------|------|
| `services/game/config/constants.ts` | SIM_CONFIG 전체 (FATIGUE, SHOOTING, FOUL_EVENTS, REBOUND, BLOCK, STEAL, CLUTCH, ZONE_SHOOTING, FINISH, SHOT_DEFENSE, PNR_COVERAGE, FOUL_TROUBLE) |
| `services/game/config/usageWeights.ts` | PLAY_TYPE_USAGE_WEIGHTS (옵션 랭크별 가중치) |
| `services/game/config/tacticPresets.ts` | DEFAULT_SLIDERS |
| `services/game/config/sliderSteps.ts` | UI 슬라이더 스텝 정의 |

---

## 파일 ↔ 문서 매핑

### PBP 엔진 (`services/game/engine/pbp/`)
| 파일 | 문서 |
|------|------|
| main.ts | [sim-structure.md](../simulation/sim-structure.md) |
| liveEngine.ts | [sim-structure.md](../simulation/sim-structure.md), [coach-delegation.md](coach-delegation.md) |
| possessionHandler.ts | [pbp-engine.md](pbp-engine.md) |
| flowEngine.ts | [pbp-engine.md](pbp-engine.md), [hidden-archetypes.md](hidden-archetypes.md) |
| playTypes.ts | [pbp-engine.md](pbp-engine.md), [player-usage.md](player-usage.md) |
| usageSystem.ts | [player-usage.md](player-usage.md) |
| archetypeSystem.ts | [hidden-archetypes.md](hidden-archetypes.md) |
| reboundLogic.ts | [rebound-logic.md](rebound-logic.md) |
| timeEngine.ts | [time-engine.md](time-engine.md) |
| stateUpdater.ts | [fatigue-system.md](fatigue-system.md) |
| statsMappers.ts | [stat-handlers.md](stat-handlers.md) |
| shotDistribution.ts | [shot-distribution.md](shot-distribution.md) |
| initializer.ts | [sim-structure.md](../simulation/sim-structure.md) |
| pbpTypes.ts | [pbp-engine.md](pbp-engine.md) |
| rotationLogic.ts | [rotation-algorithm.md](rotation-algorithm.md) |
| substitutionSystem.ts | [rotation-algorithm.md](rotation-algorithm.md), [player-tactics.md](player-tactics.md) |
| handlers/statUtils.ts | [stat-handlers.md](stat-handlers.md) |
| handlers/visUtils.ts | [stat-handlers.md](stat-handlers.md) |

### 외부 엔진 파일
| 파일 | 문서 |
|------|------|
| engine/fatigueSystem.ts | [fatigue-system.md](fatigue-system.md) |
| engine/aceStopperSystem.ts | [ace-stopper.md](ace-stopper.md) |
| engine/shotDistribution.ts | [shot-distribution.md](shot-distribution.md) |
| commentary/textGenerator.ts | [commentary.md](commentary.md) |
| tactics/tacticGenerator.ts | [tactic-system.md](tactic-system.md) |
| tactics/minutesManager.ts | [tactic-system.md](tactic-system.md) |
| config/constants.ts | 각 문서에서 관련 상수 참조 |
| config/usageWeights.ts | [player-usage.md](player-usage.md) |
