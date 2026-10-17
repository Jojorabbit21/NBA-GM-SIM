# 리그 세션 채팅 (league_chat)

> 상태: **DB 1단계 + 클라이언트 2단계 구현 완료 (2026-10-17)** — 테이블·RPC·Realtime 권한(`migrations/league_chat_messages.sql`), `chatService.ts`·`useLeagueChat.ts`·`LeagueChatDock.tsx`·`LeagueLayout` 마운트·토스트 오프셋·`z-widget`. tsc/vite build 통과. **브라우저 E2E(구독·수신·presence·IME·FAB/토스트 겹침)는 미검증**, 보존 정책(오래된 메시지 삭제)은 미구현. 상세 Before/After는 dev-log 2026-10-17 두 항목. UI는 우측 하단 FAB → 위젯으로 확정, DM은 1차 제외(스키마만 대비). 결정 대기 항목은 맨 아래.

## 목적
세션(room) 참가자끼리 쓰는 텍스트 채팅. 세션당 최대 30명, 세션 전체 채팅 1방.

## 핵심 결정
| 항목 | 결정 | 이유 |
|---|---|---|
| 저장 | Postgres 테이블 1개 `league_chat_messages` | 히스토리·보존 정책·감사 |
| 실시간 전달 | **Supabase Realtime Broadcast, 비공개(private) 채널** | `postgres_changes`는 INSERT마다 구독자 수만큼 RLS 검사 + Postgres Changes 풀이 2개뿐 |
| 쓰기 경로 | RPC `send_chat_message` **단일 경로** (테이블 직접 INSERT 금지) | 멤버 검증·길이·레이트 리밋을 서버에서 강제 |
| 전달 호출 | RPC 본문 안에서 `realtime.send()` | 클라이언트가 보낸 payload를 믿지 않음(위조 방지). 클라이언트 Broadcast 송신 권한은 주지 않음 |
| Fly 서버 | **관여 안 함** | 경기 시뮬 서버(1 vCPU/512MB)에 부하를 주지 않기 위해 |
| 새 서버/외부 SaaS | 없음 | 기존 Supabase Auth/RLS/room_members 재사용 |

## 현재 Realtime 한도 (대시보드 확인, 2026-10-17)
동시 클라이언트 10,000 / events/s 2,500(스펜드캡 때문에 변경 불가) / presence events/s 1,000 / payload 3,000KB / Authorization 풀 2 / Postgres Changes 풀 2.
- events/s가 "전달 건수" 기준인지 미확인 → 보수적으로 전달 건수로 계산: 세션 1개 극단 스팸(30명×초당1건) = 900/s. **레이트 리밋 필수.**
- 기존 구독(`useLeagueNotifications`, `useLeagueTransactionsRealtime` 등)도 한도를 나눠 쓴다.
- "Allow public access to channels"는 **끄지 않는다**(기존 훅이 공개 채널). 채팅 채널만 private.

## DB
```sql
league_chat_messages (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references rooms(id) on delete cascade,
  user_id    uuid not null,
  team_id    text,                       -- 기록 시점 팀 스냅샷(표시용)
  author     text not null,              -- 기록 시점 닉네임 스냅샷
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index on league_chat_messages (room_id, id desc);   -- 최근 N건 조회가 테이블 크기와 무관
```
- RLS: SELECT = 해당 room의 `room_members` 멤버. INSERT/UPDATE/DELETE 정책 없음(RPC는 SECURITY DEFINER).
- 레이트 리밋용 별도 테이블은 만들지 않는다 — 서버는 `league_chat_messages`의 최근 N건 COUNT로 판정(아래 "레이트 리밋 / 도배 방지").

