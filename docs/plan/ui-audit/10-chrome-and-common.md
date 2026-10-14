# 10 공통 크롬 + 공용 컴포넌트 API 한계 — 전수 감사

감사일 2026-10-12 / 코드 수정 없음(이 문서만 작성) / "추정"은 코드로 확인하지 못한 판단.

읽은 범위(전부 Read, grep 대체 없음):
- components/MultiHeader.tsx: 1~579줄 (전부, 400줄 분할 2회)
- components/MultiSidebar.tsx: 1~333줄 (전부)
- components/dashboard/MultiHeaderNavMenu.tsx: 1~277줄 (전부)
- components/dashboard/MultiGlobalSearch.tsx: 1~248줄 (전부)
- components/multi/LeagueLoadingScreen.tsx: 1~28줄 (전부)
- components/multi/LeagueBootstrapErrorScreen.tsx: 1~53줄 (전부)
- views/multi/season/MultiComingSoonView.tsx: 1~20줄 (전부)
- components/multi/TeamSelectModal.tsx: 1~178줄 (전부)
- components/multi/TeamSetupModal.tsx: 1~188줄 (전부)
- components/multi/ColorField.tsx: 1~42줄 (전부)
- components/multi/CourtPreview.tsx: 1~97줄 (전부)
- components/common/ 21개 전부: Table 1~229, TabBar 1~55, Button 1~69, Badge 1~41, Card 1~45, Modal 1~136, Dropdown 1~147(DropdownButton 포함), PageHeader 1~42, Skeleton 1~9, TeamLogo 1~46, TeamBadge 1~50, TeamMark 1~43, OvrBadge 1~146, StarRating 1~88, InjuryStatusBadge 1~94, PlayerHoverCard 1~344, PlayerAwardBadges 1~179, SliderControl 1~164, SliderGroupNotes 1~67, NotificationCenter 1~112, DirectionBadge 1~26
- 기계 체크리스트: scratchpad/ui-audit/by_file/ 의 크롬 11개 + common 21개 .md 전부 대조(합계 213행)

보조 확인(grep, 사용처 집계용): 아래 "사용처" 숫자는 `from '...common/X'` 형태 import 파일 수이며 별칭 import는 놓칠 수 있음(추정 오차 있음).

---

## A. 공용 컴포넌트 API 한계표

다른 화면군 감사에서 "공용 컴포넌트로 대체 불가"라고 적을 때 이 표의 행 번호(A-1…)를 근거로 인용한다.

