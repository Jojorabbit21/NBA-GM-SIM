# Draft Agent Context

> 이 문서는 Draft 전담 에이전트가 작업 시 참조해야 할 **전체 컨텍스트**를 담고 있습니다.
> 모든 드래프트 관련 작업 (UI, 시스템, AI, 저장) 시 이 문서를 먼저 읽을 것.

---

## 1. 현재 상태 요약

| 영역 | 상태 | 비고 |
|------|------|------|
| **UI 컴포넌트** | ✅ 구현 완료 | 6개 파일, 디자인 고도화 진행 중 |
| **Draft 타입** | ❌ 미구현 | `types/draft.ts` 필요 |
| **Draft 엔진** | ❌ 미구현 | `services/draft/draftEngine.ts` 필요 |
| **CPU AI 알고리즘** | ❌ 미구현 | `services/draft/cpuDraftAI.ts` 필요 |
| **DB 저장/복원** | ❌ 미구현 | persistence + stateReplayer 수정 필요 |
| **Hook 통합** | ❌ 미구현 | useGameData.ts 수정 필요 |
| **앱 라우팅** | ⚠️ 부분 | AppRouter에 DraftRoom 존재, 실제 플로우 미연결 |

---

## 2. 파일 맵

### 구현 완료 (UI)

| 파일 | 역할 | 주요 Exports |
|------|------|-------------|
| `views/FantasyDraftView.tsx` | 컨테이너 뷰 (전체화면 오버레이) | `FantasyDraftView`, `POSITION_COLORS` |
| `components/draft/DraftHeader.tsx` | 방송 스타일 헤더 배너 | `DraftHeader` |
| `components/draft/DraftBoard.tsx` | 15라운드×30팀 Transposed 그리드 보드 | `DraftBoard`, `BoardPick` |
| `components/draft/PlayerPool.tsx` | 선수 풀 (검색/정렬/드래프트) | `PlayerPool` |
| `components/draft/PickHistory.tsx` | 지명 히스토리 사이드바 | `PickHistory` |
| `components/draft/MyRoster.tsx` | 내 로스터 슬롯 표시 | `MyRoster` |

### 미구현 (생성 필요)

| 파일 | 역할 |
|------|------|
| `types/draft.ts` | DraftPick, DraftState, GmProfile 타입 |
| `services/draft/draftEngine.ts` | 드래프트 핵심 로직 (순서 생성, 상태 진행) |
| `services/draft/cpuDraftAI.ts` | CPU 팀 AI 지명 알고리즘 |

### 수정 필요 (기존 파일)

| 파일 | 변경 내용 |
|------|-----------|
| `services/persistence.ts` | saveCheckpoint에 draft_state 파라미터 추가 |
| `services/stateReplayer.ts` | applyFantasyDraft 함수 + FantasyDraft 트랜잭션 핸들러 |
| `hooks/useGameData.ts` | draftState 상태 + init/pick/finalize 함수 |
| `types/trade.ts` | TransactionType에 'FantasyDraft' 추가 |
| `components/AppRouter.tsx` | DraftRoom 라우팅 이미 존재 (확인만) |

### 레거시 (무시)

| 파일 | 비고 |
|------|------|
| `views/DraftView.tsx` | Dead code. Gemini AI 스카우팅 리포트 방식. 사용 안 함 |

### 마스터 플랜 문서

| 파일 | 비고 |
|------|------|
| `docs/fantasy-draft-plan.md` | ~980줄 종합 설계 문서 (타입, 엔진, AI, 저장, UI, 구현 로드맵) |

---

## 3. 게임 플로우

### 현재 (드래프트 없음)
```
AuthView → TeamSelectView → OnboardingView → Dashboard
```

### 목표 (드래프트 포함)
```
AuthView → TeamSelectView → FantasyDraftView (전체화면) → OnboardingView → Dashboard
```

- 팀 선택 = 팀 아이덴티티만 선택 (로스터는 비어있음)
- 드래프트 완료 → auto-tactics 생성 → Onboarding 진입
- 중간 종료 → 재로그인 시 draft_state.status === 'in_progress' → 드래프트 재개

