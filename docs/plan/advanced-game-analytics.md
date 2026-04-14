# 고급 경기 분석 시각화 — Insights 탭 + Lineups 탭

## Context

사용자가 외부 농구 분석 툴의 고급 시각화(Insights + Lineups)를 보고, 우리 시뮬레이터에서도 동일한 수준의 경기 분석 자료를 만들 수 있는지 질문.

현재 PBP 엔진은 포세션 단위로 모든 이벤트를 생성하고 있어 데이터 자체는 풍부하지만, **경기별 ORTG/DRTG**, **쿼터별 효율**, **5인 라인업 조합 추적**은 아직 없음. 차트 라이브러리 없이 모든 시각화를 커스텀 SVG/CSS로 구현하는 프로젝트 패턴을 따름.

**목표**: GameResultView에 "인사이트" + "라인업" 2개 탭 추가

---

## Phase 1: 데이터 레이어 (엔진 수정)

### 1-1. 새 타입 추가 — `types/engine.ts`

```typescript
// SimulationResult 아래에 추가

/** 포세션 이벤트 (WP 차트 마커용) */
export interface PossessionEvent {
    elapsedSeconds: number;  // 0~2880
    teamId: string;
    type: 'score' | 'miss' | 'turnover' | 'foul';
    points: number;
    homeScore: number;
    awayScore: number;
}

/** 팀 단위 고급 스탯 */
export interface TeamAdvancedStats {
    possessions: number;
    points: number;
    ortg: number;
    drtg: number;
    nrtg: number;
    pace: number;
    avgPossTime: number;
}

/** 쿼터별 효율 */
export interface QuarterAdvancedStats {
    quarter: number;
    possessions: number;
    points: number;
    ortg: number;
    drtg: number;
    nrtg: number;
}

/** 5인 라인업 조합 */
export interface LineupCombination {
    playerIds: string[];
    playerNames: string[];
    teamId: string;
    possessions: number;
    points: number;
    pointsAgainst: number;
    totalSeconds: number;
    ortg: number;
    drtg: number;
    nrtg: number;
}

/** 경기 고급 분석 데이터 번들 */
export interface GameAdvancedData {
    homeAdvanced: TeamAdvancedStats;
    awayAdvanced: TeamAdvancedStats;
    homeQuarterStats: QuarterAdvancedStats[];
    awayQuarterStats: QuarterAdvancedStats[];
    possessionEvents: PossessionEvent[];
    lineups: LineupCombination[];
}
```

`SimulationResult`에 `advancedData?: GameAdvancedData` 추가 (하위호환).

### 1-2. GameState 확장 — `services/game/engine/pbp/pbpTypes.ts`

GameState에 라이브 추적 필드 추가:

```typescript
// GameState에 추가할 필드들
lineupTracker: {
    combos: Map<string, { playerIds: string[]; playerNames: string[]; teamId: string; possessions: number; points: number; pointsAgainst: number; fga: number; fta: number; tov: number; offReb: number; startSecond: number; totalSeconds: number }>;
    currentHomeKey: string;
    currentAwayKey: string;
};
quarterStats: {
    home: [QuarterStatAccum, QuarterStatAccum, QuarterStatAccum, QuarterStatAccum];
    away: [QuarterStatAccum, QuarterStatAccum, QuarterStatAccum, QuarterStatAccum];
};
possessionEvents: PossessionEvent[];
possessionCount: { home: number; away: number };
```

### 1-3. 추적 모듈 생성 — `services/game/engine/pbp/advancedTracker.ts` (신규)

- `getLineupKey(team)` — onCourt 5인 playerId 정렬 후 `|` join
- `updateLineupKeys(state)` — 라인업 변경 감지, 이전 stint 시간 닫기 + 새 stint 열기
- `recordPossession(state, offSide, result)` — 라인업 스탯, 쿼터 스탯, 포세션 이벤트, 포세션 카운트 일괄 기록
- `computeAdvancedData(state)` — 게임 종료 시 Map → 배열 변환, ORTG/DRTG/NRTG/Pace 계산

### 1-4. 엔진 훅 — `services/game/engine/pbp/liveEngine.ts`

**`createGameState()`** (L209 뒤): 새 필드 초기화 + `updateLineupKeys(state)` 호출

**`stepPossession()`** (L346 `applyPossessionResult` 뒤):
```
const offSide = state.possession === 'home' ? 'home' : 'away'; // 포세션 전환 전에 캡처!
// ⚠️ 주의: offSide는 L308의 offTeam 판별과 동일 시점이어야 함
//    applyPossessionResult 이후, 포세션 스왑(L397) 이전에 호출
recordPossession(state, offSide, result);
```

