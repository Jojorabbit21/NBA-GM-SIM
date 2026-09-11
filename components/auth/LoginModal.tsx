
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { AuthForm } from '../../views/auth/AuthForm';
import { APP_NAME, APP_YEAR } from '../../utils/constants';

interface LoginModalProps {
    onClose: () => void;
    onSuccess: (opts: { isFirstSignup: boolean; nickname: string | null }) => void;
    /** 어떤 액션 때문에 로그인이 필요한지 알려주는 한 줄 (예: "싱글플레이 세이브는 계정에 저장됩니다") */
    reason?: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onClose, onSuccess, reason }) => {
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-150"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md bg-surface-card border border-border-default rounded-3xl p-8 shadow-elevation-lg relative animate-in zoom-in-95 duration-200 pretendard"
                onClick={e => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 text-text-disabled hover:text-text-primary transition-colors"
                    aria-label="닫기"
                >
                    <X size={18} />
                </button>

                <div className="text-center mb-6">
                    <h1 className="text-xl font-black text-text-primary leading-tight tracking-tighter uppercase">
                        {APP_NAME}<br />{APP_YEAR}
                    </h1>
                    {reason && (
                        <p className="text-xs text-text-muted mt-3 ko-normal">{reason}</p>
                    )}
                </div>

                <AuthForm variant="modal" onSuccess={onSuccess} />
            </div>
        </div>
    );
};
