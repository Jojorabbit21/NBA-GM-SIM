
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

export const useAuth = () => {
    const [session, setSession] = useState<any | null>(null);
    const [isGuestMode, setIsGuestMode] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const isLoggingOutRef = useRef(false);

    // --- Auth Listener ---
    useEffect(() => {
        let mounted = true;

        // 1. 인증 상태 변화 감지 (getSession보다 먼저 등록)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!mounted) return;

            if (event === 'SIGNED_IN' && session) {
                setSession((prev: any) => prev?.user?.id === session.user.id ? prev : session);
                setAuthLoading(false);
            } else if (event === 'SIGNED_OUT') {
                setSession(null);
                setAuthLoading(false);
            } else if (event === 'TOKEN_REFRESHED' && session) {
                setSession((prev: any) => prev?.user?.id === session.user.id ? prev : session);
            }
        });

        // 2. 초기 세션 확인 (안전하게 처리)
        const initSession = async () => {
            try {
                const { data, error } = await supabase.auth.getSession();
                if (error) {
                    console.error("Auth Session Error:", error.message);
                    // Force signOut if refresh token is invalid
                    if (error.message?.includes("Refresh Token") || (error as any).status === 400) {
                        await supabase.auth.signOut().catch(() => {});
                        if (mounted) setSession(null);
                    }
                } else if (mounted && data.session) {
                    setSession(data.session);
                }
            } catch (e) {
                // Supabase core.js 내부 에러 (payload undefined 등) 무시
                console.warn("Auth init warning:", e);
            } finally {
                if (mounted) setAuthLoading(false);
            }
        };

        initSession();

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const handleLogout = async (onPostLogout?: () => void) => {
        if (isLoggingOutRef.current) return;
        isLoggingOutRef.current = true;
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.error("Logout error:", e);
        } finally {
            setSession(null);
            setIsGuestMode(false);
            if (onPostLogout) onPostLogout();
            isLoggingOutRef.current = false;
        }
    };

    return {
        session,
        isGuestMode,
        setIsGuestMode,
        authLoading,
        handleLogout
    };
};
