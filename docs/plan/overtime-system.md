# 연장전(Overtime) 시스템 기획 (초안)

작성: 2026-10-19 / 상태: **기획 초안 — 코드 변경 없음, 결정 사항 확정 대기**

## 1. 현재 엔진 상태 (코드 확인 결과)

### 1-1. 연장전이 없는 이유
- `liveEngine.ts` `stepPossession()`: 4쿼터 종료(`gameClock<=0 && quarter>=4`) → `state.quarter = 5` → `_handleGameEnd()` 즉시 호출. (L345, L519)
- `_handleGameEnd()`: 동점이면 **가짜 버저비터 1포제션**(`minHitRate 0.75`)으로 승부를 가름. 실패하면 `+1점`을 강제 부여(`buildBuzzerFallbackMessage`). 즉 현재 "동점 종료"는 연장전 대용 땜질.
- `isGameEnd` 주석이 `quarter > 4`로 못 박혀 있음.

### 1-2. 이미 연장전을 가정한 곳 (재사용 가능)
- `server/src/liveGameView.ts` `computeQuarterScoresFromEvents()` — 쿼터 번호 5=OT1, 6=OT2 … 가변 칸 지원
- `views/PlayerDetailView.tsx` `quarterLabel` — `OT${q-4}` 표기, 클러치 필터에 "4쿼터/연장전" 포함
- `timeEngine.ts` 클러치 시간 끌기, `liveEngine.ts` `isQ4Plus` 클러치 — `quarter >= 4`라 OT에도 그대로 적용됨

### 1-3. "48분 고정" 가정이 박힌 곳 (OT 도입 시 수정 대상)
| 영역 | 위치 | 문제 |
|---|---|---|
| 로테이션 맵 | `rotationMap: Boolean[48]` (initializer, rotationLogic, substitutionSystem, liveEngine 다수) | OT 분(48~)에 해당하는 슬롯 없음. `Math.min(47, …)` 클램프로 마지막 1분 슬롯만 재사용됨 |
| 수동 교체 | `applyManualSubstitution` `quarterEndMin = quarter*12` | OT에서 잘못된 값 |
| 로테이션 기록 닫기 | `_handleGameEnd` `GAME_END_SEC = 48*60` | OT 출전 선수 out 시각 오류 → 출전 시간 계산 오류 |
| 시계 변환 | `currentTotalSec = (quarter-1)*720 + …` (liveEngine/rotationLogic 다수), `utils/gameClock.ts` `toGameSeconds` | OT는 5분이라 `(q-1)*720`이 틀림 |
| 리플레이 | `liveGameView.ts` `TOTAL_GAME_SECONDS=2880`, `REPLAY_DURATION_MS=10분`, `MultiGamePbpView.tsx` 동일 상수 | OT가 길어지면 재생 속도가 빨라지거나 시각 매핑이 깨짐 |
| 쿼터 점수 | `utils/simulationUtils.ts` `extractQuarterScores` | `[n,n,n,n]` 튜플, OT를 Q4에 합산 |
| 교체 클러치 | `substitutionSystem.ts:147` `quarter === 4 && minute >= 42` | OT 제외됨 |
| 하프타임 판정 | `useLiveGame.ts` `quarter === 2 ? 'halftime'` | OT 휴식 구분 필요 |
| 타임아웃 | 경기 전체 4회(`initializer.ts:336`), 쿼터별 리필 없음 | OT 추가분 규칙 필요 |
| 쿼터 시작 포제션 | 쿼터 전환 시 `state.possession` 그대로 유지 | OT 시작 점프볼 개념 없음 |

### 1-4. 미러 쌍 주의
`services/game/engine/pbp/` ↔ `server/src/shared/engine/pbp/` (import 확장자만 다르고 로직 동일). **OT 로직은 반드시 양쪽에 동시 반영.** `server/src/liveGameView.ts`는 서버 전용, `utils/*`는 클라 전용.

## 2. 설계 방향 (권장안)

### 2-1. 기본 규칙
- 4쿼터 종료 시 동점이면 **5분 연장 쿼터** 진행, 여전히 동점이면 반복 (쿼터 번호 5, 6, 7 …)
- 안전장치: OT 상한(권장 **10회**). 상한 도달 시에만 기존 버저비터 폴백 사용 (무한 루프 방지)
- 가짜 버저비터 로직은 "상한 도달 시 폴백"으로 격하

### 2-2. 쿼터 길이 일반화
- `quarterLength(q)` 헬퍼: `q<=4 → 720`, `q>=5 → 300`
- `quarterStartSec(q)`: 누적 시작 시각 (`q<=4: (q-1)*720`, `q>=5: 2880 + (q-5)*300`)
- `totalGameSec(lastQuarter)`로 전체 길이 산출 → `(quarter-1)*720` 계산식을 전부 이 헬퍼로 교체. 클라/서버 미러 + `utils/gameClock.ts` 공통 사용

### 2-3. OT 시작 처리 (쿼터 전환 블록 확장)
- 시계 300초, 샷클락 24, 팀 파울 리셋 (현재 쿼터 전환과 동일)
- 점프볼로 소유권 결정 (권장: 센터급 신장/점프 능력 반영한 가중 확률, 최소안은 50/50). 로그 "연장 N 시작 — 점프볼"
- 모멘텀 리셋, Hot/Cold 반감(`dampenHotCold`)
- 체력 회복: 쿼터 휴식(1.5)보다 짧게 신규 상수 `OT_BREAK_RECOVERY` (권장 1.0, 튜닝 대상)
- 타임아웃: OT 시작 시 팀당 추가 지급 (**NBA 실제 규칙 웹 검증 필요** — 미확인 상태로 수치 확정하지 않음)

