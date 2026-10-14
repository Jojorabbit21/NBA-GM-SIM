# 멀티 세션 UI 공용화 계획 — 전수 감사 종합 (2026-10-12)

멀티플레이어 일반 사용자 화면 19개 라우트와 공통 크롬을 대상으로, ① 스크립트 기계 추출(`ui-audit/00-inventory.md`, `ui-audit/ui_inventory.py`) ② 에이전트 10개의 파일 전체 정독(`ui-audit/01~10-*.md`)을 거쳐 작성한 종합 문서. 각 화면군의 라인 단위 근거는 해당 번호 문서를 보면 된다.

## 0. 조사 범위와 신뢰도

| 항목 | 값 |
|---|---|
| 기계 추출 대상 | 106개 파일 · 40,530줄 · className/패턴 매치 2,995건 |
| 정독 대상(일반 사용자 화면) | 68개 파일 · 약 33,000줄 · 매치 2,587건 (나머지 408건은 어드민/싱글 전용 17개 파일 — 제외) |
| 정독 결과 반영 | 2,587건 전부 표에 반영(누락 0, 각 문서가 스크립트로 대조) · 오탐 258건(주석 속 단어, 로직 계산 등) · 체크리스트에 없던 추가 발견 347건 |
| 수치 신뢰도 | "현재 줄 수"는 센 값. "순감(제거 후 남는 줄)"은 공용 컴포넌트를 실제로 구현해 보지 않은 **추정**. 렌더 결과(행 높이, 색 차이)는 미확인 |

제외한 17개 파일: CreateLeagueModal, PersonalDraftFormatEditor, DraftPoolSettings, DraftSalaryScaleSettings, AdminTradePanel(어드민) / RotationMatrix, CoachStaffTable, OpponentScoutPanel, HeaderNavMenu, GlobalSearch, DashboardHeader, DateSkipDropdown, ActionButton, RotationManager, TacticsHistory, TacticsBoard, DepthChartEditor(싱글 전용 또는 미사용).

## 1. 공용 컴포넌트 채택 현황

| 공용 컴포넌트 | 사용처(리포 전체 import) | 상태 |
|---|---|---|
| OvrBadge 50 · Table 36 · TeamLogo 36 · TabBar 11 · Modal 10 · Dropdown 8 · TeamMark 6 | 정착 | 단, Table은 셀마다 구분선 클래스를 직접 덧씌우고, TeamLogo는 real 로고 미지원이라 복붙 폴백이 병존 |
| **Button 1 · Card 0 · Badge 0 · PageHeader 0** | 사실상 미사용 | 고정 스타일(`rounded-2xl uppercase tracking-widest`, `rounded-3xl`, `text-4xl`)이 실제 화면 톤과 안 맞아 모든 화면이 인라인으로 재작성 (10번 문서 A-1~A-4) |
| Spinner · EmptyState · SegmentedControl · IconButton · Money · Tooltip · TextInput/Select/Checkbox/Toggle · ConfirmDialog · CountBadge · SectionHeader | **없음** | 필요한데 공용이 없어 화면마다 직접 구현. `Loader2 animate-spin` 직접 사용 리포 143곳 |

## 2. 전 화면 공통 불일치 (확정 수치)

