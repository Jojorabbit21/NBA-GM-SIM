# 08 로스터 — UI 조각 전수 감사

감사 기준일: 2026-10-12 (코드 수정 없음, 정독 후 작성). "추정"으로 표기한 항목은 코드만 읽고 렌더 결과는 확인하지 않은 것.

읽은 범위:
- views/RosterView.tsx: 1~541줄 (전부)
- views/multi/season/MultiRosterView.tsx: 1~316줄 (전부)
- components/roster/RosterOverviewGrid.tsx: 1~260줄 (전부)
- components/roster/RosterGrid.tsx: 1~416줄 (전부)
- components/roster/RosterStatsStack.tsx: 1~325줄 (전부)
- components/roster/TeamGameLog.tsx: 1~397줄 (전부)
- components/roster/TeamScheduleCalendar.tsx: 1~332줄 (전부)
- components/roster/TeamPayrollTable.tsx: 1~457줄 (전부, 1~230 / 230~457 두 번에 나눠 읽음)
- components/roster/SalaryCapDashboard.tsx: 1~143줄 (전부)
- components/roster/StartingLineup.tsx: 1~72줄 (전부)
- components/roster/RosterTabs.tsx: 1~33줄 (전부)
- components/multi/TeamSettingsPanel.tsx: 1~279줄 (전부)
- components/dashboard/CoachProfileCard.tsx: 1~112줄 (전부)
- components/dashboard/GMProfileCard.tsx: 1~108줄 (전부)
- 공용 API(감사 대상 아님, 전부 읽음): components/common/Table.tsx(228), TabBar.tsx(55), Button.tsx(69), Badge.tsx(41), Card.tsx(45), Modal.tsx(136), Dropdown.tsx(147), PageHeader.tsx(42), TeamLogo.tsx(46), OvrBadge.tsx(146), StarRating.tsx(88), InjuryStatusBadge.tsx(94), PlayerHoverCard.tsx(344)
- 보조로 읽음: utils/formatMoney.ts (formatMoney=축약 `$51.4M`, formatMoneyFull=`$155,300,000`)

화면군 구조 메모 (감사 중 확인한 사실):
- 탭 7개는 RosterTabs(TabBar 래퍼)가 그림: 로스터=RosterOverviewGrid / 능력치=RosterGrid(tab="roster") / 선수 기록=RosterStatsStack / 경기 기록=TeamGameLog / 일정=TeamScheduleCalendar / 재정=TeamPayrollTable / 팀 설정=TeamSettingsPanel(멀티·내 팀 한정).
- CoachProfileCard(HeadCoachTable)/GMProfileCard는 RosterView의 `coaching` 탭 전용인데, MultiRosterView가 `hideTabs={['coaching','draftPicks']}`(297줄)를 넘기므로 멀티플레이어 로스터 화면에는 노출되지 않음(싱글 전용 경로). 감사 지시 범위라 포함.
- SalaryCapDashboard는 자기 파일 외 import가 0건(grep 확인) = 미사용 파일. StartingLineup은 components/dashboard/RotationManager.tsx만 import(이 화면군 밖).
- RosterGrid는 이 화면에서는 `tab="roster"`만 쓰지만 views/DashboardView.tsx(135, 142: roster/stats)와 views/FAView.tsx(443: renderRowAction 포함)도 호출 → `tab==='stats'` 분기·`renderRowAction`·푸터는 다른 화면에서 살아 있음(삭제 불가).
- 확인된 코드 사실: Table.tsx의 `style` prop은 wrapper `<div>`(73줄)에, `tableStyle`은 `<table>`(74줄)에 적용됨. Overview/RosterGrid/StatsStack/Payroll은 `style={{ tableLayout:'fixed', minWidth:'100%' }}`를 넘기는데 이는 wrapper div에 붙으므로 `table-layout: fixed`가 `<table>`에는 적용되지 않음(GameLog/Schedule만 `tableStyle`로 정상 전달). 통합 시 "고치면 레이아웃이 바뀔 수 있음" 주의(추정: 현재는 auto layout + colgroup 힌트로 동작).

---

## views/RosterView.tsx (541줄)

### 공용 컴포넌트 사용 현황
- TeamLogo: 330줄(`size="custom"` + `absolute inset-0 w-full h-full`, 싱글 팀), 387줄(`size="sm"`, 드롭다운 항목, 싱글 팀)
- RosterTabs → TabBar: 446줄 (`theme={theme}` 전달 — 팀 테마 배경)
- 미사용: Dropdown, Button, Badge, Card, PageHeader, Modal (배너·드롭다운·chevron 버튼 전부 직접 구현)
- 하위 화면 컴포넌트 호출: 451~536줄 (RosterOverviewGrid / RosterGrid / RosterStatsStack / TeamGameLog / TeamScheduleCalendar / TeamPayrollTable / GMProfileCard / HeadCoachTable / DraftPicksPanel / renderTeamSettingsPanel)

### 직접 구현 UI 조각
오늘(2026-10-12) 수정된 배너 영역(272~443)을 포함. `[2026-10-12]` 주석이 붙은 변경은 비고에 "오늘 수정"으로 표기.

| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 129~130, 152~158 | dropdown(상태·바깥클릭) | `teamMenuOpen` state + `mousedown` 리스너로 바깥 클릭 닫기(7줄) | Dropdown (이미 내부 처리, controlled `isOpen/onOpenChange` 지원) | 없음 | ↑/↓ 키 핸들러(137~150)가 `teamMenuOpen`을 참조하므로 controlled 모드로 써야 함. 오늘 수정(키보드) |
| 339~395 (352 포함) | dropdown | 트리거 버튼 + 절대위치 패널 `absolute top-full left-0 mt-2 bg-black border border-zinc-700 rounded-lg p-2 flex flex-col gap-0.5 z-[200] min-w-[220px] max-h-80 overflow-y-auto custom-scrollbar`(352). 항목 `px-3 py-1.5 text-xs rounded`, 선택=`bg-white/15`, 내 팀=`bg-amber-400/10 hover:bg-amber-400/20`(358~362) | Dropdown(`items`, `align="left"`) | DropdownItem에 `className`/`activeClassName`(내 팀 amber 틴트), Dropdown에 `panelClassName`(배경 black/zinc 유지 시), `width`(min-w-[220px]). Dropdown은 portal+fixed라 `z-[200]` 불필요 | 공용 Dropdown 패널은 `bg-slate-900 border-slate-800 rounded-xl w-64 z-[9999]`, 항목 `px-3 py-2.5 text-xs font-bold`로 디자인이 다름 → bg-black/zinc-700 유지가 의도인지 확인 필요. 오늘 수정(내 팀 틴트 356~362) |
| 341~350 (345 포함) | button | 트리거: `flex items-center gap-3 group`, 팀명 `text-lg font-black uppercase tracking-wide text-white`(345), chevron 토글 346~349 | DropdownButton(박스형 스타일이라 불일치) | DropdownButton `variant="plain"`(보더·배경 없음, 타이틀 크기) 신규 | 345 체크리스트는 header_text로 잡혔으나 실제론 팀명 타이틀(섹션 헤더 아님). 한글에 uppercase/tracking-wide 적용(메모리의 버튼 타이포 피드백과 충돌 여지, 확인 필요) |
| 289~309 (291, 296, 300, 305 포함) | button | chevron ▲▼ 2개: `p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors`, 아이콘 18px, `title/aria-label` | Button(ghost/xs)은 `px-3 py-1.5 uppercase tracking-widest rounded-2xl`라 아이콘 전용에 부적합 | IconButton(신규): `icon`, `title`, `size`, `tone="onDark"` | 296/305 체크리스트의 row_hover 분류는 오분류(버튼 hover). TeamScheduleCalendar 112~124와 동형(`p-1.5 rounded-lg ... hover:bg-slate-800`). 오늘 수정 |
| 311~331 (319~327, 321, 322, 325 포함) | logo-fallback | 멀티 팀(`colorPrimary` 있음)일 때 `<img src=getRealTeamLogoUrl>` + onError 체인(real → `getTeamLogoUrl` → `placehold.co`) 직접 작성, `absolute inset-0 object-contain drop-shadow-md`. 싱글은 TeamLogo | TeamLogo | TeamLogo에 `source="real"`(real→old→placeholder 체인) 또는 `colorPrimary` 유무로 자동 선택 | TeamLogo.tsx는 `getTeamLogoUrl`+placehold 1단 폴백만 있음. 래퍼(`self-stretch aspect-square`)는 오늘 수정. 같은 체인이 PlayerDetailView 헤더에도 있다고 주석(313~314)에 명시(범위 밖) |
| 369~388 (376~384, 378, 379, 382 포함) | logo-fallback | 드롭다운 항목용 로고. 위와 본문 동일한 onError 체인 9줄, `w-6 h-6 object-contain shrink-0` | TeamLogo(`size="sm"`=w-6 h-6) | 위와 동일 | 330줄 블록과 onError 본문 9줄이 글자 단위로 동일. 오늘 수정(색상 배지→로고) |
| 275 | section-header(배너 컨테이너) | `relative isolate flex-shrink-0 px-9 py-8 border-b border-white/10 flex items-center gap-4 bg-slate-950` | PageHeader(제목 4xl·하단선 구조라 불일치) | 팀 배너 전용 컴포넌트(신규, `TeamBanner`) 정도 | 오늘 수정(팀 테마 배경 → slate-950 + 틴트). 패딩 `px-9`(36px) ≠ TabBar `px-8`(32px)로 좌측 정렬선이 4px 어긋남(추가, 의도 여부 확인) |
| 277, 278 | (오탐) | 주석 텍스트 안의 `-z-10` | - | - | 오탐(주석) |
| 279~283 (281 포함) | 기타(틴트 오버레이) | `absolute inset-0 -z-10 pointer-events-none` + `backgroundColor: colorPrimary ?? theme.bg, opacity 0.45` | 해당 없음 | `TeamBanner` 내부로 | 281은 주석이 아닌 실제 z-index. 오늘 수정 |
| 286 | (오탐) | 주석의 "없음" | - | - | 오탐(주석) |
| 338, 398~411 | 기타(배너 텍스트) | 2행: `text-sm font-bold whitespace-nowrap text-white` 3개(404), 3행 같은 클래스(409~411) | 해당 없음 | `TeamBanner` 내부 | 색이 `text-white` 하드코딩 → 팀 컬러가 밝으면 흰 글씨 대비 부족 가능(추정, 틴트 45%). 오늘 수정(색·`ml-2`) |
| 414~421, 426~436 | 기타(배너 텍스트) | `text-xs font-semibold whitespace-nowrap opacity-80 text-white` 5회(415~417, 418~420, 427~429, 430~432, 433~435) | 해당 없음 | `StatLine`(label/value/rank) 소형 컴포넌트 | 5회 × 3줄 = 15줄 반복 |
| 440~442 | 기타(GM 닉네임) | `ml-auto text-sm font-semibold self-start text-white` | 해당 없음 | - | 추가 발견 |
| 446 | tab | RosterTabs → TabBar(theme) | TabBar(이미 사용) | - | 공용 사용 |
| 513~525, 528~530, 533~535 | 기타(스크롤 래퍼) | `h-full overflow-y-auto custom-scrollbar` 래퍼 div 3회 | 해당 없음 | `ScrollPane` 같은 1줄 래퍼(선택) | 추가 발견, 소규모 |
| 450~536 | 기타(탭 컨텐츠 스위치) | 조건부 렌더 + prop 전달 | 해당 없음 | - | 로직 전달만, UI 조각 없음 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 로고 `<img>` + onError real→old→placehold 체인 | 315~328, 372~385 | 14 + 14 = 28 (블록 전체 311~331, 371~388 = 21 + 18 = 39) |
| chevron 아이콘 버튼(`p-1 rounded ... hover:bg-white/10`) | 291~299, 300~308 | 18 |
| 배너 보조 텍스트 span(`text-xs font-semibold ... opacity-80 text-white`) | 415, 418, 427, 430, 433 | 15 |
| 스크롤 래퍼 `h-full overflow-y-auto custom-scrollbar` | 513, 528, 533 | 3 (래퍼 줄만) |

