# 01 뉴스피드 — UI 조각 전수 감사

읽은 범위:
- `views/multi/season/newsFeedCards.tsx`: 1~3481줄 (전부; `wc -l` 3481, 지시문의 3482는 말줄 개행 포함 수치로 추정). 500줄 내외로 끊어 8회 Read, 마지막 줄(3481) 확인.
- `views/multi/season/MultiNewsFeedView.tsx`: 1~615줄 (전부; `wc -l` 615, 지시문의 616과 같은 사유로 추정). 2회 Read.
- 공용 API(감사 대상 아님, 먼저 읽음): `components/common/` Table, TabBar, Button, Badge, Card, Modal, Dropdown, PageHeader, TeamLogo, OvrBadge, InjuryStatusBadge. 추가로 TeamBadge, TeamMark(아래 핵심 발견 참조)도 읽음.
- 체크리스트: `ui-audit/by_file/views__multi__season__newsFeedCards.md`(500건), `...MultiNewsFeedView.md`(46건) 전부 대조.

사전 주의 2건
1. 지시문은 "카드 32종"이라 했으나 실제로는 **타입별 카드 29종 + LegacyCard 1종 + StoryCard(디스패처, UI 없음)**. 이벤트 kind는 30개(`HEADLINE_ICON` 3388~3419)이고 `AllstarGameResultCard` 하나가 `allstar_game_result`/`allstar_rising_stars_result` 2개 kind를 처리. 아래 "카드 골격" 행은 29+Legacy 기준으로 적었다.
2. **핵심 발견**: `components/common/TeamMark.tsx`에 이미 이 파일이 7번 복붙한 "실제 로고 `<img>` + `onError` 2단 폴백(구 로고 → placehold.co) + TeamLogo 폴백" 체인이 공용으로 존재한다(`badge` prop 지정 시). newsFeedCards는 TeamMark를 import하지 않고 인라인 복붙(155/1835/1984/2330/2475/2761/2895 + `getRealTeamLogoUrl` 9곳).

---

## views/multi/season/newsFeedCards.tsx (3481줄)

### 공용 컴포넌트 사용 현황
- 사용: `TeamLogo`(7곳: 164, 1844, 1993, 2339, 2484, 2770, 2904 — 전부 로고 이미지 폴백용), `OvrBadge`(3곳: 1812, 2308, 2873 — 전부 `!w-7 !h-7 !text-xs !shadow-none` 강제 덮어쓰기), `TeamBadge`(6곳: 1225, 1294, 3105, 3112, 3188, 3279), `PlayerHoverCard`(16곳: 198, 375, 813, 895, 1036, 1120, 1347, 1435, 1538, 1609, 1817, 1966, 2312, 2457, 2743, 2877). 공용 유틸 `formatMoney`(902, 916), `formatRelativeTime`, `getReadableTextColor`.
- 미사용(존재하지만 안 씀): `Table`/`TableHead`/`TableRow`/`TableHeaderCell`/`TableCell`/`TableFoot`(17개 표 전부 raw `<table>`; 306~311 주석에 "카드형 UI라 걷어냄" 의도적 이탈 기록), `TeamMark`(폴백 체인 7중 복붙), `Button`(link 스타일 버튼 10개 전부 raw `<button>`), `Badge`(pill 1곳 3322 raw), `Card`(hero 박스 2곳·3PT 샷차트 컨테이너·LegacyCard·PlayIn 행 raw), `Modal`/`Dropdown`/`TabBar`/`PageHeader`(해당 용도 없음), `InjuryStatusBadge`(InjuryCard가 부상명을 텍스트로만 표시; 용도 불일치라 대체 대상 아님), `Skeleton`(로딩이 Loader2 스피너).

### 직접 구현 UI 조각
(비고 열의 `[추가]`는 기계 체크리스트에 없던 조각. `오탐`은 체크리스트 매치지만 UI 조각이 아닌 것.)

| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 106~108 | 기타(브랜드 이미지) | `BrandMark`: `<img src="/images/bc2.svg">`, 호출부 전부 `h-4 w-auto` | 없음(콘텐츠 이미지) | LetterShell 안으로 흡수 | [추가] 29회 호출. View 326에 같은 이미지가 `h-5`로 또 복붙 |
| 114~116 | 기타(이벤트 로고 이미지) | `EventLetterLogo`: `h-16 w-16` | 없음 | 그대로 유지 | [추가] 9회 호출(2048, 2091, 2145, 2216, 2393, 2674, 2812, 2944, 3033) |
| 129, 169 | section-header | 박스스코어 폴백 `<h4 text-lg font-black text-white uppercase>` / 헤드라인 `<h4 flex items-center gap-1.5>` | 없음 | `SectionTitle` 신규(아래 h3/h4/h2 묶음 참조) | [추가] |
| 132~139, 172~178 | hover(클릭 텍스트) | 팀약어/스코어 `<span cursor-pointer hover:text-indigo-400 hover:underline>` (onOpenTeam 있을 때만) | 없음 | `ClickableText`(onClick 있을 때만 cursor/hover 부여) 신규 | [추가] 같은 클래스 문자열이 이 파일 42줄에 등장(134, 173, 200, 228, 485, 696, 703, 710, 767, 798, 805, 815, 859, 942, 1047, 1131, 1163, 1272, 1304, 1349, 1358, 1437, 1447, 1540, 1550, 1611, 1620, 1819, 1847, 1968, 1996, 2314, 2342, 2459, 2487, 2745, 2773, 2879, 2907, 3156, 3238, 3284). 플레이오프 카드는 `onOpenTeam?.()`로 cursor 게이팅 없음(3106, 3113, 3156, 3165, 3167, 3189, 3238, 3247, 3249, 3254, 3284, 3293, 3295, 3317, 3328, 3358) → 불일치 |
| 146~167 (155, 156, 159) | logo-fallback | `teamLogo()`: `color_primary` 있으면 `<img src=getRealTeamLogoUrl(slug) w-8 h-8 onError 2단 폴백>`, 없으면 `TeamLogo size=sm`. 22줄 | **`TeamMark`**(동일 폴백 체인 공용 존재) | `TeamMark className="w-8 h-8" badge={{color, abbr}}` 로 호출. 단 TeamMark `className` 필수·`teamName` 선택 | 체크리스트 155/156/159는 진짜 매치. 164의 `TeamLogo size="sm"`은 TeamMark가 이미 내부 폴백으로 흡수 |
| 189~209 | 기타(헤드라인 h1) | `HeadlineTitle`: `<h1 text-xl font-black text-white>` + PlayerHoverCard + 이름 접두 클릭 | 없음 | LetterShell의 `title` 슬롯 | [추가] h1 `text-xl font-black text-white`가 27곳(197, 483, 765, 953, 1090, 1174, 1263, 1380, 1489, 1650, 1690, 2044, 2086, 2140, 2211, 2388, 2669, 2807, 2939, 3028, 3125, 3155, 3200, 3237, 3283 + 챔피언 3315 `text-3xl`, FMVP 3348 `text-2xl`) |
| 215~269 (표 240~266) | table | `QuarterScoreTable`: `<table text-left border-collapse>` 콘텐츠 폭(w-full 아님), thead `<tr border-b border-slate-700>`(242), 팀행 `border-b border-slate-800/60`(251). th 3개 JSX(243 빈칸, 245 반복 Q1~/OT, 247 "최종") → 렌더 th는 periodCount+2(정규 4쿼터 6개). td 6개 JSX(252, 254, 256, 259, 261, 263) | `Table`+`TableHead`+`TableHeaderCell`+`TableRow`+`TableCell` | Table에 `plain`(wrapper 무장식, w-fit) variant, 컴팩트 density(py-1) 신규 | 헤더 색 `text-slate-500`(BOX 계열과 일치). 239 `space-y-1` 감싸는 div는 불필요(추정) |
| 301~303 | 기타(스타일 상수) | `BOX_HEADER_CELL`(py-1.5 px-2 text-sm font-bold text-slate-500 uppercase) / `BOX_STAT_CELL`(py-1 px-2 text-sm text-slate-300) / `BOX_TOTAL_CELL`(py-1.5 px-2 font-bold text-white) | `TableHeaderCell`/`TableCell` | Table density 프리셋 | [추가] AWARD_* 상수(1323~1324)와 팔레트·패딩이 달라 두 벌 존재 |
| 307, 310, 311, 312 | 주석 | "Table.tsx 카드형 → 순수 HTML 테이블로 간소화(사용자 요청)" 설명 주석 | — | — | 오탐(307 sticky, 310 table_raw·empty_state, 311 empty_state, 312 tabular). 단, 의도적 이탈 이력이므로 Table plain variant 도입 시 이 사용자 요청 톤("테두리 없는 얇은 구분선만, 배경/그림자 없음, tabular-nums/font-mono 없음") 보존 필수 |
| 316~433 (표 334~426) | table | `TeamBoxTable`: `<div overflow-x-auto>`(333) + `<table w-full>`(334). 헤더 `<tr style=backgroundColor 팀색>`(336), th 19개: 팀명 th(337~343, 클릭 가능, text-left font-black) + POS/MIN/PTS/OREB/TREB/AST/STL/BLK/TOV/PF/FG/FG%/3P/3P%/FT/FT%/TS%/+/- 18개(344~361, 전부 `BOX_HEADER_CELL text-center` + inline color). 본문 `<tr>` 19 td(372~398): hover `hover:bg-white/5`+`isHighlighted bg-amber-400/10`(372), 선수셀(374), 숫자셀 `BOX_STAT_CELL text-center` 17개(379~395) + 플러스마이너스(396 색조건 emerald/red). tfoot(405, `bg-slate-800/40`) `<tr border-t border-slate-700>`(406) td 19개(407~426, 410은 빈 셀) | `Table`+`TableHead noRow`+`TableRow`+`TableCell`+`TableFoot` | ① Table plain variant ② TableHead 팀컬러 배경 prop(`bgColor`/`fgColor`) 신규 ③ `TableRow highlight` prop(amber 하이라이트) ④ TableFoot 색 prop | 체크리스트 매치 대부분 소속: 334/336/337/344~361/372/374/379~396/406/407/408/410~426. **409는 주석 오탐**(합계 MIN 비움 설명). 2회 호출(양 팀) + AllstarGameResultCard(3066~3067)도 재사용 |
| 372 | hover | 행 클릭 가능 시 `cursor-pointer hover:bg-white/5` | `TableRow onClick` (hover:bg-white/5+cursor-pointer+group 이미 동일) | — | 동일 로직이라 1:1 치환 가능 |
| 374~378 | 기타(선수 이름 셀) | `<td py-1 px-2 text-left>` + `PlayerHoverCard` + `<span text-sm font-bold text-slate-300>` | `TableCell variant="player"`(value/subText/onClick) | variant="player"는 hover 카드 래핑 없음 → PlayerHoverCard 슬롯 지원 또는 `PlayerNameCell` 신규 | [추가] 선수 이름 셀 패턴 일람은 아래 "파일 내 반복 패턴" P2 |
| 448~534 (493, 506) | card(골격) — GameResultCard | wrapper `max-w-5xl space-y-6 ko-normal relative`(480), BrandMark(481), 헤더 블록 `space-y-2`: h1(483~491, 팀명 클릭) + 날짜 `<p text-sm text-slate-500>`(492) + 구분선 `<div border-t border-slate-700>`(493). 본문 blurb 496~502. 로딩 스피너 505~507(506 `Loader2 size 20 animate-spin text-indigo-400`, `py-8`). 박스스코어 영역 509~526. 대기 안내 528~530(dashed 박스) | — | `LetterShell({title,date,blurb,children})` 신규 | 493 divider_t, 506 spinner 매치. 528~530 dashed [추가] |
| 542~612 (542, 575, 588, 604) | card(골격) — FeatCard | 동일 골격. 헤더 560~576(주석 포함 17줄·코드 8줄). 575 구분선, 588 스피너(`size 20`, `py-8`). 596~597 TeamBoxTable×2 `highlightPlayerId`. 606~608 dashed 대기 안내 | — | LetterShell | 604 주석 오탐(RLS 10분 지연 설명). 542는 주석 오탐("새로 페이지를 열 필요 없음") |
| 528~530, 606~608, 3071~3073 | empty | `<p text-xs text-slate-500 ko-normal py-4 text-center border border-dashed border-slate-800 rounded-lg>` "박스스코어는 경기 종료 후 최대 10분 뒤 공개됩니다." 3곳 동일 문구 | 없음 | `EmptyNote`/`EmptyState`(공용 없음) 신규 | [추가] 기계 체크리스트에 없음(`border-dashed` 토큰 미포함). View 560/607은 다른 스타일(아래 대조표) |
| 505~507, 587~589, 3046~3048 | spinner | `<div flex items-center justify-center py-8><Loader2 size=20 animate-spin text-indigo-400>`(3줄) | 없음(공용 Spinner 없음. Button의 isLoading 내부 Loader2만 존재) | `Spinner`/`LoadingBlock` 신규 | 체크리스트 506/588/3047 진짜 매치. 같은 3줄 ×3 |
| 626~736 (651, 670~725) | card(골격)+table — StreakCard | 골격 637~652(헤더 코드 8줄, 651 구분선). 규칙별 섹션 `space-y-2`(667) + `<h4 text-base font-black text-white uppercase>`(668) + `<div overflow-x-auto>`(669) + 표 670: thead tr `border-b border-slate-700`(672), th 12개(673 날짜, 674 상대는 `BOX_HEADER_CELL`(좌정렬), 675~684 PTS REB AST STL BLK TOV PF FG% 3P% FT% 10개 `text-center`). 본문 tr `border-b border-slate-800/60`(692), td 12개: 693 날짜, 694~715 상대(팀약어·스코어·팀약어 3개 클릭 span, 696/703/710), 716 PTS(font-bold text-white), 717~725 나머지 9개 | `Table` 세트 | Table plain variant + 컬럼 선언형 | 체크리스트 670/672~684/692/693/694/716~725 매치. 651 divider_t. 620 주석에 BOX_STAT_CELL 언급(주석) |
| 742~831 (742, 775, 788~826) | card(골격)+list — WinStreakCard | 골격 762~776(775 구분선), 연승 경기 리스트: 제목 `<h4 text-base font-black text-white uppercase>`(788) + `<div divide-y divide-slate-800/60>`(789) + 행 `<div flex items-center gap-2 py-2 text-sm>`(795) 날짜·팀약어(클릭)·스코어·팀약어·세로선 구분자·MVP 이름(PlayerHoverCard). 표가 아니라 flex 행 | `Table`로 환원 가능(날짜/AWAY/스코어/HOME/MVP 5열) | 표로 통일 시 Streak 표(670~730)와 같은 컬럼 선언 재사용 | [추가] 같은 데이터 형태를 StreakCard는 표, WinStreakCard는 divide-y 리스트로 서로 다르게 구현 — 불일치. 742 주석 오탐("별도 즉석 조회가 필요 없음") |
| 843~923 (870~917) | table — TradePlayerTable | 팀 제목 `<span text-sm font-black text-slate-300 uppercase>`(858, 클릭 가능)+ `<table w-full table-fixed text-left border-collapse>`(870). 헤더 tr 팀색 배경(872) + th 6개(873 선수 `w-[32%]`, 874 PTS, 875 REB, 876 AST `w-[13%]`, 877 연봉 `w-[16%]`, 878 잔여연수 `w-[13%]`, 전부 `py-1.5 px-2 text-sm font-bold` + inline color). 본문 tr(892 hover:bg-white/5 `border-b border-slate-800/60`) td 6개(894 이름 `truncate`, 899~901 `text-slate-300 text-center` PTS/REB/AST 평균, 902 연봉 `formatMoney`, 903 `${years}년`). tfoot(910 `bg-slate-800/40`) tr(911) td 6개(912 "합계", 913~915 "—"×3, 916 합계금액 `formatMoney` font-bold, 917 "—") | `Table`+`TableHead`+`TableRow`+`TableCell`+`TableFoot`. 금액은 `formatMoney`(공용 util) 이미 사용 | Table `fixed` 레이아웃·열 너비 prop(`TableHeaderCell width` 이미 존재), TableHead 팀색 prop | 체크리스트 870/872~878/892/894/899~903/911~917 매치(902·916 `money_short`는 `formatMoney` 공용 호출 → 직접 포맷 아님, 사실상 오탐 성격). 하드코딩 폭 `w-[%]`는 TableHeaderCell `width`로 대체 가능 |
| 930~974 (957) | card(골격) — TradeCard | 골격 950~958(h1에 teamSpan×2 `↔`), 957 구분선. blurb 960~966. 968~971 TradePlayerTable ×2 | — | LetterShell | teamSpan 940~947 = 클릭 span 복붙 |
| 986~990 | 기타(로컬 날짜 포맷) | `formatFullDateCell` "YYYY년 MM월 DD일" | — | utils 공용 포맷터로 | [추가] View 84 `formatSimDateShort`와 형제(포맷만 다름) |
| 992~1062 (1011, 1023~1055) | card(골격)+table — InjuryCard | 골격 1003~1012(HeadlineTitle, 1011 구분선). `<div overflow-x-auto>`(1022) + 표 1023: thead tr `border-b border-slate-700`(1025, 배경 없음!) th 5개(1026 선수 좌정렬, 1027~1030 소속팀/부상명/예상 결장/복귀 예정일 `text-center`). 1행 tbody(1034): td 5개(1035 선수명 `text-sm font-bold text-white` `hover:underline`만, 1045 팀명 클릭 `hover:text-indigo-400 hover:underline`, 1053 부상명, 1054 기간, 1055 `formatFullDateCell`) | `Table` 세트(+`InjuryStatusBadge`는 부상 상태 칩이 필요하면) | Table plain variant | **이름 셀 hover가 `hover:underline`만**(1038, 1122) — 다른 모든 표는 `hover:text-indigo-400 hover:underline` → 불일치. 헤더 배경: 이 표와 1104 표·670 표는 배경 없음, 1403 이후 어워드류는 `bg-slate-800/60` → 불일치 |
| 1069~1147 (1092, 1104~1138) | card(골격)+table — SuspensionCard | 골격 1087~1093(h1 평문, 1092 구분선). 표 1104: tr(1106 배경 없음) th 4개(1107 선수 `BOX_HEADER_CELL`, 1108~1110 소속팀/출장정지/복귀 예정일 center). 본문 2행(1114~1141, tr 1118 `border-b border-slate-800/60`) td 4개(1119 선수 hover:underline만, 1129 팀 클릭, 1137 `N경기`, 1138 날짜) | `Table` 세트 | 위와 동일 | InjuryCard 표와 구조 99% 동일(컬럼 1개 차이) → 컬럼 선언형으로 통합 가능 |
| 1153~1247 (1178, 1189~1244) | card(골격)+table — PowerRankingCard | 골격 1171~1179(h1, 1178 구분선), blurb 1181~1187, riser/faller 안내 `<p flex items-center gap-2 text-sm text-emerald-400/rose-400>` + TrendingUp/Down 아이콘(1189~1206). 표 1208 `table-fixed` (오버플로 래퍼 없음!): tr(1210 `border-b border-slate-700 bg-slate-800/60`), th 6개(1211~1216: 순위 `w-[8%]` 팀 `w-[44%]` 재능/공격/수비/파워스코어 `w-[12%]`, 전부 `text-slate-300`). 본문 30행: tr(1221), td 6개(1222 순위 `font-black text-slate-400 tabular-nums`, 1223 팀 셀: `TeamBadge xs`(1225~1233 = 9줄 prop 스프레드) + 팀명 span(1234), 1237~1240 점수 `tabular-nums`, 1240은 `font-bold text-white`) | `Table` 세트 + `TeamBadge` | Table plain variant+컬럼 선언, `TeamBadge team={LeagueTeamRow}` 래퍼(prop 스프레드 제거) | 1208/1210~1216/1221~1223/1237~1240 매치. 1222·1237~1240 `tabular-nums`는 진짜 사용(BOX 계열은 312 주석처럼 의도적으로 제거 — 불일치) |
| 1252~1317 (1265, 1281~1302) | card(골격)+table — DraftLotteryResultCard | 골격 1260~1266(1265 구분선). 본문 1268~1279 단일 문단(클릭 span 1271~1276). 표 1281 table-fixed: tr(1283 bg-slate-800/60) th 2개(1284 순위 `w-[15%]` center, 1285 팀 `w-[85%]` left). 본문 tr(1290) td 2개(1291 순위, 1292 팀: `TeamBadge xs`(1294~1302 9줄)+클릭 span 1303~1308) | `Table` 세트+`TeamBadge` | 동일 | PowerRanking 표의 부분집합(순위+팀) |
| 1323~1324 | 기타(스타일 상수) | `AWARD_RANK_TH`(py-1.5 px-2 text-sm font-bold text-slate-300 text-center whitespace-nowrap) / `AWARD_RANK_TD`(py-1.5 px-2 text-sm text-slate-300 text-center tabular-nums whitespace-nowrap) | `TableHeaderCell`/`TableCell` | Table density 프리셋 | 1324 tabular 진짜 매치. [추가] 1323(TH)은 체크리스트에 없음. 좌정렬 th 변형은 상수 없이 인라인 18곳 복붙(1407, 1409, 1514, 1516, 1596, 1597, 1774, 1775, 1930, 1931, 2277, 2278, 2438, 2439, 2727, 2728, 2859, 2860 — `py-1.5 px-2 text-sm font-bold text-slate-300 text-left whitespace-nowrap`) |
| 1332~1366 | card(hero) — AwardHero | `flex flex-col items-center text-center gap-2 py-2`: 트로피 `<img h-32>`(1345) + 이름(PlayerHoverCard+클릭 `text-lg font-black`) + 포지션 + 팀명 클릭 + `statLine` flex-wrap | `Card` | `Card variant="flat"` 가능하나 gradient 필요 시 신규 `HeroPanel` | [추가] Champion(3312)/FinalsMvp(3345)의 amber gradient hero와 구조 중복 |
| 1368~1475 (1382, 1403~1466) | card(골격)+table — MvpAwardCard | 골격 1377~1383(1382 구분선), AwardHero 1385~1400, 표: 래퍼 1402 `overflow-x-auto` + table 1403: tr(1405 `border-b border-slate-700 bg-slate-800/60`), **th 18개**(1406 순위, 1407 선수[좌], 1408 포지션, 1409 팀[좌], 1410~1417 PPG/RPG/APG/SPG/BPG/FG%/3P%/FT% 8개, 1418~1422 1위~5위 5개, 1423 득표; 좌정렬 외 전부 `AWARD_RANK_TH`). 본문 tr(1432) td 18개: 1433 순위(`AWARD_RANK_TD font-black text-slate-400`), 1434~1443 선수(PlayerHoverCard+클릭), 1444 포지션(text-slate-500), 1445~1452 팀약어(클릭 span, 로고 없음), 1453~1465 숫자 13개, 1466 득표(font-bold text-white) | `Table` 세트 | Table plain+컬럼 선언 | 1403/1405~1423/1432~1434/1444/1445/1453~1466 매치 |
| 1477~1574 (1491, 1510~1565) | card(골격)+table — DpoyAwardCard | MVP 복붙(통계 컬럼만 다름). 골격 1486~1492(1491), AwardHero 1494~1507. 표 1510: tr(1512), **th 14개**(1513~1526: 순위/선수/포지션/팀/SPG/BPG/TOVF/DREB/OREB/DFG%/1~3위/득표). tr(1535) td 14개(1536 순위, 1537~1546 선수, 1547 포지션, 1548~1555 팀, 1556~1565 숫자) | 위와 동일 | 위와 동일 | MVP와 1433~1452 ↔ 1536~1555 문자 단위 동일(20줄 복붙) |
| 1580~1636 (1592~1627) | section-header+table — AllTeamSection | 티어 제목 `<h3 text-sm font-black text-slate-300 uppercase>`(1590) + 표 1592: tr(1594 bg-slate-800/60), th = 고정 3개(1595 포지션, 1596 선수[좌], 1597 팀[좌]) + `statCols.map`(1598, 올-오펜시브 12개 → 15, 올-디펜시브 11개 → 14). 본문 tr(1606) td 3 + map(1607 포지션, 1608~1617 선수, 1618~1625 팀약어, 1627 `statCols.map`) | `Table` 세트 | **컬럼 선언형**이 이미 이 컴포넌트에 있는 유일한 예(`statCols: {label,get}[]`) — 일반화 후보 | 1592/1594~1598/1606~1608/1618/1627 매치. 1638 `ALL_TEAM_TIER_LABELS` |
| 1640~1717 (1652, 1692) | card(골격) — AllNbaTeamCard / AllDefTeamCard | 골격 1647~1653 / 1687~1693(구분선 1652, 1692), 본문 `<div space-y-4>` 안에 AllTeamSection×N. statCols 12개/11개 인라인 선언 | LetterShell | LetterShell | 두 카드는 컬럼 정의 외 동일 |
| 1719~1732 | 주석 | 타입 설명 | — | — | 1723, 1724 주석 오탐(empty_state 토큰 "없음") |
| 1734~1880 (1756, 1762~1877) | section-header+table — AllstarRosterTable | `<h3 flex items-center gap-1.5 text-sm font-black text-slate-300 uppercase>`(1764, `logoSrc` 있으면 `<img h-5 w-5>` 1765) + 표 1769: tr(1771 bg-slate-800/60) th = 포지션(1772) + `showOvr`면 OVR(1773) + 선수(1774)+팀(1775) + `showStats`면 9개(1778~1786 G MP PTS REB AST STL BLK TOV FG%) + `showVotes`면 2개(1791~1792) → **최대 15개**. 본문 tr(1807): 1808 포지션, 1809~1815 OVR 셀(`OvrBadge sm` + `!w-7 !h-7 !text-xs !shadow-none` 강제, 1812), 1816~1825 선수, 1826~1853 팀 셀(로고 `<img w-5 h-5 object-contain>` + onError 2단 폴백 1829~1842 + TeamLogo xs 폴백 1844 + 클릭 약어 1846~1851), 1854~1866 통계 td 9개(1856~1864; `perGame`/`shootPct` 로컬 헬퍼 1803~1805), 1867~1872 득표 td 2개(1869 `toLocaleString()` tabular-nums, 1870 `text-white`) | `Table` 세트+`OvrBadge`+`TeamMark` | 컬럼 선언형 + `TeamCell` + OvrBadge `size` 28px 지원(현재 sm=24px/md=32px, 28px 없어 `!` 강제) | 1756 주석 오탐. 1835/1836/1839 logo-fallback 진짜. 1869 `toLocaleString` = 득표수 정수 포맷이라 money 아님(`money_locale` 성격상 오탐) |
| 1892~1899, 1918~1921 | 기타(타입/주석) | `VoteSectionEntry` | — | — | 1892, 1893, 1918 주석 오탐 |
| 1901~2029 (1926~2019) | section-header+table — AllstarVoteSection | RosterTable과 거의 동일: `<h3 text-sm font-black text-slate-300 uppercase>`(1924, `hideLabel`로 생략 가능), 래퍼 `overflow-x-auto` + `scrollable`이면 `overflow-y-auto max-h-96`(1925), 표 1926, thead tr(1928 `border-b border-slate-700 bg-slate-800/60` + scrollable이면 **`sticky top-0 z-10`**), th = 순위(1929)+선수(1930)+팀(1931)+`showStats` 9개(1934~1942)+`showVotes` 2개(1947~1948) → 최대 14개. 본문 tr(1963): 1964 순위 인덱스, 1965~1974 선수, 1975~2002 팀 셀(로고 폴백 1984~1988 복붙), 2005~2013 통계, 2018 `toLocaleString`, 2019 `text-white` 득표율 | `Table`(sticky `TableHead`는 이미 sticky top-0 z-40 지원) | 컬럼 선언형. `scrollable`은 Table `fullHeight`+`className max-h-96`로 | 1926/1928(zindex·sticky 진짜)/1929~1931/1934~1942/1947/1948/1963~1965/1975/1984~1988/2005~2013/2018/2019 매치. **RosterTable과 병합 가능**(차이: 1열 순위↔포지션, OVR 열 유무, scrollable) |
| 2031~2071 (2046, 2048~2067) | card(골격) — AllstarVoteUpdateCard | 골격 2041~2047(2046 구분선), EventLetterLogo(2048), 컨퍼런스 제목 `<h2 text-base font-black text-indigo-400>`(2050, 2055) + Section×4. 하단 링크 버튼 2059~2068 | LetterShell | LetterShell, LinkButton | h2 4곳(2050, 2055, 2163, 2171) [추가] |
| 2059~2068 (2060) | button | `<button type=button className="flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer">` + 텍스트 + `<ArrowRight size=14>`. 10줄 | `Button variant="ghost" size="xs"`(근접) | **Button에 `link` variant 신규**(현재 Button은 baseStyles에 `uppercase tracking-widest rounded-2xl font-black` 고정이라 그대로는 못 씀) | 동일 10줄 블록이 9곳: 2059~2068, 2103~2112, 2178~2187, 2237~2246, 2410~2419, 2700~2709, 2832~2841, 2961~2970, 3076~3085 + 3258~3262(5줄 변형). 체크리스트 button_raw 2060/2104/2179/2238/2411/2701/2833/2962/3077/3259 전부 진짜 |
| 2073~2115 (2075, 2088, 2104) | card(골격) — AllstarVoteStartCard | 골격 2083~2089(2088), 문단 3개(2090~2102), 링크 버튼 2103~2112(2104) | LetterShell, LinkButton | — | 2075 주석 오탐("voteProgress로 갈릴 필요 없음") |
| 2126~2190 (2142, 2163~2187) | card(골격) — AllstarVoteResultCard | 골격 2137~2143(2142), 컨퍼런스 제목+로고 `<h2 flex items-center gap-1.5 text-base font-black text-indigo-400>`+`<img h-6 w-6>`(2163~2166, 2171~2174), RosterTable×4, 링크 2178~2187(2179) | LetterShell, LinkButton | — | |
| 2200~2249 (2213, 2234~2246) | card(골격) — AllstarRisingStarsCard | 골격 2208~2214(2213), RosterTable×2 (logoSrc), 링크 2237~2246(2238) | LetterShell, LinkButton | — | |
| 2256~2261 | 기타(계산 헬퍼) | `threePointZonePct` | — | — | UI 아님 |
| 2266~2365 (2272~2358) | table — ThreePointContestTable | 래퍼 2271 `overflow-x-auto` + 표 2272: tr(2274 bg-slate-800/60), **th 14개**(2275 순위, 2276 OVR, 2277 선수[좌], 2278 팀[좌], 2279~2288 G MP PTS 3PM 3PA 3P% CNR% 45% ATB% TS% 10개). 본문 tr(2304) td 14개: 2305 순위, 2306~2310 OVR(`OvrBadge` 강제 28px, 2308), 2311~2320 선수(2311 td), 2321~2348 팀 셀(로고 폴백 2330~2334 복붙), 2349~2358 통계 10개 | `Table` 세트+`OvrBadge`+`TeamMark` | 컬럼 선언형 | 체크리스트 2272/2274~2288/2304~2306/2308/2311/2321/2330/2331/2334/2349~2358 매치. 2297 `perGame` 3번째 복붙 |
| 2376 | 주석 | — | — | — | 오탐(empty_state: "영향 없음") |
| 2377~2422 (2390, 2406~2419) | card(골격) — AllstarThreePointContestCard | 골격 2385~2391(2390), 문단 2392~2405, h3 "참가자"(2407) + ThreePointContestTable, 링크 2410~2419(2411) | LetterShell, LinkButton | — | |
| 2427~2502 (2434~2495) | table — ThreePointContestResultTable | 래퍼 2433 + 표 2434: tr(2436 bg-slate-800/60), th 9개(2437 순위, 2438 선수[좌], 2439 팀[좌], 2440~2445 좌측 코너/좌측 45도/중앙/우측 45도/우측 코너/합계). 본문 tr(2454 `${isHighlighted ? 'bg-amber-400/10' : ''}` = TeamBoxTable 372와 같은 하이라이트), td: 2455 순위, 2456~2465 선수(2456), 2466~2493 팀 셀(로고 폴백 2475~2479 복붙), 2494 랙 점수 map 5개(1줄), 2495 합계(font-black text-white) | `Table` 세트 | 컬럼 선언형+`TableRow highlight` | 체크리스트 th 9·td 5(JSX 라인 기준)로 일치. 렌더 td는 9개 |
| 2520~2565 (2527, 2558) | 기타(SVG 샷차트 요소) | `RACK_POSITIONS`/`RACK_LABELS`/`ThreePointBallIcon`(SVG circle)/`RackShotCluster`(SVG `<g>`+`<rect>`+`<text className="fill-white text-base font-black tabular-nums">`) | 없음(도메인 그래픽) | 대체 대상 아님 | 2527 주석 오탐("머니볼 구분 없음"). 2558 `tabular-nums`는 SVG text 클래스(표 아님) |
| 2571~2651 (2583~2626) | card+segment+list — ThreePointContestShotChart | 컨테이너 `flex gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4`(2583). 좌측 선택 패널 `w-40`: 라운드 세그먼트 `<div flex items-center gap-1 bg-slate-800 rounded-md p-1 w-fit>`(2585) + 버튼×2(2587~2597, `px-3 py-1.5 rounded text-sm font-bold`, 활성 `bg-slate-600 text-white`). 선수 선택 리스트(2599~2621): 버튼 `w-full flex ... px-2 py-1.5 rounded`(2604), 우승자 `bg-amber-400 text-slate-950`, 선택 `bg-indigo-500/20 text-white`, 기본 `text-slate-400 hover:bg-slate-800 hover:text-slate-200`(2613), 점수 `tabular-nums`(2617). 우측: 데이터 없음 안내 `<p text-sm text-slate-500 py-8 text-center>`(2625~2627, 2626), SVG 차트(2629~2646) | 세그먼트: 공용 없음 / 컨테이너: `Card variant="flat" padding="sm"`(rounded-3xl라 반경 불일치) | **`SegmentedControl` 신규**(View 542~552와 3번째 후보). 선택 리스트는 View 568~582 리스트 행과 유사 | 체크리스트 2585(segment_ctrl 유일), 2587, 2604, 2613, 2617, 2626 매치. 선택 상태 색이 3종(slate-600 / indigo-500/20 / amber-400) 제각각 |
| 2657~2712 (2671, 2684~2709) | card(골격) — AllstarThreePointContestResultCard | 골격 2666~2672(2671), h3 3개(2686 "샷차트", 2691 "결선", 2695 "예선"), ShotChart+ResultTable×2, 링크 2700~2709(2701) | LetterShell, LinkButton | — | |
| 2714~2788 (2723~2781) | table — DunkContestResultTable | ThreePointContestResultTable 구조 복붙(랙 5 → 덩크 2). 래퍼 2722, 표 2723: tr(2725), th 6개(2726 순위, 2727 선수, 2728 팀, 2729 덩크 1, 2730 덩크 2, 2731 합계). tr(2740 하이라이트), td 6개(2741 순위, 2742~2751 선수, 2752~2779 팀 셀(로고 폴백 2761~2765), 2780 dunks map 2개, 2781 합계) | `Table` 세트 | 컬럼 선언형 | 3PT 결과표와 컬럼 정의 외 동일 |
| 2790~2844 (2793, 2809, 2833) | card(골격) — AllstarDunkContestResultCard | 골격 2804~2810(2809), h3×2(2824, 2828), 링크 2832~2841(2833) | LetterShell, LinkButton | — | 2793 주석 오탐("위치 개념이 없음") |
| 2846~2921 (2854~2914) | table — DunkContestTable | 래퍼 2853, 표 2854: tr(2856), th 5개(2857 순위, 2858 OVR, 2859 선수, 2860 팀, 2861 덩크 점수). tr(2869) td 5개(2870 순위, 2871~2875 OVR(`OvrBadge` 강제 28px 2873), 2876~2885 선수, 2886~2913 팀 셀(로고 폴백 2895~2899), 2914 덩크 점수 `tabular-nums`) | `Table` 세트 | 컬럼 선언형 | |
| 2923~2973 (2925, 2941, 2962) | card(골격) — AllstarDunkContestCard | 골격 2936~2942(2941), h3 "참가자"(2958)+DunkContestTable, 링크 2961~2970(2962) | LetterShell, LinkButton | — | 2925 주석 오탐("세부 분류가 없음") |
| 2975~2990 | 기타(가상 팀 행 생성) | `buildAllStarTeamRow` | — | — | UI 아님 |
| 3002~3088 (3030, 3045~3085) | card(골격) — AllstarGameResultCard | 골격 3025~3031(3030), EventLetterLogo, 문단 3034~3042. 로딩 3046~3048(3047 스피너), 박스스코어 3049~3069(BoxScoreHeadline+QuarterScoreTable+TeamBoxTable×2), 대기 안내 3071~3073(dashed), 링크 3076~3085(3077) | LetterShell, Spinner, EmptyNote, LinkButton | — | kind 2개(allstar_game_result·allstar_rising_stars_result)를 한 컴포넌트로 처리 |
| 3094~3140 (3127) | card(골격) — PlayInBracketCard | wrapper **`max-w-3xl`**(3122, 다른 22개 카드는 5xl). 골격 3122~3128(3127). `renderGroup`(3099~3120): 소제목 `<h3 text-sm font-bold text-slate-400>`(3101) + 행 `<div flex items-center justify-between gap-2 px-3 py-2.5 rounded-md bg-slate-800/60 text-sm>`(3103) + TeamBadge 2개(3105, 3112, prop 스프레드가 각각 매우 긴 1줄) + 클릭 span(3106, 3113) + "VS" | `Card variant="flat" padding="none"`(반경 rounded-3xl라 부적합), `TeamBadge` | `MatchupRow`/`ListRow` 신규, `TeamBadge team=` 래퍼 | 3103 [추가] 행 박스. h3 스타일이 `font-bold text-slate-400`(3101, 3184)로 앞의 h3(`font-black text-slate-300 uppercase`)와 불일치 |
| 3142~3175 (3162) | card(골격) — PlayInResultCard | max-w-3xl, 골격 3152~3163(3162), 문단 3164~3172 | LetterShell | LetterShell(`maxWidth` 선택) | |
| 3177~3214 (3202) | card(골격) — PlayoffBracketConfirmedCard | max-w-3xl, 골격 3197~3203(3202), `renderGroup`(3182~3195): 행 `flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/60 text-sm`(3186) + 시드 번호 + TeamBadge(3188) + 클릭 span(3189) | `TeamBadge` | `MatchupRow`/`ListRow` | 3186 행 박스: 3103과 py만 다른 복붙 [추가] |
| 3216~3265 (3244, 3258~3262) | card(골격) — PlayoffGameResultCard | max-w-3xl, 골격 3234~3245(3244), 문단 3246~3257, 링크 3258~3262 `<button ...> 경기 다시보기 <ArrowRight>` 1줄 className(3259) | LetterShell, LinkButton | — | |
| 3267~3300 (3290) | card(골격) — PlayoffSeriesResultCard | max-w-3xl, 상단 `<div flex items-center gap-4 py-2>`+TeamBadge md(3279)+TrendingUp(3280), 골격 3282~3291(3290) | LetterShell, TeamBadge | — | 이 카드만 BrandMark 아래 헤더 앞에 로고 줄이 끼어 순서가 다름 |
| 3302~3334 (3312~3325) | card(hero) — PlayoffChampionCard | **`max-w-3xl space-y-8`**(3310, 다른 카드 space-y-6). hero `<div flex flex-col items-center text-center gap-3 py-4 px-6 rounded-2xl bg-gradient-to-b from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/20>`(3312) + 트로피 img(3313) + 이벤트라벨 + h1 `text-3xl`(3315) + pill(3321~3323). 날짜 `<p -mt-4>`는 hero 아래(3325, 다른 카드는 h1 아래) | `Badge`(pill), `Card` | Badge: 3322 `px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300`는 variant `warning`(`bg-amber-500/10 text-amber-400 border`)과 색조 근사 — 정확 일치 아님. `HeroPanel` 신규(FinalsMvp 3345와 공유) | 체크리스트 3322 pill_rounded 진짜. 날짜 위치가 hero 카드만 다름(불일치) |
| 3336~3385 (3343~3371) | card(hero) — FinalsMvpCard | max-w-3xl space-y-8, hero(3345 동일 gradient 박스) + img h-32(3346) + h1 `text-2xl`(3348) + 팀 클릭 span(3356) + stat flex-wrap(3362~3369: `<b className=text-white>` PPG/RPG...). 날짜 3371 `<p -mt-4>` | `Card` | HeroPanel | AwardHero(1344~1364)와 statLine flex-wrap 구조 중복(`flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-slate-300` 1363, 3362) |
| 3387 | 주석 | "폴백(옛 이벤트, payload.v 없음)" | — | — | 오탐(empty_state) |
| 3388~3419 | 기타(아이콘 맵) | `HEADLINE_ICON` Record | — | — | UI 아님(Legacy 전용) |
| 3421~3430 (3424, 3427) | card — LegacyCard | `<div flex items-start gap-3 px-4 py-3 rounded-lg border bg-slate-900 border-slate-800>`(3424) + 아이콘 + 헤드라인 + 상대시각 `text-xs text-slate-500 tabular-nums`(3427) | `Card variant="default" padding="sm"`(rounded-3xl·shadow-xl라 반경/그림자 다름) | Card에 `radius` prop 필요 | 3427 tabular 진짜. 3424 카드 박스는 [추가] |
| 3436~3481 | 기타(디스패처) | `StoryCard` switch 30 case | — | — | UI 아님 |

