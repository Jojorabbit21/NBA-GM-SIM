# NBA-GM-SIM 디자인 시스템

> **UI 수정 시 반드시 이 문서를 참고할 것.**
> 기존 분위기에서 벗어나는 스타일은 추가하지 않는다.

---

## 테마 개요

**모던 다크 스포츠 게이밍 UI** — NBA 경기장의 어두운 분위기 + 팀 컬러 브랜딩

- 기본 배경: `#0f172a` (slate-950) — `index.css`에 body background로 고정
- 폰트 스무딩: `-webkit-font-smoothing: antialiased`
- 전체적으로 `rounded-2xl` / `rounded-3xl` 사용 (날카로운 모서리 없음)

---

## 색상 팔레트

### 배경
| 용도 | 클래스 |
|------|--------|
| 전체 배경 | `bg-slate-950` |
| 카드/패널 | `bg-slate-900` |
| 유리 효과 | `bg-slate-900/80` |
| 플랫 | `bg-slate-950/50` |
| 모달 헤더/푸터 | `bg-slate-950/50` |

### 테두리
| 용도 | 클래스 |
|------|--------|
| 기본 테두리 | `border-slate-800` |
| 강조 테두리 | `border-slate-700` |
| 미세 구분선 | `border-white/5` ~ `border-white/10` |

### 텍스트
| 용도 | 클래스 |
|------|--------|
| 주요 텍스트 | `text-white` / `text-slate-100` |
| 일반 텍스트 | `text-slate-200` / `text-slate-300` |
| 보조 텍스트 | `text-slate-400` |
| 비활성/힌트 | `text-slate-500` |

### 액센트
| 역할 | 클래스 |
|------|--------|
| 주 액센트 (Brand) | `indigo-500` / `indigo-600` |
| 성공/긍정 | `emerald-500` / `emerald-600` |
| 위험/삭제 | `red-500` / `red-600` |
| 경고 | `amber-500` |
| 정보 | `blue-500` |

### 팀 색상
`data/teamData.ts`에 30개 팀 정의.
- `primary`: 팀 주색 (배경, 사이드바 헤더 등)
- `secondary`: 팀 보색 (강조)
- `text`: 주색 위의 텍스트색

---

## 타이포그래피

### 폰트 클래스
| 용도 | 클래스 |
|------|--------|
| 스포츠 타이틀 | `oswald font-black uppercase tracking-widest` |
| 한글 제목 | `font-black ko-tight` (`letter-spacing: -0.025em`) |
| 한글 본문 | `ko-normal` (`letter-spacing: -0.01em`) |
| 통계 숫자 | `font-mono tabular-nums` |
| LED 숫자 | `font-digital` (Seven Segment 폰트) |

### 사이즈 스케일
| 용도 | 클래스 |
|------|--------|
| 페이지 메인 타이틀 | `text-4xl lg:text-5xl font-black` |
| 섹션 헤더 | `text-xl font-bold` |
| 일반 텍스트 | `text-sm` |
| 보조 텍스트 | `text-xs` |
| 테이블 헤더 | `text-[10px] font-black uppercase tracking-widest` |
| 배지 텍스트 | `text-[9px]` ~ `text-[10px]` |
| 초대형 | `.text-huge` → `clamp(3rem, 8vw, 6rem)` |

---

## 공통 컴포넌트 (`components/common/`)

### Button (`Button.tsx`)

```tsx
<Button variant="primary" size="md">텍스트</Button>
```

**Base:** `inline-flex items-center justify-center font-black uppercase tracking-widest transition-all active:scale-95 rounded-2xl`

| variant | 스타일 |
|---------|--------|
| `primary` | `bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30 ring-1 ring-indigo-500/50` |
| `secondary` | `bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700` |
| `danger` | `bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30` |
| `ghost` | `bg-transparent hover:bg-slate-800/50 text-slate-400 hover:text-white` |
| `outline` | `border-2 border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white` |
| `brand` | `bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30` |

| size | 패딩/텍스트 |
|------|------------|
| `xs` | `px-3 py-1.5 text-[10px]` |
| `sm` | `px-4 py-2 text-xs` |
| `md` | `px-6 py-3 text-xs` (기본) |
| `lg` | `px-8 py-4 text-sm` |
| `xl` | `px-10 py-5 text-base` |

---

### Card (`Card.tsx`)

```tsx
<Card variant="default" padding="md">내용</Card>
```

**Base:** `rounded-3xl overflow-hidden transition-all`

| variant | 스타일 |
|---------|--------|
| `default` | `bg-slate-900 border border-slate-800 shadow-xl` |
| `glass` | `bg-slate-900/80 border border-slate-800/50 backdrop-blur-sm shadow-2xl` |
| `outline` | `bg-transparent border border-slate-800` |
| `flat` | `bg-slate-950/50 border border-slate-800/50` |

| padding | 값 |
|---------|-----|
| `none` | 없음 |
| `sm` | `p-4` |
| `md` | `p-6` (기본) |
| `lg` | `p-8` |