---

## views/multi/season/MultiRosterView.tsx (316줄)

### 공용 컴포넌트 사용 현황
- 없음(RosterView, TeamSettingsPanel 합성만). 로딩은 lucide `Loader2` 직접.
- common 폴더에 `Skeleton.tsx`가 존재(미열람, 로딩 상태에 적용 가능성은 추정).

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 276~282 (279 포함) | spinner | `flex items-center justify-center min-h-screen` + `Loader2 size=28 animate-spin text-indigo-400` | (Spinner 없음) / Skeleton 가능성(추정) | `Spinner`(size, tone) 신규 | GameLog 256, Schedule 195와 같은 `animate-spin text-indigo-400`. 단, 메모리상 "리그 진입 부트스트랩은 기존 스피너 유지" 결정이 있으니 모양 변경 금지(추정: 이 화면은 해당 게이트 이후 화면) |
| 284~311 | 기타(래퍼) | `flex flex-col h-full min-h-0` > `flex-1 min-h-0` > RosterView | 해당 없음 | - | 두 겹 래퍼가 높이만 전달(추가 발견, 제거 가능 추정) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| (없음) | - | - |

---

## components/roster/RosterOverviewGrid.tsx (260줄) — "로스터" 탭

### 공용 컴포넌트 사용 현황
- Table, TableHead(`noRow`), TableBody, TableFoot, TableRow, TableHeaderCell, TableCell(대부분 className/style만 사용, `variant` 미사용)
- OvrBadge(204, `!w-7 !h-7 !text-xs !shadow-none`로 크기 강제), StarRating(207, `size="lg"`), PlayerHoverCard(181), InjuryStatusBadge(191)
- 유틸: formatMoney(축약), calculatePlayerOvr
- 미사용: Badge(TW 배지 직접), Button(방출 버튼 직접)

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 40~44 | 기타(WIDTHS) | `NAME:180, POS:60, AGE:50, OVR:60 ...` 상수 | - | 공용 상수 `PLAYER_INFO_WIDTHS` | RosterGrid/StatsStack/Payroll과 앞 4개 값 동일 |
| 69~74 (71 포함) | sticky | `getStickyStyle(left,width,isLast)` → `position:'sticky', zIndex:30, borderRight: isLast?undefined:'none'` | Table(`stickyLeft`는 left-0 고정만 지원) | TableCell/TableHeaderCell에 `stickyLeft={number}`(오프셋)+`width` | 4개 파일에 본문 동일 사본 |
| 121~123 | sticky | `LEFT_POS/AGE/OVR` 누적합 | 위와 동일 | 위와 동일(오프셋 자동 누적) | |
| 38, 77, 92~94 | sort | `SortConfig` 타입, state, `handleSort` | - | `useTableSort(defaultKey)` 훅 신규 | handleSort 본문이 RosterGrid/StatsStack/GameLog와 동일 |
| 96~108 (100 포함) | sort | `getSortValue` 키→값 매핑 | - | 훅이 `getValue` 콜백만 받게 | 100은 정렬키 계산이라 UI 조각 아님(체크리스트 ovr_calc 오탐으로 분류) |
| 110~119 | sort | `sortedRoster` useMemo, string/number 분기 비교 | - | 훅 내부 | RosterGrid 101~110과 비교 본문 8줄 동일 |
| 61~67 | money | `MoneyCell`: `flex justify-between w-full` + `$`(slate-400) 좌측 고정 + `Math.round(v).toLocaleString()` | 없음(Table에 money variant 없음) | `Money`/`TableCell variant="money"`(mode: short/full/accounting) 신규 | 61 체크리스트는 주석 속 tabular-nums(오탐), 65는 toLocaleString(실제). 이 파일만의 "회계식" 표기 |
| 128 | table | `Table style={{tableLayout:'fixed',minWidth:'100%'}} fullHeight className="!rounded-none !border-x-0 !border-t-0 !bg-slate-950"` | Table | `Table variant="flush"`(위 className 묶음) + `tableStyle`로 올바르게 전달 | `style`이 wrapper div로 가는 문제(문서 상단 참고) |
| 129~142 | table(colgroup) | WIDTHS 기반 `<col>` 11~12개 | Table | `columns` 배열 prop(너비·sticky 오프셋을 한 번에 정의) 검토 | 헤더/바디/colgroup 3곳에 너비가 중복 기재됨 |
| 143, 144 | table(head) | `TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow` + `<tr className="h-10 text-slate-500 text-sm font-black uppercase tracking-widest">` | TableHead | TableHead 기본 글자를 `text-sm tracking-widest`로 맞추거나 `size` prop | TableHead 기본값(`bg-slate-950 sticky top-0 z-40 border-b ... shadow-sm`)과 className이 100% 중복. 기본 tr(`text-xs ... h-10`)은 `noRow`라 쓰이지 않음 |
| 145~164 (162 포함) | th/sort/sticky | 이름·포지션·나이·OVR 4개 sticky 헤더: `style={{...getStickyStyle(..), zIndex:50}}` `className="bg-slate-950"` + `sortable onSort sortDirection={...}` | TableHeaderCell | `stickyLeft={n}`, `sortKey+sortState` 한 prop | sortDirection 삼항이 이 파일에서 10회 |
| 165~171 | th/divider | 레이팅~AAV 7개: `className="border-r border-slate-800"` + width + sortable | TableHeaderCell | Table `columnDividers` 옵션 | 헤더는 `border-slate-800`(진함), 바디는 `/30`(연함) |
| 172 | th | 방출 헤더(조건부) | TableHeaderCell | - | |
| 176~228 | row | `sortedRoster.map` → TableRow `group` | TableRow | - | |
| 179~200 (179, 187 포함) | td/hover/badge | 이름 sticky 셀: `pl-4 bg-slate-900 group-hover:bg-slate-800` + hovercard 이름(`text-sm font-semibold text-white truncate hover:text-indigo-400 hover:underline cursor-pointer`) + TW 배지 + 부상 배지 | TableCell + PlayerHoverCard + Badge + InjuryStatusBadge | `PlayerNameCell`(신규) | 이름 색이 이 파일만 `text-white`, 다른 3개 파일은 `text-slate-200`(불일치). 22줄 |
| 184~189 (187 포함) | badge | TW 배지 `shrink-0 px-1 py-0.5 rounded text-[10px] font-bold leading-none bg-amber-500/15 text-amber-400 border border-amber-500/40` + `title="Two-Way 계약"` | Badge(`variant="warning" size="sm"`) | Badge에 `shape="square"`/`size="xs"`, `title` prop, uppercase 해제 | Badge는 `rounded-full px-2 py-0.5 text-[9px] uppercase`, 불투명도 10/30(여기는 15/40)이라 시각 차이 있음 → 승인 필요 |
| 190~198 | badge | InjuryStatusBadge `size=16 iconSize=12 strokeWidth=4` | InjuryStatusBadge(사용 중) | 기본값을 16/12/4로 | 3개 파일에서 같은 3개 prop 반복 |
| 201~202 | td/hover | 포지션·나이: `text-slate-500 font-semibold text-sm bg-slate-900 group-hover:bg-slate-800 text-center` | TableCell | `PlayerInfoCells` | sticky 셀은 불투명 배경이 필요해 `group-hover:bg-slate-800`을 직접 지정 |
| 203, 204 | td/ovr/divider | OVR sticky 셀 `border-r border-slate-800 ...` + `<div className="flex justify-center"><OvrBadge size="sm" className="!w-7 !h-7 !text-xs !shadow-none"/></div>` | TableCell `variant="ovr"` | OvrBadge `size="table"`(28px) + variant="ovr" 중앙정렬 | Table.tsx `variant="ovr"`는 OvrBadge(24px, `shadow-none` 비-important)를 td에 바로 넣음 → OvrBadge 루트가 `flex`(블록)라 text-center로 중앙정렬이 안 됨(추정) → 호출부가 wrapper div를 둠. `!shadow-none`은 important라 OvrBadge의 inline `boxShadow`(inset 하이라이트·티어 글로우)를 덮어 지우는 것으로 추정(렌더 미확인) |
| 206, 207 | td/divider/stars | 별점 셀 `border-r border-slate-800/30` + `<StarRating ovr size="lg"/>` 래퍼 div | TableCell | - | 207의 `calculatePlayerOvr`는 별점용 재계산(정렬·OVR·별점 3곳에서 행마다 호출) |
| 209, 210 | td/divider | 키·몸무게: `border-r border-slate-800/30 text-sm text-white`, `cm`/`kg` | TableCell | `variant="text"` | |
| 211 | money/td | 샐러리: `formatMoney(p.salary)`(축약) 가운데 정렬, tabular-nums 없음 | TableCell | `Money mode="short"` | 멀티에서는 `p.salary`와 현재 시즌 급여가 같은 값에서 파생(46줄 주석) → 샐러리/급여 2컬럼이 동일 값일 가능성(추정, 확인 필요) |
| 212 | td | 잔여계약 `${p.contractYears}년` | TableCell | - | |
| 213, 214 | money/td | 급여·AAV: 우측 정렬 + `tabular-nums` + MoneyCell | TableCell | `Money mode="accounting"` | Payroll은 같은 성격의 돈을 `formatMoneyFull`로 tabular-nums 없이 표시(불일치) |
| 215~225 (217 포함) | button | 방출 버튼 `px-2.5 py-1 rounded-md text-sm font-bold bg-red-900/60 hover:bg-red-800 text-red-200 transition-colors whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed` | Button(`variant="danger"`는 bg-red-600 solid + rounded-2xl + uppercase tracking-widest라 불일치) | Button `variant="dangerSoft"` + `size="xs"` + `rounded` 옵션 | disabled 처리 별개 구현 |
| 233~254 (235 포함) | footer | `TableFoot`(기본 `bg-slate-950 border-t border-slate-700` 그대로) > `<tr><td colSpan px-4>` > `h-40 flex items-start justify-end gap-4 pt-3` + 슬롯 카운터 텍스트 | TableFoot | `TableFooterSummary`(우측 정렬 메타 텍스트) 소형 컴포넌트 | 235는 raw `<td>`(TableCell 대신). 다른 3개 파일의 TableFoot은 `bg-slate-900 border-t-2 border-slate-800`로 덮어씀 → Overview만 기본값(불일치). `h-40` 빈 여백은 Payroll 범례와 동일 높이를 맞추려는 의도(Payroll 429~431 주석) |
| 237~250 | 기타(슬롯 카운터) | `text-sm font-semibold text-slate-400` + 초과 시 `text-red-400` | Badge/텍스트 | - | `01/15` 포맷, 조건부 색 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| sortDirection 삼항 `sortConfig.key === X ? sortConfig.direction : null` | 148, 153, 158, 163, 166~171 | 10 |
| 헤더 `border-r border-slate-800` | 162, 165~171 | 8 |
| 바디 `border-r border-slate-800/30` | 206, 209~214 | 7 |
| sticky 바디 셀 `bg-slate-900 group-hover:bg-slate-800` | 179, 201, 202, 203 | 4 |
| `getStickyStyle(...)` 호출 | 146, 151, 156, 161, 179, 201, 202, 203 | 8 |
| 이름 셀(hovercard+TW+부상) | 179~200 | 22 |

