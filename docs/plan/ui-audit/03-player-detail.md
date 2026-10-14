# 03 선수 상세 — UI 조각 전수 감사

읽은 범위(전부 Read, grep 대체 없음):
- `views/PlayerDetailView.tsx`: 1~2610줄 (전부). 지시서/체크리스트의 2611은 trailing 개행 차이로 추정(실제 `wc -l`=2610, 마지막 줄 `};`까지 읽음)
- `views/multi/season/MultiPlayerDetailView.tsx`: 1~334줄 (전부)
- `views/multi/season/PlayerNewsTab.tsx`: 1~120줄 (전부)
- `views/multi/season/MultiShotChartTab.tsx`: 1~284줄 (전부)
- `views/multi/season/MultiFullCourtChart.tsx`: 1~272줄 (전부)
- 선행 정독한 공용 API(감사 대상 아님): `components/common/` 의 Table, TabBar, Button, Badge, Card, Modal, Dropdown, PageHeader, TeamLogo, OvrBadge, StarRating, InjuryStatusBadge, PlayerAwardBadges (+ TeamBadge 참조용)
- 체크리스트: `scratchpad/ui-audit/by_file/` 의 5개 파일 전부 대조

표기 규칙: `CL:` = 기계 체크리스트 라인 번호(해당 행에 반영됨), `오탐` = 체크리스트 분류가 틀렸거나 UI 조각이 아님, `[추가]` = 체크리스트에 없던 추가 발견, "추정" = 코드로 확정 못 한 판단.

## 0. 화면군 구조 요약 (먼저 알아둘 사실)

| 파일 | 역할 | 실제 렌더 위치 |
|---|---|---|
| `PlayerDetailView.tsx` | 싱글/멀티 공용 뷰 (프로필/기록/샷차트/뉴스 4탭) | 싱글 `pages/PlayerDetailPage.tsx`, 멀티 `MultiPlayerDetailView.tsx` |
| `MultiPlayerDetailView.tsx` | 데이터 조립 래퍼. 자체 UI는 로딩 스피너 1개뿐 | 라우트 `/multi/leagues/:id/season/player/:pid` |
| `PlayerNewsTab.tsx` | 뉴스 탭 본문(`newsSlot`) | PlayerDetailView의 `activeTab==='news'` |
| `MultiShotChartTab.tsx` | **import하는 곳이 없음(데드)**. grep 결과 자기 자신 + docs만 등장. 285줄 | 없음 (dev-log 47779에 "멀티 결과화면 샷차트 탭"이라 적혀 있으나 현재 미연결) |
| `MultiFullCourtChart.tsx` | **선수 상세 화면이 아님.** `MultiGamePbpView.tsx`(+`.legacy.tsx`)의 경기 라이브 풀코트 차트 | 경기 상세/PBP 화면 |

PlayerDetailView 내부에서 **공용 `Table/TableHead/TableRow/TableCell`은 라이브 코드에서 0회 사용**된다. import(14행)는 데드코드 `StatsSubTable`(578행)에서만 쓰이고, 실제 렌더되는 표 5개는 전부 raw `<table>`이다.

### 싱글/멀티 분기 지도 (PlayerDetailView)

| 라인 | 조각 | 구분 | 근거 |
|---|---|---|---|
| 1485-1519 (+1383-1384) | 계약 협상/계약 연장/방출 버튼, `hasActionButtons`, 브레드크럼 바 표시 조건 | **싱글 전용** | 멀티는 `onNegotiate/onExtension/onRelease`를 안 넘김(MultiPlayerDetailView 312-330) |
| 952-954, 2237-2240 | 내장 `usePlayerGameLog` 폴백 | **싱글 전용** | 멀티는 `externalGameLog` 주입 |
| 1430, 1468 | 드롭다운 선택 시 로컬 `setPlayer/setTeamId` 분기 | **싱글 전용** | 멀티는 `onSelectPlayer`로 navigate |
| 1545-1553 | 헤더 `TeamBadge`(실제 NBA 로고) 경로 | **싱글 전용(colorPrimary 없는 팀)** | 멀티는 `colorPrimary` 있어 1531 `<img>` 경로 |
| 1684-1701 | "부상 현황" 섹션 | **사실상 싱글 전용** | 멀티는 `forceHealthy`로 `player.health`가 항상 'Healthy'(주석 919-924). 멀티 부상은 헤더 `InjuryStatusBadge`와 "부상 이력"으로만 표시 |
| 1805-1862 | 직전 계약(`prevSalary != null`) 분기 | 공통 가능, 추정 | `prevSalary`는 dataMapper/rookieGenerator 생성 FA 필드. 멀티 FA풀에서 채워지는지 미확인 |
| 1526-1544 | 헤더 `getRealTeamLogoUrl` `<img>` + 2단 폴백 | **멀티 전용** | `currentTeam?.colorPrimary` 있을 때만 |
| 764-769, 756 | 경기 RESULT 셀 클릭 버튼 | **멀티 전용** | `onGameClick` 지정 시만 |
| 1642, 2257 | "뉴스" 탭 | **멀티 전용** | `newsSlot` 지정 시만 |
| 1982-2018 | "선수 이동 내역" | **멀티 전용** | `externalTransactionHistory` 지정 시만 |
| 2259-2603 (샷 차트 탭 전체) | 탭 자체는 싱글에도 노출, 데이터는 멀티만 | **멀티 실질 전용** | 싱글은 `externalShotEvents` 없음 → 항상 2600행 "슛 기록이 없습니다" |
| 57, 1803, 1909, 2021 | `hideSections` 3개 분기 | **양쪽 모두 미사용(데드 옵션)** | 싱글은 안 넘김, 멀티는 `HIDE_SECTIONS=[]`(MultiPlayerDetailView 49) |
| 1741 (성격 & 기분) | `saveTendencies` | 공통(양쪽 `tendencySeed` 있을 때) | 멀티는 `tendencySeed ?? undefined` |

---

## views/PlayerDetailView.tsx (2610줄)

### 공용 컴포넌트 사용 현황

| 공용 | 사용 라인 | 상태 |
|---|---|---|
| `TabBar` | 1637-1647 (`theme={theme}` 팀 컬러 모드) | 정상 사용 |
| `OvrBadge` | 1558 (`size="lg"` + `!w-10 !h-10 !text-2xl` 강제 덮어쓰기) | 사용하되 important 오버라이드 |
| `StarRating` | 1673, 1674 | 정상 |
| `InjuryStatusBadge` | 1561-1568 (size 28/iconSize 22/strokeWidth 3.5) | 정상 |
| `TeamBadge` | 1411, 1436, 1546, 1666 | 정상 (size xs/lg). 1546은 `!h-auto !w-24 !text-2xl` important 덮어쓰기 |
| `Table`/`TableHead`/`TableBody`/`TableRow`/`TableHeaderCell`/`TableCell` | 14(import), 579-607(`StatsSubTable`, 데드) | **라이브 사용 0회** |
| `Button`, `Badge`, `Card`, `Modal`, `Dropdown`, `PageHeader`, `TeamLogo`(직접) | 없음 | 미사용. 브레드크럼 드롭다운(1406-1480)·액션 버튼·어워드 필 등을 전부 직접 구현 |
| `PlayerAwardBadges`(`HeaderAwardTrophies`/`PlayerAwardList`) | 없음 | 미사용(파일 전체가 import 0). 수상 UI를 1573-1589, 1908-1980에서 자체 구현하며 이름 매핑(1916-1936)도 `AWARD_META`와 중복 |
| 로컬 `SectionHeader` | 570-575 정의, 2150/2235 사용 | 공용 아님 |
| 로컬 `ShotBreakdownTable` | 612-638 정의, 2594-2596 사용 | 공용 아님 |

