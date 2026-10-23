# 멀티 드래프트 큐(Queue) 시스템 설계

> 멀티플레이어 드래프트 룸(Bun WS 서버 `server/src/DraftRoom.ts`)에서 유저가 **드래프트 시작 전부터**
> "내가 뽑고 싶은 선수 순서"를 큐로 만들어 두고, 오토픽/타임아웃 대납 시 그 순서대로 지명되게 한다.
> 2026-10-23 사용자 결정: 하단 좌측 "드래프트 기록" 패널을 탭으로 쪼개 큐 패널로 겸용.

---

## 1. 목표

| # | 기능 | 상태 |
|---|------|------|
| Q1 | 큐 영속화(DB) + 서버 큐 상태 + 오토픽/타임아웃/스킵/자동완료가 큐 우선 → BPA 폴백 | ✅ 구현 완료 (2026-10-23, 마이그레이션 적용됨·Fly 미배포) |
| Q2 | 클라이언트 훅: 큐 수신(스냅샷/델타), `setQueue` 송신(디바운스·낙관적 갱신) | ✅ 구현 완료 (2026-10-23) |
| Q3 | UI: 좌측 패널 `[기록 | 큐 N]` 탭, 큐 패널(정렬/삭제/지명됨 표시), 선수 풀 `+`/`Qn` 열, 내 차례 자동 선택 | ✅ 구현 완료 (2026-10-23, tsc·build 통과, 브라우저 E2E 전) |
| Q4 | dev-log 기록 → `scripts/deploy-server.sh` 배포 → 실리그 E2E | 계획 |

서버 부하 평가(2026-10-23): 큐 선택은 픽당 1회 선형 탐색(큐 ≤ 100개), 쓰기는 편집 시 디바운스 1행 upsert,
읽기는 방 로드 시 1회 — 부하 요인 아님.

---

## 2. 현황 조사 요약 (코드 확인 완료)

- **오토픽 선택 지점 4곳**이 전부 `getBestAvailableId(this.pool, [...this.draftedIds], this.teamPositions(entry.teamId))`를
  직접 호출한다 — `onAiPick()`(L331), `onPickTimeout()`(L373), `handleAdmin 'skip-turn'`(L554), `'autocomplete'`(L571).
  큐 분기를 넣으려면 이 4곳을 한 헬퍼로 모아야 한다(autopick 계획 4.4절의 `performAutoPick` 통합은 아직 안 됨).
- **`rooms.draft_cursor`는 RPC `submit_draft_pick_v2`가 매 픽마다 통째로 덮어쓴다** → 오토픽 상태가 메모리 전용이 된
  이유. 큐는 "시작 전에 만들어 두는 데이터"라 서버 재시작/방 재로드에도 살아야 하므로 **cursor에 넣지 않고 별도 테이블**.
- 방은 `waiting` 상태에서도 `RoomManager.getOrLoad()`로 메모리에 올라오고 소켓을 받는다(`activate()` 미입장 판정이
  이걸 전제) → 시작 전 큐 편집도 같은 WS 채널로 처리 가능. 별도 Supabase RPC/RLS 정책이 필요 없다.
- 스냅샷(`buildSnapshot()`)은 소켓 공용이라 유저별 데이터가 없다 → 큐는 **본인 소켓에만** 따로 보낸다(전략 유출 방지).
- 클라 상태: `hooks/useLeagueDraft.ts`가 WS 메시지를 `switch(msg.type)`으로 처리, `MultiDraftState`(`types/multiDraft.ts`)는
  `server/src/protocol.ts`와 수동 미러(공유 패키지 없음) — **미러 쌍 동시 수정**.
- 좌측 패널 `PickHistory.tsx`·우측 `MyRoster.tsx` 헤더가 `h-10 bg-slate-800/30` 동일 규격, 포지션 필터가 `SegmentedControl size="sm"` →
  탭도 같은 컴포넌트로.
- `PlayerPool.tsx`는 가상 스크롤(행 32px 고정, 14컬럼) + `React.memo` → 열 하나 추가는 비용 없음, 단 새 콜백은 `useCallback` 고정 필수.
- `MultiDraftView.tsx`는 `waiting` 화면(L298~385)과 진행 화면(L397~505)이 **같은 3열 레이아웃을 두 번** 그린다 → 큐 패널도 두 곳 모두.

