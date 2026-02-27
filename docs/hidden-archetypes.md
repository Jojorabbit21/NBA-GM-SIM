# Hidden Archetypes (히든 아키타입)

선수 능력치 조합에 따라 자동 부여되는 숨겨진 특성. UI에 표시되지 않으며 PBP 엔진 내부에서만 작동한다.

## 설계 원칙

- **기본 공식(Base Formula)** 과 **아키타입(Archetype)** 은 별개 레이어
  - 기본 공식: 모든 선수에게 능력치 비례로 적용 (예: drawFoul → 슈팅파울 비율)
  - 아키타입: 엘리트 임계값을 넘는 소수 선수에게 추가 보너스
- 아키타입은 **중첩 가능** (한 선수가 여러 아키타입 동시 보유 가능)
- 상수는 모두 `constants.ts`의 `SIM_CONFIG`에서 관리 (ENABLED 마스터 스위치 포함)

---

## A. 클러치 아키타입

> 적용 위치: `flowEngine.ts` (calculateHitRate 클러치 섹션)
> 설정: `SIM_CONFIG.CLUTCH_ARCHETYPE` (ENABLED 마스터 스위치)

| # | 이름 | 조건 | 효과 | 대표 선수 |
|:--|:-----|:-----|:-----|:----------|
| A-1 | **The Closer** | intangibles ≥ 90, shotIq ≥ 85 | clutchModifier ×2 | Kobe, MJ, Kawhi |
| A-2 | **Ice in Veins** | intangibles ≥ 85, offConsist ≥ 88 | 프레셔 페널티(-1.5%) 면제 | Dame, Kyrie, Dirk |
| A-3 | **Big Stage Player** | intangibles ≥ 85, strength ≥ 85, ins ≥ 85 | 클러치 Rim/Paint hitRate +3% | LeBron, Giannis |

### 클러치 조건 정의
- **isClutch**: Q4, gameClock ≤ 300초(5분), scoreDiff ≤ 10
- **isSuperClutch**: Q4, gameClock ≤ 120초(2분), scoreDiff ≤ 5

---

## B. 공격 아키타입 (Zone Shooting / Physical)

> 적용 위치: `flowEngine.ts` (hitRate), `possessionHandler.ts` (block)
> 설정: `SIM_CONFIG.ZONE_SHOOTING` (ENABLED 마스터 스위치)

### B-1. Mr. Fundamental (미드레인지의 정석)

| 항목 | 값 |
|:-----|:---|
| 조건 | mid ≥ 97 |
| 효과 1 | 클러치 + Mid → hitRate +3% |
| 효과 2 | ISO + Mid → hitRate +3% (중첩 가능) |
| 적용 파일 | flowEngine.ts |
| 대표 선수 | KD, DeRozan |

### B-2. Rangemaster (사거리의 지배자)

| 항목 | 값 |
|:-----|:---|
| 조건 | threeVal ≥ 90, shotIq ≥ 85 |
| 효과 | 클러치 + 3PT → hitRate +1.5% |
| 적용 파일 | flowEngine.ts |
| 대표 선수 | Steph Curry, Dame |

### B-3. Tyrant (페인트 존의 폭군)

| 항목 | 값 |
|:-----|:---|
| 조건 | ins ≥ 90, (strength ≥ 88 OR vertical ≥ 88) |
| 효과 1 | Rim/Paint hitRate +3% |
| 효과 2 | Rim/Paint 블락 확률 -3% (절대값) |
| 적용 파일 | flowEngine.ts (hitRate), possessionHandler.ts (block) |
| 대표 선수 | Giannis, Shaq, Zion |

### B-4. Levitator (레비테이터)

| 항목 | 값 |
|:-----|:---|
| 조건 | closeShot ≥ 96, agility ≥ 85, height ≤ 195cm |
| 효과 | Paint 블락 확률 ×0.5 (50% 감소) |
| 적용 파일 | possessionHandler.ts |
| 대표 선수 | Tony Parker, Trae Young |

### B-5. Afterburner (애프터버너)

| 항목 | 값 |
|:-----|:---|
| 조건 | speed ≥ 95, agility ≥ 93 |
| 효과 | Transition hitRate +2% |
| 적용 파일 | flowEngine.ts |
| 대표 선수 | Ja Morant, De'Aaron Fox, Russell Westbrook |

### B-6. Ascendant (어센던트)

| 항목 | 값 |
|:-----|:---|
| 조건 | PG/SG 전용, vertical ≥ 95, closeShot ≥ 93 |
| 효과 | Rim 블락 확률 ×0.6 (40% 감소) |
| 적용 파일 | possessionHandler.ts |
| 대표 선수 | Ja Morant, Zach LaVine, Derrick Rose |

---

## C. 스틸 아키타입

> 적용 위치: `possessionHandler.ts` (calculateTurnoverChance)
> 설정: `SIM_CONFIG.STEAL` (ENABLED 마스터 스위치)

### C-1. The Clamp (질식 수비)