| 패턴 | 규모 | 비고 |
|---|---|---|
| 팀 로고 `img + onError` 3단 폴백(real → old → placehold) 복붙 | **18개 파일**, 같은 파일 내 중복 포함 20곳+ | `TeamMark.tsx`가 이미 같은 체인을 갖고 있는데 아무도 안 씀. `TeamLogo`는 구 로고 1단 폴백만 |
| 열 세로 구분선 토큰 | 8종 (`slate-800` 125 · `/30` 72 · `/50` 18 · `-r-slate-800/30` 11 · `slate-700` 9 · `/40` 3 · 기타 3) | 관행: 헤더 `slate-800`, 바디 `/30`. 이탈: TeamPayrollTable(헤더도 /30), PlayerDetailView(/40, slate-700), Coach/GM 카드(바디도 진함) |
| 행 hover | `white/5`(공용) · `white/[0.03]`(FrontOffice, TradeBlock, DepthRotationBoard, Gantt) · `slate-800`(검색, Dropdown) · `slate-900/40`(DepthChartEditor) · `slate-800/40`(DraftPoolModal) · `slate-600`(사이드바 메뉴) | 6종 |
| 테이블 헤더 글자 | 공용 기본 `text-xs font-black uppercase tracking-widest` vs 로스터·순위·리더보드 `text-sm …widest` vs 일정·Payroll·ScheduleCalendar `text-sm`(tracking 없음) vs 홈 `text-sm font-bold slate-600`(uppercase 없음) vs 피드 `text-sm font-bold slate-500 uppercase` vs 인사이트 `text-sm font-normal slate-300 tracking-wider` vs Coach/GM `text-xs` | 7종 이상 |
| 로딩 스피너 | 43개 파일, 크기 11/12/13/16/20/22/24/28/32 | 전용 컴포넌트 없음 |
| 빈 상태 | 점선 박스 / 문장 / 아이콘형 / h-40 등 6종+, 같은 문구("아직 완료된 경기가 없습니다")가 패딩만 다르게 3곳 | |
| 직접 `<table>` | 16개 파일, th 299 · td 357 | newsFeedCards 17개 표(th 156/td 179), PlayerDetailView 5개(213줄, 공용 Table 0회), PBP 박스스코어, 홈 3개, Coach/GM |
| 공용 Modal 대신 `fixed inset-0` 오버레이 | 9개 파일 | 메뉴/오버레이 z-index 100 / 200(실효 100) / 300 / 500 / 600 / 9999×3 / 50 — 토큰 없음. **역전**: Dropdown·TeamSelectModal·부상 툴팁(9999) > 토스트(600) > Modal(500) > HoverCard(200) |
| 돈 표기 | `formatMoney` 54곳 · `formatMoneyFull` 26곳 · `toLocaleString` 4곳 · **지역 `formatMoney` 재정의 2파일**(Negotiation L91 = Release L53, 글자 단위 동일) | 같은 선수 연봉이 `$51.4M`/`$51,400,000`/`$234K`/`$234,097`로 화면마다 다름. `tabular-nums` 적용은 FrontOffice 8/14, PlayerDetail 0/7, Payroll 0/5 |
| 소형 배지(`text-[8|9|10px] font-bold`) 인라인 | 62건 | TW 계약 배지 동일 문자열 5곳, 읽지 않음 카운트 배지 4곳 |
| `OvrBadge` `!w-* !h-* !shadow-none` 강제 | 리포 44줄 | `size="sm"`이 이미 24px이고 `!shadow-none`은 inline boxShadow에 무효(no-op) — 20px(xs)·28px(table) 크기가 없어서 생긴 우회 |
| `window.confirm` 직접 사용 | FrontOffice, DepthRotationBoard, Gantt×2 등 | ConfirmDialog 없음 |
| 바깥 클릭 닫기 로직 복제 | Sidebar / NavMenu / Search / Dropdown 4곳, Esc는 검색만 | |

## 3. 화면군별 핵심 발견 (상세는 각 문서)