## RPC `send_chat_message(p_room_id uuid, p_body text)`
1. `auth.uid()`가 room 멤버인지 검증(아니면 예외)
2. 본문 trim, 1~500자 검증
3. 본문 정리(`sanitize_chat_body`, 2026-10-18): 보이지 않는 문자·텍스트 방향 제어 문자 제거, 줄바꿈 **최대 1번**(2줄까지, 연속 개행은 하나로·둘째부터는 공백), 앞뒤 공백 제거 후 1~500자 검사(정리 후 비면 `invalid_body`). 클라이언트 미러 `chatService.sanitizeChatBody`
4. 레이트 리밋: 유저당 **10초에 10건** 초과 시 예외(`rate_limited`, 남은 대기 초를 함께 반환). 같은 (유저, 방)의 동시 호출은 `pg_advisory_xact_lock`으로 직렬화(병렬 요청으로 한도를 넘기는 경합 방지)
4. INSERT → 반환 행
5. `realtime.send(payload, 'message', 'league-chat:' || room_id, true)` 로 채널에 전달
6. 시간 표시는 `created_at`(실시간). 인게임 날짜가 필요하면 `current_virtual_date(room_id)` — `rooms.sim_date` 직접 읽기 금지.

## Realtime 권한 (RLS on `realtime.messages`)
- 토픽 규칙: `league-chat:{room_id}`
- SELECT 정책: `realtime.topic()`에서 room_id를 파싱해 `room_members`에 `auth.uid()`가 있는 경우만 허용
- INSERT 정책: **만들지 않음**(클라이언트 직접 broadcast 차단)
- 입장 시 1회 검사(메시지마다 아님). Authorization 풀 2개는 동시 입장이 몰릴 때만 병목 가능 → 문제 시 풀 확대.

## 클라이언트
- `services/multi/chatService.ts` — `fetchChatMessages(roomId, beforeId?)`(id desc, 50건 커서), `sendChatMessage(roomId, body)`(RPC)
- `hooks/useLeagueChat.ts` — 채팅 화면 마운트 시 private 채널 구독 + 최근 50건 조회, 재연결(SUBSCRIBED 재수신) 시 누락분을 `id > 마지막id`로 보충, 위로 스크롤 시 이전 페이지
- 안 읽은 수 배지: FAB에 항상 표시해야 하므로 `LeagueLayout`에서 채널 1개를 상시 구독하고, 위젯이 닫혀 있으면 카운트만 올림(`useLeagueTransactionsRealtime`와 같은 위치·패턴). 위젯을 열면 같은 채널의 메시지를 목록에 쌓음
- UI: 외부 채팅 UI 라이브러리 없이 직접 구현(목록 + 입력창). 디자인 시스템 컴포넌트 사용. **진입 방식은 우측 하단 FAB → 채팅 위젯 (아래 "UI 결정")**
- 에러: 전송 실패는 InlineNotice 인라인(토스트 아님), 레이트 리밋은 입력창 아래 한 줄.

## UI 결정 (2026-10-17, 사용자 확정)
**우측 하단 FAB(Floating Action Button) → 누르면 채팅 위젯이 열린다.** 별도 채팅 라우트/내비 탭 없음. 목업: 아티팩트 "리그 채팅 UI 목업"의 "대안: 플로팅 패널" 아트보드.

