
import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { NicknameModal } from '../lobby/NicknameModal';
import { MyLeagues } from './MyLeagues';
import { MultiplayerHistory } from './MultiplayerHistory';
import { AuthForm } from '../auth/AuthForm';
import { LogOut, Settings, User } from 'lucide-react';
import { APP_NAME } from '../../utils/constants';

interface StartMenuProps {
    session:    Session | null;
    nickname:   string;
    onContinue: () => void;
    onNewGame:  () => void;
    onLogout:   () => void;
    onQuickPlay: () => void;
    quickplayOnly?: boolean;
    /** 비로그인 상태에서 로그인이 필요한 동작을 시도했을 때 호출 — after는 로그인 성공 후 이어서 실행할 동작 */
    onRequireLogin: (opts?: { reason?: string; after?: () => void }) => void;
    /** 인라인 로그인 폼에서 로그인/회원가입이 완료됐을 때 호출 (pendingAction 없이 바로 호출) */
    onLoginSuccess: (opts: { isFirstSignup: boolean; nickname: string | null }) => void;
    /** 가입 직후 최초 진입 시 true — 닉네임 설정 팝업을 자동으로 띄운다 */
    forceNicknameSetup?: boolean;
    /** 닉네임 변경 저장 완료 시 상위로 최신 닉네임 반영 */
    onNicknameChange?: (nickname: string) => void;
}

export const StartMenu: React.FC<StartMenuProps> = ({
    session, nickname, onLogout, onLoginSuccess, forceNicknameSetup = false, onNicknameChange,
}) => {
    const email = session?.user.email ?? '';
    const initial = (nickname || email).charAt(0).toUpperCase();

    const [nicknameModalOpen, setNicknameModalOpen] = useState(false);
    const [modalIsFirstSetup, setModalIsFirstSetup] = useState(false);

    // 가입 직후(profiles row가 방금 생성된 경우) 닉네임 설정 팝업을 한 번 자동으로 띄운다
    useEffect(() => {
        if (forceNicknameSetup) {
            setModalIsFirstSetup(true);
            setNicknameModalOpen(true);
        }
    }, [forceNicknameSetup]);

    const openNicknameSettings = () => {
        setModalIsFirstSetup(false);
        setNicknameModalOpen(true);
    };

    return (
        <div className="w-full h-full bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-300 pretendard">

            {/* 로고 */}
            <div className="shrink-0 flex justify-center py-2">
                <img src="/logos/main.svg" alt={APP_NAME} className="h-9 w-auto" />
            </div>

            {/* 계정 영역 */}
            {session ? (
                <div className="shrink-0 flex items-center gap-4 pb-5 border-b border-slate-700/50">
                    <div className="w-11 h-11 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-lg shrink-0 select-none">
                        {initial || <User size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{nickname || 'GM'}</p>
                        <p className="text-xs text-slate-500 truncate">{email}</p>
                    </div>
                    <button
                        onClick={openNicknameSettings}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 shrink-0"
                    >
                        <Settings size={13} />
                        <span className="ko-normal">설정</span>
                    </button>
                    <button
                        onClick={onLogout}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10 shrink-0"
                    >
                        <LogOut size={13} />
                        <span className="ko-normal">로그아웃</span>
                    </button>
                </div>
            ) : (
                <div className="shrink-0">
                    <AuthForm variant="modal" onSuccess={onLoginSuccess} />
                </div>
            )}

            {/* 멀티플레이 통산 전적 — 로그인 상태에서만, 프로필 모듈 바로 아래. 접으면(collapsed)
                아래 참여 중인 리그 영역(flex-1)이 그만큼 넓어진다 */}
            {session && <MultiplayerHistory userId={session.user.id} />}

            {/* 참여 중인 리그/토너먼트 — 로그인 상태에서만. flex-1로 남는 공간을 전부 차지하고,
                내용이 넘치면 패널 전체가 아니라 이 영역 안에서만 스크롤된다 */}
            {session && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <MyLeagues userId={session.user.id} />
                </div>
            )}

            {/* 싱글플레이/퀵플레이 — 임시 비활성화(사용 불가), 멀티플레이는 우측 InlineLeagueList로 대체 */}

            {nicknameModalOpen && session && (
                <NicknameModal
                    userId={session.user.id}
                    email={email}
                    currentNickname={nickname}
                    isFirstSetup={modalIsFirstSetup}
                    onClose={() => setNicknameModalOpen(false)}
                    onSaved={(newNickname) => onNicknameChange?.(newNickname)}
                />
            )}
        </div>
    );
};
