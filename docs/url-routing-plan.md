# URL 라우팅 전환 계획

> 마지막 업데이트: 2026-02-28

## 배경

### 현재 상태
- 라우터 라이브러리 없이 `useState<AppView>`로 23개 뷰를 전환하는 단일뷰 SPA
- URL은 항상 `/` 고정
- `App.tsx` → `setView` → `AppRouter.tsx` (switch문) → View 컴포넌트

### 문제점
- 새로고침하면 무조건 Dashboard로 초기화
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
  useState<AppView>('Dashboard')
  setView() ──→ MainLayout
  │               ├── Sidebar    (onNavigate + onEditorClick props)
  │               ├── Footer     (onNavigate prop)
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
```

### AppView 타입 (23개)
```typescript
type AppView =
  | 'Auth' | 'TeamSelect' | 'Onboarding'              // 인증/초기화
  | 'ModeSelect' | 'DraftPoolSelect'                   // 모드/풀 선택 (팀 선택 전)
  | 'Dashboard' | 'Roster' | 'Schedule'                // 메인
  | 'Standings' | 'Leaderboard' | 'Transactions'       // 메인
  | 'Playoffs' | 'Inbox' | 'Help' | 'OvrCalculator'   // 메인
  | 'DraftRoom' | 'DraftLottery' | 'DraftHistory'     // 드래프트
  | 'GameSim' | 'LiveGame' | 'GameResult'              // 시뮬레이션
  | 'SeasonReview' | 'PlayoffReview';                   // 리뷰

type RosterMode = 'default' | 'custom';
type DraftPoolType = 'current' | 'alltime';
```

### 추가 상태 (App.tsx)
- `rosterMode: RosterMode | null` — 기본/커스텀 모드 선택
- `draftPoolType: DraftPoolType | null` — 드래프트풀 선택 (current/alltime)
- `isEditorModalOpen` — 에디터 모달 (팀 데이터 편집)

---

## 설계 결정

### 오버레이 처리 방식

| 뷰 | 방식 | 이유 |
|----|------|------|
| GameSim | 상태 기반 오버레이 (URL 미변경) | 진행 중인 프로세스, URL 변경 시 깨짐 |
| LiveGame | 상태 기반 오버레이 (URL 미변경) | 실시간 인터랙션 중, 중단 불가 |
| GameResult | `/result` 라우트 + location.state | 완료된 데이터 조회, 뒤로가기 자연스러움 |
| DraftRoom | `/draft` 라우트 (fixed z-9999 유지) | 독립적 풀스크린 뷰 |
| DraftLottery | `/draft-lottery` 라우트 (풀스크린) | 드래프트 추첨 과정 |
| DraftHistory | `/draft-history` 라우트 (풀스크린) | 드래프트 기록 조회 |
| Onboarding | `/onboarding` 라우트 (fixed z-500 유지) | 일회성 플로우 |
| EditorModal | 모달 (라우트 아님) | 어느 페이지에서든 열 수 있는 전역 모달 |

### Props Drilling 제거
`GameContext`를 도입하여 `gameData`, `sim`, `session` 등을 Context로 제공.
각 페이지 컴포넌트가 `useGame()` 훅으로 직접 접근 → AppRouter의 거대한 props 인터페이스 불필요.

---

## URL 매핑

```
# 인증/초기화 (비보호 라우트)
/auth              → AuthView           (로그인 상태면 / 로 리다이렉트)
/mode-select       → ModeSelectView     (모드 선택: 기본/커스텀)
/draft-pool-select → DraftPoolSelectView(커스텀 모드 → 드래프트풀 선택)
/select-team       → TeamSelectView     (팀 있으면 / 로 리다이렉트)
/onboarding        → OnboardingView     (기본 모드, 완료 시 / 로)

