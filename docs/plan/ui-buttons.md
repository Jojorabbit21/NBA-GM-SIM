# 멀티 세션 버튼 시스템 (조사 + 제안, 2026-10-12)

UI 전수 감사 0-5(공용 `Button` 기본 스타일) 결정을 위한 전용 조사. 멀티 세션 사용자 화면 + 공유 컴포넌트 135개 파일에서 `<button>` **268개**를 멀티라인까지 포함해 추출(`ui-audit/buttons/button_inventory.py`), 클래스 패턴으로 1차 분류한 뒤 애매한 68건은 파일을 읽어 수동 확정했다. 원본: `ui-audit/buttons/buttons.csv`(파일·라인·역할·텍스트·아이콘·크기·라운드·굵기·클래스), `00-summary.md`(기계 집계).

## 1. 역할별 분포 (268개, 어드민 전용 DraftAdminPanel 12개는 괄호로 분리)

| 역할 | 건수 | 비율 | 대표 모양 | 지금 상태 |
|---|---|---|---|---|
| **icon-only** (닫기 X·chevron·새로고침·정렬 화살표·+/−) | **76** (+4) | 28% | 패딩 `p-1`~`p-1.5`, `rounded`/`rounded-lg`, 색 `text-slate-400/500 hover:text-white` | 76개 중 **58개가 `aria-label`/`title` 없음**. 크기 클래스 없음(아이콘 size에 의존) 48개 |
| **primary** (제안·저장·입장·서명·드래프트) | 38 | 14% | `bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold` | 라운드 4종 혼재: `rounded` 10 · `rounded-md` 10 · `rounded-lg` 8 · `rounded-xl` 5. 패딩 7종 |
| **secondary** (취소·초기화·전체 보기·필터) | 36 (+1) | 13% | `bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-bold rounded-lg` | 가장 일관됨(`rounded-lg` 24/36) |
| **link** (← 뒤로·더보기·오늘·팀명 이동·필터 초기화) | 30 (+2) | 11% | `text-sm font-bold text-slate-400 hover:text-white` 또는 `text-indigo-400 hover:underline` | 뉴스피드 10곳 동일 문자열 복붙 |
| **menu-item/row** (드롭다운 항목·사이드바 메뉴·팀 목록) | 18 | 7% | `w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold hover:bg-slate-800` | Button이 아니라 `Dropdown`/메뉴 컴포넌트의 몫 |
| **segment/toggle** (리그/컨퍼런스/디비전, 쿼터 필터, 백코트/프론트코트, 포지션 칩, 우리팀/상대) | 15 (+1) | 6% | `px-3 py-1.5 rounded text-sm font-bold` + 활성 `bg-slate-600`/`bg-indigo-600` 삼항 | 활성색 2종, 라운드 3종 |
| **danger** (방출 확정·거절·삭제) | 7 | 3% | `bg-red-600 hover:bg-red-500` | 라운드 4종 |
| **filter-trigger** (팀·포지션·스탯 필터 드롭다운 열기) | 7 | 3% | `h-[36px] px-3 bg-slate-950 rounded-lg border text-sm font-bold` + 활성 `border-indigo-500/50 text-indigo-400` | FA·풀·리더보드·뉴스·트레이드가 같은 36px 규격 복붙 |
| **cta-gradient** (드래프트 룸 입장·리그 입장·참가) | 6 | 2% | `bg-gradient-to-b from-orange-500 to-orange-600 rounded-lg font-black` | 헤더 2 + 로비 3 + 개인드래프트 1 |
| tile/cell (캘린더 날짜·스트립 경기 카드) | 4 | 1% | 도메인 UI | 대상 아님 |
| warning / success / danger-soft | 3 / 1 (+1) / 2 | 2% | amber·emerald·`bg-red-500/10` | |
| pagination (페이지 번호) | 3 | 1% | `w-7 h-7 text-sm font-bold rounded-lg` 삼항 | 3화면 동일 복붙 → `Pagination` |
| team-theme (선수 상세 협상/연장/방출, 팀 컬러 inline style) | 3 | 1% | `px-3 py-1 rounded text-xs font-bold` + `style={{backgroundColor: theme}}` | 예외 처리 필요 |
| accordion / nav / tab / 공용 내부 | 2 / 1 / 1 / 3 | 3% | | 대상 아님 |

