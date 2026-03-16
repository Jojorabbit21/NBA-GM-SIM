
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

        // 1. 초기 세션 확인 (타임아웃 포함 — 토큰 갱신 hang 방지)
        const initSession = async () => {
            try {
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Auth timeout')), 5000)
                );

                const { data, error } = await Promise.race([sessionPromise, timeoutPromise]);
                if (error) {
                    console.error("Auth Session Error:", error.message);
                    if (error.message?.includes("Refresh Token") || (error as any).status === 400) {
                        await supabase.auth.signOut().catch(() => {});
                        if (mounted) setSession(null);
                    }
                } else if (mounted && data.session) {
                    setSession(data.session);
                }
            } catch (e: any) {
                console.warn("Auth init warning:", e?.message || e);
                // 타임아웃 또는 내부 에러 → 만료된 세션 정리 후 로그인 화면으로
                try {
                    // localStorage에 남은 만료 토큰 제거
                    Object.keys(localStorage)
                        .filter(k => k.startsWith('sb-'))
                        .forEach(k => localStorage.removeItem(k));
                    await supabase.auth.signOut().catch(() => {});
                } catch { /* ignore */ }
                if (mounted) setSession(null);
            } finally {
                if (mounted) setAuthLoading(false);
            }
        };

        initSession();

        // 2. 인증 상태 변화 감지
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!mounted) return;

            if (event === 'SIGNED_IN' && session) {
                setSession((prev: any) => prev?.user?.id === session.user.id ? prev : session);
            } else if (event === 'SIGNED_OUT') {
                setSession(null);
            } else if (event === 'TOKEN_REFRESHED' && session) {
                // 토큰 갱신은 같은 유저 → 객체 참조만 바뀜 → 기존 참조 유지
                setSession((prev: any) => prev?.user?.id === session.user.id ? prev : session);
            }
        });

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
