# 선수별 훈련 시스템 구현 플랜

## Context

현재 선수 성장/퇴화는 **경기일에만** 발생 (`processGameDevelopment`). 비경기일(rest day)에는 `applyRestDayRecovery()`로 체력만 회복하고 성장 기회가 전혀 없음. 이 빈 공간에 **GM이 지시하는 훈련 시스템**을 삽입하여, 선수별 맞춤 성장 방향을 설정할 수 있게 함.

- 훈련 = 기존 성장 파이프라인(`accumulateAndResolve` → `applyDevelopmentResult`)의 **추가 입력**, 대체가 아님
- 선수 성격(SaveTendencies)과 코칭 스탭 능력이 훈련 효과를 좌우
- 훈련 ↔ 체력 트레이드오프: 훈련할수록 체력 회복 감소

---

## A. 훈련 종류 (12개 드릴)

| # | ID | 이름 | 주 카테고리 | 보조 카테고리 | 피로 비용 | 성격 시너지 | 성격 페널티 |
|---|---|---|---|---|---|---|---|
| 1 | `SHOOTING_FORM` | 슈팅 폼 교정 | out | ins | 8 | ego>0.3, shotDiscipline>0.2 | focusDrift>0.7 |
| 2 | `THREE_POINT_CLINIC` | 3점 슈팅 클리닉 | out | - | 7 | shotDiscipline>0.2, consistency>0.7 | ego>0.6 |
| 3 | `POST_WORK` | 포스트 훈련 | ins | reb | 10 | motorIntensity>1.1 | playStyle>0.4 |
| 4 | `BALLHANDLING_LAB` | 볼핸들링 훈련 | plm | out | 8 | ballDominance>1.1 | - |
| 5 | `PASSING_WORKSHOP` | 패싱 워크샵 | plm | - | 6 | ego<-0.1, composure>0.2 | ballDominance>1.3 |
| 6 | `DEFENSIVE_DRILLS` | 수비 훈련 | def | reb | 12 | defensiveMotor>0.3, motorIntensity>1.0 | ego>0.5 |
| 7 | `REBOUNDING_CLINIC` | 리바운딩 클리닉 | reb | ins | 10 | motorIntensity>1.0 | playStyle>0.5 |
| 8 | `CONDITIONING` | 체력 훈련 | ath | - | 15 | motorIntensity>1.1 | focusDrift>0.8, ego>0.7 |
| 9 | `WEIGHT_ROOM` | 웨이트 트레이닝 | ath(str,dur) | ins | 12 | motorIntensity>1.0 | - |
| 10 | `FILM_STUDY` | 영상 분석 | out(IQ),def(IQ) | plm | 2 | focusDrift<0.3 | temperament>0.5 |
| 11 | `SCRIMMAGE` | 실전 스크리미지 | ins,plm,def | reb,ath | 14 | motorIntensity>1.0 | confidenceSensitivity>1.3 |
| 12 | `INDIVIDUAL_MENTORING` | 개인 멘토링 | (최약 카테고리) | - | 5 | consistency>0.7, ego<0.0 | ego>0.5 |

---

## B. 코칭 스탭 시스템

새 DB 테이블 없이 `GameTactics.coachingStaff`에 저장 (기존 `saves.tactics` JSON에 포함).

### 타입 정의 (`types/tactics.ts` 수정)

```typescript
export type CoachSpecialty = 'inside' | 'shooting' | 'playmaking' | 'defense' | 'rebounding' | 'conditioning';

export interface CoachProfile {
    id: string;
    name: string;
    specialty: CoachSpecialty;
    rating: number;           // 1-99
}

export interface CoachingStaff {
    headCoach: {
        id: string;
        name: string;
        overall: number;        // 1-99, 전체 훈련 효과 배율
        personalityFit: number; // 1-99, 성격 페널티 경감
    };
    assistants: CoachProfile[]; // 최대 3명
}

// GameTactics에 추가
export interface GameTactics {
    // ... 기존 필드들 ...
    coachingStaff?: CoachingStaff;
}
```

### 코치 효과 공식

```
coachMult = 0.8 + (headCoach.overall / 99) * 0.4              // 기본: 0.8~1.2
코치 전문분야 매칭 시: coachMult += (assistant.rating / 99) * 0.2  // 최대: ~1.4
```

### 코치 데이터

`data/coachData.ts`에 ~20명 고용 가능한 코치 목록 정의 (이름, 전문분야, 레이팅).
시즌 시작 시 기본 코칭 스탭 자동 배정 (overall ~65, personalityFit ~60).

---

## C. 훈련 메커닉 — 핵심 공식

### 1) 성격 호환도 계산

