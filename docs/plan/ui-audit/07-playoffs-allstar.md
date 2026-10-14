# 07 플레이오프·올스타 — UI 조각 전수 감사

읽은 범위:
- views/multi/season/TournamentBracketView.tsx: 1~1078줄 (전부, 3회 분할 Read)
- views/multi/season/MultiAllStarView.tsx: 1~568줄 (전부, 2회 분할 Read)
- views/multi/season/MultiPlayoffsView.tsx: 1~46줄 (전부)
- views/multi/season/PostseasonBracket.tsx: 1~45줄 (전부)
- components/multi/TournamentChampionModal.tsx: 1~365줄 (전부)
- components/multi/AllStarHalfCourt.tsx: 1~63줄 (전부)
- 공용 API(감사 대상 아님, 전부 정독): components/common/Table.tsx(228), TabBar.tsx(55), Button.tsx(69), Badge.tsx(41), Card.tsx(45), Modal.tsx(136), Dropdown.tsx(147), PageHeader.tsx(42), TeamLogo.tsx(46), TeamBadge.tsx(50), OvrBadge.tsx(146)
- 보조로 추가 확인: components/common/TeamMark.tsx(공용 목록 밖이지만 폴백 체인이 동일해서 열어봄), `git log --diff-filter=A`(Modal/ChampionModal 생성일), 소수의 grep(교차 파일 중복 수 확인용 — 감사 본문은 전부 Read 기반)

범례: 체크리스트(기계 추출) 라인이 걸린 행은 "체크:" 로 라인을 적었고, 체크리스트에 없던 발견은 "추가" 로 표기. 줄 수는 해당 코드 블록의 실제 줄 수(주석 제외 아님, 블록 시작~끝).

공용 컴포넌트 요약(대체 가능성 판단 기준)
- Table: 래퍼가 `bg-slate-900 border rounded-xl h-full overflow-auto`, thead 고정 `py-3 px-1.5` + `uppercase tracking-widest`, td `py-2 px-3` — 모달 안 컴팩트 표엔 밀도/테두리 옵션이 없음.
- TabBar: `h-14 px-8 border-b` 언더라인형 풀폭 탭 — 세그먼트(필 버튼) 형태 없음.
- Button: variant primary/secondary/danger/ghost/outline/brand — amber 계열 없음, 항상 `uppercase tracking-widest rounded-2xl`.
- Badge: `rounded-full border` 필. 팀 컬러 배경 위 반투명 라벨 variant 없음.
- Card: `rounded-3xl`. 작은 라운드/내부 카드용 variant 없음.
- Modal: 중앙 정렬 portal, z-[500], 바깥 mousedown=onClose, X 24px, 테두리 `border-slate-700` 하드코드(오버라이드 prop 없음).
- PageHeader: `text-4xl/5xl` 대형 — 시즌 화면의 컴팩트 헤더(text-lg)와 불일치.
- TeamLogo: `getTeamLogoUrl`(구 URL) 전용 + 단일 placehold 폴백. 실제 로고 우선 체인 없음. (TeamMark `badge` 분기에만 있음.)

---

## TournamentBracketView.tsx (1078줄)

