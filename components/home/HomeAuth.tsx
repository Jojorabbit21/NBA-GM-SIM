import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthFlow, type AuthFlow, type AuthSuccess } from '../../hooks/useAuthFlow';
import { BackChevron, CloseX } from './homeIcons';

// 홈 화면의 즉석 로그인 (2026-11-18, 목업 "A. 비로그인"). 로그인하지 않은 상태에서 프로필 상자 자리에 놓인다.
//   desktop — 오른쪽 위에 이메일·비밀번호·로그인이 한 줄, 그 아래 아이디 저장 + 회원가입 · 비밀번호 찾기. 가입·재설정은 작은 팝업
//   phone   — 홈에 메뉴 대신 로그인 입력이 놓이고, 가입·재설정은 전체 화면 시트
// 로직은 기존 로그인 폼과 같은 훅(hooks/useAuthFlow.ts). 인증 코드는 8자리를 다 넣으면 자동으로 확인된다(버튼 없음).
// 아이디 저장: 체크한 채 로그인에 성공하면 이메일만 이 브라우저에 남긴다(비밀번호는 저장하지 않는다).
const SAVED_EMAIL_KEY = 'bm27:savedLoginEmail';
const readSavedEmail = (): string => { try { return window.localStorage.getItem(SAVED_EMAIL_KEY) ?? ''; } catch { return ''; } };
const writeSavedEmail = (email: string | null) => {
    try { if (email) window.localStorage.setItem(SAVED_EMAIL_KEY, email); else window.localStorage.removeItem(SAVED_EMAIL_KEY); } catch { /* 저장소를 못 쓰면 저장만 건너뛴다 */ }
};

const CTA = 'bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center';
const SECONDARY = 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-indigo-600 hover:border-indigo-600 hover:text-white font-bold transition-colors';
const LINK = 'font-bold text-slate-300 hover:text-white hover:underline transition-colors disabled:opacity-50 disabled:no-underline';

type Size = 'compact' | 'touch';
/** 크기 묶음 — compact: 데스크톱(글자 12, 높이 32) / touch: 폰(입력 글자 16, 높이 48) */
const SZ: Record<Size, { input: string; btn: string; text: string; label: string; gap: string }> = {
    compact: { input: 'h-8 px-2.5 rounded-md text-xs', btn: 'h-8 px-3 rounded-md text-xs', text: 'text-xs', label: 'text-xs', gap: 'gap-3' },
    touch:   { input: 'h-12 px-3.5 rounded-lg text-base', btn: 'h-12 px-5 rounded-lg text-base', text: 'text-sm', label: 'text-sm', gap: 'gap-4' },
};
const inputCls = (size: Size, invalid = false) =>
    `${SZ[size].input} w-full bg-slate-950 border text-white placeholder:text-slate-400 outline-none transition-colors focus:border-indigo-400 disabled:opacity-50 ${invalid ? 'border-red-500/70' : 'border-slate-700'}`;