```typescript
function calcPersonalityScore(drill, tendencies, headCoachPersonalityFit): number {
    let score = 1.0;
    const penaltyScale = 1.0 - (headCoachPersonalityFit / 99) * 0.5;

    for (rule of drill.affinityRules) {
        tVal = tendencies[rule.tendency];
        if (rule.type === 'boost' && conditionMet) score += magnitude;
        if (rule.type === 'penalty' && conditionMet) score -= magnitude * penaltyScale;
    }
    return clamp(score, 0.4, 1.8);
}
```

### 2) 훈련 델타 계산 (속성별)

```typescript
const BASE_TRAINING_DELTA = 0.04; // 경기일 성장의 ~1/3 수준

trainingDelta = BASE_TRAINING_DELTA
    * positionMult        // primary=1.0, secondary=0.35
    * personalityScore    // 0.4~1.8
    * coachMultiplier     // 0.8~1.4
    * diminishingMult     // 시즌 누적에 따른 체감 (1.0→0.6→0.25)
    * growthMult          // 기존 천장 소프트캡 (potential+3 근처 감속)
    * simSettings.growthRate  // 글로벌 성장률 설정
```

### 3) 체감 수익 (Diminishing Returns)

`trainingAccumulators[attr]`로 시즌 내 훈련 전용 누적 추적:
- |누적| <= 3: 1.0배
- |누적| <= 6: 0.6배
- |누적| > 6: 0.25배

### 4) 체력 트레이드오프

```
순 체력 변화 = 기존 휴식 회복(+25 base) - drill.fatigueCost * (1 - stamina/200)
```
- FILM_STUDY(비용 2): 거의 풀 회복
- CONDITIONING(비용 15): 회복 미미

### 5) 결과 반영 경로

훈련 delta → `accumulateAndResolve()` → `applyDevelopmentResult()` (기존 함수 재사용)
→ `changeLog`에 `source: 'training'` 태그로 기록

---

## D. 데이터 저장/복원

### SavedPlayerState 확장 (`types/player.ts`)

```typescript
export interface SavedPlayerState {
    // 기존 필드들...
    trainingDrillId?: string | null;              // GM 지정 훈련 (null=휴식)
    trainingAccumulators?: Record<string, number>; // 시즌 훈련 전용 누적 (체감수익용)
}
```

### Player 런타임 타입 확장

```typescript
// Player에도 동일 필드 추가
trainingDrillId?: string | null;
trainingAccumulators?: Record<string, number>;
```

### AttributeChangeEvent 확장

```typescript
export interface AttributeChangeEvent {
    // 기존 필드들...
    source?: 'game' | 'training';  // 출처 구분
}
```

### 저장 경로 (2중, 기존 패턴 동일)

**roster_state** (`useGameData.ts` forceSave):
```typescript
if (p.trainingDrillId) state.trainingDrillId = p.trainingDrillId;
if (hasTrainingAcc) state.trainingAccumulators = p.trainingAccumulators;
```

**replay_snapshot** (`snapshotBuilder.ts` buildReplaySnapshot):
```typescript
growthState: {
    ...기존 4개 필드,
    ...(p.trainingDrillId && { trainingDrillId: p.trainingDrillId }),
    ...(hasTrainingAcc && { trainingAccumulators: p.trainingAccumulators }),
}
```

### 복원 경로

**hydrateFromSnapshot**: `gs.trainingDrillId`, `gs.trainingAccumulators` 읽어 player에 적용
**roster_state 복원**: 동일 패턴

### 시즌 리셋 (`processOffseason`)

```typescript
player.trainingAccumulators = {};
// trainingDrillId는 리셋 안 함 — GM 지시 유지
```

---

## E. 일진행 통합 — 핵심 훅 포인트

**위치**: `hooks/useSimulation.ts` rest day 분기 (~line 384)

```typescript
// 기존
applyRestDayRecovery(newTeams);

// 추가 (바로 뒤)
applyTrainingDay(newTeams, userTactics.coachingStaff, tendencySeed, currentSimDate, simSettings);
```

**`applyTrainingDay()` 로직**:
1. 유저 팀 선수만 순회 (CPU 팀은 훈련 없음)
2. `player.trainingDrillId`가 null이면 스킵 (풀 휴식)
3. 부상 선수 스킵 (`health !== 'Healthy'`)
4. `calculateTrainingDevelopment()` → `accumulateAndResolve()` → `applyDevelopmentResult()`
5. 체력 조정: 휴식 회복 - 훈련 피로

**batchSeasonService.ts**에도 동일 훅 적용 (시즌 일괄 시뮬용).

---

## F. UI 컴포넌트

### F.1 훈련 관리 패널 (`components/dashboard/TrainingPanel.tsx`)

DashboardView의 새 탭 `'training'` (DashboardTab 유니온에 추가).

**레이아웃**:
- 상단: 코칭 스탭 요약 (헤드코치 이름 + OVR 뱃지)
- 선수 목록 (stableSort: OVR 내림차순)
- 선수별 행:
  - 이름, 포지션, OVR
  - 드릴 셀렉터 (12개 + 휴식)
  - 성격 호환도 칩 (green/amber/red)
  - 예상 체력 변화 표시