### 공용 컴포넌트 사용 현황
- 공용 컴포넌트 import 0개 (Table/TabBar/Button/Badge/Card/Modal/Dropdown/PageHeader/TeamLogo/TeamBadge/OvrBadge 전부 미사용). lucide `X` 1개만 import(L3).
- 파일 내부 로컬 컴포넌트 7개: `TeamLogoImg`(L82), `TeamSlot`(L101), `MatchCard`(L158), `BracketConnector`(L252), `StraightConnector`(L294), `BracketHalf`(L314), `TournamentBracketView`(L429).
- 공용 대체물이 이미 존재하는데 안 쓴 사례: `TeamLogoImg`는 `components/common/TeamMark.tsx`의 `badge` 분기와 코드가 글자 단위로 동일(아래 표 T1).
- 화면 헤더(제목 바)가 없음 — 같은 시즌 화면군의 MultiAllStarView는 `px-4 py-3 border-b` 헤더가 있는데 브라켓 화면은 헤더 없이 바로 라운드 헤더로 시작.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| T1 L79-97 (16줄 + 주석3) | logo-fallback | `<img src=getRealTeamLogoUrl>` + `onError`: dataset.fallback 'old'면 `getTeamLogoUrl`, 아니면 `placehold.co/100x100?text=BPL`. `object-contain shrink-0` | `TeamMark`(badge 지정 시 동일 체인) 또는 `TeamLogo` | TeamMark: `badge={{color:'', abbr}}`를 강제하는 현 시그니처가 어색 → `real?: boolean` 같은 prop 추가 권장. TeamLogo에 `preferReal` 추가도 가능 | 체크: 89,90,93. 호출 4곳(L142, L187, L987, L1001, 모두 `w-6 h-6` = TeamLogo size `sm`과 동일). 주석에 "MultiStandingsView/newsFeedCards와 동일 체인" 명시 — 동일 코드가 repo 전체 14+ 파일에 복제(grep `dataset.fallback`) |
| T2 L101-154 (54줄) | card | `TeamSlot`: 팀 컬러 배경(`style backgroundColor/color`) 행, `px-4 py-4`, `ring-2 ring-inset` 우승(amber)/내 팀(white/70)/호버(sky-400, brightness-110), 비호버 팀 `opacity-30` | 없음(팀 컬러 동적 배경) | `TeamBadge`는 작은 색 사각형이라 부적합 → 브라켓 전용으로 유지하거나 `TeamColorRow` 신규 | 추가. 우승/내 팀/호버 3중 링 규칙이 컴포넌트 안에 하드코드 |
| T3 L115-121 (7줄) | empty | `TBD` 슬롯: `text-xl font-bold text-slate-600` | 없음 | — | 추가. BYE는 `null` 반환(L113) |
| T4 L127-128, L173-174 | 기타(하드코드 hex) | 탈락 `#1e293b`/`#64748b`, 팀컬러 없을 때 `#1e293b`·`#0f172a`, 기본 텍스트 `#e2e8f0` — 토큰 아닌 리터럴 hex | — | 디자인 토큰 도입 시 slate-800/500/900/200로 매핑 | 추가 |
| T5 L134-140 | hover | 슬롯 `onMouseEnter/Leave`로 팀 하이라이트(`ring-sky-400 brightness-110`)·나머지 `opacity-30`. BYE 카드(L179-181)에도 같은 2줄 복제 | `TableRow` 호버와 무관(팀 단위 교차 하이라이트) | — | 추가. 하이라이트 색은 sky-400 → 커넥터 `rgb(56,189,248)`(L256)와 같은 색을 리터럴로 중복 정의 |
| T6 L148 | money/수치 | 승수 `text-xl font-black tabular-nums` | `TableCell variant="stat"`는 `font-mono text-slate-300`이라 불일치 | — | 체크: 148. 표가 아니므로 대체 불필요(오탐 아님, 기록용) |
| T7 L171-195 (25줄) | card | BYE 매치 카드: `border border-slate-700/40`, 팀 컬러 배경, 로고+약어, 우측 "부전승" | 없음 | T2와 로고+약어 span(L186-191, 6줄)이 L141-146과 동일 → `TeamLabel` 로컬 추출 | 추가 |
| T8 L192 | badge | `text-[10px] font-bold px-1.5 py-0.5 bg-black/25 ml-2 shrink-0` ("부전승") | `Badge size="sm"`은 `rounded-full border` + 변형색 고정이라 팀 컬러 위 반투명 라벨로는 부적합 | `Badge variant="overlay"`(bg-black/25, border 없음, rounded-none) 신규 | 체크: 192. 각진(rounded 없음) 모서리 — 카드 전체가 각진 디자인과 맞춘 것으로 보임(추정) |
| T9 L197-206 | card | 매치 카드 외곽: `w-full overflow-hidden border cursor-pointer transition-all select-none`, 선택=indigo-500+ring, 결승 완료=amber-500/60, 기본=slate-700/50 | `Card`는 `rounded-3xl`·`rounded` 제어 불가 | Card에 `radius="none"` + 상태 variant 필요 | 추가. 의도적 `rounded` 없음(브라켓 각진 스타일) |
| T10 L220 | divider | `<div className="border-t border-slate-700/40" />` | 없음 | — | 체크: 220 |
| T11 L252-298 (38+5줄) | 기타(SVG 커넥터) | `BracketConnector`: viewBox 100x100 3개 path, 하이라이트 `rgb(56,189,248)` 2.5px / 기본 `rgb(51,65,85)` 1.5px, `vectorEffect non-scaling-stroke`. `StraightConnector`: `border-t` 1줄(하이라이트 `border-sky-400 border-t-2`) | 없음 | 브라켓 전용, 공용화 대상 아님 | 추가. 색 리터럴은 slate-700(51,65,85)/sky-400 — Tailwind 토큰 아닌 rgb 문자열 |
| T12 L738-740, L770-772, L778-780 | section-header | 서부 `h-10 text-sm font-black uppercase text-blue-300 bg-blue-500/10 border border-blue-500/30`, 파이널(`h-20`, purple), 동부(red). 컬러 3종 고정 | `Badge`의 색 변형과 유사하나 전폭 블록이라 부적합 | `SectionBanner tone="blue|purple|red"` 신규 | 추가. 한글에 `uppercase`는 무의미(추정) |
| T13 L746-761 + L781-796 (각 16줄) | section-header / 기타(grid 헤더) | `grid w-full bg-slate-800` + `buildColTemplate(confRounds)` + 각 라운드 `h-10 text-sm font-bold uppercase tracking-wide text-slate-400`, 첫 칸 제외 `border-l border-slate-700/40` | `TableHead/TableHeaderCell`은 `<table>` 전용이라 grid 헤더엔 못 씀 | `sideHeaderOrder(rounds, mirrored)`만 인자로 받는 `SideRoundHeader` 로컬 컴포넌트 | 체크: 753, 788. 두 블록이 `mirrored` 인자 하나만 다르고 동일(10줄 셀 map 포함) |
| T14 L869-887 (19줄) | section-header | 단일 브라켓 라운드 헤더: `text-center text-2xl font-black text-white uppercase`, 폭 `MATCH_W` 고정, `getRoundLabel`(결승/준결승/N라운드) | — | T13과 크기·색·라벨 체계가 전혀 다름 → 통일 시 `RoundHeader` 공용화 | 추가. 불일치(아래 종합 대조표) |
| T15 L854-862, L937-945 (각 9줄) | 기타(우승 배너) | `/images/final.webp` + `{season} 챔피언`(amber-400 uppercase) + 팀명(`text-5xl`/`text-4xl font-black text-white`). 크기만 다르고 구조 동일(트로피 w-48/w-40, 라벨 text-lg/base) | — | `ChampionBanner size="lg|md"` 로컬 추출 | 추가. 같은 이미지·패턴이 newsFeedCards L3313, PlayoffChampionRenderer L28에도 별개 구현(grep) |
| T16 L953-961 (6줄 + 주석) | modal(backdrop) | `absolute inset-0 bg-black/40 z-10 animate-in fade-in`, 클릭 시 패널 닫기 | `Modal`의 backdrop은 fixed+portal·중앙 정렬 — 부착 대상이 브라켓 컨테이너(absolute)라 다름 | `SidePanel`(Drawer) 신규에 흡수 | 체크: 958 |
| T17 L963-972 (shell) | modal(사이드 패널) | `absolute right-0 top-0 h-full w-72 border-l border-slate-800 bg-slate-800 flex flex-col overflow-hidden shadow-2xl z-20 animate-in slide-in-from-right` | `Modal` 불가(중앙 모달 전용, 컨테이너 상대 위치 불가) | 신규 `SidePanel`: `open/onClose/width/title/anchor('container'|'viewport')`, 내부에 backdrop(T16)+X 버튼(T19) 포함 | 체크: 968, 970(L970 `border-b border-slate-700` 헤더 구분선). 사이드 패널을 모달로 쓰지 않은 이유는 아래 "분석" 참고 |
| T18 L972-976 | header text | 패널 제목 `text-sm font-black text-white uppercase` — 라운드 라벨을 `getSideRoundLabel(round, confRounds)`로 생성 | — | — | 추가. 비-split(토너먼트) 모드에서도 `confRounds = totalRounds-1`이라 준결승이 "컨퍼런스 파이널"로 표시되는 문제(추정: 의도 아님) |
| T19 L977-982 | button | 패널 닫기: `p-1.5 hover:bg-white/10 rounded-lg transition-colors` + `<X size={18} text-slate-500>` | Modal의 X 버튼(`p-2 hover:bg-slate-800 rounded-full`, size 24)과 유사 | `IconButton`(close) 신규 또는 SidePanel 내장 | 체크: 977, 979 |
| T20 L985-1009 (25줄) | 기타(매치업 헤더) | 상위시드 로고+약어(+시드번호) / `text-2xl font-black` 스코어 / 하위시드. 좌우 `flex-1 justify-center` | — | `TeamLabel`(로고+약어+선택 시드) 로컬 | 추가. 약어 + `({seed})` 중복 구조 2회 (L986-994, L1000-1008 각 9줄) |
| T21 L1014-1017 (4줄) | empty | `h-24` 중앙 `text-sm font-bold text-slate-600` "경기 결과 없음" | 없음 | `EmptyState`(compact) 신규 | 체크: 1016 |
| T22 L1026-1065 (40줄) | card | 경기 카드: `rounded-lg bg-slate-700 border border-slate-600 px-3 py-2.5 cursor-pointer hover:border-slate-500` + `onClick navigate` | `Card onClick`은 `rounded-3xl bg-slate-900 hover:border-slate-600 active:scale-[0.99]` | Card에 `variant="inset"`/`radius="lg"` 필요 | 추가. div+onClick 구조라 키보드 접근 불가(role/tabIndex 없음) |
| T23 L1033 | divider | `flex-1 border-t border-dashed border-slate-600` (n차전 ―― 시리즈) | 없음 | — | 추가 |
| T24 L1037-1040 | live-dot | `w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse` + "LIVE" text-red-400 | `Badge variant="danger"` 와 의미 일치 | `LiveDot`/`Badge live` 신규 | 체크: 1038 |
| T25 L1045-1063 | 기타(점수 행) | 원정약어 / `awayScore - homeScore` / 홈약어. 승자 `text-emerald-400`, 패자 `text-slate-400`(점수)·`text-white`(약어) | — | — | 추가. 약어에 `g.awayTeamId`(슬러그)를 `uppercase`로 출력 — `TeamSlot`이 쓰는 `team_abbr`와 다른 값(불일치) |
| T26 L1057 | live-dot | 점수 자리 "LIVE" `text-lg font-black text-red-400` | 〃 | T24와 통합 | 추가 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| TeamLogoImg 정의(+호출 4곳) | 79-97 / 142, 187, 987, 1001 | 19 + 4 = 23 |
| 서부/동부 라운드 헤더 grid 블록 | 746-761, 781-796 | 32 |
| 우승 배너 | 854-862, 937-945 | 18 |
| 로고+약어 span | 141-146, 186-191 | 12 |
| 호버 하이라이트 커넥터 계산(로직) | 353-368, 668-683 | 32 |
| gridSeries/gridConns 계산(로직) | 327-348, 630-664 | 57 |
| 팀+시드 라벨 | 986-994, 1000-1008 | 18 |
| 호버/딤 클래스 조건 | 129-136, 175-181 | 14 |

