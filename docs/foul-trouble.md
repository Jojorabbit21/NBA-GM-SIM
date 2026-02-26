# 파울 트러블 관리 시스템

> 관련 파일: `services/game/engine/pbp/substitutionSystem.ts`, `rotationLogic.ts`, `liveEngine.ts`

## 개요

파울이 쌓인 선수를 쿼터·파울 수·선수 중요도에 따라 차등적으로 벤치시키고, 조건 충족 시 자동 복귀시키는 시스템. NBA 감독의 파울 매니지먼트 전략을 시뮬레이션한다.

---

## 1. 선수 중요도 분류 (classifyPlayerImportance)

```typescript
type PlayerImportance = 'star' | 'rotation' | 'bench';
```

| 등급 | 조건 |
|------|------|
| **star** | 팀 전체 OVR 상위 3위 이내 **+** 선발 선수 |
| **rotation** | 선발이지만 OVR 상위 3위 밖 |
| **bench** | 비선발 선수 |

- 상위 3위 기준: 코트 + 벤치 전체 선수 중 OVR 내림차순 3번째 값
- 중요도가 높을수록 파울 트러블에서도 복귀 기회를 더 많이 부여

---

## 2. 파울 트러블 의사결정 매트릭스

`evaluateFoulTroubleAction()` — quarter × fouls × importance → 행동 결정

### 행동 코드

| 코드 | 설명 | returnMinute |
|------|------|--------------|
| STAY | 계속 기용 | - |
| REST_N | N분 휴식 후 자동 복귀 | currentMinute + N |
| HALF | 전반 끝까지 휴식, 후반에 복귀 | 24 (Q3 시작) |
| GAME | 경기 나머지 출전 안함 | null |
| BRIEF | 3분만 휴식 후 복귀 | currentMinute + 3 |

### Q1 (1쿼터)

| 파울 수 | Star | Rotation | Bench |
|---------|------|----------|-------|
| 2 | REST_6 | REST_6 | REST_6 |
| 3 | HALF | HALF | GAME |
| 4+ | HALF | GAME | GAME |

### Q2 (2쿼터)

| 파울 수 | Star | Rotation | Bench |
|---------|------|----------|-------|
| 3 | REST_6 | REST_6 | GAME |
| 4 | HALF | HALF | GAME |
| 5+ | HALF | GAME | GAME |

### Q3 (3쿼터)

| 파울 수 | Star | Rotation | Bench |
|---------|------|----------|-------|
| 4 | REST_6 | REST_6 | GAME |
| 5+ | REST_4 | GAME | GAME |

### Q4 (4쿼터)

| 파울 수 | Star (비클러치) | Star (클러치) | Rotation | Bench |
|---------|----------------|--------------|----------|-------|
| 4 | STAY | STAY | STAY | STAY |
| 5 | BRIEF (3분) | STAY | STAY | GAME |

- **클러치 = Q4 42분 이후 (잔여 6분 이하)**
- Q4에서는 거의 벤치하지 않음 — 실제 NBA 감독 행동과 일치
- 5파울 스타도 클러치에서는 강행 기용 (6번째 파울 도박)

---

## 3. NBA 시나리오 매핑

### 시나리오 1: Q1에 3파울 스타터
- 매트릭스: Q1 / 3파울 / Star → **HALF** (returnMinute = 24)
- 동작: 전반 동안 벤치, Q3 시작 시 복귀
- NBA 현실: 감독이 전반을 희생하고 후반에 최대 기용

### 시나리오 2: Q4 10분경 4파울 스타터
- 매트릭스: Q4 / 4파울 / Star → **STAY**
- 동작: 계속 기용 (Q4에서 4파울은 위험하지 않음)
- 5파울이 되면 비클러치 시 BRIEF (3분 쉬고 복귀)

### 시나리오 3: Q2에 3파울 벤치 선수
- 매트릭스: Q2 / 3파울 / Bench → **GAME** (returnMinute = null)
- 동작: 남은 경기 출전 안함
- NBA 현실: 생산성 낮은 선수를 파울 위험 안고 기용할 이유 없음

### 시나리오 4: Q4 클러치에서 5파울 스타
- 매트릭스: Q4 / 5파울 / Star / 클러치 → **STAY**
- 동작: 파울아웃 위험을 감수하고 계속 기용
- NBA 현실: 승부처에서 에이스를 빼는 감독은 없음

---

## 4. 교체 파이프라인에서의 위치

