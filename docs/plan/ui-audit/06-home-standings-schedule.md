# 06 홈·순위·일정·리더보드 — UI 조각 전수 감사

읽은 범위 (전부 Read로 마지막 줄까지 정독, grep 대체 없음):
- `pages/MultiSeasonPage.tsx`: 1~1216줄 (전부)
- `views/multi/season/MultiStandingsView.tsx`: 1~869줄 (전부)
- `views/multi/season/MultiScheduleView.tsx`: 1~845줄 (전부)
- `views/multi/season/MultiLeaderboardView.tsx`: 1~155줄 (전부)
- 위임 대상 공용 리더보드 3파일 (MultiLeaderboardView는 UI 조각이 거의 없고 전부 여기로 위임됨):
  - `views/LeaderboardView.tsx`: 1~278줄 (전부)
  - `components/leaderboard/LeaderboardToolbar.tsx`: 1~442줄 (전부)
  - `components/leaderboard/LeaderboardTable.tsx`: 1~437줄 (전부)
- 먼저 읽은 공용 API (감사 대상 아님): `components/common/` 의 Table, TabBar, Button, Badge, Card, Modal, Dropdown, PageHeader, Skeleton, TeamLogo, TeamBadge, OvrBadge, InjuryStatusBadge 각 전부. 추가로 `TeamMark.tsx`(로고 폴백 체인을 이미 갖고 있는 공용 컴포넌트)도 전부 읽음.
- 기계 추출 체크리스트: `scratchpad/ui-audit/by_file/` 의 4개 md (합계 171행). LeaderboardView 계열은 체크리스트가 없어 직접 작성.

표 표기 규칙: ID 뒤의 `★`는 기계 체크리스트에 없던 추가 발견. 라인은 해당 파일 기준. "추정"은 코드로 확인하지 못한 판단.

### 먼저 알아둘 공용 API의 한계 (대체 가능성 판단 근거)
- `Table`: 래퍼가 항상 `rounded-xl border shadow-lg bg-slate-900 overflow-auto`, 내부 `border-separate`. 셀 기본 `py-2 px-3`, 헤더 기본 `py-3 px-1.5 text-xs font-black uppercase tracking-widest`. 홈의 압축 표(`py-1 px-1 text-sm font-bold text-slate-600`)를 담을 variant가 없음.
- `TabBar`: 밑줄형 `px-8 h-14` 전용. 세그먼트(알약 묶음) 형태는 공용에 없음.
- `Button`: 항상 `rounded-2xl font-black uppercase tracking-widest`. `rounded-md`/`h-6`/아이콘 전용 크기가 없음.
- `Badge`: 텍스트 알약 전용. 닫기(X) 달린 칩, 아이콘 원형 배지는 없음.
- `PageHeader`: `text-4xl lg:text-5xl pb-6` 대형 타이틀용. 이 화면군의 `px-4 py-3` 얇은 바와 맞지 않음.
- `Dropdown`: 항목형(items)과 children 둘 다 지원, 패널 `z-[9999]`. 체크박스 다중선택 모양은 children으로만 가능.
- `TeamMark`(`components/common/TeamMark.tsx`): `badge` prop을 주면 `getRealTeamLogoUrl` → `getTeamLogoUrl` → placehold.co 폴백 체인 `<img>`를 이미 그려줌. 이 화면군의 직접 구현 3곳과 동일한 체인.

---

## pages/MultiSeasonPage.tsx (1216줄)

### 공용 컴포넌트 사용 현황
| 공용 컴포넌트 | 사용 라인 | 비고 |
|---|---|---|
| TeamBadge (`size="xs"`) | 139-143(순위표), 323-327(리더), 816-820(내 일정) | `colorPrimary` 있으면 색 사각 배지, 없으면 TeamLogo. 순위/일정 화면은 이 컴포넌트를 쓰지 않고 raw `<img>` 로고를 씀 (불일치) |
| InjuryStatusBadge (`size={16} iconSize={10} strokeWidth={4}`) | 694, 1097 | 두 곳 모두 동일 props |
| OvrBadge (`size="sm" className="!text-xs"`) | 976 | `!text-xs` 강제 오버라이드 (`textClassName` prop이 이미 있음) |
| SEVERITY_TEXT_COLOR (InjuryStatusBadge 모듈 export) | 704, 1107 | |
| 미사용 | Table 계열, TabBar, Button, Badge, Card, Modal, Dropdown, PageHeader, Skeleton, TeamLogo | 홈 전체가 raw table/div로 구성 |
| (참고) 직접 import | `getRealTeamLogoUrl`, `getTeamLogoUrl` (1162, 1171, 1178) | 마스트헤드에서 공용 TeamLogo/TeamMark를 쓰지 않고 `<img>` 직접 |

### 직접 구현 UI 조각
정적 `<table>`은 **3곳**(104, 787, 949)입니다. 요청하신 "4개"는 렌더 인스턴스 기준으로 HomeStandingsTable이 동/서부 2회 렌더(189, 190, 통합 폴백은 193)되어 4~5개로 보이는 것으로 추정되며, 소스상 `<table` 토큰은 3개입니다 (체크리스트도 3).

