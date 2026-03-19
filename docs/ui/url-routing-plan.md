# URL 라우팅 전환 계획

> 마지막 업데이트: 2026-03-19 (전체 View props 분석 기반 파라미터 경우의 수 완전 정리)

## 배경

### 현재 상태
- 라우터 라이브러리 없이 `useState<AppView>`로 29개 뷰를 전환하는 단일뷰 SPA
- URL은 항상 `/` 고정
- `App.tsx` → `setView` → `AppRouter.tsx` (switch문) → View 컴포넌트

### 문제점
- 새로고침하면 무조건 Home으로 초기화
- 브라우저 뒤로가기/앞으로가기 불가 (유저가 사이트에서 이탈)
- 딥링크/북마크 불가
- 개발 중 특정 뷰로 직접 이동 불가
- Analytics에서 페이지별 유저 행동 추적 불가
- 멀티플레이어 확장 시 초대 링크 등에 라우팅 필수

### 목표
`react-router-dom` v6 도입 → URL 경로 기반 라우팅 전환

---

## 현재 네비게이션 구조

```
App.tsx
  useState<AppView>('Home')    ← 기본 뷰는 'Home' (Dashboard 아님)
  setView() ──→ MainLayout
  │               ├── Sidebar    (onNavigate + onEditorClick props)
  │               ├── DashboardHeader
  │               └── AppRouter  (view + setView + draftPoolType props)
  │                     └── switch(view) → View 컴포넌트
  │
  [프로그래매틱 네비게이션]
  useEffect(sim.activeGame)       → setView('GameSim')
  useEffect(sim.lastGameResult)   → setView('GameResult')
  useEffect(sim.liveGameTarget)   → setView('LiveGame')
  useEffect(draftPicks 미완료)     → setView('DraftLottery')

  [인증 전 가드 (myTeamId 없을 때)]
  1단계: ModeSelectView          (rosterMode 선택)
  2단계: DraftPoolSelectView     (커스텀 모드일 때만)
  3단계: TeamSelectView          (팀 선택)

  [AppRouter 내부 — previousViewRef 기반 상세 뷰]
  handleViewPlayer(player) → previousViewRef 저장 → setView('PlayerDetail')
  handleViewCoach(teamId)  → previousViewRef 저장 → setView('CoachDetail')
  handleViewGM(teamId)     → previousViewRef 저장 → setView('GMDetail')
```

### AppView 타입 (29개)
```typescript
type AppView =
  // 인증/초기화 (5)
  | 'Auth' | 'TeamSelect' | 'Onboarding' | 'ModeSelect' | 'DraftPoolSelect'
  // 메인 (8)
  | 'Home' | 'Dashboard' | 'Roster' | 'Schedule' | 'Standings'
  | 'Leaderboard' | 'Transactions' | 'Playoffs'
  // 메인 기타 (5)
  | 'Help' | 'Inbox' | 'FrontOffice' | 'FAMarket' | 'HallOfFame'
  // 상세 (3)
  | 'PlayerDetail' | 'CoachDetail' | 'GMDetail'
  // 시뮬레이션 (3)
  | 'GameSim' | 'LiveGame' | 'GameResult'
  // 드래프트 (4)
  | 'DraftLottery' | 'DraftRoom' | 'DraftBoard' | 'DraftHistory';

type RosterMode = 'default' | 'custom';
type DraftPoolType = 'current' | 'alltime';
```

---

## URL 파라미터 경우의 수 분석 (전체 View)

각 View를 분석해 props를 세 가지로 분류한다.
- **URL params/query** — URL에 포함해 딥링크·새로고침 지원
- **context** — `useGame()` 훅으로 직접 접근 (props drilling 불필요)
- **location.state** — 대형 객체 또는 전환 시점에만 유효한 데이터

---

### 비보호 라우트 (인증/초기화)

#### AuthView (`/auth`)
```typescript
props: { onGuestLogin: () => void }
```
| 전달 방식 | props |
|---|---|
| context | (없음) |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onGuestLogin` → context의 `handleGuestLogin` |

---

#### ModeSelectView (`/mode-select`)
```typescript
props: { onSelectMode: (mode: RosterMode) => void }
```
| 전달 방식 | props |
|---|---|
| context | (없음) |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onSelectMode` → App state `setRosterMode` (context 경유) |

---

#### DraftPoolSelectView (`/draft-pool-select`)
```typescript
props: { onSelectPool: (pool: DraftPoolType) => void; onBack: () => void }
```
| 전달 방식 | props |
|---|---|
| context | (없음) |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onSelectPool` → context / `onBack` → `navigate(-1)` |

---

#### TeamSelectView (`/select-team`)
```typescript
props: { teams, isInitializing, onSelectTeam, onReload?, dataSource?, seasonShort? }
```
| 전달 방식 | props |
|---|---|
| context | `teams`, `isInitializing`, `dataSource`, `seasonShort` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onSelectTeam` → `handleSelectTeam` (context) / `onReload` → context |

---

