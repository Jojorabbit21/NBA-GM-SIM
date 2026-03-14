# 드래프트 픽 자산 관리 시스템

## 개요

각 팀이 향후 7시즌(2026~2032)의 드래프트 픽(1라운드 + 2라운드)을 자산으로 소유하는 시스템.
실제 NBA의 드래프트 픽 거래 현황을 초기 데이터로 반영하며, 향후 트레이드/멀티시즌 확장에 대비.

---

## 구현 완료

### 1. 타입 정의 — `types/draftAssets.ts`

| 타입 | 설명 |
|------|------|
| `PickProtection` | 보호 조건 (`top` / `lottery` / `none`, threshold, fallback) |
| `SwapRight` | 스왑 권리 (beneficiaryTeamId ↔ originTeamId) |
| `DraftPickAsset` | 단일 픽 자산 (season, round, originalTeamId, currentTeamId, protection?, swapRight?, tradedDate?) |
| `LeaguePickAssets` | `Record<string, DraftPickAsset[]>` — currentTeamId 기준 그룹핑 |

### 2. 트레이드 타입 확장 — `types/trade.ts`

| 타입 | 설명 |
|------|------|
| `TradePlayerRef` | 트레이드 내 선수 참조 (playerId, playerName) |
| `TradePickRef` | 트레이드 내 픽 참조 (season, round, originalTeamId, protection?) |
| `TradeDetails` | 패키지 딜 지원 (counterpartTeamId + players + picks, 각 sent/received) |

`Transaction.details`가 `TradeDetails | any`로 확장됨 — 선수+픽 패키지 딜을 하나의 트랜잭션으로 기록 가능.

### 3. 초기 데이터 — `data/draftPickTrades.ts`

실제 NBA 드래프트 픽 거래 현황 (2025-26 시즌 기준, 하드코딩):
- `TRADED_FIRST_ROUND_PICKS`: ~25건의 1라운드 픽 이동
- `SWAP_RIGHTS`: ~10건의 스왑 권리

주요 거래:
- OKC: LAW/PHI/HOU/UTA 2026 픽 보유 (리그 최다)
- BKN: NYK 2027/2029/2031 픽 보유 (KD 트레이드)
- UTA: LAM 2027 픽 보유 (Westbrook 트레이드)

소스: ESPN, Hoops Rumors, FanSided

### 4. 초기화 — `services/draftAssets/pickInitializer.ts`

```
initializeLeaguePickAssets(): LeaguePickAssets
```

3단계 초기화:
1. 30팀 × 7시즌 × 2라운드 = 420개 기본 픽 생성
2. `TRADED_FIRST_ROUND_PICKS` 반영 — 픽 이동 (원래 팀에서 제거 → 현재 팀에 추가)
3. `SWAP_RIGHTS` 반영 — 해당 픽에 swapRight 필드 추가

### 5. 저장/로드 — `services/persistence.ts`

- `saveCheckpoint()`: 13번째 파라미터 `leaguePickAssets`
- `loadCheckpoint()`: `league_pick_assets` 컬럼 select
- DB 컬럼: `saves.league_pick_assets` (JSONB)

### 6. 상태 관리 — `hooks/useGameData.ts`

기존 `coachingData` / `teamFinances` 패턴과 동일:
- State: `leaguePickAssets` / `setLeaguePickAssets`
- gameStateRef 포함
- 체크포인트 로드: 저장된 값 우선, 없으면 초기화 후 비동기 저장
- forceSave / handleSelectTeam / cleanup에 반영

### 7. UI — `views/FrontOfficeView.tsx`

#### 보유 픽 테이블
- 행 = 시즌 (2026-27 ~ 2032-33), 열 = 시즌 | 1라운드 | 비고 | 2라운드 | 비고
- 같은 시즌에 복수 픽 보유 시 행을 여러 개 추가, 시즌 셀은 rowSpan 병합
- 셀 표시: **보유** (인디고) / **{팀명} 픽 획득** (에메랄드) / **→ {팀명}** (빨강)
- 비고: 보호 조건 + 스왑 권리 표시

#### 거래 기록 테이블
- 열 = 거래 일자 | 유형 | 방향 | 내용
- 초기 NBA 거래: "시즌 개시 전"
- 방향 색상: 획득(에메랄드) / 양도(빨강) / 스왑(앰버)
- 내 팀 관련 거래만 필터링, 시즌→라운드 순 정렬

---

## 미구현 — 향후 개발 필요

### 1. 픽 트레이드 실행 (트레이드 엔진 연동)

유저가 실제로 드래프트 픽을 거래하는 기능.

**필요 작업:**
- 트레이드 제안 UI에 픽 선택 추가 (선수 + 픽 패키지 딜)
- `leaguePickAssets` 업데이트 로직 (currentTeamId 변경, tradedDate 기록)
- `Transaction` 기록 (type: 'Trade', details: TradeDetails에 picks 포함)
- 거래 기록 테이블에 유저 트레이드 반영

