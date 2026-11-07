// DraftPlayerPopup.tsx — 드래프트 룸 폰 선수 팝업(이름 탭). [2026-11-08]
// docs/ui/mobile-design-system.md §9-0-4 "선수 이름 탭 → 선수 팝업": PlayerHoverCard의 디자인만 차용(컴포넌트 재사용 안 함), 시즌 기록 없음.
// 가운데 342(좌우 24) · slate-950 · border slate-700 · r8 · 패딩 12 · 최대 높이 80% 내부 스크롤 · z-tooltip. 배경 탭·닫기·Esc로 닫힘.
// ① 헤더 = 이름 14/700 단독 / [지명된 선수: 로고 16 + 팀명 · "N라운드 #N픽"] / "POS | 나이 | 키 | 몸무게" / 아키타입 "주 / 보조" emerald / 특성 태그 필 칩
// ② 능력치 3열 × 7(PlayerHoverCard RATING_COLUMNS) ③ "스카우팅 리포트" 아코디언(generateScoutReport, +/−/중립 색)
// ④ 바닥 sticky 버튼 [큐 추가|큐 삭제 primary] [드래프트 success, 내 차례만] — 지명된 선수는 버튼 없음.
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import type { Player } from '../../../types';
import type { RoomTeamMetaMap } from '../../../types/multiDraft';
import { resolveTeamDisplay } from '../teamMetaLookup';
import { TeamLogo } from '../../common/TeamLogo';
import { Button } from '../../common/Button';
import { RATING_COLUMNS, compactLabel } from '../../common/PlayerHoverCard';
import { getCompactAttrValue } from '../../../data/attributeConfig';
import { getAttrColor } from '../../../utils/attrRatingColor';
import { assignArchetypes, getArchetypeDisplayInfo, getTraitTagDisplayInfo } from '../../../services/playerDevelopment/archetypeEvaluator';
import { generateScoutReport } from '../../../utils/scoutReport';

export interface DraftPlayerPopupProps {
    player: Player | null;
    onClose: () => void;
    teamMeta?: RoomTeamMetaMap;
    /** 이미 지명된 선수면 팀·라운드·픽 — 버튼 섹션 없음 */
    drafted?: { teamId: string; round: number; pickNumber: number } | null;
    queued?: boolean;
    onToggleQueue?: (p: Player) => void;
    canDraft?: boolean;
    onDraft?: (p: Player) => void;
    /** 큐 버튼 노출 여부(참가자만) */
    showQueue?: boolean;
}