카드 골격 요약(29종+Legacy, 라인은 위 표 각 행에 포함)

| # | 카드 | 라인 | wrapper | 헤더 구분선 라인 | 표 | th 수 |
|---|---|---|---|---|---|---|
| 1 | GameResultCard | 448~534 | max-w-5xl space-y-6 | 493 | QuarterScore+TeamBox×2 | 6/19 |
| 2 | FeatCard | 543~612 | 5xl | 575 | TeamBox×2 | 19 |
| 3 | StreakCard | 626~736 | 5xl | 651 | 규칙별 표 N개 | 12 |
| 4 | WinStreakCard | 743~831 | 5xl | 775 | (표 아님, divide-y 리스트) | — |
| 5 | TradeCard | 930~974 | 5xl | 957 | TradePlayerTable×2 | 6 |
| 6 | InjuryCard | 992~1062 | 5xl | 1011 | 1 | 5 |
| 7 | SuspensionCard | 1069~1147 | 5xl | 1092 | 1 | 4 |
| 8 | PowerRankingCard | 1153~1247 | 5xl | 1178 | 1 | 6 |
| 9 | DraftLotteryResultCard | 1252~1317 | 5xl | 1265 | 1 | 2 |
| 10 | MvpAwardCard | 1368~1475 | 5xl | 1382 | 1 | 18 |
| 11 | DpoyAwardCard | 1477~1574 | 5xl | 1491 | 1 | 14 |
| 12 | AllNbaTeamCard | 1640~1678 | 5xl | 1652 | AllTeamSection×3 | 15 |
| 13 | AllDefTeamCard | 1680~1717 | 5xl | 1692 | AllTeamSection×2 | 14 |
| 14 | AllstarVoteUpdateCard | 2031~2071 | 5xl | 2046 | VoteSection×4 | 14 |
| 15 | AllstarVoteStartCard | 2076~2115 | 5xl | 2088 | 없음 | — |
| 16 | AllstarVoteResultCard | 2126~2190 | 5xl | 2142 | RosterTable×4 | 15 |
| 17 | AllstarRisingStarsCard | 2200~2249 | 5xl | 2213 | RosterTable×2 | 13 |
| 18 | AllstarThreePointContestCard | 2377~2422 | 5xl | 2390 | 3PT 표 | 14 |
| 19 | AllstarThreePointContestResultCard | 2657~2712 | 5xl | 2671 | 3PTResult×2 + 샷차트 | 9 |
| 20 | AllstarDunkContestResultCard | 2795~2844 | 5xl | 2809 | DunkResult×2 | 6 |
| 21 | AllstarDunkContestCard | 2928~2973 | 5xl | 2941 | Dunk 표 | 5 |
| 22 | AllstarGameResultCard(kind 2개) | 3002~3088 | 5xl | 3030 | QuarterScore+TeamBox×2 | 6/19 |
| 23 | PlayInBracketCard | 3094~3140 | **max-w-3xl** | 3127 | 없음(행 박스) | — |
| 24 | PlayInResultCard | 3142~3175 | 3xl | 3162 | 없음 | — |
| 25 | PlayoffBracketConfirmedCard | 3177~3214 | 3xl | 3202 | 없음(행 박스) | — |
| 26 | PlayoffGameResultCard | 3216~3265 | 3xl | 3244 | 없음 | — |
| 27 | PlayoffSeriesResultCard | 3267~3300 | 3xl | 3290 | 없음 | — |
| 28 | PlayoffChampionCard | 3302~3334 | **3xl space-y-8** | (hero, 구분선 없음) | 없음 | — |
| 29 | FinalsMvpCard | 3336~3385 | 3xl space-y-8 | (hero, 구분선 없음) | 없음 | — |
| 30 | LegacyCard | 3421~3430 | (카드 박스 `px-4 py-3 rounded-lg border`) | — | 없음 | — |

