# 타임아웃 시스템 NBA 규정화 계획 (초안)

작성: 2026-10-22 / 상태: **계획 초안 — 코드 변경 없음, 결정 D1~D5 대기**

## 1. 목표
현재 "경기 전체 4회" 타임아웃을 실제 NBA 룰북(Rule No. 5, Section VI, official.nba.com 확인)에 맞춘다.

## 2. 기준 규정 (룰북 원문 발췌 확인)
| 항목 | 규정 |
|---|---|
| 정규 경기 | 팀당 7회 (전/후반 제한 없음) |
| 4쿼터 | 팀당 최대 4회 (4쿼터 진입 시 4회 초과분은 소멸) |
| 4쿼터 막판 | "4쿼터 3분 마크" 와 "4쿼터 두 번째 의무 타임아웃 종료" 중 **더 늦은 시점** 이후 팀당 최대 2회 |
| 연장 | 피리어드당 팀당 2회 |
| 의무 타임아웃 | 피리어드당 2회. 6:59 이전에 타임아웃이 없었으면 첫 데드볼에 선언 → **홈팀** 청구. 이후 2:59 이전에 없었으면 선언 → **이전에 청구되지 않은 팀** 청구 |
| 길이 | 의무 2:45(지역)/3:15(전국), 일반 1:15 |
| 미확인 | 의무 타임아웃이 7회에서 차감되는지, 연장전 의무 타임아웃 존재 여부, 미사용분 이월 여부 (발췌본에 없음) |

## 3. 현재 엔진 상태 (코드 확인 결과)
- `initializer.ts:336` `timeouts: 4` — 경기 전체 단일 카운터. 쿼터별 리필/상한 없음.
- `liveEngine.ts` `applyTimeout()` (L165) — 카운터 -1, 모멘텀 리셋, 핫/콜드 반감, 전 선수 체력 `TIMEOUT_RECOVERY(=1)` 회복, `type:'timeout'` 로그(`timeoutsLeft` 포함).
- `liveEngine.ts` `checkAITimeout()` (L201) — **유일한 트리거는 "상대 8점+ 런"**. 잔여 횟수 관리(아껴 쓰기) 없음. 유저 팀은 위임 중이 아니면 스킵.
- 호출 지점: `stepPossession()` 포세션 종료 후(L537), 유저 호출은 `useLiveGame.ts` `callTimeout()`(L263, `timeouts<=0`만 검사).
- **의무 타임아웃 없음**, 쿼터 전환(L341~) 시 타임아웃 처리 없음.
- 연장전 없음(`quarter>4`면 즉시 종료) → `docs/plan/overtime-system.md`와 연동 필요.
- 미러 쌍: `services/game/engine/pbp/` ↔ `server/src/shared/engine/pbp/`. liveEngine/initializer/pbpTypes/constants 모두 양쪽 동시 수정.
- 서버 배치 시뮬은 `autoTimeoutAllTeams`로 양 팀 모두 AI 타임아웃(`liveEngine.ts` L270, `simRunner.ts` L239).

## 4. 설계

### 4-1. 상수 (신규, `SIM_CONFIG.TIMEOUT` — 양쪽 constants.ts)
```
REGULATION_TOTAL: 7
Q4_ENTRY_MAX: 4
LATE_Q4_MAX: 2            // 3분 이후
OT_PER_PERIOD: 2
MANDATORY_FIRST_CLOCK: 419   // 6:59
MANDATORY_SECOND_CLOCK: 179  // 2:59
MANDATORY_RECOVERY: ?        // 일반 TIMEOUT_RECOVERY(1) 대비 2:45/1:15 비율 반영, 튜닝 대상
```

### 4-2. 상태 (pbpTypes.ts GameState/TeamState)
- `TeamState.timeouts`: 초기값 4 → 7.
- `GameState.mandatory`: `{ first: boolean; second: boolean }` — 현재 피리어드의 의무 타임아웃 소화 여부. 피리어드 시작 시 리셋.
- `GameState.q4LateCapApplied: boolean` — 4쿼터 막판 2회 캡 1회성 적용 플래그.

### 4-3. 쿼터 전환 훅 (`stepPossession` A 블록, L341~)
- 새 피리어드마다 `mandatory` 리셋.
- Q4 진입: `team.timeouts = min(team.timeouts, 4)` (양 팀).
- OT 진입(OT 시스템 도입 시): `team.timeouts = 2` (이월 없음 가정, D3).

### 4-4. 의무 타임아웃 (신규 `checkMandatoryTimeout`)
- `stepPossession` 포세션 종료 후, AI 타임아웃 체크 **앞**에서 호출 (포세션 경계 = 데드볼 근사).
- 로직:
  1. `!mandatory.first && gameClock <= 419` → 선언. 직전까지(또는 지금 AI/유저 타임아웃으로) 이미 타임아웃이 있었으면 소화로 간주, 없으면 강제 선언, **홈팀 청구**.
  2. `mandatory.first && !mandatory.second && gameClock <= 179` → 선언, **이전에 청구되지 않은 팀** 청구(첫 의무가 홈에 청구됐으면 원정).
