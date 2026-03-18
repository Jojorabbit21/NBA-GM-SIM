# 루키 생성 시스템

드래프트 클래스(60명)를 결정론적으로 자동 생성한다.
시드 기반 PRNG를 사용하여 동일 시드 → 동일 결과를 보장.

---

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `services/draft/rookieGenerator.ts` | 드래프트 클래스 생성 (순수 함수, React/DB 의존 없음) |
| `services/draft/rookieRepository.ts` | `user_generated_players` 테이블 CRUD |
| `types/generatedPlayer.ts` | `GeneratedPlayerRow`, `GeneratedPlayerStatus`, `LeagueFAPool` 타입 |
| `services/dataMapper.ts` | `mapRawPlayerToRuntimePlayer()` — DB 행 → 런타임 `Player` 변환 |

---

## 생성 흐름

```
generateDraftClass(userId, seasonNumber, seed, 60)
  1. SeededRandom 초기화: `${seed}_draft_${seasonNumber}`
  2. classGrade 결정 (시즌 품질)
  3. 포지션 풀 생성 (불균형 분배)
  4. 60명 반복:
     - 문화권 가중 이름 생성
     - 나이 결정 (19~23, 상위 픽은 젊게)
     - 키/몸무게 생성
     - 37개 스킬 능력치 생성
     - 포텐셜 생성 (classGrade 반영 + 제너레이셔널 롤)
     - 루키 계약 부여
  5. GeneratedPlayerRow[] 반환
```

---

## 1. 클래스 품질 (classGrade)

시즌마다 전체 클래스의 품질 등급을 먼저 결정:

```
classGrade = rng.normal(0, 1)  // 표준정규분포
```

| classGrade | 등급 | 확률 |
|-----------|------|------|
| > 1.5 | 역대급 풍작 (2003, 2018류) | ~7% |
| 0.5 ~ 1.5 | 풍작 | ~24% |
| -0.5 ~ 0.5 | 보통 | ~38% |
| -1.5 ~ -0.5 | 흉작 | ~24% |
| < -1.5 | 역대급 흉작 | ~7% |

포텐셜 오프셋으로 변환:
```
potOffset = clamp(round(classGrade × 3), -5, 5)
```

---

## 2. 포지션 분배 — 불균형

매 시즌 포지션별 인원이 다르게 분배된다.

```
각 포지션: N(12, 2.5), clamp(8, 16)
합계 보정: count(60)에 맞추기 (최다/최소 포지션 조정)
```

예시: PG 16명 + SG 10명 + SF 13명 + PF 9명 + C 12명

---

## 3. 포텐셜

### 기대값 (rank별)

| 순위 | 기대값 | stddev |
|------|--------|--------|
| 1~5픽 | 82 + potOffset | 4 |
| 6~14픽 | 76 + potOffset | 4 |
| 15~30픽 | 70 + potOffset | 4 |
| 31~60픽 | 65 + potOffset | 4 |

clamp 범위: `[55, 99]`

### 제너레이셔널 탤런트 (초희귀)

```
if (rank <= 5 && rng.next() < 0.03)  → pot = intRange(95, 99)
```

- 5명 중 3% = 시즌당 약 0.15명 → **평균 6~7시즌에 1명** 출현
- classGrade와 무관한 독립 롤 (흉작 해에도 극소 확률로 등장)

---

## 4. 능력치 생성

### 기본 레벨 (rank 기반)

```
t = (rank - 1) / (totalCount - 1)   // 0~1, 0=최고
baseLevel = round(65 - t × 22)       // rank 1 → 65, rank 60 → 43
```

### 포지션별 편향 (POSITION_SKILL_BIAS)

각 포지션의 핵심 스킬에 가산 보너스 적용:

| 포지션 | 핵심 스킬 (주요 bias) |
|--------|---------------------|
| PG | pacc(+12), piq(+12), pvis(+12), handl(+10), siq(+10), 3t(+8) |
| SG | 3_45(+10), 3t(+10), mid(+8), 3c(+8), close(+8), siq(+8) |
| SF | mid(+6), lay(+6), close(+6), pdef(+6), 3c(+5), dreb(+5) |
| PF | lay(+8), dnk(+8), idef(+8), dreb(+8), oreb(+6), str(+6) |
| C | post(+10), idef(+10), blk(+10), dreb(+10), oreb(+8), str(+8) |

