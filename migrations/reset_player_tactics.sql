-- [2026-10-17] Reset per-player tactics (playerTactics) everywhere it is persisted as "current state".
-- Reason: garbagePolicy='bench' players flicker in/out every possession in Q4 garbage time
--   (see docs/history/dev-log.md 2026-10-17). Feature is disabled in UI + ignored by the engine until fixed.
-- Not touched: room_game_results / user_game_results / user_playoffs_results (historical records).
-- Rollback: per-row playerTactics values were backed up before running (6 rows: room_members x3, saves x3);
--   restore with  UPDATE ... SET tactics = jsonb_set(tactics, '{playerTactics}', '<json>'::jsonb)  for each row.

UPDATE room_members
   SET tactics = tactics - 'playerTactics'
 WHERE tactics ? 'playerTactics';

UPDATE saves
   SET tactics = tactics - 'playerTactics'
 WHERE tactics ? 'playerTactics';

UPDATE user_tactics
   SET tactics_data = tactics_data - 'playerTactics'
 WHERE tactics_data ? 'playerTactics';
