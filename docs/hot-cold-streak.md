# 핫/콜드 스트릭 시스템

> 관련 파일: `services/game/engine/pbp/statsMappers.ts`, `flowEngine.ts`, `views/LiveGameView.tsx`

## 개요

선수의 최근 슈팅 결과를 추적하여 핫(연속 성공)·콜드(연속 실패) 상태를 판정하고, 슈팅 확률에 소폭 보정을 가하는 시스템. 인게임 UI에서 이모지로 상태를 시각화한다.

---

## 1. 데이터 구조 (LivePlayer)

```typescript
hotColdRating: number;      // -1.0 ~ +1.0, 초기값 0
recentShots: boolean[];     // 최근 5개 슛 결과 (순환 버퍼)
```

- `recentShots`: 최대 5개, 오래된 것부터 shift
- `hotColdRating`: 슈팅 확률 보정에 사용되는 수치

---

## 2. 레이팅 업데이트 (updateHotCold)

```typescript
// statsMappers.ts
function updateHotCold(player: LivePlayer, isMake: boolean): void {
    player.recentShots.push(isMake);
    if (player.recentShots.length > 5) player.recentShots.shift();

    const total = player.recentShots.length;
    if (total < 2) { player.hotColdRating = 0; return; }

    const makes = player.recentShots.filter(Boolean).length;
    const recentPct = makes / total;

    let streakBonus = 0;
    if (total >= 3) {
        const last3 = player.recentShots.slice(-3);
        if (last3.every(Boolean))  streakBonus = +0.15;
        if (last3.every(s => !s))  streakBonus = -0.15;
    }

    player.hotColdRating = clamp(-1, 1,
        (recentPct - 0.5) * 1.5 + streakBonus
    );
}
```

### 공식 분해

```
base = (recentPct - 0.5) × 1.5
       ─────────────────────────
       0% 성공 → -0.75
       50% 성공 → 0
       100% 성공 → +0.75

streakBonus = 마지막 3슛 전부 성공 +0.15 / 전부 실패 -0.15

hotColdRating = clamp(-1, 1, base + streakBonus)
```

### 호출 시점

- 슈팅 성공 시: `updateHotCold(actor, true)` (statsMappers.ts 134행)
- 슈팅 실패 시: `updateHotCold(actor, false)` (statsMappers.ts 197행)
- 턴오버, 파울, 자유투는 hotCold에 영향 없음

---

## 3. 슈팅 확률 보정 (flowEngine.ts — calculateHitRate)

```typescript
// 8. Hot/Cold Streak (±4% 캡)
if (actor.hotColdRating !== 0) {
    let temperatureBonus = actor.hotColdRating * 0.04;

    // 콜드 완화: offConsist가 높으면 멘탈 회복
    if (temperatureBonus < 0) {
        const consistencyRecover = (actor.attr.offConsist / 100) * 0.5;
        temperatureBonus *= (1 - consistencyRecover);
    }

    hitRate += temperatureBonus;
}
```

### 보정 범위

| hotColdRating | 기본 보정 | offConsist=80일 때 실제 보정 |
|---------------|----------|----------------------------|
| +1.0 (최대 핫) | +4.0% | +4.0% (핫은 완화 없음) |
| +0.5 | +2.0% | +2.0% |
| 0 | 0% | 0% |
| -0.5 | -2.0% | -1.2% (콜드 완화) |
| -1.0 (최대 콜드) | -4.0% | -2.4% (콜드 완화) |

### 콜드 완화 메커니즘

`offConsist`(공격 일관성)가 높은 선수는 콜드 스트릭의 영향을 덜 받는다:
- offConsist 100 → 콜드 페널티 50% 감소
- offConsist 50 → 콜드 페널티 25% 감소
- offConsist 0 → 완화 없음 (풀 페널티)

핫 보너스에는 완화가 적용되지 않음.

---

## 4. 감쇠 및 리셋

### 타임아웃 시 감쇠 (dampenHotCold)

```typescript
export function dampenHotCold(team): void {
    [...team.onCourt, ...team.bench].forEach(p => {
        p.hotColdRating *= 0.5;           // 50% 감소
        if (p.recentShots.length > 2) {
            p.recentShots = p.recentShots.slice(-3);  // 최근 3개만 유지
        }
    });
}
```

- AI 타임아웃 또는 유저 타임아웃 시 호출
- 쿼터 전환(Q1→Q2, Q2→Q3, Q3→Q4)에도 호출
- 상대 팀 포함 양팀 모두 적용

### 하프타임 리셋 (resetHotCold)

```typescript
export function resetHotCold(team): void {
    [...team.onCourt, ...team.bench].forEach(p => {
        p.hotColdRating = 0;
        p.recentShots = [];
    });
}
```

- Q2→Q3 전환(하프타임)에만 호출
- 완전 초기화 (전반 기록 무효)

### 리셋 타이밍 요약

| 이벤트 | 처리 |
|--------|------|
| 쿼터 전환 (Q1→Q2, Q3→Q4) | dampenHotCold (50% 감쇠) |
| 하프타임 (Q2→Q3) | resetHotCold (완전 초기화) |
| 타임아웃 | dampenHotCold (50% 감쇠) |
| 경기 시작 | 초기값 0, 빈 배열 |

---

## 5. UI 표시 (LiveGameView.tsx)

```tsx
// PlayerRow 컴포넌트 (LiveGameView.tsx:112-116)
{(() => {
    const s = player.recentShots;
    const len = s?.length ?? 0;
    if (len >= 3 && s.slice(-3).every(Boolean)) return '🔥 ';
    if (len >= 4 && s.slice(-4).every(v => !v)) return '❄️ ';
    return '';
})()}
{player.playerName}
```

### 이모지 표시 기준

| 상태 | 조건 | 이모지 |
|------|------|--------|
| 핫 스트릭 | 최근 **3슛 연속 성공** | 🔥 |
| 콜드 스트릭 | 최근 **4슛 연속 실패** | ❄️ |
| 중립 | 위 조건 미충족 | 표시 없음 |

**설계 의도**:
- `hotColdRating` 수치가 아닌 `recentShots` 배열의 말미(연속성)를 직접 확인
- 핫 기준(3연속)이 콜드 기준(4연속)보다 낮음 → 핫이 더 자주 표시
  - 이유: 핫 스트릭은 긍정적 피드백(볼을 더 줘야 함)이므로 민감하게 감지
  - 콜드 스트릭은 부정적 낙인이므로 확실할 때만 표시
- 표본 크기(sample size) 문제 방지: 2슛만 던져 2/2라도 핫 안 뜸

---

## 6. 케이스별 레이팅 계산 예시

| recentShots | makes | recentPct | base | streakBonus | rating |
|-------------|-------|-----------|------|-------------|--------|
| [✓,✓,✓] | 3/3 | 1.00 | +0.75 | +0.15 | **+0.90** |
| [✗,✓,✓,✓,✓] | 4/5 | 0.80 | +0.45 | +0.15 | **+0.60** |
| [✓,✓,✗,✓,✓] | 4/5 | 0.80 | +0.45 | 0 | **+0.45** |
| [✓,✗,✓,✗,✓] | 3/5 | 0.60 | +0.15 | 0 | **+0.15** |
| [✗,✗,✗] | 0/3 | 0.00 | -0.75 | -0.15 | **-0.90** |
| [✓,✗,✗,✗,✗] | 1/5 | 0.20 | -0.45 | -0.15 | **-0.60** |

핵심: 같은 4/5라도 **슛 순서**(마지막 3개의 연속성)에 따라 레이팅이 달라진다.
