
import React, { useState, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { LogIn, UserPlus, Loader2, AlertCircle, ShieldAlert } from 'lucide-react';
import { AuthInput } from '../components/auth/AuthInput';

// Validation Regex Patterns
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{6,12}$/;

interface AuthViewProps {
  onGuestLogin: () => void;
}

// Internal Component for Alerts - Applied Pretendard Medium
const AuthAlert: React.FC<{ type: 'error' | 'success'; children: React.ReactNode }> = ({ type, children }) => (
  <div className={`p-4 rounded-xl flex items-start gap-3 text-sm pretendard font-medium animate-in zoom-in-95 duration-200 mb-6 ${
    type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
  }`}>
    <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
    <div className="flex-1 overflow-hidden">{children}</div>
  </div>
);

export const AuthView: React.FC<AuthViewProps> = ({ onGuestLogin }) => {
  const [loading, setLoading] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false); // 배경 이미지 로딩 상태
  const [email, setEmail] = useState(''); 
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); 
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string | React.ReactNode } | null>(null);
  
  // Validation State
  const isEmailValid = useMemo(() => email === '' || EMAIL_REGEX.test(email), [email]);
  const isPasswordValid = useMemo(() => password === '' || PASSWORD_REGEX.test(password), [password]);
  const isConfirmValid = useMemo(() => confirmPassword === '' || password === confirmPassword, [password, confirmPassword]);

  const isSignupFormValid = useMemo(() => {
    return (
      email !== '' && EMAIL_REGEX.test(email) &&
      password !== '' && PASSWORD_REGEX.test(password) &&
      confirmPassword !== '' && password === confirmPassword
    );
  }, [email, password, confirmPassword]);

  const ensureProfileExists = async (user: any) => {
    try {
        const { data: profile, error: selectError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();

        // 403 Forbidden 등 조회 실패 시 중단 (DB 정책 문제 가능성)
        if (selectError) return;

        if (!profile) {
            const nicknameFromEmail = user.email ? user.email.split('@')[0] : 'GM';
            const { error: insertError } = await supabase.from('profiles').insert({
                id: user.id,
                email: user.email,
                nickname: nicknameFromEmail,
                created_at: new Date().toISOString()
            });
            
            // Insert 실패 시 (보통 RLS 위반 또는 트리거 중복) 무시하고 진행
            if (insertError) {
                 console.warn("Profile creation skipped (likely handled by DB trigger or RLS restricted).");
            }
        }
    } catch (e) {
        console.warn("Profile check bypassed.");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
        setMessage({ type: 'error', text: 'Supabase 연결 설정이 되어있지 않습니다. 관리자 모드를 이용하세요.' });
        return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signup') {
        if (!isSignupFormValid) throw new Error("입력 정보를 다시 확인해주세요.");

        const { data, error } = await (supabase.auth as any).signUp({
          email,
          password
        });

        if (error) throw error;
        if (data.user) await ensureProfileExists(data.user);

        setMessage({ type: 'success', text: '회원가입 성공! 이제 로그인할 수 있습니다.' });
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      } else {
        const { data, error } = await (supabase.auth as any).signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        // [Log Update] 로그인 성공 시 명시적으로 로그 기록
        if (data.user) {
            try {
                await supabase.from('login_logs').insert({
                    user_id: data.user.id,
                    type: 'login',
                    user_agent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                });
            } catch (logError) {
                console.warn("Login logging failed", logError);
            }
        }

        // 로그인 시에는 프로필 생성을 강제하지 않음 (RLS 403 에러 방지)
        // if (data.user) await ensureProfileExists(data.user);
      }
    } catch (error: any) {
      let errorMsg = error.message || '인증 중 오류가 발생했습니다.';
      if (errorMsg.includes("Invalid login credentials")) {
          errorMsg = "이메일 또는 비밀번호가 올바르지 않습니다.";
      }
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans text-slate-200">
      
      {/* Background Ambience & Image */}
      {/* bgLoaded가 true일 때만 opacity가 1이 되어 서서히 나타남 */}
      <div className={`absolute inset-0 w-full h-full pointer-events-none overflow-hidden transition-opacity duration-1000 ease-in-out ${bgLoaded ? 'opacity-100' : 'opacity-0'}`}>
        {/* Main Background Image - Applied Blur & Scale to hide edges */}
        <img 
            src="https://buummihpewiaeltywdff.supabase.co/storage/v1/object/public/images/background3.png" 
            alt="Background" 
            className="w-full h-full object-cover opacity-30 blur-sm scale-110 transform-gpu"
            onLoad={() => setBgLoaded(true)}
        />
        
        {/* Gradient Overlay to blend with slate-950 */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/50 to-slate-950/80"></div>

        {/* Decorative Orbs */}
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-3xl opacity-30 mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl opacity-30 mix-blend-screen"></div>
      </div>

      {/* Auth Modal Container */}
      {/* 배경과 동일하게 bgLoaded 상태에 따라 페이드인 처리 */}
      <div className={`w-full max-w-md bg-slate-900/80 border border-slate-800 backdrop-blur-md rounded-3xl p-8 shadow-2xl relative z-10 transition-all duration-1000 ease-in-out transform ${bgLoaded ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}`}>
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-white leading-tight oswald tracking-tighter uppercase italic">
            Courtside GM
          </h1>
        </div>

        <form onSubmit={handleAuth} className="space-y-0">
          <AuthInput 
            label="이메일"
            type="email"
            placeholder="이메일 주소"
            value={email}
            onChange={setEmail}
            isValid={isEmailValid}
            errorMsg="올바른 이메일 형식이 아닙니다."
            showError={email !== ''}
          />

          <AuthInput 
            label="비밀번호"
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={setPassword}
            isValid={mode === 'login' ? true : isPasswordValid}
            errorMsg="6~12자, 대문자, 숫자, 특수문자 포함 필수"
            showError={mode === 'signup' && password !== ''}
          />

          {mode === 'signup' && (
            <AuthInput 
              label="비밀번호 확인"
              type="password"
              placeholder="비밀번호 확인"
              value={confirmPassword}
              onChange={setConfirmPassword}
              isValid={isConfirmValid}
              errorMsg="비밀번호가 일치하지 않습니다."
              showError={confirmPassword !== ''}
            />
          )}

          {message && (
            <AuthAlert type={message.type}>
              {message.text}
            </AuthAlert>
          )}

          <div className="space-y-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black py-4 rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                mode === 'login' ? (
                  <><LogIn size={20} /> <span className="pretendard font-medium">로그인</span></>
                ) : (
                  <><UserPlus size={20} /> <span className="pretendard font-medium">회원가입</span></>
                )
              )}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center border-t border-slate-800 pt-6">
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(null); }}
            className="text-slate-500 hover:text-indigo-400 pretendard font-medium text-sm transition-all"
          >
            {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
        </div>
      </div>
    </div>
  );
};
