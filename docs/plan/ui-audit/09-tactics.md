# 09 전술 — UI 조각 전수 감사

읽은 범위(전부 Read, grep 대체 없음):
- views/multi/season/MultiTacticsView.tsx: 1~653줄 (전부)
- components/dashboard/DepthRotationBoard.tsx: 1~721줄 (전부)
- components/dashboard/RotationGanttChart.tsx: 1~693줄 (전부)
- components/dashboard/tactics/TacticsSlidersPanel.tsx: 1~210줄 (전부)
- components/dashboard/tactics/PlayerTacticsPanel.tsx: 1~258줄 (전부)
- components/dashboard/tactics/TacticsDataPanel.tsx: 1~77줄 (전부)
- components/dashboard/tactics/TacticalHalfCourt.tsx: 1~114줄 (전부)
- components/dashboard/tactics/PresetRenameModal.tsx: 1~46줄 (전부)
- components/dashboard/tactics/insights/TeamGameLogChart.tsx: 1~461줄 (전부)
- components/dashboard/tactics/insights/TeamZoneChartInsight.tsx: 1~267줄 (전부)
- components/dashboard/tactics/insights/TeamZoneStatsTable.tsx: 1~156줄 (전부)
- components/dashboard/tactics/insights/TeamLeadersCards.tsx: 1~134줄 (전부)
- components/dashboard/tactics/insights/TeamStatRankList.tsx: 1~103줄 (전부)
- components/dashboard/tactics/insights/PlayerStatsTable.tsx: 1~103줄 (전부)
- 공용 API(감사 대상 아님, 전부 읽음): Table.tsx(229), TabBar.tsx(55), Button.tsx(69), Badge.tsx(41), Card.tsx(45), Modal.tsx(136), Dropdown.tsx(147), SliderControl.tsx(164), SliderGroupNotes.tsx(67), TeamLogo.tsx(46), OvrBadge.tsx(146), InjuryStatusBadge.tsx(94), PlayerHoverCard.tsx(344)
- 기계 추출 체크리스트: scratchpad/ui-audit/by_file/ 14개 파일 (총 245행) 전부 대조

## 0. 먼저 알아둘 공용 API 제약 (대체 가능성 판단의 근거)

| 공용 | 대체 시 걸림돌 (코드에서 확인한 사실) |
|---|---|
| Button | base가 `rounded-2xl` 고정(L27)이고 tailwind-merge/clsx가 package.json에 없음 → `className`으로 `rounded-lg`/`rounded-l-lg`를 덧붙여도 CSS 선언 순서에 따라 결과가 불확정(추정). `secondary`는 `bg-slate-800 border border-slate-700`(L41)이라 로컬 `bg-slate-700 hover:bg-slate-600`과 색이 다름. base에 `uppercase tracking-widest`가 남아 있음(메모리 feedback_button_typography와 상충 가능, 확인 필요). `brand`는 emerald-600이라 저장 버튼의 `#10b981`(emerald-500)과 다름. |
| Table | 래퍼가 `bg-slate-900 border rounded-xl shadow-lg overflow-auto`(L73) 고정 → 보드형(경계 없는) 용도엔 `!rounded-none !border-x-0 ...` 오버라이드가 필요(PlayerTacticsPanel L108이 실제로 그렇게 씀). TableHead 기본 행 `text-xs font-black uppercase tracking-widest h-10`(L83), TableHeaderCell `py-3 px-1.5`(L131), TableCell `py-2 px-3 border-b border-slate-800/50`(L225), TableRow `hover:bg-white/5`(L105). stickyLeft는 `left-0` 고정이며 left 오프셋은 `style`로만 가능. 그룹 말단 굵은 구분선·rowSpan·드롭 타깃 행 같은 보드 전용 요구는 지원 안 함. |
| Dropdown | 포털 + `fixed` + `z-[9999]` + `border-slate-800`(L94), 항목 `px-3 py-2.5 text-xs font-bold`(L109). 항목 `label`은 ReactNode라 서브 라인/배지 삽입은 가능하나, 항목별 className·danger 톤·크기 변형 prop은 없음. 앵커 오른쪽 정렬 기본(`align='right'`). |
| Modal | 제목 영역이 `text-xl font-bold text-white`(L99)로 이미 스타일링됨 → 호출부가 `<h3 text-lg font-black uppercase>`를 또 씌우면 이중 스타일(PresetRenameModal L16). 확인/취소 전용 ConfirmDialog 없음 → `window.confirm` 3곳 사용 중. |
| TabBar | 페이지 최상단 `px-8 h-14` 전용. 카드 내부 페이저(`< 공격 >`)나 소형 세그먼트로는 부적합. |
| OvrBadge | `size='sm'`가 이미 `w-6 h-6`(L93), 폰트만 바꾸려면 `textClassName` prop이 이미 있음(L21). 그림자는 Tailwind가 아니라 inline `boxShadow`(L125)라 `shadow-none`/`!shadow-none` 클래스는 효과 없음(no-op). |
| SliderGroupNotes | 제목 문구 "각 슬라이더의 역할 설명"이 하드코딩(L55), category/label/text 3필드 고정. |
| 없는 공용 | SplitButton, IconButton, Input, Select, Toggle/Segmented, Spinner, EmptyState, InsightCard(섹션 카드), AlertBanner, PlayerNameLink, ConfirmDialog, Tooltip. Skeleton.tsx(공용)는 있으나 이 화면군에서 미사용. |

---

## views/multi/season/MultiTacticsView.tsx (653줄) — 멀티 사용 여부: 사용 (진입점)

import 추적: `DepthRotationBoard`(L9), `TacticsSlidersPanel`(L10), `PlayerTacticsPanel`(L11), 인사이트 6종(L12~17)을 직접 import. 탭은 depth/team/insights/player 4개이나 TabBar 항목은 3개만 노출(L517~523, 개인 전술 탭 숨김 — `?tab=player` 딥링크로만 L638~646 도달).

### 공용 컴포넌트 사용 현황
- TabBar (L516~554, `rightSlot`에 저장 영역 주입) — 사용.
- Button / Badge / Card / Modal / Table / Dropdown / Skeleton — 미사용.

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| M1 | 506~512 | spinner | 전체 화면 로딩 `min-h-screen bg-slate-950` + `Loader2 size=28 animate-spin text-indigo-400` | 신규 Spinner/LoadingScreen | `Spinner size` + `fullScreen` | 이 화면의 스피너 3종 중 하나(28). Skeleton 공용은 미사용 |
| M2 | 528~530 | 기타(상태 텍스트) | `text-xs text-amber-400 ko-normal` 미저장 안내 | (Badge variant=warning 가능) | Badge 'warning'은 pill+uppercase라 문구 길이엔 부적합 → 인라인 텍스트 유지 가능 | 낮은 우선순위 |
| M3 | 531~551 | button | 저장 버튼: `flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-black uppercase transition-all`. 비활성 `bg-slate-800 text-slate-600 cursor-not-allowed`, 활성은 인라인 style `backgroundColor:'#10b981', color:'#fff', boxShadow:'0 0 12px rgba(16,185,129,0.5)'`(L539~543), 내용 3분기(저장 중/저장됨/저장) | Button (variant=brand, size=sm, isLoading, loadingText, icon) | Button에 `rounded` 변경 수단 + 글로우 variant(예: brand glow) + disabled 톤 통일. `#10b981`(emerald-500)과 brand(emerald-600) 색 차이 정리 필요 | 인라인 style 하드코딩 hex 3개. 비활성 표현(색 변경)이 Button의 `opacity-50`과 다름 |
| M4 | 546 | spinner | 버튼 내부 `Loader2 size=13 animate-spin` | Button isLoading(Loader2 w-3 h-3, L58) | 위 M3 대체 시 자동 | M3에 포함 |
| M5 | 585~588 | spinner | 인사이트 로딩: `flex items-center justify-center py-10` + `Loader2 size=20 animate-spin text-indigo-400` | 신규 Spinner | `Spinner size`/`padding` | 스피너 크기 20 |
| M6 | 592~595 | spinner | 인사이트 하위 로딩: `py-20` + `Loader2 size=24` | 신규 Spinner | 동일 | 스피너 크기 24 — 같은 탭 안 로더 2개가 크기·여백 다름 |
| M7 | 567, 577, 639 | 기타(페이지 컨테이너) | 팀 전술 `p-8 pb-20 bg-slate-900`, 인사이트 `p-8 pb-20 flex flex-col gap-4`, 개인 `pb-20` | (PageHeader류 컨테이너 공용 없음) | 신규 TabPanel 래퍼(선택) | 배경색이 탭마다 다름(팀 전술만 `bg-slate-900`) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| `Loader2 animate-spin text-indigo-400` 로더(크기 28/20/24/13) | 509, 546, 587, 594 | 4줄(래퍼 포함 시 13줄: 506~512, 586~588, 593~595) |
| `p-8 pb-20` 탭 패널 패딩 | 567, 577 | 2줄 |

### 체크리스트 대조(6행 → 반영 5, 오탐 1)
344(empty_state)=오탐(주석 "isFinal 필터 없음"). 509→M1, 531→M3, 546→M4, 587→M5, 594→M6.

---

## components/dashboard/DepthRotationBoard.tsx (721줄) — 멀티 사용 여부: 사용 (MultiTacticsView L557, 뎁스 탭)