---

## 3. 결정 사항

| # | 항목 | 결정 | 이유 |
|---|------|------|------|
| D1 | 영속화 | 새 테이블 `draft_queues(room_id, user_id, player_ids text[], updated_at)` PK `(room_id, user_id)` | cursor는 RPC가 덮어씀. 유저당 1행, 편집 시만 upsert |
| D2 | 클라 접근 경로 | **WS 전용**(`setQueue` 메시지). 테이블은 RLS 켜고 클라 정책 없음(서버 service role만) | 이미 WS auth로 userId 검증됨, RPC·RLS 추가 불필요, 본인 큐만 왕복 |
| D3 | 적용 범위 | 오토픽 모드·타임아웃 대납·어드민 `skip-turn`·`autocomplete` 전부 큐 우선. AI 슬롯(`isAi`)은 큐 없음 | "자동으로 대신 뽑는 모든 경우"가 같은 결과여야 예측 가능 |
| D4 | 큐 소진/전원 지명됨 | `getBestAvailableId` BPA 폴백(현행 동작) | 큐는 힌트, 없으면 기존 그대로 |
| D5 | 지명된 큐 선수 | **저장 목록은 건드리지 않고** 픽 시점에만 걸러냄. 화면은 취소선+흐리게, 카운트는 남은 수 | 서버/클라 경합 없음, "노리던 선수 누가 가져갔나" 확인 가능. 정리 버튼은 선택 |
| D6 | 내 차례 자동 선택 | `isMyTurn` 전환 순간 선택이 비어 있으면 큐 최상단 남은 선수를 `selectedPlayerId`로 | 수동 픽도 "드래프트" 한 번이면 되게 — 오토픽과 같은 멘탈 모델 |
| D7 | 패널 위치 | 좌측 22% 패널 제목이 드롭다운(공용 `Dropdown`), 항목 순서 큐→기록. 기본 **항상 큐**(참가자), 비참가자는 기록. 선택은 세션 내 유지. 큐 행은 풀과 선택 상태를 공유해 큐에서 바로 지명 가능 | (2026-10-23 사용자 수정: 세그먼트→드롭다운, waiting/active 분기 폐기) 열 폭·풀 컬럼 무변경 |
| D8 | 정렬 조작 | 네이티브 HTML5 드래그(`draggable`) + 행 ↑/↓ 버튼, 라이브러리 추가 없음 | 22% 폭 세로 리스트는 네이티브로 충분 |
| D9 | 상한/검증 | 큐 최대 100명, `config.poolIds` 밖·중복·비문자열 제거, pickOrder 비AI 참가자만 | 페이로드·메모리 상한, 비참가자 거부 |
| D10 | 전송 방식 | 전체 교체(`playerIds[]`), **저장 버튼으로만 전송**(2026-10-23 사용자 결정: 자동 저장·디바운스 폐기). 로컬 편집본≠저장본이면 dirty 표시 + `beforeunload` 확인창. 서버는 같은 userId **모든 소켓**에 `queue` 에코, 실패는 `queue_save_failed` | 자동 저장의 소실 구멍(디바운스 창·끊김 중 편집·DB 실패 묵살)을 버튼 하나로 정리. 오토픽은 저장본만 본다 |

---

## 4. 데이터 모델

### 4.1 DB — `migrations/add_draft_queues.sql`
```sql
CREATE TABLE IF NOT EXISTS public.draft_queues (
    room_id    uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL,
    player_ids text[] NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);
ALTER TABLE public.draft_queues ENABLE ROW LEVEL SECURITY;
-- 정책 없음: anon/authenticated 전부 거부, Fly 서버(service role)만 접근.
```
- 드래프트 완료 후 정리: 방 삭제 시 CASCADE. 별도 스윕 없음(유저당 1행, 수십 바이트).

