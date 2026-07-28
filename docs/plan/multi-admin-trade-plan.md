# 멀티플레이어 어드민 트레이드(팀↔팀 선수 스왑) 계획

> **상태: 구현 완료 (2026-07-28)** — RPC 적용 완료, `AdminTeamEditorView.tsx`에 "트레이드" 탭
> 추가 완료. 실행 시 뎁스차트/로테이션 1회 자동 재설정까지 포함(§3.2를 "stale 정리"가 아니라
> `generateAutoTactics()` 전면 재생성으로 대체 — 더 간단하고 견고함). 상세 Before/After는
> `docs/history/dev-log.md` 2026-07-28 항목 참조.

> `AdminTeamEditorView.tsx`(어드민이 팀별 뎁스차트/로테이션/전술을 보는 화면)에 "트레이드" 탭을
> 추가해, 어드민이 두 팀 사이에 선수를 직접 맞교환할 수 있게 한다. CBA/샐러리 매칭 없는 단순
> 스왑(어드민 전용 관리 도구) — 유저 간 협상형 트레이드 시스템(로드맵 항목)과는 별개.

---

## 1. 결론: 기술적으로 구현 가능

`league_teams.roster`가 단순 playerId 배열(JSONB)이라 "두 팀의 roster 배열을 서로 바꿔치기"하는
동작 자체는 어렵지 않다. 다만 **원자성 보장(트랜잭션) RPC가 필요**하고, 트레이드 후 두 팀의
뎁스차트/전술에 남는 **낡은 선수 참조를 정리하는 로직이 추가로 필요**하다. 아래 3장에서 설계.

---

## 2. 조사 결과 요약

| 항목 | 확인 결과 |
|------|-----------|
| 로스터 데이터 | `league_teams.roster: jsonb`(playerId 문자열 배열). 선수 원본은 `meta_players`(공유 읽기전용) — 싱글플레이와 동일 원칙 |
| 계약/연봉 데이터 | **멀티에는 존재하지 않음** — `server/src/shared/dataMapper.ts`가 전 선수에게 `contract: { years:[5_000_000], type:'veteran' }` 하드코딩 placeholder만 부여. 즉 "샐러리 매칭 트레이드"는 애초에 불가능/무의미 → 요청하신 "단순 스왑"과 정확히 부합, 오히려 딱 맞는 범위 |
| 기존 트레이드 엔진 | 싱글플레이용 `services/tradeEngine/tradeExecutor.ts`(연봉매칭/NTC/Stepien rule)는 `saves` 기반이라 **멀티에 재사용 불가** — 완전 신규 구축 필요 |
| RLS | `league_teams_update_owner_or_admin` 정책이 **어드민에게 방 안의 모든 `league_teams` 행 UPDATE를 이미 허용**(클라이언트 직접 update 기술적으로 가능) |
| 원자성 | 두 팀 roster를 각각 별도 `update()`로 처리하면 중간 실패/동시성 시 선수 중복·소실 위험. 드래프트 픽(`submit_draft_pick_v2`)·팀 선점(`claim_team`)이 이미 `SECURITY DEFINER` RPC로 원자성을 보장하는 패턴 확립돼 있음 → 동일 패턴 재사용 |
| 뎁스차트/전술 | `room_members.tactics`(`starters`, `playerTactics` 등)·`.depth_chart`가 **유저별로 저장**되며 playerId를 참조 → 트레이드로 로스터가 바뀌면 두 팀 모두 낡은 참조가 남는다(정리 로직 필요) |
| 로스터 크기 제약 | 멀티엔 `MAX_ROSTER_SIZE` 같은 하한/상한이 전혀 없음(싱글 전용 상수) — 신규 정책 결정 필요 |
| 클라 데이터 리프레시 | `leagueTeams`는 Realtime 구독 대상이 아님(`leagues`/`room_members`만 구독) — 트레이드 후 `useLeagueContext().reload()`를 명시적으로 호출해야 화면에 반영됨 |

---

## 3. 설계

### 3.1 DB — 신규 RPC `execute_admin_trade` (SECURITY DEFINER)

`claim_team` RPC와 동일한 패턴(어드민 검증 → 사전조건 체크 → 원자적 UPDATE)으로 신설.

