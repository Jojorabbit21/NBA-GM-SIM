# 04 트레이드·드래프트 풀 — UI 조각 전수 감사

읽은 범위:
- views/multi/season/MultiFrontOfficeView.tsx: 1~2137줄 (전부, 480/520/480/660줄 단위로 끊어 마지막 줄까지)
- views/multi/season/MyTradeBlockModal.tsx: 1~454줄 (전부)
- views/multi/season/MultiDraftPoolView.tsx: 1~464줄 (전부)
- components/multi/DraftPoolModal.tsx: 1~217줄 (전부)
- 공용 API(감사 대상 아님): components/common/Table.tsx 1~229, TabBar.tsx 1~55, Button.tsx 1~69, Badge.tsx 1~41, Card.tsx 1~45, Modal.tsx 1~136, Dropdown.tsx 1~147, PageHeader.tsx 1~42, TeamLogo.tsx 1~46, OvrBadge.tsx 1~146, InjuryStatusBadge.tsx 1~94 전부. PlayerHoverCard.tsx는 1~120줄 + props 정의(223~248줄)만 읽음(344줄, 공용 API라 시그니처만 필요).
- 중복 여부 확인용 보조 grep/diff: `MultiFreeAgentView.tsx`의 CheckboxFilterDropdown(74행~) vs 이 화면 52행~ diff, `utils/formatMoney.ts`, `utils/attrRatingColor.ts`, `getRealTeamLogoUrl`/`getTeamLogoUrl`(utils/constants.ts), DraftPoolModal 호출부(`components/multi/DraftPoolSettings.tsx:279`).
- 체크리스트: by_file 4개 전부 대조(총 275라인: 171+36+53+15).

공용 API에서 확인한 대체 가능성의 핵심 제약(이후 표에서 반복 인용):
- `Button`: 기본 `rounded-2xl font-black uppercase tracking-widest`, xs=`px-3 py-1.5 text-[10px]`, sm=`px-4 py-2 text-xs`. 이 화면군 버튼은 전부 `rounded-lg text-sm font-black`(일부 `uppercase`)라 **크기/라운드/타이포 불일치** — 그대로 치환하면 시각 변화 큼. `size`에 `rounded`/`typography` 오버라이드 또는 신규 size가 필요.
- `Badge`: `rounded-full border` 고정, 텍스트 `text-[9px]/[10px]` 두 단계만 있음(이 화면군 pill은 `text-sm`/`text-xs`).
- `Modal`: 우측 X 고정(`hideCloseButton`으로 끌 수 있음), header는 `px-8 py-6 text-xl font-bold`, z-[500], 기본 backdrop `bg-slate-950/80`(`backdropClass` 있음), `rounded` prop 있음.
- `Table`: wrapper가 `bg-slate-900 border rounded-xl shadow-lg overflow-auto`를 붙임(중첩 스크롤 컨테이너 안에서는 `!rounded-none !shadow-none !border-*`로 지우는 중). `TableRow`는 항상 `hover:bg-white/5`(끌 수 없음), 선택 상태 없음, `TableHeaderCell`은 `py-3 px-1.5` 고정·정렬 화살표 내장(ArrowUp/Down size10 indigo-400), `TableCell`은 `py-2 px-3 border-b border-slate-800/50`. 컬럼 구분선(border-r) 전용 prop 없음.
- `OvrBadge`: `textClassName` prop 있음(폰트만 덮어쓰기), size sm=24px. 이 화면군은 `!w-6 !h-6 !text-sm !shadow-none` 같이 `!important`로 덮음. `boxShadow`가 inline style이라 `!shadow-none`(important)만 inline을 이기고, `Table` `variant="ovr"`의 `shadow-none`(non-important)은 inline에 져서 효과 없을 가능성이 높음(추정, 브라우저 미확인).
- `TeamLogo`: `getTeamLogoUrl`(구 `/logos/{id}.svg`) 단일 소스 + placehold 폴백. 이 화면군은 `getRealTeamLogoUrl`(`/logos/real/`) → 구버전 → placehold 3단 폴백이 필요해 로컬 `TeamLogoIcon`을 따로 둠.
- `Dropdown`: portal 패널(z-9999), `items` 또는 `children`(커스텀 콘텐츠) 지원, controlled `isOpen` 지원. 체크박스형 멀티셀렉트 전용 모드는 없음.

---

## views/multi/season/MultiFrontOfficeView.tsx (2137줄)

어드민 전용 UI: **별도 AdminTradePanel 컴포넌트 없음.** `isAdmin` 분기는 데이터/활성화 조건만 바꾼다 — 376(정의), 444(`humanTargetTeams`에 AI 팀 포함, `[TEMP]` 임시), 538~539(`listAllPendingTradeOffers` 등 추가 조회), 606~607(`inboxList` 리그 전체 오퍼), 780(`isTestUnblockedTarget` `[TEMP]`), 1997(`!isAdmin && !myTeamRow` 안내문), 1628(`getOfferOpts`가 어드민 전권 3버튼 반환). → "어드민 전용"으로 표시만, 상세 감사 생략. 단, 어드민이 보는 3버튼 행(1256~1273)은 일반 유저와 같은 코드 경로라 아래 표에 포함.

