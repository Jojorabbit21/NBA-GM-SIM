# 선수별 개인 전술 지침 (Per-Player Tactical Instructions)

> **상태**: 미구현 (설계 완료, 추후 구현 예정)
> **작성일**: 2026-03-09

## Context

현재 매치엔진의 17개 TacticalSliders는 **전부 팀 레벨**이고, 선수별 제어는 로테이션/뎁스차트/스토퍼 정도로 제한됨. 한편 엔진 내부에는 이미 `SaveTendencies` 13개가 선수별로 동작 중이나, 이는 시드 기반 자동 생성 값으로 **GM이 제어할 수 없음**.

GM이 선수별로 전술 지침을 배정할 수 있되, 선수의 고유 성향(히든 텐던시)과 **coachability**에 따라 지침 순응도가 달라지며, **본성에 반하는 지침**일수록 반항 확률이 높아지는 시스템을 구현.

---

## Part 1: 전술 지침 항목 (3개)

### 공격 전술 지침 (2개)

---

#### A-1. playStyle — 패스 퍼스트 vs 스코어 퍼스트

| 항목 | 내용 |
|------|------|
| **GM 지시 범위** | -1.0 (패스 퍼스트) ~ +1.0 (스코어 퍼스트) |
| **오버라이드 대상** | `SaveTendencies.playStyle` |
| **엔진 위치** | playTypes.ts:212-217 + statsMappers.ts:158 |
| **coachability** | `offCoachability²` |
| **maxGap** | 2.0 (범위 -1.0~+1.0) |
| **Rebellion** | O |

**적용 공식 (2곳)**:
1. **액터 선택 가중치** (playTypes.ts:212-217):
   - Iso/PostUp: `weight *= (1 + ps × 0.3)` → ps=+1.0이면 **+30%** 가중치
   - PnR_Handler/Handoff: `weight *= (1 - ps × 0.2)` → ps=-1.0이면 **+20%** 가중치
   - CatchShoot/Cut: 영향 없음 (리시버 역할)
2. **어시스트 확률** (statsMappers.ts:158):
   - `assistMod = playStyle × -0.10` → ps=-1.0이면 어시스트 확률 **+10%**

**예상 효과 (정량적)**:
- ps=+1.0: Iso 시도 ~30% 증가, PostUp ~30% 증가, 어시스트 확률 -10%
- ps=-1.0: PnR_Handler ~20% 증가, Handoff ~20% 증가, 어시스트 확률 +10%
- 경기당: Iso/PostUp 2~4회 증감, AST 0.5~1.5개 변동

**Rebellion 시나리오**:
> **히든: +0.8 (스코어러) → GM 지침: -0.5 (패스 퍼스트)**
> - contraryGap = 1.3 → contraryFactor = 0.65
> - coachability 0.25: rebellionChance = (0.5-0.25)×0.6×0.65 = **9.75%**
> - 반항 발동 시: Iso/PostUp 가중치가 블렌딩된 ~-0.2 대신 **히든 +0.8** 적용
> - 결과: PnR/Handoff 대신 iso 선택, 볼 무브 깨짐
> - NBA 비유: Phil Jackson이 삼각 오펜스 지시 → Kobe가 iso로 전환

> **히든: -0.6 (패서) → GM 지침: +0.5 (슛 더 쏴라)**
> - 반항 발동 시: 슛 기회에 본능적으로 패스 → 자신의 FGA 감소
> - NBA 비유: Ricky Rubio에게 "슛 쏴도 돼" → 습관적으로 패스

---

#### A-2. shotZoneWeights — 슛 존 비중 오버라이드

| 항목 | 내용 |
|------|------|
| **GM 지시 범위** | shot_3pt, shot_mid, shot_rim 각각 1-10 |
| **오버라이드 대상** | 팀 슬라이더의 30% 비중 (`TacticalSliders.shot_3pt/mid/rim`) |
| **엔진 위치** | playTypes.ts:67-69 `selectZone()` |
| **적용 공식** | `score(zone) = playerDNA × 0.70 + (sliderValue/10) × 0.30` |
| **블렌딩** | 초기화 시 슬라이더 값 교체 |
| **Rebellion** | X (정적 적용) |