---

## 4. Snake Draft 시스템

### 순서 생성
```typescript
// 30팀 × 15라운드 = 450픽 (실제 선수 445명이므로 마지막 5픽은 빈 풀)
function generateSnakeDraftOrder(teamIds: string[], rounds: number): string[] {
    const order: string[] = [];
    for (let r = 0; r < rounds; r++) {
        const ids = r % 2 === 0 ? [...teamIds] : [...teamIds].reverse();
        order.push(...ids);
    }
    return order;
}
// 홀수 라운드(1,3,5...): 정순 →
// 짝수 라운드(2,4,6...): 역순 ←
```

### 현재 구현 상태
- `FantasyDraftView.tsx`에 인라인으로 구현됨
- CPU 픽: **Best OVR Available** (순서대로 1등부터 선택, AI 로직 없음)
- CPU 개별 픽: `CPU_PICK_DELAY`(800ms) 간격으로 순차 진행 (useEffect 체인)
- handleSkipToMyTurn(): 유저 턴까지 CPU 일괄 지명 (건너뛰기)
- handleDraft(): 유저 수동 지명
- 타이머: 30초 카운트다운, 유저 타임아웃 시 BPA 자동 지명

---

## 5. CPU AI 알고리즘 설계 (미구현)

> 상세 설계: `docs/fantasy-draft-plan.md` 참조

### GM 성격 시스템 (6종)

| 성격 | 비율 | 핵심 행동 |
|------|------|-----------|
| Balanced | 30% | 중립 BPA + 적당한 니드 가중 |
| Win-Now | 20% | 높은 OVR 우선, 나이 무시 |
| Youth-Builder | 15% | 25세 이하 선호 |
| Defense-First | 15% | 수비 아키타입 우선 (rimProtector, perimLock) |
| Offense-First | 10% | 공격 아키타입 우선 (spacer, handler, isoScorer) |
| Star-Hunter | 10% | OVR 85+ 올인, 이후 BPA |

### 종합 점수 공식
```
DraftScore = (OVR_Score × ovrW) + (Age_Score × ageW) + PosNeed + ArchNeed + PersonalityBonus + Noise
```

#### 각 요소 상세

**OVR Score** (비선형): `(ovr/99)² × 100`
- 95 → 92점, 90 → 83점, 80 → 65점, 70 → 50점

**Age Score**:
- ≤22: +12, ≤25: +8, ≤28: +5, ≤30: +2, ≤33: -3, >33: -8

**Position Need** (목표: 포지션당 3명):
```
deficit = TARGET[pos] - current_count[pos]
roundMultiplier = 1 + (round - 1) × 0.15
score = deficit > 0 ? deficit × 4 × roundMultiplier : -5
```

**Archetype Need** (12종 아키타입):
- handler, spacer, driver, rimProtector, perimLock, rebounder, roller, postScorer, isoScorer, connector, screener, popper
- 각 아키타입 MIN/IDEAL 목표치 기반 보너스

**Noise** (라운드 의존):
```
range = 6 × (1 + (round-1) × 0.1)
// R1: ±6, R8: ±10.2, R15: ±14.4
```

**최종 선택**: Top 3를 50%/30%/20% 가중 랜덤

### Hard Floor Rule (R11+)
- 남은 픽 수 ≤ 빈 포지션 수 → 해당 포지션 강제 지명

---

## 6. 데이터 저장/복원 설계 (미구현)

### DB 변경
```sql
ALTER TABLE saves ADD COLUMN IF NOT EXISTS draft_state JSONB DEFAULT NULL;
```

### 타입 정의
```typescript
// types/draft.ts
interface DraftPick {
    round: number;        // 1-15
    pickNumber: number;   // 1-450 (전체 순번)
    teamId: string;
    playerId: string;
    playerName: string;
}

interface DraftState {
    status: 'in_progress' | 'completed';
    currentPickIndex: number;  // 0-449
    draftOrder: string[];      // 450개 팀ID (snake)
    picks: DraftPick[];
    availablePlayerIds: string[];
    userTeamId: string;
}
```

