# URL 라우팅 시스템

> 최초 작성: 2026-03-20 (react-router-dom v6 마이그레이션 완료 기준)

---

## 1. 개요

이전 시스템은 `useState<AppView>`로 모든 뷰를 단일 URL(`/`)에서 전환했다. 현재는 **react-router-dom v6**의 `BrowserRouter` 기반으로 완전 전환되었다.

**핵심 변화 요약:**
- URL이 실제 페이지 상태를 반영 (`/leaderboard`, `/player/p-001` 등)
- 뒤로가기/앞으로가기 브라우저 네이티브 동작
- 새로고침 후 상태 복원 (URL params 활용 페이지 한정)
- `AppView` 타입 및 `AppRouter.tsx` 완전 제거

---

## 2. 아키텍처

```
index.tsx
└── <BrowserRouter>
    └── <QueryClientProvider>
        └── <App>
            ├── <GameContext.Provider>      ← 전역 상태 (session, gameData, sim 등)
            └── <Routes>
                ├── /auth, /mode-select, /draft-pool-select, /select-team, /onboarding
                │   └── 비보호 라우트 (인증 없이 접근 가능)
                └── <ProtectedLayout>       ← 인증/팀선택 가드 + LiveGame 오버레이
                    └── <Outlet>            ← 보호 라우트 페이지들
```

### GameContext

`hooks/useGameContext.tsx`에 정의된 전역 Context. 모든 보호 라우트 페이지에서 `useGame()` 훅으로 접근한다.

```ts
const { session, gameData, sim, unreadCount, setViewPlayerData, ... } = useGame();
```

페이지 컴포넌트는 Context에서 필요한 데이터를 꺼내 View 컴포넌트에 props로 전달하는 **얇은 래퍼** 역할만 한다.

---

## 3. 라우트 구조

### 비보호 라우트

| Path | 컴포넌트 | 설명 |
|---|---|---|
| `/auth` | `AuthPage` | 로그인/게스트 |
| `/mode-select` | `ModeSelectPage` | 기본/커스텀 모드 선택 |
| `/draft-pool-select` | `DraftPoolSelectPage` | 드래프트 풀 선택 |
| `/select-team` | `TeamSelectPage` | 팀 선택 |
| `/onboarding` | `OnboardingPage` | 온보딩 (fixed z-500) |

### 보호 라우트 (ProtectedLayout 내부)

| Path | 컴포넌트 |
|---|---|
| `/` | `HomePage` |
| `/dashboard` | `DashboardPage` |
| `/roster`, `/roster/:teamId` | `RosterPage` |
| `/schedule` | `SchedulePage` |
| `/standings` | `StandingsPage` |
| `/leaderboard` | `LeaderboardPage` |
| `/transactions` | `TransactionsPage` |
| `/playoffs` | `PlayoffsPage` |
| `/inbox` | `InboxPage` |
| `/help` | `HelpPage` |
| `/front-office` | `FrontOfficePage` |
| `/fa-market` | `FAMarketPage` |
| `/hall-of-fame` | `HallOfFamePage` |
| `/player/:playerId` | `PlayerDetailPage` |
| `/coach/:coachId` | `CoachDetailPage` |
| `/gm/:teamId` | `GMDetailPage` |
| `/result/:gameId` | `GameResultPage` |
| `/draft-lottery` | `DraftLotteryPage` |
| `/draft/*`, `/rookie-draft` | `DraftRoomPage` |
| `/draft-board` | `DraftBoardPage` |
| `/draft-history` | `DraftHistoryPage` |
| `*` | `<Navigate to="/" replace />` |

---

## 4. ProtectedLayout 동작 흐름

`components/ProtectedLayout.tsx`가 모든 보호 라우트의 레이아웃이다. 다음 순서로 가드가 실행된다.

```
1. !session && !isGuestMode  →  /auth 리다이렉트
2. isSaveLoading             →  SkeletonLoader 표시
3. !myTeamId
   ├── !rosterMode           →  /mode-select
   ├── custom && !draftPoolType → /draft-pool-select
   └── else                  →  /select-team
4. 미완료 커스텀 드래프트 감지 →  /draft-lottery 리다이렉트
5. 정상 렌더: MainLayout > Outlet
```

### LiveGame 오버레이

URL이 변경되지 않는 오버레이 방식. `sim.liveGameTarget`이 존재하면 `fixed inset-0 z-9999`로 렌더링된다.

