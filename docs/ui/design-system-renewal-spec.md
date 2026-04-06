# NBA-GM-SIM 디자인 시스템 리뉴얼 작업지시서

- **문서 버전**: v1.0
- **작성일**: 2026-04-01
- **작성 목적**: 디자이너가 피그마에서 신규 디자인 시스템을 제작하기 위한 전체 작업 범위, 순서, 상세 스펙 정의

---

## 코드 구현 TODO

> 디자인 작업 중 발견된 코드 구현 필요 항목. 디자인 완료 후 일괄 처리.

- [ ] `tailwind.config.js` — `fontSize`에 `text-2xs` 추가 (10px / line-height 14px)

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
| 스코어보드 수치 | ~~Seven Segment~~ | — | — | ~~`font-digital`~~ | **미사용 폰트 — 삭제 예정** (index.css, tailwind.config.js, ScoreGraph.tsx)
| 테이블 헤더 | Pretendard | 10–12px | Black (900) | uppercase, tracking-widest | 
| 한국어 | Pretendard | — | — | `.ko-tight` (-0.025em), `.ko-normal` (-0.01em) 클래스 사용 |

### 2-3. Border Radius
> **커스텀 alias 제거됨** — `rounded-card`, `rounded-button`, `rounded-element` 토큰 삭제. Tailwind 표준 클래스 직접 사용.

| 기존 토큰 | 대체 클래스 | 값 |
|----------|------------|-----|
| ~~`card`~~ | `rounded-3xl` | 24px |
| ~~`button`~~ | `rounded-2xl` | 16px |
| ~~`element`~~ | `rounded-xl` | 12px |
| — | `rounded-full` | 9999px |

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
- 폰트: **Pretendard → Pretendard Variable (단일)** (Inter/Noto Sans 미사용으로 확정)
- 네비게이션: **80px 아이콘 사이드바 → 40px 슬림 사이드바 + 상단 수평 텍스트 nav**

---

## 3. 신규 디자인 방향 (TO-BE)

### 3-1. 컬러 방향

```
베이스 팔레트: zinc (회색 계열, 파란기 없는 뉴트럴)
  zinc-950 (#09090b) → 앱 전체 배경 (body)
  zinc-900 (#18181b) → 사이드바
  zinc-800 (#27272a) → 카드·패널
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
주 폰트: Pretendard Variable (단일 — 영문/한국어 모두)
Seven Segment: 미사용 → 선언문 및 관련 코드 삭제 예정
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
피그마 **Colors 컬렉션 (Default mode)** 에 등록된 전체 팔레트. (source: Default.tokens.json)

```
[뉴트럴 — 주력 팔레트]
zinc          50~950 (불투명)
zinc/transparent  10 / 20 / 30 / 40 / 50 / 60 / 70 / 80 / 90  (zinc-950 기반 반투명)

[베이스]
base/white                → #FFFFFF
base/white/transparent    → 5 / 10 / 20  (white 기반 반투명)
base/black                → #000000

[크로마틱 팔레트 — 모두 50~900 스케일]
red, yellow, green, blue, indigo, purple, pink
orange, amber, lime, emerald, teal, cyan, light-blue, violet, fuschia, rose
blue-gray (= Tailwind slate)
cool-gray  (= Tailwind gray)
true-gray  (= Tailwind neutral, 10/50/200~900)
warm-gray  (= Tailwind stone)

[OVR 등급 컬러 — Colors 그룹 내 별도 정의]
ovr/s      → bg #C026D3 (fuschia-600) / text #FFFFFF / glow #D946EF (fuschia-500)
ovr/a-plus → bg #9333EA (purple-600)  / text #FFFFFF / glow #A855F7 (purple-500)
ovr/a      → bg #7C3AED (violet-600)  / text #FFFFFF / glow #8B5CF6 (violet-500)
ovr/b-plus → bg #059669 (emerald-600) / text #FFFFFF / glow #10B981 (emerald-500)
ovr/b      → bg #65A30D (lime-600)    / text #FFFFFF / glow #84CC16 (lime-500)
ovr/c      → bg #D97706 (amber-600)   / text #FFFFFF / glow #F59E0B (amber-500)
ovr/d      → bg #52525B (zinc-600)    / text #E4E4E7 (zinc-200)  [글로우 없음]
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
피그마 **Variables → Semantic 컬렉션 (Mode 1)** 에 등록. Colors 팔레트를 alias로 참조하는 2-레이어 구조.
(source: Mode 1.tokens.json — 사용자가 직접 수정한 항목은 ✓ 표기)

```
Surface
  surface/background  → zinc/900 (#18181B)              앱 전체 배경 (body) ※ 이름이 bg가 아닌 background
  surface/sidebar     → zinc/900 (#18181B)              사이드바 (background와 동일값)
  surface/card        → zinc/800 (#27272A)              카드·패널
  surface/elevated    → zinc/800 (#27272A)              드롭다운·모달
  surface/hover       → zinc/600 (#52525B)              불투명 단색 — Ghost 버튼 hover에는 base/white/transparent/5 직접 사용
  surface/disabled    → zinc/700 (#3F3F46)              버튼 비활성 배경 (전 variant 공통)
  surface/flat        → zinc/transparent/40             rgba(9,9,11,0.4) 반투명 배경
  surface/sunken      → zinc/transparent/60             rgba(9,9,11,0.6) 더 어두운 반투명
  surface/subtle      → zinc/transparent/20             rgba(9,9,11,0.2) 아주 연한 반투명

Overlay
  overlay/dim         → zinc/transparent/80             rgba(9,9,11,0.8) 모달 뒤 딤 처리

Border
  border/dim          → zinc/800 (#27272A)              레이아웃 셸 구분선 (사이드바, 헤더)
  border/default      → zinc/700 (#3F3F46) ✓           카드·패널 일반 테두리
  border/emphasis     → zinc/600 (#52525B)              강조 테두리
  border/subtle       → base/white/transparent/5        rgba(255,255,255,0.05) 연한 구분
  border/subtler      → base/white/transparent/10       rgba(255,255,255,0.10) 좀 더 진한 구분
  border/inverse      → zinc/200 (#E4E4E7)              라이트 컴포넌트 보더 (Secondary 버튼)

Text
  text/primary        → zinc/50  (#FAFAFA)              주 텍스트 (순수 white 아님)
  text/secondary      → zinc/200 (#E4E4E7)              보조 텍스트
  text/muted          → zinc/400 (#A1A1AA)              흐린 텍스트
  text/disabled       → zinc/500 (#71717A)              비활성 레이블
  text/inverse        → zinc/800 (#27272A)              라이트 배경 위 다크 텍스트 (Secondary 버튼)
  text/link           → amber/500 (#F59E0B)             링크 텍스트

CTA (인디고 고정 — Primary 버튼 전용)
  cta/subtle          → indigo/300 (#A5B4FC)            Loading 텍스트
  cta/border          → indigo/400 (#818CF8)            보더 (전 활성 상태 공통)
  cta/default         → indigo/500 (#6366F1)            Hover·Loading 배경
  cta/strong          → indigo/600 (#4F46E5)            Default 배경 그라디언트 시작
  cta/stronger        → indigo/800 (#3730A3)            Default 배경 그라디언트 끝, Pressed 시작
  cta/muted           → indigo/500 at 0.1% ⚠️ 버그     (alpha 0.001, 0.1로 수정 필요)

Accent (팀컬러 동적 — Team Colors 컬렉션 alias)
  accent/primary      → var(--team-primary)
  accent/secondary    → var(--team-secondary)
  accent/text         → var(--team-text)

Status (status/ prefix로 네임스페이스 구분)
  status/success/default  → emerald/500 (#10B981)
  status/success/strong   → emerald/600 (#059669)
  status/success/text     → emerald/400 (#34D399)
  status/success/muted    → emerald/500 at 10%

  status/danger/default   → red/500 (#EF4444) ✓        Hover 배경
  status/danger/strong    → red/600 (#DC2626) ✓        Default 배경
  status/danger/deeper    → red/700 (#B91C1C)           Pressed 그라디언트 시작점
  status/danger/border    → red/400 (#F87171)           보더 전용
  status/danger/text      → red/400 (#F87171)           텍스트 전용 (배지, 인라인 등)
  status/danger/subtle    → red/300 (#FCA5A5)           Loading 텍스트
  status/danger/muted     → red/500 at 10%

  status/warning/default  → amber/500 (#F59E0B)
  status/warning/strong   → amber/600 (#D97706)
  status/warning/text     → amber/400 (#FBBF24)
  status/warning/muted    → orange/500 at 10% (#F97316) ⚠️ amber 아닌 orange 참조 중

  status/info/default     → light-blue/500 (#0EA5E9)    (blue 팔레트 아닌 light-blue)
  status/info/strong      → light-blue/600 (#0284C7)
  status/info/text        → light-blue/400 (#38BDF8)
  status/info/muted       → light-blue/500 at 10%

OVR (Semantic에서 미작업 — 전부 #FFFFFF 플레이스홀더)
  ovr/s / ovr/a-plus / ovr/a / ovr/b-plus / ovr/b / ovr/c / ovr/d
  → 실제값은 Colors 그룹의 ovr/* 참조 (Primitive Colors 섹션 참고)
```

---

### 1-2. Typography Scale

피그마 Text Styles로 등록. **Font Family: Pretendard Variable (전체 공통)**

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
| 배경 | `surface/card` (zinc-900 `#18181b`) |
| 우측 보더 | `border/default` (zinc-700 `#3f3f46`) |

**아이콘 버튼 (SidebarIconButton)**

| 상태 | 스타일 |
|------|--------|
| Default | 아이콘 opacity 70%, 배경 없음 |
| Hover | 아이콘 opacity 100%, `surface/hover` 배경 |
| Active | 아이콘 opacity 100%, `zinc-950` 단색 배경 |

**아이콘 목록**

```
그룹 1 (divider 없음)
  House       → 홈
  Inbox       → 받은 메일함

[divider]

그룹 2 (My Team)
  Landmark         → 프론트 오피스
  CircleDollarSign → 샐러리 (프론트 오피스 > 샐러리 탭)
  Users            → 로스터
  GitPullRequestClosed → 전술
  TrafficCone      → 훈련 (미구현, 추후 활성화)

[divider]

그룹 3 (League)
  ListOrdered      → 순위표
  ChartNoAxesColumn → 리더보드
  ArrowLeftRight   → 선수 이동
  ZoomIn           → 자유 계약
  Calendar         → 리그 일정
  Medal            → 플레이오프 (정규시즌 종료 시에만 표시)

하단 그룹
  CircleUser  → 프로필 드롭다운
  Settings    → 시뮬레이션 설정
```

---

### 2-2. Top Navigation Bar

> **피그마 디자인 최우선 적용**

**크기**: 1880px × 80px

**영역 구성**:

```
[Left — 팀 정보 영역] left: 0, vertically centered
  팀 로고 (60×60px, zinc-800 배경, border 4px, rounded-full)
  팀명 (20px SemiBold, white)
  W-L (18px Medium, success-500 #12b76a)
  DateSkipperDropdown — "오늘 10월 22일 vs 차저스" (14px Medium, white)
    → 우측 ChevronDown 아이콘 포함
    → 클릭 시 날짜 이동 드롭다운 열림

[Center — 네비게이션] left: 409px, top: 26px
  MenuButton 5개: 홈 / 받은 메일함 / 리그 / 구단 / 팀
  SearchInput (260px, zinc-900 배경, zinc-600 2px 보더, rounded-lg, inset shadow)
  gap: 64px (메뉴그룹↔검색)

[Right — 액션 버튼 그룹] right: 32px, vertically centered
  경기 있는 날:
    ActionButton Primary — "경기 시작 (vs 상대팀)" + Play 아이콘
    ActionButton Secondary (onlyIcon) — 보조 액션 (나란히 배치)
  경기 없는 날:
    ActionButton Primary 단독 배치

  **컬러**: 모든 팀 동일하게 orange 고정 (팀컬러 비의존)

  **버튼 문구 우선순위**:
  | 상황 | 버튼 문구 | Secondary 버튼 |
  |------|----------|--------------|
  | 시뮬레이션 처리 중 | 로더 아이콘 + 현재 작업 텍스트 (simProgress.label) | 비활성 |
  | 드래프트 로터리 대기 | "로터리 추첨하기" | 숨김 |
  | 신인 드래프트 대기 | "드래프트 시작" | 숨김 |
  | 경기 있는 날 | "경기 시작 (vs 상대팀)" | 표시 |
  | 경기 없는 날 / 날짜 이동 | "내일로 이동" 등 | 숨김 |
  | 오프시즌 | "오프시즌" | 숨김 |

  → 스킵 불가 이벤트(로터리/드래프트) 클릭 시 해당 화면으로 강제 이동
```

**MenuButton 컴포넌트**