#### OnboardingView (`/onboarding`)
```typescript
props: { team: Team; onComplete: () => void; seasonShort?: string }
```
| 전달 방식 | props |
|---|---|
| context | `team` (myTeam), `seasonShort` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onComplete` → `navigate('/')` |

---

### 보호 라우트 — 메인

#### HomeView (`/`)
```typescript
props: {
  team, teams, schedule, currentSimDate, unreadCount,
  offseasonPhase?, seasonShort?, userId?,
  onNavigate: (view: AppView) => void,
  onViewPlayer: (player, teamId?, teamName?) => void
}
```
| 전달 방식 | props |
|---|---|
| context | `team`, `teams`, `schedule`, `currentSimDate`, `unreadCount`, `offseasonPhase`, `seasonShort`, `userId` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onNavigate` → `useNavigate()` / `onViewPlayer` → `navigate('/player/${id}', { state: { player, teamId, teamName } })` |

---

#### DashboardView (`/dashboard`, `/dashboard?tab=rotation`)
```typescript
props: {
  team, teams, schedule, onSim, tactics, onUpdateTactics,
  currentSimDate?, isSimulating?, depthChart?, onUpdateDepthChart?,
  onForceSave?, tendencySeed?, onViewPlayer, userId?,
  onViewGameResult?, coachingData?,
  initialTab?: 'rotation'|'tactics'|'roster'|'records'|'opponent'|'schedule',
  onCoachClick?, seasonStartYear?
}
```
| 전달 방식 | props |
|---|---|
| context | `team`, `teams`, `schedule`, `currentSimDate`, `isSimulating`, `tactics`, `depthChart`, `tendencySeed`, `userId`, `coachingData`, `seasonStartYear` |
| **URL query** | `initialTab` → `?tab=rotation` (6가지: rotation/tactics/roster/records/opponent/schedule) |
| location.state | (없음) |
| 콜백 | `onSim`, `onUpdateTactics`, `onUpdateDepthChart`, `onForceSave` → context / `onViewPlayer` → `navigate('/player/...')` / `onViewGameResult` → `navigate('/result', { state })` / `onCoachClick` → `navigate('/coach/${id}')` |

---

#### RosterView (`/roster`, `/roster/:teamId`)
```typescript
props: {
  allTeams, myTeamId, initialTeamId?,
  tendencySeed?, onViewPlayer, schedule?,
  onViewGameResult?, userId?, coachingData?,
  onCoachClick?, onGMClick?,
  leaguePickAssets?, leagueGMProfiles?, userNickname?
}
```
| 전달 방식 | props |
|---|---|
| context | `allTeams`, `myTeamId`, `tendencySeed`, `schedule`, `userId`, `coachingData`, `leaguePickAssets`, `leagueGMProfiles`, `userNickname` |
| **URL params** | `initialTeamId` → `:teamId` (없으면 myTeamId 기본값) |
| location.state | (없음) |
| 콜백 | `onViewPlayer` → `navigate('/player/...')` / `onViewGameResult` → `navigate('/result', { state })` / `onCoachClick` → `navigate('/coach/${id}')` / `onGMClick` → `navigate('/gm/${id}')` |

---

#### ScheduleView (`/schedule`, `/schedule?month=YYYY-MM`)
```typescript
props: {
  schedule, teamId, teams, currentSimDate, userId,
  initialMonth?, onMonthChange?,
  onViewGameResult, calendarOnly?,
  onSpectateGame?, onStartUserGame?,
  isSimulating?, playoffSeries?, seasonStartYear?
}
```
| 전달 방식 | props |
|---|---|
| context | `schedule`, `teamId` (=myTeamId), `teams`, `currentSimDate`, `userId`, `isSimulating`, `playoffSeries`, `seasonStartYear` |
| **URL query** | `initialMonth` → `?month=YYYY-MM` |
| location.state | (없음) |
| 콜백 | `onViewGameResult` → `navigate('/result', { state })` / `onSpectateGame`, `onStartUserGame` → context sim 함수 |

---