th 수 = 렌더되는 최대 th 개수. 표 17개 JSX의 th 합계는 체크리스트 기준 156(th_raw)·td 179(td_raw). 표별 JSX 개수: Quarter 3/6, TeamBox 19/38(헤더1+본문19+tfoot19 중 396 한 줄은 멀티라인으로 1건), Streak 12/12, TradePlayer 6/12, Injury 5/5, Suspension 4/4, PowerRanking 6/6, DraftLottery 2/2, MVP 18/18, DPOY 14/14, AllTeamSection 4/4(map 포함 JSX 기준), Roster 15/15, Vote 14/14, 3PT 14/14, 3PTResult 9/5, DunkResult 6/5, Dunk 5/5.

### 파일 내 반복 패턴

- **P1 카드 골격(BrandMark + wrapper + 헤더 블록 + 날짜 p + 구분선 + 닫기)** — 29회(BrandMark 481, 559, 638, 763, 951, 1004, 1088, 1172, 1261, 1378, 1487, 1648, 1688, 2042, 2084, 2138, 2209, 2386, 2667, 2805, 2937, 3026, 3123, 3153, 3198, 3235, 3277, 3311, 3344), 구분선 `<div className="border-t border-slate-700" />` 27회(493, 575, 651, 775, 957, 1011, 1092, 1178, 1265, 1382, 1491, 1652, 1692, 2046, 2088, 2142, 2213, 2390, 2671, 2809, 2941, 3030, 3127, 3162, 3202, 3244, 3290). 헤더 블록(`<div space-y-2>`~`</div>`, 주석 제외 코드줄)은 구분선 27개에서 5줄×17 + 13줄×2(482, 764) + 8줄×3(560, 639, 1005) + 7줄×2(952, 1173) + 10줄×3(3154, 3236, 3282) = **179줄**(스크립트로 센 값). BrandMark 29줄 + wrapper 여닫기 58줄을 더하면 **266줄**.
- **P2 선수 이름 셀**(PlayerHoverCard + 클릭 span `text-sm font-bold text-slate-100`) — 9곳 × 10줄 = **90줄**: 1434~1443, 1537~1546, 1608~1617, 1816~1825, 1965~1974, 2311~2320, 2456~2465, 2742~2751, 2876~2885. 변형: 374~378(box, slate-300·클릭 없음), 894~898(trade, slate-300), 1035~1044·1119~1128(injury/suspension, white·`hover:underline`만).
- **P3 팀 셀 — 로고 포함**(`<img> + onError 2단 폴백 + TeamLogo + 클릭 약어`) — 6곳 × 28줄(td 여닫기 포함) = **168줄**: 1826~1853, 1975~2002, 2321~2348, 2466~2493, 2752~2779, 2886~2913. 거기에 BoxScoreHeadline `teamLogo` 146~167(22줄) → 합계 **190줄**.
- **P4 팀 셀 — 로고 없음**(클릭 약어 td) — 3곳 × 8줄 = **24줄**: 1445~1452, 1548~1555, 1618~1625.
- **P5 순위 셀** `<td className={`${AWARD_RANK_TD} font-black text-slate-400`}>{idx + 1}</td>` — 7줄(1433, 1536, 1964, 2305, 2455, 2741, 2870) + 변형 2줄(1222, 1291).
- **P6 OVR 셀**(OvrBadge `!w-7 !h-7 !text-xs !shadow-none` 덮어쓰기) — 3곳: 1809~1815(7줄), 2306~2310(5줄), 2871~2875(5줄) = **17줄**.
- **P7 통계 컬럼 묶음** — th 9개×2(1778~1786, 1934~1942) + td 9개×2(1856~1864, 2005~2013) + 헬퍼 `perGame`/`shootPct` 3줄×2(1803~1805, 1959~1961; 2297 `perGame` 1줄) + 득표 th 6줄×2(1789~1794, 1945~1950) + 득표 td 6줄×2(1867~1872, 2016~2021) = **약 78줄**(RosterTable↔VoteSection 병합 시 절반 제거).
- **P8 링크 버튼** — 9곳 × 10줄 + 1곳 5줄 = **95줄**(위 표 참조).
- **P9 blurb 문단 블록**(`{blurb && <div space-y-2>{blurb.map(<p text-sm text-slate-300 leading-relaxed>)}</div>}`) — 8곳 × 7줄 = **56줄**: 496~502, 578~584, 654~660, 778~784, 960~966, 1014~1020, 1095~1101, 1181~1187.
- **P10 스피너 / dashed 안내** — 스피너 3곳×3줄(505~507, 587~589, 3046~3048) = 9줄, dashed 안내 3곳×3줄(528~530, 606~608, 3071~3073) = 9줄.
- **P11 섹션 제목** — h3 12곳(1590, 1764, 1924, 2407, 2686, 2691, 2695, 2824, 2828, 2958 = `text-sm font-black text-slate-300 uppercase`; 3101, 3184 = `text-sm font-bold text-slate-400`), h4 6곳(129, 169, 522, 668, 788, 3065 = `text-base font-black text-white uppercase` / BoxScoreHeadline), h2 4곳(2050, 2055, 2163, 2171 = `text-base font-black text-indigo-400`).
- **P12 표 틀** — `<div overflow-x-auto>`+`<table w-full text-left border-collapse>` 13곳(333, 669, 1022, 1103, 1402, 1509, 1591, 1768, 1925, 2271, 2433, 2722, 2853) + table-fixed 3곳(870, 1208, 1281) + Quarter(240). thead tr 헤더 행: `bg-slate-800/60` 계열 11곳(1210, 1283, 1405, 1512, 1594, 1771, 1928, 2274, 2436, 2725, 2856), 배경 없는 계열 4곳(242, 672, 1025, 1106), 팀색 인라인 2곳(336, 872).
- **P13 TeamBadge prop 스프레드**(`abbr/colorPrimary/colorSecondary/colorText` 4개를 `teamBySlug.get(...)`로 매번 조회) — 6곳: 1225~1233(9줄), 1294~1302(9줄), 3105, 3112, 3188, 3279(각 1줄이나 매우 긴 줄) = 22줄.
- **P14 hero 박스** — AwardHero(1344~1364 21줄), 챔피언(3312~3324 13줄), FMVP(3345~3370 26줄) = 60줄. 뒤 두 개는 동일 gradient 클래스 문자열 복붙.
- **P15 행 hover** — 372, 892 `hover:bg-white/5` = `TableRow`와 동일 동작(2줄).