```
sim.liveGameTarget → LiveGameView (내 팀 경기)
sim.spectateTarget → LiveGameView (관전, onGameEnd → /schedule)
```

### GameResult 네비게이션

경기가 끝나면 `sim.lastGameResult`가 설정되고, useEffect가 자동으로 네비게이트한다.

```ts
useEffect(() => {
    if (!sim.lastGameResult) return;
    navigate(`/result/${gameId}`, { state: { result: sim.lastGameResult } });
}, [sim.lastGameResult]);
```

---

## 5. 페이지별 작동 방식

### PlayerDetailPage / CoachDetailPage / GMDetailPage

URL params + `location.state` 이중 소스로 데이터를 조회한다. `location.state`가 없으면 gameData에서 탐색하는 fallback이 있다.

```ts
// PlayerDetailPage
const { playerId } = useParams<{ playerId: string }>();
const locationState = useLocation().state as { player: Player; ... } | null;

// 1순위: location.state (navigate 시 전달된 데이터)
// 2순위: gameData.teams 전체 로스터 탐색
```

### GameResultPage

`gameId` URL param + `location.state.result` 캐시 → 없으면 DB fallback.

```ts
const { gameId } = useParams<{ gameId: string }>();
const locationState = useLocation().state as { result: GameResult } | null;

// location.state 있으면 즉시 렌더
// 없으면 fetchFullGameResult(gameId, userId) 호출
```

`onFinish` 처리:
- `result.date < currentSimDate` → 이미 지난 경기 → `navigate(-1)`
- 그 외 → 날짜 진행 + forceSave

### DraftRoomPage

prospects 유무로 뷰를 분기한다.

```ts
if (gameData.prospects?.length > 0)
    return <RookieDraftView />;   // 루키 드래프트 (오프시즌)
else
    return <FantasyDraftView />;  // 커스텀 팀빌딩 드래프트 (게임 시작 시)
```

### TeamSelectPage

`handleSelectTeam()` 완료 후 navigate하는 **순서가 중요**하다. `myTeamId`가 세팅되기 전에 이동하면 OnboardingPage가 가드에 걸려 `/select-team`으로 튕긴다.

```ts
// ✅ 올바른 순서
const success = await gameData.handleSelectTeam(teamId); // myTeamId 세팅
await refreshUnreadCount();
navigate('/onboarding', { replace: true });              // 이후 이동

// ❌ 잘못된 순서 (마이그레이션 중 발생했던 버그)
navigate('/onboarding');
await gameData.handleSelectTeam(teamId); // 너무 늦음
```

---

## 6. URL 파라미터 상태 지속

react-router-dom 전환 이후 컴포넌트는 페이지 이동 시 언마운트된다. `useRef`로 상태를 저장하던 방식은 더 이상 작동하지 않으며, `useSearchParams()`를 사용한다.

### 현재 적용된 페이지

#### LeaderboardPage — `/leaderboard`

필터 전체를 URL params에 직렬화한다.

| Param | 값 예시 | 설명 |
|---|---|---|
| `mode` | `Players` | Players / Teams 전환 |
| `cat` | `Traditional` | 스탯 카테고리 |
| `sort` | `pts` | 정렬 기준 컬럼 키 |
| `dir` | `desc` | 정렬 방향 |
| `perPage` | `50` | 페이지당 항목 수 |
| `page` | `1` | 현재 페이지 |
| `heatmap` | `true` | 히트맵 표시 여부 |
| `season` | `regular` | regular / playoff |
| `q` | `LeBron` | 검색어 |
| `team` | `LAL` (반복 가능) | 팀 필터 |
| `pos` | `PG` (반복 가능) | 포지션 필터 |
| `filters` | `<base64(JSON)>` | 고급 필터 (FilterItem[]) |

#### SchedulePage — `/schedule`

| Param | 값 예시 | 설명 |
|---|---|---|
| `month` | `2025-10` | 현재 선택된 달 (YYYY-MM) |

### 구현 패턴

```ts
const [searchParams, setSearchParams] = useSearchParams();

// 읽기
const mode = searchParams.get('mode') ?? 'Players';

// 쓰기 — replace: true가 핵심
setSearchParams(params, { replace: true });
```

> **`replace: true` 이유:** 필터 변경은 새 히스토리 항목을 만들면 안 된다. 뒤로가기가 "필터 변경 전"이 아니라 "이전 페이지"로 이동해야 한다.

### 새 페이지에 URL params 적용 시 체크리스트

