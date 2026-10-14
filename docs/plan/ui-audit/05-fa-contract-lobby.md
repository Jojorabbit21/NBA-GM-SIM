# 05 FA·협상·방출·로비 — UI 조각 전수 감사

읽은 범위:
- `views/multi/season/MultiNegotiationView.tsx`: 1~1567줄 (전부)
- `views/multi/season/MultiReleaseView.tsx`: 1~750줄 (전부)
- `views/multi/season/MultiFreeAgentView.tsx`: 1~684줄 (전부)
- `views/multi/season/LeagueLobbyPanel.tsx`: 1~678줄 (전부)
- 비교용(diff 수준): `views/multi/season/MultiDraftPoolView.tsx` 1~463줄 중 상단 1~40, 40~200, 200~340(스탯필터), 340~463(테이블/페이지네이션) 읽음 + `diff` 명령으로 블록 단위 동일성 검증
- 공용 API(감사 대상 아님, 전부 읽음): `components/common/` Table(228), TabBar(55), Button(69), Badge(41), Card(45), Modal(136), Dropdown(147), PageHeader(42), TeamLogo(46), OvrBadge(146), InjuryStatusBadge(94), PlayerHoverCard(344), SliderControl(164)
- 체크리스트: `scratchpad/ui-audit/by_file/` 4개 (Negotiation 99행 / Release 45행 / FreeAgent 64행 / Lobby 32행 = 240행) 전부 대조

표기 규칙: "공용 있음"=components/common에 이미 대응 컴포넌트가 있고 prop으로 해결 가능, "신규"=대응 컴포넌트 없음, "추정"=코드로 직접 확인하지 못한 판단. 라인 번호는 모두 해당 파일 기준.

## 공용 API 요약 (대체 가능 여부 판단 기준)

| 컴포넌트 | 핵심 스타일/제약 | 이번 화면군과의 간극 |
|---|---|---|
| Button | `rounded-2xl font-black uppercase tracking-widest`, size xs=`px-3 py-1.5 text-[10px]`, sm=`px-4 py-2 text-xs`, md=`px-6 py-3 text-xs`; variant primary/secondary/danger/ghost/outline/brand | 이 화면군 버튼은 `rounded-lg/xl/md` + `text-xs/sm font-bold`(비 uppercase). 라운드/타이포 오버라이드 prop 없음. orange 그라디언트 CTA variant 없음 |
| Badge | `rounded-full border font-black uppercase tracking-wider`, `text-[9px]/[10px]` | 로비의 `rounded-lg text-sm` 상태 칩과 모양 불일치 |
| Card | `rounded-3xl` + border 또는 glass, padding none/sm/md/lg | 로비 패널은 border/radius 없는 flat `bg-slate-900` — 해당 variant 없음 |
| Table 계열 | `TableHeaderCell`은 `py-3 px-1.5 border-b`, `TableCell` `py-2 px-3 border-b border-slate-800/50`, `TableRow`는 `hover:bg-white/5` | 세로 구분선(`border-r`)·sticky 옵션 prop 없음 → FA 21행 수동 클래스. TableRow 미사용(FA의 `<tr>`) |
| Dropdown | portal + 항목 리스트(`items`) 또는 children | 체크박스 다중선택 모드 없음 → FA/DraftPool이 `CheckboxFilterDropdown` 자체 구현 |
| OvrBadge | sm=24px, md=32px, 인라인 boxShadow | 28px 크기 없음 → FA `!w-7 !h-7 !text-xs !shadow-none` 강제 오버라이드 |
| TeamLogo | `getTeamLogoUrl`(구 로고 세트) 단일 소스, onError는 `placehold.co` 1단 폴백 | 멀티는 `getRealTeamLogoUrl`(real 세트) → 구버전 → placeholder 2단 폴백이 필요, prop 없음 |
| PageHeader | `h2 text-4xl/5xl` 대형 타이틀 + 하단 border | FA/DraftPool의 `h1 text-lg` 툴바 타이틀, 협상/방출의 `h-12` 뒤로가기 바와 규모 불일치 |
| Modal | `size`, `rounded`, `backdropClass`, `hideCloseButton`, `footer` | 방출 확인 모달은 이미 사용(공용 OK). 본문 안에 버튼 직접 배치 |
| 없음(신규 후보) | Input/Select/Checkbox/KeyValueRow/SectionTitle/Alert/Stepper/Pagination | 아래 각 파일에서 반복 구현 확인 |

---

## views/multi/season/MultiNegotiationView.tsx (1567줄)