### 직접 구현 UI 조각

| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 104-148 | table/th/td (**데드**) | `DefenseZoneTable`: raw table, `text-[11px]`, `tableLayout:fixed`, th `text-[9px] font-black uppercase tracking-widest`, td `font-mono tabular-nums text-[11px]`, 구분선 `border-slate-800/60`·`/40` | 삭제 | — | 렌더 호출부 없음(`DefenseZoneTable` grep 104행 1건). `DEF_ZONES`(102)도 이것만 사용. CL:105,107,109,111,117,120,122,137,138,139. 110의 `badge_inline`은 오탐(표 헤더 글자) |
| 110 | (badge_inline) | 위 th 클래스 | — | — | **오탐**: badge가 아니라 표 헤더 텍스트. CL:110(badge_inline) |
| 212 | (empty_state) | 주석 "null 없음" | — | — | **오탐**(주석). CL:212 |
| 80-99 | (데드 상수) | `TRAD_COLS`(80-89), `ADVANCED_COLS`(92-99) | 삭제 | — | `TRAD_COLS`는 151/2164 등에서 `CAREER_TRAD_COLS`에 부분일치로 잡힐 뿐 정의 외 참조 0, 실제 사용은 `CAREER_*_COLS`. [추가] 데드 |
| 553-567 | (데드 헬퍼) | `hexAlpha`/`luminance`/`getEffectiveTintColor` | 삭제 | — | 사용처가 844-858 데드 블록뿐. [추가] |
| 570-575 | section-header | 로컬 `SectionHeader`: `px-6 py-3 flex justify-between`, 제목 `text-base font-black text-white uppercase`, 우측 슬롯 `gap-2` | 신규 `SectionHeader`(공용 승격) | `title`, `children`(우측 슬롯), `className`; PageHeader와는 용도 달라 별도 | 사용처 2150(기록), 2235(최근 경기) 2곳뿐. 프로필 탭 11개 섹션 제목은 이걸 안 쓰고 `text-base font-bold` 직접 작성(아래) [추가] |
| 577-608 | table (**데드**) | `StatsSubTable`: 공용 `Table`을 `!rounded-none !border-0 !shadow-none !bg-transparent [&_tbody]:!bg-transparent`로 5중 important 덮어쓰기 | 삭제 | — | 호출부 0. CL:585,599(`border-r-slate-800/30`),601(`font-mono tabular-nums`). 이 파일 안에서 공용 Table을 쓴 유일한 흔적이며 "공용 Table이 이 화면 요구와 안 맞아 important로 뒤집어 쓰던" 증거 |
| 612-638 | table/th/td | `ShotBreakdownTable`: raw table `text-sm border-separate`, th `px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500`(+`text-right`), td `px-3 py-1.5 border-b border-slate-800/60`, 숫자 `text-right text-slate-300/white`, **tabular-nums·mono 없음** | `Table`/`TableHead`/`TableHeaderCell`/`TableRow`/`TableCell` | `Table`에 `fullHeight=false` 이미 가능. 필요: **헤더 variant(배경 slate-800 vs 현 slate-950, 소문자/uppercase 정책)**, `TableCell variant="stat"`(우정렬+tabular+mono) 사용 시 `font-bold text-slate-300`이 되어 시각 변경 | 같은 헤더 클래스 문자열이 4개 표에 복붙(617-624, 733-744, 2162-2170, 2545-2553). CL:616,619,620,621,622,628,629,630,631 |
| 681-792 | table(가상스크롤) | `VirtualGameLog`: `ROW_HEIGHT=36` 고정 높이 가상 스크롤, `contain:strict`, 첫 열 sticky | 공용 `Table`은 가상화 미지원 | **신규** `VirtualTable`(rowHeight/overscan/virtual spacer) 또는 Table에 `virtual` 옵션 | 데드 props `subHeaderStyle`·`subHeaderTextStyle`(681)는 함수 본문에서 미사용, 호출부 2242/2246이 값만 넘김 [추가]. CL(요약행은 아래 개별) |
| 713-724 | spinner | `Loader2 size 16 text-slate-500 animate-spin`, `py-8` 중앙 | 신규 `Spinner`/`LoadingState` | `size`, `tone` | 다른 두 파일은 indigo-400·size 28/22 → 3종 불일치. CL:722 |
| 725-729 | empty | `text-xs text-slate-600`, `py-8` | 신규 `EmptyState` | `message`, `height` | 같은 파일 내 빈 상태 4개 스타일(아래 패턴표). CL:727 |
| 732-744 | table/th | 가상 테이블 thead: `sticky top-0 z-40`, th `px-3 py-2 font-bold uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500 text-center`, 첫 열 `sticky left-0 z-10` | `TableHead`(sticky top-0 z-40 이미 내장), `TableHeaderCell stickyLeft` | `TableHeaderCell stickyLeft`는 `z-50 bg-slate-950`라 z-10/slate-800과 다름 | CL:732(table_raw),733(z-40,sticky),736(th_raw),738(divider_b,z-10,sticky) |
| 746-784 | td/hover | 행 `transition-colors hover:bg-white/5`, td `py-2 px-1.5 text-center border-r`(마지막 제외), 지그재그를 inline `style`(rowAltStyle)·`borderRightColor` inline | `TableRow`(hover:bg-white/5 동일), `TableCell` | `TableRow` zebra prop 필요, 열 구분선 prop | 숫자 셀 `font-medium text-white`, **tabular-nums 없음**. 스페이서 `<td style={{height, padding:0, border:'none'}}>`(748, 783) 2곳. CL:748(td_raw),753(row_hover),758(td_raw),783(td_raw) |
| 764-769 | button(링크형) | RESULT 점수 `<button className="font-medium hover:underline cursor-pointer text-emerald/red">` | `TableCell variant="player"`의 onClick 패턴과 유사 | 신규 `LinkButton` | **멀티 전용**. CL:764 |
| 809-821 | dropdown(상태/외부클릭) | `teamDropOpen/playerDropOpen` + `mousedown` 전역 리스너 8줄 | `Dropdown`(내장 outside-click) | — | [추가] 직접 구현 dropdown 로직 |
| 832, 859, 946, 1427(×2) | (ovr_calc) | `calculatePlayerOvr` 호출 | — | — | **오탐**(로직). 단 832와 1427은 "로스터를 OVR 내림차순 정렬" 동일 식 중복(로직 중복, UI 아님). CL:832(×2),859,946,1427(×2) |
| 844-858 | (데드 토큰) | `tintColor/isLight/sectionBg/subHeaderBg/rowAltBg/rowBaseBg/dividerColor/heavyDividerColor/subHeaderTextStyle/dropdownStyle` | 삭제 | — | `theme`(반응형 색)과 `getReadableTextColor` 외 전부 미참조. [추가] 데드 14줄 |
| 882, 884, 1003 | (empty_state) | 주석 | — | — | **오탐**(주석). CL:882,884,1003 |
| 1387-1521 | section/divider | 브레드크럼 바 `flex items-center gap-1 px-3 py-2 border-b border-slate-800 bg-slate-950` | — (페이지 상단 바, 대응 공용 없음) | 신규 `Breadcrumb` 또는 `PageToolbar` | CL:1390 |
| 1392-1398 | button(아이콘) | `w-7 h-7 rounded-md bg-black/30 hover:bg-black/50` + ArrowLeft | `Button variant="ghost"` 불가(rounded-2xl, px 큼) | 신규 `IconButton`(size 28, 배경 투명도) | CL:1392 |
| 1406-1448 | dropdown | 팀 드롭다운: 트리거 `button px-2.5 py-1.5 rounded-md bg-black/20` + TeamBadge + ChevronDown, 패널 `absolute w-52 max-h-72 ... z-50`, 항목 `px-3 py-2 text-sm hover:bg-slate-800`(현재 팀 `font-bold text-white`) | `Dropdown` + `DropdownButton` | `Dropdown`의 `items[].label`이 ReactNode라 TeamBadge+이름 가능, `active` 있음. 차이: 공용은 portal `fixed`·`w-64`·`max-h-80`·active 색이 indigo 톤 → 현 UI의 흰색 bold와 다름. 트리거 배경 `bg-black/20`(팀 컬러 바 위)은 `DropdownButton`(slate-900 박스)로 안 됨 → 트리거 variant 필요 | CL:1407(button_raw),1422(z-50),1424(button_raw),1434(row_hover). 패널이 `absolute`라 상위 `overflow-hidden`(1387)에 의해 클리핑될 수 있음(추정) |
| 1453-1480 | dropdown | 선수 드롭다운: `max-w-[180px]`, 항목에 `font-mono w-6 text-center text-slate-400`로 **OVR 숫자만 표시**(1473) | `Dropdown` + `OvrBadge size="sm"` | 항목 label에 OvrBadge 삽입 | 1473은 OVR을 배지 대신 raw 숫자 → 다른 화면(Table `variant="ovr"`)과 불일치. CL:1454,1462(z-50),1464,1471(row_hover),1473 |
| 1485-1519 | button | 계약 협상/계약 연장/방출: `px-3 py-1 rounded text-xs font-bold active:scale-95`, `style={{backgroundColor: theme.text, color: theme.bg}}` 3회 복붙(각 7~8줄) | `Button size="xs"` + `style` 통과 | `Button`에 `variant="theme"`(색 2개를 prop으로) 필요. 현 Button은 `rounded-2xl uppercase tracking-widest font-black` (한글 라벨에 부적합, 메모리 방침상 버튼 uppercase/tracking-widest 제거 대상) | **싱글 전용**. CL:1488,1499,1508 |
| 1524 | divider | 헤더 `border-b border-slate-800 bg-slate-900` | — | — | CL:1524 |
| 1526-1544 | logo-fallback | `<img src=getRealTeamLogoUrl>`, `onError`로 'old' 로고 → `placehold.co` **외부 URL** 2단 폴백, `self-stretch !h-auto w-24` | `TeamLogo`(폴백 1단: placehold.co 직링크) | `TeamLogo`에 `srcResolver`/real-logo 우선 + 2단 폴백 지원 | **멀티 전용 경로**. TeamLogo(공용)도 동일 placehold.co 외부 의존. CL:1537,1538,1541 |
| 1545-1553 | logo | `TeamBadge size="lg" className="self-stretch !h-auto !w-24 !text-2xl"` | `TeamBadge` | `size="xl"`(큰 헤더용) 추가 | **싱글 전용 경로**. important 3개 [추가] |
| 1558 | badge(OVR) | `OvrBadge size="lg" className="!w-10 !h-10 !text-2xl"` | `OvrBadge` | `size` 'header'(40px/text-2xl) 추가 | lg=44px와 4px 차이를 important로 보정. CL:1558 |
| 1560-1569 | badge(부상) | `InjuryStatusBadge size 28 iconSize 22 strokeWidth 3.5` | 이미 공용 | — | 정상 |
| 1573-1589 | pill + tooltip | 어워드 필 8종: `px-1.5 py-0.5 rounded text-sm font-bold ${bg 15%}` 카테고리별 색, `group-hover:block` 즉시 툴팁(`bg-slate-900 border-slate-600 rounded-lg z-50`) | `Badge`(variant 6종 neutral/brand/success/warning/danger/info, `rounded-full border uppercase text-[10px]`) | `Badge`에 `color` 커스텀(amber/yellow/blue/indigo/emerald/cyan/orange/sky) + `shape="rounded"` + `size="lg"`(text-sm), 신규 `Tooltip` | CL:1583(z-50). `PlayerAwardBadges.HeaderAwardTrophies`(이미지 트로피+카운트 칩+툴팁)와 목적 중복인데 미사용 [추가] |
| 1591-1603 | 구분자 텍스트 | `<span className="text-slate-600">|</span>` 5개로 항목 연결 | 신규 `InlineMeta`(구분자 자동) | `items[]` | [추가] 5줄. 1602 돈: 아래 돈 표 |
| 1611-1633 | table/th/td | 헤더 시즌/커리어 요약표: raw `border-collapse`, th `text-right font-normal text-slate-500 px-3 pb-1`, td `text-right text-white px-3 py-1`, 구분선 `border-slate-700`(1614,1626), **tabular-nums 없음** | `Table`(`fullHeight=false`, 외곽 border/rounded 제거 필요) | `Table` `bare` variant(테두리/배경 없음), `TableCell variant="stat"` | 헤더 지표가 우정렬인데 숫자 폭이 가변(`.toFixed(1)` 자릿수 차이) → tabular 없으면 열 흔들림. CL:1611,1614,1616,1626,1628 |
| 1637-1647 | tab | `TabBar theme={theme}` | 이미 공용 | — | 정상 |
| 1652 | 레이아웃 | `grid gridTemplateColumns:'2fr 2fr 6fr'` 고정 3열, 반응형 없음 | — | 신규 `ThreeColumnLayout` 또는 브레이크포인트 | [추가] 모바일/좁은 폭 대응 없음 |
| 1655, 1800 | divider | 열 경계 `border-r border-slate-800` | — | — | CL:1655,1800 |
| 1657-1681 | section + kv | "선수 정보": 제목 `text-base font-bold text-white mb-1.5`, 행 `flex justify-between items-center text-sm` / 라벨 `text-slate-500` / 값 `font-semibold text-slate-200 text-right` | 신규 `KeyValueRow` + `SectionHeader` | `KeyValueRow({label,value,valueClassName})` | 1666 TeamBadge, 1673/1674 StarRating 정상. 값 색: 여기 `slate-200`, 다른 섹션 `white`/`slate-300`/`slate-400` 혼재. CL:1666(공용 사용 확인) |
| 1671 | money | `formatMoneyFull(player.salary)` | 아래 돈 표 | | CL:1671 |
| 1684-1701 | section + kv | "부상 현황": `px-4 py-3 border-t border-slate-800 space-y-1`, 값 `text-white` | `KeyValueRow` | — | **싱글 전용(사실상)**. 값 폰트/라벨 크기를 행마다 `text-sm`로 따로 지정(1695-1696) vs 1676은 부모에 `text-sm`. CL:1687 |
| 1703-1724 | section + kv | "선수 유형" 아키타입/보조/특성(최대 4) | `KeyValueRow` | 라벨 빈 문자열 행(1719, `i===0?'특성':''`) | CL:1705 |
| 1726-1738 | section + kv | "인기도" 2행 | `KeyValueRow` | — | CL:1727 |
| 1740-1768 | section + kv | "성격 & 기분": 값 색 5종 인라인 분기(`text-amber/sky/emerald/red/slate`) | `KeyValueRow` + `Badge`/색 토큰 | 라벨→색 매핑 헬퍼 | CL:1742 |
| 1770-1791 | section | "스카우팅 리포트": 제목 `mb-1`(다른 섹션은 `mb-1.5`), 문장 `text-emerald/rose/white` | `SectionHeader` | 제목 간격 불일치 [추가] | CL:1773 |
| 1802-1906 | section + kv + money | 계약: 직전 계약 분기(1805-1862)와 현재 계약(1863-1904). 연도 행 `-mx-4 px-4 rounded`(**hover/배경 없이 잔존 클래스**, 1879) | `KeyValueRow` + 신규 `Money` | 현재 연도 행 강조(`emerald-400`) | 돈 표 참조. 기본 분기 CL:1818,1822(divider_t),1825,1848(**오탐** 주석),1852,1868(empty),1883,1888(divider_t),1891 |
| 1908-1980 | section + list | "수상 내역": 3열 행(시즌 `w-14` / 이름 `flex-1 text-right` / 상세 `style width:30`), 이름 매핑 `BASE_NAME`·`BASE_DETAIL`·정렬 `orderMap` 21+줄 인라인 | `PlayerAwardBadges.PlayerAwardList` (미사용 공용) | `AWARD_META`로 매핑 통일(현재 이름이 다름: 공용 'MVP' vs 여기 '올해의 선수') | 같은 시즌 연도 숨김 로직 1966-1969 [추가]. CL:1911,1914 |
| 1982-2018 | section + list | "선수 이동 내역"(날짜 `w-16`/유형 `w-16`/이동 `flex-1 text-right`), 인라인 `TX_TYPE_LABEL`, `toOrdinal` 중복(1937과 1995 동일 함수 2번 정의) | `KeyValueRow` 변형 | `toOrdinal` util로 추출 | **멀티 전용**. CL:1987,1990,1984(**오탐** 주석) |
| 2020-2051 | section + list | "부상 이력" 날짜/내용 2열 | `KeyValueRow` | — | CL:2022,2025 |
| 2058-2140 | stat-bar | "능력치" 3열: 항목 `px-4 py-4`, 라벨 `text-sm font-bold`, 바 `h-[14px] bg-slate-800` + inline gradient, 값 `schibsted-grotesk font-black text-2xl tabular-nums`, 증감 `▲/▼ font-mono tabular-nums` | 신규 `AttributeBar` | `{label,value,delta,events}` | 빈 칸 `h-[63px]` 하드코딩(2130). [추가]. tabular-nums 올바르게 쓰는 드문 사례. CL:2109,2124 |
| 2111-2121 | tooltip | 증감 호버 툴팁: `hidden group-hover:flex absolute bottom-full right-0 bg-slate-900 border-slate-600 rounded-lg z-50` | 신규 `Tooltip` | `InjuryStatusBadge`는 별도 portal 툴팁(스티키 컨텍스트 이슈로 portal화) → 3가지 툴팁 구현 | 1583과 같은 구조. sticky/overflow 안에서 잘릴 위험(추정). CL:2112 |
| 2147-2159 | section-header + select | `SectionHeader` 슬롯에 native `<select>` 2개: `pl-2.5 pr-7 py-1 text-sm font-bold rounded-md border-0 bg-black/20 hover:bg-black/40 text-white` | `Dropdown`+`DropdownButton` 또는 신규 `Select` | 신규 `Select` | 동일 클래스 문자열 2회 복붙. native `<select>`는 `<option>` 팝업이 OS 기본 스타일. CL:2151,2155 |
| 2160-2229 | table/th/td/tfoot | 커리어 표: raw `border-separate`, th `px-3 py-2 font-bold uppercase ... bg-slate-800 text-slate-500`, 첫 열 sticky `left-0 z-10`, td `px-3 py-2 border-b border-slate-800`, 서브행 `opacity-60`+inline `borderLeft`/`paddingLeft:20px`/`color:rgba(255,255,255,0.65)`, 지그재그 inline `rgba(255,255,255,0.02)`, tfoot 평균 행 inline `#0f172a`·`#334155` | `Table`+`TableHead`+`TableRow`+`TableCell`+`TableFoot` | `Table` 변형: 헤더 배경 slate-800, 첫 열 sticky 셀(`TableCell stickyLeft`는 있음), 서브행(들여쓰기) 스타일, `TableFoot`(있음, `bg-slate-950 border-t border-slate-700`) | 숫자 셀 **tabular-nums·mono 없음**(소수 1자리 열 정렬 흔들림). 인라인 hex 5곳 [추가]. CL:2161,2165(th_raw,divider_b,z-10,sticky),2194(td_raw,divider_b,z-10,sticky),2218(td_raw,z-10,sticky) |
| 2233-2253 | section + empty | "최근 경기": `SectionHeader` + 가상 테이블, 아니면 `flex items-center justify-center h-40 text-slate-500 text-sm` | `EmptyState` | — | 2236 높이 계산 래퍼 `gameLog.length*ROW_HEIGHT+ROW_HEIGHT`로 전체 높이를 늘려 **페이지 스크롤에 맡기는** 구조(가상화 이점 일부 상쇄, 추정). CL:2251 |
| 2257 | slot | `{activeTab==='news' && newsSlot}` | — | — | **멀티 전용** |
| 2277-2288 | button(텍스트) + count | 필터 요약 "N개 표시 중" + 초기화 `text-slate-400 hover:text-white underline underline-offset-2` | `Button variant="ghost" size="xs"` | `LinkButton` 필요(현 Button은 rounded-2xl 박스) | CL:2278(divider_b),2281(button_raw) |
| 2290-2453 | input(radio/checkbox) | 필터 옵션 7블록: radio 3(각 10줄)·checkbox 4(13/9/13/13줄). 클래스 `w-4 h-4 appearance-none rounded(-full) border-2 border-slate-600 bg-slate-950 checked:border-indigo-500 checked:bg-indigo-500` + `checked:shadow-[inset...]`(radio) 동일 문자열 7회 복붙 | 신규 `RadioOption`/`CheckboxOption`(또는 `FilterGroup`) | `{checked,onChange,label,type}` | 합 78줄. 체크박스 시각이 **3종 불일치**(여기 appearance-none+border-2 / MultiShotChartTab custom+Check 아이콘 / MultiFullCourtChart native accent). CL:2300,2322,2351,2373,2388,2408,2442 |
| 2294, 2316, 2345, 2367, 2402, 2435 | section-header(소) | 필터 그룹 라벨 `text-xs font-bold text-slate-500 uppercase tracking-wider mb-2` 6회 | 신규 `FilterGroup title` | — | [추가] 2542·614 에 `font-bold` 빠진 변형 2회 더 |
| 2296-2310 | segment | "보기 방식"/"색상 기준" 2택 radio를 세로 목록으로 | 신규 `SegmentedControl` | `{options,value,onChange}` | MultiShotChartTab 팀 토글(119-136)도 같은 의미의 segment [추가] |
| 2334-2340 | 범례 | 그라디언트 바 `h-1.5 rounded-full` + `평균 이하/이상` | 신규 `LegendBar` | — | inline gradient hex 3개 [추가] |
| 2468-2530 | 차트(svg) | `w-[46rem] aspect-[435/403]` **고정 폭**, 배경 `#020617`, 존 오버레이 `#10b981`, 외곽선 `#1e293b` | — | 신규 `HalfCourtSvg`(MST와 통합) | 고정 46rem → 좁은 화면 가로 스크롤 위험(추정). [추가] |
| 2506-2523 | marker | 성공=원 `#34d399`, 실패=X `#f87171` | 신규 `ShotMarker` | — | MST 194-215, MFCC 226-259와 3중 중복 [추가] |
| 2532-2534 | empty | `h-40 text-slate-500 text-sm` | `EmptyState` | — | CL:2533 |
| 2544-2590 | table/th/td/tfoot | 구역별 표: 위와 동일 raw 스타일 + 6열(리그평균, `+/-`), delta 색 `emerald/rose/slate-600`, tfoot inline `#0f172a` 12곳, 외곽 border-t `slate-700` | `Table` 계열 + `TableFoot` | ShotBreakdownTable과 통합(리그평균 열 옵션) | 숫자 **tabular-nums 없음**, `+/-` 문자열 `%p` 단위 직접 조립. 인라인 hex 12줄 [추가]. CL:2544,2547,2548,2549,2550,2551,2552,2560,2561,2562,2563,2564,2565,2574,2575,2576,2577,2578,2579,2582,2583,2584,2585,2586,2587 |
| 2594-2596 | table | `ShotBreakdownTable` 3회 | 위 612-638 | — | — |
| 2600-2602 | empty | `h-40 text-slate-500 text-sm` | `EmptyState` | — | CL:2601 (**싱글에선 항상 이 화면**) |

