-- Global key/value settings (read: everyone, write: global admin only).
-- First key: 'court_default_colors' = {"background","paint","line"}.
create table if not exists public.app_settings (
    key        text primary key,
    value      jsonb not null,
    updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select using (true);
drop policy if exists app_settings_admin_insert on public.app_settings;
create policy app_settings_admin_insert on public.app_settings for insert with check (is_global_admin());
drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update on public.app_settings for update using (is_global_admin()) with check (is_global_admin());

insert into public.app_settings (key, value)
values ('court_default_colors', '{"background":"#DDC8AD","paint":"#C3AC91","line":"#4A3728"}'::jsonb)
on conflict (key) do nothing;

-- Teams still holding the old hardcoded default are "unmodified" -> NULL = follow global default.
update public.league_teams
set court_background = null, court_paint = null, court_line = null
where upper(court_background) = '#DDC8AD' and upper(court_paint) = '#C3AC91' and upper(court_line) = '#4A3728';
