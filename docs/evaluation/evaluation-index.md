# Evaluation 디렉토리 인덱스

> NBA-GM-SIM 선수 평가 시스템 — 능력치 기준, 등급표, 변경 이력 전체 문서 허브

---

## 디렉토리 구조

```
docs/evaluation/
├── evaluation-index.md      ← 지금 이 파일 (전체 허브)
├── skill-rubric.md          ← 현행 평가 기준 (36개 능력치 × 6구간 × 3계층)
├── ovr-engine.md            ← OVR 산출 엔진 설명
├── new-player-process.md    ← 신규 선수 추가 7단계 프로세스
├── rating-generation.md     ← CSV→JSONB 생성 파이프라인
├── rating-tuning.md         ← 능력치 세부 튜닝 가이드
├── rating-standards.md      ← [LEGACY] 구버전 기준서 (skill-rubric으로 대체됨)
│
├── current/                 ← 현역 선수 + 2026 드래프트 프로스펙트 (609명)
│   ├── index.md             ← 현역 등급 시스템 개요 + Position Score 공식
│   ├── pg.md / sg.md / sf.md / pf.md / c.md   ← 포지션별 등급표
│   ├── changes-pg.md ~ changes-c.md            ← 능력치 수정 이력
│   └── custom-overrides-log.md                 ← 올타임 전성기 보정 이력
│
└── players/                 ← 올타임 로스터 (850명, 역대 전성기 기준)
    ├── players.md           ← 올타임 등급 시스템 개요 + 임계값
    └── pg.md / sg.md / sf.md / pf.md / c.md   ← 포지션별 등급표 (Score + 산정근거)
```

---

## 문서별 역할

### 핵심 기준서

| 문서 | 용도 | 참조 시점 |
|------|------|----------|
| [skill-rubric.md](skill-rubric.md) | **현행 평가 기준** — 36개 능력치 × 6구간 × 3계층 (엔진결과/플레이묘사/스탯참고) | 능력치 설정·검증 시 항상 |
| [ovr-engine.md](ovr-engine.md) | OVR 산출 공식 (아키타입 보너스 포함) | OVR 관련 작업 시 |
| [new-player-process.md](new-player-process.md) | 신규 선수 추가 7단계 프로세스 | 새 선수 추가 시 |
| [rating-generation.md](rating-generation.md) | CSV → JSONB 변환 파이프라인 | 시즌 데이터 업데이트 시 |
| [rating-tuning.md](rating-tuning.md) | 밸런스 조정, 개별 선수 레이팅 수정 가이드 | 능력치 밸런싱 시 |
| ~~rating-standards.md~~ | **[LEGACY]** 구버전 7구간 스케일 기준서 — `skill-rubric.md`로 대체됨 | 참조 불필요 |

---

## 현역 선수 등급표 (`current/`)

> **대상**: 현역 444명 (`base_team_id IS NOT NULL`) + 2026 드래프트 프로스펙트 165명 = **총 609명**
> **기준**: Skill Rubric 절대 기술 기준 (포지션 무관) × 포지션별 Position Score

### Position Score 공식

| 포지션 | 공식 |
|--------|------|
| PG | `handl×0.22 + piq×0.15 + pvis×0.13 + 3pt평균×0.12 + siq×0.10 + pdef×0.10 + stl×0.08 + intang×0.06 + spd×0.04` |
| SG | `3pt평균×0.20 + pdef×0.14 + siq×0.14 + handl×0.12 + intang×0.10 + lay×0.10 + obm×0.08 + stl×0.07 + spd×0.05` |
| SF | `pdef×0.16 + 3pt평균×0.16 + lay×0.12 + intang×0.12 + siq×0.10 + handl×0.10 + idef×0.08 + dreb×0.08 + stl×0.08` |
| PF | `dreb×0.16 + idef×0.14 + lay×0.13 + post×0.12 + 3pt평균×0.12 + pdef×0.10 + oreb×0.09 + intang×0.08 + str×0.06` |
| C  | `idef×0.22 + dreb×0.16 + post×0.14 + blk×0.12 + oreb×0.10 + str×0.08 + intang×0.08 + piq×0.06 + dnk×0.04` |

> `3pt평균` = `(3c + 3_45 + 3t) / 3`

### 현역 등급 파일

| 포지션 | 등급표 | 변경이력 | 현역 | 프로스펙트 | 합계 |
|--------|-------|---------|------|-----------|------|
| PG | [pg.md](current/pg.md) | [changes](current/changes-pg.md) | 90명 | 33명 | 123명 |
| SG | [sg.md](current/sg.md) | [changes](current/changes-sg.md) | 103명 | 34명 | 137명 |
| SF | [sf.md](current/sf.md) | [changes](current/changes-sf.md) | 71명 | 36명 | 107명 |
| PF | [pf.md](current/pf.md) | [changes](current/changes-pf.md) | 84명 | 33명 | 117명 |
| C  | [c.md](current/c.md)   | [changes](current/changes-c.md)  | 96명 | 29명 | 125명 |
| **합계** | | | **444명** | **165명** | **609명** |

### 올타임 전성기 보정 (custom_overrides)

→ **[custom-overrides-log.md](current/custom-overrides-log.md)** 참조

`include_alltime = TRUE`인 현역 444명 전원에 전성기 기준 능력치 설정 완료:
- ≤27세: `{}` (현재가 전성기)
- 28세+: 36개 능력치 전부 전성기 기준값 설정

---

## 올타임 로스터 등급표 (`players/`)

> **대상**: 역대 전성기 기준 850명 (현역 + 레전드)
> **기준**: 각 선수의 커리어 최전성기 능력치 기준 Position Score

| 포지션 | 파일 | 선수 수 |
|--------|------|---------|
| PG | [pg.md](players/pg.md) | 190명 |
| SG | [sg.md](players/sg.md) | 219명 |
| SF | [sf.md](players/sf.md) | 133명 |
| PF | [pf.md](players/pf.md) | 152명 |
| C  | [c.md](players/c.md)   | 156명 |

> **올타임 vs 현역 차이**: 올타임 S+ 임계값 ≥88~89 수준. 현역보다 높은 이유는 역대 최전성기 기준이기 때문.

---

## Skill Rubric 밴드 (요약)

| 밴드 | 범위 | 설명 |
|------|------|------|
| 역대급 | 95–99 | NBA 역사 해당 스킬 Top 3 이내 |
| 엘리트 | 88–94 | 현역 상위 1~3% |
| 우수선발 | 78–87 | 상위 10~15%, 올스타급 |
| 리그평균 | 65–77 | 주전 수준 |
| 로테이션 | 50–64 | 벤치 상위, 특정 상황 제한 |
| 심각한약점 | 20–49 | 해당 스킬 심각한 약점 |

> 전체 루브릭: [`skill-rubric.md`](skill-rubric.md)
