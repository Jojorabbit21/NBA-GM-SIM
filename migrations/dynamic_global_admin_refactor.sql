-- 전역 어드민 판별을 하드코딩된 UUID 리터럴(d2f6a469-9182-4dac-a098-278e6e758c79) 비교에서
-- profiles.is_admin 컬럼(단일 출처, source of truth) 기반으로 전환.
--
-- 배경: 2026-09-28 세션에서 리그/토너먼트 어드민 전권 기능을 만들며 DB 곳곳(RLS 정책 25개,
-- RPC 2개)에 이 UUID 리터럴이 중복 하드코딩된 걸 발견 — 나중에 "다른 유저를 어드민으로
-- 지정" 기능을 추가하려면 매번 전체 재검색/수정이 필요해 유지보수가 어려움. is_global_admin()
-- 헬퍼 함수(이미 존재)의 본문만 이 컬럼을 보도록 바꾸고, 나머지 리터럴 정책은 전부
-- is_global_admin() 호출로 교체 — 이후 어드민 추가/해제는 profiles.is_admin 값 하나만
-- 바꾸면 코드/정책 수정 없이 전체에 반영됨.
--
-- 클라이언트/서버(Bun) 쪽의 ADMIN_USER_ID 리터럴은 별도 커밋에서 profiles.is_admin 조회로
-- 교체 — 이 마이그레이션은 DB(RLS + RPC) 쪽만 다룬다.

-- ── 1. 단일 출처 컬럼 ─────────────────────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

UPDATE public.profiles SET is_admin = true
WHERE id = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid AND is_admin = false;

-- ── 2. 자기 자신을 어드민으로 셀프 승격하는 것 방지 ──────────────────────────────
-- "Users can update own profile" 정책은 WITH CHECK이 없어 본인 행의 어떤 컬럼이든 자유롭게
-- 바꿀 수 있다 — is_admin 컬럼이 생긴 이상 이 트리거로 컬럼 단위 보호가 반드시 필요하다.
-- (이미 어드민인 세션이 이 UPDATE 경로로 자기 자신의 is_admin을 바꾸는 것도 의미가 없으므로
-- 막지 않고 그대로 통과시킨다 — 다른 유저를 어드민으로 지정하는 건 아래 set_global_admin()
-- RPC를 통해서만 가능하다, 이 정책의 USING(auth.uid()=id)이 애초에 자기 행만 허용하므로.)

CREATE OR REPLACE FUNCTION public.guard_profiles_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND NOT public.is_global_admin() THEN
        NEW.is_admin := OLD.is_admin;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_is_admin ON public.profiles;
CREATE TRIGGER trg_guard_profiles_is_admin
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_is_admin();

-- ── 3. "어드민을 동적으로 지정" RPC — 이번 리팩터링의 실제 목적 ─────────────────
-- 기존 어드민만 호출 가능(SECURITY DEFINER로 RLS 우회 — 대상이 본인이 아닌 남의 행이어도
-- profiles 테이블의 "본인 행만" UPDATE 정책과 무관하게 동작해야 하므로).

CREATE OR REPLACE FUNCTION public.set_global_admin(p_target_user_id uuid, p_is_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_global_admin() THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    UPDATE profiles SET is_admin = p_is_admin WHERE id = p_target_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_global_admin(uuid, boolean) TO authenticated;

-- ── 4. is_global_admin() 본문 교체 — 이제부터 이 함수 하나가 유일한 판별 지점 ─────

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), false)
$$;

-- ── 5. 리터럴을 직접 비교하던 기존 RLS 정책 25개를 전부 is_global_admin() 호출로 교체 ──

ALTER POLICY archetypes_write_admin ON public.archetypes
    USING (public.is_global_admin()) WITH CHECK (public.is_global_admin());

ALTER POLICY l_admin_write ON public.leagues
    USING (admin_user_id = auth.uid())
    WITH CHECK (admin_user_id = auth.uid() AND (type <> 'tournament' OR public.is_global_admin()));

ALTER POLICY l_global_admin_manage ON public.leagues
    USING (public.is_global_admin()) WITH CHECK (public.is_global_admin());

ALTER POLICY admin_delete_meta_card_editions ON public.meta_card_editions
    USING (public.is_global_admin());
ALTER POLICY admin_insert_meta_card_editions ON public.meta_card_editions
    WITH CHECK (public.is_global_admin());
ALTER POLICY admin_update_meta_card_editions ON public.meta_card_editions
    USING (public.is_global_admin()) WITH CHECK (public.is_global_admin());

ALTER POLICY admin_delete_meta_card_team_colors ON public.meta_card_team_colors
    USING (public.is_global_admin());
ALTER POLICY admin_insert_meta_card_team_colors ON public.meta_card_team_colors
    WITH CHECK (public.is_global_admin());
ALTER POLICY admin_update_meta_card_team_colors ON public.meta_card_team_colors
    USING (public.is_global_admin()) WITH CHECK (public.is_global_admin());

ALTER POLICY admin_delete_card_collection_members ON public.meta_player_card_collection_members
    USING (public.is_global_admin());
ALTER POLICY admin_insert_card_collection_members ON public.meta_player_card_collection_members
    WITH CHECK (public.is_global_admin());

ALTER POLICY admin_delete_card_collections ON public.meta_player_card_collections
    USING (public.is_global_admin());
ALTER POLICY admin_insert_card_collections ON public.meta_player_card_collections
    WITH CHECK (public.is_global_admin());
ALTER POLICY admin_update_card_collections ON public.meta_player_card_collections
    USING (public.is_global_admin()) WITH CHECK (public.is_global_admin());

ALTER POLICY admin_delete_meta_player_cards ON public.meta_player_cards
    USING (public.is_global_admin());
ALTER POLICY admin_insert_meta_player_cards ON public.meta_player_cards
    WITH CHECK (public.is_global_admin());
ALTER POLICY admin_update_meta_player_cards ON public.meta_player_cards
    USING (public.is_global_admin()) WITH CHECK (public.is_global_admin());

ALTER POLICY admin_delete_meta_players ON public.meta_players
    USING (public.is_global_admin());
ALTER POLICY admin_insert_meta_players ON public.meta_players
    WITH CHECK (public.is_global_admin());
ALTER POLICY admin_update_meta_players ON public.meta_players
    USING (public.is_global_admin()) WITH CHECK (public.is_global_admin());

ALTER POLICY admin_insert_edit_log ON public.player_edit_log
    WITH CHECK (public.is_global_admin());
ALTER POLICY admin_select_edit_log ON public.player_edit_log
    USING (public.is_global_admin());

ALTER POLICY card_backgrounds_admin_delete ON storage.objects
    USING (bucket_id = 'card-backgrounds' AND public.is_global_admin());
ALTER POLICY card_backgrounds_admin_insert ON storage.objects
    WITH CHECK (bucket_id = 'card-backgrounds' AND public.is_global_admin());
ALTER POLICY card_backgrounds_admin_update ON storage.objects
    USING (bucket_id = 'card-backgrounds' AND public.is_global_admin())
    WITH CHECK (bucket_id = 'card-backgrounds' AND public.is_global_admin());