#### StandingsView (`/standings`)
```typescript
props: { teams, schedule, onTeamClick: (id: string) => void }
```
| 전달 방식 | props |
|---|---|
| context | `teams`, `schedule` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onTeamClick` → `navigate('/roster/${id}')` |

---

#### LeaderboardView (`/leaderboard`, `/leaderboard?mode=...&stat=...&season=...`)
```typescript
props: {
  teams, schedule?, tendencySeed?,
  onViewPlayer, onTeamClick?,
  savedState?: LeaderboardFilterState,  // { mode, statCategory, sortConfig, activeFilters, selectedTeams, selectedPositions, searchQuery, seasonType, showHeatmap, currentPage, itemsPerPage }
  onStateChange?: (state: LeaderboardFilterState) => void
}
```
| 전달 방식 | props |
|---|---|
| context | `teams`, `schedule`, `tendencySeed` |
| **URL query** | `mode` (players/teams), `stat` (statCategory), `season` (regular/playoff) |
| location.state | `savedState` (LeaderboardFilterState 전체 — 페이지 복귀 시 복원. 복잡한 객체이므로 state 권장) |
| 콜백 | `onViewPlayer` → `navigate('/player/...')` / `onTeamClick` → `navigate('/roster/${id}')` |

> **참고**: `savedState`는 새로고침 시 복원이 필요 없으므로 `location.state`로 충분. URL query는 공유 가능한 기본 필터(모드·스탯·시즌)만.

---

#### TransactionsView (`/transactions`)
```typescript
props: {
  team, teams, setTeams, addNews, onShowToast,
  currentSimDate, transactions?, onAddTransaction?, onForceSave?,
  userId?, refreshUnreadCount?, tendencySeed?,
  onViewPlayer, userTactics?, setUserTactics?,
  leagueTradeBlocks?, setLeagueTradeBlocks?,
  leagueTradeOffers?, setLeagueTradeOffers?,
  leaguePickAssets?, setLeaguePickAssets?,
  leagueGMProfiles?, seasonConfig?
}
```
| 전달 방식 | props |
|---|---|
| context | `team`, `teams`, `currentSimDate`, `transactions`, `userId`, `tendencySeed`, `leagueTradeBlocks`, `leagueTradeOffers`, `leaguePickAssets`, `leagueGMProfiles`, `seasonConfig`, `userTactics` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `setTeams`, `setLeagueTradeBlocks`, `setLeagueTradeOffers`, `setLeaguePickAssets`, `setUserTactics`, `onForceSave`, `addNews`, `onShowToast`, `onAddTransaction`, `refreshUnreadCount` → 모두 context 경유 |

---

#### PlayoffsView (`/playoffs`)
```typescript
props: {
  teams, schedule, series, setSeries, setSchedule,
  myTeamId, userId?, onViewGameResult?
}
```
| 전달 방식 | props |
|---|---|
| context | `teams`, `schedule`, `series`, `myTeamId`, `userId` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `setSeries`, `setSchedule` → context setter / `onViewGameResult` → `navigate('/result', { state })` |

---

#### InboxView (`/inbox`)
```typescript
props: {
  myTeamId, userId, teams, onUpdateUnreadCount,
  tendencySeed?, onViewPlayer, onViewGameResult,
  onNavigateToHof, currentSimDate?, seasonShort?,
  onTeamOptionExecuted?, onNavigateToDraft?, onNavigateToDraftLottery?
}
```
| 전달 방식 | props |
|---|---|
| context | `myTeamId`, `userId`, `teams`, `currentSimDate`, `seasonShort`, `tendencySeed` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onUpdateUnreadCount` → context / `onViewPlayer` → `navigate('/player/...')` / `onViewGameResult` → `navigate('/result', { state })` / `onNavigateToHof` → `navigate('/hall-of-fame')` / `onNavigateToDraft` → `navigate('/rookie-draft')` / `onNavigateToDraftLottery` → `navigate('/draft-lottery')` / `onTeamOptionExecuted` → context |

---

#### HelpView (`/help`)
```typescript
props: { onBack: () => void }
```
| 전달 방식 | props |
|---|---|
| context | (없음) |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onBack` → `navigate(-1)` |

---

#### FrontOfficeView (`/front-office`)
```typescript
props: {
  team, teams, currentSimDate, myTeamId,
  coachingData?, onCoachClick?, onGMClick?,
  leaguePickAssets?, leagueGMProfiles?,
  userNickname?, seasonShort?
}
```
| 전달 방식 | props |
|---|---|
| context | `team`, `teams`, `currentSimDate`, `myTeamId`, `coachingData`, `leaguePickAssets`, `leagueGMProfiles`, `userNickname`, `seasonShort` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onCoachClick` → `navigate('/coach/${id}')` / `onGMClick` → `navigate('/gm/${id}')` |

---

#### FAView (`/fa-market`)
```typescript
props: {
  leagueFAMarket, faPlayerMap, myTeam, teams,
  tendencySeed, currentSeasonYear, currentSeason,
  onOfferAccepted, onReleasePlayer, onTeamOptionDecide,
  onExtensionOffer, onViewPlayer?
}
```
| 전달 방식 | props |
|---|---|
| context | `leagueFAMarket`, `faPlayerMap`, `myTeam` (=team), `teams`, `tendencySeed`, `currentSeasonYear`, `currentSeason` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onOfferAccepted`, `onReleasePlayer`, `onTeamOptionDecide`, `onExtensionOffer` → context 경유 / `onViewPlayer` → `navigate('/player/...')` |

---

#### HallOfFameView (`/hall-of-fame`)
```typescript
props: { currentUserId?, currentHofId?, onBack: () => void; seasonShort? }
```
| 전달 방식 | props |
|---|---|
| context | `currentUserId` (session.user.id), `currentHofId` (hofId), `seasonShort` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onBack` → `navigate(-1)` |

---

### 보호 라우트 — 상세 뷰

#### PlayerDetailView (`/player/:playerId`)
```typescript
props: {
  player: Player,        // ← 대형 객체
  teamName?: string,
  teamId?: string,
  allTeams?: Team[],
  tendencySeed?: string,
  seasonShort?: string,
  onBack: () => void
}
```
| 전달 방식 | props |
|---|---|
| context | `allTeams`, `tendencySeed`, `seasonShort` |
| **URL params** | `playerId` → `:playerId` |
| **location.state** | `player` (Player 객체 전체), `teamId`, `teamName` |
| 콜백 | `onBack` → `navigate(-1)` |

