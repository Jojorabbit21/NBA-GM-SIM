# 드래프트 로터리 시스템

NBA 2019+ 로터리 확률 시스템 구현.
14개 비플레이오프 팀에 역순위 가중 확률을 부여하고, 상위 4픽을 가중 랜덤 추첨, 나머지는 역순위 배정.

---

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `services/draft/lotteryEngine.ts` | 순수 함수 로터리 엔진 (React/DB 의존 없음) |
| `services/draft/draftOrderResolver.ts` | 로터리 결과 + 픽 자산 → 보호/스왑/소유권 반영된 60픽 드래프트 오더 생성 |
| `services/simulation/offseasonEventHandler.ts` | draftLottery 날짜 도달 시 로터리 실행 + resolveDraftOrder() 호출 + DraftLotteryView 진입, rookieDraft 날짜 도달 시 RookieDraftView 진입 |
| `views/DraftLotteryView.tsx` | 로터리 결과 애니메이션 UI (30→1 역순 공개) + 소유권/변동사항 표시 |
| `views/RookieDraftView.tsx` | 2라운드 루키 드래프트 UI — resolvedDraftOrder가 있으면 60픽 currentTeamId[] 사용 |
| `services/seasonArchive.ts` | `updateSeasonArchiveLottery()` — 시즌 아카이브에 로터리 결과 기록 |
| `utils/tiebreaker.ts` | 동률 팀 순위 결정 (로터리 역순위 정렬에 사용) |

---

## NBA 2019+ 확률 테이블

| 순위(역순) | 확률 | 가중치 (1000 조합) |
|-----------|------|-------------------|
| 1 (최악) | 14.0% | 140 |
| 2 | 14.0% | 140 |
| 3 | 14.0% | 140 |
| 4 | 12.5% | 125 |
| 5 | 10.5% | 105 |
| 6 | 9.0% | 90 |
| 7 | 7.5% | 75 |
| 8 | 6.0% | 60 |
| 9 | 4.5% | 45 |
| 10 | 3.0% | 30 |
| 11 | 2.0% | 20 |
| 12 | 1.5% | 15 |
| 13 | 1.0% | 10 |
| 14 (최고) | 0.5% | 5 |

---

## 타입 정의

### 로터리 엔진 (lotteryEngine.ts)

```typescript
interface LotteryTeamEntry {
    teamId: string;
    wins: number;
    losses: number;
    winPct: number;
    preLotteryRank: number;   // 1=최악 ~ 14=최고 (로터리 팀 중)
    lotteryWeight: number;    // 140, 140, ..., 5
    odds: number;             // 0~1 확률 (lotteryWeight / 1000)
}

interface PickMovement {
    teamId: string;
    preLotteryPosition: number;  // 원래 예상 순위 (1~30)
    finalPosition: number;       // 실제 순위 (1~30)
    jumped: boolean;             // top-4 추첨으로 상승했는지
}

interface LotteryResult {
    finalOrder: string[];              // 30팀 드래프트 순서 (index 0 = 1픽)
    lotteryTeams: LotteryTeamEntry[];  // 14팀 확률 정보
    playoffTeamIds: string[];          // 16팀 ID (15~30픽)
    pickMovements: PickMovement[];     // 순위 변동 정보 (UI용)
    top4Drawn: string[];               // 추첨으로 결정된 상위 4팀
}
```

### 드래프트 오더 해석기 (draftOrderResolver.ts)

`types/draftAssets.ts`에 정의됨.

```typescript
interface ResolvedPick {
    pickNumber: number;       // 1~60
    round: 1 | 2;
    originalTeamId: string;   // 이 슬롯을 결정한 팀 (전적 기준)
    currentTeamId: string;    // 실제 지명권자
    note?: string;            // "OKC 소유 (트레이드)", "보호 발동 → 2027 1R" 등
}

interface ProtectionResult {
    round: 1 | 2;
    originalTeamId: string;
    currentTeamId: string;
    slot: number;
    protection: PickProtection;
    triggered: boolean;
    fallbackAction?: string;  // "2027 1R로 이관" 등
}

interface SwapResult {
    round: 1 | 2;
    beneficiaryTeamId: string;
    originTeamId: string;
    beneficiarySlot: number;
    originSlot: number;
    swapped: boolean;
}

interface ResolvedDraftOrder {
    picks: ResolvedPick[];           // 60개
    protectionResults: ProtectionResult[];
    swapResults: SwapResult[];
    updatedPickAssets: LeaguePickAssets;  // fallback 이관 반영된 새 자산
}
```