### 공용 컴포넌트 사용 현황
- `OvrBadge` (L7, 사용 L980 `size="md"`) — 정상 사용.
- `PlayerHoverCard` (L11, 사용 L981~988) — 정상 사용. 자식은 `div` + 수동 링크 클래스(`text-base font-black text-white ko-tight leading-tight cursor-pointer hover:underline hover:text-indigo-400`).
- lucide `Loader2/ShieldAlert/Minus/Plus` 직접 사용.
- Button / Badge / Card / Table / Dropdown / TabBar / PageHeader / TeamLogo / Modal / SliderControl / InjuryStatusBadge: **미사용**. 화면 전체가 raw `<button>`/`<select>`/`<input>`/`<div>`로 구성.
- 지역 함수 `formatMoney`(L91~93)가 `utils/formatMoney`의 `formatMoney`를 `formatMoneyAbbrev`로 import(L37)해 덮어씀.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 87~93 | money | 지역 `formatMoney`: `Math.abs(d) < 1_000_000 ? formatMoneyFull(d) : formatMoneyAbbrev(d)` | utils/formatMoney 확장 | `formatMoneyAuto()` 신설 후 양 파일 공유 | Release L53~55와 본문 동일(아래 비교). 체크리스트 L90~92 반영 |
| 926~932 | spinner | `flex items-center justify-center h-full min-h-screen` + `Loader2 size=28 animate-spin text-indigo-400` | 신규 | `<PageSpinner size>` | 동일 패턴이 4개 파일에 다른 변형으로 존재 |
| 934~950 | empty / section-header | 선수 없음 화면: `h-12 px-5 border-b border-slate-800 bg-slate-950` 뒤로가기 바 + 중앙 `text-sm text-slate-500` 문구 | 신규 | `<SubPageBar onBack title>` + `<EmptyState>` | 뒤로가기 바는 L955와 3중복 |
| 937~944, 955~963 | section-header / button | `h-12` 바, 버튼 `flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-white transition-colors` `←` `뒤로`, 제목 `text-sm font-bold text-white ko-tight` | PageHeader(규모 불일치) | 신규 `<SubPageBar>` | Release L372~380과 동일 |
| 965~968 | empty | `flex-1 flex items-center justify-center text-sm text-slate-500` | 신규 | `<EmptyState>` | |
| 969~972 | spinner | `Loader2 size=24` 중앙 | 신규 | `<PageSpinner>` | 928의 28과 크기 불일치 |
| 974 | divider / layout | `flex divide-x divide-slate-800 bg-slate-950`, 패널 `flex-[2]/[3]/[5]` (L977, L1120, L1186) | 신규 | `<ThreePaneLayout>` | Release L382/L385/L502/L537과 동일 |
| 979~989 | player-row | `OvrBadge md` + `PlayerHoverCard` + 이름 div(링크 스타일) | OvrBadge, PlayerHoverCard (이미 사용) | 이름 링크 스타일 prop화 | Release L387~397과 동일 |
| 990~1003 | kv-row | `.map` → `flex justify-between items-center text-sm` + `text-slate-400` / `text-slate-200` | 신규 | `<KeyValueRow label value tone>` | 포지션·나이·키·몸무게·연차 |
| 1004~1027 | section-header / kv-row | `px-4 py-3 space-y-1` + 제목 `text-sm font-bold uppercase text-white mb-1.5` "요구 조건" + kv 4개 | 신규 | `<SidePanelSection title>` | 협상 전용(Release에는 없음). 주석 L1012~1016은 삭제된 항목 설명 |
| 1030~1050 | section-header / kv-row | `px-4 py-3 border-t border-slate-800 space-y-1`, 제목 "선수 유형" | 신규 | `<SidePanelSection>` | Release L413~433 동일 |
| 1053~1064 | section-header / kv-row | "인기도" 동일 구조 | 신규 | `<SidePanelSection>` | Release L435~446 동일 |
| 1067~1093 | section-header / kv-row | "성격 & 기분": IIFE 안에서 5개 임계값→(text,color) 매핑 후 kv 6행 | 신규 | `<PlayerTraitsSection tendencies moraleScore>` | 임계값 매핑 코드가 Release L451~472와 완전 동일. 주석상 PlayerDetailView에도 동일 로직 존재(미열람, 주석 근거) |
| 1096~1115 | section-header | "스카우팅 리포트": sort(positive→negative→neutral) + 색상 분기 | 신규 | `<ScoutReportList>` | Release L476~495 동일 |
| 1121~1136 | section-header | 채팅 헤더 `p-4 border-b border-slate-800 bg-slate-800/50 flex items-center gap-4` + "계약 가능성/현재 기분" | 신규 | `<ChatStatusBar>` | 협상 전용 |
| 1138~1145 | badge/pill | status 메시지 `flex justify-center py-1` + `text-xs italic` (success=emerald-400 / 기본 slate-500) | 신규 | `<ChatBubble role="status">` | Release L505~511 동일 |
| 1146~1155 | card | GM 버블: `max-w-[85%] bg-indigo-600/20 border border-indigo-500/30 rounded-2xl rounded-br-sm px-4 py-3` + `animate-in fade-in slide-in-from-bottom-1 duration-200` | 신규 | `<ChatBubble role="gm">` | Release L512~519 동일 |
| 1156~1166 | card | 선수 버블: `bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm`, 따옴표 `&ldquo;` + subText | 신규 | `<ChatBubble role="player">` | 협상 전용 |
| 1168~1177 | button | "나가기" 텍스트 링크: `text-sm text-slate-400 hover:text-slate-200 underline underline-offset-2 transition-colors` | Button `ghost`(스타일 불일치) | Button `variant="link"` 신규 | Release L523~529 동일 |
| 1186 | 기타 | 오퍼 패널 비활성: `opacity-40 pointer-events-none select-none transition-opacity duration-300` | 신규 | `<DisableOverlay disabled>` | Release L537 동일 |
| 1196~1213 | select / section-header | 라벨 `text-sm font-bold uppercase tracking-wider text-slate-400`, `rookiePick` 시 고정 박스 `bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-slate-400` | 신규 | `<FormField label>` + `<Select>` | 고정 박스는 Release L547과 동일 |
| 1203, 1221 | select | `<select>` `w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed` (두 select 클래스 동일) | 신규 | `<Select options value onChange disabled>` | FA L668 select는 `bg-slate-800 border-slate-700 text-slate-300 px-2 py-1.5`로 다름 |
| 1237~1274 | button / input (스텝퍼) | 계약 연수: 버튼 5개 `[최소][-][input+년][+][최대]`, 컨테이너 `flex items-center gap-2`, 버튼 `flex-1 h-8 ... rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800`; ±는 `text-slate-300 hover:bg-slate-700`(hover:text-white 없음) | 신규 | `<NumberStepper presets=[min,-d,+d,max] suffix>` | 3개 스텝퍼 중 이것만 `gap-2`(나머지 `gap-1.5`) |
| 1252~1263 | input | `relative flex-[2]` 래퍼 + `<input type=text inputMode=numeric>` `w-full bg-slate-950 border border-slate-600 rounded-lg pl-3 pr-7 py-2 text-center text-sm font-bold text-white focus:border-indigo-500` + 우측 절대위치 접미사 "년" | 신규 | `<SuffixInput suffix>` | 4개 인스턴스(아래 패턴표) |
| 1284~1327 | button / input / 라벨 | 캡%: 라벨 행(`flex justify-between`) + 우측 "최대 가능 캡% : {maxCapPct}%" `text-sm text-green-500`, 스텝퍼 5요소 `[최소][-1%][input %][+1%][최대]`, 하단 안내문 `text-sm text-slate-600` | 신규 | `<NumberStepper>` + `hint`/`rightLabel` prop | `text-green-500`은 다른 곳 `emerald-400`과 불일치 |
| 1329~1364 | button / input | 변동률: 동일 구조 `[최소][-1%][input %][+1%][최대]` | 신규 | `<NumberStepper>` | 캡%와 클래스 문자열 완전 동일 |
| 1370~1386 | input | 루키 배율: 라벨 `text-sm text-slate-500`(위 라벨들과 톤 다름) + input(`text-center` 없음) + 접미사 "%" | 신규 | `<SuffixInput>` | 라벨 스타일 불일치 |
| 1275~1277, 1324~1326, 1388~1394, 1450~1452 | 기타(안내문) | `text-sm text-slate-600`(3곳) vs `text-sm text-slate-500`(2곳: L1389, L1392) | 신규 | `<HelpText>` | 같은 역할 안내문의 색 톤이 갈림 |
| 1397~1420 | kv-row | "계약 예상액" 제목 `text-sm font-bold text-slate-400`(uppercase tracking 없음) + 연차 행 `text-slate-500` / `font-bold text-white`, 옵션 `(TO)/(PO)` `italic font-bold text-yellow-400` | 신규 | `<KeyValueRow>` + 옵션 마커 | 제목 스타일이 L1197 계열(uppercase tracking-wider)과 불일치. 옵션 색: 여기는 yellow-400, Release L579~583은 sky/emerald-400 |
| 1425~1454 | input (checkbox) / pill | 라벨 `flex items-center gap-2 text-sm text-slate-300` + `<input type=checkbox className="w-4 h-4 rounded accent-indigo-500 cursor-pointer disabled:cursor-not-allowed">` 2개, 비활성 시 라벨 `opacity-40 cursor-not-allowed` | 신규 | `<Checkbox label disabled>` | Release L556~565와 동일 스타일. FA의 커스텀 체크박스(L124)와는 **다른 구현** |
| 1457~1466 | divider / kv-row | 총액 요약: `border-t border-slate-700/50` + kv 2행 | 신규 | `<KeyValueRow>` | 구분선 톤 `slate-700/50`은 이 파일 다른 곳 `slate-800`과 다름 |
| 1475~1533 | section-header / kv-row / money | 팀 샐러리캡 현황: 제목 `text-sm font-bold text-slate-400 mb-1`, kv 최대 8행, `text-red-400 / text-emerald-400` 분기, 구분 `pt-2 mt-1 border-t border-slate-800` | 신규 | `<CapStatusPanel capInfo afterLabel>` | Release L613~667과 **라벨 1개("계약 후"↔"방출 후") 외 동일**. 아래 diff 참조 |
| 1535~1540 | card/alert | `bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400` + ShieldAlert 14 | 신규 | `<InlineAlert tone="warning">` | 3종 알림이 같은 골격 |
| 1542~1546 | card/alert | `bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400` + ShieldAlert | 신규 | `<InlineAlert tone="error">` | Release L691~695와 동일. 메모상 "오류는 notify.error 토스트" 방침과 상충 가능(아래 불일치) |
| 1548~1556 | button | 제출: `w-full py-3 rounded-xl font-black uppercase tracking-wide text-sm transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed` | Button `primary` + `fullWidth` | Button에 `rounded`/`uppercase=false` 옵션 필요(현재 rounded-2xl, tracking-widest 고정) | `uppercase tracking-wide`는 메모 "버튼 uppercase/tracking-widest 제거" 방침과 어긋남 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 스텝 버튼(`flex-1 h-8 ... rounded-lg bg-slate-800 border border-slate-700 ... hover:bg-slate-700`) | 1242, 1247, 1264, 1269 / 1292, 1297, 1313, 1318 / 1332, 1337, 1353, 1358 (**12회**, 각 5줄) | 60 |
| 접미사 숫자 입력 래퍼(`relative flex-[2]` + input + 절대위치 접미사) | 1252~1263 / 1302~1312 / 1342~1352 / 1373~1384 (**4회**) | 46 |
| 스텝퍼 전체 그룹(연수/캡%/변동률) | 1241~1274 / 1291~1323 / 1331~1363 (**3회**) | 100 (스텝 버튼·입력 래퍼 포함) |
| 폼 라벨 `text-sm font-bold uppercase tracking-wider text-slate-400` | 1197, 1220, 1240, 1286, 1330 (5회) | 5 |
| 폼 소제목 `text-sm font-bold text-slate-400` (uppercase 없음) | 1399, 1427, 1485 (3회) | 3 |
| kv 행 `flex justify-between items-center text-sm` | 998, 1007, 1022, 1033, 1038, 1044, 1059, 1086, 1406, 1458, 1462, 1486, 1492, 1496, 1501, 1507, 1513, 1520, 1524 (**19회**) | 약 76 (추정, 행당 4줄 가정) |
| 사이드 섹션 래퍼 `px-4 py-3 border-t border-slate-800 space-y-1` + 제목 | 1031, 1053, 1068, 1097 (4회) | 약 8 |
| select 2개 | 1203~1211, 1221~1231 | 20 |
| 체크박스 라벨 2개 | 1429~1438, 1439~1448 | 20 |
| 알림 박스 2개 | 1535~1540, 1542~1546 | 11 |
| 뒤로가기 바 2개 | 937~944, 955~963 | 17 |
| 스피너 2개 | 926~932, 969~972 | 약 10 |
| 캡 현황 패널(Release와 중복) | 1480~1533 | 54 |