> **새로고침 처리**: `location.state` 없으면 `playerId`로 `context.teams.flatMap(t => t.roster).find(...)` 재조회.
> FA/방출 선수는 `context.freeAgents`에서 추가 탐색.
> 그래도 없으면 `navigate(-1)` fallback.

---

#### CoachDetailView (`/coach/:coachId`)
```typescript
props: { coach: HeadCoach; teamId: string; onBack: () => void }
```
| 전달 방식 | props |
|---|---|
| context | `coachingData` — `Object.values(coachingData).flatMap(s => [s.headCoach]).find(c => c?.id === coachId)`로 재조회 가능 |
| **URL params** | `coachId` → `:coachId` |
| location.state | `coach` (선택적 캐싱용 — 없으면 context에서 재조회) |
| 콜백 | `onBack` → `navigate(-1)` |

> **새로고침 처리**: coachId로 coachingData 전체 탐색하여 복원 가능. 어시스턴트 코치 추가 시에도 동일 패턴 사용.

---

#### GMDetailView (`/gm/:teamId`)
```typescript
props: { gmProfile: GMProfile; teamId: string; onBack: () => void }
```
| 전달 방식 | props |
|---|---|
| context | `leagueGMProfiles` — `leagueGMProfiles[teamId]`로 재조회 가능 |
| **URL params** | `teamId` → `:teamId` |
| location.state | `gmProfile` (선택적 캐싱용 — 없으면 context에서 재조회) |
| 콜백 | `onBack` → `navigate(-1)` |

> **새로고침 처리**: `context.leagueGMProfiles[teamId]`로 완전 복원 가능. state 없어도 안전.

---

### 시뮬레이션

#### GameSimulationView (오버레이 — URL 미변경)
```typescript
props: { homeTeam, awayTeam, userTeamId?, pbpLogs, pbpShotEvents?, onSimulationComplete? }
```
→ `sim.activeGame` 상태 기반 오버레이. URL 변경 없음.

---

#### LiveGameView (오버레이 — URL 미변경)
```typescript
props: { homeTeam, awayTeam, userTeamId, userTactics?, isHomeB2B?, isAwayB2B?, homeDepthChart?, awayDepthChart?, tendencySeed?, simSettings?, onGameEnd }
```
→ `sim.liveGameTarget` 상태 기반 오버레이. URL 변경 없음.

---

#### GameResultView (`/result`)
```typescript
props: {
  result: {
    home, away, homeScore, awayScore, homeBox, awayBox,
    recap, otherGames, cpuResults?, homeTactics?, awayTactics?,
    userTactics?, myTeamId, pbpLogs?, rotationData?,
    pbpShotEvents?, injuries?, quarterScoresData?
  },
  myTeamId, teams, coachingData?, onFinish
}
```
| 전달 방식 | props |
|---|---|
| context | `myTeamId`, `teams`, `coachingData` |
| URL params | (없음 — 박스스코어는 URL에 부적합) |
| **location.state** | `result` (박스스코어+PBP 대형 객체 — 필수) |
| 콜백 | `onFinish` → `navigate('/')` |

> **새로고침 처리**: `location.state` 없으면 `/` 리다이렉트.

---

### 드래프트 (풀스크린)

#### DraftLotteryView (`/draft-lottery`)
```typescript
props: { myTeamId, savedOrder, lotteryMetadata?, resolvedDraftOrder?, seasonShort?, onComplete }
```
| 전달 방식 | props |
|---|---|
| context | `myTeamId`, `savedOrder` (lotteryResult.finalOrder), `lotteryMetadata`, `resolvedDraftOrder`, `seasonShort` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onComplete` → `navigate('/rookie-draft')` |

---

#### FantasyDraftView (`/draft`, `/draft/:poolType`)
```typescript
props: {
  teams, myTeamId, draftPoolType: 'current'|'alltime',
  freeAgents?, draftTeamOrder?,
  onBack, onComplete?
}
```
| 전달 방식 | props |
|---|---|
| context | `teams`, `myTeamId`, `freeAgents` |
| **URL params** | `draftPoolType` → `:poolType` (current / alltime) |
| location.state | `draftTeamOrder` (string[] — saves에서 복원 가능하나 state가 간단) |
| 콜백 | `onBack` → `navigate('/')` / `onComplete` → `navigate('/')` (handleDraftComplete 경유) |

---

#### RookieDraftView (`/rookie-draft`)
```typescript
props: {
  teams, myTeamId, draftOrder: string[],
  resolvedDraftOrder?, draftClass: Player[],
  onComplete
}
```
| 전달 방식 | props |
|---|---|
| context | `teams`, `myTeamId`, `resolvedDraftOrder` |
| URL params | (없음) |
| **location.state** | `draftOrder` (string[]), `draftClass` (루키 Player[] — 60명) |
| 콜백 | `onComplete` → `navigate('/')` (handleRookieDraftComplete 경유) |

> **새로고침 처리**: `location.state` 없으면 context의 `lotteryResult` / `prospects`로 복원 시도.

---

#### DraftView — read-only (`/draft-board`)
```typescript
props: {
  prospects: Player[], onDraft, team, readOnly?,
  lotteryResult?, resolvedDraftOrder?, teams?, myTeamId?
}
```
| 전달 방식 | props |
|---|---|
| context | `team`, `teams`, `myTeamId`, `lotteryResult`, `resolvedDraftOrder`, `prospects` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | `onDraft` → context (read-only 모드에서는 no-op) |

---

#### DraftHistoryView (`/draft-history`)
```typescript
props: { myTeamId, draftPicks }
```
| 전달 방식 | props |
|---|---|
| context | `myTeamId`, `draftPicks` |
| URL params | (없음) |
| location.state | (없음) |
| 콜백 | (없음) |

---

## URL 매핑 (확정)

```
# 비보호 라우트 (인증/초기화 플로우)
/auth                → AuthView           (로그인 상태 → / 리다이렉트)
/mode-select         → ModeSelectView
/draft-pool-select   → DraftPoolSelectView
/select-team         → TeamSelectView
/onboarding          → OnboardingView     [fixed z-500]
/result              → GameResultView     (location.state 필수, 없으면 / 리다이렉트)

