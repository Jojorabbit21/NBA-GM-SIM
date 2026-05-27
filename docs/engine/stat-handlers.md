# Stat Handlers (statsMappers.ts + statUtils.ts + visUtils.ts)

## 개요
포세션 결과를 선수/팀 스탯에 반영하고, 시각화 데이터를 기록하는 파이프라인.

**파일**:
- `services/game/engine/pbp/statsMappers.ts` — 메인 오케스트레이터
- `services/game/engine/pbp/handlers/statUtils.ts` — 존별 슈팅 스탯, ±
- `services/game/engine/pbp/handlers/visUtils.ts` — 샷 차트 시각화 데이터

---

## statsMappers.ts — `applyPossessionResult`

포세션 결과(PossessionResult)를 받아 모든 스탯을 업데이트하는 중앙 오케스트레이터.

### 처리하는 결과 타입 (type)

| type | 주요 처리 |
|------|----------|
| `score` | FGM/FGA, PTS, 3PM/3PA, AST, +/-, Hot/Cold, And-1, **수비자 DFGM 카운터** |
| `miss` | FGA, 3PA, BLK, Rebound (ORB/DRB), Hot/Cold, **수비자 DFGA 카운터** |
| `turnover` | TOV, STL |
| `foul` | PF(수비자), 팀파울, Bonus FT(팀파울>4) |
| `freethrow` | PF(수비자), FTA/FTM, FT miss 리바운드 |
| `offensiveFoul` | PF(공격자) + TOV |
| `technicalFoul` | techFouls++, FT 1개(베스트 슈터), 2T 퇴장 |
| `flagrantFoul` | PF + flagrantFouls++, FT 2개, F2 퇴장 |
| `shotClockViolation` | TOV |

### Hot/Cold Streak 시스템

슛 결과 후 `updateHotCold()` 호출:
```
recentShots: boolean[] (최근 5개 슛 결과)
hotColdRating = clamp(-1, +1, (recentPct - 0.5) × 1.5 + streakBonus)
```

| 조건 | streakBonus |
|------|------------|
| 최근 3연속 성공 | +0.15 |
| 최근 3연속 실패 | -0.15 |
| 그 외 | 0 |

관련 리셋 함수:
- `dampenHotCold()`: 쿼터 전환/타임아웃 시 × 0.5 반감
- `resetHotCold()`: 하프타임 시 완전 리셋

### 어시스트 확률 (플레이 타입별)

| 플레이 타입 | AST 확률 |
|------------|---------|
| CatchShoot | 90% |
| Cut | 85% |
| PnR_Pop | 80% |
| PnR_Roll | 75% |
| Handoff | 65% |
| Transition | 55% |
| PostUp | 45% |
| Putback | 10% |
| 기타 | 60% |

히든 텐던시 `playStyle` 보정: pass-first(-1.0) → +10%, shoot-first(+1.0) → -10%

### 자유투 처리
- Bonus FT (팀파울 > 4): 2개
- Shooting FT: 2개
- Technical FT: 1개 (베스트 FT 슈터)
- Flagrant FT: 2개 (파울 당한 선수)
- 마지막 FT 실패 시 → `resolveRebound` 호출

---

## 수비 스탯 추적 시스템 (CONT / DFG%)

### identifyDefender() — 1차 수비수 결정 (possessionHandler.ts)

매 슛 포세션마다 수비팀에서 공격자(actor)를 담당하는 **1차 수비수 (finalDefender)** 를 결정한다.  
CONT·DFG% 스탯은 이 수비수 기준으로 누적된다.

**결정 우선순위:**

| 우선순위 | 조건 | 결과 |
|---------|------|------|
| 1 | 존 수비(isZone) + Rim/Paint 공격 | 수비팀 C 또는 PF (앵커) |
| 2 | Ace Stopper 전술 설정 + 상대가 Ace | tactics.stopperId 고정 |
| 3 | 기본 | actor.position 동일한 수비수 (없으면 랜덤) |
| 4 | 스크린 플레이 + switchFreq 발동 | 스크린 담당 수비수로 교체 |

**헬프 블락 보정** (finalDefender 교체):  
미스 판정 후 헬프 블락이 성공하면 `finalDefender = helper`로 갱신된다.  
즉, 블락 스탯과 DFGA 카운터가 헬프 수비수에게 기록된다.

---

### bumpDefendedShot() — 수비 카운터 증가 (statsMappers.ts)

```ts
function bumpDefendedShot(defender: LivePlayer, broadZone: string, isMake: boolean): void {
    defender.contestedAttempted += 1;         // CONT (= DFGA)
    if (isMake) defender.contestedMade += 1;  // DFGM

    // broad zone → 거리별 버킷
    Rim | Paint  →  defRimAttempted/Made
    Mid          →  defMidAttempted/Made
    3PT          →  defThreeAttempted/Made
}
```

**호출 지점:**

| 분기 | 호출 | 의미 |
|------|------|------|
| `type === 'score'` | `bumpDefendedShot(finalDefender, zone, true)` | 허용 득점 |
| `type === 'miss'` | `bumpDefendedShot(finalDefender, zone, false)` | 수비 성공 |
| `type === 'foul'` / `'freethrow'` | 호출 안 함 | 매치업 개념 다름 |