### 이 파일 고유 확인 사항
- **지역 `formatMoney` 본문 비교**: Negotiation L91~93와 Release L53~55는 본문이 **글자 단위로 동일** — `return Math.abs(dollars) < 1_000_000 ? formatMoneyFull(dollars) : formatMoneyAbbrev(dollars);`. 둘 다 `import { formatMoney as formatMoneyAbbrev, formatMoneyFull } from '../../../utils/formatMoney'`로 가져와 같은 이름 `formatMoney`를 지역 재정의(공용 `formatMoney`는 `>=1M→$x.xM, >=1K→$xK, 그 외 $x`; `formatMoneyFull`은 `$` + toLocaleString). 즉 **차이 없음, 복제만 존재**. 반면 FA 테이블(L578)은 공용 `formatMoney` 그대로(투웨이 연봉 등 `<1M`이면 `$234K`)라 같은 선수 연봉이 FA 목록 `$234K` ↔ 협상 화면 `$234,097`로 다르게 표기됨.
- **숫자 조정 버튼 반복 횟수**: 스텝퍼 3그룹 × 4버튼 = **12회**(라벨: 연수 최소/−/+/최대, 캡 최소/−1%/+1%/최대, 변동률 최소/−1%/+1%/최대). 이 중 텍스트 버튼 10개(`text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white`)와 아이콘 버튼 2개(L1247 Minus, L1264 Plus: `text-slate-300 hover:bg-slate-700`, `hover:text-white` 누락) 두 클래스 변형이 섞여 있음. 컨테이너 gap도 연수 `gap-2`, 캡%/변동률 `gap-1.5`로 불일치.
- 비활성 조건 문자열이 12버튼 모두 `isOnCooldown || isRookieScale` 계열로 반복(연수) 또는 `isOnCooldown || isMinSalary || isRookieScale`(캡%/변동률 8버튼+2 input).

---

## views/multi/season/MultiReleaseView.tsx (750줄)

### 공용 컴포넌트 사용 현황
- `Modal` (L8, 사용 L713~744) — `size="sm" hideCloseButton blurBackdrop={false} rounded="rounded-md" backdropClass="bg-slate-950/60"`. footer prop 미사용(버튼을 body 안에 직접 배치).
- `OvrBadge` (L9, 사용 L388 `md`), `PlayerHoverCard` (L10, 사용 L389).
- lucide `Loader2/ShieldAlert/AlertTriangle` 직접.
- Button / Badge / Card / Table / Dropdown / TabBar / PageHeader / TeamLogo: 미사용. 데드캡 표(L671~689)를 `Table` 대신 `grid grid-cols-[1fr_auto_auto_auto]` div로 수동 구성.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 53~55 | money | 지역 `formatMoney` (Negotiation과 본문 동일) | utils/formatMoney 확장 | `formatMoneyAuto()` | |
| 337~343 | spinner | `h-full min-h-screen` + `Loader2 28 indigo-400` | 신규 | `<PageSpinner>` | Negotiation L926과 동일 |
| 345~361 | empty | `flex flex-col h-full items-center justify-center gap-3 text-slate-200` + `ShieldAlert 28 text-slate-600` + `text-sm text-slate-500` (2곳: 소속 팀 없음 / 선수 없음) | 신규 | `<EmptyState icon text>` | Negotiation은 같은 상황을 아이콘 없는 텍스트로 처리(불일치) |
| 372~380 | section-header / button | 뒤로가기 바(`h-12 px-5 ...`) — Negotiation과 동일 | 신규 | `<SubPageBar>` | |
| 382~385, 502, 537 | layout | `flex divide-x divide-slate-800` 3단 `flex-[2]/[3]/[5]` | 신규 | `<ThreePaneLayout>` | Negotiation과 동일 |
| 387~397 | player-row | OvrBadge + PlayerHoverCard + 이름 링크 | (공용 사용 중) | 이름 링크 prop화 | Negotiation L979와 동일 |
| 398~411 | kv-row | 5행 `.map` | 신규 | `<KeyValueRow>` | |
| 413~433, 435~446, 448~474, 476~495 | section-header / kv-row | 선수 유형·인기도·성격&기분·스카우팅 리포트 — Negotiation과 **동일 코드**(요구 조건 블록만 없음) | 신규 | `<PlayerInfoSidePanel>` | 한 벌 113줄 중복 |
| 503~520 | card | GM 버블/status 렌더 — Negotiation과 동일(선수 버블 분기 없음) | 신규 | `<ChatBubble>` | |
| 521~530 | button | "나가기" 링크 버튼 | Button `link`(신규 variant) | | Negotiation L1170과 동일 |
| 545~550 | select / 라벨 | "방출 방식" 라벨 + 고정 박스 "웨이브" (`bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-slate-400`) | 신규 | `<FormField>` + `<ReadonlyField>` | Negotiation L1199와 동일. select가 아닌데 select처럼 보이는 위장 박스 |
| 555~569 | input (checkbox) | 스트레치 체크박스: `accent-indigo-500` 네이티브 + 사유 `text-sm text-red-400` | 신규 | `<Checkbox>` | Negotiation L1430과 동일 스타일 |
| 572~594 | kv-row / divider | "현재 계약": 제목 `text-sm font-bold text-slate-400 mb-1`, 행 `py-0.5`, 옵션 라벨 `text-sky-400`/`text-emerald-400` + 금액 italic, 합계 `border-t border-slate-800 pt-1.5 mt-1` | 신규 | `<KeyValueRow>` + `<ContractScheduleList>` | Negotiation "계약 예상액"(L1397)과 유사하나 옵션 색·행 padding(`py-0.5` 유무) 다름 |
| 598~608 | kv-row | "미래 데드캡" 시즌/금액 행 | 신규 | `<KeyValueRow>` | 현재 계약 목록과 거의 동일 골격 |
| 613~667 | section-header / kv-row / money | 팀 샐러리캡 현황 — Negotiation과 라벨 1개 외 동일 | 신규 | `<CapStatusPanel>` | `const capInfo = displayCapInfo;`(L614) 한 줄만 추가로 다름 |
| 671~689 | table | 데드캡 표: 헤더 `grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-sm text-slate-500 pb-1.5 border-b border-slate-800`(L674), 행 같은 grid + `border-b border-slate-800/50`(마지막 행 제외, L681), 열 `text-right w-16` | Table 계열(밀도 차이) | `<Table compact>` 변형 or `<SimpleTable columns>` 신규 | 헤더 구분선 `slate-800`, 행 구분선 `slate-800/50` — Table.tsx 기본값(`border-slate-800` / `slate-800/50`)과 같은 톤이라 매핑 가능 |
| 691~695 | card/alert | 에러 박스 — Negotiation L1542와 동일 | 신규 | `<InlineAlert>` | |
| 697~705 | button | `w-full py-3 rounded-xl font-black uppercase tracking-wide text-sm ... bg-red-600 hover:bg-red-500 text-white disabled:opacity-40` | Button `danger` + `fullWidth` | rounded/타이포 오버라이드 | Negotiation 제출과 색상만 다름 |
| 713~744 | modal | 확인 팝업 Modal 사용 + `AlertTriangle 28 text-red-500 mb-3` + 문구 `text-slate-300 font-bold text-sm` + 버튼 2개 | Modal(사용 중) | 신규 `<ConfirmDialog>` | `components/ResetDataModal.tsx`, `DraftAdminPanel.tsx` 등 "되돌릴 수 없습니다" 확인 UI가 별도 존재(문구 grep 근거) — 통합 후보 |
| 728~734 | button | 취소: `flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-black text-sm transition-all disabled:opacity-50` | Button `secondary` | rounded/타이포 오버라이드 | `row_hover` 체크리스트 L731 |
| 735~741 | button | 확정: `flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm shadow-lg shadow-red-900/30 disabled:opacity-70 disabled:cursor-not-allowed` | Button `danger` | 동일 | disabled opacity가 `70`(제출 버튼 `40`, 취소 `50`)로 3종 불일치 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| kv 행 `flex justify-between items-center text-sm` | 406, 416, 421, 427, 441, 467, 576, 589, 602, 620, 626, 630, 635, 641, 647, 654, 658 (**17회**) | 약 68 (추정) |
| 사이드 섹션 래퍼 + 제목 `uppercase text-white mb-1.5` | 414/415, 435/436, 449/450, 477/478 (4회) | 약 8 |
| 소제목 `text-sm font-bold text-slate-400 mb-1` | 574, 600, 619, 673 (4회) | 4 |
| 시즌 행 목록(현재 계약/미래 데드캡) | 575~588, 601~606 | 20 |
| 구분선 `border-t border-slate-800` | 414, 435, 449, 477, 589, 653 | 6 |
| 모달 내부 버튼 2개 | 728~741 | 14 |
| 캡 현황 패널 | 613~667 | 55 |
| 선수 정보 좌측 패널(Negotiation과 중복) | 385~497 | 113 |