| # | 컴포넌트(사용처) | 제공 prop/variant | 고정돼 있어 재사용을 막는 것 | 화면들이 우회한 방식(예) | 추가하면 좋을 prop |
|---|---|---|---|---|---|
| A-1 | Button (HelpView 1곳) | variant primary/secondary/danger/ghost/outline/brand, size xs~xl, isLoading, loadingText, icon, fullWidth | baseStyles에 `rounded-2xl`, `font-black uppercase tracking-widest`, `active:scale-95` 하드코딩(L27). size xs도 px-3 py-1.5(높이 약 28px)라 헤더/모달 푸터의 `rounded-lg/xl text-sm font-bold` 버튼과 모양이 다름. 한국어에 uppercase/tracking-widest는 어색하다는 기존 피드백과도 충돌(메모리: 버튼 타이포 규칙). 아이콘 전용(정사각) 버튼 없음. 로딩 스피너 w-3/w-4 고정. | 대부분 화면이 `<button className="px-5 py-2.5 rounded-xl text-sm font-bold ...">` 직접 작성(예: TeamSelectModal L153-168, TeamSetupModal L170-182, 오류화면 L42-48) | `shape`(rounded-lg/xl/2xl/full), `caseStyle`(uppercase 끄기)/`tracking`, `iconOnly`, `variant="cta"`(주황 그라디언트, MultiHeader L490/L570) |
| A-2 | Card (import 0곳) | variant default/glass/outline/flat, padding none~lg, onClick | `rounded-3xl overflow-hidden`(L19) 고정, default에 `shadow-xl`. 호버/클릭 스타일은 onClick 있을 때만. `overflow-hidden`이라 내부 absolute 드롭다운/툴팁이 잘림. | 사실상 아무도 안 씀(추정: 위 고정 때문). 모달 내부 카드는 `rounded-2xl border border-slate-800 bg-slate-900/60` 직접 작성(TeamSelectModal L124) | `rounded`(Modal과 동일 패턴), `overflow` 옵션, `as`/`selected` 상태 |
| A-3 | Badge (import 0곳) / DirectionBadge(2곳) | Badge: variant 6종, size sm/md, icon. DirectionBadge: direction 5종, size sm/md | `font-black uppercase tracking-wider rounded-full border` 고정(Badge L19, DirectionBadge L22: 같은 클래스 문자열 복제). 숫자 카운트 배지(빨간 원) variant 없음. 색 variant에 slate/red 솔리드 없음. | 읽지 않음 카운트 배지를 4곳이 각자 `rounded-full bg-red-500 text-white text-[8px]` 로 작성(Sidebar L35, NavMenu L183/L264, TabBar L44). Table의 `variant="badge"`(L215)도 자체 구현 | `variant="count"`(솔리드 red, 9+ 캡 내장), `shape`, `uppercase` 끄기, DirectionBadge를 Badge 위에 얹기 |
| A-4 | PageHeader (import 0곳) | title, description, icon, actions | `text-4xl lg:text-5xl font-black uppercase`(L23), `z-[70] relative`(L14), `md:flex-row items-center`. 현재 멀티 화면의 헤더 규격(탭바 h-14 등)과 규모가 다름 | 아무도 안 씀(추정). 화면마다 자체 제목 마크업 | `size`(제목 크기), `uppercase` 끄기, z-index 제거 |
| A-5 | Modal (10곳) | isOpen, onClose, title, footer, size sm/md/lg/xl/full, headerColor, className, hideCloseButton, blurBackdrop, rounded, backdropClass | `z-[500]` 고정(L81) — 더 높은 z가 필요한 곳(홈 TeamSelect=9999)이 직접 작성. 헤더 `px-8 py-6 text-xl`(L98-99), 푸터 `px-8 py-5`(L128), 본문 `p-0`(L122) 고정. 닫기 X는 24px 고정. Esc 키 닫기 없음(backdrop mousedown만, L56-66), role="dialog"/aria-modal 없음. size sm=`max-w-md`(448px)라 `max-w-sm`(384px) 모달 재현 불가. 제목 한 줄 슬롯만 있고 부제 슬롯 없음. 포탈이라 스태킹 문제는 없음. | TeamSelectModal(L92-173), TeamSetupModal(L102-186)이 오버레이+패널+헤더+푸터를 통째로 재작성 | `zIndexClass`, `headerClassName`/`footerClassName`/`bodyClassName`, `subtitle`, `closeOnEsc`, `size="xs"`(max-w-sm) , `closeIconSize` |
| A-6 | Dropdown (8곳) + DropdownButton | trigger, items(id/label/onClick/active), children, align left/right, width, 제어형 isOpen | 패널 위치는 트리거 아래(`top = rect.bottom+8`, L46)만 — 사이드바처럼 "트리거 오른쪽·아래 정렬(bottom 기준)" 불가. `z-[9999]`(L94), `rounded-xl`, `border-slate-800`, 항목 `text-xs font-bold px-3 py-2.5` 고정. items에 아이콘/구분선/위험(danger)/비활성/배지 필드 없음(label이 ReactNode라 아이콘은 억지로 가능). 열림 상태에서 스크롤·리사이즈 시 위치 재계산 없음(fixed 좌표 1회 계산, 추정). 키보드 내비게이션·Esc 없음. 트리거 래퍼가 `<div onClick>`이라 button 시맨틱·aria-expanded 없음 | MultiSidebar 프로필 메뉴(L273-327)는 createPortal+getBoundingClientRect+mousedown 바깥클릭을 직접 구현, MultiHeaderNavMenu의 DropdownPanel(L160-192)은 absolute 패널 직접 구현 | `placement`(bottom-start/right-end 등), items에 `icon`/`divider`/`danger`/`badge`/`disabled`, `panelClassName`/`zIndexClass`, `closeOnEsc`, 항목 크기 variant(compact/regular) |
| A-7 | TabBar (11곳) | tabs(id/label/badge), activeTab, onTabChange, rightSlot, theme{bg,text,accent}, bgClassName | `px-8 h-14 gap-8`, `font-black tracking-tight uppercase text-sm`(L28) 고정, 활성은 `border-b-2` 밑줄 방식만(알약/세그먼트/배경 하이라이트 불가). 배지는 `-top-2 -right-3 w-3.5 h-3.5 text-[8px]` 고정(L44). 헤더 NavMenu가 쓰는 "배경 하이라이트형 탭 + 드롭다운 캐럿"은 표현 불가. `h-14` 고정이라 h-10 헤더 높이에 못 맞춤 | MultiHeaderNavMenu는 `tabBase/tabOpen/tabDefault` 문자열 3개로 전부 직접 작성(L102-107) | `variant`(underline/filled/pill), `height`, `paddingX`/`gap`, `uppercase` 끄기, `renderLabel`(캐럿 등) |
| A-8 | Table 계열 (36곳) | Table(fullHeight, style, tableStyle), TableHead(noRow), TableRow(onClick), TableHeaderCell(align, width, sortable, sortDirection, stickyLeft), TableCell(variant text/player/stat/attribute/ovr/rank/badge, colorScale, mono, subText, image, stickyLeft) | 열 구분선(border-r) prop 없음 — TableHeaderCell/TableCell은 `border-b`만(L131, L225). 헤더 `text-xs font-black uppercase tracking-widest h-10`(L83) 고정, 셀 `py-2 px-3` 고정(밀도 변경 불가), 행 호버 `hover:bg-white/5`(L105) 고정, 행 선택/줄무늬/하이라이트 상태 prop 없음. 바깥 래퍼가 `rounded-xl bg-slate-900 border shadow-lg`(L73)로 박스 포함 — 카드 안에 넣으면 이중 테두리. variant="rank"는 정의만 있고 switch case 없음(default로 떨어짐, L182-221 확인). sticky z-index 30/40/50 하드코딩. 열 그룹 구분(그룹 헤더행)·합계행은 TableFoot 정도 | PlayerAwardBadges(L146-177), SliderGroupNotes(L59-63)는 `<table>` 자체 작성. 로스터 등은 sticky 스타일을 별도 함수로 처리(InjuryStatusBadge 주석 L46-50) | `columnDividers`/`dividerRight`(th/td), `density`(compact), `rowClassName`/`selected`/`highlight`, `bare`(래퍼 박스 제거), `headerCase`(uppercase 끄기), variant "rank" 구현 |
| A-9 | TeamLogo (36곳) | teamId, teamName, size xs~3xl/custom, faded, style | `getTeamLogoUrl`(구버전 로고)만 사용(L33), 폴백이 1단(`placehold.co` 직행, L42). 멀티가 쓰는 `public/logos/real/`(`getRealTeamLogoUrl`) 미지원 → real→old→placehold 3단 폴백 불가. 검색 컴포넌트 주석(MultiGlobalSearch L199-201)이 "기존 TeamLogo는 싱글플레이어용 구버전 로고만 참조"라고 명시. 폴백 시 onError 무한루프 방지 없음(placehold 실패 시 재시도, 추정). `drop-shadow-md transition-all` 고정 | MultiHeader L439-454, MultiGlobalSearch L202-215, TeamSelectModal L21-36, TeamMark L26-39 가 동일한 3단 폴백 `<img>`를 각자 복제(리포 전체 `dataset.fallback` 사용 18개 파일, `placehold.co/100x100` 19개 파일) | `source: 'real' \| 'legacy'`(또는 real 우선 3단 폴백 내장), `fallbackLabel`, `shadow` 끄기 |
| A-10 | TeamMark (6곳) | teamId, teamName, className(필수), badge?{color,abbr} | "real 로고로 전환하는 스위치"가 `badge` prop의 유무 — 의미와 이름 불일치(L24). badge.color는 쓰이지 않음(L26-39에서 abbr만 사용). 크기를 className으로만 지정(필수). 알 수 없는 팀일 때 폴백 문구 BPL 고정 | 호출부가 badge를 억지로 넘겨 real 로고를 켬(추정) | `variant="real"` 명시 prop, 필수 className 해제(size prop) |
| A-11 | TeamBadge (직접 사용 소수) | teamId, abbr, colorPrimary/Secondary/Text, size xs~xl | colorPrimary가 없으면 TeamLogo(구버전 로고)로 폴백(L39-41) → real 로고 불가. 배지는 직사각형 `rounded` 고정, colorSecondary 선언만 하고 미사용(L12, 렌더 L43-48에서 사용 안 함). `abbr.slice(0,3)` 고정 | TeamSetupModal 미리보기(L114-124)는 TeamBadge가 아니라 자체 24x24 박스 | secondary 보더 적용, shape, 폴백 로고 소스 선택 |
| A-12 | OvrBadge (50곳) | value, size sm/md/lg/xl/card, className, textClassName | 최소 크기가 sm=24px(`w-6 h-6`, L93). 20px(xs) 없음. 폰트 크기만 textClassName으로 덮을 수 있고 w/h/rounded는 불가 → 호출부가 `!w-5 !h-5 !text-xs` 같은 important 강제(MultiGlobalSearch L224). 같은 패턴 `OvrBadge`+`!` 라인이 리포 전체 44줄. 3자리 폰트 축소 규칙 고정, 티어색은 value만으로 결정(manual_ovr 등 외부 지정 불가) | `className="!w-5 !h-5 !text-xs"` | `size="xs"`(20px), `boxClassName` 또는 px 직접 지정, `rounded` |
| A-13 | StarRating (2곳) | ovr/stars, size sm/md/lg, showValue | 크기 12/16/20px 3종(L29). 색은 별 수에서만 결정. 빈 별 stroke `#334155` 하드코딩 | — | 크기 px 직접, 색 override |
| A-14 | InjuryStatusBadge | severity, title, size(px), iconSize, strokeWidth | 툴팁 `z-[9999]`(L85) 고정·portal. 색은 severity 3계열 고정. 툴팁 위치 위쪽 고정 | PlayerAwardBadges(L86)는 CSS absolute 툴팁을 또 따로 구현(portal 아님) → 툴팁 3종 중복(Injury/PlayerAward/Slider) | 공용 Tooltip 컴포넌트 분리 |
| A-15 | PlayerHoverCard | player, teamAbbr, enabled, children(단일 엘리먼트) | 팝업 `zIndex: 200`(L339) — Modal(500) 아래라 모달 안에서 띄우면 가려짐(추정, 모달 내 사용처 미확인). 폭 300 고정, 지연 500ms 고정, 위치 추정 높이 340 → 레이아웃 미세 어긋남은 useLayoutEffect로 보정(L294). 스크롤 시 닫힘(캡처 단계 리스너) | PlayerRatingsStatsPopup을 export해 드래프트 카드가 직접 위치 계산(L142-145 주석) | `zIndex`/`delay`/`placement` prop |
| A-16 | PlayerAwardBadges | HeaderAwardTrophies, PlayerAwardList | 어워드 메타 하드코딩 11종. 이미지 경로 고정. 빈 상태 `h-[400px]` 고정(L125). 자체 `<table>`(Table 미사용). 'ALL_NBA' 이름 문자열이 "올-오펜시브 팀"으로 표기(UI 카피 영향, 이번 범위 밖) | — | EmptyState/Table 재사용 |
| A-17 | SliderControl | label, value, onChange, min/max, subLabel, tooltip, steps, readOnly, left/rightLabel | 값 색상 에메랄드 그라디언트 고정(L85-88), readOnly 막대색 `#4f46e5`/`#27272A` 하드코딩(L117-118), 툴팁 색 `#27272A/#3F3F46/#A1A1AA` 하드코딩(L138)이라 slate 토큰과 불일치. 커밋 시점 mouseup/keyup만(터치 이벤트 없음 — 모바일에서 커밋 안 될 가능성, 추정) | 툴팁은 SliderGroupNotes로 대체했다는 주석(SliderGroupNotes L10) | 색 토큰화, onTouchEnd |
| A-18 | SliderGroupNotes | notes{label,text,category} | 자체 `<table>`+`border-r/border-b` 구분선 직접 구현(L41-44) — Table에 열 구분선이 없어서 생긴 우회로 보임(추정). 제목 문구 한국어 하드코딩 | — | Table `columnDividers` 추가 후 재사용 |
| A-19 | NotificationCenter | bottomOffset | z-[600] 규약(Modal 500 위). 그러나 Dropdown(9999), TeamSelectModal(9999), InjuryStatusBadge 툴팁(9999)이 토스트 위 | — | z-index 토큰 체계 |
| A-20 | Skeleton | className | `inline-block rounded bg-slate-700/30 animate-pulse` 고정. 줄 단위/원형 variant 없음 | — | — (현 규모로 충분) |
| A-21 | (없음, 신규 필요) Spinner / EmptyState / TextInput·FormField / CountBadge / MenuItem·Menu / Tooltip | — | `Loader2 animate-spin` 직접 사용 143곳(리포 grep), 빈 상태 문구는 화면마다 자체 마크업(MultiComingSoonView L10-17, PlayerAwardList L123-128, PlayerHoverCard L216), 텍스트 입력은 `bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500`가 TeamSetupModal(L140, L151)·ColorField(L36)에 복제 | 각 파일이 클래스 문자열 복붙 | 위 6개를 `components/common/`에 신설 |