### 공용 컴포넌트 사용 현황
- Dropdown (L145~199, `PlayerSlotDropdown`) — 사용. isOpen/onOpenChange 제어 모드 + children 커스텀 패널.
- InjuryStatusBadge (L157, L193) — 사용.
- OvrBadge (L190, L638) — 사용하나 `!w-6 !h-6 !text-xs !shadow-none` 오버라이드 동반(추가 발견 A4).
- 미사용: Button, Table(직접 `<table>`), Modal(확인에 `window.confirm` L421), Badge, Card.
- GanttBar/computeStints/Stint/DragState는 RotationGanttChart.tsx에서 import(L10).

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| D1a | 151~171 | dropdown(trigger) | 셀 전체를 채우는 트리거 `relative w-full h-full flex items-center gap-1.5 pl-3 pr-8 text-sm font-semibold hover:bg-white/5`, ChevronDown 절대배치(L165~169) | DropdownButton(공용)은 테두리 박스형이라 부적합 | Dropdown `trigger`는 이미 ReactNode라 유지 가능. 셀 인라인용 `DropdownButton variant="cell"` 신설하면 공용화 | 현재도 Dropdown 사용 중이라 제거 이득 작음 |
| D1b | 174~180 | button(옵션-제거) | `w-full text-left px-2.5 py-1.5 rounded-lg text-sm font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20` | Dropdown `items` | items에 `tone:'danger'` 또는 항목 className | Dropdown 기본 항목 스타일은 `text-xs font-bold px-3 py-2.5`라 크기가 다름 |
| D1c | 181~197 | button(옵션-선수) | `w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-semibold` + 선택 `bg-indigo-600/10 text-indigo-400` / 비선택 `text-slate-300 hover:bg-slate-800 hover:text-white`, 내부 OvrBadge(L190)+이름+InjuryStatusBadge+포지션 | Dropdown `items`(label=ReactNode, active) | items 항목 크기 variant(`sm`) | `active` 색(`bg-indigo-600/10 text-indigo-400`)은 Dropdown과 동일. 17줄 |
| D2 | 477~479 | section-header | 툴바 `px-6 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between`, 제목 `text-base font-black text-white uppercase` | PageHeader? (미확인) | 신규 PanelToolbar | RGC L451(`border-t`까지 있음)·L452(`tracking-widest` 있음)와 불일치 |
| D3 | 480~501 | split-button | **"AI 위임" 분할 버튼 #1(포지션)**: 래퍼 `relative flex shadow-md`+ref(L480), 메인 `px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-l-lg text-sm font-bold uppercase active:scale-95 border-r border-indigo-700/50`(L481~486, 라벨 `coachName ? "{이름}에게 포지션 위임" : "포지션 자동 배정"`), 쉐브론 `px-2 py-1.5 ... rounded-r-lg`(L487~492), 팝업 `absolute top-full right-0 mt-2 w-36 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100] animate-in fade-in zoom-in-95`(L494), 항목 2개 한 줄 버튼(L496~497) | 신규 SplitButton(+Dropdown) | `SplitButton{label,onMain,items:[{id,label,sub?,onClick}],variant,size,align}`; Button에 radius 제어 prop(`rounded-l`/`rounded-r` 또는 `segment` 위치 prop) | 22줄. 공용 Dropdown(포털 `z-[9999]`)을 안 쓰고 로컬 absolute 팝업 `z-[100]`을 새로 구현 |
| D4 | 503~528 | split-button | **분할 버튼 #2(출전시간)**: 구조 동일, 팝업 `w-48`(L517), 항목 map(L519~524)에 `label`+서브 `text-sm text-slate-500 font-normal`(L522) | 신규 SplitButton | 위와 동일 + 항목 `sub` | 26줄. D3과 98% 동일(폭 w-36/w-48, 항목 구성만 다름) |
| D5 | 530~536 | button | **초기화 버튼**: `flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-sm font-bold uppercase shadow-sm active:scale-95` + `RotateCcw size=14` | Button (variant=secondary, size=xs/sm, icon) | Button `secondary` 색(slate-800 vs 로컬 slate-700)·radius 정합 | 7줄. RGC L488/L499, PTP L94와 같은 계열이나 클래스가 3가지로 갈림 |
| D6 | 216~217, 221~222, 234~241 | 기타(바깥 클릭 닫기 인프라) | 열림 state 2개 + ref 2개 + `document.addEventListener('mousedown', ...)` 핸들러 | Dropdown 내장(L70~83) | SplitButton/Dropdown 사용 시 불필요 | 12줄(D3/D4 전용 인프라) |
| D7 | 542~552 | table | `<table className="border-separate border-spacing-0 w-full" style={{minWidth:'960px', tableLayout:'fixed'}}>` + colgroup 8열(폭 56/40/28/200/40/자동/40/54) | Table (bare variant) | Table에 `bare`(radius/border/shadow 없음) + `tableStyle`(이미 있음) + colgroup 지원 | 래퍼 `flex-1 min-h-0 overflow-auto`(L541)가 Table 래퍼 `overflow-auto custom-scrollbar`와 역할 중복 |
| D8 | 553~568 | th | thead `bg-slate-950 sticky top-0 z-50`, tr `text-sm font-black text-slate-500 uppercase tracking-tighter`(L554), th 6개: L555(슬롯, colSpan2, `sticky left-0 z-50`), L556(선수, `left-[96px]`), L557(OVR, `left-[324px]`), L558(쿼터 4분할 헤더 `border-l border-r border-t border-b`), L565(시간), L566(초기화) — 모두 `py-3 ... border-b border-slate-800` | TableHead(noRow) + TableHeaderCell(width, stickyLeft, style) | TableHeaderCell에 `stickyLeft={number}`(left 오프셋) 또는 style 위임. `py-3` 기본값 호환 | **헤더 글자 `text-sm tracking-tighter`가 TableHead 기본 `text-xs tracking-widest`와 다름**(불일치표 참조) |
| D9 | 591~602 | row-hover | tr `group h-9 transition-colors` + 드롭 타깃 `bg-indigo-500/10` / 기본 `hover:bg-white/[0.03]` + onDragOver/onDrop | TableRow | TableRow가 `hover:bg-white/5`를 강제(L105) → 오버라이드 가능한 `hoverClass` prop | hover 불투명도 3종 중 하나(추가 발견 A21) |
| D10 | 603~607 | td | 그룹 라벨 셀 `rowSpan=5 sticky left-0 z-30 bg-slate-800 text-center align-middle ${SB} border-b-2 border-b-slate-700` | TableCell(stickyLeft, rowSpan 통과) | stickyLeft 기본 `z-30`(L177)은 호환. border 색 side-지정 prop 필요 | |
| D11 | 608~610 | td | 포지션 셀 `sticky left-[56px] z-30 bg-slate-900 text-center align-middle ${SB} ${groupEndBorder}` | TableCell | sticky offset prop | |
| D12 | 614~624 | td + 드래그핸들 | `sticky left-[96px] z-30 ...` + `<div draggable ... cursor-grab text-slate-600 hover:text-slate-300>` + GripVertical | TableCell + (신규 DragHandle) | DragHandle 신규(선택) | 이 화면 전용 기능, 공용화 이득 작음 |
| D13 | 627~633 | td | `sticky left-[124px] z-30 ... !p-0` (`!` 강제 오버라이드) | TableCell | `padding='none'` prop | `!p-0` — 공용 padding 변형 필요 신호 |
| D14 | 635~641 | td + OVR | `sticky left-[324px] z-30 ...` + `<OvrBadge value size="sm" className="!w-6 !h-6 !text-xs !shadow-none" />`(L638) | TableCell variant="ovr"(L211) 또는 OvrBadge `textClassName="text-xs"` | `!w-6 !h-6`는 sm에서 이미 w-6 h-6(중복), `!shadow-none`은 no-op(A4) | `ovrMap` L436~440(+L472 sort)는 `calculatePlayerOvr` 사용 |
| D15 | 643~657 | td | `p-0 h-9 ${groupEndBorder}` + GanttBar(readOnly 분기, flat* 3개 prop) | TableCell | `padding='none'` | GanttBar는 RGC 소유 |
| D16 | 659~663 | td | 분 합계 `text-sm font-semibold ${getMinColor(...)}`(L459~465 임계값 42/34/20) | TableCell variant="stat" | 색 규칙 외부화 | getMinColor가 RGC L435~441과 복제(A8) |
| D17 | 665~671 | td + icon button | 슬롯 초기화 `<button ... title=...><RotateCcw size=12 className="text-slate-400 hover:text-red-400"/></button>` | 신규 IconButton | `IconButton{icon,onClick,title,tone}` | aria-label 없이 title만(A19). RGC L628~635와 동일 패턴 |
| D18 | 587~588 | divider | `groupEndBorder = isGroupEnd ? 'border-b-2 border-b-slate-700' : 'border-b border-b-slate-800/50'`, 주석(L581~586)에 Tailwind side 색 충돌 함정 서술 | Table(그룹 구분선 지원) | `TableRow groupEnd` / 셀 border 토큰 prop | 함정 주석이 공용화 필요성의 증거 |
| D19 | 467~469 | 기타(토큰 상수) | `SH='bg-slate-950'`, `SK='bg-slate-900'`, `SB='border-r border-slate-800'` | Table 토큰 | — | RGC L444~446과 복제 |
| D20 | 680~706 | empty/banner | 검증 배너: 위반 시 `bg-red-500/10 border-t border-red-500/20 px-6 py-2 flex flex-col gap-1`+행 3종(L682~699, `AlertCircle size=16` + `text-sm font-bold text-red-400/orange-400/red-500`), 정상 시 `bg-emerald-500/10 ... CheckCircle2`(L702~705) | 신규 AlertBanner | `AlertBanner{tone:'danger'/'warning'/'success', items}` | 27줄. RGC L661~673은 글자 `text-[10px]`로 다름(불일치) |
| D21 | 420~421 | modal | `window.confirm('뎁스 차트와 로테이션을 전부 초기화하시겠습니까?')` | Modal | 신규 ConfirmDialog | RGC L396, L405과 같은 패턴(A5) |
| D22 | 26~30, 82~117 | 기타(로직 중복) | ROTATION_OPTIONS / computeRotationMap | — | RGC와 공유 모듈로 추출 | UI 아님이나 두 화면 동시 수정 위험(A8) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 인디고 분할 버튼(메인+쉐브론+팝업) | 480~501, 503~528 | 22+26=48줄 |
| 분할 버튼 바깥 클릭 인프라 | 216~217, 221~222, 234~241 | 12줄 |
| 팝업 컨테이너 `absolute top-full right-0 mt-2 ... bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100]` | 494, 517 | 2줄 |
| 팝업 항목 `w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800` | 496, 497, 520 | 3줄 |
| 쉐브론 회전 `transition-transform duration-200 ${open ? 'rotate-180' : ''}` | 168, 491, 514 | 3줄 |
| 슬롯 td `${SK} text-center align-middle ${groupEndBorder}` | 608, 614, 635, 659, 665 | 5줄 |
| sticky 셀 `sticky left-[Npx] z-30` | 604, 608, 614, 627, 635 | 5줄 |
| `RotateCcw` 초기화(버튼/아이콘) | 534, 668 | 2줄 |
| `calculatePlayerOvr(` 호출 | 190, 345(×2), 438, 472(×2) | 6줄 |
| `AlertCircle size=16 shrink-0` 배너 행 | 684, 690, 696 | 3줄 |