### 전체 속성 분포 (크기 클래스가 있는 155개 기준)
- 글자: `text-sm` **110** · `text-xs` 39 · `text-base` 2 · `text-lg` 4 → **기본 14px**
- 라운드: `rounded-lg` **89** · `rounded`(4px) 40 · `rounded-md` 29 · `rounded-xl` 12 · `rounded-full` 4 · `rounded-2xl` 3 → **기본 8px**. 공용 Button의 `rounded-2xl`은 실사용 3곳뿐
- 굵기: `font-bold` **118** · `font-black` 26 · `font-semibold` 7 → **기본 bold**, black은 CTA·강조만
- 패딩(px/py) 상위: `3/1.5` 20 · `3/2.5`(메뉴) 13 · `4/2` 11 · `2.5/1` 10 · `2/0.5` 8 · `3/1` 7 · `4/1.5` 7 · `2/1.5` 7 → 높이로 환산하면 **24 / 28 / 32 / 36 / 40px** 다섯 단
- 동적 className(삼항·템플릿) 60개 — 대부분 활성/비활성 토글이라 `pressed`/`active` prop으로 흡수 가능

## 2. 공용 `Button` 현재와의 간극

| 항목 | 공용 Button | 실사용 다수 |
|---|---|---|
| 라운드 | `rounded-2xl`(16px) 고정 | `rounded-lg`(8px) |
| 굵기 | `font-black` 고정 | `font-bold` |
| size `md` | `px-6 py-3 text-xs`(큰 상자에 작은 글자) | `px-3 py-1.5 text-sm`(h-28~32) |
| size `xs` | `text-[10px]` | `text-xs` |
| variant | primary/secondary/danger/ghost/outline/brand | + **cta·link·success·warning·danger-soft** 필요, `outline`/`brand`는 실사용 0 |
| 아이콘 전용 | 없음 | **76개**(최다 역할) |
| 토글/세그먼트 | 없음 | 15개 + 필터 트리거 7개 |
| 사용처 | 1곳(HelpView) | — |

결론: 공용 Button은 "쓸 수 없어서" 안 쓴 것이다. 기본값을 실사용 다수에 맞추고, 아이콘 전용·세그먼트·필터·페이지네이션은 **별도 컴포넌트**로 두는 편이 맞다(Button 하나에 prop을 쌓으면 `w-7 h-7`, `h-[36px] border` 같은 규격이 variant 조합으로 터진다).

## 3. 제안: 5개 컴포넌트

### 3-1. `Button` (대상 ≈ 130개: primary 38 · secondary 37 · link 32 · danger 9 · cta 6 · success/warning 5)
```ts
variant: 'primary' | 'secondary' | 'ghost' | 'link' | 'danger' | 'dangerSoft' | 'success' | 'warning' | 'cta'
size:    'xs' | 'sm' | 'md' | 'lg' | 'xl'       // 높이 24 / 28 / 32 / 36 / 40
shape:   'md' | 'lg' | 'xl' | 'full'            // rounded-md / lg(기본) / xl / full
```
| size | 높이 | 패딩 | 글자 | 굵기 | 분포 근거 |
|---|---|---|---|---|---|
| xs | 24 | `px-2 py-0.5` | `text-xs` | semibold | `2/0.5` 8곳(LIVE 보기, 쿼터 필터) |
| sm | 28 | `px-2.5 py-1` | `text-xs` | bold | `2.5/1` 10곳(로비, 제안하기) |
| **md(기본)** | 32 | `px-3 py-1.5` | `text-sm` | bold | `3/1.5` 20곳 — 최다 |
| lg | 36 | `px-4 py-2` | `text-sm` | bold | `4/2` 11곳(수락/거절/저장) |
| xl | 40 | `px-5 py-2.5` | `text-base` | black | 협상 제출·CTA |