**참조:** `TradeDetails` 타입은 이미 정의됨 (types/trade.ts)

### 2. Stepien Rule 검증

NBA 규정: 연속 2개 시즌의 1라운드 픽을 모두 트레이드할 수 없음.

**필요 작업:**
- `validateStepienRule(assets: LeaguePickAssets, teamId: string, tradingSeason: number): boolean`
- 트레이드 제안 시 검증 → 위반 시 거래 차단 + 사유 표시
- 매 홀수 연도에 최소 1개 1라운드 픽 보유 필요

### 3. 보호 조건 발동 로직

시즌 종료 시 팀 순위에 따라 보호된 픽의 전달 여부 판정.

**필요 작업:**
- 시즌 종료 이벤트에서 각 protected 픽 순회
- 팀 최종 순위 vs protection.threshold 비교
- 보호 발동 시: 픽이 원래 팀에 잔류, fallback 시즌/라운드로 새 픽 생성
- 보호 미발동 시: 픽이 정상적으로 상대 팀에 전달
- 결과를 leaguePickAssets에 반영 + 트랜잭션 기록

### 4. 스왑 권리 행사 로직

드래프트 시점에 양쪽 팀의 순위를 비교하여 유리한 픽 선택.

**필요 작업:**
- 드래프트 순서 배정 시 스왑 권리가 있는 픽 확인
- beneficiaryTeamId의 원래 픽 vs originTeamId의 원래 픽 비교
- 더 높은 순번(더 나쁜 성적)의 픽을 beneficiary가 선택 가능
- 스왑 발생 시 leaguePickAssets 업데이트 + 트랜잭션 기록

### 5. 드래프트 순번 배정

팀 성적 기반 드래프트 순서 결정 (로터리 포함).

**필요 작업:**
- 시즌 종료 후 팀 순위 → 드래프트 순번 매핑
- 1라운드: 로터리 (역순위 가중 랜덤) → 나머지 역순위
- 2라운드: 순수 역순위
- 각 DraftPickAsset에 최종 순번 부여

### 6. 타팀 픽 자산 조회

현재 자기 팀만 조회 가능 → 리그 전체 또는 특정 팀의 픽 자산 확인.

**필요 작업:**
- 드래프트 픽 탭에 팀 선택 드롭다운 또는 리그 전체 뷰 추가
- 기존 DraftPicksTab 컴포넌트에 teamId 파라미터 추가
- 트레이드 시 상대 팀 픽 확인용으로도 활용

### 7. 멀티시즌 픽 롤오버

시즌 전환 시 만료 픽 제거 및 새 시즌 픽 추가.

**필요 작업:**
- PICK_SEASONS 배열 동적 관리 (현재 시즌 기준 +7)
- 지난 시즌 픽 제거 (드래프트 완료 후)
- 새 시즌 픽 자동 생성 (모든 팀에 기본 픽 부여)
- 보호 조건 fallback으로 생성된 픽 처리

### 8. DB 마이그레이션

Supabase SQL Editor에서 수동 실행 필요:

```sql
ALTER TABLE saves ADD COLUMN IF NOT EXISTS league_pick_assets jsonb;
```

---

## 파일 구조

```
types/draftAssets.ts          — 타입 정의
types/trade.ts                — TradeDetails, TradePickRef 등
data/draftPickTrades.ts       — 초기 NBA 거래 데이터 (하드코딩)
services/draftAssets/
  pickInitializer.ts          — 초기화 함수
services/persistence.ts       — 저장/로드 (league_pick_assets 파라미터)
hooks/useGameData.ts          — 상태 관리
views/FrontOfficeView.tsx     — UI (DraftPicksTab, PickTradeHistory)
components/AppRouter.tsx      — props 전달
```

---

## 설계 결정 사항

1. **하드코딩 vs DB**: 초기 거래 데이터는 `data/draftPickTrades.ts`에 하드코딩. DB 테이블(`meta_draft_pick_trades`) 방안도 검토했으나, 데이터 양이 적고 변하지 않는 메타데이터이므로 하드코딩 유지. 멀티시즌 전환 시 재검토.

2. **픽 거래 기록**: `Transaction` 하나에 선수+픽을 모두 포함하는 패키지 딜 구조 (`TradeDetails`). `PICK_TRADE` 별도 타입 대신 기존 `Trade` 타입의 details를 확장하여 분리된 2건이 되는 문제 방지.

3. **복수 픽 표시**: 같은 시즌-라운드에 여러 픽을 보유할 수 있으므로 (예: OKC 2026 1R × 5개), `Map<string, DraftPickAsset[]>`로 관리하고 각 픽을 독립된 행으로 표시.
