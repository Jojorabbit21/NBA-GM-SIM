
import React, { useState } from 'react';
import { Loader2, UserCircle2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

const MAX_NICKNAME_LENGTH = 8;

interface NicknameModalProps {
    userId: string;
    email: string;
    currentNickname: string;
    isFirstSetup?: boolean;
    onClose: () => void;
    onSaved: (nickname: string) => void;
}

export const NicknameModal: React.FC<NicknameModalProps> = ({
    userId, email, currentNickname, isFirstSetup = false, onClose, onSaved,
}) => {
    const [value, setValue]   = useState(currentNickname);
    const [saving, setSaving] = useState(false);
    const [err, setErr]       = useState<string | null>(null);

    const trimmed = value.trim();
    const isValid = trimmed.length > 0 && trimmed.length <= MAX_NICKNAME_LENGTH;

    const handleSave = async () => {
        if (!isValid || saving) return;
        setSaving(true);
        setErr(null);
        const { error } = await supabase.from('profiles').upsert({ id: userId, email, nickname: trimmed });
        setSaving(false);
        if (error) { setErr('저장에 실패했습니다. 다시 시도해주세요.'); return; }
        onSaved(trimmed);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xs p-6 space-y-5">
                <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-indigo-500/15 flex items-center justify-center">
                        <UserCircle2 size={16} className="text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white ko-tight">닉네임 설정</h3>
                        <p className="text-xs text-slate-400 ko-normal mt-0.5">
                            {isFirstSetup ? '멀티플레이에서 사용할 닉네임을 정해주세요' : '멀티플레이에서 표시될 닉네임을 변경합니다'}
                        </p>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <input
                        autoFocus
                        value={value}
                        onChange={e => setValue(e.target.value.slice(0, MAX_NICKNAME_LENGTH))}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                        maxLength={MAX_NICKNAME_LENGTH}
                        placeholder="닉네임 입력"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 ko-normal"
                    />
                    <div className="flex items-center justify-between px-0.5">
                        <span className="text-[11px] text-slate-600 ko-normal">한글 기준 8자 이하</span>
                        <span className="text-[11px] font-mono text-slate-500">
                            {trimmed.length}/{MAX_NICKNAME_LENGTH}
                        </span>
                    </div>
                </div>

                {err && <p className="text-xs text-red-400 ko-normal">{err}</p>}

                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                        {isFirstSetup ? '나중에' : '취소'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!isValid || saving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving
                            ? <span className="flex items-center justify-center gap-1.5"><Loader2 size={13} className="animate-spin" />저장 중…</span>
                            : '저장'
                        }
                    </button>
                </div>
            </div>
        </div>
    );
};
