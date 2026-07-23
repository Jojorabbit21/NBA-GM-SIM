# 리그 평균 정규화 (League-Relative Skill Normalization)

> 로스터를 전부 고OVR 선수로 채운 리그(올타임 레전드 등)에서 발생하는 득점
> 인플레이션(150점대 폭주)을 교정하는 시스템. 밸런싱 작업 시 참조용.

## 문제 배경

`calculateHitRate()`의 공격/수비 반영 공식이 비대칭이다:
- 공격: `interpolateCurve(offAttr, OFF_CURVE)` — **볼록 커브**(86+ 구간 급경사)
- 수비: `defAttr × DEF_COEFF` — **얕은 선형**

양 팀이 동일하게 70→95로 강해져도(매치업 갭 = 0) 공격 보너스가 수비 감쇄보다
훨씬 커서 성공률이 오른다. 실측(70v70 vs 95v95, 갭 0 기준):

| 존 | 70v70 | 95v95 | 순효과 |
|---|---|---|---|
| 3PT | 25.6% | 35.5% | +9.9%p |
| 레이업 | 42.0% | 50.3% | +8.3%p |
| 미드 | 34.3% | 40.3% | +6.0%p |

→ 절대 능력치 레벨 자체가 총득점을 밀어올리는 구조적 결함. 자세한 원인은
[shot-hit-rate.md](shot-hit-rate.md) 참조.

## 핵심 원리

> 슛/플레이의 성패는 선수의 **절대 능력치**가 아니라 그가 속한 **리그 평균과의
> 상대적 거리**로 결정되어야 한다.

리그 평균이 엔진의 캘리브레이션 기준점(정상 NBA 수준)보다 높으면, 그 초과분만큼
모든 선수의 관련 능력치를 동일하게 끌어내린다. 갭(선수 간 실력 차)은 보존되고
절대 레벨만 기준 대역으로 압축된다.

```
R_eff = R − (μ_league − μ_ref) × k
Δμ = μ_league − μ_ref
```

| 기호 | 의미 |
|---|---|
| `μ_ref` | 캘리브레이션 기준 평균 (=`MU_REF`, 정상 리그의 로테이션 평균 OVR) |
| `μ_league` | 현재 리그의 로테이션 평균 OVR (실시간 계산) |
| `k` | 압축 계수 0~1 (0=끔, 1=완전 평준화) |

- `Δμ ≤ 0` (정상/약체 리그) → **무변환**. 인플레이션만 교정하며 디플레는 건드리지
  않는다 → 표준 리그 밸런스는 100% 하위호환.
- `Δμ > 0` (스택 리그) → 전원의 TARGET 능력치를 `shift = Δμ × k`만큼 감산.
- 클램프: `[0, 99]`.

### 갭 보존 성질

같은 리그 내 두 선수 차이는 그대로 유지된다: `(R₁−shift) − (R₂−shift) = R₁−R₂`.
→ 승패 결정력·개인 스탯 분포는 그대로, **총득점 레벨만** 정상 NBA 대역으로 회귀.

### 표시값은 불변

정규화는 **시뮬레이션 입력에만** 적용된다. 유저에게 보이는 OVR·능력치(raw)는
그대로. `calculatePlayerOvr()`, PlayerDetailView 등은 원본 값을 계속 사용.

---

## 정규화 대상 능력치 (TARGET_ATTRS)

전체 능력치가 아니라 **인플레이션의 실제 원인**으로 검증된 것만 대상으로 한다.
초기에는 "height/weight 제외 전체"를 시도했으나 3PT%가 9%로 폭락하는 등
과교정이 발생해 폐기하고, 실측 기반으로 좁혀졌다.

```ts
TARGET_ATTRS: [
    // 슈팅 효율 (calculateHitRate 직접 사용)
    'layup', 'dunk', 'closeShot', 'mid', 'postPlay',
    'intDef', 'perDef', 'def', 'helpDefIq', 'defConsist',
    'shotIq', 'offConsist',
    // 림 어택 절대 보너스 + speed와의 갭 비율 유지
    'spdBall', 'speed',
    // 체력/회복 — 높은 pace 슬라이더의 자연 대가를 무력화하지 않도록
    'stamina', 'durability',
    // 턴오버 저항 — 동일 이유
    'handling', 'passAcc', 'passIq', 'passVision', 'hands',
    // 공격 리바운드 과다(추가 포제션) 억제
    'offReb',
    // 블록 과다 억제
    'blk',
    // 파울 드로잉 과다 억제 (FTA 폭증 원인)
    'drFoul',
]
ATTR_K_BOOST: { drFoul: 2.5 }   // 능력치별 shift 배율 (기본 1.0)
```