```sql
CREATE OR REPLACE FUNCTION public.execute_admin_trade(
    p_room_id        uuid,
    p_admin_user_id  uuid,
    p_team_a_id      uuid,   -- league_teams.id
    p_team_b_id      uuid,
    p_players_a_to_b jsonb,  -- string[] — A에서 나가 B로 가는 playerId들
    p_players_b_to_a jsonb   -- string[] — B에서 나가 A로 가는 playerId들
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_admin_id uuid;
    v_team_a   league_teams%ROWTYPE;
    v_team_b   league_teams%ROWTYPE;
    v_id       text;
BEGIN
    -- 어드민 검증 (RLS가 이미 막아주지만 RPC 레벨에서도 재검증 — defense in depth)
    SELECT l.admin_user_id INTO v_admin_id
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;
    IF v_admin_id IS NULL OR v_admin_id != p_admin_user_id THEN
        RAISE EXCEPTION 'not_admin';
    END IF;

    SELECT * INTO v_team_a FROM league_teams WHERE id = p_team_a_id AND room_id = p_room_id;
    SELECT * INTO v_team_b FROM league_teams WHERE id = p_team_b_id AND room_id = p_room_id;
    IF v_team_a IS NULL OR v_team_b IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    -- 선수가 실제로 해당 팀 로스터에 있는지 검증 (오프바이원/중복 트레이드 방지)
    FOR v_id IN SELECT jsonb_array_elements_text(p_players_a_to_b) LOOP
        IF NOT (v_team_a.roster ? v_id) THEN RAISE EXCEPTION 'player_not_on_team_a: %', v_id; END IF;
    END LOOP;
    FOR v_id IN SELECT jsonb_array_elements_text(p_players_b_to_a) LOOP
        IF NOT (v_team_b.roster ? v_id) THEN RAISE EXCEPTION 'player_not_on_team_b: %', v_id; END IF;
    END LOOP;

    -- 로스터 스왑 (제거 후 병합)
    UPDATE league_teams SET roster = (
        SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements_text(roster) e
        WHERE e NOT IN (SELECT jsonb_array_elements_text(p_players_a_to_b))
    ) || p_players_b_to_a WHERE id = p_team_a_id;

    UPDATE league_teams SET roster = (
        SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements_text(roster) e
        WHERE e NOT IN (SELECT jsonb_array_elements_text(p_players_b_to_a))
    ) || p_players_a_to_b WHERE id = p_team_b_id;

    RETURN jsonb_build_object('ok', true);
END;
$$;
```

(실제 배포 전 문법 검증/edge case 테스트 필요 — 위는 설계 스케치.)

### 3.2 뎁스차트/전술 stale 참조 정리 — RPC 밖, TS로 처리

jsonb 안의 5개 포지션×3뎁스 슬롯을 SQL에서 훑는 것보다 TS에서 기존 타입(`DepthChart`,
`GameTactics`)으로 처리하는 게 훨씬 간단하고 실수가 적다. RPC 성공 직후 클라이언트(또는 이 로직을
공용 함수로 뽑아 재사용):

1. 트레이드로 팀을 떠난 각 playerId에 대해, 그 팀 담당 `room_members` 행(`selectedMember` 상당)의
   `depth_chart`에서 해당 id가 있는 슬롯을 `null`로, `tactics.starters`에서 해당 포지션 값이면
   `''`로, `tactics.playerTactics`에서 해당 키를 삭제.
2. 양 팀 각각에 대해 수행 후 기존 `saveMemberTactics(roomId, userId, tactics, depthChart)` 재사용해 저장.
3. AI 팀(room_members가 있지만 실질적으로 매 경기 자동 전술 생성에 더 의존)도 동일 로직 적용 —
   실제로 저장된 `depth_chart`/`tactics`가 있다면 정리, 없으면 스킵.
4. 새로 영입된 선수는 자동으로 뎁스차트에 배치되지 않음(빈 자리로 남음) — 어드민이 트레이드 후
   해당 팀의 "뎁스 차트" 탭에서 직접 배치. (자동 배치까지는 이번 범위 밖으로 제안)

### 3.3 클라이언트 — `AdminTeamEditorView.tsx`에 탭 추가

- `AdminTab` 유니온에 `'trade'` 추가, `TabBar`에 "트레이드" 탭 추가.
- 신규 컴포넌트 `components/dashboard/AdminTradePanel.tsx`:
  - 팀 A = 현재 상단에서 선택된 `selectedSlug`(재사용). 팀 B = 새 드롭다운(팀 A 제외, `sortedTeams`에서 선택).
  - 두 팀의 로스터를 좌우로 나열(각 행에 기존 `OvrBadge` 재사용 — 뎁스차트에서 방금 만든 것과 동일 스타일), 클릭하면 "트레이드 카트"에 추가/제거 토글.
  - 하단에 "A → B: [선수명 목록]" / "B → A: [선수명 목록]" 요약 + "트레이드 실행" 버튼.
  - 실행 시 확인 모달(`DraftAdminPanel`의 `autocomplete` 확인 패턴 재사용) → RPC 호출 → 성공 시
    `useLeagueContext().reload()` + 3.2의 stale 정리 실행 + 토스트.