### 저장 흐름
```
유저 지명 → draftState 업데이트 → saveCheckpoint(..., draftState)
드래프트 완료 → saveDraftCompletion(draftState)
  → saves.draft_state.status = 'completed'
  → user_transactions에 'FantasyDraft' 트랜잭션 기록
```

### 복원 흐름
```
로그인 → loadCheckpoint()
  → draft_state.status === 'in_progress' → FantasyDraftView로 복원
  → draft_state.status === 'completed' → replayGameState()
    → applyFantasyDraft(teams, picks) : 로스터 클리어 → 픽 순서대로 배정
```

### stateReplayer 추가 함수
```typescript
function applyFantasyDraft(teams: Team[], picks: DraftPick[]) {
    // 1. 전체 선수 맵 빌드 (클리어 전)
    const playerMap = new Map<string, Player>();
    teams.forEach(t => t.roster.forEach(p => playerMap.set(p.id, p)));

    // 2. 모든 로스터 클리어
    teams.forEach(t => t.roster = []);

    // 3. 픽 순서대로 재배정
    picks.forEach(pick => {
        const player = playerMap.get(pick.playerId);
        const team = teams.find(t => t.id === pick.teamId);
        if (player && team) team.roster.push(player);
    });
}
```

---

## 7. UI 현황 및 진행 중인 개선

### 레이아웃 구조
```
┌─────────────────────────────────────────────┐
│ DraftHeader (방송 스타일 배너)                │
├─────────────────────────────────────────────┤
│ DraftBoard (30×15 그리드, 리사이즈 가능)      │
│                                             │
├═══════════ 드래그 디바이더 ═══════════════════┤
│ PickHistory │ PlayerPool      │ MyRoster     │
│ (25%)       │ (flex-1)        │ (25%)        │
└─────────────────────────────────────────────┘
```

### 드래프트 UI 전역 규칙

1. **한글 버전** — 모든 레이블/버튼 한글 사용
2. **Pretendard 폰트** — FantasyDraftView 컨테이너에 `.pretendard` 클래스 적용
3. **다크 테마** — `bg-slate-950` 기반
4. **모달 최소화** — 필요 시 사용자 지시에 따름

### 타이머 시스템

- **턴당 제한 시간**: 30초 (유저, AI 모두 동일)
- **상수**: `PICK_TIME_LIMIT = 30` (DraftHeader.tsx에서 export)
- **CPU 픽 딜레이**: `CPU_PICK_DELAY = 800ms` (개별 CPU 픽 간격)
- **타이머 리셋**: `currentPickIndex` 변경 시 자동 리셋
- **유저 타임아웃**: 시간 만료 시 BPA 자동 지명
- **CPU 턴 흐름**: 개별 픽이 800ms 간격으로 순차 진행 (건너뛰기 시 일괄)

### DraftHeader 레이아웃

```
┌───────────────────────────────────────────────────────────────────┐
│ (배경: 현재 픽 팀 primary color + dark overlay)                     │
│                                                                   │
│ [←] 드래프트 룸          00:30          3픽 후 Lakers 차례입니다   │
│    현재 차례 🏀 팀명    1라운드 #1픽         [내 차례까지 건너뛰기] │
│                                                                   │
│ ═══════════════════════════════════ (타이머 프로그레스 바, 파란색)  │
└───────────────────────────────────────────────────────────────────┘
```

- **배경**: 현재 픽 팀의 `colors.primary` + `bg-black/40` 오버레이 + 팀 로고 워터마크
- **하단 보더**: 남은 시간 프로그레스 바 (`bg-blue-500`, 3px)
- **상단 보더라인 없음**
- **좌측**: `[←] 드래프트 룸` + `현재 차례 [로고] [팀명]`
- **중앙**: `00:30` (대형 모노 타이머) + `N라운드 #M픽`
- **우측 (CPU 턴)**: `N픽 후 [팀명] 차례입니다` + `[내 차례까지 건너뛰기]`
- **우측 (유저 턴)**: `내 차례입니다!` (emerald, animate-pulse)