### 체크리스트 대조(81행 → 반영 70, 오탐 11)
- 오탐 11행: 35 empty_state(주석), 135 select_raw(주석 속 `<select>` 언급), 582 td_raw(주석), 584 divider_v(주석), 704 empty_state(성공 배너 문구 "위반 사항 없음", 빈 상태 아님→D20), 345 ovr_calc×2(정렬 비교), 472 ovr_calc×2(정렬 비교), 588 tab_underline(탭 아님, 그룹 구분선), 604 tab_underline(동일).
- 반영: 152→D1a, 174→D1b, 182·187·190(important_ovr, ovr_calc)→D1c, 438→D14, 469→D19, 477→D2, 481·487·494(card_box, zindex)·496(row_hover, button_raw)·497(동)→D3, 504·510·517(card_box, zindex)·520(row_hover, button_raw)→D4, 530·532→D5, 542→D7, 553(zindex, sticky)·555·556·557·558·565·566(th_raw/divider_b/zindex/sticky)→D8, 588 divider_b×2→D18, 593→D9, 604(divider_b, td_raw, zindex, sticky)→D10, 608→D11, 614→D12, 627→D13, 635→D14, 638 important_ovr→D14, 643→D15, 659→D16, 665·667→D17.

---

## components/dashboard/RotationGanttChart.tsx (693줄) — 멀티 사용 여부: 부분 사용

- MultiTacticsView는 이 파일의 `GanttBar`, `computeStints`, `Stint`, `DragState`만 DepthRotationBoard(L10) 경유로 사용. **`RotationGanttChart` 컴포넌트 본체는 MultiTacticsView에서 미사용.**
- 본체의 import처: `views/multi/league/settings/TeamTacticsTab.tsx`(L27, L366 — 멀티 어드민 편집), `components/dashboard/RotationManager.tsx`, `views/LiveGameView.tsx`, `pages/QuickPlayPage.tsx`(싱글/라이브 경로로 추정, 파일 위치 기준).
- 아래 표의 R1은 멀티(뎁스 탭) 사용 영역, R2~R16은 어드민 편집(멀티 설정) 및 싱글 경로 영역.

### 공용 컴포넌트 사용 현황
- OvrBadge (L605) — `!w-6 !h-6 !text-xs !shadow-none` 오버라이드 동반.
- 미사용: Button, Table, Dropdown, Modal, Badge, InjuryStatusBadge.

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| R1 | 63~195 | 기타(간트 바) | GanttBar: 쿼터 배경 `bg-slate-900/60`(L97), 격자선(L117~118/L121~129), stint 블록 `bg-emerald-500/40 border-emerald-500/60` / 무효 `bg-red-500/30 border-red-500/50`(L136~140), 현재분 `bg-amber-400 z-10`(L159), 잠금 `bg-slate-950/50 z-[5]`(L151), 드래그 프리뷰 `bg-white/15 border-white/25` | (해당 공용 없음) | 도메인 전용 컴포넌트 — 유지. `flatGridLines/flatQuarterBg/sharpStintCorners` 3개 boolean이 DRB 전용 룩이라 `variant="board"` 하나로 합칠 수 있음(추정) | 멀티 사용. 133줄 |
| R2 | 451~454 | section-header | 툴바 `px-6 py-3 bg-slate-800 border-t border-slate-700 border-b border-slate-700 flex ...`, 제목 `text-base font-black text-white uppercase tracking-widest` | 신규 PanelToolbar | D2와 동일 컴포넌트 | DRB D2에는 `border-t`·`tracking-widest` 없음 |
| R3 | 458~487 | split-button | **"AI 위임" 분할 버튼**: 메인 `px-3 py-1.5 bg-indigo-600 ... rounded-l-lg text-xs font-bold uppercase tracking-wider active:scale-95 border-r border-indigo-700/50`(L461), 라벨 `coachName ? "{이름}에게 위임" : "코치에게 위임"`, 쉐브론(L465~470), 팝업 `w-48 ... z-[100]`(L472), 항목 `text-xs font-bold`(L478) + 서브 `text-[9px]`(L481) | 신규 SplitButton | D3/D4와 동일 | 30줄. DRB 대비 글자 `text-xs`(DRB `text-sm`), `tracking-wider`(DRB 없음), 서브 `text-[9px]`(DRB `text-sm`) |
| R4 | 488~494 | button | 초기화 `... bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm active:scale-95` | Button secondary | D5와 동일 | 7줄. DRB D5 대비 `text-xs tracking-wider` |
| R5 | 498~506 | button | 라이브 모드 "남은 분 초기화" — R4와 클래스 동일 | Button secondary | 동일 | 7줄 |
| R6 | 510~523 | empty/banner | 라이브 상태 배너 `px-6 py-2 border-b` + readOnly 분기 `bg-slate-800/50 border-slate-700/40` / `bg-emerald-900/30 border-emerald-700/40`, 텍스트 `text-xs font-semibold` | AlertBanner | tone 'info'/'success' | 14줄 |
| R7 | 527~566 | table + th | `<table ... style={{minWidth:'960px'}}>`, thead `${SH} sticky top-0 z-50`, th 7개: L531~535(5개, rowSpan=2, `sticky left-0/50/210/250/305 z-50`), L537(쿼터 라벨), L552(분 눈금) | Table(bare) + TableHeaderCell | D7/D8과 동일 | D8과 폭·offset이 다름(50/160/40/55/40 vs 96/228/40) |
| R8 | 581 | row-hover | `hover:bg-white/[0.03] group h-9 border-b border-slate-800/50` | TableRow | `hoverClass` | |
| R9 | 584~590 | td + badge | 포지션 rowSpan 셀 + `text-[10px] font-bold tracking-widest text-slate-500` | TableCell | — | 임의 px 폰트(A10) |
| R10 | 593~600 | td | 선수명 `text-xs font-semibold truncate` + 클릭 `onViewPlayer` | TableCell variant="player" | `onClick` 지원됨(L188) | PlayerHoverCard 미적용(멀티 어드민 경로) |
| R11 | 603~607 | td + OVR | `<OvrBadge ... className="!w-6 !h-6 !text-xs !shadow-none"/>` | TableCell variant="ovr" / OvrBadge `textClassName` | A4 | 289: `calculatePlayerOvr`로 ovrMap |
| R12 | 610~621 | td | 체력 `text-xs font-mono font-semibold` + 임계색(`cond<70 red-500, <90 amber-500, else emerald-500`, L612) | TableCell variant="attribute"(색 로직 prop) | 색 임계 prop | L615~619 주석 처리된 코드 블록(A16) |
| R13 | 624~637 | td + icon button | 분 합계 + hover 시 초기화 아이콘 교체(`opacity-0 group-hover:opacity-100`), `RotateCcw size=12` | 신규 IconButton | D17과 동일 | |
| R14 | 640~651 | td | `p-0 h-9 border-b border-slate-800/50` + GanttBar | TableCell | `padding='none'` | |
| R15 | 661~673 | banner | 검증 배너 `bg-red-500/10 border-t border-red-500/20 px-6 py-2 flex flex-wrap gap-4`, 글자 `text-[10px] font-bold` | AlertBanner | D20과 동일 | DRB는 `text-sm`, 여기는 `text-[10px]` |
| R16 | 435~446, 200~204, 228~257, 396, 405 | 기타 | getMinColor, ALLOCATION_OPTIONS, 바깥 클릭 인프라(10줄), `window.confirm` 2곳 | — | — | DRB와 중복(A8) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 인디고 분할 버튼 | 458~487 | 30줄 |
| 분할 버튼 인프라 | 228~229, 250~257 | 10줄 |
| 회색 초기화 버튼(동일 클래스) | 488~494, 499~505 | 14줄 |
| sticky th/td 위치 하드코딩 `left-[50px]/[210px]/[250px]/[305px]` | 532~535, 594, 603, 610, 624 | 8줄 |
| `border-b border-slate-800/50` td | 594, 603, 610, 624, 640 | 5줄 |
| 검증/ stint 색 상수 `emerald-500/40`, `red-500/30` | 138~139 | 2줄 |

### 체크리스트 대조(81행 → 반영 76, 오탐 5)
- 오탐 5행: 52 empty_state(주석), 93 empty_state(주석 연속줄), 444 sticky·445 sticky(코드 뒤 `// sticky header bg` 주석 문구에 매치), 616 badge_inline(L615~619 주석 처리된 코드 안).
- 반영: 151·159→R1, 289→R11, 446→R16, 451(divider_b, divider_t)→R2, 459·461·465·472(card_box, zindex)·475·478→R3, 488·490→R4, 499·501→R5, 527·528(zindex, sticky)·531~535(th_raw, divider_b, zindex, sticky)·537·552→R7, 581→R8, 584·586·588→R9, 593·594→R10, 603·605→R11, 610→R12, 624·628→R13, 640→R14, 665·668·671→R15.

---

## components/dashboard/tactics/TacticsSlidersPanel.tsx (210줄) — 멀티 사용 여부: 사용 (MultiTacticsView L568~573, `offenseDefenseSplit`)

- split 분기(L43~120)만 MultiTacticsView에서 도달. 비-split 분기(L122~208)는 `views/multi/league/settings/TeamTacticsTab.tsx`(L369)·`TacticsBoard.tsx`에서 도달하며 TacticsDataPanel을 끌고 옴.

