
import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Team } from '../../types';
import { useSaveSummary } from '../../hooks/useSaveSummary';
import { SingleSaveCard } from './SingleSaveCard';
import { MultiPlayCard } from './MultiPlayCard';
import { QuickPlayCard } from './QuickPlayCard';
import { NicknameModal } from './NicknameModal';
import { LogOut, Settings, User } from 'lucide-react';
import { APP_NAME, APP_YEAR } from '../../utils/constants';

interface LobbyPanelProps {
    session:       Session;
    teams:         Team[];
    nickname:      string;
    onContinue:    () => void;
    onNewGame:     () => void;
    onLogout:      () => void;
    onMultiPlay:   () => void;
    onQuickPlay:   () => void;
    quickplayOnly?: boolean;
    /** 가입 직후 최초 진입 시 true — 닉네임 설정 팝업을 자동으로 띄운다 */
    forceNicknameSetup?: boolean;
    /** 닉네임 변경 저장 완료 시 상위(AuthView)로 최신 닉네임 반영 */
    onNicknameChange?: (nickname: string) => void;
}

export const LobbyPanel: React.FC<LobbyPanelProps> = ({
    session, teams, nickname, onContinue, onNewGame, onLogout, onMultiPlay, onQuickPlay, quickplayOnly = false,
    forceNicknameSetup = false, onNicknameChange,
}) => {
    const { data: summary, isLoading } = useSaveSummary(session.user.id);
    const email = session.user.email ?? '';
    const savedTeam = summary ? teams.find(t => t.id === summary.teamId) : undefined;
    const initial = (nickname || email).charAt(0).toUpperCase();

    const [nicknameModalOpen,   setNicknameModalOpen]   = useState(false);
    const [modalIsFirstSetup,   setModalIsFirstSetup]   = useState(false);

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
        <div className="w-full max-w-2xl space-y-5 animate-in fade-in zoom-in-95 duration-300 pretendard">

            {/* 앱 타이틀 */}
            <div className="text-center mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.25em]">
                    {APP_NAME} · {APP_YEAR}
                </p>
            </div>

            {/* 프로필 섹션 */}
            <div className="flex items-center gap-4 bg-slate-800/60 border border-slate-700/50 rounded-2xl px-5 py-4">
                {/* 아바타 */}
                <div className="w-11 h-11 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-lg shrink-0 select-none">
                    {initial || <User size={20} />}
                </div>

                {/* 유저 정보 */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{nickname || 'GM'}</p>
                    <p className="text-xs text-slate-500 truncate">{email}</p>
                </div>

                {/* 설정 (닉네임 변경) */}
                <button
                    onClick={openNicknameSettings}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 shrink-0"
                >
                    <Settings size={13} />
                    <span className="ko-normal">설정</span>
                </button>

                {/* 로그아웃 */}
                <button
                    onClick={onLogout}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10 shrink-0"
                >
                    <LogOut size={13} />
                    <span className="ko-normal">로그아웃</span>
                </button>
            </div>

            {/* 모드 카드 — quickplayOnly는 어드민이 아닌 유저에게 싱글플레이만 숨긴다(멀티/퀵플레이는 항상 노출) */}
            <div className={`grid grid-cols-1 ${quickplayOnly ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-4`}>
                {!quickplayOnly && (
                    isLoading ? (
                        <SkeletonCard />
                    ) : (
                        <SingleSaveCard
                            summary={summary ?? null}
                            teamName={savedTeam?.name}
                            teamLogo={savedTeam?.logo}
                            onContinue={onContinue}
                            onNewGame={onNewGame}
                        />
                    )
                )}
                <MultiPlayCard onClick={onMultiPlay} />
                <QuickPlayCard onClick={onQuickPlay} />
            </div>

            {nicknameModalOpen && (
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

const SkeletonCard: React.FC = () => (
    <div className="rounded-2xl bg-slate-700/30 animate-pulse h-56" />
);