### 분석 — 사이드 패널(직접 오버레이)을 모달/기존 컴포넌트로 안 쓴 이유
- 코드 주석(L953-966)이 직접 밝힘: 패널은 예전엔 flex 형제였는데 뜨는 순간 브라켓 영역(`flex-1`)이 좁아져 유동폭 그리드가 재계산되며 레이아웃이 흔들렸다 → 문서 흐름에서 빼서 브라켓 컨테이너 안 `absolute` 오버레이로 전환. 즉 "브라켓 컨테이너 기준 위치(`absolute right-0 top-0 h-full`)"가 요구사항이다.
- `Modal.tsx`는 `createPortal(document.body)` + `fixed inset-0` 중앙 정렬이라 컨테이너 기준 배치가 불가능하고, 우측 슬라이드 인(`slide-in-from-right`)·전체 높이 패널 변형도 없다. 즉 공용 Modal이 못 해서 직접 구현한 것(장식 목적 아님).
- 백드롭(L956-961)도 같은 이유로 직접 구현: 주석에 "오버레이 UX 관례상 클릭 시 닫기도 같이 넣었다"고 명시. 모달과 달리 브라켓 영역에만 걸림.
- 결론: 신규 `SidePanel`(앵커 컨테이너/뷰포트 선택, 슬라이드 방향, 폭, 내장 백드롭·닫기 버튼)이 필요. 현재 `Dropdown`도 portal fixed 패널이라 대체 불가.

### 분석 — TeamLogoImg 폴백
- 폴백 체인(실제 로고 → 구 URL → placehold)이 `TeamMark`의 `badge` 분기와 동일. `TeamLogo` 단독은 구 URL만 시도하므로 멀티플레이어의 `public/logos/real/` 고정 로고 세트(MEMORY: 2026-09-06~)를 못 씀 → 각 화면이 체인을 복붙해 온 것으로 보임(추정). `TeamMark`로 일원화하거나 `TeamLogo`에 흡수하는 것이 repo 전체 중복(grep상 14+ 파일)을 줄이는 가장 큰 레버.
- 위험: `placehold.co` 자체가 실패하면 `onError`가 같은 URL로 재설정되어 무한 루프 가능성(공용 코드도 동일). 외부 placehold.co 의존 자체도 오프라인에서 취약(추정, 확인 불가).