사용처 집계 요약(grep, 추정 오차 있음): Button 1, Card 0, Badge 0, PageHeader 0, Modal 10, Dropdown 8, Table 36, TeamLogo 36, TabBar 11, OvrBadge 50, TeamMark 6, Skeleton 2, DirectionBadge 2, StarRating 2. → Button·Card·Badge·PageHeader는 사실상 미사용(추정: A-1~A-4의 고정 스타일이 실제 화면 디자인과 맞지 않아서). "대체 불가 사유"를 적을 때 이 4개는 "공용이 있지만 아무도 안 쓰는 이유"를 먼저 설명해야 한다.

---

## B. 크롬 파일별

체크리스트 대조 표기: [오탐]=주석 문구나 컴포넌트 자기 정의라 UI 발견이 아님, [정상]=문제 없음.

### components/MultiHeader.tsx (579줄)

#### 공용 컴포넌트 사용 현황
- 공용 import 없음(체크리스트 "공용 import: 없음"과 일치). `MultiHeaderNavMenu`(같은 크롬 하위 컴포넌트)만 사용.
- 로고는 공용 TeamLogo/TeamMark가 아닌 `<img>` 직접(A-9/A-10 근거).
- 버튼 3개 전부 `<button>` 직접(A-1 근거).

#### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 23 | (체크리스트 empty_state) | 주석 "접두어 없음" | — | — | [오탐] |
| 422 | divider/zindex/sticky | `w-full sticky top-0 z-[100] ... h-10 relative shrink-0 bg-slate-900 border-b border-slate-700` | 없음(레이아웃 크롬) | z-index 토큰 | 추가 발견: `sticky`와 `relative` 동시 지정(Tailwind에서는 sticky가 이겨서 동작은 하지만 중복). 체크리스트 3행(divider_b, zindex, sticky)이 같은 요소 |
| 424 | overlay | `absolute inset-0 backdrop-blur-[20px] bg-[rgba(0,0,0,0.1)] pointer-events-none` | 없음 | — | 추가 발견: 바로 아래가 불투명 `bg-slate-900`라 블러 시각 효과가 거의 없는데 sticky 헤더에 backdrop-filter가 상시 적용됨. 메모리(모달 백드롭 블러가 스크롤 렉 원인, 2026-09-30)와 같은 계열의 비용 우려 — 실제 영향은 미측정이라 추정 |
| 427, 552 | zindex | 왼쪽/오른쪽 묶음 `relative z-10` | 없음 | — | 헤더(z-100) 내부 stacking context를 만든다 — 아래 NavMenu 패널 z-[200]이 이 안에 갇힘(종합 표 참고) |
| 439-454 (체크리스트 446, 447, 450) | logo-fallback | `<img src=getRealTeamLogoUrl ... onError dataset.fallback 'old' → getTeamLogoUrl → placehold.co>` w-5 h-5 | TeamLogo (real 폴백 지원 시) | TeamLogo `source="real"` + 3단 폴백(A-9). 크기 20px는 TeamLogo size에 없음(xs=16, sm=24) → `size="custom"` | 16줄. MultiGlobalSearch, TeamSelectModal, TeamMark와 동일 복제 |
| 486 | (tabular) | `tabular-nums` 드래프트 타이머 | — | — | [정상] 체크리스트 tabular는 오탐에 가까움(올바른 사용) |
| 488-493 | button | `px-3 py-1 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 ... rounded-lg text-xs font-black text-white active:scale-[0.98]` | Button | variant="cta"(주황 그라디언트), shape=lg, uppercase 끄기(A-1) | 568-574와 클래스 거의 동일(크기만 다름): 한 컴포넌트로 합칠 수 있음 |
| 497-500 | live-dot | `animate-ping` 빨간 점 + `h-1.5 w-1.5` | 없음 → LiveDot 신규 | `<LiveDot size>` | 체크리스트 live_dot. 리포 내 다른 LIVE 표시와 중복 여부는 다른 문서 대상 |
| 503-509 | button | `px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-bold active:scale-95` + Tv 아이콘 | Button | variant=danger, size 더 작은 'xxs', shape=sm, uppercase 끄기 | LIVE "보기" 버튼, danger variant와 색은 같음(red-600/500) |
| 568-574 | button | 488-493과 동일 계열 `px-4 py-1.5 ... text-sm font-black` | Button | 위와 동일 | 중복 |
| 178-190, 404-417 | (비UI) | 카운트다운 문자열 계산 2벌 + 상단 `fmtRemaining`(L39-49) 1벌 | — | `fmtRemaining(diffMs, {zeroText})` | 추가 발견: countdown(L178-190)은 fmtRemaining과 '경기 시작'/'곧 시작' 문구만 다름. eventCountdown(L404-417)은 `일 hh:mm:ss`로 형식이 달라 옵션이 필요 |
| 466-472 | 텍스트 칩 | 날짜 `text-sm text-white`, 시즌 `text-sm text-text-muted` | 없음 | — | 추가 발견: `text-text-muted`는 다른 곳의 slate-* 팔레트와 다른 토큰 계열(tailwind 설정 확인 필요, 추정) |

