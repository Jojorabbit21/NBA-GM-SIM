
import React, { useState, useRef, useCallback, useEffect, cloneElement, isValidElement } from 'react';
import { createPortal } from 'react-dom';
import type { Player, PlayerStats } from '../../types';
import { COMPACT_ATTR_GROUPS, ATTR_KR_LABEL, CompactAttrItem, getCompactAttrValue } from '../../data/attributeConfig';
import { InjuryStatusBadge, SEVERITY_TEXT_COLOR } from './InjuryStatusBadge';
import { formatReturnDateSuffix } from '../../services/multi/activeInjuryStatus';
import { getAttrColor } from '../../utils/attrRatingColor';

// 완전한 Player 객체가 없는 화면(뉴스피드/시즌 일정 — playerId+이름 정도만 있는 partial
// payload)이 hover 카드를 쓰기 위해 공용으로 조립하는 조회 맵. 이 파일에 두는 이유: 여러
// 화면(newsFeedCards.tsx, MultiScheduleView.tsx)이 각자 useMemo로 거의 동일한 for 루프를
// 중복 작성했던 것을 하나로 모으기 위함.
export interface PlayerCardEntry { player: Player; teamAbbr: string }
export type PlayerCardMap = Map<string, PlayerCardEntry>;

/** poolPlayers(리그 드래프트풀 전체 Player[]) + rosterMap(playerId→team_slug)으로
 *  playerId → {완전한 Player, 소속팀 약어} 맵을 만든다. 로스터에서 사라진 선수(방출/은퇴 등)는
 *  teamAbbr만 빈 문자열이 되고 팝업 자체는 그대로 뜬다. getTeamAbbr을 함수로 받아 호출부가
 *  Map이든 Record든(팀 슬러그→행 조회 방식이 제각각이어도) 그대로 넘길 수 있게 한다. */
export function buildPlayerCardMap(
    poolPlayers: Player[],
    rosterMap: Map<string, string>,
    getTeamAbbr: (teamSlug: string) => string | null | undefined,
): PlayerCardMap {
    const m: PlayerCardMap = new Map();
    for (const p of poolPlayers) {
        const slug = rosterMap.get(p.id);
        const teamAbbr = (slug && getTeamAbbr(slug)) || '';
        m.set(p.id, { player: p, teamAbbr });
    }
    return m;
}

/** buildPlayerCardMap()이 만든 맵의 각 Player.stats(항상 0 — poolPlayers는 meta_players만
 *  조회해서 stats를 안 담음)를, 별도로 조회한 시즌 스탯(예: usePlayerSeasonStatsBatch)으로
 *  덮어써서 hover 카드가 "시즌 기록 없음" 대신 실제 스탯을 보여주게 한다. statsByPlayerId에
 *  없는 선수는 원본 그대로(불변 — 새 Map/엔트리만 만들고 기존 객체는 변경하지 않음). */
export function mergeStatsIntoPlayerCardMap(
    base: PlayerCardMap,
    statsByPlayerId: Record<string, Partial<PlayerStats>>,
): PlayerCardMap {
    if (Object.keys(statsByPlayerId).length === 0) return base;
    const merged: PlayerCardMap = new Map();
    for (const [id, entry] of base) {
        const stats = statsByPlayerId[id];
        merged.set(id, stats
            ? { ...entry, player: { ...entry.player, stats: { ...entry.player.stats, ...stats } } }
            : entry);
    }
    return merged;
}

const HOVER_DELAY_MS = 500;
const POPUP_WIDTH = 300;
const POPUP_HEIGHT_ESTIMATE = 340;
const VIEWPORT_MARGIN = 8;

// PlayerDetailView.tsx의 능력치 위젯(MERGED_GROUPS)과 동일한 3열 배치 — 6개 카테고리(3/4/3/5/2/4개)를
// 7개씩 균등한 3묶음(인사이드+아웃사이드, 수비+리바운드, 패스+운동능력)으로 합쳐서 표시.
const byId = (id: string) => COMPACT_ATTR_GROUPS.find(g => g.id === id)!;
const RATING_COLUMNS: CompactAttrItem[][] = [
    [...byId('INS').items, ...byId('OUT').items],
    [...byId('DEF').items, ...byId('REB').items],
    [...byId('PLM').items, ...byId('ATH').items],
];

const compactLabel = (item: CompactAttrItem): string => {
    if (item.krLabel) return item.krLabel;
    if (item.sourceKeys.length === 1) return ATTR_KR_LABEL[item.sourceKeys[0]] || item.label;
    return item.sourceKeys.map(k => ATTR_KR_LABEL[k] || k).join(' / ');
};

