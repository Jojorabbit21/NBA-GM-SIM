# 멀티플레이어 AI 단장 프로필 계획

작성: 2026-10-20 · 상태: **G1·G2 순수 모듈 완료(미사용), 프런트 데이터 마이그레이션 준비(미적용), 성향 재평가·G3 표시 위치 대기**
관련: `docs/plan/multi-ai-trade-plan.md`(AI 트레이드 — 이 프로필을 판단 입력으로 사용), `services/tradeEngine/gmProfiler.ts`·`types/gm.ts`(싱글 단장 모델, 수정하지 않음)

---

## 0. 결정 사항 (2026-10-19~20 사용자 확정)

| # | 항목 | 결정 |
|---|---|---|
| P1 | 단장 배정 | `meta_gms`의 실제 단장을 팀 슬러그로 고정. 유저가 나가 AI 팀이 되면 실제 단장이 다시 맡음 (저장 없이 매번 슬러그로 조회 → 자동) |
| P2 | 단장 모델 | 싱글의 성격 유형/그룹을 판단에 직접 쓰지 않고 **수치 4개**(승부욕·깐깐함·로스터 구성 성향·부상 감수)로 변환. 성격 유형·슬라이더는 수치를 만드는 재료로만 사용 |
| P3 | 스타 선호 | 별도 수치로 두지 않고 **로스터 구성 성향**으로 대체 (이중 계산 방지) |
| P4 | 화면 표시 | **A안**: 단장 이름 + 로스터 구성 성향 라벨 + 현재 기조. 싱글 성격 라벨(리빌더 등)은 멀티에서 실제 효과가 없으므로 표시하지 않음. 실존 인물에 대한 서술형 키워드는 만들지 않음 |
| P5 | 현재 상황 모드 | 표시함. "순위 상황 × 승부욕"으로 결정 |
| P6 | 사장/단장 표기 | AI 팀은 사장·단장을 **함께 표기**, 성향은 **프런트 단위로 하나** (사람 개인이 아니라 구단 프런트의 성향 — 근거도 구단 거래 이력) |
| P7 | 근거 약한 이름 | 저장·표시하지 않음 (null). 기준: 2026년 보도 또는 Hoops Rumors 2026-09 목록으로 확인된 이름만 |
| P8 | LAC | 프랭크 자격정지(2026-09, 6개월) 기간의 대행 체제(사장 대행 트렌트 레든 · 단장 대행 마크 휴즈) |
| P9 | 싱글 대표 이름 | 사장 우선, 없으면 단장 |

---

## 1. 현황 (코드·DB 확인)

- `meta_gms`(team_id, gm_name, personality_type, sliders jsonb): 30행, 멀티 `league_teams.team_slug` 30개와 소문자로 1:1 일치. RLS: authenticated 읽기 허용.
- 성격 분포: balanced 6 / starHunter 6 / winNow 5 / rebuilder 5 / youthMovement 4 / valueTrader 4. `defenseFocused`는 타입에만 있고 해당 단장 없음.
- 슬라이더는 성격별로 뭉쳐 있음 (같은 성격 안에서 편차 1~2점). 균형형과 가치형은 수치가 거의 같음 → 성격 유형이 기본값, 슬라이더가 미세 조정을 맡도록 변환식 설계.
- 멀티에는 성장·노화, 계약 만료, 픽 거래, 성적 기반 로터리가 없음 → `youthBias`, `pickWillingness`는 지금 쓸 데가 없음.
- 팀 전력: `services/multi/powerRanking.ts`(서버 미러 `server/src/shared/multi/powerRanking.ts`)의 `powerScore` — 레이팅 기반 11개 모듈 + 로테이션 출전 시간 가중, 0~100 리그 백분위. 유저가 보는 파워랭킹과 같은 값.
- 기존 진출 확률(`playoffRaceUtils.computeRaceOdds`)은 시즌 마지막 30일 전용이고 `Math.random()` 몬테카를로라 렌더마다 값이 흔들림 → 단장 상황 판단에는 쓰지 않고 **결정론적 계산**을 새로 둠. 직행/플레이인 구간 규칙(`getRaceZones`)만 동일하게 따름.

---

## 2. G1 — 단장 수치 (`aiGmProfile.ts`)

| 수치 | 범위 | 변환식 | 쓰임 |
|---|---|---|---|
| 승부욕 `competitiveness` | 0.1~0.9 | 성격 기본값 + 0.05 × (aggressiveness − 5) | 포기 시점(상황 판단), 전력 변화 비중, 현재 기조 라벨 |
| 깐깐함 `strictness` | −0.03~+0.03 | 성격 기본값 − 0.004 × (aggressiveness − 5) | 수락 기준선 보정 |
| 로스터 구성 성향 `rosterStyle` | 0.2~0.8 | 0.2 + 0.6 × (starWillingness − 1) / 9 | 0 = 뎁스형, 1 = 스타 집중형 (양 끝은 매핑에서 배제) |
| 부상 감수 `injuryRiskTolerance` | 0.1~0.9 | riskTolerance / 10 | 부상 선수 할인 완화 (부상 켜진 리그만) |

성격별 기본값:

| 성격 | 승부욕 | 깐깐함 |
|---|---|---|
| winNow | 0.75 | −0.01 |
| starHunter | 0.70 | −0.01 |
| balanced | 0.50 | 0 |
| defenseFocused | 0.50 | 0 |
| valueTrader | 0.45 | +0.02 |
| rebuilder | 0.30 | +0.01 |
| youthMovement | 0.25 | +0.01 |

- 결측 슬라이더는 5, 알 수 없는 성격은 balanced로 처리.
- 로스터 구성 성향 라벨: < 0.4 **뎁스 중심** / 0.4~0.6 **균형** / > 0.6 **스타 중심**.
- `youthBias`, `pickWillingness`는 읽기만 하고 사용하지 않음. 성장·픽 거래가 생기면 수치 추가.

