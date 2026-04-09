# 선수 능력치 수동 편집 이력

> 이 문서는 `player-editor` 에이전트가 자동으로 기록합니다.
> 에이전트는 매 호출마다 이 문서를 먼저 읽고 컨텍스트를 복원합니다.
>
> **기록 규칙**:
> - 날짜별 세션 단위로 묶음
> - 같은 선수가 같은 세션에서 여러 번 편집되면 각각 별도 항목
> - 기존 항목 수정/삭제 금지 (이력 무결성)

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
