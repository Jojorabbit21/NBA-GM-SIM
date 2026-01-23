
import React, { useState, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { Lock, Mail, UserPlus, LogIn, Loader2, AlertCircle, Settings, User, Check, XCircle } from 'lucide-react';

// Validation Regex Patterns
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// 닉네임: 4~10자, 영문/한글/숫자 허용 (특수문자 제외)
const NICKNAME_REGEX = /^[a-zA-Z0-9가-힣]{4,10}$/;
// 비밀번호: 6~12자, 최소 1개의 대문자, 숫자, 특수문자 포함
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{6,12}$/;

// 세션 만료 시간 (Heartbeat 주기 30초 * 2배 여유 = 1분)
// 1분 이상 활동이 없으면 죽은 세션으로 간주하고 로그인 허용
const SESSION_TIMEOUT_MS = 60 * 1000;

export const AuthView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState(''); // Email or Nickname for Login
  const [email, setEmail] = useState(''); // Explicit Email for Signup
  const [nickname, setNickname] = useState(''); // Explicit Nickname for Signup
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // Confirm Password for Signup
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  // Validation Logic
  const isEmailValid = useMemo(() => email === '' || EMAIL_REGEX.test(email), [email]);
  const isNicknameValid = useMemo(() => nickname === '' || NICKNAME_REGEX.test(nickname), [nickname]);
  const isPasswordValid = useMemo(() => password === '' || PASSWORD_REGEX.test(password), [password]);
  const isConfirmValid = useMemo(() => confirmPassword === '' || password === confirmPassword, [password, confirmPassword]);

  // Overall Form Validity for Signup
  const isSignupFormValid = useMemo(() => {
    return (
      email !== '' && EMAIL_REGEX.test(email) &&
      nickname !== '' && NICKNAME_REGEX.test(nickname) &&
      password !== '' && PASSWORD_REGEX.test(password) &&
      confirmPassword !== '' && password === confirmPassword
    );
  }, [email, nickname, password, confirmPassword]);

  // Login form validity
  const isLoginFormValid = identifier.trim() !== '' && password !== '';

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
        setMessage({ type: 'error', text: 'Supabase 연결 설정이 되어있지 않습니다. .env 파일을 확인하고 개발 서버를 재시작하세요.' });
        return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signup') {
        // 1. 회원가입 로직 (클라이언트 사이드 검증 재확인)
        if (!isSignupFormValid) throw new Error("입력 정보를 다시 확인해주세요.");

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
                nickname: nickname // 메타데이터에 저장 (트리거 사용 시 중요)
            }
          }
        });

        if (error) throw error;

        // 2. 닉네임 로그인 지원을 위해 public.profiles 테이블에 매핑 정보 저장 시도
        // 트리거가 없다면 이 부분이 실행되어야 하며, 트리거가 있다면 upsert로 안전하게 처리
        if (data.user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: data.user.id,
                    email: email,
                    nickname: nickname
                }, { onConflict: 'id' });
            
            if (profileError) {
                // 트리거가 이미 처리했을 수 있으므로 경고만 로그
                console.warn("프로필 저장 중 경고 (트리거가 이미 처리했을 수 있음):", profileError);
            }
        }

        setMessage({ type: 'success', text: '회원가입 성공! 이메일을 확인하여 인증해주세요.' });
        setMode('login');
        setIdentifier(email); 
        setPassword('');
        setConfirmPassword('');
      } else {
        // 3. 로그인 로직
        let loginEmail = identifier.trim();

        // 입력값이 이메일 형식이 아니라면 닉네임으로 간주하고 이메일 조회
        if (!loginEmail.includes('@')) {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('email')
                .eq('nickname', loginEmail)
                .single();

            if (profileError || !profile) {
                throw new Error("해당 닉네임을 가진 사용자를 찾을 수 없거나, 프로필 데이터베이스가 설정되지 않았습니다.");
            }
            loginEmail = profile.email;
        }

        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });
        
        if (error) throw error;

        // 4. 프로필 데이터 확인 및 복구 (중복 로그인 차단 로직은 제거됨 -> App.tsx에서 처리)
        if (authData.user) {
            const { data: userProfile, error: fetchError } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', authData.user.id)
                .single();

            if (!userProfile && (fetchError?.code === 'PGRST116' || !userProfile)) {
                // 프로필 없음 (자동 복구 시도)
                console.log("프로필 데이터 누락 감지 - 자동 복구 시도");
                const metaName = authData.user.user_metadata?.nickname;
                const emailName = authData.user.email?.split('@')[0] || 'User';
                const nickToSave = metaName || emailName;

                await supabase.from('profiles').upsert({
                    id: authData.user.id,
                    email: authData.user.email,
                    nickname: nickToSave,
                    last_seen_at: new Date().toISOString()
                }, { onConflict: 'id' });
            }
        }
      }
    } catch (error: any) {
      console.error(error);
      let errorMsg = error.message || '인증 중 오류가 발생했습니다.';
      
      // Error Message Translation
      if (errorMsg.includes("User already registered")) {
          errorMsg = "이미 가입된 이메일입니다. 로그인 모드로 전환합니다.";
          // Auto switch to login
          setMode('login');
          setIdentifier(email);
          setPassword(''); 
      } else if (errorMsg.includes("Invalid login credentials")) {
          errorMsg = "이메일 또는 비밀번호가 올바르지 않습니다.";
      } else if (errorMsg.includes("Password should be at least")) {
          errorMsg = "비밀번호는 최소 6자 이상이어야 합니다.";
      } else if (errorMsg.includes("Database error saving new user")) {
          errorMsg = "사용자 저장 중 데이터베이스 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
      } else if (errorMsg.includes("weak_password")) {
          errorMsg = "비밀번호가 너무 취약합니다.";
      }

      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans text-slate-200">
      {/* Background Ambience */}
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
                    Supabase Project URL과 Key를 .env에 설정하고 서버를 재시작하세요.
                </div>
            </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div className="space-y-4">
            {mode === 'login' ? (
                // 로그인 모드: 이메일 또는 닉네임
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                    </div>
                    <input
                        type="text"
                        required
                        placeholder="이메일 또는 닉네임 입력"
                        className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                    />
                </div>
            ) : (
                // 회원가입 모드: 이메일 + 닉네임 분리
                <>
                    {/* 이메일 입력 */}
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
                            <p className="text-red-500 text-[11px] font-bold pl-2 animate-in slide-in-from-top-1 flex items-center gap-1">
                                <XCircle size={10} /> 올바른 이메일 형식이 아닙니다.
                            </p>
                        )}
                    </div>

                    {/* 닉네임 입력 */}
                    <div className="space-y-1">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <User className={`h-5 w-5 transition-colors ${!isNicknameValid && nickname ? 'text-red-500' : 'text-slate-500 group-focus-within:text-indigo-400'}`} />
                            </div>
                            <input
                                type="text"
                                required
                                placeholder="닉네임 입력"
                                maxLength={10}
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
                            <p className="text-red-500 text-[11px] font-bold pl-2 animate-in slide-in-from-top-1 flex items-center gap-1">
                                <XCircle size={10} /> 4~10자, 특수문자 사용 불가
                            </p>
                        )}
                    </div>
                </>
            )}

            {/* 비밀번호 입력 */}
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
                    <p className="text-red-500 text-[11px] font-bold pl-2 animate-in slide-in-from-top-1 flex items-center gap-1">
                        <XCircle size={10} /> 6~12자, 대문자/숫자/특수문자 포함
                    </p>
                )}
            </div>

            {/* 비밀번호 확인 (회원가입만) */}
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
                        <p className="text-red-500 text-[11px] font-bold pl-2 animate-in slide-in-from-top-1 flex items-center gap-1">
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
                // Reset fields
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
