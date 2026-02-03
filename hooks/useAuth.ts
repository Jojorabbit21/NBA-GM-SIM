
import { useState, useEffect, useRef } from 'react';
import { supabase, supabaseUrl, supabaseKey } from '../services/supabaseClient';
import { releaseSessionLock } from '../services/persistence'; // New import

export const useAuth = () => {
    const [session, setSession] = useState<any | null>(null);
    const [isGuestMode, setIsGuestMode] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const isLoggingOutRef = useRef(false);

    // --- Auth Logging Logic ---
    const insertAuthLog = async (userId: string, type: 'login' | 'logout') => {
        if (!userId) return;
        try {
            await supabase.from('login_logs').insert({
                user_id: userId,
                type: type,
                user_agent: navigator.userAgent,
                timestamp: new Date().toISOString()
            });
        } catch (e) {
            console.warn(`Failed to log ${type}:`, e);
        }
    };

    // Browser Close/Tab Close Detection (Best Effort)
    useEffect(() => {
        const handleUnload = () => {
            if (session?.user?.id && supabaseUrl && supabaseKey) {
                // Log logout
                const logUrl = `${supabaseUrl}/rest/v1/login_logs`;
                const headers = {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${session.access_token}`,
                    'Prefer': 'return=minimal'
                };
                
                const logBody = JSON.stringify({ 
                    user_id: session.user.id,
                    type: 'logout',
                    user_agent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                });
                
                fetch(logUrl, { method: 'POST', headers, body: logBody, keepalive: true }).catch(() => {});
            }
        };

        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [session]);

    // Auth Listener
    useEffect(() => {
        (supabase.auth as any).getSession().then(({ data: { session } }: any) => {
            if (session && !isLoggingOutRef.current) {
                setSession(session);
            } else if (!session) {
                setSession(null);
            }
            setAuthLoading(false);
        });

        const { data: { subscription } } = (supabase.auth as any).onAuthStateChange((event: string, session: any) => {
            if (isLoggingOutRef.current) return;
            
            if (event === 'SIGNED_IN' && session) {
                setSession(session);
            } else if (event === 'SIGNED_OUT') {
                setSession(null); 
            } else if (session) {
                setSession(session);
            }
            setAuthLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async (onPostLogout: () => void) => {
        if (isLoggingOutRef.current) return;
        isLoggingOutRef.current = true;
        
        try {
            if (session?.user) {
               await insertAuthLog(session.user.id, 'logout');
               
               // [Lock Release] Clear active_device_id on explicit logout
               await releaseSessionLock(session.user.id);
               
               await (supabase.auth as any).signOut();
            }
        } catch (e) {
            console.error("Logout process error:", e);
        } finally {
            setIsGuestMode(false);
            setSession(null);
            onPostLogout();
            setTimeout(() => { isLoggingOutRef.current = false; }, 500);
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
