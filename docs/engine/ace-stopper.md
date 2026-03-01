# Ace Stopper System (aceStopperSystem.ts)

## 개요
에이스 스토퍼(수비 전담 선수)가 상대 에이스에 대해 발휘하는 수비 효과를 계산.
결과값은 에이스의 FG%를 보정하는 퍼센트 modifier (-50% ~ +40%).

**파일**: `services/game/engine/aceStopperSystem.ts`
**호출 위치**: `possessionHandler.ts` → 에이스 대상 슈팅 시 hitRate 보정

---

## 핵심 함수: `calculateAceStopperImpact`

### 입력
- `ace: Player` — 상대 에이스
- `stopper: Player` — 수비 전담 선수
- `stopperMinutesPlayed: number` — 스토퍼의 누적 출전시간

### 출력
- `-50` ~ `+40` 범위의 정수 (%)
- **음수**: 에이스 FG% 감소 (스토퍼 승리)
- **양수**: 에이스 FG% 증가 (스토퍼 패배)

---

## 7단계 계산 과정

### 1. 에이스 아키타입 식별 (`identifyArchetype`)

| 아키타입 | 조건 | 핵심 피지컬 |
|----------|------|-----------|
| **Speedster** | speed+agility 평균 ≥ 90 & 최고 | 스피드 |
| **Bully** | strength ≥ 85 & speed보다 높음 | 근력 |
| **Shooter** | vertical+agility 평균이 최고 | 점프력+민첩 |
| **Balanced** | 위 조건 미충족 | 종합 피지컬 |

### 2. Physical Matchup Delta (피지컬 전쟁)

아키타입별로 비교하는 능력치가 다름:
```
Speedster: (stopper speed+agility)/2 - (ace speed+agility)/2
Bully:     stopper.strength - ace.strength
Shooter:   (stopper vertical+agility)/2 - (ace vertical+agility)/2
Balanced:  (stopper spd+agi+str)/3 - (ace spd+agi+str)/3
```

### 3. Technical Matchup Delta (스킬 전쟁)
```
techStopper = perDef × 0.6 + helpDefIq × 0.2 + steal × 0.2
techAce     = offConsist × 0.5 + shotIq × 0.3 + handling × 0.2
techDelta   = techStopper - techAce
```

### 4. Base Impact Score
```
baseImpact = physicalDelta × 0.6 + techDelta × 0.4
```
피지컬 60%, 스킬 40% 비중.

### 5. The Motor (허슬 보정)
- 스토퍼가 지고 있을 때 (`baseImpact < 0`):
  - `random(0~100) < stopper.hustle` 성공 시 → `(hustle - 50) × 0.3` 회복
- 스토퍼가 이기고 있을 때:
  - `(hustle - 50) × 0.1` 추가 (Clamp 효과)

### 6. Fatigue Penalty (체력 감쇠)
```
delta = aceCond - stopperCond  (에이스 체력이 더 높으면 양수)
minutesTax = mp > 30 ? (mp - 30) × 0.5 : 0

penalty = delta > 0 ? delta × 0.5 + minutesTax : max(0, minutesTax)
finalScore = baseImpact - penalty
```

### 7. 최종 변환
```
matchupEffect = -(finalScore × 1.2)
return clamp(-50, +40, round(matchupEffect))
```
부호 반전: 스토퍼 승리(+score) → 에이스 FG% 감소(-effect)

---

## 예시 시나리오

| 상황 | 결과 |
|------|------|
| 엘리트 스토퍼 vs 스타 (체력 동등) | -15% ~ -25% |
| 미스매치 (스토퍼 열세) | +10% ~ +30% |
| 스토퍼 체력 고갈 (30분+) | 효과 급감 |
| hustle 90 스토퍼 | 열세에서도 회복 가능 |

---

## 수정 시 주의사항
- 이 함수는 `Player` 타입(flat)을 사용, `LivePlayer`(attr nested) 아님
- possessionHandler에서 호출 시 LivePlayer → Player 변환이 필요할 수 있음
- `matchupEffectSum`/`matchupEffectCount`는 `statsMappers.ts`에서 누적 추적
- 스토퍼 지정은 전술 설정(`tactics.stopperId`)에서 관리
