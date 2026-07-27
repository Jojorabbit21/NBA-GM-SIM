# 경기 시뮬레이션 Worker Thread 분리 — 구현 계획

**상태**: 구현 완료, 배포됨 (2026-07-27 작성 → 2026-07-27 구현 완료)
**관련 패치노트**: [docs/history/patch-notes.md](../history/patch-notes.md)
**관련 dev-log**: [docs/history/dev-log.md](../history/dev-log.md) — "경기 시뮬레이션 Worker Thread 분리" 항목

## 8. 구현 결과 (배포 후 실측)

- `[simPool] worker#0 ready` — 스폰 직후 ping/pong 헬스체크 정상 통과 (Bun이 워커 안에서 `.ts` 엔트리를 정상 로드함을 확인, §6 리스크 항목 해소)
- 배포 직후 stale 클레임 청소가 즉시 동작 — 사전 확인했던 진짜 고아 클레임(124건, `game_pbp` row 없는 것) 정리 시작
- 15경기 백로그가 몰린 실제 틱에서 워커가 90초 넘게 연속으로 경기를 처리하는 동안 **"connection closed before message completed" 에러 0건** (배포 전에는 10~15초마다 발생)
- 같은 구간에 `/live-game` 엔드포인트(사용자가 실제로 막혔던 요청)가 0.42초 만에 정상 응답 확인
- `game_sim_claims` 원자적 클레임("already claimed by another process — skip"), `[scheduler] previous tick still running — skip` 재진입 가드 모두 워커 환경에서도 기존과 동일하게 정상 동작 확인
- 로컬 스모크 테스트는 이 개발 환경에 `bun` 바이너리가 없어 미실시 — 대신 위와 같이 실제 프로덕션 배포 로그로 직접 검증함

## 1. 배경 / 문제 정의

멀티플레이어 서버(`basketballgm-app-server`, Fly.io, Bun 단일 프로세스)에서 큰 토너먼트("FMK 빅 토너먼트") 진행 중 다음 증상이 확인됨:

- 세션 로비/경기 화면 연결이 원활하지 않음
- "진행중인 경기 보기" 버튼을 눌러도 "경기 데이터를 준비하는 중입니다..." 메시지만 뜨고 들어가지지 않음

### 로그 기반 진단

`fly logs` 확인 결과:
- `"hyper error: connection closed before message completed"`(Fly 프록시 타임아웃)가 10~15초 간격으로 지속 발생
- 같은 uid/room에 대해 `[ws] disconnected`가 동일 타임스탬프에 7번 연속 발생 (재연결 즉시 끊김)
- `[simRunner]` 로그 상 경기 1개 시뮬레이션에 **4.5~10초** 소요 (`bkn 93-104 tor (6292ms)`, `atl 98-89 uta (9937ms)` 등)
- `[Bun.serve]: request timed out after 10 seconds` — Bun 서버 자체의 idle timeout에 걸림

### 근본 원인

`server/src/simRunner.ts`의 `runSimulation(roomId, gameId)`:
1. Supabase 조회 4~5회 — 전부 `await`, 비동기 I/O라 이벤트 루프를 막지 않음
2. `runFullGameSimulation(...)` (`server/src/shared/engine/pbp/main.ts:12`, `export function` 동기 함수, Supabase 의존성 없는 순수 계산) — **유일한 진짜 병목**
3. Supabase 저장/토너먼트 진행 처리 — 역시 비동기 I/O

`server/src/scheduler.ts`가 30초마다 due 경기를 **순차적으로 `await`** 하며 처리하는데(`runSimGames()`), 토너먼트처럼 한 틱에 몰리는 경기가 많으면 `runFullGameSimulation()`의 동기 연산이 이어지면서 Bun의 단일 이벤트 루프가 통째로 막힘 → 그 사이 들어온 HTTP(`/live-game` 폴링)/WebSocket 요청이 전부 타임아웃.

### 시도했다가 부분적으로만 효과 있었던 것

- **1차 조치**: `runSimGames()` 루프에 `await new Promise(r => setImmediate(r))` 추가(경기 사이 양보) — 배포 후에도 문제 지속 확인. 경기 "사이"의 누적 부담은 줄지만, 경기 "한 개" 자체의 4.5~10초 블로킹은 그대로 남아 근본 해결 안 됨.
- **검토했으나 기각**: VM 스펙업(`shared-cpu-2x` 등) — Bun/Node는 JS를 단일 스레드에서 실행하므로, 코어를 늘려도 `runFullGameSimulation()` 자체의 속도는 빨라지지 않음(워커/스레드로 실제 병렬화하지 않는 한). 비용으로 근본 원인을 우회하는 근시안적 해결책으로 판단, worker thread 분리를 정공법으로 채택.

## 2. 목표

시뮬레이션을 별도 OS 스레드(Bun `Worker`)로 이관해서, 아무리 무거운 경기를 계산 중이어도 메인 스레드는 항상 HTTP/WS 요청에 즉시 응답 가능하게 만든다.