---

## views/multi/season/MultiNewsFeedView.tsx (615줄)

### 공용 컴포넌트 사용 현황
- 사용: `TeamBadge`(401~408, 팀 필터 드롭다운 행), `PlayerHoverCard`는 컴포넌트가 아니라 `buildPlayerCardMap`/`mergeStatsIntoPlayerCardMap`/`mergeInjuryIntoPlayerCardMap` 함수만 import, `StoryCard`(newsFeedCards).
- 미사용(존재하지만 안 씀): `Dropdown`(팀 필터가 자체 fixed 오버레이+패널 구현), `Button`(8개 버튼 전부 raw), `TabBar`(알림 범위 3택은 탭 아님 — 세그먼트가 맞음), `Badge`(369 카운트 pill), `Card`(없음), `Modal`(없음), `PageHeader`(상단 제목 대신 BrandMark 이미지), `Table`(해당 없음), `TeamLogo`/`TeamMark`(없음), `OvrBadge`/`InjuryStatusBadge`(해당 없음), `Skeleton`(스피너 사용).

### 직접 구현 UI 조각

| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 84~87 | 기타(로컬 날짜 포맷) | `formatSimDateShort` YY/MM/DD | — | utils로 | [추가] newsFeedCards 986 `formatFullDateCell`과 형제 |
| 106, 268, 285, 287 | 주석 | useSeasonContext/poolPlayers 설명 | — | — | 오탐(empty_state "없음") 4건 |
| 321 | divider | 상단 필터 바 래퍼 `flex flex-col border-b border-slate-800 bg-slate-900 shrink-0` | — | — | 하단 구분선. 체크리스트 divider_b |
| 326 | 기타(브랜드 이미지) | `<img src="/images/bc2.svg" className="h-5 w-auto">` | — | — | [추가] newsFeedCards `BrandMark`(h-4)의 복붙 — 공유 export 가능 |
| 330~354 (330, 331, 333, 339, 341, 347, 349) | segment(날짜 스텝퍼) | 컨테이너 `flex items-center gap-0.5 h-[30px] bg-slate-950 rounded-lg border border-slate-800 pl-1 pr-1`(330) + 아이콘 버튼 `p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors`(331~337, 339~345) + 라벨 span(338) + "오늘" 버튼 `text-sm font-bold text-indigo-400 ... border-l`(347~352) | `Button variant="ghost" size="xs"` (근접하나 uppercase/rounded-2xl/px-3 baseStyles가 맞지 않음) | `Stepper`/`DateStepper` 신규 또는 Button `icon` variant(정사각 p-1) 신규 | 높이 **30px**(330)이 같은 줄 다른 컨트롤의 **36px**과 불일치 컨테이너 330은 card_box, 버튼 331/339/347은 button_raw 매치(스텝퍼 전체를 하나의 컨트롤로 묶어 서술) |
| 361~372 (362, 364, 369) | button+badge(필터 트리거) | `<button ref className="flex items-center gap-2 h-[36px] px-3 bg-slate-950 rounded-lg border shadow-sm text-sm font-bold">` 선택 시 `border-indigo-500/50 text-indigo-400`. 카운트 pill `bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full`(369) | `Dropdown trigger` + `DropdownButton`(구현 있음: `bg-slate-900 border-slate-800 rounded-lg px-4 py-2` 톤이 다름) , `Badge`(pill: `rounded-full border` + 테마 — 단색 indigo-600 채움은 variant 없음) | `DropdownButton`에 `h-[36px] bg-slate-950 active` prop(필터 톤), `Badge variant="solid"`/count 변형 신규 | 369 pill_rounded 진짜. 체크리스트 362 button_raw |
| 374~415 (376, 378) | dropdown | 자체 오버레이 `<div fixed inset-0 z-[100]>`(376) + 패널 `fixed w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-[101] animate-in fade-in zoom-in-95 duration-150`(378) + 위치 state(184~194: `teamBtnRef`/`teamDropdownPos`/`handleTeamDropdownToggle`) 수동 계산 | **`Dropdown`**(portal, fixed, outside-click, `align`/`width`/`isOpen` 제어형 모두 지원) | 변경 시 `Dropdown trigger={...} isOpen onOpenChange width="w-64" align="right"` + children에 체크박스 행. Dropdown 패널 z-[9999]·`fade-in duration-100`(zoom 없음)으로 미세 차이 | 체크리스트 376(overlay_fixed·zindex), 378(card_box·zindex). 복붙 원본: 주석 358~360에 `components/leaderboard/LeaderboardToolbar.tsx` 팀 필터라고 명시(타 파일 중복, 추정 — 이번 감사 범위 밖) |
| 381~412 (383, 395) | hover/list | 체크박스 행 `flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors` ×2 종류(모두 선택 383, 팀 행 395) + 커스텀 체크박스 `w-4 h-4 rounded border ... bg-indigo-600 border-indigo-600 / border-slate-600 bg-slate-950`(386~388, 398~400) | Dropdown `items`(active는 indigo 배경 틱; 체크박스 시각 아님) | **`Checkbox`(체크박스 박스)/`CheckboxRow` 신규** | 같은 체크박스 박스가 530~532(타입 필터)에도 복붙(총 3곳) [추가] |
| 391 | divider | `<div className="h-px bg-slate-800 mx-2 my-1">` | — | — | [추가] |
| 419~428 (420) | toggle | 단일 라벨 스위치 컨테이너 `flex items-center justify-between gap-3 h-[36px] bg-slate-950 rounded-lg border border-slate-800 shadow-sm px-3 cursor-pointer group select-none hover:border-slate-700 transition-colors shrink-0`, 트랙 `w-8 h-4 rounded-full ... bg-indigo-600/bg-slate-800`, 노브 `w-3 h-3 rounded-full bg-white absolute top-0.5` | 없음(공용 Toggle 없음) | **`ToggleSwitch`/`ToggleChip` 신규** | 체크리스트 420 card_box. [추가] 주석 418 "리더보드 색상 스케일 토글과 동일" = 타 파일 복붙 |
| 431~441 (432) | toggle | 양쪽 라벨 스위치(최신순/오래된순) 위와 같은 트랙/노브, 라벨 2개 | 없음 | `ToggleSwitch` (leftLabel/rightLabel) | 체크리스트 432 card_box. 420과 트랙·노브 클래스 100% 동일 |
| 447~477 (447, 451, 460, 469) | input(date range) | 컨테이너 `flex items-center h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm shrink-0`(447) + `<input type=date ... bg-transparent text-sm text-slate-400 outline-none [color-scheme:dark] w-[124px]>` ×2(451, 460) + 초기화 X 버튼(469) | 없음 | `DateRangeInput`/`FilterPill` 신규 | 체크리스트 447(card_box), 451/460(input_raw), 469(button_raw) |
| 486, 487~488 (486, 488) | divider/layout | 좌우 분할 `w-[30%] shrink-0 border-r border-slate-800 overflow-y-auto custom-scrollbar bg-slate-900`(488) | — | — | 486 주석 오탐("반응형 좌/우 전환 없음"). 488 divider_v 진짜. MultiFrontOfficeView 인박스와 같은 레이아웃(주석 482~486) — 공용 `SplitPane` 후보(추정) |
| 489 | sticky/header | 좌측 상단 고정 영역 `sticky top-0 z-10 bg-slate-950 border-b border-slate-800` | — | — | 체크리스트 divider_b·zindex·sticky |
| 499~520 (500, 504, 512) | input(search) | 컨테이너 `relative h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 focus-within:border-indigo-500 ... shadow-sm w-full`(500) + 아이콘 + `<input type=text ... bg-transparent pl-9 pr-8 text-sm font-bold text-white outline-none placeholder:text-slate-600>`(504) + X 버튼(512) | 없음 | **`SearchInput` 신규** | 체크리스트 500(card_box), 504(input_raw), 512(button_raw). 주석 496~498: LeaderboardToolbar 검색과 동일한 시각 언어(타 파일 복붙, 추정) |
| 521~537 (530) | list/checkbox | 타입 필터: `flex flex-wrap gap-x-3 gap-y-1.5` + 항목 `flex items-center gap-1.5 cursor-pointer` + 체크박스 박스(530~532) + 라벨 `text-sm font-bold` | 위 Checkbox | `CheckboxRow` | [추가] 530~532 박스는 386~388/398~400과 동일 |
| 540~553 (540, 543) | segment(알림 범위) | `border-t border-slate-800`(540) + 라벨 `text-xs font-bold text-slate-500` + 버튼 3개(543~551) `px-2 py-0.5 rounded-md text-xs font-bold`, 활성 `bg-indigo-600 text-white`/비활성 `bg-slate-800 text-slate-400 hover:text-white` | `TabBar`는 부적합(h-14 하단 보더 탭) | **`SegmentedControl` 신규**(newsFeedCards 2585 샷차트 라운드 선택과 같은 용도, 다만 활성색 indigo-600 vs slate-600) | 체크리스트 540(divider_t), 543(button_raw). 개별 버튼 pill 형이고 컨테이너 없음 vs 2585는 컨테이너 있음 → 두 벌 |
| 555~558 (557) | spinner | `<Loader2 size={22} animate-spin text-indigo-400>` in `py-16` | 없음 | `Spinner`/`LoadingBlock` | 체크리스트 557. newsFeedCards는 size 20·py-8 → 불일치 |
| 559~562 (561) | empty | `<p text-sm text-slate-500 ko-normal py-8 text-center px-4>` "조건에 맞는 소식이 없습니다."/"아직 소식이 없습니다." | 없음 | `EmptyState` 신규 | 체크리스트 561(두 매치 같은 줄). 카드의 dashed 안내(`text-xs ... border-dashed rounded-lg`)와 불일치 |
| 565~567 | 주석 | — | — | — | 오탐(empty_state "사실상 없음") |
| 568~582 (574, 575, 579) | list(행) | 행 `flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b border-slate-800/50 text-sm ko-normal transition-colors`, 선택 `bg-slate-700 text-white`, 비선택 `bg-slate-900 hover:bg-white/5`(575), 날짜 `shrink-0 text-sm tabular-nums`(579) | `TableRow onClick`(hover:bg-white/5와 일치)은 `<tr>`만 가능 | `ListRow`(selected prop) 신규 — 샷차트 선수 리스트(2604)와 통합 후보 | 체크리스트 574(divider_b), 575(row_hover), 579(tabular) |
| 583~593 (585, 588) | button | "더 보기" `w-full px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 ko-normal` | `Button variant="secondary" size="sm" fullWidth isLoading loadingText="불러오는 중..."` (rounded-2xl·uppercase·tracking-widest·border-slate-700 차이 존재) | 톤을 맞추려면 Button `rounded` prop(Modal의 `rounded` prop과 같은 방식) 신규 | 체크리스트 585(button_raw), 588(row_hover·card_box). `isLoading`/`loadingText`는 Button에 이미 있음 |
| 598~609 (607) | empty/layout | 우측 패널 `flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-slate-900 p-10` + 빈 상태 `h-full flex items-center justify-center text-slate-600 text-sm ko-normal` "선택된 소식이 없습니다." | 없음 | `EmptyState` | 체크리스트 607. 561과 텍스트 색 다름(slate-500 vs slate-600) |