### 공용 컴포넌트 사용 현황
| 공용 | 사용 | 라인 |
|---|---|---|
| TabBar | O (1곳, `rightSlot`에 raw 버튼, `badge`로 안읽음 수) | 1453~1465 |
| Table/TableHead/TableBody/TableHeaderCell/TableCell | O (2곳: 트레이드 블록, 히스토리). 단 TableRow 미사용(순수 `<tr>`) | 1543~1646, 2022~2116 |
| OvrBadge | O (1곳, `!w-6 !h-6 !text-sm !shadow-none`) | 204 |
| PlayerHoverCard | O (6곳) | 207, 847, 868, 1156, 1800, 1837 |
| InjuryStatusBadge | O (2곳, props 동일 size16/iconSize12/strokeWidth4) | 212~218, 875~881 |
| Modal | 간접(MyTradeBlockModal) | 2120 |
| Button / Badge / Card / Dropdown / PageHeader / TeamLogo | **미사용** (전부 직접 구현. TeamLogo는 로컬 `TeamLogoIcon`으로 대체) | — |

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 85~88 | badge(상태 맵) | `STATUS_LABEL` 6종 문자열만, 색 없음 | Badge | 상태→variant 맵(pending=info, accepted=success, rejected=danger, cancelled/expired/invalidated=neutral) | 목록 행(1309~1311)은 무색 텍스트, 상세(1275~1283)는 색 문단 — 구현 방식 2종 |
| 133~154 | table(colgroup) | `PLAYER_TABLE_WIDTHS_PCT` + `<colgroup>` % 폭, `table-fixed` | Table | `columns`/`colWidths` prop 또는 `tableLayout:'fixed'` 지원 | withContract/withoutContract 2세트 폭 |
| 164~236 | player-row | `PlayerChip`(React.memo): `<tr h-9 bg-slate-900 border-b border-slate-800/50>`, 셀 10개 | Table(TableRow/TableCell) + 신규 `PlayerNameCell` | 행 hover 끄기·`density="compact"`, 선택/비활성 행 상태 | 아래 4개 행의 상세 |
| 183~185 | hover/row | 행 hover `hover:bg-white/[0.03]`, blocked `opacity-40`, 비활성 `cursor-not-allowed` | TableRow | `hover`(on/off)·`disabled` prop | TableRow는 `hover:bg-white/5`로 값도 다름 |
| 187~201 | button(원형 +/-) | `w-5 h-5 rounded-full` emerald-600 / red-600 / slate-700(비활성) + Plus/Minus size12 | Button | 신규 `IconButton` size xs, variant add/remove | Button은 사각 pill 계열이라 원형 아이콘 버튼 없음 |
| 202~206 | player-row(OVR) | `<td><div flex justify-center><OvrBadge sm !w-6 !h-6 !text-sm !shadow-none/>` | OvrBadge / Table `variant="ovr"` | `textClassName="text-sm"`로 !important 제거 | `!w-6 !h-6`는 sm과 동일(중복) |
| 207~222 | player-row(이름) | `PlayerHoverCard` > `<td pl-2 pr-1>` > 이름 `text-sm font-semibold text-white truncate` + InjuryStatusBadge | PlayerHoverCard(이미 사용) + 신규 `PlayerNameCell` | 이름+부상배지+(옵션)클릭 이동 | **이름 클릭 시 선수 상세 이동 없음**(다른 5곳 이름은 모두 navigate). 호버카드가 `<td>`에 이벤트 부착(cloneElement) |
| 223~226 | td(숫자) | 포지션 `pr-4 text-center text-sm text-white`, PTS/REB/AST `pr-4 text-right text-sm text-white` | TableCell `variant="stat"` | `tabular-nums` 이미 stat에 포함(단 `font-mono font-bold slate-300`이라 시각 상이) | tabular-nums 없음, mono 아님 |
| 229~230 | money | `formatMoney(salary)` `pr-4 text-right text-sm text-white`, 잔여연수 `pr-1 text-right`, 계약 없으면 `''` | TableCell `variant="stat"` / 신규 `Money` | 신규 `<Money value format="short|full" signed colorBySign tabular/>` | tabular-nums 없음(아래 돈표기 대조표) |
| 233 | badge/icon | `<Ban size13 text-red-400>` blocked 표시 | Badge | `icon` 슬롯 활용 가능(Badge는 텍스트 필요) | 아이콘 단독 |
| 279~310 | th(정렬) | `PlayerListHeader`: 순수 `<thead sticky top-0 z-10 bg-slate-950>` `<tr h-7 text-sm font-black uppercase text-slate-500>`, th 10개, 클릭 정렬 + ArrowUp/Down inline size10 indigo-400 | Table(TableHead/TableHeaderCell) | `sortable/sortDirection/onSort`는 존재. 부족: **compact 높이(h-7, py-3 아님)**, 정렬 화살표 inline 배치 | 화살표 아이콘은 TableHeaderCell과 동일(ArrowUp/Down size10 strokeWidth3 indigo-400) → 중복 정의 |
| 291, 1552, 2023 | sticky/z-index | `sticky top-0 z-10`(280~) / `TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow` | TableHead | 클래스 삭제(기본값이 이미 동일) | 1552·2023·(DPV 342)는 TableHead 기본 클래스와 **완전 중복** |
| 312~331 | logo-fallback | `TeamLogoIcon` 로컬: `getRealTeamLogoUrl` → onError `getTeamLogoUrl`(dataset.fallback) → `placehold.co/100x100?text=BPL` | TeamLogo | `source="real"` + 3단 폴백 | 사용 9곳(1191,1198,1329,1333,1587,1690,1713,2076,2095). 공용 TeamLogo 폴백은 2단 |
| 1043~1048 | spinner/empty | `min-h-[50vh]` + `Loader2 animate-spin text-slate-500 size24` | 신규 `LoadingState` | 크기/색 prop | 로더 3종(24 slate-500 / 22 slate-500 / DPV 28 indigo-400) |
| 1050~1057 | empty | `ShieldAlert size36 slate-600` + `text-sm text-slate-500 ko-normal` | 신규 `EmptyState` | icon/message prop | |
| 1065~1079 | section-header | `sectionLabelClass='text-sm uppercase text-white font-bold mb-1'` 문자열 상수 | 신규 `FieldLabel` | — | 이 파일 안에서 7회 이상 재사용 |
| 1118~1125 | 팀 링크 | `renderTeamLink`: span + navigate(`roster?rteam=`) + hover:underline indigo-400 | 신규 `TeamLink` | teamSlug→라우트 | 같은 패턴 4곳(1120, 1589, 2078, 2097) |
| 1127~1178 | card/section | `renderAssetColumn`: 팀색 헤더(`bg=color_primary`) + 선수 행(flex gap-3 text-sm) + 합계(`border-t border-slate-700`) | 신규 `TeamColorHeader`, `PlayerLine` | team 색상+대비 텍스트 | 팀색 헤더 3중 복제(아래 패턴) |
| 1155~1169 | player-row(라인형) | 이름 `text-white font-bold flex-1 truncate` + 포지션 `w-8` + `{n}Pts/Reb/Ast` 각 `w-14 text-right` + 연봉 `w-24 text-right` | Table | 라인형 → 표 | OVR 배지·부상배지 **없음**, 'Pts' 접미사 있음(1165~1167) |
| 1168, 1175 | money | `formatMoneyFull` `w-24 text-right text-white`, 합계 `text-white`(부모 font-bold) | `Money` | — | tabular-nums 없음 |
| 1173 | divider | `mt-2 pt-2 px-2 border-t border-slate-700` | 신규 `Divider` | — | divider 값 종류가 slate-700/60, 700, 800, 800/50, 800/30 혼재 |
| 1181~1185 | section-header | `<h1 text-xl font-black text-white>` 문서 제목 + 날짜 `text-sm text-slate-500` | PageHeader(부적합: text-4xl) | 소형 `SectionTitle` | 헤딩 크기: 1183 text-xl / 1446 text-lg / DPV 231 text-lg |
| 1187~1202 | logo+이름 | `TeamLogoIcon w-10 h-10` + `renderTeamLink` | TeamLogo(size custom) | `source="real"` | |
| 1205~1210 | 인용문 | `italic text-slate-300` `"..."` | — | — | 1598(블록 탭)도 `italic text-slate-300 “…”`(따옴표 스타일 상이: `"` vs `“”`) |
| 1220~1234 | money(행) | 라벨 `text-white` + 값 `font-semibold` emerald/red, `row.value>=0 ? '+':''` | `Money` | `signed colorBySign` | **tabular-nums 없음** (같은 데이터 1402에는 있음) |
| 1236~1250 | 알림 문구 | 경고 `text-sm text-fuchsia-400`(1239), 실패 `ShieldAlert + text-red-400`(1245~1249) | 신규 `InlineNotice` | variant warn/error | 1930도 fuchsia 문구(`· msg`) — 동일 의미 3곳 |
| 1257~1260, 1263~1266, 1269~1272 | button | 수락 `bg-emerald-600 … shadow-lg shadow-emerald-900/30`, 거절 `bg-red-600 … shadow-red-900/30`, 취소 `bg-slate-700` — 공통 `px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40` + 아이콘(Check/X) + busy 시 Loader2 | Button | variant brand(=emerald)/danger/secondary + `isLoading`·`icon`; 크기 `px-4 py-2 text-sm rounded-lg`가 Button sm(`text-xs rounded-2xl uppercase`)과 상이 | Button의 `brand`=emerald, `danger`=red 와 색은 일치. 12줄 |
| 1259 | spinner | 버튼 안 `Loader2 size14 animate-spin` | Button `isLoading` | — | Button 내장 로더는 size12 |
| 1275~1283 | badge(상태 텍스트) | 완료 상태별 `text-sm font-bold`: accepted emerald-400 / rejected red-400 / cancelled·expired slate-300 | Badge | success/danger/neutral | **`invalidated` 분기 없음 → 아무것도 렌더 안 됨**(85~88엔 라벨 존재). 필터 `INBOX_STATUS_MATCH`(110~114)에도 invalidated 없음 |
| 1293, 1313~1338 | table(div grid) | `INBOX_ROW_GRID='grid grid-cols-[14px_1fr_1fr_1fr_1fr] gap-1.5'`, 행 `px-3 py-2.5 border-b border-slate-800/50`, 선택 `bg-slate-700` / 기본 `bg-slate-900 hover:bg-white/5` | Table | `TableRow selected` prop, 컬럼 폭 지정 | 주석(1317~1321)이 Table 관례를 흉내냈다고 명시 — 선택 상태 때문에 Table 미사용 |
| 1324 | badge(dot) | 안읽음 `w-1.5 h-1.5 rounded-full bg-red-500` | Badge/신규 `UnreadDot` | — | TabBar 안읽음 배지는 `w-3.5 h-3.5 bg-red-500` 별도 구현 |
| 1328~1335 | logo+약어 | `TeamLogoIcon w-4 h-4` + `truncate font-bold` 방향별 white/slate-400 | TeamLogo | — | |
| 1336~1337 | 텍스트 | 날짜 `text-slate-400`, 남은시간/상태 `text-slate-400 truncate` | Badge(상태) | — | 날짜 포맷 `mm/dd`(1307) |
| 1394~1438 | card/section(푸터) | `shrink-0 px-4 py-2 space-y-1 border-y border-slate-800 bg-slate-950` + 행들 | Card(variant flat, padding none) | Card는 `rounded-3xl overflow-hidden` 고정이라 직각 푸터와 불일치 | |
| 1395~1406 | money(행) | 라벨/값 flex justify-between, 값 `font-semibold tabular-nums` (1397 white, 1402 emerald/red) | `Money` | — | tabular-nums 있음 |
| 1421~1436 | section | `h-[104px] overflow-y-auto pt-2 mt-1 border-t border-slate-800` + `text-xs font-bold text-emerald-400 uppercase` + 정규식으로 `$금액`만 emerald-400 bold(1427~1431) | 신규 `MoneyHighlightText` | — | 문장 속 금액을 정규식 하이라이트 — 돈 표기 3번째 방식 |
| 1445~1452 | section-header | `flex items-center justify-between px-4 py-3 shrink-0 bg-slate-900 border-b border-slate-800` + `<h1 text-lg font-black>` + 데드라인 `text-sm text-slate-300` | PageHeader(부적합) | 신규 `PageTitleBar`(title/rightText) | DPV 229~231 동일 패턴, MultiFreeAgentView 등과 동일(주석 1443 명시) |
| 1453~1465 | tab | `TabBar` 사용. `rightSlot` = raw 버튼 `px-4 py-1.5 rounded-lg text-sm font-black uppercase bg-indigo-600 hover:bg-indigo-500` | Button | `variant primary size sm` 형태(라운드/타이포 오버라이드) | |
| 1469~1535 | section(필터 바) | `flex-wrap gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950` 안에 입력들 | 신규 `FilterBar` | — | 아래 4행 |
| 1471~1490 | input(검색) | `relative h-[36px] bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-700 shadow-sm w-56` + Search 아이콘 abs + input `pl-9 pr-8 text-sm font-bold` + X clear | 신규 `SearchInput` | value/onChange/placeholder/clear | DPV 234~253과 **같은 구조**(배경만 slate-900 ↔ slate-950, 너비 w-56 ↔ w-48) |
| 1492~1501 | select | 네이티브 `<select h-[36px] px-3 bg-slate-900 rounded-lg border …>` 값 있으면 `border-indigo-500/50 text-indigo-400` | Dropdown | items + 활성 표시 | 같은 "활성 시 indigo-500/50" 규칙이 CheckboxFilterDropdown(DPV 77~81)에도 있음 |
| 1503~1524 | input(date) | 컨테이너 `h-[36px] bg-slate-900 rounded-lg border` + Calendar 아이콘 + `<input type=date … [color-scheme:dark] w-[124px]>` ×2 | 신규 `DateRangeInput` | from/to/min/max | 앱 전체에서 날짜 범위 입력 중복 가능성(추정) |
| 1526~1533 | button(ghost) | `h-[36px] px-3 rounded-lg text-sm font-bold text-slate-500 hover:text-white` + X12 | Button `variant="ghost"` | 높이 36 고정 오버라이드 | |
| 1538~1541 | spinner | `py-16` + `Loader2 size22 text-slate-500` | `LoadingState` | — | |
| 1543~1646 | table | 트레이드 블록: `<Table className="!rounded-none !shadow-none !border-t-0" fullHeight={false} tableStyle={{tableLayout:'auto',width:'100%'}}>` | Table | `variant="embedded"`(래퍼 스타일 제거), `columnDividers` | `!`-오버라이드 3개가 3화면 동일 |
| 1554~1559 | th | `TableHeaderCell align=left className="pl-4 border-r border-slate-800 bg-slate-950"` ×6 | TableHeaderCell | `columnDividers` | bg-slate-950 중복(thead가 이미 칠함) |
| 1584 | tr(raw) | 순수 `<tr>` — 주석(1583): TableRow hover를 원치 않아서 | TableRow | `hover={false}` | raw `<tr>` 5곳(1584, 2037, 2062 + DPV 363, 370) |
| 1585~1626 | td | `TableCell align=left className="border-r border-slate-800/30 pl-4 align-top py-2.5 [!whitespace-normal break-words]"` ×6 | TableCell | `columnDividers`, `valign="top"`, `wrap` | |
| 1588~1593, 2077~2082, 2096~2101 | 팀 링크+로고 | `flex items-center gap-2` + TeamLogoIcon(w-5) + 이름 `font-bold text-white text-sm hover:underline hover:text-indigo-400` | 신규 `TeamLink` | 약어/전체이름 변형 | 블록 탭은 `team_abbr`, 히스토리는 `team_name` |
| 1600, 1605, 1612, 1619, 1624, 2087, 2106, 1142 | empty(셀) | `<span className="text-slate-600 text-sm">없음</span>` ×8 | 신규 `EmptyDash` | — | 8곳 동일 문구/클래스 |
| 1629~1640 | button | 제안하기: `px-3 py-1 rounded-md text-sm font-black` emerald-600 / 비활성 `bg-slate-800 text-slate-600` | Button | variant brand size xs(라운드 md 오버라이드) | |
| 1657~1662 | empty | `text-sm text-slate-500 ko-normal py-8 text-center` ×2 | `EmptyState` | — | 1998, 2000~2002과 동일 클래스 |
| 1687~1692 | section-header(팀색 아님) | `h-16 flex items-center gap-3 pl-4 text-base font-bold uppercase bg-slate-800 text-white` + 로고 w-9 | 신규 `TeamPanelHeader` | — | 1712~1733도 동일 높이 |
| 1693~1703, 1734~1751 | table(raw) | 래퍼 `flex-1 min-h-0 overflow-y-auto custom-scrollbar` + `<table w-full table-fixed border-collapse>` + PlayerTableCols + PlayerListHeader + `<tbody>` | Table | 위 compact 지원 시 | 두 블록 구조 동일(내 팀/상대 팀) |
| 1714~1732 | select | 상대 팀 선택: 네이티브 `<select bg-transparent text-base font-bold uppercase style color:inherit>` + 변경 시 `window.confirm` | Dropdown | 팀색 헤더 위 transparent 트리거 | `window.confirm` 직접 사용(공용 확인 모달 대안 있을 수 있음 — 미확인) |
| 1771~1779 | section-header(아코디언) | `w-full flex justify-between px-4 py-4 text-sm font-black text-white uppercase hover:bg-white/[0.03]` + `ChevronDown ‑rotate-90` | 신규 `AccordionHeader` | open/onToggle/title | 1880~1886과 클래스 100% 동일(14줄) |
| 1784~1857 | player-row(카트) | 팀색 헤더 span + 선수 행(이름 `text-white font-bold truncate` + `formatMoney` tabular) + 합계(`border-t border-slate-700/60`) | 신규 `TradeAssetList` | team, ids, showMoney | 내 팀/상대 팀 **37줄씩 거의 복붙**(1784~1820 / 1821~1857) |
| 1866~1868 | overlay | 하단 그라디언트 `absolute h-10 bg-gradient-to-t from-slate-900/60` | — | — | 스크롤 유무 측정용 ref+resize 리스너(903~911) |
| 1877~1915 | section(아코디언) | 재정 변동: 실행 전/후/차이 + capRoomRows | `AccordionHeader` + `Money` | — | 1889~1902는 `capDifference<=0 → emerald`(**부호 규칙이 다른 곳과 반대**) |
| 1927~1933 | 알림 | `text-sm text-fuchsia-400 · msg` | `InlineNotice` | — | |
| 1938~1943 | input(textarea) | `w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none ko-normal` | 신규 `Textarea` | — | MyTradeBlockModal 340과 **클래스 완전 동일** |
| 1945~1953 | button(전송) | `w-full … px-4 py-2.5 rounded-lg text-sm font-black uppercase`, 상태 3종(성공 emerald-600 / 기한경과 / 기본 indigo-600 disabled:opacity-40) | Button | `fullWidth`, 상태별 variant 스위치 | |
| 1964~2013 | layout(좌30%/우70%) | `w-[30%] border-r` + `flex-1 p-10` | — | — | 구분선 `border-r border-slate-800`(1966) |
| 1967~1988 | segment/filter | 체크박스 5개: `w-4 h-4 rounded border` + Check size10 + 라벨 `text-sm font-bold` (checked white/ else slate-400) | 신규 `CheckboxItem` | — | 마크업이 DPV CheckboxFilterDropdown 내부(102~107, 116~121)와 동일 |
| 1989~1995 | th(div grid) | 같은 `INBOX_ROW_GRID`로 헤더 5칸 `text-sm font-black uppercase text-slate-500` | TableHeaderCell | — | 헤더·행이 같은 grid 문자열 공유(어긋남 방지 목적) |
| 1997~2010 | empty | `py-8 text-center px-4 text-slate-500` ×3, 우측 `text-slate-600` 중앙 | `EmptyState` | — | 같은 의미인데 slate-500/600 혼재 |
| 2022~2034 | th | 히스토리 헤더 7칸 `border-r border-slate-800` (마지막만 제외) | TableHeaderCell | `columnDividers` | |
| 2036~2041 | empty(table) | `<TableCell colSpan=8 className="text-center text-slate-500 text-sm py-10">` | `TableEmptyRow` | colSpan, message | DPV 363~367과 동일 클래스 |
| 2053 | zebra | `tradeIdx % 2 === 1 ? 'bg-slate-950/40'` | Table | `zebra`/`rowGroup` prop | rowSpan 그룹 단위 zebra |
| 2064~2110 | td(rowSpan) | `rowSpan` 병합 셀 + 개별 셀 `border-r border-slate-800/30` | TableCell | — | |
| 2090, 2109 | money | `formatMoneyFull(salary)` `text-right text-sm text-slate-300 whitespace-nowrap`, 계약 없으면 `'-'`, 빈 칸 `''` | `Money` | — | **같은 선수 연봉을 PlayerChip(229)은 축약 `$51.4M`, 여기는 전체 `$51,400,000`** |
| 864~885 | player-row(히스토리) | `renderHistoryPlayerCell`: HoverCard > `inline-flex gap-1.5 text-slate-300 text-sm hover:underline hover:text-indigo-400` + InjuryStatusBadge | `PlayerNameCell` | — | OVR 없음, 이름 slate-300 |
| 840~859 | player-row(칩 나열) | `renderPlayerList`: 이름만 `text-slate-300 text-sm`, `, ` 구분 | `PlayerNameCell` | — | 부상 배지 없음(히스토리 셀엔 있음) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 선수 이름 클릭→상세 이동(span+`navigate(.../player/${getPlayerUrlId(id)})`+hover:underline indigo-400) | 849~853, 869~873, 1157~1162, 1801~1806, 1838~1843 (5곳) | 5+5+6+6+6 = 28 |
| 팀색 배경 팀명 헤더(`backgroundColor: color_primary`, `getReadableTextColor`) | 1132~1138, 1786~1792, 1823~1829 | 7+7+7 = 21 |
| 카트 선수 리스트(내 팀/상대 팀 복붙) | 1784~1820, 1821~1857 | 37+37 = 74 |
| 캡 여유분 행(라벨+부호색 값) | 1226~1231, 1400~1405, 1904~1909, 1889~1902 | 6+6+6+14 = 32 |
| 아코디언 헤더 버튼 | 1773~1779, 1880~1886 | 7+7 = 14 |
| 처리 버튼(수락/거절/취소) | 1257~1260, 1263~1266, 1269~1272 | 12 |
| 로더 | 1043~1047, 1538~1541 | 5+4 = 9 |
| `없음` 셀 | 1142, 1600, 1605, 1612, 1619, 1624, 2087, 2106 | 8 |
| 빈 상태 문단(`py-8 text-center` 계열) | 1659, 1661, 1998, 2000~2002, 2009, 2038~2040 | 1+1+1+3+1+3 = 10 |
| `border-r border-slate-800` th / `/30` td 구분선 | th: 1554~1559(6), 2025~2031(7) / td: 1585,1596,1603,1608,1615,1622(6), 2064,2069,2074,2086,2089,2093,2105(7) | 26곳(클래스 토큰, 줄 수 변화 없음) |
| `TeamLogoIcon` 사용 | 1191, 1198, 1329, 1333, 1587, 1690, 1713, 2076, 2095 | 9곳 + 정의 16줄(316~331) |
| `팀 이름 → roster?rteam=` 링크 | 1120, 1589, 2078, 2097 | 4곳 |