```
checkSubstitutionsV2() — 우선순위:

Priority 1: 부상 / 6파울 퇴장         → 영구 퇴장 (permanent)
Priority 2: 탈진 (condition ≤ 20)     → 임시 벤치 (temporary)
Priority 3: 파울 트러블 (매트릭스)      → 임시 또는 영구
Priority 4: 가비지 타임               → 영구 퇴장

※ 유저가 rotationMap에 해당 분을 명시적으로 true로 설정한 경우,
   Priority 2(탈진)와 Priority 3(파울 트러블)은 스킵됨 (유저 의사 존중)
```

### SubRequestV2 타입

```typescript
interface SubRequestV2 {
    outPlayer: LivePlayer;
    reason: string;
    exitType: 'permanent' | 'temporary';
    returnMinute?: number | null;
    benchReason: 'foul_trouble' | 'shutdown' | 'injury' | 'foul_out' | 'garbage' | null;
}
```

---

## 5. 임시 벤치 실행 (benchWithOverride)

파울 트러블로 벤치되는 경우 `benchWithOverride()`가 호출됨:

1. 아웃 선수의 로테이션 맵을 `returnMinute`까지만 Filler에게 전이
2. `returnMinute` 이후 슬롯은 `originalRotationMap`에서 복원
3. `activeOverrides` 스택에 추적 기록 생성
4. 선수에 `benchReason: 'foul_trouble'` + `scheduledReturnMinute` 설정

**vs 영구 퇴장 (`forceSubstitution`)**:
- 영구 퇴장은 승계 로직 실행 + 잔여 맵 영구 비움
- 임시 벤치는 원본 맵 보존 + 복귀 후 자동 복원

---

## 6. 자동 복귀 판정 (checkTemporaryReturns)

매 포세션마다 실행. 파울 트러블로 벤치된 선수의 복귀 판정:

```
currentMinute >= scheduledReturnMinute?
    ├─ YES → evaluateFoulTroubleAction() 재평가
    │        ├─ 아직 위험 → returnMinute 연장, 계속 대기
    │        └─ 안전 → 맵 복원, 복귀 준비
    └─ NO → 계속 대기
```

- 복귀 전에 반드시 **재평가**를 수행
- 예: Q1에 2파울로 벤치 → 6분 후 복귀 예정이었지만, 그 사이 쿼터가 변했으면 새 기준 적용
- 물리적 투입은 `checkAndApplyRotation`이 맵 기반으로 처리

---

## 7. 파울 관련 수비 페널티 (constants.ts)

파울이 많이 쌓인 선수가 코트에 남아있을 때의 수비 약화:

```typescript
FOUL_TROUBLE: {
    PROB_MOD: { 3: 0.85, 4: 0.60, 5: 0.30 },   // 파울 시도 확률 감소
    DEF_PENALTY: { 3: 0.0, 4: 0.15, 5: 0.40 }   // 수비 효율 페널티
}
```

| 파울 수 | 파울 시도 확률 | 수비 페널티 |
|---------|--------------|-----------|
| 3 | 85% (15% 자제) | 0% |
| 4 | 60% (40% 자제) | 15% 약화 |
| 5 | 30% (70% 자제) | 40% 약화 |

- `PROB_MOD`: 파울이 많은 수비자는 적극적 수비(파울 유발 가능한 행동)를 자제
- `DEF_PENALTY`: 파울 자제로 인한 수비 효율 감소 (공격자에게 유리)
- 이 페널티는 벤치 여부와 무관하게 코트 위에 있으면 적용됨

---

## 8. 중복 처리 방지

```typescript
// checkSubstitutionsV2 — 154-156행
team.onCourt.forEach(p => {
    if (p.benchReason) return;  // 이미 처리 중인 선수 스킵
    ...
});
```

- `benchReason`이 이미 설정된 선수는 중복으로 교체 요청을 생성하지 않음
- 복귀 후 `benchReason`이 null로 초기화되어야 다음 파울 트러블 감지 가능

---

## 9. 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| 벤치 중 파울 추가 | 불가능 — 벤치 선수는 파울 안 받음 |
| 복귀 직후 즉시 파울 | 다음 포세션에서 재감지 → 새 override 생성 |
| Filler도 파울 트러블 | handleFillerExit → 원래 선수 복귀 가능 여부 확인 → 불가능하면 새 Filler |
| GAME 판정 후 뎁스 부족 | 벤치 불가, 계속 기용 (뎁스 소진 안전장치) |
| Q1 4파울 Star → HALF → Q3 복귀 시 재평가 | Q3 기준으로 4파울 = REST_6 → 다시 6분 더 쉬어야 할 수 있음 |