### components/MultiSidebar.tsx (333줄)

#### 공용 컴포넌트 사용 현황
- 공용 import 없음. 아이콘은 `public/images/sidenav/*.svg` 파일 스왑(NavIcon)과 lucide `CircleUser`.
- 프로필 메뉴는 공용 Dropdown을 쓰지 않고 portal 직접 구현.

#### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 25-39 | button/nav-item | NavItem: `w-full flex justify-center p-1.5 rounded-[4px] ... text-slate-700 hover:text-slate-400`, `title={label}` | 없음(사이드바 전용) | — | 추가 발견: 비활성 아이콘 `text-slate-700`을 `bg-slate-900` 위에 사용(대비 낮음, 추정). `aria-label`/`aria-current` 없음(title만) |
| 35 (체크리스트 badge_inline, pill_rounded) | badge | `absolute top-0.5 right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold`, 9+ 캡 | Badge(신규 variant count) / CountBadge | A-3의 `variant="count"` | NavMenu L183/L264, TabBar L44와 동일 패턴 4벌 |
| 42 | divider | `Divider`: `w-6 h-px bg-slate-800` | 없음 | — | [정상] 일반 구분선, 공용 부재(`Divider` 공용 없음) |
| 45-52 | icon | NavIcon 이미지 쌍 스왑 `w-7 h-7` | — | — | [정상] |
| 66-78 | icon(SVG) | RosterIcon: `<rect fill="#0F172A">` + 3 path 색 prop | — | — | 추가 발견: 배경색 `#0F172A`가 `bg-slate-900`과 값만 같고 토큰 연결 없음(테마 변경 시 어긋남) |
| 95, 280 | (empty_state) | 주석의 "비어" | — | — | [오탐] 2행 |
| 155 | divider(vertical)/zindex | `aside w-[40px] ... z-20 relative bg-slate-900 border-r border-slate-700` | 없음 | z-index 토큰 | 체크리스트 divider_v, zindex 2행이 같은 요소 |
| 157, 263 | zindex | `relative z-10` 컨테이너 | 없음 | — | 체크리스트 zindex 2행. 사이드바 내부 stacking |
| 273-327 (체크리스트 276 zindex) | overlay/dropdown-menu | `createPortal` + `fixed w-48 rounded-xl overflow-hidden shadow-2xl z-[300] bg-slate-800 border border-slate-700`, `bottom`/`left` 좌표를 버튼 rect로 계산, mousedown 바깥클릭 | Dropdown | Dropdown `placement`(right-end 기준 bottom 앵커), items에 icon/divider/danger(A-6) | 55줄. 헤더 NavMenu 패널(bg-slate-900)·검색 패널과 배경색까지 다름(종합 표) |
| 291-298, 300-307, 309-315, 317-323 (체크리스트 291, 293, 300, 302, 309, 311, 317, 319) | button+hover | 메뉴 항목 4개: `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-600 transition-all text-left` + `text-xs font-bold` | Dropdown items / 신규 MenuItem | MenuItem(icon,label,onClick), 클래스 중복 4회 | 4개가 100% 동일 문자열. hover가 `bg-slate-600`(패널 slate-800 위) — 다른 메뉴는 slate-800 |
| 308, 316 (체크리스트 divider_t) | divider | `my-1 border-t border-slate-700/60` vs `my-1 border-t border-slate-700` | Dropdown divider 항목 | `{divider: true}` | 추가 발견: 같은 메뉴 안에서 구분선 투명도가 다름(/60 vs 불투명) — 의도 불명, 아마 실수(추정) |
| 133-143 | (로직) | mousedown 바깥클릭 훅 | — | `useClickOutside` 훅 | 헤더 NavMenu(L79-87), 검색(L84-91), Dropdown(L70-83) 모두 같은 로직 복제(4곳). Sidebar는 Esc도 없음 |

### components/dashboard/MultiHeaderNavMenu.tsx (277줄)

#### 공용 컴포넌트 사용 현황
- 공용 import 없음. 같은 폴더의 MultiGlobalSearch를 포함. TabBar/Dropdown 둘 다 미사용.

#### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 25 | (empty_state) | 주석 "비어있어" | — | — | [오탐] |
| 102-107 (체크리스트 107 row_hover) | tab | `tabBase = 'flex items-center gap-1 px-4 h-[39px] text-base font-semibold ...'`, tabOpen `bg-slate-700 text-white`, tabActivePage `text-white`, tabDefault `text-slate-400 hover:text-white hover:bg-slate-800` | TabBar | TabBar `variant="filled"`+`height`+`renderLabel` (A-7) | `h-[39px]`가 헤더 `h-10`(40px)-border 1px에 맞춘 매직넘버(주석 L99-101). hover 체크리스트는 행 호버가 아니라 탭 호버 |
| 160-192 (체크리스트 165 card_box, zindex, 172 divider, 173 button, 178 hover, 183 badge, 183 pill) | dropdown-menu | `DropdownPanel` 컴포넌트가 NavMenu 본문 안에서 정의됨. `absolute top-full right-0 mt-0 bg-slate-900 border border-slate-700 flex flex-col z-[200]`(모서리 둥글기·그림자 없음), 항목 `px-4 py-2.5 text-sm`, 활성 `bg-slate-800 text-white font-semibold` | Dropdown | Dropdown placement(bottom-end, 틈 없이 mt-0), 항목 크기 variant, badge 필드 | 추가 발견: `DropdownPanel`이 렌더 함수 안에서 정의돼 매 렌더마다 새 컴포넌트 타입이 되어 언마운트·재마운트됨(React.memo 부모라 빈도는 낮지만 패널 내부 상태/호버 초기화 위험, 추정) |
| 183 | badge | 항목 배지 `w-4 h-4 text-[9px]` | CountBadge | A-3 | 4벌 중 하나, 크기 다름(9px) |
| 211-216 | tab(button) | 홈 탭 `tabBase` | TabBar | 위와 동일 | 체크리스트 button_raw |
| 222-231, 236-245, 254-268 (체크리스트 222, 236, 254 button_raw) | tab+caret | 내 팀/전술/리그 버튼 + ChevronUp/Down 16px | TabBar | `renderLabel`/`caret` | 3개 블록이 거의 동일(약 11줄씩) → 맵 한 번으로 줄일 수 있음 |
| 264 (체크리스트 badge_inline, pill) | badge | `absolute -top-1.5 -right-2.5 w-4 h-4 text-[8px]` | CountBadge | A-3 | 같은 파일 안에서도 8px(L264)와 9px(L183) 두 가지 |
| 79-87 | (로직) | 바깥 mousedown 닫기 | useClickOutside | — | 위 Sidebar 비고 참고. 추가 발견: Esc 닫기·방향키 이동 없음, 탭 버튼에 `aria-expanded`/`aria-haspopup` 없음 |

### components/dashboard/MultiGlobalSearch.tsx (248줄)

#### 공용 컴포넌트 사용 현황
- 공용: OvrBadge(size sm + important 오버라이드). TeamLogo는 안 씀(주석 L199-201: 구버전 로고만 참조하기 때문).

#### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 129-167 (체크리스트 146 input_raw, 160 button_raw) | search | 접힘 72px ↔ 펼침 200px 입력 `h-7 bg-slate-900/slate-800 border-slate-700/600`, `boxShadow inset`, 접힘 라벨 "검색", X 지움 버튼(L160, aria-label 없음) | 신규 SearchInput(공용 TextInput 위) | A-21 TextInput + 확장 애니메이션 | 포커스 상태가 배경/보더 색을 바꾸는 방식은 TeamSetupModal 입력(focus:border-indigo-500)과 다름(slate-600) → 입력 포커스 색 2종 공존 |
| 93-105 | (로직) | Esc 닫기+⌘K 포커스 | — | — | 장점: 크롬 중 유일하게 Esc 지원. 방향키/Enter 선택 없음(키보드로 결과 이동 불가) — 기능 갭 |
| 169-179 (체크리스트 171 card_box, zindex) | overlay/dropdown | `absolute top-full mt-1 rounded-sm overflow-hidden z-[200] bg-slate-900 border border-slate-700 max-h-[320px] overflow-y-auto`, 커스텀 `boxShadow 0 20 25 -5 rgba(0,0,0,.1)`, 폭 340 | Dropdown(children 모드) | Dropdown placement 'anchor-left offset', zIndexClass | NavMenu 패널(각진, 그림자 없음)과 둥글기(rounded-sm)·그림자 다름 |
| 180-190 (체크리스트 182 empty_state) | empty | "검색 결과 없음" 한 줄(그룹 헤더와 같은 `bg-slate-800 px-3 py-1`) | 신규 EmptyState | A-21 | [정상] 실제 빈 상태이므로 오탐 아님 |
| 192-196 (체크리스트 192 button_raw, 195 row_hover) | button+hover | `w-full flex gap-3 px-3 py-2 hover:bg-slate-800 transition-colors` | MenuItem | 위 | 사이드바 항목과 패딩·폰트 다름(py-2 text-xs semibold vs py-2.5 text-xs bold) |
| 202-215 (체크리스트 208, 209, 212) | logo-fallback | 3단 폴백 `<img w-6 h-6>` | TeamLogo | A-9, size sm(24px)이 정확히 일치 | 14줄. 이 파일은 TeamLogo `size="sm"`로 바로 대체 가능(폴백 지원 후) |
| 224 (체크리스트 important_ovr, ovr_calc) | badge | `<OvrBadge value={calculatePlayerOvr(...)} size="sm" className="!w-5 !h-5 !text-xs shrink-0">` | OvrBadge | `size="xs"`(20px, 폰트 xs) (A-12) | `calculatePlayerOvr` 호출은 정상(OvrBadge는 value만 받음) — 오탐 아님. important 오버라이드 제거 가능 |
| 22-27 | 상수 | COLLAPSED_W/EXPANDED_W/DROPDOWN_W 주석에 "세 값은 반드시 여기서만" | — | — | 추가 발견: 드롭다운 left를 `calc(100% - EXPANDED_W)`로 계산 — 입력창 폭을 바꾸면 패널이 어긋나는 결합(주석으로만 방어) |

### components/multi/LeagueLoadingScreen.tsx (28줄)

#### 공용 컴포넌트 사용 현황
- 공용 import 없음. `Loader2`(lucide) 직접.

#### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 5 | (empty_state) | 주석 "막대 없음" | — | — | [오탐] |
| 21 | 레이아웃 | `flex flex-col items-center justify-center gap-3 h-full min-h-screen bg-gray-950` | — | — | 추가 발견: `bg-gray-950`(gray) — 크롬 나머지는 `slate-*`. 리포 전체 `bg-gray-950` 6곳 vs `bg-slate-950` 469곳 → 팔레트 불일치 소수 잔재 |
| 23 | spinner | `Loader2 size={32} animate-spin text-indigo-400` | 신규 Spinner | A-21 | 리포 143곳 중 하나 |
| 24 | 텍스트 | `text-base text-white ko-normal` | — | — | 오류화면은 `text-red-200`(L39), 동일 규격 |

### components/multi/LeagueBootstrapErrorScreen.tsx (53줄)

#### 공용 컴포넌트 사용 현황
- 공용 import 없음. 사용처는 LeagueLayout 1곳.

#### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 29 | 레이아웃 | `relative flex items-center justify-center h-full min-h-screen bg-gray-950 px-4` | — | — | 로딩 화면과 레이아웃 래퍼 동일(2벌) → 공유 `FullScreenCenter` 가능(소폭) |
| 30-36 (체크리스트 button_raw, 33 row_hover) | button(ghost) | "‹ 홈으로" `absolute top-4 left-4 inline-flex gap-1 px-2 py-1.5 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800` | Button | variant=ghost, size sm, shape=lg, uppercase 끄기(A-1) | Button ghost와 색은 동일(slate-400→white, hover slate-800/50) |
| 42-48 (체크리스트 button_raw) | button(primary) | `mt-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white` | Button | variant=primary(그림자·ring 없는 flat 필요), shape=lg | Button primary에는 `shadow-lg ring-1`이 붙어 모양이 달라짐 |
| 40 | 텍스트 | `text-base text-red-200` | — | — | 토스트(NotificationCenter)와 별개의 전체화면 오류 — 의도된 설계(주석 L1-8) |

### views/multi/season/MultiComingSoonView.tsx (20줄)

#### 공용 컴포넌트 사용 현황
- 공용 import 없음. **사용처 0건** (리포 grep: 정의 파일 외 참조 없음 — 동적 import 문자열 검색은 못 했으므로 "미사용 추정").

#### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 10-17 | empty/placeholder | `flex-col items-center justify-center min-h-[60vh] ... Construction 40px text-slate-600`, 제목 `text-lg font-black text-slate-300`, 부제 `text-sm text-slate-500` | 신규 EmptyState | A-21 | 체크리스트 매치 0행. `pretendard` 클래스 직접 지정(추가 발견: 다른 화면은 `ko-normal/ko-tight`만 사용, 폰트 클래스 혼용). 미사용이면 삭제 후보 |

### components/multi/TeamSelectModal.tsx (178줄)

#### 공용 컴포넌트 사용 현황
- 공용 import 없음. Modal 대신 오버레이·패널 직접 구현, Loader2 직접. 사용처는 InlineLeagueList 1곳.

#### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 19-36 (체크리스트 28, 29, 32) | logo-fallback | `TeamLogoImg`: 3단 폴백 `<img w-14 h-14>` | TeamLogo | size 'custom'/w-14(56px; TeamLogo xl=64, lg=48 어느 쪽도 아님) → custom 필요 | 18줄. 호출부 L132-134에서 `w-14 h-14` 래퍼 div가 한 번 더 감쌈(중복 래퍼) |
| 88-90 (체크리스트 zindex 88, 88, 89) | (zindex) | 주석의 `z-10` 설명 | — | — | [오탐] 3행(주석 설명, 코드 아님). 단 주석 내용은 유효: 홈 z-10 stacking 때문에 portal 사용 |
| 91-93 (체크리스트 overlay_fixed, 92 zindex, 93 card_box) | overlay | `createPortal` + `fixed inset-0 z-[9999] ... bg-black/60 p-4` / 패널 `bg-slate-900 border border-slate-700 rounded-2xl max-w-5xl max-h-[90vh]` | Modal | zIndexClass(9999 대신 Modal 500으로도 portal이라 충분할 수 있음, 홈 footer 문제는 portal로 해소), size 'xl'=max-w-6xl라 5xl 불일치 → size 보강, `rounded="rounded-2xl"`로 이미 가능, `backdropClass="bg-black/60"` 이미 가능 | 추가 발견: 백드롭 클릭 닫기·Esc 없음(Modal은 백드롭 클릭 닫기 있음). z=9999라 토스트(600) 위 — 입장 실패 토스트가 모달 뒤에 가려질 수 있음(이 모달은 인라인 err 텍스트 L151로 대응, 추정) |
| 96-104 (체크리스트 96 divider_b, 101 button_raw) | header | `px-8 py-5 border-b border-slate-800` + 제목 `text-xl font-black` + 부제 + X(20px, aria-label 없음) | Modal title | subtitle 슬롯, headerPadding py-5(Modal 기본 py-6) | 13줄 |
| 107-147 (체크리스트 110 spinner) | grid/loading | 3열 카드 그리드, 로딩 `Loader2 20 animate-spin text-indigo-400` | Spinner + Card | A-21, A-2(카드 `rounded-2xl` + 선택 상태 보더) | 카드 버튼(L120-142)은 선택/비활성/호버 3상태 — Card에 `selected`/`disabled` 없음 |
| 129 (체크리스트 row_hover) | hover | 카드 호버 `hover:border-indigo-500/50 hover:bg-slate-800` | Card | A-2 | 카드 호버지 행 호버 아님 |
| 150-170 (체크리스트 150 divider_t, 153, 159 button_raw, 155 row_hover, 165 spinner) | footer+button | `px-8 py-5 border-t border-slate-800`, 취소 `bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold`, 입장 `bg-indigo-600 ... disabled:opacity-40` + `Loader2 14` | Modal footer + Button | Button shape=xl, uppercase 끄기, isLoading(loadingText="입장 중…" 이미 있음 → 인라인 Loader2 대체 가능) | 22줄. Button의 `isLoading/loadingText`로 L164-167의 삼항 4줄이 사라짐 |

### components/multi/TeamSetupModal.tsx (188줄)

#### 공용 컴포넌트 사용 현황
- 공용: 같은 폴더 ColorField. Modal 미사용(오버레이 직접), portal 미사용. 사용처 LeagueLobbyPanel 1곳.

#### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 101-103 (체크리스트 overlay_fixed, zindex, card_box) | overlay | `fixed inset-0 z-50 ... bg-black/60` (portal 없음) / 패널 `bg-slate-900 border border-slate-700 rounded-2xl max-w-sm mx-4 p-6 space-y-5` | Modal | size xs(max-w-sm), bodyPadding p-6 | 추가 발견(추정): portal이 아니고 `z-50`이라 헤더(z-100)·사이드바 메뉴(z-300)보다 낮다. 조상에 stacking context가 있으면 가려짐은 없으나 없으면 헤더가 모달 위에 보임 — LeagueLobbyPanel의 조상 구조는 미확인 |
| 106-111 (체크리스트 button_raw 108) | header | `text-base font-black` 제목 + X 16px | Modal title | headerPadding | TeamSelectModal(X 20)·Modal(X 24)와 X 크기 3종 |
| 113-128 | preview | `w-24 h-24 rounded-2xl ... border 4px ${safeS}` 약어 박스 | TeamBadge(확장) | A-11 secondary 보더·큰 사이즈 | 미리보기 전용, 대체 우선순위 낮음 |
| 132-153 (체크리스트 134, 145 input_raw) | input | label `text-xs text-slate-400 ko-normal block mb-1` + `w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500` | 신규 TextInput/FormField | A-21 | ColorField L20/L36과 동일 문자열(3중 복제). 약어 입력은 `font-mono` 추가 |
| 168-183 (체크리스트 button_raw 170, 176, 172 row_hover) | button | 취소 `flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 hover:bg-slate-700`, 저장 `bg-indigo-600 ... disabled:opacity-50` | Button | fullWidth 아님(flex-1), shape=xl, isLoading=saving(`저장 중…`) | TeamSelectModal 푸터와 거의 동일하되 disabled 불투명도(50 vs 40)·flex-1 여부만 다름 |
| 159-163 | alert | `text-xs text-amber-400` 경고 | 신규 InlineAlert | — | 이모지 `⚠` 사용(프로젝트 UI 이모지 규칙은 별도 확인 필요, 추정) |

### components/multi/ColorField.tsx (42줄)

#### 공용 컴포넌트 사용 현황
- 공용 import 없음. 자체가 3곳(TeamSetupModal, TeamSettingsPanel, AdminAppSettingsPage)이 쓰는 준공용 컴포넌트 — 좋은 선례.

#### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 22-28 (체크리스트 input_raw) | input(color) | `w-9 h-9 rounded-lg border border-slate-700 bg-transparent p-0.5` | — | — | 색상 피커는 공용 없음, 유지 |
| 29-37 (체크리스트 input_raw) | input(text) | 헥스 입력 `flex-1 bg-slate-800 ... font-mono` | TextInput | A-21 | TeamSetupModal 입력과 동일 문자열 |
| 20 | label | `text-xs text-slate-400 ko-normal block mb-1` | FormField | A-21 | 3중 복제의 일부 |

### components/multi/CourtPreview.tsx (97줄)

#### 공용 컴포넌트 사용 현황
- 공용 import 없음. SVG 자식 노드만 반환하는 순수 도형 컴포넌트(3곳 공유).

#### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 5, 14 | (empty_state) | 주석 "없음" | — | — | [오탐] 2행 |
| 42-43 | SVG | `stroke="#333"`, `stroke="#e65100"` 림/백보드 하드코딩 | — | — | 추가 발견: 색 prop화되지 않은 하드코딩 2개(팀 설정 색에 영향받지 않음, 의도일 수 있음) |
| 13-14 | 문서 | `/** logoUrl 주석 */` JSDoc이 `three` prop 선언 위에 붙어 있고 `three` 주석 다음에 `logoUrl`이 옴 | — | — | 추가 발견: JSDoc 2개가 연속돼 `three`의 주석이 `logoUrl`에, `logoUrl`의 주석이 `three`에 붙는 것으로 보임(에디터 툴팁 오표시, 코드 영향 없음) |

---

### B-2. components/common 체크리스트 115행 판정

[오탐]=컴포넌트 자기 정의/주석, [근거]=A표의 한계를 입증하는 라인.

