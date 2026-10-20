import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, cloneElement, isValidElement } from 'react';
import { createPortal } from 'react-dom';
import { TeamLogo } from './TeamLogo';

// PlayerHoverCard와 같은 규격(500ms 지연, 300px, slate-950/700, 12px)의 팀 호버 카드.
// 이 파일은 화면(멀티 컨텍스트)을 모르는 순수 프레젠테이션 계층이다 — 데이터 조회는
// views/multi/season/MultiTeamHoverCard.tsx가 맡고 content로 넘긴다. 컨텍스트 훅을 여기서
// import하면 components/common → views → components/common 순환 임포트가 생기므로 분리했다.

const HOVER_DELAY_MS = 500;
const POPUP_WIDTH = 300;
const POPUP_HEIGHT_ESTIMATE = 290;
const VIEWPORT_MARGIN = 8;

export interface TeamHoverCardRank {
    key: string;
    label: string;
    value: string;
    rank: number;
}

export interface TeamHoverCardInfo {
    slug: string;
    name: string;
    conference: 'East' | 'West' | null;
    wins: number;
    losses: number;
    confRank: number | null;
    leagueRank: number;
    gmLabel: string;
    totalTeams: number;
    ranks: TeamHoverCardRank[] | null;
}

// 순위 구간 색 — 30팀 기준 1~5 / 6~10 / 11~20 / 21~25 / 26~30. 팀 수가 다른 리그(가상 팀 보충 등)도
// 같은 비율로 나뉘도록 비율로 계산한다.
function rankTone(rank: number, total: number): string {
    const r = rank / Math.max(1, total);
    if (r <= 1 / 6) return 'text-emerald-400';
    if (r <= 1 / 3) return 'text-emerald-200';
    if (r <= 2 / 3) return 'text-slate-300';
    if (r <= 5 / 6) return 'text-amber-400';
    return 'text-rose-400';
}

const CONFERENCE_LABEL: Record<'East' | 'West', string> = { East: '동부 컨퍼런스', West: '서부 컨퍼런스' };