### 공용 컴포넌트 사용 현황
- SliderControl — 사용. **SliderControl 블록 수는 총 15개 × 2벌 = 30개**(요청서의 "14개"와 다름: 공격 철학 5 + 슈팅 전략 3 + 온볼 수비 4 + 오프볼 수비 3 = 15). 한 블록은 2줄.
- SliderGroupNotes — 사용. notes 15개 × 2벌.
- 체크리스트 매치 0건이지만 **중복이 이 파일의 핵심 문제**(아래 추가 발견 A1~A3).

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| S1 | 52~74, 76~96 | slider(블록 2열) | **split 판 슬라이더 컬럼 2개**: 컬럼 래퍼 `flex flex-col gap-2 lg:pr-6 lg:border-r lg:border-slate-800`(L52, L76), SliderControl 15개(L54~63, 68~73, 78~85, 90~95; zoneFreq는 L92에서 `updateSlider('zoneFreq'); updateSlider('zoneUsage')` 이중 호출) | SliderControl 반복 → 설정 배열 map | 신규 `SLIDER_GROUPS` 설정(그룹 제목/key/label/steps) + `<SliderGroupColumn>` | 44줄(23+21) |
| S2 | 138~160, 163~183 | slider(블록 2열) | **비-split 판 슬라이더 컬럼 2개**: S1과 SliderControl 15개 동일(L140~182), 래퍼만 `flex flex-col gap-2`(border 없음) | 동일 | 동일 | 44줄(23+21). S1과의 차이는 래퍼 클래스 2줄뿐 |
| S3 | 101~117 | 기타(설명 테이블) | SliderGroupNotes notes 15개 (긴 한국어 문장 포함) | SliderGroupNotes | 설정 배열에서 파생 | 17줄. 내용 완전 동일 |
| S4 | 187~203 | 기타(설명 테이블) | S3와 동일 복제 | 동일 | 동일 | 17줄 |
| S5 | 53, 67, 77, 89, 139, 153, 164, 176 | section-header | `<h4 className="text-base font-black text-white uppercase tracking-widest">` ×8 | 신규 SectionTitle | 헤더 공용(D2/R2/TGLC와 함께) | 8줄 |
| S6 | 65, 87, 151, 174 | divider | `<div className="h-px bg-slate-700 my-4" />` ×4 | 신규 Divider | — | 4줄 |
| S7 | 13~17 | 기타(상수) | `PNR_STEPS`를 파일 로컬 정의(다른 슬라이더는 SLIDER_STEPS 사용) | SLIDER_STEPS로 이동 | — | 5줄 |
| S8 | 51 | 기타(그리드) | `grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(0,4fr)_minmax(0,2fr)] gap-8` | — | — | 주석 L46~50에 fr 함정 서술 |
| S9 | 123, 133, 136 | 기타(그리드) | 비-split `lg:grid-cols-12`, `lg:col-span-7 lg:pr-6 lg:border-r`, `grid grid-cols-2 gap-x-6` | — | — | |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| **SliderControl 15개 블록 × 2벌** | split L54~95(8+7블록), 비-split L140~182 | 각 15블록=30줄(+그룹 구조 포함 컬럼 44줄) × 2 = 88줄 |
| **SliderGroupNotes notes 15개 × 2벌** | L101~117, L187~203 | 17 + 17 = 34줄 |
| h4 섹션 제목 | 53, 67, 77, 89, 139, 153, 164, 176 | 8줄 |
| `h-px bg-slate-700 my-4` | 65, 87, 151, 174 | 4줄 |
| 컬럼 래퍼 `flex flex-col gap-2 (lg:pr-6 lg:border-r lg:border-slate-800)` | 52, 76, 138, 163 | 4줄 |

### 체크리스트 대조(0행 → 반영 0, 오탐 0)
체크리스트 매치 0건(공용 컴포넌트만 사용하므로). 위 S1~S9와 추가 발견 A1~A3은 모두 추가 발견.

---

## components/dashboard/tactics/PlayerTacticsPanel.tsx (258줄) — 멀티 사용 여부: 사용 (도달 제한적)

- MultiTacticsView L638~646에서 렌더되나 **개인 전술 탭이 TabBar에서 숨김**(L521~522) → `?tab=player` 딥링크로만 도달(추가 발견 A20). 멀티 어드민 `TeamTacticsTab.tsx` L372, 싱글 `TacticsBoard.tsx`도 사용.

### 공용 컴포넌트 사용 현황
- Table, TableHead(noRow), TableBody, TableRow, TableHeaderCell, TableCell — 사용 (이 화면군에서 공용 Table을 쓰는 유일한 파일).
- OvrBadge (L150) — 사용(오버라이드 없이 `size="sm"` → 폰트 10px).

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| P1 | 92~105 | section-header + button | 액션 바 `flex items-center gap-3 px-8 py-3 border-b border-slate-800`, "전원 초기화" `px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-bold transition-colors` + `RotateCcw size=12`(L94~101), 힌트 텍스트 `text-xs text-slate-500` + `<span text-indigo-400>`(L102~104) | Button secondary | D5/R4와 같은 부류이나 `hover:text-white`·`active:scale-95`·`uppercase` 없음 | 초기화 버튼 4번째 변형 |
| P2 | 108 | table | `<Table fullHeight={false} className="!rounded-none !border-x-0 !border-t-0 !shadow-none">` | Table `bare` variant | 오버라이드 4개(`!`) 제거 | 공용 Table의 래퍼 스타일이 맞지 않는다는 증거 |
| P3 | 109~125 | th | `<TableHead noRow>` + 수동 `<tr className="text-slate-500 text-xs font-black uppercase tracking-widest h-10">`(L110) — TableHead 기본 tr 클래스(Table L83)와 **완전 동일**, 서브라벨 `text-slate-600 font-normal text-[10px] normal-case tracking-normal`(L115, L119) | TableHead(기본) | `noRow` 불필요(헤더 2줄 셀만 필요하면 TableHeaderCell `subLabel` prop) | 임의 px 폰트 |
| P4 | 143 | td | 포지션 라벨 `text-[10px] font-black text-slate-500 tracking-widest uppercase` | TableCell | — | 임의 px 폰트 |
| P5 | 148~155 | td | 선수 셀: `OvrBadge size=sm` + 이름 `text-xs text-slate-200 font-medium truncate max-w-[160px]` | TableCell variant="player" | `leading` 슬롯(OvrBadge) | variant="player"는 `font-bold`라 굵기 다름. DRB/RGC는 OVR 폰트 12px인데 여기는 10px(불일치) |
| P6 | 70~75, 160~172, 180~192 | input | 숫자 입력 2개: `w-14 bg-slate-950 border rounded px-1.5 py-1 text-xs text-center focus:outline-none`, 값 변경 시 `border-indigo-500 text-white` / 기본 `border-slate-700 text-slate-400` | 신규 Input | `Input{type,highlighted,size}` | 각 13줄 |
| P7 | 77~82, 199~235 | select | select 3개: `bg-slate-950 border rounded px-1.5 py-1 text-xs ... cursor-pointer`, 변경 하이라이트 동일 팔레트 | 신규 Select | `Select{options,highlighted}` | L199~207(9줄), L212~221(10줄), L226~235(10줄) |
| P8 | 245~254 | empty/legend | 하단 범례 `px-8 py-4 border-t border-slate-800` + grid `grid-cols-2 gap-x-8 gap-y-1 text-[11px] text-slate-500` ×6 라벨 `text-slate-400 font-semibold` | SliderGroupNotes(제목 prop 추가 시) | `title` prop, category 생략 모드 | 임의 px 폰트 `text-[11px]` |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 변경 하이라이트 `border-indigo-500 text-white` vs `border-slate-700 text-slate-400` | 72~74, 79~81 | 6줄(input/select 클래스 헬퍼 2벌) |
| `<select>` 3개(옵션 구조 동일) | 199~207, 212~221, 226~235 | 29줄 |
| `<input type=number>` 2개 | 160~172, 180~192 | 26줄 |
| 범례 항목 `<div><span class="text-slate-400 font-semibold">…` | 247~252 | 6줄 |

### 체크리스트 대조(12행 → 반영 12, 오탐 0)
92→P1, 94·96→P1, 110→P3, 131(ovr_calc)→P5, 143→P4, 160·180→P6, 199·212·226→P7, 245→P8.

---

## components/dashboard/tactics/TacticsDataPanel.tsx (77줄) — 멀티 사용 여부: MultiTacticsView에서는 미사용 (멀티 어드민 경로만)

- 유일한 importer는 TacticsSlidersPanel(L4). MultiTacticsView는 `offenseDefenseSplit`로 early return(TacticsSlidersPanel L43)하므로 도달 불가. 멀티 `TeamTacticsTab.tsx`(비-split 호출) 경유 시에만 렌더.

### 공용 컴포넌트 사용 현황
- 없음(RadarChart/TeamZoneChart/PlayTypePPP는 이번 감사 대상 외 차트).

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| T1 | 28~29 | divider | 섹션 `flex flex-col gap-2 pb-5 border-b border-slate-800` | 신규 Divider/Section | — | |
| T2 | 32, 36 | section-header | `<h5 className="... text-sm font-black text-slate-300 uppercase tracking-widest">` ×2 | 신규 SectionTitle | — | 같은 화면군의 h4 제목(`text-base text-white`)과 색·크기 다름 |
| T3 | 37~48 | toggle | "우리 팀 / 상대" 스위치: `<button>` + `w-8 h-[18px] rounded-full bg-slate-700` 트랙 + 노브 `w-3 h-3 rounded-full ${showOpponentZone ? 'left-[17px]' : 'left-[3px]'} bg-emerald-400` + 좌우 라벨 `text-[10px] font-bold uppercase tracking-wider` (활성 `text-emerald-400`) | 신규 Toggle/Segmented | `Toggle{leftLabel,rightLabel,value,onChange}` | 노브 색 삼항 양쪽이 동일 `bg-emerald-400`(L44, A18). 10줄 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 라벨 `text-[10px] font-bold uppercase tracking-wider` + 활성색 삼항 | 42, 46 | 2줄 |
| h5 섹션 제목 | 32, 36 | 2줄 |