### 이 파일 고유 확인 사항
- 섹션 제목 두 종류: 좌측 패널 `uppercase text-white mb-1.5`(흰색) vs 우측 폼 `text-slate-400 mb-1`(회색) — 같은 파일 안에서 색·간격이 갈림(Negotiation도 동일).
- "방출 방식" 박스(L547)는 Negotiation 루키 스케일 박스를 복제 → select 외형의 읽기 전용 박스라는 의미 없는 위장 UI (추정: 향후 방식이 늘면 select로 바뀔 자리).

---

## views/multi/season/MultiFreeAgentView.tsx (684줄)

### 공용 컴포넌트 사용 현황
- `Table, TableHead, TableBody, TableHeaderCell, TableCell` (L15) — 사용. `TableRow`는 **import하지 않고** raw `<tr key>` 사용(L543, L549) → 행 호버(`hover:bg-white/5`) 없음.
  - `TableCell variant="attribute" colorScale mono={false}` (L573~575) 정상 사용.
  - `TableHead noRow` + 수동 `<tr className="h-10 text-slate-500 text-sm font-black uppercase">`(L519~520) — TableHead 기본이 이미 `sticky top-0 z-40 bg-slate-950`인데 `className="bg-slate-950 sticky top-0 z-40 shadow-sm"`로 중복 지정.
- `Dropdown` (L16, 사용 L451~467, L469~483) — 능력치/연산자 선택(`items` 모드)에 정상 사용. 트리거는 raw `<button>`.
- `OvrBadge` (L17, 사용 L565 `sm` + `!w-7 !h-7 !text-xs !shadow-none` 오버라이드), `PlayerHoverCard` (L18, 사용 L551).
- `notify` (L3) — 에러는 `notify.error`(L253)로 토스트 처리.
- 미사용: Button, Badge, Card, TabBar, PageHeader, TeamLogo, Modal.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 33~52 | 기타 | `Operator` 타입, `OPERATORS`, `compareOperator`, `StatFilterItem` | 신규 공용 모듈 | `utils/statFilter.ts` | DraftPool L19~38과 동일 |
| 74~152 | dropdown | `CheckboxFilterDropdown`: 트리거 `h-[36px] px-3 bg-slate-950 rounded-lg border shadow-sm text-sm font-bold`(선택 시 `border-indigo-500/50 text-indigo-400`) + 선택 개수 pill(L107) + `fixed inset-0 z-[100]` 백드롭(L114) + 패널 `fixed w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-[101]` + 커스텀 체크박스 `w-4 h-4 rounded border`(선택 시 `bg-indigo-600`) + Check 아이콘 | Dropdown(children 모드로 일부 가능) | Dropdown에 `multiSelect` 모드 or `CheckboxFilterDropdown`을 components/common으로 승격 | **MultiDraftPoolView.tsx와 79줄 byte 단위 동일**(`diff` 출력 없음) |
| 96~110 | button | 필터 트리거 버튼 | Dropdown `DropdownButton`(스타일 다름: `px-4 py-2`, 36px 높이 아님) | 높이/배경 prop | `h-[36px]`·`bg-slate-950`이 툴바 컨트롤 3종(검색/필터/스탯)과 공유되는 규격 |
| 107 | pill | 선택 수 배지: `bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full` | Badge (`brand`는 `bg-indigo-500/10` 계열로 색 다름) | Badge `variant="solid"` 신규 | 체크리스트 L107 |
| 114, 116 | dropdown/overlay | 풀스크린 투명 백드롭 `fixed inset-0 z-[100]` + 패널 `z-[101]`, 공용 Dropdown은 `z-[9999]` | Dropdown | | z-index 체계 불일치(100/101 vs 9999 vs Modal 500) |
| 120~145 | player-row/checkbox | 항목 행 `flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors` + 커스텀 체크박스 + 라벨 `text-sm font-bold` | Dropdown item(스타일 `px-3 py-2.5 text-xs`와 불일치) | | 공용 Dropdown 항목은 `text-xs font-bold`, 여기는 `text-sm font-bold` |
| 131 | divider | "모두 선택" 아래 `h-px bg-slate-800 mx-2 my-1` | 신규 | `<Divider>` | 구분선을 `border`가 아닌 `h-px` div로 구현 |
| 155~165 | 기타 | `[2026-09-04 임시 계측]` rAF 2회 + `console.log('[perf]...')` 잔존 | — | 삭제 대상 | UI 조각 아님. 주석에 "조사 끝나면 제거할 것" 명시. 같은 성격으로 L278/284/303/316 `console.time` 잔존 |
| 393~399 | spinner | `flex items-center justify-center min-h-screen` + `Loader2 28` (h-full 없음) | 신규 | `<PageSpinner>` | Negotiation은 `h-full min-h-screen`(불일치) |
| 403 | section-header | 툴바 컨테이너 `flex flex-col shrink-0 bg-slate-900 border-b border-slate-800` | 신규 | `<ListToolbar>` | DraftPool L229와 동일 |
| 405 | section-header | `h1 text-lg font-black text-white ko-tight truncate shrink-0` "자유 계약" | PageHeader(규모 불일치: 4xl/5xl) | PageHeader `size="sm"` 신규 | DraftPool "드래프트 풀"과 동일 구조 |
| 408~427 | input | 검색: `relative h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm w-48` + Search 아이콘 absolute + `input` `bg-transparent pl-9 pr-3 text-sm font-bold text-white placeholder:text-slate-600` + 지우기 X 버튼 | 신규 | `<SearchInput>` | DraftPool L234~253과 20줄 동일 |
| 429~442 | dropdown | `CheckboxFilterDropdown` 사용 ×2(포지션/아키타입) | 〃 | 〃 | |
| 446~496 | input / dropdown | 스탯 필터 바: 컨테이너 `flex items-center h-[36px] bg-slate-950 rounded-lg border ...` + 필터 아이콘 셀(`border-r border-slate-800`) + Dropdown(능력치) + Dropdown(연산자) + `<input type=number>` `w-16 ... [&::-webkit-inner-spin-button]:appearance-none` + 추가 버튼(`border-l`, `hover:bg-indigo-600/20`) | Dropdown(사용 중) | `<StatFilterBar items onAdd>` 신규 | DraftPool L270~339와 주석 2줄 외 동일 |
| 493 | button | 추가 `+` 버튼: `h-full px-3 ... border-l border-slate-800 text-slate-500 hover:text-white hover:bg-indigo-600/20 transition-all rounded-r-lg` | Button `ghost`(스타일 불일치) | 아이콘 버튼 변형 | |
| 500~513 | pill | 필터 칩: `flex items-center gap-2 px-3 py-1 bg-indigo-900/30 border border-indigo-500/30 rounded-full text-sm font-bold text-indigo-300` + X 버튼 + "모두 제거" 텍스트 버튼(`underline decoration-slate-700 underline-offset-2 hover:text-red-400`) | Badge (`brand`는 `bg-indigo-500/10 text-indigo-400`, `uppercase tracking-wider` — 시각 불일치) | Badge `removable` 신규 | 칩 구분선 `h-px bg-slate-800/60 mx-4 mb-3`(L502) |
| 517~540 | table | `Table className="!rounded-none !border-x-0 !border-t-0" fullHeight tableStyle=...` + 헤더 17+곳 `border-r border-slate-800 bg-slate-950` | Table(사용 중) | `Table` 에 `bordered="cols"` / `flush` prop 신규, `TableHeaderCell`에 `divider` prop | `!`-important 오버라이드 3개 = API 부족 증거 |
| 521~537 | th | 헤더 셀 21곳 중 `border-r border-slate-800 bg-slate-950` 반복(체크리스트 divider_v) | TableHeaderCell | `divider` + 기본 bg 상속 | `bg-slate-950`은 TableHead가 이미 칠함 → 중복 |
| 542~547 | empty | `<TableCell colSpan={6 + ATTR_ITEMS.length + 3} className="text-center text-slate-500 text-sm py-10">` | Table 계열 | `<TableEmpty colSpan>` 신규 | DraftPool은 `6 + ATTR_ITEMS.length`(열 수 다름) — 매직 넘버 계산 |
| 548~620 | table | 본문 행 `<tr key>` 직접, 셀 `border-r border-slate-800/30` 반복 | TableRow(미사용), TableCell | `TableRow` 사용 + `TableCell divider` | 호버 없음 |
| 550~559 | player-row | 이름 셀: `PlayerHoverCard` + `span text-slate-200 ko-normal text-sm font-semibold cursor-pointer hover:underline hover:text-indigo-400 whitespace-nowrap` | `TableCell variant="player"`(onClick 지원, 스타일: `font-bold group-hover:text-indigo-400 group-hover:underline`) | PlayerHoverCard 래핑 지원 or 렌더 슬롯 | variant="player" 있으나 HoverCard 때문에 미사용으로 추정 |
| 560~563 | td | 포지션/나이/키/몸무게: `TableCell align=center border-r border-slate-800/30 text-sm text-slate-400` ×4 | TableCell | `variant="text"` + 클래스 중복 | |
| 564~566 | td / OVR | `<div className="flex justify-center"><OvrBadge size="sm" className="!w-7 !h-7 !text-xs !shadow-none"/></div>` | `TableCell variant="ovr"`(OvrBadge sm + `shadow-none`) | OvrBadge에 28px 크기 or Table ovr variant에 `size` prop | 추정: Table.tsx L212 `className="shadow-none"`는 OvrBadge의 인라인 boxShadow를 못 이겨 효과 없음 → 여기서 `!` 사용 |
| 578 | money | `{formatMoney(p.salary)}` 공용 formatMoney | — | | 협상 화면 지역 formatMoney와 표기 불일치 |
| 579~586 | badge | 가능성: IIFE → `span font-bold {likelihood.color}` / `-` | Badge(색은 `getAcceptLikelihoodLabel` 제공 클래스) | | |
| 588~618 | button | 계약: `px-2.5 py-1 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-indigo-600` | Button `primary size=xs`(radius `2xl`, `uppercase tracking-widest text-[10px]`) | Button `size="2xs/compact"` | 로비 소버튼은 `rounded-lg`·`text-xs`, 여기 `rounded-md`·`text-sm` |
| 627~678 | pagination | 푸터 `relative flex items-center px-6 py-3 bg-slate-950 border-t border-slate-800 flex-shrink-0 z-50` — 좌 "총 N명 중 X–Y" `w-48`, 중앙 absolute `left-1/2` 화살표/번호, 우 "페이지 당" select | 신규 | `<PaginationFooter>` | DraftPool L406~458과 **53줄 동일**(주석 1줄 차이). LeaderboardView에도 "페이지 당" 존재(grep 근거, 미열람) |
| 633~639, 657~663 | button | 화살표 `p-1.5 text-indigo-400 hover:bg-slate-800 hover:text-indigo-300 rounded-lg transition-all disabled:opacity-30` | 〃 | 〃 | |
| 644~654 | button | 번호: `w-7 h-7 text-sm font-bold rounded-lg transition-all` 선택 시 `bg-indigo-600 text-white` | 〃 | 〃 | |
| 668~676 | select | `bg-slate-800 border border-slate-700 text-slate-300 text-sm font-bold rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer` | 신규 | `<Select compact>` | Negotiation select(`px-3 py-2 text-white`)와 다름 |
| 360~370 | 기타 | `getPageNumbers()` | 신규 | `usePagination` 훅 | DraftPool L186~196과 동일 |

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 세로 구분선 `border-r border-slate-800(/30)` | 447, 450, 468, 521~526, 530, 536, 537, 550, 560~564, 571, 578, 579 (**21행**) | 21 |
| 컨트롤 박스 규격 `h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 shadow-sm` | 99(트리거), 408, 446 | 3 (클래스 줄) |
| `CheckboxFilterDropdown` 정의 | 74~152 | 79 |
| 검색 박스 | 408~427 | 20 |
| 스탯 필터 바 + 칩 | 446~496, 500~513 | 51 + 14 = 65 |
| 필터 핸들러 | 377~391 | 15 |
| 타입/연산자 | 33~52 | 20 |
| `getPageNumbers` + 페이지 상태 | 323~327, 360~370 | 약 16 |
| 페이지네이션 푸터 | 626~678 | 53 |
| 한 벌 합계(DraftPool과 중복) | | 약 263 |