| # | 화면군 | 가장 큰 중복/문제 | 문서 |
|---|---|---|---|
| 01 | 뉴스피드 (4,096줄) | 카드 29종 골격 반복 322줄, 표 17개 raw(th/td 335줄), 로고 폴백 7곳 190줄, 선수명 셀 9곳, 링크 버튼 10곳. 순감 약 600~650줄(추정) | 01-newsfeed.md |
| 02 | 경기 PBP·스트립 | 박스스코어가 Table 클래스를 "이식"해 직접 구현(헤더 높이·z-index·숫자색·tfoot만 다름), 로고 폴백 3곳, away/home 미러 블록 4쌍 47줄, 아이콘 버튼 8곳 | 02-game.md |
| 03 | 선수 상세 | 공용 Table 0회(표 5개 213줄 raw), **데드코드 133줄**, **미연결 파일 MultiShotChartTab 284줄**, kv 행 17곳, 체크박스 3종·코트 렌더러 3종·샷 마커 3종 | 03-player-detail.md |
| 04 | 트레이드·드래프트풀 | 선수 행 레이아웃 **8종**, 금액 축약/전체 혼용·부호색 규칙 반대 방향 공존, 상태(PENDING…) Badge 없이 텍스트·`invalidated` 문구 없음, DraftPoolModal OVR 정렬 도달 불가, CheckboxFilterDropdown이 FA와 79줄 완전 동일 | 04-trade-draftpool.md |
| 05 | FA·협상·방출·로비 | FA↔DraftPool **263줄 완전 동일**(필터·페이지네이션), Negotiation↔Release 선수 패널 113줄·캡 패널 54줄 동일, 지역 formatMoney 2벌, 스텝 버튼 12개 60줄, FA console.time 잔존 | 05-fa-contract-lobby.md |
| 06 | 홈·순위·일정·리더보드 | LeaderboardTable 헤더 78줄이 "데이터 없음" 분기에 통째 복제, 로고 폴백 3곳 44줄, 홈 활성부상 계산 4벌(80~95줄), 팀 표시가 홈=TeamBadge(색 사각) vs 순위·일정=실제 로고, TableHead 기본값과 100% 동일한 className 3곳 | 06-home-standings-schedule.md |
| 07 | 플레이오프·올스타 | 올스타 동/서·라이징 대칭 블록 62줄, 챔피언 모달 Modal 미사용(컨페티 z·테두리·백드롭 닫기 때문), 브래킷 사이드 패널은 Modal로 불가(컨테이너 앵커) → SidePanel 신규 필요, "결승/파이널" 용어 혼용·토너먼트 모드 "컨퍼런스 파이널" 오표기 | 07-playoffs-allstar.md |
| 08 | 로스터 7탭 | 선수 정보 4컬럼 세트(이름·POS·나이·OVR + sticky 헤더) 4파일 192줄, `getStickyStyle` 4벌·`handleSort` 4벌·TW 배지 5벌·OVR 래퍼 6벌 동일, **SalaryCapDashboard 143줄 미사용**, RosterGrid 범례 45줄 상수 false, **Table `style`/`tableStyle` 혼동으로 `tableLayout:'fixed'`가 4파일에서 미적용** | 08-roster.md |
| 09 | 전술 | 슬라이더 15블록·노트 15개가 split/비-split로 **2벌 복제**(122줄), AI 위임 분할 버튼 3곳 100줄, 초기화 버튼 4종, 인사이트 카드 7곳 제목 굵기 혼재, DRB↔Gantt 로직 중복 64줄, **TacticalHalfCourt 114줄 미사용**, **지역 방어 슬라이더 `updateSlider` 연속 호출로 첫 값 덮어쓰기 의심(TSP L92/L179)** | 09-tactics.md |
| 10 | 공통 크롬 + 공용 API | 공용 21개의 API 한계표(A-1~A-21), 메뉴/오버레이 9종 대조표, TeamSetupModal portal 없음 z-50, MultiHeader 불투명 배경 위 backdrop-blur 상시 적용(렉 의심), MultiComingSoonView 미사용 | 10-chrome-and-common.md |

### 감사 중 발견한 버그·의심 (UI 통합과 별개로 처리)
1. `TacticsSlidersPanel` L92/L179 — 지역 방어 슬라이더가 `updateSlider('zoneFreq')`·`updateSlider('zoneUsage')`를 연속 호출. 같은 클로저 기반이면 첫 값이 덮어써질 수 있음(상위 setState 구현 확인 필요).
2. 로스터 계열 4파일 — `<Table style={{tableLayout:'fixed'}}>`가 바깥 div에 붙어 실제 `<table>`엔 미적용. 고치면 열 폭이 바뀔 수 있어 화면 비교 필요.
3. `DraftPoolModal` — OVR 정렬 키는 있으나 헤더 클릭 핸들러 없음(도달 불가 코드).
4. `MultiFrontOfficeView` — `invalidated` 상태 상세 문구 없음(빈 표시), 날짜 포맷 4종, 부호색 규칙 반대 방향 2종 공존.
5. `TournamentBracketView` — 토너먼트 모드 준결승을 "컨퍼런스 파이널"로 표기, 패널 경기 카드가 약어 대신 슬러그 대문자.
6. `TeamSetupModal` — portal 없이 `z-50` → 헤더(100)·사이드바 메뉴(300)에 가려질 수 있음.
7. z-index 역전: 토스트(600)가 Dropdown/TeamSelectModal/부상 툴팁(9999) 뒤로.
8. `MultiFreeAgentView` — `console.time`/`console.log` 계측 잔존(L155~165, 278, 284, 303, 316).
9. `PlayerDetailView` — 렌더 중 `navigate(-1)` 호출.
10. `MultiHeader` L424 — 불투명 `bg-slate-900` 위에 `backdrop-blur-[20px]` sticky 상시 적용(시각 효과 없음, 비용만 — 2026-09-30 모달 블러 렉과 같은 계열).
11. `TacticsDataPanel` L44 — 토글 노브 색 삼항이 양쪽 다 `emerald-400`(분기 무의미).
12. 포지션 필터 로직이 `MultiDraftPoolView`(정확 일치) vs `DraftPoolModal`(`/` 분리) 불일치.

