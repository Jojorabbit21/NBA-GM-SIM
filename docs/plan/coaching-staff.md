# 코칭 스태프 시스템 — 헤드 코치 능력치 재설계

## Context

헤드 코치는 경기 결과에 직접 영향을 주지 않음. **자동전술 생성(`generateAutoTactics`)에만 영향**을 미침.
0~99 점수가 아닌 **전술 성향/철학 선호값**으로 설계 — 코치를 고용하는 것 = 팀의 전술 방향을 결정하는 것.

### 핵심 전략 긴장감

- **좋은 매칭**: 코치 철학이 로스터 강점과 일치 → 최적 전술 도출
- **나쁜 매칭**: 코치 철학과 로스터 불일치 → 타협적 전술 (양쪽 모두 비효율)
- GM의 선택: (A) 로스터에 맞는 코치 고용 또는 (B) 코치 시스템에 맞는 선수 영입

---

## 1. 헤드 코치 선호값 (7개 철학 축)

각 축은 **1~10 스케일**의 양극 선호도. 슬라이더와 동일 체계이되, "코치가 원하는 방향"을 의미.

### 공격 철학 (4개)

| # | 키 | 이름 | 1 (한쪽 극) | 10 (반대 극) | 영향 슬라이더 |
|---|---|---|---|---|---|
| 1 | `offenseIdentity` | 공격 정체성 | 히어로 볼 | 시스템 농구 | `playStyle`, `ballMovement` |
| 2 | `tempo` | 템포 | 하프코트 그라인드 | 런앤건 | `pace`, `offReb` (반비례) |
| 3 | `scoringFocus` | 득점 중심 | 페인트존 | 3점 라인 | `insideOut`, `shot_3pt`, `shot_rim`, `shot_mid` |
| 4 | `pnrEmphasis` | PnR 의존도 | ISO/포스트업 | PnR 헤비 | `pnrFreq` |

### 수비 철학 (3개)

| # | 키 | 이름 | 1 (한쪽 극) | 10 (반대 극) | 영향 슬라이더 |
|---|---|---|---|---|---|
| 5 | `defenseStyle` | 수비 스타일 | 보수적 대인 | 공격적 프레셔 | `defIntensity`, `fullCourtPress` |
| 6 | `helpScheme` | 헬프 체계 | 1:1 고수 | 적극 로테이션 | `helpDef`, `switchFreq` |
| 7 | `zonePreference` | 존 선호 | 대인 전용 | 존 위주 | `zoneFreq`, `zoneUsage` |

### 선호값 예시 — 실제 NBA 코치 아키타입

```
"Mike D'Antoni 스타일" (런앤건 + 3점)
  offenseIdentity: 8  (시스템 지향)
  tempo: 9             (초고속)
  scoringFocus: 9      (극 아웃사이드)
  pnrEmphasis: 9       (PnR 핵심)
  defenseStyle: 3      (수비 관심 낮음)
  helpScheme: 5        (보통)
  zonePreference: 2    (대인)

"Tom Thibodeau 스타일" (수비 중심 그라인드)
  offenseIdentity: 6  (약간 시스템)
  tempo: 3             (느림)
  scoringFocus: 4      (약간 인사이드)
  pnrEmphasis: 6       (보통~높음)
  defenseStyle: 9      (초 공격적)
  helpScheme: 8        (적극 로테이션)
  zonePreference: 3    (대인 위주)

"Erik Spoelstra 스타일" (밸런스 + 존)
  offenseIdentity: 7  (시스템)
  tempo: 5             (보통)
  scoringFocus: 6      (약간 아웃사이드)
  pnrEmphasis: 7       (높음)
  defenseStyle: 7      (공격적)
  helpScheme: 7        (적극 로테이션)
  zonePreference: 8    (존 선호)
```

---

## 2. 블렌딩 공식 — 코치 선호 × 로스터 기반 계산

현재 `generateAutoTactics()`의 순수 로스터 기반 계산에 코치 선호를 블렌딩:

```typescript
const COACH_INFLUENCE = 0.4;  // 코치 40% : 로스터 60%

finalSlider = rosterBased * (1 - COACH_INFLUENCE) + coachPreference * COACH_INFLUENCE
```

### 슬라이더별 블렌딩 매핑

```typescript
function blendWithCoach(rosterSliders: TacticalSliders, prefs: HeadCoachPreferences): TacticalSliders {
    const W = COACH_INFLUENCE; // 0.4

    return {
        // ── 공격: offenseIdentity 영향 ──
        playStyle:    snap('playStyle',    lerp(rosterSliders.playStyle,    prefs.offenseIdentity, W)),
        ballMovement: snap('ballMovement', lerp(rosterSliders.ballMovement, prefs.offenseIdentity, W)),

        // ── 공격: tempo 영향 ──
        pace:   snap('pace',   lerp(rosterSliders.pace,   prefs.tempo, W)),
        offReb: snap('offReb', lerp(rosterSliders.offReb, 11 - prefs.tempo, W)),
        // tempo 높으면 offReb 낮아짐 (런앤건 = 공리바 포기)

        // ── 공격: scoringFocus 영향 ──
        insideOut: snap('insideOut', lerp(rosterSliders.insideOut, prefs.scoringFocus, W)),
        shot_3pt:  snap('shot_3pt',  lerp(rosterSliders.shot_3pt,  prefs.scoringFocus, W)),
        shot_rim:  snap('shot_rim',  lerp(rosterSliders.shot_rim,  11 - prefs.scoringFocus, W)),
        shot_mid:  rosterSliders.shot_mid,  // 중거리는 코치 선호 무관, 순수 로스터 능력 기반 유지

        // ── 공격: pnrEmphasis 영향 ──
        pnrFreq: snap('pnrFreq', lerp(rosterSliders.pnrFreq, prefs.pnrEmphasis, W)),

        // ── 수비: defenseStyle 영향 ──
        defIntensity:  snap('defIntensity',  lerp(rosterSliders.defIntensity,  prefs.defenseStyle, W)),
        fullCourtPress: snap('fullCourtPress', lerp(rosterSliders.fullCourtPress, prefs.defenseStyle, W)),

        // ── 수비: helpScheme 영향 ──
        helpDef:    snap('helpDef',    lerp(rosterSliders.helpDef,    prefs.helpScheme, W)),
        switchFreq: snap('switchFreq', lerp(rosterSliders.switchFreq, prefs.helpScheme, W)),

        // ── 수비: zonePreference 영향 ──
        zoneFreq:  lerp(rosterSliders.zoneFreq,  prefs.zonePreference, W),
        zoneUsage: lerp(rosterSliders.zoneUsage, prefs.zonePreference, W),

        // ── 코치 선호 무관 (순수 로스터/설정 기반) ──
        defReb:     rosterSliders.defReb,
        pnrDefense: rosterSliders.pnrDefense,
    };
}

function lerp(roster: number, coach: number, w: number): number {
    return Math.round(roster * (1 - w) + coach * w);
}
```