### CheckboxFilterDropdown · 페이지네이션 vs MultiDraftPoolView (diff 결과)
| 블록 | FA 라인 | DraftPool 라인 | 결과 |
|---|---|---|---|
| `CheckboxFilterDropdown` 본문 | 74~152 (79줄) | 52~130 (79줄) | `diff` 출력 없음 = **완전 동일** (주석만 다름: DP는 FA 복제본임을 L50~51에 명시) |
| `getPageNumbers` | 360~370 | 186~196 | **동일** |
| 페이지네이션 푸터 JSX | 626~678 (53줄) | 406~458 (53줄) | **주석 1줄만 다름** |
| 스탯 필터 영역(CBD 2개+필터바+칩) | 429~513 | 255~339 | **주석 2줄만 다름** |
| 툴바 컨테이너/타이틀/검색 | 403~427 | 229~253 | 타이틀 문구만 다름("자유 계약"/"드래프트 풀") |
| 테이블 헤더/셀 | 517~539 / 548~620 | 340~ (읽음) | DP는 연봉/가능성/계약 3열 없음, `colSpan=6+ATTR_ITEMS.length`, 빈 문구 "조건에 맞는 선수가 없습니다." |

---

## views/multi/season/LeagueLobbyPanel.tsx (678줄)

### 공용 컴포넌트 사용 현황
- 공용 `components/common/*` **import 0건**. 사용 컴포넌트는 `TeamSetupModal`(components/multi) 하나뿐.
- 지역 컴포넌트: `TeamLogoImg`(L50~65), `InfoRow`(L69~74).
- lucide `Loader2/AlertCircle`.

