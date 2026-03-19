# 디자인 시스템 리디자인 계획: Skeuomorphic + Chromic + Retro Windows XP

> **상태**: 계획 단계 (미구현)
> **작성일**: 2026-03-19

---

## 목표 방향

현재 모던 다크 스포츠 UI (slate-950 + indigo 액센트 + rounded-3xl)를 다음 스타일로 전면 교체:

- **스큐어모픽(Skeuomorphic)**: 볼록/오목한 실물 입체감, bevel 효과
- **크로믹(Chromic)**: 금속 광택, 유광 반사, 금속 그라데이션
- **레트로 Windows XP 감성**: Windows 95~XP 창, 탭, 버튼 스타일

**참고 레퍼런스**: Windows XP/2000, Winamp 어두운 금속 스킨, Football Manager 구버전, 산업용 SCADA UI

---

## 라이브러리 선택 결론

| 라이브러리 | 스타일 | 문제점 |
|-----------|--------|--------|
| `xp.css` | Windows XP | 라이트 테마 기반 — 어두운 금속 스타일과 불일치 |
| `98.css` | Windows 98 | 라이트 테마 기반 |
| `react95` | Windows 95 | styled-components 의존 → Tailwind 충돌 위험 |

**결론**: 외부 라이브러리 없이 **Tailwind 커스텀 토큰 + `@layer components` xp-* 클래스**로 순수 구현. 추가 npm 패키지 불필요.

---

## Phase 1: 글로벌 토큰 교체

### `tailwind.config.js` 색상 팔레트

| 토큰 | 현재 | 변경 후 | 용도 |
|------|------|---------|------|
| `surface.DEFAULT` | `#0f172a` | `#1a1a1a` | Winamp 어두운 금속 검정 |
| `surface.card` | `#1e293b` | `#232323` | 금속 패널 |
| `surface.chrome` | (없음) | `#383838` | 크롬 바/타이틀바 |
| `surface.raised` | (없음) | `#2e2e2e` | 볼록한 요소 배경 |
| `surface.inset` | (없음) | `#141414` | 오목한 요소 배경 |
| `accent.DEFAULT` | `#6366f1` (인디고) | `#1f6ddb` (XP 파랑) | 주 액센트 |
| `content.DEFAULT` | `#f8fafc` | `#e8e8e8` | 기본 텍스트 |
| `content.led` | (없음) | `#00ff88` | LED 녹색 |
| `line.bevel.light` | (없음) | `#6a6a6a` | bevel 하이라이트 |
| `line.bevel.dark` | (없음) | `#0a0a0a` | bevel 그림자 |

### 새 box-shadow 토큰

```js
// tailwind.config.js → extend.boxShadow
'bevel-raised': `
  inset 1px 1px 0px #6a6a6a,
  inset -1px -1px 0px #0a0a0a,
  inset 2px 2px 0px #4a4a4a,
  inset -2px -2px 0px #1a1a1a
`,
'bevel-pressed': `
  inset 1px 1px 0px #0a0a0a,
  inset -1px -1px 0px #5a5a5a,
  inset 2px 2px 4px rgba(0,0,0,0.7)
`,
'inset-field': `
  inset 2px 2px 4px rgba(0,0,0,0.8),
  inset -1px -1px 0px #3a3a3a
`,
'xp-window': `
  2px 2px 8px rgba(0,0,0,0.9),
  inset 1px 1px 0px rgba(255,255,255,0.08)
`,
'chrome-panel': `
  inset 0 1px 0 rgba(255,255,255,0.12),
  0 1px 4px rgba(0,0,0,0.8)
`,
'led-green': '0 0 6px rgba(0,255,136,0.8), 0 0 12px rgba(0,255,136,0.4)',
'led-amber': '0 0 6px rgba(255,170,0,0.8), 0 0 12px rgba(255,170,0,0.4)',
'led-blue':  '0 0 6px rgba(31,109,219,0.8), 0 0 12px rgba(31,109,219,0.4)',
```

### 새 backgroundImage 토큰