---

## 알고리즘

### 1. 로터리 팀 식별 (`identifyLotteryTeams`)

`playoffSeries`에서 `round >= 1`에 등장한 팀 = 플레이오프 팀 (16팀).
나머지 = 로터리 팀 (14팀, 플레이인 패자 포함).

### 2. 확률 배정 (`assignLotteryOdds`)

- 로터리 팀을 역순위 정렬 (최악 팀 = index 0)
- 타이브레이커: `createTiebreakerComparator()` 사용 (승률 → 상대전적 → 컨퍼런스 승률 → 점수차)
- 각 팀에 `LOTTERY_WEIGHTS[i]` 배정

### 3. 상위 4픽 추첨 (`drawLotteryPicks`)

1000개 슬롯 배열 생성 (각 팀 weight만큼 반복 배치).
비복원 추출 4회: 랜덤 인덱스 → 해당 팀 당첨 → 해당 팀의 모든 슬롯 제거 → 반복.

### 4. 5~14픽 역순위 배정 (`assignRemainingLotteryPicks`)

top-4에 뽑히지 않은 로터리 팀을 `preLotteryRank` 오름차순으로 배정.
최악 팀(rank 1)이 top-4 탈락 시 자동 5픽 (4칸 하락 제한 자연 충족).

### 5. 15~30픽 플레이오프 팀 (`orderPlayoffTeams`)

- 조기 탈락 팀이 높은 픽 (15픽에 가까움)
- 같은 라운드에서 탈락한 팀끼리는 역순위 (나쁜 성적이 높은 픽)
- 챔피언 = 30픽 (최하위 픽)

---

## 드래프트 오더 해석 (`resolveDraftOrder`)

로터리 결과(30팀 `finalOrder`) + 리그 픽 자산(`LeaguePickAssets`) → 보호/스왑/소유권 반영된 최종 60픽 드래프트 오더 생성.

### 입력
- `finalOrder: string[]` — 로터리 엔진 결과 (30팀, index=슬롯-1)
- `pickAssets: LeaguePickAssets` — 리그 전체 픽 소유 현황
- `draftSeason: number` — 현재 드래프트 시즌 (예: 2026)

### 처리 순서 (1라운드 + 2라운드 동일 로직)

**1단계: 보호 조건 판정**
- `originalTeamId ≠ currentTeamId`이고 `protection`이 있는 픽 탐색
- 각 픽의 `originalTeamId` 슬롯 위치 확인
- `type='top'`, `threshold=N`: 슬롯 ≤ N → 보호 발동 (픽 원래 팀 잔류)
- `type='lottery'`: 슬롯 ≤ 14 → 보호 발동
- `type='none'`: 무조건 conveyed
- 보호 발동 시: `fallbackSeason`+`fallbackRound` → 해당 시즌/라운드 픽으로 이관, 없으면 픽 소멸

**2단계: 스왑 권리 실행**
- `swapRight`가 있는 픽 탐색
- `beneficiary` 슬롯 > `origin` 슬롯 → 스왑 실행
- 보호 발동으로 원래 팀에 잔류한 픽은 스왑 대상 제외

**3단계: 최종 60픽 오더 생성**
- 1라운드: `finalOrder` 순서 (index 0 = 1픽)
- 2라운드: `finalOrder` 역순 (index 0 = 31픽)
- 각 슬롯의 `currentTeamId` = 보호/스왑/트레이드 반영 후 실제 지명권자

---

## 트리거 흐름

