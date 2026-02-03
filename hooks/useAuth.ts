
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { getDeviceId } from '../utils/device';

export const useAuth = () => {
    const [session, setSession] = useState<any | null>(null);
    const [isGuestMode, setIsGuestMode] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const isLoggingOutRef = useRef(false);

    // --- Auth Listener ---
    useEffect(() => {
        // 1. 초기 세션 확인
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setSession(session);
                // 세션이 유효하다면, 현재 기기가 '주인'임을 DB에 알림 (재접속 시 갱신)
                updateDeviceLock(session.user.id);
            }
            setAuthLoading(false);
        });

        // 2. 인증 상태 변화 감지
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                setSession(session);
                await updateDeviceLock(session.user.id);
            } else if (event === 'SIGNED_OUT') {
                setSession(null);
            }
            
            // TOKEN_REFRESHED 이벤트 등에서 에러가 발생하면(서버가 토큰을 삭제했으면) 자동 로그아웃됨
        });

        return () => subscription.unsubscribe();
    }, []);

    // DB에 "지금 접속한 기기는 이 녀석(DeviceId)이다"라고 기록
    const updateDeviceLock = async (userId: string) => {
        if (isGuestMode) return;
        const deviceId = getDeviceId();
        await supabase.from('profiles').update({ active_device_id: deviceId }).eq('id', userId);
    };

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
