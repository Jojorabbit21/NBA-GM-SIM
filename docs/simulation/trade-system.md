# 트레이드 시스템 아키텍처

## 개요

드래프트 픽 거래, 영속 트레이드 블록, 비동기 오퍼 파이프라인을 갖춘 통합 트레이드 시스템.

### 핵심 기능
- **드래프트 픽 거래**: 보호(Top N), 스왑, 스테피언 룰 검증
- **영속 트레이드 블록**: 유저 + CPU 팀 모두 블록 보유, 세션 간 영속
- **비동기 오퍼 파이프라인**: CPU가 유저 블록 평가 → 인박스 오퍼 수신 → 수락/거절
- **통합 실행**: 모든 트레이드(선수, 픽, 혼합, 유저↔CPU, CPU↔CPU)가 `tradeExecutor` 단일 경로

---

## 데이터 모델

### DB 저장 (`saves` 테이블 JSONB 컬럼)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `league_trade_blocks` | LeagueTradeBlocks | 팀별 트레이드 블록 (teamId → entries) |
| `league_trade_offers` | LeagueTradeOffers | 전체 활성 오퍼 목록 |
| `league_pick_assets` | LeaguePickAssets | 팀별 드래프트 픽 보유 현황 |

### 핵심 타입 (`types/trade.ts`)

```
TradeBlockEntry { type: 'player'|'pick', playerId?, pick?: TradePickRef, addedDate }
TeamTradeBlock { teamId, entries: TradeBlockEntry[], lastEvaluated? }
LeagueTradeBlocks = Record<string, TeamTradeBlock>

PersistentTradeOffer {
    id, fromTeamId, toTeamId, createdDate, expiresDate, status,
    offeredPlayers: TradePlayerRef[], offeredPicks: PersistentPickRef[],
    requestedPlayers: TradePlayerRef[], requestedPicks: PersistentPickRef[],
    parentOfferId?, analysis?
}
LeagueTradeOffers { offers: PersistentTradeOffer[] }
```

### 오퍼 상태 (`TradeOfferStatus`)
`pending` → `accepted` | `rejected` | `countered` | `expired`

---

## 파일 구조

### 엔진 코어 (`services/tradeEngine/`)
| 파일 | 설명 |
|---|---|
| `tradeExecutor.ts` | **통합 실행기** — 사전검증(CBA/NTC/Stepien/로스터) → 로스터 스왑 → 픽 이전 → 블록 정리 → Transaction 생성 |
| `tradeBlockManager.ts` | CPU 블록 동기화 + 유저 블록 평가 → 오퍼 생성 + 유저 제안 CPU 응답 + 만료 처리 |
| `pickValueEngine.ts` | 드래프트 픽 가치 산정 (슬롯커브 × 연도할인 × 라운드할인 × 보호할인 × 스왑보너스) + `getPickValueToGM()` (GM 성격 반영) |
| `stepienRule.ts` | 스테피언 룰 검증 (연속 2년 자기 1라운드 픽 0개 금지) |
| `salaryRules.ts` | CBA 샐러리 매칭 + NTC 체크 |
| `cpuTradeSimulator.ts` | CPU↔CPU 트레이드 — 5단계 고도화 파이프라인 + 기존 호환성 방식 폴백 |
| `tradeValue.ts` | 선수 트레이드 가치 — 시장가치(`getPlayerMarketValue`) + GM 성격 반영 팀별 가치(`getPlayerValueToTeam`) |
| `tradeConfig.ts` | 상수 체계 (`PICK_VALUE`, `TRADE_BLOCK` 설정 포함) |
| `teamAnalysis.ts` | 팀 상황 분석 — `analyzeTeamSituation()` (하위호환) + `buildTeamTradeState()` (고도화 엔진용) |
| `tradeParticipation.ts` | **[신규]** 시장 참가 점수 계산 (`calculateParticipationScore`) |
| `tradeGoalEngine.ts` | **[신규]** 트레이드 목표 생성 (`generateTradeGoal`, 8종) |
| `assetAvailability.ts` | **[신규]** 선수별 가용성 점수 (`getPlayerAvailability`, 0~1) |
| `tradeTargetFinder.ts` | **[신규]** 목표 기반 타깃 탐색 (`findTradeTargets`) |
| `tradeUtilityEngine.ts` | **[신규]** 유틸리티 평가 (`calculateTradeUtility`, `calculateAcceptScore`, `calculateRegretCost`) |