### 포지션별 약점 (POSITION_SKILL_PENALTY)

| 포지션 | 약점 스킬 (주요 penalty) |
|--------|------------------------|
| PG | post(-10), blk(-10), oreb(-8), idef(-5), str(-5) |
| SG | post(-8), blk(-8), oreb(-5) |
| SF | (없음) |
| PF | spwb(-8), 3t(-5), pacc(-5), handl(-5) |
| C | 3_45(-10), 3t(-10), handl(-10), spwb(-10), 3c(-8) |

### 최종 계산

```
각 스킬 = baseLevel + bias + penalty + N(0, 6)
clamp(25, 90)
```

---

## 5. 신체 스펙

### 키 (cm)

| 포지션 | 범위 | 분포 |
|--------|------|------|
| PG | 178~198 | 균일 |
| SG | 183~203 | 균일 |
| SF | 195~205 | 균일 |
| PF | 200~211 | 균일 |
| C | 206~225 | **좌편향** (큰 키 희귀) |

센터 키 분포:
```
raw = hMin + (hMax - hMin) × (1 - pow(rng.next(), 2.5))
→ 206~213이 대부분, 218+ 희귀, 223+ 극희귀
```

### 몸무게 (kg)

| 포지션 | 범위 |
|--------|------|
| PG | 77~98 |
| SG | 77~100 |
| SF | 93~109 |
| PF | 100~116 |
| C | 107~125 |

---

## 6. 이름 — 다문화 풀

6개 문화권에서 가중 확률로 선택. 이름/성은 항상 같은 문화권 (교차 조합 없음).
모든 이름은 **한국어 음차 표기** (기존 선수들과 동일 형식).

| 문화권 | 비중 | 풀 크기 (first/last) | 예시 |
|--------|------|---------------------|------|
| 아프리칸 아메리칸 | 40% | ~72/~72 | 자보리스 콜드웰 |
| 유럽 (동유럽/서유럽/발칸) | 20% | ~36/~36 | 밀란 코바체비치 |
| 히스패닉/라틴 | 10% | ~18/~18 | 에밀리아노 카스티요 |
| 아프리칸 (서/동아프리카) | 10% | ~18/~18 | 이브라힘 투레 |
| 아시안/퍼시픽 | 5% | ~9/~9 | 다이키 나카무라 |
| 앵글로/기타 백인 | 15% | ~27/~27 | 콜턴 하트 |

풀 합계: ~180 first names, ~180 last names (60명 클래스의 3배수).

---

## 7. 계약 — 루키 스케일

### 설계 원칙

루키 계약은 **두 단계**로 결정된다.

1. **생성 시 (임시)**: `generateDraftClass()`에서 `rank = i + 1` (생성 순서)를 기준으로 임시 계약을 부여. 선수의 능력치 프로파일이 순위를 반영하도록 하기 위한 값이며, 실제 픽 순번과 다를 수 있다.

2. **드래프트 완료 시 (확정)**: `handleRookieDraftComplete()`에서 실제 픽 순번(`pick.pickNumber`)을 기준으로 `calcRookieContract(pickNumber)`를 호출하여 계약을 **재적용**한다. 이 시점에 `player.contract`, `player.salary`, `player.contractYears` 세 필드가 모두 확정된다.

---

### 계약 구조

```typescript
// 1라운드 (1~30픽): 4년 루키 스케일
{
    years: [salary, salary×1.05, salary×1.10, salary×1.15],
    currentYear: 0,
    type: 'rookie',
}

// 2라운드 (31~60픽): 2년 최저 연봉
{
    years: [1_500_000, 1_575_000],
    currentYear: 0,
    type: 'rookie',
}
```

---

### 1라운드 슬롯 연봉 (`ROOKIE_SALARIES`)

