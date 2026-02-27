# 독자적 선수 레이팅 생성 작업 기록

## 배경

기존 `meta_players.base_attributes`에 NBA 2K 능력치를 그대로 사용하고 있었음.
저작권 리스크 해소를 위해 **Claude AI의 NBA 지식 기반으로 632명 전원의 35개 속성을 독자 생성**하는 작업을 진행.

- 대상: 443명 로스터 선수 + 189명 FA 풀 = **632명**
- 속성: 35개 (기존 체계 유지, 엔진 수정 불필요)
- 스케일: 20-99

---

## 35개 속성 목록

| 카테고리 | 키 | 설명 |
|----------|-----|------|
| **슈팅** | close | 근거리 슛 (3-10ft) |
| | mid | 미드레인지 |
| | 3c | 코너 3점 |
| | 3_45 | 45도 윙 3점 |
| | 3t | 탑 오브 더 키 3점 |
| | ft | 자유투 |
| | siq | 슛 IQ |
| | ocon | 공격 일관성 |
| **인사이드** | lay | 레이업 |
| | dnk | 던크 |
| | post | 포스트 플레이 |
| | draw | 파울 유도 |
| | hands | 핸즈 |
| **플레이메이킹** | pacc | 패스 정확도 |
| | handl | 볼 핸들링 |
| | spwb | 볼 소유 시 스피드 |
| | piq | 패스 IQ |
| | pvis | 패스 비전 |
| **수비** | idef | 인테리어 디펜스 |
| | pdef | 페리미터 디펜스 |
| | stl | 스틸 |
| | blk | 블락 |
| | hdef | 헬프 디펜스 IQ |
| | pper | 패스 인지력 |
| | dcon | 수비 일관성 |
| **리바운드** | oreb | 공격 리바운드 |
| | dreb | 수비 리바운드 |
| **신체능력** | spd | 스피드 |
| | agi | 민첩성 |
| | str | 근력 |
| | vert | 수직 점프력 |
| | sta | 체력 |
| | hus | 허슬 |
| | dur | 내구성 |
| **기타** | intangibles | 무형 능력 (리더십, 클러치) |

---

## 생성 방식

### Claude AI 벌크 방식
Claude Code의 서브에이전트를 활용한 병렬 배치 처리.

- 632명을 9개 그룹으로 분할 (팀별 6그룹 + FA 3그룹)
- 각 그룹을 독립 서브에이전트가 처리
- 에이전트에게 선수 정보(이름, 포지션, 나이, 키/체중, 팀)와 스케일 가이드를 제공
- 에이전트가 NBA 지식 기반으로 35개 속성을 JSON으로 출력

### 배치 구성
| 그룹 | 팀 | 파일 |
|------|-----|------|
| group_01 | ATL, BKN, BOS, CHA, CHI | partial/group_01.json |
| group_02 | CLE, DAL, DEN, DET, GS | partial/group_02.json |
| group_03 | HOU, IND, LAM, LAW, MEM | partial/group_03.json |
| group_04 | MIA, MIL, MIN, NO, NYK | partial/group_04.json |
| group_05 | OKC, ORL, PHI, PHX, POR | partial/group_05.json |
| group_06 | SA, SAC, TOR, UTA, WAS | partial/group_06.json |
| group_fa1 | FA 1차 (63명) | partial/group_fa1.json |
| group_fa2 | FA 2차 (63명) | partial/group_fa2.json |
| group_fa3 | FA 3차 (63명) | partial/group_fa3.json |

### 스케일 가이드 (프롬프트에 포함)
- 95-99: 리그 역대급 (현역 1-2명)
- 90-94: 리그 최상위 (현역 3-5명)
- 83-89: 올스타급
- 75-82: 주전급
- 67-74: 로테이션 선수
- 55-66: 벤치 하위
- 40-54: 리그 최하위 수준
- 20-39: 해당 능력이 극히 부족

---

## 후처리 파이프라인

### 1. 병합 (`scripts/generateRatings/merge.mjs`)
9개 배치 파일을 하나로 병합.
- 에이전트별 JSON 포맷이 달랐음 (Format A: `{UUID: attrs}`, Format B: `[{id, attributes}]`)
- 일부 에이전트가 UUID를 8자로 절삭 → players.json prefix 매칭으로 해결
- 결과: **632/632명 병합 완료** → `scripts/output/ratings_2025.json`

### 2. 정확도 수정 (`scripts/generateRatings/fix.mjs`)
AI가 부정확하게 평가한 선수들을 수동 보정.

| 선수 | 수정 내용 | 이유 |
|------|-----------|------|
| 팀 던컨 | post 72→95, idef 74→94, blk 60→88, 3c 72→30, spd 86→68 | "빅 펀더멘탈" 포스트/수비 과소평가, 3PT/스피드 과대평가 |
| 카림 압둘자바 | close 88→95, post 88→96, blk 60→88, idef 58→90 | 역대급 센터의 블락/수비 과소평가 |
| 칼 말론 | post 72→90, str 90→95, sta 80→94 | 포스트 플레이/체력 과소평가 |
| 러셀 웨스트브룩 | handl 62→80, lay 75→82, spd 78→84 | 핸들링/스피드 과소평가 |
| 찰스 바클리 | 3c 68→40, lay 80→90 | 3PT 과대평가 |
| 트레이시 맥그래디 | mid 88→92, close 86→90 | 미드레인지 과소평가 |

**원칙**: 아키타입 임계값에 맞추기 위한 조정은 하지 않음. 순수하게 선수 능력치의 정확도만 기준으로 수정.

