# NBA-GM-SIM Documentation

## 문서 구조

```
docs/
├── index.md              ← 현재 문서 (최상위 인덱스)
│
├── engine/               ← PBP 경기 엔진 (17개)
│   ├── engine-index.md       마스터 인덱스 + 파일↔문서 매핑
│   ├── pbp-engine.md         PBP 엔진 내부 구조 (포세션 8단계)
│   ├── player-usage.md       USG% 현실화, 액터 선택 확률
│   ├── hidden-archetypes.md  12종 히든 아키타입
│   ├── shot-distribution.md  10존 슈팅 분배
│   ├── shot-hit-rate.md      슈팅 적중률 계산
│   ├── hot-cold-streak.md    핫/콜드 스트릭
│   ├── clutch-mechanic.md    클러치 상황 보정
│   ├── ace-stopper.md        에이스 스토퍼 매치업
│   ├── foul-trouble.md       파울 트러블 심리
│   ├── tf-ff-system.md       턴오버/자유투 시스템
│   ├── time-engine.md        포세션 시간 계산
│   ├── fatigue-system.md     체력 소모/회복
│   ├── rotation-algorithm.md 로테이션 매트릭스
│   ├── rebound-logic.md      2단계 리바운드
│   ├── momentum-system.md    모멘텀/런
│   ├── tendency-system.md    히든 텐던시 (5종)
│   ├── tactic-system.md      전술 자동생성 + 슬라이더
│   ├── stat-handlers.md      스탯 기록 파이프라인
│   ├── commentary.md         한국어 PBP 해설
│   └── development/          선수 성장/퇴화 시스템
│       ├── pipeline.md
│       ├── growth-system.md
│       ├── decline-system.md
│       └── attr-config.md
│
├── simulation/           ← 시뮬레이션 운영 시스템 (7개)
│   ├── sim-index.md          인덱스 + 파일↔문서 매핑
│   ├── sim-structure.md      전체 파이프라인 (Hook→Service→Engine)
│   ├── snapshot-caching.md   스냅샷 캐싱/복원 (v4)
│   ├── schedule-generator.md 시즌 일정 자동생성 (82경기 × 30팀)
│   ├── playoff-system.md     플레이오프 브래킷/타이브레이커
│   ├── draft-lottery.md      NBA 2019+ 드래프트 로터리
│   ├── trade-system.md       트레이드 엔진 (블록/오퍼/CBA/픽밸류)
│   └── finance-system.md     예산/수익/지출 시뮬레이션
│
├── evaluation/           ← 선수 평가 (4개)
│   ├── evaluation-index.md   인덱스
│   ├── rating-standards.md   37개 능력치 평가 기준서
│   ├── new-player-process.md 신규 선수 추가 프로세스
│   ├── rating-generation.md  능력치 생성 파이프라인
│   └── rating-tuning.md      능력치 세부 튜닝
│
├── domain/               ← 도메인 지식 (4개)
│   ├── domain-index.md       인덱스
│   ├── nba-strategy.md       NBA 전술/경기 운영/선수 역할
│   ├── nba-trade-salary.md   트레이드 & 샐러리 캡 규칙
│   ├── nba-salary-cap-2025-26.md  2025-26 캡 수치
│   └── glossary.md           스탯 용어집 (계산 공식 포함)
│
├── ui/                   ← UI/UX (4개 + 하위 1개)
│   ├── ui-index.md           인덱스
│   ├── design-system.md      디자인 시스템 (다크 스포츠 테마)
│   ├── user-guide.md         사용자 조작 가이드
│   ├── url-routing-plan.md   URL 라우팅 설계
│   └── inbox/
│       └── inbox-index.md    Inbox 시스템 구조
│
├── infra/                ← 인프라/배포 (2개)
│   ├── version-update.md     버전 업데이트 알림 시스템
│   └── supabase-monitoring.md Supabase 모니터링
│
└── plan/                 ← 개발 계획
    ├── plan-index.md         인덱스
    ├── live-pbp.md           실시간 PBP 스트리밍 설계
    ├── fantasy-draft-plan.md 판타지 드래프트 설계
    ├── draft-agent.md        드래프트 AI 에이전트
    ├── multi-season-plan.md  멀티시즌 구현 계획
    ├── offseason-content-plan.md 오프시즌 콘텐츠 계획
    ├── coaching-staff.md     코칭 스태프 시스템
    ├── training-system.md    트레이닝 시스템
    ├── salary-cap-plan.md    샐러리 캡 구현 계획
    ├── draft-pick-assets.md  드래프트 픽 자산 설계
    ├── room-architecture.md  방 아키텍처 (멀티)
    ├── player-instructions.md 선수 데이터 작성 가이드
    └── monetization-legal-strategy.md 수익화/법률 전략
```

