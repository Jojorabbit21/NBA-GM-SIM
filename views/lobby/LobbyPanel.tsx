
import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useSaveSummary } from '../../hooks/useSaveSummary';
import { SingleSaveCard } from './SingleSaveCard';
import { MultiPlayCard } from './MultiPlayCard';
import { QuickPlayCard } from './QuickPlayCard';
import { NicknameModal } from './NicknameModal';
import { LogOut, Settings, User } from 'lucide-react';
import { APP_NAME, APP_YEAR, getTeamLogoUrl } from '../../utils/constants';
import { TEAM_DATA } from '../../data/teamData';

interface LobbyPanelProps {
    session:       Session;
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
    session, nickname, onContinue, onNewGame, onLogout, onMultiPlay, onQuickPlay, quickplayOnly = false,
    forceNicknameSetup = false, onNicknameChange,
}) => {
    const { data: summary, isLoading } = useSaveSummary(session.user.id);
    const email = session.user.email ?? '';
    // [2026-09-04] 예전엔 useGameData()의 무거운 baseData(meta_players 전체+시즌 일정, 실측
    // 5.9MB) 결과인 teams prop에서 팀을 찾아 이름/로고를 표시했음 — 이 로비 화면(모드 선택,
    // 아직 싱글플레이에 들어가지도 않은 상태)만 보려고 그 큰 쿼리를 매번 미리 받아야 했던
    // 원인이었다(FA 렉 조사 중 발견). 팀 이름/로고는 DB 없이도 바로 쓸 수 있는 정적
    // TEAM_DATA(하드코딩 fallback, meta_teams로 나중에 덮어써지긴 하지만 이름/로고 표시엔
    // 차이 없음)와 getTeamLogoUrl(로컬스토리지 에디터 오버라이드 → 없으면 /logos/{id}.svg,
    // 역시 DB 무관)로 대체 — 이제 이 화면은 useGameData를 아예 안 기다려도 된다.
    const savedTeamStatic = summary ? TEAM_DATA[summary.teamId] : undefined;
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
                            teamName={savedTeamStatic?.name}
                            teamLogo={summary ? getTeamLogoUrl(summary.teamId) : undefined}
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
