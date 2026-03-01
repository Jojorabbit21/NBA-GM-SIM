# Time Engine (timeEngine.ts)

## 개요
포세션당 소요 시간을 계산. Pace 슬라이더, 플레이 타입, 게임 상황(2-for-1, 클러치 시간 끌기)을 반영.

**파일**: `services/game/engine/pbp/timeEngine.ts`
**호출 위치**: `possessionHandler.ts` → 매 포세션 시작 시

---

## 핵심 함수: `calculatePossessionTime`

### 1. 기본 시간 (Pace 슬라이더)
```
timeTaken = 21 - pace
```
| Pace | 기본 시간 |
|------|----------|
| 1 (최저) | 20초 |
| 5 (보통) | 16초 |
| 10 (최고) | 11초 |

### 2. 플레이 타입 보정
| 플레이 타입 | 보정 | 이유 |
|------------|------|------|
| Transition | -5초 | 패스트브레이크 |
| PostUp, Iso | +2초 | 전개 시간 필요 |
| CatchShoot, Cut | -1초 | 빠른 액션 |
| Putback | **별도 처리** | 2~4초 (즉시 액션) |
| 기타 | ±0 | |

### 3. 2-for-1 상황
```
if (gameClock 30~45초):
    timeTaken = min(timeTaken, 6)  // 빠른 슛 강제
```

### 4. 시간 범위 제한
| 플레이 타입 | 최소 | 최대 |
|------------|------|------|
| Transition | 4초 | 23초 |
| 기타 | 8초 | 23초 |

### 5. 랜덤 분산
```
timeTaken += random(-1.5, +1.5)
```

### 6. 클러치 시간 끌기
```
조건: Q4+ AND gameClock ≤ 300초(5분) AND 리드 AND 10점차 이내
효과: timeTaken = max(timeTaken, 18)  // 최소 18초 사용
```

### 7. 최종 안전 검사
```
timeTaken = max(3, min(timeTaken, gameClock))  // 잔여 시간 초과 방지
return round(timeTaken)
```

---

## 유틸리티: `formatTime`
```typescript
formatTime(seconds: number): string  // 예: 720 → "12:00"
```
- PBP 로그의 시간 표시에 사용
- `stateUpdater.ts`, `statsMappers.ts` 등 여러 곳에서 import

---

## 수정 시 주의사항
- Putback은 별도 분기로 처리됨 (2~4초 고정)
- 시간은 fatigue 계산의 입력값이므로 변경 시 체력 밸런스에 영향
- 2-for-1 로직은 쿼터 종료 직전 공격 템포에 직접 영향
