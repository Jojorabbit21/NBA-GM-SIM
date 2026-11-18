// useAuthFlow.ts — 로그인·회원가입·이메일 인증·비밀번호 재설정 로직 (2026-11-18 views/auth/AuthForm.tsx 에서 그대로 분리)
// 화면이 둘이 됐기 때문: 기존 로그인 폼(AuthForm — 로그인 팝업·/auth 페이지)과 홈 화면의 즉석 로그인(components/home/HomeAuth.tsx).
// 로직은 한 글자도 바꾸지 않았다. mode 가 흐름의 현재 단계다:
//   login → (signup → verify) / (forgot → recoverVerify → newPassword → login)
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { setRecoveryInProgress } from '../services/authRecoveryState';

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{6,12}$/;

export type AuthMode = 'login' | 'signup' | 'verify' | 'forgot' | 'recoverVerify' | 'newPassword';
export type AuthSuccess = (opts: { isFirstSignup: boolean; nickname: string | null }) => void;

export function useAuthFlow(onSuccess?: AuthSuccess) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup' | 'verify' | 'forgot' | 'recoverVerify' | 'newPassword'>('login');
  const [recoverEmail, setRecoverEmail] = useState('');
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

  // 주의: DB에 auth.users INSERT 시 profiles row를 자동 생성하는 트리거(on_auth_user_created →
  // handle_new_user())가 있어, signUp() 시점에 이미 profiles row가 만들어진다. 즉 OTP 인증(가입 완료)
  // 시점엔 항상 row가 "이미 존재"하므로, 여기서의 select/insert 결과로는 최초가입 여부를 판별할 수 없다
  // (그래서 이 함수는 nickname 동기화용 안전망으로만 쓰고, 최초가입 트리거는 handleOtpChange 성공 시점에서 별도로 세팅한다).
  const ensureProfileExists = async (userId: string, userEmail?: string): Promise<string | null> => {
    const { data, error: selectError } = await supabase.from('profiles').select('id, nickname').eq('id', userId).maybeSingle();
    if (selectError) {
        console.warn('⚠️ [ensureProfileExists] Profile check failed:', selectError.message);
        return null;
    }
    if (!data) {
        const defaultNickname = userEmail ? userEmail.split('@')[0] : 'GM';
        const { error: insertError } = await supabase.from('profiles').insert({
            id: userId,
            email: userEmail,
            nickname: defaultNickname,
            created_at: new Date().toISOString()
        });
        if (insertError) {
            console.warn('⚠️ [ensureProfileExists] Profile insert failed:', insertError.message);
            return null;
        }
        return defaultNickname;
    }
    return data.nickname ?? null;
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
        if (data.user) {
          const nickname = await ensureProfileExists(data.user.id, data.user.email);
          onSuccess?.({ isFirstSignup: false, nickname });
        }
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

  // ── Password recovery (OTP flow, same style as signup verification) ──
  // verifyOtp('recovery') creates a temporary session; authRecoveryState keeps useAuth from
  // treating it as a login. Any exit path must call cancelRecovery() so the session is dropped.
  const cancelRecovery = async () => {
    setRecoveryInProgress(false);
    await supabase.auth.signOut().catch(() => {});
  };

  // Unmount (e.g. modal closed mid-recovery) must not leave a half-authenticated session behind
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => () => {
    if (modeRef.current === 'newPassword' || modeRef.current === 'recoverVerify') {
      setRecoveryInProgress(false);
      supabase.auth.signOut().catch(() => {});
    }
  }, []);

  const handleSendRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setMessage({ type: 'error', text: 'Supabase 연결 설정이 되어있지 않습니다.' });
      return;
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      setMessage({ type: 'error', text: '올바른 이메일 주소를 입력해주세요.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { data: exists, error: existsError } = await supabase.rpc('email_exists', { p_email: email });
      if (existsError) throw existsError;
      if (!exists) {
        setMessage({ type: 'error', text: '가입되지 않은 이메일입니다.' });
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setRecoverEmail(email);
      setOtp('');
      setOtpAttempts(0);
      setResendCooldown(RESEND_COOLDOWN_SEC);
      setMessage({ type: 'success', text: '인증번호가 이메일로 발송되었습니다.' });
      setMode('recoverVerify');
    } catch (error: any) {
      const msg = String(error?.message || '');
      setMessage({ type: 'error', text: /rate limit|seconds/i.test(msg) ? '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.' : (msg || '인증번호 발송에 실패했습니다.') });
    } finally {
      setLoading(false);
    }
  };

  const handleResendRecovery = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(recoverEmail);
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

  const handleRecoveryOtpChange = (val: string) => {
    if (isOtpLocked) return;
    setOtp(val);
    if (val.length !== 8) return;
    setTimeout(async () => {
      setLoading(true);
      setMessage(null);
      setRecoveryInProgress(true);
      try {
        const { error } = await (supabase.auth as any).verifyOtp({ email: recoverEmail, token: val, type: 'recovery' });
        if (error) throw error;
        setPassword('');
        setConfirmPassword('');
        setMode('newPassword');
      } catch (error: any) {
        setRecoveryInProgress(false);
        const nextAttempts = otpAttempts + 1;
        setOtpAttempts(nextAttempts);
        setOtp('');
        if (nextAttempts >= MAX_OTP_ATTEMPTS) {
          setMessage({ type: 'error', text: `인증 시도 ${MAX_OTP_ATTEMPTS}회 초과. 인증번호를 재발송해주세요.` });
        } else {
          const raw = String(error?.message || '');
          setMessage({ type: 'error', text: /expired|invalid/i.test(raw) ? `인증번호가 올바르지 않거나 만료되었습니다. (${nextAttempts}/${MAX_OTP_ATTEMPTS})` : (raw || '인증 처리 중 오류가 발생했습니다.') });
        }
      } finally {
        setLoading(false);
      }
    }, 100);
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!PASSWORD_REGEX.test(password) || password !== confirmPassword) {
      setMessage({ type: 'error', text: '입력 정보를 다시 확인해주세요.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await cancelRecovery(); // drop the temporary session; user logs in with the new password
      setPassword('');
      setConfirmPassword('');
      setOtp('');
      setMode('login');
      setMessage({ type: 'success', text: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.' });
    } catch (error: any) {
      const raw = String(error?.message || '');
      setMessage({ type: 'error', text: /different from the old/i.test(raw) ? '이전 비밀번호와 다른 비밀번호를 입력해주세요.' : (raw || '비밀번호 변경에 실패했습니다.') });
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = async () => {
    if (mode === 'newPassword' || mode === 'recoverVerify') await cancelRecovery();
    setMode('login');
    setMessage(null);
    setOtp('');
    setPassword('');
    setConfirmPassword('');
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
            const nickname = await ensureProfileExists(data.user.id, data.user.email);
            // OTP 인증 성공 = 회원가입 완료 시점 — profiles row는 DB 트리거가 signUp() 때 이미
            // 만들어놓기 때문에 ensureProfileExists의 insert 여부로는 최초가입을 판별할 수 없어 여기서 직접 트리거
            onSuccess?.({ isFirstSignup: true, nickname });
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

  return {
    loading, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword, mode, setMode, recoverEmail, otp, setOtp, signupEmail, resendCooldown, message, setMessage, isEmailValid, isPasswordValid, isConfirmValid, isSignupFormValid, isOtpLocked, handleAuth, handleSendRecovery, handleResendRecovery, handleRecoveryOtpChange, handleSetNewPassword, backToLogin, handleResendOtp, handleOtpChange,
  };
}

export type AuthFlow = ReturnType<typeof useAuthFlow>;
