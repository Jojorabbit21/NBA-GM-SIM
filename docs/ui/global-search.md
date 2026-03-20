# 글로벌 검색 (GlobalSearch)

> 대시보드 헤더 좌측에 위치한 인메모리 검색 기능.
> 팀, 선수, 단장, 코치를 이름으로 검색하고 해당 상세 뷰로 즉시 이동할 수 있다.

---

## 위치 및 레이아웃

```
DashboardHeader 좌측 영역
┌──────────────────────────────────────────┐
│  [날짜 ▼]  |  동부 3위  |  🔥 W3        │  ← Row 1
│  [🔍 검색...]                            │  ← Row 2
│      ↓ 드롭다운 (입력 시 표시)           │
└──────────────────────────────────────────┘
```

- 검색창은 날짜 드롭다운 **아래** Row 2에 위치
- 컨퍼런스 순위/연승은 날짜 드롭다운 **우측** Row 1에 위치
- 드롭다운은 검색창 기준 `position: absolute` 아래 방향으로 표시 (`z-index: 200`)

---

## 검색 대상 및 결과 그룹

| 카테고리 | 검색 필드 | 최대 결과 수 | 클릭 시 이동 뷰 |
|----------|----------|------------|----------------|
| 팀 | `city + name` (예: "보스턴 세이지"), `teamId` | 5개 | `Roster` 뷰 |
| 선수 | `player.name` | 15개 | `PlayerDetail` 뷰 |
| 단장 | `GMProfile.name` | 5개 | `GMDetail` 뷰 |
| 코치 | `HeadCoach.name` | 5개 | `CoachDetail` 뷰 |

결과 순서: **팀 → 선수 → 단장 → 코치** (카테고리 내 원본 배열 순서 유지).

---

## 동작 방식

- 입력 즉시 필터링 (debounce 없음, 인메모리)
- 대소문자 무시 (`toLowerCase()` 비교)
- 빈 쿼리일 때 드롭다운 미표시
- 검색 결과 없을 때 "검색 결과 없음" 표시
- 항목 클릭 → 이동 후 쿼리 초기화 + 드롭다운 닫힘
- `Esc` 키 → 쿼리 초기화 + 드롭다운 닫힘
- 외부 클릭 (`mousedown` 이벤트) → 드롭다운 닫힘

---

## 파일 구조

```
components/dashboard/
├── DashboardHeader.tsx     # 검색 props 수신 + GlobalSearch 렌더링
└── GlobalSearch.tsx        # 검색 UI 전체 (신규)
```

### GlobalSearch props

```ts
interface GlobalSearchProps {
    allTeams: Team[];                                         // 30팀 전체 (선수 포함)
    leagueGMProfiles?: Record<string, GMProfile>;            // 리그 전체 GM
    coachingData?: Record<string, { headCoach: HeadCoach | null }>; // 리그 전체 코치
    onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
    onViewTeam: (teamId: string) => void;
    onViewGM: (teamId: string) => void;
    onViewCoach: (teamId: string) => void;
    themeText?: string; // 현재 팀 테마 텍스트 컬러 (인풋/아이콘에 적용)
}
```

---

## 데이터 흐름

```
App.tsx
  ├─ viewPlayerData / viewCoachData / viewGMTeamId / selectedTeamId   (상태 — 리프팅됨)
  ├─ handleSearchViewPlayer / handleSearchViewTeam / handleSearchViewGM / handleSearchViewCoach
  │
  ├─→ AppRouter.tsx  (기존 내부 뷰 네비게이션에 동일 상태 사용)
  │
  └─→ MainLayout.tsx (gameHeaderProps)
        └─→ DashboardHeader.tsx
              └─→ GlobalSearch.tsx
```

### 상태 리프팅 배경

기존에는 `viewPlayerData`, `viewCoachData`, `viewGMTeamId`, `selectedTeamId`가 `AppRouter` 내부 로컬 상태였다.
GlobalSearch는 `AppRouter` 외부(헤더)에 위치하므로 이 상태들을 `App.tsx`로 리프팅하여 양쪽에서 공유한다.

**`previousViewRef` (뒤로가기 추적)** 는 `AppRouter` 내부에 유지된다.
- 일반 뷰 내 클릭 네비게이션: `previousViewRef.current = view` 추적 후 이동 → `onBack` 시 정확한 이전 뷰로 복귀
- GlobalSearch 경유 네비게이션: `previousViewRef` 미추적 → `onBack` 시 `previousViewRef.current`(마지막 기록 뷰)로 복귀 (대부분 Dashboard)

---

## 디자인 규칙

- 인풋 배경: `rgba(255,255,255,0.08)`, 테두리: `rgba(255,255,255,0.12)` (팀 테마 오버레이)
- 포커스 시 인풋 너비 `140px → 180px` (CSS transition)
- 드롭다운 배경: `#1e293b` (slate-800 근사), 테두리: `rgba(255,255,255,0.1)`
- 카테고리 헤더: `text-slate-500 text-[10px] uppercase` + `bg-slate-950/40` 배경
- 호버 항목: `bg-indigo-500/20`
- 팀 항목: `TeamLogo` 컴포넌트 재사용
- 선수 항목: `OvrBadge` 컴포넌트 재사용 + 포지션/팀명 서브텍스트
- 단장/코치 항목: 텍스트 아바타 원형 (단 / 코)