클릭 가능 시: `cursor-pointer hover:border-slate-600 active:scale-[0.99]`

---

### Badge (`Badge.tsx`)

```tsx
<Badge variant="success" size="md">텍스트</Badge>
```

**Base:** `inline-flex items-center justify-center font-black uppercase tracking-wider rounded-full border`

| variant | 스타일 |
|---------|--------|
| `neutral` | `bg-slate-800 text-slate-300 border-slate-700` |
| `brand` | `bg-indigo-500/10 text-indigo-400 border-indigo-500/30` |
| `success` | `bg-emerald-500/10 text-emerald-400 border-emerald-500/30` |
| `warning` | `bg-amber-500/10 text-amber-400 border-amber-500/30` |
| `danger` | `bg-red-500/10 text-red-400 border-red-500/30` |
| `info` | `bg-blue-500/10 text-blue-400 border-blue-500/30` |

| size | 패딩/텍스트 |
|------|------------|
| `sm` | `px-2 py-0.5 text-[9px]` |
| `md` | `px-3 py-1 text-[10px]` (기본) |

---

### OvrBadge (`OvrBadge.tsx`)

```tsx
<OvrBadge value={87} size="md" />
```

**Base:** `flex items-center justify-center font-black oswald shadow-lg text-shadow-ovr transition-all leading-none`

| 등급 | 색상 | 배경 그라디언트 |
|------|------|----------------|
| 95+ | 마젠타 (Fuchsia) | `from-fuchsia-300 via-fuchsia-500 to-fuchsia-700` + 글로우 |
| 90–94 | 빨강 (Red) | `from-red-500 via-red-600 to-rose-700` |
| 85–89 | 파랑 (Blue) | `from-blue-500 via-blue-600 to-indigo-700` |
| 80–84 | 에메랄드 | `from-emerald-500 via-emerald-600 to-teal-700` |
| 75–79 | 황금 (Amber) | `from-yellow-400 via-amber-500 to-orange-600` |
| 70–74 | 은색 (Slate) | `from-slate-300 via-slate-400 to-zinc-600` |
| 70 미만 | 동색 (Bronze) | `from-amber-700 via-amber-800 to-stone-900` |

| size | 크기/텍스트 |
|------|------------|
| `sm` | `w-6 h-6 text-[10px] rounded` |
| `md` | `w-8 h-8 text-sm rounded-md` (기본) |
| `lg` | `w-11 h-11 text-xl rounded-lg` |
| `xl` | `w-16 h-16 text-3xl rounded-xl` |

---

### Modal (`Modal.tsx`)

```tsx
<Modal isOpen={open} onClose={onClose} title="제목" size="lg" footer={<FooterContent />}>
  내용
</Modal>
```

**Container:** `bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl`
**Backdrop:** `bg-slate-950/80 backdrop-blur-md`
**Header:** `px-8 py-6 border-b border-slate-800 bg-slate-950/50`
**Body:** `flex-1 overflow-y-auto custom-scrollbar`
**Footer:** `px-8 py-5 border-t border-slate-800 bg-slate-900/90`

| size | 최대 너비 |
|------|----------|
| `sm` | `max-w-md` |
| `md` | `max-w-2xl` |
| `lg` | `max-w-4xl` (기본) |
| `xl` | `max-w-6xl` |
| `full` | `max-w-[95vw] h-[90vh]` |

`headerColor` prop으로 팀 색상 상단 라인 + 배경 글로우 추가 가능.

---

### Table (`Table.tsx`)

```tsx
<Table>
  <TableHead>
    <TableHeaderCell align="left">이름</TableHeaderCell>
    <TableHeaderCell sortable sortDirection="desc" onSort={...}>OVR</TableHeaderCell>
  </TableHead>
  <TableBody>
    <TableRow onClick={...}>
      <TableCell variant="player" value="LeBron James" subText="SF" />
      <TableCell variant="ovr" value={97} />
      <TableCell variant="stat" value="27.3" />
      <TableCell variant="attribute" value={95} colorScale />
    </TableRow>
  </TableBody>
</Table>
```

**Table 컨테이너:** `bg-slate-900 border border-slate-800 rounded-xl shadow-lg`
**TableHead:** `bg-slate-950 sticky top-0 z-40 border-b border-slate-800`
**TableHead 행:** `text-slate-500 text-[10px] font-black uppercase tracking-widest h-10`
**TableBody:** `bg-slate-900`
**TableRow:** `transition-colors hover:bg-white/5`
**TableCell:** `py-2 px-3 whitespace-nowrap border-b border-slate-800/50`

**CellVariant 종류:**
| variant | 정렬 | 스타일 |
|---------|------|--------|
| `text` | left | `font-medium text-slate-300` |
| `player` | left | `font-bold text-slate-200` + 클릭 시 `group-hover:text-indigo-400 underline` |
| `stat` | right | `font-mono font-bold text-slate-300 tabular-nums` |
| `attribute` | center | `font-mono font-black tabular-nums` + colorScale 적용 가능 |
| `ovr` | center | `<OvrBadge size="sm" />` |
| `badge` | left | `px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider` |

