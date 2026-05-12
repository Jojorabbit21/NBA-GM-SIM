# 선수 능력치 수동 편집 이력

> 이 문서는 `player-editor` / `player-evaluator` 에이전트가 자동으로 기록합니다.
> 에이전트는 매 호출마다 이 문서를 먼저 읽고 컨텍스트를 복원합니다.
>
> **기록 규칙**:
> - 날짜별 세션 단위로 묶음
> - 같은 선수가 같은 세션에서 여러 번 편집되면 각각 별도 항목
> - 기존 항목 수정/삭제 금지 (이력 무결성)

## 🚨 고정 규칙 — 모든 에이전트 필수 준수

1. **salary / num 절대 건드리지 말 것** — 사용자가 명시적으로 값을 지시한 경우에만 저장. 추정·조사·"적정값"으로 임의 수정 금지.
2. **올타임 레전드 contractyears = 1 고정** — FA 풀 올타임 선수는 항상 단년 계약.
3. **평가 작업 범위** — 능력치(스탯) 수치만 수정. 계약·연봉·등번호·popularity는 별도 지시 없으면 손대지 않음.

---

## 2026-04-23

### 찰스 바클리 (PF) — 2026-04-23
- 작업: 기존 선수 평가·수정 (모드 1: evaluate)
- 전성기: 1992-93 PHO (29세) — 25.6pts / 12.2reb / 5.1ast / 1.6stl / 1.0blk, FG% .520, TS% .596, MVP 수상, All-NBA 1st Team
- DB ID: 243d1414-0746-4695-a96a-8d3f845dd5bc
- OVR: 90(구) → 83 (rawOVR 85.7, eval-player.ts 재계산)
- 아키타입: Post Scorer (primary) / Post Scoring Wing (secondary)
- 태그: Elite Finisher / Foul Merchant / Glass Cleaner
- 등번호: 34번 (StatMuse — 1992-93 PHO 기준)
- 연봉: $2,420,000 (eskimo.com 1992-93 PHO 기준)
- 보고서: docs/evaluation/reports/charles-barkley_v1.html

| 능력치 | 전 | 후 | 이유 |
|--------|----|----|------|
| closeShot | 95 | 93 | 역대급(95-99) 과팽창, 엘리트 상단(88-94) 적정 |
| layup | 92 | 90 | 엘리트 하단으로 교정 |
| dunk | 90 | 85 | 196cm PF, 우수선발(78-87) 상단 적정 |
| postPlay | 95 | 92 | 역대급 과팽창, 엘리트 상단(88-94) 적정 |
| drawFoul | 85 | 88 | fta_rate .423(1992-93), Per36 FTA ≈7.4 → 엘리트 하단 |
| midRange | 80 | 78 | 미드레인지 특화 아닌 포스트 위주, 우수선발 하단 |
| threeTop | 38 | 35 | 3점 약점, 심각한약점 밴드 하단 |
| shotIq | 88 | 85 | TS% .596(MVP시즌) — 우수선발 상단 적정 |
| spdBall | 80 | 62 | 스팟업 비전문, 포스트 빅맨 — 로테이션 밴드 |
| offConsist | 88 | 85 | 우수선발 중단 교정 |
| handling | 85 | 82 | TOV% 12.5%(MVP), AST% 21.2% — 우수선발 중단 |
| passIq | 82 | 80 | 5.1ast/경기, PF 기준 우수선발 중단 |
| passVision | 78 | 75 | 리그평균 상단 교정 |
| passAcc | 82 | 72 | PF 포스트 선수, 리그평균 하단 |
| offBallMovement | 82 | 72 | 포스트 위주, 오프볼 PF 평균 |
| vertical | 88 | 85 | 우수선발 상단 교정 |
| intangibles | 85 | 88 | MVP 수상, 리더십 — 엘리트 하단 상향 |
| intDef | 72 | 68 | BLK% 1.6%, 0.96blk/36 — 리그평균 하단 |
| steal | 62 | 68 | STL% 2.0%, 1.53stl/36 — 리그평균 중단 상향 |
| defReb | 90 | 88 | drb_pct 26.3%(1992-93), 엘리트 하단 교정 |
| offReb | 95 | 92 | orb_pct 9.5%(1992-93), PHI시절 13.4~16.7% — 엘리트 중단 |
| popularity | local:55,national:60 | local:80,national:80 | include_alltime=TRUE 고정값 적용 |
| contractyears | 3 | 1 | 올타임 레전드 FA 고정 규칙 |
| num | (없음/26) | 34 | StatMuse 1992-93 PHO 조회 |
| salary | 26 | 2420000 | eskimo.com 1992-93 PHO 조회 |