```js
'metal-panel':          'linear-gradient(180deg, #2e2e2e 0%, #1e1e1e 50%, #1a1a1a 100%)',
'metal-panel-h':        'linear-gradient(90deg, #323232 0%, #1e1e1e 50%, #282828 100%)',
'xp-titlebar':          'linear-gradient(180deg, #2a84f0 0%, #1f6ddb 30%, #1450aa 70%, #0e3d88 100%)',
'xp-titlebar-inactive': 'linear-gradient(180deg, #555 0%, #333 100%)',
'chrome-shine':         'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)',
'btn-metal':            'linear-gradient(180deg, #3a3a3a 0%, #252525 50%, #1e1e1e 100%)',
'btn-metal-hover':      'linear-gradient(180deg, #444 0%, #2e2e2e 50%, #252525 100%)',
'scanlines':            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
```

### borderRadius 변경

```js
'card':       '0px',   // XP 스타일: 직각
'button':     '2px',   // 버튼: 거의 직각
'element':    '2px',
'panel':      '0px',
'xp-window':  '6px',   // 창 모서리만 살짝
```

### 폰트

```js
'sport': ['Tahoma', 'Verdana', 'Arial', 'sans-serif'],  // XP 기본 폰트
'pixel': ['"Press Start 2P"', 'monospace'],              // 레트로 픽셀 (선택)
```

---

## Phase 1: `index.css` 변경

### body

```css
body {
  background-color: #1a1a1a;
  /* 미세 노이즈 SVG 패턴으로 금속 질감 */
  background-image: url("data:image/svg+xml,...");
  color: #e8e8e8;
  font-family: 'Tahoma', 'Verdana', Arial, sans-serif;
  font-size: 11px;
}
```

### `@layer components` — xp-* 클래스 정의

```css
/* 금속 패널 */
.xp-panel {
  background: linear-gradient(180deg, #2e2e2e 0%, #1e1e1e 50%, #1a1a1a 100%);
  box-shadow: inset 1px 1px 0px #6a6a6a, inset -1px -1px 0px #0a0a0a,
              inset 2px 2px 0px #4a4a4a, inset -2px -2px 0px #1a1a1a;
  border: 1px solid #111;
}

/* 볼록 금속 버튼 */
.xp-btn { /* bevel-raised + btn-metal 그라데이션 */ }
.xp-btn:hover { /* 약간 밝아짐 */ }
.xp-btn:active { /* bevel-pressed + translate(1px, 1px) */ }

/* XP 파랑 primary 버튼 */
.xp-btn-primary { /* xp-titlebar 그라데이션 계열 */ }

/* XP 창 */
.xp-window { /* xp-window shadow + rounded-[6px] */ }

/* XP 타이틀바 (파랑 그라데이션 + 크롬 반사 ::after) */
.xp-titlebar { }
.xp-titlebar::after { /* 상단 50% 흰 그라데이션 오버레이 */ }

/* 빨간 닫기 버튼 */
.xp-close-btn { /* 빨간 그라데이션 + bevel */ }

/* 오목 입력창 */
.xp-input { /* inset-field shadow */ }

/* Win95 탭 바 */
.xp-tab-bar { }
.xp-tab { }
.xp-tab-active { /* 탭이 올라오는 3D 효과 */ }
.xp-tab-inactive { }

/* SCADA 테이블 */
.xp-table-head { }
.xp-table-row-alt:nth-child(even) { }

/* 믹서 슬라이더 트랙 */
.xp-slider-track { /* inset-field shadow */ }

/* LED 배지 케이스 */
.xp-badge-led { /* 검정 배경 + inset */ }

/* 크롬 헤더 바 */
.xp-chrome-header { /* metal-panel + chrome-shine ::after */ }
```

### 스크롤바 (XP 스타일)

```css
::-webkit-scrollbar { width: 16px; height: 16px; }
::-webkit-scrollbar-track { background: #1a1a1a; /* inset shadow */ }
::-webkit-scrollbar-thumb { background: btn-metal 그라데이션; /* bevel */ border-radius: 0px; }
::-webkit-scrollbar-button { /* XP 화살표 버튼 */ }
```

---

## Phase 2: 공통 컴포넌트 14개 교체 순서

공통 컴포넌트 교체만으로 전체 142개 파일의 **70~80%가 자동 전파**됨.

