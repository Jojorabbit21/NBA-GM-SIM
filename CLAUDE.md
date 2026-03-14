# NBA-GM-SIM 프로젝트 컨텍스트

## 프로젝트 개요
- NBA GM 시뮬레이션 게임 (싱글 플레이 → 추후 30인 멀티플레이어 목표)
- React 18 + TypeScript + Tailwind + Vite / Supabase / Vercel

## 아키텍처 핵심 원칙

### 데이터베이스 구조
- `meta_players` : 445명 선수 데이터 (공유, 읽기전용) - base_attributes JSONB 컬럼
- `meta_schedule` : 시즌 일정 (공유, 읽기전용)
- `saves` : 사용자 체크포인트 (팀선택, 날짜, 전술, 로스터 상태)
- `user_game_results` : 경기별 박스스코어 (사용자별 누적)
- `players`, `schedule` 테이블은 **실제 존재하지 않음** → queries.ts의 fallback 코드는 dead code
- 선수 데이터 원본: **독자 생성 레이팅** (base_attributes JSONB, Claude AI 기반)

### 상태 재구성 방식 (핵심 설계)
사용자별 선수 스탯 테이블을 따로 두지 않음 → DB 부담 최소화
- 로그인 시: saves → user_id → user_game_results(박스스코어 전체) → stateReplayer 재조립
- 이유: 사용자 1명당 445개 선수 레코드 생성 방지

## 게임 엔진 현황

### 실제 사용 중인 엔진
- `services/game/engine/pbp/` 디렉토리의 PBP(Play-by-Play) 엔진
- flowEngine.ts의 `calculateHitRate()` → possessionHandler.ts에서 호출
- 박스스코어 = 포세션별 누적 (statsMappers → statUtils)

### Dead Code (레거시) - 삭제 대상
- `services/game/engine/shootingSystem.ts` : 아무데서도 import 안 됨
- `services/game/engine/defenseSystem.ts` : PBP 엔진으로 대체됨 (flowEngine, reboundLogic)
- `services/game/engine/foulSystem.ts` : possessionHandler 내 단순 foul roll로 대체됨
- `services/game/engine/playmakingSystem.ts` : possessionHandler에 import되나 실제 호출 없음
- 구버전 배치 방식에서 PBP 방식으로 이관됨

### 로테이션 시스템
- RotationMatrix: 선수당 48개 컬럼 (분 단위) - 토글로 편집
- 저장 형태: Boolean[48] (000111000... 형태)
- PBP 엔진에서 현재 분에 따라 in/out 결정

## 트레이드 시스템 (현행)
- **통합 트레이드 엔진**: 선수 + 드래프트 픽 거래 지원
- **영속 트레이드 블록**: 유저/CPU 팀 모두 블록 보유, `saves.league_trade_blocks`에 영속
- **비동기 오퍼 파이프라인**: 시뮬 진행 시 CPU가 유저 블록 평가 → 오퍼 생성 → 인박스 수신
- **CBA 규칙 구현**: 샐러리 매칭(125%/110%/100%), 스테피언 룰, NTC
- **상세 문서**: `docs/engine/trade-system.md` 참조
- **주요 파일**: `services/tradeEngine/tradeExecutor.ts`(통합실행), `tradeBlockManager.ts`(블록관리), `pickValueEngine.ts`(픽밸류)

## 비활성화된 기능들
- **Gemini AI**: Quota 문제로 전부 비활성화 (geminiService.ts 코드는 있음)
- **Draft 기능**: DraftView.tsx 존재하나 현재 미동작 → 멀티플레이어에서 활성화 예정

## 로드맵 (목표)
1. 현재: 싱글플레이어 단일시즌 모드
2. 목표: **30인 동시접속 멀티플레이어**
   - 시작 시 팀 빌딩 드래프트 (Draft 개발 필요)
   - FA 선수 영입/방출 시스템
   - 유저↔유저 트레이드
   - 시뮬레이션 서버사이드 이관
   - 실시간 PBP 스트리밍 + 경기 중 전술 변경 (타임아웃/하프타임)

### 멀티플레이어 목표 시뮬레이션 방식 (서버)
- 전술은 언제든 수정 가능 → 서버에 저장
- 정해진 시간에 자동 경기 시작 (비동기 방식, 유저 동시접속 불필요)
- 서버가 실시간 PBP 생성 → 클라이언트 스트리밍
- 경기 중(타임아웃/하프타임) 전술/선수기용 변경 → 이후 PBP에 반영
- 필요 기술: WebSocket 또는 SSE (Supabase Edge Functions 또는 별도 서버 검토 중)
- 30명 미만 시 AI 단장으로 빈 슬롯 채우는 방식 고려 중

## 데이터 관련
- meta_players 원본: 사용자가 직접 작성한 CSV → JSONB 변환 스크립트로 Supabase 업로드
- 선수 데이터: Claude AI 독자 생성 레이팅 (NBA 도메인 지식 기반)

## 도메인 지식 파일
- `docs/domain/nba-strategy.md` : NBA 전술/경기 운영/선수 역할/평가 이론 전체 정리
  - PBP 엔진 슬라이더와 NBA 실제 전술의 연결고리 포함
  - 포지션별 역할, 아키타입 12종, 클러치/파울/타임아웃 운영 포함
- `docs/domain/nba-trade-salary.md` : NBA 트레이드 & 샐러리 캡 규칙 정리
  - 샐러리 캡/럭셔리 택스/에이프런 구조, 125% 매칭 룰
  - 선수 트레이드 가치 산정 공식 (OVR × 샐러리효율 × 나이 × 희소성)
  - 드래프트 픽 거래 구현 완료 (보호/스왑/스테피언 룰 포함)

## 에이전트 모델 정책
서브에이전트(Task tool) 실행 시 모든 에이전트를 `sonnet`으로 실행할 것.

## 코드 수정 시 주의사항
- **중첩 블록 닫기 검증 필수**: `forEach`, `if`, 콜백 등 중첩이 깊은 코드를 수정할 때, 삽입한 코드 전후로 모든 `{}`가 올바르게 짝지어져 있는지 반드시 확인할 것. 특히 기존 `if` 블록 내부에 코드를 추가할 때 닫는 `}`가 누락되지 않도록 주의.
- **수정 후 빌드 검증**: 코드 수정 후 가능하면 구문 오류가 없는지 확인할 것.

## 기타 설계 결정
- 트레이드 데드라인: 실제 NBA 날짜 하드코딩 (단일시즌이므로)
- 선수 정렬: stableSort - OVR 내림차순, 동점 시 ID 오름차순 (결정론적)
