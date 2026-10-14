# 멀티 세션 테이블 타이포그래피 위계 (제안, 2026-10-12)

UI 전수 감사 0-2 결정의 2단계. 1단계로 범위 내 `uppercase`(378) · `tracking-widest`(109) · `tracking-wider`(89) · `normal-case`(4)를 전부 제거한 뒤(dev-log 2026-10-12), 멀티 세션 테이블 셀의 글자 속성을 기계 집계한 결과를 바탕으로 위계를 다시 정의한다. 집계 원본: 세션 scratchpad `typo-report.md`(헤더 조합 24종 · 바디 조합 40종+).

## 1. 현재 상태 (제거 후 실측)

### 헤더 셀 — 6계열이 공존
| 조합 | 건수 | 어디 |
|---|---|---|
| `text-sm font-bold text-slate-300` | 27 | 뉴스피드 어워드류 표 |
| `text-sm font-black text-slate-500` | 20 | 로스터 7탭 · 순위 · 일정 · 리더보드 · FA · 드래프트 풀 · 트레이드 |
| `text-sm font-bold text-slate-600` | 20 | 홈 표 3개 |
| `font-bold` (크기·색 상속) | 17 | 챔피언 모달 · 개인 드래프트 포맷 |
| `text-xs font-bold text-slate-500` | 14 | 경기 샷차트 · 리그 설정 |
| `font-normal` / `text-slate-500`만 | 14 / 13 | 리그 설정 · 선수 상세 |
| `text-xs font-black text-slate-500` | 6 | **공용 Table 기본** · 코치/GM 카드 · 개인 전술 · 상대 스카우팅 |
| `text-sm font-bold text-slate-500` | 3 | 뉴스피드 박스스코어류 |

공용 `Table`의 기본값(`text-xs font-black text-slate-500`)을 실제로 따르는 화면이 거의 없고, 다수(로스터·순위·FA·트레이드)가 `tr`에서 `text-sm`으로 덮어쓴다. 즉 **실질 표준은 `text-sm font-black text-slate-500`**이고, 기본값이 틀린 쪽이다.

### 바디 셀 — 색 4단 × 굵기 4단 × 크기 2단이 자유 조합
| 역할(추정) | 쓰이는 조합 |
|---|---|
| 이름/주요 식별 | `text-sm font-semibold text-white`(로스터) · `font-bold text-slate-200`(Table player) · `text-slate-300`(피드·FA) · `text-sm font-bold text-white`(트레이드) |
| 보조 텍스트(포지션·나이·약어) | `text-sm font-semibold text-slate-500`(로스터 11) · `text-sm text-slate-400`(FA·풀 10) · `text-slate-400`(11) |
| 수치 | `tabular-nums text-slate-300 text-sm`(홈 9) · `font-mono font-bold text-slate-300`(Table stat) · `font-mono font-semibold text-xs`(스카우팅 17) · `tabular-nums`만(PBP 10) · `text-sm text-white`(로스터 10) |
| 강조 수치/합계 | `font-black text-indigo-400 text-sm`(팀 평균 라벨) · `font-bold tabular-nums text-white`(PBP 합계) · `font-black text-sm text-white`(순위 1위) |
| 빈 값 | `text-slate-600 text-sm`(4) · `text-slate-500`(혼용) |

`font-mono`는 공용 Table stat/attribute 변형과 스카우팅·챔피언 모달에만 있고, 로스터·홈·PBP·트레이드는 `tabular-nums`만 쓴다 — 같은 "숫자 열"이 두 서체로 갈린다.

## 2. 제안 위계 (6역할 + 2보조)

원칙: 테이블 안에서는 **크기 2단(12/14px) · 굵기 4단 · 회색 5단**만 쓴다. 대문자·자간 없음. 숫자는 `tabular-nums`로만 정렬하고 `font-mono`는 쓰지 않는다(폭이 다른 두 서체가 같은 열에 섞이는 것을 막기 위해).

| # | 역할 | 토큰 | 비고 |
|---|---|---|---|
| T1 | **열 제목 (thead)** | `text-sm font-bold text-slate-400` | 현행 다수 `text-sm font-black text-slate-500`에서 한 단계 밝게·한 단계 가늘게. 대문자를 뺀 뒤 `font-black`은 한글에서 뭉개지고, `slate-500`은 `slate-950` 헤더 배경에서 대비 3.3:1로 낮음. 정렬 활성 열은 `text-indigo-400`, hover `text-white` |
| T2 | **그룹/서브 헤더 행** (컨퍼런스·속성군·"공격/수비") | `text-xs font-bold text-slate-500` | 열 제목보다 한 단계 작고 어둡게. 배경 틴트는 별도 |
| B1 | **주요 식별 텍스트** (선수명·팀명) | `text-sm font-semibold text-slate-200` | 클릭 가능하면 hover `text-indigo-400 underline`. `text-white`는 B4에만 남김 |
| B2 | **보조 텍스트** (포지션·나이·약어·날짜) | `text-sm font-medium text-slate-400` | |
| B3 | **수치** (스탯·금액·기록) | `text-sm font-semibold text-slate-200 tabular-nums` | 우측 정렬. 금액은 0-4 결정에 따라 전체/회계식 |
| B4 | **강조 수치** (합계·평균·리더·1위·내 팀) | `text-sm font-bold text-white tabular-nums` | 팀 평균 라벨 셀의 `indigo-400`은 "라벨"에만, 숫자는 white |
| B5 | **빈 값 / 비활성** (`-`, 탈락 팀, 계약 없음) | `text-sm font-medium text-slate-600` | |
| F1 | **푸터/합계 행** | B4와 동일 + 행 배경 `bg-slate-950` | |
| C1 | **캡션/각주** (표 아래 단위·출처) | `text-xs font-normal text-slate-500` | 셀 안에서는 쓰지 않음 |