| 항목 | 값 |
|:-----|:---|
| 조건 | perDef ≥ 92, stl ≥ 80 |
| 효과 | 모든 플레이에서 턴오버 확률 +3% |
| 대표 선수 | Kawhi, Scottie Pippen |

### C-2. The Pickpocket (볼 스트립)

| 항목 | 값 |
|:-----|:---|
| 조건 | stl ≥ 85, agility ≥ 92 |
| 효과 | PostUp/Iso/Cut에서 턴오버 확률 +4% |
| 대표 선수 | CP3, Marcus Smart |

### C-3. The Hawk (패싱레인 사냥꾼)

| 항목 | 값 |
|:-----|:---|
| 조건 | helpDefIq ≥ 85, passPerc ≥ 80, stl ≥ 75 |
| 효과 | 상대 ballMovement ≥ 7 시 턴오버 확률 +3% |
| 대표 선수 | Draymond, Jimmy Butler |

### C-4. The Press (풀코트 프레스)

| 항목 | 값 |
|:-----|:---|
| 조건 | speed ≥ 85, stamina ≥ 85, hustle ≥ 85 |
| 효과 1 | Transition에서 턴오버 확률 +5% |
| 효과 2 | Transition에서 스틸 비율 +15% |
| 대표 선수 | Pat Beverley, Tony Allen |

---

## D. 블락 아키타입

> 적용 위치: `possessionHandler.ts` (블락 판정 섹션)
> 설정: `SIM_CONFIG.BLOCK` (ENABLED 마스터 스위치)

| # | 이름 | 조건 | 효과 |
|:--|:-----|:-----|:-----|
| D-1 | **The Wall** | blk ≥ 97 | 블락 확률 +8% |
| D-2 | **The Alien** | height ≥ 216, blk ≥ 80 | 블락 확률 +6% |
| D-3 | **Skywalker** | vertical ≥ 95, blk ≥ 75 | 블락 확률 +5% |
| D-4 | **Defensive Anchor** | helpDefIq ≥ 92, blk ≥ 80 | 블락 확률 +3% |

> D-1 ~ D-4는 상호 배타적 (if/else if 구조). 가장 높은 보너스 하나만 적용.

---

## E. 파울 아키타입

> 적용 위치: `possessionHandler.ts` (수비 파울 판정 섹션)
> 설정: `SIM_CONFIG.FOUL_EVENTS`

### E-1. Manipulator (파울 유도 장인)

| 항목 | 값 |
|:-----|:---|
| 조건 | drFoul ≥ 95, shotIq ≥ 88 |
| 효과 | baseFoulChance +3% (18% 캡 무시) |
| 적용 순서 | 캡 계산 → Manipulator 보너스 → 파울 트러블 감소 |
| 대표 선수 | Harden, Embiid, Trae Young |

> 기본 공식(drawFoul → 슈팅파울 비율/And-1)과 별도 축에서 작동. 기본 공식은 파울의 "질"을 높이고, Manipulator는 파울의 "양"을 높임.

---

## F. 리바운드 아키타입

> 적용 위치: `reboundLogic.ts` (selectRebounder)
> 설정: `SIM_CONFIG.REBOUND`

### F-1. Harvester (하베스터)

| 항목 | 값 |
|:-----|:---|
| 조건 | offReb ≥ 95 OR defReb ≥ 95 |
| 효과 | 리바운드 선택 점수 ×1.3 |
| 대표 선수 | Andre Drummond, DeAndre Jordan |

### F-2. Raider (레이더)

| 항목 | 값 |
|:-----|:---|
| 조건 | height ≤ 200cm, offReb ≥ 90, vertical ≥ 90 |
| 효과 | 공격 리바운드 선택 점수 ×1.4 (공격 리바운드 전용) |
| 대표 선수 | Dennis Rodman, Charles Barkley |

---

## 기본 공식 (Base Formula)

아키타입과 별개로 **모든 선수에게** 능력치에 비례하여 적용되는 기본 보정:

### drawFoul 기본 공식
- **슈팅파울 비율**: `(drFoul - 70) × 0.0015` (70 기준 ±)
- **And-1 확률**: `(drFoul - 70) × 0.0005` (70 기준 ±)
- baseFoulChance 자체는 미수정 (파울 횟수 안정화)

### hands 기본 공식
- **턴오버 저항**: `(70 - hands) × factor`
  - PostUp/PnR: factor = 0.0015 (고가중)
  - 기타 플레이: factor = 0.0005
- **리바운드 점수**: `hands × 0.1` (calcPower + selectRebounder)

---

## 파일별 아키타입 매핑

| 파일 | 아키타입 |
|:-----|:---------|
| `constants.ts` | 전체 상수 정의 |
| `flowEngine.ts` | A-1~3 (클러치), B-1~3 (Zone hitRate), B-5 (Afterburner) |
| `possessionHandler.ts` | B-3 (Tyrant 블락), B-4 (Levitator), B-6 (Ascendant), C-1~4 (스틸), D-1~4 (블락), E-1 (Manipulator) |
| `reboundLogic.ts` | F-1 (Harvester), F-2 (Raider) |