## 3. G2 — 시즌 상황과 현재 기조 (`aiTeamSituation.ts`)

### 3-1. 예상 성적 (결정론)
```
pStr     = 0.30 + 0.40 × powerScore/100            // 전력 기반 기대 승률 0.30~0.70
pFuture  = (wins + 20 × pStr) / (played + 20)       // 전력을 20경기분 사전값으로 둔 베이지안 혼합
projPct  = (wins + remaining × pFuture) / (played + remaining)
```
- 시즌 초반엔 전력 위주, 경기가 쌓일수록 실제 성적 위주로 자연스럽게 이동.

### 3-2. 플레이오프 라인과 격차
- 컨퍼런스별 `projPct` 순위 (동률은 슬러그 오름차순).
- 진출 라인 순위 `lastK` = 플레이인 켜짐 ? `playoffTeamsPerConf + 2` : `playoffTeamsPerConf` (`getRaceZones`와 동일).
- `linePct` = lastK위와 lastK+1위 `projPct`의 평균. `gapGames = (projPct − linePct) × 총경기수`.
- 불확실성 `σ = √[(0.5√remaining)² + (remaining × 0.08 × 20/(played+20))²]` (남은 경기 운 + 전력 추정 오차), 최소 1.
- `z = gapGames / σ`.

### 3-3. 상황 판정 (단장마다 포기 시점이 다름)
| 상황 | 조건 |
|---|---|
| 우승 후보 `contender` | 리그 전체 `projPct` 상위 4팀 && z ≥ 1.0 |
| 중위권 `middle` | z ≥ 1.0 (우승 후보 아님) |
| 경계권 `bubble` | 포기선 ≤ z < 1.0 |
| 탈락권 `out` | z < 포기선 |

포기선 = −(0.4 + 1.6 × 승부욕) → 승부욕 0.25면 −0.8σ에서 포기, 0.9면 −1.84σ까지 버팀.

### 3-4. 현재 기조 라벨 (상황 × 승부욕 구간)
승부욕 구간: 높음 ≥ 0.65 / 보통 / 낮음 < 0.35

| 상황 | 높음 | 보통 | 낮음 |
|---|---|---|---|
| 우승 후보 | 우승 올인 | 우승 도전 | 우승 도전 |
| 경계권 | 총력전 | 순위 경쟁 | 관망 |
| 중위권 | 보강 모색 | 관망 | 관망 |
| 탈락권 | 반등 시도 | 관망 | 정리 중 |

- 정규시즌 종료 후·트레이드 데드라인 이후에는 기조를 표시하지 않음 (트레이드가 불가능하므로).

## 4. G3 — 화면 표시 (위치 결정 대기)

"새 제안" 탭은 현재 사람이 운영하는 팀만 상대로 고를 수 있어(`humanTargetTeams`), AI 트레이드가 켜지기 전엔 그 헤더에 AI 단장이 나타나지 않음. 후보 위치:

| 위치 | 비고 |
|---|---|
| 트레이드 "리그 블록" 표의 AI 팀 행 | AI 팀은 "요청 사항"이 항상 "없음" → 그 칸에 단장 정보를 표시 |
| 팀 로스터 화면 상단 | AI 팀일 때만 |
| 팀 호버 카드 (`teamHoverData.ts`) | 팀 이름이 나오는 모든 곳에서 확인 가능 |
| "새 제안" 상대 팀 헤더 | AI 트레이드 활성화 이후 |

표시 형식: `롭 펠린카 · 스타 중심 · 반등 시도` — 숫자는 노출하지 않음.

## 5. 파일

| 파일 | 내용 |
|---|---|
| `services/multi/aiGmProfile.ts` (원본) ↔ `server/src/shared/multi/aiGmProfile.ts` (미러) | G1. 외부 import 없음 — 두 파일은 헤더 주석만 다름 |
| `services/multi/aiTeamSituation.ts` (원본) ↔ `server/src/shared/multi/aiTeamSituation.ts` (미러) | G2. 외부 import 없음, `powerScore`는 호출부가 파워랭킹에서 넘김 |

## 6. 프런트 데이터 (2026-27) — `migrations/meta_gms_front_office_2026_27.sql`

- 컬럼: `president_name/title`(농구 운영 최고 책임자, 겸직이면 여기에 '사장 겸 단장' 등), `gm_name/title`(최고 책임자와 다른 단장일 때만), `profile_basis`, `verified_at`. `gm_name` NOT NULL 해제 + "둘 중 하나는 있어야 함" CHECK.
- 저장하지 않은 단장(근거가 위키백과 목록뿐): MIA 엘리스버그, IND 뷰캐넌, ORL 파커, UTA 재닉, DET 블랙스톤, WAS 도킨스. 공석·미확인: ATL, BOS, CHI, NO, NYK, PHI.
- **적용 순서: 클라 배포(사장 우선 코드) → 마이그레이션.** 반대로 하면 배포 전까지 싱글 단장 이름이 17팀에서 비어 보임.
- 성향 재평가 대상(수장 교체): ATL, CHI, DAL, DEN, DET, LAC, NO, PHI, PHX, SAC, UTA — 구단 최근 거래 이력을 웹으로 확인해 근거와 함께 정하고, 근거가 부족하면 balanced.

## 7. 검증
- 30명 전원 변환 결과 표 출력 → 범위·라벨 분포 확인
- 상황 판정: 개막 전 / 시즌 중반 / 막판 가상 순위로 라벨 분포 확인, 같은 입력 → 같은 출력
- 미러 두 파일 diff가 헤더 주석뿐인지 확인