---

### 엘빈 헤이즈 (PF) — 2026-04-23
- 작업: 기존 선수 평가·수정 (모드 1: evaluate)
- 전성기: 1973-74 CAP (28세) — 21.4pts / 18.1reb / 2.0ast / 3.0blk / 1.1stl, FG% 42.3%, FT% 72.1%, 81경기
- DB ID: 6537fc0c-dd98-4877-ae8c-5b32291f0b58
- OVR: 88(구) → 82 (rawOVR 85.1, eval-player.ts 재계산)
- 아키타입: Post Scorer (primary) / Rebounding Big (secondary)
- 태그: Glass Cleaner / High Motor / Reliable 2-Way
- 등번호: 11번 (StatMuse — 1973-74 CAP 기준)
- 연봉: $1,000,000 (1970년대 초반 데이터 미수록 — 고정값 적용)
- 나이 수정: 27 → 28 (전성기 1973-74 시즌 기준)
- 보고서: docs/evaluation/reports/elvin-hayes_v1.html

| 능력치 | 전 | 후 | 이유 |
|--------|----|----|------|
| age | 27 | 28 | 전성기 1973-74 CAP 기준 나이 수정 |
| ovr | 88 | 82 | eval-player.ts 재계산 (rawOVR 85.1) |
| postPlay | 95 | 90 | 역대급(95-99)은 역사 Top 3 기준, 엘리트 상단(88-94)이 적절 |
| midRange | 85 | 78 | 포스트 피니셔, 미드레인지 주무기 아님 — 우수선발 하단 |
| drawFoul | 82 | 75 | Per 36 FTA ≈ 4.94개, 리그평균 상단 |
| ft | 67 | 70 | 전성기 FT% .721(1973-74), 리그평균 중간 |
| offBallMovement | 78 | 65 | 포스트 전용 빅맨, 오프볼 컷보다 포스트 세팅 주력 |
| popularity | local:53,national:58 | local:80,national:80 | include_alltime=TRUE 고정값 적용 |
| contractyears | 3 | 1 | 올타임 레전드 FA 고정 규칙 |
| num | (없음) | 11 | StatMuse 조회 |
| salary | 22 | 1000000 | 1985년 이전 선수 고정값 적용 |

---

### 안토완 제이미슨 (PF) — 2026-04-23
- 작업: 기존 선수 평가·수정 (모드 1: evaluate), 이름 오타 수정 포함
- 전성기: 2008-09 WAS (32세) — 22.2pts / 8.9reb / 1.9ast / 1.2stl, FG% 46.8%, TS% 54.9%, 81경기 전경기 선발
- DB ID: ac538042-dca8-407f-a53f-88be945a906d
- OVR: 82(구) → 76 (rawOVR 72.3, eval-player.ts 재계산)
- 아키타입: Post Scoring Wing (primary) / Post Scorer (secondary)
- 등번호: 4 (StatMuse — 2008-09 WAS 기준)
- 연봉: $9,923,285 (eskimo.com 2008-09 기준)
- 이름 수정: "안턴 제이미슨" → "안토완 제이미슨" (오타 수정)
- 나이 수정: 28 → 32 (전성기 시즌 기준)
- 보고서: docs/evaluation/reports/antawn-jamison_v1.html

