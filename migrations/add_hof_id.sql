-- 1. saves 테이블에 hof_id 추가 (기존 row에도 자동 UUID 생성)
ALTER TABLE saves ADD COLUMN IF NOT EXISTS hof_id UUID DEFAULT gen_random_uuid();

-- 2. hall_of_fame 테이블에 hof_id 추가
ALTER TABLE hall_of_fame ADD COLUMN IF NOT EXISTS hof_id UUID;

-- 3. 기존 unique constraint 제거 (user_id, team_id, season)
-- 제약조건 이름이 다를 수 있으므로, 아래 쿼리로 확인 후 제거:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'hall_of_fame'::regclass AND contype = 'u';
ALTER TABLE hall_of_fame DROP CONSTRAINT IF EXISTS hall_of_fame_user_id_team_id_season_key;

-- 4. hof_id에 unique constraint 추가
ALTER TABLE hall_of_fame ADD CONSTRAINT hall_of_fame_hof_id_key UNIQUE (hof_id);