- base: `inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap`. **`active:scale-95` 제거**(실사용 소수, 표 안 버튼에서 레이아웃 흔들림), `uppercase`/`tracking`은 이미 제거됨.
- variant 색: primary `bg-indigo-600 hover:bg-indigo-500 text-white` · secondary `bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white` · ghost `hover:bg-white/5 text-slate-400 hover:text-white` · link `text-slate-400 hover:text-white`(+`underline` 옵션) · danger `bg-red-600 hover:bg-red-500` · dangerSoft `bg-red-500/10 hover:bg-red-500/20 text-red-400` · success `bg-emerald-600` · warning `bg-amber-500 text-slate-950` · cta `bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 font-black text-white`.
- `isLoading`(기존 유지), `icon`(좌측), `iconRight`. `fullWidth` 유지.
- 제거: `outline`, `brand`(사용 0, brand는 success로 흡수).

### 3-2. `IconButton` (대상 76개 — 최다, 접근성 문제 58개)
```ts
<IconButton label="닫기" size="sm|md|lg" tone="ghost|subtle|solid" shape="md|lg|full"><X size={16} /></IconButton>
```
- 정사각: sm 24 / md 28 / lg 32. `label`은 **필수**(→ `aria-label` + `title`). 현재 58개가 스크린리더·툴팁 없이 X·chevron만 있음.
- tone: ghost `text-slate-500 hover:text-white`(닫기 X 17곳) · subtle `hover:bg-slate-700`(스트립·캘린더 chevron 8곳) · solid `bg-slate-800`(툴바).

### 3-3. `SegmentedControl` (대상 15개 + 탭형 1)
```ts
<SegmentedControl value onChange options={[{value,label,disabled?}]} size="sm|md" tone="slate|indigo" />
```
- 현재 활성색이 `bg-slate-600`(순위·올스타·피드)과 `bg-indigo-600`(PBP 쿼터·뉴스 범위)으로 갈림 → `tone` 하나로. 컨테이너 `bg-slate-800 rounded-md p-1` 규격 통일. 멀티 선택 칩(트레이드 블록 포지션/아키타입)은 `ChipGroup multiple`.

### 3-4. `FilterTrigger` (대상 7개) + `Pagination` (대상 3개)
- FilterTrigger: `h-9 px-3 bg-slate-950 rounded-lg border text-sm font-bold` + `active`(선택 수 > 0) 시 `border-indigo-500/50 text-indigo-400`, 우측 ChevronDown. FA·풀·리더보드·뉴스·트레이드 5화면 공용. (`CheckboxFilterDropdown` 공용화와 한 묶음 — ui-consolidation 6장 3번)
- Pagination: 리더보드·풀·FA의 `w-7 h-7 rounded-lg` 번호 버튼 + ‹ › 묶음, `getPageNumbers` 로직 포함.

### 3-5. 대상에서 제외 (버튼 역할이 아니거나 도메인 UI)
menu-item/row 18(→ `Dropdown` items·사이드바), tile/cell 4(캘린더·스트립), accordion 2(→ `Disclosure`), nav 1, team-theme 3(팀 컬러 inline — Button `style` 허용으로 흡수 가능하나 후순위), 공용 내부 3.

## 4. 커버리지와 순서