## 4. 삭제 가능 코드 (의존성 없음, 사용자 확인 후 즉시)

| 파일/범위 | 줄 | 근거 |
|---|---|---|
| `views/multi/season/MultiShotChartTab.tsx` | 284 | import 0건 (03) |
| `components/roster/SalaryCapDashboard.tsx` | 143 | import 0건 (08) |
| `components/dashboard/tactics/TacticalHalfCourt.tsx` | 114 | import 0건 (09) |
| `views/multi/season/MultiComingSoonView.tsx` | 20 | import 0건 (10) |
| `views/PlayerDetailView.tsx` 데드코드(`TRAD_COLS/ADVANCED_COLS`, `DefenseZoneTable`, `StatsSubTable`, 미사용 테마 토큰 등) | 약 133 | 참조 0 (03) |
| `components/roster/RosterGrid.tsx` 범례(`SHOW_ATTR_LEGEND=false`) | 45 | 상수로 꺼짐 (08) |
| `components/dashboard/RotationGanttChart.tsx` 주석 처리 JSX | 5 | (09) |
| (제외 범위) `RotationMatrix.tsx` 398 · `CoachStaffTable.tsx` 161 · `MultiGamePbpView.legacy.tsx` 1,148 | 1,707 | import 0건 (1차 조사) |

합계 약 **2,450줄**. → **2026-10-13 삭제 완료**(RotationGanttChart 주석 처리 JSX 5줄은 실제로 없어 제외, 나머지 전부 — 약 2,380줄). `project-overview.md`·`CLAUDE.md` 갱신. 같은 날 깨진 로고 경로(`league/Main.svg` 복원, `teams/LV·SEA.svg`)도 복구.

## 5. 공용 컴포넌트 API 보강 목록 (화면 치환의 선행 조건)

치환 작업 대부분이 아래 보강에 막혀 있다. 10번 문서 A-1~A-21이 근거.