# 메인 (보호 라우트 — ProtectedLayout 내부)
/                  → DashboardView      (기본)
/roster            → RosterView         (내 팀)
/roster/:teamId    → RosterView         (특정 팀 — selectedTeamId state 대체)
/schedule          → ScheduleView
/standings         → StandingsView
/leaderboard       → LeaderboardView
/transactions      → TransactionsView
/playoffs          → PlayoffsView
/inbox             → InboxView
/help              → HelpView
/ovr-calculator    → OvrCalculatorView
/season-review     → SeasonReviewView
/playoff-review    → PlayoffReviewView

# 드래프트 (보호 라우트, 풀스크린)
/draft-lottery     → DraftLotteryView   (풀스크린)
/draft             → FantasyDraftView   (풀스크린, fixed z-9999)
/draft-history     → DraftHistoryView   (풀스크린)

# 시뮬레이션 결과
/result            → GameResultView     (location.state, 없으면 / 리다이렉트)
```

---

## 라우트 트리

```
BrowserRouter
│
│  [비보호 라우트 — 인증/초기화 플로우]
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
         │  ├── sim.activeGame?     → GameSimulatingView [fixed z-9999]
         │  └── sim.liveGameTarget? → LiveGameView [fixed z-9999]
         │
         │  [전역 모달 — URL 미변경]
         │  ├── EditorModal         (isEditorModalOpen state)
         │  └── ResetDataModal      (isResetModalOpen state)
         │
         │  [Sidebar + DashboardHeader + <Outlet>]
         │
         ├── / (index)             DashboardView
         ├── /roster               RosterView (내 팀)
         ├── /roster/:teamId       RosterView (특정 팀)
         ├── /schedule             ScheduleView
         ├── /standings            StandingsView
         ├── /leaderboard          LeaderboardView
         ├── /transactions         TransactionsView
         ├── /playoffs             PlayoffsView
         ├── /inbox                InboxView
         ├── /help                 HelpView
         ├── /ovr-calculator       OvrCalculatorView
         ├── /draft-lottery        DraftLotteryView [풀스크린]
         ├── /draft                FantasyDraftView [fixed z-9999]
         ├── /draft-history        DraftHistoryView [풀스크린]
         ├── /season-review        SeasonReviewView
         ├── /playoff-review       PlayoffReviewView
         └── *                     / 리다이렉트