CL 확인 메모: 체크리스트 PlayerDetailView 181행은 모두 위 행에서 소화됨(오탐 14행 명시). 추가 발견 수는 `[추가]` 표식이 붙은 표 행 수 기준(한 행에 여러 항목이 있어도 1로 셈).

#### 돈 표기 전수 (PlayerDetailView — 이 5개 파일 중 돈 표기는 여기에만 존재)

공통: 모두 `formatMoneyFull`(`utils/formatMoney.ts` 12-15행: `$` + `Math.round(abs).toLocaleString()`, 음수 `-` 접두). 줄임 표기 `formatMoney`·직접 `toLocaleString` 호출은 5개 파일 어디에도 없음(grep 확인). **7곳 전부 `tabular-nums`·`font-mono` 없음.**

| 라인 | 맥락 | 값 | 정렬 | tabular-nums | 색 | CL |
|---|---|---|---|---|---|---|
| 1602 | 헤더 한 줄 요약의 마지막 항목 (`player.contract ? ... : '-'`, 즉 `contract` 기준으로 분기) | `salary` | 인라인(구분자 `|` 사이), 정렬 지정 없음 | 없음 | 부모 `text-slate-300` | 84 |
| 1671 | 선수 정보 kv "연봉" (`salary > 0` 기준 분기 — 1602와 **분기 조건이 다름**: contract vs salary) | `salary` | flex justify-between → 값 `text-right` | 없음 | `slate-200 font-semibold` | 93 |
| 1818 | 직전 계약 연도별 행 | `sal` | justify-between 우측 끝 | 없음 | `slate-400` | 100 |
| 1825 | 직전 계약 AAV (전체 평균) | `sum/len` | 동일 | 없음 | `slate-400` | 102 |
| 1852 | 직전 계약 폴백 "연평균 연봉" | `prevSalary` | 동일 | 없음 | `slate-400` | 104 |
| 1883 | 현재 계약 연도별 행 | `sal` | 동일 | 없음 | 현재연도 `emerald-400` / 그 외 `slate-200` (직전계약은 slate-400) | 106 |
| 1891 | 현재 계약 AAV (`slice(currentYear)` 평균) | 평균 | 동일 | 없음 | `slate-300` (직전계약 AAV는 slate-400 → **불일치**) | 108 |

