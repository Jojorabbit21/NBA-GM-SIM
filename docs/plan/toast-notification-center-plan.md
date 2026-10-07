# 전역 토스트 알림 센터 — ZenGM 분석 + 설계안

> 작성: 2026-10-02. 사용자 요구: 서비스 전체의 에러를 한 컴포넌트에서 관리, 우측 하단 토스트 스태킹,
> 개별/전체 삭제, 토스트에서 발생 화면으로 링크, 영속화 여부 검토.
> 분석 대상: `zengm-master/`(로컬 클론) `src/ui/util/notify.ts`, `src/ui/util/showNotification.ts`,
> `src/ui/components/Controller/Notifications.tsx`, `src/worker/util/logEvent.ts`, `src/worker/db/connectLeague.ts`.

---

## 1. ZenGM 구조 (사실 정리)

ZenGM은 알림을 **두 층**으로 나눈다.

### 1-1. 표시층 — 휘발성 토스트 (`notify` → `Notifications`)
- `notify(message, title, { extraClass, onClose, persistent, type })`가 nanoevents 이미터로 `Message`를 발행.
  `Message = { id(증가 정수), message(ReactNode|HTML 문자열), title?, extraClass?, onClose?, persistent, type }`.
- `Notifications` 컴포넌트(앱 루트 Controller에 1개)가 이미터를 구독해 `useState<Message[]>`로 스택 관리.
  **상태는 메모리뿐** — 새로고침하면 전부 사라진다. 마운트 전에 발행된 알림은 모듈 레벨 배열에 쌓아뒀다가
  마운트 시 재발행(초기화 경쟁 방지).
- 규칙:
  - 최대 5개. 넘치면 **persistent는 유지**하고 오래된 transient부터 제거(제거 시 `onClose` 호출). persistent가
    4개를 넘으면 가장 오래된 persistent도 밀려남(항상 새 알림 자리 1칸 확보).
  - transient는 8초 타임아웃 자동 제거, **호버 중엔 타이머 일시정지**(남은 시간 보존), 탭이 숨겨져 있으면
    transient는 아예 표시 안 함(성능).
  - 타입별 최대 표시 수(`undo`는 1개 — 새 undo가 오면 이전 undo 토스트 교체).
  - 개별 × 버튼, 스택이 있을 때만 보이는 "전체 닫기" × 버튼(목록 바깥 우측 하단).
  - framer-motion `AnimatePresence`로 아래에서 올라오는 진입/축소 퇴장 애니메이션, `layout`으로 재배치.
  - 위치는 `.notification-container`의 `ul`을 `bottom` px로 띄움 — 하단 광고/멀티팀 메뉴/sticky 버튼 높이만큼 가산.
