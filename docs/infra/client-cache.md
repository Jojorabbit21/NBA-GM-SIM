# 클라이언트 캐시 현황과 개선 과제

**작성**: 2026-10-14 · **관련 dev-log**: 2026-10-14 "react-query localStorage 영속 캐시", "경기 리더 localStorage 캐시", 2026-09-04 "FA 렉 조사", 2026-08-11 "영속화 도입"
**관련 코드**: `index.tsx`(영속 설정) · `services/multi/gameLeadersCache.ts` · `hooks/useLeagueBootstrap.ts` · `hooks/useMultiSearchData.ts` · `hooks/useLeagueRawStats.ts`

브라우저(멀티플레이어 클라이언트)가 들고 있는 캐시 계층 전체를 한 문서에 정리한다. 2026-10-14에 localStorage 한도 초과가 반복되던 원인을 고치면서 실측한 수치와, 그때 하지 않기로 한 개선 항목을 남긴다.

---

## 1. 캐시 계층 지도

| 계층 | 저장소 | 수명 | 내용 | 코드 |
|---|---|---|---|---|
| react-query 메모리 캐시 | 메모리 | 탭 세션. `staleTime: Infinity`(전역 기본) — 수동 새로고침·탭 진입 트리거로만 재조회. `gcTime`은 쿼리별(선수 풀·숏코드류 Infinity, 나머지 기본 5분) | 모든 `useQuery` 데이터 | `index.tsx` `defaultOptions` |
| react-query 영속 캐시 | localStorage 키 1개 `nba-gm-sim-query-cache` | 24시간(`maxAge`) + 버스터 문자열 일치 시 | 메모리 캐시 중 **화이트리스트 3종의 최신 1개씩** (2절) | `index.tsx` persister |
| 경기 리더 캐시 | localStorage 키 `nbagm:gameLeaders:<roomId>` | 영구. **현재 방 1개만** 유지(다른 방 키는 리그 진입·저장 시 삭제) | 종료 경기별 PTS/REB/AST 리더 + MVP(전체/홈/원정) + 쿼터 점수 | `services/multi/gameLeadersCache.ts` |
| UI 편의 키 | localStorage 소형 키 | 영구 | `nbagm:rosterMode` · `nbagm:playMode` · `nbagm:draftPoolType` · `gameDateStripCollapsed` · `lastTeamId` · `trade_ops_<team>_<date>` | 각 화면 |
| Supabase 세션 | localStorage(`sb-*-auth-token`) | 라이브러리 관리 | 인증 토큰 | `services/supabaseClient.ts` |
| 서버 측 집계 | DB RPC | — | `get_player_season_stats_league/full`, `get_player_shot_events` 등 — 클라이언트가 원본(game_pbp)을 안 받도록 서버에서 미리 집계 | `hooks/usePlayerSeasonStats*.ts` |

브라우저 localStorage 한도는 **오리진당 약 5MB**(Chrome/Safari). 위 모든 localStorage 키의 합이 이 안에 들어가야 하고, 개발 서버 오리진(`localhost:포트`)은 다른 프로젝트와 공유될 수 있다.

---

## 2. 영속 캐시 규칙 (2026-10-14 기준)

```ts
// index.tsx
const PERSIST_INCLUDE_ROOT_KEYS = new Set(['multiSearchPool', 'metaPlayerOrder', 'gameShortCodes']);
const PERSIST_CACHE_BUSTER = '2026-10-14-persist-whitelist';
shouldDehydrateQuery = q => q.state.status === 'success'
    && PERSIST_INCLUDE_ROOT_KEYS.has(q.queryKey[0])
    && isLatestOfRoot(q)                       // 같은 루트 키(리그/방별 인스턴스) 중 dataUpdatedAt 최신 1개만
    && !(빈 multiSearchPool);                  // 2026-10-01 안전망
retry = ctx => { if (ctx.errorCount === 1) console.warn('[persist] …'); return removeOldestQuery(ctx); };
storage = window.localStorage;                 // 감싸지 말 것 — 예외가 라이브러리까지 가야 retry가 동작
```

