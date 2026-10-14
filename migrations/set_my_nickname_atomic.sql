-- [2026-10-13] 닉네임 저장 원자화 — profiles upsert + 참가 중인 모든 league_teams.nickname 동기화를 한 트랜잭션에서.
-- 예전엔 클라이언트(views/lobby/NicknameModal.tsx)가 두 번 쓰고 두 번째(league_teams) 실패를 무시해
-- "프로필만 바뀌고 팀 목록 GM 이름은 옛 닉네임"이 가능했다(docs/plan/ui-inline-notice.md 6장 ⑩).
-- SECURITY INVOKER + auth.uid() — 본인 행만, 기존 RLS 그대로. 적용: apply_migration(2026-10-13).
create or replace function public.set_my_nickname(
    p_nickname text,
    p_email    text default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_uid  uuid := auth.uid();
    v_nick text := btrim(coalesce(p_nickname, ''));
begin
    if v_uid is null then
        raise exception 'not_authenticated';
    end if;
    if char_length(v_nick) < 1 or char_length(v_nick) > 8 then
        raise exception 'invalid_nickname';
    end if;

    insert into public.profiles (id, email, nickname)
    values (v_uid, p_email, v_nick)
    on conflict (id) do update
        set nickname   = excluded.nickname,
            email      = coalesce(excluded.email, public.profiles.email),
            updated_at = now();

    -- league_teams.nickname은 profiles의 비정규화 복사본 — 참가 중인 모든 리그의 내 팀 행에 반영
    update public.league_teams set nickname = v_nick where user_id = v_uid;
end;
$$;

grant execute on function public.set_my_nickname(text, text) to authenticated;
