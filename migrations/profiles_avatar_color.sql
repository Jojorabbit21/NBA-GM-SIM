-- profiles_avatar_color.sql — 프로필 아이콘 배경색 (2026-11-05)
--
-- 사이드바·로비 프로필 아이콘(닉네임 첫 글자)의 배경색. 값은 utils/avatarColors.ts의 팔레트 키(예: 'indigo'),
-- NULL이면 클라이언트 기본색. 로비 닉네임 설정 모달에서 닉네임과 함께 저장한다.
-- set_my_nickname에 p_avatar_color(기본 NULL = 기존 값 유지)를 추가 — 이전 클라이언트의 2인자 호출도 그대로 동작.

alter table public.profiles add column if not exists avatar_color text;

drop function if exists public.set_my_nickname(text, text);

create or replace function public.set_my_nickname(p_nickname text, p_email text default null, p_avatar_color text default null)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
    v_uid   uuid := auth.uid();
    v_nick  text := btrim(coalesce(p_nickname, ''));
    v_color text := nullif(btrim(coalesce(p_avatar_color, '')), '');
begin
    if v_uid is null then
        raise exception 'not_authenticated';
    end if;
    if char_length(v_nick) < 1 or char_length(v_nick) > 8 then
        raise exception 'invalid_nickname';
    end if;
    if v_color is not null and v_color !~ '^[a-z]{1,16}$' then
        raise exception 'invalid_avatar_color';
    end if;

    insert into public.profiles (id, email, nickname, avatar_color)
    values (v_uid, p_email, v_nick, v_color)
    on conflict (id) do update
        set nickname     = excluded.nickname,
            email        = coalesce(excluded.email, public.profiles.email),
            avatar_color = coalesce(excluded.avatar_color, public.profiles.avatar_color),
            updated_at   = now();

    -- league_teams.nickname은 profiles의 비정규화 복사본 — 참가 중인 모든 리그의 내 팀 행에 반영
    update public.league_teams set nickname = v_nick where user_id = v_uid;
end;
$function$;

grant execute on function public.set_my_nickname(text, text, text) to anon, authenticated, service_role;
