
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { LogIn, UserPlus, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { AuthInput } from '../components/AuthInput';
import { OtpInput } from '../components/OtpInput';
import { APP_NAME, APP_YEAR } from '../utils/constants';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{6,12}$/;

interface AuthViewProps {
  onGuestLogin: () => void;
}

const AuthAlert: React.FC<{ type: 'error' | 'success'; children: React.ReactNode }> = ({ type, children }) => {
    const style = type === 'error'
        ? 'bg-status-danger-muted text-status-danger-text border-status-danger-default/20'
        : 'bg-status-success-muted text-status-success-text border-status-success-default/20';
    return (
      <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-medium animate-in zoom-in-95 duration-200 mb-6 border ${style}`}>
        <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    );
};

export const AuthView: React.FC<AuthViewProps> = ({ onGuestLogin: _onGuestLogin }) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup' | 'verify'>('login');
  const [otp, setOtp] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
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

  const MAX_OTP_ATTEMPTS = 5;
  const RESEND_COOLDOWN_SEC = 60;
  const isOtpLocked = otpAttempts >= MAX_OTP_ATTEMPTS;

  // 재발송 쿨다운 타이머
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownRef.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
    }
  }, [resendCooldown > 0]);

  const ensureProfileExists = async (userId: string, userEmail?: string) => {
    const { data, error: selectError } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (selectError) {
        console.warn('⚠️ [ensureProfileExists] Profile check failed:', selectError.message);
        return;
    }
    if (!data) {
        const { error: insertError } = await supabase.from('profiles').insert({
            id: userId,
            email: userEmail,
            nickname: userEmail ? userEmail.split('@')[0] : 'GM',
            created_at: new Date().toISOString()
        });
        if (insertError) console.warn('⚠️ [ensureProfileExists] Profile insert failed:', insertError.message);
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
        const { error } = await (supabase.auth as any).signUp({ email, password });
        if (error) throw error;
        setSignupEmail(email);
        setOtp('');
        setOtpAttempts(0);
        setResendCooldown(RESEND_COOLDOWN_SEC);
        setMessage({ type: 'success', text: '인증번호가 이메일로 발송되었습니다.' });
        setMode('verify');
      } else {
        const { data, error } = await (supabase.auth as any).signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) await ensureProfileExists(data.user.id, data.user.email);
      }
    } catch (error: any) {
      let errorMsg = error.message || '인증 중 오류가 발생했습니다.';
      if (errorMsg.includes("Invalid login credentials")) errorMsg = "이메일 또는 비밀번호가 올바르지 않습니다.";
      if (errorMsg.includes("Email not confirmed")) {
        setSignupEmail(email);
        setOtp('');
        setOtpAttempts(0);
        setMode('verify');
        try {
          await supabase.auth.resend({ type: 'signup', email });
          setResendCooldown(RESEND_COOLDOWN_SEC);
          setMessage({ type: 'success', text: '이메일 인증이 필요합니다. 인증번호가 재발송되었습니다.' });
        } catch {
          setMessage({ type: 'error', text: '이메일 인증이 필요합니다. 인증번호 재발송 버튼을 눌러주세요.' });
        }
        return;
      }
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: signupEmail });
      if (error) throw error;
      setOtp('');
      setOtpAttempts(0);
      setResendCooldown(RESEND_COOLDOWN_SEC);
      setMessage({ type: 'success', text: '인증번호가 재발송되었습니다.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || '재발송에 실패했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  // OTP 8자리 입력 완료 시 자동 인증
  const handleOtpChange = (val: string) => {
    if (isOtpLocked) return;
    setOtp(val);
    if (val.length === 8) {
      setTimeout(() => {
        setLoading(true);
        setMessage(null);
        (supabase.auth as any).verifyOtp({
          email: signupEmail,
          token: val,
          type: 'signup',
        }).then(async ({ data, error }: any) => {
          if (!error && data?.user) {
            await ensureProfileExists(data.user.id, data.user.email);
          }
          if (error) {
            const nextAttempts = otpAttempts + 1;
            setOtpAttempts(nextAttempts);
            if (nextAttempts >= MAX_OTP_ATTEMPTS) {
              setMessage({ type: 'error', text: `인증 시도 ${MAX_OTP_ATTEMPTS}회 초과. 인증번호를 재발송해주세요.` });
            } else {
              let errorMsg = error.message || '인증 중 오류가 발생했습니다.';
              if (errorMsg.includes('Token has expired or is invalid')) {
                errorMsg = `인증번호가 올바르지 않습니다. (${nextAttempts}/${MAX_OTP_ATTEMPTS})`;
              } else if (errorMsg.includes('expired')) {
                errorMsg = '인증번호가 만료되었습니다. 재발송해주세요.';
              }
              setMessage({ type: 'error', text: errorMsg });
            }
            setOtp('');
          }
        }).catch((e: any) => {
          console.error('⚠️ [verifyOtp] Error:', e);
          setMessage({ type: 'error', text: '인증 처리 중 오류가 발생했습니다.' });
        }).finally(() => setLoading(false));
      }, 100);
    }
  };

  return (
    <div className="min-h-screen bg-surface-background flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans text-text-primary">
      <div className="w-full max-w-md bg-surface-card/80 border border-border-default backdrop-blur-md rounded-3xl p-8 shadow-elevation-lg relative z-10">
        <div className={`text-center ${mode === 'verify' ? 'mb-6' : 'mb-10'}`}>
          <h1 className="text-2xl font-black text-text-primary leading-tight tracking-tighter uppercase">
            {APP_NAME}<br />{APP_YEAR}
          </h1>
        </div>

        {mode === 'verify' ? (
          <div className="space-y-5">
            <OtpInput length={8} value={otp} onChange={handleOtpChange} disabled={loading || isOtpLocked} />

            <div className="text-center space-y-1">
              {message ? (
                <p className={`text-sm font-medium ${message.type === 'error' ? 'text-status-danger-text' : 'text-status-success-text'}`}>
                  {message.text}
                </p>
              ) : (
                <p className="text-sm text-text-muted font-medium">
                  <span className="text-text-primary">{signupEmail}</span> 으로 인증번호가 발송되었습니다.
                </p>
              )}
            </div>

            {loading && (
              <div className="flex justify-center">
                <Loader2 className="animate-spin text-cta-border" size={24} />
              </div>
            )}

            <div className="text-center">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading || resendCooldown > 0}
                className="text-text-disabled hover:text-cta-default font-medium text-sm transition-all disabled:opacity-50"
              >
                {resendCooldown > 0 ? <span className="text-text-secondary">재발송 대기 ({resendCooldown}초)</span> : '인증번호 재발송'}
              </button>
            </div>

            <div className="border-t border-border-dim pt-4">
              <button
                type="button"
                onClick={() => { setMode('login'); setMessage(null); setOtp(''); setPassword(''); setConfirmPassword(''); }}
                className="w-full flex items-center justify-center gap-2 text-text-disabled hover:text-text-secondary font-medium text-sm transition-all"
              >
                <ArrowLeft size={14} />
                로그인으로 돌아가기
              </button>
            </div>
          </div>
        ) : (
          <>
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
                  className="w-full bg-cta-strong hover:bg-cta-default disabled:bg-surface-disabled text-white font-semibold py-4 rounded-xl transition-all shadow-elevation-md flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  {loading ? <Loader2 className="animate-spin" /> : (mode === 'login' ? <><LogIn size={20} /> <span>로그인</span></> : <><UserPlus size={20} /> <span>회원가입</span></>)}
                </button>
              </div>
            </form>

            <div className="mt-8 text-center border-t border-border-dim pt-6">
              <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(null); }} className="text-text-disabled hover:text-cta-default font-medium text-sm transition-all">
                {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
