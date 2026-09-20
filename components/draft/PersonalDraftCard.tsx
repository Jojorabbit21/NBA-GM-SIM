// PersonalDraftCard.tsx — 개인 팩 드래프트 카드 1장 (2026-09-20 "팩 드래프트" 목업 v82 확정 디자인).
// [컬렉션 헤더] / [OVR 60px 배지 ··· 팀 로고 40px] / 카드 정중앙 팀 로고 / 하단 텍스트 블록(이름·시즌·팀·포지션·아키타입)
// 배경: 카드 이미지 → 컬렉션 배경 → 팀 그라디언트(카드 전용 팀별 컬러 오버라이드 반영) — utils/cardBackground.ts.
// 호버: 커서 위치를 따라다니는 능력치+시즌 기록 팝업(PlayerRatingsStatsPopup). 기록이 없는 카드(라이브/루키)는
// 기록 섹션을 숨긴다. 팀이 없는 카드(FA/은퇴 레전드)는 로고 없이 중립 그라디언트.
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { OvrBadge } from '../common/OvrBadge';
import { PlayerRatingsStatsPopup } from '../common/PlayerHoverCard';
import { getRealTeamLogoUrl, resolveTeamId } from '../../utils/constants';
import { TEAM_DATA } from '../../data/teamData';
import { getCardExtraTeam } from '../../data/cardTeams';
import { buildCardBackground, resolveCardTeamGradient, type CardTeamColor } from '../../utils/cardBackground';
import type { PersonalDraftPlayer } from '../../hooks/usePersonalDraft';

interface PersonalDraftCardProps {
    player: PersonalDraftPlayer;
    selected: boolean;
    disabled?: boolean;
    /** 비활성 이유(툴팁). 예: 같은 선수 카드 보유, 포지션 목표 달성 불가 */
    disabledReason?: string;
    onSelect: (cardId: string) => void;
    /** 카드 전용 팀별 컬러 오버라이드 맵(useCardTeamColors). 없으면 TEAM_COLORS 기본값. */
    teamColors?: Record<string, CardTeamColor> | null;
}

const SELECTED_SHADOW = '0 0 0 1px rgba(16,185,129,.6), 0 0 18px rgba(16,185,129,.35)';
const BOTTOM_GRADIENT = 'linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,.55) 40%, rgba(2,6,23,.85) 100%)';
const POPUP_OFFSET = 14;
const POPUP_MARGIN = 8;
const POPUP_W_ESTIMATE = 300;
const POPUP_H_ESTIMATE = 360;

function resolveTeamVisual(baseTeamId: string | null, teamColors?: Record<string, CardTeamColor> | null) {
    const teamId = baseTeamId ? resolveTeamId(baseTeamId) : 'unknown';
    if (!baseTeamId || teamId === 'unknown') {
        return { teamId: null as string | null, teamName: null as string | null, colors: resolveCardTeamGradient(null, teamColors) };
    }
    const data = TEAM_DATA[teamId];
    const extra = data ? null : getCardExtraTeam(teamId);   // 30팀 외 카드 전용 확장 팀(시애틀 에메랄즈 등)
    return {
        teamId,
        teamName: data ? `${data.city} ${data.name}` : extra ? `${extra.city} ${extra.name}` : null,
        colors: resolveCardTeamGradient(teamId, teamColors),
    };
}