---

## components/roster/RosterGrid.tsx (416줄) — "능력치" 탭(+ 대시보드 stats, FA 화면에서도 사용)

### 공용 컴포넌트 사용 현황
- Table, TableHead(import만 하고 사용 안 함: 174는 raw `<thead>`), TableBody, TableRow, TableHeaderCell, TableCell(`variant="attribute" colorScale mono={false}` 280, 333 — 공용 variant 유일한 실사용), TableFoot
- OvrBadge(276, 329), PlayerHoverCard(241), InjuryStatusBadge(251)
- 미사용: Badge(TW), Button

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 28~35 | 기타(WIDTHS) | NAME/POS/AGE/OVR/ATTR/STAT | - | 공용 상수 | 앞 4개 동일 |
| 25, 57, 59~61 | sort | SortConfig/state/handleSort | - | `useTableSort` | handleSort 본문 Overview와 동일 |
| 63~99 (68 포함) | sort | `getSortValue` (메타·스탯·콤보 능력치) | - | 훅의 getValue | 68은 정렬 키 계산(오탐) |
| 101~110 | sort | `sortedRoster` | - | 훅 내부 | Overview와 비교 본문 동일 |
| 112~141 (115 포함) | 기타(팀 평균 계산) | `averages` useMemo | - | - | 115는 평균 계산 로직(오탐). UI 조각 아님 |
| 143~146 (143 포함), 148~157 (148, 154 포함) | sticky | LEFT_* + `getStickyStyle` | Table `stickyLeft` | 위와 동일 | 143, 148은 주석(오탐). 본문은 Overview/StatsStack/Payroll과 동일(타입 표기만 `as 'sticky'`로 다름) |
| 164 | table | `Table style={{tableLayout:'fixed',...}} fullHeight={tab==='roster'} className="!rounded-none !border-x-0 !border-t-0 !bg-slate-950"` | Table | `variant="flush"` | 4개 파일 동일 className |
| 165~173 | table(colgroup) | `COMPACT_ATTR_GROUPS.flatMap(...)` col 생성 | Table | `columns` | |
| 174 | table(head)(sticky) | 직접 `<thead className="bg-slate-950 sticky top-0 z-40 shadow-sm">` | TableHead(`noRow`) | - | 같은 클래스를 TableHead가 이미 제공. raw thead는 TableHead의 `border-b border-slate-800`이 빠짐 |
| 176~190 (178, 183, 188 포함) | th/group-header | `tab==='stats'`일 때만 그룹 헤더 행: `<th colSpan={4} className="bg-slate-950 border-b border-r border-slate-800 sticky left-0 z-50 align-middle">` + `선수 정보` + `Season Averages (Per Game)` | TableHeaderCell | `TableGroupHeaderRow`(첫 그룹 sticky colSpan 지원) | raw `<th>` 3개. 능력치 탭에서는 렌더 안 됨(주석: 요청으로 삭제) |
| 192 | table(head) | `tr.h-10 text-slate-500 text-sm font-black uppercase tracking-widest` | TableHead | 기본 글자 크기 | Overview 144와 동일 문자열 |
| 194~213 (211 포함) | th/sort/sticky | sticky 헤더 4개 | TableHeaderCell | `stickyLeft`, sort prop | Overview와 동일 구성 |
| 215~230 (219, 229 포함) | th/sort/divider | 능력치/스탯 헤더 `border-r border-slate-800` sortable + `title` | TableHeaderCell | - | |
| 231 | th | `renderRowAction && <th className="bg-slate-950 border-b border-slate-800 w-20" />` 빈 헤더 | TableHeaderCell | - | 188의 빈 `<th>`와 짝. FAView 전용 컬럼 |
| 236~269 (238, 247, 262 포함) | td/badge/hover | 이름 sticky 셀: 이름(`text-slate-200`) + TW 배지 + 부상 배지 + `p.health !== 'Healthy'`면 `text-[9px] font-black uppercase cursor-help` 상태 텍스트 | TableCell + Badge + InjuryStatusBadge | `PlayerNameCell` | 32줄. 부상이 InjuryStatusBadge와 `health` 텍스트로 이중 표시될 수 있음(추정, 멀티는 activeInjury 오버레이 사용) |
| 270, 271 | td/hover | 포지션·나이 sticky 셀 | TableCell | `PlayerInfoCells` | Overview 201~202와 동일 문자열 |
| 272~277 (274, 276 포함) | td/ovr/divider | OVR sticky 셀 + `!w-7 !h-7 !text-xs !shadow-none` | variant="ovr" | OvrBadge `size="table"` | |
| 279~281 (280 포함) | td/attribute | `variant="attribute" colorScale mono={false}` + `border-r border-slate-800/30` | TableCell(공용 variant 사용) | - | 공용 사용 양호 |
| 282~312 (283, 285, 306, 307 포함) | td/stat | 스탯 셀: `mp===0` 이면 `-`(slate-600), 아니면 `font-medium text-sm tabular-nums` + 색 코딩(+/-) | TableCell `variant="stat"` | variant="stat"의 정렬·색 옵션 | 283은 주석(오탐). `variant="stat"`(우측 정렬 `font-mono font-bold text-slate-300`)은 이 화면군에서 한 번도 안 쓰임 — 모두 가운데 정렬 `font-medium` 수동 스팬. 퍼센트 포맷 `(v*100).toFixed(1)+'%'` 301, 353 |
| 313~315 | td | `renderRowAction` 셀 `px-3 py-1.5` | TableCell | - | FAView 전용 |
| 319~366 (319, 327, 329, 333, 338, 358, 359 포함) | footer | `TableFoot className="bg-slate-900 border-t-2 border-slate-800"` > `tr.h-10` > 팀 평균 행(`pl-4 text-left bg-slate-950 font-black text-indigo-400 text-sm uppercase tracking-widest`) | TableFoot | `TableSummaryRow`(라벨 셀 + sticky 4컬럼 + 값 셀) | 이름~OVR 4칸 sticky 반복. 퍼센트·소수 포맷 재작성(352~355) |
| 375~412 (384, 388, 401 포함) | table(legend) | `SHOW_ATTR_LEGEND = false` 상수로 렌더 안 되는 약어 범례: raw `<table>`/`<th>`/`<td>` | - | - | 죽은 코드(상수 `false`). 38줄 + 상수/라벨 맵(39~45) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| sortDirection 삼항 | 197, 202, 207, 212, 222, 229 | 6 |
| 바디 `border-r border-slate-800/30` | 280, 285, 306, 333, 338, 358 | 6 |
| sticky 바디 `bg-slate-900 group-hover:bg-slate-800` | 238, 270, 271, 274 | 4 |
| OVR 배지 래퍼 | 276, 329 | 2 |
| 이름 셀 | 238~269 | 32 |
| 포지션/나이/OVR sticky 셀 | 270~277 | 8 |
| 헤더 sticky 4개 | 194~213 | 20 |
| 빈 `<th>` 스페이서 | 188, 231 | 2 |

---

## components/roster/RosterStatsStack.tsx (325줄) — "선수 기록" 탭

