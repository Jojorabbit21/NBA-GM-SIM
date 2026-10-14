# 02 경기 화면 — UI 조각 전수 감사

읽은 범위:
- views/multi/season/MultiGamePbpView.tsx: 1~2762줄 (전부, 1-470 / 470-919 / 920-1368 / 1369-1848 / 1849-2298 / 2299-2762 로 끊어 읽음)
- views/multi/season/GameDateStrip.tsx: 1~425줄 (전부)
- views/multi/season/MonthCalendarPopover.tsx: 1~87줄 (전부)
- views/multi/season/MultiSeasonLayout.tsx: 1~104줄 (전부)
- 공용 API(감사 대상 아님): components/common/Table.tsx(229), TabBar.tsx(55), Button.tsx(69), Badge.tsx(41), Card.tsx(45), Modal.tsx(136), Dropdown.tsx(147), Skeleton.tsx(9), TeamLogo.tsx(46), OvrBadge.tsx(146), InjuryStatusBadge.tsx(94) 전부
- 기계 추출 체크리스트 4개(by_file/*.md) 전부 대조. `.legacy.tsx` 제외. 코드 수정 없음.
- 범위 밖(참고): `components/game/tabs/*`(GameBoxScoreTab 등), `BoxScoreTable`, `MultiFullCourtChart`, `MultiHeader`, `MultiSidebar`, `TournamentChampionModal`은 읽지 않음 — "종료 화면 6섹션"의 내부 표는 이 문서의 대상이 아님.

표기 규칙: `[추가]` = 체크리스트에 없던 발견. `체크:` = 해당 행이 흡수한 체크리스트 라인(소스 라인 번호). "추정"은 코드로 확정하지 못한 판단.

---

## views/multi/season/MultiGamePbpView.tsx (2762줄)

### 공용 컴포넌트 사용 현황
| 공용 | 사용 여부 | 위치 | 비고 |
|---|---|---|---|
| TabBar | 사용 | L28 import, L2309 | `tabs`/`activeTab`/`onTabChange`만 사용. `theme`/`badge`/`rightSlot`/`bgClassName` 미사용. 종료 화면 한정 |
| Skeleton | 사용 | L30 import, L87(`h-11 w-16`), L115(`h-6 w-32`), L674(`h-3 w-20`) | L87 스켈레톤은 `h-11 w-16`인데 실제 로고는 `h-24 w-24`(L92) — 크기 불일치(레이아웃 점프 가능, 추정) |
| Table/TableHead/TableRow/TableHeaderCell/TableCell/TableFoot | 미사용 | — | PlayerBoxPanel·QuarterScores가 `<table>`을 직접 구현 (아래 "박스스코어 표 대조" 참조) |
| Button | 미사용 | — | 쿼터 필터 pill(L2422)이 raw `<button>` |
| Badge | 미사용 | — | BONUS(L61) raw span |
| Card | 미사용 | — | 툴팁 카드(L945, L1309)는 raw div (Card는 `rounded-3xl overflow-hidden`이라 부적합) |
| Modal | 미사용 | — | 이 파일에 모달 없음 |
| Dropdown | 미사용 | — | 이 파일엔 드롭다운 없음 (캘린더 드롭다운은 GameDateStrip 쪽) |
| TeamLogo | 미사용 | — | 로고 `<img>` 3종을 직접 구현 (L89-102, L155-168) |
| OvrBadge / InjuryStatusBadge | 미사용 | — | PlayerBoxPanel(L670-681)은 이름+🔥/❄️만 표시, OVR/부상 배지 없음. (final 6섹션은 GameBoxScoreTab 내부라 범위 밖) |
| Loader2 (lucide 직접) | 사용 | L4, L2026 | 공용 Spinner 컴포넌트가 없어 raw |

### 박스스코어 표 — 공용 Table.tsx 클래스와 1:1 대조
기준: Table.tsx(L72-148 구조/클래스). 대상: `PlayerBoxPanel`(L591-718), `QuarterScores` full(L543-581), `QuarterScores` compact(L502-529).

| 항목 | Table.tsx | PlayerBoxPanel (L631-715) | QuarterScores full (L544-580) | QuarterScores compact (L515-527) | 판정 |
|---|---|---|---|---|---|
| 외곽 래퍼 | `div w-full overflow-auto custom-scrollbar relative bg-slate-900 border border-slate-800 rounded-xl shadow-lg` | 래퍼 `div flex flex-col min-h-0 shrink-0 overflow-x-auto`(L618) — 배경/보더/라운드 없음 | 래퍼 없음 | 래퍼 없음 | 다름 |
| table 클래스 | `w-full text-left border-separate border-spacing-0` | `w-full min-w-[600px] text-xs font-mono border-collapse table-fixed whitespace-nowrap` | `text-sm font-mono border-collapse` + (`w-full`/`mx-auto`) | `text-sm border-collapse` | 다름 (collapse vs separate, table-fixed, font-mono 상속) |
| thead | `bg-slate-950 sticky top-0 z-40 border-b border-slate-800 shadow-sm` | `bg-slate-950 sticky top-0 z-10 border-b border-slate-800 shadow-sm` (L647) | `bg-slate-950 border-b border-slate-800` (L545, sticky/shadow 없음) | thead 배경 없음 | PlayerBoxPanel: z-index만 다름(z-10 vs z-40). full: 부분 같음. compact: 다름 |
| 헤더 tr | `text-slate-500 text-xs font-black uppercase tracking-widest h-10` | `text-slate-500 font-black uppercase tracking-widest` (text-xs는 table에서 상속, `h-10` 없음) | 동일(text-xs 없음: table이 text-sm) | `text-slate-400 border-b border-slate-700` | 같음(색/굵기/자간) · 높이 다름 |
| th | `py-3 px-1.5 whitespace-nowrap border-b border-slate-800`, align center 기본 + 내부 `flex gap-1`+`span.truncate` | `py-2 px-2`/`py-2 px-1`/`py-2 px-1.5` 혼재(L649-661), 셀 border-b 없음 | `py-1.5 px-3 w-9` | `py-0.5 w-8` | 다름 (패딩 전부 다름, 정렬은 개별 text-left/center/right) |
| tbody | `bg-slate-900` | `bg-slate-900` (L664) | `bg-slate-900` (L554) | 배경 없음 | 같음 (compact만 다름) |
| tr hover | `hover:bg-white/5` (+onClick시 `cursor-pointer group`) | `transition-colors hover:bg-white/5` (+`bg-emerald-400/15` 온코트, L668) | hover 없음 | hover 없음 | 같음(+transition-colors, +온코트 강조는 고유) |
| td 기본 | `py-2 px-3 whitespace-nowrap border-b border-slate-800/50` | `py-1.5 px-1.5`/`px-1`/`px-2` + `border-b border-slate-800/50` (L612, 670, 683, 684) | `py-1.5 px-3 ... border-b border-slate-800/50` | `py-0.5` 보더 없음 | 보더색 같음 · 패딩 다름 |
| 스탯 셀 | variant stat: `text-right font-mono font-bold text-slate-300 tabular-nums` | `statCell` = `text-right ... text-white font-semibold tabular-nums` (L612; font-mono는 table 상속) | 숫자 `tabular-nums text-slate-300`/합계 `font-bold text-white` | `tabular-nums text-slate-300`/합계 `font-bold text-white` | 다름 (색 white vs slate-300, 굵기 semibold vs bold) |
| tfoot | `bg-slate-950 border-t border-slate-700` | `<tfoot>` 클래스 없음, tr에 `bg-slate-800/50 border-t border-slate-700 text-white font-semibold` (L699) | 없음 | 없음 | 다름 (배경 slate-800/50 vs slate-950, 클래스 위치가 tr) |
| 고정 폭 | 없음 (`width` prop → th min-width) | `<colgroup>` 퍼센트 13개 (L632-646) | th `w-9`/`w-12` | th `w-8`/`w-9` | Table.tsx에 colgroup/table-fixed 지원 없음 |

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 45-53 | pill/기타 | TimeoutDots: `w-16 shrink-0 flex gap-0.5 text-xl`, `●` 문자 amber-400/slate-700 | 없음(도메인 고유 표시) | — | [추가] 대체 불필요, 점보트론 전용 |
| 57-67 (60-63) | badge | FoulBonusBadge: BONUS `px-1 py-0 rounded text-base font-black bg-amber-500 text-slate-900 leading-relaxed`; 파울 숫자 `text-xl` + `tabular-nums` | Badge (부분) | Badge `variant="solid-warning"` + `shape="square"`(rounded) 신규. 현 Badge는 `rounded-full border` + `bg-amber-500/10` 틴트라 시각 불일치 | 체크: 63 (tabular, 오탐 아님·단순 숫자). BONUS 자체는 [추가] |
| 72-130 (106, 116, 118) | section-header/기타 | TeamHeaderColumn: grid 3구획 `py-6 px-8`, 점수 `text-6xl font-black tabular-nums`, 팀명 `text-2xl font-black uppercase tracking-wide`, 전적 `text-base font-bold tabular-nums` | 없음 | — | 체크: 106, 116, 118. 헤더 점보트론 고유 레이아웃. 116은 한글 팀명에 `uppercase tracking-wide`(영문 한정 효과, 추정) |
| 86-103 (95, 96, 99) | logo-fallback | abbrEl: `getRealTeamLogoUrl` → onError `dataset.fallback='old'` → `getTeamLogoUrl` → `placehold.co` 체인, `h-24 w-24 object-contain shrink-0` | TeamLogo | TeamLogo에 "real 로고 우선 + 2단 폴백" prop(`preferReal`) 필요. 현 TeamLogo는 `getTeamLogoUrl` 단일 + placehold 폴백, 추가로 `drop-shadow-md transition-all` 고정 | 체크: 95, 96, 99. 복붙 원본 → L161-165, GameDateStrip L32-36 (3중 복제) |
| 153-170 (161, 162, 165) | logo-fallback | FinalHeaderLogo: 위와 동일 체인·동일 `h-24 w-24 object-contain shrink-0` | TeamLogo | 위와 동일 | 체크: 161, 162, 165. L89-102와 완전 동일 코드(복붙) |
| 174-191 (186) | section-header/기타 | MilestoneJumbotronBody: 팀약어 `font-mono font-black`, 라벨 `text-3xl font-black uppercase tracking-widest` + `textShadow` | 없음 | — | 체크: 186. 한글 라벨(예 "20득점")에 uppercase tracking-widest — Table.tsx 헤더와 같은 습관(추정: 효과 없음) |
| 209-212, 255-257 | 기타 | 스탯별 accent 색 맵(emerald/sky/fuchsia/amber/indigo/red/orange) | 없음 | — | [추가] 도메인 색 매핑, 통합 대상 아님 |
| 454-466 (460, 462, 464) | 오탐 | QuarterScores prop 주석에 `<table>`, "없음" 단어 | — | — | 체크: 460, 462, 464 = 오탐(주석) |
| 502-529 (505, 507, 511, 515, 517-520) | table/th/td | compact 쿼터표: `<table text-sm border-collapse>`, th `text-center w-8 py-0.5 font-semibold`, td `tabular-nums text-slate-300`/합계 `font-bold text-white`, thead 밑줄 `border-b border-slate-700` | Table 계열 | 가장 작은 밀도용 `Table` `density="compact"` + `bare`(보더/배경 없음) 필요. 종료 헤더의 미니멀 표라 Table 카드 스타일과 의도적으로 다름 | 체크: 505, 507, 511, 515, 517, 518, 519, 520. 이 표는 채택 비권장(미니멀 의도) |
| 543-581 (544-577 계열) | table/th/td | full 쿼터표: `text-sm font-mono border-collapse`, thead `bg-slate-950 border-b border-slate-800`, th `py-1.5 px-3 w-9`, td `py-1.5 px-3 ... border-b border-slate-800/50`, away/home 행이 12줄씩 복붙(L555-566 / L567-578) | Table, TableHead, TableHeaderCell, TableCell | `Table`에 `bare`(래퍼 카드 스타일 제거) + `fullHeight=false` 지원. TableHeaderCell 패딩 `py-1.5 px-3` 오버라이드는 className으로 가능 | 체크: 544, 545, 546, 547, 549, 551, 556, 560, 565, 568, 572, 577 (12). 라인 542 주석 = 오탐 |
| 591-718 (612, 631, 647-661, 668, 670, 683-712) | table/th/td/hover | PlayerBoxPanel: 위 대조표 참조. 13열 th 직접 작성(L649-661), 스탯 td 10개 `statCell`(L685-694), tfoot 10칸(L703-712), 선수명 셀 `flex items-center gap-1 min-w-0` + 🔥/❄️ | Table, TableHead, TableHeaderCell(align/width), TableRow, TableCell variant="stat", TableFoot | ① `Table`에 `bare` + `tableLayout="fixed"` + `colgroup` 슬롯(children에 `<colgroup>` 그대로 넣을 수 있으나 현 Table은 `border-separate`+wrapper 고정) ② TableCell stat 색 오버라이드(`text-white font-semibold` vs `text-slate-300 font-bold`) ③ TableFoot tr 배경 `bg-slate-800/50` ④ 행 강조(`bg-emerald-400/15`)는 TableRow className으로 가능 | 체크: 612, 631, 647(3역할), 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 668, 670, 683, 684, 685-694(10), 699, 700-712(13). 620 주석 = 오탐. `table-fixed whitespace-nowrap min-w-[600px]` 근거 주석 L619-630 |
| 722-731 (724) | section-header/empty | BoxScorePlaceholder: 헤더 div `flex items-center px-2 h-9 text-xs font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950 text-slate-500 shadow-sm` (thead 흉내) + 본문 `py-10 text-center text-slate-600 text-xs ko-normal` | TableHead `noRow`(부분) / EmptyState | 신규 `EmptyState`(`py-10 text-center text-slate-600 text-xs`) | 체크: 724. 본문 L727-729는 [추가](empty) |
| 788-813 (788) | divider/기타 | TeamStatsCompare: 래퍼 `shrink-0 px-3 py-2 border-t border-slate-800`, 제목 `text-[10px] uppercase tracking-wider`, 17행 막대 grid `grid-cols-[1fr_30px_36px_30px_1fr]` | 없음(도메인 막대) | — | 체크: 788. 막대 비교 UI는 고유. 제목/라벨 크기 `text-[10px]`·`text-xs` 혼재 [추가] |
| 904-978 (945, 950, 955, 959) | 기타(tooltip) | TeamPossessionRow 툴팁: `absolute -translate-x-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 pointer-events-none shadow-lg z-20 max-w-[240px]`, 시각 `text-[10px] font-bold`, 구분선 `border-t border-slate-700` | InjuryStatusBadge의 툴팁과 유사(비공용) | 신규 `TooltipSurface`(bg-slate-900 border-slate-700 rounded-lg shadow-lg pointer-events-none) | 체크: 945(card_box+z-20), 950, 955, 959. L1309 툴팁과 같은 표면 클래스 복붙. InjuryStatusBadge 툴팁은 `border-slate-600 px-2 py-1`로 또 다른 변형 |
| 928 | 기타 | `text-[13px] font-black text-slate-300 uppercase tracking-wider` 팀 라벨 | 없음 | — | [추가] 임의 폰트 크기 13px(타 위치는 10/11/12px) |
| 1254-1339 (1261, 1330) | 기타(legend) | 범례 `flex items-center justify-center gap-6 text-[10px] font-bold uppercase tracking-wider text-slate-500`, 쿼터 라벨 `text-[10px] font-bold text-slate-600 uppercase tracking-wider relative h-4` | 없음 | — | 체크: 1261(header_text+badge_inline), 1330. 범례 칩 L1262-1268 [추가] |
| 1302-1304 | 기타 | 차트 축 라벨 `absolute left-1 text-[10px] font-mono text-slate-600` | 없음 | — | [추가] |
| 1307-1323 (1309, 1312, 1313, 1316, 1319) | 기타(tooltip) | 차트 호버 툴팁: `absolute top-2 -translate-x-1/2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 pointer-events-none shadow-lg whitespace-nowrap z-10` | TooltipSurface(신규) | 위와 동일. 패딩 `px-3 py-2` vs L945 `px-2.5 py-1.5` | 체크: 1309, 1312, 1313, 1316, 1319. 복붙 원본: L945 |
| 1362-1366 등 (1364, 1386, 1422, 1491, 2035, 2052, 2154, 2156, 2159, 2666, 2670, 1088, 1273, 532, 542, 586, 588, 620) | 오탐 | 주석 내 "없음", `<table`, `-z-10`, tabular-nums 등 | — | — | 체크: 오탐 (아래 "오탐 목록") |
| 2022-2030 (2026) | spinner | `Loader2 size={28} className="animate-spin text-indigo-400"` in `flex-1 flex items-center justify-center bg-slate-950` | 신규 `Spinner`/`LoadingState` | `Spinner size` prop | 체크: 2026. MultiSeasonLayout L66은 size 32로 동일 패턴 (크기 다름) |
| 2038-2046 | empty | 에러 폴백 `text-slate-400 text-sm ko-normal` 가운데 정렬 | 신규 EmptyState | `tone="error"` 변형 | [추가] 에러는 notify.error 토스트 지침(feedback_errors_via_notify)이 있으나 여기선 전체화면 텍스트(상태 안내 성격이면 허용, 추정) |
| 2058-2229 (2059, 2081) | card/기타 | 라이브 헤더: `relative bg-slate-900 border-b border-slate-800 shrink-0 overflow-hidden`, 팀색 절대배치 레이어, 도트 텍스처 radial-gradient | 없음 | — | 체크: 2059(border-b), 2081(z-10 실제 레이어). 점보트론 고유 연출 |
| 2098-2111 (2107) | 기타 | 예정 카운트다운: `text-sm font-black text-white ko-tight`, `text-3xl font-black tabular-nums text-slate-300` | 없음 | — | 체크: 2107. [추가] 2102 텍스트 |
| 2112-2121 (2116) | 기타 | flow 점보트론 `text-lg font-black uppercase tracking-widest text-white text-center` + textShadow | 없음 | — | 체크: 2116 |
| 2151-2219 (2159 오탐, 2193, 2198) | 기타 | idle 3단 grid `grid-cols-[1fr_auto_1fr]`, 쿼터/시계 `text-3xl font-black tabular-nums`, 런 불꽃 `absolute -z-10 animate-pulse` radial-gradient | 없음 | — | 체크: 2193, 2198(tabular). 2159 = 음수 z-index로 오탐 판정, 연출용 |
| 2235-2305 (2242, 2256, 2267, 2296) | card/기타 | 종료 헤더: `shrink-0 bg-slate-900 border-b border-slate-800 px-8 py-5`, 점수 `text-5xl font-black`, 전적 `text-sm text-slate-400 tabular-nums`, 날짜/스테이지 `text-sm text-slate-400 tabular-nums` | 없음 | — | 체크: 2242, 2256, 2267, 2296. away/home 블록 15줄씩 미러(L2247-2261 / L2285-2299) |
| 2249-2254, 2289-2294 | hover | 팀명 링크 `text-xl font-bold text-white truncate cursor-pointer hover:text-indigo-400 hover:underline` | TableCell variant="player" 의 이름 스타일과 시각 동일(group-hover) | 공용 `TextLink`/`InlineLink` (hover indigo-400 underline) 신규 | [추가] Table.tsx L188과 같은 hover 규칙의 변형 |
| 2260, 2286 | 기타 | 승리 마커 CSS 삼각형 `w-0 h-0 border-y-[6px] ... border-white` | 없음 | — | [추가] |
| 2309-2320 | tab | `TabBar` 공용 6탭(박스스코어/인사이트/경기 기록/샷차트/로테이션/온오프), 스크롤 네비게이션 | TabBar(이미 사용) | 필요 시 `rightSlot` 등 — 현 상태 양호 | [추가] 사용 현황. TabBar는 `uppercase` + 한글 라벨(효과 없음, 추정) |
| 2332, 2642 | 기타 | 바디 스크롤 컨테이너 `overflow-y-auto custom-scrollbar-hide` | — | — | [추가] 스크롤바 클래스가 Table/Modal(`custom-scrollbar`)과 다른 `custom-scrollbar-hide` + L2367, L2442는 인라인 style로 `scrollbarWidth:'none'` — 스크롤바 숨김 방식 3종 혼재 |
| 2338, 2594 (2338) | divider | 좌/우 컬럼 `w-[30%] border-r|border-l border-slate-800 bg-slate-950 flex flex-col` | — | — | 체크: 2338. 레이아웃 고유 |
| 2367 | divider | `h-[300px] shrink-0 overflow-y-auto border-t border-slate-800` + 인라인 scrollbarWidth:none | — | — | 체크: 2367 |
| 2394 | divider | 샷차트 하단 `border-b border-slate-700` | — | — | 체크: 2394 |
| 2413 | divider | PBP 피드 래퍼 `border-t border-slate-800` | — | — | 체크: 2413. L2394 border-b slate-700과 맞닿아 보더 이중(slate-700 + slate-800, 추정) |
| 2415-2438 (2415) | section-header | PBP 헤더 `shrink-0 px-3 h-9 flex items-center bg-slate-800 border-b border-slate-700`, 제목 `text-xs text-slate-300 font-semibold uppercase tracking-wider` | 신규 `SectionBar` | `SectionBar` (bg-slate-800 + 하단 보더) 공통화. L2644 섹션 바(`bg-slate-800 border-t border-slate-600 px-6 py-3`)와 별도 변형 | 체크: 2415. 같은 파일에 "slate-800 바"가 2변형 [추가: 불일치] |
| 2420-2436 (2422, 2430) | segment | 쿼터 필터 pill: `px-2 py-0.5 rounded text-xs font-bold transition-colors`, active `bg-indigo-600 text-white`, inactive `bg-slate-800 text-slate-400 hover:bg-slate-700`, `disabled:opacity-30` | 신규 `SegmentedControl`/`FilterPill` (Button·TabBar 둘 다 부적합: Button은 `uppercase tracking-widest rounded-2xl`, TabBar는 `h-14` 페이지 레벨 밑줄) | `options/value/onChange/disabled(opt)` | 체크: 2422(button_raw), 2430(row_hover). 헤더가 slate-800인데 inactive pill도 `bg-slate-800`이라 배경과 동색(추정: 경계가 hover로만 구분) |
| 2448-2459 (2448) | table(th)/section-header | div 기반 헤더행 `flex items-center gap-2 px-3 h-8 bg-slate-950 sticky top-0 z-10 border-b border-slate-800 shadow-sm`, 라벨 `text-xs font-black uppercase text-slate-500` (thead 흉내) | TableHead `noRow` (구조는 div 그리드라 직접 대체 어려움) | PBP 그리드 전용이면 현상 유지 or `TableHead`를 div용(`as`)로 | 체크: 2448(divider_b, zindex, sticky 3역할). 헤더 `h-8` vs BoxScorePlaceholder `h-9` vs Table `h-10` (3종 높이) |
| 2460, 2492-2512 (2496, 2501, 2506) | 기타 | PBP 로그 중앙 3칸 `w-8`/`w-16`/`w-8`, 점수 `text-xs font-black tracking-tight tabular-nums`, 시간 `text-slate-500 font-bold text-xs tabular-nums` | 없음(PBP 고유 그리드) | — | 체크: 2496, 2501, 2506. `divide-y divide-slate-800/50` 로 행 구분 |
| 2481-2490 | 기타 | flow 행 `flex items-center justify-center py-2.5 bg-indigo-500/10 border-y border-indigo-500/20` + Clock 아이콘 | 없음 | — | [추가] |
| 2514-2555, (2522) | hover | 교체 행 `flex items-start py-2 px-3 gap-2 hover:bg-white/5 transition-colors`, away/home IN/OUT 블록 12줄씩 미러(L2524-2535 / L2539-2550) | TableRow의 hover와 동일 규칙 | — | 체크: 2522. 미러 중복 [추가] |
| 2557-2580 (2568) | hover/empty | 로그 행 색: `hover:bg-white/5 transition-colors`, 부상 행 `bg-red-900/20 border-y border-red-900/30` | TableRow hover와 동일 | — | 체크: 2568. 부상 행 색 [추가] |
| 2583-2587 (2585) | empty | `py-10 text-center text-slate-600 text-xs ko-normal` | 신규 `EmptyState` | — | 체크: 2585(`없습니다`). L727과 같은 클래스 복붙 |
| 2611 | divider | `shrink-0 border-t border-slate-800 flex flex-col` | — | — | 체크: 2611 |
| 2643-2739 (2643, 2644, 2661, 2662, 2691, 2692, 2705, 2706, 2720, 2721, 2738, 2739) | section-header/divider | 6개 섹션 래퍼 `<section className="border-t border-slate-800">` + 바 `bg-slate-800 border-t border-slate-600 px-6 py-3` + `<h3 className="text-sm font-bold uppercase text-white">` (각 3줄, 6회) | 신규 `SectionBar` | `SectionBar title` | 체크: 위 12라인. 같은 위치에 `border-t slate-800`(section)과 `border-t slate-600`(바)이 이중 — 위쪽 1px이 두 겹(추정) |
| 2665-2670 | 오탐 | 주석 | — | — | 체크: 2666, 2670 = 오탐 |

**오탐 목록 (MultiGamePbpView, 22건):** 라인 460, 462, 464, 532, 542, 586, 588(×2: divider_t, tabular), 620, 1088, 1273, 1364, 1386, 1422, 1491, 2035, 2052, 2154, 2156, 2159(`-z-10` 음수 z-index 연출 클래스), 2666, 2670 — 전부 주석 텍스트 내 토큰이거나 연출용 음수 z-index.

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 팀 로고 onError 폴백 체인 `<img>` | L89-102, L153-170(함수 전체), 다른 파일 GameDateStrip L26-39 | 이 파일 32 (14+18) / 3곳 합 46 |
| away/home 미러 — QuarterScores 행 | L555-566 ↔ L567-578 | 24 |
| away/home 미러 — 종료 헤더 팀 블록 | L2247-2261 ↔ L2285-2299 | 30 |
| away/home 미러 — 교체 IN/OUT 블록 | L2524-2535 ↔ L2539-2550 | 24 |
| away/home 미러 — PlayerBoxPanel 3분기(showBox/live/scheduled/placeholder) | L2339-2360 ↔ L2595-2610 | 38 |
| 섹션 바(`bg-slate-800 border-t border-slate-600 px-6 py-3` + h3) | L2644-2646, 2662-2664, 2692-2694, 2706-2708, 2721-2723, 2739-2741 | 18 |
| 섹션 래퍼 `border-t border-slate-800` | L2643, 2661, 2691, 2705, 2720, 2738 | 6 |
| `border-t border-slate-800` 구분선 (섹션 외) | L788, 2367, 2413, 2611 | 4 |
| 툴팁 표면 `bg-slate-900 border border-slate-700 rounded-lg shadow-lg pointer-events-none` | L944-947, L1308-1311 (본체 L941-974 / L1307-1323) | 8 (본체 합 51) |
| 빈 상태 `py-10 text-center text-slate-600 text-xs ko-normal` | L727-729, L2584-2586 | 6 |
| 스탯 td `statCell` | L685-694 | 10 |
| TEAM 합계 td `text-right py-1.5 px-1.5 tabular-nums` | L703-712 | 10 |
| 헤더 th `text-right py-2 px-1.5` | L652-661 | 10 |
| 로딩 Loader2 raw | L2025-2027 (+ MultiSeasonLayout L65-67) | 3 (+3) |

---

## views/multi/season/GameDateStrip.tsx (425줄)

### 공용 컴포넌트 사용 현황
공용 import 없음. 사용 가능했으나 미사용: TeamLogo(로고 `<img>` 직접, L26-39), Dropdown(캘린더 팝오버 직접 `fixed` + mousedown 바깥클릭 effect L221-228), Button(아이콘 버튼 6개 raw), Badge(LIVE 칩 raw), Skeleton(데이터 없을 때 `return null` L257이라 스켈레톤 없음 — 스트립이 사라졌다 나타남, 추정).

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 21-49 (32, 33, 36, 45) | logo-fallback/기타 | StripTeamRow: `<img w-5 h-5 object-contain shrink-0>` + onError 폴백 체인(`dataset.fallback`→`getTeamLogoUrl`→`placehold.co`), 패배팀 `opacity-40`, 약어 `text-sm font-bold|semibold truncate`, 점수 `tabular-nums tracking-tight` | TeamLogo | `preferReal` + `faded`(현 `opacity-50 grayscale`와 달리 `opacity-40`) | 체크: 32, 33, 36, 45. MultiGamePbpView L95/L161과 복붙 |
| 259-274 (261, 262, 265, 269) | button/기타 | 접힘 상태 바: `shrink-0 flex items-center gap-2 bg-slate-800 border-b border-slate-700 h-8 px-1.5`, 펼침 아이콘 버튼 `p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors`, 텍스트 `text-xs font-semibold text-slate-400 tabular-nums` | 신규 `IconButton` | `IconButton size="sm" tone="ghost-slate"` | 체크: 261, 262, 265, 269. 접힘 `border-b slate-700` ↔ 펼침 L277 `border-b slate-600` 불일치 |
| 277 (277) | divider/기타 | 스트립 루트 `shrink-0 flex items-stretch bg-slate-800 border-b border-slate-600 h-[75px]` | — | — | 체크: 277. 높이 하드코딩 75px |
| 279-285 (279, 282) | button/divider | 접기 버튼 `shrink-0 flex items-center justify-center px-3 bg-slate-800 border-r border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-[color,background-color] cursor-pointer` | IconButton(신규) | `IconButton variant="bar-cell"` (세로 풀하이트 셀형) | 체크: 279, 282(divider_v+row_hover). L265 버튼과 같은 아이콘 버튼이지만 패딩/배경 다른 변형 |
| 288 (288) | divider | 날짜 셀렉터 래퍼 `relative shrink-0 flex items-center gap-0.5 px-1.5 bg-slate-800 border-r border-slate-700` | — | — | 체크: 288 |
| 289-295 (289, 292) | button | 이전 날짜 `p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent` | IconButton | `disabled` 스타일 포함 | 체크: 289, 292. L311-317 다음 날짜와 동일(방향만 다름) |
| 296-310 (296, 304) | button | 날짜 버튼(연도/월.일 2줄) `flex flex-col items-center justify-center px-3 py-2 rounded transition-colors` + open시 `bg-slate-700` else `hover:bg-slate-700` | Button(`ghost`)? 부적합(uppercase tracking-widest) | 신규 `DropdownButton` 변형 or IconButton 확장 | 체크: 296, 304. 공용 `DropdownButton`은 `border border-slate-800 rounded-lg px-4 py-2 + ChevronDown`이라 모양 다름 |
| 311-317 (311, 314) | button | 다음 날짜 (L289와 동일) | IconButton | 동일 | 체크: 311, 314 |
| 319-329 | dropdown | 월간 달력 팝오버 호출. 위치 `menuPos` 상태(L142, L300-301) + 바깥클릭 `mousedown` effect(L221-228) + `dateMenuRef`(L143, L288) | Dropdown (`children` 모드, controlled `isOpen`, `align="left"`, `width="w-72"`) | Dropdown 패널 표면이 `border-slate-800 rounded-xl`, gap 8px, z-[9999], portal → 현 팝오버(`border-slate-700`, 각진 모서리, gap 0, z-50, non-portal)와 시각 차이 | [추가] 제거 예상: 상태 1(L142) + ref 1(L143) + effect 8줄(L221-228) + 좌표 2줄(L300-301) ≈ 12~14줄 |
| 335-343 (336, 339) | button | 좌 스크롤 `shrink-0 w-8 flex items-center justify-center bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 disabled:cursor-default transition-colors` | IconButton | `variant="bar-cell"` | 체크: 336, 339(row_hover ×2). L413-421과 동일 클래스(복붙) |
| 346-356 | 기타 | 가로 스크롤 영역 `flex-1 min-w-0 overflow-x-auto flex select-none cursor-grab active:cursor-grabbing` + 인라인 scrollbarWidth:none | — | — | [추가] 스크롤바 숨김 인라인 style(Pbp와 동일 방식) |
| 367-405 (368, 372, 373, 377, 381, 382) | card/button/badge | 경기 카드 버튼 `shrink-0 w-36 px-3 py-1.5 flex flex-col justify-center gap-1 border-r border-slate-700`, 상태별 배경 `bg-slate-700`(현재) / `bg-red-900/30 hover:bg-red-900/50`(라이브) / `bg-slate-900 hover:bg-slate-800`; 상태 라벨 `text-xs font-bold uppercase`; LIVE 칩 `flex items-center gap-1 text-[10px] font-bold leading-none text-red-400` + 점 `w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse` | Badge (LIVE 칩) | `Badge variant="danger"` + `dot`(pulse) 옵션 신규. 카드 자체는 Card 부적합(`rounded-3xl`) | 체크: 368, 372(divider_v), 373(row_hover), 381(badge_inline), 382(live_dot). 선택 상태 slate-700 — Dropdown active(`bg-indigo-600/10 text-indigo-400`), 쿼터 pill(`bg-indigo-600`)과 3종 불일치 |
| 413-421 (414, 417) | button | 우 스크롤 (L335-343 거울) | IconButton | 동일 | 체크: 414, 417 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 아이콘 버튼 `p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 (disabled:opacity-30)` | L262-268, 289-295, 311-317 | 21 |
| 바 셀 아이콘 버튼 `w-8 ... bg-slate-800 text-white hover:bg-slate-700 disabled:...` | L336-342, 414-420 (클래스 문자열 동일) | 14 |
| 접기 셀 버튼 | L279-285 | 7 |
| 로고 onError 체인 | L26-39 | 14 |
| `bg-slate-800` 바/셀 배경 | L261, 277, 282, 288, 339, 417 | 6 |

---

## views/multi/season/MonthCalendarPopover.tsx (87줄)

### 공용 컴포넌트 사용 현황
공용 import 없음. Dropdown(패널 표면 자체), Button/IconButton(월 이동 화살표) 미사용.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 34-38 (36) | dropdown/card | 패널 `fixed z-50 w-72 bg-slate-900 border border-slate-700 shadow-2xl p-3`, 좌표 `style={{left, top}}` | Dropdown 패널 표면 / 신규 `PopoverSurface` | 둥근 모서리(`rounded-xl`) 없음 — Dropdown 패널은 `rounded-xl overflow-hidden`; 보더 slate-700 vs slate-800 | 체크: 36(card_box), 36(zindex). 일정 화면(MultiScheduleView)과 공유되는 컴포넌트라 변경 시 두 화면 동시 영향 |
| 40-45 (40, 42) | button | 이전 달 `p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors` | IconButton(신규) | `size="md"` (p-1), hover 배경 slate-800 (GameDateStrip은 slate-700) | 체크: 40, 42. L47-52와 방향만 다른 복붙 |
| 46 (46) | 기타 | 월 제목 `text-sm font-bold text-white tabular-nums` | — | — | 체크: 46 |
| 47-52 (47, 49) | button | 다음 달 (L40 거울) | IconButton | 동일 | 체크: 47, 49 |
| 54-58 | 기타 | 요일 헤더 `grid grid-cols-7 gap-1` `text-xs font-bold text-slate-500 text-center` | — | — | [추가] |
| 59-82 (66, 70, 74) | button/hover | 일자 버튼 `h-8 rounded text-xs font-bold tabular-nums transition-colors`, 선택 `bg-indigo-600 text-white ring-1 ring-inset ring-indigo-400`, 가능 `text-white hover:bg-slate-800 cursor-pointer`, 불가 `text-slate-700 cursor-not-allowed` | 신규 `CalendarGrid`/없음 | — | 체크: 66, 70, 74. 선택색이 indigo-600 — GameDateStrip의 "인디고→slate 변경(L287 주석)" 방침과 한 컴포넌트 안에서 불일치 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 월 이동 아이콘 버튼 | L40-45, L47-52 | 12 |

---

## views/multi/season/MultiSeasonLayout.tsx (104줄)

### 공용 컴포넌트 사용 현황
공용(`components/common`) import 없음. 레이아웃 구성요소(MultiSidebar/MultiHeader/TournamentChampionModal/GameDateStrip/LeagueLobbyPanel)만 사용. Loader2 raw.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 63-69 (66) | spinner | `flex items-center justify-center h-full min-h-screen bg-gray-950` + `Loader2 size={32} className="animate-spin text-indigo-400"` | 신규 `Spinner`/`LoadingState` | `size`, `fullscreen` | 체크: 66(spinner). `bg-gray-950`은 이 화면군의 나머지(`bg-slate-950`, L78)와 다른 팔레트 [추가: 불일치] |
| 78 | 기타 | 루트 `flex h-screen overflow-hidden bg-slate-950` | — | — | [추가] 레이아웃 고유 |
| 96 | 기타 | 본문 스크롤 `flex-1 overflow-y-auto custom-scrollbar` | — | — | [추가] Pbp 쪽은 `custom-scrollbar-hide` 사용 → 같은 화면 안에서 스크롤바 스타일 중첩(레이아웃 `custom-scrollbar` 내부에서 Pbp 자체 스크롤, 추정) |

### 파일 내 반복 패턴
없음 (스피너 1회).

---

## 화면군 종합

### 불일치 대조표
| 대상 | 변형 A | 변형 B | 변형 C | 라인 |
|---|---|---|---|---|
| 팀 로고 폴백 | TeamLogo (`getTeamLogoUrl`→`placehold`, `drop-shadow-md`) | 직접 구현 3종 (`getRealTeamLogoUrl`→`getTeamLogoUrl`→`placehold`) | — | TeamLogo.tsx / Pbp L89, L155 / Strip L26 |
| 로딩 스피너 | Loader2 28 indigo-400 | Loader2 32 indigo-400, bg-gray-950 | 공용 없음 | Pbp L2026 / Layout L66 |
| 바 구분선 색 (같은 역할) | slate-700 (접힘 스트립 L261, 카드 L372, PBP 헤더 L2415, 샷차트 L2394) | slate-600 (펼침 스트립 L277, 섹션 바 L2644…) | slate-800 (Table/섹션 래퍼/좌우 컬럼) | 다수 |
| 섹션 바 | 섹션 바 `bg-slate-800 border-t slate-600 px-6 py-3` + `text-sm font-bold uppercase text-white` | PBP 헤더 `bg-slate-800 border-b slate-700 h-9 px-3` + `text-xs font-semibold uppercase tracking-wider text-slate-300` | thead 흉내 `bg-slate-950 h-8|h-9 border-b slate-800 shadow-sm` | Pbp L2644, L2415, L2448, L724 |
| 선택(active) 색 | indigo-600 solid (쿼터 pill L2430, 캘린더 선택일 L72) | slate-700 (스트립 현재 카드 L373, 날짜 open L304) | indigo-600/10 + text-indigo-400 (Dropdown active) / text-indigo-400 + border (TabBar) | — |
| 헤더 행 높이 | Table `h-10` | PBP 그리드 `h-8` (L2448), 플레이스홀더 `h-9` (L724), PBP 바 `h-9` (L2415) | PlayerBoxPanel/QuarterScores는 높이 없이 th 패딩(`py-2`/`py-1.5`) | — |
| thead sticky z-index | Table `z-40` | PlayerBoxPanel `z-10` / PBP 그리드 `z-10` | — | Pbp L647, L2448 |
| 스탯 숫자 색 | Table stat `text-slate-300 font-bold font-mono` | PlayerBoxPanel `text-white font-semibold` | 쿼터표 `text-slate-300`(합계 `text-white font-bold`) | L612, L560 |
| tfoot 배경 | Table `bg-slate-950` | PlayerBoxPanel tr `bg-slate-800/50` | — | L699 |
| 팝오버 표면 | Dropdown 패널 `border-slate-800 rounded-xl z-[9999] portal` | MonthCalendarPopover `border-slate-700 각짐 z-50` | InjuryStatusBadge 툴팁 `border-slate-600 rounded-lg` / 차트 툴팁 `border-slate-700 rounded-lg` | Popover L36 / Pbp L945, L1309 |
| 아이콘 버튼 | Strip `p-0.5 hover:bg-slate-700` | Popover `p-1 hover:bg-slate-800` | 바 셀 `w-8 bg-slate-800` / `px-3 border-r` | Strip L265/L336/L282, Popover L42 |
| 스크롤바 | `custom-scrollbar` (Table, Modal, Layout) | `custom-scrollbar-hide` (Pbp L2332, L2642) | 인라인 `scrollbarWidth:none` (Pbp L2367, L2442 / Strip L355) | — |
| 한글 + uppercase/tracking | Table 헤더 `uppercase tracking-widest` (한글 헤더 사용 중) | Pbp 헤더 L549-551, L186, L2116, L2417, L2645 | — | 영문에만 효과(추정). 버튼에서 제거 방침(feedback_button_typography)과 달리 비-버튼 텍스트엔 잔존 |
| 배경 팔레트 | slate-950 | `bg-gray-950` (Layout L65) | — | Layout L65 |
| 임의 폰트 크기 | `text-xs`/`text-sm` | `text-[10px]`·`text-[11px]`·`text-[13px]` 혼재 | — | Pbp L928, L950, L1316 등 |

### 통합 후보(효과 큰 순)
줄 수는 현재 코드 라인 수를 세어 산정한 "제거 예상"이며, 호출부 1줄 대체분을 뺀 값이다(추정 포함).

| 순위 | 후보 | 대상 라인 | 제거되는 줄 수 | 선행 조건 |
|---|---|---|---|---|
| 1 | away/home 미러 블록 헬퍼화(파일 내부) | Pbp L555-578(24→15), L2247-2261+L2285-2299(30→20), L2524-2550(24→16), L2339-2360+L2595-2610(38→18) | 약 47 (9+10+8+20) | 없음(공용 컴포넌트 불필요). 렌더 헬퍼/map 로 처리 |
| 2 | TeamLogo에 real 로고 우선 폴백 지원 후 3곳 교체 | Pbp L89-102(14→1), L152-170(19 삭제, 호출 2곳 유지), Strip L26-39(14→1) | 약 45 (13+19+13) | TeamLogo에 `preferReal`(또는 `source="real"`) + `faded`(opacity-40 변형) prop. `getRealTeamLogoUrl`이 이미 `utils/constants`에 있어 의존성 문제 없음. TeamLogo 다른 호출부는 기본값 유지로 영향 없음 |
| 3 | `IconButton` 신규 | Strip L262-268, 279-285, 289-295, 311-317, 336-342, 414-420 / Popover L40-45, 47-52 (총 54줄, 8곳) | 약 38 (54 → 8곳×2줄) | 신규 컴포넌트(sizes: p-0.5/p-1/w-8셀, tone: slate-700/slate-800 hover). Button은 `uppercase tracking-widest rounded-2xl px-*`이라 불가 |
| 4 | Dropdown 으로 캘린더 팝오버 이관 | Strip L142-143, L221-228, L300-301, L319-329 | 약 14 | Dropdown 패널 시각 변경(rounded-xl/slate-800/portal)을 사용자가 수용해야 함 — 일정 화면(MultiScheduleView)과 동시 영향. 시각 동일성 필요 시 Dropdown에 `surfaceClassName` 오버라이드 prop 필요 |
| 5 | `SectionBar` 신규 | Pbp L2644-2646 외 5곳(18줄) + L2415(선택) | 12 (18→6) | 신규 컴포넌트. 래퍼 `border-t slate-800`와 바 `border-t slate-600` 이중 선 정리 포함(시각 변경 확인 필요) |
| 6 | `SegmentedControl` 신규 | Pbp L2420-2436 | 약 11 (17→6) | 신규 컴포넌트(선택 indigo-600 / 비활성 slate-800 / disabled). 다른 화면 사용처 존재 여부는 이 감사 범위 밖(추정 불가) |
| 7 | `EmptyState` / `Spinner` | Pbp L727-729, L2041-2043, L2583-2587, L2025-2027 / Layout L65-67 | 약 12 | 신규 2종. 에러 안내는 토스트 지침(feedback_errors_via_notify)과 충돌 여부 확인 필요 |
| 8 | Badge 확장(solid·square·dot) | Pbp L60-61(BONUS), Strip L380-385(LIVE) | 약 6 | Badge에 `tone="solid"`, `shape="square"`, `dot`(pulse) prop 신규 |
| 9 | PlayerBoxPanel/QuarterScores full → Table 계열 | Pbp L544-581, L631-715 | 약 1~5 (statCell 상수 등) — 줄 수보다 클래스 일치가 목적 | Table에 `bare`(카드 래퍼 제거)·`tableLayout=fixed`+colgroup, TableCell stat 색 오버라이드, 헤더 `h-10` 대신 `py-2`·z-index 10 허용. 라이브 중 매초 리렌더(liveHomeBox가 serverNow 의존) 영향은 추정 |
| 10 | `TooltipSurface` 신규 | Pbp L944-947, L1308-1311, (InjuryStatusBadge 공용 툴팁은 별도) | 약 2~4 | 신규. 패딩 변형(px-2.5 py-1.5 vs px-3 py-2) 통일 결정 필요 |

### 체크리스트 대조 결과
| 파일 | 매치 | 반영 | 오탐 | 비고 |
|---|---|---|---|---|
| MultiGamePbpView.tsx | 184 | 162 | 22 | 오탐: 주석 내 토큰 21 + 연출용 음수 z-index(L2159) 1. 반영 행은 위 표의 "체크:" 열 참조 |
| GameDateStrip.tsx | 30 | 30 | 0 | 전부 실제 코드 |
| MonthCalendarPopover.tsx | 10 | 10 | 0 | 전부 실제 코드 |
| MultiSeasonLayout.tsx | 1 | 1 | 0 | |
| 합계 | 225 | 203 | 22 | 추가 발견 수는 아래 |

**추가 발견: 24건** (`[추가]` 태그가 붙은 표 행 수를 grep으로 집계: MultiGamePbpView 18, GameDateStrip 2, MonthCalendarPopover 1, MultiSeasonLayout 3. 일부 행은 체크리스트 라인과 [추가] 조각을 함께 포함함). 반영 203 + 오탐 22 = 매치 225로 일치.