### UI 컴포넌트 (`components/transactions/`)
| 파일 | 설명 |
|---|---|
| `tabs/TradeBlockTab.tsx` | 영속 블록 관리 (선수 + 픽 등록, PickSelector 토글) |
| `tabs/IncomingOffersTab.tsx` | 수신/발신 오퍼 관리 (수락/거절, 상태 표시) |
| `tabs/TradeProposalTab.tsx` | 직접 제안 (즉시 협상 + 비동기 전송, 선수+픽 2-panel) |
| `tabs/TradeHistoryTab.tsx` | 트레이드 이력 |
| `PickSelector.tsx` | 드래프트 픽 선택 위젯 (시즌별 그룹, 보호/스왑 표시) |
| `TradeConfirmModal.tsx` | 확인 모달 (선수+픽 테이블, NTC/CBA 경고, 샐러리 캡 바) |

### 뷰/훅
| 파일 | 설명 |
|---|---|
| `views/TransactionsView.tsx` | 4탭 구조: 트레이드 블록 / 수신 오퍼 / 직접 제안 / 이력 |
| `hooks/useTradeSystem.ts` | 영속 블록 + 비동기 오퍼 + 레거시 즉시 시스템 통합 훅 |

---

## 실행 흐름

### 1. 시뮬 루프 통합 (`seasonService.ts`)

정규시즌 중 매 시뮬 일마다:
```
syncCPUTradeBlocks()       → CPU 팀 블록 갱신
simulateCPUTrades()        → CPU↔CPU 트레이드 실행 (픽 포함)
evaluateUserTradeBlock()   → 유저 블록 평가 → CPU 오퍼 생성
evaluateUserProposals()    → 유저가 보낸 제안에 CPU 응답
expireOldOffers()          → 7일 경과 오퍼 만료
```

### 2. 유저 플로우

#### 트레이드 블록 등록
1. TradeBlockTab에서 선수/픽 선택 → `togglePersistentBlockPlayer/Pick`
2. `leagueTradeBlocks[myTeamId].entries`에 영속 저장
3. 시뮬 진행 → CPU가 블록 평가 → 오퍼 생성 → 인박스 수신

#### 수신 오퍼 처리
1. IncomingOffersTab에서 pending 오퍼 확인
2. 수락 → `acceptIncomingOffer` → TradeConfirmModal → `executeTrade`
3. 거절 → `rejectIncomingOffer` → status 'rejected'

#### 직접 제안
- **즉시 협상**: 상대 선수 선택 → "즉시 협상" → CPU 카운터 → 즉시 실행
- **비동기 전송**: 보낼 자산(선수+픽) + 받을 자산(선수+픽) 구성 → "제안 전송" → 다음 시뮬에서 CPU 응답

### 3. 통합 실행기 (`tradeExecutor.ts`)

```
validateTradeOnly()   → 사전검증만 (제안 전송 시)
executeTrade()        → 검증 + 실행
  1. CBA 샐러리 매칭 검증
  2. NTC 선수 검출
  3. 스테피언 룰 검증 (1라운드 픽 거래 시)
  4. 로스터 최소 인원 검증 (MIN_ROSTER_SIZE = 13)
  5. 선수 로스터 스왑
  6. 픽 currentTeamId 이전
  7. 블록에서 거래 자산 제거
  8. Transaction 레코드 생성
  9. 로스터 초과 팀 감지 → overflowTeams?: string[] 반환
```

#### 로스터 overflow 처리

트레이드 후 `MAX_ROSTER_SIZE(15)` 초과 시 자동 처리:

| 경로 | 처리 방식 |
|------|---------|
| **CPU-CPU 트레이드** (`cpuTradeSimulator.ts`) | `trimOverflowRosters()` — 스타 보호(OVR 88+ && age ≤ 33) 후 최저 OVR 선수 즉시 컷 |
| **유저 트레이드** (`useTradeSystem.ts`) | 토스트 경고 발생 → 유저가 FA 뷰에서 직접 방출 |

```ts
// TradeExecutionResult
overflowTeams?: string[];  // 초과 팀 ID 목록
```

---

## 드래프트 픽 가치 엔진 (`pickValueEngine.ts`)

### 공식
```
baseValue = slotValueCurve(projectedDraftPosition)
roundDiscount = round === 1 ? 1.0 : ROUND_2_DISCOUNT(0.25)
yearDiscount = YEAR_DISCOUNT_RATE(0.88) ^ yearsAway
protectionDiscount = conveyanceProbability
swapBonus = E[max(mySlot, theirSlot)] - mySlot

finalValue = baseValue × roundDiscount × yearDiscount × protectionDiscount + swapBonus
```