### 공용 컴포넌트 사용 현황
- Table, TableHead(`noRow`), TableBody, TableRow, TableHeaderCell, TableCell, TableFoot
- Dropdown(296~311, `items` + 직접 만든 `<button>` 트리거 사용), OvrBadge(253), PlayerHoverCard(225), InjuryStatusBadge(240)
- 훅: useLeaderboardData(정렬·히트맵 범위), getHeatmapStyle

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 33 | 기타(WIDTHS) | `NAME:180, POS:60, AGE:50, OVR:60` | - | 공용 상수 | |
| 38~46 | 기타(formatValue) | percent/number/integer 포맷 | - | 공용 `formatStat` | GameLog 207~216, RosterGrid 301/353, PlayerHoverCard 136~140와 중복(퍼센트 포맷 4곳) |
| 104~109 (106 포함) | sticky | `getStickyStyle` | Table `stickyLeft` | 위와 동일 | 본문 동일 |
| 111~130 | 기타(buildHeaderRows) | 그룹 헤더 colSpan 계산 | - | `TableGroupHeaderRow` 내부로 | "LeaderboardTable.tsx와 동일 알고리즘"이라 주석(111) → 범위 밖 사본 1개 더 있음 |
| 140, 146~148 | sort | state + handleSort | - | `useTableSort` | 정렬 자체는 useLeaderboardData가 수행 |
| 153~155 | sticky | LEFT_* | - | 위와 동일 | |
| 172 | table | `Table ... className="!rounded-none !border-x-0 !border-t-0 !bg-slate-950"` | Table | `variant="flush"` | |
| 180 | table(head) | `TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow` | TableHead | 기본값과 100% 중복 | |
| 181~198 (183, 189, 195 포함) | th/group-header | 그룹 헤더 행: `th colSpan={4} ... sticky left-0 z-50` `선수 정보` + 그룹별 `th colSpan` + 빈 th(`border-b border-slate-800`) | TableHeaderCell | `TableGroupHeaderRow` | raw `<th>` 3종, 18줄 |
| 199 | table(head) | `tr.h-10 text-slate-500 text-sm font-black uppercase tracking-widest` | TableHead | 기본 글자 크기 | Overview 144와 동일 |
| 200~203 (203 포함) | th/sticky | sticky 헤더 4개(정렬 없음) | TableHeaderCell | `stickyLeft` | 이 파일은 이름/포지션/나이/OVR에 정렬이 없음(다른 파일은 있음) |
| 204~215 (208 포함) | th/sort/divider | 스탯 헤더: `border-r border-slate-800` + 활성 정렬 시 `text-indigo-400`(208) | TableHeaderCell | `sortDirection`일 때 활성 색은 Table이 처리 | 정렬 활성 글자색은 StatsStack·GameLog만 가짐(Table 화살표 아이콘과 이중 표시) |
| 220 | 기타(원본 선수 조회) | `team.roster.find(...)` 행마다 O(n) | - | - | 추가 발견(성능 소소) |
| 222~249 (223, 236 포함) | td/badge/hover | 이름 sticky 셀(이름 `text-slate-200` + TW + 부상) | 위와 동일 | `PlayerNameCell` | 27줄. 233~238 TW 배지는 문자열 동일 |
| 250~254 (250, 251, 252, 253 포함) | td/ovr | 포지션·나이·OVR sticky 셀 | 위와 동일 | `PlayerInfoCells` | |
| 255~264 (260, 261 포함) | td/stat/heatmap | `TableCell style={bgStyle} className="border-r border-slate-800/30"` + `font-medium text-sm text-white tabular-nums` | TableCell variant="stat" | `heat` prop | 히트맵 배경은 인라인 style |
| 269~283 (270, 275, 277, 278 포함) | footer | `TableFoot className="bg-slate-900 border-t-2 border-slate-800"` > 팀 평균 행(`bg-slate-950 font-black text-indigo-400 text-sm uppercase tracking-widest`) | TableFoot | `TableSummaryRow` | RosterGrid 319~366과 동형 |
| 293~323 (295, 298 포함) | dropdown/section-header | 상단 바 `shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-950` + Dropdown(트리거=`<button class="flex items-center gap-1 text-sm font-black text-slate-400 uppercase tracking-tight hover:text-white ...">` + ChevronDown) | Dropdown + DropdownButton | `DropdownButton variant="plain"` | 트리거 버튼 raw. 항목 라벨 `text-sm`로 감쌈. 세그먼트/탭이 아닌 드롭다운으로 카테고리 전환 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 이름 셀 | 223~249 | 27 |
| TW 배지 | 233~238 | 6 |
| 부상 배지 | 239~247 | 9 |
| 포지션/나이/OVR sticky 셀 | 250~254 | 5 |
| 헤더 sticky 4개 | 200~203 | 4 |
| 그룹 헤더 행 | 181~198 | 18 |

---

## components/roster/TeamGameLog.tsx (397줄) — "경기 기록" 탭

### 공용 컴포넌트 사용 현황
- Table(`tableStyle`로 table-layout 정상 전달), TableHead(`noRow`), TableBody, TableRow, TableHeaderCell(`colSpan` 병합 사용), TableCell, TableFoot
- 미사용: sticky 컬럼 없음(thead sticky만), 상대팀 로고 없음(팀명 텍스트만), PlayerHoverCard 없음
- lucide `Loader2` 직접

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 22~28, 54~58 | 기타(컬럼 정의) | GAME_INFO_COLS 너비(80/36/160/36/80), STAT_WIDTH 56 | - | - | 다른 파일과 별도 체계(WIDTHS 아님) |
| 74, 76~78 | sort | state + handleSort | - | `useTableSort` | handleSort 본문 동일 |
| 130~142 | sort | 날짜/스탯 정렬 | - | 훅 | |
| 207~216 | 기타(formatStat/formatAvg) | percent/정수/소수 포맷 | - | 공용 `formatStat` | 209/210 분기가 동일 결과(`if` 두 갈래가 같은 반환, 죽은 분기, 추가 발견) |
| 218 | 기타 | `statCellClass = "text-sm font-medium text-white tabular-nums"` | - | - | tabular-nums 상수 |
| 225~272 | row | `TableRow className="h-10"` | TableRow | - | 행 높이 `h-10` 명시(Overview 등은 암묵 ~44px) |
| 227~230 (227, 228 포함) | td/divider | 날짜 `border-r border-slate-800/30 text-center align-middle text-sm` + `date.slice(5).replace('-','/')` tabular-nums | TableCell | `GameRowCells` | Schedule 172~174와 동일 마크업 |
| 231~235 | td | 구분(vs/@) | TableCell | `GameRowCells` | |
| 236~246 (237 포함) | td/hover | 상대팀: `flex items-center gap-2 cursor-pointer group/opp` + `text-sm font-semibold text-slate-300 uppercase truncate` + hover `text-indigo-400 underline` | TableCell | `GameRowCells`(상대 링크) | Schedule 175~185와 중복(Schedule은 `group/opp` 없이 span에 hover) |
| 247~252 (248 포함) | td | 결과 W/L `text-emerald-400`/`text-red-400` | TableCell | `GameRowCells` | Schedule 186~192와 중복 |
| 253~265 (254, 256, 259 포함) | td/spinner | 스코어: 로딩 시 `Loader2 size=14 animate-spin text-indigo-400 mx-auto`, 아니면 `cursor-pointer hover:underline` `emerald-300/red-300` | TableCell | `GameRowCells` + `Spinner` | Schedule 193~211과 중복 |
| 266~271 (268 포함) | td/stat | 스탯 21컬럼 `border-r border-slate-800/30 text-center text-sm font-medium text-white tabular-nums` | TableCell | - | |
| 276~284 (278 포함) | section-header | `tr.h-8 > td colSpan bg-slate-800 border-b border-slate-800/50 h-8` > `text-sm font-black text-slate-500 tracking-widest` ("정규 시즌"/"플레이오프") | 없음 | `TableSectionRow` 신규 | raw `<td>`. 이 화면군 유일 섹션 구분행 |
| 286~292 (289 포함) | empty | `h-full flex items-center justify-center` + `text-slate-500 font-bold uppercase tracking-widest text-sm` | 없음 | `EmptyState` 신규 | 4곳(GameLog/Schedule/Coach/TeamSettings)이 서로 다른 모양 |
| 295 | table | `Table className="!rounded-none !border-0 !shadow-none" fullHeight tableStyle={{tableLayout:'fixed',minWidth:'100%'}}` | Table | `variant="flush"` | 다른 4개 파일과 className이 또 다름(`!border-0 !shadow-none`, `!bg-slate-950` 없음) |
| 301, 303 (301, 303 포함) | table(head) | `TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow` + `tr.text-slate-500 text-sm font-black uppercase tracking-widest h-8` | TableHead | 기본 글자·높이 prop | 헤더 높이 `h-8`(32px) — 다른 파일 `h-10`(40px) |
| 304~338 (306, 316, 323, 330 포함) | th/sort/divider | 모든 헤더 셀 `border-r border-slate-800 bg-slate-950` + 활성 `text-indigo-400`/비활성 `text-slate-400`(기본 slate-500 덮어씀) | TableHeaderCell | - | 헤더 글자색이 다른 파일(slate-500)과 다름(slate-400). 불필요한 `bg-slate-950`(thead가 이미 칠함) |
| 356~393 (357, 360, 363, 364, 367, 368, 377, 380, 381, 384, 385 포함) | footer | `TableFoot className="bg-slate-900 border-t-2 border-slate-800"` > 정규/플레이오프 평균 행, `!py-3`, 라벨 `font-black text-indigo-400 text-sm tracking-widest`, 플레이오프 행은 `border-t border-slate-800/50` | TableFoot | `TableSummaryRow` | 두 행이 거의 동일 복사(358~374, 375~391 = 17줄씩) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 바디 `border-r border-slate-800/30` | 227, 231, 237, 248, 254, 268 (+ 367, 384 푸터) | 8 |
| 헤더 `border-r border-slate-800` | 306, 316, 323, 330 | 4 |
| `text-sm font-medium text-slate-400 tabular-nums` | 364, 368, 381, 385 | 4 |
| 정규/플레이오프 평균 행 | 358~374, 375~391 | 34 |
| 퍼센트 포맷 `(v*100).toFixed(1)+'%'` | 208, 214 | 2 |

---

## components/roster/TeamScheduleCalendar.tsx (332줄) — "일정" 탭

### 공용 컴포넌트 사용 현황
- Table, TableHead(`noRow`), TableBody, TableRow, TableHeaderCell, TableCell (TableFoot 미사용)
- PlayerHoverCard(215), `getReadableTextColor`(285)
- lucide `ChevronLeft/Right/Loader2` 직접

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 74 | (오탐) | 주석 "없음" | - | - | 오탐 |
| 110~126 (110, 112, 114, 118, 119, 121 포함) | button/segment(월 이동) | 상단 바 `px-6 py-3 border-b border-slate-800 bg-slate-900 shrink-0` + chevron 버튼 2개 `p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors` + `text-base font-bold text-white tabular-nums` 라벨 | Button(ghost)은 부적합 | IconButton + `MonthNavigator`(선택) | RosterView 289~309 chevron과 동형. 상단 바 배경이 slate-900(StatsStack은 slate-950) |
| 131 | divider | 좌측 패널 `w-1/2 min-w-0 overflow-y-auto custom-scrollbar border-r border-slate-800` | - | - | 2분할 레이아웃 |
| 132~134 (133 포함) | empty | `<p className="text-sm text-slate-500 text-center py-12">이 달엔 예정된 경기가 없습니다.</p>` | 없음 | `EmptyState` | |
| 135 | table | `Table className="!rounded-none !border-x-0 !border-t-0" tableStyle=...` | Table | `variant="flush"` | `!bg-slate-950` 없음 → Table 기본 slate-900 (다른 4개 파일과 다름) |
| 136~142 | table(colgroup) | 64/200/56/80/auto | Table | `columns` | |
| 143, 144 (143 포함) | table(head) | `TableHead className=... noRow` + `tr.h-10 text-slate-500 text-sm font-black uppercase`(**tracking-widest 없음**) | TableHead | 기본 글자 | Payroll 215와 함께 tracking-widest 없는 2곳 |
| 145~149 (145, 146, 147, 148 포함) | th/divider | 헤더: `border-r border-slate-800 bg-slate-950`, 마지막만 없음 | TableHeaderCell | - | 정렬 없음 |
| 171 | row/hover | `TableRow className="h-10 {isToday ? 'bg-yellow-400/10' : ''}"` | TableRow | `highlight` prop | 오늘 강조는 이 파일 고유 |
| 172~174 (172, 173 포함) | td | 날짜 셀(GameLog 227~230과 동일) | TableCell | `GameRowCells` | |
| 175~185 (175 포함) | td/hover | 상대팀 `vs/@` + 팀명 클릭(`hover:text-indigo-400 hover:underline`) | TableCell | `GameRowCells` | GameLog 236~246과 중복 |
| 186~192 (186 포함) | td | 결과 W/L / 미경기 `-` | TableCell | `GameRowCells` | |
| 193~211 (193, 195, 198, 205 포함) | td/spinner | 스코어/예정 시각 + 로딩 스피너 | TableCell | `GameRowCells` + `Spinner` | 경기 후/전 2분기, 각각 tabular-nums |
| 212~232 | td/hovercard | 최우수선수: PlayerHoverCard + 이름 + 스탯 문자열 | TableCell + PlayerHoverCard | - | |
| 243~247 | 기타(요일 헤더) | `grid grid-cols-7` 요일 `text-base font-bold text-slate-500` | - | - | 캘린더 전용 |
| 249~266 (265 포함) | card | 빈 날짜 셀 `aspect-square rounded-lg border border-slate-800/60 bg-slate-800/60 p-1.5` + `text-base font-semibold text-slate-600 tabular-nums` | Card(rounded-3xl·padding 불일치) | 캘린더 전용 `CalendarCell` | 캘린더 셀은 공용 대체 불가(유지) |
| 287~323 (288, 302, 304, 314, 318 포함) | card/button | 경기 셀 `<button aspect-square rounded-lg border p-1.5 ...>` 승/패/상대컬러 분기, 숫자 `tabular-nums`, 오늘 `ring-2 ring-yellow-400` | - | `CalendarCell` | 상대 컬러 배경은 인라인 style. 36줄 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| chevron 버튼 | 112~118, 119~125 | 13 |
| 바디 `border-r border-slate-800/30` | 172, 175, 186, 193 | 4 |
| 헤더 `border-r border-slate-800 bg-slate-950` | 145, 146, 147, 148 | 4 |
| `tabular-nums` 사용 | 118, 173, 198, 205, 265, 302, 304, 314, 318 | 9 |
| 게임 행 셀(날짜·상대·결과·스코어) | 172~211 | 40 |

