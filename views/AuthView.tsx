
import React, { useState, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { Lock, Mail, UserPlus, LogIn, Loader2, AlertCircle, Settings, User, Check, XCircle, WifiOff } from 'lucide-react';
import { logError } from '../services/analytics'; 

// Validation Regex Patterns
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const NICKNAME_REGEX = /^[a-zA-Z0-9가-힣]{2,12}$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{6,12}$/;

interface AuthViewProps {}

export const AuthView: React.FC<AuthViewProps> = () => {
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState(''); 
  const [email, setEmail] = useState(''); 
  const [nickname, setNickname] = useState(''); 
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); 
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  const isEmailValid = useMemo(() => email === '' || EMAIL_REGEX.test(email), [email]);
  const isNicknameValid = useMemo(() => nickname === '' || NICKNAME_REGEX.test(nickname), [nickname]);
  const isPasswordValid = useMemo(() => password === '' || PASSWORD_REGEX.test(password), [password]);
  const isConfirmValid = useMemo(() => confirmPassword === '' || password === confirmPassword, [password, confirmPassword]);

  const isSignupFormValid = useMemo(() => {
    return (
      email !== '' && EMAIL_REGEX.test(email) &&
      nickname !== '' && NICKNAME_REGEX.test(nickname) &&
      password !== '' && PASSWORD_REGEX.test(password) &&
      confirmPassword !== '' && password === confirmPassword
    );
  }, [email, nickname, password, confirmPassword]);

  const isLoginFormValid = identifier.trim() !== '' && password !== '';

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
        setMessage({ type: 'error', text: 'Supabase 연결 설정이 되어있지 않습니다. .env 파일을 확인하고 개발 서버를 재시작하세요.' });
        logError('Auth', 'Supabase configuration missing');
        return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signup') {
        if (!isSignupFormValid) throw new Error("입력 정보를 다시 확인해주세요.");

        // 회원가입 시에는 Auth Users에만 등록하고, 프로필/세이브는 팀 선택 후 생성합니다.
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
                nickname: nickname 
            }
          }
        });

        if (error) throw error;

        setMessage({ type: 'success', text: '회원가입 성공! 이메일 인증 후 로그인해주세요.' });
        setMode('login');
        setIdentifier(email); 
        setPassword('');
        setConfirmPassword('');
      } else {
        let loginEmail = identifier.trim();

        if (!loginEmail.includes('@')) {
            try {
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('email')
                    .eq('nickname', loginEmail)
                    .maybeSingle();

                if (profileError) {
                    console.error("Profile Lookup Error:", profileError);
                    throw new Error("닉네임 조회 중 오류가 발생했습니다. 이메일로 로그인해주세요.");
                }
                
                if (!profile) {
                    throw new Error("해당 닉네임의 사용자를 찾을 수 없습니다. 이메일로 로그인해주세요.");
                }
                loginEmail = profile.email;
            } catch (lookupErr: any) {
                console.error("닉네임 조회 실패:", lookupErr);
                throw new Error(lookupErr.message || "닉네임 로그인을 사용할 수 없습니다. 이메일로 로그인해주세요.");
            }
        }

        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });
        
        if (error) throw error;
      }
    } catch (error: any) {
      console.error(error);
      let errorMsg = error.message || '인증 중 오류가 발생했습니다.';
      
      if (errorMsg.includes("User already registered")) {
          errorMsg = "이미 가입된 이메일입니다. 로그인 모드로 전환합니다.";
          setMode('login');
          setIdentifier(email);
      } else if (errorMsg.includes("Invalid login credentials")) {
          errorMsg = "이메일 또는 비밀번호가 올바르지 않습니다.";
      } else if (errorMsg.includes("Failed to fetch")) {
          errorMsg = "서버에 연결할 수 없습니다. 오프라인 모드를 이용해주세요.";
      }

      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans text-slate-200">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 backdrop-blur-xl rounded-3xl p-8 shadow-2xl relative z-10 animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white italic tracking-tighter mb-2">NBA <span className="text-indigo-500">2025-26</span></h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">단장 시뮬레이션</p>
        </div>

        {!isSupabaseConfigured && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 text-amber-400">
                <Settings className="flex-shrink-0 mt-0.5" size={18} />
                <div className="text-xs font-bold leading-relaxed">
                    서버 설정이 필요합니다.<br/>
                    Supabase 연결 정보를 확인해주세요.
                </div>
            </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div className="space-y-4">
            {mode === 'login' ? (
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                    </div>
                    <input
                        type="text"
                        required
                        placeholder="이메일 (닉네임 불가 시 사용)"
                        className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                    />
                </div>
            ) : (
                <>
                    <div className="space-y-1">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Mail className={`h-5 w-5 transition-colors ${!isEmailValid && email ? 'text-red-500' : 'text-slate-500 group-focus-within:text-indigo-400'}`} />
                            </div>
                            <input
                                type="email"
                                required
                                placeholder="이메일 주소 입력"
                                className={`w-full bg-slate-950 border text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-1 transition-all font-medium ${
                                    !isEmailValid && email 
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                                    : 'border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                                }`}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        {!isEmailValid && email && (
                            <p className="text-red-500 text-[11px] font-bold pl-2 flex items-center gap-1">
                                <XCircle size={10} /> 올바른 이메일 형식이 아닙니다.
                            </p>
                        )}
                    </div>

                    <div className="space-y-1">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <User className={`h-5 w-5 transition-colors ${!isNicknameValid && nickname ? 'text-red-500' : 'text-slate-500 group-focus-within:text-indigo-400'}`} />
                            </div>
                            <input
                                type="text"
                                required
                                placeholder="닉네임 (2~12자)"
                                maxLength={12}
                                className={`w-full bg-slate-950 border text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-1 transition-all font-medium ${
                                    !isNicknameValid && nickname
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                                    : 'border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                                }`}
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                            />
                        </div>
                        {(!isNicknameValid && nickname) && (
                            <p className="text-red-500 text-[11px] font-bold pl-2 flex items-center gap-1">
                                <XCircle size={10} /> 한글/영문/숫자 2~12자
                            </p>
                        )}
                    </div>
                </>
            )}

            <div className="space-y-1">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className={`h-5 w-5 transition-colors ${mode === 'signup' && !isPasswordValid && password ? 'text-red-500' : 'text-slate-500 group-focus-within:text-indigo-400'}`} />
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="비밀번호 입력"
                    maxLength={12}
                    className={`w-full bg-slate-950 border text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-1 transition-all font-medium ${
                        mode === 'signup' && !isPasswordValid && password
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                        : 'border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                    }`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {mode === 'signup' && !isPasswordValid && password && (
                    <p className="text-red-500 text-[11px] font-bold pl-2 flex items-center gap-1">
                        <XCircle size={10} /> 6~12자, 대문자/숫자/특수문자 포함
                    </p>
                )}
            </div>

            {mode === 'signup' && (
                <div className="space-y-1 animate-in slide-in-from-top-2 duration-300">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            {!isConfirmValid && confirmPassword ? (
                                <Lock className="h-5 w-5 text-red-500 transition-colors" />
                            ) : confirmPassword && isConfirmValid ? (
                                <Check className="h-5 w-5 text-emerald-500 transition-colors" />
                            ) : (
                                <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                            )}
                        </div>
                        <input
                            type="password"
                            required
                            placeholder="비밀번호 확인"
                            className={`w-full bg-slate-950 border text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-1 transition-all font-medium ${
                                !isConfirmValid && confirmPassword
                                ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                                : confirmPassword && isConfirmValid
                                    ? 'border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500'
                                    : 'border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                            }`}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>
                    {!isConfirmValid && confirmPassword && (
                        <p className="text-red-500 text-[11px] font-bold pl-2 flex items-center gap-1">
                            <XCircle size={10} /> 비밀번호가 일치하지 않습니다.
                        </p>
                    )}
                </div>
            )}
          </div>

          {message && (
            <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-bold ${message.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{message.text}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (mode === 'signup' && !isSignupFormValid) || (mode === 'login' && !isLoginFormValid)}
            className={`w-full font-black py-4 rounded-xl uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-3 
                ${loading || (mode === 'signup' && !isSignupFormValid) || (mode === 'login' && !isLoginFormValid)
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/30'
                }`}
          >
            {loading ? <Loader2 className="animate-spin" /> : (mode === 'login' ? <><LogIn size={20} /> 로그인</> : <><UserPlus size={20} /> 회원가입</>)}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-3">
            {mode === 'login' ? "계정이 없으신가요?" : "이미 계정이 있으신가요?"}
          </p>
          <button
            onClick={() => { 
                setMode(mode === 'login' ? 'signup' : 'login'); 
                setMessage(null); 
                setPassword('');
                setConfirmPassword('');
                if (mode === 'login') {
                    setNickname('');
                    setEmail('');
                } else {
                    setIdentifier('');
                }
            }}
            className="text-indigo-400 hover:text-indigo-300 font-bold text-sm underline underline-offset-4 decoration-indigo-500/30 hover:decoration-indigo-500 transition-all"
          >
            {mode === 'login' ? '새 계정 생성' : '기존 계정으로 로그인'}
          </button>
        </div>
      </div>
    </div>
  );
};