| 컴포넌트 | 추가/변경 | 풀리는 치환 |
|---|---|---|
| **TeamLogo** | `source="real"`(real → old → placehold 3단 폴백 내장), 20/28/56px 크기, `shadow` 끄기. `TeamMark`는 흡수 또는 `variant="real"`로 의미 명확화 | 18개 파일 로고 복붙 전부 |
| **Table** | `columnDividers`(header/body 색 토큰), `density="compact"`, `bare`/`flush`(래퍼 박스 제거), `TableRow` `highlight`/`selected`/`hover={false}`, `TableHead` 팀색 배경, `TableGroupHeaderCell` ✅ 2026-10-13, `stickyLeft` 오프셋 API ✅ 2026-10-13(px 숫자 + 섹션별 불투명 배경·z-index 자동), `style`→`tableStyle` 혼동 정리, `variant="rank"` 구현, `getAttrColor` export | 구분선 8종 → 1곳 관리, raw `<table>` 16파일, getStickyStyle 4벌, 그룹 헤더 5곳 |
| **Button** | base에서 `uppercase tracking-widest rounded-2xl` 분리(`shape`, `caseStyle`), `size="xs"` 실사용 가능 높이, `iconOnly`, `variant="cta"`(주황 그라디언트, 6파일), `variant="link"`, `success/warning` | 인라인 `<button>` 261곳 중 CTA·처리·초기화·링크형 대부분 |
| **Badge** | `variant="count"`(빨간 원, 9+ 캡), `size="xs"`, `shape="square"`, uppercase 끄기 | TW 배지 5곳, 카운트 배지 4곳, 상태 배지(PENDING 등) |
| **OvrBadge** | `size="xs"`(20px), `size="table"`(28px), 박스 className | `!w-* !h-*` 44줄 제거 |
| **Modal** | `zIndexClass`, `closeOnEsc`, `closeOnBackdrop={false}`, `size="xs"`, header/footer/body className, `subtitle` | TeamSelectModal, TeamSetupModal, TournamentChampionModal, DraftPoolModal, MyTradeBlockModal 헤더 재구현 |
| **Dropdown** | `placement`(right-end 등), items `icon/divider/danger/disabled/badge`, `panelClassName`, `closeOnEsc`, 항목 크기 variant | 사이드바 메뉴, 헤더 NavMenu 패널, 뉴스 팀 드롭다운, PlayerDetail 브레드크럼 2개, 캘린더 팝오버 |
| **TabBar** | `variant="underline|filled|pill"`, `height`, uppercase 끄기 | 헤더 NavMenu 탭, 세그먼트 탭 5곳 |
| **z-index 토큰** | ~~`header 100 < dropdown 200 < sidebar-menu 300 < modal 500 < toast 600 < tooltip 700`~~ → **적용 완료**: `header 100 < modal 500 < popover 600 < tooltip 700 < toast 800 < takeover 1000`(tailwind `zIndex` 토큰) | 9999 3곳·50 1곳 정리, 역전 해소 |
| **신규** | `Spinner`(size/fullScreen) · `EmptyState`(문장/아이콘/점선 3변형) · `SegmentedControl` · `IconButton` · `LiveDot` · `Money`(short/full/accounting, 부호색, tabular 고정) · `Tooltip`(portal) · `TextInput/Select/Checkbox/Toggle` · `ConfirmDialog` · `SectionHeader` · `PlayerNameCell`(OVR+이름+부상+HoverCard+이동) · `Pagination`+`CheckboxFilterDropdown`+`StatFilterBar` · `KeyValueRow` · `SplitButton` · `SidePanel` · `CountBadge` | 아래 6장 치환 전부 |

## 6. 치환 우선순위 (순감 추정, 큰 순)

"순감"은 각 문서가 센 현재 줄 수에서 호출부·신규 공용 코드를 뺀 추정치. 화면군 간 겹치는 항목(FA↔DraftPool 필터, 로고 폴백)은 한 번만 셌다.

