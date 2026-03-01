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

### 부상 시스템 (현재 비활성화)
- `INJURIES_ENABLED = false` (stateUpdater.ts:39)
- 활성화 시: condition < 15에서 `(15 - condition) × 5 / 10000` 확률로 부상
- 부상 종류: Ankle Sprain, Hamstring Strain, Knee Soreness, Calf Strain, Back Spasms

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
- 모든 상수는 `constants.ts → SIM_CONFIG.FATIGUE`에서 관리
- `currentCondition`은 0~100 범위 (0=완전 소진, 100=만충)
- 체력이 hitRate에 미치는 영향은 `flowEngine.ts`에서 처리 (이 파일 외부)
- 부상 시스템 활성화 시 `stateUpdater.ts:39`의 `INJURIES_ENABLED` 변경