### 굵기 사다리
`font-normal`(캡션) < `font-medium`(보조·빈값) < `font-semibold`(기본·수치) < `font-bold`(헤더·강조) — `font-black`은 테이블 안에서 **사용 안 함**(OVR 배지 등 컴포넌트 내부 제외).

### 회색 사다리
`slate-600`(빈값) < `slate-500`(그룹 헤더·캡션) < `slate-400`(열 제목·보조) < `slate-200`(기본·수치) < `white`(강조) · 포인트 `indigo-400`(활성 정렬·리더 라벨)

### 금지 목록 (테이블 안)
- `uppercase`, `tracking-*`(tight 포함), `font-black`, `font-mono`
- 임의 px 크기 `text-[9px]`·`text-[10px]`·`text-[11px]`·`text-[13px]` → `text-xs`/`text-sm`으로
- `text-slate-300`(기본과 보조 사이 애매한 값) → B1(`slate-200`) 또는 B2(`slate-400`)로 귀속

## 3. 현행 → 제안 매핑 (치환 규칙)

| 현행 조합 | → 역할 | 건수 |
|---|---|---|
| `text-sm font-black text-slate-500` (th) | T1 | 20 + Table 기본 |
| `text-xs font-black text-slate-500` (th) | T1 | 6 |
| `text-sm font-bold text-slate-300` (피드 어워드 th) | T1 | 27 |
| `text-sm font-bold text-slate-600` (홈 th) | T1 | 20 |
| `text-xs font-bold text-slate-500` (샷차트·설정 th) | T1 (표 헤더) / T2 (속성군) | 14 |
| `font-bold` / `font-normal` 상속형 th | T1 | 31 |
| `text-sm font-semibold text-white` (이름) | B1 | 10 |
| `font-bold text-slate-200` (Table player) | B1 | 공용 |
| `text-slate-300 text-sm` / `text-slate-300` (이름·값 혼용) | B1 또는 B3 (내용별) | 25 |
| `text-sm font-semibold text-slate-500` (포지션·나이) | B2 | 11 |
| `text-slate-400 text-sm` / `text-slate-400` | B2 | 21 |
| `font-mono font-bold text-slate-300 tabular-nums` (Table stat) | B3 (mono 제거) | 공용 |
| `font-mono font-semibold text-xs` (스카우팅) | B3 | 17 |
| `tabular-nums text-slate-300 text-sm` (홈) | B3 | 9 |
| `font-black text-indigo-400 text-sm` (평균 라벨) | 라벨은 유지, 숫자 셀은 B4 | 3 |
| `font-bold tabular-nums text-white` / `font-black text-sm text-white` | B4 | 6 |
| `text-slate-600 text-sm` (`-`) | B5 | 4 |

## 4. 적용 순서

1. **공용 Table.tsx 기본값 교체** — `TableHead tr` → T1, `TableCell` default → B1, `player` → B1, `stat` → B3(`font-mono` 제거), `attribute` → B3 + colorScale 유지, `badge` 변형의 `text-[9px] font-black` → `text-xs font-bold`. 이 한 번으로 공용 Table을 쓰는 36곳의 기본 모양이 바뀐다.
2. **덮어쓰기 제거** — 로스터 7탭·순위·일정·리더보드·FA·풀·트레이드의 `<tr className="text-sm font-black text-slate-500 …">`를 지워 기본값을 따르게 함.
3. **raw `<table>` 16파일**은 Table 이관(ui-consolidation 6장) 시점에 위 역할 토큰으로 통일. 그 전까지는 th/td 클래스 문자열만 T1/B1~B5로 교체.
4. 적용 후 1280 폭에서 로스터·순위·트레이드·뉴스피드 스크린샷 비교.

## 5. 결정 (2026-10-12 확정·적용)

- T1 헤더 색 = `slate-400` ✅
- `font-mono` 완전 제거(테이블 밖 포함) ✅ — Table `mono` prop은 no-op으로 남김
- 홈 표 3개 헤더도 T1 ✅

적용 내역은 dev-log 2026-10-12 "테이블 타이포 위계 적용" 항목 참조(Table.tsx 기본값 + 스코프 72파일 스크립트 치환). 남은 수동 검토: raw `<table>` 바디 셀의 `text-white`/상수 클래스(`tdBase` 등)는 Table 이관 시 B1~B5로 통일.
