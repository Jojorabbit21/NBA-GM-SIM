# 초기 FA 풀 생성 시스템

> 게임 시작(팀 선택) 시 FA 시장이 비어있는 문제를 해결하기 위해
> 베테랑 선수 65명을 자동 생성하여 초기 FA 풀로 제공하는 시스템.

---

## 1. 개요

`meta_players` 테이블의 FA 선수(`base_team_id = null` 또는 `'fa'`)는 수가 매우 적어,
게임 첫 시즌부터 FA 시장이 사실상 비어있는 문제가 있었다.

이를 해결하기 위해 팀 선택 시(`handleSelectTeam`) **베테랑 선수 65명**을 자동 생성하고
`user_generated_players` 테이블에 저장한 뒤 기존 FA 풀과 병합한다.

---

## 2. 생성 파이프라인

```
handleSelectTeam(teamId)
        │
        ▼
generateInitialFAPool(userId, tendencySeed)
        │  — 3티어 기반 65명 베테랑 선수 생성
        │  — season_number = 0 (드래프트 클래스와 구분)
        ▼
insertDraftClass(faRows)
        │  — user_generated_players 테이블에 저장
        │  — status = 'fa'
        ▼
setLeagueFAPool({ generatedIds: [...] })
setGeneratedFreeAgents(mappedPlayers)
        │
        ▼
forceSave({ ..., leagueFAPool })
        │  — saves.league_fa_pool JSONB에 저장
        ▼
effectiveFreeAgents useMemo
        │  — meta_players FA + generatedFreeAgents 병합
        └─ FAView에서 표시
```

**게임 재로드 시:**
```
loadCheckpoint() → savedFAPool 존재 확인
        ↓
fetchUserGeneratedPlayers(userId)
        ↓  status='fa' && faIds.has(id)
setGeneratedFreeAgents(genFA)
```

---

## 3. 3티어 선수 구조

| 티어 | 비율 | 인원(65명 기준) | baseLevel 평균 | 나이 범위 | 연봉 범위 | 계약 타입 | 계약 기간 |
|------|------|---------|----------------|-----------|-----------|-----------|-----------|
| High | 20% | ~13명 | 67 (clamp: 58~78) | 24~33세 | $10M~$18M | `veteran` | 2~3년 |
| Mid  | 45% | ~29명 | 57 (clamp: 48~68) | 22~36세 | $3M~$8M   | `veteran` | 1~3년 |
| Low  | 35% | ~23명 | 47 (clamp: 38~58) | 22~38세 | $1.8M~$3M | `min`     | 1~2년 |

- **High**: 스타터급 기여자, 75~83 OVR 목표
- **Mid**: 롤플레이어, 65~74 OVR 목표
- **Low**: 프린지/미니멈 선수, 55~64 OVR 목표

> 실제 displayOVR은 리그 전체 분포(`postProcessAllPlayersOVR`)에 따라 보정되므로
> baseLevel이 정확히 위 OVR 범위에 대응하지 않을 수 있음.

---

## 4. 능력치 생성 방식

1. **포지션 분배**: `buildPositionPool(rng, count)` 재활용 — 5포지션에 불균형 분배 (8~16명)
2. **baseLevel 결정**: 티어별 `normal(mean, 4)` + clamp
3. **능력치 맵**: `buildAttrMap(rng, position, baseLevel)` — 포지션 편향/패널티 적용
   - `POSITION_SKILL_BIAS` / `POSITION_SKILL_PENALTY` 동일 적용 (루키와 동일)
4. **포텐셜**: 나이(`ageFactor`)와 티어 천장(`FA_TIER_BASE_MEAN + 12`) 기반
   - `ageFactor`: ≤25→1.0, ≤28→0.65, ≤32→0.25, 33+→0.0
5. **계약**: 연봉 + `Math.pow(1.04, yr)` 연 4% 인상분 적용

---

## 5. 데이터 저장 구조

### `user_generated_players` 테이블
```
id            : 'gen_{uuid}'
user_id       : 사용자 ID
season_number : 0  ← 초기 FA 풀 구분자 (드래프트 클래스는 1, 2, ...)
draft_pick    : null
draft_team_id : null
status        : 'fa'
base_attributes: {
    name, position, age, salary, contractYears,
    close, mid, 3c, ...(37개 능력치),
    pot, height, weight,
    contract: { years: [...], currentYear: 0, type: 'veteran'|'min' }
}
age_at_draft  : age
```

### `saves.league_fa_pool` JSONB
```json
{ "generatedIds": ["gen_xxx", "gen_yyy", ...] }
```

---

## 6. 기존 인프라와의 통합

| 항목 | 재활용 |
|------|--------|
| `insertDraftClass()` | `rookieRepository.ts` — 저장 함수 공용 |
| `fetchUserGeneratedPlayers()` | `rookieRepository.ts` — 로드 함수 공용 |
| `mapRawPlayerToRuntimePlayer()` | `dataMapper.ts` — base_attributes → Player 변환 |
| `effectiveFreeAgents` useMemo | `useGameData.ts` — generatedFreeAgents와 meta_players FA 병합 |
| `handleResetData` | line 947에서 `user_generated_players` 전체 삭제 → 별도 처리 불필요 |

---

## 7. 관련 파일

| 역할 | 경로 |
|------|------|
| 초기 FA 풀 생성기 | `services/draft/rookieGenerator.ts` — `generateInitialFAPool()` |
| 생성 선수 DB CRUD | `services/draft/rookieRepository.ts` — `insertDraftClass()` 등 |
| 게임 초기화 진입점 | `hooks/useGameData.ts` — `handleSelectTeam()` |
| 생성 선수 타입 | `types/generatedPlayer.ts` — `GeneratedPlayerRow`, `LeagueFAPool` |
| FA 시스템 전체 | `docs/simulation/fa-system.md` |

---

## 8. 주요 상수

```typescript
// rookieGenerator.ts
export const DEFAULT_FA_POOL_SIZE = 65;

const FA_TIER_WEIGHTS  = [0.20, 0.45, 0.35];  // High / Mid / Low
const FA_TIER_BASE_MEAN = [67, 57, 47];
const FA_TIER_BASE_CLAMP = [[58,78], [48,68], [38,58]];
const FA_TIER_AGE        = [[24,33], [22,36], [22,38]];
const FA_TIER_SALARY     = [[10M,18M], [3M,8M], [1.8M,3M]];
const FA_TIER_YEARS      = [[2,3], [1,3], [1,2]];
const FA_TIER_CONTRACT_TYPE = ['veteran', 'veteran', 'min'];
```

---

## 9. 확장 고려사항

- **멀티플레이어**: 30인 세션에서는 모든 유저가 같은 리그 FA 풀을 공유해야 하므로
  `user_generated_players` → 리그 공유 테이블로 이관 필요
- **오프시즌 FA 풀 갱신**: 시즌 종료 후 계약 만료 선수 + 신규 생성 베테랑을 보충하는
  로직은 미구현 (현재는 시즌 1 시작 시 1회만 생성)
- **계약 만료 처리**: 초기 FA 선수가 팀에 서명 후 계약 만료되면 일반 오프시즌 FA 파이프라인을 타게 됨 (별도 처리 불필요)