| 순위 | 작업 | 대상 | 순감(추정) | 선행 |
|---|---|---|---|---|
| 1 | 데드코드 삭제 (4장) | 7개 파일/범위 | **~744** (+제외 범위 1,707) | 사용자 확인만 |
| 2 | 뉴스피드: `LetterShell` 골격 + 표 17개 Table 이관 + `TeamCell`/`PlayerNameCell`/`LinkButton` **✅ 2026-10-13 완료**(3,351 → 2,812줄 = −539, `newsFeedLetter.tsx` +161; Table `variant="bare"`·`density="compact"` 신설) | newsFeedCards | **~600~650** | Table plain/density/팀색 헤더, Button link |
| 3 | FA↔DraftPool 필터·페이지네이션 공용화 **✅ 2026-10-12 완료**(리더보드·뉴스까지 5화면, `components/common/filters/*`+`Pagination`) + Negotiation↔Release 선수 패널·캡 패널·스텝퍼 **✅ 2026-10-13 완료**(`views/multi/season/contractScreenParts.tsx` 313줄 신설, 협상 1,565→1,278 · 방출 744→559 = −472; `components/common/KeyValueRow.tsx` 신설, 로비 InfoRow도 교체) | 4파일 | **~480** | 전부 완료 |
| 4 | 로스터: `PlayerInfoColumns` + Table sticky 오프셋 + `useTableSort` + TW→Badge + 그룹 헤더 + Payroll 행 중복 **✅ 2026-10-13 완료**(Overview 236→153 · RosterGrid 371→256 · StatsStack 324→259 · Payroll 455→410 · GameLog 397→390 = −415, 신규 `components/roster/PlayerInfoColumns.tsx` 130 + `hooks/useTableSort.ts` 52; Table `stickyLeft={px}`/`variant="flush"`/`TableGroupHeaderCell`, OvrBadge `table`, Badge `xs`/`square`) | 5파일 | **~355** | 전부 완료 |
| 5 | 선수 상세: raw 표 5개 → Table, kv 행, 드롭다운 2개 → Dropdown, 필터 옵션, 샷 마커/코트 **✅ 2026-10-13 완료**(PlayerDetailView 2,485 → 2,279 = −206, 신규 `components/common/filters/CheckOption.tsx` 46; 표 4개 Table bare 이관·헤더 요약표 1개는 레이아웃용이라 raw 유지, kv 17블록 → `KeyValueRow`+로컬 `ProfileSection`, 드롭다운 2개 → `Dropdown`, 필터 7블록 → `CheckOption`, select 2개 → `SegmentedControl`, OvrBadge `header`. 샷 마커/코트는 MultiShotChartTab 삭제로 3중 중복이 2종(하프/풀코트, 좌표계 상이)만 남아 **보류**) | PlayerDetailView 외 | **~390** | 완료(마커/코트 제외) |
| 6 | 전술: 슬라이더 2벌 → 설정 배열, `SplitButton`, `InsightCard`, 인사이트 div 표 3개 → Table, DRB↔Gantt 로직 모듈화 **✅ 2026-10-13 완료**(TacticsSlidersPanel 209→112 + `tacticsSliderConfig.ts` 72; DepthRotationBoard 724→614 · RotationGanttChart 686→597 + `utils/rotationAllocation.ts` 99; 인사이트 5파일 → `InsightCard`+`PlayerNameLink`+Table bare, 표 3개 이관; 신규 `components/common/SplitButton.tsx`·`PlayerNameLink.tsx`. SplitStatsTable(grid, content-fit)·간트 표 본체는 보드 전용이라 유지) | 7파일 | **~325** | 완료 |
| 7 | 홈·순위·일정·리더보드: Leaderboard 헤더 중복, 활성부상 훅, 로고, `MultiSelectDropdown`, 홈 표 → Table **✅ 2026-10-13 완료**(MultiSeasonPage 1,203→1,065 + `useActiveInjuryMap.ts` 57 — 표 3개·div 리스트 4개 → Table bare compact, 부상 맵 4벌 → 훅; LeaderboardTable 437→308 — 헤더 6벌 → `headerCell/renderHead`, 고정 열 `stickyLeft` 숫자 API; Standings 849→801 — 그룹 서브헤더 → TableHeaderCell, `CutLineRow`, `trendColor`, useTableSort; Schedule 839→825 — `TeamNameCell`/`MvpEntry`; `fmtWinPct` 공용화. 로고·MultiSelectDropdown·SegmentedControl은 앞 단계에서 이미 완료) | 6파일 | **~280** | 완료 |
| 8 | 트레이드: 카트/제안서 자산 열, PlayerChip → Table, 상태 Badge화, Money **✅ 2026-10-13 완료**(MultiFrontOfficeView 2,117→2,051: `TeamAssetList`+`TeamColorHeader`로 제안서 자산 2열·카트 2블록 통합, `PlayerChip`/`PlayerListHeader` → Table flush compact + useTableSort, `OFFER_STATUS` 맵(목록 Badge xs + 제안서 결과 문장, invalidated 포함), `AccordionHeader`, 남은 formatMoney 12곳 → `Money`, 이름 링크 → `PlayerNameLink`(player 선택·fallbackName·tone strong 확장), 팀 링크 → `ClickableText`) | FrontOffice 외 | **~135** (+3번과 겹치는 233 제외) | 완료 |
| 9 | 로고 폴백 18파일 → TeamLogo | 전 화면 | **~300** (2·7번 등에 분산 포함) | TeamLogo `source="real"` — **가장 먼저 할 것** |
| 10 | 경기: 미러 블록 헬퍼, 로고, IconButton, SectionBar, 쿼터 필터 → SegmentedControl **✅ 2026-10-13 완료**(MultiGamePbpView 2,759→2,718: 원정/홈 미러 4종 → `FinalTeamBlock`·`SubChangeBlock`·`renderBoxPanel(side)`·쿼터표 행 map, 결과 섹션 6개 → `ResultSection`. 로고·IconButton·SegmentedControl은 앞 단계에서 이미 완료) | PBP·스트립 | **~130** | 완료 |
| 11 | 플레이오프·올스타: 대칭 블록, 챔피언 모달 → Modal, 섹션 제목, EmptyState, SidePanel **✅ 2026-10-13 완료**(MultiAllStarView 533→522: 동/서부·라이징 A/B 미러 → `ConferencePanel`/`RisingTeamPanel`, 아이콘 h2 8회 → `AllStarTitle`, h3 9회 → `SubTitle`, 빈 상태 4곳 → EmptyState; TournamentChampionModal → 공용 `Modal`(`closeOnBackdrop` prop 신설) + Table bare compact 열 배열. **SidePanel은 제외** — 브라켓 사이드패널은 다른 세션이 같은 날 `SeriesWindow` 플로팅 창으로 교체해 대상이 사라짐) | 4파일 | **~120** | 완료(SidePanel 제외) |
| 12 | ✅ 크롬: 모달 2개 → Modal, 사이드바 메뉴 → Dropdown, CountBadge, 카운트다운 포맷 중복 (2026-10-13 완료 — `CountBadge` 신설, Dropdown `side`/`dividerBefore` 보강) | 5파일 | **~115** | Modal/Dropdown 보강 |

