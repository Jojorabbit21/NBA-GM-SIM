
import React, { useState, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { runFullMigration } from '../services/migration';
import { Lock, Mail, UserPlus, LogIn, Loader2, AlertCircle, User, ShieldAlert, Database, Server, Copy } from 'lucide-react';

// Validation Regex Patterns
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const NICKNAME_REGEX = /^[a-zA-Z0-9가-힣]{2,12}$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{6,12}$/;

interface AuthViewProps {
  onGuestLogin: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onGuestLogin }) => {
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState(''); 
  const [email, setEmail] = useState(''); 
  const [nickname, setNickname] = useState(''); 
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); 
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string | React.ReactNode } | null>(null);
  
  // Migration State
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<string>('');
  const [migrationPercent, setMigrationPercent] = useState<number>(0);

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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
        const configError = 'Supabase 연결 설정이 되어있지 않습니다. 아래의 관리자 모드를 이용하세요.';
        setMessage({ type: 'error', text: configError });
        return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signup') {
        if (!isSignupFormValid) throw new Error("입력 정보를 다시 확인해주세요.");

        const { data, error } = await (supabase.auth as any).signUp({
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
      } else {
        let loginEmail = identifier.trim();

        if (!loginEmail.includes('@')) {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('email')
                .eq('nickname', loginEmail)
                .maybeSingle();

            if (profileError || !profile) {
                throw new Error("닉네임을 찾을 수 없습니다. 이메일로 로그인해주세요.");
            }
            loginEmail = profile.email;
        }

        const { error } = await (supabase.auth as any).signInWithPassword({
          email: loginEmail,
          password,
        });
        
        if (error) throw error;
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

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      alert("SQL이 클립보드에 복사되었습니다. Supabase SQL Editor에 붙여넣으세요.");
  };

  const handleMigration = async () => {
    if (!confirm("주의: 스케줄 데이터를 Supabase에 적재합니다. (기존 팀/선수 데이터는 유지됩니다)")) return;
    
    setIsMigrating(true);
    setMigrationPercent(0);
    setMigrationStatus("준비 중...");
    setMessage(null);

    try {
      const result = await runFullMigration((msg, percent) => {
          setMigrationStatus(msg);
          setMigrationPercent(percent);
      });

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (e: any) {
      let errorText: React.ReactNode = e.message || "마이그레이션 실패";
      
      const fixSql = `-- 1. 스케줄 테이블 생성 (기존에 없다면)
CREATE TABLE IF NOT EXISTS public.meta_schedule (
    id text NOT NULL PRIMARY KEY,
    game_date date NOT NULL,
    home_team_id text NOT NULL,
    away_team_id text NOT NULL,
    home_score int,
    away_score int,
    played boolean DEFAULT false,
    is_playoff boolean DEFAULT false,
    series_id text
);

ALTER TABLE public.meta_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for schedule" ON public.meta_schedule;
CREATE POLICY "Enable all access for schedule" ON public.meta_schedule FOR ALL USING (true) WITH CHECK (true);

-- 2. [NEW] 게임 결과(박스스코어) 저장용 테이블 생성
CREATE TABLE IF NOT EXISTS public.user_game_results (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id text NOT NULL,
    date date NOT NULL,
    home_team_id text NOT NULL,
    away_team_id text NOT NULL,
    home_score int,
    away_score int,
    box_score jsonb,
    created_at timestamptz DEFAULT now()
);

-- 인덱스 추가 (조회 속도 향상)
CREATE INDEX IF NOT EXISTS idx_user_game_results_user_id ON public.user_game_results(user_id);
CREATE INDEX IF NOT EXISTS idx_user_game_results_game_id ON public.user_game_results(game_id);

-- RLS 정책 설정 (본인 데이터만 접근 가능)
ALTER TABLE public.user_game_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert their own results" ON public.user_game_results;
DROP POLICY IF EXISTS "Users can select their own results" ON public.user_game_results;
DROP POLICY IF EXISTS "Users can delete their own results" ON public.user_game_results;

CREATE POLICY "Users can insert their own results" ON public.user_game_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can select their own results" ON public.user_game_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own results" ON public.user_game_results FOR DELETE USING (auth.uid() = user_id);`;

      // Error Handling Logic
      if (e.message && (e.message.includes("row-level security") || e.message.includes("ON CONFLICT") || e.message.includes("depends on") || e.message.includes("relation"))) {
          errorText = (
            <div className="flex flex-col gap-2 w-full">
                <div className="flex items-center gap-2 text-red-400 font-bold">
                    <ShieldAlert size={18} />
                    <span>테이블 생성 및 설정 필요</span>
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                    최적화를 위해 <strong>meta_schedule</strong> 및 <strong>user_game_results</strong> 테이블이 필요합니다.<br/>
                    아래 SQL을 실행하여 DB 구조를 업데이트해주세요.
                </div>
                <div className="relative group">
                    <code className="text-[9px] font-mono bg-black/50 p-3 rounded-lg block whitespace-pre-wrap select-all cursor-text text-emerald-400 border border-slate-700 max-h-40 overflow-y-auto custom-scrollbar">
                        {fixSql}
                    </code>
                    <button 
                        onClick={() => copyToClipboard(fixSql)}
                        className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors border border-slate-600"
                        title="SQL 복사"
                    >
                        <Copy size={14} />
                    </button>
                </div>
                <span className="text-[10px] text-slate-500 text-center">Supabase Dashboard {'>'} SQL Editor에서 실행하세요.</span>
            </div>
          );
      }
      
      setMessage({ type: 'error', text: errorText });
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans text-slate-200">
      
      {/* Migration Progress Modal */}
      {isMigrating && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-md shadow-2xl flex flex-col items-center gap-6">
                  <div className="relative">
                      <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl animate-pulse"></div>
                      <Database size={48} className="text-indigo-400 relative z-10" />
                  </div>
                  <div className="w-full space-y-2 text-center">
                      <h3 className="text-xl font-black text-white uppercase tracking-tight">스케줄 데이터 적재 중</h3>
                      <p className="text-sm font-bold text-slate-400">{migrationStatus}</p>
                  </div>
                  <div className="w-full space-y-2">
                      <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                          <div 
                            className="h-full bg-gradient-to-r from-indigo-600 to-blue-500 transition-all duration-300 ease-out" 
                            style={{ width: `${migrationPercent}%` }}
                          />
                      </div>
                      <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                          <span>Progress</span>
                          <span>{migrationPercent}%</span>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-3xl opacity-30"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl opacity-30"></div>
      </div>

      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 backdrop-blur-md rounded-3xl p-8 shadow-2xl relative z-10 animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white italic tracking-tighter mb-2">NBA <span className="text-indigo-500">2025-26</span></h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">단장 시뮬레이션</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-5">
          {/* ... inputs ... */}
          <div className="space-y-4">
            {mode === 'login' ? (
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                    </div>
                    <input
                        type="text"
                        required
                        placeholder="이메일 또는 닉네임"
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
                                placeholder="이메일 주소"
                                className={`w-full bg-slate-950 border text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-1 transition-all font-medium ${
                                    !isEmailValid && email ? 'border-red-500 focus:ring-red-500' : 'border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                                }`}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
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
                                className={`w-full bg-slate-950 border text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-1 transition-all font-medium ${
                                    !isNicknameValid && nickname ? 'border-red-500 focus:ring-red-500' : 'border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                                }`}
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                            />
                        </div>
                    </div>
                </>
            )}

            <div className="space-y-1">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className={`h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors`} />
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="비밀번호"
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
            </div>

            {mode === 'signup' && (
                <div className="space-y-1 animate-in slide-in-from-top-2 duration-300">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Lock className={`h-5 w-5 ${!isConfirmValid && confirmPassword ? 'text-red-500' : 'text-slate-500'} group-focus-within:text-indigo-400 transition-colors`} />
                        </div>
                        <input
                            type="password"
                            required
                            placeholder="비밀번호 확인"
                            className={`w-full bg-slate-950 border text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-1 transition-all font-medium ${
                                !isConfirmValid && confirmPassword ? 'border-red-500 focus:ring-red-500' : 'border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                            }`}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>
                </div>
            )}
          </div>

          {message && (
            <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-bold ${message.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1 overflow-hidden">{message.text}</div>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black py-4 rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-3"
            >
              {loading ? <Loader2 className="animate-spin" /> : (mode === 'login' ? <><LogIn size={20} /> 로그인</> : <><UserPlus size={20} /> 회원가입</>)}
            </button>

            <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onGuestLogin}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all border border-slate-700 flex items-center justify-center gap-2"
                >
                  <ShieldAlert size={16} className="text-amber-500" />
                  관리자 모드
                </button>
                
                <button
                  type="button"
                  onClick={handleMigration}
                  disabled={isMigrating}
                  className="px-4 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-400 hover:text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all border border-slate-700 flex items-center justify-center gap-2"
                  title="초기 데이터 적재 (DB Reset)"
                >
                  {isMigrating ? <Loader2 size={16} className="animate-spin" /> : <Server size={16} className="text-emerald-500" />}
                </button>
            </div>
          </div>
        </form>

        <div className="mt-8 text-center border-t border-slate-800 pt-6">
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(null); }}
            className="text-slate-500 hover:text-indigo-400 font-bold text-sm transition-all"
          >
            {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
        </div>
      </div>
    </div>
  );
};