**예상 효과 (정량적)**:
- 팀 기본 shot_3pt=5에서 선수별 9로 변경 시:
  - 3PT 존 점수: `DNA×0.70 + 0.5×0.30` → `DNA×0.70 + 0.9×0.30`
  - 30% 비중 내에서 **+0.12** 증가 → 전체 zone 선택 확률 약 **5~8%** 이동
- 선수 DNA가 70%를 차지하므로 극적 변화는 아님
- 주 용도: DNA가 균형적인(어느 존이든 비슷한) 선수에 방향 부여
- 반대로 3PT DNA가 높은 슈터에게 shot_3pt=2 지정 → 3PT 비율 다소 감소하지만 DNA가 지배적

---

### 수비 전술 지침 (1개)

---

#### D-1. defensiveMotor — 수비 노력/적극성

| 항목 | 내용 |
|------|------|
| **GM 지시 범위** | -1.0 (소극적) ~ +1.0 (적극적) |
| **오버라이드 대상** | `SaveTendencies.defensiveMotor` |
| **엔진 위치** | flowEngine.ts:130 |
| **적용 공식** | `defRating = baseDefRating + defensiveMotor × 3` |
| **coachability** | `min(defCoachability, 0.4)²` (경계 영역 — 최대 16% 블렌딩) |
| **maxGap** | 2.0 |
| **Rebellion** | O |

**예상 효과 (정량적)**:
- defRating에 ±3pt 가감 → 비선형 공방 계산에 투입
- ±3pt defRating ≈ 상대 FG% 약 **±0.5~0.8%** 변동 (per possession)
- 경기당 약 30~40 수비 포세션에서 주수비자:
  - +1.0: 약 0.2~0.3개 추가 miss → 경기당 **~0.5~0.7점** 절약
  - -1.0: 반대로 ~0.5~0.7점 추가 허용
- `defConsist` 보정(L134)과 독립 작동

**Rebellion 시나리오**:
> **히든: -0.7 (수비 태만) → GM 지침: +0.8 (적극 수비해)**
> - contraryGap = 1.5 → contraryFactor = 0.75
> - 경계 영역 coachability 상한 0.4 → rebellionChance 최대 = (0.5-0.4)×0.6×0.75 = **4.5%**
> - 반항 발동 시: defRating `+2.4` 대신 `-2.1` → **4.5pt 수비력 낙차**
> - 결과: 해당 포세션에서 상대 FG% 약 +1.5~2%
> - NBA 비유: "수비 뛰어!" → James Harden이 볼워칭

> 경계 영역이므로 rebellion 확률 자체가 낮음 (최대 ~9%). 코칭이 본성을 완전히 바꾸진 못하지만, 약간의 개선은 가능.

---

### 제외 항목 및 사유

| 항목 | 제외 사유 |
|------|---------|
| `ballDominance` | playStyle로 간접 제어 가능 (score-first → 자연스럽게 볼 점유 증가) |
| `shotDiscipline` | "아무 슛이나 던져라"는 지시 자체가 비현실적. BQ 영역 |
| `foulProneness` | 파울 성향은 지시로 바뀌는 게 아닌 BQ 영역 |
| `guardAssignment` | 5v5 매치업은 엔진 복잡도 증가 → 추후 별도 구현 |

---

## Part 2: 핵심 설계 원칙

### 1. Coachability (공수 분리)
```
offCoachability = (shotIq + passIq) / 200 × 0.4 + offConsist/100 × 0.3 + (1 - egoNorm) × 0.3
defCoachability = (helpDefIq + passPerc) / 200 × 0.4 + defConsist/100 × 0.3 + (1 - egoNorm) × 0.3
// ego: SaveTendencies (-1~+1) → egoNorm = (ego+1)/2 → 0~1
```