비고: 연봉 행들은 `$12,345,678` 전체 자릿수 문자열이 가변 폭이고 우정렬만 되어 있어 행 간 자릿수 정렬은 맞지만, 비-mono 폰트에서 숫자 폭이 같지 않아 미세 흔들림 가능(`tabular-nums` 없음). 1891은 `(years.length - currentYear)`가 0이면 NaN/Infinity 가능(만료 계약 데이터, 추정 — 로직 이슈라 감사 범위 밖이지만 UI에 `$NaN`이 노출될 수 있음).

### 파일 내 반복 패턴

| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| raw 표 헤더행(`px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500`) | 617-624, 733-744, 2162-2170, 2545-2553 | 8+12+9+9 = **38** |
| raw `<table>` 전체(라이브) | 616-635(20), 732-786(55), 1611-1633(23), 2161-2228(68), 2544-2590(47) | **213** (+데드 104-148 = 45) |
| 섹션 제목 `text-base font-bold text-white mb-1.5`(+`mb-1`·`px-4 py-3` 변형) | 1664, 1688, 1706, 1728, 1743, 1774, 1808, 1866, 1912, 1988, 2023, 2060 | 12 (각 1줄) |
| 섹션 래퍼 `px-4 py-3 border-t border-slate-800 space-y-1` (+닫는 태그) | 1687, 1705, 1727, 1742, 1773, 1911, 1987, 2022 | 8×2 = **16** (+1663, 1804 변형 2곳) |
| kv 행 `flex justify-between items-center text-sm` + 라벨 `text-slate-500` | 1676-1679, 1694-1697, 1707-1710, 1712-1715, 1718-1721, 1733-1736, 1761-1764, 1816-1819, 1822-1827, 1828-1833, 1834-1845, 1850-1853, 1854-1859, 1877-1885, 1888-1893, 1894-1900, 2040-2045 | 4+4+4+4+4+4+4+4+6+6+12+4+6+9+6+7+6 = **94** |
| 필터 radio/checkbox 옵션(동일 클래스 7회) | 2299-2308, 2321-2330, 2350-2359 (radio, 각 10) / 2372-2384, 2387-2395, 2407-2419, 2441-2453 (checkbox, 13/9/13/13) | 30+48 = **78** |
| 필터 그룹 라벨 `text-xs font-bold ... uppercase tracking-wider mb-2` | 2294, 2316, 2345, 2367, 2402, 2435 (+614·2542 변형) | 6 (+2) |
| 빈 상태 4종 스타일 | 727(`text-xs text-slate-600 py-8`), 1868·1914·1990·2025(`text-sm text-slate-500`), 2250-2252·2532-2534·2600-2602(`h-40 text-slate-500 text-sm`) | 3+4+9 = **16** |
| 직접 구현 드롭다운(상태 + 외부클릭 + 2개 패널) | 809-812, 814-821, 1406-1448, 1453-1480 | 4+8+43+28 = **83** |
| group-hover 즉시 툴팁 | 1583-1585, 2111-2121 | 3+11 = **14** |
| 액션 버튼 3회 복붙(테마 inline style) | 1488-1495, 1499-1506, 1507-1514 | **24** |
| native `<select>` 동일 클래스 복붙 | 2151, 2155 | 2 (긴 줄) |
| 인라인 하드코딩 색(`#0f172a`·`#1e293b`·`#334155`·`rgba(255,255,255,0.02/0.65)`) | 2185, 2195, 2216, 2218-2219, 2242-2246, 2574-2587(12줄) | 약 **22** |
| 성공/실패 슛 마커 | 2506-2523 | 18 |
| 같은 지역 함수 중복 정의 | `toOrdinal` 1937·1995, 정렬식 832·1427 | 각 1~2 |
| 데드코드 | 80-99(20), 104-148(45), 553-567(15), 577-608(32), 844-858(14) | **126** (+`VirtualGameLog` 미사용 props 3줄) |