### 파일 내 반복 패턴
- **V1 36px 필터 pill 컨테이너**(`h-[36px] bg-slate-950 rounded-lg border border-slate-800 [hover:border-slate-700] shadow-sm`) — 5곳: 364(버튼), 420, 432, 447, 500 (+ 588 "더 보기"는 같은 팔레트 다른 높이). 스텝퍼 330만 30px.
- **V2 체크박스 박스**(`w-4 h-4 rounded border ... bg-indigo-600 border-indigo-600 / border-slate-600 bg-slate-950` + `<Check size=10>`) — 3곳: 386~388(3줄), 398~400(3줄), 530~532(3줄) + 각 행 래퍼.
- **V3 토글 트랙/노브**(`w-8 h-4 rounded-full relative ... bg-indigo-600/bg-slate-800` + `w-3 h-3 rounded-full bg-white absolute top-0.5`) — 2곳: 425~427(3줄), 437~439(3줄).
- **V4 X 초기화 버튼**(`<X size=12>` + `text-slate-600 hover:text-white`) — 2곳: 469~475, 512~517.
- **V5 날짜 변경 컨트롤** — 스텝퍼 330~354(25줄) + 범위 입력 447~477(31줄). 둘이 같은 state 공유.
- 합계: 필터 바(321~480) 160줄 중 직접 구현 컨트롤 줄 수 = 스텝퍼 25 + 팀 드롭다운 56(361~416) + 토글 2개 21(419~428, 431~441) + 날짜 범위 31 = **133줄**. 좌측 컬럼 검색 22(499~520) + 타입 체크 17(521~537) + 알림 범위 14(540~553) + 리스트 행 15(568~582) + 더보기 11(583~593) = **79줄**.