**예시 선수 coachability 추정**:
| 선수 유형 | offCoachability | defCoachability |
|----------|:--------------:|:--------------:|
| 엘리트 시스템 (Chris Paul형) | **0.87** | **0.82** |
| 평범한 역할선수 | **0.65** | **0.60** |
| 재능있지만 이기적 (Westbrook형) | **0.37** | **0.35** |
| 낮은 IQ 자유분방형 | **0.30** | **0.28** |

### 2. 비선형 블렌딩 커브 (제곱)
```
effectiveCoachability = coachability²
```
| raw | effective | 실효 블렌딩 |
|:---:|:---------:|:---:|
| 0.87 | 0.76 | GM 76%, 히든 24% |
| 0.65 | 0.42 | GM 42%, 히든 58% |
| 0.37 | 0.14 | GM 14%, 히든 86% |
| 0.30 | 0.09 | GM 9%, 히든 91% |

### 3. Contrary Rebellion (맥락적 반항)
```
contraryGap = |gmInstruction - hiddenTendency|
contraryFactor = min(1, contraryGap / maxGap)
rebellionChance = max(0, (0.5 - coachability) × 0.6) × contraryFactor
```

**Rebellion 확률 매트릭스**:

| | contraryFactor 0.2 | 0.5 | 0.8 | 1.0 |
|---|:---:|:---:|:---:|:---:|
| **coach 0.87** | 0% | 0% | 0% | 0% |
| **coach 0.50** | 0% | 0% | 0% | 0% |
| **coach 0.40** | 1.2% | 3.0% | 4.8% | 6.0% |
| **coach 0.30** | 2.4% | 6.0% | 9.6% | 12.0% |
| **coach 0.20** | 3.6% | 9.0% | 14.4% | 18.0% |

→ coachability ≥ 0.5이면 **절대 반항 없음**. ≤ 0.3 + 반대 방향이면 경기당 약 3~8회 반항.

### 4. 전술 항목 분류

| 항목 | 블렌딩 | 반항 | maxGap |
|------|--------|:---:|:------:|
| `playStyle` | `offCoachability²` | O | 2.0 |
| `shotZoneWeights` | 정적 교체 (블렌딩 없음) | X | - |
| `defensiveMotor` | `min(defCoach,0.4)²` | O | 2.0 |

---

## Part 3: 구현 계획

### Step 1: 타입 정의 추가
**파일: types/tactics.ts**

```typescript
export interface PlayerInstruction {
    // 공격
    playStyle?: number;         // -1.0~+1.0 (패스퍼스트~스코어퍼스트)
    shotZoneWeights?: {
        shot_3pt?: number;      // 1-10
        shot_mid?: number;
        shot_rim?: number;
    };
    // 수비
    defensiveMotor?: number;    // -1.0~+1.0 (소극적~적극적)
}

export type PlayerInstructionMap = Record<string, PlayerInstruction>;
```

`GameTactics`에 필드 추가:
```typescript
playerInstructions?: PlayerInstructionMap;
```

### Step 2: Coachability + Rebellion 유틸리티
**파일: utils/coachability.ts (신규)**

```typescript
export interface CoachabilityScores {
    off: number;  // 0~1
    def: number;  // 0~1
}

export function calculateCoachability(attr: LivePlayer['attr'], ego: number): CoachabilityScores;

export function blendInstruction(gm: number | undefined, hidden: number, coachability: number): number;
// → effectiveCoach = coachability²; return gm × effective + hidden × (1 - effective)

export function resolveWithRebellion(
    gm: number | undefined,
    hidden: number,
    blended: number,
    coachability: number,
    maxGap: number
): number;
// → gm undefined → blended 즉시 반환
// → contraryGap → rebellionChance → roll → rebellion이면 hidden, 아니면 blended
```