| Variant | 스타일 |
|---------|--------|
| Default | 16px SemiBold, `zinc-500`(#71717a), 배경 없음 |
| Selected | 팀컬러 배경, white, `rounded-lg`(8px), chevron 없음 |
| Expanded | 팀컬러 배경, white, `rounded-lg`(8px), chevron 아이콘 포함 |

- 홈·받은메일함: chevron 없음
- 리그·구단·팀: chevron 포함 (Expanded 상태 가능)
- 메뉴 간격: gap 48px

---

### 2-3. Dropdown Menu Panel (NavDropdown)

> **피그마 디자인 최우선 적용**

**공통 스타일**:
- 배경: `black` (`#000000`)
- 보더: `zinc-700`(#3f3f46) 1px, `rounded-lg`(8px)
- 내부 padding: 8px, item gap: 4px

**DropdownItem 컴포넌트**

| 상태 | 스타일 |
|------|--------|
| Default | 12px Medium, white, `rounded-lg`(8px) |
| Hover | `surface/hover` 배경 |
| Selected | 팀컬러 배경, white, `rounded-lg`(8px) |

**3가지 메뉴 패널**:

| 메뉴 | 항목 |
|------|------|
| 리그 | 플레이오프 / 순위표 / 리더보드 / 리그 일정 / 선수 이동 / 자유 계약 |
| 구단 | 프론트 오피스 / 샐러리 캡 / 코칭 스태프 / 드래프트 픽 / `[divider]` / John Smith(프로필) |
| 팀 | 로스터 / 뎁스차트&로테이션 / 다음 경기 분석 / 팀 일정 / `[divider]` / 전술 설정 |

---

### 2-4. ActionButton (헤더 전용)

> 일반 Button과 별도. 헤더 우측 액션 버튼 전용 컴포넌트. 팀컬러 기반.

#### Props
```
type:     "Primary" | "Secondary"
size:     "Medium (48)" | "Small (40)"
state:    "Default" | "Hover" | "Focused" | "Loading" | "Disabled"
onlyIcon: boolean
iconRight: boolean
```

#### 시맨틱 토큰

**action/primary/***
| 토큰 | 소스 컬러 | 값 | 역할 |
|------|----------|-----|------|
| `action/primary/subtle` | orange/200 | #fed7aa | Loading 텍스트 |
| `action/primary/accent` | orange/400 | #fb923c | Hover/Loading gradient to |
| `action/primary/default` | orange/500 | #f97316 | Default/Focused gradient from |
| `action/primary/strong` | orange/600 | #ea580c | Hover/Loading gradient from · Focused border |
| `action/primary/stronger` | orange/700 | #c2410c | Default gradient to · Default/Hover border |
| `action/primary/strongest` | orange/800 | #9a3412 | Focused gradient to |

**action/secondary/***
| 토큰 | 소스 컬러 | 값 | 역할 |
|------|----------|-----|------|
| `action/secondary/subtle` | cool-gray/50 | #f9fafb | gradient from (공통) |
| `action/secondary/default` | cool-gray/200 | #e5e7eb | Default/Hover gradient to |
| `action/secondary/strong` | cool-gray/300 | #d1d5db | border |
| `action/secondary/stronger` | cool-gray/400 | #9ca3af | Focused gradient to |
| `action/secondary/accent` | cool-gray/500 | #6b7280 | 아이콘 기본 색상 |
| `action/secondary/accent-strong` | cool-gray/700 | #374151 | 아이콘 Hover/Focused 색상 |

**action/disabled/*** (Primary/Secondary 공통)
| 토큰 | 소스 컬러 | 값 | 역할 |
|------|----------|-----|------|
| `action/disabled/bg` | cool-gray/800 | #1f2937 | Disabled 배경 |
| `action/disabled/border` | cool-gray/700 | #374151 | Disabled wrapper/inner border |
| `action/disabled/text` | cool-gray/600 | #4b5563 | Disabled 텍스트/아이콘 |

#### Primary 상태별 스펙 (텍스트 포함)

| State | 배경 | 보더 | 텍스트 |
|-------|------|------|--------|
| Default | `action/primary/default → action/primary/stronger` (↓) | `action/primary/stronger` 2px | `base/white` |
| Hover | `action/primary/strong → action/primary/accent` (↑) | `action/primary/stronger` 2px | `base/white` |
| Focused | `action/primary/default → action/primary/strongest` (↑) | `action/primary/strong` 2px | `base/white` |
| Loading | `action/primary/strong → action/primary/accent` (↑) | `action/primary/stronger` 2px | `action/primary/subtle` |
| Disabled | `action/disabled/bg` 단색 | `action/disabled/border` 1px | `action/disabled/text` |

> 텍스트: Default/Hover/Focused/Loading 모두 단색. 기존 그라디언트 클립 제거.
> text-shadow: `-0.5px 0.5px 1px rgba(0,0,0,0.16)` — Disabled 제외 적용.
> Medium(48): 16px SemiBold / Small(40): 14px SemiBold. px-12 py-8, rounded-xl(12px).

#### Secondary 상태별 스펙 (아이콘 전용, onlyIcon)

| State | 배경 | 보더 | 아이콘 |
|-------|------|------|--------|
| Default | `action/secondary/subtle → action/secondary/default` (↓) | `action/secondary/strong` 2px | `action/secondary/accent` |
| Hover | `action/secondary/subtle → action/secondary/default` (↑) | `action/secondary/strong` 2px | `action/secondary/accent-strong` |
| Focused | `action/secondary/subtle → action/secondary/stronger` (↑) | `action/secondary/strong` 2px | `action/secondary/accent-strong` |
| Loading | Default와 동일 배경 | `action/secondary/strong` 2px | 스피너 |
| Disabled | `action/disabled/bg` 단색 | `action/disabled/border` 1px | `action/disabled/text` |

> Medium(48): 40×40px, 아이콘 20px, rounded-xl(12px).
> Small(40): 36×36px, 아이콘 16px, rounded-xl(12px).

---

### 2-5. Page Layout Frame

**기준 캔버스**: 1920×1080

```
전체 구조
  Sidebar (40px 고정)
  Body (1880px)
    TopNav (80px 고정)
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

#### Variant (5종)
| Variant | 배경 (Default) | 텍스트 | 보더 |
|---------|--------------|--------|------|
| Primary | `gradient: cta/strong → cta/stronger` | `base/white` | `cta/border` |
| Secondary | `cta-secondary/default` 단색 (라이트) | `text/inverse` | `border/inverse` |
| Danger | `status/danger/default` · red/600 단색 | `base/white` | `status/danger/border` |
| Ghost | 투명 | `text/primary` | 없음 |
| Outline | 투명 | `text/primary` | `border/default` |

> Primary는 팀컬러가 아닌 인디고 고정. 팀컬러는 팀 전용 UI 요소(헤더 ActionButton 등)에서만 사용.

#### Danger 상태별 스펙

| State | 배경 | 보더 | 텍스트 |
|-------|------|------|--------|
| Default | `status/danger/default` · red/600 (#dc2626) 단색 | `status/danger/border` · red/400 (#f87171) | `base/white` |
| Hover | `status/danger/strong` · red/500 (#ef4444) 단색 | `status/danger/border` | `base/white` |
| Pressed | `gradient: status/danger/default → status/danger/border` (top→bottom) | `status/danger/border` | `base/white` |
| Loading | `status/danger/strong` · red/500 단색 | `status/danger/border` | `status/danger/subtle` · red/300 (#fca5a5) |
| Disabled | `surface/disabled` · zinc/700 (#3F3F46) 단색 | 없음 | `text/disabled` · zinc/500 (#71717A) |

> 그라디언트 없이 단색 사용 (Pressed 제외) — Primary/Secondary와 질감을 다르게 하여 긴박감 표현.
> Pressed: `status/danger/default → status/danger/border` (dark→light) 그라디언트로 눌린 느낌.
> `status/danger/default`(red/600) > `status/danger/strong`(red/500) 순 — Default가 더 진한 색으로 시각적 강조.
> Type: `Default` / `IconOnly` 2종 지원.

#### ⚠️ tailwind.config.js 수정 필요 (코드 구현 시)
기존 `DEFAULT`/`strong` 값이 뒤바뀌어 있음 — Figma 기준으로 수정 필요.
```js
danger: {
  DEFAULT: '#dc2626',   // red-600 — Default 배경 (⚠️ 기존 #ef4444에서 변경)
  strong:  '#ef4444',   // red-500 — Hover/Loading 배경 (⚠️ 기존 #dc2626에서 변경)
  border:  '#f87171',   // red-400 — 보더 전용
  subtle:  '#fca5a5',   // red-300 — Loading 텍스트용
  text:    '#f87171',   // red-400 — 텍스트용 (배지, 인라인 등, border와 값 동일하나 역할 분리)
  muted:   'rgba(239, 68, 68, 0.1)',
}
```

> `danger/border`와 `danger/text`는 현재 동일한 red-400 값이지만 역할이 다름 — 추후 값 변경 시 독립적으로 조정 가능하도록 분리 유지.

#### Primary CTA 상태별 스펙

| State | 배경 | 텍스트 | 보더 |
|-------|------|--------|------|
| Default | `gradient: cta/strong → cta/stronger` (top→bottom) | `base/white` | `cta/border` |
| Hover | `gradient: cta/default → cta/stronger` | `base/white` | `cta/border` |
| Pressed | `gradient: cta/stronger → cta/strong` (반전) | `base/white` | `cta/border` |
| Loading | `gradient: cta/default → cta/strong` | `cta/subtle` | `cta/border` |
| Disabled | `surface/disabled` · zinc/700 (#3F3F46) 단색 | `text/disabled` · zinc/500 (#71717A) | 없음 |

> Loading 상태: leading 아이콘 자리를 Loader2 스피너로 교체, 텍스트는 유지. 애니메이션(`animate-spin`)은 코드에서만 처리.
> Pressed 상태: 그라디언트 방향 반전으로 눌린 느낌 표현. `scale-95`는 코드에서만 처리.

#### Size (5종)

| Size | py | px | Border Radius | Gap | 폰트 크기 | Line Height |
|------|----|----|--------------|-----|---------|------------|
| xs | 6px (py-1.5) | 12px (px-3) | 6px (rounded-md) | 4px (gap-1) | 10px | 14px |
| sm | 8px (py-2) | 16px (px-4) | 8px (rounded-lg) | 4px (gap-1) | 12px | 16px |
| base | 10px (py-2.5) | 24px (px-6) | 8px (rounded-lg) | 4px (gap-1) | 14px | 20px |
| lg | 14px (py-3.5) | 32px (px-8) | 12px (rounded-xl) | 4px (gap-1) | 14px | 20px |
| xl | 16px (py-4) | 40px (px-10) | 12px (rounded-xl) | 4px (gap-1) | 14px | 20px |

> base / lg / xl은 폰트 크기 14px로 통일. 버튼 크기 구분은 패딩으로만 함.
> 아이콘 크기는 모든 사이즈에서 16px 고정.

#### 폰트 공통 스펙
- font-family: Pretendard Variable
- font-weight: SemiBold (600)
- letter-spacing: 0 (tracking 없음)
- text-transform: none (uppercase 없음)

#### Secondary 상태별 스펙

| State | 배경 | 보더 | 텍스트 |
|-------|------|------|--------|
| Default | `cta-secondary/default` · zinc/400 (#A1A1AA) 단색 | `border/inverse` · zinc/200 (#E4E4E7) | `text/inverse` · zinc/800 (#27272A) |
| Hover | `cta-secondary/hover` · zinc/300 (#D4D4D8) 단색 | `border/inverse` | `text/inverse` |
| Pressed | `gradient: cta-secondary/default → cta-secondary/subtle` (top→bottom) | `border/inverse` | `text/inverse` |
| Loading | `cta-secondary/default` 단색 | `border/inverse` | `text/muted` · zinc/400 (#A1A1AA) |
| Disabled | `surface/disabled` · zinc/700 (#3F3F46) 단색 | 없음 | `text/disabled` · zinc/500 (#71717A) |

> Pressed: `cta-secondary/default → cta-secondary/subtle` (zinc/400 → zinc/100 #F4F4F5)로 밝아지면서 눌린 느낌.
> Disabled: 라이트 배경 대신 `surface/disabled` 다크 단색으로 전환 — 비활성 상태임을 명확히 구분.

#### Secondary Type prop (2종)

| Type | 구성 | 패딩 |
|------|------|------|
| `Default` | 아이콘 + 텍스트 (또는 텍스트만) | px/py 사이즈별 |
| `IconOnly` | 아이콘만, 정사각형 | p-6px (xs 기준) — 사이즈별 py와 동일하게 맞춰 높이 일치 |

> Size 체계는 Primary와 동일한 5종 (xs / sm / base / lg / xl).

---

#### Ghost 상태별 스펙

| State | 배경 | 텍스트 | 보더 |
|-------|------|--------|------|
| Default | 투명 | `text/primary` · zinc/50 (#FAFAFA) | 없음 |
| Hover | `base/white/transparent/5` · rgba(255,255,255,0.05) | `text/primary` · zinc/50 (#FAFAFA) | 없음 |
| Pressed | `base/white/transparent/20` · rgba(255,255,255,0.20) | `text/primary` · zinc/50 (#FAFAFA) | 없음 |
| Loading | `base/white/transparent/10` · rgba(255,255,255,0.10) | `text/muted` · zinc/400 (#A1A1AA) | 없음 |
| Disabled | 투명 | `text/disabled` · zinc/500 (#71717A) | 없음 |

> Hover/Pressed: 반투명 white overlay — 어떤 배경 위에서도 배경 색에 관계없이 자연스럽게 동작.
> 텍스트: Default/Hover/Pressed는 primary 유지 (배경 없는 상태에서 가독성 확보). Loading은 muted로 진행 중 시각 표현.
> Loading: 배경 /10으로 미묘하게 표시해 로딩 중임을 암시.
> Disabled: 배경 변화 없이 텍스트만 어둡게 처리.
> Type: `Default` / `IconOnly` 2종. Size 체계는 Primary와 동일한 5종.

---

#### Outline 상태별 스펙

| State | 배경 | 텍스트 | 보더 |
|-------|------|--------|------|
| Default | 투명 | `text/primary` · zinc/50 (#FAFAFA) | `border/default` · zinc/700 (#3F3F46) |
| Hover | `base/white/transparent/5` · rgba(255,255,255,0.05) | `text/primary` · zinc/50 (#FAFAFA) | `border/emphasis` · zinc/600 (#52525B) |
| Pressed | `base/white/transparent/20` · rgba(255,255,255,0.20) | `text/primary` · zinc/50 (#FAFAFA) | `border/emphasis` · zinc/600 (#52525B) |
| Loading | 투명 | `text/muted` · zinc/400 (#A1A1AA) | `border/default` · zinc/700 (#3F3F46) |
| Disabled | 투명 | `text/disabled` · zinc/500 (#71717A) | `border/default` · zinc/700 (#3F3F46) |

> Hover/Pressed: 배경은 Ghost와 동일한 반투명 white overlay. 보더가 `border/default` → `border/emphasis`로 격상되어 반응성 표현.
> Loading: 배경 없음 — Ghost와 달리 보더가 시각 앵커 역할을 하므로 별도 배경 불필요.
> Disabled: 배경/보더 모두 Default 유지, 텍스트만 `text/disabled`로 처리.
> Type: `Default` / `IconOnly` 2종. Size 체계는 Primary와 동일한 5종 (xs / sm / base / lg / xl).

**Ghost vs Outline 차이 요약**

| 항목 | Ghost | Outline |
|------|-------|---------|
| Default 보더 | 없음 | `border/default` |
| Hover/Pressed 보더 | 없음 | `border/emphasis` |
| Loading 배경 | `transparent/10` | 투명 (보더로 대체) |

---

#### Split Button

Primary 스타일의 좌/우 분리형 버튼. 좌측(주 액션) + 우측(드롭다운 Toggle) 구조.
현재 사용처: DepthChartEditor, RotationMatrix, RotationGanttChart

**Wrapper**
| 속성 | 값 |
|------|-----|
| border | `cta/border` · indigo/400 (#818CF8) |
| border-radius | `rounded-lg` · 8px |
| overflow | hidden |

**Left 버튼 — 주 액션 영역**

| State | 배경 | 텍스트 |
|-------|------|--------|
| Default | `gradient: cta/strong → cta/stronger` (top→bottom) | `base/white` |
| Hover | `gradient: cta/default → cta/stronger` | `base/white` |
| Pressed | `gradient: cta/stronger → cta/strong` (반전) | `base/white` |
| Loading | `gradient: cta/default → cta/strong` | `cta/subtle` · indigo/300 (#A5B4FC) |
| Disabled | `surface/disabled` · zinc/700 (#3F3F46) 단색 | `text/disabled` · zinc/500 (#71717A) |

**Right 버튼 — 드롭다운 Toggle 영역**

| State | 배경 | 구분선(border-l) |
|-------|------|----------------|
| Default | `gradient: cta/strong → cta/stronger` | `cta/border` |
| Hover | `gradient: cta/default → cta/stronger` | `cta/border` |
| Toggle-Open | `gradient: cta/stronger → cta/strong` (반전) | `cta/border` |
| Disabled | `surface/disabled` 단색 | 없음 |

> Right의 Pressed는 Toggle-Open 개념으로 운영 — 드롭다운 열림 상태를 표현.
> Right의 단독 Loading 상태 없음 — Left가 Loading일 때 Right는 Default 유지.
> Left가 Disabled이면 Right도 Disabled로 함께 처리.
> Size 체계: Primary와 동일한 5종 (xs / sm / base / lg / xl).

---

#### Split Button Dropdown

Split Button의 Right(Toggle) 버튼에 의해 열리는 드롭다운 패널.

**패널 컨테이너**

| 속성 | 값 | 토큰 |
|------|-----|------|
| 배경 | — | 아이템이 패널 전체를 채움 |
| 보더 | 1px | `cta/border` · #818cf8 |
| border-radius | 8px | `rounded-lg` |
| shadow | `shadow/lg` · drop-shadow 2종 합성 | |
| min-width | 140px | — |
| overflow | hidden | — |
| 위치 | Wrapper 우측 끝 기준 우정렬, 하단 8px gap | — |

**DropdownItem 상태별 스펙**

| State | 배경 | 텍스트 | 아이콘 |
|-------|------|--------|--------|
| Default | `cta/strong` #4f46e5 | `base/white` | 없음 |
| Hover | `cta/default` #6366f1 | `base/white` | 없음 |
| Pressed | `gradient: cta/stronger → cta/strong` ↓ | `base/white` | 없음 |
| Selected | `cta/strong` #4f46e5 | `base/white` | Lucide `Check` 12px · `success/text` #34d399 (우측) |
| Disabled | `cta/stronger` #3730a3 | `cta/border` #818cf8 | 없음 |

**아이템 입체 효과 (코드 구현 기준)**

```css
/* 아이템 공통 (첫 번째 아이템 제외) */
border-bottom: 1px solid var(--cta/stronger);      /* 하단 어두운 구분선 */
box-shadow: inset 0px 1px 0px 0px var(--cta/border); /* 상단 밝은 하이라이트 */
```

> 첫 번째 아이템은 `inset` 상단 하이라이트 없음 — 패널 보더(`cta/border`)가 대신 밝은 상단 라인 역할.
> 피그마에서는 보더 중첩 불가로 `absolute bg div + inset shadow overlay div` 2중 레이어로 우회. 코드에서는 위 CSS 단일 적용으로 처리.

**아이템 타이포그래피 (Type S)**

| 속성 | 값 |
|------|-----|
| font-size | 10px (`text-2xs`) |
| font-weight | SemiBold 600 |
| line-height | 14px |
| padding | px-12 py-6 (좌우 12px / 상하 6px) |

---

### 3-2. Badge

> Badge = **메인 Badge** + **OVR Badge** 2종. Direction Badge / Position Badge / Contract Tag 별도 컴포넌트 폐기.

---

#### 3-2-A. 메인 Badge

##### 컴포넌트 구조

| 슬롯 | 설명 |
|------|------|
| `leadingIcon` | 좌측 아이콘 슬롯. boolean prop으로 on/off 독립 제어 |
| `label` | 텍스트 레이블 |
| `trailingIcon` | 우측 아이콘 슬롯. boolean prop으로 on/off 독립 제어 |

> 기존 DirectionBadge / Position Badge / Contract Tag 별도 컴포넌트 폐기 — leadingIcon + trailingIcon 슬롯으로 통합 대체.

##### 공통 타이포그래피

| 속성 | 값 |
|------|-----|
| font-family | Pretendard Variable |
| font-weight | Bold (700) |
| letter-spacing | 0 |
| text-transform | none |
| border | 없음 |

> 현행 `font-black` / `uppercase` / `tracking-wider` / `border` 전면 제거.

##### Size 스펙

| Size | font-size | line-height | py | px | gap | icon 크기 | border-radius |
|------|-----------|-------------|-----|-----|-----|-----------|---------------|
| xs | 10px | 14px | 2px | 8px | 2px | 14px | 12px (`rounded-xl`) |
| sm | 12px | 16px | 4px | 8px | 4px | 16px | 12px (`rounded-xl`) |
| md | 14px | 20px | 6px | 10px | 4px | 18px | 16px (`rounded-2xl`) |

##### 스타일 Variant × State 색상 테이블

**Neutral**

| State | 배경 | 텍스트 |
|-------|------|--------|
| Default | `surface/elevated` · #27272A | `text/secondary` · #D4D4D8 |
| Hover | `surface/elevated` + `base/white/transparent/5` overlay | `text/secondary` |
| Selected | `border/emphasis` · #52525B | `text/primary` · #FAFAFA |
| Disabled | `surface/disabled` · #3F3F46 | `text/disabled` · #71717A |

> ⚠️ Figma 수정 필요: Neutral Selected 텍스트가 현재 `text/secondary`(Default와 동일) → `text/primary`로 수정.

**Brand (Indigo)**

| State | 배경 | 텍스트 |
|-------|------|--------|
| Default | `accent/muted` · rgba(99,102,241,0.1) | `accent/default` · #6366F1 |
| Hover | `accent/muted` + `base/white/transparent/5` overlay | `accent/default` |
| Selected | `accent/strong` · #4F46E5 | `base/white` |
| Disabled | `surface/disabled` · #3F3F46 | `text/disabled` · #71717A |

**Success**

| State | 배경 | 텍스트 |
|-------|------|--------|
| Default | `status/success/muted` · rgba(16,185,129,0.1) | `status/success/text` · #34D399 |
| Hover | `status/success/muted` + `base/white/transparent/5` overlay | `status/success/text` |
| Selected | `status/success/strong` · #059669 | `base/white` |
| Disabled | `surface/disabled` · #3F3F46 | `text/disabled` · #71717A |

**Danger**

| State | 배경 | 텍스트 |
|-------|------|--------|
| Default | `status/danger/muted` · rgba(239,68,68,0.1) | `status/danger/text` · #F87171 |
| Hover | `status/danger/muted` + `base/white/transparent/5` overlay | `status/danger/text` |
| Selected | `status/danger/strong` · #DC2626 | `base/white` |
| Disabled | `surface/disabled` · #3F3F46 | `text/disabled` · #71717A |

**Warning**

| State | 배경 | 텍스트 |
|-------|------|--------|
| Default | `status/warning/muted` · rgba(245,158,11,0.1) | `status/warning/text` · #FBBF24 |
| Hover | `status/warning/muted` + `base/white/transparent/5` overlay | `status/warning/text` |
| Selected | `status/warning/strong` · #D97706 | `base/white` |
| Disabled | `surface/disabled` · #3F3F46 | `text/disabled` · #71717A |

**Info**

| State | 배경 | 텍스트 |
|-------|------|--------|
| Default | `status/info/muted` · rgba(59,130,246,0.1) | `status/info/text` · #60A5FA |
| Hover | `status/info/muted` + `base/white/transparent/5` overlay | `status/info/text` |
| Selected | `status/info/strong` · #2563EB | `base/white` |
| Disabled | `surface/disabled` · #3F3F46 | `text/disabled` · #71717A |

**Team**

| State | 배경 | 텍스트 |
|-------|------|--------|
| Default | `accent/primary` (팀 주색) | `accent/secondary` (팀 보조색) |
| Hover | `accent/primary` + `base/white/transparent/5` overlay | `accent/secondary` |
| Selected | `accent/secondary` (팀 보조색) | `accent/primary` (팀 주색) |
| Disabled | `surface/disabled` · #3F3F46 | `text/disabled` · #71717A |

> Team Selected: 배경·텍스트 완전 역전(color swap). 타 variant의 `strong + base/white` 패턴과 다른 팀 고유 패턴.

##### Hover 구현 방식 (코드)

```css
/* Hover: Default 배경 위에 white/5 overlay 이중 합성 */
background: linear-gradient(rgba(255,255,255,0.05), rgba(255,255,255,0.05)),
            <Default 배경>;
```

---

#### 3-2-B. OVR Badge

##### 형태 원칙

- **정사각형** (width = height) — 메인 Badge의 pill 형태와 반대
- **그라디언트 배경** — 티어별 고유 다중 컬러 그라디언트
- **인터랙션 없음** — Hover / Selected / Disabled 상태 없음. 표시 전용
- **숫자만 표시** — 아이콘 슬롯 없음
- **내부 패딩 없음** — width/height 고정값으로 크기 제어. `flex items-center justify-center`로 숫자 중앙정렬

##### 컴포넌트 Props

```ts
rank: "s" | "a+" | "a" | "b" | "c" | "d"
size: "xs" | "s" | "base" | "medium" | "lg" | "2lg" | "3lg" | "4lg"
value: string  // 표시할 OVR 숫자
```

##### 타이포그래피

| 속성 | 값 |
|------|-----|
| font-family | **Bebas Neue** Regular |
| font-weight | Regular (400) |
| color | `base/white` — 전 티어 공통 |
| text-shadow | `0px 0px 1px black` — 그라디언트 배경 위 가독성 확보 |

> 현행 Pretendard font-black → **Bebas Neue Regular**로 전면 교체.

##### Size 8종

| 토큰명 | 크기 | font-size | border-radius |
|--------|------|-----------|---------------|
| xs | 12×12px | 10px | 2px (`rounded-sm`) |
| s | 16×16px | 12px | 2px (`rounded-sm`) |
| base | 20×20px | 14px | 4px (`rounded`) |
| medium | 24×24px | 16px | 4px (`rounded`) |
| lg | 28×28px | 18px | 4px (`rounded`) |
| 2lg | 32×32px | 24px | 4px (`rounded`) |
| 3lg | 36×36px | 28px | 6px (`rounded-md`) |
| 4lg | 40×40px | 32px | 6px (`rounded-md`) |

> 현행 4종(sm/md/lg/xl) → **8종**으로 확장. 내부 패딩 없음.

##### 티어 6종 — OVR 범위 & 그라디언트

| 티어 | OVR 범위 | 테마 |
|------|----------|------|
| S | 99–96 | 홀로그래픽 네온 |
| A+ | 95–93 | 블루-라벤더 이리데슨트 |
| A | 92–90 | 실버/크롬 |
| B | 89–80 | 골드 |
| C | 79–70 | 퓨터/다크 그레이 |
| D | 69 이하 | 테라코타/번트 브론즈 |

> 현행 10티어(fuchsia/violet/pink/rose/red/orange/amber/stone) 폐기 → **6티어**로 개편.

##### 그라디언트 구현 (코드)

Tailwind 유틸리티 클래스로 다중 컬러스톱 그라디언트 표현 불가 → **JS 상수**로 정의 후 `style` prop 주입.

```ts
// OVR_GRADIENTS 상수 — 티어별 그라디언트 문자열
export const OVR_GRADIENTS = {
  s: 'linear-gradient(138.8deg, #34FFB4 5.70%, #8DC0FF 27.03%, #5C0BFF 43.90%, #A900D7 68.68%, #7AC6FD 94.00%)',
  aPlus: 'linear-gradient(138.8deg, #CCE8FE 5.70%, #CDA0FF 27.03%, #8489F5 41.02%, #CDF1FF 68.68%, #B591E9 94.00%)',
  a: 'linear-gradient(137.9deg, #7A96AC 2.28%, #EAEFF3 19.80%, #C2D4E1 32.94%, #FFFFFF 50.17%, #D4DEE5 62.15%, #ABBBC8 78.69%, #BCCAD7 95.24%)',
  b: 'linear-gradient(135.3deg, #8C421D 15.43%, #FBE67B 38.47%, #FBFBE7 53.36%, #F7D14E 69.97%, #D4A041 86.27%)',
  c: 'linear-gradient(-40.0deg, #A8A8A6 15.87%, #696969 48.67%, #F9F8F6 64.17%, #D4D4D4 75.79%, #7F7F7F 88.50%)',
  d: 'linear-gradient(137.9deg, #BC6554 2.28%, #62362D 21.75%, #A1503D 40.73%, #CA7561 50.17%, #E2AA9D 67.50%, #62362D 83.07%, #AA5946 95.24%)',
} as const;

// OVR 값 → 티어 매핑 함수
function getOvrTier(ovr: number): keyof typeof OVR_GRADIENTS {
  if (ovr >= 96) return 's';
  if (ovr >= 93) return 'aPlus';
  if (ovr >= 90) return 'a';
  if (ovr >= 80) return 'b';
  if (ovr >= 70) return 'c';
  return 'd';
}
```

**컴포넌트 사용 예시**

```tsx
<div
  style={{ backgroundImage: OVR_GRADIENTS[getOvrTier(value)] }}
  className="flex items-center justify-center rounded text-white"
>
  <span style={{ textShadow: '0px 0px 1px black' }}
        className="font-['Bebas_Neue'] text-[16px] leading-none">
    {value}
  </span>
</div>
```

##### 각 티어 그라디언트 상세 (컬러스톱)

**S (99–96)** — 홀로그래픽 네온 / 방향 138.8deg / 5-stop
```
#34FFB4  5.70%   민트 그린
#8DC0FF 27.03%   스카이 블루
#5C0BFF 43.90%   딥 퍼플 (다크 포인트)
#A900D7 68.68%   마젠타 퍼플
#7AC6FD 94.00%   라이트 블루
```

**A+ (95–93)** — 블루-라벤더 이리데슨트 / 방향 138.8deg / 5-stop
```
#CCE8FE  5.70%   라이트 블루
#CDA0FF 27.03%   라이트 퍼플
#8489F5 41.02%   미드 인디고
#CDF1FF 68.68%   아이스 블루 (하이라이트)
#B591E9 94.00%   소프트 바이올렛
```

**A (92–90)** — 실버/크롬 / 방향 137.9deg / 7-stop
```
#7A96AC  2.28%   블루 그레이
#EAEFF3 19.80%   라이트 실버
#C2D4E1 32.94%   미드 실버
#FFFFFF 50.17%   화이트 하이라이트 (피크)
#D4DEE5 62.15%   라이트 실버
#ABBBC8 78.69%   미드 그레이 블루
#BCCAD7 95.24%   블루 그레이
```

**B (89–80)** — 골드 / 방향 135.3deg / 5-stop
```
#8C421D 15.43%   다크 번트 오렌지 (쉐도우)
#FBE67B 38.47%   골드 옐로우
#FBFBE7 53.36%   크림 화이트 (하이라이트)
#F7D14E 69.97%   딥 골드
#D4A041 86.27%   앰버 골드 (쉐도우)
```

**C (79–70)** — 퓨터/다크 그레이 / 방향 **-40.0deg** / 5-stop
```
#A8A8A6 15.87%   미드 그레이
#696969 48.67%   다크 그레이 (쉐도우)
#F9F8F6 64.17%   오프 화이트 (하이라이트)
#D4D4D4 75.79%   라이트 그레이
#7F7F7F 88.50%   미드-다크 그레이
```

> C 티어만 음수 각도(-40.0deg) 사용 — 다른 티어와 반대 방향으로 하이라이트가 흐름.

**D (69 이하)** — 테라코타/번트 브론즈 / 방향 137.9deg / 7-stop
```
#BC6554  2.28%   미디엄 코랄
#62362D 21.75%   다크 번트 시에나 (쉐도우)
#A1503D 40.73%   미디엄-다크 테라코타
#CA7561 50.17%   코랄 하이라이트
#E2AA9D 67.50%   피치 (최대 하이라이트)
#62362D 83.07%   다크 번트 시에나 (쉐도우 재등장)
#AA5946 95.24%   다크 테라코타
```

---

##### 보더 (전 티어 · 전 사이즈 공통)

> 글로우 없음. 보더만으로 티어 구분.

| 티어 | 보더 색상 | 기준 컬러스톱 |
|------|-----------|--------------|
| S | `rgba(52, 255, 180, 0.65)` | 민트 #34FFB4 |
| A+ | `rgba(205, 241, 255, 0.65)` | 아이스 블루 #CDF1FF |
| A | `rgba(255, 255, 255, 0.50)` | 화이트 #FFFFFF |
| B | `rgba(252, 251, 231, 0.55)` | 크림 화이트 #FBFBE7 |
| C | `rgba(249, 248, 246, 0.40)` | 오프 화이트 #F9F8F6 |
| D | `rgba(226, 170, 157, 0.40)` | 피치 #E2AA9D |

> 각 티어의 그라디언트 중 가장 밝은 하이라이트 컬러를 보더에 적용. 상위 티어일수록 불투명도 높음(0.65 → 0.40).

---

### 3-3. Input

> **3종 드롭다운 컴포넌트 정의**
>
> | 컴포넌트 | 목적 | 트리거 텍스트 | 현재 사용처 |
> |---------|------|-------------|-----------|
> | **Input** | 텍스트/숫자/멀티라인 직접 입력 | — | 검색, 이름 입력, 설정값 등 |
> | **Select** | 목록에서 단일 값 선택. 선택값이 트리거에 반영됨 | 동적 (선택값) | DepthChartEditor, TacticsBoard, LeaderboardToolbar 필터, 브라우저 `<select>` 전체 대체 |
> | **Dropdown** | 액션 목록 실행. 트리거 자체는 변하지 않음 | 고정 레이블 | Sidebar 프로필 메뉴, DateSkipDropdown 등 |
>
> Select와 Dropdown은 패널이 펼쳐지는 구현 방식은 동일하나 목적과 동작이 다름. Trigger는 별도 컴포넌트 없음 — Button 컴포넌트 기반으로 각 컴포넌트 내부에서 정의.

---

#### 3-3-A. Input

##### 컴포넌트 구조

단일 Input 컴포넌트가 아래 모든 케이스를 커버.

| Prop | 값 | 설명 |
|------|-----|------|
| `type` | `text` \| `number` \| `email` \| `password` | HTML input type. Password는 코드에서만 처리 — 피그마 별도 variant 없음 |
| `multiline` | `boolean` | true이면 textarea로 렌더. 피그마에서 height를 늘린 Input으로 표현 |
| `prefix` | `ReactNode` | 좌측 슬롯 (아이콘 등) |
| `suffix` | `ReactNode` | 우측 슬롯 (아이콘, clear 버튼 등) |
| `size` | `xs` \| `sm` \| `md` \| `lg` | 크기 |

> **Password**: `type="password"` + suffix Eye 아이콘(토글)으로 코드에서만 처리. 시각적으로 suffix=on 상태의 Default Input과 동일 — 피그마 별도 variant 불필요.
> **Multiline**: 브라우저 resize 핸들은 코드에서만 제어(`resize-y`). 피그마에서는 height를 늘린 Input으로 표현하면 충분 — 별도 표현 불필요.

**Search Input (특화형)**
- `prefix`에 Search 아이콘 고정
- `suffix`에 X(clear) 버튼 — Disabled 제외 전 state에서 표시 (피그마 기준). 실제 구현 시 value가 있을 때만 노출 (동적 처리)
- 별도 컴포넌트가 아닌 Input props 조합으로 구현

##### 상태 (State) — 5종

| State | 배경 | 보더 | 텍스트 | prefix/suffix 아이콘 |
|-------|------|------|--------|---------------------|
| Default | `surface/background` #18181B | `border/default` #3F3F46 | `text/primary` #FAFAFA | `text/muted` #A1A1AA |
| Hover | `surface/background` #18181B | `cta/stronger` #3730A3 | `text/primary` #FAFAFA | `text/muted` #A1A1AA |
| Focus | `surface/background` #18181B | `cta/default` #6366F1 | `text/primary` #FAFAFA | prefix: `cta/default` #6366F1 / suffix: `text/muted` |
| Error | `surface/background` #18181B | `status/danger/border` #F87171 | `text/primary` #FAFAFA | `text/muted` #A1A1AA |
| Disabled | `surface/disabled` #3F3F46 | 없음 | `text/disabled` #71717A | `text/disabled` #71717A |

> Focus glow: `box-shadow: 0px 0px 8px rgba(99,102,241,0.35)`
> Disabled: 보더 없음 — 배경색만으로 비활성 표현.
> `outline: none` 필수 — 브라우저 기본 포커스 링 제거.

##### Placeholder

| State | 색상 |
|-------|------|
| Default / Hover / Focus / Error | `text/muted` #A1A1AA |
| Disabled | `text/disabled` #71717A |

##### 에러 메시지 (Error 전용)

| 속성 | 값 |
|------|-----|
| 색상 | `status/danger/text` · #F87171 |
| font-size | 12px |
| gap (Input 하단) | 4px |

##### Size 5종

| Size | height | px | py | font-size | border-radius | 사용 컨텍스트 |
|------|--------|----|----|-----------|---------------|-------------|
| xs | 28px | 10px | 6px | 12px | 6px (`rounded-md`) | 인라인 소형 필터 |
| sm | 32px | 12px | 8px | 12px | 6px (`rounded-md`) | 툴바 보조 입력 |
| md | 36px | 14px | 8px | 14px | 8px (`rounded-lg`) | 기본 인라인 입력 |
| lg | 40px | 16px | 10px | 14px | 8px (`rounded-lg`) | 주요 검색/설정 입력 |
| xl | 44px | 16px | 12px | 14px | 12px (`rounded-xl`) | 인증/GM 생성 대형 폼 |

> Multiline은 height 없음 — min-height만 적용 (md 기준 36px).

##### Prefix / Suffix 슬롯

| 항목 | 값 |
|------|-----|
| 아이콘 크기 | 14px (size 무관 고정) |
| gap | 8px |
| prefix 색 (Default/Hover/Error) | `text/muted` #A1A1AA |
| prefix 색 (Focus) | `cta/default` #6366F1 |
| suffix 색 (전 상태) | `text/muted` #A1A1AA |
| suffix hover | `text/primary` #FAFAFA |

##### 공통 타이포그래피

| 속성 | 값 |
|------|-----|
| font-family | Pretendard Variable |
| font-weight | Medium (500) |
| letter-spacing | 0 |

##### Figma Props 구조

```
size:      xs / sm / md / lg / xl
state:     default / hover / focus / error / disabled
multiline: off / on
prefix:    off / on
suffix:    off / on
```

> Password / Multiline resize 핸들 — 피그마 variant 없음. 코드에서만 처리.
> suffix는 multiline=on 시 비활성화.

##### 조합 시 border-radius 규칙 (Select / Dropdown과 인접 배치 시)

Input / Select / Dropdown은 height · 배경 · 보더 · border-radius 토큰 동일 — 나란히 붙이면 자연스럽게 하나의 그룹처럼 보임.

```
첫 번째 요소  →  좌측 radius 유지, 우측 radius 0
중간 요소    →  radius 전체 0
마지막 요소  →  좌측 radius 0, 우측 radius 유지
```

---

### 3-4. Toggle / Checkbox / Radio

#### Toggle Switch

마우스 전용 데스크탑 UI — hover/focus 없음. 클릭 시 thumb 슬라이드 전환이 시각적 피드백을 담당.

##### Props
```
type:   Single / Dual / Disabled
state:  false / true
size:   sm / md
```

**type 설명**
- `Single`: 일반 on/off 토글. Off Track = 어두운 배경 + 보더, On Track = 인디고 단색
- `Dual`: 양방향 의미 있는 선택 (예: 전술 A/B). Off/On 모두 Track이 인디고 단색 — Thumb 위치로만 구분
- `Disabled`: 비활성. Off/On 모두 회색 단색 Track + 회색 Thumb

##### Size

| Size | Track W | Track H | Thumb Ø | border-radius |
|------|---------|---------|---------|---------------|
| sm | 28px | 16px | 12px | 8px (pill) |
| md | 36px | 20px | 14px | 10px (pill) |

> Thumb 위치: Off → 좌 3px 여백 / On → 우 3px 여백. 전환 애니메이션은 코드에서 `transition-transform`으로 처리.

##### State — 색상

**Single**

| State | Track 배경 | Track 보더 | Thumb |
|-------|-----------|-----------|-------|
| Off (false) | `surface/background` #18181B | `border/default` #3F3F46 | `text/muted` #A1A1AA |
| On (true) | `cta/default` #6366F1 단색 | 없음 | `base/white` #FFFFFF |

**Dual**

| State | Track 배경 | Track 보더 | Thumb |
|-------|-----------|-----------|-------|
| Off (false) | `cta/default` #6366F1 단색 | 없음 | `base/white` #FFFFFF |
| On (true) | `cta/default` #6366F1 단색 | 없음 | `base/white` #FFFFFF |

> Dual: Track 색은 항상 동일 — Thumb이 좌(false) ↔ 우(true)로 이동하며 상태 표현.

**Disabled**

| State | Track 배경 | Track 보더 | Thumb |
|-------|-----------|-----------|-------|
| Off / On 공통 | `surface/disabled` #3F3F46 단색 | 없음 | `text/disabled` #71717A |

---

#### Toggle Text Button

Toggle Switch에 좌/우 라벨 텍스트를 붙인 복합 컴포넌트. 레이블 색상으로 현재 활성 상태를 표현.

##### Anatomy
```
[좌 라벨 (text-right)] + [ToggleSwitch] + [우 라벨]
gap: 8px, 세로 중앙 정렬
```

##### Props
```
type:   Single / Dual / Disabled
state:  false / true
size:   sm / md
```

##### 라벨 타이포그래피

| Size | font-size | line-height | font-weight |
|------|-----------|-------------|-------------|
| md | 14px | 20px | Medium (500) |
| sm | 12px | 16px | Medium (500) |

##### 라벨 색상 규칙

| type | state | 좌 라벨 | 우 라벨 |
|------|-------|---------|---------|
| Single | false | `text/primary` #FAFAFA | `text/primary` #FAFAFA |
| Single | true | `text/primary` #FAFAFA | `cta/default` #6366F1 |
| Dual | false (좌 활성) | `cta/default` #6366F1 | `text/primary` #FAFAFA |
| Dual | true (우 활성) | `text/primary` #FAFAFA | `cta/default` #6366F1 |
| Disabled | — | `text/disabled` #71717A | `text/disabled` #71717A |

> Single: On 상태에서 우측 라벨만 인디고 강조 — "이 기능이 켜졌다"는 의미.
> Dual: 현재 활성화된 쪽 라벨만 인디고 강조 — 양방향 모두 의미 있는 선택지임을 표현.
> ToggleSwitch의 type/state는 Toggle Switch 스펙과 동일하게 연동.

---

#### Checkbox

##### Props
```
state:  unchecked / unchecked-hover / checked / indeterminate / disabled-unchecked / disabled-checked
size:   sm / md
```

##### Size

| Size | W × H | border-radius | border-width |
|------|-------|---------------|-------------|
| sm | 14×14px | 4px (고정) | 2px |
| md | 16×16px | 4px (고정) | 2px |

> border-radius는 size 무관 4px 고정.

##### State — 색상

| State | 배경 | 보더 | Check 색 |
|-------|------|------|---------|
| Unchecked | 투명 | `border/default` #3F3F46, 2px | — |
| Unchecked Hover | 투명 | `cta/default` #6366F1, 2px | — |
| Checked | `cta/default` #6366F1 | 없음 | `base/white` #FFFFFF |
| Indeterminate | `cta/default` #6366F1 | 없음 | `base/white` #FFFFFF (dash) |
| Disabled Unchecked | `surface/disabled` #3F3F46 | 없음 | — |
| Disabled Checked | `surface/disabled` #3F3F46 | 없음 | `text/disabled` #71717A |

> Indeterminate: Check 대신 가로 dash(—) 아이콘 (md: 8×2px / sm: 6×2px). 전체 선택/해제 컨트롤에만 사용.
> Disabled Unchecked / Disabled Checked 배경 동일(`#3F3F46`) — Check 아이콘 유무로만 구분.
> `appearance-none` 필수.

##### Checkbox Labeled (라벨 포함)

Checkbox + 우측 라벨 텍스트 조합. gap 8px, 세로 중앙 정렬.

| Size | 라벨 font-size | line-height | font-weight | 라벨 색 (Default) |
|------|--------------|-------------|-------------|-----------------|
| sm | 14px | 20px | Medium (500) | `text/primary` #FAFAFA |
| md | 16px | 24px | Medium (500) | `text/primary` #FAFAFA |

> Disabled 상태 라벨 색: `text/disabled` #71717A.

---

#### Radio Button

##### Props
```
checked:  false / true
state:    Default / Hover / Focus / Disabled
size:     sm / md
```

> Figma state 의미: Default=Unselected / Hover=Unselected Hover / Focus=Selected / Disabled=비활성.

##### Size

| Size | Ø (outer) | Inner dot Ø | border-width | border-radius |
|------|-----------|-------------|-------------|---------------|
| sm | 14px | 6px | 2px | 10px (pill) |
| md | 16px | 8px | 2px | 10px (pill) |

> Inner dot 위치: `left: 4px, top: 4px` (absolute) — sm: 4+6+4=14 / md: 4+8+4=16 자연 중앙정렬.

##### State — 색상

| State | 배경 | 보더 | Inner dot |
|-------|------|------|-----------|
| Unselected (Default) | 투명 | `border/default` #3F3F46, 2px | — |
| Unselected Hover | 투명 | `cta/default` #6366F1, 2px | — |
| Selected | `cta/default` #6366F1 | 없음 | `base/white` #FFFFFF |
| Disabled Unselected | `surface/disabled` #3F3F46 | 없음 | — |
| Disabled Selected | `surface/disabled` #3F3F46 | 없음 | `text/disabled` #71717A |

> Disabled Unselected / Disabled Selected 배경 동일(`#3F3F46`) — Inner dot 유무로만 구분. Checkbox Disabled 패턴과 동일.
> `appearance-none` 필수.

##### Radio Labeled (라벨 포함)

Radio Button + 우측 라벨 텍스트 조합. Checkbox Labeled와 구조·수치 동일.

| Size | 라벨 font-size | line-height | font-weight | 라벨 색 (Default) |
|------|--------------|-------------|-------------|-----------------|
| sm | 14px | 20px | Medium (500) | `text/primary` #FAFAFA |
| md | 16px | 24px | Medium (500) | `text/primary` #FAFAFA |

> gap 8px, 세로 중앙 정렬. Disabled 상태 라벨 색: `text/disabled` #71717A.

---

#### 공통

- label 텍스트와 함께 사용 시: gap `8px`, Disabled 상태에서 label 색 `text/disabled` #71717A로 연동
- hover/focus는 Checkbox Unchecked Hover, Radio Unselected Hover에만 적용 — 나머지 컨트롤 상태에서는 불필요

---

### 3-5. Tooltip

#### 현황 진단

현재 서비스 내 tooltip은 **3가지 방식이 혼재**하며 통일된 컴포넌트 없음.

| 방식 | 사용 수 | 파일 예시 | 문제 |
|------|--------|----------|------|
| State 기반 (onMouseEnter/Leave) | 2곳 | PlayerAwardBadges, ShotTooltip | 각자 인라인 구현 |
| CSS group-hover | 3곳 | SliderControl, PlayerDetailView | 파일마다 스타일 미세 차이 |
| `title=` 브라우저 기본 | 19곳+ | Sidebar, RotationMatrix, TacticsBoard 등 | 디자인 제어 불가 |

---

#### Variant 4종

| variant | 구조 | 주요 사용처 |
|---------|------|-----------|
| **Simple** | 텍스트 1줄 | Sidebar 아이콘, 버튼 레이블 |
| **Rich** | 제목(선택) + 본문 + 보조(선택) | 부상 뱃지, SliderControl 설명, 수상 트로피 |
| **List** | 헤더(선택) + 반복 행 목록 | 선수 능력치 변화 로그 |
| **Cursor** | 커서 추적, 복합 구조 | 샷차트 |

---

#### 공통 컨테이너 스펙

| 속성 | 값 | 토큰 |
|------|-----|------|
| 배경 | #18181B | `surface/background` |
| 보더 | 1px, #3F3F46 | `border/default` |
| border-radius | 8px | — |
| padding | 10px (사방 동일) | — |
| shadow | `0 1px 3px rgba(0,0,0,0.10)` + `0 1px 2px rgba(0,0,0,0.06)` (`/shadow/base`) (2종 합성) | — |
| z-index | 50 | — |
| pointer-events | none | — |

> 피그마에서는 바디 컨테이너와 Arrow를 분리 구성 (콘텐츠에 따른 자동 크기 확장 때문). 코드 구현 시 하나의 컴포넌트로 통합할 것.

#### 공통 Props

| prop | 타입 | 설명 |
|------|------|------|
| `type` | `"Simple" \| "Rich" \| "List" \| "Cursor"` | variant 선택 |
| `position` | `"top" \| "bottom" \| "left" \| "right"` | arrow 방향 (Cursor는 미사용) |

> **size prop 없음.** 크기는 variant별 max-width로 자동 결정.

---

#### 공통 타이포그래피

| 슬롯 | font-size | line-height | font-weight | 색상 |
|------|-----------|-------------|-------------|------|
| body (주요 내용) | 12px | 16px | SemiBold (600) | `text/primary` #FAFAFA |
| label (카테고리·속성명) | 10px | 14px | Bold (700) | `cta/default` #6366F1 |
| sub (보조·날짜) | 10px | 14px | Bold (700) | `text/muted` #A1A1AA |
| mono (수치·시간) | 12px | 16px | Regular (400) | `text/muted` #A1A1AA, font-mono 적용 |

> 피그마에서 mono 폰트 미적용 (일반 Pretendard 사용). 코드 구현 시 mono 슬롯에 font-mono 적용할 것.

#### 공통 Arrow

| 속성 | 값 |
|------|-----|
| 크기 | 밑변 6px × 높이 4px |
| 색상 | `border/default` #3F3F46 |
| 피그마 | 하단 고정 |
| 코드 구현 | position prop에 따라 방향 회전 — top: 하단 / bottom: 상단 / left: 우측 / right: 좌측 |

> **Cursor variant는 arrow 없음.**

---

#### Simple

```
┌──────────────────┐
│  레이블 텍스트     │  ← body, whitespace-nowrap
└──────────────────┘
         ▼
    [트리거 요소]
```

| 속성 | 값 |
|------|-----|
| max-width | 160px |
| 줄바꿈 | 없음 |

**Props:** `position: top / bottom / left / right`

**사용 케이스:**

| 사용처 | position |
|--------|---------|
| Sidebar 아이콘 전체 | right |
| TacticsBoard 액션 버튼 | top |
| MessageList 버튼, LeaderboardToolbar 버튼 등 | top |
| 수상 트로피 배지 | bottom |

---

#### Rich

```
┌──────────────────────┐
│ LABEL                │  ← 선택 (10px, cta/default)
│                      │  ← gap 10px
│ 본문 내용 텍스트       │  ← 필수 (12px, text/primary)
│ 보조 설명             │  ← 선택 (10px, text/muted) gap 4px
└──────────────────────┘
            ▼
       [트리거 요소]
```

**내부 구조:**
- 컨테이너 (flex-col, gap 10px)
  - label 슬롯
  - body+sub 그룹 (flex-col, gap 4px)
    - body
    - sub (선택)

| 속성 | 값 |
|------|-----|
| max-width | 220px |
| 줄바꿈 | 허용 |
| 컨테이너 내부 gap | 10px (label ↔ body+sub 그룹) |
| body-to-sub gap | 4px |

> ⚠️ 피그마 코드에 `whitespace-nowrap`이 포함되어 있으나 코드 구현 시 반드시 제거할 것. `max-width: 220px`는 반드시 유지 — 긴 텍스트가 max-width 안에서 자연스럽게 줄바꿈되어야 함.

**타이포그래피 (Rich 전용):**

| 슬롯 | font-size | line-height | font-weight | 색상 |
|------|-----------|-------------|-------------|------|
| label | 10px | 14px | Bold (700) | `cta/default` #6366F1 |
| body | 12px | 16px | SemiBold (600) | `text/primary` #FAFAFA |
| sub | 10px | 14px | Bold (700) | `text/muted` #A1A1AA |

**사용 케이스:**

| 사용처 | label | body | sub |
|--------|-------|------|-----|
| 부상 뱃지 (OUT/DTD) | 부상 타입 (ex. `KNEE`) | 예상 복귀일 | — |
| SliderControl 설명 | — | 슬라이더 설명 텍스트 | — |

---

#### List

```
┌──────────────────────────┐
│ HEADER (선택)             │  ← 10px, cta/default, Bold
│                          │  ← gap 10px (divider 없음)
│ YY-MM-DD   ▼ 81 → 83    │  ← row (반복)
│ YY-MM-DD   ▼ 81 → 83    │
│ YY-MM-DD   ▼ 81 → 83    │
└──────────────────────────┘
              ▼
         [트리거 요소]
```

**내부 구조:**
- 컨테이너 (flex-col, gap 10px)
  - header 슬롯 (선택)
  - row 목록 (flex-col, gap 4px)
    - row: date + value (flex, gap 12px)

| 속성 | 값 |
|------|-----|
| max-width | 200px |
| 컨테이너 gap | 10px (header ↔ row 목록) |
| row 간격 | 4px |
| date-to-value gap | 12px |
| divider | 없음 |

**타이포그래피:**

| 슬롯 | font-size | line-height | font-weight | 색상 |
|------|-----------|-------------|-------------|------|
| header | 10px | 14px | Bold (700) | `cta/default` #6366F1 |
| date | 10px | 14px | Regular (400) | `text/muted` #A1A1AA |
| value (`▲▼ 전→후`) | 10px | 14px | SemiBold (600) | ▲: `success/text` #34D399 / ▼: `danger/text` #F87171 |

> date와 value는 하나의 row로 묶임. value는 `▼ 81 → 83` 형태로 방향+수치를 단일 텍스트로 표현.
> date는 피그마에서 일반 폰트 사용 — 코드 구현 시 font-mono 적용.
> ⚠️ 피그마 코드에 `whitespace-nowrap` 포함 — 코드 구현 시 제거. `max-width: 200px` 유지.

**사용 케이스:**

| 사용처 | header | row 구성 |
|--------|--------|---------|
| 능력치 변화 로그 | 능력치 이름 | `YY-MM-DD` + `▲▼ 전→후값` |

---

#### Cursor

커서 좌표 기준 동적 위치 계산. **arrow 없음.**

**위치 계산 규칙:**
- 기본: 커서 우하 +12px, +12px
- 우측 경계 초과 시: 커서 좌측 flip
- 하단 경계 초과 시: 커서 상측 flip
- 최소값: left ≥ 4px, top ≥ 4px

**Anatomy:**

```
┌─────────────────────────────────────┐
│ 샷 정보                             │  ← 헤더
│ ┌───────────────────────────────┐   │
│ │ Q{n} {mm:ss}      +2 PTS     │   │  ← Row 1: 쿼터+시간 | 결과 (gap 10px)
│ │ {선수명} · {슛타입} · {n}ft  │   │  ← Row 2: 선수·슛 정보 (내부 gap 4px)
│ │ +1 FT / MISS FT              │   │  ← Row 3: 추가 자유투 (조건부)
│ │ {어시스터} / {블로커}         │   │  ← Row 4: 어시·블락 (조건부)
│ └───────────────────────────────┘   │
├─────────────────────────────────────┤  ← divider (클러스터 있을 때만)
│ Cluster List                        │
│ ●  +{점수} · {선수명} · {슛타입} · {n}ft  │  ← 성공: 점수 밸류 포함
│ ✕  {선수명} · {슛타입} · {n}ft           │  ← 실패: 밸류 없음
│ +N 개의 추가 결과 (클릭)             │  ← 5개 초과 시
└─────────────────────────────────────┘
```

**컨테이너 스펙:**

| 속성 | 값 |
|------|-----|
| padding | 10px (사방) |
| border-radius | 8px |
| background | `surface/background` #18181B |
| border | 1px solid `border/default` #3F3F46 |
| shadow | `0 1px 3px rgba(0,0,0,0.10)` + `0 1px 2px rgba(0,0,0,0.06)` (`/shadow/base`) |
| min-width | 180px |
| max-width | 240px |

**헤더:**

| 요소 | font-size | font-weight | 색상 | 하단 여백 |
|------|-----------|-------------|------|-----------|
| "샷 정보" | 10px | Bold (700) | `cta/default` #6366F1 | 8px |

**Primary Shot 스펙:**

Primary 섹션 내부: `flex-col gap=4px`

| 요소 | 내용 | font-size | font-weight | 색상 |
|------|------|-----------|-------------|------|
| Row 1 좌 | `Q{쿼터} {mm:ss}` | 12px, font-mono | Regular (400) | `text/muted` #A1A1AA |
| Row 1 우 (성공) | `+{점수} PTS` | 12px | Regular (400) | `success/text` #34D399 |
| Row 1 우 (실패) | `MISS` | 12px | Regular (400) | `text/muted` #A1A1AA |
| Row 1 우 (블락) | `BLOCK` | 12px | Regular (400) | `danger/text` #F87171 |
| Row 1 내부 gap | — | — | — | 10px (좌↔우 justify-between) |
| Row 2 선수명 (성공 시) | truncate, max 120px | 12px | Regular (400) | `success/text` #34D399 |
| Row 2 선수명 (실패 시) | truncate, max 120px | 12px | Regular (400) | `text/primary` #FAFAFA |
| Row 2 슛타입 | 조건부 | 12px | Regular (400) | `text/muted` #A1A1AA |
| Row 2 거리 | `{n}ft` | 12px, font-mono | Regular (400) | `text/muted` #A1A1AA |
| Row 2 내부 gap | — | — | — | 4px |
| Row 3 추가 자유투 | `추가자유투 성공/실패` 텍스트 조건부 | 12px | Regular (400) | `success/text` #34D399 |
| Row 4 어시스터 | `{선수명}` | 12px | Regular (400) | `amber-400` #FBBF24 |
| Row 4 구분자 | ` / ` | 12px | Regular (400) | `text/primary` #FAFAFA |
| Row 4 블로커 | `{선수명}` | 12px | Regular (400) | `danger/text` #F87171 |

> Row 1 우측: `+{점수} PTS`는 **자유투 포함 총 득점**. Row 3, Row 4는 해당 이벤트가 있을 때만 렌더링.

**Cluster 스펙:**

Cluster 섹션: `flex-col gap=4px`, max-height: 80px, overflow-y: scroll

**성공 Row** (`●` 심볼):

| 컬럼 | 내용 | font-size | font-weight | 색상 |
|------|------|-----------|-------------|------|
| 상태 심볼 | `●` | 12px | Regular (400) | `text/primary` #FAFAFA |
| 심볼↔내용 그룹 gap | — | — | — | 10px |
| 점수 밸류 | `+{점수}` | 12px | Regular (400) | `success/text` #34D399 |
| 선수명 | truncate, max 100px | 12px | Regular (400) | `text/primary` #FAFAFA |
| 슛타입 | 조건부 | 12px | Regular (400) | `text/muted` #A1A1AA |
| 거리 | `{n}ft` | 12px, font-mono | Regular (400) | `text/muted` #A1A1AA |
| 내용 그룹 내부 gap | — | — | — | 4px |

**실패 Row** (`✕` 심볼):

| 컬럼 | 내용 | font-size | font-weight | 색상 |
|------|------|-----------|-------------|------|
| 상태 심볼 | `✕` | 12px | Regular (400) | `text/primary` #FAFAFA |
| 심볼↔내용 그룹 gap | — | — | — | 10px |
| 선수명 | truncate, max 100px | 12px | Regular (400) | `text/primary` #FAFAFA |
| 슛타입 | 조건부 | 12px | Regular (400) | `text/muted` #A1A1AA |
| 거리 | `{n}ft` | 12px, font-mono | Regular (400) | `text/muted` #A1A1AA |
| 내용 그룹 내부 gap | — | — | — | 4px |

**더보기 행:**

| 컬럼 | 내용 | font-size | font-weight | 색상 |
|------|------|-----------|-------------|------|
| "+N 개의 추가 결과 (클릭)" | 5개 초과 시 | 10px | Regular (400) | `text/muted` #A1A1AA |

**구분선 (클러스터 있을 때만):**

| 속성 | 값 |
|------|-----|
| Primary↔Cluster divider | 1px solid `border/default` #3F3F46 |
| divider 상하 margin | 6px |

---

#### 코드 구현 제약사항 (추후 일괄 처리)

> 아래 항목은 단순 스타일 교체가 아닌 **PBP 엔진 데이터 구조 변경**이 선행되어야 한다. 디자인 구현 단계에서 함께 처리할 것.

**제약 1 — 자유투 포함 총 득점 (`+{점수} PTS`)**

- **현재 상태**: `ShotEvent.points`는 슛 자체 점수(`0 | 2 | 3`)만 저장. 자유투 득점 미포함.
- **필요 변경**:
  - `types/engine.ts` — `ShotEvent`에 `totalPoints?: number` 필드 추가
  - `services/game/engine/pbp/statsMappers.ts` (또는 ShotEvent 생성 지점) — 슛 이벤트 기록 시 이어진 자유투 득점까지 합산하여 `totalPoints`에 저장
  - `components/game/ShotTooltip.tsx` — Row 1 우측을 `shot.totalPoints ?? shot.points`로 렌더링, `+{n} PTS` 포맷으로 교체

**제약 2 — 추가자유투 Row (Row 3)**

- **현재 상태**: `ShotEvent`에 자유투 관련 필드 없음. Row 3 렌더링 불가.
- **필요 변경**:
  - `types/engine.ts` — `ShotEvent`에 `freethrows?: { made: number; attempted: number }` 필드 추가
  - `services/game/engine/pbp/statsMappers.ts` (또는 ShotEvent 생성 지점) — 슛 이후 자유투가 이어진 경우 해당 결과를 `freethrows`에 기록
  - `components/game/ShotTooltip.tsx` — `shot.freethrows`가 존재할 때만 Row 3 렌더링. 성공/실패 텍스트 조건 분기

---

#### 피그마 작업 범위

| variant | 작업 프레임 | 비고 |
|---------|-----------|------|
| Simple | top / bottom / left / right 4종 | arrow 방향만 다름 |
| Rich | 1종 (top 기준) | label on/off, sub on/off 토글 |
| List | 1종 (top 기준) | header on/off, row 2~3개 예시 |
| Cursor | 2종 (Primary only / Primary+Cluster) | arrow 없음, 코드에서 위치 동적 계산 |

---

#### 교체 계획

| 현재 방식 | 교체 variant | 우선순위 |
|----------|-------------|---------|
| `title=` — Sidebar 아이콘 | Simple (right) | 높음 |
| `title=` — TacticsBoard 버튼 5개 | Simple (top) | 높음 |
| `title=` — 부상 뱃지 3곳 | Rich (top) | 중간 |
| `title=` — 각종 버튼 | Simple (top) | 낮음 |
| CSS group-hover — SliderControl | Rich (top) | 낮음 |
| State 기반 — PlayerAwardBadges | Simple (bottom) | 낮음 |

---

### 3-7. Loading / Skeleton

#### Loader (전체 화면)

**파일**: `components/Loader.tsx` (구 `SkeletonLoader.tsx` + `FullScreenLoader.tsx` 통합)

**공통 스펙:**

| 속성 | 값 |
|------|-----|
| height | 35px |
| shadow | `0 4px 6px -1px rgba(0,0,0,0.1)` + `0 2px 4px -1px rgba(0,0,0,0.06)` |
| 텍스트 font-size | 16px |
| 텍스트 font-weight | Bold (700) |
| 텍스트 색 | white |
| 텍스트 left | 31px |
| 텍스트 gap | 16px (진행률 ↔ 메시지) |

**레이어 구조 (아래에서 위 순서):**

| 레이어 | 내용 | 처리 |
|--------|------|------|
| L1 — 배경 | `loader/overlay` #18181B 단색 | absolute inset-0 |
| L2 — 텍스처 | shimmer CSS 애니메이션 오버레이 | absolute, 전체 덮음, pointer-events-none |
| L3 — Progress bar | emerald 그라디언트 + 우측 border + glow | absolute, left-0, 진행률만큼 width |
| L4 — 텍스트 | 진행률 + 메시지 | absolute, left 31px, vertically centered |

> 피그마에서 배경색이 `#1E293B` → `loader/overlay` #18181B로 변경됨. 신규 토큰 `loader/overlay` 등록 필요.  
> L2 shimmer는 피그마 MCP가 이미지로 export하지만, 코드에서는 CSS `@keyframes shimmer` 애니메이션으로 구현. 실제 이미지 파일 사용 불필요.

**Progress Bar 스펙:**

| 속성 | 값 |
|------|-----|
| 배경 | `left: status/success/muted rgba(16,185,129,0.1)` → `right: rgba(16,185,129,0.5)` 좌→우 그라디언트 |
| 우측 border | 2px solid `status/success/text` #34D399 |
| 우측 glow | `0 0 10px 0 status/success/text` #34D399 |
| height | 35px (컨테이너 전체) |

> 이전 단색(#059669) → **그라디언트 + 우측 border + glow** 로 변경.  
> 신규 토큰: `status/success/muted` = `rgba(16,185,129,0.1)` — 피그마에서 등록 필요.

**type 3종:**

| type | 구조 | 사용처 |
|------|------|--------|
| `Onboarding` | 진행률 텍스트만 (`로딩 중... N%`) | 인증 로딩 (`App.tsx`). `progress={0}` 고정 — 거의 노출되지 않음 |
| `Loading` | 진행률 + 메시지 | 세이브 데이터 재구성 (`ProtectedLayout.tsx`) |
| `Simulating` | 진행률 + 메시지 | 시뮬레이션 진행 중 (추후 사용) |

> Loading / Simulating은 동일한 레이아웃. 표시되는 메시지 내용으로만 구분.

**함께 export되는 유틸:**
- `ContentLoader` — Suspense fallback용 플레이스홀더 (`flex-1 bg-black`)
- `DatabaseErrorView` — Supabase 연결 실패 에러 화면

---

#### Spinner (인라인)

버튼, 모달 등 인라인 로딩 표시. lucide-react `Loader2` + `animate-spin` 사용.

| Size | 크기 | 사용처 |
|------|------|--------|
| sm | 12px (w-3 h-3) | Button xs / sm |
| md | 16px (w-4 h-4) | Button md 이상, 모달 버튼 |
| lg | 20px (w-5 h-5) | 독립 스피너 필요 시 |

> Button 컴포넌트에 `isLoading` prop으로 내장. 별도 Spinner 컴포넌트 불필요.

---

#### Skeleton (콘텐츠 플레이스홀더)

shimmer 애니메이션으로 콘텐츠 로딩 중 임시 표시.

| Type | 용도 |
|------|------|
| Line | 텍스트 대체 (가변 너비) |
| Card | 카드 전체 대체 |
| TableRow | 테이블 행 대체 |

> 현재 미구현. 추후 콘텐츠 영역 로딩 UX 개선 시 제작.

---

## Phase 4 — Composite Components

> Primitive 조합으로 만들어지는 재사용 복합 요소.

### 4-1. Card

---

#### 디자인 원칙 (Fundamentals)

**원칙 1 — 레이어 계층**

카드는 배경 위에 올라오는 표면(surface)이다. 표면은 최대 3단계 깊이를 가진다.

| 레이어 | 용도 | 배경색 |
|--------|------|--------|
| L0 — Page | 페이지 배경 | `surface/background` #18181B |
| L1 — Card | 1차 콘텐츠 표면 | `surface/card` zinc-800 #27272A |
| L2 — Inset | 카드 내부 중첩 영역 | `surface/inset` zinc-950 #09090B |

> `surface/card`(zinc-800 #27272A), `surface/inset`(zinc-950 #09090B) — 피그마에서 신규 토큰으로 정의할 것.  
> L0 → L1 → L2 순으로 어두워지는 것이 아니라 **L1이 가장 밝고** L0/L2는 더 어둡다. 카드가 배경에서 들뜨는 느낌을 준다.

---

**원칙 2 — Border**

카드의 테두리는 콘텐츠 경계를 명확히 하되, 과도한 존재감을 갖지 않아야 한다.

| 상황 | 보더 |
|------|------|
| 기본 | 1px `border/default` #3F3F46 |
| Hover (클릭 가능) | 1px `border/emphasis` #52525B |
| Selected | 1px `cta/default` #6366F1 |
| Glass / 반투명 | 1px `border/default` 50% opacity |

---

**원칙 3 — Border Radius**

카드 계층에 따라 radius를 일관되게 적용한다. 계층이 낮을수록 radius가 작다.

| 레이어 | radius | 용도 |
|--------|--------|------|
| L1 — Card (기본) | 12px | 섹션 패널, 정보 카드 등 대부분 |
| L1 — Card (대형) | 16px | 모달, 폼 컨테이너 등 화면 중앙 주인공 카드 |
| L2 — Inset | 12px | 카드 내부 중첩 요소 |

> 현행 `rounded-3xl`(24px) 남용 → 12px / 16px 2종으로 통일. 중첩 요소는 8px.

---

**원칙 4 — Shadow**

그림자는 카드의 깊이감을 만든다. 카드 레이어에만 적용하며 Inset 요소에는 적용하지 않는다.

| 용도 | shadow |
|------|--------|
| 기본 카드 | `0 1px 3px rgba(0,0,0,0.10)` + `0 1px 2px rgba(0,0,0,0.06)` (`/shadow/base`) |
| 강조 카드 (모달, 폼) | `0 20px 40px rgba(0,0,0,0.4)` |

---

**원칙 5 — Padding**

카드의 내부 여백은 콘텐츠 밀도에 따라 4단계로 통일한다.

| 값 | 크기 | 용도 |
|----|------|------|
| none | 0 | 테이블·리스트가 카드를 꽉 채울 때 |
| sm | 12px | 밀도 높은 정보 패널 |
| md | 16px | 기본 콘텐츠 카드 |
| lg | 24px | 여백이 넓은 주인공 카드 (폼, 온보딩 등) |

---

**원칙 6 — 팀 컬러 연동**

트레이드 오퍼, 협상 등 특정 팀을 대표하는 카드에만 팀 컬러를 적용한다.

| 요소 | 처리 |
|------|------|
| 상단 accent 라인 | 4px, 팀 primary color |
| Hover border | 팀 primary color로 전환 |
| 배경 glow | 팀 primary color, blur 60px, 우상단 고정, opacity 20% → 40%(hover) |

> 팀 컬러 연동은 도메인 전용 카드에만 허용. 일반 정보 카드에 팀 컬러 glow 사용 금지.

---

#### Card/Base 스타일 정의

카드는 컨테이너 역할만 한다. 내부 콘텐츠(테이블, 리스트, 도메인 컴포넌트 등)는 각 화면 디자인 단계에서 별도로 정의한다. 피그마에서는 **스타일 토큰과 상태만 정의**하고, 콘텐츠 슬롯은 비워둔다.

---

**Card/Base 토큰:**

| 요소 | 속성 | 값 |
|------|------|----|
| 배경 | fill | `surface/card` zinc-800 #27272A |
| 보더 (Default) | stroke | 1px `border/default` #3F3F46 |
| 보더 (Hover) | stroke | 1px `border/emphasis` #52525B |
| 보더 (Selected) | stroke | 1px `cta/default` #6366F1 |
| shadow | effect | `0 1px 3px rgba(0,0,0,0.10)` + `0 1px 2px rgba(0,0,0,0.06)` (`/shadow/base`) |

**radius 2종:**

| variant | radius | 용도 |
|---------|--------|------|
| default | 12px | 섹션 패널 등 대부분 |
| large | 16px | 폼 컨테이너, 모달 등 화면 중앙 주인공 카드 |

**padding 4종:**

| variant | 값 | 용도 |
|---------|----|------|
| none | 0 | 테이블·리스트가 카드를 꽉 채울 때 |
| sm | 12px | 밀도 높은 정보 패널 |
| md | 16px | 기본 (기본값) |
| lg | 24px | 여백이 넓은 주인공 카드 |

**Card/Inset 토큰:**

| 요소 | 속성 | 값 |
|------|------|----|
| 배경 | fill | `surface/inset` zinc-950 #09090B |
| 보더 (Default) | stroke | 1px `border/default` #3F3F46, opacity 50% |
| 보더 (Hover) | stroke | 1px `border/emphasis` #52525B |
| 보더 (Selected) | stroke | 1px `cta/default` #6366F1 |
| border-radius | — | 12px |
| padding | — | 16px (사방) |
| shadow | — | 없음 |

> Inset은 Card(L1) 안에서만 사용. Inset 안에 Inset 중첩 금지.

**피그마 작업 프레임:**

```
Card/Base
├── radius=default / padding=sm  / state=Default
├── radius=default / padding=md  / state=Default · Hover · Selected
├── radius=default / padding=lg  / state=Default
├── radius=large   / padding=lg  / state=Default
└── padding=none   / state=Default

Card/Inset
├── Default
└── Hover  (클릭 가능한 행용)
```

> 카테고리별 상세 디자인(섹션 패널 / 폼 / 선택형 / 오퍼 카드)은 각 화면 디자인 단계에서 Card/Base를 베이스로 확장하여 정의한다.

---

### 4-2. Tab Bar

#### 현황 진단

| 패턴 | 사용처 | 구현 방식 |
|------|--------|---------|
| **Underline** | DashboardView, FrontOfficeView, TransactionsView, StandingsView, GameResultView, LegalModal 등 대부분 | `TabBar.tsx` 공통 컴포넌트 + 인라인 혼재 |
| **Pill** | LiveGameView, GameShotChartTab, 인박스 TeamStatsWithRanks | 인라인 각자 구현 |

> Chip 타입은 현재 미사용 → 작업 범위 제외.  
> Underline 방식은 공통 `TabBar.tsx`가 있으나 일부 뷰가 인라인으로 각자 구현 중 → 통합 필요.

---

#### Variant 2종

---

##### Underline (기본형)

전체 탭 하단에 1px 구분선이 있고, 선택된 탭 아래에만 2px 인디고 라인이 표시된다.

**사용처:** DashboardView, FrontOfficeView, TransactionsView, StandingsView, GameResultView, LegalModal 등

**Anatomy:**

```
[탭1]  [탭2 ●]  [탭3]  [탭4]
─────────────────────────────  ← 전체 하단 1px border
        ▔▔▔▔▔               ← 선택 탭 하단 2px (cta/default)
```

**컨테이너:**

| 속성 | 값 |
|------|-----|
| 하단 구분선 | 1px `border/default` #3F3F46 |
| 배경 | 없음 (투명) |
| 탭 간격 | gap 0, 탭 아이템 내부 px로 간격 조절 |

**Tab Item:**

| 상태 | 텍스트 색 | 하단 border | 배경 |
|------|----------|------------|------|
| Default | `text/muted` #A1A1AA | 없음 | 없음 |
| Hover | `text/primary` #FAFAFA | 없음 | 없음 |
| Selected | `cta/subtle` #A5B4FC | `cta/default` #6366F1 **3px** | 없음 |
| Disabled | `text/disabled` #71717A | 없음 | 없음 |

| 속성 | 값 |
|------|-----|
| font-size | 14px |
| font-weight | SemiBold (600) |
| padding | 12px (상하) / 6px (좌우) |
| gap | 8px |
| cursor (Disabled) | not-allowed |

**배지 (조건부):**

수신 오퍼 수 등 카운트가 필요한 탭에만 사용. 탭 레이블 우측에 인라인 배치.

| 속성 | 값 |
|------|-----|
| 배경 | `danger/text` #F87171 (미확인) / `text/disabled` #71717A (확인됨) |
| 색 | white |
| 크기 | 16px × 16px |
| border-radius | 50% |
| font-size | 10px |
| font-weight | Bold (700) |
| gap (레이블↔배지) | 6px |

> 배지는 **비선택 상태에서만** 표시. 선택된 탭에서는 숨김 (현재 보고 있는 탭이므로).

**피그마 프레임 구성:**

```
TabBar/Underline
├── Item / Default
├── Item / Hover
├── Item / Selected
├── Item / Disabled
├── Item / Selected + Badge
├── Item / Default + Badge
└── TabBar 전체 예시 (4탭, 배지 포함 1개)
```

---

##### Pill (보조형)

선택된 탭이 배경색으로 채워지는 방식. 컨테이너 안에 버튼들이 모여있는 형태.

**사용처:** LiveGameView 경기 중 전환, GameShotChartTab 팀 토글, 인박스 TeamStatsWithRanks 스탯 카테고리

**Anatomy:**

```
┌─────────────────────────────────┐
│  [  탭1  ]  [ ■탭2■ ]  [  탭3  ] │  ← 선택된 탭만 배경 채움
└─────────────────────────────────┘
```

**컨테이너:**

| 속성 | 값 |
|------|-----|
| 배경 | `surface/background` #18181B |
| border-radius | 8px |
| padding | 4px (사방) |
| 보더 | 1px `border/default` #3F3F46 |

**Tab Item:**

| 상태 | 텍스트 색 | 배경 | border-radius |
|------|----------|------|--------------|
| Default | `text/muted` #A1A1AA | 없음 | 12px |
| Hover | `text/primary` #FAFAFA | `surface/card` zinc-800 #27272A | 12px |
| Selected | white | `cta/default` #6366F1 | 12px |
| Disabled | `text/disabled` #71717A | 없음 | 12px |

| 속성 | 값 |
|------|-----|
| font-size | 14px |
| font-weight | SemiBold (600) |
| padding | 12px (상하) / 6px (좌우) |
| gap | 8px |

> Pill은 배지 미사용. 아이콘 포함 가능 (탭 레이블 좌측, 14px).

**피그마 프레임 구성:**

```
TabBar/Pill
├── Item / Default
├── Item / Hover
├── Item / Selected
├── Item / Disabled
└── TabBar 전체 예시 (3탭)
```

---

#### 공통 주의사항

- **Underline vs Pill 선택 기준**: 페이지 레벨 콘텐츠 전환 → Underline. 카드/패널 내부 소형 전환 → Pill
- **탭 개수**: 최소 2개, 최대 5개 권장. 5개 초과 시 스크롤 처리 검토
- **Disabled**: 기능 미구현 탭에만 사용. 아예 표시하지 않는 것도 고려

---

### 4-3. Modal

> **계층 구조 (Atomic Design)**
> - **4-3-A Modal (Atom)**: 오버레이 + 패널 컨테이너. 콘텐츠 없는 기본 틀
> - **4-3-B Confirm Dialog (Molecule)**: Modal Atom + 아이콘 + 제목 + 설명 + 버튼 2개 조합

---

#### 4-3-A. Modal (Atom)

개별 디자인 방침: 공통 Modal Atom 기반으로, 필요한 모달이 생기면 그 시점에 개별 디자인. 아래 원칙만 준수.

**디자인 원칙:**

- **컨테이너**: 배경 `surface/card` #27272A, 보더 1px `border/default` #3F3F46, border-radius 16px
- **Shadow**: `0 20px 40px rgba(0,0,0,0.4)`
- **오버레이**: `surface/background` #18181B, opacity 80%, backdrop-blur
- **구성**: 헤더(타이틀 + 닫기 버튼) + 콘텐츠(스크롤) + 푸터(우측 정렬 액션) — 필요한 슬롯만 사용
- **Size**: sm 400px / md 560px / lg 720px / xl 960px
- **닫기**: 우상단 X 버튼 + 오버레이 클릭 두 가지 모두 지원

---

#### 4-3-B. Confirm Dialog (Molecule)

> Modal Atom + 아이콘 + 제목 + 설명 + 버튼 2개 조합.
> 비가역적 액션(삭제, 초기화, 방출 등) 또는 중요한 확인이 필요한 경우 사용.

**구조**

```
┌────────────────────────────┐
│                            │
│          [아이콘]           │  ← 32px, 배경 없음
│                            │
│          제목               │  ← 24px SemiBold, white
│       설명 텍스트           │  ← 14px Bold, text/muted
│                            │
│   [취소]     [확인/실행]    │  ← 버튼 2개 가로 배치
└────────────────────────────┘
```

**컨테이너**

| 속성 | 값 |
|------|----|
| 너비 | `size-full` (부모 컨테이너 의존) |
| 배경 | `surface/card` #27272A |
| 보더 | 1px `border/default` #3F3F46 |
| border-radius | 16px |
| shadow | `shadow/xl` — `0 20px 25px -5px rgba(0,0,0,0.10)` + `0 10px 10px -5px rgba(0,0,0,0.04)` |
| padding | 좌우 32px / 상하 24px |
| 정렬 | flex-col, items-center, justify-center |

**레이아웃**

| 속성 | 값 |
|------|----|
| 아이콘 ↔ 텍스트 그룹 gap | 16px |
| 제목 ↔ 설명 gap | 8px |
| Body ↔ 버튼 그룹 gap | 32px |
| 버튼 영역 | 가로 flex, gap 16px, justify-center |

**아이콘**

| 속성 | 값 |
|------|----|
| 크기 | 32px × 32px |
| 배경/보더 컨테이너 | 없음 |
| 색상 | variant별 (아래 테이블 참조) |

**타이포그래피**

| 요소 | 스펙 |
|------|------|
| 제목 | 24px SemiBold(600), `text/primary` #FAFAFA, line-height 32px |
| 설명 | 14px Bold, `text/muted` #A1A1AA, line-height 20px |

**Props**

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `property1` | `"YN" \| "OK"` | `"YN"` | 버튼 모드 — YN: 취소+확인 2개 / OK: 확인 1개만 |
| `property2` | `"Default" \| "Danger"` | `"Default"` | variant |
| `showNButton` | `boolean` | `true` | 취소 버튼 표시 여부 (YN 모드에서만 유효) |
| `showYButton` | `boolean` | `true` | 확인 버튼 표시 여부 |
| `title` | `string` | — | 제목 텍스트 |
| `bodyText` | `string` | — | 설명 텍스트 |

**버튼 구성**

| property1 | property2 | 버튼 구성 |
|-----------|-----------|---------|
| `"YN"` | `"Default"` | Outline(취소) + PrimaryCta(확인) |
| `"YN"` | `"Danger"` | Outline(취소) + Danger(실행) |
| `"OK"` | `"Default"` | PrimaryCta(확인) 1개만 |

**Variant**

| Variant | 아이콘 | 아이콘 색상 | 확인 버튼 | 사용 상황 |
|---------|--------|------------|---------|---------|
| **Default** | HelpCircle | `cta/subtle` #A5B4FC | PrimaryCta (인디고) | 일반 확인, 저장 등 |
| **Danger** | AlertTriangle | `status/danger/text` #F87171 | `status/danger/default` #DC2626 bg + `status/danger/border` #F87171 border | 삭제·초기화·방출 등 비가역적 액션, **Warning 상황 포함** |

**현재 구현체**: `components/ResetDataModal.tsx` — Danger variant 적용

---

### 4-4. Dropdown (Select)

> **범위**: 이 섹션은 "값/데이터 선택" 목적의 Select 패턴을 다룬다. 액션 실행 목적의 Dropdown(Sidebar 프로필 메뉴 등)은 2-3 NavDropdown, Split Button의 액션 드롭다운은 3-1 Split Button 섹션 참조.

#### 케이스 분류

| 타입 | 트리거 | 패널 | 현재 사용처 |
|------|--------|------|-----------|
| **Select** | 선택된 값 텍스트 + ChevronDown | 단순 목록 | LeaderboardToolbar 뷰 모드·스탯 카테고리 |
| **Searchable Select** | 아이콘 + 선택된 값(또는 플레이스홀더) + ChevronDown | 검색창 + 목록 | 트레이드 상대 팀 선택 |
| **Multi-select** | 레이블 + 선택 개수 배지 | 체크박스 목록 | LeaderboardToolbar 팀·포지션 필터 |
| **Native `<select>` 교체 대상** | — | — | 계약 연수·전술 슬롯·rows 수 등 숫자/단순 옵션 |

---

#### 공통 Panel 스타일

| 속성 | 값 |
|------|----|
| 배경 | `surface/card` #27272A |
| 보더 | `border/default` #3F3F46, 1px |
| border-radius | 12px |
| shadow | `elevation/md`: `0 4px 6px rgba(0,0,0,0.15)` + `0 2px 4px rgba(0,0,0,0.10)` |
| 내부 padding | 8px (패널 자체) |
| 최소 너비 | 트리거 너비 이상 |
| 위치 | portal 기반, 트리거 하단 4px gap |

#### DropdownItem 상태별 스펙

| State | 배경 | 텍스트 | 아이콘 |
|-------|------|--------|--------|
| Default | transparent | `text/muted` #A1A1AA | `text/muted` |
| Hover | `surface/inset` #09090B (8% opacity) | `text/primary` #FAFAFA | `text/primary` |
| Selected | `cta/default` 10% | `cta/subtle` #A5B4FC | `cta/subtle` (체크마크 우측 표시) |
| Disabled | transparent | `text/disabled` #71717A | `text/disabled` |

- 아이템 padding: 8px 12px
- 아이템 border-radius: 8px
- 아이템 높이: 36px
- 텍스트: 14px Regular

---

#### Type 1 — Select

단일 값 선택. 선택된 값이 트리거에 반영됨.

**Trigger**

| 속성 | 값 |
|------|----|
| 배경 | `surface/card` #27272A |
| 보더 | `border/default` #3F3F46, 1px |
| border-radius | 8px |
| padding | 8px 12px |
| 높이 | 36px |
| 텍스트 | 선택된 값, 14px Medium, `text/primary` |
| 우측 아이콘 | ChevronDown 16px (닫힘) / ChevronUp (열림), `text/muted` |

**Panel**

- 공통 Panel 스타일 적용
- 현재 선택 아이템에 Selected 상태 스타일

---

#### Type 2 — Searchable Select

목록이 길거나(팀 30개 등) 검색이 필요한 경우.

**Trigger**

Select Trigger와 동일 구조. 선택된 값 없을 시 플레이스홀더 (`text/muted`).  
아이콘이 있는 경우 좌측에 16px 아이콘 + 8px gap.

**Panel**

- 상단: 검색 Input 컨테이너 (8px padding, border-bottom `border/default` 1px)
  - Input height 32px, placeholder "검색...", 14px, `text/muted`
  - 검색 아이콘 좌측 16px
- 하단: 스크롤 가능한 목록 (최대 높이 240px, `overflow-y: auto`)
- 아이템 좌측에 16px 아이콘(TeamLogo 등) + 8px gap 허용

---

#### Type 3 — Multi-select Filter

팀·포지션 등 복수 선택 필터. 주로 리스트/테이블 상단 필터 바에서 사용.

**Trigger**

| 상태 | 스타일 |
|------|--------|
| 기본 | `surface/card` 배경, `border/default` 1px, `text/muted` 레이블 |
| 1개 이상 선택됨 | `border/emphasis` #52525B (또는 `cta/default` 20%), 선택 개수 Badge 우측 표시 |

선택 개수 Badge: `cta/default` 배경, white 텍스트, 12px Bold, 16px × 16px circle

**Panel**

- 맨 위: "전체 선택/해제" 아이템 (굵기 Medium)
- 구분선 이후: 개별 아이템 목록
- 각 아이템: 16px 체크박스(선택 시 `cta/default` fill) + 레이블
- 아이콘 허용 (TeamLogo 등)

---

### 4-5. Slider Control

#### 타입 분류

| Type | 설명 | 현재 사용처 |
|------|------|-----------|
| **Continuous** | 자유 이동, 숫자 값 실시간 표시 | GM 슬라이더(1~10), 투자/훈련 예산 |
| **Step** | 3단계 snap, 단계 레이블 표시 | 전술 슬라이더 17종 |
| **Read-only Bar** | 조작 불가, 값 시각화만 | 코치 성향 7종 |

---

#### 컴포넌트 구조

```
[슬라이더 이름]  [?]               [현재 값 / 단계 레이블]
[━━━━━━━━━━━●──────────────────]
[좌측 끝 레이블]               [우측 끝 레이블]  ← 선택
```

---

#### 공통 토큰

**Track**

| 속성 | 값 |
|------|----|
| 높이 | 6px |
| border-radius | 4px |
| 빈 영역 색상 | `surface/elevated` #27272A |
| 채움 색상 | `cta/strong` #4f46e5 (전체 통일, fillColor 시스템 폐기) |

**Thumb (Handle)**

| 속성 | 값 |
|------|----|
| 크기 | 14px × 14px |
| 배경 | #FFFFFF |
| border-radius | 50% |
| shadow | `0 1px 3px rgba(0,0,0,0.30)` + `0 1px 2px rgba(0,0,0,0.20)` |

**레이블 행 (트랙 상단)**

| 요소 | 스펙 |
|------|------|
| 슬라이더 이름 (좌) | 12px SemiBold, `text/primary` #FAFAFA |
| 툴팁 아이콘 | HelpCircle 12px, `text/disabled` (선택) — hover 시 48px 말풍선 |
| 보조 레이블 (우) | 12px SemiBold, `text/muted` #A1A1AA, 우측 정렬 — 현재 값 또는 단계명 |

**티커 행 (트랙 하단, Step 전용)**

| 요소 | 스펙 |
|------|------|
| 각 단계 레이블 | 10px Medium, `cta/subtle` #A5B4FC |
| 정렬 | 좌 / 중앙 / 우 (3단계 기준) |

**컨테이너**

- 레이블 행 ↔ 트랙 행 gap: 6px
- 트랙 행 높이: 20px (thumb 오버플로 확보)
- 트랙 행 ↔ 티커 행 gap: 4px
- 상하 padding: 4px

---

#### Type 1 — Continuous

- 보조 레이블: 현재 숫자 값 (예: `7`, `$5M`)
- 티커 없음
- mouseUp / keyUp 시 커밋 (60fps 방지)

---

#### Type 2 — Step (Discrete)

- 보조 레이블: 현재 단계 레이블 (예: `느림`, `보통`, `빠름`)
- 티커: steps 수만큼 하단에 균등 배치 (3단계 → 3개)
- 내부적으로 step index(0~N-1) 변환 → 트랙 채움 % 계산

---

#### Type 3 — Read-only Bar

조작 불가, 수치 시각화 전용 (코치 성향 표시 등).

- Thumb 없음
- 트랙 채움만 표시
- 좌우 끝에 레이블 (낮은 값 설명 / 높은 값 설명)

---

#### 그룹화 패턴

```
┌ [그룹 헤더] ──────────────────────────┐  ← 12px SemiBold, text/muted
│                                        │  ← 헤더 좌측 3px solid fillColor
│  슬라이더 A                            │
│  슬라이더 B                            │  ← 그룹 내 gap 12px
│  슬라이더 C                            │
└────────────────────────────────────────┘
         ↕ 24px
┌ [다음 그룹] ──────────────────────── ┐
│  ...
```

---

#### 현재 사용 중인 슬라이더 전체 목록

---

**A. 전술 슬라이더 — Step 타입 (TacticsSlidersPanel, LiveTacticsTab)**

> `SliderControl` 공용 컴포넌트 사용. 3단계 Step.

| 그룹 | 레이블 | 키 | 단계 (값) | fillColor |
|------|--------|-----|-----------|-----------|
| 게임 운영 | 게임 템포 | `pace` | 느림(2) / 보통(5) / 빠름(9) | #f97316 |
| 게임 운영 | 볼 회전 | `ballMovement` | 드리블위주(2) / 보통(5) / 패스위주(8) | #f97316 |
| 게임 운영 | 공격 리바운드 | `offReb` | 백코트우선(2) / 보통(5) / 적극가담(8) | #f97316 |
| 슈팅 전략 | 3점 슛 빈도 | `shot_3pt` | 소극적(2) / 보통(5) / 적극적(9) | #10b981 |
| 슈팅 전략 | 골밑 공격 빈도 | `shot_rim` | 소극적(2) / 보통(5) / 적극적(9) | #10b981 |
| 슈팅 전략 | 중거리 슛 빈도 | `shot_mid` | 소극적(2) / 보통(5) / 적극적(9) | #10b981 |
| 코칭 철학 | 공격 스타일 | `playStyle` | 히어로볼(2) / 밸런스(5) / 시스템(9) | #3b82f6 |
| 코칭 철학 | 공격 포인트 | `insideOut` | 인사이드(2) / 밸런스(5) / 아웃사이드(9) | #3b82f6 |
| 코칭 철학 | P&R 의존도 | `pnrFreq` | 낮음(2) / 보통(5) / 높음(9) | #3b82f6 |
| 온볼 수비 | 수비 압박 강도 | `defIntensity` | 느슨(2) / 보통(5) / 타이트(8) | #6366f1 |
| 온볼 수비 | 스위치 수비 | `switchFreq` | 파이트쓰루(2) / 혼합(5) / 스위치우선(8) | #6366f1 |
| 온볼 수비 | 픽앤롤 수비 | `pnrDefense` | 드랍(0) / 헷지(1) / 블리츠(2) ※예외 | #6366f1 |
| 온볼 수비 | 풀코트 프레스 | `fullCourtPress` | 안함(1) / 가끔(4) / 자주(8) | #6366f1 |
| 오프볼 수비 | 헬프 수비 | `helpDef` | 거의안함(2) / 보통(5) / 적극지원(8) | #d946ef |
| 오프볼 수비 | 지역 방어 | `zoneFreq` | 거의안함(1) / 보통(5) / 지역고수(9) | #d946ef |
| 오프볼 수비 | 수비 리바운드 | `defReb` | 속공전환(2) / 보통(5) / 박스아웃(8) | #d946ef |

> `pnrDefense`: 엔진이 0~2를 직접 사용하는 예외 슬라이더 (별도 `PNR_STEPS` 상수).

---

**B. GM 슬라이더 — Continuous 타입 (GMCreationView)**

> opacity-0 오버레이 + div 커스텀 구현 → **SliderControl 교체 완료.**
> 범위: 1~10, step: 1.

| 레이블 | 키 | fillColor |
|--------|-----|-----------|
| 공격성 | `aggressiveness` | #ef4444 |
| 스타 선호 | `starWillingness` | #facc15 |
| 유스 편중 | `youthBias` | #34d399 |
| 리스크 감내 | `riskTolerance` | #fb923c |
| 픽 활용 | `pickWillingness` | #38bdf8 |

> 5개 슬라이더 값의 유클리드 거리로 GM 성격 타입 7종 중 가장 가까운 타입이 실시간 결정됨.

---

**C. 투자 예산 슬라이더 — Continuous 타입 (InvestmentPanel)**

> 현재 인라인 `<input type="range" accent-indigo-500>` 사용. → **SliderControl 교체 완료.**
> 범위: $0 ~ 가용예산 (동적), step: $1M.

| 레이블 | 키 | 효과 설명 |
|--------|-----|---------|
| 경기장 시설 | `facility` | 관중 점유율 최대 +15% |
| 훈련 프로그램 | `training` | 선수 성장 배율 최대 ×1.5 |
| 스카우팅 | `scouting` | 드래프트 정확도 최대 100% |
| 마케팅 | `marketing` | 스폰서십/MD 수익 최대 +20% |

> 4개 슬라이더 합계가 가용 예산 초과 불가 — 초과 시 자동 clamp.
> fillColor: #6366f1 (기본 인디고).

---

**D. 훈련 예산 슬라이더 — Continuous 타입 (TrainingView)**

> 현재 인라인 `<input type="range">` 사용. → **SliderControl 교체 완료.**
> 범위: $0 ~ $20M, step: $250K.

| 레이블 | 범위 | 단위 |
|--------|------|------|
| 훈련 예산 | $0 ~ $20M | $250K |

> 슬라이더 값 → 훈련 포인트 변환. 포인트는 10개 훈련 프로그램에 +/- 버튼으로 배분.
> fillColor: #6366f1 (기본 인디고).

---

**E. 코치 성향 — Read-only Bar 타입 (CoachNegotiationScreen)**

> 유저가 직접 조작 불가. 코치 생성 시 자동 할당. 현재 div 텍스트로만 표시.
> → **Read-only Bar 컴포넌트 구현 대상.**
> 범위: 1~10.

| 레이블 | 키 | 낮은 값 (1) | 높은 값 (10) |
|--------|-----|-----------|------------|
| 공격 정체성 | `offenseIdentity` | 히어로볼 | 시스템농구 |
| 템포 | `tempo` | 하프코트 | 런앤건 |
| 득점 포커스 | `scoringFocus` | 페인트존 | 3점라인 |
| P&R 강조 | `pnrEmphasis` | ISO/포스트 | PnR헤비 |
| 수비 스타일 | `defenseStyle` | 보수적대인 | 공격적프레셔 |
| 수비 도움 | `helpScheme` | 1:1고수 | 헬프로테이션 |
| 존 디펜스 | `zonePreference` | 대인전용 | 존위주 |

---

### 4-6. Toast

#### 컴포넌트 구조

```
┌──────────────────────────────────────────────────┐
│ [아이콘]  타이틀(선택)          [○카운트다운✕]   │  ← showCloseButton prop
│           바디 텍스트                             │
│                                                  │
│                    [Outline btn]  [Primary btn]  │  ← showButtonGroup prop
└──────────────────────────────────────────────────┘
                    ↑ 하단 중앙 고정 (bottom 40px)
```

#### Props

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `type` | `"Info" \| "Warning" \| "Danger" \| "Success" \| "Basic"` | `"Info"` | variant |
| `showCloseButton` | `boolean` | `true` | 닫기 버튼 표시 여부 |
| `showButtonGroup` | `boolean` | `true` | 하단 버튼 그룹 표시 여부 |

#### 위치 / 애니메이션

| 속성 | 값 |
|------|----|
| 위치 | 하단 중앙 고정, `bottom: 40px` |
| 진입 | 아래에서 위로 슬라이드, 300ms |
| 너비 | 콘텐츠 고정 225px (패딩 포함 총 257px) |

#### 컨테이너 공통 스타일

| 속성 | 값 |
|------|----|
| 배경 | `surface/card` #27272A |
| border-radius | 16px |
| padding | 16px (사방 균일) |
| shadow | `shadow/xl` — `0 20px 25px -5px rgba(0,0,0,0.10)` + `0 10px 10px -5px rgba(0,0,0,0.04)` |
| 보더 | 1px solid, variant별 strong 색상 (아래 테이블 참조) |
| flex 방향 | column, gap 20px (콘텐츠 행 ↔ 버튼 그룹 행) |

#### 아이콘 영역

- 18px × 18px 아이콘, overflow-clip, border-radius 12px
- 배경: 아이콘 종류에 따라 선택 (있는 경우 variant 색상 20% 불투명, padding 8px, 50% radius)

#### 텍스트 영역

타이틀은 선택 사항. 바디만 단독 사용 가능.

| 요소 | 스펙 | 필수 여부 |
|------|------|----------|
| 타이틀 | 14px Bold, variant별 `status/*/text` 색상, line-height 20px | 선택 |
| 바디 | 14px Medium, `base/white` #FFFFFF, line-height 20px | 필수 |

타이틀 + 바디 함께 쓸 경우 세로 gap: 8px.

#### 버튼 그룹 (`showButtonGroup = true`)

| 속성 | 값 |
|------|----|
| 레이아웃 | flex row, `justify-end`, gap 10px, width 100% |
| 좌측 버튼 | Outline (xs) — `border/default` #3F3F46, 텍스트 `text/primary` |
| 우측 버튼 | PrimaryCta (xs) — `cta/strong` 그라디언트, border `cta/border` #818CF8 |
| 버튼 크기 | xs: 10px SemiBold, padding 12px/6px, border-radius 6px |

#### 닫기 버튼 (원형 카운트다운 링)

상단 progress bar 대신 X 버튼 컨테이너 외곽에 SVG 원형 링으로 3초 카운트다운을 시각화.

```
  ╭───╮   ← SVG circle stroke (variant 색상)
  │ ✕ │   ← X 아이콘 18px, text/muted
  ╰───╯
```

| 속성 | 값 |
|------|----|
| SVG 크기 | 36px × 36px |
| 원 반지름 | 16px |
| 원 둘레 | `2π × 16 ≈ 100.5` |
| 트랙 (배경) | `rgba(255,255,255,0.08)`, strokeWidth 2px |
| 링 (카운트다운) | variant 색상, strokeWidth 2px |
| 애니메이션 | `stroke-dashoffset: 0 → 100.5`, 3000ms linear |
| 시작 기준 | 12시 방향 (`rotate(-90deg)`, `transformOrigin: center`) |

클릭 시 즉시 `onClose` 호출 (카운트다운 무시).

---

#### Variant 5종

| Variant | 아이콘 | 타이틀 색상 | 보더 | 카운트다운 링 | 사용 상황 |
|---------|--------|------------|------|-------------|----------|
| **Success** | CheckCircle2 | `status/success/text` #34D399 | `status/success/strong` #059669 | `status/success/text` #34D399 | 트레이드 완료, 서명 완료, 제안 전송 성공 |
| **Warning** | AlertTriangle | `status/warning/text` #FBBF24 | `status/warning/strong` #D97706 | `status/warning/text` #FBBF24 | 정원 초과, 일일 한도, 로스터 초과 |
| **Danger** | AlertCircle | `status/danger/text` #F87171 | `status/danger/strong` #EF4444 | `status/danger/text` #F87171 | 시뮬 오류, 트레이드 실패, 검증 실패 |
| **Info** | Info | `status/info/text` #38BDF8 | `status/info/strong` #0284C7 | `status/info/text` #38BDF8 | 앱 업데이트, 일반 안내 |
| **Basic** | 상황별 아이콘 (모노크롬) | `text/primary` #FAFAFA | `border/default` #3F3F46 | `cta/strong` #4F46E5 | 상태 무관 일반 알림 |

**닫기 버튼**

| 속성 | 값 |
|------|----|
| 보더 | `rgba(255,255,255,0.20)` 2px solid |
| border-radius | 16px |
| padding | 6px |
| X 아이콘 | 18px |

---

#### 현재 사용처 및 권장 Variant

| 상황 | 권장 Variant |
|------|-------------|
| 트레이드 완료 | Success |
| FA 서명 / 오퍼 거절 완료 | Success |
| 트레이드 제안 전송 | Info |
| 시뮬레이션 오류 | Danger |
| 트레이드 처리 오류 / 검증 실패 | Danger |
| 트레이드 블록 정원 초과 | Warning |
| 일일 트레이드 한도 초과 | Warning |
| 로스터 초과 경고 | Warning |

---

#### 코드 구현 메모

현재 `Toast` props가 `{ message: string }` 하나뿐 → 에러 메시지도 인디고 체크 아이콘으로 표시되는 버그.

**필요한 변경:**
- `toastMessage: string | null` → `{ message: string; variant: 'success' | 'warning' | 'danger' | 'info' } | null`
- `setToastMessage(string)` 호출부 전체 → `setToast({ message, variant })` 일괄 수정
- `ActionToast` — dead code, 삭제 후 아래 스펙 기준으로 재구현
- `UpdateToast` — Persistent Toast 스펙 기준으로 리뉴얼

---

### 4-6-B. 특수 Toast

#### Toast 타입 선택 기준

| 조건 | 타입 |
|------|------|
| 액션을 놓쳐도 **다른 경로**로 동일 액션 수행 가능 | Action Toast (3초 자동 닫힘) |
| 액션을 놓치면 **기회를 잃거나** 유저가 반드시 인지해야 함 | Persistent Toast (자동 닫힘 없음) |

---

#### Type 1 — Action Toast

버튼 1개 포함. 액션 버튼은 편의 단축키 역할 — 닫혀도 다른 경로로 동일 액션 수행 가능해야 함.

**구조**

```
┌──────────────────────────────────────────────────────────┐
│ [●아이콘]  메시지 텍스트          │ [액션 버튼] [○링✕]   │
└──────────────────────────────────────────────────────────┘
                 ↑ 하단 중앙 고정 (일반 Toast와 동일)
```

**컨테이너**: 일반 Toast와 동일. 내부 구성만 다름.

**액션 버튼 영역**

| 속성 | 값 |
|------|----|
| 구분선 | 세로 `border/default` 1px, 좌측 8px gap |
| 버튼 스타일 | Secondary Small |
| 클릭 시 | `onAction` 호출 후 즉시 닫힘 |

**카운트다운 링**: 일반 Toast와 동일 (3초 자동 닫힘)

**사용 케이스**

| 상황 | 메시지 | 버튼 | Variant | 대체 경로 |
|------|--------|------|---------|---------|
| 로스터 초과 | "로스터가 N명 초과되었습니다." | FA뷰 이동 | Warning | 사이드바 FA 메뉴 |
| 트레이드 제안 수신 | "{팀명}에서 트레이드 제안이 왔습니다." | 확인 | Info | 인박스 |

---

#### Type 2 — Persistent Toast

자동 닫힘 없음. 유저가 반드시 선택해야 하는 경우.

**구조**

```
┌──────────────────────────────────────────────────────┐
│ [●아이콘]  타이틀                                     │
│            바디 텍스트          [보조 버튼] [주 버튼]  │
└──────────────────────────────────────────────────────┘
              ↑ 우측 하단 고정 (bottom 24px, right 24px)
              360px 고정 너비
```

**일반 Toast와 차이점**

| 속성 | 일반 Toast | Persistent Toast |
|------|-----------|-----------------|
| 위치 | 하단 중앙 | 우측 하단 |
| 너비 | 320px~90vw | 360px 고정 |
| 자동 닫힘 | 3초 | 없음 |
| 카운트다운 링 | 있음 | 없음 |

**버튼 구성**

| 버튼 | 스타일 | 역할 |
|------|--------|------|
| 보조 (좌) | Secondary Small | `onDismiss` |
| 주 (우) | Primary Small | `onAction` |

**사용 케이스**

| 상황 | 타이틀 | 바디 | 주 버튼 | 보조 버튼 | Variant |
|------|--------|------|---------|---------|---------|
| 앱 업데이트 | "새 버전이 있습니다" | "더 나은 경험을 위해 업데이트하세요." | 새로고침 | 나중에 | Info |

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
