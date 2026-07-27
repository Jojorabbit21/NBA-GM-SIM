# 드래프트 오토픽(Auto-pick) 시스템 설계

> 멀티플레이어 드래프트 세션에서 유저별 "오토픽 모드"를 도입하는 계획.
> 트리거 3종(픽 타임아웃 / 드래프트 시작 시 미입장 / 어드민 수동 전환) + 재접속 시 자동 복귀.

---

## 1. 목표

아래 4가지를 지원하는 유저별 **영속적 오토픽 모드**(`autoPickUserIds: Set<userId>`)를 도입한다.

| # | 트리거 | 동작 | 상태 |
|---|--------|------|------|
| 0 | (선행) 오토픽 개념 자체 + 셀프/어드민 수동 토글 | `autoPickUserIds` 상태 신설, `scheduleNext()`/`onAiPick()` 확장 | ✅ 구현 완료 (2026-07-27) |
| 1 | 특정 유저가 `autoPickAfterMisses`(어드민 세션 설정, 기본 1)회 연속으로 픽 타이머 소진 | 그 유저를 오토픽 모드로 전환 — **이후 모든 픽**에 적용, 본인이 직접 픽 제출 시 카운트 리셋+오토픽 해제 | ✅ 구현 완료 (2026-07-27) |
| 2 | 드래프트가 `waiting → active`로 전환되는 순간, `pickOrder`에 있는 유저가 방(WS)에 연결돼 있지 않음 | 즉시 오토픽 모드로 전환 | ✅ 구현 완료 (2026-07-27, `activate()`) |
| 3 | 오토픽 상태인 유저가 재접속(WS auth 성공) | 자동으로 오토픽 해제 → 수동 모드 복귀 (단, 본인/어드민이 명시적으로 켠 경우는 유지) | ✅ 구현 완료 (2026-07-27) |
| 4 | 어드민이 특정 유저를 수동으로 온/오프 | `DraftAdminPanel`에 토글 추가 | ✅ 구현 완료 (2026-07-27) |

현재 `onPickTimeout()`(1픽만 대납하고 다음 픽부터 다시 사람 타이머로 되돌아감)과 달리, 오토픽 모드는 **해제되기 전까지 계속 유지**되는 것이 핵심 차이.

---

## 2. 현황 조사 요약

- **이미 있음**: `server/src/DraftRoom.ts:313 onPickTimeout()` — 타임아웃 시 `getBestAvailableId()`로 BPA 1픽만 대납. 영속 모드 아님.
- **재사용 가능**: `server/src/shared/multiDraftEngine.ts getBestAvailableId(pool, draftedIds, teamPositions)` — 오토픽 알고리즘 본체. AI픽(`onAiPick`)·타임아웃(`onPickTimeout`)·`skip-turn`·`autocomplete` 4곳에서 이미 중복 호출 중.
- **연결 여부 추적**: `room.sockets: Set<ServerWebSocket<WsData>>`(`DraftRoom.ts:55`)에 `ws.data.userId`가 이미 들어있음 → **Supabase Presence(`useDraftPresence.ts`) 없이도** 서버 자체적으로 "방에 연결돼 있는가"를 판단 가능. Presence는 클라이언트 표시 전용이라 서버 판정에 쓰지 않는다.
- **타입 이중 정의 주의**: `DraftCursor`/`PickOrderEntry`가 `server/src/protocol.ts`와 `types/multiDraft.ts` 양쪽에 거의 동일하게 존재 (WS 프로토콜이라 공유 패키지 없이 수동 미러). CLAUDE.md 규칙상 미러 쌍은 항상 함께 수정.

---

## 3. 데이터 모델 변경

`DraftCursor`(서버) / `MultiDraftState`(클라, 필드 flatten됨)에 필드 1개 추가:

```ts
autoPickUserIds: string[]   // 오토픽 모드인 userId 목록
```

- 영속화: 기존 `rooms.draft_cursor` JSONB에 자동 포함 → **DB 마이그레이션 불필요**.
- 변경 파일(미러 쌍, 둘 다 수정): `server/src/protocol.ts` (`DraftCursor`), `types/multiDraft.ts` (`MultiDraftState`).

---

## 4. 서버 로직 변경 (`server/src/DraftRoom.ts`)

### 4.1 상태/헬퍼 추가
- `private autoPickUserIds = new Set<string>()`
- `load()`: DB의 `cursor.autoPickUserIds`에서 복원 (누락 시 서버 재시작 후 오토픽 상태가 조용히 리셋되는 회귀 — 반드시 반영)
- `getCursor()`: 반환값에 `autoPickUserIds: [...this.autoPickUserIds]` 포함
- `addAutoPick(userId)` / `removeAutoPick(userId)`: Set 갱신 → `rooms.draft_cursor` DB 업데이트 → `broadcastCursor()`
- `getConnectedUserIds()`: `[...this.sockets].map(ws => ws.data.userId)` (트리거 2용)

### 4.2 트리거 1 — 타임아웃 시 전환
`onPickTimeout()` 내부에서 대납 픽 처리와 함께 `this.addAutoPick(entry.userId)` 호출.

### 4.3 트리거 2 — 드래프트 시작 시 미입장 감지
`activate()`에서 상태를 `active`로 바꾸기 직전:
```ts
const connected = new Set(this.getConnectedUserIds());
for (const entry of uniqueBy(this.config.pickOrder, e => e.userId)) {
    if (!entry.isAi && !connected.has(entry.userId)) this.addAutoPick(entry.userId);
}
```
`waiting` 상태에서 미리 접속해 풀을 구경하던 유저의 소켓은 이미 `room.sockets`에 있으므로, 이 시점 체크가 정확히 "드래프트 시작 순간 룸에 있었는가"를 반영한다.

