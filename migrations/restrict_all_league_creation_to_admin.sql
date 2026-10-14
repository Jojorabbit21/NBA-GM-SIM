-- All league creation (main_league + tournament) is restricted to global admins.
-- Before: l_admin_write (FOR ALL) let any user INSERT a main_league with admin_user_id = self.
-- After: INSERT is only possible via l_global_admin_manage (is_global_admin()). Existing owners
-- keep UPDATE/DELETE on leagues they already own (tournament type still admin-only).

DROP POLICY IF EXISTS l_admin_write ON public.leagues;

CREATE POLICY l_owner_update ON public.leagues
    FOR UPDATE
    USING (admin_user_id = auth.uid())
    WITH CHECK (
        admin_user_id = auth.uid()
        AND (type <> 'tournament' OR is_global_admin())
    );

CREATE POLICY l_owner_delete ON public.leagues
    FOR DELETE
    USING (admin_user_id = auth.uid());
