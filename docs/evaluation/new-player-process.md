# 신규 선수 추가 프로세스

## 개요

새로운 선수를 시스템에 추가할 때의 단계별 프로세스.
드래프트 신인, FA 영입, 레전드 추가 등 모든 경우에 적용.

---

## 전체 흐름

```
1. 선수 정보 수집
      ↓
2. 35개 능력치 평가 (rating-standards.md 참조)
      ↓
3. base_attributes JSON 작성
      ↓
4. 텐던시 데이터 작성 (선택)
      ↓
5. DB 업로드 (meta_players INSERT)
      ↓
6. OVR 검증 + 시뮬레이션 테스트
      ↓
7. 미세 조정
```

---

## Step 1: 선수 정보 수집

### 필수 정보

| 항목 | 소스 | 예시 |
|------|------|------|
| 이름 (한글) | 공식 표기 | 빅터 웸반야마 |
| 포지션 | NBA.com 공식 | C |
| 키 (cm) | NBA.com Player Bio | 224 |
| 몸무게 (kg) | NBA.com Player Bio | 95 |
| 나이 | 생년월일 기준 | 21 |
| 샐러리 ($M) | Spotrac / HoopsHype | 12.2 |
| 계약 잔여 (년) | Spotrac | 3 |
| 소속팀 | NBA.com | sa |

### 스탯 데이터 수집

| 소스 | 수집 항목 |
|------|----------|
| Basketball-Reference | Per-game, Advanced (TS%, BPM, WS, USG%), Shooting splits |
| NBA.com Stats | Shot Dashboard (존별 FG%), Defense Dashboard, Hustle Stats |
| NBA.com Tracking | 주행 속도, 터치, 리바운드 기회 |
| Cleaning the Glass | Rim FG%, Shot frequency by zone, Positional data |

---

## Step 2: 35개 능력치 평가

[rating-standards.md](rating-standards.md)의 각 능력치별 기준에 따라 평가.

### 평가 순서 (권장)

#### Phase A: 앵커 능력치 (핵심 정체성)
포지션/플레이스타일을 결정하는 능력치 먼저:
1. **슈팅**: 3c, 3_45, 3t, mid, ft → 존별 FG% 직접 매핑
2. **인사이드**: lay, dnk, post → Rim FG%, 던크 빈도
3. **플레이메이킹**: handl, pacc, pvis, piq → AST/TO, APG

#### Phase B: 수비/피지컬
4. **수비**: pdef, idef, stl, blk, hdef → 수비 메트릭, DPOY 투표
5. **피지컬**: spd, agi, str, vert → 추적 데이터, 컴바인

#### Phase C: 보조 능력치
6. **나머지**: siq, ocon, dcon, draw, hands, pper, spwb, oreb, dreb
7. **체력**: sta, dur, hus
8. **무형자산**: intangibles → 5-Factor 모델

### 교차 검증 체크리스트

| 검증 항목 | 방법 |
|----------|------|
| ft ≈ 실제 FT% | `ft/100`이 실제 FT%와 ±3% 이내 |
| 3PT 평균 → eFG% 방향 일치 | 3pt 높은 선수의 eFG%가 리그 상위 |
| OVR이 직관과 부합 | 계산된 OVR이 실제 선수 티어와 일치 |
| 아키타입 트리거 확인 | 의도한 아키타입이 발동하는지 / 의도치 않은 발동 없는지 |

---

## Step 3: base_attributes JSON 작성

### 형식

```json
{
    "close": 88, "mid": 72, "3c": 85, "3_45": 82, "3t": 80,
    "ft": 78, "siq": 85, "ocon": 82,
    "lay": 90, "dnk": 95, "post": 45, "draw": 72, "hands": 75,
    "pacc": 65, "handl": 60, "spwb": 88, "piq": 62, "pvis": 58,
    "idef": 92, "pdef": 75, "stl": 65, "blk": 95, "hdef": 82,
    "pper": 72, "dcon": 80,
    "oreb": 70, "dreb": 88,
    "spd": 82, "agi": 78, "str": 72, "vert": 92,
    "sta": 80, "hus": 85, "dur": 88,
    "intangibles": 82, "pot": 95,
    "height": 224, "weight": 95,
    "position": "C", "age": 21, "contractyears": 3
}
```

### JSON 키 매핑 (코드 ↔ CSV)

| CSV 키 | 런타임 속성 | CSV 키 | 런타임 속성 |
|--------|-----------|--------|-----------|
| close | closeShot | idef | intDef |
| mid | midRange | pdef | perDef |
| 3c | threeCorner | stl | steal |
| 3_45 | three45 | blk | blk |
| 3t | threeTop | hdef | helpDefIq |
| ft | ft | pper | passPerc |
| siq | shotIq | dcon | defConsist |
| ocon | offConsist | oreb | offReb |
| lay | layup | dreb | defReb |
| dnk | dunk | spd | speed |
| post | postPlay | agi | agility |
| draw | drawFoul | str | strength |
| hands | hands | vert | vertical |
| pacc | passAcc | sta | stamina |
| handl | handling | hus | hustle |
| spwb | spdBall | dur | durability |
| piq | passIq | pot | potential |
| pvis | passVision | | |