1. `useRef` 대신 `useSearchParams()` 사용
2. 상태 읽기: `searchParams.get(key) ?? defaultValue`
3. 배열: `searchParams.getAll(key)`
4. 상태 쓰기: `setSearchParams(new URLSearchParams(...), { replace: true })`
5. 복잡한 객체 배열: `btoa(JSON.stringify(arr))` / `JSON.parse(atob(raw))`

---

## 7. Sidebar 네비게이션

`components/Sidebar.tsx`는 `useNavigate()` + `useLocation()`을 **내부에서 직접** 사용한다. props로 `currentView`나 `onNavigate`를 받지 않는다.

```ts
const navigate = useNavigate();
const { pathname } = useLocation();

// active 판단
<NavItem active={pathname === '/'} onClick={() => navigate('/')} />
<NavItem active={pathname.startsWith('/dashboard')} onClick={() => navigate('/dashboard')} />
```

### isFullHeightView / isNoPaddingView

`components/MainLayout.tsx`에서 `useLocation`으로 pathname을 읽어 레이아웃 클래스를 결정한다.

```ts
// 전체 높이 (DashboardHeader 숨김, padding 없음)
const isFullHeightView =
    pathname.startsWith('/draft/') ||
    pathname.startsWith('/rookie-draft') ||
    pathname.startsWith('/draft-history') ||
    pathname.startsWith('/draft-lottery');

// padding 없음 (콘텐츠가 전체 영역 차지)
const isNoPaddingView =
    pathname === '/' || pathname.startsWith('/dashboard') || ...;
```

---

## 8. 오프시즌 이벤트 네비게이션

`useSimulation`의 `onOffseasonEvent` 콜백은 `App.tsx`의 `OFFSEASON_VIEW_TO_PATH` 맵을 통해 URL로 변환된다.

```ts
// App.tsx
const OFFSEASON_VIEW_TO_PATH: Record<string, string> = {
    DraftLottery: '/draft-lottery',
    DraftRoom:    '/draft/',
};

// useSimulation이 'DraftLottery'를 emit하면 → navigate('/draft-lottery')
```

새 오프시즌 이벤트가 추가되면 이 맵에 항목을 추가하면 된다.

---

## 9. 트러블슈팅

### 화면이 아무것도 렌더링되지 않는다

1. **인증 가드**: 로그인 상태인지 확인. `/auth`로 리다이렉트됐는지 확인.
2. **팀 선택 가드**: `gameData.myTeamId`가 null이면 `/mode-select`로 튕김.
3. **데이터 로딩**: `gameData.isSaveLoading`이 true면 SkeletonLoader가 표시됨.
4. **페이지 컴포넌트 early return**: `if (!myTeam) return null` 같은 가드 확인.

### 다른 페이지 갔다 오면 필터/상태가 초기화된다

react-router-dom에서는 라우트 전환 시 이전 컴포넌트가 **언마운트**된다. `useRef`는 언마운트 후 null로 초기화된다.

→ **해결**: `useSearchParams()` 사용 (6장 참고)

### 선수 상세 페이지에서 데이터가 없다

`PlayerDetailPage`는 `location.state`가 없으면 `gameData.teams` 전체를 탐색한다. 탐색에도 실패하면 `/` 로 리다이렉트된다. navigate 호출 시 `state`를 전달했는지 확인.

```ts
navigate(`/player/${player.id}`, { state: { player, teamId, teamName } });
```

### 뒤로가기를 누르면 필터 변경 이전으로 간다

`setSearchParams(params)` (replace 없음)를 사용하면 필터 변경마다 히스토리 항목이 쌓인다.

→ **해결**: `setSearchParams(params, { replace: true })`

### 드래프트룸에 들어가면 엉뚱한 뷰가 나온다

`DraftRoomPage`가 `gameData.prospects?.length > 0` 여부로 뷰를 분기한다. prospects가 없으면 `FantasyDraftView`(커스텀 팀빌딩), 있으면 `RookieDraftView`(루키 드래프트)로 이동한다. prospects 데이터 로드 상태를 확인.

### 오프시즌 이벤트 발생 후 페이지가 전환되지 않는다

`App.tsx`의 `OFFSEASON_VIEW_TO_PATH`에 해당 이벤트 키가 등록되어 있는지 확인. `offseasonEventHandler.ts`의 `navigateTo` 값이 맵의 키와 일치해야 한다.

### Vercel 배포 후 URL 직접 접근 시 404

`vercel.json`에 SPA catch-all rewrite가 설정되어 있어야 한다.

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