### 왜 이 능력치들인가

| 원인 | 근거 |
|---|---|
| `layup/dunk/closeShot/mid/postPlay` + 수비 5종 + `shotIq/offConsist` | `calculateHitRate()`가 직접 읽는 offRating/defRating — 인플레의 1차 원인 |
| `spdBall` | `flowEngine.ts`에서 림 어택 시 `(spdBall−70)×0.001` 절대 보너스 — 수비와 무관한 무료 FG% |
| `speed` | `spdBall`만 깎으면 `dribbleGapRisk=(speed−spdBall)×0.001`이 인위적으로 벌어져 턴오버 급증 → 반드시 `spdBall`과 쌍으로 정규화 |
| `stamina`, `durability` | `fatigueSystem.ts`의 체력 소모/회복 계수 — 95+면 높은 pace를 뛰어도 안 지치고 벤치에서 즉시 완전 회복됨. 이게 무력화되면 pace 슬라이더의 "체력 소모"라는 자연 페널티가 사라짐 |
| `handling`, `passAcc`, `passIq`, `passVision`, `hands` | `calculateTurnoverChance()`의 TO 저항 항 — 95+면 빠른 pace에서도 턴오버가 거의 안 나 포제션이 전부 FGA로 전환됨 |
| `offReb` | `reboundLogic.ts`의 ORB% 공식 — 리그 인플레 시 공격 리바운드로 인한 "추가 포제션"이 과다해짐 |
| `blk` | 블록 과다 → 루즈볼/전환 공격으로 이어지는 부가 포제션 억제 |
| `drFoul` | 슈팅파울 드로잉 확률의 직접 계수. FTA가 정규화 없이는 50개까지 치솟음을 확인해 boost 2.5 적용 |

### 의도적으로 제외한 능력치

| 능력치 | 제외 이유 |
|---|---|
| **3PT** (`threeVal/threeCorner/three45/threeTop`) | `THREE_OFF_CURVE`가 85 이하 구간에서 급격히 꺾여, shift 16.2만 적용해도 3P%가 9~14%로 폭락(과교정). 실측상 3PT는 애초에 인플레의 주범이 아니었음(95v95도 NBA 평균과 근접) |
| `ft` | 자유투는 수비수가 개입하지 않는 순수 개인 기술 — 리그 수준과 무관해야 함 |
| `height`, `weight` | 신체 치수는 "리그가 세졌다"고 변하는 값이 아님 |
| `agility`, `strength`, `vertical` | 매치업 상대 계산(`speedAdv`, `strengthAdv` 등)에서 양 팀 모두 동일하게 쓰여, 정규화해도 상대적 차이가 상쇄되어 무의미 |
| `hustle` | PBP 엔진이 게임플레이에서 직접 읽지 않음(OVR 계산 전용) |
| `stl`, `passPerc` | **역효과 확인**: 깎으면 스틸 감소 → 턴오버 감소 → 오히려 FGA 증가. 포제션 억제 목적과 정반대로 작동해 제외 |
| `reb`, `defReb`, `boxOut` | 양 팀 동일 감소로 ORB/DRB 비율 불변 — 정규화 실익 없음 |

---

## LeagueContext 계산

```ts
// leagueNormalization.ts
interface LeagueContext { muRef: number; muLeague: number; k: number }

computeLeagueContext(teams, calcOvr, kOverride?): LeagueContext
```

각 팀의 로스터를 OVR 내림차순 정렬 후 상위 `ROTATION_SIZE`(9)명만 평균에
포함시킨다(벤치 끝자락 선수가 평균을 왜곡하지 않도록). 팀이 없거나 비활성화 시
`muLeague = muRef`(no-op)로 폴백.

`normalizeAttrs(rawAttr, ctx)`는 `initTeamState()` 내 `attr` 객체 생성 직후,
엔진에 넘기기 전에 1회 적용된다([sim-structure.md](../simulation/sim-structure.md)
참조).

### MP 전용: resolveNormalizationContext

멀티플레이어는 매치업 2팀만 서버에 로드되므로, 정확한 리그 전체 평균을 매 경기
재계산하기보다 `room.sim_settings.leagueContext`에 캐시하고 재사용한다.