---

## views/multi/season/MultiPlayerDetailView.tsx (334줄)

### 공용 컴포넌트 사용 현황
공용 컴포넌트 import 없음. 자체 UI는 로딩 스피너 1개뿐이며 나머지는 데이터 조립(훅 14개, 쿼리 3종)과 `PlayerDetailView` 호출. 공용 `PlayerDetailView`가 모든 UI를 담당.

### 직접 구현 UI 조각

| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 291-297 | spinner | `flex items-center justify-center min-h-screen` + `Loader2 size 28 animate-spin text-indigo-400` | 신규 `Spinner`/`LoadingState` | `size`, `fullScreen` | CL:294. PlayerDetailView(16/slate-500)·PlayerNewsTab(22/indigo-400)와 3종 불일치. `min-h-screen`은 앱 셸 내부에서 높이가 이중으로 잡힐 수 있음(추정) |
| 299-303 | (렌더 중 부수효과) | `navigate(-1); return null;` 렌더 본문에서 호출 | — | `useEffect`로 이동 | [추가] UI 조각은 아니나 React 안티패턴(렌더 중 네비게이션) — 오동작 위험 |
| 49 | (데드 옵션) | `HIDE_SECTIONS = []` | — | — | [추가] `hideSections` 데드 옵션의 유일한 전달부 |
| 48, 230, 258 | (empty_state) | 주석 | — | — | **오탐** ×4 (CL:48 비어, 48 없음, 230, 258) |