- 팀이 자발적으로 부른 타임아웃도 "6:59 이전이면 첫 의무를 대체"하도록 `applyTimeout`에서 `mandatory` 플래그 갱신:
  - 피리어드 시작~6:59 사이 자발 타임아웃 → `first = true`
  - 그 이후(first=true 상태) 2:59 이전 자발 타임아웃 → `second = true`
- 의무 타임아웃 처리는 `applyTimeout(state, teamId, {kind:'mandatory'})`로 재사용하되:
  - 7회 차감 여부는 D1.
  - 효과(모멘텀 리셋/핫콜드 반감)는 D2, 체력 회복은 `MANDATORY_RECOVERY`.
  - UI 정지 없음(로그만, `StepResult.isMandatory` 추가 후 `useLiveGame`은 pause하지 않음).

### 4-5. 4쿼터 막판 2회 캡
- 조건: `quarter === 4 && gameClock <= 179 && mandatory.second` (3분 마크와 두 번째 의무 중 더 늦은 시점) 충족 시 1회, `team.timeouts = min(team.timeouts, 2)`.
- 이미 2회 이하면 변화 없음.

### 4-6. AI 타임아웃 로직 확장 (`checkAITimeout`)
현재 "8점 런이면 무조건" → 7회로 늘면 쿼터 초반에 낭비하거나 반대로 4쿼터에 못 쓰는 문제가 생김.
- 기본 트리거(8점+ 런)는 유지하되 **잔여 보유량 게이트** 추가: 잔여 > 필요 예비분일 때만 발동.
  - 예비분: Q1~Q2 3회, Q3 3~4회(아래 소멸 규칙), Q4는 제한 없이.
- **Q3 말 소멸 방지**: Q4 진입 시 4회 초과분은 소멸하므로 Q3 종반(예: 3쿼터 3분 이내) 잔여 > 4이면 런 임계값을 완화(예: 6점)해 소진 유도.
- **4쿼터 막판 전략 타임아웃**(신규, 선택): 잔여 있고 Q4 2:00 이내 5점 이내 접전에서 뒤진 팀이 공격권 시 호출. 기본 임계/빈도는 D4. 룰북 VI.7(마지막 2분 공격팀 타임아웃 시 시계 유지·백코트→프론트코트 스로인) 반영은 이번 범위 제외.
- 연장: 잔여 2회, 클러치 규칙 동일.
- 전술 책임 원칙(`feedback_tactics_responsibility`)상 유저 팀 자동 타임아웃은 기존대로 위임 중에만.

### 4-7. 유저 수동 타임아웃
- `useLiveGame.callTimeout`: `timeouts<=0` 검사는 유지(피리어드 캡은 4-3, 4-5에서 카운터로 이미 반영됨).
- `LiveGameView`: 잔여 표기는 기존 `timeoutsLeft` 그대로. 4쿼터 진입/3분 캡으로 줄어드는 경우 로그에 "타임아웃 N회 소멸" 안내(선택).

## 5. 변경 파일 목록
| 파일 (client / server 미러) | 변경 |
|---|---|
| `services/game/config/constants.ts` / `server/src/shared/game/config/constants.ts` | `SIM_CONFIG.TIMEOUT` 신규 |
| `services/game/engine/pbp/pbpTypes.ts` / server 미러 | `mandatory`, `q4LateCapApplied` 필드, `StepResult.isMandatory` |
| `services/game/engine/pbp/initializer.ts` / server 미러 | `timeouts: 4 → 7` |
| `services/game/engine/pbp/liveEngine.ts` / server 미러 | `applyTimeout` 시그니처(kind), `checkMandatoryTimeout`, 쿼터 전환 훅, 4Q 캡, `checkAITimeout` 확장 |
| `types/engine.ts` / `server/src/shared/types/engine.ts` | `PbpLog.timeoutKind?: 'team'\|'mandatory'` |
| `hooks/useLiveGame.ts` | 의무 타임아웃은 pause하지 않도록 처리 |
| `views/LiveGameView.tsx`, `views/multi/season/MultiGamePbpView.tsx` | 의무 타임아웃 로그/마커 표기 구분 |
| 인사이트 차트 타임아웃 마커 사용처 | `timeoutKind`로 일반/의무 구분(선택) |
| `docs/history/dev-log.md` | Before/After, 롤백 방법 기록 (client/server 쌍 둘 다) |

