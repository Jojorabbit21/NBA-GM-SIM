# 개발 히스토리 노트

코드 수정 시(특히 엔진/로직 변경) 전후를 세세히 기록하는 문서. 문제가 생겼을 때 이 문서만 보고
수동 복구(역순 적용)할 수 있는 걸 목표로 한다. **최신 항목이 위로 오도록 역순 추가.**

## 기록 형식

```
## YYYY-MM-DD — 제목

**배경**: 왜 이 변경을 하는지 (어떤 문제/요청에서 시작됐는지)

**변경 파일**:
- `path/to/file.ts` (client)
- `path/to/file.ts` (server 미러)

**Before**:
​```ts
...
​```

**After**:
​```ts
...
​```

**검증**: tsc/build/deploy 결과 요약

**롤백 방법**: Before 블록 내용으로 그대로 되돌리면 됨 (또는 git 커밋 해시)
```

- 미러 쌍(client/server) 변경은 항상 둘 다 기록 — 하나만 롤백하면 미러가 깨지므로 반드시 같이 되돌릴 것.
- 상수/설정값 변경은 값 자체(이전 값 → 이후 값)를 명시.
- 이 문서는 git으로 버전 관리되므로 최악의 경우 `git log -- docs/history/dev-log.md`로도 시점별 상태 추적 가능.

---

## 2026-08-09 — 카드 뷰 팀/점수 비율 7:3, 섹션 순서 종료→진행중→예정으로 변경

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

- `GameCard` 팀/점수 비율: `flex-[6]`/`flex-[4]` → `flex-[7]`/`flex-[3]`.
- 상태별 섹션 스택 순서: `['live','scheduled','final']` → `['final','live','scheduled']`(종료 → 진행중 → 예정).

**검증**: `tsc --noEmit`/`vite build` 통과.

**롤백 방법**: 비율은 `flex-[6]`/`flex-[4]`로, 순서는 `['live','scheduled','final']`로 되돌리면 됨.

---

## 2026-08-09 — 카드 뷰 5열 확장, 팀명/점수 폰트 확대, 상태별 섹션 분리

**배경**: 사용자 요청 3가지 — ① 한 줄에 카드 최대 5개 ② 팀약어/팀이름/점수 폰트를 `text-xl`(모바일은 `text-base`)로 확대 ③ 종료/진행중/예정 경기를 라벨 없이 서로 다른 구역에 배치. ③은 "열"이 정확히 뭘 의미하는지 사용자에게 직접 확인 — "3개 가로 섹션으로 쌓음"(진행중→예정→종료 순서로 위에서 아래로 스택, 각 섹션 내부는 기존처럼 그리드)으로 확정.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

- 카드 그리드에 `2xl:grid-cols-5` 브레이크포인트 추가(`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`).
- `GameCard`의 팀약어/팀이름/점수 span: `text-sm` → `text-base sm:text-xl`(모바일 16px, 그 이상 20px). 리더(PTS/REB/AST) 섹션은 대상 아님(요청에 없었음) — 그대로 `text-sm` 유지.
- 카드 뷰 본문 렌더링을 `activeDayGames.map()` 단일 그리드에서, `(['live','scheduled','final'] as const)` 순서로 순회하며 `getGameDisplayState()`로 필터링한 3개 섹션(각각 독립된 5열 그리드)으로 교체 — 해당 상태 경기가 0개면 그 섹션 자체를 렌더링하지 않음(라벨 없음 요구사항 반영).

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-09 — 카드 뷰 팀/점수 영역 비율 6:4로 고정

**배경**: 사용자 피드백 — 점수 영역이 `shrink-0`(콘텐츠 크기만큼만 차지)이라 점수가 "106"처럼 3자리인 카드와 "-"(예정 경기)인 카드에서 팀 컬러 영역 폭이 서로 달라짐(카드마다 정렬이 안 맞음).

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

- `GameCard` 팀 행: 팀 컬러 영역 `flex-1` → `flex-[6]`, 점수 박스 `shrink-0`(콘텐츠 기반 폭) → `flex-[4]`(비율 기반 폭, `min-w-0` 추가) — 이제 점수 자릿수와 무관하게 항상 6:4 비율 유지.

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**롤백 방법**: `flex-[6]`→`flex-1`, `flex-[4]`→`shrink-0`로 되돌리면 됨.

---

## 2026-08-09 — 카드 뷰 점수 영역 팀 컬러 제거 + 카드 배경 밝게(slate-800)

**배경**: 사용자 피드백 — 카드 뷰 팀 행에서 점수까지 팀 테마 색 배경 안에 들어가 있는 게 과함, 점수 영역은 팀 색 없이 중립으로. 카드 배경도 `bg-slate-900/60`이 너무 어두워서 `bg-slate-800`으로 더 밝게.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

- `GameCard` 팀 행: 기존엔 `[약어][이름]...[점수]`를 팀 컬러 배경 하나(`style={{backgroundColor: colorPrimary}}`) 안에 전부 넣었는데, 이제 `flex items-stretch`로 두 영역을 분리 — 왼쪽(`flex-1`, 팀 컬러 배경)엔 약어+이름만, 오른쪽(`bg-slate-900/70` 고정 중립 배경)엔 점수만 별도 박스로.
- 카드 바깥 배경: `bg-slate-900/60` → `bg-slate-800`(마이팀 카드의 `bg-emerald-500/10`는 유지).

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-07 — 카드 뷰를 리스트와 통일(팀 컬러 배경, 14px 폰트, 카드 그리드 외부 패딩)

**배경**: 사용자 요청 — 카드 그리드는 리스트와 달리 외부 패딩이 필요함(리스트는 화면 가장자리에 붙지만 카드는 여백 필요), 카드 내부 폰트 크기를 리스트와 동일하게(text-sm/14px) 맞춤, 원정/홈 로고 배지를 지우고 리스트(`MatchupTeamBlock`)처럼 팀 배경색을 적용.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

- 카드 그리드 컨테이너에 `p-4` 추가(리스트 테이블은 계속 패딩 없음 — 카드만 예외).
- `GameCard`의 원정/홈 행: `TeamCell`(로고 배지) 호출 제거, `style={{backgroundColor: color_primary, color: color_text}}`로 행 전체를 팀 컬러로 칠하고 그 안에 `[약어] [팀 이름] ... [스코어]`를 한 줄에 표시(리스트의 `MatchupTeamBlock`과 동일한 접근, 다만 카드는 세로로 쌓임). 빈 스코어는 `-`로 표시.
- 이제 카드에서도 안 쓰게 된 `TeamCell` 컴포넌트/`TeamCellProps` 완전 삭제(다른 사용처 없음 확인).
- 카드 내부 텍스트 전부 `text-sm`(14px)로 통일 — 상태 배지(`text-xs`→`text-sm`), 보기 버튼(`text-[11px]`→`text-sm`, 아이콘 11→13), 리더 섹션(`text-[11px]`→`text-sm`). 스코어/시간 표시에서 `font-mono` 제거.

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**알려진 한계**: 라이브 경기의 팀별 승/패 강조(흰색/노란색 텍스트)는 팀 컬러 배경과 충돌할 수 있어 이번에 제거 — 카드 상단의 빨간 LIVE 배지로만 진행 상태를 표시.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-07 — 리스트 행 마이팀 강조 방식 정리(좌측선 제거, 배경 진하게), 매치업 텍스트 볼드

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

- `MatchupTeamBlock`: 내 팀 표시용 `ring-2 ring-inset ring-yellow-400`(노란 테두리) 제거, 이제 안 쓰는 `isMyTeam` prop도 인터페이스/호출부에서 함께 삭제. 팀 이름 span에 `font-bold` 추가(약어는 이미 볼드였음 — 이제 원정/홈 텍스트 전체가 볼드).
- `GameRow` 행 컨테이너: 내 팀 경기 강조를 `border-l-4 border-l-emerald-500 bg-emerald-500/10`(좌측 강조선 + 옅은 배경)에서 `bg-emerald-500/20`(좌측선 삭제, 배경 불투명도 10%→20%로 상향)로 변경. `border-l-4`/`border-l-transparent` 클래스 자체도 제거.

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-07 — 매치업 컬럼 상한 480px + 남는 공간 PTS/REB/AST 균등 분배

**배경**: 실제 화면 스크린샷 피드백 — 매치업 컬럼이 `1fr`로 남는 공간을 전부 가져가서 원정/홈 영역이 화면의 절반 이상을 차지할 정도로 지나치게 넓어짐. "50%까지 줄여도 될거같다" → 이어서 "줄어든 만큼 PTS/REB/AST를 균등하게 늘려달라"는 후속 요청.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

- 매치업 컬럼: `minmax(320px,1fr)` → `minmax(320px,480px)` — 더 이상 `1fr`이 아니라 480px 상한 고정.
- PTS/REB/AST 세 컬럼: 고정 `128px` → `minmax(128px,1fr)` 각각 — 매치업 컬럼이 안 가져가게 된 남는 공간을 이 세 컬럼이 `1fr` 3개로 균등하게 나눠 가짐.

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**롤백 방법**: `minmax(320px,480px)`→`minmax(320px,1fr)`, PTS/REB/AST `minmax(128px,1fr)`→`128px`로 되돌리면 됨.

---

## 2026-08-07 — 매치업 컬럼 최소폭 축소(팀당 180px → 160px)

**변경 파일**: `views/multi/season/MultiScheduleView.tsx` — `SCHEDULE_GRID_COLS`의 매치업 컬럼 `minmax(360px,1fr)` → `minmax(320px,1fr)`(원정/홈이 그 안에서 `flex-1` 50:50 분할이므로 팀당 최소폭 180px→160px). `tsc --noEmit`/`vite build` 통과.

**롤백 방법**: 360px으로 되돌리면 됨.

---

## 2026-08-07 — 리스트 행 디자인 개편(팀 컬러 매치업 블록, 필 스타일 통일)

**배경**: 사용자 요청 — 날짜/시간/라운드 중앙 정렬, 테이블 전체 모노폰트 제거, 원정/홈 컬럼을 로고 배지 대신 "팀 메인 컬러 배경 + [약어] [이름]" 블록으로 바꾸고 그 사이 패딩 제거, 행 높이 확대, PTS/REB/AST/쿼터·상태 컬럼 빈 값은 "-" 표시, 리뷰 버튼도 보기 버튼과 같은 필 스타일 적용.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

- `SCHEDULE_GRID_COLS`을 11컬럼(원정 180px + 홈 minmax 분리)에서 10컬럼(`minmax(360px,1fr)` 매치업 컬럼 하나로 병합)으로 재정의 — grid의 `gap-x-4`가 원정/홈 사이에 끼어드는 걸 원천적으로 막기 위해 두 팀 칸을 하나의 grid 컬럼 안에 넣고 그 안에서 `flex`(gap 없음)로만 나눔.
- 신규 `MatchupTeamBlock` 컴포넌트 — 로고 배지 대신 `style={{backgroundColor: color_primary, color: color_text}}`로 셀 전체를 팀 컬러로 채우고 `[약어] [팀 이름]` 텍스트만 표시. `py-4` 패딩이 이 블록의 실질 높이를 결정하며, grid의 `items-stretch`를 통해 나머지 모든 컬럼도 같은 높이로 늘어나(행 전체가 높아짐) 각 컬럼 내부의 `flex items-center` 래퍼가 콘텐츠를 다시 수직 중앙 정렬한다.
- 기존 `TeamCell`(로고 배지)은 카드 뷰(`GameCard`) 전용으로 남기고 `size` prop(리스트용 'lg' 변형)은 삭제 — 리스트에서는 더 이상 안 씀.
- 날짜/시간/라운드 셀에 `text-center` 추가(라운드는 기존에 없었음), 스코어·쿼터/상태 컬럼과 함께 전부 `font-mono` 제거.
- PTS/REB/AST/쿼터·상태/스코어 컬럼의 빈 값 fallback을 `''`(빈 문자열)에서 `EMPTY_CELL = '-'`로 통일.
- "보기"(라이브/예정)와 "리뷰"(종료) 버튼을 `pillBtn` 공통 클래스로 묶어 동일한 필 모양 적용 — 리뷰는 기존 텍스트 링크 스타일에서 `bg-indigo-600` 필 버튼으로 변경(라이브=빨강, 예정=슬레이트, 종료/리뷰=인디고로 상태별 색상만 다름).

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**알려진 한계**: 매치업 블록의 팀 컬러가 매우 밝은 팀(예: 골든스테이트 옐로우 계열)에서 `color_text`가 비어 있으면 `getReadableTextColor()` 자동 대비색 계산에 의존 — 기존 로고 배지와 동일한 폴백 로직이라 별도 리스크 증가는 없음.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-07 — 연도 드롭다운 제거, 날짜 셀 크기/정렬/폰트 재조정

**배경**: 사용자 피드백 4가지 — ① 날짜 셀 콘텐츠 수직 중앙 정렬 ② 상단 연도 선택 행 제거 ③ 요일 폰트 12px(`text-xs`), 날짜 폰트 16px(`text-base`)로 변경 ④ 날짜 셀 전체 크기 확대 + 셀 사이 간격 확대.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

- `DateControlBar`에서 연도 드롭다운 행 전체 삭제 — `isYearMenuOpen`/`yearMenuRef`/`sortedDates`/`availableYears`/`activeYear`/`selectYear` 관련 state·로직 전부 제거, 날짜 캐러셀 한 줄만 남김.
- 날짜 셀을 `px-2.5 pt-4 pb-1.5`(비대칭 padding 기반) → `w-16 h-16`(고정 정사각형) + `flex flex-col items-center justify-center`로 변경 — padding으로 어림잡던 것 대신 flex 정렬로 콘텐츠가 셀 안에서 정확히 수직/수평 중앙에 온다.
- 요일 span `text-[10px]` → `text-xs`(12px), 날짜 숫자 span `text-sm` → `text-base`(16px).
- 캐러셀 바깥 `<div className="flex items-center gap-0.5">` → `gap-2`로 셀 사이 간격 확대.

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-07 — 날짜 캐러셀 세부 스타일 조정(정사각형 카드, 인디고 강조)

**배경**: 바로 위 항목(연도 드롭다운 + 날짜 캐러셀) 직후 세부 스타일 피드백 4가지: ① 연도 폰트 `text-xs`→`text-sm`, 좌우 구분선 삭제 ② 둘째 줄 날짜 카드가 정사각형이 되도록 상단 패딩 확대 ③ 날짜 숫자 폰트를 모노 대신 기본 폰트로 ④ 활성 날짜 카드와 `<`/`>` 화살표에 인디고 색상 적용.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

- 연도 버튼: `text-xs`→`text-sm`, 좌우 `flex-1 h-px bg-slate-700` 구분선 두 개와 그걸 감싸던 `max-w-[220px]` 래퍼 삭제(버튼만 중앙에 남김).
- 날짜 카드(`CAROUSEL_OFFSETS` 렌더): `px-2.5 py-1.5` → `px-2.5 pt-4 pb-1.5`(상단 패딩만 확대해 정사각형에 가깝게), 날짜 숫자 span에서 `font-mono` 제거(`ko-normal` 기본 폰트 적용, `tabular-nums`는 유지).
- 활성(가운데) 카드: `bg-slate-700`/`bg-slate-600` → `bg-indigo-600`/`bg-indigo-500`(열림 상태), 요일 라벨 색상도 `text-slate-300`→`text-indigo-200`.
- 좌우 이동 화살표(`<`/`>`): `text-slate-400 hover:bg-slate-700/60` → `text-indigo-400 hover:bg-indigo-500/20 hover:text-white`.

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-07 — 헤더 날짜 컨트롤을 연도 드롭다운 + 날짜 캐러셀로 재설계, 헤더 3영역 2:6:2 고정폭

**배경**: 사용자가 모바일 스케줄 앱 레퍼런스 이미지와 함께 정확한 레이아웃 시안 제시 — 날짜 컨트롤을 2단으로: 1단은 연도만 중앙에(클릭 시 시즌이 걸쳐 있는 연도 드롭다운, 예: 2026년 개막이면 2026/2027), 2단은 `[<] [-3일] [-2일] [-1일] [선택일] [+1일] [+2일] [+3일] [>]` 형태의 날짜 캐러셀(가운데 칸은 클릭 시 데이트피커). 날짜 포맷은 `mm.dd`. 또한 헤더의 `[시즌 일정] [날짜필터] [리스트/카드]` 3영역 폭을 2:6:2로 고정해 날짜필터가 항상 정확히 가운데 오도록.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`, `views/multi/season/multiScheduleUtils.ts`

**날짜 컨트롤**:
- `fmtMonthDot(dateKey)` 신규(multiScheduleUtils.ts) — "YYYY-MM-DD" 문자열에서 바로 "MM.DD" 추출(Date 파싱 불필요).
- `DateControlBar` 전면 재작성: 이전의 저번달/저번주/어제/[날짜라벨]/내일/다음주/다음달 7버튼 한 줄 구성을 걷어내고, ①연도 행(좌우 얇은 구분선 사이에 연도 텍스트, 클릭 시 드롭다운으로 시즌이 걸쳐 있는 연도만 선택 — `selectableDates`에서 연도 집합을 뽑아 계산) ②날짜 캐러셀 행(`activeDate` 기준 -3~+3일, 각 칸은 요일+`MM.DD` 표기, 비활성 칸 클릭 시 해당 날짜로 바로 이동, 가운데 활성 칸만 클릭 시 `MonthCalendarPopover`가 뜸 — "오늘 날짜(=현재 선택된 날짜) 클릭 시 데이트피커" 요구사항 반영, 좌우 화살표는 하루씩 이동)로 교체.
- `addMonthsToKey`/`fmtFullDate` import 제거(더 이상 이 파일에서 안 씀 — 함수 자체는 다른 곳에서 쓸 수 있어 유지).

**헤더 3영역 폭**:
- 헤더 컨테이너를 `flex justify-between`에서 `grid grid-cols-[2fr_6fr_2fr]`로 교체 — 타이틀(20%)·날짜 컨트롤(60%, 내부 `flex justify-center`)·리스트/카드 토글(20%, `justify-self-end`)이 콘텐츠 폭과 무관하게 항상 정확한 비율로 고정되어 날짜 컨트롤이 화면 중앙에서 벗어나지 않는다(기존 `justify-between`은 양옆 아이템 폭에 따라 가운데 그룹 위치가 미묘하게 어긋날 수 있었음).

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**알려진 한계**: "캐러셀 슬라이드"는 레이아웃/상호작용 패턴(하루씩 넘기는 날짜 스트립)만 구현했고, 날짜 전환 시 실제 슬라이드 애니메이션(트랜지션 효과)은 추가하지 않음 — 필요하면 별도 요청.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-07 — 일정 화면 데이트피커를 라이브게임뷰와 동일한 월간 달력으로 통일

**배경**: 사용자 피드백 — "라이브게임뷰 상단의 날짜를 누르면 나오는 데이트피커랑 다른데?" 직전 커밋에서 `MultiScheduleView.tsx`의 날짜 컨트롤 바에 네이티브 `<input type="date">`(`showPicker()`) 방식을 적용했는데, `MultiGamePbpView.tsx`의 `GameDateStrip`(라이브게임뷰 상단 날짜 셀렉터)은 이미 자체 제작한 월간 달력 드롭다운(`fixed` 위치의 커스텀 그리드, 경기 있는 날짜만 선택 가능)을 쓰고 있어서 두 화면의 데이트피커 모양이 서로 달랐다.

**변경 파일**:
- 신규 `views/multi/season/MonthCalendarPopover.tsx` — `GameDateStrip`에 있던 월간 달력 드롭다운(월 이동 화살표 + 요일 헤더 + 날짜 그리드, `selectableDates`에 없는 날짜는 비활성) 을 그대로 뽑아 공용 컴포넌트화.
- `views/multi/season/MultiGamePbpView.tsx` — `GameDateStrip`의 인라인 달력 렌더링 블록(~60줄)을 `<MonthCalendarPopover>` 호출로 교체(동작/스타일 100% 동일, 로직만 이동).
- `views/multi/season/MultiScheduleView.tsx` — `DateControlBar`의 네이티브 `<input type="date">`/`showPicker()` 구현을 제거하고, `GameDateStrip`과 동일한 트리거 버튼(클릭 시 `getBoundingClientRect()`로 위치 계산) + `<MonthCalendarPopover>` 패턴으로 교체. `selectableDates`는 `groupedByDay`에서 뽑은 dateKey 집합(`scheduleDateSet`)을 새 prop으로 전달 — 경기가 있는 날짜만 선택 가능(GameDateStrip과 동일 제약).

**검증**: `tsc --noEmit`/`vite build` 통과, 두 파일 모두 중괄호 balance 스크립트로 확인. 이제 두 화면의 데이트피커는 동일한 컴포넌트를 공유하므로 앞으로 한쪽만 바뀌고 다른 쪽이 안 바뀌는 드리프트가 구조적으로 불가능해짐.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨. `MonthCalendarPopover.tsx`는 신규 파일이라 롤백 시 그냥 삭제.

---

## 2026-08-07 — 헤더 날짜 클릭 시 데이트피커 확실히 뜨도록 수정

**배경**: 사용자 피드백 — "헤더 가운데의 날짜를 누르면 데이트피커가 뜨도록 해줘." 기존 구현은 보이는 날짜 라벨을 `<label>`로 감싸고 그 안에 `opacity-0` `<input type="date">`를 겹쳐서, label 클릭 시 브라우저가 자동으로 내부 input에 클릭을 위임하는 방식이었다 — 그런데 이 간접 클릭 위임 방식은 브라우저/버전에 따라 네이티브 데이트피커가 안 뜨고 포커스만 잡히는 경우가 있어 신뢰할 수 없었다.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

**Before**:
```tsx
<label className="... cursor-pointer ...">
    {fmtFullDate(activeDate)}
    <input type="date" value={activeDate} onChange={...} className="absolute inset-0 opacity-0 cursor-pointer" />
</label>
```

**After**:
```tsx
const dateInputRef = useRef<HTMLInputElement>(null);
const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
};
...
<div className="relative">
    <button type="button" onClick={openDatePicker} className="...">{fmtFullDate(activeDate)}</button>
    <input ref={dateInputRef} type="date" value={activeDate} onChange={...} tabIndex={-1} className="absolute inset-0 opacity-0 pointer-events-none" />
</div>
```
보이는 버튼의 클릭 핸들러가 `HTMLInputElement.showPicker()`를 직접 호출해 피커를 확실히 띄우고(Chrome/Edge/Firefox 최신 버전 지원), 미지원 브라우저는 `input.click()`로 폴백한다. 숨겨진 input은 `pointer-events-none`으로 만들어 클릭 이벤트가 오직 버튼에서만 발생하도록 정리.

**검증**: `tsc --noEmit`/`vite build` 통과.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-07 — 시즌 일정 헤더/바디 완전 플랫화(slate) + 테이블 14px + 컬럼폭 고정

**배경**: 바로 위 항목(인디고 헤더 통합) 직후 사용자가 정확한 레이아웃 시안을 제시 — 헤더를 `[시즌 일정] ── [저번달][저번주][어제][날짜][내일][다음주][다음달] ── [리스트/카드]` 한 줄로 완전히 압축, 색상은 인디고 대신 slate(배경과는 구분되게), 페이지 패딩/컨테이너 박스(둥근 모서리·테두리 카드)를 전부 제거해 헤더·바디가 화면 가장자리에 딱 붙게. 바디도 동일하게 컨테이너 해체 + 패딩 삭제, 내부 테이블은 보더 라디우스만 삭제(테두리는 유지), 헤더 컬럼과 바디 컬럼 폭이 정확히 일치하도록, 폰트는 14px 고정.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`, `views/multi/season/multiScheduleUtils.ts`

**헤더**:
- 타이틀/통계 2줄 + 별도 날짜요약 블록을 전부 걷어내고 `시즌 일정` 타이틀 하나 + `DateControlBar` + 리스트/카드 토글, 딱 한 줄(`flex justify-between`)로 압축. "전체 X경기 · 완료 · 잔여" 통계 텍스트는 이번 레이아웃에 자리가 없어 제거.
- 컨테이너를 인디고 `rounded-xl border bg-indigo-950/30` 박스에서 `bg-slate-900 border-b border-slate-800`(테두리 없는 색상 띠, 하단 구분선만) 슬레이트 테마로 교체 — 페이지 배경(`bg-slate-950`, 부모 레이아웃)과는 구분되지만 둥근 모서리/박스 테두리는 없음.
- `DateControlBar`: 좌우 화살표 아이콘(ChevronLeft/Right) → "어제"/"내일" 텍스트 버튼으로 교체, "오늘" 버튼 제거(요청된 레이아웃에 없음), 날짜 라벨 칩 `bg-indigo-600`→`bg-slate-700`, 버튼 색상도 인디고→슬레이트 톤.
- `fmtFullDate()`(multiScheduleUtils.ts): `"2026년 10월 24일 (금)"` → `"2026년 10월 24일 금요일"`(괄호 제거, "요일" 접미사 풀네임).

**바디**:
- 페이지 최상위 래퍼의 `p-6` 제거(헤더/바디가 뷰포트 가장자리에 완전히 붙음).
- 리스트/카드 공통으로 감싸던 `rounded-xl border border-slate-800 bg-slate-900/40 p-4` 컨테이너 완전 삭제 — 리스트/카드가 바로 페이지 위에 렌더링됨.
- 리스트 테이블 래퍼: `rounded-lg border border-slate-800 overflow-hidden overflow-x-auto` → `border border-slate-800 overflow-x-auto`(테두리는 유지, 라운딩만 제거).
- `SCHEDULE_GRID_COLS`을 `auto` 없는 완전 고정폭(`56px_64px_64px_180px_minmax(180px,1fr)_128px_128px_128px_72px_80px_72px`)으로 재정의 — `COLUMN_HEADER`와 `GameRow`가 서로 다른(행마다 독립적인) grid 컨테이너라 `auto` 트랙은 인스턴스마다 따로 계산될 여지가 있었는데, 전부 고정값/`1fr`로 바꿔 컬럼폭이 항상 정확히 일치하도록 함. 각 셀에 남아있던 중복 `w-10`/`w-12`/`w-28`/`w-16` 등도 제거(그리드 템플릿이 이미 폭을 강제하므로).
- `GameRow`/`COLUMN_HEADER`/`TeamCell`(size="lg" 재정의)의 텍스트를 전부 `text-xs`(12px)/`text-base`(16px) 혼재에서 `text-sm`(14px)로 통일 — 팀명, PTS/REB/AST, 스코어, 쿼터/상태, 보기 버튼, LIVE 배지까지 전부 포함.

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**알려진 한계**: 통계 요약("전체 X경기 · 완료 · 잔여")과 "오늘" 바로가기 버튼이 이번 레이아웃에서 빠짐 — 필요 시 별도 요청으로 복원.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-07 — 시즌 일정 헤더 통합(인디고) + 리스트 폰트 크기 원복

**배경**: 바로 위 항목(골조 정리 + 16px 확대) 직후 두 가지 후속 요청. (1) "상단의 시즌일정 헤더와 리스트/카드 전환 셀렉터, 날짜 셀렉터 그룹을 하나의 헤더로 합치고, 색상을 인디고로 변경해" — 세 그룹이 각각 따로 배치돼 있던 걸 하나로 통합. (2) "리스트의 폰트 사이즈는 이전으로 다시 돌려줘" — 카드 뷰와 별개로 리스트 테이블만 16px 확대가 과했다는 판단, 원래 크기(text-xs 등)로 복귀 요청.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

**(1) 헤더 통합 + 인디고 컬러**:
- 타이틀/통계, 리스트·카드 토글, 날짜 컨트롤 바, 선택 날짜 요약을 `rounded-xl border border-indigo-800/40 bg-indigo-950/30` 패널 하나로 합침(내부는 `border-t border-indigo-800/30`로만 구분).
- `DateControlBar`: 버튼 색상을 `text-slate-300 hover:bg-slate-800` → `text-indigo-200 hover:bg-indigo-500/20`으로, 날짜 라벨 칩 배경을 `bg-slate-800` → `bg-indigo-600`(GameDateStrip의 기존 인디고 칩과 동일 톤)으로 변경.
- 보기 모드 토글: 비활성 버튼도 `text-slate-400` → `text-indigo-300 hover:bg-indigo-800/40`으로 인디고 톤 통일. 컨테이너 배경 `bg-slate-800/60` → `bg-indigo-900/40`.
- 표/카드 본문은 별도의 중립(slate) 패널로 유지(데이터 가독성 우선, 인디고 적용 대상 아님).

**(2) 리스트 폰트 크기 원복**:
- `GameRow`/`COLUMN_HEADER`: `text-base`/`text-lg` → 전부 원래의 `text-xs`/`text-[10px]`로 복귀. `SCHEDULE_GRID_COLS`도 넓혔던 픽셀 폭(`72px_72px_88px_minmax(190px,1fr)...`)을 원래의 `auto_auto_auto_160px_1fr_auto_auto_auto_auto_auto_auto`로 되돌리고, 각 셀의 `w-10`/`w-12`/`w-14`/`w-28`/`w-16` 고정폭도 복원.
- `TeamCell`의 `size="lg"` 호출 제거(기본값 `'sm'`으로 카드 뷰와 동일 크기 사용).
- 행 패딩(`py-3.5`→`py-2`), 보기 버튼(`h-8 px-3 text-sm`→`h-5 px-2 text-[10px]`) 등 텍스트 크기와 짝을 이루던 여백도 함께 원복.
- 유지된 것(폰트 크기와 무관한 구조 개선): 마이팀 경기 좌측 강조선(`border-l-4 emerald`), 눈에 보이는 지브라(`bg-slate-800/25`)와 행 호버, 헤더 행 솔리드 배경(`bg-slate-800/60`).

**검증**: `tsc --noEmit`/`vite build` 통과, 중괄호 balance 스크립트로 확인.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-07 — 시즌 일정 화면 레이아웃 골조 정리 + 테이블 텍스트 16px 이상으로 확대

**배경**: 사용자 피드백 — "다크 테마 위에 밝은 텍스트들만 덩어리 구분 없이 뼈대 없이 흩어져 있어 눈에 안 들어온다." 리스트 테이블이 `text-xs`(12px)/`text-[10px]`/`text-[11px]` 위주였고, 행 구분도 `bg-white/[0.025]`(2.5% 불투명도) 지브라라 사실상 안 보였음. 날짜 컨트롤 바와 표/카드 본문도 페이지 배경 위에 그냥 떠 있어 하나의 화면인지 구분이 안 됨.

**변경 파일**: `views/multi/season/MultiScheduleView.tsx`

**Before**:
- 리스트 테이블: `grid-cols-[auto_auto_auto_160px_1fr_auto_auto_auto_auto_auto_auto]`, 셀 텍스트 전부 `text-xs` 이하, 지브라 `bg-white/[0.025]`, 마이팀 강조는 `bg-emerald-500/20` 전체 채색뿐.
- 날짜 컨트롤 바 + 리스트/카드 본문이 페이지 배경(`p-6`) 위에 바로 노출 — 감싸는 패널 없음.

**After**:
- `SCHEDULE_GRID_COLS` 신규 상수(`72px_72px_88px_minmax(190px,1fr)_minmax(190px,1fr)_160px_160px_160px_92px_110px_88px`)로 컬럼 폭을 넉넉하게 재설계, 모든 셀 텍스트를 `text-base`(16px, 스코어는 `text-lg`=18px)로 통일. `TeamCell`에 `size?: 'sm'|'lg'` 프롭 추가(카드 뷰는 기존 크기 유지, 리스트는 `size="lg"`로 로고/이름 확대).
- 행 구분: 지브라를 `bg-slate-800/25`로 눈에 보이게 올리고, `hover:bg-slate-800/40` 추가, 마이팀 경기는 색 채우기 대신 `border-l-4 border-l-emerald-500` 좌측 강조선으로 변경(골조 느낌 강화).
- 페이지 구조: 날짜 컨트롤 바 + 날짜 요약 + 본문(리스트/카드)을 `rounded-xl border border-slate-800 bg-slate-900/40` 패널 하나로 감싸고, 날짜 컨트롤 바는 그 안에서 `bg-slate-950/40 border-b` 툴바 스트립으로 분리. 리스트 테이블도 `rounded-lg border border-slate-800 overflow-x-auto`로 감싸 하나의 박스로 보이게 함.
- `COLUMN_HEADER`도 `bg-slate-800/60` 솔리드 배경 + `text-base font-semibold`로 통일.

**검증**: `tsc --noEmit`/`vite build` 통과, 전체 파일 중괄호 balance 스크립트로 확인.

**알려진 한계**: 컬럼 폭 합이 넓어져 좁은 화면에서는 테이블에 가로 스크롤이 생김(글자를 다시 줄이지 않기 위한 의도적 트레이드오프). 카드 뷰 내부 타이포는 이번 범위에서 손대지 않음(원래도 카드 자체 테두리로 구조가 있어 지적 대상이 아니었음).

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-07 — 시즌 일정 화면에 카드 보기 모드 추가 (리스트/카드 토글)

**배경**: 메인리그는 최대 1230경기가 하나의 리스트로 전부 스크롤되어 특정 날짜 경기를 찾기 힘들다는 피드백. 기존 리스트 뷰(`MultiScheduleView.tsx`)는 그대로 유지하되, 하루 단위로 경기를 카드 그리드로 보여주는 보기 모드를 토글 옵션으로 추가.

**변경 파일**:
- `services/multi/gameLeadersCache.ts` — `StatLeader`에 `position?: string` 추가(카드에 "이름 포지션" 표기용).
- `views/multi/season/MultiScheduleView.tsx` — `computeGameLeaders()`가 `position`도 함께 담도록 수정. `GameCard`(카드 1장), `DateControlBar`(날짜 컨트롤 바) 신규 컴포넌트 추가. 메인 컴포넌트에 `viewMode`('list'|'card', localStorage 영속) 상태와 `selectedCardDate`(카드 뷰에서 보고 있는 날짜, 최초 진입 시 "오늘"로 자동 선택) 상태 추가. 상단에 리스트/카드 토글 버튼, 카드 모드일 때 `groupedByDay`에서 선택된 날짜의 경기만 4열 반응형 그리드(`grid-cols-1 sm:2 lg:3 xl:4`)로 렌더링.
- `views/multi/season/multiScheduleUtils.ts` — `addDaysToKey`/`addMonthsToKey`(날짜 컨트롤 바의 저번주/저번달 등 이동용, 로컬 Y/M/D 컴포넌트로만 계산해 UTC 변환 밀림 방지), `fmtFullDate`(연도 포함 날짜 라벨) 신규 추가.

**카드 디자인**: 상태 배지(Final/진행중 쿼터+클락/예정 시각) + 보기 버튼 → 원정/홈 팀 로고+이름+점수(진행중 경기는 리스트 뷰와 동일하게 이기는 팀 흰색 강조) → 종료된 경기만 PTS/REB/AST 리더(이름+포지션+기록) 표시. 날짜 컨트롤 바는 `[저번달][저번주][<][일자(datepicker)][>][다음주][다음달] ------- [오늘]` 구조, "일자" 라벨은 투명 `<input type="date">`를 겹쳐서 클릭 시 브라우저 네이티브 데이트피커가 뜨도록 구현(커스텀 캘린더 팝오버는 이번 범위에서 제외).

**검증**: `tsc --noEmit`/`vite build` 통과 확인.

**알려진 한계**:
- "달력"(월간 그리드) 보기 모드는 이번 범위에서 제외 — 사용자 확인 결과 이번엔 리스트/카드 2종만 구현하기로 결정, 별도 요청 시 추가 예정.
- 날짜 이동은 로컬 `Date.setMonth()`/`setDate()` 기반이라 월말 날짜(예: 1/31 -1개월)에서 JS 자체의 날짜 오버플로 처리를 그대로 따름(별도 보정 없음).

**[후속 수정, 같은 날]**: 사용자 피드백 — "리스트도 날짜를 선택해서 하루치 일정만 보여주면 좋겠음". 처음엔 카드 모드만 날짜 필터가 적용되고 리스트 모드는 여전히 전체 기간이 한 번에 스크롤되는 구조였음. `selectedCardDate`/`activeCardDate`/`cardDayGames`를 `selectedDate`/`activeDate`/`activeDayGames`로 일반화해 리스트/카드 두 모드가 `DateControlBar`와 "선택된 하루치 경기만" 필터링을 공유하도록 변경 — 리스트 모드도 이제 `groupedByDay.map()`으로 전체 날짜를 순회하는 대신 `activeDayGroup` 하나만 렌더링. `tsc --noEmit`/`vite build` 재확인.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨. `nbagm:scheduleViewMode` localStorage 키는 신규 값이라 롤백해도 기존 동작에 영향 없음.

---

## 2026-08-06 — 헤더에 메인리그 가상 시즌 날짜 표시 + "오늘" 배지 회귀 수정

**배경**: 위 항목(가상 시즌 캘린더/실제 실행 시각 분리)에 이어 사용자 요청 — 메인리그(main_league) 세션의 헤더 우측 "다음 경기 · 정규시즌" 텍스트를 지우고 그 자리에 현재 시뮬레이션 날짜(가상 캘린더 기준)를 text-base로 표시, 내 팀에 다음 일정이 없으면 날짜만 표시. 구현 중 직전 변경의 회귀를 하나 발견: `MultiScheduleView.tsx`의 "오늘" 배지 판정(`dateKey === currentSimDate`)이 `currentSimDate`(useSeasonContext → `rooms.sim_date`, 서버가 `scheduled_at` 기준 실제 KST 날짜로 갱신)와 비교하는데, `dateKey`는 직전 변경으로 메인리그에서 가상 날짜가 됐으므로 둘이 영원히 일치하지 않게 됨 — 같이 수정.

**변경 파일**:
- `views/multi/season/multiScheduleUtils.ts` — `findCurrentVirtualDate(games, simStart, gprd, nowMs)` 신규: 리그 전체 일정 중 지금과 실제 방송 시각이 가장 가까운 경기를 찾아 그 경기의 가상 `date`를 반환. `MultiHeader.tsx`/`MultiScheduleView.tsx`가 공유.
- `components/MultiHeader.tsx` — `fmtVirtualDate()` 신규(연도 포함 "YYYY년 M월 D일" 포맷). `nextGame && countdown` 분기에서 `league.type==='main_league' && !nextGame.isPlayoff`일 때 "다음 경기 · 정규시즌" 줄 대신 `fmtVirtualDate(nextGame.date)`를 text-base로 표시(플레이오프는 기존 라운드/스코어 표시 유지). "예정된 경기 없음" 폴백도 `currentVirtualDate`(전체 일정 기준 findCurrentVirtualDate) 있으면 날짜만 표시.
- `views/multi/season/MultiScheduleView.tsx` — `isToday` 판정을 `preferVirtual`일 때 `findCurrentVirtualDate(allGames, simStart, gprd, ...)` 결과와 비교하도록 수정(그 외엔 기존 `currentSimDate` 그대로).

**검증**: 수정 파일 전체 `tsc --noEmit`/`vite build` 통과 확인.

**알려진 한계**:
- `findCurrentVirtualDate`는 "리그 전체 일정 중 지금과 가장 가까운 경기"를 기준으로 하므로, 시즌 시작 전에는 첫 경기 날짜를, 시즌 완전 종료 후에는 마지막 경기 날짜를 "오늘"로 보여준다(의도된 근사치).
- 메인리그 플레이오프 진입 후에는 가상 날짜 개념이 없으므로(플레이오프는 시드 기반 실제 시각으로 새로 생성) 헤더/오늘배지 모두 자동으로 기존 실제 시각 기반 표시로 되돌아간다.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨.

---

## 2026-08-06 — 가상(fictional) 시즌 캘린더와 실제 실행 시각 분리

**배경**: 메인리그 구현 직후 사용자가 지적: "생성된 일정에서 사용자에게 보이는 날짜/시간(예: 2027년 10월 24일 19:00)과 그 경기가 실제로 시뮬레이션되는 시각(압축된 실제 KST, 예: 2026년 8월 6일 17:00)은 서로 다른 개념이어야 하고, 후자는 사용자에게 절대 노출되면 안 된다." 그런데 직전 구현(`leagueScheduleCompressor.ts`)은 정반대로 동작하고 있었다 — `date`/`time`을 매번 `scheduledAt`(실제 압축 시각) 기준으로 덮어써서 생성기가 만든 가상 캘린더가 통째로 사라지고, 클라이언트의 `kstDateKey`/`fmtTime`도 `scheduledAt`을 우선 사용해 화면에 실제 실행 시각이 그대로 노출되는 구조였다. 또한 가상 시즌의 "연도"(예: 2027) 자체를 관리자가 지정할 방법이 없었다(`nowDate.getFullYear()` 하드코딩).

**설계**: `date`/`time`(가상 NBA 캘린더 표시값)과 `scheduledAt`(실제 압축 실행 시각, 내부 스케줄링/라이브 상태 판정 전용)을 완전히 분리해서 유지한다. 단, 플레이오프(`isPlayoff=true`)는 시드 기반으로 새로 생성되며 애초에 `date`/`time`이 `scheduledAt`과 같은 실제 시각에서 파생되므로(자정 경계 보정을 위해) 기존처럼 `scheduledAt` 우선을 유지 — 즉 "가상 캘린더 우선 표시"는 `league.type==='main_league' && !game.isPlayoff`인 경우에만 적용한다.

**변경 파일**:
- DB: `migrations/league_virtual_season_year.sql` — `leagues.virtual_season_year integer` 추가(nullable, 미지정 시 서버가 생성 시점 실제 연도로 폴백).
- `server/src/shared/leagueScheduleCompressor.ts` — `compressLeagueSchedule()`에서 `date`/`time` 덮어쓰기 완전 제거. 이제 `game_seq`/`scheduledAt`만 갱신하고, 생성기가 붙인 가상 캘린더 `date`/`time`은 그대로 보존.
- `server/src/finalize.ts` — `forceInitSchedule`/`finalizeDraft` 양쪽 모두 `leagues` select에 `virtual_season_year` 추가, `const virtualSeasonYear = nowDate.getFullYear()` → `league.virtual_season_year ?? nowDate.getFullYear()`.
- `views/multi/season/multiScheduleUtils.ts` — `kstDateKey`/`fmtDateShort`/`fmtTime`/`groupByDay`에 `preferVirtual` 파라미터(기본 `false`) 추가. `preferVirtual && !g.isPlayoff`일 때만 `date`/`time`을 그대로 반환, 아니면 기존처럼 `scheduledAt` 우선(토너먼트/플레이오프 자정 경계 보정 로직 그대로 유지).
- `views/multi/season/MultiScheduleView.tsx` — `preferVirtual = league?.type === 'main_league'` 계산, `GameRow`/`groupByDay` 호출부에 전파.
- `views/multi/season/MultiGamePbpView.tsx` — `GameDateStripProps`에 `preferVirtual` 추가, `groupByDay`/`kstDateKey` 호출부에 전파, 렌더 호출부에서 `league?.type === 'main_league'` 전달.
- `components/multi/CreateLeagueModal.tsx` — `virtualSeasonYear` state(기본값 `현재연도+1`) + 숫자 입력 UI 추가, `createLeague()` options에 포함.
- `services/multi/leagueService.ts` — `CreateLeagueParams.options`에 `virtualSeasonYear` 추가, `payload.virtual_season_year` 매핑.

**Before** (`leagueScheduleCompressor.ts`, 발췌):
```ts
return {
    ...g,
    game_seq:    i,
    scheduledAt: scheduledAt.toISOString(),
    date: kstDateStr(scheduledAt),   // 가상 캘린더를 실제 시각으로 덮어씀 — 버그
    time: kstTimeStr(scheduledAt),
};
```
`multiScheduleUtils.ts`(발췌):
```ts
export function kstDateKey(g: Game): string {
    if (g.scheduledAt) { /* scheduledAt 무조건 우선 */ }
    return g.date.slice(0, 10);
}
```

**After**:
```ts
// leagueScheduleCompressor.ts
return { ...g, game_seq: i, scheduledAt: scheduledAt.toISOString() }; // date/time 보존

// multiScheduleUtils.ts
export function kstDateKey(g: Game, preferVirtual = false): string {
    if (preferVirtual && !g.isPlayoff) return g.date.slice(0, 10); // 가상 캘린더 우선
    if (g.scheduledAt) { /* 기존 로직 그대로 */ }
    return g.date.slice(0, 10);
}
```

**검증**: 수정한 서버(`finalize.ts`, `leagueScheduleCompressor.ts`)와 클라이언트(`multiScheduleUtils.ts`, `MultiScheduleView.tsx`, `MultiGamePbpView.tsx`, `CreateLeagueModal.tsx`, `leagueService.ts`) 파일 전부 `tsc --noEmit`에 새 에러 없음 확인(기존에 있던 무관 에러만 남음). 마이그레이션은 Supabase MCP로 직접 적용 완료. 실제 30팀 메인리그 생성 후 화면에 가상 캘린더 날짜가 뜨는지 E2E는 배포 후 확인 필요.

**알려진 한계**:
- `virtual_season_year`를 지정 안 하면 리그 "생성 시점"의 실제 연도로 폴백 — 예를 들어 2026년 12월에 생성하면 가상 시즌도 2026-27 시즌으로 시작(사용자가 원하면 UI에서 직접 다른 연도를 입력해야 함).
- `preferVirtual` 판정은 `league.type`에만 의존 — 메인리그의 정규시즌 경기(`isPlayoff=false`)만 가상 캘린더를 쓰고, 같은 리그의 플레이오프 경기는 자동으로 실제 시각 표시로 전환됨(의도된 동작).
- 기존에 이미 생성된(구버전 코드로 생성된) 메인리그가 있다면 `date`/`time`이 이미 `scheduledAt`과 동일한 값으로 덮어써진 상태라, 이번 수정 이후에도 그 리그의 표시는 달라지지 않음(가상 캘린더가 애초에 저장 시점에 유실됐으므로) — 새로 생성되는 리그부터 정상 적용.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨. `virtual_season_year` 컬럼은 nullable이라 롤백해도 기존 데이터에 영향 없음.

---

## 2026-08-06 — 메인리그(정규시즌) 스케줄 압축 + 플레이오프 자동 전환 구현

**배경**: 멀티플레이어에 `leagues.type='main_league'`("메인리그") UI/타입이 절반쯤 만들어져 있었으나(생성 모달, 시즌 기간 1~4주 선택 등) 실제로 동작하는 리그는 0개였다. 원인 3가지: ① 시즌 기간(1~4주) UI가 있지만 `createLeague()`에 실려가지 않는 display-only 미리보기였음, ② `finalize.ts`가 "관리자가 정한 리그 기간"과 "생성기가 필요로 하는 가상 NBA 시즌 캘린더 길이"를 혼동해서, 1주(7일)짜리 가상 캘린더로 82경기×30팀(1,230경기)을 배치하려 해 B2B/3-in-3 제약을 지킬 수 없는 상태였음, ③ 정규시즌이 끝나도 완료 판정(series_id 기반)이 안 걸려서 아무 일도 안 일어남 — 플레이오프 전환/리그 종료 처리가 전혀 없었음. 부수적으로 기존 토너먼트 브라켓의 팀 배정이 "랜덤 셔플 후 인접 페어링"이라 정규시즌 성적 기반 시드(1위 vs 8위)를 만들 수 없다는 것도 확인됨.

**설계 원칙**: `scheduleGenerator.ts`(이미 검증된 82경기 알고리즘)는 건드리지 않고, 그 출력을 실제 시간으로 재배치하는 압축 단계를 새로 추가. 정규시즌 종료 후 플레이오프는 기존 토너먼트 엔진(`initializeTournamentBracket`)에 랜덤 셔플 대신 시드 순서만 넘겨서 재사용 — 그 이후 진행/완료 판정/아카이브는 games 테이블 마이그레이션 때 이미 `league.type`을 안 가리는 구조로 통합해 둔 `simRunner.ts`/`scheduler.ts`가 무수정으로 그대로 처리한다.

**변경 파일**:
- DB: `migrations/league_schedule_config.sql` — `leagues`에 `duration_weeks`/`daily_window_start_min`/`daily_window_end_min`/`playoff_team_count`(기본 8) 추가.
- 신규 `server/src/shared/kst.ts` — KST(UTC+9) 고정 오프셋 날짜/시간 헬퍼(클라이언트 `AdminSimView.tsx`의 `KST_OFFSET_MS` 패턴 서버 이식).
- 신규 `server/src/shared/leagueScheduleCompressor.ts` — `compressLeagueSchedule()`: 생성기 출력(이미 시간순 정렬된 `Game[]`)을 `durationWeeks*7`일 버킷으로 순서대로 나누고, 각 버킷 안에서는 `dailyWindowStart~End` 안에 균등 간격 배치. `game_seq`/`scheduledAt`/`date`/`time`을 SSOT로 덮어씀.
- `server/src/finalize.ts` — `forceInitSchedule`/`finalizeDraft`의 non-tournament 분기 전면 교체: 가상 캘린더를 관리자 설정과 무관하게 항상 고정(`{연도}-10-21`~`{연도+1}-04-13`)으로 만들고, `compressLeagueSchedule()`로 실제 압축. 기존 `adminDurDays`/`computedSeasonEndDate` 계산과, games 마이그레이션 때 추가했던 임시 scheduledAt 보정 루프, `injectGameSeq()` 전부 삭제(압축 함수가 대체).
- `server/src/shared/tournamentInitializer.ts` — `initSingleElim`/`initializeTournamentBracket`에 `seedMode?: 'random'|'ranked'` 파라미터 추가(기본값 `'random'`, 기존 토너먼트 동작 100% 유지). `'ranked'`면 셔플을 건너뛰고 입력 순서를 그대로 브라켓 슬롯에 사용.
- 신규 `server/src/shared/playoffSeeder.ts` — `startPlayoffs()`: `games` 테이블에서 팀별 승/패/득실차 집계 → 상위 N팀(기본 8) → 표준 브라켓 시드 순서(`bracketSeedOrder()`, 8강이면 `[1,8,4,5,2,7,3,6]`)로 재배열 → `initializeTournamentBracket(..., 'ranked')` → `insertGames`/`insertGameShortCodes`로 저장, `bracket_data: {series}` 갱신.
- `server/src/scheduler.ts` — `checkSeasonCompletions()` 추가(`tick()`의 `Promise.allSettled`에 편입): `type='main_league' AND status='in_progress' AND bracket_data IS NULL`인 리그마다 정규시즌 게임이 전부 played인지 확인, 맞으면 `startPlayoffs()` 호출.
- `components/multi/CreateLeagueModal.tsx` — 일일 시뮬 시간대 `<input type="time">` 2개 추가(기본 19:00~23:00 KST), `durationWeeks`/`dailyWindowStartMin`/`dailyWindowEndMin`을 실제로 `createLeague()`에 전송. 하드코딩됐던 `REGULAR_DAYS`/`GAME_DAYS_PER_DAY` 미리보기 상수를 `Math.ceil(1230 / (durationWeeks*7))` 실제 공식으로 교체.
- `services/multi/leagueService.ts` — `createLeague()`의 `options` 화이트리스트에 `durationWeeks`/`dailyWindowStartMin`/`dailyWindowEndMin`/`playoffTeamCount` 추가(기존 `if (opts.x !== undefined) payload.y = opts.x` 패턴 반복).

**Before** (finalize.ts non-tournament 분기, 발췌 — 관리자 기간을 가상 캘린더로 오인):
```ts
const adminDurDays = league.season_end_date && league.season_start_date
    ? Math.max(7, Math.round((end-start)/86400000)) : 14;
const computedSeasonEndDate = ...; // adminDurDays 기반
schedule = generateSeasonSchedule({ seasonStart: seasonStartDate, regularSeasonEnd: computedSeasonEndDate, ... });
injectGameSeq(schedule);
for (const g of schedule) g.scheduledAt = simRealStartAt + (g.game_seq/gamesPerRealDay)*86400000; // 임시 보정
```

**After**:
```ts
const virtualSeasonYear = nowDate.getFullYear();
const rawSchedule = generateSeasonSchedule({
    seasonStart: `${virtualSeasonYear}-10-21`, regularSeasonEnd: `${virtualSeasonYear+1}-04-13`, ...
});
schedule = compressLeagueSchedule(rawSchedule, {
    realStartAt: simRealStartAt,
    durationWeeks: league.duration_weeks ?? 2,
    dailyWindowStartMin: league.daily_window_start_min ?? 1140,
    dailyWindowEndMin:   league.daily_window_end_min   ?? 1380,
});
```

**검증**: 신규/수정 파일 전체 브레이스 balance 스크립트로 확인, `TEAM_DATA` 정밀 재검증(정확히 30팀·6디비전×5팀 확인 — 최초 대략 검사에서 31팀으로 오판했던 걸 정밀 정규식으로 재확인해 정정), `initializeLeagueTeams(roomId, 30)`이 이 30팀 전체를 그대로 쓰는 것 확인(추가 조치 불필요). `bun`/`tsc` 로컬 미설치로 런타임 빌드 검증은 못 함 — **아직 fly.io/Vercel에 배포 안 됨, 실제 30팀 메인리그 생성~정규시즌~플레이오프 E2E 테스트 미실행**.

**알려진 한계**:
- `playoff_team_count`가 2의 거듭제곱이 아니면(기본 8은 안전) `initSingleElim()`의 기존 부전승(bye) 배치 로직이 정확한 시드 배정을 보장 못함(기존 토너먼트 엔진의 원래 한계, 이번에 안 고침).
- `compressLeagueSchedule()`은 정렬된 리스트를 균등 청크로 나누는 근사 방식이라, 생성기의 원래 "같은 날 경기"가 압축 경계에서 두 실제 날짜로 쪼개질 수 있음(페이스 감각은 유지되나 완벽한 보존은 아님).
- 리그 생성 시 `duration_weeks`가 없으면(구버전 리그) 기본 2주로 폴백.

**롤백 방법**: 이 커밋의 diff를 되돌리면 됨. DB 컬럼(`duration_weeks` 등)은 하위호환 nullable이라 롤백해도 기존 토너먼트 리그에 영향 없음.

---

## 2026-08-06 — `rooms.schedule` JSONB → `games` 정규화 테이블 마이그레이션

**배경**: 멀티플레이어 데이터 송수신 구조 조사에서 `rooms.schedule`(경기 배열)이 경기 하나 끝날 때마다
전체를 읽어 하나만 고쳐 통째로 다시 쓰는(read-modify-write) 패턴이라 동시 쓰기 레이스(lost-update)에
취약하다는 걸 발견 → `games` 테이블(경기당 1행)로 정규화. `leagues.bracket_data.schedule`도 `rooms.schedule`과
바이트 단위로 100% 동일함이 확인되어(DB 직접 조회) 함께 제거, `bracket_data`는 `{series}`만 남김.
상세 설계는 `/Users/bokjung/.claude/plans/validated-shimmying-pebble.md` 참조.
**핵심 원칙**: 클라이언트가 소비하는 `schedule: Game[]` 인메모리 형태는 그대로 유지 — `useSeasonContext()`로
받는 ~15개 소비 컴포넌트(MultiScheduleView/MultiStandingsView/TournamentBracketView/MultiHeader 등)는 무수정.

**DB 마이그레이션**:
- `migrations/games_table.sql` — `games` 테이블 신설. PK `(room_id, game_id)`(`game_pbp`/`game_sim_claims`와 동일 관례), 부분 인덱스 `games_due_idx`(스케줄러 due 질의용)/`games_room_series_idx`(시리즈 조회용), RLS 3종(`g_member_select`=`my_room_ids()`, `g_service_write`=service_role, `g_admin_write`=리그 admin), `supabase_realtime` publication 등록.
- `migrations/backfill_games.sql` — `rooms.schedule` JSONB → `games` 백필(멱등, `ON CONFLICT DO UPDATE`). **컷오버 전에만 안전** — 컷오버 후 재실행 시 최신 데이터를 stale로 덮어씀.
- `migrations/rollback_games_to_jsonb.sql` — 역방향 복원용(문제 발생 시 구버전 재배포 전 실행).
- 실행 결과: 1차 백필 직후 `games` 4,843행, `rooms.schedule` 총합 4,843행 — 행 수/필드 단위 정합성 검증 0건 불일치.

**서버 변경 (`server/src/**`)**:
- `finalize.ts` — `insertGames()` 헬퍼 신규(camelCase Game[] → snake_case row 변환 유일 경계, 500개 배치 upsert). `forceInitSchedule`/`finalizeDraft` 양쪽: season 경로에 `scheduledAt` 계산 로직 추가(**중요** — 기존엔 이 경로가 scheduledAt을 안 채워서 스케줄러의 game_seq 역산 폴백에 의존했는데, 새 SQL 질의엔 그 폴백이 없어 안 채우면 정규시즌 경기가 하나도 자동 시뮬 안 됨. 프로덕션에 season 리그가 0개라 지금 안 드러날 뿐 실사용 시 바로 터질 문제), `bracket_data`를 `{series}`로 축소, `rooms.update()`에서 `schedule` 제거 후 방어적 `games` 선삭제(결정론적 game_id 재충돌 방지) + `insertGames()`.
- `simRunner.ts` — 방 로드 시 `schedule` select 제거, 해당 경기 1행만 `games`에서 조회. 기록은 배열 전체 재작성 대신 `games.update({...}).eq('played', false)` 조건부 UPDATE(0 rows면 다른 프로세스가 이미 기록 — game_sim_claims에 이은 2차 동시성 방어선). `handleTournamentAdvance`는 `bracket_data`에서 `schedule` 제거, 시리즈 확정 시 `games.delete()`로 prune(+ `game_short_codes` 동반 삭제로 기존 고아 버그도 수정), `advanceTournamentState`(순수 함수, 미변경)에는 현재 `games` 행으로 만든 stub 배열을 넘겨 늘어난 뒷부분만 신규 라운드 경기로 추출해 `insertGames()`.
- `scheduler.ts` — `runSimGames`가 전체 방의 schedule을 Node 메모리로 스캔하던 것을 `games_due_idx` 인덱스 질의 1번으로 교체. `advanceSimDates`도 집계 질의 2번으로 교체 + **값이 바뀔 때만 `rooms.sim_date` 쓰도록 가드 추가**(기존엔 매 30초 tick마다 무조건 써서 전 접속자에게 불필요한 Realtime 브로드캐스트 발생). 불필요해진 `gameSeqToRealMs`/`resolveGameRealMs`/`LeagueRow`/`RoomRow` 삭제.
- `shared/tournamentArchiver.ts` — `bracket_data.schedule` 대신 `games` 테이블 조회로 `schedMap` 구성. 미사용 `TournamentGame` import 제거.

**클라이언트 변경**:
- 신규 `services/multi/gameQueries.ts` — `loadSchedule()`/`loadGame()`/`countGames()`. **`toIsoZ()` 정규화가 핵심** — PostgREST의 `timestamptz` 반환 형식(`+00:00`)이 기존 JSONB의 JS `toISOString()`(`...Z`) 형식과 달라, 안 맞추면 `AdminSimView`의 문자열 직접 비교·`MultiScheduleView`의 `.localeCompare()` 정렬이 미묘하게 깨질 수 있었음.
- `hooks/useMultiGameData.ts` — 초기 로드를 `loadSchedule()` 호출로 교체(재시도 루프 유지). **오늘 이 세션 초반에 추가했던 `rooms` UPDATE Realtime 구독(payload.new.schedule 직접 반영)을 `games` 테이블 구독으로 완전히 대체** — 300ms 디바운스 후 `loadSchedule()` 전체 재조회 방식으로 변경(시리즈 확정 시 UPDATE+DELETE+INSERT가 한꺼번에 오므로 병합보다 안전). `forceSave()`에서 `schedule` 필드 제거.
- `services/multi/roomPersistence.ts` — `loadRoom()`/`saveRoom()`에서 `schedule` 필드 제거.
- `services/multi/leagueService.ts` — `updateGameScheduledAt()`을 `games` 대상 단건 조회+가드 UPDATE로 재작성. `saveBracketData()` 삭제(호출부 0건 확인). `resetTournament()`에 `games`/`game_short_codes` 삭제 추가(결정론적 game_id 재충돌 방지 + 기존 재드래프트 실패 버그 동반 수정).
- `views/multi/season/MultiGamePbpView.tsx` — 경기 1건 scheduledAt 조회를 `rooms.schedule` 배열 fetch에서 `loadGame()` 단일 row 조회로 교체.
- `views/multi/league/AdminSimView.tsx` — 일정 관리 테이블 로드를 `loadSchedule()` 재사용으로 교체(로컬 함수명 충돌 방지 위해 `refreshSchedule`로 개명).
- `views/multi/league/MultiDraftView.tsx` — 드래프트 완료 후 준비 완료 폴링을 `countGames()`로 교체.
- 삭제: `services/multi/engineStateAdapter.ts`(호출부 0건, `room.schedule` 참조라 방치 시 조용히 깨짐).

**무수정 확인**: MultiScheduleView, MultiStandingsView, TournamentBracketView, MultiLeaderboardView, MultiRosterView, MultiTacticsView, seasonContext.ts, multiGameReveal.ts, multiSeasonUtils.ts, multiScheduleUtils.ts, MultiHeader.tsx, TournamentChampionModal.tsx, TeamGameLog.tsx, pages/MultiSeasonPage.tsx — 전부 `useSeasonContext()`의 `schedule: Game[]`만 소비, `rowToGame()`이 동일 형태를 반환하므로 무변경.

**검증**: 코드 5+개 파일 전체 재독해로 중괄호/타입/누락 수동 확인(브레이스 balance 스크립트로 교차 확인). `bun`/`tsc` 로컬 미설치로 빌드 검증은 못 함. DB 마이그레이션/1차 백필은 실행 완료 + 검증 쿼리(행 수 일치, 필드 단위 불일치 0건) 통과. **서버/클라이언트 배포 및 컷오버(서버 정지→2차 백필→배포→재기동)는 아직 미실행** — 사용자 확인 후 진행 예정.

**롤백 방법**: 컷오버 전이면 코드 변경분만 되돌리면 됨(DB는 `games` 테이블만 새로 생겼을 뿐 `rooms.schedule`/`bracket_data`는 그대로라 무영향). 컷오버 후라면 `migrations/rollback_games_to_jsonb.sql` 실행 → 이 커밋 이전 서버/클라이언트로 재배포.

---

## 2026-08-06 — 멀티플레이어 데이터 송수신 구조 개선 (schedule Realtime 구독 + 라이브 PBP delta 폴링)

**배경**: 멀티플레이어 클라이언트-서버 데이터 송수신 구조를 조사한 결과 2가지 개선 지점 발견 →
1. `rooms.schedule`이 `useMultiGameData` 마운트 시 1회만 fetch되고 이후 절대 갱신 안 됨 — 스탠딩/브라켓/스케줄 화면에 머물러 있으면 다른 경기가 끝나도 반영 안 되고 재진입해야만 보임.
2. 라이브 PBP 폴링(`/live-game`, 5초 간격)이 매번 "지금까지 공개된 이벤트 전체"를 재전송 — 쿼터가 진행될수록 매 폴링 payload가 계속 커짐. `game_pbp` row는 시뮬레이션이 끝난 시점에 이미 완성된 고정 배열이고, live 구간은 그걸 10분에 걸쳐 시간차 공개하는 클라이언트 연출용 창(window)일 뿐이라 — 이전 poll 결과는 항상 다음 poll 결과의 접두사(prefix)임이 보장되어 delta(증분)만 보내도 안전.

DB 확인 결과 `rooms` 테이블은 이미 `supabase_realtime` publication에 등록돼 있어 DB 설정 변경 없이 클라이언트 구독 코드만 추가하면 됐음(`leagues`/`room_members`에 이미 동일 패턴이 `hooks/useCurrentLeague.ts`에 존재 — 그대로 준용).

**변경 파일**:
- `hooks/useMultiGameData.ts` (client) — `rooms` UPDATE Realtime 구독 추가. `payload.new.schedule`만 뽑아 `setSchedule()` — 같은 row의 다른 필드(simSettings/teamFinances 등, `forceSave()`로만 저장되는 로컬 편집 상태)를 덮어쓰지 않기 위해 전체 row refetch가 아니라 필드 단위로만 반영.
- `server/src/liveGameView.ts` (server) — `buildWindowedViewSince()` 추가. 기존 `buildWindowedView()`의 필터링 로직은 전혀 안 건드리고, 그 결과를 `since` 커서(`events`/`shots`/`box` 각각 이미 받은 개수) 기준으로 slice만 해서 신규분 + 누적 카운트(`eventCount`/`shotCount`/`boxCount`)를 반환.
- `server/src/index.ts` (server) — `handleLiveGame`이 `sinceEvents`/`sinceShots`/`sinceBox` 쿼리 파라미터를 파싱해 `buildWindowedViewSince()`에 전달 (파라미터 없으면 기존과 동일하게 전체 반환 — 하위호환).
- `services/multi/liveGameService.ts` (client) — `fetchLiveGameView()`에 `since?: LiveGameSinceCursor` 파라미터 추가, `WindowedGameView`에 `eventCount`/`shotCount`/`boxCount` 필드 추가.
- `views/multi/season/MultiGamePbpView.tsx` (client) — `eventCountRef`/`shotCountRef`/`boxCountRef`로 커서 추적(경기 전환 시 리셋). 최초 로드(`isFirst=true`)는 전체 반환·풀 교체, 이후 5초 간격 폴링(`isFirst=false`)은 커서를 같이 보내 delta만 받아 `gameData.events`/`shot_events`/`box_timeline`에 append.

**Before** (MultiGamePbpView.tsx 폴링 부분, 발췌):
```ts
const load = async () => {
    const result = await fetchLiveGameView(room.id, resolvedGameId, session?.access_token);
    ...
    setGameData({ ...전체 필드를 매번 결과값으로 통째 교체... });
};
load();
const timer = displayState === 'live' ? setInterval(load, LIVE_POLL_MS) : null;
```

**After**:
```ts
const load = async (isFirst: boolean) => {
    const result = await fetchLiveGameView(room.id, resolvedGameId, session?.access_token,
        isFirst ? undefined : { events: eventCountRef.current, shots: shotCountRef.current, box: boxCountRef.current });
    ...
    eventCountRef.current = result.eventCount; /* shot/box 동일 */
    setGameData(prev => isFirst || !prev
        ? { ...전체 교체(최초와 동일)... }
        : { ...prev, events: [...prev.events, ...result.events], /* shot_events/box_timeline 동일 append */ });
};
load(true);
const timer = displayState === 'live' ? setInterval(() => load(false), LIVE_POLL_MS) : null;
```

**검증**: 수정한 5개 파일 전체를 다시 읽어 중괄호 balance + 로직 정합성 수동 확인. `bun`/`tsc` 로컬 미설치·환경 문제로 빌드 검증은 못 함. **서버(`server/`) 쪽은 아직 fly.io에 배포 안 됨, 클라이언트 쪽도 아직 배포/실기기 테스트 안 함** — 둘 다 반영해야 실제로 동작(서버가 delta 응답을 안 주면 클라이언트는 `since` 파라미터를 보내도 구버전 서버가 무시하고 항상 풀 데이터를 반환하므로 안전하게 하위호환되지만, 개선 효과는 서버 배포 후에만 발생).

**주의사항**: `useCurrentLeague.ts`의 `leagues`/`room_members` 구독과 달리, `useMultiGameData.ts`의 새 구독은 payload를 직접 읽어(`payload.new.schedule`) refetch 없이 처리 — 이 방식은 `schedule` 컬럼이 매번 update 대상에 포함되어 있다는 전제(현재 이 프로젝트의 모든 `rooms` writer가 `schedule`을 항상 같이 써서 이 전제가 성립함)에 의존한다. 향후 `schedule`을 갱신하지 않는 새로운 `rooms` UPDATE 경로가 생기면 해당 이벤트에서는 `payload.new.schedule`이 undefined일 수 있는데, 이 경우 그냥 무시하도록(`if (updatedSchedule) setSchedule(...)`) 이미 방어돼 있음.

**롤백 방법**: 위 Before 블록 + 각 파일의 diff 되돌리면 됨. `hooks/useMultiGameData.ts`는 새로 추가한 `useEffect` 블록 전체 삭제, `server/src/index.ts`는 `buildWindowedView` import로 원복.

---

## 2026-08-06 — fly.io 서버 무응답 사고 조사 후 game_sim_claims 락 정리 로직 수정

**배경**: fly.io 멀티플레이어 서버(`basketballgm-app-server`)가 응답 없이 멈추는 사고 발생(2026-08-06 00:21~00:37 UTC, 머신 재시작으로 복구) → 로그/DB 조사 중 `game_sim_claims`(경기 중복 시뮬레이션 방지용 락 테이블)가 4,683건까지 쌓여있고 그중 4,679건이 이미 `game_pbp`(완료된 경기)를 가진 채로 영구히 안 지워지고 있는 걸 발견. 원인은 `runSimulation()`이 클레임을 **성공 경로에서는 삭제하지 않고 실패(catch) 경로에서만 삭제**하도록 되어 있던 것 — 정상 완료된 경기의 락이 테이블에 평생 남는 구조. 이 때문에 안전망인 `sweepStaleClaims()`가 매번 스캔해야 할 행이 계속 불어났고, 실제로 8시간 넘게 안 풀린 고아 클레임(`T_R3_M1_G5`, room `ee49f5d1-...`)도 하나 발견됨(정확한 원인은 미확정 — 클레임 생성 12분 후 머신 재시작 이력과 시간상 겹침).
이번 무응답 사고 자체의 근본 원인은 확정하지 못함(fly.io 로그 보존 기간이 짧아 사고 순간의 메모리 상태 등 직접 증거는 유실, 256MB VM의 메모리 압박이 유력한 가설). 다만 조사 중 발견한 클레임 미청소 버그는 코드로 명확히 확인·수정 가능해 바로 반영.

**변경 파일**:
- `server/src/simRunner.ts` (server 전용, client 미러 없음) — 클레임 획득 성공 이후 전체 처리를 내부 `try/finally`로 감싸, 성공/실패 어느 경로든 `finally` 한 곳에서만 클레임을 삭제하도록 통합 (기존엔 성공 return 직전과 바깥 `catch` 두 곳에 동일한 delete 코드가 중복)
- `server/src/workers/simWorkerPool.ts` (server 전용, client 미러 없음) — `sweepStaleClaims()`를 "claim마다 game_pbp 존재 여부 개별 조회 후 없는 것만 삭제"에서 "10분 지난 클레임은 성공/실패 무관하게 단일 DELETE로 통째 삭제"로 단순화 + `.select()`로 삭제된 행 전체를 돌려받던 것을 `{ count: 'exact' }`로 교체(개수만 필요하므로 행 데이터 왕복 제거)

**후속 정리 (/simplify, 같은 날)**: 최초 수정본은 `simRunner.ts` 성공 경로에 delete를 추가하는 방식이라 기존 catch 블록의 delete와 완전히 중복되는 코드였음. `/simplify`의 Simplification·Altitude 두 관점 에이전트가 독립적으로 동일하게 "단일 `try/finally`로 합쳐야 한다"고 지적(단, "이미 클레임됨" 스킵 경로는 애초에 이 프로세스 소유가 아니므로 감싸면 안 됨)해 반영. Reuse 에이전트가 제안한 `simWorkerPool.deleteClaim()` 재사용은 워커 스레드(simRunner.ts) ↔ 메인 스레드 싱글턴(simWorkerPool.ts) 간 경계 때문에 불가능한 false positive로 판정, 미적용. Efficiency 에이전트가 제안한 "클레임 삭제를 스케줄/토너먼트 업데이트와 병렬 실행"은 이득이 적고(워커 스레드 내부, non-hot path) 단일 삭제 지점 원칙과 상충돼 스킵, `.select()` → `{count:'exact'}` 교체만 채택.

**Before** (simRunner.ts, 최종 발췌 — 클레임 획득 이후):
```ts
        if (claimErr) { ...; return { ok: true, skipped: true, reason: 'already claimed' }; }

        const { homeTeamId, awayTeamId } = game;
        // ... 2~7단계 로직 ...
        return { ok: true, homeScore, awayScore, simDurationMs };

    } catch (err) {
        console.error('[simRunner] error:', err);
        await supabase.from('game_sim_claims').delete().eq('room_id', roomId).eq('game_id', gameId);
        return { ok: false, error: String(err) };
    }
```

**After**:
```ts
        if (claimErr) { ...; return { ok: true, skipped: true, reason: 'already claimed' }; }

        try {
            const { homeTeamId, awayTeamId } = game;
            // ... 2~7단계 로직 (기존과 동일, 들여쓰기만 1단 깊어짐) ...
            return { ok: true, homeScore, awayScore, simDurationMs };
        } finally {
            await supabase.from('game_sim_claims').delete().eq('room_id', roomId).eq('game_id', gameId);
        }

    } catch (err) {
        console.error('[simRunner] error:', err);
        return { ok: false, error: String(err) };
    }
```

**Before** (simWorkerPool.ts `sweepStaleClaims`, 원본):
```ts
    async sweepStaleClaims(): Promise<void> {
        const cutoffIso = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
        const { data: staleClaims, error } = await supabase
            .from('game_sim_claims')
            .select('room_id, game_id')
            .lt('claimed_at', cutoffIso);
        if (error) { console.error(...); return; }
        if (!staleClaims?.length) return;

        for (const claim of staleClaims) {
            const { data: pbp } = await supabase
                .from('game_pbp').select('game_id')
                .eq('room_id', claim.room_id).eq('game_id', claim.game_id)
                .maybeSingle();
            if (!pbp) await this.deleteClaim(claim.room_id, claim.game_id);
        }
    }
```

**After** (최종):
```ts
    async sweepStaleClaims(): Promise<void> {
        const cutoffIso = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
        const { count, error } = await supabase
            .from('game_sim_claims')
            .delete({ count: 'exact' })
            .lt('claimed_at', cutoffIso);
        if (error) { console.error('[simPool] stale claim sweep failed:', error.message); return; }
        if (count) console.log(`[simPool] stale claim sweep: removed ${count} claim(s)...`);
    }
```

**검증**: `npx tsc --noEmit`은 이 프로젝트가 Bun 전용이라 사전에도 다수 무관한 타입 에러(Bun 전역 타입 등)가 있어 전체 통과는 확인 못 함 — 수정한 두 파일을 처음부터 끝까지 다시 읽어 중괄호/들여쓰기 정합성 수동 확인(특히 `try` 중첩 구조). `bun` 로컬 미설치로 런타임 빌드 체크는 못 함. **아직 fly.io에 배포 안 됨** (`server/` 코드는 별도 배포 필요 — 로컬 수정만 반영된 상태).
기존에 쌓인 4,683건의 레거시 클레임은 이 수정이 배포되면 다음 `sweepStaleClaims()` 실행(부팅 직후 1회 + 5분 간격)에서 나이 조건만으로 자동 일괄 삭제됨 — 별도 수동 SQL 정리 불필요.

**롤백 방법**: 위 Before 블록 두 개로 그대로 되돌리면 됨.

---

## 2026-08-05 — [정리] /simplify 4관점 리뷰(Reuse/Simplification/Efficiency/Altitude) 후속 정리

**배경**: 팀 설정/코트 색상 세션의 diff 전체를 4개 에이전트(Reuse/Simplification/Efficiency/Altitude)로 병렬 리뷰한 뒤, 동작 변경 없는 범위 내에서 발견된 중복·비효율을 직접 정리.

**변경 파일**:
- `utils/colorContrast.ts` — `HEX_COLOR_RE` 공용 정규식 export 추가(TeamSetupModal/TeamSettingsModal/leagueService 3중복 제거)
- `components/multi/ColorField.tsx` (신규) — 컬러피커+헥스 입력 쌍 공용 컴포넌트. `TeamSetupModal.tsx`/`TeamSettingsModal.tsx`가 각자 복붙하던 JSX 블록을 대체
- `services/multi/leagueService.ts` — `COURT_DEFAULT_FIELDS` 상수 추가해 `initializeLeagueTeams`/`resizeLeagueTeams` 4곳의 `court_background/paint/line` 반복 스프레드로 통합, `setMemberTeam`의 로컬 `hexRe` 제거하고 `HEX_COLOR_RE` 사용
- `utils/gameClock.ts` (신규) — `parseTimeRemaining`/`toGameSeconds`를 `views/multi/season/MultiGamePbpView.tsx`와 `components/game/RotationChart.tsx`가 각자 재정의하던 것을 통합 (client 전용, server 미러 없음 — 두 파일 다 UI 레이어)
- `views/multi/season/MultiGamePbpView.tsx` — `secondsToClock()`이 `services/game/engine/pbp/timeEngine.ts`의 `formatTime()`을 재사용하도록 변경; `revealedSeriesById`/`wl` useMemo가 `serverNow`(1초 틱) 대신 `revealBucket`(15초 버킷)에 의존하도록 변경해 매초 전체 스케줄 재스캔 방지
- `components/game/PlayerIdentityCells.tsx` — prop을 `team: Team` → `playerInfo: Player | undefined`로 변경(호출부가 미리 계산해서 넘김)
- `components/game/BoxScoreTable.tsx` / `AdvancedBoxScoreTable.tsx` / `DefenseBoxScoreTable.tsx` — 각 행에서 반복하던 `team.roster.find()`(O(n·m))를 컴포넌트당 1회 `useMemo` Map으로 대체

**Before** (PlayerIdentityCells.tsx, 발췌):
```ts
interface PlayerIdentityCellsProps { player: PlayerBoxScore; team: Team; mvpId?: string; standalone?: boolean; }
export const PlayerIdentityCells: React.FC<PlayerIdentityCellsProps> = ({ player: p, team, mvpId, standalone }) => {
    const playerInfo = team.roster.find(rp => rp.id === p.playerId); // 행마다 O(n) 탐색
    ...
```

**After**:
```ts
interface PlayerIdentityCellsProps { player: PlayerBoxScore; playerInfo: Player | undefined; mvpId?: string; standalone?: boolean; }
export const PlayerIdentityCells: React.FC<PlayerIdentityCellsProps> = ({ player: p, playerInfo, mvpId, standalone }) => { ... }
// 호출부(BoxScoreTable 등): const rosterMap = useMemo(() => new Map(team.roster.map(rp => [rp.id, rp])), [team.roster]);
//                          <PlayerIdentityCells player={p} playerInfo={rosterMap.get(p.playerId)} ... />
```

**검증**: `npx tsc -p tscheck.json` — 수정 파일 전부 에러 0건(기존에 있던 다른 파일들의 무관한 pre-existing 에러 약 30여건은 이번 변경과 무관, stash 비교로 확인).

**스킵한 항목(의도적으로 미적용, 이유 명시)**:
- `components/game/tabs/GameShotChartTab.tsx`의 로컬 `BasketLines`를 `components/multi/CourtPreview.tsx`로 교체하는 안 — 좌표계는 동일하지만 GameShotChartTab은 페인트존 채우기와 라인 사이에 `ZoneHeatOverlay`(성공률 색칠)를 반드시 끼워 넣어야 해서(라인이 오버레이보다 항상 위에 선명하게 보여야 함) `CourtPreview`를 통짜로 호출하면 렌더 순서가 깨짐 → 동작 변경 위험이 있어 보류.
- `AdvancedBoxScoreTable`/`DefenseBoxScoreTable`/`BoxScoreTable`의 카드 셸(헤더바/tfoot/statCellClass 등 ~35줄×3) 공용 컴포넌트화 — 세 테이블 모두 이번 세션에 픽셀 단위로 다듬은 디자인이라, 셸 추출 시 회귀 위험이 이득보다 크다고 판단해 보류(후속 작업 후보로만 기록).
- `data/virtualTeams.ts`의 `color_tertiary`가 34개 팀 전부 `color_secondary`와 동일한 중복 데이터라는 지적 — 필드 제거 시 DB 백필 값과 폴백 로직을 다시 손봐야 해서 위험 대비 이득이 작아 보류.
- Altitude 관점 지적(리셋 이펙트 누적 → `key={gameId}` 리마운트, 이중 로딩 상태 머신, RPC/컬럼 계속 추가되는 구조를 향후 jsonb 이관 고려) — 전부 구조적 리팩터라 diff 범위를 크게 벗어나 이번엔 미적용, 후속 작업으로만 남김.

**롤백 방법**: 이 커밋(또는 git diff) 되돌리면 됨 — 전부 순수 리팩터이고 동작 변경 없음.

---

## 2026-08-05 — [신규] "팀 설정" 2단계: Tertiary 팀 컬러 + 코트 색상(홈 경기 실시간 적용) 완성

**배경**: "Primary/Secondary/Tertiary/Text 4종 컬러 설정 + 팝업을 좌/우 2컬럼으로 나눠서 우측엔 코트 색상(선택 즉시 코트에 반영되는 미리보기)"을 추가해달라는 요청 — 이전 세션에서 미룬 코트 색상 기능(멀티 라이브뷰의 홈팀 코트에만 적용, 결과 화면은 다크네이비 유지, 배경/페인트존/라인 3색)을 이번에 구현.

**변경 파일**:
- **DB(Supabase, project `buummihpewiaeltywdff`)**: `league_teams`에 `color_tertiary`/`court_background`/`court_paint`/`court_line` 4개 컬럼 추가 + 기존 896개 row 백필(tertiary는 실제 30팀은 `TEAM_COLORS.tertiary` 값, 그 외는 `color_secondary`로 폴백; court 3종은 전부 기존 하드코딩 나무색 `#DDC8AD`/`#C3AC91`/`#4A3728`). `update_team_profile`(11-arg로 재정의, 7-arg 버전 DROP) / `initialize_league_teams`(신규 필드 INSERT, COALESCE 기본값) 두 RPC 재정의.
- `components/multi/CourtPreview.tsx` (신규) — 코트 바닥/페인트존/라인 정적 SVG 도형만 담당하는 공용 컴포넌트(자체 `<svg>` 태그 없이 자식 노드만 반환 — 호출부가 자신의 `<svg viewBox="0 0 940 500">` 안에 끼워 쓴다). `MultiFullCourtChart.tsx`(실제 라이브 코트)와 `TeamSettingsModal.tsx`(설정 미리보기)가 공유해서, 예전 `CourtBackground.tsx`/`MultiFullCourtChart.tsx`가 동일 색상값을 중복 하드코딩했던 것과 같은 미러 불일치가 재발하지 않게 함.
- `views/multi/season/MultiFullCourtChart.tsx` — 인라인으로 중복돼 있던 코트 SVG 마크업을 `<CourtPreview>` 호출로 교체, `courtBackground`/`courtPaint`/`courtLine` props 추가(기본값은 기존 하드코딩 값 그대로라 값을 안 넘기는 다른 호출부가 있어도 안전).
- `views/multi/season/MultiGamePbpView.tsx` — `MultiFullCourtChart`에 `homeTeam?.court_background/court_paint/court_line` 전달(홈팀 기준 — 이 컴포넌트 자체가 라이브 뷰에서만 렌더되고 결과 화면은 별도의 `MultiShotChartTab.tsx`(다크네이비, 미변경)를 쓰므로 자연스럽게 "라이브에서만, 홈팀 색만" 요구사항 충족).
- `data/virtualTeams.ts` — `VirtualTeamTemplate`에 `color_tertiary` 필드 추가, 34개 팀 전부 `color_secondary`와 동일값으로 채움(가상팀은 브랜드 tertiary가 원래 없어 secondary 재사용).
- `services/multi/leagueService.ts` — `DEFAULT_COURT_COLORS` 상수 신설(export), `updateTeamProfile()` 11-arg로 확장, 팀 생성/확장 로직(`initializeLeagueTeams`, 팀 수 늘리기) 전부 신규 4필드 포함하도록 수정.
- `services/multi/roomQueries.ts`, `server/src/shared/tournamentInitializer.ts` — `LeagueTeamRow` 타입(중복 정의 양쪽 다)에 4개 필드 추가.
- `views/multi/league/LeagueLobbyView.tsx` — 로비의 구형 `TeamSetupModal` 저장 경로(`saveOverride`)는 tertiary/코트 입력 필드가 없으므로, `editTarget`의 기존 저장값을 그대로 재전송하도록 `updateTeamProfile()` 호출 인자 확장(11-arg 시그니처 대응).
- `components/multi/TeamSettingsModal.tsx` — 대규모 개편: 모달 폭 `max-w-md`→`max-w-3xl`, `grid-cols-2`로 좌(팀 이름+컬러 4종)/우(코트 컬러 3종+실시간 미리보기) 분리. 우측 상단에 `<CourtPreview>`를 편집 중인(미저장) state 값으로 실시간 렌더 — 색을 고르는 즉시 코트 모양이 바뀜.

**동작 방식**: 좌측 팀 컬러 4종(Primary/Secondary/Tertiary/Text)과 우측 코트 컬러 3종(배경/페인트존/라인) 모두 같은 `canEditIdentity`(드래프트 진행 중이 아닐 때) 게이팅을 공유하고, 저장 버튼 하나로 11개 값 전부 `updateTeamProfile()` RPC 한 번에 반영. 우측 미리보기는 저장 여부와 무관하게 현재 입력 중인 색을 즉시 반영(자체 state 기반, API 호출 없음).

**검증**: `npx tsc --noEmit -p tscheck.json`(client), `cd server && npx tsc --noEmit`(server) 둘 다 이번 변경 관련 에러 없음(둘 다 기존부터 있던 무관한 에러만 남음 — `RoomRow.sim_settings`, `shotDistribution.ts` 등). Supabase에서 `pg_proc`/`information_schema.columns` 조회로 컬럼 4개·RPC 시그니처 정상 반영 확인.

**주의사항**: `room_members` 테이블에는 이 4개 필드에 대응하는 컬럼이 없음(`server/src/startDraft.ts`가 AI 슬롯 채울 때 `league_teams`→`room_members`로 컬러를 복사하는 경로가 있으나, tertiary/코트는 그 어디서도 안 읽으므로 의도적으로 미포함) — 전부 `league_teams`에서 직접 읽는 현재 구조상 문제 없음.

**롤백 방법**: 코드는 각 파일을 위 "변경 전" 상태로. DB는 4개 컬럼 DROP + 두 RPC를 이전 시그니처(7-arg `update_team_profile`, 신규 필드 없는 `initialize_league_teams`)로 재정의.

---

## 2026-08-05 — [수정] 팀 설정: 페이지→모달 전환, 잠금 조건 완화(drafting만), z-index 포탈 수정

**배경**: 바로 아래 항목(팀 설정 페이지 신규 구현) 직후 3가지 후속 요청이 이어짐 — (1) "드래프트 진행 중에만 잠그는 게 좋을듯"(닉네임/컬러 편집 가능 구간을 `recruiting`뿐 아니라 `in_progress`/`finished`까지 확장, `drafting` 중만 잠금), (2) "별도 화면 이동이 아니라 세션 내부 화면에서" → 라우팅 페이지를 모달로 전환, (3) 스크린샷 리포트 "z-index 처리가 잘못된듯" → 모달이 라이브뷰의 sticky 테이블 헤더보다 아래로 깔려서 보임.

**변경 파일**:
- `components/multi/TeamSettingsModal.tsx` (신규) — `views/multi/league/TeamSettingsView.tsx`(삭제)의 로직을 모달 컴포넌트로 이식
- `components/MultiSidebar.tsx` — "팀 설정" 클릭 시 `navigate()` 대신 모달 오픈, `createPortal`로 `document.body`에 렌더
- `App.tsx` — `/multi/leagues/:leagueId/team-settings` 라우트 제거
- `views/multi/league/TeamSettingsView.tsx` — 삭제(모달로 완전 대체)

**1) 잠금 조건**: `canEditIdentity = league?.status === 'recruiting'` → `league?.status !== 'drafting'`. DB의 `update_team_profile` RPC(SECURITY DEFINER)도 클라이언트와 별개로 동일 규칙을 강제하므로(원래 `IF v_status NOT IN ('recruiting') THEN RAISE EXCEPTION 'cannot_edit_after_draft_start'`) **Supabase에서 함수를 직접 재정의**해서 같이 맞춤 — `IF v_status = 'drafting' THEN RAISE EXCEPTION 'cannot_edit_during_draft'`로 교체(project `buummihpewiaeltywdff`, 시그니처 동일한 `CREATE OR REPLACE`라 오버로드 중복 없이 단일 함수로 교체됨, `pg_proc` 조회로 확인). 이제 `recruiting`/`in_progress`/`finished`는 언제든 저장 가능, `drafting` 중만 막힘 — 클라이언트 UI 게이팅과 DB 제약이 정확히 일치.

**2) 페이지 → 모달**: `TeamSetupModal.tsx`와 동일한 모달 셸 패턴(`fixed inset-0 z-50 flex items-center justify-center bg-black/60`, X 닫기)으로 재구성. 라우트 이동 없이 사이드바에서 즉시 열고 닫힘.

**3) z-index 버그**: `MultiSidebar`의 `<aside>`가 `z-20 relative`라 자체 stacking context를 가짐 — 그 자식으로 모달을 직접 렌더링하면 모달의 `z-50`이 aside 내부에서만 유효해서, 페이지의 다른 stacking context(라이브뷰 sticky 테이블 헤더 등)가 모달 위로 뚫고 나와 보였음. 같은 파일의 프로필 드롭다운이 이미 쓰던 `createPortal(..., document.body)` 패턴을 모달에도 동일 적용해 최상위 stacking context로 탈출시킴.

**검증**: `npx tsc --noEmit -p tscheck.json` 관련 파일 전부 에러 없음. Supabase에서 `pg_proc` 조회로 `update_team_profile(uuid,uuid,text,text,text,text,text)` 단일 오버로드만 존재함을 확인.

**롤백 방법**: `components/multi/TeamSettingsModal.tsx` 삭제, `MultiSidebar.tsx`의 모달 관련 코드(import/state/버튼 onClick/렌더 블록) 제거, `App.tsx`/`TeamSettingsView.tsx`를 이전 커밋에서 복원. DB는 `update_team_profile` 함수를 `IF v_status NOT IN ('recruiting') THEN RAISE EXCEPTION 'cannot_edit_after_draft_start'` 버전으로 재정의하면 됨.

---

## 2026-08-05 — [신규] "팀 설정" 페이지 신설 (닉네임/컬러 관리, 약어·연고지 고정)

**배경**: "팀 설정(팀명/컬러/코트색 관리) 기능을 추가하고 싶다"는 요청 중 1단계 — 코트 색상(별도 DB 컬럼 + 홈코트 배선 신규 필요, 추후 작업)에 앞서 "팀명(닉네임만 변경 가능, 약어·연고지 고정)"과 "팀 컬러"(이미 구현된 Primary/Secondary/Text)를 관리하는 페이지와 진입점을 먼저 구축.

**변경 파일**:
- `views/multi/league/TeamSettingsView.tsx` (신규)
- `App.tsx` — 라우트 `/multi/leagues/:leagueId/team-settings` 등록(`LeagueLayout` 하위, `settings`와 형제 라우트)
- `components/MultiSidebar.tsx` — 프로필 드롭다운에 "팀 설정" 메뉴 추가

**핵심 설계**:
- **연고지 고정**: `league_teams.team_name`은 "도시+닉네임"이 합쳐진 문자열 하나뿐이라(DB 스키마 변경 없음), 도시는 `team_slug` → `TEAM_DATA`(실제 NBA팀) 또는 `VIRTUAL_TEAMS`(가상 확장팀) 조회로 매번 역산해 읽기 전용으로 보여주고, 저장 시 `${city} ${닉네임}`으로 재조합해 기존 `updateTeamProfile()`을 그대로 호출. 기존에 팀명을 통째로 임의 문자열로 바꿔놨던 팀은(과거엔 자유 입력이었음) 저장된 문자열이 고정 연고지 접두사와 안 맞을 수 있어 그 경우 전체 문자열을 닉네임 초기값으로 최대한 보존.
- **약어 고정**: 입력 자체를 없애고 읽기 전용 표시만, 저장 호출 시엔 `myTeam.team_abbr`을 그대로 재전송(백엔드 변경 없음).
- **컬러 3종**: `TeamSetupModal.tsx`와 동일한 Primary/Secondary/Text 피커 UI 패턴 재사용(대비 경고 포함, `utils/colorContrast.ts`의 `contrastRatio` 재사용).
- **드래프트 시작 후 잠금**: `update_team_profile` RPC 자체가 `recruiting` 상태에서만 수정 허용하므로(`cannot_edit_after_draft_start`), `league.status !== 'recruiting'`이면 폼 전체를 비활성화하고 안내 배너를 미리 보여줌 — RPC 원본 에러 메시지를 그대로 노출하지 않음.
- **사이드바 진입점 위치**: "최상단(뒤에 구분선)"을 어드민 여부로 분기 — 어드민은 기존 "세션 설정" 바로 아래에 배치, 비어드민은 목록 맨 위에 배치(둘 다 그 뒤에 구분선 1개 공유). 팀을 아직 선점 안 한 유저(`leagueTeams`에서 `user_id` 매칭 없음)에게는 메뉴 자체를 숨김.

**검증**: `npx tsc --noEmit -p tscheck.json` 관련 파일 전부 에러 없음.

**주의사항**:
- 코트 색상(배경/페인트존/라인 3가지, 멀티 라이브뷰의 홈팀 코트에만 적용, 결과 화면은 기존 다크네이비 유지)은 이번 범위에 미포함 — `league_teams`에 신규 컬럼 추가 + `MultiFullCourtChart.tsx`가 게임의 `homeTeamId` 기준으로 그 팀의 코트색을 조회하도록 새 배선이 필요한 별도 작업. 이 페이지에 섹션만 추가하면 되도록 구조를 잡아뒀으니 후속 작업에서 이어서 붙이면 됨.
- 드래프트 시작 후에는 팀명/컬러 변경이 막힌다는 기존 제약을 그대로 유지했음(정체성 잠금) — 혹시 이후 방침이 바뀌면(예: 코트색은 언제든 변경 가능해야 함) 이 페이지의 `canEditIdentity` 게이팅을 섹션별로 분리해야 함.

**롤백 방법**: `views/multi/league/TeamSettingsView.tsx` 삭제, `App.tsx`의 라우트 1줄과 import 1줄 제거, `components/MultiSidebar.tsx`의 "팀 설정" 버튼 블록과 `myTeam` 계산 제거.

---

## 2026-08-05 — 라이브 박스스코어: 화면 크기 무관 반응형 대응 (야투/3점 두 자리 수 줄바꿈 방지)

**배경**: 스크린샷 리포트 — "야투나 3점이 두 자리가 넘어가면(예: 10-18) 작은 화면에서 줄바꿈이 일어난다. 특정 화면 하나만 겨냥한 해결책 말고 어떤 화면에서도 통하는 해결책이 필요하다." 원인은 `table-fixed` + 퍼센트 컬럼이 컨테이너 폭에 비례해 계속 좁아지는데 텍스트는 안 줄어드니 기본 줄바꿈이 걸린 것.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — `PlayerBoxPanel`

**적용한 3종 세트**:
1. `whitespace-nowrap`을 `<table>` 자체에 지정(상속으로 모든 셀에 적용) — 텍스트가 줄바꿈되는 대신 항상 한 줄 유지
2. `<table>`에 `min-w-[600px]` 추가 — `table-fixed` 퍼센트 컬럼이 이 폭 밑으로는 절대 안 좁아지는 바닥값
3. 바깥 `<div>`에 `overflow-x-auto` 추가 — 실제 컨테이너가 600px보다 좁으면 컬럼을 찌그러뜨리는 대신 테이블 전체를 가로 스크롤

**Before**:
```tsx
<div className="flex flex-col min-h-0 shrink-0">
    <table className="w-full text-xs font-mono border-collapse table-fixed">
```

**After**:
```tsx
<div className="flex flex-col min-h-0 shrink-0 overflow-x-auto">
    <table className="w-full min-w-[600px] text-xs font-mono border-collapse table-fixed whitespace-nowrap">
```

**동작 방식**: 이름 컬럼의 `truncate`(자체 `white-space: nowrap` 포함)는 테이블 레벨 `whitespace-nowrap`과 값이 같아 충돌 없음. 결과적으로 넓은 화면에선 기존과 동일하게 꽉 차 보이고, 좁은 화면(모바일 등)에선 컬럼이 깨지는 대신 가로 스크롤로 대응 — 특정 해상도 하나가 아니라 임의의 컨테이너 폭에서 동일한 규칙으로 동작.

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**롤백 방법**: `<table>`의 `min-w-[600px]`/`whitespace-nowrap`, `<div>`의 `overflow-x-auto`를 제거하면 됨.

---

## 2026-08-05 — 라이브 좌측 하단 인사이트 패널: flex-1(꽉 채움) → 고정 높이 300px

**배경**: "좌측 하단 인사이트 패널 높이 — 현재는 하단을 꽉 채우도록 늘어나는데, 낮은 고정 높이로 유지하고 싶다. 200px 정도로" 요청 → 적용 직후 "300px로 늘려보자"로 조정.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — 라이브 좌측(원정) 컬럼의 `GameInsightsPanel` 래퍼 (홈 쪽/결과 페이지의 다른 `GameInsightsPanel` 인스턴스는 이미 별도 고정 높이라 무관, 변경 안 함)

**Before**:
```tsx
<div className="flex-1 min-h-0 overflow-y-auto border-t border-slate-800" ...>
```

**After**:
```tsx
<div className="h-[300px] shrink-0 overflow-y-auto border-t border-slate-800" ...>
```

**동작 방식**: `flex-1 min-h-0`(부모 컬럼의 남는 세로 공간을 박스스코어 패널과 나눠 전부 차지) 대신 `h-[300px] shrink-0`(고정 높이, 다른 형제가 커져도 안 눌림)으로 교체.

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**주의사항**: 박스스코어 선수가 많아 위쪽 패널이 길어지면, 부모 컨테이너가 `overflow-hidden`이라 총 높이가 넘칠 경우 하단이 잘릴 수 있음(기존엔 flex-1이라 항상 남는 공간만큼만 차지해 이 문제가 없었음) — 실사용 중 잘림이 보이면 알려달라고 안내 필요.

**롤백 방법**: `h-[300px] shrink-0` → `flex-1 min-h-0`로 되돌리면 됨.

---

## 2026-08-05 — 라이브 박스스코어 TEAM 행: FG%/3P%/FT% 표기를 00.0% → .000(야구 타율식)으로 변경

**배경**: "TEAM 행에서 FG%, 3P%, FT%의 표기 방법을 00.0%에서 .000으로 바꿔줘" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — `PlayerBoxPanel`의 `tfoot` TEAM 행

**Before**:
```tsx
<td>{total.fga > 0 ? (total.fgm / total.fga * 100).toFixed(1) + '%' : '-'}</td>
```

**After**:
```tsx
const fmtPct3 = (made: number, att: number) => att > 0 ? (made / att).toFixed(3).replace(/^0/, '') : '-';
...
<td>{fmtPct3(total.fgm, total.fga)}</td>
```

**동작 방식**: 퍼센트(0~100) 대신 비율(0~1)을 소수 3자리로 반올림하고 선행 "0"만 제거 — 예 `45.5%` → `.455`. 100%(비율 1.0)는 `toFixed(3)`이 `"1.000"`으로 "0"이 아닌 "1"로 시작해 정규식에 안 걸리므로 그대로 `1.000` 표시(야구 타율 표기 관례와 동일).

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**롤백 방법**: `fmtPct3` 호출 3곳을 Before의 `(x / y * 100).toFixed(1) + '%'` 형태로 되돌리면 됨.

---

## 2026-08-05 — 라이브 박스스코어: table-fixed + colgroup 퍼센트로 컬럼 너비를 패널 폭에 비례하게 변경

**배경**: "박스스코어 총 너비에 따라 스탯 컬럼 너비를 균일하게 조절하려면?" 질문에 `table-fixed`+`<colgroup>` 퍼센트 방식을 추천하고 컬럼별 퍼센트까지 제안 → "이대로 한번 적용해보자"로 승인.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — `PlayerBoxPanel`의 `<table>`

**Before**: `<table className="w-full text-xs font-mono border-collapse">` + 각 `<th>`에 고정 px 너비(`w-6`/`w-7`/`w-8`×7/`w-14`/`w-12`×2). `border-collapse`는 콘텐츠 기준 auto 레이아웃이라 패널 폭이 바뀌어도 스탯 컬럼 폭은 그대로고 여분 폭이 전부 PLAYER 열로만 쏠림.

**After**: `<table className="w-full text-xs font-mono border-collapse table-fixed">` + `<colgroup>` 13개 `<col>`에 퍼센트 지정, `<th>`의 `w-*` 클래스는 전부 제거(colgroup이 유일한 폭 기준):
```
PLAYER 24% · P 5% · MP 5% · PTS/REB/AST/STL/BLK/TOV/PF 각 6% · FG/3P/FT 각 8%  (합 100%)
```
FG/3P/FT는 "12-34" 형태의 두 자리-두 자리 조합이 들어가 다른 단일 숫자 컬럼보다 넓게 잡음.

**동작 방식**: `table-fixed`는 브라우저가 콘텐츠 대신 `<colgroup>`(또는 첫 행) 지정 폭만 보고 레이아웃을 계산하게 만들어, 패널 폭이 사이드바 비율/화면 크기에 따라 달라져도 각 컬럼이 항상 지정한 비율을 유지함.

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**롤백 방법**: `<colgroup>` 블록 삭제, `table-fixed` 제거, 각 `<th>`에 원래 `w-*` 클래스(P: w-6, MP: w-7, PTS~PF: w-8, FG: w-14, 3P/FT: w-12) 복원.

---

## 2026-08-05 — 라이브 박스스코어: P/MP 컬럼 텍스트를 선수명과 동일한 사이즈/색상으로 통일

**배경**: "P, MP 컬럼에 들어가는 텍스트 사이즈와 색상은 이름 텍스트와 동일하게 맞춰줘" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — `PlayerBoxPanel` 바디 행

**Before**:
```tsx
<td className="text-center py-1.5 px-1 border-b border-slate-800/50 text-slate-400 text-[10px]">{p.position ?? '-'}</td>
<td className="text-right py-1.5 px-1 border-b border-slate-800/50 text-slate-400 tabular-nums">{Math.round(p.mp ?? 0)}</td>
```

**After**:
```tsx
<td className="text-center py-1.5 px-1 border-b border-slate-800/50 text-slate-300">{p.position ?? '-'}</td>
<td className="text-right py-1.5 px-1 border-b border-slate-800/50 text-slate-300 tabular-nums">{Math.round(p.mp ?? 0)}</td>
```

**동작 방식**: 이름 셀은 `text-slate-300` + 테이블 기본 사이즈(`text-xs`, `<table>` 자체에 지정). P는 `text-[10px]`(더 작음) 제거해 `text-xs`로 통일하고 색도 `text-slate-300`으로 맞춤. MP는 사이즈는 이미 `text-xs`였고 색만 `text-slate-400`→`text-slate-300`.

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**롤백 방법**: 두 `<td>`를 Before 값으로 되돌리면 됨.

---

## 2026-08-05 — GameInsightsPanel 마진/승리확률 그래프 상하 방향이 거꾸로였던 버그

**배경**: "좌측 하단 경기 인사이트 그래프 — 위쪽 원정/아래쪽 홈은 맞는데 그래프가 반대로 움직인다" 리포트. `margin`(`hScore - aScore`)과 `wp`(`calculateWinProbability`, 주석상 "Home 100%, Away 0%" 기준)는 둘 다 **홈 기준 값**(양수=홈이 앞섬)인데, Y좌표 변환식이 `MID - v`라 홈이 앞설수록 오히려 위쪽(원정 라벨 쪽)으로 올라가는 게 거꾸로였음 — 패널 배치(위=원정, 아래=홈)와 그래프 방향이 안 맞았던 것.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — `GameInsightsPanel`의 `yMargin`/`yWp`, 상하단 스케일 라벨

**Before**:
```ts
const yMargin = (v: number) => MID - (v / marginScale) * (MID - PAD);
const yWp     = (v: number) => MID - ((v - 50) / 50) * (MID - PAD);
```
```tsx
<div className="absolute left-1 top-1 ...">+{marginScale}</div>
...
<div className="absolute left-1 bottom-1 ...">-{marginScale}</div>
```

**After**:
```ts
const yMargin = (v: number) => MID + (v / marginScale) * (MID - PAD);
const yWp     = (v: number) => MID + ((v - 50) / 50) * (MID - PAD);
```
```tsx
<div className="absolute left-1 top-1 ...">-{marginScale}</div>
...
<div className="absolute left-1 bottom-1 ...">+{marginScale}</div>
```

**동작 방식**: `margin`/`wp` 값 자체(홈 기준, 툴팁의 `hoverInfo.margin > 0 ? homeAbbr : awayAbbr` 로직 포함)는 전혀 안 건드리고, Y좌표 매핑 부호만 뒤집었다 — 이제 홈이 앞설수록 아래(홈 라벨 쪽)로, 원정이 앞설수록 위(원정 라벨 쪽)로 선이 움직인다. 상단/하단 스케일 라벨(`+marginScale`/`-marginScale`)도 방향에 맞춰 위치를 맞바꿈.

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음. `GameInsightsPanel`은 이 파일에만 존재(싱글플레이어에 동일 이름의 미러 컴포넌트 없음)해서 다른 곳에 동일 버그가 전파돼 있지 않음을 확인.

**롤백 방법**: `yMargin`/`yWp`의 `MID + ...` → `MID - ...`로, 상하단 라벨의 `+`/`-`를 원래대로 되돌리면 됨.

---

## 2026-08-05 — 예정 경기 → 라이브 전환 시 박스스코어/화면 전체가 깜빡이던 버그 (seamless 전환)

**배경**: "경기시작 전 화면에서 경기 시작 상태로 전환되면, 박스스코어가 정상 표시되다가 모든 행이 사라지고 안내 문구로 바뀐 후 다시 화면이 리셋된 것처럼 보인다. 그 상태 그대로 경기가 시작되면 좋겠다"는 요청. `resolvedGameId`가 안 바뀌는 자연스러운 시간 경과 전환(scheduled→live, `serverNow`가 `scheduledAt`을 넘는 순간)인데도, 화면 전체를 지우는 게이트 2개 + 박스스코어 패널 자체의 폴백 조건이 전부 "지금 딱 이 순간엔 아직 없는 값"(`isLoading`, `gameData`)에 과민하게 반응해 잠깐 사라졌다 다시 나타나는 게 원인.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx`

**1) 전체화면 로딩 게이트 완화**: `if (isLoading || scheduledAt === undefined)` → `if (scheduledAt === undefined)`만. `isLoading`은 fetch 진행 여부만 나타낼 뿐, 본문의 관련 `useMemo`들은 전부 `if (!gameData) return ...` 가드가 있어 gameData가 null이어도 안전하게 렌더되므로(직접 검증: `gameData\.`로 시작하는 비-옵셔널 참조 5곳 전부 가드 확인) 화면을 지울 필요가 없었음.

**2) 전체화면 에러 게이트 완화**: `if (error || (!gameData && !isScheduled))` → `if (error)`만. `!gameData`라는 이유만으로(진짜 에러가 아닌데도) 화면 전체를 "경기 데이터를 준비하는 중입니다" 문구로 덮던 조건 제거.

**3) 박스스코어 패널 폴백 조건 변경**: 원정/홈 둘 다 `isScheduled ? <0스탯 로스터> : <BoxScorePlaceholder>` → `scheduledAwayBox.length > 0 ? <0스탯 로스터> : <BoxScorePlaceholder>`. `isScheduled`(displayState==='scheduled')는 live 전환 즉시 false가 되지만, 0스탯 로스터 자체(`scheduledAwayBox`/`scheduledHomeBox`, 팀 로스터 기반이라 시간과 무관하게 항상 유효)는 계속 쓸 수 있으므로 "라이브 박스타임라인이 아직 안 왔다"는 이유만으로 안내 문구로 튀지 않고, 실제 라이브 데이터가 도착할 때까지 같은 0스탯 로스터를 그대로 보여주다 자연스럽게 교체됨.

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**주의사항**: 이 변경으로 "final/live 상태인데 gameData가 아직 null인" 모든 경우(최초 진입 포함)에 화면 전체가 아니라 본문이 빈 값 기준으로 렌더된다(스코어 0, PBP 피드 없음 등) — 기존엔 이런 경우 전부 스피너/안내 문구로 가려졌었음. 실제 에러(서버 응답 실패)일 때만 여전히 전체화면 에러 문구가 뜬다.

**롤백 방법**: 게이트 2개를 `isLoading`/`!gameData && !isScheduled` 조건으로, 박스스코어 폴백 2곳을 `isScheduled` 조건으로 되돌리면 됨.

---

## 2026-08-05 — /simplify: MultiGamePbpView 중복 제거 + 스코어링 런 세그먼트 이중 순회 병합

**배경**: `/simplify` 실행 — 재사용/단순화/효율성/고도 4개 에이전트를 병렬로 돌려 `views/multi/season/MultiGamePbpView.tsx`의 누적 diff(이 세션에서 작업한 헤더/점보트론/PBP 피드 변경 전체)를 리뷰.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx`

**적용한 수정**:
1. **효율성 — 팀별 포제션 세그먼트 이중 순회 병합**: `buildTeamSegments(true)`/`buildTeamSegments(false)`를 각각 별도 `useMemo`로 호출해 `allLogs`+`boxTimeline`을 통째로 두 번 순회하고 있었음(`details` 배열 추출은 팀 구분이 없어 매번 동일한 값을 계산해서 버리고 있었음). 하나의 `teamSegments` useMemo로 병합해 한 번의 순회에서 `home`/`away` 세그먼트를 동시에 채우도록 변경 — 결과값은 기존과 동일, 계산량만 절반.
2. **단순화 — 원정/홈 대칭 중복 3곳을 공용 컴포넌트로 추출**:
   - `TimeoutDots({ left })` — 점보트론 원정/홈 타임아웃 도트(byte-identical 중복)
   - `FoulBonusBadge({ fouls, align })` — 파울/BONUS 뱃지(정렬만 다름)
   - `TeamHeaderColumn({ side, abbr, name, wl, score, textColor, infoLoading })` — 헤더 좌우 팀 컬럼(약어/이름·성적/점수 3구획 grid, DOM 순서만 반대)
   - `MilestoneJumbotronBody({ teamAbbr, playerName, accentClass, label })` — 점보트론 combo/stat 마일스톤 카드(접근색·라벨만 다르고 구조 동일)

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음. 순수 리팩터링(추출/병합)이라 렌더 결과물은 이전과 동일해야 함.

**적용 보류(스킵)한 항목과 이유**:
- `PlayerBoxPanel`/`QuarterScores`가 `components/common/Table.tsx`의 Table 프리미티브 대신 클래스 문자열을 직접 복붙 — 대규모 마크업 치환이라 시각적 회귀 리스크 대비 실익 불확실, 이번 범위에서 보류.
- `estimatePossessions()` 근사식이 `GameOnOffTab.tsx`의 정확 포제션 계산과 중복 — 근사치→정확치 교체는 화면에 표시되는 ORTG/DRTG 숫자 자체가 바뀌는 동작 변경이라 스킵(단순화 범위 밖).
- `wl` useMemo가 `serverNow`(매초 tick) 의존이라 리그 전체 스케줄(최대 ~1230경기)을 매초 재순회 — 순회 자체가 가벼운 연산이라 실질 비용 무시할 수준, 추가 복잡도 대비 실익 없어 스킵.
- 점보트론/툴팁 곳곳의 고정폭 매직넘버(`w-16`→`w-24`, `ShotTooltip`의 `tooltipW/tooltipH` 추정치) — 이 파일의 반복적 소규모 UI 조정 방식에 비례한 실용적 선택으로 판단, ref 실측 기반 공용 레이아웃 프리미티브 도입은 현재 규모 대비 과한 구조 변경이라 스킵.
- 헤더 렌더 3단 중첩 삼항(`isScheduled ? A : isLive && activeJumbotron ? B : isLive ? C : null`) — `displayState`에서 파생된 깔끔한 3분기 상태 모델 위에 있는 얕은 분기라 서브컴포넌트 추출의 실익이 낮다고 판단, 스킵.
- `commitFoul()`의 즉시-로깅 패턴(`handleFreeThrowRebound`와 동일한 순서버그 가능성) — 이건 정확성(버그) 이슈라 `/simplify` 범위 밖(`/code-review` 대상), 스킵.

**롤백 방법**: 4개 추출 컴포넌트 호출부를 각 컴포넌트 정의의 return JSX로 인라인 치환하고, `teamSegments` useMemo를 `buildTeamSegments(isHome)` 함수 + 개별 `homeSegments`/`awaySegments` useMemo 2개로 되돌리면 됨.

---

## 2026-08-05 — 라이브 PBP 피드: 스코어/시간 컬럼 간격 축소 + 최신 로그 행 배경 페이드 인터랙션

**배경**: "라이브뷰의 PBP 코멘터리 영역 디자인 수정 — 양 팀 스코어와 시간 컬럼 간격이 너무 넓다. 그리고 가장 최신 PBP 코멘터리는 행 배경색을 약간 밝게 켰다가 시간이 지나며 다른 행과 동일해지는 인터랙션을 적용해달라" 요청.

**변경 파일**:
- `index.css` — `pbp-row-flash` keyframe + `.animate-pbp-row-flash` 신규
- `views/multi/season/MultiGamePbpView.tsx` — 라이브 PBP 피드(헤더 행 + `filteredLogs` + 3가지 로그 렌더 분기)

**1) 스코어/시간 컬럼 간격 축소**: 헤더 행과 `centerCols`(원정점수/쿼터·시간/홈점수 3칸)가 전부 행 전체의 `gap-2`(8px)를 그대로 공유하고 있어서 코멘터리 칸과 스코어 칸 사이도, 스코어와 시간 사이도 똑같이 넓었음. `centerCols`를 Fragment(`<>`)에서 `<div className="flex items-center gap-1 flex-shrink-0">`로 바꿔 3칸끼리는 `gap-1`(4px)만 쓰고, 바깥 코멘터리 칸과의 `gap-2`는 그대로 유지 — 헤더 행의 동일 3칸도 같은 구조로 맞춤(컬럼 정렬 유지 필수).

**2) 최신 로그 행 배경 페이드**: `.animate-pbp-row-flash`(밝은 흰색 오버레이 → 투명, 1.8s ease-out)를 `i === 0`(현재 필터링된 목록에서 가장 최근 로그)인 행에만 조건부로 붙임. 단, 기존 `key={i}`(배열 포지션)로는 새 로그가 도착할 때마다 같은 DOM 노드를 재사용해 애니메이션이 재생되지 않는 문제가 있어, `filteredLogs`가 `visibleEvents` 기준 불변 인덱스(`idx`)를 같이 들고 다니도록 변경하고 `key={idx}`로 교체 — 매 새 로그마다 실제로 새 DOM 노드가 마운트되어 애니메이션이 항상 처음부터 재생됨. flow-event 배너/교체 로그/일반 커멘터리 3개 렌더 분기 전부에 동일 적용.
`animation-fill-mode`는 기본값(none) 유지 — `forwards`를 쓰면 애니메이션 종료 후에도 `background-color: transparent`가 계속 적용돼 그 행에 `hover:bg-white/5`가 영구히 안 먹는 부작용이 생김.

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**롤백 방법**: `centerCols`를 다시 Fragment로, `filteredLogs`를 `PbpLog[]` 단순 배열(reverse만)로, `key={idx}`를 `key={i}`로, `flashClass` 조건부 삽입 3곳을 제거. `index.css`의 `pbp-row-flash` keyframe/클래스도 삭제 가능.

---

## 2026-08-05 — [추가 수정 2] 같은 전환에서 "경기 데이터를 준비하는 중입니다" 문구가 스쳐가던 버그

**배경**: 바로 위 항목(scheduledAt/gamePlayed 리셋)까지 적용한 뒤에도, 예정 경기→종료 경기 전환 시 "경기 데이터를 준비하는 중입니다. 잠시 후 다시 시도해주세요." 문구가 한 프레임 정도 스쳐간다는 재현 리포트. `isLoading`을 리셋에서 빠뜨린 게 원인 — 직전(예정) 화면에서 `isLoading`은 이미 `false`로 내려가 있는데, 새 `scheduledAt`/`gamePlayed`가 확정되는 순간 로딩 게이트(`isLoading || scheduledAt===undefined`, line 2052)가 새 경기의 `gameData` fetch가 시작되기도 전에 먼저 풀려버려, 그 사이 한 렌더 동안 두 번째 게이트(`error || (!gameData && !isScheduled)`, line 2071)가 "gameData 없음"으로 잡아 이 문구를 노출시킴.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — 동일한 `resolvedGameId` 리셋 effect에 `setIsLoading(true)` 추가

**Before**:
```ts
useEffect(() => {
    setGameData(null);
    setError(null);
    setScheduledAt(undefined);
    setGamePlayed(false);
}, [resolvedGameId]);
```

**After**:
```ts
useEffect(() => {
    setGameData(null);
    setError(null);
    setScheduledAt(undefined);
    setGamePlayed(false);
    setIsLoading(true);
}, [resolvedGameId]);
```

**동작 방식**: `isLoading`을 즉시 `true`로 리셋해서, 새 경기의 `fetchLiveGameView`가 완료되어 자체적으로 `setIsLoading(false)`를 호출하기 전까지 로딩 게이트(line 2052)가 계속 닫혀있게(=스피너 유지) 만듦. 그 사이 `gameData`가 null인 렌더가 두 번째 게이트에 노출될 틈 자체가 없어짐.

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**롤백 방법**: 추가한 `setIsLoading(true)` 한 줄만 제거하면 됨.

---

## 2026-08-05 — [추가 수정] 예정 경기→종료 경기 전환 시 라이브 화면이 스쳐가던 버그 (바로 위 스켈레톤 작업의 놓친 부분)

**배경**: 바로 위 스켈레톤 작업 적용 후 사용자가 "스켈레톤이 안 뜨고, 라이브 화면이 잠깐 보였다가 로더가 깜빡이고 종료 화면으로 이동한다"고 재현 — `gameData`/`rosterCache`/`scheduledRosterCache`는 리셋했지만 **`scheduledAt`/`gamePlayed`를 리셋에서 빠뜨림**. 이전(예정) 경기의 미래 `scheduledAt`이 그대로 남아있다가, 그 시각이 "지금 막 지났거나 곧 지날 시점"과 우연히 겹치면 `getGameDisplayState()`가 이를 live 구간(`start ~ start+REPLAY_DURATION_MS`)으로 오판해 라이브 화면이 잠깐 렌더되고, 뒤이어 새 경기의 진짜 `scheduledAt`/`gamePlayed`가 비동기로 갱신되며 화면이 다시 바뀜.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — `resolvedGameId` 변경 시 리셋하는 effect(바로 위 항목에서 만든 것과 동일한 effect)에 `setScheduledAt(undefined)`, `setGamePlayed(false)` 추가

**Before**:
```ts
useEffect(() => {
    setGameData(null);
    setError(null);
}, [resolvedGameId]);
```

**After**:
```ts
useEffect(() => {
    setGameData(null);
    setError(null);
    setScheduledAt(undefined);
    setGamePlayed(false);
}, [resolvedGameId]);
```

**동작 방식**: `scheduledAt`을 `undefined`로 되돌리면 `getGameDisplayState()`가 "미확정" 분기(`!game.scheduledAt → played 기준`)로 처리해 `displayState`가 곧바로 `'scheduled'`가 되고(이때 `gamePlayed`도 `false`로 같이 리셋했으므로), 경기 상세 조회 effect의 `if (scheduledAt === undefined) return;` 가드에 걸려 새 값이 확정되기 전까지 `fetchLiveGameView` 자체가 호출되지 않는다 — 그래서 헛다리 짚는 live fetch/로더 깜빡임이 사라짐.

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**롤백 방법**: 추가한 `setScheduledAt(undefined)`/`setGamePlayed(false)` 두 줄만 제거하면 됨.

---

## 2026-08-05 — 경기 전환 시 헤더/선수명/OVR이 잘못된 값으로 잠깐 보이는 버그 → 스켈레톤 UI로 교체

**배경**: "예정된 경기 화면을 보다가 상단 경기 리스트로 종료된 경기로 넘어가면, 팀 이름이 AWY/HOM으로 있다가 바뀌고, 선수 이름에 UUID가 노출되고, OVR도 틀린 값이었다가 정정된다" 리포트. `MultiGamePbpView`는 라우트가 `:gameId`만 바뀌면 리마운트되지 않는 단일 컴포넌트라, 여러 개의 독립된 비동기 fetch가 각자 다른 타이밍에 "아직 못 구했을 때" 값을 허술한 폴백(하드코딩 문자열/UUID/고정 70)으로 채우고 있었던 게 원인 — 로딩 자체를 숨기지 말고 명시적 스켈레톤으로 교체.

**변경 파일**:
- `components/common/Skeleton.tsx` (신규) — 공용 회색 펄스 바(`bg-slate-700/30 animate-pulse`, `views/lobby/LobbyPanel.tsx`의 기존 `SkeletonCard`와 동일 톤)
- `views/multi/season/MultiGamePbpView.tsx`
- `components/game/PlayerIdentityCells.tsx`

**증상별 원인 → 수정**:

1. **팀 이름이 `'HOM'`/`'AWY'`로 보임**: `homeAbbr`/`awayAbbr`가 `homeTeamId`/`awayTeamId`(schedule 매칭 또는 gameData) 둘 다 없을 때 리터럴 `'HOM'`/`'AWY'`로 폴백(1712-1713행). 헤더의 약어/팀명 렌더 지점 4곳(원정/홈 각각 약어+팀명)을 `homeInfoLoading`/`awayInfoLoading`(=`!homeTeamId`/`!awayTeamId`) 조건으로 감싸 로딩 중엔 `<Skeleton>`을 렌더.

2. **선수 이름에 UUID 노출**: 예정 경기 화면의 0스탯 박스스코어(`buildZeroStatBox`)가 `scheduledRosterCache[id]?.name ?? id`로 캐시 미도착 시 UUID를 그대로 이름으로 썼음. `?? id` → `?? ''`로 변경하고, `PlayerBoxPanel`이 `p.playerName`이 빈 문자열이면 이름 대신 `<Skeleton>`을 렌더하도록 수정.

3. **OVR이 70이었다가 정정됨**: `PlayerIdentityCells.tsx`의 `ovr = playerInfo ? calculatePlayerOvr(playerInfo) : 70` — `team.roster`엔 실제 능력치(rosterCache) 로딩 전 `{id,name,position}`만 있는 스텁이 항상 채워져 있어 `playerInfo`가 truthy라 이 삼항연산자로는 못 걸러짐. `Player` 필수 필드인 `age` 존재 여부로 스텁 여부를 판별(`isStub`)해서, 스텁이면 `ovr = null`로 만들고 `OvrBadge` 대신 `<Skeleton>`(원형)을 렌더.

**캐시 리셋**: 위 세 증상 모두 "이전 경기의 캐시가 새 경기로 넘어가도 안 비워짐"이 공통 원인이라, `rosterCache`/`scheduledRosterCache` 둘 다 `resolvedGameId`가 바뀌면 즉시 `{}`로 비우는 `useEffect`를 추가(기존 `gameData`/`error` 리셋과 동일 패턴).

**검증**: `npx tsc --noEmit -p tscheck.json` 관련 파일 전부 에러 없음.

**롤백 방법**: 위 3개 파일에서 이번에 추가한 리셋 effect 2개, 스켈레톤 조건부 렌더 6곳(헤더 4곳 + PlayerBoxPanel 1곳 + PlayerIdentityCells 1곳), `buildZeroStatBox`의 `?? id`→`?? ''` 변경, `PlayerIdentityCells`의 `isStub` 판별 로직을 되돌리면 됨. `components/common/Skeleton.tsx`는 다른 곳에서 참조하지 않으면 파일째 삭제 가능.

---

## 2026-08-05 — 멀티플레이어 라이브 박스스코어(PlayerBoxPanel)에 결과 화면 테이블 디자인 이식

**배경**: "멀티플레이어 게임 중 화면의 박스스코어 테이블 디자인을 변경하고 싶음. 경기 종료 화면의 박스스코어 테이블 디자인 언어를 이식해줘." 요청. 바로 위(같은 파일)의 `QuarterScores` 컴포넌트가 2026-08-04에 동일한 방식으로 `components/common/Table.tsx`/`BoxScoreTable.tsx` 디자인을 이식받은 전례가 있어 그 패턴을 그대로 따름.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — `PlayerBoxPanel`(라이브 중 좌/우 사이드바 박스스코어), `BoxScorePlaceholder`(경기 시작 전 자리표시자)

**Before**: `PlayerBoxPanel`은 `<table>`이 아니라 `gridTemplateColumns`(`BOX_GRID`) 인라인 스타일을 쓰는 `<div>` 그리드였음. 헤더 `bg-slate-800 text-slate-400 font-bold`, 짝수 행 zebra(`bg-slate-800/20`), 스탯 숫자 `text-slate-300`(포인트 포함 전부 동일 톤), 팀합계 행 `bg-slate-800/60`.

**After**: 실제 `<table>`/`<thead>`/`<tbody>`/`<tfoot>`로 재작성, 결과 화면 테이블과 동일한 클래스 체계 적용:
- `thead`: `bg-slate-950 sticky top-0 z-10 border-b border-slate-800 shadow-sm`, 헤더 텍스트 `text-slate-500 font-black uppercase tracking-widest`
- `tbody`: `bg-slate-900`, 행은 zebra 제거하고 `hover:bg-white/5`만(라이브 온코트 강조 `bg-emerald-400/15`는 기능적 표시라 유지)
- 셀 구분선 전부 `border-b border-slate-800/50`로 통일
- 스탯 숫자 셀: `text-white font-semibold tabular-nums`(기존 `text-slate-300`에서 격상 — `BoxScoreTable.tsx`의 `sc` 클래스와 동일)
- 팀합계 `tfoot` 행: `bg-slate-800/50 border-t border-slate-700`(기존 `bg-slate-800/60`에서 정확한 결과화면 값으로 일치)
- `BoxScorePlaceholder`도 헤더 톤을 동일하게 맞춤(`bg-slate-950 text-slate-500 font-black tracking-widest border-b border-slate-800 shadow-sm`)

핫/콜드 스트릭 이모지, 온코트 에메랄드 강조 등 라이브 전용 기능은 그대로 유지. 컬럼 폭은 `<th>`에 기존 `BOX_GRID`와 유사한 `w-*` 클래스로 근사 대응(완전히 픽셀 동일하진 않음, 자연스러운 테이블 오토 레이아웃 사용).

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**주의사항**: 이 패널은 자체 스크롤 컨테이너가 없는 `shrink-0` 블록이라 `thead`의 `sticky top-0`은 실질적으로 작동하지 않음(해가 되진 않지만 무의미) — 디자인 일관성을 위해 그대로 넣어둠.

**롤백 방법**: `PlayerBoxPanel`/`BoxScorePlaceholder`를 Before의 div-그리드 버전으로 되돌리면 됨.

---

## 2026-08-05 — 점보트론 BONUS 칩-타임아웃 겹침 수정 + 런 그라디언트 대폭 확장

**배경**: 스크린샷 확인 결과 두 가지 문제. (1) 홈팀이 보너스 상황일 때 BONUS 칩이 타임아웃 도트 칸과 겹쳐 보임. (2) 스코어링 런 그라디언트를 훨씬 더 넓게(이미지에 표시된 영역만큼) 확장 요청, 하단이 헤더 영역 밖으로 나가 클리핑돼도 무방.

**원인 (1)**: 파울/보너스 표시 슬롯이 `w-16`(64px) 고정폭인데, `BONUS` 뱃지(`px-1` 패딩 + `text-base font-black`)의 실제 렌더링 폭이 64px보다 넓었음. flex 자식은 `w-16`으로 박스 자체의 레이아웃 폭은 64px로 고정되지만 내용물에 `overflow-hidden`이 없어서 넘치는 부분이 잘리지 않고 박스 밖으로 그대로 삐져나옴. 홈쪽 슬롯은 `text-right`(오른쪽 끝 고정)이라 넘치는 만큼 왼쪽(타임아웃 칸 쪽)으로 침범, 원정쪽도 방향만 반대로 동일한 잠재 문제(타임아웃 칸 쪽으로 침범)가 있었음(원정은 그 시점에 보너스 상태가 아니어서 스크린샷엔 안 보였을 뿐).

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — 파울/보너스 슬롯 2곳(원정 약 line 2203, 홈 약 line 2252), 런 그라디언트 스타일(약 line 2260대)

**Before**: 파울/보너스 슬롯 `w-16 shrink-0`(원정)/`w-16 shrink-0 text-right`(홈). 런 그라디언트 `bottom:'-24px', width:'480px', height:'120px', filter:'blur(8px)'`.

**After**: 파울/보너스 슬롯 `w-24 shrink-0`(원정)/`w-24 shrink-0 text-right`(홈) — 96px로 확장해 BONUS 뱃지가 완전히 들어갈 여유 확보. 런 그라디언트 `bottom:'-40px', width:'900px', height:'200px', filter:'blur(10px)'` — 헤더 컨테이너(`overflow-hidden`)가 있는 최상위에서만 클리핑되므로 40% 폭인 점보트론 컬럼 경계를 넘어 넓게 퍼져도 문제 없음(의도적으로 헤더 하단 밖으로 나가 잘리도록 `bottom` 값도 더 음수로 내림).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: 파울/보너스 슬롯 `w-24`→`w-16`, 런 그라디언트 스타일 값들을 Before로 되돌리면 됨.

---

## 2026-08-05 — 스코어링 런 발생 시 점보트론 중앙 하단에 불타는 듯한 붉은 그라디언트 추가

**배경**: "스코어링 런 발생시에 점보트론 중앙 하단에 타원형으로 붉은색 그라디언트를 넣어줄 수 있나? 불타는것처럼 보이게끔" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (점보트론 idle grid, 런 정보 블록 바로 위, 약 line 2176)

**Before**:
```tsx
<div className="self-stretch w-full grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-4 min-h-20">
    {/* 1행 1열: 원정 파울/보너스 + 타임아웃 */}
    ...
```

**After**:
```tsx
<div className="relative self-stretch w-full grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-4 min-h-20">
    {!showBox && isLive && activeRun && (
        <div
            className="absolute left-1/2 -translate-x-1/2 -z-10 pointer-events-none animate-pulse"
            style={{
                bottom: '-24px',
                width: '480px',
                height: '120px',
                background: 'radial-gradient(ellipse 50% 50% at 50% 100%, rgba(255,120,0,0.6) 0%, rgba(239,68,68,0.4) 45%, rgba(239,68,68,0) 75%)',
                filter: 'blur(8px)',
            }}
        />
    )}
    {/* 1행 1열: 원정 파울/보너스 + 타임아웃 */}
    ...
```
(1차 구현은 width 260px/height 64px/bottom-0였으나, "더 넓은 영역으로 확장, 타원 하단이 영역 밖으로 나가 클리핑돼도 괜찮음" 후속 요청으로 width 480px/height 120px/bottom -24px로 확장 — 일부러 컨테이너 아래로 내려서 하단이 잘리도록 함.)

**동작 원리**: 그리드 컨테이너에 `relative`를 줘서 새 스태킹 컨텍스트를 만들고, 그 안에 `absolute` + `-z-10`인 타원형 radial-gradient(주황 코어 → 빨강 → 투명) 블롭을 추가. `-z-10`이라 같은 컨테이너 안의 static 콘텐츠(파울/타임아웃/쿼터·클락 텍스트)보다 항상 뒤에 그려짐. `absolute`라 grid 셀을 소비하지 않아 레이아웃(칸 배치)에는 전혀 영향 없음. `blur(8px)`로 경계를 흐릿하게, `animate-pulse`(Tailwind 기본 유틸)로 은은하게 깜빡여 "불타는" 느낌을 냄. `activeRun`이 없어지면 즉시 사라짐.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `relative` 클래스 및 삽입된 glow `<div>` 블록 제거하면 이전 상태로 완전히 복원됨(레이아웃에 부작용 없었으므로 다른 코드 수정 불필요).

---

## 2026-08-05 — 헤더 좌우 팀 컬럼(약어/이름·성적/점수)을 3구획 grid로 재구성

**배경**: "[팀약어] [팀이름/성적] [점수] 구조에서, 팀이름/성적 길이에 따라 점수 위치가 밀리지 않고 점수가 항상 안쪽(원정=우측, 홈=좌측)에 밀착되도록, 중앙 점보트론처럼 좌우 영역도 구획을 나눠서 언제나 균일한 레이아웃을 유지"해달라는 요청.

**원인**: 기존 구조가 `flex items-center justify-start/justify-end gap-5`였음 — 약어/이름/점수 세 요소가 `gap`만으로 붙은 한 덩어리라, 팀 이름 텍스트 길이가 바뀌면 그 덩어리 전체 폭이 바뀌면서(justify-start/end로 컬럼 안쪽 또는 바깥쪽 끝에 정렬되는 건 이 "덩어리" 자체이므로) 점수의 절대 위치가 이름 길이에 종속적으로 흔들렸음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 원정/홈 팀 컬럼, 각 약 line 2082 / 2278)

**Before** (원정, 홈은 순서만 반대):
```tsx
<div className="flex items-center justify-start gap-5 py-6 px-8 shrink-0" style={{ color: awayText, width: '30%' }}>
    <span className="text-5xl ...">{awayAbbr.slice(0, 3)}</span>
    <div className="flex flex-col items-start gap-1 min-w-0">
        <span className="... truncate">{awayName}</span>
        {awayWL && <span ...>{awayWL.wins}W {awayWL.losses}L</span>}
    </div>
    <span className="text-6xl ...">{currentScore.away}</span>
</div>
```

**After**:
```tsx
<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-5 py-6 px-8 shrink-0" style={{ color: awayText, width: '30%' }}>
    <span className="text-5xl ... shrink-0">{awayAbbr.slice(0, 3)}</span>
    <div className="flex flex-col items-start gap-1 min-w-0">
        <span className="... truncate">{awayName}</span>
        {awayWL && <span ...>{awayWL.wins}W {awayWL.losses}L</span>}
    </div>
    <span className="text-6xl ... shrink-0 justify-self-end">{currentScore.away}</span>
</div>
```
홈 컬럼은 DOM 순서(점수→이름→약어)를 그대로 두고 동일하게 `grid grid-cols-[auto_minmax(0,1fr)_auto]`로 전환(1열=점수, `justify-self-start`로 안쪽/좌측 고정, 3열=약어로 바깥쪽/우측 고정).

**동작 원리**: 가운데 이름/성적 칸을 `minmax(0,1fr)`로 지정해 컬럼 내 남는 공간을 전부 흡수(넘치면 `truncate`)하게 만들고, 약어·점수 칸은 `auto`(콘텐츠 크기)로 각각 grid의 첫/마지막 트랙에 고정됨 — 이름 텍스트가 아무리 길거나 짧아져도 약어는 항상 바깥쪽 끝, 점수는 항상 안쪽 끝에서 움직이지 않음. 중앙 점보트론의 `grid-cols-[1fr_auto_1fr]` 구획화와 동일한 설계 철학.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: 두 컬럼의 `grid grid-cols-[auto_minmax(0,1fr)_auto]`를 `flex items-center justify-start`(원정)/`justify-end`(홈)로 되돌리고, 점수 span의 `justify-self-end`/`justify-self-start` 클래스 제거.

---

## 2026-08-05 — 라이브 점보트론 그리드를 경기 종료 화면 헤더와 완전히 분리

**배경**: "경기 중 화면의 헤더를 수정하니 경기 종료 화면의 헤더에도 영향을 미친다. 둘을 분리하고, 경기 종료 화면의 헤더는 이전처럼 되돌려." 스크린샷으로 종료 화면 헤더 레이아웃이 어긋나 있는 것 확인.

**원인**: 헤더 가운데 컬럼의 렌더 분기가 `isScheduled ? A : (isLive && activeJumbotron) ? B : C` 3항 구조였는데, `C`(점보트론 idle 3단 그리드, `min-h-20`/`px-4`/`grid-cols-[1fr_auto_1fr]` 포함)가 `else`(무조건 렌더) 자리였다. `showBox`(경기 종료) 상태에서는 `isScheduled`도 `isLive`도 둘 다 false라서 마찬가지로 `C` 분기로 떨어졌고, 안의 콘텐츠는 전부 `isLive &&`로 가려져 비어있지만 그리드 컨테이너 자체(특히 `min-h-20`으로 예약해둔 80px 최소 높이)는 그대로 적용되고 있었다. 원래(점보트론 작업 이전)는 이 자리가 빈 콘텐츠면 자연히 높이 0으로 접혔는데, 이제는 항상 최소 80px를 차지하게 되면서 종료 화면 헤더 레이아웃이 밀렸음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼 렌더 분기)

**Before**: `isScheduled ? A : (isLive && activeJumbotron) ? B : C` — `C`가 라이브/종료 화면 공용.
**After**: `isScheduled ? A : (isLive && activeJumbotron) ? B : isLive ? C : null` — `C`는 라이브 전용, 종료 화면은 `null`(예전처럼 아무것도 안 그림, 높이 0).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `isLive ? C : null`을 다시 `C`(무조건)로 되돌리면 됨(단, 종료 화면에 영향 재발).

---

## 2026-08-05 — 점보트론 런 정보를 가운데 컬럼 2줄 블록으로 재통합(v2, absolute 방식 대체)

**배경**: 직전 수정(v1, `position:absolute`로 런 정보를 grid 흐름에서 제외)이 "팀정보 안 밀림" 문제는 해결했지만, "스코어링 런이 발생되면 가운데 영역의 텍스트는 두줄처리되고, 수직 수평 중앙 정렬이 되어야해"라는 후속 요청 — absolute로 그리드 바깥에 떠 있는 방식이라 쿼터/클락 줄과 한 덩어리로 응집돼 보이지 않고, 별도로 붕 떠 보이는 문제가 있었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼, 점보트론 idle 그리드)

**Before (v1)**: 런 정보를 `position: absolute; left-1/2 -translate-x-1/2 top-full`로 그리드 레이아웃 밖에 붙임 — "안 밀림"은 되지만 쿼터/클락과 시각적으로 분리됨.

**After (v2)**:
```tsx
<div className="self-stretch w-full grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-4 min-h-20">
    {/* 원정 컬럼 */}
    ...
    {/* 가운데 컬럼 — 쿼터+클락과 런 정보를 같은 flex-col 안에 넣어 하나의 2줄 블록으로 */}
    <div className="h-full flex flex-col items-center justify-center gap-0.5 justify-self-center">
        <div className="flex items-center gap-2">{/* 쿼터 | 클락 */}</div>
        {activeRun && (
            <span className="text-2xl font-bold text-white whitespace-nowrap">🔥 ...</span>
        )}
    </div>
    {/* 홈 컬럼 */}
    ...
</div>
```
- 런 정보를 grid 바깥 absolute 대신, 가운데 컬럼 자체를 `flex-col`로 만들어 쿼터+클락 줄 바로 아래 2번째 줄로 자연스럽게 편입 — `items-center`(가로)+`justify-center`(세로)로 1줄이든 2줄이든 이 컬럼 안에서 항상 수직·수평 중앙 정렬됨.
- "팀정보 안 밀림"은 grid 컨테이너 자체에 준 `min-h-20`(런 정보까지 2줄 들어갈 여유를 항상 확보)으로 유지 — 런 유무와 무관하게 grid 행 높이가 항상 동일하므로, absolute 없이도 팀정보(원정/홈 컬럼)가 안 흔들림.
- `relative`(v1에서 absolute 기준점용으로 추가했던 것)는 더 이상 필요 없어 제거.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: v1(absolute) 블록으로 되돌리려면 가운데 컬럼에서 런 정보를 다시 분리해 grid 컨테이너 바깥 `absolute` 블록으로 옮기고 `relative` 재추가.

---

## 2026-08-05 — 점보트론 outer 패딩 px-4 + 스코어링 런 표시 시 팀정보 위로 밀리는 문제 수정

**배경**: "파울카운트 바깥쪽 패딩값이 몇이지?"(px-2 확인) 후 "px-4로 늘려줘. 그리고 스코어링 런 카운트가 떠도 좌우의 팀정보 영역이 위로 밀리지 않게, 3개 컨테이너의 높이는 부모 컨테이너의 100%로 설정해줘." 스크린샷에서 런 표시(🔥 MIL 13-4)가 뜨면 그 위의 "파울1"/"파울2" 팀정보 줄이 원래 위치보다 아래로 처져 보이는(=런 없을 때보다 상대적으로 밀리는) 문제.

**원인**: 스코어링 런 정보를 grid 2번째 행(빈칸/런정보/빈칸 3칸)으로 넣고 있었는데, 이 grid는 상위 "가운데 컬럼"의 `justify-center`(세로 중앙정렬) 안에 있는 가변 높이 블록이다. 런 정보가 뜨거나 사라질 때마다 grid의 총 높이(1행만 vs 1+2행)가 바뀌고, 상위의 `justify-center`가 그 새 높이를 기준으로 블록 전체를 다시 세로 중앙정렬하면서, 1행(팀정보/쿼터/클락)의 화면상 위치 자체가 위아래로 흔들리고 있었다.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼, 점보트론 idle 그리드)

**Before**:
```tsx
<div className="self-stretch w-full grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-2">
    <div className="flex items-center gap-1.5 justify-self-start ...">{/* 원정 */}</div>
    <div className="flex items-center gap-2 justify-self-center">{/* 쿼터+클락 */}</div>
    <div className="flex items-center gap-1.5 justify-self-end ...">{/* 홈 */}</div>
    {activeRun && (
        <>
            <div />
            <div className="justify-self-center">🔥 ...</div>  {/* grid 2행 — 총 높이를 변화시킴 */}
            <div />
        </>
    )}
</div>
```

**After**:
```tsx
<div className="relative self-stretch w-full grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-4">
    <div className="h-full flex items-center gap-1.5 justify-self-start ...">{/* 원정 */}</div>
    <div className="h-full flex items-center gap-2 justify-self-center">{/* 쿼터+클락 */}</div>
    <div className="h-full flex items-center gap-1.5 justify-self-end ...">{/* 홈 */}</div>
    {activeRun && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-0.5">
            🔥 ...   {/* grid 레이아웃 흐름에서 완전히 제외 — grid 자체 높이엔 전혀 관여 안 함 */}
        </div>
    )}
</div>
```
- 바깥 패딩 `px-2` → `px-4`.
- 1행 3개 컨테이너(원정/쿼터·클락/홈)에 `h-full` 추가.
- 스코어링 런 정보를 grid의 실제 2번째 행(레이아웃에 참여, 높이에 영향)에서 `position:absolute`(레이아웃 흐름 완전히 제외)로 전환 — grid 자체의 높이는 런 유무와 무관하게 항상 1행 높이로 고정되므로, 상위 `justify-center`가 재중앙정렬해도 1행 위치가 흔들리지 않음. 컨테이너에 `relative` 추가해 absolute의 기준점을 이 grid로 고정.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `absolute` 블록을 grid 2행(빈칸/런정보/빈칸 3칸) 방식으로 되돌리고, `h-full`/`relative`/`px-4`→`px-2` 제거.

---

## 2026-08-05 — 점보트론 평시(idle) 레이아웃을 3단 그리드로 전면 재설계

**배경**: "중앙 점보트론의 평시 디자인을 아래와 같이 바꿔줘 — 3단으로 나눈다. (1) 스코어링 런 없을 때: `[파울/보너스][타임아웃] | [쿼터][게임클락] | [타임아웃][파울/보너스]` 한 줄. (2) 런 있을 때: 위 줄 그대로 + 그 아래 가운데 열에만 [스코어링 런 정보]. (3) 이벤트 메세지 노출 시: 가운데만 [이벤트 메세지], 양옆은 비움(기존 activeJumbotron 분기가 이미 이렇게 동작 중이라 별도 수정 불필요)."

기존엔 "쿼터+클락"(1행, 중앙 정렬)과 "파울/보너스+타임아웃"(2행, `justify-between`으로 좌우 끝 스프레드)이 서로 다른 정렬 기준을 쓰는 별도의 두 줄이었는데, 요청대로 하나의 3열 그리드 행으로 합치고, 스코어링 런 정보만 그 아래 별도 행(가운데 열에만)으로 배치.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼, `isLive`-idle 상태 렌더 블록 전체)

**After** (핵심 구조):
```tsx
<div className="self-stretch w-full grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-2">
    {/* 1행 1열: 원정 파울/보너스 + 타임아웃 */}
    <div className="flex items-center gap-1.5 justify-self-start ...">...</div>
    {/* 1행 2열: 쿼터 + 게임클락 */}
    <div className="flex items-center gap-2 justify-self-center">...</div>
    {/* 1행 3열: 홈 타임아웃 + 파울/보너스 */}
    <div className="flex items-center gap-1.5 justify-self-end ...">...</div>

    {/* 2행: 스코어링 런 — 있을 때만, 좌우 열은 빈 <div/>로 자리만 (grid auto-flow가 3칸씩 채운 뒤
        자동으로 다음 행으로 넘어가는 걸 이용, 명시적 grid-row 지정 불필요) */}
    {!showBox && isLive && activeRun && (
        <>
            <div />
            <div className="justify-self-center">🔥 ...</div>
            <div />
        </>
    )}
</div>
```
- `grid-cols-[1fr_auto_1fr]` — 양옆 열은 남는 공간을 1:1로 나눠 갖고(원정은 `justify-self-start`로 좌측 끝, 홈은 `justify-self-end`로 우측 끝), 가운데 열은 콘텐츠(쿼터+클락) 크기만큼만 차지.
- 파울/보너스/타임아웃 슬롯의 고정폭(`w-16`)·양자택일 로직은 그대로 유지, 위치만 이 그리드의 1열/3열로 이동.
- 스코어링 런 행은 grid의 자동 줄바꿈(auto-flow)에 의존 — 명시적으로 `grid-row-start` 등을 안 줘도 3칸(1열+2열+3열)을 채우면 자동으로 다음 행으로 넘어가므로, 조건부로 3개 아이템(빈칸/런정보/빈칸)만 추가하면 항상 가운데 열 아래에 정확히 배치됨.
- 이벤트 메세지(활성 점보트론) 분기는 이 그리드 바깥의 별도 `else if` 가지라 이번 변경과 무관 — 기존처럼 계속 중앙 정렬된 단일 메세지로 표시됨.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: 그리드 구조를 이전의 "flex flex-col items-center" 2줄 구조(쿼터+클락 중앙정렬 행 / 파울+타임아웃 justify-between 행)로 되돌리면 됨.

---

## 2026-08-05 — 점보트론 파울/타임아웃 행 마무리 다듬기(가장자리 패딩 → 보너스/파울 슬롯 통합 → 팀약어 삭제)

**배경**: 직전 고정폭 슬롯 구조 적용 후 스크린샷 기준 연속 피드백 3건. (1) "팀이름이 보더라인에 너무 붙어있다, 패딩 필요" (2) "보너스 칩과 파울 카운트는 같은 영역을 공유하면 됌. 두 개가 동시에 뜰 수 없음" (3) "생각해보니 팀 약어는 없애도 될듯? 어차피 방향으로 원정/홈이 구분되니까" — 세 요청이 한 턴 안에 연속으로 들어와 최종 구조로 한번에 반영.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼, 파울/보너스/타임아웃 행)

**변경 내용**:
1. 행 전체 컨테이너에 `px-2` 추가 — 가장자리 콘텐츠가 헤더 보더라인에 붙지 않게.
2. 보너스(`w-16`)/파울카운트(`w-16`) 별도 슬롯 2개 → 하나의 `w-16` 슬롯으로 통합, 내부에서 `awayFouls >= 5 ? BONUS : 파울N`로 양자택일(둘이 동시에 뜰 일이 없으므로 자리를 나눌 필요가 없었음).
3. 팀 약어(`w-12`) 슬롯 완전 삭제 — 원정은 좌측 끝, 홈은 우측 끝이라는 위치 자체가 이미 구분 정보라 약어 표시가 불필요.

**최종 구조** (원정: `[보너스/파울] [타임아웃]` ‖ 홈: `[타임아웃] [보너스/파울]`, `justify-between`으로 좌우 끝 스프레드):
```tsx
<div className="self-stretch w-full flex items-center justify-between px-2 text-xl text-slate-400">
    <span className="flex items-center gap-1.5">
        <span className="w-16 shrink-0">
            {awayFouls >= 5 ? <BONUS/> : <span>파울 {awayFouls}</span>}
        </span>
        <span className="w-16 shrink-0 flex gap-0.5 text-xl">{/* 타임아웃 점 4개 */}</span>
    </span>
    <span className="flex items-center gap-1.5">
        <span className="w-16 shrink-0 flex gap-0.5 text-xl">{/* 타임아웃 점 4개 */}</span>
        <span className="w-16 shrink-0 text-right">
            {homeFouls >= 5 ? <BONUS/> : <span>파울 {homeFouls}</span>}
        </span>
    </span>
</div>
```

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음(3번 모두 동일 확인).

**롤백 방법**: 팀약어 슬롯(`w-12`, awayAbbr/homeAbbr) 복원, 보너스/파울 슬롯을 2개(`w-16` × 2)로 재분리, 컨테이너 `px-2` 제거.

---

## 2026-08-05 — 점보트론 파울/보너스/타임아웃 행을 고정폭 슬롯 구조로 재설계(전광판처럼 안 흔들리게)

**배경**: "팀 약어/파울 카운트는 text-xl 유지, 타임아웃 도트도 비례해서. 팀약어·타임아웃·파울카운트·BONUS칩이 나타나고 사라짐에 따라 아랫줄 레이아웃이 계속 바뀌는데, 실제 전광판처럼 저 정보들이 뜨는 영역을 고정시켜줘. `[팀이름][보너스][파울카운트][타임아웃카운트] ---- [타임아웃카운트][파울카운트][보너스][팀이름]`처럼 원정/홈을 좌우 끝으로 스프레드하고 가운데는 비워두면 됨." 적용 후 "영역 설정이 좀 이상하다"는 스크린샷 재현(원정/홈 그룹이 좌우 끝이 아니라 가운데로 뭉쳐 보임) → 원인 파악 후 재수정.

**원인(1차 시도 후)**: 파울/타임아웃 행에 `self-stretch w-full`을 줬지만, 그 행의 부모(`flex flex-col items-center gap-1.5` wrapper) 자체는 가운데 컬럼의 40% 폭까지 안 늘어나 있고 콘텐츠 크기만큼만 차지하고 있었음 — `self-stretch`는 "부모의 실제 크기"를 기준으로 늘어나는 것이라, 부모 자체가 안 늘어나 있으면 `w-full`이 사실상 아무 효과가 없었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼, 파울/보너스/타임아웃 행 + 그 부모 wrapper)

**Before** (양자택일 구조, 폭이 서로 달라 내용 전환마다 레이아웃이 흔들림):
```tsx
<div className="flex flex-col items-center gap-1.5">
    ...
    <div className="flex items-center gap-2 text-xl text-slate-400">
        <span className="flex items-center gap-1.5">
            <span className="text-xl font-mono font-bold text-white">{awayAbbr}</span>
            <span className="flex gap-0.5">{/* 타임아웃 점 4개 */}</span>
            {awayFouls >= 5 ? <BONUS/> : <span>파울 {awayFouls}</span>}
        </span>
        <span className="text-slate-700">|</span>
        <span className="flex items-center gap-1.5">
            {homeFouls >= 5 ? <BONUS/> : <span>파울 {homeFouls}</span>}
            <span className="flex gap-0.5">{/* 타임아웃 점 4개 */}</span>
        </span>
    </div>
</div>
```

**After** (팀/보너스/파울/타임아웃 4개 고정폭 슬롯, 콘텐츠 유무와 무관하게 슬롯 폭 고정):
```tsx
<div className="self-stretch flex flex-col items-center gap-1.5">  {/* wrapper도 self-stretch로 40% 폭 확보 */}
    ...
    <div className="self-stretch w-full flex items-center justify-between text-xl text-slate-400">
        <span className="flex items-center gap-1.5">   {/* 원정: 팀 → 보너스 → 파울 → 타임아웃 */}
            <span className="w-12 shrink-0 ...">{awayAbbr}</span>
            <span className="w-16 shrink-0">{awayFouls >= 5 && <BONUS/>}</span>
            <span className="w-16 shrink-0">{awayFouls < 5 && <span>파울 {awayFouls}</span>}</span>
            <span className="w-16 shrink-0 flex gap-0.5">{/* 타임아웃 점 4개 */}</span>
        </span>
        <span className="flex items-center gap-1.5">   {/* 홈: 타임아웃 → 파울 → 보너스 → 팀(거울 대칭) */}
            <span className="w-16 shrink-0 flex gap-0.5">{/* 타임아웃 점 4개 */}</span>
            <span className="w-16 shrink-0 text-right">{homeFouls < 5 && <span>파울 {homeFouls}</span>}</span>
            <span className="w-16 shrink-0 text-right">{homeFouls >= 5 && <BONUS/>}</span>
            <span className="w-12 shrink-0 text-right ...">{homeAbbr}</span>
        </span>
    </div>
</div>
```
- 보너스/파울카운트를 하나의 자리를 양자택일로 채우던 구조에서, 각각 독립된 `w-16` 고정폭 슬롯으로 분리 — 둘 다 비어있을 일은 없지만(항상 둘 중 하나만 조건부 렌더) 슬롯 자체는 항상 그 자리를 차지하므로 전환 시 옆 요소가 안 밀림.
- `justify-between`으로 원정 그룹은 좌측 끝, 홈 그룹은 우측 끝에 붙고 가운데는 빈 공간.
- 순서 변경: 기존 "팀→타임아웃→파울/보너스"에서 "팀→보너스→파울→타임아웃"(원정), 거울 대칭으로 "타임아웃→파울→보너스→팀"(홈).
- 가운데 세로 구분선(`|`) 삭제 — 가운데는 빈 공간으로 남기는 게 요청 의도.
- **부모 wrapper에도 `self-stretch` 추가** — 이게 없으면 이 행의 `w-full`이 실제 40% 폭 대신 부모의 content-fit 폭을 기준으로 계산돼 원정/홈 그룹이 가운데로 뭉쳐 보이는 문제가 있었음(스크린샷으로 확인 후 수정).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리고 wrapper의 `self-stretch`도 제거하면 됨.

---

## 2026-08-05 — 점보트론 BONUS 배지 축소 + BONUS일 때 파울 카운트 숨김

**배경**: "점보트론의 BONUS 폰트 사이즈를 text-base로 줄이고, BONUS 칩이 뜨면 파울 카운트 텍스트는 숨겨줘야해." 기존엔 파울 5개 이상(BONUS)일 때도 "파울 5"와 "BONUS" 배지가 동시에 표시되고 있었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼, 파울/보너스 행)

**Before**: `{awayFouls >= 5 && <BONUS(text-xl)/>}` + `<span>파울 {awayFouls}</span>`(항상 표시, BONUS와 별개)
**After**: `awayFouls >= 5 ? <BONUS(text-base)/> : <span>파울 {awayFouls}</span>`(양자택일)

- BONUS 배지 폰트 `text-xl` → `text-base`로 축소.
- BONUS 조건을 `&&`(추가 노출)에서 삼항연산자(양자택일)로 바꿔, BONUS일 때 "파울 N" 텍스트가 안 보이게 함(원정/홈 동일 적용).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: 삼항연산자를 `&&` 두 개로 분리하고 BONUS `text-base`→`text-xl`로 되돌리면 됨.

---

## 2026-08-05 — 경기 시작 전 점보트론 카운트다운 문구/폰트 정리

**배경**: "시작까지 00:00 -> 00:00 으로 바꾸고 텍스트 사이즈를 2xl로 변경, 시계 아이콘은 삭제" 이후 "남은시간 타이머 폰트를 점보트론 게임클락에 적용되는 폰트를 그대로 적용해줘"로 추가 조정.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼, `isScheduled` 분기)

**Before**:
```tsx
<Clock size={20} className="text-indigo-400" />
<span className="text-sm font-black text-white ko-tight">{...} 시작 예정</span>
{scheduledRemainingMs != null && (
    <span className="text-xs font-mono tabular-nums text-slate-400">
        시작까지 {fmtCountdown(scheduledRemainingMs)}
    </span>
)}
```

**After**:
```tsx
<span className="text-sm font-black text-white ko-tight">{...} 시작 예정</span>
{scheduledRemainingMs != null && (
    // 라이브 게임클락과 동일한 폰트 스타일 적용
    <span className="text-3xl font-black tabular-nums text-slate-300 leading-none">
        {fmtCountdown(scheduledRemainingMs)}
    </span>
)}
```
- 시계 아이콘(`<Clock size={20} .../>`) 삭제.
- "시작까지 {카운트다운}" → "{카운트다운}"만 표시(접두 텍스트 삭제).
- 폰트를 라이브 게임클락(`currentTimeRemaining` 표시, `text-3xl font-black tabular-nums text-slate-300 leading-none`)과 완전히 동일하게 맞춤 — 처음엔 `text-2xl font-mono`로 바꿨다가, 게임클락과 동일 폰트를 요청받아 최종적으로 게임클락 클래스 그대로 적용(중간 2xl 지시는 이 요청으로 대체됨).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨(Clock import는 다른 곳(PBP 흐름 이벤트 아이콘)에서도 쓰이므로 그대로 유지해도 됨).

---

## 2026-08-05 — 점수 헤더 텍스트 제거 + 점수/시간 열 너비 고정(tabular-nums)

**배경**: "점수 컬럼 헤더의 '점수' 텍스트는 삭제하고 빈 공간으로 남겨줘. 그리고 점수와 시간의 텍스트 너비에 따라 컬럼의 너비가 변하지 않도록 해야해." 숫자 폰트가 기본적으로 자릿수별 폭이 살짝 달라서(가변폭), 점수가 갱신되거나 시간이 바뀔 때마다 컬럼 폭이 미세하게 흔들리는 문제.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (라이브 PBP 피드 헤더 행 + `centerCols`)

**Before**:
```tsx
<div className="w-8 ...">점수</div>   {/* 헤더 */}
...
<div className="w-8 text-center pt-0.5">
    <span className="text-xs font-black tracking-tight ...">{log.awayScore}</span>
</div>
<div className="w-16 text-slate-500 font-bold text-xs text-center pt-0.5">
    {log.quarter}Q {log.timeRemaining || '-'}
</div>
```

**After**:
```tsx
<div className="w-8 ..."></div>   {/* 헤더 — 텍스트 삭제, 빈 칸 */}
...
<div className="w-8 text-center pt-0.5 overflow-hidden">
    <span className="text-xs font-black tracking-tight tabular-nums ...">{log.awayScore}</span>
</div>
<div className="w-16 text-slate-500 font-bold text-xs text-center tabular-nums pt-0.5 overflow-hidden">
    {log.quarter}Q {log.timeRemaining || '-'}
</div>
```
- 점수 헤더 2곳 모두 "점수" 텍스트 제거, 빈 `<div>`로 자리만 유지.
- 점수 `<span>`과 Q+시간 `<div>`에 `tabular-nums`(폰트의 모든 숫자를 동일 폭 고정폭 글리프로 렌더) 추가 — 자릿수 조합이 바뀌어도 텍스트 자체의 렌더 폭이 흔들리지 않음.
- `overflow-hidden` 추가로 혹시 텍스트가 지정 폭(`w-8`/`w-16`)을 넘더라도 열 자체의 폭은 항상 고정값 그대로 유지(내용이 넘치면 잘리되 컬럼 경계는 안 밀림).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: 헤더에 "점수" 텍스트 복원, `tabular-nums`/`overflow-hidden` 클래스 제거.

---

## 2026-08-05 — 라이브 PBP 피드 Q/시간 열 통합 + 헤더 라벨을 팀 이름으로 변경

**배경**: "Q와 시간 컬럼은 하나로 통일해줘. 그리고 원정 기록, 홈 기록 컬럼의 이름을 팀 이름으로 표시해줘."

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (라이브 PBP 피드 헤더 행 + `centerCols`)

**Before**:
```tsx
// 헤더
<div className="flex-1 text-right ...">원정 기록</div>
<div className="w-8 ...">점수</div>
<div className="w-5 ...">Q</div>
<div className="w-10 ...">시간</div>
<div className="w-8 ...">점수</div>
<div className="flex-1 ...">홈 기록</div>

// centerCols
<div className="w-5 ...">{log.quarter}Q</div>
<div className="w-10 ...">{log.timeRemaining || '-'}</div>
```

**After**:
```tsx
// 헤더 — 팀 이름 표시(길면 잘림 방지 truncate)
<div className="flex-1 text-right ... truncate">{awayName}</div>
<div className="w-8 ...">점수</div>
<div className="w-16 ...">시간</div>
<div className="w-8 ...">점수</div>
<div className="flex-1 ... truncate">{homeName}</div>

// centerCols — Q+시간 한 칸으로 통합
<div className="w-16 ...">{log.quarter}Q {log.timeRemaining || '-'}</div>
```
- Q/시간 두 열(`w-5`+`w-10`)을 하나(`w-16`)로 합쳐 "1Q 10:45"처럼 한 칸에 표시.
- 헤더의 "원정 기록"/"홈 기록" 고정 라벨을 `awayName`/`homeName`(팀 전체 이름)으로 교체, 긴 팀명이 레이아웃을 밀지 않도록 `truncate` 추가.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨.

---

## 2026-08-05 — 라이브 PBP 피드 열 구조를 좌우 대칭(원정 기록↔홈 기록)으로 재편

**배경**: "PBP 코멘터리 구조를 바꾸고 싶음. [쿼터][시간][팀][점수][팀][코멘터리] → [원정 코멘터리][원정 점수][쿼터][시간][홈 점수][홈 코멘터리]로 변경." 적용 범위는 AskUserQuestion으로 확인해 라이브 화면 중앙 컬럼의 PBP 피드(`MultiGamePbpView.tsx`에 직접 구현, 멀티플레이어 전용)로 한정 — 결과화면 "경기 기록" 탭이 쓰는 공용 컴포넌트 `GamePbpTab.tsx`(싱글플레이어와 공유)는 건드리지 않음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (라이브 PBP 피드 헤더 행 + 로그 행 렌더링, 일반 이벤트/교체 이벤트 둘 다)

**Before**: `[Q][시간][원정 약어][점수(원정:홈 결합)][홈 약어][코멘터리 1열]` — 팀 약어만 좌우에 표시, 코멘터리는 항상 오른쪽 단일 열.

**After**: `[원정 코멘터리][원정 점수][Q][시간][홈 점수][홈 코멘터리]` — 6열 좌우 대칭 구조.
```tsx
// 헤더
<div className="flex-1 text-right ...">원정 기록</div>
<div className="w-8 ...">점수</div>
<div className="w-5 ...">Q</div>
<div className="w-10 ...">시간</div>
<div className="w-8 ...">점수</div>
<div className="flex-1 ...">홈 기록</div>

// 각 로그 행 — isHome에 따라 좌/우 코멘터리 열 중 한쪽만 채우고 반대쪽은 빈 문자열
<div className="flex-1 min-w-0 text-right ...">{!isHome ? log.text : ''}</div>
{/* centerCols: 원정 점수 / Q / 시간 / 홈 점수 — 일반 로그와 교체 로그가 공유 */}
<div className="flex-1 min-w-0 ...">{isHome ? log.text : ''}</div>
```
- 원정 쪽 코멘터리 열은 `text-right`로 정렬해 중앙 컬럼 쪽으로 글이 모이도록 하고, 홈 쪽은 기존처럼 왼쪽 정렬 — 좌우가 중앙 기준 거울 대칭으로 읽힘.
- 점수 2개(원정/홈)는 기존처럼 "48:35" 결합 표기가 아니라 각자의 팀 쪽(원정 쪽 컬럼엔 원정 점수, 홈 쪽 컬럼엔 홈 점수)에 개별 배치.
- 교체(IN/OUT) 로그도 동일 구조로 맞춤 — 원정팀 교체면 왼쪽 열에 "이름 IN"/"이름 OUT"을 오른쪽 정렬로, 홈팀 교체면 오른쪽 열에 기존 순서(IN 이름/OUT 이름)로 표시. 가운데 4열(원정점수/Q/시간/홈점수)은 일반 로그와 교체 로그가 `centerCols` 변수로 공유.
- 흐름 이벤트(SYSTEM, 쿼터 시작/종료 등)는 팀 소속이 없어 좌우 대칭 구조에 안 맞으므로 기존처럼 전체 폭 중앙 정렬 pill 그대로 유지.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 구조(팀 약어 2열 + 결합 점수 1열 + 코멘터리 1열)로 되돌리면 됨.

---

## 2026-08-05 — 자유투 실패 리바운드 커멘터리 전용 문구로 고도화(공격팀/슈터본인/수비팀 3갈래)

**배경**: "자유투 실패 시 리바운드 케이스의 코멘터리를 고도화하자. 1.공격팀이 리바운드 잡는 경우 2.자유투 슈터가 리바운드 잡는 경우 3.수비자가 리바운드 잡는 경우." 기존엔 자유투 리바운드도 필드골 리바운드용 공용 함수 `getReboundCommentary()`를 그대로 재사용하고 있었는데, 이 함수는 zone(골밑/3점 롱리바운드 등) 기반 문구라 "자유투는 항상 자유투 라인에서 놓친다"는 맥락과 안 맞았다(예: "3점 미스가 길게 튀자"는 자유투에서 나올 수 없는 문구). 3갈래(공격팀 동료/슈터 본인/수비팀) 구분 자체는 `getReboundCommentary()`에도 이미 있었지만(off일 때 슈터 본인 여부 분기), 문구 내용이 필드골 전용이라 자유투 맥락에 어색했음.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client) — `getFreeThrowReboundCommentary()` 신규 함수 추가
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러) — 동일 함수 추가
- `services/game/engine/pbp/statsMappers.ts` (client) — `handleFreeThrowRebound()`가 새 함수 사용하도록 교체
- `server/src/shared/engine/pbp/statsMappers.ts` (server 미러) — 동일 교체

**After** (신규 함수, client 기준):
```ts
export function getFreeThrowReboundCommentary(
    rebounder: LivePlayer,
    type: 'off' | 'def',
    shooter: LivePlayer
): string {
    if (type === 'off') {
        if (rebounder.playerId === shooter.playerId) {
            // 2. 자유투 슈터 본인이 리바운드
            return pick([
                `${rebounder.playerName}, 자기 자유투 미스를 직접 쫓아가 잡아냅니다!`,
                `${rebounder.playerName}, 놓친 자유투를 스스로 리바운드로 되찾습니다.`,
                `${rebounder.playerName}, 아쉬운 자유투를 만회하듯 직접 공격 리바운드를 챙깁니다.`
            ]);
        }
        // 1. 공격팀(동료)이 리바운드
        return pick([
            `${rebounder.playerName}, 자유투 라인 근처에서 공격 리바운드를 낚아챕니다!`,
            `${rebounder.playerName}, 놓친 자유투를 그대로 공격 리바운드로 연결합니다.`,
            `${rebounder.playerName}, 자유투 미스를 틈타 공격권을 지켜냅니다!`,
            `${rebounder.playerName}, 몸싸움 끝에 자유투 리바운드를 걷어냅니다.`
        ]);
    }
    // 3. 수비팀이 리바운드
    return pick([
        `${rebounder.playerName}, 자유투 리바운드를 안정적으로 걷어냅니다.`,
        `${rebounder.playerName}, 놓친 자유투를 깔끔하게 수비 리바운드로 마무리합니다.`,
        `${rebounder.playerName}, 자유투 미스 리바운드를 잡아내며 공수 전환을 준비합니다.`,
        `${rebounder.playerName}, 박스아웃 후 자유투 리바운드 확보.`
    ]);
}
```
```ts
// statsMappers.ts의 handleFreeThrowRebound() 내부
const rebText = getFreeThrowReboundCommentary(rebPlayer, rebType, shooter);  // was: getReboundCommentary(rebPlayer, rebType, shooter)
```
- 기존 `getReboundCommentary()`는 필드골 미스 리바운드(line 286 client/189 server, zone 인자 포함)에서는 그대로 유지 — 자유투 전용 케이스만 분리.
- `getFreeThrowReboundCommentary`는 `zone` 인자 자체가 없음(자유투는 항상 같은 지점이라 불필요) — `shooter`도 옵셔널이 아닌 필수(자유투는 항상 슈터가 명확해서 optional로 둘 이유가 없었음).

**검증**: client — `npx vite build` clean, `npx tsc --noEmit -p tscheck.json`에서 statsMappers.ts/textGenerator.ts 오류 없음. server — `server/tsconfig.json` 기준 `tsc --noEmit`에서 두 파일 관련 오류 없음.

**롤백 방법**: `handleFreeThrowRebound()`의 `getFreeThrowReboundCommentary` 호출을 `getReboundCommentary`로 되돌리고, import 추가분과 신규 함수 정의(client/server 양쪽 textGenerator.ts) 삭제.

---

## 2026-08-05 — PBP 자유투-리바운드 순서 뒤바뀜 수정(자유투 로그+리바운드 텍스트 한 줄로 통합)

**배경**: "자유투 실패 → 리바운드로 나와야 하는데, 리바운드 → 자유투 실패로 나온다"는 리포트. 조사 결과 자유투 미스 후 리바운드가 발생하는 3개 케이스(슈팅파울 자유투/팀파울 보너스 자유투/앤드원 실패) 전부 같은 헬퍼 함수 버그로 순서가 뒤집혀 있었음. 사용자가 "별도 로그 두 줄로 순서만 맞추는 대신, 자유투 커멘터리 뒤에 누가 리바운드했는지 한 번에 이어붙일 수 없냐"고 제안 → 그 방식으로 구현(로그 자체를 하나로 합쳐서 순서 문제가 구조적으로 재발 불가능하게 함).

**원인**: `handleFreeThrowRebound()` 헬퍼가 리바운드를 처리하면서 동시에 `addLog()`로 리바운드 로그를 그 자리에서 바로 찍어버렸는데, 이 헬퍼를 호출하는 쪽은 정작 자기 자유투 결과 로그를 그보다 나중에 찍었음 — `state.logs`는 push한 순서 그대로 출력되고 별도 정렬이 없어서, 항상 리바운드 로그가 먼저 나가고 자유투 로그가 뒤에 붙었음.

**변경 파일**:
- `services/game/engine/pbp/statsMappers.ts` (client)
- `server/src/shared/engine/pbp/statsMappers.ts` (server 미러)

**Before** (client, 3곳 공통 패턴 — 팀파울 보너스 자유투 예시):
```ts
const handleFreeThrowRebound = (shooter: LivePlayer): 'off' | 'def' => {
    const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
    rebPlayer.reb += 1;
    if (rebType === 'off') rebPlayer.offReb += 1; else rebPlayer.defReb += 1;
    const rebText = getReboundCommentary(rebPlayer, rebType, shooter);
    addLog(state, rebPlayer.playerId, rebText, 'info');   // 리바운드 로그가 여기서 먼저 찍힘
    return rebType;
};
...
let ftEndsPossession = true;
if (!lastShotMade) {
    const rebType = handleFreeThrowRebound(actor);   // ← 이 시점에 리바운드 로그 이미 push됨
    ftEndsPossession = rebType !== 'off';
}
addLog(state, offTeam.id, `${actor.playerName}, 팀 파울로 얻은 자유투 ${ftMade}/${numShots} 성공`, 'freethrow', ...);  // 자유투 로그는 나중에 push
```

**After** (client):
```ts
// 로그를 안 찍고 결과(type/text)만 반환
const handleFreeThrowRebound = (shooter: LivePlayer): { type: 'off' | 'def'; text: string } => {
    const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
    rebPlayer.reb += 1;
    if (rebType === 'off') rebPlayer.offReb += 1; else rebPlayer.defReb += 1;
    const rebText = getReboundCommentary(rebPlayer, rebType, shooter);
    return { type: rebType, text: rebText };
};
...
let ftEndsPossession = true;
let ftLogText = `${actor.playerName}, 팀 파울로 얻은 자유투 ${ftMade}/${numShots} 성공`;
if (!lastShotMade) {
    const reb = handleFreeThrowRebound(actor);
    ftEndsPossession = reb.type !== 'off';
    ftLogText += ` ${reb.text}`;   // 리바운드 텍스트를 자유투 로그 문장 뒤에 이어붙임
}
addLog(state, offTeam.id, ftLogText, 'freethrow', ...);   // 로그 한 줄로 push — 순서 문제 자체가 발생 불가
```
- 3개 호출부(슈팅파울 자유투/팀파울 보너스 자유투/앤드원 실패) 전부 동일한 방식으로 수정 — 각자 `logText`/`ftLogText`에 리바운드 텍스트를 조건부로 이어붙인 뒤 단 한 번만 `addLog` 호출.
- 두 로그를 순서만 바꿔서 따로 찍는 대신 애초에 한 줄로 합쳐서, "헬퍼가 먼저 로그를 찍어버리는" 구조적 위험 자체를 제거.
- server 미러도 동일 로직으로 수정(포맷은 서버 파일의 기존 압축 스타일 유지).

**검증**: client — `npx vite build` clean, `npx tsc --noEmit -p tscheck.json`에서 statsMappers.ts 오류 없음. server — `npx tsc --noEmit -p tsconfig.json`(server 디렉토리)에서 statsMappers.ts 관련 오류 없음(출력된 오류는 전부 이 파일과 무관한 기존 이슈: Bun 타입 정의 누락, 다른 파일의 Supabase 제네릭 불일치).

**롤백 방법**: client/server 양쪽 모두 `handleFreeThrowRebound`가 `addLog`를 직접 호출하고 `rebType`만 반환하는 형태로 되돌리고, 3개 호출부의 `ftLogText`/`logText` 이어붙이기를 제거하면 됨(단, 순서 버그 재발).

---

## 2026-08-05 — 경기 전환 시 이전 경기의 gameData(샷차트/PBP/인사이트)가 남아있는 버그 수정

**배경**: "진행중인 경기를 보다가 시작 전 경기를 눌러서 넘어가면, 박스스코어와 중앙 점보트론 영역을 제외한 나머지 영역에 이전에 보던 경기들의 데이터가 가득차있어." 스크린샷에서 시작 전 경기 화면인데도 샷차트 도트, PBP 로그, 승률 그래프가 직전에 보던 경기 그대로 남아있는 게 확인됨.

**원인**: `MultiGamePbpView`는 URL의 `:gameId`만 바뀔 뿐 라우트 컴포넌트 자체는 리마운트되지 않는다(React Router가 같은 컴포넌트 인스턴스를 재사용) — 그래서 `gameData` state가 경기를 이동해도 그대로 유지된다. scheduled 상태로 넘어가면 경기 상세 조회 effect는 애초에 `game_pbp`를 조회하지 않고(`if (displayState === 'scheduled') { setIsLoading(false); return; }`) 곧장 종료해버려서 `gameData`를 비울 기회가 전혀 없었다 — 결과적으로 `visibleEvents`/`visibleShotEvents`/`filteredLogs` 등 `gameData` 파생 값 전부가 직전 경기 데이터를 계속 참조하고 있었음. (박스스코어와 점보트론만 멀쩡했던 이유: 그 둘은 최근 수정으로 `homeTeamId`/`awayTeamId`/로스터 기반 값을 쓰도록 이미 분리돼 있어서 우연히 gameData 잔존값의 영향을 안 받았음.)

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (신규 리셋 `useEffect`, `gameData`/`error` state 선언부 바로 아래)

**After** (신규 추가):
```tsx
// resolvedGameId가 바뀌는 즉시(=다른 경기로 이동) gameData/error를 명시적으로 비운다.
useEffect(() => {
    setGameData(null);
    setError(null);
}, [resolvedGameId]);
```
- 경기 상세 조회 effect보다 먼저 선언해 같은 커밋에서 먼저 실행되도록 배치 — `resolvedGameId`가 바뀌면 이 effect가 즉시 `gameData`를 비우고, 그 다음 경기 상세 조회 effect가 (scheduled면 fetch 없이 유지, live/final이면 새로 fetch해서) 올바른 값으로 채운다.
- 전환 도중 아주 짧게 "경기 데이터를 준비하는 중입니다" 메시지가 스칠 수 있는데(scheduledAt이 새 값으로 확정되기 전까지 한 틱), 직전 경기의 실데이터가 계속 남아있던 것보다 훨씬 안전한 상태.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: 새로 추가한 `useEffect(() => { setGameData(null); setError(null); }, [resolvedGameId]);` 블록 삭제.

---

## 2026-08-05 — 경기 시작 전 박스스코어, "중계 종료 후 공개" 안내 대신 실제 로스터+스탯 0 표시

**배경**: "박스스코어도 중계 종료 후 공개된다는 것 대신 원래 박스스코어 그대로 보여줘. 스탯이 전부 0인 상태면 됨." scheduled(경기 시작 전) 상태에서 LEFT/RIGHT 박스스코어 패널이 `BoxScorePlaceholder`("박스스코어는 중계 종료 후 공개됩니다")를 보여주고 있었는데, 이 문구는 원래 라이브 중 스포일러 방지용이라 경기가 아예 시작 전인 상황엔 맞지 않음. `league_teams.roster`(팀에 이미 확정된 선수 ID 배열)는 경기 시작 전에도 존재하므로, 그 로스터로 스탯 전부 0인 박스스코어를 구성해 보여주기로 함.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (신규 로스터 조회 effect + 제로스탯 박스 빌더, LEFT/RIGHT 박스스코어 패널 분기)

**After** (신규 추가):
```tsx
const [scheduledRosterCache, setScheduledRosterCache] = useState<Record<string, { name: string; position: string }>>({});
useEffect(() => {
    if (displayState !== 'scheduled') return;
    const ids = [...(homeTeam?.roster ?? []), ...(awayTeam?.roster ?? [])];
    if (ids.length === 0) return;
    (async () => {
        const { data } = await supabase.from('meta_players').select('id, name, position').in('id', ids);
        // ...map id → {name, position}, setScheduledRosterCache
    })();
}, [displayState, homeTeam?.roster, awayTeam?.roster]);

const buildZeroStatBox = (roster: string[] | undefined): PlayerBoxScore[] =>
    (roster ?? []).map(id => ({
        playerId: id,
        playerName: scheduledRosterCache[id]?.name ?? id,
        position: scheduledRosterCache[id]?.position ?? '',
        pts: 0, reb: 0, /* ... PlayerBoxScore의 모든 스탯 필드 0 */ condition: 100,
    }));
const scheduledHomeBox = useMemo(() => buildZeroStatBox(homeTeam?.roster), [homeTeam?.roster, scheduledRosterCache]);
const scheduledAwayBox = useMemo(() => buildZeroStatBox(awayTeam?.roster), [awayTeam?.roster, scheduledRosterCache]);
```
```tsx
// LEFT/RIGHT 패널 — hasBoxTimeline 다음에 isScheduled 분기 추가
) : isScheduled ? (
    <PlayerBoxPanel players={scheduledAwayBox} label={awayAbbr} />
) : (
    <BoxScorePlaceholder label={awayAbbr} />
)}
```
- `views/multi/season/MultiRosterView.tsx`의 기존 로스터 조회 패턴(`league_teams.roster` id 배열 → `meta_players` 조회)을 참고해 동일하게 구현, 다만 여기선 OVR 계산용 `mapRawPlayerToRuntimePlayer` 풀매핑 대신 `name`/`position`만 가볍게 조회(박스스코어 표시엔 그것만 필요).
- `BoxScorePlaceholder`는 라이브 중(스포일러 방지) 용도로 그대로 유지 — scheduled 케이스만 분리해서 실제 로스터로 대체.
- `TeamStatsCompare`(팀 합산 스탯 비교)는 건드리지 않음 — `liveHomeBox`/`liveAwayBox`가 scheduled에선 이미 빈 배열이라 합산 결과가 어차피 전부 0으로 동일하게 나옴.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `isScheduled ?` 분기 제거, `scheduledRosterCache`/`buildZeroStatBox`/관련 effect 삭제.

---

## 2026-08-05 — 경기 시작 전 화면에도 바디 3열 레이아웃 전체 노출(빈 상태로)

**배경**: "경기 시작 전 화면에서도 바디의 모든 섹션들은 다 보이도록 해줘." 기존엔 scheduled 상태일 때 본문을 안내 문구 한 줄로만 채웠는데(원인: 라이브 3열 레이아웃 안에 `gameData.xxx` 직접 참조가 많아 `gameData`가 `null`이면 그대로 크래시), 이제는 그 참조들을 전부 안전하게 바꿔서 scheduled에서도 동일한 3열 레이아웃(좌: 원정 박스+인사이트그래프, 중: 샷차트+PBP, 우: 홈 박스+쿼터테이블+팀스탯)이 뜨고 각 패널은 데이터가 없어 자연스럽게 빈 상태로 보이게 함.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (라이브 3열 바디 블록 전체, `gameData` 참조 다수)

**주요 변경**:
```tsx
// Before: scheduled 전용 안내 문구 블록 + 라이브 바디는 isLive에서만
{isScheduled && (<div>...안내 문구...</div>)}
{isLive && (<div className="flex flex-1 overflow-hidden">{/* 3열 레이아웃, gameData.xxx 직접 참조 다수 */}</div>)}

// After: 라이브 바디를 scheduled에서도 렌더, 내부 gameData 참조 전부 안전화
{(isLive || isScheduled) && (<div className="flex flex-1 overflow-hidden">{/* 동일 3열 레이아웃 */}</div>)}
```
- `gameData.home_team_id`/`gameData.away_team_id` → 이미 schedule 폴백을 갖고 있는 컴포넌트 레벨 변수 `(homeTeamId ?? '')`/`(awayTeamId ?? '')`로 전부 교체(10곳).
- `gameData.home_box`/`away_box`/`box_timeline`/`events`/`shot_events` → 전부 `gameData?.` 옵셔널 체이닝으로 교체(약 20곳, `strict:false`라 TS는 안 잡아주지만 런타임 크래시 위험은 실재).
- PBP 피드 빈 상태 문구를 `isLive ? '경기 시작 대기 중…' : '해당 쿼터의 기록이 없습니다.'` → `isLive || isScheduled ? '경기 시작 대기 중…' : ...`로 확장.
- `hasBoxTimeline`/`onCourtIds`/`homeStats`/`awayStats`/`visibleShotEvents` 등은 이미 `if (!gameData) return ...` 가드가 있는 `useMemo`라 별도 수정 없이 그대로 안전하게 빈 값 반환 — LEFT/RIGHT는 자동으로 `BoxScorePlaceholder`, CENTER 샷차트는 빈 코트, PBP는 "경기 시작 대기 중…"으로 표시됨.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `(isLive || isScheduled)` → `isLive`로 되돌리고 scheduled 안내 문구 블록 복원(단, `gameData?.`/`homeTeamId` 안전화 자체는 되돌릴 필요 없음 — 부작용 없는 방어 코드).

---

## 2026-08-05 — 경기 리스트 자동 스크롤이 매초 원위치로 되돌아가는 버그 수정

**배경**: 직전 자동 스크롤 기능 적용 후 "포커스 되도록 수정하고 나니 스크롤해도 다시 원래 위치로 돌아가" 재현.

**원인**: 자동 스크롤 effect가 `activeGroup`(객체)을 의존성으로 썼는데, `activeGroup`은 `groupedByDay[activeIdx]`이고 `groupedByDay`는 `allGames`에서, `allGames`는 `revealedSeriesById`에서 파생된다. `revealedSeriesById`(`useMemo`)의 의존성에 `serverNow`(1초마다 틱하는 서버 보정 시각)가 포함돼 있어서, 이 체인 전체가 **매초 새 객체 참조로 재계산**되고 있었다 — 결과적으로 `activeGroup`도 매초 새 참조가 되어 자동 스크롤 effect가 1초마다 재실행되며 `scrollIntoView`를 계속 다시 호출, 사용자가 수동으로 스크롤해도 1초 안에 원위치로 스냅되고 있었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`GameDateStrip`의 자동 스크롤 `useEffect`)

**Before**: `}, [activeGroup, currentGameId]);`
**After**: `}, [activeDateKey, currentGameId]);`

- `activeGroup`(매초 재계산되는 객체) 대신 `activeDateKey`(원시 문자열, 실제 날짜가 바뀔 때만 변경)를 의존성으로 사용 — 날짜 전환/경기 전환처럼 진짜 다시 스크롤해야 하는 시점에만 effect가 실행되고, `serverNow` 틱에 의한 불필요한 재실행이 사라짐.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `[activeDateKey, currentGameId]` → `[activeGroup, currentGameId]`로 되돌리면 됨(단, 버그 재발).

---

## 2026-08-05 — 라이브/기록 화면 진입 시 상단 경기 리스트가 현재 경기로 자동 스크롤

**배경**: "경기 라이브 / 기록 화면에 들어가면 상단의 경기 리스트에서 현재 선택한 경기로 포커스되도록 해줘." 날짜는 이미 진입 시 현재 경기의 날짜로 자동 선택되지만(`selectedDateKey` 초기화 effect), 그 날짜에 경기가 많으면 현재 보고 있는 카드가 가로 스크롤 영역 밖에 있을 수 있어 수동으로 스크롤해서 찾아야 했음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`GameDateStrip` 컴포넌트)

**After** (신규 추가):
```tsx
const currentCardRef = useRef<HTMLButtonElement>(null);
useEffect(() => {
    currentCardRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}, [activeGroup, currentGameId]);
```
```tsx
<button
    key={g.id}
    ref={isCurrent ? currentCardRef : undefined}
    ...
>
```
- 현재 경기 카드에만 조건부로 ref를 달고, `activeGroup`(날짜 자동 선택 완료 시점 포함) 또는 `currentGameId`가 바뀔 때마다 `scrollIntoView`로 가로 스크롤 컨테이너 안에서 가운데로 부드럽게 스크롤.
- `block: 'nearest'`로 세로 방향(페이지 전체) 스크롤에는 영향 없도록 제한, `inline: 'center'`로만 가로 스크롤 컨테이너(`gameStripRef`)가 움직임.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `currentCardRef` 선언/effect, 버튼의 조건부 `ref` 삭제.

---

## 2026-08-04 — 헤더 점수 레터스페이싱 tracking-tighter 적용

**배경**: 헤더 어웨이/홈 점수 폰트 크기(60px)/레터스페이싱(기본값) 조사 후 "tighter를 적용해봐" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 어웨이/홈 점수 `<span>` 2곳)

**Before**: `text-6xl font-black tabular-nums leading-none shrink-0`
**After**: `text-6xl font-black tabular-nums leading-none tracking-tighter shrink-0`

- `tracking-tighter`(-0.05em, 60px 기준 약 -3px) 추가.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `tracking-tighter` 클래스 제거.

---

## 2026-08-04 — 샷차트 툴팁 위치 계산 커서-중심 클램프 방식으로 재설계(v3)

**배경**: v2(우측 경계 클램프) 적용 후 "이제는 툴팁이 가운데에 뜨는데?" 재현.

**진짜 문제**: v2는 `left = mouseX + offsetX`가 넘치면 `left = containerWidth - 8 - tooltipW`(고정값)로 클램프했는데, 코트 컨테이너가 툴팁 폭(240px)에 비해 좁으면(라이브 뷰 중앙 컬럼 등 400~700px대) 이 클램프가 적용되는 "우측 넓은 구간" 자체가 코트 폭의 상당 부분을 차지한다. 그 구간 안에서는 mouseX가 어디든 항상 같은 고정 좌표로 스냅되어 — 커서를 따라가지 않고 화면 중앙 부근 한 자리에 툴팁이 "박혀있는" 것처럼 보였음. v1/v2 둘 다 "커서 오른쪽에 오프셋 배치 후, 넘치면 다른 기준점으로 이동"이라는 같은 패턴이었고, 그 자체가 넓은 데드존을 만드는 근본 원인이었다.

**변경 파일**:
- `components/game/ShotTooltip.tsx` (위치 계산 로직)

**Before (v2)**:
```tsx
let left = mouseX + offsetX;
if (left + tooltipW > containerWidth - 8) {
    left = containerWidth - 8 - tooltipW;  // 고정 좌표로 스냅 — 이 구간 안에서는 mouseX 변화가 반영 안 됨
}
```

**After (v3)**:
```tsx
// 커서를 수평 중심으로 두고, 그 중심을 컨테이너 안쪽으로만 클램프
let left = mouseX - tooltipW / 2;
if (left < 4) left = 4;
if (left + tooltipW > containerWidth - 4) left = containerWidth - 4 - tooltipW;
```
- "오프셋 배치 후 넘치면 다른 기준점으로 점프"를 완전히 버리고, "커서를 중심으로 두고 컨테이너 안에만 있도록 최소한으로 밀어내기"로 재설계 — 클램프가 걸려도 툴팁 중심이 `mouseX`를 계속 따라 움직이므로 "고정된 자리에 박혀있다"는 느낌이 없다(클램프 구간에서도 최소 절반은 여전히 mouseX에 비례해서 움직임).
- 세로(top)는 "아래 오프셋, 넘치면 위로 반전"은 유지(세로 방향은 이런 데드존 이슈가 보고되지 않았음).
- 이제 안 쓰이는 `offsetX` 상수 삭제.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — ShotTooltip.tsx 오류 없음.

**롤백 방법**: Before(v2) 블록으로 되돌리면 됨.

---

## 2026-08-04 — 샷차트 툴팁 우측 경계 "반대편 점프" → "경계 클램프"로 변경(v2, 여전히 멀다는 재현)

**배경**: 직전 수정(컨테이너 크기 측정 방식 통일) 후에도 "아직도 툴팁이 너무 왼쪽에 나오는데?" 재현. 재검토 결과 v1은 "컨테이너 크기를 정확히 잰다"는 문제만 고쳤을 뿐, 위치 계산 알고리즘 자체의 설계 문제는 그대로였음.

**진짜 문제**: 오른쪽 경계를 넘으면 툴팁을 커서 반대편(왼쪽)으로 완전히 점프시키는 방식(`left = mouseX - tooltipW - offsetX`)이었음 — 이 경우 커서와 툴팁 사이 간격이 항상 `tooltipW + offsetX*2`(폭 240px 기준 최소 264px)만큼 크게 벌어진다. 컨테이너 폭이 아주 넓지 않은 이상(예: 라이브 뷰의 좁은 중앙 컬럼) 이 264px 점프가 매우 두드러져 "너무 멀다"고 느껴짐 — v1이 고친 건 이 점프의 트리거 조건(컨테이너 크기 오판)이었지, 점프 자체의 폭은 그대로였다.

**변경 파일**:
- `components/game/ShotTooltip.tsx` (위치 계산 로직)

**Before**:
```tsx
let left = mouseX + offsetX;
if (left + tooltipW > containerWidth - 8) {
    left = mouseX - tooltipW - offsetX;  // 커서 반대편으로 완전 점프
}
```

**After**:
```tsx
let left = mouseX + offsetX;
if (left + tooltipW > containerWidth - 8) {
    left = containerWidth - 8 - tooltipW;  // 컨테이너 우측 경계에 딱 붙이기(클램프)
}
```
- "커서 반대편으로 점프" 대신 "컨테이너 오른쪽 경계에 클램프"로 변경 — 커서가 경계에 아주 가까우면 툴팁이 커서를 살짝 덮을 수 있지만(비고정 상태는 `pointer-events-none`이라 호버 추적엔 지장 없음), 항상 반대편 점프보다 커서에 훨씬 가깝게 유지됨.
- 세로(top/bottom) 클램프도 동일한 방식으로 통일(기존엔 세로만 이미 이런 이슈가 없었지만 일관성을 위해 함께 정리).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — ShotTooltip.tsx 오류 없음.

**롤백 방법**: `left = containerWidth - 8 - tooltipW;` → `left = mouseX - tooltipW - offsetX;`로 되돌리면 됨.

---

## 2026-08-04 — 샷차트 툴팁, 우측 코트 호버 시 위치 어긋나는 버그 수정(공용 훅 리팩터)

**배경**: "인게임에서 우측 코트의 샷 도트에 호버 시 툴팁이 왼쪽으로 너무 멀리 표시되는 증상이 있어."

**원인**: 샷차트 툴팁을 쓰는 모든 화면이 컨테이너 크기를 `ResizeObserver` 기반 별도 React state(`containerSize`)로 추적해서 `ShotTooltip`에 prop으로 넘기고 있었다. 이 state는 리사이즈 콜백이 실제로 발동해야만 갱신되므로, 마운트 직후처럼 아직 콜백이 한 번도 안 돈 시점엔 하드코딩된 기본값(`{w:940,h:500}` 또는 `{w:0,h:0}`)을 그대로 쓰게 된다. 반면 툴팁의 실제 `mouseX`/`mouseY`는 매 호버마다 `getBoundingClientRect()`로 항상 정확하게 계산됨 — 이 둘(정확한 mouseX vs 부정확할 수 있는 containerWidth)을 섞어서 "우측 근접 시 좌측으로 뒤집기" 판정을 하다 보니, 실제로는 충분히 넓은 컨테이너인데도 낡은/작은 기본값 기준으로 판정해 툴팁이 엉뚱하게 멀리 뒤집혀 표시됐다.

**변경 파일**:
- `hooks/useShotChartTooltip.ts` (공용 훅 — `TooltipState`에 `containerWidth`/`containerHeight` 추가, `findNearest`/`handleMouseMove`/`handleClick`에서 함께 캡처)
- `components/game/ShotTooltip.tsx` (공용 컴포넌트 — `containerWidth`/`containerHeight` props 제거, `tooltip` state에서 직접 사용)
- 이 훅/컴포넌트를 쓰는 4개 화면에서 `containerSize` state + `ResizeObserver` 완전히 제거:
  - `views/multi/season/MultiFullCourtChart.tsx` (라이브 인게임 샷차트 — 이번 리포트의 진원지)
  - `views/multi/season/MultiShotChartTab.tsx` (멀티 결과화면 샷차트 탭)
  - `components/game/tabs/GameShotChartTab.tsx` (싱글플레이어 샷차트 탭)
  - `views/LiveGameView.tsx` (싱글플레이어 라이브 뷰)

**Before**:
```tsx
// 각 화면마다 반복되던 패턴
const [containerSize, setContainerSize] = useState({ w: 940, h: 500 });  // 또는 {w:0,h:0}
useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
}, []);
...
<ShotTooltip tooltip={tooltip} containerWidth={containerSize.w} containerHeight={containerSize.h} ... />
```

**After**:
```tsx
// useShotChartTooltip.ts — mouseX/mouseY와 같은 getBoundingClientRect() 호출에서 컨테이너 크기도 함께 캡처
const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
return { nearest, cluster, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top, containerWidth: rect.width, containerHeight: rect.height };
...
setTooltip({ primaryShot: nearest, clusterShots: cluster, mouseX, mouseY, containerWidth, containerHeight });

// 각 화면 — containerSize state/ResizeObserver 완전 삭제
<ShotTooltip tooltip={tooltip} isPinned={isPinned} onClose={closePinned} />
```
- 컨테이너 크기 측정을 "언젠가 발동하는 별도 옵저버 state"에서 "호버 시점에 mouseX/mouseY와 정확히 같은 순간 같은 방식으로 측정"으로 통일 — 두 값이 서로 다른 시점/메커니즘으로 어긋날 가능성 자체를 구조적으로 제거.
- 4개 화면 모두 같은 패턴을 복붙해서 쓰고 있었던 걸 확인, 전부 동일하게 정리(싱글/멀티, 라이브/결과화면 공통 버그였을 가능성이 높아 함께 수정).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — 이번에 건드린 6개 파일(useShotChartTooltip.ts, ShotTooltip.tsx, MultiFullCourtChart.tsx, MultiShotChartTab.tsx, GameShotChartTab.tsx, LiveGameView.tsx) 전부 오류 없음. (전체 tscheck 실행 시 이 세션과 무관한 기존 타입 오류가 다수 나오는데, 전부 위 6개 파일과 무관한 다른 영역 — 이번 변경으로 인한 신규 오류 아님을 파일명 대조로 확인.)

**롤백 방법**: 6개 파일 모두 Before 블록으로 되돌리면 됨(`containerSize` state/ResizeObserver 복원 + `TooltipState`에서 containerWidth/Height 제거).

---

## 2026-08-04 — 진행 중인 경기 입장 시 클락과 무관하게 팁오프 메세지가 뜨는 버그 수정

**배경**: "진행 중인 경기에 입장하면 현재 게임클락이 몇분이건간에 팁오프 메세지가 점보트론에 뜬다. 이건 버그야."

**원인**: 흐름 이벤트(경기 시작/쿼터 종료 등, `teamId==='SYSTEM'`) 감지 effect는 "직전 렌더의 `visibleEvents.length`를 기준선으로 잡고, 그보다 늘어난 만큼만 새 이벤트로 큐에 넣는다"는 방식인데, `visibleEvents`는 `gameData`가 아직 `null`인 동안 항상 빈 배열(`[]`)을 반환한다(`if (!gameData) return [];`). 그래서 컴포넌트 마운트 직후 gameData 로드 *전*에 이 effect가 먼저 한 번 실행되면서 기준선을 `0`으로 잡아버리고, 곧이어 gameData가 로드되며 `visibleEvents`가 그동안 진행된 전체 백로그(수십~수백 개 로그, 팁오프 포함)로 한 번에 뛰면, 그 늘어난 구간 전체가 "새로 드러난 이벤트"로 오인되어 큐에 쌓였음 — 그 안에 있던 "경기 시작" 로그가 그대로 점보트론에 표시된 것.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (흐름 이벤트 감지 `useEffect`)

**Before**:
```tsx
useEffect(() => {
    if (flowSeenCountRef.current === null) {
        flowSeenCountRef.current = visibleEvents.length;
        return;
    }
    if (visibleEvents.length > flowSeenCountRef.current) { ... }
    flowSeenCountRef.current = visibleEvents.length;
}, [visibleEvents]);
```

**After**:
```tsx
useEffect(() => {
    // gameData 로드 전엔 visibleEvents가 항상 []이라 기준선을 0으로 잘못 잡음 — 로드 전에는
    // 기준선 자체를 잡지 않는다.
    if (!gameData) return;
    if (flowSeenCountRef.current === null) {
        flowSeenCountRef.current = visibleEvents.length;
        return;
    }
    if (visibleEvents.length > flowSeenCountRef.current) { ... }
    flowSeenCountRef.current = visibleEvents.length;
}, [visibleEvents, gameData]);
```
- `gameData`가 준비되기 전에는 effect가 아무 것도 하지 않도록 가드 추가 — 기준선은 오직 gameData가 실제로 로드된 "첫 유의미한" 시점에만 잡히므로, 중간 참여 시 이미 지나간 로그(팁오프 등)는 정상적으로 기준선에 포함되고 그 이후 로그만 큐에 쌓인다.
- 참고로 마일스톤(득점/리바운드/더블더블 등) 감지 effect는 같은 문제가 없음을 확인 — 거기는 `prev[playerId]`의 "존재 여부"로 첫 실제 데이터 시점을 판별하는 구조라 빈 배열 구간의 영향을 안 받음.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `if (!gameData) return;` 줄과 의존성 배열의 `gameData` 제거.

---

## 2026-08-04 — "시작 전 화면 스쳐감" 진짜 원인 발견(v2) — resolvedGameId가 짧은 코드인 동안 schedule 조회 실패를 오판

**배경**: 직전 수정(`scheduledAt === undefined` 가드) 적용 후에도 "아직도 똑같아. 시작 전 화면이 잠깐 스쳐간다"는 재현 보고 — v1 진단이 틀렸음을 확인하고 재조사.

**진짜 원인**: `resolvedGameId`는 마운트 시 URL의 `gameId`(신규 리그에서는 짧은 코드일 수 있음)로 먼저 세팅되고, 실제 `game_id`로의 변환은 `game_short_codes` 테이블을 조회하는 **별도 effect가 비동기로** 처리한다. scheduledAt을 조회하는 effect가 이 변환이 끝나기 *전에* 먼저 실행되면, `resolvedGameId`가 아직 짧은 코드라 `schedule.find(g => g.id === resolvedGameId)`가 못 찾는 게 정상인데 — 기존 코드는 이걸 "찾아봤는데 진짜 없다"로 확정 처리해 `scheduledAt=null`, `gamePlayed=false`를 세팅했다. 이 값들로 `displayState`를 계산하면 일시적으로 `'scheduled'`가 나오고(`scheduledAt`이 `null`이라 v1의 `undefined` 가드를 통과해버림), 그 결과 실제로는 종료된 경기인데도 카운트다운 화면이 한 번 스쳐간 뒤 짧은 코드 변환이 끝나면서 화면이 정상 결과로 바로잡히는 것이었다. v1 가드(`scheduledAt === undefined`)는 "미확정" 상태만 막았지, "잘못 확정된(null)" 상태는 못 막아서 재현됐다.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`rooms.schedule` 조회 후 `scheduledAt`/`gamePlayed`를 세팅하는 `useEffect`)

**Before**:
```tsx
const game = schedule.find(g => g.id === resolvedGameId);
setGamePlayed(!!game?.played);
setScheduledAt(game ? (resolveRealAt(game, simStart, gprd) ?? game.scheduledAt ?? null) : null);
```

**After**:
```tsx
const game = schedule.find(g => g.id === resolvedGameId);
// 못 찾으면(=resolvedGameId가 아직 짧은 코드일 가능성) 아무 것도 확정하지 않고,
// resolvedGameId가 실제 game_id로 갱신되면서 이 effect가 재실행되길 기다린다.
if (!game) return;
setGamePlayed(!!game.played);
setScheduledAt(resolveRealAt(game, simStart, gprd) ?? game.scheduledAt ?? null);
```
- `game`을 못 찾은 경우 `scheduledAt=null`로 확정짓지 않고 effect를 그냥 종료 — `scheduledAt`은 `undefined`로 남아 로더 게이트(`isLoading || scheduledAt === undefined`)가 계속 닫혀 있음.
- 곧이어 짧은 코드→실제 `game_id` 변환이 끝나 `resolvedGameId`가 갱신되면 이 effect가 (의존성 배열에 `resolvedGameId` 포함) 재실행되어 이번엔 정상적으로 schedule에서 게임을 찾고 올바른 `scheduledAt`/`gamePlayed`를 세팅 → `displayState`가 처음부터 곧장 올바른 값(`final`/`live`)으로 확정되어 중간 화면이 끼어들 틈이 없어짐.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `if (!game) return;` 제거하고 Before 블록으로 되돌리면 됨(단, 버그 재발).

---

## 2026-08-04 — 종료된 경기 진입 시 "시작 전 화면" 잠깐 스쳐가는 레이스 컨디션 수정(v1, 불완전)

**배경**: "종료된 경기 보기 들어가면 왜 경기 시작전 화면이 한번 나타났다가, 경기 결과 화면으로 이동하지?"

**원인**: `scheduledAt`은 별도 effect가 `rooms.schedule`을 비동기로 조회해서 채우는데, 그 조회가 끝나기 전(초기값 `undefined`)엔 `getGameDisplayState`가 "scheduledAt 없음" 폴백 분기(`game.played ? 'final' : 'scheduled'`)를 타면서 `gamePlayed`도 아직 초기값(`false`)이라 일시적으로 `displayState`가 `'scheduled'`로 잘못 찍힘. 경기 상세 조회 effect가 이 "가짜 scheduled"를 진짜로 오인해 `setIsLoading(false)`를 성급하게 호출 → `scheduledAt`이 실제 값으로 확정되고 `displayState`가 `'final'`로 바로잡히기까지 한두 렌더 동안 게이트가 풀려 시작-전 화면(또는 "데이터 준비 중" 메시지)이 노출된 뒤에야 진짜 결과 화면으로 넘어감.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (경기 상세 조회 `useEffect`)

**Before**:
```tsx
useEffect(() => {
    if (!room?.id || !resolvedGameId) return;
    if (displayState === 'scheduled') { setIsLoading(false); return; }
    ...
}, [room?.id, resolvedGameId, displayState, session?.access_token]);
```

**After**:
```tsx
useEffect(() => {
    if (!room?.id || !resolvedGameId) return;
    // scheduledAt이 아직 미확정이면 displayState의 'scheduled'는 신뢰 불가한 폴백값이므로
    // 이 effect 자체를 건너뛰어 isLoading을 true로 유지(성급한 false 방지).
    if (scheduledAt === undefined) return;
    if (displayState === 'scheduled') { setIsLoading(false); return; }
    ...
}, [room?.id, resolvedGameId, displayState, session?.access_token, scheduledAt]);
```
- `scheduledAt === undefined`(아직 미확정) 상태에서는 이 effect가 아무 것도 하지 않고 조기 종료 — `isLoading`이 초기값 `true`를 그대로 유지해 로더 게이트가 계속 닫혀 있음.
- `scheduledAt`이 실제 값으로 확정되는 순간에는 `displayState`도 같은 렌더에서 이미 올바른 값(`final`/`live`)으로 재계산돼 있으므로, 이 effect는 바로 정상 fetch 경로(`setIsLoading(true) → load() → setGameData/setIsLoading(false)`)를 타서 중간 화면 없이 로더→결과 화면으로 곧장 전환됨.
- 의존성 배열에 `scheduledAt` 명시 추가(가드에서 직접 참조하므로).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `if (scheduledAt === undefined) return;` 줄과 의존성 배열의 `scheduledAt` 제거.

---

## 2026-08-04 — 헤더 가운데-우측 경계 틈 수정(grid fr 대신 flex+동일 % 폭으로 통일)

**배경**: "우측 영역과 중앙 영역 사이에 공간이 보이는데, 이게 왜 생겼는지 알아오라고." 스크린샷에서 중앙(쿼터 테이블) 오른쪽 끝과 홈팀(POR) 빨간 배경 사이에 미세한 틈이 보임 — 좌측(CLE)-중앙 경계는 문제없고 중앙-우측 경계에서만 나타나는 비대칭 현상.

**원인**: 헤더는 두 개의 독립된 레이어로 구성돼 있었음 — (1) 배경 색상은 `position: absolute`+순수 `%` 값(`left:0/width:30%`, `left:30%/width:40%`, `right:0/width:30%`)으로 그리는 오버레이 3장, (2) 실제 콘텐츠(팀명/점수/쿼터테이블)는 `grid-cols-[3fr_4fr_3fr]`(fr 단위) 그리드. 수학적으로는 둘 다 30/40/30%로 동일해야 하지만, **CSS Grid의 fr 트랙 폭 계산 알고리즘과 absolute 요소의 % 폭 계산은 브라우저 내부적으로 별도 경로**라 컨테이너 폭이 10으로 딱 안 나눠떨어지는 경우 반올림이 서로 어긋날 수 있음. 특히 away(`left:0` 기준)/center(`left:30%` 기준)는 같은 "left 앵커" 계산이라 우연히 잘 맞았지만, home 오버레이만 반대 앵커(`right:0`)를 써서 그 경계에서만 오차가 드러난 것으로 추정.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 콘텐츠 컨테이너 + 어웨이/가운데/홈 컬럼 div)

**Before**:
```tsx
<div className="relative z-10 grid grid-cols-[3fr_4fr_3fr] items-center">
    <div className="flex items-center justify-start gap-5 py-6 px-8" style={{ color: awayText }}>...</div>
    <div className="flex flex-col items-center justify-center shrink-0">...</div>
    <div className="flex items-center justify-end gap-5 py-6 px-8" style={{ color: homeText }}>...</div>
</div>
```

**After**:
```tsx
<div className="relative z-10 flex items-center">
    <div className="flex items-center justify-start gap-5 py-6 px-8 shrink-0" style={{ color: awayText, width: '30%' }}>...</div>
    <div className="flex flex-col items-center justify-center shrink-0" style={{ width: '40%' }}>...</div>
    <div className="flex items-center justify-end gap-5 py-6 px-8 shrink-0" style={{ color: homeText, width: '30%' }}>...</div>
</div>
```
- `grid grid-cols-[3fr_4fr_3fr]`(fr 단위 그리드) → `flex` + 각 컬럼에 배경 오버레이와 **완전히 동일한 인라인 `width: '30%'/'40%'/'30%'`** 직접 지정.
- 이제 배경 오버레이와 콘텐츠 컬럼이 100% 동일한 CSS 계산식(순수 %)을 공유하므로, 브라우저가 어떤 폭에서 반올림하든 항상 같은 픽셀 경계로 귀결 — 알고리즘이 다른 두 시스템을 억지로 맞추는 대신 애초에 하나로 통일.
- `shrink-0`을 세 컬럼 모두에 추가해 flex의 기본 축소 동작으로 폭이 틀어지지 않게 고정.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨.

---

## 2026-08-04 — 점보트론에 더블더블/트리플더블/쿼드러플더블/5x5 복합 마일스톤 추가

**배경**: "점보트론에 더블더블, 트리플 더블, 쿼드러플 더블, 4x5 등의 특수 마일스톤도 추가해줘." "4x5"가 표준 용어가 아니라 AskUserQuestion으로 확인 → "5x5"(PTS/REB/AST/STL/BLK 5개 카테고리 모두 5 이상, 하킴 올라주원이 실제 달성한 희귀 마일스톤)로 확정.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`JumbotronEvent` 타입, 마일스톤 감지 로직, 헤더 가운데 컬럼 렌더)

**After** (신규 추가):
```tsx
// 타입 — combo kind 추가
type ComboMilestone = 'dd' | 'td' | 'qd' | '5x5';
const COMBO_LABEL: Record<ComboMilestone, string> = {
    dd: '더블더블', td: '트리플더블', qd: '쿼드러플더블', '5x5': '5X5',
};
const COMBO_STATS: JumbotronStat[] = ['pts', 'reb', 'ast', 'stl', 'blk'];

function crossedCombo(old: Record<JumbotronStat, number>, cur: Record<JumbotronStat, number>): ComboMilestone | null {
    const countAtLeast = (snap, threshold) => COMBO_STATS.filter(s => snap[s] >= threshold).length;
    const oldTenCount = countAtLeast(old, 10), curTenCount = countAtLeast(cur, 10);
    if (curTenCount >= 4 && oldTenCount < 4) return 'qd';
    if (curTenCount >= 3 && oldTenCount < 3) return 'td';
    if (curTenCount >= 2 && oldTenCount < 2) return 'dd';
    const cur5x5 = COMBO_STATS.every(s => cur[s] >= 5), old5x5 = COMBO_STATS.every(s => old[s] >= 5);
    if (cur5x5 && !old5x5) return '5x5';
    return null;
}

type JumbotronEvent =
    | { kind: 'stat'; ... }
    | { kind: 'combo'; key: string; player: PlayerBoxScore; combo: ComboMilestone; isHome: boolean }  // 신규
    | { kind: 'flow'; ... };

// 감지 useEffect 내 기존 per-stat 루프 다음에 추가
const combo = crossedCombo(old, snap);
if (combo != null) newEvents.push({ kind: 'combo', key: `${p.playerId}-combo-${combo}`, player: p, combo, isHome: homeIds.has(p.playerId) });

// 헤더 가운데 컬럼 렌더 — flow / combo / stat 3분기로 확장(stat 브랜치 스타일 그대로 재사용)
activeJumbotron.kind === 'flow' ? (...) : activeJumbotron.kind === 'combo' ? (
    <div>...팀약어+선수명... <span className={COMBO_ACCENT[activeJumbotron.combo]}>{COMBO_LABEL[activeJumbotron.combo]}</span></div>
) : (
    /* 기존 stat 브랜치 */
);
```
- dd(2개 카테고리 10+)→td(3개)→qd(4개)는 하나의 사다리로, 값이 뛰어넘어도 새로 도달한 "최고 단계"만 1회 발화(기존 `crossedMilestone`의 "새로 넘은 구간만" 원칙과 동일).
- 5x5는 독립 트랙(5개 카테고리 전부 5 이상) — qd와 조건이 겹치지 않으므로 같은 틱에 qd와 5x5가 동시에 발화할 수도 있음(둘 다 큐에 쌓여 순서대로 표시).
- 렌더는 기존 stat 마일스톤과 동일한 시각 스타일(3xl, 팀약어+선수명 1줄 + 라벨 2줄)을 그대로 재사용해 톤 일관성 유지.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `ComboMilestone` 타입/`COMBO_LABEL`/`COMBO_ACCENT`/`crossedCombo` 삭제, `JumbotronEvent`에서 combo 분기 제거, 감지 루프의 `crossedCombo` 호출부 삭제, 헤더 렌더의 combo 삼항 분기 제거.

---

## 2026-08-04 — 점보트론 선수명 max-width 제거(폰트 확대 후 "..." 처리 원인 해결)

**배경**: stat 이벤트 폰트를 3xl로 키운 뒤 "폰트사이즈는 커졌는데 왜 이름이 ... 처리되지? 영역 자체는 늘어나지 않았나?" — 원인: 선수명 span에 `truncate max-w-[160px]`로 폭이 폰트 크기와 무관하게 160px 고정이었음. 12px일 땐 여유 있었지만 30px로 커지면서 같은 160px 안에 들어가는 글자 수가 줄어 이전엔 안 잘리던 이름도 잘리기 시작. "max값을 주지 마 아예" 요청으로 완전 제거.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼, stat 이벤트 선수명 span)

**Before**: `<span className="font-bold text-white truncate max-w-[160px]">`
**After**: `<span className="font-bold text-white whitespace-nowrap">`

- `max-w-[160px]`/`truncate`(overflow-hidden+text-ellipsis 포함) 완전 삭제.
- `whitespace-nowrap`만 남겨 원래 의도한 "1줄" 레이아웃은 유지(줄바꿈 방지) — 대신 매우 긴 이름은 헤더 가운데 컬럼 폭을 넘어설 수 있음(요청에 따라 감수).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `whitespace-nowrap` → `truncate max-w-[160px]`로 되돌리면 됨.

---

## 2026-08-04 — 점보트론 stat 이벤트(마일스톤) 1·2줄 폰트 3xl로 확대

**배경**: "stat 이벤트 첫번째 줄과 두번째 줄 사이즈 모두 3xl로 올려봐" — 폰트 크기 조사(1줄 팀약어+선수명 text-xs=12px, 2줄 값+라벨 text-lg=18px) 후 확대 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼, activeJumbotron stat kind 렌더)

**Before**: 1줄(팀약어+선수명) `text-xs`(12px), 2줄(값+라벨) `text-lg`(18px)
**After**: 1줄 `text-3xl`(30px), 2줄 `text-3xl`(30px) — 둘 다 동일하게 확대

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: 1줄 wrapper `text-3xl`→`text-xs`, 2줄 span `text-3xl`→`text-lg`로 되돌리면 됨.

---

## 2026-08-04 — 점보트론 파울 정보란 대칭 재배치 + 팀약어 흰색 고정

**배경**: "팀 약어에는 팀 테마 컬러를 적용하지 않고 흰색 텍스트 적용. 또한 파울 정보란 구조를 대칭으로 바꿔줘. 팀명 | 타임아웃 | 파울 개수 | 보너스 | 보너스 | 파울 개수 | 타임아웃 | 팀명."

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼, 파울/보너스/타임아웃 줄)

**Before**:
```tsx
<span className="flex items-center gap-1">
    <span className="text-xl font-mono font-bold" style={{ color: awayColor }}>{awayAbbr}</span>
    {awayFouls >= 5 ? <BONUS/> : <span>파울 {awayFouls}</span>}  {/* 파울/보너스 양자택일 */}
    <span>{/* 타임아웃 점 */}</span>
</span>
<span>|</span>
<span className="flex items-center gap-1">
    <span style={{ color: homeColor }}>{homeAbbr}</span>
    {homeFouls >= 5 ? <BONUS/> : <span>파울 {homeFouls}</span>}
    <span>{/* 타임아웃 점 */}</span>
</span>
```
순서: 팀명→파울/보너스→타임아웃 (양쪽 동일 순서, 비대칭)

**After**:
```tsx
<span className="flex items-center gap-1.5">
    <span className="text-xl font-mono font-bold text-white">{awayAbbr}</span>
    <span>{/* 타임아웃 점 */}</span>
    <span>파울 {awayFouls}</span>          {/* 보너스 여부 무관 항상 표시 */}
    {awayFouls >= 5 && <BONUS/>}           {/* 보너스면 추가로 배지 */}
</span>
<span>|</span>
<span className="flex items-center gap-1.5">
    {homeFouls >= 5 && <BONUS/>}
    <span>파울 {homeFouls}</span>
    <span>{/* 타임아웃 점 */}</span>
    <span className="text-xl font-mono font-bold text-white">{homeAbbr}</span>
</span>
```
순서: `팀명 | 타임아웃 | 파울개수 | 보너스` ‖ `보너스 | 파울개수 | 타임아웃 | 팀명` — 가운데 구분선(`|`) 기준 거울 대칭.

- 팀약어 색상을 `style={{ color: awayColor/homeColor }}` → `text-white` 고정으로 변경(팀 테마색 제거).
- 파울 개수는 이제 보너스 상태와 무관하게 항상 표시, BONUS 배지는 파울 5개 이상일 때 "추가로" 붙는 방식으로 변경(기존엔 파울/보너스가 양자택일).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨.

---

## 2026-08-04 — 점보트론 타임아웃 점/구분자 크기도 xl로 통일

**배경**: "타임아웃 점과 구분자도 그에 맞게 키워줘야지" — 직전에 팀약어/파울텍스트/BONUS만 xl로 키우고 타임아웃 점(●)과 "|" 구분자는 부모(`text-[10px]`)를 그대로 상속해 여전히 작게 남아있던 걸 지적.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (파울/보너스/타임아웃 줄 wrapper)

**Before**: `<div className="flex items-center gap-2 text-[10px] text-slate-400">`
**After**: `<div className="flex items-center gap-2 text-xl text-slate-400">`

- 타임아웃 점(●)과 팀 간 "|" 구분자는 자체 font-size 클래스가 없어 부모 값을 그대로 상속하는 구조라, wrapper의 기준 크기를 `text-[10px]` → `text-xl`로 바꾸는 것만으로 두 요소 모두 다른 텍스트와 동일하게 커짐(각 span에 개별로 text-xl을 추가할 필요 없음).
- 직전에 팀약어/파울 텍스트 span에 개별로 넣어둔 `text-xl`은 이제 부모와 값이 같아져 중복이지만, 제거해도 결과가 같으므로 그대로 둠(무해).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: wrapper `text-xl` → `text-[10px]`로 되돌리면 됨.

---

## 2026-08-04 — 점보트론(헤더 가운데) 텍스트 크기 조사 후 일괄 확대

**배경**: "쿼터 표시, 게임 클락, 스코어링 런, 팀약어, 파울 텍스트, 보너스 배지의 텍스트 사이즈가 각각 몇인지 조사해서 알려줘" → 조사 후 "쿼터/클락 → 3xl, 스코어링 런 → 2xl, 팀약어/파울텍스트/보너스 배지 → xl"로 변경 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼 idle 상태 렌더)

**Before → After** (조사 결과 및 변경값):
| 요소 | Before | After |
|---|---|---|
| 쿼터 표시(`Q3`) | `text-xl`(20px) | `text-3xl`(30px) |
| 게임 클락(`6:48`) | `text-xl`(20px) | `text-3xl`(30px) |
| 스코어링 런(`🔥 DEN 13-4`) | `text-xs`(12px) | `text-2xl`(24px) |
| 팀약어(파울 줄의 `DEN`/`TOR`) | 지정 없음(부모 `text-[10px]` 상속) | `text-xl`(20px) 명시 |
| 파울 텍스트("파울"+숫자) | 지정 없음(부모 상속) | `text-xl`(20px) 명시 |
| BONUS 배지 | `text-[8px]` | `text-xl`(20px) |

- 팀약어/파울 텍스트는 원래 부모 wrapper(`text-[10px]`)에서 상속만 받던 걸 각 span에 `text-xl`을 직접 지정해 오버라이드.
- 타임아웃 점(●)과 "|" 구분자는 이번 요청에 없어 그대로 유지(부모 `text-[10px]` 상속).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: 위 표의 Before 값으로 각 클래스 되돌리면 됨.

---

## 2026-08-04 — 시작 전 경기도 전체화면 카운트다운 대신 실제 헤더+점보트론으로 진입

**배경**: 무한 로딩 버그를 고친 뒤에도 "내가 원한건 이게 아니라, 경기 시뮬레이션 뷰로 들어가는거였어. 점보트론 영역에 저 카운트다운 메세지를 띄워주면될거같은데" — 시작 전 경기는 별도의 검정 전체화면(시계 아이콘+카운트다운)만 보여주고 있었는데, 실제 헤더(팀명/컬러/스코어보드 골격)까지 보여주고 그 안의 점보트론(가운데 컬럼)에 카운트다운을 띄워달라는 요청.

**핵심 제약**: scheduled 상태는 `game_pbp`를 아예 조회하지 않아(`fetchLiveGameView` 호출 자체를 스킵) `gameData`가 계속 `null`. 헤더 자체는 `isLive`/`showBox` 게이트 뒤에만 `gameData.xxx`를 직접 참조해서(둘 다 scheduled에선 false) gameData 없이도 안전하게 그릴 수 있지만, 팀명/컬러/약어는 지금까지 `gameData?.home_team_id` 기반이라 scheduled에선 전부 플레이스홀더('HOM'/'AWY')였음. 라이브 3열 본문(박스스코어/샷차트/PBP)은 `gameData.xxx`를 가드 없이 직접 참조하는 곳이 많아 그대로는 렌더 불가.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (팀 정보 파생 로직, 헤더 가운데 컬럼 점보트론 분기, 최상위 렌더 분기, 라이브 본문 조건)

**Before**:
```tsx
// 팀 정보 — gameData 필수
const homeTeam = useMemo(() => leagueTeams.find(t => t.team_slug === gameData?.home_team_id), [leagueTeams, gameData]);
const homeAbbr = homeTeam?.team_abbr ?? (gameData?.home_team_id.toUpperCase().slice(0, 3) ?? 'HOM');
const homeWL = gameData ? wl[gameData.home_team_id] : undefined;

// 헤더 가운데: isLive && activeJumbotron 아니면 quarter/clock (scheduled면 전부 빈 화면)
{isLive && activeJumbotron ? (...) : (<div>...isLive 게이트뿐...</div>)}

// scheduled 전용 early-return — 전체화면 시계+카운트다운, 헤더 자체가 없음
if (displayState === 'scheduled') {
    return (<div>{dateStrip}<div>...Clock+카운트다운...</div></div>);
}
if (error || !gameData) { return (...); }

// 본문
{!showBox && (<div className="flex flex-1 ...">{/* 3열 라이브 레이아웃 */}</div>)}
```

**After**:
```tsx
// 팀 정보 — schedule(이미 로드된 시즌 일정)에서 homeTeamId/awayTeamId 폴백
const scheduleGame = useMemo(() => schedule.find(g => g.id === resolvedGameId), [schedule, resolvedGameId]);
const homeTeamId = gameData?.home_team_id ?? scheduleGame?.homeTeamId;
const homeTeam = useMemo(() => leagueTeams.find(t => t.team_slug === homeTeamId), [leagueTeams, homeTeamId]);
const homeAbbr = homeTeam?.team_abbr ?? (homeTeamId?.toUpperCase().slice(0, 3) ?? 'HOM');
const homeWL = homeTeamId ? wl[homeTeamId] : undefined;

// isScheduled + 카운트다운 값을 컴포넌트 상단으로 끌어올림(헤더에서도 사용)
const isScheduled = displayState === 'scheduled';
const scheduledStartMs = scheduledAt ? new Date(scheduledAt).getTime() : null;
const scheduledRemainingMs = scheduledStartMs != null ? Math.max(0, scheduledStartMs - serverNow) : null;
const scheduledStartLabel = scheduledStartMs != null ? new Date(scheduledStartMs).toLocaleTimeString('ko-KR', {...}) : '';

// 헤더 가운데: isScheduled가 최우선 분기 — 카운트다운을 점보트론 자리에 표시
{isScheduled ? (
    <div className="flex flex-col items-center gap-1">
        <Clock size={20} className="text-indigo-400" />
        <span>{scheduledStartLabel ? `${scheduledStartLabel} 시작 예정` : '경기 시작 전'}</span>
        {scheduledRemainingMs != null && <span>시작까지 {fmtCountdown(scheduledRemainingMs)}</span>}
    </div>
) : isLive && activeJumbotron ? (...) : (...)}

// scheduled 전용 early-return 완전 삭제 — 메인 return이 헤더까지는 그대로 그림
if (error || (!gameData && !isScheduled)) { return (...); }  // scheduled는 이 게이트에서 제외

// 본문 — scheduled는 3열 레이아웃(gameData 직접 참조라 크래시 위험) 대신 안내 문구,
// isLive는 !showBox 대신 명시적으로 좁혀서 scheduled를 확실히 배제
{isScheduled && (
    <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-950">
        <p className="text-slate-600 text-sm ko-normal">경기가 시작되면 박스스코어와 실시간 기록이 이 화면에 자동으로 표시됩니다.</p>
    </div>
)}
{isLive && (<div className="flex flex-1 ...">{/* 3열 라이브 레이아웃, 무수정 */}</div>)}
```

**동작 확인**: 정시가 되어 `displayState`가 `live`로 바뀌면 `isScheduled`가 자동으로 `false`가 되므로 헤더는 카운트다운→쿼터/클락/파울로, 본문은 안내 문구→실제 3열 레이아웃으로 자연 전환(별도 리렌더 트리거 불필요, 기존 서버클락 1초 틱 메커니즘 그대로 활용).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음. 헤더 JSX 내 `gameData.` 직접 참조(비-옵셔널)가 `showBox`/`isLive` 게이트 밖에 없는지 grep으로 재확인.

**롤백 방법**: Before 블록으로 되돌리면 됨.

---

## 2026-08-04 — 시작 전 경기 "보기" 버튼 클릭 시 무한 로딩 버그 수정

**배경**: "경기시작하지않은 경기의 보기 버튼을 누르면 들어가지지 않고 무한 로딩이 걸리고 있음." 원인: `MultiGamePbpView.tsx`의 경기 상세 조회 `useEffect`가 `displayState === 'scheduled'`일 때 아무 것도 안 하고 즉시 `return`하는데, `isLoading`의 초기값이 `true`이고 이 effect 안의 `setIsLoading(false)` 호출 2곳 모두 그 return 지점 이후(fetch 성공/실패 분기)에만 있어서, scheduled 상태에서는 `isLoading`이 영원히 `true`로 남아 있었음. 화면 최상단 게이트가 `if (isLoading || scheduledAt === undefined) return <스피너>`라서 이 상태 그대로 무한 로딩. (이전엔 스케줄 경기에 진입할 버튼 자체가 없어서 이 버그가 드러나지 않다가, 최근 슬레이트 색 "보기" 버튼을 추가하면서 실제로 도달 가능해짐.)

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (경기 상세 조회 `useEffect`)

**Before**:
```tsx
useEffect(() => {
    if (!room?.id || !resolvedGameId) return;
    if (displayState === 'scheduled') return;
    let cancelled = false;
    ...
}, [room?.id, resolvedGameId, displayState, session?.access_token]);
```

**After**:
```tsx
useEffect(() => {
    if (!room?.id || !resolvedGameId) return;
    if (displayState === 'scheduled') { setIsLoading(false); return; }
    let cancelled = false;
    ...
}, [room?.id, resolvedGameId, displayState, session?.access_token]);
```
- scheduled 상태는 애초에 gameData가 필요 없는 카운트다운 화면이므로, 여기서 명시적으로 로딩을 끝내 최상단 게이트를 통과시킴.
- 게임이 정시가 되어 `displayState`가 `live`로 바뀌면 이 effect가 재실행되며 정상적으로 `setIsLoading(true)` → fetch → `setIsLoading(false)` 경로를 타므로 라이브 전환은 그대로 잘 동작(별도 영향 없음).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `{ setIsLoading(false); return; }` → `return;`으로 되돌리면 됨(단, 이 경우 버그가 재발함).

---

## 2026-08-04 — 라이브 헤더 LIVE 표시 제거 / 좌우 폭을 바디와 통일 / PBP↔인사이트 그래프 위치 맞바꿈

**배경**: 스크린샷 피드백 3건 동시 반영. (1) "가운데 영역에서 LIVE 표시는 삭제해도 돼" — 점보트론 통합 후 파울/타임아웃 줄이 이미 라이브 상태를 드러내 중복. (2) "헤더의 좌우 섹션 영역의 너비가 바디의 좌우 섹션의 너비와 동일하게끔" — 헤더는 `grid-cols-[4fr_3fr_4fr]`(36.36/27.27/36.36%)인데 바디 좌/우 패널은 `w-[30%]`(중앙은 flex-1=40%)라 서로 안 맞았음. (3) "PBP 코멘터리 영역을 가운데로, 인사이트 그래프 영역을 좌측 하단으로" — 현재 LEFT 컬럼(원정 박스+PBP), CENTER 컬럼(샷차트+인사이트그래프)로 돼 있던 걸 PBP↔인사이트 자리 맞교환.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 가운데 컬럼 LIVE 배지, 헤더 3열 그리드 비율/오버레이, 라이브 바디 LEFT/CENTER 컬럼 내용물)

**Before**:
```tsx
// (1) LIVE 배지
{isLive && (
    <span className="flex items-center gap-1 text-xs font-bold text-red-400">
        <Circle size={6} className="fill-red-400 animate-pulse" />LIVE
    </span>
)}

// (2) 헤더 그리드/오버레이 — 4:3:4 비율
<div className="relative z-10 grid grid-cols-[4fr_3fr_4fr] items-center">
<div style={{ width: 'calc(400% / 11)', backgroundColor: awayColor }} />
<div style={{ width: 'calc(400% / 11)', backgroundColor: homeColor }} />
<div style={{ left: 'calc(400% / 11)', width: 'calc(300% / 11)' }} />

// (3) LEFT=박스+PBP, CENTER=샷차트+인사이트
<div className="w-[30%] ...">{/* 원정 박스 */}{/* PBP 피드 전체 */}</div>
<div className="flex-1 ...">{/* 샷차트 */}{/* GameInsightsPanel */}</div>
```

**After**:
```tsx
// (1) LIVE 배지 블록 삭제(주석만 남김), 미사용된 lucide-react Circle import도 제거

// (2) 헤더 그리드/오버레이 — 3:4:3(=30%/40%/30%, 바디와 동일 비율), gap 없으므로 % 그대로 정확히 일치
<div className="relative z-10 grid grid-cols-[3fr_4fr_3fr] items-center">
<div style={{ width: '30%', backgroundColor: awayColor }} />
<div style={{ width: '30%', backgroundColor: homeColor }} />
<div style={{ left: '30%', width: '40%' }} />

// (3) LEFT=박스+인사이트그래프, CENTER=샷차트+PBP (자리 맞교환, 내용물 자체는 무수정)
<div className="w-[30%] ...">{/* 원정 박스 */}{/* GameInsightsPanel */}</div>
<div className="flex-1 ...">{/* 샷차트 */}{/* PBP 피드 전체 */}</div>
```
- (2) 4+3+4=11등분이던 걸 3+4+3=10등분으로 바꾸면서 30/40/30%로 딱 떨어져 `calc(x%/11)` 대신 리터럴 퍼센트 사용 가능해짐(더 단순, 가독성↑).
- (3) 두 블록 모두 내부 로직/props는 손대지 않고 위치만 이동 — `GameInsightsPanel`은 원정 박스 아래(LEFT 하단), PBP 피드는 샷차트 아래(CENTER 하단)로.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨(LIVE 배지 복원 시 `Circle` import도 재추가 필요).

---

## 2026-08-04 — 라이브 헤더 전체에 점보트론 LED 도트 매트릭스 텍스처 확장

**배경**: "여기 전체에 점보트론의 LED 텍스처를 적용해줘." 직전에 점보트론을 헤더 가운데 컬럼으로 통합하면서 예전 바디 상단 검은 바에 있던 LED 텍스처(도트 매트릭스)는 같이 옮기지 않았는데, 스크린샷 기준으로 헤더 전체(좌/중/우 컬러 밴드 포함)에 이 텍스처를 적용해달라는 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 최상위 컨테이너 배경 오버레이)

**After** (신규 추가, 중앙 slate-950 배경 오버레이 바로 다음):
```tsx
<div
    className="absolute inset-0 pointer-events-none opacity-70"
    style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)', backgroundSize: '4px 4px' }}
/>
```
- 예전 점보트론 검은 바(현재는 삭제됨)에 쓰던 것과 동일한 LED 도트 매트릭스 스타일을 그대로 재사용, `inset-0`으로 범위만 헤더 전체로 확장.
- DOM 순서상 어웨이/홈/가운데 색상 오버레이 다음, `z-10` 그리드 콘텐츠 이전에 위치 — 색 배경 위에 텍스처가 얹히고, 텍스트/버튼 등 실제 콘텐츠는 그 위에 그대로 선명하게 보임.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: 추가한 LED 텍스처 `<div>` 블록 삭제.

---

## 2026-08-04 — 라이브 헤더에 점보트론 통합(파울/보너스/타임아웃 가운데 집중 + 이벤트 시 텍스트 교체)

**배경**: "경기중 화면에서는 헤더를 전부 점보트론 영역으로 채우고 싶음. 좌우에는 팀약어|이름|점수, 가운데에는 쿼터/클락+양팀 파울·보너스+타임아웃, 이벤트(마일스톤/쿼터·경기 시작·종료) 발생 시 가운데를 비우고 이벤트 문구 표시." 가능성 체크 후 "3fr 컬럼으로 진행" 확정.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 어웨이/홈 컬럼, 헤더 가운데 컬럼, 바디 CENTER 컬럼 상단의 구 점보트론 바)

**Before**:
```tsx
// 어웨이/홈 컬럼 안에 파울/보너스/타임아웃이 각자 따로 있었음
{isLive && (
    <div className="flex items-center gap-2 text-[10px] text-slate-400">
        {awayFouls >= 5 ? <span className="...bg-amber-500...">BONUS</span> : <span>파울 {awayFouls}</span>}
        <span className="flex gap-0.5">{/* 타임아웃 dot 4개 */}</span>
    </div>
)}

// 헤더 가운데 컬럼엔 쿼터/클락/LIVE/런 인디케이터만
<div className="flex flex-col items-center gap-1.5">
    <div>{quarterLabel} | {currentTimeRemaining}</div>
    {isLive && <span>LIVE</span>}
    {!showBox && isLive && activeRun && <span>런 인디케이터</span>}
</div>

// 점보트론은 바디 CENTER 컬럼(샷차트+PBP) 최상단의 별도 검은 h-20 바에서 렌더
<div className="shrink-0 h-20 ... bg-black ...">{/* LED텍스처+글로시+activeJumbotron 상세(6스탯 줄 포함) */}</div>
```

**After**:
```tsx
// 어웨이/홈 컬럼 — 파울/보너스/타임아웃 블록 완전 삭제(약어|이름|점수만 남음)

// 헤더 가운데 컬럼 — activeJumbotron 있으면 이벤트 문구로 전체 교체, 없으면 기존 정보 + 양팀 파울/타임아웃 통합
{isLive && activeJumbotron ? (
    activeJumbotron.kind === 'flow' ? (
        <span className="text-lg font-black uppercase tracking-widest text-white">{activeJumbotron.text}</span>
    ) : (
        <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5 text-xs">
                <span className="font-mono font-black text-white">{activeJumbotron.isHome ? homeAbbr : awayAbbr}</span>
                <span className="font-bold text-white truncate max-w-[160px]">{activeJumbotron.player.playerName}</span>
            </div>
            <span className={`text-lg font-black uppercase tracking-widest ${JUMBOTRON_ACCENT[activeJumbotron.stat]}`}>
                {activeJumbotron.value}{JUMBOTRON_LABEL[activeJumbotron.stat]}
            </span>
        </div>
    )
) : (
    <div className="flex flex-col items-center gap-1.5">
        {/* 기존 쿼터/클락/LIVE/런 인디케이터 */}
        {isLive && (
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>{awayAbbr} 파울{awayFouls}/BONUS ●●●●</span>
                <span className="text-slate-700">|</span>
                <span>{homeAbbr} 파울{homeFouls}/BONUS ●●●●</span>
            </div>
        )}
    </div>
)}

// 바디 CENTER 컬럼 상단의 구 점보트론 검은 바 — 완전 삭제(헤더로 이전됐으므로 중복)
```
- 파울/보너스/타임아웃을 좌/우 컬럼에서 빼서 헤더 가운데 한 줄로 통합, 팀 약어는 `awayColor`/`homeColor`로 채색.
- 이벤트 발생 시(`activeJumbotron` truthy) 가운데 컬럼 전체가 쿼터/클락/LIVE/파울 정보 대신 이벤트 문구로 교체 — flow(경기·쿼터 시작/종료)는 1줄 큰 텍스트, stat(마일스톤)은 2줄(팀+선수명 / 값+라벨)로 압축. 기존 6스탯 상세 줄(PTS/REB/AST/...)은 3fr 폭에 맞지 않아 생략.
- 어웨이/홈 컬럼은 `text-6xl` 점수 등으로 이미 헤더 전체 높이를 결정하므로, 가운데 컬럼 내용이 3~4줄(idle)↔1~2줄(이벤트)로 바뀌어도 헤더 전체 높이는 변하지 않음(별도 애니메이션/높이 보정 불필요).
- 바디 CENTER 컬럼(샷차트+PBP) 최상단에 있던 구 점보트론 검은 바(`h-20`, LED텍스처+글로시 효과+상세 렌더) 전체 삭제 — 헤더로 이전되어 중복.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨(어웨이/홈 파울 블록 복원, 헤더 가운데 컬럼 activeJumbotron 분기 제거, 구 점보트론 바 복원).

---

## 2026-08-04 — 스케줄 화면에 시작 전 경기 입장 버튼 추가(슬레이트 색 "보기" 버튼)

**배경**: 정시가 되면 화면이 자동으로 라이브로 전환되는지 가능성을 체크한 뒤(별도 코드 변경 없음 — `useServerClock` 1초 틱 + `getGameDisplayState`가 이미 시간만으로 결정론적으로 판정 + PBP 조회 effect가 `displayState`를 의존성으로 가짐, 기존 아키텍처로 이미 지원됨을 확인), 사용자가 "그럼 시작하기 전의 경기들 진입 버튼은 라이브 경기 보기 버튼의 색상을 슬레이트 색으로 바꾼 보기 버튼을 사용하자"고 요청. 기존엔 `isStarted(g, serverNow) &&` 조건 때문에 시작 전(`scheduled`) 경기는 버튼 자체가 아예 렌더링되지 않았음 — 미리 중계방에 입장해서 대기하다가 정시에 자동 전환되는 걸 이용하려면 입장 버튼이 필요.

**변경 파일**:
- `views/multi/season/MultiScheduleView.tsx` (경기 행의 보기/리뷰 버튼 블록)

**Before**:
```tsx
<div className="w-16 h-5 flex items-center justify-center">
    {isStarted(g, serverNow) && (
        state === 'live' ? (
            <button onClick={() => onView(g.id)} className="... bg-red-600 hover:bg-red-500 text-white rounded-md ...">
                <Tv size={10} />보기
            </button>
        ) : (
            <button onClick={() => onView(g.id)} className="... text-indigo-400 hover:text-indigo-300 ...">리뷰</button>
        )
    )}
</div>
```

**After**:
```tsx
<div className="w-16 h-5 flex items-center justify-center">
    {state === 'live' ? (
        <button onClick={() => onView(g.id)} className="... bg-red-600 hover:bg-red-500 text-white rounded-md ...">
            <Tv size={10} />보기
        </button>
    ) : state === 'scheduled' ? (
        <button onClick={() => onView(g.id)} className="... bg-slate-700 hover:bg-slate-600 text-white rounded-md ...">
            <Tv size={10} />보기
        </button>
    ) : (
        <button onClick={() => onView(g.id)} className="... text-indigo-400 hover:text-indigo-300 ...">리뷰</button>
    )}
</div>
```
- `isStarted(...) &&` 게이트 제거 — 3개 상태(scheduled/live/final) 모두 버튼을 렌더링.
- `scheduled` 버튼은 `live` 버튼과 완전히 동일한 모양(Tv 아이콘 + "보기" 텍스트, 동일 크기/폰트)에 배경만 `bg-red-600`→`bg-slate-700`(hover `bg-slate-600`)로 교체 — 라이브 중이 아님을 색으로만 구분.
- 클릭 시 `onView(g.id)` → `MultiGamePbpView.tsx`로 이동, 거기서 `scheduled` 상태의 카운트다운 화면이 뜨고 정시가 되면 자동으로 라이브 전환됨(추가 작업 불필요, 기존 아키텍처).
- 미사용 처리된 `isStarted` import 제거.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiScheduleView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리고 `isStarted` import 복원.

---

## 2026-08-04 — 쿼터별 득점 테이블 폰트 text-base → text-sm 축소

**배경**: "그리고 헤더의 쿼터별 득점 테이블 폰트 사이즈를 다시 text-sm으로 줄여줘." 직전에 text-base(16px)로 키웠던 걸 한 단계 낮춤.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`QuarterScores`의 `<table>` className)

**Before**: `text-base`
**After**: `text-sm`

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `text-sm` → `text-base`로 되돌리면 됨.

---

## 2026-08-04 — 경기 전환 시 화면 전체가 로더로 덮이는 문제 수정(GameDateStrip 상단 고정 유지)

**배경**: "상단 경기 셀을 눌러서 다른 경기로 전환하면 화면 전체가 로더로 바뀌는데, 이 부분을 개선할 수 있을까?" 원인: `MultiGamePbpView`가 `isLoading`/`scheduledAt===undefined`/`displayState==='scheduled'`/`error` 상태일 때 각각 컴포넌트 전체를 조기 `return`하는 구조였는데, 이 조기 return들이 `<GameDateStrip>` JSX보다 앞에 있어서 — 게임 전환 시 `resolvedGameId`가 바뀌며 데이터 재조회 effect가 `isLoading`을 다시 `true`로 만드는 순간, 방금 클릭한 GameDateStrip을 포함한 화면 전체가 스피너 하나로 통째로 교체되고 있었음. GameDateStrip 자체는 `gameData`/`isLoading`과 무관한 시즌 스케줄 데이터만 쓰므로 이 게이트보다 먼저 렌더될 이유가 없는 컴포넌트였음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (컴포넌트 최하단 렌더 분기: loading/scheduled/error/메인)

**Before**:
```tsx
if (isLoading || scheduledAt === undefined) {
    return (
        <div className="flex items-center justify-center h-full bg-slate-950">
            <Loader2 size={28} className="animate-spin text-indigo-400" />
        </div>
    );
}
if (displayState === 'scheduled') { /* ... 전체 화면 카운트다운으로 반환 ... */ }
if (error || !gameData) { /* ... 전체 화면 에러 메시지로 반환 ... */ }

return (
    <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">
        <GameDateStrip ... />
        {/* 스코어버그 헤더 이하 본문 */}
    </div>
);
```

**After**:
```tsx
// GameDateStrip을 변수로 뽑아 모든 분기에서 재사용
const dateStrip = <GameDateStrip leagueId={leagueId} currentGameId={resolvedGameId} ... />;

if (isLoading || scheduledAt === undefined) {
    return (
        <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">
            {dateStrip}
            <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-950">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        </div>
    );
}
if (displayState === 'scheduled') {
    return (
        <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">
            {dateStrip}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 bg-slate-950">
                {/* 카운트다운 */}
            </div>
        </div>
    );
}
if (error || !gameData) {
    return (
        <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">
            {dateStrip}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 bg-slate-950">
                {/* 에러 메시지 */}
            </div>
        </div>
    );
}

return (
    <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">
        {dateStrip}
        {/* 스코어버그 헤더 이하 본문 */}
    </div>
);
```
- 4개 분기(로딩/스케줄/에러/메인) 모두 동일한 `flex flex-col h-full` 껍데기 + 상단 `{dateStrip}` + `flex-1 min-h-0` body 패턴으로 통일 — 어느 상태여도 상단 날짜 스트립은 계속 보이고 클릭 가능.
- `GameDateStrip`은 `gameData`(로딩 대상 데이터)를 전혀 참조하지 않으므로 이 재구조화로 인한 부작용 없음(schedule/teamMap 등은 이미 상위 컨텍스트에서 즉시 사용 가능한 값들).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `dateStrip` 변수 제거, 각 분기의 return을 Before 블록처럼 body만 반환하는 형태로 되돌리고 `<GameDateStrip .../>`는 메인 return 안에만 남기면 됨.

---

## 2026-08-04 — GameDateStrip 좌측 이동 버튼 추가

**배경**: "생각해보니 좌측으로 이동하는 버튼도 필요할듯." 우측 `>` 버튼만 있어서 스크롤을 오른쪽으로 넘긴 뒤 되돌아올 방법이 버튼으로는 없었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`GameDateStrip` 컴포넌트)

**Before**:
```tsx
const [canScrollRight, setCanScrollRight] = useState(false);
const updateScrollState = () => {
    const el = gameStripRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
};
```

**After**:
```tsx
const [canScrollRight, setCanScrollRight] = useState(false);
const [canScrollLeft, setCanScrollLeft] = useState(false);
const updateScrollState = () => {
    const el = gameStripRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
    setCanScrollLeft(el.scrollLeft > 4);
};
```
```tsx
{/* 좌측 이동 버튼 — 우측 버튼과 동일한 패턴(끝 도달 시 비활성화, 인디고 색상) */}
<button
    onClick={() => gameStripRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
    disabled={!canScrollLeft}
    className="shrink-0 w-8 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 disabled:cursor-default transition-colors"
>
    <ChevronLeft size={18} />
</button>
{/* 그 날짜의 경기 카드 — 가로 스크롤 */}
<div ref={gameStripRef} ...>
```
- 우측 버튼과 완전히 대칭되는 구조(같은 인디고 배경, 같은 disabled 처리, -320px scrollBy)로 스크롤 컨테이너 앞에 배치.
- 시작 지점(`scrollLeft <= 4`)에서는 자동으로 비활성화(회색 처리)되어 "여기가 시작"임도 함께 표시.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `canScrollLeft` state/로직, 좌측 버튼 JSX 블록 삭제.

---

## 2026-08-04 — GameDateStrip 마우스 드래그 스크롤 지원

**배경**: "그리고 경기 리스트를 마우스 드래그로 스크롤 할 수 있는 기능도 만들어줘." 트랙패드가 없는 마우스 사용자는 `>` 버튼 클릭 외엔 리스트를 넘길 방법이 없었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`GameDateStrip` 컴포넌트)

**After** (신규 추가):
```tsx
const dragRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);
const wasDraggedRef = useRef(false);
const handleStripMouseDown = (e: React.MouseEvent) => {
    const el = gameStripRef.current;
    if (!el) return;
    dragRef.current = { startX: e.pageX, startScrollLeft: el.scrollLeft };
};
const handleStripMouseMove = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    const el = gameStripRef.current;
    if (!drag || !el) return;
    const dx = e.pageX - drag.startX;
    if (Math.abs(dx) > 3) {
        wasDraggedRef.current = true;
        el.scrollLeft = drag.startScrollLeft - dx;
    }
};
const endStripDrag = () => { dragRef.current = null; };
const handleStripClickCapture = (e: React.MouseEvent) => {
    if (wasDraggedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        wasDraggedRef.current = false;
    }
};
```
```tsx
<div
    ref={gameStripRef}
    onScroll={updateScrollState}
    onMouseDown={handleStripMouseDown}
    onMouseMove={handleStripMouseMove}
    onMouseUp={endStripDrag}
    onMouseLeave={endStripDrag}
    onClickCapture={handleStripClickCapture}
    className="flex-1 min-w-0 overflow-x-auto flex select-none cursor-grab active:cursor-grabbing"
    ...
>
```
- 마우스다운 시점의 `pageX`와 `scrollLeft`를 기록해두고, 마우스무브마다 이동 거리(dx)만큼 `scrollLeft`를 직접 갱신 — 네이티브 스크롤 이벤트를 흉내내는 방식.
- 3px 이상 실제로 움직였을 때만 드래그로 인정(`wasDraggedRef`), 그 상태에서 카드 위에 마우스를 놓으면 뒤따라오는 클릭 이벤트를 캡처 단계에서 막아 원치 않는 경기 이동을 방지.
- 커서를 `cursor-grab`/`active:cursor-grabbing`으로 바꿔 드래그 가능함을 시각적으로 표시, 카드 버튼 자체엔 `cursor-pointer`를 별도로 줘서 클릭 가능 표시가 흐려지지 않게 함.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `dragRef`/`wasDraggedRef`/관련 핸들러 함수 삭제, 스크롤 컨테이너의 `onMouseDown`/`onMouseMove`/`onMouseUp`/`onMouseLeave`/`onClickCapture`/`select-none cursor-grab active:cursor-grabbing` 제거, 카드 버튼의 `cursor-pointer` 제거.

---

## 2026-08-04 — GameDateStrip 날짜 영역 + 우측 스크롤 버튼 인디고 색 적용

**배경**: "그리고 > 버튼과 날짜 영역은 인디고 색을 적용해봐."

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`GameDateStrip` 컴포넌트 — 날짜 셀렉터 wrapper, 우측 스크롤 버튼)

**Before**:
```tsx
<div ref={dateMenuRef} className="relative shrink-0 flex items-center gap-0.5 px-1.5 border-r border-slate-800">
    <button ... className="p-0.5 rounded text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-20 ...">
    <button ... className={`... ${isDateMenuOpen ? 'bg-slate-800' : 'hover:bg-slate-800'}`}>
    <button ... className="p-0.5 rounded text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-20 ...">
</div>
...
<button ... className="... text-slate-500 hover:text-white hover:bg-slate-900 disabled:opacity-20 ...">
```

**After**:
```tsx
<div ref={dateMenuRef} className="relative shrink-0 flex items-center gap-0.5 px-1.5 bg-indigo-600 border-r border-indigo-700">
    <button ... className="p-0.5 rounded text-indigo-200 hover:text-white hover:bg-indigo-500 disabled:opacity-30 ...">
    <button ... className={`... ${isDateMenuOpen ? 'bg-indigo-500' : 'hover:bg-indigo-500'}`}>
    <button ... className="p-0.5 rounded text-indigo-200 hover:text-white hover:bg-indigo-500 disabled:opacity-30 ...">
</div>
...
<button ... className="... bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 ...">
```
- 날짜 셀렉터 전체(이전/다음 화살표 + 날짜 표시 버튼)를 `bg-indigo-600` 배경의 하나의 칩으로 묶고, 화살표 아이콘은 `text-indigo-200`(hover 시 흰색), 날짜 텍스트는 기존 흰색 유지.
- 우측 스크롤 버튼도 동일하게 `bg-indigo-600` 배경 + 흰 아이콘으로 통일, 비활성(끝 도달) 시 `opacity-30`으로 흐려짐.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨.

---

## 2026-08-04 — GameDateStrip 스크롤 끝 도달 시 우측 버튼 비활성화(무한스크롤처럼 보이는 문제 해결)

**배경**: "무한스크롤인거 같은데, 리스트에 끝이 있도록 수정해줘. 어디가 끝인지 모르니 계속 스크롤할수밖에 없어" — 직전에 추가한 `>` 버튼이 항상 활성 상태였고, 스크롤바도 `scrollbarWidth: 'none'`으로 숨겨놔서 끝에 도달했는지 시각적으로 알 방법이 전혀 없었음(리스트 자체는 그날 경기 수만큼으로 유한하지만, 끝을 알리는 UI 신호가 없어 무한처럼 느껴짐).

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`GameDateStrip` 컴포넌트)

**Before**:
```tsx
const gameStripRef = useRef<HTMLDivElement>(null);
...
<div ref={gameStripRef} className="flex-1 min-w-0 overflow-x-auto flex" ...>
    {activeGroup.games.map(g => ...)}
</div>
...
<button onClick={() => gameStripRef.current?.scrollBy({ left: 320, behavior: 'smooth' })} className="... text-slate-500 hover:text-white hover:bg-slate-900 transition-colors">
    <ChevronRight size={18} />
</button>
```

**After**:
```tsx
const gameStripRef = useRef<HTMLDivElement>(null);
const [canScrollRight, setCanScrollRight] = useState(false);
const updateScrollState = () => {
    const el = gameStripRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
};
useEffect(() => {
    updateScrollState();
    const el = gameStripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => ro.disconnect();
}, [activeGroup]);
...
<div ref={gameStripRef} onScroll={updateScrollState} className="flex-1 min-w-0 overflow-x-auto flex" ...>
    {activeGroup.games.map(g => ...)}
</div>
...
<button
    onClick={() => gameStripRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
    disabled={!canScrollRight}
    className="... text-slate-500 hover:text-white hover:bg-slate-900 disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-default transition-colors"
>
    <ChevronRight size={18} />
</button>
```
- 스크롤 위치를 `onScroll` 이벤트 + `ResizeObserver`(날짜 변경으로 카드 개수가 바뀌거나 창 크기가 바뀌는 경우 대응)로 추적, `scrollWidth - scrollLeft - clientWidth`가 거의 0이면(끝 도달) 버튼을 `disabled` 처리 — 날짜 이전/다음 화살표 버튼과 동일한 `disabled:opacity-20` 패턴 재사용.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `canScrollRight` state/effect, `onScroll` 핸들러, 버튼의 `disabled`/`disabled:*` 클래스 제거.

---

## 2026-08-04 — GameDateStrip 경기 카드 리스트 우측 끝에 스크롤 버튼(>) 추가

**배경**: "가장 우측에 > 버튼을 추가해줘. 현재는 리스트가 화면 우측 끝을 넘어가도 볼 수 있는 방법이 없어." 날짜 셀렉터 옆 경기 카드 가로 스크롤 영역(`overflow-x-auto`, 스크롤바 숨김)이 화면 폭을 넘어가면 마우스 드래그/트랙패드 외에는 접근할 방법이 없었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`GameDateStrip` 컴포넌트)

**Before**:
```tsx
const dateMenuRef = useRef<HTMLDivElement>(null);
...
<div className="flex-1 min-w-0 overflow-x-auto flex" style={{ scrollbarWidth: 'none', ... }}>
    {activeGroup.games.map(g => ...)}
</div>
```

**After**:
```tsx
const dateMenuRef = useRef<HTMLDivElement>(null);
const gameStripRef = useRef<HTMLDivElement>(null);
...
<div ref={gameStripRef} className="flex-1 min-w-0 overflow-x-auto flex" style={{ scrollbarWidth: 'none', ... }}>
    {activeGroup.games.map(g => ...)}
</div>

<button
    onClick={() => gameStripRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
    className="shrink-0 w-8 flex items-center justify-center border-l border-slate-800 text-slate-500 hover:text-white hover:bg-slate-900 transition-colors"
>
    <ChevronRight size={18} />
</button>
```
- 스크롤 컨테이너에 `gameStripRef` 부여, 맨 우측(전체 `<div className="shrink-0 flex items-stretch ...">` 안쪽 마지막 자식)에 고정 화살표 버튼 추가 — 클릭 시 320px씩 부드럽게 스크롤.
- 좌측 화살표는 요청에 없어 추가하지 않음(날짜 이전/다음 이동 화살표와 혼동 방지 목적도 있음).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `gameStripRef` 선언과 버튼 블록 삭제, `ref={gameStripRef}` 제거.

---

## 2026-08-04 — 쿼터별 득점 테이블 전체 폰트 크기 text-base(16px)로 확대

**배경**: "쿼터별 득점 테이블의 모든 폰트 사이즈를 text-base로 설정해봐." 헤더/바디 모두 테이블 최상위 `<table>`의 `text-xs`(12px)를 상속하던 구조라, 이 한 곳만 바꾸면 전체에 일괄 적용됨.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`QuarterScores`의 `<table>` className)

**Before**:
```tsx
<table className={`text-xs font-mono border-collapse ${fullWidth ? 'w-full' : 'mx-auto'}`}>
```

**After**:
```tsx
<table className={`text-base font-mono border-collapse ${fullWidth ? 'w-full' : 'mx-auto'}`}>
```

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `text-base` → `text-xs`로 되돌리면 됨.

---

## 2026-08-04 — 쿼터별 득점 테이블 헤더 폰트 12px 통일 + 라벨 한글화(Q1→1쿼터, T→총합)

**배경**: "헤더도 12px 상속받도록 수정하고, Q1 -> 1쿼터 등으로 수정하고 T는 총합으로 변경해." 헤더 행에 걸린 `text-[10px]`가 바디(12px, 테이블 `text-xs` 상속)와 크기가 달랐던 것과, Q1~Q4/T라는 영문 약식 라벨을 한글로 바꿔달라는 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`QuarterScores` 헤더 `<tr>`/`<th>`)

**Before**:
```tsx
<tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
    <th className="w-12 py-1.5 px-3"></th>
    {[1, 2, 3, 4].map(q => (
        <th key={q} className="text-center py-1.5 px-3 w-9">Q{q}</th>
    ))}
    <th className="text-center py-1.5 px-3 w-9">T</th>
</tr>
```

**After**:
```tsx
<tr className="text-slate-500 font-black uppercase tracking-widest">
    <th className="w-12 py-1.5 px-3"></th>
    {[1, 2, 3, 4].map(q => (
        <th key={q} className="text-center py-1.5 px-3 w-9">{q}쿼터</th>
    ))}
    <th className="text-center py-1.5 px-3 w-9">총합</th>
</tr>
```
- `text-[10px]` 제거 → 테이블 전체에 걸린 `text-xs`(12px)를 그대로 상속, 바디 행과 동일 크기.
- `Q1`~`Q4` → `1쿼터`~`4쿼터`, `T` → `총합`.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨.

---

## 2026-08-04 — 쿼터별 득점 테이블에 박스스코어 테이블 디자인 이식 + 상하 여백 완전 제거

**배경**: 직전 padding 축소가 체감상 효과가 없어 보인다는 피드백("빈공간이 뭐가 없어졌다는건지...??") 후, 사용자가 구체적으로 재요청: "박스스코어 테이블 디자인을 쿼터별 득점 테이블에도 이식해주고, 쿼터별 득점 테이블 상/하단의 여백을 없애줘." 실제 잔여 여백의 원인은 셀 패딩이 아니라, 헤더 가운데 컬럼 부모 `flex flex-col gap-1.5`가 Q라벨/LIVE배지 그룹과 테이블, 테이블과 탭바 사이에도 동일하게 6px씩 간격을 주고 있던 것이었음(전 턴엔 wrapper의 중복 `mt-*`만 제거했지 부모의 `gap-1.5` 자체는 그대로 남아있었음).

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`QuarterScores` 컴포넌트 스타일, 헤더 가운데 컬럼 구조)

**Before**:
```tsx
// 가운데 컬럼 — 모든 자식(라벨/LIVE/테이블/탭바)이 부모의 gap-1.5를 동일하게 적용받음
<div className="flex flex-col items-center justify-center gap-1.5 shrink-0">
    <div className="flex items-center justify-center gap-2">...쿼터 라벨...</div>
    {isLive && <span>LIVE</span>}
    {!showBox && isLive && activeRun && <span>런 인디케이터</span>}
    {showBox && <div className="self-stretch w-full"><QuarterScores .../></div>}
    {showBox && <div className="self-stretch w-full grid ...">...탭바...</div>}
</div>

// QuarterScores — components/common/Table.tsx 스타일 미적용, 행마다 border 색 제각각
<table className="... bg-slate-950 ...">
    <thead><tr>
        <th className="... font-semibold text-slate-400 border-t border-b border-slate-700 ..."></th>
        ...
    </tr></thead>
    <tbody>
        <tr><td className="... border-b border-b-slate-600">{awayAbbr}</td>...</tr>
        <tr><td className="... border-b border-slate-700">{homeAbbr}</td>...</tr>
    </tbody>
</table>
```

**After**:
```tsx
// 가운데 컬럼 — 라벨/LIVE/런 인디케이터만 별도 그룹으로 묶어 자체 gap-1.5 유지,
// 그 아래 테이블+탭바는 부모에 gap이 없어 완전히 밀착(경계는 border 선으로만 구분)
<div className="flex flex-col items-center justify-center shrink-0">
    <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center justify-center gap-2">...쿼터 라벨...</div>
        {isLive && <span>LIVE</span>}
        {!showBox && isLive && activeRun && <span>런 인디케이터</span>}
    </div>
    {showBox && <div className="self-stretch w-full"><QuarterScores .../></div>}
    {showBox && <div className="self-stretch w-full grid ...">...탭바...</div>}
</div>

// QuarterScores — components/common/Table.tsx의 박스스코어 스타일 이식:
// thead bg-slate-950 + border-b, 헤더 텍스트 text-slate-500 text-[10px] font-black uppercase
// tracking-widest, tbody bg-slate-900, 모든 셀 구분선 border-slate-800/50로 통일
<table className={`text-xs font-mono border-collapse ${fullWidth ? 'w-full' : 'mx-auto'}`}>
    <thead className="bg-slate-950 border-b border-slate-800">
        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
            <th className="w-12 py-1.5 px-3"></th>
            {[1,2,3,4].map(q => <th key={q} className="text-center py-1.5 px-3 w-9">Q{q}</th>)}
            <th className="text-center py-1.5 px-3 w-9">T</th>
        </tr>
    </thead>
    <tbody className="bg-slate-900">
        <tr>
            <td className="text-center py-1.5 px-3 font-bold text-slate-200 border-b border-slate-800/50">{awayAbbr}</td>
            ...
        </tr>
        ...
    </tbody>
</table>
```

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨.

---

## 2026-08-04 — 쿼터별 득점 테이블 위아래 여백(중복 margin + 셀 패딩) 축소

**배경**: "쿼터별 득점 테이블 내 위아래 빈공간도 제거해줘." 원인은 두 가지: (1) 헤더 가운데 컬럼(`flex flex-col ... gap-1.5`)이 이미 자식 사이 간격을 `gap-1.5`로 주고 있는데, 테이블 wrapper에 `mt-1`, 탭 버튼 그룹에 `mt-1.5`가 추가로 붙어 간격이 중복 적용되고 있었음. (2) 테이블 자체의 헤더 셀 `py-1.5`, 바디 셀 `py-1` 패딩도 카드형 wrapper가 있던 시절 기준값이라 꽉 찬 flush 테이블 기준으로는 다소 여유로웠음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`QuarterScores` 셀 패딩, 헤더 QuarterScores/탭 버튼 wrapper의 margin)

**Before**:
```tsx
// 테이블 셀
className="... px-3 py-1.5 ..."  // 헤더 th
className="text-center px-3 py-1 ..."  // 바디 td

// wrapper margin
<div className="self-stretch w-full mt-1"><QuarterScores ... /></div>
<div className="self-stretch w-full grid grid-cols-6 divide-x divide-slate-800 border-t border-slate-800 mt-1.5">
```

**After**:
```tsx
// 테이블 셀
className="... px-3 py-1 ..."  // 헤더 th
className="text-center px-3 py-0.5 ..."  // 바디 td

// wrapper margin — mt-* 제거, 부모의 gap-1.5만으로 간격 처리
<div className="self-stretch w-full"><QuarterScores ... /></div>
<div className="self-stretch w-full grid grid-cols-6 divide-x divide-slate-800 border-t border-slate-800">
```

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `py-1.5`/`py-1` 셀 패딩, `mt-1`/`mt-1.5` wrapper margin 복원.

---

## 2026-08-04 — 헤더 쿼터별 득점 테이블을 탭 버튼처럼 꽉 차게 개편, 카드형 배경 제거(슬레이트-950 유지)

**배경**: "그리고 이 부분 테이블이 중앙 섹션 탭 버튼 위에 꽉 차게 테이블을 개편해줘. 배경색은 slate-950으로 유지" — 직전 세션에서 추가했던 `bg-slate-800 rounded-md` 카드형 박스가 탭 버튼(가운데 섹션 폭 100%)과 폭이 안 맞고 붕 떠 보이는 문제.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`QuarterScores` 컴포넌트, 헤더 가운데 컬럼의 QuarterScores 호출부)

**Before**:
```tsx
// QuarterScores 내부
return (
    <div className="bg-slate-800 rounded-md px-2 py-1.5">
        <table className={`text-xs font-mono border-collapse mx-auto ${fullWidth ? 'w-full' : ''}`}>
            ...
        </table>
    </div>
);

// 헤더 호출부
<div className="mt-1">
    <QuarterScores allLogs={visibleEvents} ... />
</div>
```

**After**:
```tsx
// QuarterScores 내부 — 카드 wrapper 제거, 테이블 자체에 bg-slate-950 직접 적용
return (
    <table className={`text-xs font-mono border-collapse bg-slate-950 ${fullWidth ? 'w-full' : 'mx-auto'}`}>
        ...
    </table>
);

// 헤더 호출부 — 탭 버튼과 동일하게 self-stretch w-full + fullWidth prop으로 가운데 섹션 폭 100% 채움
<div className="self-stretch w-full mt-1">
    <QuarterScores allLogs={visibleEvents} ... fullWidth />
</div>
```
- 카드형 `bg-slate-800 rounded-md px-2 py-1.5` wrapper 완전 삭제 — 별도 박스로 안 보이고 가운데 섹션 배경(slate-950)과 자연스럽게 이어짐.
- 헤더 호출부에 `fullWidth` prop 전달 + `self-stretch w-full`로 폭을 탭 버튼 그룹과 동일하게 가운데 grid 트랙 전체로 확장.
- 라이브뷰 사이드바 쪽 호출부(이미 `fullWidth` 사용 중)는 변경 없음 — 카드 wrapper가 없어져 테이블이 살짝 더 슬림해 보일 수 있으나 원래(이번 세션의 slate-800 추가 이전) 모습으로 되돌아간 것.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨.

---

## 2026-08-04 — 결과화면 인사이트 탭 그래프 높이 축소(wrapper에 명시적 height 부여)

**배경**: "그리고 인사이트 탭의 이 그래프 영역의 높이를 조금 낮출 수 있나?" — 마진/승률 통합 차트가 결과 페이지에서 상당히 높게 렌더링되고 있었음.

**원인 분석**: `GameInsightsPanel`은 라이브뷰/결과페이지 두 곳에서 재사용되는데, 결과 페이지 쪽 호출부(`<section>` 안, 일반 문서 흐름이라 높이가 auto)에서는 컴포넌트 내부의 `h-full`/`flex-1` 체인이 참조할 확정 높이가 조상에 없음. 이 경우 브라우저는 퍼센트 height를 `auto`로 처리하고, `<svg viewBox="0 0 800 220">`의 종횡비(800:220 ≈ 3.64:1)로 높이를 역산해서 렌더링함 — 즉 실제 렌더 높이는 flex 값이 아니라 "너비 × (220/800)"로 결정되고 있었음. (라이브뷰 쪽 호출부는 이미 확정 높이를 가진 flex 컬럼 안에 있어 이 문제가 없음.)

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (결과 페이지의 `<GameInsightsPanel .../>` 호출부, `insights` 섹션 내)

**Before**:
```tsx
<GameInsightsPanel
    allLogs={gameData.events ?? []}
    ...
/>
```

**After**:
```tsx
<div className="h-[300px]">
    <GameInsightsPanel
        allLogs={gameData.events ?? []}
        ...
    />
</div>
```
- wrapper에 명시적 `h-[300px]`를 줘서 GameInsightsPanel 내부의 h-full/flex-1 체인이 이제 확정 높이를 참조하게 됨 — 종횡비 역산 대신 실제로 300px로 렌더링. `GameInsightsPanel` 컴포넌트 자체나 라이브뷰 호출부는 건드리지 않음(라이브뷰는 원래도 확정 높이 안이라 영향 없음).

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `<div className="h-[300px]">` wrapper 제거.

---

## 2026-08-04 — 쿼터 테이블 slate-800로 변경, 탭 버튼 활성 시 인디고 배경+흰 텍스트, 버튼 높이 확대

**배경**: "이 섹션의 쿼터별 점수가 들어가는 섹션의 색상은 slate-800 적용하고, 하단의 탭 버튼이 선택되었을때는 인디고 배경색에 흰색 텍스처가 표시되도록 바꿔줘. 그리고 탭 버튼의 높이가 좀 더 커져야할것 같음." (텍스처는 텍스트의 오타로 해석)

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`QuarterScores` 테이블 wrapper, 헤더 탭 버튼)

**Before**:
```tsx
// QuarterScores wrapper
<div className="bg-slate-900 rounded-md px-2 py-1.5">

// 탭 버튼
className={`text-xs font-black uppercase tracking-wider text-center py-1.5 border-b-2 transition-colors ${
    activeSection === t.id ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent hover:text-slate-300'
}`}
```

**After**:
```tsx
// QuarterScores wrapper
<div className="bg-slate-800 rounded-md px-2 py-1.5">

// 탭 버튼
className={`text-xs font-black uppercase tracking-wider text-center py-3 border-b-2 transition-colors ${
    activeSection === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50'
}`}
```
- 쿼터 테이블 배경 `slate-900` → `slate-800`(더 밝은 톤).
- 활성 탭: 텍스트색만 바뀌던 것에서 `bg-indigo-600 text-white`로 배경 전체가 채워지는 방식으로 변경, 테두리도 배경과 맞춰 `border-indigo-600`.
- 비활성 탭: hover 시 은은한 `bg-slate-800/50` 추가(활성 상태와의 차이를 더 명확히 하기 위함).
- 버튼 높이 `py-1.5` → `py-3`로 확대.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨.

---

## 2026-08-04 — 헤더 어웨이/홈 팀 컬러 밴드에 px-8 적용(반응형 pr/pl 단순화)

**배경**: "이 영역에 이제 px-8을 적용해. 우측 팀 영역도 마찬가지" — 스크린샷에서 어웨이(SAC) 팀 컬러 밴드의 "SAC" 텍스트가 화면 좌측 가장자리에 완전히 붙어있는 걸 확인, 좌우 동일 여백 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (헤더 어웨이/홈 컬럼 div)

**Before**:
```tsx
<div className="flex items-center justify-start gap-5 py-6 pr-8 sm:pr-14" style={{ color: awayText }}>
<div className="flex items-center justify-end gap-5 py-6 pl-8 sm:pl-14" style={{ color: homeText }}>
```

**After**:
```tsx
<div className="flex items-center justify-start gap-5 py-6 px-8" style={{ color: awayText }}>
<div className="flex items-center justify-end gap-5 py-6 px-8" style={{ color: homeText }}>
```
- 가운데 방향 편측 패딩(`pr-8 sm:pr-14`/`pl-8 sm:pl-14`)을 좌우 동일 `px-8`로 통일 — 팀 약어/이름이 화면 바깥쪽 가장자리에도 여백을 갖게 됨. (참고: `px-*`는 grid item 내부 padding이라 이전 수정에서 잡아둔 가운데 트랙-오버레이 정렬에는 영향 없음.)

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: 어웨이 div `pr-8 sm:pr-14`, 홈 div `pl-8 sm:pl-14`로 복원.

---

## 2026-08-04 — 쿼터별 득점 테이블 승/패 색상 제거+slate 배경 적용, 헤더 좌우 섹션 py-6(가운데 제외)

**배경**: "쿼터별 득점 테이블에 초록색/빨간색 오버레이 삭제하고, 테이블에 slate색 배경색 넣어줘. 그리고 헤더의 좌/우 섹션에 py-6 적용해. 헤더의 가운데 부분에는 패딩이 적용되면 안되므로 세 개 영역을 분리해."

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (`QuarterScores` 컴포넌트, 헤더 3열 그리드의 어웨이/홈 컬럼 div)

**Before**:
```tsx
// QuarterScores: 쿼터별 승/패 배경
const quarterBg = (mine: number, opp: number, isPlayed: boolean) => {
    if (!isPlayed || mine === opp) return '';
    return mine > opp ? 'bg-emerald-500/15' : 'bg-red-500/15';
};
return (
    <table className={`text-xs font-mono border-collapse mx-auto ${fullWidth ? 'w-full' : ''}`}>
        ...
        <td className={`text-center px-3 py-1 text-white border-b border-slate-800 ${quarterBg(v, scores.home[i], isPlayed)}`}>
        ...
    </table>
);

// 헤더 어웨이/홈 컬럼
<div className="flex items-center justify-start gap-5 pr-8 sm:pr-14" style={{ color: awayText }}>
<div className="flex items-center justify-end gap-5 pl-8 sm:pl-14" style={{ color: homeText }}>
```

**After**:
```tsx
// QuarterScores: quarterBg 함수 삭제, 셀 배경 클래스 제거, 테이블을 slate-900 패널로 감쌈
return (
    <div className="bg-slate-900 rounded-md px-2 py-1.5">
        <table className={`text-xs font-mono border-collapse mx-auto ${fullWidth ? 'w-full' : ''}`}>
            ...
            <td className="text-center px-3 py-1 text-white border-b border-slate-800">
            ...
        </table>
    </div>
);

// 헤더 어웨이/홈 컬럼 — py-6 추가 (가운데 컬럼 div에는 추가 안 함, 이미 별도 grid item으로 분리돼 있어
// 좌/우에만 padding을 줘도 가운데엔 전혀 영향 없음)
<div className="flex items-center justify-start gap-5 py-6 pr-8 sm:pr-14" style={{ color: awayText }}>
<div className="flex items-center justify-end gap-5 py-6 pl-8 sm:pl-14" style={{ color: homeText }}>
```
- 헤더는 이미 `grid-cols-[4fr_3fr_4fr]`의 3개 별도 grid item(어웨이/가운데/홈 div)으로 분리돼 있던 구조라, 어웨이·홈 div에만 `py-6`을 추가하는 것으로 요구사항 충족 — `items-center`(그리드 cross-axis 정렬)가 가운데 컬럼을 더 커진 행(row) 높이에 맞춰 수직 중앙 정렬해주므로 별도 구조 변경 불필요.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `quarterBg` 함수와 셀 클래스 삽입 복원, 테이블 wrapping div 제거, 어웨이/홈 div `py-6` 삭제.

---

## 2026-08-04 — 결과화면 헤더 grid gap → 팀 컬럼 내부 padding으로 전환(탭바 좌우 여백 어긋남 수정)

**배경**: "탭바 좌우에 패딩이 남아있는것 같아서 물어본거임" — 실제로는 padding 클래스가 아니라, 헤더의 3열 그리드(`grid-cols-[4fr_3fr_4fr]`)에 걸린 `gap-8 sm:gap-14`가 원인이었음. CSS grid는 fr 트랙 폭을 (컨테이너 폭 - gap 총합) 기준으로 재분배하는데, 배경 오버레이(어웨이/가운데/홈 색상 밴드)는 `calc(400% / 11)`처럼 gap을 고려하지 않은 순수 비율로 계산돼 있어서, 실제 가운데 그리드 트랙 경계가 오버레이 경계보다 각 3g/11px씩(gap-8이면 ~8.7px, sm:gap-14면 ~15.3px) 안쪽으로 밀림 → 가운데 트랙에 꽉 채운(`self-stretch w-full`) 탭바가 어두운 배경 밴드보다 살짝 좁아 보여 좌우에 여백(패딩처럼)이 남는 것으로 확인.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (스코어보드 헤더 3열 그리드 + 어웨이/홈 컬럼 div)

**Before**:
```tsx
<div className="relative z-10 grid grid-cols-[4fr_3fr_4fr] items-center gap-8 sm:gap-14">
    <div className="flex items-center justify-start gap-5" style={{ color: awayText }}>
    ...
    <div className="flex items-center justify-end gap-5" style={{ color: homeText }}>
```

**After**:
```tsx
<div className="relative z-10 grid grid-cols-[4fr_3fr_4fr] items-center">
    <div className="flex items-center justify-start gap-5 pr-8 sm:pr-14" style={{ color: awayText }}>
    ...
    <div className="flex items-center justify-end gap-5 pl-8 sm:pl-14" style={{ color: homeText }}>
```
- 그리드 자체의 `gap` 제거 → fr 트랙 폭이 gap 없이 순수 4:3:4 비율로 계산되어 배경 오버레이 calc와 정확히 일치.
- 대신 어웨이 div에 `pr-8 sm:pr-14`(우측), 홈 div에 `pl-8 sm:pl-14`(좌측) padding을 줘서 팀 정보와 가운데 블록 사이 시각적 여백은 그대로 유지 — padding은 자식 div 내부 여백이라 그리드 트랙 경계(=오버레이 경계) 자체에는 영향 없음.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: 그리드에 `gap-8 sm:gap-14` 복원, 어웨이/홈 div의 `pr-8 sm:pr-14`/`pl-8 sm:pl-14` 제거.

---

## 2026-08-04 — 결과화면 헤더 컨테이너 px-10/py-2 패딩 전부 제거

**배경**: "헤더 가운데섹션의 패딩을 없애라" 요청. 확인 결과 가운데 컬럼(Q라벨/LIVE뱃지/쿼터스코어/탭바) 자체엔 padding 클래스가 없고, 유일한 padding은 헤더 바깥 컨테이너의 `px-10 py-2`(어웨이/홈 팀 영역에도 동일 적용)였음. AskUserQuestion으로 범위 확인 → "헤더 전체 px-10/py-2 제거"(탭바가 화면 가장자리까지 자연히 넓어짐) 선택.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (스코어보드 헤더 최상위 컨테이너)

**Before**:
```tsx
<div className="relative bg-slate-900 border-b border-slate-800 py-2 px-10 shrink-0 overflow-hidden">
```

**After**:
```tsx
<div className="relative bg-slate-900 border-b border-slate-800 shrink-0 overflow-hidden">
```

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: `py-2 px-10` 클래스 다시 추가.

---

## 2026-08-04 — 결과화면 헤더 탭 그룹 100% 너비 + 균등폭 + 구분선 적용

**배경**: 헤더 중앙 섹션 하단으로 옮긴 탭 그룹이 콘텐츠 크기만큼만 차지하고 가운데 정렬돼 있었음. "탭 그룹의 너비가 헤더 가운데 섹션에 100% 차게 해주고, 탭 버튼 각 버튼 너비 균등하게 맞춰. 그리고 버튼과 버튼 사이, 상단에 구분선 추가해" 요청 반영.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (탭 그룹 렌더 블록, `showBox &&` 내부)

**Before**:
```tsx
<div className="flex items-center justify-center gap-4 mt-1.5">
    {tabs.map(t => (
        <button
            className={`text-xs font-black uppercase tracking-wider border-b-2 pb-0.5 transition-colors ${
                activeSection === t.id ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
        >
            {t.label}
        </button>
    ))}
</div>
```

**After**:
```tsx
<div className="self-stretch w-full grid grid-cols-6 divide-x divide-slate-800 border-t border-slate-800 mt-1.5">
    {tabs.map(t => (
        <button
            className={`text-xs font-black uppercase tracking-wider text-center py-1.5 border-b-2 transition-colors ${
                activeSection === t.id ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
        >
            {t.label}
        </button>
    ))}
</div>
```
- `flex justify-center` → `grid grid-cols-6`: 버튼 6개가 각각 1/6씩 균등폭 차지.
- `self-stretch`: 부모(중앙 컬럼)가 `items-center`라 원래 콘텐츠 폭으로만 줄어들던 걸, 이 자식만 `align-self: stretch`로 override해서 3fr 그리드 컬럼 폭 전체로 늘림 → 그 안의 `w-full`이 비로소 의미를 가짐. 다른 형제(쿼터 라벨/LIVE뱃지/QuarterScores)는 그대로 중앙 정렬 유지.
- `divide-x divide-slate-800`: 버튼 사이 구분선.
- `border-t border-slate-800`: 탭 그룹 상단 구분선(헤더 나머지 요소와의 경계).
- `gap-4` 제거, `pb-0.5`→`py-1.5`: grid 셀 자체가 버튼 히트박스가 되므로 버튼 안쪽 패딩으로 클릭 영역도 셀 전체로 확장.

**검증**: `npx vite build` clean, `npx tsc --noEmit -p tscheck.json` — MultiGamePbpView.tsx 오류 없음.

**롤백 방법**: Before 블록으로 되돌리면 됨.

---

## 2026-08-04 — 결과화면 탭 그룹을 헤더 중앙 섹션 하단으로 이동(별도 h-11 바 제거)

**배경**: 헤더 축소 작업 연장선. "그리고 탭 그룹을 가운데 섹션의 하단에 넣어줘."

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` — client, UI 전용, 서버 미러 없음.

**내용**: 결과 화면(6섹션 통합 페이지, `showBox` 상태) 전용 탭 네비게이션 바(인사이트/박스스코어/경기기록/샷차트/로테이션/온오프, 스크롤스파이로 활성 라벨 갱신)가 기존엔 헤더 **아래** 별도의 독립된 줄(`shrink-0 border-b ... h-11 bg-slate-950`)이었음 — 이걸 스코어버그 헤더의 중앙(3fr) 컬럼 안, 기존 쿼터 라벨+`QuarterScores` 테이블 바로 아래로 이동. `showBox`일 때만 렌더링되는 조건은 그대로 유지(라이브 화면에는 안 나옴). 독립 바 자체(전용 `h-11`/`border-b`/배경)를 없애서 헤더와 탭이 한 블록으로 합쳐져 세로 공간을 절약.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 탭 그룹 블록을 헤더 중앙 컬럼에서 잘라내 원래 위치(`{showBox && (<div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-950">` 바로 다음, `resultScrollRef` 앞)로 되돌리고 `h-11 border-b bg-slate-950 px-6 gap-6` 스타일을 복원하면 됨.

---

## 2026-08-04 — 스코어버그 헤더 중앙 "Final" 텍스트 삭제

**배경**: 헤더 축소 작업 연장선. "우선 Final 글자 삭제해."

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` — client, UI 전용, 서버 미러 없음.

**내용**: `quarterLabel`(`isLive ? \`Q${currentQuarter}\` : 'Final'`)을 감싸는 `<span>`을 `isLive`일 때만 렌더링하도록 조건 추가 — 라이브 중엔 그대로 "Q1" 등 쿼터 표시가 보이고, 경기 종료(`!isLive`) 상태일 때만 나오던 "Final" 텍스트가 사라짐(그 아래 쿼터별 득점 테이블은 그대로 유지).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `{isLive && (<span ...>{quarterLabel}</span>)}`를 `<span ...>{quarterLabel}</span>`(무조건 렌더링)로 되돌리면 됨.

---

## 2026-08-04 — 스코어버그 헤더 세로 패딩 축소(py-8 → py-2, 1차)

**배경**: "각 팀 스코어, Final, 쿼터별 점수 테이블이 있는 헤더 섹션을 대폭 줄일것임"이라는 예고 후 "Py-8을 일단 py-2로 줄여봐"라는 요청. 헤더는 고정 `height`가 없고 `py-8`(위아래 각 32px) 패딩 + 콘텐츠(스코어 `text-6xl`, 쿼터별 득점 테이블 등) 높이로 결정되는 구조임을 먼저 확인.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` — client, UI 전용, 서버 미러 없음.

**Before**: `<div className="relative bg-slate-900 border-b border-slate-800 py-8 px-10 shrink-0 overflow-hidden">`
**After**: `<div className="relative bg-slate-900 border-b border-slate-800 py-2 px-10 shrink-0 overflow-hidden">`
세로 패딩만 `py-8`(32px)→`py-2`(8px)로 축소, 가로 패딩(`px-10`)과 내부 콘텐츠 크기(스코어 폰트 등)는 그대로 — "대폭 줄일" 예고의 1차 단계.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `py-2`를 `py-8`로 되돌리면 됨.

---

## 2026-08-04 — GameDateStrip 경기 셀: 약어 텍스트 색상을 팀 컬러 → 승/패(흰색/slate) 기준으로 변경

**배경**: "팀 텍스트 컬러 말고, 이긴 팀은 흰색, 진 팀은 약간 어두운 slate 색 적용해봐" — 바로 위 항목에서 약어 텍스트에 적용한 팀 컬러(`team?.color_primary`) 대신, 스코어 숫자에 이미 적용돼 있던 승/패 색상 규칙(`won ? 흰색 : slate-500`)을 약어 텍스트에도 동일하게 적용.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`(`StripTeamRow` 컴포넌트) — client, UI 전용, 서버 미러 없음.

**Before**: `style={{ color: team?.color_primary ?? '#94a3b8' }}` (팀 고유 컬러)
**After**: `className={... ${won ? 'text-white' : 'text-slate-500'}}` (스코어와 동일한 승/패 색 규칙 — `won`은 이미 `StripTeamRow`에 prop으로 넘어오던 값을 그대로 재사용, `state === 'final'`일 때만 계산되므로 진행 전/중 경기는 두 팀 다 `text-slate-500`으로 중립 표시).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `className`의 `won` 삼항을 제거하고 `style={{ color: team?.color_primary ?? '#94a3b8' }}`로 되돌리면 됨.

---

## 2026-08-04 — GameDateStrip 경기 셀: 컬러 배지 대신 팀 컬러 약어 텍스트만, 스코어와 폰트 크기 통일

**배경**: "상단의 경기 셀 디자인을 바꿀게. 팀의 로고가 아니라 약어만 표시해줘. 폰트 사이즈는 스코어랑 동일하게 처리해주면 돼." — 실제로 이미지/로고를 쓴 적은 없고 컬러 배경 박스(배지) 안에 약어를 넣은 형태였는데, 사용자는 그 컬러 박스를 "로고"처럼 인식해서 없애고 싶어함.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`(`StripTeamRow` 컴포넌트) — client, UI 전용, 서버 미러 없음.

**Before**:
```tsx
<div
    className="w-9 h-5 rounded-sm text-xs font-black flex items-center justify-center shrink-0"
    style={{ backgroundColor: team?.color_primary ?? '#334155', color: team?.color_text ?? getReadableTextColor(...) }}
>
    {abbr}
</div>
```

**After**:
```tsx
<span className="text-sm font-black tabular-nums truncate" style={{ color: team?.color_primary ?? '#94a3b8' }}>
    {abbr}
</span>
```
컬러 배경 박스(배지) 제거 → 팀 컬러로 물들인 텍스트만 남김. 폰트 크기를 스코어와 동일한 `text-sm`(14px)으로 맞춤(기존 배지 안 텍스트는 `text-xs`였음).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음(`getReadableTextColor` import는 파일 내 다른 곳에서 계속 쓰여 정리 불필요 확인). UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `StripTeamRow`를 Before 블록으로 되돌리면 됨.

---

## 2026-08-04 — GameDateStrip 달력: 클릭 좌표 대신 날짜 버튼에 여백 없이 고정 + 코너 라디우스 제거

**배경**: 바로 위 항목(클릭 좌표에 표시)에서 사용자가 표시 방식을 다시 바꿔달라고 요청 — "데이트피커 표시 영역을 바꿀게. 어딜 클릭해도 날짜선택영역 바로 좌측 하단에 여백없이 붙도록 해주고, 데이트피커의 코너 라디우스도 없애줘."

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`(`GameDateStrip` 컴포넌트) — client, UI 전용, 서버 미러 없음.

**변경 내용**:
1. **위치 기준 변경**: `e.clientX`/`e.clientY`(클릭 좌표) 대신 `e.currentTarget.getBoundingClientRect()`(날짜 버튼 자신의 위치)를 써서, 버튼 안 어디를 클릭해도 항상 그 버튼의 좌측 하단 모서리(`rect.left`, `rect.bottom`)에 고정.
2. **여백 제거**: `style={{ left: menuPos.x, top: menuPos.y + 12 }}`의 `+ 12`(12px 간격) 제거 → `top: menuPos.y` 그대로, 날짜 버튼 바로 아래 여백 없이 붙음.
3. **코너 라디우스 제거**: 달력 패널 className에서 `rounded-lg` 제거.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `getBoundingClientRect()` 대신 `e.clientX`/`e.clientY`로, `top: menuPos.y`를 `top: menuPos.y + 12`로, className에 `rounded-lg`를 다시 추가하면 됨.

---

## 2026-08-04 — GameDateStrip 달력: 클릭 위치에 표시 + 클릭 영역 확대 + 연도/월일 텍스트 통일

**배경**: "데이트피커가 표시되는 위치가 마우스가 클릭된 위치에 표시되도록 해줘. 그리고 드랍다운 영역이 날짜 텍스트에만 잡히지 않고, 날짜 컨테이너 전체에 잡히도록 해줘. 그리고 년도 텍스트가 지금 월/일 텍스트보다 작은데, 동일한 크기와 밝기, 굵기를 일치시켜줘"

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`(`GameDateStrip` 컴포넌트) — client, UI 전용, 서버 미러 없음.

**변경 내용**:
1. **클릭 위치에 표시**: 기존엔 달력이 `absolute top-full left-0`로 날짜 셀렉터 컨테이너 기준 고정 위치에만 펼쳐졌음. 버튼 `onClick`에서 `e.clientX`/`e.clientY`를 `menuPos` state에 저장하고, 달력 패널을 `position: fixed` + `style={{ left: menuPos.x, top: menuPos.y + 12 }}`로 바꿔 클릭한 지점 바로 아래에서 펼쳐지도록 변경.
2. **클릭 영역 확대**: 날짜 버튼의 패딩을 `px-1`(텍스트만 겨우 감싸는 크기) → `px-3 py-2`로 넉넉하게 키워서, 눈에 보이는 박스 전체가 클릭 가능한 영역이 되도록 함.
3. **연도/월일 텍스트 통일**: "연도"(`text-xs font-bold text-slate-500`, 12px·세미볼드·회색)와 "월.일"(`text-sm font-black text-white`, 14px·블랙·흰색)이 서로 다른 크기/밝기/굵기였음 → 둘 다 `text-sm font-black text-white`로 통일.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**주의사항 / 한계**: `position: fixed` 좌표를 뷰포트 경계로 클램핑하지 않음 — 날짜 버튼이 항상 화면 좌측에 있어 폭 288px(`w-72`) 달력이 오른쪽으로 펼쳐져도 대부분 화면 안에 들어오는 걸 전제로 함(아주 좁은 화면에서는 잘릴 수 있음).

**롤백 방법**: 달력 패널을 `absolute top-full left-0`로, 버튼 패딩을 `px-1`로, 연도 span을 `text-xs font-bold text-slate-500`로 되돌리고 `menuPos` state 제거하면 됨.

---

## 2026-08-04 — GameDateStrip 드롭다운 미표시/폰트 수정 + 월간 달력 피커로 교체

**배경**: 두 차례의 후속 요청. (1) "드랍다운이 표시되지 않아. 그리고 폰트가 너무 작아. 12-13px를 보장할 수 있는 클래스 지정해" → 원인 진단 후 수정. (2) 사용자가 ESPN 스타일 월간 달력 스크린샷을 첨부하며 "이런 식의 데이트피커를 넣어주고 경기 있는 날짜만 선택 가능하게 해. 달력 라이브러리를 써도 괜찮아" → 기존 리스트형 드롭다운을 직접 구현한 월간 달력 그리드로 교체(외부 라이브러리 없이 순수 Tailwind로 구현 — 이 프로젝트에 캘린더 라이브러리가 없었고, 요구사항이 간단한 월 그리드+비활성화 정도라 신규 의존성 추가보다 기존 다크 테마에 그대로 맞는 자체 구현이 더 가볍고 일관적이라 판단).

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`(`GameDateStrip` 컴포넌트) — client, UI 전용, 서버 미러 없음.

**1) 드롭다운 미표시 원인**: `GameDateStrip`의 바깥 컨테이너(`<div className="shrink-0 flex items-stretch bg-slate-950 border-b border-slate-800 h-[76px] overflow-hidden">`)에 `overflow-hidden`이 걸려 있어서, `position: absolute`로 그 아래(`top-full`)에 펼쳐지는 드롭다운이 76px 높이 바깥으로 나가는 순간 그대로 잘려서 안 보였음. `overflow-hidden` 제거로 해결(경기 카드 가로 스크롤은 그 안쪽 별도 `<div>`가 자체 `overflow-x-auto`를 갖고 있어 영향 없음).

**2) 폰트 크기**: `text-[9px]`/`text-[10px]` 전부 `text-xs`(12px, Tailwind 최소 보장 단위)로 교체 — 연도 라벨, 상태 라벨(예정/LIVE/종료), 팀 약어 배지(배지 자체도 `w-7 h-4`→`w-9 h-5`로 살짝 키워 텍스트가 안 잘리게 함), 드롭다운 항목의 경기 수 표기 전부.

**3) 월간 달력 피커**: 기존 "날짜가 있는 항목을 세로로 나열한 리스트" 드롭다운을 `<` `월 년도` `>` 헤더 + 일~토 요일 라벨 + 날짜 그리드로 완전히 교체.
- `viewYM` state([연도, 0-index 월])로 달력이 보여주는 달을 선택된 날짜와 독립적으로 관리 — 드롭다운을 열 때마다 현재 선택된 날짜의 달로 초기화, 화살표로 다른 달 미리보기 가능(달 이동은 선택을 바꾸지 않음).
- `gameDateSet`(`Set<string>`, `dateKeys`로부터 생성)으로 각 날짜 셀이 "경기가 있는 날"인지 판정 — **경기가 없는 날짜는 `disabled`로 클릭 불가 + 흐린 텍스트**(`text-slate-700 cursor-not-allowed`), 경기가 있는 날짜만 클릭 가능(`hover:bg-slate-800`), 현재 선택된 날짜는 인디고 배경+링으로 강조.
- 달력 그리드 생성 로직은 순수 JS `Date`(`new Date(vy, vm, 1).getDay()`로 그 달 1일의 요일, `new Date(vy, vm+1, 0).getDate()`로 그 달의 총 일수)로 계산 — 외부 라이브러리 없이 필요한 부분만 직접 구현.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 바깥 컨테이너에 `overflow-hidden` 재추가, `text-xs`로 바꾼 것들을 원래 픽셀 크기로, 달력 그리드 렌더 블록을 이전의 날짜 리스트 드롭다운으로 되돌리고 `viewYM`/`gameDateSet` state 제거하면 됨.

---

## 2026-08-04 — GameDateStrip 날짜 셀렉터 리디자인: "2026 / 8.3" 2줄 포맷 + 드롭다운 + 폭 축소

**배경**: "우선 날짜 셀렉터 디자인부터 손보자. 8월 3일 포맷이 아닌 2026\n8.3 식으로 손보자. 그리고 날짜는 드랍다운 기능도 지원하도록 수정. 그리고 날짜 셀렉터 영역의 너비를 줄여줘"

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`(`GameDateStrip` 컴포넌트) — client, UI 전용, 서버 미러 없음.

**변경 내용**:
1. **포맷**: 기존엔 `activeGroup.label`(예: "8월 3일 (월)") 문자열을 `split('(')`로 파싱해서 요일/날짜 2줄로 표시했음 → `activeDateKey`(`YYYY-MM-DD`)에서 연/월/일을 직접 뽑아 `연도`(9px 회색) / `M.D`(14px 흰색 볼드) 2줄로 교체.
2. **드롭다운**: 날짜 표시 버튼 클릭 시 경기가 있는 전체 날짜 목록(`groupedByDay`)을 드롭다운으로 펼쳐 바로 선택 가능(각 항목에 "N경기" 개수 표시, 현재 선택된 날짜는 인디고로 강조). `Sidebar.tsx`의 프로필 드롭다운과 동일한 패턴(바깥 클릭 시 자동 닫힘, `useRef`+`mousedown` 리스너)으로 구현.
3. **폭 축소**: 좌우 화살표 버튼 `p-1`→`p-0.5`(아이콘도 18→16), 전체 컨테이너 `px-3 gap-1`→`px-1.5 gap-0.5`, 날짜 표시 박스 고정폭 `w-16` 제거(내용에 맞춰 자동 축소).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 날짜 셀렉터 JSX 블록을 이전 버전(라벨 문자열 파싱 + 화살표만, 드롭다운 없음)으로 되돌리고 `isDateMenuOpen`/`dateMenuRef`/`activeYear`/`activeMonth`/`activeDay` 관련 state·이펙트를 제거하면 됨.

---

## 2026-08-04 — 경기결과 화면 최상단에 날짜 셀렉터 + 리그 전체 경기 스트립(ESPN 스코어보드 스타일) 신규 추가

**배경**: "경기 종료 화면의 상단에 날짜셀렉터 및 날짜에 따른 경기를 바로갈 수 있는 섹션을 추가하고 싶음"이라는 요청(ESPN 스코어보드 스트립 스크린샷 첨부). 구현 전 가능성부터 조사 — 필요한 데이터/훅이 대부분 이미 있음을 확인 후 진행.

**가능성 조사 결과**:
- 리그 전체 일정: `useSeasonContext().schedule`(Game[], 최종 스코어 baked-in)에 이미 시즌 전체가 로드돼 있음 — `game_pbp`(무거운 PBP 로그 테이블) 조회 불필요.
- 라이브 스코어: `fetchLiveGamesSummary()`(`services/multi/liveGameService.ts`)가 이미 가벼운 서버 엔드포인트로 제공.
- 라우팅: `/multi/leagues/:leagueId/season/game/:gameId` + `useGameShortCodes()`의 `getGameUrlId()`로 이미 확립된 패턴.
- 팀 정보: `useLeagueContext().leagueTeams`(약어/컬러) 그대로 재사용 가능.
- 날짜 그룹핑/포맷: `MultiScheduleView.tsx`에 로컬(비export) 함수로 이미 구현돼 있었으나 재사용을 위해 공용화 필요.

**변경/신규 파일**:
- **신규**: `views/multi/season/multiScheduleUtils.ts` — `MultiScheduleView.tsx`에 있던 `fmtDayLabel`/`kstDateKey`(KST 자정 보정 로직 포함)/`fmtDateShort`/`fmtTime`/`groupByDay`/`DayGroup`을 이 파일로 이동해 공용화.
- **변경**: `views/multi/season/MultiScheduleView.tsx` — 위 함수들의 로컬 정의 제거, `multiScheduleUtils.ts`에서 import로 교체(동작 변화 없음, 순수 리팩터).
- **변경**: `views/multi/season/MultiGamePbpView.tsx` — 신규 `GameDateStrip` 컴포넌트 추가 + 최상단(스코어버그 헤더 위)에 배치.

**`GameDateStrip` 동작**:
- 좌측: `<`/`>` 화살표로 날짜 이동(경기가 있는 날짜끼리만 이동, "월 D일 (요일)" 라벨을 요일/날짜 2줄로 표시) + 초기 선택은 현재 보고 있는 경기의 날짜.
- 우측: 선택된 날짜의 리그 전체 경기를 가로 스크롤 카드로 나열 — 카드당 상태 라벨(예정/LIVE Q+시계/종료) + 원정·홈 팀 약어 배지 + 스코어. 현재 보고 있는 경기 카드는 인디고 링으로 하이라이트, 클릭 시 다른 경기는 `navigate()`로 즉시 이동.
- `MultiScheduleView.tsx`와 동일하게 플레이오프 시리즈 미확정 매치업은 `computeRevealedSeries`로 걸러 스포일러 차단.
- 라이브 스코어는 5초 폴링(`fetchLiveGamesSummary`), `roomId`가 없으면(방 미확정) 폴링 안 함.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 세 파일 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**주의사항 / 한계**:
- "내 팀 경기" 하이라이트(`MultiScheduleView`의 에메랄드 배경)는 이번 스트립에는 넣지 않음 — 필요하면 `myTeamId`를 `useSeasonContext()`에서 추가로 꺼내 `GameDateStrip`에 prop으로 넘기면 됨.
- 영문 "TUE JAN 13" 포맷 대신 프로젝트 기존 한글 컨벤션("월 D일 (요일)")을 그대로 씀 — 첨부 이미지의 정확한 영문 포맷은 아님.

**롤백 방법**: `MultiGamePbpView.tsx`에서 `GameDateStrip` 컴포넌트 정의 + 최상단 호출부 제거, `MultiGamePbpView.tsx`/`MultiScheduleView.tsx`의 import를 되돌리고 `multiScheduleUtils.ts`의 함수들을 `MultiScheduleView.tsx`에 도로 복사하면 됨(`multiScheduleUtils.ts` 파일 자체는 삭제 가능).

---

## 2026-08-04 — 사이드 내비게이션(싱글/멀티) zinc 팔레트 → slate 팔레트 통일

**배경**: "사이드 내비게이션이 현재 뉴트럴블랙일텐데, 이것도 slate 컬러 스타일로 통일시켜"라는 요청. 조사 결과 사이드바는 리터럴 `neutral-*`가 아니라 **`zinc-*`** Tailwind 클래스와, `tailwind.config.js`에 zinc hex값으로 정의된 커스텀 테마 토큰(`bg-surface-sidebar`=zinc-900, `bg-surface-elevated`=zinc-800, `bg-surface-hover`=zinc-600, `bg-border-dim`=zinc-800, `border-border-default`=zinc-700)을 섞어 쓰고 있었음.

**스코프 결정**: 이 토큰들은 사이드바 외에 `UpdateToast.tsx`/`AuthInput.tsx`/`OtpInput.tsx`/`DashboardHeader.tsx`/`GlobalSearch.tsx`/`AuthView.tsx` 등에서도 공유되므로, `tailwind.config.js`의 토큰 값 자체를 바꾸면 사이드바 외 컴포넌트 색상까지 의도치 않게 바뀜 — 요청 범위가 "사이드 내비게이션"이므로 config는 건드리지 않고, 사이드바 두 파일에서만 토큰 클래스/리터럴 zinc 클래스를 슬레이트 리터럴로 직접 교체.

**변경 파일**: `components/Sidebar.tsx`(싱글), `components/MultiSidebar.tsx`(멀티) — 둘 다 client, UI 전용, 서버 미러 없음.

**매핑**(같은 명암 단계 번호를 그대로 유지하는 1:1 치환 — zinc와 slate는 Tailwind에서 같은 번호가 거의 동일한 명도를 갖고 색상 계열만 다름):
- `zinc-700/600/500/400/300` → `slate-700/600/500/400/300` (리터럴 전부)
- `bg-surface-sidebar`(zinc-900) → `bg-slate-900` (사이드바 본체 배경)
- `border-border-default`(zinc-700) → `border-slate-700` (사이드바 우측 테두리, 드롭다운 테두리)
- `bg-surface-elevated`(zinc-800) → `bg-slate-800` (프로필 드롭다운 패널)
- `bg-surface-hover`(zinc-600) → `bg-slate-600` (메뉴 항목 호버 배경)
- `bg-border-dim`(zinc-800) → `bg-slate-800` (사이드바 내 구분선)

두 파일 다 `sed`로 일괄 치환(패턴이 완전히 동일).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 두 파일 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**주의사항 / 한계**: `tailwind.config.js`의 `surface-*`/`border-*` 토큰 정의 자체는 그대로 두었으므로, 이 토큰을 쓰는 다른 화면(토스트/인증 입력창/대시보드 헤더/검색 등)은 여전히 zinc 색상 그대로임 — 요청 범위 밖이라 손대지 않음. 앱 전체를 slate로 통일하고 싶으면 별도 요청 필요.

**롤백 방법**: 두 파일에서 `slate-*` → `zinc-*`(같은 번호), `bg-slate-900`→`bg-surface-sidebar`, `border-slate-700`→`border-border-default`, `bg-slate-800`→`bg-surface-elevated`/`bg-border-dim`(문맥에 따라), `bg-slate-600`→`bg-surface-hover`로 되돌리면 됨.

---

## 2026-08-04 — 경기결과 화면 헤더 중앙 섹션 + 탭바 배경을 slate-950으로 변경

**배경**: "멀티플레이어 경기결과 화면의 헤더 가운데 섹션과 탭바 영역을 slate-950으로 변경해봐"라는 요청.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**1) 헤더 중앙 섹션**: 스코어버그 헤더는 좌:중:우 = 4:3:4 그리드로, 좌/우는 팀 컬러 단색 오버레이(`absolute` 레이어)가 채워지고 중앙 3fr은 기존엔 별도 배경 없이 부모의 `bg-slate-900`이 그대로 노출됐음. 좌/우 오버레이와 동일한 패턴(`absolute inset-y-0`)으로 중앙 3fr 폭(`calc(400%/11)` 지점부터 `calc(300%/11)` 너비)만큼 `bg-slate-950` 오버레이를 추가.
```tsx
<div className="absolute inset-y-0 bg-slate-950 pointer-events-none" style={{ left: 'calc(400% / 11)', width: 'calc(300% / 11)' }} />
```

**2) 탭바**: `bg-slate-900` → `bg-slate-950`로 단순 교체(박스스코어/샷차트/경기기록/로테이션/인사이트/온오프 탭 라벨이 있는 바).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 헤더의 중앙 오버레이 `<div>` 제거, 탭바의 `bg-slate-950`을 `bg-slate-900`으로 되돌리면 됨.

---

## 2026-08-04 — [엔진] PBP 로그에 "경기 종료" 종료 배너 추가

**배경**: "경기 종료 후 박스스코어 화면에서 PBP 로그의 마지막에 경기 종료 로그가 안뜨는데 이유가 뭐지?" 질문 → 조사 결과 `_handleGameEnd()`가 "경기 시작 (Tip-off)"에 대응하는 종료 로그를 아예 생성하지 않고 있었음(진짜 버그, 렌더링 문제 아님). `stepPossession()`에서 `quarter > 4`가 되면 "N쿼터 시작" 로그를 push하는 코드(quarter<=4 분기)에 도달하기 전에 곧장 `_handleGameEnd()`로 분기해버려서, 승부가 이미 갈린 일반적인 종료 케이스엔 로그가 하나도 안 남았음(동점 버저비터 케이스만 예외적으로 로그가 생김).

**변경 파일**:
- `services/game/engine/pbp/liveEngine.ts` (client) — `_handleGameEnd()`
- `server/src/shared/engine/pbp/liveEngine.ts` (server 미러)

**Before**:
```ts
// Rotation History 닫기
const GAME_END_SEC = 48 * 60;
[state.home, state.away].forEach(team => {
    team.onCourt.forEach(p => {
        const hist = state.rotationHistory[p.playerId];
        if (hist && hist.length > 0) hist[hist.length - 1].out = GAME_END_SEC;
    });
});

const newLogs = state.logs.slice(logsBefore);
```

**After**:
```ts
// Rotation History 닫기
const GAME_END_SEC = 48 * 60;
[state.home, state.away].forEach(team => {
    team.onCourt.forEach(p => {
        const hist = state.rotationHistory[p.playerId];
        if (hist && hist.length > 0) hist[hist.length - 1].out = GAME_END_SEC;
    });
});

// '경기 시작 (Tip-off)'과 대칭되는 종료 배너
state.logs.push({
    quarter: state.quarter,
    timeRemaining: '0:00',
    teamId: 'SYSTEM',
    text: '경기 종료 (Final)',
    type: 'info',
});

const newLogs = state.logs.slice(logsBefore);
```

**동작 방식**: 동점 버저비터 처리(있으면)와 로테이션 히스토리 마감 이후, `newLogs` 슬라이스 이전에 push하므로 (1) 항상 PBP 로그의 진짜 마지막 항목이 되고 (2) 뒤이어 실행되는 `homeScore`/`awayScore` 스탬프 로직에도 포함되어 최종 스코어가 정확히 찍힘. `teamId: 'SYSTEM'`이라 `GamePbpTab.tsx`의 `isFlowEvent = log.teamId === 'SYSTEM'` 판정에 걸려 기존 쿼터 시작 배너와 동일하게 amber 톤으로 렌더링됨(별도 UI 작업 불필요).

**검증**: `npx tsc --noEmit -p tscheck.json`(client), `cd server && npx tsc --noEmit`(server) 둘 다 liveEngine 관련 에러 없음.

**주의사항**: 이 변경은 서버(Fly.io) 실행 코드도 포함하므로, 멀티플레이어에 반영하려면 재배포 필요.

**롤백 방법**: 양쪽 파일에서 추가한 `state.logs.push({...'경기 종료 (Final)'...})` 블록만 제거하면 됨.

---

## 2026-08-04 — 멀티플레이어 결과 화면: 6개 섹션 헤더(인사이트/박스스코어 등) bg-indigo-800 → bg-slate-700

**배경**: 가운데 헤더/탭바 색상 방향을 논의하며 "제3의 색을 더하기보다 무채색 유지"를 추천했고, 사용자가 섹션 헤더(인사이트/박스스코어/경기 기록/샷차트/로테이션/온오프 6개, 전부 동일 `bg-indigo-800` 사용 중)를 `slate-700`으로 바꿔달라 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — 6개 섹션 헤더 `<div>` 전부 `bg-indigo-800` → `bg-slate-700` (line 1997/2019/2037/2051/2066/2084)

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**롤백 방법**: `bg-slate-700` → `bg-indigo-800`로 되돌리면 됨.

---

## 2026-08-04 — 멀티플레이어 경기 헤더: 약어/팀명/스코어 간격 gap-4(16px) → gap-5(20px)

**배경**: 헤더의 약어·팀명+전적·스코어가 한 flex 컨테이너의 직계 자식이라 간격이 전부 `gap-4`(16px)로 통일 적용돼 있었음. "gap-5를 적용해봐" 요청으로 20px로 조정.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — away/home 섹션 루트 flex div 2곳, `gap-4` → `gap-5`

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**롤백 방법**: `gap-5` → `gap-4`로 되돌리면 됨.

---

## 2026-08-04 — 멀티플레이어 경기 헤더: 로고 배지 제거, 팀 약어를 text-5xl(48px) 텍스트로 교체

**배경**: 바로 위 항목에서 좌/우 섹션 전체 배경이 이미 팀 메인컬러가 됨 → 그 안의 작은 컬러 배지(`w-11 h-11` 정사각형에 약어)가 더 이상 의미 없어짐. "로고는 삭제하고, 팀 약어를 큰 텍스트로(30px쯤) 넣어줘" 요청 — 처음엔 Tailwind 기본 스케일에서 정확히 30px인 `text-3xl`(1.875rem) 적용했으나, "좀 더 커야할듯? 50px" 요청에 50px 정확 대응 클래스는 없어 가장 가까운 표준 클래스 `text-5xl`(48px)로 재조정.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx`

**Before** (away/home 동일 패턴):
```tsx
<div className="w-11 h-11 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
    style={{ backgroundColor: awayColor, color: awayText }}>{awayAbbr.slice(0, 3)}</div>
```

**After**:
```tsx
<span className="text-5xl font-black uppercase tracking-tight shrink-0">{awayAbbr.slice(0, 3)}</span>
```
(색상은 부모 `<div style={{ color: awayText }}>`에서 상속받음 — home 쪽도 동일하게 `homeText` 상속.)

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**롤백 방법**: `<span>` 2개를 원래의 `w-11 h-11` 컬러 배지 `<div>`로 되돌리면 됨.

---

## 2026-08-04 — 멀티플레이어 경기 헤더: 4:3:4 컬럼 + 좌/우 팀 메인컬러 단색 배경으로 교체

**배경**: "헤더 부분을 4:3:4 비율로 나누고, 좌/우측에는 그라데이션이 아니라 팀 메인컬러를 배경색으로 지정해줘" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx`

**Before**:
```tsx
<div className="absolute inset-0 pointer-events-none" style={{
    background: `linear-gradient(to right, ${awayColor}60, transparent 30%, transparent 70%, ${homeColor}60)`
}} />
<div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-8 sm:gap-14">
    <div className="flex items-center justify-start gap-4">
        ...
        <span className="text-6xl font-black tabular-nums leading-none text-white shrink-0">{currentScore.away}</span>
    </div>
    ...
    <div className="flex items-center justify-end gap-4">
        <span className="text-6xl font-black tabular-nums leading-none text-white shrink-0">{currentScore.home}</span>
        ...
    </div>
</div>
```

**After**:
```tsx
<div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: 'calc(400% / 11)', backgroundColor: awayColor }} />
<div className="absolute inset-y-0 right-0 pointer-events-none" style={{ width: 'calc(400% / 11)', backgroundColor: homeColor }} />
<div className="relative z-10 grid grid-cols-[4fr_3fr_4fr] items-center gap-8 sm:gap-14">
    <div className="flex items-center justify-start gap-4" style={{ color: awayText }}>
        ...
        <span className="text-6xl font-black tabular-nums leading-none shrink-0" style={{ color: awayText }}>{currentScore.away}</span>
    </div>
    ...
    <div className="flex items-center justify-end gap-4" style={{ color: homeText }}>
        <span className="text-6xl font-black tabular-nums leading-none shrink-0" style={{ color: homeText }}>{currentScore.home}</span>
        ...
    </div>
</div>
```

**동작 방식**: 그라데이션 오버레이(반투명 60-alpha 블렌드) 대신, 헤더 높이 전체(`inset-y-0`)를 덮는 절대배치 단색 블록 2개를 좌/우에 각각 `calc(400% / 11)`(= 4/11 ≈ 36.36%, 그리드의 `4fr` 트랙과 동일 비율) 폭으로 배치 — 그리드 컬럼 경계와 정확히 일치하는 하드엣지 컬러 블록이 됨. 중앙 3fr(≈27.27%)은 배경 없이 `bg-slate-900` 그대로 노출.
단색 배경이 그라데이션보다 훨씬 진해져서, 팀명·스코어에 걸려있던 `text-white` 고정 클래스를 배지와 동일한 대비색(`awayText`/`homeText`, 바로 위 항목에서 신설한 `color_text`)으로 교체 — 그렇지 않으면 흰색/밝은 메인컬러 팀(bkn, sa 등)에서 다시 흰 글씨 위 흰 배경 문제가 재현되기 때문.

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**롤백 방법**: 두 absolute 단색 배경 div를 원래의 단일 gradient div로 되돌리고, `grid-cols-[4fr_3fr_4fr]`→`grid-cols-[1fr_auto_1fr]`, 팀명/스코어의 `style={{ color: ... }}`를 제거하고 스코어 span에 `text-white` 클래스를 복원하면 됨.

---

## 2026-08-04 — 멀티플레이어 경기 헤더: 팀명 아래 시즌 전적(W-L) 표시 추가

**배경**: "경기 결과 화면의 헤더를 수정할게. 팀 이름 아래에 0W 0L 표기를 해줘" 요청 — 대상은 멀티플레이어 경기 헤더(`MultiGamePbpView.tsx` 스코어버그)로 확인 후 진행.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx`

**After (신규 로직)**:
```tsx
import { useSeasonContext } from './seasonContext';
import { computeWL } from './multiSeasonUtils';
...
const { schedule } = useSeasonContext();
...
const wl = useMemo(() => {
    const slugs = [gameData?.home_team_id, gameData?.away_team_id].filter((s): s is string => !!s);
    return computeWL(schedule, slugs, serverNow);
}, [schedule, gameData?.home_team_id, gameData?.away_team_id, serverNow]);
const homeWL = gameData ? wl[gameData.home_team_id] : undefined;
const awayWL = gameData ? wl[gameData.away_team_id] : undefined;
```
팀명 span 바로 아래에 `{awayWL.wins}W {awayWL.losses}L` / `{homeWL.wins}W {homeWL.losses}L` 렌더링. 스타일은 `text-base font-bold tabular-nums` + `color: awayText`/`homeText`(팀 배지용 텍스트 컬러, 바로 위 항목에서 신설한 `color_text` 필드) — 처음엔 회색(`text-slate-500`)으로 넣었다가 "안 보인다"는 피드백에 팀 텍스트 컬러 적용 + `text-xs`→`text-[15px]`→`text-base`로 조정.

`computeWL()`(`multiSeasonUtils.ts`, 기존 함수 재사용)은 `schedule`에서 `isFinal()`(리플레이 10분 공개 지연 반영) 처리된 경기만 집계 — 이미 홈 화면(`MultiHeader.tsx`)/순위표에서 쓰던 것과 동일 기준이라 값이 서로 어긋나지 않음.

**검증**: `npx tsc --noEmit -p tscheck.json` MultiGamePbpView 관련 에러 없음.

**주의사항**: `color_text`가 어두운 팀(현재 `ind` #002D62, `sa` #010101, `bkn` #000000, `lam` #31006F)은 이 헤더의 어두운 배경(`bg-slate-900`) 위에서 W-L 텍스트가 잘 안 보일 수 있음 — `color_text`는 원래 밝은 배지 배경 위 대비용으로 설계된 값이라, 어두운 페이지 배경에 그대로 쓰면 반대로 저대비가 될 수 있는 팀들이 있음. 사용자가 명시적으로 "팀 텍스트 컬러 적용"을 요청해 그대로 반영했으나, 해당 4팀에서 실제로 안 보이면 후속 조정 필요.

**롤백 방법**: `useSeasonContext`/`computeWL` import와 `wl`/`homeWL`/`awayWL` 블록, 팀명 span 아래 W-L `<span>` 2개를 제거하면 이전 상태로 복귀.

---

## 2026-08-04 — 멀티플레이어 팀 배지 글자색(color_text) 신설 — colorSecondary/고정흰색 오용 버그 수정

**배경**: 멀티플레이어 스케줄 화면 스크린샷에서 브루클린(BKN) 배지 글자가 아예 안 보이는 게 발견됨. 원인 조사 결과 여러 배지 렌더링 컴포넌트가 `TEAM_COLORS.text` 같은 전용 텍스트 컬러 없이 `colorSecondary`를 그대로 글자색으로 쓰거나(`color: colorSecondary`), 아예 흰색을 하드코딩(`color: '#fff'`)하고 있었음 — 브루클린처럼 primary=secondary=흰색인 팀은 흰 배경에 흰 글씨로 완전히 안 보이는 버그. 사용자가 "1번(DB에 컬럼 추가)"으로 진행 지시.

**변경 파일 (DB)**:
- Supabase(`buummihpewiaeltywdff`) `league_teams` 테이블에 `color_text text` 컬럼 추가
- `room_members` 테이블에 `team_color_text text` 컬럼 추가
- `initialize_league_teams(p_room_id, p_teams)` 함수: INSERT 컬럼에 `color_text` 추가
- `update_team_profile(...)` 함수: 파라미터에 `p_color_text` 추가(기존 6-arg 시그니처는 DROP, 7-arg로 교체)
- 기존 832개 `league_teams` row 전부 백필: 실제 NBA 30팀은 `data/teamData.ts`의 `TEAM_COLORS.text` 값 그대로, 가상 확장팀 34개는 전부 `#FFFFFF`(단 `knx`만 원색이 밝아서 `#101820`) — `room_members.team_color_text`도 동일 규칙으로 백필

**변경 파일 (server)**:
- `server/src/startDraft.ts`: AI 슬롯 채울 때 `league_teams.color_text` → `room_members.team_color_text` 복사 추가 (select 컬럼 목록에도 추가)
- `server/src/shared/tournamentInitializer.ts`: `LeagueTeamRow` 인라인 타입에 `color_text: string` 추가

**변경 파일 (client — 신규)**:
- `utils/colorContrast.ts` (신규): `getReadableTextColor(bg)` — WCAG 상대 명도 기준으로 흰/검 중 더 잘 보이는 색 반환(colorText 미전파 구간의 안전망 폴백), `contrastRatio(a,b)` — 대비율 계산(TeamSetupModal 경고용)

**변경 파일 (client — 기존 수정)**:
- `services/multi/leagueService.ts`: `SetMemberTeamParams`/`setMemberTeam()`에 `colorText` 추가(room_members update), `updateTeamProfile()` 7번째 인자로 `colorText` 추가, 팀 생성/확장(`initializeLeagueTeams`, 팀 수 늘리기 로직) 시 `TEAM_DATA`/`VIRTUAL_TEAMS`의 `color_text`를 `league_teams.color_text`로 같이 insert
- `data/virtualTeams.ts`: `VirtualTeamTemplate`에 `color_text` 필드 추가, 34개 팀 전부 값 채움
- `types/team.ts`(`Team.colorText?`), `types/multiDraft.ts`(`RoomTeamMeta.colorText`), `services/multi/roomQueries.ts`(`RoomMemberRow.team_color_text`, `LeagueTeamRow.color_text`) 타입 추가
- `views/multi/league/MultiDraftView.tsx`: `RoomTeamMetaMap` 빌드 시 `colorText: t.color_text` 매핑 추가
- `components/draft/teamMetaLookup.ts`: `resolveTeamDisplay()`의 커스텀 팀 `textColor: '#FFFFFF'` 하드코딩 → `custom.colorText`로 교체
- `components/draft/DraftHeader.tsx`: 팀 워터마크 2곳 `color: '#fff'`/`'#ffffff'` 하드코딩 → `displayDisplay.textColor`/`currentDisplay.textColor`
- `components/common/TeamBadge.tsx`: `colorText` prop 추가, `color: colorSecondary ?? '#fff'` → `color: colorText ?? getReadableTextColor(colorPrimary)`. 호출부(`TournamentBracketView.tsx` 4곳)에 `colorText={...}` 전달 추가
- `components/MultiHeader.tsx`: `OpponentBadge`(2개 호출부) + "내 팀" 배지, 전부 `colorSecondary`/고정 흰색 → `colorText ?? getReadableTextColor(...)`
- `views/multi/season/MultiScheduleView.tsx`: `TeamCell`의 `colorSecondary` prop → `colorText` prop으로 교체(안전망 폴백 포함)
- `pages/MultiSeasonPage.tsx`: "다음 경기" 상대팀 배지 `color: nextOpp.color_secondary` → `nextOpp.color_text ?? getReadableTextColor(...)`
- `views/multi/season/MultiGamePbpView.tsx`: `homeText`/`awayText`가 `color_secondary` 참조하던 것 → `color_text ?? getReadableTextColor(...)`
- `views/multi/league/LeagueLobbyView.tsx`: "내 팀" 알림 배지 + 팀 목록 테이블 배지 고정 흰색 → `team.color_text ?? getReadableTextColor(...)`. `TeamSetupModal` 연결부(`initial`/`saveOverride`)에 `colorText` 전달 추가
- `views/multi/league/LeagueSettingsView.tsx`: 드래프트 오더 리스트 + 팀 목록 테이블 배지 고정 흰색 → `t.color_text ?? getReadableTextColor(...)`
- `components/multi/TeamSetupModal.tsx`: `colorPrimary`/`colorSecondary`에 이어 3번째 색상 피커 `Text (배지 글자색)` 추가, 미리보기도 실제 텍스트 색 반영, `contrastRatio()`로 대비 낮을 시 경고 문구 표시, `handleSave()`가 `colorText`도 검증·전송

**미반영 (의도적, 낮은 우선순위)**: `views/multi/season/MultiGamePbpView.legacy.tsx`는 어디서도 import되지 않는 죽은 코드라 미반영. `LeaderboardTable.tsx`/`LeaderboardToolbar.tsx`/`RosterView.tsx`/`PlayerDetailView.tsx`의 `TeamBadge` 호출부는 `colorText`를 명시적으로 넘기진 않지만 `TeamBadge` 자체의 `getReadableTextColor` 안전망 폴백이 적용되어 안 보이는 글자 버그는 없음(다만 DB의 큐레이션된 값 대신 자동 계산값을 씀).

**검증**: `npx tsc --noEmit -p tscheck.json`(client), `cd server && npx tsc --noEmit`(server) 둘 다 이번 변경 관련 에러 0건(기존부터 있던 무관한 에러들만 남음 — useGameData.ts SavedGame 타입, LeagueSettingsView SimSettings.normalization 등). Supabase SELECT로 `league_teams` 832 row 전부 `color_text` NULL 없음 확인.

**롤백 방법**: 코드는 각 파일을 위 "변경 전" 상태로 되돌리면 됨(git diff 기준). DB는 `ALTER TABLE league_teams DROP COLUMN color_text; ALTER TABLE room_members DROP COLUMN team_color_text;` 후 `update_team_profile`/`initialize_league_teams` 함수를 6-arg/color_text-없는 버전으로 재생성.

---

## 2026-08-04 — 팀 컬러 에디터 아티팩트로 재조정한 7개 팀 컬러 재반영 (bkn/cle/den/gs/min/okc/phi)

**배경**: 바로 위 항목(10개 팀 primary 변경)에서 만든 "팀 컬러 에디터" 아티팩트로 사용자가 직접 색을 추가 조정한 뒤 `TEAM_COLORS` 전체 코드를 붙여넣으며 반영을 요청. 그 중 일부는 직전 변경을 도로 되돌리는 방향(cle/den을 어두운 톤으로 원복, min primary/secondary를 동일값으로 통일)이라 의도된 재조정으로 보고 그대로 반영. gs/okc는 이번에 처음 손댄 팀.

**변경 파일**:
- `data/teamData.ts` (client)
- `server/src/shared/teamData.ts` (server 미러)
- Supabase `league_teams` 테이블 — primary/secondary가 바뀐 6개 팀(bkn/cle/den/min/okc/phi) 소급 UPDATE (gs는 text만 바뀌었고 `league_teams`엔 그 컬럼이 없어 대상 아님)

**Before**:
```ts
'bkn': { primary: '#FFFFFF', secondary: '#CD1041', tertiary: '#C6CFD4', text: '#002A60' },
'cle': { primary: '#FFB81C', secondary: '#6F263D', tertiary: '#002B5C', text: '#6F263D' },
'den': { primary: '#FEC524', secondary: '#8B2131', tertiary: '#0E2240', text: '#0E2240' },
'gs':  { primary: '#1D428A', secondary: '#FDB927', tertiary: '#FFFFFF', text: '#FFFFFF' },
'min': { primary: '#38BDF8', secondary: '#236192', tertiary: '#79BC43', text: '#0C2340' },
'okc': { primary: '#EF3B24', secondary: '#007AC1', tertiary: '#002D62', text: '#FFFFFF' },
'phi': { primary: '#D4AF37', secondary: '#896C4C', tertiary: '#D50032', text: '#000000' },
```

**After**:
```ts
'bkn': { primary: '#FFFFFF', secondary: '#FFFFFF', tertiary: '#C6CFD4', text: '#000000' },
'cle': { primary: '#6F263D', secondary: '#FFB81C', tertiary: '#002B5C', text: '#FFFFFF' },
'den': { primary: '#0E2240', secondary: '#FEC524', tertiary: '#0E2240', text: '#FEC524' },
'gs':  { primary: '#1D428A', secondary: '#FDB927', tertiary: '#FFFFFF', text: '#FDB927' },
'min': { primary: '#236192', secondary: '#236192', tertiary: '#79BC43', text: '#FFFFFF' },
'okc': { primary: '#007AC1', secondary: '#EF3B24', tertiary: '#002D62', text: '#FFFFFF' },
'phi': { primary: '#006BB6', secondary: '#ED174C', tertiary: '#C4CED4', text: '#FFFFFF' },
```

**검증**: `npx tsc --noEmit -p tscheck.json` teamData 관련 에러 없음. `league_teams` UPDATE 후 SELECT로 6개 팀 전 row(24~27개씩) 반영 확인 완료.

**주의사항**: bkn과 min은 이번 변경으로 primary === secondary (각각 흰색/#236192)가 됨 — 두 색을 구분해서 쓰는 UI(예: `TeamSetupModal` 미리보기의 secondary 보더)에서는 시각적 구분이 사라짐. 의도된 변경인지 다음에 확인 필요.

**롤백 방법**: 위 Before 블록으로 양쪽 파일 되돌리고, `league_teams`에 동일 UPDATE를 Before 값으로 재실행.

---

## 2026-08-04 — 로테이션 탭 가로 스크롤바 v2(진짜 원인): 호버 툴팁이 가장자리에서 컨테이너 밖으로 삐져나감

**배경**: 바로 아래 항목(v1)에서 "그리드 자식 min-w-0 누락"으로 진단하고 고쳤으나, 사용자가 "아직도 고쳐지지 않았다"고 재확인. 스크린샷으로 다시 확인 요청하자 사용자가 직접 정확한 원인을 짚어줌: "평상시에는 스크롤바가 안보이는데, 가장자리 쪽에 툴팁이 나타나면 컨테이너가 늘어나서 스크롤바가 생겨."

**진짜 원인**: `RotationChart.tsx`의 `PlayerRow`에서 로테이션 막대에 마우스를 올리면 뜨는 호버 툴팁(시간/+/-/교체사유)이 항상 `left-1/2 -translate-x-1/2`로 막대 중앙 기준 정렬됐음. 막대가 타임라인 오른쪽(또는 왼쪽) 끝 근처에 있으면 `whitespace-nowrap` 툴팁이 그 막대 중심을 기준으로 카드 밖까지 삐져나가고, `position: absolute`인 이 툴팁은 스크롤 가능한 조상(그리드 컬럼의 `overflow-x-auto`, 나아가 상위 `overflow-y-auto` 컨테이너도 스펙상 auto-min-size 규칙에 따라 실질적으로 가로 스크롤도 감지)의 `scrollWidth`를 늘려서 그 순간에만 가로 스크롤바가 나타났던 것 — v1에서 진단한 "그리드 트랙 폭 침범"과는 무관한 별개의 원인(단, v1의 `min-w-0` 자체는 무해하고 정당한 수정이라 그대로 유지).

**변경 파일**: `components/game/RotationChart.tsx` (client, UI 전용 — 서버 미러 없음)

**Before**:
```tsx
{hoverIdx === i && (plusMinus != null || reasonLabel) && (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] font-bold text-white whitespace-nowrap shadow-lg pointer-events-none z-20">
        ...
    </div>
)}
```

**After**:
```tsx
const segCenterPct = startPct + cappedWidth / 2;
const tooltipAnchorClass = segCenterPct > 85
    ? 'right-0'
    : segCenterPct < 15
        ? 'left-0'
        : 'left-1/2 -translate-x-1/2';
...
{hoverIdx === i && (plusMinus != null || reasonLabel) && (
    <div className={`absolute bottom-full ${tooltipAnchorClass} mb-1.5 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] font-bold text-white whitespace-nowrap shadow-lg pointer-events-none z-20`}>
        ...
    </div>
)}
```
막대 중심(`segCenterPct`)이 타임라인 양끝 15% 안쪽이면 중앙정렬 대신 그 막대 자신의 안쪽 가장자리(`right-0`/`left-0`, 막대 wrapper 기준)에 붙임 — 툴팁의 바깥쪽 끝이 막대 wrapper의 경계(최대 100%/최소 0%)를 넘지 않도록 보장.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `RotationChart.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `tooltipAnchorClass` 계산 제거하고 툴팁 className을 `left-1/2 -translate-x-1/2` 고정으로 되돌리면 됨.

---

## 2026-08-04 — 로테이션 탭(멀티 결과화면) 원정/홈 카드 침범으로 인한 불필요한 가로 스크롤바 수정 v1

**배경**: "로테이션 탭에 수평 스크롤바가 생긴다. 한 팀의 로테이션 세션이 다른 팀의 로테이션 세션을 침범하지 않도록 수정이 필요함"이라는 스크린샷 첨부 리포트.

**원인**: `RotationChart.tsx`의 좌우분할(`splitLayout`) 레이아웃이 `grid grid-cols-1 lg:grid-cols-2 gap-0`로 두 카드를 50:50 배치하는데, 각 컬럼(`<div className="overflow-x-auto">`)에 `min-w-0`가 없었음. CSS Grid 자식은 기본적으로 "자동 최소 폭"이 콘텐츠 크기를 따라가서(그리드 트랙의 `1fr` 폭 제약을 무시하고) 콘텐츠가 넓으면 트랙 밖으로 밀고 나감 — 이 세션에서 앞서 다룬 flex의 `min-w-0`/`min-h-0` 이슈와 동일 계열의 CSS Grid 버전. 그 결과 원정/홈 카드가 서로의 영역을 침범하며 전체 폭이 뷰포트를 넘어서 불필요한 가로 스크롤바가 생겼음.

**변경 파일**: `components/game/RotationChart.tsx` (client, UI 전용 — 서버 미러 없음)

**Before**:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
    <div className="overflow-x-auto">{awayCard}</div>
    <div className="overflow-x-auto">{homeCard}</div>
</div>
```

**After**:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
    <div className="min-w-0 overflow-x-auto">{awayCard}</div>
    <div className="min-w-0 overflow-x-auto">{homeCard}</div>
</div>
```
`min-w-0` 클래스만 각 컬럼에 추가 — 그리드 트랙의 50% 폭을 강제로 지키게 해서 카드가 서로를 침범하지 못하게 함(넘치는 내용은 각 컬럼이 이미 갖고 있던 `overflow-x-auto`로 그 컬럼 안에서만 스크롤).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `RotationChart.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 두 컬럼에서 `min-w-0` 클래스만 제거하면 됨.

---

## 2026-08-04 — 팀 컬러(TEAM_COLORS) 10개 팀 primary 색상 변경 (막대그래프 구별용)

**배경**: 멀티플레이어 경기기록 탭의 플레이타입 막대그래프에서 특정 팀들의 primary 컬러(대부분 남색/검정 계열)가 어두운 배경과 잘 구별되지 않는다는 요청. 사용자가 10개 팀에 대해 원하는 메인컬러 계열(노란색/하늘색/회색/빨간색/흰색/금색/주황색)을 직접 지정.
기존 팀 팔레트에 이미 존재하는 secondary/tertiary 값 중 요청 색과 일치하는 게 있으면 primary와 swap(중복 방지 + 팀 정체성 유지), 팔레트에 없는 색(미네소타 하늘색, 필라델피아 금색)만 새 hex 도입. primary가 밝은 색으로 바뀐 팀은 text(배지 글자색, `colors.primary`를 배경으로 쓰는 곳에서 전경색)도 대비를 위해 어둡게 같이 조정 — 기존 값(구 primary 등)을 재사용해 톤을 맞춤.

**변경 파일**:
- `data/teamData.ts` (client) — `TEAM_COLORS` 중 ind/min/sa/den/no/bkn/cle/phx/lam/phi 10개 엔트리
- `server/src/shared/teamData.ts` (server 미러) — 동일 10개 엔트리

**Before** (양쪽 파일 동일):
```ts
'bkn': { primary: '#002A60', secondary: '#CD1041', tertiary: '#C6CFD4', text: '#FFFFFF' },
'cle': { primary: '#6F263D', secondary: '#FFB81C', tertiary: '#002B5C', text: '#FFFFFF' },
'den': { primary: '#0E2240', secondary: '#8B2131', tertiary: '#FEC524', text: '#FFFFFF' },
'ind': { primary: '#002D62', secondary: '#FDBB30', tertiary: '#BEC0C2', text: '#FFFFFF' },
'lam': { primary: '#31006F', secondary: '#FDB927', tertiary: '#010101', text: '#FFFFFF' },
'min': { primary: '#0C2340', secondary: '#236192', tertiary: '#79BC43', text: '#FFFFFF' },
'no':  { primary: '#002B5C', secondary: '#B4975A', tertiary: '#E31837', text: '#FFFFFF' },
'phi': { primary: '#000000', secondary: '#896C4C', tertiary: '#D50032', text: '#FFFFFF' },
'phx': { primary: '#1D1160', secondary: '#E56020', tertiary: '#F9A01B', text: '#FFFFFF' },
'sa':  { primary: '#010101', secondary: '#C4CED4', tertiary: '#272727', text: '#FFFFFF' },
```

**After** (양쪽 파일 동일):
```ts
'bkn': { primary: '#FFFFFF', secondary: '#CD1041', tertiary: '#C6CFD4', text: '#002A60' },  // 흰색
'cle': { primary: '#FFB81C', secondary: '#6F263D', tertiary: '#002B5C', text: '#6F263D' },  // 금색 (구 secondary와 swap)
'den': { primary: '#FEC524', secondary: '#8B2131', tertiary: '#0E2240', text: '#0E2240' },  // 노란색 (구 tertiary와 swap)
'ind': { primary: '#FDBB30', secondary: '#002D62', tertiary: '#BEC0C2', text: '#002D62' },  // 노란색 (구 secondary와 swap)
'lam': { primary: '#FDB927', secondary: '#31006F', tertiary: '#010101', text: '#31006F' },  // 노란색 (구 secondary와 swap)
'min': { primary: '#38BDF8', secondary: '#236192', tertiary: '#79BC43', text: '#0C2340' },  // 밝은 하늘색 (신규 hex)
'no':  { primary: '#E31837', secondary: '#B4975A', tertiary: '#002B5C', text: '#FFFFFF' },  // 빨간색 (구 tertiary와 swap)
'phi': { primary: '#D4AF37', secondary: '#896C4C', tertiary: '#D50032', text: '#000000' },  // 금색 (신규 hex, 기존 secondary는 탁한 브론즈라 대체)
'phx': { primary: '#E56020', secondary: '#1D1160', tertiary: '#F9A01B', text: '#FFFFFF' },  // 주황색 (구 secondary와 swap)
'sa':  { primary: '#C4CED4', secondary: '#010101', tertiary: '#272727', text: '#010101' },  // 밝은 회색 (구 secondary와 swap)
```

**검증**: `npx tsc --noEmit -p tscheck.json` teamData 관련 에러 없음. 색상은 DB가 아니라 `TEAM_COLORS` 상수에서만 오므로(populateTeamData도 `TEAM_COLORS[id]` 참조) DB 마이그레이션 불필요, 배포 즉시 반영.

**주의사항**: 인디애나(FDBB30)/덴버(FEC524)/LA 미라지(FDB927) 세 팀 모두 "노란색" 계열이라 서로 대진 시 막대색이 비슷해 보일 수 있음(각 팀 고유 브랜드 색조라 미세하게 다르긴 함). 클리블랜드(FFB81C)-필라델피아(D4AF37) 금색 두 팀도 유사 계열이나 톤 차이는 더 뚜렷함. 문제 시 재조정 필요.

**롤백 방법**: 위 Before 블록 내용으로 양쪽 파일 그대로 되돌리면 됨.

**[추가 2026-08-04] 멀티플레이어 기존 리그 DB 소급 반영**: 멀티플레이어 화면(`MultiGamePbpView.tsx`)의 팀스탯/플레이타입 막대그래프는 `TEAM_COLORS`를 실시간으로 안 읽고, 리그 생성 시점에 Supabase `league_teams.color_primary`/`color_secondary`로 스냅샷된 값을 씀(`services/multi/leagueService.ts`의 `initializeLeagueTeams()`가 `Object.values(TEAM_DATA)`를 그 시점에 복사). 그래서 코드만 바꾸면 새로 만드는 리그에만 반영되고 기존 리그(방)에는 반영이 안 됨.
→ `league_teams` 테이블에서 10개 팀(`team_slug` in ind/min/sa/den/no/bkn/cle/phx/lam/phi)의 `color_primary`(+swap된 팀은 `color_secondary`도) 를 위 새 값으로 직접 UPDATE 실행 (project `buummihpewiaeltywdff`, 팀당 25~28개 방 row 전체 반영 확인 완료).
- 롤백 시 위 Before 표의 primary/secondary 값으로 동일하게 UPDATE 재실행하면 됨.
- `draft_teams`라는 별도 스냅샷 테이블은 실제 DB에 존재하지 않음(조사 중 오탐) — 추가 조치 불필요.

---

## 2026-08-03 — GameInsightsPanel ORTG/DRTG 헤더 제거 + 차트 영역 높이 채우기

**배경**: "인사이트 그래프 상단의 ORTG, DRTG 등이 표시된 헤더는 그냥 삭제해줘" → 삭제 직후 "삭제하고 나니 하단에 여백이 약간 생기는데 그래프 영역을 늘려서 하단 여백이 없도록 조치해줘"라는 후속 요청.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`(client, UI 전용 — 서버 미러 없음). `GameInsightsPanel`이 결과 화면/라이브 화면 양쪽에서 공유되는 컴포넌트라 두 곳 모두에 영향.

**1) 헤더 삭제**: 팀 배지+ORTG/DRTG/NRTG/평균 포제션 시간을 보여주던 헤더 `<div className="flex items-start justify-between gap-8 px-6 py-5 bg-slate-950/80 border-b border-slate-800">` 블록 전체 제거. 그 블록에서만 쓰이던 `StatCell` 로컬 컴포넌트도 함께 제거(더 이상 참조 없음 확인 후 삭제). `home`/`away`(ORTG/DRTG/NRTG 계산 useMemo, `InsightsStat` 인터페이스)는 이번엔 남겨둠(범위 밖 — 완전히 죽은 계산이지만 요청 스코프가 "헤더만"이라 손대지 않음).

**2) 헤더 제거로 생긴 하단 여백 제거**: 결과 화면은 헤더 삭제로 콘텐츠가 짧아져도 페이지 자연스러운 스크롤이라 문제 없지만, 라이브 화면(`flex-1 min-h-0` 컬럼에 꽉 채워 넣은 상태)에서는 차트가 고정 `aspect-ratio`로 그려지던 탓에 남는 세로 공간이 빈 여백으로 보임.
- 최상위 wrapper: `<div className="w-full">` → `<div className="w-full h-full flex flex-col">`(부모가 준 높이를 명시적으로 채움)
- 바디: `flex flex-col gap-2 px-6 py-6 bg-slate-900` → `flex-1 min-h-0 flex flex-col gap-2 px-6 py-6 bg-slate-900`
- 차트 행: `flex items-center gap-2 w-full` → `flex-1 min-h-0 flex items-stretch gap-2 w-full`(`items-center`였던 걸 `items-stretch`로 바꿔 자식이 행 높이를 꽉 채우도록)
- 차트 div(`chartRef`): 고정 `style={{ aspectRatio: '${W} / ${H}' }}` 제거 → `h-full` 추가(SVG는 이미 `preserveAspectRatio="none"` + `w-full h-full`라 컨테이너가 늘어나는 대로 그대로 늘어남)

결과 화면(page-flow, 상위에 정해진 높이 없음)에서는 `h-full`이 `height:auto`처럼 동작해 기존과 동일하게 자연스러운 높이를 유지하고, 라이브 화면(정해진 높이의 `flex-1` 컬럼)에서만 실제로 꽉 채워짐 — CSS 스펙상 안전.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 헤더 블록 + `StatCell`을 git 히스토리에서 복원, wrapper/바디/차트 행의 클래스와 `chartRef`의 `aspectRatio` 스타일을 Before 상태로 되돌리면 됨.

---

## 2026-08-03 — 결과 화면 인사이트를 라이브 화면에 실시간 노출 + 3-column 레이아웃 재배치(PBP↔경기그래프)

**배경**: "경기 종료 화면에 보이는 인사이트를 라이브 시뮬레이션 뷰에도 실시간으로 기록되도록 변경할 수 있을까? 가능성을 체크해줘. 가능하다면 PBP를 좌측하단, 중앙 하단에 경기 그래프를 넣고 싶음." 서브에이전트로 `GameInsightsPanel`의 모든 prop 소스를 조사한 결과 **가능함**으로 확인 — 컴포넌트 자체(ORTG/DRTG 헤더 + 마진/승리확률 SVG 차트)는 순수 프레젠테이셔널이라 무수정으로 재사용 가능, 다만 넘기는 값 3개는 라이브 상태에서 스포일러이거나 계산이 안 되어 있어 교체가 필요했음. 사용자에게 (1) 경기 그래프 범위(GameInsightsPanel 전체 vs 차트만), (2) 좌측 기존 CompactWPGraph/우측 조건부 패널 처리 방식을 확인 — 각각 "전체"/"좌측 CompactWPGraph 제거"로 확정.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**1) 라이브 세이프 prop 3종 신규 계산**:
```tsx
// homeOreb/awayOreb: 기존엔 gameData.home_box(최종 데이터)에서 직접 합산 → 스포일러.
// liveHomeBox/liveAwayBox(box_timeline을 elapsed까지만 누적) 기준으로 새로 계산.
const liveHomeOreb = useMemo(() => liveHomeBox.reduce((s, p) => s + (p.offReb || 0), 0), [liveHomeBox]);
const liveAwayOreb = useMemo(() => liveAwayBox.reduce((s, p) => s + (p.offReb || 0), 0), [liveAwayBox]);

// maxQuarter: 기존엔 gameData.events(전체 최종) 기준이라 연장전 여부가 스포일러 + 차트 스케일 왜곡.
// 이미 있던 maxSelectableQ(지금까지 공개된 로그 기준) 기반으로 라이브 세이프 값 추가.
const liveMaxQuarter = Math.max(maxSelectableQ, 4);
```
(`homeStats`/`awayStats`는 이미 `visibleEvents` 기준으로 계산되고 있어 그대로 재사용 가능함을 조사로 확인, 별도 수정 없음.)

**2) 3-column 레이아웃 재배치**:
- **LEFT(원정)**: 기존 하단 `CompactWPGraph` 제거 → 그 자리에 CENTER 컬럼에 있던 PBP 피드(쿼터 필터+로그 리스트) 전체를 그대로 이동.
- **CENTER**: 전광판(변경 없음) → 샷차트(변경 없음) → 기존 PBP 피드가 있던 자리에 `<GameInsightsPanel>` 신규 배치(`allLogs={visibleEvents}`, `homeOreb={liveHomeOreb}`, `awayOreb={liveAwayOreb}`, `maxQuarter={liveMaxQuarter}`, 나머지 prop은 기존과 동일).
- **RIGHT(홈)**: 변경 없음(QuarterScores + TeamStatsCompare 그대로 유지).

**3) 죽은 코드 정리**: `CompactWPGraph` 컴포넌트(및 그 안에서만 쓰이던 `getSmoothPath` 헬퍼)가 이번 이동으로 호출부가 완전히 사라져 파일 전체에서 참조가 0이 됨을 grep으로 확인 후 정의 자체를 삭제(약 130줄, `368~499`행).

**검증**: `npx vite build` 클린 통과(번들 크기도 죽은 코드 제거로 소폭 감소), `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**주의사항 / 한계**: `GameInsightsPanel`이 라이브에서도 이제 `boxTimeline`/`homeBox`/`awayBox`를 그대로 `gameData.box_timeline`/`gameData.home_box`/`gameData.away_box`(최종 데이터)로 받는데, 이건 스포일러가 아님 — 조사 결과 컴포넌트 내부에서 이 값들은 `playerId`→이름 매핑에만 쓰이고(스탯 필드 미참조), `boxTimeline` 순회도 `allLogs`(=`visibleEvents`)에서 나온 경과시간을 절대 넘지 않도록 이미 가드되어 있음.

**롤백 방법**: LEFT/CENTER 컬럼의 서로 바뀐 블록(PBP↔GameInsightsPanel)을 원위치로 되돌리고, `liveHomeOreb`/`liveAwayOreb`/`liveMaxQuarter` 제거, `CompactWPGraph`/`getSmoothPath`를 git 히스토리에서 복원하면 됨.

---

## 2026-08-03 — 전광판(Jumbotron) 트리거를 "모든 스탯 증가" → "마일스톤 임계치"로 전면 재설계

**배경**: "전광판에 모든 pbp를 표시할 필요가 없을거같아. 중요한 이벤트들만 표시하는게 맞는거같아. 예를 들면 20득점, 10리바운드, 10어시스트, 5스틸, 5블락 등의 임계를 넘어가면 5단위로 보여주는게 좋지 않을지? 이 점보트론의 표시 체계도 단순 표시가 아니라 로직을 제대로 짜야될거같아." 턴오버/파울 처리 방식은 사용자에게 확인 — "고정 임계치만"(반복 아님) 선택.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**설계**:
- **득점/리바운드/어시스트/스틸/블록**: `STEP_MILESTONE` — 시작 임계치(20/10/10/5/5) 도달 후 5단위로 계속 발화(20,25,30... / 10,15,20... / 5,10,15...). 어시스트는 이번에 신규로 트리거 대상에 추가(기존엔 스탯 라인에 표시만 되고 이벤트 트리거는 아니었음).
- **턴오버/파울**: `FIXED_MILESTONES` — 값이 낮고 "많을수록 나쁜" 이벤트라 반복 패턴 대신 고정 임계치(턴오버 5, 파울 3·5)에서 한 번씩만 발화.
- `crossedMilestone(stat, old, cur)` 헬퍼: step형은 "구간 번호"(`Math.floor((v-threshold)/step)`)가 올라갔을 때만, 고정형은 목록의 값을 새로 넘었을 때만 마일스톤 값을 반환(없으면 null) — 매 스탯 증가가 아니라 실제로 임계치를 넘은 순간만 감지.
- `JumbotronEvent`의 `stat` kind에 `value`(도달한 마일스톤 값) 필드 추가 — 1줄 라벨에 `{value}{JUMBOTRON_LABEL[stat]}`로 표시(예: "20득점", "10리바운드", "5스틸"). AST가 새로 트리거 대상이 되면서 2줄 스탯 라인의 AST 값도 이제 `activeJumbotron.stat === 'ast'`일 때 초록색으로 강조되도록 변경(기존엔 항상 흰색 고정).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**주의사항 / 한계**: 마일스톤 기준값(20/10/10/5/5, 턴오버5, 파울3·5)은 이번에 확정한 값 — 추후 조정 원하면 `STEP_MILESTONE`/`FIXED_MILESTONES` 객체만 고치면 됨. 이전 세션의 "큐 적체로 인한 지연" 수정(최신 이벤트 우선, 2.2초 표시)은 이번에도 그대로 유지되며, 마일스톤 방식으로 바뀌면서 이벤트 발생 빈도 자체가 크게 줄어 큐 적체 문제는 더더욱 안 생길 것으로 예상됨.

**롤백 방법**: `STEP_MILESTONE`/`FIXED_MILESTONES`/`crossedMilestone` 제거, 감지 이펙트를 `snap[stat] > old[stat]`(모든 증가분 발화) 방식으로, `value` 필드와 라벨 표시를 되돌리면 이전 버전으로 복귀.

**배경**: "점보트론에 표시되는 메세지들이 pbp 로그보다 훨씬 늦게 표시되는거같아. 점보트론에 표시되는 메세지가 pbp로그 기준으로는 이전 메세지에 해당되거든"이라는 리포트. 서브에이전트로 엔진 코드까지 조사한 결과:
- **가설(기각)**: PBP 로그(`visibleEvents`, `toGameSeconds` 기준)와 박스스코어(`liveHomeBox`/`liveAwayBox`, `box_timeline`의 `tick.t` 기준)의 시간 공식이 다를 것 — 확인 결과 정상 포세션에서는 두 공식이 **완전히 동일한 값**을 만듦(`liveEngine.ts`에서 `state.gameClock` 차감 후 `addLog`와 `recordBoxTick`이 같은 값을 공유). 기각.
- **부수 발견(별도 이슈, 이번엔 미수정)**: `liveEngine.ts`의 `_handleGameEnd()`(정규시간 동점 종료 시 버저비터 포세션 처리)는 `applyPossessionResult`(PbpLog 생성)만 호출하고 `recordBoxTick()`을 호출하지 않음 — 그 경기의 마지막 포세션 스탯은 `box_timeline`에 영원히 안 남아 `final` 전환 전까지 박스스코어에 반영 안 됨. 경기당 최대 1회, 동점 종료 시에만 발생하는 엣지 케이스라 이번 수정 범위에서는 제외(원하시면 별도로 `liveEngine.ts` + 서버 미러 수정 가능).
- **진짜 원인**: **큐 적체**. `REPLAY_DURATION_MS`(전체 경기 48분을 실시간 10분에 압축 재생)를 기준으로 하면 득점만 해도 평균 ~3초 간격으로 발생하는데, 전광판은 이벤트 1개당 고정 4초씩 순서대로(FIFO) 보여주는 큐였음 — 이벤트 발생 속도가 소화 속도보다 빨라서 큐가 계속 밀리고, 시간이 지날수록 점점 더 과거 이벤트를 뒤늦게 보여주게 됨(사용자가 관찰한 "PBP 로그 기준 이전 메세지" 현상과 정확히 일치).

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**변경 내용**:
1. 큐 push 시 안전장치로 최근 5개까지만 유지(`.slice(-5)`) — 한 렌더 틱에 몰리는 이벤트 폭주 대비.
2. **핵심 수정**: 큐에서 다음 이벤트를 꺼낼 때 큐의 **선두(가장 오래된 것)**가 아니라 **마지막(가장 최신)** 항목을 꺼내고, 나머지(더 오래된 대기열)는 전부 버림 — 실제 방송 전광판처럼 "지금 막 일어난 일"에 최대한 가까운 것만 보여주고 밀린 과거 이벤트는 스킵.
3. 표시 시간을 4초 → 2.2초로 단축 — 큐가 애초에 잘 쌓이지 않도록 회전율을 높임.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**주의사항 / 한계**: 이제 이벤트가 몰리면(예: 한 포제션에 리바운드+파울이 동시에 발생) 오래된 이벤트는 화면에 아예 안 뜨고 스킵됨(모든 이벤트를 빠짐없이 보여주는 게 아니라 "최신 상태 유지"를 우선). 위에서 발견한 버저비터 `recordBoxTick` 누락 버그는 이번엔 미수정.

**롤백 방법**: `.slice(-5)` 캡 제거, 큐 전진 로직을 `jumbotronQueue[0]`+`slice(1)`(FIFO)으로, 표시시간을 2200 → 4000으로 되돌리면 됨.

**배경**: 두 차례의 후속 요청. (1) "LED 텍스처와 금속 베젤 프레임+모서리 브라켓을 넣어보자" → 구현 직후 (2) "모서리와 베젤 프레임 효과는 삭제해줘" → LED 도트 텍스처만 남기고 상단 브러시드 메탈 스트립 + 네 모서리 브래킷 제거. (3) "점보트론 영역의 위치를 옮길께. 헤더와 바디 사이 대신 바디의 2번째 열(샷차트, PBP 있는)의 최상단에만 넣는걸로 변경 — 좌우 박스스코어는 헤더 바로 밑에, 샷차트 위에 전광판이 오도록."

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**변경 1 — LED만 유지**: 상단 금속 베젤(`linear-gradient(90deg, #0f172a, #64748b, #cbd5e1, ...)` 3px 스트립)과 네 모서리 브래킷(`border-t/l/r/b` 조합 4개 `<div>`) 제거. LED 도트 매트릭스(`radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)`, `background-size: 4px 4px`)만 유지.

**변경 2 — 위치 이동**: 전광판 `<div>` 전체를 "헤더(스코어버그)와 3-column Body 사이"(전체 폭 차지)에서 "3-column Body의 CENTER 컬럼(`<div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">`, 샷차트+PBP가 들어있는 그 컬럼) 맨 위, `MultiFullCourtChart`(샷차트) 바로 위"로 이동. 이에 따라:
- 기존에 전광판을 감싸던 `<>...</>` Fragment(전광판 + 3-column body 두 형제를 담기 위해 추가했던 것)를 제거하고 `{!showBox && (<div className="flex flex-1 overflow-hidden">...)}` 단일 자식 구조로 원복.
- LEFT/RIGHT(원정/홈 박스스코어 컬럼)는 이제 헤더 바로 아래에서 시작(전광판의 영향을 안 받음), CENTER 컬럼만 전광판→샷차트→PBP 순서로 세로 배치.
- 전광판 자체의 마크업/로직(state, 이펙트, 스탯 감지, flow 이벤트 감지)은 전혀 변경 없음 — 렌더 위치만 이동.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. `grep -c`로 전광판 블록이 정확히 1곳에만 존재(중복 렌더 없음) 확인. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 전광판 `<div>` 블록을 CENTER 컬럼에서 잘라내 다시 헤더-Body 사이(`{!showBox && (<>...<>)}`)로 옮기고, 베젤 스트립+모서리 브래킷 4개를 복원하면 이전 버전으로 복귀.

**배경**: "팀명, 선수명, 플레이명의 폰트 사이즈는 16px로 키워줘"라는 요청 — stat 이벤트 1줄(팀약어+선수명+이벤트유형)만 대상.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**Before**: `<div className="flex items-center gap-2 text-sm">`(14px)
**After**: `<div className="flex items-center gap-2 text-base">`(Tailwind `text-base`=16px)
2줄의 스탯 라인(PTS/REB/... )은 기존 `text-sm`(14px) 그대로 유지.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `text-base`를 `text-sm`으로 되돌리면 됨.

**배경**: "경기 시작, 쿼터 종료, 하프타임, 경기 종료 등의 이벤트도 큰 텍스트로 표시해줘"라는 요청. 기존 전광판은 선수 스탯 변화(pts/reb/stl/blk/tov/pf)만 감지했고, `teamId === 'SYSTEM'`으로 마킹되는 흐름 이벤트(엔진이 붙이는 "1쿼터 시작"/"하프 타임"/"경기 종료" 등, `liveEngine.ts`)는 전혀 다루지 않았음.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**변경 내용**:
1. `JumbotronEvent` 타입을 유니온으로 확장: `{ kind: 'stat'; ...기존 필드 }` | `{ kind: 'flow'; key; text }`. 기존 스탯 감지 이펙트가 push하는 객체에 `kind: 'stat'` 추가.
2. **신규 이펙트** (`useEffect([visibleEvents])`): `visibleEvents`(라이브 리플레이 중 시간에 따라 점점 드러나는 PBP 로그 배열)의 길이를 직전 렌더와 비교해, 새로 드러난 구간에서 `teamId === 'SYSTEM'`인 로그만 뽑아 `{ kind: 'flow', text: log.text }`로 큐에 추가. `flowSeenCountRef`로 "마운트 시점에 이미 드러나 있던 로그"는 첫 실행에서 기준선만 잡고 큐에 안 넣음(중간 참여 시 과거 이벤트가 한꺼번에 쏟아지는 것 방지 — 스탯 감지 이펙트의 `jumbotronPrevRef` 초기 스냅샷과 동일한 패턴).
3. **렌더 분기**: `activeJumbotron.kind === 'flow'`면 기존 2줄 스탯 레이아웃 대신 `text-2xl font-black uppercase tracking-widest`(24px, 흰색 글로우) 큰 텍스트 한 줄로 `log.text`를 그대로 표시. 하단 발광 라인도 flow일 땐 팀 컬러 대신 중립 화이트(`#e2e8f0`)로 표시.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**주의사항 / 한계**: flow 이벤트도 stat 이벤트와 동일한 큐에 섞여 순서대로 4초씩 노출됨(우선순위 없음) — 동시에 여러 이벤트가 몰리면 순서대로 밀려서 보임.

**롤백 방법**: `JumbotronEvent` 타입을 원래 flat 인터페이스로, `visibleEvents` 감지 이펙트와 `flowSeenCountRef` 제거, 렌더의 `kind==='flow'` 분기 제거하면 됨.

**배경**: "점보트론에 idle 상태일 때 전광판 텍스트가 나오는건 없어도 돼."

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**Before**: `{activeJumbotron ? (...) : (<span ...>전광판</span>)}` — 활성 이벤트가 없을 때 "전광판"이라는 회색 플레이스홀더 텍스트 표시.
**After**: `{activeJumbotron && (...)}` — 활성 이벤트가 없으면 아무것도 렌더링하지 않고 빈 검정 바만 유지(글로시 배경 효과는 그대로 유지됨).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `{activeJumbotron && (...)}`를 `{activeJumbotron ? (...) : (<span className="relative z-10 text-sm font-bold uppercase tracking-widest text-slate-700">전광판</span>)}`로 되돌리면 됨.

**배경**: "글로시 효과의 불투명도를 좀 낮춰줘. 그리고 점보트론 높이를 조금 키워줘. 그리고 팀명은 그냥 흰색으로 표시."

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**변경 내용**:
1. 높이: `h-14`(56px) → `h-20`(80px).
2. 글로시 화이트 오버레이 불투명도 전부 절반 수준으로 하향:
   - 상단 베젤 하이라이트: `rgba(255,255,255,0.10)` → `0.06`
   - 세로 그라데이션 시트: `0.14/0.04` → `0.07/0.02`
   - 비스듬한 반사 밴드: `0.10/0.22/0.10` → `0.05/0.11/0.05`
   (하단 어두운 베젤 그림자 `rgba(0,0,0,0.7)`는 유지 — "글로시"는 화이트 반사광 쪽이라 그 부분만 낮춤)
3. 1줄의 팀약어 색상: 팀 컬러(`homeColor`/`awayColor` 인라인 style) → 그냥 `text-white`.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `h-20`을 `h-14`로, 화이트 오버레이 불투명도 값들을 위 "Before" 수치로, 팀약어 span의 `text-white`를 `style={{ color: activeJumbotron.isHome ? homeColor : awayColor }}`로 되돌리면 됨.

**배경**: "모든 텍스트를 가운데 넣고, 두줄로 표시해. {팀약어} {선수 이름} {플레이유형} / {득점} {리바운드} {어시스트} {스틸} {블락} {파울} {턴오버}. 그리고 업데이트된 스탯은 초록색으로 표시해. 그리고 점보트론에 표시되는 폰트 사이즈는 13~14px로 유지시켜줘"라는 요청.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**변경 내용**:
1. 레이아웃: 기존엔 좌측 팀컬러 액센트 바 + 좌측 정렬 텍스트 + `ml-auto`로 우측 밀착된 스탯 라인(한 줄)이었음 → 액센트 바 제거, 컨테이너를 `flex flex-col items-center justify-center gap-1`로 바꿔 2줄 가운데 정렬:
   - 1줄: `{팀약어(팀컬러)} {선수명} {이벤트유형(스탯별 강조색)}`
   - 2줄: `PTS REB AST STL BLK PF TOV`(요청 순서대로 재배열 — 기존엔 PTS REB AST STL BLK TOV PF였음)
2. 갱신된 스탯 강조: 2줄의 스탯 값들 중 `activeJumbotron.stat`과 일치하는 것만 `text-emerald-400`(초록색), 나머지는 `text-white` — 인라인 삼항 6곳(`AST`는 이벤트 트리거 대상이 아니라 항상 흰색).
3. 폰트 크기: 팀약어/선수명/이벤트유형/스탯 라인 전부 `text-sm`(14px)로 통일 — 기존엔 요소별로 `text-xs`(12px)/`text-sm`(14px)/`text-[10px]`가 섞여 있었음.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 컨테이너를 `flex items-center gap-4`(1줄, 좌측 정렬)로, 액센트 바 `<div>` 복원, 스탯 순서를 PTS/REB/AST/STL/BLK/TOV/PF로, 강조색 삼항을 전부 `text-white`로 되돌리면 됨.

**배경**: "점보트론 섹션에 글로시한 효과를 넣어서 전광판같은 효과를 추가하자"는 요청. 단순 `bg-black` 평면 바였던 걸 실제 스코어보드 패널처럼 보이도록 유리 반사광 + 오목한 베젤 그림자 효과 추가.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**추가된 효과**:
1. **베젤(움푹 파인 패널) 그림자**: 바깥 div에 `boxShadow: inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -10px 18px rgba(0,0,0,0.7)` — 위쪽 가장자리는 살짝 밝은 하이라이트 선, 아래쪽은 어두운 그림자로 안쪽으로 파인 물리적 패널 느낌.
2. **유리 반사광 오버레이 2겹**: (a) 상단에서 아래로 옅어지는 화이트 그라데이션 레이어, (b) 비스듬히 지나가는 좁은 화이트 밴드(`blur-md`, `linear-gradient(100deg, ...)`) — 실제 유리/아크릴 패널에 빛이 비스듬히 반사되는 느낌.
3. **활성 이벤트 발광 라인**: `activeJumbotron`이 있을 때만 하단에 해당 팀 컬러로 은은하게 빛나는 1px 라인(`boxShadow: 0 0 12px 1px ${color}`) 추가 — 이벤트 발생 시에만 "켜지는" 느낌.
4. **선수명 텍스트 글로우**: `textShadow: 0 0 10px rgba(255,255,255,0.35)`로 LED 전광판 특유의 살짝 번지는 발광 텍스트 느낌.
5. **팀컬러 액센트 바에도 매칭 글로우**: 좌측 세로 바에 `boxShadow: 0 0 8px ${color}` 추가.
모든 오버레이는 `pointer-events-none`으로 클릭 이벤트 통과, 실제 콘텐츠는 `relative z-10`으로 오버레이 위에 배치.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 바깥 div의 `style`(boxShadow)과 그 안의 오버레이 `<div>` 2개, 발광 라인 `<div>`, 텍스트/액센트 바의 글로우 스타일을 제거하면 원래의 단순 `bg-black` 바로 복귀.

**배경**: 바로 아래 항목(v1)에서 "라이브게임뷰"라는 이름만 보고 `views/LiveGameView.tsx`에 전광판을 구현했으나, 사용자가 "이거 멀티플레이어 전용 화면인데 혹시 싱글플레이어에 코드 추가한건가?"라고 지적. 확인 결과 `LiveGameView.tsx`는 실제로는 **싱글플레이어** 전용 화면(`components/ProtectedLayout.tsx`의 GM 커리어 모드, `pages/QuickPlayPage.tsx`의 퀵플레이에서만 사용, 멀티플레이어 쪽은 이 컴포넌트를 아예 import 안 함) — 멀티플레이어 라이브 화면은 별도 컴포넌트 없이 `views/multi/season/MultiGamePbpView.tsx` 안의 `{!showBox && (...)}` 분기(3-column 레이아웃)로 구현돼 있음. 사용자가 "멀티플레이어로 이동"을 선택 — v1을 `LiveGameView.tsx`에서 전부 원복하고 `MultiGamePbpView.tsx`의 라이브 분기에 동일 기능을 재구현.

**변경 파일**:
- `views/LiveGameView.tsx` — v1에서 추가했던 타입/상수 블록, state/effect 3개, 렌더 블록(검정 바) 전부 제거(원상복구)
- `views/multi/season/MultiGamePbpView.tsx` — 동일한 기능을 라이브 분기에 새로 구현

**멀티플레이어 버전 구현 시 달라진 점**:
- 선수 스탯 스냅샷 소스: 싱글플레이어는 `homeBox`/`awayBox`(`useLiveGame` 훅, 매 포제션 스텝마다 갱신)를 썼지만, 멀티플레이어는 이미 존재하는 `liveHomeBox`/`liveAwayBox`(`useMemo`, `serverNow`가 틱할 때마다 `box_timeline`을 현재 경과시간까지 "리플레이"해서 재계산 — 서버가 이미 다 시뮬레이션해둔 경기를 클라이언트가 벽시계 기준으로 점진 공개하는 방식)를 재사용. `useEffect([liveHomeBox, liveAwayBox])`로 동일한 diff 로직 적용.
- 팀 약어 표시: 싱글플레이어는 `team.id.toUpperCase().slice(0,3)`을 썼지만, 멀티플레이어는 이미 계산된 `homeAbbr`/`awayAbbr` 변수를 그대로 사용(더 정확한 약어 소스).
- 삽입 위치: 싱글플레이어는 "스코어보드 헤더 + 탭바" 다음이었지만, 멀티플레이어는 탭바가 없고 "스코어버그 헤더" 하나뿐이라 그 다음, `{!showBox && (...)}` 블록 안(라이브 상태에서만 노출, 경기 종료 후 결과 화면엔 안 나옴) 맨 앞에 배치. 기존에 `{!showBox && (<div className="flex flex-1 ...">...</div>)}`로 단일 자식이던 걸 `<>...</>` Fragment로 감싸 전광판 바를 형제 요소로 추가.
- 타입/상수 정의 위치: `LiveGameView.tsx`처럼 `LivePlayer`가 아니라 `PlayerBoxScore`(이미 `import type`으로 들여온 타입) 기준으로 `JumbotronEvent` 인터페이스 작성.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `LiveGameView.tsx`/`MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `MultiGamePbpView.tsx`에서 이번에 추가한 타입/상수 블록, `liveAwayBox` 뒤의 state/effect 블록, `{!showBox && (<>...)}` 안의 전광판 `<div>` + Fragment 래핑을 제거하면 됨.

**배경**: "라이브게임뷰에 새로운 섹션을 추가하고 싶다. 헤더와 바디 사이에 검정색 전광판 영역을 추가하고, 득점/리바운드/스틸/블락/턴오버/파울 등 발생 시 선수의 경기 스탯을 띄워주는 하이라이터로 사용하고 싶어"라는 요청.

**설계 결정 — 왜 PBP 로그 텍스트 파싱이 아니라 스냅샷 diff인가**: `PbpLog`(`types/engine.ts`)에는 `playerId`/`playerName` 필드가 없음 — 득점/블록/파울/턴오버 로그는 `teamId`만 있고 실제 행위자 이름은 자유 텍스트(`text`) 안에만 있음. 리바운드는 별도 type도 없이 `type: 'info'`로 기록되고 `teamId` 자리에 리바운더의 `playerId`가 대신 들어가는 특수 케이스(`services/game/engine/pbp/statsMappers.ts`), 스틸은 `turnover` 타입 로그 안에 텍스트로만 존재. 반대로 `homeBox`/`awayBox`(`PlayerBoxScore[]`, `useLiveGame.ts`)는 매 포제션마다 최신 스냅샷으로 갱신되고, 이미 `OnCourtPanel`(같은 파일 202-247줄)이 정확히 이 방식(이전 렌더 스냅샷과 비교해 스탯 증가분을 감지해 셀 하이라이트)을 쓰고 있었음 — 이 패턴을 그대로 재사용해 텍스트 파싱 없이 정확하게 "어느 선수의 어떤 스탯이 방금 올랐는지"를 감지함.

**변경 파일**: `views/LiveGameView.tsx` (client, UI 전용 — 서버 미러 없음)

**추가된 것**:
1. **타입/상수** (모듈 최상위, `HighlightKey` 바로 아래): `JumbotronStat`(`'pts'|'reb'|'stl'|'blk'|'tov'|'pf'`), `JUMBOTRON_STATS`, `JUMBOTRON_LABEL`(한글 라벨), `JUMBOTRON_ACCENT`(스탯별 강조색), `JumbotronEvent` 인터페이스(`key`/`player`/`stat`/`isHome`).
2. **컴포넌트 내부 상태/이펙트** (`maxSelectableQ` 정의 직후):
   - `jumbotronQueue`/`activeJumbotron` state, `jumbotronPrevRef`(선수별 직전 스탯 스냅샷).
   - `useEffect([homeBox, awayBox])`: 매 렌더마다 전체 선수(`[...homeBox, ...awayBox]`)의 pts/reb/stl/blk/tov/pf를 직전 스냅샷과 비교해 증가한 스탯을 `JumbotronEvent`로 큐에 push.
   - `useEffect([jumbotronQueue, activeJumbotron])`: 활성 이벤트가 없고 큐에 대기 중인 게 있으면 선두를 꺼내 `activeJumbotron`으로.
   - `useEffect([activeJumbotron])`: 활성 이벤트를 4초 후 자동 클리어(타이머 재실행 시 정리) → 다음 큐 항목으로 자동 교체.
3. **렌더** (스코어보드+탭바 헤더가 끝나는 지점과 `{/* ── Body ── */}` 사이에 삽입): `h-14 bg-black border-b border-slate-800` 고정 높이 바. `activeJumbotron`이 있으면 좌측에 팀컬러 액센트 바 + 스탯 라벨(득점/리바운드/스틸/블록/턴오버/파울, 스탯별 색상) + 선수명 + 팀 약어, 우측에 PTS/REB/AST/STL/BLK/TOV/PF 전체 스탯 라인(현재 경기 누적치)을 표시. 없으면 옅은 "전광판" placeholder 텍스트만 표시(빈 상태에서도 검정 바 자체는 항상 존재).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `LiveGameView.tsx` 관련 오류 없음(남은 오류는 이 세션과 무관한 다른 파일들의 기존 이슈). UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**주의사항 / 한계**:
- 어시스트(ast)는 스탯 증가 감지 대상에서 제외(사용자가 요청한 6개 이벤트에 어시스트는 없었음) — 필요시 `JUMBOTRON_STATS`/`JUMBOTRON_LABEL`/`JUMBOTRON_ACCENT`에 `'ast'` 추가만 하면 됨.
- 한 포제션에서 여러 선수/스탯이 동시에 바뀌면(예: 블록 직후 같은 틱에 리바운드) 전부 큐에 쌓여 4초씩 순차 노출 — 드롭 없이 전부 보여주는 대신 이벤트가 몰리면 살짝 밀려서 보일 수 있음.
- 온코트/벤치 구분 없이 `homeBox`/`awayBox` 전체를 감시하므로 이론상 벤치 선수 스탯 변화(예: 소급 보정)도 감지되지만, 실제 라이브 시뮬레이션에서는 온코트 선수만 스탯이 오르므로 실질적으로 문제되지 않음.

**롤백 방법**: 타입/상수 블록, 컴포넌트 내부 state/effect 3개, 렌더 블록(검정 바 `<div>`) 전부 제거하면 원래 상태로 복귀.

---

## 2026-08-03 — 인사이트 섹션도 헤더+바디 구조로 통일

**배경**: "인사이트 섹션도 헤더+바디를 만들자. 상단의 팀 로고, ORTG 등을 헤더로 만들고 아래의 범례부터 그래프까지 바디로 만들어. 헤더와 바디의 배경색은 다른 섹션과 일치하게끔 수정. (바디 섹션의 색상이 약간 밝아져야함)"이라는 요청. 다른 섹션(박스스코어/온오프 등)은 전부 헤더(`bg-slate-950/80`, 팀 로고+이름 등)와 바디(`bg-slate-900`, 헤더보다 살짝 밝음 — 실제 테이블/컨텐츠) 2단 구조인데, 인사이트만 배경 없이 통짜 `flex flex-col gap-8`이었음.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음). `GameInsightsPanel` 컴포넌트(같은 파일 내부 로컬 컴포넌트) + 이를 호출하는 인사이트 섹션 블록.

**Before** (`GameInsightsPanel` 최상위):
```tsx
return (
    <div className="w-full flex flex-col gap-8">
        {/* 팀별 통계 행 */}
        <div className="flex items-start justify-between gap-8">
            {/* 원정 로고+ORTG/DRTG/NRTG/Avg Poss, 홈 동일 */}
        </div>

        {/* 마진 + 승률 통합 차트 */}
        <div className="flex flex-col gap-2">
            {/* 범례, 포제션 막대, SVG 차트, 쿼터 축 라벨 */}
        </div>
    </div>
);
```
호출부(`MultiGamePbpView.tsx`)는 배경 없는 `GameInsightsPanel`을 감싸려고 `<div className="px-6 pt-6 pb-10"><GameInsightsPanel .../></div>`로 바깥에서 패딩만 줬음.

**After**:
```tsx
return (
    <div className="w-full">
        {/* 헤더 — 팀별 로고/ORTG/DRTG/NRTG/평균 포제션 시간 */}
        <div className="flex items-start justify-between gap-8 px-6 py-5 bg-slate-950/80 border-b border-slate-800">
            {/* 원정/홈 동일 */}
        </div>

        {/* 바디 — 범례 + 마진/승률 통합 차트, 헤더보다 살짝 밝은 톤 */}
        <div className="flex flex-col gap-2 px-6 py-6 bg-slate-900">
            {/* 범례, 포제션 막대, SVG 차트, 쿼터 축 라벨 */}
        </div>
    </div>
);
```
호출부의 `<div className="px-6 pt-6 pb-10">` 래퍼는 제거 — 이제 `GameInsightsPanel`이 다른 섹션 컴포넌트(BoxScoreTable 등)처럼 자기 배경/패딩을 직접 책임지므로 바깥에서 별도 패딩을 줄 필요가 없어짐(오히려 이중 패딩/배경 미적용 구간이 생기는 걸 방지).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `GameInsightsPanel`의 두 `<div>` 배경/패딩 클래스를 제거하고 최상위를 `w-full flex flex-col gap-8`로, 호출부에 `<div className="px-6 pt-6 pb-10">` 래퍼를 되돌리면 됨.

---

## 2026-08-03 — 경기 기록 탭(PBP/플레이타입) 폰트 크기를 다른 섹션과 통일(12px)

**배경**: "경기 기록 탭의 PBP 코멘터리와 플레이타입 섹션 내의 폰트 사이즈가 다른 섹션에 비해 크다"는 지적. 조사 결과 `GamePbpTab.tsx`/`PlayTypeStats.tsx`만 전체적으로 `text-xs md:text-sm`(반응형 — `md:` 768px 이상에서 `text-sm`=14px로 승격)를 쓰고 있었고, 나머지 5개 섹션(박스스코어/샷차트/로테이션/인사이트/온오프)은 전부 반응형 변형 없는 고정 `text-xs`(12px)만 사용 — 그래서 데스크톱 화면에서 이 두 섹션만 12px→14px로 커져 보였음. 사용자가 "모든 섹션을 반응형 12px로 맞추고 싶다(데스크탑 기준)"고 확정 — 다른 5개 섹션처럼 고정 `text-xs`로 통일하면 모든 브레이크포인트에서 12px가 되어 요구사항을 만족함.

**변경 파일**: `components/game/tabs/GamePbpTab.tsx`(14곳), `components/game/PlayTypeStats.tsx`(13곳) — 둘 다 client, UI 전용, 서버 미러 없음.

**Before**: `text-xs md:text-sm`(모바일 12px, 데스크톱 14px)가 적용된 모든 텍스트 요소(컬럼 헤더/로그 행/스코어/플레이타입 헤더·행 등)
**After**: `text-xs`(모든 브레이크포인트에서 12px 고정) — 다른 5개 섹션과 동일한 패턴으로 통일. `sed -i 's/text-xs md:text-sm/text-xs/g'`로 두 파일 일괄 치환.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `GamePbpTab.tsx`/`PlayTypeStats.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 두 파일에서 `text-xs`를 `text-xs md:text-sm`로 되돌리면 됨(단, "선수교체" 텍스트 블록처럼 이번 변경 전에 이미 `text-xs md:text-sm`가 아니라 다른 조합이었던 곳은 없음 — 두 파일의 모든 텍스트 크기 클래스가 동일 패턴이었으므로 일괄 롤백 가능).

---

## 2026-08-03 — 섹션 제목 디바이더 색상 반복 조정: bg-slate-900 → bg-slate-800 → bg-indigo-600 → bg-indigo-800(+ text-white)

**배경**: 바로 아래 항목(v2)에서 섹션 제목 디바이더에 `bg-slate-900`를 적용한 뒤, 사용자가 연달아 "한단계만 더 밝은 색상 적용해줘" → "인디고 색상을 적용해보자. 텍스트는 흰색" → "indigo-800을 적용해봐"로 반복 조정.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음). 6개 섹션(인사이트/박스스코어/경기기록/샷차트/로테이션/온오프) 제목 디바이더 전부 동일하게 변경.

1. `bg-slate-900` → `bg-slate-800`(한 단계 밝게)
2. `bg-slate-800` → `bg-indigo-600` + 제목 텍스트 `text-slate-500` → `text-white`(탭 네비게이션 바의 활성 컬러·쿼터 필터 버튼의 활성 배경과 동일한 인디고 톤으로 통일)
3. `bg-indigo-600` → `bg-indigo-800`(더 짙은 인디고, `text-white`는 유지)

**최종 상태** (6개 섹션 공통):
```tsx
<div className="bg-indigo-800 px-6 py-3">
    <h3 className="text-sm font-black uppercase text-white tracking-widest">박스스코어</h3>
</div>
```

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `bg-indigo-800`을 원하는 이전 단계(`bg-indigo-600`/`bg-slate-800`/`bg-slate-900`)로 되돌리면 됨, `text-white`는 인디고 배경 유지 시 그대로 둘 것.

---

## 2026-08-03 — 통합 결과 페이지 섹션 상단 보더 + 섹션 제목 디바이더 배경색 (v2 — 스코프 정정)

**배경**: 6탭→1페이지 통합 이후 "각 섹션의 상단에 보더라인이 없는데, 보더라인을 채워주고, 박스스코어 헤더 영역은 덩어리감있게 별도의 디자인을 적용해"라는 요청. 1차로 "박스스코어 헤더"를 팀명 바(SEA/ORL 표시 바)로 오해하고 그쪽에 컬러 액센트/큰 배지 등을 적용했으나(아래 v1 참고), 사용자가 스크린샷으로 "그 부분이 아니라 상단의 '박스스코어'라고 적힌 섹션 제목 디바이더를 말한 것"이라고 정정 — 팀명 바 변경은 전부 원복하고, 실제로 요청한 섹션 제목 줄에 배경색을 적용함.

**1) 섹션 상단 보더**(변경 없음, v1과 동일하게 유지): 6개 섹션 전부 `border-t border-slate-800`로 자기 상단에 구분선을 가짐.

**2) 섹션 제목 디바이더 배경색**: 각 섹션의 `<h3>` 제목이 배경 없이 텍스트만 있어서 페이지 배경(`bg-slate-950`)과 거의 구분이 안 됐음. 제목을 감싸는 별도 `<div>`에 `bg-slate-900`(배경보다 살짝 밝은 같은 계열 블루그레이 톤, 상단 네비게이션 바와 동일 톤)을 적용해 전체 폭 디바이더 띠로 만듦.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**Before** (6개 섹션 공통 패턴):
```tsx
<section ... className="border-t border-slate-800">
    <h3 className="text-sm font-black uppercase text-slate-500 tracking-widest px-6 pt-8 pb-4">박스스코어</h3>
    <GameBoxScoreTab ... />
</section>
```

**After**:
```tsx
<section ... className="border-t border-slate-800">
    <div className="bg-slate-900 px-6 py-3">
        <h3 className="text-sm font-black uppercase text-slate-500 tracking-widest">박스스코어</h3>
    </div>
    <GameBoxScoreTab ... />
</section>
```
인사이트 섹션만 원래 콘텐츠 자체에 `px-6 pb-10` 패딩이 필요해서, 제목 띠(`bg-slate-900 px-6 py-3`)와 콘텐츠 패딩(`px-6 pt-6 pb-10`)을 분리된 두 개의 `<div>`로 나눠 적용.

**3) 박스스코어 팀명 바(SEA/ORL) — 원복**: `components/game/BoxScoreTable.tsx`/`AdvancedBoxScoreTable.tsx`/`DefenseBoxScoreTable.tsx`에 적용했던 "덩어리감" 디자인(팀 컬러 액센트 바, 그라데이션 틴트, `w-11 h-11` 배지 등)을 전부 원래 코드(`px-6 py-4 bg-slate-950/80`, `w-8 h-8` 배지)로 되돌림 — 요청 스코프가 아니었음.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 관련 파일 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `views/multi/season/MultiGamePbpView.tsx`의 6개 섹션에서 `bg-slate-900` 제목 띠 div를 제거하고 `<h3>`를 원래 위치(px-6 pt-8 pb-4)로 되돌리면 됨.

---

## 2026-08-03 — 통합 결과 페이지 섹션 상단 보더 추가 + 박스스코어 헤더 "덩어리감" 리디자인 v1 (스코프 오해 — v2로 대체됨)

**배경**: 위 v2 항목 참고. "박스스코어 헤더 영역"을 팀명 바(SEA/ORL 표시 바)로 잘못 해석해 `BoxScoreTable.tsx`/`AdvancedBoxScoreTable.tsx`/`DefenseBoxScoreTable.tsx`의 팀명 바에 컬러 액센트/그라데이션/큰 배지를 적용했으나, 사용자가 원한 건 섹션 제목("박스스코어"라고만 적힌 작은 라벨) 디바이더였음. v2에서 팀명 바는 전부 원복하고 섹션 제목 쪽에 배경색을 적용함. 실제 롤백 대상 아님(v2가 이미 원복 완료).

**교훈**: "OO 헤더"처럼 지칭 대상이 모호한 요청은 화면의 어느 요소를 말하는지(팀명 바 vs 섹션 제목 vs 탭 네비게이션 바) 먼저 스크린샷으로 정확히 짚고 시작하는 게 나음 — 이번엔 먼저 구현하고 틀려서 왕복이 발생함.

---

## 2026-08-03 — 경기 기록 탭 PBP/플레이타입 좌우 높이 불일치 수정 (v2 — 진짜 원인)

**배경**: 6탭 통합 페이지 작업 이후 "경기 기록과 플레이타입 섹션의 좌우 섹션 높이가 아직도 안맞아"라는 재지적. 1차로 `GamePbpTab.tsx`의 우측 wrapper에 `min-h-0`를 추가했으나(아래 "v1" 참고) 사용자가 하드리프레시 후에도 전혀 변화가 없다고 재확인 — **진단 자체가 틀렸음**. `overflow-y-auto`가 걸린 flex 자식은 스펙상 `min-height:auto`가 이미 0으로 처리되므로 `min-h-0` 추가는 애초에 무의미한 중복이었음(그래서 아무 변화가 없었던 것).

**진짜 원인**: `PlayTypeStats.tsx`의 최상위 div(`<div className="bg-slate-900">`)에 높이 지정이 전혀 없었음. 이 div의 주석은 "부모(GamePbpTab.tsx)가 `h-[520px]`를 갖고 있고 `align-items:stretch`로 좌측 PBP와 동일한 높이를 자동으로 받는다"고 적혀 있었는데 **이 가정 자체가 틀림** — `align-items:stretch`는 GamePbpTab.tsx의 우측 flex 자식(바깥 wrapper `<div className="flex-[5] ...">`)만 520px로 늘려줄 뿐, 그 안의 일반 block 자식인 `PlayTypeStats`의 최상위 div는 자동으로 늘어나지 않고 딱 자기 콘텐츠(플레이타입 12행) 높이만큼만 차지함. 그래서 로그가 많아 520px를 꽉 채우는 좌측 PBP 패널보다 우측이 짧게 끝나 보였던 것(우측 바깥 wrapper 자체는 520px가 맞지만, 그 안의 `PlayTypeStats` 카드 배경/보더가 콘텐츠 높이에서 멈추고 나머지는 빈 공간으로 남음).

**변경 파일**: `components/game/PlayTypeStats.tsx`, `components/game/tabs/GamePbpTab.tsx`(주석 정정만, 로직 변경 없음) — 둘 다 client, UI 전용, 서버 미러 없음.

**Before** (`PlayTypeStats.tsx`):
```tsx
return (
    <div className="bg-slate-900">
        {groups.length === 0 ? (...) : (
            <>
                <div className={`grid ${GRID_COLS} ... h-10 bg-slate-950 sticky top-0 z-10 ...`}>
                    {/* 헤더 */}
                </div>
                <div className="bg-slate-900">
                    {groups.map(g => (...))}
                </div>
            </>
        )}
    </div>
);
```

**After**:
```tsx
return (
    <div className="h-full flex flex-col bg-slate-900">
        {groups.length === 0 ? (...) : (
            <>
                <div className={`shrink-0 grid ${GRID_COLS} ... h-10 bg-slate-950 sticky top-0 z-10 ...`}>
                    {/* 헤더 */}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto bg-slate-900">
                    {groups.map(g => (...))}
                </div>
            </>
        )}
    </div>
);
```
최상위 div에 `h-full flex flex-col` 적용(부모가 준 520px를 명시적으로 채움), 헤더는 `shrink-0`로 고정, 바디는 `flex-1 min-h-0 overflow-y-auto`로 남는 세로 공간을 전부 차지(플레이타입이 적으면 여백으로 채워지고, 아주 많아지면 자체 스크롤).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `PlayTypeStats.tsx`/`GamePbpTab.tsx` 관련 오류 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `PlayTypeStats.tsx`를 Before 블록으로 되돌리면 됨(`h-full flex flex-col`/`shrink-0`/`flex-1 min-h-0` 제거).

---

## 2026-08-03 — 경기 기록 탭 PBP/플레이타입 좌우 높이 불일치 "수정" v1 (틀린 진단 — v2로 대체됨)

**배경**: 위 v2 항목 참고. 이 v1은 `min-h-0` 누락이 원인이라고 잘못 진단해 적용했으나, `overflow-y-auto`가 걸린 요소는 스펙상 이미 `min-height:auto`가 0으로 처리되어 아무 효과가 없었음(사용자가 하드리프레시 후에도 동일하다고 확인). 기록만 남기고 실제 롤백 대상은 아님(단순 무해한 중복 클래스라 v2 이후에도 그대로 둠).

**변경 파일**: `components/game/tabs/GamePbpTab.tsx`

**Before**: `<div className="flex-[5] min-w-0 overflow-y-auto custom-scrollbar">`
**After**: `<div className="flex-[5] min-w-0 min-h-0 overflow-y-auto custom-scrollbar">`

**교훈**: 코드만 보고 CSS 레이아웃 버그를 진단할 때, `align-items:stretch`가 "몇 단계 아래 자식까지" 늘려준다고 착각하기 쉬움 — stretch는 딱 그 flex 컨테이너의 **직계 자식**까지만 적용되고, 그 안의 일반 block 자식은 명시적으로 `h-full`을 주지 않으면 늘어나지 않는다.

---

## 2026-08-03 — 경기 결과 화면(멀티) 6탭 → 1페이지 통합(스크롤스파이 네비게이션)

**배경**: "경기 결과 화면의 박스스코어, 샷차트, 경기 기록, 로테이션, 인사이트, 온오프를 모두 한 탭으로 통합"하라는 요청. 순서는 인사이트 > 박스스코어 > 경기기록 > 샷차트 > 로테이션 > 온오프. 대상은 `views/multi/season/MultiGamePbpView.tsx`의 `showBox`(경기 종료) 분기 — 라이브 경기 3분할 화면(`!showBox`)은 별도 분기라 영향 없음. `finalTab` 상태가 이 블록 안에서만 쓰이는 걸 확인해서 안전하게 제거 가능함을 미리 검증. 사용자에게 (1) 탭 자리에 섹션 이동용 네비게이션 바를 남길지, (2) 각 섹션에 제목을 넣을지 물어봤고 둘 다 "예"로 확정.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx` (client, UI 전용 — 서버 미러 없음)

**Before**:
- `finalTab`/`setFinalTab` 상태(6개 중 1개만 선택)로 탭 버튼 클릭 시 해당 컴포넌트 1개만 조건부 렌더링, 나머지는 DOM에서 완전히 빠짐.
- 탭 바: 6개 라벨 버튼, 클릭 시 `setFinalTab(id)`로 전환, 활성 탭만 `text-indigo-400 border-indigo-400`.
- 스크롤 컨테이너: `finalTab === 'box' || ... ? '' : 'p-6'` — insights만 패딩, 나머지는 flush.

**After**:
1. `finalTab` 상태 제거 → `activeSection`(현재 스크롤로 보고 있는 섹션, 스크롤스파이로 갱신) + `sectionRefs`(6개 섹션 DOM 참조) + `resultScrollRef`(스크롤 컨테이너 참조)로 교체.
2. `showBox`가 정의된 직후에 `IntersectionObserver` `useEffect` 추가 — 뷰포트 상단 30% 안에 처음 걸리는 섹션(`rootMargin: '0px 0px -70% 0px'`)을 `activeSection`으로 설정(early return보다 위에 배치 — 훅은 조건부 호출 불가).
3. 탭 바는 그대로 남기되 동작만 전환: 라벨 순서를 인사이트/박스스코어/경기기록/샷차트/로테이션/온오프로 재배열, `onClick`은 `sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })`로 변경, 활성 하이라이트는 `activeSection === t.id` 기준.
4. 6개 컴포넌트를 조건부 렌더링 대신 요청 순서대로 `<section data-section="..." ref={...}>` 6개를 세로로 나열, 각 섹션 상단에 `<h3>` 제목 추가(`text-sm font-black uppercase text-slate-500 tracking-widest`). 섹션 사이는 `border-b border-slate-800`로 구분.
5. 패딩: 원래 flush(카드 해체) 디자인이던 박스스코어/경기기록/샷차트/로테이션/온오프는 컨텐츠 자체를 그대로 flush 유지(제목에만 `px-6`), 원래 `p-6` 패딩이 필요했던 인사이트만 섹션 전체에 `px-6 pt-6 pb-10` 적용 — 각 컴포넌트의 기존 "카드 해체"/flush 디자인 의도를 그대로 보존.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `MultiGamePbpView.tsx` 관련 오류 없음. `finalTab`/`setFinalTab` 잔여 참조 없음(grep 확인, 주석만 남음). `App.tsx`가 실제로 임포트하는 파일이 이 파일(비-legacy)인 것도 확인 — `MultiGamePbpView.legacy.tsx`는 미사용 dead code라 손대지 않음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `finalTab`/`setFinalTab` state 선언과 6개 `{finalTab === '...' && (...)}` 조건부 렌더링 + 원래 탭 버튼 바(`setFinalTab` onClick)로 되돌리면 됨. IntersectionObserver `useEffect`와 `activeSection`/`sectionRefs`/`resultScrollRef` 선언도 함께 제거.

---

## 2026-08-03 — 로테이션 탭(멀티) 사방 보더를 박스스코어 탭과 동일하게 수정

**배경**: "로테이션 탭의 테이블에도 상하좌우에 보더라인이 들어가있는것같아. 다른 탭의 테이블과 동일하게 고쳐줘"라는 요청. 스크린샷 비교(로테이션 vs 박스스코어) 결과, 멀티플레이어 좌우분할(`splitLayout`) 모드에서 `RotationChart.tsx`의 `TeamRotationCard`가 **팀 헤더 바(로고/배지+팀명)까지 포함한 카드 전체**에 사방 `border`를 걸고 있어서, 팀 헤더 바 윗줄까지 박스처럼 통째로 둘러싸여 보였음. 반면 `BoxScoreTable.tsx`(표준 참조)는 팀 헤더 바엔 `border-l border-r`만 걸고, 사방 `border`는 그 아래 컬럼헤더+로우를 감싸는 `Table` 컴포넌트가 별도로 전담 — 그래서 팀 헤더 바 윗줄은 열려있고 컬럼헤더부터 박스가 시작되는 모양. `RotationChart`도 동일 구조로 맞춤.

**변경 파일**: `components/game/RotationChart.tsx` (client, UI 전용 — 서버 미러 없음)

**Before** (`TeamRotationCard`):
```tsx
const TeamRotationCard: React.FC<{...}> = ({ team, badge, standalone, children }) => (
    <div className={standalone
        ? "w-full bg-slate-900 border border-slate-800 relative"
        : "w-full bg-slate-900 border-y border-slate-800 relative"
    }>
        <div className="px-6 py-4 bg-slate-950/80 flex items-center justify-between border-b border-slate-800">
            {/* 팀 로고/배지 + 이름 */}
        </div>

        <div className="grid h-10 bg-slate-950 border-b border-slate-800" style={{...}}>
            {/* Q1~Q4 컬럼헤드 */}
        </div>

        {children}
    </div>
);
```

**After**:
```tsx
const TeamRotationCard: React.FC<{...}> = ({ team, badge, standalone, children }) => (
    <div className={standalone
        ? "w-full relative"
        : "w-full bg-slate-900 border-y border-slate-800 relative"
    }>
        <div className={`px-6 py-4 bg-slate-950/80 flex items-center justify-between ${standalone ? 'border-l border-r border-slate-800' : 'border-b border-slate-800'}`}>
            {/* 팀 로고/배지 + 이름 */}
        </div>

        <div className={standalone ? "bg-slate-900 border border-slate-800 shadow-lg" : "bg-slate-900"}>
            <div className="grid h-10 bg-slate-950 border-b border-slate-800" style={{...}}>
                {/* Q1~Q4 컬럼헤드 */}
            </div>

            {children}
        </div>
    </div>
);
```
사방 `border`(+`shadow-lg`, standalone 모드에서만)를 바깥 div에서 컬럼헤드+로우를 감싸는 새 안쪽 wrapper로 이동. 비분할(상하 배치, `standalone=false`) 모드는 기존과 동일하게 유지(회귀 없음).

**부수 수정**: 같은 파일에서 다른 세션이 이미 진행 중이던 미커밋 작업(스틴트별 +/- 색상, 핫/콜드 스트릭 마커, 교체사유 호버 툴팁 등)에서 `PlayerRow`의 `segments` prop 타입에 `outReason` 필드가 누락돼 있던 기존 타입 오류 1건도 함께 수정(`types/engine.ts`의 `RotationData`엔 이미 `outReason?: RotationOutReason`이 정의돼 있었음 — 타입만 맞춤, 로직 변경 없음):
```tsx
// Before
segments: { in: number, out: number }[],
// After
segments: { in: number, out: number, outReason?: RotationOutReason }[],
```

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json`에서 `RotationChart.tsx`/`GameOnOffTab.tsx`/`MultiGamePbpView.tsx` 관련 오류 없음(남은 오류는 전부 이번 작업과 무관한 다른 파일들의 기존 이슈). UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `TeamRotationCard`의 클래스를 Before 블록으로 되돌리면 됨. `outReason` 타입 수정은 순수 타입 추가라 되돌려도 동작엔 영향 없음(다만 되돌리면 다시 컴파일 에러 발생).

---

## 2026-08-03 — 온오프 탭 좌/우 분할이 비대칭으로 보이는 착시 수정(스크롤바 숨김)

**배경**: "온오프 탭의 좌/우 섹션이 1대1 비율이 아닌거같은데 확인해봐"라는 요청. 코드 확인 결과 `GameOnOffTab.tsx`의 좌(원정)/우(홈) 분할은 `grid grid-cols-1 lg:grid-cols-2 gap-0`로 Tailwind 기본 `minmax(0,1fr)` 두 트랙이라 실제로는 정확히 1:1. 사용자가 스크린샷으로 원인을 직접 짚어줌: 이 탭을 감싸는 부모 스크롤 컨테이너(`views/multi/season/MultiGamePbpView.tsx:1885`, `overflow-y-auto`)가 온오프 탭처럼 행이 많은 콘텐츠에서 세로 스크롤바를 띄우는데, 좌/우 둘 다 여백이 0(`gap-0`, 부모도 `p-6` 없이 flush)이라서 우측(홈) 테이블만 스크롤바에 바로 맞닿아 좌측(원정)보다 좁아 보이는 착시가 발생.
1차로 우측에 `pr-2` 여백을 줘서 스크롤바와 띄우는 방식으로 고쳤으나, 사용자가 "그냥 스크롤바를 없애면 되잖아"라고 지적 → 여백 보정 대신 스크롤바 자체를 숨기는 방식으로 재수정(스크롤 기능 자체는 유지, 시각적 트랙만 제거).

**변경 파일** (전부 UI 전용 — 서버 미러 없음):
- `components/game/tabs/GameOnOffTab.tsx` — `pr-2` 되돌림(원상복구)
- `views/multi/season/MultiGamePbpView.tsx` — 스크롤 컨테이너에 기존 유틸리티 클래스 `custom-scrollbar-hide`(`index.css:164-165`, `::-webkit-scrollbar{display:none}` + `scrollbar-width:none`) 추가

**Before** (`views/multi/season/MultiGamePbpView.tsx`):
```tsx
<div className={`flex-1 min-h-0 overflow-y-auto ${finalTab === 'box' || finalTab === 'shotchart' || finalTab === 'rotation' || finalTab === 'onoff' || finalTab === 'pbp' ? '' : 'p-6'}`}>
```

**After**:
```tsx
<div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar-hide ${finalTab === 'box' || finalTab === 'shotchart' || finalTab === 'rotation' || finalTab === 'onoff' || finalTab === 'pbp' ? '' : 'p-6'}`}>
```
이 컨테이너는 box/shotchart/rotation/onoff/pbp 5개 탭이 공유 — 스크롤바를 숨기면 5개 탭 전체에서 동일한 비대칭 착시 여지가 사라짐(그동안 onoff만 행이 많아 스크롤바가 거의 항상 뜨는 바람에 유독 눈에 띄었을 뿐, 잠재적으로 같은 컨테이너를 쓰는 다른 탭에도 해당하는 문제였음).

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json` 에러 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: `views/multi/season/MultiGamePbpView.tsx`에서 `custom-scrollbar-hide` 클래스만 제거하면 됨(스크롤 기능 자체는 `overflow-y-auto`가 그대로 유지하므로 동작에는 영향 없음).

---

## 2026-08-03 — PBP 로그 테이블에 박스스코어/플레이타입 디자인 통일 적용

**배경**: "PBP로그 테이블도 박스스코어 테이블과 동일한 디자인을 적용해야해. 플레이타입 테이블처럼 말야"라는 요청. `PlayTypeStats.tsx`(플레이타입 패널)는 이미 박스스코어 공용 컴포넌트(`components/common/Table.tsx`)의 헤더/바디 톤(bg-slate-950 sticky 헤더 + text-slate-500 font-black uppercase 라벨, bg-slate-900 바디, hover:bg-white/5만 있고 zebra 없음)을 손으로 복제해 시각적으로 맞춰둔 상태였는데, PBP 로그 3개 뷰는 그 디자인 언어를 전혀 따르지 않고 있었음(컬럼 헤더 라벨 행 자체가 없음, 컨테이너 배경 없음, 파일별로 zebra 유무가 제각각).

**변경 파일** (전부 UI 전용 — 서버 미러 없음):
- `components/game/tabs/GamePbpTab.tsx`
- `views/LiveGameView.tsx`
- `views/multi/season/MultiGamePbpView.tsx`

**Before** (3개 파일 공통 패턴, `GamePbpTab.tsx` 예시):
```tsx
<div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar font-mono text-xs md:text-sm">
<div className="divide-y divide-slate-800/50">
    {displayLogs.map((log, idx) => { ... })}
</div>
</div>
```
컬럼 헤더 라벨 행 없음, 컨테이너 배경 없음. `LiveGameView.tsx`/`MultiGamePbpView.tsx`는 추가로 행마다 `i % 2 === 0 ? 'bg-slate-800/30' : ''` 형태의 zebra 줄무늬가 있었고, 쿼터 전환 등 흐름 이벤트 배너도 `i % 2 === 0 ? 'bg-slate-800/40' : 'bg-slate-800/20'`로 짝/홀 두 톤을 번갈아 썼음.

**After**:
1. 스크롤 컨테이너에 `bg-slate-900` 추가(`Table.tsx`의 `TableBody`/`PlayTypeStats`의 바디 톤과 동일).
2. 로그 리스트 위에 컬럼 헤더 행 신규 삽입 — `bg-slate-950 sticky top-0 z-10 border-b border-slate-800 shadow-sm` + 라벨 `text-xs font-black uppercase text-slate-500`(`PlayTypeStats.tsx`의 헤더 행과 동일 톤). 데이터 행과 동일한 `w-*`/`gap-*`/`px-*`로 컬럼 폭을 맞춤.
   - `GamePbpTab.tsx`: `gap-4 px-4 h-10`, 컬럼 Q(w-6)/시간(w-12)/원정(w-8)/스코어(w-16)/홈(w-8)/기록(flex-1)
   - `LiveGameView.tsx`: `gap-3 px-3 h-8`, 컬럼 Q(w-5)/시간(w-10)/원(w-5, 로고 컬럼이라 1글자로 축약)/점수(w-12)/홈(w-5)/기록(flex-1)
   - `MultiGamePbpView.tsx`: `gap-3 px-3 h-8`, 컬럼 Q(w-5)/시간(w-10)/원정(w-8)/점수(w-12)/홈(w-8)/기록(flex-1)
3. `LiveGameView.tsx`/`MultiGamePbpView.tsx`에서 zebra 제거 → 박스스코어/플레이타입과 동일하게 `hover:bg-white/5 transition-colors`만 적용(부상 로그의 빨간 배경 강조는 유지). 흐름 이벤트 배너도 짝/홀 두 톤 대신 `bg-indigo-500/10 border-y border-indigo-500/20` 단일 톤으로 통일(기존 텍스트 색 `text-indigo-300`과 어울리는 톤).

예시(`LiveGameView.tsx` 헤더 삽입부):
```tsx
<div className="flex-1 min-h-0 overflow-y-auto font-mono text-xs bg-slate-900" style={...}>
    <div className="flex items-center gap-3 px-3 h-8 bg-slate-950 sticky top-0 z-10 border-b border-slate-800 shadow-sm">
        <div className="flex-shrink-0 w-5 text-center text-xs font-black uppercase text-slate-500">Q</div>
        <div className="flex-shrink-0 w-10 text-center text-xs font-black uppercase text-slate-500">시간</div>
        <div className="flex-shrink-0 w-5 flex justify-center text-xs font-black uppercase text-slate-500">원</div>
        <div className="flex-shrink-0 w-12 text-center text-xs font-black uppercase text-slate-500">점수</div>
        <div className="flex-shrink-0 w-5 flex justify-center text-xs font-black uppercase text-slate-500">홈</div>
        <div className="flex-1 text-xs font-black uppercase text-slate-500">기록</div>
    </div>
    <div className="divide-y divide-slate-800/50">...</div>
</div>
```
`GamePbpTab.tsx`는 원래 zebra가 없었으므로(hover만 사용 중이었음) zebra 제거 작업은 해당 없음 — 헤더 행 추가와 배경색만 적용.

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json` 3개 파일 모두 에러 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 각 파일에서 (1) 스크롤 컨테이너의 `bg-slate-900` 제거, (2) 삽입한 컬럼 헤더 `<div>` 블록 삭제, (3) `LiveGameView.tsx`/`MultiGamePbpView.tsx`의 `hover:bg-white/5 transition-colors`를 원래의 `i % 2 === 0 ? 'bg-slate-800/30' : ''` 삼항식으로, 흐름 이벤트 배너를 `i % 2 === 0 ? 'bg-slate-800/40' : 'bg-slate-800/20'`로 되돌리면 됨. 3개 파일이 서로 독립적이라 개별 롤백 가능.

---

## 2026-08-03 — 선수교체 PBP 로그: 아이콘 제거 + "{팀 약어} 선수교체" 헤더 추가

**배경**: 선수교체("교체:") PBP 로그 UI 정리 요청 2건. (1) IN/OUT 앞의 UserPlus/UserMinus 아이콘이 불필요해 제거. (2) 교체 블록 맨 윗줄에 어느 팀의 교체인지 표시하는 "{팀 약어} 선수교체" 텍스트 추가(흰색 볼드로 1차 적용) → 사용자가 스크린샷 첨부하며 "다른 커멘터리(리바운드 등 일반 로그)와 비교했을 때 너무 두껍고 밝다"고 재지적 → 일반 커멘터리와 동일한 톤(`text-slate-400`, 볼드 아님)으로 재조정.
`views/multi/season/MultiGamePbpView.tsx`는 애초에 아이콘이 없었고, 이미 별도 원정/홈 약어 컬럼으로 팀을 표시 중이라 이번 변경 범위에서 제외(아이콘 제거 때와 동일 스코프).

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client, UI 전용 — 서버 미러 없음)
- `views/LiveGameView.tsx` (client, UI 전용 — 서버 미러 없음)

**Before** (`components/game/tabs/GamePbpTab.tsx`):
```tsx
import { ArrowRight, UserPlus, UserMinus, Clock } from 'lucide-react';
...
const renderLogContent = (text: string, homeTeam: Team, awayTeam: Team) => {
    if (text.startsWith('교체:')) {
        const inMatch = text.match(/IN \[(.*?)\]/);
        const outMatch = text.match(/OUT \[(.*?)\]/);
        if (inMatch && outMatch) {
            const inPlayers = inMatch[1].split(',').map(s => s.trim());
            const outPlayers = outMatch[1].split(',').map(s => s.trim());
            return (
                <div className="flex flex-col gap-1 text-xs md:text-sm">
                    <div className="flex items-center gap-2 text-emerald-400">
                        <UserPlus size={14} />
                        <span>IN:</span>
                        ...
                    <div className="flex items-center gap-2 text-red-400">
                        <UserMinus size={14} />
                        <span>OUT:</span>
                        ...
```
호출부: `{renderLogContent(log.text, homeTeam, awayTeam)}`

**After** (`components/game/tabs/GamePbpTab.tsx`):
```tsx
import { ArrowRight, Clock } from 'lucide-react';
...
const renderLogContent = (text: string, homeTeam: Team, awayTeam: Team, teamId?: string) => {
    if (text.startsWith('교체:')) {
        const inMatch = text.match(/IN \[(.*?)\]/);
        const outMatch = text.match(/OUT \[(.*?)\]/);
        if (inMatch && outMatch) {
            const inPlayers = inMatch[1].split(',').map(s => s.trim());
            const outPlayers = outMatch[1].split(',').map(s => s.trim());
            const subTeamAbbr = teamId === homeTeam.id ? homeAbbr : awayAbbr;
            return (
                <div className="flex flex-col gap-1 text-xs md:text-sm">
                    <div className="text-slate-400">{subTeamAbbr} 선수교체</div>
                    <div className="flex items-center gap-2 text-emerald-400">
                        <span>IN:</span>
                        ...
                    <div className="flex items-center gap-2 text-red-400">
                        <span>OUT:</span>
                        ...
```
호출부: `{renderLogContent(log.text, homeTeam, awayTeam, log.teamId)}`

**Before** (`views/LiveGameView.tsx`):
```tsx
import { UserPlus, UserMinus, Clock, Users } from 'lucide-react';
...
<div className="flex-1 flex flex-col gap-0.5 text-xs">
    <div className="flex items-center gap-1.5 text-emerald-400">
        <UserPlus size={11} />
        <span>IN:</span>
        ...
    <div className="flex items-center gap-1.5 text-red-400">
        <UserMinus size={11} />
        <span>OUT:</span>
        ...
```

**After** (`views/LiveGameView.tsx`):
```tsx
import { Clock, Users } from 'lucide-react';
...
<div className="flex-1 flex flex-col gap-0.5 text-xs">
    <div className="text-slate-400">
        {(isHome ? homeTeam.id : awayTeam.id).toUpperCase().slice(0, 3)} 선수교체
    </div>
    <div className="flex items-center gap-1.5 text-emerald-400">
        <span>IN:</span>
        ...
    <div className="flex items-center gap-1.5 text-red-400">
        <span>OUT:</span>
        ...
```
(1차로 `text-white font-bold` 적용했다가 사용자 피드백으로 `text-slate-400`으로 재조정 — 일반 로그의 기본 텍스트 컬러/굵기와 동일)

**검증**: `npx vite build` 클린 통과, `npx tsc --noEmit -p tscheck.json` 두 파일 모두 에러 없음. UI 전용 변경으로 서버 엔진 미러/Fly.io 배포 불필요.

**롤백 방법**: 위 Before 블록으로 되돌리고 `UserPlus`/`UserMinus` import를 복원하면 됨. 두 파일 모두 독립적이라 개별 롤백 가능.

---

## 2026-08-03 — PBP 탭 스코어 재계산 버그 수정(테크니컬 파울 FT의 teamId 오귀속)

**배경**: `T_R5_M0_G6`(TEST 14) 경기의 리뷰 화면 스코어(99:101)와 "경기 기록" 탭 PBP 로그의 표시
스코어(100:100)가 다르다는 제보. Network 탭으로 실제 API 응답을 확인한 결과 서버는 처음부터
정확한 값(99:101)을 내려주고 있었음(`/live-game` 응답, DB `game_pbp` 원본 모두 확인) — 즉 100%
클라이언트 렌더링 버그로 범위 확정.

원인 추적 결과 `components/game/tabs/GamePbpTab.tsx`(싱글/멀티 공용, `GameResultView`와
`MultiGamePbpView` 양쪽에서 재사용)의 `processedLogs`가 각 이벤트에 이미 저장된 정확한 스코어
스냅샷(`homeScore`/`awayScore`)을 무시하고, `points`+`teamId`로 경기 시작부터 다시 처음부터
합산하고 있었음. 이 로직은 "`teamId`=이 포인트를 득점한 팀"이라고 항상 가정하는데, **테크니컬
파울 자유투 이벤트는 `teamId`가 파울을 범한 팀(피해를 주는 쪽)**으로 설정돼 있어(일반 슈팅파울이
`teamId`=슈터 팀 + `foulTeamId`=파울한 팀으로 분리해둔 것과 다른 컨벤션) 이 가정이 깨짐. 실제로
3쿼터 0:24 "데니 아브디야(SEA), 테크니컬 파울... 래리 버드(ORL) 자유투 1/1" 이벤트에서
`teamId:"sea"`인데 실제 득점은 ORL이 했음 — 이 한 번의 오귀속이 그 뒤로 계속 SEA +1 / ORL -1로
누적돼 경기 끝까지 어긋난 채 이어짐(실제 이 로직을 Node로 재현해보니 정확히 100:100이 나와
스크린샷과 일치 확인).

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client, 싱글/멀티 공용) — `processedLogs`의 스코어
  계산을 `points`+`teamId` 재합산 방식에서, 각 이벤트에 저장된 `homeScore`/`awayScore`를 그대로
  쓰는 방식으로 교체(스냅샷이 없는 극초반 이벤트만 이전 값을 유지)

**Before**:
```ts
const processedLogs = useMemo(() => {
    if (!logs) return [];
    let hScore = 0;
    let aScore = 0;

    return logs.map(log => {
        const points = log.points || 0;
        if (points > 0) {
            if (log.teamId === homeTeam.id) hScore += points;
            else aScore += points;
        }
        return { ...log, homeScore: hScore, awayScore: aScore } as ProcessedLog;
    });
}, [logs, homeTeam.id]);
```

**After**:
```ts
const processedLogs = useMemo(() => {
    if (!logs) return [];
    let hScore = 0;
    let aScore = 0;

    return logs.map(log => {
        if (log.homeScore != null && log.awayScore != null) {
            hScore = log.homeScore;
            aScore = log.awayScore;
        }
        return { ...log, homeScore: hScore, awayScore: aScore } as ProcessedLog;
    });
}, [logs]);
```

**검증**:
- DB에서 `T_R5_M0_G6`의 전체 events(361개)를 실제로 가져와 Before/After 로직을 Node로 각각
  재현 — Before는 정확히 100:100(스크린샷과 일치, 버그 재현 성공), After는 101:99(DB 원본과
  일치, 수정 확인)
- `tsc`/브레이스 균형 확인, `npm run build` 성공. client 전용 변경이라 서버 재배포 불필요

**주의사항 / 한계**:
- 테크니컬 파울 FT 이벤트의 `teamId` 시맨틱 자체(파울한 팀 vs 득점 팀)는 엔진 쪽에 그대로
  남아있음 — 이번엔 그 값에 의존하지 않도록 소비 측(`GamePbpTab.tsx`)만 고침. 엔진 쪽 `teamId`를
  다른 스코어링 이벤트와 통일할지는 별도 논의 필요(현재는 저장된 스코어 자체는 정확해서 게임
  결과·박스스코어·순위에는 영향 없음)
- 같은 파일에서 발견된 **별개의 유사 버그**(`MultiGamePbpView.tsx`의 `QuarterScores`, 오귀속이
  아니라 누락 — ORL 쿼터 합계가 1점 적게 나옴)는 바로 아래 항목에서 이어서 수정함

**롤백 방법**: 위 Before 블록으로 되돌리면 됨.

---

## 2026-08-03 — 쿼터별 스코어 표(QuarterScores) 누락 버그 수정 (테크니컬 파울 FT)

**배경**: 바로 위 항목(`GamePbpTab.tsx` 스코어 재계산 버그)과 같은 원인 데이터(3쿼터 0:24 테크니컬
파울 자유투, `teamId:"sea"`인데 실제 득점은 ORL)에서 파생된 별개 버그. `MultiGamePbpView.tsx`의
`QuarterScores`(쿼터별 득점 표)가 `log.type === 'score' || 'freethrow'`만 필터링해서 합산하는데,
테크니컬 파울 자유투는 `type: 'foul'`이라 이 필터에서 통째로 빠짐 — 오귀속이 아니라 **득점 자체가
집계에서 누락**되는 문제(쿼터별 표의 ORL 합계가 101 아닌 100으로 표시, 원본 스크린샷에서 헤더
큰 숫자는 101로 맞고 쿼터표 합계만 100으로 나온 게 바로 이 버그였음).

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client) — `QuarterScores`의 `scores` 계산을
  `type`/`teamId` 필터링 합산 방식에서, 각 쿼터 종료 시점의 저장된 스코어 스냅샷 차분(delta)
  방식으로 교체

**Before**:
```ts
const scores = useMemo(() => {
    const home = [0, 0, 0, 0];
    const away = [0, 0, 0, 0];
    for (const log of allLogs) {
        if (log.type === 'score' || log.type === 'freethrow') {
            const pts = log.points ?? 0;
            const qi  = Math.min(3, log.quarter - 1);
            if (log.teamId === homeTeamId) home[qi] += pts;
            else away[qi] += pts;
        }
    }
    return { home, away };
}, [allLogs, homeTeamId]);
```

**After**:
```ts
const scores = useMemo(() => {
    const qEndHome: (number | null)[] = [null, null, null, null];
    const qEndAway: (number | null)[] = [null, null, null, null];
    let lastHome = 0, lastAway = 0;
    for (const log of allLogs) {
        if (log.homeScore != null && log.awayScore != null) {
            lastHome = log.homeScore;
            lastAway = log.awayScore;
        }
        const qi = Math.min(3, log.quarter - 1);
        qEndHome[qi] = lastHome;
        qEndAway[qi] = lastAway;
    }

    const home = [0, 0, 0, 0];
    const away = [0, 0, 0, 0];
    let prevHome = 0, prevAway = 0;
    for (let i = 0; i < 4; i++) {
        if (qEndHome[i] == null) break;
        home[i] = qEndHome[i]! - prevHome;
        away[i] = qEndAway[i]! - prevAway;
        prevHome = qEndHome[i]!;
        prevAway = qEndAway[i]!;
    }
    return { home, away };
}, [allLogs]);
```

**검증**:
- `T_R5_M0_G6`의 실제 events(361개)로 Before/After 로직을 Node로 재현 — Before: ORL 쿼터별
  `[24,32,21,23]`=100(스크린샷과 정확히 일치, 3쿼터에서 21로 1점 누락 확인), After:
  `[24,32,22,23]`=101(3쿼터가 22로 정정, 헤더의 101과 일치). SEA는 Before/After 둘 다
  `[30,25,26,18]`=99로 불변(원래부터 이 버그의 영향을 안 받았음 — 누락이었을 뿐 오귀속은 아니었으므로)
- 브레이스 균형 확인, `npm run build` 성공. client 전용 변경, 서버 재배포 불필요

**주의사항 / 한계**:
- `homeTeamId` prop이 이 컴포넌트 내부에서는 더 이상 안 쓰이게 됐지만, 6곳의 호출부에서 여전히
  전달하고 있어 prop 자체는 그대로 남겨둠(제거하려면 6곳을 함께 고쳐야 해서 이번 범위에서 제외 —
  무해한 미사용 prop)

**롤백 방법**: 위 Before 블록으로 되돌리면 됨.

---

## 2026-08-03 — 토너먼트 2라운드 이상 경기의 숏코드 미생성 버그 수정 + 백필

**배경**: "TEST 14" 세션(`xrhzjwf5`)에서 5라운드 경기(`T_R5_M0_G6`) URL이 짧은 코드 대신 원래
game_id로 노출된다는 제보. `game_short_codes` 테이블 조회 결과 이 방의 코드 112개가 전부 같은
시각에 한 번에 생성돼 있었음(=드래프트 완료 직후 최초 일정, 32강 1라운드 16시리즈×best-of-7=112) —
`insertGameShortCodes()`가 `finalize.ts`에만 있고, 이후 라운드가 진행되며 `simRunner.ts`의
`advanceTournamentState()`가 다음 라운드 경기를 새로 만드는 지점에는 호출되지 않아, 2라운드 이상
경기는 영원히 숏코드가 안 생기는 구조적 버그였음. 전체 30개 방 중 28개가 숏코드 0건(기능 자체가
2026-08-01에 추가돼 그 이전 방은 전혀 커버 안 됨), 최근 2개(TEST 14/13)만 1라운드분만 있었음.

**변경 파일**:
- `server/src/finalize.ts` — `insertGameShortCodes()` `export` 추가(기존엔 모듈 비공개)
- `server/src/simRunner.ts` — `handleTournamentAdvance()`의 `advanceTournamentState()` 호출 직후,
  새로 추가된 경기(`newlyAddedGames`)에 대해 `insertGameShortCodes()` 호출 추가

**Before**:
```ts
advanceTournamentState(
    series, bracketSchedule, seriesObj.targetWins, finalsTargetWins, startDate, intervalMinutes,
    leagueRow.sim_real_start_at as string | null,
);

const existingIds = new Set(updatedSchedule.map((g: any) => g.id));
for (const g of bracketSchedule) {
    if (!existingIds.has(g.id)) updatedSchedule.push(g as any);
}
```

**After**:
```ts
advanceTournamentState(
    series, bracketSchedule, seriesObj.targetWins, finalsTargetWins, startDate, intervalMinutes,
    leagueRow.sim_real_start_at as string | null,
);

const existingIds = new Set(updatedSchedule.map((g: any) => g.id));
const newlyAddedGames: { id: string }[] = [];
for (const g of bracketSchedule) {
    if (!existingIds.has(g.id)) {
        updatedSchedule.push(g as any);
        newlyAddedGames.push({ id: g.id });
    }
}
if (newlyAddedGames.length > 0) {
    await insertGameShortCodes(roomId, newlyAddedGames).catch(err =>
        console.error(`[simRunner] insertGameShortCodes 실패(${roomId}):`, err),
    );
}
```

**데이터 백필**: 사용자가 "TEST 14만" 백필 요청 — 해당 방(`1b61f551-a219-4040-8e66-941fc7de94fe`)의
숏코드 없는 기존 2~5라운드 경기 93개(제보하신 `T_R5_M0_G6` 포함)에 SQL로 직접 `gen_random_uuid()`
기반 8자 코드 생성해 삽입. 다른 29개 방(대부분 죽은 테스트 세션)은 백필하지 않음 — 필요 시 동일
쿼리 패턴 재사용 가능.

**검증**:
- 브레이스 균형 확인, `tsc --noEmit` 신규 에러 없음(기존 무관 에러 `archiveTournament` 타입 불일치는
  그대로 존재, 이번 변경과 무관)
- `fly deploy -a basketballgm-app-server` 배포 후 헬스체크 200, 정상 재기동 확인
- 백필 후 방 전체 숏코드 개수가 배포된 새 로직으로 실시간 증가하는 것도 확인(백필 시점엔 93개
  누락이었는데 삽입 직후 재조회 시 205개로 늘어있어, 배포된 수정이 진행 중인 토너먼트에서 새
  라운드가 생성될 때마다 실제로 코드를 만들어주고 있음을 실측으로 확인)
- `T_R5_M0_G6` → 숏코드 `fa8c8415` 정상 부여 확인(중복 없음)

**주의사항 / 한계**:
- `game_short_codes.short_code`에 전역 유니크 제약이 있는데, 처음 앱과 동일한 32자 커스텀
  알파벳(`23456789abcdefghjkmnpqrstuvwxyz`)으로 SQL에서 직접 생성하려다 반복적으로 8자보다 짧은
  문자열이 나와 삽입이 실패함(`substr`/`floor(random()*32)+1` 조합에서 원인 미상의 길이 축소 발생,
  깊게 파보지 않고 `gen_random_uuid()` 기반 hex 8자로 우회) — 백필된 93개는 앱이 평소 쓰는 코드와
  글자 구성이 다르지만(hex vs 커스텀 알파벳) URL 동작 자체엔 차이 없음
- 나머지 29개 방은 미백필 상태로 남아있음

**롤백 방법**: 코드는 위 Before 블록으로 두 파일 되돌리면 됨. 백필 데이터는 되돌릴 필요 없음(추가된
행이 기존 동작을 깨지 않음 — 굳이 제거하려면 `created_at > '2026-08-03 06:22:00'` 조건으로 삭제).

---

## 2026-08-03 — 경기기록 탭 교체(IN/OUT) 로그 아이콘 제거

**배경**: PBP 로그의 교체(`교체: IN [...] OUT [...]`) 표시에서 IN/OUT 텍스트 앞에 붙던 lucide-react 아이콘(`UserPlus`/`UserMinus`)을 제거해달라는 요청. 엔진 쪽(`rotationLogic.ts`)은 원래도 이모지 없는 순수 텍스트 로그를 만들고, 아이콘은 UI 렌더링 단계에서만 붙어있었음.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용) — IN/OUT 앞 `<UserPlus size={14}/>`/`<UserMinus size={14}/>` 제거, 미사용 import 정리
- `views/LiveGameView.tsx` (client 전용) — 동일하게 `<UserPlus size={11}/>`/`<UserMinus size={11}/>` 제거, 미사용 import 정리
- `views/multi/season/MultiGamePbpView.tsx`는 원래 아이콘 없이 텍스트만 렌더링하고 있어서 변경 없음

**Before**: `<UserPlus size={14} /><span>IN:</span>...` / `<UserMinus size={14} /><span>OUT:</span>...` (LiveGameView는 size={11})

**After**: `<span>IN:</span>...` / `<span>OUT:</span>...` — 아이콘 없이 텍스트 라벨만 유지

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. 서버 엔진 미변경이라 Fly.io 배포 불필요.

**롤백 방법**: 두 파일에서 `<span>IN:</span>`/`<span>OUT:</span>` 앞에 각각 `<UserPlus size={14|11} />`/`<UserMinus size={14|11} />`를 다시 추가하고 lucide-react import에 `UserPlus, UserMinus`를 되돌리면 됨.

---

## 2026-08-03 — PBP 미스매치 커멘터리: 미드레인지 SCORE + MISS 전체 누락분 추가

**배경**: PBP 커멘터리 전체 리뷰를 마친 뒤 `isMismatch` 플래그를 전수조사. `flowEngine.ts`의 `calculateHitRate()`가 계산하는 일반 매치업 갭 체크(Rim/Paint는 strength 차이, Mid/3PT는 speed+agility 차이, 임계값 0.3 — 스위치/전술 무관하게 항상 켜짐)인데, 실제로 이 플래그를 체크하는 곳이 3점 SCORE·Rim/Paint SCORE 딱 2군데뿐이었음. **미드레인지 SCORE는 아예 안 봤고, MISS 브랜치 전체(3점/Rim·Paint/미드/속공/킥아웃/커버리지/블록/풋백 전부)가 한 번도 안 봤음** — `isMismatch`는 적중률만 ±12% 보정하지 결과를 확정하지 않으므로 미스매치 상황에서도 얼마든지 미스가 날 수 있는데 그 경우 전혀 반영이 안 되고 있었음.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)

**Before**: 미드레인지 SCORE에 `isMismatch` 체크 없음(shotType/assister 분기로 바로 진입). 3점 MISS·Rim/Paint MISS·미드 MISS 전부 `isMismatch` 체크 없이 shotType 분기로 바로 진입.

**After**: 4곳 모두 각 zone의 shotType 분기보다 먼저 `isMismatch` 우선순위 체크 추가:
```ts
// 미드레인지 SCORE (신규)
if (isMismatch) {
    return pick([
        `${actor.playerName}, 미스매치를 활용해 미드레인지 점퍼를 성공시킵니다!${scoreTag}`,
        `${actor.playerName}, 느린 수비를 앞에 두고 여유 있게 미드레인지 적중!${scoreTag}`,
        `${actor.playerName}, 미스매치 상대를 상대로 침착하게 점퍼 성공.${scoreTag}`
    ]);
}
```
(3점 MISS 2줄, Rim/Paint MISS 3줄, 미드 MISS 2줄도 동일 패턴으로 추가 — dev-log 본문 참고, 코드 diff 확인 시 `isMismatch가 SCORE에만 있고` 주석으로 검색 가능)

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋에서 추가한 4개의 `if (isMismatch) {...}` 블록(미드 SCORE, 3점/Rim·Paint/미드 MISS 각각)을 client+server 양쪽에서 제거하면 됨 — 시그니처 변경 없이 순수 추가라 롤백이 단순함.

---

## 2026-08-03 — PBP 플래그런트 1·2 커멘터리: playType 게이팅 + 이모지 전체 제거

**배경**: 테크니컬 파울 다음으로 `getFlagrant1Commentary()`/`getFlagrant2Commentary()`를 리뷰. 테크니컬과 동일한 패턴 확인 — `possessionHandler.ts`의 플래그런트 파울 체크도 슛/리바운드/플레이 해석보다 먼저 독립 롤로 결정되는데, 테크니컬과 달리 이 시점에 `selectedPlayType`은 이미 정해져서 결과 객체에 실려 있음(로깅용으로만 쓰이고 커멘터리엔 안 넘어가고 있었음). 그래서 "레이업을 막으려다"/"속공 중인 유니폼을 잡아끈다"/"포스트 수비 중 푸싱"/"스크린 상황에서 밀친다" 같은 문구들이 실제 playType과 무관하게 아무 때나 나올 수 있었음 — 파울 브랜치 때처럼 playType으로 게이팅(드라이브: Iso/PnR_Handler/DriveKick, 포스트·스크린: PostUp/PnR_Roll/PnR_Pop/OffBallScreen, 속공: Transition, 나머지는 리바운드/블록 등 playType으로 못 거르는 기본 풀). Flagrant 2의 "데드볼 상황에서" 문구도 테크니컬 때 발견한 것과 동일한 문제(라이브볼 트리거인데 데드볼 전제)라 교체. 추가로 사용자 요청에 따라 **커멘터리 전체(테크니컬 🟨, 플래그런트 🟥)에서 이모지 프리픽스 제거**, server 미러도 client와 완전 동기화(기존 4줄/4줄만 있던 걸 12줄/10줄 전체로).

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client) — `getTechnicalFoulCommentary`(이모지 제거), `getFlagrant1Commentary`/`getFlagrant2Commentary`(playType 파라미터 추가 + 게이팅 + 이모지 제거)
- `services/game/engine/pbp/statsMappers.ts` (client) — 3개 호출부(테크니컬/플래그런트1/2) 이모지 폴백 제거, 플래그런트 호출에 `playType` 전달
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러) — 동일 반영(플래그런트는 4줄→12줄/10줄 전체 신규 동기화)
- `server/src/shared/engine/pbp/statsMappers.ts` (server 미러) — 동일 반영

**Before** (client, Flagrant1 발췌):
```ts
export function getFlagrant1Commentary(defender: LivePlayer, actor: LivePlayer): string {
    return pick([
        `🟥 ${defender.playerName}, 돌파하는 ${actor.playerName}에게 과도한 신체 접촉! Flagrant 1.`,
        `🟥 ${defender.playerName}, 레이업을 막으려다 ${actor.playerName}의 상체를 거칠게 밀칩니다. Flagrant 1.`,
        // ... 12줄 전부 playType 무관하게 랜덤 pick
    ]);
}
```

**After**:
```ts
export function getFlagrant1Commentary(defender: LivePlayer, actor: LivePlayer, playType?: PlayType): string {
    if (playType === 'Iso' || playType === 'PnR_Handler' || playType === 'DriveKick') {
        return pick([
            `${defender.playerName}, 돌파하는 ${actor.playerName}에게 과도한 신체 접촉! Flagrant 1.`,
            `${defender.playerName}, 레이업을 막으려다 ${actor.playerName}의 상체를 거칠게 밀칩니다. Flagrant 1.`,
        ]);
    }
    if (playType === 'PostUp' || playType === 'PnR_Roll' || playType === 'PnR_Pop' || playType === 'OffBallScreen') { /* 포스트·스크린 2줄 */ }
    if (playType === 'Transition') { /* 속공 2줄 */ }
    return pick([/* 리바운드/블록/일반 리뷰 등 기본 6줄 */]);
}
```

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋의 Before 블록으로 4개 파일(client 2 + server 미러 2)을 되돌리면 됨 — 함수 시그니처가 바뀌었으니(playType 파라미터 추가) 4개 파일 다 같이 되돌려야 함.

---

## 2026-08-03 — PBP 테크니컬 파울 커멘터리: 트리거 상황과 안 맞는 문구 교체 + server 미러 15줄 동기화

**배경**: 리바운드 다음으로 `getTechnicalFoulCommentary()`를 리뷰. `possessionHandler.ts`의 테크니컬 파울 체크(3.6단계)가 슛 계산(5단계)보다 훨씬 전, 라이브볼 상황 중에 단순 확률 롤로 결정된다는 걸 확인 — "왜" 받았는지 구분하는 필드 자체가 엔진에 없음. 그런데 client 풀 15줄 중 "득점 후 과도한 세레모니"(득점 후 컨텍스트 전제)/"고의적인 경기 지연"(데드볼 행정 처리)/"상대 자유투 시 방해"(FT 컨텍스트)/"데드볼 상황에서 몸싸움"(명시적 데드볼) 4줄은 이 트리거가 절대 만들 수 없는 상황을 전제하고 있었음. 추가로 server 미러를 확인하니 애초에 15줄이 아니라 5줄만 동기화돼 있었고(이모지 🟨도 누락) — 이번에 client를 4줄 교체하면서 동시에 server를 client 전체 15줄로 맞춤.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러 — 5줄→15줄 전체 동기화 포함)

**Before** (client, 문제 4줄만 발췌):
```ts
`🟨 ${defender.playerName}, 득점 후 과도한 세레모니... 테크니컬 파울이 부과됩니다.`,
`🟨 ${defender.playerName}, 고의적인 경기 지연으로 테크니컬 파울.`,
`🟨 ${defender.playerName}, 상대 자유투 시 방해 행위로 테크니컬!`,
`🟨 ${defender.playerName}, 데드볼 상황에서 상대와 몸싸움... 테크니컬!`,
```

**After**:
```ts
`🟨 ${defender.playerName}, 몸싸움 중 상대를 향해 거친 말을 내뱉다 테크니컬!`,
`🟨 ${defender.playerName}, 판정에 불만을 참지 못하고 코트에 침을 뱉다 테크니컬 파울.`,
`🟨 ${defender.playerName}, 벤치를 향해 손짓하며 항의하다 테크니컬!`,
`🟨 ${defender.playerName}, 상대 선수를 밀치며 말다툼 끝에 테크니컬 파울.`,
```
(server는 기존 5줄에 위 client 15줄 전체를 그대로 반영 — 이모지 포함)

**검증**: `npx vite build` 클린. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: client는 위 Before 4줄로 되돌리면 됨. server는 원래 5줄(이모지 없이, "판정에 거세게 항의"~"심판과 언쟁 끝에" 5개)로 되돌리면 이전 상태로 복귀(단, 그 5줄 상태 자체가 원래도 불완전한 동기화였다는 점 참고).

---

## 2026-08-03 — PBP 리바운드 커멘터리: 슈터 본인 캐치 / 롱리바운드 세분화

**배경**: 파울 다음으로 `getReboundCommentary()`(독립 함수)를 리뷰. `resolveRebound()`(reboundLogic.ts)가 내부적으로 후보별 가중치 스코어를 계산하지만 반환 시 `{player, type}`만 남기고 버려서 "경합 마진"까지는 못 쓰지만, 비용 없이 쓸 수 있는 신호가 두 개 있었음: (1) `selectRebounder()`가 슈터를 후보에서 제외하지 않고 페널티만 주므로 "슈터 본인이 자기 미스를 직접 잡는" 경우가 실제로 발생하는데 지금은 동료가 잡은 경우와 구분이 안 됨, (2) 미스가 어느 zone에서 나왔는지(3점 미스는 멀리 튕기는 롱리바운드, Rim/Paint/Mid는 골밑 박스아웃)도 호출부에 이미 있는데 안 씀. `shooter`/`zone` 둘 다 호출부(`statsMappers.ts`)에 이미 `actor`로 존재하는 값이라 배선만 추가.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client) — `getReboundCommentary()`에 `shooter?`/`zone?` 파라미터 추가
- `services/game/engine/pbp/statsMappers.ts` (client) — `handleFreeThrowRebound`(shooter 전달), FG 미스 리바운드(actor+zone 전달) 2개 호출부 수정
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)
- `server/src/shared/engine/pbp/statsMappers.ts` (server 미러)

**Before**: `getReboundCommentary(rebounder: LivePlayer, type: 'off' | 'def')` — 공격/수비 각각 통짜 풀 하나씩.

**After**: `getReboundCommentary(rebounder, type, shooter?, zone?)` — 공격 리바운드는 `rebounder.playerId === shooter.playerId`면 "본인 미스 직접 캐치" 풀(신규 3줄), 아니면 기존 "동료 캐치" 풀(그대로). 수비 리바운드는 `zone === '3PT'`면 "롱리바운드" 풀(신규 3줄), 아니면 기존 "인사이드" 풀(그대로).

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋의 Before 블록으로 4개 파일(client 2 + server 미러 2)을 되돌리면 됨 — 함수 시그니처가 바뀌었으니 4개 파일 다 같이 되돌려야 함(하나만 되돌리면 타입 에러).

---

## 2026-08-03 — PBP 파울 커멘터리: playType별 돌파/포스트/클로즈아웃 계열 추가

**배경**: 턴오버 다음으로 파울(`type: 'foul'` — 비슛팅 라이브볼 파울)을 리뷰. `possessionHandler.ts`의 `nonShootingFoulRate`가 playType별로 다르게 가중되고 있는 걸 확인(Iso/PnR_Roll +0.010~0.012, PnR_Handler/DriveKick +0.008, PostUp/Cut +0.006, CatchShoot −0.010 — 돌파/포스트 몸싸움 파울이 캐치앤슛 클로즈아웃 파울보다 실제로 더 자주 나는 걸 반영한 설계). `playType`은 이미 `generateCommentary('foul', ...)` 호출 시 실제 값으로 넘어오는데(`statsMappers.ts:301`), 커멘터리 쪽은 헬프/일반 2갈래뿐이라 이 값을 전혀 안 쓰고 있었음 — 돌파(Iso/PnR_Handler/DriveKick)/포스트(PostUp/PnR_Roll)/클로즈아웃(CatchShoot) 계열을 추가로 분리.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)

**Before**: `if (isHelpPlay && defender) {...3줄...} return [...일반 3줄...]` — playType 파라미터가 함수에 들어오지만 이 분기에서는 미사용.

**After**: 헬프 파울 다음에 `playType === 'Iso' || 'PnR_Handler' || 'DriveKick'`(돌파 계열), `playType === 'PostUp' || 'PnR_Roll'`(포스트 계열), `playType === 'CatchShoot'`(클로즈아웃 계열) 3개 분기를 추가하고 각 3줄씩, 그 외 playType은 기존 일반 풀로 폴백.

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋의 Before 블록으로 `textGenerator.ts`(client+server) 파울 분기를 되돌리면 됨.

---

## 2026-08-03 — PBP 턴오버 커멘터리: 죽은 문구(24초 바이얼레이션/오펜스 파울) 제거

**배경**: 풋백 다음으로 턴오버(비스틸 기본 폴백)를 리뷰. `applyPossessionResult()`(statsMappers.ts)가 `type: 'offensiveFoul'`과 `type: 'shotClockViolation'`을 `type: 'turnover'`와 완전히 별도로 처리하고 각자 자기 커멘터리를 인라인으로 만들어서 `generateCommentary('turnover', ...)`를 아예 안 거친다는 걸 확인 — 그런데 이 폴백 풀엔 "24초 바이얼레이션에 걸립니다"/"무리한 돌파로 오펜스 파울을 범합니다"가 섞여 있어서 **실제로 도달 불가능한 죽은 문구**였음. 이 폴백에 실제 도달하는 경우(비강제 턴오버, PnR 랍패스 실패 등)는 전부 패스미스/볼핸들링 에러뿐이라 그 계열로 교체.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)

**Before**:
```ts
return pick([
    `${actor.playerName}, 치명적인 패스 미스로 턴오버를 범합니다.`,
    `${actor.playerName}, 공을 놓치며 공격권을 넘겨줍니다.`,
    `${actor.playerName}, 24초 바이얼레이션에 걸립니다.`,
    `${actor.playerName}, 무리한 돌파로 오펜스 파울을 범합니다.`
]);
```

**After**:
```ts
return pick([
    `${actor.playerName}, 치명적인 패스 미스로 턴오버를 범합니다.`,
    `${actor.playerName}, 공을 놓치며 공격권을 넘겨줍니다.`,
    `${actor.playerName}, 무리한 패스가 그대로 빗나가며 턴오버를 범합니다.`,
    `${actor.playerName}, 드리블 도중 공을 놓치고 맙니다.`
]);
```

**검증**: `npx vite build` 클린. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋의 Before 블록으로 `textGenerator.ts`(client+server) 두 턴오버 폴백을 되돌리면 됨.

---

## 2026-08-03 — PBP 풋백 커멘터리: 덩크/레이업(팁인) 세분화

**배경**: 블록 다음으로 풋백(공격 리바운드 즉시 재시도)을 리뷰. 조사 결과 `resolveFinish(actor, 'putback', sliders)`가 zone 인자 없이 호출되지만, `context==='putback'`이 Paint(플로터/훅슛/점퍼)·Mid(전부) 옵션을 다 걸러내서 **zone은 항상 Rim, shotType도 Dunk/Layup 둘뿐**이라는 걸 확인. 킥아웃/커버리지처럼 존 전체를 세분화할 필요는 없고, 기존에 섞여있던 덩크/레이업(팁인) 문구만 분리하면 충분하다고 판단.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)

**Before**: SCORE 4줄/MISS 3줄 통짜 풀 각각 하나, 덩크/레이업 구분 없이 "팁인 성공"(레이업 계열)과 명시적 덩크 표현 없는 문구가 섞여 있었음.

**After**: `if (shotType === 'Dunk') {...신규 3줄...} return [...기존 레이업/팁인 3줄...]` 구조로 SCORE/MISS 둘 다 분리. 레이업 풀에서 톤이 애매했던 "잡자마자 풋백 득점!" 1줄은 제거.

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋의 Before 블록으로 `textGenerator.ts`(client+server) 두 풋백 블록을 되돌리면 됨.

---

## 2026-08-03 — PBP 블록 커멘터리: zone(돌파/점퍼 계열) 기준 세분화

**배경**: SCORE 브랜치(킥아웃/커버리지/Transition/3점/Rim·Paint/미드레인지)를 다 끝내고 MISS 쪽 남은 항목 중 블록을 리뷰. `SIM_CONFIG.BLOCK`(`BASE_RIM: 0.08`/`BASE_PAINT: 0.045`/`BASE_MID: 0.025`/`BASE_3PT: 0.007`) 확인 결과 블록은 4존 전부에서 발생 가능(3점도 확률은 낮지만 nonzero)한데, 기존 커멘터리는 zone 구분이 전혀 없어 "골밑 돌파... 넘지 못합니다" 같은 골밑 전용 표현이 미드/3점 블록에도 그대로 나가고 있었음. `zone`/`shotType` 데이터가 이미 함수 스코프에 있는데 이 분기에서만 안 쓰고 있던 것도 확인 — Rim/Paint(돌파 계열) vs Mid/3PT(점퍼 계열)로 분리. 참고로 헬프 블록은 엔진상 3점 존에서는 발생하지 않음(헬프디펜스는 Rim/Paint/Mid만 해당).

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)

**Before**: `if (isBlock && defender) { if (isHelpPlay) {...3줄...} return [...3줄...] }` — zone 구분 없이 전부 "골밑 돌파" 계열 문구.

**After**: `const isInterior = zone === 'Rim' || zone === 'Paint';`를 추가해 헬프/일반 블록 각각을 돌파 계열(기존 문구 유지)과 점퍼 계열(신규 3줄)로 분리 — 총 4개 카테고리(헬프-돌파/헬프-점퍼/일반-돌파/일반-점퍼) 각 3줄.

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋의 Before 블록으로 `textGenerator.ts`(client+server)의 블록 분기를 되돌리면 됨.

---

## 2026-08-03 — PBP 미드레인지 커멘터리: shotType(Jumper/Pullup) 기준 세분화

**배경**: 3점/Rim-Paint에 이어 마지막 남은 제네릭 존인 미드레인지(모든 zone 체크를 통과 못 한 슛이 도달하는 최종 폴백)를 리뷰. 조사 결과 `Pullup`(Iso/비커버리지 PnR_Handler/Cut처럼 드리블로 직접 만든 슛)과 `Jumper`(PostUp/PnR_Roll/Handoff/OffBallScreen/DriveKick/모든 미드존 킥아웃처럼 캐치·포스트·롤 계열) 두 shotType이 실제로 섞여 들어오는 걸 확인(`Fadeaway`는 `resolveFinish()` 호출 그래프상 Mid 존에서 실제 도달 불가능한 죽은 값이라 제외). 3점 때와 동일한 패턴으로 shotType 기준 재구성.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)

**Before**: SCORE/MISS 둘 다 zone/슛타입 구분 없이 3~4줄 통짜 풀 하나.

**After**: SCORE는 `if (shotType === 'Pullup') {...3줄...} if (assister) {...3줄, 패서 언급 포함...} return [...2줄 안전 폴백...]`. MISS도 동일하게 `Pullup`/`Jumper` 2개 풀(각 3줄)로 분리.

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋의 Before 블록으로 `textGenerator.ts`(client+server) 두 미드레인지 블록을 되돌리면 됨.

---

## 2026-08-03 — PBP Rim/Paint 커멘터리: canDunk 추정치 → 실제 shotType 기준으로 정정

**배경**: 3점 다음으로 제네릭 Rim/Paint 풀(킥아웃·커버리지에 안 걸리는 나머지 Rim/Paint 슛 전부가 도달)을 리뷰하던 중, `const canDunk = actor.attr.vertical > 70 && actor.attr.ins > 60;`가 실제 엔진의 덩크 판정과 기준 자체가 다르다는 걸 확인. `resolveFinish()`(playTypes.ts)는 `vertical >= 70 && strength >= 65`(ins 안 봄) 게이트를 통과해도 덩크/레이업을 **가중치 랜덤**으로 최종 결정하기 때문에, `canDunk === true`인 선수도 실제로는 레이업이 나올 수 있고 그 반대도 가능함 — 확인 결과 실제로 양방향 다 발생 가능. 이 어긋남은 게임 결과·스탯·샷차트엔 영향 없고(그건 전부 진짜 `shotType` 기준으로 정확히 기록됨) **순수 커멘터리 텍스트 불일치**(레이업으로 기록된 슛을 "슬램덩크!"로 묘사하는 등)였음. 3점 때와 같은 패턴 — 로컬 추정치 대신 이미 배선된 실제 `shotType`을 쓰도록 정정.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)

**Before**: `const canDunk = actor.attr.vertical > 70 && actor.attr.ins > 60;`를 SCORE의 앨리웁 분기(`(PnR_Roll||Cut) && canDunk && assister`)와 덩크 분기(`if (canDunk)`)에서 사용, 나머지는 레이업+플로터 1줄이 섞인 통짜 기본 풀. MISS는 Rim/Paint 전용 분기 자체가 없어 Mid까지 다 섞인 3줄 통짜 폴백 하나뿐이었음.

**After**: `canDunk` 변수 삭제. SCORE: 앨리웁 분기를 `shotType === 'Dunk'`로 교체(3줄로 보강), `isMismatch`는 유지(3줄로 보강), 나머지를 `CoverageRimPaintSet`(PnR 커버리지 때 만든 타입 재사용) + `pickRimPaintByShotType()`으로 Rim(레이업/덩크)·Paint(플로터/훅슛/점퍼) 6개 카테고리 각 3줄씩 재구성. MISS: Putback 다음에 동일 구조의 Rim/Paint 전용 분기를 신설(각 3줄), 남은 폴백은 Mid 전용 3줄로 정리.

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋의 Before 블록으로 `textGenerator.ts`(client+server) 두 Rim/Paint 블록을 되돌리고 `const canDunk = ...` 줄을 다시 추가하면 됨. `CoverageRimPaintSet`/`pickRimPaintByShotType`은 PnR 커버리지 커밋에서 이미 추가된 것을 재사용했으므로 별도로 제거할 필요 없음(계속 사용 중).

---

## 2026-08-03 — PBP 3점 커멘터리: assister 분기 → shotType(CatchShoot/Pullup) 분기로 정정

**배경**: 킥아웃/PnR 커버리지/Transition에 이어 제네릭 3점 풀(킥아웃·커버리지·Transition에 안 걸리는 나머지 3점 슛 전부가 도달)을 리뷰. Transition 때와 동일한 패턴의 문제를 발견 — `assister`는 SCORE 결과에 거의 항상 존재하는데(모든 관련 playType에서 `pickPasser()`가 undefined를 반환하지 않음), 기존 코드가 `if (assister) {...}`로 분기하다 보니 **Iso/PnR_Handler(비커버리지)/Transition(무어시스트)처럼 선수가 드리블로 직접 만든 Pullup 3점까지도 "패스를 받아 3점슛!"으로 잘못 묘사**하고 있었음. 실제로 이 풀에 도달하는 playType들의 `shotType`을 확인한 결과 `'CatchShoot'`(CatchShoot/Handoff/OffBallScreen/DriveKick/비커버리지 PnR_Pop)과 `'Pullup'`(Iso/비커버리지 PnR_Handler/무어시스트 Transition)이 실제로 섞여 있어, assister 유무 대신 shotType 기준으로 재구성하는 게 맞다고 판단.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)

**Before**: `if (isBotchedSwitch) {...} if (assister) {...} if (isMismatch) {...} return [...기본...]` — assister 분기가 사실상 shotType과 무관하게 거의 항상 먼저 걸림. MISS는 세분화 없이 3줄 통짜.

**After**: `isBotchedSwitch`/`isMismatch`(shotType과 무관한 우선 상황)는 그대로 유지하되 순서만 `isMismatch`를 `assister` 체크보다 앞으로 옮기고, `if (assister)`를 `if (shotType === 'CatchShoot' && assister)`로 교체. 기본 폴백(Pullup)에 "드리블 후 스텝백 3점!" 문구 1줄 추가. MISS도 동일하게 `if (shotType === 'CatchShoot')` 분기 추가(패서 데이터가 없어 CatchShoot이어도 패서 언급 없이 슈터 중심 문구).

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋의 Before 블록으로 `textGenerator.ts`(client+server) 두 3점 블록을 되돌리면 됨(별도 타입/헬퍼 추가 없이 인라인 `pick()`만 사용해서 롤백이 단순함).

---

## 2026-08-03 — PBP Transition(속공) 커멘터리: zone+shotType 세분화 + 죽은 분기 제거

**배경**: 킥아웃/PnR 커버리지에 이어 Transition 커멘터리를 리뷰하던 중, 기존 "어시스트 있음/없음" 2분기 구조가 실제로는 **절반이 죽은 코드**였다는 걸 확인. `possessionHandler.ts`의 미스 결과 객체(`type: 'miss'`)엔 `assister` 키 자체가 없고(SCORE 결과에만 `assister: secondaryActor` 설정), 이는 실제 농구 규칙(어시스트는 득점에만 성립)과 일치하는 의도된 설계임 — 다만 그 부작용으로 SCORE의 "무어시스트" 분기(else)와 MISS의 "어시스트 있음" 분기(if)가 둘 다 코드상 도달 불가능했음. 추가로 outletPasser가 실제 리바운더와 연결된 데이터가 아니라(직전 리바운드 여부는 `lastEntryWasDefReb` 불리언으로만 존재하고 커멘터리까지 전달 안 됨) "리바운드를 잡자마자" 같은 표현은 근거 없는 장식용 텍스트였다는 것도 확인. zone도 확인해보니 `selectZone(['3PT','Paint','Rim'], ...)`라 Mid 옵션이 없고, `resolveFinish(actor, 'drive', ...)`라 훅슛도 안 나옴(post/roll 전용).

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)

**Before**: SCORE `if (assister) {...} else {...}`(else 죽은 코드), MISS `if (assister) {...} else {...}`(if 죽은 코드) — zone/슛타입 구분 전혀 없이 "코트를 가로지르는 터치다운 패스" 류 4줄 통짜 풀.

**After**: `TransitionTextSet` 타입(`threept`/`rim.{layup,dunk}`/`paint.{floater,jumper}` — Mid 없음, 훅슛 없음)과 `pickTransitionText()` 헬퍼 추가. SCORE는 `assister`가 항상 실존하므로 죽은 else 분기를 제거하고 `if (playType === 'Transition' && assister)`로 시작, 각 zone 풀 안에 패서 언급 있는/없는 문구를 다양성 차원에서 섞음. MISS는 `assister` 데이터 자체가 없어 슈터 단독 묘사만(패서 언급 있는 분기 완전 제거).

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋의 Before 블록으로 `textGenerator.ts`(client+server) 두 Transition 블록을 되돌리고, `TransitionTextSet` 타입과 `pickTransitionText` 함수를 제거하면 됨.

---

## 2026-08-03 — PBP PnR 커버리지 커멘터리: Drop/Hedge/Blitz 전수조사 후 zone+shotType 세분화 반영

**배경**: 킥아웃 세분화 작업 다음으로 PnR 커버리지(Drop/Hedge/Blitz) 커멘터리를 전수조사한 결과, 6칸 중 5칸이 비어있거나(Drop-Handler-MISS, Hedge-Roll-MISS, Hedge-Handler-SCORE, Blitz 전체 MISS 등) zone/슛타입 구분이 전혀 없는 상태였음. 추가로 엔진 조사 결과 두 가지 잘못된 전제를 발견해 정정:
1. `pnrCoverage`(drop/hedge/blitz)는 `preferredZone`이 정해진 **후** 별도 확률로 굴려지는 값이라(`possessionHandler.ts` `identifyDefender`), 예를 들어 Drop 커버리지에서도 핸들러가 3점/림/페인트 어디서든 쏠 수 있음 — "Drop-Handler는 Mid만 열어준다"는 기존 코드의 전제가 틀렸었음.
2. `PnR_Roll`도 Mid 존 옵션이 있고(`selectZone(['Rim','Paint','Mid'], ...)`), `PnR_Pop`도 Drop/Hedge/Blitz 커버리지를 동일하게 굴림(`isPnrPlay` 3종 모두 포함) — 기존엔 Pop이 Blitz 케이스만 있었음.

이에 따라 구조를 롤맨 계열(Rim/Paint/Mid 3존, 3점 옵션 없음)과 핸들러 계열(3PT/Mid/Rim/Paint 4존 전부)로 재설계하고, Pop(3점 고정)을 Drop/Hedge에도 추가해 3개 커버리지 × (Handler 7카테고리 + Roll 6카테고리 + Pop 1카테고리) 전체를 SCORE/MISS 양쪽 다 채움.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)

**Before**: Drop/Hedge/Blitz 각각 특정 playType×zone 조합 1~2개만 처리(예: `if (zone === 'Mid' && playType === 'PnR_Handler')`, `if (pnrCoverage === 'blitz' && playType === 'PnR_Handler')` 등), 나머지 조합은 전부 제네릭 커멘터리 풀로 폴백. zone 세분화도 Rim/Paint 통짜(`(zone === 'Rim' || zone === 'Paint')`)였고 슛타입 구분 없음.

**After**: `CoverageRimPaintSet`/`CoverageRollSet`/`CoverageHandlerSet` 타입과 `pickCoverageRollText()`/`pickCoverageHandlerText()`(내부적으로 `pickRimPaintByShotType()` 공유) 헬퍼를 킥아웃 구조 옆에 추가:
```ts
type CoverageRimPaintSet = { rim: { layup: string[]; dunk: string[] }; paint: { floater: string[]; hook: string[]; jumper: string[] } };
type CoverageRollSet = CoverageRimPaintSet & { mid: string[] };
type CoverageHandlerSet = CoverageRollSet & { threept: string[] };
```
SCORE/MISS 양쪽의 `pnrCoverage === 'drop' | 'hedge' | 'blitz'` 블록을 각각 `playType === 'PnR_Handler' | 'PnR_Roll' | 'PnR_Pop'` 3갈래로 나누고, Handler/Roll은 `pickCoverageHandlerText()`/`pickCoverageRollText()`로 zone+shotType 기준 정확한 서브카테고리를 고르도록 재작성. Pop은 3점 고정이라 단순 `pick()`.

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋의 Before 블록으로 `textGenerator.ts`(client+server) 두 SCORE/MISS 블록을 되돌리고, 새로 추가한 `CoverageRimPaintSet`/`CoverageRollSet`/`CoverageHandlerSet` 타입과 `pickRimPaintByShotType`/`pickCoverageRollText`/`pickCoverageHandlerText` 함수 3개(client+server 각 파일)를 제거하면 됨.

---

## 2026-08-03 — PBP 킥아웃 커멘터리: zone+shotType 세분화 콘텐츠 반영 (PostUp/PnR_Roll/Iso/PnR_Handler)

**배경**: 킥아웃 커멘터리(`kickoutScoreText`/`kickoutMissText`)가 zone 기준 `rimPaint` 통짜였던 걸, 사용자와 함께 4개 playType(PostUp/PnR_Roll/Iso/PnR_Handler) 전부 리뷰하며 zone(3점/림/페인트/미드)+슛타입(림→레이업/덩크, 페인트→플로터/훅슛/점퍼)까지 세분화한 콘텐츠를 확정하고 한 번에 반영. 이전 커밋들(shotType 배선 추가, 킥아웃 context 버그 수정)이 이 작업의 사전 준비였음.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러)

**Before**: `kickoutScoreText`/`kickoutMissText`가 `Record<string, { threept: string[]; rimPaint: string[]; mid: string[] }>` 형태 — Rim과 Paint가 구분 없이 하나의 `rimPaint` 풀을 공유했고, 슛타입(레이업/덩크/플로터/훅슛/점퍼) 구분이 전혀 없었음. 선택 로직도 인라인:
```ts
const set = kickoutScoreText[playType];
if (zone === '3PT') return pick(set.threept);
if (zone === 'Rim' || zone === 'Paint') return pick(set.rimPaint);
return pick(set.mid);
```

**After**: `KickoutTextSet` 타입을 `{ threept, rim: { layup, dunk }, paint: { floater, hook, jumper }, mid }`로 재정의하고, SCORE/MISS 공용 선택 헬퍼 `pickKickoutText(set, zone, shotType)`를 `pick` 옆에 추가:
```ts
function pickKickoutText(
    set: KickoutTextSet,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT' | undefined,
    shotType: PlayContext['shotType'] | undefined
): string {
    if (zone === '3PT') return pick(set.threept);
    if (zone === 'Rim') return pick(shotType === 'Dunk' ? set.rim.dunk : set.rim.layup);
    if (zone === 'Paint') {
        if (shotType === 'Hook') return pick(set.paint.hook);
        if (shotType === 'Jumper') return pick(set.paint.jumper);
        return pick(set.paint.floater);
    }
    return pick(set.mid);
}
```
`kickoutScoreText[playType]`/`kickoutMissText[playType]`의 각 playType 콘텐츠도 새 구조에 맞춰 전면 재작성 — PostUp/PnR_Roll/Iso/PnR_Handler 4개 playType × (3점/림-레이업/림-덩크/페인트-플로터/페인트-훅슛/페인트-점퍼/미드) 7개 카테고리 × SCORE/MISS 각 2줄 내외로 총 100줄 이상의 신규 커멘터리 텍스트 작성. PnR_Roll은 "롤" 대신 "다이브" 표현 사용, PnR_Handler 3점은 "약측"→"위크사이드"로 표현 수정.

**검증**: `npx vite build` 클린, `npx tsc --noEmit -p tscheck.json` textGenerator 관련 에러 없음. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 이 커밋과 직전 "shotType 배선 추가" 커밋의 Before 블록으로 `textGenerator.ts`(client+server) 전체를 되돌리면 됨. 킥아웃 context 버그 수정(`playTypes.ts`)은 별도 커밋이라 롤백해도 무방(이 콘텐츠는 훅슛이 안 나와도 다른 슛타입 문구는 정상 동작).

---

## 2026-08-03 — 킥아웃 슛 마무리 context 버그 수정 (훅슛이 킥아웃에서 원천 봉쇄되던 문제)

**배경**: PBP 킥아웃 커멘터리 콘텐츠(레이업/덩크/플로터/훅슛/점퍼)를 playType별로 짜던 중, `resolveFinish()`의 `context` 파라미터가 `'Hook'` 슛타입을 `context === 'post' || 'roll'`일 때만 허용한다는 걸 확인. 그런데 4개 킥아웃 진입점(PostUp/PnR_Roll/Iso/PnR_Handler 전부)이 `resolveFinish(kickTarget, 'drive', sliders, koZone)`처럼 context를 전부 `'drive'`로 하드코딩하고 있어서, **킥아웃으로 받은 슛은 playType과 무관하게 훅슛이 절대 나올 수 없는 상태**였음(반면 킥아웃이 아닌 일반 슛은 PostUp→`'post'`/PnR_Roll→`'roll'`로 정상 전달됨). 처음엔 "PostUp/PnR_Roll 킥아웃만 훅슛 허용, Iso/PnR_Handler는 계속 막기"로 하려 했으나, 사용자 확인 결과 "킥아웃을 받은 빅맨이 페인트에서 훅슛으로 마무리"는 playType과 무관하게 자연스러운 장면이라는 데 합의 — 4개 playType 전부 동일하게 훅슛 가능하도록 통일.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) — 킥아웃 4개 진입점(Iso/PnR_Handler/PnR_Roll/PostUp) 전부
- `server/src/shared/engine/pbp/playTypes.ts` (server 미러) — 동일 4곳

**Before** (4곳 동일):
```ts
const { zone, shotType } = resolveFinish(kickTarget, 'drive', sliders, koZone);
```

**After**:
```ts
const { zone, shotType } = resolveFinish(kickTarget, 'post', sliders, koZone);
```
(Rim 존은 context 무관이라 영향 없음 — Dunk/Layup 그대로. Paint 존만 영향: 기존엔 `'drive'`라 Floater/Jumper만 가능했는데, `'post'`로 바뀌면서 Hook도 추가로 가능해짐.)

**검증**: `npx vite build` 클린. `cd server && npx tsc -p tsconfig.json` — 에러 30개(기존 베이스라인 동일, playTypes발 신규 없음). `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200.

**롤백 방법**: 4곳(client) + 4곳(server 미러) 전부 `'post'` → `'drive'`로 되돌리면 됨.

---

## 2026-08-03 — PBP 커멘터리: shotType(레이업/덩크/플로터/훅슛 등) 배선 추가

**배경**: PBP 킥아웃 커멘터리(`kickoutScoreText`/`kickoutMissText`)를 존(zone) 기준 `rimPaint` 통짜 대신 림/페인트로 나누고, 림/페인트 내부도 슛타입(레이업/덩크/플로터/훅슛 등)별로 세분화하기로 함. 코멘터리 콘텐츠를 짜기 전에 실제 엔진이 슛타입을 알고 있는지 확인한 결과, `resolveFinish()`(playTypes.ts)가 이미 `PlayContext.shotType`을 `'Dunk' | 'Layup' | 'Floater' | 'Jumper' | 'Pullup' | 'Hook' | 'CatchShoot' | 'Fadeaway'`로 결정해서 `PossessionResult.shotType`까지는 저장하고 있었지만, `statsMappers.ts`가 `generateCommentary()` 호출 시 이 값을 넘기지 않아서 커멘터리 함수에는 파라미터 자체가 없었음. 콘텐츠 작업 전에 이 배선부터 연결. 콘텐츠(레이업/덩크/플로터/훅슛 텍스트) 반영은 다음 작업에서 한 번에 처리 예정 — 이번 커밋은 배선만.

**변경 파일**:
- `services/game/engine/pbp/pbpTypes.ts` (client) — `PossessionResult.shotType` 타입을 느슨한 `string`에서 `PlayContext['shotType']`로 좁힘
- `services/game/engine/commentary/textGenerator.ts` (client) — `generateCommentary()`에 `shotType` 파라미터 추가 (아직 미사용, 콘텐츠 작업에서 소비 예정)
- `services/game/engine/pbp/statsMappers.ts` (client) — score/miss 두 호출부에서 `result.shotType` 전달
- `server/src/shared/engine/pbp/pbpTypes.ts` (server 미러) — 동일하게 `PossessionResult.shotType` 타입 좁힘 (같은 파일 내 `zone`+시각화용 `shotType?: string` 필드는 별개 인터페이스라 미변경)
- `server/src/shared/engine/commentary/textGenerator.ts` (server 미러) — 동일 파라미터 추가
- `server/src/shared/engine/pbp/statsMappers.ts` (server 미러) — 동일 전달

**Before** (`statsMappers.ts`, score 예시):
```ts
let logText = generateCommentary('score', actor, defender, assister, playType, zone, {
    isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
    isBlock: false, isSteal: false, points, pnrCoverage: pnrCoverage || undefined,
    isKickout: !!result.isKickout
});
```

**After**:
```ts
let logText = generateCommentary('score', actor, defender, assister, playType, zone, {
    isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
    isBlock: false, isSteal: false, points, pnrCoverage: pnrCoverage || undefined,
    isKickout: !!result.isKickout
}, result.shotType);
```
(`generateCommentary()` 시그니처 마지막에 `shotType?: PlayContext['shotType']` 파라미터 추가, `pbpTypes.ts`의 `PossessionResult.shotType`도 `string` → `PlayContext['shotType']`로 좁힘. `pbpTypes.ts`가 `playTypes.ts`의 타입을 참조하지만 `playTypes.ts`가 이미 `pbpTypes.ts`를 런타임 임포트하고 있어 순환 위험이 있었음 — `import type`으로 타입 전용 임포트해 런타임 바인딩을 제거함으로써 회피.)

**검증**: `npx vite build` 클린(기존 청크사이즈/circular-vendor 경고만). `cd server && npx tsc -p tsconfig.json` — 에러 30개로 기존 베이스라인과 동일, 변경 파일발 신규 에러 없음. `flyctl deploy` 완료, `flyctl status` state=started, `curl` 200 확인.

**롤백 방법**: 3개 파일(client) + 3개 미러(server)에서 위 Before로 되돌리고 `PlayContext` type import 2줄(pbpTypes.ts, textGenerator.ts 각 client/server)을 제거하면 됨.

---

## 2026-08-03 — [엔진] 득점/미스 시 "⚡ 미스매치!" 중복 안내 로그 제거

**배경**: "미스매치 후 이점을 활용했다는 메세지가 따로 뜰 필요가 있나? 득점하면 하나의 메세지에 분기대로 표시해야 하지 않나" 질문 — 조사 결과 `textGenerator.ts`의 score/miss 커멘터리가 이미 `isMismatch` 플래그를 받아 전용 문구(예: "느린 수비를 제치고 골밑 득점 성공", "미스매치를 활용해 3점슛을 성공시킵니다" 등, line 608/661/707/1182/1218/1262)를 생성하고 있는데, `statsMappers.ts`의 `applyPossessionResult()`가 `isMismatch`이면 **타입과 무관하게 무조건** "⚡ 미스매치! OO가 이점을 활용합니다." 안내를 별도로 추가해 같은 사실을 두 줄로 중복 안내하고 있었음. 단, turnover/foul 커멘터리는 `generateCommentary()` 호출 시 `isMismatch: false`로 하드코딩돼 있어(아직 전용 분기 문구 없음) 그 두 타입에선 이 안내가 유일한 미스매치 정보원 — 완전히 제거하면 안 됨.

**변경 파일**:
- `services/game/engine/pbp/statsMappers.ts` (client) — `applyPossessionResult()`
- `server/src/shared/engine/pbp/statsMappers.ts` (server 미러)

**Before**:
```ts
if (isMismatch) {
    addLog(state, offTeam.id, `⚡ 미스매치! ${actor.playerName}가 이점을 활용합니다.`, 'info');
}
```

**After**:
```ts
if (isMismatch && type !== 'score' && type !== 'miss') {
    addLog(state, offTeam.id, `⚡ 미스매치! ${actor.playerName}가 이점을 활용합니다.`, 'info');
}
```

**검증**: client `npx tsc --noEmit -p tscheck.json`, server `cd server && npx tsc --noEmit` 둘 다 기존 에러 외 신규 에러 없음. 브라우저/실제 시뮬 실동작은 미검증.

**주의사항**: 이건 **엔진 로직 변경**이라 멀티플레이어는 Fly.io 서버(`server/fly.toml`, `basketballgm-app-server`) 재배포가 있어야 반영됨 — client(싱글플레이어)는 즉시 반영. 배포 전까지는 새로 시뮬레이션되는 멀티플레이어 경기도 계속 중복 안내가 뜬다.

**롤백 방법**: 두 파일의 조건문에서 `&& type !== 'score' && type !== 'miss'`만 제거하면 Before 상태로 복귀.

---

## 2026-08-03 — PlayTypeStats: 막대 길이를 절대 비율 대신 최댓값 기준 상대 비율로 스케일링

**배경**: "막대그래프가 너무 없어보인다" — 개별 플레이타입 비율이 보통 2~17% 선이라 절대 0~100% 스케일(`width: {share}%`)로 그리면 모든 막대가 항상 짧게 보임. "다른 플레이타입 대비 상대적인 비율로 채워지게" 요청.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: `width: `${away.share}%`` / `width: `${home.share}%`` — 절대 비율(0~100%) 그대로 사용.

**After**: `maxShare`(원정·홈 통틀어 가장 큰 비율값, 없으면 100)를 계산하는 `useMemo` 추가, `barWidthOf(share) = (share / maxShare) * 100`으로 막대 폭을 계산 — 가장 많이 쓰인 플레이타입의 막대가 트랙을 꽉 채우고 나머지는 그 대비 상대 길이로 그려짐. 원정/홈 공통 기준(`maxShare` 하나)을 써서 두 팀 막대 길이가 여전히 서로 비교 가능함.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: `barWidthOf(away.share)`/`barWidthOf(home.share)`를 다시 `away.share`/`home.share`로 되돌리고 `maxShare`/`barWidthOf` 선언 제거.

---

## 2026-08-03 — PlayTypeStats: 비율/성공률 반올림 대신 소수점 1자리 표시

**배경**: "원정팀 비율을 다 더하면 103%가 나온다"는 질문에 DB 조회로 검증 — 원시 비율 합은 정확히 100.00%이고, 표시할 때 각 항목을 개별적으로 `toFixed(0)`(정수 반올림)해서 보여주다 보니 반올림된 값들의 합이 103%로 드러난 것(계산 로직 자체는 정상, 흔한 반올림 표시 부작용)임을 확인. 사용자가 반올림 대신 소수점 1자리 표시를 요청.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: `away.share.toFixed(0)`, `successOf(away).toFixed(0)`, `successOf(home).toFixed(0)`, `home.share.toFixed(0)` — 4곳 전부 정수 반올림.

**After**: 4곳 전부 `toFixed(1)`로 변경 — 소수점 1자리까지 표시(예: 13.8%). 반올림 오차가 줄어들어 합계가 100%에 훨씬 가까워짐(완전히 100.0%로 일치하진 않을 수 있음 — 소수점 1자리에서도 미세한 반올림은 남음).

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 4곳의 `toFixed(1)`을 `toFixed(0)`으로 되돌리면 됨.

---

## 2026-08-03 — [최종 정리] JS 높이 측정 방식 폐기, 부모 고정 높이(h-[520px]) 공유로 회귀

**배경**: JS(`ResizeObserver`)로 플레이타입 패널의 실제 높이를 측정해 PBP 쪽에 적용하는 방식이, `ResizeObserver` 콜백의 태생적 비동기성 때문에 탭 전환 후 재진입 시 "기본값(600) → 측정값"으로 높이가 바뀌는 게 육안에 보이는 부작용을 냄. 사용자 제안대로 "커멘터리와 플레이타입을 같은 div(부모 높이값)로 컨트롤"하는 단순한 정적 방식으로 되돌림 — 픽셀 단위로 매 게임(플레이타입 종류 수가 다름)마다 완벽히 일치하진 않지만, 마운트/탭 전환 시 어떤 시각적 변화도 없는 안정성을 우선.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: `playTypeColRef` + `useLayoutEffect` + `ResizeObserver`로 플레이타입 패널의 `scrollHeight`를 측정해 `rowHeight` state로 관리, 최상위 행에 `style={{ height: rowHeight }}` 적용. 플레이타입 컬럼엔 `self-start`(flex stretch 차단, 측정 정확도를 위해 필요했음).

**After**: `useLayoutEffect`/`ResizeObserver`/`rowHeight` state/`playTypeColRef` 전부 제거. 최상위 행을 `h-[520px]`(플레이타입 패널의 대략적인 자연 높이 — 헤더 40px + 최대 12행 × ~38px 추정치) 정적 클래스로 고정. 플레이타입 컬럼은 `self-start` 제거하고 일반 `flex-[5] min-w-0 overflow-y-auto custom-scrollbar`로 복귀 — PBP와 동일하게 flex 기본 동작(`align-items: stretch`)으로 부모의 520px를 그대로 받음(안전장치로 overflow-y-auto는 유지, 콘텐츠가 520px를 넘는 극단적 케이스 대비).

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(탭 전환 시 더 이상 높이 변화 애니메이션이 안 보이는지)은 미검증 — 반드시 확인 필요.

**롤백 방법**: 필요 시 이전 JS 측정 방식(`self-start` + `ResizeObserver`)으로 되돌릴 수 있으나, 정확한 이유로 폐기됐으므로 권장하지 않음. `h-[520px]` 값 자체를 조정하고 싶으면 이 클래스 하나만 바꾸면 됨.

---

## 2026-08-03 — [버그 수정] 플레이타입 높이 측정값이 실제로 반영 안 되던 원인 — self-start 누락

**배경**: 직전 JS 측정 방식(ResizeObserver + scrollHeight) 적용 후에도 여전히 플레이타입 쪽에 빈 공간이 남는 스크린샷 확인. 원인은 `playTypeColRef`를 붙인 div가 `flex-[5]`로만 돼 있고 `align-self`를 따로 안 줘서, flex 기본 동작(`align-items: stretch`)에 의해 이 div 자체가 이미 행 높이(`rowHeight`)만큼 늘어나 있었던 것 — 늘어난 박스는 콘텐츠보다 커도 스크롤이 필요 없으니 `scrollHeight`가 콘텐츠의 진짜 높이가 아니라 이미 늘어난 박스 높이(=이전 `rowHeight`)를 그대로 돌려줘서, 측정값이 계속 이전 높이로 수렴하며 아무것도 줄어들지 않는 순환이었음.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)

**Before**: `<div ref={playTypeColRef} className="flex-[5] min-w-0 overflow-y-auto custom-scrollbar">` — align-self 기본값(stretch)이라 행 높이에 맞춰 늘어남.

**After**: `<div ref={playTypeColRef} className="flex-[5] min-w-0 self-start">` — `self-start`로 늘어남을 차단해 이 div가 항상 자기 콘텐츠 크기만큼만 차지하도록 고정. 이제 더 이상 스크롤이 필요 없어 `overflow-y-auto`/`custom-scrollbar`도 제거. PBP 쪽(`flex-[5]`, align-self 기본값 유지)은 계속 행 높이에 맞춰 늘어나 내부 스크롤 영역을 갖는다.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작은 미검증 — 반드시 확인 필요(이번엔 실제로 줄어드는지).

**롤백 방법**: `self-start` 제거하고 `overflow-y-auto custom-scrollbar` 복원하면 직전 상태로 복귀.

---

## 2026-08-03 — [방향 정정] PBP 섹션 높이를 플레이타입 섹션의 자연 높이에 맞춤 (JS 측정 방식)

**배경**: 직전 두 차례 수정이 요청 방향을 반대로 처리 — "PBP 영역 높이를 플레이타입 영역에 맞춰달라"(플레이타입의 짧은 자연 높이가 기준, PBP가 거기 맞춰 줄어들고 스크롤돼야 함)를 "플레이타입을 PBP 높이(고정 600px)에 늘려라"로 잘못 구현했었음. 순수 CSS(flex/grid)만으로는 "어느 쪽이 기준 높이인지"를 지정할 방법이 없어(둘 다 형제 flex/grid 아이템이면 자동으로 더 큰 쪽에 맞춰지거나 둘 다 부모가 정한 고정값을 따름), 플레이타입 패널의 실제 렌더링된 높이를 `ResizeObserver`로 측정해 그 값을 행 전체 높이로 적용하는 JS 방식으로 전환.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: `GamePbpTab.tsx` 최상위 행이 `h-[600px]` 고정, `PlayTypeStats.tsx` 루트에 `h-full`(고정 600px를 그대로 따라가 늘어남 — 잘못된 방향).

**After**:
- `GamePbpTab.tsx`: `playTypeColRef`로 우측 플레이타입 컬럼을 참조, `useLayoutEffect` + `ResizeObserver`로 `el.scrollHeight`(플레이타입 패널의 자연 콘텐츠 높이)를 측정해 `rowHeight` state에 저장. 최상위 행의 `h-[600px]` 클래스를 제거하고 `style={{ height: rowHeight }}`로 교체(초기값 600은 측정 전 임시 fallback). `shotEvents`/팀 변경 시 재측정.
- `PlayTypeStats.tsx`: 루트의 `h-full` 완전히 제거(주석으로 재추가 금지 명시) — 이 컴포넌트는 항상 자기 콘텐츠 크기만큼만 렌더링해야 측정이 의미 있음. `h-full`을 넣으면 부모 높이를 그대로 따라가 측정값이 항상 부모 높이와 같아지는 순환 참조가 생겨 전체 로직이 무력화됨.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(실제로 PBP가 플레이타입 높이만큼 줄어들고 스크롤되는지)은 미검증 — 반드시 확인 필요.

**롤백 방법**: `GamePbpTab.tsx`를 `h-[600px]` 고정 클래스로, `PlayTypeStats.tsx` 루트에 `h-full`을 되돌리면 직전(잘못된) 상태로 복귀 — 권장하지 않음. 완전 롤백하려면 이번 항목 전체를 되돌리고 애초 좌우 5:5 분할 도입 시점의 정적 `h-[600px]` 방식으로 복귀.

---

## 2026-08-03 — [정정] PlayTypeStats: 배경(bg-slate-900) 복원, 테두리 선만 제거

**배경**: 직전 수정에서 "보더라인만 제거해달라"는 요청을 배경색까지 같이 지우는 걸로 잘못 처리 — 스크린샷에서 우측 패널 전체가 밋밋해진(카드 배경이 사라져 페이지 배경과 구분이 안 되는) 문제로 지적받음.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before(직전 오적용)**: 루트 `<div className="h-full">`, 바디 래퍼 `<div>` — 배경 없음.

**After(정정)**: 루트 `<div className="h-full bg-slate-900">`, 바디 래퍼 `<div className="bg-slate-900">` — `border border-slate-800`(4면 테두리 선)만 계속 제거된 상태 유지, 배경은 원래대로 복원. 높이는 `h-full`로 계속 부모(600px)에 맞춤.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 필요 시 `bg-slate-900`를 다시 제거하면 직전(잘못된) 상태로 돌아감 — 권장하지 않음.

---

## 2026-08-03 — PlayTypeStats: 카드 테두리/배경 제거 + h-full로 PBP 섹션과 높이 맞춤

**배경**: "PBP 컬럼 섹션 높이를 플레이타입 컬럼 섹션 높이와 맞춰라" + "플레이타입 섹션에만 있는 상하좌우 보더라인 제거" 요청. 원인 파악 — `GamePbpTab.tsx`의 좌(PBP)/우(플레이타입) 두 칼럼은 부모 `h-[600px]` 행에서 flex 기본 stretch로 이미 둘 다 600px 높이를 갖지만, `PlayTypeStats.tsx`의 루트 div만 `bg-slate-900 border border-slate-800`로 감싸져 있고 `h-full`이 없어서 — 콘텐츠(플레이타입 12개 행)가 600px보다 짧으면 그 테두리 박스만 컨테이너 중간에서 끝나 보이고, PBP 쪽은 테두리 없이(구분선만) 항상 꽉 채워 보이는 불일치가 있었음.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: 루트 `<div className="bg-slate-900 border border-slate-800">`(콘텐츠 높이만큼만 차지), 바디 래퍼 `<div className="bg-slate-900">`.

**After**: 루트를 `<div className="h-full">`로 변경(카드 배경/테두리 완전 제거, 부모의 600px에 맞춰 채움 — PBP 쪽처럼 좌측 컬럼과의 경계는 `GamePbpTab.tsx`의 `border-r`만 담당), 바디 래퍼도 배경 제거(`<div>`만 유지). 헤더의 `bg-slate-950 sticky` + 구분선, 행의 `hover:bg-white/5` + `border-b border-slate-800/50`는 그대로 유지(카드 테두리와는 별개의 요소).

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(실제 높이 일치 여부)은 미검증.

**롤백 방법**: 루트 div를 `bg-slate-900 border border-slate-800`로, 바디 래퍼를 `bg-slate-900`로 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats: 비율/성공률/득점/막대 4개 컬럼 균등화 + 플레이타입명 폭 확대

**배경**: 영문 라벨 적용 후 "Pick&Roll - Handler"/"Pick&Roll - Screener" 같은 긴 이름이 잘리는 스크린샷 확인. "비율·성공률·득점·그래프 4개 컬럼 폭을 균등 분배하고, 플레이타입 컬럼 폭을 넓혀달라" 요청.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: `grid-cols-[0.4fr_minmax(64px,0.28fr)_minmax(64px,0.28fr)_minmax(64px,0.28fr)_0.4fr_minmax(64px,0.28fr)_minmax(64px,0.28fr)_minmax(64px,0.28fr)_0.4fr]` — 막대(0.4fr)만 비율/성공률/득점(minmax(64px,0.28fr))과 다른 값, 플레이타입명도 0.4fr로 좁음.

**After**: `grid-cols-[minmax(64px,0.3fr)_minmax(64px,0.3fr)_minmax(64px,0.3fr)_minmax(64px,0.3fr)_1.4fr_minmax(64px,0.3fr)_minmax(64px,0.3fr)_minmax(64px,0.3fr)_minmax(64px,0.3fr)]` — 비율/성공률/득점/막대 8개(양쪽 4개씩) 전부 동일한 `minmax(64px,0.3fr)`, 플레이타입명은 `1.4fr`로 대폭 확대(fr 풀 전체의 약 37%).

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(긴 영문 이름이 실제로 안 잘리는지)은 미검증.

**롤백 방법**: `GRID_COLS`를 Before 값으로 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats: PnR_Pop 라벨도 영문화(Pick&Pop)

**배경**: 직전 라벨 영문화 작업에서 요청 목록에 없어 한글로 남겨뒀던 `PnR_Pop`('픽앤롤(팝)')도 영문화 요청.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: `PnR_Pop: '픽앤롤(팝)'`
**After**: `PnR_Pop: 'Pick&Pop'`

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 위 Before 값으로 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats: 막대를 플레이타입명 옆으로 이동 + 라벨 영문화 + 비율순 정렬

**배경**: (1) "막대그래프 컬럼을 플레이타입 바로 옆으로 이동" — 막대가 가장 바깥이었던 걸 가장 안쪽(중앙 라벨에 인접)으로. (2) 플레이타입 라벨 10개(+뒤이어 아이솔레이션 포함 11개) 한글→영문 교체. (3) "표시 순서는 비율 순으로" — 기존 시도횟수(combinedAttempts) 기준 정렬을 비율(share%) 합산 기준으로 변경.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**:
- 컬럼 순서: `[비율][성공률][득점][막대]`(바깥→안쪽 원정), `[막대][득점][성공률][비율]`(안쪽→바깥 홈) — 막대가 바깥.
- `PLAY_TYPE_LABEL`: 아이솔레이션/픽앤롤(볼핸들러)/픽앤롤(롤맨)/포스트업/캐치앤슛/컷/핸드오프/속공/풋백/오프볼 스크린/드라이브앤킥 (전부 한글).
- 정렬: `combinedAttempts`(원정+홈 합산 시도 횟수) 내림차순.

**After**:
- 컬럼 순서: `[비율][성공률][득점][막대]` → `[막대]`가 플레이타입명 바로 옆(가장 안쪽)으로 이동 — 원정은 `[비율][성공률][득점][막대]`, 홈은 `[막대][득점][성공률][비율]`(막대가 라벨과 맞닿음). 비율 값도 다른 두 컬럼과 동일한 `sc`(중앙정렬) 톤으로 통일(막대에 안 붙으니 별도 정렬 불필요).
- `PLAY_TYPE_LABEL`: Isolation, Pick&Roll - Handler, Pick&Roll - Screener, Post Up, Catch&Shoot, Cut, Handoffs, Transition, Putback, Offball Screen, Drive&Kick로 교체(픽앤롤(팝)만 한글 유지 — 요청 목록에 없었음).
- 정렬: `combinedShare`(원정+홈 share% 합산) 내림차순.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: `GRID_COLS`는 폭 값 자체는 안 바뀌었으니 그대로, 헤더/데이터 행의 컬럼 순서를 Before로 되돌리고 `PLAY_TYPE_LABEL`/정렬 기준(`combinedAttempts`)을 Before로 복원하면 됨.

---

## 2026-08-03 — PlayTypeStats: 비율/성공률/득점 컬럼 폭을 항상 동일하게 통일

**배경**: "비율, 성공률, 득점 컬럼이 언제나 동일한 너비를 공유하게 바꿔" 요청 — 직전엔 세 컬럼이 각각 다른 min/fr(0.15·0.35·0.25fr)이라 폭이 서로 달랐음.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: `grid-cols-[0.4fr_minmax(32px,0.15fr)_minmax(64px,0.35fr)_minmax(48px,0.25fr)_0.4fr_minmax(48px,0.25fr)_minmax(64px,0.35fr)_minmax(32px,0.15fr)_0.4fr]` — 비율/성공률/득점 3개가 서로 다른 min-px·fr.

**After**: 세 컬럼 전부 `minmax(64px,0.28fr)`로 동일하게 통일 — 최소 64px(가장 넓은 라벨 "성공률"/"100%" 기준)은 공통으로 보장하고 남는 공간도 fr 비율이 같아 항상 같은 폭을 유지.

**[구현 시 발견한 함정]** 처음엔 `const STAT_COL = 'minmax(64px,0.28fr)'`로 뽑아 템플릿 리터럴로 `` `grid-cols-[0.4fr_${STAT_COL}_...]` ``처럼 조립하려 했으나, Tailwind JIT는 소스 코드에 **온전한 문자열로 적힌** `grid-cols-[...]` 토큰만 정적 스캔해서 CSS를 생성하므로, 런타임에 조각을 이어붙이는 방식은 클래스가 생성되지 않아(스타일이 통째로 안 먹음) 위험함을 인지하고 하나의 완성된 문자열 리터럴로 다시 작성함.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: `GRID_COLS`를 Before 값으로 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats: 비율/성공률/득점 컬럼을 고정 px 대신 minmax(px, fr)로 전환

**배경**: 세 컬럼 폭이 32/72/52px로 제각각인 게 이상해 보인다는 지적에 이어 "픽셀 말고 fr로 분배하면 안 되냐" 요청. 순수 fr만 쓰면 패널이 좁아질 때 "성공률"/"100%"가 다시 줄바꿈되는 예전 버그(2026-08-03 "text-xs md:text-sm으로 통일" 이후 발견됐던 문제)가 재발할 수 있어 `minmax(최소px, Nfr)`로 절충.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: `grid-cols-[0.4fr_32px_72px_52px_0.4fr_52px_72px_32px_0.4fr]` — 비율/성공률/득점이 고정 px라 패널이 넓어져도 안 늘어남.

**After**: `grid-cols-[0.4fr_minmax(32px,0.15fr)_minmax(64px,0.35fr)_minmax(48px,0.25fr)_0.4fr_minmax(48px,0.25fr)_minmax(64px,0.35fr)_minmax(32px,0.15fr)_0.4fr]` — 최소 폭(32/64/48px)은 그대로 보장해 줄바꿈을 막으면서, 남는 공간은 fr 비율(0.15/0.35/0.25)대로 막대·플레이타입명과 함께 유동적으로 분배.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. Tailwind 화살괄호 안 `minmax(a,b)` 콤마 문법은 공식적으로 지원되는 패턴(`grid-cols-[repeat(auto-fill,minmax(200px,1fr))]`과 동일 방식). 브라우저 실동작은 미검증.

**롤백 방법**: `GRID_COLS`를 Before 값으로 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats: 마진 되돌리기 + 막대 헤더 중앙정렬 + 플레이타입명 축소분을 비율/성공률/득점에 분배

**배경**: "마진 4px 이상하니 제거" + "막대그래프 컬럼 헤더 텍스트도 중앙정렬" + "플레이타입 컬럼 너비를 줄이고 나머지를 비율/성공률/득점에 분배" 3개 요청.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: 비율(share%) span에 `ml-1`/`mr-1`(직전 turn 추가분), 막대 헤더의 팀 약어가 `text-left`(원정)/`text-right`(홈), `GRID_COLS = grid-cols-[0.4fr_28px_64px_48px_0.6fr_48px_64px_28px_0.4fr]`(플레이타입명 0.6fr).

**After**: `ml-1`/`mr-1` 제거. 막대 헤더 팀 약어 둘 다 `text-center`로 통일. `GRID_COLS`를 `grid-cols-[0.4fr_32px_72px_52px_0.4fr_52px_72px_32px_0.4fr]`로 변경 — 플레이타입명 0.6fr→0.4fr(막대와 동일 비중)로 줄이고, 비율 28→32px·성공률 64→72px·득점 48→52px로 확대.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: `GRID_COLS`를 Before 값으로, 막대 헤더 정렬을 `text-left`/`text-right`로, 비율 span에 `ml-1`/`mr-1`을 다시 추가하면 됨.

---

## 2026-08-03 — PlayTypeStats: 막대↔비율 사이 간격만 gap-2 상당으로 확대

**배경**: "막대그래프와 비율 컬럼 사이 여백이 gap-1이냐, 더 좁아 보이는데 거기에만 gap-2 적용해봐" 요청. 그리드 전체가 `gap-1` 하나로 균일 적용되는 구조라 특정 구간만 그리드 gap으로 조절할 수 없어, 비율(share%) 값 span에 마진을 추가하는 방식으로 그 구간만 넓힘.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: 원정/홈 비율(share%) span에 별도 마진 없음 — 막대↔비율 간격은 그리드 `gap-1`(4px)만 적용.

**After**: 원정 비율 span에 `ml-1`, 홈 비율 span에 `mr-1` 추가 — 막대 쪽으로 붙는 방향에 마진 4px를 더해 그리드 gap(4px)과 합쳐 총 8px(gap-2 상당)로 확대. 다른 컬럼 사이 간격(gap-1, 4px)은 그대로 유지.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 두 비율 span의 `ml-1`/`mr-1` 클래스만 제거하면 됨.

---

## 2026-08-03 — PlayTypeStats: 컬럼 순서 재배치(막대 바깥) + 헤더에 "플레이타입"/팀약어 라벨 통합

**배경**: "성공률과 득점을 비율 컬럼 안쪽으로, 막대그래프가 가장 밖으로" + "플레이타입에도 헤더 디자인 적용" + "막대그래프 컬럼 이름을 팀 약어로" 요청 3개를 한 번에 반영.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: 컬럼 순서 `[성공률][득점][막대][비율]-[이름]-[비율][막대][득점][성공률]`(성공률/득점이 바깥, 막대가 안쪽). "플레이타입" 라벨은 헤더 행과 분리된 별도 `<p>` 태그로 카드 맨 위에 위치, 헤더 행의 중앙/막대 칸은 빈 `<span />`.

**After**: `GRID_COLS`를 `grid-cols-[0.4fr_28px_64px_48px_0.6fr_48px_64px_28px_0.4fr]`로 재배치 — 컬럼 순서 `[막대][비율][성공률][득점]-[플레이타입명]-[득점][성공률][비율][막대]`(막대가 가장 바깥, 성공률/득점이 가장 안쪽). 헤더 행을 하나로 통합해 막대 컬럼엔 팀 약어(`awayBadge.abbr`/`homeBadge.abbr`), 중앙엔 "플레이타입" 라벨을 직접 표시 — 별도 `<p>` 타이틀 제거(데이터 없을 때만 폴백으로 유지).

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: `GRID_COLS`와 헤더/데이터 행 순서를 Before로 되돌리고, 별도 `<p>플레이타입</p>` 타이틀을 헤더 행 위에 복원하면 됨.

---

## 2026-08-03 — PlayTypeStats: 텍스트 톤뿐 아니라 테이블 구조 자체를 박스스코어와 동일하게

**배경**: 직전 수정은 텍스트 색상/정렬만 바꿨을 뿐 "테이블 헤더, 바디, 구분선 등 동일한 지점이 없다"는 정당한 지적 — `Table.tsx`의 실제 헤더(`bg-slate-950 sticky` + `text-slate-500 font-black`)/바디(`bg-slate-900`)/행(`hover:bg-white/5`)/셀 구분선(`border-b border-slate-800/50`) 클래스를 그대로 가져와 구조적으로 맞춤.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: 배경 없는 투명 `<div>`에 헤더 라벨 행(배경 없음, `text-slate-600 font-bold`)과 바디를 `divide-y`로만 구분, 행 호버 없음.

**After**: 최상위를 `bg-slate-900 border border-slate-800`로 감싸 박스스코어 Table의 카드 배경 재현. 헤더 행에 `bg-slate-950 sticky top-0 border-b border-slate-800 shadow-sm h-10` + 라벨 `text-slate-500 font-black`(Table.tsx TableHead와 동일 톤). 바디 각 행에 `border-b border-slate-800/50`(구분선) + `hover:bg-white/5 transition-colors`(TableRow와 동일 호버) 추가. 막대 트랙 배경은 `bg-slate-900`(카드 배경과 동일)이 되며 안 보이던 문제를 막아 `bg-slate-950`로 한 단계 더 어둡게 조정.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(sticky 헤더 등)은 미검증.

**롤백 방법**: 최상위 `bg-slate-900 border border-slate-800`, 헤더 행의 `bg-slate-950 sticky ...`, 바디 행의 `border-b hover:bg-white/5`를 전부 제거하고 이전의 `divide-y divide-slate-800/50` 컨테이너로 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats에 박스스코어 톤 적용 + 성공률/득점 흰색·중앙정렬

**배경**: "플레이타입 테이블도 박스스코어 탭의 박스스코어 테이블 디자인 적용하고, 성공률과 득점 컬럼 텍스트에도 흰색 텍스트 적용하고 중앙 정렬" 요청. `GameOnOffTab.tsx`에 적용했던 것과 동일한 박스스코어(`BoxScoreTable.tsx`) 톤(`text-xs font-semibold text-white font-mono tabular-nums`)을 재사용.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: 성공률/득점 값 `text-slate-400`, 원정은 `text-right`/홈은 `text-left`(팀별로 다른 정렬). 플레이타입명 `text-slate-300 font-bold`. 헤더의 성공률/득점 라벨도 데이터와 같은 좌우 정렬.

**After**: 성공률/득점 값에 `sc = 'text-xs md:text-sm font-mono font-semibold text-white text-center tabular-nums'` 공통 클래스 적용(팀 무관 동일 스타일, 중앙정렬). 비율(share%) 값에도 `tabular-nums` 추가해 톤 통일. 플레이타입명 `text-slate-300` → `text-white`, `font-bold` → `font-semibold`(박스스코어 식별 컬럼과 동일 톤). 헤더의 성공률/득점 라벨도 `text-center`로 맞춤.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 위 Before 값으로 각 클래스를 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats: 막대 트랙에 좌우 여백(mx-1) 추가

**배경**: 막대그래프 컬럼 자체엔 좌우 패딩이 전혀 없어(그리드 `gap-1`만 존재) 답답해 보인다는 피드백 — 막대 트랙에도 다른 컬럼 사이 간격(`gap-1`=4px)과 동일한 여백을 달라는 요청.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: 막대 트랙 `<div className="h-2.5 flex justify-end/start rounded-sm overflow-hidden bg-slate-900">` — 좌우 여백 없음, 그리드 셀 폭을 패딩 없이 꽉 채움.

**After**: `mx-1` 추가 — `<div className="h-2.5 mx-1 flex justify-end/start rounded-sm overflow-hidden bg-slate-900">`. 트랙(어두운 배경)이 grid 셀 안에서 좌우로 4px씩 들어가 다른 컬럼 간격과 시각적으로 통일됨.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 두 막대 div의 `mx-1` 클래스만 제거하면 됨.

---

## 2026-08-03 — PlayTypeStats: 성공률/득점 고정폭 확대(40/32→64/48)

**배경**: "아직도 이따구인데, 성공률과 득점 컬럼 너비를 넓혀야 되는거 아니냐" 피드백. 고정폭 컬럼을 넓히면 그만큼 fr 풀(막대+이름)의 절대 폭도 줄어드는 구조라, 성공률/득점에 여유를 주는 동시에 계속 지적받던 가운데 영역 비대함도 같이 완화됨.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: `grid-cols-[40px_32px_0.4fr_28px_0.6fr_28px_0.4fr_32px_40px]` — 성공률 40px, 득점 32px.

**After**: `grid-cols-[64px_48px_0.4fr_28px_0.6fr_28px_0.4fr_48px_64px]` — 성공률 64px, 득점 48px로 확대. fr 비율(0.4:0.6:0.4)은 그대로 유지하되, 고정폭이 늘어난 만큼 fr 풀이 나눠 가질 절대 픽셀 총량이 자동으로 줄어듦.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(실제 균형감)은 미검증.

**롤백 방법**: `GRID_COLS`를 Before 값으로 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats: 플레이타입명 fr 비율 과도 축소(1fr→0.6fr)로 재조정

**배경**: 직전 수정(막대 0.4fr + 플레이타입명 1fr, 합 1.8fr → 이름이 전체의 약 56%)이 반대로 이름 쪽을 너무 넓게 만듦. "이번엔 플레이타입명이 너무 넓다" 피드백.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: `grid-cols-[40px_32px_0.4fr_28px_1fr_28px_0.4fr_32px_40px]` (막대:이름 = 0.4:1, 이름이 fr 풀의 약 56%).

**After**: `grid-cols-[40px_32px_0.4fr_28px_0.6fr_28px_0.4fr_32px_40px]` (막대:이름 = 0.4:0.6, 이름이 fr 풀의 약 43% — 막대 하나의 1.5배 정도로 축소).

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(실제 균형감)은 미검증 — 여전히 과하면 0.5fr, 부족하면 0.7fr 등으로 미세조정 예상.

**롤백 방법**: `GRID_COLS`를 Before 값으로 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats: 막대 폭 축소분을 플레이타입명 쪽으로 이전(fr 풀 통합)

**배경**: 스크린샷에서 막대 영역이 너무 넓어 플레이타입명이 "픽앤롤(...", "아이솔..." 등으로 잘림. 사용자가 "그래프 영역이 1fr이냐, 0.4fr로 줄여보라"고 요청 — 다만 당시 구조(막대만 `1fr`, 플레이타입명은 `64px` 고정)에서는 막대 fr 숫자를 낮춰도 막대끼리의 비율(1:1)이 그대로라 시각적으로 아무 변화가 없음을 먼저 설명하고, 실제 효과를 내려면 플레이타입명도 fr 기반으로 바꿔 같은 여유 공간 풀에서 막대와 경쟁하게 해야 한다고 판단해 함께 수정.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: `grid-cols-[40px_32px_1fr_28px_64px_28px_1fr_32px_40px]` — 막대 `1fr`(fr 트랙 유일), 플레이타입명 `64px` 고정(fr 풀과 무관).

**After**: `grid-cols-[40px_32px_0.4fr_28px_1fr_28px_0.4fr_32px_40px]` — 막대 `0.4fr` + 플레이타입명 `1fr`을 같은 fr 풀(합 1.8fr)에 편입 — 남는 공간 중 막대 2개가 각각 0.4/1.8(≈22%), 플레이타입명이 1/1.8(≈56%)을 가져가 이름이 훨씬 넓어짐.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(실제 잘림 해소 여부)은 미검증.

**롤백 방법**: `GRID_COLS`를 Before 값으로 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats: 팀명 컬럼 제거 + 컬럼 폭 재배분(성공률/득점 확보)

**배경**: 스크린샷에서 헤더 라벨("성공률"/"득점")이 좁은 컬럼(28px/20px) 탓에 두 줄로 줄바꿈되는 문제 확인. "좌/우측 팀명 컬럼 제거, 정중앙 플레이타입명과 좌우 비율 컬럼은 최소폭으로, 성공률·득점 컬럼 폭 확보" 요청.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: 11컬럼 `grid-cols-[26px_28px_20px_1fr_28px_1.3fr_28px_1fr_20px_28px_26px]` — 맨 좌/우에 팀 약어(SEA/ORL) 컬럼, 플레이타입명 `1.3fr`(가장 넓음), 성공률/득점은 `28px`/`20px`(가장 좁음, 폰트 확대 후 줄바꿈 발생).

**After**: 9컬럼 `grid-cols-[40px_32px_1fr_28px_64px_28px_1fr_32px_40px]` — 팀 약어 컬럼 2개 완전 삭제(헤더·데이터 행 모두). 성공률 40px·득점 32px로 확대(줄바꿈 없이 "100%"까지 한 줄에 들어감), 비율 28px·플레이타입명 64px로 최소화. 막대(`1fr`) 폭은 그대로 유지해 차트 본연의 비중은 안 줄어듦.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: `GRID_COLS`를 Before 값으로 되돌리고, 헤더/데이터 행에 팀 약어 `<span>{awayBadge.abbr}/{homeBadge.abbr}</span>` 2곳씩 복원.

---

## 2026-08-03 — 경기기록 탭 좌우 비율 6:4 → 5:5로 조정

**배경**: "PBP 코멘터리와 플레이타입 분석 패널의 비율을 5:5로 조절해줘" 요청.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)

**Before**: 좌측(PBP) `flex-[6]`, 우측(플레이타입) `flex-[4]`.

**After**: 좌측 `flex-[5]`, 우측 `flex-[5]` — 정확히 절반씩.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 좌측 `flex-[5]` → `flex-[6]`, 우측 `flex-[5]` → `flex-[4]`로 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats 폰트 크기를 PBP 커멘터리와 통일

**배경**: "플레이타입 차트 내 모든 폰트를 pbp 커멘터리에 적용된 텍스트 크기와 동일하게" 요청. `GamePbpTab.tsx`의 커멘터리는 전부 `text-xs md:text-sm`로 통일돼 있는데(2026-08-03 "text-xs md:text-sm으로 다시 통일" 항목 참고), `PlayTypeStats.tsx`는 `text-[8px]`/`text-[9px]`/`text-[10px]`/일부 `text-xs` 고정으로 제각각이었음.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용)

**Before**: 헤더 라벨 `text-[8px]`, 데이터 행 값 `text-[9px]`, 중앙 플레이타입명 `text-[10px]`, 상단 "플레이타입"/"데이터 없음" 라벨만 `text-xs`(반응형 아님).

**After**: 전부 `text-xs md:text-sm`로 통일(모바일 12px/데스크탑 14px) — 커멘터리와 완전히 동일한 폰트 크기 규칙.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 위 Before의 각 크기 값으로 되돌리면 됨.

---

## 2026-08-03 — PlayTypeStats를 좌우 대칭 나비형(tornado) 레이아웃으로 재설계

**배경**: 직전 "플레이타입별 원정/홈 막대 2줄 묶음" 디자인이 사용자 마음에 안 들어 구조를 직접 지정: `[원정약어][성공률][득점][막대][비율] [플레이타입명] [비율][막대][성공률][득점][홈약어]` 한 줄에 다 담는 좌우 대칭(인구 피라미드/tornado 차트) 레이아웃 요청.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용) — 전면 재작성

**Before**: 플레이타입 라벨 아래 원정 막대 행 + 홈 막대 행을 세로로 쌓는 구조(플레이타입당 2줄).

**After**: 11컬럼 CSS 그리드(`grid-cols-[26px_28px_20px_1fr_28px_1.3fr_28px_1fr_20px_28px_26px]`)로 플레이타입 1개당 1행에 양 팀 정보를 모두 배치 — 원정은 바깥(약어)→안쪽(막대) 순, 홈은 안쪽(막대)→바깥(약어) 순으로 중앙의 플레이타입명을 기준으로 좌우 대칭. 막대는 원정이 `justify-end`(중앙 쪽으로 자람), 홈이 `justify-start`(중앙에서 바깥으로 자람)라 두 막대가 중앙에서 마주보는 tornado 차트 형태. 헤더 행도 같은 그리드로 컬럼 라벨(약어/성공률/득점/비율) 표시.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(11컬럼 좁은 패널에서 실제 가독성)은 미검증 — 필요시 컬럼 폭 미세조정 예상.

**롤백 방법**: 파일 전체를 이전 버전(플레이타입별 2줄 스택 막대)으로 되돌리면 됨 — `GamePbpTab.tsx` 호출부는 변경 없음.

---

## 2026-08-03 — PlayTypeStats를 테이블에서 플레이타입별 원정/홈 묶음 막대 차트로 변경

**배경**: "플레이타입 테이블을 팀 스탯 그래프처럼 좌우막대차트로" 요청에 대해, 한 플레이타입당 비율·성공률·득점 3개 지표가 서로 다른 단위라 `TeamStatsCompare`식 좌우 듀얼바(한 지표를 두 팀이 나눠 갖는 구조)엔 안 맞는다고 설명 — 대안으로 (A) 플레이타입별 원정/홈 막대 묶음, (B) 원정 전체→홈 전체 분리 두 가지 제시, 사용자가 (A) 선택.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (client 전용) — 전면 재작성

**Before**: 공용 `Table` 컴포넌트로 원정 행 전부 → 홈 행 전부를 시도수 내림차순 나열(플레이타입/팀배지/비율/성공률/득점 5컬럼).

**After**: `Table` 대신 커스텀 막대 리스트. 집계를 팀별 `Map<playType, {attempts,makes,points}>`로 만든 뒤, 두 팀에 나타난 플레이타입 합집합을 "두 팀 합산 시도수" 내림차순 정렬 → 플레이타입마다 그룹 하나(라벨 + 원정 막대 행 + 홈 막대 행, 해당 팀이 그 플레이타입을 안 썼으면 그 팀 행은 생략). `BarRow`는 팀 배지 + 막대(폭=비율%, 색=팀컬러) + 비율/성공률/득점 숫자 라벨.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작은 미검증.

**롤백 방법**: 파일 전체를 이전 버전(Table 기반)으로 되돌리면 됨 — `GamePbpTab.tsx`의 `PlayTypeStats` 호출부(props: shotEvents/homeTeamId/awayTeamId/homeBadge/awayBadge)는 변경 없이 그대로 호환됨.

---

## 2026-08-03 — 경기기록 탭 컨테이너 해체(박스스코어 스타일) + 팀 스탯 그래프 제거

**배경**: "경기기록 컨테이너를 해체하고 박스스코어 테이블처럼 패딩 없이 구분선으로 좌우 구분", "팀 스탯·플레이타입도 컨테이너 해체 + 여백 제거", "팀 스탯 그래프는 제거" 요청.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)
- `components/game/PlayTypeStats.tsx` (client 전용)
- `views/GameResultView.tsx` (client 전용 — 싱글플레이어 호출부, `homeBox`/`awayBox` prop 제거)
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 멀티플레이어 호출부, `homeBox`/`awayBox` prop 제거, 탭 wrapper 패딩 제외 목록에 `'pbp'` 추가)

**Before**: 좌측 PBP 카드 `bg-slate-900 border border-slate-800 shadow-inner rounded-xl overflow-hidden` + 우측 패널 동일 카드 스타일, 둘 사이 `gap-4`. 우측 패널엔 `TeamStatsCompare`(팀 스탯 듀얼 바 차트) + `PlayTypeStats`(테이블)가 `border-t`로 구분되어 있었음. `PlayTypeStats` 자체도 `px-3 py-2` 여백 보유. 멀티플레이어 탭 wrapper는 `'pbp'` 탭이 패딩 제외 목록에 없어 `p-6`가 적용되고 있었음.

**After**: 좌측 카드의 배경/테두리/라운딩/그림자 전부 제거, `gap-4` 제거, 대신 좌측에 `border-r border-slate-800`(모바일은 `border-b`)만 남겨 우측과의 경계선(박스스코어 standalone 분할과 동일한 "각자 테두리가 곧 구분선" 원리) 역할. 우측 패널도 카드 스타일 전부 제거. `TeamStatsCompare` 렌더링 및 `homeBox`/`awayBox` prop·import 완전히 제거(컴포넌트 파일 자체는 `LiveGameView.tsx`에서 계속 사용되므로 삭제하지 않음). `PlayTypeStats`는 외곽 `px-3 py-2` 제거, 내부 `Table`에 `!rounded-none !border-0 !shadow-none !bg-transparent` 적용해 자체 박스 스타일도 해체. 멀티플레이어 탭 wrapper 패딩 제외 목록에 `'pbp'` 추가.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작은 미검증.

**롤백 방법**: 좌측 카드 클래스를 Before의 `bg-slate-900 border border-slate-800 shadow-inner rounded-none md:rounded-xl overflow-hidden`로, 최상위 컨테이너에 `gap-4` 복원. 우측 패널도 동일 카드 클래스 복원 후 `TeamStatsCompare` 임포트/렌더 복원(homeBox/awayBox prop도 함께). `PlayTypeStats.tsx`의 `px-3 py-2`/Table className 되돌리기. `MultiGamePbpView.tsx`의 wrapper 패딩 제외 목록에서 `'pbp'` 제거.

---

## 2026-08-03 — 경기기록 탭 우측 패널에 플레이타입 비율·성공률·창출득점 섹션 추가

**배경**: "팀 스탯 말고 플레이타입 비율과 성공률, 창출 득점도 표현할 수 있나" 질문 — 조사 결과 샷차트용 `ShotEvent`(`types/engine.ts`)에 이미 `playType`/`isMake`/`points` 필드가 있어 엔진·DB 변경 없이 가능함을 확인, 우측 패널에 팀스탯 아래 새 섹션으로 추가하기로 확정. `ShotEvent`는 슛 시도만 기록하므로(턴오버로 끝난 포제션 미포함) "비율"은 "슛까지 이어진 시도 중 이 플레이타입 비율"이라는 한계를 인지하고 진행.

**변경 파일**:
- `components/game/PlayTypeStats.tsx` (신규, client 전용)
- `components/game/tabs/GamePbpTab.tsx` (client 전용) — `shotEvents` prop 추가, 우측 패널에 `TeamStatsCompare` 아래 섹션 삽입
- `views/GameResultView.tsx` (client 전용 — 싱글플레이어 호출부, 기존 `pbpShotEvents` 그대로 전달)
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 멀티플레이어 호출부, 기존 `gameData.shot_events` 그대로 전달)

**After**: `PlayTypeStats`는 `shotEvents`를 `teamId+playType`로 그룹핑해 팀별 시도수/성공수/득점을 집계, `PLAY_TYPE_LABEL`(12개 `PlayType` 유니언 값 → 한글 라벨)로 표시. 팀별 전체 시도수 대비 비율(`share`)·성공률(`makes/attempts`)·창출득점(성공한 시도의 `points` 합)을 계산해 공용 `Table` 컴포넌트로 렌더링(원정 행 먼저, 시도 수 내림차순 정렬 후 홈 행). `GamePbpTab`은 색상 계산이 이미 있던 `homeColor`/`awayColor`/`homeAbbr`/`awayAbbr`를 그대로 배지로 재사용.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(실제 집계값)은 미검증.

**롤백 방법**: `GamePbpTab.tsx`에서 `PlayTypeStats` 임포트/렌더 블록과 `shotEvents` prop 제거, 호출부 2곳의 `shotEvents={...}` 제거, `PlayTypeStats.tsx` 삭제.

---

## 2026-08-03 — 경기기록 탭 좌우 비율 6:4로 조정

**배경**: 직전 좌우 분할 구현이 좌측 `flex-1`(가변) + 우측 `md:w-72`(고정 288px)라 실제 화면 폭에 따라 비율이 들쭉날쭉했음. "비율을 6:4로 우측을 더 늘려줘" 요청.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)

**Before**: 좌측 `flex-1 min-w-0 min-h-0`, 우측 `shrink-0 md:w-72`(고정폭, 화면이 넓어져도 안 늘어남).

**After**: 좌측 `flex-[6] min-w-0 min-h-0`, 우측 `flex-[4] min-w-0`(고정폭 제거) — 화면 폭에 비례해 정확히 6:4 비율 유지.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 좌측 `flex-[6]` → `flex-1`, 우측 `flex-[4]` → `shrink-0 md:w-72`로 되돌리면 됨.

---

## 2026-08-03 — 경기기록 탭 좌/우 분할: 좌측 PBP 커멘터리 + 우측 팀 스탯 비교 막대 그래프

**배경**: "경기 기록 탭을 좌/우로 분할하고, 좌측엔 PBP 커멘터리, 우측엔 팀 스탯 비교 막대 그래프(라이브 시뮬레이션 뷰 우측 하단에 있는 것처럼)" 요청. 라이브 뷰(`views/LiveGameView.tsx`)에 이미 `TeamStatsCompare`(NBA 앱 스타일 듀얼 바 차트, PTS/FG%/3P%/FT%/OREB/REB/AST/STL/BLK/TOV/PF)가 그 파일 안에 비공개(미export) 컴포넌트로 존재해, 공용 컴포넌트로 추출해 재사용.

**변경 파일**:
- `components/game/TeamStatsCompare.tsx` (신규, client 전용) — `LiveGameView.tsx`에서 추출
- `views/LiveGameView.tsx` (client 전용) — 인라인 정의 제거, import로 교체
- `components/game/tabs/GamePbpTab.tsx` (client 전용) — 좌/우 분할 레이아웃 + `homeBox`/`awayBox` prop 추가
- `views/GameResultView.tsx` (client 전용 — 싱글플레이어 호출부)
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 멀티플레이어 호출부)

**Before**: `GamePbpTab`은 `h-[600px] w-full flex flex-col` 안에 PBP 카드 하나만 있었고, `homeBox`/`awayBox`/색상 prop이 아예 없었음. `TeamStatsCompare`는 `LiveGameView.tsx`에만 존재하는 비공개 컴포넌트.

**After**: `TeamStatsCompare`를 `components/game/TeamStatsCompare.tsx`로 그대로 추출(로직 변경 없음, export만 추가). `GamePbpTab`은 `flex flex-col md:flex-row gap-4`로 변경 — 좌측(`flex-1 min-w-0`)에 기존 PBP 카드, 우측(`md:w-72 shrink-0`)에 `<TeamStatsCompare>` 패널 추가. 색상은 `homeBadge?.color ?? TEAM_DATA[homeTeam.id]?.colors.primary ?? '#6366f1'`로 계산(멀티플레이어는 badge 색, 싱글플레이어는 실제 팀 컬러). 호출부 2곳(`GameResultView.tsx`, `MultiGamePbpView.tsx`)에 이미 스코프에 있던 `homeBox`/`awayBox`(또는 `gameData.home_box`/`away_box`)를 그대로 전달.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(레이아웃 분할·차트 렌더링)은 미검증.

**롤백 방법**: `GamePbpTab.tsx`의 우측 패널 블록 제거 + 최상위 div를 `flex flex-col`로 복귀, `homeBox`/`awayBox`/색상 prop 제거. `LiveGameView.tsx`에 `TeamStatsCompare`/`COMPARE_STATS` 인라인 정의 복원 후 import 제거. `TeamStatsCompare.tsx` 삭제. 호출부 2곳의 `homeBox`/`awayBox` prop 제거.

---

## 2026-08-03 — isFlowEvent 텍스트 매칭 버그 수정 (3개 파일 공통)

**배경**: 앰버 배너 적용 후 스크린샷에서 "4쿼터 시작" 행이 여전히 평범한 일반 행으로 뜨는 게 확인됨. 원인 조사 결과 `isFlowEvent` 판별이 `log.text.includes('경기 시작') || includes('종료') || includes('하프 타임')`였는데, 엔진(`services/game/engine/pbp/liveEngine.ts`)이 실제로 생성하는 쿼터 전환 텍스트는 `` `${state.quarter}쿼터 시작` ``(예: "2쿼터 시작", "4쿼터 시작")라 세 문구 중 어느 것도 포함하지 않아 감지가 안 되고 일반 행으로 새고 있었음. 같은 텍스트 매칭 로직이 `views/LiveGameView.tsx`, `views/multi/season/MultiGamePbpView.tsx`(라이브 PBP 피드)에도 복붙되어 있어 동일 버그 존재 확인, 사용자 확인 후 3곳 모두 수정. (`MultiGamePbpView.legacy.tsx`에도 같은 코드가 있으나 어디서도 import 안 되는 죽은 파일이라 제외.)

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용 — 경기기록 탭)
- `views/LiveGameView.tsx` (client 전용 — 싱글플레이어 라이브 경기 화면)
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 멀티플레이어 라이브 PBP 피드, 진행 중 경기 섹션)

**Before** (3곳 동일):
```tsx
const isFlowEvent = log.text.includes('경기 시작') || log.text.includes('종료') || log.text.includes('하프 타임');
```

**After** (3곳 동일):
```tsx
const isFlowEvent = log.teamId === 'SYSTEM';
```
엔진이 흐름 이벤트 로그를 만들 때 항상 `teamId: 'SYSTEM'`을 붙이므로(경기 시작 "경기 시작 (Tip-off)", 쿼터 전환 "N쿼터 시작", 하프타임 "하프타임 종료 — 3쿼터 시작" 전부) 문구가 바뀌어도 안전하게 감지됨.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작(4쿼터 시작 행이 실제로 배너로 뜨는지)은 미검증.

**롤백 방법**: 3곳 모두 `log.teamId === 'SYSTEM'`을 Before의 텍스트 매칭 3항 조건으로 되돌리면 됨.

---

## 2026-08-03 — 경기기록 탭 쿼터/경기 시작·종료 배너를 앰버 하이라이트로 변경

**배경**: "쿼터 시작/종료, 경기 시작/종료의 행은 색상을 다른 하이라이트 색상을 적용해줘" 요청 — 득점(네온 그린)·파울/턴오버/부상(빨강)과 겹치지 않는 별도 색으로 구분.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용 — `isFlowEvent` 배너)

**Before**: `bg-slate-800/40 border-y border-slate-800` 배경 + `text-indigo-300` 텍스트.

**After**: `bg-amber-500/10 border-y border-amber-500/20` 배경 + `text-amber-300` 텍스트 — 앰버(호박색) 테마로 통일해 득점 그린/경고 레드와 겹치지 않는 세 번째 하이라이트 색상으로 구분.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: `bg-amber-500/10 border-y border-amber-500/20` → `bg-slate-800/40 border-y border-slate-800`, `text-amber-300` → `text-indigo-300`로 되돌리면 됨.

---

## 2026-08-03 — 경기기록 탭 메타 컬럼(쿼터/시계/약어/스코어) 색상·굵기 통일 + 득점팀 네온 그린 하이라이트

**배경**: "쿼터, 게임클락, 원정팀, 스코어, 홈팀 스코어의 텍스트 굵기를 보통으로 만들고 텍스트 색상은 밝은 색상으로 통일" + "득점이 발생하면 발생한 팀의 약어와 그 팀의 스코어를 초록색으로 하이라이트" 요청. 이어서 그 초록색을 "레퍼런스 이미지처럼 더 밝은 네온 스타일"로 재요청.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)

**Before**: 1.쿼터(`text-slate-600 font-bold`), 2.시계(`text-slate-500 font-bold`), 3.원정약어(`font-black`, 활성 `text-slate-300`/비활성 `text-slate-700`로 팀별 명암 구분), 4.스코어(`font-black text-slate-500`, 득점 시 `text-white`만), 5.홈약어(3번과 동일 패턴) — 컬럼마다 굵기·명도가 제각각이고 팀 구분은 밝기 차이로만 표현.

**After**: 5개 컬럼 모두 `font-black`/`font-bold` 제거(기본 굵기) + 베이스 컬러 `text-slate-300`(밝은 회색)로 통일 — 더 이상 "이 로그의 팀이 아니라서 어둡게" 처리하지 않음. 대신 `didScore`(`isScore || (isFT && points>0)`) + `isHome`으로 `awayScored`/`homeScored`를 계산해, 득점이 발생한 바로 그 팀의 약어와 스코어 숫자만 `scoreHighlight = 'text-[#00e676] drop-shadow-[0_0_4px_rgba(0,230,118,0.65)]'`(네온 그린 + 은은한 글로우)로 하이라이트. 처음엔 `text-emerald-400`로 구현했다가, 레퍼런스 이미지 요청에 맞춰 더 밝고 채도 높은 커스텀 hex(`#00e676`, Material Green A400)로 교체 + `drop-shadow`로 네온 발광 느낌 추가.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 5개 컬럼을 Before 블록의 클래스로 되돌리고, `didScore`/`awayScored`/`homeScored`/`scoreHighlight` 상수 및 그 사용처(4곳)를 제거하면 됨.

---

## 2026-08-03 — 경기기록 탭 행 배경색 통일 (쿼터 시작/종료만 예외)

**배경**: "행 배경색이 계속 교차하지 않고 동일한 배경색이 이어지는 경우가 있는데 이유가 뭐지" 질문에 — 애초에 인덱스 기반 지브라 배경이 없고, `isInjury`(부상)/`isImportant`(정보·타임아웃) 타입 로그만 예외적으로 다른 배경(`bg-red-900/20`, `bg-slate-800/30`)을 갖는 구조라 설명. 이어서 "모든 행의 배경색을 통일하고, 배경색을 다르게 적용하는 건 쿼터 시작/종료 등에 적용해야겠어" 요청.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)

**Before**:
```tsx
let bgClass = 'hover:bg-white/5 transition-colors';
if (isInjury) bgClass = 'bg-red-900/20 border-y border-red-900/30';
else if (isImportant) bgClass = 'bg-slate-800/30 border-y border-slate-800/50';
```

**After**:
```tsx
const bgClass = 'hover:bg-white/5 transition-colors';
```
모든 일반 행이 동일한(투명+호버만) 배경을 쓰도록 통일. 쿼터 시작/종료/하프타임 등 흐름 이벤트는 이미 별도 분기(`isFlowEvent`, 이 코드보다 앞서 조기 return되는 중앙 정렬 배너, `bg-slate-800/40 border-y border-slate-800`)로 렌더링되고 있어 그대로 유지 — 요청한 "배경 구분은 쿼터 시작/종료에만"이 이미 그 경로로 충족됨. `isInjury`/`isImportant` 텍스트 색상 구분(`text-red-400 font-bold`, `text-slate-300`)은 배경과 무관하므로 그대로 유지.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 위 Before 블록으로 되돌리면 됨.

---

## 2026-08-03 — 경기기록 탭 커멘터리 색상 규칙 정리: 파울/턴오버 빨간색, 자유투 성공은 득점색, 선수 이름은 컨텍스트 색 상속

**배경**: 4가지 요청 — (1) 파울/턴오버 텍스트 빨간색, (2) 자유투 "성공"만 다른 득점 커멘터리와 동일 색상(현재 전부 cyan), (3) 선수 이름 볼드 → 보통 굵기, (4) 선수 이름 고정 흰색 → 커멘터리 컨텍스트 색 상속.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)

**Before**:
```tsx
let textColor = 'text-slate-400';
if (isInjury) textColor = 'text-red-400 font-bold';
else if (isImportant) textColor = 'text-slate-300';
else if (isScore) textColor = 'text-slate-200';
else if (isFT) textColor = 'text-cyan-400';           // 자유투는 성공/실패 구분 없이 전부 cyan
else if (isFoul) textColor = 'text-orange-400';        // 파울은 주황
else if (isTurnover) textColor = 'text-red-400';
...
playerNames.has(part) ? <span key={i} className="text-white font-bold">{part}</span> : part  // 선수 이름 항상 흰색+볼드
```

**After**:
```tsx
let textColor = 'text-slate-400';
if (isInjury) textColor = 'text-red-400 font-bold';
else if (isImportant) textColor = 'text-slate-300';
// 자유투는 "성공"(points > 0)한 경우만 일반 득점과 동일한 색상 — 전부 실패면 기본색 유지
else if (isScore || (isFT && (log.points ?? 0) > 0)) textColor = 'text-slate-200';
else if (isFoul || isTurnover) textColor = 'text-red-400';
...
playerNames.has(part) ? <span key={i}>{part}</span> : part  // 색/굵기 override 제거 → 부모 textColor 그대로 상속
```

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 위 Before 블록으로 되돌리면 됨.

---

## 2026-08-03 — 경기기록 탭: 폰트 크기 text-xs md:text-sm로 재통일 + 팀 로고를 약어 텍스트로 교체

**배경**: (1) 직전에 11px 고정으로 통일했던 걸 "text-xs md:text-sm으로 다시 통일해줘"로 정정 요청 — 반응형(모바일 12px/데스크탑 14px)으로 되돌리되 모든 요소에 동일하게 적용. (2) "팀 로고가 들어가는 곳엔 로고 대신에 약어를 사용해줘" — 3번(원정)/5번(홈) 컬럼의 `TeamMark`(원형 로고 또는 색상 배지 사각형)를 텍스트 약어로 교체.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)

**Before**:
- 폰트: 스크롤 컨테이너/교체로그/쿼터전환안내/쿼터표시/시간/스코어 전부 `text-[11px]` 고정
- 로고: `<TeamMark teamId={...} teamName={...} className="w-5 h-5 object-contain ..." badge={awayBadge/homeBadge} />` — badge 있으면 색상 사각형+약어, 없으면(싱글플레이어) 원형 `TeamLogo` 이미지

**After**:
- 폰트: 위 6곳 전부 `text-xs md:text-sm`로 교체(전체 파일 `text-[11px]` → `text-xs md:text-sm` 일괄 치환)
- 로고: `TeamMark` 제거, `awayAbbr`/`homeAbbr` 상수(컴포넌트 최상단에서 `badge?.abbr ?? team.id.toUpperCase().slice(0,3)`로 계산) + `<span className="text-xs md:text-sm font-black tracking-tight ${...}">{awayAbbr}</span>` 텍스트로 대체. 로그가 어느 팀 소속인지 표시하던 기존 opacity/grayscale 대비는 텍스트 색상 대비(`text-slate-300` 활성 / `text-slate-700` 비활성)로 치환. `TeamMark` import 제거(더 이상 사용 안 함).

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: `text-xs md:text-sm` 6곳을 `text-[11px]`로(그 전 상태 원하면), 또는 로고 부분은 `TeamMark` import 복원 + 두 `<span>` 블록을 이전 `<TeamMark ... badge={...} />` 블록으로 되돌리고 `awayAbbr`/`homeAbbr` 상수 제거.

---

## 2026-08-03 — 경기기록 탭 커멘터리 폰트 크기 11px로 통일

**배경**: "커멘터리 내 모든 텍스트는 11px로 통일해" 요청. 기존엔 컬럼마다 크기가 제각각(스크롤 컨테이너 기본값 `text-xs md:text-sm`, 쿼터 표시만 `text-[10px]`, 시간/스코어/교체 로그/쿼터전환 안내는 `text-xs`)이었음.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)

**Before/After** (전부 `text-[11px]`로 통일, 헤더의 쿼터 필터 버튼 텍스트는 "커멘터리 내부"가 아니라 헤더 컨트롤이라 대상에서 제외):
- 스크롤 컨테이너 기본값: `text-xs md:text-sm` → `text-[11px]` (메시지 본문은 이 값을 상속하므로 별도 수정 없이 자동 반영)
- 교체(IN/OUT) 로그 블록: `text-xs` → `text-[11px]`
- 쿼터 전환 안내("경기 시작"/"종료"/"하프 타임"): `text-xs` → `text-[11px]`
- 쿼터 표시(1Q~4Q): `text-[10px]` → `text-[11px]`
- 시간: `text-xs` → `text-[11px]`
- 스코어: `text-xs` → `text-[11px]`

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 위 각 항목을 Before 값으로 되돌리면 됨.

---

## 2026-08-03 — 경기기록 탭 쿼터 필터: 슬라이딩 핸들 제거 + PBP 헤더로 편입

**배경**: 직전 슬라이딩 핸들 버전에서 두 가지 문제 발견 — (1) `flex-1` 균등폭 버튼이라 "1쿼터" 같은 텍스트가 줄바꿈됨, (2) 핸들 이동 애니메이션에 랙. 요청: 핸들 애니메이션 제거하고 클릭 즉시 상태 전환, 필터 그룹을 PBP 커멘터리 헤더에 편입해 디자인 일체화.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용)

**Before**: 필터가 별도의 `mb-4` 바깥 pill(`rounded-full` + `absolute` 슬라이딩 핸들, `transition-all duration-300`)로 로그 영역과 분리돼 있었고, 로그 영역이 자체 `border border-slate-800 rounded-xl`을 가진 별개의 카드.

**After**: 필터와 로그 영역을 하나의 카드(`bg-slate-900 border border-slate-800 rounded-xl overflow-hidden`)로 합침 — 필터는 그 카드의 헤더 행(`border-b border-slate-800 bg-slate-950/60 h-11`)이 되고, 로그 스크롤 영역이 바로 그 아래. 버튼은 슬라이딩 핸들 없이 선택 시 즉시 `bg-slate-700 text-white`로 전환(비선택은 `text-slate-500`), `flex-1` 대신 콘텐츠 크기(`px-3` auto width) + `whitespace-nowrap`으로 텍스트 줄바꿈 문제 해결.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작은 미검증.

**롤백 방법**: Before 구조(별도 pill 헤더 + 별도 카드)로 되돌리면 됨 — 바로 이전 dev-log 항목("슬라이딩 핸들 세그먼트 컨트롤로 변경")의 After 블록 참고.

---

## 2026-08-03 — 경기기록 탭 쿼터 필터를 슬라이딩 핸들 세그먼트 컨트롤로 변경

**배경**: 첨부 이미지(단일 필 안에서 선택된 항목에 내부 핸들이 움직이는 디자인)처럼 전체/1~4쿼터 필터 버튼 디자인 변경 요청.

**변경 파일**:
- `components/game/tabs/GamePbpTab.tsx` (client 전용 — 단일플레이/멀티플레이 "경기 기록" 탭 공용 컴포넌트)

**Before**: 버튼 5개가 각자 독립된 배경(`bg-indigo-600`/`bg-slate-900 border`)을 가진 개별 pill 형태, `flex gap-2`로 나열.
```tsx
<div className="flex items-center gap-2 mb-4 px-4 md:px-0">
    {[0,1,2,3,4].map(q => (
        <button className={`px-4 py-2 rounded-lg ... ${selectedQuarter===q ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'bg-slate-900 text-slate-500 hover:bg-slate-800 ... border border-slate-800'}`}>
            {q===0?'전체':`${q}쿼터`}
        </button>
    ))}
</div>
```

**After**: 바깥 필(`rounded-full bg-slate-900 border border-slate-800 p-1`) 안에 `absolute` 슬라이딩 핸들(`bg-slate-700`, `left`/`width`를 `selectedQuarter`에 따라 `%`로 계산, `transition-all duration-300`)을 두고, 5개 버튼은 `flex-1`로 균등폭 배치해 핸들과 정확히 정렬(핸들의 부모를 패딩 없는 내부 `relative flex` div로 분리해 퍼센트 계산이 버튼 flex 박스와 어긋나지 않게 함). 버튼 자체는 배경 없이 텍스트 색상만 전환(`text-white` 선택/`text-slate-500` 비선택).

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작은 미검증.

**롤백 방법**: Before 블록으로 되돌리면 됨. (멀티플레이어 라이브 PBP 피드의 별도 쿼터 필터 — `MultiGamePbpView.tsx` 1653~1668행 — 는 이번 변경 대상이 아니라 그대로 유지됨, 필요 시 별도 작업.)

---

## 2026-08-03 — 온오프 탭: 조합 구분 라벨 폰트를 테이블 헤더와 통일

**배경**: "조합 테이블의 헤더에 있는 텍스트(2인 조합, 3인 조합, 5인 조합)의 폰트사이즈를 다른 테이블헤더와 동일하게" 요청. `CombinedComboTable`의 구분 라벨 행이 `text-[10px] font-bold tracking-wider`였는데, `Table.tsx`의 실제 컬럼 헤더(`TableHead`)는 `text-xs font-black tracking-widest`라 톤이 달랐음.

**변경 파일**:
- `components/game/tabs/GameOnOffTab.tsx` (client 전용)

**Before**: `<span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">`
**After**: `<span className="text-xs font-black uppercase tracking-widest text-slate-500">` — `Table.tsx:81`의 `TableHead` tr 클래스(`text-slate-500 text-xs font-black uppercase tracking-widest`)와 동일.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음.

**롤백 방법**: 위 After → Before로 클래스만 되돌리면 됨.

---

## 2026-08-03 — 온오프 탭: 상하 간격 제거 + 팀별 조합 테이블 병합(좌우 분할은 유지)

**배경**: "테이블 상하의 간격도 없애고, 모든 조합 테이블을 한 개의 테이블로 합쳐줘" 요청 → 처음엔 원정/홈까지 한 테이블로 합쳐서 구현했으나, 사용자 의도는 "좌/우(원정/홈)는 나누고, 그 안에서 2인/3인/5인만 합쳐달라"는 것이었음 — 정정.

**변경 파일**:
- `components/game/tabs/GameOnOffTab.tsx` (client 전용)

**Before**: 최상위 컨테이너 `gap-8`(선수별 On/Off 행과 2인/3인/5인 행 사이 세로 간격). 조합/라인업은 `ComboTable`을 6번 호출(원정/홈 × 2인/3인/5인) — 각각 독립된 `<Table>`로 총 6개의 분리된 테이블.

**After**: 최상위 컨테이너 `gap-8` → `gap-0`. `ComboTable`을 `CombinedComboTable`로 교체 — 팀 1개당 단일 `<Table>` 안에 2인/3인/5인 3개 그룹을 `colSpan={5}` 구분 라벨 행("2인 조합"/"3인 조합"/"5인 라인업")으로 나눠 렌더링(테이블 컬럼은 조합/MIN/ORTG/DRTG/NET 그대로, 팀 배지 컬럼은 불필요해 추가 안 함). 호출부는 `awayComboGroups`/`homeComboGroups` 2개를 만들어 `grid grid-cols-1 lg:grid-cols-2 gap-0`로 좌(원정)|우(홈) 배치 — 좌우 분할은 유지, 팀당 테이블 개수만 3개→1개로 줄어듦.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작은 미검증.

**롤백 방법**: `CombinedComboTable`/`awayComboGroups`/`homeComboGroups`/`ARITY_LABEL`을 제거하고 이전 `ComboTable`(단일 테이블 컴포넌트, `rows: ComboRow[]`만 받음)로 되돌린 뒤 호출부를 6번(원정/홈 × 2·3·5인, 각각 `grid grid-cols-1 lg:grid-cols-2 gap-0` 안에 2개씩)으로 복원, 최상위 컨테이너 `gap-0`을 `gap-8`로 되돌리기.

---

## 2026-08-03 — 온오프 탭: 헤더 팀명 풀네임 표시 + 좌우 섹션 간격 제거

**배경**: "헤더에 약어 대신 팀 풀네임을 적어주고, 좌우섹션 사이의 간격을 삭제해줘" 요청.

**변경 파일**:
- `components/game/tabs/GameOnOffTab.tsx` (client 전용)
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 호출부)

**Before**: `TeamHeader`가 `badge.abbr`(3글자 약어)를 팀명 자리에 표시. 원정/홈 좌우 배치 grid 4곳 전부 `gap-6`.

**After**: `GameOnOffTabProps`에 `homeTeamName`/`awayTeamName` 추가, `TeamHeader`가 `name` prop(풀네임)을 받아 표시하도록 변경. 호출부(`MultiGamePbpView.tsx`)에서 이미 존재하던 `homeName`/`awayName`(라인 1309-1310, `leagueTeams` 조회 결과의 `team_name`)을 그대로 전달. 좌우 배치 grid 4곳(`선수별 On/Off`, `2인`, `3인`, `5인`) 전부 `gap-6` → `gap-0`으로 변경 — 박스스코어 standalone 분할과 동일하게 두 테이블이 갭 없이 붙고 각자 테두리로만 구분됨.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작은 미검증.

**롤백 방법**: `TeamHeader`/`PlayerTable`의 `name` prop과 호출부의 `homeTeamName`/`awayTeamName` 제거하고 `badge.abbr`로 되돌리기, 4개 grid의 `gap-0`을 `gap-6`으로 되돌리기.

---

## 2026-08-03 — 온오프 탭 세부 정리: 이름 폰트 크기, 바깥 여백, 헤더 중복 제거

**배경**: "선수 이름 폰트 사이즈도 박스스코어와 동일하게, 테이블 상하좌우 패딩 삭제, 가장 위 테이블(원정+홈 선수별 On/Off) 빼고는 팀로고·팀명 헤더 삭제" 요청.

**변경 파일**:
- `components/game/tabs/GameOnOffTab.tsx` (client 전용)
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 탭 콘텐츠 wrapper)

**Before**:
- 이름 셀: `<TableCell variant="player" ... value={...} />` → `Table.tsx`의 player variant(`font-bold text-slate-200`, 크기 미지정 → 상속 기본 크기)
- 탭 콘텐츠 wrapper: `finalTab === 'box' || 'shotchart' || 'rotation'`일 때만 패딩 없음, `'onoff'`는 `p-6` 적용됨
- `ComboTable`이 `TeamHeader`(배지+팀명+타이틀)를 항상 렌더링 — 2인/3인/5인 테이블 6개 전부 헤더 있었음

**After**:
- 이름 셀: `<span className="text-xs font-semibold text-white truncate">` 직접 렌더링 — 박스스코어(`PlayerIdentityCells.tsx:42`)와 동일한 12px/세미볼드/흰색
- `MultiGamePbpView.tsx`의 콘텐츠 wrapper 조건에 `finalTab === 'onoff'` 추가 → 박스스코어와 동일하게 패딩 없이 flush
- `ComboTable`에서 `TeamHeader` 렌더링 및 `title`/`badge` prop 제거 — 2인/3인/5인 조합 테이블 6개는 헤더 없이 테이블만 렌더링. 최상단 원정/홈 선수별 On/Off 테이블(`PlayerTable`)에만 `TeamHeader` 유지.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작은 미검증.

**롤백 방법**: `ComboTable`에 `title`/`badge` prop과 `<TeamHeader>` 호출을 되살리고 호출부 6곳에 `title`/`badge` 다시 전달, 이름 셀을 `variant="player"`로 되돌리고, `MultiGamePbpView.tsx`의 wrapper 조건에서 `finalTab === 'onoff'` 제거.

---

## 2026-08-03 — 온오프 탭 디자인을 박스스코어 톤으로 통일

**배경**: "온오프 테이블의 디자인을 박스스코어의 디자인과 동일한 톤을 갖도록" 요청. 기존엔 테이블 바깥에 별도의 작은 배지+라벨 줄을 두고 `TableCell variant="stat"`(회색 텍스트)를 그대로 썼는데, `BoxScoreTable.tsx`의 standalone(좌우 분할) 스타일은 헤더 바(`bg-slate-950/80`, `border-l/border-r`)에 배지+팀명을 넣고, 숫자 셀은 `variant`를 안 쓰고 `text-xs font-semibold text-white font-mono tabular-nums`를 직접 `<td>`에 입혀 흰색·모노스페이스로 표시하는 방식이라 톤이 달랐음.

**변경 파일**:
- `components/game/tabs/GameOnOffTab.tsx` (client 전용)

**Before**: 테이블 바깥에 `flex items-center gap-2` + 작은 원형 배지(`w-7 h-7`) + `text-xs text-slate-400` 라벨. 숫자 셀은 `TableCell variant="stat"`(기본 `font-mono font-bold text-slate-300`, 즉 회색). Net 값 색상 판정이 `v >= 0 ? emerald : red`라 `null`(데이터 없음)이 `null >= 0 === true`로 평가되어 잘못 emerald로 칠해지는 버그 있었음.

**After**: `TeamHeader` 컴포넌트로 박스스코어와 동일한 헤더 바(`px-6 py-4 bg-slate-950/80 border-l border-r border-slate-800`, `w-8 h-8` 사각 배지, `text-sm font-black uppercase tracking-wider text-white` 팀명) 도입, 각 테이블을 `<Table className="!rounded-none">`로 헤더 바로 아래 이어붙임. 숫자 셀은 `sc = "text-xs font-semibold text-white font-mono tabular-nums"`를 직접 `className`으로 적용(박스스코어와 동일 톤). Net 계열 값은 박스스코어 +/- 셀과 같은 3분기 색상(`netColor`: null/0→slate-500, 양수→emerald-400, 음수→red-400)으로 교체해 null 오채색 버그도 같이 수정.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작은 미검증.

**롤백 방법**: `sc`/`netColor`/`TeamHeader`/`NetCell` 관련 부분을 제거하고 `TableCell variant="stat"` + 개별 `v >= 0` 색상 판정으로 되돌리면 됨 (git 커밋 전이라 파일 자체를 이전 버전으로 되돌려도 무방).

---

## 2026-08-03 — 온오프 탭 레이아웃: 원정/홈 1:1 분할 + 조합·라인업 팀별 테이블 분리

**배경**: "온오프도 원정/홈을 좌우 1:1로 분할하여 배치, 2인·3인·5인 조합도 양 팀을 나누어서 각각의 테이블로" 요청. 기존엔 선수별 On/Off가 원정→홈 순으로 세로로 쌓여있었고, 조합/라인업은 두 팀 데이터가 한 테이블에 섞여 시간순으로만 정렬돼 있었음.

**변경 파일**:
- `components/game/tabs/GameOnOffTab.tsx` (client 전용, UI 컴포넌트라 server 미러 없음)

**Before**: 선수별 On/Off 테이블 2개가 세로로 스택. `buildComboRows(target, minMp, limit)`가 팀 구분 없이 전체 조합을 시간순으로만 뽑아 2인/3인 조합 1쌍(양 팀 혼합), 5인 라인업 1개 테이블(양 팀 혼합)만 렌더링.

**After**: `buildComboRows(target, teamIds, arity, limit)`로 시그니처 변경 — `teamIds` 필터(조합의 모든 id가 해당 팀 로스터에 속하는지)와 `arity`를 받아 팀별로 분리. `result`에 `home/awayCombos2`, `home/awayCombos3`, `home/awayLineups` 6개 필드로 확장. 렌더링은 선수별 On/Off·2인·3인·5인 라인업 총 4개 섹션 모두 `grid grid-cols-1 lg:grid-cols-2`로 원정(좌)|홈(우) 1:1 배치, `ComboTable`에 `badge` prop 추가해 각 테이블에 팀 배지 표시.

**검증**: `npx tsc --noEmit -p tscheck.json` — 기존 에러 외 신규 에러 없음. 브라우저 실동작은 미검증.

**롤백 방법**: `buildComboRows`를 `(target, minMp, limit)` 시그니처로 되돌리고 `result`를 `combos`/`lineups` 2개 필드로 축소, 렌더링을 세로 스택 + 팀 혼합 테이블로 되돌리면 됨 (git 커밋 전이라 파일 자체를 이전 버전으로 되돌려도 무방).

---

## 2026-08-02 — BoxTick에 공격팀(off) 필드 추가 (멀티플레이어 On/Off·라인업 탭용)

**배경**: 종료된 멀티플레이어 경기 기록 화면에 "온오프" 탭(선수별 On/Off, 2·3인 조합 시너지, 5인 라인업 넷레이팅)을 새로 추가하기로 함. 계산에는 포제션 tick마다 "어느 팀의 공격이었는지"가 필요한데(득점 없는 미스/턴오버 포제션까지 정확히 공격/수비로 분류해야 ORTG/DRTG 분모가 맞음), 기존 `BoxTick`엔 `on`(온코트 10명)·`d`(스탯 델타)만 있고 공격팀 정보가 없어 무득점 tick은 역추론이 불가능했음. `stepPossession()` 내부에서 `state.possession`이 해당 tick 동안 고정이고 `recordBoxTick()` 호출 이후에야 플립되는 걸 확인해(스틸 직후 속공 득점도 다음 tick으로 넘어가 possession이 뒤집힌 뒤 처리되므로 한 tick=정확히 한 팀의 공격) `recordBoxTick()` 호출 시점의 `state.possession` 값을 그대로 저장하면 됨을 확인.

**변경 파일**:
- `types/engine.ts` (client) — `BoxTick` 인터페이스
- `server/src/shared/types/engine.ts` (server 미러) — `BoxTick` 인터페이스
- `services/game/engine/pbp/liveEngine.ts` (client) — `recordBoxTick()`
- `server/src/shared/engine/pbp/liveEngine.ts` (server 미러) — `recordBoxTick()`

**Before**:
```ts
export interface BoxTick {
    t:  number;
    on: string[];
    mp: number;
    d:  Record<string, BoxDelta>;
    shot?: { p: string; m: boolean };
}
```
```ts
state.boxTimeline.push({ t: currentTotalSec, on: onIds, mp: timeTaken / 60, d, ...(shot ? { shot } : {}) });
```

**After**:
```ts
export interface BoxTick {
    t:  number;
    on: string[];
    off?: 'home' | 'away';  // 이 포세션의 공격팀. 이전 저장 데이터엔 없음 — 소급 적용 없음
    mp: number;
    d:  Record<string, BoxDelta>;
    shot?: { p: string; m: boolean };
}
```
```ts
state.boxTimeline.push({ t: currentTotalSec, on: onIds, off: state.possession, mp: timeTaken / 60, d, ...(shot ? { shot } : {}) });
```

**연동 신규 파일** (롤백 시 같이 제거):
- `components/game/tabs/GameOnOffTab.tsx` — `boxTimeline`(단일 경기)에서 선수별 On/Off + 2·3인 조합 + 5인 라인업을 클라이언트에서 즉석 계산해 렌더링. `off` 필드가 없는 tick(구버전 데이터)은 스킵, 경기 전체에 `off` 필드가 아예 없으면 "데이터 없음" 표시.
- `views/multi/season/MultiGamePbpView.tsx` — `finalTab`에 `'onoff'` 탭 추가, `GameOnOffTab` 렌더 연결.

**검증**: `npx tsc --noEmit -p tscheck.json`(client), `cd server && npx tsc --noEmit`(server) 둘 다 기존 에러 외 신규 에러 없음 확인. UI 브라우저 실동작은 미검증(다음 경기 시뮬 후 확인 필요).

**롤백 방법**: 위 4개 파일 Before 블록으로 되돌리고, `GameOnOffTab.tsx` 삭제 + `MultiGamePbpView.tsx`에서 `'onoff'` 탭 관련 3곳(state 타입, 탭 버튼, 렌더 블록) 제거. `off` 필드는 optional이라 기존 저장된 `game_pbp.box_timeline`과 호환되며, 이 필드를 제거해도 다른 소비자가 없어 영향 없음.

---

## 2026-08-02 — 경기당 박스스코어에 Advanced/Defense 탭 추가 (Traditional/Advanced/Defense 셀렉터)

**배경**: "경기당 박스스코어에서도 Advanced/Defense 스탯을 보여줄 수 있나?" 요청으로 시작 — 조사 결과 `PlayerBoxScore`에 이미 필요한 원자료(존별 피FG% 필드, contestedAttempted/Made 등)가 다 있어 엔진 변경 없이 순수 계산으로 구현 가능함을 확인. 이후 여러 라운드 논의를 거쳐 Advanced는 Basketball-Reference 방식 MP비중 근사식(TS%/EFG%/USG%/AST%/TOV%/OREB%/DREB%/TRB%/PIE), Defense는 "존별 세분화는 컬럼이 너무 많아지니 컨테스트(DFGA/DFGM/DFG%) + 기본 수비스탯만"으로 범위 확정. 마지막으로 "팀별 박스스코어의 우측 위에 셀렉터를 추가해서 Traditional/Advanced/Defense를 선택"하도록 요청.

**신규 파일**:
- `utils/advancedBoxStats.ts` — `computeTeamBoxTotals()`(팀 합계), `computeAdvancedStats()`(TS%/EFG%/USG%/AST%/TOV%/OREB%/DREB%/TRB% 근사식), `computePieRaw()`(PIE 분자, 분모는 호출부에서 양팀 합산)
- `components/game/AdvancedBoxScoreTable.tsx` — `BoxScoreTable.tsx`와 동일한 카드 테마(팀컬러 상단바+헤더바+`standalone` 분기)로 PLAYER/MIN/TS%/EFG%/USG%/AST%/TOV%/OREB%/DREB%/TRB%/PIE 컬럼 렌더
- `components/game/DefenseBoxScoreTable.tsx` — 동일 테마로 PLAYER/MIN/STL/BLK/DREB/PF/DFGA/DFGM/DFG% 컬럼 렌더 (DFGA=`contestedAttempted`, DFGM=`contestedMade`)

**변경 파일**:
- `components/game/tabs/GameBoxScoreTab.tsx` (client 전용) — `statMode` state(`'traditional'|'advanced'|'defense'`) 추가, 박스스코어 그리드 위 우측 정렬 셀렉터(Traditional/Advanced/Defense 3버튼) 추가, 선택값에 따라 기존 `BoxScoreTable` / 신규 `AdvancedBoxScoreTable` / `DefenseBoxScoreTable` 중 하나를 양 팀(away/home)에 동일하게 렌더

**검증**: `npx vite build` clean.

**주의사항**:
- 순수 클라이언트 계산 — 엔진/DB/타입 스키마 변경 전혀 없음. `AdvancedBoxScoreTable`은 상대팀 박스(`oppBox`)를 함께 받아 REB%류 분모(상대 리바운드 기회)를 계산.
- Advanced의 각 %는 실제 온코트 포제션 추적이 아니라 "선수 MP / (팀 MP÷5)" 비중으로 팀 합계를 스케일링하는 Basketball-Reference 표준 근사식이라, 실제 NBA 스탯 사이트 수치와 정확히 일치하지 않을 수 있음(공식 자체가 근사치).
- 개인 ORTG/DRTG(포제션당 득실점 레이팅)는 신뢰할 만한 어시스트-슛 정밀 매칭이 어려워(`ShotEvent.assistPlayerId`는 확률 판정과 무관하게 항상 세팅되는 시각화용 데이터) 이번 구현에서 의도적으로 제외 — 필요시 추후 별도 논의.
- 셀렉터는 `GameBoxScoreTab`이 공유 컴포넌트라 싱글(`GameResultView.tsx`)/멀티(`MultiGamePbpView.tsx`) 양쪽에 동일 적용됨.

**롤백 방법**: 신규 3개 파일 삭제 + `GameBoxScoreTab.tsx`를 Before(셀렉터 없이 `BoxScoreTable`만 렌더하던 버전)로 되돌리면 됨.

---

## 2026-08-04 — 샷차트 툴팁 색상 조정: 미스 X 빨간색, 슛타입/거리 텍스트 밝게

**배경**: "툴팁 내에 야투 실패를 의미하는 X는 빨간색으로 처리해줘. 그리고 슛 타입과 거리 텍스트의 색상이 너무 어두워. 두 텍스트의 색상을 선수 이름 색보다 살짝 어둡게 수정해줘" 요청.

**변경 파일**:
- `components/game/ShotTooltip.tsx` (client 전용)

**Before**:
```tsx
// PrimaryShotInfo — 선수명 text-white, 슛타입/거리는 그보다 훨씬 어두운 slate-400/500
<span className="font-bold text-white truncate max-w-[120px]">{shot.playerName}</span>
{shot.shotType && <span className="text-slate-400">{shot.shotType}</span>}
<span className="text-slate-500 font-mono">{dist}ft</span>

// ClusterShotRow — 미스(✕) 표시가 slate-500(회색), 선수명 slate-300, 슛타입/거리 slate-500/600
<span className={shot.isMake ? 'text-emerald-400' : 'text-slate-500'}>{shot.isMake ? '●' : '✕'}</span>
<span className="text-slate-300 font-medium truncate max-w-[100px]">{shot.playerName}</span>
{shot.shotType && <span className="text-slate-500">{shot.shotType}</span>}
<span className="text-slate-600 font-mono">{dist}ft</span>
```

**After**:
```tsx
// PrimaryShotInfo — 슛타입/거리를 선수명(white)보다 살짝만 어둡게(slate-300)
<span className="font-bold text-white truncate max-w-[120px]">{shot.playerName}</span>
{shot.shotType && <span className="text-slate-300">{shot.shotType}</span>}
<span className="text-slate-300 font-mono">{dist}ft</span>

// ClusterShotRow — 미스(✕) 빨간색, 슛타입/거리를 선수명(slate-300)보다 살짝만 어둡게(slate-400)
<span className={shot.isMake ? 'text-emerald-400' : 'text-red-400'}>{shot.isMake ? '●' : '✕'}</span>
<span className="text-slate-300 font-medium truncate max-w-[100px]">{shot.playerName}</span>
{shot.shotType && <span className="text-slate-400">{shot.shotType}</span>}
<span className="text-slate-400 font-mono">{dist}ft</span>
```

**검증**: `npx vite build` clean.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-04 — 샷차트 툴팁 고정 상태에서 다른 도트 클릭 시 바로 재선택되던 문제 수정

**배경**: 직전 클릭-고정 기능 적용 후 "클릭으로 그룹 선택 후에 다른 도트에 커서를 올린뒤 클릭하면 바로 그 그룹이 선택되버리는데... 기존 선택이 해제되고 툴팁이 사라지게만 해줘. 그 이후에 한번 더 클릭했을때 선택되도록" 요청 — 원인은 `ShotTooltip`의 "바깥 클릭 시 닫힘" 로직이 `document`의 `mousedown` 이벤트를 별도로 감지해서, 다른 도트를 클릭하면 (1) mousedown이 먼저 감지돼 `onClose()`로 `isPinned`를 `false`로 만들고 → (2) 곧이어 컨테이너의 `onClick`(`handleClick`)이 실행될 땐 이미 `isPinned=false`라 "새로 선택" 분기를 타서 그 자리에서 바로 재고정되던 것.

**변경 파일**:
- `hooks/useShotChartTooltip.ts` (client 전용)
- `components/game/ShotTooltip.tsx` (client 전용, 4개 화면 공유)

**Before**:
```ts
// useShotChartTooltip.ts — 고정 여부와 무관하게 항상 "새로 선택" 로직만 실행
const handleClick = useCallback((e) => {
    const found = findNearest(e);
    if (!found) { setIsPinned(false); setTooltip(null); setHighlightShotIds(new Set()); return; }
    // ... setTooltip(...), setIsPinned(true) — 이미 고정돼 있어도 바로 새 슛으로 갈아탐
}, [findNearest]);
```
```tsx
// ShotTooltip.tsx — 별도 document mousedown 리스너로 "바깥 클릭 시 닫힘" 처리 (경쟁 상태의 원인)
useEffect(() => {
    if (!isPinned || !onClose) return;
    const handleOutside = (e) => {
        if (boxRef.current && !boxRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
}, [isPinned, onClose]);
```

**After**:
```ts
// useShotChartTooltip.ts — 이미 고정된 상태에서의 클릭은 "해제만" 하고 끝(재선택 안 함)
const handleClick = useCallback((e) => {
    if (isPinned) {
        setIsPinned(false); setTooltip(null); setHighlightShotIds(new Set());
        return; // 한 번 더 클릭해야 새로 고정됨
    }
    const found = findNearest(e);
    if (!found) return;
    // ... setTooltip(...), setIsPinned(true)
}, [isPinned, findNearest]);
```
```tsx
// ShotTooltip.tsx — document 리스너 완전히 제거. "바깥(코트) 클릭 시 닫힘"은 컨테이너의
// onClick(handleClick)이 전담. 대신 툴팁 내부 클릭(스크롤/닫기 버튼)이 컨테이너까지 버블링돼
// 고정 해제되지 않도록 wrapper에서 stopPropagation.
<div
    className={`absolute z-50 ${isPinned ? '' : 'pointer-events-none'}`}
    style={{ left, top }}
    onClick={isPinned ? (e) => e.stopPropagation() : undefined}
>
    <div className={`relative bg-slate-900/95 border rounded-xl ... ${isPinned ? 'border-indigo-500/60 pr-6' : 'border-slate-700'}`}>
        ...
    </div>
</div>
```

**검증**: `npx vite build` clean.

**주의사항**: X 닫기 버튼 클릭도 wrapper의 `stopPropagation`으로 컨테이너까지 안 올라가므로, 버튼 자체의 `onClick={onClose}`만 단독으로 실행됨(중복 처리 없음). 이제 동작 순서는: 클릭①(도트) → 고정 → 클릭②(다른 도트 포함, 어디든) → 고정 해제만 됨 → 클릭③(다시 그 도트) → 새로 고정. `boxRef`/`useEffect`/`useRef` import가 더 이상 필요 없어져 함께 제거.

**롤백 방법**: 두 파일 모두 Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-04 — 샷차트 툴팁 클릭 고정(pin) 기능 추가 — 클러스터 리스트 스크롤 가능하게

**배경**: "샷차트에서 도트가 여러개 몰려있는 지점에서는 툴팁 하단에 리스트가 생기는데, 이 리스트를 스크롤하기위해 마우스를 떼는 순간 툴팁이 사라져서 사실상 리스트 스크롤이 불가능해" 지적 — 원인은 툴팁이 `pointer-events-none`이고, 마우스가 도트에서 벗어난 오프셋 위치(+12px)에 뜨는 툴팁으로 이동하면 "가장 가까운 슛과 2ft 이내"라는 호버 판정 기준을 벗어나 자동으로 닫혔기 때문. "클릭으로 고정" 방식으로 해결하기로 결정 — 호버는 기존처럼 미리보기로 동작하고, 클릭하면 마우스를 옮겨도 안 사라지고 스크롤 등 상호작용이 가능한 고정 상태가 됨.

**변경 파일**:
- `hooks/useShotChartTooltip.ts` (client 전용) — `isPinned` 상태, `handleClick`, `closePinned` 추가. 좌표 변환+최근접 슛 탐색 로직을 `findNearest()`로 추출해 `handleMouseMove`/`handleClick`이 공유.
- `components/game/ShotTooltip.tsx` (client 전용, 4개 화면 공유) — `isPinned`/`onClose` prop 추가, 고정 시 `pointer-events-auto`+닫기(X) 버튼+테두리 색 변경, 바깥 클릭 시 닫히는 `useEffect`(mousedown 리스너), 고정 시 클러스터 리스트를 5개 제한 없이 전부 스크롤 가능하게 표시.
- 호출부 4곳(`components/game/tabs/GameShotChartTab.tsx`, `views/LiveGameView.tsx`, `views/multi/season/MultiFullCourtChart.tsx`, `views/multi/season/MultiShotChartTab.tsx`) — 컨테이너에 `onClick={handleClick}` 추가, `<ShotTooltip>`에 `isPinned`/`onClose={closePinned}` 전달.

**Before**:
```ts
// useShotChartTooltip.ts
export function useShotChartTooltip(shots, scale, clusterRadius = 1.5) {
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const [highlightShotIds, setHighlightShotIds] = useState<Set<string>>(new Set());
    const svgRef = useRef<SVGSVGElement | null>(null);

    const handleMouseMove = useCallback((e) => {
        // 좌표 변환 + 최근접 탐색 로직 (handleClick과 중복 없음, 애초에 handleClick이 없었음)
        ...
        setTooltip({ primaryShot: nearest, clusterShots: cluster, mouseX, mouseY });
    }, [shots, scale, clusterRadius, tooltip]);

    const handleMouseLeave = useCallback(() => {
        setTooltip(null);
        setHighlightShotIds(new Set());
    }, []);

    return { tooltip, highlightShotIds, svgRef, handleMouseMove, handleMouseLeave };
}
```
```tsx
// ShotTooltip.tsx
<div className="absolute z-50 pointer-events-none" style={{ left, top }}>
    <div className="bg-slate-900/95 border border-slate-700 rounded-xl ...">
        <PrimaryShotInfo shot={primaryShot} />
        {hasCluster && (
            <div className="space-y-0.5 max-h-[80px] overflow-y-auto custom-scrollbar">
                {clusterShots.slice(0, 5).map(shot => <ClusterShotRow key={shot.id} shot={shot} />)}
                {clusterShots.length > 5 && <span>+{clusterShots.length - 5} more</span>}
            </div>
        )}
    </div>
</div>
```

**After**:
```ts
// useShotChartTooltip.ts — findNearest()로 추출, isPinned 상태 추가
const [isPinned, setIsPinned] = useState(false);
const findNearest = useCallback((e) => { /* 좌표 변환 + 최근접 탐색, handleMouseMove/handleClick 공유 */ }, [shots, scale, clusterRadius]);

const handleMouseMove = useCallback((e) => {
    if (isPinned) return; // 고정 중엔 호버로 안 바뀜
    const found = findNearest(e);
    ...
}, [isPinned, findNearest, tooltip]);

const handleMouseLeave = useCallback(() => {
    if (isPinned) return; // 고정 중엔 마우스 나가도 안 사라짐
    ...
}, [isPinned]);

const handleClick = useCallback((e) => {
    const found = findNearest(e);
    if (!found) { setIsPinned(false); setTooltip(null); setHighlightShotIds(new Set()); return; }
    // ... setTooltip(...)
    setIsPinned(true);
}, [findNearest]);

const closePinned = useCallback(() => { setIsPinned(false); setTooltip(null); setHighlightShotIds(new Set()); }, []);

return { tooltip, highlightShotIds, svgRef, handleMouseMove, handleMouseLeave, handleClick, isPinned, closePinned };
```
```tsx
// ShotTooltip.tsx
useEffect(() => {
    if (!isPinned || !onClose) return;
    const handleOutside = (e: MouseEvent) => {
        if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
}, [isPinned, onClose]);

const visibleClusterShots = isPinned ? clusterShots : clusterShots.slice(0, 5);
const remainingCount = isPinned ? 0 : Math.max(0, clusterShots.length - 5);

<div className={`absolute z-50 ${isPinned ? '' : 'pointer-events-none'}`} style={{ left, top }}>
    <div ref={boxRef} className={`relative bg-slate-900/95 border rounded-xl ... ${isPinned ? 'border-indigo-500/60 pr-6' : 'border-slate-700'}`}>
        {isPinned && onClose && (
            <button onClick={onClose} className="absolute top-1.5 right-1.5 ..."><X size={10} /></button>
        )}
        <PrimaryShotInfo shot={primaryShot} />
        {hasCluster && (
            <div className={`space-y-0.5 overflow-y-auto custom-scrollbar ${isPinned ? 'max-h-[180px]' : 'max-h-[80px]'}`}>
                {visibleClusterShots.map(shot => <ClusterShotRow key={shot.id} shot={shot} />)}
                {remainingCount > 0 && <span>+{remainingCount} more</span>}
            </div>
        )}
    </div>
</div>
```

**검증**: `npx vite build` clean.

**주의사항**: 다른 슛을 클릭해 재고정할 때는 툴팁의 바깥-클릭 감지(`mousedown`)가 먼저 닫고, 곧이어 SVG 컨테이너의 `onClick`(`handleClick`)이 새 슛으로 다시 고정하는 순서라 자연스럽게 "재고정"으로 이어짐(깜빡임 없음, 같은 이벤트 루프). 빈 공간을 클릭하면 `findNearest`가 아무것도 못 찾아 고정 해제. 호버 프리뷰(비고정) 동작은 기존과 동일 — 클러스터 5개 제한 + "+N more" 요약, 고정 시에만 전체 스크롤 가능.

**롤백 방법**: 세 파일 모두 Before 블록 내용으로 되돌리고, 4개 호출부의 `onClick`/`isPinned`/`onClose` prop을 제거하면 됨.

---

## 2026-08-04 — 샷차트 툴팁 폰트 크기 11px로 통일

**배경**: "툴팁 내부의 텍스트들의 폰트 사이즈가 매우 다양한데, 이것들을 모두 11px로 통일시켜줘. 그만큼 툴팁의 사이즈는 커져도 상관없어" 요청 — `ShotTooltip.tsx`가 `text-[9px]`/`text-[10px]`/`text-xs`(12px)를 요소마다 제각각 쓰고 있었음.

**변경 파일**:
- `components/game/ShotTooltip.tsx` (client 전용 — 샷차트 호버 툴팁, `LiveGameView`/`MultiFullCourtChart`/`MultiShotChartTab`/`GameShotChartTab` 전부가 공유)

**Before**:
```tsx
// PrimaryShotInfo — 요소마다 text-[10px] / text-xs(선수명만 12px) 혼재
<div className="space-y-0.5">
    <span className="text-[10px] text-slate-400 font-mono">Q{shot.quarter} ...</span>
    <span className="text-[10px] font-black text-emerald-400">+{shot.points || 2}</span>
    <span className="text-xs font-bold text-white truncate max-w-[120px]">{shot.playerName}</span>
    ...
</div>
// ClusterShotRow 전체 text-[10px]
<div className="flex items-center gap-1.5 text-[10px]">...</div>
// "+N more" 만 text-[9px]
<span className="text-[9px] text-slate-600">+{clusterShots.length - 5} more</span>

const tooltipW = 220;
const tooltipH = hasCluster ? 140 : 80;
...
<div className="... min-w-[180px] max-w-[240px]">
```

**After**:
```tsx
// 컨테이너 div에 text-[11px] 한 번만 걸고 자식 span들에서 개별 폰트 크기 클래스 전부 제거
<div className="space-y-0.5 text-[11px]">
    <span className="text-slate-400 font-mono">Q{shot.quarter} ...</span>
    <span className="font-black text-emerald-400">+{shot.points || 2}</span>
    <span className="font-bold text-white truncate max-w-[120px]">{shot.playerName}</span>
    ...
</div>
<div className="flex items-center gap-1.5 text-[11px]">...</div>
<span className="text-[11px] text-slate-600">+{clusterShots.length - 5} more</span>

// 폰트 커진 만큼 클램프 추정치/컨테이너 폭도 같이 키움
const tooltipW = 240;
const tooltipH = hasCluster ? 155 : 90;
...
<div className="... min-w-[190px] max-w-[260px]">
```

**검증**: `npx vite build` clean.

**주의사항**: 이 컴포넌트는 4개 화면(싱글 `LiveGameView`, 멀티 `MultiFullCourtChart`/`MultiShotChartTab`/`GameShotChartTab`)이 전부 공유하므로 이번 변경이 전체 적용됨. 툴팁 위치 클램프(화면 우측/하단 넘어가면 반대쪽으로 뒤집기)에 쓰는 `tooltipW`/`tooltipH`는 실제 DOM 크기를 재는 게 아니라 하드코딩 추정치라, 폰트 확대에 맞춰 추정치도 같이 올려 화면 경계 근처에서 클램프가 부정확해지지 않게 함.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-03 — 마진/승률 차트 우측 끝에도 종료 지점 실선 추가

**배경**: "그래프의 우측 끝에도 동일한 실선을 추가해줘" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 마진/승률 차트 SVG)

**Before**: `x=0` 지점에만 실선.

**After**:
```tsx
{/* 좌/우측 끝 실선 — 경기 시작(0분)/종료 지점을 명확히 표시 */}
<line x1="0" y1="0" x2="0" y2={H} stroke="#475569" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
<line x1={W} y1="0" x2={W} y2={H} stroke="#475569" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
```

**검증**: `npx vite build` clean.

**롤백 방법**: 추가한 `x1={W}` 실선 한 줄만 삭제하면 됨.

---

## 2026-08-03 — 마진/승률 차트 좌측 끝에 시작 지점 실선 추가

**배경**: "그래프의 좌측 끝에 실선을 넣어서 시작지점을 알 수 있도록 해줘" 요청 — 쿼터 경계선(점선)은 있었지만 경기 시작(0분) 지점 자체를 표시하는 선이 없었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 마진/승률 차트 SVG)

**Before**:
```tsx
<svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
    <line x1="0" y1={MID} x2={W} y2={MID} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
    {Array.from({ length: maxQuarter - 1 }).map(...)}
```

**After**:
```tsx
<svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
    {/* 좌측 끝 실선 — 경기 시작(0분) 지점을 명확히 표시 */}
    <line x1="0" y1="0" x2="0" y2={H} stroke="#475569" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    <line x1="0" y1={MID} x2={W} y2={MID} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
    {Array.from({ length: maxQuarter - 1 }).map(...)}
```

**검증**: `npx vite build` clean.

**주의사항**: 쿼터 경계선(점선, `#1e293b`)과 구분되도록 실선 + 더 밝은 색(`#475569`) 사용.

**롤백 방법**: 추가한 `<line x1="0" y1="0" x2="0" y2={H} .../>` 한 줄만 삭제하면 됨.

---

## 2026-08-03 — 포제션 막대 팀 약어 폰트 크기 확대 (9px → 13px)

**배경**: "팀 약어 폰트 사이즈를 13px까지 올려줘" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `TeamPossessionRow`)

**Before**: `<span className={`${GUTTER_W} shrink-0 text-[9px] font-black ...`}>{label}</span>`

**After**: `<span className={`${GUTTER_W} shrink-0 text-[13px] font-black ...`}>{label}</span>`

**검증**: `npx vite build` clean.

**롤백 방법**: `text-[13px]`를 `text-[9px]`로 되돌리면 됨.

---

## 2026-08-03 — 포제션 막대: 오버레이 방식 되돌림 + 마진/승률 차트·쿼터 라벨 행도 동일 여백 적용

**배경**: 직전 오버레이 방식으로 바꾼 결과를 스크린샷으로 확인한 사용자가 "차라리 그래프를 이름 영역이 끝나는 지점부터 시작하도록 변경해줘" 요청 — 막대는 오버레이라 컨테이너 전체 폭(0~100%)을 쓰는데, 위/아래의 마진·승률 차트와 쿼터 라벨(1Q/2Q/3Q/4Q) 행은 라벨 폭만큼의 여백이 없어서 막대와 시간축 시작점이 서로 어긋나 보였음(차트에는 득점으로 인한 변동이 보이는데 그 바로 아래 막대에는 대응하는 색이 없는 것처럼 보이는 원인). 직전 오버레이 방식을 다시 고정폭 칸 방식으로 되돌리고, 이번엔 차트/쿼터 라벨 행에도 동일한 폭의 빈 칸을 줘서 세 요소의 시간축 시작점을 픽셀 단위로 맞춤.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `TeamPossessionRow` + 마진/승률 차트 + 쿼터 라벨 행)

**Before**:
```tsx
const GUTTER_W = 'w-9'; // (신규 추가 전엔 없었음)

// TeamPossessionRow — 라벨이 막대 위 오버레이
<div className="relative flex h-3 w-full">
    {positioned.map(...)}
    <span className="absolute left-0 top-1/2 -translate-y-1/2 bg-slate-950 pr-1 ...">{label}</span>
    {hovered && (...)}
</div>

// 차트 — 여백 없이 컨테이너 전체 폭 사용
<div ref={chartRef} className="relative w-full cursor-crosshair" style={{ aspectRatio: `${W} / ${H}` }} ...>
    ...
</div>

// 쿼터 라벨 행 — 여백 없이 전체 폭 사용
<div className="flex text-[10px] font-bold text-slate-600 uppercase tracking-wider relative h-4">
    {Array.from({ length: maxQuarter }).map(...)}
</div>
```

**After**:
```tsx
// 포제션 막대의 팀명 라벨 칸 폭 — 마진/승률 차트, 쿼터 라벨 행에도 동일하게 적용해
// 세 요소의 시간축(0~100%) 시작점을 픽셀 단위로 맞춘다.
const GUTTER_W = 'w-9';

// TeamPossessionRow — 라벨을 다시 고정폭 칸으로
<div className="flex items-center gap-2 w-full">
    <span className={`${GUTTER_W} shrink-0 text-[9px] font-black text-slate-300 uppercase tracking-wider truncate`}>{label}</span>
    <div className="relative flex-1 h-3 flex">
        {positioned.map(...)}
        {hovered && (...)}
    </div>
</div>

// 차트 — 동일 폭의 빈 칸을 왼쪽에 추가
<div className="flex items-center gap-2 w-full">
    <div className={`${GUTTER_W} shrink-0`} />
    <div ref={chartRef} className="relative flex-1 cursor-crosshair" style={{ aspectRatio: `${W} / ${H}` }} ...>
        ...
    </div>
</div>

// 쿼터 라벨 행 — 동일 폭의 빈 칸을 왼쪽에 추가
<div className="flex items-center gap-2 w-full">
    <div className={`${GUTTER_W} shrink-0`} />
    <div className="flex-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider relative h-4">
        {Array.from({ length: maxQuarter }).map(...)}
    </div>
</div>
```

**검증**: `npx vite build` clean.

**주의사항**: 팀명 라벨 칸(`w-9`)만큼 막대/차트/쿼터라벨 세 요소 모두 실제 그리기 영역이 컨테이너 전체 폭보다 살짝 좁아지지만(동일하게), 셋의 0~100% 시간축 시작점이 픽셀 단위로 일치해서 더 이상 어긋나 보이지 않음. `chartRef`(마우스 위치 → hoverFrac 계산)는 이제 안쪽 `flex-1` div에 그대로 붙어있어 별도 보정 없이 정상 동작. 이전 "오버레이 방식" 항목은 이 항목으로 대체됨(같은 날 연속 수정).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-03 — 포제션 막대: 팀명 라벨을 다시 오버레이 방식으로 (초반 이벤트 미표시 버그 수정)

**배경**: 스크린샷으로 "팀이름이 들어가는 영역에 점수가 발생해서 그래프가 변동이 있는데, 막대에는 이벤트가 표시되지 않아" 지적 — 예전에 "팀명과 막대가 겹쳐 보인다"는 피드백으로 라벨을 막대 바깥의 고정폭 칸(`w-8`)으로 분리했는데, 그 칸만큼 막대의 실제 시작점이 밀리면서 게임 초반(그 칸이 차지한 폭에 해당하는 시간대)의 이벤트가 막대에 아예 렌더링되지 않는 부작용이 있었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `TeamPossessionRow`)

**Before**:
```tsx
<div className="flex items-center gap-2 w-full">
    <span className="w-8 shrink-0 text-[9px] font-black text-slate-300 uppercase tracking-wider truncate">{label}</span>
    <div className="relative flex-1 h-3 flex">
        {positioned.map(...)}
        {hovered && (...)}
    </div>
</div>
```
(라벨이 `w-8` 고정폭을 차지해서 막대 자체의 시간축(0~100%)이 그 폭만큼 밀려 시작함)

**After**:
```tsx
<div className="relative flex h-3 w-full">
    {positioned.map(...)}
    {/* 라벨을 막대 폭 계산에서 아예 빼고, 불투명 배경 칩으로 그 위에 얹는다 */}
    <span className="absolute left-0 top-1/2 -translate-y-1/2 bg-slate-950 pr-1 text-[9px] font-black text-slate-300 uppercase tracking-wider z-10 pointer-events-none">
        {label}
    </span>
    {hovered && (...)}
</div>
```

**검증**: `npx vite build` clean.

**주의사항**: 막대가 이제 컨테이너 전체 폭(0~100%)을 그대로 쓰므로 게임 초반 이벤트도 정확한 위치에 표시됨. 라벨은 `bg-slate-950`(불투명) 배경의 오버레이 칩이라 밑에 어떤 색 세그먼트가 있어도 텍스트가 항상 또렷하게 보임 — 예전에 "겹쳐 보인다"고 지적됐던 문제(텍스트만 얹고 배경이 없어서 색이 비쳐 보이던 것)는 불투명 배경으로 해결. 다만 라벨이 차지하는 그 폭만큼의 세그먼트는 시각적으로 살짝 가려질 수 있음(호버는 여전히 가능 — 라벨은 `pointer-events-none`).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-03 — 포제션 플레이 상세: 자유투 별도 표시 + 선수명 옆 팀 약어 추가

**배경**: "자유투도 따로 표시해줘. 그리고 선수 이름에 팀명이 표시가 안돼서 어떤 팀의 플레이인지 구분이 안돼. 선수이름 옆에 괄호치고 팀약어를 적어줘" 요청 — 기존엔 자유투 득점이 필드골 득점과 똑같이 "🏀 득점" 하나로만 뭉뚱그려져 구분이 안 됐고, 플레이 상세에 팀 정보가 아예 없어서 어느 팀 선수인지 알 수 없었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```ts
type PlayDetail = { kind: 'pts' | 'ast' | 'reb' | 'stl' | 'blk' | 'tov'; playerName: string; value?: number };
...
const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of homeBox) map.set(p.playerId, p.playerName);
    for (const p of awayBox) map.set(p.playerId, p.playerName);
    return map;
}, [homeBox, awayBox]);
...
const name = playerNames.get(playerId) ?? '?';
if (delta.pts) details.push({ kind: 'pts', playerName: name, value: delta.pts });
if (delta.ast) details.push({ kind: 'ast', playerName: name });
// ... (자유투 전용 표시 없음)
```
```tsx
<span className="text-white">{p.playerName}</span>
{p.value != null && <span className="text-slate-400">+{p.value}</span>}
```

**After**:
```ts
type PlayDetail = { kind: 'pts' | 'ast' | 'reb' | 'stl' | 'blk' | 'tov' | 'ft'; playerName: string; teamAbbr: string; value?: number; attempts?: number };
...
const playerInfoMap = useMemo(() => {
    const map = new Map<string, { name: string; teamAbbr: string }>();
    for (const p of homeBox) map.set(p.playerId, { name: p.playerName, teamAbbr: homeAbbr });
    for (const p of awayBox) map.set(p.playerId, { name: p.playerName, teamAbbr: awayAbbr });
    return map;
}, [homeBox, awayBox, homeAbbr, awayAbbr]);
...
const { name, teamAbbr } = playerInfoMap.get(playerId) ?? { name: '?', teamAbbr: '' };
if (delta.pts) details.push({ kind: 'pts', playerName: name, teamAbbr, value: delta.pts });
// 자유투는 성공(pts)/실패 여부와 무관하게 시도(fta)가 있으면 필드골 득점과 별도로 표시
if (delta.fta) details.push({ kind: 'ft', playerName: name, teamAbbr, value: delta.ftm ?? 0, attempts: delta.fta });
if (delta.ast) details.push({ kind: 'ast', playerName: name, teamAbbr });
// (이하 reb/stl/blk/tov도 전부 teamAbbr 포함)

// PLAY_DETAIL_META에 ft 추가: { icon: '🎯', label: '자유투', color: 'text-teal-400' }
// PLAY_KIND_ORDER에 ft:4 추가 (어시스트 다음, 턴오버/득점 이전)
```
```tsx
<span className="text-white">{p.playerName}</span>
<span className="text-slate-500">({p.teamAbbr})</span>
{p.kind === 'ft'
    ? <span className="text-slate-400">{p.value ?? 0}/{p.attempts ?? 0}</span>
    : (p.value != null && <span className="text-slate-400">+{p.value}</span>)}
```

**검증**: `npx vite build` clean.

**주의사항**: 자유투는 `BoxDelta.fta`(시도)가 있으면 성공 여부와 무관하게 "🎯 자유투 선수명 (팀약어) M/A" 형태로 별도 표시되고, 득점(🏀)은 자유투 포함 그 포제션의 총 득점을 그대로 보여줌(앤드원처럼 필드골+자유투가 같이 있는 경우 둘 다 표시됨). 어시스트 아이콘이 기존 🎯(자유투와 겹침)이라 🤝로 변경. 팀 약어는 `homeBox`/`awayBox` 소속 여부로 판별(playerId가 어느 배열에 있는지).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-03 — [엔진] 자유투 미스+오펜시브 리바운드 시 포제션이 부당하게 조기 종료 스탬프되던 버그 수정

**배경**: 직전 엔진 조사에서 발견한 반대 방향 결함 — 필드골 미스 경로(`missEndsPossession = !(rebounder && result.reboundType==='off')`)는 오펜시브 리바운드면 포제션 종료 스탬프를 생략하는데, 자유투 3개 경로(팀파울 보너스 자유투/슈팅파울 자유투/앤드원 자유투)는 전부 **자유투 성공 여부만으로** `isPossessionEnd`를 찍어서, 마지막 자유투가 빗나가고 슈팅팀이 오펜시브 리바운드를 잡아 공격을 이어가도 이미 "포제션 종료"로 기록돼버렸음 — 실제로는 하나로 이어진 포제션이 인사이트 막대에서 두 개로 쪼개져 보이는 원인.

**변경 파일**:
- `services/game/engine/pbp/statsMappers.ts` (client) — `handleFreeThrowRebound()` + 앤드원/팀파울 보너스 자유투/슈팅파울 자유투 3개 호출부
- `server/src/shared/engine/pbp/statsMappers.ts` (server 미러) — 동일 3개 호출부

**Before**:
```ts
const handleFreeThrowRebound = (shooter: LivePlayer) => {
    const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
    rebPlayer.reb += 1;
    if (rebType === 'off') rebPlayer.offReb += 1; else rebPlayer.defReb += 1;
    addLog(state, rebPlayer.playerId, getReboundCommentary(rebPlayer, rebType), 'info');
    // 반환값 없음 — 호출부가 오펜시브 리바운드 여부를 알 수 없음
};

// 앤드원
} else {
    actor.fta += 1;
    logText += ` + 앤드원 실패${foulText}`;
    handleFreeThrowRebound(actor);
}
addLog(state, offTeam.id, logText, 'score', totalPointsAdded, undefined, 'scoring'); // 항상 'scoring'

// 팀파울 보너스 자유투
addLog(state, offTeam.id, `...`, 'freethrow', ftMade, undefined, ftMade > 0 ? 'scoring' : 'nonScoring'); // 성공 여부만 반영
if (!lastShotMade) handleFreeThrowRebound(actor);

// 슈팅파울 자유투
addLog(state, offTeam.id, `...`, 'freethrow', ftMade, defTeam.id, ftMade > 0 ? 'scoring' : 'nonScoring'); // 성공 여부만 반영
if (!lastShotMade) handleFreeThrowRebound(actor);
```

**After**:
```ts
// 반환값(rebType)으로 호출부가 오펜시브 리바운드 여부를 판단
const handleFreeThrowRebound = (shooter: LivePlayer): 'off' | 'def' => {
    const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
    rebPlayer.reb += 1;
    if (rebType === 'off') rebPlayer.offReb += 1; else rebPlayer.defReb += 1;
    addLog(state, rebPlayer.playerId, getReboundCommentary(rebPlayer, rebType), 'info');
    return rebType;
};

// 앤드원 — 미스+오펜시브 리바운드면 포제션 종료 스탬프 생략
let scoreEndsPossession = true;
} else {
    actor.fta += 1;
    logText += ` + 앤드원 실패${foulText}`;
    const rebType = handleFreeThrowRebound(actor);
    scoreEndsPossession = rebType !== 'off';
}
addLog(state, offTeam.id, logText, 'score', totalPointsAdded, undefined, scoreEndsPossession ? 'scoring' : undefined);

// 팀파울 보너스 자유투 — 리바운드 결과부터 확인 후 로그 스탬프
let ftEndsPossession = true;
if (!lastShotMade) {
    const rebType = handleFreeThrowRebound(actor);
    ftEndsPossession = rebType !== 'off';
}
addLog(state, offTeam.id, `...`, 'freethrow', ftMade, undefined, ftEndsPossession ? (ftMade > 0 ? 'scoring' : 'nonScoring') : undefined);

// 슈팅파울 자유투 — 동일 패턴
let ftEndsPossession = true;
if (!lastShotMade) {
    const rebType = handleFreeThrowRebound(actor);
    ftEndsPossession = rebType !== 'off';
}
addLog(state, offTeam.id, `...`, 'freethrow', ftMade, defTeam.id, ftEndsPossession ? (ftMade > 0 ? 'scoring' : 'nonScoring') : undefined);
```

**검증**: `npx vite build` clean (client). `cd server && npx tsc -p tsconfig.json` → 정확히 30개 에러(기존 베이스라인과 동일, statsMappers.ts발 에러 없음). `flyctl deploy` 실행 → `flyctl status` state=started 확인, `curl` → 200 확인.

**주의사항**: `handleFreeThrowRebound()` 호출부는 총 3곳(앤드원 자유투, 팀파울 보너스 자유투, 슈팅파울 자유투) 전부 동일 패턴으로 수정 — 리바운드 결과(`resolveRebound`)를 먼저 확인한 뒤에야 그 자유투 로그의 `possessionOutcome`을 결정하도록 순서를 바꿈(기존엔 로그를 먼저 찍고 리바운드 처리가 나중이라 순서상으로도 늦었음). 오펜시브 리바운드가 아닌 절대다수의 케이스는 동작 변화 없음(정상적으로 그 자리에서 포제션이 끝남).

**롤백 방법**: 두 파일 모두 Before 블록 내용으로 되돌리고 재배포하면 됨.

---

## 2026-08-03 — [엔진] 포제션 시간 상한이 오펜시브 리바운드 후 샷클락(14초)을 무시하던 버그 수정

**배경**: 인사이트 탭 포제션 막대에서 "한 포제션이 24초를 넘는 경우가 많다"는 지적을 조사한 결과, 오펜시브 리바운드로 이어진 정상적인 연장(각 시도는 규정 이내, 합산만 24초 초과)과는 별개로 실제 엔진 버그를 발견 — `calculatePossessionTime()`의 시간 상한이 `state.shotClock`(오펜시브 리바운드 시 24→14로 정확히 리셋됨, `liveEngine.ts:478`)을 전혀 참조하지 않고 하드코딩된 23초 고정 상한만 적용해서, 리바운드로 이어진 두 번째 시도도 14초가 아니라 최대 23초까지 배정될 수 있었음.

**변경 파일**:
- `services/game/engine/pbp/timeEngine.ts` (client)
- `server/src/shared/engine/pbp/timeEngine.ts` (server 미러)

**Before**:
```ts
const floor = playType === 'Transition' ? 4 : 8;

if (timeTaken < floor) timeTaken = floor;
if (timeTaken > 23) timeTaken = 23;
```

**After**:
```ts
const floor = playType === 'Transition' ? 4 : 8;

if (timeTaken < floor) timeTaken = floor;
// 상한을 23 고정값이 아니라 state.shotClock(오펜시브 리바운드 후 14로 리셋됨)과 함께 고려
const ceiling = Math.min(23, state.shotClock);
if (timeTaken > ceiling) timeTaken = ceiling;
```

**검증**: `npx vite build` clean (client). `cd server && npx tsc -p tsconfig.json` → 정확히 30개 에러(기존 베이스라인과 동일, timeEngine.ts발 에러 없음). `flyctl deploy` 실행 → `flyctl status` state=started 확인, `curl -o /dev/null -w "%{http_code}" https://basketballgm-app-server.fly.dev/` → 200 확인.

**주의사항**: `state.shotClock`은 항상 24 또는 14 둘 중 하나로만 세팅되므로(`liveEngine.ts:244,342,478,484`), 일반 포제션(24)은 기존과 동일하게 23초 상한이 유지되고 오펜시브 리바운드 직후 포제션(14)만 14초로 낮아짐 — 정상 케이스에 회귀 없음. 별개로, 자유투 미스+오펜시브 리바운드 케이스(`statsMappers.ts` 슈팅파울/팀파울 자유투 로그)는 반대 방향 결함(리바운드 여부와 무관하게 항상 `isPossessionEnd` 스탬프가 찍혀 포제션이 조기 분할될 수 있음)이 조사 중 추가로 발견됐으나, 이번 요청 범위(24초 초과 이슈) 밖이라 이번엔 손대지 않음 — 필요시 별도 논의.

**롤백 방법**: 두 파일 모두 Before 블록 내용으로 되돌리고 재배포하면 됨.

---

## 2026-08-03 — 포제션 막대 툴팁 3종 수정: 헤더 잘림, 플레이 나열 순서, 호버 중 사라짐(깜빡임)

**배경**: 스크린샷으로 세 가지 지적 — (1) "툴팁이 헤더에 잘리는 현상" (2) "블락 리바운드 어시스트 득점이 의미 없이 나열되어 있어서 포제션의 실제 결과나 선후를 알기 힘들어" (3, 채팅 중 추가) "툴팁이 너무 빨리 나타났다 사라지는 경향이 있어. 실제로 마우스가 호버 영역을 나가지 않았는데 툴팁이 사라지는 느낌".

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel` + 신규 모듈 최상위 상수/컴포넌트)

**원인 및 수정**:

1. **헤더 잘림**: 원정(away) 행이 페이지 상단 고정 헤더 바로 아래 있는데, 툴팁이 항상 `bottom-full`(막대 위쪽)로만 뜨다 보니 위로 띄울 공간이 없어 헤더 밑에 잘려 보였음. → `TeamPossessionRow`에 `tooltipDirection: 'up' | 'down'` prop 추가, 원정 행은 `"down"`(차트 쪽으로 아래 방향), 홈 행은 기존처럼 `"up"`으로 분기.
   ```tsx
   className={`absolute -translate-x-1/2 ... ${tooltipDirection === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}
   ```

2. **플레이 나열 순서**: `BoxTick.d`가 `Object.entries()` 순서(=실제 사건 순서와 무관)로 나열돼 블락→리바운드→어시스트→득점이 우연히 맞을 때도, 어긋날 때도 있었음. → 항상 "수비(블락/스틸) → 리바운드 → 어시스트 → 결과(득점/턴오버)" 고정 순서로 재정렬.
   ```ts
   const PLAY_KIND_ORDER: Record<PlayDetail['kind'], number> = { blk: 0, stl: 1, reb: 2, ast: 3, tov: 4, pts: 5 };
   details.sort((a, b) => PLAY_KIND_ORDER[a.kind] - PLAY_KIND_ORDER[b.kind]);
   ```

3. **호버 중 툴팁 소실(깜빡임)**: `TeamPossessionRow`가 `GameInsightsPanel` 렌더 함수 "안"에 `const TeamPossessionRow: React.FC<...> = (...) => {...}`로 정의돼 있었음 — 부모가 재렌더될 때마다 매번 새 컴포넌트 타입이 되어 React가 이전 DOM/state를 버리고 새로 mount, 호버 중이던 내부 `useState(hoverIdx)`가 초기화되며 마우스가 그대로 있어도 툴팁이 사라지는 현상 발생. → `TeamPossessionRow`와 `SEGMENT_COLOR`/`OUTCOME_LABEL`/`PLAY_DETAIL_META` 상수를 전부 모듈 최상위로 끌어올려 컴포넌트 아이덴티티를 고정(부모 재렌더와 무관하게 유지).

**검증**: `npx vite build` clean.

**주의사항**: 모듈 최상위로 옮긴 `TeamPossessionRow`는 이제 `maxQuarter`/`tooltipDirection`을 명시적 prop으로 받음(이전엔 클로저로 캡처). 두 호출부 모두 `maxQuarter={maxQuarter}` 추가, 원정은 `tooltipDirection="down"`, 홈은 `tooltipDirection="up"`.

**롤백 방법**: 세 수정 모두 각각 Before 코드로 되돌리면 됨(모듈 최상위 이전은 `GameInsightsPanel` 함수 본문 안으로 다시 옮기는 것).

---

## 2026-08-02 — 포제션 막대 호버 히트박스 확대 (짧은 포제션의 시각적 폭에 최소값 보장)

**배경**: "툴팁을 띄우기가 되게 힘들어. 히트박스가 작은 느낌이야" 피드백 — 실제 포제션 길이 비례로 폭을 주다 보니 짧은 득점/턴오버(몇 초짜리 속공 등)는 몇 픽셀짜리 슬리버가 돼서 마우스로 정확히 맞히기 어려웠음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```ts
const t = toGameSeconds(log);
let duration = t - lastEnd;
if (kind === 'timeout' && ownTeam) {
    duration = Math.max(duration, totalSec * 0.004);
}
...
if (duration > 0) {
    segments.push({ widthPct: (duration / totalSec) * 100, kind: ..., durationSec: duration, endSec: t, plays: ... });
}
```
(타임아웃만 최소 폭 보장, 득점/턴오버는 실제 길이 그대로라 짧으면 호버가 거의 불가능)

**After**:
```ts
const t = toGameSeconds(log);
const duration = t - lastEnd;
// 시각적 폭(hover 대상)에만 최소값을 보장하고, 툴팁에 보여줄 실제 길이(durationSec)는 그대로 둔다.
let visualDuration = duration;
if (ownTeam && (kind === 'timeout' || kind === 'scoring' || kind === 'turnover')) {
    visualDuration = Math.max(duration, totalSec * 0.006);
}
...
if (duration > 0) {
    segments.push({ widthPct: (visualDuration / totalSec) * 100, kind: ..., durationSec: duration, endSec: t, plays: ... });
}
```

**검증**: `npx vite build` clean.

**주의사항**: 폭 계산에만 최소값(전체의 0.6%, 약 17초 상당)을 적용하고 툴팁에 표시되는 실제 지속시간(`durationSec`)은 왜곡하지 않음 — 짧은 포제션이 시각적으로 조금 넓게 보일 수 있으나 툴팁 안의 "X초" 수치는 항상 정확함. 각 팀 행의 전체 세그먼트 폭 합이 100%를 살짝 넘을 수 있는데, flex 기본 `flex-shrink:1`(모든 세그먼트 div에 `shrink-0` 없음)이 자동으로 비율대로 압축해 컨테이너 밖으로 넘치지 않음(타임아웃에서 이미 쓰던 것과 동일한 안전장치).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 무득점 포제션은 호버 툴팁 대상에서 제외 (득점/턴오버/타임아웃만 호버 가능)

**배경**: "막대의 빈공간에도 툴팁이 있는데 이건 정상인가?" 질문에 원인(무득점 포제션이 투명 처리라 안 보이지만 실제 데이터라 호버는 되는 상태) 설명 후, 배경색을 살짝 넣는 대안을 제시했으나 사용자가 "득점 포제션과 턴오버, 타임아웃을 제외하면 툴팁이 표시되지 않아도 될것 같아"로 결정 — 무득점 포제션은 아예 호버 비활성화하는 쪽으로.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```tsx
{positioned.map((s, i) => s.kind === 'filler' ? (
    <div key={i} className="h-full" style={{ width: `${s.widthPct}%` }} />
) : (
    <div key={i} className={`h-full cursor-default ${segmentColor[s.kind]}`} style={{ width: `${s.widthPct}%` }}
         onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(prev => prev === i ? null : prev)} />
))}
```

**After**:
```tsx
{positioned.map((s, i) => (s.kind === 'filler' || s.kind === 'nonScoring') ? (
    <div key={i} className="h-full" style={{ width: `${s.widthPct}%` }} />
) : (
    <div key={i} className={`h-full cursor-default ${segmentColor[s.kind]}`} style={{ width: `${s.widthPct}%` }}
         onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(prev => prev === i ? null : prev)} />
))}
```

**검증**: `npx vite build` clean.

**주의사항**: `nonScoring`은 여전히 세그먼트로 존재하고 시간축 폭도 그대로 차지하지만(막대 전체 폭 = 게임 전체 시간 유지), 호버 핸들러가 안 붙어서 마우스를 올려도 반응이 없음 — `filler`(상대팀 차례)와 동일한 취급이 됨. 득점/턴오버/타임아웃만 호버 가능.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 포제션 막대 툴팁: PBP 문장 → boxTimeline 기반 구조화된 플레이 상세로 교체

**배경**: "PBP 메세지말고 득점, 어시스트, 리바운드, 스틸, 블락, 턴오버 등의 플레이 디테일을 정보 형식으로 표현해봐" 요청 — 직전엔 `PbpLog.text`(자연어 문장)를 그대로 모아 보여줬는데, 문장 대신 아이콘+라벨+선수명 형태의 구조화된 뱃지로 바꿔달라는 것. `PbpLog`엔 선수명 등 구조화된 필드가 없어서, 포제션별 실제 카운팅 스탯 변화분을 담고 있는 `BoxTick.d`(멀티플레이어 중계용으로 이미 존재하는 필드)를 새로 끌어와 사용.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```ts
type SegmentPiece = { widthPct; kind; durationSec; endSec; plays: string[] };
...
// PbpLog.text를 그대로 버퍼에 모아서 플레이 텍스트로 사용
let buffer: string[] = [];
for (const log of allLogs) {
    if (log.text && log.type !== 'info' && log.type !== 'injury') buffer.push(log.text);
    ...
    segments.push({ ..., plays: ownTeam ? buffer.slice() : [] });
    buffer = [];
}
```
```tsx
{hovered.plays.map((p, i) => <p key={i} className="text-[10px] text-slate-300 leading-snug">{p}</p>)}
```

**After**:
```ts
type PlayDetail = { kind: 'pts'|'ast'|'reb'|'stl'|'blk'|'tov'; playerName: string; value?: number };
type SegmentPiece = { widthPct; kind; durationSec; endSec; plays: PlayDetail[] };

// GameInsightsPanel 신규 props: boxTimeline?: BoxTick[]; homeBox/awayBox: PlayerBoxScore[]
const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of homeBox) map.set(p.playerId, p.playerName);
    for (const p of awayBox) map.set(p.playerId, p.playerName);
    return map;
}, [homeBox, awayBox]);

// buildTeamSegments 내부 — boxTimeline을 포인터로 같이 순회하며 (lastEnd, t] 구간의
// BoxTick.d(playerId→BoxDelta)에서 pts/ast/reb+offReb/stl/blk/tov를 구조화된 상세로 추출
let tickCursor = 0;
const ticks = boxTimeline ?? [];
...
const details: PlayDetail[] = [];
while (tickCursor < ticks.length && ticks[tickCursor].t <= t) {
    const tick = ticks[tickCursor];
    if (tick.t > lastEnd) {
        for (const [playerId, delta] of Object.entries(tick.d)) {
            const name = playerNames.get(playerId) ?? '?';
            if (delta.pts) details.push({ kind: 'pts', playerName: name, value: delta.pts });
            if (delta.ast) details.push({ kind: 'ast', playerName: name });
            if ((delta.reb ?? 0) + (delta.offReb ?? 0) > 0) details.push({ kind: 'reb', playerName: name });
            if (delta.stl) details.push({ kind: 'stl', playerName: name });
            if (delta.blk) details.push({ kind: 'blk', playerName: name });
            if (delta.tov) details.push({ kind: 'tov', playerName: name });
        }
    }
    tickCursor++;
}
segments.push({ ..., plays: ownTeam ? details : [] });
```
```tsx
const PLAY_DETAIL_META: Record<PlayDetail['kind'], { icon: string; label: string; color: string }> = {
    pts: { icon: '🏀', label: '득점', color: 'text-emerald-400' },
    ast: { icon: '🎯', label: '어시스트', color: 'text-sky-400' },
    reb: { icon: '⬆️', label: '리바운드', color: 'text-slate-300' },
    stl: { icon: '🖐️', label: '스틸', color: 'text-amber-400' },
    blk: { icon: '🚫', label: '블락', color: 'text-purple-400' },
    tov: { icon: '❌', label: '턴오버', color: 'text-red-400' },
};
// 툴팁: {icon} {label} {선수명} +{value}? 형태의 뱃지 한 줄씩
```

**호출부 변경**: `<GameInsightsPanel .../>`에 `boxTimeline={gameData.box_timeline}`, `homeBox={gameData.home_box ?? []}`, `awayBox={gameData.away_box ?? []}` 추가.

**검증**: `npx vite build` clean.

**주의사항**: `BoxTick.t`는 `PbpLog`와 동일한 gameSec 공식((q-1)*720+(720-clock))이라 별도 변환 없이 그대로 구간 매칭 가능. `boxTimeline`이 없는 구버전 저장 데이터는 `ticks`가 빈 배열이라 `plays`도 자연스럽게 비어 보임(소급 적용 없음, 기존 패턴과 동일). 리바운드는 `BoxDelta.reb`/`offReb`를 구분하지 않고 합쳐서 "리바운드" 하나로만 표시(공격/수비 리바운드 세분화는 안 함).

**롤백 방법**: Before 블록 내용으로 되돌리고 호출부의 3개 신규 prop을 제거하면 됨.

---

## 2026-08-02 — 포제션 막대 툴팁에 실제 플레이 텍스트 추가

**배경**: "해당 포제션에 이루어진 플레이도 자세히 표시해줘" 요청 — 기존 툴팁은 "득점 포제션 · 14초"처럼 결과/길이만 보여주고 실제로 어떤 플레이(누가 슛을 쐈는지, 리바운드, 턴오버 종류 등)가 있었는지는 안 보였음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```ts
type SegmentPiece = { widthPct: number; kind: ...; durationSec: number; endSec: number };
...
for (const log of allLogs) {
    let kind = ...; let ownTeam = ...;
    if (!kind) continue;
    ...
    segments.push({ widthPct: ..., kind: ..., durationSec: duration, endSec: t });
    lastEnd = t;
}
```
(툴팁엔 Q/시계 + 결과·길이 두 줄만 표시)

**After**:
```ts
type SegmentPiece = { widthPct: number; kind: ...; durationSec: number; endSec: number; plays: string[] };
...
let buffer: string[] = [];
for (const log of allLogs) {
    // info/injury 제외, 실제 플레이 텍스트만 버퍼에 누적
    if (log.text && log.type !== 'info' && log.type !== 'injury') buffer.push(log.text);

    let kind = ...; let ownTeam = ...;
    if (!kind) continue;
    ...
    segments.push({ widthPct: ..., kind: ..., durationSec: duration, endSec: t, plays: ownTeam ? buffer.slice() : [] });
    lastEnd = t;
    buffer = [];  // 다음 포제션을 위해 초기화
}
```
```tsx
{/* 툴팁에 플레이 목록 추가 */}
{hovered.plays.length > 0 && (
    <div className="mt-1 pt-1 border-t border-slate-700 flex flex-col gap-0.5">
        {hovered.plays.map((p, i) => <p key={i} className="text-[10px] text-slate-300 leading-snug">{p}</p>)}
    </div>
)}
```

**검증**: `npx vite build` clean.

**주의사항**: 한 포제션에 여러 플레이가 있는 경우(예: 미스 → 오펜스 리바운드 → 풋백 성공)를 전부 보여주기 위해, 직전 포제션 경계부터 현재 경계까지 사이의 모든 로그 텍스트를 버퍼에 모았다가 그 세그먼트에 통째로 붙임(`isPossessionEnd`가 아닌 중간 로그도 포함). `info`/`injury` 타입 로그는 실제 플레이가 아닌 안내성 텍스트라 제외. 툴팁 컨테이너에 `max-w-[240px]`를 줘서 긴 플레이 텍스트는 줄바꿈되도록 함(기존 `whitespace-nowrap`은 Q/시계, 결과 줄에만 유지).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 포제션 막대 각 틱에 호버 툴팁 추가

**배경**: "막대의 각 틱에 호버 시 툴팁을 추가해줘" 요청 — 세그먼트가 그냥 색만 있는 블록이라 어떤 포제션인지, 언제 끝났는지, 얼마나 지속됐는지 알 수 없었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```ts
type SegmentPiece = { widthPct: number; kind: 'scoring' | 'nonScoring' | 'turnover' | 'timeout' | 'filler' };
...
segments.push({ widthPct: (duration / totalSec) * 100, kind: ownTeam ? kind : 'filler' });
...
const TeamPossessionRow: React.FC<{ label: string; segments: SegmentPiece[] }> = ({ label, segments }) => (
    <div className="flex items-center gap-2 w-full">
        <span className="w-8 shrink-0 ...">{label}</span>
        <div className="flex-1 h-3 flex overflow-hidden">
            {segments.map((s, i) => <div key={i} className={`h-full ${segmentColor[s.kind]}`} style={{ width: `${s.widthPct}%` }} />)}
        </div>
    </div>
);
```

**After**:
```ts
type SegmentPiece = { widthPct: number; kind: ...; durationSec: number; endSec: number };
...
segments.push({ widthPct: (duration / totalSec) * 100, kind: ownTeam ? kind : 'filler', durationSec: duration, endSec: t });
...
const OUTCOME_LABEL: Record<'scoring'|'nonScoring'|'turnover'|'timeout', string> = {
    scoring: '득점 포제션', nonScoring: '무득점 포제션', turnover: '턴오버', timeout: '타임아웃',
};

const TeamPossessionRow: React.FC<{ label: string; segments: SegmentPiece[] }> = ({ label, segments }) => {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    let cum = 0;
    const positioned = segments.map(s => { const startPct = cum; cum += s.widthPct; return { ...s, startPct }; });
    const hovered = hoverIdx != null ? positioned[hoverIdx] : null;
    return (
        <div className="flex items-center gap-2 w-full">
            <span className="w-8 shrink-0 ...">{label}</span>
            <div className="relative flex-1 h-3 flex">
                {positioned.map((s, i) => s.kind === 'filler' ? (
                    <div key={i} className="h-full" style={{ width: `${s.widthPct}%` }} />
                ) : (
                    <div key={i} className={`h-full cursor-default ${segmentColor[s.kind]}`} style={{ width: `${s.widthPct}%` }}
                         onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(prev => prev === i ? null : prev)} />
                ))}
                {hovered && (() => {
                    const { quarter, clock } = secondsToClock(hovered.endSec, maxQuarter);
                    return (
                        <div className="absolute bottom-full mb-1.5 -translate-x-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 pointer-events-none shadow-lg whitespace-nowrap z-20"
                             style={{ left: `${Math.min(96, Math.max(4, hovered.startPct + hovered.widthPct / 2))}%` }}>
                            <p className="text-[10px] font-bold text-slate-400">Q{quarter} {clock}</p>
                            <p className="text-[11px] font-black text-white whitespace-nowrap">{OUTCOME_LABEL[hovered.kind]} · {hovered.durationSec.toFixed(0)}초</p>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};
```

**검증**: `npx vite build` clean.

**주의사항**: 상대팀 차례(`filler`) 세그먼트는 투명하고 의미 있는 데이터가 없어 호버 핸들러를 아예 안 붙임(호버 불가). 툴팁은 세그먼트의 시작 위치+폭/2로 계산한 중앙 x에 뜨며 4~96% 범위로 클램프해 컨테이너 밖으로 안 나가게 함. 세그먼트 폭이 아주 좁은(턴오버 등 짧은 포제션) 경우에도 hover 영역 자체는 실제 렌더된 DOM 요소 폭만큼이라 매우 좁을 수 있음(추가 히트박스 확장은 하지 않음).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 포제션 막대 팀명 라벨: 오버레이 → 막대 바깥 고정폭 칸으로 분리 (겹침 수정)

**배경**: 스크린샷으로 "막대의 좌측끝과 팀이름 영역이 겹쳐보인다"는 지적 — 팀명을 막대 위에 `absolute` 오버레이로 얹었더니 게임 초반 세그먼트(막대 0% 지점 근처, 텍스트가 있는 자리)의 실제 색상 블록과 텍스트가 뒤섞여 지저분해 보였음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```tsx
const TeamPossessionRow: React.FC<{ label: string; segments: SegmentPiece[] }> = ({ label, segments }) => (
    <div className="relative h-3 w-full flex">
        {segments.map((s, i) => <div className={`h-full ${segmentColor[s.kind]}`} style={{ width: `${s.widthPct}%` }} />)}
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-white leading-none z-10 pointer-events-none"
              style={{ textShadow: '0 0 3px #000, 0 0 3px #000, 0 0 3px #000' }}>
            {label}
        </span>
    </div>
);
```

**After**:
```tsx
const TeamPossessionRow: React.FC<{ label: string; segments: SegmentPiece[] }> = ({ label, segments }) => (
    <div className="flex items-center gap-2 w-full">
        <span className="w-8 shrink-0 text-[9px] font-black text-slate-300 uppercase tracking-wider truncate">{label}</span>
        <div className="flex-1 h-3 flex overflow-hidden">
            {segments.map((s, i) => <div key={i} className={`h-full ${segmentColor[s.kind]}`} style={{ width: `${s.widthPct}%` }} />)}
        </div>
    </div>
);
```

**검증**: `npx vite build` clean.

**주의사항**: 팀명을 막대 안 오버레이가 아니라 막대 바깥의 고정폭(`w-8`) 칸으로 완전히 분리해 데이터와 절대 겹치지 않게 함. 이 라벨 칸만큼 막대의 실제 시작점이 위 마진/승리확률 차트보다 아주 살짝(수 px) 안쪽에서 시작하게 되는데, 완전한 픽셀 정렬보다 가독성(겹침 방지)을 우선한 트레이드오프.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 포제션 연속 막대: 홈/원정 2줄 분리 + 좌측 팀명 표시 + 타임아웃을 막대 흐름 안으로

**배경**: "연속 막대를 홈/원정 두개로 만들고 막대의 왼쪽 끝에 팀명을 표시해서 구분이 가능케 해줘. 그리고 타임아웃도 슬라이더 핸들처럼 보이지 않고 막대의 일부분처럼 보이게 해" 요청 — 직전에 양팀을 하나로 합친 단일 막대로 만들었던 것을 다시 팀별 2줄로 분리하되, 이번엔 각 줄이 시간축 정렬을 유지한 채(상대팀 차례는 투명 필러) 연속적으로 보이도록 하고, 좌측에 팀명을 오버레이하고, 타임아웃은 막대 위에 떠 있는 원형 틱이 아니라 막대 흐름 안의 사각 조각으로 표현.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```tsx
const { possessionSegments, timeoutMarkers } = useMemo(() => {
    const segments: { widthPct: number; kind: 'scoring' | 'nonScoring' | 'turnover' }[] = [];
    const timeouts: { frac: number }[] = [];
    // 양팀 포제션을 시간순으로 합쳐 하나의 막대로 만듦, 타임아웃은 별도 배열
    ...
}, [allLogs, totalMinutes]);

const PossessionTicker: React.FC<{ segments; timeouts }> = ({ segments, timeouts }) => (
    <div className="relative h-2 w-full flex">
        {segments.map((s, i) => <div className={`h-full ${markerColor[s.kind]}`} style={{ width: `${s.widthPct}%` }} />)}
        {timeouts.map((t, i) => (
            <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1 h-3 rounded-full bg-white" style={{ left: `${t.frac * 100}%` }} />
        ))}
    </div>
);
// 차트 위에 단일 통합 막대 하나만 렌더
{hasPossessionMarkers && <PossessionTicker segments={possessionSegments} timeouts={timeoutMarkers} />}
```

**After**:
```tsx
type SegmentPiece = { widthPct: number; kind: 'scoring' | 'nonScoring' | 'turnover' | 'timeout' | 'filler' };

// homeTeamId만 prop으로 있고 awayTeamId는 없어서, isHome 참/역으로 "이 로그가 이 행 소유인가" 판단.
const buildTeamSegments = (isHome: boolean): SegmentPiece[] => {
    const totalSec = totalMinutes * 60;
    const segments: SegmentPiece[] = [];
    let lastEnd = 0;
    for (const log of allLogs) {
        let kind = ...; let ownTeam = ...; // timeout/isPossessionEnd 판정 + isHome 비교
        if (!kind) continue;
        const t = toGameSeconds(log);
        let duration = t - lastEnd;
        if (kind === 'timeout' && ownTeam) duration = Math.max(duration, totalSec * 0.004); // 최소 폭 보장
        if (duration > 0) segments.push({ widthPct: (duration / totalSec) * 100, kind: ownTeam ? kind : 'filler' });
        lastEnd = t;
    }
    return segments;
};
const homeSegments = useMemo(() => buildTeamSegments(true), [allLogs, homeTeamId, totalMinutes]);
const awaySegments = useMemo(() => buildTeamSegments(false), [allLogs, homeTeamId, totalMinutes]);

const segmentColor: Record<SegmentPiece['kind'], string> = {
    scoring: 'bg-emerald-400', nonScoring: '', turnover: 'bg-red-400', timeout: 'bg-white', filler: '',
};
const TeamPossessionRow: React.FC<{ label: string; segments: SegmentPiece[] }> = ({ label, segments }) => (
    <div className="relative h-3 w-full flex">
        {segments.map((s, i) => <div className={`h-full ${segmentColor[s.kind]}`} style={{ width: `${s.widthPct}%` }} />)}
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-white leading-none z-10 pointer-events-none"
              style={{ textShadow: '0 0 3px #000, 0 0 3px #000, 0 0 3px #000' }}>
            {label}
        </span>
    </div>
);
// 차트 위(원정)/아래(홈) 2줄로 다시 분리
{hasPossessionMarkers && <TeamPossessionRow label={awayAbbr} segments={awaySegments} />}
...
{hasPossessionMarkers && <TeamPossessionRow label={homeAbbr} segments={homeSegments} />}
```

**검증**: `npx vite build` clean.

**주의사항**: 각 팀 행은 "상대팀 차례" 구간을 투명 필러 세그먼트로 채워 전체 폭이 항상 게임 전체 시간과 일치하도록 유지 — 위 마진/승률 차트와 시간축이 계속 정렬됨. 타임아웃은 실제 지속시간이 0에 가까워 최소 폭(전체의 0.4%)을 강제로 보장해서 막대 흐름 안의 흰색 사각 조각으로 보이게 함(기존의 원형 틱 오버레이 제거). 팀명 라벨은 `absolute` 오버레이라 세그먼트 폭 계산에는 영향 없음. 범례의 "타임아웃" 아이콘도 원형(`rounded-full`)에서 사각형(`rounded-sm`)으로 통일.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 포제션 연속 막대: 무득점(회색) 배경 제거

**배경**: "연속 막대의 배경색이 회색이라 디자인이 이상해. 막대의 배경색은 삭제해줘" 요청 — 무득점 포제션이 전체 포제션의 대다수를 차지해, 폭 비례 연속 막대에서 회색(`bg-slate-500`)이 사실상 막대 전체를 뒤덮는 배경처럼 보이는 문제.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```tsx
const markerColor: Record<'scoring' | 'nonScoring' | 'turnover', string> = {
    scoring: 'bg-emerald-400',
    nonScoring: 'bg-slate-500',
    turnover: 'bg-red-400',
};
...
<span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm bg-emerald-400" />득점 포제션</span>
<span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm bg-slate-500" />무득점 포제션</span>
<span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm bg-red-400" />턴오버</span>
```

**After**:
```tsx
const markerColor: Record<'scoring' | 'nonScoring' | 'turnover', string> = {
    scoring: 'bg-emerald-400',
    nonScoring: '',
    turnover: 'bg-red-400',
};
...
<span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm bg-emerald-400" />득점 포제션</span>
<span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm bg-red-400" />턴오버</span>
```

**검증**: `npx vite build` clean.

**주의사항**: 무득점 포제션 세그먼트는 여전히 폭만큼 자리는 차지하지만(연속 막대의 시간축 정렬 유지) 색이 채워지지 않아 투명하게 보임 — 득점(초록)/턴오버(빨강)/타임아웃(흰 틱)만 도드라지게 표시됨. 범례에서도 이제 시각적으로 표현되지 않는 "무득점 포제션" 항목을 제거.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 인사이트 탭 포제션 이벤트 티커: 점(dot) → 연속 막대(continuous bar)로 교체

**배경**: 스크린샷 첨부 후 "인사이트 상단의 이벤트 티커들이 점으로 되지 않고 첨부한 이미지처럼 연속적인 상태를 보여줄 수 있는 막대 그래프로 변경해줘" 요청. 기존엔 원정/홈 각각 별도 행에서 이벤트를 한 시점(frac)의 점(dot)으로만 찍어 포제션 사이 여백이 그대로 드러나 듬성듬성해 보였음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```tsx
const possessionMarkers = useMemo(() => {
    const away: { frac: number; kind: 'scoring' | 'nonScoring' | 'turnover' | 'timeout' }[] = [];
    const home: { frac: number; kind: 'scoring' | 'nonScoring' | 'turnover' | 'timeout' }[] = [];
    for (const log of allLogs) {
        let kind = ...; let teamId = ...;
        // timeout / isPossessionEnd 판정 후
        const frac = (toGameSeconds(log) / 60) / totalMinutes;
        (teamId === homeTeamId ? home : away).push({ frac, kind });
    }
    return { away, home };
}, [allLogs, homeTeamId, totalMinutes]);

const MarkerRow: React.FC<{ markers: {...}[] }> = ({ markers }) => (
    <div className="relative h-2 w-full">
        {markers.map((m, i) => m.kind === 'timeout' ? (
            <span className="absolute ... w-1.5 h-1.5 rounded-full bg-white" style={{ left: `${m.frac * 100}%` }} />
        ) : (
            <span className="absolute ... w-1 h-1.5 rounded-sm ..." style={{ left: `${m.frac * 100}%` }} />
        ))}
    </div>
);
// 원정 행(차트 위) + 홈 행(차트 아래) 2줄 각각 렌더
{hasPossessionMarkers && <MarkerRow markers={possessionMarkers.away} />}
...
{hasPossessionMarkers && <MarkerRow markers={possessionMarkers.home} />}
```

**After**:
```tsx
// 포제션 종료 이벤트 타임스탬프 간격을 실제 길이(초)로 재서 세그먼트 폭으로 사용 —
// 양팀 전체를 시간순으로 이어붙이면 빈틈 없는 연속 막대가 된다. 타임아웃은 지속시간이
// 없는 순간 이벤트라 막대 흐름에 끼우지 않고 위에 겹치는 세로 틱으로 별도 표시.
const { possessionSegments, timeoutMarkers } = useMemo(() => {
    const segments: { widthPct: number; kind: 'scoring' | 'nonScoring' | 'turnover' }[] = [];
    const timeouts: { frac: number }[] = [];
    const totalSec = totalMinutes * 60;
    let lastEnd = 0;
    for (const log of allLogs) {
        if (log.type === 'timeout') {
            if (totalSec > 0) timeouts.push({ frac: toGameSeconds(log) / totalSec });
            continue;
        }
        if (!log.isPossessionEnd || !log.possessionOutcome) continue;
        const t = toGameSeconds(log);
        const duration = t - lastEnd;
        if (duration > 0 && totalSec > 0) {
            segments.push({ widthPct: (duration / totalSec) * 100, kind: log.possessionOutcome });
        }
        lastEnd = t;
    }
    return { possessionSegments: segments, timeoutMarkers: timeouts };
}, [allLogs, totalMinutes]);

const PossessionTicker: React.FC<{ segments: {...}[]; timeouts: {...}[] }> = ({ segments, timeouts }) => (
    <div className="relative h-2 w-full flex">
        {segments.map((s, i) => <div key={i} className={`h-full ${markerColor[s.kind]}`} style={{ width: `${s.widthPct}%` }} />)}
        {timeouts.map((t, i) => <span key={i} className="absolute ... w-1 h-3 rounded-full bg-white" style={{ left: `${t.frac * 100}%` }} />)}
    </div>
);
// 차트 위에 단일 통합 막대 하나만 렌더 (기존 원정/홈 2줄 → 1줄로 통합)
{hasPossessionMarkers && <PossessionTicker segments={possessionSegments} timeouts={timeoutMarkers} />}
```

**검증**: `npx vite build` clean.

**주의사항**: 원정/홈 두 줄로 나뉘어 있던 티커를 양팀 포제션을 시간순으로 합친 단일 연속 막대 하나로 통합함(팀별 행 구분보다 "빈틈없는 연속 상태"를 우선한 요청 취지에 맞춤). 차트 아래쪽에 있던 홈팀용 두 번째 행은 삭제. 각 세그먼트 폭은 실측 포제션 길이 비율이라 짧은 포제션(턴오버 등)은 얇게, 긴 포제션은 넓게 표시됨. `isPossessionEnd`가 없는 구버전 저장 데이터는 `possessionSegments`가 빈 배열이라 이 행 자체가 안 보임(기존과 동일한 하위호환 처리).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — AVG POSS. 재수정: 근사식(양팀 동일값) → 실측 포제션 길이(팀별로 다르게)

**배경**: 직전 수정에서 AVG POSS.를 "양팀 합산 포제션 수" 근사식으로 바꿨더니 홈/원정이 항상 완전히 같은 값이 되어버렸는데, "양 팀의 AVG POSS가 같은 값인데? 다른 경기들도 모두 동일해"라는 지적 — 실제 농구에서는 턴오버가 잦은 팀은 포제션이 짧고 오펜스 리바운드로 끄는 팀은 길어지는 등 팀마다 달라야 정상이라, 근사식 자체가 이 차이를 만들어낼 수 없는 게 문제였음. `allLogs`에 이미 `isPossessionEnd`/`possessionOutcome`/`possessionTeamId`(2026-08-02 포제션 마커용으로 추가된 필드)가 있어 실제 포제션 길이를 이벤트 타임스탬프 간격으로 직접 잴 수 있다는 걸 확인하고 근사식을 실측값으로 교체.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```tsx
const avgPossSec = (homePoss + awayPoss) > 0 ? (totalMinutes * 60) / (homePoss + awayPoss) : 0;
return {
    home: { ortg: homeORTG, drtg: awayORTG, nrtg: homeORTG - awayORTG, avgPossSec },
    away: { ortg: awayORTG, drtg: homeORTG, nrtg: awayORTG - homeORTG, avgPossSec },
};
```

**After**:
```tsx
let lastEnd = 0;
const homeDurations: number[] = [];
const awayDurations: number[] = [];
for (const log of allLogs) {
    if (!log.isPossessionEnd || !log.possessionOutcome) continue;
    const t = toGameSeconds(log);
    const duration = t - lastEnd;
    if (duration > 0) {
        const possTeamId = log.possessionTeamId ?? log.teamId;
        (possTeamId === homeTeamId ? homeDurations : awayDurations).push(duration);
    }
    lastEnd = t;
}
const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
const hasRealDurations = homeDurations.length > 0 && awayDurations.length > 0;
const fallbackAvgPossSec = (homePoss + awayPoss) > 0 ? (totalMinutes * 60) / (homePoss + awayPoss) : 0;
const homeAvgPossSec = hasRealDurations ? avg(homeDurations) : fallbackAvgPossSec;
const awayAvgPossSec = hasRealDurations ? avg(awayDurations) : fallbackAvgPossSec;

return {
    home: { ortg: homeORTG, drtg: awayORTG, nrtg: homeORTG - awayORTG, avgPossSec: homeAvgPossSec },
    away: { ortg: awayORTG, drtg: homeORTG, nrtg: awayORTG - homeORTG, avgPossSec: awayAvgPossSec },
};
```

**검증**: `npx vite build` clean.

**주의사항**: `isPossessionEnd`/`possessionOutcome`/`possessionTeamId`가 있는(2026-08-02 이후 시뮬레이션된) 경기는 이제 실측값이라 홈/원정이 서로 다르게 나오는 게 정상. 이 필드가 없는 구버전 저장 데이터만 직전 항목의 근사식(양팀 합산 포제션 수 기준, 24초 샷클락 이하의 합리적 단일값)으로 자동 폴백하며, 이 경우엔 두 값이 똑같이 나오는 게 데이터 한계에 의한 것임(소급 적용 없음).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 인사이트 탭 정리: 범례 한글화 + PACE 삭제 + AVG POSS. 공식 버그 수정

**배경**: 스크린샷 첨부 후 세 가지 요청 — (1) "MARGIN → 마진, WIN PROBABILITY% → 승리확률로 변경하고, 마진의 범례 아이콘을 사각형에서 승리확률처럼 직선으로 바꿔줘" (2) "최상단의 PACE는 삭제" (3) "AVG POSS 값이 맞지않아. 샷클락은 24초인데 어떻게 AVG POSS가 24초보다 높게 나올 수 있지?" — 실제로 공식 버그였음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `GameInsightsPanel`)

**Before**:
```tsx
const { home, away, pace }: { home: InsightsStat; away: InsightsStat; pace: number } = useMemo(() => {
    const homePoss = estimatePossessions(homeStats, homeOreb);
    const awayPoss = estimatePossessions(awayStats, awayOreb);
    const avgPoss  = (homePoss + awayPoss) / 2;
    const homeORTG = avgPoss > 0 ? (homeStats.pts / avgPoss) * 100 : 0;
    const awayORTG = avgPoss > 0 ? (awayStats.pts / avgPoss) * 100 : 0;
    return {
        home: { ortg: homeORTG, drtg: awayORTG, nrtg: homeORTG - awayORTG, avgPossSec: (totalMinutes * 60) / homePoss },
        away: { ortg: awayORTG, drtg: homeORTG, nrtg: awayORTG - homeORTG, avgPossSec: (totalMinutes * 60) / awayPoss },
        pace: avgPoss * (48 / totalMinutes),
    };
}, [homeStats, awayStats, homeOreb, awayOreb, totalMinutes]);
...
<div className="text-center text-xs font-bold uppercase tracking-wider text-slate-500">
    Pace <span className="text-white">{pace.toFixed(1)}</span>
</div>
...
<span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/70" />Margin</span>
<span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-full bg-sky-400" />Win probability %</span>
```

**After**:
```tsx
const { home, away }: { home: InsightsStat; away: InsightsStat } = useMemo(() => {
    const homePoss = estimatePossessions(homeStats, homeOreb);
    const awayPoss = estimatePossessions(awayStats, awayOreb);
    const avgPoss  = (homePoss + awayPoss) / 2;
    const homeORTG = avgPoss > 0 ? (homeStats.pts / avgPoss) * 100 : 0;
    const awayORTG = avgPoss > 0 ? (awayStats.pts / avgPoss) * 100 : 0;
    // 포제션 1회 평균 길이(초) — 홈/원정 두 팀이 "같은 48분 게임 시계"를 번갈아 나눠 쓰므로
    // 분모는 양팀 포제션 합계여야 한다. 기존엔 팀별 전체 게임시간(2880s)을 그 팀 포제션
    // 수만으로 나눠(예: 2880/95≈30s) 실제보다 거의 2배 부풀려져 24초 샷클락보다 커 보였다.
    const avgPossSec = (homePoss + awayPoss) > 0 ? (totalMinutes * 60) / (homePoss + awayPoss) : 0;
    return {
        home: { ortg: homeORTG, drtg: awayORTG, nrtg: homeORTG - awayORTG, avgPossSec },
        away: { ortg: awayORTG, drtg: homeORTG, nrtg: awayORTG - homeORTG, avgPossSec },
    };
}, [homeStats, awayStats, homeOreb, awayOreb, totalMinutes]);
...
{/* 최상단 Pace 표시 div 전체 삭제 */}
...
<span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-full bg-emerald-400" />마진</span>
<span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-full bg-sky-400" />승리확률</span>
```

**검증**: `npx vite build` clean.

**주의사항**: `pace` 필드/변수 자체를 완전히 제거(화면에 더 이상 안 쓰이는 죽은 계산이라 방치하지 않고 삭제) — 헤더 좌우의 "PACE 99.8"은 없어졌지만, 좌우 양 끝의 개별 `StatCell`들(ORTG/DRTG/NRTG/Avg Poss.)은 그대로 유지. AVG POSS. 수정 후 홈/원정 두 값이 이제 항상 동일(같은 게임 시계를 공유하는 값이라 원래 팀별로 다를 이유가 없었음) — 기존엔 팀별 포제션 수 차이 때문에 미세하게 달라 보였던 것도 버그의 일부였음. 이 패널은 멀티플레이어 전용(`GameInsightsPanel`)이라 싱글플레이어 쪽엔 대응하는 코드가 없어 미러 동기화 불필요.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — Advanced/Defense 테이블에 TEAM TOTALS 행 추가

**배경**: "Advanced와 Defense도 TEAM TOTALS 행도 비워져있더라도 행은 표시해줘" 요청 — Traditional(`BoxScoreTable`)엔 있던 `<tfoot>` TEAM TOTALS 행이 Advanced/Defense엔 아예 없어서, 셀렉터를 바꾸면 테이블 하단부 구조 자체가 사라지는 문제.

**변경 파일**:
- `components/game/DefenseBoxScoreTable.tsx` — `<tfoot>` 추가, STL/BLK/DREB/PF/DFGA/DFGM/DFG% 전부 실제 팀 합계로 채움(단순 합산이라 계산이 쉬움)
- `components/game/AdvancedBoxScoreTable.tsx` — `<tfoot>` 추가, MIN만 실제 팀 합계(`teamTotals.mp`)로 채우고 TS%~PIE는 "-"로 비움(개인의 팀 대비 점유율 지표라 팀 합계 자체가 성립하지 않는 값들이라 Traditional/Defense와 동일한 행 구조만 맞춤)

**Before**: 두 파일 모두 `</TableBody>` 다음 바로 `</Table>` — `<tfoot>` 없음.

**After**:
```tsx
// DefenseBoxScoreTable.tsx
<tfoot>
    <tr>
        <td className="py-3 px-4 bg-slate-800/50 border-t border-slate-700">
            <span className="text-xs font-black text-white uppercase tracking-wider">TEAM TOTALS</span>
        </td>
        <td className={totalCellClass} colSpan={2}></td>
        <td className={totalCellClass}>{Math.round(totals.mp)}</td>
        <td className={totalCellClass}>{totals.stl}</td>
        <td className={totalCellClass}>{totals.blk}</td>
        <td className={totalCellClass}>{totals.dreb}</td>
        <td className={totalCellClass}>{totals.pf}</td>
        <td className={totalCellClass}>{totals.dfga}</td>
        <td className={totalCellClass}>{totals.dfgm}</td>
        <td className={`${totalCellClass} pr-4`}>{fmtPct(totals.dfgm, totals.dfga)}</td>
    </tr>
</tfoot>

// AdvancedBoxScoreTable.tsx — MIN만 실값, 나머지 9칸은 "-"
<tfoot>
    <tr>
        <td className="py-3 px-4 bg-slate-800/50 border-t border-slate-700">TEAM TOTALS</td>
        <td className={totalCellClass} colSpan={2}></td>
        <td className={totalCellClass}>{Math.round(teamTotals.mp)}</td>
        <td className={totalCellClass}>-</td>{/* TS% */}
        ...(EFG%/USG%/AST%/TOV%/OREB%/DREB%/TRB%/PIE 전부 "-")
    </tr>
</tfoot>
```

**검증**: `npx vite build` clean.

**주의사항**: `colSpan={2}`는 PLAYER 칸(라벨 셀 자신이 이미 그 칸을 차지) 다음 POS+OVR 두 칸을 합치기 위함 — Traditional의 `colSpan={standalone?2:3}`과 달리 Advanced/Defense엔 FAT 컬럼이 없어 항상 2로 고정.

**롤백 방법**: 각 파일에서 `<tfoot>...</tfoot>` 블록만 삭제하면 됨.

---

## 2026-08-02 — PLAYER/POS/OVR 열을 3개 박스스코어 테이블 공통 컴포넌트로 통합 (디자인/행높이 고정)

**배경**: "Advanced와 Defense로 바꾸면 테이블의 디자인이 달라지는데, 디자인과 행의 높이는 달라지면 안되고 PLAYER, POS, OVR 열은 변함없고 그 우측으로만 컬럼이 변동되면 돼" 요청 — Advanced/Defense 테이블은 PLAYER 컬럼만 있고 POS/OVR이 없어 Traditional과 폭/행높이가 달랐던 문제(OVR 배지 높이가 실질적인 행 높이 결정 요소인데 Advanced/Defense엔 그게 없어서 행이 더 얇았음).

**신규 파일**:
- `components/game/PlayerIdentityCells.tsx` — `PlayerIdentityHeaderCells`(PLAYER/POS/OVR 헤더 3칸)와 `PlayerIdentityCells`(선수명+MVP크라운+스토퍼실드+에이스타겟배지 / POS / OVR배지 바디 3칸)를 export. `BoxScoreTable.tsx`에 있던 로직을 그대로 옮긴 것 — 세 테이블이 전부 이 컴포넌트 하나를 공유해서 셀렉터를 바꿔도 PLAYER/POS/OVR 세 열은 픽셀 단위로 완전히 동일하게 유지됨.

**변경 파일**:
- `components/game/BoxScoreTable.tsx` — 기존 PLAYER/POS/OVR 인라인 렌더링(Crown/Shield/Lock/Unlock 아이콘, OvrBadge 포함)을 삭제하고 `<PlayerIdentityHeaderCells />`/`<PlayerIdentityCells .../>` 호출로 교체(단일 소스로 통합, 동작은 100% 동일)
- `components/game/AdvancedBoxScoreTable.tsx`, `components/game/DefenseBoxScoreTable.tsx` — 기존엔 PLAYER 칸만 있고 POS/OVR이 없었음 → 동일한 `PlayerIdentityHeaderCells`/`PlayerIdentityCells`로 교체해 Traditional과 동일한 PLAYER/POS/OVR 3열 확보, `mvpId?: string` prop 추가(MVP 크라운 표시용)
- `components/game/tabs/GameBoxScoreTab.tsx` — `renderTeamTable()`에서 `AdvancedBoxScoreTable`/`DefenseBoxScoreTable` 호출 시 `mvpId` 전달 추가

**Before**:
```tsx
// AdvancedBoxScoreTable.tsx / DefenseBoxScoreTable.tsx — PLAYER 칸만 있고 POS/OVR 없음
<TableHeaderCell align="left" className="px-4 w-40">PLAYER</TableHeaderCell>
<TableHeaderCell align="center" className="w-12">MIN</TableHeaderCell>
...
<TableCell className="px-4">
    <span className="text-xs font-semibold text-white truncate max-w-[140px] block">{p.playerName}</span>
</TableCell>
<TableCell align="center" className={statCellClass}>{Math.round(p.mp)}</TableCell>
```

**After**:
```tsx
<TableHeaderCell align="left" className="px-4 w-40">PLAYER</TableHeaderCell>
<TableHeaderCell align="center" className="w-12">POS</TableHeaderCell>
<TableHeaderCell align="center" className="w-10">OVR</TableHeaderCell>
<TableHeaderCell align="center" className="w-12">MIN</TableHeaderCell>
...
<PlayerIdentityCells player={p} team={team} mvpId={mvpId} standalone={standalone} />
<TableCell align="center" className={statCellClass}>{Math.round(p.mp)}</TableCell>
```

**검증**: `npx vite build` clean.

**주의사항**: `PlayerIdentityCells`는 `OvrBadge`(`!w-7 !h-7` 28px)를 포함하는데, 이게 세 테이블 모두의 행 높이를 실질적으로 결정하는 셀이라 자연스럽게 행 높이가 통일됨. `BoxScoreTable.tsx`도 자체 인라인 코드 대신 이 컴포넌트로 갈아탔으므로, 향후 PLAYER/POS/OVR 렌더링을 바꿀 땐 `PlayerIdentityCells.tsx` 한 곳만 수정하면 3개 테이블 모두에 반영됨(드리프트 방지).

**롤백 방법**: `components/game/PlayerIdentityCells.tsx` 삭제 후, 세 테이블 파일에서 Before 블록으로 되돌리면 됨(BoxScoreTable.tsx는 이전 dev-log 항목의 PLAYER 셀 인라인 코드 참조).

---

## 2026-08-02 — 좌우 분할 박스스코어 헤더 바에 구분선 연결 (컬럼 헤더 구분선과 이어지도록)

**배경**: 스크린샷으로 "Traditional과 애틀랜타 로고 사이에 구분선이 없다 — 두 테이블의 디비전 사이에 보더라인을 넣어달라" 지적. 좌우 분할(`standalone`) 모드에서 컬럼 헤더 행(PLAYER/POS/...)은 `<Table>` 컴포넌트 자체의 `border`(전체 테두리) 덕분에 옆 패널과의 경계선이 보이는데, 그 위의 팀 헤더 바(로고+팀명+스탯 드롭다운, `<Table>` 밖의 별도 div)에는 테두리가 없어 그 구간만 구분선이 끊겨 보였음.

**변경 파일**:
- `components/game/BoxScoreTable.tsx`, `components/game/AdvancedBoxScoreTable.tsx`, `components/game/DefenseBoxScoreTable.tsx` (client 전용 — 3개 파일 동일 패턴)

**Before**:
```tsx
<div className={`px-6 py-4 bg-slate-950/80 flex items-center justify-between mt-0.5 ${standalone ? '' : 'border-b border-slate-800'}`}>
```

**After**:
```tsx
<div className={`px-6 py-4 bg-slate-950/80 flex items-center justify-between mt-0.5 ${standalone ? 'border-l border-r border-slate-800' : 'border-b border-slate-800'}`}>
```

**검증**: `npx vite build` clean.

**주의사항**: `standalone`(좌우 분할)일 때 헤더 바에 좌우 테두리를 줘서, 아래 `<Table>`의 좌우 테두리와 이어지는 하나의 연속된 구분선처럼 보이도록 함. 기본(상하 배치) 모드는 기존과 동일하게 `border-b`만 유지.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 박스스코어 스탯 셀렉터: 팀별 헤더 개별 배치 → 드롭다운 전환 + 배경/보더 제거

**배경**: 직전에 구현한 Traditional/Advanced/Defense 셀렉터가 그리드 상단에 하나만 있어 양 팀이 같은 모드를 공유했는데, "셀렉터를 상단에 하나가 아닌, 각 테이블의 헤더에 하나씩 포함시켜달라는 의미였음" 요청으로 팀별 독립 전환으로 정정. 이어서 "셀렉터 말고 드랍다운으로 변경해줘", "드랍다운의 배경색과 보더라인은 제거해줘" 요청으로 UI 형태를 다듬음.

**변경 파일**:
- `components/game/BoxScoreTable.tsx`, `components/game/AdvancedBoxScoreTable.tsx`, `components/game/DefenseBoxScoreTable.tsx` (client 전용) — `headerRight?: React.ReactNode` prop 추가, 헤더 바(`justify-between`)의 두 번째 자식으로 렌더
- `components/game/tabs/GameBoxScoreTab.tsx` (client 전용) — 상단 공용 셀렉터 제거, `awayStatMode`/`homeStatMode` 독립 state로 전환, 공용 `Dropdown`/`DropdownButton`(`components/common/Dropdown.tsx`) 재사용한 `StatModeSelector`를 각 팀 테이블의 `headerRight`로 전달

**Before**:
```tsx
// GameBoxScoreTab.tsx — 상단에 버튼 그룹 하나, 양 팀 공유
const [statMode, setStatMode] = useState<StatMode>('traditional');
<div className="flex justify-end ...">
    <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 p-1">
        {STAT_MODES.map(m => <button ... />)}
    </div>
</div>
{statMode === 'traditional' && (<>...BoxScoreTable x2...</>)}
{statMode === 'advanced' && (<>...AdvancedBoxScoreTable x2...</>)}
{statMode === 'defense' && (<>...DefenseBoxScoreTable x2...</>)}
```

**After**:
```tsx
// BoxScoreTable.tsx 등 3개 파일 공통 — 헤더 justify-between의 두 번째 자식
<div className={`px-6 py-4 bg-slate-950/80 flex items-center justify-between ...`}>
    <div className="flex items-center gap-3">{/* 로고+팀명 */}</div>
    {headerRight}
</div>

// GameBoxScoreTab.tsx — 팀별 독립 state + 드롭다운
const [awayStatMode, setAwayStatMode] = useState<StatMode>('traditional');
const [homeStatMode, setHomeStatMode] = useState<StatMode>('traditional');

const StatModeSelector: React.FC<{ value: StatMode; onChange: (m: StatMode) => void }> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const current = STAT_MODES.find(m => m.id === value) ?? STAT_MODES[0];
    return (
        <Dropdown
            isOpen={isOpen} onOpenChange={setIsOpen} align="right" width="w-36" className="shrink-0"
            trigger={
                <DropdownButton
                    label={current.label}
                    isOpen={isOpen}
                    className="!px-3 !py-1.5 !bg-transparent !border-transparent hover:!border-transparent !shadow-none !gap-2"
                />
            }
            items={STAT_MODES.map(m => ({ id: m.id, label: m.label, active: m.id === value, onClick: () => onChange(m.id) }))}
        />
    );
};

const renderTeamTable = (side: 'away' | 'home') => {
    // side별 mode/setMode/team/box/oppBox/badge 선택 후
    // headerRight={<StatModeSelector value={mode} onChange={setMode} />} 를 각 테이블에 전달
};
```

**검증**: `npx vite build` clean (총 3회 — headerRight 도입, 드롭다운 전환, 배경/보더 제거 각 단계마다).

**주의사항**: `DropdownButton` 기본 스타일(`bg-slate-900 border-slate-800`, hover 시 `border-slate-600`)을 `!important` 유틸리티로 전부 투명 처리 — 셰브론 아이콘과 라벨 텍스트만 남고 배경/테두리 없는 순수 텍스트+화살표 트리거가 됨. `Dropdown` 컴포넌트는 `createPortal`로 `document.body`에 패널을 렌더하므로 `standalone`(좌우 분할) 레이아웃의 `overflow-x-auto` 래퍼에 잘리지 않음.

**롤백 방법**: Before 블록 내용으로 되돌리고 3개 테이블 컴포넌트의 `headerRight` prop/렌더를 제거하면 됨.

---

## 2026-08-02 — 라이브 헤더 중앙 블록: 런 없을 때 빈 줄 예약 제거 (쿼터/시계+LIVE가 위로 밀리는 현상 수정)

**배경**: 스크린샷 첨부 후 "히트스트릭(스코어링 런)이 표시되지 않아도 해당 부분이 잡혀있어 게임클락과 LIVE 표시가 위로 올라가 있다"는 지적 — 라이브 중 헤더 중앙 블록이 [쿼터/시계] [LIVE] [런 인디케이터] 3줄 구조인데, 런이 없을 때도 `invisible`로 3번째 줄 공간을 항상 예약해둬서 위 2줄이 실제 중앙보다 위로 치우쳐 보였음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 라이브 경기 헤더 중앙 블록)

**Before**:
```tsx
{/* 스코어링 런 인디케이터 — 라이브 중에만 자리를 예약한다(종료된 경기는 이 줄이
    필요 없어 아예 렌더링하지 않음 — Final과 쿼터표 사이 불필요한 여백의 원인이었음). */}
{!showBox && (
    <span className={`text-xs font-bold text-white whitespace-nowrap ${isLive && activeRun ? '' : 'invisible'}`}>
        🔥 {(activeRun?.teamId === gameData?.home_team_id ? homeAbbr : awayAbbr)}{' '}
        {activeRun?.teamPts ?? 0}-{activeRun?.oppPts ?? 0}
    </span>
)}
```

**After**:
```tsx
{/* 스코어링 런 인디케이터 — 런이 실제로 발생 중일 때만 렌더링(자리 예약 없음).
    이전엔 invisible로 항상 한 줄을 예약해둬서 런이 없을 때도 Q/시계+LIVE가
    위로 밀려 보이는 원인이었음. */}
{!showBox && isLive && activeRun && (
    <span className="text-xs font-bold text-white whitespace-nowrap">
        🔥 {(activeRun.teamId === gameData?.home_team_id ? homeAbbr : awayAbbr)}{' '}
        {activeRun.teamPts}-{activeRun.oppPts}
    </span>
)}
```

**검증**: `npx vite build` clean.

**주의사항**: `invisible` 대신 완전 조건부 렌더링으로 바꿔 런이 없을 땐 블록이 2줄([쿼터/시계]+[LIVE])로 줄어들고, 런이 시작되면 3줄로 늘어남 — 런 시작/종료 시 미세한 레이아웃 높이 변화가 생길 수 있으나(기존엔 항상 고정 높이), 요청대로 평상시 중앙 정렬을 우선함. `activeRun`이 이미 `useMemo`에서 `{teamId, teamPts, oppPts} | null`로 정의돼 있어 `&&` 가드 이후 옵셔널 체이닝(`?.`)/널리시(`??`) 제거해도 타입 안전.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 샷차트 좌/우 테이블 폰트 최소 12px 준수

**배경**: "샷차트 탭 좌/우 테이블 내의 폰트들이 최소 12px를 준수하도록 해줘" 요청.

**변경 파일**:
- `components/game/tabs/GameShotChartTab.tsx` (client 전용 — `TeamSidePanel` 내 존별 야투 테이블 + 선수 필터 테이블)

**Before**:
```tsx
const posCell = (...) => <td className={`text-center text-[10px] font-bold ...`}>...</td>;
const mpCell = (...) => <td className={`text-center text-[10px] font-mono ...`}>...</td>;
const statCell = (...) => <td className={`text-center text-[10px] font-mono ...`}>...</td>;
...
<th ...>{c.label}</th>  {/* text-[9px] */}
<div className="text-[9px] text-slate-400 font-medium mt-0.5">{c.stat.m}/{c.stat.a}</div>
...
<th className="text-left text-[9px] ...">선수</th>
<th className="w-9 text-[9px] ...">POS</th>
<th className="w-9 text-[9px] ...">MP</th>
<th className="w-12 text-[9px] ...">2FG</th>
<th className="w-12 text-[9px] ...">3FG</th>
<th className="w-12 text-[9px] ...">FG</th>
```

**After**:
```tsx
// 위 모든 text-[9px]/text-[10px]를 text-xs(12px)로 통일
const posCell = (...) => <td className={`text-center text-xs font-bold ...`}>...</td>;
const mpCell = (...) => <td className={`text-center text-xs font-mono ...`}>...</td>;
const statCell = (...) => <td className={`text-center text-xs font-mono ...`}>...</td>;
...
<th ...>{c.label}</th>  {/* text-xs */}
<div className="text-xs text-slate-400 font-medium mt-0.5">{c.stat.m}/{c.stat.a}</div>
...
<th className="text-left text-xs ...">선수</th>
<th className="w-9 text-xs ...">POS</th>
<th className="w-9 text-xs ...">MP</th>
<th className="w-12 text-xs ...">2FG</th>
<th className="w-12 text-xs ...">3FG</th>
<th className="w-12 text-xs ...">FG</th>
```

**검증**: `npx vite build` clean.

**주의사항**: 요청 범위를 "좌/우 테이블 내부"로 한정해, 테이블 밖에 있는 존 효율 토글/범례 바(같은 파일 474/485행, `text-[10px]`/`text-[9px]`)는 손대지 않음. `text-xs`는 Tailwind 기본값 12px이라 정확히 최소 기준을 충족.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 쿼터별 득점 테이블 최상단/최하단 외곽 수평 구분선 추가

**배경**: "쿼터별 득점 테이블의 최상단, 하단 외곽에도 수평 구분선을 추가해줘" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `QuarterScores` 컴포넌트)

**Before**:
```tsx
<th className="w-12 border-b border-slate-700"></th>
{[1, 2, 3, 4].map(q => (
    <th key={q} className="... border-b border-slate-700 w-9">Q{q}</th>
))}
<th className="... border-b border-slate-700 w-9">T</th>
...
// 마지막(홈) 행 — border-b 없음
<td className="text-center px-3 py-1 text-slate-300 font-bold">{homeAbbr}</td>
{scores.home.map((v, i) => (
    <td key={i} className={`text-center px-3 py-1 text-white ${quarterBg(...)}`}>...</td>
))}
<td className="text-center px-3 py-1 text-white font-bold">{hTotal}</td>
```

**After**:
```tsx
<th className="w-12 border-t border-b border-slate-700"></th>
{[1, 2, 3, 4].map(q => (
    <th key={q} className="... border-t border-b border-slate-700 w-9">Q{q}</th>
))}
<th className="... border-t border-b border-slate-700 w-9">T</th>
...
<td className="text-center px-3 py-1 text-slate-300 font-bold border-b border-slate-700">{homeAbbr}</td>
{scores.home.map((v, i) => (
    <td key={i} className={`text-center px-3 py-1 text-white border-b border-slate-800 ${quarterBg(...)}`}>...</td>
))}
<td className="text-center px-3 py-1 text-white font-bold border-b border-slate-800">{hTotal}</td>
```

**검증**: `npx vite build` clean.

**주의사항**: 헤더행에 `border-t` 추가로 테이블 최상단 라인, 마지막(홈) 행 전 셀에 `border-b` 추가로 최하단 라인 생성. 이름열은 slate-700, 나머지 셀은 기존 톤과 맞춰 slate-800 사용. 수직 구분선은 이전 요청대로 여전히 없음.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 쿼터별 득점 테이블 수직 구분선 전부 제거 (수평 구분선만 유지)

**배경**: "테이블 내부의 수직 구분선은 모두 없애고 수평 구분선만 남겨봐" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `QuarterScores` 컴포넌트)

**Before**:
```tsx
<th className="w-12 border-b border-r border-slate-700"></th>
{[1, 2, 3, 4].map(q => (
    <th key={q} className="... border-b border-r border-slate-700 w-9">Q{q}</th>
))}
...
<td className="... border-b border-r border-b-slate-600">{awayAbbr}</td>
{scores.away.map((v, i) => (
    <td key={i} className={`... border-b border-r border-slate-800 ${quarterBg(...)}`}>...</td>
))}
...
<td className="... font-bold border-r border-slate-700">{homeAbbr}</td>
{scores.home.map((v, i) => (
    <td key={i} className={`... border-r border-slate-800 ${quarterBg(...)}`}>...</td>
))}
```

**After**:
```tsx
<th className="w-12 border-b border-slate-700"></th>
{[1, 2, 3, 4].map(q => (
    <th key={q} className="... border-b border-slate-700 w-9">Q{q}</th>
))}
...
<td className="... border-b border-b-slate-600">{awayAbbr}</td>
{scores.away.map((v, i) => (
    <td key={i} className={`... border-b border-slate-800 ${quarterBg(...)}`}>...</td>
))}
...
<td className="... font-bold">{homeAbbr}</td>
{scores.home.map((v, i) => (
    <td key={i} className={`text-center px-3 py-1 text-white ${quarterBg(...)}`}>...</td>
))}
```

**검증**: `npx vite build` clean.

**주의사항**: 모든 `border-r`/`border-r-*` 클래스를 제거(헤더 코너·Q1~Q4 헤더·이름열·쿼터 셀 전부). 헤더 밑줄, 이름열 1행-2행 구분선, 쿼터-합계 행 구분선 등 수평 구분선(`border-b`)은 그대로 유지. 쿼터 승/패 배경색(`quarterBg()`)도 영향 없음.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 쿼터별 득점 테이블 배경색/외곽 테두리 제거 (쿼터 우위 색상은 유지)

**배경**: "쿼터별 득점 테이블의 배경색을 제거하고, 가장자리 보더라인은 제거해줘. 쿼터 우위 표시 색상은 그대로 놔둬" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `QuarterScores` 컴포넌트)

**Before**:
```tsx
<table className={`text-xs font-mono border-collapse mx-auto border border-slate-700 ${fullWidth ? 'w-full' : ''}`}>
    <thead>
        <tr className="bg-white/5">
            <th className="w-12 border-b border-r border-slate-700"></th>
            ...
<td className="text-center px-3 py-1 text-slate-300 font-bold bg-white/5 border-b border-r border-b-slate-600 border-r-slate-700">{awayAbbr}</td>
...
<td className="text-center px-3 py-1 text-slate-300 font-bold bg-white/5 border-r border-slate-700">{homeAbbr}</td>
```

**After**:
```tsx
<table className={`text-xs font-mono border-collapse mx-auto ${fullWidth ? 'w-full' : ''}`}>
    <thead>
        <tr>
            <th className="w-12 border-b border-r border-slate-700"></th>
            ...
<td className="text-center px-3 py-1 text-slate-300 font-bold border-b border-r border-b-slate-600 border-r-slate-700">{awayAbbr}</td>
...
<td className="text-center px-3 py-1 text-slate-300 font-bold border-r border-slate-700">{homeAbbr}</td>
```

**검증**: `npx vite build` clean.

**주의사항**: 헤더행/이름열의 `bg-white/5` 음영과 `<table>`의 외곽 `border border-slate-700`만 제거. 내부 그리드 구분선(행/열 사이 border-b·border-r)과 쿼터별 승/패 배경색(`quarterBg()`의 `bg-emerald-500/15`/`bg-red-500/15`)은 요청대로 그대로 유지.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 이름열 헤더 위쪽 구분선 누락 수정 (좌상단 코너 셀)

**배경**: 직전 수정 후 스크린샷으로 "IND 위에 구분선이 없잖아"라고 지적 — 좌상단 코너 셀(`<th className="w-12">`, 이름열 헤더 자리)에 의도적으로 `border-b`가 빠져있어(주석: "좌상단 코너 칸은 빈 칸이라 밑줄 없음") Q1~T 헤더 밑줄이 이름열 위쪽까지 이어지지 않고 끊겨 보였던 문제.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `QuarterScores` 컴포넌트)

**Before**:
```tsx
<th className="w-12 border-r border-slate-700"></th>
```

**After**:
```tsx
<th className="w-12 border-b border-r border-slate-700"></th>
```

**검증**: `npx vite build` clean.

**주의사항**: 기존 주석("좌상단 코너 칸은 빈 칸이라 밑줄 없음")은 의도된 디자인이었으나 실제로는 헤더 밑줄이 이름열 위에서 끊겨 보이는 결과를 낳아 사용자가 어색하다고 지적 — 코너 셀도 나머지 헤더와 동일하게 밑줄을 이어지도록 수정.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 쿼터별 득점 테이블 3차: 이름열 행간 구분선 보강 + 득점 텍스트 흰색 통일 + 쿼터 승/패 배경색

**배경**: "1열의 1행과 2행 사이에도 구분선 넣어주고, 쿼터별 득점 텍스트 색상 흰색으로 통일해. 그리고 쿼터별로 득점 더 많이 한 팀의 셀은 불투명도가 적용된 초록색, 득점 덜 기록한 팀은 불투명도가 적용된 빨간색을 적용해줘" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `QuarterScores` 컴포넌트)

**Before**:
```tsx
const cellClass = (qi: number) => {
    if (qi + 1 > currentQuarter) return 'text-slate-600';
    if (qi + 1 === currentQuarter) return 'text-white';
    return 'text-slate-400';
};
...
<td className="text-center px-3 py-1 text-slate-300 font-bold bg-white/5 border-b border-r border-slate-700">{awayAbbr}</td>
{scores.away.map((v, i) => (
    <td key={i} className={`text-center px-3 py-1 border-b border-r border-slate-800 ${cellClass(i)}`}>
        {i + 1 > currentQuarter ? '—' : v}
    </td>
))}
...
{scores.home.map((v, i) => (
    <td key={i} className={`text-center px-3 py-1 border-r border-slate-800 ${cellClass(i)}`}>
        {i + 1 > currentQuarter ? '—' : v}
    </td>
))}
```
(쿼터 점수 텍스트가 과거/현재/미래 쿼터에 따라 slate-400/white/slate-600으로 갈렸음. 이름열 1행 하단 구분선이 border-r과 같은 `border-slate-700` 한 색으로만 지정돼 있어 배경 음영(`bg-white/5`) 위에서 잘 안 보였음. 쿼터별 승/패 배경색 없음.)

**After**:
```tsx
const quarterBg = (mine: number, opp: number, isPlayed: boolean) => {
    if (!isPlayed || mine === opp) return '';
    return mine > opp ? 'bg-emerald-500/15' : 'bg-red-500/15';
};
...
<td className="text-center px-3 py-1 text-slate-300 font-bold bg-white/5 border-b border-r border-b-slate-600 border-r-slate-700">{awayAbbr}</td>
{scores.away.map((v, i) => {
    const isPlayed = i + 1 <= currentQuarter;
    return (
        <td key={i} className={`text-center px-3 py-1 text-white border-b border-r border-slate-800 ${quarterBg(v, scores.home[i], isPlayed)}`}>
            {isPlayed ? v : '—'}
        </td>
    );
})}
...
{scores.home.map((v, i) => {
    const isPlayed = i + 1 <= currentQuarter;
    return (
        <td key={i} className={`text-center px-3 py-1 text-white border-r border-slate-800 ${quarterBg(v, scores.away[i], isPlayed)}`}>
            {isPlayed ? v : '—'}
        </td>
    );
})}
```

**검증**: `npx vite build` clean.

**주의사항**: 이름열 1행-2행 구분선은 `border-b-slate-600`(방향 지정 컬러 유틸)로 우측 구분선(`border-r-slate-700`)과 분리해 배경 음영 위에서도 또렷하게 보이도록 함. 득점 텍스트는 과거/현재 쿼터 구분 없이 전부 `text-white`로 통일(아직 안 치른 미래 쿼터는 라이브 경기에서만 발생하며 '—'로 표시). 쿼터 승/패 배경은 동점 쿼터·미진행 쿼터에는 적용되지 않고, 합계(T) 컬럼에는 적용하지 않음(요청 범위가 "쿼터별"에 한정).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 쿼터별 득점 테이블 2차 정리 (쿼터 사이 전체 구분선, 헤더 텍스트 수직 중앙, 이름열 중앙 정렬)

**배경**: 직전 수정본 스크린샷을 보고 "쿼터 사이에도 구분선 다 넣고, 컬럼 헤더 텍스트 수직 중앙 정렬 시키고, 1열 텍스트 중앙 정렬 처리해" 요청 (Q4-T 사이에만 있던 구분선을 전체 쿼터 사이로 확장, 헤더 라벨 세로 정렬 어색함, 이름열이 좌측 정렬이라 어색했던 문제 지적). 이어서 "마지막으로 테이블 보더라인 추가해줘" 요청으로 외곽 테두리도 추가.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `QuarterScores` 컴포넌트)

**Before**:
```tsx
{[1, 2, 3, 4].map(q => (
    <th key={q} className={`text-center px-3 pb-1.5 font-semibold text-slate-400 border-b border-slate-700 w-9 ${q === 4 ? 'border-r' : ''}`}>Q{q}</th>
))}
...
<td className="text-left pr-3 py-1 text-slate-300 font-bold bg-white/5 border-b border-r border-slate-700">{awayAbbr}</td>
{scores.away.map((v, i) => (
    <td key={i} className={`text-center px-3 py-1 border-b border-slate-800 ${i === 3 ? 'border-r border-slate-700' : ''} ${cellClass(i)}`}>{...}</td>
))}
```
(Q1|Q2, Q2|Q3, Q3|Q4 사이엔 구분선 없이 Q4|T만 있었음. 헤더 th는 `pb-1.5`만 있어 세로 정렬이 아래로 치우침. 이름열은 `text-left`.)

**After**:
```tsx
{[1, 2, 3, 4].map(q => (
    <th key={q} className="text-center align-middle px-3 py-1.5 font-semibold text-slate-400 border-b border-r border-slate-700 w-9">Q{q}</th>
))}
...
<td className="text-center px-3 py-1 text-slate-300 font-bold bg-white/5 border-b border-r border-slate-700">{awayAbbr}</td>
{scores.away.map((v, i) => (
    <td key={i} className={`text-center px-3 py-1 border-b border-r border-slate-800 ${cellClass(i)}`}>{...}</td>
))}
```
(모든 쿼터 th/td에 `border-r` 부여해 Q1|Q2|Q3|Q4|T 전 구간 구분선 통일. 헤더는 `py-1.5`(대칭 패딩)+`align-middle`로 수직 중앙 정렬. 이름열은 `text-center`+`px-3`(대칭 패딩)로 변경.)

```tsx
// <table> 최상위 className — 외곽 테두리 추가
// Before: `text-xs font-mono border-collapse mx-auto ${fullWidth ? 'w-full' : ''}`
// After:  `text-xs font-mono border-collapse mx-auto border border-slate-700 ${fullWidth ? 'w-full' : ''}`
```

**검증**: `npx vite build` clean.

**주의사항**: 홈/원정 두 데이터 행 모두 동일하게 적용. 이 컴포넌트는 헤더/사이드바(`fullWidth`) 양쪽에서 재사용되므로 두 위치 모두에 반영됨. 외곽 테두리 색상은 내부 구분선과 동일한 `slate-700`으로 맞춰 톤 통일.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 쿼터별 득점 테이블 시인성 개선 (헤더/이름열 음영, Q4-T 구분선, 이름열 구분선 색상 통일)

**배경**: 스크린샷 첨부 후 "테이블 디자인이 구분이 잘 안돼. 상단 테이블 헤더에 색을 넣어주고, 이름 열에도 색을 넣어줘. 그리고 4쿼터 우측에도 구분선을 넣어주고 팀명 우측 구분선이 1행과 2,3행이 달라. 통일시켜줘" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `QuarterScores` 컴포넌트)

**Before**:
```tsx
<thead>
    <tr>
        <th className="w-12 border-r border-slate-700"></th>
        {[1, 2, 3, 4].map(q => (
            <th key={q} className="text-center px-3 pb-1.5 font-semibold text-slate-400 border-b border-slate-700 w-9">Q{q}</th>
        ))}
        <th className="text-center px-3 pb-1.5 font-semibold text-slate-400 border-b border-slate-700 w-9">T</th>
    </tr>
</thead>
<tbody>
    <tr>
        <td className="text-left pr-3 py-1 text-slate-300 font-bold border-b border-r border-slate-800">{awayAbbr}</td>
        {scores.away.map((v, i) => (
            <td key={i} className={`text-center px-3 py-1 border-b border-slate-800 ${cellClass(i)}`}>{...}</td>
        ))}
        <td className="text-center px-3 py-1 text-white font-bold border-b border-slate-800">{aTotal}</td>
    </tr>
    <tr>
        <td className="text-left pr-3 py-1 text-slate-300 font-bold border-r border-slate-800">{homeAbbr}</td>
        {scores.home.map((v, i) => (
            <td key={i} className={`text-center px-3 py-1 ${cellClass(i)}`}>{...}</td>
        ))}
        <td className="text-center px-3 py-1 text-white font-bold">{hTotal}</td>
    </tr>
</tbody>
```
(이름열 우측 구분선 색상이 헤더 코너 셀은 `border-slate-700`, 바디 셀은 `border-slate-800`으로 서로 달랐고, 헤더행/이름열에 배경색이 없었고, Q4와 T 사이 구분선이 없었음)

**After**:
```tsx
<thead>
    <tr className="bg-white/5">
        <th className="w-12 border-r border-slate-700"></th>
        {[1, 2, 3, 4].map(q => (
            <th key={q} className={`text-center px-3 pb-1.5 font-semibold text-slate-400 border-b border-slate-700 w-9 ${q === 4 ? 'border-r' : ''}`}>Q{q}</th>
        ))}
        <th className="text-center px-3 pb-1.5 font-semibold text-slate-400 border-b border-slate-700 w-9">T</th>
    </tr>
</thead>
<tbody>
    <tr>
        <td className="text-left pr-3 py-1 text-slate-300 font-bold bg-white/5 border-b border-r border-slate-700">{awayAbbr}</td>
        {scores.away.map((v, i) => (
            <td key={i} className={`text-center px-3 py-1 border-b border-slate-800 ${i === 3 ? 'border-r border-slate-700' : ''} ${cellClass(i)}`}>{...}</td>
        ))}
        <td className="text-center px-3 py-1 text-white font-bold border-b border-slate-800">{aTotal}</td>
    </tr>
    <tr>
        <td className="text-left pr-3 py-1 text-slate-300 font-bold bg-white/5 border-r border-slate-700">{homeAbbr}</td>
        {scores.home.map((v, i) => (
            <td key={i} className={`text-center px-3 py-1 ${i === 3 ? 'border-r border-slate-700' : ''} ${cellClass(i)}`}>{...}</td>
        ))}
        <td className="text-center px-3 py-1 text-white font-bold">{hTotal}</td>
    </tr>
</tbody>
```

**검증**: `npx vite build` clean.

**주의사항**: 헤더행 배경은 `<tr>`에 `bg-white/5`를 줘서 빈 코너 셀까지 자연스럽게 같이 음영 처리됨. 이름열(NYK/DEN) 셀에도 동일한 `bg-white/5`를 개별 적용. 이름열 우측 구분선은 헤더 코너 셀/원정행/홈행 전부 `border-slate-700`으로 통일(기존엔 헤더만 700, 바디는 800이라 미묘하게 색이 달랐음). Q4↔T 사이 구분선은 헤더 Q4 셀과 바디 두 행의 4번째(i===3) 셀에 `border-r border-slate-700` 추가. 이 컴포넌트는 헤더/사이드바(`fullWidth`) 양쪽에서 재사용되므로 두 위치 모두에 적용됨.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 헤더 쿼터별 득점 테이블: Final과의 간격 + Q4 볼드 제거 + 팀명 컬럼 구분선

**배경**: "헤더에 있는 쿼터별 득점 테이블과 Final과의 유격을 조금 떼어줘. 그리고 4Q와 T에만 굵은 텍스트 처리되어 있는데, T만 굵은 글자로 처리해주면 돼. 그리고 팀명 컬럼 우측에도 구분선을 추가해줘" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — `QuarterScores` 컴포넌트 + 헤더 호출부)

**Before**:
```tsx
// 헤더 호출부 — Final 텍스트 바로 아래 gap-1.5(부모 flex-col)만으로 붙어있었음
{showBox && (
    <QuarterScores allLogs={visibleEvents} homeTeamId={gameData.home_team_id}
        currentQuarter={currentQuarter} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />
)}

// QuarterScores 컴포넌트
const cellClass = (qi: number) => {
    if (qi + 1 > currentQuarter) return 'text-slate-600';
    if (qi + 1 === currentQuarter) return 'text-white font-bold';  // 종료 경기는 currentQuarter=마지막 이벤트 쿼터(보통 4)라 Q4가 항상 볼드로 보임
    return 'text-slate-400';
};
...
<th className="w-12"></th>  {/* 팀명 컬럼 헤더 코너 — 구분선 없음 */}
...
<td className="text-left pr-3 py-1 text-slate-300 font-bold border-b border-slate-800">{awayAbbr}</td>
...
<td className="text-left pr-3 py-1 text-slate-300 font-bold">{homeAbbr}</td>
```

**After**:
```tsx
// 헤더 호출부 — 추가 mt-1 래퍼로 Final과의 간격 확보
{showBox && (
    <div className="mt-1">
        <QuarterScores allLogs={visibleEvents} homeTeamId={gameData.home_team_id}
            currentQuarter={currentQuarter} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />
    </div>
)}

// QuarterScores 컴포넌트
const cellClass = (qi: number) => {
    if (qi + 1 > currentQuarter) return 'text-slate-600';
    if (qi + 1 === currentQuarter) return 'text-white';   // font-bold 제거 — T(합계) 컬럼만 볼드로 남김
    return 'text-slate-400';
};
...
<th className="w-12 border-r border-slate-700"></th>
...
<td className="text-left pr-3 py-1 text-slate-300 font-bold border-b border-r border-slate-800">{awayAbbr}</td>
...
<td className="text-left pr-3 py-1 text-slate-300 font-bold border-r border-slate-800">{homeAbbr}</td>
```

**검증**: `npx vite build` clean.

**주의사항**: `QuarterScores`는 헤더(라이브 사이드바 없음)와 사이드바 body(`fullWidth` 사용) 양쪽에서 재사용되는 공유 컴포넌트라, 볼드 제거/팀명 구분선 변경은 두 곳 모두에 적용됨(요청 취지상 자연스러운 범위). 반면 "Final과의 간격" `mt-1` 래퍼는 헤더 호출부에만 적용(사이드바 body는 대상 아님). 라이브 경기 중 현재 쿼터 강조는 색상(흰색 vs 회색)만으로 유지되고 볼드는 더 이상 붙지 않음.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 멀티플레이어 경기 탭 라벨 변경 ("경기기록"→"박스스코어", "PBP"→"경기 기록")

**배경**: "경기기록 탭의 이름을 박스스코어로 바꾸고, PBP를 경기 기록으로 바꿔" 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 멀티플레이어 종료 경기 탭바)

**Before**:
```tsx
{ id: 'box' as const,       label: '경기기록' },
{ id: 'shotchart' as const, label: '샷차트' },
{ id: 'pbp' as const,       label: 'PBP' },
```

**After**:
```tsx
{ id: 'box' as const,       label: '박스스코어' },
{ id: 'shotchart' as const, label: '샷차트' },
{ id: 'pbp' as const,       label: '경기 기록' },
```

**검증**: `npx vite build` clean.

**주의사항**: 탭 `id`(box/pbp)는 그대로 유지하고 표시 라벨만 바꿨으므로 로직/라우팅에는 영향 없음. 싱글플레이어(`GameResultView.tsx`)는 탭 id가 애초에 다르고(`'BoxScore'` 라벨이 이미 "박스스코어") 이번 요청 범위 밖이라 변경하지 않음.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 핫/콜드 스트릭 마커를 막대 위쪽 → 막대와 겹치게 위치 변경

**배경**: "이모지를 막대의 상단이 아닌 막대와 겹치게 배치해줄 수 있나?" 요청.

**변경 파일**:
- `components/game/RotationChart.tsx` (client 전용)

**Before**:
```tsx
<span
    className="absolute top-0 -translate-x-1/2 -translate-y-1/2 text-[11px] leading-none select-none cursor-default"
    style={{ left: `${(s.t / GAME_DURATION_SECONDS) * 100}%` }}
    ...
>
```

**After**:
```tsx
<span
    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] leading-none select-none cursor-default z-10"
    style={{ left: `${(s.t / GAME_DURATION_SECONDS) * 100}%` }}
    ...
>
```

**검증**: `npx vite build` clean.

**주의사항**: 막대(`top-1/2 -translate-y-1/2`)와 동일한 세로 중심축에 배치되도록 `top-0` → `top-1/2`로 변경, 겹쳤을 때 가독성 위해 폰트 11px→13px·`z-10` 추가.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 로테이션 차트에 핫/콜드 스트릭(🔥/❄️) 마커 추가

**배경**: "로테이션 차트의 막대 위에, 선수가 핫/콜드 스트릭을 기록했을때를 저장해두었다가 불꽃/눈송이 이모지를 막대 위에 붙이는 기술을 구현할 수 있는지" 요청 → 조사 결과 엔진(`statsMappers.ts`)에 이미 "최근 5개 슛 중 마지막 3개가 전부 성공/실패"라는 핫/콜드 판정 로직이 있었으나 명중률 자기강화 문제로 실제 반영에서는 제거되고 연출용으로만 남아있던 상태. DB에 새 저장 없이 이미 저장 중인 `shot_events`(SP)/`box_timeline`(MP)만으로 클라이언트에서 동일 판정을 재구성할 수 있음을 확인 후, "현재 적용되고 있는 기준을 그대로" 재구현.

**변경 파일**:
- `components/game/RotationChart.tsx` (client 전용)
- `components/game/tabs/GameRotationTab.tsx` (client 전용 — `shotEvents` prop 통과만)
- `views/GameResultView.tsx` (client 전용 — 싱글플레이어 호출부, `pbpShotEvents` 연결)
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 멀티플레이어 호출부, `gameData.shot_events` 연결)

**Before**:
```tsx
// RotationChart.tsx — shotEvents 관련 로직 전무. PlayerRow는 segments만 렌더링.
interface RotationChartProps {
    ...
    splitLayout?: boolean;
}
const PlayerRow: React.FC<{ player, segments, teamColor, scoreAt, isHome }> = (...) => {
    ...
    // 스트릭 마커 없음
};
```

**After**:
```tsx
// RotationChart.tsx
interface RotationChartProps {
    ...
    shotEvents?: ShotEvent[];
}

function shotElapsedSeconds(s: ShotEvent): number {
    return (s.quarter - 1) * 720 + (720 - s.gameClock);
}
type StreakMarker = { t: number; type: 'hot' | 'cold' };

// services/game/engine/pbp/statsMappers.ts의 updateHotCold()와 동일한 기준(최근 5개 중
// 마지막 3개 전부 성공/실패)을 그대로 재구현. 스트릭 유지 중 매 슛마다 재발화하지 않도록
// "새로 진입하는 순간"에만 마커 1개 기록.
function computeStreakMarkers(shots: ShotEvent[]): StreakMarker[] {
    const sorted = [...shots].sort((a, b) => shotElapsedSeconds(a) - shotElapsedSeconds(b));
    const recent: boolean[] = [];
    let current: 'hot' | 'cold' | null = null;
    const markers: StreakMarker[] = [];
    for (const shot of sorted) {
        recent.push(shot.isMake);
        if (recent.length > 5) recent.shift();
        if (recent.length >= 3) {
            const last3 = recent.slice(-3);
            if (last3.every(Boolean)) {
                if (current !== 'hot') markers.push({ t: shotElapsedSeconds(shot), type: 'hot' });
                current = 'hot';
            } else if (last3.every(s => !s)) {
                if (current !== 'cold') markers.push({ t: shotElapsedSeconds(shot), type: 'cold' });
                current = 'cold';
            } else {
                current = null;
            }
        }
    }
    return markers;
}

// RotationChart 컴포넌트: shotEvents를 playerId별로 그룹핑 후 computeStreakMarkers()로
// useMemo 계산 → PlayerRow에 streaks prop으로 전달
const streaksByPlayer = useMemo(() => { ... }, [shotEvents]);

// PlayerRow: 타임라인 컬럼에 마커 렌더링 (막대 위쪽, GAME_DURATION_SECONDS 기준 동일 좌표계)
{streaks?.map((s, i) => (
    <span className="absolute top-0 -translate-x-1/2 -translate-y-1/2 text-[11px] ..."
          style={{ left: `${(s.t / GAME_DURATION_SECONDS) * 100}%` }}
          title={s.type === 'hot' ? '핫 스트릭 (3연속 성공)' : '콜드 스트릭 (3연속 실패)'}>
        {s.type === 'hot' ? '🔥' : '❄️'}
    </span>
))}
```

**검증**: `npx vite build` clean (기존 무관 chunk-size/circular-vendor 경고만 존재).

**주의사항**:
- **DB 신규 저장 없음** — `shot_events`(싱글플레이어)/`box_timeline`(멀티플레이어) 모두 이미 매 경기 정상 저장 중인 컬럼이라 이 기능은 순수 클라이언트 후처리이며 추가 저장/네트워크 호출이 없음. 로테이션 탭이 열릴 때 이미 `fetchFullGameResult()`/`gameData`로 같이 내려오는 `shot_events`를 재사용.
- 엔진의 `hotColdRating` 수치(±0.15 보너스, 감쇠/리셋 등) 자체는 재현하지 않고, "최근 3개 연속 성공/실패"라는 판정 조건만 재구현했다 — 쿼터전환/하프타임 시 버퍼가 감쇠·리셋되는 라이브 시뮬 디테일은 이 후처리 로직에 반영되지 않아 실제 라이브 중 `hotColdRating`과 완전히 1:1 일치하지 않을 수 있음(스트릭 감지 자체는 동일 기준).
- `shotEvents`가 없는(구버전 저장 데이터 등) 경기는 마커 없이 기존과 동일하게 표시(하위호환).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 로테이션 차트 이름 컬럼 폭 축소 + 우세/동률/열세 범례 삭제

**배경**: "로테이션 차트 선수 이름 컬럼이 너무 넓은데, 적당한 크기로 줄여줘. 그리고 우세/동률/열세 범례는 삭제해줘" 요청.

**변경 파일**:
- `components/game/RotationChart.tsx` (client 전용)

**Before**:
```tsx
// 이름 컬럼 폭을 넉넉히 잡아 전체 폭이 넓어져도 비율이 어색하지 않게 한다.
const NAME_COL = '220px';
...
            {scoreAt && (
                <div className="flex items-center gap-5 text-[11px] font-bold text-slate-400">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: OUTCOME_COLOR.positive }} />우세</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: OUTCOME_COLOR.even }} />동률</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: OUTCOME_COLOR.negative }} />열세</span>
                </div>
            )}
```

**After**:
```tsx
// 선수 이름이 잘리지 않을 정도로만 잡은 최소 폭 — 나머지는 타임라인 컬럼에 양보.
const NAME_COL = '120px';
...
// scoreAt 하단 범례 블록 전체 삭제 (scoreAt 자체는 PlayerRow에 여전히 전달되어 스틴트별 +/- 색상/툴팁 로직은 그대로 동작)
```

**검증**: `npx vite build` clean (기존 무관 chunk-size/circular-vendor 경고만 존재).

**주의사항**: 막대 색상(Positive=초록/Even=회색/Negative=빨강) 자체는 그대로 유지되며 범례 텍스트만 제거됨 — 색상 의미는 호버 툴팁의 +/- 숫자로 확인 가능.

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 로테이션 차트 좌우 1:1 분할 배치 + 구분선 정리 (멀티플레이어)

**배경**: "로테이션 차트도 박스스코어처럼 좌우 1:1 비율을 유지한 테이블로 변경 / 상하좌우 패딩 없이 body full width로 변경 / 상단 헤더의 상단 구분선은 삭제 / 선수 이름 컬럼 우측 구분선 추가 / 쿼터 사이 구분선 추가" 요청. `GameBoxScoreTab`이 이미 쓰던 `splitLayout`/`standalone` 패턴을 로테이션 차트에도 동일하게 이식.

**변경 파일**:
- `components/game/RotationChart.tsx` (client 전용)
- `components/game/tabs/GameRotationTab.tsx` (client 전용 — `splitLayout` prop 통과만)
- `views/multi/season/MultiGamePbpView.tsx` (client 전용 — 멀티플레이어 호출부에서만 `splitLayout` 활성화 + 바깥 `p-6` 패딩 제외)

**Before**:
```tsx
// RotationChart.tsx
const TeamRotationCard: React.FC<{
    team: Team, teamColor: string, badge?: {...}, children: React.ReactNode,
}> = ({ team, teamColor, badge, children }) => (
    <div className="w-full bg-slate-900 border-y border-slate-800 relative">
        <div className="absolute top-0 left-0 right-0 h-0.5 z-10" style={{ backgroundColor: teamColor }}></div>
        <div className="px-6 py-4 bg-slate-950/80 flex items-center justify-between mt-0.5 border-b border-slate-800">...</div>
        <div className="grid h-10 bg-slate-950 border-b border-slate-800" style={{ gridTemplateColumns: `${NAME_COL} 1fr` }}>
            <div className="flex items-center px-4 text-xs font-black uppercase tracking-widest text-slate-500">선수</div>
            <div className="grid grid-cols-4 text-xs font-black uppercase tracking-widest text-slate-500 text-center items-center">
                <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
            </div>
        </div>
        {children}
    </div>
);
// PlayerRow 이름 셀: border 없음, 타임라인 컬럼: 쿼터 구분선 없음
<div className="flex items-center px-4 text-xs font-semibold text-white truncate">{player.playerName}</div>

// 메인 렌더: 항상 상하 배치(flex-col gap-6), splitLayout prop 자체가 없었음

// MultiGamePbpView.tsx
<div className={`flex-1 min-h-0 overflow-y-auto ${finalTab === 'box' || finalTab === 'shotchart' ? '' : 'p-6'}`}>
...
<GameRotationTab ... pbpLogs={gameData.events ?? []} />
```

**After**:
```tsx
// RotationChart.tsx
const TeamRotationCard: React.FC<{
    team: Team, badge?: {...}, standalone?: boolean, children: React.ReactNode,
}> = ({ team, badge, standalone, children }) => (
    <div className={standalone
        ? "w-full bg-slate-900 border border-slate-800 relative"   // 사방 보더 — 옆 카드와 맞닿아 구분선 겸함
        : "w-full bg-slate-900 border-y border-slate-800 relative"
    }>
        <div className="px-6 py-4 bg-slate-950/80 flex items-center justify-between border-b border-slate-800">...</div>
        <div className="grid h-10 bg-slate-950 border-b border-slate-800" style={{ gridTemplateColumns: `${NAME_COL} 1fr` }}>
            <div className="... border-r border-slate-800">선수</div>
            <div className="grid grid-cols-4 divide-x divide-slate-800 ...">
                <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
            </div>
        </div>
        {children}
    </div>
);
// PlayerRow 이름 셀에 border-r 추가, 타임라인 컬럼에 25/50/75% 지점 쿼터 구분선(w-px bg-slate-800/70) 3개 추가
<div className="... border-r border-slate-800">{player.playerName}</div>
<div className="absolute inset-y-0 left-1/4 w-px bg-slate-800/70 pointer-events-none" />
<div className="absolute inset-y-0 left-1/2 w-px bg-slate-800/70 pointer-events-none" />
<div className="absolute inset-y-0 left-3/4 w-px bg-slate-800/70 pointer-events-none" />

// 메인 렌더: splitLayout prop 추가, true면 두 카드를 grid grid-cols-1 lg:grid-cols-2 gap-0 + overflow-x-auto 래퍼로 좌우 배치
// (BoxScoreTable의 splitLayout/standalone과 완전히 동일한 구조)

// GameRotationTab.tsx: splitLayout prop 추가 후 RotationChart로 그대로 전달

// MultiGamePbpView.tsx
<div className={`flex-1 min-h-0 overflow-y-auto ${finalTab === 'box' || finalTab === 'shotchart' || finalTab === 'rotation' ? '' : 'p-6'}`}>
...
<GameRotationTab ... pbpLogs={gameData.events ?? []} splitLayout />
```

**검증**: `npx vite build` clean (기존 무관 chunk-size/circular-vendor 경고만 존재).

**주의사항**: `splitLayout`은 멀티플레이어 호출부(`MultiGamePbpView.tsx`)에서만 활성화했고 싱글플레이어(`GameResultView.tsx`)는 기존 상하 배치 그대로 유지(기본값 `false`) — `GameBoxScoreTab`이 이미 확립한 것과 동일한 opt-in 패턴. 이름 컬럼 우측 구분선/쿼터 구분선은 splitLayout 여부와 무관하게 항상 적용(싱글/멀티 공통). 쿼터 구분선은 정규시즌 48분(4쿼터×12분) 기준 25/50/75% 고정 위치라 연장전(OT) 발생 시 실제 쿼터 경계와는 어긋날 수 있음(기존 Q1~Q4 헤더 라벨도 동일한 단순화 전제).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 로테이션 차트를 박스스코어 테이블 테마로 리디자인

**배경**: "로테이션 탭의 로테이션 차트 디자인도 수정하자. 상단 '로테이션' 텍스트 삭제 / 테이블 디자인 테마를 경기 기록 탭 박스스코어와 동일하게 적용 / 하단 Positive·Even·Negative 한국어화 + Hover 힌트 텍스트 삭제" 요청.

**변경 파일**:
- `components/game/RotationChart.tsx` (client 전용 — 서버 미러 없음, 순수 UI 컴포넌트)

**Before**:
```tsx
import { Team, PlayerBoxScore, RotationData, PbpLog, RotationOutReason } from '../../types';
import { TEAM_DATA } from '../../data/teamData';
...
// 팀 섹션 헤더 — 팀명(좌) + Q1~Q4 라벨(우), 테두리/배경 없이 텍스트만
const TeamSectionHeader: React.FC<{ teamName: string }> = ({ teamName }) => (
    <div className="grid h-8" style={{ gridTemplateColumns: `${NAME_COL} 1fr` }}>
        <div className="flex items-center text-xs font-black uppercase tracking-widest text-slate-400">{teamName}</div>
        <div className="grid grid-cols-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">
            <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
        </div>
    </div>
);
...
export const RotationChart: React.FC<RotationChartProps> = ({
    homeTeam, awayTeam, homeBox, awayBox, rotationData, pbpLogs
}) => {
    ...
    return (
        <div className="w-full">
            <h2 className="text-2xl font-black text-white mb-6">로테이션</h2>

            <div className="mb-8">
                <TeamSectionHeader teamName={awayTeam.name} />
                {sortedAway.map(p => <PlayerRow ... />)}
            </div>
            <div>
                <TeamSectionHeader teamName={homeTeam.name} />
                {sortedHome.map(p => <PlayerRow ... />)}
            </div>

            {scoreAt && (
                <div className="flex items-center gap-5 mt-6 text-[11px] font-bold text-slate-400">
                    <span>...Positive</span>
                    <span>...Even</span>
                    <span>...Negative</span>
                    <span className="text-slate-600">Hover stint for minutes / +/-</span>
                </div>
            )}
        </div>
    );
};
```
(`PlayerRow`의 이름 셀은 `border-b border-white/5` 얇은 구분선 + `text-slate-300 font-bold`, 카드/헤더바 없이 텍스트만 나열하는 "컨테이너 해체" 스타일이었음)

**After**:
```tsx
import { TeamLogo } from '../common/TeamLogo';
...
// 박스스코어 테이블과 동일한 카드 테마 — 팀컬러 상단 보더 + 헤더 바(로고/배지+팀명) + 컬럼 헤드(Q1~Q4)
const TeamRotationCard: React.FC<{
    team: Team, teamColor: string, badge?: { color: string; abbr: string }, children: React.ReactNode,
}> = ({ team, teamColor, badge, children }) => (
    <div className="w-full bg-slate-900 border-y border-slate-800 relative">
        <div className="absolute top-0 left-0 right-0 h-0.5 z-10" style={{ backgroundColor: teamColor }}></div>
        <div className="px-6 py-4 bg-slate-950/80 flex items-center justify-between mt-0.5 border-b border-slate-800">
            <div className="flex items-center gap-3">
                {badge ? (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0" style={{ backgroundColor: badge.color, color: '#fff' }}>
                        {badge.abbr.slice(0, 3)}
                    </div>
                ) : (
                    <TeamLogo teamId={team.id} size="md" />
                )}
                <span className="text-sm font-black text-white uppercase tracking-wider">{team.name}</span>
            </div>
        </div>
        <div className="grid h-10 bg-slate-950 border-b border-slate-800" style={{ gridTemplateColumns: `${NAME_COL} 1fr` }}>
            <div className="flex items-center px-4 text-xs font-black uppercase tracking-widest text-slate-500">선수</div>
            <div className="grid grid-cols-4 text-xs font-black uppercase tracking-widest text-slate-500 text-center items-center">
                <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
            </div>
        </div>
        {children}
    </div>
);
...
// PlayerRow: border-b border-slate-800/50 + hover:bg-white/5 (박스스코어 TableRow와 동일 hover 패턴)
// 이름 셀: text-xs font-semibold text-white (박스스코어 PLAYER 컬럼과 동일 톤)

export const RotationChart: React.FC<RotationChartProps> = ({
    homeTeam, awayTeam, homeBox, awayBox, rotationData, homeBadge, awayBadge, pbpLogs
}) => {
    ...
    return (
        <div className="w-full flex flex-col gap-6">
            <TeamRotationCard team={awayTeam} teamColor={awayColor} badge={awayBadge}>
                {sortedAway.map(p => <PlayerRow ... />)}
            </TeamRotationCard>
            <TeamRotationCard team={homeTeam} teamColor={homeColor} badge={homeBadge}>
                {sortedHome.map(p => <PlayerRow ... />)}
            </TeamRotationCard>

            {scoreAt && (
                <div className="flex items-center gap-5 text-[11px] font-bold text-slate-400">
                    <span>...우세</span>
                    <span>...동률</span>
                    <span>...열세</span>
                </div>
            )}
        </div>
    );
};
```

**검증**: `npx vite build` clean (기존 무관 chunk-size/circular-vendor 경고만 존재).

**주의사항**: `RotationChart`는 싱글(`GameResultView.tsx`)·멀티(`MultiGamePbpView.tsx`) 양쪽 `GameRotationTab`이 공유하는 컴포넌트라 이번 변경도 양쪽에 동일 적용됨(멀티 전용 `standalone` 분기 없음 — 기존부터 이 패턴). `homeBadge`/`awayBadge`는 이전엔 시그니처만 있고 미사용(호환용 dead prop)이었으나, 이번에 박스스코어와 동일하게 헤더 바에서 실제 렌더링하도록 연결함(멀티플레이어에서 사각 배지, 싱글플레이어에서 원형 로고로 자동 분기 — 기존 `BoxScoreTable`과 동일 패턴).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 샷차트 성공 슛 마커를 원형 → 사각형으로 변경 + 크기 축소

**배경**: "사각형으로 바꾸고, 반지름을 5로 줄여봐. 하이라이트 시에는 7로" 요청 — 기존 성공(O)
마커는 `<circle r={isHl?9:6.5}>`.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 성공 슛 마커를 `<circle>` → `<rect>`로 변경 — `cx-r, cy-r` 기준 좌상단, `width/height = 2×r`로
  중심점 기준 정사각형이 되도록 함(기존 `r` 개념을 그대로 정사각형 반폭으로 재사용)
- 크기: 기본 `r=6.5` → `5`, 호버 하이라이트 시 `r=9` → `7`
- 실패(X) 마커는 그대로 유지(변경 요청 대상 아님)

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `<rect>`를 다시 `<circle r={isHl?9:6.5}>`로 되돌리면 됨.

---

## 2026-08-02 — 샷차트 팀 패널 3건: 홈 헤더 좌측 정렬, 존 스탯 테이블 디자인 통일, 컬럼 폭 고정

**배경**: (1) "우측 홈팀 영역에서 팀 이름과 로고가 우측으로 가있는데, 좌측 정렬되도록", (2) "팀
존별 야투 테이블에 아래 선수 리스트 테이블과 같은 디자인을 적용하고 좌우 여백 없이 꽉 차도록",
(3) "선수 선택에 따라 테이블 값이 달라져서 셀 너비가 달라지는 현상 — 5개 열이 언제나 균일한
영역을 유지하도록".

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
1. 배지+팀명 헤더 행: `align === 'right'`일 때 걸려있던 `flex-row-reverse text-right` 제거 —
   홈/원정 모두 항상 좌측 정렬(배지 → 팀명 순)
2. 존 스탯 테이블: `p-4` 패딩 안에 `border rounded-lg overflow-hidden`으로 감싸져 있던 카드형
   래퍼 제거 — 팀명 행만 자체 패딩(`px-4 py-3`)을 유지하고, 테이블 자체는 좌우 패딩 없이
   패널 폭에 꽉 차게 변경. 헤더 배경(`bg-slate-900/60`)·컬럼 구분선(`border-l`) 스타일을 아래
   선수 테이블과 동일한 톤으로 맞춤
3. 존 스탯 테이블과 선수 필터 테이블 양쪽에 `style={{ tableLayout: 'fixed' }}` 추가 — 헤더
   `<th>`에 이미 있던 `w-*` 폭을 이제 브라우저가 강제로 지켜서, 선택된 선수에 따라 셀 값
   길이가 달라져도(`0/0` ↔ `38/62`) 5개 데이터 열(POS/MP/2FG/3FG/FG) 폭이 흔들리지 않음
- 이제 `align` prop이 컴포넌트 어디에서도 안 쓰여서(양쪽 다 미러링 없이 동일하게 렌더링) `TeamSidePanel`의
  `align` prop/타입과 두 호출부의 `align="left"`/`align="right"` 전달을 완전히 제거(죽은 코드 정리)

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `TeamSidePanel`에 `align: 'left'|'right'` prop을 다시 추가하고 헤더 행에
`flex-row-reverse text-right` 조건을 되살리고, 존 스탯 테이블을 `p-4` + 카드형 래퍼로 되돌리고,
두 테이블의 `tableLayout: 'fixed'`를 제거하면 됨.

---

## 2026-08-02 — 샷차트 코트 좌우/상단 여백 축소(패딩 하향 + 강제 최소높이 제거)

**배경**: 스크린샷 확인 결과 코트 SVG 주변에 좌우/상단 여백이 커 보임. 원인은 (1) 코트 컨테이너의
`p-6`(24px) 패딩, (2) 그리드 행의 `min-h-[440px]` 강제 최소높이 — 코트가 실제 종횡비(940:500)
기준 계산된 높이가 440px보다 작은 화면 폭에서는 `justify-center`로 인해 위아래에 남는 여유
공간이 생겨 상단 여백처럼 보였음.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 코트 컨테이너 패딩: `p-6` → `p-2`(좌우 여백 직접 축소)
- 그리드 행의 `min-h-[440px]` 완전 제거 — 이제 행 높이는 컨텐츠(코트의 종횡비 기준 렌더링
  높이, 좌우 패널의 실제 콘텐츠 높이 중 더 큰 쪽)가 그대로 결정, 강제로 늘려주던 여유 공간이
  없어져 상단 여백이 사라짐

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 패딩을 `p-6`으로, 그리드에 `min-h-[440px]`를 다시 추가하면 됨.

---

## 2026-08-02 — 샷차트 존 효율 토글 바를 코트 위에서 아래로 이동

**배경**: "존 효율 보기 오버레이 버튼을 샷차트의 아래쪽으로 옮겨줘" 요청 — 직전엔 코트 SVG보다
먼저 렌더링돼 코트 위쪽에 위치했음.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 토글+범례 컨테이너를 코트 SVG 컨테이너(`containerRef` div) **이전**에서 **이후**로 이동 —
  같은 `flex flex-col` 부모 안에서 순서만 바뀜(겹침 없이 일반 흐름 유지, 절대배치 아님)

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 토글+범례 블록을 코트 SVG 컨테이너보다 앞으로 다시 옮기면 됨.

---

## 2026-08-02 — 샷차트 존 효율 색상/오퍼시티를 참고 이미지(짙은 틸그린) 기준으로 재조정

**배경**: "좀 더 짙은 초록색으로 변경할 수 있나?" → 이어서 참고 이미지(짙고 차분한 틸그린 area
채우기) 첨부하며 "이정도 초록색과 불투명도면 좋겠어" — 직전의 비비드/형광 초록(hue 140, S100%,
L50%, 오퍼시티 0.80)보다 더 차분하고 진한 틸그린 톤 + 중간 정도 오퍼시티를 원함.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- `zoneHeatColor(pct)`: hue 상한 `140`(비비드 그린) → `160`(틸그린 쪽), 채도 `100%` → `55%`,
  밝기 `38%` → `35%` — 전체 그라데이션(빨강~초록)이 덜 형광스럽고 더 짙고 차분한 톤이 되도록
- `ZoneHeatOverlay`의 `<g>` 오퍼시티: `0.80` → `0.55`
- 범례 그라데이션 스와치도 동일 hsl 값(`hsl(0,55%,35%) → hsl(80,55%,35%) → hsl(160,55%,35%)`)으로 맞춤

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요. 참고 이미지의 정확한
색상값을 픽셀 단위로 추출할 도구가 없어 육안 근사치로 맞췄음(오차 가능성 있음).

**롤백 방법**: hue 상한을 `140`, 채도 `100%`, 밝기 `38%`, 오퍼시티를 `0.80`으로, 범례 그라데이션을
직전 값으로 되돌리면 됨.

---

## 2026-08-02 — 샷차트 존 효율 그라데이션 100% 끝단 색상을 연두 → 비비드 초록으로 조정

**배경**: "100% 단계의 최종 색상이 연두색이 아니라, 비비드한 초록색이 될 수 있도록" 요청 —
기존엔 hue 상한이 120(HSL 순수 초록/연두 경계)이라 100% 근처 값이 노란기 도는 연두색으로 보였음.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- `zoneHeatColor(pct)`: hue 매핑 상한 `120` → `140`(더 짙은 초록 쪽으로 이동), 밝기
  `58%` → `50%`(더 선명/비비드하게)
- 범례 그라데이션 스와치도 동일하게 `hsl(0,100%,50%) → hsl(70,100%,50%) → hsl(140,100%,50%)`로 맞춤

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: hue 상한을 `120`으로, 밝기를 `58%`로, 범례 그라데이션을
`hsl(0,100%,58%), hsl(60,100%,58%), hsl(120,100%,58%)`로 되돌리면 됨.

---

## 2026-08-02 — 샷차트 존 효율 오버레이 오퍼시티 상향 (0.16 → 0.80)

**배경**: 사용자 요청으로 존 효율 색상 오버레이를 더 진하게 보이도록 오퍼시티 상향.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- `ZoneHeatOverlay`의 `<g>` 오퍼시티: `0.16` → `0.80`

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 오퍼시티를 `0.16`으로 되돌리면 됨.

---

## 2026-08-02 — 샷차트 존 효율 토글 바가 코트와 겹치던 문제 수정

**배경**: 스크린샷 확인 결과 존 효율 토글+범례 바가 `position: absolute`로 코트 SVG 위에
떠 있어서, 코트 상단 근처의 슛 마커들과 시각적으로 겹쳐 보임.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 토글+범례 바를 `absolute top-2 left-1/2 -translate-x-1/2`(코트 위에 겹쳐 뜨는 오버레이)에서
  일반 문서 흐름 요소로 전환 — 코트 컨테이너(`lg:col-span-6`)를 `flex items-center justify-center`
  (가로 중앙만 정렬)에서 `flex flex-col items-center justify-center gap-3`(세로로 쌓는 컬럼)로
  바꾸고, 토글 바를 코트 SVG 컨테이너보다 **먼저** 렌더링해 코트를 자연스럽게 아래로 밀어냄
  (더 이상 겹치지 않음)
- 코트 SVG를 감싸던 `containerRef` div 뒤에 중복으로 남아있던 이전 위치의 토글+범례 블록(절대
  배치 버전)은 제거

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 토글+범례 블록을 다시 코트 SVG 컨테이너 뒤로 옮기고 `absolute top-2 left-1/2
-translate-x-1/2`를 적용, 코트 컨테이너를 `flex items-center justify-center`(flex-col 제거)로
되돌리면 됨.

---

## 2026-08-02 — 샷차트 3건: 토글 버튼 배경 고정, 선수 정렬 기준 변경, 빈 공간 축소

**배경**: (1) "존 효율 보기 버튼을 클릭하면 버튼 색상은 변하지 않고, 그냥 체크박스만 체크되도록",
(2) "좌우의 선수 리스트 정렬 기준을 포지션(PG/SG/SF/PF/C순) > 출전시간 순으로", (3) "아래에 범례
삭제해서 비는 공간만큼은 삭제해서 공간 최적화".

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
1. 존 효율 버튼: `showHeatmap`에 따라 바뀌던 배경색(`bg-indigo-600`) 조건 제거, 버튼은 항상
   `text-slate-400 hover:text-white`로 고정. 대신 내부 체크박스가 `showHeatmap`에 따라
   `bg-indigo-600 border-indigo-500`(체크) / `border-slate-500`(미체크)로 토글(다른 체크박스들과
   동일한 표준 스타일로 복귀 — 이전엔 버튼 배경이 인디고로 바뀌는 걸 전제로 흰 배경 체크박스를
   썼는데, 이제 버튼 배경이 안 바뀌므로 표준 스타일이 자연스럽게 다시 잘 보임)
2. 선수 정렬: `calculatePlayerOvr` 내림차순 → 포지션 우선순위(`POSITION_SORT_ORDER`:
   PG=0/SG=1/SF=2/PF=3/C=4) 오름차순, 동일 포지션 내에서는 MP(출전시간) 내림차순. 포지션은
   박스스코어(`boxMap.get(id)?.position`, 그 경기 슬롯 기준 — POS 컬럼과 동일 소스)를 우선 쓰고
   없으면 로스터 기본 포지션으로 폴백. 더 이상 안 쓰는 `calculatePlayerOvr` import 제거
3. 코트 그리드 최소 높이: `min-h-[600px]` → `min-h-[440px]`(실제 풀코트 종횡비 기준 렌더링
   높이에 더 가깝게 축소 — 하단 팀/MISS 범례가 없어진 뒤 코트 아래위로 남던 여백을 줄임)

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 버튼에 `showHeatmap ? 'bg-indigo-600 text-white' : ...` 조건과 흰 배경 체크박스
스타일을 되돌리고, 선수 정렬을 `calculatePlayerOvr` 내림차순으로, 그리드 `min-h`를 `600px`로
되돌리면 됨.

---

## 2026-08-02 — 샷차트 존 효율 버튼: Flame 아이콘 제거 + 라벨을 "존 효율 보기"로 변경

**배경**: "존 효율 텍스트 좌측의 아이콘은 지우고, 이름을 존 효율 보기로 변경해줘" 요청.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 버튼 안 `<Flame size={12} />` 아이콘 제거(체크박스는 유지), `lucide-react` import에서도
  더 이상 쓰이지 않는 `Flame` 제거
- 버튼 라벨 텍스트 "존 효율" → "존 효율 보기"

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `Flame` import 및 아이콘을 되살리고, 라벨을 "존 효율"로 되돌리면 됨.

---

## 2026-08-02 — 샷차트 존 효율 버튼 내부 좌측에 체크박스 추가

**배경**: "존 효율 버튼의 내부 좌측에 체크박스를 넣어서 선택되었음을 보이도록 해줘" — 선수
필터 리스트에서 쓰던 것과 같은 체크박스 스타일을 토글 버튼에도 적용.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 존 효율 버튼의 Flame 아이콘 앞(가장 왼쪽)에 커스텀 체크박스(`w-3.5 h-3.5 rounded border`)
  추가 — 꺼짐: 투명 배경 + 회색 테두리만, 켜짐: 버튼 배경(인디고)과 대비되도록 흰 배경 +
  인디고색 체크 아이콘(`Check`)으로 표시(선수 리스트의 인디고 배경 체크박스를 그대로 쓰면
  버튼 자체가 인디고로 바뀌어 대비가 안 생기는 문제를 피함)

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 버튼 내부에 추가한 체크박스 `<div>`를 제거하면 됨.

---

## 2026-08-02 — 샷차트 존 효율 토글을 가운데 섹션 중앙으로 이동 + 하단 팀/MISS 범례 삭제

**배경**: "존 효율 토글을 가운데 섹션의 중앙으로 옮겨주고, 샷차트 하단의 팀과 MISS 표시 범례는
삭제해" 요청.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 존 효율 토글+범례 컨테이너: `absolute top-2 left-2` → `absolute top-2 left-1/2
  -translate-x-1/2`(코트 패널 상단 정중앙)
- 하단 "Legend"(원정/홈 팀 컬러 원 + MISS 아이콘 안내) 블록 전체 삭제 — 실제 슛 점 표시
  로직(성공=원, 실패=X)은 그대로 유지, 텍스트 설명 범례만 제거
- 더 이상 쓰이지 않는 `XIcon` 헬퍼 컴포넌트도 함께 제거(하단 범례에서만 쓰였음)

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 토글 컨테이너를 `absolute top-2 left-2`로 되돌리고, 하단 Legend 블록(팀 컬러 원 +
MISS)과 `XIcon` 컴포넌트를 다시 추가하면 됨.

---

## 2026-08-02 — 샷차트 존 효율 범례를 토글 on/off와 무관하게 항상 표시

**배경**: "존 효율이 꺼져있어도 범례는 보이도록 수정해줘" — 직전엔 `{showHeatmap && (...)}`로
범례 부분을 감싸서 토글을 켰을 때만 나타났음.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 범례 블록을 감싸던 `{showHeatmap && (...)}` 조건 제거 — 토글 상태와 무관하게 항상 렌더링

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 범례 블록을 다시 `{showHeatmap && (...)}`로 감싸면 됨.

---

## 2026-08-02 — 샷차트 존 효율 토글+범례를 하나의 컨테이너로 통합

**배경**: "존효율 토글 버튼과 범례를 동일 컨테이너에 넣어서 일체감있게 만들어줘" — 직전엔
버튼과 범례가 각자 자기 테두리/배경/라운딩을 가진 별도 pill 두 개가 gap으로 떨어져 있어
하나로 안 보였음.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 바깥 wrapper 하나에만 `rounded-lg border border-slate-800 bg-slate-900/80 backdrop-blur-sm
  overflow-hidden`을 부여하고, 버튼/범례 내부 요소는 각자의 테두리·배경·라운딩을 제거해 이
  공유 컨테이너에 얹히도록 변경(버튼의 활성 상태 배경 `bg-indigo-600`만 유지)
- 버튼과 범례 사이에 `w-px self-stretch bg-slate-800` 구분선을 넣어 하나의 바 안에서 섹션만
  나뉘어 보이게 함(기존의 `gap-2` 간격 제거)

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 바깥 wrapper의 `rounded-lg border bg-slate-900/80 overflow-hidden`을 제거하고,
버튼/범례에 각자 `rounded-lg border border-slate-800 bg-slate-900/80 backdrop-blur-sm`을
되돌리고, 구분선 대신 `gap-2`로 되돌리면 됨.

---

## 2026-08-02 — 샷차트 존 효율 토글 버튼을 좌측으로 이동 + 범례를 버튼 우측에 부착

**배경**: "존 효율 켤 수 있는 버튼을 샷차트 영역의 좌측으로 옮기고, 범례를 토글 버튼 우측에
붙여줘" — 기존엔 토글 버튼이 우상단, 색상 스케일 범례가 별도로 좌상단에 떨어져 있었음.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 토글 버튼과 범례를 감싸는 `<div className="absolute top-2 left-2 flex items-center gap-2">`
  하나로 통합 — 버튼이 먼저, `showHeatmap`이 true일 때만 범례가 버튼 바로 오른쪽에 이어 붙음
  (기존엔 버튼이 `top-2 right-2`, 범례가 별도로 `top-2 left-2`에 독립 배치돼 있었음)

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 버튼을 `absolute top-2 right-2`로, 범례를 별도 `absolute top-2 left-2` 블록으로
다시 분리하면 됨.

---

## 2026-08-02 — 샷차트 존 효율 오버레이 색상을 네온톤으로 변경 + 오퍼시티 대폭 하향

**배경**: 참고 이미지(네온 초록 area + 시안 라인 스타일)처럼 오버레이 색상을 더 형광톤으로
바꾸고, 오퍼시티도 전체적으로 많이 낮춰달라는 요청.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- `zoneHeatColor(pct)`: `hsl(hue, 75%, 45%)` → `hsl(hue, 100%, 58%)`(채도 100%·밝기 상향으로
  형광/네온 느낌 강화, 빨강↔초록 hue 매핑 자체는 유지)
- `ZoneHeatOverlay`의 그룹 오퍼시티: `0.4` → `0.16`(대폭 하향)
- 좌상단 범례의 그라데이션 스와치도 동일 hsl 값으로 맞춤

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `zoneHeatColor`를 `hsl(hue, 75%, 45%)`로, 오버레이 그룹 오퍼시티를 `0.4`로,
범례 그라데이션을 `hsl(_,75%,45%)` 값들로 되돌리면 됨.

---

## 2026-08-02 — 샷차트 골밑(RA) 존 오버레이 모양을 원형 → 페인트 존 절반으로 변경

**배경**: "골밑 존은 골밑 아래 원형이 아니라 페인트 존을 반으로 잘라서, 골밑쪽 절반을
표현해줘" — 기존 `circle cx=48 cy=250 r=40`(림 중심 반경 40) 대신, 페인트 사각형
(`y=170 width=190 height=160`)을 절반(너비 95)으로 나눠 baseline 쪽(골밑에 더 가까운) 절반을
RA 존 모양으로 사용.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- `ZoneHeatOverlay`의 RA 도형을 `<circle cx="48" cy="250" r="40" />` → `<rect y="170" width="95"
  height="160" />`(페인트 사각형과 동일한 y/height, 너비만 절반)로 교체 — 여전히 Paint 사각형
  (전체 190폭) 위에 겹쳐 그려지므로, 시각적으로는 페인트 존이 baseline 쪽 절반(RA색)과 하프코트
  중앙 쪽 절반(Paint색)으로 나뉘어 보임

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: RA `<rect>`를 다시 `<circle cx="48" cy="250" r="40" />`로 되돌리면 됨.

---

## 2026-08-02 — 샷차트 존 효율 오버레이를 선수 필터와 독립적으로 동작하도록 수정

**배경**: "필터 리스트와 존 효율 오버레이는 별도로 동작하게 해줘 — 현재는 필터를 모두 끄면
존 오버레이도 같이 사라져" — 직전 구현에서 `awayZoneStats`/`homeZoneStats`를 선택된 선수
필터(`selectedAwayIds`/`selectedHomeIds`)로 걸러서 계산했던 게 원인. 필터를 전부 끄면 필터링된
슛이 0개가 되어 모든 존이 "시도 0개"로 판정되고, `ZoneHeatOverlay`가 시도 0개인 존은 아예 안
칠하므로 오버레이 전체가 사라졌음.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- `awayZoneStats`/`homeZoneStats` 계산에서 `selectedAwayIds`/`selectedHomeIds` 필터링 제거 —
  이제 `awayShots`/`homeShots`(팀 전체, 필터 무관) 그대로 사용. 선수 필터는 코트 위 "점" 표시
  (`displayShots`)에만 영향을 주고, 존 효율 오버레이는 항상 팀 전체 기준으로 독립적으로 표시됨

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `awayZoneStats`/`homeZoneStats` 계산을 다시 `.filter(s => selectedXxxIds.has(...))`로
걸러서 `calcZoneStats`에 넣도록 되돌리면 됨.

---

## 2026-08-02 — 샷차트 존별 성공률 색상 오버레이 토글 추가

**배경**: "팀의 존별 성공률에 따라, 코트 위의 영역별로 색상 오버레이를 껐다 킬 수 있는 기능"
요청 — 존(RA/Paint/Mid/3PT)별 FG%를 빨강(저조)~초록(고효율) 그라데이션으로 코트에 칠하고,
버튼으로 켜고 끌 수 있게 함.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- `zoneHeatColor(pct)` — 0~100%를 hsl 0(빨강)~120(초록)도 사이로 매핑하는 색상 헬퍼
- `ZoneHeatOverlay` 컴포넌트(한쪽 바스켓 기준) — **경로 빼기 연산 없이** 넓은 도형부터 겹쳐
  칠하는 방식으로 4개 존을 구분: ① 하프코트 전체 사각형(3PT색) → ② `BasketLines`의 3점 라인
  경로를 그대로 재사용해 닫은 도형(Mid색, 3점 라인 안쪽만 덮어써서 3PT 존이 바깥 링 형태로 남음)
  → ③ 페인트 사각형(Paint색, Mid를 덮어씀) → ④ 림 반경 40 원(RA색, Paint를 덮어씀). 각 존의 색은
  그 존 통계만 반영(Rim/Paint/Mid/3PT 분류가 이미 서로 배타적이라 도형이 겹쳐도 통계는 안 겹침).
  시도 0개인 존은 아예 안 칠함(0%로 취급해 빨갛게 칠하면 "다 놓침"과 "아예 안 던짐"이 구분 안 됨)
- 어느 팀이 어느 바스켓(좌/우)을 쓰는지는 그 팀 전체 슛(필터 무관)의 평균 x좌표로 판정
  (`avgX < 47`이면 좌측) — 슛 기록이 아예 없으면 원정=좌/홈=우 기본값
- 존 통계는 **현재 선택된 선수 필터**를 반영해 계산(`awayZoneStats`/`homeZoneStats`,
  `selectedAwayIds`/`selectedHomeIds` 기준) — 코트 위 점 표시와 항상 같은 기준으로 갱신됨
- `showHeatmap` state + 토글 버튼(코트 우상단, Flame 아이콘) 추가, 켜졌을 때만 코트 좌상단에
  0%~100% 그라데이션 범례 표시. 오버레이는 페인트 배경 채우기 직후·코트 라인(`BasketLines`)
  그리기 전에 렌더링해 라인이 항상 선명하게 위에 보이도록 함

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**주의사항**: 존 경계 도형(특히 Mid/3PT 경계)은 `BasketLines`의 기존 3점 라인 경로를 그대로
재사용했지만, RA(림 반경)는 단순화를 위해 실제 NBA 반원이 아니라 온전한 원(반지름 40)으로
근사했다 — 베이스라인 근처라 코트 밖으로 거의 안 나가 시각적으로 크게 다르지 않을 것으로 판단.

**롤백 방법**: `zoneHeatColor`/`ZoneHeatOverlay`/`showHeatmap`/`awayOnLeft`/`awayZoneStats`/
`homeZoneStats`와 관련 JSX(토글 버튼, 범례, `<ZoneHeatOverlay>` 렌더링)를 전부 제거하면 됨.

---

## 2026-08-02 — 샷차트 선수 필터 테이블에 POS/MP 컬럼 추가

**배경**: "선수 이름 우측에 포지션 컬럼을 추가하고, 코트 위에서 뛴 시간을 보여주는 컬럼도
추가해줘" 요청. 필요한 데이터(포지션, 출전시간)는 `Team.roster`가 아니라 박스스코어
(`PlayerBoxScore.position`/`mp`)에 있는데, `GameShotChartTab`은 지금까지 `shotEvents`만 받고
박스스코어를 안 받고 있었음(POS는 `BoxScoreTable`도 로스터가 아니라 박스스코어 값을 쓰는 것과
동일 원칙).

**변경 파일**:
- `components/game/tabs/GameShotChartTab.tsx`(싱글/멀티 공유) — `GameShotChartTabProps`에
  `homeBox?`/`awayBox?: PlayerBoxScore[]` 추가(optional, 하위호환 — 없으면 두 컬럼 다 `-` 표시).
  `TeamSidePanel`에 `teamBox` prop 추가, `boxMap`(playerId→PlayerBoxScore) useMemo로 룩업 구성.
  선수 테이블 컬럼 순서를 `체크박스 | 선수 | POS | MP | 2FG | 3FG | FG`로 확장(POS/MP를 이름
  오른쪽, 야투 스탯 왼쪽에 배치). 마스터(전체선택) 행은 POS 빈칸, MP엔 팀 전체 합계
  (`teamTotalMp = teamBox.reduce(mp 합)`) 표시
- `views/GameResultView.tsx`(싱글) / `views/multi/season/MultiGamePbpView.tsx`(멀티) —
  `GameShotChartTab` 호출부에 이미 스코프에 있던 `homeBox`/`awayBox`(멀티는
  `gameData.home_box`/`away_box`) 그대로 전달

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `GameShotChartTabProps`에서 `homeBox`/`awayBox` 제거, `TeamSidePanel`의
`teamBox`/`boxMap`/`posCell`/`mpCell` 및 관련 `<th>`/`<td>`를 제거, 두 호출부의
`homeBox`/`awayBox` 전달을 제거하면 됨.

---

## 2026-08-02 — 샷차트 선수 필터 테이블 행 구분선 추가 (하단 마감)

**배경**: 스크린샷 확인 결과 선수 목록 테이블의 마지막 행(예: "캠 휘트모어") 아래에 구분선이
없어 테이블이 미완성처럼 잘려 보인다는 피드백. 기존엔 마스터(전체선택) 행에만
`border-b`가 있고 개별 선수 행엔 없었음.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 개별 선수 `<tr>`에 `border-b border-slate-800/60` 추가 — 모든 행 사이 구분선이 일관되게 생기고,
  마지막 행 아래도 자연스럽게 선으로 마감됨

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 개별 선수 `<tr>`의 `border-b border-slate-800/60` 클래스를 제거하면 됨.

---

## 2026-08-02 — 샷차트 홈팀 컬럼 순서를 원정팀과 동일하게 통일 + 존 스탯 테이블에 실제 테두리 추가

**배경**: 직전 커밋에서 홈팀(`align='right'`)의 이름 셀만 행 반대쪽으로 옮기는 미러링을
적용했는데, 사용자가 "홈팀의 테이블 구조도 체크박스 | 선수 | 2FG | 3FG | FG로 바꿔줘야지"라고
재요청 — 미러링 없이 원정팀과 완전히 동일한 컬럼 순서를 원했던 것으로 확인. 또한 존 스탯
(FG%/RA%/ITP%/MID%/3P%) 테이블에 "테이블 구조로 바꿔달라니까"라는 재확인 — 직전엔 `<table>`
태그만 썼을 뿐 보더/구분선이 없어 시각적으로 테이블처럼 안 보였던 것으로 판단.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`
- 선수 필터 테이블: `align` 기반으로 이름 셀 위치를 반대편으로 옮기던 로직 전부 제거 — 체크박스
  칸과 선수 이름 칸을 완전히 분리된 별도 `<td>`(`checkboxCell`/`nameCell`)로 만들고, 컬럼 순서를
  홈/원정 관계없이 항상 `체크박스 → 선수 → 2FG → 3FG → FG`로 고정. 헤더에도 "선수" 라벨 추가
- 존 스탯 테이블: 바깥에 `border border-slate-800 rounded-lg overflow-hidden` 래퍼 추가, 헤더행에
  `border-b`, 각 컬럼 사이에 `border-l`(첫 컬럼 제외)를 넣어 실제 그리드 형태의 테이블로 보이게 함
- 선수 필터 테이블에도 스탯 컬럼(2FG/3FG/FG) 사이에 `border-l` 추가해 동일한 원칙 적용
- 상단 배지+팀명 헤더 행(align 기반 좌/우 미러링)은 이번 요청 범위 밖이라 그대로 유지

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `checkboxCell`/`nameCell`을 다시 `align` 기반 단일 병합 셀로, 존 스탯/선수 테이블의
`border-l`/`border` 클래스들을 제거하면 됨.

---

## 2026-08-02 — 샷차트 팀 사이드 패널을 테이블 구조로 재작성 (홈 정렬 수정 + 2FG/3FG 컬럼 + 마스터 선택 행)

**배경**: 4가지 세부 요청 — (1) 홈팀 리스트도 원정팀처럼 체크박스/이름이 항상 정해진 규칙으로
정렬되도록(홈은 반대편으로) 수정, (2) 야투성공/시도(FG) 컬럼 왼쪽에 2FGM/2FGA·3FGM/3FGA 컬럼
추가, (3) 상단 "전체 선택/해제" 버튼 삭제하고 대신 선수 리스트 최상단에 "팀 이름 행"을 만들어
그걸 누르면 전체 선택/해제되도록, (4) 팀명 아래 존 스탯(FG%/RA%/ITP%/MID%/3P%)도 테이블 형식으로.
기존 `flex` 기반 리스트로는 여러 컬럼을 정확히 정렬하기 어려워 `<table>` 구조로 전면 재작성.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`(싱글/멀티 공유)
- `calcShotBreakdown(shots)` 신규 — 2점/3점/전체 성공-시도를 한 번에 계산(선수별·팀 합계 공용)
- 존 스탯 영역: 기존 `StatBox` flex 나열 → `<table>`(헤더 행에 FG%/RA%/ITP%/MID%/3P% 라벨,
  바디 행에 %와 m/a) — `StatBox` 컴포넌트 제거
- 선수 리스트: `<button>` 기반 flex 행 → `<table>`(`<thead>`에 2FG/3FG/FG 라벨, `<tbody>`에
  선수별 행). 컬럼 순서는 **항상** 2FG→3FG→FG로 고정, `align='right'`(홈)일 때는 이름+체크박스
  `<td>`만 행의 반대쪽 끝(맨 뒤)으로 옮겨서 렌더 — 스탯 컬럼 순서 자체는 뒤집지 않음(어느 쪽이든
  같은 순서로 읽히도록)
- 이름 셀(`nameCell` 헬퍼): 체크박스→이름 내부 순서는 고정, `align`에 따라 `flex-row-reverse`로
  좌/우 정렬만 전환(기존엔 버튼·내부그룹 이중 `flex-row-reverse`로 꼬여 있던 걸 명확한 헬퍼
  함수로 정리)
- "전체 선택/해제" 버튼 제거 → `<tbody>`의 첫 `<tr>`(마스터 행)로 대체: 이름 셀엔 팀 이름
  (`font-black uppercase`로 강조), 스탯 칸엔 팀 전체 합계(`calcShotBreakdown(teamShots)`,
  선택 필터와 무관하게 항상 팀 전체 기준) 표시, 행 클릭 시 `onToggleAll` 호출

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `TeamSidePanel`을 이전 버전(flex 기반 리스트 + `StatBox` + "전체 선택/해제"
버튼, FG 단일 컬럼)으로 되돌리면 됨.

---

## 2026-08-02 — 샷차트 탭 외곽 카드 컨테이너 해체 + 멀티플레이어 바디 폭 최대 활용

**배경**: 직전 풀코트 리디자인 이후 "샷차트의 외곽 컨테이너를 해체하고, 바디 넓이를 최대한
활용해" 요청 — 박스스코어/인사이트/로테이션 탭에 이미 적용한 것과 동일한 원칙.

**변경 파일**:
- `components/game/tabs/GameShotChartTab.tsx`(싱글/멀티 공유) — 외곽
  `bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl` 카드 제거,
  3분할 grid를 바로 최상위로 올리고 `border-y border-slate-800`만 남겨 위아래 구분선만 유지
  (좌우는 이제 바디 가장자리까지 그대로 이어짐)
- `views/multi/season/MultiGamePbpView.tsx` — 탭 바디 패딩 조건(`finalTab === 'box' ? '' : 'p-6'`)에
  `'shotchart'`도 추가해 박스스코어 탭과 동일하게 좌우 여백 없이 바디 폭 전체를 사용하도록 함
  (싱글플레이어 `GameResultView.tsx`는 전체 탭 공통의 `max-w-7xl` 래퍼를 쓰고 있어 이번 변경
  범위 밖 — 그쪽까지 넓히면 다른 탭들도 다 같이 영향받아 별도 판단 필요)

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `GameShotChartTab.tsx`에 외곽 카드 div를 다시 감싸고, `MultiGamePbpView.tsx`의
탭 바디 패딩 조건에서 `finalTab === 'shotchart'` 분기를 제거하면 됨.

---

## 2026-08-02 — 샷차트 탭을 풀코트 중앙 + 좌우 팀별 필터 레이아웃으로 재설계

**배경**: "현재는 코트 하나에 양 팀을 셀렉터로 스왑 후 선수 필터링을 통해 샷 차트를 보여주지만"
→ "풀코트가 중앙에 위치, 좌측엔 원정 선수 필터링, 우측엔 홈팀 선수 필터링"으로 변경 요청.
기존엔 하프코트(470x500) + 팀 토글 버튼으로 한 팀씩만 보여줬는데, 라이브 화면의
`MultiFullCourtChart.tsx`가 이미 갖고 있던 풀코트(940x500, 좌우 바스켓 미러) 좌표계를 참고해
양 팀 슛을 동시에 표시하는 구조로 전환.

**변경 파일**: `components/game/tabs/GameShotChartTab.tsx`(싱글/멀티 공유 컴포넌트 —
`GameResultView.tsx`/`MultiGamePbpView.tsx` 양쪽에서 재사용되므로 둘 다 자동 적용)
- 팀 토글(`selectedTeamId` state + 토글 버튼) 완전 제거 — 양 팀 슛을 좌표 정규화 없이 원본
  위치 그대로(하프코트 정규화하던 `if (x > COURT_WIDTH/2) {...}` 로직 삭제) 동시에 렌더링
- 코트 SVG를 하프(470x500, 단일 바스켓) → 풀코트(940x500, 좌우 바스켓 `BasketLines` 컴포넌트를
  `<g transform="translate(940,0) scale(-1,1)">`로 미러링 + 센터서클/하프라인)로 교체 —
  `MultiFullCourtChart.tsx`의 좌표계와 동일(라이브/종료 화면 간 시각적 일관성)
  하되, 컴포넌트 자체는 이 파일에 독립 복제(기존 라이브 전용 컴포넌트를 건드리지 않기 위함)
  - `1fr auto 1fr` → `grid-cols-12`(3/6/3 분할): 좌측 3칸 = 원정 필터, 중앙 6칸 = 풀코트,
    우측 3칸 = 홈 필터
- `selectedPlayerIds`(단일 팀) → `selectedHomeIds`/`selectedAwayIds`(팀별 독립 상태)로 분리,
  각각 기본값 전체 선택
- 신규 `TeamSidePanel` 컴포넌트 — 팀 배지/이름 + 존 스탯(FG%/RA%/ITP%/MID%/3P%, 팀별 계산) +
  전체선택 토글 + 선수 필터 리스트를 하나로 묶음. `align` prop으로 좌(원정)/우(홈) 정렬 반전
  (아이콘·텍스트·체크박스 순서를 `flex-row-reverse`로 뒤집어 대칭 배치)
- 범례를 코트 하단 중앙으로 이동, 팀 컬러 2개(원정/홈) + MISS 표시로 재구성(기존엔 단일 팀
  MADE/MISS만 표시)

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `GameShotChartTab.tsx`를 이전 버전(하프코트 470x500 + `selectedTeamId` 토글 +
단일 `selectedPlayerIds` + 우측 단일 필터 패널)으로 되돌리면 됨.

---

## 2026-08-02 — 박스스코어 테이블 선수 이름 컬럼 고정(sticky) 해제 + 전체 행 호버로 통일

**배경**: "선수 이름 컬럼은 고정 처리 되어있는데, 고정 처리 해제하고 호버 시에 전체 행이 호버
처리되도록 해줘" 요청. 원인 확인 결과 이름 컬럼(`sticky left-0`)이 가로 스크롤 시 겹치는 콘텐츠를
가리기 위해 자체 불투명 배경(`bg-slate-900`/`bg-slate-950`/`bg-slate-800`)을 갖고 있었는데, 정작
`group-hover:bg-slate-800`가 걸려 있는 `<tr>`(`TableRow`)엔 `group` 클래스가 없어서(공유
`Table.tsx`의 `TableRow`는 `onClick`이 있을 때만 `group` 부여, `BoxScoreTable`은 `onClick` 미사용)
`group-hover`가 애초에 발동한 적이 없었고, 이름 칸의 불투명 배경이 행 전체에 걸린
`hover:bg-white/5`(TableRow 기본 호버)를 가려서 이름 칸만 호버가 안 먹는 것처럼 보였음.

**변경 파일**: `components/game/BoxScoreTable.tsx`(싱글/멀티 공유 컴포넌트)
- 헤더 PLAYER 셀: `sticky left-0 bg-slate-950 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]` 제거
- 바디 이름 셀: `sticky left-0 bg-slate-900 group-hover:bg-slate-800 transition-colors z-10
  shadow-[2px_0_5px_rgba(0,0,0,0.5)]` 제거 — 배경이 없어지면서 `TableRow`의 기본
  `hover:bg-white/5`가 이름 칸까지 자연스럽게 적용됨
- 푸터(TEAM TOTALS) 셀: 동일하게 sticky/shadow 제거, 배경을 다른 합계 셀과 통일(`bg-slate-800` →
  `bg-slate-800/50`, `totalCellClass`와 동일 톤)

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**주의사항**: 가로로 좁은 화면에서 스크롤 시 더 이상 이름 컬럼이 고정되지 않으므로, 오른쪽 스탯
컬럼을 보려고 스크롤하면 선수 이름도 같이 화면 밖으로 밀려남(사용자가 명시적으로 요청한 트레이드
오프).

**롤백 방법**: 3곳의 `sticky left-0` + 배경/그림자/z-index 클래스를 되돌리면 됨(헤더는
`bg-slate-950 z-20`, 바디는 `bg-slate-900 group-hover:bg-slate-800 z-10`, 푸터는 `bg-slate-800
z-20`, 셋 다 `shadow-[2px_0_5px_rgba(0,0,0,0.5)]` 추가).

---

## 2026-08-02 — 로테이션 차트 호버 툴팁에 교체 사유 추가 (정상/파울트러블/탈진/부상/파울아웃/가비지/직접교체)

**배경**: "교체의 이유도 추가해줄 수 있나? 정상교체/파울아웃/부상/가비지 등" 요청. 조사 결과 엔진
내부(`SubstitutionRequest.benchReason`: foul_trouble/shutdown/injury/foul_out/garbage)에는 이미
교체 사유가 구조화되어 있었지만, `RotationData`(로테이션 차트가 쓰는 `{in,out}` 스틴트 배열)엔
반영이 안 돼 있어 어떤 스틴트가 왜 끝났는지 알 수 없었음 — 각 교체 실행 함수가 이미 아는 사유를
`rotationHistory` 세그먼트에 얹어주는 방식으로 해결.

**변경 파일**:
- `types/engine.ts` / `server/src/shared/types/engine.ts` — `RotationOutReason` 유니언 타입
  신규(`'normal'|'foul_trouble'|'shutdown'|'injury'|'foul_out'|'garbage'|'manual'`), `RotationData`
  세그먼트에 `outReason?: RotationOutReason` 추가(optional이라 기존 저장 데이터 호환 — 값만 없을 뿐)
- `services/game/engine/pbp/rotationLogic.ts` / server 미러 — `rotationHistory[...].out =` 를
  설정하는 4개 지점 전부에 `outReason` 스탬프:
  - `checkAndApplyRotation`(정기 로테이션 컷) → `'normal'`
  - `forceSubstitution`(영구 퇴장) → 새 `outReason?: RotationOutReason` 파라미터 추가, 호출부에서
    `req.benchReason`('injury'|'foul_out'|null) 그대로 전달
  - `benchWithOverride`(임시 벤치) → 기존 `reason: 'foul_trouble'|'shutdown'` 파라미터를 그대로 사용
  - `executeGarbageSubstitution`(가비지타임 일괄 교체) → `'garbage'`
- `services/game/engine/pbp/liveEngine.ts` / server 미러 — `executeSubstitution` 라우터에서
  `forceSubstitution` 호출 시 `req.benchReason`을 새로 전달, `applyManualSubstitution`(유저 수동
  교체, 싱글플레이어 라이브 전용)은 `'manual'`로 고정 스탬프
- `components/game/RotationChart.tsx` — `OUT_REASON_LABEL` 한국어 라벨 매핑(정상교체/파울
  트러블/탈진(휴식)/부상/파울아웃/가비지타임/직접교체) 추가, 호버 툴팁을 `"M:SS / +N · 사유"`
  형식으로 확장. `pbpLogs`(스코어 정보) 없이 `rotationData`만 있어도 사유만 표시되도록 툴팁
  노출 조건을 `plusMinus != null || reasonLabel`로 완화

**검증**: 서버 `npx tsc -p tsconfig.json` 30개 에러(기존 베이스라인과 동일, 회귀 없음). 클라이언트
`npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/브라우저 도구
없음) — 사용자가 새 시뮬레이션 결과로 재확인 필요.

**주의사항**: 포제션 마커 기능과 마찬가지로 **오늘 이후 새로 시뮬레이션된 경기부터만** 교체 사유가
표시된다. 기존 저장 게임은 `outReason` 필드가 없어 툴팁에 시간/+/- 만 뜨거나(pbpLogs 있는 경우)
아예 안 뜬다(pbpLogs도 없는 경우) — 소급 적용 대상 아님. `게임 종료 시점에 코트 위였던 마지막
스틴트`는 실제 교체가 일어난 게 아니라 사유를 스탬프하지 않음(의도적).

**롤백 방법**: `RotationOutReason` 타입과 `RotationData.outReason` 필드 제거, 4개 교체 함수의
`outReason` 스탬프 라인 제거, `forceSubstitution` 시그니처에서 `outReason` 파라미터 제거,
`RotationChart.tsx`의 `OUT_REASON_LABEL`/툴팁 확장 부분을 제거하면 됨(client+server 양쪽 모두).

---

## 2026-08-02 — 로테이션 차트 컨테이너 완전 해체 + 참고 예시 구조로 리디자인

**배경**: 직전에 스틴트별 +/- 색상/호버 툴팁을 추가했지만, 여전히 카드형 컨테이너(외곽
`border+rounded-3xl+p-6`, 팀별 `border+rounded-xl` 박스, PLAYER 헤더 컬럼의 배경/보더, 쿼터
배경 음영·세로 구분선)가 남아 있어 참고 예시(텍스트 위주의 얇은 바 디자인)와 차이가 컸음.
컨테이너를 전부 해체하고 바디 폭에 맞춰 늘리며, 얇은 바+텍스트 위주로 개편해달라는 요청.

**변경 파일**: `components/game/RotationChart.tsx`
- 외곽 `border border-slate-800 rounded-3xl p-6 shadow-2xl` 카드, 팀별 `border rounded-xl
  bg-slate-900/40` 박스, `StandardizedHeader`(PLAYER 라벨 + 보더가 있던 헤더), `BackgroundGrid`
  (쿼터 음영 + 세로 구분선) 전부 제거
- 이름 컬럼 로고(`TeamMark`) 제거, 팀 섹션 헤더를 "팀명(좌) + Q1~Q4(우)" 텍스트만 남긴
  `TeamSectionHeader`로 교체
- 이름 컬럼 고정폭을 `140px` → `220px`로 확대(전체 폭이 넓어져도 비율이 어색하지 않도록)
- 선수 행: `h-10` → `h-8`로 축소, 이름 옆 분당 출전시간(mp) 배지 제거(참고 예시처럼 이름만 표시),
  행 구분선을 `border-slate-700/50`(진함) → `border-white/5`(아주 얇게)로 약화
- 스틴트 막대: `top-2 bottom-2 rounded-sm`(두꺼운 박스) → `h-1.5`(얇은 바, 호버 시 `h-2`로만
  살짝 커짐), 그림자/라운딩 제거
- 컴포넌트 최상단에 "로테이션" 타이틀(`text-2xl font-black`) 추가(참고 예시의 "Rotations" 대응)
- 범례(Positive/Even/Negative + 안내문구)는 `justify-center` → 좌측 정렬로 변경(참고 예시와 동일)
- 호버 툴팁(시간/+/-)과 `pbpLogs` 기반 +/- 계산 로직은 직전 커밋 그대로 유지, 스타일링만 변경

**검증**: `npx vite build` 클린 빌드 성공(client 전용, 서버 미변경). 브라우저 실사용 테스트는
못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 이 커밋 이전 버전(카드형 컨테이너 + `BackgroundGrid` + `StandardizedHeader` +
`TeamMark` 로고 포함)으로 `RotationChart.tsx`를 되돌리면 됨.

---

## 2026-08-02 — 로테이션 차트를 스틴트별 +/- 색상 + 호버 툴팁으로 재설계

**배경**: 참고 예시(리그 공식 로테이션 차트) 스크린샷 제시 — 선수가 코트에 있던 구간(스틴트) 막대
색상이 그 스틴트 동안의 +/-(Positive=초록/Even=회색/Negative=빨강)로 표시되고, 막대에 호버하면
"6:24 / +4"처럼 뛴 시간과 +/-가 툴팁으로 뜸. 기존 구현은 막대가 항상 팀 컬러 고정이었고 브라우저
기본 `title` 툴팁(쿼터 분수 표기, 스타일링 불가)만 있었음.

**변경 파일**: `components/game/RotationChart.tsx`(공유 컴포넌트, 싱글/멀티 양쪽에서 재사용) +
`components/game/tabs/GameRotationTab.tsx` + `views/GameResultView.tsx`(싱글) +
`views/multi/season/MultiGamePbpView.tsx`(멀티)
- `RotationChart`에 `pbpLogs?: PbpLog[]` prop 추가 — 제공되면 각 PBP 로그에 이미 찍혀 있는
  `homeScore`/`awayScore` 스냅샷으로 "경과초 → 그 시점 누적 스코어" 타임라인을 만들고
  (`scoreAt(t)`), 각 스틴트의 `[in, out]` 구간 시작/끝 스코어 차이로 그 스틴트의 +/-를 계산
  (`팀 득점차 - 상대 득점차`)
- 막대 색상: `plusMinus > 0` → `#22c55e`(Positive), `=== 0` → `#64748b`(Even), `< 0` → `#ef4444`
  (Negative). `pbpLogs` 미제공 시(하위호환) 기존처럼 팀 컬러로 폴백
- 브라우저 기본 `title` 툴팁 제거, `PlayerRow`에 `hoverIdx` state로 커스텀 툴팁 구현 — 스틴트
  막대에 마우스 올리면 막대 바로 위에 `"M:SS / +N"` 형식으로 표시(참고 예시와 동일 포맷)
  — dark 카드 스타일(`bg-slate-900 border border-slate-700`)
- `pbpLogs` 제공 시에만 하단에 Positive/Even/Negative 범례 + "Hover stint for minutes / +/-"
  안내 문구 추가
- `toGameSeconds()`를 이 파일 로컬 헬퍼로 별도 정의(MultiGamePbpView.tsx의 동일 이름 함수와 완전히
  같은 정의지만, RotationChart는 싱글/멀티 공유 컴포넌트라 독립적으로 둠 — 쿼터=12분 고정 가정은
  기존 PBP 타임스탬프 변환 관례와 동일하게 유지)
- `GameRotationTab`에 `pbpLogs` prop 추가 후 그대로 통과, `GameResultView.tsx`(싱글)는 이미 스코프에
  있던 `pbpLogs` 변수를 그대로 전달, `MultiGamePbpView.tsx`(멀티)는 `gameData.events ?? []` 전달

**검증**: `npx vite build` 클린 빌드 성공(client 전용 변경, 서버 엔진 미변경이라 fly 배포 불필요).
브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**주의사항**: +/- 계산은 PBP 로그의 `homeScore`/`awayScore` 스냅샷 정밀도(이벤트 단위)에 의존 —
과거 저장된 게임도 이 필드는 이미 있었으므로(직전 포제션 마커 작업과 달리 신규 필드가 아님) 소급
적용 없이 기존 게임에서도 바로 동작한다.

**롤백 방법**: `RotationChart.tsx`를 이전 버전(팀 컬러 고정 + `title` 속성 툴팁)으로 되돌리고,
`GameRotationTab`/`GameResultView.tsx`/`MultiGamePbpView.tsx`에서 `pbpLogs` prop 전달을 제거하면 됨.

---

## 2026-08-02 — 포제션 단위 마커 시스템 구축 (PbpLog 스키마 확장 + 인사이트 3단계)

**배경**: 인사이트 패널 논의 3단계(포제션별 득점/무득점/턴오버/타임아웃 점·대시 마커)를 실제로
구현. 사전 조사 결과, 포제션 경계/결과(`PossessionResult.type`, `reboundType`)는 엔진 내부엔
이미 구조화돼 있지만 저장되는 `PbpLog`엔 반영이 안 돼 있어(`type:'info'` + 한국어 텍스트로만
구분) 클라이언트에서 신뢰성 있게 재구성이 불가능했음 — `stepPossession()`의
`retainPossession`(오펜시브 리바운드/테크니컬·플래그런트 파울만 공격권 유지) 판정 및 각 분기의
자유투 결과를 그대로 로그에 얹는 방식으로 해결.

**변경 파일**:
- `types/engine.ts` / `server/src/shared/types/engine.ts` — `PbpLog.type`에 `'timeout'` 추가,
  `isPossessionEnd?: boolean` / `possessionOutcome?: 'scoring'|'nonScoring'|'turnover'` /
  `possessionTeamId?: string`(블록·수비파울처럼 `teamId`가 수비팀으로 찍히는 로그를 위해 실제
  공격팀을 별도로 기록) 추가 — 전부 optional이라 기존 저장 데이터는 그대로 호환(값이 없을 뿐)
- `services/game/engine/pbp/statsMappers.ts` / `server/src/shared/engine/pbp/statsMappers.ts`
  (client+server 미러) — `addLog()`에 `possessionOutcome`/`possessionTeamId` 파라미터 추가.
  각 분기에서 스탬프:
  - `score` → 항상 `scoring`
  - `miss`(block 포함) → `reboundType==='off'`(오펜시브 리바운드)면 스탬프 안 함(포제션 계속),
    아니면 `nonScoring`. block 로그는 `teamId`가 수비팀이라 `possessionTeamId=offTeam.id`로 보정
  - `turnover`, `offensiveFoul`, `shotClockViolation` → `turnover`
  - `foul`(비슈팅) → 보너스 자유투 있으면 스탬프 안 함(뒤이은 자유투 로그가 진짜 종료 지점),
    없으면 이 파울 로그 자체가 `nonScoring`. 역시 `possessionTeamId=offTeam.id`로 보정
  - `freethrow`(보너스/슈팅파울) → 자유투 성공 개수 기준 `scoring`/`nonScoring`
  - `technicalFoul`/`flagrantFoul` → 스탬프 안 함(공격권 유지, `retainPossession`과 동일 기준)
- `services/game/engine/pbp/liveEngine.ts` / server 미러 — `applyTimeout()`의 로그 타입을
  `'info'` → `'timeout'`으로 변경(기존엔 `timeoutsLeft` 필드 유무로만 구분 가능했음)
- `views/LiveGameView.tsx`, `views/multi/season/MultiGamePbpView.tsx`,
  `components/game/tabs/GamePbpTab.tsx` — PBP 피드의 `isInfo`/`isImportant` 판정에 `'timeout'`
  타입도 포함(타입 변경으로 기존 'info' 스타일링이 깨지지 않도록, 싱글/멀티 공통 엔진 타입이라
  양쪽 다 수정)
- `views/multi/season/MultiGamePbpView.tsx`(`GameInsightsPanel`) — `possessionMarkers` useMemo
  신규 추가(원정/홈 각각 `{frac, kind}` 배열), `MarkerRow` 컴포넌트로 마진·승률 차트 위(원정)/
  아래(홈)에 색상 점·대시 행 렌더링(초록=득점/회색=무득점/빨강=턴오버, 흰 점=타임아웃). 범례에도
  4개 항목 추가. `isPossessionEnd` 필드가 없는 구버전 저장 게임은 `possessionMarkers`가 자연스럽게
  빈 배열이 되어 이 행 자체가 렌더링되지 않음(소급 적용 없음, 기존 short_code 기능과 동일 원칙)

**검증**: 서버 `npx tsc -p tsconfig.json` 30개 에러(기존 베이스라인과 동일, 회귀 없음). 클라이언트
`npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/브라우저 도구
없음) — 사용자가 실제 새 시뮬레이션 결과로 재확인 필요.

**주의사항**: 이 기능은 **오늘 이후 새로 시뮬레이션된 경기부터만** 마커가 표시된다. 기존에 저장된
게임(이 커밋 이전 데이터)은 `isPossessionEnd`/`possessionOutcome` 필드가 없어 마커 행이 안 보이는
게 정상 — 소급 적용 대상 아님.

**롤백 방법**: `PbpLog` 타입의 4개 신규 필드(`timeout` type, `isPossessionEnd`,
`possessionOutcome`, `possessionTeamId`) 제거, `addLog()` 시그니처와 각 호출부 스탬프 인자 제거,
`applyTimeout()` 로그 타입을 `'info'`로 되돌리기, `isInfo`/`isImportant` 판정에서 `'timeout'` 제거,
`GameInsightsPanel`의 `possessionMarkers`/`MarkerRow`/관련 JSX 제거하면 됨(client+server 양쪽 모두).

---

## 2026-08-02 — 인사이트 차트 승률(WP) 라인도 영역 채우기 추가

**배경**: 마진 라인만 area(fill)로 채워져 있고 승률 라인은 stroke만 있어 대비가 부족하다는 요청 —
승률 그래프도 내부가 채워지도록 디자인 수정.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- `toAreaPath(pts, baseY)` 헬퍼 추가(기존 `marginArea` 계산 로직을 범용화) — margin/승률 둘 다
  같은 함수로 area path 생성
- `wpArea` 신규 계산(`toAreaPath(steppedWpPts, MID)`), `<path d={wpArea} fill="#38bdf8"
  fillOpacity="0.12" stroke="none" />`를 마진 area보다 먼저(아래 레이어) 렌더링해 마진 area가
  시각적으로 덮이지 않고 위에 겹쳐 보이도록 함(marginArea가 0.15로 더 진해 원래도 위에 있었음)

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `wpArea` 계산과 `<path d={wpArea} .../>` 렌더링을 제거하면 됨.

---

## 2026-08-02 — 인사이트 차트 자유투 연속 시도 동시각 스텝 병합

**배경**: 계단형 보간 적용 후 사용자가 참고 예시와 비교 스크린샷을 보내며 "이번엔 전부 뾰족한
형태로만 바뀌었다, 참고 예시는 플랫 구간과 뾰족한 구간이 섞여 있는데 이 차이가 뭐냐"고 질문.
원인은 두 갈래:
1. **데이터 자체의 차이(정상)**: 계단형 차트의 플랫/뾰족 비율은 실제 그 경기의 득점 패턴을
   그대로 반영한다 — 자주 주고받는 접전(리드 체인지가 잦은 경기)은 톱니처럼 계속 뾰족하고,
   한쪽이 길게 몰아치거나 무득점 구간이 긴 경기는 넓은 플랫 구간이 생긴다. 이건 버그가 아니라
   계단형 차트의 정상 동작.
2. **자유투 연속 시도로 인한 인위적 뾰족함(수정 대상)**: 자유투는 게임 시계가 흐르지 않는 상태에서
   연달아 시도되므로, 2개(또는 3개)의 자유투 성공이 `toGameSeconds()` 기준 완전히 같은 경과초에
   찍힌다. 기존 로직은 이걸 각각 별도 스텝으로 찍어서, 사실 한 포제션의 결과인데 계단이 겹쳐
   필요 이상으로 뾰족하게 보였음(4쿼터 보너스 상황처럼 자유투가 몰리는 구간일수록 더 심함).

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- `scoreEvents` useMemo — 새 로그의 `elapsedSec`가 배열의 마지막 항목과 정확히 같으면(자유투
  연속 시도 등, 게임 시계가 그대로인 채 점수만 바뀐 경우) 새 포인트를 추가하는 대신 마지막
  항목의 `hScore`/`aScore`를 갱신 — 같은 순간의 여러 득점을 하나의 스텝으로 병합

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**주의사항**: 이 수정은 "인위적으로 부풀려진" 뾰족함만 줄여줄 뿐, 게임 자체가 접전이라 실제로
잦은 리드 체인지가 있었다면 여전히 톱니 모양이 많이 남는 게 정상이다(참고 예시도 경기에 따라
뾰족한 구간과 플랫한 구간의 비율이 다름).

**롤백 방법**: `scoreEvents`의 `if (lastEv.elapsedSec === elapsedSec) {...} else {...}` 분기를
제거하고 항상 `evs.push(...)`만 하도록 되돌리면 됨.

---

## 2026-08-02 — 인사이트 차트를 계단형(step) 보간으로 변경 (플랫 구간 복원)

**배경**: 직전 커밋(득점 이벤트 단위 해상도 상향) 이후 스크린샷 확인 결과, 그래프가 플랫 구간
없이 전부 뾰족한 모양으로만 나옴. 원인: 데이터 포인트가 "득점이 바뀐 순간"에만 찍히는데, 두
점을 곧장 대각선으로 이어버리면 원래 플랫해야 할 무득점 구간(다음 득점까지 시간이 걸리는 구간)도
서서히 기울어지는 것처럼 보임 — 실제로는 무득점 구간엔 마진/승률이 전혀 안 변하다가 득점 순간에만
값이 바뀌므로, 시각적으로는 "플랫 → 수직 점프 → 플랫"이 정확한 모양(계단형/스텝 차트).

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- `toStepPts()` 헬퍼 추가 — 각 데이터 포인트 직전에 "직전 포인트의 y값 + 현재 x값"인 중간점을
  하나씩 끼워 넣어 step-before 형태로 변환
- `marginPts`/`wpPts`(득점 이벤트 좌표)를 각각 `toStepPts()`로 감싸 `steppedMarginPts`/`steppedWpPts`
  생성, `marginPath`/`wpPath`/`marginArea` 전부 이 스텝 버전 포인트로 계산하도록 교체

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `marginPath`/`wpPath`/`marginArea` 계산에서 `steppedMarginPts`/`steppedWpPts`를
다시 `marginPts`/`wpPts`(스텝 변환 없는 원본)로 되돌리면 됨.

---

## 2026-08-02 — 인사이트 차트 데이터 해상도를 분 단위 → 득점 이벤트 단위로 상향

**배경**: 사용자가 실제 화면 스크린샷을 보내며 참고 예시보다 그래프의 변동(지그재그)이 적다고
지적. 원인은 그래프 데이터가 "분 단위 스냅샷"(`for m=0..totalMinutes`)이었던 것 — 한 분 안에서
여러 번 득점이 나도 그 분의 마지막 상태 하나로만 뭉개져서, 실제 포제션 단위로 촘촘히 움직이는
참고 예시보다 선이 훨씬 완만해 보였음.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- 분 단위 `snapshots` useMemo 제거
- 호버 툴팁용으로 이미 만들어뒀던 `scoreEvents`(득점/자유투 발생 시점마다의 누적 스코어, 분 단위보다
  훨씬 촘촘함)를 그래프 데이터 포인트로도 그대로 재사용 — `chartPoints` useMemo 신규 추가:
  `scoreEvents` 각 항목을 `{elapsedMin, margin, wp}`로 변환하고, 마지막 득점 이후 경기 종료
  시점까지 라인을 이어주는 마무리 포인트 하나를 추가(`totalMinutes` 지점)
- `marginScale`/`marginPts`/`wpPts` 계산을 전부 `snapshots` → `chartPoints` 기반으로 교체
- 호버 툴팁 로직(`hoverInfo`)은 원래도 `scoreEvents`를 썼으므로 변경 없음

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `chartPoints`를 제거하고 이전의 분 단위 `snapshots` useMemo(`for m=0..totalMinutes`
루프)를 되살려 `marginPts`/`wpPts`/`marginScale`이 다시 `snapshots`를 참조하도록 되돌리면 됨.

---

## 2026-08-02 — 인사이트 탭 차트 전체 폭 확장 + 호버 툴팁(쿼터/스코어/마진/승률) 추가

**배경**: (1) 인사이트 패널이 `max-w-4xl mx-auto`로 좁게 고정돼 있어 탭 바디 전체 폭을 못 채움.
(2) 참고 예시 이미지처럼 그래프에 마우스를 올리면 해당 시점의 쿼터/시계, 스코어, 마진, 승률이
뜨는 툴팁 구현 가능 여부 문의 — 기존에 그려두는 분 단위 스냅샷(`snapshots`)보다 세밀한 "득점
시점마다의 누적 스코어" 배열만 추가하면 가능해서 바로 구현.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- 패널 최상위 컨테이너 `max-w-4xl mx-auto` → `w-full` (탭 바디 폭 그대로 사용)
- `secondsToClock()` 헬퍼 추가 — `toGameSeconds()`의 역변환(경과초 → "Q{n} {mm:ss}"), 동일하게
  쿼터=12분 단순화를 유지해 스케일을 맞춤
- `scoreEvents` useMemo 추가 — 득점/자유투 로그가 발생할 때마다의 누적 홈/원정 스코어를 기록
  (분 단위 `snapshots`보다 세밀해 호버 시점의 정확한 "그 순간까지의 스코어"를 조회하는 용도)
- `hoverFrac`(마우스 x 비율) state + `chartRef`/`onMouseMove`/`onMouseLeave` 추가, `hoverInfo`
  useMemo로 호버 위치의 쿼터/시계(위치 자체로 계산)와 누적 스코어·마진·승률(`scoreEvents`에서
  해당 시점 이전 마지막 값 조회)을 파생
- 차트에 호버 시 세로 가이드라인(`<line>`)과 툴팁 박스(쿼터/시계, 원정-홈 스코어, 마진 리더+점수차,
  승률) 렌더링 추가 — 툴팁은 좌우 15~85% 범위로 clamp해 차트 밖으로 안 나가게 함

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**주의사항**: 툴팁의 쿼터/시계 표시는 마우스 x 위치를 분 단위 스케일로 역산한 근사치라 실제
초 단위 정밀도는 아님(다만 스코어/마진은 실제 득점 이벤트 기준 정확한 누적값).

**롤백 방법**: `w-full`을 `max-w-4xl mx-auto`로, `scoreEvents`/`hoverFrac`/`chartRef`/`hoverInfo`와
관련 JSX(세로 가이드라인, 툴팁 박스)를 제거하면 됨.

---

## 2026-08-02 — 인사이트 탭 마진/승률 차트를 각진(스텝형) 라인으로 변경

**배경**: 참고 예시 이미지의 마진·승률 그래프는 각진(직선 연결) 라인인데, 방금 만든 구현은
`CompactWPGraph`가 쓰는 `getSmoothPath`(베지어 곡선 보간)를 그대로 재사용해 부드러운 곡선으로
그려졌음. 참고 예시처럼 각진 형태로 바꿔달라는 요청.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- `GameInsightsPanel` 내부에 `toLinearPath()` 헬퍼 추가(각 데이터 포인트를 `L`(직선)로만 연결,
  베지어 `C` 커맨드 없음) — `marginPath`/`wpPath`/`marginArea` 전부 `getSmoothPath` 대신 이걸로 교체
- 라인 `<path>` 두 개의 `strokeLinejoin`을 `round`(둥근 모서리, 각짐을 다시 뭉개버림) → `miter`(뾰족한
  기본 모서리)로 변경해 꺾이는 지점이 시각적으로도 각지게 보이도록 함
- `CompactWPGraph`(라이브 사이드바 그래프)는 손대지 않음 — 이번 요청은 인사이트 탭 차트 한정

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `marginPath`/`wpPath`를 다시 `getSmoothPath(...)`로, `strokeLinejoin`을 `round`로
되돌리면 됨(`marginArea`는 원래의 `marginPath.slice(marginPath.indexOf('C'))` 방식으로).

---

## 2026-08-02 — 멀티플레이어 "인사이트" 탭 추가 (ORTG/DRTG/NRTG/Pace/AVG POSS + 마진·승률 차트)

**배경**: 사용자가 실제 리그 공식 스코어보드의 "Insights" 패널(팀별 ORTG/DRTG/NRTG/Pace/AVG POSS
통계 + 마진·승률 대칭 그래프 + 포제션별 득점/턴오버/타임아웃 점 마커)을 참고 예시로 제시, 우리
서비스에 적용 가능한지 논의. 조사 결과 포제션 경계/결과(득점·무득점·턴오버, 오프/디펜스 리바운드
구분)는 엔진 내부(`PossessionResult`)에는 있지만 저장되는 `PbpLog`엔 구조화되어 있지 않고
`type:'info'` + 한국어 텍스트로만 남아 있어(텍스트 파싱 없인 신뢰성 있게 재구성 불가), 3단계
전체(점 마커)는 `PbpLog` 스키마 확장(+client/server 미러 반영)이 필요한 별도 작업으로 분리하고,
이번엔 엔진 변경이 필요 없는 1·2단계(통계 행 + 마진·승률 차트)만 먼저 구현하기로 사용자와 합의.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- 신규 컴포넌트 `GameInsightsPanel` 추가 (TeamStatsCompare 다음, Main 컴포넌트 이전)
  - 포제션 추정: 표준 근사식 `POSS ≈ FGA − OREB + TOV + 0.4×FTA` (팀별, OREB는 `home_box`/`away_box`
    합산으로 산출 — 신규 `homeOreb`/`awayOreb` useMemo 추가)
  - `ORTG = 100×PTS/avgPOSS`, `DRTG`는 상대 팀 ORTG를 그대로 사용(대칭), `NRTG = ORTG−DRTG`
  - `Pace = avgPOSS × (48/totalMinutes)`, `AVG POSS(초) = totalMinutes×60/팀별POSS`
  - `totalMinutes = maxQuarter × 12`로 단순화 — 이 파일 전역의 기존 `toGameSeconds()`(쿼터=항상
    720초로 가정, 연장도 예외 없음)와 스케일을 맞추기 위해 의도적으로 동일한 단순화 채택(연장을
    실제 5분으로 정확히 계산하면 이벤트 타임스탬프와 축 스케일이 어긋남)
  - 마진+승률 차트: `CompactWPGraph`와 동일한 분 단위 누적 스냅샷 방식으로 러닝 마진과
    `calculateWinProbability()` 승률을 재계산, 마진(에메랄드 area+line)과 승률(스카이 line)을
    하나의 SVG에 함께 그리되 마진은 자동 스케일(±10 이상, 5 단위 반올림) 축을 사용
  - 쿼터 경계 세로 점선 + Q1~Q4/OT 라벨 오버레이 포함
- `finalTab` 상태 유니언에 `'insights'` 추가, 탭 바에 "인사이트" 탭 버튼 추가, 탭 컨텐츠에
  `<GameInsightsPanel>` 연결

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**주의사항**: 포제션 추정치이므로 실제 NBA 스탯사이트와 소수점 단위까지 정확히 일치하진 않음.
연장전 있는 경기는 위에서 설명한 단순화(연장=12분 취급)로 Pace/AVG POSS가 근사값보다 더 부정확할
수 있음(연장 있는 게임은 드물어 영향 적음). 포제션별 점/대시 마커(3단계)는 아직 미구현 — 추후
`PbpLog`에 `isPossessionEnd`/`reboundType` 필드 추가 + 타임아웃 전용 `type:'timeout'` 부여가
선행돼야 함(client+server 미러, fly 배포 필요).

**롤백 방법**: `GameInsightsPanel` 컴포넌트, `finalTab` 유니언의 `'insights'`, 탭 바/탭 컨텐츠의
"인사이트" 항목, `homeOreb`/`awayOreb` useMemo를 모두 제거하면 됨.

---

## 2026-08-02 — 스코어버그 헤더 팀 로고 위치를 최외곽으로 이동

**배경**: 직전 커밋에서 참고 예시대로 로고를 팀명-점수 사이(안쪽)에 배치했는데, 사용자가 로고
위치만 다시 최외곽으로(원정=왼쪽 끝, 홈=오른쪽 끝) 옮겨달라고 요청. 이번 배치가 첫 리디자인 때의
순서(로고가 바깥쪽)로 돌아간 것과 같음.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- Away 그룹 순서: [팀명][로고][점수] → [로고][팀명][점수] (로고를 그룹의 첫 자식으로 이동)
- Home 그룹 순서: [점수][로고][팀명] → [점수][팀명][로고] (로고를 그룹의 마지막 자식으로 이동)
- `justify-start`/`justify-end`, gap 값 등 나머지 레이아웃/간격은 그대로 유지

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: Away를 [팀명][로고][점수], Home을 [점수][로고][팀명] 순서로 되돌리면 됨.

---

## 2026-08-02 — 스코어버그 헤더 참고 예시 구조 적용 (grid 기반 진짜 중앙 정렬 + 순서 재배치)

**배경**: 사용자가 제공한 실제 리그 공식 스코어보드 스크린샷을 참고 예시로 제시하며 "구조를 그대로
적용"해달라는 요청. 동시에 직전까지 미해결이던 두 문제(Final-쿼터표 간격 미개선, 중앙 정렬 어긋남)의
근본 원인도 이번에 같이 해결됨:
1. **간격 미개선**: 쿼터표 위 "스코어링 런 인디케이터"(`invisible`로 항상 자리만 예약하던 줄)가
   `showBox`(종료된 경기)에서도 계속 렌더링되고 있었음 — 라이브 전용으로 필요한 줄인데 항상
   렌더링해 Final과 쿼터표 사이에 안 보이는 한 줄 높이만큼 여백이 늘 껴 있었음.
2. **중앙 정렬 어긋남**: 이전 구조는 `flex items-center gap-*`로 3그룹(원정/센터/홈)을 한 행에
   늘어놓고 그 행 전체를 `flex-col items-center`로 감싸 정렬했는데, 이 방식은 "행 전체"만
   가운데 정렬할 뿐 원정/홈 팀명 길이가 다르면(예: "인디애나 레이서스" vs "오클라호마시티 볼트")
   행 자체가 비대칭이 되어 Final이 실제 헤더 정중앙에서 벗어남. `grid-cols-[1fr_auto_1fr]`로
   바꾸면 가운데 `auto` 트랙은 팀명 길이와 무관하게 항상 grid의 기하학적 정중앙에 위치.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- 헤더 컨테이너: `flex flex-col items-center` 3그룹-행 구조 → `grid grid-cols-[1fr_auto_1fr] items-center
  gap-8 sm:gap-14`로 전환. Center(Final+쿼터표)를 grid의 가운데 `auto` 컬럼에 두어 원정/홈 폭이
  달라도 항상 정중앙 유지
- Away/Home 그룹 내부 요소 순서를 참고 예시와 동일하게 재배치: 원정 = [팀명][로고][점수](`justify-start`로
  왼쪽 바깥쪽 끝에 붙임), 홈 = [점수][로고][팀명](`justify-end`로 오른쪽 바깥쪽 끝에 붙임) — 기존엔
  로고가 팀명에 붙어 있고(원정: 로고-팀명-점수, 홈: 점수-팀명-로고) 참고 예시(로고가 항상 점수 옆)와 순서가 달랐음
  - 이 배치가 자연스럽게 "각 팀 점수 양측으로 더 벌려" 요청도 함께 만족(1fr 컬럼 폭 대부분이 그룹과
    중앙 사이 여백이 됨)
- 쿼터별 득점 테이블(`QuarterScores`)을 Center 컬럼 안, Final 바로 아래에 포함 — 러닝 인디케이터는
  `{!showBox && (...)}`로 게이팅해 종료된 경기에서는 아예 렌더링하지 않음(간격 버그의 직접 원인 제거)
- `QuarterScores` 컴포넌트: 카드형 외곽 테두리(`rounded-lg border`) 제거, 헤더 밑줄 + 원정행 밑줄만
  남기는 미니멀한 표로 재설계(참고 예시 스타일). 좌상단 코너 칸은 빈 칸(기존 "쿼터별" 라벨 텍스트 삭제).
  `<table>` 자체가 기본적으로 shrink-to-fit이라 별도 `inline-block` 래퍼 불필요해져 제거, `mx-auto`만 유지
- 헤더 패딩 `px-6` → `px-10`, 3그룹 `gap-14 sm:gap-24` → `gap-8 sm:gap-14`(grid 컬럼 자체가 넓은
  여백을 만들어주므로 gap 값 자체는 줄여도 실제 간격은 오히려 넓어짐)

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 헤더 컨테이너를 다시 `flex flex-col items-center gap-2` + 내부 `flex items-center
gap-14 sm:gap-24` 3그룹 구조로, Away/Home 순서를 로고-팀명-점수/점수-팀명-로고로, `QuarterScores`를
카드형 테두리 버전으로 되돌리면 됨.

---

## 2026-08-02 — 점수-팀명 간격 재수정 (고정폭 제거로 드러난 gap-2 과소 문제)

**배경**: 직전 커밋에서 `w-[4ch]` 고정폭을 제거하고 나니, 스크린샷 확인 결과 팀명과 점수(`94`/
`114`)가 거의 붙어버림(예: "레이서스94"). 원인: `w-[4ch]`가 만들던 보이지 않는 여백이 실은
"팀명-점수 간격이 안 줄어드는 것처럼 보이게 하는 방해 요소"였을 뿐 아니라, 동시에 실질적인
시각적 여백 대부분을 담당하고 있었음. 그 고정폭을 걷어내자 남은 건 순수 `gap-2`(8px)뿐인데,
이름은 `text-2xl`, 점수는 `text-6xl`(약 60px 안팎)이라 8px는 이 폰트 크기 조합에서 사실상
안 보이는 수준 — 고정폭을 없앤 것 자체는 맞는 방향이었지만, 그만큼 `gap` 값을 함께 올려줬어야
했는데 이전 커밋에서 `gap-2`를 그대로 둔 게 원인.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- Away/Home 팀명↔점수 컨테이너 `gap-2` → `gap-4`(16px, `text-6xl` 점수 폰트 크기에 맞는 여백으로 상향)

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 두 곳의 `gap-4`를 `gap-2`로 되돌리면 됨(단, 그러면 직전 스크린샷처럼 다시 붙어보이는
문제가 재발함 — `w-[4ch]` 없이 롤백하지 말 것).

---

## 2026-08-02 — 점수 스팬 고정폭(`w-[4ch]`)이 gap 조정을 무력화하던 문제 수정

**배경**: 직전 커밋에서 gap 값들(`gap-6→gap-2`, `gap-4→gap-2`, `gap-10 sm:gap-20→gap-14 sm:gap-24`)을
바꿨는데도 사용자가 스크린샷으로 "하나도 안 바뀌었다"고 재확인. 원인 분석 결과, 점수
`<span>`에 걸려 있던 `w-[4ch] text-right`(원정)/`w-[4ch] text-left`(홈)가 진범이었음 —
점수 박스를 4자리 고정폭으로 잡고 텍스트 정렬만 하다 보니, "94"처럼 2~3자리 숫자일 땐 박스
안쪽에 안 보이는 여백이 남고, 그 여백이 gap 조정폭보다 훨씬 커서 gap을 줄이거나 늘려도 시각적
차이가 거의 안 드러났음.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- 원정/홈 점수 `<span>`에서 `w-[4ch] text-right`/`w-[4ch] text-left` 제거 — 이제 점수는
  고정폭 박스 없이 자연스러운 너비를 차지하고, flex 순서(이름→점수 / 점수→이름)로만 배치가
  결정되므로 형제 요소 간 `gap` 값이 그대로 시각적 간격이 됨

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**참고**: 라이브(진행 중) 화면에서는 점수가 실시간으로 갱신되며 자릿수가 2→3자리로 바뀔 때
고정폭이 없어져 레이아웃이 미세하게 흔들릴 수 있음 — 허용 가능한 트레이드오프로 판단(고정폭이
간격 버그의 직접 원인이라 되살리지 않음).

**롤백 방법**: 두 점수 `<span>`에 `w-[4ch] text-right`/`w-[4ch] text-left`를 다시 추가하면 됨.

---

## 2026-08-02 — 스코어버그 헤더 간격 재조정 (수직 압축 + 3분할 좌우 간격 확대)

**배경**: 스크린샷 재확인 결과 헤더가 여전히 어색함 — "Final"과 쿼터별 득점 테이블 사이 수직
간격이 너무 벌어져 있고, 팀명과 점수 사이 간격도 불필요하게 넓었으며, 반대로 [팀명+점수]/
[Final+쿼터테이블]/[점수+팀명] 세 그룹 사이의 좌우 간격은 더 벌어져야 한다는 피드백.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- 팀명/점수 행 + 쿼터별 테이블을 감싸는 최상위 `flex flex-col items-center` 컨테이너: `gap-6` →
  `gap-2` (Final 아래 쿼터 테이블과의 수직 간격 압축)
- Away/Home 블록 내부(팀명+배지 ↔ 점수) `gap-4` → `gap-2` (팀명-점수 간격 압축)
- 3분할([팀명/점수] / [Final+쿼터테이블] / [점수/팀명]) 컨테이너 `gap-10 sm:gap-20` →
  `gap-14 sm:gap-24` (좌우 간격 확대)

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 위 세 gap 값을 각각 `gap-6`/`gap-4`/`gap-10 sm:gap-20`으로 되돌리면 됨.

---

## 2026-08-02 — 쿼터별 득점 테이블 "쿼터별" 라벨 칸 비정상 확장 버그 수정

**배경**: 직전 커밋에서 헤더에 넣은 쿼터별 득점 테이블 스크린샷 확인 결과, "쿼터별" 라벨 칸만
비정상적으로 넓게(테이블 폭의 절반 가까이) 벌어져 있었음. 원인: `<table className="w-full ...">`로
테이블을 억지로 늘려놓았는데, 폭 지정이 없는 칸("쿼터별" `<th>`만 유일하게 `w-*` 클래스 없음)이
`table-layout: auto`에서 남는 여유 폭을 전부 흡수해버림(쿼터 1~4, T 칸은 `w-10`으로 고정폭이라
안 늘어남). 헤더 쪽은 원래 테이블을 컨테이너 폭에 맞춰 늘일 필요가 없었으므로(내용 크기만큼만
차지해도 됨) `w-full` 자체가 근본 원인.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- `QuarterScores`에 `fullWidth?: boolean` prop 추가(기본 false) — false면 바깥 wrapper
  `inline-block`+`<table>`에 `w-full` 미적용(내용 크기만큼만 차지), true면 기존처럼 `w-full`로
  꽉 채움
- "쿼터별" `<th>`에 `w-20` 고정폭 추가(라벨 칸이 폭 지정 없는 유일한 칸이라 남는 공간을 흡수하던
  문제의 직접 원인 제거)
- 헤더(종료된 경기) 쪽 호출부: `fullWidth` 미전달(기본값) + 감싸던 `<div className="w-full max-w-md">`
  제거 — 부모가 이미 `flex flex-col items-center`라 내용 크기 그대로 둬도 자동으로 가운데 정렬됨
- 라이브 우측 사이드바 호출부: `fullWidth` prop 추가해 기존처럼 패널 폭에 꽉 채우는 모습 그대로 유지
  (이쪽은 원래도 문제 지적 없었음 — 회귀 방지)

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: `fullWidth` prop 제거하고 `QuarterScores` 내부를 항상 `w-full`(테이블/wrapper 둘 다)로
되돌리고, "쿼터별" `<th>`의 `w-20`을 제거하고, 헤더 호출부를 다시 `<div className="w-full max-w-md">`로 감싸면 됨.

---

## 2026-08-02 — 멀티플레이어 스코어버그 헤더 재설계 (센터 정렬 + 쿼터별 테이블 아웃라인)

**배경**: 직전 커밋(헤더/탭 그룹 개편)의 결과물이 스크린샷 기준으로 부적절하다는 피드백 — 헤더가
얇고, 양 팀 점수가 중앙에 비해 지나치게 붙어 있으며(원인: `grid-cols-[1fr_auto_1fr]` +
`justify-end`/`justify-start`가 팀 정보를 오히려 중앙 쪽으로 밀착시킴), 쿼터별 득점 테이블에
아웃라인이 없어 밋밋하고, 헤더 팀명/점수 행과 쿼터 테이블이 서로 다른 정렬 기준(하나는 전체 폭
그리드, 하나는 `max-w-md mx-auto`)이라 그룹으로서 정렬이 안 맞았음.

**변경 파일**: `views/multi/season/MultiGamePbpView.tsx`
- 헤더를 `grid-cols-[1fr_auto_1fr]`(전체 폭 스트레치) 대신 `flex flex-col items-center gap-6`
  블록으로 재구성 — 팀명/점수 행(`flex items-center gap-10 sm:gap-20`)과 쿼터별 테이블(`showBox`일
  때만, `w-full max-w-md`)이 같은 중앙 정렬 컨테이너 안에 있어 항상 함께 가운데 정렬됨
- 헤더 패딩 `py-5 px-[10%]` → `py-10 px-6`(높이 증가), 점수 폰트 `text-5xl` → `text-6xl`,
  팀명 폰트 `text-xl` → `text-2xl`, 배지 `w-10 h-10` → `w-11 h-11`, 팀 간 간격 `gap-10 sm:gap-20`으로
  명시적 확대(기존엔 1fr 컬럼 폭 전체 + `justify-end`/`justify-start`에 의존해 실제로는 중앙에
  붙어 있었음)
- `QuarterScores` 컴포넌트: `rounded-lg border border-slate-700 overflow-hidden` 아웃라인 카드로
  변경, 셀 패딩 `px-1.5 py-1` → `px-3 py-2`로 확대, 헤더/바디 구분선을 `border-collapse` 기반
  격자로 정리(기존엔 얇은 `border-slate-700/60` 줄만 있고 외곽 테두리가 없었음)
- 라이브 화면 우측 패널의 `QuarterScores` 호출부(기존 그대로 유지, 헤더용과 별개)는 아웃라인
  추가로 패널 가장자리에 바로 붙으면 어색해져 `<div className="p-2">`로 감싸 여백 추가

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음) — 사용자가 캡처로 재확인 필요.

**롤백 방법**: 직전 커밋("멀티플레이어 종료 경기 헤더/탭 그룹 개편 + 쿼터별 득점 테이블 추가")의
Before/After 블록으로 되돌리면 헤더 구조 자체는 복원되나, 이번 항목의 아웃라인/간격 변경은 이
항목의 Before(직전 항목의 After와 동일)로 되돌려야 함.

---

## 2026-08-02 — 멀티플레이어 종료 경기 헤더/탭 그룹 개편 + 쿼터별 득점 테이블 추가

**배경**: 멀티플레이어 박스스코어 UI 개편 연장선 — (1) "경기기록/샷차트/PBP/로테이션" 탭 그룹을
중앙 정렬, (2) 탭 그룹 바로 아래 보이던 팀 컬러 구분선(각 BoxScoreTable 상단의 얇은 컬러 바) 제거,
(3) 스코어버그 헤더의 "최종 결과" 텍스트 제거, (4) 대신 헤더 아래에 쿼터별 득점 테이블 추가.
전부 종료된 경기(`showBox`/멀티플레이어 전용) 범위 — 싱글플레이어(`GameResultView.tsx`)는 별도
컴포넌트라 영향 없고, `BoxScoreTable`의 팀 컬러 구분선 제거는 `standalone` prop으로 게이팅해
싱글플레이어 쪽 렌더링은 그대로 유지.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx`
  - 헤더 중앙 컬럼: `isLive ? <LIVE 배지/> : <span>최종 결과</span>` → `{isLive && <LIVE 배지/>}` (else 분기 삭제)
  - 헤더(스코어버그) 바로 아래, `showBox`일 때만 기존 `QuarterScores` 컴포넌트를 재사용해
    `max-w-md mx-auto`로 중앙 정렬된 쿼터별 득점 테이블 추가(라이브 우측 패널에서 쓰던 것과 동일 컴포넌트)
  - 탭 그룹 컨테이너 className에 `justify-center` 추가(기존 좌측 정렬 → 중앙 정렬)
- `components/game/BoxScoreTable.tsx` — "Team Color Top Border"(`teamColor` 배경의 `h-0.5` 절대
  위치 바)를 `{!standalone && <div .../>}`로 게이팅. `standalone`(멀티플레이어)에서만 제거, 기본
  (싱글플레이어 상하 배치)에서는 그대로 유지.

**Before**:
```tsx
// MultiGamePbpView.tsx 헤더 중앙
{isLive ? (
    <span className="flex items-center gap-1 text-xs font-bold text-red-400">
        <Circle size={6} className="fill-red-400 animate-pulse" />
        LIVE
    </span>
) : (
    <span className="text-xs text-slate-500 ko-normal">최종 결과</span>
)}

// 탭 그룹
<div className="shrink-0 border-b border-slate-800 flex items-center gap-6 px-6 h-11 bg-slate-900">

// BoxScoreTable.tsx
<div className="absolute top-0 left-0 right-0 h-0.5 z-10" style={{ backgroundColor: teamColor }}></div>
```

**After**:
```tsx
// MultiGamePbpView.tsx 헤더 중앙
{isLive && (
    <span className="flex items-center gap-1 text-xs font-bold text-red-400">
        <Circle size={6} className="fill-red-400 animate-pulse" />
        LIVE
    </span>
)}

// 헤더 아래 신규 블록 (showBox 전용)
{showBox && (
    <div className="shrink-0 bg-slate-900 border-b border-slate-800 px-[10%] pb-3">
        <div className="max-w-md mx-auto">
            <QuarterScores allLogs={visibleEvents} homeTeamId={gameData.home_team_id}
                currentQuarter={currentQuarter} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />
        </div>
    </div>
)}

// 탭 그룹
<div className="shrink-0 border-b border-slate-800 flex items-center justify-center gap-6 px-6 h-11 bg-slate-900">

// BoxScoreTable.tsx
{!standalone && <div className="absolute top-0 left-0 right-0 h-0.5 z-10" style={{ backgroundColor: teamColor }}></div>}
```

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 멀티플레이어 박스스코어 MVP 왕관/배경색 제거

**배경**: 멀티플레이어 박스스코어 좌우 분할 UI 작업 연장선 — 경기 최우수 선수(MVP) 표시용 왕관
아이콘과 행 배경색(amber 하이라이트)을 제거해달라는 요청. `standalone`(멀티플레이어 전용) prop으로
게이팅해 싱글플레이어(`GameResultView.tsx`)의 기존 MVP 표시는 그대로 유지.

**변경 파일**:
- `components/game/BoxScoreTable.tsx` — `sortedBox.map` 내부 `TableRow` 배경색 조건과 `Crown`
  아이콘 렌더 조건에 `!standalone` 추가. 선수 이름 텍스트 색(`text-amber-200`)은 요청 범위(왕관·
  배경색)에 포함되지 않아 그대로 유지.

**Before**:
```tsx
<TableRow key={p.playerId} className={isMvp ? 'bg-amber-900/10' : ''}>
  ...
  {isMvp && <Crown size={12} className="text-amber-400 fill-amber-400 animate-pulse" />}
```

**After**:
```tsx
<TableRow key={p.playerId} className={isMvp && !standalone ? 'bg-amber-900/10' : ''}>
  ...
  {isMvp && !standalone && <Crown size={12} className="text-amber-400 fill-amber-400 animate-pulse" />}
```

**검증**: `npx vite build` 클린 빌드 성공. 브라우저 실사용 테스트는 못 했음(세션에 화면 캡처/
브라우저 도구 없음).

**롤백 방법**: Before 블록 내용으로 되돌리면 됨.

---

## 2026-08-02 — 멀티플레이어 경기 박스스코어 좌우 분할 레이아웃

**배경**: 멀티플레이어 종료 경기 "경기기록" 탭의 홈/원정 박스스코어 테이블이 상하로 쌓여있던 걸
좌우 분할(수평 배치)로 바꿔달라는 요청. 싱글플레이어(`GameResultView.tsx`)는 그대로 유지해야 함
— 둘 다 공유하는 `GameBoxScoreTab`/`BoxScoreTable` 컴포넌트를 건드리되 옵트인 prop으로 분기.

**변경 파일**:
- `components/game/tabs/GameBoxScoreTab.tsx` — `splitLayout?: boolean` prop 추가(기본 false).
  true면 컨테이너를 `grid grid-cols-1 lg:grid-cols-2 gap-4`로, 각 테이블은 `overflow-x-auto`로
  감싸 독립적으로 가로 스크롤(테이블 자체 컬럼 수·구조는 안 건드림 — 좁아진 폭에서 스크롤로 대응)
- `views/multi/season/MultiGamePbpView.tsx` — `GameBoxScoreTab`에 `splitLayout` 전달
- `views/GameResultView.tsx` — 변경 없음(prop 미전달 → 기존 상하 배치 그대로)

**검증**: `npx vite build` 클린 빌드 성공. **브라우저 실사용 테스트는 못 했음** — 이 세션엔 화면
캡처/브라우저 도구가 없어 레이아웃이 실제로 의도대로 보이는지 직접 확인 못함. 로컬에서 dev
서버로 확인 부탁드립니다.

**롤백 방법**: `MultiGamePbpView.tsx`의 `splitLayout` prop 제거, `GameBoxScoreTab.tsx`의 조건부
컨테이너를 원래 `flex flex-col gap-0` 단일 구조로 되돌리면 됨.

**추가 수정(같은 날)**: "박스스코어 컨테이너도 해체해봐" 요청 — `BoxScoreTable.tsx`에
`standalone?: boolean` prop 추가. 기존엔 두 팀 테이블이 상하로 이어붙는 걸 전제로 `border-y`만
쓰고 라운딩이 없었는데(`overflow-x-auto`+옆 테이블과 안 붙어있는 좌우 분할에서는 어색함),
`standalone=true`면 `border`(전체)+`rounded-xl`+`overflow-hidden`으로 독립 카드처럼 렌더링.
`GameBoxScoreTab.tsx`에서 `standalone={splitLayout}`로 연결 — 싱글플레이어(기본 false)는 기존
seamless 스타일 그대로.

**검증**: `npx vite build` 클린 빌드 성공. 이 역시 브라우저 실사용 테스트는 못 함.

**정정(같은 날)**: 위 "카드로 만들기"는 사용자 의도와 반대였음 — 실제로는 "컨테이너를 해체해서
바디에 꽉 차게"가 요청이었음. 재수정: `standalone=true`일 때 바깥 wrapper의 `bg-slate-900
border rounded` 전부 제거(그냥 `w-full relative`만 남김), 헤더 바도 테두리 제거, 대신 안쪽
`Table` 컴포넌트가 기존에 `!rounded-none !border-0 !shadow-none`로 지워졌던 자기 테두리를
`standalone`일 때는 그대로 살려서(className 안 넘김) **Table 자신의 기본 border/rounded/shadow가
유일한 테두리**가 되도록 함. `GameBoxScoreTab.tsx`의 그리드 갭도 `gap-4`→`gap-0`,
`MultiGamePbpView.tsx`의 탭 바디 패딩(`p-6`)도 `finalTab==='box'`일 때만 제거해 진짜로 바디
전체를 꽉 채우도록 함.

**검증(정정 포함)**: `npx vite build` 클린 빌드 성공.

**추가 수정(같은 날, 스크린샷 피드백 반영)**: ① 테이블 외부 라운딩 제거 — `standalone`일 때
`Table` className을 `"!rounded-none"`으로(테두리/그림자는 유지, 라운딩만 제거). ② FAT/TF/FF/
FG%/3P%/FT% 컬럼을 **삭제하지 않고 숨김** — `standalone`일 때만 적용되는 `hideCls =
standalone ? 'hidden' : ''`를 헤더(`SortableHeader`에 `hidden?: boolean` prop 추가)/바디/
푸터 3곳 전부의 해당 컬럼 className에 부착. 푸터의 `POS+OVR+FAT` 통합 셀은 FAT 숨김에 맞춰
`colSpan`을 3→2로 축소(standalone일 때만). 기본(상하 배치)는 전부 그대로 노출.

**검증**: `npx vite build` 클린 빌드 성공.

---

## 2026-08-01 — 멀티플레이어 URL에 리그/게임 UUID·내부 ID 노출 문제 해결 (short_code)

**배경**: `/multi/leagues/{UUID}/season/schedule`, `.../game/T_R1_M0_G1` 처럼 URL에 리그 UUID와
토너먼트 내부 게임 ID가 그대로 노출되는 게 보기 안 좋다는 지적 — 짧은 코드로 대체하기로 결정.
**소급 적용은 하지 않음(신규 리그부터만 적용)**, 게임 ID는 `game_pbp`/`game_sim_claims`/
`tournament_game_log`/`tournament_player_stats` 4개 테이블 + `rooms.schedule[].id`에 실제
저장 키로 쓰이고 있어 저장 키 자체는 절대 안 건드리고, **라우팅 전용 매핑 테이블**로만 대응.

**DB 마이그레이션** (`add_league_and_game_short_codes`):
```sql
alter table leagues add column if not exists short_code text unique;
create index if not exists idx_leagues_short_code on leagues(short_code);

create table if not exists game_short_codes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  game_id text not null,
  short_code text unique not null,
  created_at timestamptz not null default now(),
  unique(room_id, game_id)
);
create index if not exists idx_game_short_codes_short_code on game_short_codes(short_code);
```

**코드 생성**: 8자리, 헷갈리는 문자(0/O,1/I/l) 제외 32종 알파벳 — client(`leagueService.ts`)와
server(`finalize.ts`)에 동일 알고리즘을 각자 정의(빌드 컨텍스트가 달라 공유 모듈로 안 뽑음).

**핵심 설계 — 라우트 파라미터명은 그대로 유지(`:leagueId`, `:gameId`), 값의 의미만 변경**:
기존 15곳 이상이 `useParams().leagueId`를 그대로 읽어 내비게이션 URL을 재조립하고 있었는데,
이 값이 UUID든 short_code든 URL 조립 자체는 그대로 동작하므로 그 호출부들은 손대지 않음(리네이밍
없이 값 의미만 전환). 대신 **"실제 UUID가 필요한 지점"만 정확히 찾아서 `league.id`(컨텍스트에서
이미 조회 완료된 진짜 UUID)로 교체**하는 방식으로 최소 침습 진행.

**변경 파일**:
- DB: `leagues.short_code`, `game_short_codes` 테이블 (신규)
- `services/multi/leagueService.ts` — `generateShortCode()`, `createLeague()`에 short_code 발급 + 충돌 시 재시도
- `services/multi/roomQueries.ts` — `LeagueRow.short_code` 필드 추가, `loadLeague()`를 UUID/short_code 겸용 조회로 변경(정규식으로 형태 자동 판별)
- `server/src/finalize.ts` — `generateShortCode()`, `insertGameShortCodes()` 추가, 일정/브라켓 생성 성공 후(force 경로 + 메인 경로 둘 다) 게임마다 코드 발급·삽입 (insert 실패해도 finalize는 막지 않음 — 경기 URL이 원래 game_id로 폴백 가능하도록 설계)
- `hooks/useCurrentLeague.ts` — `loadLeague`/`loadRoomByLeague` 병렬 실행을 순차로 변경(short_code→실제 UUID 확정 후 room 조회), leagues Realtime 구독 filter를 `league.id`(확정된 UUID) 기준으로 변경
- `views/multi/league/LeagueLobbyView.tsx` — Realtime filter, `runDraftLottery`, `startDraft` 호출을 `league.id`로 교체
- `views/multi/league/LeagueSettingsView.tsx` — `updateLeagueSettings`(3곳), `runDraftLottery`, `resetTournament` 호출을 `league.id`로 교체
- `views/multi/league/LeagueListView.tsx` — `handleJoin`에 `shortCode` 파라미터 추가, 참가 후 이동 URL에 short_code 우선 사용
- `components/multi/CreateLeagueModal.tsx` — 리그 생성 후 `onCreated` 콜백에 short_code 우선 전달
- `components/multi/TournamentChampionModal.tsx` — `location.pathname` 비교 기준 URL을 `league.short_code ?? league.id`로 교체(실제 URL과 일치시켜야 배지 표시 조건이 맞음)
- `hooks/useGameShortCodes.ts` (신규) — 방(room)의 game_id→short_code 매핑을 한 번에 로드하는 공용 훅
- `views/multi/season/MultiScheduleView.tsx`, `views/multi/season/TournamentBracketView.tsx` — 경기 클릭 시 이동 URL에 `useGameShortCodes`로 조립한 short_code 사용
- `views/multi/season/MultiGamePbpView.tsx` — URL의 gameId(short_code 또는 구형 game_id)를 `game_short_codes`로 역조회해 `resolvedGameId`(진짜 game_id) 확보, 스케줄 매칭/`fetchLiveGameView` 호출 전부 이걸로 교체

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공(CIRCULAR_DEPENDENCY 없음).

**롤백 방법**: DB 마이그레이션은 `drop table game_short_codes; alter table leagues drop column short_code;`로 되돌릴 수 있음(둘 다 신규 추가라 기존 데이터 영향 없음). 코드는 위 각 파일을 이 커밋 이전 상태로 되돌리면 됨 — `loadLeague()`가 UUID/short_code 겸용이라 마이그레이션만 롤백해도(코드는 그대로 둬도) 정상 동작(모든 리그가 UUID 경로로만 조회됨).

**주의사항 / 한계**:
- 기존 리그·기존 경기는 소급 미적용 — 계속 UUID/`T_R1_M0_G1` 형식 URL 유지(정상 동작, 그냥 안 짧아짐)
- `views/multi/season/MultiGamePbpView.legacy.tsx`는 아무 데서도 import 안 되는 죽은 코드로 확인되어 수정 안 함
- 토너먼트 리셋 시 게임 ID가 위치 기반이라 재사용되는데, `game_short_codes`의 `unique(room_id, game_id)` 제약 덕분에 기존 매핑이 그대로 재사용됨(의도치 않은 부작용 아님 — 리셋 후에도 같은 short_code가 같은 (room, game_id)를 계속 가리켜서 오히려 안전)

**추가 수정(같은 날, 배포 후 실사용 중 발견)**: TEST 13 실측 결과 게임 URL은 짧은 코드로 잘 나오는데
리그 URL만 UUID가 그대로 노출됨 — DB 확인 결과 `leagues.short_code`는 정상 발급돼 있었음(데이터
문제 아님). 원인은 `views/multi/league/LeagueListView.tsx`에 **리그 생성 직후 이동 경로는
고쳤지만, 목록에서 리그를 다시 클릭해 들어가는 경로(리그 이름 클릭, "들어가기" 버튼) 2곳을
빠뜨렸던 것** — 둘 다 `league.id`를 그대로 썼음. `league.short_code ?? league.id`로 수정.
전체 코드베이스에서 `/multi/leagues/${...league.id...}` 패턴을 재검색해 이 2곳 외엔 없음을 확인.

**검증**: `npx vite build` 클린 빌드 성공.

---

## 2026-08-01 — 패싱레인 스틸/비강제 턴오버의 passAcc 미스매치 수정 (턴오버 전체 점검 A-2/B)

**배경**: A-1(온볼 스틸) 수정 이후에도 시뮬레이션 추정상 빅맨 TOV가 여전히 높게 남아 계속 점검.
A-2(패싱레인 스틸)의 `passResist`와 B(비강제 턴오버)의 `passAccFactor` 둘 다 **액터(캐치해서
마무리하는 선수) 본인의 `passAcc`**를 사용하고 있었는데, `isPassPlay` 목록(CatchShoot/
PnR_Roll/PnR_Pop/Cut 등)은 대부분 "액터가 패스를 받는" 상황이지 액터가 패스를 던지는 상황이
아님 — 롤맨이 알리웁을 받다가 가로채이는 건 롤맨의 패스 정확도와 무관하고 실제로 던진
핸들러(secondaryActor)의 문제.

**A-2 수정**: `calculateTurnoverChance`에 `passer?: LivePlayer` 파라미터 추가, 호출부에서
`secondaryActor` 전달(playCtx에서 이미 구조분해된 값 재사용). `passResist` 계산을
`(passer ?? actor).attr.passAcc` 기준으로 교체 — 패서가 없는 경우(PnR_Handler처럼 액터 본인이
직접 만드는 플레이)는 기존처럼 actor로 폴백.

**B 수정**: `passAccFactor`를 완전히 삭제. 이 리스크(캐치 후 마무리 중 실수)는 이미
`ballSkillFactor`의 hands 항목(비드리블 플레이 전체에 적용)이 담당하고 있어 중복이었음 —
"패서 기준으로 교체"가 아니라 "그대로 삭제"를 택함(사용자 확인: hands가 맞는 방향, B는 스틸이
아니라 자체 실수라 이미 hands가 커버 중이므로 중복 항목 제거).

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client, `calculateTurnoverChance` 시그니처/
  A-2/B 섹션 + 호출부)
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러)

**Before**:
```ts
function calculateTurnoverChance(
    offTeam, defTeam, actor, defender, playType,
    pnrCoverage = 'none', helpDefender?, helpSuccess = false
): {...} {
    ...
    // A-2
    const passResist = (actor.attr.passAcc - 70) * stlCfg.PASSACC_RESIST_COEFF;
    ...
    // B
    const passAccFactor = (70 - actor.attr.passAcc) * (isPassPlay ? 0.0012 : 0.0005);
    ...
    let unforcedProb = baseProb + passRisk + ballSkillFactor + iqFactor
        + passAccFactor + contextRisk + composureFactor
        + dribbleGapRisk - needleReduction + pressTovBonus;
}
// 호출부
calculateTurnoverChance(offTeam, defTeam, actor, defender, selectedPlayType, pnrCoverage, helpDefender, helpSuccess);
```

**After**:
```ts
function calculateTurnoverChance(
    offTeam, defTeam, actor, defender, playType,
    pnrCoverage = 'none', helpDefender?, helpSuccess = false, passer?: LivePlayer
): {...} {
    ...
    // A-2
    const passResist = ((passer ?? actor).attr.passAcc - 70) * stlCfg.PASSACC_RESIST_COEFF;
    ...
    // B — passAccFactor 완전 삭제
    ...
    let unforcedProb = baseProb + passRisk + ballSkillFactor + iqFactor
        + contextRisk + composureFactor
        + dribbleGapRisk - needleReduction + pressTovBonus;
}
// 호출부
calculateTurnoverChance(offTeam, defTeam, actor, defender, selectedPlayType, pnrCoverage, helpDefender, helpSuccess, secondaryActor);
```

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨(함수 시그니처의 `passer` 파라미터,
호출부의 `secondaryActor` 인자도 함께 제거).

**추가 수정(같은 날)**: `iqFactor`(passIq)도 동일 논의 — `passIq`가 코드베이스 전체(archetypeSystem/
playTypes의 커넥터·핸들러 아키타입, 킥아웃 패스 보너스, Needle/Clairvoyant/Overseer 아키타입
임계값 등)에서 예외 없이 "패스하는 사람"의 스탯으로만 쓰이는 것을 전수조사로 확인 — `passAcc`와
동일한 미스매치로 판단, `passAccFactor`(삭제)가 아니라 `passResist`(패서로 교체) 방식을 적용.
"판단력으로 인한 실수"라는 리스크 자체는 다른 항목이 대신 커버하지 않으므로 삭제 대신 대상만
교체.

**Before**: `const iqFactor = (70 - actor.attr.passIq) * 0.001;`
**After**: `const iqFactor = (70 - (passer ?? actor).attr.passIq) * 0.001;`

기존 `passer` 파라미터(A-2 수정 시 추가) 재사용 — 함수 시그니처/호출부 변경 없음.

**검증(iqFactor 포함)**: `tsc` 30개 베이스라인 유지, `vite build` 클린 빌드 성공.

---

## 2026-08-01 — 온볼 스틸 저항도 플레이타입별 handling/hands 선택 반영 (턴오버 전체 점검 A-1)

**배경**: 바로 아래 항목(B. 비강제 턴오버의 `ballSkillFactor`)을 고친 뒤에도 시뮬레이션 추정
결과 빅맨 TOV가 여전히 높게 남아(터너 8.99 등) 사용자가 "턴오버 로직을 처음부터 쭉 점검"
요청. `calculateTurnoverChance()` 전체(A-1 온볼 스틸/A-2 패싱레인 스틸/B 비강제 턴오버)를
재점검한 결과, **A-1 온볼 스틸의 `handlingResist`가 플레이타입 게이팅이 전혀 없이 항상
적용**되고 있었음을 확인 — B섹션과 완전히 동일한 버그가 함수 맨 앞(가장 먼저 실행되는 구간)에
그대로 남아있었음. 포스트업/캐치앤슛/풋백 등 액터가 실제로 드리블 핸들러로 기능하지 않는
상황에서도 무조건 `handling` 기준으로 스틸 저항이 계산되어, 빅맨(handling 평균 51.5)이
상시 페널티(터너 기준 +2.8%p)를 먹고 있었음.

(참고: 같은 점검에서 A-2 패싱레인 스틸/B의 `passAccFactor`도 `isPassPlay` 목록이 "액터가
패스를 받아서 마무리하는" 상황(CatchShoot/PnR_Roll/PnR_Pop/Cut 등)인데 액터 본인의 `passAcc`가
반영되는 유사한 미스매치로 확인됨 — 별도 항목으로 후속 수정 예정. `iqFactor`(passIq)는
게이팅 여부 미정, 논의 보류.)

**수정**: A-1의 `handlingResist`를 B의 `ballSkillFactor`와 동일한 논리로 게이팅.
`isDribblePlay` 선언을 함수 상단(A-1 이전)으로 옮겨 A-1/B 공통 사용, B/드리블갭리스크
섹션의 중복 선언 제거.

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client, `calculateTurnoverChance` A-1 섹션)
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러)

**Before**:
```ts
const isPassPlay = playType === 'CatchShoot' || ...;

const onballBase = interpolateCurve(defender.attr.stl, stlCfg.ONBALL_STEAL_CURVE);
const handlingResist = (actor.attr.handling - 70) * stlCfg.HANDLING_RESIST_COEFF;
const pnrCfg = SIM_CONFIG.PNR_COVERAGE;
const blitzBonus = (pnrCoverage === 'blitz' && playType === 'PnR_Handler') ? 0.02 : 0;
const pressStealBonus = pressLevel * stlCfg.PRESS_STEAL_COEFF;

const onballProb = Math.max(0.005, onballBase - handlingResist + blitzBonus + pressStealBonus);
```

**After**:
```ts
const isPassPlay = playType === 'CatchShoot' || ...;
const isDribblePlay = playType === 'Iso' || playType === 'Cut' || playType === 'Transition' || playType === 'PnR_Handler';

const onballBase = interpolateCurve(defender.attr.stl, stlCfg.ONBALL_STEAL_CURVE);
const ballSkillResist = isDribblePlay
    ? (actor.attr.handling - 70) * stlCfg.HANDLING_RESIST_COEFF
    : (actor.attr.hands - 70) * stlCfg.HANDLING_RESIST_COEFF;
const pnrCfg = SIM_CONFIG.PNR_COVERAGE;
const blitzBonus = (pnrCoverage === 'blitz' && playType === 'PnR_Handler') ? 0.02 : 0;
const pressStealBonus = pressLevel * stlCfg.PRESS_STEAL_COEFF;

const onballProb = Math.max(0.005, onballBase - ballSkillResist + blitzBonus + pressStealBonus);
```

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨(`isDribblePlay` 상단 선언도 함께 제거).

**추가 정리(같은 날)**: `stlCfg.HANDLING_RESIST_COEFF`가 이제 handling뿐 아니라 hands에도 쓰이는데
이름이 handling 전용처럼 남아있어 혼동 소지 — `BALL_SKILL_RESIST_COEFF`로 리네이밍 (값 0.001은
동일, `constants.ts` 정의 + `possessionHandler.ts` 사용처 2곳, client/server 총 4개 파일).

**검증(리네이밍 포함)**: `tsc` 30개 베이스라인 유지, `vite build` 클린 빌드 성공.

---

## 2026-08-01 — 턴오버 계산: 플레이타입별 handling/hands 선택 반영 (빅맨 TOV 과다 수정)

**배경**: pnrDefense 수정 배포 후 사용자가 "빅맨 턴오버가 너무 과중하다"고 지적. TEST 10 실측
결과 TOV/36이 C=4.48/PF=3.88인데 PG=1.45로 3배 이상 차이(실제 NBA는 반대로 볼을 제일 많이
만지는 PG가 TOV 1위인 경우가 많음). TEST 9(오늘 첫 수정 전 데이터, C=4.31/PF=3.16/PG=1.23)와
비교해 오늘 수정과 무관한 기존 버그였음을 확인 — `calculateTurnoverChance()`는 이번 세션에서
처음 조사.

원인: `handlingFactor = (70 - actor.attr.handling) * 0.001`가 **플레이타입과 무관하게 항상
반영**됨. 그런데 `handling`(오픈코트 드리블 스킬)은 포지션 편차가 극심함(로스터 실측: C 평균
51.5 vs PG 평균 90.6, 39점 격차) — 라이브 드리블로 직접 만들어내는 플레이가 아닌 포스트업/롤/팝
같은 컨택·캐치 플레이에도 이 페널티가 그대로 적용되어, 빅맨은 스킬과 무관하게 포지션 자체만으로
매 포제션 페널티를 먹는 구조였음. 반면 같은 함수에 이미 있던 `handsFactor`(캐치·컨택 볼 간수,
컨택 플레이에 3배 가중)는 포지션 편차가 작아서(C 78.6 vs PG 86.5, 8점 격차) 이 용도에 적합한
스탯이었음 — `handling`만 걷어내고 `hands`는 그대로 살리는 방향으로 사용자와 합의.

**수정**: 플레이타입에 따라 관련 스탯만 선택 반영하도록 재구성.
- 드리블 창조 플레이(Iso/Cut/Transition/PnR_Handler) → `handling`
- 컨택/캐치 플레이(PostUp/PnR_Roll/PnR_Pop) → `hands`(기존과 동일, 컨택 시 3배 가중 유지)
- 그 외(CatchShoot 등) → `hands` 약하게 반영 (기존 논컨택 계수 0.0005 유지)

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client, `calculateTurnoverChance` 내
  B. 비강제 턴오버 섹션)
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러)

**Before**:
```ts
const handlingFactor = (70 - actor.attr.handling) * 0.001;
const iqFactor = (70 - actor.attr.passIq) * 0.001;
const isContactPlay = playType === 'PostUp' || playType === 'PnR_Handler' || playType === 'PnR_Roll' || playType === 'PnR_Pop';
const handsFactor = (70 - actor.attr.hands) * (isContactPlay ? 0.0015 : 0.0005);
const passAccFactor = (70 - actor.attr.passAcc) * (isPassPlay ? 0.0012 : 0.0005);
...
// (아래쪽) 드리블 갭 리스크 섹션에서 별도로:
const isDribblePlay = playType === 'Iso' || playType === 'Cut' || playType === 'Transition' || playType === 'PnR_Handler';
...
let unforcedProb = baseProb + passRisk + handlingFactor + iqFactor
    + handsFactor + passAccFactor + contextRisk + composureFactor
    + dribbleGapRisk - needleReduction + pressTovBonus;
```

**After**:
```ts
const isDribblePlay = playType === 'Iso' || playType === 'Cut' || playType === 'Transition' || playType === 'PnR_Handler';
const isContactPlay = playType === 'PostUp' || playType === 'PnR_Roll' || playType === 'PnR_Pop';
const ballSkillFactor = isDribblePlay
    ? (70 - actor.attr.handling) * 0.001
    : (70 - actor.attr.hands) * (isContactPlay ? 0.0015 : 0.0005);
const iqFactor = (70 - actor.attr.passIq) * 0.001;
const passAccFactor = (70 - actor.attr.passAcc) * (isPassPlay ? 0.0012 : 0.0005);
...
let unforcedProb = baseProb + passRisk + ballSkillFactor + iqFactor
    + passAccFactor + contextRisk + composureFactor
    + dribbleGapRisk - needleReduction + pressTovBonus;
```
`isDribblePlay` 선언을 위로 옮기고 아래쪽 중복 선언 제거(드리블 갭 리스크 섹션은 재사용).
`isContactPlay`에서 `PnR_Handler` 제외(이제 `isDribblePlay`로 분류되어 handling 사용).

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

---

## 2026-08-01 — 멀티플레이어 AI 팀 pnrDefense 슬라이더 스케일 버그 수정

**배경**: 핫/콜드 제거 후 남은 유력 원인(And-1/PnR 커버리지/존 선택 쏠림/킥아웃 보너스) 중
PnR 커버리지 보너스를 조사. `SIM_CONFIG.PNR_COVERAGE.DIST`(Drop/Hedge/Blitz 발생 확률 분포)를
읽어오는 `sliders.pnrDefense`가 다른 전술 슬라이더(0~10 스케일, 중간값 5)와 달리 **0~2 스케일**
(0=Drop, 1=Hedge, 2=Blitz, `types/tactics.ts:35`)인데, `server/src/finalize.ts`의
`MIDDLE_SLIDERS`(멀티플레이어 AI 팀 전용 전술 초기값)가 이 사실을 놓치고 다른 슬라이더들과
똑같이 `pnrDefense: 5`로 넣어놨음. `possessionHandler.ts:136-137`의
`Math.max(0, Math.min(2, Math.round(sliders.pnrDefense)))`에 걸려 5가 무조건 index 2로
클램프됨 — **멀티플레이어 AI 팀(테스트 방의 사실상 전 팀) 전체가 항상 Blitz 70%/Hedge 20%/Drop
10%로 고정**되어 있었음. 의도한 기본값(`DEFAULT_SLIDERS.pnrDefense=1`, Hedge 60% 중심)과 전혀
다른 분포였음.

영향 계산: Blitz는 PnR_Roll(+7%p)/PnR_Pop(+6%p) 보너스가 제일 크고 핸들러 페널티(-8%p)도 제일
큰 커버리지라, 확률가중평균이 의도(index 1) 대비 롤맨 +5.1%p(의도 +2.95%p, 약 1.7배)/
팝맨 +4.35%p(의도 +1.73%p, 약 2.5배)/핸들러 -5.6%p(의도 -2.6%p, 약 2.1배)로 뻥튀기되고 있었음
— TEST 9/10에서 관찰된 롤/팝 위주 빅맨들의 TS% 과다 인플레와 방향이 일치.

**변경 파일**:
- `server/src/finalize.ts` (server 전용 — client 미러 없음, `MIDDLE_SLIDERS`는 이 파일에만 존재)

**Before**:
```ts
const MIDDLE_SLIDERS: TacticalSliders = {
    pace: 5, ballMovement: 5, offReb: 5,
    insideOut: 5, pnrFreq: 5,
    shot_3pt: 5, shot_mid: 5, shot_rim: 5,
    defIntensity: 5, helpDef: 5, switchFreq: 5, defReb: 5, zoneFreq: 5, pnrDefense: 5,
    fullCourtPress: 5, zoneUsage: 5,
};
```

**After**:
```ts
const MIDDLE_SLIDERS: TacticalSliders = {
    pace: 5, ballMovement: 5, offReb: 5,
    insideOut: 5, pnrFreq: 5,
    shot_3pt: 5, shot_mid: 5, shot_rim: 5,
    defIntensity: 5, helpDef: 5, switchFreq: 5, defReb: 5, zoneFreq: 5, pnrDefense: 1,
    fullCourtPress: 5, zoneUsage: 5,
};
```

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: `pnrDefense: 1` → `pnrDefense: 5`로 되돌리면 됨.

**참고**: 이 수정은 신규 멀티플레이어 방(드래프트 완료 시점)에만 적용됨 — 이미 생성된 기존 방의
`room_members.tactics`에는 소급 반영 안 됨(재검증하려면 새 테스트 방을 만들어야 함).

---

## 2026-08-01 — Hot/Cold Streak을 hitRate에서 완전히 분리 (연출 전용으로 전환)

**배경**: 매치업 갭(골밑+퍼리미터) 수정 배포 후, 남은 유력 원인으로 hot/cold 스트릭을 재조사.
`recentShots`(실제 저장된 경기별 최근 슛 기록)로 실측 검증한 결과 — `updateHotCold()`의
`recentPct - 0.5` 계산이 선수 본인의 실제 기대 성공률이 아니라 **고정된 50%를 기준선**으로 삼고
있어서, TEST 10 실측(mp>50, n=139) 기준 **시즌 FG%와 hotColdRating의 상관계수가 0.704**로
측정됨 — "무작위 스트릭"이 아니라 "잘하는 선수는 상시 핫 보정(+), 못하는 선수는 상시 콜드
보정(-)"으로 작동하며 기존 실력 격차를 매 슛마다 자기강화(compounding)하고 있었음.

수정 방향으로 "잔차(residual) 기반 재계산"(그 슛의 `calculateHitRate` 기대확률 대비 실제 결과의
차이를 사용, 시즌 스탯 조회 없이 그 경기 내 데이터만으로 완결)을 설계했으나, 사용자가 더 단순한
방향으로 결정 — **hot/cold를 아예 hitRate 계산에서 제거하고 연출 전용 장치로 전환.**
`hotColdRating`이 커멘터리/UI 어디에도 현재 사용되지 않는 것을 확인(순수 hitRate 가산 용도뿐)
했으므로, `calculateHitRate`의 8번 항목만 제거하고 `hotColdRating`/`recentShots` 계산 자체는
`statsMappers.ts`에 그대로 유지(추후 커멘터리/UI 연출용으로 재사용 가능하도록 보존).

**변경 파일**:
- `services/game/engine/pbp/flowEngine.ts` (client, `calculateHitRate` 8번 Hot/Cold Streak 블록)
- `server/src/shared/engine/pbp/flowEngine.ts` (server 미러)

**Before**:
```ts
// 8. Hot/Cold Streak (±4% 캡)
if (actor.hotColdRating !== 0) {
    let temperatureBonus = actor.hotColdRating * 0.04 * (actor.tendencies?.confidenceSensitivity ?? 1.0);
    const consistencyRecover = (actor.attr.offConsist / 100) * 0.5;
    temperatureBonus *= (1 - consistencyRecover);
    hitRate += temperatureBonus;
}
```

**After**: 블록 전체 삭제 (hitRate 미반영). `statsMappers.ts`의 `updateHotCold`/`hotColdRating`/
`recentShots` 계산 로직은 변경 없음 — 여전히 매 슛마다 갱신되지만 더 이상 아무 곳에서도
소비되지 않는 상태(연출용으로 향후 재사용 대기).

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 삭제된 Before 블록을 `let finalRate = ...` 직전에 그대로 복원하면 됨.

---

## 2026-08-01 — calculateMatchupGap 골밑 defSkill을 strength 단일 비교로 교체

**배경**: 덩크 커브 수정 배포 후 재검증(TEST 10, 128경기)에서 TS% 평균/중앙값은 -2.7%p 내려갔지만
여전히 p90=69.7%/p95=72.1%로 상위권이 과도하게 높음. 사용자가 하위~중위권(p25=50.5%, 최저 27%)은
정상 범위인데 상위권만 튀는 걸 지적 → 매치업 갭 정밀 조사 진행.

`calculateMatchupGap`의 골밑 defSkill(`intDef*0.35+blk*0.30+strength*0.20+vertical*0.15`)을
실측(TEST 10 로스터 320명)으로 검증한 결과:
1. **평균 오프셋 문제**: offPower(strength 평균 71.9) vs defSkill(블렌드 평균 68.3) — "평균적인"
   매치업조차 +3.6 만큼 공격 쪽으로 쏠려 있음(리그 상위 10%끼리 비교해도 +5.3~4.3로 동일 패턴,
   극단치만의 문제가 아니라 스케일 전체의 문제).
2. **이중 반영 문제**: intDef는 이미 `defRating`/`defMod`(flowEngine.ts)에서, blk는 이미
   possessionHandler.ts의 블락 확률 시스템(`blkCfg.BASE_RIM`+`blkBonus` 등, `blkCfg.ENABLED`와
   무관하게 항상 작동)에서 각각 별도로 반영되고 있어 defSkill 블렌드에 또 넣으면 방어력이
   중복 계산됨 (intDef 10pt 상승 시 defMod 경로 -1.5%p + 매치업갭 경로 -0.7%p, 총 -2.2%p로
   의도(-1.5%p)보다 과대).
3. offPower에 vertical/hands 등을 추가로 섞어 평균을 맞추는 방안도 검토했으나, 두 스탯 모두
   리그 평균이 strength(71.9)보다 높아(vertical 78.1, hands 82.4) 오히려 격차가 악화됨을 실측으로
   확인, 폐기.
4. defSkill 가중치만 재조정(blk↓, strength/vertical↑)하는 방안도 검토했으나, blk 비중을 깎으면
   "블락 잘하는 빅맨"이 매치업 갭에서 얻는 정당한 이득이 줄어드는 부작용이 있어 보류.

최종적으로 intDef/blk를 defSkill에서 완전히 제거하고 **strength 단일 비교**로 교체 —
offPower/defSkill이 동일 스탯·동일 모집단이라 리그 평균 갭이 로스터 구성과 무관하게 항상
정확히 0에 수렴함(실측 mp가중평균 73.38 vs 73.38, 오프셋 상수/재보정 불필요). 개별 매치업의
스킬 격차(예: 바클리 strength 97 vs 평범한 수비수)는 의도대로 유지 — "상대 팀에 피지컬 몬스터가
있으면 그만큼 강한 수비수로 대응해야 한다"는 정상 게임플레이로 남겨둠.

**변경 파일**:
- `services/game/engine/pbp/flowEngine.ts` (client, `calculateMatchupGap` Rim/Paint 분기)
- `server/src/shared/engine/pbp/flowEngine.ts` (server 미러)

**Before**:
```ts
if (zone === 'Rim' || zone === 'Paint') {
    const offPower = actor.attr.strength;
    const defSkill = defender.attr.intDef * 0.35 + defender.attr.blk * 0.30
                   + defender.attr.strength * 0.20 + defender.attr.vertical * 0.15;
    return offPower - defSkill;
}
```

**After**:
```ts
if (zone === 'Rim' || zone === 'Paint') {
    const offPower = actor.attr.strength;
    const defSkill = defender.attr.strength;
    return offPower - defSkill;
}
```

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

**추가 수정(같은 날)**: 사용자가 곧바로 퍼리미터(Mid/3PT)도 동일하게 수정 요청 — perDef 역시
`defRating`/`defMod`에서 이미 반영되는 중복이었음을 확인, 골밑과 같은 논리로 퍼리미터 defSkill도
`(defender.attr.speed + defender.attr.agility) / 2`로 교체(offPower와 완전 동일 스탯 구성).

**Before (퍼리미터)**:
```ts
const offPower = (actor.attr.speed + actor.attr.agility) / 2;
const defSkill = defender.attr.perDef * 0.35 + defender.attr.agility * 0.25
                + defender.attr.speed * 0.20 + defender.attr.stl * 0.20;
return offPower - defSkill;
```

**After (퍼리미터)**:
```ts
const offPower = (actor.attr.speed + actor.attr.agility) / 2;
const defSkill = (defender.attr.speed + defender.attr.agility) / 2;
return offPower - defSkill;
```

**검증(추가 수정 포함)**: `tsc` 30개 베이스라인 유지, `vite build` 클린 빌드 성공. 아직 배포 전.

---

## 2026-08-01 — DUNK_OFF_CURVE 압축 (덩크 능력치 80+ 캡 포화 수정)

**배경**: "TEST 9 - ADJUST TS" 방(v98 배포 후 170경기, shotIq/offConsist 수정 반영된 데이터)에서
바클리(dunk 99) FG% 72.9%/TS% 75.5%로 여전히 극단적으로 높아 재조사. shot_events 슛타입별
breakdown 결과 덩크가 97시도 90.7%로 압도적 원인이었음. 계산해보니 `DUNK_OFF_CURVE`가 dunk=90
에서 이미 +42.9%p를 줘서 `INSIDE_BASE_PCT`(57%)와 합치면 99.9%(수비 반영 전)로 95% 하드캡에
근접/초과 — 즉 dunk 80+인 선수는 상대 수비자가 누구든 성공률이 사실상 고정값이 되는 구조적
결함. 다른 4개 골밑 슛타입(레이업+13.5%p, 미드페인트점퍼+18.7%p, 훅+3.3%p, 플로터+1.3%p, 전부
99점 기준)은 캡까지 여유가 충분해 문제없음을 확인 — `INSIDE_BASE_PCT`를 낮추면 이미 정상인
레이업/플로터/훅까지 부작용(특히 평범한 선수의 골밑 득점력 과도하게 하락)이 생기므로 배제하고,
유독 폭이 큰 `DUNK_OFF_CURVE`만 약 60% 스케일로 압축하기로 사용자와 합의.

**변경 파일**:
- `services/game/config/constants.ts` (client, `SIM_CONFIG.SHOOTING.DUNK_OFF_CURVE`)
- `server/src/shared/game/config/constants.ts` (server 미러)

**Before**:
```ts
// [Dunk] 65%→92% (균일 상승, 수비 영향 최대)
// x=0 기준점 추가: dunk 능력이 낮은 선수는 페널티 적용
DUNK_OFF_CURVE: [
    [0, +0.059], [40, +0.199], [55, +0.269], [70, +0.339], [80, +0.389],
    [90, +0.429], [99, +0.469],
] as [number, number][],
```

**After**:
```ts
// [Dunk] 60.5%→85% (균일 상승, 수비 영향 최대)
DUNK_OFF_CURVE: [
    [0, +0.035], [40, +0.119], [55, +0.161], [70, +0.202], [80, +0.232],
    [90, +0.256], [99, +0.280],
] as [number, number][],
```

INSIDE_BASE_PCT(57%)는 변경 없음. dunk=99 기준 (베이스+커브) 수비 반영 전 합계가
103.9%(캡 초과) → 85.0%(캡 여유)로 하향. 바클리(dunk 99) 시뮬레이션: 평균 수비 상대
~92%(실측 90.7%) → ~73% 예상.

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

**참고**: 매치업 갭 보너스(`hitRate += gapNormalized * 0.12` → 0.08 제안, flowEngine.ts)는
논의만 하고 아직 미착수 — 바클리 Floater(71.4%)/Jumper-Paint(73.2%)가 순수 커브 예측보다도
15~20pt 높게 나온 부분과 관련.

---

## 2026-07-31 — offConsist 핫/콜드 비대칭 수정 (TS% 상위권 인플레 부가 원인)

**배경**: 바로 아래 shotIq 노이즈 편향 수정에 이어서, TS% 인플레의 또 다른 원인으로 지목했던
hot/cold 스트릭의 offConsist 처리를 논의. 기존 코드는 콜드 스트릭(temperatureBonus<0)일 때만
offConsist 기반 `consistencyRecover`로 페널티를 완화하고, 핫 스트릭(양수)일 땐 전혀 건드리지
않았음 — shotIq처럼 "의도와 코드가 어긋난 버그"는 아니고 주석("콜드 스트릭 완화")과 코드가
일치하는 의도된 설계였지만, 결과적으로 offConsist가 높은 선수(대체로 엘리트)일수록 핫/콜드
기댓값이 플러스로 치우치는 동일 계열의 문제였음. 사용자에게 (1)양방향 대칭 전환 (2)비대칭
유지하되 계수 축소 (3)그대로 보류 중 택1로 질문 → "양방향 대칭으로 전환"(꾸준함=기복 자체가
작다는 의미로 재정의) 선택.

**변경 파일**:
- `services/game/engine/pbp/flowEngine.ts` (client, `calculateHitRate` 내 8번 Hot/Cold Streak 블록)
- `server/src/shared/engine/pbp/flowEngine.ts` (server 미러)

**Before**:
```ts
let temperatureBonus = actor.hotColdRating * 0.04 * (actor.tendencies?.confidenceSensitivity ?? 1.0);
// 콜드 스트릭 완화: offConsist가 높으면 멘탈 회복
if (temperatureBonus < 0) {
    const consistencyRecover = (actor.attr.offConsist / 100) * 0.5;
    temperatureBonus *= (1 - consistencyRecover);
}
hitRate += temperatureBonus;
```

**After**:
```ts
let temperatureBonus = actor.hotColdRating * 0.04 * (actor.tendencies?.confidenceSensitivity ?? 1.0);
// offConsist: 핫/콜드 진폭을 양방향 대칭으로 축소 (꾸준함 = 기복이 작음)
const consistencyRecover = (actor.attr.offConsist / 100) * 0.5;
temperatureBonus *= (1 - consistencyRecover);
hitRate += temperatureBonus;
```

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨 (`if (temperatureBonus < 0) { ... }` 가드 복원).

---

## 2026-07-31 — shotIq 노이즈 편향 수정 (TS% 상위권 과대 인플레 원인)

**배경**: "32 TEST 6" 실측 데이터에서 리그 TS% 중앙값(60.1%)은 실제 NBA 대비 소폭만 높은데,
상위권(p90=70.7%, 조던 75.3%, 하든 72.3% 등)은 역대 최고 시즌 기록급으로 과대 인플레된 현상을
조사. `calculateHitRate`의 shotIq 노이즈 로직이 원인 — 주석상 의도는 "대칭 노이즈(shotIq 높으면
상방/낮으면 하방 위주로 흔들림)"였지만 실제 코드는 shotIq>70이면 `Math.random()*range`(항상 0
이상)만, <70이면 `-Math.random()*-range`(항상 0 이하)만 뽑혀 **매 슛 확정 편향 보너스/페널티**로
작동하고 있었음. shotIq=99 선수는 매 슛 평균 +1.16%p가 공짜로 붙는 구조. DB 조회 결과 TS% 상위권
선수들의 shotIq 평균(≈85)이 리그 중앙값(75)을 크게 상회 — 상위권 인플레와 정확히 일치하는 것으로
확인. 사용자에게 대칭 노이즈 원복/계수 축소/결정론적 보너스 전환 중 택1로 질문 → "대칭 노이즈로
원복"(원래 의도대로) 선택.

**변경 파일**:
- `services/game/engine/pbp/flowEngine.ts` (client, `calculateHitRate` 내부)
- `server/src/shared/engine/pbp/flowEngine.ts` (server 미러)

**Before**:
```ts
const shotIqRange = (actor.attr.shotIq - S.CONSIST_BASELINE) * S.SHOTIQ_NOISE_COEFF;
const shotIqNoise = shotIqRange !== 0
    ? (shotIqRange > 0 ? Math.random() * shotIqRange : -Math.random() * -shotIqRange)
    : 0;
```

**After**:
```ts
// shotIq: 대칭 노이즈 (평균 0, 진폭만 |shotIq-70|에 비례)
const shotIqRange = Math.abs(actor.attr.shotIq - S.CONSIST_BASELINE) * S.SHOTIQ_NOISE_COEFF;
const shotIqNoise = shotIqRange !== 0 ? (Math.random() * 2 - 1) * shotIqRange : 0;
```

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

**참고**: `offConsist`의 hot/cold 스트릭 비대칭(콜드 페널티만 완화, 핫 보너스는 그대로)도 동일 계열
문제로 지목했으나 이번엔 shotIq만 수정 — offConsist 쪽은 아직 미착수.

---

## 2026-07-31 — PostUp/PnR_Roll에 playStyle 보정 소급 적용

**배경**: 바로 아래 항목(Iso/PnR_Handler)에서 다듬은 `playStyle`(-1 패스~+1 슛) 보정을 예고했던
대로 PostUp/PnR_Roll에도 소급 적용 — 4개 킥아웃 플레이타입 전부 동일한 패턴(postPassing 지수
커브 × playStyle 보정)으로 통일.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts`
  (server) — `PostUp`/`PnR_Roll` 케이스의 `kickChance`/`rollKickChance`를 `const`→`let`로 변경하고
  `playStyle` 보정 곱연산 추가 (Iso/PnR_Handler와 동일하게 `PLAY_SELECTION.PLAYSTYLE_PASSER_K` 재사용,
  PnR_Roll은 `screener.tendencies.playStyle` 기준 — actor 변수명이 이 케이스에선 `screener`)

**Before/After**:
```ts
// Before
const kickChance = pkCfg.PROB_MIN + (pkCfg.PROB_MAX - pkCfg.PROB_MIN) * Math.pow(passingNorm, pkCfg.CURVE_EXPONENT);

// After
let kickChance = pkCfg.PROB_MIN + (pkCfg.PROB_MAX - pkCfg.PROB_MIN) * Math.pow(passingNorm, pkCfg.CURVE_EXPONENT);
const postPs = actor.tendencies?.playStyle ?? 0;
kickChance *= (1 - postPs * SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K);
```
(PnR_Roll도 동일 패턴, 변수명만 `rollKickChance`/`rollPs`/`screener` 기준)

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 이제 PostUp/PnR_Roll/Iso/
PnR_Handler 4개 플레이타입 전부 동일한 킥아웃 설계(지수 커브 + playStyle 보정)로 통일됨.

**롤백 방법**: `kickChance`/`rollKickChance`를 `let`→`const`로 되돌리고 playStyle 보정 두 줄 제거.

---

## 2026-07-31 — Iso/PnR_Handler 킥아웃 도입 (playStyle 텐던시 최초 반영)

**배경**: PostUp/PnR_Roll에 이어 나머지 두 후보(Iso/PnR_Handler)에도 동일한 킥아웃 메커니즘 적용.
두 플레이타입 다 액터 선정 기준이 `isoScorer + handler*0.5`로 동일해 하든/루카/르브론식 "1대1·
픽앤롤에서 더블팀 유도 후 킥아웃"을 표현하기에 적합. 여기서 처음으로 `[SaveTendency] playStyle`
(-1 패스~+1 슛)을 킥아웃 확률에 반영 — 새 상수를 만들지 않고 `pickWeightedActor`가 이미 슈터/
패서 픽 가중치에 쓰던 `SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K`(0.25)를 재사용. 설계
검증을 위해 DB에서 Iso/PnR_Handler 액터 점유율 상위 10명(`isoScorer+handler*0.5` 직접 계산)을
뽑아 실제 성향에 맞춰 임의 배정한 playStyle로 시뮬레이션 — 매직 존슨(playStyle -0.8) 48.0% vs
카이리 어빙(+0.4) 23.9%처럼, 순수 스킬만으론 크지 않았을 격차가 성격 차이로 벌어지는 걸 확인
후 확정. PostUp/PnR_Roll에는 아직 `playStyle` 미적용 — 이번에 다듬은 뒤 소급 적용 예정(사용자
확정, 아직 미착수).

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SIM_CONFIG.ISO_KICKOUT`, `PNR_HANDLER_KICKOUT` 신규 추가 (둘 다 `PROB_MAX=0.40`,
  나머지는 `POST_KICKOUT`과 동일 구조)
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts`
  (server) — `Iso`/`PnR_Handler` 케이스에 킥아웃 분기 추가 (PostUp/PnR_Roll과 동일 구조 +
  `playStyle` 보정 곱연산 추가)
- `services/game/engine/commentary/textGenerator.ts` (client) / `server/src/shared/engine/commentary/textGenerator.ts`
  (server) — 킥아웃 커멘터리 블록을 `isPostUp` 불리언 분기에서 `playType` 키 기반 룩업 테이블
  (`Record<string, {threept,rimPaint,mid}>`)로 리팩터링, Iso/PnR_Handler 12블록(득점6+미스6) 추가

**Before/After (킥아웃 확률 계산)**:
```ts
// Before (PostUp/PnR_Roll 패턴 그대로)
let kickChance = pkCfg.PROB_MIN + (pkCfg.PROB_MAX - pkCfg.PROB_MIN) * Math.pow(passingNorm, pkCfg.CURVE_EXPONENT);

// After (Iso/PnR_Handler — playStyle 보정 추가)
let kickChance = ikCfg.PROB_MIN + (ikCfg.PROB_MAX - ikCfg.PROB_MIN) * Math.pow(passingNorm, ikCfg.CURVE_EXPONENT);
const ps = actor.tendencies?.playStyle ?? 0;
kickChance *= (1 - ps * SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K);
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 실측 기반 사전 시뮬레이션
(액터 점유율 상위 10명 + 임의 배정 playStyle) 완료 — 실제 재시뮬레이션 결과는 다음 세션 신규
데이터로 확인 필요.

**주의사항**: PostUp/PnR_Roll에는 아직 `playStyle` 보정이 없음 — 사용자가 "Iso/Handler로 다듬은
뒤 소급 적용" 하기로 확정했으나 아직 미착수. 4개 플레이타입 전부 일관되게 만들려면 추후 작업 필요.

**롤백 방법**: `playTypes.ts`의 `Iso`/`PnR_Handler` 케이스에서 킥아웃 분기 제거, `textGenerator.ts`의
킥아웃 룩업 테이블에서 `Iso`/`PnR_Handler` 항목 제거(또는 리팩터링 전 `isPostUp` 불리언 분기로
되돌림), `constants.ts`의 `ISO_KICKOUT`/`PNR_HANDLER_KICKOUT` 제거.

---

## 2026-07-31 — PnR_Roll 킥아웃 + isKickout 플래그(어시스트 확률·전용 커멘터리) 추가

**배경**: 바로 아래 항목(PostUp 킥아웃)에 이어 PnR_Roll에도 동일 메커니즘 적용 — 롤맨은 캐치 즉시
결정해야 해서 포스트업보다 판단 여유가 적다는 이유로 `PROB_MAX`만 절반(0.20)으로 설정. 추가로
두 가지 부수 문제를 발견해 함께 해결: ①`playType`을 그대로 유지하다 보니 킥아웃 슛도 원래
용도(PostUp의 엔트리패스 0.55, PnR_Roll의 앨리웁 0.90)로 캘리브레이션된 `assistOdds`를 그대로
적용받는 문제 — 더블팀을 뚫는 명백한 의도적 패스인데 부적절한 확률이 적용됨. ②PnR_Roll의 기존
Rim/Paint+덩크+어시스트 커멘터리("~가 띄워주고 ~가 앨리웁으로!")가 원래 "핸들러→롤러 앨리웁"
전용으로 만들어진 문구인데, 킥아웃(롤러가 반대로 킥아웃해서 받은 선수가 돌파 마무리)에도 잘못
적용될 수 있는 문제. `PossessionResult`/`PlayContext`에 `isKickout` 플래그를 신설해 두 문제를
한 번에 해결 — 사용자와 사전에 득점 6세트+미스 6세트(PostUp/PnR_Roll × 3PT/Rim·Paint/Mid) 총
12개 커멘터리 블록을 확정한 뒤 구현.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SIM_CONFIG.PNR_ROLL_KICKOUT` 신규 추가 (`POST_KICKOUT`과 동일 구조, `PROB_MAX`만 0.20)
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts`
  (server) — `PlayContext`에 `isKickout?: boolean` 추가, `PnR_Roll` 케이스에 킥아웃 분기 추가
  (구조는 PostUp과 동일: 롤러의 `passVision+passAcc` 기반 킥아웃 확률 → 발동 시 `spacer` 기준
  킥아웃 타깃으로 `actor` 교체, 롤러는 `secondaryActor`), PostUp 킥아웃 분기 반환값에도 `isKickout: true` 추가
- `services/game/engine/pbp/pbpTypes.ts` (client) / `server/src/shared/engine/pbp/pbpTypes.ts`
  (server) — `PossessionResult`에 `isKickout?: boolean` 추가
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — `playCtx`에서 `isKickout` 추가 destructure, `miss`/`score` `PossessionResult` 생성 시 전달
- `services/game/engine/pbp/statsMappers.ts` (client) / `server/src/shared/engine/pbp/statsMappers.ts`
  (server) — 어시스트 확률 계산에 `isKickout` 우선 분기(고정 0.9) 추가, `generateCommentary()` 호출
  (score/miss) `flags`에 `isKickout` 전달
- `services/game/engine/commentary/textGenerator.ts` (client) / `server/src/shared/engine/commentary/textGenerator.ts`
  (server) — `generateCommentary()` 시그니처에 `isKickout` 추가, score/miss 섹션 최상단에 PostUp/PnR_Roll
  킥아웃 전용 커멘터리 12블록 삽입(존별 3PT/Rim·Paint/Mid × PostUp/PnR_Roll × 득점/미스). 이 블록이
  최상단에서 먼저 `return`하므로 기존 PnR_Roll 앨리웁 문구(Rim/Paint+덩크+어시스트)는 킥아웃 케이스에
  자연히 도달하지 않게 됨(별도 가드 불필요)

**Before/After (assistOdds)**:
```ts
// Before
const prob = playType ? (assistOdds[playType] ?? 0.60) : 0.60;
// After
const prob = result.isKickout ? 0.9 : (playType ? (assistOdds[playType] ?? 0.60) : 0.60);
```

**PNR_ROLL_KICKOUT 값**: `PASSING_MIN=40, PASSING_MAX=99, PROB_MIN=0, PROB_MAX=0.20, CURVE_EXPONENT=1.3`
(POST_KICKOUT과 동일 곡선, 확률만 정확히 절반).

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드.

**롤백 방법**: `playTypes.ts`의 `PnR_Roll` 케이스에서 킥아웃 분기 제거, `isKickout` 관련 변경을
전 파일에서 되돌리고, `constants.ts`의 `PNR_ROLL_KICKOUT` 제거.

---

## 2026-07-31 — PostUp 킥아웃 메커니즘 신규 도입 (플레이메이킹 빅 어시스트 부족 해결)

**배경**: "32 TEST 6" 실측에서 요키치/사보니스 어시스트가 각각 4.17/4.15개(AST/36 5.08/5.13)로
포지션 평균(C 2.68) 대비 1.9배에 그쳐, 실제 NBA 격차(5~6배)에 크게 못 미침을 확인. 코드 추적 결과
`PostUp`(C 포지션 가중치 60%)과 `PnR_Roll`(C 70%) — 센터 점유율 대부분을 차지하는 두 플레이타입
모두 "빅맨은 항상 슈터, 절대 패서가 될 수 없다"는 구조였음(더블팀 유도 후 킥아웃하는 분기 자체가
없음). `DriveKick`이 이미 "드라이버가 킵할지 킥아웃할지" 확률적으로 결정하고 액터를 교체하는
동일한 패턴을 갖고 있어 이를 참고해 PostUp에 먼저 적용하기로 함(PnR_Roll은 추후 논의).

설계 과정에서 시행착오: 처음엔 DriveKick과 동일하게 `postScorer/(postScorer+postPassing)` 비율로
설계했으나, 실측 결과(샤킬 오닐도 킥아웃 38%) 두 값이 같은 0~99 스케일이라 격차가 안 벌어지는
문제 확인 — DB 조회로 하워드(48/45)·말론(54/56)의 passVision/passAcc이 실제로 포지션 중앙값과
거의 일치함을 확인해 "데이터가 이상한 게 아니라 공식 구조가 문제"임을 검증. 이후 `postPassing`
단독 기준의 정규화+지수 커브 방식으로 전환, 목표 지점(요키치 39.6%/사보니스 24.1%/센군 23.4%/
샤킬 9.8%/말론 6.7%/하워드 2.3%)에 맞춰 `PASSING_MIN=40/MAX=99, PROB_MIN=0/MAX=0.40,
CURVE_EXPONENT=1.3`으로 확정(사용자가 지수 2.0→1.5→1.3 순으로 직접 비교 후 결정).

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SIM_CONFIG.POST_KICKOUT` 신규 추가 (`PASSING_MIN/MAX`, `PROB_MIN/MAX`,
  `CURVE_EXPONENT`, `PASSIQ_BONUS_NEUTRAL/SCALE`)
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts`
  (server) — `PostUp` 케이스에 킥아웃 분기 추가 (DriveKick 패턴 참고: 확률 발동 시 `actor`를
  킥아웃 타깃으로 교체, 원래 포스트 선수는 `secondaryActor`로 어시스트 후보가 됨)

**Before**: PostUp은 항상 포스트 선수 본인이 슛(Rim/Paint는 `resolveFinish`, 아니면 Mid 점퍼),
엔트리 패서(포스트에 넣어준 선수)만 어시스트 후보.

**After**:
```ts
const pkCfg = SIM_CONFIG.POST_KICKOUT;
const postPassing = (actor.attr.passVision + actor.attr.passAcc) / 2;
const passingNorm = Math.max(0, Math.min(1, (postPassing - pkCfg.PASSING_MIN) / (pkCfg.PASSING_MAX - pkCfg.PASSING_MIN)));
const kickChance = pkCfg.PROB_MIN + (pkCfg.PROB_MAX - pkCfg.PROB_MIN) * Math.pow(passingNorm, pkCfg.CURVE_EXPONENT);

if (Math.random() < kickChance) {
    const kickTarget = pickWeightedActor(p => p.archetypes.spacer, actor.playerId);
    const passIqBonus = Math.max(0, (actor.attr.passIq - pkCfg.PASSIQ_BONUS_NEUTRAL) / 30 * pkCfg.PASSIQ_BONUS_SCALE);
    // kickTarget이 새 actor, 원래 포스트 선수(actor)는 secondaryActor(어시스트 후보)
    // koZone은 selectZone()으로 kickTarget 본인의 zonePref를 그대로 반영 (3점 고정 아님)
    ...
}
// 기존 로직: 킥아웃 미발동 시 포스트 선수 본인이 마무리 (entryPasser만 이 경로에서 계산)
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 실측 기반 사전 계산으로
목표 확률 확정 완료 — 실제 재시뮬레이션 결과(요키치/사보니스 어시스트 상승 여부)는 다음 세션
신규 경기 데이터로 필요.

**주의사항**: PnR_Roll에는 아직 동일 메커니즘이 없음 — C 포지션 점유율의 70%를 차지하는 또 다른
축이라 다음에 논의 후 적용 필요.

**롤백 방법**: `playTypes.ts`의 `PostUp` 케이스를 Before 로직으로 되돌리고, `constants.ts`의
`POST_KICKOUT` 제거.

---

## 2026-07-31 — CatchShoot/PnR_Pop 액터 선정에 zonePref.three 페널티 적용

**배경**: "32 TEST 6" 실측에서 찰스 바클리(존 선호도 탭 cnr/p45/atb 전부 0, 즉 3점을 전혀 안 쏘려는
텐던시)가 경기당 3점을 3.08개나 시도하는 걸 확인. 조사 결과 `CatchShoot`(`preferredZone:'3PT'`
고정, 2026-07 설계 변경)과 `PnR_Pop`(동일하게 3점 고정)이 액터를 각각 `archetypes.spacer`/`popper`
(순수 능력치 기반 — spacer는 3점스킬 60%+shotIq 25%+offConsist 15%, popper는 스크리닝 능력
60%+3점스킬 40%)로만 뽑고, `zonePref`/`selectZone()` 시스템을 완전히 우회한다는 걸 확인 — 바클리는
shotIq88/offConsist98이 높아 spacer=75.7, popper=66.09로 경쟁력 있는 점수가 나와 종종 액터로
뽑히고, 뽑히면 텐던시 무시하고 무조건 3점을 쏨. 실측(`shot_events.playType`)으로 그의 3PA 40개
전부(PnR_Pop 27 + CatchShoot 13)가 이 두 플레이타입에서만 나옴을 확인 — 다른 3점 가능 플레이타입
(Iso/PnR_Handler/Handoff/Transition/OffBallScreen/DriveKick, 전부 `selectZone()` 정상 경로)에서는
0개, 즉 `selectZone()`의 기존 소프트 임계값(`ZONE_PREF_THRESHOLD=0.15`, 미만이면 ×0.2 페널티)은
이미 잘 작동 중이었고 CatchShoot/PnR_Pop만 이 페널티를 우회하고 있었음이 확정됨.

수정: 새 임계값을 만들지 않고 `selectZone()`이 이미 쓰는 `SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD`
를 그대로 재사용해, CatchShoot/PnR_Pop의 액터 선정 가중치에도 동일한 ×0.2 페널티를 적용. 올타임
레전드 풀 실측(케빈 러브 zonePref.three=0.799, 마일스 터너=0.521, 라우리 마카넨=0.552)으로 3팀
시뮬레이션해 검증 — 텐던시 진짜 있는 빅맨(러브/마카넨)은 텐던시 0인 팀원(너키치/유잉) 대비 확실히
유리해지고(PnR_Pop 선정확률 예: 러브 45.9%→81.0%, 마카넨 57.7%→87.2%), 로스터 전원이 정상
텐던시를 가진 팀(cha, 마일스 터너/밥 페팃 둘 다 임계값 이상)은 **변화 없음**을 확인 — 부작용 없음.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts`
  (server) — `CatchShoot`/`PnR_Pop` 케이스의 `pickWeightedActor` 기준식에 `zonePref.three` 페널티
  추가 (새 상수 없이 기존 `ZONE_SELECTION.ZONE_PREF_THRESHOLD` 재사용)

**Before**:
```ts
// PnR_Pop
const popper = pickWeightedActor(
    p => p.archetypes.popper,
    undefined, 'shooter',
    p => (popEligible[p.position] ?? 0) > 0
);
// CatchShoot
const actor = pickWeightedActor(p => p.archetypes.spacer);
```

**After**:
```ts
// PnR_Pop
const popper = pickWeightedActor(
    p => p.archetypes.popper * (p.zonePref.three < SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD ? 0.2 : 1.0),
    undefined, 'shooter',
    p => (popEligible[p.position] ?? 0) > 0
);
// CatchShoot
const actor = pickWeightedActor(p => p.archetypes.spacer * (p.zonePref.three < SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD ? 0.2 : 1.0));
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 실측 기반 사전 시뮬레이션(det팀
찰스 바클리 3.08→약1.4 3PA/game 추정, mem/cha/law 3팀 선정확률 변화 검증) 완료 — 실제 재시뮬레이션
결과는 다음 세션 신규 경기 데이터로 확인 필요.

**롤백 방법**: 두 `pickWeightedActor` 호출의 criteria 함수를 Before 블록으로 되돌리면 됨(상수 추가
없었으므로 constants.ts 변경 없음).

---

## 2026-07-31 — 리바운드 룰렛 재설계: 지수 증폭 + motor/신장/포지션 3분할 보정

**배경**: "지금 리바운드 룰렛이 너무 평평하다"는 사용자 피드백 — 압도적 능력치(웸반야마 defReb98)를
가진 선수도 팀원 대비 확률 우위가 크지 않다는 게 이전 세션들에서 실측으로 확인된 상태였음(선형
가중합 방식의 한계). 두 가지를 도입하기로 확정:
1. **능력치 기반 점수를 지수(SKILL_EXPONENT=2.0)로 증폭** — 팀 내 개인 배정(`selectRebounder`)
   단계에만 적용, 팀 단위 ORB% 판정(`calculateOrbChance`)은 미적용.
2. **motorIntensity 단독 ±15% 곱셈 보정 → motor/신장/포지션 3분할 보정으로 재설계**
   `score *= (0.7 + motor*0.1 + height*0.1 + pos*0.1)` — 신장은 실제 height(cm) 분포(중앙값
   198cm=중립점) 기준 커브로, 포지션은 C(1.5)>PF(1.2)>SF=SG=PG(1.0, 페널티 없음)로 설정. 셋 다
   극단으로 몰리면 기존과 동일하게 최대 ±15%지만 보통은 서로 상쇄되어 순수 모터 하나가 좌우하던
   것보다 완만해짐 — 이렇게 하면 "실력"(지수 증폭된 능력치)이 배분을 주도하고, 신장/포지션은
   구조적 이점을, motor는 경기별 컨디션 변동을 보조적으로 반영하는 역할 분담이 됨.

실측 예시(웸반야마 C / 로드먼 PF / 웨스트브룩 PG + 평균 SF·SG 라인업, motor=1.0 중립)로 검증 —
지수만 적용 시 로드먼(능력치가 웸반야마보다 근소 우위)이 32.7% vs 웸반야마 27.8%로 앞섰는데,
신장/포지션 보정을 추가하니 32.6% vs 29.5%로 격차가 좁혀짐 — 능력치 격차를 뒤집진 않지만 체격/
위치의 구조적 이점을 완화 요인으로 반영한다는 설계 의도대로 작동.

**⚠ 알려진 이슈**: `types/player.ts`의 텐던시 문서 스펙("0.5~1.5, 리바운드 확률 ±15%")은 motor
단독 기준으로 작성돼 있어 이제 실제 구현(motor 단독으로는 최대 ±5%)과 불일치. 문서 갱신 여부는
사용자에게 질문했으나 명시적 답변 없이 구현 진행 확정 — 추후 확인 필요.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SIM_CONFIG.REBOUND`에 `SKILL_EXPONENT`(2.0), `MOTOR_COEFF`/`HEIGHT_COEFF`/`POSITION_COEFF`
  (각 0.1), `HEIGHT_CURVE`, `POSITION_FACTOR` 신규 추가
- `services/game/engine/pbp/reboundLogic.ts` (client) / `server/src/shared/engine/pbp/reboundLogic.ts`
  (server) — `selectRebounder()`의 점수 계산에 지수 증폭 + 3분할 보정 적용, `flowEngine.ts`에서
  `interpolateCurve` 임포트 추가

**Before**:
```ts
let score = (baseFormula) * shooterPenalty;
// Harvester/Raider (disabled)...
score *= (0.7 + (p.tendencies?.motorIntensity ?? 1.0) * 0.3);
```

**After**:
```ts
const baseScore = (baseFormula);
let score = Math.pow(baseScore, cfg.SKILL_EXPONENT) * shooterPenalty;
// Harvester/Raider (disabled)...
const motorFactor = p.tendencies?.motorIntensity ?? 1.0;
const heightFactor = interpolateCurve(p.attr.height, cfg.HEIGHT_CURVE);
const posFactor = cfg.POSITION_FACTOR[p.position] ?? 1.0;
score *= (0.7 + motorFactor * cfg.MOTOR_COEFF + heightFactor * cfg.HEIGHT_COEFF + posFactor * cfg.POSITION_COEFF);
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 순환 임포트 확인(`flowEngine.ts`는
`reboundLogic.ts`를 임포트하지 않음, 위험 없음). 실측 재검증(리바운드 상위권 쏠림이 체감되는지)은
다음 세션 신규 경기 데이터로 필요.

**롤백 방법**: `reboundLogic.ts`의 점수 계산을 Before 블록으로 되돌리고, `constants.ts`의
`SKILL_EXPONENT`/`MOTOR_COEFF`/`HEIGHT_COEFF`/`POSITION_COEFF`/`HEIGHT_CURVE`/`POSITION_FACTOR` 제거.

---

## 2026-07-31 — 팀 리바운드 증발 버그 수정 (TEAM_REB_RATE_FG/FT 제거)

**배경**: "32 TEST 4"/"32 TEST - ACTIVE" 실측에서 pace=5(중립) 기준 팀 평균 REB가 38.8개로 실제
NBA(~43.5개, 약 11% 부족)보다 낮음을 확인. 원인 추적 결과 `SIM_CONFIG.REBOUND.TEAM_REB_RATE_FG`
(10%, FG 미스)와 `TEAM_REB_RATE_FT`(15%, FT 마지막 시도 미스) — 미스가 나면 이 확률로 개인
리바운드 배정을 스킵하는 로직이 있었는데, 이게 개인은 물론 **팀 합계에도 전혀 반영이 안 되고
그냥 증발**하는 버그였음. 실제 NBA의 "팀 리바운드"는 아웃오브바운즈/루스볼파울/쿼터종료/FT
바이올레이션 등 구체적 상황에 결부되고 팀 합계엔 포함되는데(웹 검색으로 확인), 이 엔진엔 그
4가지 상황이 하나도 시뮬레이션 안 돼 있어 이 카테고리를 유지할 인과적 근거가 없다고 판단 —
"팀 리바운드" 개념 자체를 제거하고 미스 시 항상 개인에게 배정하도록 단순화(옵션 A, 사용자 확정).
수치 검증: pace=5 기준 자책 미스 40.8개×10%≈4.08개가 매 경기 증발 — 실측 부족분(4.7개)의 87%를
이 메커니즘 하나로 설명.

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — Miss path에서 `TEAM_REB_RATE_FG` 확률 체크 제거, 항상 `resolveRebound()` 호출
- `services/game/engine/pbp/statsMappers.ts` (client) / `server/src/shared/engine/pbp/statsMappers.ts`
  (server) — `handleFreeThrowRebound()`에서 `TEAM_REB_RATE_FT` 확률 체크 제거
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SIM_CONFIG.REBOUND`에서 `TEAM_REB_RATE_FG`/`TEAM_REB_RATE_FT` 상수 제거(더 이상
  참조되지 않는 dead code)

**Before**:
```ts
// possessionHandler.ts (Miss path)
let rebounder: LivePlayer | undefined;
let reboundType: 'off' | 'def' | undefined;
if (Math.random() >= SIM_CONFIG.REBOUND.TEAM_REB_RATE_FG) {
    const reb = resolveRebound(state.home, state.away, actor.playerId);
    rebounder = reb.player;
    reboundType = reb.type;
}
return { type: 'miss', ..., rebounder, reboundType, ... };

// statsMappers.ts (handleFreeThrowRebound)
const handleFreeThrowRebound = (shooter: LivePlayer) => {
    if (Math.random() < SIM_CONFIG.REBOUND.TEAM_REB_RATE_FT) return;
    const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
    ...
};
```

**After**:
```ts
// possessionHandler.ts (Miss path)
const reb = resolveRebound(state.home, state.away, actor.playerId);
return { type: 'miss', ..., rebounder: reb.player, reboundType: reb.type, ... };

// statsMappers.ts (handleFreeThrowRebound)
const handleFreeThrowRebound = (shooter: LivePlayer) => {
    const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
    ...
};
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. `grep`으로 `TEAM_REB_RATE`
잔여 참조가 주석 외엔 없음을 확인. 실측 재검증(팀 REB가 43~44 근처로 회복되는지)은 다음 세션
신규 경기 데이터로 필요.

**롤백 방법**: 세 파일의 변경을 Before 블록으로 되돌리고, `constants.ts`에 두 상수(`TEAM_REB_RATE_FG: 0.10`,
`TEAM_REB_RATE_FT: 0.15`) 재추가.

---

## 2026-07-31 — 포제션 시간: pace 압축 도입 (고페이스 팀 득점 폭주 수정) + 상수화

**배경**: 바로 아래 항목(21→19 재조정)을 배포해 "32 TEST 4"/"32 TEST - ACTIVE" 룸에서 실측한 결과,
pace=5(중립, 대부분 팀) 기준으로는 평균 110.1점으로 목표대로 잘 맞았으나 **pace=8~10을 쓰는 팀만
심각하게 폭주**함을 확인 — pace=8 팀 평균 131.8점, pace=9 팀 평균 146.5점, den(pace8)×por(pace9)
매치업은 4연속 144~187점. 원인은 `19 - pace`가 pace=8/9/10에서 각각 11/10/9초라는, 실제 NBA
역대 최고속 팀(포제션 ~13.7초)보다도 훨씬 빠른 값을 만들어냈기 때문 — 게다가 이 엔진은 공격팀
자신의 pace가 그 포제션 길이를 결정하는 구조라 양쪽 다 고페이스인 매치업에서 효과가 배가됨.
`19 - pace`(pace=5 기준 14초, 실제 NBA 평균과 일치)의 중심값 자체는 정확했으므로, 기준점은
유지하고 **pace 1~10이 이 기준값에서 얼마나 벗어날 수 있는지(기울기)만 압축**하기로 함 — 사용자가
0.1/0.2/0.3~0.4 옵션을 비교 검토 후 0.2(pace=1→14.8초, pace=10→13.0초, 전체 스윙 1.8초)로 확정.
동시에 하드코딩돼 있던 `19`를 포함한 관련 상수를 `SIM_CONFIG.POSSESSION_TIME`으로 이동해 관리.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `POSSESSION_TIME: { BASE: 19, PACE_NEUTRAL: 5, PACE_COMPRESSION: 0.2 }` 신규 추가
- `services/game/engine/pbp/timeEngine.ts` (client) / `server/src/shared/engine/pbp/timeEngine.ts`
  (server) — `calculatePossessionTime()`의 기준값 계산을 압축 공식으로 변경, `SIM_CONFIG` 임포트 추가

**Before**:
```ts
const pace = sliders.pace;
let timeTaken = 19 - pace;
```

**After**:
```ts
const ptCfg = SIM_CONFIG.POSSESSION_TIME;
const pace = sliders.pace;
const compressedPace = ptCfg.PACE_NEUTRAL + (pace - ptCfg.PACE_NEUTRAL) * ptCfg.PACE_COMPRESSION;
let timeTaken = ptCfg.BASE - compressedPace;
```

**결과 비교**:
| pace | 기존(19-pace) | 신규(압축 0.2) |
|---|---|---|
| 1 | 18.0초 | 14.8초 |
| 5 (중립) | 14.0초 | 14.0초 (불변) |
| 8 | 11.0초 | 13.4초 |
| 9 | 10.0초 | 13.2초 |
| 10 | 9.0초 | 13.0초 |

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 순환 임포트 확인(`constants.ts`는
자체 import 없음, 위험 없음). 실측 재검증(고페이스 팀 득점이 정상 범위로 돌아오는지)은 다음 세션
신규 경기 데이터로 필요.

**롤백 방법**: `timeEngine.ts`의 계산식을 Before로 되돌리고, `constants.ts`의 `POSSESSION_TIME`
제거.

---

## 2026-07-30 — 포제션 시간 공식 재조정 (21-pace → 19-pace)

**배경**: "32 TEST 3" 실측에서 팀당 평균 FGA가 70.1개로 실제 NBA(~88.5개)보다 크게 낮은 문제를
조사. 정규화(normalization)는 A/B 비교로 주범이 아님을 확인(정규화 OFF 룸도 FGA 72.4로 거의
동일), pace 슬라이더와 FGA 상관관계(r=0.55)는 확인됐으나 pace를 최댓값(10)까지 올려도 예측 FGA가
78.1로 여전히 NBA 대비 부족 — 슬라이더 튜닝이 아니라 포제션 시간 계산 공식 자체의 캘리브레이션
문제로 결론. `timeEngine.ts`의 `calculatePossessionTime()` 기본값 공식(`21 - pace`)을 실측과
대조한 결과: pace=5(중립, 룸 평균 5.31에 근접) 기준 공식 예측값 16초가 실측 포제션 길이(게임
클락 2880초 / (86.1 포제션×2팀) ≈ 16.72초)와 거의 정확히 일치 — 이 공식이 포제션 부족의 직접
원인임을 확인. 실제 NBA 평균 포제션 길이(2880초/(99.3페이스×2)≈14.5초)보다 약 1.5초(10~15%)
길게 잡혀있었음. 부작용 검토(득점 오버슈트 여부, 파울 재발 위험, 체력/로테이션 영향)를 사전에
논의 — 득점은 현재 95.3점/팀으로 NBA(114.2점) 대비 여유가 있어 오버슈트 위험 낮음, 체력/로테이션은
`timeTaken`(경과 초) 기반이라 총량 불변으로 영향 없음 확인. 다만 포제션 증가로 파울 발생 "기회"도
늘어나 평범한 빅맨(스킬 커브 혜택 적은 KAT/부셰비치 등)의 파울 수가 재상승할 가능성은 사용자도
인지한 상태로 진행 확정.

**변경 파일**:
- `services/game/engine/pbp/timeEngine.ts` (client) / `server/src/shared/engine/pbp/timeEngine.ts`
  (server) — `calculatePossessionTime()`의 기본 공식 `21 - pace` → `19 - pace`

**Before**: `let timeTaken = 21 - pace;` (pace=1→20초, pace=5→16초, pace=10→11초)

**After**: `let timeTaken = 19 - pace;` (pace=1→18초, pace=5→14초, pace=10→9초)

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 이론상 pace=5 기준 포제션
길이 16.72초→14초대로 하락 예상, 포제션 개수 약 12~13% 증가(FGA/PTS/REB/AST/TOV/FTA 등 전체
카운팅 스탯 비례 증가 전망). 실측 재검증은 다음 세션의 신규 경기 데이터로 필요.

**주의사항**: 이 변경으로 파울 발생 기회 자체가 늘어나므로, 이번 세션에서 도입한 파울트러블
완화책들(수비자 스킬 커브/PostUp 크로스매치/PnR_Roll 스위치 하한)의 순효과가 부분적으로 상쇄될
수 있음 — 특히 스킬 커브 혜택이 적은 평범한 빅맨(KAT, 부셰비치 등)은 파울 수가 다시 늘어날 가능성.
다음 세션에서 반드시 재실측 필요.

**롤백 방법**: `19 - pace`를 `21 - pace`로 되돌리면 됨.

---

## 2026-07-30 — PnR_Roll 전용 스위치 하한 도입

**배경**: PostUp 크로스매치(바로 아래 항목) 이후 PnR_Roll도 논의. PnR_Roll은 PostUp과 달리
`isScreenPlay` 목록에 포함돼 스위치 메커니즘 자체는 이미 존재(스위치 발동 시 핸들러를 막던 가드가
롤러를 대신 막음 — foul 노출이 C에서 가드로 자연스럽게 이동). 문제는 `tacticGenerator.ts:320`의
`if (maxOf(rimProtScore) >= 88) switchFreq = clamp(Math.min(switchFreq, 5))` — 엘리트 림프로텍터
보유팀은 switchFreq가 5로 캡핑돼 스위치 확률이 최대 25%(`5×0.05`)로 묶임. 이 캡 자체는 "엘리트
수비수를 함부로 스위치 안 시킨다"는 합리적 전략이라 유지하기로 하고, 대신 **PnR_Roll에 한해서만**
스위치 확률에 별도 하한을 둬서 캡보다 더 낮게 잡힌 보수적 전술에서도 최소 전가를 보장하기로 함.
POST_CROSS_MATCH와 동일한 설계 철학(슬라이더 종속으로 완전히 0에 수렴하지 않도록 하한 확보).

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `PNR_ROLL_SWITCH_MIN: 0.15` 신규 추가 (POST_CROSS_MATCH 블록 바로 아래)
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — `identifyDefender()`의 "3. Switch Logic" 섹션, `switchChance` 계산식을 PnR_Roll
  전용 분기로 변경 (다른 스크린 플레이는 기존 `switchFreq*0.05` 그대로 유지)

**Before**:
```ts
if (isScreenPlay && !isZone && screenPlayer) {
    const switchChance = sliders.switchFreq * 0.05;
    ...
```

**After**:
```ts
if (isScreenPlay && !isZone && screenPlayer) {
    const switchChance = playType === 'PnR_Roll'
        ? Math.max(sliders.switchFreq * 0.05, SIM_CONFIG.PNR_ROLL_SWITCH_MIN)
        : sliders.switchFreq * 0.05;
    ...
```

**동작**: `switchFreq=5`(캡 걸린 상태, 25%)에선 하한(15%) 미만이 아니므로 발동 안 함 — 이 하한은
switchFreq를 5보다도 낮게 잡은 팀에서만 실제로 작동. Handoff/OffBallScreen/PnR_Handler/PnR_Pop 등
다른 스크린 플레이는 영향 없음.

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드.

**롤백 방법**: `switchChance` 계산식을 Before로 되돌리고, `constants.ts`의 `PNR_ROLL_SWITCH_MIN` 제거.

---

## 2026-07-30 — PostUp 크로스매치 도입 (C→PF 수비 배정 일부 전가)

**배경**: 슈팅파울 확률 커브(수비자 스킬)를 도입했음에도, "32 TEST 3" 실측에서 확인된 C의 림/페인트
수비 노출량 자체(PF 대비 4배 이상, 림 컨테스트 8.37 vs 1.99)는 그대로 남아있음을 사용자가 재확인.
원인은 `identifyDefender()`에서 PostUp이 `isScreenPlay` 목록(스위치 로직 대상)에서 빠져있어 —
actor가 C면 상대 C가 스위치/전가 없이 100% 고정으로 막음. 처음엔 "PF에게 전가하는 비율을 helpDef
슬라이더로만 결정"하는 안을 검토했으나, 슬라이더를 낮게 잡은 팀은 전가가 0에 수렴해 "헬프디펜스 안
쓰는 팀 빅맨은 파울트러블에서 전혀 못 벗어난다"는 근본 문제가 재발함을 사용자가 지적 — `HELP_DEFENSE`
(ATTEMPT_BASE+PER_LEVEL)와 동일하게 **BASE 하한 + helpDef 슬라이더 가산** 구조로 설계, 사용자가
BASE=15%/최대=35%로 확정.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `POST_CROSS_MATCH: { BASE: 0.15, PER_LEVEL: 0.20/9 }` 신규 추가 (HELP_DEFENSE 블록 바로 아래)
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — `identifyDefender()`에 "2.5 PostUp Cross-Match" 단계 신규 추가 (2. 기본 매칭 이후,
  3. 스위치 로직 이전 — Ace Stopper가 명시 지정된 경우는 1번에서 이미 반환되어 크로스매치 대상 제외)

**Before**: (해당 로직 없음 — PostUp은 2번 기본 포지션 매칭 결과를 그대로 반환)

**After**:
```ts
// 2.5 PostUp Cross-Match
if (playType === 'PostUp' && !isZone && defender && defender.position === 'C') {
    const crossCfg = SIM_CONFIG.POST_CROSS_MATCH;
    const crossMatchChance = crossCfg.BASE + (sliders.helpDef - 1) * crossCfg.PER_LEVEL;
    if (Math.random() < crossMatchChance) {
        const crossDef = defTeam.onCourt.find(p => p.position === 'PF' && p.playerId !== defender!.playerId);
        if (crossDef) {
            return { defender: crossDef, isSwitch: true, isBotchedSwitch: false, pnrCoverage: 'none' };
        }
    }
}
```

**동작**: `helpDef=1`(최소)일 때도 15%는 PF 전가, `helpDef=5.5`(중립) ~24.4%, `helpDef=10`(최대) 35%.
PostUp에서 actor가 C이고 상대 팀 매칭 수비수도 C일 때만 발동 — PF가 온코트에 없으면(예: 빅맨 2명이
C+C인 라인업) 발동 안 하고 원래 매칭 유지.

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드.

**롤백 방법**: `possessionHandler.ts`의 "2.5 PostUp Cross-Match" 블록 삭제, `constants.ts`의
`POST_CROSS_MATCH` 제거.

---

## 2026-07-30 — INTERIOR_SKILL_CURVE 상위권 강화 (바로 아래 항목 후속 조정)

**배경**: 바로 아래 항목에서 도입한 수비자 파울회피 스킬 커브의 88/93/97 구간을 사용자가 직접
더 강하게 조정 — 최상위 림프로텍터(올라주원/고베어/카림)에게 더 뚜렷한 파울 감소 혜택을 주기 위함.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server)
  — `SHOOTING_FOUL.INTERIOR_SKILL_CURVE`의 88/93/97 지점 값만 변경 (45/60/72/82는 그대로)

**Before**: `[88, -0.035], [93, -0.050], [97, -0.065]`
**After**: `[88, -0.05], [93, -0.065], [97, -0.09]`

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 이론값 — 올라주원(블렌드96.3)
Rim 파울확률 16%→10.86%(기존 12.26%에서 추가 하락), 고베어(95.0) 16%→11.35%, 카림(95.7) 16%→11.09%.
KAT/부셰비치(중립점 이하)는 무변화 유지.

**롤백 방법**: `INTERIOR_SKILL_CURVE`의 88/93/97 값을 Before로 되돌리면 됨.

---

## 2026-07-30 — 슈팅파울: 수비자 파울회피 스킬 커브 신규 도입 (엘리트 빅맨 파울트러블 개선)

**배경**: "32 TEST 3" 실측 데이터에서 C 포지션 PF/36이 4.56으로 PF(2.23)의 2배, 스몰포지션(1.15~1.63)의
3~4배에 달함을 확인. 특히 올라주원/고베어/카림 압둘자바/유잉이 나란히 경기당 평균 5.33파울(사실상
매 경기 파울아웃 직전). 코드 추적 결과 `identifyDefender()`의 포지션 1:1 매칭 + `POSITION_WEIGHT`
(PostUp C60%, PnR_Roll C70%)가 겹쳐 C의 림/페인트 수비 노출량이 PF의 4배 이상(실측: 림 컨테스트
8.37 vs 1.99)임을 확인 — 노출량(볼륨) 차이만으로 관측된 PF/36 격차 대부분이 설명됨. 사용자가
"슛 개수(공격 배분)는 건드리지 않는다"는 전제를 명확히 함에 따라, 노출량 재분배 대신 슈팅파울
확률식 자체의 비대칭을 조사 — 슈터의 파울유도 스킬(`drFoul`)은 `DRAW_FOUL_CURVE`로 반영되는데
**수비자의 컨테스트 기술은 어디에도 반영되지 않고 있었음**(랜덤 성향 `foulProneness` 제외). DB
확인 결과 올라주원(intDef97/defConsist95)과 KAT(intDef72/defConsist68)처럼 수비 기술 격차가 큰
선수들이 동일한 파울 확률을 적용받고 있었음 — 실제 NBA에서 고베어류 엘리트 림프로텍터가 "컨테스트
볼륨 대비 파울은 적게 범한다"(버티컬리티 기술)는 특성이 전혀 모델링되지 않은 것.

포지션이 아니라 **수비 존(Rim/Paint vs Mid/3PT) 기준**으로 공식을 분리하기로 결정 — 이미 코드에
`DEF_INTENSITY_MATCHUP_CURVE_INTERIOR`(intDef)/`_PERIMETER`(perDef) 패턴이 있어 일관성 유지,
스위치/미스매치(가드가 림에서 빅 대신 막는 경우 등)도 별도 분기 없이 자연스럽게 처리됨. DB 실측
결과 `defConsist`(정지 자세 유지력)는 포지션 무관 69~72로 균일(순수 기술/절제력 특성)한 반면
`intDef`/`perDef`는 포지션별로 크게 갈림(intDef: C 76.5 → PG 46.0) → 존별 주력 스탯 + 공용
`defConsist` 블렌드로 설계. 이 기능은 팀 전술 슬라이더(helpDef 등)와 무관하게 항상 적용되어,
이전에 검토했던 "슬라이더 종속적 완화책"이나 예전에 기각된 "High Tower 태그" 방식과 달리 연속
능력치 기반으로 항상 작동함.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SHOOTING_FOUL`에 `INTERIOR_SKILL_CURVE`/`PERIMETER_SKILL_CURVE` 신규 추가
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — 3. Shooting Foul Check 섹션에 수비자 스킬 블렌드(`intDef*0.65+defConsist*0.35` 인테리어 /
  `perDef*0.65+defConsist*0.35` 퍼리미터) → 커브 보정 → `zoneScale` 곱 → `shootingFoulRate`에 가산

**Before**:
```ts
const drawFoulBonus = interpolateCurve(actor.attr.drFoul, sFoulCfg.DRAW_FOUL_CURVE);
const zoneScale = sFoulCfg.ZONE_CURVE_SCALE[preferredZone] ?? 1.0;
shootingFoulRate += drawFoulBonus * zoneScale;

// defIntensity 보정...
```

**After**:
```ts
const drawFoulBonus = interpolateCurve(actor.attr.drFoul, sFoulCfg.DRAW_FOUL_CURVE);
const zoneScale = sFoulCfg.ZONE_CURVE_SCALE[preferredZone] ?? 1.0;
shootingFoulRate += drawFoulBonus * zoneScale;

// 수비자 파울회피 스킬 커브 — 존 기준(포지션 무관) 분리
const isInteriorZone = preferredZone === 'Rim' || preferredZone === 'Paint';
const defenderSkill = isInteriorZone
    ? defender.attr.intDef * 0.65 + defender.attr.defConsist * 0.35
    : defender.attr.perDef * 0.65 + defender.attr.defConsist * 0.35;
const defenderSkillCurve = isInteriorZone ? sFoulCfg.INTERIOR_SKILL_CURVE : sFoulCfg.PERIMETER_SKILL_CURVE;
shootingFoulRate += interpolateCurve(defenderSkill, defenderSkillCurve) * zoneScale;

// defIntensity 보정...
```

**커브 값 (신규)**:
```ts
INTERIOR_SKILL_CURVE: [   // Rim/Paint — 중립점 72 (C/PF 인테리어 블렌드 평균)
    [45, 0.025], [60, 0.010], [72, 0.000],
    [82, -0.020], [88, -0.035], [93, -0.050], [97, -0.065],
],
PERIMETER_SKILL_CURVE: [  // Mid/3PT — 중립점 71 (PG/SG/SF 퍼리미터 블렌드 평균)
    [45, 0.025], [55, 0.012], [71, 0.000],
    [80, -0.012], [86, -0.022], [92, -0.035], [97, -0.045],
],
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 이론값 계산 — 올라주원(블렌드96.3)
Rim 파울확률 16%→12.26%(-23% 상대), Paint 10%→6.88%(-31% 상대). KAT(블렌드70.6)는 16.07%/10.06%로
사실상 무변화(중립점 근처). 의도한 대로 "진짜 수비 기술이 뛰어난 선수만 혜택, 덩치만 큰 빅맨은
그대로"라는 목표와 일치.

**롤백 방법**: Before 블록으로 되돌리고, constants.ts의 `INTERIOR_SKILL_CURVE`/`PERIMETER_SKILL_CURVE`
2개 제거.

---

## 2026-07-30 — 전술 슬라이더 우측 상단 라벨 텍스트화 + 슬라이더 2종 이름 변경

**배경**: 전술 슬라이더(페이스/볼회전/공격리바운드/공격포인트/픽앤롤빈도/3점·골밑·미드레인지 빈도/
수비압박/스위치수비/풀코트프레스/헬프수비/지역방어/수비리바운드) 우측 상단에 값(1~10) 숫자만
표시되던 것을, 사용자가 지정한 구간별(1 / 2~4 / 5~6 / 7~9 / 10) 한국어 라벨로 교체해달라는 요청.
동시에 "P&R 의존도" → "픽앤롤 빈도", "중거리 슛 빈도" → "미드레인지 빈도"로 슬라이더 이름 자체도
변경. 엔진 계산에 쓰이는 `value`(1~10)는 그대로 두고 `label`(표시 텍스트)만 교체 — 엔진 로직/공식에는
영향 없음.

**변경 파일**:
- `services/game/config/sliderSteps.ts` (client) / `server/src/shared/game/config/sliderSteps.ts`
  (server 미러) — 기존 `TEN_STEPS`(모든 슬라이더가 `label: String(i+1)` 공유)를 슬라이더별
  `buildTieredSteps(v1, v2to4, v5to6, v7to9, v10)` 호출로 교체. `shot_3pt`/`shot_rim`/`shot_mid`는
  동일 5단계(매우 낮음/낮음/보통/높음/매우 높음) 공유하는 `FREQUENCY_STEPS`로 통합.
- `components/dashboard/tactics/TacticsSlidersPanel.tsx` — `pnrFreq` 슬라이더 라벨
  "P&R 의존도"→"픽앤롤 빈도", `shot_mid` 라벨 "중거리 슛 빈도"→"미드레인지 빈도"
  (SliderControl label prop + SliderGroupNotes label 둘 다)
- `components/game/tabs/LiveTacticsTab.tsx` — 동일 리네임 (`shot_mid`는 기존 "중거리 슛"→"미드레인지 빈도")
- `components/physics-lab/MotionSandboxPanel.tsx` — 동일 리네임 (물리 실험용 슬라이더 패널)
- `components/game/TacticsAnalysis.tsx` — `SLIDER_LABELS.pnrFreq` "P&R 의존도"→"픽앤롤 빈도"
  (경기 후 전술 비교 분석 화면, 동일 키 표시용 텍스트라 함께 통일)

**Before** (`sliderSteps.ts`):
```ts
const TEN_STEPS: SliderStep[] = Array.from({ length: 10 }, (_, i) => ({
    value: i + 1,
    label: String(i + 1),
}));

export const SLIDER_STEPS: Record<string, SliderStep[]> = {
    pace: TEN_STEPS,
    ballMovement: TEN_STEPS,
    // ... 전체 14개 키 모두 TEN_STEPS 공유
};
```

**After** (`sliderSteps.ts`):
```ts
function buildTieredSteps(v1: string, v2to4: string, v5to6: string, v7to9: string, v10: string): SliderStep[] {
    const labels = [v1, v2to4, v2to4, v2to4, v5to6, v5to6, v7to9, v7to9, v7to9, v10];
    return labels.map((label, i) => ({ value: i + 1, label }));
}

export const SLIDER_STEPS: Record<string, SliderStep[]> = {
    pace: buildTieredSteps('정돈된 공격', '지공 위주', '보통', '속공 위주', '런앤건'),
    ballMovement: buildTieredSteps('히어로볼', '아이솔레이션', '보통', '패스 위주', '시스템 농구'),
    offReb: buildTieredSteps('전원 크래시', '적극 가담', '보통', '빠른 백코트', '시도하지 않음'),
    insideOut: buildTieredSteps('페인트존 공략', '인사이드', '균형', '아웃사이드', '3점 선호'),
    pnrFreq: buildTieredSteps('픽앤롤 사용하지 않음', '보다 적은 픽앤롤', '보통', '보다 많은 픽앤롤', '적극적 픽앤롤 사용'),
    shot_3pt: FREQUENCY_STEPS, shot_rim: FREQUENCY_STEPS, shot_mid: FREQUENCY_STEPS, // 매우 낮음~매우 높음
    defIntensity: buildTieredSteps('거의 압박하지 않음', '적은 압박', '적당히 압박', '다소 강한 압박', '매우 강한 압박'),
    switchFreq: buildTieredSteps('스위치 하지 않음', '보다 적은 스위치', '적당한 스위치', '잦은 스위치', '무한 스위치'),
    fullCourtPress: buildTieredSteps('매우 낮은 압박', '낮은 압박 강도', '적당한 압박 강도', '강한 전방 압박', '하프코트 더블팀'),
    helpDef: buildTieredSteps('도움 수비 없음', '자기 위치 고수', '균형', '적극적 도움 수비', '강한 도움 수비'),
    zoneFreq: buildTieredSteps('강한 맨투맨 커버리지', '적당한 맨투맨 커버리지', '상황에 따름', '존 디펜스 고수', '강한 존 디펜스'),
    defReb: buildTieredSteps('전원 트랜지션 전환', '보다 적은 리바운더', '보통', '더 많은 리바운더', '적극적 박스아웃'),
};
```

**검증**: 로컬 tsconfig 미존재(프로젝트가 vite/esbuild만 사용) — `tsc --noEmit` 대신 `git diff --stat`으로
변경 범위(6개 파일, client/server 미러 동일 diff) 확인. `valueToStep`/`stepToValue`는 `.value` 필드만
참조하므로 라벨 텍스트 변경이 엔진 계산(회전율/확률 등)에 영향 없음.

**롤백 방법**: Before 블록 내용으로 `sliderSteps.ts`(client+server 둘 다) 되돌리고, 4개 컴포넌트 파일에서
"픽앤롤 빈도"→"P&R 의존도", "미드레인지 빈도"→"중거리 슛 빈도"(LiveTacticsTab은 "중거리 슛")로 되돌리면 됨.

---

## 2026-07-30 — 전술 슬라이더 하단 설명 문구(SliderGroupNotes) 전면 교체

**배경**: 위 항목(라벨 텍스트화)에 이어, 슬라이더 하단 설명 문구도 한 줄짜리 축약 설명에서
사용자가 직접 작성한 상세 설명(낮을 때/높을 때 각각의 효과, 어떤 선수 유형에게 유리한지 등)으로
교체해달라는 요청. 사용자가 명시한 12개 슬라이더(페이스/볼회전/공격리바운드/공격포인트/
픽앤롤빈도/수비압박강도/스위치수비/픽앤롤수비/풀코트프레스/헬프수비/지역방어/수비리바운드)만
교체하고, 언급되지 않은 3점·골밑·미드레인지 슛 빈도 설명은 기존 문구 유지.

**변경 파일**:
- `components/dashboard/tactics/TacticsSlidersPanel.tsx` — `SliderGroupNotes notes` 15개 항목 중
  12개 text 교체 (label 문자열은 변경 없음)
- `components/game/tabs/LiveTacticsTab.tsx` — 동일 12개 text 교체 (이 파일은 label이
  "골밑 공격"/"수비 압박"으로 축약되어 있어 label 자체는 그대로 두고 text만 교체)
- `components/physics-lab/MotionSandboxPanel.tsx` — 공격 슬라이더 5개(페이스/볼회전/
  공격리바운드/공격포인트/픽앤롤빈도)만 text 교체 (이 패널은 수비 슬라이더 미포함)

**Before/After**: 라인 수가 많아 git diff로 확인 권장 (`git show <commit> -- components/dashboard/tactics/TacticsSlidersPanel.tsx`).
텍스트만 교체, `label` 키/구조는 변경 없음 — 엔진 로직/공식과 무관한 순수 설명 문구.

**검증**: 순수 문자열 리터럴 교체(구조 변경 없음)이므로 `git diff --stat`으로 변경 파일 범위만 확인.

**롤백 방법**: 해당 커밋을 `git revert`하거나, 각 파일의 `SliderGroupNotes notes` 배열을 이전 커밋
버전으로 되돌리면 됨.

---

## 2026-07-30 — 플레이타입 분석 차트: 정렬 버그 수정 + 슈팅 존 선호도 섹션 삭제 + 그리드라인 추가

**배경**: 직전 항목(막대 하단 라벨 표시)에서 실제 화면을 보니, 라벨이 1줄/2줄로 컬럼마다 줄바꿈
개수가 달라 `%` 수치 행이 지그재그로 어긋나 보이는 버그 발견("들쑥날쑥 못생겼다" 피드백). 원인은
`% 수치 → 막대 → 라벨`을 하나의 `flex flex-col` 컬럼 안에 넣고, 부모 행을 `items-end`로 정렬한 것
— 라벨 줄바꿈 수가 다르면 컬럼 전체 높이가 달라지고, `items-end`가 그 차이를 컬럼 "위쪽"에
여백으로 흡수하면서 `%` 수치가 컬럼마다 다른 높이에 위치하게 됨. 동시에 사용자가 우측 "슈팅 존
선호도"(슬라이더 vs 로스터 성향 비교) 섹션은 의미 없는 데이터라 삭제 요청, 플레이타입 분석 영역을
그만큼 확장, 심플한 그리드라인 추가도 함께 요청.

**변경 파일**:
- `components/dashboard/tactics/charts/PlayTypePPP.tsx` — 전면 재작성.
  - `ZONES`/`zoneComparison`/`calculatePlayerOvr` import 및 우측 "슈팅 존 선호도" JSX 전부 삭제,
    `roster` prop도 더 이상 쓰이지 않아 인터페이스에서 제거
  - 정렬 버그 수정: 컬럼 단위 `flex-col`(%+막대+라벨을 한 덩어리로 묶음) 구조를 버리고,
    `% 수치 행` / `막대 행` / `라벨 행` 3개의 독립된 `flex` 행으로 분리. 각 행은 자기 자신의 flex
    아이템들 사이에서만 정렬되므로, 라벨 행의 줄바꿈 수가 달라져도 위의 수치 행·막대 행 정렬에
    전혀 영향을 주지 않음
  - 막대 행(`h-[150px]`)에 `absolute inset-0 flex flex-col justify-between` 컨테이너로 5개의
    수평 그리드라인(`bg-slate-800` 1px, 0/25/50/75/100% 등간격) 추가, 막대는 `z-10`으로 그 위에 렌더
  - 좌우 분할이 없어져 컴포넌트 전체가 부모 너비를 그대로 사용 (기존 `flex-1` 50/50 분배 → 단일
    `flex flex-col` 풀와이드)
- `components/dashboard/tactics/TacticsDataPanel.tsx` — `<PlayTypePPP sliders={sliders} roster={roster} />`
  → `<PlayTypePPP sliders={sliders} />` (roster prop 제거), 섹션 주석 "Play Type Analysis + Shot Zone
  Comparison" → "Play Type Analysis"

**Before** (정렬 버그 유발 구조):
```tsx
<div className="flex items-end gap-1.5 w-full">
  {data.map(item => (
    <div className="flex-1 min-w-0 flex flex-col items-center">
      <span>{item.distribution}%</span>
      <div className="w-full h-[150px] flex items-end"><div style={{height:pct%}} /></div>
      <span>{item.label}</span>  {/* 줄바꿈 수 컬럼마다 다름 → items-end가 위쪽 여백으로 흡수 */}
    </div>
  ))}
</div>
```

**After** (3행 분리 구조):
```tsx
<div className="flex gap-1.5">{/* 수치 행 */}</div>
<div className="relative flex items-end gap-1.5 h-[150px]">{/* 그리드라인 + 막대 행 */}</div>
<div className="flex gap-1.5">{/* 라벨 행 — 줄바꿈 무관하게 독립적 */}</div>
```

**검증**: dev 서버 curl 200 확인. 브라우저 시각 확인은 도구 제약으로 미수행 — 정렬이 실제로
고쳐졌는지 사용자 확인 필요.

**롤백 방법**: Before 블록 구조로 복원하고, `TacticsDataPanel.tsx`의 `PlayTypePPP` 호출에
`roster={roster}` 다시 추가 + 삭제된 `ZONES`/`zoneComparison`/우측 패널 JSX 복원(바로 위 항목의
Before/After 참고).

---

## 2026-07-30 — 플레이타입 분석 차트: 우측 범례 제거, 막대 하단에 라벨/수치 표시

**배경**: 바로 아래 항목(도넛→수직 바 교체) 직후, 바 그래프 옆에 남아있던 "PlayType + Share" 2열
범례 리스트가 중복 정보라 제거하고 대신 각 막대 하단에 라벨(플레이타입 이름)을 직접 표시해달라는
요청. 막대 위 % 수치 표시는 유지.

**변경 파일**:
- `components/dashboard/tactics/charts/PlayTypePPP.tsx` — 우측 `grid grid-cols-2` 범례 블록(색상
  점+라벨+% 10개 항목) 삭제. 좌측 "플레이타입 분석" 컬럼을 `flex-1`로 변경해 우측 "슈팅 존 선호도"
  컬럼과 50/50 폭 분배(기존엔 범례가 붙어 있어 좌측 폭이 고정 `w-[200px]`+legend였음). 막대 컬럼
  구조를 `% 수치(위) → 고정높이 h-[150px] 바 래퍼(중간) → 라벨 텍스트(아래)` 3단으로 재구성,
  각 컬럼에 `min-w-0` 추가(10개 flex-1 항목이 좁은 폭에서도 정상적으로 줄어들도록 — 없으면 긴
  라벨 때문에 flex blowout 발생 가능).

**Before**: 막대 옆에 "색상점 + 라벨 + %" 2열 grid 범례가 별도로 존재, 막대 자체엔 % 수치만 표시.

**After**: 범례 제거, 막대마다 위에는 %, 아래에는 라벨을 직접 표시하는 자기완결형 바 차트.

**검증**: dev 서버 curl 200 확인. 브라우저 시각 확인은 도구 제약으로 미수행 — 사용자 직접 확인 요망.

**롤백 방법**: 우측 grid 범례 블록을 되살리고 좌측 컬럼을 `flex-1` → 원래 클래스(`flex flex-col
gap-3`, 폭 고정 없음)로, 막대 컨테이너를 `w-[200px] h-[200px]`+`shrink-0`로 되돌리면 됨.

---

## 2026-07-30 — 플레이타입 분석 차트: 도넛 → 수직 바 그래프 교체

**배경**: 전술화면(TacticsDataPanel) "플레이타입 분석" 섹션이 SVG 도넛 차트로 10개 플레이타입
분포를 보여주고 있었는데, 사용자가 도넛 대신 수직 바 그래프로 바꿔달라고 요청. 엔진 로직/데이터
소스(`getPlayTypeDistribution`)는 변경 없이 시각화 형태만 교체.

**변경 파일**:
- `components/dashboard/tactics/charts/PlayTypePPP.tsx` — SVG `<circle>` 기반 도넛(stroke-dasharray
  세그먼트)을 제거하고, `data.map`으로 10개 막대를 `flex items-end` 컨테이너에 렌더링하는 수직 바
  차트로 교체. `DONUT_CX/CY/R/STROKE`, `CIRCUMFERENCE` 상수와 `donutSegments` useMemo 삭제,
  대신 최댓값 정규화용 `maxDistribution` useMemo 추가(가장 높은 막대가 컨테이너를 꽉 채우도록
  `height: (distribution/maxDistribution)*100%`로 스케일링). 막대 위에 `%` 수치 라벨 표시, 우측의
  2열 색상+라벨+% 리스트(범례)는 그대로 유지.

**Before** (도넛):
```tsx
const DONUT_CX = 80; const DONUT_CY = 80; const DONUT_R = 55; const DONUT_STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_R;
// ...
const donutSegments = useMemo(() => { /* stroke-dasharray 누적 오프셋 계산 */ }, [data]);
// <svg><circle .../> {donutSegments.map(seg => <circle strokeDasharray=... />)}</svg>
```

**After** (수직 바):
```tsx
const maxDistribution = useMemo(() => Math.max(1, ...data.map(d => d.distribution)), [data]);
// <div className="flex items-end gap-1.5 w-[200px] h-[200px]">
//   {data.map(item => <div style={{ height: `${(item.distribution/maxDistribution)*100}%` }} />)}
// </div>
```

**검증**: dev 서버(포트 5173, 기존 실행 중) `curl` 200 응답 확인. 브라우저 시각 확인은 도구 제약으로
수행하지 못함 — 필요 시 사용자가 전술화면에서 직접 확인 요망.

**롤백 방법**: Before 블록의 도넛 SVG 코드로 되돌리면 됨 (`donutSegments`/`DONUT_*`/`CIRCUMFERENCE`
상수 복원 필요).

---

## 2026-07-30 — 리바운드 로직: 공격/수비 리바운드 공식 분리 (DRB/ORB 전용 가중치)

**배경**: 리바운드 아키타입/모터인텐시티 점검(바로 아래 항목) 과정에서, 압도적 `defReb`를 가진
빅맨(웸반야마 98)도 실제 룰렛 선택 확률은 팀원 대비 크게 우위를 갖지 못한다는 걸 실측(500k
몬테카를로)으로 확인 — 기존 공식이 `rebAttr(offReb/defReb)*0.45 + vertical*0.2 + strength*0.10 +
boxOut*0.15 + hustle*0.10`으로 공격/수비 공용이었는데, 부차적 능력치(vertical/strength) 비중이
높아 defReb 우위가 희석됐기 때문. 이에 대해 사용자가 "수비 리바운드는 이미 자리를 잡은 상태라
defReb+boxOut이 핵심이고, 공격 리바운드는 밖에서 뛰어들어와 경합하는 것이라 offReb+허슬이 핵심"이라는
농구 논리를 제시, 상황별(공격/수비) 전용 공식으로 분리하기로 확정.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `REBOUND`에 `DRB_REB_WEIGHT`/`DRB_BOXOUT_WEIGHT`/`DRB_VERTICAL_WEIGHT`/
  `DRB_STRENGTH_WEIGHT`/`ORB_REB_WEIGHT`/`ORB_HUSTLE_WEIGHT`/`ORB_VERTICAL_WEIGHT` 신규 추가
- `services/game/engine/pbp/reboundLogic.ts` (client) / `server/src/shared/engine/pbp/reboundLogic.ts`
  (server) — `calculateOrbChance`의 `calcPower`(공수 공용 1개)를 `calcOffPower`/`calcDefPower`
  2개로 분리, `selectRebounder`의 점수 계산도 `isOffensive` 분기로 공식 자체를 분리

**Before**:
```ts
// calculateOrbChance
const calcPower = (team: TeamState, rebAttr: 'offReb' | 'defReb') =>
    team.onCourt.reduce((sum, p) => {
        return sum + (p.attr[rebAttr] * 0.45 + p.attr.vertical * 0.2 + p.attr.strength * 0.10 + p.attr.boxOut * 0.15 + p.attr.hustle * 0.10);
    }, 0);
const offPower = calcPower(offTeam, 'offReb');
const defPower = calcPower(defTeam, 'defReb');

// selectRebounder
const rebAttr: 'offReb' | 'defReb' = isOffensive ? 'offReb' : 'defReb';
let score = (
    p.attr[rebAttr] * 0.45 + p.attr.vertical * 0.2 + p.attr.strength * 0.10 +
    p.attr.boxOut * 0.15 + p.attr.hustle * 0.10
) * shooterPenalty;
```

**After**:
```ts
// calculateOrbChance
const calcOffPower = (team: TeamState) =>
    team.onCourt.reduce((sum, p) =>
        sum + (p.attr.offReb * cfg.ORB_REB_WEIGHT + p.attr.hustle * cfg.ORB_HUSTLE_WEIGHT + p.attr.vertical * cfg.ORB_VERTICAL_WEIGHT), 0);
const calcDefPower = (team: TeamState) =>
    team.onCourt.reduce((sum, p) =>
        sum + (p.attr.defReb * cfg.DRB_REB_WEIGHT + p.attr.boxOut * cfg.DRB_BOXOUT_WEIGHT + p.attr.vertical * cfg.DRB_VERTICAL_WEIGHT + p.attr.strength * cfg.DRB_STRENGTH_WEIGHT), 0);
const offPower = calcOffPower(offTeam);
const defPower = calcDefPower(defTeam);

// selectRebounder
let score = (
    isOffensive
        ? p.attr.offReb * cfg.ORB_REB_WEIGHT + p.attr.hustle * cfg.ORB_HUSTLE_WEIGHT + p.attr.vertical * cfg.ORB_VERTICAL_WEIGHT
        : p.attr.defReb * cfg.DRB_REB_WEIGHT + p.attr.boxOut * cfg.DRB_BOXOUT_WEIGHT + p.attr.vertical * cfg.DRB_VERTICAL_WEIGHT + p.attr.strength * cfg.DRB_STRENGTH_WEIGHT
) * shooterPenalty;
```

**가중치 값**: DRB = defReb 0.65 + boxOut 0.20 + vertical 0.05 + strength 0.10 (hustle 제외, 합 1.00) /
ORB = offReb 0.80 + hustle 0.10 + vertical 0.10 (strength/boxOut 제외, 합 1.00)

**검증**: `server tsc` 30개 베이스라인 유지(신규 에러 없음), `vite build` 클린 빌드. 실측 검증(hou팀,
웸반야마 defReb 98 vs 팀원 60~75) — DRB 선택 확률이 기존 공용공식 22.49% → 신규 분리공식 24.82%로
상승(몬테카를로 아님, 이론 확률 계산). ORB도 offReb 88 기준 25.06%로 팀 내 최고.

**롤백 방법**: Before 블록 내용으로 되돌리고, constants.ts의 `DRB_*`/`ORB_*` 7개 상수 제거.

---

## 2026-07-30 — 리바운드 로직 점검: Harvester/Raider 비활성화, motorIntensity 결정론적 전환

**배경**: "32 TEST 2" 탑 리바운더(제일런 듀렌 8.3개)가 실제 NBA 엘리트 리바운더 대비 너무 낮다는
제보로 `reboundLogic.ts` 재점검. (1) `SIM_CONFIG.BLOCK`/`ZONE_SHOOTING`/`PLAYMAKING`/
`CLUTCH_ARCHETYPE`는 전부 `ENABLED: false`(히든 아키타입 임시 비활성화)인데, `REBOUND`의
Harvester(offReb/defReb≥95 → ×1.3)/Raider(키≤200&offReb≥90&vertical≥90 → ×1.4)만 게이트 없이
항상 활성화돼 있었던 걸 확인 — 다른 계열과 통일하기 위해 비활성화. (2) 리바운더 선정 시
`Math.random() * (0.7+motorIntensity*0.6)`로 개별 랜덤을 곱한 뒤 다시 룰렛 추첨을 하는 "이중
랜덤" 구조를 몬테카를로로 검증 — 실력/모터 차이와 무관하게 결과가 이론값보다 항상 살짝 낮게(4~6%)
나오는 걸 확인, 결정론적 배율로 전환. 계수도 0.6→0.3으로 조정 — 기존 계수는 motor=1.0(평균)에서도
이미 1.3배 고정 보너스가 붙어 `types/player.ts`의 텐던시 스펙("0.5~1.5, 리바운드 확률 ±15%")과
안 맞았음.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `REBOUND.ARCHETYPES_ENABLED: false` 신규 추가
- `services/game/engine/pbp/reboundLogic.ts` (client) / `server/src/shared/engine/pbp/reboundLogic.ts`
  (server) — Harvester/Raider 블록에 `cfg.ARCHETYPES_ENABLED` 게이트 추가, motorIntensity 랜덤
  곱셈 제거 + 계수 조정

**Before**:
```ts
if (p.attr.offReb >= cfg.HARVESTER_REB_THRESHOLD || p.attr.defReb >= cfg.HARVESTER_REB_THRESHOLD) {
    score *= cfg.HARVESTER_SCORE_MULTIPLIER;
}
if (isOffensive && p.attr.height <= cfg.RAIDER_MAX_HEIGHT && ...) {
    score *= cfg.RAIDER_SCORE_MULTIPLIER;
}
...
score *= Math.random() * (0.7 + (p.tendencies?.motorIntensity ?? 1.0) * 0.6);
```

**After**:
```ts
if (cfg.ARCHETYPES_ENABLED && (p.attr.offReb >= cfg.HARVESTER_REB_THRESHOLD || ...)) {
    score *= cfg.HARVESTER_SCORE_MULTIPLIER;
}
if (cfg.ARCHETYPES_ENABLED && isOffensive && ...) {
    score *= cfg.RAIDER_SCORE_MULTIPLIER;
}
...
score *= (0.7 + (p.tendencies?.motorIntensity ?? 1.0) * 0.3);  // Math.random() 제거, 계수 0.3
```

**검증**: 몬테카를로 시뮬레이션(1000000회) 3케이스 — (a) 모터 동일/순수 실력차: 결정론적 방식이
이론값(33.3%)과 정확히 일치, 기존 랜덤 방식은 31.8%로 희석 (b) 실력+모터 모두 최상: 결정론적
38.1%=이론값, 기존 방식 36.0%로 모터 보너스가 온전히 반영 안 됨 (c) 실력 좋으나 모터 낮음 vs
실력 평범하나 모터 최상: 결정론적 26.6%≈이론값 26.7%, 기존 26.0%. `cd server && npx tsc -p
tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트 정상 빌드.

**참고**: `resolveRebound()`의 Step1(공격/수비 리바운드 판정)→Step2(팀 내 리바운더 선정, offReb/
defReb 상황별 정확히 분기됨) 흐름 자체는 이미 올바르게 구현돼 있음을 확인(추가 수정 없음). 리바운드
총량이 낮은 근본 원인(팀당 FGA 69.5개, 실제 NBA 88~90개)은 페이스/슛 볼륨 이슈로 판단, 이번 범위에서
제외.

**롤백 방법**: 위 Before 블록으로 4개 파일(constants.ts/reboundLogic.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — Transition 전용 PBP 커멘터리 추가 (속공/터치다운 패스)

**배경**: `Transition` 플레이타입이 지금까지 전용 커멘터리 분기가 하나도 없어서, 실제로는 존(zone)
기반 일반 문구(하프코트 슛과 동일한 "아크 정면에서 3점슛..." 등)로 처리되고 있었음을 확인. 앞서
Transition 아웃렛 패서에 `passAcc`(터치다운 패스) 반영까지 마친 김에, 속공 득점/실패와 아웃렛
패스 유무에 따른 전용 문구를 추가.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client) / `server/src/shared/engine/commentary/textGenerator.ts`
  (server) — `generateCommentary()`의 'score'/'miss' 섹션에 `playType === 'Transition'` 분기 추가

**After** (신규 추가, 'score' 섹션 — pnrCoverage 체크 이후, 3PT 체크 이전에 배치):
```ts
if (playType === 'Transition') {
    if (assister) {
        return pick([
            `${assister.playerName}, 코트를 가로지르는 터치다운 패스! ${actor.playerName}가 그대로 마무리합니다!${scoreTag}`,
            `${assister.playerName}의 정확한 아웃렛 패스, ${actor.playerName}가 속공으로 연결합니다!${scoreTag}`,
            ...
        ]);
    }
    return pick([
        `${actor.playerName}, 폭발적인 속도로 코트를 가로질러 마무리!${scoreTag}`,
        ...
    ]);
}
```
'miss' 섹션에도 동일 패턴(아웃렛 패스는 좋았으나 마무리 실패 / 단독 속공 실패)으로 추가. 'miss'
섹션에서는 기존 `isBlock` 체크 이후, 3PT 체크 이전에 배치해 블록된 속공은 기존 블록 문구가
우선되도록 함.

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` →
클라이언트 정상 빌드.

**롤백 방법**: 위 추가된 `if (playType === 'Transition') { ... }` 블록 2곳(score/miss)을 4개 파일
(textGenerator.ts × client/server)에서 삭제.

---

## 2026-07-30 — Playmaking Gravity 신설 (Star Gravity의 어시스트 잠식 역설 해결)

**배경**: Transition 아웃렛 패서 수정에 이어, 어시스트 부족의 두 번째 원인(Star Gravity 부스트가
Iso/PnR_Handler만 늘려 팀 최고 스코어러 겸 패서인 선수 본인의 어시스트 기회를 스스로 깎아먹는 역설)
해결. 팀의 최고 그래비티(스코어링) 선수만 보던 기존 로직과 별개로, 팀의 최고 플레이메이커(포지션
무관, `handler` 아키타입 기준)를 찾아 어시스트형 플레이(PnR_Roll/CatchShoot/Handoff/Cut/
OffBallScreen) 비중을 독립적으로 늘리는 "Playmaking Gravity"를 신설. 요키치처럼 스코어러+패서를
겸비한 선수는 두 부스트를 동시에 받아 "본인 득점"과 "동료를 살리는 플레이" 둘 다 늘어남. 논의 중
PnR_Pop은 제외하기로 확정 — popper 액터 자격(screener+3점, C/PF 한정)과 무관한 부스트라, 팀에
스트레치 빅이 없어도 억지로 낮은 확률 3점을 늘리는 부작용이 있었음.

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — 기존 Star Gravity 블록 바로 뒤에 Playmaking Gravity 블록 추가

**After** (신규 추가분):
```ts
// 기존 Star Gravity(Iso/PnR_Handler/PostUp)는 그대로 유지
const topPlaymakingGravity = Math.max(...offTeam.onCourt.map(p => p.archetypes.handler));
const playmakingBoost = Math.min(0.30, Math.max(0, (topPlaymakingGravity - 70) * 0.02));
weights['PnR_Roll'] *= (1 + playmakingBoost);
weights['CatchShoot'] *= (1 + playmakingBoost);
weights['Handoff'] *= (1 + playmakingBoost);
weights['Cut'] *= (1 + playmakingBoost * 0.7);
weights['OffBallScreen'] *= (1 + playmakingBoost * 0.7);
```

**검증**: 리그 전체 `handler` 아키타입 분포(평균 67.7/중앙값 68.8/p75 77.2/p90 84.8) 확인 후
threshold=70/계수=0.02로 캘리브레이션 — p90대(84.8)에서 상한(30%) 근접. 요키치(handler 94.1) 기준
playmakingBoost 상한 도달 확인. `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과
동일. `npx vite build` → 클라이언트 정상 빌드.

**주의사항**: `topPlaymakingGravity`는 포지션 무관(코트 위 5명 전원 중 최댓값) — 팀의 최고
플레이메이커가 가드여도 동일하게 작동하며, 이 경우도 볼 무브먼트 중심 팀이 되는 게 자연스러운
결과라 의도된 동작. 실제 32 TEST 2류 시뮬레이션에서 요키치/사보니스 등의 어시스트가 목표 범위로
개선됐는지는 다음 실측으로 재확인 필요.

**롤백 방법**: 위 After 블록 추가분을 삭제하면 이전 상태(Star Gravity만 존재)로 복귀.

---

## 2026-07-30 — Transition 아웃렛 패서에 "터치다운 패스" 반영 (passAcc 추가)

**배경**: 요키치/사보니스/센군 같은 플레이메이킹 빅의 어시스트가 실측(32 TEST 2)으로 확인해보니
너무 낮음(요키치 3.29 vs 실제 NBA 9~10대, 약 1/3 수준) — 원인 조사 중 (1) Star Gravity 부스트가
팀의 최고 그래비티 선수(요키치 계산 시 gravity≈124.5, 부스트 상한 30% 도달)의 자기 득점 플레이만
늘려 어시스트형 플레이 비중을 상대적으로 9%가량 깎는 것 (2) Transition의 패서 선정에 `passAcc`가
빠져있어 "발은 느려도 정확도+시야로 풀코트 패스를 꽂는" 요키치/르브론형 아웃렛 패서가 저평가되는 것,
두 가지를 확인함. 이번엔 (2)부터 수정 — Transition 패서 기준에 `passAcc`를 추가하고 비중을 상향.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server)
  — `Transition` 케이스의 `outletPasser` 선정 기준 교체

**Before**:
```ts
const outletPasser = pickPasser(p => p.archetypes.connector + p.attr.passVision * 0.3, actor.playerId);
```

**After**:
```ts
const outletPasser = pickPasser(p => {
    const touchdownQuality = (p.attr.passVision + p.attr.passAcc) / 2;
    return p.archetypes.connector + touchdownQuality * 0.5;
}, actor.playerId);
```

**검증**: 요키치(connector 94.4, passVision 99, passAcc 98) 기준 재계산 — 124.1 → 143.65(+16%).
`cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트
정상 빌드.

**참고**: Star Gravity 부스트(원인 1)는 아직 미해결 — "팀의 최고 그래비티 선수가 진짜 슛 크리에이터
타입인지"를 구분하지 않고 무조건 Iso/PnR_Handler를 늘리는 구조라, 요키치처럼 스코어러이자 최고
패서인 선수의 어시스트 기회를 스스로 깎아먹는 역설이 남아있음.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — DRAW_FOUL_CURVE 중상위권 구간 하향 (최상위권과의 격차 확대)

**배경**: 바로 위 항목(`ZONE_CURVE_SCALE` 재조정)에 이어, drawFoul 최상위권(95~99)과 중상위권
(80~90)의 격차를 벌리고 싶다는 요청. 처음엔 95/99 자체를 올리는(0.15→0.2, 0.19→0.35) 안이
나왔으나 계산해보니 95~99 구간에 정확히 이번에 문제였던 선수들(엠비드96/야니스98/요키치95/
하든99/SGA98)이 몰려있어서, 이걸 올리면 방금 `ZONE_CURVE_SCALE`로 해소한 빅맨 파울 과다노출이
되살아나거나(엠비드 Rim 25.6%→30.4%) 오히려 더 악화되는(야니스 Rim →34.6%, 원래 문제 32%보다도
높음) 문제가 확인됨. 대신 "격차를 위에서 벌리지 말고 아래에서 벌리는" 방향으로 확정 — 95/99는
그대로 두고 80~90(칼 말론/샤킬 등 중상위권) 구간만 하향.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `SHOOTING_FOUL.DRAW_FOUL_CURVE`의 80/85/90 breakpoint 값 변경 (95/99는 유지)

**Before**: `[80, 0.035], [85, 0.065], [90, 0.10], [95, 0.15], [99, 0.19]`
**After**: `[80, 0.015], [85, 0.035], [90, 0.06], [95, 0.15], [99, 0.19]`

**검증**: 재계산 — 칼 말론(drawFoul 90) Rim 기준 22%→19.6%로 하향, 엠비드(96)는 25.6%로 그대로
유지 → 최상위권-중상위권 격차가 2.4%p에서 6.0%p로 확대. `cd server && npx tsc -p tsconfig.json`
→ 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(constants.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — 슈팅파울 ZONE_CURVE_SCALE 재조정 (빅맨 자유투 과중 문제)

**배경**: 헬프디펜스 정리 후, "그냥 파울 로직"(헬프디펜스 무관) 자체를 재점검하다가
`SHOOTING_FOUL.DRAW_FOUL_CURVE × ZONE_CURVE_SCALE` 조합에서 원인을 발견. "32 TEST 2" 실측 데이터로
확정: 리그 전체 drawFoul 1~3위인 하든(99)/SGA(98)/엠비드(96)는 커브 원값이 비슷한데(0.19/0.18/0.16,
3%p 이내 차이) 실제 FTA는 엠비드(6.2개)가 하든(4개)의 1.5배 이상 — 가드는 3PT/Mid 위주라 존
스케일(25%/50%)로 크게 희석되는 반면, PostUp 위주 빅맨은 Rim/Paint(100%/80%)에서 거의 풀파워로
적용됐기 때문. 카림 압둘자바(drawFoul 84로 하든보다 15점 낮은데 평균 FTA 7개로 오히려 더 많음)도
동일 원인. `ZONE_CURVE_SCALE`을 Rim/Paint/Mid는 큰 폭으로, 3PT는 상대적으로 적게 낮춰서 재조정.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `SHOOTING_FOUL.ZONE_CURVE_SCALE` 값 변경

**Before**: `{ Rim: 1.0, Paint: 0.8, Mid: 0.5, '3PT': 0.25 }`
**After**: `{ Rim: 0.6, Paint: 0.5, Mid: 0.3, '3PT': 0.2 }`

**검증**: 재계산 결과 — 엠비드(drawFoul96) Rim 기준 슈팅파울 확률 32%→25.6%(-20%), Paint 22.8%→18%
(-21%); 하든(drawFoul99) 3PT 기준 7.25%→6.3%(-13%) — 빅맨 쪽이 더 크게 감소해 격차 완화 방향 확인.
`cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트
정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(constants.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — 헬프 디펜스 "빈도 vs 강도" 원칙 정리: HITRATE_PENALTY/FOUL_BONUS 고정값 전환

**배경**: `helpDef` 슬라이더는 "우리 팀이 헬프를 얼마나 자주 부르는가"(빈도)를 나타내야 하는데,
기존엔 `HITRATE_PENALTY_BASE/PER_LEVEL`, `FOUL_BONUS_BASE/PER_LEVEL`가 전부 이 슬라이더에 연동돼
있어서 "헬프를 자주 부르는 팀일수록 헬프 한 번의 효과(적중률 감소폭)와 위험(파울 확률)도 세진다"는
논리적 모순이 있었음. 개인 기량 차이는 이미 `iqFactor × physFactor` 성공 게이트가 담당하므로,
슬라이더는 `ATTEMPT_BASE/PER_LEVEL`(빈도)에만 연동하고 나머지는 슬라이더 5단계(중간값) 기준
고정값으로 전환. 함께 죽은 코드가 된 `STEAL_BONUS_BASE/PER_LEVEL`(직전 커밋에서 커브 기반으로
대체됨)도 이번에 삭제.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `HITRATE_PENALTY_BASE/PER_LEVEL` → `HITRATE_PENALTY: 0.033`(고정), `FOUL_BONUS_BASE/PER_LEVEL` →
  `FOUL_BONUS: 0.006`(고정), `STEAL_BONUS_BASE/PER_LEVEL` 삭제
- `services/game/engine/pbp/possessionHandler.ts` (client) / 서버 동일 — `helpHitRatePenalty`/
  `helpBonusRate` 계산식을 고정값 참조로 단순화. **서버 파일에서 A-3 헬프 스틸 공식이 직전 커밋에서
  실수로 안 바뀌고 옛 `STEAL_BONUS_BASE` 그대로 남아있던 것도 이번에 같이 발견해 수정**(server tsc가
  타입 에러로 즉시 잡아냄 — client는 여전히 옛 코드가 참조하는 상수 자체가 지워지기 전까진 무증상).

**Before**:
```ts
HITRATE_PENALTY_BASE: 0.02, HITRATE_PENALTY_PER_LEVEL: 0.03/9,   // 1단계 -2%p ~ 10단계 -5%p
FOUL_BONUS_BASE: 0.0025, FOUL_BONUS_PER_LEVEL: 0.0075/9,          // 1단계 +0.25%p ~ 10단계 +1.0%p
STEAL_BONUS_BASE: 0.003, STEAL_BONUS_PER_LEVEL: 0.009/9,          // (이미 미사용, 죽은 코드)
...
const helpHitRatePenalty = -(HITRATE_PENALTY_BASE + (helpDefLevel-1)*HITRATE_PENALTY_PER_LEVEL);
helpBonusRate = FOUL_BONUS_BASE + (helpDefLevel-1)*FOUL_BONUS_PER_LEVEL;
```

**After**:
```ts
HITRATE_PENALTY: 0.033,  // 슬라이더 5단계 기준 고정
FOUL_BONUS: 0.006,       // 슬라이더 5단계 기준 고정
...
const helpHitRatePenalty = -helpCfg.HITRATE_PENALTY;
helpBonusRate = helpCfg.FOUL_BONUS;
```

**검증**: `cd server && npx tsc -p tsconfig.json` — 최초 실행 시 서버 A-3 스틸 공식이 옛
`STEAL_BONUS_BASE` 참조로 남아있어 32건(신규 2건)으로 잡힘 → 커브 기반으로 수정 후 재실행,
기존 무관 에러 30건과 동일 확인. `npx vite build` → 클라이언트 정상 빌드. `grep`으로
`HITRATE_PENALTY_BASE`/`FOUL_BONUS_BASE`/`STEAL_BONUS_BASE` 등 잔여 참조 전체 삭제 확인.

**롤백 방법**: 위 Before 블록으로 4개 파일(constants.ts/possessionHandler.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — 헬프 디펜스 스틸 커브 교체 + 헬프 전용 PBP 커멘터리 추가

**배경**: 헬프 디펜스 재점검 후속. (1) 헬프 스틸 보너스가 슬라이더 기반 flat 값이라 헬퍼 개인의
`stl` 능력치를 전혀 반영 못 했음 — 블락의 헬프 메커니즘(`blk`/`rimProtector` 임계값 기반)과의
일관성을 위해 A-2 패싱레인 스틸이 이미 쓰던 `effectiveStl`/`LANE_STEAL_CURVE`를 그대로 재사용하도록
교체(새 상수 추가 없음). 실측 검증: 요키치(steal72/passPerc78→0.48%)가 고베어(steal40/passPerc72→
0.16%)보다 스틸 확률이 높고, 반대로 블락은 고베어/아데바요(8.0%)가 요키치(2.5%, 기본치뿐)를 압도 —
스킬 프로파일이 실제 스카우팅 평가와 일치함을 확인. (2) 스틸/블락/파울이 헬프 디펜더에게 귀속될 때
PBP 중계에 전용 문구가 없다는 것을 확인, `PossessionResult.isHelpPlay` 플래그를 신설해 커멘터리
생성기까지 관통시킴.

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client) / 서버 동일 — A-3 헬프 스틸 공식 교체,
  `calculateTurnoverChance` 반환 타입에 `isHelpPlay` 추가, 파울/블락 분기에서 헬프 귀속 시
  `isHelpPlay: true`를 결과에 포함(파울은 `fouler === helpDefender`로 판별, 블락은 `isHelpBlock`
  변수로 추적)
- `services/game/engine/pbp/pbpTypes.ts` (client) / 서버 동일 — `PossessionResult.isHelpPlay?: boolean` 추가
- `services/game/engine/pbp/statsMappers.ts` (client) / 서버 동일 — miss/turnover/foul 세 곳의
  `generateCommentary()` 호출에 `isHelpPlay: !!result.isHelpPlay` 전달
- `services/game/engine/commentary/textGenerator.ts` (client) / 서버 동일 — `flags`에 `isHelpPlay`
  추가, 블락/스틸/파울 세 분기에 헬프 전용 문구 각 3종 추가

**Before** (스틸 공식):
```ts
const helpStealBonus = helpCfg.STEAL_BONUS_BASE + (defTeam.tactics.sliders.helpDef - 1) * helpCfg.STEAL_BONUS_PER_LEVEL;
```
**After**:
```ts
const effectiveStl = helpDefender.attr.stl * 0.7 + helpDefender.attr.passPerc * 0.3;
const helpStealBonus = interpolateCurve(effectiveStl, SIM_CONFIG.STEAL.LANE_STEAL_CURVE);
```
(`STEAL_BONUS_BASE`/`STEAL_BONUS_PER_LEVEL` 상수는 더 이상 안 쓰이나 이번엔 삭제하지 않고 남겨둠 —
필요 시 별도 정리)

**Before** (커멘터리, 블락 예시):
```ts
if (isBlock && defender) {
    return pick([`${actor.playerName}의 슛, ${defender.playerName}에게 가로막힙니다! (블록)`, ...]);
}
```
**After**:
```ts
if (isBlock && defender) {
    if (isHelpPlay) {
        return pick([`위크사이드에서 넘어온 ${defender.playerName}, 완벽한 타이밍의 헬프 블락!`, ...]);
    }
    return pick([...기존...]);
}
```
(스틸/파울도 동일 패턴)

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` →
클라이언트 정상 빌드.

**주의사항**: 이전 항목("헬프 디펜스 시스템 재설계")에서 논의만 하고 미구현으로 남은 항목이 있음 —
`HITRATE_PENALTY`/`FOUL_BONUS`를 슬라이더 연동 없는 고정값(각각 0.033/0.006)으로 바꾸는 건
(빈도는 슬라이더가, 강도는 개인 기량이 결정해야 한다는 원칙 논의까지는 끝났으나) 아직 코드 반영
전. `STEAL_BONUS`는 이번에 커브 기반으로 완전히 교체되어 이 이슈가 해소됨.

**롤백 방법**: 위 Before 블록으로 8개 파일(possessionHandler.ts/pbpTypes.ts/statsMappers.ts/
textGenerator.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — 헬프 디펜스 시스템 재설계 (헬퍼 선정 가중치, 파울 보너스 트리거, 체력 페널티 제거)

**배경**: PostUp PLAYTYPE_MOD 재조정에 이어 헬프디펜스 확률 자체를 재점검. 세 가지를 순서대로 확정:

1. **헬퍼 선정**: Rim/Paint 헬퍼 풀이 기존엔 C/PF/SF로 제한돼 있어 특정 빅맨에게 헬프 관여가
   구조적으로 쏠렸음 — 전 포지션으로 열고, 선정 자체를 helpDefIq 가중 룰렛으로 변경(눈치 빠른
   선수가 실제로 로테이션에 나설 확률부터 높아야 한다는 논의).
2. **파울 보너스 트리거**: 기존엔 `helpAttempted && helpSuccess`(IQ×운동능력 게이트 통과)일 때만
   파울 확률이 붙어서, "헬프에 성공할수록(=잘하는 선수일수록) 파울도 늘어나는" 역설이 있었음.
   체력 페널티는 이미 "시도 자체"로 트리거되고 있었다는 점에 착안해 파울 보너스도
   `helpAttempted`(시도 자체)만으로 트리거하도록 통일 — 성공 여부는 hitRate 감소/스틸 보너스에만
   영향을 주고, 파울 위험은 "몸이 그 자리에 갔다"는 사실만으로 결정되도록 재정의. 발동 빈도가
   늘어난 만큼 크기는 절반으로 재조정(1단계 +0.5%p~10단계 +2.0%p → +0.25%p~+1.0%p).
3. **체력 페널티 제거**: 헬프 시도 시 체력 소모 배율(`DRAIN_MULT`, ×1.10~×1.25)을 완전히 삭제.
   이 배율 하나만을 위해 존재하던 `isHelpDefender`/`helperPlayerId` 파라미터 체인도 함께 정리.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `HELP_DEFENSE.ZONE_POSITIONS`(Rim/Paint 전 포지션 확장), `FOUL_BONUS_BASE/PER_LEVEL`(절반 재조정),
  `DRAIN_MULT_BASE/PER_LEVEL` 삭제
- `services/game/engine/pbp/possessionHandler.ts` (client) / 서버 동일 — 헬퍼 선정을 helpDefIq 가중
  룰렛으로, 파울 보너스 트리거를 `helpAttempted`만으로 변경
- `services/game/engine/fatigueSystem.ts` (client) / 서버 동일 — `isHelpDefender` 파라미터 및
  체력 배율 블록 삭제
- `services/game/engine/pbp/stateUpdater.ts` (client) / 서버 동일 — `helperPlayerId` 파라미터 삭제
- `services/game/engine/pbp/liveEngine.ts` (client) / 서버 동일 — `updateOnCourtStates` 호출부에서
  `result.helpDefenderId` 인자 제거

**Before** (헬퍼 선정, `possessionHandler.ts`):
```ts
ZONE_POSITIONS: { Rim: ['C','PF','SF'], Paint: ['C','PF','SF'], ... }
...
helpDefender = helperPool[Math.floor(Math.random() * helperPool.length)];
```

**After**:
```ts
ZONE_POSITIONS: { Rim: ['PG','SG','SF','PF','C'], Paint: ['PG','SG','SF','PF','C'], ... }
...
const totalHelpIq = helperPool.reduce((sum, p) => sum + Math.max(1, p.attr.helpDefIq), 0);
let iqRoll = Math.random() * totalHelpIq;
helpDefender = helperPool[helperPool.length - 1];
for (const p of helperPool) {
    iqRoll -= Math.max(1, p.attr.helpDefIq);
    if (iqRoll <= 0) { helpDefender = p; break; }
}
```

**Before** (파울 보너스 트리거):
```ts
if (helpAttempted && helpSuccess && (Rim/Paint)) { helpBonusRate = FOUL_BONUS_BASE(0.005) + ...; }
```
**After**:
```ts
if (helpAttempted && (Rim/Paint)) { helpBonusRate = FOUL_BONUS_BASE(0.0025) + ...; }
```

**Before** (체력 페널티, `fatigueSystem.ts`):
```ts
if (isHelpDefender) {
    const helperDrainMult = DRAIN_MULT_BASE + (sliders.helpDef - 1) * DRAIN_MULT_PER_LEVEL;
    drain *= helperDrainMult;
}
```
**After**: 블록 전체 삭제, `isHelpDefender` 파라미터도 함께 삭제.

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일(신규 0건). `npx vite
build` → 클라이언트 정상 빌드. `grep`으로 `DRAIN_MULT`/`isHelpDefender`/`helperPlayerId` 전체
삭제 확인.

**주의사항**: `PossessionResult.helpDefenderId` 필드 자체와 `possessionHandler.ts`의 각 return문에
남아있는 `helpDefenderId` 할당은 그대로 남겨둠(더 이상 소비되진 않지만, 수십 개 return문을 건드리는
큰 범위의 기계적 변경이라 이번 범위에서 제외 — 필요 시 별도로 정리 요청).

**롤백 방법**: 위 Before 블록들로 6개 파일(constants.ts/possessionHandler.ts/fatigueSystem.ts/
stateUpdater.ts/liveEngine.ts × client/server) 전부 되돌릴 것.

---

## 2026-07-30 — 논슈팅 파울 PostUp PLAYTYPE_MOD 재조정 (1.5%p → 0.6%p)

**배경**: "32 TEST 2" 토너먼트에서 PF(개인파울) 상위 21위가 전부 센터, 그중 상당수가 고베어/AD/
웸반야마/아데바요/클랙스턴 같은 엘리트 디펜더라는 제보에서 시작한 파울 시스템 재점검. 원인 추적
중 `NON_SHOOTING_FOUL.PLAYTYPE_MOD`의 PostUp(+1.5%p, 전체 최고)이 지난 세션에 PostUp/PnR_Roll을
센터 편중(60%/70%)으로 재설계하기 *전* 볼륨 기준으로 캘리브레이션된 값이라는 게 확인됨. 지금은
PostUp의 공격 액터가 거의 항상 상대팀 최고 포스트 스코어러라, 수비도 자연히 우리 팀 최고
림프로텍터가 맡게 되고 — "엘리트 vs 엘리트" 매치업이라 `matchupFoulMult`가 할인 없이(≈1.0)
적용되는 경우가 급증. 즉 볼륨 증가 + 캘리브레이션 안 된 옛 보너스가 겹쳐서 이중으로 파울이
쌓이는 구조였음. PnR_Roll(+1.0%p)은 재조정 없이 유지하기로 확정.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `SIM_CONFIG.NON_SHOOTING_FOUL.PLAYTYPE_MOD.PostUp` 값만 변경

**Before**: `PostUp: 0.015`
**After**: `PostUp: 0.006`

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` →
클라이언트 정상 빌드.

**참고**: 이번 파울 재점검에서 추가로 확인된, 아직 미해결인 이슈들 —
(1) 헬프디펜스 파울 보너스가 헬프 성공률(엘리트 디펜더일수록 높음)과 상관관계가 있어 "수비를
잘할수록 파울도 늘어나는" 역설 (2) 존 디펜스의 "Funnel inside shots to Bigs"(`possessionHandler.ts`
36-47행)가 매치업 무관 무조건 앵커 고정이라 노출 볼륨을 늘림 (3) `tacticGenerator.ts`의 `helpDef`
슬라이더가 팀의 최고 림프로텍션 스코어에 비례해 자동 상승, 엘리트 림프로텍터 보유 팀이 스스로
그 선수의 헬프 노출을 극대화하는 자기강화 루프. 엘리트 디펜더 전용 파울회피 보너스(연속값 공식
`intDef*0.35+blk*0.35+defConsist*0.30`, 또는 게임 기존 "High Tower" 태그 — DB `archetypes`
테이블의 `rimProtection≥89` 기준, `interiorDefense*0.42+block*0.14+helpDefenseIQ*0.18+
strength*0.12+vertical*0.08+defConsist*0.06`)도 논의됐으나 "미봉책"으로 판단해 보류.

**롤백 방법**: 위 Before 값으로 2개 파일(constants.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — DriveKick 킵/킥아웃 분기를 드라이버 본인 스탯 기반으로 수정 (10개 플레이타입 점검 완료)

**배경**: OffBallScreen에 이어 마지막 플레이타입 DriveKick 점검. 기존 코드는 "드라이버가 직접
마무리할지(킵) vs 킥아웃할지"를 스팟업 슈터(`actor`)의 존 선호도(`selectZone`)로 판정했는데, 이건
드라이버 본인의 침투력/패스 성향과 전혀 무관한 엉뚱한 기준이었다. 스팟업 슈터가 3점 선호가 강하면
드라이버가 아무리 골밑을 잘 뚫어도 "직접 마무리" 분기를 거의 못 타고, 반대로 슈터가 우연히 골밑
선호가 있으면 드라이버의 실제 마무리력과 무관하게 득점자가 뒤바뀌는 구조였음. 이미 계산해두었던
`penetration`(침투력)/`kickPass`(킥아웃 패스력) 값의 비율로 분기를 결정하도록 분리.

이후 순수 불도저형(잭 라빈/앤서니 에드워즈 등, 킵 비율 54~59%) vs 순수 패서형(마크 가솔/요키치/
빌 워튼 등, 킵 비율 34~48%) 10명씩 실측 검증, 패서형 상위권에 빅맨이 많다는 지적에 대해서도
"드라이버 역할 자체의 선정 확률"(`archetypes.driver+handler*0.3`)이 운동능력 낮은 빅맨에게 이미
낮게 걸려있어(가솔 84.0 vs 팍스 113.3) 실제로 이 빅맨들이 드라이버로 뽑힐 빈도 자체가 낮다는 것도
함께 확인.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server)
  — `DriveKick` 케이스의 킵/킥아웃 분기 로직

**Before**:
```ts
const dkZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
if (dkZone === 'Rim' || dkZone === 'Paint') {
    const { zone: finishZone, shotType } = resolveFinish(driver, 'drive', sliders, dkZone);
    return { playType, actor: driver, preferredZone: finishZone, shotType, bonusHitRate: 0.02 + driveBonus };
}
return { playType, actor, secondaryActor: driver, preferredZone: dkZone, shotType: dkZone === '3PT' ? 'CatchShoot' : 'Jumper', bonusHitRate: 0.02 + driveBonus };
```

**After**:
```ts
const keepChance = penetration / (penetration + kickPass);
if (Math.random() < keepChance) {
    const driveZone = selectZone(['Rim', 'Paint'], driver, sliders) as 'Rim' | 'Paint';  // 드라이버 본인 존 선호도
    const { zone: finishZone, shotType } = resolveFinish(driver, 'drive', sliders, driveZone);
    return { playType, actor: driver, preferredZone: finishZone, shotType, bonusHitRate: 0.02 + driveBonus };
}

const dkZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
if (dkZone === 'Rim' || dkZone === 'Paint') {
    const { zone: finishZone, shotType } = resolveFinish(actor, 'drive', sliders, dkZone);
    return { playType, actor, secondaryActor: driver, preferredZone: finishZone, shotType, bonusHitRate: 0.02 + driveBonus };
}
return { playType, actor, secondaryActor: driver, preferredZone: dkZone, shotType: dkZone === '3PT' ? 'CatchShoot' : 'Jumper', bonusHitRate: 0.02 + driveBonus };
```

**검증**: 불도저형 10명(잭 라빈/앤서니 에드워즈/제일런 그린 등) 킵 비율 54.3~59.2%, 패서형 10명
(마크 가솔/요키치/빌 워튼 등) 킵 비율 34.2~48.0%로 명확히 분리됨을 확인. `cd server && npx tsc
-p tsconfig.json` 최초 실행 시 `selectZone(['Rim','Paint'],...)`의 반환 타입이 여전히 4존 유니온
전체(`'Rim'|'Paint'|'Mid'|'3PT'`)로 추론되어 `resolveFinish`의 zone 파라미터(`'Rim'|'Paint'`)와
안 맞는 신규 타입 에러 1건 발견 — `as 'Rim' | 'Paint'` 캐스팅으로 수정, 이후 기존 무관 에러 30건과
동일 확인(client `vite build`는 esbuild transpile-only라 애초에 이 에러를 못 잡았음 — server tsc가
다시 한번 실효성 입증). `npx vite build` → 클라이언트 정상 빌드.

**참고**: 이걸로 12개 플레이타입(PostUp/PnR_Roll/PnR_Pop/PnR_Handler/Iso/CatchShoot-passer/Cut/
Transition/Putback/Handoff/OffBallScreen/DriveKick) 전체 점검이 완료됨.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — OffBallScreen 스크리너 선정 `role` 파라미터 누락 버그 수정

**배경**: OffBallScreen 점검 중 `screener` 선정 코드에서 `pickWeightedActor`의 `role` 인자가 빠져있는
걸 발견. 기본값 `'shooter'`가 그대로 적용되면서, 스크리너 역할인데도 (1) 옵션랭크 기반
`usageMultiplier`가 적용돼 팀의 득점 옵션 순위가 높을수록 스크리너로도 더 자주 뽑히고, (2)
`ballDominance`가 반전 없이 그대로 적용돼 볼을 잡고 싶어하는 성향이 강할수록 유리하고, (3)
`playStyle`도 슛선호(+1)일수록 유리하게 작용하는 등, 셋 다 스크리너 역할과는 맞지 않는 방향으로
왜곡되고 있었다. 같은 파일의 Handoff `big`, PnR_Handler `screener`는 이미 `'passer'`를 명시하고
있어서, 이 케이스만 빠뜨린 실수로 판단됨.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server)
  — `OffBallScreen` 케이스의 `screener` 선정에 `'passer'` role 추가

**Before**:
```ts
const screener = pickWeightedActor(p => p.archetypes.screener, actor.playerId);
```

**After**:
```ts
const screener = pickWeightedActor(p => p.archetypes.screener, actor.playerId, 'passer');
```

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` →
클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — Putback `offReb` 기반 재정의 + Handoff 허브빅 선정을 passIq/hands 기반으로 교체

**배경**: Cut/Transition은 점검 결과 문제없음으로 결론. 이어서 Putback과(이전에 논의만 하고 코드
반영을 누락했던) Handoff를 함께 처리.

**Putback**: 기존 `p.attr.reb`(공격+수비+박스아웃 평균)는 세컨드찬스 전용 상황에 수비리바운드 능력까지
섞여서 부정확했다(실측: 알 호포드 offReb 35인데 reb 종합 61.3으로 과대평가). 공격리바운드(offReb)만
쓰고 점프력(vertical)·허슬을 반영, 골밑마무리(CLD)는 보조로 축소.

**Handoff**: 기존 `screener`(체격만)로 "볼을 건네는 빅"을 뽑다 보니, 손기술이 최악인 순수
림프로텍터(무톰보 hands52, 드러먼드 hands38, 고베어 hands48)가 요키치(hands98,passIq98)·
사보니스보다 위로 랭크되는 왜곡이 있었음. Handoff는 순수 스크린이 아니라 빅맨이 직접 볼을 다루다
넘겨주는 역할이라는 논의 끝에, passIq/hands 기반 "허브 스코어"로 교체 + PnR_Roll과 동일한 C/PF
자격 제한 재사용.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server)
  — `Putback`/`Handoff` 케이스 액터 선정 공식

**Before**:
```ts
// Putback
const actor = pickWeightedActor(p => p.attr.reb * 0.6 + p.attr.ins * 0.4);

// Handoff
const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId, 'passer');
```

**After**:
```ts
// Putback
const actor = pickWeightedActor(p =>
    p.attr.offReb * 0.40 +
    p.attr.vertical * 0.30 +
    p.attr.hustle * 0.20 +
    (((p.attr.closeShot + p.attr.layup + p.attr.dunk) / 3) * 0.10)
);

// Handoff
const handoffHubWeights = SIM_CONFIG.POSITION_WEIGHT.PNR_ROLL;  // { C:0.7, PF:0.3, 그 외 0 }
const big = pickWeightedActor(
    p => p.attr.passIq * 0.5 + p.attr.hands * 0.5,
    actor.playerId, 'passer',
    p => (handoffHubWeights[p.position] ?? 0) > 0
);
```

**검증**: Putback 리그 탑15 — 코니 호킨스/야니스/줄리어스 어빙/바클리/로드먼/러셀/하워드/마이칸/
카림/모세스 말론/벤 월리스/조쉬 하트/블레이크 그리핀/칼 말론 등 실제 역대 리바운드·허슬형과 정확히
일치(로드먼·월리스·하트처럼 골밑마무리는 약해도 리바운드+허슬로 상위권 진입 확인). Handoff 허브
탑15는 요키치(1위)·아비다스 사보니스(2위)로 정상화, 무톰보/드러먼드/고베어류는 배제됨.
`cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트
정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — `pickWeightedActor`의 passer 선정에서 옵션랭크/볼도미넌스 오적용 수정

**배경**: CatchShoot 점검 중, 슈퍼스타/스트레치빅이 `spacer`(슈터)로 자주 뽑히는 것 자체는 타당한데,
그 슛을 누가 어시스트했는지(passer 선정)를 검증하다가 `pickWeightedActor` 공통 로직의 구조적 문제를
발견함. `usageMultiplier`(옵션랭크 기반 배율, "1옵션일수록 슛을 더 쏘게")와 `ballDominance`(볼을
잡고 싶어하는 성향)가 둘 다 `role`(shooter/passer) 구분 없이 무조건 곱해지고 있었음 — 그 결과
"득점 옵션 순위가 높다"거나 "볼을 안 놓으려는 성향"이라는, 패스 능력과 무관한 요인이 패서(어시스트
제공자) 선정에도 그대로 가산점을 주는 모순이 있었음. 반면 `playStyle`(-1 패스퍼스트~+1 슛퍼스트)은
이미 role별로 정확히 반영되고 있었음(패스퍼스트면 패서 픽 가중치↑) — 이건 그대로 유지.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server) —
  `pickWeightedActor` 내부 `usageMultiplier`/`ballDominance` 계산 로직 (모든 play type의 passer 선정에
  공통 적용되는 변경)

**Before**:
```ts
const rank = optionRanks.get(p.playerId) || 3;
const usageMultiplier = getContextualMultiplier(rank, playType);
let weight = Math.max(1, rawScore) * usageMultiplier;

weight *= (p.tendencies?.ballDominance ?? 1.0);
```

**After**:
```ts
// usageMultiplier: passer 선정엔 옵션랭크 적용 안 함 (득점 순위와 어시스트 능력은 무관)
const rank = optionRanks.get(p.playerId) || 3;
const usageMultiplier = role === 'shooter' ? getContextualMultiplier(rank, playType) : 1.0;
let weight = Math.max(1, rawScore) * usageMultiplier;

// ballDominance: passer 선정엔 0.5~1.5를 1.0 기준 대칭 반전(2.0-x) — 볼도미넌스가
// 낮을수록(볼에 덜 집착할수록) 패서 가중치가 올라가도록
const ballDom = p.tendencies?.ballDominance ?? 1.0;
weight *= role === 'shooter' ? ballDom : (2.0 - ballDom);
```

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` →
클라이언트 정상 빌드. 이 변경은 `pickWeightedActor`의 공통 로직이라 CatchShoot뿐 아니라 모든
play type의 passer/secondaryActor 선정에 동일하게 적용됨.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — Iso `isoScorer`의 scoringComposite를 peak/secondary 구조로 재수정

**배경**: 바로 아래 항목("Iso isoScorer 아키타입 재정의")에서 mid/three/CLD를 고정 비율(0.20/0.60/0.20)로
선형 블렌드했는데, Cut 점검 중 야니스 안테토쿤보의 사례(driver 단독 4위인데 Cut 액터 점수는 154위)를
살펴보다가 "Iso가 3점 스텝백형뿐 아니라 골밑 돌진형 파워 드라이버도 포괄해야 한다"는 논의로 이어짐.
실측 확인: 야니스의 골밑(CLD) 97.7은 커리(74.0)보다도 훨씬 높은데, 선형 블렌드에서 3점 비중이 0.60로
가장 커서 야니스의 isoScorer(81.4)가 르브론(87.3)보다도 낮게 나오는 왜곡이 있었음. 골밑 지배형과
3점 지배형 둘 다 "각자의 강점 경로"로 정당하게 평가받도록, `usageSystem.ts`의 `calculateScoringGravity`
(peak 0.7 + secondary 0.3)와 동일한 구조로 교체.

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) / `server/src/shared/engine/pbp/archetypeSystem.ts`
  (server) — `isoScorer`의 `scoringComposite` 계산 방식 교체 (handling 비중 0.40, scoringComposite
  0.60은 유지)

**Before**:
```ts
const scoringComposite =
    (attr.mid * 0.20) +
    (threeAvg * 0.60) +
    (((attr.closeShot + attr.layup + attr.dunk) / 3) * 0.20);
```

**After**:
```ts
const isoInsideScore = (attr.closeShot + attr.layup + attr.dunk) / 3;
const isoOutsideScore = (attr.mid * 0.4) + (threeAvg * 0.6);   // outside 내부는 3점>미드 유지
const isoPeak = Math.max(isoInsideScore, isoOutsideScore);
const isoSecondary = Math.min(isoInsideScore, isoOutsideScore);
const scoringComposite = (isoPeak * 0.7) + (isoSecondary * 0.3);
```

**검증**: 445명 전체 기준 재계산 — 야니스 81.4→88.4(르브론 87.6보다 위로 역전), 자이언 75.5→83.3으로
개선. 리그 탑15는 루카(94.4)/카이리(93.3)/SGA(92.8)/래리버드(92.5)/조던(92.4)/데릭로즈(92.0)/
브런슨(91.2)/웨이드(91.1)/할리버튼(90.6)/하든(90.6)/테이텀(90.5)/미첼(90.5)/맥그레이디(90.4)/
드렉슬러(90.3)/모란트(90.3) — 3점형·미드형·골밑파워형이 고르게 섞인 명단. `cd server && npx tsc`
→ 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 되돌리면 바로 아래 항목("선형 블렌드" 버전)의 After 상태로 복귀함.
완전히 이전(운동능력 기반)으로 되돌리려면 아래 항목의 Before까지 함께 되돌릴 것.

---

## 2026-07-29 — Iso `isoScorer` 아키타입 재정의 (운동능력 제거, 3존 종합 스코어링으로 교체)

**배경**: PnR_Handler에 이어 Iso를 점검. 기존 `isoScorer = handling*0.25+mid*0.25+speed*0.25+agility*0.25`는
3점 슈팅력이 전혀 반영 안 되고 운동능력(speed+agility)이 절반을 차지해서, 폭발적인 운동능력형은
아니지만 핸들링+슈팅(특히 스텝백 3점)으로 아이솔레이션을 지배하는 유형(하든/릴라드 등)이 부당하게
낮게 나오는 문제가 확인됨(실측: 하든 83.0으로 카이리 93.5·트레이영 92.0 등 동급 스코어러 중 최하위).

논의 과정에서 단계적으로 확정:
1. 운동능력 비중 축소 + 3점 반영 시도 → 격차는 줄었지만 완전히 해소 안 됨
2. 골밑 돌파(CLD)까지 포함한 종합 스코어링으로 확장, 피지컬 완전 제거 → 하든이 그룹 상위권까지 상승,
   래리버드/듀란트/카멜로 앤서니 등 스킬형 아이소 스코어러가 리그 전체 탑15에 신규 진입
3. 3점>골밑>미드 순으로 scoringComposite 내부 비중 조정(0.60/0.20/0.20) — 3점 비중을 낮게 잡았을 때
   스테판 커리가 리그 전체 18위로 컷 밖 근접까지 밀린 것을 확인하고 재조정해 5~6위로 복귀시킴
4. handling:scoringComposite = 0.40:0.60으로 최종 확정

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) / `server/src/shared/engine/pbp/archetypeSystem.ts`
  (server) — `isoScorer` 공식 전면 교체

**Before**:
```ts
const isoScorer = getVal(
    (attr.handling * 0.25) +
    (attr.mid * 0.25) +
    (attr.speed * 0.25) +
    (attr.agility * 0.25)
);
```

**After**:
```ts
const scoringComposite =
    (attr.mid * 0.20) +
    (threeAvg * 0.60) +
    (((attr.closeShot + attr.layup + attr.dunk) / 3) * 0.20);
const isoScorer = getVal(
    (attr.handling * 0.40) +
    (scoringComposite * 0.60)
);
```

**검증**: 445명 전체 기준 새 공식 리그 탑15 — 루카(95.2)/카이리(93.4)/래리버드(92.9)/SGA(92.4)/
브런슨(91.8)/커리(91.5)/할리버튼(91.2)/하든(91.0)/맥그레이디(90.5)/테이텀(90.4)/제리웨스트(90.0)/
맥시(89.9)/트레이영(89.8)/머레이(89.7)/자말크로포드(89.4) — 실제 역사상 아이솔레이션 강자들과
대체로 일치. 하든이 구공식 대비 83.0→91.0으로 정상화. `isoScorer`는 Iso/PnR_Handler 액터 선정에만
쓰여 다른 부작용 없음 확인(grep 검증). `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과
동일. `npx vite build` → 클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(archetypeSystem.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — PnR_Handler 액터 선정에 득점력(isoScorer) 반영

**배경**: PnR_Pop에 이어 PnR_Handler를 점검. 기존 `handler` 아키타입(handling+passIq+passVision+passAcc)은
득점 요소가 전혀 없는데, PnR_Handler는 결국 볼핸들러가 스크린을 활용해 직접 득점(풀업/드라이브)까지
책임지는 플레이라 득점력이 반영돼야 한다는 문제 제기. 실측 확인: 앤서니 에드워즈(SG, 미드 92/3점
91.3의 엘리트 스코어러)의 handler_score가 71.6으로, 비슷한 등급의 다른 스코어러(부커 83.3, 릴라드
84.4, 하든 91.9)보다 확연히 낮게 나옴 — 순수 패스형 선수에게 밀려 실제로는 팀의 핵심 볼핸들러인
선수가 PnR_Handler 반복 기회를 상대적으로 덜 받는 구조였음.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server) —
  `PnR_Handler` 액터 선정 기준만 변경 (다른 곳의 `handler` 아키타입 자체는 그대로 — 패서 역할로 계속 사용됨)

**Before**:
```ts
case 'PnR_Handler': {
    const actor = pickWeightedActor(p => p.archetypes.handler);
    ...
}
```

**After**:
```ts
case 'PnR_Handler': {
    // Iso 액터 선정과 동일하게 isoScorer(드리블+득점+운동능력)를 주축으로, handler를 보조 가중치로 사용
    const actor = pickWeightedActor(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);
    ...
}
```

**검증**: 상위 스코어러 그룹(CP3/스탁턴/트레이영/루카/마크잭슨/부커/커리/하든/앤에드워즈/릴라드)의
새 조합 점수 계산 — 앤서니 에드워즈가 그룹 최하위(handler_old 71.6)에서 하든(128.9)·릴라드(125.0)와
비슷한 중위권(127.6)으로 이동, 순수 패스형(CP3 140.4, 스탁턴 139.1)은 여전히 최상위 유지(이들도
득점력이 나쁘지 않아 조합 점수가 자연스럽게 높음). `cd server && npx tsc -p tsconfig.json` → 기존
무관 에러 30건과 동일. `npx vite build` → 클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — PnR_Pop `popper` 아키타입을 screener 기반으로 재정의 (가드가 팝아웃하던 문제 수정)

**배경**: PostUp/PnR_Roll에 이어 나머지 10개 플레이타입을 점검하던 중 PnR_Pop이 눈에 띄었다. 다른
스크린 계열 플레이(PnR_Roll의 screener, OffBallScreen의 screener, Handoff의 big)는 전부 "실제로
스크린을 세울 수 있는 사람인가"(신체 스탯 기반 `screener` 아키타입)를 어떤 형태로든 반영하는데,
PnR_Pop의 `popper`만 순수 3점+슛IQ뿐이라 스크리닝 능력과 무관했다. 445명 전체 평균 실측 결과
`popper`(구공식) 순위가 PG 78.3 > SG 78.9 > SF 76.1 > PF 71.0 > C 59.0 — 픽앤팝(스크린을 세운 빅맨이
팝아웃하는 액션)인데 포인트가드가 1위로 나오는 완전히 뒤집힌 결과였음.

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) / `server/src/shared/engine/pbp/archetypeSystem.ts`
  (server) — `popper` 공식 교체, `screener` 계산을 `screenerRaw`로 분리해 재사용
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server) —
  `PnR_Pop` 액터 선정에 `PNR_ROLL` 자격 필터(C/PF만 허용) 재사용

**Before** (`archetypeSystem.ts`):
```ts
const screener = getVal(
    (attr.strength * 0.40) + (normHeight * 0.30) + (normWeight * 0.30)
);
...
const popper = getVal(
    (threeAvg * 0.70) +      // threeAvg = 코너/45도/탑 3점 통합 평균
    (attr.shotIq * 0.30)
);
```

**After**:
```ts
const screenerRaw = (attr.strength * 0.40) + (normHeight * 0.30) + (normWeight * 0.30);
const screener = getVal(screenerRaw);
...
// 코너 3점 제외(픽앤팝은 45도/탑에서만 나옴), shotIq 제거, screenerRaw 0.6 비중으로 스크리닝 능력 요구
const popper = getVal(
    screenerRaw * 0.6 +
    ((attr.three45 + attr.threeTop) / 2) * 0.4
);
```

**Before** (`playTypes.ts`):
```ts
case 'PnR_Pop': {
    const popper = pickWeightedActor(p => p.archetypes.popper);
    ...
}
```

**After**:
```ts
case 'PnR_Pop': {
    // PnR_Roll과 동일한 스크리너 풀(C/PF)만 허용 — popper 공식 자체가 이미 C/PF를 거의 동률로
    // 갈라주므로(실측 확인) 추가 배율 없이 자격 필터만 적용
    const popEligible = SIM_CONFIG.POSITION_WEIGHT.PNR_ROLL;  // { C:0.7, PF:0.3, SF:0, SG:0, PG:0 }
    const popper = pickWeightedActor(
        p => p.archetypes.popper,
        undefined, 'shooter',
        p => (popEligible[p.position] ?? 0) > 0
    );
    ...
}
```

**검증**: 445명 전체 평균으로 새 `popper` 공식 계산 — C 63.3 / PF 62.8(거의 동률) / SF 59.6 / SG 54.8
/ PG 49.3로 포지션 순서가 정상화됨(SF 이하는 필터로 완전 배제되므로 순위 자체는 참고용).
`cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트
정상 빌드.

**롤백 방법**: 위 Before 블록으로 4개 파일(archetypeSystem.ts/playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — PostUp/PnR_Roll 액터 선정에 포지션 가중치 추가 (센터 볼터치 부족 개선)

**배경**: "32 TEST"(32팀 멀티 리그, 95경기 실측) 데이터 분석에서 엘리트 센터들의 usage가 동급
가드/윙보다 확연히 낮다는 문제 확인(전체 슛 시도 중 C 점유율 14.2%, 5포지션 균등 기대치 20% 대비
낮음). 원인 추적 결과 (1) 플레이타입 풀 자체가 가드/윙 편향 (2) "센터 전용"이어야 할 PostUp/PnR_Roll
안에서조차 액터 선정 아키타입 공식이 포지션을 구분하지 못함 — 두 가지가 확인됐고, 이번엔 (2)를 수정.

실측(`meta_players` 445명 전체 평균):
```
postScorer(구공식) : C 74.4 | PF 74.1 | SF 70.8   → C/PF 사실상 동률
roller             : C 67.7 | PF 73.9 | SF 74.9   → 센터가 오히려 최하위
```
포지션 간 실력 차이가 거의 없거나 역전돼 있어, 순수 스킬 경쟁만으로는 "센터 전용 플레이"가 센터에게
가지 않는 구조였음. 논의 끝에 (a) `postScorer` 공식을 postPlay 중심으로 재정의하고 (b) PostUp/PnR_Roll
액터 선정에 포지션 가중치를 곱하는 방식으로 확정(하드 쿼터 대신 소프트 가중치 — 스킬 격차가 극단적인
예외 로스터에서는 여전히 뒤집힐 여지를 남김).

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `SIM_CONFIG.POSITION_WEIGHT` 신규
- `services/game/engine/pbp/archetypeSystem.ts` (client) / `server/src/shared/engine/pbp/archetypeSystem.ts`
  (server) — `postScorer` 공식 교체
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server) —
  `pickWeightedActor`에 `eligibleFilter` 파라미터 추가, `PostUp`/`PnR_Roll` 액터 선정에 포지션 가중치 적용

**Before** (`archetypeSystem.ts`):
```ts
const postScorer = getVal(
    (attr.ins * 0.50) +       // ins = (layup+dunk+postPlay+drawFoul+hands)/5 — postPlay 지분 1/5뿐
    (attr.strength * 0.30) +
    (attr.hands * 0.20)
);
```

**After**:
```ts
const postScorer = getVal(
    (attr.postPlay * 0.50) +
    (((attr.closeShot + attr.layup + attr.dunk) / 3) * 0.30) +
    (attr.hands * 0.20)
);
```

**Before** (`playTypes.ts`, `pickWeightedActor` + PostUp/PnR_Roll):
```ts
const pickWeightedActor = (
    criteria: (p: LivePlayer) => number,
    excludeId?: string,
    role: 'shooter' | 'passer' = 'shooter'
) => {
    let pool = players;
    if (excludeId) pool = pool.filter(p => p.playerId !== excludeId);
    ...
};
...
case 'PnR_Roll': {
    const screener = pickWeightedActor(p => p.archetypes.roller + p.archetypes.screener * 0.5);
    ...
}
...
case 'PostUp': {
    const actor = pickWeightedActor(p => p.archetypes.postScorer);
    ...
}
```

**After**:
```ts
const pickWeightedActor = (
    criteria: (p: LivePlayer) => number,
    excludeId?: string,
    role: 'shooter' | 'passer' = 'shooter',
    eligibleFilter?: (p: LivePlayer) => boolean   // NEW — Math.max(1, rawScore) 하한선 때문에
) => {                                             // criteria*0을 줘도 완전 배제가 안 돼 별도 필터 필요
    let pool = players;
    if (excludeId) pool = pool.filter(p => p.playerId !== excludeId);
    if (eligibleFilter) pool = pool.filter(eligibleFilter);
    ...
};
...
case 'PnR_Roll': {
    const rollWeights = SIM_CONFIG.POSITION_WEIGHT.PNR_ROLL;  // { C:0.7, PF:0.3, SF:0, SG:0, PG:0 }
    const screener = pickWeightedActor(
        p => (p.archetypes.roller + p.archetypes.screener * 0.5) * (rollWeights[p.position] ?? 0),
        undefined, 'shooter',
        p => (rollWeights[p.position] ?? 0) > 0   // SF/SG/PG 완전 배제
    );
    ...
}
...
case 'PostUp': {
    const postUpWeights = SIM_CONFIG.POSITION_WEIGHT.POST_UP;  // { C:0.6, PF:0.2, SF:0.1, SG:0.05, PG:0.05 }
    const actor = pickWeightedActor(p => p.archetypes.postScorer * (postUpWeights[p.position] ?? 0.05));
    ...
}
```

**검증**: 445명 전체 평균 postScorer/roller 값에 새 포지션 가중치를 곱해 계산한 예상 분포 —
PostUp: C 61.6% / PF 20.2% / SF 9.5% / SG 4.4% / PG 4.3% (목표 60/20/10/5/5에 근접),
PnR_Roll: C 68.1% / PF 31.9% (목표 70/30에 근접). `cd server && npx tsc -p tsconfig.json` → 기존
무관 에러 30건과 동일(신규 에러 0건). `npx vite build` → 클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 6개 파일(constants.ts/archetypeSystem.ts/playTypes.ts × client/server)
전부 되돌릴 것 — 하나만 되돌리면 client/server 미러가 깨짐.

---

## 2026-07-29 — 드래프트 완료 직후 시즌 일정이 안 보이는 경쟁 상태(race condition) 수정

**배경**: "32 TEST" 세션에서 드래프트 완료 후 시즌 화면 진입 시 일정이 안 보이다가 새로고침하니
다시 보이는 현상 제보. DB 직접 조회로 `rooms.schedule`/`roster_state`/`game_pbp`가 전부 정상 생성돼
있는 걸 확인해 서버 데이터 자체는 문제 없음을 확인 — 클라이언트가 finalize 완료 이전에 화면을
읽어버리는 타이밍 문제로 원인 특정.

기존에 `DraftCompletedScreen`(`MultiDraftView.tsx`)이 이미 폴링으로 "일정 생성 중" 대기 로직을
갖고 있었으나, **폴링 대상이 잘못돼 있었음** — `leagues.status === 'in_progress'`를 완료 신호로
썼는데, 이 status는 `finalize.ts`의 `finalizeDraft()` 맨 앞부분에서 "동시 실행 방지용 원자적
claim"으로 실제 일정/전술 생성이 끝나기도 전에 바로 `'in_progress'`로 바뀐다. 즉 폴링이 "이제 막
시작했다"는 신호를 "다 끝났다"로 오인해 너무 일찍 `onNavigate()`를 호출했던 것 — 드래프트가 끝나자마자
"시즌으로 이동" 화면이 뜨는 게 자연스러운 사용자 흐름이라 매 세션 재현 가능성이 있는 구조적 버그.

**변경 파일**:
- `views/multi/league/MultiDraftView.tsx` (client) — `DraftCompletedScreen`의 폴링 대상을
  `leagues.status`(잘못된 조기 claim 신호) → `rooms.schedule` 실제 생성 여부로 교체. 로더 스피너
  대신 경과시간 기반 근사 진행률(점근선, 완료 전 95% 캡) 프로그레스 바로 교체
- `hooks/useMultiGameData.ts` (client) — 백업 방어선: 최초 로드 시 `room.schedule`이 비어있으면
  드래프트 완료 화면을 거치지 않고 다른 경로로 시즌 화면에 바로 들어온 경우를 위해 최대 4회
  (1.5초 간격, 총 6초)까지만 짧게 재조회. 무한 폴링 아님 — 이 최초 로드 시점에만 국한

**Before**:
```tsx
// MultiDraftView.tsx — DraftCompletedScreen
const { data } = await supabase
    .from('leagues')
    .select('status')
    .eq('id', leagueId)
    .single();
if (data?.status === 'in_progress') setIsReady(true);
else timerId = setTimeout(poll, 3000);
// ...
if (!isReady) return <Loader2 className="animate-spin" .../>;

// useMultiGameData.ts
if (room.schedule) setSchedule(room.schedule as Game[]);
```

**After**:
```tsx
// MultiDraftView.tsx — DraftCompletedScreen
const { data } = await supabase
    .from('rooms')
    .select('schedule')
    .eq('id', roomId)
    .maybeSingle();
if (Array.isArray(data?.schedule) && data.schedule.length > 0) {
    setProgress(100);
    setIsReady(true);
} else {
    timerId = setTimeout(poll, POLL_INTERVAL_MS);
}
// ...
if (!isReady) return (
    <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
             style={{ width: `${progress}%` }} />
    </div>
);

// useMultiGameData.ts
if (room.schedule) {
    setSchedule(room.schedule as Game[]);
} else {
    (async () => {
        for (let i = 0; i < 4 && !cancelled; i++) {
            await new Promise(r => setTimeout(r, 1500));
            if (cancelled) return;
            const retryRoom = await loadRoom(roomId);
            if (retryRoom?.schedule) { setSchedule(retryRoom.schedule as Game[]); return; }
        }
    })();
}
```

**검증**:
- 브레이스 균형 확인, `npm run build` 성공 (client 전용 변경 — server 코드 변경 없어 Fly 재배포 불필요)
- `finalize.ts` 코드 추적으로 `roster_state`/`schedule`이 항상 같은 단일 `update()` 호출에서
  원자적으로 함께 쓰이는 것 확인 — `rooms.schedule` 존재 여부가 완료 판정 신호로 타당함을 확인

**주의사항 / 한계**:
- 실제 진행률 신호(finalize 내부 단계별 완료 이벤트)가 없어 프로그레스 바는 경과시간 기반 근사치임
  (점근선으로 95%까지 채우고 실제 완료 시 100%로 스냅) — 정확한 퍼센트가 아니라 "진행 중" 체감용
- `useMultiGameData.ts`의 재시도는 이번 최초 로드 시점에만 국한되며, 그 이후엔 예전에 확정한 "리그
  진입 시 1회만 로딩" 원칙을 그대로 유지함(일반적인 재로딩 정책 변경 아님)

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

---

## 2026-07-29 — 드래프트 픽 타이머 clock skew 보정 (AI 픽 32초로 표시되던 문제)

**배경**: 드래프트 룸 픽당 제한시간을 30초로 설정했는데 AI팀 픽 타이머가 32초로 시작된다는 제보.
조사 결과 AI 전용 버그가 아니라 **서버-클라이언트 시계 오차(clock skew)** 문제로 확인. `hooks/
useLeagueDraft.ts`의 카운트다운이 `Date.now() - new Date(currentPickStartedAt).getTime()`로
클라이언트 로컬 시계와 서버가 찍은 절대시각을 직접 비교하는데, Fly.io 서버 시계와 클라이언트 시계가
몇 초만 어긋나도 그 오차가 그대로 카운트다운에 반영됨. 실측: `curl -I`로 확인한 Fly 서버 HTTP Date
헤더가 로컬 시스템 시각보다 약 3초 빠름 — 정확히 보고된 증상(30초 설정 → 32~33초 표시)과 일치.
사람 픽(30초)도 똑같이 영향받지만, 타이머가 시작되는 정확한 순간을 보고 있는 경우가 드물어 눈치채기
어렵고, AI 픽은 서버에서 2.5~3.5초 만에 끝나버리는 짧은 타이머라(`AI_MIN_DELAY_MS`/`AI_MAX_DELAY_MS`,
`DraftRoom.ts`) 시작값이 그대로 눈에 띔.

NTP 방식과 동일한 원리로 보정 — 서버가 커서를 보낼 때마다 자신의 현재 시각(`serverNow`)을 함께
실어 보내고, 클라이언트는 수신 시점에 `serverNow - Date.now()`로 skew를 계산해 이후 카운트다운
계산에 반영.

**변경 파일**:
- `server/src/protocol.ts` — `DraftCursor` 인터페이스에 `serverNow: string` 필드 추가
- `server/src/DraftRoom.ts` — `getCursor()`가 `serverNow: new Date().toISOString()` 포함하도록 수정
- `hooks/useLeagueDraft.ts` (client) — `clockSkewRef`(ms) 추가, `snapshot`/`pick`/`cursor` 메시지
  수신 시마다 `updateClockSkew(cursor)`로 skew 갱신, 타이머 계산에 `Date.now() + clockSkewRef.current`
  적용

**Before**:
```ts
// DraftRoom.ts
getCursor(): DraftCursor {
    return {
        status: this.status,
        currentPickIndex: this.currentPickIndex,
        currentPickStartedAt: this.currentPickStartedAt,
        ...(this.pausedAt ? { pausedAt: this.pausedAt } : {}),
        autoPickUserIds: [...this.autoPickUserIds],
    };
}

// useLeagueDraft.ts
const elapsed   = (Date.now() - new Date(draftState.currentPickStartedAt).getTime()) / 1000;
const remaining = Math.max(0, Math.round(draftState.pickDurationSec - elapsed));
```

**After**:
```ts
// DraftRoom.ts
getCursor(): DraftCursor {
    return {
        status: this.status,
        currentPickIndex: this.currentPickIndex,
        currentPickStartedAt: this.currentPickStartedAt,
        ...(this.pausedAt ? { pausedAt: this.pausedAt } : {}),
        autoPickUserIds: [...this.autoPickUserIds],
        serverNow: new Date().toISOString(),
    };
}

// useLeagueDraft.ts
function updateClockSkew(cursor: any) {
    if (cursor?.serverNow) {
        clockSkewRef.current = new Date(cursor.serverNow).getTime() - Date.now();
    }
}
// ... snapshot/pick/cursor 핸들러에서 updateClockSkew(cursor) 호출
const correctedNow = Date.now() + clockSkewRef.current;
const elapsed       = (correctedNow - new Date(draftState.currentPickStartedAt).getTime()) / 1000;
const remaining     = Math.max(0, Math.round(draftState.pickDurationSec - elapsed));
```

**검증**:
- `curl -I https://basketballgm-app-server.fly.dev/`의 HTTP Date 헤더 vs 로컬 `date -u` 비교로
  실제 clock skew(~3초) 존재 확인 후 수정 방향 결정
- `buildSnapshot()`이 항상 `getCursor()`를 거쳐 클라이언트에 전달되는 것 확인(스냅샷/픽델타/커서
  변경 메시지 전부 동일 경로) — `startDraft.ts`의 초기 DB `draft_cursor` 직접 쓰기(waiting/preparing
  단계)는 라이브 `DraftRoom` 인스턴스가 없을 때의 영속화 전용이라 이번 수정 대상에서 제외해도 무방
- 양 서버 파일 브레이스 균형 확인, `tsc --noEmit`에서 `serverNow`/`DraftCursor` 관련 신규 에러 없음
  (기존 무관 에러: `Cannot find module 'bun'` 그대로 존재, 이번 변경과 무관)
- `npm run build` 성공
- `fly deploy -a basketballgm-app-server` 배포 후 헬스체크 200, 배포 직후 실제 운영 중이던 드래프트
  룸(`DraftRoom:935b07ca-...`)이 정상적으로 auto pick을 이어가는 것을 로그로 확인(연속 픽 #288~293,
  스케줄된 지연 2.6~3.4초로 정상 범위)

**주의사항 / 한계**:
- `startDraft.ts`의 waiting/preparing 단계 DB 직접 쓰기 cursor에는 `serverNow`가 없음 — 다만 이
  단계는 `currentPickStartedAt: null`이라 타이머 자체가 동작하지 않으므로 영향 없음
- clock skew는 서버 재배포/시각 동기화(NTP) 상태에 따라 계속 변동 가능 — 이번 수정은 그 변동을
  실시간으로 계속 보정하는 방식이라 향후 서버 시계가 몇 초 더 틀어져도 자동으로 따라감

**롤백 방법**: 위 Before 블록으로 세 파일 모두 되돌리면 됨.

---

## 2026-07-29 — 파울 로직 점검: 논슈팅/오펜시브/테크니컬 파울 개선

**배경**: "빅맨 파울이 너무 빨리 쌓인다" 제보에서 시작된 파울 시스템 전체 점검의 연속. 앞선 세션에서
슈팅 파울에 매치업 갭(`calculateMatchupGap`, GAP_SCALE=60) 기반 배율(0.5~1.5x)을 이미 적용했고,
이번엔 그 흐름을 이어 3.2 논슈팅 파울 → 3.5 오펜시브 파울 → 3.6 테크니컬 파울까지 순서대로 점검·개선.
3.6.1 플래그런트/3.6.2 파이트 체크는 몬테카를로 시뮬레이션으로 기존 확률을 검증한 뒤 "이정도면
충분하다"/"이건 그냥 두자"로 사용자가 명시적으로 변경 불필요를 확정 — 코드 변경 없음.

**변경 파일**:
- `services/game/config/constants.ts` (client) — `SIM_CONFIG.FOUL_EVENTS`, `SIM_CONFIG.NON_SHOOTING_FOUL`
- `server/src/shared/game/config/constants.ts` (server 미러)
- `services/game/engine/pbp/possessionHandler.ts` (client) — 3.2/3.5/3.6 블록
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러)
- `services/game/engine/pbp/statsMappers.ts` (client) — `technicalFoul` 핸들러 (3.6이 공/수 양쪽에서
  발생 가능해지면서 자유투를 "항상 수비팀"이 아니라 파울을 범한 쪽의 상대팀에게 주도록 필요해진 후속 수정)
- `server/src/shared/engine/pbp/statsMappers.ts` (server 미러)

### 3.2 논슈팅 파울 — 플레이타입별 가산 + 매치업 배율 재사용

기존엔 수비강도(defIntensity)만 반영했는데, 실제로는 플레이타입마다 신체접촉 빈도가 다르고(포스트업/
아이소 > 캐치&슛), 슈팅파울에 쓰던 매치업 배율(matchupFoulMult)도 몸싸움 상황이니 그대로 재사용하는
게 타당하다고 판단.

**Before** (`services/game/engine/pbp/possessionHandler.ts`):
```ts
let nonShootingFoulRate = SIM_CONFIG.NON_SHOOTING_FOUL.BASE_RATE
    + (defIntensity - 5.5) * SIM_CONFIG.NON_SHOOTING_FOUL.DEF_INTENSITY_FACTOR;
nonShootingFoulRate *= foulProbMod;
nonShootingFoulRate = Math.min(SIM_CONFIG.NON_SHOOTING_FOUL.MAX_RATE, nonShootingFoulRate);
```

**After**:
```ts
const nsFoulCfg = SIM_CONFIG.NON_SHOOTING_FOUL;
let nonShootingFoulRate = nsFoulCfg.BASE_RATE + (defIntensity - 5.5) * nsFoulCfg.DEF_INTENSITY_FACTOR;
nonShootingFoulRate += nsFoulCfg.PLAYTYPE_MOD[selectedPlayType] ?? 0;
nonShootingFoulRate *= foulProbMod * matchupFoulMult;
nonShootingFoulRate = Math.min(nsFoulCfg.MAX_RATE, nonShootingFoulRate);
```
`PLAYTYPE_MOD`: PostUp +1.5%p, Iso +1.2%p, PnR_Roll +1.0%p, PnR_Handler/DriveKick +0.8%p, Cut +0.6%p,
CatchShoot -1.0%p (신규 상수, `constants.ts`의 `SIM_CONFIG.NON_SHOOTING_FOUL.PLAYTYPE_MOD`).

### 3.5 오펜시브 파울 — 차징/일리걸 스크린 분리 + 귀속 버그 수정

기존엔 오펜시브 파울이 PnR 계열에서만, 그것도 `helpDefIq` 기반 확률로 발생했음 (수비수의 헬프 판단
능력이 상대의 오펜스 파울 여부를 결정한다는 게 어색하다는 지적 → `defConsist`로 교체). 또한 PnR_Handler
플레이에서 스크리너에게 걸려야 할 일리걸 스크린 파울이 볼핸들러(`actor`)에게 잘못 귀속되던 버그 발견
(`PnR_Handler`의 `actor`는 볼핸들러, 스크리너는 `secondaryActor`)도 이번에 같이 수정. 이제 (1) 모든
플레이타입에서 발생 가능한 차징(포스트업은 별도 고율) + (2) 스크린이 있는 플레이타입에서만 발생하는
일리걸 스크린, 두 독립 체크로 분리.

**Before** (핵심 로직, `helpDefIq` 기반 PnR 전용 확률):
```ts
if (selectedPlayType === 'PnR_Handler' || selectedPlayType === 'PnR_Roll' || selectedPlayType === 'PnR_Pop') {
    let offFoulChance = SIM_CONFIG.FOUL_EVENTS.OFFENSIVE_FOUL_BASE;
    if (defender) {
        offFoulChance += (defender.attr.helpDefIq - 70) * SIM_CONFIG.FOUL_EVENTS.CHARGE_BONUS_PER_DEF_IQ;
    }
    if (Math.random() < offFoulChance) {
        return { type: 'offensiveFoul', ..., actor, ... }; // PnR_Handler에서도 항상 actor(볼핸들러) 귀속
    }
}
```

**After**:
```ts
let chargeChance = selectedPlayType === 'PostUp'
    ? offFoulConfig.POST_OFFENSIVE_FOUL_RATE   // 2.5%
    : offFoulConfig.OFFENSIVE_FOUL_BASE;        // 1.5% (전 플레이타입)
if (defender) {
    chargeChance += (defender.attr.defConsist - 70) * offFoulConfig.CHARGE_BONUS_PER_DEF_CONSIST;
}
chargeChance = Math.max(0.005, Math.min(0.04, chargeChance));
if (Math.random() < chargeChance) {
    return { type: 'offensiveFoul', ..., actor, ... };
}

let actualScreener: LivePlayer | undefined;
let screenChance = 0;
if (selectedPlayType === 'PnR_Handler') { actualScreener = secondaryActor; screenChance = offFoulConfig.SCREEN_FOUL_RATE; }       // 0.8%
else if (selectedPlayType === 'PnR_Roll' || selectedPlayType === 'PnR_Pop') { actualScreener = actor; screenChance = offFoulConfig.SCREEN_FOUL_RATE; }
else if (selectedPlayType === 'OffBallScreen') { actualScreener = screener; screenChance = offFoulConfig.OFFBALL_SCREEN_FOUL_RATE; }  // 2.5%
if (actualScreener && Math.random() < screenChance) {
    return { type: 'offensiveFoul', ..., actor: actualScreener, ... };  // 스크리너 본인에게 정확히 귀속
}
```
확률표: 차징(기본) 1.5% / 차징(포스트업) 2.5% / 일리걸스크린(PnR계열) 0.8% / 일리걸스크린(OffBallScreen)
2.5% / Iso는 차징만 적용(스크린 없음, 기본 1.5%). `CHARGE_BONUS_PER_DEF_CONSIST` = 0.0003/point.

### 3.6 테크니컬 파울 — 공/수 양쪽 후보 + 점수차 가중

기존엔 수비팀(defender)에서만 발생 가능했는데, 테크니컬은 경기 외적 파울(항의, 다툼 등) 비중이 커서
공격팀도 받을 수 있어야 하고, 특히 큰 점수차로 지고 있는 팀이 감정적으로 더 격해진다는 게 실제 농구와
맞다는 결론. `temperament` 기반 가중치에 팀별 점수차 배율(20점차 1.3x, 30점차 이상 1.5x, 그 사이 선형)을
곱해 코트 위 10명 전체를 대상으로 룰렛 방식으로 파울러 선정.

**Before**:
```ts
if (Math.random() < SIM_CONFIG.FOUL_EVENTS.TECHNICAL_FOUL_BASE) {
    // defTeam.onCourt 중 temperament 기반 가중치로만 선정
    return { type: 'technicalFoul', ..., defender: techFouler, ... };
}
```

**After**:
```ts
if (Math.random() < offFoulConfig.TECHNICAL_FOUL_BASE) {
    const allOnCourt = [...offTeam.onCourt, ...defTeam.onCourt];
    const offDeficit = Math.max(0, defTeam.score - offTeam.score);
    const defDeficit = Math.max(0, offTeam.score - defTeam.score);
    const offMult = 1 + Math.min(offFoulConfig.TECH_DEFICIT_MAX_BOOST, offDeficit * offFoulConfig.TECH_DEFICIT_PER_POINT);
    const defMult = 1 + Math.min(offFoulConfig.TECH_DEFICIT_MAX_BOOST, defDeficit * offFoulConfig.TECH_DEFICIT_PER_POINT);
    const techWeights = allOnCourt.map(p => {
        const base = Math.pow(Math.max(0.05, ((p.tendencies?.temperament ?? 0) + 1) / 2), techPower);
        const isOffPlayer = offTeam.onCourt.some(op => op.playerId === p.playerId);
        return base * (isOffPlayer ? offMult : defMult);
    });
    // 가중치 룰렛으로 allOnCourt 중 techFouler 선정 (공/수 무관)
    return { type: 'technicalFoul', ..., defender: techFouler, ... };
}
```
`TECH_DEFICIT_PER_POINT=0.015`, `TECH_DEFICIT_MAX_BOOST=0.5` (20점차→1.3x, 33점차 이상→cap 1.5x).

### 후속 수정: `statsMappers.ts`의 `technicalFoul` 핸들러 (자유투 귀속)

3.6이 공격팀도 대상이 되면서 "자유투는 항상 수비팀에게"라는 기존 가정이 깨짐 → 파울러가 어느 팀
소속인지 판별해 상대팀에게 자유투를 주도록 수정.

**Before** (`services/game/engine/pbp/statsMappers.ts`):
```ts
} else if (type === 'technicalFoul') {
    if (defender) { defender.techFouls = (defender.techFouls || 0) + 1; }
    const ftShooter = [...defTeam.onCourt].sort((a, b) => b.attr.ft - a.attr.ft)[0]; // 항상 defTeam이 슈터라고 가정 → 버그
    ...
}
```

**After**:
```ts
} else if (type === 'technicalFoul') {
    if (defender) { defender.techFouls = (defender.techFouls || 0) + 1; }
    const foulerIsOffense = !!defender && offTeam.onCourt.some(p => p.playerId === defender.playerId);
    const ftTeam = foulerIsOffense ? defTeam : offTeam;       // 파울러의 상대팀이 자유투
    const foulerTeam = foulerIsOffense ? offTeam : defTeam;
    const ftShooter = [...ftTeam.onCourt].sort((a, b) => b.attr.ft - a.attr.ft)[0];
    ...
    const isEjected = defender && (defender.techFouls || 0) >= 2;
    if (isEjected && defender) { defender.pf = 6; }  // 2테크 퇴장 처리 추가
}
```

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존부터 있던 무관 에러 30건과 정확히 동일(신규
에러 0건). `npx vite build` → 클라이언트 정상 빌드 완료(경고는 청크 사이즈 관련 기존 이슈, 무관).
검증 과정에서 `defender.attr.steal`(오타, 정확히는 `.stl`)을 client/server `flowEngine.ts`의
`calculateMatchupGap` 함수에서 발견해 함께 수정 — client `vite build`는 안 잡고 server `tsc`만 잡아냄.

**롤백 방법**: 위 각 섹션의 Before 블록으로 되돌리면 됨. 5개 파일(constants.ts 2개, possessionHandler.ts
2개, statsMappers.ts 2개 — 총 6개) 모두 client/server 쌍으로 같이 되돌릴 것.

---

## 2026-07-29 — 버저비터 승부결정 포제션의 "조용한 +1점" 버그 수정

**배경**: `BIG LEAGUE TEST 7`(room `b45d2d1c-d0a1-4d5a-8b0d-cd8848ae1177`)의 보스턴vs멤피스 경기
(`game_id: T_R4_M1_G4`)에서 스케쥴 화면 스코어(109-108)와 리뷰 화면 스코어(108-108)가 다르고, PBP
탭에도 버저비터 관련 내용이 전혀 없다는 제보. DB 직접 조회로 확인: `game_pbp.away_score`(스케쥴이
읽는 원본 컬럼)=109, `away_box` 선수별 `pts` 합계(리뷰 화면이 계산해 보여주는 값)=108, `events` 로그는
4쿼터 0:00에 108-108 동점 3점으로 끝나고 그 이후 이벤트가 0건(OT 이벤트도 0건).

원인은 `liveEngine.ts:_handleGameEnd()`의 "동점 → 버저비터 포제션" 로직. 4쿼터가 동점으로 끝나면
`minHitRate:0.75`로 마지막 포제션을 한 번 더 시뮬레이션해 반드시 승자를 가르는데, 그 결과가
`type==='score'`(깨끗한 성공)이면 정상적으로 로그/박스스코어에 반영되지만, 나머지 ~25%(미스/턴오버/
파울 등)로 나오면 "그래도 이겨야 하니까" `buzzTeam.score += 1`로 **팀 스코어에만 조용히 point를
얹고 끝났음** — 어떤 선수 박스스코어에도 안 잡히고 PBP 로그도 안 남는 구조. 이번 경기가 정확히 그
케이스였음(래리 버드의 버저비터 3점이 동점을 만든 뒤, 후속 승부결정 포제션이 미스/턴오버성 결과로
나와 조용히 보스턴에 1점이 얹어짐).

**변경 파일**:
- `services/game/engine/pbp/liveEngine.ts` (client) — `_handleGameEnd()`의 non-score 분기에서
  `buzzResult.actor.pts += 1`로 박스스코어 반영 + 결과 타입(miss/foul/offensiveFoul/turnover/기타)에
  맞는 문구를 고르는 `buildBuzzerFallbackMessage()` 신규 + `state.logs.push()`로 PBP 로그 추가
- `server/src/shared/engine/pbp/liveEngine.ts` (server 미러) — 동일 변경

**Before**:
```ts
if (buzzResult.type === 'score') {
    applyPossessionResult(state, buzzResult);
} else {
    // 미스(~25%) → silent +1pt (로그 없음, 우연처럼 보임)
    const buzzTeam = buzzIsHome ? state.home : state.away;
    buzzTeam.score += 1;
}
```

**After**:
```ts
function buildBuzzerFallbackMessage(result: PossessionResult): string {
    const name = result.actor.playerName;
    switch (result.type) {
        case 'miss':
            return `${name}의 슛이 빗나갔지만, 흘러나온 볼을 다시 잡아 극적으로 집어넣습니다!`;
        case 'foul':
        case 'offensiveFoul':
            return `혼전 속 파울 상황에서도 ${name}의 팀이 침착하게 추가 득점을 챙깁니다.`;
        case 'turnover':
            return `공을 놓칠 뻔한 위기에서도, ${name}의 팀이 혼전 끝에 극적으로 득점을 만들어냅니다.`;
        default:
            return `극도의 혼전 속에서 ${name}의 팀이 마지막 순간 득점을 만들어냅니다.`;
    }
}
// ...
if (buzzResult.type === 'score') {
    applyPossessionResult(state, buzzResult);
} else {
    const buzzTeam = buzzIsHome ? state.home : state.away;
    buzzResult.actor.pts += 1;
    buzzTeam.score += 1;
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: '0:00',
        teamId: buzzTeam.id,
        text: buildBuzzerFallbackMessage(buzzResult),
        type: 'score',
        points: 1,
    });
}
```

**검증**:
- Node 스크립트로 `buildBuzzerFallbackMessage()`가 miss/foul/offensiveFoul/turnover/technicalFoul/
  flagrantFoul 등 모든 realistic 타입에 대해 자연스러운 문구를 반환하는지 확인
- client/server diff 확인(완전 동일), 양 파일 중괄호 균형 확인
- `tsc --noEmit` 신규 에러 없음, `npm run build` 성공
- `fly deploy -a basketballgm-app-server` 배포 후 헬스체크 200, `worker#0 ready`/`scheduler started`
  정상 재기동 확인 (배포 중 "instance refused connection"/lease 관련 로그는 기존에 확인된 일시적
  부팅 노이즈)

**주의사항 / 한계**:
- 이 로그가 실제로 새 스코어와 일치해서 뜨는지는 **배포 이후 새로 발생하는 동점 종료 경기**에서만
  확인 가능 — 기존에 이미 이 버그로 스코어가 어긋난 과거 경기(`T_R4_M1_G4` 포함)는 DB에 저장된
  `events`/`home_box`/`away_box`가 이미 확정된 상태라 재시뮬레이션 없이는 소급 수정되지 않음
- `buzzResult.type`이 `turnover`/`offensiveFoul` 등일 때 "공격팀이 득점한다"는 서사가 다소 부자연스러울
  수 있음(턴오버 직후 득점은 논리적으로 어색) — 그래도 NBA는 동점 종료가 없어 승자를 반드시 가려야
  하므로, 문구를 최대한 그럴듯하게 다듬는 선에서 타협함. 완전히 자연스럽게 만들려면 버저비터 포제션
  자체를 재설계해야 하는데 이번 범위 밖.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

---

## 2026-07-29 — 매치업 격차를 슈팅파울 배수(0.5~1.5x) + 적중률 미스매치(±12%)에 반영

**배경**: 파울 로직 점검 중 발견 — 슈팅파울 확률식(`SIM_CONFIG.SHOOTING_FOUL`)이 공격자의 절대
`drawFoul` 스탯과 팀 슬라이더만 볼 뿐, "이 공격자가 이 수비자를 신체/기술로 압도하는가"라는
매치업 개념이 전혀 없었음(사용자 지적). 반면 적중률 쪽(`flowEngine.ts`)에는 이미 비슷한 미스매치
로직이 있었지만 스위치가 실제로 일어났을 때만 계산됨. 실제 농구 논의(사용자와 여러 라운드)로
다음을 확정: ① 골밑은 힘(strength, 몸싸움) vs 수비자의 파울없이막는기술(intDef·blk 65% + 신체
전제조건 strength·vertical 35%), 퍼리미터는 속도/민첩(공격) vs 컨테인기술(perDef 35% + 신체
agility·speed 45% + 손기술 stl 20%). ② 격차의 결과는 "가드가 빅맨을 못 막으면 대부분 그냥
뚫릴 뿐 파울로 이어지는 게 대부분이 아니다"는 사용자 지적에 따라, **파울은 최대 0.5~1.5배로만
보조적으로 반영**하고 **적중률(±12%)이 주 채널**이 되도록 설계. GAP_SCALE(정규화 스케일)은
실제 선수 매치업(윌트/하더웨이/카터/하킴 등, BIG LEAGUE TEST 7·MIL 실측 스탯) 시뮬레이션
아티팩트로 60 확정.

**변경 파일**:
- `services/game/engine/pbp/flowEngine.ts` (client) — `calculateMatchupGap()`/`MATCHUP_GAP_SCALE`
  신규 export, 기존 스위치 전용 미스매치 블록을 대체
- `server/src/shared/engine/pbp/flowEngine.ts` (server 미러) — 동일
- `services/game/engine/pbp/possessionHandler.ts` (client) — 슈팅파울 확률에 매치업 배수 곱연산 추가
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러) — 동일

**Before** (`flowEngine.ts`, 적중률 미스매치 — 스위치 전용):
```ts
let isMismatch = false;
if (isSwitch) {
    const heightDiff = defender.attr.height - actor.attr.height;
    ... isGuardOnBig / isBigOnGuard / skillGap(아키타입 비교) 개별 체크 ...
    if (isGuardOnBig || isBigOnGuard || skillGap >= 15) {
        isMismatch = true;
        const effectiveGap = Math.max(skillGap, 0); // 음수면 보너스 0 (한쪽만 처리)
        hitRate += Math.min(0.12, (Math.max(effectiveGap, 15) / 100) * 0.3);
    } else {
        hitRate -= 0.03; // 성공적 스위치
    }
}
```

**After**:
```ts
// 신규 export
export function calculateMatchupGap(actor, defender, zone): number {
    if (zone === 'Rim' || zone === 'Paint') {
        const offPower = actor.attr.strength;
        const defSkill = defender.attr.intDef*0.35 + defender.attr.blk*0.30
                       + defender.attr.strength*0.20 + defender.attr.vertical*0.15;
        return offPower - defSkill;
    }
    const offPower = (actor.attr.speed + actor.attr.agility) / 2;
    const defSkill = defender.attr.perDef*0.35 + defender.attr.agility*0.25
                    + defender.attr.speed*0.20 + defender.attr.stl*0.20;
    return offPower - defSkill;
}
export const MATCHUP_GAP_SCALE = 60;

// calculateHitRate() 내부 — 스위치 무관하게 항상 계산, 대칭 적용
const matchupGap = calculateMatchupGap(actor, defender, preferredZone);
const gapNormalized = Math.max(-1, Math.min(1, matchupGap / MATCHUP_GAP_SCALE));
const isMismatch = Math.abs(gapNormalized) >= 0.3;
hitRate += gapNormalized * 0.12; // -12%~+12%, 양방향
if (!isMismatch && isSwitch) hitRate -= 0.03; // 성공적 스위치는 유지
```

**After** (`possessionHandler.ts`, 슈팅파울 배수 — 기존 `foulProbMod` 곱연산 지점에 추가):
```ts
const matchupGap = calculateMatchupGap(actor, defender, preferredZone);
const gapNormalized = Math.max(-1, Math.min(1, matchupGap / MATCHUP_GAP_SCALE));
const matchupFoulMult = 1 + gapNormalized * 0.5; // 0.5배(수비 압도) ~ 1.5배(수비 압도당함)
shootingFoulRate *= foulProbMod * matchupFoulMult;
```

**검증**:
- `npx tsc -p server/tsconfig.json` — `flowEngine.ts`/`possessionHandler.ts` 관련 신규 오류 0건
  (기존 무관한 30건은 그대로, 파일 목록 겹치지 않음 확인).
  이 과정에서 `defender.attr.steal`이라는 존재하지 않는 필드 오타를 발견해 `attr.stl`로 수정
  (client는 vite/esbuild가 타입체크를 안 해서 빌드는 통과했지만 동일 오타가 있었음 — 이전
  `attr.mid`/`attr.midRange` 사례와 똑같이 server tsc가 아니었으면 놓칠 뻔함).
- `npx vite build` — 정상 완료.
- 실제 함수 실행 검증(`npx tsx`로 수정된 `flowEngine.ts`를 직접 import): 하더웨이(공)→윌트(수)
  매치업을 실제 DB 스탯으로 넣어 계산 — 골밑 gap=-24.6(아티팩트 시뮬레이션과 정확히 일치),
  퍼리미터 gap=+31.4(동일). GAP_SCALE=60 적용 시 골밑 foulMult=0.79/hitMod=-4.9%, 퍼리미터
  foulMult=1.26/hitMod=+6.3% — "느린 빅맨이 뚫리면 주로 적중률로, 파울은 최대 1.5배까지만"
  의도대로 동작 확인.

**주의사항 / 한계**: 기존 "성공적 스위치"(-3%) 고정 보너스는 스위치가 실제로 발생했고 동시에
유의미한 미스매치(|gapNormalized|≥0.3)가 아닐 때만 유지 — 스위치 없이 격차가 작은 일반
상황에서는 조정 없음(중립).

**롤백 방법**: 위 Before 블록으로 `flowEngine.ts` 미스매치 계산부를 되돌리고,
`possessionHandler.ts`의 `matchupFoulMult` 관련 라인(3줄)을 제거하면 됨. 미러 쌍이므로 4개
파일 전부 함께.

---

## 2026-07-29 — switchFreq 기반 헬프 디펜스 풀 확장 (빅맨 골밑 파울 쏠림 완화 2/2)

**배경**: 빅맨 파울 쏠림 문제 두 번째 원인 논의. 존 디펜스가 골밑 슛을 C에게 100% 몰아주는 것
자체는(스위치 개념이 없으므로) 논리적으로 맞다고 합의(별도 항목, 이번엔 미수정). 다만 맨투맨에서도
헬프 디펜스 헬퍼 후보 풀이 `HELP_DEFENSE.ZONE_POSITIONS`(Rim/Paint → `['C','PF','SF']`)로 항상
고정돼 있어, 실제로 그 순간 골밑 근처에 없을 법한 상황(예: 우리 C가 상대 스트레치 5를 3점 라인까지
쫓아나간 상태)에서도 매 골밑 돌파마다 균등 확률로 헬프 후보에 낀다는 문제가 남음. 처음엔
`zonePref`(선수 존 선호도) 기반 가중치를 검토했으나 사용자가 "유의미한 효과가 없을 것 같다"고 판단,
대신 **스위치 위주 수비(`switchFreq`가 높음)일수록 헬프 풀이 포지션 제한 없이 온코트 전원으로
확장**되는 더 단순한 설계로 방향 전환. 배율은 처음 0.08(근거 없는 임의값)을 제안했으나, 이미 존재하는
`switchChance = switchFreq * 0.05`(스크린 스위치 확률)와 스케일을 통일하는 게 일관적이라고 판단해
최종적으로 0.05 채택.

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client) — 2.5 Help Defense Resolution의 헬퍼
  풀 선정부
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러) — 동일

**Before**:
```ts
if (helpAttempted) {
    const zonePositions = helpCfg.ZONE_POSITIONS[preferredZone] ?? [];
    let helperPool = defTeam.onCourt.filter(p => p.playerId !== defender.playerId && zonePositions.includes(p.position));
    if (helperPool.length === 0) {
        helperPool = defTeam.onCourt.filter(p => p.playerId !== defender.playerId);
    }
    ...
}
```

**After**:
```ts
if (helpAttempted) {
    // switchFreq가 높을수록(스위치 위주 수비 = 수비수 전원이 유동적 로테이션에 익숙) 헬프 풀이
    // 존별 포지션 제한 없이 온코트 전원으로 확장될 확률이 생김 — 기존 switchChance와 동일 스케일.
    const universalHelpChance = defTeam.tactics.sliders.switchFreq * 0.05;
    const useFullPool = Math.random() < universalHelpChance;

    const zonePositions = helpCfg.ZONE_POSITIONS[preferredZone] ?? [];
    let helperPool = useFullPool
        ? defTeam.onCourt.filter(p => p.playerId !== defender.playerId)
        : defTeam.onCourt.filter(p => p.playerId !== defender.playerId && zonePositions.includes(p.position));
    if (helperPool.length === 0) {
        helperPool = defTeam.onCourt.filter(p => p.playerId !== defender.playerId);
    }
    ...
}
```

**동작 방식**: `switchFreq × 0.05`(1단계 5% ~ 10단계 50%) 확률로 그 포제션의 헬프 디펜스 후보 풀이
`ZONE_POSITIONS` 제한(Rim/Paint→C·PF·SF) 없이 온코트 5명 전체로 열린다. 예: SEA(switchFreq=4)는
20% 확률로 전체 5명 풀 — C가 뽑힐 확률이 최대 1/3(C·PF·SF만 있을 때)에서 1/5로 희석됨. 나머지
80%는 기존과 동일(포지션 제한 풀). 헬프 "시도 빈도"(`ATTEMPT_BASE`/`PER_LEVEL`)는 손대지 않았고,
풀에 가드가 포함돼도 헬프 성공 여부는 여전히 `helpDefIq`×`(agility+speed)` 게이트를 통과해야 해서
가드가 뽑혀도 대부분 실패로 끝남(골밑 헬프 남발 방지).

**검증**:
- `npx tsc -p server/tsconfig.json` — `possessionHandler.ts` 관련 신규 오류 0건.
- `npx vite build` — 정상 완료(신규 에러 없음).
- 별도 시뮬레이션 스크립트 검증은 생략(국소적 산술 로직, 기존 스코프 변수만 재사용).

**주의사항 / 한계**: 존 디펜스의 "Funnel inside shots to Bigs"(C 100% 전담) 로직 자체는 이번에도
그대로 유지 — 사용자와 논의 후 이건 존 디펜스 특성상 맞는 동작이라고 판단해 수정 대상에서 제외.

**롤백 방법**: 위 Before 블록으로 두 파일의 헬퍼 풀 선정부를 되돌리면 됨.

---

## 2026-07-29 — 헬프 디펜스 슈팅파울 보너스를 실제 헬퍼에게 귀속

**배경**: "빅맨들이 파울이 너무 빨리 쌓인다" 점검 중 두 가지 원인을 발견(사용자가 직접 지목):
① 헬프 디펜스 성공 시 붙는 파울 확률 보너스(`FOUL_BONUS_BASE`~)가 실제로 헬프한 선수
(`helpDefender`)가 아니라 원래 포지션 매칭된 수비수(`defender`)한테 그대로 더해지고, 파울이 터지면
무조건 `defender`한테 기록됨. ② 존 디펜스에서 C가 골밑 슛을 100% 전담하는 문제(별도 항목, 이번엔
범위 제외 — 사용자가 1번부터 먼저 처리하기로 결정). 이번 항목은 ①만 수정. 골밑 슛을 헬프 디펜스로
막아준 건 대개 다른 빅맨(PF 등)인데, 그 리스크가 전부 원 수비수(포지션 매칭된 C 등)에게 전가되고
있었음 — 팀원이 도와준 파울까지 한 선수가 떠안는 구조.

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client) — 슈팅파울 판정부(`resolvePlayAction`
  경로의 3단계 Shooting Foul Check)
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러) — 동일

**Before**:
```ts
if (helpAttempted && helpSuccess && (preferredZone === 'Rim' || preferredZone === 'Paint')) {
    shootingFoulRate += helpCfg.FOUL_BONUS_BASE + (helpDefLevel - 1) * helpCfg.FOUL_BONUS_PER_LEVEL;
}
...
if (Math.random() < shootingFoulRate) {
    return {
        type: 'freethrow',
        offTeam, defTeam, actor, defender, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
        zone: preferredZone,
        helpDefenderId,
    };
}
```

**After**:
```ts
let helpBonusRate = 0;
if (helpAttempted && helpSuccess && (preferredZone === 'Rim' || preferredZone === 'Paint')) {
    helpBonusRate = helpCfg.FOUL_BONUS_BASE + (helpDefLevel - 1) * helpCfg.FOUL_BONUS_PER_LEVEL;
    shootingFoulRate += helpBonusRate;
}
...
if (Math.random() < shootingFoulRate) {
    // 헬프 보너스가 기여한 비율만큼 확률적으로 실제 헬퍼에게 파울 귀속(전체 파울 확률 자체는 불변)
    const helpFoulShare = helpBonusRate > 0
        ? Math.min(1, (helpBonusRate * foulProbMod) / shootingFoulRate)
        : 0;
    const fouler = (helpDefender && Math.random() < helpFoulShare) ? helpDefender : defender;
    return {
        type: 'freethrow',
        offTeam, defTeam, actor, defender: fouler, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
        zone: preferredZone,
        helpDefenderId,
    };
}
```

**동작 방식**: 헬프 보너스(`helpBonusRate`)를 별도 변수로 추적해두고, 파울이 실제로 터졌을 때
`foulProbMod`(파울트러블 배율)까지 반영한 헬프 보너스의 비중만큼 확률적으로 `helpDefender`에게
파울을 배정한다. 헬프가 없었거나 실패했으면 `helpBonusRate=0`이라 기존과 완전히 동일하게 항상
`defender`. 전체 슈팅파울 확률(게임 밸런스) 자체는 손대지 않고, **누구에게 기록되느냐만** 기여도에
비례해 재분배.

**검증**:
- `npx tsc -p server/tsconfig.json` — `possessionHandler.ts` 관련 신규 오류 0건.
- `npx vite build` — 정상 완료(신규 에러 없음).
- 별도 시뮬레이션 스크립트 검증은 생략(변경이 국소적 산술 로직이고, `helpDefender`/`foulProbMod` 등
  기존 스코프 변수만 재사용해 타입체크로 충분히 안전하다고 판단).

**주의사항 / 한계**: 존 디펜스에서 C가 골밑 슛을 100% 전담하는 문제(이번 조사에서 함께 발견,
"Funnel inside shots to Bigs" 로직)는 이번 수정 범위에 포함되지 않음 — 별도 후속 작업 필요.

**롤백 방법**: 위 Before 블록으로 두 파일의 `helpBonusRate` 추적 및 파울 귀속 분기를 제거하면 됨.

---

## 2026-07-29 — 플레이타입 선택 가중치(PLAY_TYPE_PROFILES) base 전면 재조정

**배경**: 앵커 기반 insideOut 로직(바로 아래 항목)을 적용해도 BIG LEAGUE TEST 7의 SEA(윌트
체임벌린)가 여전히 포제션을 충분히 못 가져가는 문제가 계속됨. 실제 경기(`T_R2_M1_G4`, 107-132 패)
박스스코어를 분석한 결과, PG 팀 하더웨이가 팀내 압도적 1위(17FGA)를 가져간 반면 윌트는 6FGA에
그침(+파울아웃으로 4쿼터 결장). `computePlayTypeWeights()`의 `PLAY_TYPE_PROFILES`를 뜯어보니
원인은 슬라이더 계수가 아니라 **base 값 자체**였음 — `PnR_Handler`(3.0)와 `CatchShoot`(3.5)가
`PostUp`/`PnR_Roll`(각 1.5)보다 2배 가까이 높게 잡혀 있어서, insideOut을 아무리 낮춰도(insideFactor
최대 0.8) 그 격차를 계수 보정만으로는 못 뒤집었음. git log·주석 어디에도 이 base 값들의 산정 근거가
없었음(확인함). 아티팩트로 base 값을 직접 편집하며 4개 시나리오(중립/SEA 실제/완전인사이드/
완전아웃사이드)의 정규화된 포제션 비율을 실시간 비교 검증한 뒤, 사용자가 확정한 값을 반영.

**변경 파일**:
- `services/game/config/playTypeProfiles.ts` (client) — `PLAY_TYPE_PROFILES`의 `base` 값 10개 전체
- `server/src/shared/game/config/playTypeProfiles.ts` (server 미러) — 동일
- `docs/engine/pbp-engine.md` — `PLAY_TYPE_PROFILES` 표 및 ballMovement별 CatchShoot 비중 예시
  갱신(기존 실측치는 base 변경으로 무효화됨을 명시)

**Before**:
```ts
'Iso':           { base: 2.0, inside:  0.0, pnr:  0.0, bm: -2.0 },
'PostUp':        { base: 1.5, inside: +2.5, pnr:  0.0, bm: -1.0 },
'PnR_Handler':   { base: 3.0, inside:  0.0, pnr: +3.0, bm:  0.0 },
'PnR_Roll':      { base: 1.5, inside: +1.5, pnr: +2.0, bm:  0.0 },
'PnR_Pop':       { base: 1.0, inside: -1.5, pnr: +2.0, bm:  0.0 },
'CatchShoot':    { base: 3.5, inside: -2.0, pnr:  0.0, bm: +2.0 },
'OffBallScreen': { base: 1.5, inside: -1.0, pnr:  0.0, bm: +1.5 },
'DriveKick':     { base: 2.5, inside: -1.0, pnr:  0.0, bm: +2.0 },
'Cut':           { base: 2.0, inside: +1.5, pnr:  0.0, bm: +1.5 },
'Handoff':       { base: 1.5, inside:  0.0, pnr:  0.0, bm: +1.0 },
```

**After**:
```ts
'Iso':           { base: 1.5, inside:  0.0, pnr:  0.0, bm: -2.0 },
'PostUp':        { base: 1.5, inside: +2.5, pnr:  0.0, bm: -1.0 },
'PnR_Handler':   { base: 1.5, inside:  0.0, pnr: +3.0, bm:  0.0 },
'PnR_Roll':      { base: 1.5, inside: +1.5, pnr: +2.0, bm:  0.0 },
'PnR_Pop':       { base: 1.0, inside: -1.5, pnr: +2.0, bm:  0.0 },
'CatchShoot':    { base: 1.0, inside: -2.0, pnr:  0.0, bm: +2.0 },
'OffBallScreen': { base: 1.0, inside: -1.0, pnr:  0.0, bm: +1.5 },
'DriveKick':     { base: 0.7, inside: -1.0, pnr:  0.0, bm: +2.0 },
'Cut':           { base: 0.7, inside: +1.5, pnr:  0.0, bm: +1.5 },
'Handoff':       { base: 0.5, inside:  0.0, pnr:  0.0, bm: +1.0 },
```
(inside/pnr/bm 계수는 미변경, base만 조정)

**검증**:
- `npx tsc -p server/tsconfig.json` — `playTypeProfiles.ts` 관련 신규 오류 0건.
- `npx vite build` — 정상 완료(신규 에러 없음).
- 공식 계산값 비교(아티팩트 시뮬레이션):
  - 중립(5/5/5): 이전 CatchShoot 17.5%+PnR_Handler 15.0%=32.5% 독식 → 이후 PnR_Handler·Iso·
    PnR_Roll·PostUp 4개 13.8% 동률로 고르게 분산.
  - SEA 실제(insideOut=3/pnrFreq=5/ballMovement=6): 이전 CatchShoot 14.7%·PnR_Handler 14.2%가
    1·2위 → 이후 PostUp 19.2%·PnR_Roll 17.5%가 1·2위, PnR_Handler는 12.5%로 4위 하락.

**주의사항 / 한계**: 완전인사이드 시나리오(insideOut=1/pnrFreq=1/ballMovement=1)에서 Iso가
25.4%까지 오르는데, 이건 insideOut이 아니라 같이 낮춘 ballMovement(Iso의 bm 계수 -2.0)의
영향이 커서 순수 insideOut 단독 효과로 오독하지 않도록 주의.

**롤백 방법**: 위 Before 블록으로 두 파일의 `PLAY_TYPE_PROFILES` base 값만 되돌리면 됨(계수는
안 건드렸으므로 base 10개만 원복).

---

## 2026-07-29 — AI 자동전술 생성: 공격 포인트(insideOut)를 앵커 선수 아키타입 기반으로 결정

**배경**: "멀티플레이어 AI 자동전술 로직을 변경하자. 주전 5인의 최고 선수에 따라 공격 포인트를
조절할 수 있는 로직을 추가하고 싶음. 다른건 다 놔두고, 공격 포인트만." 요청. 기존
`generateAutoTactics()`의 `insideOut` 계산은 주전 5명 전체를 평균/최댓값(`maxOf(postScore)`,
`avgOf(spacerScore)` 등)으로 블렌드하는 방식이라, "이 팀에 카림 압둘자바·윌트 체임벌린 같은
로우포스트 전용 레전드가 있다" 같은 단일 선수의 극단적 아키타입이 잘 반영되지 않았다. 주전 중
OVR 최고 선수(앵커)를 따로 판별해, 그 선수가 엘리트 빅맨(3점 사실상 없음+포스트 지배력 매우
높음)이면 인사이드로, 엘리트 슈터(3점 최상급)면 아웃사이드로 슬라이더를 직행시키도록 변경.
BIG LEAGUE TEST 7의 실제 32팀 로스터로 시뮬레이션 검증(아티팩트) 후 반영 — 12/32팀에서 값이
바뀌었고 전부 실제 아키타입과 일치, 오탐 없음 확인. 이후 사용자가 "자동전술 생성 시 공격
포인트의 범위는 3~8 사이로 설정해줘"라고 요청해, 애초 제안했던 극단값(2/9) 대신 3/8로, 기존
블렌드(fallback) 로직의 결과값도 함께 3~8로 재클램프.

**변경 파일**:
- `services/game/tactics/tacticGenerator.ts` (client) — `generateAutoTactics()` 내 `insideOut`
  계산부
- `server/src/shared/game/tactics/tacticGenerator.ts` (server 미러) — 동일

**Before**:
```ts
const insideInd = maxOf(postScore) * 0.5 + maxOf(rollerScore) * 0.3 + maxOf(driverScore) * 0.2;
const outsideInd = avgOf(spacerScore) * 0.6 + avgOf(get3pt) * 0.4;
const insideOut = clamp(Math.round(5 + (outsideInd - insideInd) * 0.15));
```

**After**:
```ts
const anchor = starters.reduce((best, p) => (calculatePlayerOvr(p) > calculatePlayerOvr(best) ? p : best));
// server 미러는 calculatePlayerOvr 대신 calculateOvr(ovrUtils.ts) 사용, 로직 동일
const isEliteBig = get3pt(anchor) < 35 && postScore(anchor) >= 85;
const isEliteShooter = get3pt(anchor) >= 90;

let insideOut: number;
if (isEliteBig) {
    insideOut = 3;
} else if (isEliteShooter) {
    insideOut = 8;
} else {
    const insideInd = maxOf(postScore) * 0.5 + maxOf(rollerScore) * 0.3 + maxOf(driverScore) * 0.2;
    const outsideInd = avgOf(spacerScore) * 0.6 + avgOf(get3pt) * 0.4;
    insideOut = clamp(Math.round(5 + (outsideInd - insideInd) * 0.15), 3, 8);
}
```

**검증**:
- 서버: `npx tsc -p server/tsconfig.json` — `tacticGenerator.ts` 관련 신규 오류 0건.
- 클라이언트: `npx vite build` 정상 완료(신규 에러 없음).
- BIG LEAGUE TEST 7 32팀 실제 로스터(현재 선발 라인업)에 `npx tsx`로 직접 시뮬레이션 —
  카림 압둘자바(CHA)·하킴 올라주원(CHI)·조지 마이칸(CLE)·샤킬 오닐(PHI)·윌트 체임벌린(SEA) 5팀이
  엘리트빅맨으로, 스테판 커리(BKN)·래리 버드(BOS)·레이 앨런(DAL)·니콜라 요키치(HOU)·제임스
  하든(LVP)·더크 노비츠키(MIA)·루카 돈치치(NYK) 7팀이 엘리트슈터로 정확히 분류됨(오탐 없음).
  요키치는 postScore도 85+로 빅맨 조건에 근접하지만 get3pt=90.3이라 빅맨 조건(get3pt<35)을
  통과 못 하고 슈터로 분류되는 경계 사례 확인(설계상 허용).

**롤백 방법**: 위 Before 블록으로 두 파일의 `insideOut` 계산부만 되돌리면 됨(다른 슬라이더
계산은 미변경).

---

## 2026-07-29 — Scoring Gravity(옵션 순위) 엔진 전면 교체: peak/secondary 가중 + OVR 게이팅 + 대칭형 systemBonus + 99 캡 제거

**배경**: "왜 카림 압둘자바가 4옵션으로 선정되는지" 질문에서 시작된 옵션 시스템(그라비티) 조사가 여러
단계를 거쳐 4가지 구조적 문제로 정리됨. 대화 중 별도 아티팩트(BIG LEAGUE TEST 6 320명 전체 실측
데이터 기반 시뮬레이터)로 A~F안을 반복 검증한 뒤 최종안을 확정, 이번에 실제 엔진에 포팅함.
1. 기존 `zoneAvg(ins*0.4+out*0.3+mid*0.2+ft*0.1)` 고정 평균은 한쪽 zone만 압도적인 선수를
   구조적으로 저평가함 (밀워키에서 out=52뿐인 하킴 올라주원이 밸런스형 빈스 카터보다 옵션 순위가
   낮게 나옴 — insZone/outZone을 peak 0.7/secondary 0.3 동적 가중으로 교체해 해결).
2. zone 스탯 하나만 튀어도 종합 기량과 무관하게 최상위권에 몰림 (320명 중 74명이 이론상 99 도달,
   마누 지노빌리·조 존슨 등 롤플레이어급 포함) — 종합 OVR로 최종값을 곱연산 억제하는 ovrGate 추가로
   28~30명 수준으로 억제(잔존자는 전부 OVR 87+).
3. 전술 슬라이더(`insideOut`) 보정항(`systemBonus`)이 비대칭 구조(기울어진 쪽 zone 70 초과 시
   보너스만, 반대쪽 페널티 없음)라, ins/out 둘 다 70+인 투웨이 스코어러(앤서니 데이비스 등)가
   슬라이더=5(밸런스)에서 오히려 최저점을 찍는 골짜기가 생김 — `tilt*(insZone-outZone)*0.15`
   대칭형(강점 방향과 전술이 맞으면 보너스, 어긋나면 페널티)으로 교체해 slider=5에서 항상 정확히 0.
4. `Math.min(99, ...)` 하드캡이 실질적 역할이 없으면서(아래 검증 참고) 두 선수가 동시에 99에 닿으면
   동점이 되어 정렬이 뭉개지는 부작용만 있었음(밀워키 하킴/카터가 캡 때문에 배열 순서로 우연히
   항상 카터가 위로 감) — 캡 제거.

**주의(향후 수정 시 필독)**: 그라비티 전용 `insZone`/`outZone`은 `p.attr.ins`/`p.attr.out`
(`dataMapper.ts` 계산값 — hands 포함, shotIq/offConsist 등 mentality 스탯 혼합, OVR 계산 등 다른
용도로 계속 쓰임)과 **이름만 비슷할 뿐 전혀 다른 값**이다. `closeShot/layup/dunk/postPlay`(순수
인사이드)와 `midRange`+3점 서브존 평균(순수 아웃사이드)만으로 그라비티 함수 내부에서 로컬로 재조합했다.
`p.attr.ins`/`p.attr.out` 필드 자체는 건드리지 않았음.

**변경 파일**:
- `services/game/engine/pbp/usageSystem.ts` (client)
- `server/src/shared/engine/pbp/usageSystem.ts` (server 미러)

**Before**:
```ts
function calculateScoringGravity(p: LivePlayer): number {
    const zoneAvg = (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);
    const peak = Math.max(p.attr.ins, p.attr.out, p.attr.mid);
    const dominanceBonus = Math.max(0, peak - 80) * 1.0;
    return Math.min(99, zoneAvg + dominanceBonus);
}

export function getTeamOptionRanks(team: TeamState): Map<string, number> {
    const rankMap = new Map<string, number>();
    const sortedPlayers = [...team.onCourt].sort((a, b) => {
        return calculateScoringGravity(b) - calculateScoringGravity(a);
    });
    sortedPlayers.forEach((p, index) => { rankMap.set(p.playerId, index + 1); });
    return rankMap;
}

export function getTopPlayerGravity(team: TeamState): number {
    if (team.onCourt.length === 0) return 0;
    return Math.max(...team.onCourt.map(p => calculateScoringGravity(p)));
}
```

**After**:
```ts
function calculateScoringGravity(p: LivePlayer, insideOut: number): number {
    const a = p.attr;
    const insZone = (a.closeShot + a.layup + a.dunk + a.postPlay) / 4;
    const threeAvg = (a.threeCorner + a.three45 + a.threeTop) / 3;
    const outZone = (a.mid + threeAvg) / 2;

    const peak = Math.max(insZone, outZone);
    const secondary = Math.min(insZone, outZone);
    const peakBase = (peak * 0.7) + (secondary * 0.3) + (a.ft * 0.1);
    const dominanceBonus = Math.max(0, peak - 80) * 1.0;

    const tilt = (5 - insideOut) / 5;
    const systemBonus = tilt * (insZone - outZone) * 0.15;

    const ovrGate = Math.max(0.5, Math.min(1.15, (p.ovr - 65) / 30));
    return (peakBase + dominanceBonus + systemBonus) * ovrGate; // 99 캡 없음
}

export function getTeamOptionRanks(team: TeamState): Map<string, number> {
    const rankMap = new Map<string, number>();
    const insideOut = team.tactics.sliders.insideOut;
    const sortedPlayers = [...team.onCourt].sort((a, b) => {
        return calculateScoringGravity(b, insideOut) - calculateScoringGravity(a, insideOut);
    });
    sortedPlayers.forEach((p, index) => { rankMap.set(p.playerId, index + 1); });
    return rankMap;
}

export function getTopPlayerGravity(team: TeamState): number {
    if (team.onCourt.length === 0) return 0;
    const insideOut = team.tactics.sliders.insideOut;
    return Math.max(...team.onCourt.map(p => calculateScoringGravity(p, insideOut)));
}
```

**99 캡 제거가 안전한 이유(포팅 전 확인 완료)**: `getTeamOptionRanks`는 정렬 순서만 쓰므로 캡 유무와
무관. `getTopPlayerGravity`가 먹이는 `possessionHandler.ts:366`의 Star Gravity 부스트
(`Math.min(0.30, Math.max(0, (topGravity-63)*0.015))`)는 자체적으로 topGravity=83부터 이미
saturate되어 99 캡이 실질적으로 아무 역할을 하지 않았음. `components/dashboard/tactics/charts/
UsagePrediction.tsx`의 `calcGravity()`는 완전히 별도의(이미 캡 없는) 자체 공식이라 이번 변경과 무관.
Star Gravity 부스트 임계값(63/83)은 신규 공식 기준 BIG LEAGUE TEST 6 320명 실측 분포(중앙값 60.1,
63 미만 57%, 83 이상 19%, raw≥99 29명 — 전부 OVR 87+)와 여전히 합리적으로 맞아떨어져 재조정하지
않고 유지.

**검증**:
- 서버: `npx tsc -p server/tsconfig.json` — `usageSystem.ts`/`pbpTypes.ts`/`possessionHandler.ts`
  관련 신규 오류 0건(기존에도 있던 무관한 30건은 그대로, 파일 목록 확인해 겹치지 않음을 확인).
  이 과정에서 `attr.midRange`라는 존재하지 않는 필드를 잘못 참조한 오타를 발견해 `attr.mid`로 수정함
  (client는 vite/esbuild가 타입체크를 안 해서 빌드는 통과했지만 동일 오타가 있었음 — server tsc가
  아니었으면 놓칠 뻔함).
- 클라이언트: `npx vite build` 정상 완료(사전 존재하던 청크 크기/순환 경고만 있음, 신규 에러 없음).
- 실제 함수 실행 검증: `npx tsx`로 수정된 `services/game/engine/pbp/usageSystem.ts`를 실제 import해서
  밀워키 로스터(하킴 올라주원 vs 빈스 카터, DB 실측 스탯 + 엔진으로 계산한 실제 OVR 96/92)를 넣고
  `getTeamOptionRanks`/`getTopPlayerGravity`를 직접 호출: `insideOut=1~3`(인사이드 전술)에서 하킴이
  1옵션, `insideOut=6~10`(아웃사이드 전술)에서 카터가 1옵션으로 전환 — 설계 의도(전술 방향과 선수의
  실제 강점이 맞아야 우대)대로 동작 확인. `insideOut=5`(밸런스)는 98.15 vs 98.36으로 반올림 오차
  수준의 초박빙(설계상 자연스러움 — 아티팩트의 정수 반올림 데이터에서는 하킴이 근소 우위였으나 실제
  소수점 값으로는 카터가 근소 우위, 어느 쪽이든 큰 의미 없는 차이).

**롤백 방법**: 위 Before 블록 내용으로 두 파일(`services/game/engine/pbp/usageSystem.ts`,
`server/src/shared/engine/pbp/usageSystem.ts`)의 `calculateScoringGravity`/`getTeamOptionRanks`/
`getTopPlayerGravity` 세 함수를 그대로 되돌리면 됨(다른 함수는 미변경).

---

## 2026-07-28 — 멀티 라이브게임뷰 실시간 FT(자유투) 미반영 버그 수정

**배경**: "멀티플레이어 라이브게임뷰의 FT가 데이터 반영이 안 되는 것 같다"는 제보. 조사 결과,
경기가 `final`로 완료된 뒤에는 사전계산된 완전한 박스(`home_box`/`away_box`)를 그대로 써서 FT가
정상 표시되지만, **경기가 진행 중(live)일 때만** 스포일러 방지를 위해 별도로 만드는 델타
타임라인(`box_timeline`, 포세션마다 스탯 변화분만 기록해 elapsed 시점까지 클라이언트가 점진적으로
재구성)에서 `ftm`/`fta`가 애초에 추적 대상 필드 목록 자체에 빠져 있었던 게 원인. 즉 자유투 성공/시도
자체는 `LivePlayer` 객체에 정확히 누적되고 있었지만(`statsMappers.ts`), 그걸 매 포세션 diff로 떠서
`box_timeline`에 기록하는 `BOX_DELTA_KEYS`/`snapshotBoxStats()`가 `ftm`/`fta`를 아예 몰랐음 —
"실시간에는 항상 0, 경기 끝나면 정상"이라는 사용자 체감과 정확히 일치. 클라이언트 렌더링
(`MultiGamePbpView.tsx`)은 이미 `p.ftm`/`p.fta`를 정상적으로 읽고 있어 수정 불필요, 원인은
엔진 단계(client/server 미러 각 2파일, 총 4파일)에 한정됨.

**변경 파일**:
- `types/engine.ts` (client) — `BoxDelta`에 `ftm?: number; fta?: number;` 추가
- `server/src/shared/types/engine.ts` (server 미러) — 동일
- `services/game/engine/pbp/liveEngine.ts` (client) — `BOX_DELTA_KEYS` 배열에 `'ftm', 'fta'` 추가,
  `snapshotBoxStats()`에 `ftm: p.ftm, fta: p.fta` 추가
- `server/src/shared/engine/pbp/liveEngine.ts` (server 미러) — 동일

**Before**:
```ts
const BOX_DELTA_KEYS: (keyof BoxDelta)[] = ['pts', 'reb', 'offReb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'p3m', 'p3a'];

function snapshotBoxStats(p: LivePlayer): BoxDelta {
    return {
        pts: p.pts, reb: p.reb, offReb: p.offReb, ast: p.ast, stl: p.stl,
        blk: p.blk, tov: p.tov, pf: p.pf,
        fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a,
    };
}
```

**After**:
```ts
const BOX_DELTA_KEYS: (keyof BoxDelta)[] = ['pts', 'reb', 'offReb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'p3m', 'p3a', 'ftm', 'fta'];

function snapshotBoxStats(p: LivePlayer): BoxDelta {
    return {
        pts: p.pts, reb: p.reb, offReb: p.offReb, ast: p.ast, stl: p.stl,
        blk: p.blk, tov: p.tov, pf: p.pf,
        fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a,
        ftm: p.ftm, fta: p.fta,
    };
}
```

**검증**: 클라이언트(`types/engine.ts`/`liveEngine.ts`/`MultiGamePbpView.tsx`)와 서버
(`cd server && tsc --noEmit -p .`) 양쪽 다 신규 타입 에러 없음 확인. `MultiGamePbpView.tsx`(및
레거시 파일)의 델타 소비 코드가 `Object.entries(delta)`로 키를 제너릭하게 순회하는 방식이라 별도
클라이언트 수정 없이 새 필드를 자동으로 반영함을 코드로 확인. 실제 진행 중인 멀티 경기로 라이브
FT 반영 여부를 직접 확인하는 스모크 테스트는 미실시(서버 재배포 필요 + 실시간 경기 진행 대기 필요).

**롤백 방법**: 위 4개 파일에서 `ftm`/`fta` 관련 추가분만 제거하면 됨. client/server 미러 쌍이므로
반드시 4개 파일 전부 함께 되돌릴 것 — 하나만 되돌리면 서버가 보내는 델타와 클라이언트 타입이
불일치하게 됨(런타임 에러는 안 나지만 그 쪽 필드만 다시 조용히 0으로 고정됨).

---

## 2026-07-28 — Scoring Gravity에 dominanceBonus 추가 (S급 빅맨 저득점 2단계 수정)

**배경**: [Scoring Gravity(옵션 순위) 산정에서 mentality/체력 페널티 제거](#2026-07-28--scoring-gravity옵션-순위-산정에서-mentality체력-페널티-제거)(1단계, 아래 항목)에서 예고한 2단계 —
`calculateScoringGravity()`의 `baseOffense = ins*0.4 + out*0.3 + mid*0.2 + ft*0.1`가 인사이드(0.4)
보다 아웃+미드 합(0.5)을 더 높게 쳐서, 3점을 못 던지는 고전 센터가 실제 득점력과 무관하게 옵션 순위
최하위로 밀리는 근본 원인을 수정. 처음엔 절대 임계값(63, Star Gravity 발동 기준)을 넘기는지로
검증했으나, 실제 문제의 핵심인 `getTeamOptionRanks()`는 절대값이 아니라 **코트 위 5명 간 상대 순위**로만
동작한다는 걸 사용자가 지적 — 5인 라인업 시뮬레이션으로 재검증함. 예) 스타로 가득한 라인업(듀란트/
코비/매직/말론/샤킬형)에서 임계값80·배율0.8로는 샤킬이 절대값 기준 63을 넘겨도 여전히 5옵션(꼴찌)
이었음 — 매직(67.5)·말론(64.9)에도 못 미쳤기 때문. 배율을 1.0으로 올려야 실제로 순위가 3옵션까지
올라옴을 확인. 동시에 3레벨 스코어러(듀란트)와 순수 슈터(클레이) 비교에서, 배율을 너무 올리면
"정점 능력치만 높은 스페셜리스트가 세 구역 다 뛰어난 만능 스코어러를 역전"하는 부작용도 발견해
배율 상한(1.0, 1.2부터 역전 발생)까지 함께 확인.

**변경 파일**:
- `services/game/engine/pbp/usageSystem.ts` (client) — `calculateScoringGravity()`에 `peak`
  (ins/out/mid 중 최댓값)이 80 초과 시 초과분×1.0을 가산하는 `dominanceBonus` 추가, 결과 99 상한
- `server/src/shared/engine/pbp/usageSystem.ts` (server 미러) — 동일 변경

**Before**:
```ts
function calculateScoringGravity(p: LivePlayer): number {
    return (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);
}
```

**After**:
```ts
function calculateScoringGravity(p: LivePlayer): number {
    const zoneAvg = (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);
    const peak = Math.max(p.attr.ins, p.attr.out, p.attr.mid);
    const dominanceBonus = Math.max(0, peak - 80) * 1.0;
    return Math.min(99, zoneAvg + dominanceBonus);
}
```

**검증**:
- Node 스크립트로 두 가지 5인 라인업 시나리오 실측:
  - 스타 가득 라인업(듀란트/코비/매직/말론/샤킬형): 샤킬 5옵션(50.8)→3옵션(67.8), 듀란트(98.2)>클레이(97.5)
    순서 유지 확인
  - 샤킬+평범한 롤플레이어 4명: 샤킬 5옵션(50.8, 평범한 선수들보다도 밀림)→1옵션(67.8)으로 정상화
  - 배율 0.8~2.0 / 임계값 75~85 조합 스윕 — 배율 1.0·임계값 80이 "듀란트>클레이 순서 보존"과
    "스타 라인업 내 샤킬 순위 개선"을 동시에 만족하는 조합임을 확인(배율 1.2부터 순서 역전 시작)
  - 평범/벤치/수비형 등 peak 80 미만 프로필은 보너스 0으로 기존과 동일함을 확인(회귀 없음)
- client/server diff 확인(주석 차이만 존재, 로직 완전 동일), 양 파일 중괄호 균형 확인
- `tsc --noEmit` 신규 에러 없음, `npm run build` 성공
- `fly deploy -a basketballgm-app-server` 배포 후 헬스체크 200, `worker#0 ready`/`scheduler started`
  정상 재기동 확인 (배포 중 "not listening on 0.0.0.0:3001" 경고는 기존에 확인된 일시적 부팅 노이즈)

**주의사항 / 한계**:
- 이번 수정으로 실제 멀티플레이어 시뮬레이션에서 S급 빅맨의 옵션 순위/사용량이 개선될 것으로
  예상되나, `BIG LEAGUE TEST 5`(또는 신규 테스트 세션)에서 배포 후 실제 경기를 몇 게임 시뮬레이션해
  포지션별 득점 분포가 실제로 개선됐는지 재확인이 필요함(아직 미실시)
- Star Gravity 발동 임계값(63, 1단계에서 조정)은 이번 변경으로 재조정하지 않음 — dominanceBonus로
  값이 올라간 선수는 자연스럽게 63을 더 쉽게 넘기게 되므로 문제 없음

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

---

## 2026-07-28 — Scoring Gravity(옵션 순위) 산정에서 mentality/체력 페널티 제거

**배경**: `BIG LEAGUE TEST 5`(멀티 토너먼트, room `b3ad7461-4ce1-4293-b49a-c75641d5a0cd`) 박스스코어를
DB에서 직접 집계한 결과, 출전시간이 거의 동일(포지션별 평균 24분 안팎)한데도 포지션별 평균 득점이
PG 12.51 → SG 11.36 → SF 9.74 → PF 8.26 → C 5.92로 단조 감소, FGA도 PG 9.96 vs C 4.44로 절반 이하.
S급 센터(샤킬 오닐)조차 35.3분 선발 출전하면서 FGA 5.77개에 그침 — 포지션 자체가 구조적으로 배제되는
현상 확인. 원인 추적 결과 `usageSystem.ts:calculateScoringGravity()`(코트 위 5명의 "1~5옵션" 순위를
매기는 함수, `playTypes.ts:pickWeightedActor()`에서 옵션 순위별 최대 7.3배 사용량 배율로 이어짐)의
`baseOffense = ins*0.4 + out*0.3 + mid*0.2 + ft*0.1` 가중치가 인사이드(0.4)보다 아웃+미드 합(0.5)을
더 높게 쳐서, 3점을 못 던지는 고전 센터가 실제 득점력과 무관하게 낮은 옵션으로 밀려나는 게 근본 원인으로
드러남(이 부분은 별도로 2단계 수정 예정, 아직 미착수).

이번 커밋은 그 2단계 수정에 앞선 1단계 — `calculateScoringGravity()`가 `baseOffense`(40%) 외에
`mentality`(offConsist/shotIq/pas, 40%)와 `fatigueFactor`(체력, 최저 0.5배)까지 섞고 있었는데, 이
둘은 `flowEngine.ts`의 히트레이트 계산(shotIqNoise/consistNoise/fatigueOff 등)에 이미 독립적으로
반영되고 있어 gravity에도 넣으면 "볼을 못 받는 것"(옵션 순위 하락)과 "넣지를 못하는 것"(히트레이트
하락)이 이중으로 겹쳐 짓눌리는 문제가 있었음. gravity를 순수 raw 능력치로만 산정하도록 정리해 고볼륨
저효율/저볼륨 고효율/체력 저하 시 효율만 하락하는 선수 유형을 자연스럽게 구현할 수 있게 됨(사용자 제안).

**변경 파일**:
- `services/game/engine/pbp/usageSystem.ts` (client) — `calculateScoringGravity()`에서 mentality/
  fatigueFactor 제거
- `server/src/shared/engine/pbp/usageSystem.ts` (server 미러) — 동일 변경
- `services/game/engine/pbp/possessionHandler.ts` (client) — Star Gravity 발동 임계값 `65` → `63`
  재조정 (gravity 스케일 변경 반영)
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러) — 동일 변경

**Before**:
```ts
function calculateScoringGravity(p: LivePlayer): number {
    const baseOffense = (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);
    const consistMod = 1.0 + ((p.tendencies?.consistency ?? 0.6) - 0.5) * 0.2;
    const mentality = (p.attr.offConsist * 0.4 * consistMod) + (p.attr.shotIq * 0.4) + (p.attr.pas * 0.2);
    const fatigueFactor = Math.max(0.5, p.currentCondition / 100);
    return (baseOffense * 0.6 + mentality * 0.4) * fatigueFactor;
}

// possessionHandler.ts
const gravityBoost = Math.min(0.30, Math.max(0, (topGravity - 65) * 0.015));
```

**After**:
```ts
function calculateScoringGravity(p: LivePlayer): number {
    return (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);
}

// possessionHandler.ts
const gravityBoost = Math.min(0.30, Math.max(0, (topGravity - 63) * 0.015));
```

**검증**:
- Node 스크립트로 3레벨 스코어러/순수 슈터/비슈팅 빅맨/만능 빅맨/평균 주전/벤치/수비 스페셜리스트
  7개 아키타입 프로필에 대해 condition=100 기준 old/new 공식 출력 비교 — ratio 평균 0.965(0.876~1.023
  분포), 이를 근거로 Star Gravity 임계값 65×0.965≈62.7 → 63으로 재조정
  (임계값을 새 스케일에 맞게 고칠지, gravity 공식에 보정상수를 곱해 기존 스케일에 맞출지 사용자와
  논의 후 — 소비처가 `getTopPlayerGravity()`의 절대 임계값 비교 한 곳뿐이라 공식 자체는 순수하게 두고
  임계값만 재조정하는 쪽으로 결정)
- client/server diff 확인(주석 차이만 존재, 로직 완전 동일)
- 양 파일 중괄호 균형 확인, `tsc --noEmit` 신규 에러 없음, `npm run build` 성공
- `fly deploy -a basketballgm-app-server` 배포 후 헬스체크 200, `worker#0 ready`/`scheduler started`
  정상 재기동 확인

**주의사항 / 한계**:
- `tendencies.consistency`(SaveTendency)가 이 함수에서만 소비되고 있었는데, mentality 제거로 이제
  아무 데서도 안 쓰이는 dead code가 됨 — 이번 범위에서는 삭제하지 않고 남겨둠(별도 처리 필요 시 논의)
- 지친 에이스도 이제 경기 후반까지 옵션 순위/Star Gravity 보정이 유지됨(볼 소유는 그대로, 적중률만
  `flowEngine.ts`의 fatigueOff로 하락) — 의도된 동작 변경
- **이번 변경만으로는 "S급 빅맨 저득점" 문제가 해결되지 않음.** `baseOffense`의 `ins/out/mid` 가중치
  편향(2단계 수정 대상)은 그대로 남아있어, 실제 체감 개선은 2단계 완료 후 확인 필요

**롤백 방법**: 위 Before 블록으로 4개 파일 모두 되돌리면 됨.

---

## 2026-07-28 — 드래프트 보드 팀 헤더 AUTO 배지 레이아웃 시프트 수정

**배경**: `DraftBoard.tsx`의 팀 헤더에 온라인 점/AUTO 배지를 넣는 `<div className="flex items-center
gap-1">`가 고정 높이 없이 내용물 크기에 맞춰졌음 — 온라인 점(6px 원)만 있을 때보다 AUTO 배지
(`text-[7px]` + `py-[1px]`, 실제 렌더 높이 ~9~10px)가 더 커서, 오토픽 전환으로 배지가 나타나는
순간 그 행의 높이가 늘어나고 `<thead>`가 `sticky top-0`라 테이블 헤더 전체 높이가 갑자기 커지는
레이아웃 시프트가 발생했음. 사용자가 실제로 목격하고 수정 요청.

**변경 파일**:
- `components/draft/DraftBoard.tsx` (client) — 온라인 점/AUTO 배지를 감싸는 행에 `h-[10px]` 고정
  높이 부여(배지 유무와 무관하게 항상 같은 공간 차지). 단, 이 행 자체를 `onlineTeamIds ||
  autoPickTeamIds`가 하나라도 전달된 경우에만 렌더링해 — 이 prop들을 안 쓰는 싱글/루키 드래프트
  보드(`FantasyDraftView.tsx`, `DraftHistoryView.tsx`가 같은 `DraftBoard` 컴포넌트를 공유)에는
  영향이 전혀 없도록 함(그쪽은 기존처럼 이 행 자체가 아예 렌더링 안 됨)

**Before**:
```tsx
<div className="flex flex-col items-center gap-0.5">
    <span>{td.abbr}</span>
    <div className="flex items-center gap-1">
        {isOnline !== undefined && <span style={{ width:6, height:6, ... }} />}
        {isAutoPick && <span className="text-[7px] ... py-[1px] ...">AUTO</span>}
    </div>
</div>
```

**After**:
```tsx
<div className="flex flex-col items-center gap-0.5">
    <span>{td.abbr}</span>
    {(onlineTeamIds || autoPickTeamIds) && (
        <div className="flex items-center justify-center gap-1 h-[10px]">
            {isOnline !== undefined && <span style={{ width:6, height:6, ... }} />}
            {isAutoPick && <span className="text-[7px] ... py-[1px] ...">AUTO</span>}
        </div>
    )}
</div>
```

**검증**: `DraftBoard.tsx`에 대해 synthesize한 tsc 옵션으로 신규 타입 에러 없음 확인. 실제 브라우저
렌더링(온라인 점만 있을 때/AUTO 배지 추가될 때 높이가 실제로 고정되는지)은 미실시.

**롤백 방법**: 위 Before 블록으로 되돌리면 됨.

---

## 2026-07-28 — `archetypes.rebounder` dead code 삭제

**배경**: 리바운드 판정에 hustle 능력치를 추가하는 작업([리바운드 판정에 허슬(hustle) 능력치
반영](#2026-07-28--리바운드-판정에-허슬hustle-능력치-반영), 아래 항목) 도중, 역할 적합도 점수
(`archetypeSystem.ts`)의 `rebounder` 필드가 엔진 어디에서도 소비되지 않는 dead code임을 재확인함
(이전 세션에서 이미 확인해 삭제를 제안했었고, 사용자가 이번에 "archetypes.rebounder는 삭제하자"로
확정). 실제 리바운더 선정은 `reboundLogic.ts`가 `offReb`/`defReb`/`vertical`/`strength`/`boxOut`/
`hustle` raw 능력치를 직접 사용하는 훨씬 정교한 자체 공식(Harvester/Raider 보너스, motorIntensity
랜덤화 포함)을 쓰고 있어 `archetypes.rebounder`는 애초에 중복이었음.

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) — `ArchetypeRatings` 인터페이스에서
  `rebounder: number;` 제거, `calculatePlayerArchetypes()` 내부 `rebounder` 계산 블록 및 반환
  객체에서 제거
- `server/src/shared/engine/pbp/archetypeSystem.ts` (server 미러) — 동일 변경
- `docs/engine/player-usage.md`, `docs/engine/player-archetypes.md`, `docs/engine/pbp-engine.md`,
  `docs/domain/nba-strategy.md`, `docs/project-overview.md` — "역할 적합도 점수 12종" 표기를
  11종으로 전부 수정, rebounder 관련 서술 갱신

**Before**:
```ts
export interface ArchetypeRatings {
    handler: number; spacer: number; driver: number; screener: number;
    roller: number; popper: number; rebounder: number;
    postScorer: number; isoScorer: number; connector: number;
    perimLock: number; rimProtector: number;
}
// ...
const rebounder = disabled ? 50 : getVal(
    (attr.reb * 0.70) + (attr.hustle * 0.15) + (attr.vertical * 0.15)
);
// ...
return {
    handler, spacer, driver, screener, roller, popper, rebounder,
    postScorer, isoScorer, connector, perimLock, rimProtector,
};
```

**After**:
```ts
export interface ArchetypeRatings {
    handler: number; spacer: number; driver: number; screener: number;
    roller: number; popper: number;
    postScorer: number; isoScorer: number; connector: number;
    perimLock: number; rimProtector: number;
}
// ...
return {
    handler, spacer, driver, screener, roller, popper,
    postScorer, isoScorer, connector, perimLock, rimProtector,
};
```

**검증**: client/server diff 확인(주석 차이만 존재, 로직 완전 동일), 양 파일 중괄호 균형 확인,
`ArchetypeRatings`를 참조하는 다른 소비처(`shotDistribution.ts`, `pbpTypes.ts`) grep 결과 `.rebounder`
프로퍼티 직접 참조 없음 확인, `tsc --noEmit`에서 신규 에러 없음, `npm run build` 성공, `fly deploy`
후 헬스체크 200·정상 재기동 확인.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

---

## 2026-07-28 — 리바운드 판정에 허슬(hustle) 능력치 반영

**배경**: 역할 적합도 점수(`archetypeSystem.ts`) 정리 작업 도중, 실제 리바운드 판정 로직
(`reboundLogic.ts`)을 다시 살펴보다가 사용자가 "리바운드에서 허슬 능력치를 사용했으면 좋겠는데
그 부분은 빠져있구나"를 지적. 팀 단위 ORB% 계산(`calculateOrbChance`의 `calcPower`)과 개인
리바운더 선택(`selectRebounder`의 `score`) 둘 다 `rebAttr(offReb/defReb) + vertical + strength +
boxOut` 4개 능력치만 사용하고 `hustle`이 빠져 있었음. 가중치 `rebAttr×0.45 + vertical×0.20 +
strength×0.10 + boxOut×0.15 + hustle×0.10`(합 1.00, rebAttr -0.05·strength -0.05로 hustle×0.10
자리 마련)을 제안해 승인받음. 사용자가 "팀 파워 공식에도 추가해줘"라고 명시적으로 요청해
두 공식(팀 레벨 + 개인 레벨) 모두에 동일하게 적용.

**변경 파일**:
- `services/game/engine/pbp/reboundLogic.ts` (client)
- `server/src/shared/engine/pbp/reboundLogic.ts` (server 미러)

**Before**:
```ts
// calculateOrbChance 내부 calcPower
const calcPower = (team: TeamState, rebAttr: 'offReb' | 'defReb') =>
    team.onCourt.reduce((sum, p) => {
        return sum + (p.attr[rebAttr] * 0.5 + p.attr.vertical * 0.2 + p.attr.strength * 0.15 + p.attr.boxOut * 0.15);
    }, 0);

// selectRebounder 내부 score
let score = (
    p.attr[rebAttr] * 0.5 +
    p.attr.vertical * 0.2 +
    p.attr.strength * 0.15 +
    p.attr.boxOut * 0.15
) * shooterPenalty;
```

**After**:
```ts
// calculateOrbChance 내부 calcPower
const calcPower = (team: TeamState, rebAttr: 'offReb' | 'defReb') =>
    team.onCourt.reduce((sum, p) => {
        return sum + (p.attr[rebAttr] * 0.45 + p.attr.vertical * 0.2 + p.attr.strength * 0.10 + p.attr.boxOut * 0.15 + p.attr.hustle * 0.10);
    }, 0);

// selectRebounder 내부 score
let score = (
    p.attr[rebAttr] * 0.45 +
    p.attr.vertical * 0.2 +
    p.attr.strength * 0.10 +
    p.attr.boxOut * 0.15 +
    p.attr.hustle * 0.10
) * shooterPenalty;
```

**검증**: client/server diff 확인(주석 차이만 존재, 로직 완전 동일), 양 파일 중괄호 균형 확인,
`server/tsconfig.json` 기준 `tsc --noEmit` 결과 `reboundLogic.ts`발 신규 에러 없음(기존
`tournamentArchiver.ts`/`scheduler.ts`/`startDraft.ts`/Bun 타입 관련 에러는 이번 변경과 무관한
기존 이슈), `npm run build` 성공, `fly deploy -a basketballgm-app-server` 배포 후 헬스체크
200·`fly logs`에서 `worker#0 ready`/`scheduler started`/에러 없이 정상 재기동 확인.

**롤백 방법**: 위 Before 블록 가중치로 두 파일 모두 되돌리면 됨.

---

## 2026-07-28 — 멀티플레이어 어드민 트레이드(팀↔팀 선수 스왑) 신규 구현

**배경**: `docs/plan/multi-admin-trade-plan.md` 참조. 멀티플레이어에는 유저 간 협상형 트레이드도,
어드민용 로스터 교정 도구도 전혀 없었음(계약/샐러리 데이터 자체가 멀티에 없어 싱글의
`tradeExecutor.ts`는 재사용 불가 확인됨). 어드민이 `AdminTeamEditorView.tsx`(팀별 뎁스차트/로테이션/
전술을 보는 화면)에서 두 팀 사이 선수를 직접 맞교환하는 기능을 요청받아 완전 신규 구축. 추가로
"로스터 변경은 트레이드 실행 버튼을 눌러야만 반영"(카트 방식, 실시간 적용 아님)과 "트레이드 후
뎁스차트·로테이션을 1회 자동 설정"을 명시적으로 요구받음 — 후자는 기존 `generateAutoTactics()`
(뎁스차트+48칸 로테이션맵+슬라이더를 한 번에 생성하는 기존 함수, `AdminTeamEditorView.tsx`가
이미 신규 팀 초기화에 쓰고 있던 것)를 트레이드 후 양팀 모두에 재사용하는 것으로 간단히 해결 —
애초 계획서의 "stale 참조 부분 정리" 방식보다 더 간단하고 견고함(옛 참조가 남을 수 없음).

**변경 파일**:
- **DB 마이그레이션** (Supabase 프로젝트 `buummihpewiaeltywdff`, `add_execute_admin_trade_rpc`) —
  `execute_admin_trade(p_room_id, p_admin_user_id, p_team_a_id, p_team_b_id, p_players_a_to_b, p_players_b_to_a)`
  RPC 신설(`SECURITY DEFINER`). 어드민 검증(`leagues.admin_user_id`) → 각 선수가 실제로 해당 팀
  로스터에 있는지 검증 → `league_teams.roster`(jsonb 배열) 원자적 스왑(제거 후 병합). `claim_team`
  RPC와 동일 패턴 재사용
- `services/multi/leagueService.ts` (client) — `executeAdminTrade(params)` 신규, RPC 래핑 +
  에러코드별(`not_admin`/`player_not_on_team_a`/`player_not_on_team_b`/`same_team`) 한국어 메시지 매핑
- `components/dashboard/AdminTradePanel.tsx` (신규, client) — 상대 팀 선택 → 팀 A(부모가 이미
  하이드레이션한 로스터 prop 재사용)/팀 B(자체 `meta_players` 하이드레이션) 로스터를 좌우로 나열,
  `OvrBadge`로 선수 행 표시, 클릭으로 트레이드 카트에 토글, "트레이드 실행" 버튼(확인 단계 포함)을
  눌러야만 `executeAdminTrade()` 호출. 성공 시 이미 메모리에 있는 양측 `Player[]`로 트레이드 후
  로스터를 로컬 계산 → `generateAutoTactics()`로 양팀 전술 재생성 → `saveMemberTactics()`로 저장 →
  부모에 `onTradeComplete(teamA 새 전술)` 콜백
- `views/multi/league/AdminTeamEditorView.tsx` (client) — `AdminTab`에 `'trade'` 추가, "트레이드"
  탭 렌더, `handleTradeComplete()` — 트레이드 성공 시 팀A의 `draftTactics`/`draftDepthChart` 로컬
  상태를 새로 생성된 전술로 즉시 교체(`reload()`만 의존하면 로스터 인원수가 안 바뀌는 1:1 트레이드
  등에서 리셋 useEffect가 재실행되지 않아 화면이 트레이드 이전 상태를 계속 보여주는 문제를 방지)

**Before**: 멀티플레이어에 팀 간 선수 이동 수단이 전혀 없었음(트레이드 UI/RPC/엔진 모두 부재).

**After**: 어드민이 "트레이드" 탭에서 두 팀 로스터를 보고 각 팀에서 나갈 선수를 카트에 담은 뒤
"트레이드 실행" → 확인 → RPC로 `league_teams.roster` 원자적 스왑 → 양 팀 뎁스차트/로테이션
자동 재설정까지 한 번에 처리.

**검증**:
- RPC 자체: `apply_migration` 성공(문법 유효), 더미 UUID로 직접 호출해 `not_admin` 가드가 정확히
  발동함을 확인, jsonb 배열 제거+병합 로직(`["p1","p2","p3"]` - `["p2"]` + `["p9"]` →
  `["p1","p3","p9"]`)을 실제 테이블과 무관하게 격리 테스트해 정확성 확인
- 클라이언트: `AdminTradePanel.tsx`/`leagueService.ts`에 대해 synthesize한 tsc 옵션으로 신규 타입
  에러 없음. `AdminTeamEditorView.tsx`에서 발견된 에러 1건(`TabBar`의 `onTabChange` 제네릭 추론
  이슈)은 `git stash`로 대조해 **이번 변경 이전부터 있던 기존 이슈**임을 확인(줄 번호만 203→215로
  밀림)
- **실제 방에서 실사용 트레이드 스모크 테스트는 미실시** — 실제 유저 로스터 데이터를 건드리는
  작업이라 사용자 승인 없이 임의 실행하지 않음. 다음 사용 시 테스트 리그에서 먼저 확인 권장

**롤백 방법**: 코드는 위 3개 client 파일(`leagueService.ts`/`AdminTeamEditorView.tsx`)의 diff를
되돌리고 `components/dashboard/AdminTradePanel.tsx` 파일을 삭제. DB는
`DROP FUNCTION public.execute_admin_trade(uuid,uuid,uuid,uuid,jsonb,jsonb);`로 RPC 제거(코드에서
호출 안 하면 남아있어도 무해함).

---

## 2026-07-28 — 뎁스차트 OVR 배지 텍스트 크기를 로테이션 차트와 통일

**배경**: 뎁스차트(`DepthChartEditor.tsx`)의 `OvrBadge`는 `size="sm"` 기본값(`text-[10px]`)을
그대로 썼는데, 같은 프로젝트의 로테이션 차트(`RotationMatrix.tsx`, `RotationGanttChart.tsx`)는
동일한 `size="sm"`에 `className="!text-xs ..."`로 텍스트만 12px로 키워서 쓰고 있어 두 화면의
배지 글자 크기가 달랐다. 통일해달라는 요청.

**변경 파일**:
- `components/dashboard/DepthChartEditor.tsx` (client, 싱글/멀티 3개 화면 공용) —
  `<OvrBadge value={...} size="sm" />` → `<OvrBadge value={...} size="sm" className="!text-xs" />`
  (크기(`w-6 h-6`)·그림자 등 나머지 스타일은 요청 범위 밖이라 그대로 유지)

**Before**: `<OvrBadge value={calculatePlayerOvr(selectedPlayer)} size="sm" />` (텍스트 10px, `OvrBadge.tsx`의 `sm` 프리셋 기본값)

**After**: `<OvrBadge value={calculatePlayerOvr(selectedPlayer)} size="sm" className="!text-xs" />` (텍스트 12px, 로테이션 차트와 동일)

**검증**: `DepthChartEditor.tsx`에 대해 synthesize한 tsc 옵션으로 신규 타입 에러 없음 확인. 실제 브라우저 렌더링 비교는 미실시.

**롤백 방법**: `className="!text-xs"`를 제거하면 됨.

---

## 2026-07-28 — 뎁스차트 OVR 배지 위치/표기 수정 (좌측 배지 + 닫힌상태 텍스트 정리)

**배경**: 직전 항목("뎁스차트 슬롯에 OVR 배지 표시")에서 배지를 select 우측에 오버레이하고 옵션
텍스트에 `- OVR {값}`을 붙였는데, 사용자가 3가지로 정정 요청: (1) 배지를 이름 **좌측**으로 이동
(2) 선택된(닫힌 상태) 슬롯에서는 "포지션 우측 OVR 텍스트" 표기 제거 — 배지만으로 OVR을 전달
(3) 드롭다운을 펼쳤을 때는 `(OVR) 이름 - 포지션` 형식으로 표시.

문제는 네이티브 `<select>`는 "닫힌 상태에 보이는 텍스트"와 "드롭다운 옵션 텍스트"가 항상 같은
소스(선택된 `<option>`의 textContent)라서, 둘의 표기를 다르게 만들 수 없다는 점이었다 — 그래서
select 자체의 텍스트를 `text-transparent`로 완전히 숨기고, 그 위에 "이름 - 포지션"만 보여주는
별도의 커스텀 라벨 `<div>`를 오버레이하는 방식으로 전환했다. 실제 `<option>` 텍스트(드롭다운
목록에서 보이는 것)는 `(OVR) 이름 - 포지션` 그대로 유지 — 각 `<option>`에 이미 걸려있는
`text-white`/`text-slate-500` 클래스가 부모 select의 `text-transparent`보다 우선 적용되어
드롭다운 목록 자체는 계속 정상적으로 보인다(이 프로젝트가 이미 option별 색상 클래스를 쓰고
있었으므로 같은 메커니즘 재사용).

**변경 파일**:
- `components/dashboard/DepthChartEditor.tsx` (client, 싱글/멀티 3개 화면 공용, 직전 항목과 동일 파일)
  - `<select>` className: `text-white`(선택시)/`text-slate-500`(빈값) 동적 처리를 제거하고
    `text-transparent` 고정 + `pl-9`(배지 자리)로 변경, `pr-16`→`pr-10`으로 원복(우측엔 체브론만 남음)
  - `<option>` 텍스트: `{name} - {position} - OVR {ovr}` → `({ovr}) {name} - {position}`
  - `OvrBadge` 오버레이 위치: `right-9` → `left-2`
  - 신규: `<div className="absolute inset-0 ... pl-9 pr-10">{selectedPlayer ? `${name} - ${position}` : '선수 선택'}</div>` — 닫힌 상태 전용 커스텀 라벨(OVR 텍스트 없음)

**Before**:
```tsx
<select className="... pl-4 pr-16 ... text-white ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option ...>{p.name} - {p.position} - OVR {calculatePlayerOvr(p)}</option>
    ))}
</select>
{selectedPlayer && (
    <div className="absolute right-9 ..."><OvrBadge value={...} size="sm" /></div>
)}
```

**After**:
```tsx
<select className="... pl-9 pr-10 ... text-transparent ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option ...>({calculatePlayerOvr(p)}) {p.name} - {p.position}</option>
    ))}
</select>
{selectedPlayer && (
    <div className="absolute left-2 ..."><OvrBadge value={...} size="sm" /></div>
)}
<div className="absolute inset-0 flex items-center pl-9 pr-10 pointer-events-none text-xs font-semibold truncate ...">
    {selectedPlayer ? `${selectedPlayer.name} - ${selectedPlayer.position}` : '선수 선택'}
</div>
```

**검증**: `DepthChartEditor.tsx`에 대해 synthesize한 tsc 옵션으로 신규 타입 에러 없음 확인. 실제
브라우저에서 `text-transparent` select + option 색상 오버라이드 조합이 의도대로 렌더링되는지
(특히 Safari/Firefox 크로스브라우저 차이)는 미실시 — Chromium 계열에서 흔히 쓰이는 패턴이라
프로젝트 브라우저 타깃(Chrome 위주 개발) 기준으로는 위험 낮다고 판단.

**롤백 방법**: 직전 항목("뎁스차트 슬롯에 OVR 배지 표시")의 After 블록으로 되돌리면 됨(두 항목을
합쳐서 원래 형태로 되돌리려면 최초 커밋, 즉 배지 자체가 없던 상태까지 더 거슬러 올라가야 함).

---

## 2026-07-28 — 뎁스차트 슬롯에 OVR 배지 표시

**배경**: 뎁스차트(`DepthChartEditor.tsx`)의 각 슬롯이 네이티브 `<select>`라 선택된 선수 이름 외에
능력치를 한눈에 볼 방법이 없었음. 선수 이름 우측에 OVR 배지를 띄워달라는 요청. 이 컴포넌트는
싱글플레이 대시보드(`DashboardView.tsx`)와 멀티플레이 전술 화면(`MultiTacticsView.tsx`,
`AdminTeamEditorView.tsx`) 3곳이 전부 공유하므로 한 번 고치면 세 화면 모두 반영됨.

네이티브 `<select>`의 `<option>`은 브라우저가 플레인 텍스트로만 렌더링해 그 안에 색상 배지를
넣을 수 없다 — 대신 select 위에 절대 위치로 `OvrBadge`(기존 재사용 컴포넌트, OVR 구간별 색상
그라데이션 자동 적용)를 오버레이해서 "닫힌 상태"에서 배지가 보이도록 했다. 드롭다운을 펼쳤을 때의
옵션 목록 자체는 배지를 못 넣으므로, 대신 옵션 텍스트에 `- OVR {값}`을 추가해 최소한의 정보는
드롭다운 안에서도 보이게 보완했다.

**변경 파일**:
- `components/dashboard/DepthChartEditor.tsx` (client, 싱글/멀티 3개 화면 공용)
  - `OvrBadge`(`components/common/OvrBadge.tsx`) import 추가
  - 슬롯별 선택된 선수를 `team.roster.find()`로 조회해 `calculatePlayerOvr()` 결과를
    `<OvrBadge size="sm">`로 select 우측(체브론 아이콘 왼쪽)에 절대위치 오버레이
  - `<option>` 텍스트에 `- OVR {calculatePlayerOvr(p)}` 추가
  - select의 `pr-10` → `pr-16`으로 늘려 배지+체브론 자리 확보(텍스트 겹침 방지)

**Before**:
```tsx
<select className="... pr-10 ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option key={p.id} value={p.id}>{p.name} - {p.position}</option>
    ))}
</select>
<div className="absolute right-3 ..."><ChevronDown/></div>
```

**After**:
```tsx
<select className="... pr-16 ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option key={p.id} value={p.id}>{p.name} - {p.position} - OVR {calculatePlayerOvr(p)}</option>
    ))}
</select>
{selectedPlayer && (
    <div className="absolute right-9 ...">
        <OvrBadge value={calculatePlayerOvr(selectedPlayer)} size="sm" />
    </div>
)}
<div className="absolute right-3 ..."><ChevronDown/></div>
```

**검증**: 수정 파일 1개(`DepthChartEditor.tsx`)에 대해 synthesize한 tsc 옵션으로 신규 타입 에러
없음 확인. JSX 중첩(`[0,1,2].map(depthIndex => { ...; return (<TableCell>...); })`) 괄호 균형 확인.
실제 브라우저 렌더링(배지 위치가 체브론과 안 겹치는지)은 미실시.

**롤백 방법**: 위 Before 블록으로 되돌리면 됨. 서버/DB 변경 없음(클라이언트 전용, 3개 화면 공용
컴포넌트라 롤백 시 세 화면 모두 원상복구됨).

---

## 2026-07-28 — spacer 아키타입, archetypesEnabled 토글과 무관하게 항상 실계산

**배경**: 직전 항목(3점 코너 편향 버그) 조사 중, CatchShoot 액터 선택(`pickWeightedActor(p => p.archetypes.spacer)`)이
사실상 무의미하다는 걸 발견함 — `archetypeSystem.ts`의 `ARCHETYPES_DISABLED = true`(기본값, `SimSettings.archetypesEnabled`도
기본 false)일 때 12개 아키타입 전부 무조건 50으로 반환돼서, 르브론이든 주바치든 spacer 점수가 동일했음.

`git log`로 추적해보니 이 disabled 상태는 의도된 설계가 아니라 4개월 전(`98f84a3 disabled player archetypes`,
직전 커밋 `c1ea42c feat: Integrate dynamic archetype system` 직후) BLOCK/PLAYMAKING/CLUTCH_ARCHETYPE/ZONE_SHOOTING과
함께 `★ TEMPORARY`로 표시된 채 응급 롤백된 뒤 재검토 없이 방치된 것으로 확인됨(단, 이 4개는 `SIM_CONFIG`의 별도
하드코딩 상수라 `archetypesEnabled`와 런타임으로 연결되어 있지 않음 — 이번 변경과 무관).

12개 공식을 전부 확인해본 결과 전혀 "분류형 아키타입"이 아니라 기존 raw 능력치(threeVal/shotIq/handling 등,
전부 엔진 다른 곳에서 이미 검증되어 쓰이는 값)의 단순 가중평균이라, 계산 자체의 리스크는 낮다고 판단.
다만 12개 전부를 한꺼번에 켜는 것(BLOCK 등 4개 시스템도 얽힌 더 큰 결정)은 왜 원래 꺼졌는지 재확인이
필요한 별도 논의로 미루고, 이번엔 지금 당장 문제가 되는 **spacer 하나만** 토글과 무관하게 항상 실계산하도록
범위를 좁힘 — 나머지 11개(handler/driver/screener 등)는 여전히 토글에 따라 50으로 뭉개짐.

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) — `calculatePlayerArchetypes()`
- `server/src/shared/engine/pbp/archetypeSystem.ts` (server 미러) — 동일

**Before**:
```ts
const disabled = archetypesEnabled !== undefined ? !archetypesEnabled : ARCHETYPES_DISABLED;
if (disabled) {
    return {
        handler: 50, spacer: 50, driver: 50, screener: 50,
        roller: 50, popper: 50, rebounder: 50, postScorer: 50,
        isoScorer: 50, connector: 50, perimLock: 50, rimProtector: 50
    };
}
const fatigueFactor = Math.max(0.5, 0.5 + (condition * 0.005));
const getVal = (val: number) => val * fatigueFactor;
const threeAvg = attr.threeVal;
// ... (normHeight/normWeight, 그리고 return 블록에서 spacer: getVal(threeAvg*0.6 + shotIq*0.25 + offConsist*0.15) 계산)
```

**After**:
```ts
const disabled = archetypesEnabled !== undefined ? !archetypesEnabled : ARCHETYPES_DISABLED;
const fatigueFactor = Math.max(0.5, 0.5 + (condition * 0.005));
const getVal = (val: number) => val * fatigueFactor;
const threeAvg = attr.threeVal;

// spacer는 나머지 11개와 달리 토글과 무관하게 항상 실계산
const spacer = getVal((threeAvg * 0.60) + (attr.shotIq * 0.25) + (attr.offConsist * 0.15));

if (disabled) {
    return {
        handler: 50, spacer, driver: 50, screener: 50,
        roller: 50, popper: 50, rebounder: 50, postScorer: 50,
        isoScorer: 50, connector: 50, perimLock: 50, rimProtector: 50
    };
}
// ... (나머지 11개는 그대로, return 블록의 spacer는 위에서 계산한 변수 재사용)
```

**검증**: client/server `tsc --noEmit` 신규 에러 없음, 브레이스 균형 확인, `npm run build` 성공. Node
재현: 주바치류 raw 능력치(threeVal 45, shotIq/offConsist 70 가정) → spacer 55.0, 커리급(threeVal 95,
shotIq 92, offConsist 88) → spacer 93.2 — 이전엔 disabled 상태에서 둘 다 50으로 동일했던 것이 이제
실제 능력치 차이만큼 갈라짐을 확인. `fly deploy` 배포 성공, HTTP 200, 워커 풀 정상 기동 확인.

**주의사항 / 한계**: 이 수정만으로는 주바치 문제가 완전히 안 풀림 — 그의 raw 3점 능력치(45)가 낮지 않아
spacer가 50→55로 오히려 살짝 오름(텐던시가 아니라 능력치 기반이라 여전히 "3점을 실제로 쏘고 싶어하는가"는
안 봄). CatchShoot 액터 선택에 `zonePref.three`(텐던시) 배율을 곱하는 후속 작업("방법 2")이 별도로 필요함 —
다음 논의/작업 대상으로 남겨둠.

**롤백 방법**: 두 파일에서 `spacer` 계산을 `disabled` 체크 이전으로 끌어올린 부분과, `disabled` 분기의
`spacer: 50` → `spacer`(변수 참조) 변경을 되돌리면 됨 — 미러 쌍이므로 반드시 함께.

---

## 2026-07-28 — 3점 텐던시 전부 0인 선수가 항상 우측 코너로만 쏘던 버그 수정

**배경**: "FMK 빅 토너먼트" 선수 데이터를 분석하다가, 댈러스의 이비차 주바치(`tendencies.zones`가
`{ra:100, itp:36, mid:7, atb:0, cnr:0, p45:0}` — 3점 텐던시 완전히 0)가 실제 게임에서 5경기 연속
3점을 시도했고, 그 시도가 **매 경기 예외 없이 전부 `zone_c3_r`(우측 코너)**로 기록된 것을 발견해서
추적함.

원인은 두 단계: ① `CatchShoot` 플레이타입은 `preferredZone: '3PT'`가 하드코딩돼 있고, 액터 선택
(`pickWeightedActor`)이 `Math.max(1, rawScore)`로 최소 가중치를 항상 보장해서 3점 텐던시 0인 선수도
낮은 확률로 캐치앤슛 슈터로 뽑힐 수 있음(설계상 있을 수 있는 부분, 이번엔 안 건드림 — 사용자가
"방법 2"로 명명, 추후 별도 논의 예정). ② `resolveDynamicZone()`의 3점 서브존(코너/45도/탑) 분배
로직이 `threeSubPref` 3개 값이 전부 0일 때 `total = 0 || 1`(JS에서 `0`은 falsy)로 인해 확률이 전부
0이 되고, `rand`(항상 0 이상)가 모든 `if (rand < ...)`를 통과해 매번 마지막 `return 'zone_c3_r'`로
고정되는 **실제 코드 버그**. 이번엔 ②만 수정(사용자가 "방법 1"로 명명, 우선 적용 합의).

**변경 파일**:
- `services/game/engine/shotDistribution.ts` (client) — `resolveDynamicZone()`의 3PT 분기
- `server/src/shared/engine/shotDistribution.ts` (server 미러) — 동일 수정

**Before**:
```ts
const sp = player.threeSubPref ?? { cnr: 0.30, p45: 0.40, atb: 0.30 };
const cl = (sp.cnr / 2) * leftMult, cr = (sp.cnr / 2) * rightMult;
const wl = (sp.p45 / 2) * leftMult, wr = (sp.p45 / 2) * rightMult;
const top = sp.atb;
const total = cl + wl + top + wr + cr || 1;
const pCl = cl / total, pWl = wl / total, pTop = top / total, pWr = wr / total;
if (rand < pCl) return 'zone_c3_l';
if (rand < pCl + pWl) return 'zone_atb3_l';
if (rand < pCl + pWl + pTop) return 'zone_atb3_c';
if (rand < pCl + pWl + pTop + pWr) return 'zone_atb3_r';
return 'zone_c3_r';
```

**After**:
```ts
const spRaw = player.threeSubPref;
const spTotal = spRaw ? spRaw.cnr + spRaw.p45 + spRaw.atb : 0;
const sp = spTotal > 0 ? spRaw : { cnr: 0.30, p45: 0.40, atb: 0.30 };
const cl = (sp.cnr / 2) * leftMult, cr = (sp.cnr / 2) * rightMult;
const wl = (sp.p45 / 2) * leftMult, wr = (sp.p45 / 2) * rightMult;
const top = sp.atb;
const total = cl + wl + top + wr + cr || 1;
const pCl = cl / total, pWl = wl / total, pTop = top / total, pWr = wr / total;
if (rand < pCl) return 'zone_c3_l';
if (rand < pCl + pWl) return 'zone_atb3_l';
if (rand < pCl + pWl + pTop) return 'zone_atb3_c';
if (rand < pCl + pWl + pTop + pWr) return 'zone_atb3_r';
return 'zone_c3_r';
```
(`threeSubPref`가 있지만 합이 0인 경우도 "없는 경우"와 동일하게 기본 30/40/30 분포로 폴백하도록
한 줄만 조건 확장 — 나머지 로직 동일)

**검증**: client/server `tsc --noEmit` 신규 에러 없음, 브레이스 균형 확인, `npm run build` 성공.
Node 재현 스크립트로 확인 — 수정 전엔 all-zero threeSubPref 입력 시 20000회 전부 `zone_c3_r`,
수정 후엔 `zone_atb3_c`(≈30%)/`zone_atb3_r`(≈24%)/`zone_atb3_l`(≈16%)/`zone_c3_r`(≈18%)/`zone_c3_l`
(≈12%)로 고르게 분산됨을 확인. `fly deploy` 배포 성공, HTTP 200, 워커 풀 정상 재기동 확인.

**롤백 방법**: 두 파일에서 `spRaw`/`spTotal` 도입 부분을 제거하고 `const sp = player.threeSubPref ?? { cnr: 0.30, p45: 0.40, atb: 0.30 };`로 되돌리면 됨 — 미러 쌍이므로 반드시 함께.

**관련 논의**: "방법 2"(CatchShoot 액터 선택 시 3점 텐던시가 낮은 선수의 가중치를 더 깎아서, 애초에
그런 선수가 캐치앤슛 슈터로 뽑히는 빈도 자체를 줄이는 것)는 사용자 합의로 이번 범위에서 제외,
추후 별도 논의 예정.

---

## 2026-07-28 — 역할 적합도 점수 11종(rebounder 제외) 토글과 무관하게 항상 실계산

**배경**: 직전 항목(spacer 예외 처리)에 이어서, 나머지 11개도 조사해본 결과 `archetypesEnabled`
disabled 상태에서 50으로 뭉개지는 게 `playTypes.ts`의 액터/패서 선택뿐 아니라 두 군데를 더
무력화시키고 있었음을 발견:
- **미스매치 판정** (`flowEngine.ts:296-320`) — `offSkill`(spacer/driver/postScorer) vs
  `defSkill`(perimLock/rimProtector) 비교인데, 수비 쪽이 항상 50 고정이라 `skillGap`이 포지션
  기반 케이스(가드-빅 매치업) 말고는 15 이상 나올 수 없어 `hitRate -= 0.03` 페널티만 거의 항상
  적용되고 있었음
- **헬프 디펜스 블락 보너스** (`possessionHandler.ts:977`) — `rimProtector > HELP_RIM_THRESHOLD(75)`
  체크인데 rimProtector가 항상 50이라 조건이 누구에게도 절대 참이 될 수 없어 완전히 죽어있었음
- `rebounder`는 조사 결과 `archetypes.rebounder`를 읽는 코드가 엔진 어디에도 없는 순수 dead code
  (`reboundLogic.ts`는 raw 능력치를 직접 씀) — 사용자 판단으로 이번 범위에서 제외, 리바운드 로직
  재검토 시 별도로 다루기로 함

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) — `calculatePlayerArchetypes()` 구조 개편
- `server/src/shared/engine/pbp/archetypeSystem.ts` (server 미러) — 동일

**Before**: `disabled` 분기와 `!disabled` 분기 두 갈래로 나뉘어, disabled 시 11개(spacer 제외) 전부
`50` 하드코딩 반환, 아니면 전부 실계산 반환하는 구조(직전 항목의 spacer 예외만 반영된 상태).

**After**: 두 분기를 제거하고 handler/spacer/driver/screener/roller/popper/postScorer/isoScorer/
connector/perimLock/rimProtector 11개를 전부 함수 상단에서 무조건 실계산하는 `const`로 선언,
`rebounder`만 `disabled ? 50 : getVal(...)`로 예외 유지. 마지막에 12개를 한 번에 조립해서 반환하는
단일 return으로 단순화:
```ts
const handler = getVal(...);
const spacer = getVal(...);
// ... (9개 더, 전부 무조건 실계산) ...
const rebounder = disabled ? 50 : getVal(attr.reb*0.70 + attr.hustle*0.15 + attr.vertical*0.15);
const rimProtector = getVal(...);

return { handler, spacer, driver, screener, roller, popper, rebounder, postScorer, isoScorer, connector, perimLock, rimProtector };
```

**검증**: client/server `tsc --noEmit` 신규 에러 없음, 브레이스 균형 확인, `npm run build` 성공.
Node 재현: 엘리트 림프로텍터 능력치(blk=92, intDef=90, height=213) 입력 시 `disabled=true`여도
`rimProtector=88.3`으로 계산돼 `HELP_RIM_THRESHOLD(75)`를 정상적으로 넘음(수정 전엔 무조건 50이라
절대 못 넘었음), `rebounder`는 여전히 50 고정 확인. `fly deploy` 배포 성공, HTTP 200, 워커 풀 정상
기동 확인.

**주의사항 / 한계**: 미스매치 판정 시스템은 이제 공격/수비 양쪽 다 실계산되므로 `skillGap`이 의미
있게 작동하지만, 실제로 밸런스가 어떻게 나오는지(미스매치 보너스 발동 빈도, 헬프 블락 발동 빈도 변화)
브라우저/실경기 테스트는 미실시 — 다음 실제 토너먼트 시뮬레이션에서 관찰 필요.

**롤백 방법**: 두 파일에서 함수 본문을 이전(11개 즉시 50 하드코딩 disabled 분기 + 전체 재계산
enabled 분기 이중 구조)으로 되돌리면 됨 — 미러 쌍이므로 반드시 함께.

---

## 2026-07-28 — 라이브게임 박스스코어에 FT(자유투) 컬럼 추가

**배경**: 멀티플레이어 라이브 게임(PBP) 화면의 박스스코어 테이블에 FG/3P만 있고 FT(자유투 성공-시도)가 없어서 추가 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — `PlayerBoxPanel`의 `BOX_GRID`에 컬럼 폭(48px) 추가, 헤더에 `FT` 라벨 추가, 선수 행에 `{p.ftm}-{p.fta}` 추가, `total` useMemo에 `ftm`/`fta` 합계 추가, 팀 합계 행에 FT% 셀 추가(`total.ftm / total.fta * 100`, FG%/3P%와 동일한 표시 방식).

**Before**:
```ts
const BOX_GRID = 'minmax(0,1fr) 26px 28px 32px 28px 28px 28px 28px 28px 32px 56px 48px';
// total: pts/reb/ast/stl/blk/tov/pf/fgm/fga/p3m/p3a
// 헤더: ... FG, 3P
// 행:   ... {p.fgm}-{p.fga}, {p.p3m}-{p.p3a}
// 팀합계: ... FG%, 3P%
```

**After**:
```ts
const BOX_GRID = 'minmax(0,1fr) 26px 28px 32px 28px 28px 28px 28px 28px 32px 56px 48px 48px';
// total에 ftm/fta 추가
// 헤더: ... FG, 3P, FT
// 행:   ... {p.fgm}-{p.fga}, {p.p3m}-{p.p3a}, {p.ftm}-{p.fta}
// 팀합계: ... FG%, 3P%, FT%
```

**검증**: `esbuild` 구문 파싱만 확인, `PlayerBoxScore` 타입에 `ftm`/`fta` 필드 존재 확인. 브라우저 실행 검증은 하지 않음.

**롤백 방법**: `BOX_GRID`에서 마지막 `48px` 제거, 헤더/행/팀합계에서 FT 관련 셀 3곳 제거, `total`에서 `ftm`/`fta` 제거.

---

## 2026-07-28 — 라이브게임 헤더 스코어링 런 표시 시 높이 변동 수정

**배경**: 스코어버그 헤더 중앙 컬럼의 "스코어링 런"(🔥 팀 X-Y) 줄이 런이 있을 때만 조건부로 렌더링되고 없으면 아예 DOM에서 빠져, 런 유무에 따라 컬럼이 2줄/3줄을 오가며 헤더 전체 높이가 미세하게 바뀌는 레이아웃 시프트가 있었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — 스코어링 런 `<span>`을 조건부 렌더링(`{isLive && activeRun && (...)}`)에서 항상 렌더링하되 값이 없을 때 `invisible` 클래스로 시각적으로만 숨기는 방식으로 변경. `activeRun` 참조를 전부 옵셔널 체이닝(`activeRun?.`)으로 변경하고 폴백값(`?? 0`) 추가.

**Before**:
```tsx
{isLive && activeRun && (
    <span className="text-xs font-bold text-white whitespace-nowrap">
        🔥 {(activeRun.teamId === gameData?.home_team_id ? homeAbbr : awayAbbr)}{' '}
        {activeRun.teamPts}-{activeRun.oppPts}
    </span>
)}
```

**After**:
```tsx
<span className={`text-xs font-bold text-white whitespace-nowrap ${isLive && activeRun ? '' : 'invisible'}`}>
    🔥 {(activeRun?.teamId === gameData?.home_team_id ? homeAbbr : awayAbbr)}{' '}
    {activeRun?.teamPts ?? 0}-{activeRun?.oppPts ?? 0}
</span>
```

**검증**: `esbuild` 구문 파싱만 확인. 브라우저 실행 검증은 하지 않음.

**롤백 방법**: 위 span을 Before 블록으로 되돌리면 됨.

---

## 2026-07-28 — 라이브게임 박스스코어에 코트 위 선수 하이라이트 추가

**배경**: 멀티플레이어 라이브 게임(PBP) 화면의 박스스코어 테이블에서 현재 코트 위 5명을 시각적으로 구분할 방법이 없었음. `box_timeline`(`BoxTick[]`)의 각 tick에 `on: string[]`(그 포세션에 코트 위 있던 10명 playerId)이 이미 저장돼 있었지만 `buildLiveBox()`가 mp 누적에만 쓰고 버리고 있었음 — 이를 재사용해 UI 요청 기능만 추가.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — `getOnCourtIds(timeline, elapsed)` 헬퍼 신규 추가(elapsed 이하 마지막 tick의 `on` 배열 반환), `onCourtIds` useMemo 추가(`liveHomeBox`/`liveAwayBox`와 동일한 의존성), `PlayerBoxPanel`에 `onCourtIds?: Set<string>` prop 추가해 행 className에 `bg-emerald-400/15` 조건부 적용(최초 `bg-emerald-500/10`이었으나 사용자 요청으로 더 밝게 조정), live 박스 호출부 2곳(원정/홈)에 prop 전달.

**Before**:
```tsx
const PlayerBoxPanel: React.FC<{ players: PlayerBoxScore[]; label: string }> = ({ players, label }) => {
    ...
    {sorted.map((p, i) => (
        <div className={`... ${i % 2 === 0 ? 'bg-slate-800/20' : ''}`} ...>
```

**After**:
```tsx
const PlayerBoxPanel: React.FC<{ players: PlayerBoxScore[]; label: string; onCourtIds?: Set<string> }> = ({ players, label, onCourtIds }) => {
    ...
    {sorted.map((p, i) => (
        <div className={`... ${onCourtIds?.has(p.playerId) ? 'bg-emerald-400/15' : i % 2 === 0 ? 'bg-slate-800/20' : ''}`} ...>
```

**검증**: `esbuild`로 구문 파싱만 확인. 브라우저 실행 검증은 하지 않음.

**주의사항**: `final`(경기 종료 후 전체 공개) 상태의 박스스코어 호출부에는 `onCourtIds`를 전달하지 않음 — 코트 위 개념은 라이브 진행 중에만 의미가 있음.

**롤백 방법**: `PlayerBoxPanel`의 `onCourtIds` prop과 className 조건, `getOnCourtIds`/`onCourtIds` useMemo, 두 호출부의 `onCourtIds={onCourtIds}` prop 전달부 제거.

---

## 2026-07-28 — 일정 화면에서 미확정 다음 라운드 대진 스포일러 노출 수정

**배경**: 토너먼트 Bo7 시리즈가 아직 3:3(미확정)인데도 "시즌 일정"(`MultiScheduleView.tsx`) 화면에는 다음 라운드 매치업이 상대팀 이름까지 확정되어 노출되는 버그 제보. 원인 추적 결과, 서버(`server/src/simRunner.ts::handleTournamentAdvance`)는 시리즈 결정 경기를 시뮬레이션한 즉시(사용자가 실제로 10분 리플레이를 보기 전) `league.bracket_data.series`에 다음 라운드 진출팀을 채우고 `room.schedule`에 해당 라운드 경기를 추가한다. 브라켓 화면(`TournamentBracketView.tsx`)은 이미 `liveSeries`라는 재계산 로직으로 "피더 시리즈가 `isFinal` 게이팅을 통과했는지"에 따라 다음 라운드를 TBD로 되돌리는 방어 로직이 있었지만, 일정 화면은 raw `schedule`을 그대로 나열만 해서 이 게이팅이 전혀 없었다 — `GameRow`가 `state`(scheduled/live/final)와 무관하게 팀 이름을 항상 렌더링했기 때문에, 서버가 백엔드에서 다음 라운드를 미리 만든 순간 바로 스포일러로 노출됨.

**변경 파일**:
- `views/multi/season/multiGameReveal.ts` — `TournamentBracketView.tsx`에 있던 시리즈 게이팅 로직(라운드 1부터 순서대로 재계산해 피더 시리즈가 `isFinal`을 통과 못했으면 `higherSeedId`/`lowerSeedId`를 강제로 `'TBD'`로 되돌림)을 `computeRevealedSeries(series, schedule, serverNowMs)`라는 공용 함수로 추출해 신규 export.
- `views/multi/season/TournamentBracketView.tsx` — 기존에 인라인으로 있던 `liveSeries` useMemo 내부 로직(약 45줄)을 제거하고 `computeRevealedSeries()` 호출로 교체(동작 동일, 중복 제거).
- `views/multi/season/MultiScheduleView.tsx` — `allGames` useMemo에 `revealedSeriesById`(← `computeRevealedSeries()`) 기반 필터를 추가. `g.isPlayoff && g.seriesId`인 경기는 해당 시리즈가 게이팅상 아직 양쪽 다 확정(`higherSeedId`/`lowerSeedId` 둘 다 `'TBD'` 아님)되지 않았으면 목록에서 아예 제외.

**Before**:
```ts
// MultiScheduleView.tsx
const allGames = useMemo(() =>
    [...schedule]
        .map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt }))
        .sort((a, b) => (a.scheduledAt ?? a.date).localeCompare(b.scheduledAt ?? b.date)),
[schedule, simStart, gprd]);
```

**After**:
```ts
// MultiScheduleView.tsx
const revealedSeriesById = useMemo(() => {
    const series: any[] = (league?.bracket_data as any)?.series ?? [];
    if (!series.length) return null;
    return computeRevealedSeries(series, schedule as any, serverNow);
}, [league?.bracket_data, schedule, serverNow]);

const allGames = useMemo(() =>
    [...schedule]
        .filter(g => {
            if (!g.isPlayoff || !g.seriesId || !revealedSeriesById) return true;
            const gated = revealedSeriesById.get(g.seriesId);
            return !!gated && gated.higherSeedId !== 'TBD' && gated.lowerSeedId !== 'TBD';
        })
        .map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt }))
        .sort((a, b) => (a.scheduledAt ?? a.date).localeCompare(b.scheduledAt ?? b.date)),
[schedule, simStart, gprd, revealedSeriesById]);
```

**검증**: `esbuild`로 수정한 3개 파일(`multiGameReveal.ts`, `TournamentBracketView.tsx`, `MultiScheduleView.tsx`) 구문 파싱만 확인(에러 없음). 로컬 dev 서버로 실제 브라우저 재현(3:3 상태에서 일정 화면에 다음 라운드가 안 뜨는지)은 하지 않음.

**롤백 방법**: `MultiScheduleView.tsx`의 `revealedSeriesById`/필터 블록 제거하고 `allGames`를 Before 상태로 되돌림. `TournamentBracketView.tsx`의 `liveSeries` useMemo를 원래 인라인 45줄 로직으로 복원(git에서 이 커밋 diff 참고). `multiGameReveal.ts`의 `computeRevealedSeries`/`seriesMatchIndex`/`SeriesGameLike` 제거.

---

## 2026-07-28 — 멀티플레이어에서 아키타입/태그 DB 설정 preload 누락 수정

**배경**: 어드민(PlayerEditorPage)과 멀티플레이어 세션에서 같은 선수의 OVR/특성 태그가 다르게 표시되는 버그 조사 결과 발견. `services/admin/gameConfigService.ts`의 `archetypeCache`/`tagCache`는 `preloadGameConfig()`를 명시적으로 호출해야만 채워지는 모듈 싱글턴인데, 이 앱에서 유일한 호출부(`hooks/useGameData.ts`)가 `/multi` 라우트에서는 `skipSingleLoad=true`로 인해 INIT LOGIC effect 최상단(`if (skipSingleLoad) return`)에서 즉시 return되어 버려 멀티플레이어에서는 이 호출이 한 번도 실행되지 않았다. 그 결과 `utils/ovrEngine.ts`(OVR 계산의 tagBonus), `pages/PlayerEditorPage.tsx`(어드민 표시), `services/playerDevelopment/archetypeEvaluator.ts`(선수 프로필 특성 태그 표시) 세 곳 모두 "DB 커스텀 태그가 있으면 그걸 쓰고 없으면 하드코딩 폴백" 패턴인데, 멀티플레이어만 항상 폴백을 타면서 어드민과 다른 tagBonus/태그 목록이 계산됨. 실측: 스카티 반스(커스텀 오버라이드 없음, PF)의 raw OVR이 하드코딩 폴백 기준 91.7(→92), DB 커스텀 태그(15개, 전부 미충족→tagBonus 0) 기준 89.9(→90)로 정확히 일치 확인. 화면상으로도 DB 태그 목록에 없는 `off_ball_mover`(하드코딩 폴백 전용 ID, DB는 `space_ace`로 대체됨)가 멀티플레이어 선수 프로필에 뜨는 것으로 재확인.

**변경 파일**:
- `hooks/useGameData.ts` — `preloadGameConfig()` 호출을 `skipSingleLoad` 가드가 있는 INIT LOGIC effect(197행 근처, 기존 190행)에서 제거하고, 훅 최상단(51행 이후)에 의존성 배열 `[]`인 별도 `useEffect`로 이동해 `skipSingleLoad` 값과 무관하게 항상 1회 실행되도록 함.

**Before**:
```ts
export const useGameData = (session, isGuestMode, rosterMode, skipSingleLoad = false) => {
    const queryClient = useQueryClient();
    // ...state...
    useEffect(() => {
        if (skipSingleLoad) return;   // ← /multi 라우트면 여기서 즉시 return
        if (hasInitialLoadRef.current || isResettingRef.current) return;
        if (isBaseDataLoading || !baseData) return;
        const initializeGame = async () => {
            const isMultiRoute = window.location.pathname.startsWith('/multi');
            preloadGameConfig().catch(() => {});   // ← 멀티플레이어에서는 도달 불가
            setIsSaveLoading(true);
            ...
```

**After**:
```ts
export const useGameData = (session, isGuestMode, rosterMode, skipSingleLoad = false) => {
    const queryClient = useQueryClient();

    useEffect(() => {
        preloadGameConfig().catch(() => {});   // skipSingleLoad와 무관하게 항상 1회 실행
    }, []);

    // --- State ---
    ...
    useEffect(() => {
        if (skipSingleLoad) return;
        ...
        const initializeGame = async () => {
            const isMultiRoute = window.location.pathname.startsWith('/multi');
            setIsSaveLoading(true);   // preloadGameConfig() 호출 제거(중복이라 위로 이동)
            ...
```

**검증**: `fetchArchetypeConfig`/`fetchTagConfig`는 내부적으로 모듈 캐시(`archetypeCache`/`tagCache`)를 체크해 이미 로드됐으면 즉시 반환하므로, 싱글플레이어 경로에서 두 곳(신규 effect + 기존 initializeGame 흐름)이 잠깐이라도 겹쳐 호출되어도 중복 네트워크 요청·부작용 없음. 별도 브라우저 실행 검증은 하지 않음(로컬 dev 서버 미기동) — `preloadGameConfig`가 정상적으로 `useGameData` 훅 스코프 안에서 import되어 있는지, `useEffect` import 존재 여부만 정적으로 확인함.

**롤백 방법**: `hooks/useGameData.ts` 51~61행에 추가한 `useEffect` 블록을 삭제하고, 197행(`setIsSaveLoading(true);`) 바로 위에 `preloadGameConfig().catch(() => {});` 호출을 다시 삽입하면 Before 상태로 복귀.

---

## 2026-07-28 — 리그 생성 모달에 정규화 강도 선택 추가

**배경**: "리그 상대 정규화 강도"(고OVR 드래프트 풀에서 득점 과열 억제)는 `LeagueSettingsView.tsx`(드래프트 이전 recruiting 단계에서 접근 가능한 세션 설정 화면)에는 이미 있었지만, 리그를 **처음 생성**하는 `CreateLeagueModal.tsx`에는 없어서 생성 직후엔 항상 DB 기본값(사실상 비어있음, 실질적으로 레벨3=k0.7 폴백)으로만 시작했다. 생성 단계에서도 선택 가능하게 해달라는 요청.

**변경 파일**:
- `types/simSettings.ts` — `NORMALIZATION_LEVELS`(레벨0~5 → {enabled,k,label} 매핑), `DEFAULT_NORMALIZATION_LEVEL`(=3) 신규 export. 기존 `LeagueSettingsView.tsx`에 로컬로 있던 동일 배열을 여기로 옮겨 두 화면이 공유하도록 함.
- `views/multi/league/LeagueSettingsView.tsx` — 로컬 `NORMALIZATION_LEVELS` 정의 삭제, `types/simSettings.ts`에서 import. 하드코딩된 fallback `3` → `DEFAULT_NORMALIZATION_LEVEL`로 교체(동작 변화 없음).
- `services/multi/leagueService.ts` — `CreateRoomParams`에 `simSettings?: SimSettings` 추가, `createRoom()`의 insert 페이로드에 `sim_settings` 조건부 포함.
- `components/multi/CreateLeagueModal.tsx` — `normalizationLevel` state(기본값 `DEFAULT_NORMALIZATION_LEVEL`) 추가, 드래프트 설정 섹션 아래 "엔진 설정" 섹션(0~5 숫자 입력)을 신설, `handleSubmit`의 `createRoom()` 호출에 `simSettings: { normalization: { enabled, k } }` 전달.

**Before**: `CreateLeagueModal.tsx`는 `createRoom({ leagueId, maxPlayers })`만 호출 — `sim_settings` 컬럼이 DB 기본값으로 남고, 방장이 recruiting 단계에서 `LeagueSettingsView`에 들어가 별도로 저장해야만 정규화 값이 명시적으로 채워짐.

**After**: 생성 모달에서 0(끔)~5(최대) 레벨을 선택하면 `createRoom()` insert 시점에 `rooms.sim_settings.normalization = { enabled, k }`가 바로 채워짐. 생성 후에도 `LeagueSettingsView`에서 그대로 재확인/변경 가능(같은 `NORMALIZATION_LEVELS` 프리셋 사용).

**검증**: 루트에 tsconfig.json이 없어 프론트엔드는 tsc 타입체크 대상이 아님(Vite/esbuild가 타입 어노테이션만 strip) — 기존 `LeagueSettingsView.tsx`도 동일한 패턴(`SimSettings` 타입에 없는 `normalization` 키를 런타임에서 읽고 씀)이라 기존 관례를 그대로 따름. 브라우저 수동 확인은 하지 않음(로컬 dev 서버 미기동).

**롤백 방법**: 위 4개 파일을 각 Before 상태로 되돌리면 됨 — `CreateLeagueModal.tsx`의 `createRoom()` 호출에서 `simSettings` 제거, `leagueService.ts`의 `CreateRoomParams.simSettings`/insert 조건부 스프레드 제거, `LeagueSettingsView.tsx`에 로컬 `NORMALIZATION_LEVELS` 재추가, `types/simSettings.ts`에서 신규 export 제거.

---

## 2026-07-28 — 오토픽 유저 "AUTO" 배지 표시

**배경**: 오토픽 관련 기능(개념/토글/트리거 0~3)이 전부 구현됐지만, 어떤 팀이 지금 오토픽
상태인지 드래프트 화면에서 시각적으로 확인할 방법이 없었음. 사용자 요청으로 두 곳에 배지 추가.
UI 전용 변경이라 처음엔 dev-log 기록 생략을 판단했으나, 사용자가 "dev-log에는 항상 기록을
남겨라"고 명시적으로 정정 — 이후 UI 변경도 전부 기록한다.

**변경 파일**:
- `components/draft/DraftBoard.tsx` (client) — `autoPickTeamIds?: Set<string>` prop 추가, 팀 헤더의
  온라인/오프라인 점 옆에 "AUTO" 배지 렌더링(상시 노출, 대기실/본 드래프트 화면 공용)
- `components/draft/DraftHeader.tsx` (client) — `isCurrentTeamAutoPick?: boolean` prop 추가(기본값
  `false` — 싱글/루키 드래프트와 공용 컴포넌트라 안 넘기면 기존 동작 그대로), "현재 차례" 팀 이름
  옆에 "AUTO" 배지 표시
- `views/multi/league/MultiDraftView.tsx` (client) — `autoPickTeamIds`(`pickOrder` + `autoPickUserIds`로
  userId→teamId 변환), `isCurrentTeamAutoPick` 파생값 계산 후 두 컴포넌트에 전달(대기실/본 화면의
  `DraftBoard` 2곳 + `DraftHeader` 1곳)

**Before**:
```tsx
// DraftBoard.tsx 팀 헤더
<div className="flex flex-col items-center gap-0.5">
    <span>{td.abbr}</span>
    {isOnline !== undefined && <span style={{ ...dot... }} />}
</div>

// DraftHeader.tsx 현재 차례
<span className="text-xs font-bold text-white">{currentDisplay.name}</span>
```

**After**:
```tsx
// DraftBoard.tsx 팀 헤더
<div className="flex flex-col items-center gap-0.5">
    <span>{td.abbr}</span>
    <div className="flex items-center gap-1">
        {isOnline !== undefined && <span style={{ ...dot... }} />}
        {isAutoPick && <span className="... bg-indigo-400 text-indigo-950">AUTO</span>}
    </div>
</div>

// DraftHeader.tsx 현재 차례
<span className="text-xs font-bold text-white">{currentDisplay.name}</span>
{isCurrentTeamAutoPick && <span className="... bg-indigo-400 text-indigo-950">AUTO</span>}
```

**검증**: 수정한 3개 파일(`DraftBoard.tsx`/`DraftHeader.tsx`/`MultiDraftView.tsx`)에 대해
synthesize한 tsc 옵션으로 신규 타입 에러 없음 확인. 두 컴포넌트 모두 싱글/루키 드래프트와 공용이라
새 prop을 옵셔널+기본값 `false`/`undefined`로 둬서 기존 호출부(넘기지 않는 곳)엔 영향 없음.
실제 브라우저 렌더링 확인은 미실시.

**롤백 방법**: 위 3개 파일에서 이번 diff(각 prop 추가분 + JSX 배지 블록)를 되돌리면 됨. 서버/DB
변경 없음(클라이언트 전용).

---

## 2026-07-28 — 시즌 데이터(useMultiGameData)를 LeagueLayout으로 끌어올림 — 리그 진입 시 1회만 로드

**배경**: `useMultiGameData()`가 `MultiSeasonLayout`에서 호출되고 있었는데, 이 레이아웃은
`/season/*` 하위 라우트에만 적용됨(로비/설정/어드민 화면은 그 밖의 `LeagueLayout` 형제 라우트).
로비·설정 화면으로 나갔다가 다시 일정/로스터 등 시즌 화면으로 돌아오면 `MultiSeasonLayout`이
언마운트→재마운트되면서 `useMultiGameData()`가 매번 방 데이터부터 처음부터 다시 로드해 로더가
반복적으로 떴음. 사용자와 논의 후 "리그 진입 시점에 한 번만 로딩하고 이후엔 재로딩 없이" 방향으로
결정 — 새로고침 시 다시 로드되는 건 SPA 특성상 불가피하고 오히려 정상 동작이라는 점도 함께 확인함.

**변경 파일**:
- `views/multi/league/LeagueLayout.tsx` (client) — `useMultiGameData(session, state.room?.id ?? null)`
  호출 + `SeasonCtx.Provider`를 여기로 이전. 단, 이 레이아웃 자체의 로딩 게이트는 `state.isLoading`
  (리그 데이터)만 기준으로 유지 — 시즌 데이터 로딩 완료를 기다리지 않고 로비/설정 화면은 즉시 렌더링됨
  (시즌 데이터는 백그라운드에서 병행 로드)
- `views/multi/season/MultiSeasonLayout.tsx` (client) — `useMultiGameData()` 직접 호출과
  `SeasonCtx.Provider` 제거, `useSeasonContext()`로 이미 로드된 데이터를 소비만 함. `gameData.isLoading`
  체크는 유지(URL로 시즌 라우트에 곧바로 진입해 아직 로딩 중인 극히 짧은 순간을 위한 안전장치)

**Before** (`LeagueLayout.tsx`):
```tsx
export function LeagueLayout() {
    const { leagueId } = useParams<{ leagueId: string }>();
    const state = useCurrentLeague();

    if (state.isLoading) { return <Loader2 .../>; }

    return (
        <LeagueCtx.Provider value={state}>
            <Outlet />
        </LeagueCtx.Provider>
    );
}
```
(`MultiSeasonLayout.tsx`):
```tsx
export function MultiSeasonLayout() {
    const { room } = useLeagueContext();
    const { session } = useGame();
    const gameData = useMultiGameData(session, room?.id ?? null);

    if (gameData.isLoading) { return <Loader2 .../>; }

    return (
        <SeasonCtx.Provider value={gameData}>
            ... <Outlet /> ...
        </SeasonCtx.Provider>
    );
}
```

**After** (`LeagueLayout.tsx`):
```tsx
export function LeagueLayout() {
    const { leagueId } = useParams<{ leagueId: string }>();
    const state = useCurrentLeague();
    const { session } = useGame();
    const gameData = useMultiGameData(session, state.room?.id ?? null);

    if (state.isLoading) { return <Loader2 .../>; }

    return (
        <LeagueCtx.Provider value={state}>
            <SeasonCtx.Provider value={gameData}>
                <Outlet />
            </SeasonCtx.Provider>
        </LeagueCtx.Provider>
    );
}
```
(`MultiSeasonLayout.tsx`):
```tsx
export function MultiSeasonLayout() {
    const gameData = useSeasonContext();

    if (gameData.isLoading) { return <Loader2 .../>; }

    return ( ... <Outlet /> ... );  // SeasonCtx.Provider 없음 — 상위(LeagueLayout)에서 이미 제공
}
```

**검증**: `tsc --noEmit`(client) 신규 에러 없음, 브레이스/괄호 균형 확인(2개 파일 OK), `npm run build`
성공. 순환 임포트 확인 — `seasonContext.ts`가 `hooks/useMultiGameData.ts`와 react만 참조하는 독립
파일이라 `LeagueLayout.tsx`에서 import해도 순환 없음(`hooks/useMultiGameData.ts`/`hooks/useCurrentLeague.ts`
쪽도 `views/multi/league/`를 참조하지 않음을 확인). 클라이언트 UI 전용 변경, 서버 배포 불필요.

**주의사항 / 한계**: 이제 리그의 어떤 하위 화면(로비 포함)에 들어가도 시즌 데이터 로드가 백그라운드로
같이 시작됨 — 드래프트/모집 중이라 시즌이 아직 시작 안 된 리그에서도 매번 이 조회가 발생하는
트레이드오프가 있음(사용자가 명시적으로 선택한 방향, "로비/설정 화면 진입 속도가 느려질 수 있다"는
점 사전 고지 후 승인받음). 실제 브라우저 확인(로비↔일정 반복 이동 시 로더 재출현 여부)은 미실시.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨 — 서로 짝을 이루는 변경이라 반드시 함께
되돌릴 것(하나만 되돌리면 `SeasonCtx`가 이중으로 제공되거나 아예 제공되지 않아 `useSeasonContext()`가
깨짐).

---

## 2026-07-27 — 재접속 시 오토픽 자동 해제(트리거 3) — 명시적으로 켠 경우는 보존

**배경**: `docs/plan/draft-autopick-plan.md`의 트리거 3, 마지막 남은 항목. 타임아웃 연속 미스나
드래프트 시작 시 미입장으로 오토픽 전환된 유저가 WS 재접속(auth 성공)하면 자동으로 오토픽을
해제하고 수동 모드로 복귀시킨다.

구현 중 발견한 중요한 함정: `autoPickUserIds`는 단일 Set이라 "왜 오토픽 상태가 됐는지"(시스템이
자동 감지했는지, 본인/어드민이 일부러 켰는지)를 구분하지 못한다. 재접속 시 무조건 해제해버리면,
"이번 판은 바빠서 계속 오토픽으로 둘게"라고 셀프토글이나 어드민 토글로 **명시적으로 설정한** 유저가
잠깐 다른 탭에서 재접속하는 순간 그 설정이 의도치 않게 풀려버리는 회귀가 생긴다. 이번 세션 초반에
합의한 "재접속 시 자동 해제"는 어디까지나 시스템이 자동으로 감지해 넣은 경우에 한정된 논의였으므로,
이 구분을 새로 추가해 반영했다.

**변경 파일**:
- `server/src/DraftRoom.ts` (server, client 미러 없음 — 순수 서버 내부 로직)
  - `autoPickManualUserIds: Set<string>` 상태 신설 — `autoPickUserIds`의 부분집합으로, 셀프/어드민
    토글로 명시적으로 켠 유저만 표시(자동 트리거는 여기 포함 안 됨)
  - `setAutoPick()` — on/off 시 `autoPickManualUserIds`도 함께 갱신
  - `revertAutoPickOnReconnect(userId)` 신규 — `autoPickUserIds`엔 있지만 `autoPickManualUserIds`엔
    없는 경우(=자동 트리거)에 한해서만 `setAutoPick(userId, false)` 호출
  - `handleSubmitPick()` — 본인이 직접 픽 제출 시 `autoPickManualUserIds`도 함께 삭제(수동 픽은
    오토픽 사유·출처를 불문하고 전부 무효화하는 게 맞다고 판단)
- `server/src/index.ts` (server) — `auth` 처리에서 `room.addSocket(ws)` 직후
  `await room.revertAutoPickOnReconnect(userId)` 호출 추가

**Before**:
```ts
// setAutoPick()
if (enabled) this.autoPickUserIds.add(targetUserId);
else         this.autoPickUserIds.delete(targetUserId);

// handleSubmitPick()
this.pickMissCounts.delete(userId);
this.autoPickUserIds.delete(userId);

// index.ts auth 핸들러
ws.data = { userId, roomId: msg.roomId };
room.addSocket(ws);
// (재접속 시 오토픽 해제 로직 없음)
```

**After**:
```ts
// setAutoPick()
if (enabled) {
    this.autoPickUserIds.add(targetUserId);
    this.autoPickManualUserIds.add(targetUserId);
} else {
    this.autoPickUserIds.delete(targetUserId);
    this.autoPickManualUserIds.delete(targetUserId);
}

// 신규 메서드
async revertAutoPickOnReconnect(userId: string): Promise<void> {
    if (this.autoPickUserIds.has(userId) && !this.autoPickManualUserIds.has(userId)) {
        await this.setAutoPick(userId, false);
    }
}

// handleSubmitPick()
this.pickMissCounts.delete(userId);
this.autoPickUserIds.delete(userId);
this.autoPickManualUserIds.delete(userId);

// index.ts auth 핸들러
ws.data = { userId, roomId: msg.roomId };
room.addSocket(ws);
await room.revertAutoPickOnReconnect(userId);
```

**검증**: `cd server && tsc --noEmit -p .` — `DraftRoom.ts`/`index.ts` 관련 신규 에러 없음(기존부터
있던 "Cannot find module/name 'Bun'"(@types/bun 미설치)만 남음). 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: `server/src/DraftRoom.ts`에서 `autoPickManualUserIds` 필드, `setAutoPick()`의 분기
확장, `revertAutoPickOnReconnect()` 메서드, `handleSubmitPick()`의 `autoPickManualUserIds.delete()`
를 위 Before 블록으로 되돌리고, `server/src/index.ts`의 `revertAutoPickOnReconnect()` 호출 1줄
제거. client 미러 없음(서버 전용 로직). 이것으로 `docs/plan/draft-autopick-plan.md`의 트리거 0~4
전체가 구현 완료됨.

---

## 2026-07-27 — 픽 타임아웃 연속 미스 시 오토픽 전환(트리거 1) + 어드민 세션 설정 노출

**배경**: `docs/plan/draft-autopick-plan.md`의 트리거 1. 유저가 `autoPickAfterMisses`회(어드민이
세션 설정에서 지정, 기본 1회) 연속으로 픽 타이머를 전부 소진하면 그 유저를 오토픽 모드로 전환.
"연속"이 기준이므로 본인이 직접 픽을 제출하면(=돌아왔다는 증거) 미스 카운트를 리셋하고, 이미
오토픽 모드였다면 그것도 함께 해제한다 — 안 그러면 본인 의사와 무관하게 다음 차례부터 계속
자동픽되는 어색한 상태가 남는다.

이 임계치는 다른 드래프트 설정(라운드 수/픽 제한시간 등)과 동일하게 `leagues` 테이블 컬럼으로
추가하고 `CreateLeagueModal`/`LeagueSettingsView`에 입력 필드를 노출했다 — `LeagueSettingsView`의
"스케줄" 섹션은 `!isInProgress`로 잠기므로(드래프트 시작 후 라운드 수를 못 바꾸는 것과 동일하게)
이 값도 드래프트가 실제로 시작되기 전까지만 조정 가능하다. `DraftConfig`는 방 준비 시점
(`buildDraftSetup()`)에 한 번 굳어지므로 드래프트 도중 실시간 반영은 불가능 — 애초에 기존 라운드
수/픽 제한시간과 동일한 제약이라 새로 생긴 한계는 아니다.

**변경 파일**:
- `server/src/protocol.ts` (server) — `DraftConfig.autoPickAfterMisses: number` 추가
- `types/multiDraft.ts` (client 미러) — `MultiDraftState.autoPickAfterMisses: number` 추가
- `server/src/DraftRoom.ts` (server) — `pickMissCounts: Map<string, number>` 상태 신설(메모리 전용),
  `onPickTimeout()`에서 미스 카운트 증가 후 임계치 도달 시 `autoPickUserIds.add()`, `handleSubmitPick()`
  에서 본인 제출 시 `pickMissCounts.delete()` + `autoPickUserIds.delete()`
- `server/src/startDraft.ts` (server) — `DEFAULT_AUTO_PICK_AFTER_MISSES = 1`, `buildDraftSetup()`에서
  `league.draft_auto_pick_after_misses ?? DEFAULT_AUTO_PICK_AFTER_MISSES` 읽어 `draftConfig`에 포함
- `hooks/useLeagueDraft.ts` (client) — `assembleState()`에 `autoPickAfterMisses` 반영
- `services/multi/roomQueries.ts` (client) — `LeagueRow.draft_auto_pick_after_misses: number` 추가
- `services/multi/leagueService.ts` (client) — `CreateLeagueParams.options`/`UpdateLeagueSettingsParams`에
  `draftAutoPickAfterMisses` 추가, `createLeague()`/`updateLeagueSettings()` payload 매핑 라인 추가
- `components/multi/CreateLeagueModal.tsx` (client) — "오토픽 전환 기준(연속 미스)" 입력 필드(1–5) 추가
- `views/multi/league/LeagueSettingsView.tsx` (client) — 동일 입력 필드 추가(스케줄 섹션,
  `!isInProgress`일 때만 노출)
- **DB 마이그레이션** (Supabase 프로젝트 `buummihpewiaeltywdff`, `add_draft_auto_pick_after_misses`) —
  `ALTER TABLE public.leagues ADD COLUMN draft_auto_pick_after_misses integer NOT NULL DEFAULT 1;`
  (이 컬럼 없이는 `createLeague`/`updateLeagueSettings`가 Postgres 에러로 실패함)

**Before**:
```ts
// onPickTimeout()
console.log(`[DraftRoom:${this.roomId}] pick timeout for user=${entry.userId}`);
const bestId = getBestAvailableId(...);
...

// handleSubmitPick()
const result = await this.persistPick(userId, playerId);
```

**After**:
```ts
// onPickTimeout()
console.log(`[DraftRoom:${this.roomId}] pick timeout for user=${entry.userId}`);
const misses = (this.pickMissCounts.get(entry.userId) ?? 0) + 1;
this.pickMissCounts.set(entry.userId, misses);
if (misses >= this.config.autoPickAfterMisses) {
    this.autoPickUserIds.add(entry.userId);
}
const bestId = getBestAvailableId(...);
...

// handleSubmitPick()
this.pickMissCounts.delete(userId);
this.autoPickUserIds.delete(userId);
const result = await this.persistPick(userId, playerId);
```

**검증**: `cd server && tsc --noEmit -p .` — `DraftRoom.ts`/`startDraft.ts` 관련 신규 에러 없음(기존부터
있던 "Cannot find module 'bun'"/`startDraft.ts`의 discriminated union `.error` 이슈만 남음, 둘 다
이번 변경 이전부터 존재). 클라이언트 6개 파일(`multiDraft.ts`/`useLeagueDraft.ts`/`roomQueries.ts`/
`leagueService.ts`/`CreateLeagueModal.tsx`/`LeagueSettingsView.tsx`)도 synthesize한 tsc 옵션으로
신규 에러 없음 확인(남은 에러는 `sim_settings`/`normalization` 관련 완전히 무관한 기존 이슈).
`information_schema.columns`로 마이그레이션 전 `leagues` 테이블에 해당 컬럼이 없었음을 먼저 확인 후
`ADD COLUMN`으로 추가, 적용 결과 `success:true`. 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: 위 9개 코드 파일에서 이번 diff를 되돌리고, DB는
`ALTER TABLE public.leagues DROP COLUMN draft_auto_pick_after_misses;`로 컬럼 제거(선택사항 — 컬럼이
남아있어도 코드가 안 읽으면 무해함). `protocol.ts` ↔ `types/multiDraft.ts`는 미러 쌍이므로 함께 되돌릴 것.

---

## 2026-07-27 — 스케줄 화면 PTS/REB/AST 리더 localStorage 캐싱

**배경**: `MultiScheduleView.tsx`가 시즌 하위 탭을 오가며 재마운트될 때마다, 그리고 마운트된 동안
5초마다 방 안의 `game_pbp` 전체 row(`home_box`/`away_box` JSON 포함)를 다시 조회해서 PTS/REB/AST
리더를 계산하고 있었음. `game_pbp` row는 시뮬레이션 완료 시 1회 upsert된 뒤 갱신되지 않으므로
(관리자 수동 재시뮬레이션은 극히 예외적이라 이번 범위에서 제외, 사용자 확인 완료), 이미 끝난 경기는
매번 다시 조회할 필요가 없음. 상세 설계는
[schedule-leaders-cache-plan.md](../plan/schedule-leaders-cache-plan.md) 참조.

조사 중 발견: 토너먼트 게임 ID(`T_R{round}_M{matchIndex}`, `server/src/shared/tournamentBracket.ts`)가
완전히 위치 기반이라 랜덤 요소가 없음. `resetTournament()`가 같은 `room.id`를 재사용해 드래프트부터
다시 시작하므로, 리셋 후 새 토너먼트의 동일 라운드/매치가 예전과 **같은 game_id**를 다시 갖게 됨 —
캐시를 영구 보존하면 리셋 전 경기의 리더가 리셋 후 동명 경기에 잘못 붙는 실제 버그가 생겨, 사용자가
직접 요청하지 않았지만 리셋 시점 캐시 무효화를 계획에 포함시킴(승인받음).

**변경 파일**:
- `services/multi/gameLeadersCache.ts` (신규, client 전용) — `loadGameLeadersCache`/
  `mergeGameLeadersCache`/`clearGameLeadersCache`, `nbagm:gameLeaders:{roomId}` 키로 localStorage 영속화.
  `GameLeaders`/`StatLeader` 타입도 여기로 이전(기존 `MultiScheduleView.tsx` 로컬 정의 제거)
- `views/multi/season/MultiScheduleView.tsx` — `gameLeadersMap` 초기값을 캐시로 채움, 폴링 로직을
  "캐시에 없는 `played` 게임만" 델타 조회하도록 변경, 캐시에 빠진 게 없으면 네트워크 요청 자체를 스킵
- `views/multi/league/LeagueSettingsView.tsx` — `handleReset()`에서 `resetTournament()` 성공 직후
  `clearGameLeadersCache(room.id)` 호출 추가

**Before** (`MultiScheduleView.tsx`, `gameLeadersMap` 로딩):
```ts
const [gameLeadersMap, setGameLeadersMap] = useState<Record<string, GameLeaders>>({});
useEffect(() => {
    if (!room?.id) return;
    let cancelled = false;
    const loadLeaders = async () => {
        const { data } = await supabase
            .from('game_pbp')
            .select('game_id, home_box, away_box')
            .eq('room_id', room.id);
        if (cancelled || !data) return;
        const map: Record<string, GameLeaders> = {};
        for (const row of data as { ... }[]) {
            map[row.game_id] = computeGameLeaders(row.home_box, row.away_box);
        }
        setGameLeadersMap(map);
    };
    loadLeaders();
    const timer = setInterval(loadLeaders, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
}, [room?.id]);
```

**After**:
```ts
const [gameLeadersMap, setGameLeadersMap] = useState<Record<string, GameLeaders>>(
    () => room?.id ? loadGameLeadersCache(room.id) : {},
);
useEffect(() => {
    if (!room?.id) return;
    let cancelled = false;
    const loadLeaders = async () => {
        const cached = loadGameLeadersCache(room.id);
        const missingIds = schedule.filter(g => g.played && !(g.id in cached)).map(g => g.id);

        if (missingIds.length === 0) {
            setGameLeadersMap(cached);
            return;
        }

        const { data } = await supabase
            .from('game_pbp')
            .select('game_id, home_box, away_box')
            .eq('room_id', room.id)
            .in('game_id', missingIds);
        if (cancelled || !data) return;
        const updates: Record<string, GameLeaders> = {};
        for (const row of data as { ... }[]) {
            updates[row.game_id] = computeGameLeaders(row.home_box, row.away_box);
        }
        setGameLeadersMap(mergeGameLeadersCache(room.id, updates));
    };
    loadLeaders();
    const timer = setInterval(loadLeaders, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
}, [room?.id, schedule]);
```

**검증**: `tsc --noEmit`(client) 신규 에러 없음, 브레이스/괄호 균형 확인(3개 파일 전부 OK),
`npm run build` 성공. 클라이언트 UI/로직 전용 변경이라 서버 배포 불필요. 실제 브라우저에서 Network
탭으로 캐시 히트/델타 조회 동작 확인은 미실시.

**롤백 방법**: `services/multi/gameLeadersCache.ts` 삭제, `MultiScheduleView.tsx`를 위 Before
블록 및 로컬 `interface StatLeader`/`GameLeaders` 정의로 되돌리기, `LeagueSettingsView.tsx`의
`handleReset()`에서 `clearGameLeadersCache(room.id)` 호출 및 관련 import 제거.

---

## 2026-07-27 — 드래프트 시작 시 미입장 유저 자동 오토픽 전환

**배경**: `docs/plan/draft-autopick-plan.md`의 트리거 2. 오토픽 개념/셀프·어드민 토글(직전 항목)에
이어서, 드래프트가 `waiting → active`로 전환되는 순간 방에 WS로 연결돼 있지 않은 유저를 즉시
오토픽 모드로 전환하는 로직 추가. `room.sockets`(서버가 이미 들고 있는 WS 연결 목록)로 판정하며,
Supabase Presence 등 별도 인프라 없이 서버 자체 정보만으로 처리.

이 판정은 "깨끗한 종료"(탭 닫기, 페이지 이동, 브라우저 종료 → WS close 이벤트 발생)는 정확하지만
"네트워크가 갑자기 끊긴 경우"는 서버가 close 이벤트를 못 받아 일시적으로 놓칠 수 있다는 한계가
있음(감내 가능한 트레이드오프로 채택 — 어차피 그 유저 차례에 응답이 없으면 기존 `onPickTimeout()`이
오토픽으로 전환시킴). 다만 이 논의 중 `broadcast()`가 죽은 소켓의 `send()` 실패를 그냥 무시만 하고
`sockets`에서 제거하지 않는 실제 허점을 발견해 함께 고침 — 이 청소를 안 하면 죽은 소켓이 계속
"접속 중"으로 남아 `getConnectedUserIds()` 판정이 부정확해짐.

**변경 파일**:
- `server/src/DraftRoom.ts` (server, client 미러 없음 — 순수 서버 내부 로직)
  - `activate()` 최상단에 미입장 유저 감지 루프 추가 (`pickOrder`를 유저당 1회만 순회, AI 슬롯 제외)
  - `getConnectedUserIds()` private 헬퍼 신설 — `[...this.sockets].map(ws => ws.data.userId)`
  - `broadcast()` — `ws.send()` 실패 시 `this.sockets.delete(ws)` 추가(기존엔 catch에서 그냥 무시)

**Before**:
```ts
async activate(): Promise<boolean> {
    if (this.status !== 'waiting') return false;

    this.status               = 'active';
    this.currentPickIndex     = 0;
    this.currentPickStartedAt = new Date().toISOString();
    ...
}

private broadcast(payload: string): void {
    for (const ws of this.sockets) {
        try { ws.send(payload); } catch { /* 소켓 이미 닫힘 */ }
    }
}
```

**After**:
```ts
async activate(): Promise<boolean> {
    if (this.status !== 'waiting') return false;

    const connected = this.getConnectedUserIds();
    const seen = new Set<string>();
    for (const entry of this.config.pickOrder) {
        if (entry.isAi || seen.has(entry.userId)) continue;
        seen.add(entry.userId);
        if (!connected.has(entry.userId)) this.autoPickUserIds.add(entry.userId);
    }

    this.status               = 'active';
    this.currentPickIndex     = 0;
    this.currentPickStartedAt = new Date().toISOString();
    ...
}

private broadcast(payload: string): void {
    for (const ws of this.sockets) {
        try { ws.send(payload); } catch { this.sockets.delete(ws); }
    }
}
```

**검증**: `server/tsconfig.json`(직전 세션에서 신규 추가됨) 기준 `cd server && tsc --noEmit -p .`
실행 — `DraftRoom.ts`는 기존부터 있던 "Cannot find module 'bun'"(@types/bun 미설치, 무관) 1건 외
신규 에러 없음. 나머지 에러도 전부 이번 변경과 무관한 기존 파일들(`scheduler.ts`/`tournamentArchiver.ts`/
`simRunner.ts`/`startDraft.ts` 등 사전 존재 이슈). 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: `server/src/DraftRoom.ts`에서 `activate()`의 미입장 감지 루프, `getConnectedUserIds()`
메서드, `broadcast()`의 `this.sockets.delete(ws)` 3곳을 위 Before 블록으로 되돌리면 됨. client 미러
없음(서버 전용 로직).

---

## 2026-07-27 — 경기 시뮬레이션 Worker Thread 분리

**배경**: 멀티플레이어 서버가 큰 토너먼트 진행 중 경기 시뮬레이션(경기당 4.5~10초 동기 연산,
`runFullGameSimulation()`)에 메인 스레드 이벤트 루프가 막혀 HTTP/WS 연결이 끊기는 문제 발생
("진행중인 경기 보기"가 "경기 데이터를 준비하는 중입니다..."만 뜨고 안 들어가짐). 1차로
스케줄러 루프에 `setImmediate` 양보를 넣었으나(경기 "사이"만 양보) 경기 "한 개" 자체의 블로킹은
그대로 남아 효과 없었음. VM 스펙업은 Bun/Node가 JS를 단일 스레드로 실행하므로 근본 해결이 안 돼
기각. 상세 설계·리스크 분석은 [worker-thread-sim-plan.md](../plan/worker-thread-sim-plan.md) 참조.

**변경 파일**:
- `server/src/workers/simWorker.ts` (신규) — 워커 스레드 엔트리, `runSimulation()`을 그대로 import해 실행
- `server/src/workers/simWorkerPool.ts` (신규) — 풀 매니저. 스폰 직후 ping/pong 헬스체크,
  워커 크래시 시 `game_sim_claims` 안전망 정리, 5분 간격 stale 클레임 청소, 60초 태스크 타임아웃
- `server/src/workers/protocol.ts` (신규) — 메인↔워커 메시지 타입 (discriminated union)
- `server/src/scheduler.ts` — `runSimGames()`의 순차 `for...await` 루프를
  `Promise.allSettled(tasks.map(... simWorkerPool.runSimulationInWorker ...))`로 교체, 지난번 넣은
  `setImmediate` 양보 제거(더 이상 불필요), stale 클레임 청소 인터벌 추가
- `server/src/index.ts` — 어드민 수동 시뮬 엔드포인트(`handleSimOverride`)를 `simWorkerPool` 경유로
  교체, 부팅 시퀀스에 `await simWorkerPool.init()` 추가
- `server/tsconfig.json` (신규) — server 디렉토리에 tsconfig가 없어서 이번 세션 내내
  `tsc --noEmit -p .`가 "Cannot find a tsconfig.json" 에러로 즉시 실패하고 있었는데, grep이
  거기서 매칭되는 줄이 없어 "에러 없음"으로 잘못 보였음(허위 통과). 이 파일 추가로 실제 타입체크가
  동작하게 됨 — 향후 서버 변경 검증에도 계속 사용

**Before** (`server/src/scheduler.ts`, `runSimGames()` 말미):
```ts
for (const { roomId, gameId } of tasks) {
    const result = await runSimulation(roomId, gameId);
    if (!result.ok && !result.skipped) {
        console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${result.error}`);
    }
    await new Promise(resolve => setImmediate(resolve));
}
await advanceSimDates(rooms as RoomRow[], leagueMap, now.slice(0, 10));
```

**After**:
```ts
const results = await Promise.allSettled(
    tasks.map(({ roomId, gameId }) => simWorkerPool.runSimulationInWorker(roomId, gameId)),
);
results.forEach((r, i) => {
    const { roomId, gameId } = tasks[i];
    if (r.status === 'rejected') {
        console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${r.reason}`);
    } else if (!r.value.ok && !r.value.skipped) {
        console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${r.value.error}`);
    }
});
await advanceSimDates(rooms as RoomRow[], leagueMap, now.slice(0, 10));
```

**검증**:
- `server/tsconfig.json` 신규 작성 후 `tsc --noEmit -p .` 실행 — 신규/변경 파일에서 새로 생긴 에러
  없음(남은 건 프로젝트 전역에 이미 있던 "Cannot find name 'Bun'"(@types/bun 미설치) 및 무관한
  기존 파일들의 사전 존재 이슈뿐, 확인 완료)
- 브레이스/괄호 균형 확인(5개 파일 전부 OK)
- **로컬 스모크 테스트 미실시** — 이 개발 환경에 `bun` 바이너리가 설치되어 있지 않아 워커 스폰을
  로컬에서 직접 띄워볼 수 없었음. Fly.io 배포 이미지에는 Bun이 있으므로, 배포 직후 로그로
  `[simPool] worker#N ready`(ping/pong 헬스체크 통과) 확인을 사실상의 최초 검증으로 사용
- 실측 확인: 배포 전 Supabase에 직접 쿼리해서 `game_sim_claims` 839건 중 823건이 10분 이상 경과,
  그중 124건은 대응하는 `game_pbp` row가 없는 진짜 고아 레코드임을 확인 — 이번에 추가한 stale
  클레임 청소가 이론이 아니라 실제로 존재하는 문제를 다룬다는 근거

**롤백 방법**: `server/src/workers/` 디렉토리 3개 파일 삭제, `scheduler.ts`/`index.ts`를 위 Before
블록 및 원래 `import { runSimulation } from './simRunner'`로 되돌리고 `simWorkerPool.init()` 호출
제거. `server/tsconfig.json`은 삭제해도 런타임에 영향 없음(타입체크 전용).

---

## 2026-07-27 — 멀티 드래프트 오토픽 모드(신규 개념) + 셀프/어드민 토글

**배경**: 멀티플레이어 드래프트에서 (1) 픽 타임아웃 (2) 드래프트 시작 시 미입장 (3) 어드민 강제 지정 —
3가지 트리거로 유저를 "오토픽 모드"로 전환하는 기능을 계획(`docs/plan/draft-autopick-plan.md`)했고,
그중 가장 먼저 "오토픽 모드" 개념 자체 + 셀프 토글(본인 팀 on/off) + 어드민 토글(모든 유저 on/off)을
구현. 타임아웃/미입장 자동 트리거는 이번 범위에서 제외(추후 별도 작업).

기존 `onPickTimeout()`은 타임아웃된 픽 1개만 대납하고 다음 픽부터는 다시 정상 타이머로 돌아가는
"1회성" 동작이었는데, 이번에 추가한 오토픽은 **해제 전까지 계속 유지되는 영속 모드**라는 점이 다름.

영속화 방식은 메모리 전용으로 결정(사용자 확인 완료) — `submit_draft_pick_v2` RPC가 매 픽마다
`rooms.draft_cursor`를 통째로 덮어써서(`status`/`currentPickIndex`/`currentPickStartedAt`만 포함)
`autoPickUserIds`를 DB에 안정적으로 지속시킬 수 없다는 걸 실제 RPC 정의(`pg_get_functiondef`)로 확인함.
서버 재시작 시 오토픽 상태가 리셋되지만, 해당 유저가 여전히 자리에 없다면 다음 타임아웃에서 다시
감지되어 자동 복구된다(1회성 지연만 재발생) — 감내 가능한 트레이드오프로 채택.

**변경 파일**:
- `server/src/protocol.ts` (server) — `DraftCursor.autoPickUserIds: string[]` 추가, `ToggleAutoPickMsg` 신규,
  `AdminMsg.action`에 `'toggle-autopick'` 추가(+ params에 `targetUserId`/`enabled`)
- `types/multiDraft.ts` (client 미러) — `MultiDraftState.autoPickUserIds: string[]` 추가
- `server/src/DraftRoom.ts` (server) — `autoPickUserIds: Set<string>` 상태(메모리 전용, `load()`에서
  의도적으로 미복원), `setAutoPick(userId, enabled)` 메서드, `scheduleNext()`/`onAiPick()` 조건을
  `entry.isAi` → `entry.isAi || autoPickUserIds.has(entry.userId)`로 확장, `handleAdmin()`에
  `'toggle-autopick'` 케이스 추가, `persistPick()` 호출 시 `isAi` 인자를 `true` 하드코딩 대신
  `entry.isAi ?? false`로 전달(오토픽 대납된 실제 사람 유저가 `draft_picks.is_ai=true`로 잘못
  기록되는 것 방지)
- `server/src/index.ts` (server) — `toggleAutoPick` 클라 메시지 처리(본인 userId 대상, 어드민 권한 불필요)
- `hooks/useLeagueDraft.ts` (client) — `assembleState`/`cursorFields`에 `autoPickUserIds` 반영,
  `sendAdmin` params 타입 확장, `toggleAutoPick(enabled)` 함수 추가·반환
- `components/draft/DraftAdminPanel.tsx` (client) — "유저별 오토픽" 섹션 추가(참가자별 on/off 버튼)
- `views/multi/league/MultiDraftView.tsx` (client) — 상단 바에 "내 오토픽" 셀프 토글 버튼 추가

**Before**:
```ts
// DraftRoom.ts scheduleNext()
if (entry.isAi) {
    this.aiTimer = setTimeout(() => this.onAiPick(), delay);
} else {
    this.pickTimer = setTimeout(() => this.onPickTimeout(), this.config.pickDurationSec * 1000);
}

// onAiPick()
if (!entry?.isAi) return;
...
const result = await this.persistPick(entry.userId, bestId, true);
```

**After**:
```ts
// scheduleNext()
if (entry.isAi || this.autoPickUserIds.has(entry.userId)) {
    this.aiTimer = setTimeout(() => this.onAiPick(), delay);
} else {
    this.pickTimer = setTimeout(() => this.onPickTimeout(), this.config.pickDurationSec * 1000);
}

// onAiPick()
if (!entry || (!entry.isAi && !this.autoPickUserIds.has(entry.userId))) return;
...
const result = await this.persistPick(entry.userId, bestId, entry.isAi ?? false);
```

**검증**: `tsc --noEmit`(project tsconfig 부재로 synthesize한 임시 옵션) 실행 결과, 수정한 7개 파일
(`DraftRoom.ts`/`protocol.ts`/`index.ts`/`multiDraft.ts`/`useLeagueDraft.ts`/`DraftAdminPanel.tsx`/
`MultiDraftView.tsx`) 관련 신규 에러 없음 확인(남은 에러는 전부 이번 변경과 무관한 기존 파일들 —
Bun 타입 누락, 다른 서비스 파일들의 사전 존재 이슈). 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: 위 8개 파일에서 이번 커밋의 diff만 되돌리면 됨. `protocol.ts` ↔ `types/multiDraft.ts`는
미러 쌍이므로 반드시 함께 되돌릴 것 — 하나만 되돌리면 `DraftCursor`/`MultiDraftState` 필드 불일치로
클라이언트가 `autoPickUserIds`를 못 읽거나 서버가 보내지 않는 필드를 기대하는 불일치가 생김.

---

## 2026-07-27 — playStyle 액터 선택 로직을 역할(슈터/패서) 기반으로 통합

**배경**: `ballDominance`(볼 소유 빈도)와 `playStyle`(슛 vs 패스 성향) 텐던시의 상호작용을 논의하다가,
"플레이스타일이 패스퍼스트면 어시스터로 뽑힐 확률이 높아지고 야투를 덜 던지게" 만들고 싶다는 요청.
기존 로직은 `pickWeightedActor()` 하나가 슈터 픽/패서 픽 양쪽에 재사용되는데, playStyle 보정이
"플레이타입 종류"로만 4개(Iso/PostUp/PnR_Handler/Handoff) 한정 분기돼 있어서 역할(슈터냐 패서냐)
구분이 없었고, 나머지 8개 플레이타입은 아예 영향이 없었음. 이번 변경으로 전체 12개 플레이타입에
역할 기반으로 통일 적용.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client)
- `server/src/shared/engine/pbp/playTypes.ts` (server 미러)
- `services/game/config/constants.ts` (client)
- `server/src/shared/game/config/constants.ts` (server 미러)

**Before** (`playTypes.ts`, `resolvePlayAction` 내부):
```ts
const pickWeightedActor = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
    ...
    const candidates = pool.map(p => {
        ...
        let weight = Math.max(1, rawScore) * usageMultiplier;
        weight *= (p.tendencies?.ballDominance ?? 1.0);

        // [SaveTendency] playStyle: pass-first(-1) vs shoot-first(+1)
        // Iso, PostUp → shoot-first boost: +30% at playStyle=+1.0
        // PnR_Handler, Handoff → pass-first boost: +20% at playStyle=-1.0
        // CatchShoot, Cut → neutral (receiver role)
        const ps = p.tendencies?.playStyle ?? 0;
        if (playType === 'Iso' || playType === 'PostUp') {
            weight *= (1 + ps * 0.3);
        } else if (playType === 'PnR_Handler' || playType === 'Handoff') {
            weight *= (1 - ps * 0.2);
        }
        return { p, weight: Math.max(0.01, weight) };
    });
    ...
};

const pickPasser = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
    return pickWeightedActor(
        p => criteria(p) * Math.pow(p.attr.passVision * p.attr.passIq / 2500, 1.5),
        excludeId
    );
};

// PnR_Handler 케이스
const actor = pickWeightedActor(p => p.archetypes.handler);
const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId);

// Handoff 케이스
const actor = pickWeightedActor(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId);
```

**After**:
```ts
const pickWeightedActor = (
    criteria: (p: LivePlayer) => number,
    excludeId?: string,
    role: 'shooter' | 'passer' = 'shooter'
) => {
    ...
    const candidates = pool.map(p => {
        ...
        let weight = Math.max(1, rawScore) * usageMultiplier;
        weight *= (p.tendencies?.ballDominance ?? 1.0);

        // [SaveTendency] playStyle: role 기반 통합 배율 (슈터 vs 패서)
        const ps = p.tendencies?.playStyle ?? 0;
        const psCfg = SIM_CONFIG.PLAY_SELECTION;
        weight *= role === 'shooter' ? (1 + ps * psCfg.PLAYSTYLE_SHOOTER_K) : (1 - ps * psCfg.PLAYSTYLE_PASSER_K);

        return { p, weight: Math.max(0.01, weight) };
    });
    ...
};

const pickPasser = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
    return pickWeightedActor(
        p => criteria(p) * Math.pow(p.attr.passVision * p.attr.passIq / 2500, 1.5),
        excludeId,
        'passer'
    );
};

// PnR_Handler 케이스 — 스크리너를 명시적으로 passer role 태깅
const actor = pickWeightedActor(p => p.archetypes.handler);
const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId, 'passer');

// Handoff 케이스 — 빅맨을 명시적으로 passer role 태깅
const actor = pickWeightedActor(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId, 'passer');
```

`pickPasser`가 내부적으로 `'passer'` role을 넘기도록 바뀌어서, 나머지 9개 플레이타입(Iso, PnR_Roll,
PnR_Pop, PostUp, CatchShoot, Cut, Transition, OffBallScreen, DriveKick)의 패서 픽은 호출부 수정 없이
자동으로 새 로직을 탄다. `pickWeightedActor`의 다른 모든 슈터(actor) 픽은 `role` 인자를 생략해
기본값 `'shooter'`를 그대로 사용 — 호출부 무수정.

**Before** (`constants.ts`, `SIM_CONFIG.ZONE_SELECTION` 다음):
```ts
ZONE_SELECTION: {
    ZONE_PREF_THRESHOLD: 0.15,
    SLIDER_SENSITIVITY: 0.5,
},
FOUL_TROUBLE: {
```

**After**:
```ts
ZONE_SELECTION: {
    ZONE_PREF_THRESHOLD: 0.15,
    SLIDER_SENSITIVITY: 0.5,
},
// Play Selection: pickWeightedActor의 역할(슈터/패서) 기반 playStyle 배율
PLAY_SELECTION: {
    PLAYSTYLE_SHOOTER_K: 0.25,  // 슈터 픽: weight *= (1 + ps*K)
    PLAYSTYLE_PASSER_K: 0.25,   // 패서 픽: weight *= (1 - ps*K)
},
FOUL_TROUBLE: {
```

**검증**:
- Node 재현 스크립트: ps=-1 → shooter×0.75/passer×1.25, ps=0 → 1.0/1.0, ps=+1 → shooter×1.25/passer×0.75 (의도대로 확인)
- `tsc --noEmit` client/server 모두 신규 에러 없음
- `npm run build` 성공 (2195 모듈)
- `fly deploy -a basketballgm-app-server` 배포 성공, HTTP 200, 로그 정상(WebSocket 서버 기동 확인). 배포 중 "not listening on 0.0.0.0:3001" 경고는 부팅 타이밍 노이즈로 확인된 기존 알려진 패턴(직후 로그에 정상 리스닝 확인됨)

**롤백 방법**: 위 Before 블록 4곳(client playTypes.ts, server playTypes.ts, client constants.ts, server constants.ts)을 그대로 되돌리고 `fly deploy -a basketballgm-app-server` 재배포.

**관련 논의**: 이전 커밋에서 어시스트 기록 확률에 걸려있던 playStyle 보정(`statsMappers.ts`의 `assistMod`)은
"패스는 패스, 어시스트는 어시스트"라는 판단 하에 별도로 제거함 (이 항목보다 먼저 진행된 변경, 별도 기록 없음 — 필요시 git log 참조).