```
파이널 종료
  → detectFinalsEnd() → offseasonPhase = 'POST_FINALS'
  → archiveCurrentSeason() (W/L 아직 보존 상태)

오프시즌 날짜 진행 (매일 rest-day)
  → dispatchOffseasonEvent()
  → currentDate >= keyDates.draftLottery && offseasonPhase === 'POST_FINALS'
  → runLotteryEngine() 실행
  → resolveDraftOrder(finalOrder, leaguePickAssets, draftSeason) 실행
  → blocked: true, navigateTo: 'DraftLottery'
  → lotteryResult + resolvedDraftOrder 저장 (saves.lottery_result JSONB에 내장)
  → updatedPickAssets → leaguePickAssets 상태 업데이트
  → offseasonPhase = 'POST_LOTTERY'

DraftLotteryView
  → 30→1 역순 애니메이션 (400ms 간격)
  → 확률%, 순위 변동(▲/▼), WINNER 뱃지 표시
  → 권리행사 팀 + 변동사항 표시 (resolvedDraftOrder 기반)
  → "확인" 클릭 → Dashboard 복귀

인박스 LOTTERY_RESULT 메시지
  → 테이블 컬럼: 픽 | 팀 | 권리행사 | 변동사항 | 성적 | 확률 | 변동
  → currentTeamId ≠ originalTeamId이면 권리행사 컬럼에 실제 지명권자 표시
  → pickNote에 보호/스왑/트레이드 변동사항 표시

오프시즌 날짜 계속 진행
  → currentDate >= keyDates.rookieDraft && offseasonPhase === 'POST_LOTTERY'
  → blocked: true, navigateTo: 'DraftRoom'
  → AppRouter: prospects + lotteryResult 존재 → RookieDraftView 렌더링

RookieDraftView (2라운드 × 30팀 = 60픽)
  → resolvedDraftOrder.picks → 60픽 currentTeamId[] 기반 드래프트
  → fallback: resolvedDraftOrder 없으면 generateSnakeDraftOrder() 사용
  → CPU: BPA 자동픽 (600ms 딜레이), 유저: 수동 + 30초 타이머
  → "확인" 클릭 → handleRookieDraftComplete()
    → DB: markAsDrafted() (각 픽)
    → 런타임: 루키 → 팀 로스터 추가, 미드래프트 → FA 풀
    → offseasonPhase = 'POST_DRAFT'
    → Dashboard 복귀
```

---

## 저장 위치

| 저장소 | 컬럼 | 설명 |
|--------|------|------|
| `saves` | `lottery_result` (JSONB) | 현재 시즌 로터리 결과 + `resolvedDraftOrder` 내장 (1건, 덮어쓰기) |
| `user_season_history` | `lottery_result` (JSONB) | 시즌별 아카이브 (히스토리 보존) |

`resolvedDraftOrder`는 `lottery_result` JSONB 내에 내장 저장됨 (DB 스키마 변경 불필요).
체크포인트 복원 시 `lottery_result.resolvedDraftOrder`에서 추출.

---

## 엣지 케이스

| 상황 | 처리 |
|------|------|
| 전 팀 0-0 (판타지 드래프트) | 커스텀 모드에서는 로터리 미사용 — 단순 Fisher-Yates 셔플 |
| playoffSeries 비어있음 | 30팀 전체 균등 가중치 로터리로 fallback |
| 팀 수 ≠ 14 | 균등 가중치(`1000 / teamCount`) 배분 |
| 배치 시뮬 중 로터리 날짜 | 배치 시뮬은 파이널 종료 시 자동 중단, 오프시즌은 daily 진행에서 처리 |

---

## UI (DraftLotteryView)

### 2컬럼 레이아웃
- 좌측: 1~15픽 (로터리 팀 + 15픽)
- 우측: 16~30픽 (플레이오프 팀) + "Playoff Teams" 구분선

### 카드 정보 (lotteryMetadata 있을 때)
- 픽 번호 + 팀 로고 + 팀명
- 권리행사 팀: `currentTeamId ≠ originalTeamId`일 때 `→ 팀명` 표시
- 변동사항: 보호 발동/스왑/트레이드 노트 표시
- 전적 (W-L) — 로터리 팀만
- 확률(%) — 로터리 팀만
- 순위 변동: ▲N (emerald) / ▼N (red) — 로터리 팀만
- WINNER 뱃지: top-4 추첨 당첨 + jumped 팀
- 내 팀 하이라이트: ring-2 ring-indigo-500

### 인박스 LOTTERY_RESULT 테이블
- 컬럼 순서: `픽 | 팀 | 권리행사 | 변동사항 | 성적 | 확률 | 변동`
- 권리행사: 로고 + 팀명 (amber 색상, currentTeamId ≠ teamId일 때만)
- 변동사항: pickNote 텍스트 (amber 색상)

### 애니메이션
- 30→1 역순 공개 (400ms 간격, 첫 딜레이 800ms)
- scale(0.95→1) + opacity(0.12→1) 트랜지션
- auto-scroll to last revealed