## 3. 설계

### 왜 "함수 전체"를 워커로 옮기는가

`runSimulation()`을 쪼개서 "DB 조회는 메인에서, 계산만 워커에서" 식으로 설계할 수도 있지만, 그러면 `homeTeam`/`awayTeam` 같은 큰 객체를 워커 경계로 직렬화해야 한다. 대신 **함수 전체를 워커에 그대로 넘기면** 워커가 자기 Supabase 클라이언트로 직접 읽고 쓰므로 이 문제 자체가 사라진다. `simRunner.ts`는 `RoomManager` 등 메인 스레드 전용 싱글턴을 전혀 참조하지 않음(확인 완료) — 워커로 옮겨도 끊어질 참조가 없다. `supabaseAdmin.ts`는 `Bun.env` 기반 클라이언트 생성뿐이라 워커 안에서 그대로 재생성 가능(Bun 워커는 부모 프로세스의 env를 상속).

### 호출부 (2곳, 둘 다 워커 풀 경유로 교체)

- `server/src/scheduler.ts:342` — 30초 스케줄러 틱
- `server/src/index.ts:261` — 어드민 수동 "지금 시뮬레이션" HTTP 엔드포인트

### 신규 파일

**`server/src/workers/simWorker.ts`** — 워커 엔트리포인트
- `message` 이벤트로 `{ type: 'ping' } | { type: 'run', id, roomId, gameId, forceStartNow }` 수신
- `ping` → 즉시 `{ type: 'pong' }` 응답 (스폰 직후 헬스체크용, §4 참조)
- `run` → 기존 `simRunner.ts`의 `runSimulation()`을 그대로 `import`해서 호출, 끝나면 `{ id, result }` (실패 시 `{ id, error }`) 응답

**`server/src/workers/simWorkerPool.ts`** — 풀 매니저
- 서버 부팅 시(`index.ts`) `N`개의 `Worker` 스폰. `N = Bun.env.SIM_WORKER_COUNT` 환경변수, 기본값 `vCPU 수 - 1`(최소 1)
- 스폰 직후 ping/pong 헬스체크 통과한 워커만 "가용" 목록에 편입 (§4-③)
- 유휴 워커 리스트 + 대기 큐(FIFO)
- `runSimulationInWorker(roomId, gameId, forceStartNow): Promise<SimResult>` — 기존 `runSimulation()`과 동일 시그니처로 export, 호출부 diff 최소화
- correlation `id`(uuid)로 워커 응답과 대기 중인 Promise 매칭
- 타임아웃(기본 60초) — 초과 시 해당 워커 강제 종료+재스폰, 대기 Promise reject
- `worker.addEventListener('error', ...)` — 크래시 감지 시:
  1. 그 워커가 처리 중이던 `{roomId, gameId}`에 대해 `game_sim_claims` 삭제 (§4-①)
  2. 대기 중인 Promise reject
  3. 워커 제거 후 새 워커로 교체(재스폰 시에도 ping/pong 헬스체크 통과해야 편입)
- 프로세스 종료 시(SIGINT) 모든 워커 `terminate()`

### 변경 파일

- **`server/src/scheduler.ts`**
  - `runSimGames()`의 `for...await` 순차 루프 → `Promise.allSettled(tasks.map(t => simWorkerPool.runSimulationInWorker(t.roomId, t.gameId)))`로 교체 (워커 풀이 동시성을 관리하므로, 순차 await로 두면 워커가 여러 개 놀아도 하나씩만 쓰게 됨)
  - 기존에 넣었던 `setImmediate` 양보 제거 (메인 스레드가 더 이상 블로킹 계산을 안 하므로 불필요)
  - stale 클레임 청소 로직 추가 (§4-②)
- **`server/src/index.ts`**
  - `handleAdminSim`의 `runSimulation(roomId, gameId, true)` 호출을 `simWorkerPool.runSimulationInWorker(...)`로 교체
  - 서버 부팅 시퀀스에 `simWorkerPool.init()` 호출 추가
- **`server/src/simRunner.ts`** — **로직 변경 없음.** 워커 안에서 그대로 import되어 실행됨. 파일 위치도 그대로 유지(옮기면 import 경로만 복잡해짐)

### 통신 프로토콜

```ts
// 요청 (main → worker)
{ type: 'ping' }
{ type: 'run', id: string, roomId: string, gameId: string, forceStartNow?: boolean }

// 응답 (worker → main)
{ type: 'pong' }
{ id: string, result: SimResult } | { id: string, error: string }
```
직렬화 대상이 문자열/불리언/단순 객체뿐이라 구조화 복제(structured clone) 안전 — 팀/선수 같은 큰 객체는 워커 경계를 절대 넘지 않음(워커가 자체적으로 Supabase에서 읽으므로).

## 4. 안전장치 (최초 구현 범위에 포함)

토론 과정에서 식별한 리스크 중, 지금 단계에서 바로 방어 가능한 항목은 초기 구현에 포함한다.