### 2-4. 로테이션 처리 (가장 큰 설계 결정)
`rotationMap` 저장 포맷(Boolean[48])은 유저 저장 데이터·RotationGanttChart와 묶여 있어 **바꾸지 않는다.**
- 권장안 **A**: OT 분 `k`(0~4)를 슬롯 `43+k`(4쿼터 마지막 5분 패턴)에 매핑. 접전 마무리 라인업이 OT에도 이어지고, 체력·파울·부상 비상 교체(`checkSubstitutionsV2`)가 위에 얹힘. 저장 포맷 변경 없음
- 대안 B: 전부 슬롯 47 고정(현재 클램프 동작) — 구현 최소지만 OT 5분 내내 마지막 1분 라인업 고정
- 대안 C: 맵을 48+5n으로 확장 — 저장/UI 파급 큼, 비권장

### 2-5. 기록·출전시간
- `rotationHistory` in/out은 경기 누적 초 기준 → `GAME_END_SEC`를 실제 종료 시각(`totalGameSec`)으로 교체하면 박스스코어 MIN에 OT가 자동 반영되는지 확인 필요(minutes 산출 경로는 구현 단계에서 추적)
- 쿼터 점수: `QuarterScores`를 가변 길이 배열로. 싱글 `extractQuarterScores`는 서버의 `computeQuarterScoresFromEvents` 방식으로 통일 가능
- 로그 라벨: `4쿼터`/`연장 N` 표기 통일 (기존 `OT${q-4}` 재사용)
- 파울: 6반칙 퇴장 유지, 팀 파울은 OT 시작 시 리셋 (NBA는 OT 팀 파울을 4쿼터와 합산하지 않고 별도 → 현재 쿼터 리셋 구조와 일치)

### 2-6. 멀티플레이어 리플레이
현재 `경기 초 / 2880 * 10분` 선형 매핑. OT가 있으면 선택지:
- **권장**: 재생 시간을 `총 경기 초 / 2880`에 비례해 늘림 (OT 5분 = 리플레이 약 1분 연장) — 스케줄러 슬롯 길이 여유 확인 필요
- 대안: 10분 고정 압축 — 속도가 달라져 OT가 있는 경기만 빨라 보임

## 3. 단계별 구현 계획

| 단계 | 내용 | 비고 |
|---|---|---|
| P0 | **기준선 측정**: 현재 엔진에서 4쿼터 종료 동점 발생률 측정(1,000경기+). NBA 실제 OT 비율(약 6%대, 웹 검증 후 확정)과 비교 | 시뮬 하네스는 기존 방식 재사용. 이 값이 "연장 빈도" 현실성의 출발점 |
| P1 | 엔진 코어: 쿼터 길이 헬퍼, `stepPossession` OT 루프, 점프볼, 체력/타임아웃/파울 처리, 버저비터 폴백 격하 | 클라+서버 미러 동시, dev-log 필수 |
| P2 | 시간축 소비처: rotationHistory, 로테이션 맵 매핑, 수동 교체, `gameClock.ts`, 서버 `TOTAL_GAME_SECONDS` 동적화 | |
| P3 | 표시: 쿼터 스코어보드 OT 칸, PBP 라벨, 박스스코어 MIN, 리플레이 길이 | 싱글 `useLiveGame` 휴식 UI 포함 |
| P4 | 검증: 대량 시뮬로 OT 비율·OT 중 득점/체력/출전시간 분포·무한 OT 없음 확인 | |
| P5 (선택) | 정규시간 막판 현실성: 3점 차 추격 시 파울 작전 등 "동점 만들기" 행동 | OT 빈도에 영향 큼. 별도 기획 |

## 4. 결정이 필요한 항목

1. **OT 길이/상한**: 5분 고정, 상한 10회(권장) 맞는지
2. **로테이션**: 2-4의 A안(4쿼터 마지막 5분 패턴 재사용) 채택 여부
3. **점프볼**: 단순 50/50 vs 신장·점프 반영
4. **타임아웃**: 현재 경기당 4회 구조를 그대로 두고 OT 추가분만 줄지, NBA 규정에 맞춰 전체 재설계할지
5. **멀티 리플레이 길이**: 비례 연장(권장) vs 고정 압축
6. **적용 범위**: 정규시즌·플레이오프 공통(권장). 올스타 경기는 별도 엔진 여부 확인 후 제외 권장
7. **P5(정규시간 막판 전략) 포함 시점**: 1차 범위 포함 여부

## 5. 리스크
- **기록 오염**: 시즌 누적 스탯(경기당 평균, MIN)은 OT 때문에 소폭 변동 — 의도된 동작이나 per-48 류 계산(리그 정규화, 어드밴스드 스탯)이 48 고정이면 보정 필요. P2에서 `leagueNormalization.ts`, 어드밴스드 스탯 계산부 grep 점검 필요
- **미러 불일치**: 클라/서버 한쪽만 수정 시 결과가 어긋남
- **리플레이 시각 매핑**: 기존 저장된 경기(OT 없음)는 영향 없어야 함 → `totalGameSec`는 이벤트에서 파생해 하위 호환 유지
- **체력 밸런스**: 5분 추가는 주전 탈진을 유발. `OT_BREAK_RECOVERY` 튜닝 필요