합계 약 **3,500~3,700줄**(40,530줄의 약 9%, 추정). 줄 수보다 큰 효과는 구분선·헤더·hover·돈 표기·z-index가 **한 곳에서 결정**되는 것.

## 7. 먼저 정해야 할 디자인 결정 (코드 전에)

1. ~~**팀 표시 기준**~~ → **2026-10-12 결정·적용 완료**: 로고/배지는 `TeamMark variant="logo"|"badge"`로 명시 선택. 로고 소스는 `public/logos/teams/`(팀)·`public/logos/league/`(리그/올스타) 단일, `getRealTeamLogoUrl`·`/logos/real`·placehold 폴백 전부 삭제, 인라인 `<img onError>` 18파일 → `<TeamLogo>` 치환 완료(dev-log 2026-10-12 참조). 5장 TeamLogo 항목과 6장 9번 항목은 완료 처리.
2. **테이블 헤더 타이포 표준**: 공용 기본(`text-xs`)과 실제 다수(`text-sm font-black uppercase tracking-widest`) 중 하나. 한글 헤더에 `uppercase tracking-widest`를 유지할지(버튼은 제거 방침이 이미 있음).
3. ~~**구분선 토큰**~~ → **2026-10-12 결정·적용 완료**: 테이블의 모든 선(세로·가로·헤더 하단·푸터 상단·외곽) `slate-800` 단일·불투명(600 → 700 → 800 순으로 같은 날 조정, 최종 800). 세로선은 Table `dividers` 컨텍스트가 모든 셀(sticky 포함)에 자동 적용. 스코프 36파일 379토큰 치환 + Table.tsx 기본값(dev-log 참조). `columnDividers` prop 승격은 Table 이관 때.
2′. ~~**테이블 헤더 타이포**~~ → **2026-10-12 결정·적용 완료**: `docs/plan/ui-typography.md`(T1 `text-sm font-bold slate-400`, 바디 B1~B5, `uppercase`/`tracking-*`/`font-mono` 제거).
4. ~~**돈 표기 정책**~~ → **2026-10-12 결정·적용 완료**: 기본 표기 축약(`$51.4M`), 표의 금액 열은 우측 정렬 + `tabular-nums`, 증감은 부호 포함 + "내 팀에 좋은 방향 = emerald / 나쁜 방향 = red"(`components/common/Money.tsx`의 `signed`/`goodWhenPositive`), 협상·방출의 지역 `formatMoney` 폐기, 회계식(`MoneyCell`) 제거. 예외(전체 표기 `format="full"`/`formatMoneyFull`): 로스터 탭 급여·AAV 열, 재정 탭, 협상·방출·FA 화면(정확한 숫자 필요). dev-log 참조.
5. **Button base** → **전용 조사 완료(2026-10-12)**: `docs/plan/ui-buttons.md` — 멀티 스코프 `<button>` 268개를 역할별로 분류(icon-only 76 · primary 38 · secondary 36 · link 30 · menu 18 · segment 15 · …). 제안: `Button`(variant 9 · size 5단 h24~40 · shape, 기본 `rounded-lg text-sm font-bold`) + `IconButton`(label 필수) + `SegmentedControl` + `FilterTrigger`/`Pagination`. 남은 결정 2개: 세그먼트 활성색(slate-600 vs indigo-600), 링크형 underline 기본값.
6. ~~**z-index 사다리**~~ → **2026-10-12 결정·적용 완료(A안)**: `tailwind.config.js` `zIndex` 토큰 `header 100 < modal 500 < popover 600 < tooltip 700 < toast 800 < takeover 1000`(리터럴 클래스 `z-header`…). 팝오버·툴팁은 모달 안에서도 떠야 하므로 모달 위, 토스트는 그 위, 전체 화면 점유가 전부 덮음. 표 sticky/고정 열/카드 내부 `z-10~50`은 로컬 값으로 비대상. 임의 숫자(`z-[9999]`·`z-[100]`류) 29파일 치환, TeamSetup/DraftPool/Nickname/TournamentChampion 모달 body 포탈. 새 오버레이는 반드시 이 6개 토큰 중 하나를 쓰고 `z-[N]` 금지. 상세는 dev-log 2026-10-12 "0-6 z-index 사다리".
7. ~~**에러 표시 정책**~~ → **2026-10-13 경계 확정 + 컴포넌트 신설 + 전 화면 치환 완료**(멀티 스코프 `notify.error` 9곳 → 0, 영어 원문 매핑, 드래프트 룸 WS 보강, PBP 5상태; 2차 과제는 `ui-inline-notice.md` 9장): 기준은 중요도가 아니라 "붙을 자리(anchor)가 있는가". 토스트는 리그 이벤트·붙을 자리 없는 백그라운드 실패만, 버튼 액션 실패·폼 검증·사전 차단·미저장·저장 확인은 전부 `InlineNotice`(md 틴트 박스/sm 글자, 아이콘·라운드 없음), 표 행·칩·탭의 항목별 상태는 `StatusDot`(아이콘+툴팁). 2026-10-02 "오류는 전부 토스트" 방침을 **번복**. 전 화면 배치안·선행 한국어 매핑·발견 버그 17건은 `docs/plan/ui-inline-notice.md`.
8. ~~**빈 상태 변형·스피너**~~ → **2026-10-13 결정·적용 완료**(시안 https://claude.ai/artifact/6tXapHKyDNixCzS1mNEPmb): `components/common/Spinner.tsx` 자리 3종(page 28px `h-full flex-1` / section 20px `py-10` / inline 14px+라벨, 색 indigo-400 고정, 버튼 안은 `Button isLoading`), `components/common/EmptyState.tsx`(text/subtitle/icon 32px slate-700/action, 글자 14px slate-500·보조 12px slate-600, 패딩 md 40·sm 28) + `TableEmptyRow`. 멀티 스코프 `<Loader2>` 71 → 2(아이콘 전용 버튼), `min-h-screen` 로딩 전부 제거, 빈 상태 30곳 치환. 점선 박스(드롭 UI)·행 플레이스홀더("비어있음")는 범위 밖. 인벤토리 `ui-audit/spinner-empty-inventory.md`.

## 8. 권장 진행 순서

1. **4장 삭제** (확인 후 1커밋, 위험 0)
2. **7장 결정 1~6** (결정 없이는 2단계가 역작업이 됨)
3. **TeamLogo `source="real"`** → 18개 파일 로고 치환 (1 PR, 시각 변화 없음)
4. **Table 보강**(columnDividers/density/bare/stickyLeft/`style` 정정) → 로스터 5파일부터 치환, 그 다음 피드·선수 상세·PBP
5. **Button/Badge/OvrBadge/Modal/Dropdown 보강** + 신규 소형 컴포넌트(Spinner/EmptyState/SegmentedControl/Money/IconButton)
6. 화면군별 치환(6장 순위 2→3→4→5→6→7→8→10→11→12), 화면군마다 1280 폭 실제 스크린샷 비교
7. 3장의 버그 12건은 별도 트랙으로 즉시 처리 가능(특히 1·2·6·7번)

## 부록: 문서 목록
- `ui-audit/00-inventory.md` — 기계 추출 요약(역할별 건수, 토큰 변형표, 파일별 공용 import 매트릭스)
- `ui-audit/ui_inventory.py` — 재실행 스크립트 (`python3 ui_inventory.py <repo> <out>`)
- `ui-audit/01-newsfeed.md` ~ `10-chrome-and-common.md` — 화면군별 라인 단위 표, 불일치 대조표, 통합 후보, 체크리스트 대조