### F.2 코칭 스탭 관리 (`components/dashboard/CoachingStaffPanel.tsx`)

훈련 패널 내 서브 섹션 또는 모달:
- 현재 헤드코치 카드 (이름, OVR 바, personalityFit 바)
- 어시스턴트 3슬롯 (전문분야 뱃지, 레이팅 바)
- 고용 가능 코치 목록 (스크롤)
- 고용 버튼 → `onUpdateTactics` 콜백으로 `coachingStaff` 갱신

### F.3 훈련 결과 표시

기존 `PlayerDetailView.tsx`의 `changeLog` ▲/▼ 표시 재활용. `source: 'training'` 태그로 게임 성장과 구분 표시 가능.

---

## G. 파일 구조

### 새로 생성할 파일

| 파일 | 역할 |
|---|---|
| `types/training.ts` | DrillId, DrillDefinition, AffinityRule 타입 |
| `services/playerDevelopment/config/drills.ts` | 12개 드릴 정의 상수 |
| `services/playerDevelopment/trainingSystem.ts` | 핵심 로직: calcPersonalityScore, calcTrainingDevelopment, applyTrainingDay |
| `data/coachData.ts` | 고용 가능 코치 ~20명 데이터 |
| `components/dashboard/TrainingPanel.tsx` | 훈련 배정 UI |
| `components/dashboard/CoachingStaffPanel.tsx` | 코칭 스탭 관리 UI |

### 수정할 기존 파일

| 파일 | 변경 내용 |
|---|---|
| `types/player.ts` | SavedPlayerState + Player에 trainingDrillId, trainingAccumulators 추가. AttributeChangeEvent에 source 추가 |
| `types/tactics.ts` | CoachingStaff, CoachSpecialty, CoachProfile 타입 추가. GameTactics에 coachingStaff 필드 추가 |
| `hooks/useSimulation.ts` | rest day 분기에 applyTrainingDay() 호출 추가 |
| `hooks/useGameData.ts` | forceSave()에 trainingDrillId, trainingAccumulators 저장 추가 |
| `services/snapshotBuilder.ts` | buildReplaySnapshot/hydrateFromSnapshot에 훈련 필드 추가 |
| `services/playerDevelopment/playerAging.ts` | processOffseason에 trainingAccumulators 리셋 추가. accumulateAndResolve의 changeEvent에 source 파라미터 추가 |
| `services/simulation/batchSeasonService.ts` | rest day에 applyTrainingDay() 호출 추가 |
| `views/DashboardView.tsx` | DashboardTab에 'training' 추가, TrainingPanel 렌더링 |

---

## H. 구현 단계

### Phase 1: 타입 + 데이터 정의
1. `types/training.ts` 생성 (DrillId, DrillDefinition, AffinityRule)
2. `services/playerDevelopment/config/drills.ts` 생성 (12개 드릴 상수)
3. `types/player.ts` 수정 (SavedPlayerState, Player, AttributeChangeEvent 확장)
4. `types/tactics.ts` 수정 (CoachingStaff 추가)
5. `data/coachData.ts` 생성 (코치 데이터)

### Phase 2: 핵심 로직
6. `services/playerDevelopment/trainingSystem.ts` 생성
7. `playerAging.ts` — accumulateAndResolve에 source 파라미터 전달, processOffseason에 trainingAccumulators 리셋

### Phase 3: 데이터 저장/복원
8. `hooks/useGameData.ts` — forceSave에 훈련 필드 저장
9. `services/snapshotBuilder.ts` — 스냅샷 빌드/복원에 훈련 필드 추가

### Phase 4: 일진행 통합
10. `hooks/useSimulation.ts` — rest day에 applyTrainingDay 호출
11. `services/simulation/batchSeasonService.ts` — 동일 적용

### Phase 5: UI
12. `components/dashboard/TrainingPanel.tsx` 생성
13. `components/dashboard/CoachingStaffPanel.tsx` 생성
14. `views/DashboardView.tsx` — training 탭 추가

---

## 검증 방법

1. **단위 테스트**: trainingSystem.ts의 calcPersonalityScore, calcTrainingDevelopment 함수에 다양한 입력으로 delta 범위 확인
2. **통합 테스트**: 비경기일 시뮬 진행 → 선수 fractionalGrowth 변화 확인
3. **UI 테스트**: 훈련 배정 → 저장 → 새로고침 → 배정 유지 확인
4. **시즌 테스트**: batchSeason으로 전체 시즌 시뮬 → trainingAccumulators 체감 수익 확인 → 오프시즌 리셋 확인
5. **changeLog 확인**: PlayerDetailView에서 training source 태그 정상 표시 확인