### 분석 — 라운드 헤더
- 두 모드가 완전히 다른 타이포: split 모드(L750-760) `text-sm font-bold uppercase tracking-wide text-slate-400`, classic 모드(L876-886) `text-2xl font-black text-white`.
- 라벨 체계도 3종: classic `getRoundLabel`(결승/준결승/N라운드), split `getSideRoundLabel`(컨퍼런스 파이널/N라운드), 중앙 컬럼 "파이널", 패널 제목은 결승일 때 "결승". 동일 개념("결승")이 "파이널"/"결승"으로 혼용(L771 vs L974).

---

## MultiAllStarView.tsx (568줄)

### 공용 컴포넌트 사용 현황
- 공용: `PlayerHoverCard`(components/common, L13·106) 1종. lucide `Loader2/Check/Star`.
- 로컬 파일 의존: `newsFeedCards`의 `AllstarVoteSection/AllstarRosterTable/ThreePointContestTable/DunkContestTable/…ResultTable/…ShotChart`(L14) — 실제 표 구현은 그쪽에 있으며 **본 감사 범위 밖**(이 파일은 호출만).
- 미사용: Table/TabBar/Button/Badge/Card/Modal/Dropdown/PageHeader/TeamLogo/TeamBadge/OvrBadge 전부.
- 파일 내부 로컬 컴포넌트: `AllStarCourtDiagram`(L61), `AllstarVoteStepper`(L140), `RisingStarsBody`(L190), `AllstarVoteGroupPanel`(L233), `MultiAllStarView`(L281).

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| A1 L69-71, L117-118 | card / section-header | 코트 컨테이너 `relative w-full rounded-lg overflow-hidden border border-slate-700` + `aspectRatio` 스타일, 위에 `h3 text-sm font-black text-slate-300 uppercase` | `Card padding="none"` (단 rounded-3xl라 불일치) | Card `radius` prop | 추가 |
| A2 L86-105 (20줄) | logo-fallback / button | 선수 위치에 팀 로고 `<button class="w-20 h-20 shrink-0 cursor-pointer">` 안 `<img>` 폴백 체인(L95-103, 9줄) | `TeamMark`(폴백 동일) | `TeamMark` real 모드 + 버튼은 로컬 | 체크: 86, 97, 98, 101. T1과 동일 체인 복제. `w-20 h-20`은 TeamLogo size `xl`(w-16)·`2xl`(w-24) 사이 → `custom` 사용 |
| A3 L106-113 | 기타(이름표) | `PlayerHoverCard` 안 `span text-base font-bold text-white bg-slate-900/80 px-1.5 py-0.5 rounded`, 클릭 가능 시 `hover:text-indigo-300 hover:underline` | `Badge`(rounded-full·border·uppercase라 불일치) | — | 추가. 이름이 `span onClick`(키보드 불가) |
| A4 L140-177 (38줄) | 기타(스테퍼) | 5단계 가로 스텝퍼: 외곽 `border-b border-slate-800 shrink-0` + 내부 `flex px-6 py-4 w-fit` | 없음 | 신규 `Stepper`(steps[{label, sub}], activeIndex) | 체크: 150 (divider_b). `computeVoteStepIndex`(L127-134) 포함 시 48줄 |
| A5 L158-162 | badge | 스텝 원: `w-6 h-6 rounded-full text-xs font-black`, 완료 emerald-500+Check / 현재 indigo-500 / 대기 slate-800 | `Badge`(필형, 숫자 원형 아님) | `Stepper` 내부 | 추가 |
| A6 L168-170 | divider | 스텝 연결선 `w-8 h-0.5 mx-3`, 완료 emerald-500 / slate-800 | — | `Stepper` 내부 | 추가 |
| A7 L197, L523 | 기타(2열 레이아웃) | `grid grid-cols-2 divide-x divide-slate-800 min-h-full` + 각 열 `p-6 space-y-6 min-w-0` | — | 로컬 `TwoPane` | 추가. 동일 2줄 ×2 |
| A8 L199-202, 212-215, 443-446, 466-469, 486-489, 501-504, 525-528, 543-546 | section-header | `h2 flex items-center gap-2 text-2xl font-black text-white` + `<img src=/logos/real/AS/*.svg className="h-8 w-8">` + 제목 — **8회 × 4줄 = 32줄** | `PageHeader`(text-4xl·border-b — 크기 불일치) | `SectionTitle iconSrc title`(text-2xl) 신규 | 추가. 이미지 8개 중 RisingA/RisingB/ThreeContest/DunkContest/East/West 사용 |
| A9 L207-209, 220-222, 538-540, 556-558 | divider | `border-t border-slate-800 pt-6` 래퍼 div 4회(래퍼 3줄 × 4 = 12줄) | — | `SectionDivider`/`Section` 로컬 | 체크: 207, 220, 538, 556 |
| A10 L70, 243, 449, 454, 458, 491, 495, 531, 549 | section-header | `h3 font-black text-slate-300 uppercase` — `text-sm` 6회(70,449,454,458,491,495), `text-lg` 3회(243,531,549) | — | `SubTitle size="sm|lg"` | 추가. 같은 계층의 h3에 두 가지 크기 혼용 |
| A11 L244-259 (16줄) | segment (탭) | **세그먼트 탭 #1** (백코트/프론트코트): `flex items-center gap-1 bg-slate-800 rounded-md p-1 w-fit` + 버튼 2개 `px-3 py-1.5 rounded text-sm font-bold ko-normal transition-colors`, 활성 `bg-slate-600 text-white` / 비활성 `text-slate-400 hover:text-white` | `TabBar`(언더라인형·풀폭·h-14·uppercase) 불일치 | 신규 `SegmentedControl<T>(options, value, onChange)` | 체크: 244, 245, 252. 버튼 2개가 `group===` 조건만 다른 동일 코드(14줄) → options 배열 map이면 해결 |
| A12 L383-393 (11줄) | empty | 토너먼트/투표 전 안내: `flex flex-col items-center justify-center min-h-[60vh] gap-4 pretendard` + `Star size=40 text-slate-600` + `h2 text-lg font-black text-slate-300` + `p text-sm text-slate-500` | 없음 | 신규 `EmptyState(icon,title,description)` | 추가. PostseasonBracket L26-33과 구조 동일(아이콘만 다름) |
| A13 L402-409 (8줄) | page-header | `flex items-center justify-between px-4 py-3 shrink-0 bg-slate-900 border-b border-slate-800` + `h1 text-lg font-black text-white ko-tight truncate` + 우측 메타 `text-sm text-slate-300` | `PageHeader`(text-4xl, 세로 패딩 큼) 불일치 | `PageHeader variant="compact"`(제목+meta slot) | 체크: 402 (divider_b). 주석(L397-399)이 MultiStandingsView/MultiScheduleView와 동일 형태로 통일했다고 명시 → 해당 파일들에도 동일 헤더 복제 존재(미확인, 이 감사 범위 밖) |
| A14 L417-432 (16줄) | segment (탭) | **세그먼트 탭 #2** (올스타/라이징스타/3점/덩크): 외곽 `flex px-6 py-3 border-b border-slate-800 shrink-0` + A11과 동일 세그먼트, 버튼은 `ALLSTAR_TABS.map` + `whitespace-nowrap`, URL `?view=` 연동(`setSearchParams`) | `TabBar`(rightSlot/badge 지원하지만 스타일 불일치) | `SegmentedControl` (A11과 동일 컴포넌트) | 체크: 417, 418, 420. A11과 클래스 100% 동일(`whitespace-nowrap`만 추가) → 한 컴포넌트로 통합 가능 |
| A15 L436-438, 479-481, 513-515 | spinner | `flex-1 flex items-center justify-center` + `Loader2 size=28 animate-spin text-indigo-400` — 3회 × 3줄 | `Button isLoading`은 버튼 전용 | `LoadingSpinner`(centered) 신규 | 체크: 437, 480, 514. grep상 `animate-spin text-indigo-400` 30개 파일에서 사용 |
| A16 L473-475, 508-510, 517-519 | empty | `p-10 text-sm text-slate-500 ko-normal` 문장형 안내 3회 × 3줄 | — | `EmptyState`(text only) | 체크: 518. 나머지 473, 508은 체크리스트에 안 걸렸지만 동일 패턴(반영) |
| A17 L411 | 기타(스크롤 컨테이너) | `flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900 text-slate-200 pretendard flex flex-col` | — | — | 추가. `pretendard` 클래스가 이 화면군에서 L383·L411·PostseasonBracket L26에서만 쓰임(전역 폰트와 별개 지정 — 일관성 확인 필요, 추정) |
| A18 L108 | hover | `hover:text-indigo-300 hover:underline` | — | — | 추가. 호버 하이라이트 색: 올스타=indigo, 브라켓=sky |
| A19 L37 | 기타(팔레트) | `ALLSTAR_COURT_COLORS = {#1e1b4b,#3730a3,#a5b4fc}` — indigo-950/800/300 의 리터럴 hex | — | 토큰 매핑 | 추가 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 세그먼트 탭 래퍼 | 244-259, 418-431 | 16 + 14 = 30 |
| 폴백 `<img>` 체인 | 91-104 | 14 |
| 라이징스타 팀 블록(A/B) | 198-210, 211-223 | 26 |
| 컨퍼런스 블록(동/서) | 524-541, 542-559 | 36 |
| 아이콘 h2 제목 | 8회 (A8) | 32 |
| 구분선 래퍼 | 4회 (A9) | 12 |
| h3 소제목 | 9회 (A10) | 9 |
| 스피너 | 3회 | 9 |
| 문장형 empty | 3회 | 9 |
| 스텝 공식(`Stepper` 후보) | 140-177 | 38 |