---

## 화면군 종합

### 화면 간/파일 간 불일치 대조표

| 항목 | newsFeedCards — 박스스코어류(Quarter/TeamBox/Streak/Trade/Injury/Suspension) | newsFeedCards — 어워드류(PowerRanking~Dunk 표) | MultiNewsFeedView | 공용 컴포넌트(`Table`/`Button`/…) | 비고 |
|---|---|---|---|---|---|
| 표 틀 | raw `<table w-full text-left border-collapse>` | 동일 | — | `Table`: bg-slate-900 border rounded-xl shadow-lg overflow-auto 래퍼 | 306~311 주석: 사용자 요청으로 카드형 제거(톤 의도 이탈) |
| thead 배경 | 없음(242, 672, 1025, 1106) 또는 팀색 인라인(336, 872) | `bg-slate-800/60`(11곳) | — | `bg-slate-950 sticky z-40 shadow-sm` | 3계열 혼재 |
| th 폰트/색 | `text-sm font-bold text-slate-500 uppercase`(BOX_HEADER_CELL) / 팀색 | `text-sm font-bold text-slate-300 whitespace-nowrap`(AWARD_RANK_TH, 좌정렬은 18곳 인라인 복붙) | — | `text-xs font-black uppercase tracking-widest text-slate-500`, `py-3 px-1.5` | 크기 sm/xs, 굵기 bold/black, 자간 모두 상이 |
| 셀 패딩 | `py-1 px-2`(본문) / `py-1.5 px-2`(헤더·합계) | `py-1.5 px-2` | — | `py-2 px-3` | 3종 |
| 숫자 서식 | `tabular-nums` 없음(312 주석: 의도적 삭제) | `tabular-nums` 있음(1324, 1222, 1237~1240, 1291, 1869 등) | 579 `tabular-nums` | `TableCell stat/attribute`: `font-mono tabular-nums` | 같은 카드군에서 표마다 상이 |
| 행 구분선 | `border-b border-slate-800/60` | 동일 | 리스트 행 `border-b border-slate-800/50` | `TableCell` `border-b border-slate-800/50` | 60 vs 50 |
| 행 hover | `hover:bg-white/5` + cursor-pointer(372, 892) | 없음 | `hover:bg-white/5`(575) | `TableRow` 동일 | 일관되나 TableRow 미사용 |
| 하이라이트 행 | `bg-amber-400/10`(372, 2454, 2740) | 동일 | — | 없음 | `TableRow highlight` prop 필요 |
| 합계 행 | `tfoot bg-slate-800/40` + `border-t border-slate-700`(405, 910) | 없음 | — | `TableFoot bg-slate-950 border-t border-slate-700` | 배경색 상이 |
| 선수 이름 셀 | `text-slate-300` 클릭 없음(376, 896) / injury·suspension `text-white hover:underline`(1038, 1122) | `text-slate-100 hover:text-indigo-400 hover:underline`(P2 9곳) | — | `TableCell player`: `text-slate-200 group-hover:text-indigo-400 underline` | 3종 |
| 팀 셀 | 약어 텍스트(699, 713) / 팀명 클릭(1045, 1129) | 약어+로고(P3 6곳) / 약어만(P4 3곳) / `TeamBadge`+이름(1225, 1294) | `TeamBadge`+이름(401) | `TeamMark` 폴백 체인 공용 | 로고 체계 2종 혼재(TeamBadge=색상 사각 배지 vs 실제 로고 SVG) — 디자인 결정 필요 |
| 클릭 가능 텍스트 | `cursor-pointer hover:text-indigo-400 hover:underline`(onOpenTeam 있을 때만) | 동일 | — | — | 플레이오프 카드는 게이팅 없이 `onOpenTeam?.()`(3106 등) — 포인터 커서 불일치 |
| 카드 wrapper | `max-w-5xl space-y-6 ko-normal relative` | 동일 | — | — | 플레이오프 5종 `max-w-3xl`, 챔피언·FMVP `space-y-8` |
| 날짜 줄 위치 | h1 아래 `text-sm text-slate-500` + 구분선 | 동일 | — | — | 챔피언·FMVP는 hero 아래 `-mt-4` |
| 섹션 제목 | h4 `text-base font-black text-white uppercase` | h3 `text-sm font-black text-slate-300 uppercase` / h3 `text-sm font-bold text-slate-400`(PlayIn) / h2 `text-base font-black text-indigo-400` | — | `PageHeader`는 페이지 제목용(해당 없음) | 4종 |
| 로딩 | Loader2 size 20 `py-8` | — | Loader2 size 22 `py-16` | Button 내부 Loader2만 | 크기·여백 상이 |
| 빈 상태 | dashed 박스 `text-xs`(528, 606, 3071) / 샷차트 `text-sm py-8`(2625) | — | `text-sm text-slate-500 py-8`(560) / `text-sm text-slate-600`(607) | 없음 | 4종 |
| 링크형 버튼 | `text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline` 10곳 | — | "오늘" 버튼 같은 톤(347) | `Button`(uppercase tracking-widest rounded-2xl) | 공용 Button에 link variant 없음 |
| 선택 상태 색 | — | 샷차트: 활성 `bg-slate-600`, 선택 `bg-indigo-500/20`, 우승 `bg-amber-400` | 알림 범위 활성 `bg-indigo-600`, 리스트 선택 `bg-slate-700` | `Dropdown active`: `bg-indigo-600/10 text-indigo-400` | 선택 표현 5종 |
| 백분율 서식 | `pct()` 0시도→`'0'` | `formatAwardPct()` 0→`'-'` | — | — | 한 파일 내 로직 불일치(UI 서식) |