**attribute colorScale:**
- 90+: `text-fuchsia-400`
- 80+: `text-emerald-400`
- 70+: `text-amber-400`
- 이하: `text-slate-500`

---

## CSS 커스텀 유틸리티 (`index.css`)

| 클래스 | 설명 |
|--------|------|
| `.text-huge` | `clamp(3rem, 8vw, 6rem)` 반응형 초대형 텍스트 |
| `.text-shadow-ovr` | `text-shadow: 0px 1.5px 3px rgba(0,0,0,0.5)` |
| `.ko-tight` | `letter-spacing: -0.025em` (한글 제목) |
| `.ko-normal` | `letter-spacing: -0.01em` (한글 본문) |
| `.font-digital` | Seven Segment LED 폰트 |
| `.led-red` | 빨간 LED 글로우 효과 |
| `.led-amber` | 황색 LED 글로우 효과 |
| `.animate-marquee` | 수평 무한 스크롤 (60s linear) |
| `.animate-pulse-subtle` | 미묘한 밝기 펄스 (3s) |
| `.custom-scrollbar-hide` | 스크롤바 숨김 |

**스크롤바 스타일 (전역):**
- track: `#0f172a` / thumb: `#334155` / hover: `#4f46e5` / active: `#6366f1`

---

## 반복 레이아웃 패턴

### 페이지 구조
```
<MainLayout>
  <Sidebar />         ← 왼쪽 고정, w-72, 팀 색상 동적 적용
  <main>
    <DashboardHeader />  ← 상단 sticky
    <div className="flex-1 p-8 lg:p-12">
      <PageHeader />
      {/* Content */}
    </div>
    <Footer />
  </main>
</MainLayout>
```

### 카드 패널 (헤더 + 바디 + 푸터)
```tsx
<div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
  {/* 헤더 */}
  <div className="px-8 py-6 border-b border-slate-800 bg-slate-950/50">
    ...
  </div>
  {/* 바디 */}
  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
    ...
  </div>
  {/* 푸터 (선택) */}
  <div className="px-8 py-5 border-t border-slate-800 bg-slate-900/90">
    ...
  </div>
</div>
```

### 탭 네비게이션
```tsx
<div className="px-8 border-b border-white/10 bg-slate-950/80 flex items-center h-14">
  <button className={`border-b-2 font-black oswald uppercase text-sm px-4 h-full transition-all
    ${active
      ? 'text-indigo-400 border-indigo-400'
      : 'text-slate-500 border-transparent hover:text-slate-300'
    }`}>
    탭 이름
  </button>
</div>
```

### 페이지 헤더
```tsx
<div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-slate-800 pb-6">
  <div className="flex items-center gap-4">
    <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-indigo-500">
      <Icon size={24} />
    </div>
    <h2 className="text-4xl lg:text-5xl font-black ko-tight text-slate-100 uppercase">
      페이지 제목
    </h2>
  </div>
  <div>{/* 우측 액션 버튼 */}</div>
</div>
```

### 정보 박스
```tsx
<div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
  <div className="p-2 bg-slate-800 rounded-full">
    <Icon className="text-indigo-400 w-4 h-4" />
  </div>
  <p className="text-sm font-bold text-slate-300">메시지</p>
</div>
```

### 활성 상태 인디케이터
```tsx
<div className="w-2 h-2 rounded-full animate-pulse bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
```

### 그리드 레이아웃
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
```

---

## 글로우 효과 레퍼런스

```
// 강한 글로우 (OVR 95+)
shadow-[0_0_25px_rgba(232,121,249,0.9)]

// 일반 글로우
shadow-[0_0_15px_rgba(99,102,241,0.5)]

// 인디고 토스트 글로우
shadow-[0_0_10px_rgba(99,102,241,0.5)]

// 활성 상태 점
shadow-[0_0_8px_rgba(16,185,129,0.5)]
```

---

## 핵심 규칙 요약

1. **다크 배경 유지** — `slate-950` / `slate-900` 외 밝은 배경 사용 금지
2. **인디고 주 액센트** — 주요 CTA, 활성 상태, 포커스는 항상 `indigo`
3. **둥근 모서리** — 카드 `rounded-3xl`, 버튼 `rounded-2xl`, 작은 요소 `rounded-xl` / `rounded-lg`
4. **스포츠 타이포** — 헤더는 `oswald font-black uppercase tracking-widest`
5. **컴포넌트 우선 사용** — `Button`, `Card`, `Badge`, `OvrBadge`, `Modal`, `Table` 컴포넌트 활용
6. **마이크로 인터랙션** — 버튼 `active:scale-95`, 카드 `active:scale-[0.99]`, `transition-all`
7. **글로우는 절제** — 특별한 강조(OVR 배지, 토스트, 활성 인디케이터)에만 사용