### Step 3: LivePlayer 타입 확장
**파일: services/game/engine/pbp/pbpTypes.ts**

`LivePlayer`에 추가:
```typescript
playerZoneSliders?: { shot_3pt: number; shot_mid: number; shot_rim: number };
rawTendencies: SaveTendencies;
coachability: { off: number; def: number };
gmInstruction?: PlayerInstruction;
```

### Step 4: initializer.ts 수정
**파일: services/game/engine/pbp/initializer.ts**

L125 (`tendencies: tendencySeed ? ...`) 교체:

```typescript
const rawTendencies = tendencySeed
    ? generateSaveTendencies(tendencySeed, p.id)
    : DEFAULT_TENDENCIES;

const instruction = safeTactics.playerInstructions?.[p.id];
const coach = calculateCoachability(attr, rawTendencies.ego);

// playStyle 블렌딩 (offCoachability²)
// defensiveMotor 블렌딩 (min(defCoachability, 0.4)²)
const tendencies = instruction
    ? applyPlayerInstruction(rawTendencies, instruction, coach)
    : rawTendencies;

// 선수별 존 슬라이더 오버라이드
const playerZoneSliders = instruction?.shotZoneWeights
    ? {
        shot_3pt: instruction.shotZoneWeights.shot_3pt ?? safeTactics.sliders.shot_3pt,
        shot_mid: instruction.shotZoneWeights.shot_mid ?? safeTactics.sliders.shot_mid,
        shot_rim: instruction.shotZoneWeights.shot_rim ?? safeTactics.sliders.shot_rim,
    }
    : undefined;
```

`applyPlayerInstruction` 함수:
```typescript
function applyPlayerInstruction(raw: SaveTendencies, instr: PlayerInstruction, coach: CoachabilityScores): SaveTendencies {
    return {
        ...raw,
        playStyle: blendInstruction(instr.playStyle, raw.playStyle, coach.off),
        defensiveMotor: blendInstruction(instr.defensiveMotor, raw.defensiveMotor, Math.min(coach.def, 0.4)),
    };
}
```

### Step 5: 엔진 Rebellion 체크포인트 (2곳)

#### 5-1. playStyle — playTypes.ts:212
```typescript
// Before:
const ps = p.tendencies?.playStyle ?? 0;
// After:
const ps = resolveWithRebellion(
    p.gmInstruction?.playStyle, p.rawTendencies.playStyle,
    p.tendencies.playStyle, p.coachability.off, 2.0
);
```

#### 5-2. defensiveMotor — flowEngine.ts:130
```typescript
// Before:
let defRating = baseDefRating + (defender.tendencies?.defensiveMotor ?? 0) * 3;
// After:
const effectiveDM = resolveWithRebellion(
    defender.gmInstruction?.defensiveMotor, defender.rawTendencies.defensiveMotor,
    defender.tendencies.defensiveMotor, defender.coachability.def, 2.0
);
let defRating = baseDefRating + effectiveDM * 3;
```

### Step 6: 선수별 존 셀렉션
**파일: services/game/engine/pbp/playTypes.ts**

`resolvePlayAction()` 상단에 헬퍼:
```typescript
const getEffectiveSliders = (p: LivePlayer) =>
    p.playerZoneSliders ? { ...sliders, ...p.playerZoneSliders } : sliders;
```
모든 `selectZone()` 호출에서 `sliders` → `getEffectiveSliders(actor)`.

---

## 수정 파일 요약

| 파일 | 변경 내용 |
|------|---------|
| types/tactics.ts | `PlayerInstruction` (3 필드), `PlayerInstructionMap`; `GameTactics.playerInstructions?` |
| utils/coachability.ts **(신규)** | `calculateCoachability`, `blendInstruction`, `resolveWithRebellion` |
| services/game/engine/pbp/pbpTypes.ts | `LivePlayer`에 4개 필드 추가 |
| services/game/engine/pbp/initializer.ts | L125 블렌딩 + `applyPlayerInstruction` |
| services/game/engine/pbp/playTypes.ts | L212 rebellion; `getEffectiveSliders` |
| services/game/engine/pbp/flowEngine.ts | L130 rebellion (1줄) |