### 분석 — 세그먼트 탭 2곳과 단계 표시
- 세그먼트 탭: 두 곳(L244, L418)이 `bg-slate-800 rounded-md p-1` + 활성 `bg-slate-600` 같은 클래스 세트. 공용 `TabBar`는 언더라인형(`h-14 px-8 border-b-2`)이고 `uppercase` 고정이라 모양이 달라서 쓰지 못함 → 신규 `SegmentedControl`이 필요. grep상 같은 세그먼트 클래스를 `MultiStandingsView.tsx`, `newsFeedCards.tsx`도 사용(주석상 MODE_TABS와 "동일 스타일"을 의도). 즉 최소 4곳 중복.
- 단계 표시(스테퍼): 공용에 대응물이 없음. 5단계 고정이 아니라 `steps[]`와 `activeIndex`만 있으면 되는 구조이고 날짜 서브라벨이 있으므로 `Stepper` 신규가 적합. 현재 `w-fit` + 하단 `border-b`가 바깥/안쪽 div 이중 구조(주석 L136-139: 우측 액션 제거 뒤 남은 구조)라 정리 여지.

---

## MultiPlayoffsView.tsx (46줄)

### 공용 컴포넌트 사용 현황
- 공용 컴포넌트 사용 0개. lucide `Loader2` 1개. 실제 화면은 `PostseasonBracket`에 위임(얇은 래퍼).

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| P1 L18-24 (7줄) | spinner | `flex items-center justify-center min-h-screen` + `Loader2 size=28 animate-spin text-indigo-400` | `LoadingSpinner`(신규) | `fill` 모드 | 체크: 21. `min-h-screen`은 레이아웃 안에서 쓰일 때 이중 스크롤 위험(AllStar는 `flex-1`) — 높이 계산 방식 불일치 |

### 파일 내 반복 패턴
- 없음 (46줄 중 UI는 P1 1곳). 로직: 일정 정규화(L29-34)는 UI 아님.

---

## PostseasonBracket.tsx (45줄)

### 공용 컴포넌트 사용 현황
- 공용 컴포넌트 사용 0개. lucide `Network` 1개. 렌더 본체는 `TournamentBracketView`에 위임.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| B1 L24-34 (8줄 JSX) | empty | `flex flex-col items-center justify-center min-h-[60vh] gap-4 text-slate-200 pretendard` + `Network size=40 text-slate-600` + `h2 text-lg font-black text-slate-300 ko-tight` + `p text-sm text-slate-500 ko-normal mt-1` | `EmptyState`(신규) | `icon/title/description` | 체크: 30. MultiAllStarView A12(L383-393)와 클래스 동일(아이콘/문구만 다름) |