---

## components/roster/TeamPayrollTable.tsx (457줄) — "재정" 탭

### 공용 컴포넌트 사용 현황
- Table, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot (TableHead 미사용: 199는 raw `<thead>`)
- OvrBadge(255, 359), PlayerHoverCard(241, 341)
- 유틸: formatMoneyFull(전체 달러 표기), flattenRemainingYears 등

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 15 | (오탐) | 주석 속 "sticky" | - | - | 오탐 |
| 16~21 | 기타(WIDTHS/LEFT_*) | NAME/POS/AGE/OVR/CAPPCT + 누적합 + INFO_COL_WIDTH | - | 공용 상수·오프셋 | 모듈 레벨(다른 파일은 컴포넌트 안) |
| 23~27 (25 포함) | sticky | `getStickyStyle(...)` (반환 타입 `React.CSSProperties` 명시) | Table `stickyLeft` | 위와 동일 | 본문 동일 |
| 66~72 | 기타(capPctColor) | Cap% 색 스케일 hex 5구간 | - | - | 하드코딩 hex |
| 76~81 | sort | `sortCol/sortDirection` 별도 state, handleSort(4줄) | - | `useTableSort`(키 숫자 허용) | 다른 파일과 구현이 다름(본문 비동일) |
| 99, 126, 150 | (오탐) | 주석 속 "비어/없음" | - | - | 오탐(주석 3건) |
| 189 | table | `Table style={{...}} fullHeight className="!rounded-none !border-x-0 !border-t-0 !bg-slate-950"` | Table | `variant="flush"` | |
| 190~198 | table(colgroup) | 고정 5 + 자동 6 + 140 | Table | `columns` | |
| 199 | table(head)(sticky) | raw `<thead className="bg-slate-950 sticky top-0 z-40 shadow-sm">` | TableHead(`noRow`) | - | RosterGrid 174와 같은 사유 |
| 200~213 (202, 207, 212 포함) | th/group-header | 그룹 헤더: `th colSpan={5} ... sticky left-0 z-50` `선수 정보`, `시즌별 페이롤`, 마지막 빈 th `border-l` | TableHeaderCell | `TableGroupHeaderRow` | raw `<th>` 3개. 라벨에 `ko-normal`(한글 자간) 사용 — 다른 파일 그룹 헤더(StatsStack 185/191)는 `tracking-widest` |
| 215 | table(head) | `tr.h-10 text-slate-500 text-sm font-black uppercase`(tracking-widest 없음) | TableHead | 기본 글자 | Schedule 144와 동일하게 tracking 없음 |
| 216~220 (220 포함) | th/sticky/divider | sticky 헤더 5개(정렬 없음), Cap% `border-r border-slate-800` | TableHeaderCell | `stickyLeft` | 오버롤 라벨은 "오버롤"(다른 파일 "OVR") |
| 221~229 (223 포함) | th/sort/divider | 시즌 컬럼: `align="right" pr-4 border-r border-r-slate-800/30` + sortable | TableHeaderCell | - | 헤더 구분선이 **연한 /30**(다른 파일은 헤더 slate-800 진함). 문법도 `border-r border-r-slate-800/30`로 다름 |
| 233~237 | row | `TableRow group` + `two_way`면 `opacity-60` + 클릭 시 선수 이동 | TableRow | - | 행 클릭(onClick)은 이 파일만 |
| 239~251 (239, 247 포함) | td/badge/hover | 이름 셀: 이름(`text-slate-200`) + TW 배지. **부상 배지 없음** | TableCell | `PlayerNameCell` | 부상 배지 부재가 의도인지 확인 필요(다른 3개 파일은 표시) |
| 252~256 (252, 253, 254, 255 포함) | td/ovr | 포지션·나이·OVR sticky 셀(OVR에는 `border-r` 없음, Cap%가 마지막 sticky) | TableCell | `PlayerInfoCells` | |
| 257~268 (257, 258 포함) | td/money | Cap% 셀(258은 주석 속 "없음" = 오탐): `capPctColor()` 인라인 style `text-sm font-bold` | TableCell | - | 퍼센트 포맷 `toFixed(1)+'%'` |
| 269~310 (282, 288, 294 포함) | td/money | (282는 주석 = 오탐) 시즌 컬럼: `pr-4 border-r border-r-slate-800/30` + col0 `bg-white/[0.04]` + 금액 `font-medium text-sm` 색(옵션 sky/emerald, 연장 amber, 기본 slate-300) + UFA/RFA 칩(텍스트) | TableCell | `Money mode="full"` | formatMoneyFull 우측정렬, **tabular-nums 없음**(Overview 급여/AAV는 있음). UFA/RFA는 Badge 없이 색 글자 |
| 311~313 (312 포함) | money/td | 총액 `border-l border-l-slate-800` `font-semibold text-sm text-slate-200` | TableCell | `Money` | |
| 316~326 (319 포함) | (오탐) | 데드캡 주석 블록(11줄) | - | - | 319는 주석 속 "없음" 오탐. 주석 11줄이 행 중복 경고를 담고 있음 |
| 327~391 (338, 350, 355~357, 359, 364, 377, 379, 387 포함) | row/td/badge/money | 데드캡 선수 행 65줄: 위 선수 행(233~314)과 거의 동일 복사(이름 셀·sticky 셀·OVR 래퍼·TW 배지·시즌 셀), 금액만 `italic text-red-400` | TableRow/TableCell | 행 렌더러 공용화(`PayrollRow` + `variant="dead"`) | 주석(320~322)이 "둘 중 하나만 고치는 회귀 방지"를 경고 = 복사 구조의 위험 자인 |
| 393~404 (393, 395, 399, 400 포함) | footer/money | `TableFoot className="bg-slate-900 border-t-2 border-slate-800"` > 합계 행: 라벨 `colSpan=5 ... font-black text-indigo-400 text-sm uppercase border-r border-slate-800`, 합계 `formatMoneyFull` `font-semibold text-sm text-white` | TableFoot | `TableSummaryRow` | 라벨 클래스가 RosterGrid(tracking-widest 있음)와 다름 |
| 405~428 (408, 409, 413, 416 포함) | footer/money | 대비 행(캡/사치세/에이프런): `tr.h-9 border-t border-slate-800/50` + 라벨 `font-semibold text-slate-400 text-sm` + 값 `+`/`-` 색 | TableFoot | `TableSummaryRow` | 행 높이 `h-9`(Foot 합계 `h-10`) |
| 429~450 (432 포함) | footer/section-header | 범례: `tr.h-40` > `td colSpan` > `h-40 flex items-start justify-end gap-6 pt-3` + `w-3 h-3 rounded-sm bg-sky-400` 색 사각 + 라벨 | 없음 | `Legend`(색칩+라벨) 신규 | Overview 233~254 푸터와 같은 `h-40` 여백 패턴. 색칩은 Badge 불일치(사각 점) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 선수 행 vs 데드 행(거의 동일 복사) | 233~314, 327~391 | 82 + 65 = 147 |
| sticky 바디 `bg-slate-900 group-hover:bg-slate-800` | 239, 252, 253, 254, 257, 338, 355, 356, 357, 364 | 10 |
| TW 배지 | 244~249, 347~352 | 12 |
| OVR 배지 래퍼 | 255, 359 | 2 |
| 시즌 컬럼 `border-r border-r-slate-800/30` | 223, 288, 377, 399, 413 | 5 |
| `formatMoneyFull` 호출 | 294, 312, 379, 387, 400, 416 | 6 |

---

## components/roster/SalaryCapDashboard.tsx (143줄) — 미사용

### 공용 컴포넌트 사용 현황
- 없음. import: lucide `AlertCircle, Info`(Info 미사용), formatMoney, LEAGUE_FINANCIALS
- grep 결과 이 파일 외 import 0건 → 현재 어디서도 렌더되지 않음. 싱글 상수(`LEAGUE_FINANCIALS`) 기반이라 멀티 `RosterCapSettings`와도 무관.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 13~59 | 기타(상태 색 매핑) | 5단계 `{label,msg,color,bg,border,bar,iconBg}` | Badge(variant 6종과 불일치) | - | 사용처 없음 |
| 74 | card | `px-4 py-8 space-y-8 bg-slate-950/40 rounded-3xl border border-slate-800 animate-in fade-in slide-in-from-top-2` | Card(`variant="flat"` 유사: `bg-slate-950/50 border-slate-800/50 rounded-3xl`) | Card `padding` 커스텀 | |
| 77~79, 82, 83 | card/badge | 아이콘 박스 `p-4 rounded-2xl border`, 상태 라벨 `text-2xl font-black uppercase tracking-tight`, `총 연봉: formatMoney` | - | - | |
| 89~100 (89, 90, 92, 95, 96, 98 포함) | card | 지표 카드 2개 `px-6 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-center min-w-[120px]` + 라벨 `text-[10px] font-black uppercase tracking-widest` | Card(`padding="sm"`) | `StatCard`(라벨+값) 신규 | 두 카드 동일 구조 |
| 104~123 (105, 107~110, 114, 118 포함) | 기타(진행 막대) | 구간별 `flex-[20/30/20/20/10] bg-*-500/5 border-r border-slate-800/50` + 값 막대 + 포인터 | - | `SegmentedProgressBar` | 이 화면군 유일 막대. 107~110은 divider_v로 잡혔으나 실제론 막대 구간 경계선 |
| 124~137 (124, 127, 130, 133, 136 포함) | 기타(눈금 라벨) | `text-[10px] font-black uppercase tracking-widest` CAP/TAX/APR1/APR2 + `formatMoney` | - | - | |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 지표 카드 `px-6 py-3 bg-slate-900 border ... rounded-2xl` | 89~94, 95~100 | 12 |
| 눈금 라벨 `absolute text-center ... border-x` | 125~137 | 13 |
| 상태 5단계 객체 | 14~58 | 45 |

