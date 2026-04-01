# NBA-GM-SIM 디자인 시스템 리뉴얼 작업지시서

- **문서 버전**: v1.0
- **작성일**: 2026-04-01
- **작성 목적**: 디자이너가 피그마에서 신규 디자인 시스템을 제작하기 위한 전체 작업 범위, 순서, 상세 스펙 정의

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [현행 디자인 시스템 (AS-IS)](#2-현행-디자인-시스템-as-is)
3. [신규 디자인 방향 (TO-BE)](#3-신규-디자인-방향-to-be)
4. [작업 단계 개요](#4-작업-단계-개요)
5. [Phase 1 — Foundations](#phase-1--foundations)
6. [Phase 2 — Layout Shell](#phase-2--layout-shell)
7. [Phase 3 — Primitive Components](#phase-3--primitive-components)
8. [Phase 4 — Composite Components](#phase-4--composite-components)
9. [Phase 5 — Table System](#phase-5--table-system)
10. [Phase 6 — Domain Components](#phase-6--domain-components)
11. [Phase 7 — Screen Layouts](#phase-7--screen-layouts)
12. [납품 기준 및 체크리스트](#12-납품-기준-및-체크리스트)

---

## 1. 프로젝트 개요

### 배경
NBA-GM-SIM은 NBA 구단 운영 시뮬레이션 게임으로, React 18 + TypeScript + Tailwind CSS + Vite 스택으로 제작된 웹 애플리케이션이다. 현재 디자인 시스템이 임시로 구성되어 있어 일관성이 부족하며, 서비스 확장에 앞서 체계적인 디자인 시스템 수립이 필요하다.

### 목표
- 피그마를 Single Source of Truth로 삼는 컴포넌트 기반 디자인 시스템 수립
- 30개 NBA 팀 컬러를 동적으로 지원하는 테마 구조 설계
- 재사용 가능한 컴포넌트 라이브러리 완성

### 기술 스택 (코드 구현 참고용)
| 항목 | 내용 |
|------|------|
| 프레임워크 | React 18 + TypeScript |
| 스타일링 | Tailwind CSS |
| 빌드 | Vite |
| 화면 해상도 기준 | 1920×1080 (데스크탑 전용, 모바일 미지원) |
| 레이아웃 | 좌측 40px 사이드바 + 1880px 본문 영역 |

---

## 2. 현행 디자인 시스템 (AS-IS)

> 신규 디자인을 만들 때 현행과의 차이를 명확히 인지하기 위한 참고 자료.

### 2-1. 컬러 토큰

#### Surface (배경)
| 토큰명 | 값 | 설명 |
|--------|-----|------|
| `surface` | `#0f172a` (slate-950) | 앱 전체 배경 |
| `surface/card` | `#1e293b` (slate-900) | 카드·패널 배경 |
| `surface/glass` | `rgba(30, 41, 59, 0.8)` | 반투명 글래스 효과 |
| `surface/hover` | `rgba(255, 255, 255, 0.05)` | 인터랙션 오버레이 |

#### Border (테두리)
| 토큰명 | 값 | 설명 |
|--------|-----|------|
| `line` | `#1e293b` (slate-800) | 기본 구분선 |
| `line/emphasis` | `#334155` (slate-700) | 강조 구분선 |
| `line/subtle` | `rgba(255, 255, 255, 0.05)` | 아주 연한 구분선 |

#### Brand Accent
| 토큰명 | 값 |
|--------|-----|
| `accent` | `#6366f1` (indigo-500) |
| `accent/hover` | `#818cf8` (indigo-400) |
| `accent/strong` | `#4f46e5` (indigo-600) |
| `accent/muted` | `rgba(99, 102, 241, 0.1)` |

#### Semantic States
| 역할 | DEFAULT | text | muted |
|------|---------|------|-------|
| success | `#10b981` (emerald-500) | `#34d399` (emerald-400) | emerald/10 |
| danger | `#ef4444` (red-500) | `#f87171` (red-400) | red/10 |
| warning | `#f59e0b` (amber-500) | `#fbbf24` (amber-400) | amber/10 |
| info | `#3b82f6` (blue-500) | `#60a5fa` (blue-400) | blue/10 |

#### Content (텍스트 계층)
| 단계 | 값 | 용도 |
|------|-----|------|
| `content` | `#f8fafc` (slate-50) | 주 텍스트 |
| `content/primary` | `#f1f5f9` (slate-100) | |
| `content/secondary` | `#e2e8f0` (slate-200) | 보조 텍스트 |
| `content/tertiary` | `#cbd5e1` (slate-300) | |
| `content/muted` | `#94a3b8` (slate-400) | 흐린 텍스트 |
| `content/subtle` | `#64748b` (slate-500) | 힌트·비활성 |

### 2-2. 타이포그래피

| 역할 | 폰트 | 크기 | 웨이트 | 비고 |
|------|------|------|--------|------|
| 본문 전체 | Pretendard Variable | 가변 | 가변 | `font-sport` 토큰 |
| 스코어보드 수치 | Seven Segment | 가변 | Regular | `font-digital` 토큰 | => 미사용 폰트. 선언문 및 관련 코드 삭제 요청
| 테이블 헤더 | Pretendard | 10–12px | Black (900) | uppercase, tracking-widest | 
| 한국어 | Pretendard | — | — | `.ko-tight` (-0.025em), `.ko-normal` (-0.01em) 클래스 사용 |

### 2-3. Border Radius
| 토큰 | 값 | 용도 |
|------|-----|------|
| `card` | `1.5rem` (24px) | 카드·패널 |
| `button` | `1rem` (16px) | 버튼 |
| `element` | `0.75rem` (12px) | 작은 요소 |
| — | `9999px` (full) | 배지·아바타 |

### 2-4. Shadow / Glow
| 토큰 | 값 | 용도 |
|------|-----|------|
| `glow-accent` | `0 0 15px rgba(99,102,241,0.5)` | 인디고 글로우 |
| `glow-success` | `0 0 8px rgba(16,185,129,0.5)` | 에메랄드 글로우 |
| `glow-ovr` | `0 0 25px rgba(232,121,249,0.9)` | OVR 배지 글로우 |

### 2-5. 테마 특성 요약

> **현재**: 슬레이트 계열 다크 네이비 (blue-tinted), 고정 인디고 액센트, Pretendard 폰트
> **신규**: 아연(zinc) 계열 뉴트럴 블랙, 팀컬러 동적 액센트, Inter + Noto Sans KR

핵심 변화:
- 배경 색조: **blue-tinted dark → neutral dark** (slate → zinc)
- 액센트: **고정 indigo → 팀컬러 동적 주입** (`--team-primary` CSS 변수)
- 폰트: **Pretendard → Inter** (한국어 폴백: Noto Sans KR)
- 네비게이션: **80px 아이콘 사이드바 → 40px 슬림 사이드바 + 상단 수평 텍스트 nav**

---

## 3. 신규 디자인 방향 (TO-BE)

### 3-1. 컬러 방향

```
베이스 팔레트: zinc (회색 계열, 파란기 없는 뉴트럴)
  zinc-900 (#18181b) → 앱 전체 배경
  zinc-800 (#27272a) → 사이드바·카드
  zinc-700 (#3f3f46) → 테두리
  zinc-600 (#52525b) → 입력창 테두리
  zinc-500 (#71717a) → 비활성 텍스트
  zinc-200 (#e4e4e7) → 보조 텍스트

팀컬러 동적 적용 방식:
  [data-team="ATL"] { --team-primary: #c8102e; --team-secondary: ...; }
  선택된 메뉴, 버튼, 하이라이트 등 모든 액센트 요소에 var(--team-primary) 사용
```

### 3-2. 타이포그래피 방향

```
주 폰트: Inter
한국어 폴백: Noto Sans KR
```

### 3-3. 레이아웃 방향

```
좌측 사이드바: 40px (아이콘만)
상단 네비게이션: 60px (팀정보 + 텍스트 메뉴 + 검색 + 경기시작 버튼)
본문: 5-column 그리드 (gap 16px, 좌우 패딩 24px)
```

---

## 4. 작업 단계 개요

```
Phase 1  Foundations          토큰·타이포·간격 확정
Phase 2  Layout Shell         사이드바·헤더·드롭다운 메뉴
Phase 3  Primitive Components 버튼·배지·입력·아바타 등 원자 단위
Phase 4  Composite Components 카드·탭·모달·드롭다운·슬라이더 등 분자 단위
Phase 5  Table System         테이블 전체 (셀→행→패턴 3레이어)
Phase 6  Domain Components    서비스 전용 복합 컴포넌트
Phase 7  Screen Layouts       화면 단위 조립·배치 검증
```

> **코드 구현 시작 가능 시점**: Phase 3 완료 후
> **핵심 화면 구현 가능 시점**: Phase 5 완료 후
> **Phase 6~7**: 화면별로 순차 납품 가능

---

## Phase 1 — Foundations

> 모든 컴포넌트가 이 값들을 참조한다. 가장 먼저, 가장 신중하게 확정할 것.

### 1-1. Color Tokens

#### Primitive Colors (원색 팔레트)
피그마 Color Styles 또는 Variables로 등록.

```
gray 팔레트: 50 / 100 / 200 / 300 / 400 / 500 / 600 / 700 / 800 / 900 / 950
zinc 팔레트: 50 / 100 / 200 / 300 / 400 / 500 / 600 / 700 / 800 / 900 / 950
```

NBA 30팀 컬러 (팀별 primary / secondary / text 3값씩, 총 90개):

| 팀 코드 | 팀명 | primary | secondary | text |
|---------|------|---------|-----------|------|
| ATL | Atlanta Hawks | `#c8102e` | `#061922` | white |
| BOS | Boston Celtics | `#007a33` | `#ba9653` | white |
| BKN | Brooklyn Nets | `#000000` | `#ffffff` | white |
| CHA | Charlotte Hornets | `#1d1160` | `#00788c` | white |
| CHI | Chicago Bulls | `#ce1141` | `#000000` | white |
| CLE | Cleveland Cavaliers | `#860038` | `#fdbb30` | white |
| DAL | Dallas Mavericks | `#00538c` | `#002b5e` | white |
| DEN | Denver Nuggets | `#0e2240` | `#fec524` | white |
| DET | Detroit Pistons | `#c8102e` | `#1d42ba` | white |
| GSW | Golden State Warriors | `#1d428a` | `#ffc72c` | white |
| HOU | Houston Rockets | `#ce1141` | `#000000` | white |
| IND | Indiana Pacers | `#002d62` | `#fdbb30` | white |
| LAC | LA Clippers | `#c8102e` | `#1d428a` | white |
| LAL | LA Lakers | `#552583` | `#fdb927` | white |
| MEM | Memphis Grizzlies | `#5d76a9` | `#12173f` | white |
| MIA | Miami Heat | `#98002e` | `#f9a01b` | white |
| MIL | Milwaukee Bucks | `#00471b` | `#eee1c6` | white |
| MIN | Minnesota Timberwolves | `#0c2340` | `#236192` | white |
| NOP | New Orleans Pelicans | `#0c2340` | `#c8102e` | white |
| NYK | New York Knicks | `#006bb6` | `#f58426` | white |
| OKC | Oklahoma City Thunder | `#007ac1` | `#ef3b24` | white |
| ORL | Orlando Magic | `#0077c0` | `#c4ced4` | white |
| PHI | Philadelphia 76ers | `#006bb6` | `#ed174c` | white |
| PHX | Phoenix Suns | `#1d1160` | `#e56020` | white |
| POR | Portland Trail Blazers | `#e03a3e` | `#000000` | white |
| SAC | Sacramento Kings | `#5a2d81` | `#63727a` | white |
| SAS | San Antonio Spurs | `#c4ced4` | `#000000` | black |
| TOR | Toronto Raptors | `#ce1141` | `#000000` | white |
| UTA | Utah Jazz | `#002b5c` | `#00471b` | white |
| WAS | Washington Wizards | `#002b5c` | `#e31837` | white |

#### Semantic Colors (역할별 매핑)
피그마 Variables → Semantic 컬렉션으로 등록.

```
Surface
  surface/bg          → zinc-900   앱 전체 배경
  surface/card        → zinc-800   카드·패널
  surface/elevated    → zinc-800 + border  드롭다운·모달
  surface/hover       → white/5    인터랙션 오버레이

Border
  border/default      → zinc-700   기본 테두리
  border/emphasis     → zinc-600   강조 테두리
  border/subtle       → white/10   아주 연한 구분

Text
  text/primary        → white      주 텍스트
  text/secondary      → zinc-200   보조
  text/muted          → zinc-500   흐린 텍스트
  text/disabled       → zinc-700   비활성

Accent (팀컬러 동적)
  accent/primary      → var(--team-primary)
  accent/secondary    → var(--team-secondary)
  accent/text         → var(--team-text)

Semantic States
  success/default     → #12b76a
  success/text        → #34d399
  success/muted       → success/10%
  warning/default     → #f59e0b
  warning/text        → #fbbf24
  warning/muted       → warning/10%
  danger/default      → #ef4444
  danger/text         → #f87171
  danger/muted        → danger/10%
  info/default        → #3b82f6
  info/text           → #60a5fa
  info/muted          → info/10%
```

---

### 1-2. Typography Scale

피그마 Text Styles로 등록.

| 스타일명 | 크기 | 웨이트 | Line Height | Letter Spacing | 용도 |
|---------|------|--------|-------------|----------------|------|
| Display | 32px | SemiBold (600) | 1.2 | -0.02em | 시즌 타이틀, 대형 수치 |
| Title | 24px | SemiBold (600) | 1.3 | -0.02em | 페이지 헤더 |
| Heading | 20px | SemiBold (600) | 1.4 | -0.01em | 섹션 헤더, 팀명 |
| Subheading | 18px | Medium (500) | 1.4 | -0.01em | W-L 기록 등 |
| Body-L | 16px | SemiBold (600) | 1.5 | 0 | 주요 레이블, 네비 메뉴 |
| Body-M | 14px | Medium (500) | 1.5 | 0 | 일반 본문 |
| Body-S | 12px | Medium (500) | 1.5 | 0 | 드롭다운 아이템 |
| Caption | 10px | Medium (500) | 1.4 | +0.02em | 부가 설명 |
| Label | 12px | Bold (700) | 1.2 | +0.08em | 테이블 헤더, 배지 (uppercase) |
| Mono | 14px | Regular (400) | 1.5 | 0 | 스코어, 금액 수치 |

---

### 1-3. Spacing Scale

피그마 Spacing Variables로 등록.

```
spacing/4   → 4px
spacing/8   → 8px
spacing/12  → 12px
spacing/16  → 16px
spacing/20  → 20px
spacing/24  → 24px
spacing/32  → 32px
spacing/40  → 40px
spacing/48  → 48px
spacing/64  → 64px
spacing/80  → 80px
spacing/96  → 96px
```

---

### 1-4. Border Radius Scale

```
radius/none  → 0
radius/xs    → 4px
radius/sm    → 8px   ← 드롭다운 아이템, 소형 요소
radius/md    → 12px
radius/lg    → 16px  ← 버튼, 카드 기본
radius/xl    → 24px  ← 대형 카드
radius/full  → 9999px ← 배지, 아바타
```

---

### 1-5. Elevation / Shadow

```
elevation/none  → 없음
elevation/sm    → 0 1px 3px rgba(0,0,0,0.4)       카드 기본
elevation/md    → 0 4px 12px rgba(0,0,0,0.5)      드롭다운
elevation/lg    → 0 8px 32px rgba(0,0,0,0.6)      모달
elevation/glow  → 0 0 15px var(--team-primary)/30%  팀컬러 글로우
```

---

## Phase 2 — Layout Shell

> 앱의 뼈대. 모든 화면이 이 안에서 렌더링된다.

### 2-1. Sidebar

**크기**: 40px × 1080px (고정)

| 요소 | 설명 |
|------|------|
| 배경 | `surface/card` (zinc-800) |
| 우측 보더 | `border/subtle` |

**아이콘 버튼 (SidebarIconButton)**

| 상태 | 스타일 |
|------|--------|
| Default | 아이콘 opacity 70%, 배경 없음 |
| Hover | 아이콘 opacity 100%, `surface/hover` 배경 |
| Active | 아이콘 opacity 100%, 팀컬러 틴트 배경 |

**아이콘 목록** (상단 그룹 12개, 하단 그룹 2개)

상단: Home / Mailbox / Front Office / Roster / Standings / Leaderboard / FA Market / Schedule / Playoffs / Tactics / Transactions / Training
하단: Profile / Settings

---

### 2-2. Top Navigation Bar

**크기**: 1880px × 60px

**영역 구성**:

```
[Left — 팀 정보 영역]
  팀 로고 (60px 원형, zinc-800 배경)
  팀명 (Heading, text/primary)
  W-L (Subheading, success/text)
  오늘 경기 (Body-M, text/muted)

[Center — 네비게이션]
  메뉴 버튼 5개 (Home / Mailbox / League / Front Office / Team)
  검색창 (SearchInput 컴포넌트)

[Right — 액션]
  Split Button "경기 시작" (팀컬러 배경)
```

**MenuButton 컴포넌트**

| Variant | 스타일 |
|---------|--------|
| Default | 텍스트만, `text/muted`, Body-L SemiBold |
| Selected | 팀컬러 배경, `text/primary`, `radius/sm` |
| Expanded | Selected + chevron 아이콘 (하위 메뉴 열림 상태) |

---

### 2-3. Dropdown Menu Panel (NavDropdown)

**공통 스타일**:
- 배경: `surface/elevated`
- 보더: `border/default`, `radius/sm`
- 그림자: `elevation/md`

**DropdownItem 컴포넌트**

| 상태 | 스타일 |
|------|--------|
| Default | `text/primary`, Body-S Medium |
| Hover | `surface/hover` 배경 |
| Selected | 팀컬러 배경, `radius/sm` |

**3가지 메뉴 패널 별도 작업**:

| 메뉴 | 항목 |
|------|------|
| League | Playoffs / Standings / Leaderboards / Schedules / Transactions / Free Agents |
| Front Office | General / Salaries / Coaching Staffs / Future Draft Picks / `[divider]` / My Profile |
| Team | Roster / Rotation & Depth / Opponent Analysis / Team Schedule / `[divider]` / Strategy |

---

### 2-4. Page Layout Frame

**기준 캔버스**: 1920×1080

```
전체 구조
  Sidebar (40px 고정)
  Body (1880px)
    TopNav (60px 고정)
    Content Area (5-column grid)
      columns: repeat(5, 1fr)
      gap: 16px
      padding: 24px
```

---

## Phase 3 — Primitive Components

> 독립적으로 존재하는 가장 작은 UI 요소. 다른 컴포넌트들이 이것들을 조합한다.

### 3-1. Button

**Variant × Size 전체 조합 작업**

#### Variant (6종)
| Variant | 배경 | 텍스트 | 보더 |
|---------|------|--------|------|
| Primary | 팀컬러 | white | 없음 |
| Secondary | `surface/card` | `text/primary` | `border/default` |
| Danger | `danger/default` | white | 없음 |
| Ghost | 투명 | `text/muted` | 없음 |
| Outline | 투명 | `text/primary` | `border/emphasis` |
| Brand | `accent/primary` | white | 없음 |

#### Size (5종)
| Size | Height | Font | H-Padding |
|------|--------|------|-----------|
| xs | 24px | Body-S | 8px |
| sm | 28px | Body-S | 10px |
| md | 36px | Body-M | 14px |
| lg | 40px | Body-L | 16px |
| xl | 48px | Body-L | 20px |

#### 추가 상태 (모든 Variant에 적용)
- **Hover**: 밝기 10% 증가
- **Active**: 밝기 15% 감소
- **Loading**: 좌측 스피너 + 텍스트 opacity 60%
- **Disabled**: 전체 opacity 40%, 커서 not-allowed

#### Split Button (별도 작업)
경기시작 버튼 전용 패턴. 좌측 텍스트 영역 + 세로 divider + 우측 아이콘 영역.

---

### 3-2. Badge

#### 일반 Badge
| Variant | 배경 | 텍스트 |
|---------|------|--------|
| Neutral | zinc-700 | zinc-200 |
| Success | success/muted | success/text |
| Warning | warning/muted | warning/text |
| Danger | danger/muted | danger/text |
| Info | info/muted | info/text |
| Brand | 팀컬러/muted | 팀컬러/text |

Size: sm (height 16px, Label 10px) / md (height 20px, Label 12px)

#### OVR Badge (7티어)
| 티어 | OVR 범위 | 컬러 | Glow |
|------|----------|------|------|
| S | 97+ | fuchsia | 있음 |
| A+ | 94–96 | purple | 없음 |
| A | 91–93 | blue | 없음 |
| B+ | 88–90 | emerald | 없음 |
| B | 85–87 | lime | 없음 |
| C | 79–84 | amber | 없음 |
| D | ~78 | zinc-500 | 없음 |

Size: xs / sm / md / lg / xl (각각 다른 크기)

#### Direction Badge (팀 방향성, 5종)
Win Now / Buyer / Stand Pat / Seller / Tanking — 각각 고유 컬러

#### Position Badge (5종)
PG / SG / SF / PF / C

#### Contract Tag (7종)
Rookie / Veteran / Max / Min / 2-Way / Team-Option / Player-Option

---

### 3-3. Input

| 속성 | 내용 |
|------|------|
| 상태 | Default / Focus / Disabled / Error |
| Size | sm / md / lg |
| 옵션 | prefix 아이콘 슬롯 / suffix 아이콘 슬롯 |

**SearchInput (특화형)**
magnifier 아이콘 내장, placeholder "검색"

---

### 3-4. Toggle / Checkbox

**Toggle Switch**: Off / On / Disabled
**Checkbox**: Unchecked / Checked / Indeterminate / Disabled

---

### 3-5. Avatar / Team Logo

| 컴포넌트 | Size 종류 |
|---------|----------|
| Avatar (선수·GM·코치) | xs(20) / sm(24) / md(32) / lg(40) / xl(48) |
| Team Logo | xs(20) / sm(24) / md(32) / lg(40) / xl(56) / 2xl(72) / 3xl(96) |

Team Logo 추가 variant: `faded` (opacity 50%, 탈락팀 표시)

---

### 3-6. Tooltip

| Variant | 내용 |
|---------|------|
| Simple | 한 줄 텍스트 |
| Rich | 선수 요약 (이름 + OVR + 주요 스탯 3개) |

---

### 3-7. Loading / Skeleton

**Spinner**: sm / md / lg

**Skeleton**:
| Type | 용도 |
|------|------|
| Line | 텍스트 대체 (가변 너비) |
| Card | 카드 전체 대체 |
| TableRow | 테이블 행 대체 (shimmer 애니메이션) |

---

## Phase 4 — Composite Components

> Primitive 조합으로 만들어지는 재사용 복합 요소.

### 4-1. Card

| 속성 | 옵션 |
|------|------|
| Variant | Default / Glass / Outline / Flat |
| Padding | none / sm(12px) / md(16px) / lg(24px) |
| 상태 | Default / Hover (클릭 가능할 때) / Selected |
| 옵션 | 헤더 슬롯 / 푸터 슬롯 / 팀컬러 상단 라인(4px) |

---

### 4-2. Tab Bar

| Type | 설명 |
|------|------|
| Underline | 선택 탭 하단 라인 강조 (기본형) |
| Filled | 선택 탭 배경 채움 |
| Chip | 분리된 캡슐형 |

각 Tab Item 상태: Default / Selected / Disabled
옵션: 우측 숫자 배지 슬롯 (미읽음 카운트 등)

---

### 4-3. Modal

| 속성 | 옵션 |
|------|------|
| Size | sm(400px) / md(560px) / lg(720px) / xl(960px) / full |
| Header Color | default / team(팀컬러) / danger |
| 구성 | 헤더(타이틀 + 닫기 버튼) + 콘텐츠 영역(스크롤) + 푸터(우측 정렬 액션) |

---

### 4-4. Dropdown

| 요소 | 설명 |
|------|------|
| DropdownButton | 트리거. 레이블 + 아이콘 + chevron(열림/닫힘) |
| DropdownPanel | 패널 컨테이너. `surface/elevated`, `elevation/md` |
| DropdownItem | Default / Hover / Selected / Danger / Disabled |
| DropdownDivider | `border/subtle` 가로 구분선 |

---

### 4-5. Slider Control

| Type | 설명 |
|------|------|
| Continuous | 자유 이동 트랙 + 핸들 |
| Step | 정해진 스텝 위치에 snap |

공통 요소: 상단 레이블 / 좌우 끝 레이블 / 핸들 hover 시 툴팁 / 현재 값 표시

---

### 4-6. Toast

| 속성 | 옵션 |
|------|------|
| Variant | Success / Warning / Danger / Info |
| 구성 | 아이콘 + 메시지 + 닫기 버튼 + 하단 Progress Bar(3초) |
| 위치 | 화면 하단 중앙 고정 |

---

### 4-7. Stat Card

대시보드용 단일 수치 카드.

```
구성
  상단: 레이블 (Label 스타일)
  중앙: 대형 수치 (Title 스타일)
  하단: 순위 또는 트렌드
    trend/up    → success 컬러, 화살표 위
    trend/down  → danger 컬러, 화살표 아래
    trend/neutral → text/muted
```

---

## Phase 5 — Table System

> 서비스에서 가장 많이 쓰이는 복잡한 컴포넌트 그룹.
> **Cell → Row → Table Pattern** 3개 레이어로 분리해서 작업하면 조합이 자유로워진다.

---

### Layer 1-A. Header Cell (4종)

모든 Header Cell 공통 스타일: **Label 타이포** (uppercase, Bold, tracking-wide), `text/muted`

| 종류 | 설명 | 추가 요소 |
|------|------|----------|
| `Default` | 기본 레이블 | — |
| `Sortable` | 정렬 가능 컬럼 | ColumnSortIcon (Neutral / Ascending / Descending) |
| `Group` | 2단 헤더 상단 (그룹명) | 가운데 정렬, 하단 border, colspan 역할 |
| `Sticky` | 좌측 고정 컬럼 | 배경색 강조, 우측 border |

---

### Layer 1-B. Body Cell (12종)

| 종류 | 용도 | 표현 방식 | Variant / 상태 |
|------|------|----------|---------------|
| `Text` | 기본 문자열 | Body-M | Default / Muted |
| `Number` | 순수 수치 | Body-M, 우측 정렬 | Default / Muted |
| `Stat` | 경기 스탯 수치 | Body-M, 컬러 코딩 | Positive(success) / Negative(danger) / Neutral |
| `Attribute` | 선수 능력치 | Body-M + 배경 색상 | S(97+) / A(88+) / B(77+) / C(66+) / D(~65) |
| `Player` | 선수 정보 인라인 | Avatar(sm) + 이름 + 서브텍스트 | Default / Injured / Clickable |
| `Team` | 팀 정보 인라인 | TeamLogo(sm) + 팀명 | Default / Clickable / Eliminated(muted) |
| `OVR` | OVR 배지 | OvrBadge 컴포넌트 재사용 | (배지 자체 티어로 구분) |
| `Rank` | 순위 숫자 | Body-M | 1st(amber) / 2nd(zinc-300) / 3rd(amber-700) / Rest(muted) |
| `Badge` | 상태·포지션 배지 | Badge 컴포넌트 재사용 | (배지 variant로 구분) |
| `Contract` | 연봉 금액 | Mono, 우측 정렬 | Current / Future / Option / Expired(strikethrough) / DeadCap(danger muted) |
| `Action` | 인라인 버튼 | Button(xs or sm) | — |
| `Empty` | 빈 값 | "—" 텍스트, `text/muted` | — |

---

### Layer 2. Row (5종)

| 종류 | 설명 | 배경 / 스타일 |
|------|------|--------------|
| `DataRow` | 일반 데이터 행 | Default(투명) / Hover(`surface/hover`) / Highlighted(amber-900/10) |
| `GroupRow` | 그룹 구분 헤더 행 | `surface/flat`, Label 타이포, `text/muted`, uppercase |
| `CutoffRow` | 하단 컷오프 라인 포함 행 | DataRow + 하단 2px 라인 (Playoff=success / PlayIn=warning) |
| `FooterRow` | 합계·평균 행 | `surface/card`, 상단 `border/emphasis` |
| `SkeletonRow` | 로딩 중 임시 행 | TableRow Skeleton 패턴, shimmer 효과 |

추가: `EmptyRow` — colspan 전체, 중앙 정렬 "데이터 없음" 텍스트

---

### Layer 3. Table Patterns (5가지 유형)

#### Pattern A. SimpleTable
**해당 화면**: Standings, Trade History

```
구성
  [Header]  Sticky + Sortable cells
  [Body]    DataRow / GroupRow / CutoffRow 혼합
  [Footer]  없음

옵션
  Pagination (Simple 타입, Trade History만 사용)
  GroupRow (Standings의 Conference/Division 모드)
  CutoffRow (Standings 6위·10위 라인)
```

#### Pattern B. AttributeTable
**해당 화면**: RosterGrid, LeaderboardTable, Staff FA

```
구성
  [Toolbar]   탭 필터 (예: Roster탭 / Stats탭)
  [Header 1]  Group cells (그룹명, colspan)
  [Header 2]  Sortable cells (개별 컬럼명)
  [Body]      DataRow + Attribute cells
  [Footer]    FooterRow (팀 평균, 선택적)

특이사항
  좌측 고정 컬럼 (Sticky): 이름·포지션·나이·OVR
  탭 전환 시 컬럼 세트 교체 (능력치 탭 / 스탯 탭)
```

**RosterGrid 컬럼 세트 참고**:

| 탭 | 그룹 | 컬럼 |
|----|------|------|
| 능력치 | INSIDE | ins/lnp/mid/drv |
| 능력치 | OUTSIDE | 3pt/ctr/fth |
| 능력치 | PLAYMAKING | pas/han/iq/vis |
| 능력치 | DEFENSE | drd/did/prd/bk/stl |
| 능력치 | REBOUND | orb/drb |
| 능력치 | ATHLETIC | spd/acc/str/vert/dur/sta |
| 스탯 | — | G/GS/MIN/PTS/REB/AST/STL/BLK/TOV/PF/FG%/3P%/FT%/TS%/+/- |

#### Pattern C. StatsTable
**해당 화면**: BoxScore

```
구성
  [Header]   Sticky + Sortable cells
  [Body]     DataRow (Highlighted variant 포함)
  [Footer]   FooterRow (팀 합계)

특이사항
  좌측 고정: 선수 정보 (Avatar + 이름 + 포지션 + OVR + 피로도)
  특수 마커 인라인:
    MVP     → crown 아이콘 (amber)
    Stopper → shield 아이콘 (info)
  피로도 컬러: 25%+ = danger / 15%+ = warning / 이하 = success
```

**BoxScore 컬럼 목록**:
MIN / PTS / REB / AST / STL / BLK / TOV / PF / TF / FF / FG / FG% / 3P / 3P% / FT / FT% / +/-

#### Pattern D. ContractTable
**해당 화면**: Payroll (샐러리 탭)

```
구성
  [Header]   Sticky 선수명 컬럼 + 연도 레이블 컬럼들 + 액션 컬럼
  [Body]     DataRow + Contract cells + Action cell
             DeadCap 행 (danger muted 배경)
  [Footer]   FooterRow (연도별 합계)

특이사항
  좌측 고정: 선수명
  연도 컬럼: 현재 시즌 기준 최대 6년 동적 생성
  인라인 액션: 연장 / 방출 버튼
```

#### Pattern E. ActionTable
**해당 화면**: FAView (선수 FA), Coaching Staff FA

```
구성
  [Toolbar]   검색 + 포지션 필터
  [Header 1]  Group cells (카테고리)
  [Header 2]  Sortable cells + Action 헤더
  [Body]      DataRow + Action cell (우측 고정)
  [Footer]    없음
```

---

### Table Accessories

#### TableToolbar
| Type | 구성 요소 |
|------|----------|
| TabFilter | 탭 버튼 그룹 (모드 전환) |
| SearchFilter | SearchInput |
| CheckboxFilter | 팀·포지션 멀티선택 |
| Mixed | 위 요소들 조합 |

#### Pagination
| Type | 설명 |
|------|------|
| Simple | Prev / 현재 페이지 표시 / Next |
| Full | 페이지 번호 버튼 (1…7…N) + 행수 선택 드롭다운 (25/50/75/100) |

---

## Phase 6 — Domain Components

> 이 서비스에서만 쓰이는 전용 복합 컴포넌트.

### 6-1. 경기·일정 관련

| 컴포넌트 | 구성 | Variant |
|---------|------|---------|
| `MatchCard` | 팀 로고(xl) + 팀명 + 날짜 + 시간 + 장소(H/A) | Upcoming / Live / Finished |
| `GameResultRow` | 날짜 + 상대팀 로고(sm) + 팀명 + 승패 Badge + 점수 | Win / Loss |
| `GameCard` | 일정 화면용 카드 (신규 디자인, 5개 나란히 배치) | Upcoming / Live / Finished |
| `ScoreBoard` | 팀명 + 점수(Mono 대형) + 쿼터/잔여시간 | Live / Final |

### 6-2. 트레이드 관련

| 컴포넌트 | 구성 | Variant |
|---------|------|---------|
| `TradeOfferCard` | 팀컬러 보더 + 제안 선수 목록 + 수락/거절 버튼 | Pending / Accepted / Rejected |
| `DraftPickChip` | 연도 + 라운드(1st/2nd) + 보호조건 텍스트 | Owned / Owed / Protected / Swap |

### 6-3. 선수·평가 관련

| 컴포넌트 | 구성 | 비고 |
|---------|------|------|
| `PlayerCard` | OVR Badge + 이름 + 포지션 + 나이 + 연봉 | 트레이드·드래프트·FA 리스트용 |
| `StarRating` | 그라디언트 별 1~5점 (0.5 단위) | |
| `RadarChart` | 6각형 다중 오버레이 | 팀·선수 비교, 최대 2개 오버레이 |

### 6-4. 재정 관련

| 컴포넌트 | 구성 | Variant |
|---------|------|---------|
| `CapBar` | 샐러리캡 프로그레스 바 (사용중/예외조항/여유분) | Under-cap / Near-cap / Over-cap |
| `FinanceRow` | 항목명 + 금액 + 비율 바 | Income / Expense |

### 6-5. 뎁스차트·로테이션

| 컴포넌트 | 구성 | 상태 |
|---------|------|------|
| `DepthSlot` | 포지션 슬롯 (Starter/Bench/3rd) | Empty / Filled / DragHover |
| `RotationCell` | Gantt 한 칸 (0~48분 단위) | Active / Inactive / DragHover |

### 6-6. 플레이오프

| 컴포넌트 | 구성 | 상태 |
|---------|------|------|
| `BracketBox` | 팀 로고(md) + 팀명 + 시리즈 스코어 | Winner / Loser / InProgress |

---

## Phase 7 — Screen Layouts

> Phase 1~6 완성 후 실제 화면 단위로 컴포넌트를 배치하고 그리드·간격을 검증.

### 우선순위 및 그리드 구성

| 순위 | 화면 | 그리드 구성 |
|------|------|------------|
| 1 | Home | 5-col 3-row (메뉴트리 기준 배치) |
| 2 | FrontOffice / General | 좌 3col (재정) + 우 1col (구단주) + 우 1col (시장) |
| 3 | FrontOffice / Salaries | 좌 4col (테이블) + 우 1col (캡 정보) |
| 4 | Team / Roster | 풀폭 테이블 |
| 5 | League / Standings | 상단 탭 + 풀폭 테이블 |
| 6 | Mailbox | 좌 2col (컨트롤+목록) + 우 3col (메일 상세) |
| 7 | League / Schedules | 월·일 탭 + 5col 게임카드 그리드 |
| 8 | Team / Rotation & Depth | 뎁스차트 섹션 + Gantt 섹션 (세로 적층) |

### Home 화면 상세 그리드

| | col 1–2 | col 3 | col 4 | col 5 |
|---|---------|-------|-------|-------|
| row 1 | Next Match + 경기시작 버튼 | Mailbox | Team Stats | My Profile |
| row 2 | Standings | Roster (2col) | Injured List | Revenue |
| row 3 | Standings | Roster (2col) | Top Free Agents | Quick Links |

---

## 12. 납품 기준 및 체크리스트

### 피그마 파일 구조 (권장)
```
페이지 1: Foundations      (Color / Typography / Spacing / Shadow 토큰)
페이지 2: Layout Shell     (Sidebar / TopNav / NavDropdown / Grid)
페이지 3: Primitives       (Button / Badge / Input / Toggle / Avatar / Tooltip)
페이지 4: Composites       (Card / Tab / Modal / Dropdown / Slider / Toast)
페이지 5: Table System     (Cell 12종 / Row 5종 / Pattern A~E / Accessories)
페이지 6: Domain           (경기·트레이드·선수·재정·뎁스·플레이오프)
페이지 7: Screens          (화면 레이아웃 조립본)
```

### 각 컴포넌트 납품 시 포함 항목

- [ ] 모든 Variant 작업 완료
- [ ] 모든 상태(Default / Hover / Active / Disabled / Loading 등) 작업 완료
- [ ] Auto Layout 적용 (크기 조정 시 깨지지 않아야 함)
- [ ] Component 등록 (재사용 가능한 단위로 Figma Component 처리)
- [ ] 컬러는 반드시 Color Styles 또는 Variables 참조 (하드코딩 금지)
- [ ] 타이포그래피는 반드시 Text Styles 참조 (하드코딩 금지)

### 코드 연동 시 주의사항

- 팀 컬러는 CSS Variable (`--team-primary`, `--team-secondary`, `--team-text`) 로 구현
- 컬러 토큰명을 피그마와 코드에서 동일하게 유지
- 테이블 Cell 컴포넌트는 피그마에서도 독립 컴포넌트로 분리해야 코드 매핑 가능

---

*이 문서는 디자인 진행 상황에 따라 업데이트될 수 있습니다.*
