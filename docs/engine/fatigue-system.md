# Fatigue System (fatigueSystem.ts + stateUpdater.ts)

## 개요
선수 체력(currentCondition) 소모 및 회복을 관리하는 시스템.
포세션마다 코트 위 선수는 체력이 소모되고, 벤치 선수는 회복된다.

**파일**:
- `services/game/engine/fatigueSystem.ts` — 소모/회복 계산 함수
- `services/game/engine/pbp/stateUpdater.ts` — 매 포세션마다 적용하는 오케스트레이터

---

## 체력 소모 (`calculateIncrementalFatigue`)

### 기본 소모량
```
drain = (timeTakenSeconds / 60) × DRAIN_BASE(2.5)
```

### 보정 요소

#### 1. Stamina 보정 (선수 능력치)
```
staminaMitigation = (stamina - 50) / 100
drain × (1 - staminaMitigation × 0.30)
```
| stamina | 효과 |
|---------|------|
| 30 | +6% 소모 증가 |
| 50 | 기준 (변화 없음) |
| 90 | -12% 소모 감소 |

#### 2. Back-to-Back 보정
`isB2B = true` → drain × 1.5

#### 3. Ace Stopper 보정
에이스 스토퍼 지정된 선수 → drain × 1.3

#### 4. Full Court Press 보정
```
if (fullCourtPress > 1):
    pressPenalty = (fullCourtPress - 1) × 0.05
    drain × (1.0 + pressPenalty)
```
| fullCourtPress | 추가 소모 |
|---------------|----------|
| 1 | 0% |
| 5 | +20% |
| 10 | +45% |

#### 5. 누적 피로 가속
```
cumulativeFatiguePenalty = 1.0 + max(0, (100 - currentCondition) × 0.012)
drain × cumulativeFatiguePenalty
```
체력이 낮을수록 소모가 가속됨 (condition 50 → +60% 가속).

### 부상 시스템

**파일**: `fatigueSystem.ts` (확률 판정), `stateUpdater.ts` (등급/종류 결정), `initializer.ts` (경기 전 보정)

SimSettings의 `injuriesEnabled`로 ON/OFF 제어. `injuryFrequency`(기본 1.0)로 전체 빈도 배율 조절.

#### 부상 발생 확률 (포세션당)

모든 체력 구간에서 기본 확률이 존재하며, 체력 저하 시 추가 확률이 누적된다.

```
기본 확률 = max(0.5, 5 - durability × 0.04) / 10000
피로 보너스:
  체력 < 50: (50 - condition) × 0.8 / 10000
  체력 < 15: 추가 (15 - condition) × 3.0 / 10000
총 확률 = (기본 + 피로 보너스) × injuryFrequency / 10000
```

| 체력 | dur 50 | dur 70 | dur 90 |
|------|--------|--------|--------|
| 100 | 0.030% | 0.022% | 0.014% |
| 50 | 0.030% | 0.022% | 0.014% |
| 30 | 0.190% | 0.182% | 0.174% |
| 15 | 0.330% | 0.302% | 0.274% |
| 0 | 0.870% | 0.842% | 0.814% |

한 경기 ~200포세션 기준, 체력 100 유지 시 경기당 약 4% 확률로 부상 발생.

#### 부상 등급 (3단계, durability 가중치)

부상 발생 시 durability 기반으로 등급을 결정:

```
시즌아웃 임계값 = max(1, 12 - durability × 0.12)
중증 임계값 = 시즌아웃 임계값 + max(10, 40 - durability × 0.3)
나머지 = 경증
```

| durability | 경증 | 중증 | 시즌아웃 |
|-----------|------|------|---------|
| 50 | 60% | 30% | 10% |
| 70 | 72% | 24% | 4% |
| 90 | 84% | 14% | 2% |

#### 부상 종류 및 결장 기간

**경증 (Minor)**
| 부상명 | 결장 기간 |
|-------|----------|
| 발목 염좌 | 당일 복귀(2일), 3일, 1주 |
| 무릎 통증 | 당일 복귀(2일), 3일, 1주 |
| 허리 경직 | 당일 복귀(2일), 3일, 1주 |
| 타박상 | 당일 복귀(2일), 3일, 1주 |
| 손가락 염좌 | 당일 복귀(2일), 3일, 1주 |