- **위젯**: 약 380×560, FAB 위쪽에 앵커. **상단 탭 [채팅 | 알림]**(2026-10-17 통합) — 채팅 탭 = 메시지 목록 + 입력창(우측에 "N명 접속 중"), 알림 탭 = 알림 목록(우측에 "전체 삭제"). 헤더에 접기 버튼은 두지 않음(FAB이 닫기 역할). 참가자 목록 패널은 **넣지 않음**
- **FAB**: 48px 원형 단색 `bg-indigo-600`. 닫힘 상태는 말풍선 아이콘 + **채팅 안 읽음 + 알림 안 읽음 합계 배지 하나**(`CountBadge` 스타일, 빨강, 9+ 상한), **열림 상태는 같은 자리에서 X 닫기 버튼으로 변환**. 열 때 안 읽은 게 알림뿐이면 알림 탭으로, 아니면 마지막에 본 탭으로 연다. 목업: "통합 버튼 상태" 아트보드
- **접속 인원(Presence)**: 같은 비공개 채널 `league-chat:{room_id}`에 presence를 함께 얹어(`config.presence.key = user_id`, `channel.presenceState()`의 키 개수) 센다. "접속" = 리그 화면이 열려 있는 사용자(위젯이 닫혀 있어도 채널은 상시 구독이므로). 기존 `useDraftPresence`/`useQuickPlayPresence`와 같은 패턴이지만 둘 다 전용 채널이라 재사용하지 않고 채팅 훅 안에 포함. 비공개 채널의 presence는 `realtime.messages`에 **`extension = 'presence'`일 때만** INSERT를 허용하는 정책이 추가로 필요(broadcast INSERT는 여전히 금지 → 위조 방지 유지). 이 정책 문법은 적용 전 Supabase 문서로 확인할 것(미검증)
- **마운트 위치**: `LeagueLayout`에 한 번만(리그 화면 이동 시 위젯 상태·구독 유지). 리그 밖(로비·로그인 등)에서는 렌더하지 않음
- **z-index**: 새 토큰 `widget: '300'`을 `tailwind.config.js` zIndex에 추가 — 사다리 `header 100 < widget 300 < modal 500 < popover 600 < tooltip 700 < toast 800 < takeover 1000`. 모달이 열리면 위젯 아래로 가려지고, 토스트는 위젯 위에 뜨며, 전체 화면 점유(라이브 경기·드래프트룸)에서는 자동으로 덮임
- **토스트는 이 위젯으로 통합 (2026-10-17 확정)**: 리그 안에서는 토스트 팝업을 띄우지 않고, 알림은 전부 **알림 탭 목록 + 탭/FAB 배지**로만 알린다. `LeagueChatDock`이 마운트되는 동안 `notificationStore.setToastsSuppressed(true)`(켜는 순간 떠 있던 토스트는 걷음, 언마운트 시 false). 리그 밖(로비·싱글플레이)과 위젯이 없는 비참가자 화면에서는 기존 토스트 그대로. 그래서 이전에 계획했던 `NotificationCenter` 리그 경로 오프셋(88px)·토스트 위치 이동안은 **불필요해져 폐기**. `UpdateToast`(`bottom-6 right-6`)만 같은 구역을 공유하므로 별도 확인 필요
- **알림 탭 데이터**: 전역 알림 저장소의 `history`(최근 50건, 새것 순). 읽음 = `readUpTo`(알림 탭을 본 시각, 메모리 전용) 이후에 도착한 것이 안 읽음. 탭을 보는 동안 도착/기존 알림은 모두 읽음 처리하되 "새 알림" 구분은 탭에 들어온 시점 기준으로 고정. 항목: 종류 아이콘(토스트와 같은 `KIND_STYLE`)·제목·메시지·상대 시간·"이동 →"(현재 경로와 다를 때만)·× 삭제. **리그 알림은 새로고침하면 사라짐**(원본은 뉴스피드·트레이드 기록 DB, 사용자 확정) — 에러 중 persistent만 기존 localStorage 미러로 복원
- **스포일러 방지**: 라이브 중계(`/season/game/`) 중에 도착한 league transient 알림은 토스트뿐 아니라 history에도 **남기지 않고 폐기**(목록으로 새어 나가면 안 됨). persistent(트레이드 제안 등)는 남김
- **채팅 읽음 기준**: 위젯이 열려 있어도 **알림 탭을 보는 동안 도착한 채팅은 안 읽음**으로 남는다(`useLeagueChat`의 `viewing = open && tab==='chat'`)
- **상태 유지**: 열림/닫힘만 `localStorage`에 룸별로 기억(편의 기능, 실패해도 닫힌 상태로 정상 동작). 입력 중이던 초안은 위젯을 닫아도 유지(컴포넌트 상태를 `LeagueLayout` 쪽에 둠)
- **모바일 폭**: 위젯은 화면 폭 전체 시트로(좌우 여백 16px, 높이는 `min(560px, 100dvh - 96px)`). 터치 영역 44px 이상
- **접근성**: FAB은 실제 `<button>`+`aria-label`("리그 채팅 열기, 안 읽은 메시지 N개"), 위젯은 `role="dialog"` 아님(비모달) — Esc로 닫기, 닫으면 포커스를 FAB으로 복귀

