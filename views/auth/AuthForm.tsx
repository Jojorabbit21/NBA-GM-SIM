
import React from 'react';
import { PASSWORD_REGEX, useAuthFlow } from '../../hooks/useAuthFlow';
import { LogIn, UserPlus, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { AuthInput } from '../../components/AuthInput';
import { OtpInput } from '../../components/OtpInput';
import { APP_NAME } from '../../utils/constants';

interface AuthFormProps {
  /** 로그인/회원가입 완료 시 호출 — 세션 자체는 useAuth의 onAuthStateChange가 별도로 반영한다 */
  onSuccess?: (opts: { isFirstSignup: boolean; nickname: string | null }) => void;
  /** 'modal'이면 풀스크린 래퍼 없이 카드 내용만 렌더 */
  variant?: 'modal' | 'page';
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

export const AuthForm: React.FC<AuthFormProps> = ({ onSuccess, variant = 'page' }) => {
  const {
    loading, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword, mode, setMode, recoverEmail, otp, setOtp, signupEmail, resendCooldown, message, setMessage, isEmailValid, isPasswordValid, isConfirmValid, isSignupFormValid, isOtpLocked, handleAuth, handleSendRecovery, handleResendRecovery, handleRecoveryOtpChange, handleSetNewPassword, backToLogin, handleResendOtp, handleOtpChange,
  } = useAuthFlow(onSuccess);

  const cardContent = (
    <>
        {variant === 'page' && (
          <div className={`text-center ${mode !== 'login' && mode !== 'signup' ? 'mb-6' : 'mb-10'}`}>
            <h1 className="text-2xl font-black text-text-primary leading-tight tracking-tighter uppercase">
              {APP_NAME}
            </h1>
          </div>
        )}

        {mode === 'forgot' ? (
          <form onSubmit={handleSendRecovery} className="space-y-0">
            <p className="text-sm text-text-muted font-medium mb-5 ko-normal">가입한 이메일로 비밀번호 재설정 인증번호를 보내드립니다.</p>
            <AuthInput label="이메일" type="email" placeholder="이메일 주소" value={email} onChange={setEmail} isValid={isEmailValid} errorMsg="올바른 이메일 형식이 아닙니다." showError={email !== ''} />
            {message && <AuthAlert type={message.type}>{message.text}</AuthAlert>}
            <div className="space-y-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:from-surface-disabled disabled:to-surface-disabled text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                {loading ? <Loader2 className="animate-spin" /> : <span>인증번호 받기</span>}
              </button>
            </div>
            <div className="mt-6 text-center">
              <button type="button" onClick={backToLogin} className="flex items-center justify-center gap-2 mx-auto text-text-disabled hover:text-text-secondary font-medium text-sm transition-all">
                <ArrowLeft size={14} />
                로그인으로 돌아가기
              </button>
            </div>
          </form>
        ) : mode === 'recoverVerify' ? (
          <div className="space-y-5">
            <OtpInput length={8} value={otp} onChange={handleRecoveryOtpChange} disabled={loading || isOtpLocked} />
            <div className="text-center space-y-1">
              {message ? (
                <p className={`text-sm font-medium ${message.type === 'error' ? 'text-status-danger-text' : 'text-status-success-text'}`}>{message.text}</p>
              ) : (
                <p className="text-sm text-text-muted font-medium"><span className="text-text-primary">{recoverEmail}</span> 으로 인증번호가 발송되었습니다.</p>
              )}
            </div>
            {loading && (
              <div className="flex justify-center"><Loader2 className="animate-spin text-cta-border" size={24} /></div>
            )}
            <div className="text-center">
              <button
                type="button"
                onClick={handleResendRecovery}
                disabled={loading || resendCooldown > 0}
                className="text-text-disabled hover:text-cta-default font-medium text-sm transition-all disabled:opacity-50"
              >
                {resendCooldown > 0 ? <span className="text-text-secondary">재발송 대기 ({resendCooldown}초)</span> : '인증번호 재발송'}
              </button>
            </div>
            <div className="border-t border-border-dim pt-4">
              <button type="button" onClick={backToLogin} className="w-full flex items-center justify-center gap-2 text-text-disabled hover:text-text-secondary font-medium text-sm transition-all">
                <ArrowLeft size={14} />
                로그인으로 돌아가기
              </button>
            </div>
          </div>
        ) : mode === 'newPassword' ? (
          <form onSubmit={handleSetNewPassword} className="space-y-0">
            <p className="text-sm text-text-muted font-medium mb-5 ko-normal">새 비밀번호를 입력해주세요.</p>
            <AuthInput label="새 비밀번호" type="password" placeholder="새 비밀번호" value={password} onChange={setPassword} isValid={isPasswordValid} errorMsg="6~12자, 대문자, 숫자, 특수문자 포함 필수" showError={password !== ''} />
            <AuthInput label="새 비밀번호 확인" type="password" placeholder="새 비밀번호 확인" value={confirmPassword} onChange={setConfirmPassword} isValid={isConfirmValid} errorMsg="비밀번호가 일치하지 않습니다." showError={confirmPassword !== ''} />
            {message && <AuthAlert type={message.type}>{message.text}</AuthAlert>}
            <div className="space-y-3 pt-2">
              <button
                type="submit"
                disabled={loading || !PASSWORD_REGEX.test(password) || password !== confirmPassword}
                className="w-full bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:from-surface-disabled disabled:to-surface-disabled text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                {loading ? <Loader2 className="animate-spin" /> : <span>비밀번호 변경</span>}
              </button>
            </div>
            <div className="mt-6 text-center">
              <button type="button" onClick={backToLogin} className="flex items-center justify-center gap-2 mx-auto text-text-disabled hover:text-text-secondary font-medium text-sm transition-all">
                <ArrowLeft size={14} />
                취소
              </button>
            </div>
          </form>
        ) : mode === 'verify' ? (
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

              {mode === 'login' && (
                <div className="text-right -mt-2 mb-4">
                  <button type="button" onClick={() => { setMode('forgot'); setMessage(null); setPassword(''); }} className="text-text-disabled hover:text-cta-default font-medium text-xs transition-all">
                    비밀번호를 잊으셨나요?
                  </button>
                </div>
              )}

              {message && <AuthAlert type={message.type}>{message.text}</AuthAlert>}

              <div className="space-y-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:from-surface-disabled disabled:to-surface-disabled text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  {loading ? <Loader2 className="animate-spin" /> : (mode === 'login' ? <><LogIn size={20} /> <span>로그인</span></> : <><UserPlus size={20} /> <span>회원가입</span></>)}
                </button>
              </div>
            </form>

            <div className="mt-6 text-center">
              <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(null); }} className="text-text-disabled hover:text-cta-default font-medium text-sm transition-all">
                {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
              </button>
            </div>
          </>
        )}
    </>
  );

  if (variant === 'modal') return cardContent;

  return (
    <div className="min-h-screen bg-surface-background flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans text-text-primary">
      <div className="w-full max-w-md bg-surface-card/80 border border-border-default backdrop-blur-md rounded-3xl p-8 shadow-elevation-lg relative z-10">
        {cardContent}
      </div>
    </div>
  );
};