type StatFormat = 'avg' | 'percent' | 'rate';

interface StatItem {
    key: string;
    label: string;
    compute: (s: PlayerStats, g: number) => number;
    format: StatFormat;
}

// 원시 누적치(pts/fga/fta/p3a 등)에서 직접 계산 — useLeaderboardData 등 특정 훅의 사전 계산 필드에
// 의존하지 않아, Player 객체(stats 포함)만 있으면 어느 화면에서든 그대로 동작한다.
const STAT_COLUMNS: StatItem[][] = [
    [
        { key: 'pts', label: 'PTS', compute: (s, g) => s.pts / g, format: 'avg' },
        { key: 'reb', label: 'REB', compute: (s, g) => s.reb / g, format: 'avg' },
        { key: 'ast', label: 'AST', compute: (s, g) => s.ast / g, format: 'avg' },
        { key: 'fg%', label: 'FG%', compute: (s) => (s.fga > 0 ? s.fgm / s.fga : 0), format: 'percent' },
        { key: 'ts%', label: 'TS%', compute: (s) => { const tsa = s.fga + 0.44 * s.fta; return tsa > 0 ? s.pts / (2 * tsa) : 0; }, format: 'percent' },
    ],
    [
        { key: 'blk', label: 'BLK', compute: (s, g) => s.blk / g, format: 'avg' },
        { key: 'stl', label: 'STL', compute: (s, g) => s.stl / g, format: 'avg' },
        { key: 'tov', label: 'TO', compute: (s, g) => s.tov / g, format: 'avg' },
        { key: '3p%', label: '3P%', compute: (s) => (s.p3a > 0 ? s.p3m / s.p3a : 0), format: 'percent' },
        { key: '3par', label: '3PAr', compute: (s) => (s.fga > 0 ? s.p3a / s.fga : 0), format: 'rate' },
    ],
    [
        { key: 'mp', label: 'MP', compute: (s, g) => s.mp / g, format: 'avg' },
        { key: 'ft%', label: 'FT%', compute: (s) => (s.fta > 0 ? s.ftm / s.fta : 0), format: 'percent' },
        { key: 'ftr', label: 'FTr', compute: (s) => (s.fga > 0 ? s.fta / s.fga : 0), format: 'rate' },
    ],
];

function formatStat(val: number, format: StatFormat): string {
    if (format === 'percent') return (val * 100).toFixed(1) + '%';
    if (format === 'rate') return val.toFixed(3).replace(/^0\./, '.');
    return val.toFixed(1);
}

