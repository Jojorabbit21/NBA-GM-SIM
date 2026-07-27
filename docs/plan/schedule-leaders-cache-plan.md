# 스케줄 화면 PTS/REB/AST 리더 localStorage 캐싱 — 구현 계획

**상태**: 구현 완료 (2026-07-27 작성 → 2026-07-27 구현 완료)
**관련 dev-log**: [docs/history/dev-log.md](../history/dev-log.md) — "스케줄 화면 PTS/REB/AST 리더 localStorage 캐싱" 항목

## 1. 배경 / 문제 정의

[MultiScheduleView.tsx:333-352](../../views/multi/season/MultiScheduleView.tsx#L333-L352)의 `gameLeadersMap`
로딩 로직:
```ts
const [gameLeadersMap, setGameLeadersMap] = useState<Record<string, GameLeaders>>({});
useEffect(() => {
    if (!room?.id) return;
    const loadLeaders = async () => {
        const { data } = await supabase
            .from('game_pbp')
            .select('game_id, home_box, away_box')
            .eq('room_id', room.id);
        // ... map[row.game_id] = computeGameLeaders(row.home_box, row.away_box) ...
        setGameLeadersMap(map);
    };
    loadLeaders();
    const timer = setInterval(loadLeaders, LIVE_POLL_MS); // 5초
    return () => clearInterval(timer);
}, [room?.id]);
```
이 컴포넌트는 시즌 하위 탭(로스터/순위 등)을 오가며 언마운트→재마운트되므로, **스케줄 화면에 들어갈
때마다** 방 안의 `game_pbp` 전체 row(`home_box`/`away_box` JSON 포함)를 새로 조회하고, 화면에 머무는
동안 5초마다 계속 재조회한다.

`game_pbp` row는 `simRunner.ts`가 경기 시뮬레이션 완료 시 **1회 upsert**하고 그 뒤로 갱신되지 않는다
(관리자 수동 재시뮬레이션 같은 예외적 상황 제외 — 이번 계획에서는 고려하지 않기로 결정, §4 참조).
즉 **이미 끝난 경기의 PTS/REB/AST는 다시 조회해도 항상 같은 값**인데, 매번 방 전체를 다시 읽고
있어 낭비.

참고로 경기 결과(스코어)는 이미 최적화돼 있음 — `useSeasonContext()`의 `schedule`은
[useMultiGameData.ts:184-259](../../hooks/useMultiGameData.ts#L184-L259)에서 `[roomId, userId]`
의존 `useEffect`로 **방 진입 시 1회만** 로드되고, 시즌 레이아웃([MultiSeasonLayout.tsx](../../views/multi/season/MultiSeasonLayout.tsx))이
하위 탭 전환 동안 계속 마운트 상태를 유지해 재조회되지 않는다. 이번 계획은 PTS/REB/AST 리더에만 해당.

## 2. 목표

이미 종료된(`played: true`) 경기의 PTS/REB/AST 리더를 **최초 1회만 서버에서 조회**하고,
`localStorage`에 영구 캐싱해서 이후에는 새로고침·재방문해도 다시 조회하지 않는다.

## 3. 설계

### 신규 파일: `services/multi/gameLeadersCache.ts`

```ts
export interface StatLeader { name: string; value: number }
export interface GameLeaders { pts?: StatLeader; reb?: StatLeader; ast?: StatLeader }

const keyFor = (roomId: string) => `nbagm:gameLeaders:${roomId}`;

export function loadGameLeadersCache(roomId: string): Record<string, GameLeaders> {
    try {
        const raw = localStorage.getItem(keyFor(roomId));
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {}; // 손상된 캐시는 빈 값으로 폴백 — 다음 조회에서 자연 복구
    }
}

export function mergeGameLeadersCache(
    roomId: string,
    updates: Record<string, GameLeaders>,
): Record<string, GameLeaders> {
    const merged = { ...loadGameLeadersCache(roomId), ...updates };
    try { localStorage.setItem(keyFor(roomId), JSON.stringify(merged)); } catch { /* 용량 초과 등 무시 */ }
    return merged;
}

export function clearGameLeadersCache(roomId: string): void {
    try { localStorage.removeItem(keyFor(roomId)); } catch { /* ignore */ }
}
```
`GameLeaders`/`StatLeader` 타입은 `MultiScheduleView.tsx`에 로컬 정의돼 있던 걸 이 파일로 옮기고
(export), `MultiScheduleView.tsx`는 여기서 import하도록 정리 — 캐시 모듈과 타입이 분리돼 있으면
나중에 다른 화면(예: 브라켓 화면)에서도 재사용하기 애매해짐.

### 변경: `views/multi/season/MultiScheduleView.tsx`

`gameLeadersMap` state 초기값을 `loadGameLeadersCache(room.id)`로 채우고(마운트 즉시 캐시 히트),
매 폴링마다 **캐시에 없는 `game_id`만** 조회하도록 쿼리를 델타로 바꾼다. `schedule`에서 이미
`played: true`로 확정된 게임만 대상으로 삼는다(진행 중/예정 경기는 애초에 `game_pbp` row가 아직
없거나 RLS로 안 보이므로 캐시 대상에서 자연히 제외됨).

```ts
const [gameLeadersMap, setGameLeadersMap] = useState<Record<string, GameLeaders>>(
    () => room?.id ? loadGameLeadersCache(room.id) : {},
);

useEffect(() => {
    if (!room?.id) return;
    let cancelled = false;

    const loadLeaders = async () => {
        const cached = loadGameLeadersCache(room.id);
        const playedIds = schedule.filter(g => g.played).map(g => g.id);
        const missingIds = playedIds.filter(id => !(id in cached));

        // 캐시에 없는 played 경기가 없으면 네트워크 요청 자체를 스킵
        if (missingIds.length === 0) {
            setGameLeadersMap(cached);
            return;
        }

        const { data } = await supabase
            .from('game_pbp')
            .select('game_id, home_box, away_box')
            .eq('room_id', room.id)
            .in('game_id', missingIds);
        if (cancelled || !data) return;

        const updates: Record<string, GameLeaders> = {};
        for (const row of data as { game_id: string; home_box: PlayerBoxScore[] | null; away_box: PlayerBoxScore[] | null }[]) {
            updates[row.game_id] = computeGameLeaders(row.home_box, row.away_box);
        }
        setGameLeadersMap(mergeGameLeadersCache(room.id, updates));
    };

    loadLeaders();
    const timer = setInterval(loadLeaders, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
}, [room?.id, schedule]);
```

**폴링 자체를 멈추는 것까지는 이번 범위에서 제외** — `missingIds.length === 0`이어도 인터벌은
계속 돌되(다음 경기가 막 끝나서 `played`로 바뀌는 걸 감지해야 하므로), 매번 쿼리를 스킵해서
네트워크 요청만 안 나가게 하는 선에서 충분하다고 판단. 인터벌 자체를 껐다 켰다 하는 로직까지 넣으면
"경기가 막 끝난 시점"을 놓치는 타이밍 버그 여지가 생겨 지금 범위에서는 과함.

### 변경: `views/multi/league/LeagueSettingsView.tsx` — 토너먼트 리셋 시 캐시 무효화

**왜 필요한가**: 토너먼트 경기 ID는 `T_R{round}_M{matchIndex}` 형태로 완전히 위치 기반이라
(`server/src/shared/tournamentBracket.ts:185,230,323` 확인 완료) 랜덤 요소가 없다. `resetTournament()`는
**같은 `room.id`를 재사용**해서 드래프트부터 다시 시작하므로, 리셋 후 새 토너먼트의 1라운드 첫 경기도
똑같이 `T_R1_M0_G1`이라는 ID를 갖게 된다 — roomId만으로 캐시를 영구 보존하면 리셋 전 경기의
PTS/REB/AST가 리셋 후 동명의 새 경기에 잘못 붙어 보이는 실제 버그가 생긴다. (관리자 수동
재시뮬레이션은 사용자 판단대로 이번 범위에서 고려하지 않음 — 극히 드물고 게임 ID 재사용 문제와는
별개의 예외 상황.)

`handleReset()`에서 `resetTournament()` 성공 직후 한 줄 추가:
```ts
const { error: err, archiveEdition } = await resetTournament(leagueId, room.id);
setResetting(false);
if (err) { setResetErr(err); return; }
clearGameLeadersCache(room.id);   // ← 추가
setResetConfirm(false);
...
```

## 4. 범위 밖으로 명시적으로 제외한 것 (사용자 확인 완료)

- **관리자 수동 재시뮬레이션**(`/sim-override`) — 이미 캐시된 경기를 강제로 다시 시뮬레이션하면
  캐시가 stale해질 수 있으나, 극히 예외적인 어드민 액션이라 방어 로직 추가하지 않음
- **"세션(리그/방)을 바꿨을 때"** — `roomId`가 캐시 키에 이미 포함되므로, 다른 방으로 이동하면
  자연히 다른 localStorage 키를 읽고 쓰게 됨. 별도 처리 불필요(설계상 이미 충족)

## 5. 남는 사소한 고려사항 (지금 당장 처리 불필요)

- 유저가 여러 방을 옮겨 다니면 각 방의 캐시 키가 localStorage에 계속 쌓임 — 방 하나당 데이터 크기가
  작아서(경기당 이름+숫자 몇 개) 당장 문제되는 용량은 아니지만, 방 목록에서 나간(강퇴/탈퇴) 방의
  캐시까지 정리하는 로직은 이번 범위 밖. 필요해지면 그때 LRU성 정리 추가

## 6. 검증 계획

1. `tsc --noEmit` (client)
2. 브레이스/괄호 균형 확인
3. `npm run build`
4. 브라우저에서 실제 확인: 스케줄 화면 진입 → Network 탭에서 `game_pbp` 요청 발생 확인 → 새로고침
   → 캐시 히트로 요청이 안 나가거나 `missingIds`가 비어 스킵되는지 확인 → 새 경기 종료 후 해당
   `game_id`만 델타로 조회되는지 확인
5. 토너먼트 리셋 실행 후 localStorage에서 해당 roomId 키가 지워졌는지 확인

## 7. 작업 순서

1. `services/multi/gameLeadersCache.ts` 작성 (타입 이전 포함)
2. `MultiScheduleView.tsx`를 델타 조회 + 캐시 히트 구조로 수정,로컬 타입 정의 제거하고 import로 교체
3. `LeagueSettingsView.tsx`의 `handleReset()`에 `clearGameLeadersCache(room.id)` 추가
4. `tsc` → 브라우저 확인 → `docs/history/dev-log.md` 기록