## 하위호환성

- `playerInstructions` optional → 기존 세이브 정상 로드
- `gmInstruction` undefined → `resolveWithRebellion()` 즉시 `blended` 반환
- DB 마이그레이션 불필요

## 검증 방법

1. **하위호환**: `playerInstructions` 없는 기존 세이브 → 동일 시뮬 결과
2. **playStyle**: 특정 선수에 -1.0 지정 → Iso/PostUp 감소, PnR/Handoff 증가, AST 증가 확인
3. **shotZoneWeights**: shot_3pt=9 지정 → 해당 선수의 3PA 비율 증가 확인
4. **defensiveMotor**: +1.0 지정 → 해당 선수가 주수비자일 때 상대 FG% 감소 확인
5. **rebellion**: coachability 0.3 선수 + 반대 방향 playStyle → 경기당 3~8회 본성 행동 관찰
6. **coachability 비교**: Chris Paul형(0.87) vs Westbrook형(0.37) → 같은 지침에 순응도 차이

---

## Part 4: UI 구현 계획

### 4-1. Dashboard (라커룸) — 별도 탭 "선수 지침"

**위치**: Dashboard 탭 바에 6번째 탭 추가
```
[뎁스차트&로테이션] [전술 관리] [선수 지침] [로스터] [상대 전력 분석] [팀 일정]
                               ^^^^^^^^^ NEW
```

**레이아웃**: 전체 너비 테이블형
```
┌───────────────────────────────────────────────────────────────┐
│ 선수별 전술 지침                                    [초기화]   │
├───────────────────────────────────────────────────────────────┤
│ 코트 위                                                       │
│ ┌──────┬─────────────────┬──────────────────┬────────────────┐│
│ │ 선수  │ 플레이스타일     │ 슛 존 비중        │ 수비 적극성     ││
│ │      │ 패스←────→스코어 │ 3PT  MID  RIM   │ 소극←────→적극  ││
│ ├──────┼─────────────────┼──────────────────┼────────────────┤│
│ │PG 이름│ [──●──────] +0.2│ [5]  [5]  [5]  │ [────●───] +0.3││
│ │SG 이름│ [──────●──] +0.7│ [8]  [2]  [4]  │ [──●─────] -0.2││
│ │SF 이름│ [───●─────] 0.0 │ [──] [──] [──] │ [───●────] 0.0 ││
│ │PF 이름│ [────●────] +0.3│ [3]  [5]  [7]  │ [─────●──] +0.5││
│ │C  이름│ [●────────] -0.8│ [2]  [3]  [9]  │ [──────●─] +0.7││
│ └──────┴─────────────────┴──────────────────┴────────────────┘│
│                                                               │
│ 벤치                                                          │
│ ┌──────┬─────────────────┬──────────────────┬────────────────┐│
│ │6th   │ [───●─────]     │ [──] [──] [──]  │ [───●────]     ││
│ │7th   │ [────●────]     │ [──] [──] [──]  │ [────●───]     ││
│ │...                                                         ││
│ └────────────────────────────────────────────────────────────┘│
│                                                               │
│ ※ [──] = 지침 없음 (히든 텐던시 사용). 슬라이더를 조작하면 활성화 │
│ ※ 활성화된 지침 클릭 시 [x]로 개별 해제 가능                     │
└───────────────────────────────────────────────────────────────┘
```