### 디자인 시스템 (드래프트 공용)

**포지션 컬러**:
| Position | Color | Hex |
|----------|-------|-----|
| PG | Cyan | `#22d3ee` |
| SG | Emerald | `#34d399` |
| SF | Amber | `#fbbf24` |
| PF | Rose | `#fb7185` |
| C | Violet | `#a78bfa` |

**OVR 등급 컬러**:
| 등급 | 컬러 | Hex |
|------|-------|-----|
| 90+ | Fuchsia | `#f0abfc` |
| 85+ | Blue | `#93c5fd` |
| 80+ | Emerald | `#6ee7b7` |
| 75+ | Amber | `#fcd34d` |
| 70+ | Slate | `#94a3b8` |
| <70 | Stone | `#78716c` |

**팀 테마**: `getTeamTheme(teamId, colors)` → `{bg, text, accent}` / `getButtonTheme()` → `{bg, text, glow}`

### UI 개선 진행 상황

**완료된 항목**:
- [x] 포지션 컬러 시스템 전체 적용
- [x] 팀 테마 연결 (헤더, 버튼, 보드)
- [x] DraftHeader: 팀 컬러 배경 + 30초 타이머 + 프로그레스 바 + 건너뛰기
- [x] DraftBoard: Transposed 레이아웃 + 풀 컬러 셀 + 유저 컬럼 강조
- [x] PlayerPool: 포지션 필터 컬러 + 팀 테마 DRAFT 버튼
- [x] PickHistory: 포지션 배지 + OvrBadge + 팀 로고
- [x] MyRoster: 포지션 도트/라벨 + 프로그레스 바
- [x] 30초 턴 타이머 시스템 (CPU 개별 픽 + 유저 타임아웃 자동 지명)
- [x] Pretendard 폰트 적용 (FantasyDraftView 컨테이너)
- [x] 한글 UI 적용 (헤더 레이블)

**미완료 (레퍼런스 UI 분석 기반 개선점)**:
- [x] DraftBoard 테이블 Transpose: 컬럼=팀, 로우=라운드 (Sleeper 스타일)
- [x] DraftBoard 셀: border-l-2 → 포지션 컬러 풀 배경 + 좌측 3px 포지션 보더
- [x] Snake 방향 화살표 (→/←) 라운드 행 레이블에 표시
- [x] OVR 수치 제거, 선수 이름만 표시 (포지션 컬러로 구분)
- [x] 셀 크기 + 폰트 사이즈 확대
- [x] 팀 컬럼 헤더에서 로고 제거 (팀명만)
- [ ] PlayerPool 필터에 포지션 제한 카운트 (`PG 1/3`)
- [ ] MyRoster에 포지션별 제한 요약 섹션

### 레퍼런스 UI 학습 결과 (Sleeper, FantasyPros)

**Sleeper (모바일/데스크탑)**:
- 셀에 포지션 컬러 풀 배경 (border가 아닌 전체 배경색)
- 빈 셀에 `{r}.{p}` 형태 픽 번호 표시
- Snake 방향 화살표 (→/←) 라운드 헤더에
- 유저 컬럼 "You" 골드 하이라이트
- 대형 디지털 타이머 (멀티플레이어용)
- "Last Pick" 알림 텍스트
- Recent Picks 수평 스트립

**FantasyPros 스타일**:
- 필터 버튼에 포지션 제한 카운트 (`RB 7/2`)
- Top Picks 사이드바 (Floor/Cons/Projected/Ceiling)
- Queue 시스템 (선호 선수 대기열)
- Auto-Pick 토글

---

## 8. 선수 데이터 구조

```typescript
interface Player {
    // 기본
    id, name, position, age, height, weight

    // 계약
    salary, contractYears, health

    // 6대 카테고리 (요약 레이팅)
    ins, out, plm, def, reb, ath

    // 40+ 세부 어트리뷰트 (base_attributes JSONB)
    closeShot, midRange, threeCorner, three45, threeTop, ft,
    layup, dunk, postPlay, drawFoul, hands,
    passAcc, handling, spdBall, passVision, passIq,
    intDef, perDef, steal, blk, helpDefIq, defConsist, passPerc,
    offReb, defReb,
    speed, agility, strength, vertical, stamina, hustle, durability,
    intangibles, potential

    // 계산됨
    ovr (deprecated → calculatePlayerOvr(player) 사용)
}
```