### 파일 내 반복 패턴
- 없음.

---

## TournamentChampionModal.tsx (365줄)

### 공용 컴포넌트 사용 현황
- 공용: `TeamLogo` 1회(L292, `size="xl"`). `Modal/Button/Table/Badge/Card` 미사용. lucide `Trophy/X/Loader2`.
- 파일 내부: `Confetti`(L54, 32줄) + `useConfettiPieces`(L41), `useTournamentSummary`(L111, `supabase` 직접 조회 — 데이터 계층이 UI 파일에 섞여 있음, 감사 범위 밖이지만 기록), `fmtAvg/fmtPct/fmtTS`(L177-188).
- 사용처: `views/multi/season/MultiSeasonLayout.tsx` L7·L100 한 곳(grep).

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| C1 L54-85 (32줄) | 기타(컨페티) | `fixed inset-0 z-[101] overflow-hidden pointer-events-none` + 90개 `span` 절대배치, 인라인 `@keyframes confetti-fall` | 없음 | 로컬 유지 가능 | 체크: 58(×2: overlay_fixed·zindex). z-[101] > 아래 오버레이 z-[100]이라 컨페티가 패널 위를 지남 |
| C2 L275-277 | modal | 오버레이 `fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4`, 패널 `relative bg-slate-900 border border-amber-500/40 rounded-3xl max-w-2xl w-full max-h-[90vh] shadow-2xl overflow-hidden flex flex-col`, 장식 `absolute inset-0 bg-gradient-to-b from-amber-500/10 to-transparent` | **`Modal`** (size="md"=max-w-2xl, rounded="rounded-3xl", backdropClass="bg-slate-950/80") | `borderClass`(border-slate-700 하드코드 → 덮어쓰기), `zIndex`(현재 z-[500]), `blurBackdrop`는 이미 지원(기본 false → 이 모달만 true), `max-h`(85vh vs 90vh) | 체크: 275(×2). `Modal.headerColor`(상단 1px 바 + 우상단 글로우)로 amber 장식을 부분 대체 가능하나 현재의 그라디언트와 모양이 다름 |
| C3 L278-283 | button | X 닫기 `absolute top-4 right-4 z-20 text-slate-500 hover:text-white transition-colors`, `X size=18` | `Modal` 내장 X(`title` 없을 때 `absolute top-6 right-6 p-2 rounded-full`, size 24) | 크기/위치 차이만 | 체크: 278, 280. Modal은 `hideCloseButton`로 끌 수 있음 |
| C4 L285-301 (17줄) | 기타(헤더) | `relative z-10 flex flex-col items-center gap-3 px-8 pt-9 pb-5` + `Trophy size=44 text-amber-400`, 라벨 `text-xs font-bold text-amber-400`, 팀명 `text-2xl font-black`, `TeamLogo xl`, 전적 `font-mono tabular-nums` | `Modal title`은 좌측 정렬 `text-xl font-bold` — 중앙 정렬 히어로 헤더는 children으로 | — | 체크: 286(z-10), 296(tabular-nums). 이모지 "🎉"(L294) 사용 |
| C5 L304-310 | 기타(본문 스크롤 영역) | `relative z-10 flex-1 overflow-y-auto custom-scrollbar border-t border-slate-800 px-4 pb-4` + 로딩 `Loader2 size=20` / 빈 상태 `text-center text-sm text-slate-500 py-10` | Modal 본문이 이미 `overflow-y-auto custom-scrollbar` | — | 체크: 304(×2), 307, 310. 스피너 `py-10` 자체 레이아웃 |
| C6 L312-348 (37줄) | table / th / td | 원시 `<table className="w-full text-xs mt-3">`, `thead tr text-slate-500 uppercase text-[10px]`, th 11개(L315-325: `text-left/center py-1.5 font-bold w-N`), `tbody divide-y divide-slate-800/60`, td 11개 중 10개가 `text-center font-mono tabular-nums`(L335-344, 1개만 `text-white font-bold`) | `Table` + `TableHead` + `TableHeaderCell` + `TableRow` + `TableCell variant="stat"` | `Table`에 `bare`(테두리/라운드/배경 제거) 및 `density="compact"`(py-1.5, text-xs, header h-8) 필요. `TableHead`는 sticky z-40 `bg-slate-950`라 모달 배경 `bg-slate-900`과 톤 차이 | 체크: 312(table_raw), 315-325(th_raw ×11), 331·335-344(td_raw ×11, tabular ×10). 컬럼 11개를 배열 설정으로 map하면 th/td 21줄 → 약 8줄. 합계 컬럼 Table `TableCell variant=stat`은 `text-right` 기본이라 `align="center"` 명시 필요 |
| C7 L352-359 (8줄) | button / divider | 푸터 `relative z-10 flex justify-center px-8 py-4 border-t border-slate-800 shrink-0` + `button px-6 py-2 bg-amber-600 hover:bg-amber-500 rounded-xl text-sm font-bold text-white` | `Modal footer` 슬롯 + `Button` | `Button variant="warning"/"gold"`(amber-600) 신규. Button은 `uppercase tracking-widest rounded-2xl text-xs` 고정이라 모양 변화 | 체크: 352(×2), 353. 닫기 시 localStorage 저장(`handleClose`)이라 Modal `onClose`와 동일 핸들러 사용 가능 |
| C8 L289-290 | header text | 라벨 `text-xs font-bold text-amber-400 tracking-wide`, 팀명 `text-2xl font-black text-white ko-tight` | — | — | 추가 |
| C9 L294 | 기타(이모지) | `축하합니다! 🎉` | — | — | 추가. UI에 이모지 사용(다른 화면은 lucide 아이콘 — 일관성 검토 대상) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 숫자 td `text-center font-mono tabular-nums` | 335-344 | 10 |
| th `text-center py-1.5 font-bold w-N` | 316-325 | 10 |
| `relative z-10` 장식 레이어 위 래퍼 | 286, 304, 352 | 3 |
| `border-t border-slate-800` | 304, 352 | 2 |