### ① 워커 크래시 시 `game_sim_claims` 고아 레코드 방지 (최우선)
`simRunner.ts:65-71`의 원자적 클레임은 실패 시 자기 `catch` 블록에서 delete하지만, **워커 프로세스 자체가 죽으면** 그 catch가 실행되지 않아 클레임이 영구히 "처리 중"으로 남고 해당 경기는 조용히 영원히 재시도되지 않는다. → 풀이 `error` 이벤트로 크래시를 감지하는 시점에 이미 어떤 `{roomId, gameId}`를 처리 중이었는지 알고 있으므로, 그 자리에서 메인 스레드가 안전망으로 클레임을 직접 delete.

### ② 주기적 stale 클레임 청소 (①의 이중 안전망)
①이 커버 못 하는 극단적 상황(컨테이너 자체 종료 등) 대비. 스케줄러에 낮은 빈도(예: 5분마다)로 `game_sim_claims` 중 N분 이상 지났는데 대응하는 `game_pbp` row가 없는 것을 삭제하는 로직 추가.

### ③ 워커 스폰 직후 ping/pong 헬스체크 게이팅
스폰한 워커를 곧바로 "가용" 목록에 넣지 않고, trivial ping을 보내 pong이 오는지 먼저 확인. Bun이 워커 안에서 `.ts` 엔트리를 제대로 로드하는지를 **배포 때 수동 스모크테스트가 아니라 매 스폰(최초 부팅 + 크래시 후 재스폰)마다 자동으로 검증**하는 효과.

### 지금은 넣지 않는 것 (과설계 방지, YAGNI)
- **워커 로그 postMessage 이중화**: Bun이 워커 stdout을 부모로 전달하는 공식 기능이 있어 될 가능성이 높음 — 실제로 안 되는 걸 확인도 안 한 채 우회 프로토콜을 미리 만들지 않는다. 배포 후 `[simRunner]` 로그가 안 보이면 그때 추가.
- **크래시 루프 서킷브레이커**: 클레임이 ①로 매번 풀리므로 재시도는 스케줄러 30초 틱 주기로만 일어나 무한 루프가 아니라 "30초마다 반복 실패" 정도로 자연히 페이싱됨. 실제로 같은 `(roomId, gameId)`가 로그에 반복 실패로 찍히는 게 확인되면, 그때 가벼운 "N번 연속 실패 시 경고만 남기고 스킵" 로직을 추가.

## 5. 검증 계획

1. `tsc --noEmit` (server) — Worker API 타입 확인
2. 로컬 스모크 테스트 — 워커 스폰/ping-pong/정상 처리/타임아웃/에러 5가지 케이스
3. `fly deploy` 후 로그 관찰 — 다음 지표가 사라지거나 크게 줄어드는지 확인:
   - `"connection closed before message completed"` 빈도
   - `[Bun.serve]: request timed out after 10 seconds`
   - `[simRunner]` 로그가 워커 전환 후에도 정상적으로 `fly logs`에 나오는지 (§4 "지금은 넣지 않는 것" 항목의 확인 트리거)
4. 실제 진행 중인 토너먼트 방으로 `handleTournamentAdvance`(시리즈 승수 집계·라운드 전진·아카이빙)가 워커 환경에서도 기존과 동일하게 동작하는지 확인
5. `docs/history/dev-log.md`에 Before/After 기록

## 6. 남는 리스크 (사전 해결 불가 — 배포 후 실측 필요)

- **Supabase 요청 볼륨**: `@supabase/supabase-js`는 PostgREST 기반 HTTP 호출이라 워커 수만큼 영속 TCP 커넥션이 느는 구조는 아니지만(전통적 "커넥션 풀 고갈"과는 다름), 워커 여러 개가 동시에 요청을 쏘면 순간 요청량은 늘어남 — 배포 후 Supabase 대시보드에서 요청 레이트/에러율 확인 권장
- **워커 풀 사이즈 튜닝**: vCPU보다 워커를 많이 띄우면 OS가 시분할하면서 개별 경기 소요 시간이 오히려 늘 수 있음(컨텍스트 스위칭·캐시 경합). 정확한 최적치는 이론으로 못 정하고 배포 후 실측(경기당 소요시간, 요청 응답 지연)으로 튜닝

## 7. 작업 순서

1. `simWorker.ts` + `simWorkerPool.ts` 작성 (ping/pong 헬스체크, 크래시 시 클레임 정리 포함)
2. `index.ts`에 풀 초기화 배선, 어드민 엔드포인트 교체
3. `scheduler.ts` 루프를 풀 호출 + `Promise.allSettled`로 교체, 기존 `setImmediate` 제거, stale 클레임 청소 추가
4. `tsc` 확인 → 로컬 스모크 테스트 → `dev-log.md` 기록 → `fly deploy` → 로그로 개선 확인 → 이 문서 상단 상태를 "구현 완료"로 갱신 + 패치노트 갱신
