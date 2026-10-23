-- [2026-10-23] Tactic set names (GameTactics.tacticSetNames — user-named 1번/2번 tactics) live inside
-- room_members.tactics / room_member_tactic_presets.data jsonb, so the preset-name CHECK did not cover them.
-- room_members.tactics also had no CHECK at all (no size cap) and is readable by every room member and spectator.
-- Rules mirror room_member_tactic_presets_name_check (client: services/multi/tacticPresets.ts normalizePresetName):
--   keys only 'main'/'alt', values strings, 1..12 code points, already trimmed, no control/format/bidi chars.
-- The forbidden-char regex is copied from the live preset-name constraint instead of being retyped
-- (tool input decodes \u escapes into raw characters — see memory feedback_unicode_escape_tool_decoding).

do $$
declare def text; re text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.room_member_tactic_presets'::regclass and conname = 'room_member_tactic_presets_name_check';
  re := (regexp_match(def, '!~ ''(.*)''::text'))[1];
  if re is null then raise exception 'forbidden-char regex not found in: %', def; end if;
  execute format($f$
    create or replace function public.tactic_set_names_valid(names jsonb) returns boolean
    language sql immutable set search_path = '' as $body$
      select names is null or jsonb_typeof(names) = 'null' or (
        jsonb_typeof(names) = 'object'
        and not exists (
          select 1 from jsonb_each(names) e
          where e.key not in ('main', 'alt')
             or jsonb_typeof(e.value) <> 'string'
             or char_length(e.value #>> '{}') not between 1 and 12
             or (e.value #>> '{}') <> btrim(e.value #>> '{}')
             or (e.value #>> '{}') ~ %L
        )
      )
    $body$ $f$, re);
end $$;

-- 64KB cap = same as room_member_tactic_presets_data_check (live max ≈ 7KB on 2026-10-23)
alter table public.room_members add constraint room_members_tactics_check check (
    tactics is null or (
        jsonb_typeof(tactics) = 'object'
        and octet_length(tactics::text) <= 65536
        and public.tactic_set_names_valid(tactics->'tacticSetNames')
    )
);

alter table public.room_member_tactic_presets add constraint room_member_tactic_presets_set_names_check check (
    public.tactic_set_names_valid(data->'tacticSetNames')
);

-- Rollback:
--   alter table public.room_members drop constraint room_members_tactics_check;
--   alter table public.room_member_tactic_presets drop constraint room_member_tactic_presets_set_names_check;
--   drop function public.tactic_set_names_valid(jsonb);