### 직접 구현 UI 조각
| 라인 | 종류 | 현재 구현 요약(핵심 클래스) | 대체 가능한 공용 컴포넌트 | 대체에 필요한 prop/신규 컴포넌트 | 비고 |
|---|---|---|---|---|---|
| 21~27 | 기타 | `fmtDate` `toLocaleString('ko-KR', ...)` | utils 공용 날짜 포매터 | — | 체크리스트 `money_locale`(L23) = **오탐**(날짜 포맷) |
| 50~65 | logo-fallback | `TeamLogoImg`: `getRealTeamLogoUrl` → onError `dataset.fallback='old'` → `getTeamLogoUrl` → `placehold.co/100x100?text=BPL`, 기본 `w-7 h-7 object-contain shrink-0` | TeamLogo | TeamLogo에 `logoSet="real"` + 2단 폴백 | `components/multi/TeamSelectModal.tsx:21`, `views/multi/season/TournamentBracketView.tsx:82`에도 동명 지역 컴포넌트 존재(grep 근거; 본문 미열람 → 동일 여부 추정) |
| 69~74 | kv-row | `InfoRow`: `flex items-center justify-between py-2 text-sm`, 라벨 `text-slate-500 ko-normal`, 값 `text-white font-bold` | 신규 | `<KeyValueRow>` | `CoachDetailView:188`, `GMDetailView:46`(label+children), `LeagueSettingsView:134`(label+value+muted)에도 동명 정의 — 시그니처가 서로 다름 |
| 263~269 | spinner | `min-h-screen` + `Loader2 24 indigo-400` | 신규 | `<PageSpinner>` | 24/28 크기 혼재 |
| 270~280 | empty | `AlertCircle 24 text-red-400` + `text-slate-400 text-sm ko-normal` + 링크 `text-indigo-400 text-sm hover:underline` "홈으로 돌아가기" | 신규 | `<EmptyState icon action>` | |
| 275 | button | 텍스트 링크 버튼 | Button `link`(신규) | | Negotiation/Release "나가기"는 `slate-400 underline`, 여기는 `indigo-400 hover:underline` — 링크 스타일 2종 |
| 298~306 | logo / section-header | 마스트헤드: `<img src="/logos/real/PBL.svg" className="w-16 h-16 object-contain drop-shadow-md shrink-0">` + `span text-2xl font-black text-white ko-tight` | TeamLogo(`size=xl`=w-16 h-16, drop-shadow-md 동일 클래스) | TeamLogo가 임의 경로(PBL) 허용하는 `src` prop | 하드코딩 경로 |
| 310~312 | badge/pill | 완료 칩: `px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm font-bold text-emerald-300` | Badge `success`(`rounded-full text-[10px] uppercase` — 시각 불일치) | Badge `size="lg"` + `rounded` 옵션 | 색은 success(`emerald-500/10`, `border-/30`)와 거의 동일, 글자색만 `300` vs `400` |
| 314~320 | button | CTA "팩 드래프트 입장": `flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-lg text-base font-black text-white transition-all active:scale-[0.98] shrink-0` | Button (orange variant 없음) | Button `variant="cta"` | 같은 그라디언트가 `views/home/InlineLeagueList.tsx`, `views/auth/AuthForm.tsx`, `views/multi/league/PersonalDraftView.tsx`, `views/home/MyLeagues.tsx`, `components/MultiHeader.tsx`에도 존재(grep 근거) |
| 323~328 | button | CTA "드래프트 룸 입장": **L314~320과 클래스 동일** | 〃 | 〃 | |
| 333~337 | card/alert | `text-xs text-red-400 ko-normal bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-2` | 신규 | `<InlineAlert>` | Negotiation/Release의 에러 박스(`bg-red-500/10 border-red-500/20 text-sm py-3` + 아이콘)와 색·크기 모두 다름. 메모상 토스트 방침과 상충 가능 |
| 340~342 | layout | `grid grid-cols-2 gap-6` > `space-y-6` | — | | 우측 컬럼 "추후 확장용" 주석 |
| 344~345, 394~395, 512~513, 581, 615~616 | section-header | `h3 text-lg font-black text-white`(진행중 헤더만 `text-emerald-400 animate-pulse`) | 신규 | `<SectionTitle>` | 5회 |
| 347 | card | 정보 패널 `bg-slate-900 px-4 divide-y divide-slate-800/60` | Card(`rounded-3xl border` — 불일치) | Card `variant="flat"` 확장(현 `flat`은 `bg-slate-950/50 border`) | 5개 flat 패널(347, 396, 514, 582, 617) |
| 348~387 | kv-row | `InfoRow` 사용 11행 | 신규 | `<KeyValueRow>` | 행 구분은 부모 `divide-y`가 담당(다른 파일 kv는 구분선 없음) |
| 380~385 | button | 값 자체가 링크 버튼: `hover:text-indigo-400 hover:underline transition-colors` | 신규 | KeyValueRow 값 슬롯 링크 | |
| 396~401 | table (div) | 헤더 행: `flex items-center gap-2 py-1.5 px-3 border-b border-slate-800`, 열 `text-sm font-bold text-slate-600`; 팀 `flex-1 min-w-0` / GM `w-28 shrink-0` / 액션 `w-44 shrink-0` | Table 계열 | `<Table compact>` or `<ListRow columns>` | 헤더 글자색 `slate-600`은 Table 헤더 `slate-500`과 다름 |
| 413~418 | player-row (team-row) | 행: `flex items-center gap-2 py-2 px-3 border-b border-slate-800/60 transition-colors` + 내 팀 `bg-indigo-500/5`, 그 외 `hover:bg-white/5` | TableRow(`hover:bg-white/5` 동일) | TableRow에 `highlight` prop | 내 팀 하이라이트 `indigo-500/5` |
| 419~429 | logo | 팀 셀: `relative w-7 h-7` 래퍼 + `TeamLogoImg` + 선택 중 오버레이 `absolute inset-0 bg-slate-900/70 rounded` + `Loader2 12 animate-spin text-white` + 팀명 `text-sm font-bold text-white truncate` | TeamLogo | 로딩 오버레이 prop | |
| 431~438 | td | GM 셀: `w-28 shrink-0 truncate` — 내 팀 `text-indigo-400`, 인간 `text-white`, 없음 `text-slate-500` "없음" | — | | 체크리스트 L436 empty_state 반영 |
| 440~496 | button ×5 | 액션 셀 `w-44 shrink-0 flex items-center justify-end gap-1.5` 안 5종 버튼(아래 별도 표) | Button | Button `size` 확장 | |
| 506~575 | section-header / card | 드래프트 진행중 카드: `bg-slate-900 px-4 py-4 space-y-3`, 라운드/남은시간 `text-sm font-bold text-white ko-normal`, 현재/다음 차례 kv(`text-slate-400` + `font-bold text-white`), 타이머 색 `timerPct<=15 red-400 / <=40 amber-400 / white`, `tabular-nums`(L534) | 신규 | `<DraftStatusCard>` | |
| 561~565 | spinner | 카드 내 로딩 `Loader2 16 text-slate-500` | 신규 | `<InlineSpinner>` | 로비 안에 스피너 크기 5종(24, 12, 11, 11, 16) |
| 567~572 | button | 3번째 orange CTA `w-full justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-black ...` | Button `cta fullWidth` | | |
| 582~587 | divider / 기타 | 카운트다운: 박스 `px-4 py-6 text-center border-b border-slate-800`, 설명 `text-xs text-slate-500 ko-normal mb-2`, 숫자 `text-5xl font-black text-white tabular-nums` | 신규 | `<Countdown label value>` | L625~632와 동일 구조 |
| 589~609 | table (div) | 추첨 순번 리스트: 행 `flex items-center gap-2 h-11 px-3 border-b border-slate-800/60 last:border-b-0`, 순번 `w-8 text-slate-500`, 로고 `w-6 h-6`, 빈 슬롯 스켈레톤 `flex-1 h-5 bg-slate-800/40 rounded` | Skeleton(components/common, 미열람), Table | | 행 높이 `h-11` 고정 vs 팀 목록 `py-2` |
| 614~636 | card | 마감 안내 카드 3분기: 없음(`text-sm text-slate-500`), 마감됨(`text-sm font-bold text-red-400` + `text-xs text-slate-500`), 카운트다운 + 경고 `text-xs text-amber-400` | 신규 | `<Countdown>` + `<HelpText>` | `마감 없음`(L368 값 텍스트, L619 문장) 체크리스트 |
| 160~180, 184~205 | 기타 | 카운트다운 tick 로직 12줄씩 복제(`d/h/m/s` → `dd일 hh:mm:ss`) | 훅 | `useCountdown(target)` | UI 아님, 참고 |
| 641~672 | modal | `TeamSetupModal`(기존 컴포넌트) | — | | OK |

로비 팀 목록 액션 버튼 5종(전부 `px-2.5 py-1 rounded-lg text-xs font-bold` 공통, 색만 다름):

| 라인 | 라벨 | 노출 조건 | 색상 클래스 | 줄 수 |
|---|---|---|---|---|
| 443~453 | 참가 | 빈 팀 + 모집 가능 + 비회원 | `bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40` + 로딩 `Loader2 11` | 11 |
| 457~462 | 편집 | 내 팀 + 변경 가능 | `bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white` | 6 |
| 463~469 | 탈퇴 | 〃 | `bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 disabled:opacity-40` | 7 |
| 474~481 | 선택/변경 | 빈 팀 + 회원 | `bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white` | 8 |
| 484~494 | 강퇴 | 어드민 + 타 인간 | `flex items-center gap-1 bg-red-500/10 hover:bg-red-500/25 text-red-500 hover:text-red-400` + 로딩 `Loader2 11` | 11 |
| 합계 | | | | **43** |

→ 탈퇴(`text-red-400`/`hover:/20`)와 강퇴(`text-red-500`/`hover:/25`)는 같은 파괴 액션 칩인데 색 단계가 어긋남. Button `size xs`(px-3 py-1.5 text-[10px] rounded-2xl uppercase tracking-widest)와도 불일치 → Button에 `compact`(px-2.5 py-1 text-xs rounded-lg, 비 uppercase) 변형이 필요.