| 능력치 | 전 | 후 | 이유 |
|--------|----|----|------|
| age | 28 | 32 | 전성기 2008-09 WAS 기준 나이 수정 |
| ovr | 82 | 76 | eval-player.ts 재계산 (rawOVR 72.3) |
| dunk | 72 | 68 | 32세 나이, 덩크 특출함 없음 |
| postPlay | 82 | 84 | 포스트업 핵심 무기, 우수선발 하단 |
| drawFoul | 72 | 82 | Per36 FTA 5.28회, FTr 31.4% → 우수선발 |
| midRange | 85 | 88 | FG% 46.8% 풀시즌 미드 특화 → 엘리트 |
| threeCorner | 55 | 62 | 3P% 35.1%, 3.9시도/경기 → 로테이션 상단 |
| three45 | 52 | 62 | 동일 3점 패턴 교정 |
| threeTop | 50 | 58 | 탑 3점 시도 존재, 하단 로테이션 |
| ft | 76 | 78 | FT% 75.4% → 리그평균 상단 |
| spdBall | 52 | 58 | 와이드오픈 3점 제한적 |
| offConsist | 78 | 80 | 81경기 전경기 선발, 득점 안정성 |
| handling | 55 | 58 | 미드레인지 풀업 위주 |
| passIq | 55 | 58 | AST% 9.1% → 리그평균 하단 |
| passVision | 48 | 50 | 빅맨 수준으로 소폭 조정 |
| passPerc | 42 | 45 | 소폭 상향 |
| perDef | 42 | 45 | 수비 약점으로 정평, 최저 밴드 유지 |
| helpDefIq | 42 | 45 | 소폭 조정 |
| steal | 48 | 58 | STL 1.2/경기 Per36 ≈1.13 → 로테이션 중간 |
| blk | 42 | 38 | BLK 0.3/경기 Per36 ≈0.28 → 심각한약점 |
| defReb | 72 | 75 | DRB% 20.5%, 리그평균 상단 |
| offReb | 72 | 75 | ORB% 7.2%, 리그평균~우수 경계 |
| boxOut | 68 | 72 | 리바운드 포지셔닝 강점 |
| speed | 68 | 65 | 32세 전성기 후반 |
| vertical | 72 | 68 | 점프력 평균 수준 |
| strength | 78 | 80 | 102kg 파워포워드 체구 |
| stamina | 82 | 80 | 38분+ 소화하나 36세 이후 급감 반영 |
| hustle | 65 | 68 | 리바운드 적극성 |
| num | (없음) | 4 | StatMuse 조회 |
| salary | 16 | 9923285 | eskimo.com 2008-09 조회 |

---

### 앙투안 워커 (SF) — 2026-04-23
- 작업: 신규 선수 추가 (모드 2: add), 올타임 로스터 (include_alltime=TRUE)
- 전성기: 2001-02 BOS (26세) — 22.1pts / 8.8reb / 5.0ast, 3P 34.4%(8.0시도/경기), 올스타 선정
- DB ID: 70c9f7d0-1fae-4c01-b767-90189a3e75e8
- OVR: 72 (rawOVR 63.0)
- 아키타입: Post Scoring Wing (primary) / Shot Creator (secondary)
- 등번호: 8 (StatMuse — BOS 1996-03 / DAL / MIA 기준)
- 연봉: $10,130,000 (eskimo.com 2000-01 BOS)
- custom_overrides: {} (현재 base = 전성기 기준으로 직접 입력됨)
- 보고서: docs/evaluation/reports/antoine-walker_v1.html
- 데이터 소스: StatMuse (per-game, 3점 시도/성공률), eskimo.com 2000-01 연봉, StatMuse 등번호
- 주요 능력치: defReb=78 (SF로서 7.6개/36분), three45=72 (8.0시도/경기 34.4%), passIq=72 (5.0ast/경기), shotIq=62 (낮은 FG% 39.4% 반영)
- INSERT SQL:
  ```sql
  INSERT INTO meta_players (name, position, include_alltime, base_team_id, draft_year, base_attributes)
  VALUES ('Antoine Walker', 'SF', TRUE, NULL, 1996, '{...36개능력치...}'::jsonb)
  ```
- UPDATE (defReb/offReb/boxOut 조정):
  ```sql
  UPDATE meta_players SET base_attributes = base_attributes || '{"defReb": 78, "offReb": 68, "boxOut": 72}'::jsonb WHERE name = 'Antoine Walker';
  ```

---