**OVR 계산**: `utils/ovrUtils.ts` → 포지션별 가중 평균 (`utils/overallWeights.ts`)
- 각 포지션(PG/SG/SF/PF/C)마다 35+ 어트리뷰트에 다른 가중치 적용
- 순수 함수: `calculateOvr(attributes, position): number` (40-99 범위)

---

## 9. 445 vs 450 문제

- 30팀 × 15라운드 = 450픽
- 실제 선수 445명
- **해결**: availablePlayerIds가 빈 배열이면 드래프트 조기 종료
- 마지막 5팀은 14명 로스터 (현실적)
- Snake 순서상 마지막 짧은 팀은 초반 순번 팀들

---

## 10. 구현 우선순위 (5단계)

### Phase 1: 타입 & 엔진
1. `types/draft.ts` 생성
2. `services/draft/draftEngine.ts` 생성
   - generateSnakeDraftOrder, createDraftPool, clearAllRosters
   - initDraftState, advanceDraft

### Phase 2: CPU AI
3. `services/draft/cpuDraftAI.ts` 생성
   - GM 성격 시스템 + 종합 점수 공식
   - assignGmProfiles, cpuSelectPlayer
   - Hard Floor 규칙

### Phase 3: 저장/복원
4. DB migration (saves 테이블에 draft_state 컬럼)
5. `services/persistence.ts` 수정 (saveCheckpoint + saveDraftCompletion)
6. `services/stateReplayer.ts` 수정 (applyFantasyDraft)
7. `types/trade.ts` 수정 (TransactionType에 'FantasyDraft')

### Phase 4: 상태 관리
8. `hooks/useGameData.ts` 수정
   - draftState 상태 추가
   - initializeDraftMode, handleDraftPick, finalizeDraft

### Phase 5: 통합
9. `App.tsx` / `AppRouter.tsx` 플로우 연결
   - TeamSelect → FantasyDraft → Onboarding
10. `FantasyDraftView.tsx`를 실제 서비스 레이어와 연결
    - 로컬 상태 → useGameData의 draftState로 교체
    - handleDraft → gameData.handleDraftPick
    - handleFastForward → cpuDraftAI 활용

### UI 개선 (병렬 진행 가능)
- DraftBoard 셀 디자인 개선
- 빈 셀 번호 표시
- 포지션 제한 카운트

---

## 11. 멀티플레이어 확장 포인트

현재 싱글플레이어 구조지만 멀티플레이어 전환을 고려한 설계:

- `DraftController` 인터페이스 추상화 (local vs server)
- 현재 FantasyDraftView는 로컬 상태 기반 → 서버 기반으로 전환 시 WebSocket/SSE 연결
- draft_state가 서버 중앙 관리로 이동
- CPU AI는 서버사이드에서 실행
- 실시간 픽 브로드캐스트 (Supabase Realtime 활용)

---

## 12. 작업 시 주의사항

1. **OVR 계산**: 항상 `calculatePlayerOvr(player)` 사용. `player.ovr` 직접 접근 금지 (deprecated)
2. **디자인 시스템**: `docs/design-system.md` 준수 (다크 테마, 인디고 액센트, oswald 헤더)
3. **Dead Code**: `DraftView.tsx`는 레거시. 참조하지 말 것
4. **드래프트 픽 트레이드**: 현재 설계에서 불가 (선수만 트레이드 가능)
5. **선수 정렬**: stableSort — OVR 내림차순, 동점 시 ID 오름차순 (결정론적)
6. **포지션 컬러**: `POSITION_COLORS` 맵은 `FantasyDraftView.tsx`에서 export
7. **팀 데이터**: `TEAM_DATA` from `data/teamData.ts` — 30개 팀 정보