- **화이트리스트 원칙**: 영속은 "작고, 잘 안 바뀌고, 새로고침 직후 즉시 필요한 것"만. 새 쿼리는 기본적으로 메모리 전용이며, 영속이 필요하면 이 Set에 **의식적으로** 추가한다. 블랙리스트 시절엔 키 이름이 바뀌면서(`leagueRawStats` → `leagueRawPbp` 분리) 제외가 비어 버린 사고가 있었다.
- **최신 1개 규칙**: 리그·방마다 키가 다른 쿼리는 가장 최근에 성공한 인스턴스만 저장. 메모리 캐시는 영향받지 않는다.
- **버스터**: 오염된 캐시를 전원에게서 지워야 할 때 문자열만 바꾼다(2026-10-01 빈 선수 풀 사고, 2026-10-14 한도 정리).
- **진단**: 개발 서버에서만 `window.__queryClient` 노출. 쿼리별 직렬화 크기:
  ```js
  __queryClient.getQueryCache().getAll().map(q => [JSON.stringify(q.queryKey).slice(0, 60), Math.round(JSON.stringify(q.state.data ?? null).length / 1024)]).sort((a, b) => b[1] - a[1]).slice(0, 10)
  ```
  localStorage 전체 사용량:
  ```js
  (() => { const r = Object.keys(localStorage).map(k => [k, localStorage.getItem(k).length]); return { totalKB: Math.round(r.reduce((s, [, n]) => s + n, 0) / 1024), top: r.sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}: ${Math.round(n / 1024)}KB`) }; })()
  ```

---

## 3. 실측 수치 (2026-10-14, 실리그 1개 접속 기준)

### react-query 쿼리별 직렬화 크기

| 쿼리 | 크기 | 영속 | 비고 |
|---|---|---|---|
| `multiSearchPool` (리그 1개, 선수 599명) | **2,220KB** | O | DB 원본은 명당 약 1.45KB(base_attributes) + 0.1KB(tendencies) ≈ 0.9MB. 런타임 `Player` 객체가 약 2.5배 |
| `leagueRawPlayers` (방 1개, 452명) | 647KB | X | 로스터 선수 신원+능력치 원본 |
| `playerSeasonStatsLeague` | 399KB | X | 서버 집계 시즌 스탯 |
| `leagueRawSeasonInjury` | 112KB | X | |
| `gameShortCodes` (방 1개) | 73KB | O | |
| `metaPlayerOrder` | 32KB | O | |
| `leagueNewsStories` 3종 (첫 페이지) | 24KB 이하 | X | 스크롤할수록 커짐 |
| `leagueRawPbp` (방 1개, 1,278경기) | **DB 48.9MB** | X | 로스터 화면 경기 기록·일정 탭에서만 로드. 절대 영속 금지 |

영속 저장 결과: `nba-gm-sim-query-cache` 길이 **2,383,244자(≈2.3MB)**.

### localStorage 다른 키

| 키 | 크기 | 비고 |
|---|---|---|
| `nbagm:gameLeaders:<roomId>` | 방당 최대 **1,003KB**(1,300경기 × 약 0.75KB) | 수정 전 10개 방 누적 3,983KB → 수정 후 현재 방 1개 |

수정 후 예상 총량: 약 1MB + 2.3MB + 소형 키 ≈ **3.4MB** (한도 5MB).

---

## 4. 2026-10-14에 고친 것 (요약)

1. 계측용 `debugStorage` 래퍼 제거 — `setItem` 예외를 삼켜 `removeOldestQuery` 복구가 한 번도 돌지 않던 버그. 한도 초과 뒤엔 저장 0 + 1초마다 4.8MB 직렬화 실패 반복이었다.
2. 블랙리스트 → 화이트리스트 3종 + 최신 1개 규칙.
3. `nbagm:gameLeaders:*`를 현재 방만 유지(`pruneGameLeadersCache`, 리그 진입·저장 시).
4. 버스터 갱신, `__debugQueryClient` 제거(개발 서버 전용 `__queryClient`로 대체).

상세와 롤백 방법은 dev-log 2026-10-14 항목 3건.

---

## 5. 추후 개선 과제 (우선순위 순)

### 5-1. 선수 풀 영속 슬림화 — 2.2MB → 1MB 이하
`multiSearchPool`의 런타임 `Player`는 DB 원본보다 2.5배 크다(`mapRawPlayerToRuntimePlayer`가 stats 기본값, 파생 필드, 로고 URL 등을 채움). 영속 캐시 전체의 95%가 이 하나다.
- **안 A(권장)**: 영속 전에 슬림화. `PersistQueryClientProvider`의 `dehydrateOptions`에는 변환 훅이 없으므로 `persister.persistClient`를 감싸 `multiSearchPool` 데이터만 원본 필드(`id, name, position, draft_year, base_attributes, tendencies`)로 줄여 저장하고, `restoreClient`에서 `mapRawPlayerToRuntimePlayer`로 되살린다. OVR 계산(0.1~0.3초)은 복원 시 다시 하되 네트워크 왕복은 없음.
- **안 B**: 쿼리 자체를 raw 행으로 바꾸고 `select`로 런타임 변환(react-query `select`는 메모리 캐시엔 raw만 두고 구독자에게 변환본 제공). 호출부 영향이 커서 B는 후순위.
- 효과: 영속 총량 2.3MB → 1MB 안팎. 직렬화 비용도 비례해 감소.

### 5-2. `removeOldestQuery` 대신 "큰 것부터" 전략
현재 복구는 `dataUpdatedAt` 오래된 순으로 뗀다. 화이트리스트 3종 중 선수 풀이 가장 크고 가장 최근일 때가 많아, 한도에 걸리면 작은 숏코드·순서부터 떼고 정작 선수 풀이 안 들어가는 순서가 될 수 있다. `retry`에서 직렬화 길이가 가장 큰 쿼리를 먼저 제거하도록 바꾸면 한 번에 해결된다(10줄).

### 5-3. 경기 리더 캐시의 항목 크기 축소
경기당 0.75KB 중 대부분이 `mvp`/`mvpHome`/`mvpAway`의 `stats: {label, value}[]`와 선수 이름 3벌 중복. `playerId`만 두고 이름·포지션은 선수 풀에서 조인하면 경기당 0.3KB 수준(방당 1MB → 0.4MB). 일정 화면·홈 위젯·팀 일정 캘린더 3곳의 읽기 코드 수정 필요. 5-1 뒤에 하면 localStorage 총량이 1.5MB 아래로 내려가 여유가 커진다.

### 5-4. 리더 캐시의 저장소 이동(IndexedDB)
localStorage는 동기 API라 1MB 쓰기도 메인 스레드를 막는다. 영속 캐시(`createAsyncStoragePersister` + `idb-keyval`)와 리더 캐시를 IndexedDB로 옮기면 한도(수백 MB)와 블로킹 둘 다 해소된다. 단, 두 저장소를 섞으면 "어디에 뭐가 있는지"가 다시 흐려지므로 **옮긴다면 둘 다 한 번에**. 5-1~5-3으로 충분히 작아지면 굳이 할 이유가 없다.

### 5-5. 메모리 캐시 `gcTime: Infinity` 점검
`multiSearchPool`·숏코드·`playerCareerHistory`·`playerTendencies` 등이 Infinity라 여러 리그를 오가면 메모리에 리그별 선수 풀(런타임 2.2MB × N)이 남는다. 탭을 오래 열어 두는 사용자는 수십 MB까지 갈 수 있다. 리그 전환 시 이전 리그 키를 `removeQueries`하거나 `gcTime`을 1시간 정도로 낮추는 것을 검토. 영속과 달리 아직 실측 문제는 없음.

### 5-6. 계측 코드의 수명 규칙
2026-09-04의 "임시 계측" 두 개(래퍼·전역 노출)가 40일간 남아 있었고 그중 하나가 복구 로직을 무효화했다. 앞으로 임시 계측은 (a) `import.meta.env.DEV` 가드 안에만 두고 (b) dev-log에 제거 예정일을 적는다. 이번에 넣은 `__queryClient`도 같은 규칙 대상이다.

---

## 6. 하지 않기로 한 것

- **로스터 원본·시즌 스탯·뉴스를 다시 영속 대상에 넣기**: 방별 키라 누적 위험이 크고, 부트스트랩 게이트가 매 접속 때 병렬로 받아오므로 체감 이득이 작다. 선수 풀 슬림화(5-1) 뒤에 여유가 생기면 `playerSeasonStatsLeague`(399KB) 정도만 재검토.
- **`leagueRawPbp`를 어떤 형태로든 영속**: 방 1개 48.9MB. 서버 집계 RPC로 대체하는 방향이 맞고, 경기 기록 탭도 장기적으로는 경기 단위 페이지네이션이나 서버 집계로 가야 한다.