CL 대조: 5 중 반영 1(294), 오탐 4.

### 파일 내 반복 패턴
- 반복 UI 없음. 스피너 3줄 외 마크업 없음.

---

## views/multi/season/PlayerNewsTab.tsx (120줄)

### 공용 컴포넌트 사용 현황
- 공용 UI 컴포넌트: **없음**. `PlayerHoverCard`의 유틸(`buildPlayerCardMap`/`mergeStatsIntoPlayerCardMap`, 9행)과 `StoryCard`(`./newsFeedCards`)만 사용 — `StoryCard`는 이 화면군 밖의 뉴스 피드 컴포넌트.
- 주석(16-17행) 기준 `MultiNewsFeedView.tsx`와 같은 좌 리스트 + 우 StoryCard 레이아웃을 복제(추정: 해당 파일 미정독).

### 직접 구현 UI 조각

| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 65-71 | spinner | `py-16` 중앙, `Loader2 size 22 animate-spin text-indigo-400` | 신규 `Spinner` | `size` | CL:68 |
| 73-75 | empty | `flex items-center justify-center h-40 text-slate-500 text-sm ko-normal` | 신규 `EmptyState` | `message` | CL:74. PlayerDetailView 2250·2532·2600과 동일 문자열 |
| 78-79 | section/divider | 루트 `h-full min-h-[480px] flex`, 좌 컬럼 `w-[30%] shrink-0 border-r border-slate-800 overflow-y-auto custom-scrollbar bg-slate-900` | 신규 `MasterDetail` | `listWidth` | CL:79(divider_v). 퍼센트 고정폭 |
| 83-93 | list row(선택형) | `px-3 py-2.5 cursor-pointer border-b border-slate-800/50 text-sm transition-colors`, 선택 `bg-slate-700 text-white`, 비선택 `bg-slate-900 hover:bg-white/5`, 우측 날짜 `text-sm tabular-nums` | 공용 없음(`TableRow`는 `<tr>` 전용, `Dropdown` 항목은 indigo active) | 신규 `SelectableListRow` | CL:86(divider_b),87(row_hover),91(tabular). **날짜 `tabular-nums`는 올바르게 사용**. 선택 색(slate-700)이 Dropdown active(indigo-600/10)와 다름. 키보드 접근성 없음(`div onClick`, role/tabIndex 없음) [추가] |
| 95-105 | button | 더 보기: `w-full px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:bg-slate-800 disabled:opacity-50`, 로딩 텍스트 '불러오는 중...' | `Button variant="secondary" size="sm" fullWidth isLoading loadingText` | `Button` 기본 `rounded-2xl uppercase tracking-widest font-black`로 외형 변경 | CL:97(button_raw),100(row_hover),100(card_box). 100의 `card_box` 분류는 부정확(버튼 스타일) — 분류 정정이지 오탐은 아님 |
| 108 | section | 우 컬럼 `flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-slate-900 p-10` | — | — | `p-10`(40px) 큰 패딩, 다른 탭과 불일치 [추가] |

CL 대조: 9행 모두 반영, 오탐 0.

### 파일 내 반복 패턴
- 반복 패턴 없음(스피너/빈 상태가 각 1회). 다만 `className` 안에 `ko-normal`이 4회.

---

## views/multi/season/MultiShotChartTab.tsx (284줄)

> **데드 파일**: import 0건(위 요약 참조). 유지/삭제 결정 전에는 "참고용 감사"로만 기록.

### 공용 컴포넌트 사용 현황
공용 컴포넌트 import 없음. `ShotTooltip`(`components/game/`)과 `useShotChartTooltip` 훅만 사용.

### 직접 구현 UI 조각

| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 104-110 | stat tile | `StatBox` 컴포넌트 **렌더 함수 내부 정의**(매 렌더 새 컴포넌트 → 언마운트/리마운트): 라벨 `text-[10px] font-bold text-slate-500`, 값 `text-base font-semibold text-white font-mono`(퍼센트, tabular 없음), 부값 `text-[10px] text-slate-400` | 신규 `StatTile` | `{label,value,sub}` | CL:106(badge_inline) — **분류 오탐**(배지가 아니라 라벨). [추가] 컴포넌트 내부 정의 |
| 113-116 | section-header(바) | 루트 `bg-slate-950`, 헤더 `shrink-0 px-4 py-3 bg-slate-900 border-b border-slate-800` | 신규 `SectionHeader` | — | CL:116 |
| 119-136 | segment | 팀 토글: 컨테이너 `p-1 bg-slate-900 rounded-xl border border-slate-800 shadow-sm`, 버튼 `px-4 py-2 rounded-lg text-xs font-black`, 활성은 `style backgroundColor: primaryColor` | 신규 `SegmentedControl` | `options[{id,label,color}]`, 활성 색 prop | CL:119(card_box),121(button_raw). 활성이 팀 컬러 inline |
| 127-132 | logo-fallback(팀 배지) | `w-5 h-5 rounded text-[9px] font-black`, 약어 2글자 `abbr.slice(0,2)` | `TeamBadge`(colorPrimary/Secondary 지원) | `size="xs"`는 `w-7 h-5`(3글자) → 크기/글자수 다름 | CL:128(badge_inline). 공용 TeamBadge가 같은 일을 하는데 직접 구현 |
| 139-149 | divider | 존 스탯 사이 `w-px h-8 bg-slate-800 self-center` ×4 (141,143,145,147) | 신규 `Divider` 또는 `StatTile` 그룹 | — | [추가] 세로 구분선 div 4개 |
| 157 | divider | 코트 영역 `border-r border-slate-800` | — | — | CL:157 |
| 166-192 | chart(코트 svg) | 하프코트 라인을 path 문자열로 직접 하드코딩(470×500, `#334155`) | 신규 `HalfCourtSvg` | — | PlayerDetailView는 `COURT_LINES`(435×403), MFCC는 `CourtPreview`(940×500) → **코트 렌더러 3종** [추가] |
| 194-215 | marker | 성공 원(팀색, 흰 테두리) / 실패 X(`#cbd5e1`), 하이라이트 분기 | 신규 `ShotMarker` | 색/하이라이트 prop | 3중 중복(PDV 2506, MFCC 226). [추가] |
| 227-239 | legend | `absolute bottom-4 right-4 text-[10px] font-bold bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 backdrop-blur-sm` | 신규 `ChartLegend` | — | CL:228(badge_inline) — **분류 오탐**(컨테이너 텍스트 크기). `backdrop-blur-sm` 사용(메모리: 모달 백드롭 블러가 렌더 비용이 큼; 여기는 차트 위 작은 영역이라 영향은 작을 것으로 추정) |
| 243-252 | section-header + text-button | 필터 패널 헤더 `p-3 border-b border-slate-800`, "전체/해제" `text-[10px] font-bold text-indigo-400 hover:text-white` | 신규 `SectionHeader` + `LinkButton` | — | CL:244(divider_b),246(button_raw),248(badge_inline → **분류 오탐**: 텍스트 버튼). `text-[10px]` 초소형 터치 영역 |
| 254-275 | list row + checkbox | 선수 행 `button w-full py-1.5 px-2 rounded-lg hover:bg-slate-800/40`, 커스텀 체크박스 `w-3.5 h-3.5 rounded border`(체크 `bg-indigo-600 border-indigo-500` + lucide `Check`), 기록 `text-[10px] font-mono`(tabular 없음) | 신규 `CheckboxOption` | — | CL:261(button_raw),264(row_hover). 체크박스 3종 불일치 중 하나. 매 행마다 `shotEvents.filter` 2회(O(선수×슛)), 추정 |
| 276-278 | empty | `text-xs text-slate-600 text-center py-6 ko-normal` | 신규 `EmptyState` | — | CL:277. 5번째 빈 상태 스타일 |

