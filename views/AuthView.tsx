
import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { Lock, Mail, UserPlus, LogIn, Loader2, AlertCircle, Settings } from 'lucide-react';

export const AuthView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

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
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage({ type: 'success', text: '회원가입 성공! 이메일을 확인하여 인증해주세요.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: error.message || '인증 중 오류가 발생했습니다.' });
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
          <h1 className="text-4xl font-black text-white italic tracking-tighter mb-2">NBA GM SIM <span className="text-indigo-500">2026</span></h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">General Manager Access</p>
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

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
              </div>
              <input
                type="email"
                required
                placeholder="Email Address"
                className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
              </div>
              <input
                type="password"
                required
                placeholder="Password"
                className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-bold ${message.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{message.text}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin" /> : (mode === 'login' ? <><LogIn size={20} /> Login</> : <><UserPlus size={20} /> Sign Up</>)}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-3">
            {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
          </p>
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(null); }}
            className="text-indigo-400 hover:text-indigo-300 font-bold text-sm underline underline-offset-4 decoration-indigo-500/30 hover:decoration-indigo-500 transition-all"
          >
            {mode === 'login' ? 'Create New Account' : 'Login to Existing Account'}
          </button>
        </div>
      </div>
    </div>
  );
};
