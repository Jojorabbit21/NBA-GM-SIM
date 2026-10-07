-- Court center logo is ON by default (2026-10-02). Nobody had toggled it yet, so existing rows are switched on too.
alter table public.league_teams alter column court_show_logo set default true;
update public.league_teams set court_show_logo = true where court_show_logo = false;
