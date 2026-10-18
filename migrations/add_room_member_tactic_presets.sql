-- [2026-10-18] Multiplayer tactic presets — per-user named slots (3 each) for
-- depth chart/rotation ('depth') and team tactic sliders ('team').
-- Separate table (not a room_members column) because room_members SELECT is open to
-- every member of the room (rm_select) — presets are private scouting-sensitive data,
-- and keeping them out of room_members avoids bloating every members fetch.
-- The simulation server never reads this table; applying a preset only loads it into the
-- client editor, and the user's existing "save" writes room_members.tactics/depth_chart.

create table if not exists public.room_member_tactic_presets (
    room_id    uuid        not null references public.rooms(id) on delete cascade,
    user_id    uuid        not null references auth.users(id)   on delete cascade,
    kind       text        not null check (kind in ('depth', 'team')),
    slot       smallint    not null check (slot between 1 and 3),
    name       text        not null check (char_length(btrim(name)) between 1 and 20),
    data       jsonb       not null,
    updated_at timestamptz not null default now(),
    primary key (room_id, user_id, kind, slot)
);

alter table public.room_member_tactic_presets enable row level security;

-- Own rows only. Writes additionally require current membership in the room.
create policy rmtp_select_own on public.room_member_tactic_presets
    for select using (user_id = (select auth.uid()));

create policy rmtp_insert_own on public.room_member_tactic_presets
    for insert with check (
        user_id = (select auth.uid())
        and exists (select 1 from public.room_members m
                    where m.room_id = room_member_tactic_presets.room_id and m.user_id = (select auth.uid()))
    );

create policy rmtp_update_own on public.room_member_tactic_presets
    for update using (user_id = (select auth.uid()))
    with check (
        user_id = (select auth.uid())
        and exists (select 1 from public.room_members m
                    where m.room_id = room_member_tactic_presets.room_id and m.user_id = (select auth.uid()))
    );

create policy rmtp_delete_own on public.room_member_tactic_presets
    for delete using (user_id = (select auth.uid()));

-- [2026-10-18 v2] Active depth preset slot — the top "save" button on the multi tactics screen
-- also overwrites this slot's 'depth' preset. Saved together with tactics/depth_chart so it
-- survives reloads/devices (null = never chosen → client treats as slot 1).
alter table public.room_members
    add column if not exists depth_preset_slot smallint check (depth_preset_slot between 1 and 3);

-- [2026-10-18 v4] Active team-tactics preset slot (same semantics as depth_preset_slot).
alter table public.room_members
    add column if not exists team_preset_slot smallint check (team_preset_slot between 1 and 3);

-- [2026-10-18 v5] Harden name/data constraints (found via rollback tests):
--  - old check measured char_length(btrim(name)) but stored the raw value → 'a' + 1MB of spaces passed
--  - zero-width-only names, newlines, bidi overrides (U+202E) passed
--  - data jsonb had no size cap (5MB accepted)
-- The client normalizes names the same way (services/multi/tacticPresets.ts normalizePresetName):
-- unicode spaces → ' ', control/format chars removed, trimmed, max 20 code points.
alter table public.room_member_tactic_presets drop constraint room_member_tactic_presets_name_check;
alter table public.room_member_tactic_presets add constraint room_member_tactic_presets_name_check check (
    char_length(name) between 1 and 20
    and name = btrim(name)
    and name !~ '[\x01-\x1F\x7F-\x9F\u00A0\u00AD\u2000-\u200F\u2028-\u202E\u2060-\u2064\u3000\uFEFF]'
);
alter table public.room_member_tactic_presets add constraint room_member_tactic_presets_data_check check (
    jsonb_typeof(data) = 'object' and octet_length(data::text) <= 65536
);

-- [2026-10-18 v6] Name max length 20 → 12 (user decision). Newlines (LF/CR/NEL/U+2028/2029) were already
-- rejected by the forbidden-char regex. Applied by rewriting the live constraint definition in place
-- (replace '<= 20' → '<= 12') so the regex is not retyped. Equivalent to:
--   char_length(name) between 1 and 12 and name = btrim(name) and name !~ '[...same set as v5...]'
do $$
declare def text; newdef text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.room_member_tactic_presets'::regclass and conname = 'room_member_tactic_presets_name_check';
  newdef := replace(def, '<= 20', '<= 12');
  if newdef = def then raise exception 'length bound not found in: %', def; end if;
  execute 'alter table public.room_member_tactic_presets drop constraint room_member_tactic_presets_name_check';
  execute 'alter table public.room_member_tactic_presets add constraint room_member_tactic_presets_name_check ' || newdef;
end $$;