### 3. 검증 (`scripts/generateRatings/validate.mjs`)
인게임 `calculateOvr()` 공식을 완전 복제하여 OVR 분포 검증.

### 4. SQL 생성 (`scripts/generateRatings/generateSql.mjs`)
Supabase 적용용 SQL 생성.
- JSONB `||` 연산자로 35개 속성만 업데이트 (기존 필드 보존)
- 결과: `scripts/output/update_ratings.sql` (632 UPDATE문, 286.5 KB)

---

## OVR 계산 버그 발견 및 수정

### 발견된 버그: potential이 OVR에 미반영

`overallWeights.ts`의 `POSITION_WEIGHTS`에 potential 가중치가 설정되어 있었으나:
```
PG: potential=15, SG: potential=20, SF: potential=11, PF: potential=16, C: potential=15
```

`dataMapper.ts`에서 `ovrInput`에 potential을 포함하지 않아, `calculateOvr()` 내부에서 항상 기본값 70으로 처리되고 있었음.

### 수정 (`services/dataMapper.ts`)
```typescript
// 수정 전
const ovrInput = { ...statsObj, ins, out, plm, def, reb, ath };

// 수정 후
const potentialForOvr = (potentialRaw && !isNaN(potentialRaw)) ? potentialRaw : 75;
const ovrInput = { ...statsObj, ins, out, plm, def, reb, ath, potential: potentialForOvr };
```

- `potentialRaw`는 `base_attributes.pot`에서 읽어오는 값 (72-99 범위, 평균 85)
- 없을 경우 기본값 75 (이전의 70보다 합리적인 수준)

### OVR 분포 변화

| 지표 | height만 반영 | height + potential 반영 |
|------|--------------|----------------------|
| 평균 | 75.5 | **76.5** |
| 표준편차 | 6.0 | **6.4** |
| 최소 | 59 | **60** |
| 최대 | 93 | **95** |
| 67 미만 | 29명 | **19명** |

### 최종 OVR 구간별 분포
```
  90+:  22명
85-89:  57명
80-84:  94명
75-79: 199명
70-74: 183명
67-69:  58명
  <67:  19명
```

---

## 최종 검증 결과

### Top 10 OVR
| OVR | 선수 | 팀 |
|-----|------|-----|
| 95 | 니콜라 요키치 | DEN |
| 95 | 마이클 조던 | FA |
| 95 | 윌트 체임벌린 | FA |
| 93 | 샤킬 오닐 | FA |
| 93 | 카림 압둘자바 | FA |
| 93 | 하킴 올라주원 | FA |
| 92 | 앤서니 데이비스 | DAL |
| 92 | 케빈 듀란트 | HOU |
| 92 | 르브론 제임스 | LAM |
| 92 | 코비 브라이언트 | FA |

### 포지션별 주요 속성 평균
```
 POS handl  pvis   spd   str   blk  post  idef  pdef    3c  oreb  dreb
  PG    77    74    79    66    40    47    62    67    70    38    49
  SG    68    64    77    70    46    49    64    70    73    42    54
  SF    64    63    75    73    55    53    67    71    71    49    60
  PF    59    62    71    79    64    64    71    70    64    62    70
   C    50    57    63    81    76    67    75    67    48    71    75
```

포지션 특성이 합리적으로 반영됨:
- PG: 핸들링/패스비전 최고, 블락/포스트/리바운드 최저
- C: 근력/블락/포스트/리바운드 최고, 핸들링/3PT 최저

### 스타 선수 스팟체크 (전원 PASS)
- 커리: 3c=97, 3_45=98, 3t=96, handl=94
- 요키치: pvis=99, post=97, pacc=94
- 야니스: dnk, vert, str 확인
- 르브론: intangibles=94, lay=92
- 웸반야마: blk=97, vert=90
- 조던: mid=96, siq=96, intangibles=99
- 코비: mid=96, siq=94, intangibles=96
- 던컨: post=95, idef=94, intangibles=95

---

## 파일 구조

```
scripts/
├── data/
│   ├── players.json         # meta_players에서 추출한 선수 목록 (632명)
│   └── meta_players.csv     # 원본 CSV (pot 값 등 참조용)
├── generateRatings/
│   ├── merge.mjs            # 9개 배치 병합
│   ├── fix.mjs              # 정확도 수정
│   ├── validate.mjs         # OVR/아키타입/포지션 검증
│   ├── generateSql.mjs      # SQL UPDATE문 생성
│   └── checkPot.mjs         # pot 분포 확인 유틸
└── output/
    ├── ratings_2025.json    # 최종 레이팅 (632명 × 35속성)
    ├── update_ratings.sql   # Supabase 적용용 SQL
    └── partial/             # 배치별 중간 결과
        ├── group_01.json ~ group_06.json
        └── group_fa1.json ~ group_fa3.json
```

---

## 배포 주의사항

1. **동시 배포 필수**: `update_ratings.sql` (DB)과 `dataMapper.ts` potential 수정 (코드)을 함께 배포해야 OVR 일관성 유지
2. **기존 세이브 영향**: potential 반영으로 모든 선수의 OVR이 변경됨. 기존 유저의 인게임 OVR이 달라질 수 있음
3. **아키타입 임계값**: 레이팅 정확도 우선으로 생성했으므로 일부 아키타입(The Closer 23명, Ice in Veins 28명)이 목표(1-5명)보다 많음. 필요 시 아키타입 임계값을 조정할 것
