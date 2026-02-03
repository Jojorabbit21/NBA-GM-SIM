
import React, { useState, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { LogIn, UserPlus, Loader2, AlertCircle } from 'lucide-react';
import { AuthInput } from '../components/auth/AuthInput';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{6,12}$/;

interface AuthViewProps {
  onGuestLogin: () => void;
}

const AuthAlert: React.FC<{ type: 'error' | 'success'; children: React.ReactNode }> = ({ type, children }) => {
    let style = "";
    let icon = <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />;
    
    if (type === 'error') {
        style = 'bg-red-500/10 text-red-400 border-red-500/20';
    } else if (type === 'success') {
        style = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }

    return (
      <div className={`p-4 rounded-xl flex items-start gap-3 text-sm pretendard font-medium animate-in zoom-in-95 duration-200 mb-6 border ${style}`}>
        {icon}
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    );
};

export const AuthView: React.FC<AuthViewProps> = ({ onGuestLogin }) => {
  const [loading, setLoading] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false); 
  const [email, setEmail] = useState(''); 
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); 
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string | React.ReactNode } | null>(null);

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

  const ensureProfileExists = async (userId: string, userEmail?: string) => {
    const { data } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!data) {
        await supabase.from('profiles').insert({
            id: userId,
            email: userEmail,
            nickname: userEmail ? userEmail.split('@')[0] : 'GM',
            created_at: new Date().toISOString()
        });
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
        setMessage({ type: 'error', text: 'Supabase 연결 설정이 되어있지 않습니다.' });
        return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signup') {
        if (!isSignupFormValid) throw new Error("입력 정보를 다시 확인해주세요.");
        const { data, error } = await (supabase.auth as any).signUp({ email, password });
        if (error) throw error;
        if (data.user) await ensureProfileExists(data.user.id, data.user.email);
        setMessage({ type: 'success', text: '회원가입 성공! 로그인해주세요.' });
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      } else {
        // 1. Authenticate
        const { data, error } = await (supabase.auth as any).signInWithPassword({ email, password });
        if (error) throw error;

        // 2. Just ensure profile exists (Removed Lock Logic)
        if (data.user) {
            await ensureProfileExists(data.user.id, data.user.email);
        }
      }
    } catch (error: any) {
      let errorMsg = error.message || '인증 중 오류가 발생했습니다.';
      if (errorMsg.includes("Invalid login credentials")) errorMsg = "이메일 또는 비밀번호가 올바르지 않습니다.";
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans text-slate-200">
      <div className={`absolute inset-0 w-full h-full pointer-events-none overflow-hidden transition-opacity duration-1000 ease-in-out ${bgLoaded ? 'opacity-100' : 'opacity-0'}`}>
        <img 
            src="https://buummihpewiaeltywdff.supabase.co/storage/v1/object/public/images/background3.png" 
            alt="Background" 
            className="w-full h-full object-cover opacity-30 blur-sm scale-110 transform-gpu"
            onLoad={() => setBgLoaded(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/50 to-slate-950/80"></div>
      </div>

      <div className={`w-full max-w-md bg-slate-900/80 border border-slate-800 backdrop-blur-md rounded-3xl p-8 shadow-2xl relative z-10 transition-all duration-1000 ease-in-out transform ${bgLoaded ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}`}>
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-white leading-tight oswald tracking-tighter uppercase italic">
            Courtside GM
          </h1>
        </div>

        <form onSubmit={handleAuth} className="space-y-0">
          <AuthInput label="이메일" type="email" placeholder="이메일 주소" value={email} onChange={setEmail} isValid={isEmailValid} errorMsg="올바른 이메일 형식이 아닙니다." showError={email !== ''} />
          <AuthInput label="비밀번호" type="password" placeholder="비밀번호" value={password} onChange={setPassword} isValid={mode === 'login' ? true : isPasswordValid} errorMsg="6~12자, 대문자, 숫자, 특수문자 포함 필수" showError={mode === 'signup' && password !== ''} />
          {mode === 'signup' && (
            <AuthInput label="비밀번호 확인" type="password" placeholder="비밀번호 확인" value={confirmPassword} onChange={setConfirmPassword} isValid={isConfirmValid} errorMsg="비밀번호가 일치하지 않습니다." showError={confirmPassword !== ''} />
          )}

          {message && <AuthAlert type={message.type}>{message.text}</AuthAlert>}

          <div className="space-y-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black py-4 rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="animate-spin" /> : (mode === 'login' ? <><LogIn size={20} /> <span className="pretendard font-medium">로그인</span></> : <><UserPlus size={20} /> <span className="pretendard font-medium">회원가입</span></>)}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center border-t border-slate-800 pt-6">
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(null); }} className="text-slate-500 hover:text-indigo-400 pretendard font-medium text-sm transition-all">
            {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
        </div>
      </div>
    </div>
  );
};