**교체 후** (L379 `checkAndApplyRotation` 뒤): `updateLineupKeys(state)` 호출

**`extractSimResult()`** (L547 return 전): `advancedData: computeAdvancedData(state)` 추가

### 1-5. CpuGameResult 확장 — `services/simulationService.ts`

`advancedData?: GameAdvancedData` 필드 추가 + mapping 코드에서 전달

---

## Phase 2: UI 컴포넌트

### 2-1. Insights 탭 — `components/game/tabs/GameInsightsTab.tsx` (신규)

**섹션 1: 팀 요약 테이블**
- 양팀 로고 + WIN PROB %, ORTG, DRTG, NRTG, AVG POSS, Pace
- 더 좋은 쪽 녹색/나쁜 쪽 빨간색 조건부 색상

**섹션 2: 쿼터별 브레이크다운**
- Q1~Q4 + 1ST HALF + 2ND HALF 행
- 양팀 ORTG · DRTG · NRTG 컬럼
- NRTG 양수=녹색, 음수=빨간색

**섹션 3: 강화된 WP 차트** (기존 ScoreGraph 패턴 확장)
- Area chart (그라데이션 fill, 중앙선 기준 위=원정/아래=홈)
- 포세션 마커 레이어: 득점(녹색 dash), 미스(회색 dash), 턴오버(빨간 dash)
- SVG 커스텀 (라이브러리 없음)

### 2-2. Lineups 탭 — `components/game/tabs/GameLineupsTab.tsx` (신규)

- 최소 출전 시간 필터 (기본 2:30)
- 팀별 섹션 (원정 → 홈 순서, 기존 패턴)
- 테이블: 5인 이름(포지션 뱃지) | MIN | ORTG | DRTG | NRTG
- 출전시간 내림차순 정렬
- NRTG 색상 코딩

### 2-3. GameResultView 통합 — `views/GameResultView.tsx`

```typescript
type ResultTab = 'BoxScore' | 'Insights' | 'Lineups' | 'ShotChart' | 'PbpLog' | 'Rotation' | 'Tactics';

const tabs = [
    { id: 'BoxScore', label: '박스스코어' },
    { id: 'Insights', label: '인사이트' },
    { id: 'Lineups', label: '라인업' },
    { id: 'ShotChart', label: '샷 차트' },
    { id: 'PbpLog', label: '중계 로그' },
    { id: 'Rotation', label: '로테이션' },
    { id: 'Tactics', label: '전술 분석' },
];
```

`advancedData` 존재 시에만 탭 표시 (하위호환).

---

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `types/engine.ts` | 6개 새 인터페이스 + SimulationResult 확장 |
| `services/game/engine/pbp/pbpTypes.ts` | GameState에 4개 필드 추가 |
| `services/game/engine/pbp/advancedTracker.ts` | **신규** — 라인업/쿼터/포세션 추적 + 최종 계산 |
| `services/game/engine/pbp/liveEngine.ts` | createGameState 초기화, stepPossession 훅, extractSimResult 확장 |
| `services/simulationService.ts` | CpuGameResult에 advancedData 추가 |
| `components/game/tabs/GameInsightsTab.tsx` | **신규** — 인사이트 패널 |
| `components/game/tabs/GameLineupsTab.tsx` | **신규** — 라인업 패널 |
| `views/GameResultView.tsx` | 탭 추가 + 데이터 전달 |

---

## 공식 참조

| 스탯 | 공식 |
|------|------|
| ORTG | `(팀득점 / 팀포세션) × 100` |
| DRTG | `(상대득점 / 팀포세션) × 100` |
| NRTG | `ORTG − DRTG` |
| Pace | `(홈포세션 + 원정포세션) / 2` |
| AVG POSS | `possessionTimeAccum.total / count` (초) |
| 라인업 ORTG | `(라인업득점 / 라인업포세션) × 100` |
| 라인업 DRTG | `(라인업실점 / 라인업포세션) × 100` |

---

## 검증 방법

1. **빌드 검증**: `npm run build` — 순환 임포트/타입 에러 없음 확인
2. **경기 시뮬**: 아무 경기 시뮬레이션 → GameResultView에서 "인사이트"/"라인업" 탭 클릭
3. **데이터 확인**: advancedData가 null이 아닌지, ORTG/DRTG 값이 합리적 범위(80~140)인지
4. **하위호환**: 기존 저장된 경기 결과에서 두 탭이 gracefully hidden인지
5. **CPU 경기**: "Around the League" 다른 경기 클릭 시에도 탭 정상 동작 확인