조건: `finalDefender && zone` 모두 truthy일 때만 실행.  
블락된 슛은 `type === 'miss'`로 처리되므로 자동으로 DFGA에 포함.

---

### 스탯 정의

| UI 표기 | 필드(PlayerStats) | 정의 |
|--------|-------------------|------|
| CONT | `contestedAttempted` | 1차 매치업 슛 시도 수 (= DFGA 합계) |
| DFG% | `contestedMade / contestedAttempted` | 매치업 하 허용 슛 성공률 (낮을수록 좋음) |
| DFG<6ft | `defRimMade / defRimAttempted` | Rim+Paint 존 DFG% |
| DFG Mid | `defMidMade / defMidAttempted` | Mid 존 DFG% |
| DFG 3P | `defThreeMade / defThreeAttempted` | 3PT 존 DFG% |

**존 매핑:**

| PBP broad zone | 수비 스탯 버킷 | UI |
|----------------|--------------|-----|
| `Rim`, `Paint` | `defRim*` | DFG<6ft |
| `Mid` | `defMid*` | DFG Mid |
| `3PT` | `defThree*` | DFG 3P |

---

### 전체 데이터 흐름

```
[possessionHandler.ts]
  identifyDefender() → finalDefender (블락 헬퍼면 교체)

[statsMappers.ts — applyPossessionResult]
  score: bumpDefendedShot(finalDefender, zone, true)
  miss:  bumpDefendedShot(finalDefender, zone, false)
    → LivePlayer.contestedAttempted/Made, defRim/Mid/ThreeAttempted/Made 누적

[liveEngine.ts — mapToBox]
  LivePlayer → PlayerBoxScore 변환
  8개 필드 포함: contestedAttempted/Made, defRim/Mid/ThreeAttempted/Made

[user_game_results.box_score JSONB 저장]

[stateReplayer.ts — applyBoxScore]
[simulationUtils.ts — applyBoxToRoster]
  box_score → player.stats 누적 합산

[useLeaderboardData.ts / PlayerDetailView.tsx]
  cont     = contestedAttempted / g          (per-game)
  dfg%     = contestedMade / contestedAttempted
  dfgRim%  = defRimMade / defRimAttempted
  dfgMid%  = defMidMade / defMidAttempted
  dfg3%    = defThreeMade / defThreeAttempted
```

---

### 해석 가이드

- **낮은 DFG%** = 좋은 수비 (상대가 자신 앞에서 낮은 성공률 기록)
- **높은 CONT + 낮은 DFG%** = 이상적 수비자 (활동량 多 + 효율적)
- **DFG<6ft ↓** → 림 프로텍터 (blk/intDef 높은 빅맨)
- **DFG 3P ↓** → 페리미터 스토퍼 (perDef/agility 높은 윙/가드)
- 리그 평균 DFG%: 약 44~47% (FG% 분포와 유사)

**설계 단순화:**  
NBA 실제 트래킹(SportVU)은 슈터-수비수 간 거리·팔 길이로 컨테스트 여부를 판정하지만,  
이 엔진은 **1차 수비수 매치업 기반**으로 단순화했다.  
거리 수치(distance) 미구현으로 NBA 표준 4구간(<6ft/6-10ft/10-15ft/>15ft) 분류는 미적용.

---

## statUtils.ts

### `updateZoneStats(player, zone, isMake, preResolvedSubZone?)`
10존 슈팅 스탯 업데이트:
```
zone_rim_a/m, zone_paint_a/m
zone_mid_l_a/m, zone_mid_c_a/m, zone_mid_r_a/m
zone_c3_l_a/m, zone_c3_r_a/m
zone_atb3_l_a/m, zone_atb3_c_a/m, zone_atb3_r_a/m
```

- `resolveDynamicZone`으로 서브존 결정 (preResolvedSubZone이 없을 때)
- 시도(a) 항상 증가, 성공(m)은 isMake일 때만

### `updatePlusMinus(offTeam, defTeam, scoreDelta)`
득점 시 코트 위 전원의 +/- 업데이트:
- 공격팀 onCourt: `+= scoreDelta`
- 수비팀 onCourt: `-= scoreDelta`

---

## visUtils.ts — `recordShotEvent`

샷 차트 시각화를 위한 이벤트 기록:
```typescript
ShotEvent {
    id, quarter, gameClock, teamId, playerId,
    x, y,          // 코트 좌표
    zone,          // Rim | Paint | Mid | 3PT
    isMake,        // 성공 여부
    playType,      // 플레이 타입
    assistPlayerId // 어시스트 선수
}
```
- `generateShotCoordinate(zone, side)` 유틸리티로 코트 좌표 생성
- `state.shotEvents[]`에 push → UI에서 샷 차트 렌더링에 사용

---

## 수정 시 주의사항
- 새 결과 타입 추가 시 `applyPossessionResult`의 분기문에 추가 필요
- 존 스탯 키 이름은 `zone_{zone}_{a|m}` 패턴 — LivePlayer 타입 정의와 일치 필요
- Hot/Cold는 `flowEngine.ts`의 hitRate 계산에서 참조됨
- 어시스트 확률은 하드코딩 — 상수 파일로 이관 가능