---

## views/multi/season/MyTradeBlockModal.tsx (454줄)

### 공용 컴포넌트 사용 현황
| 공용 | 사용 | 라인 |
|---|---|---|
| Modal | O (`size="lg" hideCloseButton className="!rounded-3xl"`, title/footer 미사용 — 헤더·저장 버튼을 body 안 sticky 툴바로 직접 구현) | 247~253 |
| OvrBadge | O (1곳, `!w-6 !h-6 !text-sm !shadow-none shrink-0`) | 240 |
| Button / Badge / Card / Table / TabBar / Dropdown / PlayerHoverCard / InjuryStatusBadge / TeamLogo | **미사용** | — |

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 230~244 | player-row(드래그) | `div draggable flex items-center gap-2.5 px-4 h-9 bg-slate-900 border-b border-slate-800/50 hover:bg-white/[0.03] cursor-grab` + GripVertical + OvrBadge + 이름 `text-sm font-semibold text-white flex-1 truncate` + 포지션 `text-sm text-slate-500` | 신규 `PlayerNameCell` / Table 행 | 드래그 핸들 슬롯 | PlayerChip(FO)과 같은 h-9/border/OVR 배지이나 **호버카드·부상배지·이름 클릭 없음**, 포지션 색 slate-500(FO는 white) |
| 237 | divider/hover | `border-b border-slate-800/50` / `hover:bg-white/[0.03]` | TableRow | | FO 183~184와 동일 값 |
| 240 | important_ovr | `size="sm" className="!w-6 !h-6 !text-sm !shadow-none shrink-0"` | OvrBadge | `textClassName="text-sm"` | FO 204와 동일 오버라이드 |
| 247~253 | modal | `Modal size="lg" hideCloseButton className="!rounded-3xl"` | Modal(이미 사용) | `headerActions`/`closeButtonPosition="left"`, sticky 툴바 슬롯 | `Modal`의 `title`·`footer`·X를 쓰지 않고 body 안에 헤더 재구현(259~284) |
| 258~284 | section-header(툴바) | `sticky top-0 z-20 px-6 py-3 bg-slate-800 border-b border-slate-700 flex gap-4` + X 버튼 `p-1 -ml-1 rounded-full text-slate-400 hover:bg-slate-700` + `h5 text-base font-black text-slate-300 uppercase` + 저장 영역 | Modal(title/footer) | 좌측 닫기 아이콘 옵션 | Modal 자체 헤더(`px-8 py-6 text-xl`)와 크기·위치 모두 다름. 주석(258)이 "sticky"를 언급(체크리스트 258은 주석 오탐) |
| 260~265 | button(아이콘) | 닫기 X `p-1 rounded-full` | 신규 `IconButton` | | Modal의 X(`p-2 ml-4 … size24`)와 별개 |
| 269~273 | 상태 텍스트 | 저장 완료 `Check15 + text-sm text-emerald-400` | Badge(success) | | FO sendSuccess는 버튼 색 변경 방식(1949) — 성공 표시 방식 2종 |
| 274~281 | button | 업데이트: `px-4 py-2 rounded-lg text-sm font-black uppercase bg-indigo-600 … disabled:opacity-40` + Loader2/Check | Button | `variant primary isLoading icon` + 크기 오버라이드 | FO 1458 버튼과 동일 클래스 계열 |
| 290~318 | layout(2열) | `grid grid-cols-2 h-[320px]`, 좌 `border-r border-slate-800 bg-slate-950 overflow-y-auto`, DnD 영역 | — | | DnD 영역 특화 |
| 296~298, 310~312 | section-header(컬럼) | `px-4 py-2 bg-slate-950 sticky top-0 text-sm font-black uppercase border-b border-slate-800 z-10`, 색 slate-500 / emerald-500 | TableHead 계열 | | 두 개가 색만 다름(6줄) |
| 299~301, 313~315 | empty | `text-sm text-slate-600 ko-normal text-center py-6` | `EmptyState` | | FO의 빈 상태는 `py-8`·slate-500 — 간격/색 불일치 |
| 286~288 | empty | `text-sm text-slate-500 ko-normal py-8 text-center` | `EmptyState` | | FO 1659와 동일 |
| 321 | divider/section | `py-4 border-t border-slate-800 space-y-6 divide-y divide-slate-800 shrink-0 pb-6` | 신규 `FormSection` | | 섹션 구분을 `divide-y`로 처리 |
| 325, 346, 371, 403 | 섹션 제목 | `<span text-base font-bold text-white ko-normal>` ×4 | `FieldLabel` | | FO `sectionLabelClass`는 text-sm uppercase — 라벨 스타일 불일치 |
| 326~331, 347~352, 372~377, 404~409 | button | "초기화": `flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white` + RotateCcw12 ×4 | Button | `variant primary size xs` + `icon` (px/py/rounded 오버라이드) | **클래스 100% 동일 4복제 = 24줄** |
| 335~341 | input(textarea) | `w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white … focus:border-indigo-500 resize-none ko-normal` | `Textarea` | | FO 1942와 동일 |
| 333 | 텍스트 | 글자수 `text-sm text-slate-600` | — | | |
| 354~366 | segment/pill(토글) | 포지션 5개: `px-2.5 py-1 rounded-lg border text-sm font-bold`, 선택 `bg-indigo-600/30 border-indigo-500 text-white` / 비선택 `bg-slate-950 border-slate-700 text-slate-400 hover:bg-white/5` | 신규 `ToggleChip` | selected/onClick | |
| 379~398 | segment/pill(토글) | 아키타입 27개 3그룹: 같은 칩 클래스 + 그룹 라벨 `w-8 text-sm font-bold text-slate-300` | `ToggleChip` | | 칩 클래스 2곳 완전 동일(9+9=18줄) |
| 411~417 | input | 선수 검색 `w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm … focus:border-indigo-500` | `SearchInput`/`Input` | | FO 1471 검색 박스(h-36, bg-slate-900, 아이콘)와 시각 언어 다름 |
| 418~432 | dropdown(자동완성) | `absolute left-0 right-0 top-full mt-1 z-20 bg-slate-950 border border-slate-700 rounded-lg shadow-xl` + 항목 `px-3 py-1.5 hover:bg-white/5` (이름 + 포지션 `text-slate-500`) | Dropdown | children 모드 + 입력 포커스 연동(공용 Dropdown은 trigger click 토글식이라 자동완성 부적합) | 결과 행에 OVR/호버카드 없음 |
| 434~445 | badge/pill(제거 가능) | `px-2.5 py-1 rounded-lg border border-indigo-500 bg-indigo-600/30 text-sm font-bold` + X11 | Badge(removable) | `onRemove` | ToggleChip 선택 상태와 같은 색 — DPV stat 필터 pill(329)은 `rounded-full indigo-900/30` 다른 색 |
| 439 | button | 칩 X 제거 `text-white/70 hover:text-white` | | | |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| "초기화" 버튼 | 326~331, 347~352, 372~377, 404~409 | 24 |
| 토글 칩 버튼 | 356~364, 385~393 | 18 |
| 섹션 제목 + 초기화 헤더 행(`flex items-center gap-2 mb-4`) | 324~332, 345~353, 370~378, 402~410 | 9+9+9+9 = 36 (제목 span 포함) |
| 컬럼 sticky 헤더 | 296~298, 310~312 | 6 |
| 빈 상태 문단 | 287, 300, 314 | 3 |
| 폼 컨트롤 클래스 `bg-slate-950 border border-slate-700 rounded-lg … focus:border-indigo-500` | 340, 416 (+FO 1942) | 클래스 3곳 |

