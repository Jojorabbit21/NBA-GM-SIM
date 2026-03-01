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
| `score` | FGM/FGA, PTS, 3PM/3PA, AST, +/-, Hot/Cold, And-1 |
| `miss` | FGA, 3PA, BLK, Rebound (ORB/DRB), Hot/Cold |
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