```
우선순위: room.sim_settings.normalization(관리자 오버라이드)
        > 캐시된 leagueContext
        > 매치업 2팀 기반 폴백 계산
```

---

## 조절 포인트

| 목적 | 위치 |
|---|---|
| 기능 즉시 OFF | `SIM_CONFIG.NORMALIZATION.ENABLED = false` |
| 압축 강도 전역 조정 | `NORMALIZATION.DEFAULT_K` (기본 0.7) 또는 SimSettings UI 슬라이더 `normalizationStrength` |
| 기준선 재측정 | `NORMALIZATION.MU_REF` (표준 리그 로테이션 평균 OVR 실측값) |
| 대상 능력치 추가/제외 | `NORMALIZATION.TARGET_ATTRS` 배열 |
| 특정 능력치만 더 세게 압축 | `NORMALIZATION.ATTR_K_BOOST` (능력치별 shift 배율) |
| 룸 단위 실시간 오버라이드(MP) | `room.sim_settings.normalization = { enabled, k, muRef }` — 재배포 불필요 |

---

## 실측 검증 결과

k=0.7, MU_REF=75 기준, 퀵플레이(전 미러 동일 엔진) 실측:

| 시나리오 | μ_league | 결과 스코어 | FGA | FG% | 3P% | TOV |
|---|---|---|---|---|---|---|
| 올타임(97-99 OVR) | 98.1 | **94-96** | 75-84 | 44-48% | 37-40% | 15-17 |
| 저능력(61-70 OVR) | ~66 | **83-73** (무변환) | 71-81 | 42-45% | 29-51% | 19-20 |
| 정규화 전(비교) | 98.1 | 164-151 | 107-114 | 47-65% | 9-65%(변동 큼) | 9-15 |

모든 지표가 NBA 정상 범위(총득점 100~115, FGA 85~90, FG% 45~47%, TOV 12~15)에
근접했고, 저능력 리그는 `Δμ ≤ 0`이라 정규화가 개입하지 않아(no-op) 표준 SP
밸런스가 그대로 유지됨을 확인.

---

## 알려진 한계

- **혼합 리그 내 두 스택 팀 대결**: 리그 평균 기준으로 계산하므로, 평균 리그
  (예 OVR 80) 안에서 우연히 두 스택 팀(OVR 95)이 붙으면 `Δμ`가 작게 잡혀
  다소 높은 점수가 나올 수 있다. 폭주 수준은 아니며 "리그 최강 두 팀의
  난타전"으로 해석 가능한 범위.
- **볼록 커브 자체는 유지됨**: 정규화는 작동점을 기준 대역으로 이동시킬 뿐,
  공격/수비 반영 함수의 근본 비대칭을 제거하지 않는다. 리그 내 능력치 분산이
  매우 크면(99 vs 60 혼재) 최상위 선수가 여전히 소폭 우위를 가짐 — 이는
  현실적인 2차 효과로 간주.
- **v1 대상 범위**: TARGET_ATTRS는 실측으로 검증된 15개 항목. 향후 리바운드
  총량(reb/defReb)이나 어시스트 인플레가 관찰되면 추가 검토 필요.

## 참조 파일

| 파일 | 역할 |
|---|---|
| `services/game/engine/pbp/leagueNormalization.ts` | `normalizeAttrs`, `computeLeagueContext`, `resolveNormalizationContext` (서버/서버-fly 미러 동일 구조) |
| `services/game/engine/pbp/initializer.ts` | `initTeamState()` 내 attr 정규화 적용 지점 |
| `services/game/config/constants.ts` | `SIM_CONFIG.NORMALIZATION` 전체 설정 |
| `services/simulationService.ts`, `services/simulation/userGameService.ts` | SP: 전체 `teams[]`로 LeagueContext 계산·주입 |
| `supabase/functions/simulate-game/index.ts`, `server/src/simRunner.ts` | MP: 캐시/오버라이드/폴백 3단 해석 |
| `components/ProtectedLayout.tsx`, `pages/QuickPlayPage.tsx` | 라이브 경기·퀵플레이 진입점 주입 |
| `types/simSettings.ts` | `SimSettings.leagueContext`, `normalizationStrength` 필드 |

3 미러(`supabase/functions/_shared/`, `services/game/`, `server/src/shared/`) 모두
동일 로직을 유지해야 하며, 수정 시 세 곳 모두 반영 필요.