CL 대조: 13행 중 오탐(분류) 3(106,228,248), 반영 10. 추가 발견은 위 [추가] 표시.

### 파일 내 반복 패턴

| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| `text-[10px]`/`text-[9px]` 초소형 텍스트 | 106, 108, 128, 228, 248, 272 | 6 |
| `border-slate-800` 구분선 | 116, 119, 157, 228, 244 | 5 |
| 세로 구분선 div | 141, 143, 145, 147 | 4 |
| 샷 마커 | 194-215 | 22 |

---

## views/multi/season/MultiFullCourtChart.tsx (272줄)

> 선수 상세 화면이 아니라 경기 라이브/PBP 화면의 풀코트 샷 차트(`MultiGamePbpView.tsx`·`.legacy.tsx`가 사용). 지시에 따라 감사하되 화면군 종합에서는 "경기 화면 소속"으로 구분.

### 공용 컴포넌트 사용 현황
공용 UI 컴포넌트 import 없음(`CourtPreview`는 `components/multi/`, `ShotTooltip`은 `components/game/`).

### 직접 구현 UI 조각

| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 33-85 | list + checkbox | `PlayerFilterList`: 헤더 체크박스(indeterminate, `useEffect`로 ref 조작), 행 `label hover:bg-slate-800/60`, native `accent-indigo-500 w-3 h-3` | 신규 `CheckboxOption`/`CheckboxGroup` | `indeterminate` 지원 | CL:51(divider_b),52(input_raw),69(row_hover),71(input_raw). 체크박스 3종 불일치 중 하나(native) |
| 60 | (라벨) | `text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate` | 신규 `SectionHeader`(소) | — | CL:60(badge_inline) — **분류 오탐**(그룹 라벨). PlayerDetailView 2294 등과 색만 다른 동일 용도(`slate-500`↔`slate-400`) |
| 63-65 | empty | `px-1 py-1 text-[11px] text-slate-600 ko-normal` | 신규 `EmptyState` | — | CL:64. 6번째 빈 상태 변형 |
| 106-114 | dropdown(외부클릭) | `mousedown` 전역 리스너 9줄 | `Dropdown`(내장) | — | [추가] 직접 구현 |
| 166-176 | legend | 높이 `h-9 bg-slate-800 border-b border-x border-slate-700 px-3`, 팀색 점 `w-2.5 h-2.5 rounded-full` + `text-xs font-bold text-slate-300` | 신규 `ChartLegend` | — | [추가]. 경계 slate-700 (다른 곳 slate-800) |
| 178-188 | button | 필터 트리거 `px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500`, `Filter` 아이콘 + 선택 수 `-N`(`text-[9px] font-mono`) | `Button variant="primary" size="xs"` | 공용은 `rounded-2xl ring-1 shadow-lg`로 외형 큼. 카운트 배지 | CL:179(button_raw),181(header_text),181(badge_inline → **분류 오탐**: 버튼 스타일) |
| 190-209 | dropdown/popover | `absolute top-full right-0 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 p-2.5 flex gap-3 animate-in fade-in zoom-in-95` 안에 `PlayerFilterList` 2개 | `Dropdown`(children 모드, portal `fixed`) | `Dropdown`의 `width`/`align`, 패널 패딩 | CL:191(card_box),191(zindex). 공용 Dropdown 패널은 `border-slate-800 rounded-xl p-0`이라 border 색/모서리 불일치. `absolute` 패널이라 상위 overflow에 잘릴 위험(추정) |
| 214-259 | chart | 풀코트 svg(`CourtPreview`) + 샷 마커. 마커에 `transition-all duration-150`(수백 개 SVG 노드에 transition, 렌더 비용 추정) | 신규 `ShotMarker` | — | [추가] 마커 34줄 중복 |
| 262-268 | tooltip | `ShotTooltip` | 이미 공용(경기용) | — | 정상 |

CL 대조: 11행 중 오탐(분류) 2(60, 181 badge_inline), 반영 9.

### 파일 내 반복 패턴

| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| `text-[10px]`·`[11px]`·`[9px]` | 60, 64, 77, 181, 186 | 5 |
| 체크박스 label 행 | 51-61, 67-80 | 11+14 = 25 |
| 외부클릭 이벤트 | 106-114 | 9 |

---

## 화면군 종합

### 불일치 대조표

| 항목 | PlayerDetailView | PlayerNewsTab | MultiShotChartTab(데드) | MultiFullCourtChart(경기) | 공용 컴포넌트 기준 |
|---|---|---|---|---|---|
| 표 헤더 배경 | `bg-slate-800` (4개 표 복붙) | — | — | — | `TableHead` `bg-slate-950` |
| 표 헤더 글자 | `font-bold uppercase text-sm`(상속), tracking 없음 | — | — | — | `text-xs font-black uppercase tracking-widest` |
| 헤더 셀 패딩 | `px-3 py-2` | — | — | — | `py-3 px-1.5` |
| 셀 패딩 | `px-3 py-2` / `py-1.5`(혼재) / `py-2 px-1.5`(게임로그) | — | — | — | `py-2 px-3` |
| 숫자 tabular-nums | 표 5개 전부 없음, `ability`(2124)·증감(2109)만 있음 | 날짜만 있음 | 없음(`font-mono`만) | 없음(`font-mono`만) | `TableCell variant="stat"`는 `font-mono tabular-nums` |
| 행 구분선 색 | `slate-800` / `/60` / `/50` / `/40` / `/30` / `slate-700` | `slate-800/50` | `slate-800` | `slate-800`, `slate-700` | `TableCell` `slate-800/50` |
| 지그재그 | inline `rgba(255,255,255,0.02)` | — | — | — | 없음(TableRow hover만) |
| 체크박스 | `appearance-none w-4 h-4 border-2` indigo | — | custom `w-3.5` + Check 아이콘 | native `accent-indigo-500 w-3 h-3` | 없음 |
| 버튼 | 테마 inline 3개 + 아이콘 + 텍스트 링크 | `rounded-lg` 박스 | 텍스트 `text-[10px]` | indigo `rounded` 소형 | `Button`(rounded-2xl, uppercase tracking-widest) |
| 빈 상태 | `text-xs slate-600 py-8` / `text-sm slate-500` / `h-40 text-sm slate-500` | `h-40 text-sm slate-500 ko-normal` | `text-xs slate-600 py-6 ko-normal` | `text-[11px] slate-600 ko-normal` | 없음 |
| 스피너 | `size 16 slate-500` | `size 22 indigo-400` | — | — | (MultiPlayerDetailView `size 28 indigo-400`) `Button` 내부 `Loader2` |
| 드롭다운/팝오버 | 직접 absolute 2종 | — | — | 직접 absolute 1종 | `Dropdown`(portal fixed, `border-slate-800 rounded-xl`) |
| 선택 행 색 | 드롭다운 `text-white font-bold` | `bg-slate-700` | 체크 `bg-indigo-600` | — | Dropdown active `bg-indigo-600/10 text-indigo-400` |
| 팀 배지/로고 | `TeamBadge` + 자체 `<img>` 2단 폴백 | — | 자체 abbr 정사각 배지 | 색 점 | `TeamBadge`/`TeamLogo` |
| 툴팁 | `group-hover` 2종 + `InjuryStatusBadge`(portal) | — | `ShotTooltip` | `ShotTooltip` | 없음 |
| 코트 렌더러 | `COURT_LINES` 435×403 | — | 인라인 path 470×500 | `CourtPreview` 940×500 | — |
| 샷 마커 | 원 `#34d399`/X `#f87171` | — | 팀색 원/ X `#cbd5e1` | 팀색 | — |
| 필터 그룹 라벨 | `text-xs ... slate-500 tracking-wider` | — | `text-xs font-black slate-400` | `text-[10px] ... slate-400 tracking-wider` | — |
| 섹션 제목 | `text-base font-bold`(11곳) vs `SectionHeader text-base font-black uppercase`(2곳) | — | `text-xs font-black` | — | `PageHeader`는 `text-4xl` (용도 다름) |
| 돈 표기 | `formatMoneyFull` 7곳, 정렬 우측, tabular 없음, 색 4종 | — | — | — | (공용 Money 컴포넌트 없음) |
| 탭 | `TabBar theme` | — | — | — | `TabBar` |
| 팀 컬러 처리 | `getTeamTheme`+ 인라인 style | — | `primaryColor` inline | `homeColor/awayColor` inline | — |