**핵심 UX**:
- 지침이 없는 상태 (`undefined`) = 슬라이더 비활성(회색). "히든 텐던시 사용 중" 표시
- 슬라이더를 조작하는 순간 활성화 (색상 전환: 공격=blue, 수비=indigo)
- 활성 상태에서 [x] 클릭 → `undefined`로 복귀 (지침 해제)
- shotZoneWeights: 3개 값을 개별 number input 또는 미니 슬라이더로 표현
- 선수 행 높이: 슬라이더가 1줄에 들어가는 컴팩트 디자인 (~40px)
- 코트 위 / 벤치 구분선
- [초기화] 버튼: 모든 선수의 지침 일괄 제거

**컴포넌트 구조**:
```
DashboardView.tsx          → 탭 바에 'instructions' 추가
└── PlayerInstructionsTab.tsx (신규)
    ├── PlayerInstructionRow.tsx (신규) — 선수 1명의 지침 행
    │   ├── SliderControl (기존 재사용) — playStyle
    │   ├── ZoneWeightInputs (신규) — 3PT/MID/RIM 미니 입력
    │   └── SliderControl (기존 재사용) — defensiveMotor
    └── 리셋 버튼
```

**수정 파일**:
- views/DashboardView.tsx — 탭 바에 'instructions' 키 추가, 탭 콘텐츠 렌더링
- components/dashboard/PlayerInstructionsTab.tsx **(신규)** — 선수 지침 테이블 전체
- components/dashboard/PlayerInstructionRow.tsx **(신규)** — 선수 1행

**데이터 흐름**:
```
PlayerInstructionsTab receives: tactics.playerInstructions, roster, onUpdateTactics
→ 슬라이더 변경 시: onUpdateTactics({ ...tactics, playerInstructions: { ...updated } })
→ TacticsBoard의 프리셋 저장/로드에 playerInstructions 자동 포함 (GameTactics의 일부)
```

---

### 4-2. LiveGameView (시뮬레이션 중) — 4번째 탭 "선수 지침"

**위치**: LiveGameView 탭 바에 4번째 탭 추가
```
[중계] [로테이션] [전술 설정] [선수 지침]
                              ^^^^^^^^^ NEW
```

**레이아웃**: 코트 위 + 벤치 전원 표시 (Dashboard와 동일 구조)
```
┌───────────────────────────────────────────────────────────────┐
│ 선수별 지침                                                    │
│ ┌──────┬───┬─────────────────┬──────────────────┬───────────┐│
│ │ 선수  │STM│ 플레이스타일     │ 슛 존 비중        │ 수비적극성  ││
│ ├──────┼───┼─────────────────┼──────────────────┼───────────┤│
│ │ 코트 위                                                     ││
│ │PG 이름│87%│ [──●──────] +0.2│ [5]  [5]  [5]  │ [──●────] ││
│ │SG 이름│92%│ [──────●──] +0.7│ [8]  [2]  [4]  │ [────●──] ││
│ │SF 이름│78%│ [───●─────]  -- │ [──] [──] [──] │ [───●───] ││
│ │PF 이름│85%│ [────●────] +0.3│ [3]  [5]  [7]  │ [─────●─] ││
│ │C  이름│90%│ [●────────] -0.8│ [2]  [3]  [9]  │ [──────●] ││
│ ├──────┼───┼─────────────────┼──────────────────┼───────────┤│
│ │ 벤치                                                       ││
│ │6th   │100│ [───●─────]     │ [──] [──] [──]  │ [───●───] ││
│ │7th   │ 95│ [────●────]     │ [──] [──] [──]  │ [────●──] ││
│ │...                                                         ││
│ └──────┴───┴─────────────────┴──────────────────┴───────────┘│
│                                                               │
│ ※ 변경 즉시 적용 (다음 포세션부터 반영)                          │
└───────────────────────────────────────────────────────────────┘
```

**핵심 UX**:
- 코트 위 + 벤치 전원 표시 — 투입 전에 미리 지침 설정 가능
- 교체 발생 시 선수가 코트 위 ↔ 벤치 섹션 간 자동 이동
- STM(스태미나) 컬럼 — 현재 컨디션 표시 (피로도 참고하여 수비 강도 조절 의사결정)
- 팀 슬라이더와 마찬가지로 **즉시 적용** (`onApplyPlayerInstruction` → GameState ref 직접 수정)
- 일시정지/타임아웃 없이도 변경 가능 (팀 슬라이더와 동일한 정책)