| 단계 | 컴포넌트 | 치환 대상 | 비고 |
|---|---|---|---|
| 1 | `Button` API 교체 | HelpView 1곳만 즉시 영향 | 기본값 변경이라 위험 0. 이후 신규 버튼은 전부 이걸로 |
| 2 | `IconButton` 신설 + 닫기 X 17곳 | 모달·패널·필터 X | `label` 필수라 접근성 58건이 같이 해결 |
| 3 | `SegmentedControl` | 순위·올스타·PBP·피드·샷차트 | 활성색 통일(결정 필요: slate-600 vs indigo-600) |
| 4 | `FilterTrigger`+`Pagination` | FA·풀·리더보드·뉴스·트레이드 | ui-consolidation 6장 3번(필터 공용화)과 동시에 |
| 5 | 화면군 치환 시 Button 적용 | primary/secondary/link/danger 약 115곳 | 화면 작업에 끼워 넣음, 일괄 치환 안 함 |

전부 끝나면 `<button className=…>` 직접 작성은 tile/cell·nav 등 약 25곳만 남는다(268 → ~25, 91% 감소).

## 5. 0-5 결정 (2026-10-12 확정)

1. 기본 `shape='lg'`(8px) ✅
2. 기본 `size='md'` = h-32 `px-3 text-sm font-semibold` ✅
3. 굵기는 **전 variant·size `font-semibold`**(cta·xl 포함, 아티팩트 확인 후 bold/black에서 변경) ✅
4. `active:scale-95` 제거 ✅
5. 세그먼트 활성색 = **`indigo-600`** ✅ — 정렬 활성·탭 밑줄·드롭다운 활성·필터 트리거·페이지네이션이 전부 인디고라 "선택됨"의 색을 하나로. `slate-600` 컨테이너 대비도 낮았음. 선택이 아닌 "전환"(우리 팀/상대)만 `tone="slate"`.
6. 아이콘 전용 `label` 필수(TS 강제) ✅
7. 링크형 밑줄 = **기본 없음, 본문 속 이동 링크만 `underline`(hover:underline + indigo)** ✅ — 동작(뒤로·더보기)과 이동(팀명·선수명)을 prop 하나로 구분.

### 적용 현황
- `components/common/Button.tsx` 재작성(variant 9 · size 5 · shape 4 · `iconRight` · `underline`; `outline`/`brand` 제거, `active:scale` 제거). 기존 사용처 HelpView 1곳(`secondary lg`) 그대로 동작.
- `components/common/IconButton.tsx` 신설(xs 20 / sm 24 / md 28 / lg 32, tone ghost/subtle/solid/inherit, `label` 필수).
- `components/common/SegmentedControl.tsx` 신설(`tone` 기본 indigo, size sm/md, `aria-pressed`).
- 1차: 닫기·지우기 X 14곳 → `IconButton`.
- **2차(같은 날, 전면 치환 완료)**: 인라인 `<button>` 268 → 77. `<Button>` 105 · `<IconButton>` 58 · `<SegmentedControl>` 9. 남은 77은 (a) 다음 컴포넌트 몫 — `FilterTrigger` 7 · `Pagination` 3, (b) 대상 아님 — 드롭다운 항목·목록 행 17, 캘린더·스트립 타일, 스위치형 토글, 아코디언 헤더, NavMenu 탭, 팀 컬러 inline 버튼, 호버 오버레이. 상세는 dev-log 2026-10-12 "버튼 시스템 2단계".
- **3차(같은 날, 3-4 완료)**: `components/common/filters/{FilterTrigger,CheckboxFilterDropdown,StatFilterBar(+FilterChips)}.tsx` + `components/common/Pagination.tsx`(+`getPageNumbers`) + `utils/statFilter.ts`(Operator/compareOperator) 신설. 필터 트리거 7곳(FA·풀 포지션/아키타입, 리더보드 팀/포지션, 뉴스 팀) → `CheckboxFilterDropdown`(onChange 한 개로 토글·모두선택 흡수), 스탯 필터 바 3곳 → `StatFilterBar`, 칩 3곳 → `FilterChips`, 푸터 3곳 → `Pagination`. FA·풀의 79줄 복제본과 `getPageNumbers` 3벌 삭제(순감 약 −1,000줄). 상세는 dev-log 2026-10-12 "버튼 시스템 3단계".