### 통합 후보(효과 큰 순)

| 순위 | 후보 | 대상 라인(센 값) | 제거되는 줄 수 | 선행 조건 |
|---|---|---|---|---|
| 1 | **데드코드 삭제** (PlayerDetailView): `TRAD_COLS/ADVANCED_COLS` 80-99, `DefenseZoneTable`+`DEF_ZONES` 101-148, `hexAlpha/luminance/getEffectiveTintColor` 553-567, `StatsSubTable` 577-608, 미사용 테마 토큰 844-858, `VirtualGameLog` 미사용 props 3줄, 14행 Table import | 20+48+15+32+15+3 = 약 **133줄** | 없음(참조 0 확인됨). 삭제 시 `tintColor/isLight` 연쇄 정리 |
| 2 | **데드 파일** `MultiShotChartTab.tsx` | **284줄** (import 0) | 사용자 확인("결과 화면 샷차트를 되살릴 계획인가"). 되살릴 경우 아래 `ShotMarker/HalfCourtSvg` 통합 대상 |
| 3 | raw `<table>` 5개 → 공용 `Table` 계열 이관 (ShotBreakdown 20, 게임로그 55, 헤더요약 23, 커리어 68, 구역별 47) | 대상 **213줄**, 이관 후 약 110줄로 추정 → 순감 약 **100줄(추정)** | 공용 `Table`에 (a) 헤더 variant(slate-800/소문자), (b) `bare`(외곽/배경 제거) 옵션, (c) `TableCell` `variant="stat"` 대신 숫자 `tabular-nums`만 쓰는 옵션, (d) 서브행/지그재그 prop, (e) 가상 스크롤 래퍼 `VirtualTable`. 공용 스타일 변경이므로 다른 화면 영향 검토 선행 |
| 4 | `KeyValueRow` + `SectionBlock/SectionHeader` 도입 | kv 행 94줄 + 섹션 래퍼 16줄 + 제목 12줄 = **122줄** | 이관 후 약 40줄(추정) → 순감 약 **80줄(추정)**. 선행: 값 색 규칙(slate-200/white/slate-300/slate-400 혼재) 결정 |
| 5 | `FilterOption`(radio/checkbox) 컴포넌트 | PDV 78줄 + MST 254-275 중 체크박스 부분 + MFCC 33-85 | PDV 78줄 → 약 14줄(7×2) → 순감 약 **64줄(추정)**, MFCC·MST 체크박스 시각 통일 효과 추가. 선행: 3종 체크박스 중 기준 시각 결정(디자인 확인 필요) |
| 6 | `Dropdown` 이관 (브레드크럼 2개 + MFCC 필터 팝오버) | PDV 83줄 + MFCC 106-114(9)+178-210(33) = **125줄** | 이관 후 약 40줄(추정) → 순감 약 **85줄(추정)**. 선행: 공용 `Dropdown`에 (a) 트리거 variant(팀 컬러 바 위 `bg-black/20`), (b) active 표시 변형, (c) panel 폭/최대높이 지정. 현재 portal `fixed`라 `overflow-hidden`(1387) 클리핑 문제는 해결됨 |
| 7 | `EmptyState` / `Spinner` | 빈 상태 PDV 16 + PNT 3 + MST 3 + MFCC 3 + 스피너 PDV 5 + MPDV 7 + PNT 7 | **약 44줄**(이관 후 호출부 1줄씩이면 순감 약 30줄 추정). 빈 상태 6종·스피너 3종 → 각 1종으로 통일 |
| 8 | `ShotMarker` + `HalfCourtSvg` 통합 | 마커 PDV 18 + MST 22 + MFCC 34 = 74줄, 코트 라인 MST 27줄(166-192) | 약 **100줄** 중 순감 약 60줄(추정). 선행: 마커 색 정책(성공/실패 색) 통일, 코트 좌표계 3종(435×403/470×500/940×500) 통일 가능성 판단 |
| 9 | `Button` 이관 (액션 버튼 3 + 더보기 + 필터 트리거 + 초기화 + 전체/해제) | 24 + 7 + 10 + 6 + 6 = **53줄** | 선행: `Button`의 `uppercase tracking-widest rounded-2xl`가 한글/소형 UI에 부적합 → `variant="theme"`/`size="xs"` 소형 + `LinkButton`/`IconButton` 추가가 먼저 필요(메모리의 "버튼에서 uppercase/tracking-widest 제거 방침" 참고) |
| 10 | `Money` 표기 규칙 | 7곳(1602, 1671, 1818, 1825, 1852, 1883, 1891) | 줄 수 변화 거의 없음(일관성 목적) | 규칙 결정: 우측 정렬 + `tabular-nums`, AAV 색(직전 slate-400 vs 현재 slate-300) 통일, 1602 vs 1671 분기 조건(contract vs salary) 통일 |
| 11 | `Tooltip` 공용화 | 1583-1585, 2111-2121 + `InjuryStatusBadge` portal + `AwardBadges` 1개 | 14줄 + 중복 구현 3종 | 선행: portal 방식(`InjuryStatusBadge`) 표준화 — sticky/overflow 안에서도 안 잘림 |

### 체크리스트 대조 결과

| 파일 | 매치 수 | 반영 수 | 오탐 수 | 추가 발견 수 |
|---|---|---|---|---|
| views/PlayerDetailView.tsx | 181 | 167 | 14 | 20 |
| views/multi/season/MultiPlayerDetailView.tsx | 5 | 1 | 4 | 2 |
| views/multi/season/PlayerNewsTab.tsx | 9 | 9 | 0 | 2 |
| views/multi/season/MultiShotChartTab.tsx | 13 | 10 | 3 | 4 |
| views/multi/season/MultiFullCourtChart.tsx | 11 | 9 | 2 | 3 |
| **합계** | **219** | **196** | **23** | **31** |

- 오탐 상세(PlayerDetailView 14): 주석 속 키워드 `empty_state` 7(212, 882, 884, 1003, 1848, 1984) + `sticky` 1(707), `ovr_calc` 로직 6행(832×2, 859, 946, 1427×2), `badge_inline`(110, 표 헤더 글자) 1. 합 6+1+6+1 = 14.
- 오탐 상세(MultiPlayerDetailView 4): 주석 속 48(×2), 230, 258.
- 분류 오탐(MultiShotChartTab 3: 106, 228, 248 / MultiFullCourtChart 2: 60, 181 `badge_inline`): UI 조각은 실제로 존재하나 분류가 틀려 정정하여 표에 반영.
- 체크리스트가 놓친 대표 항목: 라이브 코드에서 공용 `Table`이 0회 사용된다는 사실, 직접 구현 드롭다운, 어워드 필/툴팁, 섹션 제목 11곳, kv 행 17곳, 데드코드 약 133줄, 데드 파일 1개(MultiShotChartTab), 미사용 공용 `PlayerAwardBadges.tsx`, 렌더 중 `navigate(-1)`, 코트 렌더러 3종, 체크박스 3종, 빈 상태 6종, 인라인 hex 약 22줄.