### 4.2 프로토콜 — 미러 쌍 `server/src/protocol.ts` ↔ `types/multiDraft.ts`
```ts
// 클라 → 서버
export interface SetQueueMsg { type: 'setQueue'; playerIds: string[]; }   // 전체 교체
// 서버 → 클라 (본인 소켓에만)
export interface QueueMsg    { type: 'queue'; playerIds: string[]; }      // auth 직후 1회 + setQueue 에코
```
- `SnapshotMsg`는 그대로(공용). `index.ts` auth 처리에서 `ws.send(snapshot)` 직후 `ws.send(queue)`.
- `DraftCursor`/`DraftConfig`는 변경 없음 → DB `draft_cursor` 호환 유지.

---

## 5. 서버 (`server/src/DraftRoom.ts`, `index.ts`, `shared/multiDraftEngine.ts`)

### 5.1 상태
```ts
private queues = new Map<string, string[]>();   // userId → playerIds (DB draft_queues 미러)
```
- `load()`: `draft_queues` where room_id → Map 복원(풀 로드와 `Promise.all`).
- `getQueue(userId): string[]`, `setQueue(userId, ids): Promise<boolean>`:
  1. `pickOrder.some(e => e.userId === userId && !e.isAi)` 아니면 false
  2. 정규화: 문자열만, `poolIds` Set 포함, 중복 제거, 100개 절단
  3. DB upsert → 성공 시 Map 갱신 → `broadcastToUser(userId, { type:'queue', playerIds })`
  - write-then-commit(activate()와 같은 원칙): DB 실패 시 메모리 안 건드리고 false.
- `broadcastToUser(userId, msg)`: `sockets` 중 `ws.data.userId === userId`인 것 전부.

### 5.2 선택 헬퍼 — 4곳 통합
```ts
// shared/multiDraftEngine.ts (서버 전용 모듈이지만 순수 함수라 여기 둠, 클라 미러 불필요)
export function getQueuedAvailableId(queue: string[], draftedIds: Set<string>): string | null

// DraftRoom.ts
private resolveAutoPickId(entry: PickOrderEntry): string | null {
    if (!entry.isAi) {
        const q = this.queues.get(entry.userId);
        if (q?.length) {
            const fromQueue = getQueuedAvailableId(q, this.draftedIds);
            if (fromQueue) return fromQueue;
        }
    }
    return getBestAvailableId(this.pool, [...this.draftedIds], this.teamPositions(entry.teamId));
}
```
- `onAiPick`·`onPickTimeout`·`skip-turn`·`autocomplete`의 `getBestAvailableId(...)` 직접 호출을 전부 `this.resolveAutoPickId(entry)`로 교체.
  동작 변경은 "큐가 있을 때만" — 큐 없으면 바이트 단위로 기존과 동일.
- 로그: `auto pick #n → player=X (queue)` / `(bpa)` 구분 출력.

### 5.3 `index.ts`
- `msg.type === 'setQueue'` → `room.setQueue(ws.data.userId, msg.playerIds)`; false면 `error internal 'not a draft participant'`(toggleAutoPick과 동일 문구).
- auth 성공 시 스냅샷 직후 `ws.send(encode({ type:'queue', playerIds: room.getQueue(userId) }))`.
- `status === 'completed'` 방에서도 setQueue는 받되 무해(저장만) — 별도 차단 불필요.

---

## 6. 클라이언트 훅 (`hooks/useLeagueDraft.ts`)

- 상태 추가: `const [myQueue, setMyQueue] = useState<string[]>([])`.
- `case 'queue'`: `setMyQueue(msg.playerIds)`. 재접속 시 auth 직후 다시 오므로 별도 복원 불필요.
- `setQueue(ids)`: 낙관적 `setMyQueue(ids)` 즉시 → 600ms 디바운스 후 `ws.send({type:'setQueue', playerIds})`.
  연결 끊김이면 보류했다가 `onopen`+auth 후 마지막 값 1회 전송(pending ref). 서버 에코가 오면 낙관값 덮어씀.
- 반환값에 `myQueue`, `setQueue` 추가.

---

## 7. UI

### 7.1 `components/draft/DraftQueuePanel.tsx` (신규)
- props: `queue: string[]`, `playersById: Map<string, Player>`, `draftedIds: Set<string>`, `onChange(ids)`, `disabled`(연결 끊김).
- 헤더(h-10, 기존 규격): 좌측은 상위에서 넘기는 탭 슬롯, 우측 `남은 N` + "지명된 선수 정리" 아이콘 버튼(선택).
- 행(h-8, PickHistory 밀도): `≡ 핸들 · 순번 · POS · OvrBadge sm · 이름(truncate) · ↑ ↓ ✕`.
  지명됨: `text-slate-600 line-through`, 핸들/버튼 비활성, 순번은 남은 선수만 매김.