---

## 카테고리별 요약

### [engine/](engine/engine-index.md) — PBP 경기 엔진
PBP(Play-by-Play) 기반 경기 시뮬레이션의 모든 구성요소.
포세션 처리, 슈팅 확률, 선수 선택, 수비 매치업, 체력, 리바운드, 파울, 해설 등.

**수정 빈도**: 가장 높음 — 엔진 밸런스 조정, 새 시스템 추가 시 항상 참조.
**시작점**: [engine-index.md](engine/engine-index.md)에서 파일↔문서 매핑으로 원하는 문서 찾기.

### [simulation/](simulation/sim-index.md) — 시뮬레이션 운영 시스템
경기 엔진 외부의 시뮬레이션 운영: 시즌 흐름, 일정 생성, 플레이오프, 트레이드, 드래프트 로터리, 재정, 영속성.

**필수 참조 상황**:
- 시즌 흐름/날짜 진행 → [sim-structure.md](simulation/sim-structure.md)
- 플레이오프 로직 → [playoff-system.md](simulation/playoff-system.md)
- 트레이드 시스템 → [trade-system.md](simulation/trade-system.md)
- 드래프트 로터리 → [draft-lottery.md](simulation/draft-lottery.md)
- 저장/복원 → [snapshot-caching.md](simulation/snapshot-caching.md)

### [evaluation/](evaluation/evaluation-index.md) — 선수 평가
선수 능력치 평가 기준, 생성 파이프라인, 튜닝 가이드, 신규 선수 추가 프로세스.

**필수 참조 상황**:
- 새 선수 추가 → [new-player-process.md](evaluation/new-player-process.md)
- 능력치 평가 기준 → [rating-standards.md](evaluation/rating-standards.md)
- 시즌 데이터 업데이트 → [rating-generation.md](evaluation/rating-generation.md)
- 밸런스 조정 → [rating-tuning.md](evaluation/rating-tuning.md)

### [domain/](domain/domain-index.md) — 도메인 지식
NBA 현실 규칙, 전술 이론, 스탯 공식 등 시뮬레이션의 근거가 되는 지식.

**필수 참조 상황**:
- 스탯 공식 수정 → [glossary.md](domain/glossary.md)
- 전술/아키타입 설계 → [nba-strategy.md](domain/nba-strategy.md)
- 트레이드/샐러리 캡 → [nba-trade-salary.md](domain/nba-trade-salary.md)

### [ui/](ui/ui-index.md) — UI/UX
디자인 시스템, 컴포넌트 규칙, 라우팅 설계.

**필수 참조**: UI 수정 전 [design-system.md](ui/design-system.md) 확인 (다크 테마, 컬러, 라운딩 규칙).

### [infra/](infra/) — 인프라/배포
Vercel 배포, 캐시 전략, 버전 관리, Supabase 모니터링.

### [plan/](plan/plan-index.md) — 개발 계획
멀티플레이어, 드래프트, 오프시즌 등 미래 기능 설계 문서.

**상태**: 모두 계획 단계 — 구현 시 해당 카테고리 문서로 졸업.

---

## 문서 활용 가이드

### 엔진 코드 수정 시
1. [engine-index.md](engine/engine-index.md)의 **파일↔문서 매핑** 테이블에서 해당 파일의 문서 확인
2. 관련 문서를 읽고 현재 공식/상수/로직 파악
3. 수정 후 해당 문서도 함께 업데이트

### 시뮬레이션 시스템 수정 시
1. [sim-index.md](simulation/sim-index.md)의 **파일↔문서 매핑** 테이블에서 해당 파일의 문서 확인
2. 관련 문서를 읽고 현재 흐름/구조 파악
3. 수정 후 해당 문서도 함께 업데이트

### 새 선수 추가 시
1. [new-player-process.md](evaluation/new-player-process.md) 7단계 프로세스 따라가기
2. 능력치 평가 시 [rating-standards.md](evaluation/rating-standards.md) 참조
3. OVR 검증 후 시뮬레이션 테스트

### 스탯 관련 작업 시
- 계산 공식: [glossary.md](domain/glossary.md)
- 기록 파이프라인: [stat-handlers.md](engine/stat-handlers.md)
- USG%: [player-usage.md](engine/player-usage.md)