### 분석 — 공용 Modal을 안 쓴 이유
- `Modal`이 없어서는 아님: `Modal.tsx`는 2026-02-08에 추가(git `820463f5`), `TournamentChampionModal.tsx`는 2026-07-23(`0c4607be`)에 추가됨. 즉 Modal이 먼저 존재했다.
- 장식/효과 요구가 가장 가능성 높은 이유(추정): (1) 컨페티가 `z-[101]`로 오버레이(`z-[100]`) 위를 떠야 하는데, 공용 Modal은 `z-[500]` + portal이라 그대로 쓰면 컨페티가 패널 뒤로 가려짐. (2) 패널 테두리 `border-amber-500/40` + 내부 `from-amber-500/10` 그라디언트가 `Modal`의 `border-slate-700`(오버라이드 prop 없음)·`headerColor`(상단 바+글로우)와 맞지 않음. (3) `backdrop-blur-sm`을 쓰는데 Modal 기본값은 `blurBackdrop=false`(MEMORY: 스크롤 렉 이슈로 기본 off) — 단 이 모달은 스크롤 영역이 작아 큰 문제 아님(추정).
- 동작 차이도 있음: Modal은 바깥 `mousedown` 시 `onClose`를 호출하므로, 지금처럼 "바깥을 눌러도 닫히지 않고 확인/X만 인정"(그리고 닫을 때 localStorage 저장)하는 동작과 다름 — 의도된 차이인지 코드만으론 알 수 없음(추정: 우승 축하를 실수로 닫지 않게 하려는 의도).
- 그 외 구현 방식상 `Modal`은 `isOpen` prop을 받는데 이 컴포넌트는 조건부 렌더(`return null`)로 처리 — 전환은 단순.
- 결론: 장식 때문이 주원인이며(추정), `Modal`에 `zIndex`/`borderClass`/`backdropDismiss={false}` 3개 prop만 추가하면 전환 가능. 선행 조건에 포함.

---

## AllStarHalfCourt.tsx (63줄)

### 공용 컴포넌트 사용 현황
- 공용 컴포넌트 사용 0개. React만 import. 순수 SVG 도형 컴포넌트(`<svg>` 자체도 만들지 않고 자식 노드만 반환 — 호출부 MultiAllStarView L72가 `<svg viewBox>` 제공).

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| H1 L18-44 (27줄) | 기타(SVG 코트 선) | `HalfCourtLines`: 3점 아크·페인트·자유투 서클·레인 마크 path, `strokeWidth=2`, `translate(500,0) rotate(90)` | 없음 | 해당 없음(도메인 도형) | 추가. 체크리스트의 L9("없음")는 주석 문구 오탐 |
| H2 L54-62 | 기타(코트 배경) | `rect fill=background` + paint `rect` — 색은 props(`background/paint/line`) | — | — | 추가. 호출부가 하드코드 hex(A19) 전달 |

### 파일 내 반복 패턴
- 레인 스페이스 마크 8개 `<line>`(L34-41) 8줄 — 데이터 배열로 map 가능하나 가치 낮음.

---

## 화면군 종합

### 불일치 대조표
| 항목 | TournamentBracketView | MultiAllStarView | TournamentChampionModal | 공용 기준 |
|---|---|---|---|---|
| 팀 로고 | `TeamLogoImg`(실제→구→placehold), `w-6 h-6` | 인라인 `<img>` 동일 체인, `w-20 h-20` | `TeamLogo size="xl"`(구 URL만) | `TeamLogo`는 실제 로고 미시도. `TeamMark badge`만 체인 보유 |
| 화면 헤더 | 없음 | `h1 text-lg font-black` 컴팩트 바 | 없음(모달) | `PageHeader` text-4xl |
| 섹션 제목 | 라운드 헤더 classic `text-2xl white` / split `text-sm slate-400` | h2 `text-2xl` 8회, h3 `text-sm`/`text-lg` 혼용 | h2 `text-2xl` | — |
| 라운드/결승 용어 | "결승"(L25,974)·"준결승"·"파이널"(L771)·"컨퍼런스 파이널" 혼용 | — | "토너먼트 우승" | — |
| 팀 표기 | 슬롯은 `team_abbr`, 패널 경기카드는 슬러그 uppercase(L1046, 1062) | `team_abbr` | `team_name` | — |
| 탭/세그먼트 | 없음 | 세그먼트 2곳(필형) | 없음 | `TabBar` 언더라인형 |
| 닫기 X | size 18, `p-1.5 rounded-lg hover:bg-white/10` | — | size 18, 무 패딩 absolute | `Modal` size 24 `p-2 rounded-full hover:bg-slate-800` |
| 오버레이 | 컨테이너 absolute `bg-black/40 z-10/z-20` | — | fixed `bg-slate-950/80 backdrop-blur-sm z-100/101` | `Modal` fixed `bg-slate-950/80` z-500, blur 기본 off |
| 모서리 | 각진(rounded 없음) 카드, 패널 `rounded-lg` 경기 카드 | `rounded-lg`, `rounded-md` | `rounded-3xl`, 버튼 `rounded-xl` | `Card`/`Button` rounded-3xl/2xl |
| 로딩 | — | `flex-1` 중앙 + 스피너 28 | 스피너 20 `py-10` | MultiPlayoffs는 `min-h-screen` |
| 빈 상태 | 텍스트 한 줄 `h-24` | 아이콘형(A12) 1 + 문장형 3 | 문장형 `py-10` | PostseasonBracket 아이콘형 1 |
| 호버 강조색 | sky-400 (슬롯 링·커넥터) | indigo-300 (이름) | white (X) | indigo 기본(Table/Dropdown/TabBar) |
| 우승 표현 | 배너(final.webp, amber 라벨) | — | Trophy 아이콘 + 컨페티 + 모달 | newsFeedCards/PlayoffChampionRenderer에 별도 구현 |
| 한글 `uppercase` | L738·754·770·778·788·856·879·939·972 등 다수 | h3 9회 | — | `Button/Badge/TabBar`도 uppercase 고정(공용도 동일) |
| 키보드/접근성 | `div onClick` 매치 카드·경기 카드 | `span onClick` 이름, `button` 로고(O) | `button` O | — |