## DM 확장 대비 (1차 제외, 스키마·구조만 대비)
1차는 **리그 전체 채팅만** 구현한다. 아래만 미리 맞춰 두면 나중에 DM을 붙일 때 기존 구조를 뜯지 않는다.
- **테이블**: `league_chat_messages`에 `recipient_id uuid null`, `conv_key text null` 두 컬럼을 **지금 추가**(1차에서는 항상 null). 인덱스는 `(room_id, id desc)`에 더해 DM 때 `(room_id, conv_key, id desc)` 추가
- **RPC**: `send_chat_message(p_room_id, p_body, p_recipient_id default null)` — 1차는 `p_recipient_id`가 null이 아니면 예외(미지원). 시그니처만 열어 둠
- **채널**: 전체 채팅은 `league-chat:{room_id}`. DM 때는 **사용자별 받은편지함** `league-dm:{room_id}:{user_id}` 1개만 추가(쌍마다 채널 만들지 않음 → 구독 수 사용자당 1개)
- **conv_key 규칙**: `least(uid1,uid2) || ':' || greatest(uid1,uid2)` — A→B, B→A가 같은 대화
- **UI 자리**: 위젯 안에서 "리그 전체" 위에 대화 전환 영역이 붙는 구조로 확장(1차 목업에는 그리지 않음)
- **DM 때 추가로 정해야 할 것**: 대화별 읽음 위치 테이블, 차단/신고, 어드민 열람 가능 여부(약관 사안), 레이트 리밋 합산 여부

## 레이트 리밋 / 도배 방지 (2026-10-17 확정)
세 겹으로 둔다. 앞단일수록 느슨하고 사용자에게 보이며, 서버는 우회·버그 대비 최후 방어선.

| 계층 | 규칙 | 목적 |
|---|---|---|
| 클라이언트 쿨다운 | 전송 후 **0.5초** 동안 전송 버튼 비활성(안내 문구 없음) | 연타·엔터 중복 걸러내기 |
| 클라이언트 도배 잠금 | **3초 안에 5건** 보내면 입력창·전송 버튼을 **5초 잠금**(남은 초 카운트다운, 끝나면 자동 해제) | 0.5초 간격 연속 전송 도배 차단 |
| 서버(RPC) | **10초 구간에 10건** 초과 시 `rate_limited` 거절 | 우회·버그 방어, 공유 Realtime 한도 보호 |

- 서버는 "간격 0.5초"가 아니라 **구간 건수**로 판정(네트워크 지연으로 정상 요청이 0.5초보다 가깝게 도착할 수 있음)
- 정합성: 도배 잠금 주기가 (3초 전송 + 5초 잠금)당 최대 5건 ≈ 0.6건/초라서 서버 한도(1건/초)보다 낮다 → 정상 클라이언트는 서버 한도에 닿지 않음
- 서버 구현: RPC 안에서 `league_chat_messages`의 `(room_id, user_id)` 최근 10초 행 COUNT(별도 테이블 없음, `(room_id, id desc)` 인덱스 사용)
- 세션 1개가 서버 한도까지 계속 보내는 극단 상황: 30명 × 1건/초 × 30명 = 900 events/s(한도 2,500의 36%)
- UI: 도배 잠금·서버 거절 모두 같은 표시 — 입력창 아래 12px `amber-400` 한 줄(InlineNotice `sm`, `role="alert"`) + 입력창/전송 버튼 비활성. 서버 거절 시엔 반환된 남은 초로 같은 잠금을 건다
- 잠금 상태는 클라이언트 메모리에만(새로고침하면 풀림 — 서버 한도가 최후 방어선이므로 무방)
- 반복 위반 시 잠금 시간 증가(5→10→30초)나 서버 측 뮤트는 1차 범위 밖

### 보류: 반복 도배 시 5분 정지 (2026-10-17 계획만 기록, **구현은 미룸**)
도배 잠금(5초)에 연속으로 걸리면 5분간 채팅을 정지시키는 기능. 클라이언트 메모리만으로는 새로고침에 풀리므로 **서버 상태가 필요**해서 1차에서 제외했다. 1차 구현 때 이 기능을 염두에 두고 막아야 할 것은 없다(아래 테이블·RPC는 나중에 덧붙이면 됨).
- **핵심 아이디어**: 서버가 도배 잠금도 같은 규칙으로 직접 판정해야 "연속으로 걸렸다"를 알 수 있다. 클라이언트 잠금은 서버가 관측할 수 없음
- **상태 표** (사용자당 1행, 세션당 최대 30행):
  `league_chat_state(room_id, user_id, locked_until, strikes, strike_since, muted_until, primary key(room_id,user_id))` — SELECT는 본인 행만(RLS), 쓰기는 RPC만