const PlayerRatingsStatsPopup: React.FC<{ player: Player; teamAbbr?: string | null; style: React.CSSProperties }> = ({ player, teamAbbr, style }) => {
    const g = player.stats?.g || 0;
    const hasStats = g > 0;

    return (
        <div
            style={style}
            className="w-[300px] bg-slate-950 border border-slate-700 rounded-lg shadow-2xl p-3 pointer-events-none select-none"
        >
            {/* 헤더 — 이름 · 소속팀 약어 · 포지션 · 나이 (전부 플레인 텍스트), 활성 부상/출장정지가
                있으면 그 아래 한 줄 더 — [배지] [부상|출장정지] [부상명(부상일 때만)] [기간] */}
            <div className="mb-2 pb-2 border-b border-slate-800">
                <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-xs font-bold text-white truncate">{player.name}</span>
                    {teamAbbr && <span className="text-xs text-slate-400 shrink-0">{teamAbbr}</span>}
                    <span className="text-xs text-slate-400 shrink-0">{player.position}</span>
                    <span className="text-xs text-slate-400 shrink-0">{player.age}세</span>
                </div>
                {player.activeInjurySeverity && (
                    <div className="flex items-center gap-1.5 mt-1 min-w-0">
                        <InjuryStatusBadge severity={player.activeInjurySeverity} size={14} iconSize={10} strokeWidth={4} />
                        <span className={`text-xs font-semibold shrink-0 ${SEVERITY_TEXT_COLOR[player.activeInjurySeverity]}`}>
                            {player.activeInjurySeverity === 'Suspension' ? '출장정지' : '부상'}
                        </span>
                        {player.activeInjurySeverity !== 'Suspension' && player.injuryType && (
                            <span className={`text-xs font-semibold truncate ${SEVERITY_TEXT_COLOR[player.activeInjurySeverity]}`}>{player.injuryType}</span>
                        )}
                        <span className={`text-xs shrink-0 ${SEVERITY_TEXT_COLOR[player.activeInjurySeverity]}`}>
                            {player.activeInjuryDuration}{formatReturnDateSuffix(player.returnDate)}
                        </span>
                    </div>
                )}
            </div>

            {/* 능력치 3열 그리드 */}
            <div className="grid grid-cols-3 gap-x-2 mb-2">
                {RATING_COLUMNS.map((col, ci) => (
                    <div key={ci} className="flex flex-col gap-0.5">
                        {col.map(item => {
                            const val = getCompactAttrValue(player, item);
                            return (
                                <div key={item.key} className="flex items-center justify-between gap-1 min-w-0">
                                    <span className="text-xs text-slate-400 truncate">{compactLabel(item)}</span>
                                    <span className={`text-xs font-bold tabular-nums shrink-0 ${getAttrColor(val)}`}>{val}</span>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* 시즌 스탯 3열 그리드 */}
            <div className="pt-2 border-t border-slate-800">
                {hasStats ? (
                    <div className="grid grid-cols-3 gap-x-2">
                        {STAT_COLUMNS.map((col, ci) => (
                            <div key={ci} className="flex flex-col gap-0.5">
                                {col.map(item => (
                                    <div key={item.key} className="flex items-center justify-between gap-1 min-w-0">
                                        <span className="text-xs text-slate-500">{item.label}</span>
                                        <span className="text-xs font-semibold text-white tabular-nums shrink-0">
                                            {formatStat(item.compute(player.stats, g), item.format)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-xs text-slate-500 text-center py-1">시즌 기록 없음</div>
                )}
            </div>
        </div>
    );
};

interface PlayerHoverCardProps {
    /** 조회 실패(로스터에서 사라진 선수 등) 또는 멀티플레이어 전용 게이트(enabled=false)로
     *  값이 없을 수 있음 — 이 경우 wrapper는 children을 그대로 반환해 호출부가 매번
     *  삼항연산자로 감쌀지 말지 분기할 필요가 없다. */
    player: Player | null | undefined;
    /** 팝업 헤더 우측에 표시할 소속팀 약어 — 호출부가 이미 알고 있는 팀 컨텍스트(team.abbr 등)를
     *  그대로 전달. 미지정 시 헤더에 표시하지 않음(FA 등 팀 컨텍스트가 없는 경우). */
    teamAbbr?: string | null;
    /** 싱글/멀티 공유 컴포넌트에서 "멀티플레이어일 때만 켠다" 게이트 — 기본 true.
     *  false면 hover 로직 없이 children을 그대로 반환. */
    enabled?: boolean;
    /** 자식은 반드시 단일 엘리먼트(기존 클릭 가능한 이름 span 등) — 별도 wrapper 없이
     *  cloneElement로 이벤트 핸들러만 얹어 기존 레이아웃(truncate/shrink-0 등)을 그대로 보존한다. */
    children: React.ReactElement;
}

/** 이름 위에 일정 시간(500ms) 마우스를 올리면 능력치+스탯 요약 팝업을 띄우는 wrapper.
 *  기존 onClick(프로필 이동)은 children에 그대로 남아있어 클릭 동작은 변경되지 않는다.
 *  player가 없거나 enabled=false면 children을 그대로 반환 — 호출부는 항상 이 컴포넌트로
 *  감싸기만 하면 되고, 조건부 렌더링(삼항연산자/IIFE)을 매번 반복할 필요가 없다. */
export const PlayerHoverCard: React.FC<PlayerHoverCardProps> = ({ player, teamAbbr, enabled = true, children }) => {
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const anchorRef = useRef<HTMLElement | null>(null);

    const clearTimer = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const computeCoords = useCallback(() => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect) return null;
        let left = rect.left;
        let top = rect.bottom + 6;
        if (left + POPUP_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
            left = Math.max(VIEWPORT_MARGIN, window.innerWidth - POPUP_WIDTH - VIEWPORT_MARGIN);
        }
        if (top + POPUP_HEIGHT_ESTIMATE > window.innerHeight - VIEWPORT_MARGIN) {
            top = Math.max(VIEWPORT_MARGIN, rect.top - POPUP_HEIGHT_ESTIMATE - 6);
        }
        return { top, left };
    }, []);

    const handleMouseEnter = useCallback(() => {
        clearTimer();
        timerRef.current = setTimeout(() => {
            const next = computeCoords();
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

    // 팝업이 열려있는 동안 스크롤되면 앵커 기준 좌표가 무의미해지므로 즉시 닫는다.
    useEffect(() => {
        if (!visible) return;
        const handleScroll = () => setVisible(false);
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, [visible]);

    if (!enabled || !player || !isValidElement(children)) return children;

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
                <PlayerRatingsStatsPopup player={player} teamAbbr={teamAbbr} style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 200 }} />,
                document.body,
            )}
        </>
    );
};