### 통합 후보(효과 큰 순)
| 순위 | 후보 | 대상 라인 목록 | 제거되는 줄 수(세어서) | 선행 조건 |
|---|---|---|---|---|
| 1 | 올스타 좌/우 대칭 블록 추출(`ConferencePanel`, `RisingTeamPanel`) | MultiAllStarView L198-210+L211-223 (26줄), L524-541+L542-559 (36줄) | 62줄 → 호출 약 24줄이면 순감 약 38줄 | 없음 (파일 내 리팩터) |
| 2 | `ChampionModal` → 공용 `Modal` + `Table` + `Button` | TournamentChampionModal L275-283 (9), L312-348 (37), L352-359 (8) | 54줄 → 컬럼 배열화로 약 20줄 | Modal에 `zIndex`·`borderClass`·`backdropDismiss={false}` 추가, Table에 `bare`+`density="compact"`, Button `variant="warning"` |
| 3 | `SectionTitle`(아이콘 h2) + `SubTitle`(h3) | MultiAllStarView A8 8회×4줄(32줄), A10 h3 9줄 | 32 + 9 = 41줄 → 17줄 | 없음. 크기 규칙(lg/sm) 결정 필요 |
| 4 | `EmptyState` (아이콘형·문장형·컴팩트형) | PostseasonBracket L26-33 (8), MultiAllStarView L383-393 (11), L473-475·508-510·517-519 (9), TournamentBracketView L1014-1017 (4) | 32줄 → 약 8줄 | 3가지 시각 변형 합의 |
| 5 | `SideRoundHeader` 로컬 추출 | TournamentBracketView L746-761, L781-796 | 32줄 → 약 18줄 | 없음 (파일 내) |
| 6 | `TeamMark`/`TeamLogo` real 모드로 `TeamLogoImg`·인라인 `<img>` 일원화 | TournamentBracketView L79-97 (19, 주석 포함 16), MultiAllStarView L91-104 (14) | 최소 30줄(+ repo 내 다른 12+ 파일 동일 체인) | `TeamMark` 시그니처 정리(`badge.color` 불필요), placehold 루프 방어 |
| 7 | `SegmentedControl` | MultiAllStarView L244-259 (16), L418-431 (14) | 30줄 → 약 8줄 | MultiStandingsView·newsFeedCards 호출부(범위 밖) 확인 후 공용화 |
| 8 | `SidePanel`(앵커 오버레이 + 백드롭 + X) | TournamentBracketView L956-972, L977-983, L1070-1072 | 약 25줄(셸) | 새 컴포넌트 설계(컨테이너 앵커 vs 뷰포트, 슬라이드 방향) |
| 9 | `ChampionBanner` 로컬 추출 | TournamentBracketView L854-862, L937-945 | 18줄 → 약 10줄 | 크기 prop 통일 |
| 10 | `LoadingSpinner` | MultiPlayoffsView L18-24 (7), MultiAllStarView 3회×3줄 (9), ChampionModal L306-308 (3) | 19줄 → 약 6줄 (+ repo 전체 30개 파일) | `fill`/`inline` 모드 결정 |
| 11 | `Stepper` | MultiAllStarView L140-177 (38) + L127-134 (8) | 호출 단순화(제거보다 재사용 가치) | 신규 컴포넌트 |
| 12 | 라운드 라벨 규칙 통일 | TournamentBracketView L24-35, L750-760, L876-886, L972-976 | 줄 수 변화 작음(규칙 정리) | 용어 결정("결승" vs "파이널", 토너먼트에서 "컨퍼런스 파이널" 오표기 수정) |

참고 — 제외 권장: BracketConnector(L252-298), AllStarHalfCourt, TeamSlot/MatchCard 팀 컬러 행 — 도메인 특화라 공용화 이득이 작음. 호버 하이라이트 커넥터 계산(L353-368 vs L668-683, 32줄)과 gridSeries/gridConns 계산(57줄)은 UI 조각이 아니라 로직 중복이므로 별도 훅/함수 추출 대상으로만 기록.

### 체크리스트 대조 결과
| 파일 | 매치 수 | 반영 수 | 오탐 수 | 추가 발견 수 |
|---|---|---|---|---|
| TournamentBracketView | 18 | 15 | 3 (L475, L580, L699: 주석 속 "없음") | 16 (T2,T3,T4,T5,T7,T9,T11,T12,T14,T15,T18,T20,T22,T23,T25,T26) |
| MultiAllStarView | 23 | 20 | 3 (L185, L308, L312: 주석 속 "없음") | 11 (A1,A3,A5,A6,A7,A8,A10,A12,A17,A18,A19) |
| MultiPlayoffsView | 1 | 1 | 0 | 0 |
| PostseasonBracket | 1 | 1 | 0 | 0 |
| TournamentChampionModal | 48 | 48 | 0 | 2 (C8, C9) |
| AllStarHalfCourt | 1 | 0 | 1 (L9: 주석 "영향 없음") | 2 (H1, H2) |
| 합계 | 92 | 85 | 7 | 31 |

메모: 체크리스트 항목 중 같은 줄의 중복 토큰(예: L58 overlay_fixed+zindex, L335 td_raw+tabular)은 한 표 행으로 묶어 반영. MultiAllStarView L473, L508(문장형 empty)은 체크리스트에는 없었지만 L518과 동일 패턴이라 A16에 함께 기록(추가 발견 수에는 별도 집계하지 않음). 체크리스트 'zindex' 역할 항목(L286, L304, L352, L280, L958, L968)은 UI 조각이라기보다 겹침 레이어 지정으로, 각각 소속 조각(헤더/본문/푸터/닫기/백드롭/패널)의 행에 병합함.