---

## components/roster/StartingLineup.tsx (72줄) — 이 화면군 밖 사용(RotationManager)

### 공용 컴포넌트 사용 현황
- 없음 (lucide `User`). 로스터 화면에서는 렌더되지 않음.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 12~42 (19 포함) | card | PlayerCard: `relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-slate-900/30 border border-dashed border-slate-700/600`, 빈 슬롯 라벨 `text-[10px] font-black uppercase tracking-widest` | Card(`variant="outline"` 유사) | - | 빈/채움 2분기가 컨테이너 클래스만 다름 |
| 56~70 | 기타(5열 그리드) | `grid grid-cols-5 gap-2 md:gap-4` | - | - | |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| (없음) | - | - |

---

## components/roster/RosterTabs.tsx (33줄)

### 공용 컴포넌트 사용 현황
- TabBar(31줄, `tabs/activeTab/onTabChange/theme` 전달) — 공용 사용 완료.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 14~27 | tab(정의) | TABS 상수 9개 | TabBar | - | 체크리스트 매치 0건. 직접 구현 UI 없음 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| (없음) | - | - |

---

## components/multi/TeamSettingsPanel.tsx (279줄) — "팀 설정" 탭(멀티·내 팀)

### 공용 컴포넌트 사용 현황
- common 컴포넌트 0개. 같은 폴더의 ColorField(13), CourtPreview(11)만 사용 (ColorField/CourtPreview는 이 감사 범위 밖, 미열람).
- lucide `Save, Loader2` 직접.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 85~87 (86 포함) | empty | `<p className="text-sm text-slate-400 ko-normal px-6 py-6">` | 없음 | `EmptyState` | GameLog/Schedule/Coach와 모양이 각각 다름 |
| 147~153 (150 포함) | card(경고 배너) | `bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4` > `text-xs text-amber-300` | Badge(`warning`)는 pill용 | `InlineNotice`(tone=warning) 신규 | 150은 empty_state로 잡혔으나 실제론 경고 배너 문구 |
| 161~171 | card | 미리보기 박스 `bg-slate-800/40 border border-slate-800 rounded-xl py-5` + 약어 배지(`w-20 h-20 rounded-2xl` 인라인 팀 컬러) | Card(`variant="flat"` 유사) | - | |
| 174, 204, 219, 231 | section-header | `text-xs font-bold text-slate-500 uppercase tracking-wider` h3 4회 | 없음 | `FormSection`/`SectionTitle` 신규 | 한글 제목에 uppercase tracking-wider |
| 177~180, 183~186 | input(읽기 전용) | `w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-500` div | 없음 | `TextField readOnly` | |
| 189~200 (191 포함) | input | 닉네임 `<input type=text className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">` + label `text-xs text-slate-400 ko-normal block mb-1`(177, 183, 190) | 없음 | `TextField`(label, value, disabled, maxLength) 신규 | 이 화면군 유일의 텍스트 입력 |
| 235~244 (237 포함) | input(checkbox) | label 래퍼 + `<input type=checkbox className="w-4 h-4 accent-indigo-500">` | 없음 | `Checkbox`/`Toggle` 신규 | |
| 245~255 (247, 248 포함) | input(range) | `<input type=range className="flex-1 accent-indigo-500">` + `text-xs font-mono text-slate-400 w-10 text-right` | SliderControl.tsx(common에 존재, 미열람 — 적용 가능성 추정) | 확인 필요 | |
| 260 | 기타(에러 텍스트) | `text-xs text-red-400 ko-normal mt-4` | 없음 | `InlineNotice` | 메모리 피드백("오류는 notify.error 토스트")과 충돌 여지 — 저장 실패 인라인 표시, 확인 필요 |
| 262~275 (263, 269 포함) | button/spinner | 저장 버튼 `w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors` + `Loader2 animate-spin`/`저장됨`/`Save` 3상태 | Button(`variant="primary" fullWidth isLoading icon`) | Button의 `loadingText`가 비어 있으면 children이 나옴 → 로딩 시 텍스트 없이 스피너만 보이려면 prop 조정 | Button primary는 `rounded-2xl uppercase tracking-widest shadow ring`이라 시각 차이 있음 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 섹션 제목 h3 | 174, 204, 219, 231 | 4 |
| 라벨 `text-xs text-slate-400 ko-normal block mb-1` | 177, 183, 190 | 3 |
| 읽기 전용 박스 | 178~180, 184~186 | 6 |
| ColorField 매핑 루프 | 205~207, 232~234 | 6 |

---

## components/dashboard/CoachProfileCard.tsx (112줄) — 코칭스태프 탭(싱글 전용 경로)

### 공용 컴포넌트 사용 현황
- 없음. 공용 Table 전혀 안 씀: raw `<table>`/`<thead>`/`<th>`/`<td>` + 로컬 `thBase`/`tdBase` 문자열.
- formatMoney(축약).

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 12, 13 | th/td(클래스 상수) | `thBase = py-3 px-1.5 text-xs font-black uppercase tracking-widest text-slate-500 whitespace-nowrap border-b border-slate-800 text-center`, `tdBase = py-2 px-3 whitespace-nowrap border-b border-slate-800/50` | TableHeaderCell / TableCell | Table `density="compact"`(text-xs) | TableHeaderCell/TableCell 기본 클래스와 사실상 동일한 사본. GMProfileCard 31~32와 글자 단위 동일 |
| 16~22 (19 포함) | empty | `flex items-center justify-center h-20 text-slate-500 text-xs ko-normal` | 없음 | `EmptyState` | |
| 27~29 (29 포함) | table | `overflow-x-auto` > raw `<table className="w-full border-separate border-spacing-0" style={{minWidth:'800px'}}>` | Table | `Table`의 wrapper가 `rounded-xl border shadow` + `h-full`이라 `variant="flush" fullHeight={false}` 필요 | |
| 30 (30 포함) | table(head)(sticky) | `<thead className="bg-slate-950 sticky top-0 z-40">` | TableHead | - | |
| 31~46 (33, 34, 36, 40, 42 포함) | th/group-header | 그룹 헤더 `tr.h-8`: 빈 `th colSpan=4`, `공격 전술`, `수비 전술`: `py-1 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center bg-slate-950 border-b border-r border-slate-800` | TableHeaderCell | `TableGroupHeaderRow` | 그룹 헤더가 text-[10px](다른 파일은 text-sm). 36/42는 badge_inline 분류이나 실제로는 헤더 |
| 48~64 (49, 50, 51, 52, 54, 56, 62 포함) | th/divider/sticky | 열 헤더: `${thBase} ... border-r border-slate-800` 전부 진한 세로선, 이름 `sticky left-0 z-10` | TableHeaderCell(`stickyLeft`) | - | 헤더 글자 `text-xs`(Overview 등은 `text-sm`). sticky z-10(공용 헤더는 z-50, thead z-40) |
| 67~106 (67, 68, 76, 79, 82, 89, 91, 101 포함) | row/td/hover/divider | 단일 행 `tr.group.hover:bg-white/5`, 바디 `border-r border-slate-800`(진한 선, 다른 파일은 `/30`), 이름 sticky `bg-slate-900 group-hover:bg-slate-800 z-10 transition-colors` | TableRow/TableCell | - | raw `<td>` 7곳. `ko-normal text-xs` 태그 셀 |
| 80, 83 | money/td | 연봉 `text-xs font-mono tabular-nums text-emerald-400` + formatMoney(축약), 잔여 `{n}년` | TableCell | `Money mode="short"` | 이 화면군에서 `font-mono`로 돈을 표시하는 유일한 곳 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 열 헤더 `${thBase} border-r border-slate-800` | 49, 50, 51, 52 | 4 |
| 바디 `${tdBase} border-r border-slate-800 text-center` | 76, 79, 82 | 3 |
| 그룹 헤더 `th` 클래스(`py-1 px-3 text-[10px] ...`) | 34~39, 40~45 | 12 |
| 공격/수비 태그 셀 | 85~96, 97~105 | 21 |

---

## components/dashboard/GMProfileCard.tsx (108줄) — 코칭스태프 탭(싱글 전용 경로)

### 공용 컴포넌트 사용 현황
- 없음. raw `<table>` + 로컬 `thBase`/`tdBase`(CoachProfileCard와 문자열 동일).

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 31, 32 | th/td(클래스 상수) | CoachProfileCard 12~13과 동일 | TableHeaderCell/TableCell | `density="compact"` | |
| 36~38 (37, 38 포함) | table/table(head) | raw `<table minWidth 600>` + `<thead className="bg-slate-950 sticky top-0 z-40">` | Table/TableHead | `variant="flush"` | |
| 39~48 (41, 42, 44 포함) | th/group-header | 그룹 헤더 행 `GM 성향` | TableHeaderCell | `TableGroupHeaderRow` | Coach와 동형 |
| 50~57 (51, 52, 53, 55 포함) | th/divider/sticky | 열 헤더 | TableHeaderCell | `stickyLeft` | |
| 60 (60 포함) | row/hover | `tr.group.hover:bg-white/5` | TableRow | - | |
| 62 | td/sticky/hover | 이름 sticky 셀 | TableCell | - | |
| 71, 79 | td/divider | 성격·노선 셀 `border-r border-slate-800 text-center` | TableCell | - | |
| 87~101 (90, 97 포함) | td | 슬라이더 태그 셀 5개(`!gmProfile`이면 `-`) | TableCell | - | `-` 처리 중복(72~76, 80~84, 88~94) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 데이터 없음 시 `-` 스팬 `text-xs text-slate-600` | 75, 83, 91 | 3 |
| 열 헤더 `border-r border-slate-800` | 52, 53 | 2 |
| 바디 `border-r border-slate-800 text-center` | 71, 79 | 2 |

---

# 화면군 종합

## 테이블 스타일 대조표