### 통합 후보(효과 큰 순)

효과(제거 줄 수)는 위에서 센 gross 줄 수 기준이고, "순감"은 신규 공용 코드/호출부를 뺀 값으로 **추정**이다(카드 UI 보존 전제).

1. **레터 표 통합(`Table` plain variant + 컬럼 선언형)** — 대상: 17개 표 전체(240, 334, 670, 870, 1023, 1104, 1208, 1281, 1403, 1510, 1592, 1769, 1926, 2272, 2434, 2723, 2854). 제거 대상 th/td JSX **335줄 센 값**(th 156 + td 179) + 표 틀(overflow div·table·thead·tr·tbody·tfoot 여닫기 약 150줄, 추정) → 대체 후 컬럼 정의 약 160줄(추정, `AllTeamSection statCols` 패턴 일반화) → **순감 약 300줄(추정)**. 선행 조건: ① `Table`에 `plain`(무장식 래퍼)·컴팩트 density·th 정렬/색 프리셋 ② `TableHead` 팀색 배경 prop ③ `TableRow highlight` ④ 사용자 요청 이력(306~312: 카드 제거, tabular-nums/font-mono 삭제) 보존 규칙 확정 ⑤ BOX 계열(slate-500) vs AWARD 계열(slate-300) 헤더 색 통일 여부는 **디자인 결정 필요**. 병합 부가 효과: RosterTable↔VoteSection(P7) 약 40줄(추정) 추가 순감, Injury↔Suspension 표 통합.
2. **`LetterShell` 카드 골격** — 대상: 29개 카드(P1) + blurb 8곳(P9). 제거 gross: BrandMark 29 + wrapper 여닫기 58 + 헤더 블록 179 + blurb 56 = **322줄**. 대체 후 호출 약 29×3줄 = 87줄(추정) → **순감 약 230줄(추정)**. 선행 조건: 플레이오프 5종 `max-w-3xl`·챔피언/FMVP `space-y-8`·날짜 위치를 prop(`width`, `dateBelowHero`)으로 흡수할지 결정, h1 이름 접두 클릭(HeadlineTitle) 슬롯.
3. **`TeamCell`(TeamMark 기반)** — 대상: P3 6곳(168줄) + 146~167(22줄) = **190줄 제거**, 신규 컴포넌트 약 25줄 + 호출 6×3 = 약 43줄(추정) → **순감 약 145줄(추정)**. 선행 조건: 없음(TeamMark가 이미 폴백 체인 보유, `getRealTeamLogoUrl` import 9곳 → 1곳). 리스크 낮음.
4. **`PlayerNameCell`** — 대상: P2 9곳 = **90줄 제거** → 호출 9줄 + 컴포넌트 약 15줄 → **순감 약 65줄(추정)**. 부가: injury/suspension 이름 hover를 `hover:text-indigo-400 hover:underline`로 통일할지 결정 필요(현재 white+underline). P4 팀 약어 셀 3곳(24줄)은 TeamCell `showLogo=false`로 같이 처리.
5. **`LinkButton`(Button `link` variant)** — 대상: P8 10곳 = **95줄 제거** → 호출 10×3 = 30줄 → **순감 약 65줄(추정)**. 선행 조건: 공용 `Button`의 baseStyles(uppercase, tracking-widest, rounded-2xl, font-black)와 맞지 않아 신규 variant 필요(`feedback_button_typography` 메모와 정합).
6. **MultiNewsFeedView 필터 컨트롤 공용화**(`Dropdown` 재사용 + `Checkbox` + `ToggleSwitch` + `SearchInput` + `SegmentedControl`) — 대상: 361~416(56), 184~194(11, 위치 계산 state), 419~441(21), 499~520(22), 521~537(17), 540~553(14), 583~593(11) = **152줄 제거**(gross) → 호출·신규 컴포넌트 흡수 후 **순감 약 70줄(추정)**. 효과는 중간이나 `LeaderboardToolbar.tsx`와의 중복(주석 358~360, 418, 430, 496~498이 복붙 원본이라고 직접 기록, 이번 범위 밖이라 **추정**)까지 제거하면 파급이 커진다. 선행 조건: 36px 필터 pill 토큰 통일(스텝퍼 30px 포함), `Dropdown` z-index(9999 vs 100/101)·애니메이션 차이 확인.
7. **`Spinner`/`EmptyState`/`EmptyNote`** — 대상: 스피너 505~507, 587~589, 3046~3048, View 556~558(12줄) + dashed 안내 528~530, 606~608, 3071~3073(9줄) + View 560~562, 607(4줄) = **25줄 제거** → **순감 약 12줄(추정)**. 줄 수 효과는 작지만 크기·여백·색 불일치(대조표) 해소.
8. **`SegmentedControl`/`ListRow`(선택 상태 통일)** — 대상: 2585~2598(14줄), 2599~2621(23줄), View 540~553(14줄), 568~582(15줄) = 66줄 → 순감 약 25줄(추정). 선택 색 5종 통일이 목적.
9. **`HeroPanel`** — 대상: 1344~1364, 3312~3324, 3345~3370(60줄) → 순감 약 20줄(추정).
10. **`TeamBadge team={LeagueTeamRow}` 래퍼** — 대상: P13 6곳 22줄 → 순감 약 15줄(추정).
11. **좌정렬 th 상수화 / `perGame`·`shootPct` 헬퍼 추출** — 대상: 18곳 인라인 th + 헬퍼 3곳 복붙. 통합 후보 1에 포함되면 별도 작업 불필요.

중복 주의: 후보 1은 P2·P3·P4·P5·P6·P7의 셀 JSX를 포함하므로 3·4와 줄 수가 겹친다. 1+2+3+4+5의 단순 합(약 805줄)은 중복을 제거하지 않은 값이며, 겹침을 빼면 **실제 합계는 약 600~650줄 수준(추정)**. 이는 두 파일 합계 4096줄의 약 15%.

### 체크리스트 대조 결과

| 파일 | 체크리스트 매치 수 | 표에 반영 수 | 오탐 수 | 추가 발견 수 |
|---|---|---|---|---|
| newsFeedCards.tsx | 500 | 500 (미반영 0) | 23 | 표 `[추가]` 17행 + 반복 패턴 절에서만 센 항목(아래) |
| MultiNewsFeedView.tsx | 46 | 46 (미반영 0) | 6 | 표 `[추가]` 6행 |

- 검증 방법: 문서 표의 "라인" 열에서 단일 라인/범위를 추출해 체크리스트 라인 번호 전부가 어느 행에 포함되는지 스크립트로 대조(미반영 0건). 범위로 묶은 행은 비고/구현 요약에 세부 라인을 병기했다.
- newsFeedCards 오탐 23건: 주석 21건(307 sticky; 310 table_raw·empty_state; 311; 312 tabular; 409; 542; 604; 742; 1723; 1724; 1756; 1892; 1893; 1918; 2075; 2376; 2527; 2793; 2925; 3387) + 금액이 아닌 `toLocaleString`(득표수) 2건(1869, 2018, `money_locale` 분류 오탐). 참고: `money_short` 902/916은 공용 `formatMoney` 호출이라 대체 대상이 없다(오탐으로 세지 않고 "공용 util 사용 중"으로 분류). 2558(SVG text `tabular-nums`), 2626(진짜 빈 상태 안내)은 진짜 매치.
- MultiNewsFeedView 오탐 6건: 106, 268, 285, 287, 486, 567(전부 주석 속 "없음").
- 체크리스트 토큰이 못 잡은 항목(newsFeedCards, 라인 단위로 새로 센 것): 카드 골격 29종(BrandMark 29곳 + 날짜 `<p>` 29곳 + wrapper 29곳), 섹션 제목 h3 12·h4 6·h2 4(=22), `EventLetterLogo` 9, blurb 블록 8, dashed 빈 상태 3, `TeamBadge` 6(prop 스프레드), hero 박스 3, 클릭 텍스트 클래스 42줄, 좌정렬 th 인라인 복붙 18, `AWARD_RANK_TH` 상수(1323), `BOX_*` 상수(301~303), 선수 이름 셀 10줄 블록 9곳, 로고 포함 팀 셀 28줄 블록 6곳. 체크리스트는 `<th`/`<td` 토큰 위주라 위 컴포넌트 단위 중복이나 `border-dashed`, `h3` 계열은 누락했다. MultiNewsFeedView의 체크박스 박스 3곳(386~388, 398~400, 530~532), 토글 트랙 2곳(425~427, 437~439), 36px 필터 pill 5곳, X 초기화 버튼 2곳도 토큰에 없었다.
- 한계: "추정"이라 표기한 순감 줄 수는 신규 공용 컴포넌트의 실제 분량을 구현해 보지 않은 값이다. `LeaderboardToolbar.tsx` 등 타 파일 복붙 원본은 이번 범위 밖이라 주석 기록만 인용했다.
