# NBA-GM-SIM 프로젝트 컨텍스트

NBA GM 시뮬레이션(React 18 + TypeScript + Tailwind + Vite / Supabase / Vercel, 멀티 서버 Fly).
프로젝트 배경·아키텍처·엔진 현황·로드맵은 `docs/project-context.md`, 파일 구조는 `docs/project-overview.md`, 문서 전체 목차는 `docs/index.md`.

## 🚨 응답 언어 규칙
**모든 응답은 반드시 한국어로 작성할 것.** 코드 리뷰(/simplify), 요약, 설명, 질문 등 예외 없이 한국어로 답변. 코드 주석과 커밋 메시지만 영어 허용.

## 🚨 작업 완료 보고 규칙
**모든 작업이 완료되면 반드시 아래 형식으로 상세 보고를 작성할 것.** 단순 "완료"로 끝내지 말 것.

```
완료. [한 줄 요약]

**변경 파일:**
- `파일경로` — 변경 내용 (함수명/라인 등 구체적으로)

**동작 방식:**
- 어떻게 작동하는지 핵심 로직 설명

**주의사항 / 한계:**
- 기존 데이터 호환 여부, 폴백 처리, 알려진 제약 등
```
- 수정한 파일이 없으면 "변경 파일" 항목 생략, 주의사항이 없으면 해당 항목 생략
- 보고는 작업 응답의 마지막에 위치

## 🚨 개발 히스토리 노트
**엔진/로직을 수정할 때는 `docs/history/dev-log.md`에 Before/After를 상세히 기록할 것** (형식은 그 파일 상단 템플릿). 최신 항목이 위로, client/server 미러 쌍은 둘 다 기록. UI 소소한 변경까지 전부 기록할 필요는 없음.

## 🚨 Fly 서버 배포 — `scripts/deploy-server.sh`로만
프로젝트 폴더에서 `fly deploy`/`flyctl deploy` 직접 실행 금지(다른 세션의 커밋 안 된 코드까지 나간다). 순서: 내 변경만 커밋 → 푸시 → 스크립트. "커밋 = 배포돼도 되는 상태". 상세·롤백: `docs/infra/fly-deploy.md`

## 🚨 DB 함수(RPC) 재정의 — 라이브 정의가 베이스
`CREATE OR REPLACE`로 고칠 때는 `select pg_get_functiondef('public.<함수명>(<인자 타입>)'::regprocedure);`로 받은 **라이브 본문**에 변경만 얹고, 적용 후 다시 받아 전후 비교. 마이그레이션 파일을 베이스로 삼지 말 것. 상세·사고 사례: `docs/infra/db-function-redefine.md`

## 에이전트 모델 정책
서브에이전트(Task tool) 실행 시 모든 에이전트를 `sonnet`으로 실행할 것.

## 코드 수정 시 주의사항
- **중첩 블록 닫기 검증 필수**: `forEach`, `if`, 콜백 등 중첩이 깊은 코드를 수정할 때 삽입한 코드 전후로 모든 `{}`가 짝지어져 있는지 확인. 특히 기존 `if` 블록 내부에 코드를 추가할 때 닫는 `}` 누락 주의.
- **수정 후 빌드 검증**: 코드 수정 후 가능하면 구문 오류가 없는지 확인할 것.

## 🚨 런타임 에러 방지 규칙 (상세·예시: `docs/dev/runtime-error-rules.md`)
1. **순환 임포트 금지** — 새 import마다 A→B→A 확인. 공통 의존성은 별도 파일로, 타입만이면 `import type`. `vite build`가 CIRCULAR_DEPENDENCY로 실패한다.
2. **`const`/`let` 선언 순서** — 참조하는 값이 먼저 선언돼 있어야 함(TDZ `Cannot access '_' before initialization`). 날짜·수치 체인 계산에서 특히 주의.
3. **모듈 최상위 즉시 실행 코드 주의** — 임포트 값으로 바로 계산하지 말고 함수로 감싸 호출 시점을 늦출 것.
