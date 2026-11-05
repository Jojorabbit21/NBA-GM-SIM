
import React, { useState } from 'react';
import { actionFailure } from '../../services/notifications/actionErrorCatalog';
import { InlineNotice } from '../../components/common/InlineNotice';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { isImeComposing } from '../../utils/ime';
import { ProfileAvatar } from '../../components/common/ProfileAvatar';
import { AVATAR_COLORS, DEFAULT_AVATAR_COLOR } from '../../utils/avatarColors';
import { MY_PROFILE_KEY } from '../../hooks/useMyProfile';

const MAX_NICKNAME_LENGTH = 8;

interface NicknameModalProps {
    userId: string;
    email: string;
    currentNickname: string;
    /** [2026-11-05] 현재 프로필 색(profiles.avatar_color) — 없으면 기본색 */
    currentAvatarColor?: string | null;
    isFirstSetup?: boolean;
    onClose: () => void;
    onSaved: (nickname: string) => void;
}

export const NicknameModal: React.FC<NicknameModalProps> = ({
    userId, email, currentNickname, currentAvatarColor, isFirstSetup = false, onClose, onSaved,
}) => {
    const [value, setValue]   = useState(currentNickname);
    const [color, setColor]   = useState(currentAvatarColor || DEFAULT_AVATAR_COLOR);
    const queryClient = useQueryClient();
    const [saving, setSaving] = useState(false);
    const [err, setErr]       = useState<string | null>(null);

    const trimmed = value.trim();
    const isValid = trimmed.length > 0 && trimmed.length <= MAX_NICKNAME_LENGTH;

    const handleSave = async () => {
        if (!isValid || saving) return;
        setSaving(true);
        setErr(null);
        // [2026-10-13] profiles upsert + league_teams.nickname 동기화를 RPC 하나(set_my_nickname, 트랜잭션)로.
        // 예전엔 두 번 쓰고 두 번째 실패를 무시해 프로필만 바뀌는 "부분 저장"이 가능했다. 본인(auth.uid()) 행만 갱신.
        const { error } = await supabase.rpc('set_my_nickname', { p_nickname: trimmed, p_email: email, p_avatar_color: color });
        setSaving(false);
        if (error) {
            const msg = error.message ?? '';
            if (msg.includes('invalid_nickname')) setErr('닉네임은 1~8자여야 합니다.');
            else if (msg.includes('invalid_avatar_color')) setErr('프로필 색을 다시 선택하세요.');
            else if (msg.includes('not_authenticated')) setErr('로그인이 만료되었습니다. 다시 로그인하세요.');
            else setErr(actionFailure(error, '닉네임 저장'));
            return;
        }
        queryClient.invalidateQueries({ queryKey: MY_PROFILE_KEY(userId) });
        onSaved(trimmed);
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xs p-6 space-y-5">
                <div className="flex items-center gap-3">
                    <ProfileAvatar nickname={trimmed} email={email} colorKey={color} size={36} />
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
                        onKeyDown={e => { if (e.key === 'Enter' && !isImeComposing(e)) handleSave(); }}
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

                {/* [2026-11-05] 프로필 아이콘 배경색 — 사이드바·로비 프로필 아이콘 */}
                <div className="space-y-2">
                    <span className="block text-xs font-bold text-slate-400 ko-normal px-0.5">프로필 색</span>
                    <div className="flex flex-wrap gap-2">
                        {AVATAR_COLORS.map(c => (
                            <button
                                key={c.key}
                                type="button"
                                title={c.label}
                                onClick={() => setColor(c.key)}
                                className={`w-7 h-7 rounded-full ${c.bg} transition-shadow ${color === c.key ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:ring-2 hover:ring-slate-500 hover:ring-offset-2 hover:ring-offset-slate-900'}`}
                            />
                        ))}
                    </div>
                </div>

                {err && <InlineNotice tone="danger" size="sm">{err}</InlineNotice>}

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
        </div>,
        document.body,
    );
};