/** 팀 호버 카드 본문. loading=true면 순위 영역에 "불러오는 중"을 표시한다. */
export const TeamHoverCardBody: React.FC<{ info: TeamHoverCardInfo; loading?: boolean }> = ({ info, loading }) => (
    <div className="w-[300px] bg-slate-950 border border-slate-700 rounded-lg shadow-2xl p-3 select-none">
        <div className="flex items-center gap-2.5 pb-2.5 mb-2.5 border-b border-slate-800">
            <TeamLogo teamId={info.slug} teamName={info.name} size="custom" className="w-9 h-9 shrink-0" shadow={false} />
            <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">{info.name}</div>
                {info.conference && <div className="text-xs text-slate-400 mt-0.5">{CONFERENCE_LABEL[info.conference]}</div>}
            </div>
        </div>

        <div className="flex items-baseline justify-between pb-2.5 mb-2.5 border-b border-slate-800">
            <span className="text-xs text-slate-400">단장</span>
            <span className="text-xs font-semibold text-white truncate ml-2">{info.gmLabel}</span>
        </div>

        <div className="grid grid-cols-3 gap-x-2 gap-y-1 mb-2.5">
            <div>
                <div className="text-xs text-slate-400">전적</div>
                <div className="text-xs font-semibold text-white tabular-nums mt-px">{info.wins}승 {info.losses}패</div>
            </div>
            <div>
                <div className="text-xs text-slate-400">컨퍼런스 순위</div>
                <div className="text-xs font-semibold text-white tabular-nums mt-px">{info.confRank != null ? `${info.confRank}위` : '-'}</div>
            </div>
            <div>
                <div className="text-xs text-slate-400">리그 순위</div>
                <div className="text-xs font-semibold text-white tabular-nums mt-px">{info.leagueRank}위</div>
            </div>
        </div>

        <div className="pt-2.5 border-t border-slate-800">
            {info.ranks ? (
                <div className="grid grid-cols-3 gap-x-2 gap-y-2">
                    {info.ranks.map(r => (
                        <div key={r.key} className="min-w-0">
                            <div className="text-xs text-slate-400 truncate">{r.label}</div>
                            <div className="flex items-baseline gap-1.5 mt-px">
                                <span className="text-xs font-semibold text-white tabular-nums">{r.value}</span>
                                <span className={`text-xs font-bold tabular-nums ${rankTone(r.rank, info.totalTeams)}`}>{r.rank}위</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : loading ? (
                // 로딩 중에도 완성 상태와 같은 높이(6칸 = 3열 2행, 라벨+값 두 줄 33px)를 잡아 데이터가 도착해도 카드 크기가 변하지 않게 한다.
                <div className="grid grid-cols-3 gap-x-2 gap-y-2" aria-busy="true">
                    {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="h-[33px] rounded bg-slate-800/70 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="text-xs text-slate-500 text-center py-1">기록 없음</div>
            )}
        </div>
    </div>
);

interface TeamHoverCardProps {
    /** 팝업에 들어갈 내용. 호버로 열릴 때만 마운트되므로 이 안에서 훅/무거운 계산을 해도 상시 비용이 없다. */
    content: React.ReactNode;
    /** false면 hover 로직 없이 children을 그대로 반환(스펙테이터/싱글 등 게이트용). */
    enabled?: boolean;
    /** 단일 엘리먼트(팀 이름 span 등) — cloneElement로 이벤트만 얹어 기존 레이아웃/클릭 동작을 보존한다. */
    children: React.ReactElement;
}

export const TeamHoverCard: React.FC<TeamHoverCardProps> = ({ content, enabled = true, children }) => {
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const anchorRef = useRef<HTMLElement | null>(null);
    const popupRef = useRef<HTMLDivElement | null>(null);

    const clearTimer = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const computeCoords = useCallback((width: number, height: number) => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect) return null;
        let left = rect.left;
        let top = rect.bottom + 6;
        if (left + width > window.innerWidth - VIEWPORT_MARGIN) {
            left = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
        }
        if (top + height > window.innerHeight - VIEWPORT_MARGIN) {
            top = Math.max(VIEWPORT_MARGIN, rect.top - height - 6);
        }
        return { top, left };
    }, []);

    const handleMouseEnter = useCallback(() => {
        clearTimer();
        timerRef.current = setTimeout(() => {
            const next = computeCoords(POPUP_WIDTH, POPUP_HEIGHT_ESTIMATE);
            if (!next) return;
            setCoords(next);
            setVisible(true);
        }, HOVER_DELAY_MS);
    }, [computeCoords]);

    const handleMouseLeave = useCallback(() => {
        clearTimer();
        setVisible(false);
    }, []);

    useEffect(() => clearTimer, []);

    // 팝업이 마운트된 직후(paint 전) 실제 크기로 좌표를 재계산 — 추정 높이와 실제 높이가 어긋나도
    // 뷰포트 하단 뒤집힘 판정이 맞도록 한다(PlayerHoverCard와 동일한 보정).
    useLayoutEffect(() => {
        if (!visible) return;
        const popupEl = popupRef.current;
        if (!popupEl) return;
        const next = computeCoords(popupEl.offsetWidth || POPUP_WIDTH, popupEl.offsetHeight || POPUP_HEIGHT_ESTIMATE);
        if (!next) return;
        setCoords(prev => (prev && Math.abs(prev.top - next.top) < 1 && Math.abs(prev.left - next.left) < 1) ? prev : next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    // 팝업이 열려있는 동안 앵커가 스크롤로 움직이면 기준 좌표가 무의미해지므로 즉시 닫는다.
    // 캡처 리스너라 화면 안 모든 요소의 스크롤이 들어온다 — 앵커를 포함하지 않는 영역(예: 새 메시지가 오면
    // 자동 스크롤되는 채팅 패널)의 스크롤은 앵커 위치와 무관하므로 무시한다.
    useEffect(() => {
        if (!visible) return;
        const handleScroll = (e: Event) => {
            const target = e.target;
            const anchor = anchorRef.current;
            if (target instanceof Node && anchor && target !== document && !target.contains(anchor)) return;
            setVisible(false);
        };
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, [visible]);

    if (!enabled || !isValidElement(children)) return children;

    const child = cloneElement(children as React.ReactElement<any>, {
        ref: anchorRef,
        onMouseEnter: (e: React.MouseEvent) => {
            (children.props as any).onMouseEnter?.(e);
            handleMouseEnter();
        },
        onMouseLeave: (e: React.MouseEvent) => {
            (children.props as any).onMouseLeave?.(e);
            handleMouseLeave();
        },
    });

    return (
        <>
            {child}
            {visible && coords && createPortal(
                <div ref={popupRef} style={{ position: 'fixed', top: coords.top, left: coords.left }} className="z-tooltip pointer-events-none">
                    {content}
                </div>,
                document.body,
            )}
        </>
    );
};