| 파일 | 라인(체크리스트 토큰) | 판정 | A표 연결 |
|---|---|---|---|
| Badge | 19 header_text | [근거] uppercase tracking-wider 고정 | A-3 |
| Button | 27 header_text | [근거] | A-1 |
| Button | 41, 43 row_hover, 51 button_raw, 58 spinner | [오탐] 4 (variant 호버색·자기 `<button>`·자기 스피너). 단 58은 "공용 Spinner 부재" 보조 근거 | A-21 |
| Card | 22, 23, 25 card_box | [오탐] 3 (variant 정의 그 자체) | A-2 |
| DirectionBadge | 22 header_text | [근거] Badge 클래스 복제 | A-3 |
| Dropdown | 94 card_box, 94 zindex | [근거] 2 (z-9999, 패널 박스 고정) | A-6 |
| Dropdown | 103 button_raw, 112 row_hover, 139 card_box | [오탐] 3 (자기 항목·DropdownButton) | — |
| InjuryStatusBadge | 46-53 sticky ×6 | [오탐] 6 (주석 설명) | — |
| InjuryStatusBadge | 85 zindex | [근거] z-9999 툴팁 | A-14, A-19 |
| Modal | 81 overlay_fixed, 81 zindex, 85 card_box, 98 divider_b, 128 divider_t | [근거] 5 (z-500, 패널/헤더/푸터 고정) | A-5 |
| Modal | 91 z-20, 98 z-10, 101, 103, 113, 115 hover, 115 z-50, 122 z-10, 128 z-10 | [오탐] 9 (모달 내부 레이어링·자기 닫기 버튼) | — |
| NotificationCenter | 94 zindex | [근거] z-600 | A-19 |
| NotificationCenter | 7 ×2 (주석), 67, 75, 79, 98, 102 | [오탐] 7 | — |
| OvrBadge | 20, 33 empty_state | [오탐] 2 (주석 "없음") | — |
| PageHeader | 14 divider_b, 14 zindex | [근거] 2 (z-70, 하단 보더) | A-4 |
| PageHeader | 18 card_box | [오탐] 1 (아이콘 박스) | — |
| PlayerAwardBadges | 81 badge_inline, 86 zindex, 126 empty_state, 146 table_raw, 148 divider_b, 148 header_text, 149-151 th_raw ×3, 158 divider_b, 158 row_hover, 159 td_raw, 160 td_raw, 172 td_raw | [근거] 14 (Table 미사용 자체 table, 자체 툴팁/빈 상태) | A-8, A-16, A-14 |
| PlayerAwardBadges | 148 badge_inline, 159 tabular | [오탐] 2 (th 텍스트 크기, 숫자 정렬 정상 사용) | — |
| PlayerHoverCard | 153 card_box, 216 empty_state | [근거] 2 (팝업 박스 z-200 연동, 빈 상태 문구) | A-15, A-21 |
| PlayerHoverCard | 37, 144 (주석), 157, 189, 198, 207 | [오탐] 6 | — |
| Skeleton | (0행) | — | A-20 |
| SliderControl | 138 zindex | [근거] 자체 CSS 툴팁(3번째 툴팁 구현) | A-17, A-14 |
| SliderControl | 150 input_raw, 151 range_input | [오탐] 2 (슬라이더 자기 정의) | — |
| SliderGroupNotes | 33 divider_b, 33 td_raw, 41 divider_v, 41 divider_b, 41 td_raw, 44 divider_b, 44 td_raw, 53 divider_t, 59 table_raw | [근거] 9 (열 구분선 포함 자체 table, Table에 `border-r` 없음) | A-8, A-18 |
| StarRating | 82 tabular | [오탐] 1 | — |
| TabBar | 28 tab_underline, 44 badge_inline, 44 pill_rounded | [근거] 3 | A-7, A-3 |
| TabBar | 25 button_raw | [오탐] 1 | — |
| Table | 73 card_box, 81 divider_b, 81 zindex, 81 sticky, 83 header_text, 97 divider_t, 105 row_hover, 126 zindex, 126 sticky, 131 divider_b, 177 zindex, 177 sticky, 193 badge_inline, 215 header_text, 215 badge_inline, 225 divider_b | [근거] 16 | A-8 |
| Table | 74 table_raw, 130 th_raw, 199 tabular, 207 tabular, 225 td_raw | [오탐] 5 | — |
| TeamBadge | (0행) | — | A-11 |
| TeamLogo | 42 placehold | [근거] 1단 폴백 | A-9 |
| TeamMark | 32 logo_fallback, 33 logo_fallback, 36 placehold | [근거] 3 (3단 폴백이 TeamMark에만 있음) | A-9, A-10 |

---

## 종합

### 메뉴/오버레이 z-index·배경·둥글기 대조표

| 요소 | 위치 지정 | z-index (실효) | 패널 배경 | 보더 | 둥글기 | 그림자 | 항목 호버 | 항목 패딩/글자 | 닫기 방식 |
|---|---|---|---|---|---|---|---|---|---|
| 헤더 바 (MultiHeader L422) | sticky top-0 | z-[100] | slate-900 (+블러 오버레이 L424) | border-b slate-700 | 없음 | 없음 | — | h-10 | — |
| 헤더 NavMenu 드롭다운 (NavMenu L165) | absolute top-full right-0 mt-0 | 코드상 z-[200]이지만 헤더 오른쪽 묶음이 `relative z-10`(MultiHeader L552)이라 헤더 컨텍스트(100) 안에 갇힘(추정: 외부 요소와의 비교는 헤더 z=100 기준) | slate-900 | slate-700 | 없음(각진) | 없음 | slate-800 | px-4 py-2.5, text-sm font-medium(활성 semibold) | 바깥 mousedown만 |
| 검색 결과 패널 (Search L171) | absolute top-full mt-1 left=calc | 코드상 z-[200]이나 동일한 갇힘(추정) | slate-900 (그룹 헤더 slate-800) | slate-700 | rounded-sm | 커스텀 `0 20 25 -5 rgba(0,0,0,.1)` | slate-800 | px-3 py-2, text-xs font-semibold | 바깥 mousedown + Esc |
| 사이드바 프로필 메뉴 (Sidebar L276) | portal, fixed bottom/left 좌표 | z-[300] (body 직계 → 실제 300) | **slate-800** | slate-700 | rounded-xl | shadow-2xl | **slate-600** | 컨테이너 p-1.5, 항목 px-3 py-2.5, text-xs font-bold, rounded-lg | 바깥 mousedown만 |
| 공용 Dropdown (Dropdown L94) | portal, fixed top/left\|right | z-[9999] | slate-900 | **slate-800** | rounded-xl | shadow-2xl | slate-800 | 컨테이너 p-1, 항목 px-3 py-2.5, text-xs font-bold, rounded-lg | 바깥 mousedown만 |
| 공용 Modal (Modal L81, L85) | portal, fixed inset-0 | z-[500] | slate-900 (백드롭 slate-950/80) | slate-700 | rounded-[2rem](기본) | shadow-2xl | — | 헤더 px-8 py-6 text-xl | 백드롭 mousedown만(Esc 없음) |
| TeamSelectModal (L92-93) | portal, fixed inset-0 | z-[9999] | slate-900 (백드롭 black/60) | slate-700 | rounded-2xl | 없음 | — | 헤더 px-8 py-5 | X 버튼만 |
| TeamSetupModal (L102-103) | fixed inset-0, **portal 없음** | z-50 (조상 stacking에 종속, 헤더 100·사이드바 메뉴 300보다 낮음) | slate-900 (백드롭 black/60) | slate-700 | rounded-2xl | 없음 | — | p-6 | X 버튼만 |
| NotificationCenter | fixed right-4 | z-[600] | 종류별 색 | 종류별 | rounded-xl | shadow-2xl | — | px-4 py-3 | × / 8초 / 호버 정지 |
| PlayerHoverCard 팝업 (L339) | portal, fixed | zIndex 200 | slate-950 | slate-700 | rounded-lg | shadow-2xl | — | p-3 | 마우스 이탈/스크롤 |

대조에서 읽히는 불일치:
1. 메뉴 항목 호버 배경이 slate-800(3곳)·slate-600(사이드바 1곳) — 사이드바만 패널을 slate-800로 한 단 밝게 써서 호버를 slate-600으로 맞춘 것으로 보임(의도, 단 헤더 메뉴와 시각 언어 불일치).
2. 패널 보더 slate-700(헤더 계열/Modal)과 slate-800(Dropdown/카드) 혼재.
3. 둥글기 없음 / rounded-sm / rounded-xl / rounded-2xl / rounded-[2rem] 5종.
4. z-index: 100, 200(실효 100), 300, 500, 600, 9999(×3: Dropdown, TeamSelectModal, 부상 툴팁), 50(TeamSetupModal), 200(HoverCard) — 토큰 체계 없음. 토스트(600)가 Dropdown·TeamSelectModal(9999) 뒤로 가려지는 순서 역전, HoverCard(200)는 Modal(500) 안에서 가려짐(모달 내 사용 여부 미확인, 추정).
5. 바깥 클릭 닫기 로직이 4곳(Sidebar, NavMenu, Search, Dropdown)에 복제, Esc 지원은 검색뿐.

