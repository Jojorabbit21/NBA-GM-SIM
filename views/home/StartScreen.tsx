import React, { useState, useCallback, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useLocation, useNavigate } from 'react-router-dom';
import { LEGAL_PATHS, LEGAL_TABS, LegalContent, type LegalKind } from './LegalContent';
import { InlineLeagueList } from './InlineLeagueList';
import { NicknameModal } from '../lobby/NicknameModal';
import { LoginModal } from '../../components/auth/LoginModal';
import { ProfileAvatar } from '../../components/common/ProfileAvatar';
import { ShopCartIcon } from '../../components/home/homeIcons';
import { HomeAuth } from '../../components/home/HomeAuth';
import { supabase } from '../../services/supabaseClient';
import { useMyProfile } from '../../hooks/useMyProfile';
import { useWallet } from '../../hooks/usePoints';
import { useViewportClass } from '../../hooks/useViewportClass';
import { POINTS_ICON_URL, formatPoints } from '../../services/points/pointsService';
import { APP_NAME, APP_YEAR, getLeagueLogoUrl } from '../../utils/constants';
import { APP_VERSION, FOOTER_LINKS, getServiceDisclaimer } from '../../utils/serviceInfo';

const BACKGROUND_IMAGE = '/images/background/background.webp';

interface StartScreenProps {
    session:    Session | null;
    nickname:   string;
    onContinue: () => void;
    onNewGame:  () => void;
    onLogout:   () => void;
    onQuickPlay: () => void;
    quickplayOnly?: boolean;
}

// [2026-11-18] 홈 리디자인(목업 A안) — 게임 타이틀 화면. 왼쪽 큰 세로 메뉴, 오른쪽 무대(위: 프로필·SHOP, 아래: 메뉴를 누르면
// 오른쪽에서 날아 들어오는 패널). 폰은 로고·메뉴가 화면 중앙, 패널은 전체 화면 시트.
// 싱글플레이는 비활성 단계라 NEW GAME · LOAD GAME 은 흐리게 두고 누를 수 없다. 프로필·인벤토리·전적·BP 내역은 /profile, 상점은 /shop.
// 예전 좌측 패널(StartMenu: 계정·BP·통산 전적·참여 중인 리그)은 프로필 화면과 세션 목록으로 흩어졌다.
const MENU_FONT = 'font-display leading-[0.95] tracking-[0.02em] whitespace-nowrap';