```

---

## 구현 단계

### 1단계: 의존성 + 인프라
- `npm install react-router-dom`
- `vercel.json` 생성 (SPA catch-all rewrite)
- `index.tsx`에 `<BrowserRouter>` 래핑 (`applyEditorToTeamData()` 호출은 유지)

### 2단계: GameContext 생성
- `hooks/useGameContext.tsx` 신규 생성
- 제공 값: `gameData`, `sim`, `session`, `unreadCount`, `refreshUnreadCount`, `setToastMessage`, `rosterMode`, `draftPoolType`
- AppRouter의 거대한 props 인터페이스를 대체

### 3단계: App.tsx 리팩토링
- **제거**: `useState<AppView>`, `setView` 관련 useEffect 전부, AppRouter 임포트
- **유지**: useAuth, useGameData, useSimulation 훅, 로딩 가드 (authLoading, isSaveLoading), `rosterMode`/`draftPoolType` state, `EditorModal`/`ResetDataModal`
- **추가**: `<GameContext.Provider>` + `<Routes>` 선언
- **주의**: 미완료 드래프트 감지 로직 (`draftPicks?.order && !draftPicks?.teams`) → ProtectedLayout에서 `/draft-lottery`로 리다이렉트

### 4단계: ProtectedLayout 생성
- `components/ProtectedLayout.tsx` 신규 (AppRouter.tsx 대체)
- 인증 가드: 세션 없으면 `/auth`, 팀 없으면 `/mode-select`으로 리다이렉트
- 미완료 드래프트 감지: `draftPicks.order` 있고 `draftPicks.teams` 없으면 → `/draft-lottery`로 리다이렉트
- MainLayout 래핑 + `<Outlet />`으로 자식 라우트 렌더링
- GameSim/LiveGame 오버레이: sim state 확인 후 `<Outlet>` 위에 렌더링
- `sim.lastGameResult` 변경 시 `navigate('/result', { state })` 호출
- EditorModal, ResetDataModal 렌더링
- 라우트 변경 시 scroll-to-top

### 5단계: 페이지 래퍼 생성
`pages/` 디렉토리에 얇은 래퍼 컴포넌트 생성:

| 파일 | 핵심 변환 |
|------|----------|
| DashboardPage | `onShowSeasonReview` → `navigate('/season-review')` |
| RosterPage | `useParams<{ teamId }>` → `initialTeamId` prop |
| StandingsPage | `onTeamClick` → `navigate('/roster/${id}')` |
| SchedulePage | `onViewGameResult` → `navigate('/result', { state })` |
| InboxPage | `onViewGameResult` → `navigate('/result', { state })` |
| HelpPage | `onBack` → `navigate(-1)` |
| GameResultPage | `location.state?.result`, 없으면 `/` 리다이렉트 |
| AuthRoute | 로그인 상태면 `/` 리다이렉트 |
| ModeSelectRoute | `rosterMode` 있으면 다음 단계로 리다이렉트 |
| DraftPoolSelectRoute | `draftPoolType` 있으면 `/select-team`으로 리다이렉트 |
| TeamSelectRoute | 팀 있으면 `/` 리다이렉트 |
| OnboardingRoute | 완료 시 `navigate('/')` |
| DraftLotteryPage | `onComplete` → `navigate('/draft')` |
| DraftPage | `onBack`/`onComplete` → `navigate('/')` |
| DraftHistoryPage | `useGame().gameData.draftPicks` 사용 |
| OvrCalculatorPage | `useGame().gameData.teams` + `freeAgents` 사용 |
| SeasonReviewPage | `onBack` → `navigate(-1)` |
| PlayoffReviewPage | `onBack` → `navigate(-1)` |

### 6단계: 네비게이션 컴포넌트 수정
- **MainLayout.tsx**: `currentView: AppView` → `useLocation()` pathname 체크
  - `isFullHeightView`: pathname이 `/draft`, `/draft-history`, `/draft-lottery`인지 확인
  - `isNoPaddingView`: pathname이 `/`, `/inbox`, `/roster` 등인지 확인
  - Footer 숨김: `isFullHeightView`, `isNoPaddingView`, pathname `/help`일 때
  - `onEditorClick` → context 또는 내부 state로 이동
  - `conferenceRank`, `streak`, `conferenceName` 계산 로직 유지
- **Sidebar.tsx**: `onNavigate` + `onEditorClick` props 제거 → 내부 `useNavigate()` + `useLocation()` 사용
  - Dropdown 메뉴: Help → `navigate('/help')`, DraftHistory → `navigate('/draft-history')`, Editor → context 콜백
- **Footer.tsx**: `FooterProps` 인터페이스 제거 → 내부 `useNavigate()` 사용

### 7단계: 정리
- `AppRouter.tsx` 삭제
- `types/app.ts`에서 `AppView` 타입 삭제 (`RosterMode`, `DraftPoolType`은 유지)
- 남은 `AppView` import 정리

---

## 수정 대상 파일 목록

| 파일 | 작업 |
|------|------|
| `package.json` | react-router-dom 추가 |
| `vercel.json` | 신규 생성 (SPA rewrite) |
| `index.tsx` | BrowserRouter 래핑 (applyEditorToTeamData 유지) |
| `hooks/useGameContext.tsx` | 신규 생성 |
| `App.tsx` | Routes 구조로 리팩토링 |
| `components/ProtectedLayout.tsx` | 신규 생성 (레이아웃 라우트) |
| `pages/*.tsx` (~18개) | 신규 생성 (페이지 래퍼) |
| `components/MainLayout.tsx` | AppView/onNavigate 제거, useLocation |
| `components/Sidebar.tsx` | useNavigate/useLocation 내부 사용, onEditorClick 제거 |
| `components/Footer.tsx` | useNavigate 내부 사용, FooterProps 제거 |
| `components/AppRouter.tsx` | 삭제 |
| `types/app.ts` | AppView 타입 삭제 (RosterMode, DraftPoolType 유지) |

---

## 크로스 뷰 네비게이션 흐름

```
[인증 — 기본 모드]
  /auth → /mode-select → /select-team → /onboarding → /

[인증 — 커스텀 모드]
  /auth → /mode-select → /draft-pool-select → /select-team
        → /draft-lottery → /draft → /

[Sidebar 메인 네비게이션]
  / → /roster, /standings, /leaderboard, /schedule,
      /transactions, /playoffs, /inbox, /ovr-calculator, /draft

[Sidebar Dropdown 메뉴]
  Help → /help
  드래프트 기록 → /draft-history
  에디터 → EditorModal (URL 미변경)
  데이터 초기화 → ResetDataModal (URL 미변경)

[뷰 간 이동]
  /standings  → 팀 클릭   → /roster/:teamId
  /schedule   → 결과 보기 → /result (location.state)
  /inbox      → 결과 보기 → /result (location.state)
  /           → 시즌 완료 → /season-review
  /           → PO 완료   → /playoff-review

[드래프트 흐름]
  /draft-lottery → 추첨 완료 → /draft → 드래프트 완료 → /

[시뮬레이션 (오버레이)]
  현재 페이지 → sim 시작 → GameSim 오버레이 (URL 유지) → /result → /
  현재 페이지 → 라이브    → LiveGame 오버레이 (URL 유지) → /result → /

[리로드 시 미완료 드래프트 복원]
  ProtectedLayout 진입 → draftPicks.order 있고 teams 없음 → /draft-lottery 리다이렉트
```

---

## 기존 버그 수정 (보너스)
- `SeasonReview`와 `PlayoffReview`가 AppRouter switch에 case 없어서 렌더링 안 되던 문제 → 라우트로 정상 등록

## 리스크 & 대응

| 리스크 | 대응 |
|--------|------|
| GameSim/LiveGame 오버레이가 URL 변경 시 깨짐 | 상태 기반 오버레이 유지, URL 미변경 |
| GameResult location.state 새로고침 시 소실 | `if (!result) return <Navigate to="/" />` 가드 |
| selectedTeamId 크로스 뷰 state 관리 | `/roster/:teamId` URL param으로 대체 |
| Vercel 직접 URL 접속 시 404 | `vercel.json` catch-all rewrite |
| 미완료 드래프트 상태에서 새로고침 | ProtectedLayout에서 감지 → `/draft-lottery` 리다이렉트 |
| rosterMode/draftPoolType 새로고침 시 소실 | DB `draftPicks`에서 복원 (poolType 저장됨) |
| EditorModal 전역 접근 필요 | GameContext에 `openEditor` 콜백 포함 또는 별도 state |

## 검증 체크리스트
1. `npm run build` 타입 에러 없이 성공
2. 모든 Sidebar 네비게이션 → URL 변경 + 뷰 렌더링
3. 브라우저 뒤로가기/앞으로가기 정상 동작
4. URL 직접 입력 → 해당 뷰 렌더링
5. 새로고침 시 현재 뷰 유지
6. GameSim → GameResult → Dashboard 흐름
7. Standings → /roster/:teamId URL 반영
8. `/result` 직접 접속 → `/` 리다이렉트
9. 기본 모드: /mode-select → /select-team → /onboarding → / 흐름
10. 커스텀 모드: /mode-select → /draft-pool-select → /select-team → /draft-lottery → /draft → / 흐름
11. 새로고침 시 미완료 드래프트 → /draft-lottery 자동 복원
12. Sidebar dropdown → /help, /draft-history 이동 + EditorModal 열림