### 블렌딩 효과 예시

```
로스터 기반 pace = 4 (느린 팀)
코치 tempo 선호 = 9 (런앤건 코치)
→ finalPace = 4 * 0.6 + 9 * 0.4 = 6.0 → snap → 5 (보통)

로스터 기반 pace = 8 (빠른 팀)
코치 tempo 선호 = 9 (런앤건 코치)
→ finalPace = 8 * 0.6 + 9 * 0.4 = 8.4 → snap → 9 (빠름)
```

**핵심**: 코치-로스터 매칭이 좋으면 슬라이더가 극단값(최적)에 도달. 불일치하면 중간값(비효율)으로 수렴.

---

## 3. 타입 정의

```typescript
// types/coaching.ts

export interface HeadCoachPreferences {
    // 공격 철학 (1~10)
    offenseIdentity: number;  // 1=히어로볼 ... 10=시스템농구
    tempo: number;            // 1=하프코트 ... 10=런앤건
    scoringFocus: number;     // 1=페인트존 ... 10=3점라인
    pnrEmphasis: number;      // 1=ISO/포스트 ... 10=PnR헤비

    // 수비 철학 (1~10)
    defenseStyle: number;     // 1=보수적 ... 10=공격적프레셔
    helpScheme: number;       // 1=1:1고수 ... 10=적극로테이션
    zonePreference: number;   // 1=대인전용 ... 10=존위주
}

export interface HeadCoach {
    id: string;
    name: string;
    preferences: HeadCoachPreferences;
    contractYears: number;
    contractSalary: number;
    contractYearsRemaining: number;
}
```

---

## 4. UI 표현

선호값은 양극 라벨이 있는 **수평 바**로 표현:

```
[코치 프로필 카드]

공격 철학
  히어로 볼  ●━━━━━━━━○  시스템 농구     [8]
  그라인드   ━━━━━━━━━●  런앤건          [9]
  페인트존   ━━━━━━━━●○  3점 라인        [9]
  ISO/포스트 ━━━━━━━━━●  PnR 헤비        [9]

수비 철학
  보수적     ━━●○○○○○○  공격적 프레셔    [3]
  1:1 고수   ━━━━●○○○○  적극 로테이션    [5]
  대인 전용  ━●○○○○○○○  존 위주         [2]
```

---

## 5. `generateAutoTactics` 수정

```typescript
// 변경 전 시그니처
export const generateAutoTactics = (team: Team): GameTactics

// 변경 후 시그니처
export const generateAutoTactics = (team: Team, coachPrefs?: HeadCoachPreferences): GameTactics

// 내부 로직:
// 1. 기존 로스터 기반 슬라이더 계산 (변경 없음)
// 2. coachPrefs가 있으면 blendWithCoach() 적용
// 3. 없으면 기존 동작 그대로 (하위 호환)
```

CPU 팀도 코치가 있으면 자동전술에 코치 선호 반영 → 리그 내 전술 다양성 자연 발생.

---

## 6. 나머지 스태프 포지션 (별도 설계)

헤드 코치: **선호값** (전술 생성에만 영향)
다른 포지션: 기존 **0~99 능력치** 방식 유지 가능 (경기 결과/성장에 영향)

| 포지션 | 능력치 방식 | 영향 범위 |
|---|---|---|
| 헤드 코치 | 7개 선호값 (1~10) | 자동전술 슬라이더 블렌딩 |
| 공격 코디 | 0~99 능력치 | (별도 설계 필요) |
| 수비 코디 | 0~99 능력치 | (별도 설계 필요) |
| 개발 코치 | 0~99 능력치 | 선수 성장 배율 |

---

## 수정 대상 파일

| 파일 | 변경 |
|---|---|
| `types/coaching.ts` (신규) | HeadCoach, HeadCoachPreferences 타입 |
| `services/game/tactics/tacticGenerator.ts` | 시그니처에 coachPrefs 추가, blendWithCoach() 적용 |
| `services/persistence.ts` | coaching_staff 저장/로드 |

---

## 검증

1. 코치 없음 → 기존 자동전술과 100% 동일 출력 확인
2. 런앤건 코치 + 느린 팀 → pace가 중간값으로 수렴하는지 확인
3. 런앤건 코치 + 빠른 팀 → pace가 극대값으로 수렴하는지 확인
4. CPU 30팀에 다양한 코치 배정 → 리그 전술 분포가 다양해지는지 확인