| 픽 | 1년차 ($) | 4년차 ($) |
|----|----------|----------|
| 1  | 12,000,000 | 13,800,000 |
| 2  | 10,800,000 | 12,420,000 |
| 3  | 9,700,000  | 11,155,000 |
| 5  | 8,000,000  | 9,200,000  |
| 10 | 5,000,000  | 5,750,000  |
| 15 | 3,500,000  | 4,025,000  |
| 20 | 2,500,000  | 2,875,000  |
| 25 | 2,000,000  | 2,300,000  |
| 30 | 1,700,000  | 1,955,000  |

---

### `calcRookieContract(pickNumber)` 함수

파일: `services/draft/rookieGenerator.ts`

```typescript
export function calcRookieContract(pickNumber: number): PlayerContract
```

드래프트 완료 시 호출. 픽 순번만 넣으면 올바른 `PlayerContract` 객체를 반환.

| 픽 범위 | 계약 기간 | 연봉 기준 |
|---------|---------|---------|
| 1~30픽  | 4년 | `ROOKIE_SALARIES[pickNumber-1]`, 매년 5% 인상 |
| 31~60픽 | 2년 | $1,500,000 고정, 매년 5% 인상 |

`pickNumber`가 `undefined`인 경우 fallback으로 30픽 슬롯 적용.

---

## 8. 나이

| 순위 | 나이 범위 | 비고 |
|------|----------|------|
| 1~10픽 | 19~20 | 상위 픽은 원앤던 선수 위주 |
| 11~20픽 | 20~21 | |
| 21~60픽 | 21~23 | 대학 3~4년차 |

추가로 40% 확률로 +1세 적용.

---

## PRNG (SeededRandom)

xorshift32 기반 결정론적 난수 생성기.

| 메서드 | 설명 |
|--------|------|
| `next()` | 0~1 균일 분포 |
| `intRange(min, max)` | min~max 정수 (양 끝 포함) |
| `normal(mean, stddev)` | Box-Muller 정규분포 |
| `shuffle(arr)` | Fisher-Yates 셔플 |
| `weightedIndex(weights)` | 가중 확률 인덱스 선택 |

시드 문자열: `${tendencySeed}_draft_${seasonNumber}`
→ 동일 세이브 + 동일 시즌 = 동일 드래프트 클래스 보장.

---

## DB 저장

### `user_generated_players` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | TEXT | `gen_{uuid}` (PRNG 기반 UUID) |
| `user_id` | UUID | 사용자 ID |
| `season_number` | INT | 드래프트 시즌 번호 |
| `draft_pick` | INT NULL | 드래프트 순위 (null = 미드래프트) |
| `draft_team_id` | TEXT NULL | 지명한 팀 ID |
| `status` | TEXT | `'fa'` / `'drafted'` / `'retired'` |
| `base_attributes` | JSONB | meta_players와 동일 형식 |
| `age_at_draft` | INT | 드래프트 당시 나이 (불변) |

### 생성 → 드래프트 흐름

```
prospectRevealDate 도달
  → generateDraftClass() → insertDraftClass() → DB 저장 (status='fa')
  → prospects 상태에 Player[]로 변환하여 보관

rookieDraftDate 도달
  → RookieDraftView 진입 (blocked 이벤트)
  → 유저/CPU 드래프트 진행
  → handleRookieDraftComplete(picks: BoardPick[])
    → markAsDrafted() (각 픽: status='drafted', draft_pick=pick.pickNumber, draft_team_id)
    → 각 루키에 calcRookieContract(pick.pickNumber) 적용
       → player.contract / salary / contractYears 재설정
    → 미드래프트 선수 → leagueFAPool에 추가
```

---

## 37개 스킬 키 (CSV 단축키)

```
슈팅:    close, mid, 3c, 3_45, 3t, ft, siq, ocon
피니싱:  lay, dnk, post, draw, hands
플레이메이킹: pacc, handl, spwb, piq, pvis, obm
수비:    idef, pdef, stl, blk, hdef, pper, dcon
리바운드: oreb, dreb, box
피지컬:  spd, agi, str, vert, sta, hus, dur
```