- 빈 상태: "선수 풀에서 + 를 눌러 큐에 추가하세요" (italic slate-600, PickHistory 빈 문구 톤).

### 7.2 좌측 패널 탭 — `MultiDraftView.tsx` 두 화면 공통
- `const [leftTab, setLeftTab] = useState<'history'|'queue'>(status === 'waiting' ? 'queue' : 'history')` — 최초 1회만 기본값.
- `SegmentedControl size="sm"` 옵션 `[{history:'기록'}, {queue:`큐 ${remaining}`}]`. 헤더는 탭 컴포넌트가 아니라 **래퍼가 소유**하고
  `PickHistory`/`DraftQueuePanel`는 본문만 — PickHistory 헤더의 라운드 필터 드롭다운은 `history` 탭일 때 헤더 우측에 그대로.
  → `PickHistory`에 `hideHeader`/`headerRight` 같은 prop 추가보다, 헤더를 래퍼로 올리고 라운드 필터 상태를 끌어올리는 쪽이 깔끔(소폭 리팩터).

### 7.3 `PlayerPool.tsx` — 큐 열
- props 추가: `queueIndexById?: Map<string, number>`(0-based), `onToggleQueue?: (p: Player) => void`.
- 마지막 열 `w-8`: 큐에 없으면 호버 시 `+`(IconButton xs), 있으면 `Q{n}` 배지(클릭 시 제거). 열 개수 `colSpan` +1.
- 콜백은 부모에서 `useCallback` — memo 깨짐 방지(파일 상단 주석의 이유와 동일).

### 7.4 내 차례 자동 선택 (D6)
```ts
useEffect(() => {
  if (!isMyTurn) return;
  setSelectedPlayerId(prev => prev ?? myQueue.find(id => !draftedSet.has(id)) ?? null);
}, [isMyTurn]);   // 큐/draftedSet 변경에는 반응 안 함 — 차례 시작 시 1회만
```

### 7.5 `waiting` 화면
- 풀 `isUserTurn=false`는 그대로, `onToggleQueue`만 활성 → 시작 전 큐 편집 가능. 좌측 기본 탭 `queue`.

---

## 8. 검증

- 서버 단위: `getQueuedAvailableId` — 빈 큐/전원 지명/중간 지명/정상 순서 4케이스. `resolveAutoPickId` — 큐 있음→큐, 큐 소진→BPA, AI 슬롯→BPA.
- 통합(로컬 Bun 서버 + 브라우저 2탭): ① waiting에서 큐 3명 저장 → 새로고침 후 복원 ② 다른 탭에서 편집 → 첫 탭 에코 ③ AUTO 켜고 차례 → 큐 1번 지명, 1번이 먼저 뽑히면 2번 ④ 큐 소진 → BPA ⑤ 타임아웃·skip-turn도 큐 우선 ⑥ 비참가자 setQueue → error.
- 배포: 커밋·푸시 후 `scripts/deploy-server.sh`, `flyctl releases --image`로 SHA 대조.

---

## 9. 롤백

- 서버: `resolveAutoPickId` 안의 큐 분기만 제거하면 기존 BPA 경로로 즉시 복귀(큐 저장은 무해하게 남음).
- DB: `DROP TABLE public.draft_queues` — 다른 테이블 참조 없음.
- 클라: 좌측 탭을 `history` 고정하면 UI 숨김.

---

## 10. 보류/미결

- 큐 공유 금지(다른 유저 큐 조회 경로 없음) — 어드민 패널에서도 보여주지 않음. 필요해지면 별도 결정.
- 포지션 자동 보정(큐가 C만 5명이어도 그대로 지명) — 큐는 유저 책임, 보정 안 함([[feedback_tactics_responsibility]] 원칙과 같은 취지).
- 싱글/루키 드래프트(`RookieDraftView`)·개인 팩 드래프트는 범위 밖.