- **`send_chat_message` 확장**:
  1. `muted_until`/`locked_until`이 남아 있으면 `chat_muted`/`chat_locked` + 남은 초를 반환하며 거절
  2. 저장 후 최근 3초 안의 내 메시지가 이번 것까지 5건이면 잠금 시작 → `locked_until = now + 5초`, strikes + 1
  3. 10분 안에 잠금 3회면 `muted_until = now + 5분`, strikes 초기화
- **클라이언트**: 같은 규칙을 복제해 즉시 표시만 하고, 서버가 반환한 시각으로 동기화. 새로고침 시 본인 상태 행을 조회해 복원. 정지 중에도 읽기·수신은 정상
- **UI**: 입력창 아래 한 줄 "채팅이 5분간 정지됐어요. 남은 시간 4:32"(정지는 `red-400`로 도배 잠금 `amber-400`과 구분), 입력창·전송 버튼 비활성
- **비용**: 메시지당 PK 조회 1회 추가, 행 갱신은 잠금 시작 때만
- **기본값 제안(미확정)**: 10분에 잠금 3회 → 5분 정지, 해제 시 strikes 초기화
- **같이 결정해야 할 것**: 어드민 정지 해제(기본안: 제외, 5분 기다림), 감사 로그 기록(기본안: 제외 — 넣으면 `league_action_logs` 트리거 + `ACTION_LABELS`/`ACTION_CATEGORIES` 동시 갱신)

## 보존 정책
- 기본안: 세션당 최근 1,000건 유지, 야간(또는 `scheduler.ts` 주기)에 `delete ... where id < 기준값` 배치
- 리그/룸 삭제 시 CASCADE. 시즌 아카이브 때는 건드리지 않음
- 파티셔닝은 규모가 커질 때만(현재 과설계)

## 어드민
- 어드민 메시지 삭제/유저 뮤트는 **1차 범위 밖**. 필요 시 삭제 RPC + `league_action_logs` 기록(새 action 코드 시 `ACTION_LABELS`/`ACTION_CATEGORIES` 동시 갱신)

## 구현 단계
1. DB: 테이블 + 인덱스 + RLS + RPC + `realtime.messages` 정책 (마이그레이션은 MCP로 적용 → dev-log에 SQL 전문 기록)
2. 서비스/훅: `chatService.ts`, `useLeagueChat.ts`
3. UI: 채팅 화면(진입 위치 결정 후) + 안 읽은 배지
4. 보존 배치
5. 검증: 2계정 동시 전송, 비멤버 구독 거부, 직접 INSERT/직접 broadcast 거부, 레이트 리밋, 재연결 후 누락 보충
6. `docs/history/dev-log.md` 기록, `plan-index.md` 상태 갱신

## 위험 / 미확인
- `realtime.send()` 사용 가능 여부와 시그니처는 적용 전 Supabase 문서/`search_docs`로 재확인
- events/s가 전달 건수 기준인지 미확인(위에서 보수적으로 가정)
- 비공개 채널 RLS가 기존 공개 채널 훅에 영향 없는지 확인

## 결정 사항
- [x] DM: **1차 제외**, 확장 대비 스키마만 반영 (2026-10-17)
- [x] 진입 위치: **우측 하단 FAB → 채팅 위젯** (2026-10-17)
- [x] 안 읽은 수 배지: **포함**(FAB에 표시)
- [x] "입력 중…" 표시: **1차 제외** (Presence 한도 소모)
- [x] 참가자 목록 패널: **1차 제외**
- [x] 위젯이 열려 있을 때 FAB: **닫기(X) 버튼으로 변환** (2026-10-17)
- [x] 접속 인원: **표시**(헤더 "N명 접속 중", 같은 채널의 Presence) (2026-10-17)
- [x] 탭 방식 아트보드 폐기 — 전체 채팅만이면 위젯으로 충분 (2026-10-17)

## 결정 대기
- [x] 레이트 리밋: 클라이언트 0.5초 쿨다운 + 3초 5건 도배 잠금(5초), 서버 10초 10건, 구현은 최근 N건 COUNT (2026-10-17)
- [ ] "상태별 화면" 아트보드의 폭을 위젯 폭(380px)으로 재작성할지 (현재는 3열 그리드, 카드 폭 약 370px라 거의 동일)