### 4.4 `scheduleNext()` 분기 확장
현재: `entry.isAi ? AI 타이머(2.5~3.5초) : 사람 타이머(pickDurationSec)`
변경: `entry.isAi || autoPickUserIds.has(entry.userId)` → 동일한 AI 딜레이 경로로 합류.
- `onAiPick()`과 `onPickTimeout()`의 BPA 대납 로직이 중복이므로 `performAutoPick(entry)` private 메서드로 통합 리팩터링 (동작 변경 아님, 중복 제거).

### 4.5 트리거 3 — 재접속 시 자동 해제
`index.ts`의 `auth` 처리에서 `room.addSocket(ws)` 직후:
```ts
if (room.getCursor().autoPickUserIds.includes(userId)) {
    room.removeAutoPick(userId);
}
```
- 레이스: 재접속 시점에 이미 오토픽 타이머(2.5~3.5초)가 거의 끝나가는 상태일 수 있음 → 최대 ±3초 오차는 허용(오토픽 알고리즘도 BPA라 실질적 손해 없음). 지금 그 유저 차례이고 오토픽 타이머가 아직 안 끝났다면 `removeAutoPick()` 내부에서 `clearTimers()` + `scheduleNext()`로 즉시 일반 사람 타이머로 재시작.

### 4.6 트리거 4 — 어드민 수동 토글
- `protocol.ts`: `AdminMsg.action` 유니온에 `'toggle-autopick'` 추가, `params`에 `targetUserId?: string` 추가.
- `handleAdmin()`에 케이스 추가: 이미 오토픽이면 `removeAutoPick`, 아니면 `addAutoPick` — 현재 그 유저 차례면 즉시 `clearTimers()` + `scheduleNext()` 반영.

---

## 5. 클라이언트 변경

| 파일 | 변경 |
|------|------|
| `types/multiDraft.ts` | `MultiDraftState.autoPickUserIds: string[]` 추가 |
| `hooks/useLeagueDraft.ts` | `assembleState()` / `cursorFields()`에 `autoPickUserIds` 반영 |
| `views/multi/league/MultiDraftView.tsx` | 현재 차례 유저가 `autoPickUserIds`에 있으면 "자동 픽 진행 중" 배지 표시. 본인이 대상이면 안내 배너("자리를 비워 자동 픽 모드로 전환되었습니다 — 화면을 유지하면 자동으로 복귀합니다") |
| `components/draft/DraftAdminPanel.tsx` | "유저별 오토픽 토글" 섹션 추가 — `pickOrder`에서 고유 유저 목록 렌더 + `sendAdmin('toggle-autopick', { targetUserId })` |

---

## 6. 엣지 케이스

- 1인 1팀 구조 확인됨(`PickOrderEntry{userId,teamId}`) → `userId` 키 하나로 충분, 팀 중복 소유 케이스 없음.
- AI 슬롯(`entry.isAi`)은 애초에 오토픽 대상이 아님 — 이미 항상 자동이므로 Set에 넣지 않는다.
- 드래프트 중 팀이 없는 관전자가 접속하는 경우 `pickOrder`에 없으므로 영향 없음.
- 서버 프로세스가 오토픽 상태 중간에 재시작되면 `load()`가 `autoPickUserIds`를 복원하지 못하는 한 상태가 사라짐 — 4.1의 복원 로직 누락 여부를 구현 체크리스트에 명시.

---

## 7. 구현 순서

1. 타입/프로토콜 필드 추가 — `protocol.ts` + `types/multiDraft.ts` (미러 쌍 동시)
2. `DraftRoom.ts` — `autoPickUserIds` 상태, `add/removeAutoPick`, `getConnectedUserIds`, `performAutoPick` 통합 리팩터
3. 트리거 1(타임아웃) 연결 → 트리거 2(`activate()` 미입장 감지) 연결
4. `index.ts` — 재접속 시 자동 해제(트리거 3) 연결
5. `handleAdmin()`에 `toggle-autopick`(트리거 4) 추가
6. 클라이언트: `useLeagueDraft.ts` 상태 반영 → `MultiDraftView.tsx` 배지/배너 → `DraftAdminPanel.tsx` 토글
7. 검증: 브라우저 탭 2개(유저 A/B)
   - A 픽 타이머 완전 소진 → 오토픽 전환 확인 → 다음 픽도 대기 없이 자동 진행되는지 확인 → A 재접속 → 수동 모드 복귀 확인
   - B는 방에 접속 안 한 채로 어드민이 드래프트 시작 → B가 즉시 오토픽으로 표시되는지 확인
   - 어드민 패널에서 특정 유저 수동 토글 온/오프 확인

---

## 8. 문서화 메모

- CLAUDE.md 규칙상 서버 드래프트 타이머 로직 변경 + client/server 미러 쌍(`protocol.ts` ↔ `types/multiDraft.ts`) 변경 → 구현 완료 후 `docs/history/dev-log.md`에 Before/After 기록 필수 (미러 중 하나만 롤백하면 깨짐 주의).
- `docs/plan/multiplayer-plan.md`는 Supabase Edge Function 구조를 전제로 작성돼 실제 구현(Bun WS 서버)과 어긋난 상태로 확인됨 — 이번 기능 관련 서술은 이 신규 문서를 기준으로 참조할 것.
