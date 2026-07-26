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

#### 4. Full Court Press 보정 **[2026-07-26 하향 조정: 45% → 15%]**
```
if (fullCourtPress > 1):
    pressPenalty = (fullCourtPress - 1) × (0.15 / 9)
    drain × (1.0 + pressPenalty)
```
기존엔 대가 없이 체력만 깎는 구조였으나, 이제 온볼 스틸/패싱레인 스틸/비강제턴오버 유발/샷클락 위반 보너스(→ `pbp-engine.md` "전술 슬라이더 영향 정리" 참고)와 짝을 이루는 하이리스크 하이리턴 트레이드오프로 재설계 — 체력 페널티 자체는 그 대가로 45%→15%로 낮췄다.

| fullCourtPress | 추가 소모 |
|---------------|----------|
| 1 | 0% |
| 2 | +1.67% |
| 3 | +3.33% |
| 4 | +5.00% |
| 5 | +6.67% |
| 6 | +8.33% |
| 7 | +10.00% |
| 8 | +11.67% |
| 9 | +13.33% |
| 10 | +15.00% |

#### 4.5. defIntensity 보정 **[2026-07-26 신규]**
타이트한 수비(수비강도 슬라이더↑)일수록 체력을 더 많이 쓰고, 느슨한 수비는 체력을 아낀다는 트레이드오프를 추가.
```
intensityFatigueMod = interpolateCurve(defIntensity, DEF_INTENSITY_CURVE)   // [[1,5],[10,-8]] 선형보간, %p
drain × (1 - intensityFatigueMod / 100)
```
| defIntensity | 체력 보정 | 드레인 배율 |
|---|---|---|
| 1 | +5.00%p (절약) | ×0.950 |
| 2 | +3.56%p | ×0.964 |
| 3 | +2.11%p | ×0.979 |
| 4 | +0.67%p | ×0.993 |
| 5 | -0.78%p | ×1.008 |
| 6 | -2.22%p | ×1.022 |
| 7 | -3.67%p | ×1.037 |
| 8 | -5.11%p | ×1.051 |
| 9 | -6.56%p | ×1.066 |
| 10 | -8.00%p (추가 소모) | ×1.080 |

4~5단계 사이가 손익분기점(두 점(1→+5, 10→-8) 선형보간이라 5.5 대칭이 아님). `fullCourtPress`와 별개로 곱해지므로 두 슬라이더 모두 높으면 체력 소모가 중첩된다.

#### 4.6. 헬프 디펜스 보정 **[2026-07-26 전면 재설계]**
헬프를 "시도"한 선수(성공 여부 무관)에게만 추가 체력 소모를 적용하는 개인별 트레이드오프. 팀 전체가 아니라 그 포제션에 지정된 헬퍼 1인에게만 곱연산.
```
if isHelpDefender:
    helperDrainMult = 1.10 + (helpDef - 1) × (0.15 / 9)
    drain × helperDrainMult
```
| helpDef | 헬퍼 추가 소모율 |
|---|---|
| 1 | ×1.100 (+10%) |
| 2 | ×1.117 (+11.7%) |
| 3 | ×1.133 (+13.3%) |
| 4 | ×1.150 (+15.0%) |
| 5 | ×1.167 (+16.7%) |
| 6 | ×1.183 (+18.3%) |
| 7 | ×1.200 (+20.0%) |
| 8 | ×1.217 (+21.7%) |
| 9 | ×1.233 (+23.3%) |
| 10 | ×1.250 (+25.0%) |

헬퍼는 매 포제션 존별 포지션 풀(Rim/Paint→C·PF·SF, Mid→PG·SG·SF·PF, 3PT→PG·SG·SF)에서 랜덤으로 지정되며, 헬프 시도 확률 자체도 helpDef 슬라이더에 비례(1단계 10% ~ 10단계 80%, `pbp-engine.md` "2.5단계" 참고). `PossessionResult.helpDefenderId` → `stateUpdater.ts` → 이 함수의 `isHelpDefender` 인자로 전달된다.

#### 4.7. 수비 리바운드 속공 트레이드오프 **[2026-07 신규]**
`defReb`를 5단계 미만으로 낮추면 리바운드 다툼에 인원을 덜 투입하고 먼저 뛰쳐나간다는 설정 — 매 포제션 상시, 팀 전체 온코트 5인에게 균일 적용(속공 발생 여부와 무관, 지속적인 팀 스타일로 반영).
```
if defReb < 5:
    fatiguePenalty = (5 - defReb) × (1.5 / 4)   // %p
    drain × (1 + fatiguePenalty / 100)
```
| defReb | 체력 페널티 |
|---|---|
| 1 | +1.500%p |
| 2 | +1.125%p |
| 3 | +0.750%p |
| 4 | +0.375%p |
| 5~10 | 0.000%p |

이 페널티의 대가로 속공(Transition) 선택확률·성공률 보너스가 붙는다 — `pbp-engine.md` "수비 리바운드 속공 트레이드오프" 섹션 참고.

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
기본 확률 = max(0.3, 2.5 - durability × 0.02) / 10000
피로 보너스:
  체력 < 50: (50 - condition) × 0.5 / 10000
  체력 < 15: 추가 (15 - condition) × 2.0 / 10000
총 확률 = (기본 + 피로 보너스) × injuryFrequency / 10000
```

| 체력 | dur 50 | dur 70 | dur 90 |
|------|--------|--------|--------|
| 100 | 0.015% | 0.011% | 0.007% |
| 50 | 0.015% | 0.011% | 0.007% |
| 30 | 0.115% | 0.111% | 0.107% |
| 15 | 0.215% | 0.211% | 0.207% |
| 0 | 0.545% | 0.541% | 0.537% |

한 경기 ~200포세션 기준, 체력 100 유지 시 경기당 약 1~1.5% 확률로 부상 발생.
시즌 리그 전체 약 300건, 팀당 평균 ~10건/시즌.

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
