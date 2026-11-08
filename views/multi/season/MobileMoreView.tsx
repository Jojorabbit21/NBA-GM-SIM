// MobileMoreView.tsx — 폰·태블릿 "더보기" 탭 화면. [2026-10-27 모바일 셸]
// docs/ui/mobile-design-system.md §8-2-2, 캔버스 2행 PhoneMore.dc.html ①②.
// 그룹 카드 없는 단일 리스트. 항목·순서·구분선은 데스크톱 MultiSidebar와 동일(useSeasonNavModel) — 탭으로 이미 갈 수 있는
// 항목(홈·로스터·순위표 등)도 전부 노출(구조 동일성 우선, 2026-10-26 사용자 지시). 행 48, 좌 아이콘 24, 라벨 14/600,
// 조건부 항목은 노출 조건을 12px slate-500 보조 글자로. 하단 프로필 블록 + 사이드바 프로필 드롭다운 항목 그대로.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, LogOut, Palette, Settings2, CircleUser, ScrollText } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useGame } from '../../../hooks/useGameContext';
import { useSeasonNavModel, type SeasonNavItem } from '../../../components/nav/useSeasonNavModel';
import { NavIcon, RosterIcon } from '../../../components/nav/navIcons';
import { CountBadge } from '../../../components/common/CountBadge';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { PatchNotesModal } from '../../../components/common/PatchNotesModal';
import { useWallet } from '../../../hooks/usePoints';
import { POINTS_ICON_URL, formatPoints } from '../../../services/points/pointsService';

const Divider: React.FC = () => <div className="mx-4 h-px bg-slate-800" role="separator" />;

const Row: React.FC<{
    icon: React.ReactNode;
    label: string;
    note?: string;
    badge?: number;
    active?: boolean;
    danger?: boolean;
    chevron?: boolean;
    onClick: () => void;
}> = ({ icon, label, note, badge, active, danger, chevron = true, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className="w-full h-12 px-4 flex items-center gap-3 text-left active:bg-white/5"
    >
        <span className="w-6 h-6 shrink-0 flex items-center justify-center">{icon}</span>
        <span className={`flex-1 min-w-0 text-sm font-semibold truncate ${danger ? 'text-red-400' : active ? 'text-[#00D492]' : 'text-slate-200'}`}>{label}</span>
        {note && <span className="text-xs text-slate-500 shrink-0">{note}</span>}
        <CountBadge count={badge} size="md" />
        {chevron && <ChevronRight size={16} className="text-slate-600 shrink-0" />}
    </button>
);

export default function MobileMoreView() {
    const navigate = useNavigate();
    const { handleLogout } = useAuth();
    const { session } = useGame();
    const { base, items, isAdmin, isSpectator, myTeam } = useSeasonNavModel();
    const [isPatchNotesOpen, setIsPatchNotesOpen] = useState(false);   // [2026-11-05] 패치노트 — 데스크톱 사이드바와 같은 모달, 날짜별 아코디언
    const { data: wallet } = useWallet(session?.user?.id);              // [2026-11-08] BP 잔액 — 데스크톱 프로필 메뉴 상단과 같은 자리

    const iconFor = (it: SeasonNavItem) => it.icon === 'team'
        ? <RosterIcon active={it.active} primary={myTeam?.color_primary} secondary={myTeam?.color_secondary} text={myTeam?.color_text} size={24} />
        : <NavIcon name={it.icon} active={it.active} size={24} />;

    return (
        <div className="flex flex-col pb-4">
            {items.map(it => (
                <React.Fragment key={it.id}>
                    {it.dividerBefore && <Divider />}
                    <Row icon={iconFor(it)} label={it.label} note={it.note} badge={it.badge} active={it.active} onClick={() => navigate(it.path)} />
                </React.Fragment>
            ))}

            <Divider />

            {/* 프로필 블록 — 사이드바 프로필 드롭다운 자리. 닉네임은 profiles 테이블(이 화면에서 따로 조회하지 않음) → 이메일·팀명. */}
            <div className="px-4 py-3 flex items-center gap-3">
                {myTeam
                    ? <TeamLogo teamId={myTeam.team_slug} teamName={myTeam.team_abbr} size="custom" className="w-7 h-7" shadow={false} />
                    : <CircleUser size={28} className="text-slate-400" />}
                <div className="min-w-0 flex flex-col">
                    <span className="text-sm font-semibold text-white truncate">{isSpectator ? '관전 중' : (myTeam?.team_name ?? '팀 미선택')}</span>
                    <span className="text-xs text-slate-500 truncate">{session?.user?.email ?? ''}</span>
                </div>
            </div>
            {/* BP 잔액 — Row와 같은 48 높이·좌 아이콘 24 자리, 클릭 없음 */}
            <div className="h-12 px-4 flex items-center gap-3">
                <span className="w-6 h-6 shrink-0 flex items-center justify-center">
                    <img src={POINTS_ICON_URL} alt="" width={20} height={20} />
                </span>
                <span className="flex-1 min-w-0 text-sm font-semibold text-slate-200">BP</span>
                <span className="text-sm font-bold text-white tabular-nums">{wallet ? formatPoints(wallet.balance) : '—'}</span>
            </div>
            {isAdmin && (
                <Row icon={<Settings2 size={18} className="text-slate-400" />} label="세션 설정" note="어드민" onClick={() => navigate(`${base}/settings`)} />
            )}
            {myTeam && !isSpectator && (
                <Row icon={<Palette size={18} className="text-slate-400" />} label="팀 설정" onClick={() => navigate(`${base}/roster?rteam=${myTeam.team_slug}&tab=settings`)} />
            )}
            <Divider />
            <Row icon={<ScrollText size={18} className="text-slate-400" />} label="패치노트" onClick={() => setIsPatchNotesOpen(true)} />
            <Row icon={<ChevronLeft size={18} className="text-slate-400" />} label="홈으로" note="시작 화면" onClick={() => navigate('/')} />
            <Divider />
            <Row icon={<LogOut size={18} className="text-red-400" />} label="로그아웃" danger chevron={false} onClick={() => { void handleLogout(); }} />
            <PatchNotesModal isOpen={isPatchNotesOpen} onClose={() => setIsPatchNotesOpen(false)} layout="accordion" />
        </div>
    );
}
