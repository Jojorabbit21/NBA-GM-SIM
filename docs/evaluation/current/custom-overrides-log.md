# custom_overrides 전성기 보정 작업 이력

> **작업일**: 2026-03-23
> **대상**: `include_alltime = TRUE`인 현역 선수 전원
> **목적**: 올타임 모드에서 각 선수의 커리어 최전성기 능력치를 보여주기 위한 `custom_overrides` 설정

---

## 개요

### 배경

`meta_players.base_attributes`에는 현재 시즌 기준 능력치가 저장된다.
올타임 모드(`include_alltime = TRUE`)에서는 역대 최전성기 기준 능력치가 필요하므로, `base_attributes->'custom_overrides'` 서브키에 전성기 보정값을 저장한다.

### 병합 방식

올타임 모드에서 `custom_overrides`는 `base_attributes` 위에 병합 적용된다:
```
실제 능력치 = base_attributes + custom_overrides (override 우선)
```

### 설정 기준

- **≤27세 선수**: `{}` (빈 객체) — 현재 기준 능력치가 전성기이거나 전성기 미도달
- **28세+ 선수**: 36개 능력치 전부를 전성기 기준값으로 설정
  - 전성기가 현재보다 높으면 → 높은 값 설정 (복원)
  - 전성기 이후 발전된 스킬(예: 3점슈팅을 나중에 개발한 경우) → prime 시절 LOWER 값 설정

---

## 실행 현황

### Phase 1: 기본 설정 (벌크 SQL)

```sql
-- ≤27세: 빈 custom_overrides 설정
UPDATE meta_players
SET base_attributes = jsonb_set(base_attributes, '{custom_overrides}', '{}')
WHERE include_alltime = TRUE
  AND base_team_id IS NOT NULL
  AND NOT (base_attributes ? 'custom_overrides')
  AND (base_attributes->>'age')::int <= 27;
-- 결과: 305명 업데이트
```

### Phase 2: 28세+ 물리 능력치 설정

물리 능력치(spd/agi/vert/str/dur/sta/hus)를 전성기 기준으로 포지션별 에이전트가 설정.

| 포지션 | 28세+ 선수 수 | 상태 |
|--------|------------|------|
| PG | 27명 | 완료 |
| SG | 28명 | 완료 |
| SF | 21명 | 완료 |
| PF | 29명 | 완료 |
| C  | 34명 | 완료 |

### Phase 3: 전성기 스킬 능력치 통합 설정 (2026-03-23)

36개 능력치 전체를 MERGE 방식으로 설정 완료.
물리 능력치 기존 값 보존 + 스킬 능력치 추가.

---

## 포지션별 주요 선수 전성기 설정값

### PG

| 선수 | 나이 | 전성기 시즌 | 주요 전성기 값 |
|------|------|----------|--------------|
| 마이크 콘리 | 38 | 2015-19 멤피스 | spd=92, handl=88, pdef=85, stl=85 |
| 스테판 커리 | 37 | 2015-16 | 3c=99, 3_45=99, spwb=99, handl=96, intangibles=95 |
| 러셀 웨스트브룩 | 37 | 2015-17 | spd=96, vert=95, oreb=75, dnk=96, lay=95 |
| 데미안 릴라드 | 35 | 2019-22 | 3_45=95, handl=92, intangibles=88, ft=93 |
| 즈루 홀리데이 | 35 | 2018-21 | stl=92, pdef=92, siq=85, dcon=90 |
| 론조 볼 | 28 | 2021-22 부상 전 | spd=92, pvis=92, stl=90, pdef=88 |

### SG

| 선수 | 나이 | 전성기 시즌 | 주요 전성기 값 |
|------|------|----------|--------------|
| 클레이 탐슨 | 35 | 2018-19 | 3c=95, 3_45=95, spwb=95, ocon=82 |
| 에릭 고든 | 37 | 2014-17 | spd=92, 3_45=90, spwb=85 |
| 세스 커리 | 35 | 2020-22 | 3c=95, 3_45=95, spwb=95, ft=90 |
| 마커스 스마트 | 31 | 2020-22 DPOY | stl=92, siq=92, pdef=95, lock=90 |
| 잭 라빈 | 30 | 2020-22 | vert=95, handl=92, dnk=92, lay=92 |
| 도노반 미첼 | 29 | 현재 | spd=92, lay=92, close=90, intangibles=85 |

### SF