- `showNotification()`은 `notify()` 앞단: 타입별 기본 제목(`error`→"Error!", `changes`→"Changes since your
  last visit"…), persistent면 기본 스타일 `notification-danger`, 라이브 경기 중엔 비-persistent 숨김, persistent
  에러는 시뮬 자동진행 중단(`lockSet stopGameSim`).

### 1-2. 영속층 — 이벤트 로그 (`logEvent` → IndexedDB `events`)
- 워커의 `logEvent({ type, text, pids, tids, score, saveToDb=true, showNotification=true, persistent, … })`.
  `saveToDb`면 `idb.cache.events.add({...event, season})`로 **IndexedDB `events` 스토어(autoIncrement `eid`)** 에
  저장 → 트랜잭션/뉴스 화면에서 재조회. `showNotification`이면 UI로 `showNotification` 메시지를 보내 토스트.
- 즉 **"토스트"와 "영속 기록"은 별개 플래그**다. 이미지의 "Upgrading league2 database…"는 `type: "upgrade"`,
  `saveToDb: false`(저장 안 함) + 진행 중 알림. 치명적 에러(`newPhase` 실패)는 `saveToDb: false, persistent: true`.
- **링크**: 메시지는 HTML 문자열(`SafeHtml`로 렌더)이고 `<a href="/l/${lid}/upgrade65">` 같은 앱 내 경로나
  외부 매뉴얼 링크를 본문에 직접 넣는다. "발생 화면으로 링크"는 별도 필드가 아니라 **본문 안의 a 태그**.
- 에러 저장: ZenGM의 영속 `events`는 게임 이벤트(트레이드/부상/수상)용이고, **에러 토스트는 저장하지 않는다.**

### 1-3. 우리 요구와의 차이
| 요구 | ZenGM | 우리 설계 |
|---|---|---|
| 우측 하단 스택, 개별/전체 삭제 | 있음 | 그대로 채택 |
| 발생 화면 링크 | 본문 HTML의 a 태그 | 구조화 필드 `link: { to, label }` + `source`(화면 id) |
| 에러 영속화 | 없음(에러는 휘발) | 선택: 로컬 영속(§3) |
| 서버 발생 에러 | 워커가 toUI | RPC/Fly 응답을 `mapTradeOfferError`류가 변환해 `notify()` |
| 자동 소멸 | 8초, 호버 일시정지 | 동일. 에러는 persistent(수동 닫기) |

---

## 2. 우리 설계안

### 2-1. 모듈
```
services/notifications/notificationStore.ts   — 순수 스토어(이미터 + 배열 + 규칙), React 비의존
services/notifications/notify.ts              — notify.error/warn/info/success 헬퍼
components/common/NotificationCenter.tsx      — 우측 하단 스택 UI(1개, App 루트)
```
```ts
export type AppNotification = {
  id: string;                 // crypto.randomUUID()
  kind: 'error' | 'warning' | 'info' | 'success';
  title?: string;
  message: string;            // 순수 텍스트(HTML 금지 — XSS/SafeHtml 의존 회피)
  link?: { to: string; label?: string };   // 발생 화면(react-router 경로). 토스트 클릭 또는 "이동" 버튼
  source?: string;            // 'trade.respond' 같은 발생 지점 태그(필터/디버깅)
  persistent: boolean;        // true=수동 닫기만, false=8초 후 자동
  createdAt: number;          // Date.now()
  context?: { leagueId?: string; roomId?: string };
};
```
- 규칙은 ZenGM 그대로: 최대 5개 표시(persistent 우선 보존), 호버 시 타이머 정지, `document.hidden`이면
  transient 생략, 개별 ×, 전체 × 버튼. 애니메이션은 기존 `animate-in` 유틸(tailwindcss-animate)로 충분.
- 링크: `link.to`가 현재 경로와 같으면 버튼 숨김. `useNavigate`는 NotificationCenter 안에서만 사용(스토어는
  라우터 비의존).

### 2-2. 발생 지점 연결
- 지금 `actionError` + 빨간 배너(멀티 6곳: 트레이드 2, 블록 모달, FA, 어드민 트레이드 패널, 어드민 팀 편집)를
  `notify.error({ message, link: { to: location.pathname + search } })`로 교체. 배너를 당장 없애지 않고
  **둘 다** 띄우는 과도기도 가능(배너는 인라인 맥락, 토스트는 전역 기록).
- 전역 포착: `QueryCache.onError`(React Query, 이미 있음 — console.error만 함) → `notify.error`로 승격.
  `window.onerror`/`unhandledrejection`도 1곳에서 수집. Fly 서버 401/403 등 `handlePossibleDeadSession`류도 동일.
- 메시지 변환은 지금처럼 각 서비스(`mapTradeOfferError` 등)가 한국어로 만든 뒤 넘긴다.

### 2-3. 영속화 (§3 결론 반영)
- 기본값: **메모리 + localStorage 미러**(`nba-gm-sim-notifications`, 최근 50건, 7일). 새로고침/재접속 후에도
  persistent 알림이 남고, 전체 삭제 시 함께 비움. `try/catch` 필수(사생활 모드·용량 초과).
- 서버 저장은 하지 않는다(에러 로그는 Fly/Supabase 로그가 담당, 유저별 인박스는 `user_messages`가 담당).

---

## 3. "브라우저 캐시만으로 영속화가 가능한가"에 대한 답

**가능하지만 "같은 브라우저·같은 기기·같은 오리진" 안에서만**이고, 보장은 아니다.

- 선택지는 셋: `localStorage`(동기, 5~10MB, 문자열), `IndexedDB`(비동기, 수백 MB, 구조화 — ZenGM이 쓰는 것),
  Cache Storage(HTTP 응답용, 부적합). 알림 50건 수준이면 localStorage가 가장 단순하고 충분.
- 한계:
  1. **기기·브라우저 간 공유 불가** — 다른 PC/모바일/다른 브라우저에서는 안 보임.
  2. **지워질 수 있음** — 사용자가 사이트 데이터 삭제, 사생활 모드 종료, Safari의 7일 미사용 스토리지 정리
     (ITP, 특히 iOS), 저장 용량 압박 시 브라우저 임의 퇴거(IndexedDB도 `navigator.storage.persist()`를
     허가받지 않으면 best-effort).
  3. 이 프로젝트는 이미 React Query 캐시를 localStorage(`nba-gm-sim-query-cache`)에 올리고 있고 과거에
     QuotaExceeded를 겪었으므로(2026-09-04), 알림은 **별도 키·상한(건수/기간)** 으로 분리해 영향을 끊어야 함.
  4. XSS 방어: 저장된 메시지를 HTML로 렌더하지 말 것(텍스트만).
- 기기 간 동기화나 "운영자가 유저 에러를 본다"가 필요하면 그건 캐시가 아니라 DB(`user_messages` 확장 또는
  `user_notifications` 테이블)가 필요하다. 에러 토스트는 그 수준까지 갈 이유가 보통 없고, ZenGM도 에러는
  영속화하지 않는다.

**추천**: localStorage 미러(최근 50건·7일·persistent만) + 전역 1개 컴포넌트. IndexedDB는 필요 없음.

---

## 4. 리그 진행 알림도 같은 토스트로 (2026-10-02 사용자 제안 반영)

### 4-1. 현재 리그 알림 데이터 경로(사실)
- `league_events`(룸 단위 이벤트 로그, 30종: trade / injury / suspension / game_result / playoff_* / play_in_* /
  draft_lottery_result / mvp·dpoy·finals_mvp·all_nba·all_def / allstar_* / player_feat / player_streak / win_streak /
  power_ranking)가 서버(Fly 시뮬러·RPC)에서 INSERT되고, `useLeagueHeadlines`가 Supabase Realtime
  `postgres_changes`(INSERT, room_id 필터)로 받아 react-query 캐시를 무효화해 뉴스피드를 갱신한다.
- `league_trade_offers`는 `usePendingTradeCount`가 Realtime(`to_team_id` 필터)으로 배지만 갱신.
- `games`는 `useMultiGameData`가 Realtime으로 일정 상태를 갱신(재연결 시 강제 재조회).
- 멀티에는 `user_messages` 인박스가 없다(싱글 전용). 즉 **멀티의 "내게 온 알림"은 현재 배지와 뉴스피드뿐**이고
  토스트는 없다.

### 4-2. 설계: 토스트는 표시층, 영속은 이미 DB에 있음
ZenGM과 같은 2층 구조를 그대로 쓰되, 우리는 영속층이 이미 서버 DB(`league_events`, `league_trade_offers`,
`games`)에 있으므로 **리그 알림은 로컬에 저장할 필요가 없다**. 토스트는 "마지막으로 본 시점 이후 새로 생긴
이벤트"를 보여주는 창구이고, 지나간 건 뉴스피드/메시지함에서 다시 본다. 이러면 §3의 영속화 고민은
에러(로컬 발생, DB 없음)에만 남는다.

```
AppNotification.kind: 'error' | 'warning' | 'info' | 'success' | 'league'
AppNotification.leagueEvent?: { eventId: number; type: LeagueEventType; roomId: string }
```

- **공급원 1 — `league_events` INSERT**: `useLeagueHeadlines`의 Realtime 콜백에서 invalidate와 함께 payload를
  `notify.league({...})`로 변환. 변환은 기존 `parseLeagueEventPayload()` + `newsBlurb`(기사체 텍스트 생성기)를
  재사용 — 토스트용 한 줄 요약은 headline만 쓴다. 링크: `link.to = /multi/leagues/{id}/season/news?event={eid}`
  (트레이드면 트레이드 히스토리, 부상이면 선수 페이지 등 타입별 분기).
- **공급원 2 — 내게 온 트레이드 제안**: `usePendingTradeCount` Realtime(INSERT, to_team_id=내 팀)에서
  `notify.league({ message: '{팀}에서 트레이드 제안이 도착했습니다', link: 트레이드 메시지함, persistent: true })`.
  수락/거절/만료(UPDATE)는 보낸 쪽(from_team_id)에도 알려야 하므로 from 필터 채널을 하나 추가.
- **공급원 3 — 내 팀 경기 종료**: `games` UPDATE 중 `status`가 final로 바뀌고 내 팀이 포함된 건만
  `notify.league({ message: '{상대} 전 {승/패} 112-108', link: 경기 상세 })`. 라이브 PBP 화면을 보고 있는 중에는
  생략(ZenGM의 `hideInLiveGame`과 같은 규칙).
- **노이즈 제어(중요)**: 리그 이벤트는 하루 시뮬에 수십 건이 한꺼번에 들어온다. (a) 사용자별 수신 필터
  (내 팀 관련 / 리그 전체 주요 이벤트 / 끔) — 뉴스피드 체크박스와 같은 UI, localStorage에 저장.
  (b) 같은 시뮬 틱에 들어온 `game_result` N건은 "오늘 경기 N경기 종료"로 **묶음 토스트** 1개. (c) `league`
  kind는 transient(8초) 기본, 트레이드 제안·플레이오프 결과 같은 "내가 행동해야 하는" 것만 persistent.
  (d) ZenGM처럼 `document.hidden`이면 transient 생략 — 탭을 다시 열었을 때 수십 개가 쏟아지지 않게.
- **놓친 알림**: 탭이 닫혀 있던 동안의 이벤트는 토스트로 재생하지 않는다(뉴스피드가 담당). 대신 "마지막 확인
  이후 새 이벤트 N건" 요약 토스트 1개만 띄우는 선택지가 있다 — `league_events.created_at > lastSeenAt`
  (localStorage) 카운트. ZenGM의 "Changes since your last visit"와 같은 아이디어.
- **싱글플레이**: 인박스(`user_messages`)가 이미 있으므로 메시지 생성 시점(`messageService`)에 `notify.league`를
  한 줄 추가하면 같은 토스트를 쓴다.

### 4-3. 결론
- 에러 + 리그 알림을 **한 컴포넌트, 한 스토어**로 통합. 차이는 `kind`와 공급원뿐.
- 영속화: 에러만 localStorage(최근 50건·7일), 리그 알림은 DB가 원본이라 저장 안 함(lastSeenAt만 저장).
- 추가 비용: Realtime 채널 1개(보낸 트레이드 제안 상태) 외엔 기존 구독 콜백에 한 줄씩 붙이는 수준.

## 5. 예외 처리 — 코드 대조 결과와 보완 사항 (2026-10-02)

예외 케이스 7개 그룹을 현재 코드와 대조한 결과, 계획이 이미 다루는 것 외에 **보완이 필요한 지점 4곳**이
확인됐다. 아래 4항목은 1차 구현에 포함한다.

### 5-1. 오프라인 감지 (보완)
- 현재 코드에 `navigator.onLine`/online·offline 리스너 사용처가 없다(grep 0건). 네트워크 끊김 시 조회 실패가
  연쇄로 알림이 되는 것을 막으려면 감지 코드가 필요.
- 결정: 1차에서 `window` online/offline 리스너를 NotificationCenter(또는 스토어 초기화)에 1곳 추가. 오프라인
  전환 시 "연결이 끊겼습니다" persistent 1개(식별 키 `offline`)만 띄우고, 오프라인 상태에서 들어오는 조회
  실패 알림은 전부 억제. 온라인 복귀 시 그 알림을 자동으로 닫고 transient "연결이 복구됐습니다"로 교체.
  조회 실패는 어차피 react-query 재시도(retry 1)가 끝난 최종 실패만 수집한다.

### 5-2. 401 억제 기준 재정의 (보완)
- 세션 사망 판정(`handlePossibleDeadSession`)은 Fly 라이브 경기 서비스에만 있고, Supabase 조회의 401은
  supabase-js 토큰 자동 갱신에 맡겨져 있다. 2026-10-01 Fly 로그에서 확인했듯 토큰 만료 직후 갱신 전 틈에
  401이 1회 발생하는 패턴이 실제로 있다.
- 결정: 401(또는 `JWT expired`류 메시지)인 실패는 **즉시 알리지 않고 20초 보류**. 보류 중 같은 쿼리 키의 재시도가
  성공하면 알림을 취소(토큰 갱신 틈으로 판단), 20초 안에 성공이 없거나 세션 사망 판정이 로그인 화면으로
  보내는 경로가 발동하면 그 경로에 맡기고 개별 알림은 내지 않는다. 즉 401은 사실상 토스트로 올라오지 않고,
  세션 사망은 기존 리다이렉트가 담당한다.

### 5-3. 라이브 중계 중 판정은 라우트 경로 기준 (보완)
- ZenGM의 `liveGameInProgress` 같은 전역 플래그가 우리 코드엔 없다. 멀티 라이브 PBP 화면 라우트는
  `/multi/leagues/:leagueId/season/game/:gameId`.
- 결정: NotificationCenter가 `useLocation()`으로 현재 경로가 `/season/game/`를 포함하면 "라이브 중계 중"으로
  보고, `kind: 'league'`이면서 transient인 알림(경기 결과 등)은 표시하지 않는다(폐기, 요약에도 포함 안 함).
  persistent(트레이드 제안 도착 등)와 에러는 그대로 표시. 싱글 라이브 경기 화면(`LiveGameView`)도 같은 규칙,
  경로는 착수 시 확인.

### 5-4. 룸 전환 시 리그 알림 정리 (보완)
- 멀티에는 룸이 바뀔 때 캐시를 정리하는 지점이 없다(싱글 `useGameData`의 `removeQueries`만 존재). 리그 A의
  트레이드 제안 알림이 리그 B 화면에 남아 링크를 누르면 다른 리그로 튀는 문제가 생긴다.
- 결정: 스토어에 `clearByRoom(roomId)`를 두고, 리그 레이아웃(`useCurrentLeague`가 roomId를 확정하는 곳)에서
  roomId가 바뀔 때 **이전 룸의 `kind: 'league'` 알림만** 제거(에러 알림은 유지). `lastSeenAt`은 룸별 키라 영향
  없음. 리그를 나가 홈으로 가면 모든 리그 알림 제거.

### 5-5. 대조로 확인된 "이미 계획에 있고 실제로 발생하는" 지점 (참고)
- 오류 객체 정규화: 조회 훅 21곳이 Supabase 오류 객체를 던져 `QueryCache.onError`에 객체가 들어옴.
- 빈 메시지: 서비스 11곳이 `error?.message ?? null`을 반환.
- 마운트 전 발행: 쿼리 클라이언트가 앱 루트 밖에서 초기화됨 → 큐잉 필수.
- **중복 발행**: `usePendingTradeCount`가 사이드바·헤더에서 동시 마운트돼 채널이 2개 → 같은 제안이 두 번 옴.
  식별 키(제안 id) 교체를 **스토어 단**에서 처리해야 훅을 어디서 몇 번 쓰든 안전.
- 재연결 중 놓친 이벤트: `useMultiGameData`가 재연결 시 강제 재조회를 하는 이유와 동일 → 요약 알림으로 대체.
- 폭주 묶음: `useLeagueHeadlines`의 400ms 디바운스 창을 그대로 묶음 창으로 사용.
- 로그아웃: `useAuth`의 SIGNED_OUT 분기에서 스토어 전체 비우기 + 로컬 미러 삭제.
- 저장소 예외: 2026-09-04 용량 초과 사고 전례 → 별도 키·상한·try/catch.
- 시각: `utils/serverClock.getServerNow()`가 있으므로 생성 시각·lastSeenAt에 사용.
- 모달 위 표시: `Modal`이 `z-[500]` → 토스트 레이어는 그보다 높게.
- 1차 제외 명시: 다중 탭 동기화, 닫혀 있던 동안의 개별 재생. aria-live는 비용이 작아 넣는다(공손 모드).

## 6. 작업 순서(착수 시)

> 진행: 1단계 완료(2026-10-02, dev-log (5)), 2단계 완료(dev-log (6)(7)) — 트레이드 2곳·FA·블록 모달·어드민 트레이드 패널의 이벤트성 오류 배너 전부 토스트로 교체. 어드민 팀 편집의 "담당 계정 없음" 띠는 상태 안내라 인라인 유지. 3단계 완료(dev-log (8)): useLeagueNotifications 훅(제안 도착/결과·리그 이벤트 묶음·룸 정리)을 LeagueLayout에 마운트. 4단계 완료(dev-log (9)): errorCollector(조회 실패·window 예외·오프라인·401 보류). 5단계 완료(dev-log (10)): 에러 미러·로그아웃 비우기·수신 범위 UI(뉴스피드). **1~5단계 전부 구현 완료, 남은 건 브라우저 E2E 확인과 6단계(문서)뿐.**
1. 스토어 + NotificationCenter + App 루트 마운트, `notify.error`/`notify.league` 헬퍼 (코드 ~300줄)
2. 멀티 트레이드 화면 2곳부터 교체 → 확인 후 나머지 5곳
3. 리그 알림 공급원 연결: 트레이드 제안 도착(persistent) → league_events(필터·묶음) → 내 팀 경기 종료
   (+ §5-3 라이브 중계 중 억제, §5-4 룸 전환 정리)
4. `QueryCache.onError`/`unhandledrejection` 수집 (+ §5-1 오프라인 리스너, §5-2 401 보류)
5. 에러 localStorage 미러 + 상한 + 전체 삭제 연동, 리그 알림 수신 필터 UI
6. dev-log 기록

> [2026-10-06] 어드민 트레이드 실패는 토스트 대상에서 제외 — 세션 설정 로그(`admin_trade_failed`, RPC `admin_log_failed_action`)에만 기록. 갤러리 아티팩트 v16 반영.