- `services/multi/leagueService.ts`에 `executeAdminTrade(params)` 함수 추가 — `supabase.rpc('execute_admin_trade', {...})` 래핑, 에러 시 `{ error }` 반환(기존 서비스 함수들과 동일 컨벤션).

### 3.4 팀 B 로스터 하이드레이션

현재 `AdminTeamEditorView`는 `selectedTeamRow`(팀 A) 하나만 `meta_players`에서 조회한다. 트레이드
탭에서는 팀 B 로스터도 동시에 보여줘야 하므로, 같은 패턴(`supabase.from('meta_players').select(...).in('id', teamB.roster)`)을 트레이드 탭 전용으로 별도 `useEffect`에 추가(팀 A 하이드레이션 로직 재사용/공용화 검토).

---

## 4. 구현 순서

1. Supabase 마이그레이션: `execute_admin_trade` RPC 생성(3.1) — `mcp__supabase__apply_migration`로 적용, 로컬 SQL 문법/edge case 검증
2. `services/multi/leagueService.ts`: `executeAdminTrade()` 함수 추가
3. `components/dashboard/AdminTradePanel.tsx` 신규 작성(3.3) — 팀 B 선택, 양측 로스터 리스트, 트레이드 카트, 실행 버튼
4. `AdminTeamEditorView.tsx`: `'trade'` 탭 연결, 팀 B 로스터 하이드레이션(3.4)
5. 트레이드 성공 후 처리: `reload()` 호출 + stale 참조 정리(3.2) — 공용 헬퍼 함수로 분리(`utils/` 또는 `services/multi/`)
6. 검증: 로컬/스테이징 방에서 실제 2팀 스왑 실행 → `league_teams.roster` 반영 확인, 뎁스차트/전술에서 트레이드된 선수가 정리됐는지 확인, 잘못된 playerId(다른 팀 소속) 트레이드 시도 시 RPC가 거부하는지 확인

---

## 5. 결정이 필요한 정책 (권장안 포함)

| 질문 | 권장안 |
|------|--------|
| 트레이드 가능 시점 제한? | `league.status === 'in_progress'`(드래프트 완료 후)에서만 허용 — 드래프트 전엔 로스터가 없거나 불완전해 의미 없음 |
| N:M(인원 불균형) 트레이드 허용? | 허용(요청하신 "선수 스왑"이 꼭 1:1이란 명시는 없었음). 단, 로스터가 너무 줄어드는 걸 막기 위해 트레이드 후 최소 인원(예: 8명) 미만이 되면 클라이언트에서 경고만(하드 블록은 안 함 — 멀티에 기존 하한 정책이 없어 신규 규칙이라 과하게 엄격히 만들지 않는 게 안전) |
| 트레이드 알림(인박스)? | 1차 범위에서는 생략(어드민 전용 관리 도구이므로). 필요시 `user_messages`에 `TRADE_ALERT` 타입으로 양 팀 유저에게 통지하는 걸 2차로 추가 |
| 트레이드 이력 기록? | 1차 범위에서는 생략. 필요하면 `trade_history`류 테이블 신설해 감사 로그 남기는 걸 후속 작업으로 제안 |

---

## 6. 리스크 / 한계

- RPC의 jsonb 배열 연산(`jsonb_array_elements_text`, `jsonb_agg` 기반 제거)은 실제 Postgres에서
  문법·성능 검증이 필요(위 SQL은 설계 스케치, 실제 적용 전 `apply_migration`으로 테스트 권장).
- AI 팀(`is_ai=true`) 간 또는 유저 팀↔AI 팀 트레이드도 이 설계로 동일하게 동작함(로스터가
  `league_teams.roster`로 통일돼 있어 AI/사람 구분이 필요 없음) — 별도 분기 불필요.
- 계약/연봉 데이터가 없으므로 "이 트레이드가 팀에 유리한지" 같은 가치 판단은 전혀 하지 않음(어드민의
  임의 재량에 100% 의존) — 이건 요청하신 범위와 일치하는 설계이지 누락이 아님.
- 뎁스차트/전술 정리(3.2)가 RPC 밖(별도 호출)이라 완전한 원자성은 아님 — 로스터 스왑은 성공했는데
  정리 단계에서 네트워크 오류가 나면 낡은 참조가 잠깐 남을 수 있음(다음 뎁스차트 저장 시 자연
  정정됨, 치명적이지 않음).