| 선수 | 나이 | 전성기 시즌 | 주요 전성기 값 |
|------|------|----------|--------------|
| 르브론 제임스 | 41 | 2011-13 마이애미 | lay=97, piq=95, ocon=95, str=95 (이미 설정됨) |
| 케빈 듀란트 | 37 | 2012-16 OKC | mid=95, ft=92, blk=82, post=82 |
| 카와이 레너드 | 34 | 2016-19 | stl=92, pdef=95, lock=95, intangibles=90 |
| 지미 버틀러 | 36 | 2018-20 | stl=90, pdef=92, hus=95, draw=90 |
| 더마 드로잔 | 36 | 2017-22 | mid=93 (base 유지), ocon=90, post=78 |
| OG 아누노비 | 28 | 현재 | stl=90, pdef=92, lock=85, siq=88 |

### PF

| 선수 | 나이 | 전성기 시즌 | 주요 전성기 값 |
|------|------|----------|--------------|
| 드레이먼드 그린 | 35 | 2015-18 | siq=95, intangibles=95, pvis=90, pper=90 |
| 야니스 안테토쿤보 | 31 | 2018-현재 | lay=95, dnk=95, idef/hdef=90, blk=88 |
| 폴 조지 | 35 | 2018-20 OKC | pdef=90, stl=88, 3_45=90, intangibles=85 |
| 줄리어스 랜들 | 31 | 2020-21 올스타 | handl=85, mid=82, ocon=85, draw=78 |
| 조나단 아이작 | 28 | 2019-20 부상 전 | blk=85, pdef=88, stl=82, idef=78 |
| 라우리 마카넨 | 28 | 현재 | 3_45=90, 3c=88, mid=85 (스트레치 빅) |

### C

| 선수 | 나이 | 전성기 시즌 | 주요 전성기 값 |
|------|------|----------|--------------|
| 니콜라 요키치 | 31 | 현재 2× MVP | piq=98, pvis=98, pacc=98, intangibles=95 |
| 루디 고베어 | 33 | 2018-22 3× DPOY | idef=95, hdef=95, blk=95, dreb=92 |
| 앤서니 데이비스 | 32 | 2017-20 | idef=95, blk=92, dreb=90, stl=82 |
| 조엘 엠비드 | 31 | 2021-23 MVP | post=92, idef=92, blk=90, draw=90 |
| 디안드레 조던 | 37 | 2013-16 | dreb=95, oreb=85, blk=85 (ft=38 약점) |
| 뱀 아데바요 | 28 | 현재 | idef=90, hdef=90, str=88, dcon=88 |

---

## 능력치 정의 (이 작업에서 사용한 키)

| 키 | 설명 |
|----|------|
| `ocon` | offensive consistency — 공격 일관성 |
| `dcon` | defensive consistency — 수비 일관성 |
| `pacc` | pass accuracy |
| `pper` | pass perception |
| `obm` | off-ball movement |
| `spwb` | spot-up shooting (와이드오픈 3점) |
| `handl` | ball handling |
| `piq` | passing IQ |
| `pvis` | pass vision |
| `siq` | shot IQ / defensive reads |
| `hdef` | help defense |
| `lock` | lockdown defending |

---

## 검증 쿼리

```sql
-- 포지션별 설정 현황 확인
SELECT
  position,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE base_attributes ? 'custom_overrides') as has_key,
  COUNT(*) FILTER (WHERE (base_attributes->'custom_overrides')::text != '{}') as has_data,
  COUNT(*) FILTER (WHERE jsonb_array_length(
    ARRAY(SELECT jsonb_object_keys(base_attributes->'custom_overrides'))::jsonb
  ) >= 30) as full_36
FROM meta_players
WHERE include_alltime = TRUE AND base_team_id IS NOT NULL
GROUP BY position ORDER BY position;
```

```sql
-- 특정 선수 custom_overrides 확인
SELECT name, base_attributes->'custom_overrides' as prime
FROM meta_players WHERE name = '스테판 커리';
```

---

## 작업 원칙 (향후 수정 시 참조)

1. **custom_overrides 수정 시 base_attributes 원본 절대 변경 금지**
   → 올타임/현역 모드 공유 구조 유지

2. **MERGE SQL 패턴 사용** (기존 값 보존):
   ```sql
   UPDATE meta_players
   SET base_attributes = jsonb_set(
     base_attributes, '{custom_overrides}',
     (base_attributes->'custom_overrides') || '{"attr":val}'::jsonb
   )
   WHERE name = '선수명';
   ```

3. **전성기 기준**: 커리어 최전성기 시즌 기준. 부상으로 쇠퇴한 경우 부상 이전 전성기 기준.

4. **물리 능력치 퇴화 반영**: 나이든 선수는 spd/agi/vert/str/sta가 현재보다 높게 설정됨.

5. **스킬 능력치 예외**: 3점슈팅 등 나중에 개발된 스킬은 전성기 시절 LOWER값으로 설정
   예) 웨스트브룩: 3c=50, 3_45=52 (전성기 시절 3점 약점이었음)