| 파일(테이블) | 헤더 글자 클래스 | 헤더 세로선 | 바디 세로선 | 행 높이 | hover | sticky 구현 | 정렬 구현 | 돈 포맷·정렬·tabular-nums |
|---|---|---|---|---|---|---|---|---|
| RosterOverviewGrid | `tr.h-10 text-slate-500 text-sm font-black uppercase tracking-widest`(144) | sticky 3칸 없음(inline `borderRight:none`), OVR와 165~171 `border-r border-slate-800` | OVR만 `border-slate-800`, 나머지 `border-slate-800/30` | 명시 없음, 약 44px(OVR 배지 28 + py-2 16, 추정) | TableRow `hover:bg-white/5` + sticky 셀 `group-hover:bg-slate-800` | 로컬 `getStickyStyle` inline, z 헤더 50/바디 30, 4칸 | 로컬 `sortConfig/handleSort/getSortValue`, 10컬럼 | 샐러리 `formatMoney` 가운데·tabular 없음 / 급여·AAV `MoneyCell`(`$` 좌고정) 우측 tabular-nums |
| RosterGrid(능력치) | 동일(192) | sticky 3칸 없음, OVR·능력치 컬럼 `border-r border-slate-800` | OVR `border-slate-800`, 나머지 `/30` | 약 44px(추정) | 동일 | 로컬 `getStickyStyle`(Overview와 본문 동일) | 로컬 `sortConfig/handleSort/getSortValue`(+stats) | 없음 |
| RosterStatsStack(선수 기록) | 동일(199), 활성 정렬 `text-indigo-400`(208) | OVR·스탯 컬럼 `border-r border-slate-800` | OVR `border-slate-800`, 스탯 `/30` + 히트맵 배경 | 약 44px(추정) | 동일 | 로컬 `getStickyStyle` | 로컬 handleSort + 훅이 정렬 | 없음 |
| TeamGameLog(경기 기록) | `tr.h-8 text-slate-500 text-sm font-black uppercase tracking-widest`(303), 셀 `text-slate-400`/활성 `text-indigo-400`로 덮어씀 | 모든 헤더 셀 `border-r border-slate-800` | 전부 `border-slate-800/30`(푸터 라벨 칸만 `border-slate-800`) | `h-10`(명시) | TableRow 기본 `hover:bg-white/5`, `group` 없음 | sticky 컬럼 없음(thead만 sticky) | 로컬 sortConfig/handleSort, 날짜+스탯 | 없음 |
| TeamScheduleCalendar(좌측) | `tr.h-10 text-slate-500 text-sm font-black uppercase`(144, **tracking-widest 없음**) | `border-r border-slate-800`(마지막 제외) | `border-slate-800/30`(마지막 제외) | `h-10`, 오늘 `bg-yellow-400/10` | 기본 `hover:bg-white/5` | sticky 컬럼 없음 | 없음 | 없음(경기 시각만 tabular-nums) |
| TeamPayrollTable | `tr.h-10 text-slate-500 text-sm font-black uppercase`(215, **tracking-widest 없음**), 그룹 라벨 `ko-normal` | Cap% `border-slate-800`, 시즌 컬럼 `border-r border-r-slate-800/30`(**연함**), 총액 `border-l border-slate-800` | 시즌 컬럼 `border-r border-r-slate-800/30` | 약 44px(추정), 푸터 `h-10`/`h-9`/`h-40` | 동일 + 선수 행 `onClick` 시 `cursor-pointer group` | 로컬 `getStickyStyle` 5칸(+INFO_COL_WIDTH 병합 셀) | 로컬 `sortCol/sortDirection`(숫자 인덱스, 다른 구현) | `formatMoneyFull` 우측 pr-4, `font-medium text-sm`, **tabular-nums 없음** |
| CoachProfileCard | raw `th`: `py-3 px-1.5 text-xs font-black uppercase tracking-widest text-slate-500` (그룹 `text-[10px]`) | 거의 전부 `border-r border-slate-800` | `border-r border-slate-800`(진함) | 약 32px(text-xs + py-2, 추정) | `tr.group.hover:bg-white/5` + 이름 `group-hover:bg-slate-800 transition-colors` | Tailwind `sticky left-0 z-10`(이름 1칸) | 없음 | 연봉 `formatMoney` 가운데 `text-xs font-mono tabular-nums text-emerald-400` |
| GMProfileCard | 동일(thBase) | 앞 3칸 `border-r border-slate-800` | 앞 3칸 `border-slate-800` | 약 32px(추정) | 동일 | `sticky left-0 z-10`(1칸) | 없음 | 없음 |

요약: 헤더 글자는 `text-sm font-black uppercase tracking-widest`(4곳) / tracking 없음(2곳) / `text-xs`(2곳) 3종, 헤더 높이는 `h-10` 5곳 + `h-8` 1곳, 바디 세로선은 `/30` 6곳 + 진함 2곳(카드), 이름 텍스트색은 `text-white` 1곳(Overview) vs `text-slate-200` 3곳, sticky 구현은 inline 4곳 + Tailwind 2곳.

## 로컬 헬퍼 중복표

| 헬퍼 | 파일별 라인 | 본문 동일 여부 |
|---|---|---|
| WIDTHS (NAME 180/POS 60/AGE 50/OVR 60) | Overview 40~44 / RosterGrid 28~35 / StatsStack 33 / Payroll 16 (GameLog 22~28·54~58은 별개 체계) | 앞 4개 값 4곳 동일. 나머지 키(RATING·HEIGHT·ATTR·STAT·CAPPCT)는 파일별 상이 |
| getStickyStyle | Overview 69~74 / StatsStack 104~109 / RosterGrid 149~157 / Payroll 23~27 | 4/4 동일 로직(`left,width,minWidth,maxWidth,position:'sticky',zIndex:30,borderRight: isLast?undefined:'none'`). 차이는 `as const` vs `as 'sticky'` 표기와 Payroll의 반환 타입 명시뿐 |
| LEFT_POS/LEFT_AGE/LEFT_OVR | Overview 121~123 / RosterGrid 144~146 / StatsStack 153~155 / Payroll 17~21(+LEFT_CAPPCT, INFO_COL_WIDTH) | 3곳 글자 단위 동일, Payroll은 모듈 레벨 + 2개 추가 |
| sortConfig·handleSort·getSortValue | Overview 38, 77, 92~108 / RosterGrid 25, 57, 59~99 / StatsStack 140, 146~148 / GameLog 74, 76~78, 130~142 / Payroll 76~81 | handleSort 본문은 Overview·RosterGrid·StatsStack·GameLog 4곳 동일(`prev.key===key && prev.direction==='desc' ? 'asc':'desc'`). sortedRoster 비교 블록은 Overview 111~118 = RosterGrid 102~109. getSortValue는 파일별 고유. Payroll은 `sortCol/sortDirection` 분리 state로 구현 상이 |
| TW 배지 | Overview 184~189 / RosterGrid 244~249 / StatsStack 233~238 / Payroll 244~249, 347~352 | 5곳 className·title·텍스트 동일 |
| 부상 배지 호출 | Overview 190~198 / RosterGrid 250~258 / StatsStack 239~247 | 3곳 동일(`size=16 iconSize=12 strokeWidth=4`, `formatPlayerActiveInjuryLabel`). Payroll은 없음 |
| OVR 배지 래퍼 | Overview 204 / RosterGrid 276, 329 / StatsStack 253 / Payroll 255, 359 | 6곳 동일(`flex justify-center` + `!w-7 !h-7 !text-xs !shadow-none`) |
| 로고 폴백 | RosterView 319~327, 376~384 (TeamLogo 41~43은 1단계만) | RosterView 2곳 글자 동일, TeamLogo와는 체인 길이가 다름. PlayerDetailView에도 사본(주석 언급, 범위 밖) |
| 퍼센트 포맷 | GameLog 208, 214 / StatsStack 39~41 / RosterGrid 301, 353 / PlayerHoverCard 137 | 형태 `(v*100).toFixed(1)+'%'` 동일(StatsStack은 100% 캡 추가) |
| 날짜 포맷 `slice(5).replace('-','/')` | GameLog 228 / Schedule 173 | 동일 |
| thBase/tdBase | Coach 12~13 / GM 31~32 | 글자 단위 동일, 공용 TableHeaderCell/TableCell 클래스의 사본 |
| 이름 셀(hovercard+TW+부상) | Overview 179~200 / RosterGrid 238~269 / StatsStack 223~249 / Payroll 239~251, 338~354 | 구조 동일, 이름 글자색(white vs slate-200), 부상 배지 유무, RosterGrid의 `health` 텍스트가 차이 |
| 팀 평균/합계 라벨 셀 | RosterGrid 322 / StatsStack 272 / GameLog 361 / Payroll 395 | `font-black text-indigo-400 text-sm` + 일부 `uppercase tracking-widest`(GameLog·Payroll은 일부 누락) |

## 통합 후보(효과 큰 순)

"제거 줄 수"는 현재 줄 수를 세어 합산하고, 통합 후 남는 줄 수는 추정(근사치)임. 레이아웃 변경을 동반하는 항목은 선행 조건에 명시.