### 체크리스트 대조(6행 → 반영 6, 오탐 0)
29→T1, 38→T3, 42(header_text, badge_inline)→T3(라벨), 46(header_text, badge_inline)→T3(라벨). header_text/badge_inline 분류는 실제로는 토글 라벨(재분류, 유효).

---

## components/dashboard/tactics/TacticalHalfCourt.tsx (114줄) — 멀티 사용 여부: **어디서도 미사용 (import 0건)**

grep 확인: `from '.../TacticalHalfCourt'` 형태의 import가 저장소 전체에 0건(문서 `docs/project-overview.md` L274와 인벤토리에만 언급). 데드 코드로 추정.

### 공용 컴포넌트 사용 현황
- 없음.

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약 | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| H1 | 32~37 | badge(스탯 칩) | `absolute ... bg-slate-800 border border-slate-600 backdrop-blur-sm rounded-lg px-2.5 py-1.5 min-w-[60px]`, 라벨 `text-[9px] font-bold`, 값 `text-lg font-black font-mono` | 해당 없음(미사용) | — | `backdrop-blur-sm`(메모리: 블러는 스크롤 렉 원인) |
| H2 | 83 | card | `w-full aspect-[435/403] bg-slate-950 border border-slate-800 rounded-2xl` | Card | — | |
| H3 | 80 | empty | "주전 정보 없음" `text-slate-500 text-xs` | EmptyState | — | |
| H4 | 14~30 | 기타(색 규칙) | `getStatColor` 6단계(90/85/80/75/70) + `getStatHex` 6단계 hex | — | — | Table.getAttrColor(4단계), utils/attrRatingColor와 또 다른 임계값(A13) |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| CourtStatItem 인스턴스 | 97~100, 104~107 | 8줄 |

### 체크리스트 대조(4행 → 반영 4, 오탐 0)
33→H1, 34→H1, 80→H3, 83→H2. (모두 유효하나 파일 자체가 미사용 → 삭제 후보, 추가 발견 A15)

---

## components/dashboard/tactics/PresetRenameModal.tsx (46줄) — 멀티 사용 여부: **미사용 (싱글 전용)**

- 유일한 importer는 `components/dashboard/TacticsBoard.tsx`이고 TacticsBoard는 `pages/TacticsPage.tsx`(`/tactics`)·`pages/QuickPlayPage.tsx`에서만 import → 멀티 라우트와 무관.

### 공용 컴포넌트 사용 현황
- Modal (L26~32, `size="sm"`, title/footer 주입) — 사용.

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| N1 | 16 | section-header | `<h3 className="text-lg font-black text-white uppercase tracking-tight">` | Modal `title`(문자열) | 문자열 title만 전달 | Modal 헤더가 이미 `text-xl font-bold text-white`(Modal L99) → 이중 스타일 |
| N2 | 18~23 | button | 취소 `px-4 py-2 text-xs font-bold text-slate-400 hover:text-white`(ghost 형), 확인 `px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider` | Button (ghost / primary, size=sm) | Modal footer 버튼 규약 | 확인은 Button primary와 색 동일(+ring/shadow 차이) |
| N3 | 34~41 | input | `w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-indigo-500` | 신규 Input | P6과 하나의 Input으로 통합(size 변형) | PTP 입력(`bg-slate-950`, `rounded`, `px-1.5`)과 완전히 다른 룩 |

### 파일 내 반복 패턴
(없음 — 46줄)

### 체크리스트 대조(5행 → 반영 5, 오탐 0)
20→N2, 21(header_text, button_raw)→N2, 34→N3, 38(card_box)→N3 (입력 박스를 card_box로 분류했으나 실제론 input).

---

## components/dashboard/tactics/insights/TeamGameLogChart.tsx (461줄) — 멀티 사용 여부: 사용 (MultiTacticsView L579, 인사이트 최상단)

### 공용 컴포넌트 사용 현황
- 없음 (공용 import 0).

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| G1 | 407~414 | empty | 빈 상태 카드 `w-full bg-slate-900/40 border border-slate-800 p-6 text-center text-sm text-slate-500` "아직 시즌 일정이 없습니다." | 신규 EmptyState/InsightCard | `EmptyState{message,padding}` | 패딩 `p-6` |
| G2 | 431~434 | card + section-header | 카드 `w-full bg-slate-900/40 border border-slate-800 overflow-hidden`, 헤더 `px-3 py-2 border-b border-slate-800`, **h4 `text-sm font-black text-white uppercase tracking-widest`** | 신규 InsightCard | `InsightCard{title,headerRight,children}` | 형제 카드들의 h4는 `font-normal` — 이 카드만 `font-black`(불일치) |
| G3 | 435 | 기타 | 차트 영역 배경 `p-4 bg-slate-700/25` | InsightCard 본문 슬롯 | — | L300 히스토그램도 `bg-slate-700/25 p-2` |
| G4 | 381~402 | table | SplitStatsTable: `inline-block bg-slate-900/40 border border-slate-700`, `grid grid-cols-[repeat(4,auto)]`, 헤더 셀 4개(L384~387) `bg-slate-700/50 px-3 py-2 border-b border-slate-700 text-sm font-bold text-slate-300 uppercase tracking-wider`, 본문 셀 4개/행(L393~396) `px-3 py-2.5 border-l border-slate-700 text-sm font-normal text-white tabular-nums` | Table (compact variant) | 6행×4열 데이터 표 — Table + `compact`/`flat` variant, 첫 열 라벨 색 | 22줄. 헤더 `font-bold`(형제는 `font-normal`) |
| G5 | 184~199 | 기타(툴팁) | `fixed z-50 pointer-events-none bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 shadow-lg`, 내부 구분선 `border-t border-slate-700 my-1`(L194) | 신규 Tooltip | `Tooltip` 공용(포털+커서 추적) | InjuryStatusBadge L85(`bg-slate-900 border-slate-600 rounded-lg z-[9999]`), SliderControl L138(hex)과 3종 불일치 |
| G6 | 201~208 | divider | 쿼터/라운드 경계 점선 `border-l border-dashed border-slate-800` | — | 차트 도형이라 공용화 불필요 | |
| G7 | 150, 211 | 기타(차트 축) | 기준선/하단 축 `absolute ... border-t border-slate-700/600` | — | 차트 도형 | 체크리스트의 divider_t는 오탐 |
| G8 | 273~356 | 기타(차트) | HistogramChart: 컨테이너 `flex-1 min-w-[220px] bg-slate-700/25 p-2`, 축 눈금 숫자 `text-xs text-slate-400 tabular-nums`(L330, L340), 제목 `text-sm font-bold text-slate-200` | — | 차트 도형 | 도메인 전용 |
| G9 | 438~440 | empty | `p-6 text-center text-sm text-slate-500` "아직 완료된 경기가 없습니다." | EmptyState | G1과 동일 | 같은 메시지가 TLC/PST에도 있음(패딩만 다름) |
| G10 | 92~97 | 기타(색 토큰) | `INDIGO_MIN '#312e81'`, `INDIGO_MAX '#6366f1'`, `WIN_COLOR '#10b981'`, `LOSS_COLOR '#ef4444'` | 색 토큰 | — | A13 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 카드 `bg-slate-900/40 border border-slate-800` | 410, 431 (+L382 border-slate-700 변형) | 3줄 |
| 빈 상태 `text-center text-sm text-slate-500` | 410~413, 439 | 5줄 |
| `px-3 py-2(.5) border-slate-700` 표 셀 | 384~387, 393~396 | 8줄 |
| `tabular-nums` | 195, 196, 330, 340, 394~396 | 7줄 |
| 헤더 바 `px-3 py-2 border-b border-slate-800` | 432 | 1줄(+3줄 h4 포함) |

### 체크리스트 대조(19행 → 반영 17, 오탐 2)
- 오탐 2행: 150 divider_t, 211 divider_t(차트 축 선, UI 구분선 아님 → G7).
- 반영: 189→G5, 194→G5, 195·196(tabular)→G5(툴팁 안 숫자), 330·340→G8, 382→G4, 384·390·394·395·396→G4, 410(card_box)·411(empty)→G1, 431·432→G2, 439→G9.

---

## components/dashboard/tactics/insights/TeamZoneChartInsight.tsx (267줄) — 멀티 사용 여부: 사용 (MultiTacticsView L629)