export const DraftPlayerPopup: React.FC<DraftPlayerPopupProps> = ({ player, onClose, teamMeta, drafted, queued = false, onToggleQueue, canDraft = false, onDraft, showQueue = true }) => {
    const [reportOpen, setReportOpen] = useState(false);
    useEffect(() => { setReportOpen(false); }, [player?.id]);
    useEffect(() => {
        if (!player) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [player, onClose]);

    const archetype = useMemo(() => {
        if (!player) return null;
        try { return player.archetypeState ?? assignArchetypes(player, '2025-26'); } catch { return null; }
    }, [player]);
    const report = useMemo(() => {
        if (!player) return [];
        const order = { positive: 0, negative: 1, neutral: 2 } as const;
        return [...generateScoutReport(player, player.id)].sort((a, b) => order[a.sentiment] - order[b.sentiment]);
    }, [player]);

    if (!player) return null;
    const teamInfo = drafted ? resolveTeamDisplay(drafted.teamId, teamMeta) : null;

    return createPortal(
        <div className="fixed inset-0 z-tooltip flex items-center justify-center px-6" onClick={onClose}>
            <div className="absolute inset-0 bg-slate-950/60" aria-hidden="true" />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={player.name}
                onClick={e => e.stopPropagation()}
                className="relative w-full max-h-[80%] overflow-y-auto bg-slate-950 border border-slate-700 rounded-lg shadow-2xl px-3 pt-3"
            >
                {/* 헤더 */}
                <div className="mb-2 pb-2 border-b border-slate-800 flex gap-2">
                    <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                        <div className="text-sm leading-[18px] font-bold text-white truncate">{player.name}</div>
                        {drafted && teamInfo && (
                            <div className="flex items-center gap-1.5 text-xs leading-4 min-w-0">
                                <TeamLogo teamId={drafted.teamId} size="custom" className="w-4 h-4 shrink-0" shadow={false} />
                                <span className="font-semibold text-slate-300 truncate">{teamInfo.name}</span>
                                <span className="text-slate-600">·</span>
                                <span className="text-slate-400 whitespace-nowrap tabular-nums">{drafted.round}라운드 #{drafted.pickNumber}픽</span>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs leading-4 text-slate-400 tabular-nums">
                            <span>{player.position}</span>
                            <span aria-hidden="true" className="w-px h-2.5 bg-slate-700" /><span>{player.age}세</span>
                            <span aria-hidden="true" className="w-px h-2.5 bg-slate-700" /><span>{player.height}cm</span>
                            <span aria-hidden="true" className="w-px h-2.5 bg-slate-700" /><span>{player.weight}kg</span>
                        </div>
                        {archetype && (
                            <div className="text-xs leading-4 font-semibold text-emerald-400 truncate">
                                {getArchetypeDisplayInfo(archetype.primary).label}
                                {archetype.secondary && <><span className="text-emerald-400/60"> / </span>{getArchetypeDisplayInfo(archetype.secondary).label}</>}
                            </div>
                        )}
                        {archetype && archetype.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                                {archetype.tags.slice(0, 4).map(tag => (
                                    <span key={tag} className="inline-flex items-center h-5 px-2 rounded-full bg-slate-900 border border-slate-800 text-[11px] leading-none font-semibold text-slate-400 whitespace-nowrap">
                                        {getTraitTagDisplayInfo(tag).label}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <button type="button" onClick={onClose} aria-label="닫기" className="-mt-2 -mr-3 w-11 h-11 shrink-0 self-start flex items-center justify-center text-slate-400 active:text-white">
                        <X size={16} />
                    </button>
                </div>

                {/* 능력치 3열 */}
                <div className="grid grid-cols-3 gap-x-2 mb-2">
                    {RATING_COLUMNS.map((col, ci) => (
                        <div key={ci} className="flex flex-col gap-0.5 min-w-0">
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

                {/* 스카우팅 리포트 아코디언 */}
                {report.length > 0 && (
                    <>
                        <button
                            type="button"
                            onClick={() => setReportOpen(o => !o)}
                            aria-expanded={reportOpen}
                            className="w-full h-11 -mx-3 px-3 box-content border-t border-slate-800 flex items-center justify-between text-[13px] font-bold text-slate-200"
                        >
                            스카우팅 리포트
                            <ChevronDown size={16} className={`text-slate-400 transition-transform ${reportOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {reportOpen && (
                            <div className={`flex flex-col gap-1 ${drafted ? 'pb-4' : 'pb-3'}`}>
                                {report.map((s, i) => (
                                    <div key={i} className={`text-xs leading-4 ${s.sentiment === 'positive' ? 'text-emerald-400' : s.sentiment === 'negative' ? 'text-rose-400' : 'text-white'}`}>
                                        {s.sentiment === 'positive' ? '+ ' : s.sentiment === 'negative' ? '- ' : ''}{s.text}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* 버튼 섹션 — 지명된 선수는 없음 */}
                {!drafted ? (
                    <div className="sticky bottom-0 -mx-3 px-3 py-3 bg-slate-950 border-t border-slate-800 flex gap-2">
                        {showQueue && onToggleQueue && (
                            <Button variant="primary" size="xl" shape="lg" fullWidth className="!h-12 !text-[15px]" onClick={() => onToggleQueue(player)}>
                                {queued ? '큐 삭제' : '큐 추가'}
                            </Button>
                        )}
                        <Button
                            variant="success"
                            size="xl"
                            shape="lg"
                            fullWidth
                            className="!h-12 !text-[15px] font-bold"
                            disabled={!canDraft || !onDraft}
                            style={canDraft ? { boxShadow: '0 0 12px rgba(16,185,129,0.5)' } : undefined}
                            onClick={() => onDraft?.(player)}
                        >
                            드래프트
                        </Button>
                    </div>
                ) : <div className="h-1" />}
            </div>
        </div>,
        document.body,
    );
};