---

## views/multi/season/MultiDraftPoolView.tsx (464줄)

### 공용 컴포넌트 사용 현황
| 공용 | 사용 | 라인 |
|---|---|---|
| Table/TableHead/TableBody/TableHeaderCell/TableCell | O (1곳; TableCell `variant="attribute" colorScale mono={false}` 사용 392~397; TableRow 미사용) | 341~403 |
| Dropdown | O (2곳, `items` 모드, trigger는 raw `<button>`) | 275~290, 293~307 |
| OvrBadge | O (1곳, `!w-7 !h-7 !text-xs !shadow-none`) | 386 |
| PlayerHoverCard | O (1곳, `teamAbbr` 미전달) | 372~379 |
| Button / Badge / Card / TabBar / PageHeader / Modal / TeamLogo / InjuryStatusBadge | **미사용** | — |

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 50~130 | dropdown(체크박스 멀티셀렉트) | 로컬 `CheckboxFilterDropdown`: 버튼 `h-[36px] px-3 bg-slate-950 rounded-lg border` + 카운트 pill + 패널 `fixed w-48 bg-slate-900 border rounded-xl z-[101]` + 전체선택 + 옵션 체크박스 | Dropdown(children 모드) 위에 **공용 `CheckboxFilterDropdown`으로 승격** | label/options/selected/onToggle/onToggleAll | **MultiFreeAgentView.tsx:74~와 동일**(diff 확인: 비교 79줄 완전 일치; 주석 문구만 상이). 바깥 클릭 오버레이 `fixed inset-0 z-[100]`(92)도 복제 |
| 85 | pill | 선택 개수 `bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full` | Badge | `variant brand` 솔리드형 신규 필요(Badge는 `bg-*-500/10` 투명형) | |
| 92, 94 | overlay/z-index | `fixed inset-0 z-[100]` 투명 오버레이 + 패널 z-[101] | Dropdown(portal z-9999) | | 자체 포지셔닝 `right` 앵커(`rect.right`) |
| 98~121 | 체크박스 행 | `flex gap-3 px-3 py-2 rounded-lg hover:bg-slate-800` + `w-4 h-4 rounded border` + Check10 | 신규 `CheckboxItem` | | FO 1981~1983과 동일 체크박스 마크업 |
| 109 | divider | `h-px bg-slate-800 mx-2 my-1` | | | 구분선 표현 방식 또 다름(border-t 아닌 h-px div) |
| 177~196 | pagination 로직 | state+`getPageNumbers()`(≤7쪽 전체, 아니면 1…좌우2…마지막) | 신규 `usePagination` | | LeaderboardView·MultiFreeAgentView에도 `getPageNumbers`(grep 확인) → 3화면 복제 |
| 222 | spinner | `min-h-screen` + `Loader2 size28 text-indigo-400` | `LoadingState` | | 색 indigo-400 (FO는 slate-500) |
| 229~231 | section-header | `flex flex-col shrink-0 bg-slate-900 border-b border-slate-800` > `px-4 py-3` `<h1 text-lg font-black text-white ko-tight truncate>` | `PageTitleBar` | | FO 1445~1452와 동일 |
| 234~253 | input(검색) | `relative h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 shadow-sm w-48` + Search + `pl-9 pr-3 text-sm font-bold` + X | `SearchInput` | | FO 1471~1490과 구조 동일(배경 slate-950 vs 900) |
| 270~320 | input+dropdown 복합 | `flex h-[36px] bg-slate-950 rounded-lg border`: Filter 아이콘 칸(`border-r`) + Dropdown(능력치) + Dropdown(연산자) + number input + Plus 버튼(`border-l hover:bg-indigo-600/20`) | 신규 `StatFilterBuilder` | | 외곽 컨테이너 `h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 shadow-sm` 3번째 변형 |
| 277, 295 | button(trigger) | `h-[36px] px-3 text-sm font-bold text-white|indigo-400` raw `<button>` | Dropdown trigger(공용 `DropdownButton`은 `bg-slate-900 border` 자체 스타일이라 불일치) | | |
| 309~316 | input(number) | `h-full bg-transparent px-3 w-16 text-sm font-bold [&::-webkit-inner-spin-button]:appearance-none` | `Input` | | |
| 324~337 | pill(제거 가능) | `px-3 py-1 bg-indigo-900/30 border border-indigo-500/30 rounded-full text-sm font-bold text-indigo-300` + X12 | Badge(removable, brand) | Badge는 text-[10px]·uppercase·`bg-indigo-500/10` → 크기/색 불일치 | MyTradeBlock 434~445 칩(rounded-lg, indigo-600/30)과 색·라운드 상이 |
| 334 | button(link) | `text-sm font-bold text-slate-500 hover:text-red-400 underline` 모두 제거 | Button ghost | | |
| 341 | table | `<Table className="!rounded-none !border-x-0 !border-t-0" fullHeight tableStyle={{tableLayout:'auto',width:'100%'}}>` | Table | `variant="embedded"` | FO 1543과 `!`-오버라이드 조합이 약간 다름(`!shadow-none` 있음/없음) |
| 342 | sticky/z-index | `TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow` | TableHead | 클래스 삭제 | 기본값과 중복 |
| 344~358 | th | `TableHeaderCell … border-r border-slate-800 bg-slate-950` ×6 + attr 컬럼 21개 map(353) | TableHeaderCell | `columnDividers` | **정렬 없음**(고정 OVR 내림차순) — FO PlayerChip은 정렬 있음 |
| 363~367 | empty(table) | `<tr><TableCell colSpan={6+ATTR_ITEMS.length} className="text-center text-slate-500 text-sm py-10">` | `TableEmptyRow` | | FO 2036~2041과 동일 |
| 370 | tr(raw) | 순수 `<tr>` → **행 호버 없음** | TableRow | `hover` | FO PlayerChip은 호버 있음, DPV는 호버 없음 |
| 371~380 | player-row(이름) | `TableCell pl-4 py-2` > PlayerHoverCard > 이름 `text-slate-200 text-sm font-semibold hover:underline hover:text-indigo-400 whitespace-nowrap`, navigate | `PlayerNameCell` | | OVR 배지는 이름 **뒤쪽** 별도 컬럼(385), FO·MTB는 이름 앞. 이름색 slate-200(FO white, 히스토리 slate-300) |
| 381~384 | td | 포지션/나이/키/몸무게 `text-sm text-slate-400 center` (단위 없음) | TableCell | | DPM은 `cm`/`kg` 단위 표기(200~201) |
| 385~387 | player-row(OVR) | `<div flex justify-center><OvrBadge sm !w-7 !h-7 !text-xs !shadow-none/>` | Table `variant="ovr"` | `size` prop | OVR 배지 28px/12px — FO·MTB 24px/14px와 크기 불일치. 정렬은 가운데 |
| 388~398 | td(능력치) | `variant="attribute" colorScale mono={false}` + `font-semibold … text-sm` | TableCell(이미 사용) | | `Table.getAttrColor` 4단계(90/80/70)이라 PlayerHoverCard의 9단계 `utils/attrRatingColor.getAttrColor`와 다른 색 체계(utils 주석이 "의도적"이라고 명시) |
| 406~458 | pagination UI | `relative flex px-6 py-3 bg-slate-950 border-t border-slate-800 z-50` + 좌: 총N명 `w-48 text-sm font-bold text-slate-500`, 중앙 absolute: 이전/숫자/다음, 우: 페이지 당 select | 신규 `Pagination` | page/total/pageSize/onChange | LeaderboardView·MultiFreeAgentView 동일 주석("동일 구조") |
| 413~420, 437~444 | button(아이콘) | `p-1.5 text-indigo-400 hover:bg-slate-800 hover:text-indigo-300 rounded-lg disabled:opacity-30` | `IconButton` | | |
| 424~435 | segment(페이지 번호) | `w-7 h-7 text-sm font-bold rounded-lg`, 선택 `bg-indigo-600 text-white` | `Pagination` | | |
| 448~456 | select | 네이티브 `bg-slate-800 border border-slate-700 text-slate-300 text-sm font-bold rounded-lg px-2 py-1.5` | Dropdown | | 앱 내 select 스타일 3종(FO 1495 slate-900 36px / FO 1728 transparent / 여기 slate-800) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| CheckboxFilterDropdown 정의(FA 뷰와 중복) | 50~130(주석 포함) | 81 |
| 페이지네이션(state+로직+푸터) | 177~196, 406~458 | 20+53 = 73 |
| 필터 컨트롤 컨테이너 `h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 shadow-sm` | 234, 270, (버튼 75~81) | 3곳 |
| border-r 컬럼 구분선 | th 344~349(6)+353(1), td 371,381~385(5),392 | 14곳 |
| 중복 클래스 `p-1.5 text-indigo-400 hover:bg-slate-800 …` | 416, 440 | 2곳 |