### 공용 컴포넌트 사용 현황
- 없음.

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약 | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| Z1 | 131~133 | card | 외곽 `relative w-full h-full bg-slate-950 overflow-hidden` + **인라인 `style={{border:'1px solid #334155'}}`**(L132) | InsightCard(헤더 없는 variant) | `InsightCard{noHeader}` | 형제 카드는 `border-slate-800` 클래스 — 이 카드만 hex 인라인(#334155=slate-700). 또한 제목 헤더 없음 |
| Z2 | 244~262 | 기타(범례) | 우측 범례: `+10%…-10%` 5단 눈금 `text-sm font-bold text-white/90 tabular-nums`, 그라데이션 바 인라인 style | — | 차트 부속 | |
| Z3 | 11~13, 258 | 기타(색 토큰) | `ZONE_MIN_COLOR '#ff0000'`, `ZONE_MID_COLOR '#fff000'`, `ZONE_MAX_COLOR '#37ff00'` | — | — | A13 |
| Z4 | 138~236 | 기타(SVG 차트) | 존 히트맵 SVG | — | 도메인 전용 | |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 라벨 텍스트 14px 3줄 | 203, 206, 210 | 3줄 |

### 체크리스트 대조(2행 → 반영 1, 오탐 1)
9(empty_state)=오탐(주석). 246(tabular)→Z2.

---

## components/dashboard/tactics/insights/TeamZoneStatsTable.tsx (156줄) — 멀티 사용 여부: 사용 (MultiTacticsView L632)

### 공용 컴포넌트 사용 현황
- PlayerHoverCard (L115, L133) — 사용.
- 미사용: Table(flex-div로 표 구현).

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| Y1 | 81 | card | `w-full bg-slate-900/40 border border-slate-800 overflow-hidden` | InsightCard | | |
| Y2 | 82~84 | section-header | `px-3 py-2 border-b border-slate-800` + h4 `text-sm font-normal text-white uppercase tracking-widest` | InsightCard title | | G2와 `font-normal`/`font-black` 불일치 |
| Y3 | 85~93 | th | 컬럼 헤더 행 `flex items-center gap-3 px-3 py-2 bg-slate-700/50 border-b border-slate-700`, span 5개 `text-sm font-normal text-slate-300 uppercase tracking-wider text-left flex-1` + **빈 spacer span 2개(L90, L92)** | Table + TableHeaderCell(colSpan) | Table `compact` variant, `colSpan` | 값 열 정렬용 빈 슬롯(A12) |
| Y4 | 94~151 | table | 본문 행 10개: `flex items-center gap-3 px-3 py-2.5 ${i%2===1?'bg-slate-700/25':''} ${i<rows.length-1?'border-b border-slate-800/60':''}` + 셀 span들 | Table, TableRow, TableCell | zebra prop, `compact` | 57줄 |
| Y5 | 113~148 | 기타(리더 셀 2벌) | countLeader 블록(L113~130)과 pctLeader 블록(L131~148)이 값 포맷만 다른 복제. 이름 span `text-sm font-normal text-white text-left truncate hover:text-indigo-400 cursor-pointer transition-colors` + PlayerHoverCard | 신규 PlayerNameLink | A6/통합 후보 | 각 18줄 |
| Y6 | 97 | 기타(색) | `diff>0 ? 'text-emerald-400' : diff<0 ? 'text-red-400' : 'text-slate-500'` | — | 공용 diffColor 유틸 | TSRL L90과 동일 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 리더 셀(이름 링크 + 값) | 113~130, 131~148 | 18+18=36줄 |
| 플레이어 이름 span (`hover:text-indigo-400 cursor-pointer`) | 117~119, 135~137 | 6줄 |
| `-` 빈 셀 | 126~128, 144~146 | 6줄 |
| `text-sm font-normal text-white tabular-nums text-left ${VALUE_CLS}` | 104, 107 | 2줄 |

### 체크리스트 대조(8행 → 반영 8, 오탐 0)
81→Y1, 82→Y2, 85→Y3, 101→Y4, 104·107·123·141(tabular)→Y4/Y5.

---

## components/dashboard/tactics/insights/TeamLeadersCards.tsx (134줄) — 멀티 사용 여부: 사용 (MultiTacticsView L598)

### 공용 컴포넌트 사용 현황
- PlayerHoverCard (L100, L117) — 사용.

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| C1 | 85~91 | empty | `w-full bg-slate-900/40 border border-slate-800 p-4 text-center text-sm text-slate-500` "아직 완료된 경기가 없습니다." | EmptyState | `padding` | G9(`p-6`), PST L71(`px-3 py-6`)와 패딩 3종 |
| C2 | 94 | 기타(그리드) | `grid grid-cols-2 sm:grid-cols-3 gap-3` | — | — | |
| C3 | 96 | card | 카드 `bg-slate-900/40 border border-slate-800 overflow-hidden flex flex-col` | InsightCard | | |
| C4 | 98~112 | card(헤더) | 상단 영역 `bg-slate-800 px-3 py-2`, 라벨 `text-sm font-normal text-slate-300 uppercase tracking-wider`, 값/순위 `text-lg font-normal text-white tabular-nums`(L109, L110) | InsightCard | | |
| C5 | 114~128 | 기타(리스트) | TOP5 `flex flex-col gap-0.5 px-3 py-1.5` + 행 `flex items-center justify-between gap-2` | — | | |
| C6 | 100~107, 117~124 | 기타(이름 링크) | PlayerHoverCard + span `text-sm font-normal text-slate-200/slate-400 truncate hover:text-indigo-400 cursor-pointer transition-colors` | 신규 PlayerNameLink | | 2벌 각 8줄 |
| C7 | 25~28 | 기타(포맷) | `formatValue` 로컬 복제 | 공용 포맷 유틸 | | TSRL L15, PST L39과 동일 계열 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 이름 링크(PlayerHoverCard+span) | 100~107, 117~124 | 16줄 |
| `text-sm font-normal` 텍스트 | 99, 102, 119, 125 | 4줄 |
| `tabular-nums` | 109, 110, 125 | 3줄 |

### 체크리스트 대조(6행 → 반영 6, 오탐 0)
87·88→C1, 96→C3, 109·110→C4, 125→C5.

---

## components/dashboard/tactics/insights/TeamStatRankList.tsx (103줄) — 멀티 사용 여부: 사용 (MultiTacticsView L613)

### 공용 컴포넌트 사용 현황
- 없음.

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| K1 | 54 | card | `w-full bg-slate-900/40 border border-slate-800 overflow-hidden` | InsightCard | | |
| K2 | 55~69 | section-header(페이저) | `flex items-center justify-between px-3 py-2 border-b border-slate-800` + 쉐브론 버튼 2개 `text-slate-500 hover:text-white transition-colors`(L58, L62, `aria-label` 있음) + h4 `text-sm font-normal text-white uppercase tracking-widest` | InsightCard `headerRight`/pager | 신규 `Pager{labels,index,onChange}` | 단일 페이지 분기(L66~68)는 h4 중복 |
| K3 | 70~75 | th | `flex items-center gap-3 px-3 py-2 bg-slate-700/50 border-b border-slate-700` + span 4개 `text-sm font-normal text-slate-300 uppercase tracking-wider flex-1/flex-[2] text-left/right` | Table | | |
| K4 | 76~98 | table | 행 `flex items-center gap-3 px-3 py-2.5 zebra border-b border-slate-800/60`, 셀 `tabular-nums text-right` | Table | | 22줄 |
| K5 | 28~32 | 기타(색 규칙) | `rankColor` ≤5 fuchsia / ≤10 emerald / 그 외 blue | — | 공용 색 규칙 | Table.getAttrColor(L65~70), TacticalHalfCourt 등과 임계값 상이(A13) |
| K6 | 88~92 | 기타(색) | IIFE로 diff 색 계산 | — | diffColor 유틸 | TZST L97 중복 |
| K7 | 15~25 | 기타(포맷) | `formatValue`/`formatDiff` | — | 포맷 유틸 | TLC·PST와 복제 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 컬럼 헤더 span `text-sm font-normal text-slate-300 uppercase tracking-wider` | 71~74 | 4줄 |
| 쉐브론 버튼 | 58~60, 62~64 | 6줄 |
| h4 제목(페이저/단일 분기 중복) | 61, 67 | 2줄 |
| `tabular-nums flex-1 text-right` | 83, 86, 94 | 3줄 |

### 체크리스트 대조(10행 → 반영 9, 오탐 1)
40(empty_state)=오탐(주석 "최대폭 제한은 없음"). 54→K1, 55→K2, 58·62→K2, 70→K3, 80→K4, 83·86·94(tabular)→K4.

---

## components/dashboard/tactics/insights/PlayerStatsTable.tsx (103줄) — 멀티 사용 여부: 사용 (MultiTacticsView L604)

### 공용 컴포넌트 사용 현황
- PlayerHoverCard (L81) — 사용.
- 미사용: Table(flex-div로 표 구현), OvrBadge.

### 직접 구현 UI 조각
| ID | 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|---|
| Q1 | 56 | card | `w-full bg-slate-900/40 border border-slate-800 overflow-hidden` | InsightCard | | |
| Q2 | 57~59 | section-header | `px-3 py-2 border-b border-slate-800` + h4 `font-normal` | InsightCard title | | |
| Q3 | 60~68 | th | `flex items-center gap-2 px-3 py-2 bg-slate-700/50 border-b border-slate-700` + 이름 `w-28 shrink-0`, POS `w-9 shrink-0 text-center`, 11개 `flex-1 text-right` | Table + TableHeaderCell | `compact` | 컬럼 13개 |
| Q4 | 70~72 | empty | `px-3 py-6 text-center text-sm text-slate-500` "아직 완료된 경기가 없습니다." | EmptyState | | 패딩 변형 |
| Q5 | 73~97 | table | 행 `flex items-center gap-2 px-3 py-2.5 zebra ${isLast ? '' : 'border-b border-slate-800/60'}` | Table | | 25줄 |
| Q6 | 81~88 | 기타(이름 링크) | PlayerHoverCard + span `w-28 shrink-0 ... hover:text-indigo-400` | PlayerNameLink | | |
| Q7 | 39~42 | 기타(포맷) | `formatValue` | 포맷 유틸 | | |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 컬럼 정의 11개 (헤더·본문 양쪽에서 `COLUMNS.map`) | 63~67, 90~94 | 10줄 |
| `text-sm font-normal` 텍스트 | 58, 61~65, 83, 89, 91 | 약 7줄 |

### 체크리스트 대조(5행 → 반영 5, 오탐 0)
56→Q1, 57→Q2, 60→Q3, 71→Q4, 79→Q5.

---

# 화면군 종합

## 불일치 대조표

| 항목 | 변형 A | 변형 B | 변형 C 이상 | 근거(파일:라인) |
|---|---|---|---|---|
| 패널/섹션 제목 | `text-base font-black text-white uppercase` (DRB L478) | `text-base font-black text-white uppercase tracking-widest` (RGC L452, TSP L53 등 ×8) | `text-sm font-black text-white uppercase tracking-widest` (TGLC L433) / `text-sm font-normal text-white uppercase tracking-widest` (TSRL L61·67, PST L58, TZST L83) / `text-sm font-black text-slate-300 uppercase tracking-widest` (TDP L32·36) | font-black 대 font-normal이 같은 인사이트 탭 안에서 섞임 |
| 컬럼 헤더 글자 | 공용 TableHead `text-xs font-black uppercase tracking-widest text-slate-500` (Table L83) | `text-sm font-black text-slate-500 uppercase tracking-tighter` (DRB L554) / `text-xs ... tracking-tighter` (RGC L530) | `text-sm font-normal text-slate-300 uppercase tracking-wider` (TSRL L71~74, PST L61~65, TZST L86~92) / `font-bold`(TGLC L385) | 헤더 배경도 `bg-slate-950`(Table/DRB/RGC) 대 `bg-slate-700/50`(인사이트 3종) |
| 인디고 메인 버튼 | `text-sm font-bold uppercase` (DRB L483) | `text-xs font-bold uppercase tracking-wider` (RGC L461) | 공용 Button primary(rounded-2xl, ring) / PRM 확인 `rounded-xl text-xs font-black uppercase tracking-wider` (L21) | |
| 회색 초기화 버튼 | DRB L532 `text-sm ... hover:text-white active:scale-95 shadow-sm uppercase` | RGC L490/L501 `text-xs ... uppercase tracking-wider` | PTP L96 `text-xs font-bold transition-colors`(hover:text-white/active/uppercase 없음) / 공용 Button secondary(`bg-slate-800`, rounded-2xl) | 같은 "초기화" 기능이 4가지 룩 |
| 저장(강조) 버튼 | MTV L531 인라인 `#10b981` + glow + `rounded-lg text-sm font-black` | 공용 Button brand(emerald-600, rounded-2xl) | — | 인라인 hex 3개(L540~542) |
| 팝업 메뉴 | 로컬 absolute `bg-slate-900 border-slate-700 rounded-xl z-[100]` (DRB L494·517, RGC L472) | 공용 Dropdown 포털 `border-slate-800 rounded-xl z-[9999]` (Dropdown L94) | PlayerSlotDropdown 항목 `px-2.5 py-1.5 text-sm font-semibold` (DRB L186) vs 로컬 메뉴 항목 `px-3 py-2.5 text-sm font-bold`(L496) vs 공용 항목 `px-3 py-2.5 text-xs font-bold`(Dropdown L109) | 테두리 색 700/800, z-index 100/9999, 항목 크기 3종 |
| 툴팁 | TGLC L189 `fixed z-50 bg-slate-800 border-slate-700 rounded px-2.5 py-1.5 text-xs` | InjuryStatusBadge L85 `bg-slate-900 border-slate-600 rounded-lg px-2 py-1 text-xs z-[9999]` | SliderControl L138 `bg-[#27272A] border-[#3F3F46] text-[#A1A1AA]`(hex) | 3종 |
| 스피너 | MTV L509 size 28 | MTV L587 size 20 / L594 size 24 | MTV L546 size 13(버튼 내) / 공용 Button isLoading w-3 h-3~w-4 h-4 | 모두 `text-indigo-400` 계열, 크기·여백만 상이 |
| 빈 상태 | TGLC G1 `p-6` "시즌 일정이 없습니다" | TGLC L439 `p-6` / TLC L87 `p-4` / PST L71 `px-3 py-6` "완료된 경기가 없습니다" | THC L80 `text-xs` "주전 정보 없음" | 같은 메시지 3곳, 패딩 3종 |
| 카드/컨테이너 radius | 인사이트 카드 radius 없음(직각) `bg-slate-900/40 border border-slate-800` | 공용 Table 래퍼 `rounded-xl bg-slate-900` (Table L73) | 공용 Card `rounded-3xl` / THC L83 `rounded-2xl` / Modal `rounded-[2rem]` | 한 화면 안 직각 카드와 둥근 버튼/드롭다운 혼재 |
| 카드 외곽선 | 클래스 `border-slate-800` (TSRL L54 등 6곳) | 인라인 `style={{border:'1px solid #334155'}}` (TZCI L132) | TGLC L382 `border-slate-700` | |
| OVR 배지 | DRB L190·L638, RGC L605 `!w-6 !h-6 !text-xs !shadow-none`(폰트 12px) | PTP L150 `size="sm"` 기본(10px) | 공용 Table variant=ovr `size="sm" className="shadow-none"`(Table L212) | `!shadow-none`은 no-op, `!w-6 !h-6`는 sm과 중복 |
| 행 hover | 공용 TableRow `hover:bg-white/5` (Table L105), DRB L152 `hover:bg-white/5` | DRB L593·RGC L581 `hover:bg-white/[0.03]` | Dropdown 항목 `hover:bg-slate-800`(L112), DRB 옵션 `hover:bg-slate-800` | 불투명도 3종 |
| 좌우 패딩 | MTV 패널 `p-8`(32px), TabBar `px-8`, PTP 액션바 `px-8` | DRB 툴바·배너 `px-6`(24px) (L477, L681, L702), RGC `px-6` | 인사이트 카드 내부 `px-3` | 뎁스 탭만 좌측선이 TabBar와 8px 어긋남(추정: 시각 확인 필요) |
| 임의 px 폰트 | `text-[9px]` (RGC L481, THC L34) | `text-[10px]` (RGC L588·665·668·671, PTP L115·119·143, TDP L42·46) | `text-[11px]` (PTP L246) | Tailwind 스케일 밖 |
| 확인 대화상자 | `window.confirm` (DRB L421, RGC L396·L405) | 공용 Modal(PRM) | — | ConfirmDialog 없음 |
| 숫자 포맷 유틸 | `formatValue` TSRL L15 | `formatValue` TLC L25 | `formatValue` PST L39 | 3벌 복제 |
| 색 임계 규칙 | Table.getAttrColor 90/80/70 (4단계) | TSRL rankColor 5/10 (3단계) | THC getStatColor 90/85/80/75/70 (6단계), 체력색 RGC L612 (70/90) | |

## 통합 후보(효과 큰 순)

줄 수는 해당 라인 범위를 Read로 직접 센 값. "순감"은 호출부 잔여 줄(추정)을 뺀 값이라 추정.

| 순위 | 후보 | 대상 라인 | 제거되는 줄 수 | 선행 조건 |
|---|---|---|---|---|
| 1 | **TacticsSlidersPanel 슬라이더 2벌 + 설명 2벌 제거** (SLIDER_GROUPS 설정 + 공용 컬럼/노트 파생) | TSP L52~74, L76~96, L138~160, L163~183 (컬럼 4개 = 23+21+23+21 = 88줄), L101~117·L187~203 (노트 17+17 = 34줄) | 1벌 제거 시 61줄(44+17), 설정 기반으로 15블록 30줄도 map화하면 추가 약 15줄 → **약 76줄(추정)**. 노트까지 단일 소스화하면 총 122줄 중 약 76줄 순감 | 설정 객체 설계(그룹/key/label/steps/note), zoneFreq 이중 update 확인(A2), PNR_STEPS를 SLIDER_STEPS로 이동 |
| 2 | **분할 버튼(AI 위임) SplitButton 신설** | DRB L480~501(22), L503~528(26); RGC L458~487(30) + 인프라 DRB L216~217·221~222·234~241(12), RGC L228~229·250~257(10) | 대상 100줄, 호출부 3곳 잔여 약 21줄(추정) → **약 79줄 순감(추정)**. 공용 신규 컴포넌트 +약 40줄 | Button에 radius 제어 prop(tailwind-merge 부재로 className 덮어쓰기 불가), Dropdown 기반 팝업 z-index 정책 확정(100 대 9999), 라벨 `coachName` 분기는 호출부 유지 |
| 3 | **InsightCard + EmptyState 신설** (컨테이너/헤더/빈 상태) | 카드 컨테이너 TGLC L410, L431; TSRL L54; PST L56; TZST L81; TLC L87, L96 (7곳 × 열고닫기 2줄 = 14줄); 헤더 바 TGLC L432~434, PST L57~59, TZST L82~84 (9줄) + TSRL L55~69 (15줄); 빈 상태 TGLC L410~413(4), L439(1), TLC L85~91(7), PST L70~72(3) | 대상 약 53줄, 호출부 잔여 약 20줄 → **약 33줄 순감(추정)**. 패딩/제목 굵기 불일치 해소 효과가 더 큼 | 제목 굵기(font-black 대 normal) 확정, 직각/둥근 radius 결정, Z1(TZCI 인라인 border) 정리 |
| 4 | **초기화 버튼 → Button secondary** | DRB L530~536(7), RGC L488~494(7), L499~505(7), PTP L94~101(8) | 대상 29줄, 호출부 잔여 약 12줄 → **약 17줄 순감(추정)** | Button secondary 색(slate-800 대 slate-700)·radius·`uppercase tracking-widest` 정책 정리 |
| 5 | **PlayerNameLink 컴포넌트** (PlayerHoverCard + 클릭 이름 span) | TLC L100~107, L117~124; TZST L115~122, L133~140; PST L81~88 (5곳 × 8줄) | 대상 40줄, 호출부 잔여 5줄 → **약 35줄 순감** | 이름 색(slate-200/400/white) 통일 결정 |
| 6 | **flex-div 표 3종 → 공용 Table** | TSRL L70~98(29), PST L60~97(38), TZST L85~151(67) | 대상 134줄, 잔여 약 60줄(추정) → **약 74줄 순감(추정)**, 위험 중간 | Table `compact`/`flat` variant(zebra, 헤더 `bg-slate-700/50`, 직각, 래퍼 border 없음), TableHeaderCell `colSpan`/빈 헤더 |
| 7 | **AlertBanner (검증 배너)** | DRB L680~706(27), RGC L661~673(13) | 대상 40줄, 잔여 약 15줄 → **약 25줄 순감(추정)** | tone(danger/warning/success) 정의, 글자 크기 통일(text-sm 대 text-[10px]) |
| 8 | **Input/Select 공용화** | PTP L70~82(13) + L160~172·L180~192(26) + L199~235(29); PRM L34~41(8) | 대상 76줄, 잔여 약 35줄(추정) → **약 41줄 순감(추정)** | `highlighted` 변형 포함한 Input/Select 설계(PTP 소형 대 PRM 대형 size) |
| 9 | **저장 버튼 → Button** | MTV L531~551 | 21줄 → 약 8줄 = **약 13줄 순감(추정)** | Button brand 글로우 variant, rounded-lg 옵션, 비활성 톤 정책, emerald-500 대 600 색 차이 결정 |
| 10 | **Spinner 공용** | MTV L506~512(7), L586~588(3), L593~595(3) | 13줄 → 3곳 1줄씩 = **약 10줄 순감** (저장소 전체 spinner 52사이트 효과는 별도) | Spinner `size`/`fullScreen`/`padding` prop |
| 11 | **데드 코드 삭제** | TacticalHalfCourt.tsx 전체 114줄(import 0건), RGC L615~619 주석 코드 5줄 | **119줄** | 삭제 전 `docs/project-overview.md` L274 목록 갱신, 의도적 보관 여부 사용자 확인 |
| 12 | **DRB/RGC 로직 중복 모듈화** | getMinColor DRB L459~465 = RGC L435~441 (7줄), computeRotationMap DRB L82~117 = RGC L358~393 (36줄), 옵션 DRB L26~30 = RGC L200~204 (5줄), validation DRB L442~457 = RGC L312~327 (16줄) | **약 64줄(추정, 한쪽만 제거)** — UI 조각은 아니나 동시 수정 위험 | 공유 모듈 위치 결정(`utils/rotation*.ts`), RGC 라이브 모드 clamp 로직(L267~272)은 별도 |
| 13 | **Toggle 컴포넌트** | TDP L37~48 | 약 10줄 → 1줄 | 멀티 어드민 경로만 사용이라 우선순위 낮음 |
| 14 | **OvrBadge 오버라이드 정리** | DRB L190, L638; RGC L605 | 3줄 수정(제거 줄 수 0, 일관성 효과) | `textClassName="text-xs"` 적용, `!w-6 !h-6 !shadow-none` 제거 |

## 체크리스트 대조 결과

| 파일 | 체크리스트 행 | 반영 | 오탐 | 오탐 라인 |
|---|---|---|---|---|
| MultiTacticsView.tsx | 6 | 5 | 1 | 344 |
| DepthRotationBoard.tsx | 81 | 70 | 11 | 35, 135, 582, 584, 704, 345×2, 472×2, 588(tab_underline), 604(tab_underline) |
| RotationGanttChart.tsx | 81 | 76 | 5 | 52, 93, 444, 445, 616 |
| TacticsSlidersPanel.tsx | 0 | 0 | 0 | — |
| PlayerTacticsPanel.tsx | 12 | 12 | 0 | — |
| TacticsDataPanel.tsx | 6 | 6 | 0 | — |
| TacticalHalfCourt.tsx | 4 | 4 | 0 | — |
| PresetRenameModal.tsx | 5 | 5 | 0 | — |
| TeamGameLogChart.tsx | 19 | 17 | 2 | 150, 211 |
| TeamZoneChartInsight.tsx | 2 | 1 | 1 | 9 |
| TeamZoneStatsTable.tsx | 8 | 8 | 0 | — |
| TeamLeadersCards.tsx | 6 | 6 | 0 | — |
| TeamStatRankList.tsx | 10 | 9 | 1 | 40 |
| PlayerStatsTable.tsx | 5 | 5 | 0 | — |
| **합계** | **245** | **224** | **21** | |

- **매치 수 245 / 반영 수 224 / 오탐 수 21 / 추가 발견 수 21**
- 오탐 유형: 주석 속 단어 매치 12행(DRB 35·135·582·584, RGC 52·93·444·445·616, MTV 344, TSRL 40, TZCI 9), 정렬 비교용 ovr_calc 4행(DRB 345×2, 472×2), 분류 오류 5행(DRB 588·604 tab_underline, DRB 704 성공 배너, TGLC 150·211 차트 축선).
- 재분류했으나 유효로 인정: TDP 42·46(header_text/badge_inline이지만 실제로는 토글 라벨), PRM 38(card_box지만 입력 박스).

### 추가 발견 21건 (체크리스트에 없던 항목)

| # | 내용 | 라인 |
|---|---|---|
| A1 | TacticsSlidersPanel SliderControl 15블록(공격 8 + 수비 7)이 split/비-split에서 2벌 복제, SliderGroupNotes notes 15개도 2벌 복제 (요청서의 "14개"가 아니라 15개로 확인) | TSP L54~95 대 L140~182, L101~117 대 L187~203 |
| A2 | 지역 방어 슬라이더 `onChange`가 `updateSlider('zoneFreq', v); updateSlider('zoneUsage', v);`를 연속 호출 — 두 호출 모두 렌더 시점의 같은 `sliders`/`tactics` 클로저를 기반으로 `onUpdateTactics`를 부르므로 첫 호출 결과가 두 번째에 덮어써질 가능성(추정, 상위 setState 구현 확인 필요) | TSP L92, L179 |
| A3 | h4 섹션 제목 8회, 구분선 `h-px bg-slate-700 my-4` 4회 반복, 비-split 쪽은 래퍼에서 `lg:border-r`만 빠진 동일 구조 | TSP L53·67·77·89·139·153·164·176, L65·87·151·174 |
| A4 | OvrBadge 오버라이드 `!w-6 !h-6 !text-xs !shadow-none`: `size="sm"`가 이미 w-6 h-6, `!shadow-none`은 OvrBadge가 inline boxShadow를 써서 no-op, 폰트만 필요하면 `textClassName="text-xs"` 사용 가능. 반면 PTP는 오버라이드 없이 10px | DRB L190·L638, RGC L605, PTP L150, Table L212 |
| A5 | `window.confirm` 3곳(Modal 공용 존재) | DRB L421, RGC L396·L405 |
| A6 | PlayerHoverCard+클릭 이름 span 패턴이 5곳 복제 (색: slate-200/slate-400/white 혼재) | TLC L100·L117, TZST L115·L133, PST L81 |
| A7 | 간트 표의 sticky left 오프셋과 폭이 colgroup, th `w-[]`, td `left-[]`에 3중 하드코딩 (DRB: colgroup 56/40/28/200/40 대 th 96/228/40, td left 56/96/124/324) | DRB L543~552, L555~557, L604~635; RGC L531~535, L586~624 |
| A8 | DRB와 RGC의 로직 중복: getMinColor(7줄), computeRotationMap/handleAllocation(36줄), 옵션 상수(5줄), validation useMemo(16줄), EMPTY_48/`Array(48).fill(false)` | DRB L459~465·L82~117·L26~30·L442~457, RGC L435~441·L358~393·L200~204·L312~327 |
| A9 | PTP: `<TableHead noRow>` 안 수동 `<tr>`의 클래스가 TableHead 기본 tr과 완전 동일(noRow 불필요), Table에 `!rounded-none !border-x-0 !border-t-0 !shadow-none` 4개 강제 오버라이드 | PTP L108, L109~110 |
| A10 | Tailwind 스케일 밖 임의 px 폰트 산재 (9px 2곳, 10px 8곳, 11px 1곳) | RGC L481·L588·L665·L668·L671, THC L34, PTP L115·L119·L143·L246, TDP L42·L46 |
| A11 | TeamZoneChartInsight만 카드 제목 헤더가 없고 외곽선이 인라인 hex `1px solid #334155` | TZCI L132 |
| A12 | TeamZoneStatsTable 컬럼 헤더 정렬 맞추려고 빈 `<span className={VALUE_CLS}/>` 2개 삽입 (Table colSpan이면 불필요) | TZST L90, L92 |
| A13 | 색 토큰/임계 규칙이 파일마다 분산: hex(TGLC L92~97, TZCI L11~13, THC L24~29, MTV L540~542), 등급 색 규칙 4종(Table getAttrColor, TSRL rankColor, THC getStatColor, RGC 체력색 L612) | 좌동 |
| A14 | PlayerStatsTable 13컬럼(이름 w-28 + POS w-9 + 11 flex-1)이 `flex-[7]` 영역 안에서 `overflow-hidden`뿐이고 가로 스크롤 처리 없음 → 좁은 화면에서 잘림 가능(추정, 렌더 미확인) | PST L56, L60~68, MTV L591 |
| A15 | TacticalHalfCourt.tsx 전체가 어디서도 import되지 않음(데드 파일 추정, 114줄) | THC 전체 |
| A16 | RotationGanttChart 체력 델타 표시가 주석 처리된 JSX 블록으로 남아 있음 | RGC L615~619 |
| A17 | 로딩 표현이 풀스크린 스피너/인라인 스피너 2종으로 제각각이고 공용 Skeleton은 이 화면군에서 미사용 | MTV L506~512, L586~588, L593~595 |
| A18 | 토글 노브 색 삼항이 양쪽 모두 `bg-emerald-400`이라 분기 무의미 | TDP L44 |
| A19 | 아이콘 전용 버튼에 `aria-label` 없이 `title`만 사용 (TSRL 쉐브론은 aria-label 있음) | DRB L667, RGC L628 (대 TSRL L58·L62) |
| A20 | 개인 전술 탭이 TabBar에서 숨김 처리되어 MultiTacticsView의 PlayerTacticsPanel 렌더 블록이 딥링크(`?tab=player`) 외에는 도달 불가 | MTV L521~522, L638~646 |
| A21 | 행/옵션 hover 불투명도 3종 혼재 (`white/5`, `white/[0.03]`, `slate-800`) | DRB L152·L593, RGC L581, Table L105, Dropdown L112 |

## 비고(UI 외 관찰, 참고용)

- `useLeaderboardData`가 MultiTacticsView L400, TeamLeadersCards L53, PlayerStatsTable L51에서 각각 호출됨(동일 스케줄·유사 입력, 중복 계산 가능성 — 성능은 이번 감사 범위 밖).
- TacticsDataPanel/PlayTypePPP/RadarChart/TeamZoneChart는 요청 범위 밖이라 읽지 않음.
- Button base의 `uppercase tracking-widest`는 한국어 라벨엔 효과 없음이나, 메모리의 button typography 방침과의 정합성은 확인이 필요함.