export const StartScreen: React.FC<StartScreenProps> = ({ session, nickname, onLogout }) => {
    const navigate = useNavigate();
    const viewport = useViewportClass();
    const isPhone = viewport === 'phone';
    const legalKind = LEGAL_PATHS[useLocation().pathname.replace(/\/+$/, '')] ?? null;
    const userId = session?.user?.id ?? null;
    const email = session?.user?.email ?? '';

    const [leaguesOpen, setLeaguesOpen] = useState(false);
    const [loginModalOpen, setLoginModalOpen] = useState(false);
    const [loginReason, setLoginReason]       = useState<string | undefined>(undefined);
    const [pendingAction, setPendingAction]   = useState<(() => void) | null>(null);
    const [nicknameSetupOpen, setNicknameSetupOpen] = useState(false);
    const [profileNickname, setProfileNickname] = useState<string | null>(null);

    const [panelContent, setPanelContent] = useState<'leagues' | LegalKind>(legalKind ?? 'leagues');
    useEffect(() => {
        if (legalKind) setPanelContent(legalKind);
        else if (leaguesOpen) setPanelContent('leagues');
        // 둘 다 아니면(닫히는 중) 그대로 둔다
    }, [legalKind, leaguesOpen]);

    const { data: myProfile } = useMyProfile(userId);
    const { data: wallet } = useWallet(userId);

    useEffect(() => {
        if (!userId) { setProfileNickname(null); return; }
        supabase.from('profiles').select('nickname').eq('id', userId).maybeSingle()
            .then(({ data }) => { if (data?.nickname) setProfileNickname(data.nickname); });
    }, [userId]);

    const handleRequireLogin = useCallback((opts?: { reason?: string; after?: () => void }) => {
        setLoginReason(opts?.reason);
        setPendingAction(() => opts?.after ?? null);
        setLoginModalOpen(true);
    }, []);

    const handleLoginSuccess = useCallback((opts: { isFirstSignup: boolean; nickname: string | null }) => {
        setLoginModalOpen(false);
        if (opts.nickname) setProfileNickname(opts.nickname);
        // 가입 직후(profiles 행이 방금 생긴 경우) 닉네임 설정 팝업을 한 번 띄운다
        if (opts.isFirstSignup) setNicknameSetupOpen(true);
        const after = pendingAction;
        setPendingAction(null);
        after?.();
    }, [pendingAction]);

    const displayName = profileNickname ?? myProfile?.nickname ?? nickname ?? '';
    // 패널: 약관 문서(경로로 열림)가 우선, 아니면 세션 목록
    const panelOpen = !!legalKind || leaguesOpen;
    const closePanel = () => { if (legalKind) navigate('/'); setLeaguesOpen(false); };
    const toggleLeagues = () => { if (legalKind) { navigate('/'); setLeaguesOpen(true); } else setLeaguesOpen(o => !o); };

    const chipBase = 'bg-slate-900/90 border border-slate-800 rounded-lg text-white transition-colors hover:border-slate-600';
    const chipH = isPhone ? 'h-11' : 'h-10';
    // 오른쪽 위 — 로그인 상태: 프로필 상자 + SHOP / 비로그인(데스크톱): 즉석 로그인 줄만(SHOP 없음). 폰 비로그인은 아래에서 따로 그린다
    const chips = session ? (
        <div className={`flex items-center gap-2 ${isPhone ? 'w-full justify-between' : ''}`}>
            {/* 프로필 모듈 — 왼쪽: 프로필로 가는 버튼(아바타·이름·BP), 오른쪽: 로그아웃. 로그인 줄처럼 여백을 줄인 크기(데스크톱 40, 폰은 터치 44) */}
            <div className={`${chipBase} ${chipH} flex items-stretch overflow-hidden`}>
                <button onClick={() => navigate('/profile')} aria-label="내 프로필" className="pl-1.5 pr-2.5 flex items-center gap-2 text-left hover:bg-white/5 transition-colors">
                    <ProfileAvatar nickname={displayName} email={email} colorKey={myProfile?.avatar_color} text={myProfile?.avatar_text} logo={myProfile?.avatar_logo} size={isPhone ? 32 : 28} />
                    <span className="flex flex-col min-w-0">
                        <span className="text-sm font-bold leading-tight truncate max-w-[120px]">{displayName || 'GM'}</span>
                        <span className="flex items-center gap-1 text-[11px] font-bold leading-tight text-slate-300 tabular-nums">
                            <img src={POINTS_ICON_URL} alt="" width={10} height={10} />
                            {wallet ? formatPoints(wallet.balance) : '—'}
                        </span>
                    </span>
                </button>
                <button onClick={onLogout} className="px-2.5 border-l border-slate-800 text-xs font-bold text-slate-300 hover:text-red-300 hover:bg-red-500/10 transition-colors whitespace-nowrap">
                    로그아웃
                </button>
            </div>
            {/* SHOP — 프로필 모듈보다 한 단계 밝은 바탕으로 눈에 띄게 */}
            <button onClick={() => navigate('/shop')} className={`${chipH} px-2.5 flex items-center gap-1.5 rounded-lg bg-slate-700 border border-slate-500 text-white text-xs font-bold tracking-[0.06em] transition-colors hover:bg-slate-600 hover:border-slate-400`}>
                <ShopCartIcon size={18} />
                SHOP
            </button>
        </div>
    ) : (
        <HomeAuth variant="desktop" onSuccess={handleLoginSuccess} />
    );

    // 타이틀 — 서비스 로고 이미지(public/logos/league/Main.svg)
    const logo = (
        <img src={getLeagueLogoUrl('Main')} alt={APP_NAME} className={`w-auto select-none ${isPhone ? 'h-16' : 'h-[72px] self-start'}`} draggable={false} />
    );

    const menuSize = isPhone ? 'text-[52px] h-[60px]' : 'text-[60px] py-2';
    const menu = (
        <nav aria-label="메인 메뉴" className={`flex flex-col gap-1 ${isPhone ? 'items-center' : 'items-start gap-2'}`}>
            {/* NEW GAME — 비활성. 옆(폰은 위)에 준비 중 말풍선을 항상 띄운다(터치 기기엔 호버가 없다) */}
            <span className={`relative flex ${isPhone ? 'flex-col items-center' : 'items-center gap-4'}`}>
                <span aria-disabled="true" className={`${MENU_FONT} ${menuSize} flex items-center text-slate-600 select-none cursor-default`}>New Game</span>
                <span role="note" className={`relative px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 whitespace-nowrap ko-normal ${isPhone ? 'order-first mb-2' : ''}`}>
                    현재 싱글플레이어는 준비 중에 있습니다.
                    {/* 꼬리 — 메뉴 글자 쪽을 가리킨다 */}
                    <span aria-hidden="true" className={`absolute w-2.5 h-2.5 bg-slate-800 border-slate-700 rotate-45 ${isPhone ? 'left-1/2 -translate-x-1/2 -bottom-[6px] border-r border-b' : 'top-1/2 -translate-y-1/2 -left-[6px] border-l border-b'}`} />
                </span>
            </span>
            <span aria-disabled="true" className={`${MENU_FONT} ${menuSize} flex items-center text-slate-600 select-none cursor-default`}>Load Game</span>
            <button
                type="button" onClick={toggleLeagues} aria-expanded={leaguesOpen && !legalKind}
                className={`${MENU_FONT} ${menuSize} flex items-center transition-colors hover:text-[#00D492] ${leaguesOpen && !legalKind && !isPhone ? 'text-[#00D492]' : 'text-white'}`}
            >
                Online Leagues
            </button>
            {/* [2026-11-23] Quick Game — 두 팀을 골라 브라우저 안에서 바로 한 경기(저장 없음, pages/QuickGamePage.tsx) */}
            <button
                type="button" onClick={() => navigate('/quick')}
                className={`${MENU_FONT} ${menuSize} flex items-center text-white transition-colors hover:text-[#00D492]`}
            >
                Quick Game
            </button>
        </nav>
    );

    const footerLinks = (
        <div className={`flex flex-wrap items-center text-xs font-bold ${isPhone ? 'gap-4' : 'gap-5'}`}>
            {FOOTER_LINKS.map(({ label, path, href }) => href ? (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white transition-colors">{label}</a>
            ) : (
                <button key={label} onClick={() => { if (path) navigate(path); }} className="text-slate-300 hover:text-white transition-colors">{label}</button>
            ))}
        </div>
    );
    const copyright = <span className="text-xs text-slate-400 ko-normal">© {APP_YEAR} {APP_NAME}. All rights reserved. · {APP_VERSION}</span>;

    // 패널 내용은 닫히는 동안에도 마지막에 보던 것을 유지한다. 약관에서 뒤로 가면 경로가 먼저 바뀌는데, 그 순간 내용을
    // 세션 목록으로 바꾸면 패널이 나가는 동안 목록이 잠깐 비친다. 세션 목록은 숨긴 채 계속 마운트해 둔다(다시 열 때 이미 준비돼 있게).
    const showLegal = panelContent !== 'leagues';
    const panelBody = (
        <>
            {showLegal && (
                <LegalContent kind={panelContent as LegalKind} onBack={() => navigate('/')} onSelect={(k) => navigate(LEGAL_TABS.find(t => t.kind === k)!.path)} />
            )}
            <div className={showLegal ? 'hidden' : 'contents'}>
                <InlineLeagueList session={session} onRequireLogin={handleRequireLogin} variant={isPhone ? 'sheet' : 'panel'} onClose={closePanel} />
            </div>
        </>
    );

    const modals = (
        <>
            {loginModalOpen && (
                <LoginModal reason={loginReason} onClose={() => { setLoginModalOpen(false); setPendingAction(null); }} onSuccess={handleLoginSuccess} />
            )}
            {nicknameSetupOpen && session && (
                <NicknameModal
                    userId={session.user.id} email={email} currentNickname={displayName} currentAvatarColor={myProfile?.avatar_color}
                    isFirstSetup onClose={() => setNicknameSetupOpen(false)} onSaved={setProfileNickname}
                />
            )}
        </>
    );

    // ── 폰 ──────────────────────────────────────────────────────────────────────
    if (isPhone) {
        return (
            <div className="h-dvh relative overflow-hidden bg-slate-950 pretendard text-white">
                <div className="absolute inset-0 bg-cover opacity-50" style={{ backgroundImage: `url(${BACKGROUND_IMAGE})`, backgroundPosition: '62% center' }} />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(2,6,23,0.82) 0%, rgba(2,6,23,0.55) 38%, rgba(2,6,23,0.94) 78%, #020617 100%)' }} />

                <div className="relative h-full flex flex-col overflow-y-auto">
                    {session ? (
                        <>
                            <div className="shrink-0 px-4 pt-4 flex justify-between">{chips}</div>
                            <div className="flex-1 min-h-[320px] px-6 flex flex-col items-center justify-center gap-10 text-center">
                                {logo}
                                {menu}
                            </div>
                        </>
                    ) : (
                        // 폰 비로그인 — 메뉴 대신 로그인 입력(가입·비밀번호 찾기는 전체 화면 시트)
                        <div className="flex-1 min-h-[420px] px-4 py-8 flex flex-col items-center justify-center gap-10">
                            {logo}
                            <HomeAuth variant="phone" onSuccess={handleLoginSuccess} />
                        </div>
                    )}
                    <footer className="shrink-0 px-4 pt-4 pb-5 border-t border-slate-700/60 flex flex-col gap-2">
                        {footerLinks}
                        {copyright}
                        <p className="text-xs leading-snug text-slate-400">{getServiceDisclaimer()}</p>
                    </footer>
                </div>

                {/* 전체 화면 시트 — 오른쪽에서 들어온다 */}
                <section
                    aria-label={legalKind ? '약관' : '세션 목록'} aria-hidden={!panelOpen}
                    className={`absolute inset-0 bg-slate-950 flex flex-col transition-transform duration-300 ease-out motion-reduce:transition-none ${panelOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
                >
                    {panelBody}
                </section>
                {modals}
            </div>
        );
    }

    // ── 데스크톱·태블릿 ─────────────────────────────────────────────────────────
    return (
        <div className="h-screen relative overflow-hidden bg-slate-950 flex flex-col pretendard text-white">
            <div className="absolute inset-0 bg-cover bg-center opacity-55" style={{ backgroundImage: `url(${BACKGROUND_IMAGE})` }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, #020617 0%, rgba(2,6,23,0.92) 34%, rgba(2,6,23,0.35) 70%, rgba(2,6,23,0.6) 100%)' }} />

            <div className="relative flex-1 min-h-0 flex">
                <div className="w-[400px] xl:w-[520px] shrink-0 pt-14 pb-10 pl-10 xl:pl-16 pr-6 flex flex-col gap-14 overflow-y-auto">
                    {logo}
                    {menu}
                </div>

                <main className="flex-1 min-w-0 pt-10 pb-8 pr-8 xl:pr-14 pl-6 flex flex-col gap-8">
                    <div className="shrink-0 flex justify-end">{chips}</div>
                    {/* 패널 — 화면 오른쪽 바깥에서 날아 들어온다. 항상 마운트해 두어 열 때 목록이 이미 준비돼 있다 */}
                    <section
                        aria-label={legalKind ? '약관' : '세션 목록'} aria-hidden={!panelOpen}
                        className={`flex-1 min-h-0 w-full max-w-[820px] self-end transition-[transform,opacity] duration-[460ms] ease-[cubic-bezier(.16,.84,.24,1)] motion-reduce:transition-none ${
                            panelOpen ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+80px)] opacity-0 pointer-events-none'
                        }`}
                    >
                        {panelBody}
                    </section>
                </main>
            </div>

            <footer className="relative shrink-0 px-10 xl:px-16 pt-5 pb-6 border-t border-slate-700/60 bg-slate-950/70 flex flex-wrap items-start justify-between gap-x-12 gap-y-4">
                <div className="flex flex-col gap-1.5">
                    {footerLinks}
                    {copyright}
                </div>
                <p className="flex-1 basis-[420px] max-w-[720px] text-[11px] leading-normal text-slate-400 text-right">{getServiceDisclaimer()}</p>
            </footer>
            {modals}
        </div>
    );
};