| 라인 | 종류 | 현재 구현 요약 (핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| H1★ 59-64, 123-126 | 기타(row tint) | 직행권/플레이인권 행 배경을 `style={{backgroundColor: rgba(...)}}` 알파 선형보간 | TableRow (`...props`로 style 전달됨) | 없음 (그대로 가능) | 순위 화면(ST6)은 `${groupColor}66` 헥스 알파로 다른 방식 틴트 — 방식 2종 |
| H2 104 | table | **표 #1** HomeStandingsTable: `w-full text-left border-collapse bg-slate-900` (렌더: 189 동부, 190 서부, 193 통합) | Table + TableHead + TableBody | Table `density="compact"` + 래퍼 크롬 제거(`bare`) | Table은 `border-separate`라 `tr`의 `border-b`가 안 먹음 → 구분선을 td로 옮겨야 함 |
| H3 105-114 (th 107-112) | table-header / th | `tr.border-b.border-slate-800.bg-slate-900` + th 6개 `py-1 px-1 text-sm font-bold text-slate-600 [text-center]`, 첫 th `w-5` | TableHeaderCell (align/width 있음) | compact 헤더 스타일(대소문자 그대로, tracking 없음, slate-600) | 공용 기본은 `text-xs font-black uppercase tracking-widest` — 완전히 다른 타이포 |
| H4 130-135 | hover / divider | `tr` onClick + `cursor-pointer hover:bg-white/5 transition-colors` + 컷라인 `border-b-2 border-slate-700`, 그 외 `border-b border-slate-800/60` | TableRow (hover:bg-white/5, onClick 시 cursor-pointer 내장) | 행 구분선 variant (마지막 행 제외 `slate-800/60`), 컷라인 prop | 134행의 `border-b-2`는 체크리스트 `tab_underline`이지만 탭이 아님 → 오탐 |
| H5 136-150 | td / logo / money 아님 | td 6개 `py-1 px-1 text-sm`: 순위(slate-500), 팀(TeamBadge xs + 팀명 `font-bold text-slate-300 truncate`), W/L(`text-center text-slate-300`), PCT(`tabular-nums text-slate-400`), GB(`text-slate-500`) | TableCell (variant text/stat) | compact 셀 패딩 | 순위 화면은 W/L을 평균 대비 색(emerald/red)으로 칠하지만 홈은 무색 — 같은 데이터 표현 불일치 |
| H6★ 186, 300, 368, 541, 674, 938, 1078 (+h4 861, 866) | section-header | `h3.text-lg.font-black.text-white` 7곳 + 내 일정 칸 소제목 `h4` 동일 클래스 2곳 | PageHeader (크기 불일치로 부적합) | 신규 `SectionHeader`(title, actions) | 9곳이 동일 클래스 문자열 |
| H7★ 308 | section-header | 리더 카테고리 라벨 `h4.text-sm.font-black.text-slate-500.uppercase.px-1` (9회 map) | 없음 | `SectionHeader size="sm"` | `uppercase`인데 라벨이 한글 |
| H8★ 309, 378, 542, 680, 1084 | card | 리스트 래퍼 `div.bg-slate-900` (테두리·라운드 없음) | Card (`rounded-3xl` 기본이라 부적합) | Card `variant="plain"`(radius/border 없음) 또는 Table bare | 5곳 |
| H9★ 310-315, 543-548, 681-686, 1085-1090 | table-header (div 흉내) | flex 행 `py-1 px-2 border-b border-slate-800`, 열 제목 `text-sm font-bold text-slate-600`, 폭 `w-24 shrink-0` 등 수동 지정, 스페이서 `w-7 h-5`(TeamBadge xs 폭 맞춤) | TableHeaderCell | div 리스트를 `<Table>`로 전환하거나 `ListHeader` 신규 | 4곳 × 6줄 = 24줄. 이름 열 폭이 부상 소식 `w-24`(683) vs 내 부상자 `w-36`(1087)로 불일치 |
| H10 317-332 | row / hover | div 행 `flex gap-1.5 py-1 cursor-pointer hover:bg-white/5 transition-colors` + 마지막 제외 `border-b border-slate-800/60`; 순위 `w-3`, TeamBadge xs, 선수명(PlayerHoverCard) `truncate flex-1`, 값 `tabular-nums text-white` | TableRow/TableCell | 위 H2~H5 compact variant로 `<table>` 전환 | 9개 카테고리 × 3행 |
| H11 369-376 | spinner / empty | 로딩 `div.flex.justify-center.py-8 > Loader2 size=20 animate-spin text-indigo-400`; 빈 상태 `p.text-sm.text-slate-500.ko-normal.py-6.text-center.border.border-dashed.border-slate-800.rounded-lg` | 없음 | 신규 `LoadingState`, `EmptyState` | 빈 상태 `py-6`은 이 한 곳만 (나머지 `py-8`) — 불일치. 체크리스트 375 반영 |
| H12 381-395 | row / hover | 뉴스 2열 리스트 행: `justify-between py-1.5 px-2` 헤드라인 `truncate` + 날짜 `tabular-nums text-slate-500`; 구분선 `border-b border-slate-800/60` | TableRow/TableCell | 2열 분할은 레이아웃 그대로 | 행 패딩 `py-1.5`(뉴스·트랜잭션·부상) vs `py-1`(리더·표) 혼재 |
| H13 549-601 | row / 기타 | 트랜잭션 행: 종류 열 `w-24`에 **원형 아이콘 배지** `w-4 h-4 rounded-full bg-indigo-600/emerald-600/red-600` + lucide 아이콘 size 10 (559-561), 선수명 클릭 링크, 팀 이동 `ABBR → ABBR` 각각 클릭 링크, 날짜 | Badge(텍스트 알약이라 부적합), InjuryStatusBadge(색 고정이라 부적합) | 신규 `IconBadge`(color, icon, size) | 코멘트(435-438)에 "MultiFrontOfficeView의 `w-5 h-5` 토글과 동일 마크업 재사용"이라 적혀 있으나 이쪽은 `w-4 h-4` → 크기 불일치 |
| H14★ 569, 582, 589, 822 | 기타(link) | 클릭 가능한 텍스트 `cursor-pointer hover:text-indigo-400 hover:underline` 4곳 | TableCell variant="player" (group-hover 방식으로 유사) | 신규 `TextLink`/`ClickableText` | 일정 화면 SC6·SC7에서도 동일 클래스 반복 (파일 간 반복) |
| H15 674-678 | spinner | 부상 소식 로딩 스피너 (체크리스트 677) | 위 `LoadingState` | | |
| H16 689-707 | row | 부상 소식 행: InjuryStatusBadge + 선수명 `w-24 truncate` + 부상명 `flex-1 text-slate-400` + 기간(`SEVERITY_TEXT_COLOR`) | InjuryStatusBadge ✓ | 행 구조는 H10과 동일 | `typeLabel`/`durationLabel` 렌더가 내 부상자 표(1104-1109)와 거의 동일 — 두 섹션 구조 중복 |
| H17 786-844 | table | **표 #2** renderTable (최근/예정 5경기): `w-full text-left border-collapse bg-slate-900` (호출 862, 867) | Table | H2와 동일 | |
| H18 788-794 (th 790-792) | th | `tr.border-b.border-slate-800` th 3개 `py-1 pl-2 pr-1 text-sm font-bold text-slate-600` — 패딩이 표 #1과 달리 `pl-2 pr-1` / `pl-1 pr-2` | TableHeaderCell | H3과 동일 | 같은 홈 안에서 표마다 th 패딩이 다름 (표#1 `px-1`, 표#2 `pl-2 pr-1`) |
| H19 807-838 (td 812, 813, 830) | td / hover | tr onClick + hover + 구분선; 날짜 `tabular-nums text-slate-500`; 상대 셀 `vs/@` + TeamBadge xs + 팀약어 링크 + 상대 전적; 결과 셀 W/L 색(`text-emerald-400`/`text-red-400`) 또는 시간 | TableRow/TableCell | compact | W/L 결과 색 텍스트(832)는 Badge 후보 아님(텍스트 유지) |
| H20 848-870 | empty | `p.text-sm.text-slate-500.ko-normal.py-8.text-center.border-dashed.rounded-lg` 2곳 (849, 853) | 신규 `EmptyState` | | |
| H21 948-996 | table | **표 #3** 내 로스터 요약: 동일 `border-collapse` 표, th 11개 (952-962) | Table | H2와 동일 | |
| H22 952-962 | th | `py-1 pl-2 pr-1 w-8`(OVR 열, 내용 없음), 선수, POS/MPG/PPG/APG/RPG/SPG/BPG/FG%/3P% 모두 `text-center` | TableHeaderCell | | 헤더 라벨 영문 약어 `uppercase` 아님 (순위 화면은 uppercase) |
| H23 976 | ovr | `<OvrBadge value size="sm" className="!text-xs"/>` | OvrBadge ✓ | `textClassName="text-xs"` 로 교체 가능 | `!text-xs`(12px)는 sm 기본(10px)보다 커서 100+ OVR(9px 규칙)이면 24px 박스 초과 가능 — 추정 |
| H24 977-981 | td / hover card | 선수명 `PlayerHoverCard > span.text-sm.font-bold.text-slate-200.truncate` | TableCell variant="player" | HoverCard 감싸기 허용 | TableCell player variant는 `onClick` 있을 때만 hover 효과 |
| H25 940-946, 1079-1082 | empty | `참가 중인 팀이 없습니다.`·`로스터 정보를 불러오는 중입니다.`(944-946, **로딩 문구를 빈 상태 스타일로 표시**) | `EmptyState`, `Skeleton` | | 로딩을 empty box로 그리는 것은 불일치 (Skeleton 공용 존재) |
| H26 1084-1112 | row | 내 팀 부상자 행: H16과 동일 구조 (이름 폭만 `w-36`) | 위와 동일 | | |
| H27★ 1136-1190 | page-header | **마스트헤드**: `relative grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 mb-4`; 좌 네이비(`#1D4487` 인라인), 우 팀 `color_primary`; 각 `px-6 py-6`, 타이틀 `text-2xl font-black`, 로고 `w-16 h-16` + 워터마크 `absolute -right-8 -bottom-10 w-48 h-48 opacity-10` | PageHeader(스케일 불일치로 부적합) | 신규 `Masthead`/`TeamHeroBanner`(bg, text, logo) | 다른 3개 화면의 헤더 바와 전혀 다른 문법 |
| H28★ 1141-1152, 1161-1183 | logo-fallback | 좌측 PBL.svg `<img>` 2개, 우측 `getRealTeamLogoUrl` → `onError`에서 `dataset.fallback !== 'old'` → `getTeamLogoUrl` → `placehold.co/100x100?text=BPL` (1170-1183, 14줄) | TeamMark (`badge` 전달 시 동일 체인) | TeamMark에 `badge` 필수 객체를 optional화 또는 `real` boolean prop | 체크리스트 1176·1177·1180 반영. 같은 체인이 순위 ST8, 일정 SC2에도 복제 |
| H29★ 1118-1130 | 기타(색상) | `LEAGUE_NAVY_COLOR='#1D4487'` 인라인 style, 폴백 `#4338ca` | 토큰 없음 | 디자인 토큰화 | 하드코딩 hex |
| H30★ 1133, 1192-1210 | 기타(layout) | 루트 `p-4 min-h-full`, `grid grid-cols-2 gap-4`, 좌/우 `space-y-6` | — | — | 다른 3개 화면은 `h-full` 풀블리드 레이아웃. 홈만 `p-4` 패딩 |
| H31★ 36-45 | 기타(fmt) | 로컬 `fmtPct` (>=1 → '1.000') | — | 공용 포맷 유틸 | 순위 화면에도 `fmtPct` 별도 구현 (56행) — 중복 |
| H32★ 118-120 | 기타(calc) | GB 계산 `((leader.W-leader.L)-(rec.W-rec.L))/2` | — | 유틸 | 순위 화면 559-561과 동일 식 중복 |
| H33★ 242-275 외 | 기타(hook 중복) | `allRosterIds`→`useLeagueRawStats(…{includePbp:false})`→`todaySimDate`→`buildActiveInjurySeverityMap` 블록이 리더(252-275)·트랜잭션(475-497)·로스터 요약(902-922)·내 부상자(1032-1060) 4곳에 복제 | — | `useActiveInjuryMap(league, schedule…)` 훅 | UI 외 발견. 약 80~95줄 (주석 포함, 추정) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 섹션 제목 `text-lg font-black text-white` (h3 7 + h4 2) | 186, 300, 368, 541, 674, 938, 1078, 861, 866 | 9줄 |
| 빈 상태 `p…border-dashed…rounded-lg` (3줄 블록) | 374-376, 849-851, 853-855, 940-942, 944-946, 1080-1082 | 18줄 (6블록) |
| 로딩 스피너 래퍼 `div > Loader2 size=20` | 370-372, 676-678 | 6줄 |
| 리스트 헤더 div 행 (`py-1 px-2 border-b border-slate-800`) | 310-315, 543-548, 681-686, 1085-1090 | 24줄 |
| 행 클릭+hover+마지막 제외 구분선 className | 134, 320, 385, 555, 692, 810, 974, 1095 | 8줄 (8곳, 문자열 동일 계열) |
| 표 thead + th | 105-114, 788-794, 950-964 | 32줄 (th 20개) |
| `td className="py-1 px-1 text-sm …"` | 136-150, 812-830, 976-990 | td 20개 |
| TeamBadge xs 4-prop 호출 (`abbr`, `colorPrimary`, `colorSecondary`, `colorText`) | 139-143, 323-327, 816-820 | 15줄 |
| 클릭 텍스트 링크 `cursor-pointer hover:text-indigo-400 hover:underline` | 569, 582, 589, 822 | 4줄 |
| 활성 부상 맵 계산 블록 | 252-275, 475-497, 902-922, 1032-1060 | 약 80~95줄 (추정) |
| 로고 폴백 체인 | 1170-1183 | 14줄 |

---

## views/multi/season/MultiStandingsView.tsx (869줄)

### 공용 컴포넌트 사용 현황
| 공용 컴포넌트 | 사용 라인 | 비고 |
|---|---|---|
| Table | 626-630 (`style={{tableLayout:'fixed',minWidth:'100%'}} fullHeight className="!rounded-none !border-x-0 !border-t-0 custom-scrollbar-hide"`) | 크롬 제거를 `!` 오버라이드 3개로 처리 |
| TableHead (`noRow`) | 636 | 직접 `tr` 작성 |
| TableHeaderCell | 639-649 | `className`에 `border-r border-slate-800 bg-slate-950` 반복 |
| TableBody / TableRow / TableCell | 654, 695, 697/706/740/769 | |
| 미사용 | TabBar, Button, Badge, Card, Modal, Dropdown, PageHeader, Skeleton, TeamLogo, TeamBadge, OvrBadge | 로고는 raw `<img>` |

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약 (핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| ST1 24-30, 610-622 | segment / tab / button | `div.flex.gap-1.bg-slate-800.rounded-md.p-1` 안에 `button.px-3.py-1.5.rounded.text-sm.font-bold`, 활성 `bg-slate-600 text-white`, 비활성 `text-slate-400 hover:text-white` (리그/컨퍼런스/디비전) | TabBar (밑줄형이라 형태 불일치) | 신규 `SegmentedControl`(options, value, onChange) | 체크리스트 610(segment_ctrl)·612(button_raw). 저장소에 같은 클래스 4곳 존재 (grep 결과) |
| ST2 608-609, 623 | page-header | `div.flex.items-center.justify-between.px-4.py-3.shrink-0.bg-slate-900.border-b.border-slate-800` + `h1.text-lg.font-black.text-white.ko-tight.truncate` | PageHeader (크기 불일치) | `PageHeader variant="bar"`(title, actions) | 체크리스트 608(divider_b). 같은 문자열이 Schedule 741(grid 변형), FrontOffice 1445, AllStar 402, ShotChartTab 116에도 있음 (grep) |
| ST3★ 625-630 | 기타(table chrome) | `Table`에 `!rounded-none !border-x-0 !border-t-0 custom-scrollbar-hide` | Table | `Table bleed` prop | 일정은 `!rounded-none !shadow-none`, 리더보드는 `!rounded-none !border-0 !shadow-none custom-scrollbar-hide` — 같은 의도, 오버라이드 세트가 3종 |
| ST4★ 631-633, 639-643 | 기타(colgroup) | `<colgroup>`에 폭을 주고 `TableHeaderCell width={c.width}`로도 폭을 이중 지정 | Table | — | 폭 이중 지정 (추정: 한쪽은 불필요) |
| ST5 635-653 | table-header | `TableHead noRow` + 직접 `tr.text-slate-500.text-sm.font-black.uppercase.tracking-widest.h-10` (637), 셀마다 `border-r border-slate-800 bg-slate-950` (643) | TableHead (noRow=false면 같은 tr을 자동 생성하지만 `text-xs`) | `TableHead textSize` 또는 헤더 크기 통일 | `bg-slate-950`은 thead가 이미 `bg-slate-950`이라 중복(추정). 체크리스트 637(header_text)·643(divider_v) 반영 |
| ST6 665-693 | table-header(그룹 서브헤더 `<tr>`) | 컨퍼런스/디비전 모드에서 그룹 첫 행 앞에 raw `tr.text-white.text-sm.font-black.uppercase.tracking-widest.h-10` + raw `td` 16개: 첫 td `colSpan=2` 그룹 라벨(`style={groupTint}` = `${color}66` 배경, `${color}b3` 보더), 나머지 15개 td가 컬럼 라벨을 **다시 렌더**하고 정렬 화살표(ArrowUp/ArrowDown size 10, 683-688)까지 직접 구현 | TableHeaderCell (정렬 화살표 내장, 139-144) | 신규 `TableGroupRow`(label, tint, columns, sort) 또는 TableHeaderCell을 `td`로도 쓸 수 있게 `as` prop | 체크리스트 666(header_text), 667·675(td_raw), 670·679(divider_b/v) 반영. `className`에 `bg-slate-950`과 인라인 `style` 배경이 동시에 있음 |
| ST7 695-699 | td | 순위 `TableCell align="center" className="text-sm tabular-nums text-white border-r border-slate-800/30"` | TableCell variant="rank" (정의는 있으나 renderContent에 case 없음 → 기본으로 떨어짐) | variant rank 구현 | 체크리스트 697 (divider_v, tabular) |
| ST8 701-733 | td / logo-fallback | 팀 셀: raw `<img src=getRealTeamLogoUrl w-6 h-6 object-contain shrink-0>` + `onError` 3단 폴백(708-721, 14줄) + 팀명 `span.text-sm.font-semibold.truncate.cursor-pointer.hover:underline`, 색은 클린치 상태(emerald-400 / slate-600 / slate-200) | TeamMark badge / TeamBadge | 로고 폴백 공용화, 팀명 색은 prop | 체크리스트 706(divider_v), 714·715(logo_fallback), 718(placehold). 홈 H5는 TeamBadge xs(색 사각 배지), 여기는 실제 로고 — 같은 팀이 화면마다 다른 모양 |
| ST9 736-777 | td / 기타(색 규칙) | 데이터 셀 `TableCell align="center" className="text-sm tabular-nums ${colorClass} border-r border-slate-800/30"`; `colorClass`는 747-767에서 9개 분기(W/L/DIFF/STRK/L10/PPG/OPPG/SOS)로 emerald-400/red-400/slate-500 3상태 반복 | TableCell variant="stat" | 3상태 색 헬퍼 `trendColor(value, base, inverse)` | 체크리스트 772(divider_v, tabular). 20줄(748-767)이 같은 삼항식 반복 |
| ST10 381-456, 740-742 | 기타(progress bar) / card_box | `PlayoffOddsCell`: 막대 `div.flex-1.h-2.5.bg-slate-700 > div.h-full.bg-emerald-400/amber-400/red-400 width%` (409-411) + 퍼센트 `span.text-sm.tabular-nums.w-8.text-right` (412). 툴팁 portal(414-453): `fixed … bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 shadow-xl z-[9999]` | (막대) 없음, (툴팁) 없음 — InjuryStatusBadge 내부에 동일 모양 툴팁이 따로 구현됨 | 신규 `ProgressBar`, 신규 공용 `Tooltip`(portal) | 체크리스트 412·423·427·431·435·439·444(tabular), 416(card_box, zindex), 740(divider_v) 반영. 툴팁은 `PLAYOFF_TOOLTIP_ENABLED=false`(379)로 **현재 비활성**(코드 삭제 금지 주석) — 40줄(414-453)이 죽은 상태 |
| ST11 780-795 | divider / 기타(컷라인) | 컷라인 전용 raw `tr > td colSpan p-0 > div.h-[1px].bg-emerald-500/40` (자동진출), 동일 구조 `bg-amber-500/40` (플레이인) | TableRow | `TableRow` 또는 TableBody에 `cutLine` 옵션 | 체크리스트 783·791(td_raw) 반영. 7줄 블록 2회 |
| ST12 829-835 | spinner | 조기 return `div.flex.items-center.justify-center.min-h-screen > Loader2 size=28 animate-spin text-indigo-400` | 없음 | `LoadingState fullPage` | 체크리스트 832. 일정·리더보드와 동일 문자열. `min-h-screen`은 헤더 아래 레이아웃 안에서 스크롤 유발 가능 — 추정 |
| ST13★ 607, 625 | 기타(layout) | 루트 `flex flex-col h-full`, 본문 `flex-1 min-h-0` | — | — | |
| ST14★ 55-59 | 기타(fmt) | 로컬 `fmtPct`/`fmtGB` 등 | — | — | 홈 H31과 중복 |
| ST15★ 138-139, 319-320, 592-593 | 기타(calc) | `autoClinchCount`/`lastQualifyingRank` 계산식 3회 반복 (+홈 96-101) | — | 유틸 | 로직 중복 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 셀 세로 구분선 `border-r border-slate-800/30` | 697, 706, 740, 772 | 4줄 |
| 헤더 세로 구분선 `border-r border-slate-800` | 643, 670, 679 | 3줄 |
| 3상태 색 삼항식 | 749, 752, 754, 756, 758, 760, 763, 766 (복수 삼항이 한 줄) | 748-767 20줄 |
| 정렬 화살표 UI (TableHeaderCell 내장분과 중복) | 683-688 | 6줄 |
| 컷라인 tr | 781-787, 789-795 | 14줄 |
| 클린치/정렬 비교 `pct desc → wins desc` | 160-165, 334-339, 539-551 | 18줄 (로직) |
| 툴팁 행 `flex justify-between gap-3` | 421-446 | 26줄 (비활성 코드) |
| 로고 폴백 체인 | 708-721 | 14줄 |

---

## views/multi/season/MultiScheduleView.tsx (845줄)

### 공용 컴포넌트 사용 현황
| 공용 컴포넌트 | 사용 라인 | 비고 |
|---|---|---|
| Table / TableHead(`noRow`) / TableBody / TableRow / TableHeaderCell / TableCell | 19, 806-837, 157, 307-321, 159-286 | `Table className="!rounded-none !shadow-none"`; **TableHead `className="bg-slate-950 sticky top-0 z-40 shadow-sm"`(812)는 TableHead 기본 클래스와 100% 동일 — 중복** |
| PlayerHoverCard (공용 아님) | 216, 234 | |
| 미사용 | TabBar, Button, Badge, Card, Modal, Dropdown, PageHeader, Skeleton, TeamLogo, TeamBadge, OvrBadge | 버튼 10개 전부 raw `<button>`, 팀 로고 raw `<img>` |

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약 (핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| SC1 68-82 | button / card | **AllStarScheduleRow**: `button.w-full.flex.gap-3.px-4.py-3.rounded-md.border`, 활성 `border-indigo-700 bg-indigo-950/40 hover:bg-indigo-900/50`, 비활성 `border-slate-800 bg-slate-900/50 opacity-60 cursor-default`, 내용 Star 아이콘 + 라벨 + `보러가기 →`/`예정` | Card (`onClick` 지원이나 `rounded-3xl`, 비활성 상태 없음) | Card에 `radius`, `disabled`, `tone="indigo"` | 체크리스트 69(button_raw). 사용처 794-799 한 곳, `max-w-md mx-auto` 컨테이너(792) |
| SC2 98-113 | logo-fallback | **ScheduleTeamLogo**: `<img w-5 h-5 object-contain shrink-0>` + 3단 폴백 onError | TeamMark(badge) / TeamLogo | 폴백 체인 공용화 | 체크리스트 105·106·109. 순위 ST8과 동일 로직 (코멘트에도 "동일한 폴백 체인"이라 명시) |
| SC3 146-152 | button / divider | `pillBtn = "flex items-center justify-center gap-1 w-full h-6 text-white rounded-md text-sm font-bold leading-none transition-all active:scale-95 ko-normal"`, `cellBorder = "border-r border-slate-800/30"` 상수 | Button | `Button size="cell"`(h-6, rounded-md, normal case) | 체크리스트 152(divider_v) |
| SC4 157 | hover / 기타(row 상태색) | TableRow `h-10` + 진행중 `bg-red-500/10`, 내 팀 경기 `bg-emerald-500/20` | TableRow | `TableRow tone="live"/"mine"` | |
| SC5 159-173 | td | 날짜/시간/라운드 셀: `TableCell className="border-r border-slate-800/30 text-center align-middle text-sm"` + 내부 `span.font-medium.text-slate-400.tabular-nums.ko-normal` | TableCell | `bordered` prop, `align-middle` 기본화 | 체크리스트 160·165(tabular). TableCell 자체가 `align`을 지원하는데 `text-center`를 className으로 또 줌 |
| SC6 177-200 | td / logo | 원정·홈 팀 셀 `div.flex.gap-2 > ScheduleTeamLogo + span.font-semibold.text-slate-200.truncate.cursor-pointer.hover:text-indigo-400.hover:underline` 2회 (12줄 + 11줄 거의 동일) | TeamBadge + TextLink | `TeamCell`(slug, name, onClick) | 홈 H14와 같은 링크 클래스 |
| SC7 206-253 | td / live-dot | 최우수선수 셀: 진행 중이면 `span.animate-pulse > span.w-1.5.h-1.5.rounded-full.bg-red-500 + LIVE`(208-211), 종료면 원정/홈 MVP 블록 (214-230, 232-248 — **17줄씩 거의 동일 복제**) | — | 신규 `LiveDot`(label), `MvpCell` | |
| SC8 256-268 | td | 스코어 셀: 종료 `font-medium tabular-nums text-slate-300`, 라이브 `font-bold tabular-nums text-white` 또는 `animate-pulse text-red-400 LIVE`(262), 예정은 시간 | TableCell variant="stat" | | 체크리스트 258·264·266(tabular). LIVE 표기 방식이 SC7(점+글자)과 SC8(글자만)로 다름 |
| SC9 271-279 | td | 쿼터/상태 셀 `ko-normal`, 라이브 `text-white font-bold` | TableCell | | |
| SC10 286-302 | button | 보기/리뷰 `pillBtn` + `bg-red-600 hover:bg-red-500`(라이브), `bg-slate-700 hover:bg-slate-600`(예정), `bg-indigo-600 hover:bg-indigo-500`(종료) + Tv 아이콘 size 12 | Button (variant: danger / secondary / primary에 대응) | Button `shape="md"`+`size="cell"` | 체크리스트 288·298(button_raw), 293(button_raw + `row_hover` 라벨은 **오탐**: 행 호버 아님, 버튼 호버) |
| SC11 307-321 | table-header | `renderColumnHeader`: `tr.h-10.text-slate-500.text-sm.font-black.uppercase` + TableHeaderCell 9개, 8개에 `border-r border-slate-800 bg-slate-950` (+ `text-center`를 className으로 또 지정) | TableHeaderCell (`align` 지원) | `bordered` prop | 체크리스트 309-318(divider_v) 9행 반영. tracking 없음 → 순위/리더보드(`tracking-widest`)와 불일치 |
| SC12 323-432 | tab / button / 기타(날짜 캐러셀) | **DateControlBar**: 이전/다음 `button.p-2.rounded-md.bg-indigo-600.text-white.hover:bg-indigo-500` (364-369, 424-429), 7개 셀 `w-16 h-16 rounded-md`, 활성 `bg-indigo-600`, 비활성 `hover:bg-slate-700/60` (388-396, 400-409), 팝오버 `MonthCalendarPopover` + 바깥 클릭 닫기 상태 (337-356) | TabBar(밑줄형이라 불일치) | `Button size="icon"`, 신규 `DateStrip`(저장소에 GameDateStrip도 유사 패턴 — 추정 중복) | 체크리스트 364·424·388·400(button_raw), 391(`row_hover` 라벨 **오탐**: 버튼 호버) |
| SC13★ 702-721 | dropdown(상태) | 헤더 달력 아이콘 팝오버의 열림/위치/연월/바깥클릭 닫기 상태 (18줄)가 SC12 내부 (337-356, 20줄)와 동일 로직 | Dropdown (controlled 지원, `children` 가능) | MonthCalendarPopover를 Dropdown children으로 감싸는 방식(추정) | 코멘트(702-703)에도 "동일한 데이트피커 패턴 재사용"이라 명시 |
| SC14 723-729 | spinner | 조기 return `min-h-screen` 스피너 (ST12와 동일) | `LoadingState fullPage` | | 체크리스트 726 |
| SC15 741-786 | page-header | `div.grid.grid-cols-[2fr_6fr_2fr].items-center.gap-4.px-4.py-3.bg-slate-900.border-b.border-slate-800` (**`shrink-0` 없음** — 순위 화면은 있음), 좌 `h1.text-lg…ko-tight.truncate`(743) + 달력 아이콘 버튼 `h-8 w-8 rounded-md bg-indigo-600`(754) + `오늘로 이동` 버튼 `h-8 px-3 rounded-md bg-indigo-600 disabled:opacity-40`(774), 중앙 DateControlBar, 우 빈 스페이서(785) | PageHeader variant="bar" | `PageHeader`에 `left/center/right` 슬롯, `Button size="sm" shape="md"` | 체크리스트 741(divider_b), 748·771(button_raw). 순위 ST2와 같은 클래스 + grid 변형 |
| SC16★ 791-801 | 기타(list) | 올스타 날 행 컨테이너 `flex flex-col gap-2 max-w-md mx-auto px-4 py-10` | — | — | |
| SC17 803 | empty | `p.text-sm.text-slate-500.ko-normal.py-12.text-center` (점선 박스 **없음**) | `EmptyState` | | 홈 H11/H20의 `py-8 border-dashed`와 변형이 다름. 체크리스트 803 |
| SC18 806-837 | table / sticky | `Table className="!rounded-none !shadow-none" fullHeight={false} tableStyle fixed`, colgroup 807-811, TableHead 중복 className(812) | Table | `bleed` prop, 812의 className 삭제 가능 | 체크리스트 812(zindex, sticky) 반영 |
| SC19★ 36-49 | 기타(util) | `computeRoundLabelMap` | — | — | 로직 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| TableCell 보일러 `${cellBorder} … align-middle text-sm` | 159, 164, 170, 177, 190, 206, 256, 271, 286 | 9줄 |
| TableHeaderCell `border-r border-slate-800 bg-slate-950` | 309-318 | 9줄 |
| 원정/홈 팀 셀 (거의 동일 복제) | 177-188, 190-200 | 23줄 |
| MVP 원정/홈 블록 (거의 동일 복제) | 214-230, 232-248 | 34줄 |
| pill 버튼 3종 | 288-300 | 13줄 |
| 팝오버 열림/바깥클릭 상태 | 337-356, 704-721 | 약 38줄 |
| `bg-indigo-600 … rounded-md` 소형 버튼 | 366, 406, 426, 754, 774 | 5곳 |
| 로고 폴백 체인 | 98-113 | 16줄 |
| LIVE 표기 | 208-211, 262 | 5줄 |

---

## views/multi/season/MultiLeaderboardView.tsx (155줄) + 위임 대상 공용 LeaderboardView 계열

### 공용 컴포넌트 사용 현황
MultiLeaderboardView 자체는 UI가 스피너(127-133) 하나뿐이고 나머지 모든 화면은 `LeaderboardView`(138-150)에 위임합니다 (데이터 페치·URL 쿼리 필터 상태 관리만 담당).

| 공용 컴포넌트 | 사용 위치 | 비고 |
|---|---|---|
| Dropdown (항목형) | Toolbar 147-160(모드), 164-174(카테고리), 330-345(스탯 선택), 348-362(연산자) | 4곳. 항목 라벨을 `<span className="text-sm">`로 감싸 크기 오버라이드 (127-128 주석) |
| TeamBadge (`size="sm"`) | Toolbar 250-256 (팀 필터 목록) | |
| Table / TableHead / TableBody / TableRow / TableHeaderCell / TableCell | Table 전체 | |
| OvrBadge | Table 307 (`size="sm" className="!w-7 !h-7 !text-xs !shadow-none"`) | 오버라이드 3개 |
| 미사용 | TabBar, Button, Badge, Card, Modal, PageHeader, Skeleton, TeamLogo | 페이지네이션·토글·필터 칩·검색 모두 raw |

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약 (핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| LBM1 MultiLeaderboardView 127-133 | spinner | 조기 return `min-h-screen` 스피너 | `LoadingState fullPage` | | 체크리스트 130 (유일한 매치). 페이지 헤더 없음 — 타이틀은 Toolbar 브레드크럼이 대신함 |
| LV1★ LeaderboardView 158-160 | 기타(layout) | `flex flex-col h-full animate-in fade-in duration-500 ko-normal overflow-hidden` | — | — | |
| LV2★ LeaderboardView 221-275 | button / select / section | **페이지네이션 푸터** `relative flex items-center px-6 py-3 bg-slate-950 border-t border-slate-800 z-50`: 정보문구(223-225), 이전·다음 `button.p-1.5.text-indigo-400.hover:bg-slate-800.rounded-lg`(229-235, 253-259), 페이지 번호 `w-7 h-7 rounded-lg` 활성 `bg-indigo-600 text-white`(240-250), 말줄임 `··`(239), 페이지당 `<select class="bg-slate-800 border border-slate-700 text-slate-300 text-sm font-bold rounded-lg px-2 py-1.5">`(265-273) | Button, Dropdown | 신규 `Pagination`(page, totalPages, onChange, perPage), `Select` | 55줄. 다른 목록 화면에도 필요할 수 있음(추정) |
| LB-B1★ Toolbar 142-143 | page-header | `div.flex.flex-col.border-b.border-slate-800.bg-slate-900 > div.px-6.py-4.flex.flex-col.xl:flex-row.items-center.gap-6` | PageHeader variant="bar" | | 순위/일정(`px-4 py-3`)과 패딩 다름 (`px-6 py-4`) |
| LB-B2★ Toolbar 147-174 | tab / dropdown | 타이틀 겸 브레드크럼: Dropdown trigger `button.text-lg.font-black.uppercase.tracking-tight` + ChevronDown 14, 구분 `/` (162) | Dropdown ✓ (이미 사용) | — | 타이틀이 드롭다운이라 다른 화면의 `h1 text-lg font-black ko-tight`와 모양 불일치 (`tracking-tight` vs `ko-tight`, `uppercase`) |
| LB-B3★ Toolbar 182-201 | input | 검색 `div.relative.h-[36px].bg-slate-950.rounded-lg.border.border-slate-800` + `input` + 지우기 X 버튼 | 없음 | 신규 `SearchInput` | `h-[36px]` 필터 컨트롤 공통 높이 |
| LB-B4★ Toolbar 204-264 | dropdown / input(checkbox) | **팀 필터**: 트리거 `h-[36px] px-3 bg-slate-950 rounded-lg border`(활성 `border-indigo-500/50 text-indigo-400`), 선택 개수 칩 `bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full`(212), 패널 직접 구현(`fixed inset-0 z-[100]` 백드롭 + `fixed w-64 … z-[101]`), 체크박스 `w-4 h-4 rounded border`(235, 247) + Check 아이콘, 모두 선택 행 + 구분선 `h-px bg-slate-800 mx-2 my-1`(240) | Dropdown (패널 포탈, z-[9999]) | 신규 `MultiSelectDropdown`(options, selected, onChange, renderOption) | 공용 Dropdown과 z-index 체계가 다름(100/101 vs 9999) |
| LB-B5★ Toolbar 268-322 | dropdown / input(checkbox) | **포지션 필터**: LB-B4와 거의 동일 구조(40줄) | 〃 | 〃 | 두 블록 합계 87줄 중복 |
| LB-B6★ Toolbar 325-375 | input / select | 스탯 필터 합성 컨트롤: 컨테이너 `h-[36px] bg-slate-950 rounded-lg border`, 필터 아이콘 칸, Dropdown 2개(✓), 숫자 `input type=number … w-16`(364-371), 추가 `button`(372-374) | Dropdown ✓ | `NumberInput` | |
| LB-B7★ Toolbar 378-389 | 기타(toggle) | 히트맵 토글: `w-8 h-4 rounded-full relative` + 노브 `w-3 h-3 rounded-full bg-white`, 라벨 `색상 스케일` | 없음 | 신규 `Switch` | 같은 `w-8 h-4 rounded-full relative` 클래스가 저장소에 4곳 (grep) |
| LB-B8★ Toolbar 392-408 | segment / 기타(toggle) | 정규시즌/플레이오프 토글: 좌우 라벨 + 스위치 | 〃 | `Switch` 또는 `SegmentedControl`(2옵션) | 실질적으로 2옵션 세그먼트인데 스위치 UI |
| LB-B9★ Toolbar 412-421 | button | 새로고침 아이콘 버튼 `h-[36px] w-[36px] bg-slate-950 rounded-lg border` + RefreshCw `animate-spin` | Button | `Button size="icon"` | |
| LB-B10★ Toolbar 426-439 | pill / divider | 활성 필터 칩 `px-3 py-1 bg-indigo-900/30 border-indigo-500/30 rounded-full text-sm font-bold text-indigo-300` + X 버튼(431-434), 구분선 `h-px bg-slate-800/60 mx-6 mb-3`(428), `모두 제거` 텍스트 버튼(436) | Badge (variant brand와 유사하나 X 없음, 크기 `text-[10px]` vs 여기 `text-sm`) | Badge에 `onRemove` prop | |
| LB-T1★ Table 89-183 | table-header (중복) | 데이터 없음 분기에서 TableHead 전체(98-175, 78줄)를 본 분기 헤더(193-271, 79줄)와 **그대로 복제** + 오버레이 `span.text-slate-500.font-bold.uppercase.tracking-widest.text-sm 데이터가 없습니다.`(178-180) | Table | 헤더를 `renderHead()`로 추출, `EmptyState` | 가장 큰 단일 중복. `isLastSticky` 계산식도 7회(105, 134, 156, 200, 229, 251, 282) |
| LB-T2★ Table 92, 186, 98, 193 | 기타(table chrome) | `Table className="!rounded-none !border-0 !shadow-none custom-scrollbar-hide"`, `TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm"`(TableHead 기본과 동일 → 중복) | Table | `bleed` prop | ST3, SC18과 동일 이슈 |
| LB-T3★ Table 101, 132, 154, 196, 227, 249 | th | 헤더 `tr` className `text-slate-500 text-sm font-black uppercase tracking-widest h-7/h-10` + 셀 className `border-r border-slate-800 bg-slate-950 ${활성 text-indigo-400 : text-slate-400}`(114, 142, 164, 209, 237, 260) | TableHeaderCell | `active` prop | 6회 반복 |
| LB-T4★ Table 124-128, 219-223 | th | 그룹 헤더 raw `<th colSpan class="bg-slate-950 border-b border-r border-slate-800 text-sm font-black uppercase tracking-widest text-center text-slate-400 px-2 align-middle">` | TableHeaderCell (`colSpan` 통과 가능) | | 2회 복제 |
| LB-T5★ Table 276-277 | 기타(rank 색) | 1위 `text-yellow-400`, 2위 `text-slate-300`, 3위 `text-amber-600`, 그 외 `text-slate-600` | TableCell variant="rank" (현재 미구현) | rank variant 구현 | |
| LB-T6★ Table 298-304 | td / hover card | 선수명 `PlayerHoverCard > span.text-sm.font-semibold.text-slate-200.truncate.hover:text-indigo-300` | TableCell variant="player" | | 팀 이름(384)은 `uppercase`인데 한글 이름 |
| LB-T7★ Table 307 | ovr | `<OvrBadge size="sm" className="!w-7 !h-7 !text-xs !shadow-none" />` | OvrBadge ✓ | 새 size(예: `xs`/`md-compact`) 또는 `textClassName` | 오버라이드 3개. TableCell variant="ovr"는 `shadow-none`만 줌 — 이 표는 variant를 안 쓰고 직접 |
| LB-T8★ Table 408-416 | 기타(색 규칙) | 능력치 열 색 `≥90 fuchsia-400 / ≥80 emerald-400 / ≥70 amber-400 / 그 외 slate-500` (412-415) — **TableCell `getAttrColor`(65-70)와 임계값·색이 동일** | TableCell variant="attribute" `colorScale` + `mono={false}` | | 완전 중복 (4줄) |
| LB-T9★ Table 418-428 | td | 모든 셀 `border-r border-slate-800/30` + 정렬/패딩 className | TableCell | `bordered` prop | 일정·순위와 동일 클래스 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| Table 헤더 3변형 × 2 복제 | LeaderboardTable 98-175 vs 193-271 | 78줄 (제거 가능 분) |
| 체크박스 다중선택 드롭다운 | Toolbar 217-263, 281-320 | 87줄 (47 + 40) |
| 토글 스위치 | Toolbar 378-389, 392-408 | 29줄 |
| `h-[36px] bg-slate-950 rounded-lg border border-slate-800` 컨트롤 | Toolbar 182, 207, 271, 325, 378, 393, 416 | 7곳 |
| 헤더 셀 className | Table 114, 142, 164, 209, 237, 260 | 6줄 |
| isLastSticky 계산식 | Table 105, 134, 156, 200, 229, 251, 282 | 7줄 |
| 스피너 조기 return | MultiLeaderboardView 127-133 | 7줄 |

---

## 화면군 종합

### 불일치 대조표
| 항목 | 홈 (MultiSeasonPage) | 순위 (MultiStandingsView) | 일정 (MultiScheduleView) | 리더보드 (LeaderboardView 계열) | 공용 API |
|---|---|---|---|---|---|
| 페이지 헤더 | 2분할 마스트헤드 `rounded-xl px-6 py-6`, 타이틀 `text-2xl font-black` (1136-1190) | 바 `flex justify-between px-4 py-3 shrink-0 bg-slate-900 border-b border-slate-800` + `h1 text-lg font-black ko-tight` | 바 `grid-cols-[2fr_6fr_2fr] px-4 py-3 bg-slate-900 border-b border-slate-800` (shrink-0 **없음**) | Toolbar `px-6 py-4 flex-col xl:flex-row gap-6`, 타이틀 없음(브레드크럼 드롭다운) | PageHeader: `pb-6 text-4xl lg:text-5xl` — 4곳 모두 미사용 |
| 테이블 헤더 타이포 | `text-sm font-bold text-slate-600`, 대소문자 그대로 | `text-sm font-black uppercase tracking-widest` slate-500 | `text-sm font-black uppercase` (tracking 없음) | `text-sm font-black uppercase tracking-widest` slate-400, 활성 indigo-400 | Table 기본 `text-xs font-black uppercase tracking-widest slate-500` |
| 셀 패딩 | `py-1 px-1`(표#1) / `py-1 pl-2 pr-1`(표#2·#3) | Table 기본 `py-2 px-3` + `h-10` 헤더 | Table 기본 + `h-10` 행 | Table 기본 + `h-10`(선수)/`h-11`(팀) | `py-2 px-3` |
| 행 구분선/호버 | `border-b border-slate-800/60`(마지막 제외) + `hover:bg-white/5 transition-colors` | TableRow 기본 (`border-b slate-800/50` 항상) | 〃 | 〃 (+`group` hover 배경) | TableRow `hover:bg-white/5`, TableCell `border-b border-slate-800/50` |
| 컬럼 세로 구분선 | 없음 | `border-r slate-800/30`(셀), `slate-800`(헤더) | 〃 | 〃 | 없음 |
| 팀 표시 | TeamBadge xs (색 사각 배지 or 로고) | raw `<img>` 실제 로고 w-6 | raw `<img>` 실제 로고 w-5 | 표: 텍스트 약어, 필터: TeamBadge sm | TeamBadge/TeamLogo/TeamMark |
| 팀명 스타일 | `font-bold text-slate-300`(표#1), `font-bold text-slate-200`(표#2) | `font-semibold` slate-200, 클린치 emerald-400 / 탈락 slate-600 | `font-semibold text-slate-200` | `font-semibold text-slate-200 uppercase` | — |
| 로고 폴백 체인 | 14줄 직접 (1170-1183) | 14줄 직접 (708-721) | 16줄 컴포넌트 (98-113) | 없음 | TeamMark가 동일 체인 보유, 3곳 미사용 |
| 로딩 | `Loader2 size=20` `py-8` 인라인 (2곳) | `Loader2 size=28` `min-h-screen` | 〃 | 〃 | 공용 스피너 없음 (Skeleton만) |
| 빈 상태 | 점선 박스 `py-8` (5곳) / `py-6` (1곳) | 없음 | `py-12` 점선 없음 | 오버레이 `uppercase tracking-widest text-sm` | EmptyState 없음 |
| 탭/세그먼트 | 없음 | 세그먼트 `bg-slate-800 rounded-md p-1` | 날짜 칩 `w-16 h-16 rounded-md` | Dropdown 브레드크럼 + 스위치 | TabBar(밑줄형 `h-14`) 미사용 |
| 버튼 | 없음 | 세그먼트 raw | indigo-600 `rounded-md` 소형 5종 + pill `h-6` 3종 | 페이지네이션 `rounded-lg`, 필터 `h-[36px] rounded-lg border` | Button `rounded-2xl uppercase tracking-widest font-black` — 4곳 모두 미사용 |
| OvrBadge 오버라이드 | `!text-xs` (976) | — | — | `!w-7 !h-7 !text-xs !shadow-none` (307) | `textClassName` prop 존재 |
| 수치 색 규칙 | W/L/PCT 무색 | 평균 대비 emerald/red/slate-500 3상태 | 스코어 무색 | 히트맵(`getHeatmapStyle`) | — |
| Table 크롬 제거 | (Table 미사용) | `!rounded-none !border-x-0 !border-t-0 custom-scrollbar-hide` | `!rounded-none !shadow-none` | `!rounded-none !border-0 !shadow-none custom-scrollbar-hide` | 오버라이드 세트 3종 |
| TableHead 클래스 | — | (없음) | `bg-slate-950 sticky top-0 z-40 shadow-sm` (기본과 동일 → 중복) | 동일 중복 2곳 | 기본값에 이미 포함 |
| 정렬 화살표 | — | ST6에서 직접 재구현 | — | TableHeaderCell 내장 사용 | TableHeaderCell 내장 |
| 퍼센트 포맷 | 로컬 `fmtPct` | 로컬 `fmtPct` (표현 다름 추정: 둘 다 선행 0 제거) | — | `formatValue` | 공용 포맷 유틸 없음 |
| 그룹 첫 행 | — | 컨퍼런스/디비전 색 틴트 raw tr/td | — | 속성 그룹 헤더 raw `<th>` | 없음 |

### 통합 후보 (효과 큰 순)
"대상 줄 수"는 코드를 세어 센 값, "예상 순감"은 컴포넌트 호출로 치환했을 때의 추정 값입니다.

| 순위 | 통합 후보 | 대상 라인 | 대상 줄 수 | 예상 순감 | 선행 조건 |
|---|---|---|---|---|---|
| 1 | LeaderboardTable 헤더 중복 제거 (`renderHead()` 추출, 데이터 없음 분기에서 재사용) + `isLastSticky` 계산 함수화 | LeaderboardTable 98-175 ↔ 193-271, 105/134/156/200/229/251/282 | 78줄 + 7줄 | 약 80줄 | 없음 (파일 내 리팩터, 동작 동일성만 확인) |
| 2 | 로고 폴백 체인 → 기존 `TeamMark(badge)` 로 통일 (또는 TeamLogo `real` prop) | 홈 1170-1183, 순위 708-721, 일정 98-113(+사용 179, 192) | 14 + 14 + 16 = 44줄 | 약 42줄 (저장소 전체 `dataset.fallback` 18개 파일로 파급 가능) | TeamMark의 `badge` 필수 객체(`color` 미사용)를 optional로 풀거나 `real` boolean 추가. 홈 TeamBadge(색 배지)와 로고 중 어느 표현으로 통일할지 결정 필요 |
| 3 | `useActiveInjuryMap` 훅 추출 (UI 외 중복) | 홈 252-275, 475-497, 902-922, 1032-1060 | 약 80~95줄 (추정) | 약 70줄 | 호출부별 `includePbp:false`·`getTeamId` 차이 확인 |
| 4 | `MultiSelectDropdown` 신규 (팀/포지션 필터) | Toolbar 217-263, 281-320 (+트리거 205-215, 269-279) | 87줄 (+22줄) | 약 40줄 | Dropdown z-index 체계(9999) 정리, 체크박스 행 공용화 |
| 5 | `Table` compact variant + `bare`(크롬 없음) + 행 구분선 variant → 홈 표 3개 + div 리스트 5개 전환 | 홈 105-114, 788-794, 950-964 (thead 32줄, th 20, td 20) + 리스트 헤더 310-315, 543-548, 681-686, 1085-1090 (24줄) | 56줄 + td 20개 | 약 45줄 (th/td 클래스 반복 제거 포함하면 클래스 문자열 40회 감소) | Table의 `border-separate` 때문에 `tr` 구분선이 안 되므로 td 구분선 방식 확정. 헤더 타이포 통일 정책 결정(압축표=normal case slate-600 vs 공용=uppercase) |
| 6 | `LoadingState` / `EmptyState` 신규 | 스피너: ST 829-835, SC 723-729, LBM 127-133, 홈 370-372, 676-678 / 빈 상태: 홈 374-376, 849-851, 853-855, 940-942, 944-946, 1080-1082, SC 803, LB-T 178-180 | 스피너 27줄 + 빈 상태 22줄 = 49줄 | 약 32줄 (저장소 전체 점선 빈 상태 `border-dashed border-slate-800 rounded-lg` 10곳으로 파급) | 변형 정책(점선 박스 여부, py 값, 로딩 문구를 empty로 그리지 않기) 확정 |
| 7 | Standings 그룹 서브헤더 `TableGroupRow` + 컷라인 행 | 순위 665-693, 780-795 | 29줄 + 14줄 = 43줄 | 약 30줄 | TableHeaderCell의 정렬 화살표 로직을 재사용 가능한 부품으로 분리 |
| 8 | 일정 셀 서브컴포넌트화 (`TeamCell`, `MvpCell`, `LiveDot`) | 일정 177-200, 214-248, 208-211 | 23 + 34 + 4 = 61줄 | 약 28줄 | `TextLink` 부품 결정 (홈 569/582/589/822와 공유) |
| 9 | `Switch` 신규 (토글 2종) | Toolbar 378-408 | 29줄 | 약 22줄 | 저장소 4곳 `w-8 h-4 rounded-full relative` 일괄 확인 |
| 10 | `SegmentedControl` 신규 (순위 모드 탭, 시즌 구분 토글) | 순위 610-622 (+Toolbar 392-408 대체 시) | 13줄 (+15줄) | 약 11줄 (+10줄) | 저장소 4곳 `bg-slate-800 rounded-md p-1` 일괄 확인 |
| 11 | `Button` 확장 (`shape="md"`, `size="cell"`, `size="icon"`) → 일정 pill·소형 indigo 버튼, 새로고침, 페이지네이션 | 일정 146-152, 288-301, 366, 406, 426, 754, 774, Toolbar 412-421, LeaderboardView 229-259 | 약 14줄 + 5곳 + 10줄 + 31줄 | 약 20줄 | Button의 `uppercase tracking-widest font-black rounded-2xl` 기본값과 한국어 UI 정책(피드백 메모: 버튼 uppercase 제거) 정렬 |
| 12 | 페이지 헤더 바 → `PageHeader variant="bar"` (title, left/center/right 슬롯) | 순위 608-609, 623, 일정 741-743, 785-786, Toolbar 142-143 | 약 10줄 | 0~5줄이나 `h1 text-lg font-black ko-tight` 7곳·`px-4 py-3 bg-slate-900 border-b` 5곳 일관성 확보 (grep) | 홈 마스트헤드를 같은 틀에 넣을지 별도 `Masthead`로 둘지 결정. 리더보드 Toolbar는 레이아웃이 달라 슬롯 확장 필요 |
| 13 | Table `bleed` prop + TableHead 중복 className 삭제 | 순위 629, 일정 806, 812, LeaderboardTable 92, 98, 186, 193 | 7줄 | 0~3줄 (오버라이드 3종 → 1종) | 일정·리더보드의 TableHead 클래스는 기본값과 동일해 삭제만 해도 무해 (확인함) |
| 14 | `TableCell`/`OvrBadge` 기존 기능 활용 (신규 개발 불필요) | TableCell variant="attribute"+colorScale: LeaderboardTable 412-415 / OvrBadge `textClassName`: 홈 976, LeaderboardTable 307 | 4줄 + 2줄 | 약 4줄 | `!w-7 !h-7`은 size 규격에 없어 신규 size 필요 여부 결정 |
| 15 | `Badge` `onRemove` / 활성 필터 칩 | Toolbar 431-434 | 4줄 | 약 2줄 | Badge 크기 체계(text-[10px]) vs 칩(text-sm) 정리 |
| 16 | `ProgressBar`, `Tooltip`(portal) 신규 | 순위 409-412, 414-453 | 4 + 40줄 | 약 30줄 (툴팁은 현재 비활성) | 툴팁 코드는 "삭제 금지" 주석이 있어 공용 Tooltip으로 이관만 가능, 활성화 정책은 별도 |

### 체크리스트 대조 결과
| 파일 | 매치 수 | 반영 수 | 오탐 수 | 추가 발견 수 (★) |
|---|---|---|---|---|
| pages/MultiSeasonPage.tsx | 97 | 93 | 4 | 13 (H1, H6, H7, H8, H9, H14, H27~H33) |
| MultiStandingsView.tsx | 33 | 33 | 0 | 5 (ST3, ST4, ST13, ST14, ST15) |
| MultiScheduleView.tsx | 40 | 32 | 8 | 3 (SC13, SC16, SC19) |
| MultiLeaderboardView.tsx | 1 | 1 | 0 | 0 |
| LeaderboardView 계열 (체크리스트 없음) | — | — | — | 직접 작성 21행 (LV1~2, LB-B1~10, LB-T1~9) |
| 합계 | 171 | 159 | 12 | 홈 13 + 순위 5 + 일정 3 + 리더보드 계열 21 = 42행 |

체크리스트 행별 처리 (오탐은 "오탐" 명시):

**pages/MultiSeasonPage.tsx**
| 토큰 | 체크리스트 라인 | 처리 |
|---|---|---|
| table_raw (3) | 104, 787, 949 | H2, H17, H21 |
| th_raw (20) | 107-112, 790-792, 952-962 | H3, H18, H22 |
| td_raw (20) | 136, 137, 147-150, 812, 813, 830, 976, 977, 982-990 | H5, H19, H21~H24 |
| divider_b (16, 15개 라인; 134는 2매치) | 106, 134, 310, 320, 385, 543, 555, 681, 692, 789, 810, 951, 974, 1085, 1095 | H3, H4, H9, H10, H12, H13, H16, H18~H22, H26 |
| row_hover (8) | 134, 320, 385, 555, 692, 810, 974, 1095 | H4, H10, H12, H13, H16, H19, H21, H26 |
| tab_underline (1) | 134 | **오탐** (컷라인 `border-b-2`, 탭 아님) |
| tabular (16) | 149, 331, 388, 598, 812, 827, 832, 836, 983-990 | 정상 사용 (조치 불요), 해당 행에 포함 |
| spinner (2) | 371, 677 | H11, H15 |
| empty_state (8) | 100, 353, 1010 | **오탐** (주석 문장 안의 "없음") |
| | 375, 850, 854, 941, 1081 | H11, H20, H25 |
| logo_fallback (2) + placehold (1) | 1176, 1177, 1180 | H28 |

**MultiStandingsView.tsx**
| 토큰 | 체크리스트 라인 | 처리 |
|---|---|---|
| tabular (9) | 412, 423, 427, 431, 435, 439, 444, 697, 772 | ST10, ST7, ST9 (정상 사용) |
| card_box / zindex | 416 | ST10 (비활성 툴팁) |
| divider_b (3) | 608, 670, 679 | ST2, ST6 |
| segment_ctrl / button_raw | 610 / 612 | ST1 |
| header_text (2) | 637, 666 | ST5, ST6 |
| divider_v (7) | 643, 670, 679, 697, 706, 740, 772 | ST5, ST6, ST7, ST8, ST10, ST9 |
| td_raw (4) | 667, 675, 783, 791 | ST6, ST11 |
| logo_fallback (2) + placehold | 714, 715 / 718 | ST8 |
| spinner | 832 | ST12 |

**MultiScheduleView.tsx**
| 토큰 | 체크리스트 라인 | 처리 |
|---|---|---|
| empty_state (6) | 54, 65, 494, 682, 683 | **오탐** (전부 주석 문장) |
| | 803 | SC17 |
| button_raw (10) | 69 / 288, 293, 298 / 364, 424 / 388, 400 / 748, 771 | SC1 / SC10 / SC12 / SC12 / SC15 |
| logo_fallback (2) + placehold | 105, 106 / 109 | SC2 |
| td_raw | 147 | **오탐** (주석 안의 `<td>` 언급) |
| divider_v (9) | 152, 309, 310, 312, 314-318 | SC3, SC11 |
| tabular (5) | 160, 165, 258, 264, 266 | SC5, SC8 (정상 사용) |
| row_hover (2) | 293, 391 | **오탐(라벨 오분류)** — 행 호버가 아니라 버튼 호버. 실제 항목은 SC10, SC12에 버튼으로 반영 |
| spinner | 726 | SC14 |
| zindex / sticky | 812 | SC18 (중복 클래스) |

**MultiLeaderboardView.tsx**: spinner 130 → LBM1.

수치 정리: 오탐 12 = 홈 4 (주석 3 + 라벨 오분류 1) + 일정 8 (주석 6 + 라벨 오분류 2). `tabular-nums` 매치 30건(홈 16 + 순위 9 + 일정 5)은 오탐이 아니라 정상적인 숫자 정렬 사용이라 "조치 불요"로 처리했습니다 (반영 수에는 포함).

추가 발견(★) 건수는 문서의 ★ 표시 행을 grep으로 세어 확인했습니다: 홈 13행, 순위 5행, 일정 3행, 리더보드 계열 21행(LV 2 + Toolbar 10 + Table 9).

### 마지막 확인 사항 (코드 수정 없음, 감사만 수행)
- 소스 코드는 한 줄도 수정하지 않았고 이 문서 1개만 작성했습니다.
- 홈의 `<table>` 정적 개수는 3개이며 요청서의 4개와 다릅니다 (위 홈 섹션 설명 참고).
- 순위표 툴팁(ST10)은 `PLAYOFF_TOOLTIP_ENABLED=false`로 비활성인 코드라 통합 시 "삭제 금지" 주석을 존중해 공용 Tooltip으로 이관만 하는 것을 전제로 했습니다.
