# 성장/퇴화 파이프라인

> 소스: `services/playerDevelopment/playerAging.ts`

## 개요

성장/퇴화는 **경기별** 로 처리되며, fractional 누적 → 정수 반영 → Player 객체 업데이트 흐름을 따른다.

---

## 1. 호출 구조

```
경기 시뮬레이션 완료
    ↓
processGameDevelopment()          ← 외부 진입점 (3곳에서 호출)
    ├── generateGrowthProfile()   ← 시드 기반 attrAffinity + athleticResilience
    ├── calculatePerGameDevelopment()
    │       ├── calculatePerGameGrowth()     ← 성장 delta 계산
    │       ├── calculatePerGameDecline()    ← 퇴화 delta 계산
    │       ├── (합산)
    │       └── accumulateAndResolve()       ← fractional 누적 → 정수 변환
    └── applyDevelopmentResult()  ← Player 객체에 반영
```

### 외부 호출자 (3곳)

| 호출자 | 위치 | 용도 |
|--------|------|------|
| `applyUserGameResult` | `services/simulation/userGameService.ts` | 유저 경기 후 성장 |
| `processCpuGames` | `services/simulation/cpuGameService.ts` | CPU 경기 후 성장 |
| `runBatchSeason` | `services/simulation/batchSeasonService.ts` | 배치 시뮬레이션 (유저+CPU) |

모든 호출자가 동일한 시그니처로 호출:
```typescript
processGameDevelopment(
    homeRoster, awayRoster,
    homeBox, awayBox,
    tendencySeed, growthRate, declineRate,
    leagueAverages, gameDate, seasonNumber
)
```

---

## 2. Fractional 누적 시스템

성장/퇴화 delta는 1경기당 0.01~0.15 수준의 소수값이다.
정수 변화가 발생할 때까지 `player.fractionalGrowth`에 누적한다.

### accumulateAndResolve() 동작

```
currentFractional[attr] + newDelta
    ↓
누적값 ≥ 1.0 → 정수 +1 반영, 누적값 -= 1.0
누적값 ≤ -1.0 → 정수 -1 반영, 누적값 += 1.0
```

- 정수 변화 시 `changeEvents` 배열에 이벤트 기록 (날짜, 속성, 변화량, 이전값, 새값)
- 바닥(floor) / 천장(99) 체크 적용
- 누적값이 0에 가까우면 sparse 저장을 위해 제거

---

## 3. Player 객체 저장 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `fractionalGrowth` | `Record<string, number>` | 속성별 소수 누적값 (아직 정수 반영 안 된 부분) |
| `attrDeltas` | `Record<string, number>` | 시즌 내 정수 변화 누적 (속성별 총 변화량) |
| `changeLog` | `AttributeChangeEvent[]` | 정수 변화 이벤트 이력 (날짜, 속성, delta, 이전값, 새값) |
| `seasonStartAttributes` | `Record<string, number>` | 시즌 시작 시 스냅샷 (UI에서 변화량 표시용) |

### applyDevelopmentResult() 동작

1. `integerChanges`를 Player 속성에 직접 반영 (clamp 35~99)
2. `attrDeltas`에 누적
3. 카테고리 평균(ins, out, plm, def, reb, ath) 재계산
4. OVR 재계산 (정수 변화 발생 시만)
5. `fractionalGrowth` 갱신
6. `changeLog`에 이벤트 추가

---

## 4. 시즌 초기화 / 오프시즌

### initializeSeasonGrowth()

시즌 시작 시 모든 선수에 대해:
- `seasonStartAttributes` 스냅샷 생성 (37개 속성 현재값 저장)
- `fractionalGrowth`, `attrDeltas`, `changeLog` 리셋

### processOffseason()

시즌 종료 시:
- `changeLog`에서 시즌 총 변화량 집계
- `player.age += 1`
- `player.contractYears -= 1`
- `fractionalGrowth`, `attrDeltas`, `changeLog`, `seasonStartAttributes` 리셋

---

## 5. 저장/복원 흐름

### 저장 (saves 테이블)

체크포인트 저장 시 Player 객체의 다음 필드가 포함됨:
- `fractionalGrowth` — 소수 누적 상태
- `attrDeltas` — 시즌 내 정수 변화 누적
- `changeLog` — 이벤트 이력
- `seasonStartAttributes` — 시즌 시작 스냅샷

### 복원 (로드 시)

1. `meta_players`에서 원본 능력치 로드
2. `reapplyAttrDeltas(player)` 호출 → `attrDeltas`를 원본에 재적용
3. 카테고리 평균 + OVR 재계산
4. `fractionalGrowth`는 저장된 값 그대로 사용 (이어서 누적)

---

## 6. 리그 평균 계산

`computeLeagueAverages(teams)` — 전체 팀 로스터에서 10경기 이상 출전 선수의 경기당 평균/표준편차를 계산.

| 스탯 | 계산 | 용도 |
|------|------|------|
| pts, p3m, ast, stl, blk, reb, mp, tov, pf | 평균 + 표준편차 | z-score 계산 |
| fgPct | fgm/fga 평균 + 표준편차 | z-score 계산 |

30명 미만 샘플이면 하드코딩된 기본값(DEFAULT_LEAGUE_AVERAGES) 사용.

---

## 7. 결정론

같은 `tendencySeed` → 같은 결과:
- `generateGrowthProfile()` → 동일한 attrAffinity, athleticResilience
- `calculatePerGameDecline()` → 동일한 variance, noiseStdev
- 시드 구성: `growth_{tendencySeed}_{playerId}`, `aging_{tendencySeed}_{playerId}_s{seasonNumber}`