## 6. 위험 및 검증
- **밸런스 변화**: 타임아웃 7회 + 의무 8회/경기(쿼터당 2회 × 4)로 체력 회복·모멘텀 리셋 빈도가 급증 → 출전시간/피로도/득점 런 분포 변화. 기존 시뮬 하네스(`project_bigman_scoring_investigation` 메모 참고)로 수정 전/후 N경기 비교: 선수 MPG, 피로도 지표, 팀 득점, 클러치 득실.
- **의무 회복량이 크면 체력 시스템이 무력화**되므로 `MANDATORY_RECOVERY`는 보수적으로 시작(튜닝 후 확정).
- **결정론**: 새 로직은 RNG를 쓰지 않는다(상태·시계 기반). 시드 재현성 유지 확인.
- **기존 데이터 호환**: 과거 PBP 로그의 `timeoutsLeft`는 4 기준 값. 리플레이 표시는 로그 값을 그대로 쓰므로 영향 없음. 새 필드는 optional.
- **연장전**: OT 시스템 미구현이므로 OT 부분은 OT 도입 시 함께 연결(4-3의 OT 훅은 자리만 마련).
- 중첩 블록/순환 임포트/const 선언 순서 점검(CLAUDE.md 규칙), 양쪽 미러 diff로 로직 동일성 확인.

## 7. 결정 필요 사항
- **D1**: 의무 타임아웃이 팀 7회에서 차감되는가? 권장: 팀이 자발적으로 부른 것이 의무를 대체한 경우만 차감, 기록원이 강제 선언한 것은 차감 없음. (룰북 발췌에서 불명확 — 원문 확인 후 확정)
- **D2**: 의무 타임아웃의 모멘텀 리셋/핫콜드 반감 적용 여부. 권장: 적용하지 않고 체력 회복만.
- **D3**: 연장 타임아웃 이월(없음 가정) 및 연장 의무 타임아웃(없음 가정).
- **D4**: AI 4쿼터 막판 전략 타임아웃 도입 여부와 강도.
- **D5**: 4쿼터 진입 시 초과분 소멸 안내 로그 표기 여부.

## 8. 작업 순서 (제안)
1. 상수/타입/초기값(7회) + 쿼터 전환 훅(4Q 4회 캡, 막판 2회 캡) — 가장 작은 단위, 하네스로 1차 비교
2. 의무 타임아웃 + 청구 규칙
3. AI 타임아웃 예비분 로직
4. UI 표기 + dev-log + 최종 하네스 검증
5. (OT 도입 시) 연장 2회 연결

## 9. 팀파울 관련 결정 (2026-10-22)
- 룰북 Rule 12-B-V-1 확인: 정규 피리어드 1~4번째 일반 파울은 스로인, **5번째부터 자유투 2개**. 현행 엔진(`statsMappers.ts` `defTeam.fouls > 4`)과 BONUS 배지(`fouls >= 5`)는 룰북과 일치 → 변경 없음.
- **마지막 2분 면제 규정(12-B-V-1-c)은 의도적으로 제외** (예외 처리가 많아 엔진이 복잡해진다는 사용자 판단). 이후 재제안하지 않는다.
- 연장전 "3개까지 스로인, 4번째부터 자유투"는 연장전 시스템(`overtime-system.md`) 구현 시 함께 검토.

## 10. 멀티플레이어: 유저 팀 자동 타임아웃 (2026-10-22 추가)
- 멀티는 서버 배치 시뮬이라 사람이 경기 중 타임아웃을 부를 수 없다. `server/src/simRunner.ts:240`이 `autoTimeoutAllTeams: true`를 넘기고, `createGameState`가 `isUserDelegated`로 변환하므로 **이미 유저 팀도 `checkAITimeout`으로 자동 호출**된다 (liveEngine.ts L271 client/server 동일).
- 따라서 4-6의 확장 로직(보유량 관리, Q3 말 소진, 4쿼터 막판 전략)은 **팀 구분 없이 양 팀에 동일 적용**한다. 유저 팀만 별도 분기를 두지 않는다.
- 싱글 라이브 모드(`useLiveGame`)만 유저 팀 자동 호출을 스킵하고 수동 호출을 허용한다(기존 동작 유지).
- 의무 타임아웃도 같은 이유로 서버/멀티에서 전 팀 자동 발생(4-4).
- 유저 팀이 자동 타임아웃에 영향을 주는 입력값(예: 소극/적극 성향 슬라이더)은 **이번 범위에 넣지 않는다.** 필요하면 추후 전술 설정에 추가(전술 책임 원칙: 결과는 유저 책임, 엔진 자동 보정 금지).
- 검증: 멀티 서버 경로(simRunner → workers → liveEngine)에서 양 팀 타임아웃 횟수·소멸·의무 발생이 로그로 확인되는지, 서버 미러(`server/src/shared/engine/pbp/`)와 diff 일치.

## 11. 구현 결과 (2026-10-22)
결정: D1 의무도 7회 차감(양 팀 분담), D2 의무도 모멘텀 리셋+체력 회복, D3 연장 제외, D4 전략 타임아웃 포함, D5 안내 로그 없음+AI가 초과분 소진. 구현·롤백 방법은 `docs/history/dev-log.md` 2026-10-22 "타임아웃 NBA 규정화" 항목 참고.