### 슬롯 가치 커브
1순위 = 1.0, 5순위 = ~0.65, 14순위 = ~0.30, 30순위 = ~0.08

### 예상 순위 투영
팀 승률 기반: `projectedPick = 1 + Math.floor(winPct * 29)`

---

## CBA 규칙 구현

### 샐러리 매칭 (`salaryRules.ts`)
| 구간 | 규칙 |
|---|---|
| Cap 이하 | 125% + $250K |
| Luxury Tax | 110% |
| 1st Apron | 100% (들어오는 ≤ 나가는) |
| 2nd Apron | 100% + Aggregation 금지 |

### 스테피언 룰 (`stepienRule.ts`)
- 트레이드 후 시뮬레이션: 향후 5시즌 검사
- 연속 2년간 자기 1라운드 픽이 0개인 구간 발견 시 위반
- 1라운드 픽 거래 시에만 검증

### NTC (`salaryRules.ts`)
- `player.contract.noTrade === true` → 트레이드 차단
- TradeConfirmModal에 NTC 경고 패널 표시

---

## CPU 트레이드 로직

> **상세 문서**: `docs/simulation/cpu-trade-engine.md` 참조

### 블록 동기화 (`syncCPUTradeBlocks`)
- 팀 상황(contender/seller) 분석 → 트레이드 가능 선수/픽 선별
- 3일 간격 쓰로틀, 최대 엔트리 수 제한

### CPU → 유저 오퍼 (`evaluateUserTradeBlock`)
- 유저 블록의 선수/픽에 대해 CPU 팀 니즈 호환성 평가
- CPU 팀당 3일 간격, 하루 최대 1건
- 호환 시 PersistentTradeOffer 생성 + TRADE_OFFER_RECEIVED 메시지

### CPU↔CPU 트레이드 (`cpuTradeSimulator.ts`) — 고도화 파이프라인

5단계 파이프라인 + 호환성 기반 폴백으로 구성:

```
1. 전 팀 TeamTradeState 계산 (buildTeamTradeState)
2. ParticipationScore ≥ 0.35인 팀만 참가 (calculateParticipationScore)
3. 참가 팀별 TradeGoal 생성 (generateTradeGoal)
4. 목표 기반 타깃 탐색 (findTradeTargets — availability, 팀별 가치 기반)
5. TradeUtility 양팀 검증 → 임계값 통과 시 executeTrade() 실행
   폴백: 타깃 미발견 또는 FUTURE_ASSETS 목표 → 기존 호환성 스캔
```

- `ScoredPickAsset`으로 픽 포함 패키지 구성 (가치 차이 >15% 시 픽 보완)
- 픽 포함 시 `tradeExecutor` 경유, 미포함 시 레거시 `executeRosterSwap`

### 유저 제안 응답 (`evaluateUserProposals`)
- `gmProfile` 있으면 `calculateAcceptScore()` 기반 평가 (direction별 utility 임계값)
- `gmProfile` 없으면 기존 `valueRatioMin` 기반 폴백
- TRADE_OFFER_RESPONSE 메시지 발송

---

## 설정값 (`tradeConfig.ts`)

```typescript
PICK_VALUE: {
    YEAR_DISCOUNT_RATE: 0.88,
    ROUND_2_DISCOUNT: 0.25,
    PROTECTED_CONVEYANCE_BASE: 0.6,
    SWAP_SPREAD_BONUS: 0.15,
}

TRADE_BLOCK: {
    MAX_USER_BLOCK_ENTRIES: 8,     // 선수 5 + 픽 3
    CPU_EVAL_INTERVAL_DAYS: 3,
    MAX_OFFERS_PER_DAY: 1,
    OFFER_EXPIRY_DAYS: 7,
}
```

---

## 메시지 연동 (`types/message.ts`)
- `TRADE_OFFER_RECEIVED`: CPU가 유저에게 오퍼 발송 시
- `TRADE_OFFER_RESPONSE`: 유저 제안에 CPU가 응답 시
- `TRADE_ALERT`: 트레이드 실행 완료 시

---

## 하위호환

- 모든 새 파라미터는 optional → 기존 callers(useSimulation, batchSeasonService 등) 변경 불요
- `leagueTradeBlocks`/`leagueTradeOffers` 미제공 시 블록/오퍼 로직 미실행
- `leaguePickAssets` 미제공 시 레거시 로스터-only 트레이드로 폴백
- TradeBlockTab/TradeProposalTab은 레거시 즉시 시스템과 새 영속 시스템 동시 지원
