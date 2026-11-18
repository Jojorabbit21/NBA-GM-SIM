-- profiles_avatar_text.sql — 아바타에 들어가는 글자 직접 입력 + 가상 팀 로고 선택 (2026-11-18)
--
-- profiles.avatar_text: 1~2자. NULL이면 예전처럼 닉네임 첫 글자를 쓴다.
-- profiles.avatar_logo: public/logos/avatars/{키}.svg 의 키(대문자 2~4자, 예: 'GS'). 있으면 글자 대신 로고를 보여 준다.
-- 저장은 새 RPC set_my_avatar(p_color, p_text, p_logo) — 색·글자·로고를 함께 바꾼다(본인 행만).
-- set_my_nickname은 건드리지 않았다(인자를 늘리면 배포된 클라이언트의 3인자 호출이 오버로드 충돌).
-- 운영 적용 완료(2026-11-18).
--
-- 롤백:
--   drop function if exists public.set_my_avatar(text, text, text);
--   alter table public.profiles drop column if exists avatar_text, drop column if exists avatar_logo;

alter table public.profiles add column if not exists avatar_text text;
alter table public.profiles drop constraint if exists profiles_avatar_text_len;
alter table public.profiles add constraint profiles_avatar_text_len check (avatar_text is null or char_length(avatar_text) between 1 and 2);

alter table public.profiles add column if not exists avatar_logo text;
alter table public.profiles drop constraint if exists profiles_avatar_logo_fmt;
alter table public.profiles add constraint profiles_avatar_logo_fmt check (avatar_logo is null or avatar_logo ~ '^[A-Z]{2,4}$');

drop function if exists public.set_my_avatar(text, text);

create or replace function public.set_my_avatar(p_color text, p_text text default null, p_logo text default null)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
    v_uid   uuid := auth.uid();
    v_color text := nullif(btrim(coalesce(p_color, '')), '');
    v_text  text := nullif(btrim(coalesce(p_text, '')), '');
    v_logo  text := nullif(btrim(coalesce(p_logo, '')), '');
begin
    if v_uid is null then
        raise exception 'not_authenticated';
    end if;
    if v_color is null or v_color !~ '^[a-z]{1,16}$' then
        raise exception 'invalid_avatar_color';
    end if;
    if v_text is not null and char_length(v_text) > 2 then
        raise exception 'invalid_avatar_text';
    end if;
    if v_logo is not null and v_logo !~ '^[A-Z]{2,4}$' then
        raise exception 'invalid_avatar_logo';
    end if;

    update public.profiles
       set avatar_color = v_color,
           avatar_text  = v_text,
           avatar_logo  = v_logo,
           updated_at   = now()
     where id = v_uid;
    if not found then
        raise exception 'profile_not_found';
    end if;
end;
$function$;

revoke all on function public.set_my_avatar(text, text, text) from public, anon;
grant execute on function public.set_my_avatar(text, text, text) to authenticated;
notify pgrst, 'reload schema';