### 아마레 스타더마이어 (PF) — 2026-04-23
- 작업: 신규 선수 추가 (모드 2: add), 올타임 로스터 (include_alltime=TRUE)
- 전성기: 2007-08 PHX (25세) — TS% 65.6%, FG% 59.0%, BLK/36 2.19, FTA/36 9.29
- DB ID: f1526b64-e00d-4665-815c-8b10ef1a8492
- OVR: 79 (rawOVR 77.7)
- 아키타입: Post Scorer (primary) / Two-Way Big (secondary)
- 등번호: 1 (StatMuse — PHX 2006-10 기준)
- 연봉: $13,762,775 (eskimo.com 2007-08 PHX)
- custom_overrides: {} (현재 base = 전성기 기준으로 직접 입력됨)
- 보고서: docs/evaluation/reports/amare-stoudemire_v1.html
- SQL: INSERT INTO meta_players (name, position, include_alltime, base_team_id, base_attributes) VALUES ('Amar''e Stoudemire', 'PF', TRUE, NULL, '{...}'::jsonb)

---

## 2026-04-24

### 데니스 로드먼 (PF) — 2026-04-24
- 작업: 기존 선수 평가·수정 (모드 1: evaluate), v1 능력치 교정 + v2 보고서 작성
- 전성기: 1991-92 DET (30세) — 18.7reb / 9.8pts / 2.3ast, ORB% 18.1%, DRB% 34.1%, TS% 57.4%, All-NBA 3rd Team, All-Def 1st Team
- DB ID: a510c692-9f40-4ad4-9dc9-77cd7e40e92c
- OVR: 83(구) → 82 (rawOVR 85.5, eval-player.ts 재계산)
- 아키타입: Rim Protector (primary) / Rebounding Big (secondary)
- 태그: Glass Cleaner
- 등번호: 10번 (DET/SAS 시절 — 기존 유지)
- 연봉: $1,075,000 (기존 유지)
- 보고서: docs/evaluation/reports/dennis-rodman_v2.html

| 능력치 | 전 | 후 | 이유 |
|--------|----|----|------|
| steal | 65 | 58 | Per36 STL 0.8개 수준, 1.0 미만 → 50-64 밴드 적정 |
| perDef | 90 | 88 | All-Def 1st 7회이나 201cm PF 스위치 수비 → 엘리트 하단 |
| intDef | 88 | 82 | BLK 낮음(0.9/36 전성기), 포스트 블로커 아님 → 우수선발 상단 |
| helpDefIq | 95 | 92 | 엘리트 중단 적정, 역대급(95-99) 과팽창 교정 |
| layup | 72 | 68 | 드라이빙 피니셔 아님, 리바운드 풋업 수준 |
| drawFoul | 48 | 50 | Per36 FTA 1.7~2.6개, 로테이션 하단 소폭 상향 |
| passIq | 60 | 62 | 1995-96~97 3.1ast/경기 반영 소폭 상향 |
| vertical | 85 | 88 | 리바운드 도달 범위 우수, 201cm 대비 점프력 상향 |
| speed | 80 | 78 | 리그평균 적정 수준으로 교정 |
| durability | 85 | 82 | 부상 이력 반영 (62경기 1992-93 등) |
| stamina | 88 | 85 | 40분+ 소화하나 소폭 하향 교정 |
| ovr | 83 | 82 | eval-player.ts 재계산 |

---

### 라마커스 알드리지 (PF) — 2026-04-24
- 작업: 기존 선수 평가·수정 (모드 1: evaluate)
- 전성기: 2017-18 SAS (32세) — 23.1pts / 8.5reb / 2.0ast / 1.2blk, FG% 51.0%, FT% 83.7%, TS% 57.0% | All-NBA 2nd Team, 6× All-Star
- OVR: 82(구) → 79 (rawOVR 77.8, eval-player.ts 재계산)
- 아키타입: Post Scorer (primary) / Post Scoring Wing (secondary)
- 태그: 없음
- 등번호: 12번 (기존 유지)
- 연봉: $16,000,000 (기존 유지)
- 나이 수정: 29 → 32 (전성기 2017-18 기준)
- 보고서: docs/evaluation/reports/lamarcus-aldridge_v1.html