### 통합 후보(효과 큰 순)

제거 줄 수는 해당 라인 범위를 세어 "현재 줄 - 대체 호출 줄"로 계산(신규 공용 컴포넌트 추가분은 별도). 모달 항목은 "추정".

| 순위 | 후보 | 대상 라인 | 제거되는 줄 수 | 선행 조건 |
|---|---|---|---|---|
| 1 | 3단 폴백 로고를 TeamLogo로 통합 (real→legacy→placeholder) | MultiHeader L439-454(16줄), MultiGlobalSearch L202-215(14줄), TeamSelectModal L19-36(18줄)+L132-134 래퍼 | 48줄 - 호출 3줄 = 약 45줄. 확산 효과: 리포 `dataset.fallback` 18개 파일, `placehold.co` 19개 파일(TeamMark 포함) | TeamLogo에 `source="real"`(A-9) 추가, TeamMark를 TeamLogo에 흡수(A-10), `size` 20px/56px는 custom |
| 2 | TeamSelectModal·TeamSetupModal을 Modal로 이행 | TeamSelectModal L91-104(헤더 14줄)+L149-171(푸터 23줄)+닫는 래퍼, TeamSetupModal L101-111(11줄)+L168-185(18줄) | 추정 약 45줄 - 호출/props 약 15줄 = 약 30줄. TeamSetup은 portal·z 문제도 함께 해소 | Modal에 zIndexClass, headerClassName/footerClassName/bodyClassName, subtitle, closeOnEsc, size xs 추가(A-5) |
| 3 | 사이드바 프로필 메뉴 → Dropdown | Sidebar L273-327(55줄 중 항목 4개 L291-323 약 30줄이 클래스 복제) | 약 26줄(항목 4개 30줄 → items 배열 4줄). 패널/위치 코드 L126-152(약 27줄, state 4개·핸들러)까지 흡수되면 추가로 약 20줄 | Dropdown placement(right-end bottom 앵커)·icon·divider·danger(A-6), 호버색 결정(slate-600→800) |
| 4 | 읽지 않음 카운트 배지 CountBadge | Sidebar L34-38, NavMenu L182-186, L263-267, TabBar L43-47 (각 5줄) | 20줄 - 호출 4줄 = 16줄. 리포 동일 클래스 패턴 6줄 | Badge `variant="count"`, 크기 2종(14px/16px) |
| 5 | MultiComingSoonView 삭제 또는 EmptyState로 대체 | MultiComingSoonView 전체 L1-20 | 20줄(삭제 시) | 사용처 0 확인(동적 import 포함, 추정) |
| 6 | 카운트다운 포매팅 중복 제거 | MultiHeader L178-190(13줄) → fmtRemaining 재사용 | 약 11줄. L404-417은 형식이 달라 옵션화 필요(추가 약 8줄 절감 가능) | fmtRemaining에 zeroText 인자 |
| 7 | NavMenu 탭 3블록 반복 제거 | NavMenu L221-271 중 "내 팀/전술/리그" 3블록(각 약 11~15줄) | 약 15줄(맵/컴포넌트 1개) | 없음(파일 내부 리팩터링). TabBar 변형 도입 시 추가 감소 |
| 8 | 헤더 주황 CTA 버튼 2개 합치기 | MultiHeader L488-493, L568-574 | 약 6줄(공유 상수/컴포넌트) | Button `variant="cta"`가 있으면 더 좋음(A-1) |
| 9 | TextInput/FormField | TeamSetupModal L133-153, ColorField L20·L29-37 | 약 8줄 감소 + 클래스 3중 복제 해소 | A-21 신규 |
| 10 | 오류 화면 버튼 → Button, 로딩/오류 화면 래퍼 공유 | LeagueBootstrapErrorScreen L30-36, L42-48 | 약 4줄 | Button flat/shape(A-1) |

효과 외 참고: 1번이 줄 수·확산 효과 모두 가장 크고(다른 화면군에도 같은 복제가 있음) 선행 조건이 TeamLogo prop 1개라 가장 위험이 낮다. 2·3번은 Modal/Dropdown API 확장이 선행돼야 하고 확장 시 기존 10곳/8곳 호출부 영향 확인이 필요하다.

### 체크리스트 대조 결과

| 구분 | 크롬 11개 | common 21개 | 합계 |
|---|---|---|---|
| 체크리스트 매치(행) 수 | 98 | 115 | 213 |
| 표에 반영(전수) | 98 | 115 | 213 |
| 오탐(주석 문구·컴포넌트 자기 정의·정상 사용) | 11 | 52 | 63 |
| 실제 근거/발견으로 반영 | 87 | 63 | 150 |

크롬 오탐 11행 내역: MultiHeader 2(L23 주석, L486 tabular), MultiSidebar 2(L95, L280), NavMenu 1(L25), LeagueLoadingScreen 1(L5), TeamSelectModal 3(L88, L88, L89), CourtPreview 2(L5, L14).
체크리스트에 없던 추가 발견 24건:
1. MultiHeader L422 sticky+relative 중복
2. MultiHeader L424 불투명 배경 위 backdrop-blur-[20px](비용 추정)
3. MultiHeader L178-190/L404-417 카운트다운 계산 2벌 중복
4. MultiHeader L488/L568 주황 CTA 버튼 클래스 복제
5. MultiHeader L472 `text-text-muted` 토큰 계열 불일치(추정)
6. MultiSidebar L29 `text-slate-700` 비활성 아이콘 대비(추정)
7. MultiSidebar NavItem aria-label/aria-current 없음
8. MultiSidebar L72 RosterIcon 배경 `#0F172A` 하드코딩
9. MultiSidebar L308 vs L316 구분선 투명도 불일치
10. 바깥 클릭 닫기 로직 4곳 복제(Sidebar/NavMenu/Search/Dropdown), Esc는 검색만
11. NavMenu L160 `DropdownPanel`을 렌더 안에서 정의(재마운트, 추정)
12. NavMenu 탭/드롭다운 aria-expanded·aria-haspopup 없음
13. NavMenu 배지 크기 8px/9px 혼재(같은 파일 L183, L264)
14. NavMenu `h-[39px]` 매직넘버
15. MultiGlobalSearch 결과 목록 키보드 이동(방향키/Enter) 없음
16. MultiGlobalSearch 드롭다운 위치가 EXPANDED_W에 결합
17. 로딩/오류 화면 `bg-gray-950`(리포 6곳, slate 469곳)
18. MultiComingSoonView 사용처 0건 및 `pretendard` 클래스 혼용
19. TeamSelectModal 백드롭 클릭·Esc 닫기 없음, z=9999가 토스트(600) 위
20. TeamSelectModal L132-134 중복 래퍼 div
21. TeamSetupModal portal 없음 + z-50(추정)
22. CourtPreview JSDoc 순서 뒤바뀜(L13-14) 및 색 하드코딩 2개
23. 공용 Button/Card/Badge/PageHeader 사용처 0~1건(사실상 미사용)
24. 공용 컴포넌트 간 z-index 역전: Dropdown·TeamSelectModal·부상 툴팁 9999 > Toast 600 > Modal 500 > HoverCard 200