# 보호 라우트 메인 (ProtectedLayout)
/                    → HomeView
/dashboard           → DashboardView
/dashboard?tab=TAB   → DashboardView (initialTab: rotation|tactics|roster|records|opponent|schedule)
/roster              → RosterView (내 팀)
/roster/:teamId      → RosterView (특정 팀)
/schedule            → ScheduleView
/schedule?month=YYYY-MM → ScheduleView (initialMonth)
/standings           → StandingsView
/leaderboard         → LeaderboardView
/leaderboard?mode=MODE&stat=STAT&season=TYPE → LeaderboardView (기본 필터)
/transactions        → TransactionsView
/playoffs            → PlayoffsView
/inbox               → InboxView
/help                → HelpView
/front-office        → FrontOfficeView
/fa-market           → FAView
/hall-of-fame        → HallOfFameView

# 보호 라우트 상세 페이지
/player/:playerId    → PlayerDetailView   (location.state: { player, teamId, teamName })
/coach/:coachId      → CoachDetailView    (coachId로 coachingData 전체 탐색)
/gm/:teamId          → GMDetailView       (context에서 재조회 가능)

# 드래프트 (풀스크린)
/draft-lottery       → DraftLotteryView
/draft/:poolType     → FantasyDraftView   [fixed z-9999] (poolType: current|alltime)
/rookie-draft        → RookieDraftView    [풀스크린] (location.state: { draftOrder, draftClass })
/draft-board         → DraftView          [풀스크린, read-only]
/draft-history       → DraftHistoryView   [풀스크린]
```

---

## URL 파라미터 사용 결정 요약표

| View | URL 라우트 | path params | query params | location.state |
|------|-----------|------------|-------------|----------------|
| Home | `/` | — | — | — |
| Dashboard | `/dashboard` | — | `?tab` (6종) | — |
| Roster | `/roster`, `/roster/:teamId` | `:teamId` (선택) | — | — |
| Schedule | `/schedule` | — | `?month` | — |
| Standings | `/standings` | — | — | — |
| Leaderboard | `/leaderboard` | — | `?mode`, `?stat`, `?season` | savedState (복귀 시) |
| Transactions | `/transactions` | — | — | — |
| Playoffs | `/playoffs` | — | — | — |
| Inbox | `/inbox` | — | — | — |
| Help | `/help` | — | — | — |
| FrontOffice | `/front-office` | — | — | — |
| FAMarket | `/fa-market` | — | — | — |
| HallOfFame | `/hall-of-fame` | — | — | — |
| PlayerDetail | `/player/:playerId` | `:playerId` (필수) | — | player 객체, teamId, teamName |
| CoachDetail | `/coach/:coachId` | `:coachId` (필수) | — | — (context 재조회) |
| GMDetail | `/gm/:teamId` | `:teamId` (필수) | — | — (context 재조회) |
| GameResult | `/result` | — | — | result 객체 (필수) |
| DraftLottery | `/draft-lottery` | — | — | — |
| FantasyDraft | `/draft/:poolType` | `:poolType` (필수) | — | draftTeamOrder |
| RookieDraft | `/rookie-draft` | — | — | draftOrder, draftClass |
| DraftBoard | `/draft-board` | — | — | — |
| DraftHistory | `/draft-history` | — | — | — |
| Auth | `/auth` | — | — | — |
| ModeSelect | `/mode-select` | — | — | — |
| DraftPoolSelect | `/draft-pool-select` | — | — | — |
| TeamSelect | `/select-team` | — | — | — |
| Onboarding | `/onboarding` | — | — | — |
| GameSim | 오버레이 (URL 미변경) | — | — | — |
| LiveGame | 오버레이 (URL 미변경) | — | — | — |

---

## 설계 결정

### 오버레이 처리 방식

| 뷰 | 방식 | 이유 |
|----|------|------|
| GameSim | 상태 기반 오버레이 (URL 미변경) | 진행 중인 프로세스, URL 변경 시 깨짐 |
| LiveGame | 상태 기반 오버레이 (URL 미변경) | 실시간 인터랙션 중, 중단 불가 |
| GameResult | `/result` + location.state | 대형 결과 객체, 새로고침 필요 없음 |
| DraftRoom | `/draft/:poolType` | poolType 딥링크 의미 있음 |
| DraftLottery | `/draft-lottery` | 독립 풀스크린 |
| RookieDraft | `/rookie-draft` | 독립 풀스크린 |
| DraftBoard | `/draft-board` | read-only 조회, 딥링크 가능 |
| DraftHistory | `/draft-history` | 독립 풀스크린 |
| Onboarding | `/onboarding` | 일회성 플로우 |
| EditorModal | 모달 (라우트 아님) | 어느 페이지에서든 열 수 있는 전역 모달 |

### 상세 뷰 새로고침 처리

| 뷰 | 새로고침 시 동작 |
|---|---|
| `/player/:playerId` | `location.state.player` → 없으면 teams+freeAgents에서 재조회 → 없으면 `navigate(-1)` |
| `/coach/:coachId` | coachingData 전체 탐색으로 복원 가능, 어시스턴트 추가 시에도 동일 패턴 |
| `/gm/:teamId` | `context.leagueGMProfiles[teamId]`로 완전 복원 가능 |
| `/result` | `location.state` 없으면 `/` 리다이렉트 |
| `/rookie-draft` | `location.state` 없으면 context의 `lotteryResult` + `prospects`로 복원 시도 |

### Props Drilling 제거
`GameContext`를 도입하여 `gameData`, `sim`, `session` 등을 Context로 제공.
각 페이지 컴포넌트가 `useGame()` 훅으로 직접 접근 → AppRouter의 거대한 props 인터페이스 불필요.

콜백 함수(setter, 핸들러)도 context에 포함:
- `setTeams`, `setLeagueTradeBlocks`, `setLeagueTradeOffers`, `setLeaguePickAssets` 등 setter
- `handleSelectTeam`, `handleResetData`, `onForceSave`, `addNews`, `refreshUnreadCount` 등 핸들러
- `openEditor`, `openResetModal`, `onShowToast` 등 UI 제어

---

## 라우트 트리

```
BrowserRouter
│
│  [비보호 라우트]
├── /auth                          AuthView
├── /mode-select                   ModeSelectView
├── /draft-pool-select             DraftPoolSelectView
├── /select-team                   TeamSelectView
├── /onboarding                    OnboardingView [fixed z-500]
├── /result                        GameResultView (location.state 가드)
│
└── /* ─── ProtectedLayout ─────── 인증 가드 + MainLayout
         │
         │  [상태 기반 오버레이 — URL 미변경]
         │  ├── sim.activeGame?     → GameSimulationView [fixed z-9999]
         │  └── sim.liveGameTarget? → LiveGameView [fixed z-9999]
         │
         │  [전역 모달 — URL 미변경]
         │  ├── EditorModal
         │  └── ResetDataModal
         │
         │  [Sidebar + DashboardHeader + <Outlet>]
         │
         ├── /                     HomeView
         ├── /dashboard            DashboardView
         ├── /roster               RosterView
         ├── /roster/:teamId       RosterView
         ├── /schedule             ScheduleView
         ├── /standings            StandingsView
         ├── /leaderboard          LeaderboardView
         ├── /transactions         TransactionsView
         ├── /playoffs             PlayoffsView
         ├── /inbox                InboxView
         ├── /help                 HelpView
         ├── /front-office         FrontOfficeView
         ├── /fa-market            FAView
         ├── /hall-of-fame         HallOfFameView
         ├── /player/:playerId     PlayerDetailView
         ├── /coach/:coachId       CoachDetailView
         ├── /gm/:teamId           GMDetailView
         ├── /draft-lottery        DraftLotteryView [풀스크린]
         ├── /draft/:poolType      FantasyDraftView [fixed z-9999]
         ├── /rookie-draft         RookieDraftView  [풀스크린]
         ├── /draft-board          DraftView        [풀스크린, read-only]
         ├── /draft-history        DraftHistoryView [풀스크린]
         └── *                     / 리다이렉트
```

---

## 구현 단계

### 1단계: 의존성 + 인프라
- `npm install react-router-dom`
- `vercel.json` 생성 (SPA catch-all rewrite)
- `index.tsx`에 `<BrowserRouter>` 래핑 (`applyEditorToTeamData()` 호출 유지)

### 2단계: GameContext 생성
- `hooks/useGameContext.tsx` 신규 생성
- **데이터**: `gameData` 전체, `sim`, `session`
- **파생 값**: `unreadCount`, `rosterMode`, `draftPoolType`
- **UI 제어**: `setToastMessage`, `openEditor`, `openResetModal`, `refreshUnreadCount`
- **핸들러**: `setTeams`, `setLeagueTradeBlocks`, `setLeagueTradeOffers`, `setLeaguePickAssets`, `setUserTactics`, `onForceSave`, `addNews`, `onAddTransaction`, `onTeamOptionExecuted`, `setSeries`, `setSchedule`

### 3단계: App.tsx 리팩토링
- **제거**: `useState<AppView>`, `setView` 관련 useEffect, AppRouter 임포트
- **유지**: useAuth, useGameData, useSimulation, 로딩 가드, rosterMode/draftPoolType state
- **추가**: `<GameContext.Provider>` + `<Routes>` 선언

### 4단계: ProtectedLayout 생성
- `components/ProtectedLayout.tsx` 신규 (AppRouter.tsx 대체)
- 인증 가드: 세션 없으면 `/auth`, 팀 없으면 `/mode-select`
- 미완료 드래프트 감지 → `/draft-lottery` 리다이렉트
- GameSim/LiveGame 오버레이: `<Outlet>` 위에 렌더링
- `sim.lastGameResult` 변경 시 `navigate('/result', { state })`
- EditorModal, ResetDataModal 렌더링

### 5단계: pages/ 래퍼 생성

| 파일 | 핵심 변환 |
|------|----------|
| `HomePage` | `onNavigate` → useNavigate, `onViewPlayer` → `navigate('/player/${id}', { state })` |
| `DashboardPage` | `useSearchParams()` → `?tab` 파싱 → `initialTab` |
| `RosterPage` | `useParams<{ teamId }>` → `initialTeamId` prop |
| `SchedulePage` | `useSearchParams()` → `?month` 파싱 → `initialMonth` |
| `StandingsPage` | `onTeamClick` → `navigate('/roster/${id}')` |
| `LeaderboardPage` | `useSearchParams()` → `?mode&stat&season` / `useLocation().state` → `savedState` |
| `TransactionsPage` | context에서 모든 setter/핸들러 접근 |
| `PlayoffsPage` | `setSeries`, `setSchedule` → context setter |
| `InboxPage` | 네비게이션 콜백 5개 → useNavigate |
| `HelpPage` | `onBack` → `navigate(-1)` |
| `FrontOfficePage` | `onCoachClick` → `navigate('/coach/${id}')`, `onGMClick` → `navigate('/gm/${id}')` |
| `FAMarketPage` | `onViewPlayer` → `navigate('/player/${id}', { state })` / 콜백 → context |
| `HallOfFamePage` | context에서 hofId, userId 접근 |
| `PlayerDetailPage` | `useParams + useLocation().state` / 없으면 context 재조회 |
| `CoachDetailPage` | `useParams<{ coachId }>` + coachingData 전체 탐색 재조회 |
| `GMDetailPage` | `useParams<{ teamId }>` + context.leagueGMProfiles 재조회 |
| `GameResultPage` | `location.state?.result` 없으면 `/` 리다이렉트 |
| `DraftLotteryPage` | `onComplete` → `navigate('/rookie-draft')` |
| `FantasyDraftPage` | `useParams<{ poolType }>` / `location.state.draftTeamOrder` |
| `RookieDraftPage` | `location.state`: draftOrder + draftClass / 없으면 context 복원 |
| `DraftBoardPage` | context에서 prospects, lotteryResult 접근 |
| `DraftHistoryPage` | context에서 draftPicks 접근 |
| `AuthRoute` | 로그인 상태면 `/` 리다이렉트 |
| `ModeSelectRoute` | rosterMode 완료 시 다음 단계 리다이렉트 |
| `DraftPoolSelectRoute` | draftPoolType 완료 시 `/select-team` 리다이렉트 |
| `TeamSelectRoute` | 팀 있으면 `/` 리다이렉트 |
| `OnboardingRoute` | 완료 시 `navigate('/')` |

### 6단계: 네비게이션 컴포넌트 수정
- **MainLayout.tsx**: `currentView: AppView` → `useLocation()` pathname 체크
  - `isFullHeightView`: `/draft`, `/draft-board`, `/draft-history`, `/draft-lottery`, `/rookie-draft`
  - `isNoPaddingView`: `/`, `/inbox`, `/roster` 등
  - `onEditorClick` → `context.openEditor()`
- **Sidebar.tsx**: `onNavigate` + `onEditorClick` props 제거 → 내부 `useNavigate()` + `useLocation()`
- **Footer.tsx**: `FooterProps` 제거 → 내부 `useNavigate()`

### 7단계: 정리
- `AppRouter.tsx` 삭제
- `types/app.ts`에서 `AppView` 타입 삭제 (`RosterMode`, `DraftPoolType`, `OffseasonPhase`, `PendingOffseasonAction` 유지)

---

## 수정 대상 파일 목록

| 파일 | 작업 |
|------|------|
| `package.json` | react-router-dom 추가 |
| `vercel.json` | 신규 생성 (SPA rewrite) |
| `index.tsx` | BrowserRouter 래핑 |
| `hooks/useGameContext.tsx` | 신규 생성 (데이터 + 콜백 통합) |
| `App.tsx` | Routes 구조로 리팩토링 |
| `components/ProtectedLayout.tsx` | 신규 생성 |
| `pages/*.tsx` (~27개) | 신규 생성 |
| `components/MainLayout.tsx` | AppView/onNavigate 제거 → useLocation |
| `components/Sidebar.tsx` | useNavigate/useLocation 내부화 |
| `components/Footer.tsx` | useNavigate 내부화 |
| `components/AppRouter.tsx` | 삭제 |
| `types/app.ts` | AppView 타입 삭제 |

---

## 크로스 뷰 네비게이션 흐름

```
[인증 — 기본 모드]
  /auth → /mode-select → /select-team → /onboarding → /

[인증 — 커스텀 모드]
  /auth → /mode-select → /draft-pool-select → /select-team
        → /draft-lottery → /draft/current → /

[Sidebar 메인 네비게이션]
  / → /dashboard, /roster, /standings, /leaderboard, /schedule,
      /transactions, /playoffs, /inbox, /front-office, /fa-market

[Sidebar Dropdown 메뉴]
  Help → /help
  드래프트 기록 → /draft-history
  에디터 → EditorModal (URL 미변경)
  데이터 초기화 → ResetDataModal (URL 미변경)

[뷰 간 이동]
  /standings           → 팀 클릭          → /roster/:teamId
  /leaderboard         → 선수 클릭         → /player/:playerId (+ location.state)
  /leaderboard         → 팀 클릭           → /roster/:teamId
  /roster/:teamId      → 선수 클릭         → /player/:playerId (+ location.state)
  /schedule            → 결과 보기         → /result (location.state)
  /playoffs            → 결과 보기         → /result (location.state)
  /inbox               → 결과 보기         → /result (location.state)
  /inbox               → HOF 이동          → /hall-of-fame
  /inbox               → 루키 드래프트      → /rookie-draft
  /inbox               → 드래프트 추첨      → /draft-lottery
  /dashboard           → 코치 클릭         → /coach/:coachId
  /front-office        → 코치 클릭         → /coach/:coachId
  /front-office        → GM 클릭           → /gm/:teamId
  /roster/:teamId      → 코치 클릭         → /coach/:coachId
  /roster/:teamId      → GM 클릭           → /gm/:teamId
  /dashboard           → 탭 이동           → /dashboard?tab=TAB
  /schedule            → 월 변경           → /schedule?month=YYYY-MM

[드래프트 흐름]
  /draft-lottery → 추첨 완료 → /rookie-draft (location.state: draftOrder) → 완료 → /
  /draft/current → 커스텀 드래프트 완료 → /
  /draft/alltime → 올타임 커스텀 드래프트 완료 → /

[시뮬레이션 (오버레이)]
  현재 페이지 → sim 시작 → GameSim 오버레이 (URL 유지) → /result → /
  현재 페이지 → 라이브    → LiveGame 오버레이 (URL 유지) → /result → /

[리로드 시 미완료 드래프트 복원]
  ProtectedLayout 진입 → draftPicks.order 있고 teams 없음 → /draft-lottery 리다이렉트
```

---

## 리스크 & 대응

| 리스크 | 대응 |
|--------|------|
| GameSim/LiveGame 오버레이 URL 변경 시 깨짐 | 상태 기반 오버레이 유지, URL 미변경 |
| `/result` 새로고침 | location.state 없으면 `/` 리다이렉트 |
| `/player/:playerId` 새로고침 | playerId로 context teams+freeAgents 재조회, 실패 시 navigate(-1) |
| `/rookie-draft` 새로고침 | location.state 없으면 context lotteryResult+prospects 복원 시도 |
| Vercel 직접 URL 접속 시 404 | `vercel.json` catch-all rewrite |
| 미완료 드래프트 새로고침 | ProtectedLayout에서 감지 → `/draft-lottery` 리다이렉트 |
| rosterMode/draftPoolType 새로고침 소실 | DB draftPicks에서 poolType 복원 |
| `LeaderboardView.savedState` 새로고침 소실 | 의도된 동작 (필터 초기화) |
| TransactionsView setter 공급 | GameContext에 모든 setter 포함 (context 크기 증가 감수) |

## 검증 체크리스트
1. `npm run build` 타입 에러 없이 성공
2. 모든 Sidebar 네비게이션 → URL 변경 + 뷰 렌더링
3. 브라우저 뒤로가기/앞으로가기 정상 동작
4. URL 직접 입력 → 해당 뷰 렌더링
5. 새로고침 시 현재 뷰 유지
6. GameSim → GameResult → Home 흐름
7. `/standings` → `/roster/:teamId` URL 반영
8. `/result` 직접 접속 → `/` 리다이렉트
9. 기본 모드 인증 플로우 정상 동작
10. 커스텀 모드 인증 플로우 정상 동작
11. 새로고침 시 미완료 드래프트 → `/draft-lottery` 자동 복원
12. Sidebar dropdown → `/help`, `/draft-history` 이동 + EditorModal 열림
13. `/player/:playerId` 직접 접속 → player 재조회 또는 fallback
14. `/coach/:coachId` 직접 접속 → coachingData 전체 탐색 재조회 정상 동작
15. `/gm/:teamId` 직접 접속 → leagueGMProfiles[teamId] 재조회 정상 동작
15. `/roster/:teamId` 직접 접속 → 해당 팀 로스터 표시
16. `/dashboard?tab=rotation` 직접 접속 → rotation 탭 활성화
17. `/draft/current`, `/draft/alltime` 직접 접속 → poolType 반영
18. `/schedule?month=2026-01` 직접 접속 → 해당 월 캘린더 표시