| 능력치 | 전 | 후 | 이유 |
|--------|----|----|------|
| age | 29 | 32 | 전성기 2017-18 SAS 기준 나이 수정 |
| ovr | 82 | 79 | eval-player.ts 재계산 (rawOVR 77.8) |
| midRange | 95 | 92 | 역대급(95-99)은 역사 Top 3 기준. 엘리트(88-94) 상단 적절 — 전체 미드레인지 FG% 42~44% 수준 |
| threeCorner | 38 | 72 | 2017-18 코너 3점 52.6%(38회) — 30회 이상 유효 샘플, 65-77 밴드 |
| three45 | 35 | 45 | 코너 외 윙 3점 실질 성공률 ~13% → 20-49 상단 |
| threeTop | 32 | 35 | 탑 3점 제한, 소폭 상향 |
| ft | 82 | 83 | FT% 83.7% — 우수선발 중단 |
| layup | 82 | 84 | 페인트 FG% 63.6%(569회) — 우수선발 상단 |
| shotIq | 75 | 80 | TS% 57.0% — 우수선발 중단 |
| spdBall | 52 | 58 | 코너 52.6% 성공률 반영, 로테이션 중단 |
| passIq | 62 | 65 | ast/36 2.1개 — 65-77 하단 |
| offBallMovement | 72 | 68 | 포스트 위주, 오프볼 이동 제한적 |
| blk | 72 | 68 | blk/36 1.3개 — 65-77 하단 |
| defReb | 82 | 75 | dreb/36 5.6개 — 65-77 밴드 (현재값 과팽창) |
| offReb | 62 | 68 | oreb/36 3.5개 — 65-77 밴드 |
| intangibles | 78 | 80 | 6× All-Star, All-NBA 2nd Team 2회 |
| popularity | local:45, national:50 | local:80, national:80 | include_alltime=TRUE 고정값 적용 |

---

## 시작일: 2026-04-09

### 제임스 하든 (SG) — 2026-04-09
- 지시 원문: "close CO = 93 / lay CO = 95 / dnk CO = 62 / post CO = 48 / draw CO = 99 / hands CO = 90 / mid CO = 83 / 3c base = 87 / co = 89 / 3_45 base 91 / co = 92 / 3t base 93 / co = 95 / siq co = 84 / ocon co = 81 / pacc base = 90 / co = 85 / handle base = 91 / co = 87 / spwb base = 72 / co = 76 / pvis base = 84 / co = 81 / piq base = 94 / co = 86 / obm base = 73 / co = 72 / stl base = 72 / co = 76 / blk co = 38"
- 대상: base_attributes 루트 + custom_overrides
- 변경:
  | 키 | 전(base) | 후(base) | 전(CO) | 후(CO) |
  |----|---------|---------|--------|--------|
  | close | 88 | 88 | — | 93 |
  | lay | 88 | 88 | — | 95 |
  | dnk | 60 | 60 | 65 | 62 |
  | post | 50 | 50 | 55 | 48 |
  | draw | 98 | 98 | — | 99 |
  | hands | 88 | 88 | 85 | 90 |
  | mid | 82 | 82 | 88 | 83 |
  | 3c | 84 | 87 | 80 | 89 |
  | 3_45 | 94 | 91 | 84 | 92 |
  | 3t | 94 | 93 | 88 | 95 |
  | siq | 91 | 91 | — | 84 |
  | ocon | 85 | 85 | 90 | 81 |
  | pacc | 92 | 90 | 82 | 85 |
  | handl | 96 | 91 | — | 87 |
  | spwb | 80 | 72 | — | 76 |
  | pvis | 92 | 84 | 88 | 81 |
  | piq | 94 | 94 | — | 86 |
  | obm | 81 | 73 | 78 | 72 |
  | stl | 70 | 72 | 85 | 76 |
  | blk | 35 | 35 | 58 | 38 |
- SQL (1/2 — base 루트): `UPDATE meta_players SET base_attributes = base_attributes || '{"3c":87,"3_45":91,"3t":93,"pacc":90,"handl":91,"spwb":72,"pvis":84,"obm":73,"stl":72}'::jsonb WHERE id = '6c2e8452-ff03-4068-9dbe-9699a5fb42eb';`
- SQL (2/2 — custom_overrides): `UPDATE meta_players SET base_attributes = jsonb_set(base_attributes, '{custom_overrides}', COALESCE(base_attributes->'custom_overrides', '{}'::jsonb) || '{"close":93,"lay":95,"dnk":62,"post":48,"draw":99,"hands":90,"mid":83,"3c":89,"3_45":92,"3t":95,"siq":84,"ocon":81,"pacc":85,"handl":87,"spwb":76,"pvis":81,"piq":86,"obm":72,"stl":76,"blk":38}'::jsonb) WHERE id = '6c2e8452-ff03-4068-9dbe-9699a5fb42eb';`
