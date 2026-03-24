# Simulation Documentation Index

## 시뮬레이션 시스템 전체 목록

PBP 경기 엔진 **외부**의 시뮬레이션 운영 시스템 문서.
시즌 흐름, 일정 생성, 플레이오프, 트레이드, 드래프트, 재정, 영속성 등.

> PBP 경기 엔진 내부 (포세션, 슈팅, 수비 등)는 [engine-index.md](../engine/engine-index.md) 참조.

---

## 아키텍처 & 파이프라인

| 문서 | 설명 | 핵심 파일 |
|------|------|----------|
| [sim-structure.md](sim-structure.md) | 전체 파이프라인 개요 (Hook→Service→Engine) | useSimulation.ts, gameEngine.ts, main.ts |
| [snapshot-caching.md](snapshot-caching.md) | 스냅샷 캐싱/복원 시스템 (v4, growthState 포함) | persistence.ts, stateReplayer.ts |

---

## 시즌 운영

| 문서 | 설명 | 핵심 파일 |
|------|------|----------|
| [schedule-generator.md](schedule-generator.md) | 시즌 일정 자동생성 (82경기 × 30팀) | scheduleGenerator.ts |
| [playoff-system.md](playoff-system.md) | 플레이오프 브래킷/타이브레이커/일정 생성 | playoffLogic.ts, tiebreaker.ts, seasonService.ts |
| [draft-lottery.md](draft-lottery.md) | NBA 2019+ 드래프트 로터리 추첨 시스템 | lotteryEngine.ts, offseasonEventHandler.ts |
| [rookie-generator.md](rookie-generator.md) | 루키 생성 알고리즘 (60명 드래프트 클래스) | rookieGenerator.ts, rookieRepository.ts |
| [initial-fa-pool.md](initial-fa-pool.md) | 게임 시작 시 초기 FA 풀 생성 (베테랑 65명, 3티어) | rookieGenerator.ts, useGameData.ts |

---

## 트레이드 & 재정

| 문서 | 설명 | 핵심 파일 |
|------|------|----------|
| [trade-system.md](trade-system.md) | 트레이드 엔진 (블록, 오퍼, CBA, 픽 밸류) | tradeExecutor.ts, tradeBlockManager.ts, pickValueEngine.ts |
| [cpu-trade-engine.md](cpu-trade-engine.md) | CPU 트레이드 AI 아키텍처 (5단계 파이프라인, GM 슬라이더, TradeUtility) | cpuTradeSimulator.ts, tradeGoalEngine.ts, tradeUtilityEngine.ts |
| [finance-system.md](finance-system.md) | 예산/수익/지출 시뮬레이션 | financeEngine.ts |
| [popularity-system.md](popularity-system.md) | 선수 인기도 시스템 (관중·MD·스폰서십 재정 연결) | playerPopularity.ts, attendanceModel.ts |
| [morale-system.md](morale-system.md) | 선수 기분 시스템 (PBP 히트레이트 보정 ±1.8%p) | moraleService.ts, possessionHandler.ts |

---

## 파일 ↔ 문서 매핑

### 시뮬레이션 서비스 (`services/simulation/`)
| 파일 | 문서 |
|------|------|
| seasonService.ts | [sim-structure.md](sim-structure.md), [playoff-system.md](playoff-system.md) |
| offseasonEventHandler.ts | [draft-lottery.md](draft-lottery.md), [rookie-generator.md](rookie-generator.md) |
| batchSeasonService.ts | [sim-structure.md](sim-structure.md) |
| userGameService.ts | [sim-structure.md](sim-structure.md) |
| cpuGameService.ts | [sim-structure.md](sim-structure.md) |

### 드래프트 (`services/draft/`)
| 파일 | 문서 |
|------|------|
| lotteryEngine.ts | [draft-lottery.md](draft-lottery.md) |
| rookieGenerator.ts | [rookie-generator.md](rookie-generator.md), [initial-fa-pool.md](initial-fa-pool.md) |
| rookieRepository.ts | [rookie-generator.md](rookie-generator.md), [initial-fa-pool.md](initial-fa-pool.md) |

### 트레이드 (`services/tradeEngine/`)
| 파일 | 문서 |
|------|------|
| tradeExecutor.ts | [trade-system.md](trade-system.md) |
| tradeBlockManager.ts | [trade-system.md](trade-system.md) |
| pickValueEngine.ts | [trade-system.md](trade-system.md) |
| cpuTradeSimulator.ts | [cpu-trade-engine.md](cpu-trade-engine.md) |
| tradeGoalEngine.ts | [cpu-trade-engine.md](cpu-trade-engine.md) |
| tradeParticipation.ts | [cpu-trade-engine.md](cpu-trade-engine.md) |
| assetAvailability.ts | [cpu-trade-engine.md](cpu-trade-engine.md) |
| tradeTargetFinder.ts | [cpu-trade-engine.md](cpu-trade-engine.md) |
| tradeUtilityEngine.ts | [cpu-trade-engine.md](cpu-trade-engine.md) |
| teamAnalysis.ts | [cpu-trade-engine.md](cpu-trade-engine.md), [trade-system.md](trade-system.md) |

### 유틸리티 (`utils/`)
| 파일 | 문서 |
|------|------|
| scheduleGenerator.ts | [schedule-generator.md](schedule-generator.md) |
| playoffLogic.ts | [playoff-system.md](playoff-system.md) |
| tiebreaker.ts | [playoff-system.md](playoff-system.md), [draft-lottery.md](draft-lottery.md) |
| seasonConfig.ts | [sim-structure.md](sim-structure.md), [draft-lottery.md](draft-lottery.md) |

### 훅 (`hooks/`)
| 파일 | 문서 |
|------|------|
| useSimulation.ts | [sim-structure.md](sim-structure.md) |
| useFullSeasonSim.ts | [sim-structure.md](sim-structure.md) |
| useGameData.ts | [snapshot-caching.md](snapshot-caching.md) |

### 영속성 (`services/`)
| 파일 | 문서 |
|------|------|
| persistence.ts | [snapshot-caching.md](snapshot-caching.md) |
| seasonArchive.ts | [draft-lottery.md](draft-lottery.md) |
| playerPopularity.ts | [popularity-system.md](popularity-system.md) |
| popularitySeeds.ts | [popularity-system.md](popularity-system.md) |
| moraleService.ts | [morale-system.md](morale-system.md) |