| 순위 | 후보 | 대상 라인 | 현재 줄 수 → 통합 후(추정) = 제거 | 선행 조건 |
|---|---|---|---|---|
| 1 | 선수 정보 4컬럼 세트(이름 셀+포지션/나이/OVR 셀+정렬 가능 sticky 헤더 4개) `PlayerInfoColumns` | 이름 셀 Overview 179~200(22), RosterGrid 238~269(32), StatsStack 223~249(27), Payroll 239~251(13)+338~354(17) = 111줄 / 포지션·나이·OVR 셀 Overview 201~205(5), RosterGrid 270~277(8), StatsStack 250~254(5), Payroll 252~256(5)+355~363(9) = 32줄 / 헤더 Overview 145~164(20), RosterGrid 194~213(20), StatsStack 200~203(4), Payroll 216~220(5) = 49줄 | 192 → 약 30 = 약 162줄 제거 | (a) Table에 `stickyLeft` 오프셋 API (후보 8), (b) 이름 색 통일(white vs slate-200) 결정, (c) Payroll 부상 배지 부재 의도 확인, (d) TW 배지→Badge 시각 승인 (후보 9), (e) OvrBadge 28px 크기 정식화(후보 10), (f) 현재 `!shadow-none`이 inline boxShadow를 지우는 동작이면 통합 후 OVR 배지 외형이 달라짐(추정) |
| 2 | 미사용 파일 SalaryCapDashboard 삭제 | SalaryCapDashboard 1~143 | 143 → 0 = 143줄 제거 | import 0건 재확인(이번 grep 기준), docs 참조 여부 확인. 통합이 아니라 정리. 삭제 전 `LEAGUE_FINANCIALS` 사용처 영향 없음 확인 |
| 3 | RosterView 팀 로고 폴백 + 팀 드롭다운 공용화 | 로고 311~331(21), 371~388(18) / 드롭다운 339~395(57), 상태·리스너 129~130(2), 152~158(7) | 105 → 약 35 = 약 70줄 제거 | TeamLogo에 real→old→placeholder 체인 옵션, Dropdown에 item/panel className 확장, 팀 드롭다운 디자인(bg-black/zinc) 유지 여부 결정, ↑/↓ 키 핸들러가 `isOpen`을 쓰도록 controlled 모드 사용 |
| 4 | 그룹 헤더 행 `TableGroupHeaderRow` | RosterGrid 176~190(15, stats 전용), StatsStack 181~198(18), Payroll 200~213(14), Coach 32~46(15), GM 40~48(9) | 71 → 약 25 = 약 46줄 제거 | 첫 그룹 sticky colSpan 지원, 헤더 글자 크기 통일(`text-sm` vs Coach/GM `text-[10px]`), `ko-normal` vs `tracking-widest` 결정. StatsStack의 buildHeaderRows(111~130, 20줄)도 함께 이동 가능(+20줄) |
| 5 | RosterGrid 죽은 범례 삭제 | RosterGrid 375~412(38), 39~45(7) | 45 → 0 = 45줄 제거 | `SHOW_ATTR_LEGEND = false` 상수 확인(사용자 요청으로 숨김, 복원 가능성 문의), `GROUP_LABEL_KR`/`ATTR_KR_LABEL` import 정리 |
| 6 | 경기 행 셀 공용화 `GameRowCells`(날짜·상대·결과·스코어) | GameLog 227~265(39), Schedule 172~211(40) | 79 → 약 40 = 약 39줄 제거 | 상대팀 클릭 스타일 통일(`group/opp` vs span hover), 스코어 셀 로딩 처리(Spinner) 통합, 예정 경기 표시(`game.time`) 옵션 |
| 7 | Table sticky 오프셋 API (getStickyStyle 사본 4개 + LEFT_*) | getStickyStyle 26줄(Overview 69~74, StatsStack 104~109, RosterGrid 149~157, Payroll 23~27) + LEFT_* 14줄(Overview 121~123, RosterGrid 144~146, StatsStack 153~155, Payroll 17~21) | 40 → 0 = 40줄 제거 (+ 호출 8×4 줄은 단순화) | Table.tsx 수정(`stickyLeft: number` + `width`), z-index 계층(헤더 50 / 바디 30) 내장, sticky 셀 hover 불투명 배경(`bg-slate-900 group-hover:bg-slate-800`) 내장 — 후보 1의 선행 |
| 8 | 정렬 훅 `useTableSort` | handleSort 3줄×4(Overview 92~94, RosterGrid 59~61, StatsStack 146~148, GameLog 76~78)=12 + 타입/state(Overview 38·77, RosterGrid 25·57, StatsStack 140, GameLog 74)=6 + sortedRoster(Overview 110~119, RosterGrid 101~110)=20 | 38 → 약 8 = 약 30줄 제거 (+ sortDirection 삼항 19회 단축) | Payroll의 숫자 인덱스 정렬(76~81) 지원 방식 결정, StatsStack은 정렬을 훅이 수행하므로 setter만 공유 |
| 9 | TW 배지 → Badge 확장 | Overview 184~189, RosterGrid 244~249, StatsStack 233~238, Payroll 244~249·347~352 | 30 → 5 = 25줄 제거 | Badge에 `shape`(square)·`size="xs"`·`title` prop, uppercase 해제(현재 Badge는 `rounded-full uppercase`, 10/30 불투명도) — 시각 차이 승인 필요 |
| 10 | OVR 배지 크기 정식화 | Overview 204, RosterGrid 276·329, StatsStack 253, Payroll 255·359 | 6줄 수정(삭제 0) | OvrBadge `size="table"`(28px, text-xs) 추가 또는 TableCell `variant="ovr"`가 중앙정렬 래퍼 포함. `!shadow-none` 제거 시 외형 변화 여부 확인(추정) |
| 11 | 급여 데드 행 중복 제거 `PayrollRow` | Payroll 233~314(82) vs 327~391(65) | 147 → 약 95 = 약 52줄 제거 | 데드 행 변형(`variant="dead"`), 선수 없을 때 폴백, 주석 320~322가 요구하는 "둘 다 동일 마크업" 보장이 구조적으로 해결됨 |
| 12 | 정규/플레이오프 평균 행 `TableSummaryRow` | GameLog 358~374·375~391(34), RosterGrid 319~366, StatsStack 269~283, Payroll 393~428 | GameLog 단독 34 → 약 18 = 약 16줄 제거(전체 적용 시 더 큼) | 푸터 className 통일(`bg-slate-900 border-t-2` 4곳 vs Overview 기본값), 라벨 셀 클래스 통일 |
| 13 | IconButton + 월 이동/팀 이동 chevron | RosterView 291~308(18), Schedule 112~124(13) | 31 → 약 12 = 약 19줄 제거 | IconButton 신규(`tone`로 onDark/ghost), Button의 uppercase tracking-widest rounded-2xl과 분리 |
| 14 | Coach/GM 카드 → Table 공용 전환 | Coach 12~13·29~108, GM 31~32·37~104 | 약 190 → 약 130 = 약 60줄 제거(추정) | `Table variant="flush"`/`density="compact"`(text-xs), 바디 세로선 진함/연함 통일, 싱글 전용 경로라 사용 빈도 낮음 → 우선순위 낮음 |
| 15 | 테이블 컨테이너 className 묶음 `variant="flush"` + `tableStyle` 정정 | Overview 128, RosterGrid 164, StatsStack 172, Payroll 189 (+ Schedule 135, GameLog 295 변형) | 4~6줄 수정(삭제 0) | **`style` vs `tableStyle` 불일치 정정은 레이아웃을 바꿀 수 있음** → 화면 비교 필수(추정), GameLog/Schedule과 className 차이(`!border-0 !shadow-none`, `!bg-slate-950` 유무) 정리 |
| 16 | EmptyState / Spinner / InlineNotice | GameLog 286~292(7), Schedule 132~134(3), Coach 16~22(7), TeamSettings 86(1) / 스피너 GameLog 256, Schedule 195, MultiRoster 279 / TeamSettings 147~153(7), 260(1) | 소규모(각 1~7줄) | 신규 3종 추가가 필요해 효과 대비 비용이 큼, 후순위 |
| 17 | 돈 표기 `Money`(short/full/accounting) | Overview 61~67(MoneyCell 7줄)·211·213·214, Payroll 294·312·379·387·400·416, Coach 80 | MoneyCell 7줄 제거 + 13개 호출부 단순화 | 돈 표기 정책 결정(축약/전체/회계식), 재정 탭 tabular-nums 추가는 시각 변화 |
| 18 | TeamSettingsPanel 폼 요소(TextField·Checkbox·FormSection·Button) | 174·204·219·231(h3), 177~200(라벨+입력), 235~244, 262~275(저장 버튼 14) | 약 50 → 약 30 = 약 20줄 제거(추정) | Button primary 시각 차이(rounded-2xl·uppercase) 승인, 저장 실패 표시를 notify.error로 바꿀지 결정(메모리 피드백) |

참고: 후보 1 + 7 + 9 + 10은 한 묶음으로 진행해야 효과가 나옴(1이 7·9·10에 의존). 후보 2·5는 의존성 없는 순수 삭제.

## 체크리스트 대조 결과

체크리스트 파일(`by_file/*.md`)의 "매치" 행을 라인 번호 단위로 위 표에 대조함. 반영 = 해당 라인이 위 표의 "라인" 열에 포함된 경우, 오탐 = 주석/로직 계산 등 UI 조각이 아닌 매치(표에 "오탐"으로 표기).

| 파일 | 매치 수 | 반영 수 | 오탐 수 | 추가 발견 수 | 오탐 라인 |
|---|---|---|---|---|---|
| views/RosterView.tsx | 20 | 17 | 3 | 7 | 277, 278, 286 (주석) |
| views/multi/season/MultiRosterView.tsx | 1 | 1 | 0 | 1 | - |
| components/roster/RosterOverviewGrid.tsx | 36 | 34 | 2 | 9 | 61(주석), 100(정렬 키 계산) |
| components/roster/RosterGrid.tsx | 46 | 41 | 5 | 6 | 68, 115(로직), 143, 148, 283(주석) |
| components/roster/RosterStatsStack.tsx | 30 | 30 | 0 | 7 | - |
| components/roster/TeamGameLog.tsx | 35 | 35 | 0 | 5 | - |
| components/roster/TeamScheduleCalendar.tsx | 29 | 28 | 1 | 5 | 74(주석) |
| components/roster/TeamPayrollTable.tsx | 52 | 45 | 7 | 7 | 15, 99, 126, 150, 258, 282, 319 (주석 7건) |
| components/roster/SalaryCapDashboard.tsx | 22 | 22 | 0 | 1 | - |
| components/roster/StartingLineup.tsx | 1 | 1 | 0 | 1 | - |
| components/roster/RosterTabs.tsx | 0 | 0 | 0 | 0 | - |
| components/multi/TeamSettingsPanel.tsx | 8 | 8 | 0 | 4 | - |
| components/dashboard/CoachProfileCard.tsx | 48 | 48 | 0 | 0 | - |
| components/dashboard/GMProfileCard.tsx | 33 | 33 | 0 | 0 | - |
| 합계 | 361 | 343 | 18 | 53 | |

비고:
- 추가 발견 수 = 직접 구현 표에서 체크리스트 라인과 겹치지 않는 행의 개수(스크립트로 계산; RosterTabs의 TABS 정의 행은 UI 조각이 아니라 0으로 처리). 체크리스트 라인 번호를 중복 제거하면 총 283개 고유 라인(스크립트 검증: 누락 0).
- 매치 수는 체크리스트 각 파일 헤더의 "매치" 값. 일부 라인은 한 줄에 두 토큰(예: 143 `z-40`+`sticky`)이 있어 매치 행이 라인보다 많음.
- "분류 정정" 사례(오탐은 아니나 체크리스트 분류와 실제가 다른 것): RosterView 296/305(row_hover → 버튼 hover), RosterView 345(header_text → 팀명 타이틀), TeamSettingsPanel 150(empty_state → 경고 배너), SalaryCapDashboard 107~110(divider_v → 막대 구간선), CoachProfileCard 36/42(badge_inline → 그룹 헤더).
- 추가 발견(체크리스트에 없던 항목) 핵심: Table `style`→wrapper div 불일치(4곳), Overview/Payroll/GameLog 푸터·헤더 클래스 불일치, TableCell `variant="ovr"` 중앙정렬 한계(추정), `!shadow-none`이 OVR 배지 inline boxShadow를 덮는 가능성(추정), Payroll 부상 배지 부재, 이름 글자색 불일치, SalaryCapDashboard 미사용, RosterGrid 범례 죽은 코드, Overview 샐러리/급여 컬럼 중복 가능성(추정), 배너 `px-9` vs TabBar `px-8`, 멀티에서 Coach/GM 탭이 숨겨진다는 사실.
- 검증하지 못한 것(추정): 실제 렌더 시 행 높이(44px/32px)와 sticky 셀·행 hover 색 차이, OvrBadge `!shadow-none`의 효과, 밝은 팀 컬러에서 배너 흰 글씨 가독성, Badge 교체 시 시각 차이.