---

## components/multi/DraftPoolModal.tsx (217줄)

호출부: `components/multi/DraftPoolSettings.tsx:279` 1곳(세션 설정 → 드래프트 풀 미리보기). 이 화면의 형제 `MultiDraftPoolView`와 **같은 데이터를 다른 UI로** 보여주는 중복 화면.

### 공용 컴포넌트 사용 현황
| 공용 | 사용 | 라인 |
|---|---|---|
| OvrBadge | O (기본 sm, 오버라이드 없음) | 194 |
| Modal | **미사용**(`fixed inset-0 z-50 bg-black/70` 직접 구현) | 96~214 |
| Table / Button / Badge / Dropdown / TabBar / PlayerHoverCard / InjuryStatusBadge | **미사용** | — |

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 28~33 | 색상 함수 | `getStatColor`: 90 fuchsia-400 / 80 emerald-400 / 70 amber-400 / else slate-500 | Table.tsx `getAttrColor` (내부 const, 미export) | `export`로 승격 | **Table.tsx 65~70과 값까지 동일** + TacticalHalfCourt.tsx에도 같은 이름 함수(grep) |
| 96~101 | modal(셸) | `fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4`, 패널 `bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl flex flex-col max-h-[85vh]`, 바깥 클릭 `e.target===e.currentTarget` | Modal | `size="lg"`(max-w-4xl 일치), `rounded="rounded-2xl"`, `backdropClass="bg-black/70"`, `title` | 포털/body 스크롤 잠금/zoom-in 애니메이션 없음. z-50 vs Modal z-[500] — 호출부(DraftPoolSettings, 상위 모달 안인지)에 따라 z 충돌 가능(추정, 미확인) |
| 102~116 | section-header(모달 헤더) | `px-5 py-4 border-b border-slate-800` + `<h2 text-sm font-black text-white ko-tight>` + 총 N명 `text-xs text-slate-500` + X16 `text-slate-500 hover:text-white` | Modal `title` | title에 ReactNode(제목+개수) | Modal 헤더는 `text-xl font-bold`, X size24 |
| 119~154 | section(필터 바) | `px-4 py-3 flex gap-3 border-b border-slate-800/60 flex-wrap` | `FilterBar` | | |
| 121~131 | input(검색) | `relative` + Search12 abs + `bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs w-40 focus:border-indigo-500` | `SearchInput` | | **검색 박스 3번째 변형**(FO/DPV는 h-36·slate-900/950·text-sm) |
| 133~149 | segment | 포지션 All/PG…C: `px-2 py-1 rounded-md text-xs font-bold`, 선택 시 **포지션별 인라인 배경색**(`POS_COLORS`: #6366f1 등, All=#4f46e5) / 비선택 `bg-slate-800 text-slate-500` | 신규 `SegmentControl` | 항목별 색 옵션 | 다중선택(체크박스 드롭다운)인 DPV와 달리 **단일선택 segment** — 같은 필터 의도에 UI가 다름. POS_COLORS는 이 파일만 사용 |
| 151~153 | 텍스트 | 필터 결과 수 `text-xs text-slate-500 ml-auto` | | | 필터가 걸렸을 때만 표시 |
| 157~173 | th(div grid) | `grid grid-cols-[2.75rem_2rem_0.6fr_1fr_2rem_2.75rem_2.75rem_2rem×6] gap-2 text-[10px] font-bold text-slate-500 border-b border-slate-800/60` | TableHeaderCell | | `text-[10px]`, uppercase/tracking 없음 — Table 헤더(text-xs black uppercase tracking-widest)와 다름. 동일 13열 그리드 문자열이 191행에도 복제(헤더·행 폭 일치용) |
| 162~164 | th(정렬) | 나이만 정렬 버튼: `<button onClick={()=>handleSort('age')}>` + `SortIcon`(ChevronUp/Down size11) | TableHeaderCell sortable | | **OVR 정렬 키가 정의(19, 40)돼 있으나 OVR 헤더(159)는 클릭 불가 → UI상 도달 불가** |
| 88~93 | 정렬 아이콘 | `SortIcon` 로컬 컴포넌트(ChevronUp/Down inline) | TableHeaderCell | | FO는 ArrowUp/Down 사용 — 정렬 아이콘 종류가 3종(Chevron/Arrow ×2 위치) |
| 177~180 | spinner | `py-16` + `Loader2 size20 text-indigo-400` | `LoadingState` | | |
| 181~184 | empty | `py-16` 가운데 `text-sm text-slate-500 ko-normal` ("…없습니다" — 마침표 없음) | `EmptyState` | | DPV 365는 마침표 있음 |
| 186~208 | player-row | `grid … px-4 py-2 gap-2 items-center border-b border-slate-800/30 hover:bg-slate-800/40`; 순서 **POS → OVR → 이름 → 아키타입 → 나이 → 키(cm) → 몸무게(kg) → INS/OUT/ATH/PLM/DEF/REB** | Table | | 이름 `text-xs text-white font-bold truncate`, 호버카드/클릭 없음, 부상 없음. 아키타입 열(`p.archetype / p.secondaryArchetype`)은 DPV에 없음(반대로 DPV에는 21개 세부 능력치) |
| 191 | row_hover/divider | `border-b border-slate-800/30 hover:bg-slate-800/40` | TableRow | | 호버색 4번째 변형(slate-800/40) |
| 194 | OVR | `<OvrBadge value={p.ovr} size="sm"/>` (오버라이드 없음) | OvrBadge | | 같은 sm이지만 폰트 `text-[10px]`(FO·MTB는 `!text-sm`, DPV `!text-xs`) |
| 202~207 | td(능력치) | 6개 카테고리 `text-xs font-bold text-center ${getStatColor}` | Table `variant="attribute" colorScale` | | |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 13열 grid 템플릿 문자열(헤더·행) | 157, 191 | 2곳(문자열 동일) |
| 모달 헤더+셸 | 96~116, 213~216 | 21+4 = 25 |
| 필터바(검색+segment+개수) | 119~154 | 36 |
| 리스트 헤더 13칸 | 157~173 | 17 |
| 행 | 189~208 | 20 |
| getStatColor | 28~33 | 6 |

---

## 화면군 종합

### 불일치 대조표
| 항목 | MultiFrontOfficeView | MyTradeBlockModal | MultiDraftPoolView | DraftPoolModal |
|---|---|---|---|---|
| 선수 행 구조/순서 | 토글 → OVR → 이름(+부상) → POS → PTS/REB/AST → 연봉 → 잔여 → blocked (PlayerChip, 표) | Grip → OVR → 이름 → 포지션 (div flex) | 이름 → 포지션 → 나이 → 키 → 몸무게 → OVR → 능력치 21개 (표) | POS → OVR → 이름 → 아키타입 → 나이 → 키 → 몸무게 → 6카테고리 (div grid) |
| 선수 행 보조 변형 | 칩 나열(이름만, 849), 라인형(이름+POS+Pts/Reb/Ast+연봉, 1155), 카트(이름+연봉, 1799), 히스토리(이름+부상, 864) | 검색결과(이름+포지션, 427), 선택칩(이름만, 437) | — | — |
| 이름 스타일 | 칩: `text-sm font-semibold text-white`; 나열: `text-slate-300`; 라인/카트: `text-white font-bold`; 히스토리: `text-slate-300` | `text-sm font-semibold text-white` | `text-slate-200 text-sm font-semibold` | `text-xs text-white font-bold` |
| 이름 클릭 → 상세 | 칩 **X**, 나머지 5곳 O | X | O | X |
| 이름 hover 색 | `hover:underline hover:text-indigo-400` (5곳) | — | 동일 | — |
| PlayerHoverCard | O (`teamAbbr` 전달) | X | O (`teamAbbr` 미전달) | X |
| InjuryStatusBadge | O (칩·히스토리 2곳; 라인/카트/나열엔 없음) | X | X | X |
| OvrBadge 오버라이드 | `!w-6 !h-6 !text-sm !shadow-none` | 동일 | `!w-7 !h-7 !text-xs !shadow-none` | 없음(기본 text-[10px]) |
| 포지션 표시 | 칩: `text-white center`; 라인: `w-8` white | `text-slate-500` | `text-slate-400` center | `text-xs font-bold text-slate-300` |
| 행 높이/패딩 | `h-9` / 표 py-2 | `h-9 px-4` | TableCell `py-2` | `px-4 py-2` |
| 행 구분선 | `border-slate-800/50` | `/50` | TableCell 기본 `/50` + 열 `border-r /30` | `/30` |
| 행 hover | `white/[0.03]`(칩), `white/5`(인박스·블록 없음/raw tr은 없음) | `white/[0.03]` | **없음**(raw tr) | `slate-800/40` |
| 열 헤더 | 칩 `h-7 text-sm font-black uppercase`; 블록·히스토리 `h-10 text-sm font-black uppercase` | `text-sm font-black uppercase`(div) | `h-10 text-sm font-black uppercase` | `text-[10px] font-bold` 비uppercase |
| 정렬 UI | PlayerListHeader: ArrowUp/Down inline | — | 없음 | ChevronUp/Down(나이만) |
| 상태 표시(PENDING/ACCEPTED…) | 목록: 무색 텍스트(`STATUS_LABEL`) 또는 남은시간; 상세: 색 문단 4종(emerald/red/slate-300×2), invalidated 미처리; 안읽음 빨간 점 | — | — | — |
| 버튼 스타일 | 전부 raw: indigo `px-4 py-1.5 rounded-lg text-sm font-black uppercase`; emerald/red/slate `px-4 py-2 rounded-lg text-sm font-bold`; 제안하기 `px-3 py-1 rounded-md` | indigo `px-4 py-2 … uppercase`, 초기화 `px-2 py-0.5 rounded-md font-bold` | raw 아이콘/링크 | raw 아이콘 |
| 모달 | Modal(MyTradeBlockModal) | Modal+hideCloseButton+sticky 툴바 재구현 | — | 완전 직접(`fixed z-50 bg-black/70`) |
| 로더 | `Loader2 size24/22 slate-500` | 버튼 내 15 | `size28 indigo-400 min-h-screen` | `size20 indigo-400` |
| 빈 상태 | `py-8 text-slate-500`, `py-10` 표, 우측 `slate-600` | `py-6 slate-600` / `py-8 slate-500` | `py-10 slate-500` | `py-16 slate-500` |
| 검색 인풋 | h-36 `bg-slate-900` w-56 (히스토리) | `bg-slate-950 border-slate-700 py-1.5` | h-36 `bg-slate-950` w-48 | `bg-slate-800 border-slate-700 text-xs` w-40 |
| 단일/다중 선택 필터 | select + date + 체크박스(인박스) | 칩 토글 | 체크박스 드롭다운 + 능력치 비교 필터 | 단일선택 segment |
| 숫자 색 체계 | — | — | `Table.getAttrColor` 4단계(TableCell attribute) | 로컬 `getStatColor` 4단계(값 동일 복사) |
| 단위 표기 | — | — | 키/몸무게 무단위 | `cm`/`kg` |
| 팀 로고 | 로컬 `TeamLogoIcon`(real→구→placehold) | — | — | — |
| 포지션 필터 로직 | — | — | `selectedPositions.includes(p.position)` 정확 일치 | `p.position.split('/').some(...)` 복합 포지션 처리(로직 불일치, 의도 여부 미확인) |

돈 표기(라인별, 정렬, tabular-nums) — **이 화면군에서 돈이 나오는 곳은 FrontOfficeView뿐**(MTB·DPV·DPM엔 없음):
| 라인 | 함수/형식 | 값 | 정렬 | tabular-nums | 폰트/색 | 부호·null |
|---|---|---|---|---|---|---|
| 229 | `formatMoney` 축약 `$51.4M` | 선수 연봉(칩) | right (`td pr-4 text-right`) | **없음** | `text-sm text-white` | 계약 없음 → `''` |
| 230 | 숫자 | 잔여연수 | right | 없음 | `text-sm text-white` | 없음 → `''` |
| 1168 | `formatMoneyFull` `$51,400,000` | 선수 연봉(제안서 자산 라인) | right (`w-24 text-right`) | **없음** | `text-sm text-white` | 없음 → `$0` |
| 1175 | `formatMoneyFull` | 자산 합계 | 우측(justify-between) | 없음 | `text-white`, 행 `font-bold` | |
| 1229 | `formatMoneyFull` + 수동 `+` | 캡 여유분 변화(제안서) | 우측(justify-between) | **없음** | `font-semibold` emerald-400(≥0)/red-400 | `value>=0`이면 `+`, 0이면 `+$0` |
| 1397 | `formatMoneyFull` | 샐러리 총합(푸터) | 우측 | 있음 | `font-semibold` white | |
| 1402~1403 | `formatMoneyFull` + 수동 `+` | 캡 여유분(푸터) | 우측 | 있음 | `font-semibold` emerald/red | ≥0 `+` |
| 1808, 1845 | `formatMoney` 축약 | 카트 선수 연봉 | 우측(`shrink-0`) | 있음 | `text-white` | `capEnabled`일 때만 |
| 1815, 1852 | `formatMoney` 축약 | 카트 합계(2명 이상) | 우측 | 있음 | `font-semibold` white | |
| 1891, 1895 | `formatMoneyFull` | 실행 전/후 페이롤 | 우측 | 있음 | `font-semibold` white | |
| 1899~1900 | `formatMoneyFull` + 수동 `+` | 페이롤 차이 | 우측 | 있음 | **`capDifference <= 0 → emerald`(지출 감소=좋음), 증가=red** | `>0`이면 `+`, 0은 `$0` |
| 1906~1907 | `formatMoneyFull` + 수동 `+` | 실행 후 캡 여유분 | 우측 | 있음 | emerald(≥0)/red | ≥0 `+` |
| 2090, 2109 | `formatMoneyFull` | 선수 연봉(히스토리) | right (`text-right pr-4`) | **없음** | `text-sm text-slate-300 whitespace-nowrap` | 계약 없음 → `-`, 빈 칸 `''` |
| 1239, 1930 | 문자열(`formatSalaryMatchMessage`) | 샐러리 매칭 경고 문장 | — | — | fuchsia-400 | 서비스에서 포맷 |
| 1427~1431 | 정규식 `\$[\d,]+(\.\d+)?[MK]?` 하이라이트 | 구간 설명 문장 속 금액 | — | — | emerald-400 bold | |

요약: ① 같은 "선수 연봉"이 3곳에서 축약(229, 1808)·전체(1168, 2090/2109) 두 포맷, ② tabular-nums 적용 8곳 / 미적용 6곳(229, 1168, 1175, 1229, 2090, 2109)이며 같은 종류 행(1229 vs 1402)도 불일치, ③ 부호 규칙(emerald=좋음)이 `value>=0`(여유분)과 `capDifference<=0`(차이)로 반대 방향이 한 화면에 공존, ④ `+` 접두사 수동 삼항이 5곳 복제(1229, 1403, 1900, 1907), ⑤ 정렬은 전부 우측이나 정렬을 맡는 클래스가 `text-right`/`justify-between`/`w-24 text-right` 3종.

### 통합 후보(효과 큰 순)
| # | 후보 | 대상 라인 | 제거되는 줄 수(센 값) | 선행 조건 |
|---|---|---|---|---|
| 1 | **CheckboxFilterDropdown 공용화** (`components/common/CheckboxFilterDropdown.tsx`) | DPV 50~130 | 이 화면 81줄 제거 + MultiFreeAgentView 74~(동일 79줄 추정) → 총 약 160줄 제거, 신규 공용 약 80줄 | FA 뷰와 완전 동일함은 diff로 확인. 공용화 시 FO 인박스 체크박스(1972~1988 약 17줄)·NewsFeed/Leaderboard 유사 복사본도 `CheckboxItem` 공유 가능(해당 두 파일은 이번에 미감사 — 추정) |
| 2 | **Pagination 공용화** (`Pagination` + `usePagination`) | DPV 177~196, 406~458 | 73줄 (LeaderboardView·FA 뷰에도 동일 → 3화면 합산 약 200줄 추정) | 3화면 페이지당 옵션 [25,50,75,100] 동일 확인 필요(FA·Leaderboard 미정독 — 추정) |
| 3 | **카트 리스트/제안서 자산 열 통합** (`TradeAssetList`) | FO 1784~1857(74줄), 1127~1178(52줄) | 74 → 약 40줄 = 순 34줄 + 팀색 헤더 3곳 21줄 → 컴포넌트 1개 | 선수 라인의 표시 필드(OVR/POS/Pts·Reb·Ast/연봉) 통일 결정 필요 |
| 4 | **PlayerChip/PlayerListHeader/PlayerTableCols → Table 확장** | FO 133~154(22), 164~236(73), 275~310(36), 1693~1703, 1734~1751 | 약 131줄 중 순감소 약 60줄(추정) | Table에 `density="compact"`, `colWidths`, `rowHover` on/off, 행 `disabled/blocked` 상태, 정렬 헤더 compact 지원 필요 |
| 5 | **DraftPoolModal → 공용 Modal + Table** | DPM 96~116(21), 213~216(4), 157~173(17), 186~208(23) | Modal 셸 25줄 + 그리드 헤더/행을 Table로 치환(순감소 약 15줄 추정) = 약 40줄 | Modal `rounded`/`backdropClass` 이미 존재. 선행: z-index 충돌 확인(DraftPoolSettings 상위가 모달인지), OVR 정렬 키 처리 결정 |
| 6 | **getStatColor 제거 → Table getAttrColor export** | DPM 28~33 | 6줄(+TacticalHalfCourt 동명 함수는 미확인) | `Table.tsx`의 `getAttrColor` export |
| 7 | **TeamLogo `source="real"`** (TeamLogoIcon 삭제) | FO 316~331 + 사용 9곳 | 16줄 | TeamLogo에 real→구→placehold 3단 폴백 추가. MultiScheduleView `ScheduleTeamLogo`도 같은 패턴(grep) — 3화면 공용 |
| 8 | **Button 치환**(처리 버튼, 업데이트, 초기화 ×4, 전송, 제안하기, 필터 초기화) | FO 1257~1272(12), 1458~1463, 1527~1533, 1629~1640, 1945~1953; MTB 274~281, 326~331·347~352·372~377·404~409(24) | 클래스 문자열 약 11곳 제거(줄 수는 대부분 동일, 초기화 4개는 24줄 → 4줄 컴포넌트 사용 = 약 20줄) | Button에 `rounded-lg`/`text-sm`/non-uppercase 옵션(예: `shape="md"`, `typography`) 선행. 현재 Button 기본(rounded-2xl uppercase tracking-widest)을 그대로 쓰면 디자인 변경 |
| 9 | **ToggleChip / Badge removable / SearchInput / Textarea** | MTB 356~364+385~393(18), 434~445; DPV 234~253(20), 324~332; FO 1471~1490(20), 1938~1943(6); MTB 335~341(7) | 약 60줄 중 순감소 약 30줄(추정) | `FilterBar` 36px 컨트롤 규격 확정(검색 박스 3변형 통일 결정 필요) |
| 10 | **Table 컬럼 구분선 `columnDividers` + embedded 변형 + TableHead 기본값 중복 제거** | th: FO 1554~1559, 2025~2031, DPV 344~349·353 / td: FO 6+7, DPV 7 / `<TableHead className=…>` 3곳 / `!rounded-none …` 3곳 | 줄 수는 0, 클래스 토큰 약 46곳(th 20 + td 20 + TableHead 3 + embedded 3) 제거 | Table에 `columnDividers`, `variant="embedded"`, `TableRow hover={false}`(raw `<tr>` 5곳 해소) |
| 11 | **EmptyState / LoadingState / EmptyDash / AccordionHeader** | FO 1043~1057, 1538~1541, 1659·1661·1998·2000~2002·2009·2038~2040(10), 8곳 `없음`, 1773~1779·1880~1886(14); MTB 287·300·314; DPV 222·365; DPM 177~184 | 약 45줄 중 순감소 약 25줄(추정) | 배경색(slate-500/600 혼재) 규칙 통일 결정 |
| 12 | **`Money` 컴포넌트** (format short/full, signed, 부호색, tabular 고정) | 위 돈표기 표의 16곳 | 줄 수 감소 미미(약 10), 불일치 6건 해소가 목적 | 선수 연봉 표기 규칙(short vs full) 결정, 부호색 방향 규칙 문서화 |
| 13 | **인박스 div-grid → Table `selected` 행** | FO 1293, 1313~1338, 1989~1995 | 약 34줄 → 치환(순감소 약 10줄 추정) | `TableRow selected` prop + 클릭 행 |
| 14 | **상태 Badge화 + invalidated 처리** | FO 85~88, 1275~1283, 1309~1311 | 9줄(분기 문단) + 로직 1건 수정 | `OFFER_STATUS` 공용 맵(라벨+variant) 정의. 선행: invalidated 문구 결정 |
| 15 | 선수 이름 셀 `PlayerNameCell`(OVR+이름+부상+HoverCard+상세 이동) | FO 28줄(5곳)+207~222(16)+864~885(22); MTB 240~242; DPV 371~379 | 약 70줄 → 컴포넌트 1개(약 30줄) = 순 40줄 | 이름 색(white/slate-200/slate-300)·OVR 배지 크기·클릭 동작 통일 결정이 선행 |

### 체크리스트 대조 결과
| 파일 | 매치 수 | 반영 수 | 오탐 수 | 추가 발견 수 |
|---|---|---|---|---|
| MultiFrontOfficeView | 171 | 144 | 27 | 22 |
| MyTradeBlockModal | 36 | 35 | 1 | 6 |
| MultiDraftPoolView | 53 | 52 | 1 | 6 |
| DraftPoolModal | 15 | 14 | 1 | 4 |
| **합계** | **275** | **245** | **30** | **38** |

#### 오탐 상세(30건)
- MultiFrontOfficeView 27건
  - `table_raw` 119, 121, 156, 157: 주석 안의 `<table>` 언급.
  - `empty_state` 610, 660, 694, 744, 783, 1082, 1204, 1219, 1302, 1320, 1963: 주석 속 "없음". 1002, 1003, 1004, 1005: 에러 메시지 문자열("…없습니다") — 빈 상태 UI 아님.
  - `sticky` 1767, 1971: 주석.
  - `row_hover` 1318: 주석.
  - `ovr_calc` 250, 680(×2), 731(×2): 정렬 로직의 `calculatePlayerOvr` — UI 조각 아님(단, 호출 위치 204는 반영).
- MyTradeBlockModal 1건: `sticky` 258(주석).
- MultiDraftPoolView 1건: `ovr_calc` 152(정렬 변환, UI 아님).
- DraftPoolModal 1건: `badge_inline` 157(배지가 아니라 div-grid 헤더의 `text-[10px] font-bold` 타이포 — 헤더 항목으로 반영).

#### 체크리스트 반영 위치(역할별 → 이 문서의 표 행)
- `button_raw`: FO 189(원형 +/−), 1257/1263/1269(처리 버튼), 1458(TabBar 슬롯), 1483(검색 X), 1527(필터 초기화), 1629(제안하기), 1773/1880(아코디언), 1945(전송); MTB 260(닫기 X), 274(업데이트), 326/347/372/404(초기화), 356/385(칩), 422(자동완성), 439(칩 X); DPV 74(체크 드롭다운), 246(검색 X), 277/295(트리거), 317(+), 331/334(필터 칩), 413/424/437(페이지); DPM 110(X), 136(포지션), 162(나이 정렬).
- `card_box`: FO 1471, 1503(필터 컨테이너), 1942(textarea); MTB 340, 416, 420; DPV 94, 234, 270; DPM 100.
- `divider_*` / `divider_v`: FO 183~2109 전부(구분선 종류 표·패턴 표), MTB 237/259/292/296/310/321, DPV 229/271/274/292/344~392/407, DPM 103/119/157/191.
- `empty_state`(실제 15건 FO + DPV 365 + DPM 183): "없음" 셀 8곳, 빈 문단 패턴.
- `important_ovr`: FO 204, MTB 240, DPV 386 → OvrBadge `textClassName` 대체.
- `input_raw`: FO 1475/1507/1516, MTB 412, DPV 238/309, DPM 123.
- `logo_fallback` 323/324, `placehold` 327: TeamLogoIcon.
- `money_full`/`money_short`/`tabular`: 돈 표기 표 전부(229, 1168, 1175, 1229, 1397, 1402~1403, 1808, 1815, 1845, 1852, 1891, 1895, 1899~1900, 1906~1907, 2090, 2109).
- `overlay_fixed`/`zindex`: DPV 92/94/342/407, DPM 97, FO 291/1552/1967/2023, MTB 259/296/310/420.
- `pill_rounded`: DPV 85, 329.
- `row_hover`: FO 184, 1270, 1321, 1775, 1882; MTB 237, 262, 360, 389, 425; DPV 100, 114, 416, 430, 440; DPM 191.
- `select_raw`: FO 1492, 1714; DPV 448.
- `spinner`: FO 1045, 1259, 1540; MTB 279; DPV 222; DPM 179.
- `sticky`: FO 291, 1552, 1967, 2023; MTB 259, 296, 310; DPV 342.
- `table_raw`: FO 1694, 1735.
- `td_raw`/`th_raw`: FO PlayerChip/PlayerListHeader 187~233, 293~306.

#### 추가 발견(체크리스트에 없던 항목, 38건)
FrontOfficeView(22)
1. 177~236: PlayerChip 이름만 클릭 시 선수 상세 이동 없음(다른 5곳 모두 navigate).
2. 212~218과 875~881: InjuryStatusBadge props(size16/iconSize12/strokeWidth4) 동일 2곳 복제 + `formatPlayerActiveInjuryLabel` 호출.
3. 85~88·1275~1283·110~114: `invalidated` 상태가 라벨은 있으나 상세 문구·필터 버킷이 없음(표시 누락 가능, 로직 확인 필요).
4. 1309~1311 vs 1275~1283: 상태 표현 방식이 목록(무색 텍스트)과 상세(색 문단)에서 다름, Badge 미사용.
5. 1324: 안읽음 점이 TabBar 배지와 별도 구현(w-1.5 vs w-3.5).
6. 1293·1313~1338·1989~1995: Table 대신 div grid로 만든 표(선택 상태 때문 — 주석 1317~1321).
7. 1049~1056: `trade_enabled=false` 빈 화면 별도 구현(ShieldAlert).
8. 1236~1250·1927~1933: 경고/실패 문구 3곳(fuchsia/red) 별도 구현, 공용 알림 컴포넌트 없음.
9. 1075 `yyyy/mm/dd`, 1307 `mm/dd`, 69 `yy/mm/dd`, 1449 `yyyy. mm. dd` — 같은 화면 날짜 포맷 4종.
10. 1598 `“…”`(타입별 따옴표) vs 1208 `"…"` — 인용 표기 불일치.
11. 1689~1692·1712~1733: 팀 패널 헤더 `h-16 bg-slate-800`(팀색 아님) vs 제안서의 팀색 헤더(`color_primary`) — 헤더 2종.
12. 1714~1732: `window.confirm` 직접 사용(공용 확인 UI 부재).
13. 1495와 DPV 77~81: "활성 필터 = `border-indigo-500/50 text-indigo-400`" 규칙이 select와 체크 드롭다운에 각각 구현.
14. 1512, 1521: `[color-scheme:dark] w-[124px]` 날짜 입력 고정폭 복제 2회.
15. 1421~1436: 안내 영역 `h-[104px]` 고정 높이 + overflow(좌우 높이 정렬 목적) — 반응형 취약(추정).
16. 1423, 1427~1431: 소제목 `text-xs … text-emerald-400`, 정규식으로 문장 속 금액을 강조.
17. 1693·1734·1966·2007 외: 스크롤 컨테이너 `overflow-y-auto custom-scrollbar` 직접 반복(Table 래퍼가 이미 스크롤).
18. 1866~1868, 903~911: 스크롤 유무 측정(ref+resize 리스너)로 그라디언트 오버레이.
19. 2053: rowSpan 그룹 zebra를 `bg-slate-950/40` 문자열로 직접.
20. 1899: 지출 증가=red / 감소=emerald (캡 여유분 행은 반대로 양수=emerald) — 의미 규칙 2종.
21. 1947~1953: 전송 버튼 상태 3종(성공/기한경과/기본)을 className 삼항으로 처리.
22. 233: `Ban` 아이콘만 있는 blocked 컬럼(툴팁/라벨 없음, 접근성 정보 부족 — 추정).

MyTradeBlockModal(6)
23. 247~253, 258~284: Modal의 title/footer/X를 쓰지 않고 body 안에 sticky 툴바로 헤더 재구현(`hideCloseButton`).
24. 269~273 vs FO 1949: 저장 성공 표시가 텍스트(`저장 완료`) vs 버튼 색 변경 — 2종.
25. 299~301·313~315 vs 286~288: 빈 상태 색/간격이 파일 내에서도 slate-600/py-6 ↔ slate-500/py-8 혼재.
26. 325·346·371·403: 섹션 제목 `text-base font-bold text-white`가 FO 제안서의 `sectionLabelClass`(text-sm uppercase)와 다름.
27. 418~432: 자동완성 결과 목록에 OVR/호버카드 없음(포지션만) — 선수 행 변형 추가.
28. 321: 섹션 구분에 `space-y-6 divide-y`와 `pt-4`를 함께 사용(간격 이중 지정, 레이아웃 의도 추정).

MultiDraftPoolView(6)
29. 370: raw `<tr>` → 행 호버 없음(FO PlayerChip은 호버 있음).
30. 372: PlayerHoverCard에 `teamAbbr` 미전달(풀 선수라 팀 없음 — 의도로 추정).
31. 385~387: OVR 컬럼이 이름 뒤에 있고 배지 크기 28px — 화면군 내 OVR 위치/크기 불일치.
32. 381~384: 키/몸무게 단위 미표기(DPM은 cm/kg).
33. 388~398: 능력치 색 체계가 Table getAttrColor 4단계 — PlayerHoverCard(9단계)와 다름(utils 주석상 의도).
34. 166 vs DPM 70: 포지션 필터 로직 불일치(정확 일치 vs `/` 분리).

DraftPoolModal(4)
35. 96~101: Modal 미사용 — 포털·스크롤 잠금·애니메이션 없음, z-50(Modal은 z-[500]).
36. 19, 40, 159: OVR 정렬 키는 있으나 헤더 클릭 불가(도달 불가 코드, `handleSort('ovr')` 호출 없음).
37. 133~149: 포지션 segment 선택색이 `POS_COLORS` 인라인 스타일(이 파일만 사용).
38. DraftPoolSettings.tsx:279 외 호출 없음: 같은 풀 데이터를 MultiDraftPoolView(표·21능력치·페이지네이션)와 DraftPoolModal(6카테고리·아키타입)이 별개 UI로 중복 제공 — 통합 시 한쪽만 유지 가능(제품 결정 필요).