### 파일 내 반복 패턴
| 패턴 | 등장 라인 | 줄 수 합계 |
|---|---|---|
| 소형 액션 버튼 `px-2.5 py-1 rounded-lg text-xs font-bold` | 446, 459, 466, 477, 487 (5회) | 43 |
| orange 그라디언트 CTA | 314~320, 323~328, 567~572 (3회) | 19 |
| flat 패널 `bg-slate-900` | 347, 396, 514, 582, 617 (5회) | 5 (클래스 줄) |
| 섹션 제목 `h3 text-lg font-black text-white` | 345, 395, 513(변형), 581, 616 (5회) | 5 |
| 대형 카운트다운 `text-5xl font-black ... tabular-nums` | 586, 628 (2회) | 약 10 |
| 카운트다운 tick 로직 복제 | 164~175, 188~199 | 24 (로직) |
| 팀 로고 + 팀명 셀 | 419~429, 599~602 | 약 13 |
| 목록 행 구분선 `border-b border-slate-800/60` | 415, 595 | 2 |
| 스피너 크기 변형 | 266(24), 424(12), 449(11), 490(11), 563(16) | 5 |

---

## 화면군 종합

### 불일치 대조표
| 항목 | Negotiation | Release | FreeAgent | LeagueLobby | 비고 |
|---|---|---|---|---|---|
| 전체 로딩 스피너 | `h-full min-h-screen`, 28(L929) / 24(L971) | `h-full min-h-screen`, 28(L340) | `min-h-screen`(h-full 없음), 28(L396) | `min-h-screen`, 24(L266) | 크기 24/28, h-full 유무 |
| 인라인 스피너 | — | — | — | 12(흰색)/11/11/16(slate-500) | 5종 |
| 빈 상태 | 텍스트만 `text-sm text-slate-500` | 아이콘 `ShieldAlert 28 slate-600` + 텍스트 | 표 안 `py-10 text-center` | `AlertCircle 24 red-400` + 링크 | 4종 |
| 에러 표시 | 박스 `red-500/10 border-red-500/20 py-3 text-sm` + 아이콘 | 동일 | **`notify.error` 토스트(L253)** | 박스 `red-900/20 border-red-700/30 py-2 text-xs`, 아이콘 없음 | 메모 `feedback_errors_via_notify`("오류는 배너 대신 토스트, 상태 안내만 인라인")와 FA만 일치 — 3곳 인라인은 "상태 안내"인지 정책 판단 필요 |
| 경고 박스 | amber `bg-amber-500/10 border-amber-500/20` | — | — | — | 로스터 정원 안내 |
| 기본(Primary) 버튼 | `rounded-xl py-3 text-sm font-black uppercase tracking-wide bg-indigo-600` | `bg-red-600` 동형 | `rounded-md px-2.5 py-1 text-sm font-bold bg-indigo-600` | `rounded-lg px-2.5 py-1 text-xs font-bold bg-indigo-600` | 공용 Button(`rounded-2xl uppercase tracking-widest`)과 4종 모두 불일치 |
| 버튼 radius | xl / lg(스텝) | xl | md | lg | |
| 버튼 disabled opacity | 40 | 40/50/70 | 30 | 40 | 모달 안에서도 50 vs 70 |
| 링크형 버튼 | `slate-400 underline underline-offset-2` | 동일 | `slate-500 underline decoration-slate-700 underline-offset-2` ("모두 제거") | `indigo-400 hover:underline` | 3종 |
| 섹션 제목 | `uppercase tracking-wider text-slate-400` / `text-slate-400` / `uppercase text-white mb-1.5` | `text-slate-400 mb-1` / `uppercase text-white mb-1.5` | `h1 text-lg font-black` | `h3 text-lg font-black` | 한 파일 안에 3종 |
| 구분선 톤 | `slate-800`, `slate-700/50` | `slate-800`, `slate-800/50` | `slate-800`, `slate-800/30`, `slate-800/60`(h-px) | `slate-800`, `slate-800/60` | 5종 톤 |
| 호버 톤 | `hover:bg-slate-700`(버튼) | 〃 | `hover:bg-slate-800`, `hover:bg-indigo-600/20` | `hover:bg-white/5`(행), `hover:bg-slate-700` | |
| 입력창 | `bg-slate-950 border-slate-600`(input), `bg-slate-800 border-slate-700`(select) | 체크박스만 | `bg-slate-950 border-slate-800`(검색), `bg-slate-800 border-slate-700`(select) | — | 공용 Input/Select 없음 |
| 체크박스 | 네이티브 `accent-indigo-500` | 동일 | 커스텀 `w-4 h-4 rounded border` + Check | — | 같은 앱에서 2종 |
| 금액 표기 | 지역 `formatMoney`(<1M는 전체 달러) | 동일 지역 함수 | 공용 `formatMoney`(`$234K`) | — | 같은 선수 연봉이 화면별로 다르게 보일 수 있음 |
| 패널/카드 | 배경 `bg-slate-900` + `divide-x` | 동일 | — | flat `bg-slate-900`, 보더·라운드 없음 | Card(`rounded-3xl border`)와 모두 불일치 |
| 로고 | — | — | — | real→구→placehold 2단 | 공용 TeamLogo는 구 세트 단일 |
| 숫자 정렬 | 금액 `font-bold text-white` | `w-16 text-right` | `tabular-nums`는 Table 내 `attribute`만 | `tabular-nums`(카운트다운) | Negotiation/Release 금액 열에 tabular-nums 없음 |

### 통합 후보(효과 큰 순)

1. **필터 툴바 + 페이지네이션 묶음 공용화** (FreeAgent ↔ DraftPool)
   - 대상 라인: FA 33~52(타입/연산자), 74~152(`CheckboxFilterDropdown`), 360~370(`getPageNumbers`), 377~391(핸들러), 408~427(검색), 446~496(스탯필터바), 500~513(칩), 626~678(푸터) — DraftPool은 같은 블록이 40~130, 186~196, 203~217, 234~253, 270~339, 406~458에 존재.
   - 제거 줄 수: 한 벌 **263줄**이 두 파일에 각각 존재 → 공용화 시 중복 263줄 제거(신규 공용 파일 약 270줄 신설, 호출부 각 15줄 내외 추가) → **순감 약 230줄** (추정). 모든 블록이 `diff`로 동일 확인됨(주석 3줄만 다름).
   - 선행 조건: (a) `components/common/CheckboxFilterDropdown`, `PaginationFooter`, `StatFilterBar`, `SearchInput` 신설. (b) `LeaderboardView.tsx`의 "페이지 당" 푸터도 같은 계열인지 확인(미열람, 3번째 복제 가능성). (c) 필터 상태 훅 `useStatFilters` 분리. (d) z-index 체계(100/101 vs Dropdown 9999) 결정.

2. **선수 정보 좌측 패널 공용화** (Negotiation ↔ Release)
   - 대상 라인: Negotiation 977~1117(요구 조건 1004~1027 제외 시 113줄), Release 385~497(113줄). 선수 유형·인기도·성격&기분·스카우팅 리포트 4섹션이 `diff -w`로 **코드 동일**(차이는 요구 조건 블록과 주석 4줄뿐).
   - 제거 줄 수: 중복 **113줄**(공용 컴포넌트로 옮기면 두 파일에서 각 ~108줄 감소, 호출 5~6줄). 협상 전용 "요구 조건"은 children 슬롯.
   - 선행 조건: `KeyValueRow`, `SidePanelSection` 선행. 성격 라벨 임계값 매핑(L1073~1077/L454~458)은 PlayerDetailView에도 있다고 주석(미열람) — 서비스 함수로 승격 시 3곳 통합 가능.

3. **NumberStepper / SuffixInput** (Negotiation 내부)
   - 대상 라인: 1241~1274, 1291~1323, 1331~1363(스텝퍼 3그룹 100줄), 1373~1384(루키 배율 12줄).
   - 제거 줄 수: 스텝 버튼 12개(60줄) + 접미사 입력 래퍼 4개(46줄) → 컴포넌트 호출 3~4개(각 약 8줄)로 **약 85줄 제거**(추정; 컴포넌트 신설 약 45줄 별도).
   - 선행 조건: 스텝퍼 프리셋 prop 설계(`['min','-1','+1','max']` + 커스텀 라벨 "-1%"), `disabled` 단일 prop, 버튼 클래스(아이콘 2개의 `hover:text-white` 누락 정리). 현재 사용처가 이 파일뿐이라 공용 승격 우선순위는 낮고 파일 내 추출만으로도 효과.