**컴포넌트 구조**:
```
LiveGameView.tsx           → 탭 바에 'playerInstructions' 추가
└── LivePlayerInstructionsTab.tsx (신규)
    └── PlayerInstructionRow.tsx (재사용) — Dashboard와 동일 컴포넌트
```

**수정 파일**:
- views/LiveGameView.tsx — ActiveTab에 `'playerInstructions'` 추가, 탭 렌더링
- components/game/tabs/LivePlayerInstructionsTab.tsx **(신규)**

**데이터 흐름**:
```
LiveGameView에서 useLiveGame hook의 GameState ref 접근
→ 슬라이더 변경 시: gameStateRef.current.userTeam.tactics.playerInstructions[playerId] = { ... }
→ syncDisplay() 호출하여 React state 갱신
→ 다음 포세션의 resolveWithRebellion()에서 새 지침 반영
```

**중요**: 경기 중 지침 변경은 `LivePlayer.tendencies`(초기화 시 블렌딩된 값)을 직접 재계산하지 않음.
대신 `LivePlayer.gmInstruction`을 업데이트하면, `resolveWithRebellion()`이 매 포세션 새 값으로 판정.
→ `playStyle`과 `defensiveMotor`는 rebellion 체크포인트에서 매번 최신 지침 참조.
→ `shotZoneWeights`는 `playerZoneSliders`도 함께 업데이트 필요 (selectZone에서 참조하므로).

---

### 4-3. UI 수정 파일 총괄

| 파일 | 변경 |
|------|------|
| views/DashboardView.tsx | 탭 바에 `'instructions'` 추가 |
| components/dashboard/PlayerInstructionsTab.tsx **(신규)** | 라커룸 선수 지침 전체 테이블 |
| components/dashboard/PlayerInstructionRow.tsx **(신규)** | 선수 1행 (Dashboard + LiveGame 공유) |
| views/LiveGameView.tsx | 탭 바에 `'playerInstructions'` 추가 |
| components/game/tabs/LivePlayerInstructionsTab.tsx **(신규)** | 라이브 게임 선수 지침 |

**재사용 컴포넌트**: `SliderControl` (기존), `PlayerInstructionRow` (Dashboard↔LiveGame 공유)

---

## 전체 수정 파일 요약 (엔진 + UI)

### 엔진 (6개)
| 파일 | 변경 내용 |
|------|---------|
| types/tactics.ts | `PlayerInstruction` (3 필드), `PlayerInstructionMap`; `GameTactics.playerInstructions?` |
| utils/coachability.ts **(신규)** | `calculateCoachability`, `blendInstruction`, `resolveWithRebellion` |
| services/game/engine/pbp/pbpTypes.ts | `LivePlayer`에 4개 필드 추가 |
| services/game/engine/pbp/initializer.ts | L125 블렌딩 + `applyPlayerInstruction` |
| services/game/engine/pbp/playTypes.ts | L212 rebellion; `getEffectiveSliders` |
| services/game/engine/pbp/flowEngine.ts | L130 rebellion (1줄) |

### UI (5개)
| 파일 | 변경 내용 |
|------|---------|
| views/DashboardView.tsx | 탭 바에 `'instructions'` 추가 |
| components/dashboard/PlayerInstructionsTab.tsx **(신규)** | 라커룸 선수 지침 전체 |
| components/dashboard/PlayerInstructionRow.tsx **(신규)** | 공유 행 컴포넌트 |
| views/LiveGameView.tsx | 4번째 탭 추가 |
| components/game/tabs/LivePlayerInstructionsTab.tsx **(신규)** | 라이브 선수 지침 |