**중증 (Major)**
| 부상명 | 결장 기간 |
|-------|----------|
| 햄스트링 부상 | 2주, 3주, 1개월 |
| 종아리 부상 | 2주, 3주, 1개월 |
| 발목 인대 손상 | 2주, 3주, 1개월 |
| 허리 경련 | 2주, 3주, 1개월 |
| 어깨 부상 | 2주, 3주, 1개월 |
| 사타구니 부상 | 2주, 3주, 1개월 |

**시즌아웃 (Season-Ending)**
| 부상명 | 결장 기간 |
|-------|----------|
| 전방십자인대(ACL) 파열 | 시즌아웃(180일) |
| 아킬레스건 파열 | 시즌아웃(180일) |
| 골절 | 시즌아웃(180일) |
| 반월판 파열 | 시즌아웃(180일) |

#### 경기 시작 전 부상 선수 처리 (initializer.ts)

1. **선발 제외**: 로테이션맵/뎁스차트/OVR순 모든 선발 결정 경로에서 부상 선수 필터링
2. **로테이션 시간 승계**: 부상 선수의 출전 시간을 뎁스차트 기반으로 백업 선수에게 이전
   - 같은 포지션 다음 순번 → 뎁스차트에 없으면 OVR순 건강한 선수로 fallback
   - 부상 선수의 로테이션맵 전체 false 처리

#### 부상 복귀 (`processInjuryRecovery`)

매일 경기 전에 실행. `returnDate <= currentDate`인 선수를 자동 회복시키고, 유저 팀은 복귀 보고서 메시지 발송.

#### 부상 보고서 (인박스 메시지)

- **부상 발생 시**: `[부상 보고] 선수명 — 부상명` (경증/중증/시즌아웃 표시 + 결장 기간 + 복귀 예정일)
- **복귀 시**: `[복귀 보고] 선수명 — 훈련 복귀`
- 서신 형식, 서명: "수석 트레이너 / Head Athletic Trainer"

---

## 체력 회복 (`calculateRecovery`)

### 공식
```
recovery = baseAmount × (1 + staminaBonus × 0.30 + durabilityBonus × 0.20)
```
- `staminaBonus = (stamina - 50) / 100`
- `durabilityBonus = (durability - 50) / 100`

| stamina/durability | 회복 배수 |
|-------------------|----------|
| 30 / 30 | ×0.90 (-10%) |
| 50 / 50 | ×1.00 (기준) |
| 90 / 90 | ×1.20 (+20%) |

### 회복 상황별 baseAmount
| 상황 | 상수 | 값 |
|------|------|------|
| 벤치 회복 | `BENCH_RECOVERY_RATE` | 3.0 /분 |
| 타임아웃 | `TIMEOUT_RECOVERY` | 1 |
| 쿼터 휴식 | `QUARTER_BREAK_RECOVERY` | 1.5 |
| 하프타임 | `HALFTIME_RECOVERY` | 5 |

---

## stateUpdater.ts (`updateOnCourtStates`)

매 포세션마다 호출되어 양 팀의 체력/출전시간을 업데이트.

### 처리 순서
1. **코트 위 선수** (onCourt):
   - `p.mp += timeTaken / 60` (출전시간 누적)
   - `calculateIncrementalFatigue()` → drain 계산
   - `p.currentCondition = max(0, currentCondition - drain)`
2. **벤치 선수** (bench):
   - `baseAmount = (timeTaken / 60) × BENCH_RECOVERY_RATE`
   - `calculateRecovery(p, baseAmount)` → 개인별 회복
   - `p.currentCondition = min(100, currentCondition + recovery)`
   - Shutdown 해제: `isShutdown && condition > 70` → `isShutdown = false`

---

## 수정 시 주의사항
- 모든 체력 상수는 `constants.ts → SIM_CONFIG.FATIGUE`에서 관리
- `currentCondition`은 0~100 범위 (0=완전 소진, 100=만충)
- 체력이 hitRate에 미치는 영향은 `flowEngine.ts`에서 처리 (이 파일 외부)
- 부상 ON/OFF: `SimSettings.injuriesEnabled` (stateUpdater.ts에서 체크)
- 부상 빈도 배율: `SimSettings.injuryFrequency` (fatigueSystem.ts에 전달)
- 부상 등급/종류 결정: `stateUpdater.ts` — durability 기반 가중치
- 기간 문자열→일수 변환: `userGameService.ts → durationToDays()` (레거시 영문 호환 유지)
- 경기 전 부상 선수 보정: `initializer.ts` — 선발 제외 + 로테이션 승계