---

## Step 4: 텐던시 데이터 (선택)

텐던시가 없으면 `hiddenTendencies` 해시 기반 폴백이 자동 적용.
정밀한 슈팅 존 분배가 필요하면 텐던시를 직접 설정.

### 텐던시 JSON 형식

```json
{
    "zones": {
        "ra": 35,    // Restricted Area (림)
        "itp": 15,   // In the Paint (페인트)
        "mid": 10,   // 미드레인지
        "cnr": 15,   // 코너 3점
        "p45": 15,   // 45도 윙 3점
        "atb": 10    // 탑 3점
    },
    "lateral_bias": 2   // 0=Strong Left, 1=Slight Left, 2=Slight Right, 3=Strong Right
}
```

참고: zones 합산이 100이 아니어도 자동 정규화됨.

---

## Step 5: DB 업로드

### SQL INSERT

```sql
INSERT INTO meta_players (id, name, position, height, weight, salary, contract_years, base_team_id, base_attributes, tendencies)
VALUES (
    gen_random_uuid(),
    '빅터 웸반야마',
    'C',
    224,
    95,
    12.2,
    3,
    'sa',
    '{...}'::jsonb,    -- Step 3의 JSON
    '{...}'::jsonb     -- Step 4의 JSON (없으면 NULL)
);
```

### 팀 ID 목록

| ID | 팀 | ID | 팀 | ID | 팀 |
|----|----|----|----|----|-----|
| atl | Hawks | dal | Mavericks | mil | Bucks |
| bos | Celtics | den | Nuggets | min | Timberwolves |
| bkn | Nets | det | Pistons | no | Pelicans |
| cha | Hornets | gs | Warriors | ny | Knicks |
| chi | Bulls | hou | Rockets | okc | Thunder |
| cle | Cavaliers | ind | Pacers | orl | Magic |
| phi | 76ers | phx | Suns | por | Trail Blazers |
| sac | Kings | sa | Spurs | tor | Raptors |
| uta | Jazz | was | Wizards | lal | Lakers |
| lac | Clippers | mem | Grizzlies | mia | Heat |

FA (소속팀 없음): `base_team_id = NULL`

---

## Step 6: 검증

### OVR 검증
```
예상 OVR = round(rawAvg × 0.6 + 40)
```
계산된 OVR이 직관적 티어와 맞는지 확인:

| 티어 | OVR 범위 |
|------|---------|
| MVP급 | 93-99 |
| 올스타 | 88-92 |
| 좋은 선발 | 83-87 |
| 선발 | 78-82 |
| 로테이션 | 72-77 |
| 벤치 | 65-71 |
| 말단 | <65 |

### 시뮬레이션 테스트
1. 해당 선수를 포함한 팀으로 3-5경기 시뮬레이션
2. 확인 항목:
   - 선수 스탯 라인이 현실과 유사한지
   - FGA 분배가 능력치 프로필과 일치하는지
   - 의도한 아키타입이 정상 발동하는지
   - USG%가 팀 내 서열과 맞는지

---

## Step 7: 미세 조정

### 흔한 조정 패턴

| 증상 | 원인 | 조정 |
|------|------|------|
| FTA 과다 | draw 과대 | draw -5~10 |
| 3PT 시도 부족 | 3c/3_45/3t 과소 | 해당 존 +5~10 |
| 수비 효과 없음 | pdef/idef 과소 | 포지션에 맞게 +5~10 |
| OVR 너무 높음 | 보조 능력치 인플레 | siq, ocon, dcon 재검토 |
| 아키타입 미발동 | 트리거 임계값 미달 | 해당 능력치 +2~3 (의도적) |
| 의도치 않은 아키타입 | 능력치 조합이 트리거 초과 | 해당 능력치 -2~3 |

### 조정 시 주의
- **ft는 실제 FT%와 반드시 매핑** (엔진이 직접 확률로 사용)
- **mid ≥ 97, intangibles ≥ 90** 등 아키타입 임계값 근처는 신중하게 설정
- 한 번에 여러 능력치를 크게 변경하지 말 것 → 하나씩 조정하며 시뮬 확인

---

## 부록: 시즌 업데이트 체크리스트

시즌이 바뀔 때 전체 로스터를 업데이트하는 경우:

- [ ] FA 이적/트레이드 반영 (base_team_id 변경)
- [ ] 신인 드래프트 선수 추가 (이 프로세스 적용)
- [ ] 은퇴 선수 처리 (base_team_id = NULL 또는 삭제)
- [ ] 계약 연수 갱신 (contractyears - 1)
- [ ] 능력치 업데이트 (성장/하락 반영)
  - 성장기 (21-26세): 핵심 능력치 +2~5/시즌
  - 프라임 (27-31세): 유지 또는 미세 조정
  - 하락기 (32+): spd, agi, vert -2~4/시즌, 스킬 능력치 유지
- [ ] 부상 이력 반영 (dur 조정)
- [ ] 시뮬레이션 검증 (리그 평균 스탯 확인)