/** 서비스의 커스텀 체크박스(필터 드롭다운과 같은 모양: 16 상자, 켜지면 인디고 + 흰 체크) */
const SaveIdCheckbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; size: Size }> = ({ checked, onChange, size }) => (
    <button
        type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`flex items-center font-bold transition-colors ${checked ? 'text-white' : 'text-slate-400'} ${size === 'touch' ? 'h-11 gap-2.5 text-sm' : 'gap-1.5 text-xs'}`}
    >
        <span className={`shrink-0 rounded border flex items-center justify-center transition-colors ${size === 'touch' ? 'w-5 h-5' : 'w-4 h-4'} ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
            {checked && (
                <svg width={size === 'touch' ? 12 : 10} height={size === 'touch' ? 12 : 10} viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M1.5 5.2 4 7.6 8.5 2.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            )}
        </span>
        아이디 저장
    </button>
);

const Message: React.FC<{ flow: AuthFlow; className?: string }> = ({ flow, className = '' }) => flow.message ? (
    <p role={flow.message.type === 'error' ? 'alert' : 'status'} className={`ko-normal ${flow.message.type === 'error' ? 'text-red-400' : 'text-green-400'} ${className}`}>{flow.message.text}</p>
) : null;

const Stepper: React.FC<{ steps: string[]; current: number; size: Size }> = ({ steps, current, size }) => (
    <ol className={`flex text-xs font-bold ${size === 'touch' ? 'gap-2' : 'gap-1.5'}`}>
        {steps.map((name, i) => (
            <li key={name} aria-current={i === current ? 'step' : undefined} className={`flex-1 border-t-2 ${size === 'touch' ? 'pt-2' : 'pt-1.5'} ${i === current ? 'border-[#00D492] text-[#00D492]' : 'border-slate-700 text-slate-400'}`}>
                {i + 1} {name}
            </li>
        ))}
    </ol>
);

const Field: React.FC<{
    id: string; label: string; type: string; placeholder: string; value: string; onChange: (v: string) => void;
    size: Size; error?: string | null; hint?: string; autoComplete?: string; disabled?: boolean;
}> = ({ id, label, type, placeholder, value, onChange, size, error, hint, autoComplete, disabled }) => (
    <div className={`flex flex-col ${size === 'touch' ? 'gap-1.5' : 'gap-1'}`}>
        <label htmlFor={id} className={`${SZ[size].label} font-bold text-slate-300`}>{label}</label>
        <input id={id} type={type} placeholder={placeholder} value={value} autoComplete={autoComplete} disabled={disabled} onChange={e => onChange(e.target.value)} className={inputCls(size, !!error)} />
        {error ? <span className="text-xs text-red-400 ko-normal">{error}</span> : hint ? <span className="text-xs text-slate-400 ko-normal">{hint}</span> : null}
    </div>
);

const PASSWORD_HINT = '6~12자, 대문자, 숫자, 특수문자 포함';
const SIGNUP_STEPS = ['정보 입력', '인증 코드'];
const RESET_STEPS = ['이메일', '인증 코드', '새 비밀번호'];

/** 가입·재설정 단계의 내용(팝업과 폰 시트가 같이 쓴다) */
const FlowBody: React.FC<{ flow: AuthFlow; size: Size; idPrefix: string }> = ({ flow, size, idPrefix }) => {
    const { mode, loading } = flow;
    const isSignup = mode === 'signup' || mode === 'verify';
    const stepIndex = mode === 'signup' || mode === 'forgot' ? 0 : mode === 'verify' || mode === 'recoverVerify' ? 1 : 2;
    const sz = SZ[size];
    const submitCls = `${CTA} ${sz.btn} w-full`;
    const spinner = <Loader2 size={size === 'touch' ? 18 : 14} className="animate-spin" />;

    const codeStep = (sentTo: string, onChange: (v: string) => void, onResend: () => void) => (
        <div className={`flex flex-col ${sz.gap}`}>
            {flow.message
                ? <Message flow={flow} className={`${sz.text} leading-normal`} />
                : <p className={`${sz.text} leading-normal text-slate-300 ko-normal`}><span className="text-white break-all">{sentTo}</span> 으로 인증 코드를 보냈습니다.</p>}
            <div className={`flex flex-col ${size === 'touch' ? 'gap-1.5' : 'gap-1'}`}>
                <label htmlFor={`${idPrefix}-code`} className={`${sz.label} font-bold text-slate-300`}>인증 코드</label>
                <div className="relative">
                    <input
                        id={`${idPrefix}-code`} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="8자리 코드"
                        value={flow.otp} disabled={loading || flow.isOtpLocked}
                        // 붙여 넣은 코드에 공백·하이픈이 섞여 있어도 숫자만 남긴다
                        onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                        className={`${inputCls(size)} tabular-nums tracking-[0.2em] placeholder:tracking-normal`}
                    />
                    {loading && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">{spinner}</span>}
                </div>
            </div>
            <button type="button" onClick={onResend} disabled={loading || flow.resendCooldown > 0} className={`${LINK} ${sz.text} self-start ${size === 'touch' ? 'h-11' : ''}`}>
                {flow.resendCooldown > 0 ? `코드 다시 받기 (${flow.resendCooldown}초)` : '코드 다시 받기'}
            </button>
        </div>
    );

    return (
        <div className={`flex flex-col ${sz.gap}`}>
            <Stepper steps={isSignup ? SIGNUP_STEPS : RESET_STEPS} current={stepIndex} size={size} />

            {mode === 'signup' && (
                <form onSubmit={flow.handleAuth} className={`flex flex-col ${sz.gap}`}>
                    <Field id={`${idPrefix}-email`} label="이메일" type="email" placeholder="이메일 주소" autoComplete="username" value={flow.email} onChange={flow.setEmail} size={size}
                        error={flow.email !== '' && !flow.isEmailValid ? '올바른 이메일 형식이 아닙니다.' : null} />
                    <Field id={`${idPrefix}-pw`} label="비밀번호" type="password" placeholder="비밀번호" autoComplete="new-password" value={flow.password} onChange={flow.setPassword} size={size}
                        hint={PASSWORD_HINT} error={flow.password !== '' && !flow.isPasswordValid ? `${PASSWORD_HINT} 필수` : null} />
                    <Field id={`${idPrefix}-pw2`} label="비밀번호 확인" type="password" placeholder="비밀번호 다시 입력" autoComplete="new-password" value={flow.confirmPassword} onChange={flow.setConfirmPassword} size={size}
                        error={flow.confirmPassword !== '' && !flow.isConfirmValid ? '비밀번호가 일치하지 않습니다.' : null} />
                    <Message flow={flow} className={sz.text} />
                    <button type="submit" disabled={loading || !flow.isSignupFormValid} className={submitCls}>{loading ? spinner : '인증 메일 받기'}</button>
                </form>
            )}

            {mode === 'verify' && codeStep(flow.signupEmail, flow.handleOtpChange, flow.handleResendOtp)}

            {mode === 'forgot' && (
                <form onSubmit={flow.handleSendRecovery} className={`flex flex-col ${sz.gap}`}>
                    <Field id={`${idPrefix}-remail`} label="가입한 이메일" type="email" placeholder="이메일 주소" autoComplete="username" value={flow.email} onChange={flow.setEmail} size={size}
                        error={flow.email !== '' && !flow.isEmailValid ? '올바른 이메일 형식이 아닙니다.' : null} />
                    <Message flow={flow} className={sz.text} />
                    <button type="submit" disabled={loading} className={submitCls}>{loading ? spinner : '인증 코드 받기'}</button>
                </form>
            )}

            {mode === 'recoverVerify' && codeStep(flow.recoverEmail, flow.handleRecoveryOtpChange, flow.handleResendRecovery)}

            {mode === 'newPassword' && (
                <form onSubmit={flow.handleSetNewPassword} className={`flex flex-col ${sz.gap}`}>
                    <Field id={`${idPrefix}-npw`} label="새 비밀번호" type="password" placeholder="새 비밀번호" autoComplete="new-password" value={flow.password} onChange={flow.setPassword} size={size}
                        hint={PASSWORD_HINT} error={flow.password !== '' && !flow.isPasswordValid ? `${PASSWORD_HINT} 필수` : null} />
                    <Field id={`${idPrefix}-npw2`} label="새 비밀번호 확인" type="password" placeholder="새 비밀번호 다시 입력" autoComplete="new-password" value={flow.confirmPassword} onChange={flow.setConfirmPassword} size={size}
                        error={flow.confirmPassword !== '' && !flow.isConfirmValid ? '비밀번호가 일치하지 않습니다.' : null} />
                    <Message flow={flow} className={sz.text} />
                    <button type="submit" disabled={loading || flow.password === '' || !flow.isPasswordValid || flow.password !== flow.confirmPassword} className={submitCls}>{loading ? spinner : '비밀번호 변경'}</button>
                </form>
            )}
        </div>
    );
};

export const HomeAuth: React.FC<{ variant: 'desktop' | 'phone'; onSuccess: AuthSuccess }> = ({ variant, onSuccess }) => {
    const [saveId, setSaveId] = useState(() => readSavedEmail() !== '');
    // 로그인 성공 시점의 값으로 저장 여부를 정한다(훅에 넘긴 콜백이 오래된 값을 잡지 않게 ref 로)
    const saveRef = useRef({ saveId, email: '' });
    const flow = useAuthFlow((opts) => {
        const { saveId: save, email } = saveRef.current;
        writeSavedEmail(save && email ? email : null);
        onSuccess(opts);
    });
    saveRef.current = { saveId, email: flow.email };

    const pwRef = useRef<HTMLInputElement>(null);
    // 저장해 둔 이메일이 있으면 미리 채우고 커서는 비밀번호 칸에
    useEffect(() => {
        const saved = readSavedEmail();
        if (saved) { flow.setEmail(saved); if (variant === 'desktop') pwRef.current?.focus(); }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const { mode, loading } = flow;
    const flowOpen = mode !== 'login';
    const isSignup = mode === 'signup' || mode === 'verify';
    const title = isSignup ? '회원가입' : '비밀번호 찾기';

    const openSignup = () => { flow.setMessage(null); flow.setPassword(''); flow.setConfirmPassword(''); flow.setMode('signup'); };
    const openReset = () => { flow.setMessage(null); flow.setPassword(''); flow.setMode('forgot'); };
    // 닫기 — 재설정 중이면 임시 세션을 버린다(backToLogin 이 처리)
    const closeFlow = () => { void flow.backToLogin(); };

    const size: Size = variant === 'phone' ? 'touch' : 'compact';
    const links = (
        <>
            <button type="button" onClick={openSignup} className={`${LINK} ${variant === 'phone' ? 'h-11 px-1 text-sm' : 'text-xs'}`}>회원가입</button>
            <span aria-hidden="true" className={`w-px bg-slate-600 ${variant === 'phone' ? 'h-3' : 'h-2.5'}`} />
            <button type="button" onClick={openReset} className={`${LINK} ${variant === 'phone' ? 'h-11 px-1 text-sm' : 'text-xs'}`}>비밀번호 찾기</button>
        </>
    );
    const loginMessage = mode === 'login' ? <Message flow={flow} className={variant === 'phone' ? 'text-sm' : 'text-xs text-right'} /> : null;

    if (variant === 'phone') {
        return (
            <>
                <form aria-label="로그인" onSubmit={flow.handleAuth} className="w-full flex flex-col gap-3">
                    <label htmlFor="home-login-email" className="sr-only">이메일</label>
                    <input id="home-login-email" type="email" placeholder="이메일" autoComplete="username" value={flow.email} onChange={e => flow.setEmail(e.target.value)} className={inputCls('touch')} />
                    <label htmlFor="home-login-pw" className="sr-only">비밀번호</label>
                    <input id="home-login-pw" type="password" placeholder="비밀번호" autoComplete="current-password" value={mode === 'login' ? flow.password : ''} onChange={e => flow.setPassword(e.target.value)} className={inputCls('touch')} />
                    <div className="self-start"><SaveIdCheckbox checked={saveId} onChange={setSaveId} size="touch" /></div>
                    {loginMessage}
                    <button type="submit" disabled={loading && mode === 'login'} className={`${CTA} h-12 rounded-lg text-base`}>
                        {loading && mode === 'login' ? <Loader2 size={18} className="animate-spin" /> : '로그인'}
                    </button>
                    <div className="flex items-center justify-center gap-3">{links}</div>
                </form>

                {flowOpen && (
                    <section role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-modal bg-slate-950 flex flex-col animate-in slide-in-from-right duration-300 motion-reduce:animate-none">
                        <div className="shrink-0 h-14 px-1 flex items-center bg-slate-900 border-b border-slate-800">
                            <button type="button" onClick={closeFlow} aria-label="로그인으로 돌아가기" className="h-11 px-3 flex items-center gap-3 text-white">
                                <BackChevron />
                                <span className="text-xl font-bold leading-none">{title}</span>
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-8">
                            <FlowBody flow={flow} size="touch" idPrefix="home-flow" />
                        </div>
                    </section>
                )}
            </>
        );
    }

    return (
        <>
            <form aria-label="로그인" onSubmit={flow.handleAuth} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1">
                    <label htmlFor="home-login-email" className="sr-only">이메일</label>
                    <input id="home-login-email" type="email" placeholder="이메일" autoComplete="username" value={flow.email} onChange={e => flow.setEmail(e.target.value)} className={`${inputCls('compact')} !w-40`} />
                    <label htmlFor="home-login-pw" className="sr-only">비밀번호</label>
                    <input id="home-login-pw" ref={pwRef} type="password" placeholder="비밀번호" autoComplete="current-password" value={mode === 'login' ? flow.password : ''} onChange={e => flow.setPassword(e.target.value)} className={`${inputCls('compact')} !w-[116px]`} />
                    <button type="submit" disabled={loading && mode === 'login'} className={`${CTA} h-8 px-3 rounded-md text-xs whitespace-nowrap min-w-[52px]`}>
                        {loading && mode === 'login' ? <Loader2 size={14} className="animate-spin" /> : '로그인'}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="mr-auto"><SaveIdCheckbox checked={saveId} onChange={setSaveId} size="compact" /></span>
                    {links}
                </div>
                {loginMessage}
            </form>

            {flowOpen && (
                <div className="fixed inset-0 z-modal bg-slate-950/70 flex items-center justify-center p-6" onMouseDown={e => { if (e.target === e.currentTarget) closeFlow(); }}>
                    <section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-[320px] bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 text-white animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold">{title}</h2>
                            <button type="button" onClick={closeFlow} aria-label="닫기" className="w-8 h-8 -my-1.5 -mr-2 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors"><CloseX size={14} /></button>
                        </div>
                        <FlowBody flow={flow} size="compact" idPrefix="home-flow" />
                        {(mode === 'signup' || mode === 'forgot') && (
                            <button type="button" onClick={closeFlow} className={`${SECONDARY} h-8 rounded-md text-xs`}>취소</button>
                        )}
                    </section>
                </div>
            )}
        </>
    );
};
