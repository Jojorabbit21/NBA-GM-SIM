-- league_teams.court_logo_scale: center-court logo size in percent (100 = 110px in the 940x500 court).
-- update_team_profile gets an optional 13th arg (NULL = keep current value).
alter table public.league_teams add column if not exists court_logo_scale smallint not null default 100;
alter table public.league_teams drop constraint if exists league_teams_court_logo_scale_check;
alter table public.league_teams add constraint league_teams_court_logo_scale_check check (court_logo_scale between 50 and 200);

drop function if exists public.update_team_profile(uuid, uuid, text, text, text, text, text, text, text, text, text, boolean);

create or replace function public.update_team_profile(
    p_team_id uuid, p_user_id uuid, p_team_name text, p_team_abbr text,
    p_color_primary text, p_color_secondary text, p_color_tertiary text, p_color_text text,
    p_court_background text, p_court_paint text, p_court_line text,
    p_court_show_logo boolean default null,
    p_court_logo_scale integer default null
)
returns jsonb
language plpgsql
security definer
as $function$
declare
    v_team   league_teams%rowtype;
    v_status text;
    v_owned  boolean;
begin
    select exists(
        select 1 from league_teams where id = p_team_id and user_id = p_user_id
    ) into v_owned;

    if not v_owned then
        raise exception 'team not found or not owned by user';
    end if;

    select l.status into v_status
    from league_teams lt
    join rooms r on r.id = lt.room_id
    join leagues l on l.id = r.league_id
    where lt.id = p_team_id;

    if v_status = 'drafting' then
        raise exception 'cannot_edit_during_draft';
    end if;

    update league_teams
    set team_name        = p_team_name,
        team_abbr        = p_team_abbr,
        color_primary    = p_color_primary,
        color_secondary  = p_color_secondary,
        color_tertiary   = p_color_tertiary,
        color_text       = p_color_text,
        court_background = p_court_background,
        court_paint      = p_court_paint,
        court_line       = p_court_line,
        court_show_logo  = coalesce(p_court_show_logo, court_show_logo),
        court_logo_scale = least(200, greatest(50, coalesce(p_court_logo_scale, court_logo_scale)))
    where id = p_team_id
    returning * into v_team;

    return row_to_json(v_team)::jsonb;
end;
$function$;