| 순서 | 파일 | 핵심 변경 |
|------|------|----------|
| 1 | `Button.tsx` | `rounded-3xl` → `rounded-[2px]`, `active:scale-95` → translate, primary=xp-btn-primary |
| 2 | `Card.tsx` | `rounded-3xl` → `rounded-none`, default=xp-panel, 신규 inset variant |
| 3 | `Modal.tsx` | xp-window + xp-titlebar, 닫기/최소/최대 버튼 3개, headerColor 재활용 |
| 4 | `TabBar.tsx` | 언더라인 방식 → 탭 올라오는 3D (xp-tab-active) |
| 5 | `Table.tsx` | xp-table-head + xp-table-row-alt, rounded 제거 |
| 6 | `PageHeader.tsx` | xp-chrome-header, icon container rounded 제거 |
| 7 | `Dropdown.tsx` | xp-btn + xp-panel 패널 |
| 8 | `Badge.tsx` | `rounded-full` → `rounded-none`, LED 글로우 텍스트 |
| 9 | `OvrBadge.tsx` | 10단계 그라데이션 **유지**, `rounded-xl` → `rounded-none`, bevel shadow 추가 |
| 10 | `SliderControl.tsx` | xp-slider-track, 직사각형 thumb (믹서 느낌), 금속 thumb |
| 11~14 | TeamLogo, StarRating, DirectionBadge, PlayerAwardBadges | rounded 제거, 금속 배경 |

### `Modal.tsx` — headerColor prop 유지 전략

기존 `headerColor`를 타이틀바 그라데이션 베이스로 재활용:

```tsx
// headerColor가 있으면 팀 컬러 기반 그라데이션
// 없으면 기본 XP 파랑 그라데이션
const titlebarStyle = headerColor
  ? { background: `linear-gradient(180deg, ${headerColor}cc 0%, ${headerColor}77 60%, #1a1a1a 100%)` }
  : undefined; // xp-titlebar CSS 클래스 사용
```

---

## Phase 3: 뷰별 잔여 수정

공통 교체 후에도 남는 직접 클래스들:

**공통 치환 패턴**:
- `rounded-3xl`, `rounded-2xl`, `rounded-xl` → `rounded-none`
- `backdrop-blur-xl` → `backdrop-blur-[2px]` 또는 제거
- `animate-in zoom-in-95 duration-200` → 제거 (즉각 전환)
- `active:scale-95` → `active:translate-x-px active:translate-y-px`
- `bg-slate-900`, `bg-slate-800` 등 → `bg-surface-card` 또는 `bg-[#1e1e1e]`

**우선 수정 뷰**:
- `views/DashboardView.tsx` — 메인 화면, 직접 클래스 가장 많음
- `views/GameSimulationView.tsx` — PBP 스코어보드 LED 강화
- `views/RosterView.tsx`
- `views/TradeView.tsx`
- `views/FAView.tsx`

---

## 폰트 (index.html에 추가)

```html
<!-- 기존 Seven Segment (LED 숫자) 유지 -->
<link href="https://fonts.cdnfonts.com/css/seven-segment" rel="stylesheet">
<!-- 선택적: 픽셀 폰트 (스코어보드 강조) -->
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
```

Tahoma는 시스템 폰트 스택으로 처리 (별도 설치 불필요).

---

## 유지되는 것 (변경 없음)

- `OvrBadge` 10단계 그라데이션 색상 로직
- `headerColor` prop API (팀 컬러 동적 적용)
- `font-digital` (LED 디지털 폰트)
- `.led-red`, `.led-amber` 등 LED 클래스 (강화만)
- 팀 로고 렌더링 로직
- 게임 엔진, 상태 관리, 비즈니스 로직 전체

---

## 검증 체크리스트

- [ ] `npm run dev` — 주요 뷰 시각 확인
- [ ] Button hover/active bevel 반전 효과
- [ ] Modal XP 타이틀바 + teamColor 동작
- [ ] TabBar 활성 탭 3D 올라오는 효과
- [ ] OvrBadge 10단계 그라데이션 정상 표시
- [ ] `npm run build` — 번들 오류 없음