4. **CapStatusPanel + capInfo 계산** (Negotiation ↔ Release)
   - 대상 라인: Negotiation 1480~1533(54줄) + capInfo memo 555~567(13줄), Release 613~667(55줄) + memo 256~269(14줄).
   - 제거 줄 수: UI **54줄** 중복(라벨 `계약 후`/`방출 후`와 `const capInfo = displayCapInfo;` 1줄 외 동일). memo는 afterPayroll 산식이 달라 prop(`afterPayroll`)로 주입.
   - 선행 조건: `KeyValueRow` 선행, `afterLabel` prop.

5. **로비 버튼·CTA·팀 행 정리**
   - 대상 라인: 소버튼 5종 43줄(446~494), orange CTA 3종 19줄(314~328, 567~572), 팀 행 413~497(85줄).
   - 제거 줄 수: 버튼 5종 → `<Button compact variant=...>` 호출로 **약 25줄 감소**(추정), CTA 19줄 → 3줄×3 = **약 10줄 감소**. orange CTA는 다른 5개 파일에도 있어(grep 근거) `Button variant="cta"` 승격 시 파급 효과 큼.
   - 선행 조건: Button에 `compact`·`rounded`·`uppercase`(타이포 off) prop과 `cta` variant 추가. 이는 **공용 Button API 변경**이므로 전 화면 영향 검토 필요(메모: 디자인 리뉴얼은 명시 요청 시에만).

6. **KeyValueRow / SectionTitle / InlineAlert / PageSpinner / EmptyState / SubPageBar 소형 공용 부품**
   - 대상 라인: kv 행 Neg 19회+Rel 17회+Lobby `InfoRow` 11회(약 76+68+… 줄, 추정), 알림 박스 Neg 1535~1546(11줄)·Rel 691~695(5줄)·Lobby 333~337(5줄), 뒤로가기 바 Neg 937~944·955~963·Rel 372~380(26줄), 스피너/빈 상태 각 파일 7~17줄.
   - 제거 줄 수: 합계 **약 100줄** 감소(추정, 이 중 kv 행이 대부분).
   - 선행 조건: 에러 표시 정책 확정(토스트 vs 인라인) 후 `InlineAlert` 범위 결정.

7. **ConfirmDialog** — Release 713~744(32줄)와 `ResetDataModal`, `DraftAdminPanel`, `AdminTradePanel`, `LeagueSettingsView`, `ScheduleSettingsTab`(grep 근거 "되돌릴 수 없습니다") 통합 후보. 제거 줄 수는 타 파일 미열람이라 산정 불가.

8. **지역 `formatMoney` 2개 → 공용** — Neg L87~93(주석 포함 7줄) + Rel L53~55(3줄) + 각 import 1줄 = **약 12줄** 제거. 효과는 작으나 FA 목록 금액 표기 불일치(`$234K` vs `$234,097`)를 같이 정리할 기회.

### 체크리스트 대조 결과

| 파일 | 매치 수 | 반영 수 | 오탐 수 | 추가 발견 수 |
|---|---|---|---|---|
| MultiNegotiationView | 99 | 82 | 17 | 14 |
| MultiReleaseView | 45 | 37 | 8 | 11 |
| MultiFreeAgentView | 64 | 58 | 6 | 15 |
| LeagueLobbyPanel | 32 | 30 | 2 | 20 |
| **합계** | **240** | **207** | **33** | **60** |

"추가 발견"은 체크리스트에 없던 표 행/패턴을 센 값(표에서 체크리스트 토큰에 해당하지 않는 행을 파일별로 센 대략치, 오차 ±3 추정): 3패널 레이아웃·카드 버블·알림 박스·칩·체크박스·패널 래퍼·헤더 바·안내문·고정 박스·cap 패널 등.

#### 오탐 상세 (33건)
**MultiNegotiationView (17)**
- empty_state 14건 오탐: L83, L162, L318, L326, L418, L419, L497, L595, L880, L895, L1195(전부 주석 내 "없음/없습니다"), L769, L781(채팅 대사 문자열), L1227(`<option>없음 (캡 스페이스)</option>` 선택지 라벨). 진짜 빈 상태는 L946 1건(반영).
- money_short L90: 주석(오탐).
- ovr_calc L321, L707: 판정 로직의 `calculatePlayerOvr` 호출(UI 아님). L980은 OvrBadge 사용으로 반영.
- 중복 매치 참고: row_hover 24행은 L1245, 1250, 1267, 1272, 1295, 1300, 1316, 1321, 1335, 1340, 1356, 1361의 **12개 라인이 토큰 2개씩 중복 집계**(전부 스텝 버튼 12개로 반영).
**MultiReleaseView (8)**
- empty_state: L38, L129, L161, L315, L384, L500(주석), L195(스트레치 불가 사유 문자열), L725(확인 모달 문구). 진짜 빈 상태는 L358(반영).
**MultiFreeAgentView (6)**
- empty_state L184, L246, L606, L607: 주석. ovr_calc L272(주석), L281(정렬용 계산 로직). 진짜 빈 상태 L545(반영).
**LeagueLobbyPanel (2)**
- money_locale L23: `toLocaleString('ko-KR')` 날짜 포맷(금액 아님). empty_state L368: 값 텍스트 "마감 없음"(데이터 표기).

#### 반영 상세(역할별)
- Negotiation: button_raw 16(뒤로 2, 나가기 1, 스텝퍼 12, 제출 1), row_hover 24(스텝 12라인×2토큰), input_raw 6(숫자 4 + 체크박스 2), select_raw 2, header_text 6(라벨 5 + 제출 버튼 `uppercase tracking-wide` 1), divider_b 3(937, 955, 1121), divider_t 6(1031, 1053, 1068, 1097, 1457, 1519), money_short 14(91, 790, 1018, 1414, 1460, 1464, 1489, 1494, 1498, 1503, 1509, 1515, 1522, 1527) + money_full 1(92), spinner 2, ovr_calc 1, empty_state 1.
- Release: button_raw 5(373, 523, 698, 728, 735), row_hover 1(731), input_raw 1(557), header_text 2(546, 701), divider_b 3(372, 674, 681), divider_t 6, money_short 15 + money_full 1, spinner 1, ovr_calc 1(388), empty_state 1(358).
- FreeAgent: button_raw 11, pill_rounded 2, overlay_fixed 1, zindex 4(114, 116, 519, 627), card_box 3, row_hover 5, input_raw 2, select_raw 1, divider_v 21, divider_b/t 각 1, sticky 1(519, TableHead 기본값과 중복), important_ovr 1, ovr_calc 1(565), money_short 1, spinner 1, empty_state 1(545).
- Lobby: button_raw 10, row_hover 2, spinner 5, divider_b 4, tabular 3, logo_fallback 2 + placehold 1, empty_state 3(274, 436, 619).

#### 추가 발견 요약(체크리스트 누락, 대표 항목)
- 3패널 레이아웃 `divide-x` + `flex-[2]/[3]/[5]` (Neg L974/977/1120/1186, Rel L382/385/502/537).
- 채팅 버블 3종(GM/선수/status) Neg L1138~1166, Rel L504~519.
- 알림 박스 3종 Neg L1535/L1542, Rel L691, Lobby L333.
- 뒤로가기 바 3개(Neg L937, L955, Rel L372).
- 체크박스 4개(Neg L1430/L1440, Rel L557, FA 커스텀 L124/L138).
- 위장 읽기전용 박스 2개(Neg L1199, Rel L547).
- FA `<tr>`(TableRow 미사용), TableHead `sticky top-0 z-40` 중복, `OvrBadge !w-7 !h-7 !text-xs !shadow-none` 오버라이드.
- FA 임시 계측(console.log/time) 잔존: L155~165, L278, L284, L303, L316.
- 로비 flat 패널 5개, 마스트헤드 `<img>` 하드코딩 로고, 상태 칩(L310), 목록 헤더 행(L397), 추첨 순번 행(L593), 카운트다운 박스 2개, 소버튼 5종 상세, orange CTA 3종.
- 안내문 색 톤 불일치(`slate-600` vs `slate-500`), `text-green-500` vs `emerald-400`, 옵션 라벨 색 `yellow-400` vs `sky/emerald-400`.