export const PersonalDraftCard: React.FC<PersonalDraftCardProps> = ({ player, selected, disabled = false, disabledReason, onSelect, teamColors }) => {
    const { teamId, teamName, colors } = resolveTeamVisual(player.baseTeamId, teamColors);
    const background = buildCardBackground(player.collection?.bg ?? null, colors, player.bgImageUrl);
    const subline = [teamName, player.position].filter(Boolean).join(' · ');
    const hasStats = (player.seasonStats?.g ?? 0) > 0;

    // ── 커서 추적 호버 팝업 ────────────────────────────────────────────────────
    const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
    const popupRef = useRef<HTMLDivElement | null>(null);
    const [popupSize, setPopupSize] = useState<{ w: number; h: number }>({ w: POPUP_W_ESTIMATE, h: POPUP_H_ESTIMATE });

    useLayoutEffect(() => {
        if (!hover || !popupRef.current) return;
        const w = popupRef.current.offsetWidth || POPUP_W_ESTIMATE;
        const h = popupRef.current.offsetHeight || POPUP_H_ESTIMATE;
        setPopupSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
        // 팝업이 처음 뜰 때만 실제 크기를 재면 된다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!hover]);

    const onMove = useCallback((e: React.MouseEvent) => setHover({ x: e.clientX, y: e.clientY }), []);
    const onLeave = useCallback(() => setHover(null), []);

    let popupStyle: React.CSSProperties | null = null;
    if (hover) {
        let left = hover.x + POPUP_OFFSET;
        let top = hover.y + POPUP_OFFSET;
        if (left + popupSize.w > window.innerWidth - POPUP_MARGIN) left = hover.x - POPUP_OFFSET - popupSize.w;
        if (top + popupSize.h > window.innerHeight - POPUP_MARGIN) top = hover.y - POPUP_OFFSET - popupSize.h;
        popupStyle = { position: 'fixed', top: Math.max(POPUP_MARGIN, top), left: Math.max(POPUP_MARGIN, left), zIndex: 200 };
    }

    return (
        <>
            <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-pressed={selected}
                aria-disabled={disabled}
                title={disabled ? disabledReason : undefined}
                onClick={() => { if (!disabled) onSelect(player.cardId); }}
                onKeyDown={e => {
                    if (disabled) return;
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(player.cardId); }
                }}
                onMouseEnter={onMove}
                onMouseMove={onMove}
                onMouseLeave={onLeave}
                className={`relative rounded-xl border overflow-hidden flex flex-col select-none aspect-[3/4.6] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
                    selected ? 'border-emerald-500' : 'border-slate-700'
                } ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                style={{ background, boxShadow: selected ? SELECTED_SHADOW : undefined }}
            >
                {/* 컬렉션 헤더 — 소속 컬렉션이 없으면 빈 칸(높이는 유지) */}
                <div className="h-6 shrink-0 px-2.5 flex items-center justify-center text-[11px] font-bold uppercase tracking-wide text-white/70 bg-black/50 border-b border-white/10 truncate text-center">
                    {player.collection?.name ?? ''}
                </div>

                {/* 카드 정중앙 팀 로고(헤더 포함 카드 전체 기준) */}
                {teamId && (
                    <img
                        src={getRealTeamLogoUrl(teamId)}
                        alt=""
                        draggable={false}
                        className="absolute inset-0 m-auto w-[40%] aspect-square object-contain pointer-events-none"
                        style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.6))' }}
                    />
                )}

                <div className="relative px-2.5 pt-2.5 pb-3 flex flex-col items-center flex-1 min-h-0">
                    {/* 상단: [OVR 60px] ··· [팀 로고 40px] */}
                    <div className="w-full flex items-start justify-between">
                        <OvrBadge value={player.ovr} size="card" />
                        <div className="w-11 h-11 flex items-center justify-center">
                            {teamId && (
                                <img
                                    src={getRealTeamLogoUrl(teamId)}
                                    alt=""
                                    draggable={false}
                                    className="w-10 h-10 object-contain pointer-events-none"
                                    style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.6))' }}
                                />
                            )}
                        </div>
                    </div>

                    {/* 하단 텍스트 블록: 이름 / 시즌 / 팀 · 포지션 / 아키타입 — 가독성용 그라디언트 위 */}
                    <div
                        className="mt-auto -mx-2.5 -mb-3 px-2.5 pt-10 pb-3 flex flex-col items-center self-stretch relative z-10"
                        style={{ background: BOTTOM_GRADIENT }}
                    >
                        <div className="text-lg font-black text-white truncate leading-tight max-w-full text-center">{player.name}</div>
                        <div className="text-sm font-semibold text-white/80 tabular-nums mt-0.5 text-center truncate max-w-full">
                            {player.season}{player.edition ? ` · ${player.edition}` : ''}
                        </div>
                        <div className="text-sm text-white/70 mt-0.5 text-center truncate max-w-full">{subline}</div>
                        <div className="text-sm font-semibold mt-0.5 text-center truncate max-w-full text-white/75 tracking-wide">
                            {player.archetype ?? ''}
                        </div>
                    </div>
                </div>
            </div>

            {popupStyle && createPortal(
                <PlayerRatingsStatsPopup
                    ref={popupRef}
                    player={player}
                    teamAbbr={teamId ? teamId.toUpperCase() : null}
                    style={popupStyle}
                    statsCaption={`${player.season} 시즌 기록`}
                    hideStatsWhenEmpty={!hasStats}
                />,
                document.body,
            )}
        </>
    );
};
