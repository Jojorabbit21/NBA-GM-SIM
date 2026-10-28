// MobileTopBar.tsx — 폰·태블릿 상단 바 56 + 안전 영역. [2026-10-27 모바일 셸]
// docs/ui/mobile-design-system.md §8-3, 캔버스 Components.dc.html H1~H8.
// 좌 = 리그 로고(탭 루트) 또는 뒤로(2단계 화면) · 중 = 제목 2줄(리그명 또는 화면명 18/700 + "가상 2026.10.27 (월)" 12/500)
// · 우 = MobileHeaderActions(검색 · 수신함 · 내 팀 로고). 팀 화면 H3는 RosterView가 같은 액션 묶음을 슬롯으로 받아 그린다.
import React from 'react';
import { ArrowLeft, Tv } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../../views/multi/league/LeagueLayout';
import { useSeasonContext } from '../../views/multi/season/seasonContext';
import { useCurrentVirtualDate } from '../../hooks/useCurrentVirtualDate';
import { virtualDayMark } from '../VirtualDayArc';
import { useMyNextGame } from '../../hooks/useMyNextGame';
import { useServerClockBucket } from '../../utils/serverClock';
import { useGameShortCodes } from '../../hooks/useGameShortCodes';
import { MobileHeaderActions } from './MobileHeaderActions';

export const MOBILE_TOP_BAR_HEIGHT = 56;

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtVirtualDateKo(dateKey: string): string {
    const d = new Date(dateKey + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return dateKey;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    // "가상 " 접두어 없음(2026-10-27 사용자 지시)
    return `${d.getFullYear()}.${mm}.${dd} (${WEEKDAY_KO[d.getDay()]})`;
}

// 2단계(push) 화면 — 뒤로 버튼 + 화면명. 그 외 세그먼트는 탭 루트로 보고 리그명을 제목으로 쓴다.
const PUSH_TITLES: Record<string, string> = {
    player: '선수 프로필',
    game: '경기',
    negotiate: '계약 협상',
    release: '방출',
    settings: '세션 설정',
    'draft-result': '드래프트 결과',
    more: '더보기',
    compare: '선수 비교',
};

export const MobileTopBar: React.FC = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, room, leagueTeams, timeline, isSpectator } = useLeagueContext();
    const nowMs = useServerClockBucket();
    const { getGameUrlId } = useGameShortCodes(room?.id);
    const next = useMyNextGame();
    const { schedule } = useSeasonContext();
    const base = `/multi/leagues/${leagueId}/season`;
    const seg = pathname.startsWith(base) ? (pathname.slice(base.length).replace(/^\/+/, '').split('/')[0] ?? '') : '';

    const currentVirtualDate = useCurrentVirtualDate(schedule, league?.type, league?.sim_real_start_at, league?.games_per_real_day, timeline);
    const pushTitle = PUSH_TITLES[seg];
    const isPush = !!pushTitle;
    // 루트 화면 상단 바 = 시즌 정보(데스크톱 MultiHeader 시즌정보 칸의 폰판): 1줄 가상 날짜 + 가상 하루 진행 아크, 2줄 LIVE/다음 경기 + 카운트다운.
    // 리그 로고·리그명은 홈 본문 상단으로 내렸다(2026-10-27 사용자 지시). 토너먼트(가상 날짜 없음)는 리그명으로 폴백.
    const dateLabel = currentVirtualDate ? fmtVirtualDateKo(currentVirtualDate) : (league?.name ?? '리그');
    // 가상 시각은 데스크톱의 진행 아크 대신 날짜 뒤 텍스트 "9 PM"(아크와 같은 시 단위 내림, 2026-10-27 사용자 지시).
    const clockLabel = (() => {
        if (!currentVirtualDate || !timeline?.length) return null;
        const h24 = Math.floor(virtualDayMark(timeline, nowMs).clockMin / 60) % 24;
        const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
        return `${h12} ${h24 < 12 ? 'AM' : 'PM'}`;
    })();
    const urgencyClass = next.urgency === 'warn' ? 'text-amber-400' : next.urgency === 'urgent' ? 'text-red-400' : 'text-indigo-400';
    const base2 = base;

    const goBack = () => {
        if (window.history.length > 1) navigate(-1);
        else navigate(base);
    };

    return (
        <header className="shrink-0 pt-safe bg-slate-950 border-b border-slate-800 z-header relative">
            <div className="flex items-center gap-1 pr-2" style={{ height: MOBILE_TOP_BAR_HEIGHT }}>
                {isPush ? (
                    <>
                        <button type="button" onClick={goBack} aria-label="뒤로" className="w-11 h-11 ml-1 flex items-center justify-center rounded-lg text-slate-200 active:bg-white/10">
                            <ArrowLeft size={22} />
                        </button>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <h1 className="m-0 text-lg leading-6 font-bold text-white truncate">{pushTitle}</h1>
                            {currentVirtualDate && <span className="text-xs leading-4 font-medium text-slate-400 tabular-nums truncate">{fmtVirtualDateKo(currentVirtualDate)}</span>}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 min-w-0 pl-4 flex flex-col justify-center gap-0.5">
                        <div className="flex items-baseline gap-1.5 min-w-0 tracking-normal">
                            <span className="text-sm leading-5 font-bold text-white truncate">{dateLabel}</span>
                            {clockLabel && <span className="text-sm leading-5 font-bold text-slate-300 shrink-0">{clockLabel}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs leading-4 min-w-0 truncate">
                            {next.liveGame ? (
                                <>
                                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                                    </span>
                                    <span className="font-bold text-red-400">LIVE</span>
                                    <span className="text-slate-300">{next.isLiveAway ? '@' : 'vs'} {next.liveOpponent?.team_abbr ?? '—'}</span>
                                    <button type="button" onClick={() => navigate(`${base2}/game/${getGameUrlId(next.liveGame!.id)}`)} className="ml-1 inline-flex items-center gap-1 text-red-300 font-semibold active:opacity-70">
                                        <Tv size={12} />보기
                                    </button>
                                </>
                            ) : next.nextGame ? (
                                <>
                                    <span className="font-semibold text-slate-300">{next.isAway ? '@' : 'vs'} {next.opponent?.team_abbr ?? next.opponentId}</span>
                                    {next.countdownText && <span className={`font-semibold tabular-nums ${urgencyClass}`}>· {next.countdownText}</span>}
                                </>
                            ) : (
                                <span className="text-slate-500">{isSpectator ? '관전 중' : league?.type === 'tournament' ? '토너먼트' : '예정된 경기 없음'}</span>
                            )}
                        </div>
                    </div>
                )}
                <MobileHeaderActions />
            </div>
        </header>
    );
};
