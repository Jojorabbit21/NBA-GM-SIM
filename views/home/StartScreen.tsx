
import React, { useState, useCallback, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { StartMenu } from './StartMenu';
import { InlineLeagueList } from './InlineLeagueList';
import { LoginModal } from '../../components/auth/LoginModal';
import { supabase } from '../../services/supabaseClient';
import { APP_NAME, APP_YEAR } from '../../utils/constants';

// 라커룸 배경 이미지 — 파일이 없어도 아래 그라데이션 폴백 레이어가 항상 깔려있어 화면이 깨지지 않는다.
const BACKGROUND_IMAGE = '/images/background/background.webp';
const APP_VERSION = 'v1.0.7';
// 클릭해도 아직 아무 동작 없음(리다이렉트 미구현) — 추후 실제 페이지 연결 예정
const FOOTER_LINKS = ['About', 'Terms of Use', 'Privacy', 'Discord'];

interface StartScreenProps {
    session:    Session | null;
    nickname:   string;
    onContinue: () => void;
    onNewGame:  () => void;
    onLogout:   () => void;
    onQuickPlay: () => void;
    quickplayOnly?: boolean;
}

export const StartScreen: React.FC<StartScreenProps> = ({
    session, nickname, onContinue, onNewGame, onLogout, onQuickPlay, quickplayOnly = false,
}) => {
    const [loginModalOpen, setLoginModalOpen] = useState(false);
    const [loginReason, setLoginReason]       = useState<string | undefined>(undefined);
    const [pendingAction, setPendingAction]   = useState<(() => void) | null>(null);
    const [forceNicknameSetup, setForceNicknameSetup] = useState(false);
    // profiles.nickname — 멀티플레이 화면에서 실제로 참조하는 닉네임 소스와 일치시키기 위해
    // AuthPage가 넘기는 user_metadata/이메일 fallback보다 우선한다.
    const [profileNickname, setProfileNickname] = useState<string | null>(null);

    useEffect(() => {
        if (!session?.user?.id) { setProfileNickname(null); return; }
        supabase.from('profiles').select('nickname').eq('id', session.user.id).maybeSingle()
            .then(({ data }) => { if (data?.nickname) setProfileNickname(data.nickname); });
    }, [session?.user?.id]);

    const handleRequireLogin = useCallback((opts?: { reason?: string; after?: () => void }) => {
        setLoginReason(opts?.reason);
        setPendingAction(() => opts?.after ?? null);
        setLoginModalOpen(true);
    }, []);

    const handleLoginSuccess = useCallback((opts: { isFirstSignup: boolean; nickname: string | null }) => {
        setLoginModalOpen(false);
        if (opts.nickname) setProfileNickname(opts.nickname);
        if (opts.isFirstSignup) setForceNicknameSetup(true);
        // 세션 반영(onAuthStateChange)은 이 콜백 직전에 이미 트리거돼 있어, 다음 렌더에서
        // session이 채워진 채로 이어질 동작(참가/새 게임 등)을 그대로 실행할 수 있다.
        const after = pendingAction;
        setPendingAction(null);
        after?.();
    }, [pendingAction]);

    return (
        <div className="h-screen relative overflow-hidden bg-slate-950 flex flex-col">
            {/* 배경 레이어 — 그라데이션 폴백이 항상 깔리고, 그 위에 고정 배경 이미지 한 장 */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black" />
            <div
                // scale-110: 블러가 가장자리를 투명하게 침식시켜 생기는 테두리를 바깥(overflow-hidden)으로 밀어냄
                className="absolute inset-0 bg-cover bg-center scale-110 blur-sm"
                style={{ backgroundImage: `url(${BACKGROUND_IMAGE})` }}
            />
            <div className="absolute inset-0 bg-black/55" />

            {/* 컨텐츠 — 좌: 로그인/모드 선택(자연 높이), 우: 멀티플레이 리그 목록(기존 /multi 로비 화면을
                대체, 푸터 바로 위까지 늘어남). 상단 고정 오프셋(vh 단위) — items-center로 뷰포트 중앙에
                맞추면 로그인/회원가입 폼 높이나 리그 목록 로딩 상태에 따라 블록 높이가 바뀔 때마다
                모달의 y좌표가 같이 흔들렸다. 화면이 넘치면(작은 뷰포트 + 긴 회원가입 폼 등) 이 영역
                자체가 스크롤된다. */}
            <div className="relative z-10 flex-1 min-h-0 overflow-y-auto flex items-start justify-center px-4 pt-[12vh] pb-6">
                <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-6 h-full">
                    {/* 좌측 — 로그인 상태면 우측과 같은 높이로 늘어나(self-stretch) 내부 "참여 중인 리그"가
                        flex-1+스크롤로 동작할 수 있게 하고, 비로그인(로그인 폼만 있을 때)은 자연 높이 유지 */}
                    <div className={`w-full lg:w-[420px] lg:shrink-0 ${session ? 'lg:self-stretch' : 'lg:self-start'}`}>
                        <StartMenu
                            session={session}
                            nickname={profileNickname ?? nickname}
                            onContinue={onContinue}
                            onNewGame={onNewGame}
                            onLogout={onLogout}
                            onQuickPlay={onQuickPlay}
                            quickplayOnly={quickplayOnly}
                            onRequireLogin={handleRequireLogin}
                            onLoginSuccess={handleLoginSuccess}
                            forceNicknameSetup={forceNicknameSetup}
                            onNicknameChange={setProfileNickname}
                        />
                    </div>
                    {/* 우측 — flex-1이 남는 세로 공간을 채워 푸터 바로 위까지 늘어난다(가변 높이 아님) */}
                    <div className="flex-1 min-h-0 min-w-0">
                        <InlineLeagueList session={session} onRequireLogin={handleRequireLogin} />
                    </div>
                </div>
            </div>

            {/* 푸터 — 배경 투명, 컨텐츠 영역 아래 고정 */}
            <footer className="relative z-10 shrink-0 bg-transparent px-4 py-4">
                <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 좌측 50% — 링크 그룹 + 그 아래 카피라이트/버전 */}
                    <div className="text-center sm:text-left space-y-1">
                        <div className="flex items-center justify-center sm:justify-start gap-4">
                            {FOOTER_LINKS.map(label => (
                                <button
                                    key={label}
                                    className="text-xs text-white hover:text-white/70 transition-colors"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-white ko-normal">© {APP_YEAR} {APP_NAME}. All rights reserved.</p>
                        <p className="text-xs text-white ko-normal">{APP_VERSION}</p>
                    </div>

                    {/* 우측 50% — 디스클레이머 */}
                    <div className="text-center sm:text-right">
                        <p className="text-[10px] text-white">
                            Disclaimer: {APP_NAME} is not sponsored by or endorsed by the National Basketball
                            Association, the National Basketball Players Association, any individual NBA players,
                            or any of their affiliates. All league trademarks are property of their respective
                            owners and are used under the doctrine of trademark nominative fair use.
                        </p>
                    </div>
                </div>
            </footer>

            {loginModalOpen && (
                <LoginModal
                    reason={loginReason}
                    onClose={() => { setLoginModalOpen(false); setPendingAction(null); }}
                    onSuccess={handleLoginSuccess}
                />
            )}
        </div>
    );
};
